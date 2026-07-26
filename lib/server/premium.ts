// The Royal Charter — purchase plumbing (spec/premium.md).
// Dual-mode like the store: real Stripe Checkout when STRIPE_SECRET_KEY is
// set (test keys → Stripe's own 4242… test cards); otherwise a built-in
// emulator of Stripe's test-mode card behavior so the flow is exercisable
// with zero setup. Granting is idempotent either way.

import Stripe from "stripe";
import { CHARTER_PRICE_CENTS, CHARTER_PRODUCT_DESC, CHARTER_PRODUCT_NAME } from "../constants";
import { getWorld } from "./world";
import { runCommand } from "./pipeline";

const g = globalThis as unknown as { __woeStripe?: Stripe };

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!g.__woeStripe) g.__woeStripe = new Stripe(key);
  return g.__woeStripe;
}

export function paymentMode(): "stripe" | "emulator" {
  return stripeClient() ? "stripe" : "emulator";
}

/** Set the premium flag and tell the player. Idempotent. Routed as a command so
 *  it lands through the active writer (single-writer service §14.2 or CAS §14.1). */
export async function grantCharter(playerId: string): Promise<boolean> {
  const world = await getWorld();
  if (!world.players[playerId]) return false;
  const r = await runCommand(playerId, "grantCharter", {});
  return r.ok;
}

/** Create a Stripe Checkout Session for the Charter. Caller redirects to url. */
export async function createCharterCheckout(
  playerId: string,
  origin: string,
): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe is not configured");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: playerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: CHARTER_PRICE_CENTS,
          product_data: { name: CHARTER_PRODUCT_NAME, description: CHARTER_PRODUCT_DESC },
        },
      },
    ],
    success_url: `${origin}/premium?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/premium?err=${encodeURIComponent("Payment canceled — the Charter awaits.")}`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/**
 * Success-redirect verification (works without a webhook in dev): retrieve
 * the session and grant if paid. The webhook remains the production path.
 */
export async function verifyCharterSession(playerId: string, sessionId: string): Promise<boolean> {
  const stripe = stripeClient();
  if (!stripe) return false;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") return false;
  if (session.client_reference_id !== playerId) return false;
  return grantCharter(playerId);
}

// ── The emulator (no Stripe keys): Stripe test-mode card behavior ───────────

/** Mirrors stripe.com/docs/testing — returns null on success, else an error. */
export function emulatedCardOutcome(cardNumber: string, exp: string, cvc: string): string | null {
  const digits = cardNumber.replace(/\D/g, "");
  if (!/^\d{2}\s*\/\s*\d{2,4}$/.test(exp.trim())) return "Invalid expiry — use MM/YY.";
  if (!/^\d{3,4}$/.test(cvc.trim())) return "Invalid security code.";
  switch (digits) {
    case "4242424242424242":
      return null; // the classic test Visa — always succeeds
    case "4000000000000002":
      return "Your card was declined.";
    case "4000000000009995":
      return "Your card has insufficient funds.";
    case "4000000000000069":
      return "Your card has expired.";
    case "4000000000000127":
      return "Your card's security code is incorrect.";
    default:
      return digits.length === 16
        ? "Card declined — in test mode, use a Stripe test card (e.g. 4242 4242 4242 4242)."
        : "Invalid card number.";
  }
}
