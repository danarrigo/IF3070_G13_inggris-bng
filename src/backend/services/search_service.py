from collections.abc import Callable
from functools import partial
from random import Random

from pymongo.database import Database

from algorithms.cancellation import check_cancellation
from algorithms.simulated_annealing import simulated_annealing
from dtos.run import AnnealingRequest
from models.config import ConfigModel
from models.run import RunModel, SimulatedAnnealingSettings, StateSnapshot
from repository.run_repository import insert_run
from services.output_service import export_run
from services.run_service import hash_config


def execute_runs(
    config: ConfigModel,
    settings: SimulatedAnnealingSettings,
    random_seed: int,
    run_count: int = 1,
    on_snapshot: Callable[[int, StateSnapshot], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> list[RunModel]:
    """Create reproducible run records without requiring persistence."""
    if run_count not in (1, 3):
        raise ValueError("Choose one or three runs.")
    if len(config.vehicles) > 200:
        raise ValueError("Search supports at most 200 vehicles per request.")
    runs: list[RunModel] = []
    for offset in range(run_count):
        check_cancellation(should_cancel)
        seed = random_seed + offset
        observer = None if on_snapshot is None else partial(on_snapshot, offset)
        result = simulated_annealing(
            config,
            settings,
            Random(seed),
            on_snapshot=observer,
            should_cancel=should_cancel,
        )
        runs.append(
            RunModel(
                config=config,
                configHash=hash_config(config),
                random_seed=seed,
                settings=settings,
                result=result,
            )
        )
    return runs


def execute_saved_runs(
    db: Database[dict[str, object]],
    request: AnnealingRequest,
    on_snapshot: Callable[[int, StateSnapshot], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> list[RunModel]:
    check_cancellation(should_cancel)
    runs = execute_runs(
        request.config,
        request.settings,
        request.random_seed,
        request.run_count,
        on_snapshot,
        should_cancel,
    )
    for run in runs:
        check_cancellation(should_cancel)
        _ = insert_run(db, run)
    if request.save_to_output:
        for run in runs:
            _ = export_run(run)
    return runs
