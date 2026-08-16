/**
 * What every spy operation actually costs and achieves.
 *
 *     npx tsx scripts/covertTest.ts
 *     WATCH=400 npx tsx scripts/covertTest.ts    # against a heavier watch
 *
 * THE PARTY FILLS FROM THE HIRED FIRST and one of your own is worth
 * REGULAR_SPY_POWER bought knives, so the interesting axis is SIZE: a small raid
 * is all sellswords and weak for it, and only a raid that exhausts the hire pool
 * has your own people in it at all. Every row below shows who went, who was
 * taken, and what it bought.
 *
 * Averaged over many seeds — with a ±30% roll on each side of every mission, one
 * run tells you nothing.
 *
 * The empires are sized to the caps: a realm of ~10,000 souls may keep 5% of
 * them as spies and hire a further third of that, which is the largest shadow
 * service the rules allow at that size.
 */
import {
  COVERT_CAPS,
  MERCENARIES,
  REGULAR_SPY_POWER,
  REFUSAL_RATE,
  SLIP_THROUGH,
  SPY_OPS,
  SPY_TURNS,
  TURNS_PER_DAY,
} from "../lib/constants";
import { covertTurnCost, runCovertOp } from "../lib/engine/espionageOps";
import { newEmpire } from "../lib/engine/newEmpire";
import { seededRng } from "../lib/engine/rng";
import { totalPopulation, type Player } from "../lib/engine/types";

const WATCH = Number(process.env.WATCH ?? 150);
const RUNS = 200;

/** A spy service built to the ceiling for a realm of this size. */
function spymaster(): Player {
  const p = newEmpire({ id: "s", name: "Spymaster", race: "human" });
  p.idlePeasants = 9_000;
  p.buildings = { ...p.buildings, shadow_guild: 6, war_foundry: 10, muster_hall: 900 };
  p.research.levels = { ...p.research.levels, tradecraft: 5 };
  const cap = Math.floor(totalPopulation(p) * COVERT_CAPS.PER_ARM);
  p.army.spies = cap;
  p.army.mercenaries.spies = Math.floor(cap * MERCENARIES.CAP_RATIO);
  p.spyTurnsAvailable = SPY_TURNS.CAP;
  p.gold = 5_000_000;
  p.resources = { food: 5e6, wood: 5e6, stone: 5e6, ore: 5e6 };
  return p;
}

/** Something worth robbing, with a watch on the walls. */
function mark(): Player {
  const p = newEmpire({ id: "t", name: "Mark", race: "human" });
  p.idlePeasants = 9_000;
  p.army.scouts = WATCH;
  p.buildings = {
    ...p.buildings,
    rangers_lodge: 5, war_foundry: 10, walls: 8, collegium: 9, muster_hall: 900,
  };
  p.research.levels = { ...p.research.levels, pathfinding: 3, masonry: 4, crop_rotation: 4 };
  p.wallIntegrity = 1;
  p.army.scouts = WATCH;
  p.army.siegeEngineers = 400;
  p.army.siegeGear = { ropes: 20, ladders: 20, siege_towers: 10, rams: 20, ballistae: 20, trebuchets: 20 };
  p.army.siegeCounters = { billhooks: 10, forkpoles: 10, fire_pots: 10, boiling_oil: 10, hoardings: 10, counter_engine: 10 };
  p.gold = 5_000_000;
  p.resources = { food: 5e6, wood: 5e6, stone: 5e6, ore: 5e6 };
  return p;
}

/** What the mission actually bought, in whatever unit the mission deals in. */
function achievement(id: string, before: Player, after: Player, res: number, gear: number): string {
  switch (id) {
    case "torch_stores":
      return `${Math.round(res).toLocaleString("en-US")} goods burned`;
    case "steal_resources": {
      // Theft plunders correctly but never fills `resourcesDestroyed` the way
      // arson does, so it has to be read off the victim's stores instead.
      const gone = (["food", "wood", "stone", "ore"] as const)
        .reduce((n, r) => n + (before.resources[r] - after.resources[r]), 0);
      return `${Math.round(gone).toLocaleString("en-US")} goods carried off`;
    }
    case "sabotage_siege":
      return `${gear} engines wrecked`;
    case "sabotage_walls": {
      const lost = (before.wallIntegrity - after.wallIntegrity) * 100;
      return `${lost.toFixed(1)}% of the wall`;
    }
    case "incite_unrest":
    case "sow_doubt": {
      const until = id === "incite_unrest" ? after.unrestUntilTick : after.researchDoubtUntilTick;
      const ticks = Math.max(0, (until ?? 1000) - 1000);
      return ticks > 0 ? `${((ticks / TURNS_PER_DAY) * 24).toFixed(1)} hours` : "nothing";
    }
    case "assassinate_scouts": {
      const own = before.army.scouts - after.army.scouts;
      const hired = before.army.mercenaries.scouts - after.army.mercenaries.scouts;
      return `${own + hired} rangers (${own} of theirs)`;
    }
    case "steal_research":
      return (after.stolenResearchLevels ?? 0) > (before.stolenResearchLevels ?? 0) ? "a level copied" : "nothing";
    default:
      return "—";
  }
}

const sample = (id: string, sent: number, who: () => Player) => {
  let m = 0, r = 0, refused = 0, bounced = 0, res = 0, gear = 0;
  const shows: string[] = [];
  for (let i = 0; i < RUNS; i++) {
    const a = who();
    const d = mark();
    const m0 = a.army.mercenaries.spies, r0 = a.army.spies;
    try {
      const out = runCovertOp(a, d, id, sent, 1000, seededRng(i));
      m += m0 - out.attacker.army.mercenaries.spies;
      r += r0 - out.attacker.army.spies;
      res += out.resourcesDestroyed ?? 0;
      gear += out.gearDestroyed ?? 0;
      if (/took hold/.test(out.detail)) bounced++;
      else if (shows.length < 1) shows.push(achievement(id, mark(), out.defender, out.resourcesDestroyed ?? 0, out.gearDestroyed ?? 0));
    } catch { refused++; }
  }
  const n = RUNS - refused || 1;
  return { m: m / n, r: r / n, refused, bounced: (bounced / n) * 100, show: shows[0] ?? "—", res: res / n, gear: gear / n };
};

const a0 = spymaster();
console.log(
  `COVERT OPERATIONS · a realm of ${totalPopulation(a0).toLocaleString("en-US")} souls at the spy ceiling\n` +
    `  ${a0.army.spies} of its own + ${a0.army.mercenaries.spies} hired · Shadow Guild 6 · Tradecraft 5 · ${SPY_TURNS.CAP} turns banked\n` +
    `  against a watch of ${WATCH} rangers (Lodge 5, Pathfinding 3)\n\n` +
    `one of your own is worth ${REGULAR_SPY_POWER} hired · hired go FIRST · grabbed agents slip free ` +
    `(${SLIP_THROUGH.MERC * 100}% hired, ${SLIP_THROUGH.REGULAR * 100}% your own)\n` +
    `the guild refuses any night the watch would lay hands on more than ${REFUSAL_RATE * 100}%\n`,
);

/** …and the same service with no sellswords at all, so the knives that are
 *  grabbed are your own. This is the only way regular losses ever show. */
function bareService(): Player {
  const p = spymaster();
  p.army.mercenaries.spies = 0;
  return p;
}

for (const size of [40, 120, 300]) {
  const a = spymaster();
  const hired = Math.min(a.army.mercenaries.spies, size);
  console.log(
    `\n═══ A PARTY OF ${size} — ${hired} hired, ${size - hired} of your own ` +
      `(worth ${(size - hired) * REGULAR_SPY_POWER + hired} between them) ═══`,
  );
  console.log(` operation              turns | hired lost | own lost | bounced | what it bought`);
  console.log("-".repeat(96));
  for (const op of SPY_OPS) {
    const cost = covertTurnCost(op, size);
    if (cost > SPY_TURNS.CAP) {
      console.log(`  ${op.name.padEnd(21)} ${String(cost).padStart(5)} | — beyond the ${SPY_TURNS.CAP}-turn budget`);
      continue;
    }
    const t = sample(op.id, size, spymaster);
    if (t.refused === RUNS) {
      console.log(`  ${op.name.padEnd(21)} ${String(cost).padStart(5)} | REFUSED — the watch would take too many`);
      continue;
    }
    console.log(
      `  ${op.name.padEnd(21)} ${String(cost).padStart(5)} | ${t.m.toFixed(0).padStart(10)} | ${t.r.toFixed(0).padStart(8)} | ` +
        `${`${t.bounced.toFixed(0)}%`.padStart(7)} | ${t.show}`,
    );
  }
}

// ── When your own are the ones in the street ────────────────────────────────
//
// Above, regular losses read zero everywhere, and that is the screen working
// rather than a broken column: hands fall on the HIRED first, and a service at
// the hire cap has more sellswords than any watch manages to grab. Strip them
// away and the same raids are paid for in population.
console.log(`\n\n═══ THE SAME SERVICE WITH NO SELLSWORDS TO HIDE BEHIND ═══`);
console.log(` operation              size | own lost | of party | bounced | what it bought`);
console.log("-".repeat(92));
for (const op of SPY_OPS) {
  for (const size of [120, 300]) {
    const cost = covertTurnCost(op, size);
    if (cost > SPY_TURNS.CAP) continue;
    const t = sample(op.id, size, bareService);
    if (t.refused === RUNS) {
      console.log(`  ${op.name.padEnd(21)} ${String(size).padStart(4)} | REFUSED`);
      continue;
    }
    console.log(
      `  ${op.name.padEnd(21)} ${String(size).padStart(4)} | ${t.r.toFixed(0).padStart(8)} | ` +
        `${`${((t.r / size) * 100).toFixed(0)}%`.padStart(8)} | ${`${t.bounced.toFixed(0)}%`.padStart(7)} | ${t.show}`,
    );
  }
}
