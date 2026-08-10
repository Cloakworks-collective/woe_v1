// GET /api/market — Bazaar prices, aggregate supply, and your own caravans.
// Anonymous by design: counterparties are never exposed.

import { NextResponse, type NextRequest } from "next/server";
import { caravanArrived, marketPrice } from "@/lib/engine";
import type { Resource } from "@/lib/engine";
import { resolvePlayerId } from "@/lib/server/auth";
import { getCurrentWorld } from "@/lib/server/world";

const RESOURCES: Resource[] = ["food", "wood", "stone", "ore"];

export async function GET(req: NextRequest) {
  const world = await getCurrentWorld();
  const playerId = await resolvePlayerId(req, world);
  if (!playerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const tick = world.meta.tickNumber;
  const board = Object.fromEntries(
    RESOURCES.map((r) => {
      // Only arrived caravans are buyable — en-route goods aren't at the Bazaar.
      const arrived = world.orders.filter((o) => o.resource === r && caravanArrived(o, tick));
      return [
        r,
        {
          price: marketPrice(world.orders, r, tick), // lowest arrived ask, null = no supply
          supply: arrived.reduce((s, o) => s + o.remaining, 0),
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
      arrivesAtTick: o.arrivesAtTick ?? o.createdTick,
      enRoute: !caravanArrived(o, tick),
    }));

  return NextResponse.json({ tick, board, myCaravans: mine });
}
