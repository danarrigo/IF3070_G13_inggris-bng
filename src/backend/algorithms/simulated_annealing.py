"""Simulated Annealing for maximizing loaded shipping fees."""

import math
from collections.abc import Callable
from random import Random
from time import perf_counter

from algorithms.initialization import initialize_arrangement
from algorithms.neighbors import random_neighbor
from algorithms.objective import calculate_objective
from algorithms.validation import validate_arrangement
from models.config import ConfigModel
from models.run import (
    AnnealingPoint,
    ObjectivePoint,
    RunResult,
    SimulatedAnnealingSettings,
    StateSnapshot,
    VehiclePlacement,
)


def acceptance_probability(delta: int, temperature: float) -> float:
    if not math.isfinite(temperature) or temperature <= 0:
        raise ValueError("Temperature must be finite and positive.")
    return 1.0 if delta >= 0 else math.exp(delta / temperature)


def simulated_annealing(
    config: ConfigModel,
    settings: SimulatedAnnealingSettings,
    rng: Random,
    initial_arrangement: list[VehiclePlacement] | None = None,
    on_snapshot: Callable[[StateSnapshot], None] | None = None,
) -> RunResult:
    started = perf_counter()
    observer_seconds = 0.0

    def notify(snapshot: StateSnapshot) -> None:
        nonlocal observer_seconds
        if on_snapshot:
            before = perf_counter()
            on_snapshot(snapshot)
            observer_seconds += perf_counter() - before

    current = (
        initialize_arrangement(config, rng)
        if initial_arrangement is None
        else [p.model_copy(deep=True) for p in initial_arrangement]
    )
    errors = validate_arrangement(config, current)
    if errors:
        raise ValueError("; ".join(errors))
    initial = [p.model_copy(deep=True) for p in current]
    score = initial_score = calculate_objective(config, current)
    best, best_score = current, score
    temperature = settings.initial_temperature
    history: list[AnnealingPoint] = []
    objectives = [ObjectivePoint(iteration=0, objective=score)]
    snapshots = [StateSnapshot(iteration=0, objective=score, arrangement=current)]
    notify(snapshots[0])
    # Keep replay storage bounded; metrics still include every iteration.
    snapshot_interval = max(1, math.ceil(settings.iterations / 100))
    stagnant, in_stagnation, stuck_count = 0, False, 0
    stop_reason = "iteration_limit"
    for iteration in range(1, settings.iterations + 1):
        if temperature < settings.minimum_temperature:
            stop_reason = "minimum_temperature"
            break
        candidate = random_neighbor(config, current, rng)
        delta = (
            None
            if candidate is None
            else calculate_objective(config, candidate) - score
        )
        log_acceptance = None if delta is None else delta / temperature
        # null marks exponential overflow; the log value remains available.
        exponential = (
            None
            if log_acceptance is None or log_acceptance > 709
            else math.exp(log_acceptance)
        )
        probability = (
            0.0 if delta is None else acceptance_probability(delta, temperature)
        )
        accepted = (
            candidate is not None
            and delta is not None
            and (delta >= 0 or rng.random() < probability)
        )
        if accepted and candidate is not None and delta is not None:
            current = candidate
            score += delta
        if score > best_score:
            best, best_score = current, score
            stagnant, in_stagnation = 0, False
        else:
            stagnant += 1
            if stagnant >= settings.stagnation_window and not in_stagnation:
                stuck_count += 1
                in_stagnation = True
        history.append(
            AnnealingPoint(
                iteration=iteration,
                temperature=temperature,
                objective=score,
                best_objective=best_score,
                delta=delta,
                log_acceptance=log_acceptance,
                exponential=exponential,
                acceptance_probability=probability,
                accepted=accepted,
                candidate_found=candidate is not None,
            )
        )
        objectives.append(ObjectivePoint(iteration=iteration, objective=score))
        if iteration % snapshot_interval == 0:
            snapshots.append(
                StateSnapshot(iteration=iteration, objective=score, arrangement=current)
            )
            notify(snapshots[-1])
        temperature *= settings.cooling_rate
    completed = len(history)
    if snapshots[-1].iteration != completed:
        snapshots.append(
            StateSnapshot(iteration=completed, objective=score, arrangement=current)
        )
        notify(snapshots[-1])
    loaded = {p.vehicle_id for p in best}
    return RunResult(
        initial_arrangement=initial,
        final_arrangement=best,
        last_arrangement=current,
        unloaded_vehicle_ids=[v.id for v in config.vehicles if v.id not in loaded],
        initial_objective=initial_score,
        final_objective=best_score,
        best_objective=best_score,
        objective_history=objectives,
        runtime_ms=(perf_counter() - started - observer_seconds) * 1000,
        iterations_completed=completed,
        stuck_count=stuck_count,
        stop_reason=stop_reason,
        annealing_history=history,
        snapshots=snapshots,
    )
