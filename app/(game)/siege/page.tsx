import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { ResIcon, type ResKind } from "@/components/ResIcon";
import {
  COUNTER_REDUCTION,
  SIEGE_GEAR,
  TRAINING_COSTS,
  WAR_FOUNDRY_LADDER,
} from "@/lib/constants";
import { crewGear, level, wonderDiscount } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const GEAR_ART: Record<string, string> = {
  ropes: "siege/ropes",
  ladders: "siege/ladders",
  rams: "siege/rams",
  ballistae: "siege/ballistae",
  trebuchets: "siege/trebuchets",
};

// The defensive counters (War Foundry even levels), each with its new art
// and the weapon it blunts.
const COUNTER_ART: Record<string, string> = {
  ropes: "siege/bill_hooks",
  ladders: "siege/fork_poles",
  rams: "siege/boiling_oil",
  ballistae: "siege/hoardings",
  trebuchets: "siege/counter_engine",
};

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
  const cut = Math.round(COUNTER_REDUCTION * 100);

  const defensive = tab === "defense";
  const path = defensive ? "/siege?tab=defense" : "/siege?tab=offense";

  const offense = WAR_FOUNDRY_LADDER.filter((s) => s.side === "offense");
  const defense = WAR_FOUNDRY_LADDER.filter((s) => s.side === "defense");

  // Engineers busy crewing gear vs idle.
  const engineersBusy = (Object.keys(SIEGE_GEAR) as (keyof typeof SIEGE_GEAR)[]).reduce(
    (s, t) => s + crewed[t] * SIEGE_GEAR[t].crew,
    0,
  );
  const engineersIdle = Math.max(0, p.army.siegeEngineers - engineersBusy);

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#battle">Siege engines, counters &amp; defence</LearnLink>
      <Panel title={`The Siege Works — War Foundry level ${foundry}/10`}>
        <p style={{ marginBottom: 10 }}>
          Five offensive weapons and five defensive counters climb the foundry ladder in pairs —
          only a level-10 foundry owns the complete kit. Offensive gear is equipment crewed by
          engineers; the counters are permanent wall installations, always active when you defend.
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
            </div>
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>
              Engineers are recruited in <a href="/troops">The Army</a>, alongside your footmen,
              archers, and cavalry ({TRAINING_COSTS.siegeEngineer.gold}
              <ResIcon kind="gold" size={13} /> each). Here they take up the engines below.
            </p>
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
          title="🛡 The Ramparts — defensive counters"
          info={`Each counter is a permanent installation unlocked by its foundry level — no gear, no crews, always active when you defend. Each blunts its paired weapon by ${cut}%.`}
          guide="/guide#defend"
        >
          <div className="card-grid">
            {defense.map((step) => {
              const c = step.counters!;
              const installed = foundry >= step.level;
              return (
                <div className={`bcard${installed ? "" : " locked"}`} key={c}>
                  <div className="bcard-head">
                    <div>
                      <span className="bcard-name">{step.name}</span>
                      <div className="bcard-sub">
                        {installed ? (
                          <span className="siege-chip on">✓ Installed</span>
                        ) : (
                          <span className="siege-chip off">🔒 Needs Foundry {step.level}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="bcard-desc">
                    Cuts <b>{WEAPON_NAME[c]}</b> by {cut}% whenever you defend.
                  </p>
                  <div className="bcard-main">
                    <span className="bcard-art">
                      <Art path={COUNTER_ART[c]} size={104} title={step.name} />
                    </span>
                    <div className="bcard-body">
                      <p style={{ margin: 0, fontSize: 14 }}>
                        A permanent rampart installation — no engineers, no upkeep. It answers the{" "}
                        enemy&apos;s {WEAPON_NAME[c]} every time your walls are tested.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </>
  );
}
