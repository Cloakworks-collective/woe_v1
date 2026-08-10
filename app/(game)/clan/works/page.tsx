import { redirect } from "next/navigation";
import { Btn } from "@/components/Btn";
import { ClanTabs } from "@/components/ClanTabs";
import { ClanWorks } from "@/components/ClanWorks";
import { CmdForm } from "@/components/CmdForm";
import { CountInput } from "@/components/CountInput";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { STORAGE_CAP_PER_LEVEL } from "@/lib/constants";
import { bankedRes, withdrawableNow, type ClanResource } from "@/lib/engine";
import { clanBadges, getClanView, isClanLeadership } from "@/lib/server/clanView";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const POOL: ClanResource[] = ["gold", "food", "wood", "stone", "ore"];

// The works only. The vault moved to its own tab: they are read in opposite
// directions — the works are a LEADERSHIP decision made a few times an age, the
// vault is a members' counter used constantly — and one long scroll made the
// four works compete with a five-row give/take table for the same attention.
export default async function ClanWorksPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, p, clan, tick } = await getClanView();
  if (!clan) redirect("/clan");

  const isLeadership = isClanLeadership(clan, p.id);
  const poolCap = Math.floor(STORAGE_CAP_PER_LEVEL * clan.buildings.storageLevel * clan.buildings.integrity.storage);
  const vault = bankedRes(p);

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#clans">How clans work &amp; win together</LearnLink>
      <ClanTabs badges={clanBadges(world, clan, p, tick)} />

      {/* ── Clan Works ────────────────────────────────────────────────── */}
      <Panel
        title={isLeadership ? "Clan Works — raise & repair (paid from the pool)" : "Clan Works"}
        info="The four great works of a clan. Every one of them is felt by every member — see the points on each card. Levels are raised, and bombardment damage mended, from the shared pool on the Vault tab. Only the five leadership seats may build or repair."
        guide="/guide#clans"
      >
        {!isLeadership && (
          <p className="panel-lede">
            Only the Leader, Vice-Leader and Officers may raise or repair the works. You can see what
            the banner has built, and you can feed the pool that pays for it below.
          </p>
        )}
        <ClanWorks clan={clan} editable={isLeadership} path="/clan/works" builder={isLeadership ? p : undefined} />
      </Panel>
    </>
  );
}
