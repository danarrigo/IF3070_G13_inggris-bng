from uuid import UUID

from pymongo.database import Database

from models.run import RunModel


def create_run(db: Database[dict[str, object]], run: RunModel):
    return db["runs"].insert_one({
        "_id": str(run.id),
        **run.model_dump(mode="json"),
    })


def get_run(db: Database[dict[str, object]], run_id: UUID):
    return db["runs"].find_one({"_id": str(run_id)})


def list_runs(
    db: Database[dict[str, object]], config_hash: str | None = None
):
    query = {} if config_hash is None else {"configHash": config_hash}
    return list(db["runs"].find(query).sort("created_at", -1))


def delete_run(db: Database[dict[str, object]], run_id: UUID):
    return db["runs"].delete_one({"_id": str(run_id)})
