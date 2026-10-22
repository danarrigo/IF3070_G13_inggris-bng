"""Run three SA experiments from a JSON config, without MongoDB."""

import argparse
import json
from pathlib import Path

from dtos.run import AnnealingRequest
from models.config import ConfigModel
from models.run import SimulatedAnnealingSettings
from services.search_service import execute_runs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("--output", type=Path, default=Path("../../output/sa-experiments.json"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--iterations", type=int, default=1000)
    parser.add_argument("--temperature", type=float, default=1000)
    parser.add_argument("--cooling-rate", type=float, default=.995)
    args = parser.parse_args()
    request = AnnealingRequest(
        config=ConfigModel.model_validate_json(args.config.read_text(encoding="utf-8")),
        settings=SimulatedAnnealingSettings(
            algorithm="simulated_annealing", iterations=args.iterations,
            initial_temperature=args.temperature, cooling_rate=args.cooling_rate,
        ),
        random_seed=args.seed, run_count=3,
    )
    runs = execute_runs(request.config, request.settings, request.random_seed, request.run_count)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps([run.model_dump(mode="json") for run in runs], indent=2), encoding="utf-8")
    for run in runs:
        result = run.result
        print(f"seed={run.random_seed}: {result.initial_objective} -> {result.final_objective}; {result.iterations_completed} iterations; {result.runtime_ms:.2f} ms")
    print(f"Saved: {args.output.resolve()}")


if __name__ == "__main__":
    main()
