from algorithms.hill_climbing import steepest_ascent
from algorithms.validation import validate_arrangement
from models.config import ConfigModel, Ship, Vehicle
from models.run import VehiclePlacement


def test_selects_best_improvement_records_progress_and_stops_on_plateau() -> None:
    first = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10)
    second = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=30)
    config = ConfigModel(
        ship=Ship(length=1, width=1, max_weight=1), vehicles=[first, second]
    )
    initial = [VehiclePlacement(vehicle_id=first.id, x=0, y=0, length=1, width=1)]
    result = steepest_ascent(config, initial, max_iterations=10)
    assert result.initial_arrangement == initial
    assert result.final_arrangement[0].vehicle_id == second.id
    assert result.initial_objective == 10
    assert result.final_objective == 30
    assert [point.objective for point in result.objective_history] == [10, 30, 30]
    assert result.iterations_completed == 2
    assert result.stop_reason == "local_optimum"
    assert result.unloaded_vehicle_ids == [first.id]
    assert result.runtime_ms >= 0
    assert result.neighbors_evaluated is not None and result.neighbors_evaluated > 0
    assert validate_arrangement(config, result.final_arrangement) == []
    assert initial[0].vehicle_id == first.id


def test_reports_iteration_limit_and_handles_empty_arrangement() -> None:
    vehicle = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10)
    config = ConfigModel(ship=Ship(length=1, width=1, max_weight=1), vehicles=[vehicle])
    result = steepest_ascent(config, [], max_iterations=1)
    assert result.stop_reason == "iteration_limit"
    assert result.iterations_completed == 1
    assert result.initial_arrangement == []
    assert result.final_objective == 10
    config.vehicles = []
    empty = steepest_ascent(config, [], max_iterations=10)
    assert empty.final_arrangement == []
    assert empty.stop_reason == "local_optimum"
    assert empty.iterations_completed == 1
