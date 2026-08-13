"use server";

// Server actions: thin FormData adapters over the same command pipeline
// the cmd:* API routes use. On error, redirect back with ?err=….

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import type { Race } from "@/lib/constants/races";
import { createAccount, findAccountByToken } from "@/lib/server/accounts";
import {
  clearSession,
  currentAccountId,
  currentPlayerId,
  newAccountToken,
  playerIdForAccount,
  setAccountSession,
} from "@/lib/server/auth";
import { emulatedCardOutcome, grantCharter, paymentMode } from "@/lib/server/premium";
import { runCommand } from "@/lib/server/pipeline";
import { getWorld } from "@/lib/server/world";

/** What a command tells the herald. `at` is a nonce so two identical results in
 *  a row still register as fresh news on the client. */
export type CmdResult = { ok: boolean; message?: string; at: number } | null;

/**
 * Run one command and RETURN its outcome rather than redirecting.
 *
 * Redirecting was the old way, and it cost the player their place on the page:
 * a redirect is a navigation, and Next resets scroll to the top, so upgrading a
 * building near the bottom of /buildings threw you back to the header. Returning
 * instead means `revalidatePath` re-renders the server components in place —
 * the numbers update, the scroll position never moves.
 *
 * Only a battle still navigates, because its report genuinely lives elsewhere.
 */
export async function cmdAction(_prev: CmdResult, formData: FormData): Promise<CmdResult> {
  const playerId = await currentPlayerId(await getWorld());
  if (!playerId) redirect("/login");

  const name = String(formData.get("__cmd") ?? "");
  const args: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("__") && !k.startsWith("$")) args[k] = v;
  }

  const result = await runCommand(playerId, name, args);
  revalidatePath("/", "layout");

  if (result.battleId) redirect(`/rankings?report=${result.battleId}`);
  return {
    ok: result.ok,
    message: result.ok ? result.message : (result.message ?? "That did not work."),
    at: Date.now(),
  };
}

// ── Session ─────────────────────────────────────────────────────────────────

/**
 * Found this age's empire — minting the account first if this is a first visit.
 *
 * The account is created silently rather than behind a sign-up form, because
 * the login page's promise is "no account, no email — the throne is yours the
 * moment you click", and that is worth keeping. What the player gets instead of
 * a form is a magic link, shown in the Command View from their first page load.
 *
 * A returning player already has the cookie, so this founds under their
 * existing account — and the one-per-age rule in `createEmpireCmd` is what
 * stops them founding a second.
 */
export async function createEmpire(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 30);
  const race = String(formData.get("race") ?? "human") as Race;
  if (name.length < 2) redirect(`/login?err=${encodeURIComponent("Name your empire (2+ letters).")}`);

  let accountId = await currentAccountId();
  if (!accountId) {
    const account = await createAccount({ token: newAccountToken() });
    accountId = account.id;
    await setAccountSession(accountId);
  }

  // Founding is a command, so it flows through the active write model
  // (single-writer service §14.2, or compare-and-swap store §14.1).
  const id = randomUUID();
  const r = await runCommand(id, "createEmpire", { name, race, accountId });
  if (!r.ok) redirect(`/login?err=${encodeURIComponent(r.message ?? "That did not work.")}`);
  revalidatePath("/", "layout");
  redirect("/");
}

/* enterEmpire (sit on any empire's throne by id) moved to app/admin/actions.ts
   as adminEnterAs — it is a debug tool and now runs behind requireAdmin. It was
   reachable here without any check at all. */

/**
 * Sign in with the magic link — or the bare token out of it.
 *
 * Signing in does NOT require an empire. An account returning on the first day
 * of a new age has none yet, and lands on /login to found one; sending them
 * away with "that token opens no gate" would be telling a returning player
 * their account was gone.
 */
export async function enterWithToken(formData: FormData): Promise<void> {
  const raw = String(formData.get("token") ?? "").trim();
  // People paste the whole link far more often than the token inside it.
  const token = raw.includes("t=") ? decodeURIComponent(raw.split("t=").pop() ?? "") : raw;
  const account = await findAccountByToken(token.trim());
  if (!account) {
    redirect(`/login?err=${encodeURIComponent("That link opens no gate here.")}`);
  }
  await setAccountSession(account!.id);

  const world = await getWorld();
  const id = playerIdForAccount(world, account!.id);
  if (id && world.players[id]?.banned) {
    redirect(`/login?err=${encodeURIComponent("This empire has been banished by the crown.")}`);
  }
  revalidatePath("/", "layout");
  redirect(id ? "/" : "/login");
}

export async function leaveSession(): Promise<void> {
  await clearSession();
  redirect("/login");
}

// ── The Regent's Charges (new-player onboarding) ─────────────────────────────

/** Wave the charges away — and pay out every remaining reward, so an
 *  experienced regent who skips the tutorial still receives the full bounty.
 *  Routed as a command so it lands through the active writer. */
export async function waiveOnboarding(): Promise<void> {
  const id = await currentPlayerId(await getWorld());
  if (!id) redirect("/login");
  await runCommand(id, "dismissOnboarding", {});
  revalidatePath("/", "layout");
  redirect("/");
}

/** Mark the spotlight tour seen (called from the client when finished/skipped). */
export async function finishTour(): Promise<void> {
  const id = await currentPlayerId(await getWorld());
  if (!id) redirect("/login");
  await runCommand(id, "finishTour", {});
  revalidatePath("/", "layout");
}

// ── Theme (light / dark) ─────────────────────────────────────────────────────

export async function toggleTheme(formData: FormData): Promise<void> {
  const next = String(formData.get("to") ?? "dark") === "dark" ? "dark" : "light";
  const jar = await cookies();
  jar.set("woe_theme", next, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  const referer = (await headers()).get("referer");
  let back = "/";
  try {
    if (referer) back = new URL(referer).pathname + new URL(referer).search;
  } catch {
    /* keep default */
  }
  revalidatePath("/", "layout");
  redirect(back || "/");
}

// ── The Royal Charter (spec/clans.md) ─────────────────────────────────────

/** Test-terminal purchase — active only when Stripe keys are absent.
 *  Emulates Stripe test-mode cards (4242 4242 4242 4242 succeeds). */
export async function emulatorPurchase(formData: FormData): Promise<void> {
  const playerId = await currentPlayerId(await getWorld());
  if (!playerId) redirect("/login");
  if (paymentMode() !== "emulator") {
    redirect(`/premium?err=${encodeURIComponent("Stripe is configured — use the checkout button.")}`);
  }
  const outcome = emulatedCardOutcome(
    String(formData.get("card") ?? ""),
    String(formData.get("exp") ?? ""),
    String(formData.get("cvc") ?? ""),
  );
  if (outcome) redirect(`/premium?err=${encodeURIComponent(outcome)}`);
  await grantCharter(playerId);
  revalidatePath("/", "layout");
  redirect(`/premium?ok=${encodeURIComponent("Payment accepted (test mode) — the Royal Charter is sealed!")}`);
}
