from collections.abc import Callable, Iterator
from dataclasses import dataclass
from itertools import combinations
from math import isfinite
from random import Random
from time import perf_counter
from typing import Literal, TypedDict, Unpack

from pymongo.database import Database

from algorithms.cancellation import check_cancellation
from algorithms.initialization import initialize_arrangement
from algorithms.neighbors import (
    load_vehicle,
    move_vehicle,
    rotate_vehicle,
    swap_vehicles,
)
from algorithms.objective import calculate_objective
from algorithms.validation import validate_arrangement
from models.config import ConfigModel
from models.run import (
    HillClimbingStopReason,
    HillClimbingVariant,
    ObjectivePoint,
    RunResult,
    VehiclePlacement,
)
from services.run_service import prepare_run


@dataclass(frozen=True)
class SearchProgress:
    phase: Literal["initial", "candidate", "best", "iteration", "restart"]
    iteration: int
    objective: int
    current_objective: int
    arrangement: list[VehiclePlacement]
    neighbors_evaluated: int
    runtime_ms: float
    restarts_completed: int = 0
    sideways_moves: int = 0


class SearchOptions(TypedDict, total=False):
    max_iterations: int | None
    on_progress: Callable[[SearchProgress], None] | None
    should_cancel: Callable[[], bool] | None
    neighbor_sample_interval_ms: float | None


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
                        config, current_state, vehicle.id, x=x, y=y, rotated=rotated
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


def run_hill_climbing(
    config: ConfigModel,
    initial_arrangement: list[VehiclePlacement],
    *,
    variant: HillClimbingVariant = "steepest_ascent",
    rng: Random | None = None,
    max_iterations: int | None = None,
    max_sideways: int = 100,
    max_restart: int = 10,
    on_progress: Callable[[SearchProgress], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
    neighbor_sample_interval_ms: float | None = None,
) -> RunResult:
    check_cancellation(should_cancel)
    if max_iterations is not None and max_iterations <= 0:
        raise ValueError("max_iterations must be positive.")
    if max_sideways < 0 or max_restart < 0:
        raise ValueError("Hill climbing limits must be nonnegative.")
    if variant not in ("steepest_ascent", "stochastic", "sideways", "random_restart"):
        raise ValueError("Unknown hill climbing variant.")
    if neighbor_sample_interval_ms is not None and (
        not isfinite(neighbor_sample_interval_ms) or neighbor_sample_interval_ms < 0
    ):
        raise ValueError("Neighbor sampling interval must be finite and nonnegative.")
    errors = validate_arrangement(config, initial_arrangement)
    if errors:
        raise ValueError("; ".join(errors))
    rng = rng if rng is not None else Random(42)
    started = perf_counter()
    observer_time = 0.0
    initialization_time = 0.0
    initial = [item.model_copy(deep=True) for item in initial_arrangement]
    current = [item.model_copy(deep=True) for item in initial]
    current_obj = calculate_objective(config, current)
    initial_obj = current_obj
    best_arrangement, best_objective = current, current_obj
    history = [ObjectivePoint(iteration=0, objective=current_obj)]
    iterations = 0
    evaluated = 0
    restarts = 0
    sideways_moves = 0
    sideways_streak = 0
    attempt_iterations = 0
    iterations_per_restart: list[int] = []
    next_preview_at = 0.0
    stop_reason: HillClimbingStopReason = "iteration_limit"

    def report(
        phase: Literal["initial", "candidate", "best", "iteration", "restart"],
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
                    runtime_ms=(
                        observer_started - started - observer_time - initialization_time
                    )
                    * 1000,
                    restarts_completed=restarts,
                    sideways_moves=sideways_moves,
                )
            )
        finally:
            observer_time += perf_counter() - observer_started

    report("initial", current, current_obj, 0)
    while max_iterations is None or iterations < max_iterations:
        highest_obj = current_obj
        highest_neighbor: list[VehiclePlacement] | None = None
        stochastic_neighbor: list[VehiclePlacement] | None = None
        stochastic_score = current_obj
        improvement_weight = 0
        sideways_neighbor: list[VehiclePlacement] | None = None
        ties = 0
        check_cancellation(should_cancel)
        for neighbor in iter_neighbors(current, config, should_cancel=should_cancel):
            check_cancellation(should_cancel)
            evaluated += 1
            score = calculate_objective(config, neighbor)
            if variant == "stochastic" and score > current_obj:
                delta = score - current_obj
                improvement_weight += delta
                if rng.randrange(improvement_weight) < delta:
                    stochastic_neighbor, stochastic_score = neighbor, score
            if variant == "sideways" and score == current_obj:
                ties += 1
                if rng.randrange(ties) == 0:
                    sideways_neighbor = neighbor
            if score > highest_obj:
                highest_obj, highest_neighbor = score, neighbor
                report("best", neighbor, score, iterations + 1)
            elif neighbor_sample_interval_ms is not None and on_progress is not None:
                elapsed = (
                    perf_counter() - started - observer_time - initialization_time
                ) * 1000
                if elapsed >= next_preview_at:
                    report("candidate", neighbor, score, iterations + 1)
                    next_preview_at = elapsed + neighbor_sample_interval_ms
        iterations += 1
        attempt_iterations += 1
        selected = stochastic_neighbor if variant == "stochastic" else highest_neighbor
        selected_score = stochastic_score if variant == "stochastic" else highest_obj
        if (
            selected is None
            and variant == "sideways"
            and sideways_neighbor is not None
            and sideways_streak < max_sideways
        ):
            selected, selected_score = sideways_neighbor, current_obj
            sideways_streak += 1
            sideways_moves += 1
        elif selected is not None:
            sideways_streak = 0
        if selected is not None:
            current, current_obj = selected, selected_score
            if current_obj > best_objective:
                best_arrangement, best_objective = current, current_obj
        history.append(ObjectivePoint(iteration=iterations, objective=current_obj))
        report("iteration", current, current_obj, iterations)
        if selected is None:
            if variant == "random_restart":
                if max_iterations is not None and iterations >= max_iterations:
                    break
                if restarts >= max_restart:
                    stop_reason = "restart_limit"
                    break
                iterations_per_restart.append(attempt_iterations)
                attempt_iterations = 0
                restarts += 1
                initialization_started = perf_counter()
                current = initialize_arrangement(
                    config, rng, preserve_positions=False, should_cancel=should_cancel
                )
                initialization_time += perf_counter() - initialization_started
                current_obj = calculate_objective(config, current)
                if current_obj > best_objective:
                    best_arrangement, best_objective = current, current_obj
                history.append(
                    ObjectivePoint(iteration=iterations, objective=current_obj)
                )
                report("restart", current, current_obj, iterations)
                continue
            stop_reason = (
                "sideways_limit"
                if variant == "sideways" and sideways_neighbor is not None
                else "local_optimum"
            )
            break
    check_cancellation(should_cancel)
    iterations_per_restart.append(attempt_iterations)
    if variant == "random_restart":
        current, current_obj = best_arrangement, best_objective
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
        runtime_ms=(perf_counter() - started - observer_time - initialization_time)
        * 1000,
        sideways_moves=sideways_moves,
        restarts_completed=restarts,
        iterations_per_restart=iterations_per_restart,
    )


def steepest_ascent(
    config: ConfigModel,
    initial_arrangement: list[VehiclePlacement],
    **options: Unpack[SearchOptions],
) -> RunResult:
    return run_hill_climbing(config, initial_arrangement, **options)


def stochastic_hill_climbing(
    config: ConfigModel,
    initial_arrangement: list[VehiclePlacement],
    *,
    rng: Random,
    **options: Unpack[SearchOptions],
) -> RunResult:
    return run_hill_climbing(
        config, initial_arrangement, variant="stochastic", rng=rng, **options
    )


def sideways_hill_climbing(
    config: ConfigModel,
    initial_arrangement: list[VehiclePlacement],
    *,
    rng: Random,
    max_sideways: int = 100,
    **options: Unpack[SearchOptions],
) -> RunResult:
    return run_hill_climbing(
        config,
        initial_arrangement,
        variant="sideways",
        rng=rng,
        max_sideways=max_sideways,
        **options,
    )


def random_restart_hill_climbing(
    config: ConfigModel,
    initial_arrangement: list[VehiclePlacement],
    *,
    rng: Random,
    max_restart: int = 10,
    **options: Unpack[SearchOptions],
) -> RunResult:
    return run_hill_climbing(
        config,
        initial_arrangement,
        variant="random_restart",
        rng=rng,
        max_restart=max_restart,
        **options,
    )
