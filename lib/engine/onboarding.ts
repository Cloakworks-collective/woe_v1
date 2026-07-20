// The Regent's First Charges — new-player onboarding. A proactive, ordered
// checklist of foundational moves, each satisfied by REAL player state (never
// a scripted flag that can desync), each granting a one-time gift on first
// completion. Rewards are server-authoritative and idempotent (claimed set),
// and dismissing the charges grants every remaining reward — an experienced
// regent who waves the tutorial away still receives the same bounty.

import { SLOTS_PER_BUILDING_LEVEL } from "../constants";
import { level, military, totalPopulation, type Player } from "./types";

export type Grant = Partial<Record<"gold" | "food" | "wood" | "stone" | "ore", number>>;

/** A charge field that may be a fixed value or computed from live state, so the
 *  counsel can name real numbers ("assign about 12 as farmers") and adapt the
 *  link to the player's current sub-step. */
type Dyn<T> = T | ((p: Player) => T);

export interface Charge {
  id: string;
  title: string;
  why: Dyn<string>;
  href: Dyn<string>;
  cta: Dyn<string>;
  reward: Grant;
  done: (p: Player) => boolean;
}

const workerCount = (p: Player) => Object.values(p.workers).reduce((a, b) => a + b, 0);

/** Join a list into readable prose: "A", "A and B", "A, B, and C". */
function prose(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const PRODUCERS: { id: "sawyers_mill" | "masons_quarry" | "deepvein_mine"; name: string }[] = [
  { id: "sawyers_mill", name: "Sawyer's Mill" },
  { id: "masons_quarry", name: "Mason's Quarry" },
  { id: "deepvein_mine", name: "Deepvein Mine" },
];

/** Suggested opening farmer levy — enough to fill the Grange's jobs, capped by
 *  the idle peasants on hand. */
function suggestFarmers(p: Player): number {
  const slots = SLOTS_PER_BUILDING_LEVEL * level(p, "grange");
  return Math.max(1, Math.min(p.idlePeasants, slots || SLOTS_PER_BUILDING_LEVEL));
}

/** The ordered charges. Each `done` is a pure predicate over live state; the
 *  why/href/cta may be computed so the counsel names real numbers and points to
 *  the exact next step. */
export const CHARGES: Charge[] = [
  {
    id: "grange",
    title: "Build the Grange",
    why: "Go to the Buildings hall and found the Grange (under Production). It opens 20 farmer jobs — and food is life.",
    href: "/buildings",
    cta: "To the Buildings hall →",
    reward: { gold: 500 },
    done: (p) => level(p, "grange") >= 1,
  },
  {
    id: "workers",
    title: "Assign farmers to the Grange",
    why: (p) =>
      p.idlePeasants > 0
        ? `Go to the Assignment Hall and put your ${p.idlePeasants} idle peasants to work — assign about ${suggestFarmers(p)} as farmers so food starts flowing.`
        : "Go to the Assignment Hall and assign farmers to the Grange so the harvest begins.",
    href: "/train",
    cta: "To the Assignment Hall →",
    reward: { food: 600 },
    done: (p) => workerCount(p) >= 1,
  },
  {
    id: "producers",
    title: "Build the wood, stone & ore producers",
    why: (p) => {
      const missing = PRODUCERS.filter((b) => level(p, b.id) < 1).map((b) => b.name);
      return missing.length
        ? `Back to the Buildings hall — found the ${prose(missing)}, then assign workers to each. Wood, stone, and ore build everything to come.`
        : "Assign workers to your Sawyer's Mill, Mason's Quarry, and Deepvein Mine.";
    },
    href: "/buildings",
    cta: "To the Buildings hall →",
    reward: { gold: 800, wood: 400, stone: 400, ore: 400 },
    done: (p) =>
      level(p, "sawyers_mill") >= 1 && level(p, "masons_quarry") >= 1 && level(p, "deepvein_mine") >= 1,
  },
  {
    id: "collegium",
    title: "Build the Collegium and study Crop Rotation",
    // Adaptive: name the exact page + action for whichever sub-step is next.
    why: (p) => {
      if (level(p, "collegium") < 1)
        return "Go to the Buildings hall and found the Collegium (under Knowledge & Trade) — a library for your scholars.";
      if (p.workers.researchers < 1)
        return "In the Assignment Hall, assign a few idle peasants as researchers to staff the Collegium.";
      if (!p.research.activeField)
        return "Go to the Collegium and begin a study — Crop Rotation is a strong first field; it quickens your farms.";
      return "Choose a field to study in the Collegium.";
    },
    href: (p) => (level(p, "collegium") < 1 ? "/buildings" : p.workers.researchers < 1 ? "/train" : "/research"),
    cta: (p) =>
      level(p, "collegium") < 1
        ? "To the Buildings hall →"
        : p.workers.researchers < 1
          ? "To the Assignment Hall →"
          : "To the Collegium →",
    reward: { gold: 1000 },
    done: (p) => level(p, "collegium") >= 1 && p.workers.researchers >= 1 && !!p.research.activeField,
  },
  {
    id: "grow",
    title: "Grow past the village",
    why: (p) =>
      `Keep assigning workers and raising Hearthsteads for housing — reach 200 souls to take root (you stand at ${totalPopulation(p)}).`,
    href: "/train",
    cta: "Assign & grow →",
    reward: { gold: 1000 },
    done: (p) => totalPopulation(p) >= 200,
  },
  {
    id: "muster",
    title: "Train your first warriors",
    why: (p) =>
      `Go to the Muster (on the Workers page) and train a few warriors beyond your ${military(p)} — unguarded peasants scatter at dawn.`,
    href: "/train",
    cta: "To the Muster →",
    reward: { gold: 800 },
    done: (p) => military(p) > 20,
  },
  {
    id: "walls",
    title: "Raise the Walls",
    why: "Open the Buildings hall's Military tab and found the Walls — even a Timber Palisade adds +10% to every defender and turns raiders away.",
    href: "/buildings?tab=military",
    cta: "To the war engines →",
    reward: { gold: 1200, stone: 500 },
    done: (p) => level(p, "walls") >= 1,
  },
];

export interface ChargeStatus {
  id: string;
  title: string;
  why: string;
  href: string;
  cta: string;
  reward: Grant;
  complete: boolean;
  claimed: boolean;
}

const resolve = <T,>(v: Dyn<T>, p: Player): T => (typeof v === "function" ? (v as (p: Player) => T)(p) : v);

export function chargeStatuses(p: Player): ChargeStatus[] {
  const claimed = new Set(p.onboarding?.claimed ?? []);
  return CHARGES.map((c) => ({
    id: c.id,
    title: c.title,
    why: resolve(c.why, p),
    href: resolve(c.href, p),
    cta: resolve(c.cta, p),
    reward: c.reward,
    complete: c.done(p),
    claimed: claimed.has(c.id),
  }));
}

/** Charges done so far (for the progress readout). */
export function chargesProgress(p: Player): { done: number; total: number } {
  return { done: CHARGES.filter((c) => c.done(p)).length, total: CHARGES.length };
}

/** Is the charges panel still worth showing? Hidden once dismissed or once
 *  every charge is complete (an experienced empire never sees it). */
export function isOnboardingActive(p: Player): boolean {
  if (p.onboarding?.dismissed) return false;
  return CHARGES.some((c) => !c.done(p));
}

function grant(p: Player, reward: Grant): void {
  p.gold += reward.gold ?? 0;
  for (const r of ["food", "wood", "stone", "ore"] as const) {
    if (reward[r]) p.resources[r] += reward[r]!;
  }
}

function ensureOnboarding(p: Player): NonNullable<Player["onboarding"]> {
  if (!p.onboarding) p.onboarding = { claimed: [] };
  if (!p.onboarding.claimed) p.onboarding.claimed = [];
  return p.onboarding;
}

/** Auto-claim: grant the reward for every completed-but-unclaimed charge.
 *  Idempotent — safe to run on every load. Returns the ids newly granted
 *  (for a chronicle nudge), or [] if nothing changed. */
export function applyOnboardingRewards(p: Player): string[] {
  const ob = p.onboarding;
  // Nothing to do for a pristine newcomer who has completed nothing yet.
  const claimed = new Set(ob?.claimed ?? []);
  const granted: string[] = [];
  for (const c of CHARGES) {
    if (!claimed.has(c.id) && c.done(p)) {
      grant(p, c.reward);
      granted.push(c.id);
    }
  }
  if (granted.length === 0) return [];
  const o = ensureOnboarding(p);
  o.claimed = [...claimed, ...granted];
  return granted;
}

/** Dismiss the charges — and pay out every remaining reward, so a regent who
 *  waves the tutorial away is never cheated of the bounty. Returns granted ids. */
export function dismissOnboarding(p: Player): string[] {
  const o = ensureOnboarding(p);
  const claimed = new Set(o.claimed);
  const granted: string[] = [];
  for (const c of CHARGES) {
    if (!claimed.has(c.id)) {
      grant(p, c.reward);
      granted.push(c.id);
    }
  }
  o.claimed = CHARGES.map((c) => c.id);
  o.dismissed = true;
  return granted;
}
