// GET /api/market — Bazaar prices, aggregate supply, and your own caravans.
// Anonymous by design: counterparties are never exposed.

import { NextResponse, type NextRequest } from "next/server";
import { marketPrice } from "@/lib/engine";
import type { Resource } from "@/lib/engine";
import { resolvePlayerId } from "@/lib/server/auth";
import { getWorld, runDueTicks } from "@/lib/server/world";

const RESOURCES: Resource[] = ["food", "wood", "stone", "ore"];

export async function GET(req: NextRequest) {
  const world = await getWorld();
  runDueTicks(world);
  const playerId = await resolvePlayerId(req, world);
  if (!playerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const board = Object.fromEntries(
    RESOURCES.map((r) => {
      const orders = world.orders.filter((o) => o.resource === r);
      return [
        r,
        {
          price: marketPrice(world.orders, r), // lowest ask, null = no supply
          supply: orders.reduce((s, o) => s + o.remaining, 0),
        },
      ];
    }),
  );

  const mine = world.orders
    .filter((o) => o.sellerId === playerId)
    .map((o) => ({
      orderId: o.id,
      resource: o.resource,
      remaining: o.remaining,
      pricePerUnit: o.pricePerUnit,
    }));

  return NextResponse.json({ tick: world.meta.tickNumber, board, myCaravans: mine });
}
