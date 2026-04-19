#!/usr/bin/env python3
"""
PRISM Autoresearch CLI — Direct measurement engine invocation.

Usage:
    python core/autoresearch_cli.py \
        --intent "Hindi JSON extraction for kirana inventory" \
        --pillar structured_output \
        --output demo_run_1.json

This runs the full autoresearch loop:
    5 candidates × 5 trials × 3 judges = 75 scored measurements per intent
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("prism.autoresearch")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="PRISM Autoresearch — Gauge R&R validated measurement engine",
    )
    parser.add_argument(
        "--intent", type=str, required=True,
        help="Builder intent (Voice of Customer)",
    )
    parser.add_argument(
        "--pillar", type=str, default=None,
        choices=["structured_output", "language_fidelity", "reasoning", "creative_generation"],
        help="Override pillar detection",
    )
    parser.add_argument(
        "--trials", type=int, default=5,
        help="Number of measurement trials (default: 5)",
    )
    parser.add_argument(
        "--lsl", type=float, default=70.0,
        help="Lower Specification Limit (default: 70)",
    )
    parser.add_argument(
        "--candidates", type=int, default=5,
        help="Max candidate models (default: 5)",
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Output JSON file path",
    )
    return parser.parse_args()


async def main():
    args = parse_args()

    from core.autoresearch import run_autoresearch

    logger.info("=" * 70)
    logger.info("PRISM AUTORESEARCH — Gauge R&R Validated Measurement Engine")
    logger.info("=" * 70)
    logger.info("Intent: %s", args.intent)
    logger.info("Pillar: %s", args.pillar or "auto-detect")
    logger.info("Trials: %d | LSL: %.1f | Max candidates: %d",
                args.trials, args.lsl, args.candidates)
    logger.info("Budget: 90s wall-clock, $0.50 cost cap")
    logger.info("-" * 70)

    start = time.perf_counter()

    result = await run_autoresearch(
        intent=args.intent,
        pillar=args.pillar,
        n_trials=args.trials,
        lsl=args.lsl,
        max_candidates=args.candidates,
    )

    elapsed = time.perf_counter() - start

    # Print results
    print("\n" + "=" * 70)
    print("  PRISM AUTORESEARCH RESULTS")
    print("=" * 70)
    print(f"  Intent: {result.get('intent', 'N/A')}")
    print(f"  Pillar: {result.get('pillar', 'N/A')}")
    print(f"  Trials: {result.get('trials_completed', 0)}/{result.get('trials_requested', 0)}")
    print(f"  Wall clock: {result.get('wall_clock_seconds', elapsed):.1f}s (budget: 90s)")
    print(f"  Total cost: ${result.get('total_cost_usd', 0):.4f} (budget: $0.50)")
    print(f"  Gauge R&R reliable: {result.get('gauge_rr_reliable', 'N/A')}")
    print("-" * 70)

    models = result.get("results", [])
    if models:
        print(f"\n  {'#':<3} {'Model':<22} {'Cpk':<7} {'σ-lvl':<8} {'DPMO':<10} {'μ':<6} {'σ':<6} {'Match':<7} {'Verdict':<14}")
        print("  " + "-" * 83)
        for i, m in enumerate(models, 1):
            print(f"  {i:<3} {m.get('short_name','?'):<22} "
                  f"{m.get('cpk',0):.2f}  "
                  f"{m.get('sigma_level',0):.1f}σ    "
                  f"{m.get('dpmo',0):>8,.0f}  "
                  f"{m.get('mu',0):.1f}  "
                  f"{m.get('sigma',0):.1f}  "
                  f"{m.get('match_score',0):.1f}  "
                  f"{m.get('verdict','?')}")
    else:
        print("  No results.")
        if "error" in result:
            print(f"  Error: {result['error']}")

    print("\n" + "=" * 70)
    print("  Cpk ≥ 1.33 = production-grade | 4σ+ = acceptable | DPMO < 6,210 = good")
    print("=" * 70 + "\n")

    # Write output
    if args.output:
        with open(args.output, "w") as f:
            json.dump(result, f, indent=2, default=str)
        logger.info("Results written to %s", args.output)

    return result


if __name__ == "__main__":
    asyncio.run(main())
