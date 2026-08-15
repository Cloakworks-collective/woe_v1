import { LearnLink } from "@/components/LearnLink";
import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { CommsTabs } from "@/components/CommsTabs";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { Panel } from "@/components/Panel";
import { TextArea } from "@/components/TextArea";
import { ticksAgo } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// World chat — one public room for everyone playing this age, wiped when the
// age is sealed. Clan talk lives in the clan; the permanent, cross-era place to
// argue is the public Forum, which has its own login and outlives all of this.
export default async function WorldChatPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, player: p } = await getGame();
  const messages = world.messages.filter((m) => m.channel === "era").slice(-60);

  return (
    <>
      <LearnLink href="/guide#heralds">Letters, halls &amp; the forum</LearnLink>
      <Flash err={err} ok={ok} />
      <CommsTabs />
      <Panel
        title="World Chat"
        info="One public room for this age. Wiped when the era is sealed — for talk that should outlive the age, use the Forum."
      >
        <div className="comms-log">
          {messages.length === 0 ? (
            <i>Silence. Be the first voice.</i>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="comms-line">
                <b style={{ color: m.authorId === p.id ? "var(--warn)" : "#5a3b1c" }}>{m.authorName}</b>
                <span className="comms-when" title={`turn ${m.tick.toLocaleString("en-US")}`}>
                  {" · "}
                  {ticksAgo(m.tick, world.meta.tickNumber)}
                </span>
                <div className="comms-body">{m.body}</div>
              </div>
            ))
          )}
        </div>
        <CmdForm name="chat" path="/messages/chat" inline={false} className="comms-form">
          <input type="hidden" name="channel" value="era" />
          <TextArea name="body" ariaLabel="Message to the world" placeholder="Speak…" maxLength={800} rows={4} />
          <ReqTip
            heading="Post to world chat"
            body="Everyone playing this age can read it."
            note="Wiped when the era ends. The Forum is the place for anything that should last."
          >
            <Btn className="btn">Speak</Btn>
          </ReqTip>
        </CmdForm>
      </Panel>
    </>
  );
}
