from collections.abc import Callable

from pymongo.database import Database

from algorithms.cancellation import check_cancellation
from algorithms.hill_climbing import SearchProgress, run_hill_climbing
from dtos.optimization import HillClimbingRequest
from models.run import HillClimbingSettings, RunModel
from repository.run_repository import insert_run
from services.output_service import export_run
from services.run_service import prepare_config


def execute_hill_climbing(
    db: Database[dict[str, object]],
    request: HillClimbingRequest,
    *,
    on_progress: Callable[[SearchProgress], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> RunModel:
    prepared = prepare_config(
        request.config, random_seed=request.random_seed, should_cancel=should_cancel
    )
    result = run_hill_climbing(
        prepared.config,
        prepared.initial_arrangement,
        max_iterations=request.iterations,
        variant=request.variant,
        rng=prepared.rng,
        max_sideways=request.max_sideways,
        max_restart=request.max_restart,
        on_progress=on_progress,
        should_cancel=should_cancel,
        neighbor_sample_interval_ms=0 if request.show_neighbors else None,
    )
    run = RunModel(
        config=prepared.config,
        configHash=prepared.config_hash,
        random_seed=prepared.random_seed,
        settings=HillClimbingSettings(
            algorithm="hill_climbing",
            iterations=request.iterations,
            variant=request.variant,
            max_sideways=request.max_sideways,
            max_restart=request.max_restart,
        ),
        result=result,
    )
    check_cancellation(should_cancel)
    _ = insert_run(db, run)
    if request.save_to_output:
        _ = export_run(run)
    return run
