// POST /api/join — found an empire from the CLI: {name, race} → realm token.
// The one unauthenticated endpoint; everything else needs the token.

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { RACES } from "@/lib/constants";
import type { Race } from "@/lib/constants/races";
import { newEmpire } from "@/lib/engine";
import { newRealmToken } from "@/lib/server/auth";
import { saveWorld } from "@/lib/server/store";
import { getWorld, runDueTicks } from "@/lib/server/world";

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

  const world = await getWorld();
  runDueTicks(world);
  if (Object.values(world.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "That name is taken." }, { status: 409 });
  }

  const p = newEmpire({ id: randomUUID(), name, race, joinedAtTick: world.meta.tickNumber });
  p.apiToken = newRealmToken();
  world.players[p.id] = p;
  await saveWorld(world);

  return NextResponse.json({
    ok: true,
    playerId: p.id,
    name: p.name,
    race: p.race,
    token: p.apiToken,
    era: world.meta.eraName,
    tick: world.meta.tickNumber,
    note: "Keep this token secret — it IS your throne. The same empire is playable at the website with any browser session.",
  });
}
