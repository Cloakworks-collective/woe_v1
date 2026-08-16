/**
 * What does a castle attack actually do, arm by arm, wall by wall?
 *
 *     npx tsx scripts/castleTest.ts
 *     ARM=archers npx tsx scripts/castleTest.ts   # one arm, verbose log
 *
 * MIRROR MATCHUPS — same arm, same size, same research on both sides — across
 * three hosts (200 / 700 / 1500) and three walls (2 / 5 / 10). Mirrors because
 * the question is what the WALL and the ARM do, and any difference in the two
 * armies would muddy both. Every row is therefore a fair fight made unfair by
 * exactly two things: masonry, and who is holding it.
 *
 * Each arm resolves differently and that is the point of separating them:
 *   ARCHERS  spread their volley across the whole enemy line, and shoot from
 *            behind the parapet when defending.
 *   FOOTMEN  aim down footman → archer → cavalry, and crew the rams.
 *   CAVALRY  aim down cavalry → footman → archer, are worthless on a wall, and
 *            are the ONLY arm that can sortie to any effect.
 *
 * SIEGE TRAIN scales with the host — see `train` below. A 200-man assault
 * bringing a 1500-man battering train would measure the train, not the wall.
 */
import {
  MAX_FIELD_LEVEL,
  MERCENARIES,
  SIEGE_GEAR,
  STAMINA,
} from "../lib/constants";
import { resolveBattle, type Player } from "../lib/engine";
import { newEmpire } from "../lib/engine/newEmpire";
import { seededRng } from "../lib/engine/rng";
import { fullCounterIntegrity, fullGearIntegrity, type SiegeGearType } from "../lib/engine/types";

type Arm = "footmen" | "archers" | "cavalry";
const ARMS: Arm[] = ["archers", "footmen", "cavalry"];
const GEAR: SiegeGearType[] = ["trebuchets", "ballistae", "siege_towers", "rams"];

/** Siege train per 100 troops, and the crews to man it. Weighted toward the
 *  wall-breakers: rams read 100% against masonry and trebuchets are the only
 *  engine that reaches walls, buildings AND engines. */
const train = (size: number) => {
  const per = size / 100;
  return {
    trebuchets: Math.round(per * 3),
    rams: Math.round(per * 2),
    ballistae: Math.round(per * 2),
    siege_towers: Math.round(per * 1),
    ladders: Math.round(per * 2),
    ropes: Math.round(per * 2),
  };
};

/** Counters per 100 troops — a garrison that answers rather than one that only
 *  absorbs, so the counter-duel is a real phase and not a formality. */
const battery = (size: number) => {
  const per = size / 100;
  return {
    billhooks: Math.round(per * 1),
    forkpoles: Math.round(per * 1),
    fire_pots: Math.round(per * 1),
    boiling_oil: Math.round(per * 1),
    hoardings: Math.round(per * 1),
    counter_engine: Math.round(per * 1.5),
  };
};

const crewNeeded = (g: ReturnType<typeof train>) =>
  (Object.keys(g) as (keyof typeof g)[]).reduce((n, t) => n + g[t] * SIEGE_GEAR[t].crew, 0);

/** All regulars heavy; sellswords at the cap, 20% heavy and the rest medium —
 *  the shape a careful player builds believing the screen works. */
function host(id: string, arm: Arm, size: number, walls: number): Player {
  const p = newEmpire({ id, name: id, race: "human", isBot: true });
  p.buildings = {
    ...p.buildings,
    muster_hall: 900, hearthstead: 700, forge: 3, armoury: 3,
    drill_yard: 3, fletchers_range: 3, knights_stables: 3,
    war_foundry: 10, walls,
  };
  p.wallIntegrity = 1;
  for (const a of ARMS) {
    p.army[a] = { light: 0, medium: 0, heavy: 0 };
    p.army.mercenaries[a] = { light: 0, medium: 0, heavy: 0 };
  }
  p.army[arm] = { light: 0, medium: 0, heavy: size };
  const scr = Math.floor(size * MERCENARIES.CAP_RATIO);
  const heavy = Math.round(scr * 0.2);
  p.army.mercenaries[arm] = { light: 0, medium: scr - heavy, heavy };
  p.army.stamina = STAMINA.MAX;
  p.army.experiencePoints = 3_000_000;
  p.army.siegeExperiencePoints = 2_500_000;
  p.research.levels = { ...p.research.levels, medicine: MAX_FIELD_LEVEL };
  p.resources = { food: 9e6, wood: 9e6, stone: 9e6, ore: 9e6 };
  p.gold = 500_000;
  p.turnsAvailable = 400;
  p.shieldUntilTick = 0;
  return p;
}

function besieger(arm: Arm, size: number): Player {
  const p = host("besieger", arm, size, 0);
  const g = train(size);
  p.army.siegeGear = { ...g };
  p.army.siegeGearIntegrity = fullGearIntegrity();
  p.army.siegeEngineers = crewNeeded(g);
  p.army.mercenaries.engineers = Math.round(crewNeeded(g) * 0.3);
  p.army.sortieEnabled = false;
  return p;
}

function holder(arm: Arm, size: number, walls: number): Player {
  const p = host("holder", arm, size, walls);
  const c = battery(size);
  p.army.siegeCounters = { ...c };
  p.army.siegeCounterIntegrity = fullCounterIntegrity();
  // Crew for the battery: 1–5 apiece, so give it room plus a margin.
  p.army.siegeEngineers = 400;
  p.army.mercenaries.engineers = 120;
  p.army.siegeGear = { ropes: 0, ladders: 0, siege_towers: 0, rams: 0, ballistae: 0, trebuchets: 0 };
  p.army.siegeGearIntegrity = fullGearIntegrity();
  p.army.sortieEnabled = true; // let it fire if it can; whether it does is data
  return p;
}

const roster = (p: Player) => ({
  r: ARMS.reduce((n, a) => n + p.army[a].light + p.army[a].medium + p.army[a].heavy, 0),
  m: ARMS.reduce(
    (n, a) => n + p.army.mercenaries[a].light + p.army.mercenaries[a].medium + p.army.mercenaries[a].heavy,
    0,
  ),
});
const engines = (p: Player) => GEAR.reduce((n, t) => n + p.army.siegeGear[t], 0);

console.log(
  `CASTLE ATTACKS · mirror matchups (same arm, same size, same research both sides)\n` +
    `All regulars HEAVY · sellswords at the ${(MERCENARIES.CAP_RATIO * 100).toFixed(0)}% cap, 20% heavy / 80% medium\n` +
    `Siege train per 100 troops: 3 trebuchet · 2 ram · 2 ballista · 1 tower · 2 ladder · 2 rope\n` +
    `Garrison battery per 100:   1 each of bill-hook / fork-pole / fire-pot / oil / hoarding · 1.5 counter-engine\n` +
    `Defender has the sortie order standing — whether it fires is part of the result.\n`,
);
console.log(
  "                      |        ATTACKER (had -> lost)       |        DEFENDER (had -> lost)",
);
console.log(
  "arm  size wall | wall  | regulars       | hired           | regulars       | hired           | victor / notes",
);
console.log("-".repeat(128));

const cell = (had: number, lost: number) =>
  `${String(had).padStart(5)} -> ${String(lost).padStart(4)}${had > 0 ? ` (${((lost / had) * 100).toFixed(0)}%)` : ""}`;

for (const arm of ARMS) {
  for (const size of [200, 700, 1500]) {
    for (const wall of [2, 5, 10]) {
      const a = besieger(arm, size);
      const d = holder(arm, size, wall);
      const A0 = roster(a), D0 = roster(d);

      const out = resolveBattle(a, d, "siege", { rng: seededRng(11), battleId: "c", tick: 1 });
      const r = out.report;
      const A1 = roster(out.attacker), D1 = roster(out.defender);

      const notes: string[] = [r.victor === "attacker" ? "ATTACKER" : "defender"];
      if (r.yielded) notes.push("YIELDED");
      if (r.sortied) notes.push("sortie");
      if (out.defender.wallIntegrity <= 0.5) notes.push("BREACH");
      if (r.loot.gold > 0) notes.push(`${Math.round(r.loot.gold / 1000)}k gold`);

      console.log(
        `${arm.slice(0, 4).padEnd(4)} ${String(size).padStart(4)} ${String(wall).padStart(4)} | ` +
          `${`-${(r.wallIntegrityDamage * 100).toFixed(0)}%`.padEnd(5)} | ` +
          `${cell(A0.r, A0.r - A1.r).padEnd(14)} | ${cell(A0.m, A0.m - A1.m).padEnd(15)} | ` +
          `${cell(D0.r, D0.r - D1.r).padEnd(14)} | ${cell(D0.m, D0.m - D1.m).padEnd(15)} | ` +
          notes.join(" "),
      );
    }
  }
  console.log("-".repeat(128));
}
