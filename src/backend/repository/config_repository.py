from pymongo.database import Database

from models.config import ConfigModel


def create_config(db: Database[dict[str, object]], config: ConfigModel):
    return db["config"].insert_one({
        "_id": "config",
        **config.model_dump(mode="json"),
    })


def get_config(db: Database[dict[str, object]]):
    return db["config"].find_one({"_id": "config"})


def update_config(db: Database[dict[str, object]], config: ConfigModel):
    return db["config"].replace_one(
        {"_id": "config"},
        config.model_dump(mode="json"),
    )


def delete_config(db: Database[dict[str, object]]):
    return db["config"].delete_one({"_id": "config"})

