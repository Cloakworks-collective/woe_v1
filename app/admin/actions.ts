"use server";

// Admin console actions — every one re-verifies the admin session.
// These are crown decrees, not game commands: they bypass the pipeline.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  checkPassword,
  clearAdminSession,
  isAdmin,
  setAdminSession,
} from "@/lib/server/admin";
import { pushInbox, saveWorld } from "@/lib/server/store";
import { eraReset, getWorld, runOneTick } from "@/lib/server/world";

const back = (msg: string, ok = true): never =>
  redirect(`/admin?${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);

export async function adminLogin(formData: FormData): Promise<void> {
  if (!checkPassword(String(formData.get("password") ?? ""))) {
    back("Wrong password.", false);
  }
  await setAdminSession();
  redirect("/admin");
}

export async function adminLogout(): Promise<void> {
  await clearAdminSession();
  redirect("/admin");
}

async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin");
}

export async function adminSetBan(formData: FormData): Promise<void> {
  await requireAdmin();
  const world = await getWorld();
  const p = world.players[String(formData.get("playerId") ?? "")];
  if (!p) back("No such empire.", false);
  p!.banned = formData.get("flag") === "1";
  await saveWorld(world);
  revalidatePath("/admin");
  back(p!.banned ? `${p!.name} is banished.` : `${p!.name} is pardoned.`);
}

export async function adminSetPremium(formData: FormData): Promise<void> {
  await requireAdmin();
  const world = await getWorld();
  const p = world.players[String(formData.get("playerId") ?? "")];
  if (!p) back("No such empire.", false);
  p!.premium = formData.get("flag") === "1";
  if (p!.premium) {
    pushInbox(world, p!.id, {
      type: "info",
      detail: "👑 The Royal Charter is sealed by decree — the Steward enters your service.",
    });
  }
  await saveWorld(world);
  revalidatePath("/admin");
  back(`${p!.name}: Royal Charter ${p!.premium ? "granted" : "revoked"}.`);
}

export async function adminGrant(formData: FormData): Promise<void> {
  await requireAdmin();
  const world = await getWorld();
  const p = world.players[String(formData.get("playerId") ?? "")];
  if (!p) back("No such empire.", false);
  const n = (k: string) => Math.floor(Number(formData.get(k) ?? 0)) || 0;
  const grant = { gold: n("gold"), food: n("food"), wood: n("wood"), stone: n("stone"), ore: n("ore") };
  p!.gold = Math.max(0, p!.gold + grant.gold);
  for (const r of ["food", "wood", "stone", "ore"] as const) {
    p!.resources[r] = Math.max(0, p!.resources[r] + grant[r]);
  }
  const bits = Object.entries(grant)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${v > 0 ? "+" : ""}${v.toLocaleString("en-US")} ${k}`);
  if (bits.length === 0) back("Nothing granted — all amounts were zero.", false);
  pushInbox(world, p!.id, {
    type: "info",
    detail: `👑 A royal grant arrives: ${bits.join(", ")}.`,
  });
  await saveWorld(world);
  revalidatePath("/admin");
  back(`${p!.name}: ${bits.join(", ")}.`);
}

export async function adminCloseAge(): Promise<void> {
  await requireAdmin();
  const world = await getWorld();
  const era = world.meta.eraName;
  // Seal the age's annals for good and open the next era named for the winner.
  const fresh = eraReset(world);
  await saveWorld(fresh);
  revalidatePath("/", "layout");
  back(`${era} is sealed into the Annals; ${fresh.meta.eraName} begins.`);
}

export async function adminForceTicks(formData: FormData): Promise<void> {
  await requireAdmin();
  const ticks = Math.min(1008, Math.max(1, Math.floor(Number(formData.get("ticks") ?? 1))));
  const world = await getWorld();
  for (let i = 0; i < ticks; i++) runOneTick(world);
  await saveWorld(world);
  revalidatePath("/", "layout");
  back(`Forced ${ticks} turn${ticks > 1 ? "s" : ""} — world at tick ${world.meta.tickNumber.toLocaleString("en-US")}.`);
}
