// ═══════════════════════════════════════════════════════════════════════════
// THE COVERT BALANCE FILE — spies, scouts, and the shadow war.
//
// THE MODEL
// ────────────────────────────────────────────────────────────────────────────
// Espionage is not a separate system. It runs the SAME strength model as
// combat — Power, Health, an additive bonus pool, multiplicative delivery:
//
//     spyPower   = spies  × basePower × (1 + Σ bonuses) × delivery
//     scoutPower = scouts × basePower × (1 + Σ bonuses) × delivery
//     intercepted = f(scoutPower vs spyPower)
//     survivors  = sent − intercepted        ← survivors do the damage
//
// TWO ARMS, ONE BUDGET
//   · SCOUTS are the whole intelligence arm, plus the ONLY defence against
//     spies. They work in the open, are never intercepted, and never hunt —
//     they simply stand between an incoming spy and your storehouses.
//   · SPIES are the whole destruction arm. They go over the wall. They can be
//     caught, and being caught names you.
//
// Both draw from ONE pool of spy turns, so every turn spent scouting is a turn
// not spent sabotaging. And sizing a spy raid means knowing how many scouts
// stand against it — which costs a scout mission first. The two arms feed and
// starve each other.
//
// THE LOOP: spies Incite Unrest → a standing watch cuts it short, or turns it
// back entirely. Spies Assassinate Scouts → which strips the very watch that
// was doing the cutting. Neither arm is optional.
// ═══════════════════════════════════════════════════════════════════════════

import type { Band } from "./battleBalance";

// ─── 1 · THE SPY TURN ECONOMY ───────────────────────────────────────────────
// A second, scarcer clock. Twice as hard to come by as action turns and capped
// far lower, so a covert campaign is something you plan rather than spam.

/**
 * How long a filed covert report is kept, in days.
 *
 * Long enough that a campaign's worth of intelligence is still readable when
 * you come to act on it, short enough that the log is a working desk rather
 * than an archive — and short enough that it cannot grow without bound on a
 * player who scouts every rival every day for a whole era.
 */
export const COVERT_LOG_DAYS = 5;

export const SPY_TURNS = {
  /** Half the action-turn rate: 144/day against the army's 288. */
  PER_GAME_TURN: 1,
  START: 100,
  /** About a day and a half of banking. A single deep operation can spend it
   *  all — which is the point. */
  CAP: 200,
};

/** Cost is DERIVED from the size of the operation, never set by hand:
 *
 *      turnCost = spiesSent × TURNS_PER_SPY[op]
 *
 *  so an under-funded infiltration cannot happen — you either afford the
 *  agents you are sending or you send fewer. The interesting decision is how
 *  many to commit against the scouts you believe are waiting, not how much to
 *  gamble on shorting the budget. */
/**
 * `level` is the BUILDING level that unlocks the operation — Shadow Guild for
 * spies, Ranger's Lodge for scouts. `field` names the research that MULTIPLIES
 * it, and multiplies it only.
 *
 * It used to be the other way round: the research level was the gate, so a
 * realm that had paid for a Shadow Guild and filled it with knives could not
 * send one anywhere until it had also sunk levels into Tradecraft — an
 * UNRANKED field, bought at the progressive research price, purely to switch
 * on a building it already owned. Two currencies for one permission, and the
 * second of them invisible from the Guild's own page.
 *
 * Buildings gate. Research multiplies. That is the rule everywhere else in the
 * game — the Drill Yard decides whether you may raise a heavy footman and The
 * Art of War decides how hard he hits — and the shadow war is no longer the
 * exception to it.
 */
export const COVERT_OPS = {
  // ── SCOUT operations — overt, never intercepted, no risk of loss ──────────
  survey_coffers: { arm: "scout", turnsPerAgent: 0.1, scouts: 4, detection: 0, field: "pathfinding", level: 1, name: "Survey the Coffers", desc: "Exact gold and resources, and what sits outside the storehouses" },
  map_walls: { arm: "scout", turnsPerAgent: 0.15, scouts: 6, detection: 0, field: "pathfinding", level: 1, name: "Map the Walls", desc: "Wall level, integrity, and every defensive counter they have crewed" },
  map_army: { arm: "scout", turnsPerAgent: 0.15, scouts: 8, detection: 0, field: "pathfinding", level: 2, name: "Map the Army", desc: "Army composition by arm and tier, mercenaries, stamina" },
  map_siege: { arm: "scout", turnsPerAgent: 0.15, scouts: 10, detection: 0, field: "pathfinding", level: 3, name: "Map the Siege Train", desc: "Their offensive engines — the one thing the ladder never shows" },
  map_research: { arm: "scout", turnsPerAgent: 0.25, scouts: 16, detection: 0, field: "pathfinding", level: 4, name: "Map the Collegium", desc: "Every research field and level they hold" },

  // ── SPY operations — covert, interceptable, named if caught ───────────────
  torch_stores: { arm: "spy", turnsPerAgent: 0.4, detection: 1.0, field: "tradecraft", level: 1, name: "Torch the Stores", desc: "Burn what sits outside their storehouses" },
  steal_resources: { arm: "spy", turnsPerAgent: 0.4, detection: 1.0, field: "tradecraft", level: 2, name: "Steal the Stores", desc: "Carry off what sits outside — less than fire destroys, but it is yours" },
  sabotage_siege: { arm: "spy", turnsPerAgent: 0.5, detection: 1.2, field: "tradecraft", level: 2, name: "Sabotage the Engines", desc: "Wreck siege engines in the yard, offensive and defensive alike" },
  sabotage_walls: { arm: "spy", turnsPerAgent: 0.5, detection: 1.2, field: "tradecraft", level: 3, name: "Undermine the Walls", desc: "Weaken the masonry — a scratch beside a bombard, but it costs no engines" },
  incite_unrest: { arm: "spy", turnsPerAgent: 0.6, detection: 1.4, field: "tradecraft", level: 3, name: "Incite Unrest", desc: "Agitators in the streets: taxes, production and growth all suffer" },
  sow_doubt: { arm: "spy", turnsPerAgent: 0.6, detection: 1.4, field: "tradecraft", level: 4, name: "Sow Research Doubt", desc: "Whisperers among the scholars — research slows to a crawl" },
  assassinate_scouts: { arm: "spy", turnsPerAgent: 0.8, detection: 1.8, field: "tradecraft", level: 5, name: "Assassinate the Scouts", desc: "Kill their rangers and blind them to everything. Highly risky" },
  steal_research: { arm: "spy", turnsPerAgent: 1.0, detection: 2.0, field: "tradecraft", level: 5, name: "Steal the Learning", desc: "Copy a research level for yourself — they lose nothing but the secret" },
} as const;

export type CovertOpId = keyof typeof COVERT_OPS;

// ─── 2 · AGENT POWER & HEALTH ───────────────────────────────────────────────
// Same shared scale as everything else in the game.

export const AGENT_POWER = {
  spy: { power: 10, health: 10 },
  scout: { power: 10, health: 10 },
};

/**
 * What one of YOUR OWN spies is worth against a hired knife — four of them.
 *
 * Note which way round this is written. The sellsword is the baseline and your
 * own people are the multiplier: this RAISES what a regular achieves rather
 * than lowering what a bought man does. That is the whole intent — it is a
 * temptation, not a tax. Nobody is punished for hiring; you are simply shown
 * what your own would have managed.
 *
 * And the temptation has teeth, because the party fills from the HIRED FIRST.
 * A small raid is all bought men whatever you own; putting your own people in
 * it means sending enough to exhaust the hire pool, which is also exactly how
 * you put them at risk. The reward and the danger arrive together.
 *
 * Applies against the watch AND at the work — "four times as effective" has to
 * mean both. Spies only: rangers stand watch at home, on ground they all know.
 */
export const REGULAR_SPY_POWER = 4; // × a hired knife's

/** Building levels feed the additive pool, like research does. */
export const GUILD_BONUS_PER_LEVEL = 0.1; // frac/level — Shadow Guild, spies
export const LODGE_BONUS_PER_LEVEL = 0.1; // frac/level — Rangers Lodge, scouts

/**
 * Delivery: ±this on covert resolution, rolled independently for each side of
 * every mission. THREE TIMES the battle swing (0.10), because the shadow war is
 * a far chancier business than a shield wall — and because it has to be.
 *
 * Both arms are capped at the same share of population, so worth is roughly
 * `population × (research + buildings)` and two comparable empires sit at
 * PARITY BY CONSTRUCTION. With a narrow swing that made the shield below a
 * deterministic wall between equals: spying would only ever work downhill.
 *
 * At ±30% the rolled ratio at nominal parity lands anywhere in 0.54 … 1.86, so
 * you need to outweigh the other side by about 1.86x before ANY roll is certain
 * — either to be immune or to be sure of landing. Everything between is a
 * gamble, which is where most of the game lives.
 */
export const COVERT_LUCK_SWING = 0.3; // frac

// ─── 3 · INTERCEPTION ───────────────────────────────────────────────────────
// Scouts do not hunt. They stand watch, and what they catch is decided by
// weight of numbers on both sides. NO SCOUTS MEANS NO DEFENCE — a realm
// without rangers is robbed at will.

/**
 * PREPARATION — what buying your agents TIME is worth.
 *
 * The turn cost of an operation is its minimum, not its price. Spend more and
 * the extra buys reconnoitred routes, bribed gatemen and a night chosen rather
 * than taken: it multiplies what the knives are worth when they go over the
 * wall, which decides both whether the watch turns them back and how many come
 * home.
 *
 * Diminishing, and capped. Patience is worth a great deal and then it is worth
 * nothing more — at some point you are simply waiting where you could be
 * working, and the spy-turn budget is the same one the other arm draws from.
 *
 * SPIES ONLY. A scouting party already spends its turns on people, so for
 * rangers the two dials are the same dial.
 */
export const PREPARATION = {
  /** Worth gained per extra multiple of the minimum turn cost. */
  PER_EXTRA_MULTIPLE: 0.5, // frac
  /** Ceiling on that gain — three times the turns is as prepared as anyone gets. */
  MAX: 1.0, // frac
};

/**
 * The nominal interception rate at which your guild master refuses the order.
 *
 * Agents are people. Told to walk into a realm so heavily watched that nine in
 * ten will not come back, they decline, and no turns are spent declining. It is
 * the covert twin of ATTACK_REFUSAL_RATIO, where captains refuse a target far
 * above their weight.
 *
 * Judged on NOMINAL worth with no luck rolled, so the same order always gets
 * the same answer — a refusal that came and went with the dice would be
 * unreadable. And it is the only signal in the game about the size of another
 * realm's watch, which no scout operation reports.
 */
export const REFUSAL_RATE = 0.6; // frac of the party the watch would lay hands on

/**
 * SLIPPING THROUGH — being laid hands on is not the same as being taken.
 *
 * The watch grabs at whoever it finds; most of them wriggle free. Your OWN
 * people are far better at it than the hired: they know the ground, they were
 * raised on it, and they have somewhere to run to. A sellsword has a contract
 * and an unfamiliar city.
 *
 * This is the covert twin of DAMAGE_TAKEN, and it is the single largest thing
 * standing between a spy corps and annihilation — without it a heavy watch
 * simply deleted an infiltration.
 */
export const SLIP_THROUGH = {
  /** Share of grabbed HIRED knives who get away. */
  MERC: 0.5, // frac
  /** …and of your own, who are better at it. */
  REGULAR: 0.8, // frac
};

export const INTERCEPTION = {
  /** Fraction intercepted at parity of power, before the op's detection
   *  multiplier. Scales with the strength ratio and is capped below 1 so a
   *  determined infiltration always lands something. */
  AT_PARITY: 0.4, // frac
  MAX: 0.9, // frac
  /** Any interception at all reveals the hand behind it and opens the revenge
   *  window. A clean run stays anonymous — that is the whole prize. */
  NAMES_ATTACKER: true,
  /** Within the caught, sellswords are taken first — a regular agent is the
   *  one lost only this often while merc agents remain. */
  REGULAR_SHARE: 0.25, // frac
};

// ─── 4 · RECRUITMENT CAPS ───────────────────────────────────────────────────

export const COVERT_CAPS = {
  /** Each arm may not exceed this share of total population… */
  PER_ARM: 0.05, // frac
  /** …and together they may not exceed this. */
  COMBINED: 0.1, // frac
};

// ─── 5 · MISSION EFFECTS ────────────────────────────────────────────────────
// All scale with the AGENTS WHO GOT THROUGH, never with the number sent.

/**
 * CLAN WAR multiplies what a successful operation does — applied to the FINAL
 * magnitude, after each op's per-mission cap, so it bites even where the cap
 * already binds. Doubling agent counts instead would do nothing at the cap.
 *
 * Duration ops (Incite Unrest, Sow Doubt) double their duration rather than
 * their size, which is the only sensible reading of "twice the damage" for an
 * effect measured in days.
 *
 * It applies to SABOTAGE only. Intelligence-gathering is unaffected — a map of
 * their army is a map of their army whether or not a war is on.
 */
export const COVERT_WAR_MULTIPLIER = 2;

export const COVERT_EFFECTS = {
  /** Siege engines wrecked per surviving spy. */
  SABOTAGE_PER_SPY: 0.5,
  /** Wall health destroyed per surviving spy, as a fraction of the wall's
   *  full health. Deliberately tiny: undermining must never compete with a
   *  trebuchet, or the entire siege economy is pointless. */
  UNDERMINE_PER_SPY: 0.002, // frac of wall HP
  UNDERMINE_CAP: 0.1, // frac per mission
  /** Goods burned per surviving spy, and the cap per mission. */
  TORCH_PCT_PER_SPY: 0.01,
  TORCH_CAP: 0.25,
  /** Theft takes less than fire destroys — it has to be carried out. */
  STEAL_PCT_PER_SPY: 0.006,
  STEAL_CAP: 0.15,
  /** Regular scouts killed per surviving spy. Excess merc scouts are paid off
   *  afterwards to restore the cap ratio, and the victim's scout veterancy
   *  falls with the dead. */
  ASSASSINATE_PER_SPY: 0.3,
  /** Research theft COPIES a level — the victim keeps theirs and loses only
   *  the secret. Capped per era so it can never replace doing the work. */
  STEAL_RESEARCH_LEVELS_PER_ERA: 5,
  /**
   * Surviving spies that buy the FULL duration of a lingering effect — unrest
   * or doubt. Below it the effect is proportionally shorter.
   *
   * It used to be flat: one spy through the wall and a hundred bought exactly
   * the same day of ruin, which made sizing an infiltration pointless.
   */
  INFILTRATION_SCALE: 50, // survivors
  /**
   * …and the shortest an effect can run once it HAS landed, as a fraction of
   * its base. Without a floor a defender who is only just outmatched takes
   * fourteen minutes of unrest — an alarm in the inbox and nothing wrong by the
   * time they look, which reads as a bug rather than a near-miss. With one
   * there are only two outcomes and both are legible: it bounced, or you felt
   * it.
   */
  MIN_DURATION_FRACTION: 0.1, // frac of base — 24h base gives ~2.4h
};

/** Incite Unrest — taxes, production and growth all suffer until it lapses.
 *  HOURS is the ceiling, not the answer: how long it actually runs is decided
 *  by how many knives got through and how heavy the watch was (lingerTicks). */
export const UNREST = { HOURS: 24, TAX_PENALTY: 0.25, PRODUCTION_PENALTY: 0.25 };

/** Sow Research Doubt — the scholars lose their thread. Same ceiling-not-answer
 *  rule as UNREST above, and rangers are why a research empire keeps a watch. */
export const RESEARCH_DOUBT = { HOURS: 24, RESEARCH_PENALTY: 0.5 };

/**
 * SCOUT MISSIONS — how many rangers a look actually takes.
 *
 *     needed = op.scouts × (1 + their population ÷ POP_SCALE) ÷ Pathfinding
 *     cost   = rangers sent × TURNS_PER_SCOUT
 *     fill   = rangers sent ÷ needed
 *
 * Scouting used to be flat: one ranger returned the identical exact report that
 * five hundred would, so sending more was strictly worse and there was no such
 * thing as sending too few. Now the size of the realm you are looking at
 * decides the price — mapping a giant is a real expedition, mapping a neighbour
 * is an afternoon — and how well you fund it decides how sharp the answer is.
 *
 * NOBODY IS EVER CAUGHT. Rangers work in the open; the cost of coming up short
 * is a vaguer answer, never a funeral. Below MIN_FILL they simply cannot finish
 * and come home with nothing but the bill.
 */
export const SCOUT_MISSION = {
  /** Turns each ranger costs, whatever the mission. The "extra turns" a deeper
   *  look demands come from needing more people, not a second rate. */
  TURNS_PER_SCOUT: 2,
  /** Population that doubles a mission's requirement. */
  POP_SCALE: 5000,
  /** Pathfinding cuts the requirement by this much per level — the one thing
   *  that makes the field honest on offence as well as defence. */
  PATHFINDING_RELIEF: 0.1, // frac/level
  /** Below this share of the requirement the mission cannot be completed. */
  MIN_FILL: 0.25, // frac
};

/**
 * How wide a range gets when a mission is barely manned — the half-width at
 * fill 0, as a fraction of the true figure. Every number narrows toward the
 * truth as `fill` climbs, and reads exactly at fill 1.
 *
 * The range is NOT centred on the truth. A centred range would let anyone read
 * the midpoint and have perfect intelligence for half the rangers, which is the
 * whole thing this is meant to stop; the true figure sits somewhere inside at a
 * position you cannot know.
 */
export const RECON_FUZZ = 0.5; // frac

// ─── 6 · COVERT EXPERIENCE ──────────────────────────────────────────────────
// Spies and scouts each keep their own veterancy, on the same terms as troops:
// earned by working, lost with the REGULARS who die or are dismissed. Hired
// agents neither earn it nor cost it.

