import { Btn } from "@/components/Btn";

import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { CostTip, ReqTip } from "@/components/CostTip";
import { CountInput } from "@/components/CountInput";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import { GUILD_BONUS_PER_LEVEL, researchOutputAtLevel, workerOutputAtLevel, TRAINING_COSTS, UNIT_GUIDE, UNIT_INFO, CARAVAN_CAPACITY_PER_MARKET_LEVEL } from "@/lib/constants";
import {
  caravanDeliveryTurns,
  level,
  mercPrice,
  mercsOfArm,
  purseGold,
  regularsOfArm,
  wonderDiscount,
  type Player,
  type WorkerRole,
} from "@/lib/engine";
import { MERCENARIES } from "@/lib/constants";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");

const ROLES: { role: WorkerRole; label: string; building: string; buildingId: Parameters<typeof level>[1] }[] = [
  { role: "farmers", label: "Farmers", building: "The Grange", buildingId: "grange" },
  { role: "quarrymen", label: "Quarrymen", building: "Mason's Quarry", buildingId: "masons_quarry" },
  { role: "miners", label: "Miners", building: "Deepvein Mine", buildingId: "deepvein_mine" },
  { role: "lumberjacks", label: "Lumberjacks", building: "Sawyer's Mill", buildingId: "sawyers_mill" },
  { role: "merchants", label: "Merchants", building: "Market Square", buildingId: "market_square" },
  { role: "researchers", label: "Researchers", building: "The Collegium", buildingId: "collegium" },
];

/** One input, two verbs: assign idle peasants in, or recall them to idle. The
 *  clicked submit button carries __cmd, so the same form drives both. */
function AssignRecall({ role, label, assigned, idle }: { role: WorkerRole; label: string; assigned: number; idle: number }) {
  return (
    <CmdForm path="/train" className="assign-form" inline={false}>
      <input type="hidden" name="role" value={role} />
      <CountInput ariaLabel={`Number of ${role}`} max={idle} />
      <ReqTip
        heading={`Assign ${label}`}
        body="Put idle peasants to work here — they produce every turn while assigned."
        rows={[{ icon: <span className="costtip-ico">👥</span>, label: "Idle peasants", need: 1, have: idle }]}
        note="1 idle peasant per worker. Assigning is free and reversible — recall them any time. Needs the building at level 1+."
        disabledReason={idle === 0 ? "No idle peasants — recall workers elsewhere or wait for dawn's settlers." : undefined}
      >
        <Btn className="btn" name="__cmd" value="assignWorkers" disabled={idle === 0}>
          Assign
        </Btn>
      </ReqTip>
      <ReqTip
        heading={`Recall ${label}`}
        body="Send these workers back to the idle pool — they stop producing, ready to reassign or train into soldiers."
        disabledReason={assigned === 0 ? "None assigned here to recall." : undefined}
      >
        <Btn className="btn btn-recall" name="__cmd" value="recallWorkers" disabled={assigned === 0}>
          Recall
        </Btn>
      </ReqTip>
    </CmdForm>
  );
}

function CountForm({
  name,
  path,
  label,
  extra,
  afford = true,
  heading,
  goldEach,
  haveGold,
}: {
  name: string;
  path: string;
  label: string;
  extra?: Record<string, string>;
  /** Can the empire afford at least one? false → dull-red, disabled button. */
  afford?: boolean;
  /** When set, the button carries a hover cost table (gold-per-one vs on hand). */
  heading?: string;
  goldEach?: number;
  haveGold?: number;
}) {
  const btn = (
    <Btn className={afford ? "btn" : "btn btn-no"} disabled={!afford}>
      {label}
    </Btn>
  );
  return (
    <CmdForm name={name} path={path}>
      {extra &&
        Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <CountInput
        ariaLabel={`${label} count`}
        disabled={!afford}
        max={goldEach != null && haveGold != null && goldEach > 0 ? Math.floor(haveGold / goldEach) : undefined}
      />
      {goldEach != null && haveGold != null ? (
        <CostTip
          heading={heading}
          body="Trained from your treasury — gold only, no peasants."
          cost={{ gold: goldEach, wood: 0, stone: 0, ore: 0 }}
          have={{ gold: haveGold, wood: 0, stone: 0, ore: 0 }}
          note="Gold shown is per one — × the number you enter."
          disabledReason={afford ? undefined : "Not enough gold to train even one."}
        >
          {btn}
        </CostTip>
      ) : (
        btn
      )}
    </CmdForm>
  );
}

/**
 * The covert corps — raised AND hired in one place.
 *
 * Hiring spies and rangers used to live in the Black Market on /troops, behind a
 * row of pills whose last two entries were these. That put the covert arms two
 * pages away from the only other control that touches them, and it read as if
 * the shadow war were an afterthought to the battle line. Everything about a
 * spy — the gold, the sellsword, the Guild that makes them better — now sits on
 * one card.
 *
 * `mercGate` is the building each hired arm answers to (hireMercenaries refuses
 * without it); `mercRoom` is what the ⅓-of-your-own-regulars cap leaves.
 */
const MUSTER = (p: Player, discount: number) =>
  [
    {
      unit: "spy" as const,
      arm: "spy" as const,
      art: "units/spy",
      cmd: "trainSpies",
      current: p.army.spies,
      hired: mercsOfArm(p, "spy"),
      cost: TRAINING_COSTS.spy.gold,
      mercCost: mercPrice(p, "spy", "light", discount),
      mercGate: level(p, "shadow_guild") > 0 ? null : "a Shadow Guild",
      mercRoom: Math.max(
        0,
        Math.floor(regularsOfArm(p, "spy") * MERCENARIES.CAP_RATIO) - mercsOfArm(p, "spy"),
      ),
      capacity: `unlimited — Shadow Guild L${level(p, "shadow_guild")} makes each mission +${Math.round(level(p, "shadow_guild") * GUILD_BONUS_PER_LEVEL * 100)}% effective`,
    },
    {
      unit: "scout" as const,
      arm: "scout" as const,
      art: "units/scout",
      cmd: "trainScouts",
      current: p.army.scouts,
      hired: mercsOfArm(p, "scout"),
      cost: TRAINING_COSTS.scout.gold,
      mercCost: mercPrice(p, "scout", "light", discount),
      mercGate: level(p, "rangers_lodge") > 0 ? null : "a Ranger's Lodge",
      mercRoom: Math.max(
        0,
        Math.floor(regularsOfArm(p, "scout") * MERCENARIES.CAP_RATIO) - mercsOfArm(p, "scout"),
      ),
      capacity: `unlimited — Ranger's Lodge L${level(p, "rangers_lodge")} catches spy ops up to level ${level(p, "rangers_lodge")}`,
    },
  ];

export default async function TrainPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, player: p } = await getGame();
  // Sellsword prices carry the Clan Wonder discount, same as the Black Market.
  const discount = wonderDiscount(p.clanId ? world.clans[p.clanId] : undefined);

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#grow">Workers, food &amp; how to grow</LearnLink>


      <div id="workers">
      <Panel
        title="The Assignment Hall"
        info={`Worker assignment is free and reversible. EVERY worker is UNLIMITED — you only need the building. Its level raises how effective each worker is: farmers, quarrymen, miners and lumberjacks make ${workerOutputAtLevel(1)}/turn at L1 up to ${workerOutputAtLevel(10)} at L10, while scholars make ${researchOutputAtLevel(1)} up to ${researchOutputAtLevel(10)} research a turn; each Market Square level lets every caravan carry another ${CARAVAN_CAPACITY_PER_MARKET_LEVEL.toLocaleString("en-US")} goods AND shortens the road to the Bazaar (${caravanDeliveryTurns(1)} turns at L1 down to ${caravanDeliveryTurns(10)} at L10).`}
        guide="/guide#grow"
      >
        {/* The number every decision on this page is made against. It was only
            visible per-card, inside each Assign control, so the answer to "how
            many can I move?" lived in six places and nowhere. */}
        <div className={`idle-bar${p.idlePeasants === 0 ? " is-empty" : ""}`}>
          <span className="idle-count">
            🧍 <b>{fmt(p.idlePeasants)}</b> idle peasant{p.idlePeasants === 1 ? "" : "s"}
          </span>
          <span className="idle-note">
            {p.idlePeasants === 0
              ? "Everyone is already at work. Recall some below, or wait for dawn's settlers."
              : "Unassigned and producing nothing — put them to a trade below."}
          </span>
        </div>
        <div className="card-grid">
          {ROLES.map(({ role, label, building, buildingId }) => {
            const lvl = level(p, buildingId);
            const assigned = p.workers[role];
            // Every worker is uncapped; the building level lifts the per-worker effect.
            const effect =
              role === "merchants"
                ? `each caravan carries ${(CARAVAN_CAPACITY_PER_MARKET_LEVEL * lvl).toLocaleString("en-US")} goods · ${caravanDeliveryTurns(lvl)}-turn road to the Bazaar`
                : `each makes ${workerOutputAtLevel(lvl)}/turn`;
            return (
              <div className="bcard" key={role} id={`w-${role}`}>
                <div className="bcard-head">
                  <div>
                    <span className="bcard-name">{label}</span>
                    <div className="bcard-sub">work at {building}</div>
                  </div>
                </div>
                <div className="bcard-main">
                  <span className="bcard-art">
                    <Art path={`workers/${role}`} size={216} title={label} race={p.race} />
                  </span>
                  <div className="bcard-body">
                    <p style={{ margin: "0 0 7px" }}>
                      {lvl === 0 ? (
                        <>
                          <b>{assigned}</b> at work — build the <b>{building}</b> to employ any
                        </>
                      ) : (
                        <>
                          <b>{assigned}</b> at work · <b>unlimited</b> — {effect} ({building} L{lvl})
                        </>
                      )}
                    </p>
                    <AssignRecall role={role} label={label} assigned={assigned} idle={p.idlePeasants} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      </div>

      <div id="shadows" />
      <Panel
        title="The Muster — spies &amp; rangers"
        info="Your whole covert corps in one place: raise your own, or hire sellswords of the same arm. Neither costs population or a barracks bed — agents live in town — and hired ones are capped at a third of your own and are taken first when a mission is intercepted."
        guide="/guide#shadows"
      >
        <div className="card-grid">
          {MUSTER(p, discount).map((u) => {
            const { unit, arm, art, cmd, current, hired, cost, mercCost, mercGate, mercRoom, capacity } = u;
            return (
            <div className="bcard" key={unit}>
              <div className="bcard-head">
                <div>
                  <Info tip={UNIT_INFO[unit].tip} title={UNIT_INFO[unit].title} guide={UNIT_GUIDE[unit]}>
                    <span className="bcard-name">{UNIT_INFO[unit].title}</span>
                  </Info>
                  <div className="bcard-sub">{current} in service</div>
                </div>
              </div>
              <div className="bcard-main">
                <span className="bcard-art">
                  <Art path={art} size={216} title={UNIT_INFO[unit].title} race={p.race} />
                </span>
                <div className="bcard-body">
                  <ul className="bcard-costs" style={{ marginBottom: 7 }}>
                    <li>
                      <ResIcon kind="gold" size={20} /> {cost} each
                    </li>
                  </ul>
                  <CountForm
                    name={cmd}
                    path="/train"
                    label="Train"
                    afford={purseGold(p) >= cost}
                    heading={`Train ${UNIT_INFO[unit].title}`}
                    goldEach={cost}
                    haveGold={purseGold(p)}
                  />

                  {/* Sellswords of the same arm, on the same card. They cost no
                      population and no barracks bed — covert agents live in
                      town — but they are capped at a third of your OWN, and they
                      are the ones taken first when a mission is intercepted. */}
                  <div className="covert-hire">
                    <span className="covert-hire-head">
                      Hire — {mercCost.toLocaleString("en-US")}g each
                      {hired > 0 ? ` · ${hired} on the books` : ""}
                    </span>
                    {mercGate ? (
                      <p className="covert-hire-why">
                        Hired {unit === "spy" ? "knives" : "rangers"} answer only to {mercGate} — build
                        it first.
                      </p>
                    ) : mercRoom === 0 ? (
                      <p className="covert-hire-why">
                        No room: sellswords may not outnumber a{" "}
                        {Math.round(1 / MERCENARIES.CAP_RATIO)}th of your own {unit}s. Train more of
                        your own first.
                      </p>
                    ) : (
                      <CountForm
                        name="buyMercs"
                        path="/train"
                        label="Hire"
                        // Tier is ignored for the untiered covert arms — see
                        // mercPrice — but the command signature still wants one.
                        extra={{ type: arm, tier: "light" }}
                        afford={purseGold(p) >= mercCost}
                        heading={`Hire ${unit === "spy" ? "hired knives" : "hired rangers"}`}
                        goldEach={mercCost}
                        haveGold={purseGold(p)}
                      />
                    )}
                    {!mercGate && mercRoom > 0 && (
                      <p className="covert-hire-why">
                        Room for <b>{mercRoom.toLocaleString("en-US")}</b> more. They take no
                        population and no bed, earn no veterancy, and fall first when a mission is
                        caught — which is what keeps your own alive.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="bcard-gain">
                <b>Capacity</b>: {capacity}
              </div>
            </div>
            );
          })}
        </div>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 10 }}>
          Footmen, archers, cavalry, and siege engineers are all raised straight from idle peasants
          in <a href="/troops">The Army</a> (and discharged there too); the siege engines they crew
          live at the <a href="/siege">Siege Works</a>.
        </p>
      </Panel>
    </>
  );
}
