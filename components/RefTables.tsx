import type { RefTable } from "@/lib/balance/catalog";

/** Read-only reference tables. Each carries a one-line explanation of what it
 *  governs. Rendered identically on the public Codex and the admin workbench. */
export function RefTables({ tables }: { tables: RefTable[] }) {
  if (!tables.length) return null;
  return (
    <div className="reftables">
      {tables.map((t) => {
        // Tables with more than four columns get their own full-width row so
        // they aren't crushed into a narrow grid cell; a column-scaled
        // min-width keeps them legible (they scroll inside their box if needed).
        const wide = t.wide ?? t.headers.length > 4;
        return (
          <figure key={t.key} className={`reftable${wide ? " reftable-wide" : ""}`}>
            <figcaption>
              <strong>{t.title}</strong>
              <span>{t.desc}</span>
            </figcaption>
            <div className="reftable-scroll">
              <table style={wide ? { minWidth: t.headers.length * 78 } : undefined}>
              <thead>
                <tr>
                  {t.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className={j === 0 ? "reftable-first" : ""}>
                        {typeof cell === "number" ? cell.toLocaleString("en-US") : cell}
                      </td>
                    ))}
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </figure>
        );
      })}
    </div>
  );
}
