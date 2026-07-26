import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { Pills } from "@/components/Pills";
import { ResIcon, type ResKind } from "@/components/ResIcon";
import {
  ACTION_GUIDE,
  ACTION_INFO,
  MERC_CAP_RATIO,
  MERC_PRICE_GOLD,
  RACES,
  TIER_COST_MULT,
  TIER_INFO,
  TRAINING_COSTS,
  TROOPS_PER_MUSTER_HALL,
  UNIT_GUIDE,
  UNIT_INFO,
} from "@/lib/constants";
import {
  civilians,
  level,
  mercTotal,
  military,
  safeDischargeCount,
  troopTotal,
  wonderDiscount,
  type Tier,
  type TroopType,
} from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const CORPS: { type: TroopType; key: "footmen" | "archers" | "cavalry"; label: string; trainer: string }[] = [
  { type: "footman", key: "footmen", label: "Footmen", trainer: "Drill Yard" },
  { type: "archer", key: "archers", label: "Archers", trainer: "Fletcher's Range" },
  { type: "cavalry", key: "cavalry", label: "Cavalry", trainer: "Knights' Stables" },
];
const TIERS: Tier[] = ["light", "medium", "heavy"];

type Cost = { gold: number; wood: number; stone: number; ore: number };

/** One priced resource: pixel icon + amount (never "100 g" — always the token). */
function CostBit({ kind, amount }: { kind: ResKind; amount: number }) {
  return (
    <span className="cost-bit">
      <ResIcon kind={kind} size={16} /> {amount.toLocaleString("en-US")}
    </span>
  );
}

/** The gold/wood/stone/ore icons + amounts for a cost, scaled by a tier mult. */
function CostBits({ cost, mult = 1 }: { cost: Cost; mult?: number }) {
  const bits: { kind: ResKind; amount: number }[] = [{ kind: "gold", amount: cost.gold * mult }];
  if (cost.wood > 0) bits.push({ kind: "wood", amount: cost.wood * mult });
  if (cost.stone > 0) bits.push({ kind: "stone", amount: cost.stone * mult });
  if (cost.ore > 0) bits.push({ kind: "ore", amount: cost.ore * mult });
  return (
    <span className="cost-row">
      {bits.map((b) => (
        <CostBit key={b.kind} kind={b.kind} amount={b.amount} />
      ))}
    </span>
  );
}

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
  const mercInService = mercTotal(p.army.mercenaries);
  const mercPriceLight = Math.round(MERC_PRICE_GOLD * RACES[p.race].mercCost * (1 - discount));

  const musterFree = level(p, "muster_hall") * TROOPS_PER_MUSTER_HALL - military(p);
  const housingFree = level(p, "hearthstead") * 10 - civilians(p);
  const safeDischarge = safeDischargeCount(p);
  const foundry = level(p, "war_foundry");

  // Can we afford at least one of a priced thing? (Green button / dull-red when
  // short — recomputed each render, since the page reloads after every action.)
  const canAfford = (c: Cost, mult = 1) =>
    p.gold >= (c.gold ?? 0) * mult &&
    p.resources.wood >= (c.wood ?? 0) * mult &&
    p.resources.stone >= (c.stone ?? 0) * mult &&
    p.resources.ore >= (c.ore ?? 0) * mult;
  const canTrainOne = (type: keyof typeof TRAINING_COSTS) =>
    p.idlePeasants >= 1 && musterFree >= 1 && canAfford(TRAINING_COSTS[type], TIER_COST_MULT.light);
  const canHireMerc = mercInService < mercCap && p.gold >= mercPriceLight;

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#army">Building an army — tiers &amp; mercenaries</LearnLink>
      <Panel
        title={`The Army — ${p.idlePeasants} idle peasants, ${musterFree} Muster Hall slots free`}
        info="Peasants are trained straight into footmen/archers/cavalry — no warrior step. Tier N needs its trainer at level N and The Forge at level N, plus a free Muster Hall slot. Discharge sends a soldier home (their gear is lost) if a Hearthstead bed stands empty."
        guide="/guide#army"
      >
        <div className="card-grid">
          {CORPS.map(({ type, key, label, trainer }) => (
            <div className="bcard" key={type}>
              <div className="bcard-head">
                <span className="bcard-art">
                  <Art path={`units/${type}`} size={72} title={label} />
                </span>
                <div>
                  <Info tip={UNIT_INFO[type].tip} title={UNIT_INFO[type].title} guide={UNIT_GUIDE[type]}>
                    <span className="bcard-name">{label}</span>
                  </Info>
                  <div className="bcard-sub">trained at the {trainer}</div>
                </div>
              </div>

              {/* Cost per tier — one bullet each, resources shown as pixel tokens. */}
              <ul className="cost-list">
                {TIERS.map((t) => (
                  <li key={t}>
                    <span className="cost-tier">{t}</span>
                    <span className="cost-have">have {p.army[key][t]}</span>
                    <CostBits cost={TRAINING_COSTS[type]} mult={TIER_COST_MULT[t]} />
                  </li>
                ))}
              </ul>

              <div className="troop-form">
                <div className="troop-form-block">
                  <span className="troop-form-label">Train — from idle peasants</span>
                  <CmdForm name="trainTroops" path="/troops">
                    <input type="hidden" name="type" value={type} />
                    <div className="troop-form-line">
                      <Pills
                        name="tier"
                        ariaLabel={`${label} tier to train`}
                        options={TIERS.map((t) => ({ value: t, label: t, title: TIER_INFO[t] }))}
                      />
                      <input name="count" placeholder="#" aria-label={`${label} to train`} size={3} style={{ font: "13.5px Verdana", padding: 3 }} />
                      <button
                        className={canTrainOne(type) ? "btn" : "btn btn-no"}
                        disabled={!canTrainOne(type)}
                        title={
                          canTrainOne(type)
                            ? undefined
                            : "Can't raise even one light — need an idle peasant, a free Muster Hall bed, and the gold/ore"
                        }
                      >
                        Train
                      </button>
                    </div>
                  </CmdForm>
                </div>
                <div className="troop-form-block">
                  <span className="troop-form-label">Discharge — send home (gear lost)</span>
                  <CmdForm name="dischargeTroops" path="/troops">
                    <input type="hidden" name="type" value={type} />
                    <div className="troop-form-line">
                      <Pills name="tier" ariaLabel={`${label} tier to discharge`} options={TIERS.map((t) => ({ value: t, label: t }))} />
                      <input name="count" placeholder="#" aria-label={`${label} to discharge`} size={3} style={{ font: "13.5px Verdana", padding: 3 }} />
                      <button className="btn" style={{ background: "linear-gradient(#a8853f,#7c5426)", borderColor: "#4e3113" }}>
                        Discharge
                      </button>
                    </div>
                  </CmdForm>
                </div>
              </div>
            </div>
          ))}

          {/* Siege engineers — no tiers; crew the engines forged at the Siege Works. */}
          <div className="bcard" key="engineer">
            <div className="bcard-head">
              <span className="bcard-art">
                <Art path="units/engineer" size={72} title="Siege Engineer" />
              </span>
              <div>
                <Info tip={UNIT_INFO.engineer.tip} title={UNIT_INFO.engineer.title} guide={UNIT_GUIDE.engineer}>
                  <span className="bcard-name">Siege Engineers</span>
                </Info>
                <div className="bcard-sub">crew your siege engines</div>
              </div>
            </div>

            <ul className="cost-list">
              <li>
                <span className="cost-tier">each</span>
                <span className="cost-have">have {p.army.siegeEngineers}</span>
                <CostBits cost={TRAINING_COSTS.siegeEngineer} />
              </li>
            </ul>
            <p className="bcard-sub" style={{ margin: "4px 0 0" }}>
              Needs the War Foundry &amp; a free Muster Hall bed.
            </p>

            <div className="troop-form">
              <div className="troop-form-block">
                <span className="troop-form-label">Recruit — from idle peasants</span>
                <CmdForm name="trainEngineers" path="/troops">
                  <div className="troop-form-line">
                    <input name="count" placeholder="#" aria-label="Engineers to train" size={3} style={{ font: "13.5px Verdana", padding: 3 }} />
                    {(() => {
                      const canEng = foundry >= 1 && p.idlePeasants >= 1 && musterFree >= 1 && canAfford(TRAINING_COSTS.siegeEngineer);
                      return (
                        <button className={canEng ? "btn" : "btn btn-no"} disabled={!canEng}>
                          Train
                        </button>
                      );
                    })()}
                  </div>
                </CmdForm>
                {foundry < 1 && (
                  <p style={{ fontSize: 13, color: "var(--warn)", margin: 0 }}>
                    Found the <a href="/buildings?tab=military">War Foundry</a> first.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 13.5, marginTop: 10 }}>
          🔥 Stamina {p.army.stamina}/100 · 🎖 Experience {p.army.experience}/100 ·{" "}
          <b>Safe to discharge</b> {safeDischarge} (capped by {housingFree} free bed
          {housingFree === 1 ? "" : "s"} and the 30% guard line)
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
          <CmdForm name="rest" path="/troops">
            <button className="btn">Rest the army (5 turns + 0.2 food/troop → +20 stamina)</button>
          </CmdForm>
          <Info tip={ACTION_INFO.rest} guide={ACTION_GUIDE.rest} />
        </div>
      </Panel>

      <Panel title="The Black Market — hired blades">
        <div style={{ float: "right" }}>
          <Info tip={UNIT_INFO.mercenary.tip} title={UNIT_INFO.mercenary.title} guide={UNIT_GUIDE.mercenary}>
            <Art path="units/mercenary" size={80} title="Mercenary" />
          </Info>
        </div>
        <p style={{ fontSize: 14, maxWidth: 460, margin: "0 0 8px" }}>
          Hired blades come in the same arms and tiers as your own troops — and need the same
          buildings to raise (heavy cavalry needs Knights' Stables 3 + Forge 3). They cost only gold
          (no peasants), <b>die before your matching regulars</b>, draw upkeep every turn, and count
          for nothing on the ranking ladder. Capped at 25% of your regular army.
        </p>

        <dl className="kv" style={{ maxWidth: 460 }}>
          <dt>Sellswords in service</dt>
          <dd>
            {mercInService} / {mercCap}
            {mercInService > 0 && (
              <>
                {" — "}
                {CORPS.filter((c) => troopTotal(p.army.mercenaries[c.key]) > 0)
                  .map((c) => `${troopTotal(p.army.mercenaries[c.key])} ${c.label.toLowerCase()}`)
                  .join(", ")}
              </>
            )}
          </dd>
          <dt>Upkeep</dt>
          <dd>
            <span className="cost-bit"><ResIcon kind="gold" size={16} /> 1</span> each per turn — unpaid
            mercs all defect at once
          </dd>
        </dl>

        {/* Price per tier — gold token, no "g". */}
        <ul className="cost-list" style={{ maxWidth: 320 }}>
          {TIERS.map((t) => (
            <li key={t}>
              <span className="cost-tier">{t}</span>
              <span className="cost-row">
                <CostBit kind="gold" amount={mercPriceLight * TIER_COST_MULT[t]} />
                <span className="bcard-sub">a head</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="troop-form">
          <div className="troop-form-block">
            <span className="troop-form-label">Hire — gold only, no peasants</span>
            <CmdForm name="buyMercs" path="/troops">
              <div className="troop-form-line">
                <Pills
                  name="type"
                  ariaLabel="Mercenary arm to hire"
                  options={CORPS.map((c) => ({ value: c.type, label: c.label, title: UNIT_INFO[c.type].tip }))}
                />
                <Pills
                  name="tier"
                  ariaLabel="Mercenary tier to hire"
                  options={TIERS.map((t) => ({ value: t, label: t, title: TIER_INFO[t] }))}
                />
                <input name="count" placeholder="#" aria-label="Mercenaries to hire" size={4} style={{ font: "14.5px Verdana", padding: 4 }} />
                <button
                  className={canHireMerc ? "btn" : "btn btn-no"}
                  disabled={!canHireMerc}
                  title={
                    canHireMerc
                      ? undefined
                      : mercInService >= mercCap
                        ? "Mercenary cap reached (25% of your regulars)"
                        : "Not enough gold to hire even one"
                  }
                >
                  Hire
                </button>
                <Info tip={ACTION_INFO.hireMercs} guide={ACTION_GUIDE.hireMercs} />
              </div>
            </CmdForm>
          </div>
        </div>
        {discount > 0 && (
          <p style={{ fontSize: 13.5, color: "var(--green-dark)", marginTop: 4 }}>
            Clan Wonder discount: −{Math.round(discount * 100)}% on mercenaries, troops, and siege gear.
          </p>
        )}
      </Panel>

      <Panel title="The Siege Train">
        <p style={{ fontSize: 14.5 }}>
          <Art path="siege/trebuchets" size={56} title="Siege Works" /> Engineers are recruited above,
          alongside your footmen, archers, and cavalry. The <b>engines</b> they crew and the foundry
          ladder live in the <a href="/siege">Siege Works</a> — you hold{" "}
          {Object.values(p.army.siegeGear).reduce((a, b) => a + b, 0)} pieces of gear.
        </p>
      </Panel>
    </>
  );
}
