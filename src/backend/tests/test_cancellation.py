import asyncio
from random import Random
from threading import Event
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from algorithms.genetic_algorithm.genetic_algorithm import SearchCancelled, run_genetic_algorithm
from core.database import get_database
from main import app
from models.job import StartJobRequest
from services.job_service import JobManager
from test_genetic_algorithm import scenario, settings


def body():
    return StartJobRequest(config=scenario(3), settings=settings(), random_seed=42)


def test_engine_stops_at_progress_checkpoint_and_unchanged_runs_keep_rng():
    stop = Event()
    generations = []

    def progress(point, _):
        generations.append(point.generation)
        if point.generation == 1:
            stop.set()

    with pytest.raises(SearchCancelled):
        run_genetic_algorithm(scenario(), settings(), [], Random(42), progress, should_stop=stop.is_set)
    assert generations == [0, 1]
    with pytest.raises(SearchCancelled):
        run_genetic_algorithm(scenario(), settings(), [], Random(42), should_stop=stop.is_set)
    config = scenario()
    first, second = Random(42), Random(42)
    normal = run_genetic_algorithm(config, settings(), [], first)
    checked = run_genetic_algorithm(config, settings(), [], second, should_stop=lambda: False)
    assert normal.model_dump(exclude={"runtime_ms"}) == checked.model_dump(exclude={"runtime_ms"})
    assert first.getstate() == second.getstate()


def test_engine_can_stop_while_initial_population_is_being_built(monkeypatch):
    from algorithms.genetic_algorithm import genetic_algorithm as ga
    stop = Event()
    count = 0
    initialize = ga.initialize_arrangement

    def initialize_one(*args):
        nonlocal count
        count += 1
        result = initialize(*args)
        stop.set()
        return result

    monkeypatch.setattr(ga, "initialize_arrangement", initialize_one)
    with pytest.raises(SearchCancelled):
        ga.run_genetic_algorithm(scenario(), settings(population_size=1000), [], Random(42), should_stop=stop.is_set)
    assert count == 1


@pytest.mark.parametrize("queued", [True, False])
def test_cancelled_jobs_do_not_save_and_release_worker_slot(monkeypatch, queued):
    manager, db = JobManager(), MagicMock()
    entered, release, finished = Event(), Event(), Event()
    original = manager._execute

    if queued:
        def execute(*args):
            entered.set()
            assert release.wait(5)
            try:
                original(*args)
            finally:
                finished.set()
        monkeypatch.setattr(manager, "_execute", execute)
    else:
        def search(*args, should_stop, **kwargs):
            entered.set()
            assert release.wait(5)
            assert should_stop()
            raise SearchCancelled()
        monkeypatch.setattr("services.job_service.run_genetic_algorithm", search)
        def execute(*args):
            try:
                original(*args)
            finally:
                finished.set()
        monkeypatch.setattr(manager, "_execute", execute)

    created = manager.start(body(), db)
    assert entered.wait(5)
    assert manager.cancel(created.id).stage == "cancelling"
    assert manager.cancel(created.id).stage == "cancelling"
    with pytest.raises(ValueError, match="already running"):
        manager.start(body(), db)
    release.set()
    assert finished.wait(5)
    cancelled = manager.get(created.id)
    assert cancelled.status == cancelled.stage == "cancelled"
    assert cancelled.error is None and cancelled.run is None
    db["runs"].insert_one.assert_not_called()
    assert manager.active() is None
    assert manager.cancel(created.id).status == "cancelled"


def test_cancellation_cannot_race_with_database_save(monkeypatch):
    manager, db = JobManager(), MagicMock()
    saving, release, finished = Event(), Event(), Event()
    execute = manager._execute

    def wrapper(*args):
        try:
            execute(*args)
        finally:
            finished.set()

    monkeypatch.setattr(manager, "_execute", wrapper)

    def save(_):
        saving.set()
        assert release.wait(5)

    db["runs"].insert_one.side_effect = save
    created = manager.start(body(), db)
    assert saving.wait(5)
    try:
        with pytest.raises(ValueError, match="being saved"):
            manager.cancel(created.id)
    finally:
        release.set()
    assert finished.wait(5)
    assert manager.cancel(created.id).status == "completed"


def test_cancel_endpoint_unknown_and_repeated_requests(monkeypatch):
    manager = JobManager()
    monkeypatch.setattr(app.state, "jobs", manager)
    monkeypatch.setattr(manager, "_execute", lambda *_: None)
    app.dependency_overrides[get_database] = lambda: MagicMock()

    async def check():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post("/api/jobs", json=body().model_dump(mode="json"))
            job_id = created.json()["id"]
            for _ in range(2):
                stopped = await client.post(f"/api/jobs/{job_id}/cancel")
                assert stopped.status_code == 202
                assert stopped.json()["stage"] == "cancelling"
            assert (await client.post(f"/api/jobs/{uuid4()}/cancel")).status_code == 404
            manager._jobs[UUID(job_id)].stage = "saving"
            assert (await client.post(f"/api/jobs/{job_id}/cancel")).status_code == 409

    try:
        asyncio.run(check())
    finally:
        app.dependency_overrides.pop(get_database, None)
