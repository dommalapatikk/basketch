# Entry point for the aktionis.ch scraper pipeline.
# Calls fetch_store_deals() and writes JSON to stdout (or file path from args).
# Exit code 0 on success (even if 0 deals), non-zero only on catastrophic failure.

import json
import sys

from fetch import fetch_store_deals


def main() -> int:
    """Run the aktionis.ch scraper for any store and output JSON.

    Usage:
        python main.py <store-slug> <store-name> [output.json]

    Args:
        store-slug: aktionis.ch URL slug (e.g. 'coop', 'lidl', 'aldi-suisse')
        store-name: internal store value (e.g. 'coop', 'lidl', 'aldi')
        output.json: optional path to write JSON output (default: stdout)

    Examples:
        python main.py aldi-suisse aldi aldi-deals.json
        python main.py coop coop coop-deals.json
        python main.py lidl lidl
    """
    try:
        if len(sys.argv) < 3:
            print(
                "[aktionis] [FATAL] Usage: python main.py <store-slug> <store-name> [output.json]",
                file=sys.stderr,
            )
            return 1

        store_slug = sys.argv[1]
        store_name = sys.argv[2]
        output_path = sys.argv[3] if len(sys.argv) > 3 else None

        deals = fetch_store_deals(store_slug, store_name)

        output = json.dumps(deals, indent=2, ensure_ascii=False)

        if output_path:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(output)
            print(
                f"[{store_slug}] [INFO] Wrote {len(deals)} deals to {output_path}",
                file=sys.stderr,
            )
        else:
            sys.stdout.write(output)
            sys.stdout.write("\n")
            print(
                f"[{store_slug}] [INFO] Output {len(deals)} deals to stdout",
                file=sys.stderr,
            )

        return 0

    except Exception as e:
        print(f"[aktionis] [FATAL] Catastrophic failure: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
