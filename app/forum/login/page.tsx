import Link from "next/link";
import { forumLogin } from "../actions";
import { Notice } from "../Notice";

export const dynamic = "force-dynamic";

export default async function ForumLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <Notice err={err} ok={ok} />
      <div className="flat-card">
        <h2>Sign in</h2>
        <p className="flat-sub">Your forum handle — not your empire.</p>
        <form action={forumLogin}>
          <label className="flat-field">
            <span>Handle</span>
            <input name="handle" type="text" autoComplete="username" required />
          </label>
          <label className="flat-field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="flat-btn" type="submit">Sign in</button>
        </form>
        <p className="flat-hint" style={{ marginTop: 14 }}>
          No account? <Link href="/forum/register">Register one</Link> — it takes a handle and a
          password, nothing else.
        </p>
      </div>
    </div>
  );
}
