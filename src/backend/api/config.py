from fastapi import APIRouter, HTTPException, Response
from pymongo.errors import DuplicateKeyError

from core.database import DatabaseDep
from models.config import ConfigModel
from repository.config_repository import (
    find_config,
    insert_config,
    remove_config,
    replace_config,
)

router = APIRouter()


@router.get("/api/config", response_model=ConfigModel)
def get_config(db: DatabaseDep):
    config = find_config(db)
    if config is None:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.post("/api/config", response_model=ConfigModel, status_code=201)
def create_config(config: ConfigModel, db: DatabaseDep):
    try:
        _ = insert_config(db, config)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Config already exists") from exc
    return config


@router.put("/api/config", response_model=ConfigModel)
def update_config(config: ConfigModel, db: DatabaseDep):
    result = replace_config(db, config)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.delete("/api/config", status_code=204)
def delete_config(db: DatabaseDep) -> Response:
    result = remove_config(db)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Config not found")
    return Response(status_code=204)
