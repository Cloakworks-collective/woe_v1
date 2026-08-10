import Link from "next/link";
import { TURN_MINUTES } from "@/lib/constants";
import type { PublicBattle } from "@/lib/engine";

const MODE_ICON: Record<string, string> = {
  raid: "🐎",
  siege: "🏰",
  revenge: "🗡",
  bombard: "💥",
};

/** "3h ago" from a turn number — a turn is TURN_MINUTES of real time. */
function whenAgo(tick: number, nowTick: number): string {
  const turns = Math.max(0, nowTick - tick);
  const mins = turns * TURN_MINUTES;
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ago`;
}

/**
 * The redacted battle rows every player may see — no composition, no loot.
 *
 * Deliberately four facts: who attacked, who defended, what it cost each side,
 * and when. Outcome and structural damage used to sit here too, but a public
 * feed is scanned rather than read, and "who hit whom, how badly, how recently"
 * is the whole question it is scanned for.
 */
export function PublicBattleTable({
  battles,
  highlightId,
  nowTick,
}: {
  battles: PublicBattle[];
  highlightId?: string;
  /** Current world tick, so times can read as "3h ago" instead of a number. */
  nowTick?: number;
}) {
  if (battles.length === 0) {
    return <p style={{ fontSize: 14.5, fontStyle: "italic" }}>No battles on record. Peace — for now.</p>;
  }
  return (
    <div className="tbl-scroll">
      <table className="tbl">
        <thead>
          <tr>
            <th>Attacker</th>
            <th>Defender</th>
            <th className="num">Attacker lost</th>
            <th className="num">Defender lost</th>
            <th className="num">When</th>
          </tr>
        </thead>
        <tbody>
          {battles.map((b) => {
            const name = (id: string, n: string) => (
              <Link href={`/empire/${id}`} style={id === highlightId ? { fontWeight: 700 } : undefined}>
                {n}
              </Link>
            );
            return (
              <tr key={b.id}>
                <td title={`${b.mode} attack`}>
                  {MODE_ICON[b.mode] ?? "⚔"} {name(b.attackerId, b.attackerName)}
                </td>
                <td>{name(b.defenderId, b.defenderName)}</td>
                <td className="num">{b.attackerTroopsLost.toLocaleString("en-US")}</td>
                <td className="num">{b.defenderTroopsLost.toLocaleString("en-US")}</td>
                <td className="num" style={{ whiteSpace: "nowrap", color: "var(--ink-soft)" }}>
                  {nowTick === undefined
                    ? `turn ${b.tick.toLocaleString("en-US")}`
                    : whenAgo(b.tick, nowTick)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
