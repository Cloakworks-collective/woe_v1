// Spies and scouts (spec/espionage.md). Pure — RNG injected.
//
// Espionage is not a separate system: it runs the SAME strength model as
// combat. Agents have Power and Health, bonuses add, delivery multiplies, and
// a mission resolves as one force meeting another.
//
//     intercepted = f(scoutPower vs spyPower)
//     survivors   = sent − intercepted
//     effect      = f(survivors)          ← damage scales with who got THROUGH
//
// TWO ARMS, ONE BUDGET. Scouts are the whole intelligence arm and the only
// defence against spies; they work in the open and are never intercepted.
// Spies are the whole destruction arm; they go over the wall, and being caught
// names you. Both spend from the same pool of spy turns, so every turn spent
// scouting is a turn not spent sabotaging — and sizing a spy raid means
// knowing how many rangers stand against it, which costs a scout mission
// first. The two arms feed and starve each other.

import {
  AGENT_POWER,
  COVERT_EFFECTS,
  COVERT_WAR_MULTIPLIER,
  COVERT_LUCK_SWING,
  COVERT_XP,
  EFFECT_PER_LEVEL,
  GUILD_BONUS_PER_LEVEL,
  INTERCEPTION,
  LODGE_BONUS_PER_LEVEL,
  MAX_FIELD_LEVEL,
  RACES,
  RESEARCH_FIELDS,
  SIEGE_COUNTERS,
  TURNS_PER_DAY,
  covertOp,
  type CovertOpMeta,
} from "../constants";
import type { CounterType } from "../constants/buildings";
import { plunderResource, unbankedGold, unstored } from "./combat/loot";
import { settleMercenaries } from "./combat/model";
import { wallHealth } from "./combat/walls";
import { luck, rollCount, type Rng } from "./rng";
import {
  EngineError,
  level,
  mercTroops,
  researchLevel,
  totalPopulation,
  troopTotal,
  type Player,
  type Resource,
  type SiegeGearType,
} from "./types";

export interface CovertResult {
  attacker: Player;
  defender: Player;
  op: CovertOpMeta;
  /** Agents sent, stopped, and returned. */
  sent: number;
  intercepted: number;
  /** Any interception at all names you and opens the revenge window. A clean
   *  run stays anonymous — that is the whole prize. */
  exposed: boolean;
  detail: string; // what the attacker learns or did
  victimDetail?: string; // what the victim sees (anonymous unless exposed)
  resourcesDestroyed?: number;
  gearDestroyed?: number;
  turnsSpent: number;
}

/** turnCost = agents × turnsPerAgent. Derived, never chosen — you cannot
 *  under-fund an infiltration, you can only send fewer people. The interesting
 *  decision is how many to commit against the rangers you believe are waiting. */
export function covertTurnCost(op: CovertOpMeta, agents: number): number {
  return Math.ceil(agents * op.turnsPerAgent);
}

const agentPower = (
  p: Player,
  arm: "spy" | "scout",
  count: number,
  rng: Rng,
): number => {
  const base = AGENT_POWER[arm].power;
  const race = arm === "spy" ? RACES[p.race].spy : RACES[p.race].scout;
  const building = arm === "spy"
    ? GUILD_BONUS_PER_LEVEL * level(p, "shadow_guild")
    : LODGE_BONUS_PER_LEVEL * level(p, "rangers_lodge");
  const field = arm === "spy" ? "tradecraft" : "pathfinding";
  const xp = arm === "spy" ? p.army.spyExperience : p.army.scoutExperience;
  // Additive pool, exactly as in battle: race, veterancy, research, buildings.
  const pool = 1 + (race - 1) + xp / 100 + researchLevel(p, field) * EFFECT_PER_LEVEL + building;
  return count * base * pool * luck(rng, COVERT_LUCK_SWING);
};

export function runCovertOp(
  attackerIn: Player,
  defenderIn: Player,
  opId: string,
  agentsSent: number,
  currentTick: number,
  rng: Rng,
  atWar = false,
): CovertResult {
  const op = covertOp(opId);
  if (!op) throw new EngineError("op", "Unknown operation");
  const attacker = structuredClone(attackerIn);
  const defender = structuredClone(defenderIn);
  const arm = op.arm;

  if (researchLevel(attacker, op.field) < op.level) {
    throw new EngineError(op.field, `${op.name} requires ${op.field === "tradecraft" ? "Tradecraft" : "Pathfinding"} ${op.level}`);
  }
  if (!Number.isInteger(agentsSent) || agentsSent <= 0) {
    throw new EngineError("count", "Send at least one agent");
  }
  const available = arm === "spy"
    ? attacker.army.spies + attacker.army.mercenaries.spies
    : attacker.army.scouts + attacker.army.mercenaries.scouts;
  if (available < agentsSent) throw new EngineError(arm, `Not enough ${arm === "spy" ? "spies" : "scouts"}`);

  const cost = covertTurnCost(op, agentsSent);
  if (attacker.spyTurnsAvailable < cost) {
    throw new EngineError("spyTurns", `${op.name} with ${agentsSent} agents costs ${cost} spy turns.`);
  }
  attacker.spyTurnsAvailable -= cost;

  // ── Interception ──────────────────────────────────────────────────────────
  // Scouts do not hunt. They stand watch, and what they stop is decided by
  // weight of numbers on both sides. A realm with NO rangers is robbed at will.
  let intercepted = 0;
  if (arm === "spy") {
    const spyPwr = agentPower(attacker, "spy", agentsSent, rng);
    const watch = defender.army.scouts + defender.army.mercenaries.scouts;
    const scoutPwr = watch > 0 ? agentPower(defender, "scout", watch, rng) : 0;
    if (scoutPwr > 0 && spyPwr > 0) {
      const ratio = scoutPwr / spyPwr;
      const rate = Math.min(
        INTERCEPTION.MAX,
        INTERCEPTION.AT_PARITY * ratio * op.detection,
      );
      intercepted = rollCount(rng, agentsSent, rate);
    }
    if (intercepted > 0) {
      losePersonnel(attacker, "spy", intercepted);
      defender.recentAttackers.push({ playerId: attacker.id, tick: currentTick });
      // Standing watch teaches.
      defender.army.scoutExperience = Math.min(
        COVERT_XP.MAX,
        defender.army.scoutExperience + COVERT_XP.GAIN_PER_INTERCEPTION,
      );
    }
  }

  const survivors = agentsSent - intercepted;
  // Clan war doubles what sabotage achieves. Applied to the finished magnitude
  // below (after each op's cap) so it still bites when the cap is already the
  // binding constraint — scaling the agent count would not.
  const warX = atWar ? COVERT_WAR_MULTIPLIER : 1;
  const exposed = intercepted > 0;
  let detail = "";
  let victimDetail: string | undefined;
  let resourcesDestroyed = 0;
  let gearDestroyed = 0;

  if (survivors <= 0) {
    detail = `Disaster — all ${agentsSent} were taken at the wall. ${defender.name} knows the hand behind it.`;
    victimDetail = `Rangers took ${intercepted} of ${attacker.name}'s agents attempting "${op.name}". The revenge window is open.`;
    settleMercenaries(attacker);
    return { attacker, defender, op, sent: agentsSent, intercepted, exposed, detail, victimDetail, turnsSpent: cost };
  }

  // ── The work ──────────────────────────────────────────────────────────────
  switch (op.id) {
    // ── SCOUT: intelligence ───────────────────────────────────────────────
    case "survey_coffers": {
      const r = defender.resources;
      detail =
        `${defender.name}: ${fmt(defender.gold)} gold (${fmt(unbankedGold(defender))} unvaulted), ` +
        (["food", "wood", "stone", "ore"] as Resource[])
          .map((k) => `${k} ${fmt(r[k])} (${fmt(unstored(defender, k))} exposed)`)
          .join(", ") + ".";
      break;
    }
    case "map_walls": {
      const crewed = Object.entries(defender.army.siegeCounters)
        .filter(([, n]) => (n as number) > 0)
        .map(([t, n]) => `${n} ${SIEGE_COUNTERS[t as CounterType].name}`);
      detail =
        `${defender.name}: walls level ${level(defender, "walls")} at ${Math.round(defender.wallIntegrity * 100)}% ` +
        `(${fmt(wallHealth(defender) * defender.wallIntegrity)} of health standing), War Foundry ${level(defender, "war_foundry")}. ` +
        (crewed.length ? `Defensive works: ${crewed.join(", ")}.` : "No defensive works at all.");
      break;
    }
    case "map_army": {
      const a = defender.army;
      detail =
        `${defender.name}: ${troopTotal(a.footmen)} footmen, ${troopTotal(a.archers)} archers, ` +
        `${troopTotal(a.cavalry)} cavalry, ${a.siegeEngineers} engineers, ` +
        `${mercTroops(a.mercenaries)} sellswords. Stamina ${a.stamina}, veterancy ${Math.round(a.experience)}. ` +
        `Sortie orders: ${a.sortieEnabled ? "they will ride out" : "they will hold the wall"}.`;
      break;
    }
    case "map_siege": {
      const train = (Object.keys(defender.army.siegeGear) as SiegeGearType[])
        .filter((t) => defender.army.siegeGear[t] > 0)
        .map((t) => `${defender.army.siegeGear[t]} ${t.replace("_", " ")}`);
      detail = train.length
        ? `${defender.name}'s siege train: ${train.join(", ")}. Engineers to crew it: ${defender.army.siegeEngineers}.`
        : `${defender.name} keeps no siege train at all — no bombardment is coming from that quarter.`;
      break;
    }
    case "map_research": {
      const known = RESEARCH_FIELDS.map((f) => `${f.name} ${defender.research.levels[f.id] ?? 0}`).join(", ");
      detail = `${defender.name}'s Collegium: ${known}.`;
      break;
    }
    case "quell_unrest": {
      const had = (attacker.unrestUntilTick ?? 0) > currentTick;
      attacker.unrestUntilTick = undefined;
      detail = had
        ? "The agitators are found and the streets go quiet. Taxes and production recover at once."
        : "No unrest to put down — your streets were already calm.";
      break;
    }
    case "quell_doubt": {
      const had = (attacker.researchDoubtUntilTick ?? 0) > currentTick;
      attacker.researchDoubtUntilTick = undefined;
      detail = had
        ? "The whisperers are rooted out of the Collegium. Your scholars find their thread again."
        : "No doubt to dispel — the Collegium was working well.";
      break;
    }

    // ── SPY: destruction and theft ────────────────────────────────────────
    case "torch_stores": {
      const pct = Math.min(1, Math.min(COVERT_EFFECTS.TORCH_CAP, survivors * COVERT_EFFECTS.TORCH_PCT_PER_SPY) * warX);
      const burned: string[] = [];
      for (const r of ["food", "wood", "stone", "ore"] as Resource[]) {
        const amt = Math.floor(unstored(defender, r) * pct);
        plunderResource(defender, r, amt);
        if (amt > 0) { burned.push(`${fmt(amt)} ${r}`); resourcesDestroyed += amt; }
      }
      detail = burned.length ? `Fires set — burned ${burned.join(", ")}.` : "Nothing lay outside to burn.";
      victimDetail = burned.length ? `Arson! Burned: ${burned.join(", ")}.` : undefined;
      break;
    }
    case "steal_resources": {
      const pct = Math.min(1, Math.min(COVERT_EFFECTS.STEAL_CAP, survivors * COVERT_EFFECTS.STEAL_PCT_PER_SPY) * warX);
      const taken: string[] = [];
      for (const r of ["food", "wood", "stone", "ore"] as Resource[]) {
        const amt = Math.floor(unstored(defender, r) * pct);
        plunderResource(defender, r, amt);
        attacker.resources[r] += amt;
        if (amt > 0) taken.push(`${fmt(amt)} ${r}`);
      }
      detail = taken.length ? `Carried off ${taken.join(", ")} in the night.` : "Nothing lay outside to carry.";
      victimDetail = taken.length ? `Thieves in the storehouses: ${taken.join(", ")} gone.` : undefined;
      break;
    }
    case "sabotage_siege": {
      let budget = Math.floor(survivors * COVERT_EFFECTS.SABOTAGE_PER_SPY * warX);
      const wrecked: string[] = [];
      for (const t of Object.keys(defender.army.siegeGear) as SiegeGearType[]) {
        if (budget <= 0) break;
        const n = Math.min(defender.army.siegeGear[t], budget);
        defender.army.siegeGear[t] -= n;
        budget -= n;
        if (n > 0) { wrecked.push(`${n} ${t.replace("_", " ")}`); gearDestroyed += n; }
      }
      for (const t of Object.keys(defender.army.siegeCounters) as CounterType[]) {
        if (budget <= 0) break;
        const n = Math.min(defender.army.siegeCounters[t], budget);
        defender.army.siegeCounters[t] -= n;
        budget -= n;
        if (n > 0) { wrecked.push(`${n} ${SIEGE_COUNTERS[t].name}`); gearDestroyed += n; }
      }
      detail = wrecked.length ? `Sabotage successful — destroyed ${wrecked.join(", ")}.` : "The yards were empty.";
      victimDetail = wrecked.length ? `Saboteurs in the engine yard: ${wrecked.join(", ")} destroyed.` : undefined;
      break;
    }
    case "sabotage_walls": {
      // Deliberately tiny. Undermining must never compete with a trebuchet, or
      // the entire siege economy is pointless — this is a nuisance, not a siege.
      const frac = Math.min(COVERT_EFFECTS.UNDERMINE_CAP, survivors * COVERT_EFFECTS.UNDERMINE_PER_SPY) * warX;
      const before = defender.wallIntegrity;
      defender.wallIntegrity = Math.max(0, defender.wallIntegrity - frac);
      const lost = before - defender.wallIntegrity;
      detail = lost > 0
        ? `Miners work the footings — the wall settles ${Math.round(lost * 100)}%.`
        : "There was no wall worth undermining.";
      victimDetail = lost > 0 ? `Subsidence at the wall — someone has been digging. ${Math.round(lost * 100)}% lost.` : undefined;
      break;
    }
    case "incite_unrest": {
      defender.unrestUntilTick = currentTick + TURNS_PER_DAY * warX;
      detail = `Agitators planted: ${defender.name} loses a quarter of taxes and production for a day, and no settlers will come.`;
      victimDetail = "Unrest in the streets! Taxes and production fall and settlers turn away. Your rangers can put this down.";
      break;
    }
    case "sow_doubt": {
      defender.researchDoubtUntilTick = currentTick + TURNS_PER_DAY * warX;
      detail = `Whisperers among their scholars — ${defender.name}'s research crawls for a day.`;
      victimDetail = "Doubt spreads through the Collegium and the work slows to a crawl. Rangers can root them out.";
      break;
    }
    case "assassinate_scouts": {
      const killed = Math.min(defender.army.scouts, Math.floor(survivors * COVERT_EFFECTS.ASSASSINATE_PER_SPY));
      defender.army.scouts -= killed;
      // Veterancy dies with the veterans, and the sellsword rangers who can no
      // longer be commanded are paid off — the cascade, same as the army.
      if (killed > 0) {
        const before = defenderIn.army.scouts;
        defender.army.scoutExperience = Math.max(
          0,
          defender.army.scoutExperience * (1 - Math.min(1, killed / Math.max(1, before))),
        );
      }
      const disbanded = settleMercenaries(defender);
      detail = killed > 0
        ? `${killed} of their rangers are dead in the dark${disbanded > 0 ? `, and ${disbanded} hired scouts ride off for want of anyone to serve` : ""}. They are that much blinder now.`
        : "They had no rangers to kill.";
      victimDetail = killed > 0 ? `Murder in the night — ${killed} rangers dead at their posts.` : undefined;
      break;
    }
    case "steal_research": {
      const cap = COVERT_EFFECTS.STEAL_RESEARCH_LEVELS_PER_ERA;
      const used = attacker.stolenResearchLevels ?? 0;
      if (used >= cap) {
        detail = `Your agents reach the Collegium, but you have already copied ${cap} secrets this age. There is no more room in the archive.`;
        break;
      }
      // Copy the field where they are furthest ahead of you. They lose nothing
      // but the secret — theft can supplement doing the work, never replace it.
      let best: { field: import("../constants/research").ResearchField; gap: number } | null = null;
      for (const f of RESEARCH_FIELDS) {
        const theirs = defender.research.levels[f.id] ?? 0;
        const ours = attacker.research.levels[f.id] ?? 0;
        const gap = theirs - ours;
        if (gap > 0 && (!best || gap > best.gap)) best = { field: f.id, gap };
      }
      if (!best) {
        detail = "Their Collegium holds nothing you do not already know.";
        break;
      }
      const to = Math.min(MAX_FIELD_LEVEL, (attacker.research.levels[best.field] ?? 0) + 1);
      attacker.research.levels[best.field] = to;
      attacker.stolenResearchLevels = used + 1;
      const name = RESEARCH_FIELDS.find((f) => f.id === best!.field)?.name ?? best.field;
      detail = `Copied ${name} to level ${to}. They keep theirs and never miss it. (${used + 1}/${cap} secrets taken this age.)`;
      break;
    }
  }

  // ── Veterancy ─────────────────────────────────────────────────────────────
  const xpKey = arm === "spy" ? "spyExperience" : "scoutExperience";
  const before = arm === "spy" ? attackerIn.army.spies : attackerIn.army.scouts;
  if (intercepted > 0) {
    attacker.army[xpKey] = Math.max(
      0,
      attacker.army[xpKey] * (1 - Math.min(1, intercepted / Math.max(1, before))),
    );
  }
  attacker.army[xpKey] = Math.min(COVERT_XP.MAX, attacker.army[xpKey] + COVERT_XP.GAIN_PER_MISSION);
  settleMercenaries(attacker);
  settleMercenaries(defender);

  return {
    attacker, defender, op,
    sent: agentsSent, intercepted, exposed,
    detail, victimDetail, resourcesDestroyed, gearDestroyed, turnsSpent: cost,
  };
}

/** Agents lost. Hired ones are taken first — while sellsword agents remain, one
 *  of your own is the one lost only INTERCEPTION.REGULAR_SHARE of the time. */
function losePersonnel(p: Player, arm: "spy" | "scout", n: number) {
  let left = n;
  const mercPool = arm === "spy" ? p.army.mercenaries.spies : p.army.mercenaries.scouts;
  const takeMerc = Math.min(mercPool, Math.round(left * (1 - INTERCEPTION.REGULAR_SHARE)));
  if (arm === "spy") p.army.mercenaries.spies -= takeMerc;
  else p.army.mercenaries.scouts -= takeMerc;
  left -= takeMerc;
  if (arm === "spy") p.army.spies = Math.max(0, p.army.spies - left);
  else p.army.scouts = Math.max(0, p.army.scouts - left);
}

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/** How many agents of one arm this realm may keep. */
export function covertCap(p: Player, arm: "spy" | "scout"): number {
  const pop = totalPopulation(p);
  const perArm = Math.floor(pop * COVERT_CAPS_PER_ARM);
  const combined = Math.floor(pop * COVERT_CAPS_COMBINED);
  const other = arm === "spy" ? p.army.scouts : p.army.spies;
  return Math.max(0, Math.min(perArm, combined - other));
}

import { COVERT_CAPS } from "../constants";
const COVERT_CAPS_PER_ARM = COVERT_CAPS.PER_ARM;
const COVERT_CAPS_COMBINED = COVERT_CAPS.COMBINED;
