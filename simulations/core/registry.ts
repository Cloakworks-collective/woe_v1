// Every harness, in one list.
//
// Adding one is: write the file, import it, append it here. Nothing else knows
// how many there are — the runner, the report writer and the baseline diff all
// work off this array.

import { bombardHarness } from "../harnesses/bombard";
import { castleHarness } from "../harnesses/castle";
import { pacingHarness } from "../harnesses/pacing";
import { buildingsHarness } from "../harnesses/buildings";
import { raidHarness } from "../harnesses/raid";
import { rankingHarness } from "../harnesses/ranking";
import { revengeHarness } from "../harnesses/revenge";
import type { Harness } from "./types";

export const HARNESSES: Harness[] = [
  buildingsHarness,
  rankingHarness,
  raidHarness,
  castleHarness,
  bombardHarness,
  revengeHarness,
  pacingHarness,
];

export const harnessById = (id: string): Harness | undefined => HARNESSES.find((h) => h.id === id);
