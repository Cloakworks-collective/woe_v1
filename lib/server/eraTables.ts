// The War Records of the CURRENT age, assembled into the same leaderboards the
// sealed Elder Ages show (spec/overview.md). Two sources feed them:
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
import { TURN_MINUTES } from "../constants";
import {
  clanCode,
  eraRecordsEmpty,
  rankingScore,
  topFeuds,
  topWars,
  totalResearchLevels,
  veterancyBonus,
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

/**
 * How long ago, in the coarsest unit that still says something useful. A record
 * set eleven minutes ago and one set last spring should not both read as a turn
 * number — "2h ago" tells you whether it is still standing or ancient history.
 */
export function agoFromTick(tick: number, nowTick: number): string {
  const mins = Math.max(0, nowTick - tick) * TURN_MINUTES;
  if (mins < 2) return "just now";
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 31) {
    const w = Math.floor(d / 7);
    return `${w}w ago`;
  }
  if (d < 365) {
    const mo = Math.floor(d / 30);
    return `${mo}mo ago`;
  }
  return `${Math.floor(d / 365)}y ago`;
}

/** Boards carry up to fifteen rows; the page shows the first five and hides the
 *  rest behind a "Show more" (see LeaderTable). Five is what you read; the
 *  other ten are there for when you actually want to dig. */
const CLASH_TOP = 15;

function battleRows(
  list: RankedBattle[],
  valueOnly: boolean,
  r: ClanResolvers,
  nowTick?: number,
): ElderCell[][] {
  const when = (b: RankedBattle): ElderCell =>
    nowTick === undefined ? `turn ${fmt(b.tick)}` : agoFromTick(b.tick, nowTick);
  return list.slice(0, CLASH_TOP).map((b, i) =>
    valueOnly
      ? [i + 1, b.attacker, r.byTag(b.attackerTag), b.defender, r.byTag(b.defenderTag), fmt(b.value), when(b)]
      : [i + 1, b.attacker, r.byTag(b.attackerTag), b.defender, r.byTag(b.defenderTag), fmt(b.atkLost), fmt(b.defLost), fmt(b.value), when(b)],
  );
}

export function battleTables(records: EraRecords, r: ClanResolvers = PLAIN, nowTick?: number): ElderTable[] {
  const tables: ElderTable[] = [];
  if (records.richestAttacks.length) {
    tables.push({
      title: "Richest Attacks",
      note: "the greatest hauls of gold taken by force",
      headers: ["#", "Attacker", "Clan", "Defender", "Clan", "Gold taken", "When"],
      numeric: [0, 5],
      rows: battleRows(records.richestAttacks, true, r, nowTick),
    });
  }
  if (records.richestRaids.length) {
    tables.push({
      title: "Richest Raids",
      note: "the fattest wagons of plunder hauled home",
      headers: ["#", "Attacker", "Clan", "Defender", "Clan", "Resources", "When"],
      numeric: [0, 5],
      rows: battleRows(records.richestRaids, true, r, nowTick),
    });
  }
  if (records.bloodiestAttacks.length) {
    tables.push({
      title: "Bloodiest Attacks",
      note: "the clashes with the most fallen on both sides",
      headers: ["#", "Attacker", "Clan", "Defender", "Clan", "Atk lost", "Def lost", "Total", "When"],
      numeric: [0, 5, 6, 7],
      rows: battleRows(records.bloodiestAttacks, false, r, nowTick),
    });
  }
  const wars = topWars(records, CLASH_TOP);
  if (wars.length) {
    tables.push({
      title: "Greatest Wars",
      note: "the mightiest clan-against-clan wars, by regulars felled",
      headers: ["#", "Aggressor", "Target", "Kills", "Rival kills", "Total"],
      numeric: [0, 3, 4, 5],
      rows: wars.map((w, i) => [i + 1, r.byName(w.n1), r.byName(w.n2), fmt(w.v1), fmt(w.v2), fmt(w.total)]),
    });
  }
  const feuds = topFeuds(records, CLASH_TOP);
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

function clanSnapshotScore(world: World, memberIds: string[]): number {
  return memberIds.reduce((s, id) => (world.players[id] ? s + rankingScore(world.players[id]) : s), 0);
}

// ── Champion picking ─────────────────────────────────────────────────────────

interface Champ {
  label: string; // the feat
  epithet: string; // "the Plunderer"
  value: (p: Player, f?: PlayerFeats) => number;
  /** How the total reads on the card. Defaults to a plain formatted number —
   *  override when the raw figure is not the thing a player cares about. */
  format?: (v: number) => string;
  /**
   * Tallied in the open but held ANONYMOUS until the age is sealed.
   *
   * Some titles are a scouting report with a ribbon on it. "Most siege damage
   * caused" names the empire with the engines; "most research" names the one
   * worth stealing from; the spy titles name the empires running covert
   * programmes — all things the game otherwise charges spy turns to learn. The
   * standings still show (so you can see whether you are near the top of one),
   * but the names arrive only when the age can no longer be fought.
   */
  secret?: boolean;
}

/**
 * How deep each title is tallied. A title used to be one name and a number,
 * which answered "who holds it" but never "am I close" — and being close is the
 * whole reason to chase one. The card shows the top three and opens to all ten.
 */
export const TITLE_CONTENDERS = 10;

/**
 * Every title as a small leaderboard: `TITLE_CONTENDERS` rows per feat, best
 * first, all carrying the same epithet so the card renderer can group them.
 *
 * A sealed age's lore tables carry ONE row per epithet and go through the same
 * renderer — grouping by epithet means those still draw correctly as
 * single-holder cards, with no second code path.
 */
function crownRows(
  players: Player[],
  records: EraRecords | undefined,
  clanCell: (id?: string) => ElderCell,
  specs: Champ[],
  /** True once the age is won — a sealed age reveals every name. */
  reveal = true,
): ElderCell[][] {
  const feats = records?.feats ?? {};
  const rows: ElderCell[][] = [];
  for (const spec of specs) {
    const ranked = players
      .map((p) => ({ p, v: spec.value(p, feats[p.id]) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, TITLE_CONTENDERS);
    const hide = spec.secret && !reveal;
    for (const { p, v } of ranked) {
      // An empty name is the "sealed" signal the card renderer reads. The id is
      // never emitted either — a blank row that still linked to a clan page
      // would give the whole thing away.
      rows.push([hide ? `, ${spec.epithet}` : `${p.name}, ${spec.epithet}`, hide ? "" : clanCell(p.clanId), spec.label, spec.format ? spec.format(v) : fmt(v)]);
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
  // A won age hides nothing: the war it could have influenced is over.
  const reveal = Boolean(world.meta.winner);
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
    { label: "Most siege damage caused", epithet: "the Siege Master", value: (_p, f) => f?.siegeDamage ?? 0, secret: true },
    {
      // Ranked on the raw ledger (the ordering is identical either way, since
      // the bonus is linear in points) but SHOWN as what those points buy —
      // "+64.8%" tells a rival something; "3,240,118" is a number.
      label: "Most experienced army",
      epithet: "the Undefeatable",
      value: (p) => Math.round(p.army.experiencePoints),
      format: (v) => `+${(veterancyBonus(v) * 100).toFixed(1)}% · ${fmt(v)} pts`,
    },
    { label: "Strongest empire-less ruler", epithet: "the Black Knight", value: (p) => (p.clanId ? 0 : rankingScore(p)) },
    // Sabotage and arson are war — fought without a banner and paid for in spy
    // turns, but war. They sat under "civil feats" beside market sales and
    // gifts, which is not what burning a rival's granary is.
    { label: "Most spy damage caused", epithet: "the Saboteur", value: (_p, f) => f?.spyDamage ?? 0, secret: true },
    { label: "Most resources destroyed", epithet: "the Vandal", value: (_p, f) => f?.resourcesDestroyed ?? 0, secret: true },
  ], reveal);
  if (champions.length) {
    tables.push({
      title: "Champions of the Realms",
      note: "the champion of each feat of arms, open and covert",
      headers: ["Name", "Clan", "Feat", "Total"],
      numeric: [3],
      rows: champions,
    });
  }

  // Non-Battle Titles — the leader of each civil feat.
  const civil = crownRows(players, records, r.byId, [
    { label: "Most research", epithet: "the Wise", value: (p) => researchInvested(p), secret: true },
    { label: "Most market sales", epithet: "the Marketeer", value: (_p, f) => f?.marketSales ?? 0, secret: true },
    { label: "Most gold given away", epithet: "the Generous", value: (_p, f) => f?.goldGiven ?? 0 },
    { label: "Most resources given away", epithet: "the Bountiful", value: (_p, f) => f?.resourcesGiven ?? 0 },
    // the Wealthy, the Architect and the Populous are GONE (2026-08). The first
    // published a raiding list — "here is the fattest purse in the age" — and
    // the other two restated the ladder in a slower way: works and population
    // are already most of a ranking score. A title should be a deed, not a
    // standing invitation.
  ], reveal);
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
  if (records) tables.push(...battleTables(records, r, world.meta.tickNumber));

  return tables;
}

/** True when the age has no records worth showing yet (no deeds AND no empires). */
export function eraTablesEmpty(world: World): boolean {
  return Object.keys(world.players).length === 0 && eraRecordsEmpty(world.eraRecords);
}
