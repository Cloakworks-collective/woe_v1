// The daily reset: peasant recruitment, then the scattering check
// (spec/empire.md growth model, spec/combat.md scattering).

import {
  CIVILIAN_LEVELLED_IDS,
  HOUSING_PER_HEARTHSTEAD,
  POP_GROWTH,
  RESOURCE_BUILDING_IDS,
  SCATTERING,
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

/** WALLS — scaled by integrity, so rubble reassures nobody until it is rebuilt.
 *  This is what the old flat WALL_DAMAGE_POP_PENALTY used to express, now paid
 *  out of the term it actually concerns instead of docking the whole intake. */
export function wallsGrowth(p: Player): number {
  return Math.ceil(level(p, "walls") * POP_GROWTH.WALLS_PER_LEVEL * p.wallIntegrity);
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
  const roofs = Math.floor(
    level(p, "hearthstead") * HOUSING_PER_HEARTHSTEAD * buildingIntegrity(p, "hearthstead"),
  );
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
  return Math.max(0, Math.min(popPerDay(p), vacantHousing(p)));
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
  const arrived = Math.min(averagedArrivals(p), vacantHousing(p));
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
