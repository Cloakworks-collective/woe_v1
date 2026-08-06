import { Btn } from "@/components/Btn";
import Link from "next/link";
import { Art } from "@/components/Art";
import { ClanBombardTargets } from "@/components/ClanBombardTargets";
import { ClanChat } from "@/components/ClanChat";
import { ClanManage } from "@/components/ClanManage";
import { ClanMembers } from "@/components/ClanMembers";
import { ClanPetitions } from "@/components/ClanPetitions";
import { ClanWorks } from "@/components/ClanWorks";
import { CountInput } from "@/components/CountInput";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import { ACTION_INFO, CHAT, CHURN, HALL, STORAGE_CAP_PER_LEVEL, WAR } from "@/lib/constants";
import {
  bankedRes,
  canAdmit,
  clanRank,
  hasRequested,
  invitedTo,
  isRefused,
  memberCap,
  withdrawableNow,
  wonderDiscount,
  type ClanResource,
} from "@/lib/engine";
import { getGame } from "@/lib/server/session";
import { clanScore } from "@/lib/server/world";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const POOL: ClanResource[] = ["gold", "food", "wood", "stone", "ore"];

export default async function ClanPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, player: p } = await getGame();
  const clan = p.clanId ? world.clans[p.clanId] : undefined;
  const tick = world.meta.tickNumber;

  if (!clan) {
    // Banners that have already asked for you — an invitation skips the petition.
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

  // What the pool can hold per resource, and what the viewer has locked away in
  // their own storehouses (vaulted goods can't be given until drawn out).
  const poolCap = Math.floor(STORAGE_CAP_PER_LEVEL * clan.buildings.storageLevel * clan.buildings.integrity.storage);
  const vault = bankedRes(p);
  const clanChat = world.messages.filter((m) => m.channel === `clan:${clan.id}`).slice(-CHAT.CLAN_HISTORY);

  const myRank = clanRank(clan, p.id);
  const isLeadership = myRank >= 1;
  const canDeclare = clan.leaderId === p.id || clan.viceLeaderId === p.id;
  const score = clanScore(world, clan);
  const rank = Object.values(world.clans).map((c) => clanScore(world, c)).filter((s) => s > score).length + 1;

  // A live clan-bombardment revenge our banner may still deliver.
  const pendingRev =
    clan.pendingRevenge && tick <= clan.pendingRevenge.expiresAtTick && clan.pendingRevenge.memberSnapshot.includes(p.id)
      ? clan.pendingRevenge
      : undefined;
  const revengeAgainst = pendingRev ? world.clans[pendingRev.againstClanId] : undefined;
  const enemyClans = clan.wars
    .map((w) => world.clans[w.clanId])
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const otherClans = Object.values(world.clans).filter((c) => c.id !== clan.id && !clan.wars.some((w) => w.clanId === c.id));

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#clans">How clans work &amp; win together</LearnLink>

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
          </div>
        )}
        {pendingRev && (
          <div className="clan-warbar clan-warbar-rev">
            ⚔ Your banner holds <b>one revenge strike</b> against {revengeAgainst?.name ?? "the aggressor"} for
            bombarding your works — claim it from the <Link href="/rankings">ladder</Link> (first member to strike takes it).
          </div>
        )}
      </Panel>

      {/* ── War Front ─────────────────────────────────────────────────── */}
      {enemyClans.length > 0 && (
        <Panel title="War Front — break the enemy's works" info={ACTION_INFO.clanBombard} guide="/guide#clans">
          <p className="panel-lede">
            Any member may fire. A strike costs 10 action turns and crewed trebuchets (trebuchets with
            engineers to work them), and cracks the target toward its 50% floor. Each strike hands the enemy
            clan a single revenge — expect their strongest.
          </p>
          <ClanBombardTargets enemies={enemyClans} turnsAvailable={p.turnsAvailable} path="/clan" />
        </Panel>
      )}

      {/* ── Clan Works ────────────────────────────────────────────────── */}
      <Panel
        title={isLeadership ? "Clan Works — raise & repair (paid from the pool)" : "Clan Works"}
        info="The three great works of a clan. Levels are raised — and bombardment damage is mended — from the shared pool. Only the five leadership seats may build or repair."
        guide="/guide#clans"
      >
        <ClanWorks clan={clan} editable={isLeadership} path="/clan" builder={isLeadership ? p : undefined} />
      </Panel>

      {/* ── Diplomacy ─────────────────────────────────────────────────── */}
      {canDeclare && otherClans.length > 0 && (
        <Panel title="Diplomacy — declare war" info="Leaders and Vice-Leaders may open a war. Both clans deal +100% damage until one side nets +200 regular kills. A declared war can't be called off." guide="/guide#clans">
          <CmdForm name="clanDeclareWar" path="/clan">
            <select name="clanId" aria-label="Clan to declare war on" style={{ font: "14.5px Verdana", padding: 3 }}>
              {otherClans.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.members.length} members, {c.warRecord.wins}W/{c.warRecord.losses}L)
                </option>
              ))}
            </select>
            <ReqTip
              heading="Declare war"
              body="Open a clan war on the chosen banner. Both clans deal +100% damage to each other until one side wins — first to net +200 kills over losses takes it, plus tribute and frozen victory clocks for the loser."
              note="Leaders and Vice only. A declared war can't be called off — fight it out."
            >
              <Btn className="btn" style={{ background: "linear-gradient(var(--warn),var(--warn))", borderColor: "#511207" }}>
                Declare War (+100% damage both ways)
              </Btn>
            </ReqTip>
          </CmdForm>
        </Panel>
      )}

      {/* ── Storage ───────────────────────────────────────────────────── */}
      <Panel
        title="Clan Storage — mutual aid, not a piggy bank"
        info="The 3× rule: withdraw at most triple your lifetime deposits. Building and repair spends bypass the cap — the clan's wealth doing the clan's work."
        guide="/guide#clans"
      >
        {clan.buildings.storageLevel === 0 && (
          <p className="panel-lede" style={{ color: "var(--warn)" }}>
            No Clan Storage built yet — raise it in Clan Works before the pool can hold anything.
          </p>
        )}
        <table className="tbl">
          <thead>
            <tr>
              <th>Resource</th>
              <th className="num">In the pool</th>
              <th className="num">You have loose</th>
              <th className="num">You may withdraw</th>
              <th>Give</th>
              <th>Take</th>
            </tr>
          </thead>
          <tbody>
            {POOL.map((r) => {
              // Only LOOSE goods can be given — anything vaulted in your own
              // storehouse must be drawn out first, which is the usual reason a
              // deposit is refused while the bar still shows a healthy total.
              const loose = r === "gold" ? p.gold : p.resources[r];
              const vaulted = r === "gold" ? (p.bankedGold ?? 0) : vault[r];
              const room = Math.max(0, poolCap - clan.storage[r]);
              const canGive = Math.min(loose, room);
              const giveBlocked =
                clan.buildings.storageLevel === 0
                  ? "The clan has no Storage yet — raise it in Clan Works first."
                  : room === 0
                    ? `The pool is full of ${r} (cap ${fmt(poolCap)}).`
                    : loose === 0
                      ? vaulted > 0
                        ? `Your ${r} is vaulted, not loose — withdraw it from your own store first (Empire → the vault).`
                        : `You have no ${r} to give.`
                      : undefined;
              return (
              <tr key={r}>
                <td>
                  <b style={{ textTransform: "capitalize" }}>{r}</b>
                </td>
                <td className="num">
                  {fmt(clan.storage[r])}
                  <small style={{ color: "var(--ink-soft)" }}> /{fmt(poolCap)}</small>
                </td>
                <td className="num">
                  {fmt(loose)}
                  {vaulted > 0 && (
                    <small style={{ color: "var(--ink-soft)" }} title={`${fmt(vaulted)} ${r} is vaulted in your own store — draw it out before you can give it`}>
                      {" "}+{fmt(vaulted)} vaulted
                    </small>
                  )}
                </td>
                <td className="num">{fmt(Math.min(clan.storage[r], withdrawableNow(clan, p.id, r)))}</td>
                <td>
                  <CmdForm name="clanDeposit" path="/clan">
                    <input type="hidden" name="what" value={r} />
                    <CountInput name="amount" ariaLabel={`${r} to deposit`} size={6} max={canGive} disabled={Boolean(giveBlocked)} />
                    <ReqTip
                      heading={`Deposit ${r}`}
                      body="Give this resource to the clan pool for any member to draw on."
                      note="Only loose goods can be given. Deposits raise your own withdrawal cap — the 3× rule lets you later take up to triple what you've given."
                      disabledReason={giveBlocked}
                    >
                      <Btn className={giveBlocked ? "btn btn-no" : "btn"} disabled={Boolean(giveBlocked)}>
                        Give
                      </Btn>
                    </ReqTip>
                  </CmdForm>
                </td>
                <td>
                  <CmdForm name="clanWithdraw" path="/clan">
                    <input type="hidden" name="what" value={r} />
                    <CountInput name="amount" ariaLabel={`${r} to withdraw`} size={6} max={Math.floor(Math.min(clan.storage[r], withdrawableNow(clan, p.id, r)))} />
                    <ReqTip
                      heading={`Withdraw ${r}`}
                      body="Draw this resource from the clan pool into your treasury."
                      note={`Capped by the 3× rule — you may take up to ${fmt(Math.min(clan.storage[r], withdrawableNow(clan, p.id, r)))} ${r} right now.`}
                    >
                      <Btn className="btn">Take</Btn>
                    </ReqTip>
                  </CmdForm>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {/* ── The hall's talk ───────────────────────────────────────────── */}
      <Panel
        title="The Hall — clan chat"
        info={`Only your clan can read this. The hall keeps its last ${CHAT.CLAN_HISTORY} messages; older words are deleted for good.`}
      >
        <ClanChat messages={clanChat} viewerId={p.id} path="/clan" />
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
