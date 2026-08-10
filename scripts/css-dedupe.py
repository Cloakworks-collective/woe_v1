#!/usr/bin/env python3
"""Merge selectors that globals.css declares more than once.

The stylesheet grew by appending: a feature would restyle `.topbar` or `.nav`
at the bottom of the file rather than editing the original block, so the same
selector ends up defined in two or three places and you have to read all of
them to know what an element actually looks like.

This folds each such group into a single block at the position of its *last*
occurrence — the one that was winning anyway — with earlier declarations kept
underneath the later ones that overrode them. Blocks only merge when they sit
in the same at-rule context, so a rule inside `@media (max-width: 720px)` is
never folded into the same selector at the top level.

Moving a declaration later in the file can in principle change which rule wins
against an *unrelated* selector of equal specificity, so this is verified
rather than trusted: snapshot every element's computed style across the site
before and after (see .css-baseline.json) and require the diff to be empty.

Run:  python3 scripts/css-dedupe.py [--dry-run]
"""

from __future__ import annotations

import collections
import os
import re
import sys

CSS = os.path.join(os.path.dirname(__file__), "..", "app", "globals.css")
CSS = os.path.normpath(CSS)


def split_decls(body: str) -> list[tuple[str, str]]:
    """Split a rule body into (property, whole-declaration-text) pairs.

    Splitting on ';' has to respect quotes and parens — a data: URI or a
    `content: "a;b"` would otherwise be cut in half.
    """
    out: list[tuple[str, str]] = []
    depth = 0
    quote = ""
    buf = ""
    for ch in body:
        if quote:
            buf += ch
            if ch == quote:
                quote = ""
            continue
        if ch in "\"'":
            quote = ch
            buf += ch
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == ";" and depth == 0:
            if buf.strip():
                out.append((prop_of(buf), buf.strip()))
            buf = ""
            continue
        buf += ch
    if buf.strip():
        out.append((prop_of(buf), buf.strip()))
    return out


def prop_of(decl: str) -> str:
    decl = re.sub(r"/\*.*?\*/", "", decl, flags=re.S).strip()
    return decl.split(":", 1)[0].strip().lower() if ":" in decl else ""


def parse(src: str):
    """Yield every rule block as (head_start, brace, close, selector, context)."""
    rules = []
    stack: list[tuple[str, str]] = []
    i, n = 0, len(src)
    head_start = 0
    while i < n:
        ch = src[i]
        if ch == "/" and src[i : i + 2] == "/*":
            end = src.find("*/", i)
            i = n if end < 0 else end + 2
            continue
        if ch in "\"'":
            q = ch
            i += 1
            while i < n and src[i] != q:
                i += 2 if src[i] == "\\" else 1
            i += 1
            continue
        if ch == "{":
            head = src[head_start:i]
            clean = re.sub(r"/\*.*?\*/", "", head, flags=re.S).strip()
            if clean.startswith("@"):
                stack.append(("at", clean))
            else:
                ctx = " > ".join(h for k, h in stack if k == "at")
                stack.append(("rule", clean))
                rules.append({"head_start": head_start, "brace": i, "sel": clean, "ctx": ctx})
            i += 1
            head_start = i
            continue
        if ch == "}":
            if stack:
                kind, _ = stack.pop()
                if kind == "rule":
                    for r in reversed(rules):
                        if "close" not in r:
                            r["close"] = i
                            break
            i += 1
            head_start = i
            continue
        i += 1
    return [r for r in rules if "close" in r]


def conflicts(a: str, b: str) -> bool:
    """Could declaring `a` and `b` fight over the same computed value?"""
    if a == b:
        return True
    fa, fb = a.split("-", 1)[0], b.split("-", 1)[0]
    return fa == fb and (a.startswith(b + "-") or b.startswith(a + "-"))


# Groups that must not be folded together, with the reason.
#
# Folding a group into its last position moves any property only the earlier
# blocks declared further down the file, and against a rule of equal
# specificity position is what picks the winner. Whether that matters can't be
# decided by reading the selectors: `.alert .alert-cta` and
# `.alert-danger .alert-cta-ghost` share no token, yet both match the same
# element, because the markup puts both classes on it. So the list below is
# empirical — it is what the computed-style diff flagged.
SKIP = {
    ".alert .alert-cta": "moving `border: 1px solid transparent` past "
    "`.alert-danger .alert-cta-ghost` strips the tint off ghost buttons",
}


def norm(sel: str) -> str:
    parts = [re.sub(r"\s+", " ", p.strip()) for p in sel.split(",")]
    return ",".join(sorted(p for p in parts if p))


def main() -> None:
    dry = "--dry-run" in sys.argv
    src = open(CSS, encoding="utf8").read()
    rules = parse(src)

    groups: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    for r in rules:
        groups[(r["ctx"], norm(r["sel"]))].append(r)
    dups = {k: v for k, v in groups.items() if len(v) > 1}

    props_of = {
        id(r): {p for p, _ in split_decls(src[r["brace"] + 1 : r["close"]]) if p} for r in rules
    }

    edits = []  # (start, end, replacement)
    merged_props = 0
    skipped: list[str] = []
    for (ctx, sel), blocks in dups.items():
        if sel in SKIP:
            skipped.append(f"{sel}  — {SKIP[sel]}")
            continue
        # A media query adds no specificity, so a top-level rule that sits
        # after one beats it. Folding a group downwards can carry a property
        # past its own responsive override — `.topbar { gap: 16px }` moving
        # below `@media (max-width: 640px) { .topbar { gap: 6px 12px } }`
        # silently un-tightens the phone header. Unlike the class collisions
        # above, this one is visible in the source, so check for it.
        last_props = props_of[id(blocks[-1])]
        moved = set().union(*(props_of[id(b)] - last_props for b in blocks[:-1]))
        if moved:
            lo, hi = blocks[0]["head_start"], blocks[-1]["head_start"]
            shadowed = next(
                (
                    r for r in rules
                    if r["ctx"] and not ctx
                    and norm(r["sel"]) == sel
                    and lo < r["head_start"] < hi
                    and any(conflicts(m, p) for m in moved for p in props_of[id(r)])
                ),
                None,
            )
            if shadowed is not None:
                skipped.append(f'{sel}  — would move past {shadowed["ctx"][:44]}')
                continue
        # Keep each property at the position of its *last* declaration, not
        # its first. Order matters between overlapping shorthands: `.topnav`
        # set `border-bottom` then, in a later block, `border-width` and a new
        # `border-bottom`. Holding the property at its first slot would put
        # `border-width` after `border-bottom` and quietly restore the bottom
        # edge to the shorthand's value.
        decls: dict[str, tuple[int, str]] = {}
        for seq, b in enumerate(blocks):
            for i, (prop, text) in enumerate(split_decls(src[b["brace"] + 1 : b["close"]])):
                if not prop:
                    continue
                if prop in decls:
                    merged_props += 1
                decls[prop] = (seq * 10000 + i, text)
        last = blocks[-1]
        ordered = sorted(decls.values())
        body = "\n".join(f"  {text};" for _, text in ordered)
        # Keep the head verbatim — its leading blank lines and any comment
        # above it are part of the block, and rebuilding them by hand is how
        # you end up gluing `}` to the next selector.
        head = src[last["head_start"] : last["brace"]].rstrip()
        edits.append((last["head_start"], last["close"] + 1, f"{head} {{\n{body}\n}}"))
        for b in blocks[:-1]:
            # Exactly the block and its own head, nothing past the closing
            # brace: the next rule's head starts at close+1, so reaching any
            # further makes two edits overlap and corrupts both.
            edits.append((b["head_start"], b["close"] + 1, ""))

    edits.sort(key=lambda e: -e[0])
    for (s1, e1, _), (s2, _, _) in zip(edits, edits[1:]):
        if s2 > s1:
            raise SystemExit(f"overlapping edits at {s1}/{s2} — offsets would corrupt")
        assert e1 >= s1
    out = src
    for start, end, repl in edits:
        out = out[:start] + repl + out[end:]
    # Deleting a block leaves the blank lines that framed it behind.
    out = re.sub(r"\n{3,}", "\n\n", out)

    merged = len(edits) - sum(1 for e in edits if e[2] == "")
    print(f"selectors merged: {merged} of {len(dups)} duplicated")
    print(f"blocks removed:   {sum(1 for e in edits if e[2] == '')}")
    print(f"declarations that were being overridden: {merged_props}")
    if skipped:
        print(f"left alone as unsafe to relocate ({len(skipped)}):")
        for s in skipped:
            print(f"  - {s}")
    print(f"lines: {src.count(chr(10))} -> {out.count(chr(10))}")
    if dry:
        print("(dry run — nothing written)")
        return
    open(CSS, "w", encoding="utf8").write(out)
    print(f"wrote {CSS}")


if __name__ == "__main__":
    main()
