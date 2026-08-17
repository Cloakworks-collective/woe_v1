import { Btn } from "@/components/Btn";
import Link from "next/link";
import { Art } from "@/components/Art";
import { ClanManage } from "@/components/ClanManage";
import { ClanMembers } from "@/components/ClanMembers";
import { ClanPetitions } from "@/components/ClanPetitions";
import { ClanTabs } from "@/components/ClanTabs";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import { CHURN, HALL, WAR } from "@/lib/constants";
import { canAdmit, hasRequested, invitedTo, isRefused, memberCap, wonderDiscount } from "@/lib/engine";
import { clanBadges, getClanView, isClanLeadership } from "@/lib/server/clanView";
import { clanScore } from "@/lib/server/world";

export const metadata = { title: "Clan" };

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

export default async function ClanHallPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, p, clan, tick } = await getClanView();

  if (!clan) {
    // No tab strip here on purpose — tabs to pages that don't apply to you are
    // worse than a long page. Bannerless players get the joining flow, whole.
    const invitations = Object.values(world.clans).filter((c) => invitedTo(c, p.id));
    const joinBlocked = (c: (typeof invitations)[number]) =>
      (p.clanJoinableAtTick ?? 0) > tick
        ? `On cooldown — you can join again at turn ${p.clanJoinableAtTick}.`
        : p.clanDepartures >= CHURN.MAX_DEPARTURES_PER_ERA
          ? "Twice departed — no clan will have you until the era turns."
          : c.members.length >= memberCap(c)
            ? "This clan is full."
            : undefined;

    return (
      <>
        <Flash err={err} ok={ok} />
        <LearnLink href="/guide#clans">How clans work &amp; win together</LearnLink>
        <Panel title="No Banner Yet">
          <p style={{ fontSize: 14.5, marginBottom: 8 }}>
            You march alone. A clan pools resources in a shared vault, shelters every member from part of
            their tax, discounts war for all, and can win the age together. Found your own (50,000 gold) or
            petition an existing banner below.
            {p.clanDepartures > 0 &&
              ` You have departed ${p.clanDepartures}/${CHURN.MAX_DEPARTURES_PER_ERA} times this era.`}
            {(p.clanJoinableAtTick ?? 0) > tick &&
              ` Cooldown: joinable again at turn ${p.clanJoinableAtTick}.`}
          </p>
          <CmdForm name="clanCreate" path="/clan">
            <input name="name" placeholder="Clan name…" aria-label="Clan name" maxLength={40} style={{ font: "14.5px Verdana", padding: 3 }} />
            <ReqTip
              heading="Found a clan"
              body="Raise your own banner — a clan you lead. Members pool resources in a shared store and fight your wars together."
              rows={[{ icon: <ResIcon kind="gold" size={16} />, label: "Gold", need: 50000, have: p.gold }]}
              note="You become its leader; others may petition to join."
              disabledReason={p.gold < 50000 ? "Not enough gold — founding a clan costs 50,000." : undefined}
            >
              <Btn className="btn">Found (50k gold)</Btn>
            </ReqTip>
          </CmdForm>
        </Panel>
        {invitations.length > 0 && (
          <Panel title={`✉ Invitations — ${invitations.length} banner${invitations.length > 1 ? "s" : ""} want you`}>
            <p className="panel-lede">
              These clans have asked you to join them. An invitation lets you walk straight in — no petition,
              no waiting on an answer.
            </p>
            <table className="tbl">
              <tbody>
                {invitations.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>
                        <Link href={`/clan/${c.id}`}>{c.name}</Link>
                      </b>
                    </td>
                    <td className="num">
                      {c.members.length}/{memberCap(c)}
                    </td>
                    <td>
                      <CmdForm name="clanAcceptInvite" path="/clan">
                        <input type="hidden" name="clanId" value={c.id} />
                        <ReqTip
                          heading={`Accept ${c.name}'s invitation`}
                          body="Take up this banner at once. You share its storage pool and fight its wars."
                          note="Leaving a clan later forfeits your deposits and starts a 48-hour cooldown."
                          disabledReason={joinBlocked(c)}
                        >
                          <Btn className="btn">Accept</Btn>
                        </ReqTip>
                      </CmdForm>
                    </td>
                    <td>
                      <CmdForm name="clanDeclineInvite" path="/clan">
                        <input type="hidden" name="clanId" value={c.id} />
                        <ReqTip heading={`Decline ${c.name}`} body="Turn down this invitation. They may invite you again later.">
                          <Btn className="btn">Decline</Btn>
                        </ReqTip>
                      </CmdForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        <Panel title="Standing Banners">
          {Object.keys(world.clans).length === 0 ? (
            <p style={{ fontSize: 14.5 }}>No banners fly yet — be the first to raise one.</p>
          ) : (
            <>
              <p className="panel-lede">
                You cannot simply walk into a clan — you <b>petition</b>, and its Leader or Vice-Leader answers.
                A refused petition is final: that banner will never take your request again, though its
                leadership may still invite you.
              </p>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Clan</th>
                    <th className="num">Members</th>
                    <th>War record</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(world.clans).map((c) => {
                    const petitioned = hasRequested(c, p.id);
                    const refused = isRefused(c, p.id);
                    return (
                      <tr key={c.id}>
                        <td>
                          <b>
                            <Link href={`/clan/${c.id}`}>{c.name}</Link>
                          </b>
                        </td>
                        <td className="num">
                          {c.members.length}/{memberCap(c)}
                        </td>
                        <td>
                          <span style={{ color: "var(--pos)" }}>{c.warRecord.wins} wins</span>
                          <span style={{ color: "var(--ink-soft)" }}> · </span>
                          <span style={{ color: "var(--neg)" }}>{c.warRecord.losses} losses</span>
                        </td>
                        <td>
                          {refused ? (
                            <span style={{ color: "var(--neg)", fontSize: 13.5 }} title="This banner turned you away — only an invitation can get you in now.">
                              ✕ Turned away
                            </span>
                          ) : petitioned ? (
                            <CmdForm name="clanWithdrawRequest" path="/clan">
                              <input type="hidden" name="clanId" value={c.id} />
                              <ReqTip
                                heading={`Withdraw your petition to ${c.name}`}
                                body="Take back your petition before they answer it."
                                note="Withdrawing is not a refusal — you may petition this banner again."
                              >
                                <Btn className="btn">⏳ Awaiting — withdraw</Btn>
                              </ReqTip>
                            </CmdForm>
                          ) : (
                            <CmdForm name="clanRequestJoin" path="/clan">
                              <input type="hidden" name="clanId" value={c.id} />
                              <ReqTip
                                heading={`Petition ${c.name}`}
                                body="Ask to march under this banner. Their Leader or Vice-Leader must let you in."
                                note="If they refuse, you can never petition this clan again — only an invitation from their leadership could bring you in."
                                disabledReason={joinBlocked(c)}
                              >
                                <Btn className="btn">Petition</Btn>
                              </ReqTip>
                            </CmdForm>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </Panel>
      </>
    );
  }

  const isLeadership = isClanLeadership(clan, p.id);
  const score = clanScore(world, clan);
  const rank = Object.values(world.clans).map((c) => clanScore(world, c)).filter((s) => s > score).length + 1;

  // A live clan-bombardment revenge our banner may still deliver.
  const pendingRev =
    clan.pendingRevenge && tick <= clan.pendingRevenge.expiresAtTick && clan.pendingRevenge.memberSnapshot.includes(p.id)
      ? clan.pendingRevenge
      : undefined;
  const revengeAgainst = pendingRev ? world.clans[pendingRev.againstClanId] : undefined;

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#clans">How clans work &amp; win together</LearnLink>
      <ClanTabs badges={clanBadges(world, clan, p, tick)} />

      {/* ── Banner header ─────────────────────────────────────────────── */}
      <Panel title={`${clan.name}`}>
        <div className="clan-header">
          <span className="clan-crest">
            <Art path="clan/crest" size={96} title={`${clan.name} crest`} />
          </span>
          <div className="clan-header-facts">
            <div className="clan-stat">
              <span className="clan-stat-label">Rank</span>
              <span className="clan-stat-value">#{rank} <small>of {Object.keys(world.clans).length}</small></span>
            </div>
            <div className="clan-stat">
              <span className="clan-stat-label">Banners</span>
              <span className="clan-stat-value">{clan.members.length}<small>/{memberCap(clan)}</small></span>
            </div>
            <div className="clan-stat">
              <span className="clan-stat-label">Tax shelter</span>
              <span className="clan-stat-value">members feel {Math.round((HALL[clan.buildings.hallLevel - 1]?.taxPenaltyFelt ?? 1) * 100)}%</span>
            </div>
            <div className="clan-stat">
              <span className="clan-stat-label">War discount</span>
              <span className="clan-stat-value">−{Math.round(wonderDiscount(clan) * 100)}%</span>
            </div>
            <div className="clan-stat">
              <span className="clan-stat-label">War record</span>
              <span className="clan-stat-value">
                <span style={{ color: "var(--pos)" }}>{clan.warRecord.wins}W</span>
                {" · "}
                <span style={{ color: "var(--neg)" }}>{clan.warRecord.losses}L</span>
              </span>
            </div>
            <div className="clan-stat">
              <span className="clan-stat-label">Clan score</span>
              <span className="clan-stat-value" style={{ color: "var(--coin)" }}>{fmt(score)}</span>
            </div>
          </div>
        </div>

        {clan.wars.length > 0 && (
          <div className="clan-warbar">
            ⚔ AT WAR ·{" "}
            {clan.wars.map((w, i) => {
              const net = w.regularKills - w.regularLosses;
              return (
                <span key={w.clanId}>
                  {i > 0 && " · "}
                  <b>{world.clans[w.clanId]?.name ?? "?"}</b> (net {net >= 0 ? "+" : ""}{net}/{WAR.NET_REGULAR_KILLS_TO_WIN})
                </span>
              );
            })}
            {" · "}
            <Link href="/clan/war">the War Front →</Link>
          </div>
        )}
        {pendingRev && (
          <div className="clan-warbar clan-warbar-rev">
            ⚔ Your banner holds <b>one revenge strike</b> against {revengeAgainst?.name ?? "the aggressor"} for
            bombarding your works — claim it from the <Link href="/rankings">ladder</Link> (first member to strike takes it).
          </div>
        )}
      </Panel>

      {/* ── The gate — petitions & invitations (Leader/Vice only) ─────── */}
      {canAdmit(clan, p.id) && (
        <Panel
          title={`The Gate — ${(clan.joinRequests ?? []).length} petition${(clan.joinRequests ?? []).length === 1 ? "" : "s"} awaiting`}
          info="No one walks into a clan. Petitioners wait here for the Leader or Vice-Leader to admit or refuse them — a refusal is permanent. You may also invite any bannerless empire directly."
          guide="/guide#clans"
        >
          <ClanPetitions world={world} clan={clan} path="/clan" />
        </Panel>
      )}

      <Panel title={`Clan Members — ${clan.members.length}/${memberCap(clan)}`}>
        <ClanMembers world={world} clan={clan} viewerId={p.id} />
        {isLeadership && (
          <details className="clan-manage-wrap">
            <summary>⚜ Manage roster {clan.leaderId === p.id ? "(appoint, remove, pass the mantle)" : "(remove members below you)"}</summary>
            <ClanManage world={world} clan={clan} viewerId={p.id} path="/clan" />
          </details>
        )}
        <CmdForm name="clanLeave" path="/clan">
          <ReqTip
            heading="Leave the clan"
            body={`Abandon ${clan.name}. You forfeit every resource you have deposited into the pool, and can't join another clan for 48 hours.`}
            note={clan.leaderId === p.id && clan.members.length > 1 ? "As Leader you must pass the mantle first (Manage roster → Crown)." : "A departure also counts against your per-era limit."}
            disabledReason={clan.leaderId === p.id && clan.members.length > 1 ? "Pass the leadership to another member before leaving." : undefined}
          >
            <Btn className="btn" style={{ background: "linear-gradient(#a8853f,#7c5426)", borderColor: "#4e3113", marginTop: 8 }}>
              Leave (forfeits deposits, 48h cooldown)
            </Btn>
          </ReqTip>
        </CmdForm>
      </Panel>
    </>
  );
}
