// World persistence, dual-mode behind one async interface:
//  - Supabase Postgres (world_docs, versioned JSONB) when env keys exist —
//    real persistence, works on serverless.
//  - JSON file store (data/world.json) otherwise — zero-setup local dev.
// The normalized schema (0001_init.sql) takes over in a later decomposition.

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BattleReport, Clan, EraRecords, GameEvent, MarketOrder, Player } from "../engine";

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

export interface WorldMeta {
  tickNumber: number;
  eraNumber: number;
  eraName: string;
  eraStartedAtTick: number;
  lastTickAt: string; // wall-clock ISO of the last processed tick
  overlordClocks: Record<string, number>; // playerId → cumulative ticks at #1
  overlordStreak: { playerId: string; ticks: number } | null;
  clanClocks: Record<string, number>;
  clanStreak: { clanId: string; ticks: number } | null;
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

export async function loadWorld(): Promise<World | null> {
  const sb = supabase();
  if (sb) {
    if (g.__woeWorld && Date.now() - (g.__woeWorldLoadedAt ?? 0) < CACHE_TTL_MS) {
      return g.__woeWorld;
    }
    const { data, error } = await sb
      .from("world_docs")
      .select("doc, version")
      .eq("id", WORLD_ROW_ID)
      .maybeSingle();
    if (error) throw new Error(`Supabase load failed: ${error.message}`);
    if (!data) return null;
    g.__woeWorld = data.doc as World;
    g.__woeWorldVersion = data.version as number;
    g.__woeWorldLoadedAt = Date.now();
    return g.__woeWorld;
  }

  if (g.__woeWorld) return g.__woeWorld;
  try {
    const raw = fs.readFileSync(WORLD_FILE, "utf8");
    g.__woeWorld = JSON.parse(raw) as World;
    return g.__woeWorld;
  } catch {
    return null;
  }
}

export async function saveWorld(world: World): Promise<void> {
  const sb = supabase();
  if (sb) {
    g.__woeWorld = world;
    g.__woeWorldLoadedAt = Date.now();
    const version = (g.__woeWorldVersion ?? 0) + 1;
    const { error } = await sb.from("world_docs").upsert({
      id: WORLD_ROW_ID,
      doc: world,
      version,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Supabase save failed: ${error.message}`);
    g.__woeWorldVersion = version;
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
