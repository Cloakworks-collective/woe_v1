// Human-readable explanations surfaced as tooltips across the UI. Written in
// plain English with a little game flair — no bare acronyms.

import type { BuildingId } from "./buildings";
import type { ResearchField } from "./research";

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
    tip: "The eyes of the realm. Abroad they gather rough intel on rivals from beyond the walls; at home they hunt infiltrators — scouts kept in the Ranger's Lodge catch enemy spies, up to the operation level your Lodge can even detect.",
  },
  engineer: {
    title: "Siege Engineer",
    tip: "The crews that work your war machines — a trebuchet without engineers is just firewood. They carry no weapon of their own (almost helpless in a fight) and are trained at the Siege Works. The heaviest engines are crewed first.",
  },
  mercenary: {
    title: "Mercenary",
    tip: "Rented sellswords — hired in the same arms and tiers as your own troops (a heavy-cavalry sellsword needs Knights' Stables 3 + Forge 3, just like the real thing). They cost only gold, no peasants, and stand in front of your regulars of that arm to die first — a bought shield. But they draw gold every single turn (skip the wage and they all desert at once), can never outnumber a quarter of your regular army, and count for nothing on the ranking ladder.",
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
    tip: "The full assault: your engines batter the walls, then a four-phase battle decides it. Win and you plunder their unbanked gold plus everything spilling out of their stores — including goods a bombardment cracked loose. This is how you take real wealth.",
  },
  revenge: {
    title: "Revenge",
    tip: "A grudge-strike, open only for 18 hours after someone hits you. It ignores their surrender, their exhaustion, and the 'too strong to attack' rule — but takes no loot. The payment is dead soldiers, and killing their regulars is the worst wound you can deal, dragging their ranking down for days.",
  },
  bombard: {
    title: "Bombard",
    tip: "A pure artillery duel — your trebuchets against their Counter-Engine, no soldiers involved. You can't aim it: it pounds the walls until they crack, then the fire spills onto random buildings — storehouses (their goods tumble outside), workshops (production slows), even the Collegium (research crawls). The softening blow before a Castle Attack.",
  },
};

export const ACTION_INFO: Record<string, string> = {
  tax: "The tax dial, from 0% to 100%. Crank it up and gold pours in while your workers down tools; ease it off and production surges while the treasury dries up. 50% is the balanced middle — high tax is a war chest, low tax is a rebuilding sprint.",
  surrender:
    "Raise the white flag to become untouchable by everything except revenge — a shelter for when you're outmatched, not a habit. The cost is steep: you cannot attack, and BOTH your tax income and your production fall by half while it flies. You may spend at most 20 days surrendered per era, total. You cannot raise it while a revenge hangs over you — it queues instead, and rises on its own once every revenge window against you has closed. Lower it whenever you like, but your army then stands down: no fresh attacks for 18 hours (revenge excepted), so you can't duck a siege and immediately swing back.",
  bank: "Shelter gold and goods in the Counting House and storehouses. Each “Store all” button vaults the most it can hold — safe from raiders and spies. Loose stock left in the open is theirs to take. A bombarded store shelters less (capacity × its integrity) and its overflow spills back out.",
  rest: "Stand the army down to recover: 5 action turns and a little food buy back 20 stamina for every soldier. Tired troops swing weaker and guard worse, so rest before a hard fight — you can't rest while starving.",
  trainTroops: "Raise idle peasants straight into footmen, archers, or cavalry at the tier you choose — no warrior middle step. Tier needs the matching trainer AND a Forge at that same level, plus a free Muster Hall bed. Instant.",
  discharge: "Send a soldier back to peaceful civilian life — their gear is lost, and it only works if a Hearthstead bed stands empty and you'd stay above the 30% guard line. No spare housing, no discharge.",
  hireMercs: "Hire sellswords from the Black Market in the arms and tiers you can already field (they need the same trainer + Forge as your regulars). Gold only, no peasants — they shield the matching regulars by dying first, but drain gold every turn and can't outnumber a quarter of your regular army.",
  train: "Turn idle peasants into this role. It happens instantly — the only limits are your gold and a free slot in the right building.",
  assign: "Put idle peasants to work in a trade (or type a negative number to call them home). Free and reversible, but every building holds only 20 workers per level.",
  buildQueue: "Hand this to the Steward (a Royal Charter perk): it will be raised automatically the very moment your treasury can afford it, even while you sleep.",
  repair: "Pay half of the damage in the building's own materials to mend it back to full — restoring its full storage shelter, production, or research along with it.",
  clanBombard:
    "War only: wheel your trebuchets against an enemy clan's works — the Storage (its shelter shrinks, goods spill), the Hall (its tax shelter weakens), or the Wonder (its war-cost discount fades). Costs 10 turns and crewed trebuchets, and cracks integrity toward a 50% floor. The price: the whole enemy clan earns a single revenge strike back at you — any of their members may deliver it within 18 hours.",
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
export const CLAN_BUILDING_INFO: Record<"storage" | "hall" | "wonder", { title: string; icon: string; tip: string }> = {
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
  wonder: {
    title: "Clan Wonder",
    icon: "🗿",
    tip: "A great monument that discounts war for the whole clan — every member pays 10% less per Wonder level on mercenaries, troops, and siege gear. Requires deep Storage to raise (level 4 / 7 / 10). Worth the most on the clan score. A bombarded Wonder gives a shallower discount until mended.",
  },
};

export const BUILDING_INFO: Record<BuildingId, { title: string; tip: string }> = {
  grange: { title: "The Grange", tip: "Farmland and granaries where your farmers grow the empire's food. You can put ANY number of farmers to work — each level of the Grange lifts how much every one of them produces (50/turn at level 1 up to 500 at level 10, before tax). Food is life: run out and everything freezes." },
  masons_quarry: { title: "Mason's Quarry", tip: "The stone pit that feeds every wall and heavy building. Quarrymen are unlimited; each Quarry level raises every quarryman's output (50→500/turn). Stone is the backbone of the late game." },
  deepvein_mine: { title: "Deepvein Mine", tip: "Shafts sunk after ore and metal — the stuff of weapons, armour, and siege engines. Miners are unlimited; each Mine level raises every miner's output (50→500/turn)." },
  sawyers_mill: { title: "Sawyer's Mill", tip: "The lumber yard where woodlots become planks, arrows, and scaffolding. Lumberjacks are unlimited; each Mill level raises every lumberjack's output (50→500/turn); wood never goes out of demand." },
  granary: { title: "Granary", tip: "Guarded food stores. Every level shelters another 20,000 food from raiders — anything above that shelter sits in the open, ready to be looted or burned." },
  timberyard: { title: "Timberyard", tip: "Guarded wood stores. Every level shelters another 20,000 wood from plunder; the overflow is fair game for raiders." },
  masons_yard: { title: "Mason's Yard", tip: "Guarded stone stores. Every level shelters another 20,000 stone from plunder; the overflow is fair game for raiders." },
  ironhold: { title: "Ironhold", tip: "Guarded ore stores. Every level shelters another 20,000 ore from plunder; the overflow is fair game for raiders." },
  counting_house: { title: "Counting House", tip: "The gold vault. Every level keeps another 20,000 gold safe from a castle attack — loose gold on the table is stolen, so bank what you can't afford to lose." },
  market_square: { title: "Market Square", tip: "Your gateway to the Grand Bazaar. Merchants are unlimited — each level lets every caravan haul another 1,000 goods, and speeds the road to market: a caravan takes 100 turns to arrive at level 1, just 10 at level 10." },
  collegium: { title: "The Collegium", tip: "The great library and workshops of learning. Scholars are unlimited — each Collegium level lifts how much research every one of them produces per turn (50 at L1 up to 500 at L10). A cracked Collegium slows every discovery." },
  shadow_guild: { title: "Shadow Guild", tip: "The den where spies are trained and sent into the dark. Spies are unlimited — each Shadow Guild level makes every mission bite deeper." },
  rangers_lodge: { title: "Ranger's Lodge", tip: "Home of your scouts. Scouts are unlimited — each Ranger's Lodge level sharpens their recon and, just as importantly, lets them catch higher-level enemy spies. A low Lodge is simply blind to clever infiltrators." },
  hearthstead: { title: "Hearthstead", tip: "Homes for your people — each one houses 10 souls. Settlers arrive every dawn and walk straight past if no bed is free, so always build a little ahead of the crowd." },
  muster_hall: { title: "Muster Hall", tip: "Barracks that quarter your soldiers — 10 troops each. No free bunk, no new troop, no matter how much gold you have. Build them before the war, not during it." },
  drill_yard: { title: "Drill Yard", tip: "Where footmen are trained. Its level (1–3) sets how heavy your footmen can be armed: light, then medium, then heavy." },
  fletchers_range: { title: "Fletcher's Range", tip: "Where archers are trained. Its level (1–3) sets how heavy your archers can be armed: light, then medium, then heavy." },
  knights_stables: { title: "Knights' Stables", tip: "Where cavalry are raised. Its level (1–3) sets how heavy your riders can be armed: light, then medium, then heavy." },
  forge: { title: "The Forge", tip: "The military spine — it stocks the weapons and armour every equipped troop needs. Its level gates every trainer: heavy troops need a level-3 Forge as well as a level-3 trainer." },
  war_foundry: { title: "War Foundry", tip: "The siege engineering works. Its ten levels alternate an offensive weapon then the defensive counter that blunts it — only a full level-10 Foundry owns the complete kit." },
  walls: { title: "The Walls", tip: "Your ring of stone. Each level adds +10% to every defender in a siege — and while intact they cost nothing, but battered walls also frighten off up to half your incoming settlers until repaired." },
};

export const RESEARCH_INFO: Record<ResearchField, { title: string; tip: string }> = {
  crop_rotation: { title: "Crop Rotation", tip: "Cleverer farming. Every level lifts your farmers' food output by another 20%, up to double at mastery — the surest way to feed a growing empire." },
  forestry: { title: "Forestry", tip: "Managed woodlands. Every level lifts your lumberjacks' wood output by another 20%, up to double at mastery." },
  masonry: { title: "Masonry", tip: "Better quarrying and cutting. Every level lifts your quarrymen's stone output by another 20%, up to double at mastery." },
  deep_smelting: { title: "Deep Smelting", tip: "Hotter furnaces, deeper shafts. Every level lifts your miners' ore output by another 20%, up to double at mastery." },
  tradecraft: { title: "Tradecraft", tip: "The spymaster's art. Each level unlocks a new spy operation and makes every mission 20% more effective — but it's shadow work, so it earns power, not ranking prestige." },
  pathfinding: { title: "Pathfinding", tip: "Sharper scouting. Each level sharpens your recon and boosts the odds your home scouts catch enemy spies. Shadow work — it brings power, not prestige." },
  art_of_war: { title: "The Art of War", tip: "Drill, tactics, and ferocity. Every level makes all your troops strike 20% harder in every battle, up to double at mastery." },
  shieldcraft: { title: "Shieldcraft", tip: "Discipline and better armour. Every level makes all your troops 20% tougher to kill, up to double at mastery." },
  siegecraft: { title: "Siegecraft", tip: "Master engineers. Every level makes your siege engines hit 20% harder against troops and walls alike — but engines are war tools, so this brings power, not prestige." },
  statecraft: { title: "Statecraft", tip: "Wise governance that softens the tax burden. Every level keeps your workers more productive under high taxes — at mastery they toil as if untaxed. Lets you bank gold without strangling production." },
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
  surrender: "/guide#defense",
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
  statecraft: "/guide#grow",
  art_of_war: "/guide#battle",
  shieldcraft: "/guide#battle",
  siegecraft: "/guide#battle",
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
  war_foundry: "/guide#battle",
  walls: "/guide#defense",
};
