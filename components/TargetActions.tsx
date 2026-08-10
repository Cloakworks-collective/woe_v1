import { Btn } from "./Btn";
import Link from "next/link";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Pills } from "@/components/Pills";
import { ATTACK_MODE_INFO, SCOUT_OPS, SPY_OPS } from "@/lib/constants";

/**
 * The per-empire action console on the ladder — a native <details> popover so
 * it needs no client JS. Launch raid / siege / revenge / bombard, run a spy op
 * or a scout recon, or open a letter, all without leaving the Rankings page.
 * The pipeline validates every strike; this just gathers the order.
 */
export function TargetActions({
  target,
  revengeOpen,
  tradecraft,
  pathfinding,
  hint,
}: {
  target: { id: string; name: string };
  revengeOpen: boolean;
  tradecraft: number;
  pathfinding: number;
  hint?: string;
}) {
  return (
    <details className="act">
      <summary className="act-btn" title={`Act against ${target.name}`}>
        ⚔ Act
      </summary>
      <div className="act-menu" role="menu">
        <div className="act-title">{target.name}</div>
        {hint && <div className="act-hint">{hint}</div>}

        <div className="act-section">
          <span className="act-head">Send the army</span>
          <CmdForm name="attack" path="/rankings" inline={false}>
            <input type="hidden" name="targetId" value={target.id} />
            <Pills
              name="mode"
              ariaLabel={`Attack mode against ${target.name}`}
              defaultValue={revengeOpen ? "revenge" : "raid"}
              options={[
                { value: "raid", label: "Raid", title: ATTACK_MODE_INFO.raid.tip },
                { value: "siege", label: "Siege", title: ATTACK_MODE_INFO.siege.tip },
                { value: "revenge", label: "Revenge", title: ATTACK_MODE_INFO.revenge.tip },
                { value: "bombard", label: "Bombard", title: ATTACK_MODE_INFO.bombard.tip },
              ]}
            />
            <ReqTip
              heading={`Strike ${target.name}`}
              body="March your army in the mode picked above — raid for loot, siege to wreck buildings, bombard to break walls from afar, or take a revenge blow. Costs 10 action turns."
            >
              <Btn className="btn act-go">Strike (10 turns)</Btn>
            </ReqTip>
          </CmdForm>
        </div>

        {/* Two arms, one budget. Scouts go openly and are never intercepted —
            they are the whole intelligence service AND the only thing standing
            between your storehouses and someone else's knives. Spies go over
            the wall: they do the damage, and being caught names you. Both spend
            from the same pool of spy turns, so watching a rival and robbing
            them are competing claims on the same purse. */}
        <div className="act-section">
          <span className="act-head">Send the rangers — open, safe, never intercepted</span>
          <CmdForm name="covert" path="/rankings" inline={false}>
            <input type="hidden" name="targetId" value={target.id} />
            <select name="op" aria-label={`Scout operation against ${target.name}`} className="act-select" defaultValue="">
              <option value="" disabled>
                {pathfinding < 1 ? "No operations — study Pathfinding" : "Choose what to look for…"}
              </option>
              {SCOUT_OPS.map((op) => (
                <option key={op.id} value={op.id} disabled={pathfinding < op.level}>
                  L{op.level} · {op.name}
                  {pathfinding < op.level ? " (locked)" : ""}
                </option>
              ))}
            </select>
            <div className="act-row">
              <input
                name="agents"
                placeholder="# rangers"
                aria-label="Rangers to send"
                size={6}
                inputMode="numeric"
                className="act-input"
              />
              <ReqTip
                heading={`Scout ${target.name}`}
                body="Rangers work in the open and always come home. Map the Siege Train is the one worth remembering: a rival's engines never appear on the ladder, so this is the only way to learn whether a bombardment is coming. Costs spy turns, not action turns."
              >
                <Btn className="btn act-ghost">Send rangers</Btn>
              </ReqTip>
            </div>
          </CmdForm>
        </div>

        <div className="act-section">
          <span className="act-head">Send the shadows — over the wall</span>
          <CmdForm name="covert" path="/rankings" inline={false}>
            <input type="hidden" name="targetId" value={target.id} />
            <select name="op" aria-label={`Spy operation against ${target.name}`} className="act-select" defaultValue="">
              <option value="" disabled>
                {tradecraft < 1 ? "No operations — study Tradecraft" : "Choose an operation…"}
              </option>
              {SPY_OPS.map((op) => (
                <option key={op.id} value={op.id} disabled={tradecraft < op.level}>
                  L{op.level} · {op.name}
                  {tradecraft < op.level ? " (locked)" : ""}
                </option>
              ))}
            </select>
            <div className="act-row">
              <input
                name="agents"
                placeholder="# spies"
                aria-label="Spies to send"
                size={6}
                inputMode="numeric"
                className="act-input"
              />
              <ReqTip
                heading={`Send spies against ${target.name}`}
                body="Their rangers stand watch, and how many of yours get through is decided by weight of numbers on both sides — so send enough. Only the survivors do the damage. A clean run stays anonymous; if even one is taken, they learn who sent them and the revenge window opens. Cost in spy turns scales with how many you commit."
              >
                <Btn className="btn">Send spies</Btn>
              </ReqTip>
            </div>
          </CmdForm>
        </div>

        <div className="act-section">
          <Link className="btn act-ghost" href={`/forum?tab=dm&with=${target.id}`}>
            ✉ Send a letter
          </Link>
        </div>
      </div>
    </details>
  );
}
