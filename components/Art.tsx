/* eslint-disable @next/next/no-img-element */

/** A pixel-art asset from public/art (PixelLab-generated), crisp-scaled. */
export function Art({
  path,
  size = 72,
  title,
}: {
  path: string; // e.g. "buildings/grange", "units/footman", "races/elf"
  size?: number;
  title?: string;
}) {
  return (
    <img
      src={`/art/${path}.png`}
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
