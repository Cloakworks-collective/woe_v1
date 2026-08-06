// Shared loading for the four clan tabs (Hall / Works & Vault / Chat / War
// Front). Each tab is its own route — a clan page was 480 lines of nine panels,
// and the things a member actually does live at different rhythms: you read the
// hall talk constantly, you touch the vault when building, you declare war once
// an age. See spec/clans.md.

import { canAdmit, clanRank } from "../engine";
import type { Clan, Player } from "../engine";
import { CHAT, TURNS_PER_DAY } from "../constants";
import { getGame } from "./session";
import type { World } from "./store";

export interface ClanView {
  world: World;
  p: Player;
  clan: Clan | undefined;
  tick: number;
}

export async function getClanView(): Promise<ClanView> {
  const { world, player: p } = await getGame();
  return { world, p, clan: p.clanId ? world.clans[p.clanId] : undefined, tick: world.meta.tickNumber };
}

/** The clan's own chat channel, trimmed to the history the hall keeps. */
export function clanChatLog(world: World, clan: Clan) {
  return world.messages.filter((m) => m.channel === `clan:${clan.id}`).slice(-CHAT.CLAN_HISTORY);
}

export interface ClanBadges {
  /** Petitions waiting at the gate — only counted for those who may admit. */
  petitions: number;
  /** Messages in the last game day. Deliberately NOT "unread": there is no
   *  per-player read cursor, and adding one would mean writing to the world
   *  doc on every page view. "Recent" is the honest thing we can show. */
  chatToday: number;
  atWar: boolean;
}

export function clanBadges(world: World, clan: Clan, p: Player, tick: number): ClanBadges {
  return {
    petitions: canAdmit(clan, p.id) ? (clan.joinRequests ?? []).length : 0,
    chatToday: world.messages.filter(
      (m) => m.channel === `clan:${clan.id}` && tick - m.tick <= TURNS_PER_DAY,
    ).length,
    atWar: clan.wars.length > 0,
  };
}

/** Rank 1+ is leadership (Leader, Vice, Officers) — they may build and repair. */
export function isClanLeadership(clan: Clan, playerId: string): boolean {
  return clanRank(clan, playerId) >= 1;
}

/** Only the Leader and Vice-Leader may open a war. */
export function canDeclareWar(clan: Clan, playerId: string): boolean {
  return clan.leaderId === playerId || clan.viceLeaderId === playerId;
}
