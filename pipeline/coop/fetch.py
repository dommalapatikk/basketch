# Fetches current Coop promotions from aktionis.ch and outputs normalized UnifiedDeal dicts as JSON.

import logging
import sys

import requests
from bs4 import BeautifulSoup

from normalize import normalize_coop_deal, parse_deal_card

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)
logger = logging.getLogger(__name__)

BASE_URL = "https://aktionis.ch/vendors/coop"
MAX_PAGES = 20
REQUEST_TIMEOUT = 15
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def fetch_page(page_num: int) -> list[dict]:
    """Fetch a single page of Coop deals from aktionis.ch. Returns raw card dicts."""
    url = f"{BASE_URL}/{page_num}"
    try:
        response = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
        )
        if response.status_code != 200:
            logger.error(
                "[coop] [ERROR] Non-200 response from %s (status=%d)",
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
        logger.error("[coop] [ERROR] Request failed for %s: %s", url, e)
        return []
    except Exception as e:
        logger.error("[coop] [ERROR] Unexpected error fetching %s: %s", url, e)
        return []


def fetch_coop_deals(max_pages: int = MAX_PAGES) -> list[dict]:
    """Fetch all Coop deals from aktionis.ch with pagination.

    Returns list of dicts matching UnifiedDeal shape (camelCase keys).
    Never raises exceptions -- catches and logs errors, returns empty list.
    """
    all_deals: list[dict] = []

    try:
        for page_num in range(1, max_pages + 1):
            logger.info("[coop] [INFO] Fetching page %d", page_num)
            raw_cards = fetch_page(page_num)

            if not raw_cards:
                logger.info(
                    "[coop] [INFO] No products on page %d — stopping pagination",
                    page_num,
                )
                break

            page_deals = []
            for raw in raw_cards:
                deal = normalize_coop_deal(raw)
                if deal is not None:
                    page_deals.append(deal)

            all_deals.extend(page_deals)
            logger.info(
                "[coop] [INFO] Page %d: %d cards found, %d deals normalized",
                page_num,
                len(raw_cards),
                len(page_deals),
            )

        logger.info("[coop] [INFO] Total Coop deals fetched: %d", len(all_deals))

    except Exception as e:
        logger.error("[coop] [ERROR] Pipeline failed: %s", e)
        return []

    return all_deals


if __name__ == "__main__":
    # Prefer main.py as the entry point. This block is for quick standalone testing.
    from main import main

    sys.exit(main())
