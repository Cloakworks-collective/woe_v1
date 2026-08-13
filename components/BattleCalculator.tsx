"use client";

import { useMemo, useState } from "react";
import { BattleReportPanel } from "@/components/BattleReportPanel";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { RACE_NAMES, SIEGE_COUNTERS, SIEGE_GEAR, WALL_NAMES, XP } from "@/lib/constants";
import { RESEARCH_FIELDS } from "@/lib/constants/research";
import type { Race } from "@/lib/constants/races";
import type { CounterType } from "@/lib/constants/buildings";
import {
  ARMY_WEIGHTS,
  buildSandboxPlayer,
  EMPTY_ARMY,
  randomArmy,
  resolveBattle,
  type ArmyWeight,
  type AttackMode,
  type BattleReport,
  type SandboxArmy,
  type SiegeGearType,
} from "@/lib/engine";

// A sandbox that runs the REAL engine. Every number below is fed straight into
// resolveBattle, and the result is rendered by the same BattleReportPanel the
// live game uses — so what you read here is what a real battle would say.
// Nothing is persisted and no world state is touched.

const RACES = Object.keys(RACE_NAMES) as Race[];
const MODES: { id: Exclude<AttackMode, "bombard">; label: string; hint: string }[] = [
  { id: "raid", label: "Raid", hint: "Field battle only — no walls, no engines, no engineers. Takes goods." },
  { id: "siege", label: "Castle attack", hint: "The full battle: counter duel, walls, then the assault. Takes gold." },
  { id: "revenge", label: "Revenge", hint: "Like a castle attack, but the defender may never yield. Carries nothing home." },
];

type Trio = [number, number, number];

function NumBox({
  value,
  onChange,
  width = 68,
  min = 0,
  max,
  step = 1,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  width?: number;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="calc-num"
      style={{ width }}
    />
  );
}

/** One arm, three tiers. */
function ArmRow({
  label,
  trio,
  onChange,
}: {
  label: string;
  trio: Trio;
  onChange: (t: Trio) => void;
}) {
  return (
    <tr>
      <td>{label}</td>
      {[0, 1, 2].map((i) => (
        <td key={i}>
          <NumBox
            label={`${label} ${["light", "medium", "heavy"][i]}`}
            value={trio[i]}
            onChange={(n) => {
              const next = [...trio] as Trio;
              next[i] = Math.max(0, n);
              onChange(next);
            }}
          />
        </td>
      ))}
      <td className="num calc-total">{trio[0] + trio[1] + trio[2]}</td>
    </tr>
  );
}

function ArmyForm({
  army,
  set,
  side,
}: {
  army: SandboxArmy;
  set: (patch: Partial<SandboxArmy>) => void;
  side: "attacker" | "defender";
}) {
  return (
    <div className="calc-side">
      <div className="calc-side-head">
        <input
          aria-label={`${side} name`}
          className="calc-name"
          value={army.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <select
          aria-label={`${side} race`}
          className="calc-select"
          value={army.race}
          onChange={(e) => set({ race: e.target.value as Race })}
        >
          {RACES.map((r) => (
            <option key={r} value={r}>
              {RACE_NAMES[r]}
            </option>
          ))}
        </select>
      </div>

      <table className="tbl calc-tbl">
        <thead>
          <tr>
            <th>Regulars</th>
            <th>Light</th>
            <th>Medium</th>
            <th>Heavy</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          <ArmRow label="Footmen" trio={army.footmen} onChange={(t) => set({ footmen: t })} />
          <ArmRow label="Archers" trio={army.archers} onChange={(t) => set({ archers: t })} />
          <ArmRow label="Cavalry" trio={army.cavalry} onChange={(t) => set({ cavalry: t })} />
        </tbody>
        <thead>
          <tr>
            <th>
              Sellswords{" "}
              <Info tip="Hired blades take the first 70% of damage aimed at their arm and earn no veterancy. They are paid off automatically when the regulars commanding them die." />
            </th>
            <th>Light</th>
            <th>Medium</th>
            <th>Heavy</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          <ArmRow label="Merc footmen" trio={army.mercFootmen} onChange={(t) => set({ mercFootmen: t })} />
          <ArmRow label="Merc archers" trio={army.mercArchers} onChange={(t) => set({ mercArchers: t })} />
          <ArmRow label="Merc cavalry" trio={army.mercCavalry} onChange={(t) => set({ mercCavalry: t })} />
        </tbody>
      </table>

      <div className="calc-grid">
        <label>
          Engineers{" "}
          <Info tip="They crew engines and they die; they never attack. Uncrewed engines are lumber, so this is the real cap on your siege train." />
          <NumBox label="Engineers" value={army.engineers} onChange={(n) => set({ engineers: n })} />
        </label>
        <label>
          Hired engineers
          <NumBox label="Merc engineers" value={army.mercEngineers} onChange={(n) => set({ mercEngineers: n })} />
        </label>
        <label>
          Stamina{" "}
          <Info tip="A DELIVERY gate, not a bonus: it multiplies the power you can actually bring. A spent army fights at a fraction of its strength however well researched it is." />
          <NumBox label="Stamina" value={army.stamina} onChange={(n) => set({ stamina: n })} max={100} />
        </label>
        <label>
          Army XP{" "}
          <Info
            title={`Veterancy — 0–${XP.MAX}`}
            tip="A straight damage bonus, for regulars only — sellswords always fight at base."
            bullets={[
              "Up to +100% damage at 100, on attack AND defence.",
              `Earned ${XP.PER_REGULAR_KILLED} a regular killed, ${XP.PER_CIVILIAN_DISPLACED} a civilian driven off, nothing for mercenaries.`,
              `A flat ${XP.DEFENDER_GAIN} just for being attacked, win or lose — capped at ${XP.MAX_PER_BATTLE} a battle.`,
              "It dies with the veterans: lose a third of your line, lose a third of your XP.",
            ]}
            guide="/guide#regulars"
          />
          <NumBox label="Experience" value={army.experience} onChange={(n) => set({ experience: n })} max={100} />
        </label>
        <label>
          Siege XP{" "}
          <Info tip="The engineers' own veterancy, tallied separately from the line army's — bombarding teaches a siege train nothing about holding a wall, and vice versa. It rises with bombardment on both sides of it." />
          <NumBox label="Siege experience" value={army.siegeExperience} onChange={(n) => set({ siegeExperience: n })} max={100} />
        </label>
        <label>
          Peasants{" "}
          <Info tip="Civilians. They never fight, but a won attack drives some of them off — and the ranking calculator counts them." />
          <NumBox label="Peasants" value={army.peasants} onChange={(n) => set({ peasants: n })} width={90} />
        </label>
      </div>

      <div className="calc-grid">
        <label>
          Wall level{" "}
          <Info tip="Only defenders benefit. The wall's EDGE is flat — level buys durability (health is quadratic in level), not a bigger bonus." />
          <select
            aria-label="Wall level"
            className="calc-select"
            value={army.wallLevel}
            onChange={(e) => set({ wallLevel: Number(e.target.value) })}
          >
            {Array.from({ length: 11 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? "None" : `${i} — ${WALL_NAMES[i]}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Wall integrity %
          <NumBox
            label="Wall integrity"
            value={Math.round(army.wallIntegrity * 100)}
            onChange={(n) => set({ wallIntegrity: Math.max(0, Math.min(100, n)) / 100 })}
            max={100}
          />
        </label>
        <label className="calc-check">
          <input
            type="checkbox"
            checked={army.sortie}
            onChange={(e) => set({ sortie: e.target.checked })}
          />
          Sortie{" "}
          <Info tip="Defender only. Cavalry gain nothing behind stone and everything in the open — so a cavalry-heavy defender wants this on and a footman-heavy one almost certainly does not." />
        </label>
      </div>

      <details className="calc-more">
        <summary>Siege engines</summary>
        <div className="calc-grid">
          {(Object.keys(SIEGE_GEAR) as SiegeGearType[]).map((t) => (
            <label key={t}>
              {t.replace(/_/g, " ")}
              <NumBox
                label={t}
                value={army.gear[t] ?? 0}
                onChange={(n) => set({ gear: { ...army.gear, [t]: Math.max(0, n) } })}
              />
            </label>
          ))}
        </div>
        <div className="calc-grid">
          {(Object.keys(SIEGE_COUNTERS) as CounterType[]).map((t) => (
            <label key={t}>
              {SIEGE_COUNTERS[t].name}
              <NumBox
                label={SIEGE_COUNTERS[t].name}
                value={army.counters[t] ?? 0}
                onChange={(n) => set({ counters: { ...army.counters, [t]: Math.max(0, n) } })}
              />
            </label>
          ))}
        </div>
      </details>

      <details className="calc-more">
        <summary>Research</summary>
        <div className="calc-grid">
          {RESEARCH_FIELDS.map((f) => (
            <label key={f.id}>
              {f.id.replace(/_/g, " ")}
              <NumBox
                label={f.id}
                value={army.research[f.id] ?? 0}
                max={5}
                onChange={(n) =>
                  set({ research: { ...army.research, [f.id]: Math.max(0, Math.min(5, n)) } })
                }
              />
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

export function BattleCalculator() {
  const [atk, setAtk] = useState<SandboxArmy>({ ...EMPTY_ARMY, name: "Attacker" });
  const [def, setDef] = useState<SandboxArmy>({ ...EMPTY_ARMY, name: "Defender" });
  const [mode, setMode] = useState<Exclude<AttackMode, "bombard">>("siege");
  const [war, setWar] = useState(false);
  const [seed, setSeed] = useState(1);
  const [runs, setRuns] = useState(1);
  const [report, setReport] = useState<BattleReport | null>(null);
  const [tally, setTally] = useState<{ wins: number; total: number } | null>(null);

  const modeHint = MODES.find((m) => m.id === mode)!.hint;

  // A seeded RNG, so a given seed always reproduces the same battle — the whole
  // point of a calculator is that you can change ONE number and see what it did.
  const makeRng = (s: number) => {
    let x = s >>> 0 || 1;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return ((x >>> 0) % 1_000_000) / 1_000_000;
    };
  };

  /**
   * Two plausible armies at a chosen weight, so you can be fighting in two
   * clicks instead of inventing forty numbers first. Both sides are rolled
   * independently but from the same band, and the defender gets walls and
   * counters while the attacker gets the train — otherwise every generated
   * matchup is a field battle and the siege half of the game never shows up.
   */
  const fill = (weight: ArmyWeight) => {
    setAtk(randomArmy(weight, { name: "Attacker" }));
    setDef(randomArmy(weight, { defender: true, name: "Defender" }));
    setReport(null);
    setTally(null);
  };

  const fight = () => {
    const n = Math.max(1, Math.min(500, runs));
    let wins = 0;
    let last: BattleReport | null = null;
    for (let i = 0; i < n; i++) {
      const a = buildSandboxPlayer(atk, "calc-attacker");
      const d = buildSandboxPlayer(def, "calc-defender");
      const out = resolveBattle(a, d, mode, {
        rng: makeRng(seed + i * 7919),
        warBonus: war,
        battleId: `calc-${seed}-${i}`,
        tick: 0,
      });
      if (out.report.victor === "attacker") wins++;
      last = out.report;
    }
    setReport(last);
    setTally({ wins, total: n });
  };

  const summary = useMemo(() => {
    const head = (a: SandboxArmy) =>
      a.footmen.concat(a.archers, a.cavalry).reduce((s, n) => s + n, 0) +
      a.mercFootmen.concat(a.mercArchers, a.mercCavalry).reduce((s, n) => s + n, 0);
    return { atk: head(atk), def: head(def) };
  }, [atk, def]);

  return (
    <>
      <Panel
        title="⚔️ Battle Calculator — a sandbox, not the world"
        info="Runs the REAL battle engine and renders the REAL battle report. Nothing here touches your empire, costs a turn, or is saved anywhere. Change one number, re-run, and read what it did."
        guide="/guide#battle"
      >
        <div className="calc-controls">
          <label>
            Mode
            <select
              aria-label="Attack mode"
              className="calc-select"
              value={mode}
              onChange={(e) => setMode(e.target.value as Exclude<AttackMode, "bombard">)}
            >
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="calc-check">
            <input type="checkbox" checked={war} onChange={(e) => setWar(e.target.checked)} />
            Clan war is hot{" "}
            <Info tip="Doubles battle damage both ways and takes 100% of everything unbanked. Only applies once the defender's Clan Beacon grace has run out." />
          </label>
          <label>
            Seed{" "}
            <Info tip="The same seed always fights the same battle. Change one number in an army and re-run on the same seed to see exactly what that number did." />
            <NumBox label="Seed" value={seed} onChange={setSeed} width={80} min={1} />
          </label>
          <label>
            Runs{" "}
            <Info tip="Fight it N times on consecutive seeds for a win rate. The report shown is the last run." />
            <NumBox label="Runs" value={runs} onChange={setRuns} width={70} min={1} max={500} />
          </label>
          <button type="button" className="btn calc-fight" onClick={fight}>
            <span aria-hidden="true">⚔</span> Fight
            {runs > 1 && <span className="calc-fight-runs">×{runs}</span>}
          </button>
        </div>

        <div className="calc-fill">
          <span className="calc-fill-label">Fill a scenario:</span>
          {ARMY_WEIGHTS.map((w) => (
            <button
              key={w.id}
              type="button"
              className="btn ghost calc-fill-btn"
              onClick={() => fill(w.id)}
              title={w.hint}
            >
              {w.label}
            </button>
          ))}
          <button
            type="button"
            className="btn ghost calc-fill-btn"
            onClick={() => fill(ARMY_WEIGHTS[Math.floor(Math.random() * ARMY_WEIGHTS.length)]!.id)}
            title="Any weight, both sides rolled fresh"
          >
            🎲 Surprise me
          </button>
        </div>
        <p className="calc-hint">{modeHint}</p>
        {tally && (
          <p className="calc-tally">
            <b>
              {tally.wins} / {tally.total}
            </b>{" "}
            attacker wins
            {tally.total > 1 && <> — {Math.round((tally.wins / tally.total) * 100)}%</>}
            {" · "}
            {summary.atk.toLocaleString()} attacking troops vs {summary.def.toLocaleString()} defending
          </p>
        )}
      </Panel>

      <div className="calc-sides">
        <Panel title="Attacker">
          <ArmyForm army={atk} set={(patch) => setAtk({ ...atk, ...patch })} side="attacker" />
        </Panel>
        <Panel title="Defender">
          <ArmyForm army={def} set={(patch) => setDef({ ...def, ...patch })} side="defender" />
        </Panel>
      </div>

      {report ? (
        <BattleReportPanel report={report} />
      ) : (
        <Panel title="Battle Report">
          <p style={{ fontStyle: "italic", color: "var(--ink-soft)", margin: 0 }}>
            Fill in both sides and press Fight. The report will render exactly as it does after a
            real battle — same phases, same casualties, same loot arithmetic.
          </p>
        </Panel>
      )}
    </>
  );
}
