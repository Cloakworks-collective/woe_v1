// Admin auth for the hidden /admin console. Enabled only when
// ADMIN_PASSWORD is set; the session cookie is an HMAC keyed by the
// password, so it cannot be forged without knowing it.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "woe_admin";

export function adminEnabled(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function sessionValue(): string {
  return createHmac("sha256", process.env.ADMIN_PASSWORD ?? "")
    .update("woe-admin-session")
    .digest("hex");
}

export function checkPassword(attempt: string): boolean {
  const secret = process.env.ADMIN_PASSWORD ?? "";
  if (!secret) return false;
  const a = Buffer.from(attempt);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  if (!adminEnabled()) return false;
  const jar = await cookies();
  return jar.get(COOKIE)?.value === sessionValue();
}

export async function setAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, sessionValue(), { httpOnly: true, sameSite: "lax", path: "/admin" });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
