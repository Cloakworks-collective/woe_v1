import { artStage, type BuildingId } from "@/lib/constants";
import { DamagedArt } from "./DamagedArt";

/** A structure's portrait at the stage its level has earned — a Grange at L1 is
 *  a barn and a paddock; by L8 it's a mill and granary tower. Pass `integrity`
 *  (see structureIntegrity) and it shows the battered version of that stage. */
export function BuildingArt({
  id,
  level,
  size,
  title,
  integrity = 1,
}: {
  id: BuildingId;
  level: number;
  size?: number;
  title?: string;
  /** 0–1 soundness. Use structureIntegrity(player, id) — it knows the Walls
   *  keep theirs on a different field. */
  integrity?: number;
}) {
  return (
    <DamagedArt
      path={`buildings/${id}/${artStage(id, level)}`}
      integrity={integrity}
      size={size}
      title={title}
    />
  );
}
