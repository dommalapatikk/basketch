# Tests for Coop scraper: normalization, HTML parsing, HTTP mocking, and edge cases.

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import requests
from bs4 import BeautifulSoup

from fetch import fetch_coop_deals, fetch_page
from normalize import (
    calculate_discount_percent,
    normalize_coop_deal,
    normalize_product_name,
    parse_date_range,
    parse_deal_card,
    parse_discount_text,
    parse_price,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


# ── Product name normalization ──────────────────────────────────────


class TestNormalizeProductName:
    def test_lowercase(self) -> None:
        assert normalize_product_name("Coca-Cola Zero") == "coca-cola zero"

    def test_collapse_whitespace(self) -> None:
        assert normalize_product_name("Peroni  Bier   Red") == "peroni bier red"

    def test_strip_whitespace(self) -> None:
        assert normalize_product_name("  Milch  ") == "milch"

    def test_quantity_pattern(self) -> None:
        assert normalize_product_name("Peroni Bier Red 24 x 33 cl") == "peroni bier red 24x33cl"

    def test_unit_no_space(self) -> None:
        assert normalize_product_name("Evian 6 x 1.5 L") == "evian 6x1.5l"

    def test_multiple_units(self) -> None:
        assert normalize_product_name("Butter 200 g") == "butter 200g"

    def test_kg_unit(self) -> None:
        assert normalize_product_name("Kartoffeln 2 kg") == "kartoffeln 2kg"

    def test_already_normalized(self) -> None:
        assert normalize_product_name("milch 1l") == "milch 1l"


# ── Price parsing ───────────────────────────────────────────────────


class TestParsePrice:
    def test_decimal_price(self) -> None:
        assert parse_price("79.95") == 79.95

    def test_whole_price_dash(self) -> None:
        assert parse_price("179.–") == 179.0

    def test_whole_price_hyphen(self) -> None:
        assert parse_price("179.-") == 179.0

    def test_none_input(self) -> None:
        assert parse_price(None) is None

    def test_empty_string(self) -> None:
        assert parse_price("") is None

    def test_whitespace(self) -> None:
        assert parse_price("  42.–  ") == 42.0


# ── Discount parsing ───────────────────────────────────────────────


class TestParseDiscountText:
    def test_percent(self) -> None:
        assert parse_discount_text("55%") == 55

    def test_with_spaces(self) -> None:
        assert parse_discount_text(" 30 % ") == 30

    def test_none(self) -> None:
        assert parse_discount_text(None) is None

    def test_no_number(self) -> None:
        assert parse_discount_text("sale") is None


# ── Date parsing ────────────────────────────────────────────────────


class TestParseDateRange:
    def test_valid_range(self) -> None:
        valid_from, valid_to = parse_date_range("26.03.2026 - 15.04.2026")
        assert valid_from == "2026-03-26"
        assert valid_to == "2026-04-15"

    def test_none_input(self) -> None:
        assert parse_date_range(None) == (None, None)

    def test_invalid_format(self) -> None:
        assert parse_date_range("March 2026") == (None, None)


# ── Discount calculation ────────────────────────────────────────────


class TestCalculateDiscountPercent:
    def test_valid_discount(self) -> None:
        assert calculate_discount_percent(100.0, 75.0) == 25

    def test_50_percent(self) -> None:
        assert calculate_discount_percent(200.0, 100.0) == 50

    def test_rounding(self) -> None:
        # 179 -> 79.95 = 55.33...% -> rounds to 55
        assert calculate_discount_percent(179.0, 79.95) == 55

    def test_null_original(self) -> None:
        assert calculate_discount_percent(None, 10.0) is None

    def test_null_sale(self) -> None:
        assert calculate_discount_percent(10.0, None) is None

    def test_zero_original(self) -> None:
        assert calculate_discount_percent(0.0, 10.0) is None

    def test_sale_greater_than_original(self) -> None:
        assert calculate_discount_percent(10.0, 15.0) is None

    def test_equal_prices(self) -> None:
        assert calculate_discount_percent(10.0, 10.0) is None


# ── HTML card parsing (fixture-based) ──────────────────────────────


class TestParseDealCard:
    @pytest.fixture()
    def soup(self) -> BeautifulSoup:
        html_path = FIXTURES_DIR / "coop-page-1.html"
        return BeautifulSoup(html_path.read_text(), "lxml")

    @pytest.fixture()
    def cards(self, soup: BeautifulSoup) -> list:
        return soup.select("div.card.dealtype-deal")

    def test_cards_found(self, cards: list) -> None:
        assert len(cards) > 0, "Fixture should contain at least one deal card"

    def test_first_card_parsed(self, cards: list) -> None:
        result = parse_deal_card(cards[0])
        assert result is not None
        assert result["name"] == "Satrap Airfryer Leggero Tower 3.5+6.5l"
        assert result["sale_price"] == 79.95
        assert result["original_price"] == 179.0
        assert result["discount_percent"] == 55
        assert result["href"] == "/deals/satrap-airfryer-leggero-tower-35-65l"
        assert result["image_url"] is not None
        assert result["date_text"] is not None

    def test_all_cards_parseable(self, cards: list) -> None:
        """Every card in the fixture should parse without errors."""
        parsed = [parse_deal_card(c) for c in cards]
        successful = [p for p in parsed if p is not None]
        assert len(successful) > 0
        # Allow some failures but most should parse
        assert len(successful) >= len(cards) * 0.8

    def test_missing_h3_returns_none(self) -> None:
        """A card without an h3 should return None."""
        html = '<div class="card dealtype-deal"><div class="card-wrapper"></div></div>'
        soup = BeautifulSoup(html, "lxml")
        card = soup.select_one("div.card")
        assert parse_deal_card(card) is None

    def test_missing_price_returns_none(self) -> None:
        """A card with a name but no sale price should return None."""
        html = """
        <div class="card dealtype-deal">
          <div class="card-wrapper">
            <a href="/deals/test">
              <div class="card-inner">
                <div class="card-content">
                  <h3 class="card-title">Test Product</h3>
                </div>
              </div>
            </a>
          </div>
        </div>
        """
        soup = BeautifulSoup(html, "lxml")
        card = soup.select_one("div.card")
        assert parse_deal_card(card) is None


# ── Full normalization pipeline ─────────────────────────────────────


class TestNormalizeCoopDeal:
    def test_valid_deal(self) -> None:
        raw = {
            "name": "Peroni Bier Red 24 x 33 cl",
            "sale_price": 19.95,
            "original_price": 42.0,
            "discount_percent": 52,
            "date_text": "10.04.2026 - 15.04.2026",
            "href": "/deals/peroni-bier-red-24x33cl-43",
            "image_url": "https://storage.cpstatic.ch/img.webp",
        }
        result = normalize_coop_deal(raw)
        assert result is not None
        assert result["store"] == "coop"
        assert result["productName"] == "peroni bier red 24x33cl"
        assert result["originalPrice"] == 42.0
        assert result["salePrice"] == 19.95
        assert result["discountPercent"] == 52
        assert result["validFrom"] == "2026-04-10"
        assert result["validTo"] == "2026-04-15"
        assert result["sourceUrl"] == "https://aktionis.ch/deals/peroni-bier-red-24x33cl-43"
        assert result["imageUrl"] == "https://storage.cpstatic.ch/img.webp"
        assert result["sourceCategory"] is None

    def test_missing_name(self) -> None:
        assert normalize_coop_deal({"sale_price": 10.0}) is None

    def test_missing_sale_price(self) -> None:
        assert normalize_coop_deal({"name": "Test", "sale_price": None}) is None

    def test_zero_sale_price(self) -> None:
        assert normalize_coop_deal({"name": "Test", "sale_price": 0.0}) is None

    def test_no_original_price_calculates_no_discount(self) -> None:
        raw = {
            "name": "Test Product",
            "sale_price": 5.0,
            "original_price": None,
            "discount_percent": None,
            "date_text": None,
            "href": None,
            "image_url": None,
        }
        result = normalize_coop_deal(raw)
        assert result is not None
        assert result["discountPercent"] is None
        assert result["originalPrice"] is None

    def test_camel_case_keys(self) -> None:
        """Output keys must be camelCase to match UnifiedDeal TypeScript interface."""
        raw = {
            "name": "Test",
            "sale_price": 10.0,
            "original_price": 20.0,
            "discount_percent": 50,
            "date_text": "01.01.2026 - 07.01.2026",
            "href": "/deals/test",
            "image_url": "https://example.com/img.webp",
        }
        result = normalize_coop_deal(raw)
        assert result is not None
        expected_keys = {
            "store",
            "productName",
            "originalPrice",
            "salePrice",
            "discountPercent",
            "validFrom",
            "validTo",
            "imageUrl",
            "sourceCategory",
            "sourceUrl",
        }
        assert set(result.keys()) == expected_keys


# ── End-to-end fixture test ─────────────────────────────────────────


class TestEndToEnd:
    def test_fixture_produces_deals(self) -> None:
        """Parse the full fixture HTML and produce normalized deals."""
        html_path = FIXTURES_DIR / "coop-page-1.html"
        soup = BeautifulSoup(html_path.read_text(), "lxml")
        cards = soup.select("div.card.dealtype-deal")

        deals = []
        for card in cards:
            raw = parse_deal_card(card)
            if raw:
                deal = normalize_coop_deal(raw)
                if deal:
                    deals.append(deal)

        assert len(deals) > 10, f"Expected many deals from fixture, got {len(deals)}"

        # Verify all deals have required fields
        for deal in deals:
            assert deal["store"] == "coop"
            assert isinstance(deal["productName"], str)
            assert len(deal["productName"]) > 0
            assert isinstance(deal["salePrice"], float)
            assert deal["salePrice"] > 0


# ── HTTP layer tests (mocked) ─────────────────────────────────────


class TestFetchPage:
    def test_happy_path_returns_deals(self) -> None:
        """Mock a successful HTTP response with fixture HTML."""
        html_path = FIXTURES_DIR / "coop-page-1.html"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = html_path.read_text()

        with patch("fetch.requests.get", return_value=mock_response) as mock_get:
            result = fetch_page(1)
            mock_get.assert_called_once()
            assert len(result) > 0
            assert result[0]["name"] is not None

    def test_network_error_returns_empty_list(self) -> None:
        """A network failure should return empty list, not raise."""
        with patch(
            "fetch.requests.get",
            side_effect=requests.ConnectionError("DNS failed"),
        ):
            result = fetch_page(1)
            assert result == []

    def test_timeout_returns_empty_list(self) -> None:
        """A timeout should return empty list, not raise."""
        with patch(
            "fetch.requests.get",
            side_effect=requests.Timeout("Request timed out"),
        ):
            result = fetch_page(1)
            assert result == []

    def test_non_200_returns_empty_list(self) -> None:
        """A 404 or 500 response should return empty list."""
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("fetch.requests.get", return_value=mock_response):
            result = fetch_page(1)
            assert result == []

    def test_empty_html_returns_empty_list(self) -> None:
        """HTML with no deal cards should return empty list."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "<html><body><p>No deals today</p></body></html>"

        with patch("fetch.requests.get", return_value=mock_response):
            result = fetch_page(1)
            assert result == []


class TestFetchCoopDeals:
    def test_happy_path_paginates(self) -> None:
        """fetch_coop_deals should paginate until empty page."""
        html_path = FIXTURES_DIR / "coop-page-1.html"
        fixture_html = html_path.read_text()

        call_count = 0

        def mock_get(*args: object, **kwargs: object) -> MagicMock:
            nonlocal call_count
            call_count += 1
            resp = MagicMock()
            resp.status_code = 200
            # Return deals on page 1, empty on page 2
            if call_count == 1:
                resp.text = fixture_html
            else:
                resp.text = "<html><body></body></html>"
            return resp

        with patch("fetch.requests.get", side_effect=mock_get):
            deals = fetch_coop_deals(max_pages=5)
            assert len(deals) > 0
            # Should have stopped after page 2 (empty)
            assert call_count == 2

    def test_network_failure_returns_empty_list(self) -> None:
        """Total network failure should return empty list, not raise."""
        with patch(
            "fetch.requests.get",
            side_effect=requests.ConnectionError("Network down"),
        ):
            deals = fetch_coop_deals(max_pages=3)
            assert deals == []

    def test_all_deals_have_camel_case_keys(self) -> None:
        """Every deal from fetch_coop_deals must use camelCase keys."""
        html_path = FIXTURES_DIR / "coop-page-1.html"
        fixture_html = html_path.read_text()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = fixture_html

        empty_response = MagicMock()
        empty_response.status_code = 200
        empty_response.text = "<html><body></body></html>"

        with patch(
            "fetch.requests.get", side_effect=[mock_response, empty_response]
        ):
            deals = fetch_coop_deals(max_pages=5)
            assert len(deals) > 0

            expected_keys = {
                "store",
                "productName",
                "originalPrice",
                "salePrice",
                "discountPercent",
                "validFrom",
                "validTo",
                "imageUrl",
                "sourceCategory",
                "sourceUrl",
            }
            for deal in deals:
                assert set(deal.keys()) == expected_keys

    def test_zero_deals_is_success(self) -> None:
        """0 deals should return empty list (not an error)."""
        empty_response = MagicMock()
        empty_response.status_code = 200
        empty_response.text = "<html><body></body></html>"

        with patch("fetch.requests.get", return_value=empty_response):
            deals = fetch_coop_deals(max_pages=1)
            assert deals == []


# ── Main entry point tests ─────────────────────────────────────────


class TestMain:
    def test_main_stdout(self) -> None:
        """main() should write JSON to stdout and return 0."""
        from main import main

        empty_response = MagicMock()
        empty_response.status_code = 200
        empty_response.text = "<html><body></body></html>"

        with (
            patch("fetch.requests.get", return_value=empty_response),
            patch("sys.argv", ["main.py"]),
        ):
            exit_code = main()
            assert exit_code == 0

    def test_main_file_output(self, tmp_path: Path) -> None:
        """main() should write JSON to a file when path is given."""
        import json

        from main import main

        empty_response = MagicMock()
        empty_response.status_code = 200
        empty_response.text = "<html><body></body></html>"

        output_file = tmp_path / "deals.json"

        with (
            patch("fetch.requests.get", return_value=empty_response),
            patch("sys.argv", ["main.py", str(output_file)]),
        ):
            exit_code = main()
            assert exit_code == 0
            assert output_file.exists()
            data = json.loads(output_file.read_text())
            assert isinstance(data, list)
