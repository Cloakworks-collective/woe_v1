import { existsSync } from "node:fs";
import { join } from "node:path";
import { Art } from "@/components/Art";
import { BUILDING_INFO, maxLevel, type BuildingId } from "@/lib/constants";
import { level, type Player } from "@/lib/engine";

// Even-thirds level → tier (1/2/3). Counted buildings (housing/barracks) tier
// by count; everything else splits its level range into three bands.
function tierOf(id: BuildingId, lvl: number): 0 | 1 | 2 | 3 {
  if (lvl <= 0) return 0;
  const max = maxLevel(id);
  if (!Number.isFinite(max)) return lvl <= 5 ? 1 : lvl <= 15 ? 2 : 3;
  const band = max / 3;
  return lvl <= band ? 1 : lvl <= 2 * band ? 2 : 3;
}

// Isometric layout — hand-placed plots (x/y as % of the scene). Back rows sit
// higher (smaller y) and are drawn behind; resource camps ring the outskirts.
type Plot = { id: BuildingId; x: number; y: number; w?: number };
const LAYOUT: Plot[] = [
  // outskirts — resource camps & fields (back)
  { id: "grange", x: 72, y: 12, w: 150 },
  { id: "sawyers_mill", x: 16, y: 16 },
  { id: "muster_hall", x: 44, y: 10 },
  // upper-mid
  { id: "war_foundry", x: 60, y: 24 },
  { id: "collegium", x: 84, y: 26 },
  { id: "masons_quarry", x: 9, y: 30 },
  // middle band
  { id: "shadow_guild", x: 28, y: 36 },
  { id: "market_square", x: 47, y: 40, w: 150 },
  { id: "rangers_lodge", x: 68, y: 38 },
  { id: "knights_stables", x: 88, y: 44 },
  { id: "deepvein_mine", x: 12, y: 50 },
  // lower-mid
  { id: "forge", x: 33, y: 52 },
  { id: "counting_house", x: 54, y: 54 },
  { id: "drill_yard", x: 75, y: 56 },
  // front rows
  { id: "granary", x: 20, y: 66 },
  { id: "hearthstead", x: 43, y: 66 },
  { id: "fletchers_range", x: 63, y: 68 },
  { id: "timberyard", x: 84, y: 68 },
  { id: "masons_yard", x: 30, y: 80 },
  { id: "walls", x: 51, y: 82, w: 160 },
  { id: "ironhold", x: 71, y: 82 },
];

function villageArt(id: BuildingId, tier: number): string | null {
  const rel = `village/${id}/${tier}`;
  return existsSync(join(process.cwd(), "public", "art", `${rel}.png`)) ? rel : null;
}

export function VillageView({ player }: { player: Player }) {
  const drawn = LAYOUT.map((plot) => {
    const lvl = level(player, plot.id);
    const tier = tierOf(plot.id, lvl);
    if (tier === 0) return null;
    const art = villageArt(plot.id, tier);
    if (!art) return null;
    const w = plot.w ?? 130;
    return (
      <div
        key={plot.id}
        className="vill-b"
        style={{ left: `${plot.x}%`, top: `${plot.y}%`, width: w, zIndex: Math.round(plot.y) }}
        title={`${BUILDING_INFO[plot.id].title} — level ${lvl} (tier ${tier})`}
      >
        <Art path={art} size={w} title={BUILDING_INFO[plot.id].title} />
      </div>
    );
  });
  const rendered = drawn.filter(Boolean).length;

  return (
    <>
      <div className="vill">{drawn}</div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "8px 0 2px" }}>
        Your town, seen from the heights — each structure grows through three tiers as you raise its
        level.{" "}
        {rendered < LAYOUT.length && (
          <span>({rendered} of {LAYOUT.length} plots drawn — the rest fill in as you build.)</span>
        )}
      </p>
    </>
  );
}
