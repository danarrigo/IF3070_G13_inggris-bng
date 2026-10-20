from uuid import UUID

from fastapi import APIRouter, HTTPException, Response
from pymongo.errors import DuplicateKeyError

from core.database import DatabaseDep
from models.run import RunModel
from repository.run_repository import (
    delete_run_by_id,
    find_run_by_id,
    find_runs,
    insert_run,
)

router = APIRouter()


@router.post("/api/runs", response_model=RunModel, status_code=201)
def create_run(db: DatabaseDep, run: RunModel):
    try:
        _ = insert_run(db, run)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Run already exists") from exc
    return run


@router.get("/api/runs", response_model=list[RunModel])
def get_runs(db: DatabaseDep, config_hash: str | None = None):
    return find_runs(db, config_hash)


@router.get("/api/runs/{id}", response_model=RunModel)
def get_run_by_id(db: DatabaseDep, id: UUID):
    run = find_run_by_id(db, id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.delete("/api/runs/{id}", status_code=204)
def delete_run(db: DatabaseDep, id: UUID) -> Response:
    result = delete_run_by_id(db, id)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Run not found")
    return Response(status_code=204)
