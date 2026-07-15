// POST /api/stripe/webhook — production grant path. Verifies the Stripe
// signature (STRIPE_WEBHOOK_SECRET) and grants the Charter on
// checkout.session.completed. Dev without webhooks uses the success-redirect
// verification on /premium instead; granting is idempotent so both may run.

import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { grantCharter, stripeClient } from "@/lib/server/premium";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "not configured" }, { status: 501 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status === "paid" && session.client_reference_id) {
      await grantCharter(session.client_reference_id);
    }
  }
  return NextResponse.json({ received: true });
}
