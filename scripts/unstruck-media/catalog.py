# scripts/unstruck-media/catalog.py — writes public/unstruck-media/weekly.json,
# the Weekly's pictures and their color grids, from flags.js's and emoji.js's
# output.
#
#   python3 scripts/unstruck-media/catalog.py <flags.json> <emoji.json>
import json, os, sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
flags = [{"id": f["id"], "name": f["name"], "img": f"flags/{f['id']}.png", "cells": f["cells"]} for f in json.load(open(sys.argv[1]))]
emoji = json.load(open(sys.argv[2]))
catalog = {
    "flags": {"cols": 6, "rows": 4, "ratio": "4 / 3", "items": flags},
    "animals": {"cols": 6, "rows": 6, "ratio": "1 / 1", "items": emoji["animals"]},
    "food": {"cols": 6, "rows": 6, "ratio": "1 / 1", "items": emoji["food"]},
}
json.dump(catalog, open(os.path.join(ROOT, "public", "unstruck-media", "weekly.json"), "w"), separators=(",", ":"))
for kind, c in catalog.items():
    print(kind, len(c["items"]), "items,", len({i["cells"] for i in c["items"]}), "distinct grids")
