from collections import Counter
from collections.abc import Sequence
from itertools import combinations
from uuid import UUID

from models.config import ConfigModel
from models.run import VehiclePlacement


def validate_arrangement(
    config: ConfigModel, placements: Sequence[VehiclePlacement]
) -> list[str]:
    """Validate a candidate arrangement without changing it. No errors means valid.

    Coordinates are top-left origins: width extends along X, length along Y.
    Vehicles absent from placements are unloaded.
    """
    counts = Counter(vehicle.id for vehicle in config.vehicles)
    errors = [
        f"Duplicate vehicle ID {vehicle_id} in config."
        for vehicle_id, count in counts.items()
        if count > 1
    ]
    if errors:
        return errors

    vehicles = {vehicle.id: vehicle for vehicle in config.vehicles}
    seen: set[UUID] = set()
    unique_placements: list[VehiclePlacement] = []
    for placement in placements:
        if placement.vehicle_id not in counts:
            errors.append(f"Unknown vehicle {placement.vehicle_id}.")
            continue
        if placement.vehicle_id in seen:
            errors.append(f"Vehicle {placement.vehicle_id} is placed more than once.")
            continue
        seen.add(placement.vehicle_id)
        vehicle = vehicles[placement.vehicle_id]
        if (placement.length, placement.width) not in {
            (vehicle.length, vehicle.width),
            (vehicle.width, vehicle.length),
        }:
            errors.append(
                f"Vehicle {placement.vehicle_id} dimensions must match its original or rotated size."
            )
            continue
        unique_placements.append(placement)
        if (
            placement.x < 0
            or placement.y < 0
            or placement.x + placement.width > config.ship.width
            or placement.y + placement.length > config.ship.length
        ):
            errors.append(f"Vehicle {placement.vehicle_id} is outside ship bounds.")
    for first, second in combinations(unique_placements, 2):
        if placements_overlap(first, second):
            errors.append(
                f"Vehicles {first.vehicle_id} and {second.vehicle_id} overlap."
            )
    loaded_ids = {placement.vehicle_id for placement in placements}
    total_weight = sum(
        vehicle.weight for vehicle in config.vehicles if vehicle.id in loaded_ids
    )
    if total_weight > config.ship.max_weight:
        errors.append(
            f"Loaded weight {total_weight} exceeds ship capacity {config.ship.max_weight}."
        )
    return errors


def placements_overlap(first: VehiclePlacement, second: VehiclePlacement) -> bool:
    """Touching edges/corners are not overlap."""
    return (
        first.x < second.x + second.width
        and second.x < first.x + first.width
        and first.y < second.y + second.length
        and second.y < first.y + first.length
    )


def validate_initial_arrangement(config: ConfigModel) -> list[str]:
    """Check config positions; a vehicle with neither coordinate is unplaced."""
    errors: list[str] = []
    placements: list[VehiclePlacement] = []
    for vehicle in config.vehicles:
        if vehicle.x is None and vehicle.y is None:
            continue
        if vehicle.x is None or vehicle.y is None:
            errors.append(
                f"Vehicle {vehicle.id} must have both X and Y or neither coordinate."
            )
            continue
        placements.append(
            VehiclePlacement(
                vehicle_id=vehicle.id,
                x=vehicle.x,
                y=vehicle.y,
                length=vehicle.length,
                width=vehicle.width,
            )
        )
    return errors + validate_arrangement(config, placements)
