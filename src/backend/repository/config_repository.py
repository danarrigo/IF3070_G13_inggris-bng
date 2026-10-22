from pymongo.database import Database

from models.config import ConfigModel


def insert_config(db: Database[dict[str, object]], config: ConfigModel):
    return db["config"].insert_one(
        {
            "_id": "config",
            **config.model_dump(mode="json"),
        }
    )


def find_config(db: Database[dict[str, object]]):
    return db["config"].find_one({"_id": "config"})


def replace_config(db: Database[dict[str, object]], config: ConfigModel):
    return db["config"].replace_one(
        {"_id": "config"},
        config.model_dump(mode="json"),
    )


def remove_config(db: Database[dict[str, object]]):
    return db["config"].delete_one({"_id": "config"})
