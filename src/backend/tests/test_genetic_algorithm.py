from random import Random
from unittest.mock import patch

import pytest

from algorithms.genetic_algorithm.genetic_algorithm import (
    crossover, mutate, roulette_selection, run_genetic_algorithm,
)
from algorithms.initialization import initialize_arrangement
from algorithms.objective import calculate_objective
from algorithms.validation import validate_arrangement
from models.config import ConfigModel, Ship, Vehicle
from models.run import GeneticAlgorithmSettings, VehiclePlacement


def settings(**changes) -> GeneticAlgorithmSettings:
    return GeneticAlgorithmSettings.model_validate({
        "algorithm": "genetic_algorithm", "iterations": 8, "population_size": 5,
        "crossover_rate": .8, "mutation_rate": .6, **changes,
    })


def scenario(count=10) -> ConfigModel:
    return ConfigModel(ship=Ship(length=5, width=5, max_weight=30), vehicles=[
        Vehicle(length=2, width=1, weight=5, eta=0, shipping_fee=i * 10)
        for i in range(count)
    ])


@pytest.mark.parametrize("population_size", [2, 3, 8])
@pytest.mark.parametrize("rates", [(0, 0), (1, 1), (.8, .1)])
def test_valid_reproducible_elitist_runs_and_exact_population(population_size, rates):
    config = scenario()
    before = config.model_dump()
    initial = initialize_arrangement(config, Random(12))
    initial_before = [p.model_dump() for p in initial]
    options = settings(population_size=population_size, crossover_rate=rates[0], mutation_rate=rates[1])
    actual_scores = []
    from algorithms.genetic_algorithm import genetic_algorithm as ga
    original_score = ga.calculate_objective

    def score(c, individual):
        assert validate_arrangement(c, individual) == []
        value = original_score(c, individual)
        actual_scores.append(value)
        return value

    snapshots = []
    with patch.object(ga, "calculate_objective", side_effect=score):
        result = run_genetic_algorithm(config, options, initial, Random(42), lambda p, a: snapshots.append((p, a)))
    repeated = run_genetic_algorithm(config, options, initial, Random(42))
    assert result.model_dump(exclude={"runtime_ms"}) == repeated.model_dump(exclude={"runtime_ms"})
    assert config.model_dump() == before
    assert [p.model_dump() for p in initial] == initial_before
    assert len(actual_scores) == population_size * (options.iterations + 1)
    assert len(result.population_history) == options.iterations + 1
    assert [p.generation for p in result.population_history] == list(range(options.iterations + 1))
    maximums = [p.maximum for p in result.population_history]
    assert maximums == sorted(maximums)
    for generation, point in enumerate(result.population_history):
        scores = actual_scores[generation * population_size:(generation + 1) * population_size]
        assert point.maximum == max(scores)
        assert point.average == sum(scores) / population_size
    assert result.initial_objective == calculate_objective(config, result.initial_arrangement)
    assert result.final_objective == calculate_objective(config, result.final_arrangement)
    assert len(snapshots) == options.iterations + 1
    assert result.runtime_ms >= 0
    assert result.generations_completed == options.iterations


@pytest.mark.parametrize("count", [0, 1, 4])
def test_empty_single_and_all_unloadable(count):
    config = scenario(count)
    config.ship.max_weight = 1
    result = run_genetic_algorithm(config, settings(), [], Random(2))
    assert result.initial_arrangement == result.final_arrangement == []
    assert result.final_objective == 0
    assert set(result.unloaded_vehicle_ids) == {v.id for v in config.vehicles}


def test_reject_retry_falls_back_to_independent_parents():
    config = scenario(2)
    # Both parents are valid, but their only internal cut produces overlapping children.
    first = [VehiclePlacement(vehicle_id=config.vehicles[0].id, x=0, y=0, length=2, width=1),
             VehiclePlacement(vehicle_id=config.vehicles[1].id, x=1, y=0, length=2, width=1)]
    second = [first[0].model_copy(update={"x": 1}), first[1].model_copy(update={"x": 0})]
    rng = Random(2)
    with patch.object(rng, "randrange", wraps=rng.randrange) as choose_cut:
        a, b = crossover(config, first, second, rng, max_attempts=3)
    assert choose_cut.call_count == 3
    assert a == first and b == second
    a[0].x = 4
    assert first[0].x == 0


def test_crossover_keeps_valid_sibling_and_inherits_unloaded_genes():
    config = scenario(3)
    # Child 1 fits; child 2 combines both vehicles and overlaps on the first cut.
    first = [VehiclePlacement(vehicle_id=config.vehicles[0].id, x=0, y=0, length=2, width=1)]
    second = [VehiclePlacement(vehicle_id=config.vehicles[1].id, x=0, y=0, length=2, width=1)]
    rng = Random(1)
    with patch.object(rng, "randrange", side_effect=[1, 2]):
        a, b = crossover(config, first, second, rng, max_attempts=2)
    assert a == first  # Becomes valid on cut 2.
    assert b == []     # Valid on cut 1, retained even though cut 2 would load B.
    assert validate_arrangement(config, a) == validate_arrangement(config, b) == []


def test_roulette_probabilities_and_zero_fallback():
    population = [[1], [2], [3]]
    rng = Random(5)
    draws = [roulette_selection(population, [1, 3, 6], rng) for _ in range(10000)]
    for individual, probability in zip(population, [.1, .3, .6]):
        assert abs(draws.count(individual) / len(draws) - probability) < .025
    assert {tuple(roulette_selection(population, [0, 0, 0], rng)) for _ in range(100)} == {(1,), (2,), (3,)}


def test_mutation_failure_and_rate_zero_leave_child_unchanged():
    config = scenario(1)
    initial = initialize_arrangement(config, Random(1))
    with patch("algorithms.genetic_algorithm.genetic_algorithm.random_neighbor", return_value=None) as neighbor:
        assert mutate(config, initial, 0, Random(1)) == initial
        neighbor.assert_not_called()
        assert mutate(config, initial, 1, Random(1)) == initial
        neighbor.assert_called_once()


def test_rejects_invalid_start_and_retry_budget():
    config = scenario(1)
    placement = VehiclePlacement(vehicle_id=config.vehicles[0].id, x=99, y=0, length=2, width=1)
    with pytest.raises(ValueError, match="bounds"):
        run_genetic_algorithm(config, settings(), [placement], Random(1))
    with pytest.raises(ValueError, match="positive"):
        crossover(config, [], [], Random(1), max_attempts=0)
