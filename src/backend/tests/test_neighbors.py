from random import Random
from uuid import uuid4

import pytest

from algorithms.neighbors import (
    load_vehicle,
    move_vehicle,
    random_neighbor,
    rotate_vehicle,
    swap_vehicles,
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


def test_swap_loaded_vehicles_exchanges_positions_atomically() -> None:
    config, state = setup_state()
    state.append(
        VehiclePlacement(vehicle_id=config.vehicles[1].id, x=4, y=0, length=2, width=1)
    )
    before = [item.model_dump() for item in state]
    swapped = swap_vehicles(config, state, state[0].vehicle_id, state[1].vehicle_id)
    assert swapped is not None
    by_id = {item.vehicle_id: item for item in swapped}
    assert (by_id[state[0].vehicle_id].x, by_id[state[0].vehicle_id].y) == (4, 0)
    assert (by_id[state[1].vehicle_id].x, by_id[state[1].vehicle_id].y) == (0, 0)
    assert validate_arrangement(config, swapped) == []
    assert [item.model_dump() for item in state] == before


def test_swap_loaded_with_unloaded_exchanges_membership_and_weight_atomically() -> None:
    config, state = setup_state()
    # Loading first would exceed capacity, but replacing the old vehicle fits.
    config.ship.max_weight = 60
    incoming = config.vehicles[1].id
    for first, second in [
        (state[0].vehicle_id, incoming),
        (incoming, state[0].vehicle_id),
    ]:
        swapped = swap_vehicles(config, state, first, second)
        assert swapped is not None and len(swapped) == 1
        assert swapped[0].vehicle_id == incoming
        assert (swapped[0].x, swapped[0].y) == (0, 0)
        assert validate_arrangement(config, swapped) == []


def test_rejects_invalid_or_unchanged_swaps() -> None:
    config, state = setup_state()
    first, second = config.vehicles
    assert swap_vehicles(config, state, first.id, first.id) is None
    assert swap_vehicles(config, state, first.id, uuid4()) is None
    assert swap_vehicles(config, [], first.id, second.id) is None
    config.ship.max_weight = 40
    assert swap_vehicles(config, state, first.id, second.id) is None
    config.ship.max_weight = 100
    state[0].x = 6  # First fits, but its replacement is made too wide below.
    second.width = 3
    assert swap_vehicles(config, state, first.id, second.id) is None


def test_swap_rejects_collision_with_a_third_vehicle() -> None:
    config, state = setup_state()
    second = config.vehicles[1]
    third = Vehicle(length=2, width=1, weight=1, eta=0, shipping_fee=1)
    config.vehicles.append(third)
    config.ship.max_weight = 101
    state.extend(
        [
            VehiclePlacement(vehicle_id=second.id, x=4, y=0, length=2, width=1),
            VehiclePlacement(vehicle_id=third.id, x=5, y=0, length=2, width=1),
        ]
    )
    assert validate_arrangement(config, state) == []
    assert swap_vehicles(config, state, state[0].vehicle_id, second.id) is None


def test_random_neighbor_samples_atomic_swaps() -> None:
    config, state = setup_state()
    state.append(
        VehiclePlacement(vehicle_id=config.vehicles[1].id, x=4, y=0, length=2, width=1)
    )
    expected = swap_vehicles(config, state, state[0].vehicle_id, state[1].vehicle_id)
    assert expected is not None
    assert any(
        random_neighbor(config, state, Random(seed), max_attempts=1) == expected
        for seed in range(100)
    )


def test_random_move_can_load_a_vehicle_that_only_fits_rotated() -> None:
    config, _ = setup_state()
    config.vehicles = [config.vehicles[0]]
    config.ship.length = 2
    config.ship.width = 3
    candidate = random_neighbor(config, [], Random(7))
    assert candidate is not None
    assert (candidate[0].length, candidate[0].width) == (2, 3)
    assert validate_arrangement(config, candidate) == []


def test_random_moves_can_travel_more_than_one_cell() -> None:
    config, state = setup_state()
    config.vehicles = config.vehicles[:1]
    distant_moves = []
    for seed in range(100):
        candidate = random_neighbor(config, state, Random(seed), max_attempts=1)
        if candidate and len(candidate) == 1:
            item = candidate[0]
            if (item.length, item.width) == (state[0].length, state[0].width):
                distant_moves.append(
                    abs(item.x - state[0].x) + abs(item.y - state[0].y)
                )
    assert distant_moves and max(distant_moves) > 1


def test_move_can_change_loaded_membership_without_changing_orientation() -> None:
    config, state = setup_state()
    vehicle_id = state[0].vehicle_id
    assert move_vehicle(config, state, vehicle_id, x=None, y=None) == []
    loaded = move_vehicle(config, [], vehicle_id, x=4, y=3)
    assert loaded is not None and (loaded[0].x, loaded[0].y) == (4, 3)
    assert (loaded[0].length, loaded[0].width) == (3, 2)
    assert move_vehicle(config, state, vehicle_id, x=None, y=0) is None


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
