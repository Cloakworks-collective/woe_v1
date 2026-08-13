import Link from "next/link";
import { LearnLink } from "@/components/LearnLink";
import { Pager } from "@/components/Pager";
import { Panel } from "@/components/Panel";
import { ToneGlyph } from "@/components/ToneGlyph";
import { timeAgo } from "@/components/timeAgo";
import { paginate } from "@/lib/paginate";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const ENTRIES_PER_PAGE = 30;

/**
 * This page is the CHRONICLE, and nothing else.
 *
 * It used to carry three panels — the wars afoot, the latest battles, and the
 * chronicle — which read as three answers to one question. Two of them already
 * live where they belong: clan wars are on the clan pages and the clan ladder,
 * and a battle you care about is on the empire's own profile with the full
 * record. What has no other home is the age's story in order, so that is all
 * that is left here — filterable, because "what happened" and "who took a
 * crown" are different questions and the second one drowns in the first.
 *
 * `tone` is an open-ended string set by whoever writes the entry. The filter is
 * built from the tones actually PRESENT, so a newly-added kind of event appears
 * as a filter on its own rather than being silently unfilterable.
 */
const TONE_LABEL: Record<string, { label: string; icon: string }> = {
  crown: { label: "Crowns & ages", icon: "👑" },
  war: { label: "Wars", icon: "⚔" },
  danger: { label: "Castles sacked", icon: "🏰" },
  clan: { label: "Banners", icon: "🛡" },
  shadow: { label: "The shadows", icon: "🗡" },
  trade: { label: "Trade", icon: "⚖" },
  growth: { label: "The realm grows", icon: "🌱" },
  info: { label: "Tidings", icon: "📜" },
};
const toneLabel = (t: string) => TONE_LABEL[t] ?? { label: t, icon: "📜" };

export default async function WorldNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ cpage?: string; kind?: string }>;
}) {
  const { cpage, kind } = await searchParams;
  const { world } = await getGame();

  const chronicle = world.chronicle ?? [];
  // Counts come from the WHOLE chronicle, not the filtered view — a filter that
  // reports "0" for every other kind once you have picked one is useless.
  const counts = new Map<string, number>();
  for (const e of chronicle) counts.set(e.tone, (counts.get(e.tone) ?? 0) + 1);
  const kinds = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const active = kind && counts.has(kind) ? kind : undefined;

  const shown = active ? chronicle.filter((e) => e.tone === active) : chronicle;
  const paged = paginate(shown, cpage, ENTRIES_PER_PAGE);
  const href = (n: number) => `/battles?${active ? `kind=${active}&` : ""}cpage=${n}`;

  return (
    <>
      <LearnLink href="/guide#battle">How battles &amp; wars are fought</LearnLink>
      <Panel
        title={`📜 The Grand Chronicle — ${world.meta.eraName}`}
        info="The whole realm's story as it happens — crowns won and lost, wars declared, castles sacked. When the age ends this chronicle is sealed into the Annals for good. Army composition and plunder stay with the combatants: send scouts and spies if you would know more, and ride to your own Chronicle for your story."
      >
        <p style={{ fontSize: 13.5, marginBottom: 8 }}>
          <Link href="/rankings/records">⚔ War Records of this age</Link> ·{" "}
          <Link href="/annals">📚 The Annals — sealed ages</Link>
        </p>

        {kinds.length > 1 && (
          <nav className="chron-filter" aria-label="Filter the chronicle">
            <Link href="/battles" className={active ? undefined : "is-on"} aria-current={active ? undefined : "page"}>
              All <span className="chron-filter-n">{chronicle.length}</span>
            </Link>
            {kinds.map((t) => {
              const { label, icon } = toneLabel(t);
              return (
                <Link
                  key={t}
                  href={`/battles?kind=${t}`}
                  className={active === t ? "is-on" : undefined}
                  aria-current={active === t ? "page" : undefined}
                >
                  {icon} {label} <span className="chron-filter-n">{counts.get(t)}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {paged.shown.length === 0 ? (
          <p style={{ fontSize: 14.5, fontStyle: "italic" }}>
            {active
              ? `Nothing of that kind is recorded yet in ${world.meta.eraName}.`
              : "The age is young; no great deeds are yet recorded."}
          </p>
        ) : (
          <ul className="chron">
            {paged.shown.map((e, i) => (
              <li key={`${e.tick}-${i}`} className={`chron-row tone-${e.tone}`}>
                <ToneGlyph tone={e.tone} />
                <span className="chron-line">{e.text}</span>
                <span className="chron-when" title={`turn ${e.tick}`}>
                  {timeAgo(e, world.meta)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {shown.length > 0 && <Pager page={paged} href={href} noun="entries" />}
      </Panel>
    </>
  );
}
