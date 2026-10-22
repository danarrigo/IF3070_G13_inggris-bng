from itertools import combinations

from pymongo.database import Database

from algorithms.neighbors import (
    load_vehicle,
    move_vehicle,
    rotate_vehicle,
    swap_vehicles,
)
from algorithms.validation import validate_arrangement
from models.config import ConfigModel
from models.run import VehiclePlacement
from services.run_service import prepare_run


def generate_neighbors(
    current_state: list[VehiclePlacement], config: ConfigModel
) -> list[list[VehiclePlacement]]:
    errors = validate_arrangement(config, current_state)
    if errors:
        raise ValueError("; ".join(errors))

    neighbors: list[list[VehiclePlacement]] = []
    loaded_ids = {vehicle.vehicle_id for vehicle in current_state}

    for vehicle in current_state:
        for x in range(config.ship.width - vehicle.width + 1):
            for y in range(config.ship.length - vehicle.length + 1):
                neighbor = move_vehicle(
                    config, current_state, vehicle.vehicle_id, x=x, y=y
                )
                if neighbor is not None:
                    neighbors.append(neighbor)

        neighbor = rotate_vehicle(config, current_state, vehicle.vehicle_id)
        if neighbor is not None:
            neighbors.append(neighbor)

        neighbor = move_vehicle(
            config, current_state, vehicle.vehicle_id, x=None, y=None
        )
        if neighbor is not None:
            neighbors.append(neighbor)

    for first, second in combinations(config.vehicles, 2):
        if first.id not in loaded_ids and second.id not in loaded_ids:
            continue
        neighbor = swap_vehicles(config, current_state, first.id, second.id)
        if neighbor is not None:
            neighbors.append(neighbor)

    for vehicle in config.vehicles:
        if vehicle.id in loaded_ids:
            continue
        for rotated in (False, True):
            if rotated and vehicle.length == vehicle.width:
                continue
            length = vehicle.width if rotated else vehicle.length
            width = vehicle.length if rotated else vehicle.width
            for x in range(config.ship.width - width + 1):
                for y in range(config.ship.length - length + 1):
                    neighbor = load_vehicle(
                        config,
                        current_state,
                        vehicle.id,
                        x=x,
                        y=y,
                        rotated=rotated,
                    )
                    if neighbor is not None:
                        neighbors.append(neighbor)

    return neighbors


def hill_climbing(db: Database[dict[str, object]], random_seed: int = 42):
    prepared_run = prepare_run(db, random_seed=random_seed)
    current: list[VehiclePlacement] = prepared_run.initial_arrangement
    current_obj: int = prepared_run.initial_objective
