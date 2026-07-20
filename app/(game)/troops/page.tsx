import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { Pills } from "@/components/Pills";
import { ResIcon } from "@/components/ResIcon";
import {
  ACTION_GUIDE,
  ACTION_INFO,
  MERC_CAP_RATIO,
  MERC_PRICE_GOLD,
  RACES,
  TIER_COST_MULT,
  TIER_INFO,
  TRAINING_COSTS,
  UNIT_GUIDE,
  UNIT_INFO,
} from "@/lib/constants";
import { military, wonderDiscount, type Tier, type TroopType } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const CORPS: { type: TroopType; key: "footmen" | "archers" | "cavalry"; label: string; trainer: string }[] = [
  { type: "footman", key: "footmen", label: "Footmen", trainer: "Drill Yard" },
  { type: "archer", key: "archers", label: "Archers", trainer: "Fletcher's Range" },
  { type: "cavalry", key: "cavalry", label: "Cavalry", trainer: "Knights' Stables" },
];
const TIERS: Tier[] = ["light", "medium", "heavy"];

export default async function TroopsPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, player: p } = await getGame();
  const clan = p.clanId ? world.clans[p.clanId] : undefined;
  const discount = wonderDiscount(clan);
  const mercCap = Math.floor(MERC_CAP_RATIO * military(p));
  const mercPrice = Math.round(MERC_PRICE_GOLD * RACES[p.race].mercCost * (1 - discount));

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#army">Building an army — tiers &amp; mercenaries</LearnLink>
      <Panel
        title={`The Army — ${p.warriors} warriors await equipment`}
        info="Tier N needs its trainer at level N and The Forge at level N. Disbanding loses the equipment."
        guide="/guide#army"
      >
        <div className="card-grid">
          {CORPS.map(({ type, key, label, trainer }) => (
            <div className="bcard" key={type}>
              <div className="bcard-head">
                <div>
                  <Info tip={UNIT_INFO[type].tip} title={UNIT_INFO[type].title} guide={UNIT_GUIDE[type]}>
                    <span className="bcard-name">{label}</span>
                  </Info>
                  <div className="bcard-sub">equipped at the {trainer}</div>
                </div>
              </div>
              <div className="bcard-main">
                <span className="bcard-art">
                  <Art path={`units/${type}`} size={96} title={label} />
                </span>
                <div className="bcard-body">
                  <p style={{ margin: "0 0 6px" }}>
                    {TIERS.map((t, i) => (
                      <span key={t}>
                        {i > 0 && " · "}
                        {t} <b>{p.army[key][t]}</b>
                      </span>
                    ))}
                  </p>
                  <ul className="bcard-costs">
                    <li>
                      <ResIcon kind="gold" size={18} /> {TRAINING_COSTS[type].gold}
                      {TRAINING_COSTS[type].wood > 0 && (
                        <>
                          {" "}
                          <ResIcon kind="wood" size={18} /> {TRAINING_COSTS[type].wood}
                        </>
                      )}
                      {TRAINING_COSTS[type].ore > 0 && (
                        <>
                          {" "}
                          <ResIcon kind="ore" size={18} /> {TRAINING_COSTS[type].ore}
                        </>
                      )}
                      <span className="bcard-sub" title="Medium costs double, heavy quadruple">
                        per light · ×2/×4 heavier
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                <CmdForm name="equipTroops" path="/troops">
                  <input type="hidden" name="type" value={type} />
                  <Pills
                    name="tier"
                    ariaLabel={`${label} tier to equip`}
                    options={TIERS.map((t) => ({
                      value: t,
                      label: `${t} ${TRAINING_COSTS[type].gold * TIER_COST_MULT[t]}g`,
                      title: TIER_INFO[t],
                    }))}
                  />{" "}
                  <input name="count" placeholder="#" aria-label={`${label} to equip`} size={3} style={{ font: "13.5px Verdana", padding: 3 }} />
                  <button className="btn">Equip</button>
                </CmdForm>
                <CmdForm name="disbandTroops" path="/troops">
                  <input type="hidden" name="type" value={type} />
                  <Pills name="tier" ariaLabel={`${label} tier to disband`} options={TIERS.map((t) => ({ value: t, label: t }))} />{" "}
                  <input name="count" placeholder="#" aria-label={`${label} to disband`} size={3} style={{ font: "13.5px Verdana", padding: 3 }} />
                  <button className="btn" style={{ background: "linear-gradient(#a8853f,#7c5426)", borderColor: "#4e3113" }}>
                    Disband
                  </button>
                </CmdForm>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13.5, marginTop: 6 }}>
          🔥 Stamina {p.army.stamina}/100 · 🎖 Experience {p.army.experience}/100
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
          <CmdForm name="rest" path="/troops">
            <button className="btn">Rest the army (5 turns + 0.2 food/troop → +20 stamina)</button>
          </CmdForm>
          <Info tip={ACTION_INFO.rest} guide={ACTION_GUIDE.rest} />
        </div>
      </Panel>

      <Panel title={`The Black Market — sellswords at ${mercPrice}g a head`}>
        <div style={{ float: "right" }}>
          <Info tip={UNIT_INFO.mercenary.tip} title={UNIT_INFO.mercenary.title} guide={UNIT_GUIDE.mercenary}>
            <Art path="units/mercenary" size={80} title="Mercenary" />
          </Info>
        </div>
        <dl className="kv" style={{ maxWidth: 420 }}>
          <dt>Mercenaries in service</dt>
          <dd>
            {p.army.mercenaries} / {mercCap} (25% of regulars)
          </dd>
          <dt>Upkeep</dt>
          <dd>10 gold each per turn — unpaid mercs defect</dd>
        </dl>
        <CmdForm name="buyMercs" path="/troops">
          <input name="count" placeholder="#" aria-label="Mercenaries to hire" size={4} style={{ font: "14.5px Verdana", padding: 4 }} />
          <button className="btn">Hire</button>
          <span style={{ marginLeft: 6 }}><Info tip={ACTION_INFO.hireMercs} guide={ACTION_GUIDE.hireMercs} /></span>
        </CmdForm>
        {discount > 0 && (
          <p style={{ fontSize: 13.5, color: "var(--green-dark)", marginTop: 4 }}>
            Clan Wonder discount: −{Math.round(discount * 100)}% on mercenaries, troops, and siege gear.
          </p>
        )}
      </Panel>

      <Panel title="The Siege Train">
        <p style={{ fontSize: 14.5 }}>
          <Art path="siege/trebuchets" size={56} title="Siege Works" /> Engines, engineers, and the
          foundry ladder now live in the <a href="/siege">Siege Works</a> — {p.army.siegeEngineers}{" "}
          engineers, {Object.values(p.army.siegeGear).reduce((a, b) => a + b, 0)} pieces of gear.
        </p>
      </Panel>
    </>
  );
}
