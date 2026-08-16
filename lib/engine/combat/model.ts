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
  COMBAT_TEMPO,
  DAMAGE_TAKEN,
  CASUALTY_SPLIT,
  CASUALTY_TIER_ORDER,
  EFFECTIVENESS,
  EFFECT_PER_LEVEL,
  EXPERIENCE,
  MEDICINE,
  MERCENARIES,
  RACES,
  REVENGE_BLOODLUST,
  SIEGE_ACCURACY,
  MAX_FIELD_LEVEL,
  SORTIE,
  STAMINA,
  UNIT_POWER,
  UNIT_STATS,
  WAR,
  WARWORKS_BONUS_PER_LEVEL,
  type TargetKind,
} from "../../constants";
import {
  bankedRes,
  level,
  mercsOfArm,
  regularsOfArm,
  researchLevel,
  troopTotal,
  veterancyBonus,
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

/** Which hired blades fell, by arm and tier — plus the engine crews.
 *  `SideLosses.mercenaries` is one flat total, which is all a report needs but
 *  not enough to put anybody back: the field hospital has to know whether it is
 *  reviving a light footman or a heavy horseman. Recorded as they die. */
/**
 * The dead, by arm and rank, kept for the field hospital.
 *
 * Both ledgers, because MEDICINE treats the critically wounded alike: a
 * surgeon pulling a man off the field does not first ask who was paying him.
 * They stay APART rather than summed because putting a man back costs
 * different things — a sellsword needs room under the hire cap, a regular is
 * population and needs a Muster Hall bed.
 */
export interface MercFallen {
  line: Partial<Record<Arm, Record<Tier, number>>>;
  engineers: number;
  /** Regulars who fell, by arm and rank. */
  regularLine: Partial<Record<Arm, Record<Tier, number>>>;
  /** Engineers of your own, as opposed to hired crews. */
  regularEngineers: number;
}

export const noMercFallen = (): MercFallen => ({
  line: {},
  engineers: 0,
  regularLine: {},
  regularEngineers: 0,
});

export interface Side {
  player: Player;
  home: boolean;
  groups: Group[];
  /** Engineers are never a battle group — they crew engines and they die in
   *  the duel, never to a cavalry charge. Tracked apart from the line. */
  engineers: number;
  mercEngineers: number;
  losses: SideLosses;
  /** Book-keeping for MEDICINE — see fieldHospital. */
  mercFallen: MercFallen;
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
  /** Riding out at the siege lines. */
  sortie?: boolean;
  /** Dug in around the engines. */
  entrenched?: boolean;
  /** Clan war doubles the blood. */
  war?: boolean;
  /** Answering a blow already struck against you — the avenging side only. */
  revenge?: boolean;
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
  // Bloodlust. Reaches the HIRED as well, on the same rule as a clan war: it is
  // the host's fury, and a sellsword marching in an avenging column marches in
  // the same column. Flip this above the `isMerc` return if it should be your
  // own people only.
  if (ctx.revenge) sum += REVENGE_BLOODLUST;

  // Hired blades stop here. No race, no veterancy — and no wall ROLE bonus,
  // which is a drilled position rather than a place to stand.
  if (ctx.isMerc) return 1 + sum;

  const race = RACES[p.race];

  // Race — a global stat modifier plus a per-arm one.
  sum += (ctx.kind === "attack" ? race.attack : race.defence) - 1;
  if (ctx.arm) sum += race.units[ctx.arm as TroopType] - 1;

  // Veterancy. +100% at POINTS_FOR_DOUBLE — and no ceiling above it, so a
  // legendary army really is worth more than a merely seasoned one.
  sum += veterancyBonus(p.army.experiencePoints);

  return 1 + sum;
}

// Imported lazily to keep the constant list at the top readable.
const SORTIE_CAVALRY_BONUS = () => SORTIE.CAVALRY_BONUS;
const ENTRENCHED = () => SORTIE.ENTRENCHED_BONUS;

/** Siege power carries its own veterancy and its own research. Engineers get
 *  better at their trade whether they are pushing engines forward or manning
 *  them on the wall — one corps, one stat. */
export function siegeBonusPool(p: Player, war: boolean): number {
  let sum = 0;
  sum += RACES[p.race].siege - 1;
  sum += veterancyBonus(p.army.siegeExperiencePoints);
  sum += researchLevel(p, "siegecraft") * EFFECT_PER_LEVEL;
  if (war) sum += WAR.DAMAGE_BONUS; // clan war: +100% by default, and bombard reads this too
  return 1 + sum;
}

/**
 * The ENGINEERS' ledger, run on the same rules as the battle line's.
 *
 * Credited for the crews you killed, debited for the crews you lost, scaled by
 * how the matchup sat and whether you carried the day. Engineers are a small
 * corps, so the numbers here are small — a siege is seasoning won a handful of
 * men at a time, over a campaign.
 *
 * Shared by resolveBattle and resolveBombard so a siege trains a corps the same
 * way whichever end of it you were on.
 */
export function siegeLedger(
  crewsKilled: number,
  crewsLost: number,
  matchup: number,
  outcome: number,
): number {
  const gained = Math.min(
    EXPERIENCE.MAX_PER_BATTLE,
    crewsKilled * EXPERIENCE.PER_CASUALTY * matchup * outcome,
  );
  return gained - crewsLost * EXPERIENCE.PER_REGULAR_LOST;
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

/**
 * SIEGECRAFT's second half: the delivery gate, not the additive pool.
 *
 * The field does both jobs — it adds to `siegeBonusPool` like any other war
 * research AND interpolates how much of a trebuchet's power actually finds its
 * target. Those are opposite halves of the damage model (see the header), which
 * is why they were once two separate fields; but nobody ever built engines and
 * then declined to aim them, so the split was two prices for one idea.
 *
 * Because this half MULTIPLIES rather than adds, Siegecraft is the strongest
 * single pick a siege specialist can make — and now the only one they need.
 */
export function siegeDelivery(p: Player, target: TargetKind): number {
  const base = effectiveness("trebuchets", target);
  const band = target === "walls" ? SIEGE_ACCURACY.walls
    : target === "buildings" ? SIEGE_ACCURACY.buildings
    : target === "siege" ? SIEGE_ACCURACY.siege
    : null;
  if (!band) return base;
  const lvl = researchLevel(p, "siegecraft");
  return band.from + (band.to - band.from) * (lvl / MAX_FIELD_LEVEL);
}

/** The defender's counter-battery benefits from the same study — one field
 *  sharpens the engines you push forward and the ones on your own wall. */
export function counterBatteryDelivery(p: Player): number {
  const b = SIEGE_ACCURACY.counterBattery;
  return b.from + (b.to - b.from) * (researchLevel(p, "siegecraft") / MAX_FIELD_LEVEL);
}

// ── Building a side ─────────────────────────────────────────────────────────

export interface SideOptions {
  home: boolean;
  /** Wall edge already blended across the host by walls.ts (0 on a raid). */
  wallEdge: number;
  war: boolean;
  /** Raids are open-field: engineers stay home and take no part at all. */
  engineersPresent: boolean;
  /** Set on the AVENGING side of a revenge — REVENGE_BLOODLUST. */
  revenge?: boolean;
  /** Footmen (then cavalry, then archers) committed to pushing rams — they are
   *  not in the battle line until the wall is breached. */
  ramCrew?: Partial<Record<Arm, { merc: Record<Tier, number>; regular: Record<Tier, number> }>>;
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
    const atkCtx: BonusContext = { kind: "attack", arm, war: opts.war, isMerc, revenge: opts.revenge };
    // Everything EXCEPT the wall, which moves during the battle.
    const defCtx: BonusContext = {
      kind: "defence",
      arm,
      war: opts.war,
      isMerc,
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
      // Ram crews are on the beams, not in the line — and sellswords go on the
      // beams first, so both pools have to be netted off.
      const held = opts.ramCrew?.[arm];
      push(arm, tier, Math.max(0, p.army[src][tier] - (held?.regular[tier] ?? 0)), false);
      push(arm, tier, Math.max(0, p.army.mercenaries[src][tier] - (held?.merc[tier] ?? 0)), true);
    }
  }

  const side: Side = {
    player: p,
    home: opts.home,
    groups,
    engineers: opts.engineersPresent ? p.army.siegeEngineers : 0,
    mercEngineers: opts.engineersPresent ? p.army.mercenaries.engineers : 0,
    losses: emptyLosses(),
    mercFallen: noMercFallen(),
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

/**
 * Every block's headcount and per-man health at the moment the host formed up.
 *
 * A battle is decided by what each side LOST as a share of what it BROUGHT, and
 * both halves of that have to be priced at the muster. A defender's per-man
 * health falls during the fight as the wall comes down (setWallEdge), so
 * measuring the survivors at the closing price would read masonry damage as
 * casualties and hand the attacker a win for knocking over a gate.
 *
 * Caveat worth knowing: ram crews are held out of the line at muster and
 * rejoin at a breach, so a block can end with MORE men than it mustered. That
 * reads as zero loss for the block rather than a negative, which is the
 * conservative direction.
 */
export interface Muster {
  count: number;
  health: number;
}

export const muster = (s: Side): Muster[] =>
  s.groups.map((g) => ({ count: g.count, health: g.health }));

/** Share of the health it marched in with that this side has lost, 0–1. */
export function healthLostShare(s: Side, start: Muster[]): number {
  let brought = 0;
  let lost = 0;
  for (let i = 0; i < start.length; i++) {
    const m = start[i];
    brought += m.count * m.health;
    lost += Math.max(0, m.count - (s.groups[i]?.count ?? 0)) * m.health;
  }
  return brought <= 0 ? 0 : lost / brought;
}

export const totalPower = (s: Side): number =>
  s.groups.reduce((sum, g) => sum + g.count * g.power, 0);

export const totalHealth = (s: Side): number =>
  s.groups.reduce((sum, g) => sum + g.count * g.health, 0);

export const headcount = (s: Side): number => s.groups.reduce((sum, g) => sum + g.count, 0);

/** Heads in one arm, hired and raised alike. The SORTIE holds are counted in
 *  men rather than power: a hundred footmen distract two hundred riders whoever
 *  those riders are, because what a shield wall does is occupy people. */
export const armHeads = (s: Side, arm: Arm): number =>
  s.groups.reduce((n, g) => (g.arm === arm ? n + g.count : n), 0);

/** …and the whole line that can hold ground or ride out. Archers are not in it,
 *  for the same reason they are not in `fieldPower`. */
export const fieldHeads = (s: Side): number => armHeads(s, "footman") + armHeads(s, "cavalry");

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
  if (k > 0) {
    const ledger = g.isMerc ? side.mercFallen.line : side.mercFallen.regularLine;
    const byArm = (ledger[g.arm] ??= { light: 0, medium: 0, heavy: 0 });
    byArm[g.tier] += k;
  }
}

/**
 * THE CASUALTY RULE, and it is one rule for every blow in the game.
 *
 * Damage walks the tiers in order — LIGHT, then MEDIUM, then HEAVY — and at each
 * tier it splits CASUALTY_SPLIT.MERC_SHARE onto the sellswords standing there
 * and the remainder onto your own. Whatever a tier cannot absorb carries to the
 * next and is split again.
 *
 * Two things follow, and both are the point:
 *
 *   CHEAP RANKS ARE A REAL SHIELD. A tier holding sellswords and no regulars
 *   absorbs everything that reaches it, because the regulars' share has nobody
 *   to land on and simply carries forward. Twenty medium sellswords in front of
 *   a hundred heavy regulars is not a saving, it is armour.
 *
 *   BARE RANKS ARE A HOLE. A tier holding regulars and no sellswords takes the
 *   WHOLE blow on your own people — the screen's share cannot fall through to
 *   mercenaries of another rank. Screening is per rank, and the advisor shouts
 *   about a bare one for exactly this reason.
 *
 * This used to split first and walk tiers second, inside each pool separately,
 * which meant the 30% found your heavy regulars from the first exchange no
 * matter what stood in front of them — the cushion could not cushion.
 */
export function applyToArm(side: Side, arm: Arm, damage: number): number {
  let left = damage;
  for (const tier of CASUALTY_TIER_ORDER) {
    if (left <= 0) break;
    const merc = side.groups.find((g) => g.arm === arm && g.tier === tier && g.isMerc && g.count > 0);
    const reg = side.groups.find((g) => g.arm === arm && g.tier === tier && !g.isMerc && g.count > 0);
    // What it COSTS to wipe each pool out, which is more than its health: only
    // a share of a blow tells against a man who can turn one, so finishing
    // either group takes proportionally more damage than the pool suggests.
    // A regular dodges four blows in five, a hireling two in five.
    // ONE dodge for the arm, whoever is holding the weapon. A hired archer is
    // still an archer: hands full of bow, no shield, standing still to shoot.
    const dodge = DAMAGE_TAKEN[arm];
    const mercCapacity = merc ? (merc.count * merc.health) / dodge : 0;
    const regCapacity = reg ? (reg.count * reg.health) / dodge : 0;
    if (mercCapacity + regCapacity <= 0) continue;

    const toMerc = Math.min(left * CASUALTY_SPLIT.MERC_SHARE, mercCapacity);
    const toReg = Math.min(left - toMerc, regCapacity);
    if (merc && toMerc > 0) kill(side, merc, (toMerc * dodge) / merc.health);
    if (reg && toReg > 0) kill(side, reg, (toReg * dodge) / reg.health);
    left -= toMerc + toReg;
  }
  return damage - left;
}

/** Volleys and engine fire, which do not choose an ARM — spread by headcount,
 *  then the screen absorbs within each arm exactly as it does for an aimed
 *  blow. Archers and engines used to bypass the screen entirely, which is how
 *  most damage in the game reached regulars without touching a sellsword. */
export function spreadDamage(target: Side, damage: number) {
  const total = headcount(target);
  if (total <= 0 || damage <= 0) return;
  for (const arm of ["footman", "archer", "cavalry"] as Arm[]) {
    const n = target.groups.reduce((s, g) => (g.arm === arm ? s + g.count : s), 0);
    if (n === 0) continue;
    applyToArm(target, arm, (n / total) * damage);
  }
}

/** Damage aimed at particular arms, in order — cavalry and the line, which do
 *  choose. Within an arm it is the same rule as everything else. */
export function aimDamage(target: Side, damage: number, order: Arm[]) {
  let left = damage;
  for (const arm of order) {
    if (left <= 0) return;
    left -= applyToArm(target, arm, left);
  }
}

/** Engineer casualties by the head — the duel kills this way, because a counter
 *  that overwhelms an engine kills the men standing at it and there is no
 *  fight to be had. Sellsword crews go first. */
export function killEngineers(side: Side, n: number) {
  let left = Math.max(0, Math.floor(n));
  const fromMerc = Math.min(side.mercEngineers, left);
  side.mercEngineers -= fromMerc;
  side.losses.mercenaries += fromMerc;
  side.mercFallen.engineers += fromMerc;
  left -= fromMerc;
  const fromReg = Math.min(side.engineers, left);
  side.engineers -= fromReg;
  side.losses.engineers += fromReg;
  side.mercFallen.regularEngineers += fromReg;
}

/** Engineer casualties by DAMAGE — the rear-guard clash kills this way, because
 *  there the engineers are fighting back and a blow aimed at one may not land.
 *
 *  Same rule as every other arm: the sellsword crews take CASUALTY_SPLIT.
 *  MERC_SHARE of it, what they cannot absorb falls through to your own, and
 *  DAMAGE_TAKEN.engineer decides how much of a blow tells at all. Engineers
 *  carry the lowest number in that table — they are not turning blows, they
 *  are running, and most of them get away. */
export function damageEngineers(side: Side, damage: number): number {
  if (damage <= 0) return 0;
  const dodge = DAMAGE_TAKEN.engineer;
  const hp = UNIT_POWER.engineer.health;
  const mercCapacity = (side.mercEngineers * hp) / dodge;
  const regCapacity = (side.engineers * hp) / dodge;
  if (mercCapacity + regCapacity <= 0) return 0;

  const toMerc = Math.min(damage * CASUALTY_SPLIT.MERC_SHARE, mercCapacity);
  const toReg = Math.min(damage - toMerc, regCapacity);
  const mercDead = Math.min(side.mercEngineers, Math.floor((toMerc * dodge) / hp));
  const regDead = Math.min(side.engineers, Math.floor((toReg * dodge) / hp));

  side.mercEngineers -= mercDead;
  side.losses.mercenaries += mercDead;
  side.mercFallen.engineers += mercDead;
  side.engineers -= regDead;
  side.losses.engineers += regDead;
  side.mercFallen.regularEngineers += regDead;
  return mercDead + regDead;
}

/** The two things standing between a breakthrough and the engines, kept apart
 *  because a blow aimed at the rear guard has to divide between them. Both on
 *  the RAW power scale — `rearGuardPower` applies the tempo, and the share is a
 *  ratio, where the tempo would only cancel. */
const rearGuardParts = (s: Side) => {
  // Archers fight at a fraction of their power with horse already inside the
  // lines, and carry every bonus they normally would. Engineers carry NONE:
  // UNIT_POWER.engineer.power is a flat 10 a head, no research, no race, no
  // veterancy — they are not soldiers, they are crews with tools.
  const archers =
    s.groups.filter((g) => g.arm === "archer").reduce((sum, g) => sum + g.count * g.power, 0) *
    SORTIE.ARCHER_MELEE;
  const engineers = (s.engineers + s.mercEngineers) * UNIT_POWER.engineer.power;
  return { archers, engineers, total: archers + engineers };
};

/** What the rear guard brings to the third clash. This is the ONLY place either
 *  archers or engineers are read as a fighting force — `fieldPower` still counts
 *  footmen and cavalry alone. */
export const rearGuardPower = (s: Side): number =>
  // COMBAT_TEMPO, exactly as `armPower` applies it. Without it this sum sits on
  // the RAW power scale while every other blow in the sortie is tempo'd, and
  // the rear guard fights the breakthrough at ten times its true weight.
  rearGuardParts(s).total * COMBAT_TEMPO;

/** …and how that power divides between the two, which is how a blow aimed at
 *  the rear guard divides between them: the ones swinging hardest draw it. */
export const rearGuardArcherShare = (s: Side): number => {
  const { archers, total } = rearGuardParts(s);
  return total > 0 ? archers / total : 0;
};

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

// ── Medicine: the field hospital ────────────────────────────────────────────

/**
 * Pull a share of the fallen sellswords off the field alive.
 *
 * Only the DEFENDER's, and only sellswords — see the MEDICINE block in
 * balance.ts for why both restrictions are load-bearing rather than flavour.
 *
 * Runs AFTER `settleMercenaries`, and clamped to the room the cap leaves. Order
 * matters: revive first and the cascade would immediately pay off anybody there
 * are no longer regulars to command, so the surgeons would spend food saving
 * men who ride away the same afternoon. Reviving into the room that actually
 * exists never wastes a sack of grain.
 *
 * Treatment is PARTIAL when the granary is short — a store that covers three of
 * five saves three. Vaulted food counts: a field hospital may open the stores.
 *
 * Mutates `p` (callers hold a clone) and returns how many were saved, for the
 * report.
 */
export function fieldHospital(
  p: Player,
  fallen: MercFallen,
  level: number,
): {
  recovered: number;
  regulars: number;
  hired: number;
  foodSpent: number;
  /** Saved regulars BY ARM, plus the crews — so the caller can take them back
   *  off the right line of the losses ledger. Crediting a saved horseman to the
   *  footmen would leave the report and the surviving army disagreeing, which is
   *  the exact fault this whole rework is fixing. */
  regularsByArm: Record<Arm, number>;
  regularEngineers: number;
} {
  const noArms = (): Record<Arm, number> => ({ footman: 0, archer: 0, cavalry: 0 });
  const none = {
    recovered: 0, regulars: 0, hired: 0, foodSpent: 0,
    regularsByArm: noArms(), regularEngineers: 0,
  };
  if (level <= 0) return none;

  const tiers: Tier[] = ["heavy", "medium", "light"];
  const ARMS: Arm[] = ["cavalry", "footman", "archer"];
  // Heaviest first: they are the dearest to replace and the ones a player would
  // choose to save. The cheap ranks died first, so this is also the reverse of
  // the order they fell in — the surgeons reach the back line.
  const line = (ledger: MercFallen["line"]) => {
    const q: { arm: Arm; tier: Tier }[] = [];
    for (const tier of tiers) {
      for (const arm of ARMS) {
        for (let i = 0; i < (ledger[arm]?.[tier] ?? 0); i++) q.push({ arm, tier });
      }
    }
    return q;
  };
  const regQueue = line(fallen.regularLine);
  const mercQueue = line(fallen.line);
  const regFallen = regQueue.length + fallen.regularEngineers;
  const mercFallen = mercQueue.length + fallen.engineers;
  if (regFallen + mercFallen === 0) return none;

  /**
   * TWO BUDGETS, NOT ONE — and this is the whole point of the rule.
   *
   * The share is worked out for your own dead and the hired dead SEPARATELY.
   * Pooling them meant a screen dying in bulk bought a recovery budget far
   * larger than the regular casualties it was spent on, so with regulars drawn
   * first from a single queue, a big enough sellsword massacre recovered EVERY
   * regular who fell. Your own people were being saved by other men dying,
   * which is precisely backwards.
   *
   * The floor applies per pool for the same reason it exists at all: a share of
   * a small skirmish rounds to nothing, and that is as true of five dead
   * regulars as of five dead sellswords.
   */
  const budget = (n: number) =>
    n <= 0
      ? 0
      : Math.min(n, Math.max(MEDICINE.MIN_PER_LEVEL * level, Math.round(n * MEDICINE.RECOVER_PER_LEVEL * level)));
  const wantReg = budget(regFallen);
  const wantMerc = budget(mercFallen);

  // The surgeons may open the vault; a hospital that let men die beside a full
  // granary would be a strange hospital. ONE granary feeds both pools, so food
  // is the one thing they still compete for — and your own are treated first.
  const vault = { ...bankedRes(p) };
  const affordable = Math.floor((p.resources.food + vault.food) / MEDICINE.FOOD_PER_RECOVERY);
  let regulars = 0;
  let hired = 0;
  const regularsByArm = noArms();
  const spent = () => regulars + hired;
  const m = p.army.mercenaries;
  const ARM_KEY = { footman: "footmen", archer: "archers", cavalry: "cavalry" } as const;

  // ── Your own ──────────────────────────────────────────────────────────────
  const ownCrews = Math.min(fallen.regularEngineers, wantReg, affordable);
  if (ownCrews > 0) {
    p.army.siegeEngineers += ownCrews;
    regulars += ownCrews;
  }
  for (const { arm, tier } of regQueue) {
    if (regulars >= wantReg || spent() >= affordable) break;
    // NO bed check. A revived regular is going back into the bunk they vacated
    // ten minutes ago — they died out of it, so putting them back cannot
    // overfill the hall.
    p.army[ARM_KEY[arm]][tier] += 1;
    regularsByArm[arm] += 1;
    regulars += 1;
  }

  // ── The hired ─────────────────────────────────────────────────────────────
  const engineerRoom = mercRoom(p, "engineer");
  const engineers = Math.min(fallen.engineers, wantMerc, affordable - spent(), engineerRoom);
  if (engineers > 0) {
    m.engineers += engineers;
    hired += engineers;
  }
  for (const { arm, tier } of mercQueue) {
    if (hired >= wantMerc || spent() >= affordable) break;
    if (mercRoom(p, arm) <= 0) continue; // no regulars left to command them
    m[ARM_KEY[arm]][tier] += 1;
    hired += 1;
  }

  const recovered = spent();
  const foodSpent = recovered * MEDICINE.FOOD_PER_RECOVERY;
  const fromLoose = Math.min(p.resources.food, foodSpent);
  p.resources.food -= fromLoose;
  if (foodSpent - fromLoose > 0) {
    vault.food -= foodSpent - fromLoose;
    p.bankedResources = vault;
  }
  return { recovered, regulars, hired, foodSpent, regularsByArm, regularEngineers: ownCrews };
}

/** How many more sellswords of this arm the CAP_RATIO leaves room for. */
function mercRoom(p: Player, arm: MercArm): number {
  return Math.max(0, Math.floor(regularsOfArm(p, arm) * MERCENARIES.CAP_RATIO) - mercsOfArm(p, arm));
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
