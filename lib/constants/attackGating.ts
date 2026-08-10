// Which attack modes may be launched at a given target, and why not.
//
// Shared by BOTH consoles — the ladder's popover and the profile's War Council
// — because two places that grey out buttons by their own reasoning is two
// places that will eventually disagree with each other and with the pipeline.
// The pipeline (validateAttack) remains the authority; this is the UI telling
// the truth about it in advance.

export type AttackMode = "raid" | "siege" | "revenge" | "bombard";

export interface TargetState {
  /** They are under the newcomer shield — nothing may touch them. */
  shielded?: boolean;
  /** They stepped away from the age. Only revenge reaches someone on vacation. */
  onVacation?: boolean;
  /** You hold an open revenge window against them. */
  revengeOpen?: boolean;
}

/** Why this mode cannot be launched right now, or null if it can. */
export function modeBlocked(mode: AttackMode, t: TargetState): string | null {
  if (t.shielded) return "Under the newcomer shield — nothing may touch them yet.";
  if (mode === "revenge") {
    return t.revengeOpen ? null : "No open revenge window against them.";
  }
  if (t.onVacation) return "They are on vacation — only revenge may touch them.";
  return null;
}

/** Why NO attack may be launched, or null if at least one may. */
export function allModesBlocked(t: TargetState): string | null {
  const modes: AttackMode[] = ["raid", "siege", "revenge", "bombard"];
  const reasons = modes.map((m) => modeBlocked(m, t));
  if (reasons.some((r) => r === null)) return null;
  if (t.shielded) return "🛡 Under the newcomer shield — no attacks or spying.";
  if (t.onVacation) return "🏖 On vacation — only revenge may touch them, and you hold no revenge window.";
  return reasons[0];
}

/** Covert work is barred by the shield, but vacation does not stop a scout. */
export function covertBlocked(t: TargetState): string | null {
  return t.shielded ? "🛡 Under the newcomer shield — no attacks or spying." : null;
}

/** The mode a console should open on: revenge when it is live, else raid. */
export function defaultMode(t: TargetState): AttackMode {
  if (!modeBlocked("revenge", t)) return "revenge";
  return modeBlocked("raid", t) ? "siege" : "raid";
}
