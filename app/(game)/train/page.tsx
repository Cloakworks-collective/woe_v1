import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import { SLOTS_PER_BUILDING_LEVEL, TRAINING_COSTS, TROOPS_PER_MUSTER_HALL, UNIT_GUIDE, UNIT_INFO } from "@/lib/constants";
import { civilians, level, military, type Player, type WorkerRole } from "@/lib/engine";
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

function CountForm({ name, path, label, extra }: { name: string; path: string; label: string; extra?: Record<string, string> }) {
  return (
    <CmdForm name={name} path={path}>
      {extra &&
        Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input name="count" placeholder="#" aria-label={`${label} count`} size={4} style={{ font: "13.5px Verdana", padding: 2 }} />
      <button className="btn">{label}</button>
    </CmdForm>
  );
}

const MUSTER = (p: Player, musterFree: number) =>
  [
    {
      unit: "warrior" as const,
      art: "units/footman",
      cmd: "trainWarriors",
      current: p.warriors,
      cost: TRAINING_COSTS.warrior.gold,
      capacity: `${musterFree} Muster Hall slots free`,
    },
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
  const musterFree = level(p, "muster_hall") * TROOPS_PER_MUSTER_HALL - military(p);
  const housingFree = level(p, "hearthstead") * 10 - civilians(p);

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#grow">Workers, food &amp; how to grow</LearnLink>
      <Panel
        title={`The Assignment Hall — ${p.idlePeasants} idle peasants await your word`}
        info="Worker assignment is free and reversible. No free slot, no assignment — the building always comes first."
        guide="/guide#grow"
      >
        <div className="card-grid">
          {ROLES.map(({ role, label, building, buildingId }) => {
            const slots = SLOTS_PER_BUILDING_LEVEL * level(p, buildingId);
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
                      <b>{p.workers[role]}</b> assigned · {slots} slots
                    </p>
                    <CountForm name="assignWorkers" path="/train" label="Assign" extra={{ role }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="The Muster — peasants to soldiers">
        <div className="card-grid">
          {MUSTER(p, musterFree).map(({ unit, art, cmd, current, cost, capacity }) => (
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

          <div className="bcard">
            <div className="bcard-head">
              <div>
                <span className="bcard-name">Discharge warriors</span>
                <div className="bcard-sub">back to civilian life</div>
              </div>
            </div>
            <div className="bcard-main">
              <div className="bcard-body">
                <p style={{ margin: "0 0 7px" }}>
                  <b>{p.warriors}</b> warriors under arms
                </p>
                <CountForm name="dischargeWarriors" path="/train" label="Discharge" />
              </div>
            </div>
            <div className="bcard-gain">
              <b>Capacity</b>: {housingFree} beds free (no housing, no discharge)
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 10 }}>
          Siege engineers are trained at the <a href="/siege">Siege Works</a>; footmen, archers and
          cavalry are equipped in <a href="/troops">The Army</a>.
        </p>
      </Panel>
    </>
  );
}
