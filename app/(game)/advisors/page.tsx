import Link from "next/link";
import { Art } from "@/components/Art";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { ADVISORS, RACE_NAMES } from "@/lib/constants";
import { advisorFor } from "@/lib/constants/advisors";
import { advisorCounsel } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function AdvisorsPage() {
  const { player: p } = await getGame();
  const counsel = advisorCounsel(p);
  const race = RACE_NAMES[p.race];

  return (
    <>
      <LearnLink href="/guide#strategy">Strategy &amp; a veteran&apos;s counsel</LearnLink>
      <Panel title="The Council Chamber">
        <p style={{ fontSize: 14.5, lineHeight: 1.5 }}>
          Four voices of your own <b>{race}</b>, four appetites for your gold. They speak from your
          empire&apos;s real numbers — when two agree, listen; when all four shout at once, you are
          already in trouble. The red and amber banners atop every page are these same councillors;
          the <Link href="/guide">Field Manual</Link> holds the how.
        </p>
      </Panel>
      {ADVISORS.map((base) => {
        const a = advisorFor(base.key, p.race);
        return (
        <section
          className="panel advisor-card"
          key={a.key}
          id={a.key}
          style={{ scrollMarginTop: 12, borderLeft: `5px solid ${a.accent}` }}
        >
          <h3>{a.title}</h3>
          <div className="body advisor-body">
            <div className="advisor-portrait" style={{ borderColor: a.accent }}>
              <Art path={`advisors/${a.key}`} race={p.race} size={336} title={`${a.fullName} — ${race}`} />
            </div>
            <div className="advisor-words">
              <b className="advisor-name" style={{ color: a.accent }}>
                {a.person}
                <span className="advisor-office"> — {a.name}</span>
              </b>
              <div className="advisor-charge">{a.charge}</div>
              <ul className="advisor-counsel">
                {counsel[a.key].map((line, i) => (
                  <li key={i} style={{ ["--advisor-accent" as string]: a.accent }}>
                    {line}
                  </li>
                ))}
              </ul>
              <p style={{ marginTop: 10, marginBottom: 0 }}>
                <Link className="learn-link" href={a.guide}>
                  📜 Field Manual: {a.guideLabel} →
                </Link>
              </p>
            </div>
          </div>
          </section>
        );
      })}
    </>
  );
}
