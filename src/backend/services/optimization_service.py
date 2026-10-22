from collections.abc import Callable

from pymongo.database import Database

from algorithms.cancellation import check_cancellation
from algorithms.hill_climbing import SearchProgress, steepest_ascent
from dtos.optimization import SteepestAscentRequest
from models.run import HillClimbingSettings, RunModel
from repository.run_repository import insert_run
from services.run_service import prepare_config


def execute_steepest_ascent(
    db: Database[dict[str, object]],
    request: SteepestAscentRequest,
    *,
    on_progress: Callable[[SearchProgress], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> RunModel:
    prepared = prepare_config(
        request.config, random_seed=request.random_seed, should_cancel=should_cancel
    )
    result = steepest_ascent(
        prepared.config,
        prepared.initial_arrangement,
        max_iterations=request.iterations,
        on_progress=on_progress,
        should_cancel=should_cancel,
        neighbor_sample_interval_ms=0 if request.show_neighbors else None,
    )
    run = RunModel(
        config=prepared.config,
        configHash=prepared.config_hash,
        random_seed=prepared.random_seed,
        settings=HillClimbingSettings(
            algorithm="hill_climbing", iterations=request.iterations
        ),
        result=result,
    )
    check_cancellation(should_cancel)
    _ = insert_run(db, run)
    return run
