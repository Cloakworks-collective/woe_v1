/* eslint-disable @next/next/no-img-element */

/** Folders where every race has its own take on the same subject — an orc
 *  farmer looks nothing like an elf one. Art in these gets swapped for the
 *  viewer's own people when a race is given; everything else is universal. */
const RACED = new Set(["workers", "units", "advisors"]);

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
  const [folder, ...rest] = path.split("/");
  const src = race && rest.length === 1 && RACED.has(folder) ? `${folder}/${race}/${rest[0]}` : path;

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
