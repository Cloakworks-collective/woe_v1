import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { ResIcon } from "@/components/ResIcon";
import { ResourceDeltas } from "@/components/ResourceDeltas";
import { TickCountdown } from "@/components/TickCountdown";
import { ACTION_TURNS, TURNS_PER_DAY } from "@/lib/constants";
import { bankedRes, foodUpkeepPerTurn, productionRates, taxIncomePerTurn, type Player } from "@/lib/engine";
import type { WorldMeta } from "@/lib/server/store";
import { leaveSession, toggleTheme } from "@/app/actions";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const hrs = (turns: number) => (turns / 6).toFixed(turns < 6 ? 1 : 0); // 6 turns/hour
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n))}`;

/** A hover popover for a top-bar figure — drops DOWN, tabular like the cost tips. */
function ResTip({
  heading,
  rows,
  note,
  children,
}: {
  heading: string;
  rows: { label: string; value: string; tone?: "good" | "bad" }[];
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="tip tip-down" tabIndex={0}>
      {children}
      <span className="tip-pop costtip" role="tooltip">
        <b>{heading}</b>
        <table className="costtip-tbl">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.label}</td>
                <td className={`num ${r.tone === "bad" ? "rate-bad" : r.tone === "good" ? "rate-good" : ""}`}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {note && <span className="costtip-note">{note}</span>}
      </span>
    </span>
  );
}

/** A5 — where we sit in the 144-turn day, and its name/glyph, for the sky band. */
function timeOfDay(tickNumber: number): { t: number; phase: "dawn" | "day" | "dusk" | "night"; glyph: string; label: string } {
  const t = (tickNumber % TURNS_PER_DAY) / TURNS_PER_DAY; // 0 = just after dawn → 1 = next dawn
  if (t < 0.06) return { t, phase: "dawn", glyph: "🌅", label: "Dawn breaks" };
  if (t < 0.5) return { t, phase: "day", glyph: "☀️", label: "Daylight" };
  if (t < 0.62) return { t, phase: "dusk", glyph: "🌇", label: "Dusk" };
  if (t < 0.9) return { t, phase: "night", glyph: "🌙", label: "Night" };
  return { t, phase: "dawn", glyph: "🌄", label: "Dawn approaches" };
}

export async function ResourceBar({ player, meta }: { player: Player; meta: WorldMeta }) {
  const ticksToDawn = TURNS_PER_DAY - (meta.tickNumber % TURNS_PER_DAY);
  const sky = timeOfDay(meta.tickNumber);
  const dark = (await cookies()).get("woe_theme")?.value === "dark";

  // Per-turn truths for the popovers: production, tax, upkeep, and what's vaulted.
  const rates = productionRates(player);
  const tax = taxIncomePerTurn(player);
  const upkeep = foodUpkeepPerTurn(player);
  const netFood = rates.food - upkeep;
  const banked = bankedRes(player);
  const foodRunway = netFood < 0 ? player.resources.food / -netFood : Infinity;

  let foodCls = "";
  if (player.starving || player.resources.food === 0) foodCls = "res-crit";
  else if (netFood < 0 && foodRunway <= 12) foodCls = "res-crit";
  else if (netFood < 0 && foodRunway <= 72) foodCls = "res-low";

  const foodNote = player.starving
    ? "STARVING — production, growth, and attacks are frozen until your people are fed."
    : netFood < 0
      ? `Stores are draining — about ${hrs(foodRunway)}h until starvation at this rate. Assign farmers or buy food.`
      : "Your people eat 0.1 food each per turn.";

  const bulk = (v: number) => (v === 0 ? "res-low" : "");

  const bulkTip = (key: "wood" | "stone" | "ore", label: string) => (
    <ResTip
      heading={label}
      rows={[
        { label: "Production / turn", value: signed(rates[key]), tone: "good" },
        { label: "Loose (raidable)", value: fmt(player.resources[key]) },
        { label: "Vaulted (safe)", value: fmt(banked[key]) },
      ]}
      note="Loose goods can be looted; store them from the Command View to shelter them."
    >
      <div className={`res ${bulk(player.resources[key])}`} data-res={key}>
        <ResIcon kind={key} size={28} />
        {fmt(player.resources[key])}
      </div>
    </ResTip>
  );

  return (
    <div className="topbar" data-daytime={sky.phase} style={{ ["--day-t" as string]: sky.t }}>
      <div className="topbar-sky" aria-hidden="true">
        <span className="topbar-sun" style={{ left: `${Math.round(sky.t * 100)}%` }}>
          {sky.glyph}
        </span>
      </div>
      <div className="title">
        WAR OF EMPIRES
        <small>
          <span className="tip tip-down" tabIndex={0}>
            <span style={{ cursor: "help" }}>
              {sky.glyph} {meta.eraName} · turn {meta.tickNumber.toLocaleString()} · dawn in {ticksToDawn} turns
            </span>
            <span className="tip-pop costtip" role="tooltip">
              <b>The turning of the world — {sky.label.toLowerCase()}</b>
              <span className="costtip-body">
                One turn every 10 minutes — production, research, and upkeep run each turn, even
                while you sleep. At <b>dawn</b> (every {TURNS_PER_DAY} turns) the big events fire:
                settlers arrive, mercenaries draw their wages, and unguarded peasants scatter if
                your troops sit below the 30% line.
              </span>
            </span>
          </span>
          <TickCountdown lastTickAt={meta.lastTickAt} />
        </small>
      </div>
      <form action={toggleTheme} className="whoami" style={{ marginLeft: "auto" }}>
        <input type="hidden" name="to" value={dark ? "light" : "dark"} />
        <button
          className="theme-toggle"
          type="submit"
          title={dark ? "Switch to the parchment (light) theme" : "Switch to the midnight (dark) theme"}
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        >
          {dark ? "☀️" : "🌙"}
        </button>
      </form>
      <form action={leaveSession} className="whoami">
        <span title="Your empire">👑 {player.name}</span>
        <button title="Leave this throne and return to the gate">abdicate</button>
      </form>
      <div className="res-group">
        <ResTip
          heading="Gold"
          rows={[
            { label: "Tax income / turn", value: signed(tax), tone: "good" },
            { label: "Loose (lootable)", value: fmt(player.gold) },
            { label: "Banked (safe)", value: fmt(player.bankedGold) },
          ]}
          note="Loose coin is plundered when your castle is sacked — bank it in the Counting House."
        >
          <div className={`res ${bulk(player.gold)}`} data-res="gold">
            <ResIcon kind="gold" size={28} />
            {fmt(player.gold)}
          </div>
        </ResTip>
        <ResTip
          heading="Food"
          rows={[
            { label: "Production / turn", value: signed(rates.food), tone: "good" },
            { label: "Upkeep / turn", value: signed(-upkeep), tone: "bad" },
            { label: "Net / turn", value: signed(netFood), tone: netFood >= 0 ? "good" : "bad" },
            { label: "Vaulted (safe)", value: fmt(banked.food) },
          ]}
          note={foodNote}
        >
          <div className={`res ${foodCls}`} data-res="food">
            <ResIcon kind="food" size={28} />
            {fmt(player.resources.food)}
          </div>
        </ResTip>
        {bulkTip("wood", "Wood")}
        {bulkTip("stone", "Stone")}
        {bulkTip("ore", "Ore")}
        <ResTip
          heading="Action turns"
          rows={[
            { label: "Regain / game turn", value: `+${ACTION_TURNS.PER_GAME_TURN}`, tone: "good" },
            { label: "Attack", value: `−${ACTION_TURNS.ATTACK_COST}` },
            { label: "Spy mission", value: `−${ACTION_TURNS.SPY_MISSION_COST}` },
            { label: "Scout recon", value: `−${ACTION_TURNS.SCOUT_RECON_COST}` },
            { label: "Rest the army", value: `−${ACTION_TURNS.REST_COST}` },
          ]}
          note={`Capped at ${ACTION_TURNS.CAP}. Spend them — capped turns are wasted turns.`}
        >
          <div className="res" data-res="turns">
            <ResIcon kind="turns" size={28} />
            {player.turnsAvailable}
          </div>
        </ResTip>
      </div>
      <ResourceDeltas
        playerId={player.id}
        tick={meta.tickNumber}
        gold={player.gold}
        food={player.resources.food}
        wood={player.resources.wood}
        stone={player.resources.stone}
        ore={player.resources.ore}
        turns={player.turnsAvailable}
      />
    </div>
  );
}
