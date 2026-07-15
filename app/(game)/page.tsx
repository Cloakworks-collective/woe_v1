import Link from "next/link";
import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { Info } from "@/components/Info";
import { Meter } from "@/components/Meter";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import { StatTile } from "@/components/StatTile";
import { TaxSlider } from "@/components/TaxSlider";
import { VictoryTracker } from "@/components/VictoryTracker";
import { eventLine, eventTone } from "@/components/eventLine";
import { timeAgo } from "@/components/timeAgo";
import { ACTION_GUIDE, ACTION_INFO, RACE_NAMES, RESEARCH_FIELDS, STAMINA, rpCost } from "@/lib/constants";
import {
  advisorReport,
  civilians,
  foodUpkeepPerTurn,
  military,
  productionRates,
  protectedCapacity,
  rankingScore,
  researchLevel,
  researchRate,
  settlementTitle,
  taxIncomePerTurn,
  totalPopulation,
  wallName,
  type GameEvent,
  type Resource,
} from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const RES_LABELS: { key: Resource; label: string; icon: string }[] = [
  { key: "food", label: "Food", icon: "🍞" },
  { key: "wood", label: "Wood", icon: "🪵" },
  { key: "stone", label: "Stone", icon: "🪨" },
  { key: "ore", label: "Ore", icon: "⚒️" },
];

export default async function CommandView({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, player: p } = await getGame();
  const rates = productionRates(p);
  const advisors = advisorReport(p);
  const activeField = RESEARCH_FIELDS.find((f) => f.id === p.research.activeField);
  const inbox = world.inbox[p.id] ?? [];
  const revengeOpen = p.recentAttackers.filter(
    (a) => world.meta.tickNumber - a.tick <= 108 && !p.revengeUsed.includes(a.playerId),
  );

  return (
    <>
      <Flash err={err} ok={ok} />
      <VictoryTracker world={world} me={p} />
      <Panel title={`The ${settlementTitle(p)} of ${p.name} — ${RACE_NAMES[p.race]}`}>
        <span className="portrait-frame">
          <Art path={`races/${p.race}`} size={120} title={RACE_NAMES[p.race]} />
          <span className="cap">{RACE_NAMES[p.race]}</span>
        </span>
        <div className="stat-grid">
          <StatTile icon="🏆" label="Ranking score" value={fmt(rankingScore(p))} />
          <StatTile
            icon="👥"
            label="Population"
            value={fmt(totalPopulation(p))}
            sub={`${fmt(civilians(p))} civ · ${fmt(military(p))} at arms`}
          />
          <StatTile icon="⚔️" label="Battles" value={`${p.battlesWon}W / ${p.battlesLost}L`} />
          <StatTile icon="⚖️" label="Tax rate" value={`${Math.round(p.taxRate * 100)}%`} />
          <StatTile
            icon={<ResIcon kind="gold" size={22} />}
            label="Tax income / turn"
            value={fmt(taxIncomePerTurn(p))}
          />
          <StatTile
            icon={<ResIcon kind="gold" size={22} />}
            label="Banked gold"
            value={fmt(p.bankedGold)}
          />
          <StatTile
            icon={p.surrendered ? "🏳" : p.starving ? "☠" : revengeOpen.length ? "⚔️" : "🛡️"}
            label="Status"
            value={
              p.surrendered
                ? "Surrendered"
                : p.starving
                  ? "Starving"
                  : revengeOpen.length
                    ? `${revengeOpen.length} revenge open`
                    : "At large"
            }
            tone={p.starving ? "bad" : p.surrendered || revengeOpen.length ? "warn" : "good"}
          />
        </div>
        <div className="stat-grid" style={{ marginTop: 8 }}>
          <Meter
            icon="🧱"
            label={`Walls — ${wallName(p)}`}
            value={Math.round(p.wallIntegrity * 100)}
            max={100}
            display={`${Math.round(p.wallIntegrity * 100)}%`}
          />
          <Meter
            icon="🔥"
            label="Stamina"
            value={p.army.stamina}
            max={STAMINA.MAX}
            display={`${p.army.stamina} / ${STAMINA.MAX}`}
          />
          <Meter
            icon="🎖️"
            label="Army experience"
            value={p.army.experience}
            max={100}
            display={`${p.army.experience} / 100`}
          />
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 3, display: "flex", gap: 5, alignItems: "center" }}>
              <span>The tax dial</span>
              <Info tip={ACTION_INFO.tax} guide={ACTION_GUIDE.tax} />
            </div>
            <CmdForm name="setTax" path="/">
              <TaxSlider taxRate={p.taxRate} civilians={civilians(p)} />
            </CmdForm>
          </div>
          <CmdForm name="bank" path="/">
            <label style={{ fontSize: 12.5, marginRight: 4, display: "inline-flex", gap: 4, alignItems: "center" }}>
              Bank <Info tip={ACTION_INFO.bank} guide={ACTION_GUIDE.bank} />
            </label>
            <input name="amount" placeholder="gold ±" aria-label="Gold to bank (negative withdraws)" size={8} style={{ font: "13.5px Verdana", padding: 4 }} />
            <button className="btn">Bank</button>
          </CmdForm>
          <CmdForm name="surrender" path="/">
            <input type="hidden" name="flag" value={p.surrendered ? "" : "1"} />
            <span style={{ marginRight: 4 }}>
              <Info tip={ACTION_INFO.surrender} guide={ACTION_GUIDE.surrender} />
            </span>
            <button className="btn" style={{ background: "linear-gradient(#a8853f,#7c5426)", borderColor: "#4e3113" }}>
              {p.surrendered ? "Lift the white flag" : "Surrender"}
            </button>
          </CmdForm>
        </div>
      </Panel>

      <div className="panel-row">
        <Panel title="Treasury & Production">
          <table className="tbl">
            <thead>
              <tr>
                <th>Resource</th>
                <th className="num">In stores</th>
                <th className="num">Protected</th>
                <th className="num">Per turn</th>
              </tr>
            </thead>
            <tbody>
              {RES_LABELS.map(({ key, label, icon }) => (
                <tr key={key}>
                  <td>
                    {icon} {label}
                  </td>
                  <td className="num">{fmt(p.resources[key])}</td>
                  <td className="num">{fmt(protectedCapacity(p, key))}</td>
                  <td className="num">
                    +{fmt(rates[key])}
                    {key === "food" ? ` / −${fmt(foodUpkeepPerTurn(p))}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="At a Glance">
          <dl className="kv">
            <dt>📚 Researching</dt>
            <dd>
              {activeField
                ? `${activeField.name} → level ${researchLevel(p, activeField.id) + 1} (${Math.round(
                    ((p.research.banked[activeField.id] ?? 0) /
                      rpCost(researchLevel(p, activeField.id) + 1)) *
                      100,
                  )}% done)`
                : "— no scholars at work —"}
            </dd>
            <dt>⚗ Research / turn</dt>
            <dd>+{fmt(researchRate(p))} points</dd>
            <dt>⚔ Soldiers under arms</dt>
            <dd>
              {fmt(military(p))} (+{p.army.mercenaries} mercenaries)
            </dd>
            <dt>🏹 Siege train</dt>
            <dd>
              {p.army.siegeEngineers} crews, {Object.values(p.army.siegeGear).reduce((a, b) => a + b, 0)} engines
            </dd>
          </dl>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <Link className="btn" href="/research">
              The Collegium
            </Link>
            <Link className="btn" href="/advisors">
              Hear the Advisors
            </Link>
            <Link className="btn" href="/siege">
              Siege Works
            </Link>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8 }}>
            The council&apos;s loudest voice: “{advisors.population}”
          </p>
        </Panel>
      </div>

      <Panel title="Chronicle — latest tidings">
        {inbox.length === 0 ? (
          <p style={{ fontSize: 13.5, fontStyle: "italic" }}>The vellum is yet unmarked. History is unwritten.</p>
        ) : (
          <ul className="chron">
            {inbox.slice(0, 8).map((item, i) => (
              <li key={i} className={`chron-row tone-${eventTone(item.event)}`}>
                <span className="chron-line">{eventLine(item.event)}</span>
                <span className="chron-when" title={`turn ${item.tick}`}>
                  {timeAgo(item, world.meta)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p style={{ fontSize: 12.5, marginTop: 6 }}>
          <Link href="/chronicle">→ the full Chronicle & battle ledger</Link>
        </p>
        {revengeOpen.length > 0 && (
          <p style={{ marginTop: 6, fontSize: 13.5 }}>
            ⚔ Revenge windows open against:{" "}
            {revengeOpen.map((r) => world.players[r.playerId]?.name ?? "?").join(", ")} —{" "}
            <Link href="/attack">to the war room</Link>.
          </p>
        )}
      </Panel>

      <Panel title="🖥 Rule from the terminal">
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13.5 }}>
            Your realm token — plays this same empire from the CLI (click to reveal)
          </summary>
          <p style={{ margin: "6px 0 4px" }}>
            <code style={{ background: "var(--panel-alt)", padding: "2px 6px", fontSize: 13.5 }}>
              {p.apiToken}
            </code>
          </p>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
            Keep it secret — it IS your throne. In the repo:{" "}
            <code>node cli/woe.mjs link {"<token>"}</code>, then <code>node cli/woe.mjs</code> to
            play. Also re-enters this empire at the login gate from any browser.
          </p>
        </details>
      </Panel>
    </>
  );
}
