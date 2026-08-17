// World persistence, dual-mode behind one async interface:
//  - Supabase Postgres (world_docs, versioned JSONB) when env keys exist —
//    real persistence, works on serverless.
//  - JSON file store (data/world.json) otherwise — zero-setup local dev.
// The normalized schema (0001_init.sql) takes over in a later decomposition.

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CHAT } from "../constants";
import type { BattleReport, Clan, EraRecords, GameEvent, MarketOrder, Player } from "../engine";
import type { ElderTable } from "../lore/elderAges";
import { worldServiceEnabled } from "./worldClient";

export interface ForumMessage {
  id: string;
  channel: string; // "era" | `clan:${clanId}` | `dm:${idA}:${idB}` (sorted ids)
  authorId: string;
  authorName: string;
  body: string;
  tick: number;
}

export interface InboxItem {
  tick: number;
  event: GameEvent;
  at?: string; // wall-clock ISO when the tiding was recorded (for "how long ago")
}

/** An open hold interval: who is currently accruing (the eligible #1 / #1 clan)
 *  and the wall-clock ms they began. Cumulative held time lives in the *ClocksMs
 *  maps; the live streak is `now − sinceMs` (§14.3 — event-driven, ms-accurate). */
export interface HoldInterval {
  id: string; // playerId or clanId
  sinceMs: number; // wall-clock ms this uninterrupted, above-floor #1 hold began
}

export interface WorldMeta {
  tickNumber: number;
  eraNumber: number;
  eraName: string;
  eraStartedAtTick: number;
  lastTickAt: string; // wall-clock ISO of the last processed tick
  // §14.3 hold clocks — cumulative *closed*-interval ms per holder, plus the
  // current open interval. Credited by exact elapsed ms whenever the ladder top
  // reorders (every command + tick), not sampled once per 10-minute tick.
  overlordClocksMs: Record<string, number>; // playerId → cumulative closed ms at #1 (above floor)
  overlordAccruing: HoldInterval | null;
  clanClocksMs: Record<string, number>;
  clanAccruing: HoldInterval | null;
  winner?: { kind: "overlord" | "clan"; id: string; name: string; atTick: number };
  crownHolderId?: string; // last-recorded #1, to notice when the crown passes
}

/** One line in the world's grand chronicle (the Annals of the Age). */
export interface ChronicleEntry {
  tick: number;
  at: string; // wall-clock ISO
  tone: string; // crown | war | danger | growth | trade | clan | shadow | info
  text: string;
}

/** A past era's annals, sealed for good when the age ended. */
export interface ArchivedAge {
  eraNumber: number;
  eraName: string;
  winnerName?: string;
  winnerKind?: "overlord" | "clan";
  sealedAt: string; // ISO
  entries: ChronicleEntry[];
  finalLadder: { name: string; score: number }[]; // top empires at the close
  /** The age's War Records (superlatives of arms), sealed with it. Optional for
   *  ages sealed before records were kept. */
  records?: EraRecords;
  /** The full leaderboard set (rulers, empires, champions, titles, battle
   *  records) computed from the live world at seal time — the ladders and civil
   *  feats can't be recovered once the world resets, so they're frozen here.
   *  Absent on ages sealed before the full record set existed (fall back to
   *  `records`, which holds only the five battle tables). */
  sealedTables?: ElderTable[];
}

/** One run of the tick job — the world's heartbeat, recorded so an operator can
 *  see it beating (and see it stop). Only runs that actually advanced the clock
 *  are kept, plus every failure: the in-process path calls runDueTicks on every
 *  world read, and logging those no-ops would drown the signal. */
export interface TickRun {
  at: string; // ISO, when the run finished
  tick: number; // world tick after the run
  processed: number; // how many ticks it applied
  ms: number; // how long the run took
  ok: boolean;
  error?: string;
}

export interface PricePoint {
  t: number; // tick
  p: number | null; // lowest ask, null = no supply
}

export interface World {
  meta: WorldMeta;
  players: Record<string, Player>;
  clans: Record<string, Clan>;
  orders: MarketOrder[];
  battles: BattleReport[]; // newest first, capped
  messages: ForumMessage[];
  inbox: Record<string, InboxItem[]>; // per-player event feed, capped
  /** Hourly market-price samples per resource (~2 weeks kept). Optional for
   *  worlds seeded before charts existed. */
  priceHistory?: Record<"food" | "wood" | "stone" | "ore", PricePoint[]>;
  /** The grand chronicle of the current age — significant world-wide events. */
  chronicle?: ChronicleEntry[];
  /** Past ages, sealed for good at each era's close. Carried across resets. */
  chronicleArchive?: ArchivedAge[];
  /** The living War Records of the current age — superlatives of arms, tallied
   *  as battles resolve. Optional for worlds seeded before records existed. */
  eraRecords?: EraRecords;
  /** The last 7 days of tick runs, newest last. See TickRun. */
  tickLog?: TickRun[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const WORLD_FILE = path.join(DATA_DIR, "world.json");
const WORLD_ROW_ID = "main";
/** How long a loaded world stays warm in memory before the next getWorld()
 *  re-fetches from Supabase. The world only changes on the 10-minute tick (and
 *  our own writes update this cache in place), so a few seconds of staleness is
 *  harmless — and it keeps most navigations off the network round-trip entirely. */
const CACHE_TTL_MS = 10_000;

// Survive Next.js dev-mode module reloads.
const g = globalThis as unknown as {
  __woeWorld?: World;
  __woeWorldLoadedAt?: number;
  __woeWorldVersions?: WeakMap<World, number>;
  __woeSb?: SupabaseClient;
  /** Full battle reports awaiting their side-store write — see pushBattle. */
  __woePendingBattles?: BattleReport[];
};

/**
 * The store version each in-memory World was loaded at — the basis of the
 * compare-and-swap in `saveWorld`.
 *
 * Keyed by the world OBJECT, deliberately, and not held in a module global.
 * A global is read at save time, so it belongs to whichever load ran most
 * recently rather than to the world you are actually holding. Under Fluid
 * Compute two concurrent requests share one Node instance, and that mismatch
 * let a save pass a compare-and-swap it should have failed. Tagging the object
 * captures the version at load, where it belongs.
 */
const versions = (g.__woeWorldVersions ??= new WeakMap<World, number>());

/** The version `world` was loaded at, or undefined if it never came from the
 *  store (a fresh seed) — which is the signal to INSERT rather than update. */
export function worldVersion(world: World): number | undefined {
  return versions.get(world);
}

/** Carry a version across to a replacement world. For callers that build a new
 *  world from an old one (`eraReset`) and mean to write it over the row they
 *  loaded, rather than to insert a second one. */
export function carryWorldVersion(from: World, to: World): void {
  const v = versions.get(from);
  if (v === undefined) versions.delete(to);
  else versions.set(to, v);
}

/**
 * A private, correctly-versioned copy — the only safe thing to mutate.
 *
 * `loadWorld` hands back the SHARED cached object, so without this two
 * concurrent commands mutate the same world: the first serializes the second's
 * half-finished changes into its own write, the second then loses the CAS,
 * reloads a world that already contains its effects, and applies its command a
 * second time. Gold spent twice, a battle resolved twice. `commitWithRetry`
 * promises `apply` a pristine world to replay onto; this is what keeps it.
 */
export function cloneWorld(world: World): World {
  const copy = structuredClone(world);
  carryWorldVersion(world, copy);
  return copy;
}

function supabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!g.__woeSb) {
    g.__woeSb = createClient(url, key, { auth: { persistSession: false } });
  }
  return g.__woeSb;
}

export function storeMode(): "supabase" | "file" {
  return supabase() ? "supabase" : "file";
}

/** The shared Supabase client (or null when unconfigured) — for the durable
 *  read-heavy edges in §14.4 (spectator snapshots), which live in their own
 *  tables rather than the world blob. */
export function getSupabaseClient(): SupabaseClient | null {
  return supabase();
}

/**
 * Optimistic-concurrency failure (spec/architecture.md §14.1): the world row's
 * version moved on under us between load and save — another writer got there
 * first. The caller should reload, re-apply, and retry (see `commitWithRetry`).
 * This turns silent last-write-wins corruption into a detectable, recoverable
 * event the moment a second serverless instance exists.
 */
export class WorldConflictError extends Error {
  constructor(message = "The world was written by another process") {
    super(message);
    this.name = "WorldConflictError";
  }
}

/** Drop the in-process world cache so the next load re-fetches from the store
 *  (and re-reads the authoritative version for the next compare-and-swap).
 *  Worlds already handed out keep their own version tags — they are still an
 *  honest record of what those objects were loaded at. */
export function invalidateWorldCache(): void {
  g.__woeWorld = undefined;
  g.__woeWorldLoadedAt = undefined;
}

/** Postgres unique-violation (racing INSERT of the same world row). */
function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

export async function loadWorld(opts: { forceReload?: boolean } = {}): Promise<World | null> {
  const sb = supabase();
  if (sb) {
    if (!opts.forceReload && g.__woeWorld && Date.now() - (g.__woeWorldLoadedAt ?? 0) < CACHE_TTL_MS) {
      return g.__woeWorld;
    }
    const { data, error } = await sb
      .from("world_docs")
      .select("doc, version")
      .eq("id", WORLD_ROW_ID)
      .maybeSingle();
    if (error) throw new Error(`Supabase load failed: ${error.message}`);
    if (!data) return null; // no row yet — an untagged world will INSERT
    const world = data.doc as World;
    versions.set(world, data.version as number);
    g.__woeWorld = world;
    g.__woeWorldLoadedAt = Date.now();
    return world;
  }

  if (!opts.forceReload && g.__woeWorld) return g.__woeWorld;
  try {
    const raw = fs.readFileSync(WORLD_FILE, "utf8");
    g.__woeWorld = JSON.parse(raw) as World;
    return g.__woeWorld;
  } catch {
    return null;
  }
}

/**
 * Persist the world. On Supabase this is a **compare-and-swap**: the write only
 * lands if the row's version still equals the one THIS world was loaded at,
 * bumping it by one. If another writer advanced it first, we throw
 * `WorldConflictError` instead of clobbering their write (§14.1). The in-process
 * cache is updated only on success, so a conflicting save never poisons it.
 * The file store (single-process local dev) has no such race and writes plainly.
 *
 * The expected version is read off the world itself (see `worldVersion`) rather
 * than from a module global, so a save is always compared against the state its
 * caller actually saw.
 */
export async function saveWorld(world: World): Promise<void> {
  // §14.2 safety net: when the single-writer service owns the world, the store
  // is not the source of truth — writing to it would be silently discarded.
  // Every mutation must instead flow through a command (runCommand → the
  // service). This catches any unconverted path loudly. (Admin write ops are
  // the known remaining path — wire them through commands to run under §14.2.)
  if (worldServiceEnabled()) {
    throw new Error(
      "saveWorld() is disabled while WORLD_SERVICE_URL is set — route this mutation through runCommand (the single writer, §14.2).",
    );
  }
  await flushBattleDocs();
  const sb = supabase();
  if (sb) {
    const expected = worldVersion(world); // version THIS world was loaded at
    const nextVersion = (expected ?? 0) + 1;
    const stamp = new Date().toISOString();

    if (expected === undefined) {
      // First write of a fresh world row (the seed). A racing instance may
      // create it first — that surfaces as a unique violation → conflict.
      const { error } = await sb
        .from("world_docs")
        .insert({ id: WORLD_ROW_ID, doc: world, version: nextVersion, updated_at: stamp });
      if (error) {
        if (isUniqueViolation(error)) throw new WorldConflictError("world row already created");
        throw new Error(`Supabase save failed: ${error.message}`);
      }
    } else {
      // Guarded update: only rows still at `expected` are touched. Zero rows
      // back means the version moved on — someone else committed first.
      const { data, error } = await sb
        .from("world_docs")
        .update({ doc: world, version: nextVersion, updated_at: stamp })
        .eq("id", WORLD_ROW_ID)
        .eq("version", expected)
        .select("version");
      if (error) throw new Error(`Supabase save failed: ${error.message}`);
      if (!data || data.length === 0) {
        throw new WorldConflictError(`version ${expected} was overtaken`);
      }
    }

    versions.set(world, nextVersion);
    g.__woeWorld = world;
    g.__woeWorldLoadedAt = Date.now();
    return;
  }

  g.__woeWorld = world;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = WORLD_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(world));
  fs.renameSync(tmp, WORLD_FILE);
}

/**
 * The Chronicle is a focused war/espionage/crown log — NOT a catch-all. It
 * records only: attacks on you (`attacked`) and by you (`battleResult`), spy
 * ops against you (`spiesCaught`/`sabotaged`) and by you (`spyReport`), and your
 * (and your clan's) victory hold-clock starting or stopping (`crownClock`).
 * Everything else (economy, growth, research, building, market, clan notices) is
 * surfaced on its own page and never clutters the Chronicle.
 */
const CHRONICLE_EVENTS: ReadonlySet<GameEvent["type"]> = new Set([
  "attacked",
  "battleResult",
  "spyReport",
  "spiesCaught",
  "sabotaged",
  "crownClock",
]);

export function pushInbox(world: World, playerId: string, event: GameEvent): void {
  if (!CHRONICLE_EVENTS.has(event.type)) return; // keep the Chronicle to the five war/crown categories
  const list = world.inbox[playerId] ?? (world.inbox[playerId] = []);
  list.unshift({ tick: world.meta.tickNumber, event, at: new Date().toISOString() });
  if (list.length > 60) list.length = 60;
}

/**
 * File a battle: a LIGHT entry in the world doc, the FULL report in a side
 * store of its own.
 *
 * The prose log and the forces snapshot are the two heavy limbs of a report —
 * kilobytes each — and three hundred of them used to ride inside the world
 * doc, which the whole game reads per page and rewrites per command. Nothing
 * but the report page itself ever opened them: the chronicle, the empire
 * ledger and the public API all read the metadata alone. So the doc keeps the
 * metadata and the detail goes to `battle:<id>` rows (or files, in dev),
 * written when the world is next saved — the same request that filed the
 * battle, so the link in the tiding never points at a report that is not
 * there yet.
 *
 * Battle docs are IMMUTABLE once written, which is why they may safely bypass
 * the single-writer discipline the world doc lives under.
 */
export function pushBattle(world: World, report: BattleReport): void {
  (g.__woePendingBattles ??= []).push(report);
  world.battles.unshift({ ...report, log: [], forces: undefined });
  if (world.battles.length > 300) world.battles.length = 300;
}

const BATTLES_DIR = path.join(DATA_DIR, "battles");
/** Row-id namespace inside world_docs — reusing the table costs no migration. */
const battleRowId = (id: string) => `battle:${id}`;
/** Battle ids are UUIDs from our own randomUUID — anything else is refused
 *  before it can reach a filename or a row id. */
const SAFE_BATTLE_ID = /^[a-zA-Z0-9-]{1,64}$/;

/** Write queued battle docs out. Called from saveWorld, so the flush rides the
 *  same request that filed the battle. A failure loses the DETAIL of a report,
 *  never the battle itself — the world doc carries the metadata regardless —
 *  so it logs and moves on rather than failing the save. */
async function flushBattleDocs(): Promise<void> {
  const queue = g.__woePendingBattles;
  if (!queue?.length) return;
  const batch = queue.splice(0);
  const sb = supabase();
  if (sb) {
    const stamp = new Date().toISOString();
    const rows = batch
      .filter((r) => SAFE_BATTLE_ID.test(r.id))
      .map((r) => ({ id: battleRowId(r.id), doc: r, version: 1, updated_at: stamp }));
    const { error } = await sb.from("world_docs").upsert(rows, { onConflict: "id" });
    if (error) console.error(`battle doc flush failed (${rows.length} reports): ${error.message}`);
    return;
  }
  fs.mkdirSync(BATTLES_DIR, { recursive: true });
  for (const r of batch) {
    if (!SAFE_BATTLE_ID.test(r.id)) continue;
    fs.writeFileSync(path.join(BATTLES_DIR, `${r.id}.json`), JSON.stringify(r));
  }
}

/**
 * The full report, side store first, world doc second.
 *
 * The fallback is what keeps old worlds whole: every report filed before the
 * split still carries its log inside the doc, and the index entry IS the full
 * report for them. New entries fall back too — to a report with an empty log —
 * if a flush ever failed, which reads as a terse report rather than a 404.
 */
export async function loadBattle(world: World, id: string): Promise<BattleReport | undefined> {
  const inDoc = world.battles.find((b) => b.id === id);
  if (!SAFE_BATTLE_ID.test(id)) return inDoc;
  const sb = supabase();
  if (sb) {
    const { data } = await sb.from("world_docs").select("doc").eq("id", battleRowId(id)).maybeSingle();
    if (data?.doc) return data.doc as BattleReport;
    return inDoc;
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(BATTLES_DIR, `${id}.json`), "utf8")) as BattleReport;
  } catch {
    return inDoc;
  }
}

/** Record a significant world event in the age's grand chronicle (the Annals). */
export function pushChronicle(world: World, tone: string, text: string): void {
  const list = world.chronicle ?? (world.chronicle = []);
  list.unshift({ tick: world.meta.tickNumber, at: new Date().toISOString(), tone, text });
  if (list.length > 250) list.length = 250;
}

/**
 * Post to a channel and enforce retention. A clan hall remembers only its last
 * CHAT.CLAN_HISTORY words — older ones are dropped for good — and CHAT.TOTAL_HISTORY
 * is the backstop across every channel combined.
 */
export function pushMessage(world: World, msg: ForumMessage): void {
  world.messages.push(msg);

  if (msg.channel.startsWith("clan:")) {
    let excess = world.messages.filter((m) => m.channel === msg.channel).length - CHAT.CLAN_HISTORY;
    for (let i = 0; i < world.messages.length && excess > 0; ) {
      if (world.messages[i].channel === msg.channel) {
        world.messages.splice(i, 1);
        excess--;
      } else {
        i++;
      }
    }
  }

  if (world.messages.length > CHAT.TOTAL_HISTORY) {
    world.messages.splice(0, world.messages.length - CHAT.TOTAL_HISTORY);
  }
}

export function dmChannel(a: string, b: string): string {
  return `dm:${[a, b].sort().join(":")}`;
}
