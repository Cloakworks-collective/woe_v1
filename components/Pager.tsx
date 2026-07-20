import Link from "next/link";
import type { Paged } from "@/lib/paginate";

/**
 * The shared pager footer for the ladder and every chronicle feed. `href(n)`
 * builds the link for page n (callers weave in their own query params). `noun`
 * names what's being counted ("empires", "tidings", "battles").
 */
export function Pager<T>({
  page,
  href,
  noun,
}: {
  page: Paged<T>;
  href: (n: number) => string;
  noun: string;
}) {
  const { pageNo, pages, start, shown, total } = page;
  const from = total === 0 ? 0 : start + 1;
  const to = start + shown.length;
  return (
    <div className="rank-pager">
      {pageNo > 1 ? (
        <Link href={href(pageNo - 1)}>← Prev</Link>
      ) : (
        <span className="pager-off">← Prev</span>
      )}
      <span>
        Showing {from}–{to} of {total.toLocaleString("en-US")} {noun} · Page {pageNo} of {pages}
      </span>
      {pageNo < pages ? (
        <Link href={href(pageNo + 1)}>Next →</Link>
      ) : (
        <span className="pager-off">Next →</span>
      )}
    </div>
  );
}
