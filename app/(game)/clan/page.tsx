import { Btn } from "@/components/Btn";
import Link from "next/link";
import { Art } from "@/components/Art";
import { ClanMembers } from "@/components/ClanMembers";
import { CountInput } from "@/components/CountInput";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import { ACTION_INFO, BUILD_COSTS, CHURN, HALL, STORAGE_CAP_PER_LEVEL } from "@/lib/constants";
import { memberCap, withdrawableNow, wonderDiscount, type ClanResource } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

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
    return (
      <>
        <Flash err={err} ok={ok} />
        <LearnLink href="/guide#clans">How clans work &amp; win together</LearnLink>
        <Panel title="No Banner Yet">
          <p style={{ fontSize: 14.5, marginBottom: 8 }}>
            You march alone. Found a clan (50,000 gold) or petition an existing one.
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
        <Panel title="Standing Banners">
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
              {Object.values(world.clans).map((c) => (
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
                    <CmdForm name="clanJoin" path="/clan">
                      <input type="hidden" name="clanId" value={c.id} />
                      <ReqTip
                        heading={`Join ${c.name}`}
                        body="Petition to march under this banner — you share its storage pool and fight its wars."
                        note="Leaving a clan later forfeits your deposits and starts a 48-hour cooldown."
                        disabledReason={
                          (p.clanJoinableAtTick ?? 0) > tick
                            ? `On cooldown — you can join again at turn ${p.clanJoinableAtTick}.`
                            : c.members.length >= memberCap(c)
                              ? "This clan is full."
                              : undefined
                        }
                      >
                        <Btn className="btn">Join</Btn>
                      </ReqTip>
                    </CmdForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </>
    );
  }

  const isLeader = clan.leaderId === p.id || clan.viceLeaderId === p.id;
  const isBuilder = isLeader || clan.officerIds.includes(p.id);
  const storageCap = STORAGE_CAP_PER_LEVEL * clan.buildings.storageLevel;
  const nextStorage = clan.buildings.storageLevel < 10 ? BUILD_COSTS.storage(clan.buildings.storageLevel + 1) : null;
  const nextHall = clan.buildings.hallLevel < 4 ? BUILD_COSTS.hall[clan.buildings.hallLevel + 1] : null;
  const nextWonder = clan.buildings.wonderLevel < 3 ? BUILD_COSTS.wonder[clan.buildings.wonderLevel + 1] : null;

  // A live clan-bombardment revenge our banner may still deliver.
  const pendingRev =
    clan.pendingRevenge &&
    tick <= clan.pendingRevenge.expiresAtTick &&
    clan.pendingRevenge.memberSnapshot.includes(p.id)
      ? clan.pendingRevenge
      : undefined;
  const revengeAgainst = pendingRev ? world.clans[pendingRev.againstClanId] : undefined;
  const enemyClans = clan.wars
    .map((w) => world.clans[w.clanId])
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#clans">How clans work &amp; win together</LearnLink>
      <Panel title={`${clan.name} — ${clan.members.length}/${memberCap(clan)} banners`}>
        <span className="guide-illo">
          <Art path="clan/crest" size={96} title={`${clan.name} crest`} />
        </span>
        <div className="panel-row">
          <dl className="kv">
            <dt>Hall level (tax shelter)</dt>
            <dd>
              {clan.buildings.hallLevel} — penalty felt{" "}
              {Math.round((HALL[clan.buildings.hallLevel - 1]?.taxPenaltyFelt ?? 1) * 100)}%
            </dd>
            <dt>Storage level</dt>
            <dd>
              {clan.buildings.storageLevel} (cap {fmt(storageCap)}/resource)
            </dd>
            <dt>Wonder</dt>
            <dd>
              {clan.buildings.wonderLevel} (−{Math.round(wonderDiscount(clan) * 100)}% war costs)
            </dd>
            <dt>War record</dt>
            <dd>
              <span style={{ color: "var(--pos)", fontWeight: 700 }}>{clan.warRecord.wins} wins</span> ·{" "}
              <span style={{ color: "var(--neg)", fontWeight: 700 }}>{clan.warRecord.losses} losses</span>
            </dd>
          </dl>
        </div>
        {clan.wars.length > 0 && (
          <p style={{ fontSize: 14.5, marginTop: 6, color: "var(--warn)", fontWeight: 700 }}>
            ⚔ AT WAR:{" "}
            {clan.wars
              .map(
                (w) =>
                  `${world.clans[w.clanId]?.name ?? "?"} (kills ${w.regularKills} / losses ${w.regularLosses} — win at net +200)`,
              )
              .join(", ")}
          </p>
        )}
        {pendingRev && (
          <p style={{ fontSize: 14.5, marginTop: 6, color: "var(--warn)", fontWeight: 700 }}>
            ⚔ Your banner may claim <b>one revenge strike</b> against{" "}
            {revengeAgainst?.name ?? "the aggressor"} for bombarding your works — deliver it from the{" "}
            <Link href="/rankings">ladder</Link> (first member to strike claims it).
          </p>
        )}
      </Panel>

      {enemyClans.length > 0 && (
        <Panel
          title="War Front — bombard the enemy's works"
          info={ACTION_INFO.clanBombard}
          guide="/guide#clans"
        >
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 8 }}>
            Any member may fire. Costs 10 action turns and crewed trebuchets (trebuchets + engineers).
            Each strike hands the enemy clan one revenge — expect their strongest.
          </p>
          {enemyClans.map((enemy) => {
            const rows = [
              { key: "storage", label: "Clan Storage", level: enemy.buildings.storageLevel, integ: enemy.buildings.integrity.storage },
              { key: "hall", label: "Clan Hall", level: enemy.buildings.hallLevel, integ: enemy.buildings.integrity.hall },
              { key: "wonder", label: "Clan Wonder", level: enemy.buildings.wonderLevel, integ: enemy.buildings.integrity.wonder },
            ].filter((r) => r.level > 0);
            return (
              <div key={enemy.id} style={{ marginBottom: 10 }}>
                <b style={{ fontSize: 14 }}>
                  <Link href={`/clan/${enemy.id}`}>{enemy.name}</Link>
                </b>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Structure</th>
                      <th className="num">Level</th>
                      <th className="num">Integrity</th>
                      <th>Bombard</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td>{r.label}</td>
                        <td className="num">{r.level}</td>
                        <td className="num">{Math.round(r.integ * 100)}%</td>
                        <td>
                          {r.integ > 0.5 ? (
                            <CmdForm name="clanBombard" path="/clan">
                              <input type="hidden" name="clanId" value={enemy.id} />
                              <input type="hidden" name="which" value={r.key} />
                              <ReqTip
                                heading={`Bombard ${enemy.name}'s ${r.label}`}
                                body={`Fire your crewed trebuchets at this structure, cracking its integrity (now ${Math.round(r.integ * 100)}%). Any member may fire.`}
                                rows={[{ icon: <span className="costtip-ico">⏳</span>, label: "Action turns", need: 10, have: p.turnsAvailable }]}
                                note="Also needs at least one crewed trebuchet (a trebuchet with its engineers). Each strike hands the enemy clan one revenge."
                                disabledReason={p.turnsAvailable < 10 ? "Not enough action turns — a bombardment costs 10." : undefined}
                              >
                                <Btn className="btn">Bombard (10 turns)</Btn>
                              </ReqTip>
                            </CmdForm>
                          ) : (
                            <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>cracked to the floor</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </Panel>
      )}

      <Panel title={`Clan Members — ${clan.members.length}`}>
        <ClanMembers world={world} clan={clan} viewerId={p.id} />
        <CmdForm name="clanLeave" path="/clan">
          <ReqTip
            heading="Leave the clan"
            body={`Abandon ${clan.name}. You forfeit every resource you have deposited into the pool, and can't join another clan for 48 hours.`}
            note="A departure also counts against your per-era limit."
          >
            <Btn className="btn" style={{ background: "linear-gradient(#a8853f,#7c5426)", borderColor: "#4e3113", marginTop: 8 }}>
              Leave (forfeits deposits, 48h cooldown)
            </Btn>
          </ReqTip>
        </CmdForm>
      </Panel>

      <Panel
        title="Clan Storage — mutual aid, not a piggy bank"
        info="The 3× rule: withdraw at most triple your lifetime deposits. Building spends bypass the cap — the clan's money doing the clan's work."
        guide="/guide#clans"
      >
        <table className="tbl">
          <thead>
            <tr>
              <th>Resource</th>
              <th className="num">In the pool</th>
              <th className="num">You may withdraw</th>
              <th>Deposit</th>
              <th>Withdraw</th>
            </tr>
          </thead>
          <tbody>
            {POOL.map((r) => (
              <tr key={r}>
                <td>
                  <b>{r}</b>
                </td>
                <td className="num">{fmt(clan.storage[r])}</td>
                <td className="num">{fmt(Math.min(clan.storage[r], withdrawableNow(clan, p.id, r)))}</td>
                <td>
                  <CmdForm name="clanDeposit" path="/clan">
                    <input type="hidden" name="what" value={r} />
                    <CountInput name="amount" ariaLabel={`${r} to deposit`} size={6} max={r === "gold" ? p.gold : p.resources[r]} />
                    <ReqTip
                      heading={`Deposit ${r}`}
                      body="Give this resource to the clan pool for any member to draw on."
                      note="Deposits raise your own withdrawal cap — the 3× rule lets you later take up to triple what you've given."
                    >
                      <Btn className="btn">Give</Btn>
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
            ))}
          </tbody>
        </table>
      </Panel>

      {isBuilder && (
        <Panel title="Clan Works (leadership only — paid from the pool)">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {nextStorage && (
              <CmdForm name="clanBuild" path="/clan">
                <input type="hidden" name="which" value="storage" />
                <ReqTip
                  heading={`Clan Storage → L${clan.buildings.storageLevel + 1}`}
                  body={`Deepen the shared store — more pooled capacity per resource (now ${fmt(storageCap)} each).`}
                  rows={[{ icon: <ResIcon kind="gold" size={16} />, label: "Gold (from pool)", need: nextStorage.gold, have: clan.storage.gold }]}
                  note={`Plus ${fmt(nextStorage.each)} of every other resource, paid from the clan pool.`}
                  disabledReason={clan.storage.gold < nextStorage.gold ? "The clan pool is short on gold for this." : undefined}
                >
                  <Btn className="btn">
                    Storage → L{clan.buildings.storageLevel + 1} ({fmt(nextStorage.gold)}g + {fmt(nextStorage.each)} each)
                  </Btn>
                </ReqTip>
              </CmdForm>
            )}
            {nextHall && (
              <CmdForm name="clanBuild" path="/clan">
                <input type="hidden" name="which" value="hall" />
                <ReqTip
                  heading={`Clan Hall → L${clan.buildings.hallLevel + 1}`}
                  body="Raise the Hall — softens the tax penalty every member feels, so their treasuries fill faster."
                  rows={[{ icon: <ResIcon kind="gold" size={16} />, label: "Gold (from pool)", need: nextHall.gold, have: clan.storage.gold }]}
                  note={`Plus ${fmt(nextHall.each)} of every other resource, paid from the clan pool.`}
                  disabledReason={clan.storage.gold < nextHall.gold ? "The clan pool is short on gold for this." : undefined}
                >
                  <Btn className="btn">
                    Hall → L{clan.buildings.hallLevel + 1} ({fmt(nextHall.gold)}g + {fmt(nextHall.each)} each)
                  </Btn>
                </ReqTip>
              </CmdForm>
            )}
            {nextWonder && (
              <CmdForm name="clanBuild" path="/clan">
                <input type="hidden" name="which" value="wonder" />
                <ReqTip
                  heading={`Clan Wonder → L${clan.buildings.wonderLevel + 1}`}
                  body="Raise the Wonder — deepens the discount on every member's war costs (siege gear, troops, and mercenaries)."
                  rows={[{ icon: <ResIcon kind="gold" size={16} />, label: "Gold (from pool)", need: nextWonder.gold, have: clan.storage.gold }]}
                  note={`Plus ${fmt(nextWonder.each)} of every other resource, paid from the clan pool.`}
                  disabledReason={clan.storage.gold < nextWonder.gold ? "The clan pool is short on gold for this." : undefined}
                >
                  <Btn className="btn">
                    Wonder → L{clan.buildings.wonderLevel + 1} ({fmt(nextWonder.gold)}g + {fmt(nextWonder.each)} each)
                  </Btn>
                </ReqTip>
              </CmdForm>
            )}
          </div>
          {isLeader && (
            <div style={{ marginTop: 10 }}>
              <b style={{ fontSize: 13.5, textTransform: "uppercase", color: "var(--wood-light)" }}>Declare war</b>
              <div style={{ marginTop: 4 }}>
                <CmdForm name="clanDeclareWar" path="/clan">
                  <select name="clanId" aria-label="Clan to declare war on" style={{ font: "14.5px Verdana" }}>
                    {Object.values(world.clans)
                      .filter((c) => c.id !== clan.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <ReqTip
                    heading="Declare war"
                    body="Open a clan war on the chosen banner. Both clans deal +100% damage to each other until one side wins — first to net +200 kills over losses takes it."
                    note="Leaders only. A declared war can't be called off — fight it out."
                  >
                    <Btn className="btn" style={{ background: "linear-gradient(var(--warn),var(--warn))", borderColor: "#511207" }}>
                      Declare War (+100% damage both ways)
                    </Btn>
                  </ReqTip>
                </CmdForm>
              </div>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
