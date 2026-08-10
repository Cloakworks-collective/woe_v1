import Link from "next/link";

/** The Crown Chamber's rooms. /admin and /admin/balance were two unrelated
 *  pages joined by one nearly-invisible gold link; they are one console with
 *  three rooms now. */
export const ADMIN_TABS: { href: string; label: string }[] = [
  { href: "/admin", label: "👑 Chamber" },
  { href: "/admin/heartbeat", label: "💓 Heartbeat" },
  { href: "/admin/balance", label: "⚖ Balance" },
];

export function AdminTabs({ active }: { active: string }) {
  return (
    <div className="tabs admin-tabs">
      {ADMIN_TABS.map((t) => (
        <Link key={t.href} href={t.href} className={t.href === active ? "on" : undefined}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
