
import { BareBadge } from "@/components/BareBadge";
import { Btn } from "@/components/Btn";
import { Art } from "@/components/Art";
import { TiredArt } from "@/components/TiredArt";
import { CmdForm } from "@/components/CmdForm";
import { CountInput } from "@/components/CountInput";
import { Meter } from "@/components/Meter";
import { ReqTip, type Req } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { Pills } from "@/components/Pills";
import { ResIcon, type ResKind } from "@/components/ResIcon";
import {
  ACTION_GUIDE,
  ACTION_INFO,
  MERCENARIES,
  TIER_COST_MULT,
  TIER_INFO,
  TRAINING_COSTS,
  TROOPS_PER_MUSTER_HALL,
  UNIT_GUIDE,
  UNIT_INFO,
  EXPERIENCE,
} from "@/lib/constants";
import {
  civilians,
  level,
  MERC_ARMS,
  mercPrice,
  mercTotal,
  military,
  trainingCost,
  safeDischargeCount,
  troopTotal,
  wonderDiscount,
  type MercArm,
  type Tier,
  type TroopType,
  purseGold,
  purseRes,
  veterancyBonus,
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

// Resource requirement rows (icon + need vs have) for a hover cost table.
function resReqs(cost: Cost, have: Cost): Req[] {
  const order: [ResKind, string][] = [
    ["wood", "Wood"],
    ["stone", "Stone"],
    ["ore", "Ore"],
    ["gold", "Gold"],
  ];
  return order
    .filter(([k]) => (cost[k as keyof Cost] ?? 0) > 0)
    .map(([k, label]) => ({
      icon: <ResIcon kind={k} size={16} />,
      label,
      need: cost[k as keyof Cost],
      have: have[k as keyof Cost],
    }));
}
const PEASANT_ROW = (need: number, have: number): Req => ({
  icon: <span className="costtip-ico">👥</span>,
  label: "Idle peasant",
  need,
  have,
});
const BED_ROW = (need: number, have: number): Req => ({
  icon: <span className="costtip-ico">🛏</span>,
  label: "Muster Hall bed",
  need,
  have,
});

export default async function TroopsPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, player: p } = await getGame();
  const clan = p.clanId ? world.clans[p.clanId] : undefined;
  const discount = wonderDiscount(clan);
  const mercCap = Math.floor(MERCENARIES.CAP_RATIO * military(p));
  const mercInService = mercTotal(p.army.mercenaries);
  // Per ARM and per TIER, straight from the engine — this used to be a local
  // recompute off the flat MERC_PRICE_GOLD, which quoted 900 for a cavalry
  // sellsword the engine charged 1,400 for, and ignored Free Companies entirely.
  const mercAsk = (arm: MercArm, tier: Tier = "light") => mercPrice(p, arm, tier, discount);
  const mercPriceLight = mercAsk("footman");
  // The arms THIS page raises. Spies and rangers are hired on Workers & Levy,
  // beside the control that trains them — a covert corps split across two pages
  // read as if the shadow war were an afterthought to the battle line.
  const HIRABLE_HERE = MERC_ARMS.filter((a) => a !== "spy" && a !== "scout");
  const mercPriceDearest = Math.max(...HIRABLE_HERE.map((a) => mercAsk(a)));

  const musterFree = level(p, "muster_hall") * TROOPS_PER_MUSTER_HALL - military(p);
  const housingFree = level(p, "hearthstead") * 10 - civilians(p);
  const safeDischarge = safeDischargeCount(p);
  const foundry = level(p, "war_foundry");
  // Loose AND vaulted: `pay` spends the loose pile first and takes the rest
  // from the store, so a check against loose alone blocks purchases the engine
  // would happily allow.
  const have: Cost = {
    gold: purseGold(p),
    wood: purseRes(p, "wood"),
    stone: purseRes(p, "stone"),
    ore: purseRes(p, "ore"),
  };

  // Can we afford at least one of a priced thing? (Green button / dull-red when
  // short — recomputed each render, since the page reloads after every action.)
  const canAfford = (c: Cost, mult = 1) =>
    have.gold >= (c.gold ?? 0) * mult &&
    have.wood >= (c.wood ?? 0) * mult &&
    have.stone >= (c.stone ?? 0) * mult &&
    have.ore >= (c.ore ?? 0) * mult;
  // The bill as `pay` will compute it — King's Roads discount and all. Showing
  // the undiscounted TRAINING_COSTS here told a ruler with metalled roads the
  // wrong price AND gated affordability against a number they were not charged.
  const trainAsk = (type: TroopType, tier: Tier = "light") => trainingCost(p, type, tier, 1);
  const canTrainOne = (type: TroopType) =>
    p.idlePeasants >= 1 && musterFree >= 1 && canAfford(trainAsk(type), 1);
  const canHireMerc = mercInService < mercCap && have.gold >= mercPriceLight;

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#army">Building an army — tiers &amp; mercenaries</LearnLink>
      <div id="train">
      <Panel
        title={`The Army — ${p.idlePeasants} idle peasants, ${musterFree} Muster Hall slots free`}
        info="Peasants are trained straight into footmen/archers/cavalry — no warrior step. Tier N needs that arm's trainer at level N, plus a free Muster Hall slot. The Forge and Armoury no longer gate tiers; they add attack and defence to every regular instead. Discharge sends a soldier home (their gear is lost) if a Hearthstead bed stands empty."
        guide="/guide#army"
      >
        <div className="card-grid">
          {CORPS.map(({ type, key, label, trainer }) => (
            <div className="bcard" key={type}>
              <div className="bcard-head">
                <span className="bcard-art">
                  <TiredArt path={`units/${type}`} stamina={p.army.stamina} size={216} title={label} race={p.race} />
                </span>
                <div>
                  <Info tip={UNIT_INFO[type].tip} title={UNIT_INFO[type].title} guide={UNIT_GUIDE[type]}>
                    <span className="bcard-name">{label}</span>
                  </Info>
                  {troopTotal(p.army[key]) > 0 && troopTotal(p.army.mercenaries[key]) === 0 && (
                    <BareBadge arm={label.toLowerCase()} count={troopTotal(p.army[key])} />
                  )}
                  <div className="bcard-sub">trained at the {trainer}</div>
                </div>
              </div>

              {/* One muster form: pick the tier ONCE — the cost row lights up to
                  match — then Train or Discharge with the same count. The clicked
                  button carries __cmd (the AssignRecall pattern). */}
              <CmdForm path="/troops" className="muster-form" inline={false}>
                <input type="hidden" name="type" value={type} />

                {/* Cost per tier; the selected tier's row is highlighted via :has(). */}
                <ul className="cost-list">
                  {TIERS.map((t) => (
                    <li key={t} className={`tier-li tier-li-${t}`}>
                      <span className="cost-tier">{t}</span>
                      <span className="cost-have">have {p.army[key][t]}</span>
                      <CostBits cost={trainAsk(type, t)} mult={1} />
                    </li>
                  ))}
                </ul>

                <div className="troop-form-line" style={{ marginTop: 6 }}>
                  <Pills
                    name="tier"
                    ariaLabel={`${label} tier`}
                    options={TIERS.map((t) => ({ value: t, label: t, title: TIER_INFO[t] }))}
                  />
                  <CountInput ariaLabel={`${label} count`} size={3} />
                </div>
                <div className="troop-form-line" style={{ marginTop: 5 }}>
                  <ReqTip
                    heading={`Train ${label}`}
                    body="Raise idle peasants straight into this corps at the picked tier."
                    rows={[
                      PEASANT_ROW(1, p.idlePeasants),
                      BED_ROW(1, Math.max(0, musterFree)),
                      ...resReqs(trainAsk(type), have),
                    ]}
                    note="Costs shown are what you will actually pay, King's Roads included. Higher tiers need that arm's trainer at the matching level."
                    disabledReason={
                      canTrainOne(type)
                        ? undefined
                        : p.idlePeasants < 1
                          ? "No idle peasants — grow your population or recall workers."
                          : musterFree < 1
                            ? "No free Muster Hall bed — build more Muster Halls."
                            : "Not enough gold/ore for even one light soldier."
                    }
                  >
                    <Btn
                      name="__cmd"
                      value="trainTroops"
                      className={canTrainOne(type) ? "btn" : "btn btn-no"}
                      disabled={!canTrainOne(type)}
                    >
                      ⚔ Train
                    </Btn>
                  </ReqTip>
                  <ReqTip
                    heading={`Discharge ${label}`}
                    body="Send these soldiers home to the idle-peasant pool. Their gear is lost — retraining them costs full price again."
                    rows={[{ icon: <span className="costtip-ico">🛏</span>, label: "Empty Hearthstead beds", need: 1, have: Math.max(0, housingFree) }]}
                    note={`They only leave if a bed stands empty and the 30% guard line holds — ${safeDischarge} safe to discharge now.`}
                  >
                    <Btn name="__cmd" value="dischargeTroops" className="btn btn-recall">
                      Discharge
                    </Btn>
                  </ReqTip>
                </div>
              </CmdForm>
            </div>
          ))}

          {/* Siege engineers — no tiers; crew the engines forged at the Siege Works. */}
          <div className="bcard" key="engineer">
            <div className="bcard-head">
              <span className="bcard-art">
                <TiredArt path="units/engineer" stamina={p.army.stamina} size={216} title="Siege Engineer" race={p.race} />
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
              Needs the Engine Yard &amp; a free Muster Hall bed.
            </p>

            <div className="troop-form">
              <div className="troop-form-block">
                <span className="troop-form-label">Recruit — from idle peasants</span>
                <CmdForm name="trainEngineers" path="/troops">
                  <div className="troop-form-line">
                    <CountInput
                      ariaLabel="Engineers to train"
                      size={3}
                      max={Math.min(p.idlePeasants, Math.max(0, musterFree), Math.floor(p.gold / (TRAINING_COSTS.siegeEngineer.gold || 1)))}
                    />
                    {(() => {
                      const canEng = foundry >= 1 && p.idlePeasants >= 1 && musterFree >= 1 && canAfford(TRAINING_COSTS.siegeEngineer);
                      return (
                        <ReqTip
                          heading="Recruit Siege Engineers"
                          body="Raise idle peasants into the crews that work your siege engines — an engine with no crew can't fire."
                          rows={[
                            PEASANT_ROW(1, p.idlePeasants),
                            BED_ROW(1, Math.max(0, musterFree)),
                            ...resReqs(TRAINING_COSTS.siegeEngineer, have),
                          ]}
                          note="Per engineer — × the number you enter. Also needs the Engine Yard."
                          disabledReason={
                            canEng
                              ? undefined
                              : foundry < 1
                                ? "Found the Engine Yard first (Buildings → Military)."
                                : p.idlePeasants < 1
                                  ? "No idle peasants to recruit."
                                  : musterFree < 1
                                    ? "No free Muster Hall bed."
                                    : "Not enough gold for even one engineer."
                          }
                        >
                          <Btn className={canEng ? "btn" : "btn btn-no"} disabled={!canEng}>
                            Train
                          </Btn>
                        </ReqTip>
                      );
                    })()}
                  </div>
                </CmdForm>
                {foundry < 1 && (
                  <p style={{ fontSize: 13, color: "var(--warn)", margin: 0 }}>
                    Found the <a href="/buildings?tab=military">Engine Yard</a> first.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="army-meters">
          <ReqTip
            heading="Stamina"
            body="Fighting drains it (attacker −8/round, defender −5); tired troops swing weaker and guard worse. Recovers 1/turn passively, or +20 from a Rest. Rest before a hard fight."
          >
            <div>
              <Meter label="Stamina" value={p.army.stamina} max={100} icon="🔥" />
            </div>
          </ReqTip>
          <ReqTip
            heading="Army experience"
            body="Earned in battle, up to +100% power at 100. But veterancy lives in the veterans — losing regulars loses experience, while dead mercenaries cost none."
          >
            <div>
              {/* Progress to the next +2%, not to a ceiling — there isn't one. */}
              <Meter
                label="Veterancy"
                value={p.army.experiencePoints % EXPERIENCE.POINTS_PER_STEP}
                max={EXPERIENCE.POINTS_PER_STEP}
                tone="good"
                icon="🎖"
                display={`+${(veterancyBonus(p.army.experiencePoints) * 100).toFixed(1)}%`}
              />
            </div>
          </ReqTip>
          <ReqTip
            heading="Muster Hall beds"
            body={`Each Muster Hall houses ${TROOPS_PER_MUSTER_HALL} soldiers — the hard cap on your standing army. Build more halls to raise more troops.`}
          >
            <div>
              <Meter label="Muster beds" value={military(p)} max={level(p, "muster_hall") * TROOPS_PER_MUSTER_HALL} icon="🛏" />
            </div>
          </ReqTip>
        </div>
        <p style={{ fontSize: 13.5, marginTop: 8 }}>
          <b>Safe to discharge</b> {safeDischarge} (capped by {housingFree} free bed
          {housingFree === 1 ? "" : "s"} and the 30% guard line) ·{" "}
          <a href="/guide#regulars">📜 saving &amp; killing regulars</a>
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
          <CmdForm name="rest" path="/troops">
            <Btn className="btn">Rest the army (5 turns + 0.2 food/troop → +20 stamina)</Btn>
          </CmdForm>
          <Info tip={ACTION_INFO.rest} guide={ACTION_GUIDE.rest} />
        </div>
      </Panel>
      </div>

      <div id="mercenaries">
      <Panel title="The Black Market — hired blades">
        <div style={{ float: "right" }}>
          <Info tip={UNIT_INFO.mercenary.tip} title={UNIT_INFO.mercenary.title} guide={UNIT_GUIDE.mercenary}>
            <TiredArt path="units/mercenary" stamina={p.army.stamina} size={240} title="Mercenary" race={p.race} />
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

        {/* Price per ARM — they differ, and a single figure hid that a cavalry
            sellsword costs half again what a footman does. Tiered arms show the
            light price; medium and heavy scale from it. */}
        <ul className="cost-list" style={{ maxWidth: 360 }}>
          {HIRABLE_HERE.map((arm) => (
            <li key={arm}>
              <span className="cost-tier">{arm}</span>
              <span className="cost-row">
                <CostBit kind="gold" amount={mercAsk(arm)} />
                <span className="bcard-sub">
                  {arm === "footman" || arm === "archer" || arm === "cavalry" ? "a head, light" : "a head"}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {(() => {
          const bare = CORPS.filter(
            (c) => troopTotal(p.army[c.key]) > 0 && troopTotal(p.army.mercenaries[c.key]) === 0,
          );
          if (bare.length === 0) return null;
          return (
            <p className="bare-line">
              <span className="bare-badge">
                <span aria-hidden="true">🛡</span>✗ bare
              </span>{" "}
              Your {bare.map((c) => c.label.toLowerCase()).join(", ")} have no hired blades in front
              of them — those regulars die first. Hire a screen below.
            </p>
          );
        })()}
        <div className="troop-form">
          <div className="troop-form-block">
            <span className="troop-form-label">Hire — gold only, no peasants</span>
            <CmdForm name="buyMercs" path="/troops">
              <div className="troop-form-line">
                <Pills
                  name="type"
                  ariaLabel="Mercenary arm to hire"
                  options={[
                    ...CORPS.map((c) => ({ value: c.type, label: c.label, title: UNIT_INFO[c.type].tip })),
                    // Sellswords cover the battle line and the engine crews.
                    // Hired spies and rangers exist too, but they are hired on
                    // Workers & Levy beside the control that trains them.
                    {
                      value: "engineer",
                      label: "engineer",
                      title:
                        "Hired engine crews. They push your trebuchets and man your Counter-Engines like your own, but earn no veterancy and cost none when they die. Needs barracks room.",
                    },
                  ]}
                />
                <Pills
                  name="tier"
                  ariaLabel="Mercenary tier to hire"
                  options={TIERS.map((t) => ({ value: t, label: t, title: TIER_INFO[t] }))}
                />
                {/* Sized off the DEAREST arm — the picker above can still be
                    switched to cavalry, and a max that over-promises is worse
                    than one that under-promises. */}
                <CountInput
                  ariaLabel="Mercenaries to hire"
                  max={Math.min(Math.max(0, mercCap - mercInService), Math.floor(p.gold / Math.max(1, mercPriceDearest)))}
                />
                <ReqTip
                  heading="Hire mercenaries (light)"
                  body="Rent sellswords in the arm and tier picked above — gold only, no peasants and no training time. Tier applies to the battle line only; engine crews, knives and rangers are hired as they come. They take the first blows aimed at their own arm, draw wages every turn, need barracks beds like anyone else, and are paid off the moment too few of your own regulars remain to command them."
                  rows={[
                    { icon: <ResIcon kind="gold" size={16} />, label: "Gold", need: mercPriceLight, have: p.gold },
                    { icon: <span className="costtip-ico">🗡</span>, label: "Free merc slots", need: 1, have: Math.max(0, mercCap - mercInService) },
                  ]}
                  note="Gold-only, per blade at light tier — medium ×2, heavy ×4. Capped at 25% of your regulars."
                  disabledReason={
                    canHireMerc
                      ? undefined
                      : mercInService >= mercCap
                        ? "Mercenary cap reached — raise more regulars to lift the 25% ceiling."
                        : "Not enough gold to hire even one."
                  }
                >
                  <Btn
                    className={canHireMerc ? "btn" : "btn btn-no"}
                    disabled={!canHireMerc}
                  >
                    Hire
                  </Btn>
                </ReqTip>
                <Info tip={ACTION_INFO.hireMercs} guide={ACTION_GUIDE.hireMercs} />
              </div>
            </CmdForm>
          </div>
        </div>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 6 }}>
          Hired <b>knives and rangers</b> are mustered at{" "}
          <a href="/train#shadows">Workers &amp; Levy</a>, on the same cards that train your own —
          they cost no population and no barracks bed, so they never belonged in the barracks.
        </p>
        {discount > 0 && (
          <p style={{ fontSize: 13.5, color: "var(--green-dark)", marginTop: 4 }}>
            Clan Wonder discount: −{Math.round(discount * 100)}% on mercenaries, troops, and siege gear.
          </p>
        )}
      </Panel>
      </div>

      <div id="strategy" />
      {/* ── Strategy: the army's standing orders ────────────────────────────
          These are decisions about your HOST, so they belong beside it rather
          than on the Siege Works page (where the sortie used to live — the
          engines are equipment, this is doctrine).

          Written as a list of orders from the start, not a single control: the
          sortie is the only one today and there will be more, and a panel built
          around one toggle has to be torn apart to take a second. */}
      <Panel
        title="⚔ Strategy — your standing orders"
        info="Doctrine your captains follow without being asked, so a battle fought while you are asleep is still fought your way. Set them once and they hold until you change them."
        guide="/guide#battle"
      >
        <ul className="orders">
          <li className="order">
            <div className="order-head">
              <span className="order-name">🐎 When besieged</span>
              <span className={`order-state${p.army.sortieEnabled ? " is-on" : ""}`}>
                {p.army.sortieEnabled ? "Ride out at the siege lines" : "Hold the wall"}
              </span>
            </div>
            <p className="order-why">
              Cavalry gain nothing from a parapet and everything from open ground, so this is a real
              choice of shape rather than a switch to leave on: a cavalry-heavy defender wants to ride
              out, a footman-heavy one almost certainly does not. Riders lead and each brings three
              footmen behind; you keep the wall&apos;s protection either way, but the attacker&apos;s
              screen can hold you off before you reach their engines.
            </p>
            <CmdForm name="setSortie" path="/troops#strategy">
              <input type="hidden" name="enabled" value={p.army.sortieEnabled ? "false" : "true"} />
              <Btn className="btn">
                {p.army.sortieEnabled ? "Hold the wall instead" : "Order the sortie"}
              </Btn>
            </CmdForm>
          </li>
        </ul>
      </Panel>

      <Panel title="The Siege Train">
        <p style={{ fontSize: 14.5 }}>
          <Art path="siege/trebuchets" size={168} title="Siege Works" /> Engineers are recruited above,
          alongside your footmen, archers, and cavalry. The <b>engines</b> they crew and the foundry
          ladder live in the <a href="/siege">Siege Works</a> — you hold{" "}
          {Object.values(p.army.siegeGear).reduce((a, b) => a + b, 0)} pieces of gear.
        </p>
      </Panel>
    </>
  );
}
