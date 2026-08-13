// One account for the whole system, and one empire per account per age.
//
// Runs against the FILE store (no Supabase env in the test process), which is
// the same code path a local dev machine takes.

import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { magicLink, newAccountToken, playerIdForAccount } from "./auth";
import type { World } from "./store";

const tmp = `/tmp/woe-accounts-test-${process.pid}`;

beforeEach(() => {
  vi.resetModules();
  // The store caches the parsed file on globalThis; drop it between tests or
  // one test's accounts leak into the next.
  delete (globalThis as { __woeForum?: unknown }).__woeForum;
  fs.rmSync(tmp, { recursive: true, force: true });
  vi.spyOn(process, "cwd").mockReturnValue(tmp);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the magic link", () => {
  it("is prefixed, long, and never repeats", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const t = newAccountToken();
      expect(t).toMatch(/^woe_[0-9a-f]{40}$/); // 160 bits
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  });

  it("builds an absolute link that survives being pasted elsewhere", () => {
    expect(magicLink("woe_abc", "https://woe.example")).toBe("https://woe.example/enter?t=woe_abc");
    // A trailing slash must not produce a double slash — the origin is built
    // from a request header, which sometimes carries one.
    expect(magicLink("woe_abc", "https://woe.example/")).toBe("https://woe.example/enter?t=woe_abc");
  });

  it("resolves its account, and refuses anything that is not a token", async () => {
    const accounts = await import("./accounts");
    const token = newAccountToken();
    const account = await accounts.createAccount({ token });

    expect(await accounts.findAccountByToken(token)).toMatchObject({ id: account.id });
    expect(await accounts.findAccountByToken(newAccountToken())).toBeNull();
    // The prefix check runs first, so a blank box or a pasted password never
    // reaches the table at all.
    expect(await accounts.findAccountByToken("")).toBeNull();
    expect(await accounts.findAccountByToken("hunter2")).toBeNull();
  });
});

describe("the forum name", () => {
  it("is absent until claimed — an account that only plays has no handle", async () => {
    const accounts = await import("./accounts");
    const a = await accounts.createAccount({ token: newAccountToken() });
    expect(a.handle).toBeUndefined();

    expect(await accounts.claimHandle(a.id, "Tokenwright")).toBe(true);
    expect((await accounts.findAccount(a.id))!.handle).toBe("Tokenwright");
  });

  it("is claimed once and never renamed", async () => {
    const accounts = await import("./accounts");
    const a = await accounts.createAccount({ token: newAccountToken() });
    await accounts.claimHandle(a.id, "First");
    // A second claim is refused rather than silently overwriting — a poster who
    // can be renamed has no reputation to build.
    expect(await accounts.claimHandle(a.id, "Second")).toBe(false);
    expect((await accounts.findAccount(a.id))!.handle).toBe("First");
  });

  it("is unique, case-insensitively", async () => {
    const accounts = await import("./accounts");
    const a = await accounts.createAccount({ token: newAccountToken() });
    const b = await accounts.createAccount({ token: newAccountToken() });
    expect(await accounts.claimHandle(a.id, "Warlord")).toBe(true);
    expect(await accounts.claimHandle(b.id, "WARLORD")).toBe(false);
    expect(await accounts.findAccountByHandle("warlord")).toMatchObject({ id: a.id });
  });
});

describe("one empire per account per age", () => {
  const world = (players: Record<string, { id: string; accountId?: string; name: string }>) =>
    ({ players }) as unknown as World;

  it("finds the empire this account holds, and only theirs", () => {
    const w = world({
      p1: { id: "p1", accountId: "acc-a", name: "Alpha" },
      p2: { id: "p2", accountId: "acc-b", name: "Beta" },
      bot: { id: "bot", name: "Bot" }, // bots carry no account
    });
    expect(playerIdForAccount(w, "acc-a")).toBe("p1");
    expect(playerIdForAccount(w, "acc-b")).toBe("p2");
    expect(playerIdForAccount(w, "acc-c")).toBeNull();
  });

  it("refuses a second empire for the same account", async () => {
    const { runCommand } = await import("./pipeline");

    const first = await runCommand("e1", "createEmpire", {
      name: "Alpha",
      race: "human",
      accountId: "acc-a",
    });
    expect(first.ok).toBe(true);

    const second = await runCommand("e2", "createEmpire", {
      name: "Beta",
      race: "elf",
      accountId: "acc-a",
    });
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/already rule Alpha/i);
  });

  it("lets a DIFFERENT account found in the same age", async () => {
    const { runCommand } = await import("./pipeline");
    await runCommand("e1", "createEmpire", { name: "Alpha", race: "human", accountId: "acc-a" });
    const other = await runCommand("e2", "createEmpire", {
      name: "Beta",
      race: "elf",
      accountId: "acc-b",
    });
    expect(other.ok).toBe(true);
  });

  it("refuses a founding with no account at all", async () => {
    const { runCommand } = await import("./pipeline");
    const r = await runCommand("e1", "createEmpire", { name: "Nobody", race: "human" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/sign in/i);
  });

  it("frees the account when the age is sealed", async () => {
    const { runCommand } = await import("./pipeline");
    const { eraReset } = await import("./world");
    const { getWorld } = await import("./world");

    await runCommand("e1", "createEmpire", { name: "Alpha", race: "human", accountId: "acc-a" });
    const before = await getWorld({ forceReload: true });
    expect(playerIdForAccount(before, "acc-a")).toBe("e1");

    // The rule reads the world, and the world is rebuilt — so next age the same
    // account founds again, with a new name and race, and nothing had to be
    // swept to make that true.
    const fresh = eraReset(before);
    expect(playerIdForAccount(fresh, "acc-a")).toBeNull();
  });
});
