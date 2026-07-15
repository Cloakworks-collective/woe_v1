// The War Records of the age — the living leaderboards of arms, tallied as
// every battle resolves. These mirror the sealed history of the Elder Ages
// (Richest Attacks, Richest Raids, Bloodiest Attacks, Greatest Feuds, Greatest
// Wars) but for the CURRENT era, so the standings are visible throughout the
// age and then sealed into the history books when it ends.
//
// Kept as persistent running tallies (not derived from world.battles, which is
// capped at 300) so a record set at turn 50 still stands at turn 5,000.

import type { BattleReport, UnitLosses } from "./types";

const TOP_N = 10; // rows kept in each leaderboard
const PAIR_CAP = 160; // prune the feud/war maps past this, back down to PAIR_KEEP
const PAIR_KEEP = 80;

/** One notable single clash — a row in Richest/Bloodiest tables. */
export interface RankedBattle {
  tick: number;
  attacker: string;
  attackerTag: string; // clan code, or "" if unbannered
  defender: string;
  defenderTag: string;
  value: number; // gold, resources, or total fallen — per the list it sits in
  atkLost: number;
  defLost: number;
}

/** An accumulated rivalry between two rulers (a feud) or two banners (a war). */
export interface PairRecord {
  n1: string;
  t1: string; // clan code of side 1
  v1: number; // side 1's tally (troops lost for feuds, regulars killed for wars)
  n2: string;
  t2: string;
  v2: number;
  total: number;
}

export interface EraRecords {
  richestAttacks: RankedBattle[]; // by gold plundered, desc
  richestRaids: RankedBattle[]; // by resources hauled, desc
  bloodiestAttacks: RankedBattle[]; // by total troops fallen in one clash, desc
  feuds: Record<string, PairRecord>; // ruler-vs-ruler, keyed by sorted ids
  wars: Record<string, PairRecord>; // clan-vs-clan, keyed by sorted ids
}

export function newEraRecords(): EraRecords {
  return { richestAttacks: [], richestRaids: [], bloodiestAttacks: [], feuds: {}, wars: {} };
}

export function totalLosses(l: UnitLosses): number {
  return l.footmen + l.archers + l.cavalry + l.engineers + l.warriors + l.mercenaries;
}

/** Regular troops only — mercenaries don't count toward war kills (see combat). */
export function regularLosses(l: UnitLosses): number {
  return l.footmen + l.archers + l.cavalry + l.engineers + l.warriors;
}

/** A short banner code derived from a clan name (live clans have no explicit tag). */
export function clanCode(name?: string): string {
  if (!name) return "";
  const words = name
    .replace(/\bthe\b/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function insertTop(list: RankedBattle[], entry: RankedBattle): void {
  list.push(entry);
  list.sort((a, b) => b.value - a.value);
  if (list.length > TOP_N) list.length = TOP_N;
}

function pairKey(idA: string, idB: string): { key: string; firstIsA: boolean } {
  return idA < idB ? { key: `${idA}|${idB}`, firstIsA: true } : { key: `${idB}|${idA}`, firstIsA: false };
}

function prune(map: Record<string, PairRecord>): void {
  const keys = Object.keys(map);
  if (keys.length <= PAIR_CAP) return;
  const kept = new Set(
    keys.sort((a, b) => map[b].total - map[a].total).slice(0, PAIR_KEEP),
  );
  for (const k of keys) if (!kept.has(k)) delete map[k];
}

export interface BattleContext {
  attackerId: string;
  attackerClanName?: string;
  defenderId: string;
  defenderClanName?: string;
}

/** Fold one resolved battle into the age's running War Records. Pure mutation. */
export function recordBattle(records: EraRecords, r: BattleReport, ctx: BattleContext): void {
  const attackerTag = clanCode(ctx.attackerClanName);
  const defenderTag = clanCode(ctx.defenderClanName);
  const atkLost = totalLosses(r.attackerLosses);
  const defLost = totalLosses(r.defenderLosses);
  const base = {
    tick: r.tick,
    attacker: r.attackerName,
    attackerTag,
    defender: r.defenderName,
    defenderTag,
    atkLost,
    defLost,
  };

  const gold = Math.floor(r.loot.gold);
  if (gold > 0) insertTop(records.richestAttacks, { ...base, value: gold });

  const res = r.loot.resources;
  const resTotal = Math.floor(res.food + res.wood + res.stone + res.ore);
  if (resTotal > 0) insertTop(records.richestRaids, { ...base, value: resTotal });

  const blood = atkLost + defLost;
  if (blood > 0) insertTop(records.bloodiestAttacks, { ...base, value: blood });

  // Feud — the running toll of a ruler-vs-ruler rivalry (troops each has lost).
  if (blood > 0 && ctx.attackerId !== ctx.defenderId) {
    const { key, firstIsA } = pairKey(ctx.attackerId, ctx.defenderId);
    const cur =
      records.feuds[key] ??
      (records.feuds[key] = {
        n1: firstIsA ? r.attackerName : r.defenderName,
        t1: firstIsA ? attackerTag : defenderTag,
        v1: 0,
        n2: firstIsA ? r.defenderName : r.attackerName,
        t2: firstIsA ? defenderTag : attackerTag,
        v2: 0,
        total: 0,
      });
    cur.v1 += firstIsA ? atkLost : defLost;
    cur.v2 += firstIsA ? defLost : atkLost;
    cur.total = cur.v1 + cur.v2;
    prune(records.feuds);
  }

  // War — the running kill-tally between two banners (regulars only).
  const aClan = ctx.attackerClanName;
  const dClan = ctx.defenderClanName;
  if (aClan && dClan && aClan !== dClan && r.mode !== "bombard") {
    const aKills = regularLosses(r.defenderLosses); // regulars the aggressor felled
    const dKills = regularLosses(r.attackerLosses);
    if (aKills > 0 || dKills > 0) {
      const { key, firstIsA } = pairKey(aClan, dClan); // clan names as stable ids
      const cur =
        records.wars[key] ??
        (records.wars[key] = {
          n1: firstIsA ? aClan : dClan,
          t1: clanCode(firstIsA ? aClan : dClan),
          v1: 0,
          n2: firstIsA ? dClan : aClan,
          t2: clanCode(firstIsA ? dClan : aClan),
          v2: 0,
          total: 0,
        });
      cur.v1 += firstIsA ? aKills : dKills;
      cur.v2 += firstIsA ? dKills : aKills;
      cur.total = cur.v1 + cur.v2;
      prune(records.wars);
    }
  }
}

export function topFeuds(records: EraRecords, n = TOP_N): PairRecord[] {
  return Object.values(records.feuds)
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

export function topWars(records: EraRecords, n = TOP_N): PairRecord[] {
  return Object.values(records.wars)
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

/** True when no deed of arms has been recorded yet this age. */
export function eraRecordsEmpty(records?: EraRecords): boolean {
  if (!records) return true;
  return (
    records.richestAttacks.length === 0 &&
    records.richestRaids.length === 0 &&
    records.bloodiestAttacks.length === 0 &&
    Object.keys(records.feuds).length === 0 &&
    Object.keys(records.wars).length === 0
  );
}
