// GET /api/spectate — the latest public spectator snapshot (§14.5). Reads one
// indexed row (the top-N ladder + crown state written each tick by §14.4),
// never recomputing the ladder per viewer. Public: no auth. Returns
// { empty: true } when there's no snapshot yet (e.g. Supabase not configured).

import { NextResponse } from "next/server";
import { latestSpectatorSnapshot } from "@/lib/server/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = await latestSpectatorSnapshot();
  return NextResponse.json(snap ?? { empty: true }, {
    headers: { "cache-control": "no-store" },
  });
}
