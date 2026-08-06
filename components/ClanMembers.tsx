// The clan roster table (spec/clans.md) — Name / Race / Troops / Population /
// Rank, with Online rows highlighted and ✗ marking recently-attacked members.
// Exact troop counts are clan business: members of this clan see numbers,
// everyone else sees the same qualitative label as the public ladder.

import Link from "next/link";
import { Art } from "@/components/Art";
import { RACE_NAMES } from "@/lib/constants";
import {
  military,
  rankingScore,
  totalPopulation,
  troopStrengthLabel,
  type Clan,
} from "@/lib/engine";
import type { World } from "@/lib/server/store";
import { REVENGE_WINDOW_TICKS, isOnline } from "@/lib/server/world";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/** "3m ago" · "5h ago" · "2d ago" · "unknown" — for a clanmate's last sighting. */
function lastSeenLabel(lastSeenAtMs: number | undefined, now: number): string {
  if (!lastSeenAtMs) return "not yet seen";
  const s = Math.floor((now - lastSeenAtMs) / 1000);
  if (s < 60) return "moments ago";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ClanMembers({
  world,
  clan,
  viewerId,
}: {
  world: World;
  clan: Clan;
  viewerId: string;
}) {
  const tick = world.meta.tickNumber;
  const insider = clan.members.includes(viewerId);
  const ranks = new Map(
    Object.values(world.players)
      .map((p) => ({ id: p.id, score: rankingScore(p) }))
      .sort((a, b) => b.score - a.score)
      .map((e, i) => [e.id, i + 1]),
  );
  const members = clan.members
    .map((id) => world.players[id])
    .filter((m) => !!m)
    .sort((a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0));

  const role = (id: string) =>
    clan.leaderId === id
      ? "👑 Leader"
      : clan.viceLeaderId === id
        ? "Vice"
        : clan.officerIds.includes(id)
          ? "Officer"
          : "";

  const now = Date.now();

  return (
    <>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "2px 0 6px" }}>
        <span className="online-chip"><span className="online-dot" /> Online now</span>
        {" · otherwise the last time each banner was seen"}
        {insider && (
          <>
            {" · "}
            <b style={{ color: "var(--warn)" }}>✗</b> recently attacked
          </>
        )}
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>Race</th>
            <th className="num">Troops</th>
            <th className="num">Population</th>
            <th className="num">Rank</th>
            <th>Seen</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const attacked =
              insider && m.recentAttackers.some((r) => tick - r.tick <= REVENGE_WINDOW_TICKS);
            const online = isOnline(m, now);
            return (
              <tr key={m.id} className={online ? "row-online" : undefined}>
                <td>
                  <span className="race-cell">
                    <span className="race-avatar">
                      <Art path={`races/${m.race}`} size={28} title={RACE_NAMES[m.race]} />
                    </span>
                    <span>
                      {attacked && <b style={{ color: "var(--warn)" }} title="Recently attacked">✗ </b>}
                      <Link href={`/empire/${m.id}`}>{m.name}</Link>
                      {m.id === viewerId && " (you)"}
                      {m.onVacation && " 🏳"}
                      {role(m.id) && <i> ({role(m.id)})</i>}
                    </span>
                  </span>
                </td>
                <td>{RACE_NAMES[m.race]}</td>
                <td className="num">{insider ? fmt(military(m)) : troopStrengthLabel(m)}</td>
                <td className="num">{fmt(totalPopulation(m))}</td>
                <td className="num">{ranks.get(m.id)}</td>
                <td>
                  {online ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
                      <span className="online-dot" /> Online
                    </span>
                  ) : (
                    <span className="last-seen">{lastSeenLabel(m.lastSeenAtMs, now)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
