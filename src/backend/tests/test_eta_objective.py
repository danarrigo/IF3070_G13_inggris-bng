import hashlib
import json

from algorithms.hill_climbing import steepest_ascent
from algorithms.objective import calculate_objective
from models.config import ConfigModel, Ship, Vehicle
from models.run import VehiclePlacement
from services.run_service import hash_config


def scenario():
    vehicles = [
        Vehicle(length=1, width=1, weight=1, eta=10, shipping_fee=1000),
        Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=1),
    ]
    config = ConfigModel(ship=Ship(length=1, width=1, max_weight=1), vehicles=vehicles)
    states = [
        [VehiclePlacement(vehicle_id=vehicle.id, x=0, y=0, length=1, width=1)]
        for vehicle in vehicles
    ]
    return config, states


def test_eta_only_prioritizes_smaller_eta_and_ignores_all_shipping_fees():
    config, states = scenario()
    assert calculate_objective(config, states[0]) == 1000
    config.objective_mode = "eta_priority"
    assert calculate_objective(config, states[0]) == 1
    assert calculate_objective(config, states[1]) == 11
    assert calculate_objective(config, []) == 0
    result = steepest_ascent(config, states[0])
    assert result.final_arrangement == states[1]
    assert result.final_objective == 11
    config.vehicles[0].shipping_fee = 9999999
    config.vehicles[1].shipping_fee = 0
    assert calculate_objective(config, states[0]) == 1
    assert calculate_objective(config, states[1]) == 11
    config.vehicles[0].eta = 0
    assert (
        calculate_objective(config, states[0])
        == calculate_objective(config, states[1])
        == 1
    )


def test_objective_mode_is_saved_and_does_not_change_legacy_fee_hashes():
    config, _ = scenario()
    legacy = config.model_dump(mode="json", exclude={"objective_mode"})
    digest = hashlib.sha256(
        json.dumps(legacy, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    assert hash_config(config) == digest
    assert ConfigModel.model_validate(legacy).objective_mode == "shipping_fee"
    config.objective_mode = "eta_priority"
    assert hash_config(config) != digest
    assert (
        ConfigModel.model_validate(config.model_dump()).objective_mode == "eta_priority"
    )
