from datetime import timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from models.run import (
    GeneticAlgorithmSettings,
    HillClimbingSettings,
    RunModel,
    RunResult,
    VehiclePlacement,
    SimulatedAnnealingSettings,
)


def make_run(settings: dict[str, object]) -> RunModel:
    return RunModel.model_validate(
        {
            "configHash": "example_hash",
            "config": {
                "ship": {"length": 10, "width": 10, "max_weight": 1000},
                "vehicles": [],
            },
            "settings": settings,
            "random_seed": 42,
            "result": {
                "final_arrangement": [],
                "unloaded_vehicle_ids": [],
                "initial_objective": 0,
                "final_objective": 0,
                "objective_history": [{"iteration": 0, "objective": 0}],
                "runtime_ms": 0.5,
            },
        }
    )


def test_run_metadata_and_json_round_trip() -> None:
    run = make_run({"algorithm": "hill_climbing", "iterations": 100})

    assert run.created_at.utcoffset() == timedelta(0)
    assert run.random_seed == 42
    assert RunModel.model_validate_json(run.model_dump_json()) == run


def test_placement_accepts_zero_coordinates() -> None:
    placement = VehiclePlacement(
        vehicle_id=uuid4(), x=0, y=0, length=4, width=2
    )
    assert placement.x == 0
    assert placement.y == 0


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("initial_objective", -1),
        ("final_objective", -1),
        ("runtime_ms", -1),
        ("objective_history", [{"iteration": -1, "objective": 0}]),
        ("objective_history", [{"iteration": 0, "objective": -1}]),
    ],
)
def test_rejects_invalid_result(field: str, value: object) -> None:
    run = make_run({"algorithm": "hill_climbing", "iterations": 100})
    data = run.result.model_dump()
    data[field] = value

    with pytest.raises(ValidationError):
        RunResult.model_validate(data)


def test_selects_hill_climbing_settings() -> None:
    run = make_run({"algorithm": "hill_climbing", "iterations": 100})
    assert isinstance(run.settings, HillClimbingSettings)


def test_selects_simulated_annealing_settings() -> None:
    run = make_run(
        {
            "algorithm": "simulated_annealing",
            "iterations": 100,
            "initial_temperature": 100,
            "cooling_rate": 0.95,
        }
    )
    assert isinstance(run.settings, SimulatedAnnealingSettings)


def test_selects_genetic_algorithm_settings() -> None:
    run = make_run(
        {
            "algorithm": "genetic_algorithm",
            "iterations": 100,
            "population_size": 50,
            "crossover_rate": 0.8,
            "mutation_rate": 0.1,
        }
    )
    assert isinstance(run.settings, GeneticAlgorithmSettings)


@pytest.mark.parametrize(
    "settings",
    [
        {"algorithm": "unknown", "iterations": 100},
        {"algorithm": "genetic_algorithm", "iterations": 100},
        {
            "algorithm": "genetic_algorithm",
            "iterations": 100,
            "population_size": 1,
            "crossover_rate": 0.8,
            "mutation_rate": 0.1,
        },
        {
            "algorithm": "genetic_algorithm",
            "iterations": 100,
            "population_size": 50,
            "crossover_rate": 1.1,
            "mutation_rate": -0.1,
        },
        {"algorithm": "hill_climbing", "iterations": 0},
        {"algorithm": "simulated_annealing", "iterations": 100},
        {
            "algorithm": "simulated_annealing",
            "iterations": 100,
            "initial_temperature": 100,
            "cooling_rate": 1,
        },
    ],
)
def test_rejects_invalid_settings(settings: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        make_run(settings)
