import asyncio
import math
from random import Random
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from fastapi.testclient import TestClient

from algorithms.neighbors import swap_vehicles
from algorithms.objective import calculate_objective
from algorithms.simulated_annealing import acceptance_probability, simulated_annealing
from algorithms.validation import validate_arrangement
from main import app
from models.config import ConfigModel, Ship, Vehicle
from models.run import RunModel, SimulatedAnnealingSettings, VehiclePlacement


def example():
    first = Vehicle(length=2, width=1, weight=20, shipping_fee=30, eta=0)
    second = Vehicle(length=1, width=2, weight=30, shipping_fee=80, eta=0)
    config = ConfigModel(ship=Ship(length=4, width=4, max_weight=40), vehicles=[first, second])
    initial = [VehiclePlacement(vehicle_id=first.id, x=0, y=0, length=2, width=1)]
    return config, initial


def settings(**kwargs):
    return SimulatedAnnealingSettings(algorithm="simulated_annealing", **{
        "iterations": 120, "initial_temperature": 100, "cooling_rate": .98, **kwargs,
    })


def test_acceptance_uses_maximization_sign():
    assert acceptance_probability(10, 1) == 1
    assert acceptance_probability(0, 1) == 1
    assert acceptance_probability(-10, 100) == pytest.approx(math.exp(-.1))
    assert acceptance_probability(-10, .001) == 0
    with pytest.raises(ValueError):
        acceptance_probability(-1, 0)


def test_seeded_search_keeps_all_snapshots_feasible_and_preserves_input():
    config, _ = example()
    before = config.model_dump()
    first = simulated_annealing(config, settings(), Random(42))
    second = simulated_annealing(config, settings(), Random(42))
    assert first.model_dump(exclude={"runtime_ms"}) == second.model_dump(exclude={"runtime_ms"})
    assert config.model_dump() == before
    assert first.final_objective >= first.initial_objective
    assert first.final_objective == calculate_objective(config, first.final_arrangement)
    assert first.snapshots[0].arrangement == first.initial_arrangement
    assert first.snapshots[-1].arrangement == first.last_arrangement
    for state in [first.initial_arrangement, first.final_arrangement, first.last_arrangement, *[s.arrangement for s in first.snapshots]]:
        assert validate_arrangement(config, state) == []
    for point in first.annealing_history:
        assert 0 <= point.acceptance_probability <= 1
        assert point.best_objective >= point.objective


def test_best_is_preserved_after_accepting_a_worse_candidate():
    config, initial = example()
    with patch("algorithms.simulated_annealing.random_neighbor", return_value=[]):
        result = simulated_annealing(config, settings(iterations=1, initial_temperature=1e12), Random(1), initial)
    assert result.final_arrangement == initial
    assert result.last_arrangement == []
    assert result.annealing_history[0].accepted
    assert result.final_objective == 30
    assert result.objective_history[-1].objective == 0


def test_stagnation_counts_episodes_and_missing_candidate_is_not_optimality():
    config = ConfigModel(ship=Ship(length=2, width=2, max_weight=10), vehicles=[])
    result = simulated_annealing(config, settings(iterations=10, stagnation_window=3), Random(1))
    assert result.stuck_count == 1
    assert result.iterations_completed == 10
    assert not any(point.candidate_found for point in result.annealing_history)
    assert all(point.delta is None for point in result.annealing_history)
    assert result.stop_reason == "iteration_limit"


def test_cooling_stop_and_zero_iteration_result():
    config, _ = example()
    result = simulated_annealing(config, settings(initial_temperature=1, minimum_temperature=.5, cooling_rate=.1), Random(1))
    assert result.iterations_completed == 1
    assert result.stop_reason == "minimum_temperature"
    empty = simulated_annealing(config, settings(initial_temperature=.01, minimum_temperature=1), Random(1))
    assert empty.iterations_completed == 0
    assert len(empty.snapshots) == 1


def test_search_respects_main_custom_start_toggle():
    vehicle = Vehicle(length=1, width=1, weight=1, shipping_fee=10, eta=0, x=3, y=3)
    config = ConfigModel(ship=Ship(length=4, width=4, max_weight=10), vehicles=[vehicle], preserve_positions=True)
    no_search = settings(initial_temperature=.01, minimum_temperature=1)
    preserved = simulated_annealing(config, no_search, Random(42))
    assert (preserved.initial_arrangement[0].x, preserved.initial_arrangement[0].y) == (3, 3)
    config.vehicles[0].x = 99
    with pytest.raises(ValueError):
        simulated_annealing(config, no_search, Random(42))
    config.preserve_positions = False
    randomized = simulated_annealing(config, no_search, Random(42))
    assert validate_arrangement(config, randomized.initial_arrangement) == []
    assert randomized.initial_arrangement[0].x < 4
    assert config.vehicles[0].x == 99


def test_swap_loaded_unloaded_and_loaded_loaded():
    config, initial = example()
    replacement = swap_vehicles(config, initial, config.vehicles[0].id, config.vehicles[1].id)
    assert replacement is not None and replacement[0].vehicle_id == config.vehicles[1].id
    assert validate_arrangement(config, replacement) == []
    assert initial[0].vehicle_id == config.vehicles[0].id
    config.ship.max_weight = 100
    other = VehiclePlacement(vehicle_id=config.vehicles[1].id, x=2, y=2, length=1, width=2)
    swapped = swap_vehicles(config, [*initial, other], initial[0].vehicle_id, other.vehicle_id)
    assert swapped is not None and swapped[0].x == 2 and swapped[1].x == 0
    assert validate_arrangement(config, swapped) == []
    config.ship.max_weight = 10
    assert swap_vehicles(config, initial, initial[0].vehicle_id, other.vehicle_id) is None


def test_raw_exponential_overflow_remains_json_serializable():
    config, _ = example()
    candidate = [VehiclePlacement(vehicle_id=config.vehicles[1].id, x=0, y=0, length=1, width=2)]
    with patch("algorithms.simulated_annealing.random_neighbor", return_value=candidate):
        result = simulated_annealing(config, settings(iterations=1, initial_temperature=.001, minimum_temperature=.0001), Random(1), [])
    assert result.annealing_history[0].exponential is None
    assert result.annealing_history[0].log_acceptance == 80000
    assert result.annealing_history[0].acceptance_probability == 1
    assert result.model_dump_json()


def test_search_endpoint_runs_three_seeds_without_database():
    config, _ = example()

    async def check():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            payload = {"config": config.model_dump(mode="json"), "settings": settings(iterations=10).model_dump(), "random_seed": 42, "run_count": 3}
            response = await client.post("/api/search/simulated-annealing", json=payload)
            assert response.status_code == 200
            runs = [RunModel.model_validate(item) for item in response.json()]
            assert [run.random_seed for run in runs] == [42, 43, 44]
            assert len({run.configHash for run in runs}) == 1
            payload["config"]["vehicles"][0].update(x=99, y=99)
            payload["config"]["preserve_positions"] = True
            invalid = await client.post("/api/search/simulated-annealing", json=payload)
            assert invalid.status_code == 422
    asyncio.run(check())


def test_websocket_emits_initial_progress_and_complete_runs():
    config, _ = example()
    client = TestClient(app)
    with client.websocket_connect("/api/search/simulated-annealing/stream") as socket:
        socket.send_json({"config": config.model_dump(mode="json"), "settings": settings(iterations=5).model_dump(), "run_count": 3})
        progress = []
        while True:
            message = socket.receive_json()
            if message["type"] == "complete":
                assert len(message["runs"]) == 3
                break
            assert message["type"] == "progress"
            progress.append(message)
        assert {item["run_index"] for item in progress} == {0, 1, 2}
        assert progress[0]["snapshot"]["iteration"] == 0


def test_websocket_reports_invalid_parameters():
    client = TestClient(app)
    with client.websocket_connect("/api/search/simulated-annealing/stream") as socket:
        socket.send_json({})
        assert socket.receive_json()["type"] == "error"
