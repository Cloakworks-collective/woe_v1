// Per-request game context for pages: advance the clock, load the player.

import { cache } from "react";
import { redirect } from "next/navigation";
import { applyOnboardingRewards, isOnboardingActive, type Player } from "@/lib/engine";
import { currentAccountId, playerIdForAccount } from "./auth";
import { impersonatedPlayerId } from "./admin";
import { runCommand } from "./pipeline";
import { type World } from "./store";
import { commitWithRetry, getWorld, runDueTicks } from "./world";
import { worldServiceEnabled } from "./worldClient";

const PRESENCE_STALE_MS = 4 * 60 * 1000; // coarse Online granularity

// Deduped per request: the game layout and the page both call getGame(), but
// React's cache() ensures the load + tick + save runs exactly once per render,
// regardless of timing — no reliance on the store's time-based cache window.
export const getGame = cache(_getGame);

async function _getGame(): Promise<{ world: World; player: Player }> {
  // The account is world-independent; WHICH empire it holds is not, because an
  // account keeps its identity across ages and founds a fresh empire in each.
  // So this reads the cookie up front and resolves the empire per world.
  const accountId = await currentAccountId();

  // §14.2: the single-writer service owns the world. Read from it; push any
  // housekeeping (onboarding payout, presence) as a command so it lands through
  // the one writer — and only when something actually needs it.
  // The console may be wearing another throne — any empire, bots included. It
  // wins over the account session, and the account is left untouched so taking
  // the crown off is just clearing one cookie.
  const worn = await impersonatedPlayerId();

  if (worldServiceEnabled()) {
    if (!accountId && !worn) redirect("/login");
    const world = await getWorld();
    const id = (worn && world.players[worn] ? worn : null) ?? (accountId ? playerIdForAccount(world, accountId) : null);
    // No empire in THIS age is not an error — it is the normal state of a
    // returning player on the first day of a new one. /login founds the next.
    if (!id) redirect("/login");
    const player = world.players[id];
    if (player?.banned) redirect(`/login?err=${encodeURIComponent("This empire has been banished by the crown.")}`);
    if (!player) redirect("/login");
    const now = Date.now();
    // The roof-damage flag must clear on the very first page load, not on the
    // next 4-minute presence stamp — it is the thing that decides whether the
    // day's settlers count, so a stale one hands out free growth. See
    // intakeHousing.
    const needsSync =
      isOnboardingActive(player) ||
      player.roofDamageUnseen === true ||
      now - (player.lastSeenAtMs ?? 0) > PRESENCE_STALE_MS;
    if (needsSync) {
      await runCommand(id, "syncPlayer", {});
      // No forceReload: the command response itself carried the post-command
      // world into the read cache, so this is a cache hit — the cold-start
      // page went from three whole-world transfers to two, and every ordinary
      // command-then-render cycle from two to one.
      const fresh = await getWorld();
      const fp = fresh.players[id];
      if (fp) return { world: fresh, player: fp };
    }
    return { world, player };
  }

  // Advance the clock, pay out charges, stamp presence — all under optimistic
  // concurrency (§14.1). A page load that changes nothing (dirty=false) skips
  // the save, keeping ordinary navigation off the network.
  const { world, player, banned } = await commitWithRetry((world) => {
    const processed = runDueTicks(world);
    const id =
      (worn && world.players[worn] ? worn : null) ??
      (accountId ? playerIdForAccount(world, accountId) : null);
    const player = id ? world.players[id] : undefined;
    if (player?.banned) return { result: { world, player, banned: true }, dirty: false };
    // Pay out any completed-but-unclaimed Regent's Charges (idempotent).
    const rewarded = player ? applyOnboardingRewards(player).length > 0 : false;
    // Presence for the ladder's Online column — coarse (4-min granularity) so
    // ordinary navigation doesn't force a world save on every page.
    // Not while impersonating: an admin peering into an empire is not its
    // ruler logging in, and stamping presence would light a bot up as "online"
    // on the public ladder and hand a real player a free night's roof grace.
    const now = Date.now();
    const seen =
      !worn && player && now - (player.lastSeenAtMs ?? 0) > 4 * 60 * 1000
        ? ((player.lastSeenAtMs = now), true)
        : false;
    // Unthrottled, unlike the presence stamp above: the regent is looking at
    // the game right now, so bombarded housing starts counting against their
    // settlers from this moment. See intakeHousing.
    const sawRoofs = !worn && player?.roofDamageUnseen === true
      ? ((player.roofDamageUnseen = false), true)
      : false;
    const dirty = processed > 0 || rewarded || seen || sawRoofs;
    return { result: { world, player, banned: false }, dirty };
  });

  if (banned) redirect(`/login?err=${encodeURIComponent("This empire has been banished by the crown.")}`);
  if (!player) redirect("/login");
  return { world, player };
}
