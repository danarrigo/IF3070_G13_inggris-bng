from uuid import uuid4

import pytest

from algorithms.validation import validate_arrangement, validate_initial_arrangement
from models.config import ConfigModel, Ship, Vehicle
from models.run import VehiclePlacement


def make_config() -> ConfigModel:
    return ConfigModel(
        ship=Ship(length=10, width=8, max_weight=100),
        vehicles=[
            Vehicle(length=3, width=2, weight=40, eta=0, shipping_fee=50),
            Vehicle(length=2, width=1, weight=60, eta=0, shipping_fee=100),
        ],
    )


def place(vehicle: Vehicle, x: int = 0, y: int = 0) -> VehiclePlacement:
    return VehiclePlacement(
        vehicle_id=vehicle.id,
        x=x,
        y=y,
        length=vehicle.length,
        width=vehicle.width,
    )


@pytest.mark.parametrize(("x", "y"), [(7, 0), (0, 8)])
def test_rejects_vehicles_extending_past_either_ship_edge(x: int, y: int) -> None:
    config = make_config()
    errors = validate_arrangement(config, [place(config.vehicles[0], x, y)])
    assert len(errors) == 1
    assert "outside ship bounds" in errors[0]


@pytest.mark.parametrize(("x", "y"), [(1, 2), (0, 0)])
def test_rejects_partial_overlap_and_containment(x: int, y: int) -> None:
    config = make_config()
    errors = validate_arrangement(
        config, [place(config.vehicles[0]), place(config.vehicles[1], x, y)]
    )
    assert len(errors) == 1
    assert "overlap" in errors[0]


@pytest.mark.parametrize(("x", "y"), [(2, 0), (0, 3), (2, 3)])
def test_allows_touching_edges_and_corners(x: int, y: int) -> None:
    config = make_config()
    assert (
        validate_arrangement(
            config, [place(config.vehicles[0]), place(config.vehicles[1], x, y)]
        )
        == []
    )


def test_counts_only_loaded_vehicle_weight() -> None:
    config = make_config()
    config.ship.max_weight = 40
    assert validate_arrangement(config, [place(config.vehicles[0])]) == []
    assert validate_arrangement(config, []) == []


def test_rejects_weight_above_capacity() -> None:
    config = make_config()
    config.ship.max_weight = 99
    errors = validate_arrangement(
        config, [place(config.vehicles[0]), place(config.vehicles[1], 3, 0)]
    )
    assert len(errors) == 1
    assert "weight" in errors[0]


def test_rejects_unknown_vehicle_ids() -> None:
    config = make_config()
    placement = place(config.vehicles[0]).model_copy(update={"vehicle_id": uuid4()})
    errors = validate_arrangement(config, [placement])
    assert len(errors) == 1
    assert "Unknown vehicle" in errors[0]


def test_rejects_duplicate_placements_even_when_they_do_not_overlap() -> None:
    config = make_config()
    errors = validate_arrangement(
        config, [place(config.vehicles[0]), place(config.vehicles[0], 3, 0)]
    )
    assert len(errors) == 1
    assert "placed more than once" in errors[0]


def test_rejects_duplicate_vehicle_ids_in_config() -> None:
    config = make_config()
    config.vehicles.append(config.vehicles[0].model_copy())
    errors = validate_arrangement(config, [])
    assert len(errors) == 1
    assert "Duplicate vehicle ID" in errors[0]


def test_accepts_rotation_by_swapping_length_and_width() -> None:
    config = make_config()
    vehicle = config.vehicles[0]
    rotated = place(vehicle).model_copy(
        update={"length": vehicle.width, "width": vehicle.length}
    )
    assert validate_arrangement(config, [rotated]) == []


@pytest.mark.parametrize(("length", "width"), [(1, 1), (3, 3), (6, 1)])
def test_rejects_resizing_instead_of_rotation(length: int, width: int) -> None:
    config = make_config()
    placement = place(config.vehicles[0]).model_copy(
        update={"length": length, "width": width}
    )
    errors = validate_arrangement(config, [placement])
    assert len(errors) == 1
    assert "dimensions" in errors[0]


def test_initial_arrangement_allows_unplaced_vehicles() -> None:
    config = make_config()
    config.vehicles[0].x = 0
    config.vehicles[0].y = 0
    config.ship.max_weight = 40
    assert validate_initial_arrangement(config) == []


@pytest.mark.parametrize(("x", "y"), [(0, None), (None, 0)])
def test_initial_arrangement_requires_both_coordinates(
    x: int | None, y: int | None
) -> None:
    config = make_config()
    config.vehicles[0].x = x
    config.vehicles[0].y = y
    errors = validate_initial_arrangement(config)
    assert len(errors) == 1
    assert "both X and Y" in errors[0]


def test_initial_arrangement_uses_the_same_collision_checks() -> None:
    config = make_config()
    for vehicle in config.vehicles:
        vehicle.x = 0
        vehicle.y = 0
    errors = validate_initial_arrangement(config)
    assert len(errors) == 1
    assert "overlap" in errors[0]


def test_validation_does_not_mutate_inputs() -> None:
    config = make_config()
    placements = [place(config.vehicles[0])]
    before_config = config.model_dump()
    before_placements = [placement.model_dump() for placement in placements]
    assert validate_arrangement(config, placements) == []
    assert validate_initial_arrangement(config) == []
    assert config.model_dump() == before_config
    assert [placement.model_dump() for placement in placements] == before_placements


def test_accepts_a_vehicle_at_origin_fitting_exactly_inside_ship() -> None:
    vehicle = Vehicle(length=7, width=2, weight=100, eta=0, shipping_fee=50)
    config = ConfigModel(
        ship=Ship(length=7, width=2, max_weight=100), vehicles=[vehicle]
    )
    placement = VehiclePlacement(vehicle_id=vehicle.id, x=0, y=0, length=7, width=2)

    assert validate_arrangement(config, [placement]) == []
