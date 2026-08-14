import { Btn } from "@/components/Btn";
import { Art } from "@/components/Art";
import { CountInput } from "@/components/CountInput";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip, type Req } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { ResIcon, type ResKind } from "@/components/ResIcon";
import {
  COUNTER_TYPES,
  SIEGE_COUNTERS,
  SIEGE_DESTROYED_BELOW,
  SIEGE_GEAR,
  SIEGE_REPAIR_COST_FACTOR,
  SIEGE_SALVAGE_VALUE,
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
  siege_towers: "siege/siege_tower",
};

// The defensive engines, each with its art (keyed by counter type).
const COUNTER_ART: Record<CounterType, string> = {
  billhooks: "siege/bill_hooks",
  forkpoles: "siege/fork_poles",
  boiling_oil: "siege/boiling_oil",
  hoardings: "siege/hoardings",
  fire_pots: "siege/fire_pots",
  counter_engine: "siege/counter_engine",
};
// Display order lightest → heaviest (COUNTER_TYPES is heaviest-first for crewing).
const DEFENSE_ORDER = [...COUNTER_TYPES].reverse();

const WEAPON_NAME: Record<string, string> = Object.fromEntries(
  WAR_FOUNDRY_LADDER.filter((s) => s.gearKey).map((s) => [s.gearKey!, s.name]),
);

const ENGINE_TIP: Record<string, string> = {
  ropes: "Escalade: each crewed team puts 10 attackers onto a lesser wall (+30% instead of +50%). Deals no damage. Bill-hooks answer it.",
  ladders: "Escalade: each team carries 30 attackers over at +20%. Fork Poles answer it.",
  siege_towers: "Escalade at its best: 100 troops arrive in formation against a wall worth only +10%. Slow, dear, and made of timber — Fire Pots answer it.",
  rams: "THE wall-breaker. All of its power lands on masonry and none of it anywhere else. Needs 20 hands to push, who take no part in the assault until the gate gives — and Boiling Oil is poured on them where they stand.",
  ballistae: "Anti-personnel bolt fire, spread across the enemy line. Touches neither wall nor building. Hoardings answer it.",
  trebuchets: "The only engine that reaches walls, buildings AND other engines — but an inaccurate one: just 30% of its power finds masonry (60% with Siege Accuracy). The bombard engine. The Counter-Engine answers it, and shoots back.",
};

// N engineer sprites = how many crew a single engine.
function CrewCost({ crew, race }: { crew: number; race: string }) {
  return (
    <span className="crew-cost" title={`${crew} engineer${crew > 1 ? "s" : ""} crew one engine`}>
      {Array.from({ length: crew }, (_, i) => (
        <Art key={i} path="units/engineer" size={24} title="Siege Engineer" race={race} />
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

type Cost = { gold: number; wood: number; stone: number; ore: number };

/** How many of a priced thing the stores could pay for right now. */
function maxAffordable(cost: Cost, have: Cost): number {
  let m = Infinity;
  for (const k of ["gold", "wood", "stone", "ore"] as const) {
    if ((cost[k] ?? 0) > 0) m = Math.min(m, Math.floor(have[k] / cost[k]));
  }
  return Number.isFinite(m) ? m : 0;
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
  const have: Cost = { gold: p.gold, wood: p.resources.wood, stone: p.resources.stone, ore: p.resources.ore };
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
  // Engines you actually own, with how battered they are. Integrity is tracked
  // per TYPE, not per engine — a park of trebuchets wears down together.
  const ownedGear = gearKeys
    .filter((t) => p.army.siegeGear[t] > 0)
    .map((t) => ({
      key: t as string,
      name: WAR_FOUNDRY_LADDER.find((s) => s.gearKey === t)?.name ?? t,
      count: p.army.siegeGear[t],
      integrity: p.army.siegeGearIntegrity[t] ?? 1,
      spec: SIEGE_GEAR[t] as { gold: number; wood: number; ore: number },
    }));
  const ownedCounters = COUNTER_TYPES.filter((ct) => p.army.siegeCounters[ct] > 0).map((ct) => ({
    key: ct as string,
    name: SIEGE_COUNTERS[ct].name,
    count: p.army.siegeCounters[ct],
    integrity: p.army.siegeCounterIntegrity[ct] ?? 1,
    spec: SIEGE_COUNTERS[ct] as unknown as { gold: number; wood: number; ore: number },
  }));
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
    ? "Found the Engine Yard first"
    : p.idlePeasants < 1
      ? "No idle peasants to recruit"
      : musterFree < 1
        ? "No free Muster Hall bed"
        : "Not enough resources for one engineer";

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#battle">Siege engines, counters &amp; defence</LearnLink>
      <Panel title={`The Siege Works — Engine Yard level ${foundry}/10`}>
        <p style={{ marginBottom: 10 }}>
          Five offensive weapons and five defensive counters climb the foundry ladder in pairs —
          only a level-10 foundry owns the complete kit. Both are equipment crewed by engineers:
          offensive engines when you attack, defensive engines when you defend (counters first, then
          spare crews fire your own engines back).
        </p>
        <div className="corps">
          <span className="corps-art">
            <Art path="units/engineer" size={216} title="Siege Engineer" race={p.race} />
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
                <CountInput
                  ariaLabel="Engineers to train"
                  size={3}
                  disabled={!canTrainEngineer}
                  max={Math.min(p.idlePeasants, Math.max(0, musterFree), maxAffordable(engCost, have))}
                />
                <ReqTip
                  heading="Recruit Siege Engineers"
                  body="Raise idle peasants into the crews that man your engines — counters and engines both sit idle until crewed."
                  rows={[
                    { icon: <span className="costtip-ico">👥</span>, label: "Idle peasant", need: 1, have: p.idlePeasants },
                    { icon: <span className="costtip-ico">🛏</span>, label: "Muster Hall bed", need: 1, have: Math.max(0, musterFree) },
                    ...resReqs(engCost, have),
                  ]}
                  note="Per engineer — × the number you enter. Also needs the Engine Yard."
                  disabledReason={canTrainEngineer ? undefined : engineerBlockReason}
                >
                  <Btn
                    className={canTrainEngineer ? "btn" : "btn btn-no"}
                    disabled={!canTrainEngineer}
                  >
                    🔧 Train
                  </Btn>
                </ReqTip>
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
                          <span className="siege-chip on">✓ Yard {step.level}</span>
                        ) : (
                          <span className="siege-chip off">🔒 Needs Yard {step.level}</span>
                        )}
                      </div>
                    </div>
                    <div className="bcard-btns">
                      <CmdForm name="buySiegeGear" path={path}>
                        <input type="hidden" name="type" value={t} />
                        <CountInput ariaLabel={`${step.name} to forge`} size={3} max={maxAffordable(g, have)} />
                        <ReqTip
                          heading={`Forge ${step.name}`}
                          body={ENGINE_TIP[t]}
                          rows={resReqs(g, have)}
                          note={`Per engine — × the number you enter. Each needs ${g.crew} engineer${g.crew > 1 ? "s" : ""} to crew.`}
                          disabledReason={!unlocked ? `Needs Engine Yard level ${step.level} — raise it in Buildings → Military.` : undefined}
                        >
                          <Btn className="btn" disabled={!unlocked}>
                            Forge
                          </Btn>
                        </ReqTip>
                      </CmdForm>
                    </div>
                  </div>
                  <div className="bcard-main">
                    <span className="bcard-art">
                      <Art path={GEAR_ART[t]} size={216} title={step.name} />
                    </span>
                    <div className="bcard-body">
                      <CrewCost crew={g.crew} race={p.race} />
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
          guide="/guide#defense"
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
                        guide="/guide#defense"
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
                        <CountInput ariaLabel={`${c.name} to forge`} size={3} max={maxAffordable(c, have)} />
                        <ReqTip
                          heading={`Forge ${c.name}`}
                          body={`Cancels one incoming ${WEAPON_NAME[c.counters]} per crewed engine when you defend — the surplus still fires, so field enough to blunt an assault.`}
                          rows={resReqs(c, have)}
                          note={`Per engine — × the number you enter. Each needs ${c.crew} engineer${c.crew > 1 ? "s" : ""} to crew on defence.`}
                          disabledReason={!unlocked ? `Needs Engine Yard level ${c.foundryLevel} — raise it in Buildings → Military.` : undefined}
                        >
                          <Btn className="btn" disabled={!unlocked}>
                            Forge
                          </Btn>
                        </ReqTip>
                      </CmdForm>
                    </div>
                  </div>
                  <p className="bcard-desc">
                    Cancels <b>{WEAPON_NAME[c.counters]}</b> — one enemy engine per crewed {c.name}, when you defend.
                  </p>
                  <div className="bcard-main">
                    <span className="bcard-art">
                      <Art path={COUNTER_ART[ct]} size={216} title={c.name} />
                    </span>
                    <div className="bcard-body">
                      <CrewCost crew={c.crew} race={p.race} />
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

      {/* ── The engine yard ────────────────────────────────────────────────
          Engines are no longer bought once and forgotten. Counter fire wears
          them down, a worn engine throws weaker, and past the wreck line it is
          gone for good. Mending costs a third of building anew — which is why a
          long bombardment is a running expense, and why a ruler who is at the
          keyboard between volleys can hold out against one who is not. */}
      {(ownedGear.length > 0 || ownedCounters.length > 0) && (
        <Panel
          title="🔧 The Engine Yard — repair & salvage"
          info="Battered engines fire proportionally weaker, and below 20% health they are wreckage. Mending costs a third of building anew; breaking one up returns half."
          guide="/guide#battle"
        >
          <table className="tbl">
            <thead>
              <tr>
                <th>Engine</th>
                <th>Owned</th>
                <th>Condition</th>
                <th>Mend</th>
              </tr>
            </thead>
            <tbody>
              {[...ownedGear, ...ownedCounters].map((row) => {
                const worn = row.integrity < 1;
                const pct = Math.round(row.integrity * 100);
                const tone =
                  row.integrity >= 0.85 ? "on" : row.integrity >= SIEGE_DESTROYED_BELOW + 0.15 ? "" : "off";
                const mend = {
                  gold: Math.round(row.spec.gold * row.count * (1 - row.integrity) * SIEGE_REPAIR_COST_FACTOR),
                  wood: Math.round(row.spec.wood * row.count * (1 - row.integrity) * SIEGE_REPAIR_COST_FACTOR),
                  ore: Math.round(row.spec.ore * row.count * (1 - row.integrity) * SIEGE_REPAIR_COST_FACTOR),
                };
                return (
                  <tr key={row.key}>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                    <td>
                      <span className={`siege-chip ${tone}`}>{pct}%</span>
                      {worn && pct <= 35 && (
                        <span style={{ marginLeft: 6, fontSize: 12.5, opacity: 0.8 }}>
                          near the wreck line
                        </span>
                      )}
                    </td>
                    <td>
                      <CmdForm name="repairSiege" path={path}>
                        <input type="hidden" name="type" value={row.key} />
                        <ReqTip
                          heading={`Mend ${row.name}`}
                          body="Restores the whole type to full condition. Cost scales with the damage taken."
                          rows={[
                            { icon: "gold" as ResKind, label: "Gold", need: mend.gold, have: p.gold },
                            { icon: "wood" as ResKind, label: "Wood", need: mend.wood, have: p.resources.wood },
                            { icon: "ore" as ResKind, label: "Ore", need: mend.ore, have: p.resources.ore },
                          ]}
                          disabledReason={!worn ? "These are sound — nothing to mend." : undefined}
                        >
                          <Btn className="btn" disabled={!worn}>
                            Mend
                          </Btn>
                        </ReqTip>
                      </CmdForm>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "10px 0 0" }}>
            Need the gold more than the engines? The{" "}
            <a href="/blackmarket">Black Market</a> breaks them up for{" "}
            {Math.round(SIEGE_SALVAGE_VALUE * 100)}% of the build cost — mend them first, since a
            wreck salvages for less.
          </p>
        </Panel>
      )}

      {/* ── Standing orders ─────────────────────────────────────────────────
          Cavalry gain nothing from a parapet and everything from open ground,
          so this is a genuine choice of shape rather than a switch to leave on:
          a cavalry-heavy defender wants to ride out, a footman-heavy one almost
          certainly does not. */}
      <Panel
        title="🐎 Standing orders — the sortie"
        info="When besieged, do your riders hold the wall or charge the siege lines? Cavalry lead, and each brings three footmen behind. You keep the wall's protection either way — but the attacker's screen can hold you off before you reach their engines."
        guide="/guide#battle"
      >
        <p style={{ fontSize: 14, marginBottom: 8 }}>
          Your captains are ordered to{" "}
          <b>{p.army.sortieEnabled ? "ride out at the siege lines" : "hold the wall"}</b>.
        </p>
        <CmdForm name="setSortie" path={path}>
          <input type="hidden" name="enabled" value={p.army.sortieEnabled ? "false" : "true"} />
          <Btn className="btn">
            {p.army.sortieEnabled ? "Hold the wall instead" : "Order the sortie"}
          </Btn>
        </CmdForm>
      </Panel>
    </>
  );
}
