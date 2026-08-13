import { headers } from "next/headers";
import { Panel } from "@/components/Panel";
import { currentAccount, magicLink } from "@/lib/server/auth";

/**
 * Your magic link, on the Command View — the one credential for everything.
 *
 * This replaced the realm-token panel, which showed a secret that belonged to
 * ONE empire in ONE age. That was a credential you had to be re-issued every
 * era, and it explained nothing about the forum. The account's link is the same
 * secret in the terminal, in a browser and on the boards, and it survives every
 * reset — so the panel that used to say "plays this same empire from the CLI"
 * can now say what it actually is: your account.
 *
 * Behind a `<details>` because a shared screen is a real thing and a secret
 * always on display is a secret shoulder-surfed.
 */
export async function MagicKeyPanel() {
  const account = await currentAccount();
  if (!account) return null;

  // Built from the request, so a link copied on localhost points at localhost
  // and one copied in production points at production — the whole value of it
  // is that it works when pasted somewhere else.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const link = magicLink(account.token, `${proto}://${host}`);

  return (
    <Panel title="🔑 Your magic link">
      <details>
        <summary style={{ cursor: "pointer", fontSize: 14.5 }}>
          The one key to this account — browser, terminal and forum (click to reveal)
        </summary>
        <p style={{ margin: "6px 0 4px" }}>
          <code
            style={{
              background: "var(--panel-alt)",
              padding: "2px 6px",
              fontSize: 13.5,
              wordBreak: "break-all",
            }}
          >
            {link}
          </code>
        </p>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
          Keep it secret — whoever holds it is you. It opens this empire, the{" "}
          <a href="/forum">forum</a>, and the terminal client:{" "}
          <code>node cli/woe.mjs link {"<key>"}</code>. It never expires, and it will found your
          empire in the <i>next</i> age too — one empire per age, same account.
        </p>
      </details>
    </Panel>
  );
}
