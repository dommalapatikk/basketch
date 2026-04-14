# Fetches store promotions from aktionis.ch and outputs normalized UnifiedDeal dicts as JSON.

import logging
import sys

import requests
from bs4 import BeautifulSoup

from normalize import normalize_aktionis_deal, parse_deal_card

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)
logger = logging.getLogger(__name__)

MAX_PAGES = 20
REQUEST_TIMEOUT = 15
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def fetch_page(page_num: int, base_url: str) -> list[dict]:
    """Fetch a single page of store deals from aktionis.ch. Returns raw card dicts."""
    url = f"{base_url}/{page_num}"
    store_slug = base_url.rstrip("/").rsplit("/", 1)[-1]
    try:
        response = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
        )
        if response.status_code != 200:
            logger.error(
                "[%s] [ERROR] Non-200 response from %s (status=%d)",
                store_slug,
                url,
                response.status_code,
            )
            return []

        soup = BeautifulSoup(response.text, "lxml")
        cards = soup.select("div.card.dealtype-deal")

        if not cards:
            return []

        results = []
        for card in cards:
            raw = parse_deal_card(card)
            if raw is not None:
                results.append(raw)

        return results

    except requests.RequestException as e:
        logger.error("[%s] [ERROR] Request failed for %s: %s", store_slug, url, e)
        return []
    except Exception as e:
        logger.error("[%s] [ERROR] Unexpected error fetching %s: %s", store_slug, url, e)
        return []


def fetch_store_deals(
    store_slug: str, store_name: str, max_pages: int = MAX_PAGES
) -> list[dict]:
    """Fetch all deals for a store from aktionis.ch with pagination.

    Args:
        store_slug: The URL slug used on aktionis.ch (e.g. 'coop', 'lidl', 'aldi-suisse').
        store_name: The internal Store type value (e.g. 'coop', 'lidl', 'aldi').
        max_pages: Maximum number of pages to fetch.

    Returns list of dicts matching UnifiedDeal shape (camelCase keys).
    Never raises exceptions -- catches and logs errors, returns empty list.
    """
    base_url = f"https://aktionis.ch/vendors/{store_slug}"
    all_deals: list[dict] = []

    try:
        for page_num in range(1, max_pages + 1):
            logger.info("[%s] [INFO] Fetching page %d", store_slug, page_num)
            raw_cards = fetch_page(page_num, base_url)

            if not raw_cards:
                logger.info(
                    "[%s] [INFO] No products on page %d — stopping pagination",
                    store_slug,
                    page_num,
                )
                break

            page_deals = []
            for raw in raw_cards:
                deal = normalize_aktionis_deal(raw, store_name)
                if deal is not None:
                    page_deals.append(deal)

            all_deals.extend(page_deals)
            logger.info(
                "[%s] [INFO] Page %d: %d cards found, %d deals normalized",
                store_slug,
                page_num,
                len(raw_cards),
                len(page_deals),
            )

        logger.info("[%s] [INFO] Total deals fetched: %d", store_slug, len(all_deals))

    except Exception as e:
        logger.error("[%s] [ERROR] Pipeline failed: %s", store_slug, e)
        return []

    return all_deals


def fetch_coop_deals(max_pages: int = MAX_PAGES) -> list[dict]:
    """Deprecated alias for fetch_store_deals('coop', 'coop'). Use fetch_store_deals instead."""
    return fetch_store_deals("coop", "coop", max_pages)


if __name__ == "__main__":
    # Prefer main.py as the entry point. This block is for quick standalone testing.
    from main import main

    sys.exit(main())
