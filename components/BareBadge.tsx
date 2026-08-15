import { ReqTip } from "./CostTip";

/**
 * The unshielded-regulars warning.
 *
 * Screening is per RANK, not per arm: damage walks light → medium → heavy and
 * splits at each rank onto the sellswords standing THERE, so heavy footmen
 * behind light mercenaries are not screened at all. The badge fires when any
 * rank of an arm holds regulars with no hired blades beside them, and names
 * which ranks — the fix is to buy at that tier, not just "buy mercenaries".
 */
export function BareBadge({ arm, tiers }: { arm: string; tiers: string[] }) {
  if (tiers.length === 0) return null;
  const which = tiers.join(", ");
  const all = tiers.length === 3;
  return (
    <ReqTip
      heading={all ? `Every rank of your ${arm} stands bare` : `Your ${which} ${arm} stand bare`}
      body={`No hired ${arm} at ${all ? "any" : "that"} rank. Damage splits per RANK — light first, then medium, then heavy, with the hired taking the larger share of whatever lands at their own tier — so sellswords of another tier cannot cover these. Every blow that reaches them lands on real population, and dead regulars are gone for good.`}
      note={`Hire ${which} ${arm} on The Army page — cheap blades that die first, at the rank where the gap is.`}
    >
      <span className="bare-badge">
        <span aria-hidden="true">🛡</span>✗ bare{!all && <> · {which}</>}
      </span>
    </ReqTip>
  );
}
