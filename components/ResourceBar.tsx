import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { ResIcon } from "@/components/ResIcon";
import { ResourceDeltas } from "@/components/ResourceDeltas";
import { TickCountdown } from "@/components/TickCountdown";
import { ACTION_TURNS, POP_GROWTH, SPY_TURNS } from "@/lib/constants";
import {
  bankedRes,
  civilians,
  foodUpkeepPerTurn,
  growthBreakdown,
  mercTroops,
  regularTroops,
  troopTotal,
  productionRates,
  taxIncomePerTurn,
  vacantHousing,
  type Player,
  type Resource,
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
  const civ = civilians(player);
  const workers = Object.values(player.workers).reduce((sum, n) => sum + n, 0);
  const regulars = regularTroops(player) + player.army.siegeEngineers;

  // Per-turn truths for the popovers: production, tax, upkeep, and what's vaulted.
  const rates = productionRates(player);
  const tax = taxIncomePerTurn(player);
  const upkeep = foodUpkeepPerTurn(player);
  const netFood = rates.food - upkeep;
  const banked = bankedRes(player);
  // The bar shows what you OWN — loose plus vaulted — because that is what you
  // can actually spend (purchases draw loose first, then the vault). The split
  // is what a raider cares about, so it lives in the popover rather than the
  // headline. Showing the loose figure alone read as an empty treasury to any
  // Charter holder, whose Steward banks every loose sack each tick.
  const heldGold = player.gold + player.bankedGold;
  const held = (k: Resource) => player.resources[k] + banked[k];
  // Runway is measured against the WHOLE larder: upkeep eats loose first and
  // then opens the granary, so the vault is genuinely part of the buffer.
  const foodRunway = netFood < 0 ? held("food") / -netFood : Infinity;

  let foodCls = "";
  if (player.starving || held("food") === 0) foodCls = "res-crit";
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
        { label: "Held (loose + vaulted)", value: fmt(held(key)), tone: "good" },
        { label: "· Loose — raidable", value: fmt(player.resources[key]) },
        { label: "· Vaulted — safe", value: fmt(banked[key]) },
      ]}
      note="The figure on the bar is everything you hold; purchases spend the loose pile first and dip into the vault only for the remainder. Only the loose half can be looted."
    >
      <div className={`res ${bulk(held(key))}`} data-res={key}>
        <ResIcon kind={key} size={28} />
        {fmt(held(key))}
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
            { label: "Held (loose + banked)", value: fmt(heldGold), tone: "good" },
            { label: "· Loose — lootable", value: fmt(player.gold) },
            { label: "· Banked — safe", value: fmt(player.bankedGold) },
          ]}
          note="The figure on the bar is everything you hold; purchases spend loose coin first and reach into the Counting House only for the remainder. Only the loose half is plundered when your castle is sacked."
        >
          <div className={`res ${bulk(heldGold)}`} data-res="gold" title="Gold" aria-label="Gold">
            <ResIcon kind="gold" size={28} />
            {fmt(heldGold)}
          </div>
        </ResTip>
        <ResTip
          heading="Food"
          rows={[
            { label: "Production / turn", value: signed(rates.food), tone: "good" },
            { label: "Upkeep / turn", value: signed(-upkeep), tone: "bad" },
            { label: "Net / turn", value: signed(netFood), tone: netFood >= 0 ? "good" : "bad" },
            { label: "Held (loose + vaulted)", value: fmt(held("food")), tone: "good" },
            { label: "· Loose — raidable", value: fmt(player.resources.food) },
            { label: "· Vaulted — safe", value: fmt(banked.food) },
          ]}
          note={foodNote}
        >
          <div className={`res ${foodCls}`} data-res="food" title="Food" aria-label="Food">
            <ResIcon kind="food" size={28} />
            {fmt(held("food"))}
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
            // Rest used to be listed here at −5. It costs no turns at all now,
            // only food, which is the whole point: you should never be choosing
            // between resting and marching.
            { label: "Rest the army", value: "free — food only", tone: "good" },
          ]}
          note={`Capped at ${ACTION_TURNS.CAP}. Spend them — capped turns are wasted turns. Spies and scouts run on their own, scarcer clock.`}
        >
          <div className="res" data-res="turns" title="Action turns" aria-label="Action turns">
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

        {/* Who you are, in four numbers. These were only on the Command View,
            which meant checking your own headcount cost a navigation. */}
        <ResTip
          heading="People"
          rows={[
            { label: "Idle peasants", value: fmt(player.idlePeasants) },
            { label: "At work", value: fmt(workers) },
            { label: "Housing", value: `${fmt(civ)} / ${fmt(beds + civ)}` },
          ]}
          note="Civilians only — troops, spies and scouts are counted beside this. Population is what your tax income is drawn from."
        >
          <div className="res" data-res="people" title="Civilian population">
            <span style={{ fontSize: 20, lineHeight: 1 }}>👥</span>
            {fmt(civ)}
          </div>
        </ResTip>

        <ResTip
          heading="The battle line"
          rows={[
            { label: "Footmen", value: fmt(troopTotal(player.army.footmen)) },
            { label: "Archers", value: fmt(troopTotal(player.army.archers)) },
            { label: "Cavalry", value: fmt(troopTotal(player.army.cavalry)) },
            { label: "Engineers", value: fmt(player.army.siegeEngineers) },
            { label: "Sellswords", value: fmt(mercTroops(player.army.mercenaries)) },
          ]}
          note="Regulars only in the headline figure — mercenaries are listed but never counted toward the victory floor, because gold should not buy a throne."
        >
          <div className="res" data-res="troops" title="Regular troops">
            <span style={{ fontSize: 20, lineHeight: 1 }}>⚔️</span>
            {fmt(regulars)}
          </div>
        </ResTip>

        <ResTip
          heading="The shadow arms"
          rows={[
            { label: "Spies", value: fmt(player.army.spies) },
            { label: "Scouts", value: fmt(player.army.scouts) },
            { label: "Hired spies", value: fmt(player.army.mercenaries.spies) },
            { label: "Hired scouts", value: fmt(player.army.mercenaries.scouts) },
          ]}
          note="Spies strike, scouts watch — and both spend from the same pool of spy turns, so every turn spent watching is a turn not spent striking."
        >
          <div className="res" data-res="agents" title="Spies · scouts">
            <span style={{ fontSize: 18, lineHeight: 1 }}>🗡</span>
            {fmt(player.army.spies)}
            <span style={{ opacity: 0.55, margin: "0 2px" }}>·</span>
            <span style={{ fontSize: 18, lineHeight: 1 }}>🏹</span>
            {fmt(player.army.scouts)}
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
      {/* The throne. Just the name — signing out is a rare, destructive-feeling
          action and does not deserve a permanent button beside it. It lives one
          hover (or keyboard focus) away instead. */}
      <div className="throne">
        <button type="button" className="throne-name" aria-haspopup="menu" aria-expanded="false">
          👑 {player.name}
        </button>
        <div className="throne-pop" role="menu">
          <form action={leaveSession}>
            <button type="submit" role="menuitem" title="Leave this throne and return to the gate">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
