// The engine duel — where sieges are actually decided (spec/combat.md).
//
// Counters do not "cancel" engines any more. They SHOOT at them. Each type
// trades fire with the one it answers, every round, and both sides come away
// with wreckage. That single change is what turns a bombard from one decisive
// volley into a war of attrition: an attacker must grind the battery down
// before the walls will come down, and a defender who mends between volleys
// can hold out indefinitely.
//
// It also removes the need for any "suppression" constant — a battery that has
// shot half your trebuchets to splinters suppresses you by arithmetic.

import {
  ARTILLERY_DUEL,
  COUNTER_DUEL,
  COUNTER_FOR,
  COUNTER_TYPES,
  SIEGE_COUNTERS,
  SIEGE_DESTROYED_BELOW,
  SIEGE_GEAR,
} from "../../constants";
import type { CounterType } from "../../constants/buildings";
import { rollBand, rollCount, type Rng } from "../rng";
import type { Player, SiegeGearType } from "../types";
import { counterBatteryDelivery, effectiveness, siegeBonusPool, siegeDelivery } from "./model";

export const GEAR_TYPES: SiegeGearType[] = [
  "trebuchets",
  "ballistae",
  "siege_towers",
  "rams",
  "ladders",
  "ropes",
];

/** Engines crewed heaviest-first — a crew of five is better spent on a
 *  trebuchet than on five grapple teams. */
export function crewGear(
  gear: Record<SiegeGearType, number>,
  engineers: number,
): Record<SiegeGearType, number> {
  const out = { ropes: 0, ladders: 0, siege_towers: 0, rams: 0, ballistae: 0, trebuchets: 0 };
  let left = engineers;
  for (const t of GEAR_TYPES) {
    const can = Math.min(gear[t], Math.floor(left / SIEGE_GEAR[t].crew));
    out[t] = can;
    left -= can * SIEGE_GEAR[t].crew;
  }
  return out;
}

export function crewCounters(
  counters: Record<CounterType, number>,
  engineers: number,
): Record<CounterType, number> {
  const out = {
    billhooks: 0,
    forkpoles: 0,
    fire_pots: 0,
    boiling_oil: 0,
    hoardings: 0,
    counter_engine: 0,
  };
  let left = engineers;
  for (const t of COUNTER_TYPES) {
    const can = Math.min(counters[t], Math.floor(left / SIEGE_COUNTERS[t].crew));
    out[t] = can;
    left -= can * SIEGE_COUNTERS[t].crew;
  }
  return out;
}

/** On defence, engineers man the counters FIRST — that is what they are for —
 *  and only spare hands are left to work the offensive engines and shoot back.
 *  The same corps does both jobs, never at the same time. */
export function defenderCrews(p: Player, engineers: number) {
  const counters = crewCounters(p.army.siegeCounters, engineers);
  const used = COUNTER_TYPES.reduce((s, t) => s + counters[t] * SIEGE_COUNTERS[t].crew, 0);
  return { counters, offensive: crewGear(p.army.siegeGear, Math.max(0, engineers - used)) };
}

// ── Live engine state ───────────────────────────────────────────────────────

/** An engine park during a battle: how many are manned, and how whole they are.
 *  Power scales with health, so a battered park fires weaker — the attrition
 *  curve falls out of the model rather than being bolted on. */
export interface Park<T extends string> {
  crewed: Record<T, number>;
  integrity: Record<T, number>;
  destroyed: Partial<Record<T, number>>;
  worn: Partial<Record<T, number>>;
}

export function makePark<T extends string>(
  crewed: Record<T, number>,
  integrity: Record<T, number>,
): Park<T> {
  return { crewed: { ...crewed }, integrity: { ...integrity }, destroyed: {}, worn: {} };
}

const gearPower = (t: SiegeGearType, park: Park<SiegeGearType>) =>
  park.crewed[t] * SIEGE_GEAR[t].power * park.integrity[t];

const counterPower = (t: CounterType, park: Park<CounterType>) =>
  park.crewed[t] * SIEGE_COUNTERS[t].power * park.integrity[t];

/** Apply damage to one engine type. Health is a shared pool across the type;
 *  when it drains past the wreck threshold, engines are lost outright and the
 *  remainder carries over. Returns how many were destroyed. */
export function damagePark<T extends string>(
  park: Park<T>,
  t: T,
  damage: number,
  unitHealth: number,
): number {
  if (park.crewed[t] <= 0 || damage <= 0) return 0;
  const pool = park.crewed[t] * unitHealth * park.integrity[t];
  const remaining = Math.max(0, pool - damage);
  const newIntegrityAcrossAll = remaining / (park.crewed[t] * unitHealth);
  park.worn[t] = (park.worn[t] ?? 0) + (park.integrity[t] - newIntegrityAcrossAll);

  if (newIntegrityAcrossAll >= SIEGE_DESTROYED_BELOW) {
    park.integrity[t] = newIntegrityAcrossAll;
    return 0;
  }
  // Past the wreck line: engines are lost until the survivors are whole enough
  // to keep fighting.
  const survivors = Math.floor(remaining / (unitHealth * SIEGE_DESTROYED_BELOW));
  const lost = Math.max(0, park.crewed[t] - survivors);
  park.crewed[t] -= lost;
  park.destroyed[t] = ((park.destroyed[t] as number) ?? 0) + lost;
  park.integrity[t] =
    park.crewed[t] > 0 ? Math.min(1, remaining / (park.crewed[t] * unitHealth)) : 0;
  return lost;
}

// ── One round of the duel ───────────────────────────────────────────────────

export interface DuelRound {
  /** Attacking engineers cut down by counters that overwhelmed their engines. */
  attackerEngineerKills: number;
  defenderEngineerKills: number;
  notes: string[];
}

export interface DuelContext {
  attacker: Player;
  defender: Player;
  atkPark: Park<SiegeGearType>;
  defPark: Park<CounterType>;
  war: boolean;
  rng: Rng;
  /** Rolled once per battle — defenders shoot from a fixed emplacement at a
   *  known range, and that is worth something every round. */
  defenderEdge: number;
  /** How many volleys' worth this single resolution represents. Bombard passes
   *  BOMBARD_INTENSITY; a field battle leaves it at 1. */
  intensity?: number;
  /**
   * What share of the attacker's engine power is aimed at the battery at all.
   *
   * A field battle leaves this undefined and the engines fire at everything in
   * parallel, as they always did. A BOMBARD sets it, because artillery can only
   * spend its fire once and the siege stance is the choice of where — see
   * SIEGE_STANCE. Their counters are unaffected either way: the defender never
   * has anything else to shoot at.
   */
  returnShare?: number;
  /**
   * Restrict the duel to these engine types. Omitted, every paired type
   * resolves — an assault brings the whole park to the wall.
   *
   * A BOMBARD passes `["trebuchets"]`: it is an artillery exchange with no
   * soldiers in it, so the rams are still in camp and the escalade tackle is
   * still on the carts. Neither should be taking fire, and neither should be
   * returning it.
   */
  only?: SiegeGearType[];
}

/**
 * Resolve one round of engine-versus-counter fire across every paired type.
 *
 * Each counter shoots at the engine it answers; each engine shoots back at
 * reduced accuracy (trebuchets are inaccurate against small hard targets —
 * the same characterisation that gives them 30% against walls). Where a
 * counter outguns its target by COUNTER_DUEL.OVERWHELM_RATIO it stops
 * bothering with the woodwork and starts killing the crews.
 */
export function runDuelRound(ctx: DuelContext): DuelRound {
  const { attacker, defender, atkPark, defPark, war, rng } = ctx;
  const intensity = ctx.intensity ?? 1;
  const out: DuelRound = { attackerEngineerKills: 0, defenderEngineerKills: 0, notes: [] };

  const atkSiege = siegeBonusPool(attacker, war);
  const defSiege = siegeBonusPool(defender, war);

  for (const gear of GEAR_TYPES) {
    const ct = COUNTER_FOR[gear];
    if (!ct) continue;
    // A BOMBARD is trebuchets against the battery and nothing else — see
    // `only`. Without this the whole park duelled: boiling oil scalded rams and
    // bill-hooks cut grapple lines in an engagement where no soldier was
    // present and nothing was being climbed. The attacker lost escalade tackle
    // that never left the camp, and the defender's oil and hooks were worn down
    // answering an assault that was not happening.
    if (ctx.only && !ctx.only.includes(gear)) continue;

    // A counter ground to wreckage stands down and STAYS down until mended:
    // it does not fire, and nothing fires at it. That is what stops a defender
    // being ground to nothing by an attacker who simply keeps coming back —
    // and what makes mending the guns a thing they have to log in and do.
    if (counterSilenced(defPark, ct)) continue;

    const enginePwr = gearPower(gear, atkPark);
    const counterRaw = counterPower(ct, defPark);
    if (enginePwr <= 0 && counterRaw <= 0) continue;

    // Who was STANDING at these engines when the fire came in. Read before
    // `damagePark` below, because reading it after meant the men vanished with
    // the machines: an engine park wiped out entirely reported zero casualties,
    // while one that merely got scratched reported plenty. Total annihilation
    // was the safest thing that could happen to a crew.
    const manning = atkPark.crewed[gear];

    // The counter's swing: its own bonus pool, the defender's emplacement
    // edge, and — for boiling oil against a ram — the fact that it is being
    // poured straight down onto men at the gate.
    const oilBonus = ct === "boiling_oil" ? COUNTER_DUEL.BOILING_OIL_BONUS : 0;
    const counterPwr =
      counterRaw * (defSiege + oilBonus + ctx.defenderEdge) * counterBatteryDelivery(defender) * intensity;

    // Counters wreck engines.
    if (counterPwr > 0 && atkPark.crewed[gear] > 0) {
      const lost = damagePark(atkPark, gear, counterPwr, SIEGE_GEAR[gear].health);
      if (lost > 0) {
        out.notes.push(COUNTER_VERB[ct](lost, label(gear)));
      }
    }

    // Engines shoot back — badly. Escalade tackle carries no weapons at all.
    const returnDelivery =
      gear === "trebuchets"
        ? siegeDelivery(attacker, "siege")
        : effectiveness(gear, "siege");
    // `returnShare` overrides the matrix when the caller is allocating fire
    // rather than letting every engine shoot at everything (see DuelContext).
    const returnFire =
      enginePwr * atkSiege * (ctx.returnShare ?? returnDelivery) * intensity;
    if (returnFire > 0 && defPark.crewed[ct] > 0) {
      const lost = damagePark(defPark, ct, returnFire, SIEGE_COUNTERS[ct].health);
      if (lost > 0) {
        // What the ATTACKER's engines manage in return. Named as a counted
        // noun (see COUNTER_PLURAL) and split by what is actually being hit:
        // knocking a gallery off a wall is not the same act as burning out a
        // cauldron crew.
        out.notes.push(
          ct === "hoardings"
            ? `Our engines tear ${lost} ${COUNTER_PLURAL[ct]} off the parapet.`
            : ct === "boiling_oil"
              ? `Our fire scatters ${lost} ${COUNTER_PLURAL[ct]} and the oil runs cold.`
              : `Our fire wrecks ${lost} ${COUNTER_PLURAL[ct]}.`,
        );
      }
    }

    // Overwhelmed: the crews are next.
    //
    // Compared RAW against RAW — `count × power × integrity` on both sides, the
    // same shape `batteryThreatens` uses — so OVERWHELM_RATIO means literally
    // "three times the guns". It used to weigh the counter's fully DELIVERED
    // fire (pool × accuracy × intensity) against the engine's raw power, which
    // made the threshold depend on research and, once intensity arrived, on a
    // multiplier that scales both sides equally in reality. At ×5 a counter
    // needed only 0.6× the guns to "overwhelm" threefold.
    if (enginePwr > 0 && counterRaw >= COUNTER_DUEL.OVERWHELM_RATIO * enginePwr) {
      const crewAtRisk = manning * SIEGE_GEAR[gear].crew;
      const killed = rollCount(rng, crewAtRisk, rollBand(rng, ARTILLERY_DUEL.ATTACKER_ENGINEER_RISK));
      if (killed > 0) {
        out.attackerEngineerKills += killed;
        out.notes.push(
          `Their ${COUNTER_PLURAL[ct]} overwhelm our ${label(gear)} entirely — ${killed} engineers cut down at their posts.`,
        );
      }
    }
  }

  return out;
}

// ── Artillery strength & the give-up rule ───────────────────────────────────

export const parkStrength = (park: Park<SiegeGearType>): number =>
  GEAR_TYPES.reduce((s, t) => s + gearPower(t, park), 0);

export const batteryStrength = (park: Park<CounterType>): number =>
  COUNTER_TYPES.reduce((s, t) => s + counterPower(t, park), 0);

/**
 * Has this counter type been beaten into silence?
 *
 * Per TYPE rather than per battery, because a defender may hold fresh Boiling
 * Oil beside shattered Counter-Engines and only the shattered ones should stand
 * down. Derived from integrity, so mending clears it — see SILENCE_FLOOR.
 */
export const counterSilenced = (park: Park<CounterType>, t: CounterType): boolean =>
  park.crewed[t] > 0 && park.integrity[t] < COUNTER_DUEL.SILENCE_FLOOR;

/** Whether ANY of the battery still answers. */
export const batteryAnswers = (park: Park<CounterType>): boolean =>
  COUNTER_TYPES.some((t) => park.crewed[t] > 0 && !counterSilenced(park, t));

/**
 * A battery falls silent only when BOTH conditions hold: seven-tenths of it is
 * wreckage AND what remains is at most half the attacker's strength.
 *
 * Requiring both is deliberate. With an OR, a defender who kept almost no
 * counters would qualify immediately and lose nothing — turtling by
 * under-investing would be free. Requiring 70% destroyed means you cannot
 * reach the give-up state without first being ground down to it, and paying
 * the engineers and engines on the way. Once silent, no more of either is
 * lost — but walls and buildings take fire freely.
 */
export function batterySilenced(startStrength: number, now: number, attackerStrength: number): boolean {
  if (startStrength <= 0) return true;
  const lost = 1 - now / startStrength;
  return lost >= ARTILLERY_DUEL.GIVE_UP_LOSS && now <= ARTILLERY_DUEL.GIVE_UP_STRENGTH * attackerStrength;
}

/** Defending engineers are only at risk once their own battery is being shot
 *  to pieces around them. */
export function defenderEngineerRisk(
  rng: Rng,
  startStrength: number,
  now: number,
  crewAtRisk: number,
  intensity = 1,
): number {
  if (startStrength <= 0 || crewAtRisk <= 0) return 0;
  const lost = 1 - now / startStrength;
  if (lost < ARTILLERY_DUEL.DEFENDER_ENGINEER_RISK_AFTER_LOSS) return 0;
  const chance = Math.min(1, rollBand(rng, ARTILLERY_DUEL.DEFENDER_ENGINEER_RISK) * intensity);
  return rollCount(rng, crewAtRisk, chance);
}

/** Whether the defender's battery is dangerous enough to threaten the crews
 *  working the attacker's engines. */
export const batteryThreatens = (defStrength: number, atkStrength: number): boolean =>
  atkStrength > 0 && defStrength >= ARTILLERY_DUEL.ATTACKER_ENGINEER_RISK_ABOVE * atkStrength;

export function rollDefenderEdge(rng: Rng): number {
  return rollBand(rng, COUNTER_DUEL.DEFENDER_EDGE);
}

/**
 * What each counter DOES to the thing it answers, in its own words.
 *
 * Every one of these read "X smash N Y" — one verb for six entirely different
 * mechanisms. A bill-hook is a hooked polearm that cuts a grapple line; a fork
 * pole shoves a ladder off the wall; fire pots set a timber tower alight;
 * boiling oil is poured on the beams; hoardings are a covered gallery that
 * takes the bolts meant for your people. Only the Counter-Engine, which is an
 * engine throwing stones back at an engine, actually smashes anything.
 *
 * `(n, what)` so each line can put the count where its own sentence wants it.
 */
const COUNTER_VERB: Record<CounterType, (n: number, what: string) => string> = {
  billhooks: (n, what) =>
    `Their bill-hooks reach over the parapet and cut ${n} of our ${what} away from the stone.`,
  forkpoles: (n, what) =>
    `Their fork poles catch ${n} of our ${what} at the top and shove them off the wall.`,
  fire_pots: (n, what) => `Fire pots burst against ${n} of our ${what} and the timber goes up.`,
  boiling_oil: (n, what) =>
    `Boiling oil comes down the wall and chars ${n} of our ${what} at the gate.`,
  // The gallery does not attack. It stands over the DEFENDERS and eats the
  // bolts meant for them — our engines spend themselves against the timber.
  hoardings: (n, what) =>
    `The hoardings take our volleys — their people shelter under the timber while ${n} of our ${what} spend themselves against it.`,
  counter_engine: (n, what) => `Their Counter-Engines answer stone for stone and smash ${n} of our ${what}.`,
};

/**
 * Counter names as a COUNTED noun. `SIEGE_COUNTERS[ct].name` is the shop label,
 * and half of it does not take a number — "our fire wrecks 15 Counter-Engine"
 * and "3 Boiling Oil" both read as typos.
 */
const COUNTER_PLURAL: Record<CounterType, string> = {
  billhooks: "bill-hook parties",
  forkpoles: "fork-pole crews",
  fire_pots: "fire-pot stands",
  boiling_oil: "cauldrons",
  hoardings: "spans of hoarding",
  counter_engine: "Counter-Engines",
};

const LABELS: Record<SiegeGearType, string> = {
  ropes: "grapple teams",
  ladders: "ladder parties",
  siege_towers: "siege towers",
  rams: "battering rams",
  ballistae: "ballistae",
  trebuchets: "trebuchets",
};
const label = (t: SiegeGearType) => LABELS[t];
