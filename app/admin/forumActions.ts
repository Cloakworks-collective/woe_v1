"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/server/admin";
import { banAccount, liftBans, setAccountAdmin } from "@/lib/server/accounts";

// Forum moderation from the Crown Chamber. Gated by the SAME admin password as
// the rest of the console — a forum admin flag is about who can post
// announcements and pin threads; this is about who runs the server.

const back = (msg: string, ok = false): never =>
  redirect(`/admin/forum?${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);

async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin");
}

export async function adminForumBan(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const days = Number(formData.get("days") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  if (!userId) back("No such account.");
  // days <= 0 is permanent — the form offers 30 / 60 / 90 / Permanent.
  await banAccount(userId, days, reason);
  revalidatePath("/admin/forum");
  back(days > 0 ? `Silenced for ${days} days.` : "Silenced indefinitely.", true);
}

export async function adminForumPardon(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  await liftBans(userId);
  revalidatePath("/admin/forum");
  back("Every live ban on that account is lifted.", true);
}

export async function adminForumSetAdmin(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const make = String(formData.get("make") ?? "") === "1";
  await setAccountAdmin(userId, make);
  revalidatePath("/admin/forum");
  back(make ? "Given the crown on the forum." : "Forum crown removed.", true);
}
