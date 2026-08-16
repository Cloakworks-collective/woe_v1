// Espionage constants — spies and scouts (spec/espionage.md).
// Every number lives in covertBalance.ts; this file is the visible surface and
// the place the op list is shaped for the UI.

export * from "./covertBalance";

import { COVERT_OPS, type CovertOpId } from "./covertBalance";

export interface CovertOpMeta {
  id: CovertOpId;
  arm: "spy" | "scout";
  name: string;
  desc: string;
  /** Research field and level that unlocks it — Tradecraft for spies,
   *  Pathfinding for scouts. */
  field: "tradecraft" | "pathfinding";
  level: number;
  turnsPerAgent: number;
  detection: number;
  /** SCOUT ops only — the base head-count before the target's size scales it.
   *  See SCOUT_MISSION for the arithmetic. */
  scouts?: number;
}

const ALL = Object.entries(COVERT_OPS).map(([id, o]) => ({ id, ...o })) as unknown as CovertOpMeta[];

/** Scouts: the whole intelligence arm, plus the only defence against spies.
 *  They work in the open and are never intercepted. */
export const SCOUT_OPS: CovertOpMeta[] = ALL.filter((o) => o.arm === "scout");

/** Spies: the whole destruction arm. They go over the wall, and being caught
 *  names you and opens the revenge window. */
export const SPY_OPS: CovertOpMeta[] = ALL.filter((o) => o.arm === "spy");

export const COVERT_OP_LIST: CovertOpMeta[] = ALL;

export function covertOp(id: string): CovertOpMeta | undefined {
  return ALL.find((o) => o.id === id);
}
