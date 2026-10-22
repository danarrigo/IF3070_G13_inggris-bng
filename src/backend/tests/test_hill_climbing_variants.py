from random import Random
from threading import Event

import pytest
from pydantic import ValidationError

from algorithms.cancellation import SearchCancelled
from algorithms.hill_climbing import (
    SearchProgress,
    random_restart_hill_climbing,
    run_hill_climbing,
    sideways_hill_climbing,
    steepest_ascent,
    stochastic_hill_climbing,
)
from algorithms.validation import validate_arrangement
from dtos.optimization import HillClimbingRequest
from models.config import ConfigModel, Ship, Vehicle
from models.run import VehiclePlacement


def plateau():
    first = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10)
    second = Vehicle(length=2, width=1, weight=1, eta=0, shipping_fee=5)
    config = ConfigModel(
        ship=Ship(length=3, width=1, max_weight=2),
        vehicles=[first, second],
        preserve_positions=True,
    )
    initial = [VehiclePlacement(vehicle_id=first.id, x=0, y=1, length=1, width=1)]
    return config, initial


def test_stochastic_is_seeded_and_can_choose_a_nonmaximal_improvement():
    vehicles = [
        Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=fee)
        for fee in (10, 20, 30)
    ]
    config = ConfigModel(ship=Ship(length=1, width=1, max_weight=1), vehicles=vehicles)
    initial = [VehiclePlacement(vehicle_id=vehicles[0].id, x=0, y=0, length=1, width=1)]
    scores = {
        stochastic_hill_climbing(
            config, initial, rng=Random(seed), max_iterations=1
        ).final_objective
        for seed in range(20)
    }
    assert scores == {20, 30}
    first = stochastic_hill_climbing(config, initial, rng=Random(42))
    second = stochastic_hill_climbing(config, initial, rng=Random(42))
    assert first.model_dump(exclude={"runtime_ms"}) == second.model_dump(
        exclude={"runtime_ms"}
    )
    assert all(
        b.objective >= a.objective
        for a, b in zip(
            first.objective_history, first.objective_history[1:], strict=False
        )
    )


def test_sideways_can_cross_a_plateau_to_load_an_additional_vehicle():
    config, initial = plateau()
    assert steepest_ascent(config, initial).final_objective == 10
    result = sideways_hill_climbing(
        config, initial, rng=Random(42), max_sideways=1, max_iterations=10
    )
    assert result.final_objective == 15
    assert result.sideways_moves == 1
    assert validate_arrangement(config, result.final_arrangement) == []


def test_sideways_stops_at_its_consecutive_equal_move_limit():
    config, initial = plateau()
    config.vehicles = config.vehicles[:1]
    result = sideways_hill_climbing(
        config, initial, rng=Random(42), max_sideways=2, max_iterations=20
    )
    assert result.stop_reason == "sideways_limit"
    assert result.sideways_moves == 2
    assert result.iterations_completed == 3
    disabled = sideways_hill_climbing(config, initial, rng=Random(42), max_sideways=0)
    assert disabled.final_arrangement == initial
    assert disabled.sideways_moves == 0


def test_random_restart_returns_global_best_and_records_each_attempt():
    config, initial = plateau()
    progress: list[SearchProgress] = []
    result = random_restart_hill_climbing(
        config,
        initial,
        rng=Random(7),
        max_restart=2,
        max_iterations=30,
        on_progress=progress.append,
    )
    assert result.restarts_completed == 2
    assert result.iterations_per_restart is not None
    assert len(result.iterations_per_restart) == 3
    assert sum(result.iterations_per_restart) == result.iterations_completed
    assert result.final_objective == max(
        point.objective for point in result.objective_history
    )
    assert result.final_objective == 15
    assert result.stop_reason == "restart_limit"
    assert len([item for item in progress if item.phase == "restart"]) == 2
    assert all(
        validate_arrangement(config, item.arrangement) == [] for item in progress
    )
    limited = random_restart_hill_climbing(
        config, initial, rng=Random(7), max_restart=10, max_iterations=1
    )
    assert limited.restarts_completed == 0
    assert limited.iterations_completed == 1
    assert limited.stop_reason == "iteration_limit"


def test_restarts_remain_cancellable_and_request_limits_are_validated():
    config, initial = plateau()
    cancelled = Event()

    def report(progress: SearchProgress):
        if progress.phase == "restart":
            cancelled.set()

    with pytest.raises(SearchCancelled):
        random_restart_hill_climbing(
            config,
            initial,
            rng=Random(7),
            max_restart=1,
            on_progress=report,
            should_cancel=cancelled.is_set,
        )
    for variant in ("steepest_ascent", "stochastic", "sideways", "random_restart"):
        request = HillClimbingRequest.model_validate(
            {"config": config, "variant": variant}
        )
        assert (
            run_hill_climbing(
                config, initial, variant=request.variant, max_iterations=2
            ).iterations_completed
            <= 2
        )
    with pytest.raises(ValidationError):
        HillClimbingRequest(config=config, max_restart=-1)
