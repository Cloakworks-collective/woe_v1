import Link from "next/link";

/** A small right-aligned deep-link into the Field Manual, shown atop a page. */
export function LearnLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className="learn-bar">
      <Link href={href} className="learn-link">
        📜 {children} →
      </Link>
    </div>
  );
}
