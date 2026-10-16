"""Load the demo seed: `python -m app.seed [--force]` (run from backend/)."""
from __future__ import annotations

import argparse
import asyncio
import logging

from app.seed import load


def main() -> None:
    parser = argparse.ArgumentParser(description="Load SkillCoach demo documents, personas and scenarios.")
    parser.add_argument("--force", action="store_true", help="re-ingest documents that already exist")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    counts = asyncio.run(load(force=args.force))
    print(f"Seeded {counts['documents']} documents, {counts['personas']} personas, "
          f"{counts['scenarios']} scenarios.")


if __name__ == "__main__":
    main()
