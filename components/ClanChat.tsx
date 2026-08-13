// The clan's own hall talk, sitting where the clan actually is. The Forum keeps
// its tab too — this is the same channel, not a second one.

import Link from "next/link";
import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { TextInput } from "@/components/TextInput";
import { CHAT } from "@/lib/constants";
import { ticksAgo } from "@/lib/engine";
import type { ForumMessage } from "@/lib/server/store";

export function ClanChat({
  messages,
  viewerId,
  nowTick,
  path = "/clan",
}: {
  messages: ForumMessage[];
  viewerId: string;
  /** Current turn — the log stamps "3h ago", not a turn number. Nobody knows
   *  what turn 5,039 was; everyone knows what this morning was. */
  nowTick: number;
  path?: string;
}) {
  return (
    <>
      <div className="clanchat-log">
        {messages.length === 0 ? (
          <i>Silence in the hall. Be the first voice.</i>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="clanchat-line">
              <b style={{ color: m.authorId === viewerId ? "var(--warn)" : "#5a3b1c" }}>{m.authorName}</b>
              <span
                style={{ color: "var(--border)", fontSize: 12.5 }}
                title={`turn ${m.tick.toLocaleString("en-US")}`}
              >
                {" · "}
                {ticksAgo(m.tick, nowTick)}
              </span>
              <div>{m.body}</div>
            </div>
          ))
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <CmdForm name="chat" path={path}>
          <input type="hidden" name="channel" value="clan" />
          <TextInput name="body" ariaLabel="Message to your clan" placeholder="Speak to your clan…" maxLength={800} />
          <ReqTip
            heading="Post to the clan"
            body="Only your own clan can read this channel."
            note={`The hall remembers its last ${CHAT.CLAN_HISTORY} messages — older words are lost for good.`}
          >
            <Btn className="btn">Post</Btn>
          </ReqTip>
        </CmdForm>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "6px 0 0" }}>
        Last {CHAT.CLAN_HISTORY} messages kept · also in the{" "}
        <Link href="/messages">Letters</Link>.
      </p>
    </>
  );
}
