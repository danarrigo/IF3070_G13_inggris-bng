from uuid import UUID

from pymongo.database import Database

from models.run import RunModel


def insert_run(db: Database[dict[str, object]], run: RunModel):
    return db["runs"].insert_one({
        "_id": str(run.id),
        **run.model_dump(mode="json"),
    })


def find_run_by_id(db: Database[dict[str, object]], run_id: UUID):
    return db["runs"].find_one({"_id": str(run_id)})


def find_runs(
    db: Database[dict[str, object]], config_hash: str | None = None, *, include_trace: bool = True
):
    query = {} if config_hash is None else {"configHash": config_hash}
    cursor = (db["runs"].find(query) if include_trace else
              db["runs"].find(query, {"result.demo_trace": 0}))
    return list(cursor.sort("created_at", -1))


def delete_run_by_id(db: Database[dict[str, object]], run_id: UUID):
    return db["runs"].delete_one({"_id": str(run_id)})
