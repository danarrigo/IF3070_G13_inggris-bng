from collections.abc import Sequence
from random import Random
from uuid import UUID

from algorithms.validation import validate_arrangement
from models.config import ConfigModel
from models.run import VehiclePlacement


def _accept(
    config: ConfigModel, candidate: list[VehiclePlacement]
) -> list[VehiclePlacement] | None:
    if validate_arrangement(config, candidate):
        return None
    return [placement.model_copy(deep=True) for placement in candidate]


def move_vehicle(
    config: ConfigModel,
    placements: Sequence[VehiclePlacement],
    vehicle_id: UUID,
    *,
    x: int | None,
    y: int | None,
) -> list[VehiclePlacement] | None:
    """Move to any deck coordinate, or outside with (None, None).

    Loading/unloading are moves across the deck boundary, not separate sampled
    neighbor categories. The original state is never mutated.
    """
    if (x is None) != (y is None):
        return None
    if x is None or y is None:
        return unload_vehicle(config, placements, vehicle_id)
    placement = next(
        (item for item in placements if item.vehicle_id == vehicle_id), None
    )
    if placement is None:
        return load_vehicle(config, placements, vehicle_id, x=x, y=y)
    if (placement.x, placement.y) == (x, y):
        return None
    return _accept(
        config,
        [
            item.model_copy(update={"x": x, "y": y})
            if item.vehicle_id == vehicle_id
            else item
            for item in placements
        ],
    )


def rotate_vehicle(
    config: ConfigModel,
    placements: Sequence[VehiclePlacement],
    vehicle_id: UUID,
) -> list[VehiclePlacement] | None:
    placement = next(
        (item for item in placements if item.vehicle_id == vehicle_id), None
    )
    if placement is None or placement.length == placement.width:
        return None
    return _accept(
        config,
        [
            item.model_copy(update={"length": item.width, "width": item.length})
            if item.vehicle_id == vehicle_id
            else item
            for item in placements
        ],
    )


def swap_vehicles(
    config: ConfigModel,
    placements: Sequence[VehiclePlacement],
    first_id: UUID,
    second_id: UUID,
) -> list[VehiclePlacement] | None:
    """Exchange top-left anchors or loaded membership, retaining orientations.

    Two unloaded vehicles have no positions in this representation; their swap
    is a no-op. A loaded/unloaded swap uses the incoming vehicle's config size.
    All changes are validated atomically, including weight and other vehicles.
    """
    vehicles = {vehicle.id: vehicle for vehicle in config.vehicles}
    if first_id == second_id or first_id not in vehicles or second_id not in vehicles:
        return None
    by_id = {item.vehicle_id: item for item in placements}
    first, second = by_id.get(first_id), by_id.get(second_id)
    if first is None and second is None:
        return None
    if first is not None and second is not None:
        return _accept(
            config,
            [
                item.model_copy(update={"x": second.x, "y": second.y})
                if item.vehicle_id == first_id
                else item.model_copy(update={"x": first.x, "y": first.y})
                if item.vehicle_id == second_id
                else item
                for item in placements
            ],
        )
    loaded = first if first is not None else second
    if loaded is None:
        return None
    incoming_id = second_id if first is not None else first_id
    incoming = vehicles[incoming_id]
    replacement = VehiclePlacement(
        vehicle_id=incoming_id,
        x=loaded.x,
        y=loaded.y,
        length=incoming.length,
        width=incoming.width,
    )
    return _accept(
        config,
        [
            replacement if item.vehicle_id == loaded.vehicle_id else item
            for item in placements
        ],
    )


def load_vehicle(
    config: ConfigModel,
    placements: Sequence[VehiclePlacement],
    vehicle_id: UUID,
    *,
    x: int,
    y: int,
    rotated: bool = False,
) -> list[VehiclePlacement] | None:
    if x < 0 or y < 0 or any(item.vehicle_id == vehicle_id for item in placements):
        return None
    vehicle = next((item for item in config.vehicles if item.id == vehicle_id), None)
    if vehicle is None:
        return None
    candidate = VehiclePlacement(
        vehicle_id=vehicle_id,
        x=x,
        y=y,
        length=vehicle.width if rotated else vehicle.length,
        width=vehicle.length if rotated else vehicle.width,
    )
    return _accept(config, [*placements, candidate])


def unload_vehicle(
    config: ConfigModel,
    placements: Sequence[VehiclePlacement],
    vehicle_id: UUID,
) -> list[VehiclePlacement] | None:
    if not any(item.vehicle_id == vehicle_id for item in placements):
        return None
    return _accept(
        config, [item for item in placements if item.vehicle_id != vehicle_id]
    )


def random_neighbor(
    config: ConfigModel,
    placements: Sequence[VehiclePlacement],
    rng: Random,
    *,
    max_attempts: int = 50,
) -> list[VehiclePlacement] | None:
    """Sample exactly one swap, move to any coordinate, or orientation change.

    Move destinations include outside the ship. None means the attempt budget
    found no changed valid proposal, not that the current state is optimal.
    """
    if max_attempts <= 0:
        raise ValueError("max_attempts must be positive.")
    errors = validate_arrangement(config, placements)
    if errors:
        raise ValueError("; ".join(errors))
    if not config.vehicles:
        return None
    by_id = {item.vehicle_id: item for item in placements}
    actions = ["move"]
    if len(config.vehicles) >= 2:
        actions.append("swap")
    if placements:
        actions.append("rotate")
    for _ in range(max_attempts):
        action = rng.choice(actions)
        if action == "swap":
            first, second = rng.sample(config.vehicles, 2)
            candidate = swap_vehicles(config, placements, first.id, second.id)
        elif action == "rotate":
            placement = rng.choice(placements)
            candidate = rotate_vehicle(config, placements, placement.vehicle_id)
        else:
            vehicle = rng.choice(config.vehicles)
            placement = by_id.get(vehicle.id)
            if placement is not None and rng.choice([False, True]):
                candidate = move_vehicle(config, placements, vehicle.id, x=None, y=None)
            else:
                # Unloaded orientation is not stored in placement-list states;
                # choose it on entry so rotated-only fits remain reachable.
                rotated = placement is None and rng.choice([False, True])
                length = (
                    placement.length
                    if placement is not None
                    else (vehicle.width if rotated else vehicle.length)
                )
                width = (
                    placement.width
                    if placement is not None
                    else (vehicle.length if rotated else vehicle.width)
                )
                if length > config.ship.length or width > config.ship.width:
                    continue
                x = rng.randint(0, config.ship.width - width)
                y = rng.randint(0, config.ship.length - length)
                if placement is None:
                    candidate = load_vehicle(
                        config, placements, vehicle.id, x=x, y=y, rotated=rotated
                    )
                else:
                    candidate = move_vehicle(config, placements, vehicle.id, x=x, y=y)
        if candidate is not None:
            return candidate
    return None
