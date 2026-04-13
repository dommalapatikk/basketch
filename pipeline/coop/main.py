# Entry point for the Coop scraper pipeline.
# Calls fetch_coop_deals() and writes JSON to stdout (or file path from args).
# Exit code 0 on success (even if 0 deals), non-zero only on catastrophic failure.

import json
import sys

from fetch import fetch_coop_deals


def main() -> int:
    """Run the Coop scraper and output JSON.

    Usage:
        python main.py              # writes JSON to stdout
        python main.py output.json  # writes JSON to file
    """
    try:
        deals = fetch_coop_deals()

        output = json.dumps(deals, indent=2, ensure_ascii=False)

        if len(sys.argv) > 1:
            output_path = sys.argv[1]
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(output)
            print(
                f"[coop] [INFO] Wrote {len(deals)} deals to {output_path}",
                file=sys.stderr,
            )
        else:
            sys.stdout.write(output)
            sys.stdout.write("\n")
            print(
                f"[coop] [INFO] Output {len(deals)} deals to stdout",
                file=sys.stderr,
            )

        return 0

    except Exception as e:
        print(f"[coop] [FATAL] Catastrophic failure: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
