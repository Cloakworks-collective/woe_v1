// The cmd:* protocol endpoint (spec/architecture.md): one pipeline —
// auth → validate → apply (pure engine) → persist → events.
// Auth: realm token (Authorization: Bearer woe_…) for the CLI, or the
// browser session cookie.

import { NextResponse, type NextRequest } from "next/server";
import { resolvePlayerId } from "@/lib/server/auth";
import { runCommand } from "@/lib/server/pipeline";
import { getWorld } from "@/lib/server/world";

export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const playerId = await resolvePlayerId(req, await getWorld());
  if (!playerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { name } = await ctx.params;
  const args = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await runCommand(playerId, name, args);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
