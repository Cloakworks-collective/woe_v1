/**
 * The revenge strike — what a broken defender actually loses.
 *
 *     npx tsx scripts/revengeTest.ts
 *
 * This is the LATE-CAMPAIGN state, not a fair fight. The defender has been
 * ground down through a morning and the attacker has been at their keyboard
 * between strikes:
 *
 *   DEFENDER   walls battered flat (integrity 0), battery wreckage, sellswords
 *              down to 30% of the hire cap, stamina 50.
 *   ATTACKER   screen re-hired to the cap, stamina 100, siege train intact.
 *
 * REVENGE is the mode that matters here, and it differs from a castle attack in
 * exactly the ways that make this scenario lethal:
 *
 *   - IT NEVER YIELDS. `mode !== "revenge"` guards the whole mercy path, so a
 *     broken garrison cannot lay down arms and walk away with its levy intact.
 *     Every other attack against a defender this weak ends in a bloodless
 *     surrender; this one ends in bodies.
 *   - IT TAKES NOTHING. No loot, no gold. The payment is dead regulars, which
 *     is precisely what this harness measures.
 *
 * Two things follow from the defender's state that are worth naming rather than
 * discovering in the numbers: at 50 stamina they are below SORTIE.MIN_STAMINA
 * (70), and at 30% of cap they are below SORTIE.MIN_SCREEN (70%). They CANNOT
 * ride out. Both gates are doing their job, and the sortie column proves it.
 */
import {
  MAX_FIELD_LEVEL,
  MERCENARIES,
  SIEGE_GEAR,
  SORTIE,
  STAMINA,
} from "../lib/constants";
import { resolveBattle, type Player } from "../lib/engine";
import { newEmpire } from "../lib/engine/newEmpire";
import { seededRng } from "../lib/engine/rng";
import { fullCounterIntegrity, fullGearIntegrity, type SiegeGearType } from "../lib/engine/types";

type Arm = "footmen" | "archers" | "cavalry";
const ARMS: Arm[] = ["archers", "footmen", "cavalry"];
const GEAR: SiegeGearType[] = ["trebuchets", "ballistae", "siege_towers", "rams"];

/** The share of the hire cap a ground-down defender still has standing. */
const SCREEN_LEFT = 0.3;

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

const crewNeeded = (g: ReturnType<typeof train>) =>
  (Object.keys(g) as (keyof typeof g)[]).reduce((n, t) => n + g[t] * SIEGE_GEAR[t].crew, 0);

function host(id: string, arm: Arm, size: number): Player {
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
  p.army[arm] = { light: 0, medium: 0, heavy: size };
  p.army.experiencePoints = 3_000_000;
  p.army.siegeExperiencePoints = 2_500_000;
  p.research.levels = { ...p.research.levels, medicine: MAX_FIELD_LEVEL };
  p.resources = { food: 9e6, wood: 9e6, stone: 9e6, ore: 9e6 };
  p.gold = 500_000;
  p.turnsAvailable = 400;
  p.shieldUntilTick = 0;
  return p;
}

/** Screen re-hired to the cap, rested, train intact — a player between strikes. */
function avenger(arm: Arm, size: number): Player {
  const p = host("avenger", arm, size);
  const scr = Math.floor(size * MERCENARIES.CAP_RATIO);
  const heavy = Math.round(scr * 0.2);
  p.army.mercenaries[arm] = { light: 0, medium: scr - heavy, heavy };
  p.army.stamina = STAMINA.MAX;
  const g = train(size);
  p.army.siegeGear = { ...g };
  p.army.siegeGearIntegrity = fullGearIntegrity();
  p.army.siegeEngineers = crewNeeded(g);
  p.army.mercenaries.engineers = Math.round(crewNeeded(g) * 0.3);
  p.buildings = { ...p.buildings, walls: 0 };
  p.army.sortieEnabled = false;
  return p;
}

/** Battered flat: rubble where the wall was, a wrecked battery, a third of the
 *  screen, and men too tired to counter-charge. */
function broken(arm: Arm, size: number): Player {
  const p = host("broken", arm, size);
  const scr = Math.floor(size * MERCENARIES.CAP_RATIO * SCREEN_LEFT);
  const heavy = Math.round(scr * 0.2);
  p.army.mercenaries[arm] = { light: 0, medium: scr - heavy, heavy };
  p.army.stamina = 50;
  // The wall still stands as a building — its masonry is rubble, which is what
  // `wallIntegrity` measures. Rebuilt levels do not come back for free.
  p.buildings = { ...p.buildings, walls: 8 };
  p.wallIntegrity = 0;
  // The battery is wreckage. Modelled as no crewed counters at all, which is
  // what "silenced" amounts to once the guns are past the wreck line.
  p.army.siegeCounters = {
    billhooks: 0, forkpoles: 0, fire_pots: 0,
    boiling_oil: 0, hoardings: 0, counter_engine: 0,
  };
  p.army.siegeCounterIntegrity = fullCounterIntegrity();
  p.army.siegeGear = { ropes: 0, ladders: 0, siege_towers: 0, rams: 0, ballistae: 0, trebuchets: 0 };
  p.army.siegeGearIntegrity = fullGearIntegrity();
  p.army.siegeEngineers = 60;
  p.army.mercenaries.engineers = 0;
  p.army.sortieEnabled = true; // ordered — but both gates should refuse it
  return p;
}

const roster = (p: Player) => {
  const r = ARMS.reduce((n, a) => n + p.army[a].light + p.army[a].medium + p.army[a].heavy, 0);
  const m = ARMS.reduce(
    (n, a) => n + p.army.mercenaries[a].light + p.army.mercenaries[a].medium + p.army.mercenaries[a].heavy,
    0,
  );
  return { r, m };
};

console.log(
  `REVENGE · the late-campaign strike, not a fair fight\n` +
    `DEFENDER  wall rubble (integrity 0) · battery wrecked · sellswords at ${(SCREEN_LEFT * 100).toFixed(0)}% of cap · stamina 50\n` +
    `ATTACKER  screen re-hired to the ${(MERCENARIES.CAP_RATIO * 100).toFixed(0)}% cap · stamina 100 · train intact\n` +
    `Revenge NEVER yields and takes NO loot — the payment is dead regulars, so that is the column that matters.\n` +
    `Defender has the sortie ordered but sits under BOTH gates (stamina 50 < ${SORTIE.MIN_STAMINA}, screen 30% < ${(SORTIE.MIN_SCREEN * 100).toFixed(0)}%).\n`,
);
console.log(
  "                 |        ATTACKER (had -> lost)        |        DEFENDER (had -> lost)",
);
console.log(
  "arm  size        | regulars        | hired            | regulars        | hired            | victor",
);
console.log("-".repeat(112));

const cell = (had: number, lost: number) =>
  `${String(had).padStart(5)} -> ${String(lost).padStart(4)}${had > 0 ? ` (${((lost / had) * 100).toFixed(0)}%)` : ""}`;

for (const arm of ARMS) {
  for (const size of [200, 700, 1500]) {
    const a = avenger(arm, size);
    const d = broken(arm, size);
    const A0 = roster(a), D0 = roster(d);

    const out = resolveBattle(a, d, "revenge", { rng: seededRng(11), battleId: "r", tick: 1 });
    const A1 = roster(out.attacker), D1 = roster(out.defender);

    console.log(
      `${arm.slice(0, 4).padEnd(4)} ${String(size).padStart(4)}        | ` +
        `${cell(A0.r, A0.r - A1.r).padEnd(15)} | ${cell(A0.m, A0.m - A1.m).padEnd(16)} | ` +
        `${cell(D0.r, D0.r - D1.r).padEnd(15)} | ${cell(D0.m, D0.m - D1.m).padEnd(16)} | ` +
        `${out.report.victor === "attacker" ? "ATTACKER" : "defender"}` +
        `${out.report.sortied ? " sortie" : ""}`,
    );
  }
  console.log("-".repeat(112));
}
