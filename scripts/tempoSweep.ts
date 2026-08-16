/**
 * What one strike costs, at the current COMBAT_TEMPO.
 *
 *     npx tsx scripts/tempoSweep.ts
 *
 * Two evenly matched hosts, no walls, stamina restored between strikes — so the
 * only thing being measured is the tempo dial. Reports the first strike's
 * butcher's bill, how many strikes strip the sellsword screen, and how many
 * reach halfway through the regulars underneath.
 *
 * COMBAT_TEMPO is a module constant, so this measures whatever is currently
 * compiled in. To sweep it, change the constant and run again — the numbers
 * below are the answer for ONE value, honestly obtained, not a curve fitted in
 * the abstract.
 */
import { COMBAT_TEMPO } from "../lib/constants";
import { resolveBattle, type Player } from "../lib/engine";
import { newEmpire } from "../lib/engine/newEmpire";
import { seededRng } from "../lib/engine/rng";

function host(id: string): Player {
  const p = newEmpire({ id, name: id, race: "human", isBot: true });
  p.buildings = {
    ...p.buildings,
    muster_hall: 900, hearthstead: 700, forge: 3, armoury: 3,
    drill_yard: 3, fletchers_range: 3, knights_stables: 3, walls: 0,
  };
  p.army = {
    ...p.army,
    footmen: { light: 900, medium: 700, heavy: 500 },
    archers: { light: 700, medium: 550, heavy: 400 },
    cavalry: { light: 400, medium: 320, heavy: 240 },
    mercenaries: {
      ...p.army.mercenaries,
      footmen: { light: 300, medium: 233, heavy: 166 },
      archers: { light: 233, medium: 183, heavy: 133 },
      cavalry: { light: 133, medium: 106, heavy: 80 },
    },
    stamina: 100,
    experiencePoints: 3_000_000,
  };
  p.resources = { food: 9e6, wood: 9e6, stone: 9e6, ore: 9e6 };
  p.turnsAvailable = 400;
  return p;
}

const ARMS = ["footmen", "archers", "cavalry"] as const;
const reg = (p: Player) =>
  ARMS.reduce((n, k) => n + p.army[k].light + p.army[k].medium + p.army[k].heavy, 0);
const merc = (p: Player) =>
  ARMS.reduce(
    (n, k) =>
      n + p.army.mercenaries[k].light + p.army.mercenaries[k].medium + p.army.mercenaries[k].heavy,
    0,
  );

let a = host("A");
let d = host("D");
const startReg = reg(d);
const startMerc = merc(d);
let screenGone = 0;
let halved = 0;
let first = "";

for (let i = 1; i <= 400; i++) {
  const r = resolveBattle(a, d, "raid", { rng: seededRng(i), battleId: `b${i}`, tick: i });
  a = r.attacker;
  d = r.defender;
  if (i === 1) {
    const dead = (l: { footmen: number; archers: number; cavalry: number; mercenaries: number }) =>
      l.footmen + l.archers + l.cavalry + l.mercenaries;
    first = `${dead(r.report.defenderLosses)} of theirs, ${dead(r.report.attackerLosses)} of ours`;
  }
  // Rested and re-supplied between strikes: the dial is the only variable.
  a.army.stamina = 100;
  d.army.stamina = 100;
  a.turnsAvailable = 400;
  if (!screenGone && merc(d) === 0) screenGone = i;
  if (!halved && reg(d) <= startReg / 2) halved = i;
  // Both marks, then stop — breaking on the first would leave the other
  // reading ">400" and quietly misreport it as "never".
  if (screenGone && halved) break;
  if (reg(d) <= 0) break;
}

console.log(`COMBAT_TEMPO = ${COMBAT_TEMPO}`);
console.log(`  hosts            ${startReg.toLocaleString()} regulars + ${startMerc.toLocaleString()} hired, each side`);
console.log(`  first strike     ${first}`);
console.log(`  screen stripped  ${screenGone || "> 400"} strikes  (${((screenGone || 400) * 10)} action turns)`);
console.log(`  regulars halved  ${halved || "> 400"} strikes  (${((halved || 400) * 10)} action turns)`);
console.log(`  a day is 288 action turns, so 10 turns a strike = 28 strikes a day at most.`);
