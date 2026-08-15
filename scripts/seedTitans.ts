/**
 * Two great powers, evenly matched, and a war between them.
 *
 *     npx tsx --env-file=.env.local scripts/seedTitans.ts
 *
 * The point is READABLE BATTLE REPORTS. A report is only interesting when every
 * phase of the exchange actually happens, so both empires are built to make all
 * of them fire: engines on both sides so the counter-duel resolves, rams and a
 * wall to break, escalade teams so troops come over it, all three arms at all
 * three tiers with sellswords beside them so the casualty walk (light → medium
 * → heavy, hired first at each rank) is visible in the losses table, and enough
 * veterancy that the ledger moves.
 *
 * Evenly matched on purpose. A mismatch produces a one-sided report where half
 * the phases never resolve — and the army refuses outright past
 * ATTACK_REFUSAL_RATIO, which is the commonest way a seeded war produces
 * nothing at all.
 *
 * Every blow goes through `applyOneCommand`, the same path a player's click
 * takes, so these reports are exactly what the game produces.
 */

import { applyOneCommand } from "../lib/server/pipeline";
import { ERA_PEACE_TICKS, commitWithRetry } from "../lib/server/world";
import { newEmpire } from "../lib/engine/newEmpire";
import { rankingScore, type Player } from "../lib/engine";
import {
  emptyMercForce,
  fullCounterIntegrity,
  fullGearIntegrity,
} from "../lib/engine/types";
import { EXPERIENCE } from "../lib/constants";
import type { Race } from "../lib/constants/races";
import type { World } from "../lib/server/store";

/**
 * A great power. Both titans get the SAME shape so the fight is even; only the
 * name, race and a deliberate asymmetry in siege doctrine differ.
 *
 * `siegeHeavy` gets the bigger battering train and thinner counters — the
 * besieger. Its opposite fields a deeper battery and taller walls — the holder.
 * That contrast is what makes the two directions of the war read differently
 * instead of producing the same report twice.
 */
function titan(id: string, name: string, race: Race, siegeHeavy: boolean): Player {
  const p = newEmpire({ id, name, race, joinedAtTick: 0, isBot: true });

  p.buildings = {
    grange: 10, sawyers_mill: 10, masons_quarry: 10, deepvein_mine: 10,
    granary: 8, timberyard: 8, masons_yard: 8, ironhold: 8, counting_house: 8,
    collegium: 9, market_square: 7,
    shadow_guild: 5, rangers_lodge: 5,
    // Room for the host below — 900 halls is 9,000 beds, and sellswords sleep
    // in them too, which is exactly the constraint a real army runs into.
    hearthstead: 700,
    muster_hall: 900,
    forge: 3, armoury: 3,
    drill_yard: 3, fletchers_range: 3, knights_stables: 3,
    war_foundry: 10,
    walls: siegeHeavy ? 7 : 9,
  };
  p.wallIntegrity = siegeHeavy ? 0.88 : 1;

  p.idlePeasants = 400;
  p.workers = {
    farmers: 900, lumberjacks: 600, quarrymen: 500,
    miners: 500, researchers: 700, merchants: 300,
  };

  p.army = {
    ...p.army,
    // Weighted toward the heavy end but present at EVERY rank, because the
    // casualty rule walks light → medium → heavy and a report with empty ranks
    // shows none of that walk.
    footmen: { light: 900, medium: 700, heavy: 500 },
    archers: { light: 700, medium: 550, heavy: 400 },
    cavalry: { light: 400, medium: 320, heavy: 240 },
    siegeEngineers: 900,
    // Sellswords at every rank — a third of the regulars there, the cap. This
    // is what makes the losses table show the hired dying first, per rank.
    mercenaries: {
      ...emptyMercForce(),
      footmen: { light: 300, medium: 233, heavy: 166 },
      archers: { light: 233, medium: 183, heavy: 133 },
      cavalry: { light: 133, medium: 106, heavy: 80 },
      engineers: 300,
      spies: 40,
      scouts: 40,
    },
    siegeGear: siegeHeavy
      ? { ropes: 40, ladders: 30, siege_towers: 18, rams: 30, ballistae: 24, trebuchets: 40 }
      : { ropes: 20, ladders: 16, siege_towers: 8, rams: 14, ballistae: 30, trebuchets: 26 },
    siegeCounters: siegeHeavy
      ? { billhooks: 14, forkpoles: 12, fire_pots: 8, boiling_oil: 10, hoardings: 10, counter_engine: 12 }
      : { billhooks: 24, forkpoles: 20, fire_pots: 14, boiling_oil: 18, hoardings: 16, counter_engine: 22 },
    siegeGearIntegrity: fullGearIntegrity(),
    siegeCounterIntegrity: fullCounterIntegrity(),
    spies: 120,
    scouts: 120,
    stamina: 100,
    // Enough that veterancy is a visible multiplier on both sides rather than
    // a rounding error — and enough that the ledger has something to LOSE.
    experiencePoints: 3_000_000, // +60%
    siegeExperiencePoints: 2_500_000, // +50%
    spyExperience: 40,
    scoutExperience: 40,
    sortieEnabled: !siegeHeavy, // the holder rides out; the besieger holds
    siegeStance: siegeHeavy ? "general" : "counter",
  };

  p.research = {
    activeField: "art_of_war",
    levels: {
      crop_rotation: 5, forestry: 4, masonry: 4, deep_smelting: 4,
      art_of_war: 4, shieldcraft: 4, siegecraft: siegeHeavy ? 5 : 3,
      medicine: siegeHeavy ? 2 : 4, statecraft: 3,
      tradecraft: 3, pathfinding: 3, free_companies: 3,
    },
    banked: {},
  };

  p.gold = 4_000_000;
  p.bankedGold = 1_200_000;
  p.resources = { food: 3_000_000, wood: 900_000, stone: 800_000, ore: 900_000 };
  p.turnsAvailable = 400;
  p.spyTurnsAvailable = 200;
  p.shieldUntilTick = 0;
  p.starving = false;
  return p;
}

async function main() {
  const out = await commitWithRetry<string>((world: World) => {
    const A = titan("bot-ironmarch", "Ironmarch", "dwarf", true);
    const B = titan("bot-sablereach", "Sablereach", "orc", false);
    world.players[A.id] = A;
    world.players[B.id] = B;

    const tick = world.meta.tickNumber;
    if (tick - world.meta.eraStartedAtTick < ERA_PEACE_TICKS) {
      world.meta.eraStartedAtTick = tick - ERA_PEACE_TICKS - 1;
    }

    const lines: string[] = [];
    const before = world.battles.length;
    const fight = (fromId: string, toId: string, mode: string) => {
      const r = applyOneCommand(world, fromId, "attack", { targetId: toId, mode });
      const b = world.battles[0];
      if (r.result.ok && b) {
        const dead = (l: { footmen: number; archers: number; cavalry: number; engineers: number; mercenaries: number }) =>
          l.footmen + l.archers + l.cavalry + l.engineers + l.mercenaries;
        lines.push(
          `  ${mode.padEnd(8)} ${b.attackerName} → ${b.defenderName}: ${b.victor} won · ` +
            `${dead(b.attackerLosses)} / ${dead(b.defenderLosses)} fell · ` +
            `wall −${Math.round(b.wallIntegrityDamage * 100)}% · /battle/${b.id}`,
        );
      } else if (!r.result.ok) {
        lines.push(`  ${mode.padEnd(8)} REFUSED: ${r.result.message}`);
      }
      // Rebuild between engagements, exactly as a real campaign would.
      //
      // Not cosmetic: the FIRST run of this script ended with both empires at
      // zero engineers and Ironmarch's entire siege train wrecked, because a
      // counter-duel grinds crews and engines every single battle. From the
      // fourth fight on, neither side could crew anything — so the engine duel,
      // the wall phase and the escalade all silently stopped happening and
      // every remaining report was a bare infantry clash ending in "aftermath".
      // A demo of the siege game has to keep the siege game supplied.
      for (const id of [fromId, toId]) {
        const p = world.players[id];
        const fresh = titan(id, p.name, p.race, id === "bot-ironmarch");
        p.turnsAvailable = 400;
        p.army.stamina = 100;
        p.shieldUntilTick = 0;
        p.starving = false;
        p.resources = { ...p.resources, food: 3_000_000 };
        p.army.siegeEngineers = fresh.army.siegeEngineers;
        p.army.mercenaries.engineers = fresh.army.mercenaries.engineers;
        p.army.siegeGear = { ...fresh.army.siegeGear };
        p.army.siegeCounters = { ...fresh.army.siegeCounters };
        p.army.siegeGearIntegrity = fullGearIntegrity();
        p.army.siegeCounterIntegrity = fullCounterIntegrity();
        p.wallIntegrity = Math.max(p.wallIntegrity, 0.85);
      }
    };

    // Softening first, then the assault, then the answer — the order a real
    // campaign runs in, and the order that makes each report show something the
    // one before it did not.
    fight(A.id, B.id, "bombard");
    fight(A.id, B.id, "raid");
    fight(A.id, B.id, "siege");
    fight(B.id, A.id, "revenge");
    fight(B.id, A.id, "siege");
    fight(B.id, A.id, "bombard");
    fight(A.id, B.id, "revenge");
    fight(A.id, B.id, "siege"); // a second assault, now that both walls are cracked

    return {
      result: [
        `Ironmarch  score ${rankingScore(world.players[A.id]).toLocaleString("en-US")}`,
        `Sablereach score ${rankingScore(world.players[B.id]).toLocaleString("en-US")}`,
        `veterancy ${(3_000_000 / EXPERIENCE.POINTS_FOR_DOUBLE * 100).toFixed(0)}% each`,
        ``,
        `${world.battles.length - before} battles fought:`,
        ...lines,
      ].join("\n"),
      dirty: true,
    };
  });
  console.log(out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
