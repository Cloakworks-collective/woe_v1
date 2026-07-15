// The Steward (spec/premium.md) — Royal Charter automation. Pure like the
// rest of the engine. Queues and standing orders are command automation:
// the Steward issues the same instant commands a player would, when they
// become possible. Nothing here adds timers or overflow buffers.

import { MAX_FIELD_LEVEL, RESEARCH_FIELDS, STEWARD_QUEUE_CAP as QUEUE_CAP, maxLevel } from "../constants";
import type { BuildingId } from "../constants/buildings";
import type { ResearchField } from "../constants/research";
import {
  build,
  equipTroops,
  setTax,
  trainScouts,
  trainSiegeEngineers,
  trainSpies,
  trainWarriors,
} from "./commands";
import {
  EngineError,
  level,
  researchLevel,
  type EngineResult,
  type GameEvent,
  type OrderAction,
  type OrderCondition,
  type Player,
  type StandingOrder,
  type Tier,
  type TroopType,
} from "./types";

const BUILDING_NAME = (id: BuildingId) => id.replace(/_/g, " ");

function requireCharter(p: Player): void {
  if (!p.premium) throw new EngineError("charter", "This requires the Royal Charter");
}

// ── Queue management commands ───────────────────────────────────────────────

export function queueBuild(input: Player, id: BuildingId): EngineResult {
  requireCharter(input);
  const p = structuredClone(input);
  const q = (p.buildQueue ??= []);
  if (q.length >= QUEUE_CAP) throw new EngineError("queue", `Build queue is full (${QUEUE_CAP})`);
  const queuedAhead = q.filter((b) => b === id).length;
  if (level(p, id) + queuedAhead >= maxLevel(id)) {
    throw new EngineError("max_level", "Already at (or queued to) max level");
  }
  q.push(id);
  return { player: p, events: [] };
}

export function dequeueBuild(input: Player, index: number): EngineResult {
  requireCharter(input);
  const p = structuredClone(input);
  const q = p.buildQueue ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= q.length) {
    throw new EngineError("index", "No such queue entry");
  }
  q.splice(index, 1);
  return { player: p, events: [] };
}

export function queueResearch(input: Player, field: ResearchField): EngineResult {
  requireCharter(input);
  if (!RESEARCH_FIELDS.some((f) => f.id === field)) {
    throw new EngineError("field", "Unknown research field");
  }
  const p = structuredClone(input);
  const q = (p.researchQueue ??= []);
  if (q.length >= QUEUE_CAP) throw new EngineError("queue", `Research queue is full (${QUEUE_CAP})`);
  const queuedAhead = q.filter((e) => e.field === field).length;
  const toLevel = researchLevel(p, field) + queuedAhead + 1;
  if (toLevel > MAX_FIELD_LEVEL) throw new EngineError("max_level", "Already at (or queued to) mastery");
  q.push({ field, toLevel });
  return { player: p, events: [] };
}

export function dequeueResearch(input: Player, index: number): EngineResult {
  requireCharter(input);
  const p = structuredClone(input);
  const q = p.researchQueue ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= q.length) {
    throw new EngineError("index", "No such queue entry");
  }
  q.splice(index, 1);
  return { player: p, events: [] };
}

export function addStandingOrder(
  input: Player,
  id: string,
  when: OrderCondition,
  then: OrderAction,
): EngineResult {
  requireCharter(input);
  const p = structuredClone(input);
  const orders = (p.standingOrders ??= []);
  if (orders.length >= QUEUE_CAP) {
    throw new EngineError("orders", `The Steward can hold ${QUEUE_CAP} standing orders`);
  }
  validateCondition(when);
  validateAction(then);
  orders.push({ id, when, then });
  return { player: p, events: [] };
}

export function removeStandingOrder(input: Player, id: string): EngineResult {
  requireCharter(input);
  const p = structuredClone(input);
  const orders = p.standingOrders ?? [];
  const i = orders.findIndex((o) => o.id === id);
  if (i < 0) throw new EngineError("order", "No such standing order");
  orders.splice(i, 1);
  return { player: p, events: [] };
}

function validateCondition(c: OrderCondition): void {
  const bad = (m: string) => new EngineError("condition", m);
  switch (c.kind) {
    case "building":
      if (!Number.isInteger(c.level) || c.level < 1) throw bad("Invalid building level");
      return;
    case "research":
      if (!RESEARCH_FIELDS.some((f) => f.id === c.field)) throw bad("Unknown research field");
      if (!Number.isInteger(c.level) || c.level < 1 || c.level > MAX_FIELD_LEVEL) throw bad("Invalid research level");
      return;
    case "gold":
      if (!Number.isFinite(c.amount) || c.amount <= 0) throw bad("Invalid gold amount");
      return;
    case "resource":
      if (!Number.isFinite(c.amount) || c.amount <= 0) throw bad("Invalid resource amount");
      return;
  }
}

function validateAction(a: OrderAction): void {
  const bad = (m: string) => new EngineError("action", m);
  switch (a.kind) {
    case "trainWarriors":
    case "trainSpies":
    case "trainScouts":
    case "trainEngineers":
    case "equip":
      if (!Number.isInteger(a.count) || a.count < 1) throw bad("Invalid count");
      a.remaining = a.count;
      return;
    case "build":
      return;
    case "setTax":
      if (!Number.isFinite(a.rate) || a.rate < 0 || a.rate > 1) throw bad("Invalid tax rate");
      return;
  }
}

// ── The Steward's tick ──────────────────────────────────────────────────────

export function conditionMet(p: Player, c: OrderCondition): boolean {
  switch (c.kind) {
    case "building":
      return level(p, c.building) >= c.level;
    case "research":
      return researchLevel(p, c.field) >= c.level;
    case "gold":
      return p.gold >= c.amount;
    case "resource":
      return p.resources[c.resource] >= c.amount;
  }
}

type CountedTrainer = (p: Player, n: number) => EngineResult;

const TRAINERS: Record<string, CountedTrainer> = {
  trainWarriors: (p, n) => trainWarriors(p, n),
  trainSpies: (p, n) => trainSpies(p, n),
  trainScouts: (p, n) => trainScouts(p, n),
  trainEngineers: (p, n) => trainSiegeEngineers(p, n),
};

/** Do as many as possible right now (halving search); returns done count. */
function trainPartial(
  p: Player,
  attempt: (pl: Player, n: number) => EngineResult,
  want: number,
): { player: Player; done: number } {
  let done = 0;
  let n = want;
  while (n >= 1) {
    try {
      const r = attempt(p, n);
      p = r.player;
      done += n;
      n = Math.min(n, want - done);
    } catch (e) {
      if (!(e instanceof EngineError)) throw e;
      n = Math.floor(n / 2);
    }
  }
  return { player: p, done };
}

/**
 * One Steward pass, run every tick for Charter holders:
 * 1. Build queue — raise the head entry while resources allow.
 * 2. Research queue — keep the scholars pointed at the head entry.
 * 3. Standing orders — when a condition holds, execute (count actions
 *    fulfill partially across ticks until done).
 */
export function processSteward(input: Player): EngineResult {
  if (!input.premium) return { player: input, events: [] };
  let p = structuredClone(input);
  const events: GameEvent[] = [];
  const say = (detail: string) => events.push({ type: "info", detail: `🪶 The Steward: ${detail}` });

  // 1. Build queue.
  const bq = (p.buildQueue ??= []);
  let guard = 0;
  while (bq.length > 0 && guard++ < QUEUE_CAP) {
    const id = bq[0];
    if (level(p, id) >= maxLevel(id)) {
      bq.shift(); // built by hand in the meantime — drop silently
      continue;
    }
    try {
      const r = build(p, id);
      p = r.player;
      p.buildQueue = bq;
      events.push(...r.events);
      say(`raised the ${BUILDING_NAME(id)} to level ${level(p, id)}.`);
      bq.shift();
    } catch (e) {
      if (!(e instanceof EngineError)) throw e;
      break; // can't afford the head yet — wait, keep order
    }
  }

  // 2. Research queue.
  const rq = (p.researchQueue ??= []);
  while (rq.length > 0 && researchLevel(p, rq[0].field) >= rq[0].toLevel) {
    say(`research goal reached: ${rq[0].field.replace(/_/g, " ")} level ${rq[0].toLevel}.`);
    rq.shift();
  }
  if (rq.length > 0 && p.research.activeField !== rq[0].field) {
    p.research.activeField = rq[0].field;
    say(`directed the scholars to ${rq[0].field.replace(/_/g, " ")}.`);
  }

  // 3. Standing orders.
  const orders = (p.standingOrders ??= []);
  const fulfilled: string[] = [];
  for (const order of orders) {
    if (!conditionMet(p, order.when)) continue;
    const a = order.then;
    if (a.kind === "build") {
      try {
        const r = build(p, a.building);
        p = r.player;
        events.push(...r.events);
        say(`standing order done — raised the ${BUILDING_NAME(a.building)}.`);
        fulfilled.push(order.id);
      } catch (e) {
        if (!(e instanceof EngineError)) throw e; // not affordable yet — retry next tick
      }
    } else if (a.kind === "setTax") {
      p = setTax(p, a.rate).player;
      say(`standing order done — tax set to ${Math.round(a.rate * 100)}%.`);
      fulfilled.push(order.id);
    } else if (a.kind === "equip") {
      const r = trainPartial(p, (pl, n) => equipTroops(pl, a.type as TroopType, a.tier as Tier, n), a.remaining);
      if (r.done > 0) {
        p = r.player;
        a.remaining -= r.done;
        say(`equipped ${r.done} ${a.tier} ${a.type}${a.remaining > 0 ? ` (${a.remaining} of ${a.count} still to arm)` : ` — order of ${a.count} complete`}.`);
        if (a.remaining <= 0) fulfilled.push(order.id);
      }
    } else {
      const r = trainPartial(p, TRAINERS[a.kind], a.remaining);
      if (r.done > 0) {
        p = r.player;
        a.remaining -= r.done;
        const what = a.kind.replace("train", "").toLowerCase();
        say(`trained ${r.done} ${what}${a.remaining > 0 ? ` (${a.remaining} of ${a.count} remain)` : ` — order of ${a.count} complete`}.`);
        if (a.remaining <= 0) fulfilled.push(order.id);
      }
    }
  }
  p.standingOrders = orders.filter((o) => !fulfilled.includes(o.id));

  return { player: p, events };
}
