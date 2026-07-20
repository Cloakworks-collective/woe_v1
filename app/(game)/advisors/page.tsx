import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { Art } from "@/components/Art";
import { Panel } from "@/components/Panel";
import { RACE_NAMES } from "@/lib/constants";
import { advisorReport } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Prefer the race-specific advisor portrait; fall back to the generic one if
 *  that race's art hasn't been generated yet (so the page is never broken). */
function advisorArt(race: string, key: string): string {
  const rel = `advisors/${race}/${key}`;
  return existsSync(join(process.cwd(), "public", "art", `${rel}.png`)) ? rel : `advisors/${key}`;
}

const ADVISORS = [
  {
    key: "defensive" as const,
    name: "The Warden",
    title: "Defensive Advisor",
    charge: "Walls, repairs, and the art of not being sacked.",
    accent: "var(--steel)",
    guide: "/guide#defense",
    guideLabel: "Defending the Realm",
  },
  {
    key: "military" as const,
    name: "The Warlord",
    title: "Military Advisor",
    charge: "Troop readiness, stamina, and when to march.",
    accent: "var(--warn)",
    guide: "/guide#battle",
    guideLabel: "Battle Strategies",
  },
  {
    key: "economic" as const,
    name: "The Treasurer",
    title: "Economic Advisor",
    charge: "Production, taxes, and the weakest link in the chain.",
    accent: "var(--coin)",
    guide: "/guide#grow",
    guideLabel: "How to Grow",
  },
  {
    key: "population" as const,
    name: "The Steward",
    title: "Population Advisor",
    charge: "Housing, growth, and keeping the peasants from walking.",
    accent: "var(--pos)",
    guide: "/guide#grow",
    guideLabel: "How to Grow",
  },
];

export default async function AdvisorsPage() {
  const { player: p } = await getGame();
  const report = advisorReport(p);
  const race = RACE_NAMES[p.race];

  return (
    <>
      <Panel title="The Council Chamber">
        <p style={{ fontSize: 15.5, lineHeight: 1.5 }}>
          Four voices of your own <b>{race}</b>, four appetites for your gold. They speak from your
          empire&apos;s real numbers — when two agree, listen; when all four shout at once, you are
          already in trouble. The red and amber banners atop every page are these same councillors
          calling for your attention; follow one here for the full counsel, then to the{" "}
          <Link href="/guide">Field Manual</Link> for the how.
        </p>
      </Panel>
      <div className="panel-row">
        {ADVISORS.map((a) => (
          <section
            className="panel"
            key={a.key}
            id={a.key}
            style={{ scrollMarginTop: 12, borderLeft: `5px solid ${a.accent}` }}
          >
            <h3>{a.title}</h3>
            <div className="body" style={{ display: "flex", gap: 16 }}>
              <div
                style={{
                  border: `2px solid ${a.accent}`,
                  background: "var(--panel-alt)",
                  padding: 3,
                  alignSelf: "flex-start",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.22)",
                }}
              >
                <Art path={advisorArt(p.race, a.key)} size={168} title={`${a.name} — ${race}`} />
              </div>
              <div style={{ flex: 1 }}>
                <b style={{ font: "700 19.5px Georgia", color: a.accent }}>{a.name}</b>
                <div style={{ fontSize: 13.5, fontStyle: "italic", color: "var(--ink-soft)", marginBottom: 8 }}>
                  {a.charge}
                </div>
                <p style={{ fontSize: 17.5, lineHeight: 1.5, color: a.accent, fontWeight: 600 }}>
                  “{report[a.key]}”
                </p>
                <p style={{ marginTop: 10 }}>
                  <Link className="learn-link" href={a.guide}>
                    📜 Field Manual: {a.guideLabel} →
                  </Link>
                </p>
              </div>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
