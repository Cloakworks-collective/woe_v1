import type { GameEvent } from "@/lib/engine";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pretty = (s: string) => cap(s.replace(/_/g, " "));
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

export function eventLine(e: GameEvent): string {
  switch (e.type) {
    case "starvation": return "☠ The granaries stand empty — the realm freezes, and all labour ceases.";
    case "fed": return "🍞 Bread returns to the tables; the folk take up their tools anew.";
    case "mercsDefected": return `🏳 ${e.count} unpaid ${plural(e.count, "sellsword")} stole away in the night.`;
    case "dailyRecruitment":
      return `🏘 ${e.arrived} ${plural(e.arrived, "soul")} arrived to swell the realm${e.turnedAway > 0 ? ` — though ${e.turnedAway} found no roof and wandered on` : ""}.`;
    case "scattering": return `🏃 ${e.lost} frightened ${plural(e.lost, "peasant")} fled into the dark!`;
    case "researchComplete": return `📚 The scholars unveil ${pretty(e.field)}, mastery reaching level ${e.level}.`;
    case "buildComplete": return `🏗 The ${pretty(e.building)} rises to level ${e.level}, stone upon stone.`;
    case "attacked": return `⚔ ${e.byName} fell upon us in ${e.mode}! We may answer with revenge for 18 hours.`;
    case "battleResult": return `⚔ Our ${e.mode} is decided — ${e.victor} carried the day.`;
    case "spyReport": return `🗡 ${e.caught ? "The mission is undone" : "Whispers return"} from ${e.targetName}: ${e.detail}`;
    case "spiesCaught": return `🗡 We seized ${e.executed} spies of ${e.attackerName} (${e.op}) — all put to the sword.`;
    case "sabotaged": return `🔥 ${e.detail}`;
    case "scoutReport": return `👁 Our scouts spied out ${e.targetName}: ${e.detail}`;
    case "marketSale": return `⚖ At the Bazaar, ${fmt(e.amount)} ${e.resource} fetched ${fmt(e.goldNet)} gold (the fee taken).`;
    case "clanEvent": return `🛡 ${e.detail}`;
    case "info": return e.detail;
  }
}

export type EventTone = "war" | "shadow" | "danger" | "growth" | "trade" | "clan" | "info";

/** Colour family for a tiding, so the Chronicle reads at a glance. */
export function eventTone(e: GameEvent): EventTone {
  switch (e.type) {
    case "attacked":
    case "battleResult":
      return "war";
    case "spyReport":
    case "spiesCaught":
    case "sabotaged":
    case "scoutReport":
      return "shadow";
    case "starvation":
    case "scattering":
    case "mercsDefected":
      return "danger";
    case "dailyRecruitment":
    case "fed":
    case "researchComplete":
    case "buildComplete":
      return "growth";
    case "marketSale":
      return "trade";
    case "clanEvent":
      return "clan";
    case "info":
      return "info";
  }
}
