#!/usr/bin/env node
// War of Empires — terminal client. Same backend as the web UI (account-token
// auth over the cmd:* protocol + JSON read endpoints). Zero dependencies.
//
//   node cli/woe.mjs join            found an empire (interactive)
//   node cli/woe.mjs link <token>    bind an existing account
//   node cli/woe.mjs                 interactive court (REPL)
//   node cli/woe.mjs status          one-shot commands work too

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

// ── Colors ──────────────────────────────────────────────────────────────────

const TTY = process.stdout.isTTY;
const esc = (c) => (s) => (TTY ? `\x1b[${c}m${s}\x1b[0m` : String(s));
const bold = esc(1), dim = esc(2), italic = esc(3), red = esc(31), green = esc(32),
  yellow = esc(33), blue = esc(34), magenta = esc(35), cyan = esc(36), white = esc(37),
  brightRed = esc(91), brightGreen = esc(92), brightYellow = esc(93),
  brightMagenta = esc(95), brightCyan = esc(96), gray = esc(90);
const gold = (s) => bold(brightYellow(s));
const banner = (s) => bold(brightRed(s));
const head = (s) => bold(yellow(`── ${s} ` + "─".repeat(Math.max(0, 58 - s.length))));

const RES_ICON = { gold: "🪙", food: "🍞", wood: "🪵", stone: "🪨", ore: "⚒️ " };
const RES_COLOR = { gold: brightYellow, food: brightGreen, wood: magenta, stone: white, ore: brightCyan };
const RACE_COLOR = { human: white, elf: brightGreen, orc: brightRed, troll: cyan, dwarf: yellow, gnoll: brightMagenta };

const fmt = (n) => Math.floor(n).toLocaleString("en-US");
const bar = (frac, width = 20, color = brightGreen) => {
  const on = Math.round(Math.max(0, Math.min(1, frac)) * width);
  return color("█".repeat(on)) + gray("░".repeat(width - on));
};

// ── Config & HTTP ───────────────────────────────────────────────────────────

const CONFIG_FILE = path.join(os.homedir(), ".woe", "config.json");

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

let config = loadConfig();
const server = () => process.env.WOE_SERVER || config.server || "http://localhost:3000";

async function api(method, route, body) {
  const res = await fetch(server() + route, {
    method,
    headers: {
      "content-type": "application/json",
      ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch((e) => {
    throw new Error(`Cannot reach ${server()} — is the server up? (${e.message})`);
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}
const get = (r) => api("GET", r);
const cmd = (name, args = {}) => api("POST", `/api/cmd/${name}`, args);

// ── Views ───────────────────────────────────────────────────────────────────

function title() {
  console.log("");
  console.log(banner("  ⚔⚔⚔  W A R   O F   E M P I R E S  ⚔⚔⚔"));
}

/** The castle gate — REPL welcome and the status dashboard. */
function bigBanner() {
  const t = gray, f = brightRed;
  const center = (s, w = 38) => {
    const pad = Math.max(0, w - s.length);
    return " ".repeat(Math.floor(pad / 2)) + s + " ".repeat(Math.ceil(pad / 2));
  };
  const left = ["   |>>>     ", "   |        ", "  _|_  _  _ ", " | |_|| || |", " |         |"];
  const right = ["  |>>>", "  |", " _  _  _|_", "| || ||_| |", "|         |"];
  const mid = [
    center(""),
    center(""),
    gold(center("W A R   o f   E M P I R E S")),
    dim(center("═".repeat(32))),
    italic(gray(center("six races · one ladder · one crown"))),
  ];
  console.log("");
  for (let i = 0; i < 5; i++) {
    console.log((i < 2 ? f : t)(left[i]) + mid[i] + (i < 2 ? f : t)(right[i]));
  }
}

/** Crossed standards before every battle report. */
function battleBanner(mode) {
  const m = ` ${mode.toUpperCase()} `;
  const pad = "─".repeat(Math.max(1, Math.floor((26 - m.length) / 2)));
  console.log("");
  console.log(red(`   o==[]::::::::::::::>`) + dim("        ") + blue(`<::::::::::::::[]==o`));
  console.log(yellow(`              ${pad}⚔${m}⚔${pad}`));
}

function trophyArt() {
  const t = brightYellow;
  console.log(t("        ___________"));
  console.log(t("       '._==_==_=_.'"));
  console.log(t("       .-\\:      /-.") + gold("      ★  V I C T O R Y  ★"));
  console.log(t("      | (|:.     |) |") + italic(gray("     the field is yours")));
  console.log(t("       '-|:.     |-'"));
  console.log(t("          \\::.  /"));
  console.log(t("           ) .. ("));
  console.log(t("         _.'    '._"));
}

function skullArt() {
  const s = gray;
  console.log(s("       ______"));
  console.log(s("    .-\"      \"-."));
  console.log(s("   /            \\") + brightRed("     ✝  D E F E A T  ✝"));
  console.log(s("  |,  .-.  .-.  ,|") + italic(gray("    the host breaks and flees")));
  console.log(s("  | )(_o/  \\o_)( |"));
  console.log(s("  |/     /\\     \\|"));
  console.log(s("   \\__|IIIIII|__/"));
  console.log(s("     '--------'"));
}

/** A banner rises — shown when an empire is founded. */
function flagArt(name) {
  const p = gray, b = brightRed;
  console.log("");
  console.log(`   ${p("|")}${b("\\")}`);
  console.log(`   ${p("|")}${b(" \\______")}`);
  console.log(`   ${p("|")}${b(" |######\\")}      ${gold(`The banner of ${name} rises!`)}`);
  console.log(`   ${p("|")}${b(" |#######>")}`);
  console.log(`   ${p("|")}${b(" |######/")}`);
  console.log(`   ${p("|")}${b("  ¯¯¯¯¯¯")}`);
  console.log(`  ${p("/_\\")}`);
}

function resourceBar(st) {
  const e = st.economy;
  const parts = [
    `${RES_ICON.gold} ${RES_COLOR.gold(fmt(e.gold))}`,
    ...["food", "wood", "stone", "ore"].map(
      (r) => `${RES_ICON[r]} ${RES_COLOR[r](fmt(e.resources[r]))}`,
    ),
    `⏳ ${brightCyan(e.actionTurns)}`,
  ];
  console.log("  " + parts.join(dim(" │ ")));
}

function showStatus(st) {
  const emp = st.empire, pop = st.population, e = st.economy, a = st.army;
  bigBanner();
  console.log(
    `  ${italic(gray(st.meta.era))} ${dim("· turn")} ${cyan(fmt(st.meta.tick))} ${dim("· dawn in")} ${cyan(st.meta.turnsToDawn)} ${dim("turns")}`,
  );
  if (st.meta.winner) console.log(gold(`  👑 ERA WON by ${st.meta.winner.name}!`));
  console.log("");
  const race = RACE_COLOR[emp.race] ?? white;
  console.log(
    `  ${gold("👑 " + emp.name)} — ${race(emp.race)} ${emp.title} ${emp.premium ? gold("✦ Charter") : ""}`,
  );
  console.log(
    `  ${dim("score")} ${bold(white(fmt(emp.score)))} ${dim("· rank")} ${bold(white("#" + emp.rank))} ${dim("· battles")} ${green(emp.battlesWon + "W")}${dim("/")}${red(emp.battlesLost + "L")}`,
  );
  if (emp.starving) console.log(brightRed(bold("  ☠ STARVING — the empire is frozen. Buy food or assign farmers!")));
  if (emp.surrendered) console.log(yellow("  🏳 Surrendered — tax halved, safe from all but revenge."));
  if (emp.shieldedUntilTick) console.log(brightCyan(`  🛡 Newcomer shield until tick ${fmt(emp.shieldedUntilTick)}.`));
  console.log("");
  resourceBar(st);
  console.log(
    `  ${dim("tax")} ${yellow(Math.round(e.taxRate * 100) + "%")} ${dim("→")} ${RES_COLOR.gold("+" + e.taxIncomePerTurn + "g/turn")} ${dim("· banked")} ${RES_COLOR.gold(fmt(e.bankedGold))} ${dim("· food upkeep")} ${RES_COLOR.food("−" + e.foodUpkeepPerTurn + "/turn")}`,
  );
  console.log("");
  console.log(head("The People"));
  console.log(
    `  ${green(fmt(pop.civilians))} civilians ${dim("·")} ${red(fmt(pop.military))} under arms ${dim("·")} ${yellow(fmt(pop.idlePeasants))} idle`,
  );
  const corps = (c) => (c?.light ?? 0) + (c?.medium ?? 0) + (c?.heavy ?? 0);
  const m = a.mercenaries ?? {};
  const mercCount = corps(m.footmen) + corps(m.archers) + corps(m.cavalry);
  console.log(
    `  ⚔ ${red(fmt(corps(a.footmen)))} footmen ${dim("·")} 🏹 ${green(fmt(corps(a.archers)))} archers ${dim("·")} 🐎 ${yellow(fmt(corps(a.cavalry)))} cavalry ${dim("·")} 🛠 ${cyan(fmt(a.siegeEngineers))} engineers ${dim("·")} 💰 ${magenta(fmt(mercCount))} mercs`,
  );
  console.log(
    `  stamina ${bar(a.stamina / 100)} ${a.stamina} ${dim("·")} experience ${bar(a.experience / 100, 20, brightMagenta)} ${a.experience}`,
  );
  console.log(`  walls: ${bold(st.walls.name)} ${st.walls.integrity < 1 ? red(`(${Math.round(st.walls.integrity * 100)}% — repair!)`) : green("(sound)")}`);
  console.log("");
  console.log(head("The Advisors"));
  for (const [k, v] of Object.entries(st.advisors)) {
    console.log(`  ${bold(cyan(k.padEnd(11)))} ${v}`);
  }
  if (st.steward) {
    console.log("");
    console.log(head("The Steward ✦"));
    console.log(
      `  builds queued: ${yellow(st.steward.buildQueue.length)} ${dim("·")} research queued: ${yellow(st.steward.researchQueue.length)} ${dim("·")} standing orders: ${yellow(st.steward.standingOrders.length)}`,
    );
  }
  if (st.revengeOpenAgainst.length > 0) {
    console.log("");
    console.log(brightRed(`  ⚔ Revenge open against: ${st.revengeOpenAgainst.map((r) => r.name).join(", ")}`));
  }
  console.log("");
  console.log(head("Chronicle"));
  for (const c of st.chronicle.slice(0, 8)) {
    console.log(`  ${dim("t" + c.tick)} ${chronColor(c.line)}`);
  }
  console.log("");
}

function chronColor(line) {
  if (/☠|scattered|FAILED|declined|defected/i.test(line)) return brightRed(line);
  if (/attacked you|declares war/i.test(line)) return red(line);
  if (/victorious|complete|sealed|fed again|reaches level/i.test(line)) return brightGreen(line);
  if (/Steward/.test(line)) return brightCyan(line);
  if (/settlers arrived/.test(line)) return green(line);
  return line;
}

function showBuildings(st) {
  title();
  console.log(head("Buildings — build <id> pays instantly, queue <id> hires the Steward ✦"));
  const rows = st.buildings;
  console.log(dim("  id                  lvl  health  next: 🪙      🪵      🪨      ⚒️"));
  for (const b of rows) {
    const lvl = b.counted ? `×${b.level}` : String(b.level);
    const cost = b.nextCost
      ? `${RES_COLOR.gold(String(Math.round(b.nextCost.gold)).padStart(7))} ${RES_COLOR.wood(String(Math.round(b.nextCost.wood)).padStart(7))} ${RES_COLOR.stone(String(Math.round(b.nextCost.stone)).padStart(7))} ${RES_COLOR.ore(String(Math.round(b.nextCost.ore)).padStart(7))}`
      : gray("   at its zenith");
    const name = (b.level > 0 ? bold(white(b.id)) : gray(b.id)).padEnd(TTY ? 28 : 19);
    const integ = b.integrity ?? 1;
    const hpColor = integ >= 0.999 ? green : integ >= 0.75 ? yellow : brightRed;
    const hp = b.level > 0 ? hpColor(`${Math.round(integ * 100)}%`.padStart(5)) : gray("    —");
    console.log(`  ${name} ${yellow(lvl.padStart(3))}  ${hp}  ${cost}`);
  }
  console.log(dim("\n  repair <id> mends a bombarded building (½ cost × damage)."));
  console.log("");
}

function showRankings(data) {
  title();
  console.log(head(`The Ladder — turn ${fmt(data.tick)}`));
  console.log(dim("  rank  score      empire                     race     title    flags"));
  for (const e of data.ladder) {
    const race = (RACE_COLOR[e.race] ?? white)(e.race.padEnd(8));
    const flags = [
      e.shielded ? brightCyan("🛡shield") : "",
      e.surrendered ? yellow("🏳white-flag") : "",
      e.clan ? magenta(`[${e.clan}]`) : "",
    ].filter(Boolean).join(" ");
    const name = e.you ? gold("👑 " + e.name.padEnd(23)) : white(e.name.padEnd(26));
    console.log(`  ${cyan(("#" + e.rank).padStart(4))}  ${bold(String(fmt(e.score)).padStart(8))}  ${name} ${race} ${dim(e.title.padEnd(8))} ${flags}`);
  }
  console.log("");
}

function showMarket(data) {
  title();
  console.log(head("The Grand Bazaar — anonymous; buy <res> <amt> / sell <res> <amt> <price>"));
  for (const [r, b] of Object.entries(data.board)) {
    const price = b.price === null ? gray("no supply") : RES_COLOR.gold(b.price + "g");
    console.log(`  ${RES_ICON[r]} ${RES_COLOR[r](r.padEnd(6))} ask ${price.padEnd(TTY ? 20 : 10)} supply ${fmt(b.supply)}`);
  }
  if (data.myCaravans.length) {
    console.log(dim("  ── your caravans ──"));
    for (const c of data.myCaravans) {
      console.log(`  ${RES_ICON[c.resource]} ${fmt(c.remaining)} ${c.resource} @ ${c.pricePerUnit}g  ${dim(c.orderId)}`);
    }
  }
  console.log("");
}

function showBattle(rep, myId) {
  const iAmAttacker = rep.attackerId === myId;
  const win =
    rep.victor === "none" ? null : (rep.victor === "attacker") === iAmAttacker;
  battleBanner(rep.mode);
  console.log(
    `  ${red("⚔ " + rep.attackerName)} ${dim("vs")} ${blue("🛡 " + rep.defenderName)} ${dim("· rounds:")} ${rep.rounds}`,
  );
  console.log("");
  if (win === null) console.log(yellow("   ── engines traded fire; no victor ──"));
  else if (win) trophyArt();
  else skullArt();
  console.log("");
  for (const line of rep.log ?? []) {
    let l = line;
    if (/breaks|flees|splinters|day is lost/i.test(l)) l = brightRed(l);
    else if (/^Round \d+:/.test(l)) l = dim(l);
    else if (/Bill-hooks|Fork Poles|Boiling Oil|Hoardings|Counter-Engine|Escalade/i.test(l)) l = yellow(l);
    else if (/Plunder/i.test(l)) l = gold(l);
    else if (/lose /i.test(l)) l = red(l);
    else l = dim(l);
    console.log("   " + l);
  }
  // The butcher's bill — per-class losses, both sides.
  const CLASSES = ["footmen", "archers", "cavalry", "engineers", "mercenaries"];
  const anyLosses = CLASSES.some((k) => (rep.attackerLosses?.[k] ?? 0) + (rep.defenderLosses?.[k] ?? 0) > 0);
  if (anyLosses) {
    console.log("");
    console.log(head("The Butcher's Bill"));
    console.log(dim(`  ${"".padEnd(14)}${rep.attackerName.slice(0, 14).padStart(14)}${rep.defenderName.slice(0, 14).padStart(14)}`));
    for (const k of CLASSES) {
      const a = rep.attackerLosses?.[k] ?? 0;
      const d = rep.defenderLosses?.[k] ?? 0;
      if (a + d === 0) continue;
      const color = k === "mercenaries" ? magenta : white;
      console.log(`  ${color(k.padEnd(14))}${red(String(fmt(a)).padStart(14))}${red(String(fmt(d)).padStart(14))}`);
    }
  }

  const after = [];
  const sl = rep.staminaLoss ?? {};
  if ((sl.attacker ?? 0) + (sl.defender ?? 0) > 0) after.push(`stamina ${red(`−${sl.attacker}`)}${dim("/")}${red(`−${sl.defender}`)}`);
  const xc = rep.experienceChange ?? {};
  if (xc.attacker !== undefined) {
    const sign = (n) => (n >= 0 ? brightGreen(`+${n}`) : brightRed(String(n)));
    after.push(`experience ${sign(xc.attacker)}${dim("/")}${sign(xc.defender)}`);
  }
  if (after.length) console.log(`  ${dim("aftermath:")} ${after.join(dim(" · "))}`);

  const gearBits = Object.entries(rep.siegeGearLost ?? {}).filter(([, v]) => v > 0).map(([t, v]) => `${v} ${t}`);
  if (gearBits.length) console.log(yellow(`  🏹 Siege gear lost: ${gearBits.join(", ")}`));
  if (rep.wallIntegrityDamage > 0) console.log(yellow(`  🧱 Wall damage dealt: ${Math.round(rep.wallIntegrityDamage * 100)}%`));
  for (const b of rep.buildingDamage ?? []) {
    console.log(yellow(`  🏚 ${b.building.replace(/_/g, " ")} cracked: −${Math.round(b.integrityLost * 100)}%`));
  }
  const loot = rep.loot ?? {};
  const lootBits = [
    loot.gold ? `${RES_ICON.gold} ${fmt(loot.gold)}` : "",
    ...Object.entries(loot.resources ?? {}).filter(([, v]) => v > 0).map(([r, v]) => `${RES_ICON[r]} ${fmt(v)}`),
  ].filter(Boolean);
  if (lootBits.length) console.log(gold(`  💰 Loot: ${lootBits.join("  ")}`));
  console.log("");
}

/** One redacted ledger line — the whole world sees this much, no more. */
function ledgerLine(b) {
  const MODE_ICON = { raid: "🐎", siege: "🏰", revenge: "🗡", bombard: "💥" };
  const outcome =
    b.victor === "none"
      ? yellow("engines traded fire")
      : b.victor === "attacker"
        ? brightGreen(`${b.attackerName} victorious`)
        : blue(`${b.defenderName} holds`);
  const bits = [
    `${red(String(fmt(b.attackerTroopsLost)))}${dim("/")}${red(String(fmt(b.defenderTroopsLost)))} lost`,
    b.attackerGearLost ? yellow(`${b.attackerGearLost} gear`) : "",
    b.wallDamage > 0 ? yellow(`walls −${Math.round(b.wallDamage * 100)}%`) : "",
    b.buildingsHit > 0 ? yellow(`${b.buildingsHit} bldgs hit`) : "",
  ].filter(Boolean);
  console.log(
    `  ${dim("t" + fmt(b.tick))} ${MODE_ICON[b.mode] ?? "⚔"} ${white(b.attackerName)} ${dim(b.mode + "s")} ${white(b.defenderName)} — ${outcome} ${dim("·")} ${bits.join(dim(" · "))}`,
  );
}

function showLedger(battles, total) {
  title();
  console.log(head(`The War Ledger — ${battles.length} of the last ${total} battles`));
  if (battles.length === 0) console.log(italic(gray("  No battles on record. Peace — for now.")));
  for (const b of battles) ledgerLine(b);
  console.log(dim("\n  Heralds tell only the broad tale — composition and plunder stay secret."));
  console.log(dim("  profile <empire> shows one empire's record.\n"));
}

function showProfile(data) {
  const e = data.empire, t = data.totals;
  title();
  const race = RACE_COLOR[e.race] ?? white;
  console.log(head(`The ${e.title} of ${e.name}`));
  console.log(
    `  ${race(e.race)} ${dim("·")} rank ${bold(white("#" + e.rank))} ${dim("·")} score ${bold(white(fmt(e.score)))} ${dim("·")} battles ${green(e.battlesWon + "W")}${dim("/")}${red(e.battlesLost + "L")}${e.clan ? ` ${dim("·")} ${magenta(`[${e.clan}]`)}` : ""}`,
  );
  if (e.surrendered) console.log(yellow("  🏳 surrendered"));
  if (e.shielded) console.log(brightCyan("  🛡 under the newcomer shield"));
  console.log("");
  console.log(head(`The reckoning — ${t.battles} recorded battles`));
  console.log(
    `  troops lost ${red(fmt(t.troopsLost))} ${dim("·")} troops slain ${brightGreen(fmt(t.troopsKilled))} ${dim("·")} gear lost ${yellow(fmt(t.gearLost))}`,
  );
  console.log(
    `  wall damage taken ${red(`−${Math.round(t.wallDamageTaken * 100)}%`)} ${dim("·")} dealt ${brightGreen(`−${Math.round(t.wallDamageDealt * 100)}%`)}`,
  );
  console.log("");
  console.log(head("Recent battles"));
  if (data.recentBattles.length === 0) console.log(italic(gray("  An unbloodied banner.")));
  for (const b of data.recentBattles.slice(0, 10)) ledgerLine(b);
  console.log("");
}

// ── Target resolution ───────────────────────────────────────────────────────

async function resolveTarget(nameOrRank) {
  const { ladder } = await get("/api/rankings");
  const byRank = /^#?\d+$/.test(nameOrRank)
    ? ladder.find((e) => e.rank === Number(String(nameOrRank).replace("#", "")))
    : null;
  const hit =
    byRank ??
    ladder.find((e) => e.name.toLowerCase() === nameOrRank.toLowerCase()) ??
    ladder.find((e) => e.name.toLowerCase().startsWith(nameOrRank.toLowerCase()));
  if (!hit) throw new Error(`No empire matching "${nameOrRank}" on the ladder (try 'rankings').`);
  return hit;
}

// ── Commands ────────────────────────────────────────────────────────────────

const RACES = ["human", "elf", "orc", "troll", "dwarf", "gnoll"];

async function doJoin(rl, args) {
  let [name, race] = args;
  if (!name) name = (await rl.question(gold("  Name your empire: "))).trim();
  if (!race) {
    console.log("  Races: " + RACES.map((r) => (RACE_COLOR[r] ?? white)(r)).join(dim(" · ")));
    race = (await rl.question(gold("  Choose a race [human]: "))).trim() || "human";
  }
  const res = await api("POST", "/api/join", { name, race });
  config = { ...config, server: server(), token: res.token, name: res.name };
  saveConfig(config);
  flagArt(res.name);
  console.log(brightGreen(bold(`  ⚔ ${res.name} enters ${res.era}!`)));
  console.log(`  Account key saved to ${dim(CONFIG_FILE)}`);
  console.log(dim("  The same key opens the website and the forum — one account, one key."));
}

const HELP = `
  ${head("Commands")}
  ${bold("status")} ${dim("(s)")}                     the throne room — everything at a glance
  ${bold("buildings")} ${dim("(b)")}                  levels & next costs
  ${bold("build <id>")} ${dim("/")} ${bold("queue <id>")}        raise a building (queue = Steward ✦)
  ${bold("repair <id|walls>")}             mend a bombarded building
  ${bold("troop <type> <tier> <n>")}       train footman|archer|cavalry × light|medium|heavy
  ${bold("discharge <type> <tier> <n>")}   send soldiers home (gear lost)
  ${bold("train <what> <n>")}              spies | scouts | engineers
  ${bold("tax <pct>")} ${dim("·")} ${bold("rest")} ${dim("·")} ${bold("bank <n>")}     decrees (negative n withdraws)
  ${bold("research [field]")}              show fields / direct the scholars
  ${bold("rankings")} ${dim("(r)")}                   the ladder — your hunting ground
  ${bold("battles [n]")} ${dim("·")} ${bold("profile <who>")}   the public War Ledger · one empire's record
  ${bold("attack <who> <mode>")}           raid | siege | revenge | bombard
  ${bold("spy <who> <op> <n>")} ${dim("·")} ${bold("scout <who>")}   ops: coffers|defences|sabotage|torch|unrest
  ${bold("market")} ${dim("·")} ${bold("buy <res> <n>")} ${dim("·")} ${bold("sell <res> <n> <price>")}
  ${bold("mercs <type> <tier> <n>")} ${dim("·")} ${bold("gear <type> <n>")}   black market · siege works
  ${bold("token")} ${dim("·")} ${bold("link <token> [url]")} ${dim("·")} ${bold("join")}
  ${bold("quit")} ${dim("(q)")}
`;

const SPY_OPS = {
  coffers: "survey_coffers", defences: "map_defences", sabotage: "sabotage_engines",
  torch: "torch_stores", unrest: "incite_unrest",
};

async function dispatch(rl, line) {
  const [verb, ...args] = line.trim().split(/\s+/);
  if (!verb) return;
  switch (verb.toLowerCase()) {
    case "help": case "h": case "?": console.log(HELP); break;
    case "join": await doJoin(rl, args); break;
    case "link": {
      if (!args[0]) throw new Error("link <token> [server-url]");
      config = { ...config, token: args[0], ...(args[1] ? { server: args[1] } : { server: server() }) };
      saveConfig(config);
      const st = await get("/api/state");
      config.name = st.empire.name; saveConfig(config);
      console.log(brightGreen(`  ⚔ Linked to ${bold(st.empire.name)} at ${server()}.`));
      break;
    }
    case "token":
      console.log(`  ${dim("server")} ${server()}`);
      console.log(`  ${dim("token ")} ${config.token ?? gray("(none — 'join' or 'link' first)")}`);
      break;
    case "status": case "s": showStatus(await get("/api/state")); break;
    case "buildings": case "b": showBuildings(await get("/api/state")); break;
    case "build": {
      if (!args[0]) throw new Error("build <building_id> — see 'buildings'");
      await cmd("build", { id: args[0] });
      console.log(brightGreen(`  🏗 The ${args[0].replace(/_/g, " ")} rises.`));
      break;
    }
    case "queue": {
      if (!args[0]) throw new Error("queue <building_id> (Royal Charter)");
      await cmd("queueBuild", { id: args[0] });
      console.log(brightCyan(`  🪶 Queued — the Steward will raise it when the treasury allows.`));
      break;
    }
    case "repair": {
      if (!args[0]) throw new Error("repair <building_id | walls>");
      if (args[0] === "walls") {
        await cmd("repairWalls");
        console.log(brightGreen(`  🔨 The walls are mended.`));
      } else {
        await cmd("repairBuilding", { id: args[0] });
        console.log(brightGreen(`  🔨 The ${args[0].replace(/_/g, " ")} is repaired.`));
      }
      break;
    }
    case "train": {
      const kinds = { spies: "trainSpies", scouts: "trainScouts", engineers: "trainEngineers" };
      const k = kinds[args[0]];
      if (!k || !args[1]) throw new Error("train <spies|scouts|engineers> <n>");
      await cmd(k, { count: Number(args[1]) });
      console.log(brightGreen(`  👥 ${args[1]} ${args[0]} trained.`));
      break;
    }
    case "troop":
    case "equip": {
      if (args.length < 3) throw new Error("troop <footman|archer|cavalry> <light|medium|heavy> <n>");
      await cmd("trainTroops", { type: args[0], tier: args[1], count: Number(args[2]) });
      const plural = { footman: "footmen", archer: "archers", cavalry: "cavalry" }[args[0]] ?? args[0];
      console.log(brightGreen(`  ⚔ ${args[2]} ${args[1]} ${plural} raised from the peasantry.`));
      break;
    }
    case "discharge": {
      if (args.length < 3) throw new Error("discharge <footman|archer|cavalry> <light|medium|heavy> <n>");
      await cmd("dischargeTroops", { type: args[0], tier: args[1], count: Number(args[2]) });
      const plural = { footman: "footmen", archer: "archers", cavalry: "cavalry" }[args[0]] ?? args[0];
      console.log(brightGreen(`  🏡 ${args[2]} ${args[1]} ${plural} sent home to civilian life.`));
      break;
    }
    case "tax": {
      if (args[0] === undefined) throw new Error("tax <0..100>");
      await cmd("setTax", { rate: Number(args[0]) / 100 });
      console.log(yellow(`  📜 Decreed: the tax stands at ${args[0]}%.`));
      break;
    }
    case "rest": await cmd("rest"); console.log(green("  😴 The army rests (+20 stamina).")); break;
    case "bank": {
      await cmd("bank", { amount: Number(args[0]) });
      console.log(RES_COLOR.gold(`  🏦 ${Number(args[0]) >= 0 ? "Deposited" : "Withdrew"} ${fmt(Math.abs(Number(args[0])))} gold.`));
      break;
    }
    case "research": {
      const st = await get("/api/state");
      if (!args[0]) {
        console.log(head(`The Collegium — +${st.research.ratePerTurn} RP/turn`));
        for (const [f, lvl] of Object.entries({ crop_rotation: 0, forestry: 0, masonry: 0, deep_smelting: 0, tradecraft: 0, pathfinding: 0, art_of_war: 0, shieldcraft: 0, siegecraft: 0, statecraft: 0 })) {
          const cur = st.research.levels[f] ?? lvl;
          const active = st.research.activeField === f;
          console.log(`  ${active ? brightCyan("⚗") : " "} ${(active ? brightCyan : white)(f.padEnd(14))} ${bar(cur / 5, 10, brightMagenta)} ${cur}/5 ${dim(`banked ${fmt(st.research.banked[f] ?? 0)}`)}`);
        }
        console.log(dim("  research <field> directs the scholars.\n"));
      } else {
        await cmd("setResearch", { field: args[0] });
        console.log(brightMagenta(`  📚 The scholars turn to ${args[0].replace(/_/g, " ")}.`));
      }
      break;
    }
    case "rankings": case "r": showRankings(await get("/api/rankings")); break;
    case "battles": {
      const n = Math.min(100, Math.max(1, Number(args[0]) || 25));
      const { battles } = await get("/api/battles");
      showLedger(battles.slice(0, n), battles.length);
      break;
    }
    case "profile": case "p": {
      if (!args[0]) throw new Error("profile <empire|#rank>");
      const target = await resolveTarget(args.join(" "));
      showProfile(await get(`/api/empire/${target.id}`));
      break;
    }
    case "attack": {
      if (args.length < 2) throw new Error("attack <empire|#rank> <raid|siege|revenge|bombard>");
      const target = await resolveTarget(args[0]);
      const mode = args[1].toLowerCase();
      console.log(dim(`  Marching on ${target.name} (#${target.rank}, score ${fmt(target.score)})…`));
      const res = await cmd("attack", { targetId: target.id, mode });
      if (res.battleId) {
        const st = await get("/api/state");
        showBattle(await get(`/api/battle/${res.battleId}`), st.empire.id);
      } else {
        console.log(res.message ?? "done");
      }
      break;
    }
    case "spy": {
      if (args.length < 3) throw new Error(`spy <empire> <${Object.keys(SPY_OPS).join("|")}> <spies>`);
      const target = await resolveTarget(args[0]);
      const op = SPY_OPS[args[1]] ?? args[1];
      const res = await cmd("spy", { targetId: target.id, op, spies: Number(args[2]) });
      console.log(brightMagenta(`  🗡 ${res.message}`));
      break;
    }
    case "scout": {
      if (!args[0]) throw new Error("scout <empire>");
      const target = await resolveTarget(args[0]);
      const res = await cmd("scout", { targetId: target.id });
      console.log(brightCyan(`  👁 ${res.message}`));
      break;
    }
    case "market": case "m": showMarket(await get("/api/market")); break;
    case "buy": {
      if (args.length < 2) throw new Error("buy <food|wood|stone|ore> <amount>");
      await cmd("marketBuy", { resource: args[0], amount: Number(args[1]) });
      console.log(brightGreen(`  ⚖ Bought ${fmt(Number(args[1]))} ${args[0]} from the Bazaar.`));
      break;
    }
    case "sell": {
      if (args.length < 3) throw new Error("sell <food|wood|stone|ore> <amount> <price-per-unit>");
      await cmd("marketPost", { resource: args[0], amount: Number(args[1]), price: Number(args[2]) });
      console.log(brightGreen(`  ⚖ Caravan loaded: ${fmt(Number(args[1]))} ${args[0]} @ ${args[2]}g.`));
      break;
    }
    case "mercs": {
      if (args.length < 3) throw new Error("mercs <footman|archer|cavalry> <light|medium|heavy> <n>");
      await cmd("buyMercs", { type: args[0], tier: args[1], count: Number(args[2]) });
      console.log(magenta(`  💰 ${args[2]} ${args[1]} ${args[0]} sellswords join (they die first; feed them gold).`));
      break;
    }
    case "gear": {
      if (args.length < 2) throw new Error("gear <ropes|ladders|rams|ballistae|trebuchets> <n>");
      await cmd("buySiegeGear", { type: args[0], count: Number(args[1]) });
      console.log(cyan(`  🏹 ${args[1]} ${args[0]} forged in the War Foundry.`));
      break;
    }
    case "quit": case "q": case "exit": return "quit";
    default:
      console.log(red(`  Unknown command "${verb}" — try 'help'.`));
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    if (argv.length > 0) {
      await dispatch(rl, argv.join(" "));
      rl.close();
      return;
    }

    // Interactive court.
    bigBanner();
    console.log(italic(gray("\n  the terminal court — same empire as the web, in glorious ANSI\n")));
    if (!config.token) {
      console.log(yellow("  No account bound. ") + `'${bold("join")}' founds an empire, '${bold("link <key>")}' binds an existing account (key: Command View → “Your magic link”).`);
    } else {
      try {
        const st = await get("/api/state");
        console.log(`  Welcome back, ${gold(st.empire.name)} ${dim(`— rank #${st.empire.rank}, ${st.meta.era}`)}`);
        if (st.empire.starving) console.log(brightRed(bold("  ☠ YOUR PEOPLE ARE STARVING.")));
      } catch (e) {
        console.log(red(`  ${e.message}`));
      }
    }
    console.log(dim("  'help' lists commands.\n"));

    for (;;) {
      const line = await rl.question(bold(brightRed("⚔ woe")) + dim(" ▸ "));
      try {
        if ((await dispatch(rl, line)) === "quit") break;
      } catch (e) {
        console.log(brightRed(`  ✗ ${e.message}`));
      }
    }
    console.log(gray("  The court adjourns.\n"));
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error(brightRed(`✗ ${e.message}`));
  process.exit(1);
});
