// Shared ?err= / ?ok= banner. One component so every forum page reports the
// same way, in the same place.
export function Notice({ err, ok }: { err?: string; ok?: string }) {
  if (!err && !ok) return null;
  return (
    <p className={`flat-notice ${err ? "is-bad" : "is-good"}`} role="status">
      {err ?? ok}
    </p>
  );
}
