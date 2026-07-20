import Link from "next/link";
import { Art } from "@/components/Art";
import { Census } from "@/components/Census";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { Info } from "@/components/Info";
import { Meter } from "@/components/Meter";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import { RegentCharges } from "@/components/RegentCharges";
import { ResearchView } from "@/components/ResearchView";
import { SettlementView } from "@/components/SettlementView";
import { StatTile } from "@/components/StatTile";
import { TaxSlider } from "@/components/TaxSlider";
import { VictoryTracker } from "@/components/VictoryTracker";
import { eventLine, eventTone } from "@/components/eventLine";
import { timeAgo } from "@/components/timeAgo";
import {
  ACTION_GUIDE,
  ACTION_INFO,
  HOUSING_PER_HEARTHSTEAD,
  RACES,
  RACE_NAMES,
  SIEGE_GEAR,
  SLOTS_PER_BUILDING_LEVEL,
  STAMINA,
  STORAGE_BUILDING,
  STORAGE_PER_LEVEL,
  SURRENDER_DAYS_PER_ERA,
  SURRENDER_TICKS_PER_ERA,
  TURNS_PER_DAY,
  WAR_FOUNDRY_LADDER,
} from "@/lib/constants";
import {
  bankedRes,
  civilians,
  foodUpkeepPerTurn,
  level,
  military,
  popPerDay,
  productionRates,
  rankingScore,
  settlementTitle,
  taxIncomePerTurn,
  totalPopulation,
  unbankedGold,
  unstored,
  vacantHousing,
  wallPenalty,
  type GameEvent,
  type Resource,
} from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const GEAR_KEYS = ["ropes", "ladders", "rams", "ballistae", "trebuchets"] as const;
const WEAPON_NAME: Record<(typeof GEAR_KEYS)[number], string> = Object.fromEntries(
  WAR_FOUNDRY_LADDER.filter((s) => s.gearKey).map((s) => [s.gearKey!, s.name]),
) as Record<(typeof GEAR_KEYS)[number], string>;
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
  const foodNet = rates.food - foodUpkeepPerTurn(p);
  const goldVaultCap = STORAGE_PER_LEVEL * level(p, "counting_house");
  const bankAllAmt = Math.min(p.gold, goldVaultCap - p.bankedGold);
  const nextFoundryStep = WAR_FOUNDRY_LADDER.find((s) => s.level === level(p, "war_foundry") + 1);
  const inbox = world.inbox[p.id] ?? [];
  const revengeOpen = p.recentAttackers.filter(
    (a) => world.meta.tickNumber - a.tick <= 108 && !p.revengeUsed.includes(a.playerId),
  );
  // Surrender allowance (spec/combat.md): 20 days per era, spent as it flies.
  const surrenderDaysLeft = Math.max(0, SURRENDER_DAYS_PER_ERA - (p.surrenderTicksUsed ?? 0) / TURNS_PER_DAY);
  const surrenderBudgetSpent = (p.surrenderTicksUsed ?? 0) >= SURRENDER_TICKS_PER_ERA;
  const flagUp = p.surrendered || p.surrenderQueued;

  return (
    <>
      <Flash err={err} ok={ok} />
      <RegentCharges player={p} />
      <VictoryTracker world={world} me={p} />
      <Panel title={`The ${settlementTitle(p)} of ${p.name} — ${RACE_NAMES[p.race]}`}>
        <div className="throne">
          <span className="throne-portrait">
            <Art path={`races/${p.race}`} size={230} title={RACE_NAMES[p.race]} />
            <span className="cap">{RACE_NAMES[p.race]}</span>
          </span>
          <div className="throne-body">
            <div className="stat-grid">
              <StatTile icon="🏆" label="Ranking score" value={fmt(rankingScore(p))} />
              <StatTile
                icon="👥"
                label="Population"
                value={fmt(totalPopulation(p))}
                sub={`${fmt(civilians(p))} civ · ${fmt(military(p))} at arms`}
              />
              <StatTile
                icon={p.surrendered ? "🏳" : p.surrenderQueued ? "⏳" : p.starving ? "☠" : revengeOpen.length ? "⚔️" : "🛡️"}
                label="Status"
                value={
                  p.surrendered
                    ? "Surrendered"
                    : p.surrenderQueued
                      ? "Surrender queued"
                      : p.starving
                        ? "Starving"
                        : revengeOpen.length
                          ? `${revengeOpen.length} revenge open`
                          : "At large"
                }
                tone={p.starving ? "bad" : flagUp || revengeOpen.length ? "warn" : "good"}
              />
            </div>
            <div className="stat-grid">
              <Meter
                icon="🔥"
                label="Stamina"
                value={p.army.stamina}
                max={STAMINA.MAX}
                display={`${p.army.stamina} / ${STAMINA.MAX}`}
              />
              <Meter
                icon="🎖️"
                label="Army XP"
                value={p.army.experience}
                max={100}
                display={`${p.army.experience} / 100`}
              />
            </div>
            <div className="throne-flag">
              <CmdForm name="surrender" path="/">
                <input type="hidden" name="flag" value={flagUp ? "" : "1"} />
                <button
                  className="btn"
                  style={{ background: "linear-gradient(#a8853f,#7c5426)", borderColor: "#4e3113" }}
                  disabled={!flagUp && surrenderBudgetSpent}
                >
                  {p.surrendered ? "Lift the white flag" : p.surrenderQueued ? "Cancel queued surrender" : "🏳 Surrender"}
                </button>
              </CmdForm>
              <span style={p.surrendered ? { color: "var(--warn)" } : undefined}>
                {p.surrendered
                  ? `Flag flying · ${surrenderDaysLeft.toFixed(1)} of ${SURRENDER_DAYS_PER_ERA} surrender-days left`
                  : p.surrenderQueued
                    ? "Queued — rises when revenge windows close"
                    : surrenderBudgetSpent
                      ? "No surrender-days left this era"
                      : `${surrenderDaysLeft.toFixed(1)} of ${SURRENDER_DAYS_PER_ERA} surrender-days left this era`}
              </span>
              <Info tip={ACTION_INFO.surrender} guide={ACTION_GUIDE.surrender} />
            </div>
          </div>
        </div>
      </Panel>

      <div className="panel-row">
        <Panel title="Growth — the realm's pulse">
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 3, display: "flex", gap: 5, alignItems: "center" }}>
              <span>The tax dial</span>
              <Info tip={ACTION_INFO.tax} guide={ACTION_GUIDE.tax} />
            </div>
            <CmdForm name="setTax" path="/">
              <TaxSlider taxRate={p.taxRate} civilians={civilians(p)} />
            </CmdForm>
          </div>
          <div className="stat-grid">
            <StatTile
              icon={<ResIcon kind="gold" size={22} />}
              label="Gold / turn"
              value={`+${fmt(taxIncomePerTurn(p))}`}
              sub={`≈ ${fmt(taxIncomePerTurn(p) * TURNS_PER_DAY)} / day`}
            />
            <StatTile
              icon="🍞"
              label="Food / turn"
              value={`${foodNet >= 0 ? "+" : "−"}${fmt(Math.abs(foodNet))}`}
              sub={`+${fmt(rates.food)} grown · −${fmt(foodUpkeepPerTurn(p))} eaten`}
              tone={foodNet < 0 ? "bad" : undefined}
            />
            {(["wood", "stone", "ore"] as const).map((key) => {
              const { label, icon } = RES_LABELS.find((r) => r.key === key)!;
              return (
                <StatTile
                  key={key}
                  icon={icon}
                  label={`${label} / turn`}
                  value={`+${fmt(rates[key])}`}
                  sub={`≈ ${fmt(rates[key] * TURNS_PER_DAY)} / day`}
                />
              );
            })}
            <StatTile
              icon="🧺"
              label="Settlers / day"
              value={p.starving ? "0" : `+${fmt(popPerDay(p))}`}
              sub={
                p.starving
                  ? "halted — the people starve"
                  : vacantHousing(p) === 0
                    ? "housing full — arrivals turned away"
                    : wallPenalty(p) < 1
                      ? "damaged walls scare settlers"
                      : `room for ${fmt(vacantHousing(p))} more`
              }
              tone={p.starving ? "bad" : vacantHousing(p) === 0 || wallPenalty(p) < 1 ? "warn" : "good"}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Meter
              icon="🏠"
              label="Housing"
              value={civilians(p)}
              max={level(p, "hearthstead") * HOUSING_PER_HEARTHSTEAD}
              display={`${fmt(civilians(p))} / ${fmt(level(p, "hearthstead") * HOUSING_PER_HEARTHSTEAD)} beds`}
              tone={vacantHousing(p) === 0 ? "warn" : "good"}
            />
          </div>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6, marginBottom: 0 }}>
            More civilian building levels bring settlers faster; raise <Link href="/buildings">Hearthsteads</Link> to house them.
          </p>
        </Panel>

        <Panel title="The Counting House — the realm's bank">
          <div style={{ marginBottom: 6 }}>
            <Meter
              icon={<ResIcon kind="gold" size={18} />}
              label="Gold vault"
              value={p.bankedGold}
              max={goldVaultCap}
              display={`${fmt(p.bankedGold)} / ${fmt(goldVaultCap)} banked`}
              tone="good"
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <CmdForm name="bank" path="/">
              <input name="amount" placeholder="gold ±" aria-label="Gold to bank (negative withdraws)" size={8} style={{ font: "14.5px Verdana", padding: 4 }} />
              <button className="btn">Bank</button>
            </CmdForm>
            <CmdForm name="bank" path="/">
              <input type="hidden" name="amount" value={bankAllAmt} />
              <button className="btn" disabled={bankAllAmt <= 0}>
                Bank all ({fmt(Math.max(0, bankAllAmt))})
              </button>
            </CmdForm>
            <CmdForm name="bank" path="/">
              <input type="hidden" name="amount" value={-p.bankedGold} />
              <button className="btn" disabled={p.bankedGold <= 0}>
                Withdraw all
              </button>
            </CmdForm>
            <Info tip={ACTION_INFO.bank} guide={ACTION_GUIDE.bank} />
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Holding</th>
                <th className="num">Loose</th>
                <th className="num">
                  <Info tip="Banked into the vault — safe from raiders while the store stands (a bombarded store spills its overflow).">
                    Vaulted
                  </Info>
                </th>
                <th className="num">
                  <Info tip="Everything loose plus any vault overflow. Raiders carry it off; spies torch it.">
                    Exposed
                  </Info>
                </th>
                {!p.premium && <th>Bank ±</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <ResIcon kind="gold" size={20} /> Gold
                  </span>
                </td>
                <td className="num">{fmt(p.gold)}</td>
                <td className="num" style={{ color: "var(--coin)" }}>
                  {fmt(p.bankedGold)} <span style={{ color: "var(--ink-soft)" }}>/ {fmt(goldVaultCap)}</span>
                </td>
                <td className="num" style={unbankedGold(p) > 0 ? { color: "var(--warn)" } : undefined}>
                  {fmt(unbankedGold(p))}
                </td>
                {!p.premium && (
                  <td style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>use the dials above</td>
                )}
              </tr>
              {RES_LABELS.map(({ key, label, icon }) => {
                const cap = STORAGE_PER_LEVEL * level(p, STORAGE_BUILDING[key]);
                const vaulted = bankedRes(p)[key];
                const exposed = unstored(p, key);
                return (
                  <tr key={key}>
                    <td>
                      {icon} {label}
                    </td>
                    <td className="num">{fmt(p.resources[key])}</td>
                    <td className="num">
                      {fmt(vaulted)} <span style={{ color: "var(--ink-soft)" }}>/ {fmt(cap)}</span>
                    </td>
                    <td className="num" style={exposed > 0 ? { color: "var(--warn)" } : undefined}>{fmt(exposed)}</td>
                    {!p.premium && (
                      <td>
                        <CmdForm name="bankRes" path="/">
                          <input type="hidden" name="what" value={key} />
                          <input
                            name="amount"
                            placeholder="±"
                            aria-label={`${label} to bank (negative withdraws)`}
                            size={5}
                            style={{ font: "13.5px Verdana", padding: 3 }}
                          />
                          <button className="btn" style={{ padding: "3px 8px", fontSize: 13 }}>
                            Bank
                          </button>
                        </CmdForm>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6, marginBottom: 0 }}>
            {p.premium ? (
              <>
                🪶 <b>The Steward vaults your goods automatically</b> each turn, up to capacity — a
                Royal Charter privilege.
              </>
            ) : (
              <>
                Vault goods to keep them from raiders (negative withdraws; the granary always feeds
                your people). Holders of the <Link href="/premium">Royal Charter</Link> have the
                Steward vault everything automatically.
              </>
            )}{" "}
            Raise <Link href="/buildings">storage buildings</Link> for deeper vaults.
          </p>
        </Panel>
      </div>

      <Panel title="Your Settlement — hall by hall">
        <SettlementView player={p} />
      </Panel>

      <Panel title="The People — your census">
        <Census player={p} />
      </Panel>

      <Panel title="The Collegium — your research">
        <ResearchView player={p} />
      </Panel>

      <div className="panel-row">
        <Panel title="The Siege Train — engines & crews">
          <div className="stat-grid">
            <StatTile
              icon={<Art path="units/engineer" size={26} title="Siege engineers" />}
              label="Engineer crews"
              value={fmt(p.army.siegeEngineers)}
              sub="hands to work the engines"
            />
            <StatTile
              icon={<Art path="buildings/war_foundry" size={26} title="War Foundry" />}
              label="War Foundry"
              value={`level ${level(p, "war_foundry")} / 10`}
              sub={
                nextFoundryStep
                  ? `next: ${nextFoundryStep.name}`
                  : "the full ladder is forged"
              }
            />
            {GEAR_KEYS.map((key) => (
              <StatTile
                key={key}
                icon={<Art path={`siege/${key}`} size={26} title={WEAPON_NAME[key]} />}
                label={WEAPON_NAME[key]}
                value={fmt(p.army.siegeGear[key])}
                sub={`crew of ${SIEGE_GEAR[key].crew} each`}
              />
            ))}
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8, marginBottom: 0 }}>
            {RACES[p.race].siege !== 1 && (
              <>
                {RACE_NAMES[p.race]} work engines at{" "}
                <b>×{RACES[p.race].siege.toFixed(2).replace(/0$/, "")}</b> force.{" "}
              </>
            )}
            <Link href="/siege">To the Siege Works →</Link>
          </p>
        </Panel>

        <Panel title="The Shadow Work — spies & scouts">
          <div className="stat-grid">
            <StatTile
              icon={<Art path="units/spy" size={26} title="Spies" />}
              label="Spies"
              value={fmt(p.army.spies)}
              sub={`${fmt(SLOTS_PER_BUILDING_LEVEL * level(p, "shadow_guild"))} slots in the Shadow Guild`}
            />
            <StatTile
              icon={<Art path="units/scout" size={26} title="Scouts" />}
              label="Scouts"
              value={fmt(p.army.scouts)}
              sub={`${fmt(SLOTS_PER_BUILDING_LEVEL * level(p, "rangers_lodge"))} slots in the Ranger's Lodge`}
            />
            <StatTile
              icon={<Art path="buildings/shadow_guild" size={26} title="Shadow Guild" />}
              label="Shadow Guild"
              value={`level ${level(p, "shadow_guild")}`}
              sub="steal ledgers, sabotage, torch stores"
            />
            <StatTile
              icon={<Art path="buildings/rangers_lodge" size={26} title="Ranger's Lodge" />}
              label="Ranger's Lodge"
              value={`level ${level(p, "rangers_lodge")}`}
              sub="recon rivals; catch their spies"
            />
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8, marginBottom: 0 }}>
            {RACES[p.race].spy !== 1 && (
              <>
                {RACE_NAMES[p.race]} run missions at <b>×{RACES[p.race].spy.toFixed(2).replace(/0$/, "")}</b>{" "}
                effect.{" "}
              </>
            )}
            Train them at the <Link href="/train">Levy</Link>; loose them from the{" "}
            <Link href="/rankings">Rankings</Link>.
          </p>
        </Panel>
      </div>

      <Panel title="Chronicle — latest tidings">
        {inbox.length === 0 ? (
          <p style={{ fontSize: 14.5, fontStyle: "italic" }}>The vellum is yet unmarked. History is unwritten.</p>
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
        <p style={{ fontSize: 13.5, marginTop: 6 }}>
          <Link href="/chronicle">→ the full Chronicle & battle ledger</Link>
        </p>
        {revengeOpen.length > 0 && (
          <p style={{ marginTop: 6, fontSize: 14.5 }}>
            <span style={{ color: "var(--warn)", fontWeight: 700 }}>⚔ Revenge windows open</span>{" "}
            against:{" "}
            {revengeOpen.map((r) => world.players[r.playerId]?.name ?? "?").join(", ")} —{" "}
            <Link href="/rankings">to the ladder</Link>.
          </p>
        )}
      </Panel>

      <Panel title="🖥 Rule from the terminal">
        <details>
          <summary style={{ cursor: "pointer", fontSize: 14.5 }}>
            Your realm token — plays this same empire from the CLI (click to reveal)
          </summary>
          <p style={{ margin: "6px 0 4px" }}>
            <code style={{ background: "var(--panel-alt)", padding: "2px 6px", fontSize: 14.5 }}>
              {p.apiToken}
            </code>
          </p>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
            Keep it secret — it IS your throne. In the repo:{" "}
            <code>node cli/woe.mjs link {"<token>"}</code>, then <code>node cli/woe.mjs</code> to
            play. Also re-enters this empire at the login gate from any browser.
          </p>
        </details>
      </Panel>
    </>
  );
}
