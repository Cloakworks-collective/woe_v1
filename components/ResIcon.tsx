import { Art } from "./Art";

export type ResKind = "food" | "wood" | "stone" | "ore" | "gold" | "turns";

const LABEL: Record<ResKind, string> = {
  food: "Food",
  wood: "Wood",
  stone: "Stone",
  ore: "Ore",
  gold: "Gold",
  turns: "Action turns",
};

/** A pixel-art resource token (public/art/resources/*). Replaces emoji so
 * resources read the same across the top bar, market, costs, and dashboards. */
export function ResIcon({ kind, size = 18, title }: { kind: ResKind; size?: number; title?: string }) {
  return <Art path={`resources/${kind}`} size={size} title={title ?? LABEL[kind]} />;
}
