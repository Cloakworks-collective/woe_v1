// The forum's SIDE STORE — everything the fixed forum tables cannot hold.
//
// The Supabase forum schema is strict columns (forum_threads, forum_posts),
// and this codebase cannot run DDL — so reactions, edit stamps, reply links,
// thread tags and per-reader progress live in `world_docs` rows under a
// `forum:` prefix, the same no-migration trick the battle reports use. In dev
// (file mode) the lot lives in data/forumExtra.json.
//
// One row PER THREAD (`forum:t:<id>`) rather than per post: a thread's page
// needs every post's extras at once, so one fetch beats N, and contention is
// confined to people reacting inside the same thread at the same moment —
// which the small CAS retry below absorbs.

import fs from "node:fs";
import path from "node:path";
import { getSupabaseClient } from "./store";

export interface PostExtra {
  /** The post this one answers — enough to render "in reply to #4 ↑". */
  replyTo?: { postId: string; n: number; handle: string };
  /** Stamped whenever the author rewrites the body. The body itself lives in
   *  the ordinary post row; only the fact of the edit needs a home here. */
  editedAt?: string;
  /** emoji → account ids. One reaction per account per emoji, toggled. */
  reactions?: Record<string, string[]>;
}

export interface ThreadExtra {
  /** One tag from the channel's fixed list — the lean version of subforums. */
  tag?: string;
  posts: Record<string, PostExtra>;
}

const EMPTY: ThreadExtra = { posts: {} };

// ── File mode ───────────────────────────────────────────────────────────────

interface ExtraFile {
  threads: Record<string, ThreadExtra>;
  /** accountId → threadId → last-read ISO. */
  reads: Record<string, Record<string, string>>;
}

const FILE = path.join(process.cwd(), "data", "forumExtra.json");
const g = globalThis as unknown as { __woeForumExtra?: ExtraFile };

function readFile(): ExtraFile {
  if (g.__woeForumExtra) return g.__woeForumExtra;
  try {
    g.__woeForumExtra = JSON.parse(fs.readFileSync(FILE, "utf8")) as ExtraFile;
  } catch {
    g.__woeForumExtra = { threads: {}, reads: {} };
  }
  return g.__woeForumExtra!;
}

function writeFile(f: ExtraFile): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(f));
}

// ── Supabase rows ───────────────────────────────────────────────────────────

const threadRow = (id: string) => `forum:t:${id}`;
const readRow = (accountId: string) => `forum:read:${accountId}`;
/** Thread and account ids are UUIDs of our own minting — refuse anything that
 *  could not be, before it reaches a row id. */
const SAFE_ID = /^[a-zA-Z0-9-]{1,64}$/;

async function loadDoc<T>(rowId: string): Promise<{ doc: T | null; version: number }> {
  const sb = getSupabaseClient()!;
  const { data } = await sb.from("world_docs").select("doc, version").eq("id", rowId).maybeSingle();
  return { doc: (data?.doc as T) ?? null, version: (data?.version as number) ?? 0 };
}

/** Compare-and-swap with a short retry — reactions from two readers in the
 *  same thread race each other here, and losing one silently is worse than a
 *  second round trip. */
async function mutateDoc<T>(rowId: string, base: T, fn: (doc: T) => T): Promise<T> {
  const sb = getSupabaseClient()!;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { doc, version } = await loadDoc<T>(rowId);
    const next = fn(structuredClone(doc ?? base));
    const stamp = new Date().toISOString();
    if (version === 0) {
      const { error } = await sb
        .from("world_docs")
        .insert({ id: rowId, doc: next, version: 1, updated_at: stamp });
      if (!error) return next;
      if (error.code !== "23505") throw new Error(`forum extra save failed: ${error.message}`);
    } else {
      const { data, error } = await sb
        .from("world_docs")
        .update({ doc: next, version: version + 1, updated_at: stamp })
        .eq("id", rowId)
        .eq("version", version)
        .select("version");
      if (error) throw new Error(`forum extra save failed: ${error.message}`);
      if (data && data.length > 0) return next;
    }
    // version moved — loop reloads and reapplies
  }
  throw new Error("forum extra save kept conflicting");
}

// ── The API ─────────────────────────────────────────────────────────────────

export async function getThreadExtra(threadId: string): Promise<ThreadExtra> {
  if (!SAFE_ID.test(threadId)) return structuredClone(EMPTY);
  if (getSupabaseClient()) {
    const { doc } = await loadDoc<ThreadExtra>(threadRow(threadId));
    return doc ?? structuredClone(EMPTY);
  }
  return readFile().threads[threadId] ?? structuredClone(EMPTY);
}

/** Tags for many threads at once — the channel page's one extra query. */
export async function getThreadTags(threadIds: string[]): Promise<Record<string, string>> {
  const ids = threadIds.filter((id) => SAFE_ID.test(id));
  if (ids.length === 0) return {};
  const out: Record<string, string> = {};
  const sb = getSupabaseClient();
  if (sb) {
    const { data } = await sb
      .from("world_docs")
      .select("id, doc")
      .in("id", ids.map(threadRow));
    for (const r of data ?? []) {
      const tag = (r.doc as ThreadExtra | null)?.tag;
      if (tag) out[String(r.id).slice("forum:t:".length)] = tag;
    }
    return out;
  }
  const f = readFile();
  for (const id of ids) {
    const tag = f.threads[id]?.tag;
    if (tag) out[id] = tag;
  }
  return out;
}

export async function mutateThreadExtra(
  threadId: string,
  fn: (extra: ThreadExtra) => ThreadExtra,
): Promise<ThreadExtra> {
  if (!SAFE_ID.test(threadId)) return structuredClone(EMPTY);
  if (getSupabaseClient()) {
    return mutateDoc<ThreadExtra>(threadRow(threadId), structuredClone(EMPTY), fn);
  }
  const f = readFile();
  const next = fn(structuredClone(f.threads[threadId] ?? EMPTY));
  f.threads[threadId] = next;
  writeFile(f);
  return next;
}

/** Toggle one account's reaction on one post. Returns the new extra. */
export async function toggleReaction(
  threadId: string,
  postId: string,
  emoji: string,
  accountId: string,
): Promise<void> {
  await mutateThreadExtra(threadId, (extra) => {
    const post = (extra.posts[postId] ??= {});
    const set = ((post.reactions ??= {})[emoji] ??= []);
    const at = set.indexOf(accountId);
    if (at >= 0) set.splice(at, 1);
    else set.push(accountId);
    if (set.length === 0) delete post.reactions![emoji];
    return extra;
  });
}

// ── Read state — what makes "unread" mean something ─────────────────────────

/** How many threads one reader's progress remembers. Enough for anyone's
 *  active life on a lean forum; the oldest entries fall off, and a fallen-off
 *  thread merely reads as unread again, which is the safe direction. */
const READ_CAP = 500;

export async function getReadMap(accountId: string): Promise<Record<string, string>> {
  if (!SAFE_ID.test(accountId)) return {};
  if (getSupabaseClient()) {
    const { doc } = await loadDoc<Record<string, string>>(readRow(accountId));
    return doc ?? {};
  }
  return readFile().reads[accountId] ?? {};
}

export async function markRead(accountId: string, threadId: string, at: string): Promise<void> {
  if (!SAFE_ID.test(accountId) || !SAFE_ID.test(threadId)) return;
  const apply = (map: Record<string, string>) => {
    // Only ever move FORWARD — a stale render must not un-read a thread.
    if (!map[threadId] || map[threadId] < at) map[threadId] = at;
    const keys = Object.keys(map);
    if (keys.length > READ_CAP) {
      keys.sort((a, b) => map[a].localeCompare(map[b]));
      for (const k of keys.slice(0, keys.length - READ_CAP)) delete map[k];
    }
    return map;
  };
  if (getSupabaseClient()) {
    await mutateDoc<Record<string, string>>(readRow(accountId), {}, apply);
    return;
  }
  const f = readFile();
  f.reads[accountId] = apply(f.reads[accountId] ?? {});
  writeFile(f);
}
