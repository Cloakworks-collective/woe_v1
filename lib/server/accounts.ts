// Everything that OUTLIVES an age: accounts, bans, and the forum's threads and
// posts. Supabase when the keys exist, a JSON file otherwise — the same two-mode
// shape the world store uses, so `npm run dev` works with no cloud project.
//
// Deliberately NOT the world blob. `eraReset` replaces the whole world, so the
// world can hold an EMPIRE but never an identity: an empire is a thing you have
// for one age, and the account is the person who keeps having them. The forum
// needed a store like this for itself; making it the account store for the
// whole system means there is one identity to explain instead of two.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getSupabaseClient } from "./store";

export interface Account {
  id: string;
  /** The magic link's secret — whoever holds it IS this account. One credential
   *  for the game, the forum and the CLI. Never rendered except to its owner. */
  token: string;
  /**
   * The forum name, claimed the first time this account tries to POST.
   *
   * Undefined until then, and that is the normal state for most accounts: you
   * can read every board without one, and an account that has only ever played
   * the game has no reason to hold a handle at all. It is claimed once and kept
   * forever — unlike the empire name, which is per-age.
   */
  handle?: string;
  handleLower?: string;
  isAdmin: boolean;
  createdAt: string;
  lastSeenAt?: string;
}

export interface ForumBan {
  id: string;
  accountId: string;
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
  accounts: Account[];
  bans: ForumBan[];
  threads: ForumThread[];
  posts: ForumPost[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "forum.json");
const EMPTY: ForumFile = { accounts: [], bans: [], threads: [], posts: [] };

const g = globalThis as unknown as { __woeForum?: ForumFile };

function readFile(): ForumFile {
  if (g.__woeForum) return g.__woeForum;
  try {
    g.__woeForum = JSON.parse(fs.readFileSync(FILE, "utf8")) as ForumFile;
  } catch {
    g.__woeForum = { ...EMPTY, accounts: [], bans: [], threads: [], posts: [] };
  }
  // A file written before accounts existed has no `accounts` key at all.
  g.__woeForum!.accounts ??= [];
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
const accountFromRow = (r: Row): Account => ({
  id: String(r.id),
  token: String(r.token),
  handle: (r.handle as string) ?? undefined,
  handleLower: (r.handle_lower as string) ?? undefined,
  isAdmin: Boolean(r.is_admin),
  createdAt: String(r.created_at),
  lastSeenAt: (r.last_seen_at as string) ?? undefined,
});
const banFromRow = (r: Row): ForumBan => ({
  id: String(r.id),
  accountId: String(r.account_id),
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

// ── Accounts ────────────────────────────────────────────────────────────────

export async function findAccountByHandle(handle: string): Promise<Account | null> {
  const lower = handle.trim().toLowerCase();
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.from("accounts").select("*").eq("handle_lower", lower).maybeSingle();
    if (error) fail(error.message);
    return data ? accountFromRow(data) : null;
  }
  return readFile().accounts.find((a) => a.handleLower === lower) ?? null;
}

/**
 * Resolve a magic-link token to its account.
 *
 * Compared by equality rather than in constant time: a token is 160 bits of
 * randomness with no structure to probe, so there is no oracle a timing
 * difference could feed. The prefix check runs first, so a blank box or a
 * pasted password never reaches the table at all.
 */
export async function findAccountByToken(token: string): Promise<Account | null> {
  const t = token.trim();
  if (!t.startsWith("woe_")) return null;
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.from("accounts").select("*").eq("token", t).maybeSingle();
    if (error) fail(error.message);
    return data ? accountFromRow(data) : null;
  }
  return readFile().accounts.find((a) => a.token === t) ?? null;
}

export async function findAccount(id: string): Promise<Account | null> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.from("accounts").select("*").eq("id", id).maybeSingle();
    if (error) fail(error.message);
    return data ? accountFromRow(data) : null;
  }
  return readFile().accounts.find((a) => a.id === id) ?? null;
}

export async function listAccounts(): Promise<Account[]> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.from("accounts").select("*").order("created_at", { ascending: false });
    if (error) fail(error.message);
    return (data ?? []).map(accountFromRow);
  }
  return [...readFile().accounts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * A brand-new person. No handle yet — that is claimed at the forum, later.
 *
 * Deliberately never auto-admin. The forum's old signup crowned whoever
 * registered FIRST, which on a fresh deployment now means whoever founds the
 * first empire — an arbitrary stranger holding the moderation tools. The crown
 * is granted from the Crown Chamber instead (/admin/forum), which is already
 * behind the operator's password.
 */
export async function createAccount(a: { token: string; isAdmin?: boolean }): Promise<Account> {
  const account: Account = {
    id: randomUUID(),
    token: a.token,
    isAdmin: a.isAdmin ?? false,
    createdAt: new Date().toISOString(),
  };
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("accounts")
      .insert({ token: account.token, is_admin: account.isAdmin })
      .select("*")
      .single();
    if (error) fail(error.message);
    return accountFromRow(data);
  }
  const f = readFile();
  f.accounts.push(account);
  writeFile(f);
  return account;
}

/**
 * Claim the forum name, once.
 *
 * Returns false if the handle was taken between the caller's check and this
 * write — two people can be typing the same name at the same moment, and in
 * Supabase the unique index is what actually decides it. The caller turns false
 * into "that name is taken", so the race has a correct outcome rather than a
 * 500.
 */
export async function claimHandle(id: string, handle: string): Promise<boolean> {
  const trimmed = handle.trim();
  const lower = trimmed.toLowerCase();
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("accounts")
      .update({ handle: trimmed, handle_lower: lower })
      .eq("id", id)
      // Claiming is once and forever: this refuses to rename an account that
      // already holds a handle, so a bad caller cannot quietly change it.
      .is("handle_lower", null);
    if (error) {
      if (/duplicate key|unique/i.test(error.message)) return false;
      fail(error.message);
    }
    const after = await findAccount(id);
    return after?.handleLower === lower;
  }
  const f = readFile();
  if (f.accounts.some((a) => a.handleLower === lower && a.id !== id)) return false;
  const acc = f.accounts.find((a) => a.id === id);
  if (!acc || acc.handleLower) return false;
  acc.handle = trimmed;
  acc.handleLower = lower;
  writeFile(f);
  return true;
}

export async function setAccountAdmin(id: string, isAdmin: boolean): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from("accounts").update({ is_admin: isAdmin }).eq("id", id);
    if (error) fail(error.message);
    return;
  }
  const f = readFile();
  const a = f.accounts.find((x) => x.id === id);
  if (a) a.isAdmin = isAdmin;
  writeFile(f);
}

export async function touchAccount(id: string): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseClient();
  if (sb) {
    await sb.from("accounts").update({ last_seen_at: now }).eq("id", id);
    return;
  }
  const f = readFile();
  const a = f.accounts.find((x) => x.id === id);
  if (a) a.lastSeenAt = now;
  writeFile(f);
}

// ── Bans ────────────────────────────────────────────────────────────────────

/** The live ban on a user, if any. Expired and lifted bans are not live. */
export async function activeBan(accountId: string): Promise<ForumBan | null> {
  const now = new Date().toISOString();
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("forum_bans")
      .select("*")
      .eq("account_id", accountId)
      .is("lifted_at", null)
      .order("created_at", { ascending: false });
    if (error) fail(error.message);
    const live = (data ?? []).map(banFromRow).find((b) => !b.untilAt || b.untilAt > now);
    return live ?? null;
  }
  return (
    readFile()
      .bans.filter((b) => b.accountId === accountId && !b.liftedAt)
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

export async function banAccount(accountId: string, days: number, reason?: string): Promise<void> {
  // days <= 0 is permanent — the UI offers 30/60/90 and "Permanent".
  const untilAt = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("forum_bans")
      .insert({ account_id: accountId, until_at: untilAt, reason: reason ?? null });
    if (error) fail(error.message);
    return;
  }
  const f = readFile();
  f.bans.push({
    id: randomUUID(),
    accountId,
    untilAt,
    reason,
    createdAt: new Date().toISOString(),
    liftedAt: null,
  });
  writeFile(f);
}

/** Pardon: lift every live ban on this account. */
export async function liftBans(accountId: string): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("forum_bans")
      .update({ lifted_at: now })
      .eq("account_id", accountId)
      .is("lifted_at", null);
    if (error) fail(error.message);
    return;
  }
  const f = readFile();
  for (const b of f.bans) if (b.accountId === accountId && !b.liftedAt) b.liftedAt = now;
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

export async function getPost(id: string): Promise<ForumPost | null> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.from("forum_posts").select("*").eq("id", id).maybeSingle();
    if (error) fail(error.message);
    return data ? postFromRow(data) : null;
  }
  return readFile().posts.find((p) => p.id === id) ?? null;
}

/** Rewrite a post's body — the author's edit. The body column has always
 *  existed; only the "edited" stamp needs the side store (forumExtra). */
export async function updatePostBody(id: string, body: string): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.from("forum_posts").update({ body }).eq("id", id);
    if (error) fail(error.message);
    return;
  }
  const f = readFile();
  const p = f.posts.find((x) => x.id === id);
  if (p) {
    p.body = body;
    writeFile(f);
  }
}

/** Soft delete — replies that quoted it stay readable. */
export async function deletePost(id: string, byAccountId: string): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("forum_posts")
      .update({ deleted_at: now, deleted_by: byAccountId })
      .eq("id", id);
    if (error) fail(error.message);
    return;
  }
  const f = readFile();
  const p = f.posts.find((x) => x.id === id);
  if (p) {
    p.deletedAt = now;
    p.deletedBy = byAccountId;
  }
  writeFile(f);
}

/** Every post by one author — for the admin's "what did they actually say" view. */
export async function postsByAuthor(accountId: string, limit = 50): Promise<ForumPost[]> {
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("forum_posts")
      .select("*")
      .eq("author_id", accountId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) fail(error.message);
    return (data ?? []).map(postFromRow);
  }
  return readFile()
    .posts.filter((p) => p.authorId === accountId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function accountStoreMode(): Promise<"supabase" | "file"> {
  return usingSupabase() ? "supabase" : "file";
}
