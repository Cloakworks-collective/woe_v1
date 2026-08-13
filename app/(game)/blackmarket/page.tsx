import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { CountInput } from "@/components/CountInput";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import {
  BLACK_MARKET,
  COUNTER_TYPES,
  MARKET_PRICE_MAX,
  MARKET_PRICE_MIN,
  SIEGE_COUNTERS,
  SIEGE_GEAR,
  SIEGE_SALVAGE_VALUE,
  WAR_FOUNDRY_LADDER,
} from "@/lib/constants";
import { blackMarketAffordable, type Resource } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
/** The build cost the salvage rate is applied to. */
type Spec = { gold: number; wood: number; ore: number };

const RESOURCES: { key: Resource; label: string }[] = [
  { key: "food", label: "Food" },
  { key: "wood", label: "Wood" },
  { key: "stone", label: "Stone" },
  { key: "ore", label: "Ore" },
];

export default async function BlackMarketPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { player: p } = await getGame();
  const affordable = blackMarketAffordable(p);

  // Every engine you own, offensive gear and defensive counters alike — the
  // fence buys both. Integrity is tracked per TYPE, so a park wears together.
  type Row = { key: string; name: string; count: number; integrity: number; spec: Spec };
  const gearKeys = Object.keys(SIEGE_GEAR) as (keyof typeof SIEGE_GEAR)[];
  const gearRows: Row[] = gearKeys
    .filter((t) => p.army.siegeGear[t] > 0)
    .map((t) => ({
      key: t as string,
      name: WAR_FOUNDRY_LADDER.find((s) => s.gearKey === t)?.name ?? (t as string),
      count: p.army.siegeGear[t],
      integrity: p.army.siegeGearIntegrity[t] ?? 1,
      spec: SIEGE_GEAR[t] as unknown as Spec,
    }));
  const counterRows: Row[] = COUNTER_TYPES.filter((ct) => p.army.siegeCounters[ct] > 0).map((ct) => ({
    key: ct as string,
    name: SIEGE_COUNTERS[ct].name,
    count: p.army.siegeCounters[ct],
    integrity: p.army.siegeCounterIntegrity[ct] ?? 1,
    spec: SIEGE_COUNTERS[ct] as unknown as Spec,
  }));
  const engines = [...gearRows, ...counterRows];

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#market-mastery">When the fence is worth it</LearnLink>

      <Panel
        title="⚖️ The Black Market — the fence"
        info={`You deal with the fence, not with another empire. Everything here settles on the spot: no caravan, no road, no waiting, and no counterparty who might not show. You pay for that speed in price — the fence is the worst deal in the realm, by design.`}
      >
        <p className="delivery-note" style={{ marginBottom: 10 }}>
          <span aria-hidden="true">🪙</span>
          <span>
            The fence pays <b>{BLACK_MARKET.SELL_PRICE}</b> gold a unit and sells at{" "}
            <b>{BLACK_MARKET.BUY_PRICE}</b>. The <a href="/market">Grand Bazaar</a> trades between{" "}
            <b>{MARKET_PRICE_MIN}</b> and <b>{MARKET_PRICE_MAX}</b> — always better on both sides.
            Come here when you need gold <i>now</i> or bread <i>now</i> and cannot wait out a
            caravan.
          </span>
        </p>

        <table className="tbl">
          <thead>
            <tr>
              <th>Goods</th>
              <th className="num">In store</th>
              <th>Sell to the fence ({BLACK_MARKET.SELL_PRICE} gold each)</th>
              <th>Buy from the fence ({BLACK_MARKET.BUY_PRICE} gold each)</th>
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map(({ key, label }) => {
              const have = p.resources[key];
              return (
                <tr key={key}>
                  <td>
                    <span className="res-cost">
                      <ResIcon kind={key} size={60} /> {label}
                    </span>
                  </td>
                  <td className="num">{fmt(have)}</td>
                  <td>
                    <CmdForm name="blackMarketSell" path="/blackmarket">
                      <input type="hidden" name="resource" value={key} />
                      <CountInput
                        name="amount"
                        ariaLabel={`${label} to sell to the fence`}
                        size={7}
                        max={have}
                        disabled={have <= 0}
                      />
                      <ReqTip
                        heading={`Sell ${label} to the fence`}
                        body={`Instant. ${BLACK_MARKET.SELL_PRICE} gold a unit, paid on the spot — roughly a ${MARKET_PRICE_MIN}× to ${MARKET_PRICE_MAX}× worse price than a caravan would fetch at the Bazaar.`}
                        rows={[
                          {
                            icon: <ResIcon kind={key} size={16} />,
                            label: `Loose ${label}`,
                            need: 1,
                            have,
                          },
                        ]}
                        disabledReason={have <= 0 ? `No loose ${label.toLowerCase()} to sell.` : undefined}
                      >
                        <Btn className={have > 0 ? "btn" : "btn btn-no"} disabled={have <= 0}>
                          Sell
                        </Btn>
                      </ReqTip>
                    </CmdForm>
                  </td>
                  <td>
                    <CmdForm name="blackMarketBuy" path="/blackmarket">
                      <input type="hidden" name="resource" value={key} />
                      <CountInput
                        name="amount"
                        ariaLabel={`${label} to buy from the fence`}
                        size={7}
                        max={affordable}
                        disabled={affordable <= 0}
                      />
                      <ReqTip
                        heading={`Buy ${label} from the fence`}
                        body="Instant and unlimited — the fence never runs out. You are paying above the Bazaar's ceiling for the privilege of not waiting."
                        rows={[
                          {
                            icon: <ResIcon kind="gold" size={16} />,
                            label: "Gold (per unit)",
                            need: BLACK_MARKET.BUY_PRICE,
                            have: p.gold,
                          },
                        ]}
                        disabledReason={
                          affordable <= 0 ? "Not enough gold for even one unit." : undefined
                        }
                      >
                        <Btn className={affordable > 0 ? "btn" : "btn btn-no"} disabled={affordable <= 0}>
                          Buy
                        </Btn>
                      </ReqTip>
                    </CmdForm>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel
        title="🔨 Breaker's yard — sell siege engines"
        info={`The fence buys engines by the pound. You get ${Math.round(SIEGE_SALVAGE_VALUE * 100)}% of the build cost back in gold, wood and ore, scaled by what condition the engine is in — a wreck is worth less than a whole machine. Mend before you sell if you mean to sell at all.`}
        guide="/guide#battle"
      >
        {engines.length === 0 ? (
          <p style={{ fontSize: 13.5, fontStyle: "italic", color: "var(--ink-soft)", margin: 0 }}>
            The yard is empty — you own no engines to break up. Build them at the{" "}
            <a href="/siege">Siege Works</a>.
          </p>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Engine</th>
                  <th className="num">Owned</th>
                  <th className="num">Condition</th>
                  <th className="num">Salvage each</th>
                  <th>Break up</th>
                </tr>
              </thead>
              <tbody>
                {engines.map((row) => {
                  const pct = Math.round(row.integrity * 100);
                  const m = SIEGE_SALVAGE_VALUE * row.integrity;
                  const back = {
                    gold: Math.round(row.spec.gold * m),
                    wood: Math.round(row.spec.wood * m),
                    ore: Math.round(row.spec.ore * m),
                  };
                  const tone = pct >= 80 ? "ok" : pct >= 50 ? "warn" : "bad";
                  return (
                    <tr key={row.key}>
                      <td>{row.name}</td>
                      <td className="num">{fmt(row.count)}</td>
                      <td className="num">
                        <span className={`siege-chip ${tone}`}>{pct}%</span>
                      </td>
                      <td className="num">
                        <span className="res-cost">
                          {back.gold} <ResIcon kind="gold" size={18} />
                          {back.wood > 0 && (
                            <>
                              {" "}
                              {back.wood} <ResIcon kind="wood" size={18} />
                            </>
                          )}
                          {back.ore > 0 && (
                            <>
                              {" "}
                              {back.ore} <ResIcon kind="ore" size={18} />
                            </>
                          )}
                        </span>
                      </td>
                      <td>
                        <CmdForm name="sellSiege" path="/blackmarket">
                          <input type="hidden" name="type" value={row.key} />
                          <CountInput
                            ariaLabel={`${row.name} to break up`}
                            size={3}
                            max={row.count}
                          />
                          <ReqTip
                            heading={`Break up ${row.name}`}
                            body={`Returns ${Math.round(SIEGE_SALVAGE_VALUE * 100)}% of the build cost, scaled by condition — these are at ${pct}%. Gone for good once sold.`}
                            note={
                              pct < 100
                                ? "Worn engines salvage for less. Mending first at the Siege Works may net you more."
                                : undefined
                            }
                          >
                            <Btn className="btn ghost">
                              Salvage {Math.round(SIEGE_SALVAGE_VALUE * 100)}%
                            </Btn>
                          </ReqTip>
                        </CmdForm>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
