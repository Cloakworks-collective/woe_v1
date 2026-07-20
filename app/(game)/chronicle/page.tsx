import Link from "next/link";
import { Pager } from "@/components/Pager";
import { Panel } from "@/components/Panel";
import { ToneGlyph } from "@/components/ToneGlyph";
import { eventLine, eventTone } from "@/components/eventLine";
import { timeAgo } from "@/components/timeAgo";
import { paginate } from "@/lib/paginate";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const TIDINGS_PER_PAGE = 25;
const BATTLES_PER_PAGE = 20;

export default async function ChroniclePage({
  searchParams,
}: {
  searchParams: Promise<{ tp?: string; bp?: string }>;
}) {
  const { tp, bp } = await searchParams;
  const { world, player: p } = await getGame();
  const inbox = world.inbox[p.id] ?? [];
  const meta = world.meta;
  const myBattles = world.battles.filter((b) => b.attackerId === p.id || b.defenderId === p.id);

  const tidings = paginate(inbox, tp, TIDINGS_PER_PAGE);
  const battles = paginate(myBattles, bp, BATTLES_PER_PAGE);
  const tHref = (n: number) => `/chronicle?tp=${n}${bp ? `&bp=${bp}` : ""}#tidings`;
  const bHref = (n: number) => `/chronicle?bp=${n}${tp ? `&tp=${tp}` : ""}#ledger`;

  return (
    <>
      <Panel
        title={`The Chronicle of ${p.name} — as the scribes have set it down`}
        info="Your own tidings and battles. For the wider realm — clan wars and who is falling upon whom — ride to the World News."
      >
        <span id="tidings" />
        {inbox.length === 0 ? (
          <p style={{ fontSize: 14.5, fontStyle: "italic" }}>
            The vellum is yet unmarked. Go forth and make history worth the ink.
          </p>
        ) : (
          <>
            <ul className="chron">
              {tidings.shown.map((item, i) => {
                const battleId =
                  item.event.type === "attacked" || item.event.type === "battleResult"
                    ? item.event.battleId
                    : null;
                return (
                  <li key={tidings.start + i} className={`chron-row tone-${eventTone(item.event)}`}>
                    <ToneGlyph tone={eventTone(item.event)} />
                    <span className="chron-line">
                      {eventLine(item.event)}
                      {battleId && (
                        <>
                          {" "}
                          <Link href={`/rankings?report=${battleId}`}>[the full account]</Link>
                        </>
                      )}
                    </span>
                    <span className="chron-when" title={`turn ${item.tick}`}>
                      {timeAgo(item, meta)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <Pager page={tidings} href={tHref} noun="tidings" />
          </>
        )}
      </Panel>

      <Panel title="The Ledger of Battles — every blow struck and taken">
        <span id="ledger" />
        {myBattles.length === 0 ? (
          <p style={{ fontSize: 14.5, fontStyle: "italic" }}>No blood has yet been spilled in your name.</p>
        ) : (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Battle</th>
                  <th>Victor</th>
                  <th className="num">Their losses</th>
                  <th className="num">Our losses</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {battles.shown.map((b) => {
                  const mine = b.attackerId === p.id ? b.attackerLosses : b.defenderLosses;
                  const theirs = b.attackerId === p.id ? b.defenderLosses : b.attackerLosses;
                  const sum = (l: typeof mine) =>
                    l.footmen + l.archers + l.cavalry + l.engineers + l.warriors + l.mercenaries;
                  const won = b.victor === (b.attackerId === p.id ? "attacker" : "defender");
                  return (
                    <tr key={b.id}>
                      <td style={{ color: "var(--ink-soft)", whiteSpace: "nowrap" }} title={`turn ${b.tick}`}>
                        {timeAgo(b, meta)}
                      </td>
                      <td>
                        {b.attackerName} {b.mode === "siege" ? "storms the castle of" : `${b.mode}s`}{" "}
                        {b.defenderName}
                      </td>
                      <td style={{ color: b.victor === "none" ? undefined : won ? "var(--pos)" : "var(--neg)", fontWeight: 700 }}>
                        {b.victor === "none" ? "— a draw —" : b.victor === "attacker" ? b.attackerName : b.defenderName}
                      </td>
                      <td className="num" style={{ color: "var(--pos)" }}>{sum(theirs)}</td>
                      <td className="num" style={{ color: "var(--neg)" }}>{sum(mine)}</td>
                      <td>
                        <Link href={`/rankings?report=${b.id}`}>report</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager page={battles} href={bHref} noun="battles" />
          </>
        )}
      </Panel>
    </>
  );
}
