// Read-only selectors for the UI: production rates, settlement title,
// and the four advisors (spec/architecture.md Advisor System).

import {
  EFFECT_PER_LEVEL,
  HOUSING_PER_HEARTHSTEAD,
  MAX_FIELD_LEVEL,
  RACES,
  SETTLEMENT_TITLES,
  SLOTS_PER_BUILDING_LEVEL,
  STORAGE_BUILDING,
  STORAGE_PER_LEVEL,
  TROOPS_PER_MUSTER_HALL,
  WALL_BONUS_PER_LEVEL,
  WALL_NAMES,
  WAR_FOUNDRY_LADDER,
  catchableOpLevel,
  maxLevel,
} from "../constants";
import type { BuildingId } from "../constants/buildings";
import type { ResearchField } from "../constants/research";
import { civilianLevels, popPerDay, vacantHousing } from "./dailyReset";
import { baseOutputPerProducer, effectiveProducers, foodUpkeepPerTurn, taxIncomePerTurn } from "./tick";
import {
  buildingIntegrity,
  civilians,
  level,
  military,
  researchLevel,
  totalPopulation,
  type Player,
  type Resource,
  type WorkerRole,
} from "./types";

const LINES: { role: WorkerRole; building: BuildingId; resource: Resource; field: ResearchField }[] = [
  { role: "farmers", building: "grange", resource: "food", field: "crop_rotation" },
  { role: "lumberjacks", building: "sawyers_mill", resource: "wood", field: "forestry" },
  { role: "quarrymen", building: "masons_quarry", resource: "stone", field: "masonry" },
  { role: "miners", building: "deepvein_mine", resource: "ore", field: "deep_smelting" },
];

export function productionRates(p: Player): Record<Resource, number> {
  const base = baseOutputPerProducer(p);
  const race = RACES[p.race];
  const out = { food: 0, wood: 0, stone: 0, ore: 0 };
  for (const { role, building, resource, field } of LINES) {
    const n = effectiveProducers(p, role, building);
    const fieldMult = 1 + researchLevel(p, field) * EFFECT_PER_LEVEL;
    out[resource] = n * base * race.production[resource] * fieldMult * buildingIntegrity(p, building);
  }
  return out;
}

export function researchRate(p: Player): number {
  return (
    effectiveProducers(p, "researchers", "collegium") *
    baseOutputPerProducer(p) *
    buildingIntegrity(p, "collegium")
  );
}

export function settlementTitle(p: Player): string {
  const L = civilianLevels(p);
  let title = SETTLEMENT_TITLES[0].title as string;
  for (const t of SETTLEMENT_TITLES) if (L >= t.min) title = t.title;
  return title;
}

/** Qualitative army-size descriptor for the public ladder — what a traveler
 *  could tell at a glance, never the exact count (spies are the intel path).
 *  Banded by the military share of total population; "Moderate" straddles the
 *  30% scattering line. */
export function troopStrengthLabel(p: Player): string {
  const pop = totalPopulation(p);
  if (pop === 0) return "None";
  const share = military(p) / pop;
  if (share < 0.05) return "None";
  if (share < 0.15) return "Weak";
  if (share < 0.3) return "Moderate";
  if (share < 0.5) return "Strong";
  return "Heavy";
}

export function wallName(p: Player): string {
  return WALL_NAMES[level(p, "walls")] || "No walls";
}

export function protectedCapacity(p: Player, r: Resource): number {
  const building = STORAGE_BUILDING[r];
  return STORAGE_PER_LEVEL * level(p, building) * buildingIntegrity(p, building);
}

// ── Public battle view (the War Ledger) ─────────────────────────────────────
// What ANY player may see of a battle: who, mode, victor, aggregate losses,
// gear destroyed, wall/storage damage. Composition (per-class losses), loot,
// stamina/XP, and the narrated log stay participant-only — an army's makeup
// is intelligence you pay spies for.

export interface PublicBattle {
  id: string;
  tick: number;
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  mode: string;
  victor: "attacker" | "defender" | "none";
  rounds: number;
  attackerTroopsLost: number; // aggregate — composition stays secret
  defenderTroopsLost: number;
  attackerGearLost: number; // pieces of siege equipment destroyed
  wallDamage: number; // fraction of the defender's wall destroyed
  buildingsHit: number; // count of town buildings a bombard cracked open
}

export function publicBattle(r: import("./types").BattleReport): PublicBattle {
  const total = (l: import("./types").UnitLosses) =>
    l.footmen + l.archers + l.cavalry + l.engineers + l.warriors + l.mercenaries;
  const gear = Object.values(r.siegeGearLost).reduce((a, b) => a + (b ?? 0), 0);
  return {
    id: r.id,
    tick: r.tick,
    attackerId: r.attackerId,
    attackerName: r.attackerName,
    defenderId: r.defenderId,
    defenderName: r.defenderName,
    mode: r.mode,
    victor: r.victor,
    rounds: r.rounds,
    attackerTroopsLost: total(r.attackerLosses),
    defenderTroopsLost: total(r.defenderLosses),
    attackerGearLost: gear,
    wallDamage: r.wallIntegrityDamage,
    buildingsHit: r.buildingDamage?.length ?? 0,
  };
}

export interface AdvisorReport {
  defensive: string;
  military: string;
  economic: string;
  population: string;
}

export function advisorReport(p: Player): AdvisorReport {
  const civ = civilians(p);
  const mil = military(p);
  const wallLvl = level(p, "walls");
  const wallBonus = wallLvl * 10;

  // ── Defensive ──────────────────────────────────────────────────────────
  let defensive: string;
  if (wallLvl === 0) {
    defensive =
      "We stand undefended, sire — not one course of stone rings the town, so a siege reaches us at full force. Raise The Walls (Buildings → Military): even a Timber Palisade adds +10% to every defender, and each level makes storming us costlier.";
  } else if (p.wallIntegrity < 0.7) {
    defensive =
      `The ${wallName(p)} is battered to ${Math.round(p.wallIntegrity * 100)}% — its defence bonus is cut to +${Math.round(wallBonus * p.wallIntegrity)}%, and damaged walls also frighten off up to half our daily settlers. Send the masons at once; a repair costs only half the damage.`;
  } else if (p.wallIntegrity < 1) {
    defensive =
      `The ${wallName(p)} took some knocks (${Math.round(p.wallIntegrity * 100)}%). Repair it when gold allows to restore the full +${wallBonus}% and stop settlers shying from the rubble. Otherwise it still stands proud.`;
  } else {
    defensive =
      `The ${wallName(p)} holds firm — +${wallBonus}% to our defenders. ${wallLvl < 10 ? "Another course of stone (and the War Foundry counters that pair with it) would make an enemy's engines break upon us." : "The Citadel is complete; keep the War Foundry counters current so their siege gear shatters against it."}`;
  }

  // ── Military ───────────────────────────────────────────────────────────
  const scatterLine = Math.ceil(0.3 * civ);
  const xpNote = p.army.experience >= 60
    ? `battle-hardened (+${p.army.experience}% combat power)`
    : p.army.experience > 0
      ? `seasoning nicely (+${p.army.experience}% power — veterancy dies with the veterans, so guard your regulars)`
      : "still green — every battle they survive makes them stronger";
  let military_: string;
  if (p.army.stamina < 40) {
    military_ =
      `The army is spent — stamina ${p.army.stamina}/100 drags down both attack and defence. Rest them (The Army → Rest: 5 turns + food for +20) before you march, or you'll bleed men in a fight you should win.`;
  } else if (mil < scatterLine && p.idlePeasants + civ >= 500) {
    military_ =
      `Danger: only ${mil} soldiers guard ${civ} civilians — below the ${scatterLine} needed to hold the 30% line. At the next dawn our unprotected peasants will scatter and walk away. Train warriors NOW to climb back above the line.`;
  } else {
    military_ =
      `${mil} under arms, stamina ${p.army.stamina}/100, and ${xpNote}. A sound force — pick fights within ±20% of your ranking score for the best experience; punching far below you costs XP and loot.`;
  }

  // ── Economic ───────────────────────────────────────────────────────────
  const rates = productionRates(p);
  const worst = (Object.entries(rates) as [Resource, number][]).sort((a, b) => a[1] - b[1])[0];
  const upkeep = foodUpkeepPerTurn(p);
  let economic: string;
  if (p.starving) {
    economic =
      "THE GRANARIES ARE EMPTY — production, research, taxes, growth, and attacks are all frozen. Nothing else matters: buy food at the Grand Bazaar or assign farmers this instant. Recovery takes one fed tick.";
  } else if (rates.food < upkeep) {
    economic =
      `We are eating into our stores — food yields ${rates.food.toFixed(0)}/turn against ${upkeep.toFixed(0)}/turn eaten. Assign more farmers (The Grange, 20 slots/level) or buy food before the granaries run dry and the empire freezes.`;
  } else {
    const tax = Math.round(p.taxRate * 100);
    economic =
      `Our thinnest yield is ${worst[0]} at ${worst[1].toFixed(0)}/turn — raise its building or assign more workers (capped at 20 per level). Tax sits at ${tax}%: lower it to pour effort into production, raise it to bank gold for war. Statecraft research softens that trade-off.`;
  }

  // ── Population ─────────────────────────────────────────────────────────
  const vacant = vacantHousing(p);
  const perDay = popPerDay(p);
  let population: string;
  if (vacant < perDay) {
    population =
      `Housing is the bottleneck: ${perDay} settlers arrive each dawn but only ${vacant} beds stand empty — the other ${perDay - vacant} find no roof and walk on, lost forever. Raise Hearthsteads ahead of the crowd; arrivals are never queued.`;
  } else if (perDay <= 5) {
    population =
      `Growth is a trickle at ${perDay}/day. Every civilian building level speeds the tide (~+0.76/day each), so invest across the whole civilian tree — all 13 at level 10 reaches 100/day. ${vacant} beds stand ready.`;
  } else {
    population =
      `${perDay} settlers arrive daily with ${vacant} beds free — healthy growth. Keep building housing a step ahead of the curve so no settler is ever turned away, and raise your production buildings to quicken the flow.`;
  }

  return { defensive, military: military_, economic, population };
}

// ── "What does the next level give me?" (Buildings page) ─────────────────────

const PRODUCER_WORD: Partial<Record<BuildingId, string>> = {
  grange: "farmer",
  masons_quarry: "quarryman",
  deepvein_mine: "miner",
  sawyers_mill: "lumberjack",
  market_square: "merchant",
  collegium: "scholar",
  shadow_guild: "spy",
  rangers_lodge: "scout",
};

const STORAGE_WORD: Partial<Record<BuildingId, string>> = {
  granary: "food",
  timberyard: "wood",
  masons_yard: "stone",
  ironhold: "ore",
  counting_house: "gold",
};

const TIER_WORD = ["", "light", "medium", "heavy"];
const num = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * A plain-English promise of what raising this building one level delivers —
 * "20 → 40 farmer jobs", "sheltered gold 40,000 → 60,000", etc. Returns null
 * at max level.
 */
export function buildingUpgradeBenefit(p: Player, id: BuildingId): string | null {
  const cur = level(p, id);
  const next = cur + 1;
  if (next > maxLevel(id)) return null;

  // Slot-based civilian buildings.
  const word = PRODUCER_WORD[id];
  if (word) {
    const jobs = `${SLOTS_PER_BUILDING_LEVEL * cur} → ${SLOTS_PER_BUILDING_LEVEL * next}`;
    if (id === "market_square") {
      return `${jobs} merchant jobs, and each caravan carries ${num(cur * 1000)} → ${num(next * 1000)} goods`;
    }
    if (id === "collegium") {
      const unlocks = next % 2 === 1 ? ` — unlocks tier ${(next + 1) / 2} of research` : "";
      return `${jobs} scholar jobs${unlocks}`;
    }
    if (id === "rangers_lodge") {
      return `${jobs} scout jobs, and now catches enemy spy ops up to level ${catchableOpLevel(next) || 0}`;
    }
    return `${jobs} ${word} jobs`;
  }

  const stored = STORAGE_WORD[id];
  if (stored) {
    return `shelters ${stored} ${num(STORAGE_PER_LEVEL * cur)} → ${num(STORAGE_PER_LEVEL * next)} from raiders`;
  }

  if (id === "hearthstead") return `housing for ${num(cur * HOUSING_PER_HEARTHSTEAD)} → ${num(next * HOUSING_PER_HEARTHSTEAD)} people`;
  if (id === "muster_hall") return `bunks for ${num(cur * TROOPS_PER_MUSTER_HALL)} → ${num(next * TROOPS_PER_MUSTER_HALL)} troops`;

  if (id === "drill_yard") return `lets you arm ${TIER_WORD[next]} footmen`;
  if (id === "fletchers_range") return `lets you arm ${TIER_WORD[next]} archers`;
  if (id === "knights_stables") return `lets you raise ${TIER_WORD[next]} cavalry`;
  if (id === "forge") return `stocks ${TIER_WORD[next]} weapons & armour (arms your ${TIER_WORD[next]} troops)`;

  if (id === "walls") {
    return `wall defence +${Math.round(cur * WALL_BONUS_PER_LEVEL * 100)}% → +${Math.round(next * WALL_BONUS_PER_LEVEL * 100)}% for every defender`;
  }

  if (id === "war_foundry") {
    const step = WAR_FOUNDRY_LADDER[next - 1];
    if (!step) return null;
    return step.side === "offense"
      ? `unlocks the ${step.name} — a new siege weapon to forge`
      : `installs ${step.name} — a permanent wall defence that cripples enemy ${step.counters}`;
  }
  return null;
}

/** Research: what this field does now, and at its next level. */
export function researchLevelEffect(field: ResearchField, curLevel: number): string {
  const cur = curLevel * 20;
  const next = Math.min(MAX_FIELD_LEVEL, curLevel + 1) * 20;
  if (curLevel >= MAX_FIELD_LEVEL) return `Mastered — the full +${cur}% is yours.`;
  return `Now +${cur}% → +${next}% at level ${curLevel + 1}.`;
}
