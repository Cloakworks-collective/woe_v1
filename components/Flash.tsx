export function Flash({ err, ok }: { err?: string; ok?: string }) {
  if (!err && !ok) return null;
  return (
    <div
      style={{
        border: `2px solid ${err ? "var(--warn)" : "var(--green)"}`,
        background: err ? "#f4d8d0" : "#e4eecb",
        color: err ? "var(--warn)" : "var(--green-dark)",
        padding: "6px 12px",
        fontSize: 14.5,
        fontWeight: 700,
      }}
    >
      {err ?? ok}
    </div>
  );
}
