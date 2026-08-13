// The magic link: /enter?t=<token> → signed in, everywhere.
//
// At the ROOT rather than under /forum, because the link is not a forum thing:
// one token opens the game, the boards and the CLI, and a URL that says "forum"
// would misdescribe two thirds of what it does.
//
// A GET route rather than a server action, because the whole point is that it
// travels — pasted into a notes app, a chat, a bookmark bar — and arrives as a
// plain click from somewhere that is not this site.
//
// Deliberately no rate limit: the token is 160 bits of randomness, so guessing
// is not a threat a throttle would help with. What DOES matter is that a bad
// token lands somewhere readable rather than on a stack trace, and that the
// token never survives into the address bar of the page you end up on — hence
// the redirect away from this URL.

import { NextResponse, type NextRequest } from "next/server";
import { findAccountByToken, isSchemaMissing } from "@/lib/server/accounts";
import { playerIdForAccount, setAccountSession } from "@/lib/server/auth";
import { getWorld } from "@/lib/server/world";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  // `to` lets a link say where it wants to land — the forum's own sign-in
  // prompt uses it so a reader who signs in to reply comes back to the boards
  // rather than to a throne room they did not ask for. Path-only, so the
  // parameter cannot be used to bounce anyone off-site.
  const raw = req.nextUrl.searchParams.get("to") ?? "";
  const to = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/login?err=${encodeURIComponent(msg)}`, req.url));

  try {
    const account = await findAccountByToken(token);
    if (!account) return fail("That link opens no gate here.");
    await setAccountSession(account.id);
    if (to) return NextResponse.redirect(new URL(to, req.url));
    // No destination asked for: the throne if they hold one this age, the
    // founding gate if they do not.
    const world = await getWorld();
    const playerId = playerIdForAccount(world, account.id);
    return NextResponse.redirect(new URL(playerId ? "/" : "/login", req.url));
  } catch (e) {
    if (isSchemaMissing(e)) {
      return fail("The accounts table has not been created yet — run the migrations.");
    }
    throw e;
  }
}
