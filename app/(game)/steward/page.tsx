import { LearnLink } from "@/components/LearnLink";
import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { Panel } from "@/components/Panel";
import {
  CIVILIAN_BUILDINGS,
  MILITARY_BUILDINGS,
  RESEARCH_FIELDS,
  STEWARD_QUEUE_CAP,
  WORK_QUEUE_CAP,
} from "@/lib/constants";
import type { BuildingMeta } from "@/lib/constants/buildings";
import {
  conditionMet,
  level,
  researchLevel,
  type OrderAction,
  type OrderCondition,
  type Player,
} from "@/lib/engine";
import { buildingCost } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const ALL_BUILDINGS: BuildingMeta[] = [
  ...CIVILIAN_BUILDINGS,
  { id: "hearthstead", name: "Hearthstead", desc: "" } as BuildingMeta,
  ...MILITARY_BUILDINGS,
];

const buildingName = (id: string) => ALL_BUILDINGS.find((b) => b.id === id)?.name ?? id;
const fieldName = (id: string) => RESEARCH_FIELDS.find((f) => f.id === id)?.name ?? id;
const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

function describeCondition(c: OrderCondition): string {
  switch (c.kind) {
    case "building": return `once ${buildingName(c.building)} reaches level ${c.level}`;
    case "research": return `once ${fieldName(c.field)} reaches level ${c.level}`;
    case "gold": return `when gold reaches ${fmt(c.amount)}`;
    case "resource": return `when ${c.resource} reaches ${fmt(c.amount)}`;
  }
}

function describeAction(a: OrderAction): string {
  switch (a.kind) {
    case "trainTroops": return `train ${fmt(a.count)} ${a.tier} ${a.type} (${fmt(a.remaining)} to go)`;
    case "trainSpies": return `train ${fmt(a.count)} spies (${fmt(a.remaining)} to go)`;
    case "trainScouts": return `train ${fmt(a.count)} scouts (${fmt(a.remaining)} to go)`;
    case "trainEngineers": return `train ${fmt(a.count)} siege engineers (${fmt(a.remaining)} to go)`;
    case "build": return `raise the ${buildingName(a.building)}`;
    case "setTax": return `set the tax rate to ${Math.round(a.rate * 100)}%`;
  }
}

function QueueCancel({ name, index, path }: { name: string; index: number; path: string }) {
  return (
    <CmdForm name={name} path={path}>
      <input type="hidden" name="index" value={index} />
      <ReqTip heading="Remove from queue" body="Drop this entry from the Steward's queue — it won't be built or studied, and later entries move up.">
        <Btn className="btn" aria-label="Remove from queue">✕</Btn>
      </ReqTip>
    </CmdForm>
  );
}

export default async function StewardPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { player: p } = await getGame();

  if (!p.premium) {
    return (
      <>
        <LearnLink href="/guide#charter">What the Charter buys</LearnLink>
        <Flash err={err} ok={ok} />
        <Panel title="👑 The Royal Charter — a locked chamber">
          <p style={{ fontSize: 14.5 }}>
            An empty desk gathers dust. The Steward — the automation you unlock with the{" "}
            <a href="/premium">Royal Charter (premium)</a> — serves only empires that hold it: build
            queues, research queues, and standing orders like{" "}
            <i>“once the Drill Yard is built, train 1,000 light footmen.”</i>
          </p>
        </Panel>
      </>
    );
  }

  const bq = p.buildQueue ?? [];
  const rq = p.researchQueue ?? [];
  const orders = p.standingOrders ?? [];

  return (
    <>
      <LearnLink href="/guide#charter">What the Steward does</LearnLink>
      <Flash err={err} ok={ok} />
      <Panel title="👑 The Royal Charter — the Steward at work">
        <p style={{ fontSize: 14.5 }}>
          Your Royal Charter (premium) is sealed for this age. Its <b>Steward</b> works every turn:
          he raises queued buildings as soon as the treasury allows, keeps the scholars on course,
          and executes standing orders the moment their conditions are met. Queue buildings from the{" "}
          <a href="/buildings">Buildings</a> page and research from <a href="/research">the
          Collegium</a>.
        </p>
      </Panel>

      {/* Both queues are now shown and managed where the work is CHOSEN too —
          Buildings and the Collegium each carry the same list beside the thing
          you would queue. These stay because this page answers a different
          question ("what is the Steward doing", both queues plus the standing
          orders, in one place); they are the same underlying list, so a removal
          here and a removal there are the same command. */}
      <div className="panel-row">
        <Panel title={`Build queue — ${bq.length}/${WORK_QUEUE_CAP}`}>
          {bq.length === 0 ? (
            <p style={{ fontSize: 14.5, fontStyle: "italic" }}>Nothing queued.</p>
          ) : (
            <table className="tbl">
              <tbody>
                {bq.map((id, i) => {
                  const target = level(p, id) + 1 + bq.slice(0, i).filter((b) => b === id).length;
                  const cost = buildingCost(id, target);
                  return (
                    <tr key={`${id}-${i}`}>
                      <td>{i + 1}.</td>
                      <td><b>{buildingName(id)}</b> → level {target}</td>
                      <td className="num" style={{ fontSize: 13.5 }}>
                        🪙{fmt(cost.gold)} 🪵{fmt(cost.wood)} 🪨{fmt(cost.stone)} ⚒️{fmt(cost.ore)}
                      </td>
                      <td><QueueCancel name="queueBuildCancel" index={i} path="/steward" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title={`Research queue — ${rq.length}/${WORK_QUEUE_CAP}`}>
          {rq.length === 0 ? (
            <p style={{ fontSize: 14.5, fontStyle: "italic" }}>No course of study charted.</p>
          ) : (
            <table className="tbl">
              <tbody>
                {rq.map((e, i) => (
                  <tr key={`${e.field}-${e.toLevel}`}>
                    <td>{i + 1}.</td>
                    <td>
                      <b>{fieldName(e.field)}</b> → level {e.toLevel}
                      {researchLevel(p, e.field) >= e.toLevel && " (reached)"}
                    </td>
                    <td><QueueCancel name="queueResearchCancel" index={i} path="/steward" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title={`Standing orders — ${orders.length}/${STEWARD_QUEUE_CAP}`}>
        {orders.length === 0 ? (
          <p style={{ fontSize: 14.5, fontStyle: "italic" }}>
            No standing orders. Give the Steward an “once X, do Y” instruction below.
          </p>
        ) : (
          <table className="tbl">
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <b>{describeCondition(o.when)}</b>, {describeAction(o.then)}
                    {conditionMet(p, o.when) && (
                      <span style={{ color: "var(--green-dark)", fontSize: 13.5 }}> — condition met, executing…</span>
                    )}
                  </td>
                  <td style={{ width: 40 }}>
                    <CmdForm name="orderRemove" path="/steward">
                      <input type="hidden" name="orderId" value={o.id} />
                      <ReqTip heading="Cancel this standing order" body="The Steward will stop watching for this condition and never fire the action.">
                        <Btn className="btn" aria-label="Remove standing order">✕</Btn>
                      </ReqTip>
                    </CmdForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 style={{ margin: "11.5px 0 4px" }}>New standing order</h3>
        <CmdForm name="orderAdd" path="/steward" inline={false}>
          <fieldset style={{ border: "1px solid var(--border-light)", padding: 8, marginBottom: 6 }}>
            <legend style={{ fontSize: 13.5, fontWeight: 700 }}>Once… (condition)</legend>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 14.5 }}>
              <select name="whenKind" aria-label="Condition type" defaultValue="building">
                <option value="building">a building reaches a level</option>
                <option value="research">a research field reaches a level</option>
                <option value="gold">gold on hand reaches an amount</option>
                <option value="resource">a resource reaches an amount</option>
              </select>
              <select name="whenBuilding" aria-label="Condition building">
                {ALL_BUILDINGS.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <select name="whenField" aria-label="Condition research field">
                {RESEARCH_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <select name="whenResource" aria-label="Condition resource">
                <option value="food">food</option>
                <option value="wood">wood</option>
                <option value="stone">stone</option>
                <option value="ore">ore</option>
              </select>
              <label style={{ fontSize: 13.5 }}>
                level <input name="whenLevel" type="number" defaultValue={1} min={1} size={3} aria-label="Condition level" />
              </label>
              <label style={{ fontSize: 13.5 }}>
                amount <input name="whenAmount" type="number" defaultValue={10000} min={1} size={8} aria-label="Condition amount" />
              </label>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "4px 0 0" }}>
              Only the fields matching the chosen condition are read (building+level,
              field+level, or amount).
            </p>
          </fieldset>

          <fieldset style={{ border: "1px solid var(--border-light)", padding: 8, marginBottom: 6 }}>
            <legend style={{ fontSize: 13.5, fontWeight: 700 }}>…do (action)</legend>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 14.5 }}>
              <select name="thenKind" aria-label="Action type" defaultValue="trainTroops">
                <option value="trainTroops">train troops</option>
                <option value="trainEngineers">train siege engineers</option>
                <option value="trainSpies">train spies</option>
                <option value="trainScouts">train scouts</option>
                <option value="build">raise a building</option>
                <option value="setTax">set the tax rate</option>
              </select>
              <label style={{ fontSize: 13.5 }}>
                count <input name="thenCount" type="number" defaultValue={100} min={1} size={6} aria-label="Action count" />
              </label>
              <select name="thenType" aria-label="Troop type (train troops)">
                <option value="footman">footmen</option>
                <option value="archer">archers</option>
                <option value="cavalry">cavalry</option>
              </select>
              <select name="thenTier" aria-label="Troop tier (train troops)">
                <option value="light">light</option>
                <option value="medium">medium</option>
                <option value="heavy">heavy</option>
              </select>
              <select name="thenBuilding" aria-label="Building to raise (build)">
                {ALL_BUILDINGS.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <label style={{ fontSize: 13.5 }}>
                tax % <input name="thenRatePct" type="number" defaultValue={50} min={0} max={100} size={3} aria-label="Tax percent (set tax)" />
              </label>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "4px 0 0" }}>
              Training and equipping fulfill <b>partially</b> as resources and slots allow, until
              the full count is reached. Build and tax orders fire once.
            </p>
          </fieldset>
          <ReqTip
            heading="Give the Steward this order"
            body="File an “once X, do Y” instruction. The Steward checks it every turn and fires the action automatically the moment the condition is met."
            note="Training orders fulfil partially as resources and slots allow; build and tax orders fire once."
          >
            <Btn className="btn">🪶 Give the order</Btn>
          </ReqTip>
        </CmdForm>
      </Panel>
    </>
  );
}
