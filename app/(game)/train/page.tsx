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
import { GUILD_EFFECT_PER_LEVEL, workerOutputAtLevel, TRAINING_COSTS, UNIT_GUIDE, UNIT_INFO, catchableOpLevel } from "@/lib/constants";
import { caravanDeliveryTurns, level, type Player, type WorkerRole } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

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

const MUSTER = (p: Player) =>
  [
    {
      unit: "spy" as const,
      art: "units/spy",
      cmd: "trainSpies",
      current: p.army.spies,
      cost: TRAINING_COSTS.spy.gold,
      capacity: `unlimited — Shadow Guild L${level(p, "shadow_guild")} makes each mission +${Math.round(level(p, "shadow_guild") * GUILD_EFFECT_PER_LEVEL * 100)}% effective`,
    },
    {
      unit: "scout" as const,
      art: "units/scout",
      cmd: "trainScouts",
      current: p.army.scouts,
      cost: TRAINING_COSTS.scout.gold,
      capacity: `unlimited — Ranger's Lodge L${level(p, "rangers_lodge")} catches spy ops up to level ${catchableOpLevel(level(p, "rangers_lodge")) || 0}`,
    },
  ];

export default async function TrainPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { player: p } = await getGame();

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#grow">Workers, food &amp; how to grow</LearnLink>

      {p.idlePeasants > 0 && (
        <div className="alert alert-warn idle-banner" role="status">
          <span className="alert-icon">👥</span>
          <div>
            <div className="alert-title">
              {p.idlePeasants} idle peasant{p.idlePeasants === 1 ? "" : "s"} await your word
            </div>
            <div className="alert-body">
              Idle hands produce nothing. Assign them below — farmers feed the realm first, then split
              the rest across your producers. You can recall any worker back to idle at any time.
            </div>
          </div>
        </div>
      )}

      <Panel
        title="The Assignment Hall"
        info="Worker assignment is free and reversible. EVERY worker is UNLIMITED — you only need the building. Its level raises how effective each worker is: farmers/quarrymen/miners/lumberjacks and researchers make 50/turn at L1 up to 500 at L10; each Market Square level lets every caravan carry another 1,000 goods AND shortens the road to the Bazaar (100 turns at L1 down to 10 at L10)."
        guide="/guide#grow"
      >
        <div className="card-grid">
          {ROLES.map(({ role, label, building, buildingId }) => {
            const lvl = level(p, buildingId);
            const assigned = p.workers[role];
            // Every worker is uncapped; the building level lifts the per-worker effect.
            const effect =
              role === "merchants"
                ? `each caravan carries ${(1000 * lvl).toLocaleString("en-US")} goods · ${caravanDeliveryTurns(lvl)}-turn road to the Bazaar`
                : `each makes ${workerOutputAtLevel(lvl)}/turn`;
            return (
              <div className="bcard" key={role}>
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

      <Panel title="The Muster — spies &amp; scouts">
        <div className="card-grid">
          {MUSTER(p).map(({ unit, art, cmd, current, cost, capacity }) => (
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
                    afford={p.gold >= cost}
                    heading={`Train ${UNIT_INFO[unit].title}`}
                    goldEach={cost}
                    haveGold={p.gold}
                  />
                </div>
              </div>
              <div className="bcard-gain">
                <b>Capacity</b>: {capacity}
              </div>
            </div>
          ))}
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
