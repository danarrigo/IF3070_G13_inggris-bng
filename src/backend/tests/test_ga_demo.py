from random import Random
from threading import Event
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from algorithms.genetic_algorithm.demo import DemoRecorder, mutation_change
from algorithms.genetic_algorithm.genetic_algorithm import crossover, mutate, roulette_selection, run_genetic_algorithm
from algorithms.initialization import initialize_arrangement
from models.job import StartJobRequest
from models.run import DemoTrace, RunModel, VehiclePlacement
from repository.run_repository import find_runs
from services.job_service import JobManager
from test_genetic_algorithm import scenario, settings


@pytest.mark.parametrize("count", [0, 1, 8])
@pytest.mark.parametrize("population_size", [2, 5, 6])
@pytest.mark.parametrize("rates", [(0, 0), (1, 1), (.8, .1)])
def test_demo_does_not_change_search_or_random_stream(count, population_size, rates):
    config = scenario(count)
    before = config.model_dump()
    initial = initialize_arrangement(config, Random(23))
    options = settings(iterations=3, population_size=population_size, crossover_rate=rates[0], mutation_rate=rates[1])
    normal_rng, demo_rng = Random(42), Random(42)
    normal = run_genetic_algorithm(config, options, initial, normal_rng)
    demo = run_genetic_algorithm(config, options, initial, demo_rng, record_demo=True)
    exclude = {"runtime_ms", "demo_recorded", "demo_trace"}
    assert normal.model_dump(exclude=exclude) == demo.model_dump(exclude=exclude)
    assert normal_rng.getstate() == demo_rng.getstate()
    assert config.model_dump() == before
    assert normal.demo_trace is None and not normal.demo_recorded
    assert demo.demo_recorded
    trace = demo.demo_trace
    assert DemoTrace.model_validate_json(trace.model_dump_json()) == trace
    populations = {s.generation: s.individuals for s in trace.steps if s.kind == "population"}
    assert len(populations) == 4
    assert all(len(p) == population_size for p in populations.values())
    for step in trace.steps:
        if step.kind == "generation":
            assert step.individuals == populations[step.generation + 1]
        if step.kind == "elite":
            source = populations[step.generation]
            assert step.arrangement == source[step.selected_index].arrangement
            assert source[step.selected_index].fitness == max(i.fitness for i in source)
        if step.kind == "roulette":
            assert step.arrangement == populations[step.generation][step.selected_index].arrangement
            assert step.fitness == [i.fitness for i in populations[step.generation]]
        if step.kind == "admission":
            assert len(step.individuals) <= population_size
    # Trace snapshots must not share mutable placements with actual search results.
    frozen = trace.model_dump_json()
    if demo.final_arrangement:
        demo.final_arrangement[0].x += 1
    assert trace.model_dump_json() == frozen


@pytest.mark.parametrize("fitness", [[0, 0, 0], [0, 3, 6], [1, 1, 1]])
def test_roulette_matches_original_python_choices_and_records_exact_draw(fitness):
    population = [[], [], []]  # Distinct valid individual objects, even when equal.
    actual_rng, reference_rng = Random(91), Random(91)
    recorder = DemoRecorder(True)
    for _ in range(50):
        expected = reference_rng.choice(population) if sum(fitness) == 0 else reference_rng.choices(population, weights=fitness, k=1)[0]
        actual = roulette_selection(population, fitness, actual_rng, recorder)
        assert actual is expected
        assert actual_rng.getstate() == reference_rng.getstate()
        step = recorder.steps[-1]
        assert population[step.selected_index] is actual


def test_retry_trace_retains_sibling_and_records_fallback():
    config = scenario(3)
    first = [VehiclePlacement(vehicle_id=config.vehicles[0].id, x=0, y=0, length=2, width=1)]
    second = [VehiclePlacement(vehicle_id=config.vehicles[1].id, x=0, y=0, length=2, width=1)]
    recorder = DemoRecorder(True)
    rng = Random(1)
    with patch.object(rng, "randrange", side_effect=[1, 2]):
        a, b = crossover(config, first, second, rng, max_attempts=2, recorder=recorder)
    steps = recorder.steps
    assert [(s.attempt, s.child, s.accepted) for s in steps] == [(1, 1, False), (1, 2, True), (2, 1, True)]
    assert steps[-1].retained_children == [2]
    assert steps[-1].arrangement == a and steps[1].arrangement == b
    assert steps[0].errors and not steps[-1].errors
    recorder = DemoRecorder(True)
    with patch.object(rng, "randrange", return_value=1):
        crossover(config, first, second, rng, max_attempts=2, recorder=recorder)
    assert recorder.steps[-1].operation == "fallback"
    assert recorder.steps[-1].child == 1
    assert recorder.steps[-1].arrangement == first


def test_mutation_trace_skipped_failed_and_accepted():
    config = scenario(1)
    child = initialize_arrangement(config, Random(1))
    recorder = DemoRecorder(True)
    with patch("algorithms.genetic_algorithm.genetic_algorithm.random_neighbor", return_value=None):
        mutate(config, child, 0, Random(1), recorder, 1)
        mutate(config, child, 1, Random(1), recorder, 2)
    assert recorder.steps[0].operation == "not selected"
    assert recorder.steps[1].operation == "no valid neighbor"
    with patch("algorithms.genetic_algorithm.genetic_algorithm.random_neighbor", return_value=[]):
        result = mutate(config, child, 1, Random(1), recorder, 1)
    step = recorder.steps[-1]
    assert result == step.arrangement == []
    assert step.before == child
    assert step.operation == "unload"
    assert step.changed_vehicle_ids == [child[0].vehicle_id]
    assert mutation_change([], child)[0] == "load"


@pytest.mark.parametrize("population,iterations,count", [(11, 1, 1), (2, 11, 1), (2, 1, 31)])
def test_demo_limits_apply_at_request_and_engine(population, iterations, count):
    config, options = scenario(count), settings(population_size=population, iterations=iterations)
    with pytest.raises(ValidationError, match="at most"):
        StartJobRequest(config=config, settings=options, random_seed=1, record_demo=True)
    with pytest.raises(ValueError, match="at most"):
        run_genetic_algorithm(config, options, [], Random(1), record_demo=True)
    assert not StartJobRequest(config=config, settings=options, random_seed=1).record_demo


def test_demo_is_saved_but_polling_and_history_remain_light(monkeypatch):
    manager, db, finished = JobManager(), MagicMock(), Event()
    execute = manager._execute

    def wrapper(*args):
        try:
            execute(*args)
        finally:
            finished.set()

    monkeypatch.setattr(manager, "_execute", wrapper)
    body = StartJobRequest(config=scenario(4), settings=settings(iterations=2), random_seed=42, record_demo=True)
    created = manager.start(body, db)
    assert finished.wait(5)
    saved = RunModel.model_validate(db["runs"].insert_one.call_args.args[0])
    assert saved.result.demo_trace.steps
    polled = manager.get(created.id)
    assert polled.status == "completed"
    assert polled.run.result.demo_recorded
    assert polled.run.result.demo_trace is None
    assert len(polled.model_dump_json()) < len(saved.model_dump_json())
    assert manager._jobs[created.id].run.result.demo_trace is not None
    find_runs(db, include_trace=False)
    db["runs"].find.assert_called_once_with({}, {"result.demo_trace": 0})
