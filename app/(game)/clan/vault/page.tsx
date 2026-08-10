import { redirect } from "next/navigation";
import { Btn } from "@/components/Btn";
import { ClanTabs } from "@/components/ClanTabs";
import { CmdForm } from "@/components/CmdForm";
import { CountInput } from "@/components/CountInput";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { STORAGE_CAP_PER_LEVEL } from "@/lib/constants";
import { bankedRes, withdrawableNow, type ClanResource } from "@/lib/engine";
import { clanBadges, getClanView } from "@/lib/server/clanView";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const POOL: ClanResource[] = ["gold", "food", "wood", "stone", "ore"];

// The shared pool, on its own tab. Split from the works because the two are
// used on completely different rhythms: leadership raises a work a handful of
// times an age, while every member gives and takes from the pool constantly.
export default async function ClanVaultPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, p, clan, tick } = await getClanView();
  if (!clan) redirect("/clan");

  const poolCap = Math.floor(STORAGE_CAP_PER_LEVEL * clan.buildings.storageLevel * clan.buildings.integrity.storage);
  const vault = bankedRes(p);

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#clans">How clans work &amp; win together</LearnLink>
      <ClanTabs badges={clanBadges(world, clan, p, tick)} />

      <Panel
        title="Clan Storage — mutual aid, not a piggy bank"
        info="The 3× rule: withdraw at most triple your lifetime deposits. Building and repair spends bypass the cap — the clan's wealth doing the clan's work."
        guide="/guide#clans"
      >
        {clan.buildings.storageLevel === 0 && (
          <p className="panel-lede" style={{ color: "var(--warn)" }}>
            No Clan Storage built yet — raise it on the Works tab before the pool can hold anything.
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
                  ? "The clan has no Storage yet — raise it on the Works tab first."
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
                    <CmdForm name="clanDeposit" path="/clan/vault">
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
                    <CmdForm name="clanWithdraw" path="/clan/vault">
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
    </>
  );
}
