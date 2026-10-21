from random import Random

from algorithms.validation import (
    placements_overlap,
    validate_arrangement,
    validate_initial_arrangement,
)
from models.config import ConfigModel, Vehicle
from models.run import VehiclePlacement


def initialize_arrangement(
    config: ConfigModel,
    rng: Random,
    *,
    max_attempts_per_vehicle: int = 100,
    preserve_positions: bool | None = None,
) -> list[VehiclePlacement]:
    """Generate the assignment's random initial state by default.

    The saved config flag selects custom-start mode; an explicit argument
    overrides it. Old configs default to random mode. Sampling is bounded: an unloaded vehicle may still have a feasible placement
    that was not sampled. This is an initial solution, not an optimal packing.
    The caller owns the RNG; neither config nor global random state is changed.
    """
    if max_attempts_per_vehicle <= 0:
        raise ValueError("max_attempts_per_vehicle must be positive.")
    if preserve_positions is None:
        preserve_positions = config.preserve_positions
    errors = (
        validate_initial_arrangement(config)
        if preserve_positions
        else validate_arrangement(config, [])
    )
    if errors:
        raise ValueError("; ".join(errors))

    placements: list[VehiclePlacement] = []
    pending: list[Vehicle] = []
    total_weight = 0
    for vehicle in config.vehicles:
        if preserve_positions and vehicle.x is not None and vehicle.y is not None:
            placements.append(
                VehiclePlacement(
                    vehicle_id=vehicle.id,
                    x=vehicle.x,
                    y=vehicle.y,
                    length=vehicle.length,
                    width=vehicle.width,
                )
            )
            total_weight += vehicle.weight
        else:
            pending.append(vehicle)
    rng.shuffle(pending)
    for vehicle in pending:
        if total_weight + vehicle.weight > config.ship.max_weight:
            continue
        orientations = [(vehicle.length, vehicle.width)]
        if vehicle.length != vehicle.width:
            orientations.append((vehicle.width, vehicle.length))
        orientations = [
            (length, width)
            for length, width in orientations
            if length <= config.ship.length and width <= config.ship.width
        ]
        if not orientations:
            continue
        for _ in range(max_attempts_per_vehicle):
            length, width = rng.choice(orientations)
            candidate = VehiclePlacement(
                vehicle_id=vehicle.id,
                x=rng.randint(0, config.ship.width - width),
                y=rng.randint(0, config.ship.length - length),
                length=length,
                width=width,
            )
            if not any(placements_overlap(candidate, other) for other in placements):
                placements.append(candidate)
                total_weight += vehicle.weight
                break
    return placements
