// World persistence, dual-mode behind one async interface:
//  - Supabase Postgres (world_docs, versioned JSONB) when env keys exist —
//    real persistence, works on serverless.
//  - JSON file store (data/world.json) otherwise — zero-setup local dev.
// The normalized schema (0001_init.sql) takes over in a later decomposition.

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  __woeWorldVersion?: number;
  __woeSb?: SupabaseClient;
};

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
 *  (and re-reads the authoritative version for the next compare-and-swap). */
export function invalidateWorldCache(): void {
  g.__woeWorld = undefined;
  g.__woeWorldLoadedAt = undefined;
  g.__woeWorldVersion = undefined;
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
    if (!data) {
      // No row yet — clear any stale version so the next save INSERTs.
      g.__woeWorldVersion = undefined;
      return null;
    }
    g.__woeWorld = data.doc as World;
    g.__woeWorldVersion = data.version as number;
    g.__woeWorldLoadedAt = Date.now();
    return g.__woeWorld;
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
 * lands if the row's version still equals the one we loaded (`__woeWorldVersion`),
 * bumping it by one. If another writer advanced it first, we throw
 * `WorldConflictError` instead of clobbering their write (§14.1). The in-process
 * cache is updated only on success, so a conflicting save never poisons it.
 * The file store (single-process local dev) has no such race and writes plainly.
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
  const sb = supabase();
  if (sb) {
    const expected = g.__woeWorldVersion; // version we read (undefined = fresh row)
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

    g.__woeWorld = world;
    g.__woeWorldVersion = nextVersion;
    g.__woeWorldLoadedAt = Date.now();
    return;
  }

  g.__woeWorld = world;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = WORLD_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(world));
  fs.renameSync(tmp, WORLD_FILE);
}

export function pushInbox(world: World, playerId: string, event: GameEvent): void {
  const list = world.inbox[playerId] ?? (world.inbox[playerId] = []);
  list.unshift({ tick: world.meta.tickNumber, event, at: new Date().toISOString() });
  if (list.length > 60) list.length = 60;
}

export function pushBattle(world: World, report: BattleReport): void {
  world.battles.unshift(report);
  if (world.battles.length > 300) world.battles.length = 300;
}

/** Record a significant world event in the age's grand chronicle (the Annals). */
export function pushChronicle(world: World, tone: string, text: string): void {
  const list = world.chronicle ?? (world.chronicle = []);
  list.unshift({ tick: world.meta.tickNumber, at: new Date().toISOString(), tone, text });
  if (list.length > 250) list.length = 250;
}

export function dmChannel(a: string, b: string): string {
  return `dm:${[a, b].sort().join(":")}`;
}
