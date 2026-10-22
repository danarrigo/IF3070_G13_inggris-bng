"""Single-process, in-memory jobs. Completed results are persisted in MongoDB."""

import logging
from random import Random
from threading import Event, Lock, Thread
from time import perf_counter
from uuid import UUID

from pymongo.database import Database

from algorithms.genetic_algorithm import run_genetic_algorithm
from algorithms.genetic_algorithm.genetic_algorithm import SearchCancelled
from algorithms.initialization import initialize_arrangement
from models.job import JobState, StartJobRequest
from models.run import PopulationPoint, RunModel, VehiclePlacement
from repository.run_repository import insert_run
from services.run_service import hash_config

logger = logging.getLogger(__name__)


class JobManager:
    def __init__(self) -> None:
        self._lock = Lock()
        self._jobs: dict[UUID, JobState] = {}
        self._started: dict[UUID, float] = {}
        self._active_id: UUID | None = None
        self._cancel_events: dict[UUID, Event] = {}

    def start(
        self, request: StartJobRequest, db: Database[dict[str, object]]
    ) -> JobState:
        # Reserve the only worker slot atomically, before starting any work.
        with self._lock:
            if self._active_id is not None:
                raise ValueError("A search is already running. Wait for it to finish.")
            job = JobState(request=request.model_copy(deep=True))
            self._jobs[job.id] = job
            self._started[job.id] = perf_counter()
            self._active_id = job.id
            self._cancel_events[job.id] = Event()
            snapshot = job.model_copy(deep=True)
        try:
            Thread(target=self._execute, args=(job.id, db), daemon=True).start()
        except Exception:
            with self._lock:
                job.status = "failed"
                job.stage = "failed"
                job.error = "Could not start search worker."
                self._active_id = None
            raise
        return snapshot

    def get(self, job_id: UUID) -> JobState | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            # Trace is loaded once from /api/runs/{id}, never copied into polls.
            snapshot = job.model_copy(update={"run": None}, deep=True)
            if job.run is not None:
                light_result = job.run.result.model_copy(update={"demo_trace": None})
                snapshot.run = job.run.model_copy(
                    update={"result": light_result}
                ).model_copy(deep=True)
            if job.status in {"queued", "running"}:
                snapshot.elapsed_ms = (perf_counter() - self._started[job_id]) * 1000
            return snapshot

    def active(self) -> JobState | None:
        with self._lock:
            active_id = self._active_id
        return self.get(active_id) if active_id is not None else None

    def cancel(self, job_id: UUID) -> JobState:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)
            if job.stage == "saving":
                raise ValueError(
                    "The search has finished and its result is being saved. Wait for completion."
                )
            if job.status in {"queued", "running"}:
                self._cancel_events[job_id].set()
                job.stage = "cancelling"
        snapshot = self.get(job_id)
        assert snapshot is not None
        return snapshot

    def _execute(self, job_id: UUID, db: Database[dict[str, object]]) -> None:
        with self._lock:
            job = self._jobs[job_id]
            request = job.request.model_copy(deep=True)
            stop = self._cancel_events[job_id]
            job.status = "running"
            job.stage = "cancelling" if stop.is_set() else "initializing"

        def progress(point: PopulationPoint, initial: list[VehiclePlacement]) -> None:
            with self._lock:
                if not stop.is_set():
                    job.stage = "searching"
                job.generation = point.generation
                job.population_history.append(point)
                if job.initial_arrangement is None:
                    job.initial_arrangement = initial

        try:
            if stop.is_set():
                raise SearchCancelled()
            rng = Random(request.random_seed)
            initial = initialize_arrangement(request.config, rng)
            result = run_genetic_algorithm(
                request.config,
                request.settings,
                initial,
                rng,
                progress,
                record_demo=request.record_demo,
                should_stop=stop.is_set,
            )
            run = RunModel(
                random_seed=request.random_seed,
                configHash=hash_config(request.config),
                config=request.config,
                settings=request.settings,
                result=result,
            )
            with self._lock:
                # Cancellation and entry into saving share the same lock.
                if stop.is_set():
                    raise SearchCancelled()
                job.stage = "saving"
            insert_run(db, run)
            with self._lock:
                job.run = run
                job.status = "completed"
                job.stage = "completed"
        except SearchCancelled:
            with self._lock:
                job.status = "cancelled"
                job.stage = "cancelled"
        except Exception:
            logger.exception("GA job %s failed", job_id)
            with self._lock:
                job.status = "failed"
                job.stage = "failed"
                job.error = "Search or result storage failed. Check the backend logs and MongoDB connection."
        finally:
            with self._lock:
                job.elapsed_ms = (perf_counter() - self._started[job_id]) * 1000
                self._active_id = None
