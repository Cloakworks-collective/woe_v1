// The Records of the Age as a trophy hall: the Victors' Dais (top three rulers
// under a hand-drawn laurel), swallowtail pennant chapter banners, and the
// title-holders recast as charter cards. All drawn in the game's two tinctures —
// gold for glory, oxblood for war — over the same parchment as everything else.

import Link from "next/link";
import { Art } from "./Art";
import { LeaderTable } from "./ElderAges";
import type { ElderCell, ElderTable } from "@/lib/lore/elderAges";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/* ── Hand-drawn marks (one house style: 1.6 stroke, round caps, 24-grid) ── */

/** A laurel wreath — two mirrored branches cupping the champion. */
export function LaurelSVG({ className }: { className?: string }) {
  const leaves = [0, 1, 2, 3, 4].map((i) => {
    const t = i / 4;
    const angle = -150 + t * 115; // sweep up the left branch
    const rad = (angle * Math.PI) / 180;
    const cx = 50 + 41 * Math.cos(rad);
    const cy = 54 + 41 * Math.sin(rad);
    const rot = angle + 125;
    return { cx, cy, rot, s: 1 - t * 0.25 };
  });
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {/* stems */}
        <path d="M 15 62 A 40 40 0 0 1 46 15" />
        <path d="M 85 62 A 40 40 0 0 0 54 15" />
        {/* left leaves, then mirrored right */}
        {leaves.map((l, i) => (
          <g key={i}>
            <path
              d={`M ${l.cx} ${l.cy} q ${5 * l.s} ${-7 * l.s} 0 ${-13 * l.s} q ${-5 * l.s} ${6 * l.s} 0 ${13 * l.s} Z`}
              transform={`rotate(${l.rot} ${l.cx} ${l.cy})`}
              fill="currentColor"
              fillOpacity="0.22"
            />
            <path
              d={`M ${100 - l.cx} ${l.cy} q ${-5 * l.s} ${-7 * l.s} 0 ${-13 * l.s} q ${5 * l.s} ${6 * l.s} 0 ${13 * l.s} Z`}
              transform={`rotate(${-l.rot} ${100 - l.cx} ${l.cy})`}
              fill="currentColor"
              fillOpacity="0.22"
            />
          </g>
        ))}
        {/* ribbon knot at the base */}
        <path d="M 44 88 q 6 4 12 0 M 46 89 l -4 7 M 54 89 l 4 7" />
      </g>
    </svg>
  );
}

/** Chapter marks — crown, laurel sprig, crossed swords. Same hand as above. */
function ChapterMark({ kind }: { kind: "crown" | "sprig" | "swords" }) {
  return (
    <svg viewBox="0 0 24 24" className="chapter-mark" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {kind === "crown" && (
          <>
            <path d="M 4 17 L 4 8.5 L 8.5 12.5 L 12 6 L 15.5 12.5 L 20 8.5 L 20 17 Z" />
            <path d="M 4 19.5 H 20" />
          </>
        )}
        {kind === "sprig" && (
          <>
            <path d="M 6 20 Q 12 14 15 4" />
            <path d="M 9.5 15.5 q 4.5 -1.5 5 -5.5 q -4.5 1.5 -5 5.5 Z" fill="currentColor" fillOpacity="0.22" />
            <path d="M 8 18.5 q 4.8 0.3 7.4 -2.8 q -4.8 -0.3 -7.4 2.8 Z" fill="currentColor" fillOpacity="0.22" />
            <path d="M 12.5 11 q 3.8 -0.8 5 -4.4 q -3.9 0.8 -5 4.4 Z" fill="currentColor" fillOpacity="0.22" />
          </>
        )}
        {kind === "swords" && (
          <>
            <path d="M 5 4 L 16.5 15.5 M 19 18 l -2.5 -2.5 M 15.5 18.5 L 19.5 14.5" />
            <path d="M 19 4 L 7.5 15.5 M 5 18 l 2.5 -2.5 M 8.5 18.5 L 4.5 14.5" />
          </>
        )}
      </g>
    </svg>
  );
}

/* ── The Victors' Dais — the signature ──────────────────────────────────── */

export interface DaisEntry {
  name: string;
  race: string; // engine id, for pixel art
  raceLabel: string;
  clanName?: string;
  clanHref?: string;
  score: number;
}

export function VictorsDais({ top, eraName }: { top: DaisEntry[]; eraName: string }) {
  if (top.length === 0) return null;
  const order: { entry?: DaisEntry; place: 1 | 2 | 3 }[] = [
    { entry: top[1], place: 2 },
    { entry: top[0], place: 1 },
    { entry: top[2], place: 3 },
  ];
  const PLACE_WORD = { 1: "First of the Age", 2: "Second", 3: "Third" } as const;
  return (
    <div className="dais" aria-label={`The three greatest rulers of ${eraName}`}>
      <div className="dais-row">
        {order.map(({ entry, place }) =>
          entry ? (
            <div key={place} className={`dais-col place-${place}`}>
              <div className="dais-plaque">
                {place === 1 && <LaurelSVG className="dais-laurel" />}
                <span className="dais-portrait">
                  <Art path={`races/${entry.race}`} size={place === 1 ? 92 : 68} title={entry.raceLabel} />
                </span>
                <span className="dais-glint" aria-hidden="true" />
              </div>
              <div className="dais-name">{entry.name}</div>
              <div className="dais-sub">
                {entry.clanHref && entry.clanName ? (
                  <Link href={entry.clanHref}>{entry.clanName}</Link>
                ) : (
                  (entry.clanName ?? "no banner")
                )}
                {" · "}
                {entry.raceLabel}
              </div>
              <div className={`dais-step step-${place}`}>
                <span className="dais-place">{PLACE_WORD[place]}</span>
                <span className="dais-score">{fmt(entry.score)} pts</span>
              </div>
            </div>
          ) : (
            <div key={place} className={`dais-col place-${place} dais-empty-col`} aria-hidden="true" />
          ),
        )}
      </div>
    </div>
  );
}

/* ── Pennant chapter banner ─────────────────────────────────────────────── */

export function ChapterHead({
  mark,
  title,
  note,
  tone = "gold",
}: {
  mark: "crown" | "sprig" | "swords";
  title: string;
  note: string;
  tone?: "gold" | "blood";
}) {
  return (
    <div className={`chapter-head chapter-${tone}`}>
      <span className="chapter-pennant">
        <ChapterMark kind={mark} />
        {title}
      </span>
      <span className="chapter-note">{note}</span>
    </div>
  );
}

/* ── Charter cards — the title-holders, epithet first ───────────────────── */

const cellText = (c: ElderCell): string => (typeof c === "object" && c !== null ? c.text : String(c));

/**
 * An emblem for each title. The Hall was a wall of near-identical cards you had
 * to READ to tell apart; a glyph makes each one recognisable at a glance and
 * gives the epithet something to be about. Falls back to the trophy for any
 * title added later, so a new feat is never iconless.
 */
const TITLE_ICON: Record<string, string> = {
  "the Slayer": "skull",
  "the Defender": "castle",
  "the Plunderer": "coin",
  "the Raider": "caravan",
  "the Empire Destroyer": "blast",
  "the Siege Master": "siege",
  "the Undefeatable": "star",
  "the Black Knight": "banner",
  "the Wise": "research",
  "the Marketeer": "market",
  "the Generous": "heart",
  "the Bountiful": "seedling",
  "the Saboteur": "spyglass",
  "the Vandal": "fire",
  "the Populous": "workers",
  "the Architect": "build",
  "the Wealthy": "coin",
};
const titleIcon = (epithet: string) => TITLE_ICON[epithet] ?? "trophy";

export function CharterCards({ table }: { table: ElderTable }) {
  // Rows arrive as [ "Name, the Epithet", clanCell, feat, total ].
  return (
    <div className="charter-grid">
      {table.rows.map((row, i) => {
        const [holder, clan, feat, total] = row;
        const holderText = cellText(holder);
        const comma = holderText.indexOf(", ");
        const name = comma >= 0 ? holderText.slice(0, comma) : holderText;
        const epithet = comma >= 0 ? holderText.slice(comma + 2) : "";
        const clanIsLink = typeof clan === "object" && clan !== null;
        return (
          // The stagger is an index-driven delay, so the cards deal onto the
          // table in order rather than all appearing at once.
          <div className="charter" key={i} style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
            <div className="charter-epithet">
              <img
                src={`/art/ui/icons/${titleIcon(epithet)}.png`}
                alt=""
                className="charter-mark"
                aria-hidden="true"
              />
              {epithet || name}
            </div>
            <div className="charter-holder">
              {name}
              {clanIsLink ? (
                <>
                  {" · "}
                  <Link href={(clan as { href: string }).href}>{cellText(clan)}</Link>
                </>
              ) : cellText(clan) ? (
                ` · ${cellText(clan)}`
              ) : null}
            </div>
            <div className="charter-feat">
              <span>{cellText(feat)}</span>
              <b>{cellText(total)}</b>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Chapter assembly for the live page & sealed ages ───────────────────── */

const CHAPTERS: {
  key: string;
  mark: "crown" | "sprig" | "swords";
  title: string;
  note: string;
  tone: "gold" | "blood";
  tables: string[]; // matched by ElderTable.title
  charter?: string[]; // of those, which render as charter cards
}[] = [
  // NOTE: "Greatest Rulers" and "Strongest Empires" are deliberately absent.
  // They are the empire and clan ladders, and those already have pages of their
  // own — repeating them here made the Hall open with two tables you had just
  // scrolled past. They are still BUILT (buildEraTables) so a sealed age keeps
  // its final standings in the Annals, which is the one place they have no
  // other home. What stays is the superlative the ladder cannot show: the
  // strongest ruler of each race.
  {
    key: "standing",
    mark: "crown",
    title: "The Standing",
    note: "the mightiest of each people",
    tone: "gold",
    tables: ["Lords & Ladies of the Realm"],
  },
  {
    key: "titles",
    mark: "sprig",
    title: "The Titles",
    note: "the named champions of every feat",
    tone: "gold",
    tables: ["Champions of the Realms", "Non-Battle Titles"],
    charter: ["Champions of the Realms", "Non-Battle Titles"],
  },
  {
    key: "clashes",
    mark: "swords",
    title: "The Clashes",
    note: "the richest, bloodiest and bitterest",
    tone: "blood",
    tables: ["Richest Attacks", "Richest Raids", "Bloodiest Attacks", "Greatest Wars", "Greatest Feuds"],
  },
];

const EXCLUDED = new Set(["Greatest Rulers", "Strongest Empires"]);

/** The full hall: dais + three chapters. `tables` comes from buildEraTables. */
export function RecordsHall({ tables, dais, eraName }: { tables: ElderTable[]; dais: DaisEntry[]; eraName: string }) {
  const byTitle = new Map(tables.map((t) => [t.title, t]));
  const known = new Set(CHAPTERS.flatMap((c) => c.tables));
  // Stray tables (claimed by no chapter) still render, so a newly-added board
  // is never silently invisible. These two are the exception: they are the
  // empire and clan LADDERS, which have pages of their own, and dropping them
  // from a chapter would otherwise just move them to the bottom of this page.
  // They are still built, so the Annals keep a sealed age's final standings.
  const stray = tables.filter((t) => !known.has(t.title) && !EXCLUDED.has(t.title));
  return (
    <div className="records-hall">
      <VictorsDais top={dais} eraName={eraName} />
      {CHAPTERS.map((ch) => {
        const present = ch.tables.map((t) => byTitle.get(t)).filter((t): t is ElderTable => Boolean(t));
        if (present.length === 0) return null;
        return (
          <section key={ch.key} className={`records-chapter records-${ch.tone}`}>
            <ChapterHead mark={ch.mark} title={ch.title} note={ch.note} tone={ch.tone} />
            <div>
              {present.map((t) =>
                ch.charter?.includes(t.title) ? (
                  <div key={t.title} className="charter-block">
                    <div className="elder-table-title">
                      {t.title}
                      {t.note && <span className="elder-table-note"> — {t.note}</span>}
                    </div>
                    <CharterCards table={t} />
                  </div>
                ) : (
                  <LeaderTable key={t.title} t={t} />
                ),
              )}
            </div>
          </section>
        );
      })}
      {stray.map((t) => (
        <LeaderTable key={t.title} t={t} />
      ))}
    </div>
  );
}
