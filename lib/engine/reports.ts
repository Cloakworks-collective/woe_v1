// Read-only selectors for the UI: production rates, settlement title,
// and the four advisors (spec/architecture.md Advisor System).

import { TURN_MINUTES } from "../constants";
import {
  EFFECT_PER_LEVEL,
  HOUSING_PER_HEARTHSTEAD,
  MAX_FIELD_LEVEL,
  RACES,
  SETTLEMENT_TITLES,
  researchOutputAtLevel,
  workerOutputAtLevel,
  STORAGE_BUILDING,
  CARAVAN_CAPACITY_PER_MARKET_LEVEL,
  shelterAtLevel,
  TROOPS_PER_MUSTER_HALL,
  wallBonusAtLevel,
  WALL_NAMES,
  WARWORKS_BONUS_PER_LEVEL,
  WAR_FOUNDRY_LADDER,
  GUILD_BONUS_PER_LEVEL,
  LODGE_BONUS_PER_LEVEL,
  VACATION_PRODUCTION_FACTOR,
  VACATION_RESEARCH_FACTOR,
  maxLevel,
} from "../constants";
import type { BuildingId } from "../constants/buildings";
import type { ResearchField } from "../constants/research";
import { civilianLevels, popPerDay, vacantHousing } from "./dailyReset";
import { caravanDeliveryTurns } from "./marketOps";
import { foodUpkeepPerTurn, productionPerWorker, taxIncomePerTurn } from "./tick";
import {
  buildingIntegrity,
  civilians,
  level,
  military,
  researchLevel,
  shelterCapacity,
  totalPopulation,
  troopTotal,
  veterancyBonus,
  type Player,
  type Resource,
  type Tier,
  type WorkerRole,
} from "./types";

const LINES: { role: WorkerRole; building: BuildingId; resource: Resource; field: ResearchField }[] = [
  { role: "farmers", building: "grange", resource: "food", field: "crop_rotation" },
  { role: "lumberjacks", building: "sawyers_mill", resource: "wood", field: "forestry" },
  { role: "quarrymen", building: "masons_quarry", resource: "stone", field: "masonry" },
  { role: "miners", building: "deepvein_mine", resource: "ore", field: "deep_smelting" },
];

export function productionRates(p: Player): Record<Resource, number> {
  const race = RACES[p.race];
  const out = { food: 0, wood: 0, stone: 0, ore: 0 };
  // Vacation is folded into `per`, in the same place the tick folds it, so a
  // dormant town's projection is the number that actually lands. Leaving it out
  // used to overstate an absent ruler's harvest by half; at the current −80% it
  // would overstate it fivefold, which is not a rounding difference — it is the
  // difference between "my granary holds" and starving in your sleep.
  const vacationMult = p.onVacation ? VACATION_PRODUCTION_FACTOR : 1;
  for (const { role, building, resource, field } of LINES) {
    const n = p.workers[role]; // uncapped
    const per = productionPerWorker(p, building) * vacationMult; // level-scaled per-worker output
    const fieldMult = 1 + researchLevel(p, field) * EFFECT_PER_LEVEL;
    // Floored to match the tick exactly (see ROUNDING in tick.ts) — a projected
    // rate that doesn't equal what lands is worse than no projection.
    out[resource] = Math.floor(
      n * per * race.production[resource] * fieldMult * buildingIntegrity(p, building),
    );
  }
  return out;
}

export function researchRate(p: Player): number {
  // Researchers are uncapped; the Collegium level scales each scholar's output.
  // Vacation slows the Collegium by its own factor (a softer cut than the yards
  // take) — study is what an absent ruler leaves running.
  const vacationMult = p.onVacation ? VACATION_RESEARCH_FACTOR : 1;
  return Math.floor(
    p.workers.researchers *
      productionPerWorker(p, "collegium") *
      vacationMult *
      buildingIntegrity(p, "collegium"),
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

/** Sentence-ready wall name: "The Timber Palisade", but never "The The Barbican". */
export function theWallName(p: Player): string {
  const n = wallName(p);
  return n.startsWith("The ") ? n : `The ${n}`;
}

export function protectedCapacity(p: Player, r: Resource): number {
  const building = STORAGE_BUILDING[r];
  // Dispatched rather than assuming the goods curve. `Resource` excludes gold
  // today, so this is equivalent — but the Counting House is on its own curve
  // now, and this stays right if Resource ever grows to include coin.
  return shelterCapacity(p, building) * buildingIntegrity(p, building);
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
  /** The defender opened the gates rather than fight — the whole realm saw it. */
  yielded?: boolean;
  rounds: number;
  attackerTroopsLost: number; // aggregate — composition stays secret
  defenderTroopsLost: number;
  attackerGearLost: number; // pieces of siege equipment destroyed
  wallDamage: number; // fraction of the defender's wall destroyed
  buildingsHit: number; // count of town buildings a bombard cracked open
}

export function publicBattle(r: import("./types").BattleReport): PublicBattle {
  const total = (l: import("./types").UnitLosses) =>
    l.footmen + l.archers + l.cavalry + l.engineers + l.mercenaries;
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
    yielded: r.yielded,
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

export type LineArm = "footmen" | "archers" | "cavalry";
export const LINE_ARMS: readonly LineArm[] = ["footmen", "archers", "cavalry"];

/**
 * The RANKS of one arm that field regulars with no sellswords standing at that
 * same rank.
 *
 * Screening is per rank, not per arm. Damage walks light → medium → heavy and
 * splits at each rank onto the hired blades standing THERE — so a hundred heavy
 * footmen behind mercenaries who are all light are not screened, and every
 * blow that falls through to their rank lands on real population. This used to
 * be measured per ARM, which called that army covered.
 *
 * See CASUALTY_SPLIT.MERC_SHARE and CASUALTY_TIER_ORDER, and `applyToArm` in
 * combat/model.ts, which is the code this describes.
 */
export function bareTiers(p: Player, arm: LineArm): Tier[] {
  return (["light", "medium", "heavy"] as const).filter(
    (t) => p.army[arm][t] > 0 && p.army.mercenaries[arm][t] === 0,
  );
}

/** Arms with at least one bare rank — the arm-level roll-up of `bareTiers`,
 *  for the places that show one row per arm. */
export function bareArms(p: Player): LineArm[] {
  return LINE_ARMS.filter((a) => bareTiers(p, a).length > 0);
}

/** Every bare rank in the whole army, named for prose: "light footmen,
 *  heavy cavalry". One string per gap, so the reader knows where to spend. */
export function bareRankNames(p: Player): string[] {
  return LINE_ARMS.flatMap((a) => bareTiers(p, a).map((t) => `${t} ${a}`));
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
      `${theWallName(p)} is battered to ${Math.round(p.wallIntegrity * 100)}% — its defence bonus is cut to +${Math.round(wallBonus * p.wallIntegrity)}%, and damaged walls also frighten off up to half our daily settlers. Send the masons at once; a repair costs only half the damage.`;
  } else if (p.wallIntegrity < 1) {
    defensive =
      `${theWallName(p)} took some knocks (${Math.round(p.wallIntegrity * 100)}%). Repair it when gold allows to restore the full +${wallBonus}% and stop settlers shying from the rubble. Otherwise it still stands proud.`;
  } else {
    defensive =
      `${theWallName(p)} holds firm — +${wallBonus}% to our defenders. ${wallLvl < 10 ? "Another course of stone (and the Engine Yard counters that pair with it) would make an enemy's engines break upon us." : "The Citadel is complete; keep the Engine Yard counters current so their siege gear shatters against it."}`;
  }

  // ── Military ───────────────────────────────────────────────────────────
  const scatterLine = Math.ceil(0.3 * civ);
  const vetPct = veterancyBonus(p.army.experiencePoints) * 100;
  const xpNote = vetPct >= 20
    ? `battle-hardened (+${vetPct.toFixed(1)}% combat power)`
    : vetPct > 0
      ? `seasoning nicely (+${vetPct.toFixed(1)}% power — every regular who falls costs you points, so screen them)`
      : "still green — every battle they survive makes them stronger";
  let military_: string;
  if (p.army.stamina < 40) {
    military_ =
      `The army is spent — stamina ${p.army.stamina}/100 drags down both attack and defence. Rest them (The Army → Rest: 5 turns + food for +20) before you march, or you'll bleed men in a fight you should win.`;
  } else if (mil < scatterLine && p.idlePeasants + civ >= 500) {
    military_ =
      `Danger: only ${mil} soldiers guard ${civ} civilians — below the ${scatterLine} needed to hold the 30% line. At the next dawn our unprotected peasants will scatter and walk away. Raise troops NOW to climb back above the line.`;
  } else if (bareRankNames(p).length > 0) {
    military_ =
      `Our ${bareRankNames(p).join(", ")} stand BARE — no hired blade at that RANK, and the screen is per rank: damage walks light → medium → heavy and splits where it lands, so sellswords of another tier cannot cover them. Every blow that reaches those ranks lands on our own people, and dead regulars are the one loss we never get back. Hire the screen where the gap is, before the next raid.`;
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
  } else if (p.workers.researchers > 0 && !p.research?.activeField) {
    economic =
      `${p.workers.researchers} scholars sit in the Collegium studying NOTHING — with no field chosen the turn banks no points at all, so their work is not slow, it is thrown away. Choose any field (Research) and it starts landing next turn.`;
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

/** The Council Chamber's bulleted counsel — several short, numbered advises per
 *  advisor, drawn from the same live figures as the one-line advisorReport
 *  (which the top-of-page banners and the API keep using). */
export interface AdvisorCounsel {
  defensive: string[];
  military: string[];
  economic: string[];
  population: string[];
}

export function advisorCounsel(p: Player): AdvisorCounsel {
  const civ = civilians(p);
  const mil = military(p);
  const wallLvl = level(p, "walls");
  const wallBonus = wallBonusAtLevel(wallLvl) * 100;
  const n = (x: number) => Math.floor(x).toLocaleString("en-US");

  // ── Defensive ──
  const defensive: string[] = [];
  if (wallLvl === 0) {
    defensive.push("Not one course of stone rings the town — raise The Walls; even a Timber Palisade adds +10% to every defender.");
  } else if (p.wallIntegrity < 1) {
    defensive.push(`${theWallName(p)} stands at ${Math.round(p.wallIntegrity * 100)}% — its bonus is cut to +${Math.round(wallBonus * p.wallIntegrity)}%, and rubble scares off up to half the daily settlers. Repair costs only half the damage.`);
  } else {
    defensive.push(`${theWallName(p)} holds firm — +${Math.round(wallBonus)}% to every defender${wallLvl < 10 ? "; another course of stone would raise it further" : ""}.`);
  }
  const countersBuilt = Object.values(p.army.siegeCounters ?? {}).reduce((a, b) => a + b, 0);
  defensive.push(
    countersBuilt === 0
      ? "No defensive counters stand on the ramparts — each crewed one cancels an enemy siege engine outright (Siege Works → Ramparts)."
      : `${n(countersBuilt)} defensive counters built — your engineers man them when you defend, each cancelling one enemy engine.`,
  );
  if (p.gold > 10000) {
    defensive.push(`${n(p.gold)} gold lies loose on the table — bank it in the Counting House before a siege takes it.`);
  }

  // ── Military ──
  const militaryB: string[] = [];
  const scatterLine = Math.ceil(0.3 * civ);
  militaryB.push(
    mil < scatterLine
      ? `Only ${n(mil)} soldiers guard ${n(civ)} civilians — below the ${n(scatterLine)} the 30% line demands. Unguarded peasants scatter at dawn: raise troops now.`
      : `${n(mil)} under arms against a guard line of ${n(scatterLine)} — the peasants sleep sound.`,
  );
  militaryB.push(
    p.army.stamina < 40
      ? `Stamina ${p.army.stamina}/100 — the army is spent and swings weak. Rest them before you march.`
      : `Stamina ${p.army.stamina}/100 — fit to march. Fights within ±20% of your strength season the army fastest.`,
  );
  if (p.army.experiencePoints > 0) {
    militaryB.push(
      `Experience ${Math.round(p.army.experiencePoints).toLocaleString("en-US")} points — +${(veterancyBonus(p.army.experiencePoints) * 100).toFixed(1)}% to power AND health. Killing regulars earns it; losing your own spends it.`,
    );
  }
  // Screening is per RANK, not per arm — see `bareTiers`, which is the one
  // definition of that and is shared with the advisor prose and the UI badges.
  const bare = bareRankNames(p);
  if (bare.length > 0) {
    militaryB.push(
      `Your ${bare.join(", ")} stand bare — no hired blades at that rank. Damage splits per RANK, so these take the whole blow on your own people; sellswords of another tier cannot cover them. Buy the shield where the gap is.`,
    );
  }

  // ── Economic ──
  const rates = productionRates(p);
  const upkeep = foodUpkeepPerTurn(p);
  const economic: string[] = [];
  if (p.starving) {
    economic.push("THE GRANARIES ARE EMPTY — everything is frozen until the people are fed. Buy food at the Bazaar or assign farmers this instant.");
  } else if (rates.food < upkeep) {
    economic.push(`Food runs ${n(rates.food)}/turn against ${n(upkeep)}/turn eaten — the stores are draining. Assign farmers or buy at the Bazaar.`);
  } else {
    economic.push(`Food holds: ${n(rates.food)}/turn grown against ${n(upkeep)}/turn eaten.`);
  }
  const worst = (Object.entries(rates) as [Resource, number][]).sort((a, b) => a[1] - b[1])[0];
  economic.push(`The thinnest yield is ${worst[0]} at ${n(worst[1])}/turn — raise its building's level or assign more workers there.`);
  economic.push(`Tax sits at ${Math.round(p.taxRate * 100)}% — lower it to speed production, raise it to bank war-gold. Statecraft softens the trade.`);
  const surplus = (Object.entries(p.resources) as [Resource, number][]).sort((a, b) => b[1] - a[1])[0];
  if (surplus[1] > 50000) {
    economic.push(`${n(surplus[1])} ${surplus[0]} sits loose in the stores — caravans at the Bazaar turn surplus into gold.`);
  }

  // ── Population ──
  const vacant = vacantHousing(p);
  const perDay = popPerDay(p);
  const population: string[] = [];
  population.push(
    vacant < perDay
      ? `Housing is the bottleneck: ${n(perDay)} settlers arrive each dawn but only ${n(vacant)} beds stand empty — the rest walk on, lost. Raise Hearthsteads.`
      : `${n(perDay)} settlers arrive daily with ${n(vacant)} beds free — no one is turned away.`,
  );
  if (p.idlePeasants > 0) {
    population.push(`${n(p.idlePeasants)} peasants stand idle — idle hands produce nothing. Assign them in the Assignment Hall.`);
  }
  population.push(`Every civilian building level quickens the tide (~+0.76 settlers/day each) — the whole tree at level 10 reaches 100/day.`);

  return { defensive, military: militaryB, economic, population };
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

  // Resource producers: the level lifts each worker's output (workers uncapped).
  const word = PRODUCER_WORD[id];
  if (word && (id === "grange" || id === "masons_quarry" || id === "deepvein_mine" || id === "sawyers_mill")) {
    return `each ${word} produces ${workerOutputAtLevel(cur)} → ${workerOutputAtLevel(next)}/turn (before tax & bonuses)`;
  }

  // The other unit halls — uncapped too; the level makes each unit BETTER.
  if (word) {
    if (id === "market_square") {
      return `each caravan carries ${num(cur * CARAVAN_CAPACITY_PER_MARKET_LEVEL)} → ${num(next * CARAVAN_CAPACITY_PER_MARKET_LEVEL)} goods and reaches the Bazaar in ${caravanDeliveryTurns(cur)} → ${caravanDeliveryTurns(next)} turns (merchants unlimited)`;
    }
    if (id === "collegium") {
      return `each scholar makes ${researchOutputAtLevel(cur)} → ${researchOutputAtLevel(next)} research/turn (scholars unlimited)`;
    }
    if (id === "rangers_lodge") {
      return `rangers stand a keener watch — +${Math.round(next * LODGE_BONUS_PER_LEVEL * 100)}% to the strength that stops incoming spies`;
    }
    if (id === "shadow_guild") {
      return `your agents work +${Math.round(cur * GUILD_BONUS_PER_LEVEL * 100)}% → +${Math.round(next * GUILD_BONUS_PER_LEVEL * 100)}% harder to slip past their rangers`;
    }
    return `each ${word} grows more effective`;
  }

  const stored = STORAGE_WORD[id];
  if (stored) {
    return `shelters ${stored} ${num(shelterAtLevel(id, cur))} → ${num(shelterAtLevel(id, next))} from raiders`;
  }

  if (id === "hearthstead") return `housing for ${num(cur * HOUSING_PER_HEARTHSTEAD)} → ${num(next * HOUSING_PER_HEARTHSTEAD)} people`;
  if (id === "muster_hall") return `bunks for ${num(cur * TROOPS_PER_MUSTER_HALL)} → ${num(next * TROOPS_PER_MUSTER_HALL)} troops`;

  if (id === "drill_yard") return `lets you arm ${TIER_WORD[next]} footmen`;
  if (id === "fletchers_range") return `lets you arm ${TIER_WORD[next]} archers`;
  if (id === "knights_stables") return `lets you raise ${TIER_WORD[next]} cavalry`;
  if (id === "forge" || id === "armoury") {
    const what = id === "forge" ? "attack" : "defence";
    return `+${Math.round(cur * WARWORKS_BONUS_PER_LEVEL * 100)}% → +${Math.round(next * WARWORKS_BONUS_PER_LEVEL * 100)}% ${what} for every regular you field`;
  }

  if (id === "walls") {
    return `wall defence +${Math.round(wallBonusAtLevel(cur) * 100)}% → +${Math.round(wallBonusAtLevel(next) * 100)}% for every defender`;
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

// ── Raid history (the ladder's war record) ──────────────────────────────────

export interface AttackRecord {
  attackerId: string;
  attackerName: string;
  mode: string;
  tick: number;
  /** The defender opened the gates rather than fight. */
  yielded: boolean;
}

/** Every empire's recent attackers, keyed by defender and newest-first.
 *
 *  Public knowledge by design: these are exactly the facts the battle feed
 *  already shows the whole realm (who hit whom, when, in what mode) — just
 *  gathered per defender so the ladder can show who is being fed upon. No
 *  troop composition, no loot, no army strength leaks through here.
 *
 *  Bounded by the battle log itself, which keeps the last 300 reports world-
 *  wide; in a very busy age that may not reach the full window. */
export function attacksByDefender(
  battles: import("./types").BattleReport[],
  currentTick: number,
  windowTicks: number,
): Map<string, AttackRecord[]> {
  const out = new Map<string, AttackRecord[]>();
  for (const b of battles) {
    if (currentTick - b.tick > windowTicks) continue;
    const list = out.get(b.defenderId) ?? [];
    list.push({
      attackerId: b.attackerId,
      attackerName: b.attackerName,
      mode: b.mode,
      tick: b.tick,
      yielded: !!b.yielded,
    });
    out.set(b.defenderId, list);
  }
  // world.battles is stored newest-first, but don't rely on it — the caller
  // renders "how long ago", which must be monotonic.
  for (const list of out.values()) list.sort((a, b) => b.tick - a.tick);
  return out;
}

/** Collapse a defender's attackers into one row per aggressor, worst first. */
export function summarizeAttackers(
  records: AttackRecord[],
): { attackerId: string; attackerName: string; times: number; lastTick: number }[] {
  const by = new Map<string, { attackerId: string; attackerName: string; times: number; lastTick: number }>();
  for (const r of records) {
    const seen = by.get(r.attackerId);
    if (seen) {
      seen.times += 1;
      seen.lastTick = Math.max(seen.lastTick, r.tick);
    } else {
      by.set(r.attackerId, {
        attackerId: r.attackerId,
        attackerName: r.attackerName,
        times: 1,
        lastTick: r.tick,
      });
    }
  }
  return [...by.values()].sort((a, b) => b.times - a.times || b.lastTick - a.lastTick);
}


/**
 * "3h ago" from a TURN number. One implementation for the whole app — this had
 * grown three near-identical copies with slightly different wording, which is
 * how "2w ago" and "14d ago" end up on the same screen.
 */
export function ticksAgo(tick: number, nowTick: number): string {
  const mins = Math.max(0, nowTick - tick) * TURN_MINUTES;
  if (mins < 2) return "just now";
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 31) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}
