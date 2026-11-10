# scripts/unstruck-media/pictures.py — builds public/unstruck-media/weekly.json,
# the Weekly's pictures and their color grids.
#
#   python3 scripts/unstruck-media/pictures.py <flags.json> <source dir>
#
# <flags.json> comes from flags.js. <source dir> holds downloaded public-domain
# images (painting-*.jpg, animal-*.jpg) and paintings.json / animals.json
# describing them (id, name, file, source, artist). Each picture is cropped to
# a centered square, saved small for its tile, and reduced to a 6x6 grid of
# colors from a fixed palette, so two pictures' cells can be compared color
# for color. Each cell takes the color most of its pixels are nearest to.
import json, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "public", "unstruck-media")
FLAGS, SRC = sys.argv[1], sys.argv[2]

# One character per color, in the order of the palette.
PICTURE_PALETTE = [
    ("black", (22, 22, 24)), ("white", (238, 236, 228)), ("gray", (128, 128, 128)), ("red", (186, 40, 36)),
    ("orange", (222, 122, 44)), ("yellow", (226, 196, 64)), ("green", (72, 140, 64)), ("darkgreen", (36, 70, 42)),
    ("blue", (40, 76, 160)), ("lightblue", (128, 172, 214)), ("brown", (108, 70, 40)), ("beige", (200, 168, 122)),
    ("purple", (108, 60, 128)), ("pink", (220, 146, 160)),
]
CODES = "abcdefghijklmn"
COLS = ROWS = 6
TILE = 240


def nearest(r, g, b):
    best, bd = 0, 1e18
    for i, (_, (pr, pg, pb)) in enumerate(PICTURE_PALETTE):
        d = 2 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 3 * (b - pb) ** 2
        if d < bd:
            best, bd = i, d
    return best


def square(img):
    w, h = img.size
    side = min(w, h)
    return img.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side))


def cells_of(img):
    small = img.resize((COLS * 10, ROWS * 10), Image.LANCZOS)
    px = small.load()
    out = []
    for y in range(ROWS):
        for x in range(COLS):
            counts = [0] * len(PICTURE_PALETTE)
            for yy in range(y * 10, y * 10 + 10):
                for xx in range(x * 10, x * 10 + 10):
                    counts[nearest(*px[xx, yy][:3])] += 1
            out.append(CODES[counts.index(max(counts))])
    return "".join(out)


def pictures(kind):
    meta = os.path.join(SRC, f"{kind}s.json")
    if not os.path.exists(meta):
        return []
    os.makedirs(os.path.join(OUT, kind + "s"), exist_ok=True)
    items = []
    for it in json.load(open(meta)):
        img = square(Image.open(os.path.join(SRC, it["file"])).convert("RGB"))
        rel = f"{kind}s/{it['id']}.jpg"
        img.resize((TILE, TILE), Image.LANCZOS).save(os.path.join(OUT, rel), quality=78, optimize=True, progressive=True)
        items.append({"id": it["id"], "name": it["name"], "img": rel, "cells": cells_of(img),
                      "credit": {"by": it.get("artist", ""), "source": it["source"]}})
    return items


flags = [{"id": f["id"], "name": f["name"], "img": f"flags/{f['id']}.png", "cells": f["cells"]} for f in json.load(open(FLAGS))]
catalog = {
    "flags": {"cols": 6, "rows": 4, "ratio": "4 / 3", "items": flags},
    "paintings": {"cols": COLS, "rows": ROWS, "ratio": "1 / 1", "items": pictures("painting")},
    "animals": {"cols": COLS, "rows": ROWS, "ratio": "1 / 1", "items": pictures("animal")},
}
json.dump(catalog, open(os.path.join(OUT, "weekly.json"), "w"), separators=(",", ":"))
for kind, c in catalog.items():
    print(kind, len(c["items"]), "items,", len({i["cells"] for i in c["items"]}), "distinct grids")
