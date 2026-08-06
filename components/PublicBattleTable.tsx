import Link from "next/link";
import type { PublicBattle } from "@/lib/engine";

const MODE_ICON: Record<string, string> = {
  raid: "🐎",
  siege: "🏰",
  revenge: "🗡",
  bombard: "💥",
};

/** The redacted battle rows every player may see (no composition, no loot). */
export function PublicBattleTable({ battles, highlightId }: { battles: PublicBattle[]; highlightId?: string }) {
  if (battles.length === 0) {
    return <p style={{ fontSize: 14.5, fontStyle: "italic" }}>No battles on record. Peace — for now.</p>;
  }
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th className="num">Turn</th>
          <th>Battle</th>
          <th>Outcome</th>
          <th className="num">Troops lost (attacker / defender)</th>
          <th>Damage</th>
        </tr>
      </thead>
      <tbody>
        {battles.map((b) => {
          const name = (id: string, n: string) => (
            <Link href={`/empire/${id}`} style={id === highlightId ? { fontWeight: 700 } : undefined}>
              {n}
            </Link>
          );
          const damage = [
            b.wallDamage > 0 ? `🧱 −${Math.round(b.wallDamage * 100)}%` : "",
            b.buildingsHit > 0 ? `🏚 ${b.buildingsHit}` : "",
            b.attackerGearLost > 0 ? `🏹 ${b.attackerGearLost}` : "",
          ].filter(Boolean).join("  ");
          return (
            <tr key={b.id}>
              <td className="num">{b.tick.toLocaleString("en-US")}</td>
              <td>
                {MODE_ICON[b.mode] ?? "⚔"} {name(b.attackerId, b.attackerName)}{" "}
                <span style={{ color: "var(--ink-soft)" }}>{b.mode}s</span> {name(b.defenderId, b.defenderName)}
              </td>
              <td>
                {b.victor === "none"
                  ? "engines traded fire"
                  : b.yielded
                    ? `${b.defenderName} yields — no fight`
                    : b.victor === "attacker"
                      ? `${b.attackerName} victorious (${b.rounds}r)`
                      : `${b.defenderName} holds (${b.rounds}r)`}
              </td>
              <td className="num">
                {b.attackerTroopsLost.toLocaleString("en-US")} / {b.defenderTroopsLost.toLocaleString("en-US")}
              </td>
              <td style={{ whiteSpace: "nowrap", color: "var(--ink-soft)" }}>{damage || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
