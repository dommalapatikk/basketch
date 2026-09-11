"""Tests for the Migros OCR coordinate mapping.

Run: python3 -m pytest collection/infrastructure/migros/test_ocr.py

The OCR model itself is not tested here — it is a third-party model and its
accuracy is measured against the benchmark, not asserted in a unit test. What IS
tested is the coordinate arithmetic, because a wrong mapping is silent: every
CropRegion points at the wrong part of the page, the visitor sees a neighbouring
product's photograph, and nothing anywhere reports an error.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ocr import DEFAULT_ROWS, STRIP_OVERLAP_PX, strip_box_to_page  # noqa: E402


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
