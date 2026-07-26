// The War Records of the CURRENT age, assembled into the same leaderboards the
// sealed Elder Ages show (spec/victory.md). Two sources feed them:
//   • flow tallies accumulated as deeds happen (EraRecords.feats + the battle
//     lists) — plunder, kills, sabotage, sales, largesse;
//   • a snapshot of the live empires at build time — the ladders, the mightiest
//     of each race, and the civil feats (research, wealth, population) that are
//     "wherever the empire stands right now".
// Both are rendered through the Elder Ages' LeaderTable, so the living age reads
// exactly like history the moment it is made — and the same tables are computed
// once at seal time and bound into the Annals for good. Clan cells link to the
// clan's page (/clan/[id]) when the banner is still known.

import { researchOrdinalCost } from "../constants/research";
import { CIVILIAN_LEVELLED_IDS } from "../constants/buildings";
import {
  clanCode,
  eraRecordsEmpty,
  level,
  rankingScore,
  topFeuds,
  topWars,
  totalPopulation,
  totalResearchLevels,
  type Clan,
  type EraRecords,
  type PlayerFeats,
  type Player,
  type RankedBattle,
} from "../engine";
import type { ElderCell, ElderTable } from "../lore/elderAges";
import type { World } from "./store";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const RACE_LABEL: Record<string, string> = {
  human: "Human",
  elf: "Elf",
  orc: "Orc",
  troll: "Troll",
  dwarf: "Dwarf",
  gnoll: "Gnoll",
};
const RACE_ORDER = ["human", "elf", "orc", "troll", "dwarf", "gnoll"];

/** How a clan is rendered in a "Clan" column — a link to its page, or a plain
 *  label when the banner can't be resolved (disbanded, or a legacy sealed age). */
export interface ClanResolvers {
  byId: (id?: string) => ElderCell;
  byTag: (tag: string) => ElderCell;
  byName: (name: string) => ElderCell;
}

/** Identity resolvers — plain text, no links (legacy sealed ages have no world). */
const PLAIN: ClanResolvers = {
  byId: () => "",
  byTag: (tag) => tag,
  byName: (name) => name,
};

// ── The five battle leaderboards (from the accumulated battle lists) ──────────

function battleRows(list: RankedBattle[], valueOnly: boolean, r: ClanResolvers): ElderCell[][] {
  return list.map((b, i) =>
    valueOnly
      ? [i + 1, b.attacker, r.byTag(b.attackerTag), b.defender, r.byTag(b.defenderTag), fmt(b.value)]
      : [i + 1, b.attacker, r.byTag(b.attackerTag), b.defender, r.byTag(b.defenderTag), fmt(b.atkLost), fmt(b.defLost), fmt(b.value)],
  );
}

export function battleTables(records: EraRecords, r: ClanResolvers = PLAIN): ElderTable[] {
  const tables: ElderTable[] = [];
  if (records.richestAttacks.length) {
    tables.push({
      title: "Richest Attacks",
      note: "the greatest hauls of gold taken by force",
      headers: ["#", "Attacker", "Clan", "Defender", "Clan", "Gold taken"],
      numeric: [0, 5],
      rows: battleRows(records.richestAttacks, true, r),
    });
  }
  if (records.richestRaids.length) {
    tables.push({
      title: "Richest Raids",
      note: "the fattest wagons of plunder hauled home",
      headers: ["#", "Attacker", "Clan", "Defender", "Clan", "Resources"],
      numeric: [0, 5],
      rows: battleRows(records.richestRaids, true, r),
    });
  }
  if (records.bloodiestAttacks.length) {
    tables.push({
      title: "Bloodiest Attacks",
      note: "the clashes with the most fallen on both sides",
      headers: ["#", "Attacker", "Clan", "Defender", "Clan", "Atk lost", "Def lost", "Total"],
      numeric: [0, 5, 6, 7],
      rows: battleRows(records.bloodiestAttacks, false, r),
    });
  }
  const wars = topWars(records);
  if (wars.length) {
    tables.push({
      title: "Greatest Wars",
      note: "the mightiest clan-against-clan wars, by regulars felled",
      headers: ["#", "Aggressor", "Target", "Kills", "Rival kills", "Total"],
      numeric: [0, 3, 4, 5],
      rows: wars.map((w, i) => [i + 1, r.byName(w.n1), r.byName(w.n2), fmt(w.v1), fmt(w.v2), fmt(w.total)]),
    });
  }
  const feuds = topFeuds(records);
  if (feuds.length) {
    tables.push({
      title: "Greatest Feuds",
      note: "the bitterest ruler-against-ruler rivalries of the age",
      headers: ["#", "Ruler", "Clan", "Rival", "Clan", "Losses", "Rival losses", "Total"],
      numeric: [0, 5, 6, 7],
      rows: feuds.map((f, i) => [i + 1, f.n1, r.byTag(f.t1), f.n2, r.byTag(f.t2), fmt(f.v1), fmt(f.v2), fmt(f.total)]),
    });
  }
  return tables;
}

// ── Snapshot helpers ─────────────────────────────────────────────────────────

/** Total research points ever sunk into the Collegium — the sum of the global
 *  progressive costs of every level earned (order 1..total). */
function researchInvested(p: Player): number {
  let rp = 0;
  const total = totalResearchLevels(p);
  for (let n = 1; n <= total; n++) rp += researchOrdinalCost(n);
  return rp;
}

/** Sum of all levelled civilian + military building levels — the great builders. */
function buildingLevels(p: Player): number {
  return CIVILIAN_LEVELLED_IDS.reduce((s, id) => s + level(p, id), 0) + level(p, "walls");
}

function clanSnapshotScore(world: World, memberIds: string[]): number {
  return memberIds.reduce((s, id) => (world.players[id] ? s + rankingScore(world.players[id]) : s), 0);
}

/** A ruler's total wealth — coin on hand + vaulted + loose goods. */
function wealth(p: Player): number {
  const r = p.resources;
  const banked = p.bankedResources ?? { food: 0, wood: 0, stone: 0, ore: 0 };
  return (
    p.gold + p.bankedGold + r.food + r.wood + r.stone + r.ore + banked.food + banked.wood + banked.stone + banked.ore
  );
}

// ── Champion picking ─────────────────────────────────────────────────────────

interface Champ {
  label: string; // the feat
  epithet: string; // "the Plunderer"
  value: (p: Player, f?: PlayerFeats) => number;
}

function crownRows(
  players: Player[],
  records: EraRecords | undefined,
  clanCell: (id?: string) => ElderCell,
  specs: Champ[],
): ElderCell[][] {
  const feats = records?.feats ?? {};
  const rows: ElderCell[][] = [];
  for (const spec of specs) {
    let best: Player | null = null;
    let bestVal = 0;
    for (const p of players) {
      const v = spec.value(p, feats[p.id]);
      if (v > bestVal) {
        bestVal = v;
        best = p;
      }
    }
    if (best && bestVal > 0) {
      rows.push([`${best.name}, ${spec.epithet}`, clanCell(best.clanId), spec.label, fmt(bestVal)]);
    }
  }
  return rows;
}

// ── The full record set ──────────────────────────────────────────────────────

export function buildEraTables(world: World, opts: { link?: boolean } = {}): ElderTable[] {
  const link = opts.link ?? true; // live page links to clan pages; sealed ages don't (clans are gone)
  const players = Object.values(world.players);
  const records = world.eraRecords;
  const tables: ElderTable[] = [];
  if (players.length === 0) return tables;

  // Clan resolvers — link a clan to its page while the banner still flies.
  const clansArr = Object.values(world.clans);
  const byId = new Map(clansArr.map((c) => [c.id, c] as const));
  const byTag = new Map<string, Clan>();
  const byName = new Map<string, Clan>();
  for (const c of clansArr) {
    byTag.set(clanCode(c.name), c);
    byName.set(c.name, c);
  }
  const cell = (c?: Clan): ElderCell => (c ? (link ? { text: c.name, href: `/clan/${c.id}` } : c.name) : "");
  const r: ClanResolvers = {
    byId: (id) => cell(id ? byId.get(id) : undefined),
    byTag: (tag) => (tag ? cell(byTag.get(tag)) || tag : ""),
    byName: (name) => cell(byName.get(name)) || name,
  };

  const ranked = [...players].sort((a, b) => rankingScore(b) - rankingScore(a));
  const rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]));

  // Greatest Rulers — the ladder itself.
  tables.push({
    title: "Greatest Rulers",
    note: "the mightiest empires of the age, by standing",
    headers: ["#", "Ruler", "Clan", "Race"],
    numeric: [0],
    rows: ranked
      .filter((p) => rankingScore(p) > 0)
      .slice(0, 10)
      .map((p, i) => [i + 1, p.name, r.byId(p.clanId), RACE_LABEL[p.race] ?? p.race]),
  });

  // Strongest Empires — the clan ladder.
  const clans = clansArr
    .map((c) => ({ c, score: clanSnapshotScore(world, c.members) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (clans.length) {
    tables.push({
      title: "Strongest Empires",
      note: "the clans that command the most might",
      headers: ["#", "Clan", "Members", "Score"],
      numeric: [0, 2, 3],
      rows: clans.slice(0, 10).map(({ c, score }, i) => [i + 1, cell(c), c.members.length, fmt(score)]),
    });
  }

  // Lords & Ladies — the strongest ruler of each race.
  const lords: ElderCell[][] = [];
  for (const race of RACE_ORDER) {
    const champ = ranked.find((p) => p.race === race && rankingScore(p) > 0);
    if (champ) {
      lords.push([champ.name, r.byId(champ.clanId), RACE_LABEL[race] ?? race, rankOf.get(champ.id) ?? 0]);
    }
  }
  if (lords.length) {
    tables.push({
      title: "Lords & Ladies of the Realm",
      note: "the mightiest of each race",
      headers: ["Name", "Clan", "Strongest of race", "Game rank"],
      numeric: [3],
      rows: lords,
    });
  }

  // Champions of the Realms — the champion of each battle feat.
  const champions = crownRows(players, records, r.byId, [
    { label: "Defenders killed", epithet: "the Slayer", value: (_p, f) => f?.defendersKilled ?? 0 },
    { label: "Attackers killed", epithet: "the Defender", value: (_p, f) => f?.attackersKilled ?? 0 },
    { label: "Gold won in battle", epithet: "the Plunderer", value: (_p, f) => f?.goldWon ?? 0 },
    { label: "Resources won in battle", epithet: "the Raider", value: (_p, f) => f?.resourcesWon ?? 0 },
    {
      label: "Regular troops slain",
      epithet: "the Empire Destroyer",
      value: (_p, f) => (f ? f.defendersKilled + f.attackersKilled : 0),
    },
    { label: "Most siege damage caused", epithet: "the Siege Master", value: (_p, f) => f?.siegeDamage ?? 0 },
    { label: "Most experienced army", epithet: "the Undefeatable", value: (p) => Math.round(p.army.experience) },
    { label: "Strongest empire-less ruler", epithet: "the Black Knight", value: (p) => (p.clanId ? 0 : rankingScore(p)) },
  ]);
  if (champions.length) {
    tables.push({
      title: "Champions of the Realms",
      note: "the champion of each feat of arms",
      headers: ["Name", "Clan", "Feat", "Total"],
      numeric: [3],
      rows: champions,
    });
  }

  // Non-Battle Titles — the leader of each civil feat.
  const civil = crownRows(players, records, r.byId, [
    { label: "Most research", epithet: "the Wise", value: (p) => researchInvested(p) },
    { label: "Most market sales", epithet: "the Marketeer", value: (_p, f) => f?.marketSales ?? 0 },
    { label: "Most gold given away", epithet: "the Generous", value: (_p, f) => f?.goldGiven ?? 0 },
    { label: "Most resources given away", epithet: "the Bountiful", value: (_p, f) => f?.resourcesGiven ?? 0 },
    { label: "Most spy damage caused", epithet: "the Saboteur", value: (_p, f) => f?.spyDamage ?? 0 },
    { label: "Most resources destroyed", epithet: "the Vandal", value: (_p, f) => f?.resourcesDestroyed ?? 0 },
    { label: "Largest population", epithet: "the Populous", value: (p) => totalPopulation(p) },
    { label: "Grandest works", epithet: "the Architect", value: (p) => buildingLevels(p) },
    { label: "Greatest wealth", epithet: "the Wealthy", value: (p) => wealth(p) },
  ]);
  if (civil.length) {
    tables.push({
      title: "Non-Battle Titles",
      note: "the leader of each civil feat",
      headers: ["Name", "Clan", "Feat", "Total"],
      numeric: [3],
      rows: civil,
    });
  }

  // The five battle leaderboards, with clan cells linked to their pages.
  if (records) tables.push(...battleTables(records, r));

  return tables;
}

/** True when the age has no records worth showing yet (no deeds AND no empires). */
export function eraTablesEmpty(world: World): boolean {
  return Object.keys(world.players).length === 0 && eraRecordsEmpty(world.eraRecords);
}
