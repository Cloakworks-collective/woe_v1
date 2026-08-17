
import { BareBadge } from "@/components/BareBadge";
import { Btn } from "@/components/Btn";
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
  EXPERIENCE,
  MERCENARIES,
  SIEGE_STANCE,
  SORTIE,
  STAMINA,
  TIER_INFO,
  TRAINING_COSTS,
  TROOPS_PER_MUSTER_HALL,
  UNIT_GUIDE,
  UNIT_INFO,
} from "@/lib/constants";
import {
  bareTiers,
  civilians,
  level,
  mercPrice,
  mercsOfArm,
  mercTotal,
  military,
  musterVacancy,
  regularsOfArm,
  restAffordablePoints,
  restFoodCost,
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
  siegeDelivery,
} from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const metadata = { title: "The Army" };

export const dynamic = "force-dynamic";

const CORPS: { type: TroopType; key: "footmen" | "archers" | "cavalry"; label: string; trainer: string }[] = [
  { type: "footman", key: "footmen", label: "Footmen", trainer: "Drill Yard" },
  { type: "archer", key: "archers", label: "Archers", trainer: "Fletcher's Range" },
  { type: "cavalry", key: "cavalry", label: "Cavalry", trainer: "Knights' Stables" },
];
const TIERS: Tier[] = ["light", "medium", "heavy"];

type Cost = { gold: number; wood: number; stone: number; ore: number };

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** One priced resource: pixel icon + amount (never "100 g" — always the token). */
function CostBit({ kind, amount }: { kind: ResKind; amount: number }) {
  return (
    <span className="cost-bit">
      <ResIcon kind={kind} size={16} /> {fmt(amount)}
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
  // The siege standing order, and the share it actually buys. Read from the
  // engine's own delivery gate rather than a hardcoded 20%, so Siegecraft moves
  // the copy the moment it moves the number.
  const counterFirst = (p.army.siegeStance ?? "general") === "counter";
  const siegeShare = siegeDelivery(p, "siege");

  // Beds, straight from the engine. The page used to compute this itself as
  // `level × 10 − military`, which ignored the sellswords quartered in the same
  // hall AND the integrity of a bombarded Muster Hall — so it offered beds that
  // did not exist and the command bounced.
  const musterFree = Math.max(0, musterVacancy(p));
  const musterCap = Math.floor(level(p, "muster_hall") * TROOPS_PER_MUSTER_HALL);
  const quartered = military(p) + mercTotal(p.army.mercenaries);
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
  const mercAsk = (type: TroopType, tier: Tier = "light") => mercPrice(p, type, tier, discount);
  // Per TIER, not just per arm — a heavy soldier costs four times a light one,
  // so a single light-priced check greyed the button out on the wrong number.
  const canTrainOne = (type: TroopType, tier: Tier = "light") =>
    p.idlePeasants >= 1 && musterFree >= 1 && canAfford(trainAsk(type, tier), 1);
  // The sellsword cap is PER ARM — a share of the regulars of that same arm.
  // Hired archers cannot shield your cavalry, so a single global figure (which
  // is what this page used to print) was the wrong number in both directions.
  const mercRoom = (arm: MercArm) =>
    Math.max(0, Math.floor(regularsOfArm(p, arm) * MERCENARIES.CAP_RATIO) - mercsOfArm(p, arm));
  const canHireOne = (type: TroopType, tier: Tier = "light") =>
    mercRoom(type) >= 1 && musterFree >= 1 && have.gold >= mercAsk(type, tier);

  // Rest, priced per point. Three offers, because the useful amounts are "one,
  // to cross a threshold", "a few, to shake off a raid" and "fill it".
  const restGap = STAMINA.MAX - p.army.stamina;
  const restMax = restAffordablePoints(p);
  const restOffers = [
    { points: 1, label: "+1" },
    { points: 5, label: "+5" },
    { points: restGap, label: `Fill to ${STAMINA.MAX}` },
  ].filter((o, i, all) => o.points > 0 && all.findIndex((x) => x.points === o.points) === i);

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#army">Building an army — tiers &amp; mercenaries</LearnLink>

      {/* ── The muster roll ───────────────────────────────────────────────────
          Every rank of every arm on one screen, regulars against sellswords,
          because that pairing IS the decision. It used to take three separate
          places to answer "are my heavy footmen screened?" — the corps card for
          the regulars, the Black Market panel for a per-ARM merc total that hid
          the ranks entirely, and the battle guide for the rule. */}
      <Panel
        title="The Host — every rank at a glance"
        info="Your own troops against the hired blades standing at the same rank. Damage walks light → medium → heavy and splits where it lands, with the sellswords taking the larger share of whatever reaches THEIR tier — so a rank with regulars and no hirelings takes the whole blow on real population. Those cells are marked."
        guide="/guide#regulars"
      >
        <div className="host-roll">
          <div className="tbl-scroll">
            <table className="tbl host-tbl">
              <thead>
                <tr>
                  <th>Rank</th>
                  {CORPS.map((c) => (
                    <th key={c.key} className="num">
                      {c.label}
                    </th>
                  ))}
                  <th className="num">Rank total</th>
                </tr>
              </thead>
              <tbody>
                {/* Heaviest first: it is the rank a ruler cares most about, and
                    it is the LAST one damage reaches, so reading down the column
                    is reading the order the casualties arrive in reverse. */}
                {[...TIERS].reverse().map((t) => {
                  const rowReg = CORPS.reduce((s, c) => s + p.army[c.key][t], 0);
                  const rowMerc = CORPS.reduce((s, c) => s + p.army.mercenaries[c.key][t], 0);
                  return (
                    <tr key={t}>
                      <td title={TIER_INFO[t]}>
                        <b>{t}</b>
                      </td>
                      {CORPS.map((c) => {
                        const reg = p.army[c.key][t];
                        const merc = p.army.mercenaries[c.key][t];
                        const bare = reg > 0 && merc === 0;
                        return (
                          <td
                            key={c.key}
                            className={`num host-cell${bare ? " is-bare" : ""}`}
                            title={
                              bare
                                ? `${reg} ${t} ${c.label.toLowerCase()} with no hired blades at this rank — every blow that reaches it lands on your own people.`
                                : `${reg} of your own, ${merc} hired, at ${t} ${c.label.toLowerCase()}.`
                            }
                          >
                            <span className="host-reg">{fmt(reg)}</span>
                            <span className="host-slash">/</span>
                            <span className="host-merc">{fmt(merc)}</span>
                          </td>
                        );
                      })}
                      <td className="num host-cell">
                        <span className="host-reg">{fmt(rowReg)}</span>
                        <span className="host-slash">/</span>
                        <span className="host-merc">{fmt(rowMerc)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    <b>All ranks</b>
                  </td>
                  {CORPS.map((c) => (
                    <td key={c.key} className="num host-cell">
                      <span className="host-reg">{fmt(troopTotal(p.army[c.key]))}</span>
                      <span className="host-slash">/</span>
                      <span className="host-merc">{fmt(troopTotal(p.army.mercenaries[c.key]))}</span>
                    </td>
                  ))}
                  <td className="num host-cell">
                    <span className="host-reg">
                      {fmt(CORPS.reduce((s, c) => s + troopTotal(p.army[c.key]), 0))}
                    </span>
                    <span className="host-slash">/</span>
                    <span className="host-merc">{fmt(mercTotal(p.army.mercenaries))}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* The sellsword, kept big — this table is where "mine vs hired" is
              the subject, so this is where the picture belongs. */}
          <div className="host-art">
            <Info
              tip={UNIT_INFO.mercenary.tip}
              title={UNIT_INFO.mercenary.title}
              guide={UNIT_GUIDE.mercenary}
            >
              <TiredArt
                path="units/mercenary"
                stamina={p.army.stamina}
                size={240}
                title="Mercenary"
                race={p.race}
              />
            </Info>
            <span className="host-art-cap">
              <span className="host-reg">your own</span> / <span className="host-merc">hired</span>
            </span>
          </div>
        </div>

        <p className="host-note">
          Sellswords are capped at <b>{Math.round(MERCENARIES.CAP_RATIO * 100)}% of the regulars of their own arm</b>, need a Muster
          Hall bed like anyone else, and are paid off the moment too few of your own remain to
          command them. Beyond the battle line you also hold{" "}
          <b>{fmt(p.army.siegeEngineers)} engineers</b> ({fmt(p.army.mercenaries.engineers)} of them
          hired) — raised below, and the engines they crew live at the{" "}
          <a href="/siege">Siege Works</a>.
        </p>
      </Panel>

      <div id="train" />
      <div id="mercenaries" />

      {/* ── The muster ────────────────────────────────────────────────────────
          One card per arm, and ONE tier picker on each. Raising a soldier and
          hiring the blade that screens him are the same decision at the same
          rank, so they are now the same form: pick the tier once, then Train,
          Hire or Discharge with the count you typed. They used to be two panels
          a screen apart, each with its own arm picker and its own tier picker —
          four controls to express one choice, and nothing to tell you that the
          tiers had to match. */}
      <Panel
        title={`The Muster — ${fmt(p.idlePeasants)} idle peasants, ${fmt(musterFree)} beds free`}
        info="Peasants are trained straight into footmen/archers/cavalry — no warrior step. Tier N needs that arm's trainer at level N. Sellswords come in the same arms and tiers and need the same buildings, but cost gold alone: no peasants, no training time. Discharge sends a soldier home (their gear is lost) if a Hearthstead bed stands empty."
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
                  <BareBadge arm={label.toLowerCase()} tiers={bareTiers(p, key)} />
                  <div className="bcard-sub">
                    trained at the {trainer} · {fmt(mercRoom(type))} sellsword
                    {mercRoom(type) === 1 ? "" : "s"} may still be hired
                  </div>
                </div>
              </div>

              {/* One form, one tier, three orders. The clicked button carries
                  __cmd (the AssignRecall pattern) and every command below takes
                  the same (type, tier, count) — which is precisely why they can
                  share a picker. */}
              <CmdForm path="/troops" className="muster-form" inline={false}>
                <input type="hidden" name="type" value={type} />

                {/* Both prices per tier, side by side: what a soldier costs to
                    raise and what the blade in front of him costs to rent. */}
                <ul className="cost-list muster-prices">
                  {TIERS.map((t) => (
                    <li key={t} className={`tier-li tier-li-${t}`}>
                      <span className="cost-tier">{t}</span>
                      <span className="cost-have">
                        <b>{fmt(p.army[key][t])}</b>
                        <span className="host-slash">/</span>
                        <b className="host-merc">{fmt(p.army.mercenaries[key][t])}</b>
                      </span>
                      {/* No "raise" / "hire" labels — the two prices are told
                          apart by their shape. Training costs materials; a
                          sellsword is gold and nothing else, marked with the
                          same 🗡 that sits on the Hire button. */}
                      <span className="muster-price">
                        <CostBits cost={trainAsk(type, t)} mult={1} />
                      </span>
                      <span className="muster-price muster-price-merc" title="Sellsword, per head">
                        <span aria-hidden="true">🗡</span>
                        <CostBit kind="gold" amount={mercAsk(type, t)} />
                      </span>
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
                {/* One Train and one Hire button PER TIER, with only the picked
                    one shown — the same `:has()` trick that lights the cost row
                    above. This is a server component and the tier is chosen
                    client-side, so a single button could only ever quote the
                    light price: it greyed out on light's cost while you had the
                    heavy one selected, and its hover named requirements that
                    were not the ones about to be charged. Every hidden twin
                    submits the identical `__cmd`, and the tier still travels on
                    the radio, so which one fires does not matter. */}
                <div className="troop-form-line" style={{ marginTop: 5 }}>
                  {TIERS.map((t) => (
                    <span className={`tier-only tier-only-${t}`} key={t}>
                      <ReqTip
                        heading={`Train ${t} ${label.toLowerCase()}`}
                        body="Raise idle peasants straight into this corps at the picked tier. They are real population: they count for your score and the victory floor, they carry veterancy, and they cannot be re-bought once killed."
                        rows={[
                          PEASANT_ROW(1, p.idlePeasants),
                          BED_ROW(1, musterFree),
                          ...resReqs(trainAsk(type, t), have),
                        ]}
                        note={`Per soldier — × the number you enter. Costs shown are what you will actually pay, King's Roads included.${t === "light" ? "" : ` ${t === "medium" ? "Medium" : "Heavy"} needs the ${trainer} at level ${t === "medium" ? 2 : 3}.`}`}
                        disabledReason={
                          canTrainOne(type, t)
                            ? undefined
                            : p.idlePeasants < 1
                              ? "No idle peasants — grow your population or recall workers."
                              : musterFree < 1
                                ? "No free Muster Hall bed — build more Muster Halls."
                                : `Not enough gold/wood/ore for even one ${t} ${label.toLowerCase().replace(/s$/, "")}.`
                        }
                      >
                        <Btn
                          name="__cmd"
                          value="trainTroops"
                          className={canTrainOne(type, t) ? "btn" : "btn btn-no"}
                          disabled={!canTrainOne(type, t)}
                        >
                          ⚔ Train
                        </Btn>
                      </ReqTip>
                    </span>
                  ))}
                  {TIERS.map((t) => (
                    <span className={`tier-only tier-only-${t}`} key={t}>
                      <ReqTip
                        heading={`Hire ${t} ${label.toLowerCase()} sellswords`}
                        body="Rent hired blades at the tier picked above — gold only, no peasants, no training time. They die before your own regulars OF THE SAME RANK, earn no veterancy, and count for nothing on the ladder. Hire at the rank you actually want screened: a light blade does nothing for a heavy soldier."
                        rows={[
                          { icon: <ResIcon kind="gold" size={16} />, label: "Gold", need: mercAsk(type, t), have: have.gold },
                          { icon: <span className="costtip-ico">🗡</span>, label: "Room under the cap", need: 1, have: mercRoom(type) },
                          BED_ROW(1, musterFree),
                        ]}
                        note={`Per blade — × the number you enter. Capped at ${Math.round(MERCENARIES.CAP_RATIO * 100)}% of your own ${label.toLowerCase()}, so raising regulars is what lifts the ceiling.`}
                        disabledReason={
                          canHireOne(type, t)
                            ? undefined
                            : mercRoom(type) < 1
                              ? `Cap reached — sellswords are capped against your own ${label.toLowerCase()}.`
                              : musterFree < 1
                                ? "No free Muster Hall bed — hired blades need quartering too."
                                : `Not enough gold to hire even one ${t}.`
                        }
                      >
                        <Btn
                          name="__cmd"
                          value="buyMercs"
                          className={canHireOne(type, t) ? "btn btn-hire" : "btn btn-no"}
                          disabled={!canHireOne(type, t)}
                        >
                          🗡 Hire
                        </Btn>
                      </ReqTip>
                    </span>
                  ))}
                  <ReqTip
                    heading={`Discharge ${label}`}
                    body="Send these soldiers home to the idle-peasant pool. Their gear is lost — retraining them costs full price again."
                    rows={[{ icon: <span className="costtip-ico">🛏</span>, label: "Empty Hearthstead beds", need: 1, have: Math.max(0, housingFree) }]}
                    note={`They only leave if a bed stands empty and the 30% guard line holds — ${safeDischarge} safe to discharge now.`}
                  >
                    <Btn
                      name="__cmd"
                      value="dischargeTroops"
                      className="btn btn-recall"
                      confirmText="Discharge these soldiers? Their gear is lost — retraining costs full price again."
                    >
                      Discharge
                    </Btn>
                  </ReqTip>
                  {/* Tearing up a contract. Per tier like the rest, so it can
                      free the exact rank you are short of beds at. */}
                  {TIERS.map((t) => {
                    const held = p.army.mercenaries[key][t];
                    return (
                      <span className={`tier-only tier-only-${t}`} key={t}>
                        <ReqTip
                          heading={`Dismiss ${t} ${label.toLowerCase()} sellswords`}
                          body="Tear up their contract and send them off. NO REFUND — hiring was a one-time price paid outright. What you get back is the Muster Hall bed, which is the only thing a sellsword costs you to keep."
                          rows={[
                            {
                              icon: <span className="costtip-ico">🗡</span>,
                              label: `Hired ${t} ${label.toLowerCase()}`,
                              need: 1,
                              have: held,
                            },
                          ]}
                          note="They earned no veterancy and cost none when they die, so nothing moves on the ledger either — they simply leave."
                          disabledReason={held < 1 ? `No hired ${t} ${label.toLowerCase()} to dismiss.` : undefined}
                        >
                          <Btn
                            name="__cmd"
                            value="dismissMercs"
                            className={held > 0 ? "btn btn-recall" : "btn btn-no"}
                            disabled={held < 1}
                            confirmText="Tear up their contract? NO REFUND — hiring was a one-time price paid outright."
                          >
                            Dismiss
                          </Btn>
                        </ReqTip>
                      </span>
                    );
                  })}
                </div>
              </CmdForm>
            </div>
          ))}

          {/* Siege engineers — no tiers; crew the engines forged at the Siege
              Works. Hired crews are rented from the same card, for the same
              reason the line troops are: it is one decision. */}
          <div className="bcard" key="engineer">
            <div className="bcard-head">
              <span className="bcard-art">
                <TiredArt path="units/engineer" stamina={p.army.stamina} size={216} title="Siege Engineer" race={p.race} />
              </span>
              <div>
                <Info tip={UNIT_INFO.engineer.tip} title={UNIT_INFO.engineer.title} guide={UNIT_GUIDE.engineer}>
                  <span className="bcard-name">Siege Engineers</span>
                </Info>
                <div className="bcard-sub">
                  crew your engines · {fmt(mercRoom("engineer"))} hired crews may
                  still be taken on
                </div>
              </div>
            </div>

            <ul className="cost-list muster-prices">
              <li>
                <span className="cost-tier">each</span>
                <span className="cost-have">
                  <b>{fmt(p.army.siegeEngineers)}</b>
                  <span className="host-slash">/</span>
                  <b className="host-merc">{fmt(p.army.mercenaries.engineers)}</b>
                </span>
                <span className="muster-price">
                  <CostBits cost={TRAINING_COSTS.siegeEngineer} />
                </span>
                <span className="muster-price muster-price-merc" title="Hired crew, per head">
                  <span aria-hidden="true">🗡</span>
                  <CostBit kind="gold" amount={mercPrice(p, "engineer", "light", discount)} />
                </span>
              </li>
            </ul>
            <p className="bcard-sub" style={{ margin: "4px 0 0" }}>
              Needs the Engine Yard &amp; a free Muster Hall bed. They never march out to attack — though they fight for their lives if a sortie reaches the engines — and they are
              never stripped from the field.
            </p>

            <div className="troop-form-line" style={{ marginTop: 6 }}>
              <CmdForm name="trainEngineers" path="/troops">
                <CountInput
                  ariaLabel="Engineers to train"
                  size={3}
                  max={Math.min(p.idlePeasants, musterFree, Math.floor(have.gold / (TRAINING_COSTS.siegeEngineer.gold || 1)))}
                />
                {(() => {
                  const canEng = foundry >= 1 && p.idlePeasants >= 1 && musterFree >= 1 && canAfford(TRAINING_COSTS.siegeEngineer);
                  return (
                    <ReqTip
                      heading="Recruit Siege Engineers"
                      body="Raise idle peasants into the crews that work your siege engines — an engine with no crew can't fire."
                      rows={[
                        PEASANT_ROW(1, p.idlePeasants),
                        BED_ROW(1, musterFree),
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
                        ⚔ Train
                      </Btn>
                    </ReqTip>
                  );
                })()}
              </CmdForm>
              <CmdForm name="buyMercs" path="/troops">
                <input type="hidden" name="type" value="engineer" />
                <input type="hidden" name="tier" value="light" />
                <CountInput ariaLabel="Hired engineers to take on" size={3} />
                {(() => {
                  const room = mercRoom("engineer");
                  const price = mercPrice(p, "engineer", "light", discount);
                  const canHire = room >= 1 && musterFree >= 1 && have.gold >= price;
                  return (
                    <ReqTip
                      heading="Take on hired crews"
                      body="Rented engine crews. They push your trebuchets and man your Counter-Engines exactly like your own, but earn no veterancy and cost you none when they die."
                      rows={[
                        { icon: <ResIcon kind="gold" size={16} />, label: "Gold", need: price, have: have.gold },
                        { icon: <span className="costtip-ico">🗡</span>, label: "Room under the cap", need: 1, have: room },
                        BED_ROW(1, musterFree),
                      ]}
                      note="Capped against your OWN engineers, so raising crews is what lifts the ceiling."
                      disabledReason={
                        canHire
                          ? undefined
                          : room < 1
                            ? "Cap reached — hired crews are capped against your own engineers."
                            : musterFree < 1
                              ? "No free Muster Hall bed."
                              : "Not enough gold to hire even one."
                      }
                    >
                      <Btn className={canHire ? "btn btn-hire" : "btn btn-no"} disabled={!canHire}>
                        🗡 Hire
                      </Btn>
                    </ReqTip>
                  );
                })()}
              </CmdForm>
              <CmdForm name="dismissMercs" path="/troops">
                <input type="hidden" name="type" value="engineer" />
                <input type="hidden" name="tier" value="light" />
                <CountInput ariaLabel="Hired engineers to dismiss" size={3} />
                <ReqTip
                  heading="Dismiss hired crews"
                  body="Tear up their contract. NO REFUND — hiring was a one-time price paid outright. What you get back is the Muster Hall bed."
                  rows={[
                    {
                      icon: <span className="costtip-ico">🗡</span>,
                      label: "Hired engineers",
                      need: 1,
                      have: p.army.mercenaries.engineers,
                    },
                  ]}
                  note="Uncrewed engines are lumber, so check what your park still needs manned before you send them off."
                  disabledReason={
                    p.army.mercenaries.engineers < 1 ? "No hired crews to dismiss." : undefined
                  }
                >
                  <Btn
                    className={p.army.mercenaries.engineers > 0 ? "btn btn-recall" : "btn btn-no"}
                    disabled={p.army.mercenaries.engineers < 1}
                  >
                    Dismiss
                  </Btn>
                </ReqTip>
              </CmdForm>
            </div>
            {foundry < 1 && (
              <p style={{ fontSize: 13, color: "var(--warn)", margin: "6px 0 0" }}>
                Found the <a href="/buildings?tab=military">Engine Yard</a> first.
              </p>
            )}
          </div>
        </div>

        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 10, marginBottom: 0 }}>
          Hired <b>knives and rangers</b> are mustered at{" "}
          <a href="/train#shadows">Workers &amp; Levy</a>, on the same cards that train your own —
          they cost no population and no barracks bed, so they never belonged in the barracks.
          {discount > 0 && (
            <>
              {" "}
              <span style={{ color: "var(--green-dark)" }}>
                Clan Wonder discount: −{Math.round(discount * 100)}% on troops, sellswords and siege
                gear.
              </span>
            </>
          )}
        </p>
      </Panel>

      {/* ── Condition ─────────────────────────────────────────────────────────
          Stamina, veterancy and beds used to be three bare meters in a row with
          everything that explains them buried in a hover, and the Rest button
          was a single 90-character sentence underneath. All three are decisions,
          so all three now say what they mean on the page. */}
      <div id="condition" />
      <Panel
        title="The Host's Condition — stamina, veterancy, quarters"
        info="What state your army is in, and what you can do about it today."
      >
        <div className="condition-grid">
          <div className="condition-card">
            <Meter
              label="Stamina"
              value={p.army.stamina}
              max={STAMINA.MAX}
              icon="🔥"
              display={`${p.army.stamina} / ${STAMINA.MAX}`}
            />
            <ul className="condition-why">
              <li>
                The cost IS the work: cut through the whole enemy host and you are{" "}
                <b>fully spent</b>; cut through a fifth and you spend a fifth. Swinging hard tires
                an army — holding a line does not.
              </li>
              <li>
                And it depends on <b>who did the swinging</b>: footmen tire{" "}
                <b>×{STAMINA.DRAIN_RATE.footman}</b> for the same work, cavalry{" "}
                <b>×{STAMINA.DRAIN_RATE.cavalry}</b>, archers{" "}
                <b>×{STAMINA.DRAIN_RATE.archer}</b>. The melee is the hardest labour on the field.
                Engines tire nobody — a crew cranks a windlass.
              </li>
              <li>
                Stamina <b>is</b> your intensity, in a straight line: at 70 you fight at 70%, at 30
                at 30%. There is no floor under it.
              </li>
              <li>
                Below <b>{STAMINA.MERCY_FLOOR}</b> you lay down arms to anything but a revenge.
              </li>
              <li>
                Recovers <b>{STAMINA.PASSIVE_RECOVERY_PER_TURN}/turn</b> on its own.
              </li>
            </ul>
            {/* Rest: food only, no action turns, bought by the point. */}
            <div className="rest-row">
              <span className="rest-label">
                🍖 Rest the army
                <Info tip={ACTION_INFO.rest} guide={ACTION_GUIDE.rest} />
              </span>
              {restGap <= 0 ? (
                <span className="rest-none">Fully rested.</span>
              ) : (
                <>
                  {restOffers.map((o) => {
                    const cost = restFoodCost(p, o.points);
                    const canRest = !p.starving && restMax >= o.points;
                    return (
                      <CmdForm name="rest" path="/troops#condition" key={o.points}>
                        <input type="hidden" name="points" value={o.points} />
                        <ReqTip
                          heading={`Rest ${o.points} point${o.points === 1 ? "" : "s"} of stamina`}
                          body={`No action turns — food alone, at ${STAMINA.REST_FOOD_PER_POINT_PER_TROOP} a point for each of the ${fmt(military(p))} regulars and engineers you feed. Sellswords eat at their own expense.`}
                          rows={[
                            { icon: <ResIcon kind="food" size={16} />, label: "Food", need: cost, have: p.resources.food },
                          ]}
                          note={`Takes you to ${Math.min(STAMINA.MAX, p.army.stamina + o.points)} / ${STAMINA.MAX}.`}
                          disabledReason={
                            canRest
                              ? undefined
                              : p.starving
                                ? "A starving empire cannot rest — feed it first."
                                : `Not enough food — ${fmt(cost)} needed, and you can afford ${restMax} point${restMax === 1 ? "" : "s"}.`
                          }
                        >
                          <Btn className={canRest ? "btn" : "btn btn-no"} disabled={!canRest}>
                            {o.label}
                            <span className="rest-cost">
                              <ResIcon kind="food" size={14} /> {fmt(cost)}
                            </span>
                          </Btn>
                        </ReqTip>
                      </CmdForm>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          <div className="condition-card">
            {/* Progress to the next +2%, not to a ceiling — there isn't one. */}
            <Meter
              label="Veterancy"
              value={p.army.experiencePoints % EXPERIENCE.POINTS_PER_STEP}
              max={EXPERIENCE.POINTS_PER_STEP}
              tone="good"
              icon="🎖"
              display={`+${(veterancyBonus(p.army.experiencePoints) * 100).toFixed(1)}%`}
            />
            <ul className="condition-why">
              <li>
                An uncapped ledger, not a bar that fills. Every{" "}
                <b>{fmt(EXPERIENCE.POINTS_PER_STEP)}</b> points is another <b>+2%</b> to the power{" "}
                <i>and</i> health of your regulars — {fmt(EXPERIENCE.POINTS_FOR_DOUBLE)} is +100%,
                and nothing stops it there.
              </li>
              <li>
                <b>+{EXPERIENCE.PER_CASUALTY}</b> an enemy casualty, and{" "}
                <b>+{EXPERIENCE.ATTACKER_PER_REGULAR}</b> more per regular if you were the attacker.
              </li>
              <li>
                <b>−{EXPERIENCE.PER_REGULAR_LOST}</b> for every regular of your own who falls.
                Veterancy dies with the veterans.
              </li>
              <li>
                Punching up pays <b>double or treble</b>; massacring somebody far beneath you takes
                points off outright.
              </li>
              <li>Sellswords earn none and cost none.</li>
            </ul>
            <p className="condition-fig">
              <b>{fmt(p.army.experiencePoints)}</b> points ·{" "}
              {fmt(
                EXPERIENCE.POINTS_PER_STEP - (p.army.experiencePoints % EXPERIENCE.POINTS_PER_STEP),
              )}{" "}
              to the next +2%
            </p>
          </div>

          <div className="condition-card">
            <Meter label="Muster beds" value={quartered} max={musterCap} icon="🛏" />
            <ul className="condition-why">
              <li>
                Each Muster Hall houses <b>{TROOPS_PER_MUSTER_HALL}</b> — the hard cap on your
                standing army.
              </li>
              <li>
                <b>Hired blades sleep in it too.</b> A sellsword takes a bed exactly like a soldier.
              </li>
              <li>A bombarded hall holds proportionally fewer until you mend it.</li>
            </ul>
            <p className="condition-fig">
              <b>{fmt(musterFree)}</b> bed{musterFree === 1 ? "" : "s"} free ·{" "}
              <b>{fmt(safeDischarge)}</b> safe to discharge (capped by {fmt(Math.max(0, housingFree))}{" "}
              empty Hearthstead bed{housingFree === 1 ? "" : "s"} and the 30% guard line) ·{" "}
              <a href="/guide#regulars">📜 saving &amp; killing regulars</a>
            </p>
          </div>
        </div>
      </Panel>

      <div id="strategy" />
      {/* ── Strategy: the army's standing orders ────────────────────────────
          These are decisions about your HOST, so they belong beside it rather
          than on the Siege Works page (where the sortie used to live — the
          engines are equipment, this is doctrine). */}
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
              out, a footman-heavy one almost certainly does not. Your footmen and cavalry ride
              together; you keep the wall&apos;s protection either way, but the attacker&apos;s
              screen draws off riders by the head before any reach their engines.
            </p>
            {/* THE GATES, live. The order used to sit enabled and silently
                never fire — a player at 60 stamina or with a thin screen had
                no way to see why their captains kept the gates shut. */}
            {p.army.sortieEnabled && (() => {
              const cap = Math.floor(
                (troopTotal(p.army.footmen) + troopTotal(p.army.cavalry)) * MERCENARIES.CAP_RATIO,
              );
              const screenHave = troopTotal(p.army.mercenaries.footmen) + troopTotal(p.army.mercenaries.cavalry);
              const screenNeed = Math.ceil(cap * SORTIE.MIN_SCREEN);
              const rested = p.army.stamina >= SORTIE.MIN_STAMINA;
              const screened = cap <= 0 || screenHave >= screenNeed;
              return (
                <p className="order-why" style={{ marginTop: 4 }}>
                  Your captains only open the gates <b>rested and screened</b>:{" "}
                  <span style={{ color: rested ? "var(--pos)" : "var(--neg)", fontWeight: 700 }}>
                    {rested ? "✓" : "✗"} stamina {p.army.stamina} / {SORTIE.MIN_STAMINA}
                  </span>
                  {" · "}
                  <span style={{ color: screened ? "var(--pos)" : "var(--neg)", fontWeight: 700 }}>
                    {screened ? "✓" : "✗"} hired screen {screenHave} / {screenNeed}
                  </span>
                  {!rested || !screened ? " — until both hold, the order stands but nobody rides." : ""}
                </p>
              );
            })()}
            <CmdForm name="setSortie" path="/troops#strategy">
              <input type="hidden" name="enabled" value={p.army.sortieEnabled ? "false" : "true"} />
              <Btn className="btn">
                {p.army.sortieEnabled ? "Hold the wall instead" : "Order the sortie"}
              </Btn>
            </CmdForm>
          </li>

          <li className="order">
            <div className="order-head">
              <span className="order-name">🎯 Where the trebuchets aim</span>
              <span className={`order-state${counterFirst ? " is-on" : ""}`}>
                {counterFirst ? "Counter-siege first" : "General barrage"}
              </span>
            </div>
            <p className="order-why">
              Trebuchets can only spend their fire once. A <b>general barrage</b> sends{" "}
              {Math.round(siegeShare * 100)}% at whatever battery answers and drops the rest on the
              wall — or on the town once the wall is breached. <b>Counter-siege first</b> lays every
              engine on their Counter-Engines instead: your accuracy against them rises by half, to{" "}
              {Math.round(Math.min(1, siegeShare * (1 + SIEGE_STANCE.COUNTER_FOCUS_BONUS)) * 100)}%,
              and everything left over is <b>wasted</b> — not a stone reaches the masonry. Worth it
              against a battery you cannot out-shoot, and a thrown-away barrage against a token one.
              They keep their emplacement edge either way; committing makes you better at the duel,
              never makes it fair. The same order governs a bombard, a castle attack and a revenge.
            </p>
            <CmdForm name="setSiegeStance" path="/troops#strategy">
              <input type="hidden" name="stance" value={counterFirst ? "general" : "counter"} />
              <Btn className="btn">
                {counterFirst ? "Back to a general barrage" : "Silence their battery first"}
              </Btn>
            </CmdForm>
          </li>
        </ul>
      </Panel>
    </>
  );
}
