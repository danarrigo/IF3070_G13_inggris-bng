from random import Random
from uuid import uuid4

import pytest

from algorithms.neighbors import (
    load_vehicle,
    move_vehicle,
    random_neighbor,
    rotate_vehicle,
    unload_vehicle,
)
from algorithms.validation import validate_arrangement
from models.config import ConfigModel, Ship, Vehicle
from models.run import VehiclePlacement


def setup_state() -> tuple[ConfigModel, list[VehiclePlacement]]:
    first = Vehicle(length=3, width=2, weight=40, eta=0, shipping_fee=50)
    second = Vehicle(length=2, width=1, weight=60, eta=0, shipping_fee=100)
    config = ConfigModel(
        ship=Ship(length=10, width=8, max_weight=100), vehicles=[first, second]
    )
    return config, [VehiclePlacement(vehicle_id=first.id, x=0, y=0, length=3, width=2)]


def test_move_rotate_load_and_unload_produce_independent_valid_states() -> None:
    config, state = setup_state()
    vehicle_id = state[0].vehicle_id
    moved = move_vehicle(config, state, vehicle_id, x=1, y=2)
    rotated = rotate_vehicle(config, state, vehicle_id)
    loaded = load_vehicle(config, state, config.vehicles[1].id, x=3, y=0, rotated=True)
    unloaded = unload_vehicle(config, state, vehicle_id)
    assert moved is not None and (moved[0].x, moved[0].y) == (1, 2)
    assert rotated is not None and (rotated[0].length, rotated[0].width) == (2, 3)
    assert loaded is not None and (loaded[1].length, loaded[1].width) == (1, 2)
    assert unloaded == []
    for candidate in [moved, rotated, loaded, unloaded]:
        assert validate_arrangement(config, candidate) == []
    loaded[0].x = 7
    assert state[0].x == 0


def test_invalid_or_unchanged_operations_return_none() -> None:
    config, state = setup_state()
    first = state[0].vehicle_id
    second = config.vehicles[1].id
    assert move_vehicle(config, state, first, x=0, y=0) is None
    assert move_vehicle(config, state, first, x=-1, y=0) is None
    assert move_vehicle(config, state, first, x=8, y=0) is None
    assert move_vehicle(config, state, uuid4(), x=1, y=0) is None
    assert load_vehicle(config, state, second, x=0, y=0) is None
    assert load_vehicle(config, state, first, x=4, y=0) is None
    assert unload_vehicle(config, state, second) is None
    config.ship.max_weight = 40
    assert load_vehicle(config, state, second, x=4, y=0) is None


def test_rejects_rotation_that_no_longer_fits() -> None:
    config, state = setup_state()
    config.ship.width = 2
    assert rotate_vehicle(config, state, state[0].vehicle_id) is None


def test_random_neighbors_are_seeded_valid_changed_and_do_not_mutate_input() -> None:
    config, state = setup_state()
    before = [item.model_dump() for item in state]
    assert random_neighbor(config, state, Random(42)) == random_neighbor(
        config, state, Random(42)
    )
    generated = []
    for seed in range(30):
        candidate = random_neighbor(config, state, Random(seed))
        if candidate is not None:
            assert candidate != state
            assert validate_arrangement(config, candidate) == []
            generated.append(candidate)
    assert generated
    assert [item.model_dump() for item in state] == before


def test_random_neighbor_can_load_from_an_empty_arrangement() -> None:
    config, _ = setup_state()
    candidate = random_neighbor(config, [], Random(7))
    assert candidate is not None and len(candidate) == 1
    assert validate_arrangement(config, candidate) == []


def test_no_neighbor_when_every_unloaded_vehicle_is_too_large() -> None:
    config, _ = setup_state()
    config.ship.length = 1
    config.ship.width = 1
    assert random_neighbor(config, [], Random(7), max_attempts=3) is None


def test_square_rotation_and_unknown_vehicle_operations_are_rejected() -> None:
    config, state = setup_state()
    config.vehicles[0].width = 3
    state[0].width = 3
    assert rotate_vehicle(config, state, state[0].vehicle_id) is None
    assert rotate_vehicle(config, state, uuid4()) is None
    assert load_vehicle(config, state, uuid4(), x=0, y=0) is None
    assert unload_vehicle(config, state, uuid4()) is None


def test_no_neighbor_and_bad_attempt_limit() -> None:
    config, _ = setup_state()
    config.vehicles = []
    assert random_neighbor(config, [], Random(1)) is None
    with pytest.raises(ValueError, match="positive"):
        random_neighbor(config, [], Random(1), max_attempts=0)


def test_random_neighbor_rejects_invalid_source_arrangement() -> None:
    config, state = setup_state()
    state[0].x = 100
    with pytest.raises(ValueError, match="bounds"):
        random_neighbor(config, state, Random(1))
