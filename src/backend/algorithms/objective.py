from collections.abc import Sequence
from uuid import UUID

from models.config import ConfigModel
from models.run import VehiclePlacement


def calculate_objective(
    config: ConfigModel, placements: Sequence[VehiclePlacement]
) -> int:
    """Score loaded vehicles using the selected objective; validate feasibility separately."""
    vehicles = {vehicle.id: vehicle for vehicle in config.vehicles}
    if len(vehicles) != len(config.vehicles):
        raise ValueError("Duplicate vehicle ID in config.")
    maximum_eta = max((vehicle.eta for vehicle in config.vehicles), default=0)
    loaded_ids: set[UUID] = set()
    total = 0
    for placement in placements:
        vehicle = vehicles.get(placement.vehicle_id)
        if vehicle is None:
            raise ValueError(f"Unknown vehicle {placement.vehicle_id}.")
        if vehicle.id in loaded_ids:
            raise ValueError(f"Vehicle {vehicle.id} is placed more than once.")
        loaded_ids.add(vehicle.id)
        total += (
            maximum_eta + 1 - vehicle.eta
            if config.objective_mode == "eta_priority"
            else vehicle.shipping_fee
        )
    return total
