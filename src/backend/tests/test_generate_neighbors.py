import pytest

from algorithms.hill_climbing import generate_neighbors
from algorithms.validation import validate_arrangement
from models.config import ConfigModel, Ship, Vehicle
from models.run import VehiclePlacement


def key(state: list[VehiclePlacement]) -> tuple[tuple[str, int, int, int, int], ...]:
    return tuple(
        sorted(
            (str(item.vehicle_id), item.x, item.y, item.length, item.width)
            for item in state
        )
    )


def test_enumerates_moves_unload_load_and_loaded_unloaded_swap() -> None:
    first = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10)
    second = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=20)
    config = ConfigModel(
        ship=Ship(length=1, width=3, max_weight=2), vehicles=[first, second]
    )
    state = [VehiclePlacement(vehicle_id=first.id, x=0, y=0, length=1, width=1)]
    before = state[0].model_dump()
    neighbors = generate_neighbors(state, config)
    expected = {
        (),
        ((str(first.id), 1, 0, 1, 1),),
        ((str(first.id), 2, 0, 1, 1),),
        ((str(second.id), 0, 0, 1, 1),),
        tuple(sorted([(str(first.id), 0, 0, 1, 1), (str(second.id), 1, 0, 1, 1)])),
        tuple(sorted([(str(first.id), 0, 0, 1, 1), (str(second.id), 2, 0, 1, 1)])),
    }
    assert {key(candidate) for candidate in neighbors} == expected
    assert len(neighbors) == len(expected)
    assert all(validate_arrangement(config, candidate) == [] for candidate in neighbors)
    assert state[0].model_dump() == before


def test_loaded_loaded_swap_is_generated_once() -> None:
    first = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10)
    second = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10)
    config = ConfigModel(
        ship=Ship(length=1, width=2, max_weight=2), vehicles=[first, second]
    )
    state = [
        VehiclePlacement(vehicle_id=first.id, x=0, y=0, length=1, width=1),
        VehiclePlacement(vehicle_id=second.id, x=1, y=0, length=1, width=1),
    ]
    neighbors = generate_neighbors(state, config)
    swapped = tuple(sorted([(str(first.id), 1, 0, 1, 1), (str(second.id), 0, 0, 1, 1)]))
    assert [key(candidate) for candidate in neighbors].count(swapped) == 1
    assert len(neighbors) == 3  # One swap and two unloads.


def test_loads_a_vehicle_that_only_fits_rotated() -> None:
    vehicle = Vehicle(length=2, width=1, weight=1, eta=0, shipping_fee=10)
    config = ConfigModel(ship=Ship(length=1, width=2, max_weight=1), vehicles=[vehicle])
    neighbors = generate_neighbors([], config)
    assert len(neighbors) == 1
    placement = neighbors[0][0]
    assert (placement.length, placement.width, placement.x, placement.y) == (1, 2, 0, 0)


def test_rotates_loaded_vehicle_and_rejects_excess_weight() -> None:
    vehicle = Vehicle(length=2, width=1, weight=1, eta=0, shipping_fee=10)
    other = Vehicle(length=1, width=1, weight=2, eta=0, shipping_fee=10)
    config = ConfigModel(
        ship=Ship(length=2, width=2, max_weight=1), vehicles=[vehicle, other]
    )
    state = [VehiclePlacement(vehicle_id=vehicle.id, x=0, y=0, length=2, width=1)]
    neighbors = generate_neighbors(state, config)
    assert any(
        candidate and (candidate[0].length, candidate[0].width) == (1, 2)
        for candidate in neighbors
    )
    assert all(
        item.vehicle_id != other.id for candidate in neighbors for item in candidate
    )


def test_rejects_invalid_source_and_empty_config_has_no_neighbors() -> None:
    config = ConfigModel(ship=Ship(length=1, width=1, max_weight=1), vehicles=[])
    assert generate_neighbors([], config) == []
    vehicle = Vehicle(length=2, width=1, weight=1, eta=0, shipping_fee=10)
    config.vehicles.append(vehicle)
    state = [VehiclePlacement(vehicle_id=vehicle.id, x=0, y=0, length=2, width=1)]
    with pytest.raises(ValueError, match="bounds"):
        generate_neighbors(state, config)
