import { cookies } from "next/headers";
import { ResIcon } from "@/components/ResIcon";
import { TURNS_PER_DAY } from "@/lib/constants";
import { foodUpkeepPerTurn, productionRates, type Player } from "@/lib/engine";
import type { WorldMeta } from "@/lib/server/store";
import { leaveSession, toggleTheme } from "@/app/actions";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const hrs = (turns: number) => (turns / 6).toFixed(turns < 6 ? 1 : 0); // 6 turns/hour

export async function ResourceBar({ player, meta }: { player: Player; meta: WorldMeta }) {
  const ticksToDawn = TURNS_PER_DAY - (meta.tickNumber % TURNS_PER_DAY);
  const dark = (await cookies()).get("woe_theme")?.value === "dark";

  // Food is the only upkeep resource, so it's the one that can "run out": when
  // consumption outpaces production, flag how much runway is left. The bulk
  // resources have no upkeep, so "low" for them simply means an empty store.
  const rates = productionRates(player);
  const upkeep = foodUpkeepPerTurn(player);
  const netFood = rates.food - upkeep;
  const foodRunway = netFood < 0 ? player.resources.food / -netFood : Infinity;

  let foodCls = "";
  let foodTitle = "Food — your people eat 0.1 each per turn";
  if (player.starving || player.resources.food === 0) {
    foodCls = "res-crit";
    foodTitle = "Starving — production, growth, and attacks are frozen until fed";
  } else if (netFood < 0 && foodRunway <= 12) {
    foodCls = "res-crit";
    foodTitle = `Food is draining fast — about ${hrs(foodRunway)}h until starvation. Assign farmers or buy food.`;
  } else if (netFood < 0 && foodRunway <= 72) {
    foodCls = "res-low";
    foodTitle = `Food is shrinking — roughly ${hrs(foodRunway)}h of stores left at this rate.`;
  }

  const bulk = (v: number) => (v === 0 ? "res-low" : "");

  return (
    <div className="topbar">
      <div className="title">
        WAR OF EMPIRES
        <small>
          {meta.eraName} · turn {meta.tickNumber.toLocaleString()} · dawn in {ticksToDawn} turns
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
        <div className={`res ${bulk(player.gold)}`} title="Gold on hand — loose coin, plundered when your castle is sacked. Bank it in the Counting House.">
          <ResIcon kind="gold" size={28} />
          {fmt(player.gold)}
        </div>
        <div className={`res ${foodCls}`} title={foodTitle}>
          <ResIcon kind="food" size={28} />
          {fmt(player.resources.food)}
        </div>
        <div className={`res ${bulk(player.resources.wood)}`} title="Wood — timber in your stores">
          <ResIcon kind="wood" size={28} />
          {fmt(player.resources.wood)}
        </div>
        <div className={`res ${bulk(player.resources.stone)}`} title="Stone — in your stores">
          <ResIcon kind="stone" size={28} />
          {fmt(player.resources.stone)}
        </div>
        <div className={`res ${bulk(player.resources.ore)}`} title="Ore — in your stores">
          <ResIcon kind="ore" size={28} />
          {fmt(player.resources.ore)}
        </div>
        <div className="res" title="Action turns — attacks cost 10, +2 per game turn">
          <ResIcon kind="turns" size={28} />
          {player.turnsAvailable}
        </div>
      </div>
    </div>
  );
}
