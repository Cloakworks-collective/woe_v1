import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { Panel } from "@/components/Panel";
import { TextInput } from "@/components/TextInput";
import { CHAT } from "@/lib/constants";
import { dmChannel } from "@/lib/server/store";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; tab?: string; with?: string }>;
}) {
  const { err, ok, tab = "era", with: dmWith } = await searchParams;
  const { world, player: p } = await getGame();
  const clan = p.clanId ? world.clans[p.clanId] : undefined;

  const inClan = tab === "clan" && clan;
  const channel = inClan ? `clan:${clan.id}` : tab === "dm" && dmWith ? dmChannel(p.id, dmWith) : "era";
  // A clan hall keeps its whole remembered window; other channels show a tail.
  const messages = world.messages.filter((m) => m.channel === channel).slice(inClan ? -CHAT.CLAN_HISTORY : -40);
  const others = Object.values(world.players).filter((t) => t.id !== p.id);

  const tabs = [
    { id: "era", label: "🕯 Era Chat (wiped each era)" },
    ...(clan ? [{ id: "clan", label: `🛡 ${clan.name} (last ${CHAT.CLAN_HISTORY})` }] : []),
    { id: "dm", label: "✉ Letters (permanent)" },
  ];

  return (
    <>
      <Flash err={err} ok={ok} />
      <Panel
        title="The Forum"
        info="Era and clan chat are wiped when the era ends; letters persist forever."
      >
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <a
              key={t.id}
              href={`/forum?tab=${t.id}`}
              className="btn"
              style={
                tab === t.id
                  ? undefined
                  : { background: "linear-gradient(#cbb075,#a8853f)", borderColor: "#7c5426" }
              }
            >
              {t.label}
            </a>
          ))}
          {tab === "dm" && (
            <form style={{ display: "inline-flex", gap: 4 }}>
              <input type="hidden" name="tab" value="dm" />
              <select name="with" defaultValue={dmWith} aria-label="Correspondent" style={{ font: "14.5px Verdana" }}>
                <option value="">— choose a correspondent —</option>
                {others.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ReqTip heading="Open letters" body="Open your private, permanent letter thread with the chosen correspondent.">
                <Btn className="btn">Open letters</Btn>
              </ReqTip>
            </form>
          )}
        </div>

        {(tab !== "dm" || dmWith) && (
          <>
            <div
              style={{
                border: "1px solid var(--border-light)",
                background: "var(--input-bg)",
                padding: 8,
                maxHeight: 340,
                overflowY: "auto",
                fontSize: 14.5,
              }}
            >
              {messages.length === 0 ? (
                <i>Silence. Be the first voice.</i>
              ) : (
                messages.map((m) => (
                  <div key={m.id} style={{ marginBottom: 6 }}>
                    <b style={{ color: m.authorId === p.id ? "var(--warn)" : "#5a3b1c" }}>{m.authorName}</b>
                    <span style={{ color: "var(--border)", fontSize: 12.5 }}> · turn {m.tick}</span>
                    <div>{m.body}</div>
                  </div>
                ))
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <CmdForm name="chat" path={`/forum?tab=${tab}${dmWith ? `&with=${dmWith}` : ""}`}>
                <input
                  type="hidden"
                  name="channel"
                  value={tab === "clan" ? "clan" : tab === "dm" ? `dm:${dmWith}` : "era"}
                />
                <TextInput name="body" ariaLabel="Message" placeholder="Speak…" maxLength={800} />
                <ReqTip
                  heading="Post your message"
                  body="Send this message to the current channel for others to read."
                  note="Era and clan chat are wiped when the era ends; letters are kept forever."
                >
                  <Btn className="btn">Post</Btn>
                </ReqTip>
              </CmdForm>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
