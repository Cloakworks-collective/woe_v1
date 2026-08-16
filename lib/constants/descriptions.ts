// Human-readable explanations surfaced as tooltips across the UI. Written in
// plain English with a little game flair — no bare acronyms.

import type { BuildingId } from "./buildings";
import type { ResearchField } from "./research";
import {
  EFFECT_PER_LEVEL,
  KINGS_ROADS,
  MARKET_FEE,
  MEDICINE,
  MARKET_RECALL_LOSS,
  MAX_FIELD_LEVEL,
  MERCHANTS_CHARTER,
  RESEARCH_EFFECT_PER_LEVEL,
  SCHOLARSHIP,
} from "./balance";

/** Whole-percent helper for the copy below — every figure here is interpolated
 *  from the constant that governs it, so a retune moves the words with it. */
const pct = (n: number) => `${Math.round(n * 100)}%`;

export const UNIT_INFO: Record<string, { title: string; tip: string }> = {
  footman: {
    title: "Footman",
    tip: "Sword-and-shield infantry — the dependable backbone of any army. Balanced in attack and defence, they clash last in the melee. Cheap, sturdy, and quick to replace; a wall of footmen wins most fair fights.",
  },
  archer: {
    title: "Archer",
    tip: "Bowmen who loose their volleys before the melee, spreading damage across the whole enemy line. They hit hard but crumple if reached, so shelter them behind footmen and cavalry.",
  },
  cavalry: {
    title: "Cavalry",
    tip: "Mounted shock troops that charge early, riding down enemy cavalry then footmen. They deal the most damage per soldier of any unit — but the horse is the gold, so a cavalry army is an expensive one.",
  },
  spy: {
    title: "Spy",
    tip: "Cloak-and-dagger agents run from the Shadow Guild: steal an enemy's ledger, sabotage their siege engines, torch their stores, or stir up unrest. Send more for a bigger blow — but caught spies are executed, a permanent loss of population, and they name you to your victim.",
  },
  scout: {
    title: "Scout",
    tip: "The eyes of the realm. Abroad they gather rough intel on rivals from beyond the walls; at home they hunt infiltrators. Interception is decided purely by weight of numbers — your rangers' power against the spies sent — so there is no operation too deep for them to catch, and a realm with NO rangers is robbed at will. Your Ranger's Lodge level is what unlocks the scout operations you can run abroad.",
  },
  engineer: {
    title: "Siege Engineer",
    tip: "The crews that work your war machines — a trebuchet without engineers is just firewood. They carry no weapon of their own (almost helpless in a fight) and are trained at the Siege Works. The heaviest engines are crewed first.",
  },
  mercenary: {
    title: "Mercenary",
    tip: "Rented sellswords — hired in the same arms and tiers as your own troops (a heavy-cavalry sellsword needs Knights' Stables 3 + Forge 3, just like the real thing). They cost only gold and no peasants, and take the first 70% of any blow that lands on their own arm AND their own rank — a bought shield, but one that covers only the tier it stands in. Damage walks light → medium → heavy, so hired light footmen do nothing whatever for your heavy ones: match the tier, not just the arm. They draw NO wage — hiring is a one-time price and the contract is bought outright — but they need barracks beds like anyone else, and are capped against your OWN troops of that same arm. Lose those regulars and the sellswords who can no longer be commanded are paid off and ride away, so killing your regulars costs an enemy more than the bodies.",
  },
};

export const TIER_INFO: Record<string, string> = {
  light: "Light gear — the starter kit: cheapest to make, one point of power. Every troop begins here.",
  medium: "Medium gear — twice the cost of light for roughly one-and-three-quarters the fighting power. Needs its trainer and the Forge at level two.",
  heavy: "Heavy gear — four times the cost of light for about three times the power. One heavy soldier fights like three lights yet still fills a single barracks bed, so heavy armies pack more punch into the same space. Needs its trainer and the Forge at level three.",
};

export const ATTACK_MODE_INFO: Record<string, { title: string; tip: string }> = {
  raid: {
    title: "Raid",
    tip: "A lightning strike in the open field — no walls, no siege engines, just army against army. The victor carts off a quarter of whatever the enemy left lying outside their storehouses (never gold). Fast, cheap, and the everyday way to bleed a rival.",
  },
  siege: {
    title: "Castle Attack (Siege)",
    tip: "The full assault: the engine duel, then the walls, then one exchange down the line — archers, cavalry, footmen, and the ram crews joining once the gate gives. Whoever lost the smaller share of the health they marched in with carries the field. Win and you plunder their unbanked gold plus everything spilling out of their stores, including goods a bombardment cracked loose. This is how you take real wealth.",
  },
  revenge: {
    title: "Revenge",
    tip: "A grudge-strike, open only for 18 hours after someone hits you. It ignores their exhaustion and the 'too strong to attack' rule — and, alone among attacks, it gives them no chance to yield. The payment is dead soldiers, and killing their regulars is the worst wound you can deal, dragging their ranking down for days.",
  },
  bombard: {
    title: "Bombard",
    tip: "A pure artillery duel — your trebuchets against their Counter-Engine, no soldiers involved, so nobody is stripped afterwards. One exchange like any attack, but it lands with five times the weight. It pounds the walls until they crack and then the fire spills onto random buildings — storehouses (their goods tumble outside), workshops (production slows), even the Collegium (research crawls); you can choose whether to answer their battery first, but you cannot pick which building burns. The softening blow before a Castle Attack.",
  },
};

export const ACTION_INFO: Record<string, string> = {
  tax: "The tax dial, from 0% to 100%. Crank it up and gold pours in while your workers down tools; ease it off and production surges while the treasury dries up. 50% is the balanced middle — high tax is a war chest, low tax is a rebuilding sprint.",
  vacation:
    "Step away from the age entirely and become untouchable — no attack, no revenge, no ranger, no spy reaches you — a shelter for when you're outmatched, not a habit. This is not the same as yielding a battle: a yield is decided for you on the field when you're outmatched, and costs you your stores. Vacation is a standing choice, and the cost is steep: you cannot attack, your tax halves, and your production falls to a fifth. Research is the softer cut — scholars keep working at 30%, and they'll keep at it the whole time you're away so long as there's food on the table (a starving empire studies nothing). Recruitment doesn't drop at all: settlers arrive at the full rate, but only into beds standing empty, so raise extra Hearthsteads before you go or your town fills up and the intake stops. You may spend at most 20 days on vacation per era, total. You cannot depart while a revenge hangs over you — it queues instead, taking effect once every revenge window against you has closed. Come home whenever you like: an absence of 6 hours or more earns a 1-hour shield on your return (a shorter hop earns nothing), and either way your army musters slowly — no fresh attacks for 18 hours, revenge excepted, so you can't duck a siege and immediately swing back.",
  bank: "Shelter gold and goods in the Counting House and storehouses. Each “Store all” button vaults the most it can hold — safe from raiders and spies. Loose stock left in the open is theirs to take. A bombarded store shelters less (capacity × its integrity) and its overflow spills back out.",
  rest: "Stand the army down to recover. It costs NO action turns — only food, and you buy it by the point: 10 food per point for every regular and engineer you feed, so a hungry realm rests a small army and a rich one rests a large. Take a single point to cross a threshold, five to shake off a raid, or fill to 100 in one order. Tired troops swing weaker and guard worse, so rest before a hard fight — but a starving empire cannot rest at all.",
  trainTroops: "Raise idle peasants straight into footmen, archers, or cavalry at the tier you choose — no warrior middle step. Tier needs the matching trainer AND a Forge at that same level, plus a free Muster Hall bed. Instant.",
  discharge: "Send a soldier back to peaceful civilian life — their gear is lost, and it only works if a Hearthstead bed stands empty and you'd stay above the 30% guard line. No spare housing, no discharge.",
  hireMercs: "Hire sellswords from the Black Market in the arms and tiers you can already field (they need the same trainer + Forge as your regulars). Gold only, no peasants, and no ongoing wage — one price and they are yours. They shield the matching regulars by dying first, and are capped against your regular army of that arm.",
  train: "Turn idle peasants into this role. It happens instantly — the only limits are your gold and a free slot in the right building.",
  assign: "Put idle peasants to work in a trade (or type a negative number to call them home). Free and reversible, but every building holds only 20 workers per level.",
  buildQueue: "Hand this to the Steward (a Royal Charter perk): it will be raised automatically the very moment your treasury can afford it, even while you sleep.",
  repair: "Pay half of the damage in the building's own materials to mend it back to full — restoring its full storage shelter, production, or research along with it.",
  clanBombard:
    "War only: wheel your trebuchets against an enemy clan's works — the Storage (its shelter shrinks, goods spill), the Hall (its tax shelter weakens), or the Wonder (its war-cost discount fades). Costs 10 turns and crewed trebuchets, and cracks integrity toward a 50% floor. The price: the whole enemy clan earns a single revenge strike back at you — any of their members may deliver it within 18 hours.",
  clanAlliance:
    "An alliance between two banners — offered by a Leader or Vice, sealed when the other clan's Leader or Vice accepts, and endable by either side at any time with no cooldown. Allies share online status and last-attacked times, which is the real value: you can see when a friend is offline or has an open revenge window. It does NOT stop your members attacking theirs. Striking an ally is treachery — the pact breaks on both sides the instant the blow lands, and the world chronicle records who did it for the rest of the age. If you mean to fight them, end the alliance first: same fight, no stain on your name. You cannot ally with a clan you are at war with.",
  clanRepair:
    "Mend a bombarded clan work back to full integrity, restoring its shelter, tax relief, or war discount. Paid from the clan pool — half the current level's build cost, scaled by how badly it's cracked. Any leadership seat may order it.",
  clanSetRole:
    "The Leader appoints the roster: one Vice-Leader and up to three Officers. Vice may declare war and build; Officers may build and bombard-lead. Demote anyone back to the ranks at will.",
  clanKick:
    "Remove a member ranked below you from the clan. Like leaving, it forfeits their deposited resources (they stay in the pool), starts their 48-hour cooldown, and counts toward their per-era departure limit.",
  clanTransferLead:
    "Pass the leadership to another member. You step down to a plain member — the new leader may re-appoint you. Do this before you leave, since a leader can't abandon a clan that still has members.",
};

/** Clan works — what each building is, what it grants now, and what the next
 *  level buys. `effect(clan)` and `next(clan)` are filled by the page. */
export const CLAN_BUILDING_INFO: Record<"storage" | "hall" | "wonder" | "beacon", { title: string; icon: string; tip: string }> = {
  storage: {
    title: "Clan Storage",
    icon: "🏦",
    tip: "The shared vault. Each level adds 250,000 capacity per resource to the pool that members deposit into and draw from (under the 3× rule). A bombarded Storage shelters less — capacity scales with its integrity, and the overflow spills out where raiders can reach it. Storage also gates the Wonder (levels 4 / 7 / 10 unlock Wonder 1 / 2 / 3).",
  },
  hall: {
    title: "Clan Hall",
    icon: "🏛️",
    tip: "The seat of the clan. Its level raises the member cap (5 → 10 → 15 → 20) and softens the tax penalty every member feels while clanned — from full at Hall 1 down to half at Hall 4, so members keep more of their gold. A cracked Hall shelters less until repaired.",
  },
  beacon: {
    title: "Clan Beacon",
    icon: "🔥",
    tip: "The watchfires that warn the clan a war has begun. A declared war does not turn lethal at once: for a grace period, blows between the two clans still land at PEACETIME rates — normal damage, normal loot. Every clan gets 6 hours; the Beacon buys 12 / 18 / 24. The grace protects YOUR members and is measured from the declaration, so a clan whose Beacon burns higher than its enemy's can strike at full war rates while blows against it are still landing soft. It is not a shield — it is the drum you beat first.",
  },
  wonder: {
    title: "Clan Wonder",
    icon: "🗿",
    tip: "A great monument that discounts war for the whole clan — every member pays 10% less per Wonder level on mercenaries, troops, and siege gear. Requires deep Storage to raise (level 4 / 7 / 10). Worth the most on the clan score. A bombarded Wonder gives a shallower discount until mended.",
  },
};

export const BUILDING_INFO: Record<BuildingId, { title: string; tip: string }> = {
  grange: { title: "The Grange", tip: "Farmland and granaries where your farmers grow the empire's food. You can put ANY number of farmers to work — each level of the Grange lifts how much every one of them produces (5/turn at level 1 up to 50 at level 10, before tax). Food is life: run out and everything freezes." },
  masons_quarry: { title: "Mason's Quarry", tip: "The stone pit that feeds every wall and heavy building. Quarrymen are unlimited; each Quarry level raises every quarryman's output (50→500/turn). Stone is the backbone of the late game." },
  deepvein_mine: { title: "Deepvein Mine", tip: "Shafts sunk after ore and metal — the stuff of weapons, armour, and siege engines. Miners are unlimited; each Mine level raises every miner's output (50→500/turn)." },
  sawyers_mill: { title: "Sawyer's Mill", tip: "The lumber yard where woodlots become planks, arrows, and scaffolding. Lumberjacks are unlimited; each Mill level raises every lumberjack's output (50→500/turn); wood never goes out of demand." },
  granary: { title: "Granary", tip: "Guarded food stores. Every level shelters another 20,000 food from raiders — anything above that shelter sits in the open, ready to be looted or burned." },
  timberyard: { title: "Timberyard", tip: "Guarded wood stores. Every level shelters another 20,000 wood from plunder; the overflow is fair game for raiders." },
  masons_yard: { title: "Mason's Yard", tip: "Guarded stone stores. Every level shelters another 20,000 stone from plunder; the overflow is fair game for raiders." },
  ironhold: { title: "Ironhold", tip: "Guarded ore stores. Every level shelters another 20,000 ore from plunder; the overflow is fair game for raiders." },
  counting_house: { title: "Counting House", tip: "The gold vault. Every level keeps another 20,000 gold safe from a castle attack — loose gold on the table is stolen, so bank what you can't afford to lose." },
  market_square: { title: "Market Square", tip: "Your gateway to the Grand Bazaar. Merchants are unlimited — each level lets every caravan haul another 1,000 goods, and speeds the road to market: a caravan takes 100 turns to arrive at level 1, just 10 at level 10. A cracked market keeps its road but loses its loading yard, so every caravan carries proportionally less until it is mended." },
  collegium: { title: "The Collegium", tip: "The great library and workshops of learning. Scholars are unlimited — each Collegium level lifts how much research every one of them produces per turn (50 at L1 up to 500 at L10). A cracked Collegium slows every discovery." },
  shadow_guild: { title: "Shadow Guild", tip: "The den where spies are trained and sent into the dark. Spies are unlimited — each Shadow Guild level makes every mission bite deeper." },
  rangers_lodge: { title: "Ranger's Lodge", tip: "Home of your scouts. Scouts are unlimited — each Ranger's Lodge level sharpens their recon and, just as importantly, lets them catch higher-level enemy spies. A low Lodge is simply blind to clever infiltrators." },
  hearthstead: { title: "Hearthstead", tip: "Homes for your people — each one houses 10 souls. Settlers arrive every dawn and walk straight past if no bed is free, so always build a little ahead of the crowd. Trebuchets can burn them: nobody already under a roof is turned out, but every ruined cottage is a bed the next dawn's settlers will not find, and growth stops dead until you mend them." },
  muster_hall: { title: "Muster Hall", tip: "Barracks that quarter your soldiers — 10 troops each. No free bunk, no new troop, no matter how much gold you have. Build them before the war, not during it. Trebuchets can burn them, and a burnt hall costs you the bunks but never the garrison: your army stands, you simply cannot raise another until the roofs are back on." },
  drill_yard: { title: "Drill Yard", tip: "Where footmen are trained. Its level (1–3) sets how heavy your footmen can be armed: light, then medium, then heavy." },
  fletchers_range: { title: "Fletcher's Range", tip: "Where archers are trained. Its level (1–3) sets how heavy your archers can be armed: light, then medium, then heavy." },
  knights_stables: { title: "Knights' Stables", tip: "Where cavalry are raised. Its level (1–3) sets how heavy your riders can be armed: light, then medium, then heavy." },
  forge: { title: "The Forge", tip: "Sharper steel for everyone under your banner. Every level adds 5% to the attack of every REGULAR you field — footmen, archers and cavalry alike — up to +50% at level 10. Sellswords bring their own steel and draw nothing from it. It no longer gates troop tiers; the three trainers do that on their own now. Hungry for ore, which your soldiers and siege engines also want." },
  armoury: { title: "The Armoury", tip: "Mail, plate and shield for everyone under your banner. Every level adds 5% to the defence of every REGULAR you field, up to +50% at level 10 — the Forge's twin, and the other half of arming an army properly. Sellswords draw nothing from it either. Equally hungry for ore." },
  war_foundry: { title: "The Engine Yard", tip: "The siege engineering works. Its ten levels alternate an offensive weapon then the defensive counter that blunts it — only a full level-10 yard owns the complete kit." },
  walls: { title: "The Walls", tip: "Your ring of stone. Any standing wall gives every defender behind it the same +50% — a wall is a wall. What LEVEL buys is how much punishment it absorbs before it is rubble, and that scales hard: a Citadel soaks a hundred times what a palisade does. Battered walls also frighten off up to half your incoming settlers until repaired." },
};

/**
 * What each field actually DOES, as a lead line plus the specific effects.
 *
 * Bullets rather than prose because a research card is read while deciding, and
 * "cleverer farming, every level lifts output by another 20%, up to double at
 * mastery, the surest way to feed a growing empire" is one sentence carrying
 * four separate claims. Every number is interpolated from the constant that
 * governs it, so a retune moves the copy with it.
 */
export const RESEARCH_INFO: Record<ResearchField, { title: string; tip: string; bullets: string[] }> = {
  crop_rotation: {
    title: "Crop Rotation",
    tip: "Cleverer farming — the surest way to feed a growing empire.",
    bullets: [
      `+${pct(EFFECT_PER_LEVEL)} farmer food output per level, +${pct(EFFECT_PER_LEVEL * MAX_FIELD_LEVEL)} at mastery`,
      "Food is the one resource that stops EVERYTHING when it runs out — tax, production, growth and attacking all freeze",
      "Counts toward your ranking score",
    ],
  },
  forestry: {
    title: "Forestry",
    tip: "Managed woodlands, and lumberjacks who know which tree to fell.",
    bullets: [
      `+${pct(EFFECT_PER_LEVEL)} lumberjack wood output per level, +${pct(EFFECT_PER_LEVEL * MAX_FIELD_LEVEL)} at mastery`,
      "Timber is the early bottleneck — nearly every building's first levels are wood-led",
      "Counts toward your ranking score",
    ],
  },
  masonry: {
    title: "Masonry",
    tip: "Better quarrying and cutting.",
    bullets: [
      `+${pct(EFFECT_PER_LEVEL)} quarryman stone output per level, +${pct(EFFECT_PER_LEVEL * MAX_FIELD_LEVEL)} at mastery`,
      "Stone dominates the mid and late ladders — walls and storehouses are hungriest for it",
      "Counts toward your ranking score",
    ],
  },
  deep_smelting: {
    title: "Deep Smelting",
    tip: "Hotter furnaces, deeper shafts.",
    bullets: [
      `+${pct(EFFECT_PER_LEVEL)} miner ore output per level, +${pct(EFFECT_PER_LEVEL * MAX_FIELD_LEVEL)} at mastery`,
      "Ore is the war-metal: troops, siege engines, the Forge and the Armoury all eat it",
      "Counts toward your ranking score",
    ],
  },
  statecraft: {
    title: "Statecraft",
    tip: "The treasury's own field — it makes the SAME tax rate yield more.",
    bullets: [
      `+${pct(EFFECT_PER_LEVEL)} tax income per level, ×2 at mastery`,
      "Touches the treasury ONLY — it does not raise worker output, so it is not a fifth production field",
      "Lets you fund a war without squeezing your workers, who pay for high taxes with lost output",
      "Counts toward your ranking score",
    ],
  },
  granarycraft: {
    title: "Granarycraft",
    tip: "Deeper vaults, drier cellars, better locks.",
    bullets: [
      `+${pct(RESEARCH_EFFECT_PER_LEVEL.granarycraft ?? 0.05)} protected capacity per level in ALL FIVE storehouses, gold included`,
      "Anything above your shelter sits loose and is lootable — this is what a raid cannot reach",
      "Deliberately UNRANKED: what you are sitting on is exactly what a raider would most like to read off the ladder",
    ],
  },
  scholarship: {
    title: "Scholarship",
    tip: "Endowed chairs, and a library that keeps its notes.",
    bullets: [
      `+${pct(SCHOLARSHIP.OUTPUT_PER_LEVEL)} to every scholar per level, ×2 at mastery`,
      `Re-pointing your scholars costs ${pct(SCHOLARSHIP.SWITCH_LOSS_PER_LEVEL)} less of your banked progress per level — NOTHING at mastery`,
      "The free hand is the real prize: research prices climb faster than any output bonus can chase, so being able to change your mind is worth more than speed",
      "Unranked",
    ],
  },
  merchants_charter: {
    title: "The Merchants' Charter",
    tip: "Guild privileges, bonded warehouses and safe passage.",
    bullets: [
      `The Bazaar's ${pct(MARKET_FEE)} cut falls ${pct(MERCHANTS_CHARTER.FEE_PER_LEVEL)} per level — to ZERO at mastery, so trade becomes free`,
      `+${pct(MERCHANTS_CHARTER.CAPACITY_PER_LEVEL)} caravan capacity per level`,
      `A recalled caravan forfeits ${pct(MERCHANTS_CHARTER.RECALL_LOSS_PER_LEVEL)} less per level (${pct(MARKET_RECALL_LOSS)} → ${pct(MARKET_RECALL_LOSS - MERCHANTS_CHARTER.RECALL_LOSS_PER_LEVEL * MAX_FIELD_LEVEL)})`,
      "The fee is fixed when a caravan DEPARTS — finishing this will not re-cut loads already on the road",
      "Unranked",
    ],
  },
  kings_roads: {
    title: "The King's Roads",
    tip: "Metalled roads and a courier chain — moving people and moving goods are the same problem.",
    bullets: [
      `−${pct(KINGS_ROADS.TROOP_COST_PER_LEVEL)} on the cost of training regulars per level, −${pct(KINGS_ROADS.TROOP_COST_PER_LEVEL * MAX_FIELD_LEVEL)} at mastery`,
      `−${pct(KINGS_ROADS.DELIVERY_PER_LEVEL)} on caravan road time per level, and always rounded UP to a whole turn`,
      "Compounds with your Market Square's own level, though a maxed market already sits on the floor",
      "Unranked",
    ],
  },
  tradecraft: {
    title: "Tradecraft",
    tip: "The spymaster's art — despite the name, this is espionage, not commerce.",
    bullets: [
      "Unlocks nothing — the SHADOW GUILD's level does that, one operation per rung",
      `+${pct(EFFECT_PER_LEVEL)} to every mission's effect per level: this is what makes a knife bite`,
      "Unranked — shadow work earns power, not prestige",
    ],
  },
  pathfinding: {
    title: "Pathfinding",
    tip: "Rangers who read ground, and see who else has been walking on it.",
    bullets: [
      "Unlocks nothing — the RANGER'S LODGE's level does that, one operation per rung",
      `+${pct(EFFECT_PER_LEVEL)} to recon accuracy and to your chance of intercepting incoming spies, per level`,
      "Your rangers stand watch whatever this reads — a realm at Pathfinding 0 is still defended, only less well",
      "Scouts are the ONLY defence against spies — this is your counter-espionage",
      "Unranked",
    ],
  },
  art_of_war: {
    title: "The Art of War",
    tip: "Doctrine, drill and the handling of a line.",
    bullets: [
      `+${pct(EFFECT_PER_LEVEL)} ATTACK for every troop per level, +${pct(EFFECT_PER_LEVEL * MAX_FIELD_LEVEL)} at mastery`,
      "Reaches sellswords as well as your own — you drill hired blades to your doctrine",
      "Twice what a maxed Forge gives, so the two stack rather than compete",
      "Counts toward your ranking score",
    ],
  },
  shieldcraft: {
    title: "Shieldcraft",
    tip: "Formations that hold, and the discipline to keep them.",
    bullets: [
      `+${pct(EFFECT_PER_LEVEL)} DEFENCE for every troop per level, +${pct(EFFECT_PER_LEVEL * MAX_FIELD_LEVEL)} at mastery`,
      "Reaches sellswords as well as your own",
      "The Armoury's twin at the research tier — twice what a maxed Armoury gives",
      "Counts toward your ranking score",
    ],
  },
  siegecraft: {
    title: "Siegecraft",
    tip: "Engineers who know their trade — and how to aim. The whole siege discipline in one field.",
    bullets: [
      `+${pct(EFFECT_PER_LEVEL)} siege engine power per level, +${pct(EFFECT_PER_LEVEL * MAX_FIELD_LEVEL)} at mastery`,
      "EVERY engine and every target — rams against masonry, trebuchets against the town, counters on your own wall",
      "AND accuracy: trebuchets against walls climb 30% → 60% of their power finding masonry, and 20% → 50% against buildings",
      "Sharper counter-battery fire on your own wall as well",
      "The accuracy half MULTIPLIES rather than adds, which makes this the strongest single pick a siege specialist can make — and now the only one they need",
      "Counts toward your ranking score",
    ],
  },
  medicine: {
    title: "Medicine",
    tip: "A surgeon's tent behind your own lines. The sellswords who fall defending you are carried off alive, so the screen in front of your regulars lasts longer.",
    bullets: [
      `${pct(MEDICINE.RECOVER_PER_LEVEL)} of your fallen recovered per level — ${pct(MEDICINE.RECOVER_PER_LEVEL * MAX_FIELD_LEVEL)} at mastery. Attacking or defending, and your own dead and the hired counted separately, so a dying screen never buys back your levy`,
      `Never fewer than ${MEDICINE.MIN_PER_LEVEL} head per level, so it still shows in a small skirmish`,
      `Costs ${MEDICINE.FOOD_PER_RECOVERY} food a head from your stores — a granary that covers three of five saves three`,
      "DEFENCE only: it is a hospital, not a baggage train. Marching abroad heals nobody",
      "Sellswords only. Your own dead are gone for good — that is what makes killing regulars the worst wound an enemy can deal, and a hospital that undid it would take the teeth out of every attack",
      "It saves no regular directly. It keeps the hired screen standing in front of them, which is what saves them",
      "Counts toward your ranking score",
    ],
  },
  free_companies: {
    title: "Free Companies",
    tip: "Standing contracts with the sellsword companies.",
    bullets: [
      `−${pct(RESEARCH_EFFECT_PER_LEVEL.free_companies ?? 0.1)} on the price of hiring per level, −${pct((RESEARCH_EFFECT_PER_LEVEL.free_companies ?? 0.1) * MAX_FIELD_LEVEL)} at mastery`,
      "Cuts the PRICE only — upkeep is still a gold a turn each, and unpaid sellswords all defect at once",
      "The field that makes a long war affordable, since mercenaries churn constantly",
      "Unranked",
    ],
  },
};

// ── Guide deep-links ─────────────────────────────────────────────────────────
// Every tooltip can point to the Field Manual chapter that explains it in full.
// Keyed to match the *_INFO records above so call sites read them in parallel.

export const UNIT_GUIDE: Record<string, string> = {
  footman: "/guide#army",
  archer: "/guide#army",
  cavalry: "/guide#army",
  engineer: "/guide#battle",
  mercenary: "/guide#army",
  spy: "/guide#shadows",
  scout: "/guide#shadows",
};

export const ATTACK_MODE_GUIDE: Record<string, string> = {
  raid: "/guide#battle",
  siege: "/guide#battle",
  revenge: "/guide#battle",
  bombard: "/guide#battle",
};

export const ACTION_GUIDE: Record<string, string> = {
  tax: "/guide#grow",
  vacation: "/guide#defense",
  bank: "/guide#grow",
  rest: "/guide#army",
  trainTroops: "/guide#army",
  discharge: "/guide#grow",
  hireMercs: "/guide#army",
  train: "/guide#army",
  assign: "/guide#grow",
  buildQueue: "/guide#grow",
  repair: "/guide#defense",
  clanBombard: "/guide#clans",
};

export const RESEARCH_GUIDE: Record<ResearchField, string> = {
  crop_rotation: "/guide#grow",
  forestry: "/guide#grow",
  masonry: "/guide#grow",
  deep_smelting: "/guide#grow",
  granarycraft: "/guide#defense",
  kings_roads: "/guide#trade",
  merchants_charter: "/guide#trade",
  scholarship: "/guide#grow",
  statecraft: "/guide#grow",
  art_of_war: "/guide#battle",
  shieldcraft: "/guide#battle",
  siegecraft: "/guide#battle",
  medicine: "/guide#army",
  free_companies: "/guide#battle",
  tradecraft: "/guide#shadows",
  pathfinding: "/guide#shadows",
};

export const BUILDING_GUIDE: Record<BuildingId, string> = {
  grange: "/guide#grow",
  masons_quarry: "/guide#grow",
  deepvein_mine: "/guide#grow",
  sawyers_mill: "/guide#grow",
  granary: "/guide#grow",
  timberyard: "/guide#grow",
  masons_yard: "/guide#grow",
  ironhold: "/guide#grow",
  counting_house: "/guide#defense",
  market_square: "/guide#grow",
  collegium: "/guide#grow",
  shadow_guild: "/guide#shadows",
  rangers_lodge: "/guide#shadows",
  hearthstead: "/guide#grow",
  muster_hall: "/guide#army",
  drill_yard: "/guide#army",
  fletchers_range: "/guide#army",
  knights_stables: "/guide#army",
  forge: "/guide#army",
  armoury: "/guide#army",
  war_foundry: "/guide#battle",
  walls: "/guide#defense",
};
