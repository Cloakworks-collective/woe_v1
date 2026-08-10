// Forum persistence. Supabase when the keys exist, a JSON file otherwise —
// the same two-mode shape the world store uses, so `npm run dev` works with no
// cloud project at all.
//
// The forum is deliberately NOT in the world blob: `eraReset` replaces the
// whole world, and this is the one surface that has to survive that.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getSupabaseClient } from "./store";

export interface ForumUser {
  id: string;
  handle: string;
  handleLower: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: string;
  lastSeenAt?: string;
  empireName?: string;
}

export interface ForumBan {
  id: string;
  userId: string;
  reason?: string;
  /** null/undefined = permanent. */
  untilAt?: string | null;
  createdAt: string;
  liftedAt?: string | null;
}

export interface ForumThread {
  id: string;
  channel: string;
  title: string;
  authorId?: string | null;
  createdAt: string;
  lastPostAt: string;
  postCount: number;
  pinned: boolean;
  locked: boolean;
}

export interface ForumPost {
  id: string;
  threadId: string;
  authorId?: string | null;
  body: string;
  createdAt: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

interface ForumFile {
  users: ForumUser[];
  bans: ForumBan[];
  threads: ForumThread[];
  posts: ForumPost[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "forum.json");
const EMPTY: ForumFile = { users: [], bans: [], threads: [], posts: [] };

const g = globalThis as unknown as { __woeForum?: ForumFile };

function readFile(): ForumFile {
  if (g.__woeForum) return g.__woeForum;
  try {
    g.__woeForum = JSON.parse(fs.readFileSync(FILE, "utf8")) as ForumFile;
  } catch {
    g.__woeForum = { ...EMPTY, users: [], bans: [], threads: [], posts: [] };
  }
  return g.__woeForum!;
}

function writeFile(f: ForumFile): void {
  g.__woeForum = f;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(f, null, 2));
  fs.renameSync(tmp, FILE);
}

const usingSupabase = () => getSupabaseClient() !== null;

/**
 * The forum tables live in their own migration (0004_forum.sql), which a
 * deployment can easily not have run yet. That must not be a 500 on a public
 * page: it is a setup step, so it gets a setup message.
 */
export class ForumSchemaMissing extends Error {
  constructor() {
    super("The forum tables have not been created yet.");
    this.name = "ForumSchemaMissing";
  }
}

export function isSchemaMissing(e: unknown): boolean {
  return e instanceof ForumSchemaMissing;
}

/** Turn PostgREST's "relation does not exist" into something we can render. */
function fail(message: string): never {
  if (/could not find the table|does not exist|schema cache/i.test(message)) {
    throw new ForumSchemaMissing();
  }
  throw new Error(`forum: ${message}`);
}

// ── Row mapping ─────────────────────────────────────────────────────────────
// Postgres is snake_case and the app is camelCase; keep the translation in one
// place so no caller ever has to think about it.

type Row = Record<string, unknown>;
const userFromRow = (r: Row): ForumUser => ({
  id: String(r.id),
  handle: String(r.handle),
  handleLower: String(r.handle_lower),
  passwordHash: String(r.password_hash),
  isAdmin: Boolean(r.is_admin),
  createdAt: String(r.created_at),
  lastSeenAt: (r.last_seen_at as string) ?? undefined,
  empireName: (r.empire_name as string) ?? undefined,
});
const banFromRow = (r: Row): ForumBan => ({
  id: String(r.id),
  userId: String(r.user_id),
  reason: (r.reason as string) ?? undefined,
  untilAt: (r.until_at as string) ?? null,
  createdAt: String(r.created_at),
  liftedAt: (r.lifted_at as string) ?? null,
});
const threadFromRow = (r: Row): ForumThread => ({
  id: String(r.id),
  channel: String(r.channel),
  title: String(r.title),
  authorId: (r.author_id as string) ?? null,
  createdAt: String(r.created_at),
  lastPostAt: String(r.last_post_at),
  postCount: Number(r.post_count ?? 0),
  pinned: Boolean(r.pinned),
  locked: Boolean(r.locked),
});
const postFromRow = (r: Row): ForumPost => ({
  id: String(r.id),
  threadId: String(r.thread_id),
  authorId: (r.author_id as string) ?? null,
  body: String(r.body),
  createdAt: String(r.created_at),
  deletedAt: (r.deleted_at as string) ?? null,
  deletedBy: (r.deleted_by as string) ?? null,
});

// ── Users ───────────────────────────────────────────────────────────────────

export async function findUserByHandle(handle: string): Promise<ForumUser | null> {
  const lower = handle.trim().toLowerCase();
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.from("forum_users").select("*").eq("handle_lower", lower).maybeSingle();
    if (error) fail(error.message);
    return data ? userFromRow(data) : null;
  }
  return readFile().users.find((u) => u.handleLower === lower) ?? null;
}

export async function findUser(id: string): Promise<ForumUser | null> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.from("forum_users").select("*").eq("id", id).maybeSingle();
    if (error) fail(error.message);
    return data ? userFromRow(data) : null;
  }
  return readFile().users.find((u) => u.id === id) ?? null;
}

export async function listUsers(): Promise<ForumUser[]> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.from("forum_users").select("*").order("created_at", { ascending: false });
    if (error) fail(error.message);
    return (data ?? []).map(userFromRow);
  }
  return [...readFile().users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createUser(u: {
  handle: string;
  passwordHash: string;
  isAdmin?: boolean;
  empireName?: string;
}): Promise<ForumUser> {
  const user: ForumUser = {
    id: randomUUID(),
    handle: u.handle.trim(),
    handleLower: u.handle.trim().toLowerCase(),
    passwordHash: u.passwordHash,
    isAdmin: u.isAdmin ?? false,
    createdAt: new Date().toISOString(),
    empireName: u.empireName,
  };
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("forum_users")
      .insert({
        handle: user.handle,
        handle_lower: user.handleLower,
        password_hash: user.passwordHash,
        is_admin: user.isAdmin,
        empire_name: user.empireName ?? null,
      })
      .select("*")
      .single();
    if (error) fail(error.message);
    return userFromRow(data);
  }
  const f = readFile();
  f.users.push(user);
  writeFile(f);
  return user;
}

export async function setUserAdmin(id: string, isAdmin: boolean): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from("forum_users").update({ is_admin: isAdmin }).eq("id", id);
    if (error) fail(error.message);
    return;
  }
  const f = readFile();
  const u = f.users.find((x) => x.id === id);
  if (u) u.isAdmin = isAdmin;
  writeFile(f);
}

export async function touchUser(id: string): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseClient();
  if (sb) {
    await sb.from("forum_users").update({ last_seen_at: now }).eq("id", id);
    return;
  }
  const f = readFile();
  const u = f.users.find((x) => x.id === id);
  if (u) u.lastSeenAt = now;
  writeFile(f);
}

// ── Bans ────────────────────────────────────────────────────────────────────

/** The live ban on a user, if any. Expired and lifted bans are not live. */
export async function activeBan(userId: string): Promise<ForumBan | null> {
  const now = new Date().toISOString();
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("forum_bans")
      .select("*")
      .eq("user_id", userId)
      .is("lifted_at", null)
      .order("created_at", { ascending: false });
    if (error) fail(error.message);
    const live = (data ?? []).map(banFromRow).find((b) => !b.untilAt || b.untilAt > now);
    return live ?? null;
  }
  return (
    readFile()
      .bans.filter((b) => b.userId === userId && !b.liftedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((b) => !b.untilAt || b.untilAt > now) ?? null
  );
}

export async function listBans(): Promise<ForumBan[]> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.from("forum_bans").select("*").order("created_at", { ascending: false });
    if (error) fail(error.message);
    return (data ?? []).map(banFromRow);
  }
  return [...readFile().bans].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function banUser(userId: string, days: number, reason?: string): Promise<void> {
  // days <= 0 is permanent — the UI offers 30/60/90 and "Permanent".
  const untilAt = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("forum_bans")
      .insert({ user_id: userId, until_at: untilAt, reason: reason ?? null });
    if (error) fail(error.message);
    return;
  }
  const f = readFile();
  f.bans.push({
    id: randomUUID(),
    userId,
    untilAt,
    reason,
    createdAt: new Date().toISOString(),
    liftedAt: null,
  });
  writeFile(f);
}

/** Pardon: lift every live ban on this account. */
export async function liftBans(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("forum_bans")
      .update({ lifted_at: now })
      .eq("user_id", userId)
      .is("lifted_at", null);
    if (error) fail(error.message);
    return;
  }
  const f = readFile();
  for (const b of f.bans) if (b.userId === userId && !b.liftedAt) b.liftedAt = now;
  writeFile(f);
}

// ── Threads ─────────────────────────────────────────────────────────────────

export async function listThreads(channel: string): Promise<ForumThread[]> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("forum_threads")
      .select("*")
      .eq("channel", channel)
      .order("pinned", { ascending: false })
      .order("last_post_at", { ascending: false });
    if (error) fail(error.message);
    return (data ?? []).map(threadFromRow);
  }
  return readFile()
    .threads.filter((t) => t.channel === channel)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastPostAt.localeCompare(a.lastPostAt));
}

export async function getThread(id: string): Promise<ForumThread | null> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.from("forum_threads").select("*").eq("id", id).maybeSingle();
    if (error) fail(error.message);
    return data ? threadFromRow(data) : null;
  }
  return readFile().threads.find((t) => t.id === id) ?? null;
}

export async function createThread(t: {
  channel: string;
  title: string;
  authorId: string;
}): Promise<ForumThread> {
  const now = new Date().toISOString();
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("forum_threads")
      .insert({ channel: t.channel, title: t.title, author_id: t.authorId })
      .select("*")
      .single();
    if (error) fail(error.message);
    return threadFromRow(data);
  }
  const f = readFile();
  const thread: ForumThread = {
    id: randomUUID(),
    channel: t.channel,
    title: t.title,
    authorId: t.authorId,
    createdAt: now,
    lastPostAt: now,
    postCount: 0,
    pinned: false,
    locked: false,
  };
  f.threads.push(thread);
  writeFile(f);
  return thread;
}

export async function setThreadFlags(
  id: string,
  flags: { pinned?: boolean; locked?: boolean },
): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    const patch: Row = {};
    if (flags.pinned !== undefined) patch.pinned = flags.pinned;
    if (flags.locked !== undefined) patch.locked = flags.locked;
    const { error } = await sb.from("forum_threads").update(patch).eq("id", id);
    if (error) fail(error.message);
    return;
  }
  const f = readFile();
  const t = f.threads.find((x) => x.id === id);
  if (t) Object.assign(t, flags);
  writeFile(f);
}

export async function deleteThread(id: string): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from("forum_threads").delete().eq("id", id);
    if (error) fail(error.message);
    return;
  }
  const f = readFile();
  f.threads = f.threads.filter((t) => t.id !== id);
  f.posts = f.posts.filter((p) => p.threadId !== id);
  writeFile(f);
}

// ── Posts ───────────────────────────────────────────────────────────────────

export async function listPosts(threadId: string): Promise<ForumPost[]> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("forum_posts")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (error) fail(error.message);
    return (data ?? []).map(postFromRow);
  }
  return readFile()
    .posts.filter((p) => p.threadId === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createPost(p: {
  threadId: string;
  authorId: string;
  body: string;
}): Promise<ForumPost> {
  const now = new Date().toISOString();
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("forum_posts")
      .insert({ thread_id: p.threadId, author_id: p.authorId, body: p.body })
      .select("*")
      .single();
    if (error) fail(error.message);
    // Keep the denormalised thread counters honest.
    const posts = await listPosts(p.threadId);
    await getSupabaseClient()!
      .from("forum_threads")
      .update({ last_post_at: now, post_count: posts.filter((x) => !x.deletedAt).length })
      .eq("id", p.threadId);
    return postFromRow(data);
  }
  const f = readFile();
  const post: ForumPost = {
    id: randomUUID(),
    threadId: p.threadId,
    authorId: p.authorId,
    body: p.body,
    createdAt: now,
    deletedAt: null,
  };
  f.posts.push(post);
  const t = f.threads.find((x) => x.id === p.threadId);
  if (t) {
    t.lastPostAt = now;
    t.postCount = f.posts.filter((x) => x.threadId === t.id && !x.deletedAt).length;
  }
  writeFile(f);
  return post;
}

/** Soft delete — replies that quoted it stay readable. */
export async function deletePost(id: string, byUserId: string): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("forum_posts")
      .update({ deleted_at: now, deleted_by: byUserId })
      .eq("id", id);
    if (error) fail(error.message);
    return;
  }
  const f = readFile();
  const p = f.posts.find((x) => x.id === id);
  if (p) {
    p.deletedAt = now;
    p.deletedBy = byUserId;
  }
  writeFile(f);
}

/** Every post by one author — for the admin's "what did they actually say" view. */
export async function postsByAuthor(userId: string, limit = 50): Promise<ForumPost[]> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("forum_posts")
      .select("*")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) fail(error.message);
    return (data ?? []).map(postFromRow);
  }
  return readFile()
    .posts.filter((p) => p.authorId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function forumStoreMode(): Promise<"supabase" | "file"> {
  return usingSupabase() ? "supabase" : "file";
}
