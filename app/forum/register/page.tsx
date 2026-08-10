import Link from "next/link";
import { FORUM_LIMITS } from "@/lib/constants/forum";
import { forumRegister } from "../actions";
import { Notice } from "../Notice";

export const dynamic = "force-dynamic";

export default async function ForumRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  return (
    <div style={{ maxWidth: 460, margin: "0 auto" }}>
      <Notice err={err} ok={ok} />
      <div className="flat-card">
        <h2>Register</h2>
        <p className="flat-sub">
          A forum account is its own thing: no empire needed, and it survives every era reset.
        </p>
        <form action={forumRegister}>
          <label className="flat-field">
            <span>Handle</span>
            <input
              name="handle"
              type="text"
              autoComplete="username"
              minLength={FORUM_LIMITS.HANDLE_MIN}
              maxLength={FORUM_LIMITS.HANDLE_MAX}
              required
            />
            <span className="flat-note">
              {FORUM_LIMITS.HANDLE_MIN}–{FORUM_LIMITS.HANDLE_MAX} characters. This is the name people
              will argue with.
            </span>
          </label>
          <label className="flat-field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={FORUM_LIMITS.PASSWORD_MIN}
              required
            />
            <span className="flat-note">At least {FORUM_LIMITS.PASSWORD_MIN} characters.</span>
          </label>
          <label className="flat-field">
            <span>Empire name (optional)</span>
            <input name="empireName" type="text" maxLength={30} />
            <span className="flat-note">
              Shown beside your handle. Cosmetic only — it grants nothing and is not checked.
            </span>
          </label>
          <button className="flat-btn" type="submit">Create account</button>
        </form>
        <p className="flat-hint" style={{ marginTop: 14 }}>
          Already registered? <Link href="/forum/login">Sign in</Link>.
        </p>
      </div>
    </div>
  );
}
