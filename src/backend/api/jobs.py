from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from algorithms.validation import validate_arrangement, validate_initial_arrangement
from core.database import DatabaseDep
from models.job import JobState, StartJobRequest
from services.job_service import JobManager

router = APIRouter()


def manager(request: Request) -> JobManager:
    return request.app.state.jobs


@router.post("/api/jobs", response_model=JobState, status_code=202)
def start_job(body: StartJobRequest, request: Request, db: DatabaseDep) -> JobState:
    errors = (validate_initial_arrangement(body.config) if body.config.preserve_positions
              else validate_arrangement(body.config, []))
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))
    try:
        return manager(request).start(body, db)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/api/jobs/active", response_model=JobState | None)
def active_job(request: Request) -> JobState | None:
    return manager(request).active()


@router.get("/api/jobs/{job_id}", response_model=JobState)
def get_job(job_id: UUID, request: Request) -> JobState:
    job = manager(request).get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found. The backend may have restarted.")
    return job


@router.post("/api/jobs/{job_id}/cancel", response_model=JobState, status_code=202)
def cancel_job(job_id: UUID, request: Request) -> JobState:
    try:
        return manager(request).cancel(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Job not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
