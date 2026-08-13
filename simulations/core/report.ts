// Turning a Report into something a person reads.
//
// Two renderings from one structure: a terminal view for the moment you run it,
// and markdown for the artefact you keep. Neither is the "real" one — the
// structure is, which is why harnesses never format their own output.

import type { Cell, Report, Row, Section, Table } from "./types";

const FLAG_MARK: Record<string, string> = { good: "✓", warn: "!", bad: "✗" };

export const num = (n: number, dp = 0): string =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—";

/** Turns into something a human reads as time. Payback of 4,100 turns means
 *  nothing; "28d" means "never". */
export function turnsToHuman(turns: number): string {
  if (!Number.isFinite(turns)) return "never";
  if (turns < 1) return "<1 turn";
  const days = turns / 144; // TURNS_PER_DAY — quoted, not imported, only for prose
  if (days < 1) return `${Math.round(turns)}t`;
  if (days < 100) return `${days.toFixed(days < 10 ? 1 : 0)}d`;
  return `${Math.round(days)}d`;
}

const cellOf = (c: string | number | Cell): Cell =>
  typeof c === "object" && c !== null ? c : { value: c };

const text = (c: string | number | Cell): string => {
  const cell = cellOf(c);
  const base = typeof cell.value === "number" ? num(cell.value) : String(cell.value);
  return cell.flag ? `${FLAG_MARK[cell.flag]} ${base}` : base;
};

/** Columns that are numeric in every row get right-aligned unless told otherwise. */
function numericColumns(t: Table): Set<number> {
  if (t.numeric) return new Set(t.numeric);
  const out = new Set<number>();
  t.columns.forEach((_, i) => {
    if (t.rows.length && t.rows.every((r) => typeof cellOf(r[i]).value === "number")) out.add(i);
  });
  return out;
}

// ── Terminal ────────────────────────────────────────────────────────────────

function padTable(t: Table): string[] {
  const right = numericColumns(t);
  const cells = [t.columns, ...t.rows.map((r: Row) => r.map(text))];
  const widths = t.columns.map((_, i) => Math.max(...cells.map((r) => String(r[i] ?? "").length)));
  const line = (r: (string | number)[]) =>
    "  " +
    r
      .map((c, i) => (right.has(i) ? String(c ?? "").padStart(widths[i]!) : String(c ?? "").padEnd(widths[i]!)))
      .join("  ");
  return [
    line(t.columns),
    "  " + widths.map((w) => "─".repeat(w)).join("  "),
    ...t.rows.map((r) => line(r.map(text))),
  ];
}

export function toTerminal(r: Report): string {
  const out: string[] = ["", "═".repeat(78), `  ${r.title}`, `  ${r.question}`, "═".repeat(78)];
  for (const s of r.sections) {
    out.push("", `── ${s.heading} ${"─".repeat(Math.max(0, 74 - s.heading.length))}`);
    if (s.question) out.push(`  ${s.question}`);
    if (s.body) out.push(...s.body.split("\n").map((l) => `  ${l}`));
    if (s.table) {
      out.push("", ...padTable(s.table));
      if (s.table.note) out.push(`  ${s.table.note}`);
    }
    if (s.findings?.length) {
      out.push("", "  Worth a look:");
      out.push(...s.findings.map((f) => `    · ${f}`));
    }
  }
  return out.join("\n");
}

// ── Markdown ────────────────────────────────────────────────────────────────

function mdTable(t: Table): string {
  const right = numericColumns(t);
  const sep = t.columns.map((_, i) => (right.has(i) ? "---:" : "---"));
  return [
    `| ${t.columns.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...t.rows.map((r: Row) => `| ${r.map((c) => text(c)).join(" | ")} |`),
  ].join("\n");
}

function mdSection(s: Section): string {
  const out = [`### ${s.heading}`];
  if (s.question) out.push("", `> ${s.question}`);
  if (s.body) out.push("", s.body);
  if (s.table) {
    out.push("", mdTable(s.table));
    if (s.table.note) out.push("", `*${s.table.note}*`);
  }
  if (s.findings?.length) {
    out.push("", "**Worth a look**", "", ...s.findings.map((f) => `- ${f}`));
  }
  return out.join("\n");
}

export function toMarkdown(r: Report, stamp: string): string {
  return [
    `# ${r.title}`,
    "",
    `> ${r.question}`,
    "",
    `*Generated ${stamp}. This report describes the game as it is; it decides nothing.*`,
    "",
    ...r.sections.map(mdSection),
    "",
  ].join("\n\n");
}
