#!/usr/bin/env python3
"""OCR a Migros flyer page into positioned text items.

Reads a manifest on argv, writes one JSON object per page to stdout:

    {"pageNumber": 1, "width": 2199, "height": 2997,
     "items": [{"text": "5.95", "box": [[x,y],[x,y],[x,y],[x,y]]}, ...]}

WHY A PYTHON SUBPROCESS AT ALL
rapidocr-onnxruntime is CPU-only, free and has no system dependencies, but has
no TypeScript equivalent. The pipeline is TypeScript; this is the one place it
shells out, and the JSON contract keeps that boundary narrow.

THE SEGFAULT — measured 2026-09-10, not inherited from notes
Upscaling a whole page crashes the ONNX runtime:

    1.0x  (2199x2997)  ok, 90 items, 1.7s
    1.5x  (3298x4495)  SIGSEGV (exit 139)
    2.0x  (4398x5994)  SIGSEGV (exit 139)

It is IMAGE SIZE, not upscaling: a 4398x2158 strip at 2x runs fine. So when
upscaling is wanted the page is cut into horizontal strips first.

WHAT TILING ACTUALLY BUYS — measured on pages 5 and 7
    sale prices        11 vs 11  — IDENTICAL, no gain
    reference prices   recovers "statt 9.-" where 1x reads "statt 9."
    cost               2.7x slower, plus duplicate tokens from the overlap

"9.-" is Swiss for exactly nine francs. At 1x it is unparseable, so the offer
loses its original price and, under the ALDI rule, its discount too. That is the
whole benefit: a recovered reference price, not a recovered sale price. The
earlier claim that 2x recovered a SALE price of 9.90 did not reproduce.

Default is therefore 1x. Pass --tiled to trade time for reference prices.

── FETCH ONCE, AND CARRY REAL PAGE NUMBERS THROUGH (WP-C1, 2026-09-15) ──────

The caller (live-sources.ts) downloads every flyer page image exactly once —
that download IS the "one fetch per store per week" the pipeline is bound to.
This script must never fetch the flyer again: pass it local file paths (the
already-downloaded bytes, written to temp files), not the original https://
urls, and load_image() never touches the network for a local path.

Page numbers are read from the MANIFEST, never from argv position. If the
caller's download step skipped one page (that page 404'd, say), the surviving
images keep their REAL page numbers — position 3 in the list can legitimately
be page 4. Numbering by position would silently shift every later page's
CropRegion onto the wrong image; nothing downstream would report an error,
because a CropRegion pointing at the wrong photograph is not itself invalid.

    ocr.py [--tiled] --manifest <manifest.json>
        manifest.json: [{"pageNumber": 4, "source": "/tmp/.../page-4.jpg"}, ...]

A bare positional-args form is kept ONLY for ad-hoc manual runs from a
terminal ("ocr.py page1.jpg page2.jpg"), numbering by argv position exactly as
before — production (live-sources.ts) never uses it.
"""

import io
import json
import sys
import urllib.request

# Overlap between strips so a line sitting on a seam is still read whole.
# Also the source of duplicate tokens, which the caller must dedupe.
STRIP_OVERLAP_PX = 80
DEFAULT_ROWS = 3
DEFAULT_SCALE = 2.0

USER_AGENT = "basketch/1.0 (+https://basketch.vercel.app; weekly price comparison)"


def load_image(source):
    from PIL import Image

    if source.startswith("http"):
        req = urllib.request.Request(source, headers={"User-Agent": USER_AGENT})
        data = urllib.request.urlopen(req, timeout=60).read()
        return Image.open(io.BytesIO(data)).convert("RGB")
    return Image.open(source).convert("RGB")


def ocr_native(ocr, img):
    import numpy as np

    result, _ = ocr(np.array(img))
    return [{"text": text, "box": [[float(x), float(y)] for x, y in box]} for box, text, _ in (result or [])]


def strip_box_to_page(box, scale, strip_top):
    """Map a box from UPSCALED STRIP coordinates back to NATIVE PAGE coordinates.

    Pure, and separated out because it is the one piece of this file that is
    silently catastrophic when wrong: every CropRegion would point at the wrong
    part of the page and the frontend would crop a neighbouring product's
    photograph. Nothing downstream would report an error.
    """
    return [[float(x) / scale, float(y) / scale + strip_top] for x, y in box]


def ocr_tiled(ocr, img, rows=DEFAULT_ROWS, scale=DEFAULT_SCALE):
    """Upscale strip by strip. Boxes are mapped back to NATIVE page coordinates.

    Without that mapping every CropRegion would point at the wrong part of the
    page, and the frontend would crop a neighbouring product's photograph.
    """
    import numpy as np
    from PIL import Image

    width, height = img.size
    items = []

    for i in range(rows):
        top = max(0, i * height // rows - STRIP_OVERLAP_PX)
        bottom = min(height, (i + 1) * height // rows + STRIP_OVERLAP_PX)
        strip = img.crop((0, top, width, bottom))
        sw, sh = strip.size
        strip = strip.resize((int(sw * scale), int(sh * scale)), Image.LANCZOS)

        result, _ = ocr(np.array(strip))
        for box, text, _conf in (result or []):
            items.append({"text": text, "box": strip_box_to_page(box, scale, top)})

    return items


def build_manifest(argv):
    """Returns [(page_number, source), ...] from argv.

    `--manifest PATH` reads a JSON file: [{"pageNumber": int, "source": str},
    ...] and returns exactly those (page_number, source) pairs, in file order.
    This is the ONLY form live-sources.ts uses, because it is the only form
    that survives a gap (a page the caller could not download).

    Without `--manifest`, sources are taken as bare positional args and
    numbered by ARGV POSITION — kept for ad-hoc terminal use only. Production
    never takes this path: numbering by position is exactly the bug a skipped
    page turns into a silently wrong CropRegion.
    """
    if "--manifest" in argv:
        path = argv[argv.index("--manifest") + 1]
        with open(path, encoding="utf-8") as f:
            entries = json.load(f)
        return [(int(e["pageNumber"]), e["source"]) for e in entries]
    sources = [a for a in argv if not a.startswith("--")]
    return list(enumerate(sources, start=1))


def process_entries(entries, ocr, tiled, load_image_fn=load_image):
    """Yields one result dict per (page_number, source) entry.

    Pure aside from the injected `ocr` and `load_image_fn` — this is what lets
    the page-numbering contract be tested without rapidocr-onnxruntime or a
    real image installed (see test_ocr.py).

    One bad page must not lose the flyer: an exception for one entry yields an
    {"error": ...} record for THAT page number and moves on.
    """
    for page_number, source in entries:
        try:
            img = load_image_fn(source)
            items = ocr_tiled(ocr, img) if tiled else ocr_native(ocr, img)
            # width/height are always NATIVE, whichever path ran, so downstream
            # CropRegion fractions are computed against the image the browser
            # will actually fetch.
            yield {"pageNumber": page_number, "width": img.size[0], "height": img.size[1], "items": items}
        except Exception as exc:  # noqa: BLE001 - one bad page must not lose the flyer
            yield {"pageNumber": page_number, "error": str(exc)}


def main():
    argv = sys.argv[1:]
    tiled = "--tiled" in argv
    entries = build_manifest(argv)
    if not entries:
        print("usage: ocr.py [--tiled] --manifest <manifest.json> | <image-or-url> [...]", file=sys.stderr)
        return 2

    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        print(
            json.dumps({"error": "rapidocr-onnxruntime not installed. pip install rapidocr-onnxruntime pillow numpy"}),
            file=sys.stderr,
        )
        return 3

    ocr = RapidOCR()

    for result in process_entries(entries, ocr, tiled):
        stream = sys.stderr if "error" in result else sys.stdout
        print(json.dumps(result), file=stream)

    return 0


if __name__ == "__main__":
    sys.exit(main())
