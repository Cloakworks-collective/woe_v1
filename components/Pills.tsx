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
  options: { value: string; label: string; title?: string }[];
  defaultValue?: string;
  ariaLabel?: string;
}) {
  const initial = defaultValue ?? options[0]?.value;
  return (
    <span className="pills" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <label className="pill" key={o.value} title={o.title}>
          <input type="radio" name={name} value={o.value} defaultChecked={o.value === initial} />
          <span>{o.label}</span>
        </label>
      ))}
    </span>
  );
}
