/**
 * A segmented radio-pill control — a friendlier replacement for a <select>
 * inside a form. The checked pill's value submits under `name`. Styling in
 * globals.css (.pills / .pill), selection via :has(input:checked).
 */
export function Pills({
  name,
  options,
  defaultValue,
  ariaLabel,
}: {
  name: string;
  options: { value: string; label: string; title?: string; disabled?: boolean }[];
  defaultValue?: string;
  ariaLabel?: string;
}) {
  // Never open on a pill nobody can pick — fall back to the first live one.
  const live = options.filter((o) => !o.disabled);
  const wanted = defaultValue ?? live[0]?.value;
  const initial = live.some((o) => o.value === wanted) ? wanted : live[0]?.value;
  return (
    <span className="pills" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <label className={`pill${o.disabled ? " is-off" : ""}`} key={o.value} title={o.title}>
          <input
            type="radio"
            name={name}
            value={o.value}
            defaultChecked={o.value === initial}
            disabled={o.disabled}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </span>
  );
}
