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
  EFFECT_PER_LEVEL,
  GUILD_BONUS_PER_LEVEL,
  INTERCEPTION,
  PREPARATION,
  RECON_FUZZ,
  REGULAR_SPY_POWER,
  REFUSAL_RATE,
  SLIP_THROUGH,
  SCOUT_MISSION,
  LODGE_BONUS_PER_LEVEL,
  MAX_FIELD_LEVEL,
  RACES,
  RESEARCH_FIELDS,
  COVERT_LOG_DAYS,
  SIEGE_COUNTERS,
  SIEGE_GEAR,
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
  veterancyBonus,
  type CovertFact,
  type CovertRecord,
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
  detail: string; // what the attacker learns or did — the one-line summary
  /** The same intelligence in columns, for the ops that return FIGURES. The
   *  desk renders this as a table; `detail` stays the tiding and the fallback. */
  facts?: CovertFact[];
  victimDetail?: string; // what the victim sees (anonymous unless exposed)
  /** Goods BURNED. Feeds the era's "Vandal" record, so only arson may fill it —
   *  a thief moves goods rather than destroying them, and counting theft here
   *  would crown the wrong person. */
  resourcesDestroyed?: number;
  /** Goods CARRIED OFF, which is a different thing and kept apart for the
   *  reason above. Theft used to report nothing at all: it plundered correctly
   *  and then filed a record that said zero. */
  resourcesStolen?: number;
  gearDestroyed?: number;
  turnsSpent: number;
}

/** Derived, never chosen — you cannot under-fund an operation, you can only
 *  send fewer people. Rangers cost a flat SCOUT_MISSION.TURNS_PER_SCOUT apiece
 *  whatever they are looking at; knives are priced by how deep the op goes. */
export function covertTurnCost(op: CovertOpMeta, agents: number): number {
  if (op.arm === "scout") return agents * SCOUT_MISSION.TURNS_PER_SCOUT;
  return Math.ceil(agents * op.turnsPerAgent);
}

/**
 * Rangers a mission needs, before deciding how many you actually sent.
 *
 * Scales with the SIZE OF THE REALM you are looking at — counting a giant's
 * granaries is an expedition, counting a neighbour's is an afternoon — and
 * Pathfinding buys the whole thing down.
 */
export function scoutsNeeded(op: CovertOpMeta, target: Player, scout: Player): number {
  const base = op.scouts ?? 1;
  const size = 1 + totalPopulation(target) / SCOUT_MISSION.POP_SCALE;
  const relief = 1 - Math.min(0.9, researchLevel(scout, "pathfinding") * SCOUT_MISSION.PATHFINDING_RELIEF);
  return Math.max(1, Math.ceil(base * size * relief));
}

/**
 * A figure as a scouting party actually reports it.
 *
 * At full strength the truth, plainly. Short-handed, a range whose width is
 * RECON_FUZZ scaled by how far short you fell — and the truth sits at an
 * UNKNOWABLE POSITION INSIDE IT, never the midpoint. A centred range would hand
 * anyone perfect intelligence for half the rangers, which is the whole thing
 * this exists to stop.
 */
function reported(value: number, fill: number, rng: Rng): string {
  if (fill >= 1) return Math.round(value).toLocaleString("en-US");
  const width = RECON_FUZZ * (1 - fill);
  const below = rng() * width; // how far the low end sits under the truth
  const lo = Math.round(value * (1 - below));
  const hi = Math.round(value * (1 + (width - below)));
  if (hi <= lo) return lo.toLocaleString("en-US");
  return `${lo.toLocaleString("en-US")}–${hi.toLocaleString("en-US")}`;
}

/** Every number in a filed report, blurred to what the party could actually
 *  establish. Anything that is not a plain number — a wall's name, a race — is
 *  left exactly as it was: you either saw the Citadel or you did not. */
function blur(facts: CovertFact[] | undefined, fill: number, rng: Rng): CovertFact[] | undefined {
  if (!facts || fill >= 1) return facts;
  const one = (text: string) =>
    text.replace(/\d[\d,]*/g, (m) => reported(Number(m.replace(/,/g, "")), fill, rng));
  return facts.map((f) => ({
    label: f.label,
    value: one(f.value),
    note: f.note ? one(f.note) : undefined,
  }));
}

/**
 * What ONE agent is worth before the dice — race, research, the house they came
 * out of. Held apart from the roll so the refusal below can judge an order on
 * its nominal odds; a refusal that came and went with the luck would be
 * unreadable.
 *
 * Additive pool, exactly as in battle — but with NO veterancy term. The shadow
 * war does not keep a service record: what an agent is worth is what you have
 * paid for them in research and stone, not what they have lived through.
 */
const agentPool = (p: Player, arm: "spy" | "scout"): number => {
  const base = AGENT_POWER[arm].power;
  const race = arm === "spy" ? RACES[p.race].spy : RACES[p.race].scout;
  const building = arm === "spy"
    ? GUILD_BONUS_PER_LEVEL * level(p, "shadow_guild")
    : LODGE_BONUS_PER_LEVEL * level(p, "rangers_lodge");
  const field = arm === "spy" ? "tradecraft" : "pathfinding";
  return base * (1 + (race - 1) + researchLevel(p, field) * EFFECT_PER_LEVEL + building);
};

const agentPower = (
  p: Player,
  arm: "spy" | "scout",
  count: number,
  rng: Rng,
): number => count * agentPool(p, arm) * luck(rng, COVERT_LUCK_SWING);

/** What spending longer than the minimum is worth. See PREPARATION. */
export function preparationBonus(spent: number, minimum: number): number {
  if (minimum <= 0 || spent <= minimum) return 1;
  return 1 + Math.min(PREPARATION.MAX, (spent / minimum - 1) * PREPARATION.PER_EXTRA_MULTIPLE);
}

/**
 * How long a lingering effect — unrest, doubt — actually runs.
 *
 *     ticks = a day × (how many got through) × (what the watch could NOT soak)
 *
 * Both halves used to be missing. The duration was a flat day whether one spy
 * came over the wall or a hundred, and a realm full of rangers suffered it
 * exactly as long as a realm with none. Now the size of the infiltration and
 * the weight of the watch each move it, which is what makes keeping scouts
 * worth the population they cost — they are paid twice for the same men, once
 * in knives caught and once in hours cut.
 *
 * Floored at MIN_DURATION_FRACTION so a near-miss still reads as an event
 * rather than a phantom.
 */
function lingerTicks(survivors: number, absorb: number, warX: number): number {
  const bite = Math.min(1, survivors / COVERT_EFFECTS.INFILTRATION_SCALE);
  const raw = TURNS_PER_DAY * bite * (1 - absorb);
  const floor = TURNS_PER_DAY * COVERT_EFFECTS.MIN_DURATION_FRACTION;
  return Math.max(1, Math.round(Math.max(floor, raw) * warX));
}

/** Ticks as prose. A game day is TURNS_PER_DAY ticks and 24 hours. */
function hoursOf(ticks: number): string {
  const hours = Math.max(1, Math.round((ticks / TURNS_PER_DAY) * 24));
  if (hours >= 48) return `${Math.round(hours / 24)} days`;
  return hours === 1 ? "an hour" : `${hours} hours`;
}

export function runCovertOp(
  attackerIn: Player,
  defenderIn: Player,
  opId: string,
  agentsSent: number,
  currentTick: number,
  rng: Rng,
  atWar = false,
  /** Turns to commit. The op's cost is a MINIMUM — anything above it buys the
   *  knives time to prepare (PREPARATION). Below it, or omitted, pays the
   *  minimum. Rangers ignore it: their turns are already priced per head. */
  turnsOffered?: number,
): CovertResult {
  const op = covertOp(opId);
  if (!op) throw new EngineError("op", "Unknown operation");
  const attacker = structuredClone(attackerIn);
  const defender = structuredClone(defenderIn);
  const arm = op.arm;

  // The BUILDING is the gate. Research only ever multiplies (see agentPower,
  // and the note over COVERT_OPS for why it is no longer the other way round).
  const house = arm === "spy" ? "shadow_guild" : "rangers_lodge";
  const houseName = arm === "spy" ? "Shadow Guild" : "Ranger's Lodge";
  if (level(attacker, house) < op.level) {
    throw new EngineError(house, `${op.name} needs a ${houseName} at level ${op.level}`);
  }
  if (!Number.isInteger(agentsSent) || agentsSent <= 0) {
    throw new EngineError("count", "Send at least one agent");
  }
  const available = arm === "spy"
    ? attacker.army.spies + attacker.army.mercenaries.spies
    : attacker.army.scouts + attacker.army.mercenaries.scouts;
  if (available < agentsSent) throw new EngineError(arm, `Not enough ${arm === "spy" ? "spies" : "scouts"}`);

  /**
   * WHO ACTUALLY WENT. The party fills from the HIRED before it touches your
   * own — 20 sent from a pool of 25 sellswords is 20 sellswords — and one of
   * your OWN is worth REGULAR_SPY_POWER hired knives, against the watch and at
   * the work alike. So the only way to get your own people into an operation is
   * to send enough to exhaust the hire pool, which is also exactly how you put
   * them in danger. The reward and the risk arrive together.
   */
  const mercsGone = arm === "spy" ? Math.min(attacker.army.mercenaries.spies, agentsSent) : 0;
  const regularsGone = arm === "spy" ? agentsSent - mercsGone : 0;
  /** The party's weight, in regulars-equivalent. */
  const partyWorth = regularsGone * REGULAR_SPY_POWER + mercsGone;

  const minimum = covertTurnCost(op, agentsSent);
  const cost = arm === "spy" ? Math.max(minimum, Math.floor(turnsOffered ?? minimum)) : minimum;
  const prepared = arm === "spy" ? preparationBonus(cost, minimum) : 1;

  // ── The guild master's answer ─────────────────────────────────────────────
  // Judged on nominal worth, no dice, BEFORE a single turn is spent. Agents
  // ordered into a realm watched so heavily that nine in ten will not come home
  // simply decline, and declining is free. Buying them more time (above) is one
  // of the two ways to change the answer; the other is sending more of them.
  if (arm === "spy") {
    const watch = defender.army.scouts + defender.army.mercenaries.scouts;
    const nominalSpy = partyWorth * agentPool(attacker, "spy") * prepared;
    const nominalWatch = watch * agentPool(defender, "scout");
    if (nominalSpy > 0 && nominalWatch > 0) {
      const odds = Math.min(
        INTERCEPTION.MAX,
        INTERCEPTION.AT_PARITY * (nominalWatch / nominalSpy) * op.detection,
      );
      // Judged on how many the watch would lay HANDS on. Most of the grabbed
      // Half the grabbed wriggle free (SLIP_THROUGH), so losses top out near 45% and a
      // threshold above that could never fire — but a night where three in five
      // of your people are seized is a disaster whoever walks away from it, and
      // that is what a guild master refuses.
      if (odds > REFUSAL_RATE) {
        throw new EngineError(
          "refused",
          `Your guild master refuses: ${defender.name} is watched far too closely for ${agentsSent} to walk in and out again. Send more, or give them longer to prepare.`,
        );
      }
    }
  }

  if (attacker.spyTurnsAvailable < cost) {
    throw new EngineError("spyTurns", `${op.name} with ${agentsSent} agents costs ${cost} spy turns.`);
  }
  attacker.spyTurnsAvailable -= cost;

  // ── Interception ──────────────────────────────────────────────────────────
  // Scouts do not hunt. They stand watch, and what they stop is decided by
  // weight of numbers on both sides. A realm with NO rangers is robbed at will.
  let intercepted = 0;
  /** How much of the blow the watch soaked, 0-1. Read by the lingering ops to
   *  decide how long they last; 0 when there are no rangers at all. */
  let absorb = 0;
  /** The watch outweighed the knives outright — nothing takes hold. */
  let bounced = false;
  let mercsTaken = 0;
  let regularsTaken = 0;
  /** Rangers on the walls when the knives came — read by the clean-run notice. */
  const watching = defender.army.scouts + defender.army.mercenaries.scouts;
  if (arm === "spy") {
    const spyPwr = agentPower(attacker, "spy", partyWorth, rng) * prepared;
    const scoutPwr = watching > 0 ? agentPower(defender, "scout", watching, rng) : 0;
    if (scoutPwr > 0 && spyPwr > 0) {
      const ratio = scoutPwr / spyPwr;
      absorb = Math.min(1, ratio);
      // EVERY spy operation is stopped outright by a watch that outweighs it.
      // Both worths carry an independent COVERT_LUCK_SWING roll, so at nominal
      // parity this is a coin-flip rather than a wall — see the note there.
      bounced = scoutPwr >= spyPwr;
      const rate = Math.min(
        INTERCEPTION.MAX,
        INTERCEPTION.AT_PARITY * ratio * op.detection,
      );
      // BEING GRABBED IS NOT BEING TAKEN. The watch lays hands on this many and
      // half of them wriggle free, whoever was paying: a hand closing on a
      // shoulder in the dark does not ask.
      const grabbed = rollCount(rng, agentsSent, rate);
      // Hands fall on the hired first, as they do everywhere else in the game.
      const mercsGrabbed = Math.min(mercsGone, grabbed);
      const regularsGrabbed = Math.min(regularsGone, grabbed - mercsGrabbed);
      mercsTaken = rollCount(rng, mercsGrabbed, 1 - SLIP_THROUGH);
      regularsTaken = rollCount(rng, regularsGrabbed, 1 - SLIP_THROUGH);
      intercepted = mercsTaken + regularsTaken;
    }
    if (intercepted > 0) {
      attacker.army.mercenaries.spies = Math.max(0, attacker.army.mercenaries.spies - mercsTaken);
      attacker.army.spies = Math.max(0, attacker.army.spies - regularsTaken);
      defender.recentAttackers.push({ playerId: attacker.id, tick: currentTick });
    }
  }

  /**
   * WHO GOT THROUGH — and what they are worth once inside.
   *
   * Every effect below is scaled by this rather than by a head count, because
   * "four times as effective" has to mean at the WORK as well as against the
   * watch. A party of your own burns four times what bought men would.
   */
  const survivors = arm === "spy"
    ? Math.max(0, (regularsGone - regularsTaken) * REGULAR_SPY_POWER + (mercsGone - mercsTaken))
    : agentsSent - intercepted;
  /** Bodies that came home, for the prose — effects use `survivors` above. */
  const headsHome = agentsSent - intercepted;
  // Clan war doubles what sabotage achieves. Applied to the finished magnitude
  // below (after each op's cap) so it still bites when the cap is already the
  // binding constraint — scaling the agent count would not.
  const warX = atWar ? COVERT_WAR_MULTIPLIER : 1;
  const exposed = intercepted > 0;
  let detail = "";
  let facts: CovertFact[] | undefined;
  let victimDetail: string | undefined;
  let resourcesDestroyed = 0;
  let resourcesStolen = 0;
  let gearDestroyed = 0;

  if (headsHome <= 0) {
    detail = `Disaster — all ${agentsSent} were taken at the wall. ${defender.name} knows the hand behind it.`;
    victimDetail = `Rangers took ${intercepted} of ${attacker.name}'s agents attempting "${op.name}". The revenge window is open.`;
    settleMercenaries(attacker);
    return { attacker, defender, op, sent: agentsSent, intercepted, exposed, detail, facts, victimDetail, turnsSpent: cost };
  }

  // ── How well the party was funded ─────────────────────────────────────────
  // Scouts alone. Nobody is caught and nobody dies; coming up short costs you
  // certainty, and coming up far short costs you the night.
  const needed = arm === "scout" ? scoutsNeeded(op, defender, attacker) : 0;
  const fill = arm === "scout" ? Math.min(1, agentsSent / needed) : 1;
  if (arm === "scout" && fill < SCOUT_MISSION.MIN_FILL) {
    detail = `We could not finish the mission — ${agentsSent} rangers is too few for a realm that size. It would take ${needed}.`;
    settleMercenaries(attacker);
    return { attacker, defender, op, sent: agentsSent, intercepted, exposed, detail, facts, victimDetail, turnsSpent: cost };
  }

  // Some got over the wall and none of it mattered: the watch was simply
  // heavier than the knives. They keep their lives and lose the night.
  if (bounced) {
    detail = intercepted > 0
      ? `The rangers were waiting. ${intercepted} of ours were taken and the rest found every door watched — nothing of "${op.name}" took hold.`
      : `Every door watched, every yard walked. The rangers are too many; nothing of "${op.name}" took hold.`;
    victimDetail = intercepted > 0
      ? `Your rangers took ${intercepted} of ${attacker.name}'s agents and turned back the rest. Nothing was touched.`
      : `Your rangers turned strangers away in the night. Nothing was touched, and no one was caught to name.`;
    settleMercenaries(attacker);
    settleMercenaries(defender);
    return { attacker, defender, op, sent: agentsSent, intercepted, exposed, detail, facts, victimDetail, turnsSpent: cost };
  }

  // ── The work ──────────────────────────────────────────────────────────────
  switch (op.id) {
    // ── SCOUT: intelligence ───────────────────────────────────────────────
    case "survey_coffers": {
      const r = defender.resources;
      facts = [
        { label: "Gold", value: fmt(defender.gold), note: `${fmt(unbankedGold(defender))} unvaulted` },
        ...(["food", "wood", "stone", "ore"] as Resource[]).map((k) => ({
          label: k.charAt(0).toUpperCase() + k.slice(1),
          value: fmt(r[k]),
          note: `${fmt(unstored(defender, k))} exposed`,
        })),
      ];
      detail = `Their coffers counted — ${fmt(unbankedGold(defender))} gold lies unvaulted.`;
      break;
    }
    case "map_walls": {
      const crewed = Object.entries(defender.army.siegeCounters)
        .filter(([, n]) => (n as number) > 0)
        .map(([t, n]) => `${n} ${SIEGE_COUNTERS[t as CounterType].name}`);
      facts = [
        { label: "Walls", value: `Level ${level(defender, "walls")}`, note: `${Math.round(defender.wallIntegrity * 100)}% sound` },
        { label: "Masonry standing", value: fmt(wallHealth(defender) * defender.wallIntegrity), note: "health" },
        { label: "Engine Yard", value: `Level ${level(defender, "war_foundry")}` },
        { label: "Defensive works", value: crewed.length ? crewed.join(", ") : "none at all" },
      ];
      detail = crewed.length
        ? `Walls level ${level(defender, "walls")} at ${Math.round(defender.wallIntegrity * 100)}%, and a battery behind them.`
        : `Walls level ${level(defender, "walls")} at ${Math.round(defender.wallIntegrity * 100)}%, and not one defensive engine.`;
      break;
    }
    case "map_army": {
      const a = defender.army;
      const tiers = (t: typeof a.footmen) => `${t.light} light · ${t.medium} medium · ${t.heavy} heavy`;
      facts = [
        { label: "Footmen", value: fmt(troopTotal(a.footmen)), note: tiers(a.footmen) },
        { label: "Archers", value: fmt(troopTotal(a.archers)), note: tiers(a.archers) },
        { label: "Cavalry", value: fmt(troopTotal(a.cavalry)), note: tiers(a.cavalry) },
        { label: "Engineers", value: fmt(a.siegeEngineers) },
        { label: "Sellswords", value: fmt(mercTroops(a.mercenaries)), note: "screen the regulars of their own rank" },
        { label: "Stamina", value: `${a.stamina} / 100` },
        { label: "Veterancy", value: `+${(veterancyBonus(a.experiencePoints) * 100).toFixed(1)}%` },
        { label: "Sortie orders", value: a.sortieEnabled ? "they will ride out" : "they will hold the wall" },
      ];
      detail = `Their muster counted — ${fmt(troopTotal(a.footmen) + troopTotal(a.archers) + troopTotal(a.cavalry))} under arms at ${a.stamina}% stamina.`;
      break;
    }
    case "map_siege": {
      const train = (Object.keys(defender.army.siegeGear) as SiegeGearType[])
        .filter((t) => defender.army.siegeGear[t] > 0)
        .map((t) => `${defender.army.siegeGear[t]} ${t.replace("_", " ")}`);
      facts = train.length
        ? [
            ...(Object.keys(defender.army.siegeGear) as SiegeGearType[])
              .filter((t) => defender.army.siegeGear[t] > 0)
              .map((t) => ({
                label: t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
                value: fmt(defender.army.siegeGear[t]),
                note: `${Math.round((defender.army.siegeGearIntegrity[t] ?? 1) * 100)}% sound`,
              })),
            { label: "Engineers to crew it", value: fmt(defender.army.siegeEngineers) },
          ]
        : [{ label: "Siege train", value: "none at all", note: "no bombardment is coming from that quarter" }];
      detail = train.length
        ? `Their siege train is ${train.length} kind${train.length === 1 ? "" : "s"} of engine, crewed by ${fmt(defender.army.siegeEngineers)}.`
        : "They keep no siege train at all — no bombardment is coming from that quarter.";
      break;
    }
    case "map_research": {
      facts = RESEARCH_FIELDS.map((f) => ({
        label: f.name,
        value: `${defender.research.levels[f.id] ?? 0} / ${MAX_FIELD_LEVEL}`,
        note: f.ranked ? undefined : "shadow field — no ranking score",
      }));
      const total = RESEARCH_FIELDS.reduce((n, f) => n + (defender.research.levels[f.id] ?? 0), 0);
      detail = `Their Collegium read end to end — ${total} levels across ${RESEARCH_FIELDS.length} fields.`;
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
        resourcesStolen += amt;
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
      const ticks = lingerTicks(survivors, absorb, warX);
      defender.unrestUntilTick = currentTick + ticks;
      detail = `Agitators planted: ${defender.name} loses a quarter of taxes and production for ${hoursOf(ticks)}, and no settlers will come.`;
      victimDetail = `Unrest in the streets! Taxes and production fall and settlers turn away for ${hoursOf(ticks)}.`;
      break;
    }
    case "sow_doubt": {
      const ticks = lingerTicks(survivors, absorb, warX);
      defender.researchDoubtUntilTick = currentTick + ticks;
      detail = `Whisperers among their scholars — ${defender.name}'s research crawls for ${hoursOf(ticks)}.`;
      victimDetail = `Doubt spreads through the Collegium and the work slows to a crawl for ${hoursOf(ticks)}.`;
      break;
    }
    case "assassinate_scouts": {
      // HALF AND HALF, and the knives do not ask who is paying. This is the one
      // op aimed at the thing that is hardest to touch — regular rangers, who
      // are population — so it does not hide entirely behind the hired the way
      // a blow in the field does. Either pool absorbing the other's share when
      // it runs short, so a garrison of pure sellswords still bleeds.
      const want = Math.floor(survivors * COVERT_EFFECTS.ASSASSINATE_PER_SPY);
      const half = Math.floor(want / 2);
      const ownDead = Math.min(defender.army.scouts, half);
      const hiredDead = Math.min(defender.army.mercenaries.scouts, want - ownDead);
      // Whatever one pool could not absorb falls to the other.
      const spill = want - ownDead - hiredDead;
      const extraOwn = Math.min(defender.army.scouts - ownDead, spill);
      const extraHired = Math.min(defender.army.mercenaries.scouts - hiredDead, spill - extraOwn);
      defender.army.scouts -= ownDead + extraOwn;
      defender.army.mercenaries.scouts -= hiredDead + extraHired;
      const killed = ownDead + extraOwn + hiredDead + extraHired;
      // The sellsword rangers who can no longer be commanded are paid off — the
      // cascade, same as the army.
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

  // A short-handed party establishes ranges rather than figures. Applied last,
  // over whatever the mission gathered, so no individual case has to know.
  if (arm === "scout" && fill < 1) {
    facts = blur(facts, fill, rng);
    detail = `${detail} With ${agentsSent} of the ${needed} rangers such a realm wants, the numbers are estimates.`;
  }

  // A CLEAN RUN IS NO LONGER INVISIBLE. If the watch caught nobody but somebody
  // was plainly about, the rangers still say so — no name, no revenge window.
  // Keeping scouts should tell you something even on the nights it fails.
  if (arm === "spy" && watching > 0 && intercepted === 0) {
    const seen = "Your rangers marked strangers about the walls in the night — no one was taken, and there is no name to put to it.";
    victimDetail = victimDetail ? `${victimDetail} ${seen}` : seen;
  }

  settleMercenaries(attacker);
  settleMercenaries(defender);

  return {
    attacker, defender, op,
    sent: agentsSent, intercepted, exposed,
    detail, facts, victimDetail, resourcesDestroyed, resourcesStolen, gearDestroyed, turnsSpent: cost,
  };
}


const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/** How many agents of one arm this realm may keep. */
export function covertCap(p: Player, arm: "spy" | "scout"): number {
  // Against your PEOPLE — civilians and regulars alike, sellswords never (see
  // totalPopulation). It bounds how many of your OWN you may put in the shadow
  // service; hired knives sit on top of it under the ordinary hire ratio.
  const pop = totalPopulation(p);
  const perArm = Math.floor(pop * COVERT_CAPS_PER_ARM);
  const combined = Math.floor(pop * COVERT_CAPS_COMBINED);
  const other = arm === "spy" ? p.army.scouts : p.army.spies;
  return Math.max(0, Math.min(perArm, combined - other));
}

/** Engine crews of your OWN — the same rule, twice the room. Hired crews are
 *  bounded separately, by the hire ratio against these. */
export function engineerCap(p: Player): number {
  return Math.floor(totalPopulation(p) * ENGINEER_CAP);
}

import { COVERT_CAPS, ENGINEER_CAP, SIEGE_STOCK_RATIO } from "../constants";
const COVERT_CAPS_PER_ARM = COVERT_CAPS.PER_ARM;
const COVERT_CAPS_COMBINED = COVERT_CAPS.COMBINED;

// ── The intelligence log ────────────────────────────────────────────────────

/**
 * File a covert report on the attacker, newest first, and drop anything older
 * than COVERT_LOG_DAYS.
 *
 * Pruned on WRITE rather than on read, so the stored player never carries an
 * unbounded list and a page that renders the log does not have to know the
 * retention rule. Called from the pipeline, which is where the tick and the
 * target's name are both in hand.
 */
export function recordCovert(
  p: Player,
  rec: CovertRecord,
  currentTick: number,
): void {
  const log = (p.covertLog ??= []);
  log.unshift(rec);
  const oldest = currentTick - COVERT_LOG_DAYS * TURNS_PER_DAY;
  p.covertLog = log.filter((r) => r.tick >= oldest);
}

/** The reports still inside the window, newest first. Reading is a filter too:
 *  ticks pass between writes, so a log written yesterday ages on its own. */
export function covertHistory(p: Player, currentTick: number): CovertRecord[] {
  const oldest = currentTick - COVERT_LOG_DAYS * TURNS_PER_DAY;
  return (p.covertLog ?? []).filter((r) => r.tick >= oldest);
}

/**
 * How many of each engine a realm may KEEP, offensive and defensive counted
 * apart. See SIEGE_STOCK_RATIO for why the yard is not allowed to be a bank.
 *
 * "Manned" is what your engineers could crew if they turned their hands to that
 * one type and nothing else — so the allowance is generous per weapon and tight
 * across a whole park, which is the shape a stockpile runs into and a working
 * train does not.
 */
export function siegeStockRoom(p: Player, which: "gear"): Record<SiegeGearType, number>;
export function siegeStockRoom(p: Player, which: "counters"): Record<CounterType, number>;
export function siegeStockRoom(p: Player, which: "gear" | "counters"): Record<string, number> {
  const crews = p.army.siegeEngineers + p.army.mercenaries.engineers;
  const table: Record<string, { crew: number }> = which === "gear" ? SIEGE_GEAR : SIEGE_COUNTERS;
  const out: Record<string, number> = {};
  for (const [type, spec] of Object.entries(table)) {
    out[type] = Math.floor((crews / spec.crew) * SIEGE_STOCK_RATIO);
  }
  return out;
}
