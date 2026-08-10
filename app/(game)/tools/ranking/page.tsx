import { LearnLink } from "@/components/LearnLink";
import { RankingCalculator } from "@/components/RankingCalculator";
import { ToolTabs } from "@/components/ToolTabs";

export const dynamic = "force-dynamic";

export default function RankingCalculatorPage() {
  return (
    <>
      <LearnLink href="/guide#clocks">Ranking &amp; starting the clocks</LearnLink>
      <ToolTabs />
      <RankingCalculator />
    </>
  );
}
