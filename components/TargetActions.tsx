import { Btn } from "./Btn";
import Link from "next/link";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Pills } from "@/components/Pills";
import { AllyStrikeDialog } from "@/components/AllyStrikeDialog";
import { ATTACK_MODE_INFO, SCOUT_OPS, SPY_OPS } from "@/lib/constants";
import {
  allModesBlocked,
  covertBlocked,
  defaultMode,
  modeBlocked,
  type TargetState,
} from "@/lib/constants/attackGating";

/**
 * The per-empire actions on the ladder — three native <details> popovers, so
 * no client JS. Attack, Scout and Spy each get their own, because they cost
 * different currencies, carry very different risk, and are almost never weighed
 * against one another: stacking them behind a single "Act" made you read all
 * three every time you wanted one of them.
 *
 * Each one opens a WRIT: a carved nameplate carrying the target's name, a wax
 * seal in the arm's own colour pressed into it, and the order beneath. The
 * three arms wear three plaques from the kit — blood red for the army, forest
 * green for the rangers, dark oak for the shadows — so which button you are
 * about to press is legible at a glance from a row forty deep in the ladder.
 * They used to be three identical red buttons opening three identical beige
 * boxes; the box was also the last piece of raw browser furniture left in a
 * game that is otherwise built out of one pixel-art kit.
 *
 * The full console (with the confirm step and your own strength) lives on the
 * empire's profile; this is the quick order from a list of forty rows. The
 * pipeline validates every strike — this just gathers it.
 */
export function TargetActions({
  target,
  revengeOpen,
  guild,
  lodge,
  state,
  last,
  hint,
  only,
  allyClanName,
  path = "/rankings",
}: {
  target: { id: string; name: string };
  /** Their clan's name, when it is allied with yours. Routes the strike through
   *  the treachery confirmation instead of the ordinary one. */
  allyClanName?: string;
  path?: string;
  revengeOpen: boolean;
  guild: number;
  lodge: number;
  /** Show a single arm. The ladder is reached three ways — "Attack", "Spy" and
   *  "Scout" in the sidebar — and arriving by one of them should not put the
   *  other two orders under your cursor forty times over. Unset shows all. */
  only?: "attack" | "scout" | "spy";
  /** Shield / vacation / revenge. Gated by the SAME rules as the profile's
   *  War Council (lib/constants/attackGating) so the two can never disagree. */
  state?: TargetState;
  /** Your last covert order per arm — a repeat is one click, not three. */
  last?: { scoutOp?: string; scoutAgents?: number; spyOp?: string; spyAgents?: number };
  hint?: string;
}) {
  const t: TargetState = state ?? { revengeOpen };
  const covertStop = covertBlocked(t);
  // Re-open on the last order, but only while it is still unlocked.
  const lastScout = SCOUT_OPS.find((o) => o.id === last?.scoutOp && lodge >= o.level)?.id ?? "";
  const lastSpy = SPY_OPS.find((o) => o.id === last?.spyOp && guild >= o.level)?.id ?? "";
  const marchStop = allModesBlocked(t);

  return (
    <div className="act-row-group">
      {/* THREE controls, not one menu with three sections. Marching, scouting
          and spying cost different currencies, carry different risk, and are
          almost never chosen against each other — stacking them behind one
          "Act" made you read all three every time you wanted one. */}
      {(!only || only === "attack") && (
      <details className="act act-army">
        <summary
          className={marchStop ? "act-btn is-off" : "act-btn"}
          title={marchStop ?? `March on ${target.name}`}
        >
          ⚔ Attack
        </summary>
        <div className="act-menu" role="menu">
          <Crown eyebrow="War order" name={target.name} />
          <div className="act-body">
            {/* WHY, in words. A blocked writ used to grey every control and
                keep its reason in a `title` attribute, so the page said "no"
                and refused to say why unless you hovered and waited. The
                strength hint stands down while a hard block is showing — one
                red line at a time. */}
            {marchStop ? (
              <p className="act-blocked">
                <span aria-hidden="true">🔒</span> {marchStop}
              </p>
            ) : (
              hint && (
                <p className="act-hint">
                  <span aria-hidden="true">⚠</span> {hint}
                </p>
              )
            )}

            <div className="act-section">
              <span className="act-head">Send the army</span>
              {t.allied && allyClanName ? (
                <AllyStrikeDialog target={target} allyClanName={allyClanName} state={t} path={path} />
              ) : (
                <CmdForm name="attack" path={path} inline={false}>
                  <input type="hidden" name="targetId" value={target.id} />
                  <Pills
                    name="mode"
                    ariaLabel={`Attack mode against ${target.name}`}
                    defaultValue={defaultMode(t)}
                    options={(["raid", "siege", "revenge", "bombard"] as const).map((m) => {
                      const why = modeBlocked(m, t);
                      return {
                        value: m,
                        label: m === "siege" ? "Castle" : m[0].toUpperCase() + m.slice(1),
                        title: why ?? ATTACK_MODE_INFO[m].tip,
                        disabled: Boolean(why),
                      };
                    })}
                  />
                  <ReqTip
                    down
                    heading={`Strike ${target.name}`}
                    body="March your army in the mode picked above — raid for loot, siege to wreck buildings, bombard to break walls from afar, or take a revenge blow. Costs 10 action turns."
                  >
                    <Btn
                      className={marchStop ? "btn btn-no act-go" : "btn act-go"}
                      disabled={Boolean(marchStop)}
                    >
                      Strike — 10 turns
                    </Btn>
                  </ReqTip>
                </CmdForm>
              )}
            </div>
          </div>

          <div className="act-foot">
            <Link className="act-exit" href={`/empire/${target.id}`}>
              Their profile — the full War Council
              <span className="act-exit-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        </div>
      </details>
      )}

      {/* Rangers. Open, safe, never intercepted — the whole intelligence
          service, and the only thing standing between your storehouses and
          someone else's knives. */}
      {(!only || only === "scout") && (
      <details className="act act-ranger">
        <summary className={covertStop ? "act-btn is-off" : "act-btn"} title={covertStop ?? `Scout ${target.name}`}>
          🏹 Scout
        </summary>
        <div className="act-menu" role="menu">
          <Crown eyebrow="Ranger order" name={target.name} />
          <div className="act-body">
            {covertStop && (
              <p className="act-blocked">
                <span aria-hidden="true">🔒</span> {covertStop}
              </p>
            )}
            <div className="act-section">
              <span className="act-head">Send the rangers</span>
              <p className="act-note">Open, safe — and they always come home.</p>
              <CmdForm name="covert" path={path} inline={false}>
                <input type="hidden" name="targetId" value={target.id} />
                <select name="op" aria-label={`Scout operation against ${target.name}`} className="act-select" defaultValue={lastScout}>
                  <option value="" disabled>
                    {lodge < 1 ? "No operations — build a Ranger's Lodge" : "Choose what to look for…"}
                  </option>
                  {SCOUT_OPS.map((op) => (
                    <option key={op.id} value={op.id} disabled={lodge < op.level}>
                      L{op.level} · {op.name}
                      {lodge < op.level ? " (locked)" : ""}
                    </option>
                  ))}
                </select>
                <div className="act-row">
                  <input
                    name="agents"
                    placeholder="Rangers"
                    aria-label="Rangers to send"
                    defaultValue={last?.scoutAgents ? String(last.scoutAgents) : ""}
                    size={6}
                    inputMode="numeric"
                    className="act-input"
                  />
                  <ReqTip
                    down
                    heading={`Scout ${target.name}`}
                    body="Rangers work in the open and always come home. Map the Siege Train is the one worth remembering: a rival's engines never appear on the ladder, so this is the only way to learn whether a bombardment is coming. Costs spy turns, not action turns."
                  >
                    <Btn className={covertStop ? "btn btn-no act-go" : "btn act-go"} disabled={Boolean(covertStop)}>
                      Send rangers
                    </Btn>
                  </ReqTip>
                </div>
              </CmdForm>
            </div>
          </div>
        </div>
      </details>
      )}

      {/* Shadows. They go over the wall: they do the damage, and being caught
          names you. Both arms spend from the same pool of spy turns, so
          watching a rival and robbing them compete for one purse. */}
      {(!only || only === "spy") && (
      <details className="act act-shadow">
        <summary className={covertStop ? "act-btn is-off" : "act-btn"} title={covertStop ?? `Send spies against ${target.name}`}>
          🗡 Spy
        </summary>
        <div className="act-menu" role="menu">
          <Crown eyebrow="Shadow order" name={target.name} />
          <div className="act-body">
            {covertStop && (
              <p className="act-blocked">
                <span aria-hidden="true">🔒</span> {covertStop}
              </p>
            )}
            <div className="act-section">
              <span className="act-head">Send the shadows</span>
              <p className="act-note">Over the wall. If one is taken, they learn your name.</p>
              <CmdForm name="covert" path={path} inline={false}>
                <input type="hidden" name="targetId" value={target.id} />
                <select name="op" aria-label={`Spy operation against ${target.name}`} className="act-select" defaultValue={lastSpy}>
                  <option value="" disabled>
                    {guild < 1 ? "No operations — build a Shadow Guild" : "Choose an operation…"}
                  </option>
                  {SPY_OPS.map((op) => (
                    <option key={op.id} value={op.id} disabled={guild < op.level}>
                      L{op.level} · {op.name}
                      {guild < op.level ? " (locked)" : ""}
                    </option>
                  ))}
                </select>
                <div className="act-row">
                  <input
                    name="agents"
                    placeholder="Spies"
                    aria-label="Spies to send"
                    defaultValue={last?.spyAgents ? String(last.spyAgents) : ""}
                    size={6}
                    inputMode="numeric"
                    className="act-input"
                  />
                  <ReqTip
                    down
                    heading={`Send spies against ${target.name}`}
                    body="Their rangers stand watch, and how many of yours get through is decided by weight of numbers on both sides — so send enough. Only the survivors do the damage. A clean run stays anonymous; if even one is taken, they learn who sent them and the revenge window opens. Cost in spy turns scales with how many you commit."
                  >
                    <Btn className={covertStop ? "btn btn-no act-go" : "btn act-go"} disabled={Boolean(covertStop)}>
                      Send spies
                    </Btn>
                  </ReqTip>
                </div>
              </CmdForm>
            </div>
          </div>

          <div className="act-foot">
            <Link className="act-exit" href={`/messages?with=${target.id}`}>
              Send them a letter instead
              <span className="act-exit-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        </div>
      </details>
      )}
    </div>
  );
}

/**
 * The head of the writ: a carved nameplate from the wood kit carrying who the
 * order is against, with a wax seal in the arm's colour pressed into its lower
 * edge. The seal is the one thing on this popover that exists purely to say
 * what it is — an order you send, not a form you fill in — so it is decoration
 * on purpose, aria-hidden, and nothing depends on it having rendered.
 */
function Crown({ eyebrow, name }: { eyebrow: string; name: string }) {
  return (
    <div className="act-crown">
      <span className="act-eyebrow">{eyebrow}</span>
      <span className="act-title">{name}</span>
      <span className="act-seal" aria-hidden="true" />
    </div>
  );
}
