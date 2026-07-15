import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { BUILD_COSTS, CHURN, HALL, STORAGE_CAP_PER_LEVEL } from "@/lib/constants";
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
          <p style={{ fontSize: 13.5, marginBottom: 8 }}>
            You march alone. Found a clan (50,000 gold) or petition an existing one.
            {p.clanDepartures > 0 &&
              ` You have departed ${p.clanDepartures}/${CHURN.MAX_DEPARTURES_PER_ERA} times this era.`}
            {(p.clanJoinableAtTick ?? 0) > tick &&
              ` Cooldown: joinable again at turn ${p.clanJoinableAtTick}.`}
          </p>
          <CmdForm name="clanCreate" path="/clan">
            <input name="name" placeholder="Clan name…" aria-label="Clan name" maxLength={40} style={{ font: "13.5px Verdana", padding: 3 }} />
            <button className="btn">Found (50k gold)</button>
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
                    <b>{c.name}</b>
                  </td>
                  <td className="num">
                    {c.members.length}/{memberCap(c)}
                  </td>
                  <td>
                    {c.warRecord.wins}W / {c.warRecord.losses}L
                  </td>
                  <td>
                    <CmdForm name="clanJoin" path="/clan">
                      <input type="hidden" name="clanId" value={c.id} />
                      <button className="btn">Join</button>
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
              {clan.warRecord.wins}W / {clan.warRecord.losses}L
            </dd>
          </dl>
          <div>
            <b style={{ fontSize: 12.5, textTransform: "uppercase", color: "var(--wood-light)" }}>Members</b>
            <ul style={{ fontSize: 13.5, listStyle: "none", marginTop: 4 }}>
              {clan.members.map((id) => {
                const m = world.players[id];
                const role =
                  clan.leaderId === id
                    ? "👑 Leader"
                    : clan.viceLeaderId === id
                      ? "Vice"
                      : clan.officerIds.includes(id)
                        ? "Officer"
                        : "";
                return (
                  <li key={id} className="race-cell" style={{ marginBottom: 3 }}>
                    {m && (
                      <span className="race-avatar">
                        <Art path={`races/${m.race}`} size={20} />
                      </span>
                    )}
                    <span>
                      {m?.name ?? id} {role && <i>({role})</i>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <CmdForm name="clanLeave" path="/clan">
              <button className="btn" style={{ background: "linear-gradient(#a8853f,#7c5426)", borderColor: "#4e3113", marginTop: 6 }}>
                Leave (forfeits deposits, 48h cooldown)
              </button>
            </CmdForm>
          </div>
        </div>
        {clan.wars.length > 0 && (
          <p style={{ fontSize: 13.5, marginTop: 6, color: "var(--warn)", fontWeight: 700 }}>
            ⚔ AT WAR:{" "}
            {clan.wars
              .map(
                (w) =>
                  `${world.clans[w.clanId]?.name ?? "?"} (kills ${w.regularKills} / losses ${w.regularLosses} — win at net +200)`,
              )
              .join(", ")}
          </p>
        )}
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
                    <input name="amount" placeholder="#" aria-label={`${r} to deposit`} size={6} style={{ font: "12.5px Verdana", padding: 2 }} />
                    <button className="btn">Give</button>
                  </CmdForm>
                </td>
                <td>
                  <CmdForm name="clanWithdraw" path="/clan">
                    <input type="hidden" name="what" value={r} />
                    <input name="amount" placeholder="#" aria-label={`${r} to withdraw`} size={6} style={{ font: "12.5px Verdana", padding: 2 }} />
                    <button className="btn">Take</button>
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
                <button className="btn">
                  Storage → L{clan.buildings.storageLevel + 1} ({fmt(nextStorage.gold)}g + {fmt(nextStorage.each)} each)
                </button>
              </CmdForm>
            )}
            {nextHall && (
              <CmdForm name="clanBuild" path="/clan">
                <input type="hidden" name="which" value="hall" />
                <button className="btn">
                  Hall → L{clan.buildings.hallLevel + 1} ({fmt(nextHall.gold)}g + {fmt(nextHall.each)} each)
                </button>
              </CmdForm>
            )}
            {nextWonder && (
              <CmdForm name="clanBuild" path="/clan">
                <input type="hidden" name="which" value="wonder" />
                <button className="btn">
                  Wonder → L{clan.buildings.wonderLevel + 1} ({fmt(nextWonder.gold)}g + {fmt(nextWonder.each)} each)
                </button>
              </CmdForm>
            )}
          </div>
          {isLeader && (
            <div style={{ marginTop: 10 }}>
              <b style={{ fontSize: 12.5, textTransform: "uppercase", color: "var(--wood-light)" }}>Declare war</b>
              <div style={{ marginTop: 4 }}>
                <CmdForm name="clanDeclareWar" path="/clan">
                  <select name="clanId" aria-label="Clan to declare war on" style={{ font: "13.5px Verdana" }}>
                    {Object.values(world.clans)
                      .filter((c) => c.id !== clan.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <button className="btn" style={{ background: "linear-gradient(var(--warn),var(--warn))", borderColor: "#511207" }}>
                    Declare War (+100% damage both ways)
                  </button>
                </CmdForm>
              </div>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
