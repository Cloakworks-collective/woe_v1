import Link from "next/link";
import { Art } from "@/components/Art";
import { Panel } from "@/components/Panel";
import { advisorReport } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const ADVISORS = [
  {
    key: "defensive" as const,
    name: "Marshal Aldric",
    title: "Defensive Advisor",
    charge: "Walls, repairs, and the art of not being sacked.",
    guide: "/guide#defense",
    guideLabel: "Defending the Realm",
  },
  {
    key: "military" as const,
    name: "General Vosk",
    title: "Military Advisor",
    charge: "Troop readiness, stamina, and when to march.",
    guide: "/guide#battle",
    guideLabel: "Battle Strategies",
  },
  {
    key: "economic" as const,
    name: "Treasurer Poll",
    title: "Economic Advisor",
    charge: "Production, taxes, and the weakest link in the chain.",
    guide: "/guide#grow",
    guideLabel: "How to Grow",
  },
  {
    key: "population" as const,
    name: "Steward Maren",
    title: "Population Advisor",
    charge: "Housing, growth, and keeping the peasants from walking.",
    guide: "/guide#grow",
    guideLabel: "How to Grow",
  },
];

export default async function AdvisorsPage() {
  const { player: p } = await getGame();
  const report = advisorReport(p);

  return (
    <>
      <Panel title="The Council Chamber">
        <p style={{ fontSize: 13.5 }}>
          Four voices, four appetites for your gold. They speak from your empire&apos;s real
          numbers — when two agree, listen; when all four shout at once, you are already in
          trouble. The red and amber banners atop every page are these same councillors calling for
          your attention; follow one here for the full counsel, then to the{" "}
          <Link href="/guide">Field Manual</Link> for the how.
        </p>
      </Panel>
      <div className="panel-row">
        {ADVISORS.map((a) => (
          <section className="panel" key={a.key} id={a.key} style={{ scrollMarginTop: 12 }}>
            <h3>{a.title}</h3>
            <div className="body" style={{ display: "flex", gap: 12 }}>
              <div
                style={{
                  border: "2px solid var(--border)",
                  background: "var(--panel-alt)",
                  padding: 3,
                  alignSelf: "flex-start",
                }}
              >
                <Art path={`advisors/${a.key}`} size={104} title={a.name} />
              </div>
              <div>
                <b style={{ font: "700 14px Georgia", color: "var(--heading)" }}>{a.name}</b>
                <div style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--ink-soft)", marginBottom: 6 }}>
                  {a.charge}
                </div>
                <p style={{ fontSize: 13.5 }}>“{report[a.key]}”</p>
                <p style={{ marginTop: 8 }}>
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
