// POST /api/stripe/checkout — start a Stripe Checkout Session for the Royal
// Charter and redirect the browser to Stripe's hosted payment page.
// (With test keys, Stripe's test cards — 4242 4242 4242 4242 — work there.)

import { NextResponse, type NextRequest } from "next/server";
import { currentPlayerId } from "@/lib/server/auth";
import { createCharterCheckout, paymentMode } from "@/lib/server/premium";
import { getWorld } from "@/lib/server/world";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const playerId = await currentPlayerId(await getWorld());
  if (!playerId) return NextResponse.redirect(new URL("/login", req.url), 303);
  if (paymentMode() !== "stripe") {
    return NextResponse.redirect(
      new URL(`/premium?err=${encodeURIComponent("Stripe is not configured — use the test terminal below.")}`, req.url),
      303,
    );
  }
  try {
    const url = await createCharterCheckout(playerId, new URL(req.url).origin);
    return NextResponse.redirect(url, 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.redirect(new URL(`/premium?err=${encodeURIComponent(msg)}`, req.url), 303);
  }
}
