import Link from "next/link";
import { Art } from "@/components/Art";
import { BUILDING_INFO, type BuildingId } from "@/lib/constants";
import { level, type Player } from "@/lib/engine";

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
          // Key structures and higher levels stand a little taller.
          const size = built ? (id === "walls" || id === "hearthstead" ? 88 : 70 + Math.min(l, 4) * 3) : 60;
          return (
            <Link
              key={id}
              href="/buildings"
              className={`vplot${built ? " built" : ""}`}
              title={`${BUILDING_INFO[id].title}${built ? ` — level ${l}` : " — not yet raised"}. ${BUILDING_INFO[id].tip}`}
            >
              <span className="vplot-art">
                <Art path={`buildings/${id}`} size={size} title={BUILDING_INFO[id].title} />
                {built && <span className="vplot-lv">{l}</span>}
              </span>
              <span className="vplot-name">{BUILDING_INFO[id].title}</span>
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
