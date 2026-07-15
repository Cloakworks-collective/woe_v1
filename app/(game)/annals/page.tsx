import Link from "next/link";
import { ElderAgesIndex } from "@/components/ElderAges";
import { EraRecordsView } from "@/components/EraRecords";
import { Panel } from "@/components/Panel";
import { ToneGlyph } from "@/components/ToneGlyph";
import { timeAgo } from "@/components/timeAgo";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

export default async function AnnalsPage() {
  const { world } = await getGame();
  const live = world.chronicle ?? [];
  const archive = [...(world.chronicleArchive ?? [])].reverse(); // newest sealed age first

  return (
    <>
      <Panel
        title={`📜 The Annals of the Age — ${world.meta.eraName}`}
        info="The grand chronicle of the whole realm — crowns won and lost, wars declared, castles sacked. When the age ends, these Annals are sealed for good in the history books below."
      >
        <p style={{ fontSize: 12.5, marginBottom: 8 }}>
          <Link href="/annals/records">⚔ War Records</Link> ·{" "}
          <Link href="/chronicle">📖 Your Chronicle</Link>
        </p>
        {live.length === 0 ? (
          <p style={{ fontSize: 13.5, fontStyle: "italic" }}>The age is young; no great deeds are yet recorded.</p>
        ) : (
          <ul className="chron">
            {live.map((e, i) => (
              <li key={i} className={`chron-row tone-${e.tone}`}>
                <ToneGlyph tone={e.tone} />
                <span className="chron-line">{e.text}</span>
                <span className="chron-when" title={`turn ${e.tick}`}>
                  {timeAgo(e, world.meta)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="📚 Sealed Ages — the history books, kept for all time">
        {archive.length === 0 ? (
          <p style={{ fontSize: 13.5, fontStyle: "italic" }}>
            No age has yet ended. The first history is still being written.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {archive.map((age) => {
              const crown =
                age.winnerKind === "clan"
                  ? `Clan Victory — ${age.winnerName}`
                  : age.winnerName
                    ? `Grand Overlord — ${age.winnerName}`
                    : "ended without a victor";
              return (
                <details key={age.eraNumber} className="age-book">
                  <summary>
                    <b>{age.eraName}</b> <span className="age-crown">🏆 {crown}</span>{" "}
                    <span className="age-count">· {age.entries.length} entries</span>
                  </summary>
                  <div className="age-body">
                    {age.finalLadder.length > 0 && (
                      <p style={{ fontSize: 12.5, margin: "0 0 8px" }}>
                        <b>Final ladder:</b>{" "}
                        {age.finalLadder.slice(0, 5).map((l, i) => (
                          <span key={i}>
                            {i > 0 && " · "}
                            {i + 1}. {l.name} ({fmt(l.score)})
                          </span>
                        ))}
                      </p>
                    )}
                    <ul className="chron">
                      {age.entries.map((e, i) => (
                        <li key={i} className={`chron-row tone-${e.tone}`}>
                          <span className="chron-line">{e.text}</span>
                          <span className="chron-when">turn {e.tick.toLocaleString("en-US")}</span>
                        </li>
                      ))}
                    </ul>
                    {age.records && (
                      <>
                        <p style={{ fontSize: 12.5, fontWeight: 600, margin: "10px 0 4px" }}>
                          ⚔ War Records of the age
                        </p>
                        <EraRecordsView records={age.records} />
                      </>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="⚜ The Elder Ages — legends of the old realm">
        <ElderAgesIndex />
      </Panel>
    </>
  );
}
