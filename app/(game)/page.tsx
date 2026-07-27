import { Btn } from "@/components/Btn";
import Link from "next/link";
import { Art } from "@/components/Art";
import { Census } from "@/components/Census";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { HealthBar } from "@/components/HealthBar";
import { Info } from "@/components/Info";
import { LearnLink } from "@/components/LearnLink";
import { Meter } from "@/components/Meter";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import { RegentCharges } from "@/components/RegentCharges";
import { ResearchView } from "@/components/ResearchView";
import { SettlementView } from "@/components/SettlementView";
import { StatTile } from "@/components/StatTile";
import { TaxSlider } from "@/components/TaxSlider";
import { VictoryTracker } from "@/components/VictoryTracker";
import {
  ACTION_GUIDE,
  ACTION_INFO,
  CIVILIAN_BUILDINGS,
  HOUSING_PER_HEARTHSTEAD,
  MILITARY_BUILDINGS,
  RACES,
  RACE_NAMES,
  SIEGE_GEAR,
  GUILD_EFFECT_PER_LEVEL,
  catchableOpLevel,
  STAMINA,
  STORAGE_BUILDING,
  storageShelterAtLevel,
  SURRENDER_DAYS_PER_ERA,
  SURRENDER_TICKS_PER_ERA,
  TURNS_PER_DAY,
  WAR_FOUNDRY_LADDER,
} from "@/lib/constants";
import {
  bankedRes,
  buildingIntegrity,
  civilians,
  crewGear,
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
  // The Counting House & storehouses as one model. Every "Bank" is bank-all: it
  // stores the most the vault can take (min of loose stock and remaining room).
  // A bombarded store shelters less (capacity × integrity) and its overflow
  // spills back out into the open — raidable again — which we surface per row.
  type Holding = {
    key: "gold" | Resource;
    label: string;
    icon: React.ReactNode;
    loose: number;
    vaulted: number;
    fullCap: number; // capacity at full health
    integrity: number; // 0.5–1.0; <1 = bombarded
    protectedCap: number; // fullCap × integrity — what's actually sheltered
    spilled: number; // vaulted beyond the shelter — spilled back into the open
    exposed: number; // loose + spilled — what raiders/spies can take
    bankMax: number; // how much a Bank-all would move in (fills the shelter)
    full: boolean; // shelter is topped out
  };
  const makeHolding = (key: "gold" | Resource, label: string, icon: React.ReactNode): Holding => {
    const building = STORAGE_BUILDING[key];
    const loose = key === "gold" ? p.gold : p.resources[key];
    const vaulted = key === "gold" ? p.bankedGold : bankedRes(p)[key];
    const fullCap = storageShelterAtLevel(level(p, building));
    const integrity = buildingIntegrity(p, building);
    const protectedCap = Math.floor(fullCap * integrity);
    const spilled = Math.max(0, vaulted - protectedCap);
    const exposed = key === "gold" ? unbankedGold(p) : unstored(p, key);
    const bankMax = Math.max(0, Math.min(loose, protectedCap - vaulted));
    return {
      key,
      label,
      icon,
      loose,
      vaulted,
      fullCap,
      integrity,
      protectedCap,
      spilled,
      exposed,
      bankMax,
      full: vaulted >= protectedCap,
    };
  };
  const holdings: Holding[] = [
    makeHolding("gold", "Gold", <ResIcon kind="gold" size={20} />),
    ...RES_LABELS.map(({ key, label, icon }) => makeHolding(key, label, icon)),
  ];
  const nextFoundryStep = WAR_FOUNDRY_LADDER.find((s) => s.level === level(p, "war_foundry") + 1);
  // Siege: having an engine and having it MANNED are different — an uncrewed
  // engine can't fire. Compute what's actually fielded.
  const crewed = crewGear(p.army.siegeGear, p.army.siegeEngineers);
  const enginesBuilt = GEAR_KEYS.reduce((s, k) => s + p.army.siegeGear[k], 0);
  const enginesManned = GEAR_KEYS.reduce((s, k) => s + crewed[k], 0);
  const enginesUnmanned = enginesBuilt - enginesManned;
  const engineersBusy = GEAR_KEYS.reduce((s, k) => s + crewed[k] * SIEGE_GEAR[k].crew, 0);
  const engineersIdleCount = Math.max(0, p.army.siegeEngineers - engineersBusy);
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
      <LearnLink href="/guide#clocks">The crown race — ranking &amp; starting the clocks</LearnLink>
      <RegentCharges player={p} />
      <VictoryTracker world={world} me={p} />
      {(() => {
        // Anything cracked by bombardment, surfaced where the ruler actually looks.
        const NAME = new Map<string, string>([
          ...CIVILIAN_BUILDINGS.map((b) => [b.id, b.name] as [string, string]),
          ...MILITARY_BUILDINGS.map((b) => [b.id, b.name] as [string, string]),
          ["hearthstead", "Hearthstead"],
          ["walls", "The Walls"],
        ]);
        const damaged: { id: string; integrity: number }[] = [
          ...(p.wallIntegrity < 1 ? [{ id: "walls", integrity: p.wallIntegrity }] : []),
          ...Object.entries(p.buildingIntegrity ?? {})
            .filter(([, integ]) => (integ as number) < 1)
            .map(([id, integ]) => ({ id, integrity: integ as number })),
        ].sort((a, b) => a.integrity - b.integrity);
        if (damaged.length === 0) return null;
        return (
          <div className="damage-strip" role="status">
            <span className="damage-strip-icon" aria-hidden="true">🔨</span>
            <div className="damage-strip-body">
              <b>
                {damaged.length} structure{damaged.length === 1 ? "" : "s"} cracked by bombardment
              </b>{" "}
              — a wrecked store shelters less, a producer yields less, cracked walls slow recruitment.
              <span className="damage-strip-bars">
                {damaged.slice(0, 4).map((d) => (
                  <span key={d.id} className="damage-strip-item">
                    <HealthBar integrity={d.integrity} label={NAME.get(d.id) ?? d.id} />
                    <span>{NAME.get(d.id) ?? d.id}</span>
                  </span>
                ))}
                {damaged.length > 4 && <span className="damage-strip-item">+{damaged.length - 4} more</span>}
              </span>
            </div>
            <Link className="btn" href="/buildings">
              🔨 Repair
            </Link>
          </div>
        );
      })()}
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
                <Btn
                  className="btn"
                  style={{ background: "linear-gradient(#a8853f,#7c5426)", borderColor: "#4e3113" }}
                  disabled={!flagUp && surrenderBudgetSpent}
                >
                  {p.surrendered ? "Lift the white flag" : p.surrenderQueued ? "Cancel queued surrender" : "🏳 Surrender"}
                </Btn>
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
              value={
                p.starving
                  ? "0"
                  : vacantHousing(p) < popPerDay(p)
                    ? // arrivals = min(perDay, vacant beds) — the rest walk on, lost
                      `+${fmt(Math.min(popPerDay(p), vacantHousing(p)))} of ${fmt(popPerDay(p))}`
                    : `+${fmt(popPerDay(p))}`
              }
              sub={
                p.starving
                  ? "halted — the people starve"
                  : vacantHousing(p) === 0
                    ? "housing FULL — every arrival walks on, lost"
                    : vacantHousing(p) < popPerDay(p)
                      ? `only ${fmt(vacantHousing(p))} beds — the rest are lost`
                      : wallPenalty(p) < 1
                        ? "damaged walls scare settlers"
                        : `room for ${fmt(vacantHousing(p))} more`
              }
              tone={p.starving ? "bad" : vacantHousing(p) < popPerDay(p) || wallPenalty(p) < 1 ? "warn" : "good"}
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
          <table className="tbl">
            <thead>
              <tr>
                <th>Holding</th>
                <th className="num">Loose</th>
                <th className="num">
                  <Info tip="Sheltered in the vault — safe from raiders and spies while the store stands. A bombarded store shelters less (capacity × its integrity) and any overflow spills back into the open.">
                    Vaulted / shelter
                  </Info>
                </th>
                <th className="num">
                  <Info tip="Everything loose plus any spilled vault overflow. Raiders carry it off; spies torch it.">
                    Exposed
                  </Info>
                </th>
                {!p.premium && <th></th>}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const damaged = h.integrity < 1;
                return (
                  <tr key={h.key}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {h.icon} {h.label}
                      </span>
                    </td>
                    <td className="num">{fmt(h.loose)}</td>
                    <td className="num" style={h.key === "gold" ? { color: "var(--coin)" } : undefined}>
                      {fmt(h.vaulted)}{" "}
                      <span style={{ color: "var(--ink-soft)" }}>/ {fmt(h.protectedCap)}</span>
                      {h.full && h.protectedCap > 0 && !damaged && (
                        <span
                          title="This vault is full — no more can be sheltered."
                          style={{ marginLeft: 6, color: "var(--green)", fontWeight: 700, fontSize: 11.5 }}
                        >
                          FULL
                        </span>
                      )}
                      {damaged && (
                        <Link
                          href="/buildings"
                          className="store-dmg"
                          title={`Bombarded — the store is at ${Math.round(h.integrity * 100)}% integrity, so it shelters only ${fmt(h.protectedCap)} of its ${fmt(h.fullCap)} capacity. Click to repair on the Buildings page.`}
                        >
                          <span className="store-dmg-tag">🔥 repair</span>
                          <HealthBar integrity={h.integrity} label={`${h.label} store`} />
                        </Link>
                      )}
                    </td>
                    <td className="num" style={h.exposed > 0 ? { color: "var(--warn)" } : undefined}>
                      {fmt(h.exposed)}
                      {h.spilled > 0 && (
                        <span
                          title="Overflow spilled from the bombarded vault — back in the open and raidable until the store is repaired."
                          style={{ display: "block", fontSize: 11, color: "var(--red)" }}
                        >
                          incl. {fmt(h.spilled)} spilled
                        </span>
                      )}
                    </td>
                    {!p.premium && (
                      <td>
                        <CmdForm name={h.key === "gold" ? "bank" : "bankRes"} path="/">
                          {h.key !== "gold" && <input type="hidden" name="what" value={h.key} />}
                          <input type="hidden" name="amount" value={h.bankMax} />
                          <Btn
                            className="btn"
                            style={{ padding: "3px 10px", fontSize: 13 }}
                            disabled={h.bankMax <= 0}
                            title={
                              h.bankMax > 0
                                ? `Shelter ${fmt(h.bankMax)} ${h.label} in the vault`
                                : h.loose <= 0
                                  ? `No loose ${h.label} to store`
                                  : "The shelter is already full"
                            }
                          >
                            Store all
                          </Btn>
                        </CmdForm>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 8, marginBottom: 0 }}>
            {p.premium ? (
              <>
                🪶 <b>The Steward shelters your gold and goods automatically</b> each turn, up to
                capacity — a Royal Charter privilege.
              </>
            ) : (
              <>
                <b>Store all</b> shelters the most each vault can hold — safe from raiders and spies.
                The granary always feeds your people first. Holders of the{" "}
                <Link href="/premium">Royal Charter</Link> have the Steward shelter everything
                automatically. <Info tip={ACTION_INFO.bank} guide={ACTION_GUIDE.bank} />
              </>
            )}{" "}
            A bombarded store shelters less and spills its overflow — repair it on the{" "}
            <Link href="/buildings">Buildings</Link> page. Raise storage buildings for deeper vaults.
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
        <Panel title={`The Siege Train — ${enginesManned} of ${enginesBuilt} engines manned`}>
          <div className="stat-grid">
            <StatTile
              icon={<Art path="units/engineer" size={46} title="Siege engineers" />}
              label="Engineer crews"
              value={fmt(p.army.siegeEngineers)}
              sub={`${fmt(engineersBusy)} manning · ${fmt(engineersIdleCount)} idle`}
              tone={enginesUnmanned > 0 ? "warn" : undefined}
            />
            <StatTile
              icon={<Art path="buildings/war_foundry" size={46} title="War Foundry" />}
              label="War Foundry"
              value={`level ${level(p, "war_foundry")} / 10`}
              sub={nextFoundryStep ? `next: ${nextFoundryStep.name}` : "the full ladder is forged"}
            />
            {GEAR_KEYS.map((key) => {
              const built = p.army.siegeGear[key];
              const manned = crewed[key];
              return (
                <StatTile
                  key={key}
                  icon={<Art path={`siege/${key}`} size={46} title={WEAPON_NAME[key]} />}
                  label={WEAPON_NAME[key]}
                  value={
                    <>
                      {fmt(manned)}
                      <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}> / {fmt(built)}</span>
                    </>
                  }
                  sub={built === 0 ? `none built · crew ${SIEGE_GEAR[key].crew}` : `manned / built · crew ${SIEGE_GEAR[key].crew}`}
                  tone={built > 0 && manned < built ? "warn" : built > 0 ? "good" : undefined}
                />
              );
            })}
          </div>
          {enginesUnmanned > 0 ? (
            <p className="siege-warn" style={{ marginTop: 8 }}>
              ⚠ <b>{enginesUnmanned}</b> of your <b>{enginesBuilt}</b> engines stand <b>unmanned</b> —
              they can&apos;t fire without crews.{" "}
              <Link href="/siege">🔧 Train engineers at the Siege Works →</Link>
            </p>
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8, marginBottom: 0 }}>
              {RACES[p.race].siege !== 1 && (
                <>
                  {RACE_NAMES[p.race]} work engines at{" "}
                  <b>×{RACES[p.race].siege.toFixed(2).replace(/0$/, "")}</b> force.{" "}
                </>
              )}
              <Link href="/siege">To the Siege Works →</Link>
            </p>
          )}
        </Panel>

        <Panel title="The Shadow Work — spies & scouts">
          <div className="stat-grid">
            <StatTile
              icon={<Art path="units/spy" size={46} title="Spies" />}
              label="Spies"
              value={fmt(p.army.spies)}
              sub={`unlimited — Guild L${level(p, "shadow_guild")} missions +${Math.round(level(p, "shadow_guild") * GUILD_EFFECT_PER_LEVEL * 100)}%`}
            />
            <StatTile
              icon={<Art path="units/scout" size={46} title="Scouts" />}
              label="Scouts"
              value={fmt(p.army.scouts)}
              sub={`unlimited — Lodge L${level(p, "rangers_lodge")} catches ops to L${catchableOpLevel(level(p, "rangers_lodge")) || 0}`}
            />
            <StatTile
              icon={<Art path="buildings/shadow_guild" size={46} title="Shadow Guild" />}
              label="Shadow Guild"
              value={`level ${level(p, "shadow_guild")}`}
              sub="steal ledgers, sabotage, torch stores"
            />
            <StatTile
              icon={<Art path="buildings/rangers_lodge" size={46} title="Ranger's Lodge" />}
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

      {revengeOpen.length > 0 && (
        <Panel title="⚔ Revenge windows open">
          <p style={{ margin: 0, fontSize: 14.5 }}>
            You may strike back at:{" "}
            {revengeOpen.map((r) => world.players[r.playerId]?.name ?? "?").join(", ")} —{" "}
            <Link href="/rankings">to the ladder</Link>.
          </p>
        </Panel>
      )}

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
