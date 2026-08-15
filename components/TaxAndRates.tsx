"use client";

import { useState } from "react";
import { CmdForm } from "@/components/CmdForm";
import { Info } from "@/components/Info";
import { ResIcon } from "@/components/ResIcon";
import { StatTile } from "@/components/StatTile";
import { TaxSlider } from "@/components/TaxSlider";
import { ACTION_GUIDE, ACTION_INFO, TURNS_PER_DAY } from "@/lib/constants";
import {
  civilians,
  foodUpkeepPerTurn,
  popPerDay,
  productionRates,
  taxIncomePerTurn,
  vacantHousing,
  type Player,
  type Resource,
} from "@/lib/engine";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

const RES: { key: Resource; label: string; icon: string }[] = [
  { key: "wood", label: "Wood", icon: "🪵" },
  { key: "stone", label: "Stone", icon: "🪨" },
  { key: "ore", label: "Ore", icon: "⚒️" },
];

/**
 * The tax dial and the per-turn figures it governs, on one piece of state.
 *
 * Tax is the only decision on the Command View whose whole point is a trade —
 * every gold it gains costs production — and the two halves of that trade used
 * to live on opposite sides of a page reload. You dragged the slider, guessed,
 * decreed, and only then saw what it did to your ore.
 *
 * So the figures are computed from the slider's LOCAL rate rather than the saved
 * one, and they move as it moves. Nothing is committed until Decree; the tiles
 * are a projection, and they say so while the two differ.
 *
 * IT CALLS THE REAL ENGINE FUNCTIONS on a copy of the player with the tax rate
 * swapped, rather than re-deriving the formulas here. A second implementation
 * would drift from the tick — and this panel's entire job is to promise what the
 * next tick will actually do.
 */
export function TaxAndRates({ player }: { player: Player }) {
  const [rate, setRate] = useState(player.taxRate);

  // The projection: the same empire, taxed differently.
  const preview: Player = rate === player.taxRate ? player : { ...player, taxRate: rate };
  const dirty = Math.abs(rate - player.taxRate) > 1e-9;

  const rates = productionRates(preview);
  const gold = taxIncomePerTurn(preview);
  const upkeep = foodUpkeepPerTurn(preview);
  const foodNet = rates.food - upkeep;
  const beds = vacantHousing(preview);
  const perDay = popPerDay(preview);

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 13.5,
            color: "var(--ink-soft)",
            marginBottom: 3,
            display: "flex",
            gap: 5,
            alignItems: "center",
          }}
        >
          <span>The tax dial</span>
          <Info tip={ACTION_INFO.tax} guide={ACTION_GUIDE.tax} />
        </div>
        <CmdForm name="setTax" path="/">
          <TaxSlider
            taxRate={player.taxRate}
            civilians={civilians(player)}
            rate={rate}
            onRate={setRate}
          />
        </CmdForm>
        {dirty && (
          <p className="tax-preview">
            Showing what <b>{Math.round(rate * 100)}%</b> would do — nothing changes until you
            press <b>Decree</b>.
          </p>
        )}
      </div>

      <div className={`stat-grid${dirty ? " is-preview" : ""}`}>
        <StatTile
          icon={<ResIcon kind="gold" size={22} />}
          label="Gold / turn"
          value={`+${fmt(gold)}`}
          sub={`≈ ${fmt(gold * TURNS_PER_DAY)} / day`}
        />
        <StatTile
          icon="🍞"
          label="Food / turn"
          value={`${foodNet >= 0 ? "+" : "−"}${fmt(Math.abs(foodNet))}`}
          sub={`+${fmt(rates.food)} grown · −${fmt(upkeep)} eaten`}
          tone={foodNet < 0 ? "bad" : undefined}
        />
        {RES.map(({ key, label, icon }) => (
          <StatTile
            key={key}
            icon={icon}
            label={`${label} / turn`}
            value={`+${fmt(rates[key])}`}
            sub={`≈ ${fmt(rates[key] * TURNS_PER_DAY)} / day`}
          />
        ))}
        <StatTile
          icon="🧺"
          label="Settlers / day"
          value={
            player.starving
              ? "0"
              : beds < perDay
                ? // arrivals = min(perDay, vacant beds) — the rest walk on, lost
                  `+${fmt(Math.min(perDay, beds))} of ${fmt(perDay)}`
                : `+${fmt(perDay)}`
          }
          sub={
            player.starving
              ? "halted — the people starve"
              : beds === 0
                ? "housing FULL — every arrival walks on, lost"
                : beds < perDay
                  ? `only ${fmt(beds)} beds — the rest are lost`
                  : `room for ${fmt(beds)} more`
          }
          tone={player.starving ? "bad" : beds < perDay ? "warn" : "good"}
        />
      </div>
    </>
  );
}
