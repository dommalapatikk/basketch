# Normalizes raw deal data scraped from aktionis.ch to UnifiedDeal shape (camelCase).

import re
import logging
from datetime import datetime

from bs4 import Tag

logger = logging.getLogger(__name__)

SITE_ROOT = "https://aktionis.ch"


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


def parse_date_from_description(text: str) -> tuple[str | None, str | None]:
    """Parse validity dates from card description text.

    Handles formats like:
      "Angebot gilt nur vom 16.4. bis 22.4.2026"
      "Angebot gilt nur vom 9.4. bis 22.4.2026"
      "vom 16.04. bis 22.04.2026"
    """
    # Pattern: "vom D.M. bis D.M.YYYY" (short dates without year on the from-date)
    match = re.search(
        r"vom\s+(\d{1,2})\.(\d{1,2})\.\s*bis\s+(\d{1,2})\.(\d{1,2})\.(\d{4})",
        text,
    )
    if match:
        from_day, from_month = int(match.group(1)), int(match.group(2))
        to_day, to_month, to_year = int(match.group(3)), int(match.group(4)), int(match.group(5))
        # Infer from-year: same as to-year unless from-month > to-month (year boundary)
        from_year = to_year if from_month <= to_month else to_year - 1
        try:
            valid_from = datetime(from_year, from_month, from_day).strftime("%Y-%m-%d")
            valid_to = datetime(to_year, to_month, to_day).strftime("%Y-%m-%d")
            return valid_from, valid_to
        except ValueError:
            return None, None

    return None, None


def parse_quantity_from_description(text: str) -> dict | None:
    """Extract weight/volume quantity from card description text.

    Returns dict with keys: quantity (float), unit (str), display (str)
    Handles: "4 x 150 g", "10 x 200 ml", "3.6 Liter", "500 g", "2 x 400 g", "12 x 50 cl"
    """
    # Multi-pack: "4 x 150 g", "10 x 200 ml", "12 x 50 cl"
    multi_match = re.search(
        r"(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|liter|g|kg)\b",
        text,
        re.IGNORECASE,
    )
    if multi_match:
        count = int(multi_match.group(1))
        per_unit = float(multi_match.group(2).replace(",", "."))
        unit = multi_match.group(3).lower()
        if unit == "liter":
            unit = "l"
        display = f"{count} x {multi_match.group(2)} {multi_match.group(3)}"
        return {"quantity": count * per_unit, "unit": unit, "display": display}

    # Single: "3.6 Liter", "500 g", "250 ml"
    single_match = re.search(
        r"(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|liter|g|kg)\b",
        text,
        re.IGNORECASE,
    )
    if single_match:
        value = float(single_match.group(1).replace(",", "."))
        unit = single_match.group(2).lower()
        if unit == "liter":
            unit = "l"
        display = f"{single_match.group(1)} {single_match.group(2)}"
        return {"quantity": value, "unit": unit, "display": display}

    # Piece count: "60 Stück", "pro Stück"
    piece_match = re.search(r"(\d+)\s*(Stück|Stk)\b", text, re.IGNORECASE)
    if piece_match:
        count = int(piece_match.group(1))
        return {"quantity": count, "unit": "pcs", "display": f"{count} Stück"}

    return None


def parse_unit_price_from_description(text: str) -> dict | None:
    """Extract unit price from card description text.

    Returns dict with keys: amount (float), per_quantity (float), per_unit (str)
    Handles: "100 g = 1.17", "1 l = 6.81", "100 ml = 0.12", "100 ml = -.34"
    """
    match = re.search(
        r"(\d+)\s*(g|kg|ml|cl|l)\s*=\s*(-?\d*[.,]?\d+)",
        text,
        re.IGNORECASE,
    )
    if match:
        per_qty = float(match.group(1))
        per_unit = match.group(2).lower()
        price_str = match.group(3).replace(",", ".")
        # Handle "-.34" format (Swiss: means 0.34)
        if price_str.startswith("-.") or price_str.startswith("-,"):
            price_str = "0" + price_str[1:]
        try:
            amount = float(price_str)
            if amount < 0:
                amount = abs(amount)
            return {
                "amount": amount,
                "per_quantity": per_qty,
                "per_unit": per_unit,
            }
        except ValueError:
            return None
    return None


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

        # Description text (contains weight, unit price, dates)
        desc_el = card.select_one(".card-description")
        description = desc_el.get_text(strip=True) if desc_el else ""

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

        # Fallback: parse prices from description ("2.45 statt 4.95", "7.– statt 11.80")
        if sale_price is None and description:
            desc_price_match = re.search(
                r"(\d+(?:[.,]\d{2}|\.[\u2013–-]))\s+statt\s+(\d+(?:[.,]\d{2}|\.[\u2013–-]))",
                description,
            )
            if desc_price_match:
                sale_price = parse_price(desc_price_match.group(1))
                if original_price is None:
                    original_price = parse_price(desc_price_match.group(2))

        # We need at least a sale price
        if sale_price is None:
            logger.warning("[aktionis] [WARN] Missing sale price for: %s", name)
            return None

        # Date range — try .card-date first, then parse from description
        date_el = card.select_one(".card-date")
        date_text = date_el.get_text(strip=True) if date_el else None

        # Extract validity dates from description if .card-date not found
        valid_from_desc, valid_to_desc = None, None
        if description:
            valid_from_desc, valid_to_desc = parse_date_from_description(description)

        # Extract quantity/weight from description
        quantity_info = parse_quantity_from_description(description) if description else None

        # Extract unit price from description
        unit_price_info = parse_unit_price_from_description(description) if description else None

        # Product link
        link_el = card.select_one("a[href]")
        href = link_el.get("href") if link_el else None

        # Product image
        img_el = card.select_one(".card-image img")
        img_src = img_el.get("src") if img_el else None

        return {
            "name": name,
            "description": description,
            "sale_price": sale_price,
            "original_price": original_price,
            "discount_percent": discount_percent,
            "date_text": date_text,
            "valid_from_desc": valid_from_desc,
            "valid_to_desc": valid_to_desc,
            "quantity_info": quantity_info,
            "unit_price_info": unit_price_info,
            "href": href,
            "image_url": img_src,
        }
    except Exception as e:
        logger.error("[aktionis] [ERROR] Failed to parse deal card: %s", e)
        return None


def normalize_aktionis_deal(raw_data: dict, store_name: str) -> dict | None:
    """Map extracted card data to UnifiedDeal shape with camelCase keys.

    Args:
        raw_data: Raw card data extracted by parse_deal_card.
        store_name: Internal Store type value (e.g. 'coop', 'lidl', 'aldi').
    """
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

        # Dates: prefer .card-date, then description-extracted dates
        valid_from, valid_to = parse_date_range(raw_data.get("date_text"))
        if valid_from is None:
            valid_from = raw_data.get("valid_from_desc")
        if valid_to is None:
            valid_to = raw_data.get("valid_to_desc")
        if valid_from is None:
            valid_from = datetime.now().strftime("%Y-%m-%d")

        # Source URL
        href = raw_data.get("href")
        source_url = f"{SITE_ROOT}{href}" if href else None

        # Quantity metadata
        qty = raw_data.get("quantity_info")
        unit_price = raw_data.get("unit_price_info")

        deal = {
            "store": store_name,
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

        # Add enriched metadata fields
        if qty:
            deal["quantity"] = qty["quantity"]
            deal["quantityUnit"] = qty["unit"]
            deal["quantityDisplay"] = qty["display"]
        if unit_price:
            deal["unitPriceAmount"] = unit_price["amount"]
            deal["unitPricePerQty"] = unit_price["per_quantity"]
            deal["unitPriceUnit"] = unit_price["per_unit"]
        if raw_data.get("description"):
            deal["description"] = raw_data["description"]

        return deal
    except Exception as e:
        logger.error("[aktionis] [ERROR] Failed to normalize deal: %s", e)
        return None


def normalize_coop_deal(raw_data: dict) -> dict | None:
    """Deprecated alias for normalize_aktionis_deal(raw_data, 'coop'). Use normalize_aktionis_deal instead."""
    return normalize_aktionis_deal(raw_data, "coop")
