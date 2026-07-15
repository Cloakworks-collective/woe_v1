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
  warrior: {
    title: "Warrior (unequipped)",
    tip: "A peasant handed a spear — the raw recruit every real soldier starts as. Weak on their own, they become footmen, archers, or cavalry once you equip them with gear in The Army.",
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
    tip: "Rented sellswords, tough as veteran footmen, who stand in front of your own troops and die first — a bought shield for your real soldiers. They cost gold every single turn (skip the wage and they all desert at once) and can never outnumber a quarter of your regular army.",
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
    "Raise the white flag: you can no longer attack, your tax income is halved in tribute and shame, and you become untouchable by everything except revenge. Lift it whenever you like — and simply attacking someone lifts it for you.",
  bank: "Move gold in or out of the Counting House vault. Gold locked in the vault (up to its capacity) is safe when raiders storm your castle; loose gold on the table is theirs to take. Type a negative number to withdraw.",
  rest: "Stand the army down to recover: 5 action turns and a little food buy back 20 stamina for every soldier. Tired troops swing weaker and guard worse, so rest before a hard fight — you can't rest while starving.",
  equip: "Hand a warrior weapons and armour to make them a footman, archer, or cavalryman at the tier you choose. You'll need the right trainer and a Forge at that same tier level.",
  disband: "Melt down a troop's gear (the equipment is lost for good) and return the soldier to the warrior pool, ready to be re-equipped as something else.",
  discharge: "Send a warrior back to peaceful civilian life — but only if a Hearthstead bed stands empty for them. No spare housing, no discharge.",
  hireMercs: "Buy sellswords from the Black Market. They shield your real troops by dying first, but drain gold every turn and can't outnumber a quarter of your regular army.",
  train: "Turn idle peasants into this role. It happens instantly — the only limits are your gold and a free slot in the right building.",
  assign: "Put idle peasants to work in a trade (or type a negative number to call them home). Free and reversible, but every building holds only 20 workers per level.",
  buildQueue: "Hand this to the Steward (a Royal Charter perk): it will be raised automatically the very moment your treasury can afford it, even while you sleep.",
  repair: "Pay half of the damage in the building's own materials to mend it back to full — restoring its full storage shelter, production, or research along with it.",
};

export const BUILDING_INFO: Record<BuildingId, { title: string; tip: string }> = {
  grange: { title: "The Grange", tip: "Farmland and granaries where your farmers grow the empire's food. Each level opens 20 more farmer jobs — and food is life: run out and everything freezes." },
  masons_quarry: { title: "Mason's Quarry", tip: "The stone pit that feeds every wall and heavy building. Each level opens 20 more quarryman jobs. Stone is the backbone of the late game." },
  deepvein_mine: { title: "Deepvein Mine", tip: "Shafts sunk after ore and metal — the stuff of weapons, armour, and siege engines. Each level opens 20 more miner jobs." },
  sawyers_mill: { title: "Sawyer's Mill", tip: "The lumber yard where woodlots become planks, arrows, and scaffolding. Each level opens 20 more lumberjack jobs; wood never goes out of demand." },
  granary: { title: "Granary", tip: "Guarded food stores. Every level shelters another 20,000 food from raiders — anything above that shelter sits in the open, ready to be looted or burned." },
  timberyard: { title: "Timberyard", tip: "Guarded wood stores. Every level shelters another 20,000 wood from plunder; the overflow is fair game for raiders." },
  masons_yard: { title: "Mason's Yard", tip: "Guarded stone stores. Every level shelters another 20,000 stone from plunder; the overflow is fair game for raiders." },
  ironhold: { title: "Ironhold", tip: "Guarded ore stores. Every level shelters another 20,000 ore from plunder; the overflow is fair game for raiders." },
  counting_house: { title: "Counting House", tip: "The gold vault. Every level keeps another 20,000 gold safe from a castle attack — loose gold on the table is stolen, so bank what you can't afford to lose." },
  market_square: { title: "Market Square", tip: "Your gateway to the Grand Bazaar. Each level seats 20 more merchants and lets every caravan haul another 1,000 goods to sell for gold." },
  collegium: { title: "The Collegium", tip: "The great library and workshops of learning. Each level seats 20 more scholars and — every second level — unlocks the next tier of research. A cracked Collegium slows every discovery." },
  shadow_guild: { title: "Shadow Guild", tip: "The den where spies are trained and sent into the dark. Each level houses 20 more spies and makes every mission bite deeper." },
  rangers_lodge: { title: "Ranger's Lodge", tip: "Home of your scouts. Each level houses 20 more, and — just as importantly — lets them catch higher-level enemy spies. A low Lodge is simply blind to clever infiltrators." },
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
  warrior: "/guide#army",
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
  equip: "/guide#army",
  disband: "/guide#army",
  discharge: "/guide#grow",
  hireMercs: "/guide#army",
  train: "/guide#army",
  assign: "/guide#grow",
  buildQueue: "/guide#grow",
  repair: "/guide#defense",
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
