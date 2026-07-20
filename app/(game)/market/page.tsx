import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { Panel } from "@/components/Panel";
import { Pills } from "@/components/Pills";
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
                        {price} <ResIcon kind="gold" size={14} />
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

      <Panel
        title={`Your Caravans — ${freeMerchants(p, world.orders)} merchants free · capacity ${fmt(caravanCapacity(p))} each`}
        info="One merchant per listed caravan; gold arrives as your goods sell. Recalling returns the goods and frees the merchant."
      >
        <CmdForm name="marketPost" path="/market">
          <Pills
            name="resource"
            ariaLabel="Resource to sell"
            options={RESOURCES.map((r) => ({ value: r.key, label: `${r.icon} ${r.label}` }))}
          />{" "}
          <input name="amount" placeholder="amount" aria-label="Amount to sell" size={7} style={{ font: "14.5px Verdana", padding: 4 }} />
          <input name="price" placeholder="ask/unit" aria-label="Ask price per unit" size={7} style={{ font: "14.5px Verdana", padding: 4 }} />
          <button className="btn">Send caravan</button>
        </CmdForm>
        {myOrders.length > 0 && (
          <table className="tbl" style={{ marginTop: 8 }}>
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
                      {o.pricePerUnit} <ResIcon kind="gold" size={14} />
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
        )}
      </Panel>
    </>
  );
}
