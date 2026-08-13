// The Collegium Examination — 25 questions that teach the manual.
//
// NOT a test. Every answer is revealed the moment it is given, with the reason
// and a link to the chapter it came from, and the endowment is paid for
// FINISHING rather than for scoring. A quiz that gates a reward behind a pass
// mark teaches people to hunt for answers; one that explains itself as you go
// teaches the game. The score at the end is a boast, not a grade.
//
// Sat once per age. It vanishes from the realm the moment it is finished — a
// tutorial that lingers after you have done it is clutter, and the endowment
// can only ever be paid once (see the `exam` command in lib/server/pipeline.ts).
//
// EVERY NUMBER HERE IS INTERPOLATED FROM THE CONSTANT IT DESCRIBES. Hard-coding
// them is how the manual ended up telling players that a worker digs 50/turn
// nine months after that stopped being true — and a quiz that lies is worse
// than no quiz, because the player will believe it over the screen in front of
// them. If a balance number moves, these questions move with it.

import {
  ARMY_FLOORS,
  BLACK_MARKET,
  GOLD_PER_CIVILIAN_AT_FULL_TAX,
  HOLD_CLOCKS,
  HOUSING_PER_HEARTHSTEAD,
  MARKET_FEE,
  MARKET_PRICE_MAX,
  MARKET_PRICE_MIN,
  NEWCOMER_SHIELD_HOURS,
  POP_GROWTH,
  TROOPS_PER_MUSTER_HALL,
  TURNS_PER_DAY,
} from "./balance";
import { LOOT, REVENGE_WINDOW_HOURS, XP } from "./battleBalance";
import { goldShelterAtLevel, storageShelterAtLevel, workerOutputAtLevel } from "./derived";

export interface ExamQuestion {
  /** Stable id — the answer log is keyed by position, but ids make the bank
   *  reorderable without invalidating anything a player has already sat. */
  id: string;
  topic: string;
  prompt: string;
  options: string[];
  /** Index into `options`. NEVER sent to the client for an unanswered
   *  question — see app/(game)/exam/page.tsx. */
  answer: number;
  /** Shown the instant they answer, right or wrong. This is the teaching. */
  why: string;
  /** The chapter that covers it, so "go and read" is one click. */
  guide: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const EXAM: ExamQuestion[] = [
  // ── Production ──────────────────────────────────────────────────────────
  {
    id: "prod-workers",
    topic: "Production",
    prompt: "How many farmers can work a single Grange?",
    options: [
      "As many as you like; the building's LEVEL decides how much each one produces",
      "20 — one per job the building opens",
      "One per level of the Grange",
      "It depends on your Hearthsteads",
    ],
    answer: 0,
    why: `Workers are uncapped. You only need the building to exist — its level lifts every worker's output, from ${workerOutputAtLevel(1)}/turn at level 1 to ${workerOutputAtLevel(10)} at level 10. Assigning is free and reversible, so there is never a reason to leave a peasant idle.`,
    guide: "/guide#grow",
  },
  {
    id: "prod-scarcity",
    topic: "Production",
    prompt: "Which is scarcer in this age — coin, or wood, stone and ore?",
    options: [
      "Coin — taxes trickle, and everything worth having costs gold",
      "Goods — a worker digs little, while the treasury fills fast",
      "They are deliberately balanced against each other",
      "It depends entirely on your race",
    ],
    answer: 1,
    why: `A civilian pays ${GOLD_PER_CIVILIAN_AT_FULL_TAX.toLocaleString("en-US")} gold a turn at full tax — enough for ${(GOLD_PER_CIVILIAN_AT_FULL_TAX / BLACK_MARKET.BUY_PRICE).toLocaleString("en-US", { maximumFractionDigits: 1 })} goods at the Black Market's ${BLACK_MARKET.BUY_PRICE} a unit — while a worker digs ${workerOutputAtLevel(1)} a turn at a level-1 building and ${workerOutputAtLevel(10)} at level 10. Coin comes easily; the materials are what you wait on, which is why the Bazaar matters so much.`,
    guide: "/guide#grow",
  },
  {
    id: "prod-food",
    topic: "Production",
    prompt: "Your food reaches zero. What stops?",
    options: [
      "Only population growth",
      "Growth and research",
      "Production, research, tax income, growth AND attacking — everything",
      "Nothing; your people simply starve slowly",
    ],
    answer: 2,
    why: "Starvation freezes the whole empire until your people eat, and upkeep is taken BEFORE each harvest — so a single farmer's tick will not save you once you are at zero. Keep a buffer, and buy food at the Bazaar in a pinch.",
    guide: "/guide#grow",
  },

  // ── Hearthsteads & Muster Halls ─────────────────────────────────────────
  {
    id: "house-beds",
    topic: "Hearthsteads & barracks",
    prompt: `Each Hearthstead houses ${HOUSING_PER_HEARTHSTEAD} people. What happens to settlers who arrive with no bed free?`,
    options: [
      "They wait outside until housing is built",
      "They are turned into soldiers automatically",
      "They double up, at a happiness penalty",
      "They walk on and are lost",
    ],
    answer: 3,
    why: `Arrivals that find no vacant bed are gone for good, so housing must be built AHEAD of growth, not after it. Worse, the day's intake is averaged across all ${TURNS_PER_DAY} turns — a bed bought late barely counts. The Hearthstead card shows how many steads the next 1, 3 and 7 days need.`,
    guide: "/guide#grow",
  },
  {
    id: "house-muster",
    topic: "Hearthsteads & barracks",
    prompt: "What does a Muster Hall actually limit?",
    options: [
      `How many regular troops you may field: ${TROOPS_PER_MUSTER_HALL} per hall`,
      `Nothing — like every other building, it only makes troops better`,
      "How fast troops train",
      "How much your troops cost in gold",
    ],
    answer: 0,
    why: `Muster Halls are one of the few real caps in the game — ${TROOPS_PER_MUSTER_HALL} beds each, and your regulars cannot exceed them. Housing works the same way for civilians. Everything else (farmers, scholars, merchants, spies, scouts) is uncapped.`,
    guide: "/guide#army",
  },
  {
    id: "house-storage",
    topic: "Hearthsteads & barracks",
    prompt: "What does a storehouse level actually buy you?",
    options: [
      "More production from every worker",
      `It DOUBLES what it shelters from raids — ${storageShelterAtLevel(1).toLocaleString("en-US")} at level 1, ${storageShelterAtLevel(10).toLocaleString("en-US")} at level 10`,
      "Faster caravans to the Bazaar",
      "A higher ranking score",
    ],
    answer: 1,
    why: `Shelter DOUBLES every level — ${storageShelterAtLevel(1).toLocaleString("en-US")} per resource at level 1, ${storageShelterAtLevel(10).toLocaleString("en-US")} at level 10, and the Counting House holds more still (${goldShelterAtLevel(1).toLocaleString("en-US")} gold at level 1). Anything above your shelter sits loose and is lootable, which is why hoarding past your storehouses is punished far harder than being small.`,
    guide: "/guide#defense",
  },

  // ── Population growth ───────────────────────────────────────────────────
  {
    id: "pop-range",
    topic: "Population growth",
    prompt: "How many settlers can arrive at dawn, at best and at worst?",
    options: [
      "A flat 25 for everyone",
      "It scales endlessly with your population",
      `${POP_GROWTH.MIN} at worst, ${POP_GROWTH.MAX} at best`,
      "It depends only on your Hearthsteads",
    ],
    answer: 2,
    why: `A flat +${POP_GROWTH.BASE} base, up to +10 for a garrison that makes people feel safe, up to +${POP_GROWTH.PROSPERITY_MAX} for levels in the four RESOURCE buildings, and up to +40 for walls — floored at ${POP_GROWTH.MIN} and capped at ${POP_GROWTH.MAX}. The breakdown is on your Command View.`,
    guide: "/guide#grow",
  },
  {
    id: "pop-safety",
    topic: "Population growth",
    prompt: "Which of these raises the 'safety' part of your growth?",
    options: [
      "A bigger treasury",
      "Higher taxes",
      "More storehouses",
      "A garrison — troops as a share of your civilians, sellswords included",
    ],
    answer: 3,
    why: "A town with no garrison attracts nobody. The tiers start at 20% troops-to-civilians and max at 30%, and hired blades count — a sellsword on the gate reassures a farmer exactly as well as a levied one. It is the same ratio that stops your peasants scattering.",
    guide: "/guide#grow",
  },
  {
    id: "pop-storage",
    topic: "Population growth",
    prompt: "Do storehouses count toward the 'prosperity' part of population growth?",
    options: [
      "No — only the four resource producers. A full granary is not a job",
      "Yes — all buildings count",
      "Only the Granary does",
      "Only at level 5 and above",
    ],
    answer: 0,
    why: `Prosperity counts levels in the Grange, Sawyer's Mill, Mason's Quarry and Deepvein Mine — work to be had — for up to +${POP_GROWTH.PROSPERITY_MAX}. Storage shelters goods; it employs nobody.`,
    guide: "/guide#grow",
  },

  // ── Raids vs castle vs revenge vs bombard ───────────────────────────────
  {
    id: "atk-raid",
    topic: "Raid, castle, bombard, revenge",
    prompt: "A raid takes…",
    options: [
      "Gold from the treasury",
      "Goods sitting outside their storehouses — never gold",
      "Both gold and goods",
      "Whatever you choose before marching",
    ],
    answer: 1,
    why: "Raids take goods; castle attacks take gold; neither takes both. That is precisely what makes 'bombard the storehouses open, then raid, then storm the castle' a campaign rather than one button.",
    guide: "/guide#battle",
  },
  {
    id: "atk-bombard",
    topic: "Raid, castle, bombard, revenge",
    prompt: "How much does a successful bombardment loot?",
    options: [
      "The same as a raid",
      "Half of a raid",
      "Nothing at all — it is a setup move",
      "Gold only",
    ],
    answer: 2,
    why: "Bombard takes nothing, in peace or in war. It breaks walls and buildings from a distance without risking your line army — it exists to open a target up for the raid or the castle assault that follows.",
    guide: "/guide#battle",
  },
  {
    id: "atk-revenge",
    topic: "Raid, castle, bombard, revenge",
    prompt: "What does revenge do that an ordinary attack cannot?",
    options: [
      "It takes double loot",
      "It cannot be defended against",
      "It costs no action turns",
      "It ignores the protections that stop a normal attack — their vacation, their shield, the strength gap",
    ],
    answer: 3,
    why: `Revenge is a punishment, not a payday: it takes nothing. What it does is reach through the rules that would otherwise stop you, for ${REVENGE_WINDOW_HOURS} hours after they strike you or are caught spying on you.`,
    guide: "/guide#revenge",
  },
  {
    id: "atk-war",
    topic: "Raid, castle, bombard, revenge",
    prompt: "Your clan is formally at war. What changes about a raid on the enemy?",
    options: [
      `It takes everything outside their vault, instead of a rolled share`,
      "Nothing — war is only a label",
      "It starts taking gold as well as goods",
      "It becomes free of action turns",
    ],
    answer: 0,
    why: `In war a raid or castle attack takes ${pct(LOOT.WAR_SHARE)} of what sits outside the vault — no roll, no size-scaling, no peacetime relief. Bombard and revenge still take nothing; war changes the SHARE and the ferocity, never the character of the blow. The vault becomes your only defence.`,
    guide: "/guide#clans",
  },
  {
    id: "atk-shield",
    topic: "Raid, castle, bombard, revenge",
    prompt: `A new empire is under the ${NEWCOMER_SHIELD_HOURS}-hour newcomer shield. What may you do to them?`,
    options: [
      "Raid, but not besiege",
      "Nothing at all — no attack and no spying",
      "Scout them, but nothing else",
      "Anything, if you are in a clan war",
    ],
    answer: 1,
    why: `The shield stops everything for ${NEWCOMER_SHIELD_HOURS} hours: no attack, no bombardment, no spies, no scouts. It is the one window in which a new empire can build without being farmed.`,
    guide: "/guide#defense",
  },

  // ── Siege duels ─────────────────────────────────────────────────────────
  {
    id: "siege-duel",
    topic: "Siege duels",
    prompt: "Before the walls are touched, what happens to the attacker's engines?",
    options: [
      "Nothing — engines are safe until the assault ends",
      "They are halved automatically",
      "The defender's crewed counter-engines duel them first",
      "The defender may buy them off",
    ],
    answer: 2,
    why: "The counter-engine duel comes first: the defender's works shoot at the attacker's train before it can shoot at the walls. Bring enough engines to survive the exchange, or scout their works first and learn what is waiting.",
    guide: "/guide#defense",
  },
  {
    id: "siege-crew",
    topic: "Siege duels",
    prompt: "You own forty defensive engines but few engineers. How many fight?",
    options: [
      "All forty",
      "None; engines need no crew",
      "Half of them",
      "Only the ones your engineers can crew — the rest are lumber",
    ],
    answer: 3,
    why: "Only crewed engines count, in the duel and on the ladder. Engineers are dual-use: the same hands that push trebuchets forward man the counter-engines when nobody is marching, so an engineer is never wasted.",
    guide: "/guide#defense",
  },
  {
    id: "siege-hidden",
    topic: "Siege duels",
    prompt: "Which part of an empire's strength does the ladder NEVER show?",
    options: [
      "Their offensive siege train",
      "Their walls",
      "Their regular troops",
      "Their army experience",
    ],
    answer: 0,
    why: "Your siege train is the most valuable thing a rival could learn about you, so the ladder never publishes it — that is exactly what Map the Siege Train is for. Crewed DEFENSIVE works do score, because a besieger outside the gate can see them.",
    guide: "/guide#clocks",
  },

  // ── Spies & scouts ──────────────────────────────────────────────────────
  {
    id: "shadow-scout",
    topic: "Spies & scouts",
    prompt: "What is the risk of sending scouts?",
    options: [
      "They may be killed and name you",
      "None — rangers work in the open and always come home",
      "They open a revenge window against you",
      "They cost regular troops",
    ],
    answer: 1,
    why: "Scouts are the safe arm: open, never intercepted, never traced. Spies are the opposite — they go over the wall, and if even one is taken the target learns who sent them and the revenge window opens.",
    guide: "/guide#shadows",
  },
  {
    id: "shadow-pool",
    topic: "Spies & scouts",
    prompt: "Spies and scouts spend from…",
    options: [
      "Action turns, like an attack",
      "Separate pools, one each",
      "One shared pool of spy turns",
      "Gold only",
    ],
    answer: 2,
    why: "Both arms draw on the same scarcer clock, so every turn spent watching a rival is a turn not spent robbing one. That tension is the whole shape of the covert game.",
    guide: "/guide#shadows",
  },
  {
    id: "shadow-caught",
    topic: "Spies & scouts",
    prompt: "Your spies get through, but one is caught. What did the target learn?",
    options: [
      "Nothing — the survivors' work is anonymous",
      "Your entire army composition",
      "Only that someone tried",
      "Who sent them, and they gain an open revenge window",
    ],
    answer: 3,
    why: "A clean run stays anonymous; a single capture names you. Only the survivors do the damage, so sending too few is the worst of both worlds — little effect, and a rival who now knows where to march.",
    guide: "/guide#shadows",
  },

  // ── Markets ─────────────────────────────────────────────────────────────
  {
    id: "market-band",
    topic: "Markets",
    prompt: "What price may a player set on the Grand Bazaar?",
    options: [
      `Anything from ${MARKET_PRICE_MIN} to ${MARKET_PRICE_MAX} gold a unit`,
      "Anything at all — the market is free",
      "Only the current average",
      `Exactly ${BLACK_MARKET.BUY_PRICE} gold a unit`,
    ],
    answer: 0,
    why: `Player asks live inside ${MARKET_PRICE_MIN}–${MARKET_PRICE_MAX} gold, and the Bazaar takes ${pct(MARKET_FEE)} of every sale. Caravans take real time to reach the market, so a price is a bet on where demand will be when they arrive.`,
    guide: "/guide#market-mastery",
  },
  {
    id: "market-black",
    topic: "Markets",
    prompt: "What does the Black Market offer that the Bazaar does not?",
    options: [
      "Better prices",
      `An instant, guaranteed trade against the game itself — at ${BLACK_MARKET.SELL_PRICE} gold a unit to sell, ${BLACK_MARKET.BUY_PRICE} to buy`,
      "Trades that cannot be scouted",
      "Free caravans",
    ],
    answer: 1,
    why: `The fence is certainty at a terrible rate: it pays ${BLACK_MARKET.SELL_PRICE} and charges ${BLACK_MARKET.BUY_PRICE}, deliberately outside the player band so it can never undercut a real caravan. Use it when waiting would cost you more than the spread.`,
    guide: "/guide#market-mastery",
  },

  // ── Ranking ─────────────────────────────────────────────────────────────
  {
    id: "rank-counts",
    topic: "Ranking",
    prompt: "Which of these adds NOTHING to your ranking score?",
    options: [
      "Your crewed defensive works",
      "Your scouts",
      "Your gold and resources",
      "Your sellswords",
    ],
    answer: 2,
    why: "Wealth buys no prestige — gold, resources, civilian buildings and housing are all worth zero. The ladder measures what a besieger could see: people, troops, engineers, crewed works, walls, veterancy and the ranked research.",
    guide: "/guide#clocks",
  },
  {
    id: "rank-veterancy",
    topic: "Ranking",
    prompt: "Your army loses a third of its regulars in a hard battle. What happens to your veterancy?",
    options: [
      "Nothing — experience is remembered by the empire",
      "It rises, because the survivors learned",
      "It resets to zero",
      "You lose a third of it; veterancy dies with the veterans",
    ],
    answer: 3,
    why: `Veterancy is worth up to +100% damage on attack AND defence, and it is carried by the men themselves — lose a third of the line, lose a third of the experience. Discharging costs half as much per head. It also pays ranking points, so it is the one multiplier the ladder publishes.`,
    guide: "/guide#regulars",
  },
  {
    id: "rank-victory",
    topic: "Ranking",
    prompt: "What must a lone regent hold to win the age as Grand Overlord?",
    options: [
      `#1 for ${HOLD_CLOCKS.CUMULATIVE_HOURS}h cumulative AND ${HOLD_CLOCKS.STREAK_HOURS}h unbroken, with ${ARMY_FLOORS.INDIVIDUAL.toLocaleString("en-US")}+ regulars and never having joined a clan`,
      "Simply the highest score when the age ends",
      "The largest treasury in the realm",
      "Any clan's victory, shared among its members",
    ],
    answer: 0,
    why: `Both clocks must run, and they only tick while you field ${ARMY_FLOORS.INDIVIDUAL.toLocaleString("en-US")}+ regulars and have never joined a clan this age. Touching #1 is not enough — you have to hold it while everyone tries to knock you off.`,
    guide: "/guide#winning",
  },
];

/**
 * The mark that seals it: 15 of 25.
 *
 * Deliberately not a high bar. Every answer is explained the moment it is
 * given, so a first attempt IS the lesson — and someone who sat it cold,
 * learned from twenty-five explanations and came back to pass has done exactly
 * what the examination is for. Guessing blind gives about 6 of 25, so the mark
 * still means a paper was actually read.
 */
export const EXAM_PASS_MARK = 15;

/** The endowment for passing. Paid once per age, never twice. */
export const EXAM_REWARD = {
  gold: 100_000,
  /** Per resource — food, wood, stone and ore each. */
  resources: 20_000,
};

export const EXAM_LENGTH = EXAM.length;
