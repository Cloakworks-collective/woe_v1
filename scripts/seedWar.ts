/**
 * Seed a war around one named empire — the scriptable twin of the admin
 * console's "Seed a war" button, for when you want it run from a terminal.
 *
 *     pnpm dlx tsx --env-file=.env.local scripts/seedWar.ts "Keyholt"
 *
 * Every order goes through `applyOneCommand`, the same path a player's click
 * takes. Nothing here writes a battle report or a covert record by hand, so the
 * seeded data cannot drift from what the game actually produces — and any gate
 * that would refuse a real player refuses this too, which is why the
 * preparation below (shields, turns, agents, the era peace) is load-bearing
 * rather than decorative.
 */

import { applyOneCommand } from "../lib/server/pipeline";
import { ERA_PEACE_TICKS, commitWithRetry, seedBot } from "../lib/server/world";
import { rankingScore, type Player } from "../lib/engine";
import { ATTACK_REFUSAL_RATIO, COVERT_LOG_DAYS, TURNS_PER_DAY } from "../lib/constants";
import type { Race } from "../lib/constants/races";
import type { World } from "../lib/server/store";

const WANT_NAME = process.argv[2] ?? "Keyholt";

/** Ready an empire to actually be able to act. */
function prepare(p: Player): void {
  p.shieldUntilTick = 0;
  p.onVacation = false;
  p.vacationQueued = false;
  p.turnsAvailable = 400;
  p.spyTurnsAvailable = 200;
  p.army.stamina = 100;
  p.army.spies = Math.max(p.army.spies, 80);
  p.army.scouts = Math.max(p.army.scouts, 80);
  p.buildings.shadow_guild = Math.max(p.buildings.shadow_guild ?? 0, 5);
  p.buildings.rangers_lodge = Math.max(p.buildings.rangers_lodge ?? 0, 5);
  p.buildings.war_foundry = Math.max(p.buildings.war_foundry ?? 0, 6);
  p.army.siegeEngineers = Math.max(p.army.siegeEngineers, 60);
  p.army.siegeGear = { ...p.army.siegeGear, rams: 8, ballistae: 5, trebuchets: 10, ladders: 8 };
  // A starving army will not march, and a bot two days into a food deficit is
  // the commonest reason a seeded order bounces. Fill the granary.
  p.starving = false;
  p.resources = { ...p.resources, food: Math.max(p.resources.food, 200_000) };
}

async function main() {
  const summary = await commitWithRetry<string>((world: World) => {
    const viewer = Object.values(world.players).find(
      (p) => p.name.toLowerCase() === WANT_NAME.toLowerCase(),
    );
    if (!viewer) {
      const names = Object.values(world.players).map((p) => p.name).join(", ");
      return { result: `No empire named "${WANT_NAME}". Found: ${names}`, dirty: false };
    }

    const viewerScore = rankingScore(viewer);
    const notes: string[] = [];

    // ── A rival of THEIR OWN WEIGHT ───────────────────────────────────────
    // An even fight is where the interesting reports come from: punching far
    // down is refused by the matchup rules and teaches nothing, and punching
    // far up is refused outright above ATTACK_REFUSAL_RATIO. Find one within
    // ±25%, and if the ladder has nobody that size, build one.
    // Judge candidates at the weight they will FIGHT at. `prepare` below hands
    // out engineers, engines and two levels of covert housing, all of which
    // score — so sizing a peer against its unprepared score picked one that
    // ended up half again the viewer's weight and had its own orders refused.
    const preparedScore = (p: Player) => {
      const probe = structuredClone(p);
      prepare(probe);
      return rankingScore(probe);
    };
    const band = (p: Player) => {
      const r = preparedScore(p) / Math.max(1, viewerScore);
      return r >= 0.75 && r <= 1.25;
    };
    const MIRROW = "bot-mirrowmark";
    let peer = Object.values(world.players).find(
      (p) => p.id !== viewer.id && !p.banned && p.id !== MIRROW && band(p),
    );
    if (!peer) {
      // seedBot sizes an empire off a population figure, so search for the
      // population whose PREPARED score lands nearest the viewer rather than
      // guessing a constant that would drift the moment scoring changes.
      let best: { pop: number; diff: number } | null = null;
      for (let pop = 100; pop <= 12000; pop += 25) {
        const probe = seedBot("probe", "Probe", "human", pop);
        prepare(probe);
        const diff = Math.abs(rankingScore(probe) - viewerScore);
        if (!best || diff < best.diff) best = { pop, diff };
      }
      // Re-size rather than skip when it already exists, so running this twice
      // does not leave a mis-weighted rival standing from the first attempt.
      peer = seedBot(MIRROW, "Mirrowmark", "human", best!.pop);
      world.players[MIRROW] = peer;
      notes.push(
        world.players[MIRROW]
          ? `sized Mirrowmark to ${best!.pop} pop to stand as an even match`
          : `founded Mirrowmark at ${best!.pop} pop`,
      );
    }

    // ── The rest of the cast, so the ladder is not a duel ─────────────────
    const EXTRA: { id: string; name: string; race: Race; pop: number }[] = [
      { id: "bot-ashfen", name: "Ashfen Reach", race: "human", pop: 740 },
      { id: "bot-gorgar", name: "Gorgar's Pit", race: "orc", pop: 1320 },
      { id: "bot-mirefang", name: "Mirefang Pack", race: "gnoll", pop: 1680 },
      { id: "bot-hrunmarr", name: "Hrunmarr", race: "troll", pop: 1950 },
    ];
    let founded = 0;
    for (const e of EXTRA) {
      if (world.players[e.id]) continue;
      world.players[e.id] = seedBot(e.id, e.name, e.race, e.pop);
      founded++;
    }

    const cast = Object.values(world.players).filter((p) => p.id !== viewer.id && !p.banned);
    // The army REFUSES anything ATTACK_REFUSAL_RATIO above its own weight, so a
    // target pool drawn from the whole ladder throws away a third of the script
    // on orders that were never going to land. Attack only what can be attacked.
    const reachable = cast.filter((p) => rankingScore(p) / Math.max(1, viewerScore) < ATTACK_REFUSAL_RATIO);
    for (const p of [viewer, ...cast]) prepare(p);
    // Nothing lands inside the era peace, so open the age if it is still shut.
    const tick = world.meta.tickNumber;
    if (tick - world.meta.eraStartedAtTick < ERA_PEACE_TICKS) {
      world.meta.eraStartedAtTick = tick - ERA_PEACE_TICKS - 1;
    }

    let ran = 0;
    const refusals: string[] = [];
    const run = (actorId: string, name: string, args: Record<string, unknown>) => {
      const r = applyOneCommand(world, actorId, name, args);
      if (r.result.ok) ran++;
      else refusals.push(`${name} ${JSON.stringify(args.mode ?? args.op)}: ${r.result.message}`);
    };

    // ── The campaign ──────────────────────────────────────────────────────
    // The peer takes the brunt, since an even fight is the readable one.
    const others = reachable.filter((p) => p.id !== peer!.id);
    const pick = (i: number) => others[i % others.length] ?? peer!;

    run(viewer.id, "attack", { targetId: peer.id, mode: "raid" });
    run(viewer.id, "attack", { targetId: peer.id, mode: "siege" });
    run(viewer.id, "attack", { targetId: peer.id, mode: "bombard" });
    for (let i = 0; i < 3; i++) {
      run(viewer.id, "attack", { targetId: pick(i).id, mode: (["raid", "siege", "raid"] as const)[i] });
    }
    // Blows landed ON them — this is what opens their revenge windows.
    run(peer.id, "attack", { targetId: viewer.id, mode: "raid" });
    run(peer.id, "attack", { targetId: viewer.id, mode: "siege" });
    for (let i = 0; i < 2; i++) run(pick(i).id, "attack", { targetId: viewer.id, mode: "raid" });
    // …and the answers, which only work because of the loop above.
    run(viewer.id, "attack", { targetId: peer.id, mode: "revenge" });
    for (let i = 0; i < 2; i++) run(viewer.id, "attack", { targetId: pick(i).id, mode: "revenge" });

    // Bot-on-bot, so the chronicle is not all one empire.
    for (let i = 0; i < 6; i++) {
      const a = others[i % others.length];
      const d = others[(i + 2) % others.length];
      if (!a || !d || a.id === d.id) continue;
      run(a.id, "attack", { targetId: d.id, mode: (["raid", "siege", "bombard"] as const)[i % 3] });
    }

    // ── The shadow war ────────────────────────────────────────────────────
    const SCOUT_OPS = ["survey_coffers", "map_walls", "map_army", "map_siege", "map_research"];
    const SPY_OPS = [
      "torch_stores", "steal_resources", "sabotage_siege",
      "sabotage_walls", "incite_unrest", "sow_doubt", "steal_research",
    ];
    // Agents are SPENT by interception, and the script sends more missions than
    // a realm carries knives. Top the corps up so the later ops in the list are
    // not silently refused for want of bodies.
    const topUp = world.players[viewer.id];
    topUp.army.spies = 200;
    topUp.army.scouts = 200;
    topUp.spyTurnsAvailable = 200;

    // Every scout op against the peer, so one rival has a full dossier.
    SCOUT_OPS.forEach((op) => run(viewer.id, "covert", { targetId: peer!.id, op, agents: 10 }));
    // And spread across the rest, so the target filter has work to do.
    SCOUT_OPS.forEach((op, i) => run(viewer.id, "covert", { targetId: pick(i).id, op, agents: 8 }));
    SPY_OPS.forEach((op, i) => run(viewer.id, "covert", { targetId: pick(i).id, op, agents: 6 + i }));
    SPY_OPS.slice(0, 3).forEach((op) => run(viewer.id, "covert", { targetId: peer!.id, op, agents: 9 }));
    // Shadows sent at them, so their rangers have something to show.
    for (let i = 0; i < 3; i++) {
      run(pick(i).id, "covert", { targetId: viewer.id, op: "torch_stores", agents: 12 });
    }

    // ── Spread the timestamps ─────────────────────────────────────────────
    // Everything above ran on ONE tick. Without this the desk is forty rows
    // reading "just now" and the 5-day window is untestable. The reports
    // themselves are exactly what the engine produced; only the stamps move.
    // `put` inside the pipeline REPLACES world.players[id] with a fresh clone,
    // so the `viewer` binding above went stale on the very first command — its
    // covertLog is the empty array from before the campaign ran. Re-read the
    // live object or the backdating below silently edits a discarded copy (and
    // the run reports "0 covert reports filed" while the log is in fact full).
    const filed = world.players[viewer.id];
    const span = COVERT_LOG_DAYS * TURNS_PER_DAY - 2;
    const log = filed.covertLog ?? [];
    log.forEach((r, i) => {
      r.tick = tick - Math.floor((i / Math.max(1, log.length)) * span);
    });
    world.battles.forEach((b, i) => {
      b.tick = Math.max(0, tick - Math.floor((i / Math.max(1, world.battles.length)) * span));
    });

    const msg = [
      `Seeded a war for ${viewer.name} (score ${viewerScore}).`,
      `Peer: ${peer!.name} (score ${rankingScore(peer!)}).`,
      notes.length ? notes.join("; ") + "." : "",
      `${founded} extra empires founded; ${Object.keys(world.players).length} on the ladder.`,
      `${ran} orders landed, ${refusals.length} refused.`,
      `${log.length} covert reports filed; ${world.battles.length} battles on record.`,
      refusals.length ? `\nRefusals:\n  ${refusals.slice(0, 12).join("\n  ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { result: msg, dirty: true };
  });

  console.log(summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
