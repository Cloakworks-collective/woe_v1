"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FORUM_LIMITS, forumChannel } from "@/lib/constants/forum";
import {
  banNotice,
  clearForumSession,
  getForumViewer,
  handleProblem,
  hashPassword,
  passwordProblem,
  setForumSession,
  verifyPassword,
} from "@/lib/server/forumAuth";
import {
  createPost,
  createThread,
  createUser,
  deletePost,
  deleteThread,
  findUserByHandle,
  getThread,
  listUsers,
  setThreadFlags,
} from "@/lib/server/forumStore";

// Every action returns by redirecting with ?err= / ?ok= — the same convention
// the game's server actions use, so a failure is always visible on the page it
// came from rather than swallowed.

const back = (to: string, msg: string, ok = false): never =>
  redirect(`${to}${to.includes("?") ? "&" : "?"}${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function forumRegister(form: FormData): Promise<void> {
  const handle = str(form, "handle");
  const password = String(form.get("password") ?? "");
  const empireName = str(form, "empireName");

  const hp = handleProblem(handle);
  if (hp) back("/forum/register", hp);
  const pp = passwordProblem(password);
  if (pp) back("/forum/register", pp);

  if (await findUserByHandle(handle)) back("/forum/register", "That handle is taken.");

  // The first account to exist becomes an admin — otherwise a fresh deployment
  // has a forum nobody can moderate or post announcements to.
  const first = (await listUsers()).length === 0;
  const user = await createUser({
    handle,
    passwordHash: await hashPassword(password),
    isAdmin: first,
    empireName: empireName || undefined,
  });
  await setForumSession(user.id);
  revalidatePath("/forum");
  redirect("/forum");
}

export async function forumLogin(form: FormData): Promise<void> {
  const handle = str(form, "handle");
  const password = String(form.get("password") ?? "");
  const user = await findUserByHandle(handle);
  // One message for both cases, so this cannot be used to enumerate handles.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    back("/forum/login", "That handle and password do not match.");
  }
  await setForumSession(user!.id);
  revalidatePath("/forum");
  redirect("/forum");
}

export async function forumLogout(): Promise<void> {
  await clearForumSession();
  revalidatePath("/forum");
  redirect("/forum");
}

export async function forumNewThread(form: FormData): Promise<void> {
  const channelId = str(form, "channel");
  const channel = forumChannel(channelId);
  if (!channel) back("/forum", "No such channel.");

  const viewer = await getForumViewer();
  if (!viewer.user) back(`/forum/c/${channelId}`, "Sign in to post.");
  if (viewer.ban) back(`/forum/c/${channelId}`, banNotice(viewer.ban));
  // Threads are admin-only everywhere FOR NOW — the intent is to open this up
  // once the place has a culture. The announcement channel stays admin-only.
  if (!viewer.isAdmin) {
    back(`/forum/c/${channelId}`, "Only the crown opens new discussions for now — reply to an existing one.");
  }

  const title = str(form, "title").slice(0, FORUM_LIMITS.TITLE_MAX);
  const body = str(form, "body").slice(0, FORUM_LIMITS.BODY_MAX);
  if (title.length < 3) back(`/forum/c/${channelId}`, "Give the discussion a title.");
  if (!body) back(`/forum/c/${channelId}`, "Write an opening post.");

  const thread = await createThread({ channel: channelId, title, authorId: viewer.user!.id });
  await createPost({ threadId: thread.id, authorId: viewer.user!.id, body });
  revalidatePath(`/forum/c/${channelId}`);
  redirect(`/forum/t/${thread.id}`);
}

export async function forumReply(form: FormData): Promise<void> {
  const threadId = str(form, "threadId");
  const to = `/forum/t/${threadId}`;
  const viewer = await getForumViewer();
  if (!viewer.user) back(to, "Sign in to reply.");
  if (viewer.ban) back(to, banNotice(viewer.ban));

  const thread = await getThread(threadId);
  if (!thread) back("/forum", "That discussion is gone.");
  if (thread!.locked && !viewer.isAdmin) back(to, "This discussion is locked.");

  const body = str(form, "body").slice(0, FORUM_LIMITS.BODY_MAX);
  if (!body) back(to, "Write something first.");

  await createPost({ threadId, authorId: viewer.user!.id, body });
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
    await deletePost(str(form, "postId"), viewer.user!.id);
  }
  revalidatePath(`/forum/t/${threadId}`);
  redirect(`/forum/t/${threadId}`);
}
