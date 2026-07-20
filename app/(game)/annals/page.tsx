import Link from "next/link";
import { ElderAgesIndex } from "@/components/ElderAges";
import { EraRecordsView } from "@/components/EraRecords";
import { Panel } from "@/components/Panel";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

// The Annals hold only what is finished: sealed ages and the elder legends.
// The living age is chronicled on World News; its war records tally on the
// Rankings side until the era turns and they are bound in here.
export default async function AnnalsPage() {
  const { world } = await getGame();
  const archive = [...(world.chronicleArchive ?? [])].reverse(); // newest sealed age first

  return (
    <>
      <p style={{ margin: "0 0 8px", fontSize: 13.5 }}>
        The age still burning is elsewhere: <Link href="/battles">🌍 World News</Link> ·{" "}
        <Link href="/rankings/records">⚔ War Records ({world.meta.eraName})</Link>
      </p>

      <Panel
        title="📚 The Annals — sealed ages, kept for all time"
        info="The finished history of the realm. Each age, once ended, is bound here for good — its chronicle, its final ladder, and its war records. Nothing of the current age appears until it is sealed."
      >
        {archive.length === 0 ? (
          <p style={{ fontSize: 14.5, fontStyle: "italic" }}>
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
                      <p style={{ fontSize: 13.5, margin: "0 0 8px" }}>
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
                        <p style={{ fontSize: 13.5, fontWeight: 600, margin: "10px 0 4px" }}>
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
