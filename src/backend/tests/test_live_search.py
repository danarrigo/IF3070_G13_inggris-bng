from random import Random
from threading import Event

import pytest

from algorithms.cancellation import SearchCancelled
from algorithms.hill_climbing import SearchProgress, iter_neighbors, steepest_ascent
from algorithms.initialization import initialize_arrangement
from algorithms.validation import validate_arrangement
from models.config import ConfigModel, Ship, Vehicle
from models.run import VehiclePlacement


def state() -> tuple[ConfigModel, list[VehiclePlacement]]:
    first = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10)
    second = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=30)
    config = ConfigModel(
        ship=Ship(length=1, width=1, max_weight=1), vehicles=[first, second]
    )
    return config, [VehiclePlacement(vehicle_id=first.id, x=0, y=0, length=1, width=1)]


def test_reports_actual_initial_best_so_far_and_committed_iteration_states() -> None:
    config, initial = state()
    progress: list[SearchProgress] = []
    result = steepest_ascent(
        config, initial, max_iterations=10, on_progress=progress.append
    )
    assert [item.phase for item in progress] == [
        "initial",
        "best",
        "iteration",
        "iteration",
    ]
    assert progress[1].iteration == 1
    assert progress[1].objective == 30
    assert progress[1].current_objective == 10
    assert progress[0].arrangement == initial
    assert progress[-1].arrangement == result.final_arrangement
    assert [item.objective for item in progress if item.phase != "best"] == [
        point.objective for point in result.objective_history
    ]
    assert all(
        validate_arrangement(config, item.arrangement) == [] for item in progress
    )


def test_sampled_neighbors_do_not_change_selection_or_metrics() -> None:
    config, initial = state()
    baseline = steepest_ascent(config, initial)
    progress: list[SearchProgress] = []
    sampled = steepest_ascent(
        config, initial, on_progress=progress.append, neighbor_sample_interval_ms=0
    )
    assert sampled.model_dump(exclude={"runtime_ms"}) == baseline.model_dump(
        exclude={"runtime_ms"}
    )
    candidates = [item for item in progress if item.phase in ("candidate", "best")]
    assert len(candidates) == sampled.neighbors_evaluated
    assert any(
        item.phase == "candidate" and item.objective < item.current_objective
        for item in candidates
    )
    assert all(
        validate_arrangement(config, item.arrangement) == [] for item in candidates
    )


def test_samples_are_throttled_while_best_updates_are_retained(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import algorithms.hill_climbing as search

    config, initial = state()
    config.ship.width = 8
    clock = 0.0
    original = search.calculate_objective

    def score(config: ConfigModel, arrangement: list[VehiclePlacement]) -> int:
        nonlocal clock
        clock += 0.025
        return original(config, arrangement)

    monkeypatch.setattr(search, "perf_counter", lambda: clock)
    monkeypatch.setattr(search, "calculate_objective", score)
    progress: list[SearchProgress] = []
    result = steepest_ascent(
        config, initial, on_progress=progress.append, neighbor_sample_interval_ms=100
    )
    samples = [item for item in progress if item.phase == "candidate"]
    assert len(samples) > 1
    assert all(
        second.runtime_ms - first.runtime_ms >= 99.999
        for first, second in zip(samples, samples[1:], strict=False)
    )
    assert any(item.phase == "best" and item.objective == 30 for item in progress)
    assert result.final_objective == 30


def test_neighbor_stream_cancels_before_enumeration_finishes() -> None:
    config, initial = state()
    config.ship.width = 1000
    cancelled = Event()
    neighbors = iter_neighbors(initial, config, should_cancel=cancelled.is_set)
    assert validate_arrangement(config, next(neighbors)) == []
    cancelled.set()
    with pytest.raises(SearchCancelled):
        _ = next(neighbors)


def test_progress_snapshots_cannot_mutate_the_search_state() -> None:
    config, initial = state()

    def mutate(progress: SearchProgress) -> None:
        if progress.arrangement:
            progress.arrangement[0].x = 999

    result = steepest_ascent(config, initial, on_progress=mutate)
    assert validate_arrangement(config, result.final_arrangement) == []
    assert initial[0].x == 0


def test_cancellation_stops_search_and_initialization() -> None:
    config, initial = state()
    cancelled = Event()

    def cancel(progress: SearchProgress) -> None:
        cancelled.set()

    with pytest.raises(SearchCancelled):
        steepest_ascent(
            config, initial, on_progress=cancel, should_cancel=cancelled.is_set
        )
    with pytest.raises(SearchCancelled):
        initialize_arrangement(config, Random(42), should_cancel=cancelled.is_set)
