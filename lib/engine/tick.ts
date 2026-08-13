// The 10-minute turn tick (spec/architecture.md, spec/empire.md).
// Order matters: food upkeep is deducted BEFORE production is added, so a
// starving empire can't feed itself with the same tick's harvest.
//
// ROUNDING — every stock a player holds (gold, food, wood, stone, ore) is a
// WHOLE NUMBER. The rates behind them are not: tax is civilians × 0.4 × rate ×
// statecraft, upkeep is 0.1 × people, production stacks four multipliers. Left
// alone those credit fractions 144 times a day, and a currency carrying binary
// float dust is one you cannot reason about or display honestly.
//
// So each stock movement is rounded AGAINST the player, always:
//     credits (income, harvest, research)  → Math.floor
//     debits  (upkeep, food, costs)        → Math.ceil
// No rounding step can mint a unit, and the number the UI projects is exactly
// the number that lands — the per-turn helpers below round the same way.

import {
  ACTION_TURNS,
  RESEARCH_DOUBT,
  SPY_TURNS,
  FOOD_UPKEEP_PER_PERSON,
  GOLD_PER_CIVILIAN_AT_FULL_TAX,
  MERC_UPKEEP_GOLD_PER_TURN,
  researchOutputAtLevel,
  workerOutputAtLevel,
  RACES,
  STAMINA,
  STORAGE_BUILDING,
  VACATION_TAX_FACTOR,
  VACATION_PRODUCTION_FACTOR,
  VACATION_TICKS_PER_ERA,
  VACATION_DAYS_PER_ERA,
  researchOrdinalCost,
  SCHOLARSHIP,
  EFFECT_PER_LEVEL,
  MAX_FIELD_LEVEL,
} from "../constants";
import type { ResearchField } from "../constants/research";
import type { BuildingId } from "../constants/buildings";
import { sampleGrowth } from "./dailyReset";
import {
  bankedRes,
  buildingIntegrity,
  civilians,
  emptyMercForce,
  level,
  mercTotal,
  military,
  researchLevel,
  shelterCapacity,
  totalResearchLevels,
  type EngineResult,
  type Player,
  type Resource,
  type WorkerRole,
} from "./types";

const PRODUCTION: {
  role: WorkerRole;
  building: BuildingId;
  resource: Resource;
  field: ResearchField;
}[] = [
  { role: "farmers", building: "grange", resource: "food", field: "crop_rotation" },
  { role: "quarrymen", building: "masons_quarry", resource: "stone", field: "masonry" },
  { role: "miners", building: "deepvein_mine", resource: "ore", field: "deep_smelting" },
  { role: "lumberjacks", building: "sawyers_mill", resource: "wood", field: "forestry" },
];

/**
 * Tax income per turn: every civilian pays GOLD_PER_CIVILIAN_AT_FULL_TAX ×
 * taxRate, halved while away from the world.
 *
 * STATECRAFT is the treasury's field and now the ONLY thing it touches. It
 * used to multiply producer output as well, which made it a fifth production
 * research stacking on top of the four that already exist — a duplicate. Moved
 * here it does something none of them can: it makes the SAME tax rate yield
 * more, so a Statecraft empire can fund a war without squeezing its workers
 * (who pay for high taxes with lost output, see productionPerWorker).
 */
export function taxIncomePerTurn(p: Player): number {
  const statecraft = 1 + researchLevel(p, "statecraft") * EFFECT_PER_LEVEL;
  let income = civilians(p) * GOLD_PER_CIVILIAN_AT_FULL_TAX * p.taxRate * statecraft;
  if (p.onVacation) income *= VACATION_TAX_FACTOR;
  return Math.floor(income); // gold is whole — see ROUNDING at the top of this file
}

/** Food upkeep per turn: 0.1 × (civilians + regular troops). Mercs feed themselves. */
export function foodUpkeepPerTurn(p: Player): number {
  return Math.ceil(FOOD_UPKEEP_PER_PERSON * (civilians(p) + military(p)));
}

/**
 * Output PER resource-producer per turn, before race/research/integrity: the
 * production building's level lifts every worker (5 × level at 0% tax), and the
 * tax/statecraft dial applies as usual. Level 0 (no building) → 0. See economy.md.
 */
export function productionPerWorker(p: Player, building: BuildingId, hallPenaltyFactor = 1): number {
  const lvl = level(p, building);
  if (lvl === 0) return 0;
  // Statecraft no longer touches output — it governs the TREASURY (see the tax
  // take in the tick below). Four production fields already exist; a fifth that
  // stacked on all of them was a duplicate.
  //
  // The Collegium is on its own curve: scholars make research points, not
  // goods, and the goods curve was cut tenfold when the age went coin-rich.
  const per = building === "collegium" ? researchOutputAtLevel(lvl) : workerOutputAtLevel(lvl);
  return per * (1 - p.taxRate * hallPenaltyFactor);
}

export interface TickOptions {
  hallPenaltyFactor?: number; // from the Clan Hall (clans.md)
  currentTick?: number; // for unrest expiry checks
}

export function unrestActive(p: Player, currentTick: number): boolean {
  return (p.unrestUntilTick ?? 0) > currentTick;
}

export function processTurnTick(input: Player, opts: TickOptions = {}): EngineResult {
  const hallPenaltyFactor = opts.hallPenaltyFactor ?? 1;
  const currentTick = opts.currentTick ?? 0;
  const p = structuredClone(input);
  const events: EngineResult["events"] = [];
  // Incite Unrest (espionage.md): tax and production −25% while it lasts.
  const unrestMult = unrestActive(p, currentTick) ? 0.75 : 1;
  // Vacation (economy.md): the town goes dormant — production drops by half
  // (tax income is halved inside taxIncomePerTurn).
  const vacationMult = p.onVacation ? VACATION_PRODUCTION_FACTOR : 1;

  // 1. Food upkeep — before production, always. Loose food first; when it
  //    runs short the granary vault feeds the people (no starving beside a
  //    full store).
  const upkeep = foodUpkeepPerTurn(p);
  const vault = { ...bankedRes(p) };
  if (p.resources.food + vault.food >= upkeep) {
    const fromLoose = Math.min(p.resources.food, upkeep);
    p.resources.food -= fromLoose;
    if (upkeep - fromLoose > 0) {
      vault.food -= upkeep - fromLoose;
      p.bankedResources = vault;
    }
    if (p.starving) {
      p.starving = false;
      events.push({ type: "fed" });
    }
  } else {
    p.resources.food = 0;
    if (vault.food > 0) {
      vault.food = 0;
      p.bankedResources = vault;
    }
    if (!p.starving) {
      p.starving = true;
      events.push({ type: "starvation" });
    }
  }

  // 2–4. Tax, upkeep, production, research, stamina — all frozen while starving.
  if (!p.starving) {
    // 2. Tax income, then mercenary upkeep.
    // Floored AFTER unrest, not before — otherwise the ×0.75 re-introduces the
    // fraction the helper just removed.
    p.gold += Math.floor(taxIncomePerTurn(p) * unrestMult);
    const mercCount = mercTotal(p.army.mercenaries);
    const mercBill = mercCount * MERC_UPKEEP_GOLD_PER_TURN;
    if (mercBill > 0) {
      if (p.gold >= mercBill) {
        p.gold -= mercBill;
      } else {
        events.push({ type: "mercsDefected", count: mercCount });
        p.army.mercenaries = emptyMercForce(); // unpaid professionals leave at once
      }
    }

    // 3. Production. Workers are UNCAPPED — the building level lifts each
    //    worker's output (5/turn at L1 → 50 at L10; economy.md).
    const race = RACES[p.race];
    for (const { role, building, resource, field } of PRODUCTION) {
      const n = p.workers[role];
      if (n === 0) continue;
      const per = productionPerWorker(p, building, hallPenaltyFactor) * unrestMult * vacationMult;
      if (per === 0) continue; // no building, no output
      const fieldMult = 1 + researchLevel(p, field) * EFFECT_PER_LEVEL;
      // A bombarded production building yields proportionally less. Floored:
      // the harvest is whole sacks, and a partial one is not a sack.
      p.resources[resource] += Math.floor(
        n * per * race.production[resource] * fieldMult * buildingIntegrity(p, building),
      );
    }

    // Research points → active field. Researchers are UNCAPPED too — the
    // Collegium level lifts how much each scholar produces (50 × level — the
    // goods curve's tenfold cut does not apply to scholars), and a cracked
    // Collegium slows them (research.md). Levels complete when the
    // (global, progressive) cost is paid.
    const researchers = p.workers.researchers;
    const field = p.research.activeField;
    // Sow Research Doubt: whisperers among the scholars. Lasts a day unless a
    // scout op roots them out — which is the reason a research empire keeps
    // rangers at all.
    const doubtMult =
      (p.researchDoubtUntilTick ?? 0) > currentTick ? 1 - RESEARCH_DOUBT.RESEARCH_PENALTY : 1;
    // Scholarship lifts every scholar; the Collegium's level sets the base.
    const scholarshipMult = 1 + researchLevel(p, "scholarship") * SCHOLARSHIP.OUTPUT_PER_LEVEL;
    const rpPerScholar =
      productionPerWorker(p, "collegium", hallPenaltyFactor) *
      unrestMult *
      vacationMult *
      doubtMult *
      scholarshipMult;
    if (researchers > 0 && field && rpPerScholar > 0) {
      p.research.banked[field] =
        (p.research.banked[field] ?? 0) +
        Math.floor(researchers * rpPerScholar * buildingIntegrity(p, "collegium"));
    }
    if (field) {
      let lvl = researchLevel(p, field);
      // Cost is global + progressive: the price of the next level depends on how
      // many levels you've earned across ALL fields (the Collegium only sets the
      // speed, not what's reachable). Recomputed each level, so a multi-level
      // tick pays escalating costs.
      let cost = researchOrdinalCost(totalResearchLevels(p) + 1);
      while (lvl < MAX_FIELD_LEVEL && (p.research.banked[field] ?? 0) >= cost) {
        p.research.banked[field]! -= cost;
        lvl += 1;
        p.research.levels[field] = lvl;
        events.push({ type: "researchComplete", field, level: lvl });
        cost = researchOrdinalCost(totalResearchLevels(p) + 1);
      }
    }

    // 4. Stamina recovery (passive) — the army mends on its own while you are
    //    away, but only if there is food on the table to pay for it. An empire
    //    scraping by feeds its people first; the soldiers stay tired. (The
    //    active option, Rest, likewise costs food — see `restTroops`.)
    if (p.army.stamina < STAMINA.MAX) {
      const room = Math.min(STAMINA.PASSIVE_RECOVERY_PER_TURN, STAMINA.MAX - p.army.stamina);
      const cost = Math.ceil(STAMINA.PASSIVE_FOOD_PER_TROOP * military(p) * room);
      if (p.resources.food >= cost) {
        p.resources.food -= cost;
        p.army.stamina += room;
      }
    }
  }

  // The Steward's vault duty (Royal Charter): loose goods flow into their
  // stores automatically each turn, up to capacity. Free rulers bank by hand.
  if (p.premium) {
    const banked = { ...bankedRes(p) };
    let vaulted = false;
    for (const r of ["food", "wood", "stone", "ore"] as const) {
      const cap = shelterCapacity(p, STORAGE_BUILDING[r]);
      const move = Math.min(p.resources[r], Math.max(0, cap - banked[r]));
      if (move > 0) {
        p.resources[r] -= move;
        banked[r] += move;
        vaulted = true;
      }
    }
    if (vaulted) p.bankedResources = banked;
  }

  // Action turns accrue regardless (armies idle, the calendar doesn't).
  p.turnsAvailable = Math.min(ACTION_TURNS.CAP, p.turnsAvailable + ACTION_TURNS.PER_GAME_TURN);
  // The covert clock: half the army's rate, a far lower ceiling, and spies and
  // scouts both draw from it — so scouting a target and robbing them compete
  // for the same budget.
  p.spyTurnsAvailable = Math.min(
    SPY_TURNS.CAP,
    (p.spyTurnsAvailable ?? 0) + SPY_TURNS.PER_GAME_TURN,
  );

  // Record what settlers WOULD have arrived this moment. Dawn pays the average
  // of the day's samples, not a single reading — see sampleGrowth.
  sampleGrowth(p, currentTick);

  // Vacation allowance: every turn away spends the era budget.
  // When it runs dry you are returned to the world — you can hide no longer.
  if (p.onVacation) {
    p.vacationTicksUsed = (p.vacationTicksUsed ?? 0) + 1;
    if (p.vacationTicksUsed >= VACATION_TICKS_PER_ERA) {
      p.onVacation = false;
      p.vacationEndedAtTick = currentTick;
      events.push({
        type: "info",
        detail: `Your ${VACATION_DAYS_PER_ERA} days of vacation for this age are spent — you are back in the world whether you like it or not.`,
      });
    }
  }

  return { player: p, events };
}
