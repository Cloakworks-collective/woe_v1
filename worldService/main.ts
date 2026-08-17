// The single-writer World Service (todo.md §14.2 — "the real fix").
//
// One always-on Node process owns the whole world in memory and serializes
// EVERY mutation through an in-order queue — the classic MUD / browser-game
// model. Because all writes flow through one process one-at-a-time, the races
// the serverless blob suffered (last-write-wins, resurrected casualties) are
// gone by construction; §14.1's compare-and-swap is a belt-and-braces fallback
// for the serverless path, not needed here.
//
// The engine is reused verbatim: `applyOneCommand` is the same function the
// in-process path runs. Persistence is off the request path — a periodic
// snapshot plus an append-only command log for the sub-snapshot gap.
//
// Run:  pnpm world-service   (tsx worldService/main.ts)
// Env:  PORT / WORLD_SERVICE_PORT   listen port (default 4000)
//       WORLD_SERVICE_SECRET        shared secret the app must send (x-woe-secret)
//       WORLD_SERVICE_DATA_DIR      snapshot + log dir (default ./data/world-service)
//       WORLD_SNAPSHOT_MS           snapshot cadence when dirty (default 2000)
//       WORLD_TICK_CHECK_MS         how often to apply due 10-min ticks (default 15000)
// NOTE: do NOT set WORLD_SERVICE_URL in this process — that flag is for the app.

import http from "node:http";
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { applyOneCommand, type CommandResult } from "../lib/server/pipeline";
import { normalizeMeta, runDueTicks, seedWorld } from "../lib/server/world";
import { flushBattleDocs } from "../lib/server/store";
import { writeSpectatorSnapshot } from "../lib/server/analytics";
import { normalizePlayer } from "../lib/engine";
import type { World } from "../lib/server/store";

const PORT = Number(process.env.PORT || process.env.WORLD_SERVICE_PORT || 4000);
const SECRET = process.env.WORLD_SERVICE_SECRET || "";
const DATA_DIR = process.env.WORLD_SERVICE_DATA_DIR || path.join(process.cwd(), "data", "world-service");
const SNAPSHOT = path.join(DATA_DIR, "snapshot.json");
const LOG = path.join(DATA_DIR, "commands.jsonl");
const SNAPSHOT_MS = Number(process.env.WORLD_SNAPSHOT_MS || 2000);
const TICK_CHECK_MS = Number(process.env.WORLD_TICK_CHECK_MS || 15000);

interface LogEntry {
  seq: number;
  playerId: string;
  name: string;
  args: Record<string, unknown>;
  at: string;
}

let world: World;
let seq = 0; // monotonic count of applied (dirty) commands — the log/snapshot cursor
let dirtySinceSnapshot = false;
// Monotonic count of ANY world change — dirty commands AND ticks. `seq` alone
// cannot key a cache because ticks move the world without moving it.
let stateRev = 0;
let worldJson: { rev: number; body: string } | null = null;

/** The serialized world, computed once per state change however many reads ask.
 *  Every page view of every player hits /world; stringifying a multi-megabyte
 *  doc per view was the service's whole CPU bill between commands. */
function serializedWorld(): string {
  if (!worldJson || worldJson.rev !== stateRev) {
    worldJson = { rev: stateRev, body: JSON.stringify(world) };
  }
  return worldJson.body;
}

const log = (m: string) => console.log(`[world-service] ${m}`);

// ── The queue: every mutation runs one-at-a-time, in arrival order ──────────
// Node is single-threaded and applyOneCommand is synchronous, so a task never
// interleaves with another mid-flight; the chain also guarantees ordering of
// the async HTTP handlers and makes snapshots/ticks atomic w.r.t. commands.
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => T): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ── Persistence ─────────────────────────────────────────────────────────────

function appendLog(entry: LogEntry): void {
  fs.appendFileSync(LOG, JSON.stringify(entry) + "\n");
}

function writeSnapshot(): void {
  const tmp = SNAPSHOT + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ seq, world }));
  fs.renameSync(tmp, SNAPSHOT);
  fs.writeFileSync(LOG, ""); // snapshot now covers everything ≤ seq — truncate the gap log
  dirtySinceSnapshot = false;
}

function boot(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SNAPSHOT)) {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) as { seq: number; world: World };
    world = snap.world;
    seq = snap.seq ?? 0;
    // Replay commands the snapshot didn't yet capture (a hard crash's tail).
    // Caveat: RNG commands (attacks/spies) re-roll on replay, so a crash can
    // re-resolve the last ~SNAPSHOT_MS of battles differently. Snapshots are
    // frequent and shutdown snapshots are clean, so this is a rare edge.
    if (fs.existsSync(LOG)) {
      let replayed = 0;
      for (const line of fs.readFileSync(LOG, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const e = JSON.parse(line) as LogEntry;
        if (e.seq <= seq) continue;
        applyOneCommand(world, e.playerId, e.name, e.args);
        seq = e.seq;
        replayed++;
      }
      if (replayed) log(`replayed ${replayed} command(s) past snapshot seq ${snap.seq}`);
    }
  } else {
    world = seedWorld();
    log("no snapshot — seeded a fresh world");
  }
  for (const p of Object.values(world.players)) normalizePlayer(p);
  normalizeMeta(world.meta);
  writeSnapshot(); // establish a clean baseline (also normalises legacy saves)
  log(`booted at seq ${seq}, tick ${world.meta.tickNumber}, ${Object.keys(world.players).length} players`);
}

// ── Command application (queued) ────────────────────────────────────────────

function handleCommand(playerId: string, name: string, args: Record<string, unknown>): CommandResult {
  const { result, dirty } = applyOneCommand(world, playerId, name, args);
  if (dirty) {
    seq += 1;
    appendLog({ seq, playerId, name, args, at: new Date().toISOString() });
    dirtySinceSnapshot = true;
    stateRev += 1;
  }
  return result;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  opts: { gzip?: boolean; etag?: string } = {},
): void {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.etag) headers.etag = opts.etag;
  // The world is megabytes of very repetitive JSON — names, keys, zeroes — and
  // compresses roughly tenfold. At hundreds of players the raw transfer is the
  // service's whole bandwidth bill, so this is not polish; it is most of the
  // scale headroom. Node's fetch on the other side decompresses transparently.
  if (opts.gzip && json.length > 1024) {
    headers["content-encoding"] = "gzip";
    res.writeHead(status, headers);
    res.end(zlib.gzipSync(json));
    return;
  }
  res.writeHead(status, headers);
  res.end(json);
}

const wantsGzip = (req: http.IncomingMessage): boolean =>
  /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));

const server = http.createServer((req, res) => {
  const url = (req.url || "").split("?")[0];

  // Health is open (platform probes); everything else needs the shared secret.
  if (req.method === "GET" && url === "/health") {
    return send(res, 200, { ok: true, tick: world.meta.tickNumber, seq, players: Object.keys(world.players).length });
  }
  if (SECRET && req.headers["x-woe-secret"] !== SECRET) {
    return send(res, 401, { ok: false, message: "unauthorized" });
  }

  if (req.method === "GET" && url === "/world") {
    // CHANGE DETECTION FIRST: the world only moves on a command or a tick, and
    // stateRev counts both — so a reader that already holds rev N gets an empty
    // 304 instead of megabytes it already has. Between changes, reads cost
    // nothing at all. Serialized through the queue either way, so no read ever
    // observes a world mid-command.
    enqueue(() => {
      const etag = `"rev-${stateRev}"`;
      if (req.headers["if-none-match"] === etag) return { etag, body: null as string | null };
      return { etag, body: serializedWorld() };
    }).then(({ etag, body }) => {
      if (body === null) {
        res.writeHead(304, { etag });
        res.end();
        return;
      }
      send(res, 200, body, { gzip: wantsGzip(req), etag });
    });
    return;
  }

  if (req.method === "POST" && url === "/command") {
    readBody(req)
      .then((raw) => {
        const { playerId, name, args } = JSON.parse(raw || "{}") as {
          playerId?: string;
          name?: string;
          args?: Record<string, unknown>;
        };
        if (!playerId || !name) throw new Error("playerId and name are required");
        // The fresh world rides back WITH the result. The commanding request
        // was about to turn around and fetch /world anyway — every command is
        // followed by a page render — so this halves the round trips and,
        // more to the point, halves the number of times the whole world is
        // serialized per click. Serialized inside the queue so no command can
        // land between the apply and the snapshot.
        // The result rides beside the CACHED world serialization — spliced by
        // hand so a command pays for one world stringify at most (its own
        // state change), and the reads that follow pay none.
        return enqueue(() => {
          const result = handleCommand(playerId, name, args ?? {});
          return {
            body: `{"result":${JSON.stringify(result)},"world":${serializedWorld()},"rev":${stateRev}}`,
          };
        });
      })
      // Battle docs BEFORE the response goes out: an attack command's redirect
      // lands on the battle page milliseconds later, and the full report must
      // already be in its side store by then. The service never calls
      // saveWorld (it snapshots to disk), so this is the only flush it has.
      .then(async ({ body }) => {
        await flushBattleDocs();
        send(res, 200, body, { gzip: wantsGzip(req) });
      })
      .catch((err) => send(res, 500, { ok: false, message: String(err?.message ?? err) }));
    return;
  }

  send(res, 404, { ok: false, message: "not found" });
});

// ── Background loops (queued so they never race a command) ──────────────────

setInterval(() => {
  enqueue(() => {
    if (dirtySinceSnapshot) writeSnapshot();
  });
}, SNAPSHOT_MS).unref();

setInterval(() => {
  enqueue(() => {
    const before = world.meta.tickNumber;
    runDueTicks(world); // wall-clock driven — applies every due 10-min tick
    if (world.meta.tickNumber !== before) {
      dirtySinceSnapshot = true;
      stateRev += 1;
      // §14.4: publish the durable spectator snapshot (no-op without Supabase).
      // Fire-and-forget — buildSpectatorSnapshot captures state synchronously
      // before any await, so it can't observe a later command's mutation.
      writeSpectatorSnapshot(world).catch((e) => log(`snapshot write failed: ${e?.message ?? e}`));
    }
  });
}, TICK_CHECK_MS).unref();

// Snapshot on graceful shutdown so a clean stop loses nothing.
let shuttingDown = false;
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${sig} — snapshotting before exit`);
    enqueue(() => writeSnapshot()).finally(() => process.exit(0));
  });
}

boot();
server.listen(PORT, () => log(`listening on :${PORT} · data ${DATA_DIR} · secret ${SECRET ? "on" : "OFF"}`));
