import { describe, expect, it } from "vitest";
import {
  assignWorkers,
  bankGold,
  bankResource,
  build,
  buySiegeCounter,
  buySiegeGear,
  dischargeTroops,
  dismissMercenaries,
  hireMercenaries,
  restAffordablePoints,
  restTroops,
  setResearch,
  setTax,
  trainScouts,
  trainSiegeEngineers,
  trainSpies,
  trainTroops,
} from "./commands";
import { CIVILIAN_LEVELLED_IDS, COLLEGIUM_COST, GUILD_COST, LODGE_COST, FOUNDRY_COST, MARKET_COST, PRODUCER_COST, WARWORKS_COST, RESEARCH_FIELDS, STORAGE_COST, TURNS_PER_DAY, WALLS_COST, goldShelterAtLevel, maxLevel, shelterAtLevel, workerOutputAtLevel } from "../constants";
import { buildingCost } from "./costs";
import { newEmpire } from "./newEmpire";
import { level, mercTotal, normalizePlayer, shelterCapacity, troopTotal, type Player, type TroopType } from "./types";
import { musterVacancy } from "./commands";
import { trainingCost } from "./commands";
import { MERCENARIES, MERC_PRICE_BY_ARM, STAMINA, UNIT_STATS } from "../constants";
import { researchSwitchLoss } from "./commands";
import { processTurnTick } from "./tick";
import { RESEARCH_SWITCH_LOSS } from "../constants";

function fresh(): Player {
  return newEmpire({ id: "t", name: "Test", race: "human" });
}

describe("building costs (spec/empire.md examples)", () => {
  it("every levelled civilian building has its OWN cost block", () => {
    // The shared `BASE_COSTS.civilian × 1.5^(n−1)` ladder is gone — all thirteen
    // were priced individually in the 2026-08 pass. This is the guard that a new
    // civilian building cannot be added and silently cost nothing: if it has no
    // bespoke branch in buildingCost, it will not resolve here.
    for (const id of CIVILIAN_LEVELLED_IDS) {
      const c = buildingCost(id, 1);
      const total = c.gold + c.wood + c.stone + c.ore;
      expect(total, `${id} level 1 must cost something`).toBeGreaterThan(0);
      expect(Number.isFinite(total), `${id} produced a non-finite cost`).toBe(true);
    }
  });

  it("the four support buildings each climb at their own rate", () => {
    // Market 2.0 > Collegium 1.9 > Guild 1.8 > Lodge 1.7 — ordered by how much
    // a level actually returns, with the Lodge cheapest because scouts are the
    // only defence against spies and must stay affordable.
    const rate = (id: Parameters<typeof buildingCost>[0]) =>
      buildingCost(id, 2).gold / buildingCost(id, 1).gold;
    expect(rate("market_square")).toBeCloseTo(MARKET_COST.RATE, 4);
    expect(rate("collegium")).toBeCloseTo(COLLEGIUM_COST.RATE, 4);
    expect(rate("shadow_guild")).toBeCloseTo(GUILD_COST.RATE, 4);
    expect(rate("rangers_lodge")).toBeCloseTo(LODGE_COST.RATE, 4);
    // All four distinct, and strictly ordered.
    const rates = [MARKET_COST.RATE, COLLEGIUM_COST.RATE, GUILD_COST.RATE, LODGE_COST.RATE];
    expect(new Set(rates).size).toBe(4);
    expect([...rates].sort((a, b) => b - a)).toEqual(rates);
    // Three bases, not one. The Market and Collegium start at 4,500 goods, the
    // Lodge at 7,000 and the Guild at 9,500 — weight at the ENTRY for the covert
    // pair, because their return is flat and a steep tail would price the last
    // levels out of anyone without a dedicated covert game.
    expect(buildingCost("market_square", 1)).toEqual(buildingCost("collegium", 1));
    const goods = (id: Parameters<typeof buildingCost>[0]) => {
      const c = buildingCost(id, 1);
      return c.wood + c.stone + c.ore;
    };
    // Watching must stay affordable; going over the wall is a campaign. So the
    // Guild is dearer than the Lodge on BOTH axes — base and rate.
    expect(goods("shadow_guild")).toBeGreaterThan(goods("rangers_lodge"));
    expect(goods("rangers_lodge")).toBeGreaterThan(goods("market_square"));
    expect(GUILD_COST.RATE).toBeGreaterThan(LODGE_COST.RATE);
  });

  it("producers are priced apart, and double what a worker digs per level", () => {
    expect(buildingCost("grange", 1)).toEqual({ gold: 2000, wood: 1000, stone: 1000, ore: 200 });
    // All four share the path — a deeper mine is the same mine.
    for (const id of ["grange", "sawyers_mill", "masons_quarry", "deepvein_mine"] as const) {
      expect(buildingCost(id, 1)).toEqual(buildingCost("grange", 1));
    }
    // One flat rate, composition never shifts.
    for (let l = 2; l <= 10; l++) {
      const prev = buildingCost("grange", l - 1);
      const cur = buildingCost("grange", l);
      expect(cur.gold / prev.gold).toBeCloseTo(PRODUCER_COST.RATE, 4);
      expect(cur.ore / cur.wood).toBeCloseTo(200 / 1000, 3);
    }
    // The rate is chosen so the TOP of the ladder stays payable. Output is
    // linear, so marginal is flat at +10; the workers needed for level 10 to
    // repay itself in a day must stay inside what an empire can field (~1,400
    // per resource by day 60, harness D). At 2.0 that is 782 — at 2.5 it would
    // be 2,914 and nobody would ever finish the ladder.
    const l10 = buildingCost("grange", 10);
    const goods = l10.wood + l10.stone + l10.ore;
    const marginal = workerOutputAtLevel(10) - workerOutputAtLevel(9);
    expect(Math.round(goods / (marginal * TURNS_PER_DAY))).toBeLessThan(1000);
  });

  it("military level 1: 600g + 660 wood / 540 stone", () => {
    // The Drill Yard. The shared military ladder has been whittled down to the
    // three tiered trainers — walls, the war-works and the Engine Yard all took
    // their own cost blocks in the 2026-08 pass. This case pins the SHARED path,
    // so it needs a building actually still on it.
    expect(buildingCost("drill_yard", 1)).toEqual({ gold: 600, wood: 660, stone: 540, ore: 0 });
    for (const id of ["fletchers_range", "knights_stables"] as const) {
      expect(buildingCost(id, 1)).toEqual(buildingCost("drill_yard", 1));
    }
  });

  it("the Engine Yard is priced apart: dearest entry, softest rate", () => {
    expect(buildingCost("war_foundry", 1)).toEqual({ gold: 15000, wood: 3000, stone: 2000, ore: 3000 });
    // Softest ladder in the game — a tenth gentler than the war-works, which
    // are themselves on the Ranger's Lodge rate.
    expect(FOUNDRY_COST.RATE).toBeLessThan(WARWORKS_COST.RATE);
    for (let l = 2; l <= 10; l++) {
      expect(buildingCost("war_foundry", l).gold / buildingCost("war_foundry", l - 1).gold)
        .toBeCloseTo(FOUNDRY_COST.RATE, 4);
    }
    // Dearest ENTRY of any building — what it sells is permission, and
    // permission belongs at the bottom of the ladder.
    for (const id of CIVILIAN_LEVELLED_IDS) {
      expect(buildingCost("war_foundry", 1).gold).toBeGreaterThanOrEqual(buildingCost(id, 1).gold);
    }
  });

  it("walls are priced apart, and climb at one flat rate with no cliff", () => {
    // A Palisade is the deliberate outlier: dearer in coin than in materials
    // (GOLD_SHARE 1.25 against 0.5 everywhere else) and an even split of the two.
    expect(buildingCost("walls", 1)).toEqual({ gold: 5000, wood: 2000, stone: 2000, ore: 0 });

    // EVERY rung is the same step, and none may exceed 3×. An earlier shape
    // pivoted and steepened, which put an 8.25× cliff at levels 7–9 — a ladder
    // you could not climb, only stop at. This is the guard against that.
    const goods = (l: number) => {
      const c = buildingCost("walls", l);
      return c.wood + c.stone + c.ore;
    };
    for (let l = 2; l <= 10; l++) {
      const step = goods(l) / goods(l - 1);
      expect(step).toBeCloseTo(WALLS_COST.RATE, 2);
      expect(step).toBeLessThanOrEqual(3.001);
    }
  });

  it("walls past level 7 hold their mix: stone 2.5× wood, ore 0.5× wood", () => {
    // Ore is the war-metal — troops and siege both eat it — so the wall ladder
    // is capped rather than tilting further toward iron as it climbs.
    for (const l of [7, 8, 9, 10]) {
      const c = buildingCost("walls", l);
      expect(c.stone / c.wood).toBeCloseTo(2.5, 2);
      expect(c.ore / c.wood).toBeCloseTo(0.5, 2);
    }
  });

  it("storehouses are priced apart, climb at one rate, and reach level 12", () => {
    const c1 = buildingCost("granary", 1);
    expect(c1).toEqual({ gold: 1000, wood: 400, stone: 400, ore: 100 });
    // All five share the path — a store is a store.
    for (const id of ["granary", "timberyard", "masons_yard", "ironhold", "counting_house"] as const) {
      expect(buildingCost(id, 1)).toEqual(c1);
      expect(maxLevel(id)).toBe(12);
    }
    // Flat rate, and the composition never shifts: it is the same building, deeper.
    for (let l = 2; l <= 12; l++) {
      const prev = buildingCost("granary", l - 1);
      const cur = buildingCost("granary", l);
      expect(cur.gold / prev.gold).toBeCloseTo(STORAGE_COST.RATE, 2);
      // 3dp, not 4: costs are rounded to whole units, so the ratio drifts by a
      // fraction of a unit at the top of the ladder.
      expect(cur.ore / cur.wood).toBeCloseTo(100 / 400, 3);
    }
  });

  it("Granarycraft deepens every vault, and does nothing to anything else", () => {
    const p = fresh();
    const before = shelterCapacity(p, "granary");
    p.research.levels.granarycraft = 5;
    // +5% a level, so mastery is +25% — on all five stores, coin included.
    for (const id of ["granary", "timberyard", "masons_yard", "ironhold", "counting_house"] as const) {
      const plain = shelterAtLevel(id, level(p, id));
      expect(shelterCapacity(p, id)).toBeCloseTo(plain * 1.25, 6);
    }
    expect(shelterCapacity(p, "granary")).toBeCloseTo(before * 1.25, 6);
    // It is NOT a ranked field — what you can hoard is exactly what a raider
    // would most like to read off the ladder.
    expect(RESEARCH_FIELDS.find((f) => f.id === "granarycraft")!.ranked).toBe(false);
  });

  it("hearthstead: flat per instance, however many you already own", () => {
    // A tenth cottage is another cottage, not a grander one — no curve.
    expect(buildingCost("hearthstead", 99)).toEqual({ gold: 2000, wood: 500, stone: 500, ore: 0 });
    expect(buildingCost("hearthstead", 1)).toEqual(buildingCost("hearthstead", 240));
  });

  it("tiered level 3 uses the top band — stone-heavy, and ore enters the bill", () => {
    // The Drill Yard, not the Forge — the Forge stopped being a tiered trainer
    // when it became a ten-level war-works.
    const c = buildingCost("drill_yard", 3);
    expect(c.ore).toBeGreaterThan(0); // levels 9–10 want iron fittings too
    expect(c.stone).toBeGreaterThan(c.wood);
  });

  it("the war-works are ten levels, ore-heavy, and identically priced", () => {
    expect(buildingCost("forge", 1)).toEqual({ gold: 10000, wood: 1000, stone: 1000, ore: 3000 });
    expect(buildingCost("armoury", 1)).toEqual(buildingCost("forge", 1));
    expect(maxLevel("forge")).toBe(10);
    expect(maxLevel("armoury")).toBe(10);
    // Ore is the majority of the bill at every level — everything else in the
    // game spends timber and masonry; these two eat the war-metal.
    for (let l = 1; l <= 10; l++) {
      const c = buildingCost("forge", l);
      expect(c.ore, `level ${l}`).toBeGreaterThan(c.wood + c.stone);
      if (l > 1) {
        expect(c.gold / buildingCost("forge", l - 1).gold).toBeCloseTo(WARWORKS_COST.RATE, 4);
      }
    }
  });

  it("the Forge no longer gates troop tiers — the trainers do that alone", () => {
    const p = fresh();
    p.buildings = { ...p.buildings, muster_hall: 5, drill_yard: 3, forge: 0 };
    // Heavy footmen with a level-3 Drill Yard and NO Forge at all.
    expect(() => trainTroops(p, "footman", "heavy", 1)).not.toThrow();
    // …but the arm's own trainer still gates it.
    p.buildings.drill_yard = 2;
    expect(() => trainTroops(p, "footman", "heavy", 1)).toThrowError(/drill_yard/i);
  });
});

describe("build command", () => {
  it("pays the cost and raises the level", () => {
    const { player, events } = build(fresh(), "grange");
    expect(player.buildings.grange).toBe(1);
    expect(player.gold).toBe(5000 - 2000);
    // A first Grange now takes the ENTIRE starting woodpile and quarry — the
    // opening is one producer and then a trip to the Black Market. That is the
    // deliberate consequence of PRODUCER_COST; if it ever wants softening, the
    // lever is START.RESOURCES_EACH, not the producer price.
    expect(player.resources.wood).toBe(0);
    expect(player.resources.stone).toBe(0);
    expect(events).toContainEqual({ type: "buildComplete", building: "grange", level: 1 });
  });

  it("rejects when resources are short", () => {
    const p = fresh();
    p.resources.wood = 100;
    expect(() => build(p, "grange")).toThrowError(/wood/i);
  });

  it("the starting purse is wood-bound — timber is the early bottleneck", () => {
    let p = fresh();
    p = build(p, "grange").player;
    // Timber is the early bottleneck now: the second build already outruns the
    // starting woodpile, so the first thing a new realm must do is cut trees.
    expect(() => build(p, "sawyers_mill")).toThrowError(/wood/i);
  });
});

describe("training & army", () => {
  it("fresh empire's Muster Halls are exactly full — training throws", () => {
    expect(() => trainTroops(fresh(), "footman", "light", 1)).toThrowError(/muster/i);
  });

  it("training goes peasant → footman directly (no warrior step); needs the trainer", () => {
    let p = fresh();
    p = build(p, "muster_hall").player; // 3rd hall → 30 slots, 20 used → 10 free
    expect(() => trainTroops(p, "footman", "light", 5)).toThrowError(/drill_yard/i);
    p.buildings.drill_yard = 1;
    const { player } = trainTroops(p, "footman", "light", 5);
    expect(player.army.footmen.light).toBe(25); // 20 starter + 5
    expect(player.idlePeasants).toBe(75); // peasants spent directly
  });

  it("light footman folds the muster levy into its gold cost (100g)", () => {
    const p = fresh();
    p.buildings = { ...p.buildings, muster_hall: 5, drill_yard: 1, forge: 1 };
    const before = p.gold;
    const { player } = trainTroops(p, "footman", "light", 1);
    expect(before - player.gold).toBe(100); // the cheapest power in the game
  });

  it("medium tier costs ×2 and needs level 2", () => {
    const p = fresh();
    p.buildings = { ...p.buildings, muster_hall: 5, drill_yard: 2, forge: 2 };
    const before = p.gold;
    const { player } = trainTroops(p, "footman", "medium", 1);
    expect(before - player.gold).toBe(200); // 100 × 2
  });

  it("discharge sends troops home directly (gear lost)", () => {
    const p = fresh();
    const { player } = dischargeTroops(p, "footman", "light", 10);
    expect(player.army.footmen.light).toBe(10);
    expect(player.idlePeasants).toBe(90); // straight back to civilian life
  });

  it("mercenaries are typed, building-gated, and capped against their own arm", () => {
    const p = fresh();
    p.gold = 100000;
    p.buildings = { ...p.buildings, drill_yard: 1, forge: 1 };
    // Sellswords need beds like anyone else — hiring skips population and
    // training time, not quartering.
    expect(() => hireMercenaries(p, "footman", "light", 1)).toThrowError(/barracks/i);
    p.buildings.muster_hall = 5; // 50 beds against 20 regulars
    // Derived, never written by hand: CAP_RATIO has already moved once (a third
    // of the regulars, then 30% of the whole host), and a literal here failed
    // for a reason that had nothing to do with hiring.
    const cap = Math.floor(troopTotal(p.army.footmen) * MERCENARIES.CAP_RATIO);
    expect(() => hireMercenaries(p, "footman", "light", cap + 1)).toThrowError(/capped|third/i);
    const { player } = hireMercenaries(p, "footman", "light", cap);
    expect(player.army.mercenaries.footmen.light).toBe(cap);
    // Read from the constant, not written by hand — this figure moved once
    // already when the line troops were repriced and the mercs were not.
    expect(player.gold).toBe(100000 - cap * MERC_PRICE_BY_ARM.footman);
  });

  it("hiring a merc tier needs the matching trainer + Forge", () => {
    const p = fresh();
    p.gold = 100000;
    expect(() => hireMercenaries(p, "cavalry", "heavy", 1)).toThrowError(/knights_stables/i);
  });

  it("dismissing sellswords frees the bed and refunds nothing", () => {
    let p = fresh();
    p.gold = 100_000;
    p.buildings.muster_hall = 5;
    p.buildings.drill_yard = 1; // light footmen need their trainer, hired or not
    p = hireMercenaries(p, "footman", "light", 6).player;
    const goldAfterHiring = p.gold;
    const bedsBefore = musterVacancy(p);

    p = dismissMercenaries(p, "footman", "light", 4).player;
    expect(p.army.mercenaries.footmen.light).toBe(2);
    expect(p.gold).toBe(goldAfterHiring); // NO REFUND — the whole point
    expect(musterVacancy(p)).toBe(bedsBefore + 4); // the beds are what you get
    // They never earned veterancy, so sending them off never spends any.
    expect(p.army.experiencePoints).toBe(0);
  });

  it("dismissing rejects more sellswords than are serving at that rank", () => {
    let p = fresh();
    p.gold = 100_000;
    p.buildings.muster_hall = 5;
    p.buildings.drill_yard = 1; // light footmen need their trainer, hired or not
    p = hireMercenaries(p, "footman", "light", 6).player;
    // Right arm, wrong RANK — the six hired are light, not heavy.
    expect(() => dismissMercenaries(p, "footman", "heavy", 1)).toThrowError(/not that many/i);
    expect(() => dismissMercenaries(p, "footman", "light", 7)).toThrowError(/not that many/i);
    expect(() => dismissMercenaries(p, "footman", "light", 0)).toThrowError(/count/i);
  });

  it("normalizePlayer fills in every field the engine assumes", () => {
    // The combat rework shipped with a world wipe, so this no longer migrates
    // legacy shapes — it exists so bots, fixtures and hand-built test players
    // get sane defaults without every call site listing them.
    const p = fresh();
    delete (p.army as Partial<typeof p.army>).siegeGearIntegrity;
    delete (p.army as Partial<typeof p.army>).siegeCounterIntegrity;
    (p.army.mercenaries as Partial<typeof p.army.mercenaries>).engineers = undefined;
    normalizePlayer(p);
    expect(p.army.siegeGearIntegrity.trebuchets).toBe(1);
    expect(p.army.siegeCounterIntegrity.counter_engine).toBe(1);
    expect(p.army.mercenaries.engineers).toBe(0);
    expect(p.army.siegeExperiencePoints).toBe(0);
    expect(p.spyTurnsAvailable).toBeGreaterThanOrEqual(0);
    // idempotent — a second pass is a no-op
    normalizePlayer(p);
    expect(p.army.siegeGearIntegrity.trebuchets).toBe(1);
  });

  // Was "rest costs 5 turns + 0.2 food per troop, +20 stamina". Rest is now
  // bought by the point with food alone — no action turns at all.
  it("rest costs food per point per troop and no action turns", () => {
    const p = fresh();
    p.army.stamina = 60;
    p.resources.food = 100_000;
    const before = p.turnsAvailable;
    const { player } = restTroops(p, 5);
    expect(player.turnsAvailable).toBe(before);
    expect(player.army.stamina).toBe(65);
    expect(player.resources.food).toBe(100_000 - STAMINA.REST_FOOD_PER_POINT_PER_TROOP * 20 * 5);
  });

  it("rest bills only the points it could actually give", () => {
    const p = fresh();
    p.army.stamina = STAMINA.MAX - 2;
    p.resources.food = 100_000;
    // Asked for 50, only 2 were missing: pay for 2.
    const { player } = restTroops(p, 50);
    expect(player.army.stamina).toBe(STAMINA.MAX);
    expect(player.resources.food).toBe(100_000 - STAMINA.REST_FOOD_PER_POINT_PER_TROOP * 20 * 2);
  });

  it("rest refuses a full army and a starving one", () => {
    const full = fresh();
    full.army.stamina = STAMINA.MAX;
    expect(() => restTroops(full, 1)).toThrow();
    const hungry = fresh();
    hungry.army.stamina = 10;
    hungry.starving = true;
    expect(() => restTroops(hungry, 1)).toThrow();
  });

  it("restAffordablePoints is capped by food and by the gap to full", () => {
    const p = fresh();
    p.army.stamina = 90;
    // Food for exactly 3 points of a 20-strong army.
    p.resources.food = STAMINA.REST_FOOD_PER_POINT_PER_TROOP * 20 * 3;
    expect(restAffordablePoints(p)).toBe(3);
    p.resources.food = 10_000_000;
    expect(restAffordablePoints(p)).toBe(10); // the gap, not the purse
  });
});

describe("research", () => {
  it("switching to a new field halves the current field's banked progress", () => {
    const p = fresh();
    p.research.activeField = "art_of_war";
    p.research.banked.art_of_war = 400; // 40% toward a 1,000 next level, say
    const after = setResearch(p, "shieldcraft").player;
    expect(after.research.activeField).toBe("shieldcraft");
    expect(after.research.banked.art_of_war).toBe(200); // 40% → 20%
    expect(after.research.banked.shieldcraft ?? 0).toBe(0); // the new field is untouched
  });

  it("re-selecting the same field costs no progress", () => {
    const p = fresh();
    p.research.activeField = "art_of_war";
    p.research.banked.art_of_war = 400;
    const after = setResearch(p, "art_of_war").player;
    expect(after.research.banked.art_of_war).toBe(400);
  });
});

describe("economy commands", () => {
  it("tax rate is clamped to [0, 1]", () => {
    expect(() => setTax(fresh(), 1.5)).toThrow();
    expect(setTax(fresh(), 0.75).player.taxRate).toBe(0.75);
  });

  it("all workers are uncapped — you only need the building (no slot limits)", () => {
    const p = fresh();
    p.idlePeasants = 500;
    expect(() => assignWorkers(p, "farmers", 5)).toThrowError(/build the grange/i); // no Grange
    p.buildings.grange = 1;
    const farmed = assignWorkers(p, "farmers", 200).player; // no slot cap — 200 > any slot count
    expect(farmed.workers.farmers).toBe(200);
    // Merchants and researchers are uncapped too — just need their hall.
    farmed.buildings.market_square = 1;
    const merch = assignWorkers(farmed, "merchants", 100).player;
    expect(merch.workers.merchants).toBe(100);
  });

  it("banking respects Counting House capacity", () => {
    const p = fresh(); // starts with Counting House 1
    // Read from the curve, not written by hand: the vault's size has moved
    // twice and a hardcoded boundary silently stops testing the boundary.
    const cap = goldShelterAtLevel(1);
    p.bankedGold = cap - 500;
    expect(() => bankGold(p, 1000)).toThrowError(/full/i); // would breach the cap
    p.bankedGold = 0;
    const { player } = bankGold(p, 3000);
    expect(player.bankedGold).toBe(3000);
    expect(player.gold).toBe(2000);
    const back = bankGold(player, -3000).player;
    expect(back.gold).toBe(5000);
  });

  it("vaults and withdraws goods within the store's capacity", () => {
    const p = fresh(); // granary 1 → 20k food capacity
    const { player } = bankResource(p, "food", 800);
    expect(player.resources.food).toBe(200);
    expect(player.bankedResources!.food).toBe(800);
    const back = bankResource(player, "food", -300).player;
    expect(back.resources.food).toBe(500);
    expect(back.bankedResources!.food).toBe(500);
    expect(() => bankResource(back, "food", -600)).toThrowError(/vaulted/i);
    const full = fresh();
    full.resources.food = 1000;
    full.bankedResources = { food: 19900, wood: 0, stone: 0, ore: 0 };
    expect(() => bankResource(full, "food", 200)).toThrowError(/full/i);
  });
});

describe("Scholarship", () => {
  it("lifts every scholar by 20% a level", () => {
    const p = fresh();
    p.buildings = { ...p.buildings, collegium: 1 };
    p.workers.researchers = 100;
    p.idlePeasants = 0;
    p.research.activeField = "masonry";
    const banked = (lvl: number) => {
      const q: Player = structuredClone(p);
      q.research.levels.scholarship = lvl;
      return processTurnTick(q).player.research.banked.masonry ?? 0;
    };
    // 100 scholars × (10 RP × L1 × 0.5 tax) = 500 RP with no Scholarship.
    expect(banked(0)).toBe(500);
    expect(banked(1)).toBe(600); // ×1.2
    expect(banked(5)).toBe(1000); // ×2.00 at mastery
  });

  it("buys the switch penalty down to nothing", () => {
    const p = fresh();
    p.research.activeField = "masonry";
    p.research.banked.masonry = 1000;
    const after = (lvl: number) => {
      const q: Player = structuredClone(p);
      q.research.levels.scholarship = lvl;
      return setResearch(q, "forestry").player.research.banked.masonry;
    };
    expect(researchSwitchLoss(fresh())).toBe(RESEARCH_SWITCH_LOSS);
    expect(after(0)).toBe(500); // half abandoned
    expect(after(2)).toBe(700); // 30% lost
    expect(after(5)).toBe(1000); // mastery: a free hand
  });

  it("re-selecting the same field is free, Scholarship or not", () => {
    const p = fresh();
    p.research.activeField = "masonry";
    p.research.banked.masonry = 1000;
    expect(setResearch(p, "masonry").player.research.banked.masonry).toBe(1000);
  });
});

describe("training costs", () => {
  it("scales ×1 / ×2 / ×4 by tier where nothing overrides it", () => {
    const p = fresh();
    // The footman is the plain case — every line scales.
    const l = trainingCost(p, "footman", "light");
    for (const [tier, m] of [["medium", 2], ["heavy", 4]] as const) {
      const c = trainingCost(p, "footman", tier);
      expect(c.gold).toBe(l.gold * m);
      expect(c.wood).toBe(l.wood * m);
      expect(c.ore).toBe(l.ore * m);
    }
    // An override cannot leak into a resource it did not name. Cavalry name gold
    // and timber at medium but NOT ore, so ore still scales cleanly there…
    expect(trainingCost(p, "cavalry", "medium").ore).toBe(trainingCost(p, "cavalry", "light").ore * 2);
    // …and the archer, which names only timber, keeps a clean ×4 on its ore.
    expect(trainingCost(p, "archer", "heavy").ore).toBe(trainingCost(p, "archer", "light").ore * 4);
    // Both named timber lines do break the pattern, in opposite directions.
    expect(trainingCost(p, "archer", "heavy").wood).toBeGreaterThan(trainingCost(p, "archer", "light").wood * 4);
    expect(trainingCost(p, "cavalry", "heavy").wood).toBeLessThan(trainingCost(p, "cavalry", "light").wood * 4);
  });

  it("gives the named lines their per-tier figures outright", () => {
    const p = fresh();
    // Archer timber: 50 / 110 / 250, not 50 / 100 / 200 — a heavier bow is not
    // four bows' worth of stave.
    expect([1, 2, 3].map((_, i) => trainingCost(p, "archer", (["light", "medium", "heavy"] as const)[i]).wood))
      .toEqual([50, 110, 250]);
    // …while its gold still scales cleanly, so only the named line escapes.
    expect(trainingCost(p, "archer", "heavy").gold).toBe(trainingCost(p, "archer", "light").gold * 4);

    // Cavalry: EVERY line is discounted at the heavy tier — the only arm whose
    // top tier costs less than ×4 on all three, which is what keeps them a
    // premium rather than a luxury.
    expect((["light", "medium", "heavy"] as const).map((t) => trainingCost(p, "cavalry", t).gold))
      .toEqual([240, 440, 840]);
    expect((["light", "medium", "heavy"] as const).map((t) => trainingCost(p, "cavalry", t).ore))
      .toEqual([100, 200, 350]);
    expect((["light", "medium", "heavy"] as const).map((t) => trainingCost(p, "cavalry", t).wood))
      .toEqual([30, 50, 100]);
    expect(trainingCost(p, "cavalry", "heavy").ore).toBeLessThan(100 * 4);
  });

  it("keeps the footman the cheapest to raise, and cavalry the dearest", () => {
    const p = fresh();
    const gold = (arm: TroopType) => trainingCost(p, arm, "light").gold;
    expect(gold("footman")).toBeLessThan(gold("archer"));
    expect(gold("archer")).toBeLessThan(gold("cavalry"));
  });

  it("prices the foot and the bow within a whisker per point of power", () => {
    // NOT an accident, and worth pinning: the footman and archer are meant to be
    // a real choice rather than one being the efficient pick. They sit ~3% apart
    // per point of power, so what separates them is SHAPE — the archer's
    // fragility and its wall penalty against the footman's health.
    const p = fresh();
    const perPower = (arm: TroopType) =>
      trainingCost(p, arm, "light").gold / UNIT_STATS[arm].light.power;
    const foot = perPower("footman");
    expect(Math.abs(foot - perPower("archer")) / foot).toBeLessThan(0.1);
    // Cavalry stay the dearest power in the game, but the margin is now ~1.8×
    // rather than the ~2.5× it was before the price cut — deliberately closer.
    expect(perPower("cavalry")).toBeGreaterThan(foot * 1.5);
    expect(perPower("cavalry")).toBeLessThan(foot * 2.2);
  });

  it("no troop costs stone — quarries feed masonry, forges feed war", () => {
    const p = fresh();
    for (const arm of ["footman", "archer", "cavalry"] as const)
      for (const t of ["light", "medium", "heavy"] as const)
        expect(trainingCost(p, arm, t).stone, `${arm} ${t}`).toBe(0);
  });
});

describe("how many of your own may be something other than farmer or soldier", () => {
  /** `people` is the whole realm — peasants and the levy both count. */
  const realm = (people: number, engineers = 0) => {
    const p = newEmpire({ id: "c", name: "Caps", race: "human" });
    p.army.footmen = { light: 0, medium: 0, heavy: 0 };
    p.army.siegeEngineers = engineers;
    p.idlePeasants = Math.max(0, people - engineers);
    p.gold = 50_000_000;
    p.bankedGold = 0;
    p.resources = { food: 9e6, wood: 9e6, stone: 9e6, ore: 9e6 };
    p.buildings = {
      ...p.buildings,
      shadow_guild: 5, rangers_lodge: 5, war_foundry: 10, muster_hall: 900,
    };
    return p;
  };

  it("caps each shadow arm at a share of the WHOLE PEOPLE", () => {
    const p = realm(1_000);
    expect(() => trainSpies(p, 51)).toThrow(/only carry/i);
    expect(trainSpies(p, 50).player.army.spies).toBe(50);
  });

  it("…so the ceiling rises with the realm", () => {
    expect(trainScouts(realm(4_000), 200).player.army.scouts).toBe(200);
    expect(() => trainScouts(realm(1_000), 200)).toThrow(/only carry/i);
  });

  it("holds both arms together to a tighter line than either alone", () => {
    const p = trainSpies(realm(1_000), 50).player;
    // 50 knives already stand; the combined ceiling is 100, so 50 rangers fit
    // and not one more.
    expect(trainScouts(p, 50).player.army.scouts).toBe(50);
    expect(() => trainScouts(p, 51)).toThrow(/only carry/i);
  });

  it("gives engine crews twice the room — a siege park is the larger undertaking", () => {
    const p = realm(1_000);
    expect(trainSiegeEngineers(p, 100).player.army.siegeEngineers).toBe(100);
    expect(() => trainSiegeEngineers(p, 101)).toThrow(/only carry/i);
  });

  it("bounds YOUR OWN only — hired knives sit on top of the ceiling", () => {
    const p = trainSpies(realm(1_000), 50).player;
    p.gold = 50_000_000;
    // At the cap for regulars, and sellswords may still be taken on beside them
    // under the ordinary hire ratio.
    expect(() => trainSpies(p, 1)).toThrow(/only carry/i);
    const hired = hireMercenaries(p, "spy", "light", 10).player;
    expect(hired.army.mercenaries.spies).toBe(10);
    expect(hired.army.spies).toBe(50);
  });

  it("refuses engines nobody could crew — the yard is not a bank", () => {
    // Ten engineers crew two trebuchets (5 apiece), so the yard holds four.
    const p = realm(1_000, 10);
    expect(buySiegeGear(p, "trebuchets", 4).player.army.siegeGear.trebuchets).toBe(4);
    expect(() => buySiegeGear(p, "trebuchets", 5)).toThrow(/can only keep/i);
  });

  it("counts the battery apart from the train, so neither stables the other's surplus", () => {
    const p = realm(1_000, 10);
    // The offensive yard being full says nothing about the defensive one.
    const withGear = buySiegeGear(p, "trebuchets", 4).player;
    expect(buySiegeCounter(withGear, "counter_engine", 4).player.army.siegeCounters.counter_engine).toBe(4);
    expect(() => buySiegeCounter(withGear, "counter_engine", 5)).toThrow(/can only keep/i);
  });
});
