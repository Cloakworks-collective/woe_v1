import { Flash } from "@/components/Flash";
import { Panel } from "@/components/Panel";
import { emulatorPurchase } from "@/app/actions";
import { CHARTER_PRICE_CENTS, STEWARD_QUEUE_CAP } from "@/lib/constants";
import { paymentMode, verifyCharterSession } from "@/lib/server/premium";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const price = `$${(CHARTER_PRICE_CENTS / 100).toFixed(2)}`;

export default async function PremiumPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; session_id?: string }>;
}) {
  const { err, ok, session_id } = await searchParams;
  let { player: p } = await getGame();

  // Returning from Stripe Checkout: verify & grant (webhook covers production).
  let stripeOk: string | undefined;
  if (session_id && !p.premium && paymentMode() === "stripe") {
    if (await verifyCharterSession(p.id, session_id)) {
      stripeOk = "Payment confirmed — the Royal Charter is sealed!";
      ({ player: p } = await getGame());
    }
  }

  return (
    <>
      <Flash err={err} ok={stripeOk ?? ok} />
      <Panel title="👑 The Royal Charter — premium">
        <p style={{ fontSize: 13.5 }}>
          A one-time grant of {price} places <b>the Steward</b> in your court — a tireless
          officer who works every turn, even while you sleep:
        </p>
        <ul style={{ fontSize: 13.5, margin: "6px 0 6px 18px" }}>
          <li>
            <b>Build queue</b> — line up to {STEWARD_QUEUE_CAP} constructions; each is raised the
            moment the treasury can pay for it.
          </li>
          <li>
            <b>Research queue</b> — chart a course of study; the scholars move to the next field
            the instant a level completes.
          </li>
          <li>
            <b>Standing orders</b> — intelligent commands: <i>“once the Drill Yard is built, train
            1,000 warriors”</i>, <i>“when gold reaches 50,000, raise the walls”</i>. The Steward
            executes them the moment conditions are met, paying as resources allow.
          </li>
        </ul>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
          All Steward actions are the same instant commands you could give yourself — the Charter
          buys attention, never power. No stat, troop, or resource advantages, ever.
        </p>
      </Panel>

      {p.premium ? (
        <Panel title="The Charter is sealed">
          <p style={{ fontSize: 13.5 }}>
            👑 Your empire holds the Royal Charter. The Steward awaits instruction in{" "}
            <a href="/steward">his chamber</a>.
          </p>
        </Panel>
      ) : paymentMode() === "stripe" ? (
        <Panel title={`Purchase — ${price}, one time`}>
          <form method="POST" action="/api/stripe/checkout">
            <button className="btn" style={{ fontSize: 14 }}>
              👑 Purchase via Stripe — {price}
            </button>
          </form>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 6 }}>
            Checkout is handled by Stripe. With test keys, use Stripe&apos;s test card{" "}
            <code>4242 4242 4242 4242</code>, any future expiry, any CVC.
          </p>
        </Panel>
      ) : (
        <Panel title={`Purchase — ${price}, one time (Stripe test terminal)`}>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 6 }}>
            No Stripe keys are configured, so this terminal emulates Stripe&apos;s test mode. Pay
            with <code>4242 4242 4242 4242</code> (any future expiry, any CVC). Other Stripe test
            cards behave as documented: <code>…0002</code> declines, <code>…9995</code> has
            insufficient funds.
          </p>
          <form
            action={emulatorPurchase}
            style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
          >
            <input
              name="card"
              aria-label="Card number"
              placeholder="4242 4242 4242 4242"
              size={20}
              required
            />
            <input name="exp" aria-label="Expiry MM/YY" placeholder="MM/YY" size={5} required />
            <input name="cvc" aria-label="CVC" placeholder="CVC" size={4} required />
            <button className="btn">👑 Pay {price}</button>
          </form>
        </Panel>
      )}
    </>
  );
}
