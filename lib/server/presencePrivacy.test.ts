import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Presence is CLAN BUSINESS. Knowing when a banner goes quiet is raiding
// intelligence — it tells an outsider which four hours to attack in — so
// "Online" and "last seen" are shown to clanmates and to nobody else.
//
// These scan source rather than render, because the leak is never in the
// column somebody remembered to gate. It is in the row highlight, the CSS
// class, or the JSON field that quietly answers the same question.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("a stranger cannot see when your banners sleep", () => {
  const roster = read("components", "ClanMembers.tsx");

  it("computes online-ness through the insider gate, not around it", () => {
    // The single load-bearing line. If `isOnline` is ever read without
    // `insider` on the same expression, every downstream use leaks again —
    // including the row highlight, which is presence expressed as CSS.
    expect(roster).toMatch(/const online = insider && isOnline\(/);
  });

  it("has exactly one call to isOnline, so there is one place to get it wrong", () => {
    const calls = [...roster.matchAll(/isOnline\(/g)].length;
    expect(calls, "a second isOnline() call needs its own insider gate").toBe(1);
  });

  it("gates the Seen column header and its cells", () => {
    expect(roster).toMatch(/\{insider && <th>Seen<\/th>\}/);
    // The cell must be INSIDE an insider block: walk back from the render of
    // the label to the nearest enclosing <td> and check what opens it.
    const at = roster.indexOf("lastSeenLabel(m.");
    const tdStart = roster.lastIndexOf("<td>", at);
    const opener = roster.slice(Math.max(0, tdStart - 60), tdStart);
    expect(opener, "the Seen cell is not wrapped in an insider gate").toContain("{insider && (");
  });

  it("never renders a last-seen label unguarded", () => {
    // lastSeenLabel is defined once and used once, inside the gated cell.
    expect([...roster.matchAll(/lastSeenLabel\(/g)].length).toBe(2); // definition + call
  });
});

describe("the public ladder API keeps the same secret", () => {
  const route = read("app", "api", "rankings", "route.ts");

  it("returns presence only for your own clan", () => {
    // This endpoint used to return `online` for every empire on the ladder,
    // which made gating the roster column pointless — anyone could poll it and
    // learn exactly when a target sleeps.
    expect(route).toMatch(/online: sameClan\(p\) \? isOnline\(p\) : null/);
    expect(route).not.toMatch(/online: isOnline\(p\),/);
  });

  it("decides sameClan from the VIEWER, not the row", () => {
    expect(route).toMatch(/p\.id === playerId \|\| \(!!viewer\?\.clanId && p\.clanId === viewer\.clanId\)/);
  });
});
