from collections.abc import Callable, Iterator
from dataclasses import dataclass
from itertools import combinations
from math import isfinite
from time import perf_counter
from typing import Literal

from pymongo.database import Database

from algorithms.cancellation import check_cancellation
from algorithms.neighbors import (
    load_vehicle,
    move_vehicle,
    rotate_vehicle,
    swap_vehicles,
)
from algorithms.objective import calculate_objective
from algorithms.validation import validate_arrangement
from models.config import ConfigModel
from models.run import ObjectivePoint, RunResult, VehiclePlacement
from services.run_service import prepare_run


@dataclass(frozen=True)
class SearchProgress:
    phase: Literal["initial", "candidate", "best", "iteration"]
    iteration: int
    objective: int
    current_objective: int
    arrangement: list[VehiclePlacement]
    neighbors_evaluated: int
    runtime_ms: float


def iter_neighbors(
    current_state: list[VehiclePlacement],
    config: ConfigModel,
    *,
    should_cancel: Callable[[], bool] | None = None,
) -> Iterator[list[VehiclePlacement]]:
    check_cancellation(should_cancel)
    errors = validate_arrangement(config, current_state)
    if errors:
        raise ValueError("; ".join(errors))

    loaded_ids = {vehicle.vehicle_id for vehicle in current_state}

    for vehicle in current_state:
        check_cancellation(should_cancel)
        for x in range(config.ship.width - vehicle.width + 1):
            for y in range(config.ship.length - vehicle.length + 1):
                check_cancellation(should_cancel)
                neighbor = move_vehicle(
                    config, current_state, vehicle.vehicle_id, x=x, y=y
                )
                if neighbor is not None:
                    yield neighbor

        neighbor = rotate_vehicle(config, current_state, vehicle.vehicle_id)
        if neighbor is not None:
            yield neighbor

        neighbor = move_vehicle(
            config, current_state, vehicle.vehicle_id, x=None, y=None
        )
        if neighbor is not None:
            yield neighbor

    for first, second in combinations(config.vehicles, 2):
        check_cancellation(should_cancel)
        if first.id not in loaded_ids and second.id not in loaded_ids:
            continue
        neighbor = swap_vehicles(config, current_state, first.id, second.id)
        if neighbor is not None:
            yield neighbor

    for vehicle in config.vehicles:
        check_cancellation(should_cancel)
        if vehicle.id in loaded_ids:
            continue
        for rotated in (False, True):
            if rotated and vehicle.length == vehicle.width:
                continue
            length = vehicle.width if rotated else vehicle.length
            width = vehicle.length if rotated else vehicle.width
            for x in range(config.ship.width - width + 1):
                for y in range(config.ship.length - length + 1):
                    check_cancellation(should_cancel)
                    neighbor = load_vehicle(
                        config,
                        current_state,
                        vehicle.id,
                        x=x,
                        y=y,
                        rotated=rotated,
                    )
                    if neighbor is not None:
                        yield neighbor


def generate_neighbors(
    current_state: list[VehiclePlacement],
    config: ConfigModel,
    *,
    should_cancel: Callable[[], bool] | None = None,
) -> list[list[VehiclePlacement]]:
    return list(iter_neighbors(current_state, config, should_cancel=should_cancel))


def hill_climbing(
    db: Database[dict[str, object]], random_seed: int = 42
) -> list[VehiclePlacement]:
    prepared_run = prepare_run(db, random_seed=random_seed)
    return steepest_ascent(
        prepared_run.config, prepared_run.initial_arrangement
    ).final_arrangement


def steepest_ascent(
    config: ConfigModel,
    initial_arrangement: list[VehiclePlacement],
    *,
    max_iterations: int | None = None,
    on_progress: Callable[[SearchProgress], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
    neighbor_sample_interval_ms: float | None = None,
) -> RunResult:
    check_cancellation(should_cancel)
    if max_iterations is not None and max_iterations <= 0:
        raise ValueError("max_iterations must be positive.")
    if neighbor_sample_interval_ms is not None and (
        not isfinite(neighbor_sample_interval_ms) or neighbor_sample_interval_ms < 0
    ):
        raise ValueError("Neighbor sampling interval must be finite and nonnegative.")
    errors = validate_arrangement(config, initial_arrangement)
    if errors:
        raise ValueError("; ".join(errors))
    started = perf_counter()
    observer_time = 0.0
    initial = [item.model_copy(deep=True) for item in initial_arrangement]
    current = [item.model_copy(deep=True) for item in initial]
    current_obj = calculate_objective(config, current)
    initial_obj = current_obj
    history = [ObjectivePoint(iteration=0, objective=current_obj)]
    iterations = 0
    evaluated = 0
    next_preview_at = 0.0
    stop_reason: Literal["local_optimum", "iteration_limit"] = "iteration_limit"

    def report(
        phase: Literal["initial", "candidate", "best", "iteration"],
        arrangement: list[VehiclePlacement],
        objective: int,
        iteration: int,
    ) -> None:
        nonlocal observer_time
        check_cancellation(should_cancel)
        if on_progress is None:
            return
        observer_started = perf_counter()
        try:
            on_progress(
                SearchProgress(
                    phase=phase,
                    iteration=iteration,
                    objective=objective,
                    current_objective=current_obj,
                    arrangement=[item.model_copy(deep=True) for item in arrangement],
                    neighbors_evaluated=evaluated,
                    runtime_ms=(observer_started - started - observer_time) * 1000,
                )
            )
        finally:
            observer_time += perf_counter() - observer_started

    report("initial", current, current_obj, 0)
    while max_iterations is None or iterations < max_iterations:
        highest_obj = current_obj
        highest_neighbor: list[VehiclePlacement] | None = None
        check_cancellation(should_cancel)
        for neighbor in iter_neighbors(current, config, should_cancel=should_cancel):
            check_cancellation(should_cancel)
            evaluated += 1
            score = calculate_objective(config, neighbor)
            if score > highest_obj:
                highest_obj = score
                highest_neighbor = neighbor
                report("best", neighbor, score, iterations + 1)
            elif neighbor_sample_interval_ms is not None and on_progress is not None:
                elapsed = (perf_counter() - started - observer_time) * 1000
                if elapsed >= next_preview_at:
                    report("candidate", neighbor, score, iterations + 1)
                    next_preview_at = elapsed + neighbor_sample_interval_ms
        iterations += 1
        if highest_neighbor is None:
            history.append(ObjectivePoint(iteration=iterations, objective=current_obj))
            stop_reason = "local_optimum"
            report("iteration", current, current_obj, iterations)
            break
        current_obj = highest_obj
        current = highest_neighbor
        history.append(ObjectivePoint(iteration=iterations, objective=current_obj))
        report("iteration", current, current_obj, iterations)
    check_cancellation(should_cancel)
    loaded_ids = {item.vehicle_id for item in current}
    return RunResult(
        initial_arrangement=initial,
        final_arrangement=current,
        unloaded_vehicle_ids=[
            vehicle.id for vehicle in config.vehicles if vehicle.id not in loaded_ids
        ],
        initial_objective=initial_obj,
        final_objective=current_obj,
        objective_history=history,
        iterations_completed=iterations,
        neighbors_evaluated=evaluated,
        stop_reason=stop_reason,
        runtime_ms=(perf_counter() - started - observer_time) * 1000,
    )
