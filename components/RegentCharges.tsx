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
 * a new empire through its opening moves. Each row is satisfied by real state
 * and pays a one-time gift; the whole panel vanishes once every charge is met
 * or the regent waives it (see waiveOnboarding — waiving still pays the bounty).
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
        <p className="charges-intro">
          Your council&apos;s course for the first hour — do them in order and the empire builds
          itself. Each is sealed the moment it&apos;s met, and pays a gift to your treasury.
        </p>
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
            body="Hide the Regent's Charges for good. You keep every bounty already sealed, and the panel won't come back — you're on your own from here."
          >
            <Btn type="submit" className="">I rule unaided — dismiss &amp; keep the bounty</Btn>
          </ReqTip>
        </form>
      </div>
    </section>
  );
}
