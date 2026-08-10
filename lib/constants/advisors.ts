// The four councillors — one identity, used everywhere they speak.
//
// They speak in two places: the Council Chamber (/advisors, the full counsel)
// and the red/amber banners atop every page (components/AdvisorAlerts). Those
// two used to disagree — the banners invented personal names ("Steward Maren",
// "General Vosk", "Marshal Aldric", "Treasurer Poll") while the Chamber used
// role titles ("The Steward", "The Warlord", "The Warden", "The Treasurer"), so
// the same councillor had two names and neither matched the portrait. Worse,
// the personal names were human ones shown to orc and troll players whose
// council is their own people.
//
// Role titles are still what a banner leads with — they say what the councillor
// is FOR, which is what you need when one is shouting at you. But a council
// should also be YOUR people, so each councillor now has a personal name drawn
// from their ruler's race: an orc warlord is Grash, a dwarf one is Thrain. The
// original problem was never personal names — it was HUMAN names shown to every
// race. One set per race fixes that without going back to faceless offices.

import type { Race } from "./races";

export type AdvisorKey = "defensive" | "military" | "economic" | "population";

export type Advisor = {
  key: AdvisorKey;
  /** How the councillor is addressed, in banners and in the Chamber alike. */
  name: string;
  /** Their office, for the Chamber's subtitle. */
  title: string;
  /** One line on what they watch. */
  charge: string;
  /** Tone colour — also the accent on their banners. */
  accent: string;
  guide: string;
  guideLabel: string;
};

export const ADVISORS: readonly Advisor[] = [
  {
    key: "defensive",
    name: "The Warden",
    title: "Defensive Advisor",
    charge: "Walls, repairs, and the art of not being sacked.",
    accent: "var(--steel)",
    guide: "/guide#defense",
    guideLabel: "Defending the Realm",
  },
  {
    key: "military",
    name: "The Warlord",
    title: "Military Advisor",
    charge: "Troop readiness, stamina, and when to march.",
    accent: "var(--warn)",
    guide: "/guide#battle",
    guideLabel: "Battle Strategies",
  },
  {
    key: "economic",
    name: "The Treasurer",
    title: "Economic Advisor",
    charge: "Production, taxes, and the weakest link in the chain.",
    accent: "var(--coin)",
    guide: "/guide#grow",
    guideLabel: "How to Grow",
  },
  {
    key: "population",
    name: "The Steward",
    title: "Population Advisor",
    charge: "Housing, growth, and keeping the peasants from walking.",
    accent: "var(--pos)",
    guide: "/guide#grow",
    guideLabel: "How to Grow",
  },
] as const;

/**
 * Personal names by race. Four councillors × six peoples, each set written to
 * sound like the race it belongs to — the elven court is not the gnoll one.
 */
export const ADVISOR_NAMES: Record<Race, Record<AdvisorKey, string>> = {
  human: { defensive: "Aldric", military: "Vosk", economic: "Poll", population: "Maren" },
  elf: { defensive: "Ithuriel", military: "Caelen", economic: "Lysveth", population: "Aerith" },
  orc: { defensive: "Durzog", military: "Grash", economic: "Mokk", population: "Ubra" },
  troll: { defensive: "Bhurn", military: "Krogg", economic: "Vugg", population: "Hessa" },
  dwarf: { defensive: "Balgrim", military: "Thrain", economic: "Durrin", population: "Hilda" },
  gnoll: { defensive: "Skarn", military: "Rakka", economic: "Yipp", population: "Nabu" },
};

/**
 * The councillor as this ruler knows them: personal name plus their office.
 * Pass the race and you get "Maren, the Steward" for a human court and
 * "Ubra, the Steward" for an orcish one — same office, their own people.
 */
export function advisorFor(key: AdvisorKey, race: Race): Advisor & { person: string; fullName: string } {
  const base = BY_KEY.get(key)!;
  const person = ADVISOR_NAMES[race]?.[key] ?? ADVISOR_NAMES.human[key];
  return { ...base, person, fullName: `${person}, ${base.name}` };
}

const BY_KEY = new Map(ADVISORS.map((a) => [a.key, a]));

export function advisor(key: AdvisorKey): Advisor {
  return BY_KEY.get(key)!;
}

/** Deep-link to a councillor's counsel in the Chamber. */
export function advisorHref(key: AdvisorKey): string {
  return `/advisors#${key}`;
}

/** Their portrait, in the viewer's own people. Every race carries all four, so
 *  this always resolves — see scripts/ui-kit.py's sibling art in public/art. */
export function advisorArt(key: AdvisorKey, race: string): string {
  return `advisors/${race}/${key}`;
}
