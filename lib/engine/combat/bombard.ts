// Bombard — the artillery duel (spec/combat.md).
//
// Trebuchets against Counter-Engines and nothing else: no troops march, no
// swords are drawn. The attacker must shoot the battery to pieces before the
// walls will come down, and the walls must come down before the town can be
// touched. That is three stages, each costing action turns and engine repairs,
// which is why bombardment is the expensive, grinding, deliberate way to open
// an empire — and why an online defender who mends between volleys can hold.
//
// There is no "suppression" number anywhere in here. A battery that has shot
// half your trebuchets to splinters suppresses you by arithmetic.

import {
  ARTILLERY_DUEL,
  BOMBARDABLE,
  BUILDING_HP_CURVE, // clan works are levelled, not counted
  BUILDING_INTEGRITY_FLOOR,
  LUCK_SWING,
  BOMBARD_INTENSITY,
  SIEGE_STANCE,
  SIEGE_COUNTERS,
  SIEGE_GEAR,
  WALL_BREACH_PIVOT,
  EXPERIENCE,
} from "../../constants";
import { isCounted, type BuildingId, type CounterType } from "../../constants/buildings";
import { evalCurve } from "../../constants/curves";
import { luck, rollBand, rollCount, type Rng } from "../rng";
import {
  buildingIntegrity,
  emptySiegeGear,
  level,
  veterancyBonus,
  type BattleForces,
  type BattleLogEntry,
  type BattleReport,
  type Clan,
  type Player,
  type SiegeGearType,
  type UnitLosses,
} from "../types";
import { siegeBonusPool, siegeDelivery, siegeLedger, settleMercenaries } from "./model";
import { rankingScore } from "../score";
import { matchupMultiplier } from "./battle";
import {
  batterySilenced,
  counterSilenced,
  batteryStrength,
  batteryThreatens,
  crewCounters,
  crewGear,
  defenderEngineerRisk,
  makePark,
  parkStrength,
  rollDefenderEdge,
  runDuelRound,
} from "./duel";
import { buildingHealth, damageToIntegrity, wallHealth } from "./walls";
import { displaceCivilians } from "./loot";
import type { BattleOptions, BattleOutcome } from "./battle";

const EMPTY_LOSSES: UnitLosses = {
  footmen: 0, archers: 0, cavalry: 0, engineers: 0, mercenaries: 0, mercenariesDisbanded: 0,
};

const BUILDING_LABEL: Partial<Record<BuildingId, string>> = {
  granary: "Granary", timberyard: "Timberyard", masons_yard: "Mason's Yard",
  ironhold: "Ironhold", counting_house: "Counting House", grange: "Grange",
  masons_quarry: "Mason's Quarry", deepvein_mine: "Deepvein Mine",
  sawyers_mill: "Sawyer's Mill", collegium: "Collegium",
  market_square: "Market Square", hearthstead: "Hearthstead", muster_hall: "Muster Hall",
};

function pickTarget(defender: Player, rng: Rng): BuildingId | null {
  const eligible = BOMBARDABLE.filter(
    (b) => level(defender, b.id as BuildingId) > 0 &&
      buildingIntegrity(defender, b.id as BuildingId) > BUILDING_INTEGRITY_FLOOR,
  );
  const total = eligible.reduce((s, b) => s + b.weight, 0);
  if (total === 0) return null;
  let roll = rng() * total;
  for (const b of eligible) {
    roll -= b.weight;
    if (roll <= 0) return b.id as BuildingId;
  }
  return eligible[eligible.length - 1].id as BuildingId;
}

/** Empty counter tally — an attacker brings no battery of their own. */
function crewCountersEmptyLocal(): Record<CounterType, number> {
  return { billhooks: 0, forkpoles: 0, fire_pots: 0, boiling_oil: 0, hoardings: 0, counter_engine: 0 };
}

/**
 * What one side brought to an artillery exchange. Shares its shape with the
 * battle version so one panel can render both, but the arms stay at zero: a
 * bombard has no soldiers in it and printing a host that never left home would
 * be the single most misleading thing on the page.
 */
function musterRoll(
  p: Player,
  crewedGear: Record<SiegeGearType, number>,
  crewedCounters: Record<CounterType, number>,
): BattleForces {
  const none = { light: 0, medium: 0, heavy: 0 };
  return {
    footmen: none, archers: none, cavalry: none,
    mercFootmen: none, mercArchers: none, mercCavalry: none,
    engineers: p.army.siegeEngineers + p.army.mercenaries.engineers,
    gear: { ...crewedGear },
    counters: { ...crewedCounters },
    wallLevel: level(p, "walls"),
    wallIntegrity: p.wallIntegrity,
    stamina: p.army.stamina,
    veterancy: veterancyBonus(p.army.siegeExperiencePoints),
  };
}

export function resolveBombard(
  attackerIn: Player,
  defenderIn: Player,
  opts: BattleOptions,
): BattleOutcome {
  const attacker = structuredClone(attackerIn);
  const defender = structuredClone(defenderIn);
  const rng = opts.rng;
  const war = !!opts.warBonus;
  const log: BattleLogEntry[] = [];
  const say = (round: number, text: string, extra: Partial<BattleLogEntry> = {}) =>
    log.push({ round, phase: round === 0 ? "prelude" : "walls", text, ...extra });

  defender.buildingIntegrity ??= {};

  const atkEngineers = attacker.army.siegeEngineers + attacker.army.mercenaries.engineers;
  const defEngineers = defender.army.siegeEngineers + defender.army.mercenaries.engineers;
  const atkPark = makePark<SiegeGearType>(
    crewGear(attacker.army.siegeGear, atkEngineers),
    attacker.army.siegeGearIntegrity,
  );
  const defPark = makePark<CounterType>(
    crewCounters(defender.army.siegeCounters, defEngineers),
    defender.army.siegeCounterIntegrity,
  );
  const defenderEdge = rollDefenderEdge(rng);

  /**
   * The pair that actually fights, counted BEFORE a stone flies.
   *
   * `atkPark.crewed` is decremented by `damagePark` as engines are wrecked, so
   * reading it at report time gives the survivors — which is the one thing the
   * losses already say. And a bombard is trebuchets against Counter-Engines:
   * listing rams and grapple teams on a muster roll would name gear that never
   * left the camp.
   */
  const openingTrebs = atkPark.crewed.trebuchets;
  const openingCounterEngines = defPark.crewed.counter_engine;
  const openingBattery = batteryStrength(defPark);
  const stance = attacker.army.siegeStance ?? "general";
  // A battery beaten into silence is not a target and not a threat: the guns
  // are wreckage and the crews are behind the wall. Nothing is allotted to it,
  // so the whole barrage falls on the masonry — which is precisely the price
  // the defender pays for standing down, and the reason they have to come back
  // and mend the things.
  const battery = defPark.crewed.counter_engine > 0 && !counterSilenced(defPark, "counter_engine");
  const standingDown = defPark.crewed.counter_engine > 0 && !battery;
  let engineerLossesAtk = 0;
  let engineerLossesDef = 0;
  let wallDamage = 0;
  let rounds = 0;
  let silenced = false;
  const buildingHits: Partial<Record<BuildingId, number>> = {};

  if (standingDown) {
    say(0, "Their battery is wreckage and stands abandoned — nothing answers from the keep.", {
      tone: "good",
    });
  }
  if (openingTrebs === 0) {
    say(0, "No crewed trebuchets march — the barrage never begins.", { tone: "bad" });
  } else {
    say(0, `${openingTrebs} crewed trebuchets wheel into range and open fire.`, { tone: "neutral" });
    if (defPark.crewed.counter_engine > 0) {
      say(0, `${defPark.crewed.counter_engine} Counter-Engines answer from the keep.`, { tone: "bad" });
    }
  }

  const wallHp = wallHealth(defender);

  // ── The barrage: ONE exchange, landing with BOMBARD_INTENSITY volleys' weight
  //
  // The stance decides how the trebuchets spend their fire, and they can only
  // spend it once. This is the difference from a field battle, where engines
  // shoot at everything eligible in parallel: a barrage is all the artillery
  // does, so what it aims at is the whole decision.
  const baseShare = siegeDelivery(attacker, "siege"); // 0.20, up to 0.40 with Siegecraft

  // Committing to the duel sharpens the fire that reaches their engines by half
  // — and throws the remainder away. Nothing else is touched this barrage.
  // With no battery there is nothing to duel, so the stance is moot and the
  // whole barrage falls on the masonry either way. Zeroing the structure share
  // regardless would have thrown away a bombard against an undefended wall —
  // an order to silence a battery that does not exist is not an order to stand
  // and do nothing.
  const focused = stance === "counter" && battery;
  const counterShare = !battery
    ? 0
    : focused
      ? Math.min(1, baseShare * (1 + SIEGE_STANCE.COUNTER_FOCUS_BONUS))
      : baseShare;
  const structureShare = focused ? 0 : 1 - counterShare;

  if (openingTrebs > 0) {
    rounds = 1;
    const roll = luck(rng, LUCK_SWING);

    // The barrage is loosed at the SAME MOMENT the battery answers it, exactly
    // as both sides of a field battle swing at once. Snapshot the gun-line
    // before the duel touches it: when this ran as ten sequential volleys the
    // trebuchets got their shots away on the way down, and resolving a ×5 duel
    // first would silently delete that — a battery able to wreck the whole
    // train would take zero stone in return, which no number of volleys ever
    // produced.
    const firingTrebs = atkPark.crewed.trebuchets;
    const firingIntegrity = atkPark.integrity.trebuchets;
    // And who was manning the engines on both sides when it started — see the
    // note in duel.ts. Crews are priced on who stood there, not on what was
    // left standing afterwards.
    const manningCounters = defPark.crewed.counter_engine;
    // …and how strong each battery was WHEN IT FIRED. The threat check below
    // has to read these rather than the wreckage, for the same reason: with
    // both batteries wiped out in the exchange it would otherwise compare zero
    // against zero, decide neither side was ever in danger, and report a
    // mutual annihilation with not one man hurt.
    const firingStrength = parkStrength(atkPark);

    // ── The duel ──────────────────────────────────────────────────────────
    // Their battery answers as it always did; ours replies with whatever the
    // stance allotted it. They keep their emplacement edge either way —
    // choosing to duel makes you better at it, never makes it fair.
    const duel = runDuelRound({
      attacker, defender, atkPark, defPark, war, rng, defenderEdge,
      intensity: BOMBARD_INTENSITY,
      returnShare: counterShare,
      // Trebuchets and the Counter-Engines only. Nothing else is at the wall.
      only: ["trebuchets"],
    });
    for (const note of duel.notes) log.push({ round: 1, phase: "counter-duel", text: note });
    if (focused) {
      say(1, `Every engine is laid on their battery — the walls go untouched until it is silent.`, {
        tone: "neutral",
      });
    }

    const atkStrength = parkStrength(atkPark);
    const defStrength = batteryStrength(defPark);

    // Crews die at their posts — the attacker's only once the battery is a real
    // threat, the defender's only once theirs is being shot apart. The threat is
    // judged on the batteries as they OPENED fire; the silence check below is
    // the one that wants the wreckage.
    const atRiskAtk = firingTrebs * SIEGE_GEAR.trebuchets.crew;
    if (batteryThreatens(openingBattery, firingStrength) && atRiskAtk > 0) {
      // 3 — ROLL the band. This took `.min` outright, so the attacker's crews
      // always came off at the very best case the band allows while the
      // defender's rolled properly. Nothing justified the asymmetry.
      const killed = rollCount(
        rng, atRiskAtk,
        Math.min(1, rollBand(rng, ARTILLERY_DUEL.ATTACKER_ENGINEER_RISK) * BOMBARD_INTENSITY),
      );
      if (killed > 0) {
        engineerLossesAtk += killed;
        say(1, `Counter-Engine fire finds our gun-line — ${killed} engineers killed.`, {
          attackerRegulars: killed, tone: "bad",
        });
      }
    }
    const atRiskDef = manningCounters * SIEGE_COUNTERS.counter_engine.crew;
    const defKilled = defenderEngineerRisk(rng, openingBattery, defStrength, atRiskDef, BOMBARD_INTENSITY);
    if (defKilled > 0) {
      engineerLossesDef += defKilled;
      say(1, `Their crews are cut down among the wreckage — ${defKilled} lost.`, {
        defenderRegulars: defKilled, tone: "good",
      });
    }

    // Beaten into silence THIS barrage, or already standing down when we
    // arrived. Either way it answers no more — and unlike before, that now
    // holds tomorrow too, until they mend it.
    if (standingDown || counterSilenced(defPark, "counter_engine")) {
      silenced = true;
      if (!standingDown) {
        say(1, "Their battery is beaten silent — the crews abandon the guns. It answers no more until it is mended.", {
          tone: "good",
        });
      }
    }

    // ── The fire that gets through ────────────────────────────────────────
    const power =
      firingTrebs * SIEGE_GEAR.trebuchets.power * firingIntegrity *
      siegeBonusPool(attacker, war) * roll * BOMBARD_INTENSITY * structureShare;

    if (power <= 0) {
      if (focused) {
        // Nothing here is a bug — it is the price the stance charges.
        say(1, "Not a stone is thrown at the masonry. The duel was the whole barrage.", {
          tone: "neutral",
        });
      } else if (atkPark.crewed.trebuchets === 0) {
        say(1, "Our last trebuchet is wreckage. The barrage is over.", { tone: "bad" });
      }
    } else {
      const wallsStanding = level(defender, "walls") > 0 && defender.wallIntegrity > WALL_BREACH_PIVOT;
      if (wallsStanding) {
        const dmg = power * siegeDelivery(attacker, "walls");
        const applied = Math.min(defender.wallIntegrity * wallHp, dmg);
        defender.wallIntegrity = Math.max(0, defender.wallIntegrity - damageToIntegrity(defender, applied));
        wallDamage += applied;
        say(1,
          defender.wallIntegrity <= WALL_BREACH_PIVOT
            ? `The wall is breached — the fire spills onto the town.`
            : `Stone hammers stone — the wall stands at ${Math.round(defender.wallIntegrity * 100)}%.`,
          { tone: "neutral" });
      } else {
        // A wall is one target and takes the whole weight at once. A TOWN is
        // not: the intensity is spent as separate aiming points, so a barrage
        // still walks across several roofs the way a sequence of volleys did.
        // Collapsing it to a single pick would have quietly wasted the whole
        // weighting table — stores are 52% of the weight precisely because you
        // get many draws against it, and one draw is a coin toss.
        const perPick = power / BOMBARD_INTENSITY;
        let hitAny = false;
        for (let i = 0; i < BOMBARD_INTENSITY; i++) {
          const target = pickTarget(defender, rng);
          if (!target) break;
          hitAny = true;
          const hp = buildingHealth(defender, target);
          const dmg = perPick * siegeDelivery(attacker, "buildings");
          const cur = buildingIntegrity(defender, target);
          const lost = Math.min(Math.max(0, cur - BUILDING_INTEGRITY_FLOOR), hp > 0 ? dmg / hp : 0);
          defender.buildingIntegrity[target] = cur - lost;
          buildingHits[target] = (buildingHits[target] ?? 0) + lost;
          // Burnt roofs do not dock the settler intake until the defender has
          // been back to see them — a barrage at 3am should cost sleep, not
          // growth. Cleared on their next page load. See intakeHousing.
          if (target === "hearthstead" && lost > 0) defender.roofDamageUnseen = true;
        }
        if (!hitAny) {
          say(1, "Nothing left standing to break — the barrage falls on rubble.", { tone: "neutral" });
        } else {
          for (const [b, lost] of Object.entries(buildingHits) as [BuildingId, number][]) {
            if (lost <= 0) continue;
            say(1, isCounted(b)
              ? `The barrage walks through the ${BUILDING_LABEL[b] ?? b}s — roofs come down (−${Math.round(lost * 100)}%).`
              : `The barrage cracks the ${BUILDING_LABEL[b] ?? b} open (−${Math.round(lost * 100)}%).`,
              { tone: "good" });
          }
        }
      }
    }
  }

  // ── Aftermath ─────────────────────────────────────────────────────────────
  writeBack(attacker.army.siegeGear, attacker.army.siegeGearIntegrity, atkPark);
  writeBack(defender.army.siegeCounters, defender.army.siegeCounterIntegrity, defPark);
  spendEngineers(attacker, engineerLossesAtk);
  spendEngineers(defender, engineerLossesDef);

  // Terror needs no swordsman: a bombarded town loses people too.
  const displaced = rounds > 0 ? displaceCivilians(rng, defender, "bombard", false) : 0;

  // The engineers' ledger, same rules as the battle line's. Both sides are
  // measured on the crews they killed against the crews they lost, from their
  // own end of the ladder — and the flat wage the defender used to draw for
  // merely being shot at is gone, because that is exactly the shape that made
  // being attacked the fastest way to get better at war.
  const aScore = rankingScore(attackerIn);
  const dScore = rankingScore(defenderIn);
  const aSiegeMatch = matchupMultiplier(dScore / Math.max(1, aScore));
  const dSiegeMatch = matchupMultiplier(aScore / Math.max(1, dScore));
  const aGain = siegeLedger(engineerLossesDef, engineerLossesAtk, aSiegeMatch, EXPERIENCE.WON_ATTACK);
  const dGain = siegeLedger(engineerLossesAtk, engineerLossesDef, dSiegeMatch, EXPERIENCE.WON_DEFENCE);
  attacker.army.siegeExperiencePoints = Math.max(0, attacker.army.siegeExperiencePoints + Math.round(aGain));
  defender.army.siegeExperiencePoints = Math.max(0, defender.army.siegeExperiencePoints + Math.round(dGain));

  const disbandedA = settleMercenaries(attacker);
  const disbandedD = settleMercenaries(defender);

  const buildingDamage = (Object.entries(buildingHits) as [BuildingId, number][])
    .filter(([, v]) => v > 0)
    .map(([building, integrityLost]) => ({ building, integrityLost }));

  say(rounds, `Bombardment done. ${buildingDamage.length} buildings cracked open.`, { tone: "neutral" });

  const report: BattleReport = {
    id: opts.battleId,
    tick: opts.tick,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    mode: "bombard",
    rounds,
    victor: "none",
    attackerLosses: { ...EMPTY_LOSSES, engineers: engineerLossesAtk, mercenariesDisbanded: disbandedA },
    defenderLosses: { ...EMPTY_LOSSES, engineers: engineerLossesDef, mercenariesDisbanded: disbandedD },
    regularsKilled: { attacker: engineerLossesDef, defender: engineerLossesAtk },
    civiliansDisplaced: displaced,
    wallIntegrityDamage: wallHp > 0 ? wallDamage / wallHp : 0,
    /**
     * The muster roll — and for a bombard it is deliberately thin.
     *
     * No line troops: nobody marched, so the arms are left empty rather than
     * listing an army that stayed at home. What was actually present is the
     * engineers, the trebuchets they crewed, the battery answering, and the
     * wall being shot at. The panel reads `full: false` off the mode and prints
     * only these rows.
     */
    forces: {
      attacker: musterRoll(
        attackerIn,
        { ...emptySiegeGear(), trebuchets: openingTrebs },
        crewCountersEmptyLocal(),
      ),
      defender: musterRoll(defenderIn, emptySiegeGear(), {
        ...crewCountersEmptyLocal(),
        counter_engine: openingCounterEngines,
      }),
    },
    buildingDamage: buildingDamage.length ? buildingDamage : undefined,
    siegeGearLost: atkPark.destroyed,
    siegeCountersLost: defPark.destroyed,
    siegeGearWorn: atkPark.worn,
    siegeCountersWorn: defPark.worn,
    batterySilenced: silenced,
    // A bombard never carries anything off — war doubles its DAMAGE, not its
    // nature. Cracking the storehouses is what sets up the raid that follows.
    loot: { gold: 0, resources: { food: 0, wood: 0, stone: 0, ore: 0 } },
    staminaLoss: { attacker: 0, defender: 0 },
    experienceChange: { attacker: 0, defender: 0 },
    siegeExperienceChange: { attacker: Math.round(aGain), defender: Math.round(dGain) },
    log,
  };
  return { attacker, defender, report };
}

// ── Clan works ──────────────────────────────────────────────────────────────

export type ClanBuilding = "storage" | "hall" | "wonder" | "beacon";

const CLAN_LABEL: Record<ClanBuilding, string> = {
  storage: "Clan Storage",
  hall: "Clan Hall",
  wonder: "Clan Wonder",
  beacon: "Clan Beacon",
};
export const clanBuildingLabel = (w: ClanBuilding) => CLAN_LABEL[w];

export interface ClanBombardOutcome {
  attacker: Player;
  clan: Clan;
  which: ClanBuilding;
  integrityLost: number;
  trebuchets: number;
  rounds: number;
  log: string[];
}

/** War-only strike on an enemy clan's works. No Counter-Engines guard them —
 *  clan buildings carry no Engine Yard — so nothing shoots back and no engine is
 *  lost. The price is paid elsewhere: the whole attacked clan gets one revenge. */
export function resolveClanBombard(
  attackerIn: Player,
  targetClanIn: Clan,
  which: ClanBuilding,
  opts: BattleOptions,
): ClanBombardOutcome {
  const attacker = structuredClone(attackerIn);
  const clan = structuredClone(targetClanIn);
  const log: string[] = [];
  const label = CLAN_LABEL[which];
  const engineers = attacker.army.siegeEngineers + attacker.army.mercenaries.engineers;
  const trebuchets = crewGear(attacker.army.siegeGear, engineers).trebuchets;
  let integrityLost = 0;
  let rounds = 0;

  if (trebuchets === 0) {
    log.push("No crewed trebuchets march — the barrage never begins.");
    return { attacker, clan, which, integrityLost, trebuchets, rounds, log };
  }
  log.push(`${trebuchets} crewed trebuchets wheel within range of the ${label} and open fire.`);

  // One exchange at BOMBARD_INTENSITY, like every other barrage. No counters
  // guard a clan's works — nothing shoots back — so there is no duel here and
  // the whole weight falls on the masonry.
  const hp = evalCurve(BUILDING_HP_CURVE, Math.max(1, clanLevel(clan, which)));
  const now = clan.buildings.integrity[which];
  if (now <= BUILDING_INTEGRITY_FLOOR) {
    log.push(`The ${label} is already cracked to its foundations.`);
  } else {
    rounds = 1;
    const power =
      trebuchets * SIEGE_GEAR.trebuchets.power * attacker.army.siegeGearIntegrity.trebuchets *
      siegeBonusPool(attacker, true) * luck(opts.rng, LUCK_SWING) *
      siegeDelivery(attacker, "buildings") * BOMBARD_INTENSITY;
    const applied = Math.min(now - BUILDING_INTEGRITY_FLOOR, hp > 0 ? power / hp : 0);
    clan.buildings.integrity[which] = now - applied;
    integrityLost += applied;
    log.push(`The barrage cracks the ${label} (−${Math.round(applied * 100)}%).`);
  }

  log.push(`Bombardment done: the ${label} stands at ${Math.round(clan.buildings.integrity[which] * 100)}%.`);
  return { attacker, clan, which, integrityLost, trebuchets, rounds, log };
}

const clanLevel = (c: Clan, w: ClanBuilding) =>
  w === "storage" ? c.buildings.storageLevel : w === "hall" ? c.buildings.hallLevel : c.buildings.wonderLevel;

// ── Shared ──────────────────────────────────────────────────────────────────

function writeBack<T extends string>(
  counts: Record<T, number>,
  integrity: Record<T, number>,
  park: { crewed: Record<T, number>; integrity: Record<T, number>; destroyed: Partial<Record<T, number>> },
) {
  for (const t of Object.keys(park.destroyed) as T[]) {
    counts[t] = Math.max(0, counts[t] - (park.destroyed[t] ?? 0));
  }
  for (const t of Object.keys(park.integrity) as T[]) {
    integrity[t] = Math.max(0, Math.min(1, park.integrity[t]));
  }
}

/** Sellsword crews are spent before your own engineers. */
function spendEngineers(p: Player, n: number) {
  let left = n;
  const fromMerc = Math.min(p.army.mercenaries.engineers, left);
  p.army.mercenaries.engineers -= fromMerc;
  left -= fromMerc;
  p.army.siegeEngineers = Math.max(0, p.army.siegeEngineers - left);
}
