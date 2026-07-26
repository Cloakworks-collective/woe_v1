import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { ResIcon, type ResKind } from "@/components/ResIcon";
import {
  COUNTER_TYPES,
  SIEGE_COUNTERS,
  SIEGE_GEAR,
  TRAINING_COSTS,
  TROOPS_PER_MUSTER_HALL,
  WAR_FOUNDRY_LADDER,
} from "@/lib/constants";
import type { CounterType } from "@/lib/constants/buildings";
import { crewCounters, crewGear, level, military, wonderDiscount } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const GEAR_ART: Record<string, string> = {
  ropes: "siege/ropes",
  ladders: "siege/ladders",
  rams: "siege/rams",
  ballistae: "siege/ballistae",
  trebuchets: "siege/trebuchets",
};

// The defensive engines, each with its art (keyed by counter type).
const COUNTER_ART: Record<CounterType, string> = {
  billhooks: "siege/bill_hooks",
  forkpoles: "siege/fork_poles",
  boiling_oil: "siege/boiling_oil",
  hoardings: "siege/hoardings",
  counter_engine: "siege/counter_engine",
};
// Display order lightest → heaviest (COUNTER_TYPES is heaviest-first for crewing).
const DEFENSE_ORDER = [...COUNTER_TYPES].reverse();

const WEAPON_NAME: Record<string, string> = Object.fromEntries(
  WAR_FOUNDRY_LADDER.filter((s) => s.gearKey).map((s) => [s.gearKey!, s.name]),
);

const ENGINE_TIP: Record<string, string> = {
  ropes: "Escalade tool: each crewed team lets 10 attackers bypass the wall bonus. Deals no damage. Countered by Bill-hooks.",
  ladders: "Mass escalade: each team lets 25 attackers ignore the wall. Countered by Fork Poles.",
  rams: "Batters the gate — 3% wall integrity per round. Countered by Boiling Oil.",
  ballistae: "Bolt fire: 40 anti-personnel damage per round, spread across the enemy. Countered by Hoardings.",
  trebuchets: "The wall-breaker: 60 troop damage + 5% wall per round — and the only engine that can bombard. Countered by the enemy's Counter-Engine.",
};

// N engineer sprites = how many crew a single engine.
function CrewCost({ crew }: { crew: number }) {
  return (
    <span className="crew-cost" title={`${crew} engineer${crew > 1 ? "s" : ""} crew one engine`}>
      {Array.from({ length: crew }, (_, i) => (
        <Art key={i} path="units/engineer" size={24} title="Siege Engineer" />
      ))}
      <span className="crew-cost-note">
        crew {crew > 1 ? "each" : "one"}
      </span>
    </span>
  );
}

// Owned vs actually-crewed gear, as a fill meter.
function Fielded({ owned, crewed }: { owned: number; crewed: number }) {
  const pct = owned > 0 ? Math.round((crewed / owned) * 100) : 0;
  const short = owned > 0 && crewed < owned;
  return (
    <div className="fielded">
      <div className="fielded-head">
        <span className="fielded-label">Fielded</span>
        <span className="fielded-num">
          {crewed} crewed{owned > 0 ? ` / ${owned} built` : " · none built"}
        </span>
      </div>
      <div className={`bar${short ? " warn" : ""}`}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function SiegePage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; tab?: string }>;
}) {
  const { err, ok, tab = "offense" } = await searchParams;
  const { world, player: p } = await getGame();
  const clan = p.clanId ? world.clans[p.clanId] : undefined;
  const discount = wonderDiscount(clan);
  const foundry = level(p, "war_foundry");
  const crewed = crewGear(p.army.siegeGear, p.army.siegeEngineers);
  // How many counters your engineers would man on defense (they crew counters
  // first). A display estimate — in a real defence, spares also fire your engines.
  const counterCrewed = crewCounters(p.army.siegeCounters, p.army.siegeEngineers);

  const defensive = tab === "defense";
  const path = defensive ? "/siege?tab=defense" : "/siege?tab=offense";

  const offense = WAR_FOUNDRY_LADDER.filter((s) => s.side === "offense");
  const defense = WAR_FOUNDRY_LADDER.filter((s) => s.side === "defense");

  // Engineers busy crewing gear vs idle; engines built vs actually manned.
  const gearKeys = Object.keys(SIEGE_GEAR) as (keyof typeof SIEGE_GEAR)[];
  const engineersBusy = gearKeys.reduce((s, t) => s + crewed[t] * SIEGE_GEAR[t].crew, 0);
  const engineersIdle = Math.max(0, p.army.siegeEngineers - engineersBusy);
  const enginesBuilt = gearKeys.reduce((s, t) => s + p.army.siegeGear[t], 0);
  const enginesManned = gearKeys.reduce((s, t) => s + crewed[t], 0);
  const enginesIdle = enginesBuilt - enginesManned;
  // Engineers to fully man every engine (extra needed beyond what we have).
  const crewNeeded = gearKeys.reduce((s, t) => s + p.army.siegeGear[t] * SIEGE_GEAR[t].crew, 0);
  const extraEngineersNeeded = Math.max(0, crewNeeded - p.army.siegeEngineers);

  const engCost = TRAINING_COSTS.siegeEngineer;
  const musterFree = level(p, "muster_hall") * TROOPS_PER_MUSTER_HALL - military(p);
  const canTrainEngineer =
    foundry >= 1 &&
    p.idlePeasants >= 1 &&
    musterFree >= 1 &&
    p.gold >= (engCost.gold ?? 0) &&
    p.resources.wood >= (engCost.wood ?? 0) &&
    p.resources.stone >= (engCost.stone ?? 0) &&
    p.resources.ore >= (engCost.ore ?? 0);
  const engineerBlockReason = !(foundry >= 1)
    ? "Found the War Foundry first"
    : p.idlePeasants < 1
      ? "No idle peasants to recruit"
      : musterFree < 1
        ? "No free Muster Hall bed"
        : "Not enough resources for one engineer";

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#battle">Siege engines, counters &amp; defence</LearnLink>
      <Panel title={`The Siege Works — War Foundry level ${foundry}/10`}>
        <p style={{ marginBottom: 10 }}>
          Five offensive weapons and five defensive counters climb the foundry ladder in pairs —
          only a level-10 foundry owns the complete kit. Both are equipment crewed by engineers:
          offensive engines when you attack, defensive engines when you defend (counters first, then
          spare crews fire your own engines back).
        </p>
        <div className="corps">
          <span className="corps-art">
            <Art path="units/engineer" size={104} title="Siege Engineer" />
          </span>
          <div className="corps-body">
            <div className="corps-stats">
              <div className="corps-stat">
                <span className="corps-stat-num">{p.army.siegeEngineers}</span>
                <span className="corps-stat-label">Engineers</span>
              </div>
              <div className="corps-stat busy">
                <span className="corps-stat-num">{engineersBusy}</span>
                <span className="corps-stat-label">Crewing gear</span>
              </div>
              <div className="corps-stat idle">
                <span className="corps-stat-num">{engineersIdle}</span>
                <span className="corps-stat-label">Idle</span>
              </div>
              <div className={`corps-stat${enginesIdle > 0 ? " short" : ""}`}>
                <span className="corps-stat-num">
                  {enginesManned}
                  <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}> / {enginesBuilt}</span>
                </span>
                <span className="corps-stat-label">Engines manned</span>
              </div>
            </div>

            {/* Have vs manned — the crux: an engine without a crew is firewood. */}
            {enginesIdle > 0 ? (
              <p className="siege-warn">
                ⚠ <b>{enginesIdle}</b> of your <b>{enginesBuilt}</b> engines stand <b>unmanned</b> —
                they cannot fire until crewed. Recruit <b>{extraEngineersNeeded}</b> more engineer
                {extraEngineersNeeded === 1 ? "" : "s"} to field the whole arsenal.
              </p>
            ) : enginesBuilt > 0 ? (
              <p style={{ fontSize: 13.5, color: "var(--green-dark)", margin: "0 0 8px" }}>
                ✓ All <b>{enginesBuilt}</b> engines are manned and ready to march.
              </p>
            ) : null}

            {/* Train engineers right here — the crews that activate the engines. */}
            <div className="siege-train">
              <CmdForm name="trainEngineers" path={path}>
                <span className="troop-form-label" style={{ marginRight: 6 }}>
                  Recruit engineers ({engCost.gold}
                  <ResIcon kind="gold" size={13} /> each)
                </span>
                <input
                  name="count"
                  placeholder="#"
                  aria-label="Engineers to train"
                  size={3}
                  style={{ font: "13.5px Verdana", padding: 3 }}
                  disabled={!canTrainEngineer}
                />
                <button
                  className={canTrainEngineer ? "btn" : "btn btn-no"}
                  disabled={!canTrainEngineer}
                  title={canTrainEngineer ? "Train siege engineers to crew your engines" : engineerBlockReason}
                >
                  🔧 Train
                </button>
              </CmdForm>
              <span className="siege-train-note">
                Engineers are also raised in <a href="/troops">The Army</a> alongside your troops.
              </span>
            </div>
          </div>
        </div>
      </Panel>

      <div className="tabs">
        <a href="/siege?tab=offense" className={defensive ? "" : "on"}>
          ⚔ The Arsenal — offensive engines
        </a>
        <a href="/siege?tab=defense" className={defensive ? "on" : ""}>
          🛡 The Ramparts — defensive counters
        </a>
      </div>

      {!defensive && (
        <Panel
          title="⚔ The Arsenal — offensive engines"
          info="Engineers crew the heaviest engines first; uncrewed gear cannot be fielded, and enemy spies can sabotage it."
          guide="/guide#army"
        >
          <div className="card-grid">
            {offense.map((step) => {
              const t = step.gearKey!;
              const g = SIEGE_GEAR[t];
              const unlocked = foundry >= step.level;
              const costs: [ResKind, number][] = [
                ["wood", g.wood],
                ["stone", g.stone],
                ["ore", g.ore],
                ["gold", g.gold],
              ];
              return (
                <div className={`bcard${unlocked ? "" : " locked"}`} key={t}>
                  <div className="bcard-head">
                    <div>
                      <Info tip={ENGINE_TIP[t]} title={step.name} guide="/guide#battle">
                        <span className="bcard-name">{step.name}</span>
                      </Info>
                      <div className="bcard-sub">
                        {unlocked ? (
                          <span className="siege-chip on">✓ Foundry {step.level}</span>
                        ) : (
                          <span className="siege-chip off">🔒 Needs Foundry {step.level}</span>
                        )}
                      </div>
                    </div>
                    <div className="bcard-btns">
                      <CmdForm name="buySiegeGear" path={path}>
                        <input type="hidden" name="type" value={t} />
                        <input name="count" placeholder="#" size={3} aria-label={`${step.name} to forge`} style={{ padding: 3 }} />
                        <button className="btn" disabled={!unlocked}>
                          Forge
                        </button>
                      </CmdForm>
                    </div>
                  </div>
                  <div className="bcard-main">
                    <span className="bcard-art">
                      <Art path={GEAR_ART[t]} size={104} title={step.name} />
                    </span>
                    <div className="bcard-body">
                      <CrewCost crew={g.crew} />
                      <Fielded owned={p.army.siegeGear[t]} crewed={crewed[t]} />
                      <ul className="bcard-costs" style={{ marginTop: 8 }}>
                        <li>
                          {costs
                            .filter(([, n]) => n > 0)
                            .map(([kind, n], i) => (
                              <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: i < costs.length - 1 ? 8 : 0 }}>
                                <ResIcon kind={kind} size={18} /> {n}
                              </span>
                            ))}
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {discount > 0 && (
            <p style={{ fontSize: 13.5, marginTop: 10 }}>
              <span style={{ marginRight: 4 }}>🛡</span> Clan Wonder discount: −{Math.round(discount * 100)}%
            </p>
          )}
        </Panel>
      )}

      {defensive && (
        <Panel
          title="🛡 The Ramparts — defensive engines"
          info="Defensive engines are bought and crewed just like offensive gear — but your engineers man them when you DEFEND (counters first, then spares fire your own engines back). Each crewed engine cancels one incoming enemy engine of its paired weapon; the surplus still fires, so field enough to blunt an assault."
          guide="/guide#defend"
        >
          <div className="card-grid">
            {DEFENSE_ORDER.map((ct) => {
              const c = SIEGE_COUNTERS[ct];
              const unlocked = foundry >= c.foundryLevel;
              const costs: [ResKind, number][] = [
                ["wood", c.wood],
                ["stone", c.stone],
                ["ore", c.ore],
                ["gold", c.gold],
              ];
              return (
                <div className={`bcard${unlocked ? "" : " locked"}`} key={ct}>
                  <div className="bcard-head">
                    <div>
                      <Info
                        tip={`Cancels one incoming ${WEAPON_NAME[c.counters]} per crewed engine when you defend. Crew of ${c.crew} engineers each.`}
                        title={c.name}
                        guide="/guide#defend"
                      >
                        <span className="bcard-name">{c.name}</span>
                      </Info>
                      <div className="bcard-sub">
                        {unlocked ? (
                          <span className="siege-chip on">✓ Foundry {c.foundryLevel}</span>
                        ) : (
                          <span className="siege-chip off">🔒 Needs Foundry {c.foundryLevel}</span>
                        )}
                      </div>
                    </div>
                    <div className="bcard-btns">
                      <CmdForm name="buySiegeCounter" path={path}>
                        <input type="hidden" name="type" value={ct} />
                        <input name="count" placeholder="#" size={3} aria-label={`${c.name} to forge`} style={{ padding: 3 }} />
                        <button className="btn" disabled={!unlocked}>
                          Forge
                        </button>
                      </CmdForm>
                    </div>
                  </div>
                  <p className="bcard-desc">
                    Cancels <b>{WEAPON_NAME[c.counters]}</b> — one enemy engine per crewed {c.name}, when you defend.
                  </p>
                  <div className="bcard-main">
                    <span className="bcard-art">
                      <Art path={COUNTER_ART[ct]} size={104} title={c.name} />
                    </span>
                    <div className="bcard-body">
                      <CrewCost crew={c.crew} />
                      <Fielded owned={p.army.siegeCounters[ct]} crewed={counterCrewed[ct]} />
                      <ul className="bcard-costs" style={{ marginTop: 8 }}>
                        <li>
                          {costs
                            .filter(([, n]) => n > 0)
                            .map(([kind, n], i) => (
                              <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: i < costs.length - 1 ? 8 : 0 }}>
                                <ResIcon kind={kind} size={18} /> {n}
                              </span>
                            ))}
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="siege-train-note" style={{ marginTop: 10 }}>
            On defence your engineers man the counters first (heaviest first), then any spare
            engineers fire your own engines back — so keep enough engineers to crew both.
          </p>
          {discount > 0 && (
            <p style={{ fontSize: 13.5, marginTop: 6 }}>
              <span style={{ marginRight: 4 }}>🛡</span> Clan Wonder discount: −{Math.round(discount * 100)}%
            </p>
          )}
        </Panel>
      )}
    </>
  );
}
