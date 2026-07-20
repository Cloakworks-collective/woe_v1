import { cmd } from "@/app/actions";
import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import { SLOTS_PER_BUILDING_LEVEL, TRAINING_COSTS, UNIT_GUIDE, UNIT_INFO } from "@/lib/constants";
import { level, type Player, type WorkerRole } from "@/lib/engine";
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
function AssignRecall({ role, assigned }: { role: WorkerRole; assigned: number }) {
  return (
    <form action={cmd} className="assign-form">
      <input type="hidden" name="__path" value="/train" />
      <input type="hidden" name="role" value={role} />
      <input name="count" placeholder="#" aria-label={`Number of ${role}`} size={4} style={{ font: "14.5px Verdana", padding: 2 }} />
      <button className="btn" name="__cmd" value="assignWorkers">
        Assign
      </button>
      <button className="btn btn-recall" name="__cmd" value="recallWorkers" disabled={assigned === 0} title="Send workers back to the idle pool">
        Recall
      </button>
    </form>
  );
}

function CountForm({ name, path, label, extra }: { name: string; path: string; label: string; extra?: Record<string, string> }) {
  return (
    <CmdForm name={name} path={path}>
      {extra &&
        Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input name="count" placeholder="#" aria-label={`${label} count`} size={4} style={{ font: "14.5px Verdana", padding: 2 }} />
      <button className="btn">{label}</button>
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
      capacity: `${SLOTS_PER_BUILDING_LEVEL * level(p, "shadow_guild")} Shadow Guild slots`,
    },
    {
      unit: "scout" as const,
      art: "units/scout",
      cmd: "trainScouts",
      current: p.army.scouts,
      cost: TRAINING_COSTS.scout.gold,
      capacity: `${SLOTS_PER_BUILDING_LEVEL * level(p, "rangers_lodge")} Ranger's Lodge slots`,
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
        info="Worker assignment is free and reversible — assign idle peasants in, or recall them back to idle. No free slot, no assignment: the building always comes first."
        guide="/guide#grow"
      >
        <div className="card-grid">
          {ROLES.map(({ role, label, building, buildingId }) => {
            const slots = SLOTS_PER_BUILDING_LEVEL * level(p, buildingId);
            const assigned = p.workers[role];
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
                    <Art path={`workers/${role}`} size={88} title={label} />
                  </span>
                  <div className="bcard-body">
                    <p style={{ margin: "0 0 7px" }}>
                      <b>{assigned}</b> assigned · {slots} slot{slots === 1 ? "" : "s"}
                    </p>
                    <AssignRecall role={role} assigned={assigned} />
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
                  <Art path={art} size={88} title={UNIT_INFO[unit].title} />
                </span>
                <div className="bcard-body">
                  <ul className="bcard-costs" style={{ marginBottom: 7 }}>
                    <li>
                      <ResIcon kind="gold" size={20} /> {cost} each
                    </li>
                  </ul>
                  <CountForm name={cmd} path="/train" label="Train" />
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
