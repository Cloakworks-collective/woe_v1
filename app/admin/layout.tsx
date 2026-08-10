import Link from "next/link";
import { adminEnabled, isAdmin } from "@/lib/server/admin";
import { adminLogout } from "./actions";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { adminLogin } from "./actions";

export const dynamic = "force-dynamic";

// The console is a workbench, so it wears the flat shell (see .flat in
// globals.css) rather than the game's carpentry: dense tables, real inputs,
// and rooms you can reach in one click. Same palette, none of the woodwork.
const ROOMS: { href: string; label: string; hint: string }[] = [
  { href: "/admin", label: "Overview", hint: "Vitals, the world clock, dev tools" },
  { href: "/admin/empires", label: "Empires", hint: "The ledger: ban, grant, enter as" },
  { href: "/admin/forum", label: "Forum", hint: "Accounts, silences, moderation" },
  { href: "/admin/heartbeat", label: "Heartbeat", hint: "Tick history and health" },
  { href: "/admin/balance", label: "Balance", hint: "Every curve and constant" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!adminEnabled()) {
    return (
      <div className="flat">
        <div className="flat-wrap" style={{ maxWidth: 560, paddingTop: 48 }}>
          <div className="flat-card">
            <h2>The chamber is sealed</h2>
            <p className="flat-sub">
              Set <code>ADMIN_PASSWORD</code> in the environment to open it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!(await isAdmin())) {
    return (
      <div className="flat">
        <div className="flat-wrap" style={{ maxWidth: 460, paddingTop: 48 }}>
          <div className="flat-card">
            <h2>The Crown Chamber</h2>
            <p className="flat-sub">Admin only.</p>
            <AdminLoginForm action={adminLogin} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flat">
      <header className="flat-top is-wide">
        <div className="flat-top-inner" style={{ maxWidth: 1500 }}>
          <Link href="/admin" className="flat-brand">
            The Crown Chamber
            <small>admin console</small>
          </Link>
          <nav>
            {ROOMS.map((r) => (
              <Link key={r.href} href={r.href} title={r.hint}>
                {r.label}
              </Link>
            ))}
          </nav>
          <div className="flat-spacer" />
          <Link href="/" className="flat-btn is-ghost is-small">
            ← The game
          </Link>
          <form action={adminLogout}>
            <button className="flat-btn is-ghost is-small" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="flat-wrap is-wide">{children}</div>
    </div>
  );
}
