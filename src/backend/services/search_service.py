from random import Random
from collections.abc import Callable

from algorithms.simulated_annealing import simulated_annealing
from models.config import ConfigModel
from models.run import RunModel, SimulatedAnnealingSettings, StateSnapshot
from services.run_service import hash_config


def execute_runs(
    config: ConfigModel, settings: SimulatedAnnealingSettings,
    random_seed: int, run_count: int = 1,
    on_snapshot: Callable[[int, StateSnapshot], None] | None = None,
) -> list[RunModel]:
    """Create reproducible run records without requiring persistence."""
    if run_count not in (1, 3):
        raise ValueError("Choose one or three runs.")
    if len(config.vehicles) > 200:
        raise ValueError("Search supports at most 200 vehicles per request.")
    runs = []
    for offset in range(run_count):
        seed = random_seed + offset
        observer = None if on_snapshot is None else lambda snapshot: on_snapshot(offset, snapshot)
        result = simulated_annealing(config, settings, Random(seed), on_snapshot=observer)
        runs.append(RunModel(
            config=config, configHash=hash_config(config),
            random_seed=seed, settings=settings, result=result,
        ))
    return runs
