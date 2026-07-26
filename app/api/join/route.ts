// POST /api/join — found an empire from the CLI: {name, race} → realm token.
// The one unauthenticated endpoint; everything else needs the token.

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { RACES } from "@/lib/constants";
import type { Race } from "@/lib/constants/races";
import { newRealmToken } from "@/lib/server/auth";
import { runCommand } from "@/lib/server/pipeline";
import { getWorld } from "@/lib/server/world";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; race?: string };
  const name = String(body.name ?? "").trim().slice(0, 30);
  const race = String(body.race ?? "human") as Race;

  if (name.length < 2) {
    return NextResponse.json({ error: "Name your empire (2+ letters)." }, { status: 400 });
  }
  if (!(race in RACES)) {
    return NextResponse.json(
      { error: `Unknown race — choose one of: ${Object.keys(RACES).join(", ")}.` },
      { status: 400 },
    );
  }

  // Founding is a command (createEmpire), so it flows through whichever write
  // model is active — the single writer (§14.2) or the compare-and-swap store
  // (§14.1). The id + token are minted here; uniqueness is enforced by the writer.
  const id = randomUUID();
  const token = newRealmToken();
  const r = await runCommand(id, "createEmpire", { name, race, token });
  if (!r.ok) {
    return NextResponse.json({ error: r.message }, { status: /taken/i.test(r.message ?? "") ? 409 : 400 });
  }

  const world = await getWorld();
  return NextResponse.json({
    ok: true,
    playerId: id,
    name,
    race,
    token,
    era: world.meta.eraName,
    tick: world.meta.tickNumber,
    note: "Keep this token secret — it IS your throne. The same empire is playable at the website with any browser session.",
  });
}
