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
    x: int,
    y: int,
) -> list[VehiclePlacement] | None:
    """Return a valid changed arrangement, or None. Never mutate the source."""
    placement = next(
        (item for item in placements if item.vehicle_id == vehicle_id), None
    )
    if placement is None or (placement.x, placement.y) == (x, y):
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
    """Sample moves, rotations, loads and unloads; moves change one grid cell.

    None means the attempt budget found no changed valid proposal, not that the
    current arrangement is optimal. Explicit user positions are only preserved
    during initialization; search operations may move any loaded vehicle.
    """
    if max_attempts <= 0:
        raise ValueError("max_attempts must be positive.")
    errors = validate_arrangement(config, placements)
    if errors:
        raise ValueError("; ".join(errors))
    loaded_ids = {item.vehicle_id for item in placements}
    unloaded = [vehicle for vehicle in config.vehicles if vehicle.id not in loaded_ids]
    actions: list[str] = []
    if placements:
        actions.extend(["move", "rotate", "unload"])
    if unloaded:
        actions.append("load")
    if not actions:
        return None
    for _ in range(max_attempts):
        action = rng.choice(actions)
        if action == "load":
            vehicle = rng.choice(unloaded)
            rotated = rng.choice([False, True])
            length = vehicle.width if rotated else vehicle.length
            width = vehicle.length if rotated else vehicle.width
            if length > config.ship.length or width > config.ship.width:
                continue
            candidate = load_vehicle(
                config,
                placements,
                vehicle.id,
                x=rng.randint(0, config.ship.width - width),
                y=rng.randint(0, config.ship.length - length),
                rotated=rotated,
            )
        else:
            placement = rng.choice(placements)
            if action == "move":
                dx, dy = rng.choice([(-1, 0), (1, 0), (0, -1), (0, 1)])
                candidate = move_vehicle(
                    config,
                    placements,
                    placement.vehicle_id,
                    x=placement.x + dx,
                    y=placement.y + dy,
                )
            elif action == "rotate":
                candidate = rotate_vehicle(config, placements, placement.vehicle_id)
            else:
                candidate = unload_vehicle(config, placements, placement.vehicle_id)
        if candidate is not None:
            return candidate
    return None
