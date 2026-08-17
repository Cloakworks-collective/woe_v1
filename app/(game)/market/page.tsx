import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { CountInput } from "@/components/CountInput";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { PriceChart } from "@/components/PriceChart";
import { ResIcon } from "@/components/ResIcon";
import { BLACK_MARKET, MARKET_FEE, MARKET_PRICE_MAX, MARKET_PRICE_MIN, MARKET_RECALL_LOSS } from "@/lib/constants";
import { caravanArrived, caravanCapacity, caravanDeliveryTurnsFor, freeMerchants, level, marketPrice, recallReturn, type Resource } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const metadata = { title: "Market" };

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
/** Turns → "16h 40m" style, at 10 real minutes per turn. */
function turnsToTime(turns: number): string {
  const mins = turns * 10;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
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
  const tick = world.meta.tickNumber;
  const myOrders = world.orders.filter((o) => o.sellerId === p.id);
  const merchantsFree = freeMerchants(p, world.orders);
  const capacity = caravanCapacity(p);
  const marketLevel = level(p, "market_square");
  const deliveryTurns = caravanDeliveryTurnsFor(p);

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#rich">Using the market to get rich</LearnLink>
      <div id="buy">
      <Panel
        title="The Grand Bazaar — anonymous by law"
        info={`You trade with the Bazaar, never with a named player. A ${MARKET_FEE * 100}% fee on every sale is burned — the drain that keeps gold meaningful. Asks are ${MARKET_PRICE_MIN}–${MARKET_PRICE_MAX} gold: the Black Market will always pay you ${BLACK_MARKET.SELL_PRICE} and always sell to you at ${BLACK_MARKET.BUY_PRICE}, so every price here beats dealing with the fence.`}
        guide="/guide#market-mastery"
      >
        <p className="delivery-note" style={{ marginBottom: 10 }}>
          <span aria-hidden="true">⚖️</span>
          <span>
            Fence pays <b>{BLACK_MARKET.SELL_PRICE}</b> · the Bazaar trades{" "}
            <b>{MARKET_PRICE_MIN}–{MARKET_PRICE_MAX}</b> · fence sells at{" "}
            <b>{BLACK_MARKET.BUY_PRICE}</b>. Patience is worth gold — the{" "}
            <a href="/blackmarket">Black Market</a> is instant and always the worse deal.
          </span>
        </p>
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
              // Only ARRIVED caravans (not your own) are buyable and count toward
              // price & supply — en-route goods aren't at the Bazaar yet.
              const price = marketPrice(
                world.orders.filter((o) => o.sellerId !== p.id),
                key,
                tick,
              );
              const supply = world.orders
                .filter((o) => o.resource === key && o.sellerId !== p.id && caravanArrived(o, tick))
                .reduce((s, o) => s + o.remaining, 0);
              return (
                <tr key={key} id={`buy-${key}`}>
                  <td>
                    <span className="res-cost">
                      <ResIcon kind={key} size={60} /> {label}
                    </span>
                  </td>
                  <td className="num">
                    {price === null ? (
                      "— no asks —"
                    ) : (
                      <span className="res-cost">
                        {Math.round(price)} <ResIcon kind="gold" size={20} />
                      </span>
                    )}
                  </td>
                  <td className="num">{fmt(supply)}</td>
                  <td>
                    <CmdForm name="marketBuy" path="/market">
                      <input type="hidden" name="resource" value={key} />
                      <CountInput
                        name="amount"
                        ariaLabel={`${label} to buy`}
                        size={6}
                        max={price === null ? undefined : Math.min(supply, Math.floor(p.gold / Math.max(1, Math.round(price))))}
                      />
                      {price === null ? (
                        <ReqTip
                          heading={`Buy ${label}`}
                          body="Buy loose goods from the Bazaar, filling the cheapest asks first."
                          disabledReason={`No asks for ${label.toLowerCase()} right now — nobody is selling. Check back, or post your own caravan below.`}
                        >
                          <Btn className="btn" disabled>
                            Buy
                          </Btn>
                        </ReqTip>
                      ) : (
                        <ReqTip
                          heading={`Buy ${label}`}
                          rows={[{ icon: <ResIcon kind="gold" size={16} />, label: `Gold (per ${label.toLowerCase()})`, need: Math.round(price), have: p.gold }]}
                          note="Fills cheapest-first — total ≈ price × amount, so the whole order costs more if it climbs the asks."
                        >
                          <Btn className="btn">Buy</Btn>
                        </ReqTip>
                      )}
                    </CmdForm>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      </div>

      <Panel
        title={`Your Caravans — ${merchantsFree} merchant${merchantsFree === 1 ? "" : "s"} free · each carries up to ${fmt(capacity)}`}
        info={`Send a caravan to sell loose goods at the Bazaar: set an amount and your ask in gold per unit, then dispatch it. One merchant rides per caravan (raise the Market Square for more), and each carries up to ${fmt(capacity)} goods. The caravan must TRAVEL to the Bazaar before its goods go on sale — ${deliveryTurns} turns at your Market Square level ${marketLevel} (a bigger market means faster roads: 100 turns at L1 down to 10 at L10). Gold arrives as it sells; recalling returns the goods and frees the merchant.`}
      >
        <div className="delivery-note">
          <span className="delivery-note-cart cart-flip" aria-hidden="true">🐫</span>
          <span>
            At <b>Market Square L{marketLevel}</b>, a new caravan reaches the Bazaar in{" "}
            <b>{deliveryTurns} turns</b> <span className="delivery-note-time">(~{turnsToTime(deliveryTurns)})</span>
            {marketLevel < 10 && (
              <>
                {" "}
                — <a href="/buildings">raise the Market Square</a> to shorten the road (10 turns at L10).
              </>
            )}
          </span>
        </div>
        {merchantsFree === 0 && (
          <p className="siege-warn" style={{ marginBottom: 10 }}>
            ⚠ No merchants are free — recall a caravan below, or raise your{" "}
            <a href="/buildings">Market Square</a> to seat more.
          </p>
        )}
        <div className="tbl-scroll">
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
              const price = marketPrice(world.orders.filter((o) => o.sellerId !== p.id), key, tick);
              const canSend = merchantsFree > 0 && loose > 0;
              const fid = `caravan-${key}`;
              const maxAmt = Math.min(loose, capacity);
              return (
                <tr key={key}>
                  <td>
                    <span className="res-cost">
                      <ResIcon kind={key} size={60} /> {label}
                    </span>
                  </td>
                  <td className="num">{fmt(loose)}</td>
                  <td className="num">
                    {price === null ? (
                      <span style={{ color: "var(--ink-soft)" }}>—</span>
                    ) : (
                      <span className="res-cost">
                        {Math.round(price)} <ResIcon kind="gold" size={20} />
                      </span>
                    )}
                  </td>
                  <td>
                    <CountInput
                      form={fid}
                      name="amount"
                      placeholder={maxAmt > 0 ? `up to ${fmt(maxAmt)}` : "0"}
                      ariaLabel={`Amount of ${label} to sell`}
                      size={9}
                      disabled={!canSend}
                      max={maxAmt}
                    />
                  </td>
                  <td>
                    <span className="res-cost">
                      <input
                        form={fid}
                        name="price"
                        type="number"
                        min={MARKET_PRICE_MIN}
                        max={MARKET_PRICE_MAX}
                        step={1}
                        placeholder={`${MARKET_PRICE_MIN}–${MARKET_PRICE_MAX}`}
                        defaultValue={price === null ? undefined : Math.round(price)}
                        aria-label={`${label} ask price per unit`}
                        size={6}
                        disabled={!canSend}
                        style={{ font: "14px Verdana", padding: 3, width: 74 }}
                      />
                      <ResIcon kind="gold" size={20} />
                    </span>
                  </td>
                  <td>
                    <CmdForm id={fid} name="marketPost" path="/market">
                      <input type="hidden" name="resource" value={key} />
                      <ReqTip
                        heading={`Send a caravan of ${label}`}
                        body="Dispatch a caravan to sell your loose goods at the Bazaar. One merchant rides per caravan; the gold arrives as units sell."
                        rows={[
                          { icon: <span className="costtip-ico">🐫</span>, label: "Free merchant", need: 1, have: merchantsFree },
                          { icon: <ResIcon kind={key} size={16} />, label: `Loose ${label}`, need: 1, have: loose },
                        ]}
                        note={`Carries up to ${fmt(capacity)} goods and takes ${deliveryTurns} turns to reach the Bazaar (Market Square L${marketLevel}). Raise it for more capacity and faster roads.`}
                        disabledReason={
                          canSend
                            ? undefined
                            : merchantsFree === 0
                              ? "No free merchants — recall a caravan or raise the Market Square."
                              : `No loose ${label} in store to sell.`
                        }
                      >
                        <Btn className={canSend ? "btn" : "btn btn-no"} disabled={!canSend}>
                          🐫 Send caravan
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

        {myOrders.length === 0 ? (
          <p style={{ fontSize: 13.5, fontStyle: "italic", color: "var(--ink-soft)", margin: "12px 0 0" }}>
            The stables stand quiet — no caravans on the road. Load one above and the gold will follow.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13.5, fontWeight: 600, margin: "12px 0 4px" }}>
              🐫 Caravans on the road ({myOrders.length})
            </p>
            <div className="tbl-scroll">
            <table className="tbl caravan-road-tbl" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th>Caravan</th>
                  <th className="num">Remaining</th>
                  <th className="num">Ask</th>
                  <th>Journey to the Bazaar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {myOrders.map((o) => {
                  const arrivesAt = o.arrivesAtTick ?? o.createdTick;
                  const enRoute = !caravanArrived(o, tick);
                  const total = Math.max(1, arrivesAt - o.createdTick);
                  const pct = enRoute
                    ? Math.min(98, Math.max(2, Math.round(((tick - o.createdTick) / total) * 100)))
                    : 100;
                  const turnsLeft = Math.max(0, arrivesAt - tick);
                  return (
                    <tr key={o.id}>
                      <td>
                        <span className="res-cost">
                          <ResIcon kind={o.resource} size={48} /> {o.resource}
                        </span>
                      </td>
                      <td className="num">{fmt(o.remaining)}</td>
                      <td className="num">
                        <span className="res-cost">
                          {Math.round(o.pricePerUnit)} <ResIcon kind="gold" size={20} />
                        </span>
                      </td>
                      <td>
                        <div className={`caravan-road${enRoute ? " enroute" : " arrived"}`}>
                          <div className="caravan-road-track">
                            <i className="caravan-road-fill" style={{ width: `${pct}%` }} />
                            <span className="caravan-road-cart" style={{ left: `${pct}%` }} aria-hidden="true">
                              <span className="cart-flip">🐫</span>
                            </span>
                            <span className="caravan-road-dest" aria-hidden="true">🏪</span>
                          </div>
                          <span className="caravan-road-label">
                            {enRoute
                              ? `en route — arrives in ${turnsLeft} turn${turnsLeft === 1 ? "" : "s"} (~${turnsToTime(turnsLeft)})`
                              : "✓ at the Bazaar — selling"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <CmdForm name="marketCancel" path="/market">
                          <input type="hidden" name="orderId" value={o.id} />
                          <ReqTip
                            heading={`Recall — lose ${Math.round(MARKET_RECALL_LOSS * 100)}%`}
                            body={
                              enRoute
                                ? `Turn the caravan around before it arrives. Part of the load is lost on the road home: of ${fmt(o.remaining)} ${o.resource}, only ${fmt(recallReturn(p, o.remaining))} reaches your stores.`
                                : `Bring the caravan home. Part of the unsold load is lost on the road: of ${fmt(o.remaining)} ${o.resource}, only ${fmt(recallReturn(p, o.remaining))} reaches your stores.`
                            }
                            note="The merchant is freed either way, and gold already earned from units that sold stays yours. Sell to the Black Market instead if you only need the gold."
                          >
                            <Btn className="btn" style={{ background: "linear-gradient(#a8853f,#7c5426)", borderColor: "#4e3113" }}>
                              Recall −{Math.round(MARKET_RECALL_LOSS * 100)}%
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
