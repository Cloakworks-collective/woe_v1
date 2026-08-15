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
    // A TIDING, not the report. These used to paste the whole finding into the
    // feed — a survey of the coffers is nine numbers and arrived as a
    // 200-character run of parenthesised asides, which buried every other
    // event around it and was unreadable anyway. The figures live on the
    // intelligence desk in columns; this says only that they arrived.
    case "spyReport":
      return `🗡 ${e.caught ? `The mission against ${e.targetName} is undone` : `Shadows return from ${e.targetName}`}.`;
    case "spiesCaught": return `🗡 We seized ${e.executed} spies of ${e.attackerName} (${e.op}) — all put to the sword.`;
    case "sabotaged": return `🔥 ${e.detail}`;
    case "scoutReport": return `👁 Whispers return from ${e.targetName}.`;
    case "marketSale": return `⚖ At the Bazaar, ${fmt(e.amount)} ${e.resource} fetched ${fmt(e.goldNet)} gold (the fee taken).`;
    case "clanEvent": return `🛡 ${e.detail}`;
    case "crownClock":
      if (e.scope === "overlord") {
        return e.gained
          ? "👑 You reign as #1 above the floor — your Grand Overlord clock is now ticking!"
          : "👑 You are no longer the eligible #1 — your Grand Overlord clock has stopped.";
      }
      return e.gained
        ? `🛡 Your clan ${e.who} leads the realm — the Clan Victory clock is now ticking!`
        : `🛡 Your clan ${e.who} has lost the lead — the Clan Victory clock has stopped.`;
    case "info": return e.detail;
  }
}

/**
 * Where a tiding's full account lives, if it has one.
 *
 * The feed is a list of things that happened; the report is what happened. Any
 * event carrying more than one line of substance links out to it rather than
 * inlining it — covert work to the intelligence desk, a battle to its own
 * report. Returns undefined for tidings that are complete in themselves.
 */
export function eventHref(e: GameEvent): string | undefined {
  switch (e.type) {
    case "scoutReport":
    case "spyReport":
      // No id, no link. This used to fall back to a bare list page, which
      // promised a report and delivered an index — and for every tiding filed
      // before covert records existed that index was EMPTY, so the one case the
      // fallback was written for was the one case it read as broken. A tiding
      // with nothing behind it should simply not offer to show you anything.
      return e.reportId ? `/report/${e.reportId}` : undefined;
    case "battleResult":
    case "attacked":
      return e.battleId ? `/battle/${e.battleId}` : undefined;
    default:
      return undefined;
  }
}

/** What the link says. Named for what you will READ, not "view details". */
export function eventLinkLabel(e: GameEvent): string {
  switch (e.type) {
    case "scoutReport":
    case "spyReport":
      return "read the report";
    case "battleResult":
    case "attacked":
      return "read the battle report";
    default:
      return "read more";
  }
}

export type EventTone = "war" | "shadow" | "danger" | "growth" | "trade" | "clan" | "crown" | "info";

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
    case "crownClock":
      return "crown";
    case "info":
      return "info";
  }
}
