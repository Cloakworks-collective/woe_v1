// Battle resolution (spec/combat.md): 4-phase rounds, wall bonus with
// escalade and War Foundry counters, merc-first casualties, breaking at 30%,
// loot with storage protection, stamina/XP aftermath. Pure — RNG injected.

import {
  BOMBARDABLE,
  BREAK_THRESHOLD,
  BUILDING_DAMAGE_PER_TREB,
  BUILDING_INTEGRITY_FLOOR,
  COUNTER_FOR,
  COUNTER_TYPES,
  EFFECT_PER_LEVEL,
  ENGINE_FIRE,
  ESCALADE_COVERAGE,
  K_LETHALITY,
  LOOT,
  LUCK_SWING,
  MAX_ROUNDS,
  RACES,
  SIEGE_COUNTERS,
  SIEGE_GEAR,
  SIEGE_GEAR_LOSS_ON_DEFEAT,
  STAMINA,
  STORAGE_BUILDING,
  storageShelterAtLevel,
  TIER_POWER,
  UNIT_STATS,
  WALL_BOMBARD_PIVOT,
  wallBonusAtLevel,
  WAR_FOUNDRY_LADDER,
  XP,
} from "../constants";
import type { BuildingId, CounterType } from "../constants/buildings";
import { luck, type Rng } from "./rng";
import {
  bankedRes,
  buildingIntegrity,
  civilians,
  level,
  mercTotal,
  military,
  researchLevel,
  type ArmyState,
  type AttackMode,
  type BattleReport,
  type Clan,
  type Player,
  type Resource,
  type SiegeGearType,
  type Tier,
  type TroopType,
  type UnitLosses,
} from "./types";
import { rankingScore } from "./score";

// ── Internal battle model ───────────────────────────────────────────────────

type Category = "footman" | "archer" | "cavalry" | "engineer";

interface Group {
  cat: Category;
  tier: Tier;
  count: number;
  atk: number; // per unit, all static multipliers applied (no luck)
  def: number;
  /** Hired sellswords: fight in their type's phase at their tier, but die
   *  before the matching regulars of their arm (they are the front line). */
  isMerc: boolean;
}

interface Side {
  p: Player;
  home: boolean;
  groups: Group[]; // regulars and mercs together (merc groups flagged isMerc)
  gear: Record<SiegeGearType, number>; // attacker's committed gear
  engineers: number;
  wallBonus: number; // effective, already × integrity × (1 − escalade)
  losses: UnitLosses;
  startStrength: number;
  warBonus: number; // ×2 damage in clan wars
  siegeMult: number; // race siege × siegecraft research
}

/** Allocate engineers to defensive counters, heaviest-crew first (like crewGear). */
export function crewCounters(
  counters: Record<CounterType, number>,
  engineers: number,
): Record<CounterType, number> {
  const crewed: Record<CounterType, number> = {
    billhooks: 0,
    forkpoles: 0,
    boiling_oil: 0,
    hoardings: 0,
    counter_engine: 0,
  };
  let left = engineers;
  for (const t of COUNTER_TYPES) {
    const can = Math.min(counters[t], Math.floor(left / SIEGE_COUNTERS[t].crew));
    crewed[t] = can;
    left -= can * SIEGE_COUNTERS[t].crew;
  }
  return crewed;
}

/** A defender's engineer allocation: they man the defensive counters FIRST
 *  (priority), then any spare engineers crew the offensive engines to fire back
 *  (spec/combat.md — decided model). */
export function defenderCrews(defender: Player): {
  counters: Record<CounterType, number>;
  offensive: Record<SiegeGearType, number>;
} {
  const eng = defender.army.siegeEngineers;
  const counters = crewCounters(defender.army.siegeCounters, eng);
  const usedByCounters = COUNTER_TYPES.reduce((s, t) => s + counters[t] * SIEGE_COUNTERS[t].crew, 0);
  const offensive = crewGear(defender.army.siegeGear, Math.max(0, eng - usedByCounters));
  return { counters, offensive };
}

/** Allocate engineers to gear, heaviest engines first. Returns crewed counts. */
export function crewGear(
  gear: Record<SiegeGearType, number>,
  engineers: number,
): Record<SiegeGearType, number> {
  const crewed: Record<SiegeGearType, number> = {
    trebuchets: 0,
    ballistae: 0,
    rams: 0,
    ladders: 0,
    ropes: 0,
  };
  let left = engineers;
  for (const t of ["trebuchets", "ballistae", "rams", "ladders", "ropes"] as const) {
    const can = Math.min(gear[t], Math.floor(left / SIEGE_GEAR[t].crew));
    crewed[t] = can;
    left -= can * SIEGE_GEAR[t].crew;
  }
  return crewed;
}

function statMults(p: Player, kind: "attack" | "defence", type?: TroopType): number {
  const race = RACES[p.race];
  const global = kind === "attack" ? race.attack : race.defence;
  const perType = type ? race.units[type] : 1;
  const staminaMod = STAMINA.MOD_BASE + STAMINA.MOD_PER_POINT * p.army.stamina;
  const xpMod = 1 + p.army.experience / 100;
  const research =
    1 +
    researchLevel(p, kind === "attack" ? "art_of_war" : "shieldcraft") * EFFECT_PER_LEVEL;
  return global * perType * staminaMod * xpMod * research;
}

function buildSide(p: Player, opts: { home: boolean; walls: boolean; warBonus: boolean }): Side {
  const groups: Group[] = [];
  const wallLvl = opts.walls ? level(p, "walls") : 0;

  // Defender wall bonus; the caller reduces it by the attacker's escalade.
  const wallBonus =
    opts.home && opts.walls
      ? wallBonusAtLevel(wallLvl) * p.wallIntegrity * RACES[p.race].walls
      : 0;

  // Regulars carry the empire's race/veterancy/research bonuses; mercs are
  // hired professionals — they fight at their type/tier but earn none of your
  // veterancy or race edge (only the shared stamina modifier applies).
  const mercMod = STAMINA.MOD_BASE + STAMINA.MOD_PER_POINT * p.army.stamina;
  const push = (cat: Category, type: TroopType | null, tier: Tier, count: number, isMerc = false) => {
    if (count <= 0) return;
    const base = type ? UNIT_STATS[type] : UNIT_STATS.siegeEngineer;
    const power = type ? TIER_POWER[tier] : 1;
    const atkMult = isMerc ? mercMod : statMults(p, "attack", type ?? undefined);
    const defMult = isMerc ? mercMod : statMults(p, "defence", type ?? undefined);
    groups.push({
      cat,
      tier,
      count,
      atk: base.attack * power * atkMult,
      def: base.defence * power * defMult,
      isMerc,
    });
  };

  for (const tier of ["light", "medium", "heavy"] as const) {
    push("footman", "footman", tier, p.army.footmen[tier]);
    push("archer", "archer", tier, p.army.archers[tier]);
    push("cavalry", "cavalry", tier, p.army.cavalry[tier]);
    // Sellswords — same arms, flagged as the front line (they fall first).
    push("footman", "footman", tier, p.army.mercenaries.footmen[tier], true);
    push("archer", "archer", tier, p.army.mercenaries.archers[tier], true);
    push("cavalry", "cavalry", tier, p.army.mercenaries.cavalry[tier], true);
  }
  push("engineer", null, "light", p.army.siegeEngineers);

  const side: Side = {
    p,
    home: opts.home,
    groups,
    gear: { ...p.army.siegeGear },
    engineers: p.army.siegeEngineers,
    wallBonus, // escalade applied by caller (needs the other side)
    losses: { footmen: 0, archers: 0, cavalry: 0, engineers: 0, mercenaries: 0 },
    startStrength: 0,
    warBonus: opts.warBonus ? 2 : 1,
    siegeMult:
      RACES[p.race].siege * (1 + researchLevel(p, "siegecraft") * EFFECT_PER_LEVEL),
  };
  side.startStrength = strength(side);
  return side;
}

function attackerEscalade(attacker: Player, defender: Player): number {
  const crewed = crewGear(attacker.army.siegeGear, attacker.army.siegeEngineers);
  // Each manned Bill-hook / Fork Pole cancels one climbing rope / ladder team.
  const defC = defenderCrews(defender).counters;
  const ropesEff = Math.max(0, crewed.ropes - defC.billhooks);
  const laddersEff = Math.max(0, crewed.ladders - defC.forkpoles);
  const covered = ropesEff * ESCALADE_COVERAGE.ropes + laddersEff * ESCALADE_COVERAGE.ladders;
  const troops = military(attacker) - attacker.army.siegeEngineers + mercTotal(attacker.army.mercenaries);
  return troops > 0 ? Math.min(1, covered / troops) : 0;
}

function strength(s: Side): number {
  return s.groups.reduce((sum, g) => sum + g.count * g.atk, 0);
}

function headcount(s: Side): number {
  return s.groups.reduce((sum, g) => sum + g.count, 0);
}

const LOSS_KEY: Record<Category, keyof UnitLosses> = {
  footman: "footmen",
  archer: "archers",
  cavalry: "cavalry",
  engineer: "engineers",
};

/** Kill units in a group; merc groups fall onto the aggregate merc line. */
function killGroup(side: Side, group: Group, kills: number) {
  const k = Math.max(0, Math.min(group.count, kills));
  group.count -= k;
  side.losses[group.isMerc ? "mercenaries" : LOSS_KEY[group.cat]] += k;
}

/** Proportional damage across all enemy groups — siege fire, archers. Mercs
 *  are part of the line and take their proportional share like everyone. */
function dealProportional(target: Side, damage: number, defBonus: number) {
  const total = headcount(target);
  if (total === 0 || damage <= 0) return;
  for (const g of target.groups) {
    if (g.count === 0) continue;
    const share = (g.count / total) * damage;
    const kills = Math.floor(share / (K_LETHALITY * g.def * (1 + defBonus)));
    killGroup(target, g, kills);
  }
}

const TIERS_ORDER = ["light", "medium", "heavy"] as const;

/** Targeted damage with spill-through (cavalry, footmen charges). Within each
 *  category the hired sellswords (isMerc) take the blow before the regulars —
 *  the mercs are the front line and die first. */
function dealTargeted(target: Side, damage: number, order: Category[], defBonus: number) {
  let dmg = damage;
  for (const cat of order) {
    // mercs of this arm first (all tiers), then the regulars of this arm.
    for (const isMerc of [true, false]) {
      for (const tier of TIERS_ORDER) {
        const g = target.groups.find((x) => x.cat === cat && x.tier === tier && x.isMerc === isMerc);
        if (!g || g.count === 0) continue;
        if (dmg <= 0) return;
        const perUnit = K_LETHALITY * g.def * (1 + defBonus);
        const kills = Math.min(g.count, Math.floor(dmg / perUnit));
        killGroup(target, g, kills);
        dmg -= kills * perUnit;
        if (g.count > 0) return; // group held — no spill
      }
    }
  }
}

/** Snapshot/diff of a side's losses — lets phases narrate their own kills. */
function lossSnapshot(s: Side): UnitLosses {
  return { ...s.losses };
}

function killsSince(s: Side, before: UnitLosses): { total: number; parts: string } {
  let total = 0;
  const bits: string[] = [];
  for (const k of Object.keys(before) as (keyof UnitLosses)[]) {
    const n = s.losses[k] - before[k];
    if (n > 0) {
      total += n;
      bits.push(`${n} ${k}`);
    }
  }
  return { total, parts: bits.join(", ") };
}

/** "defenders lose 3 footmen, 2 mercenaries" / "the defenders hold". */
function sideLossPhrase(who: string, k: { total: number; parts: string }): string {
  return k.total > 0 ? `${who} lose ${k.parts}` : `the ${who} hold`;
}

function phaseDamage(s: Side, cats: Category[], roundLuck: number): number {
  let dmg = 0;
  for (const g of s.groups) {
    // Sellswords fight in their own arm's phase (merc archers with the archers,
    // etc.) — no special footman-phase pooling any more.
    if (cats.includes(g.cat)) dmg += g.count * g.atk;
  }
  return dmg * roundLuck * s.warBonus;
}

// ── Battle resolution ───────────────────────────────────────────────────────

export interface BattleOptions {
  rng: Rng;
  warBonus?: boolean; // clan war: +100% damage both ways
  battleId: string;
  tick: number;
}

export interface BattleOutcome {
  attacker: Player;
  defender: Player;
  report: BattleReport;
}

/** Full battle for raid / siege / revenge. Bombard is `resolveBombard`. */
export function resolveBattle(
  attackerIn: Player,
  defenderIn: Player,
  mode: Exclude<AttackMode, "bombard">,
  opts: BattleOptions,
): BattleOutcome {
  const attacker = structuredClone(attackerIn);
  const defender = structuredClone(defenderIn);
  const walls = mode !== "raid"; // raids are open-field
  const log: string[] = [];

  const atk = buildSide(attacker, { home: false, walls, warBonus: !!opts.warBonus });
  const def = buildSide(defender, { home: true, walls, warBonus: !!opts.warBonus });
  const escalade = walls ? attackerEscalade(attacker, defender) : 0;
  def.wallBonus *= 1 - escalade;

  const noGear = { trebuchets: 0, ballistae: 0, rams: 0, ladders: 0, ropes: 0 };
  const atkCrewed = walls ? crewGear(attacker.army.siegeGear, attacker.army.siegeEngineers) : { ...noGear };
  // Defender engineers man the counters first, then fire back with spares.
  const defCrew = walls
    ? defenderCrews(defender)
    : { counters: crewCounters(defender.army.siegeCounters, 0), offensive: { ...noGear } };
  const defCrewed = defCrew.offensive;

  // Each manned counter cancels one incoming enemy engine of its paired weapon
  // (decided model): the surplus still fires. Constant across the battle.
  const effRams = Math.max(0, atkCrewed.rams - defCrew.counters.boiling_oil);
  const effBallistae = Math.max(0, atkCrewed.ballistae - defCrew.counters.hoardings);
  const effTrebs = Math.max(0, atkCrewed.trebuchets - defCrew.counters.counter_engine);

  let wallDamage = 0;
  let rounds = 0;
  let victor: "attacker" | "defender" = "defender";

  if (walls && escalade > 0) {
    log.push(`Escalade covers ${Math.round(escalade * 100)}% of the attacking host.`);
  }

  // Name how many engines the defenders' crewed counters neutralise.
  if (walls) {
    for (const t of ["ropes", "ladders", "rams", "ballistae", "trebuchets"] as const) {
      const ct = COUNTER_FOR[t];
      const manned = defCrew.counters[ct];
      const incoming = atkCrewed[t];
      if (manned > 0 && incoming > 0) {
        log.push(`${SIEGE_COUNTERS[ct].name} neutralise ${Math.min(manned, incoming)} of our ${incoming} ${t}.`);
      }
    }
  }

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    rounds = round;
    const aLuck = luck(opts.rng, LUCK_SWING);
    const dLuck = luck(opts.rng, LUCK_SWING);

    // Phase 1 — siege (siege & revenge only). Both sides' engines fire; the
    // defenders' counters have already cancelled some of ours (effRams etc.).
    if (walls) {
      const atkSiegeTroopDmg =
        (effBallistae * ENGINE_FIRE.ballistae.troopDamage +
          effTrebs * ENGINE_FIRE.trebuchets.troopDamage) *
        atk.siegeMult *
        aLuck *
        atk.warBonus;
      const preSiege = lossSnapshot(def);
      dealProportional(def, atkSiegeTroopDmg, def.wallBonus);

      const grind =
        (effRams * ENGINE_FIRE.rams.wallDamage + effTrebs * ENGINE_FIRE.trebuchets.wallDamage) *
        atk.siegeMult *
        aLuck;
      const applied = Math.max(0, Math.min(defender.wallIntegrity - wallDamage, grind));
      wallDamage += applied;
      def.wallBonus = wallBonusAtLevel(level(defender, "walls")) *
        Math.max(0, defender.wallIntegrity - wallDamage) * (1 - escalade);

      const engines = effTrebs + effBallistae + effRams;
      if (engines > 0) {
        const k = killsSince(def, preSiege);
        const wallBit = applied > 0 ? `; the walls take −${Math.round(applied * 100)}%` : "";
        log.push(
          `Siege volley (${engines} crewed engines): ${sideLossPhrase("defenders", k)}${wallBit}.`,
        );
      }

      // Defender's own engines fire back, uncountered (installations don't travel).
      const defSiegeTroopDmg =
        (defCrewed.ballistae * ENGINE_FIRE.ballistae.troopDamage +
          defCrewed.trebuchets * ENGINE_FIRE.trebuchets.troopDamage) *
        def.siegeMult *
        dLuck *
        def.warBonus;
      if (defCrewed.ballistae + defCrewed.trebuchets > 0) {
        const preReturn = lossSnapshot(atk);
        dealProportional(atk, defSiegeTroopDmg, 0);
        log.push(
          `Their engines answer (${defCrewed.ballistae + defCrewed.trebuchets} crewed): ${sideLossPhrase("attackers", killsSince(atk, preReturn))}.`,
        );
      }

    }

    // Phase 2 — archers, proportional, simultaneous.
    const aArrow = phaseDamage(atk, ["archer"], aLuck);
    const dArrow = phaseDamage(def, ["archer"], dLuck);
    const preArrowDef = lossSnapshot(def);
    const preArrowAtk = lossSnapshot(atk);
    dealProportional(def, aArrow, def.wallBonus);
    dealProportional(atk, dArrow, 0);
    const arrowDef = killsSince(def, preArrowDef);
    const arrowAtk = killsSince(atk, preArrowAtk);
    if (arrowDef.total + arrowAtk.total > 0) {
      log.push(
        `Arrows fall: ${sideLossPhrase("defenders", arrowDef)}; ${sideLossPhrase("attackers", arrowAtk)}.`,
      );
    }

    // Phase 3 — cavalry charges, targeted.
    const aCav = phaseDamage(atk, ["cavalry"], aLuck);
    const dCav = phaseDamage(def, ["cavalry"], dLuck);
    const preCavDef = lossSnapshot(def);
    const preCavAtk = lossSnapshot(atk);
    dealTargeted(def, aCav, ["cavalry", "footman", "engineer", "archer"], def.wallBonus);
    dealTargeted(atk, dCav, ["cavalry", "footman", "engineer", "archer"], 0);
    const cavDef = killsSince(def, preCavDef);
    const cavAtk = killsSince(atk, preCavAtk);
    if (cavDef.total + cavAtk.total > 0) {
      log.push(
        `Cavalry charge: ${sideLossPhrase("defenders", cavDef)}; ${sideLossPhrase("attackers", cavAtk)}.`,
      );
    }

    // Phase 4 — footmen charge (merc footmen fight here too), targeted.
    const aFoot = phaseDamage(atk, ["footman"], aLuck);
    const dFoot = phaseDamage(def, ["footman"], dLuck);
    const preFootDef = lossSnapshot(def);
    const preFootAtk = lossSnapshot(atk);
    dealTargeted(def, aFoot, ["footman", "archer", "cavalry", "engineer"], def.wallBonus);
    dealTargeted(atk, dFoot, ["footman", "archer", "cavalry", "engineer"], 0);
    const footDef = killsSince(def, preFootDef);
    const footAtk = killsSince(atk, preFootAtk);
    if (footDef.total + footAtk.total > 0) {
      log.push(
        `The lines meet: ${sideLossPhrase("defenders", footDef)}; ${sideLossPhrase("attackers", footAtk)}.`,
      );
    }

    const aStr = strength(atk);
    const dStr = strength(def);
    log.push(
      `Round ${round}: attacker strength ${Math.round(aStr)} (${Math.round((aStr / Math.max(1, atk.startStrength)) * 100)}%), defender ${Math.round(dStr)} (${Math.round((dStr / Math.max(1, def.startStrength)) * 100)}%).`,
    );

    if (aStr < BREAK_THRESHOLD * atk.startStrength) {
      victor = "defender";
      log.push("The attacking host breaks and flees the field.");
      break;
    }
    if (dStr < BREAK_THRESHOLD * def.startStrength || headcount(def) === 0) {
      victor = "attacker";
      log.push("The defenders break — the day is lost.");
      break;
    }
  }

  // ── Aftermath ─────────────────────────────────────────────────────────────
  applyLossesToPlayer(attacker, atk);
  applyLossesToPlayer(defender, def);
  defender.wallIntegrity = Math.max(0, defender.wallIntegrity - wallDamage);

  // Siege gear: the attacker loses 50% of all committed gear on defeat. The
  // defender's counters are blunted this battle but not consumed.
  const gearLost: Partial<Record<SiegeGearType, number>> = {};
  if (victor === "defender" && walls) {
    for (const t of ["ropes", "ladders", "rams", "ballistae", "trebuchets"] as const) {
      const lost = Math.floor(attacker.army.siegeGear[t] * SIEGE_GEAR_LOSS_ON_DEFEAT);
      attacker.army.siegeGear[t] -= lost;
      if (lost > 0) gearLost[t] = (gearLost[t] ?? 0) + lost;
    }
  }

  // Stamina.
  attacker.army.stamina = Math.max(0, attacker.army.stamina - STAMINA.DRAIN_PER_ROUND_ATTACKER * rounds);
  defender.army.stamina = Math.max(0, defender.army.stamina - STAMINA.DRAIN_PER_ROUND_DEFENDER * rounds);

  // Experience: proportional loss with dead regulars, then band gains.
  const aRegBefore = regularsOf(attackerIn);
  const dRegBefore = regularsOf(defenderIn);
  const aRegLost = totalRegularLosses(atk.losses);
  const dRegLost = totalRegularLosses(def.losses);
  const ratio = rankingScore(defenderIn) / Math.max(1, rankingScore(attackerIn));
  const aGain =
    mode === "revenge"
      ? XP.FAIR.gain // vengeance is always honorable
      : ratio >= XP.BOLD.min
        ? XP.BOLD.gain
        : ratio >= XP.FAIR.min
          ? XP.FAIR.gain
          : ratio >= XP.WEAK.min
            ? XP.WEAK.gain
            : XP.BULLY_GAIN;
  const aXpBefore = attacker.army.experience;
  const dXpBefore = defender.army.experience;
  attacker.army.experience = clampXp(
    attacker.army.experience * (1 - (aRegBefore ? aRegLost / aRegBefore : 0)) + aGain,
  );
  defender.army.experience = clampXp(
    defender.army.experience * (1 - (dRegBefore ? dRegLost / dRegBefore : 0)) + XP.DEFENDER_GAIN,
  );

  // Loot.
  const loot: BattleReport["loot"] = { gold: 0, resources: { food: 0, wood: 0, stone: 0, ore: 0 } };
  if (victor === "attacker" && (mode === "raid" || mode === "siege")) {
    const sizeRatio = def.startStrength / Math.max(1, atk.startStrength);
    const scale =
      sizeRatio >= LOOT.BIG_TARGET_RATIO
        ? LOOT.BIG_TARGET_BONUS
        : sizeRatio <= LOOT.SMALL_TARGET_RATIO
          ? Math.max(LOOT.SMALL_TARGET_FLOOR, sizeRatio / LOOT.SMALL_TARGET_RATIO)
          : 1;
    for (const r of ["food", "wood", "stone", "ore"] as const) {
      const outside = unstored(defender, r);
      const take = Math.floor(outside * LOOT.FRACTION * scale);
      plunderResource(defender, r, take);
      attacker.resources[r] += take;
      loot.resources[r] = take;
    }
    if (mode === "siege") {
      const unbanked = unbankedGold(defender);
      const take = Math.floor(unbanked * LOOT.FRACTION * scale);
      plunderGold(defender, take);
      attacker.gold += take;
      loot.gold = take;
    }
    log.push(`Plunder: ${loot.gold} gold, ${loot.resources.food} food, ${loot.resources.wood} wood, ${loot.resources.stone} stone, ${loot.resources.ore} ore.`);
  }

  if (victor === "attacker") attacker.battlesWon += 1;
  else attacker.battlesLost += 1;
  if (victor === "defender") defender.battlesWon += 1;
  else defender.battlesLost += 1;

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
    attackerLosses: atk.losses,
    defenderLosses: def.losses,
    wallIntegrityDamage: wallDamage,
    siegeGearLost: gearLost,
    loot,
    staminaLoss: {
      attacker: STAMINA.DRAIN_PER_ROUND_ATTACKER * rounds,
      defender: STAMINA.DRAIN_PER_ROUND_DEFENDER * rounds,
    },
    experienceChange: {
      attacker: Math.round(attacker.army.experience - aXpBefore),
      defender: Math.round(defender.army.experience - dXpBefore),
    },
    log,
  };

  return { attacker, defender, report };
}

const BUILDING_LABEL: Partial<Record<BuildingId, string>> = {
  granary: "Granary", timberyard: "Timberyard", masons_yard: "Mason's Yard",
  ironhold: "Ironhold", counting_house: "Counting House", grange: "Grange",
  masons_quarry: "Mason's Quarry", deepvein_mine: "Deepvein Mine",
  sawyers_mill: "Sawyer's Mill", collegium: "Collegium",
};

/** Weighted pick of a bombardable building the defender owns and that still
 *  has integrity above the floor. Returns null when nothing is left to break. */
function pickBombardTarget(defender: Player, rng: Rng): BuildingId | null {
  const eligible = BOMBARDABLE.filter(
    (b) => level(defender, b.id) > 0 && buildingIntegrity(defender, b.id) > BUILDING_INTEGRITY_FLOOR,
  );
  const total = eligible.reduce((s, b) => s + b.weight, 0);
  if (total === 0) return null;
  let roll = rng() * total;
  for (const b of eligible) {
    roll -= b.weight;
    if (roll <= 0) return b.id;
  }
  return eligible[eligible.length - 1].id;
}

/**
 * Bombard: a pure artillery duel (trebuchets + crews vs the Counter-Engine).
 * No target choice — the engines pound the **walls first**, and once the
 * walls are down (≤50% integrity) the stray fire spills onto the town,
 * cracking a random building each round: storages mostly, then production
 * (which slows), then the Collegium (which slows research). No loot; this is
 * the softening strike before a castle attack. No victor.
 */
export function resolveBombard(
  attackerIn: Player,
  defenderIn: Player,
  opts: BattleOptions,
): BattleOutcome {
  const attacker = structuredClone(attackerIn);
  const defender = structuredClone(defenderIn);
  const log: string[] = [];
  // The defender's engineers man their Counter-Engines — each cancels one of our
  // trebuchets' fire, and their crews also duel and splinter our engines.
  const mannedCE = crewCounters(defender.army.siegeCounters, defender.army.siegeEngineers).counter_engine;
  const siegeMult =
    RACES[attacker.race].siege * (1 + researchLevel(attacker, "siegecraft") * EFFECT_PER_LEVEL);
  defender.buildingIntegrity ??= {};

  let wallDamage = 0;
  let trebsLost = 0;
  let rounds = 0;
  const buildingHits: Partial<Record<BuildingId, number>> = {};

  const opening = crewGear(attacker.army.siegeGear, attacker.army.siegeEngineers).trebuchets;
  if (opening > 0) {
    log.push(`${opening} crewed trebuchets wheel into range and open fire on the walls.`);
    if (mannedCE > 0) {
      log.push(`${mannedCE} crewed Counter-Engine${mannedCE > 1 ? "s" : ""} answer, cancelling that many of our volleys.`);
    }
  }

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const crewed = crewGear(attacker.army.siegeGear, attacker.army.siegeEngineers).trebuchets;
    if (crewed === 0) break;
    rounds = round;
    const roll = luck(opts.rng, LUCK_SWING);
    const mult = siegeMult * roll;
    const firing = Math.max(0, crewed - mannedCE); // counters cancel this many volleys

    if (firing === 0) {
      log.push(`Round ${round}: the Counter-Engines smother our barrage — no stone finds the walls.`);
    } else {
      const wallsStanding = level(defender, "walls") > 0 && defender.wallIntegrity > WALL_BOMBARD_PIVOT;
      if (wallsStanding) {
        // Walls first — grind them down toward the pivot (and a touch past it).
        const grind = firing * ENGINE_FIRE.trebuchets.wallDamage * mult;
        const applied = Math.min(defender.wallIntegrity, grind);
        defender.wallIntegrity -= applied;
        wallDamage += applied;
        if (defender.wallIntegrity <= WALL_BOMBARD_PIVOT) {
          log.push(`Round ${round}: the wall is breached — the fire spills onto the town.`);
        } else {
          log.push(`Round ${round}: ${firing} trebuchets pound the walls (−${Math.round(applied * 100)}%).`);
        }
      } else {
        // Walls are down (or absent) — a random building takes the volley.
        const target = pickBombardTarget(defender, opts.rng);
        if (!target) {
          log.push(`Round ${round}: nothing left standing to break — the barrage falls on rubble.`);
        } else {
          const dmg = firing * BUILDING_DAMAGE_PER_TREB * mult;
          const cur = buildingIntegrity(defender, target);
          const hit = Math.min(Math.max(0, cur - BUILDING_INTEGRITY_FLOOR), dmg);
          defender.buildingIntegrity[target] = cur - hit;
          buildingHits[target] = (buildingHits[target] ?? 0) + hit;
          log.push(`Round ${round}: a volley cracks the ${BUILDING_LABEL[target] ?? target} (−${Math.round(hit * 100)}%).`);
        }
      }
    }

    // The Counter-Engine crews splinter one of our trebuchets each round.
    if (mannedCE > 0 && attacker.army.siegeGear.trebuchets > 0) {
      attacker.army.siegeGear.trebuchets -= 1;
      trebsLost += 1;
      log.push(`Round ${round}: a Counter-Engine smashes one of our trebuchets.`);
    }
  }

  const buildingDamage = (Object.entries(buildingHits) as [BuildingId, number][])
    .filter(([, v]) => v > 0)
    .map(([building, integrityLost]) => ({ building, integrityLost }));

  log.push(
    `Bombardment done: walls −${Math.round(wallDamage * 100)}%` +
      (buildingDamage.length
        ? `, ${buildingDamage.length} building${buildingDamage.length > 1 ? "s" : ""} cracked open`
        : "") +
      (trebsLost ? `; ${trebsLost} trebuchets lost to the Counter-Engine.` : "."),
  );

  const empty: UnitLosses = { footmen: 0, archers: 0, cavalry: 0, engineers: 0, mercenaries: 0 };
  const report: BattleReport = {
    id: opts.battleId,
    tick: opts.tick,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    mode: "bombard",
    rounds,
    victor: "none",
    attackerLosses: { ...empty },
    defenderLosses: { ...empty },
    wallIntegrityDamage: wallDamage,
    buildingDamage: buildingDamage.length ? buildingDamage : undefined,
    siegeGearLost: trebsLost ? { trebuchets: trebsLost } : {},
    trebsDestroyedByCounter: trebsLost || undefined,
    loot: { gold: 0, resources: { food: 0, wood: 0, stone: 0, ore: 0 } },
    staminaLoss: { attacker: 0, defender: 0 },
    experienceChange: { attacker: 0, defender: 0 },
    log,
  };
  return { attacker, defender, report };
}

// ── Clan-building bombardment (spec/clans.md — war only) ─────────────────────

export type ClanBuilding = "storage" | "hall" | "wonder";

export interface ClanBombardOutcome {
  attacker: Player;
  clan: Clan; // the bombarded clan, its target building's integrity reduced
  which: ClanBuilding;
  integrityLost: number;
  trebuchets: number;
  rounds: number;
  log: string[];
}

const CLAN_BUILDING_LABEL: Record<ClanBuilding, string> = {
  storage: "Clan Storage",
  hall: "Clan Hall",
  wonder: "Clan Wonder",
};

export function clanBuildingLabel(which: ClanBuilding): string {
  return CLAN_BUILDING_LABEL[which];
}

/**
 * War-only artillery strike on an enemy clan's works. Crewed trebuchets grind
 * the chosen structure's integrity toward the 50% floor — no Counter-Engine
 * (clan works carry no War Foundry), so no trebuchet is lost. No loot. The
 * *price* — a single revenge strike for the whole attacked clan — is applied
 * by the caller (see the pipeline). Pure; RNG injected.
 */
export function resolveClanBombard(
  attackerIn: Player,
  targetClanIn: Clan,
  which: ClanBuilding,
  opts: BattleOptions,
): ClanBombardOutcome {
  const attacker = structuredClone(attackerIn);
  const clan = structuredClone(targetClanIn);
  const log: string[] = [];
  const label = CLAN_BUILDING_LABEL[which];
  const siegeMult =
    RACES[attacker.race].siege * (1 + researchLevel(attacker, "siegecraft") * EFFECT_PER_LEVEL);
  const trebuchets = crewGear(attacker.army.siegeGear, attacker.army.siegeEngineers).trebuchets;

  let integrityLost = 0;
  let rounds = 0;

  if (trebuchets === 0) {
    log.push("No crewed trebuchets march — the barrage never begins.");
    return { attacker, clan, which, integrityLost, trebuchets, rounds, log };
  }
  log.push(`${trebuchets} crewed trebuchets wheel within range of the ${label} and open fire.`);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const now = clan.buildings.integrity[which];
    if (now <= BUILDING_INTEGRITY_FLOOR) {
      log.push(`Round ${round}: the ${label} is already cracked to its foundations — stones fall on rubble.`);
      break;
    }
    rounds = round;
    const roll = luck(opts.rng, LUCK_SWING);
    const dmg = trebuchets * BUILDING_DAMAGE_PER_TREB * siegeMult * roll;
    const applied = Math.min(now - BUILDING_INTEGRITY_FLOOR, dmg);
    clan.buildings.integrity[which] = now - applied;
    integrityLost += applied;
    log.push(`Round ${round}: the volley cracks the ${label} (−${Math.round(applied * 100)}%).`);
  }

  log.push(
    `Bombardment done: the ${label} stands at ${Math.round(clan.buildings.integrity[which] * 100)}% integrity.`,
  );
  return { attacker, clan, which, integrityLost, trebuchets, rounds, log };
}

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Raidable goods: everything loose, plus vaulted overflow past the store's
 *  (integrity-scaled) capacity — a wrecked store spills. */
export function unstored(p: Player, r: Resource): number {
  const building = STORAGE_BUILDING[r];
  const cap = storageShelterAtLevel(level(p, building)) * buildingIntegrity(p, building);
  const spilled = Math.max(0, bankedRes(p)[r] - cap);
  return p.resources[r] + spilled;
}

/** Deduct plundered/burnt goods: loose stock first, then the spilled vault. */
export function plunderResource(p: Player, r: Resource, amount: number): void {
  const fromLoose = Math.min(p.resources[r], amount);
  p.resources[r] -= fromLoose;
  const rest = amount - fromLoose;
  if (rest > 0) {
    const banked = { ...bankedRes(p) };
    banked[r] = Math.max(0, banked[r] - rest);
    p.bankedResources = banked;
  }
}

/** Deduct plundered gold: loose first, then the spilled vault. */
export function plunderGold(p: Player, amount: number): void {
  const fromLoose = Math.min(p.gold, amount);
  p.gold -= fromLoose;
  const rest = amount - fromLoose;
  if (rest > 0) p.bankedGold = Math.max(0, p.bankedGold - rest);
}

/** Gold outside the (integrity-scaled) Counting House. */
export function unbankedGold(p: Player): number {
  const cap = storageShelterAtLevel(level(p, "counting_house")) * buildingIntegrity(p, "counting_house");
  const spilled = Math.max(0, p.bankedGold - cap); // a wrecked bank spills
  return p.gold + spilled;
}

function regularsOf(p: Player): number {
  return military(p);
}

function totalRegularLosses(l: UnitLosses): number {
  return l.footmen + l.archers + l.cavalry + l.engineers;
}

function clampXp(x: number): number {
  return Math.max(0, Math.min(XP.MAX, x));
}

const CORPS_OF: Record<"footman" | "archer" | "cavalry", "footmen" | "archers" | "cavalry"> = {
  footman: "footmen",
  archer: "archers",
  cavalry: "cavalry",
};

function applyLossesToPlayer(p: Player, s: Side) {
  for (const g of s.groups) {
    if (g.cat === "engineer") {
      p.army.siegeEngineers = g.count;
      continue;
    }
    const store = g.isMerc ? p.army.mercenaries : p.army;
    store[CORPS_OF[g.cat]][g.tier] = g.count;
  }
}

// ── Attack validation (spec/combat.md rules; pure — caller supplies context) ─

export interface AttackContext {
  currentTick: number;
  eraStartedAtTick: number;
  eraPeaceTicks: number; // 5 days × 144
  revengeWindowTicks: number; // 18h × 6
  clanWar: boolean;
  /** True when a clan-bombardment revenge window (spec/clans.md) authorizes
   *  this member to strike, even without a personal recentAttackers entry. */
  clanRevengeAuthorized?: boolean;
  /** No fresh attacks for this many ticks after lowering the white flag
   *  (anti-dodge; revenge is exempt). See surrenderLiftedAtTick. */
  surrenderReattackCooldownTicks?: number;
}

export function validateAttack(
  attacker: Player,
  defender: Player,
  mode: AttackMode,
  ctx: AttackContext,
): string | null {
  if (attacker.id === defender.id) return "You cannot attack yourself.";
  if (attacker.starving) return "Starving armies will not march.";
  if (attacker.surrendered) return "You have surrendered — lift the white flag first.";
  if (attacker.turnsAvailable < 10) return "An attack costs 10 action turns.";
  if (ctx.currentTick - ctx.eraStartedAtTick < ctx.eraPeaceTicks) {
    return "The era peace holds — no attacks in the first 5 days.";
  }
  if (defender.shieldUntilTick > ctx.currentTick) {
    return "That empire is under the newcomer shield.";
  }

  if (mode === "revenge") {
    const personalOpen =
      !!attacker.recentAttackers.find(
        (a) => a.playerId === defender.id && ctx.currentTick - a.tick <= ctx.revengeWindowTicks,
      ) && !attacker.revengeUsed.includes(defender.id);
    // A clan-bombardment revenge (spec/clans.md) is a second, independent path:
    // any member of the bombarded clan may deliver it against any aggressor.
    if (!personalOpen && !ctx.clanRevengeAuthorized) {
      return attacker.revengeUsed.includes(defender.id)
        ? "You have already taken your revenge."
        : "No revenge window is open against that empire.";
    }
    return null; // revenge ignores surrender, stamina, refusal, and the cooldown
  }

  // Re-attack cooldown: you can't duck under the white flag and immediately
  // swing back once you lower it (revenge, handled above, is exempt).
  if (
    attacker.surrenderLiftedAtTick !== undefined &&
    ctx.surrenderReattackCooldownTicks &&
    ctx.currentTick - attacker.surrenderLiftedAtTick < ctx.surrenderReattackCooldownTicks
  ) {
    return "Your host is still standing down from the surrender — no fresh attacks so soon after the white flag comes down.";
  }

  if (defender.surrendered) return "They have surrendered — only revenge may touch them.";
  if (defender.army.stamina < STAMINA.MERCY_FLOOR) {
    return "Their army is beaten down — mercy forbids it (revenge excepted).";
  }
  const ratio = rankingScore(defender) / Math.max(1, rankingScore(attacker));
  if (ratio >= XP.REFUSAL_RATIO) {
    return "Your troops refuse — that empire is far too strong (≥75% above you).";
  }
  return null;
}
