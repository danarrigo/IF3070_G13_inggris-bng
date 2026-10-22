from unittest.mock import MagicMock

from models.config import ConfigModel, Ship, Vehicle
from repository.config_repository import (
    find_config,
    insert_config,
    remove_config,
    replace_config,
)


def make_config() -> ConfigModel:
    return ConfigModel(
        ship=Ship(length=10, width=10, max_weight=1000),
        vehicles=[Vehicle(length=2, width=1, weight=100, eta=0, shipping_fee=50)],
    )


def test_create_uses_fixed_id_and_serializes_uuid() -> None:
    db = MagicMock()
    config = make_config()

    insert_config(db, config)

    db["config"].insert_one.assert_called_once_with(
        {"_id": "config", **config.model_dump(mode="json")}
    )
    document = db["config"].insert_one.call_args.args[0]
    assert isinstance(document["vehicles"][0]["id"], str)


def test_delete_uses_fixed_id() -> None:
    db = MagicMock()

    remove_config(db)

    db["config"].delete_one.assert_called_once_with({"_id": "config"})


def test_get_uses_fixed_id() -> None:
    db = MagicMock()

    find_config(db)

    db["config"].find_one.assert_called_once_with({"_id": "config"})


def test_update_uses_same_document_structure_as_create() -> None:
    db = MagicMock()
    config = make_config()

    replace_config(db, config)

    db["config"].replace_one.assert_called_once_with(
        {"_id": "config"}, config.model_dump(mode="json")
    )
