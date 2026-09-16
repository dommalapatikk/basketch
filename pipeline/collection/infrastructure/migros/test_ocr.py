"""Tests for the Migros OCR coordinate mapping.

Run: python3 -m pytest collection/infrastructure/migros/test_ocr.py

The OCR model itself is not tested here — it is a third-party model and its
accuracy is measured against the benchmark, not asserted in a unit test. What IS
tested is the coordinate arithmetic, because a wrong mapping is silent: every
CropRegion points at the wrong part of the page, the visitor sees a neighbouring
product's photograph, and nothing anywhere reports an error.
"""

import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ocr import (  # noqa: E402
    DEFAULT_ROWS,
    STRIP_OVERLAP_PX,
    build_manifest,
    process_entries,
    strip_box_to_page,
)


def test_identity_at_scale_one_top_zero():
    box = [[10, 20], [110, 20], [110, 60], [10, 60]]
    assert strip_box_to_page(box, 1.0, 0) == [[10.0, 20.0], [110.0, 20.0], [110.0, 60.0], [10.0, 60.0]]


def test_halves_coordinates_at_2x():
    # A box found at (200, 400) in a 2x strip sits at (100, 200) on the page.
    assert strip_box_to_page([[200, 400]], 2.0, 0) == [[100.0, 200.0]]


def test_adds_the_strip_offset_after_scaling_not_before():
    # Order matters: (400/2)+1000 = 1200, but (400+1000)/2 = 700. Getting this
    # backwards puts every crop in the wrong half of the page.
    assert strip_box_to_page([[0, 400]], 2.0, 1000) == [[0.0, 1200.0]]


def test_x_is_never_offset():
    # Strips are full-width horizontal bands, so only y shifts.
    assert strip_box_to_page([[500, 0]], 2.0, 1000)[0][0] == 250.0


def test_round_trips_a_known_page_coordinate():
    # Page 5 is 2199x2997. A product at native y=2100 falls in strip 3 of 3.
    page_h, rows, scale = 2997, 3, 2.0
    strip_index = 2
    top = max(0, strip_index * page_h // rows - STRIP_OVERLAP_PX)
    native_y = 2100
    y_in_strip = (native_y - top) * scale
    mapped = strip_box_to_page([[0, y_in_strip]], scale, top)
    assert abs(mapped[0][1] - native_y) < 0.001


def test_every_strip_maps_within_page_bounds():
    page_h, rows, scale = 2997, DEFAULT_ROWS, 2.0
    for i in range(rows):
        top = max(0, i * page_h // rows - STRIP_OVERLAP_PX)
        bottom = min(page_h, (i + 1) * page_h // rows + STRIP_OVERLAP_PX)
        strip_h = (bottom - top) * scale
        # A box at the very bottom of this strip must not exceed the page.
        mapped = strip_box_to_page([[0, strip_h]], scale, top)
        assert mapped[0][1] <= page_h + 0.001, f"strip {i} maps past the page bottom"


def test_strips_overlap_so_a_seam_line_is_read_whole():
    page_h, rows = 2997, DEFAULT_ROWS
    for i in range(rows - 1):
        this_bottom = min(page_h, (i + 1) * page_h // rows + STRIP_OVERLAP_PX)
        next_top = max(0, (i + 1) * page_h // rows - STRIP_OVERLAP_PX)
        assert this_bottom > next_top, "strips must overlap or a seam line is lost"


# ---------------------------------------------------------------------------
# build_manifest / process_entries — page numbers are the FLYER's page
# numbers, never argv position (WP-C1, 2026-09-15).
#
# THE DEFECT THIS GUARDS: production numbered pages by their position in the
# argv list. fetchFlyerImages skips a page that failed to download (23 of 24
# pages is still a usable flyer), so the surviving images are e.g. pages
# [1, 2, 4, 5, ...] — position 3 in that list is REALLY page 4. Numbering by
# position silently relabels it "page 3", and every CropRegion on it points at
# the wrong photograph in the visitor's browser. Nothing downstream reports an
# error, because a CropRegion pointing at the wrong image is not itself an
# invalid CropRegion.
# ---------------------------------------------------------------------------


def test_manifest_page_numbers_survive_a_skipped_page(tmp_path):
    # Pages 2 and 3 were not downloaded upstream — only 1, 4 and 5 arrived.
    manifest = [
        {"pageNumber": 1, "source": "/tmp/page-1.jpg"},
        {"pageNumber": 4, "source": "/tmp/page-4.jpg"},
        {"pageNumber": 5, "source": "/tmp/page-5.jpg"},
    ]
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    entries = build_manifest(["--manifest", str(manifest_path)])

    # NOT [(1, ...), (2, ...), (3, ...)] — argv-position numbering, the bug.
    assert entries == [
        (1, "/tmp/page-1.jpg"),
        (4, "/tmp/page-4.jpg"),
        (5, "/tmp/page-5.jpg"),
    ]


def test_manifest_preserves_file_order_even_when_page_numbers_are_out_of_order(tmp_path):
    manifest = [{"pageNumber": 9, "source": "b"}, {"pageNumber": 2, "source": "a"}]
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    entries = build_manifest(["--manifest", str(manifest_path)])

    assert entries == [(9, "b"), (2, "a")]


def test_positional_fallback_numbers_by_argv_position_ad_hoc_use_only():
    # Documented, ad-hoc-only behaviour: no manifest means "trust argv order".
    # Production (live-sources.ts) never takes this path.
    entries = build_manifest(["--tiled", "page-a.jpg", "page-b.jpg"])
    assert entries == [(1, "page-a.jpg"), (2, "page-b.jpg")]


class _FakeImage:
    """Stands in for a PIL Image — only `.size` is read by process_entries."""

    def __init__(self, size):
        self.size = size


def test_process_entries_emits_the_manifest_page_number_not_a_position_index():
    entries = [(1, "a"), (4, "b"), (5, "c")]

    results = list(
        process_entries(
            entries,
            ocr=lambda arr: ([], None),
            tiled=False,
            load_image_fn=lambda source: _FakeImage((2199, 2997)),
        )
    )

    # MUTATION this catches: reverting to `enumerate(entries, start=1)`
    # (or dropping the manifest page number and using the loop index) would
    # produce pageNumber 1, 2, 3 here instead of 1, 4, 5.
    assert [r["pageNumber"] for r in results] == [1, 4, 5]


def test_process_entries_keeps_the_manifest_page_number_even_when_that_page_errors():
    entries = [(1, "a"), (4, "boom")]

    def load_image_fn(source):
        if source == "boom":
            raise ValueError("truncated JPEG")
        return _FakeImage((2199, 2997))

    results = list(process_entries(entries, ocr=lambda arr: ([], None), tiled=False, load_image_fn=load_image_fn))

    assert results[0]["pageNumber"] == 1
    assert "error" not in results[0]
    assert results[1] == {"pageNumber": 4, "error": "truncated JPEG"}


def test_process_entries_never_touches_the_network_for_a_local_path(tmp_path, monkeypatch):
    """Calls the REAL `load_image` (the default, not a stub) with
    `urlopen` patched to raise. A stubbed `load_image_fn` records what
    string it received but proves nothing about whether the REAL function
    would have reached the network — this exercises the actual
    `source.startswith("http")` branch in ocr.py's own `load_image`, so a
    regression here fails loudly instead of passing vacuously.
    """
    from PIL import Image

    image_path = tmp_path / "page-1.jpg"
    Image.new("RGB", (4, 4), color="white").save(image_path)

    def urlopen_must_not_be_called(*args, **kwargs):
        raise AssertionError("load_image reached the network for a local path")

    monkeypatch.setattr(urllib.request, "urlopen", urlopen_must_not_be_called)

    results = list(
        process_entries(
            [(1, str(image_path))],
            ocr=lambda arr: ([], None),
            tiled=False,
            # load_image_fn omitted — this is ocr.py's REAL load_image.
        )
    )

    assert results == [{"pageNumber": 1, "width": 4, "height": 4, "items": []}]
