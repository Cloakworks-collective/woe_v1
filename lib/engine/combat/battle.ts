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
  COMBAT_TEMPO,
  COUNTER_DUEL,
  EXPERIENCE,
  LUCK_SWING,
  RAM_CREW,
  SALVAGE,
  SIEGE_STANCE,
  SIEGE_GEAR,
  SIEGE_GEAR_LOSS_ON_DEFEAT,
  SORTIE,
  STAMINA,
  WALL_BREACH_PIVOT,
  YIELD,
  MERCENARIES,
} from "../../constants";
import type { CounterType } from "../../constants/buildings";
import { luck, rollBand, rollCount, type Rng } from "../rng";
import {
  civilians,
  emptySiegeGear,
  level,
  researchLevel,
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
  fieldHospital,
  fieldPower,
  headcount,
  healthLostShare,
  killEngineers,
  lineRegulars,
  muster,
  regularsLost,
  settleMercenaries,
  setWallEdge,
  siegeBonusPool,
  siegeDelivery,
  siegeLedger,
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
  counterSilenced,
  rollDefenderEdge,
  runDuelRound,
  type Park,
} from "./duel";
import { rankingScore } from "../score";
import { archerWallDelivery, blendWallEdge, damageToIntegrity, wallHealth } from "./walls";
import { displaceCivilians, fallenValue, lootKind, lootShare, plunderGold, plunderResource, unbankedGold, unstored } from "./loot";

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

/** Who is on the beams, split by whether you raised them or bought them —
 *  because boiling oil kills the hired first, like everything else does. */
export interface RamCrewBlock {
  merc: Record<Tier, number>;
  regular: Record<Tier, number>;
}

interface RamCrew {
  committed: Partial<Record<Arm, RamCrewBlock>>;
  total: number;
  /** Weighted by who is pushing — footmen do it best, archers barely at all. */
  effectiveness: number;
}

const emptyBlock = (): RamCrewBlock => ({
  merc: { light: 0, medium: 0, heavy: 0 },
  regular: { light: 0, medium: 0, heavy: 0 },
});

/**
 * Twenty pairs of hands per ram, drawn footmen first, then cavalry, then
 * archers — and SELLSWORDS BEFORE YOUR OWN at every rank. They are NOT in the
 * battle line (pushing a ram against a gate is not holding a shield wall), and
 * boiling oil scalds them where they stand. Once the wall is breached they drop
 * the beams and join the assault.
 *
 * The hired go on the beams first because they go first everywhere: it is the
 * one invariant the casualty model never breaks. Before this, ram crews were
 * drawn from regulars ONLY, so the single counter in the game that kills people
 * rather than machines could only ever kill your own.
 */
function assignRamCrew(p: Player, rams: number): RamCrew {
  const need = rams * RAM_CREW.TROOPS_PER_RAM;
  const committed: Partial<Record<Arm, RamCrewBlock>> = {};
  let left = need;
  let weighted = 0;
  let total = 0;

  const SRC = { footman: "footmen", archer: "archers", cavalry: "cavalry" } as const;
  for (const arm of RAM_CREW.PRIORITY) {
    if (left <= 0) break;
    const block = emptyBlock();
    for (const pool of ["merc", "regular"] as const) {
      for (const tier of ["light", "medium", "heavy"] as const) {
        if (left <= 0) break;
        const have = pool === "merc" ? p.army.mercenaries[SRC[arm]][tier] : p.army[SRC[arm]][tier];
        const take = Math.min(have, left);
        block[pool][tier] = take;
        left -= take;
        total += take;
        weighted += take * RAM_CREW.EFFECTIVENESS[arm];
      }
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
    const esc = blendWallEdge(defender, troops, atkPark.crewed, atkPark.integrity);
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
  /** Share of the health each side marched in with that it gave up. The whole
   *  verdict is a comparison of these two numbers — see the note where they are
   *  computed. Zero on a yield: nobody fought. */
  let lostShare = { attacker: 0, defender: 0 };
  let rounds = 0;
  let aDealt = 0;
  let dDealt = 0;
  const atkToughness = totalHealth(atk);
  const defToughness = totalHealth(def);
  // What each side brought, priced as it stood at the muster — the two numbers
  // the whole battle is judged on. See `muster` in model.ts for why the closing
  // price will not do.
  const atkMuster = muster(atk);
  const defMuster = muster(def);
  let sortied = false;
  let ramCrewJoined = false;

  // ── The siege stance ──────────────────────────────────────────────────────
  // The same standing order that governs a bombard, because it is the same
  // question: a trebuchet can only throw its stone at one thing. General splits
  // between their battery and the wall; counter-first lays everything on the
  // battery and wastes the remainder. With no battery to duel there is nothing
  // to allot and the whole barrage goes to the masonry.
  const stance = attacker.army.siegeStance ?? "general";
  const battery = walls && defPark.crewed.counter_engine > 0 && !counterSilenced(defPark, "counter_engine");
  const focused = stance === "counter" && battery;
  const counterShare = !battery
    ? 0
    : focused
      ? Math.min(1, siegeDelivery(attacker, "siege") * (1 + SIEGE_STANCE.COUNTER_FOCUS_BONUS))
      : siegeDelivery(attacker, "siege");
  const structureShare = focused ? 0 : 1 - counterShare;

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
      // Recorded for the field hospital like any other death. This path writes
      // the group directly rather than going through `kill`, so it has to book
      // the fallen itself — miss it and MEDICINE would silently do nothing on a
      // yield, which is precisely the fight where the surgeons matter most:
      // these are the men who covered the retreat.
      const byArm = (def.mercFallen.line[g.arm] ??= { light: 0, medium: 0, heavy: 0 });
      byArm[g.tier] += n;
      fell += n;
    }
    say(0, "prelude",
      fell > 0
        ? `The sellswords cover the retreat — ${fell} cut down. Not one of the levy falls.`
        : "Not a blow is struck. The levy is spared.",
      { defenderRegulars: 0, tone: "neutral" });
  }

  // ── The exchange ──────────────────────────────────────────────────────────
  // ONE pass down the order of battle. Not "round one" — the whole battle.
  //
  // A battle used to run up to ten rounds and end when somebody broke, which
  // made a single attack a decisive engagement. It isn't one. An empire draws
  // 288 action turns a day and an attack costs ten, so a serious aggressor
  // throws twenty-odd strikes at the same target — the campaign is the unit of
  // war, and a strike is one exchange inside it. Everything that used to be
  // decided by grinding through rounds is now decided by coming back tomorrow.
  if (!yielded) {
    const round = 1;
    rounds = 1;
    const aLuck = luck(rng, LUCK_SWING);
    const dLuck = luck(rng, LUCK_SWING);
    const beforeA = { ...atk.losses };
    const beforeD = { ...def.losses };

    // Phase 0 — the engine duel.
    if (walls) {
      const duel = runDuelRound({ attacker, defender, atkPark, defPark, war, rng, defenderEdge, returnShare: counterShare });
      if (duel.attackerEngineerKills > 0) killEngineers(atk, duel.attackerEngineerKills);
      for (const note of duel.notes) say(round, "counter-duel", note, { tone: "neutral" });

      // Boiling oil scalds the men at the gate, not just the beams.
      const oil = defPark.crewed.boiling_oil;
      if (oil > 0 && ramCrew.total > 0 && !ramCrewJoined) {
        const scalded = rollCount(rng, ramCrew.total,
          Math.min(COUNTER_DUEL.OIL_SCALD_CAP, COUNTER_DUEL.OIL_SCALD_PER_CAULDRON * oil));
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
          effectiveness("rams", "walls") * ramCrew.effectiveness * RAM_CREW.WALL_MULTIPLIER *
          atkSiege * aLuck;
        // Trebuchets spend their fire ONCE, here as in a bombard — the siege
        // stance decides how much went to the enemy battery and this is what is
        // left. They used to hit the counters, the wall and the garrison all at
        // once, which made artillery strictly better in an assault than in the
        // dedicated artillery attack.
        const trebDmg =
          atkPark.crewed.trebuchets * SIEGE_GEAR.trebuchets.power * atkPark.integrity.trebuchets *
          siegeDelivery(attacker, "walls") * structureShare * atkSiege * aLuck;
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
      // Ballistae, and only ballistae. One job each.
      const troopFire =
        atkPark.crewed.ballistae * SIEGE_GEAR.ballistae.power * atkPark.integrity.ballistae *
        effectiveness("ballistae", "troops") * atkSiege * aLuck * COMBAT_TEMPO;
      if (troopFire > 0) {
        aDealt += troopFire;
        spreadDamage(def, troopFire);
      }

      // The defender's spare engineers work their own engines and shoot back.
      const defSiege = siegeBonusPool(defender, war);
      const answer =
        defOffPark.crewed.ballistae * SIEGE_GEAR.ballistae.power *
        effectiveness("ballistae", "troops") * defSiege * dLuck * COMBAT_TEMPO;
      if (answer > 0) {
        dDealt += answer;
        spreadDamage(atk, answer);
        say(round, "walls", `Their engines answer from the towers.`, { tone: "bad" });
      }
    }

    /**
     * Tell what a phase just did.
     *
     * The three melee phases used to resolve in SILENCE: archers, cavalry and
     * the footman clash between them account for most of the dead in any
     * battle, and the log jumped from the wall straight to the aftermath. The
     * losses table gave you totals with no account of where they came from —
     * which arm broke, whether the charge landed, whether your archers were
     * shooting at a parapet. The whole point of a report is the telling.
     *
     * Reads the loss ledgers before and after, so it reports what ACTUALLY
     * happened rather than restating the damage numbers that went in.
     */
    const phaseReport = (
      phase: BattleLogEntry["phase"],
      openA: Side["losses"],
      openD: Side["losses"],
      say_: (aFell: number, dFell: number) => string | null,
    ) => {
      const aFell = totalCasualties(atk.losses) - totalCasualties(openA);
      const dFell = totalCasualties(def.losses) - totalCasualties(openD);
      const text = say_(aFell, dFell);
      if (!text) return;
      say(round, phase, text, {
        attackerRegulars: lineLosses(atk.losses) - lineLosses(openA),
        defenderRegulars: lineLosses(def.losses) - lineLosses(openD),
        tone: dFell > aFell ? "good" : aFell > dFell ? "bad" : "neutral",
      });
    };

    // Phase 2 — archers. Attackers shoot badly at an intact parapet.
    const archerGate = archerWallDelivery(wallIntegrity, hasWall);
    const aArrow = armPower(atk, "archer") * aLuck * archerGate;
    const dArrow = armPower(def, "archer") * dLuck;
    aDealt += aArrow;
    dDealt += dArrow;
    const preArrowA = { ...atk.losses };
    const preArrowD = { ...def.losses };
    spreadDamage(def, aArrow);
    spreadDamage(atk, dArrow);
    phaseReport("archers", preArrowA, preArrowD, (aFell, dFell) => {
      if (aFell + dFell === 0) return null;
      // Keyed on whether there IS a wall, not on the archer gate: that gate
      // reads 1 in every case now (the wall's edge does the work instead of a
      // separate accuracy tax), so testing it would have made this branch dead
      // and every siege would have read "across the open".
      const shooting = hasWall
        ? "Our bowmen loose at the parapet, and theirs shoot down from behind stone"
        : "The volleys go out across the open";
      return `${shooting} — ${dFell} of theirs fall to arrows, ${aFell} of ours.`;
    });

    // Phase 3 — cavalry. Engineers are never a target for a charge.
    const aCav = armPower(atk, "cavalry") * aLuck;
    const dCav = armPower(def, "cavalry") * dLuck;
    aDealt += aCav;
    dDealt += dCav;
    const preCavA = { ...atk.losses };
    const preCavD = { ...def.losses };
    aimDamage(def, aCav, ["cavalry", "footman", "archer"]);
    aimDamage(atk, dCav, ["cavalry", "footman", "archer"]);
    phaseReport("cavalry", preCavA, preCavD, (aFell, dFell) => {
      if (aFell + dFell === 0) return null;
      if (aCav <= 0 && dCav > 0) return `We field no horse — their riders come through us and ${aFell} fall.`;
      if (dCav <= 0 && aCav > 0) return `Our horse charge an enemy with none of their own — ${dFell} ridden down.`;
      return `The horse meet in the centre — ${dFell} of theirs go down, ${aFell} of ours.`;
    });

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
    const preFootA = { ...atk.losses };
    const preFootD = { ...def.losses };
    aimDamage(def, aFoot, ["footman", "archer", "cavalry"]);
    aimDamage(atk, dFoot, ["footman", "archer", "cavalry"]);
    phaseReport("footmen", preFootA, preFootD, (aFell, dFell) => {
      if (aFell + dFell === 0) return null;
      const where = hasWall && wallIntegrity > WALL_BREACH_PIVOT ? "at the foot of the wall" : "in the breach";
      return `${walls ? `The lines meet ${where}` : "The lines meet"} — ${dFell} of theirs cut down, ${aFell} of ours.`;
    });

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

    // ── Who held the field ──────────────────────────────────────────────────
    //
    // Whoever gave up less of what they brought. Both sides are measured as a
    // SHARE of their own muster, so a small host that trades well beats a big
    // one that trades badly, and neither side wins for merely being large.
    //
    // Worth knowing what this quietly is: A wins when
    //     lostShare(A) < lostShare(B)  ⟺  power(A)·health(A) > power(B)·health(B)
    // — power × health, the square law. Doubling an army doubles both terms and
    // so quadruples its worth, and a lopsided build (all archers, all footmen)
    // scores below a mixed one of the same cost. None of that is special-cased;
    // it falls out of measuring proportional loss.
    //
    // A tie goes to the DEFENDER, who is already standing on the ground.
    const aLostShare = healthLostShare(atk, atkMuster);
    const dLostShare = healthLostShare(def, defMuster);
    lostShare = { attacker: aLostShare, defender: dLostShare };
    const wiped = headcount(def) === 0;
    victor = wiped || dLostShare > aLostShare ? "attacker" : "defender";

    const aReg = regularsLost(atk.losses) - regularsLost(beforeA as never);
    const dReg = regularsLost(def.losses) - regularsLost(beforeD as never);
    say(round, "aftermath",
      `The lines draw apart. We gave up ${pct(aLostShare, 1)}% of the host we brought; they gave up ${pct(dLostShare, 1)}%.`,
      { attackerRegulars: aReg, defenderRegulars: dReg, tone: dReg > aReg ? "good" : "bad" });
    say(round, "aftermath",
      wiped
        ? "Nothing of theirs is left standing — the field is ours."
        : victor === "attacker"
          ? "They gave up more than we did. The field is ours."
          : "We gave up as much as they did or more. We withdraw and leave them the ground.",
      { tone: victor === "attacker" ? "good" : "bad" });
  }

  // ── Aftermath ─────────────────────────────────────────────────────────────
  applyLosses(attacker, atk, ramCrew, ramCrewJoined);
  applyLosses(defender, def, null, false);
  if (hasWall) defender.wallIntegrity = Math.max(0, wallIntegrity);

  // ── Stripping the dead ────────────────────────────────────────────────────
  //
  // Whoever holds the ground walks it afterwards and strips the fallen — the
  // enemy's and their own alike. Read HERE, immediately after the losses are
  // written back and deliberately before the mercenary cascade and the field
  // hospital: sellswords paid off for want of an officer rode away alive, and
  // ones the surgeons saved are alive too. Neither is lying there to be looted.
  //
  // This is not loot. It comes off bodies rather than out of storehouses, it is
  // not capped or size-scaled or halved on a surrender, and it does not care
  // which mode was fought — so a REVENGE, which carries nothing home by design,
  // still pays for the armour of the men it killed. See SALVAGE.
  const atkFell = fallenValue(attackerIn, attacker);
  const defFell = fallenValue(defenderIn, defender);
  const salvage = {
    gold: Math.floor((atkFell.gold + defFell.gold) * SALVAGE.GOLD_SHARE),
    ore: Math.floor((atkFell.ore + defFell.ore) * SALVAGE.ORE_SHARE),
  };
  const victorSide = victor === "attacker" ? attacker : defender;
  victorSide.gold += salvage.gold;
  victorSide.resources.ore += salvage.ore;
  if (salvage.gold > 0 || salvage.ore > 0) {
    say(rounds, "aftermath",
      `${victor === "attacker" ? "Our" : "Their"} people walk the field and strip the fallen — ${salvage.gold.toLocaleString("en-US")} gold and ${salvage.ore.toLocaleString("en-US")} ore off the dead of both sides.`,
      { tone: victor === "attacker" ? "good" : "bad" });
  }

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

  // ── Experience ────────────────────────────────────────────────────────────
  //
  // A ledger. Credited for the men you killed, debited for the men you lost,
  // both in absolute points. See the EXPERIENCE block in battleBalance.ts.
  //
  // A SURRENDER PAYS NOTHING, to either side. Nobody fought, so nobody learned
  // — and it closes the obvious farm, since a beaten target yields again and
  // again once their stamina is under the mercy floor.
  const aRegKilled = regularsLost(def.losses);
  const dRegKilled = regularsLost(atk.losses);
  const aXpBefore = attacker.army.experiencePoints;
  const dXpBefore = defender.army.experiencePoints;
  const aSiegeBefore = attacker.army.siegeExperiencePoints;
  const dSiegeBefore = defender.army.siegeExperiencePoints;

  if (!yielded) {
    const aScore = rankingScore(attackerIn);
    const dScore = rankingScore(defenderIn);
    // Each side reads the ladder from its OWN doorstep: how much bigger was the
    // other one? Punching up and repelling somebody bigger pay the same way,
    // and crushing a minnow costs you whichever end of it you were on.
    const aMatch = matchupMultiplier(dScore / Math.max(1, aScore), mode);
    const dMatch = matchupMultiplier(aScore / Math.max(1, dScore), mode);

    const aWon = victor === "attacker";
    // Casualties, not kills-of-regulars: sellswords count toward the base rate
    // for both sides. Only the ATTACKER is then paid a second time for the
    // regulars among them — if that bonus reached defenders, two players could
    // collude by marching an army into a friend's garrison to be slaughtered.
    const aInflicted = totalCasualties(def.losses);
    const dInflicted = totalCasualties(atk.losses);

    const aGross =
      (aInflicted * EXPERIENCE.PER_CASUALTY + aRegKilled * EXPERIENCE.ATTACKER_PER_REGULAR) *
      aMatch *
      (aWon ? EXPERIENCE.WON_ATTACK : EXPERIENCE.LOST) *
      luck(rng, EXPERIENCE.LUCK);
    const dGross =
      dInflicted *
      EXPERIENCE.PER_CASUALTY *
      dMatch *
      (aWon ? EXPERIENCE.LOST : EXPERIENCE.WON_DEFENCE) *
      luck(rng, EXPERIENCE.LUCK);

    // The cap bounds what a battle can PAY. The debit is outside it — there is
    // no ceiling on what carelessness costs, and a bully whose matchup went
    // negative should not be rescued by a cap meant for the other direction.
    const aNet = Math.min(EXPERIENCE.MAX_PER_BATTLE, aGross) - lineLosses(atk.losses) * EXPERIENCE.PER_REGULAR_LOST;
    const dNet = Math.min(EXPERIENCE.MAX_PER_BATTLE, dGross) - lineLosses(def.losses) * EXPERIENCE.PER_REGULAR_LOST;

    attacker.army.experiencePoints = Math.max(0, attacker.army.experiencePoints + Math.round(aNet));
    defender.army.experiencePoints = Math.max(0, defender.army.experiencePoints + Math.round(dNet));

    // The ENGINEERS keep their own ledger, run on exactly the same rules as the
    // battle line's — credited for the crews they killed, debited for the crews
    // they lost. Only in fights that had engines in them; a raid teaches an
    // engineer nothing because they were not there.
    if (walls) {
      attacker.army.siegeExperiencePoints = Math.max(
        0,
        attacker.army.siegeExperiencePoints +
          Math.round(siegeLedger(def.losses.engineers, atk.losses.engineers, aMatch, aWon ? EXPERIENCE.WON_ATTACK : EXPERIENCE.LOST)),
      );
      defender.army.siegeExperiencePoints = Math.max(
        0,
        defender.army.siegeExperiencePoints +
          Math.round(siegeLedger(atk.losses.engineers, def.losses.engineers, dMatch, aWon ? EXPERIENCE.LOST : EXPERIENCE.WON_DEFENCE)),
      );
    }
  }

  // The cascade: sellswords serve under the regulars of their own arm, and the
  // ones who no longer have anybody to serve under are paid off and ride away.
  // Kill three regulars, cost them four soldiers.
  if (MERCENARIES.DISBAND_ON_REGULAR_LOSS) {
    atk.losses.mercenariesDisbanded = settleMercenaries(attacker);
    def.losses.mercenariesDisbanded = settleMercenaries(defender);
  }

  // MEDICINE — the field hospital. Defender only, sellswords only, and AFTER the
  // cascade above so the surgeons never spend grain on a man who has nobody left
  // to command him. See the MEDICINE block in balance.ts.
  const hospital = fieldHospital(defender, def.mercFallen, researchLevel(defender, "medicine"));
  if (hospital.recovered > 0) {
    say(rounds, "aftermath",
      `The surgeons work through the night — ${hospital.recovered} sellsword${hospital.recovered === 1 ? "" : "s"} carried off the field alive for ${hospital.foodSpent.toLocaleString("en-US")} food.`,
      { tone: "good" });
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
    // The figure the whole battle turns on, surfaced instead of left buried in
    // a sentence. The report used to state the verdict and give the reader no
    // way to check it — you were told who won but not by how much, and the rule
    // ("whoever gave up the smaller SHARE of what they brought") was invisible.
    healthLostShare: lostShare,
    siegeGearLost: gearLost,
    siegeCountersLost: defPark.destroyed,
    siegeGearWorn: atkPark.worn,
    siegeCountersWorn: defPark.worn,
    sortied,
    escalade: hasWall
      ? { grappled: escalade.grappled, laddered: escalade.laddered, towered: escalade.towered }
      : undefined,
    loot,
    salvage,
    staminaLoss: { attacker: aDrain, defender: dDrain },
    experienceChange: {
      attacker: Math.round(attacker.army.experiencePoints - aXpBefore),
      defender: Math.round(defender.army.experiencePoints - dXpBefore),
    },
    mercsRecovered: hospital.recovered,
    siegeExperienceChange: {
      attacker: Math.round(attacker.army.siegeExperiencePoints - aSiegeBefore),
      defender: Math.round(defender.army.siegeExperiencePoints - dSiegeBefore),
    },
    log,
  };

  return { attacker, defender, report };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const clamp = (x: number) => Math.max(0, Math.min(100, x));
const pct = (n: number, of: number) => Math.round((n / Math.max(1, of)) * 100);

/** Everyone who fell, hired and raised alike — the base an award is built on. */
const totalCasualties = (l: Side["losses"]): number =>
  l.footmen + l.archers + l.cavalry + l.engineers + l.mercenaries;

/**
 * Where this fight sits on the ladder, as a multiplier on the award.
 *
 * `ratio` is THEIR ranking score over YOURS, so each side asks the same
 * question — "how much bigger was the other one?" — and gets an answer suited to
 * their own end of it. Interpolated between the EXPERIENCE.MATCHUP breakpoints,
 * flat beyond either end. Below 0.5 the multiplier is NEGATIVE: massacring
 * somebody far beneath you does not merely fail to teach your army anything, it
 * costs you, and it costs more the more thoroughly you do it.
 */
export function matchupMultiplier(ratio: number, mode?: AttackMode): number {
  const pts = EXPERIENCE.MATCHUP;
  let mult: number;
  if (ratio <= pts[0].ratio) mult = pts[0].mult;
  else if (ratio >= pts[pts.length - 1].ratio) mult = pts[pts.length - 1].mult;
  else {
    let i = 0;
    while (i < pts.length - 1 && ratio > pts[i + 1].ratio) i++;
    const a = pts[i];
    const b = pts[i + 1];
    const span = b.ratio - a.ratio;
    mult = span <= 0 ? b.mult : a.mult + ((ratio - a.ratio) / span) * (b.mult - a.mult);
  }
  // Answering a blow you did not choose is never bullying — see
  // EXPERIENCE.REVENGE_MATCHUP_FLOOR.
  if (mode === "revenge") return Math.max(EXPERIENCE.REVENGE_MATCHUP_FLOOR, mult);
  return mult;
}

/** What one arm brings to bear in a single phase. COMBAT_TEMPO is the delivery
 *  ratio that makes a battle last more than one exchange — see the constant. */
const armPower = (s: Side, arm: Arm): number =>
  s.groups.filter((g) => g.arm === arm).reduce((sum, g) => sum + g.count * g.power, 0) *
  COMBAT_TEMPO;

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
  // Sellswords off the beams first, at every rank, before one of your own is
  // touched — the same order every other blow in the game follows.
  for (const pool of ["merc", "regular"] as const) {
    for (const arm of RAM_CREW.PRIORITY) {
      const block = crew.committed[arm];
      if (!block) continue;
      for (const tier of ["light", "medium", "heavy"] as const) {
        if (left <= 0) break;
        const take = Math.min(block[pool][tier], left);
        if (take <= 0) continue;
        block[pool][tier] -= take;
        left -= take;
        crew.total = Math.max(0, crew.total - take);
        if (pool === "merc") {
          side.losses.mercenaries += take;
          // Booked for the field hospital like any other sellsword death.
          const byArm = (side.mercFallen.line[arm] ??= { light: 0, medium: 0, heavy: 0 });
          byArm[tier] += take;
        } else {
          side.losses[arm === "footman" ? "footmen" : arm === "cavalry" ? "cavalry" : "archers"] += take;
        }
      }
    }
  }
}

/** Ram crews rejoin the line at a breach, fighting as the arm they always were. */
function returnRamCrew(side: Side, crew: RamCrew) {
  for (const [arm, block] of Object.entries(crew.committed) as [Arm, RamCrewBlock][]) {
    for (const pool of ["merc", "regular"] as const) {
      for (const tier of ["light", "medium", "heavy"] as const) {
        const n = block[pool][tier];
        if (n <= 0) continue;
        const g = side.groups.find(
          (x) => x.arm === arm && x.tier === tier && x.isMerc === (pool === "merc"),
        );
        if (g) g.count += n;
      }
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
      const block = !joined && crew ? crew.committed[arm] : undefined;
      p.army[SRC[arm]][tier] = (reg?.count ?? 0) + (block?.regular[tier] ?? 0);
      p.army.mercenaries[SRC[arm]][tier] = (merc?.count ?? 0) + (block?.merc[tier] ?? 0);
    }
  }
  p.army.siegeEngineers = s.engineers;
  p.army.mercenaries.engineers = s.mercEngineers;
}

export { assignRamCrew };
