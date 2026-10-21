from random import Random

import pytest

from algorithms.initialization import initialize_arrangement
from algorithms.validation import validate_arrangement
from models.config import ConfigModel, Ship, Vehicle


def make_vehicle(**changes: int) -> Vehicle:
    return Vehicle.model_validate(
        {"length": 2, "width": 1, "weight": 10, "eta": 0, "shipping_fee": 50, **changes}
    )


def test_seeded_initialization_is_valid_reproducible_and_does_not_mutate_config() -> (
    None
):
    config = ConfigModel(
        ship=Ship(length=10, width=8, max_weight=100),
        vehicles=[make_vehicle() for _ in range(8)],
    )
    before = config.model_dump()
    first = initialize_arrangement(config, Random(42))
    assert first == initialize_arrangement(config, Random(42))
    assert validate_arrangement(config, first) == []
    assert config.model_dump() == before
    assert len(first) == 8
    positions = {
        tuple(
            (item.x, item.y, item.length, item.width)
            for item in initialize_arrangement(config, Random(seed))
        )
        for seed in range(5)
    }
    assert len(positions) > 1


def test_preserves_user_placements_and_can_only_fit_another_vehicle_rotated() -> None:
    fixed = make_vehicle(length=1, width=2, x=0, y=0)
    pending = make_vehicle(length=2, width=1)
    config = ConfigModel(
        ship=Ship(length=2, width=2, max_weight=20), vehicles=[fixed, pending]
    )
    result = initialize_arrangement(config, Random(4), preserve_positions=True)
    assert len(result) == 2
    assert (result[0].vehicle_id, result[0].x, result[0].y) == (fixed.id, 0, 0)
    assert (result[1].length, result[1].width, result[1].x, result[1].y) == (1, 2, 0, 1)


def test_leaves_oversized_overweight_and_blocked_vehicles_unloaded() -> None:
    fits = make_vehicle(length=1, width=1)
    blocked = make_vehicle(length=1, width=1)
    oversized = make_vehicle(length=3, width=3)
    overweight = make_vehicle(length=1, width=1, weight=100)
    config = ConfigModel(
        ship=Ship(length=1, width=1, max_weight=20),
        vehicles=[fits, blocked, oversized, overweight],
    )
    result = initialize_arrangement(config, Random(8), max_attempts_per_vehicle=3)
    assert len(result) == 1
    assert result[0].vehicle_id in {fits.id, blocked.id}
    assert validate_arrangement(config, result) == []


def test_rejects_invalid_existing_placements_and_attempt_limit() -> None:
    config = ConfigModel(
        ship=Ship(length=2, width=2, max_weight=100), vehicles=[make_vehicle(x=0)]
    )
    with pytest.raises(ValueError, match="both X and Y"):
        initialize_arrangement(config, Random(1), preserve_positions=True)
    with pytest.raises(ValueError, match="positive"):
        initialize_arrangement(config, Random(1), max_attempts_per_vehicle=0)


def test_default_randomizes_even_explicit_positions() -> None:
    vehicle = make_vehicle(x=0, y=0)
    config = ConfigModel(
        ship=Ship(length=10, width=8, max_weight=100), vehicles=[vehicle]
    )
    positions = {
        (state[0].x, state[0].y)
        for seed in range(10)
        if (state := initialize_arrangement(config, Random(seed)))
    }
    assert len(positions) > 1
    assert (vehicle.x, vehicle.y) == (0, 0)
    assert initialize_arrangement(config, Random(1), preserve_positions=True)[0].x == 0


def test_empty_config_initializes_to_an_empty_arrangement() -> None:
    config = ConfigModel(ship=Ship(length=2, width=2, max_weight=100), vehicles=[])
    assert initialize_arrangement(config, Random(1)) == []
