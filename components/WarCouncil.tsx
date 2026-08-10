import Link from "next/link";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Btn } from "@/components/Btn";
import { ACTION_TURNS, ATTACK_MODE_INFO, SCOUT_OPS, SPY_OPS } from "@/lib/constants";
import {
  allModesBlocked,
  covertBlocked,
  defaultMode,
  modeBlocked,
  type TargetState,
} from "@/lib/constants/attackGating";

/** The card has room for a few words, not a sentence. */
const shortWhy = (why: string) =>
  /shield/i.test(why) ? "shielded" : /vacation/i.test(why) ? "on vacation" : "no open window";

/**
 * The war council — the three things you can DO to another empire, on the
 * empire's own page.
 *
 * This replaces the `<details>` popover the ladder used. A popover is right for
 * a row in a list of forty; it is wrong here, where you have arrived
 * deliberately to act on ONE empire and the console is the reason you came.
 * Everything is open, side by side, and nothing has to be clicked to be read.
 *
 * Still no client JS. Attack modes are radios wearing card labels, so the
 * choice is a big obvious target and the selected one lights up — CSS does the
 * whole job (`input:checked + .wc-mode`).
 */

const MODES: { id: "raid" | "siege" | "revenge" | "bombard"; icon: string; name: string; blurb: string }[] = [
  { id: "raid", icon: "🐎", name: "Raid", blurb: "Field battle. Takes goods." },
  { id: "siege", icon: "🏰", name: "Castle", blurb: "The full assault. Takes gold." },
  { id: "bombard", icon: "💥", name: "Bombard", blurb: "Engines only. Breaks walls." },
  { id: "revenge", icon: "🗡", name: "Revenge", blurb: "They may not yield." },
];

export function WarCouncil({
  target,
  revengeOpen,
  tradecraft,
  pathfinding,
  turns,
  spyTurns,
  yours,
  last,
  state,
}: {
  target: { id: string; name: string };
  revengeOpen: boolean;
  tradecraft: number;
  pathfinding: number;
  /** The viewer's purses, so the cost of an order is never a surprise. */
  turns: number;
  spyTurns: number;
  /** What YOU would be sending. The console showed the price of an order but
   *  never the stakes — you were deciding whether to attack an empire whose
   *  strength reads "Moderate" while unable to see your own at all. */
  yours: { regulars: number; footmen: number; archers: number; cavalry: number; stamina: number; experience: number };
  /** Your last covert order per arm, so a repeat is one click instead of three. */
  last?: { scoutOp?: string; scoutAgents?: number; spyOp?: string; spyAgents?: number };
  /** Shield / vacation / revenge — the same facts both consoles gate on. */
  state: TargetState;
}) {
  const path = `/empire/${target.id}`;
  const blocked = allModesBlocked(state);
  const covertStop = covertBlocked(state);
  const opening = defaultMode(state);
  const canMarch = turns >= ACTION_TURNS.ATTACK_COST && !blocked;
  const scoutsLocked = pathfinding < 1;
  const spiesLocked = tradecraft < 1;
  // Only re-open on a remembered op if it is still within your research —
  // levels can be stolen, and a preselected locked option submits nothing.
  const rememberedScout =
    SCOUT_OPS.find((o) => o.id === last?.scoutOp && pathfinding >= o.level)?.id ?? "";
  const rememberedSpy = SPY_OPS.find((o) => o.id === last?.spyOp && tradecraft >= o.level)?.id ?? "";

  return (
    <section className="wc" aria-label={`Act against ${target.name}`}>
      <header className="wc-head">
        <h3>⚔ The War Council</h3>
        <div className="wc-purses">
          <span className={turns < ACTION_TURNS.ATTACK_COST ? "wc-purse is-low" : "wc-purse"}>
            ⏳ {turns} action turns
          </span>
          <span className={spyTurns < 1 ? "wc-purse is-low" : "wc-purse"}>🗝 {spyTurns} spy turns</span>
          <span className={yours.stamina < 50 ? "wc-purse is-low" : "wc-purse"} title="Your army's stamina — a delivery gate, not a bonus">
            ⚡ {yours.stamina}% stamina
          </span>
        </div>
      </header>

      {blocked && (
        <p className="wc-blocked" role="status">
          {blocked}
        </p>
      )}

      <div className="wc-grid">
        {/* ── March ─────────────────────────────────────────────────────── */}
        <CmdForm name="attack" path={path} inline={false}>
          <div className="wc-card wc-march">
            <div className="wc-card-head">
              <span className="wc-card-title">March the army</span>
              <span className="wc-cost">{ACTION_TURNS.ATTACK_COST} turns</span>
            </div>
            <input type="hidden" name="targetId" value={target.id} />

            <div className="wc-modes">
              {MODES.map((m) => {
                // One rule for both consoles — see lib/constants/attackGating.
                const why = modeBlocked(m.id, state);
                const disabled = Boolean(why);
                const checked = m.id === opening;
                return (
                  <label
                    key={m.id}
                    className={`wc-mode-wrap${disabled ? " is-disabled" : ""}`}
                    title={why ?? ATTACK_MODE_INFO[m.id].tip}
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={m.id}
                      defaultChecked={checked}
                      disabled={disabled}
                      className="wc-radio"
                    />
                    <span className="wc-mode">
                      <span className="wc-mode-icon" aria-hidden="true">
                        {m.icon}
                      </span>
                      <b>{m.name}</b>
                      <small>{disabled ? shortWhy(why!) : m.blurb}</small>
                    </span>
                  </label>
                );
              })}
            </div>

            {/* TWO deliberate clicks. Marching is irreversible, costs
                {ACTION_TURNS.ATTACK_COST} turns, and the mode is one radio
                away from the wrong one — a single click was the most expensive
                misclick in the game. The review says what is actually being
                sent, which the console never showed before. */}
            {canMarch ? (
              <details className="wc-confirm">
                <summary className="btn wc-go">Strike…</summary>
                <div className="wc-review" role="group" aria-label="Confirm the order">
                  <p className="wc-review-line">
                    Sending <b>{yours.regulars.toLocaleString("en-US")}</b> regulars against{" "}
                    <b>{target.name}</b>.
                  </p>
                  <ul className="wc-review-list">
                    <li>
                      {yours.footmen.toLocaleString("en-US")} footmen ·{" "}
                      {yours.archers.toLocaleString("en-US")} archers ·{" "}
                      {yours.cavalry.toLocaleString("en-US")} cavalry
                    </li>
                    <li>
                      Stamina {yours.stamina}% · veterancy {Math.round(yours.experience)}
                    </li>
                    <li>
                      Costs {ACTION_TURNS.ATTACK_COST} of your {turns} action turns.
                    </li>
                  </ul>
                  <p className="wc-review-warn">
                    Losing regulars is the worst thing that can happen to you. There is no undo.
                  </p>
                  <Btn className="btn wc-commit">Confirm — send the army</Btn>
                </div>
              </details>
            ) : (
              <ReqTip
                heading={`Strike ${target.name}`}
                body="March in the mode chosen above. Raid for goods, castle for the treasury, bombard to break walls from afar, revenge to answer a blow."
                rows={[{ icon: <span className="costtip-ico">⏳</span>, label: "Action turns", need: ACTION_TURNS.ATTACK_COST, have: turns }]}
                disabledReason={blocked ?? "Not enough action turns."}
              >
                <Btn className="btn btn-no wc-go" disabled>
                  Strike
                </Btn>
              </ReqTip>
            )}
          </div>
        </CmdForm>

        {/* ── Rangers ───────────────────────────────────────────────────── */}
        <CmdForm name="covert" path={path} inline={false}>
          <div className="wc-card wc-scout">
            <div className="wc-card-head">
              <span className="wc-card-title">Send rangers</span>
              <span className="wc-cost">spy turns</span>
            </div>
            <p className="wc-lede">Open, safe, never intercepted. The only way to see a siege train coming.</p>
            <input type="hidden" name="targetId" value={target.id} />
            <select
              name="op"
              aria-label={`Scout operation against ${target.name}`}
              className="wc-select"
              defaultValue={rememberedScout}
              disabled={scoutsLocked}
            >
              <option value="" disabled>
                {scoutsLocked ? "Study Pathfinding first" : "What to look for…"}
              </option>
              {SCOUT_OPS.map((op) => (
                <option key={op.id} value={op.id} disabled={pathfinding < op.level}>
                  L{op.level} · {op.name}
                  {pathfinding < op.level ? " (locked)" : ""}
                </option>
              ))}
            </select>
            <div className="wc-send">
              <input
                name="agents"
                placeholder="# rangers"
                aria-label="Rangers to send"
                inputMode="numeric"
                className="wc-input"
                defaultValue={last?.scoutAgents ? String(last.scoutAgents) : ""}
                disabled={scoutsLocked}
              />
              <ReqTip
                heading={`Scout ${target.name}`}
                body="Rangers work in the open and always come home. Map the Siege Train is the one worth remembering: a rival's engines never appear on the ladder, so this is the only way to learn whether a bombardment is coming."
                disabledReason={covertStop ?? (scoutsLocked ? "Study Pathfinding first." : undefined)}
              >
                <Btn className={scoutsLocked || covertStop ? "btn btn-no" : "btn wc-ghost"} disabled={scoutsLocked || Boolean(covertStop)}>
                  Send
                </Btn>
              </ReqTip>
            </div>
          </div>
        </CmdForm>

        {/* ── Shadows ───────────────────────────────────────────────────── */}
        <CmdForm name="covert" path={path} inline={false}>
          <div className="wc-card wc-spy">
            <div className="wc-card-head">
              <span className="wc-card-title">Send shadows</span>
              <span className="wc-cost">spy turns</span>
            </div>
            <p className="wc-lede">
              Over the wall. Their rangers decide how many get through — send enough.
            </p>
            <input type="hidden" name="targetId" value={target.id} />
            <select
              name="op"
              aria-label={`Spy operation against ${target.name}`}
              className="wc-select"
              defaultValue={rememberedSpy}
              disabled={spiesLocked}
            >
              <option value="" disabled>
                {spiesLocked ? "Study Tradecraft first" : "Choose an operation…"}
              </option>
              {SPY_OPS.map((op) => (
                <option key={op.id} value={op.id} disabled={tradecraft < op.level}>
                  L{op.level} · {op.name}
                  {tradecraft < op.level ? " (locked)" : ""}
                </option>
              ))}
            </select>
            <div className="wc-send">
              <input
                name="agents"
                placeholder="# spies"
                aria-label="Spies to send"
                inputMode="numeric"
                className="wc-input"
                defaultValue={last?.spyAgents ? String(last.spyAgents) : ""}
                disabled={spiesLocked}
              />
              <ReqTip
                heading={`Send spies against ${target.name}`}
                body="Only the survivors do the damage. A clean run stays anonymous; if even one is taken, they learn who sent them and the revenge window opens."
                disabledReason={covertStop ?? (spiesLocked ? "Study Tradecraft first." : undefined)}
              >
                <Btn className={spiesLocked || covertStop ? "btn btn-no" : "btn"} disabled={spiesLocked || Boolean(covertStop)}>
                  Send
                </Btn>
              </ReqTip>
            </div>
          </div>
        </CmdForm>
      </div>

      <p className="wc-foot">
        <Link href={`/messages?with=${target.id}`}>✉ Send a letter instead</Link>
      </p>
    </section>
  );
}
