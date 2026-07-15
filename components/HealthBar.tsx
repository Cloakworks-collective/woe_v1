// A compact building-integrity bar (0.5–1.0). Green when sound, amber when
// cracked, red when near the 50% floor. Used across Buildings + reports.

export function HealthBar({ integrity, label }: { integrity: number; label?: string }) {
  const pct = Math.round(integrity * 100);
  const state = integrity >= 0.999 ? "full" : integrity >= 0.75 ? "warn" : "crit";
  return (
    <span
      className="hp"
      title={`${label ? label + " — " : ""}integrity ${pct}%`}
      aria-label={`${label ? label + " " : ""}integrity ${pct} percent`}
    >
      <span className={`bar hp-track ${state}`}>
        <i style={{ width: `${pct}%` }} />
      </span>
      <small>{pct}%</small>
    </span>
  );
}
