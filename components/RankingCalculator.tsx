"use client";

import { useMemo, useState } from "react";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { RACE_NAMES, SCORE, SIEGE_COUNTERS, WALL_NAMES, XP } from "@/lib/constants";
import { RESEARCH_FIELDS } from "@/lib/constants/research";
import type { Race } from "@/lib/constants/races";
import type { CounterType } from "@/lib/constants/buildings";
import {
  ARMY_WEIGHTS,
  buildSandboxPlayer,
  EMPTY_ARMY,
  randomArmy,
  rankingScore,
  type ArmyWeight,
  type SandboxArmy,
} from "@/lib/engine";

// Runs the REAL rankingScore. The breakdown is computed by zeroing one
// component at a time and re-scoring, so it can never drift from the function
// it claims to explain — no parallel copy of the formula lives here.

const RACES = Object.keys(RACE_NAMES) as Race[];
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
type Trio = [number, number, number];

function Num({
  value,
  onChange,
  label,
  width = 76,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  width?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      className="calc-num"
      style={{ width }}
      min={0}
      max={max}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
    />
  );
}

function ArmRow({ label, trio, onChange }: { label: string; trio: Trio; onChange: (t: Trio) => void }) {
  return (
    <tr>
      <td>{label}</td>
      {[0, 1, 2].map((i) => (
        <td key={i}>
          <Num
            label={`${label} ${i}`}
            value={trio[i]}
            onChange={(n) => {
              const next = [...trio] as Trio;
              next[i] = n;
              onChange(next);
            }}
          />
        </td>
      ))}
    </tr>
  );
}

export function RankingCalculator() {
  const [a, setA] = useState<SandboxArmy>({ ...EMPTY_ARMY, name: "Empire", peasants: 1000 });
  const set = (patch: Partial<SandboxArmy>) => setA({ ...a, ...patch });

  /**
   * A plausible empire at a chosen weight. The point of this calculator is to
   * compare — "what does a wall actually buy me", "how much is veterancy worth"
   * — and comparing needs something on the board to start from. Rolled with
   * walls and defensive works, since those are what the ladder counts.
   */
  const fill = (weight: ArmyWeight) => setA(randomArmy(weight, { defender: true, name: "Empire" }));

  const { total, parts, byRace } = useMemo(() => {
    const score = (x: SandboxArmy) => rankingScore(buildSandboxPlayer(x, "calc"));
    const full = score(a);

    // Each part = full score minus the score with that part removed. Derived
    // from the real function, so it cannot disagree with it.
    const without = (patch: Partial<SandboxArmy>) => full - score({ ...a, ...patch });
    const parts: {
      label: string;
      value: number;
      tip?: string;
      tipTitle?: string;
      bullets?: string[];
      guide?: string;
    }[] = [
      { label: "People (civilians + scouts)", value: without({ peasants: 0, scouts: 0 }) },
      {
        label: "Regulars",
        value: without({ footmen: [0, 0, 0], archers: [0, 0, 0], cavalry: [0, 0, 0] }),
      },
      {
        label: "Sellswords",
        value: without({ mercFootmen: [0, 0, 0], mercArchers: [0, 0, 0], mercCavalry: [0, 0, 0] }),
      },
      { label: "Engineers", value: without({ engineers: 0, mercEngineers: 0 }) },
      { label: "Defensive works (crewed)", value: without({ counters: {} }) },
      { label: "Walls", value: without({ wallLevel: 0 }) },
      {
        label: "Veterancy",
        value: without({ experience: 0 }),
        tipTitle: `Veterancy — your regulars' battle experience, 0–${XP.MAX}`,
        tip: "The one multiplier the ladder publishes. Race is folded silently into the rows above; this gets a row of its own because a rival can read it either way.",
        bullets: [
          `Worth ${SCORE.PER_XP_POINT} ranking points a point — ${(SCORE.PER_XP_POINT * XP.MAX).toLocaleString("en-US")} for a fully blooded army.`,
          `In the field: up to +100% damage at ${XP.MAX}, on attack AND defence.`,
          "Regulars only — sellswords fight at base however long the war has run.",
          "It dies with the veterans: lose a third of your line, lose a third of your veterancy.",
        ],
        guide: "/guide#regulars",
      },
      { label: "Research (ranked fields)", value: without({ research: {} }) },
    ];

    // The same empire under every banner, broken down to the THREE places race
    // actually reaches. Measured the same way as above — remove the component,
    // re-score, take the difference — so these columns cannot drift from the
    // real function either.
    const byRace = RACES.map((r) => {
      const at = (patch: Partial<SandboxArmy>) => score({ ...a, race: r, ...patch });
      const full = at({});
      return {
        race: r,
        troops: full - at({ footmen: [0, 0, 0], archers: [0, 0, 0], cavalry: [0, 0, 0] }),
        engines: full - at({ counters: {} }),
        walls: full - at({ wallLevel: 0 }),
        score: full,
      };
    });
    return { total: full, parts, byRace };
  }, [a]);

  const spread = Math.max(...byRace.map((r) => r.score)) - Math.min(...byRace.map((r) => r.score));

  return (
    <>
      <Panel
        title="📜 Ranking Calculator — what the ladder actually counts"
        info="Runs the REAL rankingScore. The breakdown is measured by removing one component at a time and re-scoring, so it can never drift from the function it explains."
        guide="/guide#clocks"
      >
        <div className="calc-fill">
          <span className="calc-fill-label">Fill an empire:</span>
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
            title="Any weight, rolled fresh"
          >
            🎲 Surprise me
          </button>
        </div>

        <div className="calc-score">
          <span className="calc-score-num">{fmt(total)}</span>
          <span className="calc-score-label">ranking points</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Component</th>
              <th className="num">Points</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.label}>
                <td>
                  {p.label}
                  {p.tip && (
                    <>
                      {" "}
                      <Info tip={p.tip} title={p.tipTitle} bullets={p.bullets} guide={p.guide} />
                    </>
                  )}
                </td>
                <td className="num">{fmt(p.value)}</td>
                <td className="num">{total > 0 ? `${Math.round((p.value / total) * 100)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="calc-hint">
          <b>Not counted at all:</b> offensive siege gear, spies, gold and resources, civilian
          buildings, the three shadow research fields.{" "}
          <Info tip="Your siege train is the most valuable thing a rival could learn about you, so the ladder never publishes it — that is what a scout is for." />
        </p>
      </Panel>

      <Panel
        title="Race on the ladder"
        info={
          "Race reaches exactly three things, and all three are ones a besieger can SEE from outside the gate: your regulars, your crewed defensive engines, and your walls. " +
          "It is folded in because race is public on every profile — a rival can already read it, so counting it reveals nothing while stopping the ladder from pretending a Dwarf shield wall and a Gnoll one are the same wall. " +
          "What race cannot reach: scouts and sellswords score flat, and veterancy and research are scored separately and never folded into unit power — so the ladder still never says how sharp your army is. " +
          "Rank tells a rival whether you are worth their turns; only a scout tells them how to attack you."
        }
      >
        <table className="tbl">
          <thead>
            <tr>
              <th>Race</th>
              <th className="num">
                Regulars <Info tip="Tier and headcount times the race's average of attack and defence, times its modifier for that arm. Sellswords are NOT here — hired blades score at base under every banner." />
              </th>
              <th className="num">
                Engines <Info tip="Crewed defensive works only, scaled by the race's siege quality. Your offensive siege train is never scored at all." />
              </th>
              <th className="num">
                Walls <Info tip="Quadratic in level, times integrity, times the race's fortification quality." />
              </th>
              <th className="num">Total</th>
              <th className="num">vs Human</th>
            </tr>
          </thead>
          <tbody>
            {byRace.map((r) => {
              const human = byRace.find((x) => x.race === "human")!.score;
              const d = r.score - human;
              const cell = (v: number) => (v === 0 ? <span style={{ color: "var(--ink-soft)" }}>—</span> : fmt(v));
              return (
                <tr key={r.race} style={r.race === a.race ? { fontWeight: 700 } : undefined}>
                  <td>{RACE_NAMES[r.race]}</td>
                  <td className="num">{cell(r.troops)}</td>
                  <td className="num">{cell(r.engines)}</td>
                  <td className="num">{cell(r.walls)}</td>
                  <td className="num">{fmt(r.score)}</td>
                  <td className="num" style={{ color: d > 0 ? "var(--pos)" : d < 0 ? "var(--neg)" : undefined }}>
                    {d === 0 ? "—" : `${d > 0 ? "+" : ""}${fmt(d)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="calc-hint">
          {spread === 0 ? (
            <>This army scores identically under every banner — it has nothing race modifies.</>
          ) : (
            <>
              <b>{fmt(spread)}</b>-point spread across the six races, from the same headcount.{" "}
              <Info tip="Not scored under any banner: scouts, spies, sellswords, offensive siege gear, gold, resources and civilian buildings." />
            </>
          )}
        </p>
      </Panel>

      <Panel title="The empire">
        <div className="calc-side-head">
          <select
            aria-label="Race"
            className="calc-select"
            value={a.race}
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
            </tr>
          </thead>
          <tbody>
            <ArmRow label="Footmen" trio={a.footmen} onChange={(t) => set({ footmen: t })} />
            <ArmRow label="Archers" trio={a.archers} onChange={(t) => set({ archers: t })} />
            <ArmRow label="Cavalry" trio={a.cavalry} onChange={(t) => set({ cavalry: t })} />
          </tbody>
          <thead>
            <tr>
              <th>
                Sellswords{" "}
                <Info tip={`Counted at ${Math.round(SCORE.MERC_POWER_FACTOR * 100)}% of a regular's power and at BASE — hired blades bring their arms and nothing else, so race never touches them.`} />
              </th>
              <th>Light</th>
              <th>Medium</th>
              <th>Heavy</th>
            </tr>
          </thead>
          <tbody>
            <ArmRow label="Merc footmen" trio={a.mercFootmen} onChange={(t) => set({ mercFootmen: t })} />
            <ArmRow label="Merc archers" trio={a.mercArchers} onChange={(t) => set({ mercArchers: t })} />
            <ArmRow label="Merc cavalry" trio={a.mercCavalry} onChange={(t) => set({ mercCavalry: t })} />
          </tbody>
        </table>

        <div className="calc-grid">
          <label>
            Peasants
            <Num label="Peasants" value={a.peasants} onChange={(n) => set({ peasants: n })} width={96} />
          </label>
          <label>
            Scouts{" "}
            <Info tip="Scouts count, at a discount — they stand in the open and everyone can see the rangers on your roads. Spies never appear." />
            <Num label="Scouts" value={a.scouts} onChange={(n) => set({ scouts: n })} />
          </label>
          <label>
            Spies{" "}
            <Info tip="Score exactly nothing. It would be a strange ladder that advertised how deep your spy service runs." />
            <Num label="Spies" value={a.spies} onChange={(n) => set({ spies: n })} />
          </label>
          <label>
            Engineers
            <Num label="Engineers" value={a.engineers} onChange={(n) => set({ engineers: n })} />
          </label>
          <label>
            Army XP{" "}
            <Info
              title={`Veterancy — 0–${XP.MAX}`}
              tip={`Worth ${SCORE.PER_XP_POINT} ranking points a point here, and up to +100% damage in the field. It dies with the veterans, so an army that wins cheaply keeps it and an army that wins by dying does not.`}
              guide="/guide#regulars"
            />
            <Num label="Experience" value={a.experience} onChange={(n) => set({ experience: n })} max={100} />
          </label>
          <label>
            Wall level
            <select
              aria-label="Wall level"
              className="calc-select"
              value={a.wallLevel}
              onChange={(e) => set({ wallLevel: Number(e.target.value) })}
            >
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "None" : `${i} — ${WALL_NAMES[i]}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <details className="calc-more" open>
          <summary>Defensive works — crewed engines only</summary>
          <div className="calc-grid">
            {(Object.keys(SIEGE_COUNTERS) as CounterType[]).map((t) => (
              <label key={t}>
                {SIEGE_COUNTERS[t].name}
                <Num
                  label={SIEGE_COUNTERS[t].name}
                  value={a.counters[t] ?? 0}
                  onChange={(n) => set({ counters: { ...a.counters, [t]: n } })}
                />
              </label>
            ))}
          </div>
          <p className="calc-hint">
            Only what your engineers can actually man is counted — forty uncrewed engines are
            lumber. Raise Engineers above to see the score follow.
          </p>
        </details>

        <details className="calc-more">
          <summary>Research</summary>
          <div className="calc-grid">
            {RESEARCH_FIELDS.map((f) => (
              <label key={f.id}>
                {f.id.replace(/_/g, " ")}
                {!f.ranked && <span style={{ color: "var(--ink-soft)" }}> (unranked)</span>}
                <Num
                  label={f.id}
                  value={a.research[f.id] ?? 0}
                  max={5}
                  onChange={(n) => set({ research: { ...a.research, [f.id]: Math.min(5, n) } })}
                />
              </label>
            ))}
          </div>
        </details>
      </Panel>
    </>
  );
}
