from pymongo.database import Database

from models.config import ConfigModel
from repository.config_repository import find_config


def load_config(db: Database[dict[str, object]]) -> ConfigModel:
    document = find_config(db)
    if document is None:
        raise ValueError("Config not found")
    return ConfigModel.model_validate(document)
