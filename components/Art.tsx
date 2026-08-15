/* eslint-disable @next/next/no-img-element */

/** Folders where every race has its own take on the same subject — an orc
 *  farmer looks nothing like an elf one. Art in these gets swapped for the
 *  viewer's own people when a race is given; everything else is universal. */
const RACED = new Set(["workers", "units", "advisors"]);

/** …and of those, the folders whose raceless file was only ever a byte-for-byte
 *  copy of the human one. Asking for `units/footman` with no race now resolves
 *  to `units/human/footman` — same pixels, one file. Advisors are excluded:
 *  their raceless portraits are distinct art and the Advisors page leans on
 *  them as a real fallback when a race has no portrait of its own. */
const HUMAN_DEFAULT = new Set(["workers", "units"]);

/**
 * The file a request actually resolves to, race swap and all.
 *
 * Exported because anything that needs to know whether a sprite EXISTS on disk
 * has to ask about the resolved path, not the requested one — `units/footman`
 * is never a file. See TiredArt, which falls back per race.
 */
export function resolveArtPath(path: string, race?: string): string {
  const [folder, ...rest] = path.split("/");
  const people = race ?? (HUMAN_DEFAULT.has(folder) ? "human" : null);
  return people && rest.length === 1 && RACED.has(folder) ? `${folder}/${people}/${rest[0]}` : path;
}

/** A pixel-art asset from public/art (PixelLab-generated), crisp-scaled. */
export function Art({
  path,
  size = 72,
  title,
  race,
}: {
  path: string; // e.g. "buildings/grange", "units/footman", "races/elf"
  size?: number;
  title?: string;
  race?: string; // swaps in that race's version of a raced asset
}) {
  const src = resolveArtPath(path, race);

  return (
    <img
      src={`/art/${src}.png`}
      width={size}
      height={size}
      alt={title ?? path}
      title={title}
      loading="lazy"
      decoding="async"
      style={{ imageRendering: "pixelated", verticalAlign: "middle" }}
    />
  );
}
