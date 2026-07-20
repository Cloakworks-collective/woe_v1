// Per-request game context for pages: advance the clock, load the player.

import { cache } from "react";
import { redirect } from "next/navigation";
import { applyOnboardingRewards, type Player } from "@/lib/engine";
import { currentPlayerId, newRealmToken } from "./auth";
import { saveWorld, type World } from "./store";
import { getWorld, runDueTicks } from "./world";

// Deduped per request: the game layout and the page both call getGame(), but
// React's cache() ensures the load + tick + save runs exactly once per render,
// regardless of timing — no reliance on the store's time-based cache window.
export const getGame = cache(_getGame);

async function _getGame(): Promise<{ world: World; player: Player }> {
  const world = await getWorld();
  const processed = runDueTicks(world);
  const id = await currentPlayerId();
  const player = id ? world.players[id] : undefined;
  if (player?.banned) redirect(`/login?err=${encodeURIComponent("This empire has been banished by the crown.")}`);
  // Backfill realm tokens for empires founded before CLI access existed.
  const minted = player && !player.apiToken ? ((player.apiToken = newRealmToken()), true) : false;
  // Pay out any completed-but-unclaimed Regent's Charges (idempotent).
  const rewarded = player ? applyOnboardingRewards(player).length > 0 : false;
  // Presence for the ladder's Online column — coarse (4-min granularity) so
  // ordinary navigation doesn't force a world save on every page.
  const now = Date.now();
  const seen = player && now - (player.lastSeenAtMs ?? 0) > 4 * 60 * 1000
    ? ((player.lastSeenAtMs = now), true)
    : false;
  if (processed > 0 || minted || rewarded || seen) await saveWorld(world);
  if (!player) redirect("/login");
  return { world, player };
}
