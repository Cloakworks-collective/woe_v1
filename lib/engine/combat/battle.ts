// Battle resolution for raid, castle attack and revenge (spec/combat.md).
// Bombard is its own thing — see bombard.ts.
//
// ROUND SHAPE
//   0 counter duel   counters and engines shoot each other to pieces
//   1 walls          rams grind masonry, trebuchets throw, engines answer
//   2 archers        spread fire; attackers shoot badly at an intact parapet
//   3 cavalry        aimed: cavalry → footmen → archers
//   4 footmen        aimed: footmen → archers → cavalry; ram crews join a breach
//   5 sortie         the defender rides out, if they chose to
//
// A RAID is phases 2–4 only: no walls, no engines, and no engineers on the
// field at all. Castle attacks and revenge run the lot.
//
// Pure — RNG injected, no clock, no I/O.

import {
  MAX_ROUNDS,
  BREAK_THRESHOLD,
  LUCK_SWING,
  RAM_CREW,
  SIEGE_GEAR,
  SIEGE_GEAR_LOSS_ON_DEFEAT,
  SORTIE,
  STAMINA,
  WALL_BREACH_PIVOT,
  XP,
  YIELD,
  MERCENARIES,
} from "../../constants";
import type { CounterType } from "../../constants/buildings";
import { luck, rollBand, rollCount, type Rng } from "../rng";
import {
  civilians,
  emptySiegeGear,
  level,
  troopTotal,
  type AttackMode,
  type BattleLogEntry,
  type BattleReport,
  type Player,
  type SiegeGearType,
  type Tier,
  type UnitLosses,
} from "../types";
import {
  aimDamage,
  buildSide,
  decayExperience,
  effectiveness,
  fieldPower,
  headcount,
  killEngineers,
  lineRegulars,
  regularsLost,
  settleMercenaries,
  setWallEdge,
  siegeBonusPool,
  siegeDelivery,
  spreadDamage,
  staminaDelivery,
  totalHealth,
  totalPower,
  type Arm,
  type Side,
} from "./model";
import {
  batteryThreatens,
  batteryStrength,
  crewGear,
  defenderCrews,
  makePark,
  parkStrength,
  rollDefenderEdge,
  runDuelRound,
  type Park,
} from "./duel";
import { archerWallDelivery, blendWallEdge, damageToIntegrity, wallHealth } from "./walls";
import { displaceCivilians, lootKind, lootShare, plunderGold, plunderResource, unbankedGold, unstored } from "./loot";

export interface BattleOptions {
  rng: Rng;
  warBonus?: boolean;
  battleId: string;
  tick: number;
}

export interface BattleOutcome {
  attacker: Player;
  defender: Player;
  report: BattleReport;
}

// ── Ram crews ───────────────────────────────────────────────────────────────

interface RamCrew {
  committed: Partial<Record<Arm, Record<Tier, number>>>;
  total: number;
  /** Weighted by who is pushing — footmen do it best, archers barely at all. */
  effectiveness: number;
}

/**
 * Twenty pairs of hands per ram, drawn footmen first, then cavalry, then
 * archers. They are NOT in the battle line — pushing a ram against a gate is
 * not the same job as holding a shield wall — and boiling oil can scald them
 * where they stand. Once the wall is breached they drop the beams and join the
 * assault.
 */
function assignRamCrew(p: Player, rams: number): RamCrew {
  const need = rams * RAM_CREW.TROOPS_PER_RAM;
  const committed: Partial<Record<Arm, Record<Tier, number>>> = {};
  let left = need;
  let weighted = 0;
  let total = 0;

  const SRC = { footman: "footmen", archer: "archers", cavalry: "cavalry" } as const;
  for (const arm of RAM_CREW.PRIORITY) {
    if (left <= 0) break;
    const block: Record<Tier, number> = { light: 0, medium: 0, heavy: 0 };
    for (const tier of ["light", "medium", "heavy"] as const) {
      if (left <= 0) break;
      const take = Math.min(p.army[SRC[arm]][tier], left);
      block[tier] = take;
      left -= take;
      total += take;
      weighted += take * RAM_CREW.EFFECTIVENESS[arm];
    }
    committed[arm] = block;
  }
  return { committed, total, effectiveness: total > 0 ? weighted / total : 1 };
}

// ── Resolution ──────────────────────────────────────────────────────────────

export function resolveBattle(
  attackerIn: Player,
  defenderIn: Player,
  mode: Exclude<AttackMode, "bombard">,
  opts: BattleOptions,
): BattleOutcome {
  const attacker = structuredClone(attackerIn);
  const defender = structuredClone(defenderIn);
  const rng = opts.rng;
  const war = !!opts.warBonus;
  const walls = mode !== "raid";
  const hasWall = walls && level(defender, "walls") > 0;
  const log: BattleLogEntry[] = [];
  const say = (
    round: number,
    phase: BattleLogEntry["phase"],
    text: string,
    extra: Partial<BattleLogEntry> = {},
  ) => log.push({ round, phase, text, ...extra });

  // ── Crews and engine parks ────────────────────────────────────────────────
  const atkEngineers = walls ? attacker.army.siegeEngineers + attacker.army.mercenaries.engineers : 0;
  const defEngineers = walls ? defender.army.siegeEngineers + defender.army.mercenaries.engineers : 0;
  const atkCrewed = walls ? crewGear(attacker.army.siegeGear, atkEngineers) : emptySiegeGear();
  const defCrew = walls
    ? defenderCrews(defender, defEngineers)
    : { counters: crewCountersEmpty(), offensive: emptySiegeGear() };

  const atkPark = makePark<SiegeGearType>(atkCrewed, attacker.army.siegeGearIntegrity);
  const defPark = makePark<CounterType>(defCrew.counters, defender.army.siegeCounterIntegrity);
  const defOffPark = makePark<SiegeGearType>(defCrew.offensive, defender.army.siegeGearIntegrity);
  const defenderEdge = walls ? rollDefenderEdge(rng) : 0;

  // Ram crews are committed before a shot is fired.
  const ramCrew = walls ? assignRamCrew(attacker, atkCrewed.rams) : { committed: {}, total: 0, effectiveness: 1 };

  // ── Sides ─────────────────────────────────────────────────────────────────
  const atk = buildSide(attacker, {
    home: false,
    wallEdge: 0,
    war,
    engineersPresent: walls,
    ramCrew: ramCrew.committed,
  });
  const def = buildSide(defender, { home: true, wallEdge: 0, war, engineersPresent: walls });

  let wallIntegrity = hasWall ? defender.wallIntegrity : 0;
  const wallHp = hasWall ? wallHealth(defender) : 0;
  let wallDamage = 0;

  const refreshWall = () => {
    if (!hasWall) return { blendedEdge: 0, grappled: 0, laddered: 0, towered: 0, unaided: 0 };
    const troops = headcount(atk);
    const esc = blendWallEdge(defender, troops, atkPark.crewed);
    // A wall that has been battered shelters proportionally less.
    setWallEdge(def, esc.blendedEdge * wallIntegrity);
    return esc;
  };
  let escalade = refreshWall();

  // ── Battlefield yield ─────────────────────────────────────────────────────
  // A defender who plainly cannot make a fight of it lays down arms. Revenge
  // offers no such mercy — it is the one attack that always draws blood, and
  // therefore the only answer to a player who turtles behind repeated yields.
  const outmatched = totalHealth(def) < YIELD.STRENGTH_RATIO * totalPower(atk);
  const beatenDown = defender.army.stamina < STAMINA.MERCY_FLOOR;
  const yielded = mode !== "revenge" && (outmatched || beatenDown);

  let victor: "attacker" | "defender" = "defender";
  let rounds = 0;
  let aDealt = 0;
  let dDealt = 0;
  const atkToughness = totalHealth(atk);
  const defToughness = totalHealth(def);
  let sortied = false;
  let ramCrewJoined = false;

  if (yielded) {
    victor = "attacker";
    say(0, "prelude",
      beatenDown
        ? `${defender.name}'s army is spent — stamina ${defender.army.stamina}/${STAMINA.MAX}. They lay down arms rather than be cut apart.`
        : `${defender.name} weighs the odds and lays down arms. The host is far too strong to face.`,
      { tone: "neutral" });
    let fell = 0;
    for (const g of def.groups) {
      if (!g.isMerc || g.count === 0) continue;
      const n = Math.floor(g.count * YIELD.MERC_LOSS_FRACTION);
      aDealt += n * g.health;
      g.count -= n;
      def.losses.mercenaries += n;
      fell += n;
    }
    say(0, "prelude",
      fell > 0
        ? `The sellswords cover the retreat — ${fell} cut down. Not one of the levy falls.`
        : "Not a blow is struck. The levy is spared.",
      { defenderRegulars: 0, tone: "neutral" });
  }

  // ── Rounds ────────────────────────────────────────────────────────────────
  for (let round = 1; round <= MAX_ROUNDS && !yielded; round++) {
    rounds = round;
    const aLuck = luck(rng, LUCK_SWING);
    const dLuck = luck(rng, LUCK_SWING);
    const beforeA = { ...atk.losses };
    const beforeD = { ...def.losses };

    // Phase 0 — the engine duel.
    if (walls) {
      const duel = runDuelRound({ attacker, defender, atkPark, defPark, war, rng, defenderEdge });
      if (duel.attackerEngineerKills > 0) killEngineers(atk, duel.attackerEngineerKills);
      for (const note of duel.notes) say(round, "counter-duel", note, { tone: "neutral" });

      // Boiling oil scalds the men at the gate, not just the beams.
      const oil = defPark.crewed.boiling_oil;
      if (oil > 0 && ramCrew.total > 0 && !ramCrewJoined) {
        const scalded = rollCount(rng, ramCrew.total, Math.min(0.3, 0.05 * oil));
        if (scalded > 0) {
          // Take them out of the committed crew, not just off the tally —
          // otherwise applyLosses hands them back at the end and the report
          // claims deaths the attacker never actually paid for.
          burnRamCrew(atk, ramCrew, scalded);
          say(round, "counter-duel", `Boiling oil comes over the parapet — ${scalded} of our ram crew are scalded from the beams.`, {
            attackerRegulars: scalded,
            tone: "bad",
          });
        }
      }
      escalade = refreshWall();
    }

    // Phase 1 — the walls.
    if (walls) {
      const atkSiege = siegeBonusPool(attacker, war);
      if (hasWall && wallIntegrity > 0) {
        const ramDmg =
          atkPark.crewed.rams * SIEGE_GEAR.rams.power * atkPark.integrity.rams *
          effectiveness("rams", "walls") * ramCrew.effectiveness * atkSiege * aLuck;
        const trebDmg =
          atkPark.crewed.trebuchets * SIEGE_GEAR.trebuchets.power * atkPark.integrity.trebuchets *
          siegeDelivery(attacker, "walls") * atkSiege * aLuck;
        const applied = Math.min(wallIntegrity * wallHp, ramDmg + trebDmg);
        if (applied > 0) {
          wallDamage += applied;
          wallIntegrity = Math.max(0, wallIntegrity - damageToIntegrity(defender, applied));
          say(round, "walls",
            `The engines work the wall — ${Math.round(applied).toLocaleString("en-US")} damage, ${Math.round(wallIntegrity * 100)}% left standing.`,
            { tone: "neutral" });
        }
        escalade = refreshWall();
      }

      // Engines that hurt men rather than masonry.
      const troopFire =
        (atkPark.crewed.ballistae * SIEGE_GEAR.ballistae.power * atkPark.integrity.ballistae *
          effectiveness("ballistae", "troops") +
          atkPark.crewed.trebuchets * SIEGE_GEAR.trebuchets.power * atkPark.integrity.trebuchets *
            effectiveness("trebuchets", "troops")) *
        atkSiege * aLuck;
      if (troopFire > 0) {
        aDealt += troopFire;
        spreadDamage(def, troopFire);
      }

      // The defender's spare engineers work their own engines and shoot back.
      const defSiege = siegeBonusPool(defender, war);
      const answer =
        (defOffPark.crewed.ballistae * SIEGE_GEAR.ballistae.power * effectiveness("ballistae", "troops") +
          defOffPark.crewed.trebuchets * SIEGE_GEAR.trebuchets.power * effectiveness("trebuchets", "troops")) *
        defSiege * dLuck;
      if (answer > 0) {
        dDealt += answer;
        spreadDamage(atk, answer);
        say(round, "walls", `Their engines answer from the towers.`, { tone: "bad" });
      }
    }

    // Phase 2 — archers. Attackers shoot badly at an intact parapet.
    const archerGate = archerWallDelivery(wallIntegrity, hasWall);
    const aArrow = armPower(atk, "archer") * aLuck * archerGate;
    const dArrow = armPower(def, "archer") * dLuck;
    aDealt += aArrow;
    dDealt += dArrow;
    spreadDamage(def, aArrow);
    spreadDamage(atk, dArrow);

    // Phase 3 — cavalry. Engineers are never a target for a charge.
    const aCav = armPower(atk, "cavalry") * aLuck;
    const dCav = armPower(def, "cavalry") * dLuck;
    aDealt += aCav;
    dDealt += dCav;
    aimDamage(def, aCav, ["cavalry", "footman", "archer"]);
    aimDamage(atk, dCav, ["cavalry", "footman", "archer"]);

    // Phase 4 — the lines meet. Ram crews drop the beams at a breach.
    if (walls && !ramCrewJoined && ramCrew.total > 0 && wallIntegrity <= WALL_BREACH_PIVOT) {
      ramCrewJoined = true;
      returnRamCrew(atk, ramCrew);
      say(round, "footmen", `The gate is broken — the ram crews take up their arms and join the assault.`, {
        tone: "good",
      });
    }
    const aFoot = armPower(atk, "footman") * aLuck;
    const dFoot = armPower(def, "footman") * dLuck;
    aDealt += aFoot;
    dDealt += dFoot;
    aimDamage(def, aFoot, ["footman", "archer", "cavalry"]);
    aimDamage(atk, dFoot, ["footman", "archer", "cavalry"]);

    // Phase 5 — the sortie.
    if (walls && defender.army.sortieEnabled && !sortied) {
      const screen = fieldPower(atk);
      const riders = fieldPower(def);
      if (riders >= SORTIE.TRIGGER_RATIO * screen) {
        sortied = true;
        // The screen holds off a multiple of its own weight, dug in around the
        // siege lines. Only the surplus reaches the engineers and the engines.
        const capacity = screen * SORTIE.SCREEN_ABSORB * (1 + SORTIE.ENTRENCHED_BONUS);
        const surplus = Math.max(0, riders - capacity);
        if (surplus > 0) {
          const killed = killSiege(atkPark, surplus);
          const crewLost = Math.min(atk.engineers + atk.mercEngineers, Math.floor(surplus / 200));
          killEngineers(atk, crewLost);
          say(round, "sortie",
            `The gates swing open — their cavalry ride out at our siege lines. ${killed} engines are fired and ${crewLost} engineers cut down.`,
            { attackerRegulars: crewLost, tone: "bad" });
        } else {
          say(round, "sortie", `Their cavalry sally out and our screen turns them back at the ditch.`, {
            tone: "good",
          });
        }
      }
    }

    // Round summary — regulars first, because regulars are what matter.
    const aReg = regularsLost(atk.losses) - regularsLost(beforeA as never);
    const dReg = regularsLost(def.losses) - regularsLost(beforeD as never);
    const aStr = totalPower(atk);
    const dStr = totalPower(def);
    say(round, "aftermath",
      `Round ${round}: our host at ${pct(aStr, atk.startPower)}%, theirs at ${pct(dStr, def.startPower)}%.`,
      { attackerRegulars: aReg, defenderRegulars: dReg, tone: dReg > aReg ? "good" : "bad" });

    if (aStr < BREAK_THRESHOLD * atk.startPower) {
      victor = "defender";
      say(round, "aftermath", "The host breaks and streams away from the field.", { tone: "bad" });
      break;
    }
    if (dStr < BREAK_THRESHOLD * def.startPower || headcount(def) === 0) {
      victor = "attacker";
      say(round, "aftermath", "The defenders break — the day is ours.", { tone: "good" });
      break;
    }
  }

  // ── Aftermath ─────────────────────────────────────────────────────────────
  applyLosses(attacker, atk, ramCrew, ramCrewJoined);
  applyLosses(defender, def, null, false);
  if (hasWall) defender.wallIntegrity = Math.max(0, wallIntegrity);

  // Engines: what the duel wrecked, plus what a failed assault leaves behind.
  const gearLost: Partial<Record<SiegeGearType, number>> = { ...atkPark.destroyed };
  writeBackPark(attacker.army.siegeGear, attacker.army.siegeGearIntegrity, atkPark);
  writeBackPark(defender.army.siegeCounters, defender.army.siegeCounterIntegrity, defPark);
  if (victor === "defender" && walls) {
    for (const t of Object.keys(attacker.army.siegeGear) as SiegeGearType[]) {
      const lost = Math.floor(attacker.army.siegeGear[t] * SIEGE_GEAR_LOSS_ON_DEFEAT);
      attacker.army.siegeGear[t] -= lost;
      if (lost > 0) gearLost[t] = (gearLost[t] ?? 0) + lost;
    }
  }

  // Stamina scales with damage DEALT — swinging hard tires an army, standing
  // in a shield wall absorbing blows does not.
  const drain = (dealt: number, toughness: number, max: number) =>
    toughness <= 0 ? 0 : Math.round(Math.min(max, max * (dealt / toughness)));
  const aDrain = drain(aDealt, defToughness, STAMINA.MAX_DRAIN_ATTACKER);
  const dDrain = drain(dDealt, atkToughness, STAMINA.MAX_DRAIN_DEFENDER);
  attacker.army.stamina = Math.max(0, attacker.army.stamina - aDrain);
  defender.army.stamina = Math.max(0, defender.army.stamina - dDrain);

  // Civilians flee a sacked town — separate from, and compounding with, the
  // peasant scattering that follows at dawn if the garrison is now too thin.
  let displaced = 0;
  if (victor === "attacker") displaced = displaceCivilians(rng, defender, mode, yielded);

  // Loot. Raids take goods; castle attacks take gold; revenge takes nothing.
  // War does not change WHAT is taken, only how much — the share goes to 100%
  // of whatever was left outside the vault.
  const loot: BattleReport["loot"] = { gold: 0, resources: { food: 0, wood: 0, stone: 0, ore: 0 } };
  const kind = victor === "attacker" ? lootKind(mode) : "none";
  if (kind !== "none") {
    const share = lootShare(rng, mode, yielded, atk.startPower, def.startPower, war);
    if (kind === "goods") {
      for (const r of ["food", "wood", "stone", "ore"] as const) {
        const take = Math.floor(unstored(defender, r) * share);
        plunderResource(defender, r, take);
        attacker.resources[r] += take;
        loot.resources[r] = take;
      }
    } else {
      const take = Math.floor(unbankedGold(defender) * share);
      plunderGold(defender, take);
      attacker.gold += take;
      loot.gold = take;
    }
  }

  // Experience — earned by what you ACHIEVED, not by who you picked. Farming a
  // minnow pays badly because there is nothing there to kill; no bully band
  // needed, the arithmetic does it.
  const aRegKilled = regularsLost(def.losses);
  const dRegKilled = regularsLost(atk.losses);
  const aXpBefore = attacker.army.experience;
  const dXpBefore = defender.army.experience;
  const aSiegeBefore = attacker.army.siegeExperience;
  const dSiegeBefore = defender.army.siegeExperience;

  const aGain = Math.min(
    XP.MAX_PER_BATTLE,
    aRegKilled * XP.PER_REGULAR_KILLED + displaced * XP.PER_CIVILIAN_DISPLACED,
  );
  const dGain = Math.min(XP.MAX_PER_BATTLE, dRegKilled * XP.PER_REGULAR_KILLED + XP.DEFENDER_GAIN);

  attacker.army.experience = clamp(
    decayExperience(attacker.army.experience, lineLosses(atk.losses), lineRegulars(attackerIn), XP.LOSS_ON_DEATH) + aGain,
  );
  defender.army.experience = clamp(
    decayExperience(defender.army.experience, lineLosses(def.losses), lineRegulars(defenderIn), XP.LOSS_ON_DEATH) + dGain,
  );
  if (walls) {
    attacker.army.siegeExperience = clamp(
      decayExperience(attacker.army.siegeExperience, atk.losses.engineers, attackerIn.army.siegeEngineers, XP.LOSS_ON_DEATH) + aGain,
    );
    defender.army.siegeExperience = clamp(
      decayExperience(defender.army.siegeExperience, def.losses.engineers, defenderIn.army.siegeEngineers, XP.LOSS_ON_DEATH) + dGain,
    );
  }

  // The cascade: sellswords serve under the regulars of their own arm, and the
  // ones who no longer have anybody to serve under are paid off and ride away.
  // Kill three regulars, cost them four soldiers.
  if (MERCENARIES.DISBAND_ON_REGULAR_LOSS) {
    atk.losses.mercenariesDisbanded = settleMercenaries(attacker);
    def.losses.mercenariesDisbanded = settleMercenaries(defender);
  }

  if (victor === "attacker") {
    attacker.battlesWon += 1;
    defender.battlesLost += 1;
  } else {
    attacker.battlesLost += 1;
    defender.battlesWon += 1;
  }

  const report: BattleReport = {
    id: opts.battleId,
    tick: opts.tick,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    mode,
    rounds,
    victor,
    yielded,
    attackerLosses: toUnitLosses(atk.losses),
    defenderLosses: toUnitLosses(def.losses),
    regularsKilled: { attacker: aRegKilled, defender: dRegKilled },
    civiliansDisplaced: displaced,
    wallIntegrityDamage: wallHp > 0 ? wallDamage / wallHp : 0,
    siegeGearLost: gearLost,
    siegeCountersLost: defPark.destroyed,
    siegeGearWorn: atkPark.worn,
    siegeCountersWorn: defPark.worn,
    sortied,
    escalade: hasWall
      ? { grappled: escalade.grappled, laddered: escalade.laddered, towered: escalade.towered }
      : undefined,
    loot,
    staminaLoss: { attacker: aDrain, defender: dDrain },
    experienceChange: {
      attacker: Math.round(attacker.army.experience - aXpBefore),
      defender: Math.round(defender.army.experience - dXpBefore),
    },
    siegeExperienceChange: {
      attacker: Math.round(attacker.army.siegeExperience - aSiegeBefore),
      defender: Math.round(defender.army.siegeExperience - dSiegeBefore),
    },
    log,
  };

  return { attacker, defender, report };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const clamp = (x: number) => Math.max(0, Math.min(XP.MAX, x));
const pct = (n: number, of: number) => Math.round((n / Math.max(1, of)) * 100);

const armPower = (s: Side, arm: Arm): number =>
  s.groups.filter((g) => g.arm === arm).reduce((sum, g) => sum + g.count * g.power, 0);

const lineLosses = (l: { footmen: number; archers: number; cavalry: number }) =>
  l.footmen + l.archers + l.cavalry;

function toUnitLosses(l: Side["losses"]): UnitLosses {
  return {
    footmen: l.footmen,
    archers: l.archers,
    cavalry: l.cavalry,
    engineers: l.engineers,
    mercenaries: l.mercenaries,
    mercenariesDisbanded: l.mercenariesDisbanded,
  };
}

function crewCountersEmpty(): Record<CounterType, number> {
  return { billhooks: 0, forkpoles: 0, fire_pots: 0, boiling_oil: 0, hoardings: 0, counter_engine: 0 };
}

/** Boiling oil kills men on the beams. They are counted where they stand — in
 *  the committed crew — so they cannot be restored to the army afterwards. The
 *  cheapest ranks go first, as everywhere else. */
function burnRamCrew(side: Side, crew: RamCrew, n: number) {
  let left = n;
  for (const arm of RAM_CREW.PRIORITY) {
    const block = crew.committed[arm];
    if (!block) continue;
    for (const tier of ["light", "medium", "heavy"] as const) {
      if (left <= 0) break;
      const take = Math.min(block[tier], left);
      block[tier] -= take;
      left -= take;
      crew.total = Math.max(0, crew.total - take);
      side.losses[arm === "footman" ? "footmen" : arm === "cavalry" ? "cavalry" : "archers"] += take;
    }
    if (left <= 0) break;
  }
}

/** Ram crews rejoin the line at a breach, fighting as the arm they always were. */
function returnRamCrew(side: Side, crew: RamCrew) {
  for (const [arm, tiers] of Object.entries(crew.committed) as [Arm, Record<Tier, number>][]) {
    for (const tier of ["light", "medium", "heavy"] as const) {
      const n = tiers[tier];
      if (n <= 0) continue;
      const g = side.groups.find((x) => x.arm === arm && x.tier === tier && !x.isMerc);
      if (g) g.count += n;
    }
  }
  crew.committed = {};
}

/** A sortie that gets past the screen fires whatever it reaches. */
function killSiege(park: Park<SiegeGearType>, surplus: number): number {
  let budget = surplus;
  let killed = 0;
  for (const t of ["trebuchets", "ballistae", "siege_towers", "rams"] as SiegeGearType[]) {
    while (park.crewed[t] > 0 && budget >= SIEGE_GEAR[t].health) {
      park.crewed[t] -= 1;
      park.destroyed[t] = ((park.destroyed[t] as number) ?? 0) + 1;
      budget -= SIEGE_GEAR[t].health;
      killed += 1;
    }
  }
  return killed;
}

function writeBackPark<T extends string>(
  counts: Record<T, number>,
  integrity: Record<T, number>,
  park: Park<T>,
) {
  for (const t of Object.keys(park.destroyed) as T[]) {
    counts[t] = Math.max(0, counts[t] - (park.destroyed[t] ?? 0));
  }
  for (const t of Object.keys(park.integrity) as T[]) {
    integrity[t] = Math.max(0, Math.min(1, park.integrity[t]));
  }
}

/** Write surviving counts back onto the player. Ram crews that never rejoined
 *  come home with the army. */
function applyLosses(p: Player, s: Side, crew: RamCrew | null, joined: boolean) {
  const SRC = { footman: "footmen", archer: "archers", cavalry: "cavalry" } as const;
  for (const arm of ["footman", "archer", "cavalry"] as const) {
    for (const tier of ["light", "medium", "heavy"] as const) {
      const reg = s.groups.find((g) => g.arm === arm && g.tier === tier && !g.isMerc);
      const merc = s.groups.find((g) => g.arm === arm && g.tier === tier && g.isMerc);
      const held = !joined && crew ? (crew.committed[arm]?.[tier] ?? 0) : 0;
      p.army[SRC[arm]][tier] = (reg?.count ?? 0) + held;
      p.army.mercenaries[SRC[arm]][tier] = merc?.count ?? 0;
    }
  }
  p.army.siegeEngineers = s.engineers;
  p.army.mercenaries.engineers = s.mercEngineers;
}

export { assignRamCrew };
