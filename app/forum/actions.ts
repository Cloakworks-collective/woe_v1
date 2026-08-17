"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FORUM_LIMITS, forumChannel } from "@/lib/constants/forum";
import { banNotice, getForumViewer, handleProblem } from "@/lib/server/forumAuth";
import { isEmptyPost, looksLikeHtml, sanitizePostHtml } from "@/lib/server/postHtml";
import { clearSession } from "@/lib/server/auth";
import {
  claimHandle,
  createPost,
  createThread,
  deletePost,
  deleteThread,
  findAccountByHandle,
  getPost,
  getThread,
  isSchemaMissing,
  setThreadFlags,
  updatePostBody,
} from "@/lib/server/accounts";
import { mutateThreadExtra, toggleReaction } from "@/lib/server/forumExtra";
import { CHANNEL_TAGS, FORUM_REACTIONS } from "@/lib/constants/forum";

// Every action returns by redirecting with ?err= / ?ok= — the same convention
// the game's server actions use, so a failure is always visible on the page it
// came from rather than swallowed.

const back = (to: string, msg: string, ok = false): never =>
  redirect(`${to}${to.includes("?") ? "&" : "?"}${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/**
 * The only place a post body enters the database.
 *
 * The editor is client-side, so this is not "cleaning up after Quill" — it is
 * the boundary itself. Anyone can POST to this action directly and never load
 * the editor at all.
 *
 * Markdown bodies (JavaScript off, or written before the editor existed) pass
 * through untouched: they are rendered by react-markdown, which builds a React
 * tree and never interprets raw HTML, so they are already safe by construction.
 */
const cleanBody = (raw: string): string => {
  if (!looksLikeHtml(raw)) return raw;
  const clean = sanitizePostHtml(raw);
  return isEmptyPost(clean) ? "" : clean;
};

const SETUP =
  "The accounts tables have not been created yet — run the migrations in supabase/migrations.";

/**
 * Run an action's body, turning a missing schema into a message on the page.
 *
 * Every forum PAGE already renders <SetupNotice /> when the tables are absent,
 * but the ACTIONS threw straight through to a runtime error overlay — so on a
 * deployment where the migrations have not been applied, reading the forum
 * explained the problem politely and pressing a button showed a stack trace.
 *
 * `redirect()` works by throwing, so the rethrow below is not optional: swallow
 * it and every successful action would silently do nothing.
 */
async function guard<T>(to: string, body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (e) {
    if (isSchemaMissing(e)) back(to, SETUP);
    throw e;
  }
}

/**
 * Claim the forum name — the one thing the boards ask of you, asked at the last
 * possible moment.
 *
 * You already have an account by the time you get here (it was minted when you
 * founded an empire, or by the magic link). All this adds is the name your
 * posts will carry, which is deliberately NOT your empire's name: empires last
 * one age and change race and title with each, and a poster who is renamed
 * every reset has no reputation to build.
 */
export async function claimForumName(form: FormData): Promise<void> {
  const handle = str(form, "handle");
  const to = str(form, "to") || "/forum";

  const viewer = await getForumViewer();
  if (!viewer.account) back(to, "Sign in first — one key opens the game and the boards.");
  if (viewer.account!.handle) back(to, `You already post as ${viewer.account!.handle}.`);

  const hp = handleProblem(handle);
  if (hp) back(to, hp);

  await guard(to, async () => {
    if (await findAccountByHandle(handle)) back(to, "That name is taken.");
    // claimHandle returns false when someone else took it between the check
    // above and this write — the unique index is what actually decides.
    if (!(await claimHandle(viewer.account!.id, handle))) back(to, "That name is taken.");
  });

  revalidatePath("/forum");
  back(to, `You post as ${handle.trim()} from now on.`, true);
}

/** Signing out of the forum signs you out of everything — one account, one
 *  session. The boards stay readable, so this is not a locked door. */
export async function forumLogout(): Promise<void> {
  await clearSession();
  revalidatePath("/forum");
  redirect("/forum");
}

export async function forumNewThread(form: FormData): Promise<void> {
  const channelId = str(form, "channel");
  const channel = forumChannel(channelId);
  if (!channel) back("/forum", "No such channel.");

  const viewer = await getForumViewer();
  if (!viewer.account) back(`/forum/c/${channelId}`, "Sign in to post.");
  if (viewer.ban) back(`/forum/c/${channelId}`, banNotice(viewer.ban));
  if (viewer.needsHandle) back(`/forum/c/${channelId}`, "Choose the name you will post under first.");
  // Honour the CHANNEL's own rule. This used to refuse everyone who was not an
  // admin, everywhere — which, once accounts stopped auto-crowning the first
  // registrant, meant nobody could open a discussion anywhere at all. The
  // per-channel `adminOnlyThreads` flag existed the whole time and was never
  // read; announcements are the only board it should ever apply to.
  if (channel!.adminOnlyThreads && !viewer.isAdmin) {
    back(`/forum/c/${channelId}`, "Only the crown opens discussions in this channel — reply to an existing one.");
  }

  const title = str(form, "title").slice(0, FORUM_LIMITS.TITLE_MAX);
  const body = cleanBody(str(form, "body").slice(0, FORUM_LIMITS.BODY_MAX));
  if (title.length < 3) back(`/forum/c/${channelId}`, "Give the discussion a title.");
  if (!body) back(`/forum/c/${channelId}`, "Write an opening post.");

  const thread = await createThread({ channel: channelId, title, authorId: viewer.account!.id });
  await createPost({ threadId: thread.id, authorId: viewer.account!.id, body });
  // The tag is one of the CHANNEL's fixed few or nothing at all — free-form
  // tags are how lean forums stop being lean.
  const tag = str(form, "tag");
  if (tag && (CHANNEL_TAGS[channelId] ?? []).includes(tag)) {
    await mutateThreadExtra(thread.id, (x) => ({ ...x, tag }));
  }
  revalidatePath(`/forum/c/${channelId}`);
  redirect(`/forum/t/${thread.id}`);
}

export async function forumReply(form: FormData): Promise<void> {
  const threadId = str(form, "threadId");
  const to = `/forum/t/${threadId}`;
  const viewer = await getForumViewer();
  if (!viewer.account) back(to, "Sign in to reply.");
  if (viewer.ban) back(to, banNotice(viewer.ban));
  if (viewer.needsHandle) back(to, "Choose the name you will post under first.");

  const thread = await getThread(threadId);
  if (!thread) back("/forum", "That discussion is gone.");
  if (thread!.locked && !viewer.isAdmin) back(to, "This discussion is locked.");

  const body = cleanBody(str(form, "body").slice(0, FORUM_LIMITS.BODY_MAX));
  if (!body) back(to, "Write something first.");

  const post = await createPost({ threadId, authorId: viewer.account!.id, body });
  // "In reply to #4" — a LINK, not a nesting level. Flat with quotes is the
  // whole reading order of a lean forum.
  const replyToId = str(form, "replyTo");
  const replyToN = Number(str(form, "replyToN"));
  const replyToHandle = str(form, "replyToHandle").slice(0, 40);
  if (replyToId && Number.isFinite(replyToN) && replyToN > 0) {
    await mutateThreadExtra(threadId, (x) => {
      (x.posts[post.id] ??= {}).replyTo = { postId: replyToId, n: replyToN, handle: replyToHandle };
      return x;
    });
  }
  revalidatePath(to);
  redirect(to);
}

/** One tap on one emoji — toggled, one of each per reader per post. */
export async function forumReact(form: FormData): Promise<void> {
  const threadId = str(form, "threadId");
  const postId = str(form, "postId");
  const emoji = str(form, "emoji");
  const to = `/forum/t/${threadId}#p${str(form, "n")}`;
  const viewer = await getForumViewer();
  if (!viewer.account) back(to, "Sign in to react.");
  if (viewer.ban) back(to, banNotice(viewer.ban));
  if (!(FORUM_REACTIONS as readonly string[]).includes(emoji)) back(to, "Not one of ours.");
  await guard(to, () => toggleReaction(threadId, postId, emoji, viewer.account!.id));
  revalidatePath(`/forum/t/${threadId}`);
  redirect(to);
}

/**
 * The author's own edit — with the stamp that keeps it honest. Anyone may
 * rewrite their words; nobody may pretend they never said the old ones, so
 * every edit marks the post "edited" where all can see.
 */
export async function forumEditPost(form: FormData): Promise<void> {
  const threadId = str(form, "threadId");
  const postId = str(form, "postId");
  const to = `/forum/t/${threadId}`;
  const viewer = await getForumViewer();
  if (!viewer.account) back(to, "Sign in first.");
  if (viewer.ban) back(to, banNotice(viewer.ban));

  const post = await getPost(postId);
  if (!post || post.threadId !== threadId) back(to, "That post is gone.");
  if (post!.authorId !== viewer.account!.id && !viewer.isAdmin) back(to, "Not yours to edit.");
  if (post!.deletedAt) back(to, "A removed post stays removed.");

  const body = cleanBody(str(form, "body").slice(0, FORUM_LIMITS.BODY_MAX));
  if (!body) back(to, "Write something first.");

  await updatePostBody(postId, body);
  await mutateThreadExtra(threadId, (x) => {
    (x.posts[postId] ??= {}).editedAt = new Date().toISOString();
    return x;
  });
  revalidatePath(to);
  redirect(to);
}

/** The author's own removal — same soft delete the moderators use, so a
 *  quoted reply keeps making sense. */
export async function forumDeleteOwn(form: FormData): Promise<void> {
  const threadId = str(form, "threadId");
  const postId = str(form, "postId");
  const to = `/forum/t/${threadId}`;
  const viewer = await getForumViewer();
  if (!viewer.account) back(to, "Sign in first.");

  const post = await getPost(postId);
  if (!post || post.threadId !== threadId) back(to, "That post is gone.");
  if (post!.authorId !== viewer.account!.id) back(to, "Not yours to remove.");

  await deletePost(postId, viewer.account!.id);
  revalidatePath(to);
  redirect(to);
}


// ── Moderation (admins only) ────────────────────────────────────────────────

export async function forumModerate(form: FormData): Promise<void> {
  const viewer = await getForumViewer();
  if (!viewer.isAdmin) back("/forum", "Not yours to do.");

  const what = str(form, "what");
  const threadId = str(form, "threadId");

  if (what === "pin" || what === "unpin") {
    await setThreadFlags(threadId, { pinned: what === "pin" });
  } else if (what === "lock" || what === "unlock") {
    await setThreadFlags(threadId, { locked: what === "lock" });
  } else if (what === "deleteThread") {
    const t = await getThread(threadId);
    await deleteThread(threadId);
    revalidatePath(`/forum/c/${t?.channel ?? ""}`);
    redirect(`/forum/c/${t?.channel ?? ""}`);
  } else if (what === "deletePost") {
    await deletePost(str(form, "postId"), viewer.account!.id);
  }
  revalidatePath(`/forum/t/${threadId}`);
  redirect(`/forum/t/${threadId}`);
}
