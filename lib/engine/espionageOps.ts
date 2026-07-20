// Spy missions & scout recon (spec/espionage.md). Pure — RNG injected.

import {
  ACTION_TURNS,
  CATCH,
  EFFECT_PER_LEVEL,
  GUILD_EFFECT_PER_LEVEL,
  RACES,
  RECON_FUZZ,
  SABOTAGE_PER_SPY,
  SPY_LUCK_SWING,
  SPY_OPS,
  TORCH_CAP,
  TORCH_PCT_PER_SPY,
  TURNS_PER_DAY,
  UNREST,
  catchableOpLevel,
} from "../constants";
import { plunderResource, unbankedGold, unstored } from "./combat";
import { luck, type Rng } from "./rng";
import {
  EngineError,
  level,
  military,
  researchLevel,
  troopTotal,
  type Player,
  type Resource,
  type SiegeGearType,
} from "./types";

export interface SpyMissionResult {
  attacker: Player;
  defender: Player;
  caught: boolean;
  catchChance: number;
  detail: string; // what the attacker learns / did
  victimDetail?: string; // what the victim sees (anonymous unless caught)
}

export function runSpyMission(
  attackerIn: Player,
  defenderIn: Player,
  opId: string,
  spiesSent: number,
  currentTick: number,
  rng: Rng,
): SpyMissionResult {
  const op = SPY_OPS.find((o) => o.id === opId);
  if (!op) throw new EngineError("op", "Unknown operation");
  const attacker = structuredClone(attackerIn);
  const defender = structuredClone(defenderIn);

  if (researchLevel(attacker, "tradecraft") < op.level) {
    throw new EngineError("tradecraft", `${op.name} requires Tradecraft ${op.level}`);
  }
  if (!Number.isInteger(spiesSent) || spiesSent <= 0) throw new EngineError("count", "Send at least one spy");
  if (attacker.army.spies < spiesSent) throw new EngineError("spies", "Not enough spies");
  if (attacker.turnsAvailable < ACTION_TURNS.SPY_MISSION_COST) {
    throw new EngineError("turns", "A mission costs 5 action turns");
  }
  attacker.turnsAvailable -= ACTION_TURNS.SPY_MISSION_COST;

  // Catch roll — only if the defender's Lodge can even see this op level.
  const lodge = level(defender, "rangers_lodge");
  const scoutsHome = defender.army.scouts;
  let catchChance = 0;
  if (catchableOpLevel(lodge) >= op.level && scoutsHome > 0) {
    catchChance =
      Math.min(
        CATCH.MAX,
        spiesSent * CATCH.PER_SPY_PER_LODGE_LEVEL * lodge * Math.min(1, scoutsHome / spiesSent),
      ) *
      (1 + CATCH.PATHFINDING_PER_LEVEL * researchLevel(defender, "pathfinding")) *
      RACES[defender.race].scout;
    catchChance = Math.min(CATCH.MAX, catchChance * luck(rng, SPY_LUCK_SWING));
  }

  if (rng() < catchChance) {
    // Massacre: every spy sent is executed. The attacker is named.
    attacker.army.spies -= spiesSent;
    defender.recentAttackers.push({ playerId: attacker.id, tick: currentTick });
    return {
      attacker,
      defender,
      caught: true,
      catchChance,
      detail: `Disaster — all ${spiesSent} spies were caught and executed at ${defender.name}.`,
      victimDetail: `Your scouts caught ${spiesSent} spies of ${attacker.name} attempting "${op.name}". All were executed. The revenge window is open.`,
    };
  }

  // Success — effect scales with spies, Shadow Guild, Tradecraft, race, luck.
  const effectMult =
    (1 + GUILD_EFFECT_PER_LEVEL * level(attacker, "shadow_guild")) *
    (1 + EFFECT_PER_LEVEL * researchLevel(attacker, "tradecraft")) *
    RACES[attacker.race].spy *
    luck(rng, SPY_LUCK_SWING);

  let detail = "";
  let victimDetail: string | undefined;

  switch (op.id) {
    case "survey_coffers": {
      const r = defender.resources;
      detail =
        `${defender.name}: ${Math.floor(defender.gold)} gold on hand (${Math.floor(unbankedGold(defender))} unbanked), ` +
        `food ${Math.floor(r.food)} (${Math.floor(unstored(defender, "food"))} outside), ` +
        `wood ${Math.floor(r.wood)} (${Math.floor(unstored(defender, "wood"))} outside), ` +
        `stone ${Math.floor(r.stone)} (${Math.floor(unstored(defender, "stone"))} outside), ` +
        `ore ${Math.floor(r.ore)} (${Math.floor(unstored(defender, "ore"))} outside).`;
      break;
    }
    case "map_defences": {
      const a = defender.army;
      detail =
        `${defender.name}: walls level ${level(defender, "walls")} at ${Math.round(defender.wallIntegrity * 100)}%, ` +
        `War Foundry ${level(defender, "war_foundry")}. Army: ` +
        `${troopTotal(a.footmen)} footmen, ${troopTotal(a.archers)} archers, ${troopTotal(a.cavalry)} cavalry, ` +
        `${a.siegeEngineers} engineers, ${a.mercenaries} mercenaries. Stamina ${a.stamina}.`;
      break;
    }
    case "sabotage_engines": {
      let toWreck = Math.floor(spiesSent * SABOTAGE_PER_SPY * effectMult);
      const wrecked: string[] = [];
      for (const t of ["trebuchets", "ballistae", "rams", "ladders", "ropes"] as SiegeGearType[]) {
        if (toWreck <= 0) break;
        const n = Math.min(defender.army.siegeGear[t], toWreck);
        defender.army.siegeGear[t] -= n;
        toWreck -= n;
        if (n > 0) wrecked.push(`${n} ${t}`);
      }
      detail = wrecked.length
        ? `Sabotage successful: destroyed ${wrecked.join(", ")}.`
        : "The workshops were empty — nothing to sabotage.";
      victimDetail = wrecked.length
        ? `Saboteurs in the night: ${wrecked.join(", ")} destroyed. No trace of the hand behind it.`
        : undefined;
      break;
    }
    case "torch_stores": {
      const pct = Math.min(TORCH_CAP, spiesSent * TORCH_PCT_PER_SPY * effectMult);
      const burned: string[] = [];
      for (const r of ["food", "wood", "stone", "ore"] as Resource[]) {
        const amt = Math.floor(unstored(defender, r) * pct);
        plunderResource(defender, r, amt);
        if (amt > 0) burned.push(`${amt} ${r}`);
      }
      detail = burned.length
        ? `Fires set — burned ${burned.join(", ")} (${Math.round(pct * 100)}% of what lay outside).`
        : "Nothing sat outside their storehouses to burn.";
      victimDetail = burned.length
        ? `Arson! Burned: ${burned.join(", ")}. The arsonists left no trace.`
        : undefined;
      break;
    }
    case "incite_unrest": {
      defender.unrestUntilTick = currentTick + TURNS_PER_DAY; // refreshes, never stacks
      detail = `Agitators planted: ${defender.name} suffers −${UNREST.TAX_PENALTY * 100}% taxes and production for 24 hours; growth halted.`;
      victimDetail =
        "Unrest in the streets! Taxes and production fall by a quarter and no settlers will come, for one day. Someone paid for this.";
      break;
    }
  }

  return { attacker, defender, caught: false, catchChance, detail, victimDetail };
}

/** Scout recon: cheap, safe, fuzzy (±20%, tightened by Pathfinding). */
export function runScoutRecon(
  attackerIn: Player,
  defender: Player,
  rng: Rng,
): { attacker: Player; detail: string } {
  const attacker = structuredClone(attackerIn);
  if (attacker.army.scouts < 1) throw new EngineError("scouts", "You have no scouts");
  if (attacker.turnsAvailable < ACTION_TURNS.SCOUT_RECON_COST) {
    throw new EngineError("turns", "Recon costs 2 action turns");
  }
  attacker.turnsAvailable -= ACTION_TURNS.SCOUT_RECON_COST;

  const sharpness = researchLevel(attacker, "pathfinding") * EFFECT_PER_LEVEL; // 0..1
  const fuzz = RECON_FUZZ * (1 - sharpness);
  const est = (n: number) => Math.max(0, Math.round(n * luck(rng, fuzz)));

  const army =
    troopTotal(defender.army.footmen) +
    troopTotal(defender.army.archers) +
    troopTotal(defender.army.cavalry) +
    defender.army.mercenaries;
  const detail =
    `${defender.name}: roughly ${est(army)} troops under arms` +
    ` (± the haze of distance), walls level ${level(defender, "walls")},` +
    ` about ${est(military(defender))} of fighting age in total.`;
  return { attacker, detail };
}
