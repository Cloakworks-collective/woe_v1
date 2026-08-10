import Link from "next/link";
import { BuildingArt } from "@/components/BuildingArt";
import { BUILDING_INFO, isCounted, maxLevel, type BuildingId } from "@/lib/constants";
import { level, structureIntegrity, type Player } from "@/lib/engine";

// The settlement, laid out as it would rise from the ground: hearth & walls at
// the heart, then workshops, stores, civic halls, and the war yards. Plots you
// have not built yet sit faint — you watch the town fill in as you build.
const GROUPS: { head: string; ids: BuildingId[] }[] = [
  { head: "Heart & Walls", ids: ["hearthstead", "walls", "muster_hall"] },
  { head: "Workshops", ids: ["grange", "sawyers_mill", "masons_quarry", "deepvein_mine"] },
  { head: "Stores & Vault", ids: ["granary", "timberyard", "masons_yard", "ironhold", "counting_house"] },
  { head: "Civic Halls", ids: ["market_square", "collegium", "shadow_guild", "rangers_lodge"] },
  { head: "War Yards", ids: ["drill_yard", "fletchers_range", "knights_stables", "forge", "war_foundry"] },
];
const ALL_IDS = GROUPS.flatMap((g) => g.ids);

export function SettlementView({ player }: { player: Player }) {
  const lvl = (id: BuildingId) => level(player, id);
  const raised = ALL_IDS.filter((id) => lvl(id) > 0).length;

  // The scene — every plot, built ones standing tall, the rest still bare
  // ground. Hover a structure for what it does; click through to build.
  return (
    <>
      <div className="village">
        {ALL_IDS.map((id) => {
          const l = lvl(id);
          const built = l > 0;
          // Hearthstead & Muster Hall are counted (built again and again), so
          // only the LEVELLED structures can truly reach their zenith.
          const zenith = built && !isCounted(id) && l >= maxLevel(id);
          // Key structures and higher levels stand a little taller.
          const size = built ? (id === "walls" || id === "hearthstead" ? 88 : 70 + Math.min(l, 4) * 3) : 60;
          return (
            <Link
              key={id}
              href="/buildings"
              className={`vplot${built ? " built" : ""}${zenith ? " zenith" : ""}`}
              title={`${BUILDING_INFO[id].title}${zenith ? ` — ZENITH, at its pinnacle (level ${l})` : built ? ` — level ${l}` : " — not yet raised"}. ${BUILDING_INFO[id].tip}`}
            >
              <span className="vplot-art">
                <BuildingArt
                  id={id}
                  level={l}
                  size={size}
                  title={BUILDING_INFO[id].title}
                  integrity={structureIntegrity(player, id)}
                />
                {built && (zenith ? <span className="vplot-lv vplot-zenith">★</span> : <span className="vplot-lv">{l}</span>)}
              </span>
              <span className="vplot-name">{BUILDING_INFO[id].title}</span>
              {zenith && <span className="vplot-zenith-ribbon">zenith</span>}
            </Link>
          );
        })}
      </div>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "8px 0 2px" }}>
        <b style={{ color: "var(--pos)" }}>{raised}</b> of {ALL_IDS.length} structures raised — faint
        plots await your masons. <Link href="/buildings">Raise the town →</Link>
      </p>
    </>
  );
}
