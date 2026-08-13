import Link from "next/link";
import { waiveOnboarding } from "@/app/actions";
import { chargeStatuses, chargesProgress, isOnboardingActive, type Grant, type Player } from "@/lib/engine";
import { Btn } from "./Btn";
import { ReqTip } from "./CostTip";
import { ResIcon, type ResKind } from "./ResIcon";

const ORDER: ResKind[] = ["gold", "food", "wood", "stone", "ore"];

function Reward({ reward }: { reward: Grant }) {
  const parts = ORDER.filter((k) => reward[k as keyof Grant]);
  return (
    <span className="charge-reward">
      {parts.map((k) => (
        <span key={k} className="charge-reward-part">
          <ResIcon kind={k} size={15} /> {reward[k as keyof Grant]!.toLocaleString("en-US")}
        </span>
      ))}
    </span>
  );
}

/**
 * The Regent's First Charges — an ordered, self-completing checklist that pulls
 * a NEW empire through its opening moves. Each row is satisfied by real state
 * and pays a one-time gift; the whole panel vanishes once every charge is met
 * or the regent waives it (see waiveOnboarding — waiving still pays the bounty).
 *
 * It says out loud that it is for newcomers, and the way out sits at the TOP
 * beside that sentence rather than only under seven rows of tutorial. A veteran
 * founding their next age should not have to scroll a beginner's checklist to
 * find the button that hides it — and because waiving pays every remaining
 * gift, taking that button costs them nothing at all.
 */
export function RegentCharges({ player }: { player: Player }) {
  if (!isOnboardingActive(player)) return null;
  const charges = chargeStatuses(player);
  const { done, total } = chargesProgress(player);
  const nextId = charges.find((c) => !c.complete)?.id;
  const pct = Math.round((done / total) * 100);

  return (
    <section className="panel charges" id="regent-charges">
      <h3>
        ⚑ The Regent&apos;s First Charges
        <span className="charges-count">{done} / {total} sealed</span>
      </h3>
      <div className="body">
        <div className="charges-lede">
          <p className="charges-intro">
            <b>New here?</b> This is your council&apos;s course for the first hour — do them in
            order and the empire builds itself. Each is sealed the moment it&apos;s met, and pays a
            gift to your treasury.
          </p>
          <form action={waiveOnboarding} className="charges-skip">
            <ReqTip
              heading="Played before?"
              body="Hide the checklist for good and take every remaining gift with you — all of it, at once, exactly as if you had worked through the list. Nothing is forfeited and the panel does not come back."
            >
              <Btn type="submit" className="">Played before? Skip &amp; take the gifts</Btn>
            </ReqTip>
          </form>
        </div>
        <div className="charges-track" aria-hidden>
          <i style={{ width: `${pct}%` }} />
        </div>
        <ol className="charge-list">
          {charges.map((c) => {
            const isNext = c.id === nextId;
            return (
              <li key={c.id} className={`charge${c.complete ? " done" : ""}${isNext ? " next" : ""}`}>
                <span className="charge-check" aria-hidden>{c.complete ? "✓" : isNext ? "➤" : ""}</span>
                <div className="charge-main">
                  <div className="charge-title">{c.title}</div>
                  {!c.complete && <div className="charge-why">{c.why}</div>}
                  <div className="charge-meta">
                    {c.complete ? (
                      <span className="charge-granted">✔ sealed — gift granted</span>
                    ) : (
                      <>
                        <span className="charge-gift">Gift:</span> <Reward reward={c.reward} />
                      </>
                    )}
                  </div>
                </div>
                {!c.complete && (
                  <Link className="btn charge-go" href={c.href}>
                    {c.cta}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        <form action={waiveOnboarding} className="charges-waive">
          <ReqTip
            heading="Dismiss the checklist"
            body="Hide the Regent's Charges for good, and take every gift you have not yet sealed with you — waiving pays the full bounty, so an experienced regent loses nothing by skipping."
          >
            <Btn type="submit" className="">I rule unaided — dismiss &amp; keep the bounty</Btn>
          </ReqTip>
        </form>
      </div>
    </section>
  );
}
