// The forum has its own tables (supabase/migrations/0004_forum.sql). If a
// deployment has not run them yet that is a setup step, not a crash — so say so
// plainly and say exactly what to do.
export function SetupNotice() {
  return (
    <div className="flat-card">
      <h2>The forum is not set up yet</h2>
      <p className="flat-sub">
        Its tables have not been created. The forum keeps its own accounts and history so it can
        outlive every era, which means it needs its own schema.
      </p>
      <p className="flat-hint">Run the migration against your Supabase project:</p>
      <pre
        style={{
          background: "var(--parchment-dark)",
          border: "1px solid var(--flat-line-strong)",
          borderRadius: 6,
          padding: "10px 12px",
          overflowX: "auto",
          fontSize: 13,
        }}
      >
        supabase/migrations/0004_forum.sql
      </pre>
      <p className="flat-hint">
        Paste it into the Supabase SQL editor, or run <code>supabase db push</code> if the project is
        linked. Unset the Supabase keys and the forum falls back to{" "}
        <code>data/forum.json</code> for local development.
      </p>
    </div>
  );
}
