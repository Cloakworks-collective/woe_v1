import { Flash } from "@/components/Flash";
import { Panel } from "@/components/Panel";
import { emulatorPurchase } from "@/app/actions";
import { CHARTER_PRICE_CENTS, STEWARD_QUEUE_CAP } from "@/lib/constants";
import { paymentMode, verifyCharterSession } from "@/lib/server/premium";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const price = `$${(CHARTER_PRICE_CENTS / 100).toFixed(2)}`;

/** The purchase control, struck as the Charter card itself. */
function CharterCard() {
  return (
    <button className="cc-btn" aria-label={`Pay ${price} — the Royal Charter for this age`}>
      <span className="cc-top">
        <span>👑 ROYAL CHARTER</span>
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#cdb977" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M8.5 9.5a4 4 0 0 1 0 5" />
          <path d="M11.5 7.5a8 8 0 0 1 0 9" />
          <path d="M14.5 5.5a12 12 0 0 1 0 13" />
        </svg>
      </span>
      <span className="cc-chip" aria-hidden />
      <span className="cc-number">PAY {price}</span>
      <span className="cc-bottom">
        <span className="cc-valid">
          <i>VALID THRU</i>THIS AGE
        </span>
        <span>WAR OF EMPIRES</span>
      </span>
    </button>
  );
}

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
        <p style={{ fontSize: 14.5 }}>
          For {price} <b>an age</b>, the Royal Charter places <b>the Steward</b> in your court — a
          tireless officer who works every turn, even while you sleep. When the era turns and the
          world is made anew, every crown starts uncharted again:
        </p>
        <ul style={{ fontSize: 14.5, margin: "6px 0 6px 18px" }}>
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
          <li>
            <b>Auto-banking</b> — every turn the Steward vaults your goods into their storage
            buildings, up to capacity. Free rulers must bank by hand; yours is never left in the
            open for raiders.
          </li>
        </ul>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
          All Steward actions are the same instant commands you could give yourself — the Charter
          buys attention, never power. No stat, troop, or resource advantages, ever.
        </p>
      </Panel>

      {p.premium ? (
        <Panel title="The Charter is sealed — this age">
          <p style={{ fontSize: 14.5 }}>
            👑 Your empire holds the Royal Charter for the current age. The Steward awaits
            instruction in <a href="/steward">his chamber</a>.
          </p>
        </Panel>
      ) : paymentMode() === "stripe" ? (
        <Panel title={`Purchase — ${price} for this age`}>
          <form method="POST" action="/api/stripe/checkout">
            <CharterCard />
          </form>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8 }}>
            Checkout is handled by Stripe. With test keys, use Stripe&apos;s test card{" "}
            <code>4242 4242 4242 4242</code>, any future expiry, any CVC.
          </p>
        </Panel>
      ) : (
        <Panel title={`Purchase — ${price} for this age (Stripe test terminal)`}>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 6 }}>
            No Stripe keys are configured, so this terminal emulates Stripe&apos;s test mode. Pay
            with <code>4242 4242 4242 4242</code> (any future expiry, any CVC). Other Stripe test
            cards behave as documented: <code>…0002</code> declines, <code>…9995</code> has
            insufficient funds.
          </p>
          <form action={emulatorPurchase}>
            <div className="cc-card">
              <span className="cc-top">
                <span>👑 ROYAL CHARTER</span>
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#cdb977" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M8.5 9.5a4 4 0 0 1 0 5" />
                  <path d="M11.5 7.5a8 8 0 0 1 0 9" />
                  <path d="M14.5 5.5a12 12 0 0 1 0 13" />
                </svg>
              </span>
              <span className="cc-chip" aria-hidden />
              <input
                className="cc-num"
                name="card"
                aria-label="Card number"
                placeholder="4242 4242 4242 4242"
                autoComplete="cc-number"
                inputMode="numeric"
                required
              />
              <span className="cc-bottom">
                <span>
                  <i>VALID THRU</i>
                  <input
                    className="cc-mini cc-exp"
                    name="exp"
                    aria-label="Expiry MM/YY"
                    placeholder="MM/YY"
                    autoComplete="cc-exp"
                    required
                  />
                </span>
                <span>
                  <i>CVC</i>
                  <input
                    className="cc-mini cc-cvc"
                    name="cvc"
                    aria-label="CVC"
                    placeholder="123"
                    autoComplete="cc-csc"
                    inputMode="numeric"
                    required
                  />
                </span>
                <button className="cc-pay">PAY {price}</button>
              </span>
            </div>
          </form>
        </Panel>
      )}
    </>
  );
}
