/**
 * Does a well-cushioned host actually protect its regulars?
 *
 * THE ASYMMETRY IS THE POINT. An attacker between strikes is at their keyboard:
 * they re-hire the screen to the cap and rest the army. A defender being ground
 * down over a morning is usually not — their sellswords are not replaced and
 * their stamina keeps falling, which is what eventually makes them YIELD
 * (below STAMINA.MERCY_FLOOR, or outmatched past YIELD.STRENGTH_RATIO).
 *
 * An earlier version of this script restored BOTH sides every strike, which
 * made the defender immortal-fresh and the yield path unreachable — so it
 * measured a grind that cannot happen and missed the mercy rule entirely.
 *
 *     npx tsx scripts/cushionTest.ts
 *
 * RAIDS only — open field, no walls, no engines — so the only thing being
 * measured is what the troops do to each other. Single-arm mirrors first
 * (archers v archers, horse v horse, foot v foot), because each arm resolves
 * differently: archers SPREAD their volley across the whole enemy line, while
 * cavalry and footmen AIM down a priority order. Mixed hosts come after.
 *
 * The shape under test is the one a careful player would build believing the
 * screen works: every regular in heavy, and the sellswords 20% heavy / 80%
 * medium with nothing at light.
 *
 * It is worth measuring precisely because it has a hole in it. Casualties walk
 * light -> medium -> heavy and the hired take MERC_SHARE of whatever lands at
 * THEIR rank. Nothing stands at light and only sellswords stand at medium, so
 * the share that finds no regular to kill at those ranks falls through to the
 * heavies — where the entire population is standing.
 */
import { ACTION_TURNS, CASUALTY_SPLIT, COMBAT_TEMPO, MAX_FIELD_LEVEL, MEDICINE, MERCENARIES, DAMAGE_TAKEN, STAMINA, YIELD } from "../lib/constants";
import { mercPrice, restFoodCost } from "../lib/engine";
import { resolveBattle, type Player } from "../lib/engine";
import { newEmpire } from "../lib/engine/newEmpire";
import { seededRng } from "../lib/engine/rng";

type Arm = "footmen" | "archers" | "cavalry";
const ARMS: Arm[] = ["footmen", "archers", "cavalry"];

/**
 * Re-hire the screen back to the cap — what an attacker does between strikes.
 * Walks EVERY arm, so it serves a mixed host as well as a single-arm one.
 */
function rescreen(p: Player): number {
  let bought = 0;
  for (const a of ARMS) {
    const regs = p.army[a].light + p.army[a].medium + p.army[a].heavy;
    if (regs === 0) continue;
    const want = Math.floor(regs * MERCENARIES.CAP_RATIO);
    const have =
      p.army.mercenaries[a].light + p.army.mercenaries[a].medium + p.army.mercenaries[a].heavy;
    if (want <= have) continue;
    const heavy = Math.round(want * 0.2);
    p.army.mercenaries[a] = { light: 0, medium: want - heavy, heavy };
    bought += want - have;
  }
  return bought;
}

/** All regulars heavy; the screen 20% heavy, the rest medium, none at light. */
function host(id: string, arm: Arm, regulars: number): Player {
  const p = newEmpire({ id, name: id, race: "human", isBot: true });
  p.buildings = {
    ...p.buildings,
    muster_hall: 900, hearthstead: 700, forge: 3, armoury: 3,
    drill_yard: 3, fletchers_range: 3, knights_stables: 3, walls: 0,
  };
  for (const a of ARMS) {
    p.army[a] = { light: 0, medium: 0, heavy: 0 };
    p.army.mercenaries[a] = { light: 0, medium: 0, heavy: 0 };
  }
  if (arm === "mixed" as Arm) {
    // Equal thirds across the arms, same total host — the composition question.
    const each = Math.floor(regulars / 3);
    for (const a of ARMS) {
      p.army[a] = { light: 0, medium: 0, heavy: each };
      const sc = Math.floor(each * MERCENARIES.CAP_RATIO);
      const hv = Math.round(sc * 0.2);
      p.army.mercenaries[a] = { light: 0, medium: sc - hv, heavy: hv };
    }
  } else {
    p.army[arm] = { light: 0, medium: 0, heavy: regulars };
    const screen = Math.floor(regulars * MERCENARIES.CAP_RATIO); // hired to the cap
    const heavy = Math.round(screen * 0.2);
    p.army.mercenaries[arm] = { light: 0, medium: screen - heavy, heavy };
  }
  p.army.stamina = 100;
  p.army.experiencePoints = 3_000_000;
  // MEDICINE at mastery — and it now pulls REGULARS off the field too, not
  // just the hired. Regulars first at every rank, because they are population.
  p.research.levels = { ...p.research.levels, medicine: MAX_FIELD_LEVEL };
  p.resources = { food: 9e6, wood: 9e6, stone: 9e6, ore: 9e6 };
  p.turnsAvailable = 400;
  return p;
}

const reg = (p: Player) => ARMS.reduce((n, k) => n + p.army[k].light + p.army[k].medium + p.army[k].heavy, 0);
const merc = (p: Player) =>
  ARMS.reduce(
    (n, k) => n + p.army.mercenaries[k].light + p.army.mercenaries[k].medium + p.army.mercenaries[k].heavy,
    0,
  );

console.log(
  `RAIDS · all regulars HEAVY · screen 20% heavy / 80% medium · capped at ${(MERCENARIES.CAP_RATIO * 100).toFixed(0)}% of the arm`,
);
console.log(
  `MERC_SHARE ${CASUALTY_SPLIT.MERC_SHARE} at each rank · COMBAT_TEMPO ${COMBAT_TEMPO} · ` +
    `MEDICINE ${MAX_FIELD_LEVEL}/5 (revives regulars too) · yield at ${YIELD.WORTH_ADVANTAGE}x worth\n` +
      `dodge (regular AND hired alike) — foot ${((1 - DAMAGE_TAKEN.footman) * 100).toFixed(0)}% · ` +
      `horse ${((1 - DAMAGE_TAKEN.cavalry) * 100).toFixed(0)}% · bow ${((1 - DAMAGE_TAKEN.archer) * 100).toFixed(0)}%\n` +
      `drain — bow x${STAMINA.DRAIN_RATE.archer} · horse x${STAMINA.DRAIN_RATE.cavalry} · foot x${STAMINA.DRAIN_RATE.footman} · engines contribute none\n`,
);
console.log(
  `Attacker re-hires the screen each strike and rests. Defender does neither — stamina falls to the`,
);
console.log(
  `mercy floor (${STAMINA.MERCY_FLOOR}) or the attacker outweighs them ${YIELD.WORTH_ADVANTAGE}x on power+health, and they YIELD.\n`,
);
console.log(
  "arm  size | YIELDS | regs dead | hired dead | regs% | unscreened",
);
console.log("-".repeat(104));

for (const arm of ["archers", "cavalry", "footmen", "mixed" as Arm] as Arm[]) {
  for (const size of [200, 700, 1500]) {
    let a = host("A", arm, size);
    let d = host("D", arm, size);
    const startReg = reg(d);
    let screenGone = 0;
    let startHeads = 0;
    // What the attacker actually SPENDS to keep coming back. The harness hands
    // it a fresh screen and a full stamina bar each strike; those are real
    // purchases in the game and the campaign is only as long as they are
    // affordable.
    let foodSpent = 0;
    let goldSpent = 0;
    let drainSeen = 0;
    let stamAtYield = 0;
    // Cumulative dead on the DEFENDER's side, split by who they were. The
    // screen is re-counted every strike because Medicine hands some back.
    let mercDead = 0;
    let bareStrikes = 0;
    let startMerc = 0;
    const stamTrail: number[] = [];
    let firstReg = 0;
    let firstMerc = 0;
    let after12 = 0;
    let yieldAt = 0;
    let regAtYield = 0;
    let mercAtYield = 0;
    let healthAtYield = 0;
    // Health is what the yield rule actually measures, so track it directly:
    // count x health, summed, exactly as totalHealth() does inside the engine.
    const heads = (p: Player) =>
      ARMS.flatMap((k) => [
        [p.army[k].light, 25], [p.army[k].medium, 40], [p.army[k].heavy, 65],
        [p.army.mercenaries[k].light, 25], [p.army.mercenaries[k].medium, 40], [p.army.mercenaries[k].heavy, 65],
      ] as const);
    const rawHealth = (p: Player) => heads(p).reduce((n, [c]) => n + c, 0);

    startHeads = ARMS.reduce(
      (n, k) =>
        n + d.army[k].light + d.army[k].medium + d.army[k].heavy +
        d.army.mercenaries[k].light + d.army.mercenaries[k].medium + d.army.mercenaries[k].heavy,
      0,
    );
    startMerc = merc(d);
    for (let i = 1; i <= 60; i++) {
      const before = { r: reg(d), m: merc(d) };
      const out = resolveBattle(a, d, "raid", { rng: seededRng(i), battleId: `b${i}`, tick: i });
      a = out.attacker;
      d = out.defender;
      if (i === 1) {
        firstReg = before.r - reg(d);
        firstMerc = before.m - merc(d);
      }
      stamTrail.push(d.army.stamina);
      // Was the screen already empty when this blow landed? Those are the
      // strikes where every point of damage at a rank goes to real population.
      if (!yieldAt && before.m <= 0) bareStrikes += 1;
      mercDead += out.report.defenderLosses.mercenaries;
      if (!yieldAt && out.report.yielded) {
        stamAtYield = d.army.stamina;
        yieldAt = i;
        regAtYield = startReg - reg(d);
        mercAtYield = mercDead;
        healthAtYield = startHeads > 0 ? (rawHealth(d) / startHeads) * 100 : 0;
      }
      // The ATTACKER is at their keyboard between strikes: rest, re-hire, march
      // again. The DEFENDER is not — no fresh sellswords, no Rest order.
      drainSeen = Math.max(drainSeen, out.report.staminaLoss.attacker);
      foodSpent += restFoodCost(a, STAMINA.MAX - a.army.stamina);
      a.army.stamina = 100;
      a.turnsAvailable = 400;
      goldSpent += rescreen(a) * mercPrice(a, "footman", "medium");
      // NO passive recovery for the defender. Stamina comes back at +1 per
      // GAME turn (ten real minutes) — but an attacker striking from a banked
      // pool spends 10 ACTION turns a blow out of a 500 cap, so fifty strikes
      // can land inside one game turn. An assault delivered in a single sitting
      // gives the defender no time to breathe, and that is the case being
      // measured here.
      if (!screenGone && merc(d) === 0) screenGone = i;
      if (i === 12) after12 = reg(d);
      if (i >= 12 && yieldAt) break;
      if (reg(d) <= 0) break;
    }

    const yieldCol = yieldAt ? `strike ${yieldAt}` : "never";
    const lost = yieldAt
      ? `${regAtYield} of ${startReg} (${((regAtYield / startReg) * 100).toFixed(0)}%)`
      : "—";
    const standing = yieldAt ? `${startReg - regAtYield}` : "—";
    const totalDead = regAtYield + mercAtYield;
    const regShare = totalDead > 0 ? (regAtYield / totalDead) * 100 : 0;
    const comp = `${startReg} / ${startMerc}  (${((startMerc / (startReg + startMerc)) * 100).toFixed(0)}% hired)`;
    console.log(
      `${arm.slice(0, 4).padEnd(4)} ${String(size).padStart(4)} | ${yieldCol.replace("strike ", "s").padEnd(6)} | ` +
        `${`${regAtYield} (${((regAtYield / startReg) * 100).toFixed(0)}%)`.padEnd(9)} | ` +
        `${String(mercAtYield).padEnd(10)} | ` +
        `${regShare.toFixed(0)}%`.padEnd(6) + ` | ${String(bareStrikes).padStart(2)} of ${yieldAt} bare` +
        ` | ${stamAtYield < STAMINA.MERCY_FLOOR ? "SPENT" : "outmatched"} @${stamAtYield} | ${stamTrail.slice(0, 10).join(" ")}`,
    );
    void lost; void stamAtYield; void stamTrail;
    void foodSpent; void goldSpent; void drainSeen;
    void healthAtYield;
    void standing;
    void after12;
    void firstReg;
    void firstMerc;
  }
}
