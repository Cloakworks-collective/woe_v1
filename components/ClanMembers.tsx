// The clan roster table (spec/clans.md) — Name / Race / Troops / Population /
// Rank, with Online rows highlighted and ✗ marking recently-attacked members.
// Exact troop counts are clan business: members of this clan see numbers,
// everyone else sees the same qualitative label as the public ladder.
//
// PRESENCE IS CLAN BUSINESS TOO. The Seen column, the Online chip and the
// row highlight are all shown to members only. Knowing exactly when a banner
// goes quiet is raiding intelligence: it tells an outsider which four hours to
// attack in, and it is the difference between losing a war and losing your
// sleep. Members need it to coordinate; nobody else is entitled to it.
//
// Members can also AID one another here: gold or goods straight from your
// stores to theirs, skipping the pool but NOT its ledger — aid is written to the
// same book and capped both ways, and both empires must be within
// AID_SCORE_BAND of each other on ranking score (see giftToMember). Leadership
// can silence a member in the hall without stopping them reading it.

import Link from "next/link";
import { Art } from "@/components/Art";
import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { AID_SCORE_BAND, CLAN_GIFT_TAX, CLAN_MUTE_DAYS, RACE_NAMES } from "@/lib/constants";
import {
  isLeadership,
  military,
  rankingScore,
  withinAidBand,
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
  path = "/clan",
}: {
  world: World;
  clan: Clan;
  viewerId: string;
  /** Where the aid/silence forms return to. */
  path?: string;
}) {
  const tick = world.meta.tickNumber;
  const insider = clan.members.includes(viewerId);
  // The viewer's own empire, for the ±30% aid band.
  const viewer = world.players[viewerId];
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
  /** What one member may hand another. Food included — a starving ally is the
   *  commonest reason to need help at all. */
  const GIFTABLE = ["gold", "food", "wood", "stone", "ore"] as const;
  const mutedUntil = (id: string) => clan.chatMutedUntilTick?.[id] ?? 0;
  const canMute = isLeadership(clan, viewerId);

  return (
    <>
      {insider && (
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "2px 0 6px" }}>
          <span className="online-chip"><span className="online-dot" /> Online now</span>
          {" · otherwise the last time each banner was seen"}
          {" · "}
          <b style={{ color: "var(--warn)" }}>✗</b> recently attacked
          <br />
          <i>Kept inside the clan — an outsider cannot see when your banners sleep.</i>
        </p>
      )}
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>Race</th>
            <th className="num">Troops</th>
            <th className="num">Population</th>
            <th className="num">Rank</th>
            {insider && <th>Seen</th>}
            {insider && <th>Aid</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const attacked =
              insider && m.recentAttackers.some((r) => tick - r.tick <= REVENGE_WINDOW_TICKS);
            // Gated with the column: the row highlight is the same fact in CSS,
            // and leaving it on would hand an outsider the answer anyway.
            const online = insider && isOnline(m, now);
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
                {insider && (
                  <td>
                    {online ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
                        <span className="online-dot" /> Online
                      </span>
                    ) : (
                      <span className="last-seen">{lastSeenLabel(m.lastSeenAtMs, now)}</span>
                    )}
                  </td>
                )}
                {insider && (
                  <td>
                    {m.id === viewerId ? (
                      <span style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>—</span>
                    ) : (
                      <details className="aid">
                        <summary className="btn act-ghost aid-btn">🤝 Help</summary>
                        <div className="aid-menu">
                          <div className="aid-title">Send aid to {m.name}</div>
                          {viewer && !withinAidBand(viewer, m) && (
                            <div className="aid-barred">
                              Out of reach — aid only flows between empires within{" "}
                              <b>{Math.round(AID_SCORE_BAND * 100)}%</b> of each other&apos;s ranking
                              score, so a small account cannot bankroll a large one (or the reverse).
                            </div>
                          )}
                          <CmdForm name="clanGift" path={path}>
                            <input type="hidden" name="toId" value={m.id} />
                            <div className="aid-row">
                              <select name="what" aria-label="What to send" className="aid-select">
                                {GIFTABLE.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                              <input
                                name="amount"
                                placeholder="amount"
                                aria-label={`Amount to send ${m.name}`}
                                inputMode="numeric"
                                className="aid-input"
                              />
                            </div>
                            <ReqTip
                              heading={`Send aid to ${m.name}`}
                              body={`Straight from your stores to theirs — this does not touch the clan pool, but it IS written to the same ledger, capped both ways: you may send triple what you have taken from the banner, and they may be given triple what they have put in. Both empires must also be within ${Math.round(AID_SCORE_BAND * 100)}% of each other's ranking score.`}
                              note={`Only LOOSE goods can be sent, and ${Math.round(CLAN_GIFT_TAX * 100)}% is lost to the levy on the way. Prop up a member being farmed today — but a second account made only to feed a first cannot reach it.`}
                            >
                              <Btn className="btn aid-go">Send</Btn>
                            </ReqTip>
                          </CmdForm>

                          {canMute && !role(m.id) && (
                            <div className="aid-mute">
                              <div className="aid-mute-head">Hall silence</div>
                              {mutedUntil(m.id) > tick ? (
                                <CmdForm name="clanMute" path={path}>
                                  <input type="hidden" name="playerId" value={m.id} />
                                  <input type="hidden" name="days" value="0" />
                                  <Btn className="btn act-ghost">Lift silence</Btn>
                                </CmdForm>
                              ) : (
                                <div className="aid-row">
                                  {CLAN_MUTE_DAYS.map((d) => (
                                    <CmdForm key={d} name="clanMute" path={path}>
                                      <input type="hidden" name="playerId" value={m.id} />
                                      <input type="hidden" name="days" value={String(d)} />
                                      <ReqTip
                                        heading={`Silence ${m.name} for ${d} day${d === 1 ? "" : "s"}`}
                                        body="They can still READ the hall — a member who cannot follow the war they are fighting in is no use to anyone. They simply cannot add to it."
                                      >
                                        <Btn className="btn act-ghost">{d}d</Btn>
                                      </ReqTip>
                                    </CmdForm>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
