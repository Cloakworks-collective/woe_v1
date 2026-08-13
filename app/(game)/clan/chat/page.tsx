import Link from "next/link";
import { redirect } from "next/navigation";
import { ClanChat } from "@/components/ClanChat";
import { ClanTabs } from "@/components/ClanTabs";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { CHAT } from "@/lib/constants";
import { clanBadges, clanChatLog, getClanView } from "@/lib/server/clanView";

export const dynamic = "force-dynamic";

// Chat gets the whole column. It is the highest-frequency, lowest-density thing
// a clan does, and on the old single page you scrolled past six panels to say
// a word.
export default async function ClanChatPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, p, clan, tick } = await getClanView();
  if (!clan) redirect("/clan");

  const messages = clanChatLog(world, clan);

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#clans">How clans work &amp; win together</LearnLink>
      <ClanTabs badges={clanBadges(world, clan, p, tick)} />

      <Panel
        title={`The Hall — ${clan.name}`}
        info={`Only your clan can read this. The hall keeps its last ${CHAT.CLAN_HISTORY} messages; older words are deleted for good.`}
      >
        <ClanChat messages={messages} viewerId={p.id} nowTick={tick} path="/clan/chat" />
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 8 }}>
          {messages.length === 0
            ? "Nothing has been said yet."
            : `${messages.length} message${messages.length === 1 ? "" : "s"} kept (the last ${CHAT.CLAN_HISTORY}).`}{" "}
          The same channel appears under <Link href="/messages">Messages</Link> — this is not a second hall.
        </p>
      </Panel>
    </>
  );
}
