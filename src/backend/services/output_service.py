import json
import math
from collections.abc import Sequence
from html import escape
from pathlib import Path
from tempfile import TemporaryDirectory

from algorithms.objective import calculate_objective
from models.run import RunModel, VehiclePlacement

OUTPUT_ROOT = Path(__file__).resolve().parents[3] / "output"


class OutputExportError(RuntimeError):
    pass


def _svg(title: str, width: int, height: int, content: list[str]) -> str:
    return "\n".join(
        [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{escape(title, quote=True)}">',
            '<rect width="100%" height="100%" fill="white"/>',
            '<g font-family="sans-serif" font-size="12" fill="#263c35">',
            f'<text x="24" y="28" font-size="17">{escape(title)}</text>',
            *content,
            "</g></svg>",
        ]
    )


def _chart(
    title: str,
    series: Sequence[tuple[str, Sequence[tuple[int, float | None]]]],
    unit: str,
    x_label: str = "Iteration",
) -> str:
    values = [
        (x, y)
        for _, points in series
        for x, y in points
        if y is not None and math.isfinite(y)
    ]
    low = min(0.0, min((y for _, y in values), default=0.0))
    high = max(1.0, max((y for _, y in values), default=1.0))
    last = max(1, max((x for x, _ in values), default=1))
    magnitude = max(abs(low), abs(high))

    def x_pos(x: int) -> float:
        return 90 + x / last * 680

    def y_pos(y: float) -> float:
        return (
            275
            - (y / magnitude - low / magnitude)
            / (high / magnitude - low / magnitude)
            * 210
        )

    content = [f'<text x="24" y="48">{escape(unit)}</text>']
    for index in range(5):
        fraction = index / 4
        tick = low * (1 - fraction) + high * fraction
        y = y_pos(tick)
        content.extend(
            [
                f'<path d="M90 {y:.2f}H770" stroke="#e0e8d6"/>',
                f'<text x="82" y="{y + 4:.2f}" text-anchor="end">{tick:.5g}</text>',
            ]
        )
    content.extend(
        [
            '<path d="M90 65V275H770" fill="none" stroke="#6f7a70"/>',
            '<text x="90" y="295">0</text>',
            f'<text x="770" y="295" text-anchor="end">{last}</text>',
            f'<text x="400" y="322">{escape(x_label)}</text>',
        ]
    )
    colors = ("#3e6a4b", "#b77e33")
    for index, (label, points) in enumerate(series):
        path: list[str] = []
        connected = False
        for x, y in points:
            if y is None or not math.isfinite(y):
                connected = False
                continue
            path.append(f"{'L' if connected else 'M'}{x_pos(x):.2f},{y_pos(y):.2f}")
            connected = True
        color = colors[index % len(colors)]
        content.append(
            f'<path d="{" ".join(path)}" fill="none" stroke="{color}" stroke-width="2"/>'
        )
        first = next(
            ((x, y) for x, y in points if y is not None and math.isfinite(y)), None
        )
        if first is not None:
            content.append(
                f'<circle cx="{x_pos(first[0]):.2f}" cy="{y_pos(first[1]):.2f}" r="3" fill="{color}"/>'
            )
        content.append(
            f'<text x="{440 + index * 150}" y="48" fill="{color}">{escape(label)}</text>'
        )
    if not values:
        content.append('<text x="300" y="160">No recorded data</text>')
    return _svg(title, 800, 340, content)


def _arrangement(
    run: RunModel, placements: list[VehiclePlacement], title: str, unit: str
) -> str:
    ship = run.config.ship
    scale = min(700 / ship.width, 360 / ship.length)
    deck_width, deck_height = ship.width * scale, ship.length * scale
    by_id = {item.vehicle_id: item for item in placements}
    outside = [
        (index, vehicle)
        for index, vehicle in enumerate(run.config.vehicles)
        if vehicle.id not in by_id
    ]
    bottom = 110 + deck_height
    height = math.ceil(bottom + 75 + math.ceil(len(outside) / 4) * 32)
    score = calculate_objective(run.config, placements)
    content = [
        f'<text x="24" y="52">Score: {score} {escape(unit)} | Loaded: {len(placements)}/{len(run.config.vehicles)} | Seed: {run.random_seed}</text>',
        f'<text x="24" y="74">Deck: {ship.width} x {ship.length}; origin (0, 0) top-left | Weight: {sum(v.weight for v in run.config.vehicles if v.id in by_id)}/{ship.max_weight}</text>',
        f'<rect x="40" y="90" width="{deck_width:.2f}" height="{deck_height:.2f}" fill="#f0f4eb" stroke="#789477"/>',
    ]
    for index, vehicle in enumerate(run.config.vehicles):
        item = by_id.get(vehicle.id)
        if item is None:
            continue
        x, y = 40 + item.x * scale, 90 + item.y * scale
        w, h = item.width * scale, item.length * scale
        color_hash = 0
        for character in str(vehicle.id):
            color_hash = (color_hash * 31 + ord(character)) & 0xFFFFFFFF
        if color_hash >= 2**31:
            color_hash -= 2**32
        color = f"hsl({color_hash % 360},45%,35%)"
        content.append(
            f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" fill="{color}" stroke="white"><title>V{index + 1}: ({item.x}, {item.y}), {item.width} x {item.length}, ETA {vehicle.eta}, weight {vehicle.weight}</title></rect>'
        )
        if w >= 20 and h >= 14:
            content.append(
                f'<text x="{x + w / 2:.2f}" y="{y + h / 2 + 4:.2f}" text-anchor="middle" fill="white">V{index + 1}</text>'
            )
    content.append(
        f'<text x="24" y="{bottom:.2f}">Outside ship: {len(outside)} vehicles (listed below, not to scale)</text>'
    )
    for position, (index, vehicle) in enumerate(outside):
        x, y = 24 + (position % 4) * 190, bottom + 25 + position // 4 * 32
        content.append(
            f'<text x="{x}" y="{y:.2f}">V{index + 1}: {vehicle.width}x{vehicle.length}, ETA {vehicle.eta}</text>'
        )
    return _svg(title, 800, height, content)


def export_run(run: RunModel, output_root: Path | None = None) -> Path:
    initial = run.result.initial_arrangement
    if initial is None:
        raise OutputExportError(
            "Initial arrangement is not recorded; output was not generated."
        )
    unit = (
        "ETA priority points"
        if run.config.objective_mode == "eta_priority"
        else "million IDR"
    )
    root = (
        output_root if output_root is not None else OUTPUT_ROOT
    ) / run.settings.algorithm
    destination = root / str(run.id)
    try:
        root.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(prefix=".run-", dir=root) as temporary:
            folder = Path(temporary)
            fields = {
                "initial_objective",
                "final_objective",
                "runtime_ms",
                "iterations_completed",
                "generations_completed",
                "stop_reason",
            }
            if run.settings.algorithm == "hill_climbing":
                fields.update(
                    {
                        "sideways_moves",
                        "restarts_completed",
                        "iterations_per_restart",
                        "neighbors_evaluated",
                    }
                )
            elif run.settings.algorithm == "simulated_annealing":
                fields.add("stuck_count")
            metrics = run.result.model_dump(
                mode="json", include=fields, exclude_none=True
            )
            metrics.update(
                initial_loaded=len(initial),
                final_loaded=len(run.result.final_arrangement),
                final_unloaded=len(run.result.unloaded_vehicle_ids),
            )
            summary = {
                "run_id": str(run.id),
                "created_at": run.created_at.isoformat(),
                "config_hash": run.configHash,
                "random_seed": run.random_seed,
                "objective_mode": run.config.objective_mode,
                "objective_unit": unit,
                "settings": run.settings.model_dump(mode="json"),
                "metrics": metrics,
            }
            if run.settings.algorithm == "simulated_annealing":
                summary["stuck_definition"] = (
                    "Stagnation-window episodes without a new best objective; not a proof of a local optimum."
                )
            (folder / "summary.json").write_text(
                json.dumps(summary, indent=2), encoding="utf-8"
            )
            (folder / "run.json").write_text(
                run.model_dump_json(indent=2), encoding="utf-8"
            )
            (folder / "initial.svg").write_text(
                _arrangement(run, initial, "Initial arrangement", unit),
                encoding="utf-8",
            )
            (folder / "final.svg").write_text(
                _arrangement(
                    run, run.result.final_arrangement, "Final arrangement", unit
                ),
                encoding="utf-8",
            )
            if run.settings.algorithm == "genetic_algorithm":
                series = [
                    (
                        "Maximum",
                        [
                            (p.generation, float(p.maximum))
                            for p in run.result.population_history
                        ],
                    ),
                    (
                        "Average",
                        [
                            (p.generation, p.average)
                            for p in run.result.population_history
                        ],
                    ),
                ]
                chart = _chart(
                    "Maximum and average population objective",
                    series,
                    unit,
                    "Generation",
                )
            else:
                series = [
                    (
                        "Current",
                        [
                            (p.iteration, float(p.objective))
                            for p in run.result.objective_history
                        ],
                    )
                ]
                if run.settings.algorithm == "simulated_annealing":
                    series.append(
                        (
                            "Best",
                            [
                                (0, float(run.result.initial_objective)),
                                *[
                                    (p.iteration, float(p.best_objective))
                                    for p in run.result.annealing_history
                                ],
                            ],
                        )
                    )
                chart = _chart("Objective by iteration", series, unit)
            (folder / "objective.svg").write_text(chart, encoding="utf-8")
            if run.settings.algorithm == "simulated_annealing":
                logarithmic = any(
                    p.delta is not None and p.exponential is None
                    for p in run.result.annealing_history
                )
                points = [
                    (p.iteration, p.log_acceptance if logarithmic else p.exponential)
                    for p in run.result.annealing_history
                ]
                label = (
                    "ln(exp(delta/T)) (raw exponential overflowed)"
                    if logarithmic
                    else "exp(delta/T)"
                )
                (folder / "exponential.svg").write_text(
                    _chart(
                        label,
                        [("ln(exp)" if logarithmic else "exp", points)],
                        "Natural log" if logarithmic else "Raw exponential",
                    ),
                    encoding="utf-8",
                )
            folder.rename(destination)
        return destination
    except OSError as exc:
        raise OutputExportError(
            "Could not write output files. Check output directory permissions."
        ) from exc
