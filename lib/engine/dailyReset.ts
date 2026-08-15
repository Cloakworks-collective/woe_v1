// The daily reset: peasant recruitment, then the scattering check
// (spec/empire.md growth model, spec/combat.md scattering).

import {
  CIVILIAN_LEVELLED_IDS,
  HOUSING_PER_HEARTHSTEAD,
  POP_GROWTH,
  RESOURCE_BUILDING_IDS,
  SCATTERING,
  SCORE,
} from "../constants";
import {
  buildingIntegrity,
  civilians,
  level,
  guardStrength,
  military,
  totalPopulation,
  type EngineResult,
  type Player,
} from "./types";

/** Sum of all 13 civilian building levels (0–130). Kept for the Census and the
 *  settlement-title ladder; growth no longer reads it. */
export function civilianLevels(p: Player): number {
  return CIVILIAN_LEVELLED_IDS.reduce((sum, id) => sum + level(p, id), 0);
}

// ── Daily settler intake ────────────────────────────────────────────────────
// per day = BASE + safety + prosperity + walls, clamped to [MIN, MAX], then
// gated by vacant housing. See POP_GROWTH for why it is additive.

/** The guard-to-civilian ratio, which is what "do I feel safe here" reduces to.
 *  Mercenaries count: a hired blade on the gate reassures a farmer too. */
export function guardRatio(p: Player): number {
  const civ = civilians(p);
  if (civ === 0) return guardStrength(p) > 0 ? Infinity : 0;
  return guardStrength(p) / civ;
}

/** SAFETY — cumulative tiers, so the first soldiers do most of the reassuring. */
export function safetyGrowth(p: Player): number {
  const ratio = guardRatio(p);
  return POP_GROWTH.SAFETY_TIERS.reduce((sum, t) => (ratio >= t.ratio ? sum + t.add : sum), 0);
}

/** PROSPERITY — one settler per level of the four RESOURCE buildings. Storage
 *  is excluded on purpose: a full granary is somewhere to put grain, not work. */
export function prosperityGrowth(p: Player): number {
  const levels = RESOURCE_BUILDING_IDS.reduce((sum, id) => sum + level(p, id), 0);
  return Math.min(POP_GROWTH.PROSPERITY_MAX, Math.ceil(levels * POP_GROWTH.PROSPERITY_PER_LEVEL));
}

/**
 * WALLS — and only walls somebody is standing on.
 *
 * Scaled by integrity, so rubble reassures nobody until it is rebuilt. That is
 * what the old flat WALL_DAMAGE_POP_PENALTY used to express, now paid out of the
 * term it actually concerns instead of docking the whole intake.
 *
 * AND scaled by the GARRISON, which is the part that was missing. The blurb has
 * always said settlers pay for stone they can stand behind — but the arithmetic
 * never checked whether anybody was standing behind it, so an empty Citadel drew
 * a third of an empire's daily intake for existing. That is the identical hole
 * `SCORE.WALL_TROOPS_PER_LEVEL` was added to close on the ladder ("build stone,
 * raise nobody, and the ladder called you strong"), left open on population —
 * and worse here, because settlers compound into workers, gold and more wall.
 *
 * It reuses the SAME constant deliberately. Two independent manning bars would
 * drift, and a player who garrisons to satisfy one should satisfy the other.
 *
 * REGULARS ONLY, matching the score. The safety term above counts sellswords on
 * purpose — a hired blade on the gate reassures a farmer — but a wall is held,
 * not merely watched, and a contract that ends when its regulars die is not a
 * garrison. Note the two terms therefore read the muster differently, which is
 * intended: `guardRatio` uses `guardStrength`, this uses `military`.
 */
export function wallsGrowth(p: Player): number {
  const lvl = level(p, "walls");
  if (lvl <= 0) return 0;
  return Math.ceil(
    lvl * POP_GROWTH.WALLS_PER_LEVEL * p.wallIntegrity * wallManning(p),
  );
}

/** How much of the wall is actually held, 0–1. Full credit at
 *  SCORE.WALL_TROOPS_PER_LEVEL regulars per level, pro rata below it. */
export function wallManning(p: Player): number {
  const lvl = level(p, "walls");
  const need = lvl * SCORE.WALL_TROOPS_PER_LEVEL;
  if (lvl <= 0 || need <= 0) return 1;
  return Math.min(1, military(p) / need);
}

/** The four components, for the dashboard breakdown. */
export function growthBreakdown(p: Player): {
  base: number;
  safety: number;
  prosperity: number;
  walls: number;
  total: number;
} {
  const base = POP_GROWTH.BASE;
  const safety = safetyGrowth(p);
  const prosperity = prosperityGrowth(p);
  const walls = wallsGrowth(p);
  const total = Math.min(
    POP_GROWTH.MAX,
    Math.max(POP_GROWTH.MIN, base + safety + prosperity + walls),
  );
  return { base, safety, prosperity, walls, total };
}

/**
 * Beds with nobody in them — the cap on tomorrow's settlers.
 *
 * Bombardment does NOT evict anyone. Peasants already under a roof stay put
 * even when half the roofs are gone; what falls is CAPACITY. A town shelled to
 * 60% and already full simply takes no new arrivals until the roofs are mended,
 * and the empire's growth stalls without a single peasant lost. That makes the
 * Hearthstead a slow strangling rather than a massacre — see BOMBARDABLE.
 */
export function vacantHousing(p: Player): number {
  return Math.max(0, standingHousing(p) - civilians(p));
}

/** Every bed the empire has BUILT, whether or not it still has a roof. */
export function housingBuilt(p: Player): number {
  return level(p, "hearthstead") * HOUSING_PER_HEARTHSTEAD;
}

/** Beds still standing after bombardment. */
export function standingHousing(p: Player): number {
  return Math.floor(housingBuilt(p) * buildingIntegrity(p, "hearthstead"));
}

/**
 * The cap the day's INTAKE is measured against — which is not always the same
 * as the beds actually standing.
 *
 * A bombard that lands while the ruler is asleep would otherwise dock every
 * sample until dawn, and the only defence would be never sleeping. So burnt
 * roofs do not count against recruitment until the regent has been back to see
 * them: while `roofDamageUnseen` is set the samples are capped by the beds you
 * BUILT, and the moment you log in — any page, any command — the real cap
 * takes over and the damage bites in full.
 *
 * This buys a night's sleep, not an exemption. It is deliberately generous
 * while you are away and deliberately unforgiving once you are back: the answer
 * to a burnt Hearthstead is to mend it, and you cannot mend it in your sleep.
 *
 * Bots are excluded. They are seeded targets that never act and never log in,
 * so the flag would latch on the first bombard and never clear — leaving them
 * permanently immune to the one thing shelling their housing is meant to do.
 * The mercy is for people who need to sleep; a bot does not.
 */
export function intakeHousing(p: Player): number {
  const asleep = p.roofDamageUnseen === true && !p.isBot;
  const roofs = asleep ? housingBuilt(p) : standingHousing(p);
  return Math.max(0, roofs - civilians(p));
}

/** Peasants that would arrive today, before the housing cap. */
export function popPerDay(p: Player): number {
  return growthBreakdown(p).total;
}

// ── The 24-hour average ─────────────────────────────────────────────────────
//
// Settlers are NOT decided by one reading taken at dawn. Every tick records
// what would actually have landed at that moment — already capped by free beds
// — and dawn pays out the average of the day's samples.
//
// The cap has to be inside the sample, not applied to the average, and that is
// the whole point. Paying on a dawn reading makes the last minute before dawn
// the only minute that matters: buy Hearthsteads at 23:59 and collect a full
// day's intake you had no room for all day. Averaging capped samples means an
// empire that was full for 143 ticks collects almost nothing today, and the
// full amount tomorrow — the beds have to be there while the settlers arrive.

/** What would actually land right now: the day's rate, capped by free beds, and
 *  zero while the empire is starving or in unrest. One sample. */
export function arrivalsNow(p: Player, currentTick: number): number {
  if (p.starving) return 0;
  if ((p.unrestUntilTick ?? 0) > currentTick) return 0;
  return Math.max(0, Math.min(popPerDay(p), intakeHousing(p)));
}

/** Record this tick's sample. Called once per tick, from processTurnTick. */
export function sampleGrowth(p: Player, currentTick: number): void {
  p.growthSum = (p.growthSum ?? 0) + arrivalsNow(p, currentTick);
  p.growthSamples = (p.growthSamples ?? 0) + 1;
}

/** The day's payout: the mean of its samples, rounded up. Divided by the
 *  samples actually taken rather than a flat 144, so an empire founded at
 *  dusk is not charged for the hours before it existed. */
export function averagedArrivals(p: Player): number {
  const n = p.growthSamples ?? 0;
  if (n <= 0) return 0;
  return Math.ceil((p.growthSum ?? 0) / n);
}

export function processDailyReset(input: Player, currentTick = 0): EngineResult {
  const p = structuredClone(input);
  const events: EngineResult["events"] = [];

  // 1. Recruitment — the average of the day's capped samples (see above), so
  //    what arrives reflects the beds and the garrison you kept ALL day, not
  //    whatever you owned in the last minute before dawn.
  const wanted = popPerDay(p);
  const arrived = Math.min(averagedArrivals(p), intakeHousing(p));
  p.idlePeasants += arrived;
  events.push({ type: "dailyRecruitment", arrived, turnedAway: Math.max(0, wanted - arrived) });
  // The ledger resets for the new day either way.
  p.growthSum = 0;
  p.growthSamples = 0;

  // 2. Scattering — civilians only stay where they feel protected.
  //    Empires below 500 total population are exempt.
  if (totalPopulation(p) >= SCATTERING.EXEMPT_BELOW_POPULATION) {
    const civ = civilians(p);
    const mil = guardStrength(p); // regulars AND sellswords — a hired blade on the gate reassures a farmer too
    if (mil < SCATTERING.TROOP_RATIO * civ) {
      const keep = Math.floor(mil / SCATTERING.TROOP_RATIO);
      let toLose = civ - keep;
      const lost = toLose;

      // Idle first…
      const fromIdle = Math.min(p.idlePeasants, toLose);
      p.idlePeasants -= fromIdle;
      toLose -= fromIdle;
      // …then workers…
      for (const role of [
        "farmers",
        "quarrymen",
        "miners",
        "lumberjacks",
        "merchants",
        "researchers",
      ] as const) {
        if (toLose === 0) break;
        const n = Math.min(p.workers[role], toLose);
        p.workers[role] -= n;
        toLose -= n;
      }
      // …then specialists.
      const fromSpies = Math.min(p.army.spies, toLose);
      p.army.spies -= fromSpies;
      toLose -= fromSpies;
      const fromScouts = Math.min(p.army.scouts, toLose);
      p.army.scouts -= fromScouts;
      toLose -= fromScouts;

      events.push({ type: "scattering", lost: lost - toLose });
    }
  }

  return { player: p, events };
}
