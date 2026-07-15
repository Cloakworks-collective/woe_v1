"use server";

// Server actions: thin FormData adapters over the same command pipeline
// the cmd:* API routes use. On error, redirect back with ?err=….

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { newEmpire } from "@/lib/engine";
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
import { saveWorld } from "@/lib/server/store";
import { getWorld, runDueTicks, runOneTick } from "@/lib/server/world";

async function exec(path: string, name: string, args: Record<string, unknown>): Promise<never> {
  const playerId = await currentPlayerId();
  if (!playerId) redirect("/login");
  const result = await runCommand(playerId, name, args);
  revalidatePath("/", "layout");
  const sep = path.includes("?") ? "&" : "?"; // path may carry a tab param
  if (!result.ok) redirect(`${path}${sep}err=${encodeURIComponent(result.message ?? "That did not work.")}`);
  if (result.battleId) redirect(`/attack?report=${result.battleId}`);
  if (result.message) redirect(`${path}${sep}ok=${encodeURIComponent(result.message)}`);
  redirect(path);
}

export async function cmd(formData: FormData): Promise<void> {
  const name = String(formData.get("__cmd") ?? "");
  const path = String(formData.get("__path") ?? "/");
  const args: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("__") && !k.startsWith("$")) args[k] = v;
  }
  await exec(path, name, args);
}

// ── Session ─────────────────────────────────────────────────────────────────

export async function createEmpire(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 30);
  const race = String(formData.get("race") ?? "human") as Race;
  if (name.length < 2) redirect(`/login?err=${encodeURIComponent("Name your empire (2+ letters).")}`);
  const world = await getWorld();
  runDueTicks(world);
  if (Object.values(world.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    redirect(`/login?err=${encodeURIComponent("That name is taken.")}`);
  }
  const p = newEmpire({ id: randomUUID(), name, race, joinedAtTick: world.meta.tickNumber });
  p.apiToken = newRealmToken(); // CLI / API bearer credential, shown in the Command View
  world.players[p.id] = p;
  await saveWorld(world);
  await setSession(p.id);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function enterEmpire(formData: FormData): Promise<void> {
  const id = String(formData.get("playerId") ?? "");
  const world = await getWorld();
  if (!world.players[id] || world.players[id].isBot) {
    redirect(`/login?err=${encodeURIComponent("No such empire.")}`);
  }
  if (world.players[id].banned) {
    redirect(`/login?err=${encodeURIComponent("This empire has been banished by the crown.")}`);
  }
  await setSession(id);
  revalidatePath("/", "layout");
  redirect("/");
}

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

// ── The Royal Charter (spec/premium.md) ─────────────────────────────────────

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

// ── Dev time controls (disabled when a CRON_SECRET runs the real clock) ────

const devToolsEnabled = () => !process.env.CRON_SECRET;

export async function devAdvance(formData: FormData): Promise<void> {
  if (!devToolsEnabled()) redirect("/");
  const ticks = Math.min(288, Math.max(1, Math.floor(Number(formData.get("ticks") ?? 1))));
  const world = await getWorld();
  for (let i = 0; i < ticks; i++) runOneTick(world);
  await saveWorld(world);
  revalidatePath("/", "layout");
  redirect("/");
}
