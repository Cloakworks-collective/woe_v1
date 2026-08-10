import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { ResIcon } from "@/components/ResIcon";
import { ResourceDeltas } from "@/components/ResourceDeltas";
import { TickCountdown } from "@/components/TickCountdown";
import { ACTION_TURNS, POP_GROWTH, SPY_TURNS } from "@/lib/constants";
import {
  bankedRes,
  foodUpkeepPerTurn,
  growthBreakdown,
  productionRates,
  taxIncomePerTurn,
  vacantHousing,
  type Player,
} from "@/lib/engine";
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

/**
 * The holdings row — gold, goods, turns.
 *
 * Split from the identity row (TopBar below) so the two can sit on opposite
 * sides of the main nav: you steer by the nav, then glance at what you hold.
 * The crown, the theme switch and the abdicate button stay up top where they
 * have always been.
 */
export function ResourceBar({ player, meta }: { player: Player; meta: WorldMeta }) {
  // Tomorrow's intake, and how much of it there is actually room for.
  const g = growthBreakdown(player);
  const beds = vacantHousing(player);
  const arriving = player.starving ? 0 : Math.min(g.total, beds);

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
    <div className="topbar topbar-res">
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
            { label: "Rest the army", value: `−${ACTION_TURNS.REST_COST}` },
          ]}
          note={`Capped at ${ACTION_TURNS.CAP}. Spend them — capped turns are wasted turns. Spies and scouts run on their own, scarcer clock.`}
        >
          <div className="res" data-res="turns">
            <ResIcon kind="turns" size={28} />
            {player.turnsAvailable}
          </div>
        </ResTip>
        {/* The covert clock. Half the army's rate and a far lower ceiling, and
            spies and scouts both draw from it — so scouting a rival and robbing
            them are competing claims on the same budget. */}
        <ResTip
          heading="Spy turns"
          rows={[
            { label: "Regain / game turn", value: `+${SPY_TURNS.PER_GAME_TURN}`, tone: "good" },
            { label: "Scout a target", value: "≈1 per 6 rangers sent" },
            { label: "Sabotage", value: "≈1 per 2 agents sent" },
            { label: "Steal research", value: "1 per agent sent" },
          ]}
          note={`Capped at ${SPY_TURNS.CAP} — about a day and a half. Spies AND scouts spend from this one pool, so every turn spent watching is a turn not spent striking.`}
        >
          <div className="res" data-res="spyturns" title="Spy turns">
            <span style={{ fontSize: 22, lineHeight: 1 }}>🗝</span>
            {player.spyTurnsAvailable ?? 0}
          </div>
        </ResTip>

        {/* Settlers arriving at the next dawn. Shown as what will ACTUALLY land
            (capped by empty beds), because "+64/day" beside a full Hearthstead
            is a promise the game will not keep. */}
        <ResTip
          heading="Settlers at dawn"
          rows={[
            { label: "Base", value: `+${g.base}`, tone: "good" },
            { label: "Safety (garrison)", value: `+${g.safety} / 10`, tone: g.safety > 0 ? "good" : undefined },
            { label: "Prosperity (resource buildings)", value: `+${g.prosperity} / 40`, tone: g.prosperity > 0 ? "good" : undefined },
            { label: "Walls", value: `+${g.walls} / 40`, tone: g.walls > 0 ? "good" : undefined },
            { label: "Free beds", value: fmt(beds), tone: beds < g.total ? "bad" : undefined },
          ]}
          note={
            player.starving
              ? "Nobody comes to a starving town — recruitment is halted until your people eat."
              : beds < g.total
                ? `Only ${fmt(beds)} will find a bed; the other ${fmt(g.total - beds)} walk on and are lost. Raise the Hearthstead.`
                : `${g.total}/day of a possible ${POP_GROWTH.MAX}. Arrivals beyond your empty beds are lost, never queued.`
          }
        >
          <div
            className={`res${arriving === 0 ? " res-crit" : beds < g.total ? " res-warn" : ""}`}
            data-res="settlers"
            title="Settlers arriving at the next dawn"
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>🧺</span>
            +{fmt(arriving)}
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

/**
 * The identity row: the realm's name, the era clock, the theme switch and the
 * throne. Rendered ABOVE the main nav — this is who and when you are, and it
 * does not move.
 */
export async function TopBar({
  player,
  meta,
  children,
}: {
  player: Player;
  meta: WorldMeta;
  /** The navigation slot — rendered inline between the realm's name and the
   *  throne, so the whole of "where am I / where can I go / who am I" is ONE
   *  bar. Two bars total; three read as a stack of unrelated strips. */
  children?: React.ReactNode;
}) {
  const dark = (await cookies()).get("woe_theme")?.value === "dark";
  return (
    <div className="topbar">
      <div className="title">
        WAR OF EMPIRES
        <small>
          {meta.eraName} · turn {meta.tickNumber.toLocaleString()}
          <TickCountdown lastTickAt={meta.lastTickAt} />
        </small>
      </div>
      {children}
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
    </div>
  );
}
