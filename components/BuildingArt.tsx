import { artStage, type BuildingId } from "@/lib/constants";
import { Art } from "./Art";

/** A structure's portrait at the stage its level has earned — a Grange at L1 is
 *  a barn and a paddock; by L8 it's a mill and granary tower. */
export function BuildingArt({
  id,
  level,
  size,
  title,
}: {
  id: BuildingId;
  level: number;
  size?: number;
  title?: string;
}) {
  return <Art path={`buildings/${id}/${artStage(id, level)}`} size={size} title={title} />;
}
