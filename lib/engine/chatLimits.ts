// Speech limits for the public rooms — and the clan hall's own silences.
//
// Pure functions over a player's own post stamps, so both the era hall and the
// clan hall are governed by one rule and a test can drive them without a world.

import { CHAT_LIMITS, CLAN_MUTE_DAYS, TICKS_PER_HOUR } from "../constants";
import type { Clan, Player } from "./types";

const MIN = 60_000;

/** Post stamps inside the last 24h, newest last. */
export function recentStamps(p: Player, nowMs: number): number[] {
  const cutoff = nowMs - CHAT_LIMITS.DAILY.minutes * MIN;
  return (p.chatStamps ?? []).filter((t) => t > cutoff);
}

/**
 * Why this ruler may not speak right now, or null.
 *
 * All three windows are checked, because one limit only stops one shape of
 * spam: the burst catches a flood, the hour a steady drip, the day someone who
 * paces themselves all afternoon.
 */
export function chatLimitProblem(p: Player, nowMs: number): string | null {
  const stamps = recentStamps(p, nowMs);
  const windows = [CHAT_LIMITS.BURST, CHAT_LIMITS.HOURLY, CHAT_LIMITS.DAILY];
  for (const w of windows) {
    const since = nowMs - w.minutes * MIN;
    const used = stamps.filter((t) => t > since);
    if (used.length >= w.messages) {
      // Say when they may speak again, not merely that they may not.
      const freeAt = used[used.length - w.messages]! + w.minutes * MIN;
      const wait = Math.max(1, Math.ceil((freeAt - nowMs) / MIN));
      return `You have said your ${w.messages} in ${w.minutes} minutes — the hall will hear you again in ${wait} minute${wait === 1 ? "" : "s"}.`;
    }
  }
  return null;
}

/** Record a post. Trims to the 24h window so the list cannot grow without end. */
export function recordChat(p: Player, nowMs: number): void {
  p.chatStamps = [...recentStamps(p, nowMs), nowMs];
}

// ── Clan hall silences ──────────────────────────────────────────────────────

export function clanMuteUntil(clan: Clan | undefined, playerId: string): number {
  return clan?.chatMutedUntilTick?.[playerId] ?? 0;
}

/** Silenced in this clan's hall right now? They can still READ it. */
export function clanMuted(clan: Clan | undefined, playerId: string, tick: number): boolean {
  return clanMuteUntil(clan, playerId) > tick;
}

/** Leadership silences a member for one of the offered spans. */
export function muteClanMember(
  clanIn: Clan,
  playerId: string,
  days: number,
  tick: number,
): Clan {
  const clan = structuredClone(clanIn);
  const allowed = (CLAN_MUTE_DAYS as readonly number[]).includes(days);
  if (!allowed) throw new Error(`Silences are ${CLAN_MUTE_DAYS.join(" or ")} days.`);
  clan.chatMutedUntilTick ??= {};
  clan.chatMutedUntilTick[playerId] = tick + days * 24 * TICKS_PER_HOUR;
  return clan;
}

export function unmuteClanMember(clanIn: Clan, playerId: string): Clan {
  const clan = structuredClone(clanIn);
  if (clan.chatMutedUntilTick) delete clan.chatMutedUntilTick[playerId];
  return clan;
}
