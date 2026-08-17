import { BattleCalculator } from "@/components/BattleCalculator";
import { LearnLink } from "@/components/LearnLink";
import { ToolTabs } from "@/components/ToolTabs";

export const metadata = { title: "Battle calculator" };

export const dynamic = "force-dynamic";

// A pure client sandbox — no world read, no session needed beyond the layout's.
export default function BattleCalculatorPage() {
  return (
    <>
      <LearnLink href="/guide#battle">How a battle actually resolves</LearnLink>
      <ToolTabs />
      <BattleCalculator />
    </>
  );
}
