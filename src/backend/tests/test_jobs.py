import asyncio
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from uuid import uuid4
from unittest.mock import MagicMock

from httpx import ASGITransport, AsyncClient

from core.database import get_database
from main import app
from models.config import ConfigModel, Ship, Vehicle
from models.job import StartJobRequest
from models.run import GeneticAlgorithmSettings, RunModel
from services.job_service import JobManager


def request() -> StartJobRequest:
    return StartJobRequest(
        config=ConfigModel(ship=Ship(length=5, width=5, max_weight=20), vehicles=[
            Vehicle(length=2, width=1, weight=5, eta=0, shipping_fee=30),
        ]),
        settings=GeneticAlgorithmSettings(algorithm="genetic_algorithm", iterations=4,
            population_size=3, crossover_rate=.8, mutation_rate=.3), random_seed=42,
    )


def test_job_progress_snapshots_completion_and_concurrent_requests(monkeypatch):
    manager = JobManager()
    db = MagicMock()
    entered, release, finished = Event(), Event(), Event()
    from services import job_service
    execute = manager._execute

    def held_execute(job_id, database):
        entered.set()
        assert release.wait(5)
        try:
            execute(job_id, database)
        finally:
            finished.set()

    monkeypatch.setattr(manager, "_execute", held_execute)
    body = request()

    def attempt(_):
        try:
            return manager.start(body, db)
        except ValueError:
            return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        attempts = list(pool.map(attempt, range(2)))
    accepted = [job for job in attempts if job is not None]
    assert len(accepted) == 1
    job_id = accepted[0].id
    assert entered.wait(1)
    snapshot = manager.get(job_id)
    assert snapshot.status == "queued"
    snapshot.request.config.vehicles.clear()
    assert len(manager.get(job_id).request.config.vehicles) == 1
    body.config.vehicles.clear()
    release.set()
    assert finished.wait(5)
    result = manager.get(job_id)
    assert result.status == result.stage == "completed"
    assert result.generation == 4
    assert len(result.population_history) == 5
    assert result.initial_arrangement is not None
    assert result.elapsed_ms >= 0
    assert manager.active() is None
    saved = db["runs"].insert_one.call_args.args[0]
    assert RunModel.model_validate(saved) == result.run
    assert len(saved["config"]["vehicles"]) == 1
    assert manager.get(uuid4()) is None


def test_storage_failure_marks_job_failed_and_releases_slot(monkeypatch):
    manager = JobManager()
    db = MagicMock()
    db["runs"].insert_one.side_effect = RuntimeError("database unavailable")
    finished = Event()
    execute = manager._execute

    def wrapper(*args):
        try:
            execute(*args)
        finally:
            finished.set()

    monkeypatch.setattr(manager, "_execute", wrapper)
    created = manager.start(request(), db)
    assert finished.wait(5)
    failed = manager.get(created.id)
    assert failed.status == failed.stage == "failed"
    assert failed.run is None
    assert "MongoDB" in failed.error
    assert manager.active() is None


def test_job_endpoints_validate_and_return_snapshots(monkeypatch):
    manager = JobManager()
    monkeypatch.setattr(app.state, "jobs", manager)
    # Keep the job queued so HTTP polling can inspect it deterministically.
    monkeypatch.setattr(manager, "_execute", lambda *_: None)
    db = MagicMock()

    async def check():
        app.dependency_overrides[get_database] = lambda: db
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                assert (await client.get("/api/jobs/active")).json() is None
                payload = request().model_dump(mode="json")
                response = await client.post("/api/jobs", json=payload)
                assert response.status_code == 202
                job_id = response.json()["id"]
                assert (await client.get(f"/api/jobs/{job_id}")).json()["status"] == "queued"
                assert (await client.get("/api/jobs/active")).json()["id"] == job_id
                assert (await client.post("/api/jobs", json=payload)).status_code == 409
                assert (await client.get(f"/api/jobs/{uuid4()}")).status_code == 404
                assert (await client.post("/api/jobs", json={})).status_code == 422
                payload["config"]["vehicles"] *= 2
                assert (await client.post("/api/jobs", json=payload)).status_code == 422
                payload = request().model_dump(mode="json")
                payload["config"]["preserve_positions"] = True
                payload["config"]["vehicles"][0]["x"] = 99
                payload["config"]["vehicles"][0]["y"] = 0
                assert (await client.post("/api/jobs", json=payload)).status_code == 422
        finally:
            app.dependency_overrides.pop(get_database, None)

    asyncio.run(check())


def test_legacy_run_result_remains_readable():
    from models.run import RunResult
    old = RunResult.model_validate(dict(final_arrangement=[], unloaded_vehicle_ids=[],
        initial_objective=0, final_objective=0, objective_history=[], runtime_ms=1))
    assert old.initial_arrangement is None
    assert old.population_history == []
    assert old.generations_completed is None
