"use server";

// Admin console actions — every one re-verifies the admin session.
// These are crown decrees, not game commands: they bypass the pipeline.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  checkPassword,
  clearAdminSession,
  clearImpersonation,
  impersonatedPlayerId,
  isAdmin,
  setAdminSession,
  setImpersonation,
} from "@/lib/server/admin";
import { pushInbox, type World } from "@/lib/server/store";
import { commitWithRetry, eraReset, getWorld, runOneTick } from "@/lib/server/world";
import {
  STORAGE_BUILDING,
  TICKS_PER_HOUR,
  type BuildingId,
} from "@/lib/constants";
import type { MarketOrder, Player, Resource } from "@/lib/engine";
import { shelterCapacity } from "@/lib/engine";
import { emptyMercForce, emptySiegeCounters, emptySiegeGear, fullCounterIntegrity, fullGearIntegrity } from "@/lib/engine/types";

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

/**
 * Apply a crown decree to the world, safely.
 *
 * Admin actions used to do `getWorld()` → mutate → `saveWorld()`. Two things
 * were wrong with that, and together they are why a Royal Grant could vanish:
 *
 *   · NO RETRY. `saveWorld` is a compare-and-swap. The world ticks on every
 *     page load, so a decree that lost the race threw WorldConflictError out of
 *     the server action — the grant was never written and the admin saw a
 *     crash rather than a message.
 *   · MUTATING THE SHARED CACHE. `getWorld()` hands back the cached object, so
 *     a decree that failed to save had ALREADY changed the world every other
 *     request could see. The console would show the grant applied while the
 *     database never received it — which is exactly what "it did not go
 *     through" looks like from the outside.
 *
 * `commitWithRetry` fixes both: it clones a fresh world per attempt and replays
 * on conflict, the same guarantee every ordinary game command already had.
 *
 * `mutate` MUST be replayable — it may run several times, each on a pristine
 * world. Read the form OUTSIDE it, and never redirect from inside: a redirect
 * throws, which would abort the commit before it saved. Return a message and
 * let the caller redirect.
 */
async function decree(
  mutate: (world: World) => { ok: boolean; msg: string; dirty?: boolean },
): Promise<{ ok: boolean; msg: string }> {
  return commitWithRetry<{ ok: boolean; msg: string }>((world) => {
    const r = mutate(world);
    return { result: { ok: r.ok, msg: r.msg }, dirty: r.dirty ?? r.ok };
  });
}

/**
 * Sit on another empire's throne — ANY empire, bots and account-less seeds
 * included.
 *
 * This used to wear the target's ACCOUNT, which meant it could only reach
 * empires that had one (never a bot, never a seed) and it overwrote the admin's
 * own session on the way in, with no way back but signing in again. It now
 * lays a signed impersonation cookie over whatever session you already have —
 * so every empire is reachable, and `adminReturnToSelf` takes the crown off.
 */
export async function adminEnterAs(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("playerId") ?? "");
  const world = await getWorld();
  const p = world.players[id];
  if (!p) back("No such empire.", false);
  await setImpersonation(id);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Take the crown off and go back to being yourself. */
export async function adminReturnToSelf(): Promise<void> {
  await clearImpersonation();
  revalidatePath("/", "layout");
  redirect("/admin/empires");
}

export async function adminSetBan(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("playerId") ?? "");
  const ban = formData.get("flag") === "1";
  const r = await decree((world) => {
    const p = world.players[id];
    if (!p) return { ok: false, msg: "No such empire.", dirty: false };
    p.banned = ban;
    return { ok: true, msg: p.banned ? `${p.name} is banished.` : `${p.name} is pardoned.` };
  });
  revalidatePath("/admin");
  back(r.msg, r.ok);
}

export async function adminSetPremium(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("playerId") ?? "");
  const on = formData.get("flag") === "1";
  const r = await decree((world) => {
    const p = world.players[id];
    if (!p) return { ok: false, msg: "No such empire.", dirty: false };
    p.premium = on;
    if (p.premium) {
      pushInbox(world, p.id, {
        type: "info",
        detail: "👑 The Royal Charter is sealed by decree — the Steward enters your service.",
      });
    }
    return { ok: true, msg: `${p.name}: Royal Charter ${p.premium ? "granted" : "revoked"}.` };
  });
  revalidatePath("/admin");
  back(r.msg, r.ok);
}

export async function adminGrant(formData: FormData): Promise<void> {
  await requireAdmin();
  // Everything read from the form happens ONCE, out here — `decree` may replay
  // its mutation several times and a FormData read inside it would be wasted
  // work at best and a moving target at worst.
  const id = String(formData.get("playerId") ?? "");
  const n = (k: string) => Math.floor(Number(formData.get(k) ?? 0)) || 0;
  const grant = { gold: n("gold"), food: n("food"), wood: n("wood"), stone: n("stone"), ore: n("ore") };
  const bits = Object.entries(grant)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${v > 0 ? "+" : ""}${v.toLocaleString("en-US")} ${k}`);
  if (bits.length === 0) back("Nothing granted — all amounts were zero.", false);

  const r = await decree((world) => {
    const p = world.players[id];
    if (!p) return { ok: false, msg: "No such empire.", dirty: false };
    p.gold = Math.max(0, p.gold + grant.gold);
    for (const res of ["food", "wood", "stone", "ore"] as const) {
      p.resources[res] = Math.max(0, p.resources[res] + grant[res]);
    }
    pushInbox(world, p.id, {
      type: "info",
      detail: `👑 A royal grant arrives: ${bits.join(", ")}.`,
    });
    return { ok: true, msg: `${p.name}: ${bits.join(", ")}.` };
  });
  revalidatePath("/", "layout"); // the grant shows on the player's own pages too
  back(r.msg, r.ok);
}

export async function adminCloseAge(): Promise<void> {
  await requireAdmin();
  const r = await decree((world) => {
    const era = world.meta.eraName;
    // Seal the age's annals for good and open the next era named for the winner.
    const fresh = eraReset(world);
    // `eraReset` builds a NEW object, but `commitWithRetry` persists the one it
    // handed us — returning the new reference would silently drop it. So fold
    // the rebuilt age into the world we were given, which also keeps its
    // version tag and so overwrites the row we read rather than inserting a
    // second one (what `carryWorldVersion` used to do by hand).
    for (const k of Object.keys(world)) delete (world as unknown as Record<string, unknown>)[k];
    Object.assign(world, fresh);
    return { ok: true, msg: `${era} is sealed into the Annals; ${fresh.meta.eraName} begins.` };
  });
  revalidatePath("/", "layout");
  back(r.msg, r.ok);
}

export async function adminForceTicks(formData: FormData): Promise<void> {
  await requireAdmin();
  const ticks = Math.min(1008, Math.max(1, Math.floor(Number(formData.get("ticks") ?? 1))));
  const r = await decree((world) => {
    for (let i = 0; i < ticks; i++) runOneTick(world);
    return {
      ok: true,
      msg: `Forced ${ticks} turn${ticks > 1 ? "s" : ""} — world at tick ${world.meta.tickNumber.toLocaleString("en-US")}.`,
    };
  });
  revalidatePath("/", "layout");
  back(r.msg, r.ok);
}

// ── Dev tools ─────────────────────────────────────────────────────────────
// Formerly the loose /api/dev/* routes and the in-game DEV CLOCK; now folded
// into the crown console so every world-mutating shortcut lives behind one gate.

// A gentle random walk with occasional spikes and supply gaps, ending "now".
function priceSeries(base: number, tick: number, n: number) {
  const out: { t: number; p: number | null }[] = [];
  let v = base;
  const start = Math.floor(tick / TICKS_PER_HOUR) - n;
  for (let i = 0; i <= n; i++) {
    const t = (start + i) * TICKS_PER_HOUR;
    v *= 1 + (Math.random() - 0.5) * 0.16;
    if (Math.random() < 0.05) v *= 1.6 + Math.random();
    if (Math.random() < 0.05) v *= 0.55;
    v = Math.max(base * 0.35, Math.min(base * 4, v));
    const p = Math.random() < 0.06 ? null : Math.round(v * 1000) / 1000;
    out.push({ t, p });
  }
  return out;
}

// Pour rich, self-consistent data into the chosen empire plus the shared
// market, so every page renders "populated" for screenshots/testing.
export async function adminSeed(formData: FormData): Promise<void> {
  await requireAdmin();
  const seedId = String(formData.get("playerId") ?? "");
  const outcome = await decree((world) => {
  const p = world.players[seedId] as Player | undefined;
  if (!p) return { ok: false, msg: "No such empire.", dirty: false };

  const tick = world.meta.tickNumber;

  p!.buildings = {
    // Production
    grange: 8,
    sawyers_mill: 7,
    masons_quarry: 6,
    deepvein_mine: 5,
    // Storage
    granary: 6,
    counting_house: 5,
    timberyard: 5,
    masons_yard: 4,
    ironhold: 4,
    // Knowledge & trade
    collegium: 6,
    market_square: 4,
    shadow_guild: 3,
    rangers_lodge: 3,
    // Counted
    hearthstead: 78, // 780 housing
    muster_hall: 40, // 400 troop slots
    // Military tiers
    forge: 3,
    drill_yard: 3,
    fletchers_range: 2,
    knights_stables: 2,
    // Siege & defence
    war_foundry: 7,
    walls: 6,
  };

  p!.wallIntegrity = 0.72;
  p!.buildingIntegrity = {
    granary: 0.58,
    deepvein_mine: 0.81,
    market_square: 0.66,
  };

  p!.idlePeasants = 28;
  p!.workers = {
    farmers: 140,
    lumberjacks: 120,
    quarrymen: 100,
    miners: 90,
    researchers: 100,
    merchants: 60,
  };

  p!.army = {
    footmen: { light: 62, medium: 48, heavy: 21 },
    archers: { light: 40, medium: 26, heavy: 9 },
    cavalry: { light: 22, medium: 14, heavy: 7 },
    siegeEngineers: 25,
    siegeGear: { ...emptySiegeGear(), ropes: 8, ladders: 6, siege_towers: 2, rams: 4, ballistae: 3, trebuchets: 3 },
    siegeCounters: { ...emptySiegeCounters(), billhooks: 6, forkpoles: 4, fire_pots: 2, boiling_oil: 3, hoardings: 2, counter_engine: 2 },
    siegeGearIntegrity: fullGearIntegrity(),
    siegeCounterIntegrity: fullCounterIntegrity(),
    spies: 40,
    scouts: 40,
    mercenaries: {
      ...emptyMercForce(),
      footmen: { light: 10, medium: 4, heavy: 0 },
      archers: { light: 3, medium: 1, heavy: 0 },
      cavalry: { light: 0, medium: 0, heavy: 0 },
    },
    stamina: 78,
    siegeExperience: 40,
    spyExperience: 30,
    scoutExperience: 30,
    experiencePoints: 2_300_000, // +46%
  };

  p!.research = {
    activeField: "art_of_war",
    levels: {
      crop_rotation: 3,
      forestry: 2,
      masonry: 2,
      deep_smelting: 1,
      statecraft: 2,
      art_of_war: 2,
      shieldcraft: 2,
      siegecraft: 1,
      tradecraft: 3,
      pathfinding: 1,
    },
    banked: {
      art_of_war: 6800,
      shieldcraft: 1400,
      siegecraft: 900,
    },
  };

  p!.gold = 184_500;
  p!.bankedGold = 96_000;
  p!.resources = { food: 118_000, wood: 92_000, stone: 74_000, ore: 61_000 };
  p!.starving = false;
  p!.taxRate = 0.35;
  p!.turnsAvailable = 240;

  p!.premium = true;
  p!.buildQueue = ["ironhold", "knights_stables", "walls"];
  p!.researchQueue = [
    { field: "art_of_war", toLevel: 3 },
    { field: "masonry", toLevel: 3 },
  ];
  p!.standingOrders = [
    {
      id: "so-dev-1",
      when: { kind: "gold", amount: 250_000 },
      then: { kind: "build", building: "collegium" },
    },
  ];

  const asks: MarketOrder[] = [
    { id: "dev-a1", sellerId: "bot-eldervale", resource: "wood", remaining: 6200, pricePerUnit: 0.05, createdTick: tick - 40 },
    { id: "dev-a2", sellerId: "bot-sylvangrove", resource: "wood", remaining: 3100, pricePerUnit: 0.062, createdTick: tick - 30 },
    { id: "dev-a3", sellerId: "bot-stonewatch", resource: "stone", remaining: 5400, pricePerUnit: 0.058, createdTick: tick - 52 },
    { id: "dev-a4", sellerId: "bot-grimhold", resource: "stone", remaining: 2600, pricePerUnit: 0.071, createdTick: tick - 22 },
    { id: "dev-a5", sellerId: "bot-karakdun", resource: "ore", remaining: 4300, pricePerUnit: 0.083, createdTick: tick - 61 },
    { id: "dev-a6", sellerId: "bot-bloodfang", resource: "ore", remaining: 1900, pricePerUnit: 0.095, createdTick: tick - 12 },
    { id: "dev-a7", sellerId: "bot-nightpaw", resource: "food", remaining: 8800, pricePerUnit: 0.031, createdTick: tick - 70 },
    { id: "dev-a8", sellerId: "bot-freeholt", resource: "food", remaining: 4200, pricePerUnit: 0.037, createdTick: tick - 18 },
    { id: "dev-mine-1", sellerId: p!.id, resource: "stone", remaining: 3000, pricePerUnit: 0.07, createdTick: tick - 8 },
    { id: "dev-mine-2", sellerId: p!.id, resource: "ore", remaining: 1500, pricePerUnit: 0.1, createdTick: tick - 3 },
  ];
  world.orders = world.orders.filter(
    (o) => !o.id.startsWith("dev-") && o.sellerId !== p!.id,
  );
  world.orders.push(...asks);

  const N = 150;
  const bases: Record<Resource, number> = { food: 0.033, wood: 0.05, stone: 0.06, ore: 0.084 };
  world.priceHistory = {
    food: priceSeries(bases.food, tick, N),
    wood: priceSeries(bases.wood, tick, N),
    stone: priceSeries(bases.stone, tick, N),
    ore: priceSeries(bases.ore, tick, N),
  };

  return {
    ok: true,
    msg: `Seeded ${p!.name}: ${Object.keys(p!.buildings).length} buildings, ${world.orders.length} market orders, ${N + 1} price points.`,
  };
  });
  revalidatePath("/", "layout");
  back(outcome.msg, outcome.ok);
}

// Bring existing empires up to the current starting conditions — level-1
// banking (Counting House + the four stores) for everyone founded before
// newEmpire started granting them. Idempotent: fills gaps, never lowers.
export async function adminBackfillStorage(): Promise<void> {
  await requireAdmin();
  const STARTING_STORAGE: BuildingId[] = [
    "counting_house",
    "granary",
    "timberyard",
    "masons_yard",
    "ironhold",
  ];
  const r = await decree((world) => {
    const touched: string[] = [];
    for (const p of Object.values(world.players)) {
      let changed = false;
      for (const id of STARTING_STORAGE) {
        if (!p.buildings[id]) {
          p.buildings[id] = 1;
          changed = true;
        }
      }
      if (!p.bankedResources) {
        const banked = { food: 0, wood: 0, stone: 0, ore: 0 };
        for (const res of ["food", "wood", "stone", "ore"] as const) {
          const cap = shelterCapacity(p, STORAGE_BUILDING[res]);
          const move = Math.min(p.resources[res], cap);
          p.resources[res] -= move;
          banked[res] = move;
        }
        p.bankedResources = banked;
        changed = true;
      }
      if (changed) touched.push(p.name);
    }
    return {
      ok: true,
      // Nothing to do is a real outcome, not a failure — but it must not be
      // written, or an idempotent backfill would bump the world version on
      // every click and lose races for everyone else.
      dirty: touched.length > 0,
      msg: touched.length
        ? `Backfilled storage for ${touched.length} empire${touched.length > 1 ? "s" : ""}: ${touched.join(", ")}.`
        : "Every empire already has starting storage — nothing to backfill.",
    };
  });
  revalidatePath("/", "layout");
  back(r.msg, r.ok);
}
