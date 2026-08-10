"use server";

// Server actions: thin FormData adapters over the same command pipeline
// the cmd:* API routes use. On error, redirect back with ?err=….

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import type { Race } from "@/lib/constants/races";
import {
  clearSession,
  currentPlayerId,
  newRealmToken,
  playerIdFromToken,
  setSession,
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
  const playerId = await currentPlayerId();
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

export async function createEmpire(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 30);
  const race = String(formData.get("race") ?? "human") as Race;
  if (name.length < 2) redirect(`/login?err=${encodeURIComponent("Name your empire (2+ letters).")}`);
  // Founding is a command, so it flows through the active write model
  // (single-writer service §14.2, or compare-and-swap store §14.1).
  const id = randomUUID();
  const token = newRealmToken(); // CLI / API bearer credential, shown in the Command View
  const r = await runCommand(id, "createEmpire", { name, race, token });
  if (!r.ok) redirect(`/login?err=${encodeURIComponent(r.message ?? "That did not work.")}`);
  await setSession(id);
  revalidatePath("/", "layout");
  redirect("/");
}

/* enterEmpire (sit on any empire's throne by id) moved to app/admin/actions.ts
   as adminEnterAs — it is a debug tool and now runs behind requireAdmin. It was
   reachable here without any check at all. */

/** Re-enter an empire with its realm token (the CLI credential works here too). */
export async function enterWithToken(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  const world = await getWorld();
  const id = playerIdFromToken(world, token);
  if (!id) {
    redirect(`/login?err=${encodeURIComponent("That token opens no gate here.")}`);
  }
  if (world.players[id!].banned) {
    redirect(`/login?err=${encodeURIComponent("This empire has been banished by the crown.")}`);
  }
  await setSession(id!);
  revalidatePath("/", "layout");
  redirect("/");
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
  const id = await currentPlayerId();
  if (!id) redirect("/login");
  await runCommand(id, "dismissOnboarding", {});
  revalidatePath("/", "layout");
  redirect("/");
}

/** Mark the spotlight tour seen (called from the client when finished/skipped). */
export async function finishTour(): Promise<void> {
  const id = await currentPlayerId();
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
  const playerId = await currentPlayerId();
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
