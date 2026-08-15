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
  BOMBARD_VOLLEYS,
  SIEGE_COUNTERS,
  SIEGE_GEAR,
  WALL_BREACH_PIVOT,
  SIEGE_XP,
} from "../../constants";
import { isCounted, type BuildingId, type CounterType } from "../../constants/buildings";
import { evalCurve } from "../../constants/curves";
import { luck, rollCount, type Rng } from "../rng";
import {
  buildingIntegrity,
  level,
  type BattleLogEntry,
  type BattleReport,
  type Clan,
  type Player,
  type SiegeGearType,
  type UnitLosses,
} from "../types";
import { siegeBonusPool, siegeDelivery, settleMercenaries } from "./model";
import {
  batterySilenced,
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

  const openingTrebs = atkPark.crewed.trebuchets;
  const openingBattery = batteryStrength(defPark);
  let engineerLossesAtk = 0;
  let engineerLossesDef = 0;
  let wallDamage = 0;
  let rounds = 0;
  let silenced = false;
  const buildingHits: Partial<Record<BuildingId, number>> = {};

  if (openingTrebs === 0) {
    say(0, "No crewed trebuchets march — the barrage never begins.", { tone: "bad" });
  } else {
    say(0, `${openingTrebs} crewed trebuchets wheel into range and open fire.`, { tone: "neutral" });
    if (defPark.crewed.counter_engine > 0) {
      say(0, `${defPark.crewed.counter_engine} Counter-Engines answer from the keep.`, { tone: "bad" });
    }
  }

  const wallHp = wallHealth(defender);

  for (let round = 1; round <= BOMBARD_VOLLEYS && openingTrebs > 0; round++) {
    if (atkPark.crewed.trebuchets === 0) {
      say(round, "Our last trebuchet is wreckage. The barrage is over.", { tone: "bad" });
      break;
    }
    rounds = round;
    const roll = luck(rng, LUCK_SWING);

    // ── The duel ────────────────────────────────────────────────────────────
    if (!silenced) {
      const duel = runDuelRound({ attacker, defender, atkPark, defPark, war, rng, defenderEdge });
      for (const note of duel.notes) log.push({ round, phase: "counter-duel", text: note });

      const atkStrength = parkStrength(atkPark);
      const defStrength = batteryStrength(defPark);

      // Crews die at their posts — the attacker's only once the battery is a
      // real threat, the defender's only once theirs is being shot apart.
      const atRiskAtk = atkPark.crewed.trebuchets * SIEGE_GEAR.trebuchets.crew;
      if (batteryThreatens(defStrength, atkStrength) && atRiskAtk > 0) {
        const killed = rollCount(rng, atRiskAtk, ARTILLERY_DUEL.ATTACKER_ENGINEER_RISK.min);
        if (killed > 0) {
          engineerLossesAtk += killed;
          say(round, `Counter-Engine fire finds our gun-line — ${killed} engineers killed.`, {
            attackerRegulars: killed, tone: "bad",
          });
        }
      }
      const atRiskDef = defPark.crewed.counter_engine * SIEGE_COUNTERS.counter_engine.crew;
      const defKilled = defenderEngineerRisk(rng, openingBattery, defStrength, atRiskDef);
      if (defKilled > 0) {
        engineerLossesDef += defKilled;
        say(round, `Their crews are cut down among the wreckage — ${defKilled} lost.`, {
          defenderRegulars: defKilled, tone: "good",
        });
      }

      if (batterySilenced(openingBattery, defStrength, atkStrength)) {
        silenced = true;
        say(round, "Their battery falls silent — what is left of it cannot answer. The walls are ours to work.", {
          tone: "good",
        });
      }
    }

    // ── The fire that gets through ──────────────────────────────────────────
    const power =
      atkPark.crewed.trebuchets * SIEGE_GEAR.trebuchets.power * atkPark.integrity.trebuchets *
      siegeBonusPool(attacker, war) * roll;
    const wallsStanding = level(defender, "walls") > 0 && defender.wallIntegrity > WALL_BREACH_PIVOT;

    if (wallsStanding) {
      const dmg = power * siegeDelivery(attacker, "walls");
      const applied = Math.min(defender.wallIntegrity * wallHp, dmg);
      defender.wallIntegrity = Math.max(0, defender.wallIntegrity - damageToIntegrity(defender, applied));
      wallDamage += applied;
      say(round,
        defender.wallIntegrity <= WALL_BREACH_PIVOT
          ? `The wall is breached — the fire spills onto the town.`
          : `Stone hammers stone — the wall stands at ${Math.round(defender.wallIntegrity * 100)}%.`,
        { tone: "neutral" });
    } else {
      const target = pickTarget(defender, rng);
      if (!target) {
        say(round, "Nothing left standing to break — the barrage falls on rubble.", { tone: "neutral" });
      } else {
        const hp = buildingHealth(defender, target);
        const dmg = power * siegeDelivery(attacker, "buildings");
        const cur = buildingIntegrity(defender, target);
        const lost = Math.min(Math.max(0, cur - BUILDING_INTEGRITY_FLOOR), hp > 0 ? dmg / hp : 0);
        defender.buildingIntegrity[target] = cur - lost;
        buildingHits[target] = (buildingHits[target] ?? 0) + lost;
        // Burnt roofs do not dock the settler intake until the defender has
        // been back to see them — a barrage at 3am should cost sleep, not
        // growth. Cleared on their next page load. See intakeHousing.
        if (target === "hearthstead" && lost > 0) defender.roofDamageUnseen = true;
        say(round, isCounted(target)
          ? `A volley walks through the ${BUILDING_LABEL[target] ?? target}s — roofs come down (−${Math.round(lost * 100)}%).`
          : `A volley cracks the ${BUILDING_LABEL[target] ?? target} open (−${Math.round(lost * 100)}%).`,
          { tone: "good" });
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

  const aGain = Math.min(
    SIEGE_XP.MAX_PER_BATTLE,
    engineerLossesDef * SIEGE_XP.PER_KILL + displaced * SIEGE_XP.PER_CIVILIAN_DISPLACED,
  );
  attacker.army.siegeExperience = Math.min(SIEGE_XP.MAX, attacker.army.siegeExperience + aGain);
  defender.army.siegeExperience = Math.min(SIEGE_XP.MAX, defender.army.siegeExperience + SIEGE_XP.DEFENDER_GAIN);

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
    siegeExperienceChange: { attacker: Math.round(aGain), defender: SIEGE_XP.DEFENDER_GAIN },
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

  const hp = evalCurve(BUILDING_HP_CURVE, Math.max(1, clanLevel(clan, which)));
  for (let round = 1; round <= BOMBARD_VOLLEYS; round++) {
    const now = clan.buildings.integrity[which];
    if (now <= BUILDING_INTEGRITY_FLOOR) {
      log.push(`Round ${round}: the ${label} is already cracked to its foundations.`);
      break;
    }
    rounds = round;
    const power =
      trebuchets * SIEGE_GEAR.trebuchets.power * attacker.army.siegeGearIntegrity.trebuchets *
      siegeBonusPool(attacker, true) * luck(opts.rng, LUCK_SWING) * siegeDelivery(attacker, "buildings");
    const applied = Math.min(now - BUILDING_INTEGRITY_FLOOR, hp > 0 ? power / hp : 0);
    clan.buildings.integrity[which] = now - applied;
    integrityLost += applied;
    log.push(`Round ${round}: the volley cracks the ${label} (−${Math.round(applied * 100)}%).`);
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
