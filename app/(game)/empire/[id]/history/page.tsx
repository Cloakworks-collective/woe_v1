import Link from "next/link";
import { notFound } from "next/navigation";
import { Art } from "@/components/Art";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { PublicBattleTable } from "@/components/PublicBattleTable";
import { ReqTip } from "@/components/CostTip";
import {
  ATTACK_HISTORY_HOURS,
  ATTACK_HISTORY_TICKS,
  RACE_NAMES,
  TICKS_PER_HOUR,
} from "@/lib/constants";
import {
  attacksByDefender,
  publicBattle,
  settlementTitle,
  summarizeAttackers,
  type AttackRecord,
} from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const MODE_ICON: Record<string, string> = {
  raid: "🐎",
  siege: "🏰",
  revenge: "🗡",
  bombard: "💥",
};

/** "3.5h ago" / "just now" — ticks are 10 minutes apart. */
function ago(tick: number, now: number): string {
  const hours = (now - tick) / TICKS_PER_HOUR;
  if (hours < 0.2) return "just now";
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  return `${hours.toFixed(1)}h ago`;
}

/** One aggressor/victim row: who, how many times, how recently, in what modes. */
function TallyTable({
  rows,
  records,
  now,
  who,
  empty,
}: {
  rows: { attackerId: string; attackerName: string; times: number; lastTick: number }[];
  records: AttackRecord[];
  now: number;
  who: string;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 14.5, fontStyle: "italic" }}>{empty}</p>;
  }
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>{who}</th>
          <th className="num">Times</th>
          <th>How</th>
          <th>Last</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const theirs = records.filter((x) => x.attackerId === r.attackerId);
          const modes = [...new Set(theirs.map((x) => x.mode))];
          const yields = theirs.filter((x) => x.yielded).length;
          return (
            <tr key={r.attackerId}>
              <td>
                <Link href={`/empire/${r.attackerId}`}>{r.attackerName}</Link>
              </td>
              <td className="num" style={{ fontWeight: r.times > 2 ? 700 : undefined }}>
                {r.times}
              </td>
              <td>
                {modes.map((m) => (
                  <span key={m} title={m} style={{ marginRight: 4 }}>
                    {MODE_ICON[m] ?? "⚔"}
                  </span>
                ))}
                <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>{modes.join(", ")}</span>
                {yields > 0 && (
                  <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                    {" "}
                    · {yields} yielded
                  </span>
                )}
              </td>
              <td style={{ whiteSpace: "nowrap", color: "var(--ink-soft)" }}>{ago(r.lastTick, now)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function EmpireHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { world } = await getGame();
  const p = world.players[id];
  if (!p) notFound();

  const tick = world.meta.tickNumber;

  // Everything here is public: the same facts the World News feed already
  // shows the whole realm, gathered per empire. No composition, no loot.
  const byDefender = attacksByDefender(world.battles, tick, ATTACK_HISTORY_TICKS);
  const suffered = byDefender.get(id) ?? [];
  const sufferedRows = summarizeAttackers(suffered);

  // The mirror: who this empire has been feeding on. Same window, roles flipped.
  const launched: AttackRecord[] = world.battles
    .filter((b) => b.attackerId === id && tick - b.tick <= ATTACK_HISTORY_TICKS)
    .map((b) => ({
      attackerId: b.defenderId,
      attackerName: b.defenderName,
      mode: b.mode,
      tick: b.tick,
      yielded: !!b.yielded,
    }))
    .sort((a, b) => b.tick - a.tick);
  const launchedRows = summarizeAttackers(launched);

  const window72 = world.battles
    .filter((b) => (b.attackerId === id || b.defenderId === id) && tick - b.tick <= ATTACK_HISTORY_TICKS)
    .map(publicBattle);

  // The battle log is a rolling world-wide 300. In a busy age it may not reach
  // the full window — say so rather than imply the quiet is real.
  const oldest = world.battles[world.battles.length - 1];
  const logTruncated = world.battles.length >= 300 && oldest && tick - oldest.tick < ATTACK_HISTORY_TICKS;

  return (
    <>
      <LearnLink href="/guide#battle">Attacking, raiding &amp; revenge</LearnLink>

      <Panel title={`War Record — ${p.name}, the ${settlementTitle(p)} (last ${ATTACK_HISTORY_HOURS}h)`}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ border: "1px solid var(--border-light)", background: "var(--panel-alt)", padding: 2 }}>
            <Art path={`races/${p.race}`} size={80} title={RACE_NAMES[p.race]} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, marginBottom: 6 }}>
              Attacked{" "}
              <b style={{ color: suffered.length > 0 ? "var(--warn)" : undefined }}>
                {suffered.length} time{suffered.length === 1 ? "" : "s"}
              </b>{" "}
              by <b>{sufferedRows.length}</b> empire{sufferedRows.length === 1 ? "" : "s"} · launched{" "}
              <b>{launched.length}</b> attack{launched.length === 1 ? "" : "s"} against{" "}
              <b>{launchedRows.length}</b>.
            </p>
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
              <ReqTip
                down
                heading="Why everyone can see this"
                body={`Battles are public knowledge — the heralds cry every raid across the realm. This page only gathers what the World News feed already shows: who struck whom, when, and how. Army composition, loot, and exact troop counts are never here; those cost spies.`}
              >
                <span className="tip-under">Public knowledge</span>
              </ReqTip>{" "}
              · <Link href={`/empire/${p.id}`}>← back to the profile</Link>
            </p>
          </div>
        </div>
      </Panel>

      <Panel title={`Who has struck ${p.name}`}>
        <TallyTable
          rows={sufferedRows}
          records={suffered}
          now={tick}
          who="Aggressor"
          empty={`No one has touched ${p.name} in the last ${ATTACK_HISTORY_HOURS} hours.`}
        />
      </Panel>

      <Panel title={`Whom ${p.name} has struck`}>
        <TallyTable
          rows={launchedRows}
          records={launched}
          now={tick}
          who="Victim"
          empty={`${p.name} has drawn no blood in the last ${ATTACK_HISTORY_HOURS} hours.`}
        />
      </Panel>

      <Panel title={`Every battle, newest first (${window72.length})`}>
        <PublicBattleTable battles={window72} highlightId={p.id} />
        {logTruncated && (
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>
            The world keeps only its last 300 battles, and the age has been busy — this record may
            not reach the full {ATTACK_HISTORY_HOURS} hours.
          </p>
        )}
        <p style={{ fontSize: 13.5, marginTop: 6 }}>
          <Link href="/battles">→ the World News feed</Link>
        </p>
      </Panel>
    </>
  );
}
