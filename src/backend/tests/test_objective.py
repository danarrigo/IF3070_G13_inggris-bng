from uuid import uuid4

import pytest

from algorithms.objective import calculate_objective
from models.config import ConfigModel, Ship, Vehicle
from models.run import VehiclePlacement


def test_sums_only_shipping_fees_of_loaded_vehicles() -> None:
    first = Vehicle(length=2, width=1, weight=100, eta=0, shipping_fee=70)
    second = Vehicle(length=2, width=1, weight=100, eta=0, shipping_fee=130)
    config = ConfigModel(
        ship=Ship(length=10, width=10, max_weight=1000), vehicles=[first, second]
    )
    placement = VehiclePlacement(vehicle_id=second.id, x=0, y=0, length=2, width=1)
    assert calculate_objective(config, [placement]) == 130
    assert calculate_objective(config, []) == 0
    assert (
        calculate_objective(
            config,
            [
                VehiclePlacement(vehicle_id=first.id, x=1, y=0, length=2, width=1),
                placement,
            ],
        )
        == 200
    )


def test_rejects_duplicate_or_unknown_placements() -> None:
    vehicle = Vehicle(length=2, width=1, weight=100, eta=0, shipping_fee=70)
    config = ConfigModel(
        ship=Ship(length=10, width=10, max_weight=1000), vehicles=[vehicle]
    )
    placement = VehiclePlacement(vehicle_id=vehicle.id, x=0, y=0, length=2, width=1)
    with pytest.raises(ValueError, match="more than once"):
        calculate_objective(config, [placement, placement])
    with pytest.raises(ValueError, match="Unknown vehicle"):
        calculate_objective(
            config, [placement.model_copy(update={"vehicle_id": uuid4()})]
        )
    config.vehicles.append(vehicle.model_copy())
    with pytest.raises(ValueError, match="Duplicate vehicle ID"):
        calculate_objective(config, [])
