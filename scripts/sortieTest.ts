/**
 * What does a sortie actually cost the besieger?
 *
 *     npx tsx scripts/sortieTest.ts
 *
 * The sortie is three battles fought in sequence, and this measures all of them:
 *
 *   1 FOOT vs HORSE   the attacker's dug-in footmen draw off and fight
 *     FOOTMEN_HOLD times their own weight of the charge.
 *   2 HORSE vs HORSE  the attacker's own cavalry counter-charge what spilled
 *     past them and hold CAVALRY_HOLD times theirs.
 *   3 REAR GUARD      only what neither could draw off reaches the archers and
 *     engineers at the engines. Half of what lands there goes into the park.
 *
 * THE QUESTION UNDER TEST is whether a breakthrough slaughters the besieger's
 * REGULARS. The target: 5-10% of them in an ordinary sortie, and no worse than
 * about 20% when a great deal of horse gets through. The screen is measured by
 * how badly it is outweighed, so each size runs at four screen strengths.
 *
 * ISOLATION. The defender is given NO counters and NO engines of their own, so
 * the counter-duel cannot touch the attacker's park — every engine lost here
 * was lost to the sortie and nothing else. A real defender would have both;
 * this is a measurement, not a scenario.
 */
import {
  DAMAGE_TAKEN,
  MAX_FIELD_LEVEL,
  MERCENARIES,
  SIEGE_GEAR,
  SORTIE,
  UNIT_POWER,
} from "../lib/constants";
import { resolveBattle, type Player } from "../lib/engine";
import { newEmpire } from "../lib/engine/newEmpire";
import { seededRng } from "../lib/engine/rng";
import { fullCounterIntegrity, fullGearIntegrity, type SiegeGearType } from "../lib/engine/types";

const RAMS = Number(process.env.RAMS ?? 30);
const ARMS = ["footmen", "archers", "cavalry"] as const;
const GEAR: SiegeGearType[] = ["trebuchets", "ballistae", "siege_towers", "rams"];

const base = (id: string): Player => {
  const p = newEmpire({ id, name: id, race: "human", isBot: true });
  p.buildings = {
    ...p.buildings,
    muster_hall: 900, hearthstead: 700, forge: 3, armoury: 3,
    drill_yard: 3, fletchers_range: 3, knights_stables: 3, war_foundry: 10,
  };
  for (const a of ARMS) {
    p.army[a] = { light: 0, medium: 0, heavy: 0 };
    p.army.mercenaries[a] = { light: 0, medium: 0, heavy: 0 };
  }
  p.army.stamina = 100;
  p.army.experiencePoints = 3_000_000;
  p.research.levels = { ...p.research.levels, medicine: MAX_FIELD_LEVEL };
  p.resources = { food: 9e6, wood: 9e6, stone: 9e6, ore: 9e6 };
  p.turnsAvailable = 400;
  return p;
};

/** Screen at the cap in front, archers and engineers at the engines behind. */
function besieger(size: number, screenFootmen: number): Player {
  const p = base("besieger");
  p.buildings = { ...p.buildings, walls: 0 };
  const scr = Math.floor(screenFootmen * MERCENARIES.CAP_RATIO);
  p.army.footmen = { light: 0, medium: 0, heavy: screenFootmen };
  p.army.mercenaries.footmen = { light: 0, medium: scr - Math.round(scr * 0.2), heavy: Math.round(scr * 0.2) };
  const arc = Math.floor(size * MERCENARIES.CAP_RATIO);
  p.army.archers = { light: 0, medium: 0, heavy: size };
  p.army.mercenaries.archers = { light: 0, medium: arc - Math.round(arc * 0.2), heavy: Math.round(arc * 0.2) };
  p.army.siegeEngineers = 300;
  p.army.mercenaries.engineers = 90;
  p.army.siegeGear = { ropes: 30, ladders: 20, siege_towers: 18, rams: RAMS, ballistae: 24, trebuchets: 40 };
  p.army.siegeGearIntegrity = fullGearIntegrity();
  p.army.siegeCounterIntegrity = fullCounterIntegrity();
  p.army.sortieEnabled = false;
  return p;
}

/** Cavalry-heavy, behind a wall, with the standing order to ride out. */
function holder(size: number): Player {
  const p = base("holder");
  p.buildings = { ...p.buildings, walls: 9 };
  p.wallIntegrity = 1;
  const scr = Math.floor(size * MERCENARIES.CAP_RATIO);
  p.army.cavalry = { light: 0, medium: 0, heavy: size };
  p.army.mercenaries.cavalry = { light: 0, medium: scr - Math.round(scr * 0.2), heavy: Math.round(scr * 0.2) };
  // No counters, no engines — nothing but the sortie may touch the attacker's park.
  p.army.siegeCounters = { billhooks: 0, forkpoles: 0, fire_pots: 0, boiling_oil: 0, hoardings: 0, counter_engine: 0 };
  p.army.siegeGear = { ropes: 0, ladders: 0, siege_towers: 0, rams: 0, ballistae: 0, trebuchets: 0 };
  p.army.siegeEngineers = 0;
  p.army.mercenaries.engineers = 0;
  p.army.sortieEnabled = true;
  return p;
}

/**
 * Engines DESTROYED must be read off the sortie's own log line, not off the
 * park. A besieger who loses the field forfeits a share of their siege train
 * (SIEGE_GEAR_LOSS_ON_DEFEAT) — an earlier version of this harness diffed the
 * park and read that forfeit as sortie damage, which inverted the whole table:
 * the strongest screen appeared to lose the most engines, because it was the
 * one whose attacker lost the battle.
 */
const enginesSmashed = (text: string) => Number(/(\d+) engines? (?:is|are) smashed/.exec(text)?.[1] ?? 0);

/** Wear is safe to read off integrity: a forfeit removes COUNTS, never touches
 *  the per-type integrity that `writeBackPark` sets.
 *
 *  Reported for TREBUCHETS alone, because that is where it lands. A sortie
 *  spends itself tall-engines-first, so averaging across the park understates
 *  the damage several-fold — the trebuchets eat almost all of it and the rams
 *  at the back of the queue are usually untouched. Trebuchet integrity is what
 *  decides whether a besieger can still throw. */
const trebWear = (p: Player) => (1 - p.army.siegeGearIntegrity.trebuchets) * 100;

/** Per-type wear, in the order the sortie spends itself. Shows how far down the
 *  queue a breakthrough actually reaches — and that ropes and ladders are never
 *  in the queue at all. */
const wearByType = (p: Player) =>
  (["trebuchets", "ballistae", "siege_towers", "rams", "ladders", "ropes"] as const)
    .map((t) => `${t.slice(0, 4)} ${((1 - p.army.siegeGearIntegrity[t]) * 100).toFixed(0)}%`)
    .join("  ");

console.log(
  `SORTIE · siege attacks · defender is all cavalry behind a level-9 wall with the order to ride out\n` +
    `Besieger: a screen of heavy footmen, ${"archers"} at the engines, 300 regular + 90 hired engineers,\n` +
    `          engines: 40 treb / 24 ballista / 18 tower / ${RAMS} ram / 20 ladder / 30 rope. Defender has NO\n` +
    `          counters, so the duel cannot touch the park — every engine lost below fell to the sortie.\n` +
    `          BYTYPE=1 breaks the park damage out per engine type.\n`,
);
console.log(
  `gates open at ${SORTIE.TRIGGER_RATIO}x the screen · sortieing cavalry +${(SORTIE.CAVALRY_BONUS * 100).toFixed(0)}% in the open — ` +
    `the ONLY multiplier in the phase\n` +
    `each besieger footman draws off ${SORTIE.FOOTMEN_HOLD} riders, each of their horse ${SORTIE.CAVALRY_HOLD} · ` +
    `counted in MEN, not power\n` +
    `archers fight at ${(SORTIE.ARCHER_MELEE * 100).toFixed(0)}% power in the rear guard · ` +
    `${(SORTIE.ENGINE_SHARE * 100).toFixed(0)}% of a breakthrough goes at the park\n` +
    `engineer ${UNIT_POWER.engineer.power} power / ${UNIT_POWER.engineer.health} health · ` +
    `takes ${(DAMAGE_TAKEN.engineer * 100).toFixed(0)}% of a blow (${(100 - DAMAGE_TAKEN.engineer * 100).toFixed(0)}% get away) · ` +
    `archer takes ${(DAMAGE_TAKEN.archer * 100).toFixed(0)}%\n`,
);

console.log(
  "size | screen | sortie | screen regs | archer regs | enginr regs | treb | stam | riders lost",
);
console.log("-".repeat(118));

for (const size of [200, 700, 1500]) {
  for (const k of [0.5, 1, 2, 4, 8]) {
    const screen = Math.max(1, Math.round(size / k));
    const a = besieger(size, screen);
    const d = holder(size);
    const startArchers = a.army.archers.heavy;
    const startFoot = a.army.footmen.heavy;
    const startEng = a.army.siegeEngineers;
    const startRiders = d.army.cavalry.heavy;
    const startRiderMercs = d.army.mercenaries.cavalry.medium + d.army.mercenaries.cavalry.heavy;

    const out = resolveBattle(a, d, "siege", { rng: seededRng(7), battleId: "s", tick: 1 });
    const line = out.report.log.find((l) => l.phase === "sortie");
    const broke = !!line && /in among the siege park/.test(line.text);

    const footLost = startFoot - out.attacker.army.footmen.heavy;
    const archersLost = startArchers - out.attacker.army.archers.heavy;
    const engLost = startEng - out.attacker.army.siegeEngineers;
    void enginesSmashed;
    const ridersLost = startRiders - out.defender.army.cavalry.heavy;
    const riderMercLost =
      startRiderMercs -
      (out.defender.army.mercenaries.cavalry.medium + out.defender.army.mercenaries.cavalry.heavy);

    const pct = (n: number, of: number) => (of > 0 ? `${n} (${((n / of) * 100).toFixed(0)}%)` : `${n}`);
    console.log(
      `${String(size).padStart(4)} | ${String(screen).padStart(6)} | ` +
        `${(line ? (broke ? "THROUGH" : "held") : "no fire").padEnd(6)} | ` +

        `${pct(footLost, startFoot).padEnd(11)} | ` +
        `${pct(archersLost, startArchers).padEnd(11)} | ` +
        `${pct(engLost, startEng).padEnd(11)} | ` +
        `${`${trebWear(out.attacker).toFixed(0)}%`.padEnd(4)} | ` +
        `${`-${out.report.staminaLoss.defender}`.padEnd(4)} | ` +
        `${ridersLost} reg + ${riderMercLost} hired`,
    );
    if (process.env.BYTYPE) console.log(`       park: ${wearByType(out.attacker)}`);
  }
  console.log("-".repeat(118));
}
