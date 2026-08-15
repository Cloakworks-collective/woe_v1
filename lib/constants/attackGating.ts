// Which attack modes may be launched at a given target, and why not.
//
// Shared by BOTH consoles — the ladder's popover and the profile's War Council
// — because two places that grey out buttons by their own reasoning is two
// places that will eventually disagree with each other and with the pipeline.
// The pipeline (validateAttack) remains the authority; this is the UI telling
// the truth about it in advance.

export type AttackMode = "raid" | "siege" | "revenge" | "bombard";

export interface TargetState {
  /** They are under a shield — the newcomer one, or the hour a ruler gets on
   *  coming home from a long vacation. Nothing may touch them either way. */
  shielded?: boolean;
  /** They stepped away from the age. Nothing reaches someone on vacation —
   *  no attack, no scout, no spy. Not even a revenge, which is why nobody may
   *  depart while owing one (the departure queues instead). */
  onVacation?: boolean;
  /** You hold an open revenge window against them. */
  revengeOpen?: boolean;
  /** They march under your own banner — no attack, no scout, no spy. */
  sameClan?: boolean;
  /** They are you. The ladder shows your own row, and it must not offer you
   *  orders against yourself. */
  isSelf?: boolean;
  /**
   * Their clan is ALLIED with yours.
   *
   * Deliberately NOT a blocker: the pact never stops a blow, it only makes one
   * treachery (see AllyStrikeDialog and the treachery path in doAttack). It
   * lives here so the console knows to route the order through the confirmation
   * that carries `breakAlliance=1`, which the pipeline demands.
   */
  allied?: boolean;
}

/** Why this mode cannot be launched right now, or null if it can. */
export function modeBlocked(mode: AttackMode, t: TargetState): string | null {
  if (t.isSelf) return "That is your own empire.";
  if (t.sameClan) return "They march under your own banner.";
  if (t.shielded) return "Under a shield — nothing may touch them yet.";
  // Vacation is checked BEFORE the revenge branch, because it stops revenge
  // too — `validateAttack` has always refused one against a departed ruler
  // ("their quarrel will have to keep"), and this helper exists precisely so
  // the console never offers a blow the pipeline will refuse. In practice the
  // pair barely arises: nobody may depart while owing a revenge, so the queue
  // is the real guard and this is the belt to its braces.
  if (t.onVacation) return "They are away from the world — nothing reaches them.";
  if (mode === "revenge") {
    return t.revengeOpen ? null : "No open revenge window against them.";
  }
  return null;
}

/** Why NO attack may be launched, or null if at least one may. */
export function allModesBlocked(t: TargetState): string | null {
  const modes: AttackMode[] = ["raid", "siege", "revenge", "bombard"];
  const reasons = modes.map((m) => modeBlocked(m, t));
  if (reasons.some((r) => r === null)) return null;
  if (t.isSelf) return "— your own seat —";
  if (t.sameClan) return "🤝 Your own banner — no attacks, scouting or spying.";
  if (t.shielded) return "🛡 Shielded — no attacks or spying.";
  if (t.onVacation) return "🏖 On vacation — no attacks, scouting or spying.";
  return reasons[0];
}

/** Covert work is barred by the shield AND by their vacation. Rangers and spies
 *  used to get through an absence; they no longer do — an empty town cannot
 *  catch anybody, so leaving the door open made vacation a free reading. */
export function covertBlocked(t: TargetState): string | null {
  if (t.isSelf) return "— your own seat —";
  if (t.sameClan) return "🤝 Your own banner — no attacks, scouting or spying.";
  if (t.shielded) return "🛡 Shielded — no attacks or spying.";
  if (t.onVacation) return "🏖 On vacation — no attacks, scouting or spying.";
  return null;
}

/** The mode a console should open on: revenge when it is live, else raid. */
export function defaultMode(t: TargetState): AttackMode {
  if (!modeBlocked("revenge", t)) return "revenge";
  return modeBlocked("raid", t) ? "siege" : "raid";
}
