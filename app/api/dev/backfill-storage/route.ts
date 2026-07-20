// Dev-only: bring existing empires up to the current starting conditions —
// level-1 banking (Counting House + the four resource stores) for everyone
// founded before newEmpire.ts started granting them. Idempotent: only fills
// gaps, never lowers an existing level. Disabled once CRON_SECRET is set.

import { NextResponse } from "next/server";
import { getWorld } from "@/lib/server/world";
import { saveWorld } from "@/lib/server/store";
import { STORAGE_BUILDING, STORAGE_PER_LEVEL, type BuildingId } from "@/lib/constants";

export const dynamic = "force-dynamic";

const STARTING_STORAGE: BuildingId[] = [
  "counting_house",
  "granary",
  "timberyard",
  "masons_yard",
  "ironhold",
];

export async function GET() {
  if (process.env.CRON_SECRET) {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }
  const world = await getWorld();
  const touched: string[] = [];
  for (const p of Object.values(world.players)) {
    let changed = false;
    for (const id of STARTING_STORAGE) {
      if (!p.buildings[id]) {
        p.buildings[id] = 1;
        changed = true;
      }
    }
    // One-time courtesy deposit: vault loose goods up to capacity, matching
    // the protection these empires had under the old automatic-shelter rules.
    if (!p.bankedResources) {
      const banked = { food: 0, wood: 0, stone: 0, ore: 0 };
      for (const r of ["food", "wood", "stone", "ore"] as const) {
        const cap = STORAGE_PER_LEVEL * (p.buildings[STORAGE_BUILDING[r]] ?? 0);
        const move = Math.min(p.resources[r], cap);
        p.resources[r] -= move;
        banked[r] = move;
      }
      p.bankedResources = banked;
      changed = true;
    }
    if (changed) touched.push(p.name);
  }
  await saveWorld(world);
  return NextResponse.json({ ok: true, backfilled: touched });
}
