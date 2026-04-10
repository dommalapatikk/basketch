# Normalizes raw Coop deal data scraped from aktionis.ch to UnifiedDeal shape (camelCase).

import re
import logging
from datetime import datetime

from bs4 import Tag

logger = logging.getLogger(__name__)

BASE_URL = "https://aktionis.ch"


def normalize_product_name(raw: str) -> str:
    """Lowercase, collapse whitespace, standardize units (matches Migros logic)."""
    result = raw.lower().strip()
    result = re.sub(r"\s+", " ", result)
    # "6 x 1.5 L" -> "6x1.5l"
    result = re.sub(r"(\d+)\s*x\s*(\d)", r"\1x\2", result)
    # "1.5 L" -> "1.5l", "500 G" -> "500g"
    result = re.sub(r"(\d)\s*(ml|cl|dl|l|g|kg)\b", r"\1\2", result)
    return result


def parse_price(text: str | None) -> float | None:
    """Parse a Swiss price string like '79.95' or '179.–' to float."""
    if not text:
        return None
    cleaned = text.strip().replace("\u2013", "-").replace("–", "-")
    # Handle "179.–" or "179.-" format (whole CHF, no cents)
    cleaned = re.sub(r"\.\s*-+$", "", cleaned)
    # Remove any non-numeric chars except dot
    cleaned = re.sub(r"[^\d.]", "", cleaned)
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_discount_text(text: str | None) -> int | None:
    """Parse discount text like '55%' to integer 55."""
    if not text:
        return None
    match = re.search(r"(\d+)\s*%", text.strip())
    if match:
        return int(match.group(1))
    return None


def parse_date_range(text: str | None) -> tuple[str | None, str | None]:
    """Parse date range like '26.03.2026 - 15.04.2026' to ISO dates."""
    if not text:
        return None, None
    # Match DD.MM.YYYY - DD.MM.YYYY
    match = re.match(
        r"(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})",
        text.strip(),
    )
    if not match:
        return None, None
    try:
        valid_from = datetime.strptime(match.group(1), "%d.%m.%Y").strftime("%Y-%m-%d")
        valid_to = datetime.strptime(match.group(2), "%d.%m.%Y").strftime("%Y-%m-%d")
        return valid_from, valid_to
    except ValueError:
        return None, None


def calculate_discount_percent(
    original: float | None, sale: float | None
) -> int | None:
    """Calculate discount percentage from original and sale prices."""
    if (
        original is None
        or sale is None
        or original <= 0
        or sale <= 0
        or sale >= original
    ):
        return None
    return round(((original - sale) / original) * 100)


def parse_deal_card(card: Tag) -> dict | None:
    """Extract raw data from a single aktionis.ch product card HTML element."""
    try:
        # Product name
        h3 = card.select_one("h3.card-title")
        if not h3:
            return None
        name = h3.get_text(strip=True)
        if not name:
            return None

        # Prices
        price_new_el = card.select_one(".price-new")
        price_old_el = card.select_one(".price-old")
        discount_el = card.select_one(".price-discount")

        sale_price = parse_price(
            price_new_el.get_text(strip=True) if price_new_el else None
        )
        original_price = parse_price(
            price_old_el.get_text(strip=True) if price_old_el else None
        )
        discount_percent = parse_discount_text(
            discount_el.get_text(strip=True) if discount_el else None
        )

        # We need at least a sale price
        if sale_price is None:
            logger.warning("[coop] [WARN] Missing sale price for: %s", name)
            return None

        # Date range
        date_el = card.select_one(".card-date")
        date_text = date_el.get_text(strip=True) if date_el else None

        # Product link
        link_el = card.select_one("a[href]")
        href = link_el.get("href") if link_el else None

        # Product image
        img_el = card.select_one(".card-image img")
        img_src = img_el.get("src") if img_el else None

        return {
            "name": name,
            "sale_price": sale_price,
            "original_price": original_price,
            "discount_percent": discount_percent,
            "date_text": date_text,
            "href": href,
            "image_url": img_src,
        }
    except Exception as e:
        logger.error("[coop] [ERROR] Failed to parse deal card: %s", e)
        return None


def normalize_coop_deal(raw_data: dict) -> dict | None:
    """Map extracted card data to UnifiedDeal shape with camelCase keys."""
    try:
        name = raw_data.get("name")
        if not name:
            return None

        sale_price = raw_data.get("sale_price")
        if sale_price is None or sale_price <= 0:
            return None

        original_price = raw_data.get("original_price")
        if original_price is not None and original_price <= 0:
            original_price = None

        # Discount: prefer page-provided, then calculate
        discount_percent = raw_data.get("discount_percent")
        if discount_percent is None:
            discount_percent = calculate_discount_percent(original_price, sale_price)

        # Dates
        valid_from, valid_to = parse_date_range(raw_data.get("date_text"))
        if valid_from is None:
            valid_from = datetime.now().strftime("%Y-%m-%d")

        # Source URL
        href = raw_data.get("href")
        source_url = f"{BASE_URL}{href}" if href else None

        return {
            "store": "coop",
            "productName": normalize_product_name(name),
            "originalPrice": original_price,
            "salePrice": sale_price,
            "discountPercent": discount_percent,
            "validFrom": valid_from,
            "validTo": valid_to,
            "imageUrl": raw_data.get("image_url"),
            "sourceCategory": None,
            "sourceUrl": source_url,
        }
    except Exception as e:
        logger.error("[coop] [ERROR] Failed to normalize deal: %s", e)
        return None
