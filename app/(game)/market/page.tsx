import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { Panel } from "@/components/Panel";
import { PriceChart } from "@/components/PriceChart";
import { ResIcon } from "@/components/ResIcon";
import { MARKET_FEE } from "@/lib/constants";
import { caravanCapacity, freeMerchants, marketPrice, type Resource } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const RESOURCES: { key: Resource; label: string; icon: string }[] = [
  { key: "food", label: "Food", icon: "🍞" },
  { key: "wood", label: "Wood", icon: "🪵" },
  { key: "stone", label: "Stone", icon: "🪨" },
  { key: "ore", label: "Ore", icon: "⚒️" },
];

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, player: p } = await getGame();
  const myOrders = world.orders.filter((o) => o.sellerId === p.id);
  const merchantsFree = freeMerchants(p, world.orders);
  const capacity = caravanCapacity(p);

  return (
    <>
      <Flash err={err} ok={ok} />
      <Panel
        title="The Grand Bazaar — anonymous by law"
        info={`You trade with the Bazaar, never with a named player. A ${MARKET_FEE * 100}% fee on every sale is burned — the drain that keeps gold meaningful.`}
        guide="/guide#grow"
      >
        <table className="tbl">
          <thead>
            <tr>
              <th>Resource</th>
              <th className="num">Market price (lowest ask)</th>
              <th className="num">Total supply</th>
              <th>Buy (fills cheapest-first)</th>
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map(({ key, label }) => {
              const price = marketPrice(
                world.orders.filter((o) => o.sellerId !== p.id),
                key,
              );
              const supply = world.orders
                .filter((o) => o.resource === key && o.sellerId !== p.id)
                .reduce((s, o) => s + o.remaining, 0);
              return (
                <tr key={key}>
                  <td>
                    <span className="res-cost">
                      <ResIcon kind={key} size={20} /> {label}
                    </span>
                  </td>
                  <td className="num">
                    {price === null ? (
                      "— no asks —"
                    ) : (
                      <span className="res-cost">
                        {Math.round(price)} <ResIcon kind="gold" size={14} />
                      </span>
                    )}
                  </td>
                  <td className="num">{fmt(supply)}</td>
                  <td>
                    <CmdForm name="marketBuy" path="/market">
                      <input type="hidden" name="resource" value={key} />
                      <input name="amount" placeholder="#" aria-label={`${label} to buy`} size={6} style={{ font: "14.5px Verdana", padding: 2 }} />
                      <button className="btn" disabled={price === null}>
                        Buy
                      </button>
                    </CmdForm>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel
        title={`Your Caravans — ${merchantsFree} merchant${merchantsFree === 1 ? "" : "s"} free · each carries up to ${fmt(capacity)}`}
        info={`Send a caravan to sell loose goods at the Bazaar: set an amount and your ask in gold per unit, then dispatch it. One merchant rides per caravan (raise the Market Square for more), and each carries up to ${fmt(capacity)} goods. Gold arrives as it sells; recalling returns the goods and frees the merchant. The going market price is shown to help you price it.`}
      >
        {merchantsFree === 0 && (
          <p className="siege-warn" style={{ marginBottom: 10 }}>
            ⚠ No merchants are free — recall a caravan below, or raise your{" "}
            <a href="/buildings">Market Square</a> to seat more.
          </p>
        )}
        <table className="tbl caravan-tbl">
          <thead>
            <tr>
              <th>Goods to sell</th>
              <th className="num">Loose in store</th>
              <th className="num">Market price</th>
              <th>Amount</th>
              <th>Your ask (gold / unit)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map(({ key, label }) => {
              const loose = p.resources[key];
              const price = marketPrice(world.orders.filter((o) => o.sellerId !== p.id), key);
              const canSend = merchantsFree > 0 && loose > 0;
              const fid = `caravan-${key}`;
              const maxAmt = Math.min(loose, capacity);
              return (
                <tr key={key}>
                  <td>
                    <span className="res-cost">
                      <ResIcon kind={key} size={20} /> {label}
                    </span>
                  </td>
                  <td className="num">{fmt(loose)}</td>
                  <td className="num">
                    {price === null ? (
                      <span style={{ color: "var(--ink-soft)" }}>—</span>
                    ) : (
                      <span className="res-cost">
                        {Math.round(price)} <ResIcon kind="gold" size={14} />
                      </span>
                    )}
                  </td>
                  <td>
                    <input
                      form={fid}
                      name="amount"
                      placeholder={maxAmt > 0 ? `up to ${fmt(maxAmt)}` : "0"}
                      aria-label={`Amount of ${label} to sell`}
                      size={9}
                      disabled={!canSend}
                      style={{ font: "14px Verdana", padding: 3 }}
                    />
                  </td>
                  <td>
                    <span className="res-cost">
                      <input
                        form={fid}
                        name="price"
                        type="number"
                        min={2}
                        max={50}
                        step={1}
                        placeholder="2–50"
                        defaultValue={price === null ? undefined : Math.round(price)}
                        aria-label={`${label} ask price per unit`}
                        size={6}
                        disabled={!canSend}
                        style={{ font: "14px Verdana", padding: 3, width: 74 }}
                      />
                      <ResIcon kind="gold" size={14} />
                    </span>
                  </td>
                  <td>
                    <CmdForm id={fid} name="marketPost" path="/market">
                      <input type="hidden" name="resource" value={key} />
                      <button
                        className={canSend ? "btn" : "btn btn-no"}
                        disabled={!canSend}
                        title={
                          canSend
                            ? `Send a caravan of ${label} to the Bazaar`
                            : merchantsFree === 0
                              ? "No free merchants — recall a caravan or raise the Market Square"
                              : `No loose ${label} to sell`
                        }
                      >
                        🐫 Send caravan
                      </button>
                    </CmdForm>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {myOrders.length > 0 && (
          <>
            <p style={{ fontSize: 13.5, fontWeight: 600, margin: "12px 0 4px" }}>
              🐫 Caravans on the road ({myOrders.length})
            </p>
            <table className="tbl" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th>Caravan</th>
                  <th className="num">Remaining</th>
                  <th className="num">Ask</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {myOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <span className="res-cost">
                        <ResIcon kind={o.resource} size={16} /> {o.resource}
                      </span>
                    </td>
                    <td className="num">{fmt(o.remaining)}</td>
                    <td className="num">
                      <span className="res-cost">
                        {Math.round(o.pricePerUnit)} <ResIcon kind="gold" size={14} />
                      </span>
                    </td>
                    <td>
                      <CmdForm name="marketCancel" path="/market">
                        <input type="hidden" name="orderId" value={o.id} />
                        <button className="btn" style={{ background: "linear-gradient(#a8853f,#7c5426)", borderColor: "#4e3113" }}>
                          Recall
                        </button>
                      </CmdForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <Panel
        title="Price History — the pulse of the war economy (hourly)"
        info="War zones starve and prices spike; peacetime gluts crash them. Gaps mean nothing was for sale at all."
      >
        <div className="chart-grid">
          <PriceChart title="🍞 Food" series={world.priceHistory?.food ?? []} color="#b8901e" />
          <PriceChart title="🪵 Wood" series={world.priceHistory?.wood ?? []} color="#5c7a1e" />
          <PriceChart title="🪨 Stone" series={world.priceHistory?.stone ?? []} color="#7a7a82" />
          <PriceChart title="⚒️ Ore" series={world.priceHistory?.ore ?? []} color="#a0521e" />
        </div>
      </Panel>
    </>
  );
}
