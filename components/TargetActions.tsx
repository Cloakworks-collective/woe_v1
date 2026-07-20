import Link from "next/link";
import { CmdForm } from "@/components/CmdForm";
import { Pills } from "@/components/Pills";
import { ATTACK_MODE_INFO, SPY_OPS } from "@/lib/constants";

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
  hint,
}: {
  target: { id: string; name: string };
  revengeOpen: boolean;
  tradecraft: number;
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
            <button className="btn act-go">Strike (10 turns)</button>
          </CmdForm>
        </div>

        <div className="act-section">
          <span className="act-head">Send the shadows</span>
          <CmdForm name="spy" path="/rankings" inline={false}>
            <input type="hidden" name="targetId" value={target.id} />
            <select name="op" aria-label={`Spy operation against ${target.name}`} className="act-select" defaultValue="">
              <option value="" disabled>
                {tradecraft < 1 ? "No operations — train Tradecraft" : "Choose an operation…"}
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
                name="spies"
                placeholder="# spies"
                aria-label="Spies to send"
                size={6}
                className="act-input"
              />
              <button className="btn">Send (5 turns)</button>
            </div>
          </CmdForm>
          <CmdForm name="scout" path="/rankings" inline={false}>
            <input type="hidden" name="targetId" value={target.id} />
            <button className="btn act-ghost">Scout — recon (safe)</button>
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
