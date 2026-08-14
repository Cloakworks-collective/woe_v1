// The shared strength model — the heart of the rework (spec/combat.md).
//
//     damage = basePower × (1 + Σ bonuses) × delivery
//
// Everything that can fight has Power; everything that can be hurt has Health;
// both live on ONE scale, so a wall, a trebuchet and a footman can all be
// described with the same two numbers. Bonuses ADD (so a new one never
// multiplies the whole stack); delivery MULTIPLIES (because "what fraction of
// my power applies here" is a ratio, and ratios don't add).
//
// Pure — no I/O, no clock, RNG injected by the caller.

import {
  CASUALTY_SPLIT,
  CASUALTY_TIER_ORDER,
  EFFECTIVENESS,
  EFFECT_PER_LEVEL,
  MERCENARIES,
  RACES,
  SIEGE_ACCURACY,
  MAX_FIELD_LEVEL,
  STAMINA,
  UNIT_STATS,
  WALL_ROLE_BONUS,
  WAR,
  WARWORKS_BONUS_PER_LEVEL,
  type TargetKind,
} from "../../constants";
import {
  level,
  mercsOfArm,
  regularsOfArm,
  researchLevel,
  troopTotal,
  type MercArm,
  type Player,
  type Tier,
  type TroopType,
} from "../types";

// ── Groups and sides ────────────────────────────────────────────────────────

export type Arm = "footman" | "archer" | "cavalry";

/** One homogeneous block of soldiers: an arm, a tier, and whether they are
 *  yours or hired. Health is a POOL — damage eats it, and whole units fall out
 *  as it drains. */
export interface Group {
  arm: Arm;
  tier: Tier;
  count: number;
  isMerc: boolean;
  /** Per-unit, with every additive bonus already folded in. */
  power: number;
  health: number;
  /** Health is rebuilt whenever the wall edge moves — rams and trebuchets
   *  bring masonry down DURING the fight, and a breached wall shelters less.
   *  Because the pool is additive we can hold the two apart cleanly:
   *      health = healthBase × (healthMult + wallEdge)
   *  where healthMult is every bonus except the wall. */
  healthBase: number;
  healthMult: number;
}

export interface SideLosses {
  footmen: number;
  archers: number;
  cavalry: number;
  engineers: number;
  mercenaries: number;
  mercenariesDisbanded: number;
}

export interface Side {
  player: Player;
  home: boolean;
  groups: Group[];
  /** Engineers are never a battle group — they crew engines and they die in
   *  the duel, never to a cavalry charge. Tracked apart from the line. */
  engineers: number;
  mercEngineers: number;
  losses: SideLosses;
  startPower: number;
  /** Civilians driven off by the attack (defender only). */
  civiliansDisplaced: number;
}

export const emptyLosses = (): SideLosses => ({
  footmen: 0,
  archers: 0,
  cavalry: 0,
  engineers: 0,
  mercenaries: 0,
  mercenariesDisbanded: 0,
});

// ── The additive bonus pool ─────────────────────────────────────────────────

/** Every modifier that makes a unit BETTER, summed. Returns the multiplier
 *  (1 + Σ), never the raw sum, so callers can't accidentally re-add 1. */
export interface BonusContext {
  kind: "attack" | "defence";
  arm?: Arm;
  /** Defending behind an intact wall: which edge applies to this block. */
  wallEdge?: number;
  /** On the wall, archers are lethal and cavalry are wasted. */
  onWall?: boolean;
  /** Riding out at the siege lines. */
  sortie?: boolean;
  /** Dug in around the engines. */
  entrenched?: boolean;
  /** Clan war doubles the blood. */
  war?: boolean;
  /** Sellswords carry your EQUIPMENT and DOCTRINE — the Forge, the Armoury,
   *  the Art of War — but none of your race or veterancy. Bought steel and
   *  bought drill; not bought blood, not bought scars. */
  isMerc?: boolean;
}

export function bonusPool(p: Player, ctx: BonusContext): number {
  let sum = 0;

  // ── What EVERY soldier under your banner gets, hired or raised ────────────
  //
  // Equipment and doctrine are the empire's, not the soldier's. You arm a
  // sellsword from your own Forge and Armoury and you drill them to your own
  // Art of War, so these reach the whole line. Only what a mercenary CANNOT
  // acquire by being paid is withheld below: the blood they were born with, and
  // the years your own veterans spent earning their scars.
  //
  // It also keeps the arithmetic honest. When hired and raised troops share a
  // multiplier, "what is my army worth?" is one sum rather than two, and every
  // downstream comparison — the ranking score, the battle calculator, the
  // harnesses — gets simpler for it.
  sum += researchLevel(p, ctx.kind === "attack" ? "art_of_war" : "shieldcraft") * EFFECT_PER_LEVEL;
  sum += level(p, ctx.kind === "attack" ? "forge" : "armoury") * WARWORKS_BONUS_PER_LEVEL;

  // ── Situational: the ground, not the soldier ──────────────────────────────
  if (ctx.wallEdge) sum += ctx.wallEdge;
  if (ctx.sortie && ctx.arm === "cavalry") sum += SORTIE_CAVALRY_BONUS();
  if (ctx.entrenched) sum += ENTRENCHED();
  if (ctx.war) sum += WAR.DAMAGE_BONUS;

  // Hired blades stop here. No race, no veterancy — and no wall ROLE bonus,
  // which is a drilled position rather than a place to stand.
  if (ctx.isMerc) return 1 + sum;

  const race = RACES[p.race];

  // Race — a global stat modifier plus a per-arm one.
  sum += (ctx.kind === "attack" ? race.attack : race.defence) - 1;
  if (ctx.arm) sum += race.units[ctx.arm as TroopType] - 1;

  // Veterancy: up to +100% at 100 XP.
  sum += p.army.experience / 100;

  // What each arm does with a wall it has TRAINED on — archers lethal from a
  // parapet, cavalry wasted behind one. The wall edge itself is shared above;
  // this is the drilled role, which is why a sellsword does not get it.
  if (ctx.onWall && ctx.arm) sum += WALL_ROLE_BONUS[ctx.arm];

  return 1 + sum;
}

// Imported lazily to keep the constant list at the top readable.
import { SORTIE } from "../../constants";
const SORTIE_CAVALRY_BONUS = () => SORTIE.CAVALRY_BONUS;
const ENTRENCHED = () => SORTIE.ENTRENCHED_BONUS;

/** Siege power carries its own veterancy and its own research. Engineers get
 *  better at their trade whether they are pushing engines forward or manning
 *  them on the wall — one corps, one stat. */
export function siegeBonusPool(p: Player, war: boolean): number {
  let sum = 0;
  sum += RACES[p.race].siege - 1;
  sum += p.army.siegeExperience / 100;
  sum += researchLevel(p, "siegecraft") * EFFECT_PER_LEVEL;
  if (war) sum += WAR.DAMAGE_BONUS; // clan war: +100% by default, and bombard reads this too
  return 1 + sum;
}

// ── Delivery ────────────────────────────────────────────────────────────────

/** How much of an army's power it can actually bring. A spent army fights at
 *  half strength no matter how well researched — which is why this is a gate
 *  and not a bonus. */
export function staminaDelivery(p: Player): number {
  return STAMINA.MOD_BASE + STAMINA.MOD_PER_POINT * p.army.stamina;
}

/** What fraction of an attacker's power applies to a given kind of target.
 *  Read a row of EFFECTIVENESS to learn what a weapon is FOR. */
export function effectiveness(source: string, target: TargetKind): number {
  return EFFECTIVENESS[source]?.[target] ?? 0;
}

/** Siege Accuracy is the one research that moves a delivery gate rather than
 *  the additive pool — which is exactly why it is the strongest pick a siege
 *  specialist can make. Interpolated across the field's levels. */
export function siegeDelivery(p: Player, target: TargetKind): number {
  const base = effectiveness("trebuchets", target);
  const band = target === "walls" ? SIEGE_ACCURACY.walls
    : target === "buildings" ? SIEGE_ACCURACY.buildings
    : target === "siege" ? SIEGE_ACCURACY.siege
    : null;
  if (!band) return base;
  const lvl = researchLevel(p, "siege_accuracy");
  return band.from + (band.to - band.from) * (lvl / MAX_FIELD_LEVEL);
}

/** The defender's counter-battery benefits from the same study. */
export function counterBatteryDelivery(p: Player): number {
  const b = SIEGE_ACCURACY.counterBattery;
  return b.from + (b.to - b.from) * (researchLevel(p, "siege_accuracy") / MAX_FIELD_LEVEL);
}

// ── Building a side ─────────────────────────────────────────────────────────

export interface SideOptions {
  home: boolean;
  /** Wall edge already blended across the host by walls.ts (0 on a raid). */
  wallEdge: number;
  war: boolean;
  /** Raids are open-field: engineers stay home and take no part at all. */
  engineersPresent: boolean;
  /** Footmen (then cavalry, then archers) committed to pushing rams — they are
   *  not in the battle line until the wall is breached. */
  ramCrew?: Partial<Record<Arm, Record<Tier, number>>>;
}

const ARM_SOURCE = {
  footman: "footmen",
  archer: "archers",
  cavalry: "cavalry",
} as const;

export function buildSide(p: Player, opts: SideOptions): Side {
  const groups: Group[] = [];
  const stam = staminaDelivery(p);

  const push = (arm: Arm, tier: Tier, count: number, isMerc: boolean) => {
    if (count <= 0) return;
    const stats = UNIT_STATS[arm][tier];
    const atkCtx: BonusContext = { kind: "attack", arm, war: opts.war, isMerc };
    // Everything EXCEPT the wall, which moves during the battle.
    const defCtx: BonusContext = {
      kind: "defence",
      arm,
      war: opts.war,
      isMerc,
      onWall: opts.home && opts.wallEdge > 0,
    };
    const healthBase = stats.health;
    const healthMult = bonusPool(p, defCtx);
    groups.push({
      arm,
      tier,
      count,
      isMerc,
      // Stamina is folded in here (it applies to everything this side does);
      // luck and effectiveness are applied per-phase, per-target.
      power: stats.power * bonusPool(p, atkCtx) * stam,
      healthBase,
      healthMult,
      health: healthBase * (healthMult + opts.wallEdge),
    });
  };

  for (const tier of CASUALTY_TIER_ORDER) {
    for (const arm of ["footman", "archer", "cavalry"] as const) {
      const src = ARM_SOURCE[arm];
      const committed = opts.ramCrew?.[arm]?.[tier] ?? 0;
      push(arm, tier, Math.max(0, p.army[src][tier] - committed), false);
      push(arm, tier, p.army.mercenaries[src][tier], true);
    }
  }

  const side: Side = {
    player: p,
    home: opts.home,
    groups,
    engineers: opts.engineersPresent ? p.army.siegeEngineers : 0,
    mercEngineers: opts.engineersPresent ? p.army.mercenaries.engineers : 0,
    losses: emptyLosses(),
    startPower: 0,
    civiliansDisplaced: 0,
  };
  side.startPower = totalPower(side);
  return side;
}

/** Re-price the defenders behind a wall that has just taken damage (or been
 *  bypassed by fresh escalade tackle). Called at the top of every round. */
export function setWallEdge(side: Side, edge: number) {
  for (const g of side.groups) g.health = g.healthBase * (g.healthMult + edge);
}

export const totalPower = (s: Side): number =>
  s.groups.reduce((sum, g) => sum + g.count * g.power, 0);

export const totalHealth = (s: Side): number =>
  s.groups.reduce((sum, g) => sum + g.count * g.health, 0);

export const headcount = (s: Side): number => s.groups.reduce((sum, g) => sum + g.count, 0);

/** Power of the arms that can hold a line — what a sortie must get through and
 *  what the screen is measured in. Archers and engines don't count. */
export const fieldPower = (s: Side): number =>
  s.groups
    .filter((g) => g.arm === "footman" || g.arm === "cavalry")
    .reduce((sum, g) => sum + g.count * g.power, 0);

// ── Casualties ──────────────────────────────────────────────────────────────

const LOSS_KEY: Record<Arm, keyof SideLosses> = {
  footman: "footmen",
  archer: "archers",
  cavalry: "cavalry",
};

function kill(side: Side, g: Group, n: number) {
  const k = Math.max(0, Math.min(g.count, Math.floor(n)));
  g.count -= k;
  side.losses[g.isMerc ? "mercenaries" : LOSS_KEY[g.arm]] += k;
}

/** Spread damage across every block by headcount — volleys and engine fire,
 *  which do not choose who they hit. */
export function spreadDamage(target: Side, damage: number) {
  const total = headcount(target);
  if (total <= 0 || damage <= 0) return;
  for (const g of target.groups) {
    if (g.count === 0) continue;
    const share = (g.count / total) * damage;
    kill(target, g, share / g.health);
  }
}

/**
 * Damage aimed at particular arms, in order. Within an arm the split is
 * CASUALTY_SPLIT.MERC_SHARE to the sellswords and the rest to your own —
 * so regulars ALWAYS leak a little even while the buffer holds, which is what
 * keeps losing them the worst thing that can happen to you. Within each pool
 * the cheap ranks fall first, so a layer of light troops beneath your heavies
 * is a genuine shock absorber.
 */
export function aimDamage(target: Side, damage: number, order: Arm[]) {
  let left = damage;
  for (const arm of order) {
    if (left <= 0) return;
    const blocks = target.groups.filter((g) => g.arm === arm && g.count > 0);
    if (blocks.length === 0) continue;

    const mercs = blocks.filter((g) => g.isMerc);
    const regs = blocks.filter((g) => !g.isMerc);
    const mercHealth = mercs.reduce((s, g) => s + g.count * g.health, 0);
    const regHealth = regs.reduce((s, g) => s + g.count * g.health, 0);
    if (mercHealth + regHealth <= 0) continue;

    // Sellswords take the agreed share — unless there aren't enough of them,
    // in which case the overflow finds your own people.
    const wantMerc = mercs.length ? left * CASUALTY_SPLIT.MERC_SHARE : 0;
    const toMerc = Math.min(wantMerc, mercHealth);
    const toReg = Math.min(left - toMerc, regHealth);

    drainPool(target, mercs, toMerc);
    drainPool(target, regs, toReg);
    left -= toMerc + toReg;
  }
}

/** Light before medium before heavy — the cheap ranks are the front rank. */
function drainPool(side: Side, pool: Group[], damage: number) {
  let left = damage;
  for (const tier of CASUALTY_TIER_ORDER) {
    if (left <= 0) return;
    const g = pool.find((x) => x.tier === tier && x.count > 0);
    if (!g) continue;
    const capacity = g.count * g.health;
    const spent = Math.min(left, capacity);
    kill(side, g, spent / g.health);
    left -= spent;
  }
}

/** Engineer casualties. They never fall to a charge — only to the duel, or to
 *  a sortie that got past the screen. Sellsword crews go first. */
export function killEngineers(side: Side, n: number) {
  let left = Math.max(0, Math.floor(n));
  const fromMerc = Math.min(side.mercEngineers, left);
  side.mercEngineers -= fromMerc;
  side.losses.mercenaries += fromMerc;
  left -= fromMerc;
  const fromReg = Math.min(side.engineers, left);
  side.engineers -= fromReg;
  side.losses.engineers += fromReg;
}

export const regularsLost = (l: SideLosses): number =>
  l.footmen + l.archers + l.cavalry + l.engineers;

// ── The mercenary cascade ───────────────────────────────────────────────────

/**
 * Sellswords serve under the regulars of their own arm, and no more than
 * MERCENARIES.CAP_RATIO of them. When those regulars die — in battle, to an
 * assassin, to starvation, to a discharge — the men they can no longer command
 * are paid off and ride away.
 *
 * This is why killing regulars matters more than anything else you can do:
 * kill three and you cost them four soldiers, and the buffer protecting the
 * survivors thins at the same time. It fires AFTER a battle, never mid-round —
 * mid-battle disbanding would collide with the casualty split and make the
 * report unreadable.
 *
 * Returns how many were paid off, for the report.
 */
export function settleMercenaries(p: Player): number {
  let disbanded = 0;
  const arms: MercArm[] = ["footman", "archer", "cavalry", "engineer", "spy", "scout"];
  for (const arm of arms) {
    const allowed = Math.floor(regularsOfArm(p, arm) * MERCENARIES.CAP_RATIO);
    const serving = mercsOfArm(p, arm);
    let excess = serving - allowed;
    if (excess <= 0) continue;
    disbanded += excess;

    const m = p.army.mercenaries;
    if (arm === "engineer") {
      m.engineers -= excess;
      continue;
    }
    if (arm === "spy") {
      m.spies -= excess;
      continue;
    }
    if (arm === "scout") {
      m.scouts -= excess;
      continue;
    }
    // Tiered arms: the dearest contracts are ended first — you keep the cheap
    // bodies and let the expensive specialists go.
    const counts =
      arm === "footman" ? m.footmen : arm === "archer" ? m.archers : m.cavalry;
    for (const tier of ["heavy", "medium", "light"] as const) {
      const take = Math.min(counts[tier], excess);
      counts[tier] -= take;
      excess -= take;
      if (excess <= 0) break;
    }
  }
  return disbanded;
}

/** Veterancy dies with the veterans. Discharging costs half as much per head —
 *  you keep some of what they knew. */
export function decayExperience(current: number, lost: number, before: number, factor: number): number {
  if (before <= 0 || lost <= 0) return current;
  return Math.max(0, current * (1 - factor * Math.min(1, lost / before)));
}

/** Regulars of the battle line, for veterancy decay. */
export const lineRegulars = (p: Player): number =>
  troopTotal(p.army.footmen) + troopTotal(p.army.archers) + troopTotal(p.army.cavalry);
