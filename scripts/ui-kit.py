#!/usr/bin/env python3
"""Slice the PixelLab UI kits into the 9-slice trims + icons the CSS uses.

Four kit sheets came back from PixelLab as single atlases:

  public/art/ui/kit-parchment.png  (woe-panel-frame)  — ornate parchment chrome
  public/art/ui/kit-green.png      (woe-button-green) — green plaques & icons
  public/art/ui/kit-wood.png       (woe-wood-chrome)  — oak bars, rails & plates
  public/art/ui/kit-icons.png      (woe-nav-icons)    — 20 menu emblems

`border-image` needs one file per piece, so this cuts each sprite out of its
atlas, repairs it where the atlas art can't 9-slice as-drawn (the panel frame
carries a baked-in title plaque; we rebuild the frame from its clean runs), and
writes the pieces to public/art/ui/.  Colour variants (amber/red/grey buttons,
dark-theme frames) are derived here too so there is a single source of truth.

Run:  python3 scripts/ui-kit.py
"""

from __future__ import annotations

import colorsys
import os
from collections import Counter, deque

from PIL import Image

UI = os.path.join(os.path.dirname(__file__), "..", "public", "art", "ui")
UI = os.path.normpath(UI)

PARCHMENT = Image.open(os.path.join(UI, "kit-parchment.png")).convert("RGBA")
GREEN = Image.open(os.path.join(UI, "kit-green.png")).convert("RGBA")
WOOD = Image.open(os.path.join(UI, "kit-wood.png")).convert("RGBA")
ICONS = Image.open(os.path.join(UI, "kit-icons.png")).convert("RGBA")
ICONS2 = Image.open(os.path.join(UI, "kit-icons2.png")).convert("RGBA")


def cut(sheet: Image.Image, x: int, y: int, w: int, h: int) -> Image.Image:
    return sheet.crop((x, y, x + w, y + h))


def save(im: Image.Image, name: str) -> None:
    im.save(os.path.join(UI, name))
    print(f"  {name}  {im.width}x{im.height}")


# ── colour transforms ────────────────────────────────────────────────────────


def darken(im: Image.Image, factor: float = 0.44, desat: float = 0.8) -> Image.Image:
    """Night-shift a trim so the same art can back the dark theme."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            r2, g2, b2 = colorsys.hsv_to_rgb(h, s * desat, v * factor)
            px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    return out


def recolour(im: Image.Image, hue: float, sat_mul: float = 1.0, val_mul: float = 1.0) -> Image.Image:
    """Swing the green face of a button plaque to another hue, leaving the
    gold/wood border (which is nowhere near green) untouched."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.20 <= h <= 0.47 and s > 0.10:  # the green field only
                r2, g2, b2 = colorsys.hsv_to_rgb(hue, min(1, s * sat_mul), min(1, v * val_mul))
                px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    return out


def greyscale(im: Image.Image, val_mul: float = 0.9) -> Image.Image:
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            r2, g2, b2 = colorsys.hsv_to_rgb(h, s * 0.16, v * val_mul)
            px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    return out


def hollow(im: Image.Image, seed: tuple[int, int], lum_min: float = 150.0) -> Image.Image:
    """Punch the fill out of a frame so only the moulding survives.

    Flood-fills the bright interior from `seed`, stopping at the dark outline —
    the result is a border-image whose middle slices are transparent, so panel
    backgrounds show through unchanged in either theme.
    """
    out = im.copy()
    px = out.load()
    w, h = out.size
    q = deque([seed])
    seen = {seed}
    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        if 0.299 * r + 0.587 * g + 0.114 * b < lum_min:
            continue
        px[x, y] = (r, g, b, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
                seen.add((nx, ny))
                q.append((nx, ny))
    return out


def key_out(im: Image.Image, tol: int = 30, field_is_unique: bool = False) -> Image.Image:
    """Drop the flat backing tile behind an icon, keeping the emblem.

    Each emblem is drawn on a flat rounded square with a black outline — and
    the emblems are outlined in that same black, so no single flood can
    separate them.  We take the tile apart in two passes instead:

      1. erase the field, whose colour is read off the tile's own margin
         rather than assumed (the two sheets came back with dark grey tiles
         and near-white ones, and both have to key the same way);
      2. erase the black ring, but only where it is *not* hugging emblem art.

    After (1) the tile's outline has transparency on both sides, while an
    emblem's outline still has the emblem pressed against it — so "does this
    black pixel touch something we kept?" cleanly tells the two rings apart,
    even where an emblem runs off the edge of its tile.
    """
    out = im.copy()
    px = out.load()
    w, h = out.size

    def inky(c) -> bool:
        return c[3] != 0 and max(c[:3]) <= 34

    # The field colour is whatever fills the tile's margin — the band just
    # inside the outline, where no emblem reaches.
    margin: Counter[tuple[int, int, int]] = Counter()
    for y in range(h):
        for x in range(w):
            if x < 3 or y < 3 or x >= w - 3 or y >= h - 3:
                c = px[x, y]
                if c[3] > 200 and not inky(c):
                    margin[c[:3]] += 1
    if not margin:
        return out
    field = margin.most_common(1)[0][0]

    def is_field(c) -> bool:
        return c[3] != 0 and max(abs(c[i] - field[i]) for i in range(3)) <= tol

    # How the field comes out depends on whether the emblems share its colour,
    # which differs between the two sheets and can't be split by one rule:
    #
    #  * The dark sheet's tile is a grey nothing in any emblem wears, so the
    #    colour can be keyed everywhere. That also clears pockets of tile the
    #    art encloses — the gap inside a crossed bow and arrow — which a flood
    #    can't reach from outside.
    #  * The pale sheet's tile is near-white, and so are the highlights on a
    #    spyglass barrel and a camel's flank. Keying globally eats those, so it
    #    floods from the tile's margin instead and accepts that a fully
    #    enclosed scrap of tile survives.
    #
    # Seeding is from the margin — a band a few pixels inside the sprite — not
    # from the sprite edge, because the edge is the tile's *outline*, and a
    # flood allowed to cross that is equally free to walk an emblem's outline
    # inwards.
    if field_is_unique:
        for y in range(h):
            for x in range(w):
                if is_field(px[x, y]):
                    px[x, y] = (0, 0, 0, 0)
    else:
        band, inner = 4, 9
        q = deque()
        seen = set()
        for y in range(h):
            for x in range(w):
                margin = x < inner or y < inner or x >= w - inner or y >= h - inner
                if margin and x >= band and y >= band and x < w - band and y < h - band:
                    if is_field(px[x, y]) and (x, y) not in seen:
                        seen.add((x, y))
                        q.append((x, y))
        while q:
            x, y = q.popleft()
            if not is_field(px[x, y]):
                continue
            px[x, y] = (0, 0, 0, 0)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
                    seen.add((nx, ny))
                    q.append((nx, ny))

    doomed = []
    for y in range(h):
        for x in range(w):
            if not inky(px[x, y]):
                continue
            hugs = False
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        n = px[nx, ny]
                        if n[3] != 0 and not inky(n):
                            hugs = True
            if not hugs:
                doomed.append((x, y))
    for x, y in doomed:
        px[x, y] = (0, 0, 0, 0)
    return out


def trim(im: Image.Image) -> Image.Image:
    box = im.getbbox()
    return im.crop(box) if box else im


def grid_cells(sheet: Image.Image, expect: int, min_px: int = 400) -> list[tuple[int, int, int, int]]:
    """Find each emblem's bounding box on an icon sheet, in reading order.

    Rows are recovered by bucketing on the box's vertical midpoint rather than
    its top edge, so a tall emblem still sorts into the row it belongs to.
    """
    w, h = sheet.size
    px = sheet.load()
    seen = [[False] * w for _ in range(h)]
    boxes: list[tuple[int, int, int, int]] = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] <= 8 or seen[y][x]:
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            x0 = x1 = x
            y0 = y1 = y
            n = 0
            while q:
                cx, cy = q.popleft()
                n += 1
                x0, x1 = min(x0, cx), max(x1, cx)
                y0, y1 = min(y0, cy), max(y1, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] > 8 and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if n >= min_px:
                boxes.append((x0, y0, x1 - x0 + 1, y1 - y0 + 1))
    cols = round(expect ** 0.5) if expect == int(expect ** 0.5) ** 2 else 5
    pitch = h / max(1, expect / cols)
    boxes.sort(key=lambda b: (int((b[1] + b[3] / 2) // pitch), b[0]))
    return boxes


def mirror_tile(im: Image.Image) -> Image.Image:
    """Mirror a crop into a seamless 2x2 tile.

    Wood grain and parchment fibre are directionless enough that a mirrored
    tile reads as continuous material, which a raw crop would not — its edges
    would show as a grid the moment it repeated.
    """
    w, h = im.size
    fh, fv = Image.Transpose.FLIP_LEFT_RIGHT, Image.Transpose.FLIP_TOP_BOTTOM
    out = Image.new("RGBA", (w * 2, h * 2))
    out.paste(im, (0, 0))
    out.paste(im.transpose(fh), (w, 0))
    out.paste(im.transpose(fv), (0, h))
    out.paste(im.transpose(fh).transpose(fv), (w, h))
    return out


# ── the ornate panel frame ───────────────────────────────────────────────────


def panel_frame() -> Image.Image:
    """Rebuild the parchment panel as a symmetrical 9-slice.

    The atlas panel wears a title plaque across its top edge, which cannot tile.
    We therefore keep the gold corner flourish and the clean border runs, mirror
    them into all four corners/edges, and drop the plaque — the game already has
    a dedicated header banner for panel titles.
    """
    src = hollow(cut(PARCHMENT, 14, 142, 79, 56), (39, 28))
    slice_ = 16
    mid = 12
    size = slice_ * 2 + mid

    corner = src.crop((0, 40, 16, 56))  # bottom-left gold flourish
    v_edge = src.crop((0, 24, 16, 36))  # clean left-hand border run (16x12)
    h_edge = src.crop((32, 40, 44, 56))  # clean bottom border run (12x16)

    fh = Image.Transpose.FLIP_LEFT_RIGHT
    fv = Image.Transpose.FLIP_TOP_BOTTOM

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(corner.transpose(fv), (0, 0))
    out.paste(corner.transpose(fv).transpose(fh), (slice_ + mid, 0))
    out.paste(corner, (0, slice_ + mid))
    out.paste(corner.transpose(fh), (slice_ + mid, slice_ + mid))
    out.paste(h_edge.transpose(fv), (slice_, 0))
    out.paste(h_edge, (slice_, slice_ + mid))
    out.paste(v_edge, (0, slice_))
    out.paste(v_edge.transpose(fh), (slice_ + mid, slice_))
    return out


# ── build ────────────────────────────────────────────────────────────────────


def main() -> None:
    print("panel frame")
    frame = panel_frame()
    save(frame, "panel-frame.png")
    save(darken(frame, 0.40), "panel-frame-dark.png")

    print("buttons")
    btn = cut(GREEN, 177, 126, 46, 17)
    save(btn, "btn-green.png")
    save(recolour(btn, 0.085, 1.10, 1.95), "btn-amber.png")  # repair
    save(recolour(btn, 0.015, 0.62, 1.55), "btn-red.png")  # can't afford
    save(greyscale(btn, 1.15), "btn-grey.png")  # disabled

    print("cards & chips")
    card = hollow(cut(PARCHMENT, 202, 127, 37, 32), (18, 16))
    save(card, "card-frame.png")
    save(darken(card, 0.40), "card-frame-dark.png")
    chip = cut(PARCHMENT, 213, 76, 29, 19)
    save(chip, "chip.png")
    save(darken(chip, 0.46), "chip-dark.png")
    plaque = cut(PARCHMENT, 186, 163, 53, 20)
    save(plaque, "plaque.png")
    save(darken(plaque, 0.46), "plaque-dark.png")

    print("art slots")
    save(cut(PARCHMENT, 125, 14, 16, 17), "slot.png")
    save(darken(cut(PARCHMENT, 125, 14, 16, 17), 0.46), "slot-dark.png")
    save(cut(GREEN, 105, 143, 14, 14), "slot-sm.png")
    save(darken(cut(GREEN, 105, 143, 14, 14), 0.46), "slot-sm-dark.png")

    print("bars & rules")
    track = cut(PARCHMENT, 12, 239, 55, 10)
    save(track, "bar-track.png")
    save(darken(track, 0.34), "bar-track-dark.png")
    rule = cut(PARCHMENT, 125, 126, 72, 17)
    save(rule, "rule.png")
    save(darken(rule, 0.46), "rule-dark.png")

    print("icon buttons")
    for name, box in {
        "icon-prev": (125, 0, 14, 13),
        "icon-next": (159, 0, 13, 13),
        "icon-up": (142, 0, 14, 13),
        "icon-down": (142, 15, 14, 15),
        "icon-info": (208, 0, 15, 13),
        "icon-check": (191, 70, 14, 15),
        "icon-x": (207, 70, 14, 15),
    }.items():
        save(cut(GREEN, *box), f"{name}.png")

    print("extra button enamels")
    save(recolour(btn, 0.125, 0.85, 1.85), "btn-gold.png")  # crown / bestow
    save(recolour(btn, 0.070, 0.70, 0.95), "btn-wood.png")  # recall / undo

    print("substrate tiles")
    # Parchment fibre from inside an atlas panel, and oak grain from inside the
    # toolbar and the side rail. These tile as plain backgrounds; the gold trim
    # around them is a separate 9-slice, so texture never stretches with the box.
    parch = mirror_tile(cut(PARCHMENT, 34, 156, 40, 28))
    save(parch, "parchment-tile.png")
    save(darken(parch, 0.13, 0.85), "parchment-tile-dark.png")
    save(mirror_tile(cut(WOOD, 120, 33, 60, 24)), "wood-tile.png")
    save(mirror_tile(cut(WOOD, 40, 150, 30, 60)), "wood-tile-v.png")

    print("wood chrome")
    # Each piece ships whole: the CSS slices it, and the middle slices carry
    # real grain (and the rivets), so they repeat rather than smear.
    for name, box in (
        ("wood-bar", (22, 19, 645, 60)),
        ("wood-rail", (22, 102, 87, 264)),
        ("wood-head", (129, 102, 270, 47)),
        ("wood-row", (129, 164, 270, 41)),
        ("input-slot", (129, 220, 270, 43)),
        ("th-strip", (129, 279, 270, 36)),
        ("tab-on", (430, 102, 146, 47)),
        ("tab-off", (430, 164, 146, 46)),
        ("ribbon", (430, 236, 237, 60)),
    ):
        piece = cut(WOOD, *box)
        save(piece, f"{name}.png")
        save(darken(piece, 0.62, 0.9), f"{name}-dark.png")

    print("wood ornaments")
    save(trim(cut(WOOD, 430, 311, 82, 61)), "corner-bracket.png")
    save(trim(cut(WOOD, 602, 107, 33, 34)), "stud.png")
    save(trim(cut(WOOD, 596, 165, 45, 46)), "boss.png")

    print("nav emblems")
    # Each sheet is a 5x4 grid of emblems on flat backing tiles, in the order
    # they were requested. We find the cells by connected component rather than
    # by arithmetic — an emblem that overruns its tile (the castle's spires, the
    # banner's pole) makes its cell taller than the grid pitch — then key the
    # tile out so an emblem can sit on parchment, wood or a carved slot without
    # carrying a coloured square around with it.
    os.makedirs(os.path.join(UI, "icons"), exist_ok=True)
    sheets = [
        (ICONS, True, [
            "castle", "chronicle", "advisor", "build", "workers",
            "research", "market", "army", "siege", "clan",
            "crown", "world", "forum", "trophy", "coin",
            "skull", "fire", "banner", "letter", "scroll",
        ]),
        (ICONS2, False, [
            "lock", "warning", "star", "vacation", "quill",
            "wrench", "target", "caravan", "heart", "seedling",
            "houses", "bed", "brick", "flag", "temple",
            "horse", "blast", "idea", "spyglass", "medal",
        ]),
    ]
    for sheet, unique_field, names in sheets:
        cells = grid_cells(sheet, len(names))
        if len(cells) != len(names):
            raise SystemExit(f"expected {len(names)} emblems, found {len(cells)}")
        for name, box in zip(names, cells):
            keyed = key_out(cut(sheet, *box), field_is_unique=unique_field)
            save(trim(keyed), os.path.join("icons", f"{name}.png"))


if __name__ == "__main__":
    main()
