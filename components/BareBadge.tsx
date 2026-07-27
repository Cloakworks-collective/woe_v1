import { ReqTip } from "./CostTip";

/**
 * The unshielded-regulars warning: mercenaries die before the REGULARS OF THEIR
 * OWN ARM, so an arm with soldiers but no hired blades takes every blow on real
 * population. A two-word red chip (with a slow pulse) carries the fact; the
 * hover explains it and points at the Black Market.
 */
export function BareBadge({ arm, count }: { arm: string; count: number }) {
  return (
    <ReqTip
      heading={`${count.toLocaleString("en-US")} ${arm} stand bare`}
      body={`No hired ${arm} screen them — mercenaries die before the regulars of their own arm, so in battle these take every blow on real population. Dead regulars are gone for good.`}
      note="Hire matching mercenaries on The Army page — cheap blades that die first."
    >
      <span className="bare-badge">
        <span aria-hidden="true">🛡</span>✗ bare
      </span>
    </ReqTip>
  );
}
