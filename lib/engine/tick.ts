// The 10-minute turn tick (spec/architecture.md, spec/economy.md).
// Order matters: food upkeep is deducted BEFORE production is added, so a
// starving empire can't feed itself with the same tick's harvest.

import {
  ACTION_TURNS,
  FOOD_UPKEEP_PER_PERSON,
  GOLD_PER_CIVILIAN_AT_FULL_TAX,
  MERC_UPKEEP_GOLD_PER_TURN,
  OUTPUT_PER_PRODUCER_AT_ZERO_TAX,
  RACES,
  SLOTS_PER_BUILDING_LEVEL,
  STAMINA,
  STORAGE_BUILDING,
  STORAGE_PER_LEVEL,
  SURRENDER_TAX_FACTOR,
  SURRENDER_PRODUCTION_FACTOR,
  SURRENDER_TICKS_PER_ERA,
  SURRENDER_DAYS_PER_ERA,
  researchOrdinalCost,
  EFFECT_PER_LEVEL,
  MAX_FIELD_LEVEL,
} from "../constants";
import type { ResearchField } from "../constants/research";
import type { BuildingId } from "../constants/buildings";
import {
  bankedRes,
  buildingIntegrity,
  civilians,
  emptyMercForce,
  level,
  mercTotal,
  military,
  researchLevel,
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
 * Output per producer per turn, before per-resource research and race bonuses:
 * 20 × (1 − taxRate × hallPenaltyFactor) × statecraft multiplier.
 */
export function baseOutputPerProducer(p: Player, hallPenaltyFactor = 1): number {
  const statecraft = 1 + researchLevel(p, "statecraft") * EFFECT_PER_LEVEL;
  return (
    OUTPUT_PER_PRODUCER_AT_ZERO_TAX * (1 - p.taxRate * hallPenaltyFactor) * statecraft
  );
}

/** Tax income per turn: every civilian pays 40 × taxRate (halved surrendered). */
export function taxIncomePerTurn(p: Player): number {
  let income = civilians(p) * GOLD_PER_CIVILIAN_AT_FULL_TAX * p.taxRate;
  if (p.surrendered) income *= SURRENDER_TAX_FACTOR;
  return income;
}

/** Food upkeep per turn: 0.1 × (civilians + regular troops). Mercs feed themselves. */
export function foodUpkeepPerTurn(p: Player): number {
  return FOOD_UPKEEP_PER_PERSON * (civilians(p) + military(p));
}

/** Effective producers of a role: capped by building slots (20 × level). */
export function effectiveProducers(p: Player, role: WorkerRole, building: BuildingId): number {
  return Math.min(p.workers[role], SLOTS_PER_BUILDING_LEVEL * level(p, building));
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
  // Surrender (economy.md): the town goes dormant — production drops by half
  // (tax income is halved inside taxIncomePerTurn).
  const surrenderMult = p.surrendered ? SURRENDER_PRODUCTION_FACTOR : 1;

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
    p.gold += taxIncomePerTurn(p) * unrestMult;
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

    // 3. Production.
    const race = RACES[p.race];
    const base = baseOutputPerProducer(p, hallPenaltyFactor) * unrestMult * surrenderMult;
    for (const { role, building, resource, field } of PRODUCTION) {
      const n = effectiveProducers(p, role, building);
      if (n === 0) continue;
      const fieldMult = 1 + researchLevel(p, field) * EFFECT_PER_LEVEL;
      // A bombarded production building yields proportionally less.
      p.resources[resource] += n * base * race.production[resource] * fieldMult * buildingIntegrity(p, building);
    }

    // Research points → active field; levels complete when cost is paid
    // and the Collegium gate (level ≥ 2N − 1) is met.
    const researchers = effectiveProducers(p, "researchers", "collegium");
    const field = p.research.activeField;
    if (researchers > 0 && field) {
      // A cracked Collegium slows the scholars.
      p.research.banked[field] =
        (p.research.banked[field] ?? 0) + researchers * base * buildingIntegrity(p, "collegium");
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

    // 4. Stamina recovery (passive).
    p.army.stamina = Math.min(STAMINA.MAX, p.army.stamina + STAMINA.PASSIVE_RECOVERY_PER_TURN);
  }

  // The Steward's vault duty (Royal Charter): loose goods flow into their
  // stores automatically each turn, up to capacity. Free rulers bank by hand.
  if (p.premium) {
    const banked = { ...bankedRes(p) };
    let vaulted = false;
    for (const r of ["food", "wood", "stone", "ore"] as const) {
      const cap = STORAGE_PER_LEVEL * level(p, STORAGE_BUILDING[r]);
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

  // Surrender allowance: every turn under the white flag spends the era budget.
  // When it runs dry the flag comes down on its own — you can hide no longer.
  if (p.surrendered) {
    p.surrenderTicksUsed = (p.surrenderTicksUsed ?? 0) + 1;
    if (p.surrenderTicksUsed >= SURRENDER_TICKS_PER_ERA) {
      p.surrendered = false;
      p.surrenderLiftedAtTick = currentTick;
      events.push({
        type: "info",
        detail: `Your ${SURRENDER_DAYS_PER_ERA} days of surrender for this age are spent — the white flag comes down of its own accord.`,
      });
    }
  }

  return { player: p, events };
}
