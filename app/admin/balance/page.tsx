import Link from "next/link";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { Panel } from "@/components/Panel";
import { BalanceWorkbench } from "@/components/BalanceWorkbench";
import { adminEnabled, devOpenAdmin, isAdmin } from "@/lib/server/admin";
import { adminLogin } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminBalancePage() {
  if (!adminEnabled()) {
    return (
      <div className="frame" style={{ maxWidth: 560, flexDirection: "column", paddingTop: 40 }}>
        <Panel title="🔒 The Crown Chamber">
          <p style={{ fontSize: 14.5 }}>
            The chamber is sealed. Set <code>ADMIN_PASSWORD</code> in the environment to open it.
          </p>
        </Panel>
      </div>
    );
  }

  if (!(await isAdmin())) {
    return (
      <div className="frame" style={{ maxWidth: 560, flexDirection: "column", paddingTop: 40 }}>
        <AdminLoginForm action={adminLogin} />
      </div>
    );
  }

  return (
    <div className="frame" style={{ flexDirection: "column", maxWidth: 1180 }}>
      <div className="wb-topbar">
        <div>
          <h1 className="wb-title">⚖ Balance Workbench</h1>
          <p className="wb-subtitle">
            Tune every curve and constant and watch the shape change live. {devOpenAdmin() ? "Open during the build phase — " : ""}
            edits here are a preview; export the diff to apply.
          </p>
        </div>
        <nav className="wb-topnav">
          <Link href="/admin">← Crown Chamber</Link>
          <Link href="/almanac">Public Codex ↗</Link>
        </nav>
      </div>
      <BalanceWorkbench />
    </div>
  );
}
