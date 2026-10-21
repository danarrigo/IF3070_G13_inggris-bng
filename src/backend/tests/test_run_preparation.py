from unittest.mock import MagicMock

import pytest

from algorithms.validation import validate_arrangement
from models.config import ConfigModel, Ship, Vehicle
from services.run_service import hash_config, prepare_run


def test_prepares_saved_config_without_writing_a_finished_run() -> None:
    vehicle = Vehicle(length=2, width=1, weight=10, eta=0, shipping_fee=75, x=0, y=0)
    config = ConfigModel(
        ship=Ship(length=10, width=10, max_weight=100), vehicles=[vehicle]
    )
    document = {"_id": "config", **config.model_dump(mode="json")}
    db = MagicMock()
    db["config"].find_one.return_value = document

    prepared = prepare_run(db, random_seed=42)
    repeated = prepare_run(db, random_seed=42)

    assert prepared.config == config
    assert prepared.config_hash == hash_config(config)
    assert prepared.random_seed == 42
    assert prepared.initial_objective == 75
    assert prepared.initial_arrangement == repeated.initial_arrangement
    assert validate_arrangement(prepared.config, prepared.initial_arrangement) == []
    assert prepared.rng.random() == repeated.rng.random()
    assert document == {"_id": "config", **config.model_dump(mode="json")}
    db["runs"].insert_one.assert_not_called()


def test_preparation_randomizes_unplaced_vehicles() -> None:
    config = ConfigModel(
        ship=Ship(length=10, width=10, max_weight=100),
        vehicles=[Vehicle(length=2, width=1, weight=10, eta=0, shipping_fee=75)],
    )
    db = MagicMock()
    db["config"].find_one.return_value = config.model_dump(mode="json")
    prepared = prepare_run(db, random_seed=4)
    assert len(prepared.initial_arrangement) == 1
    assert prepared.initial_objective == 75
    assert prepared.config.vehicles[0].x is None
    assert prepared.config.vehicles[0].y is None


def test_missing_or_invalid_config_fails_preparation() -> None:
    db = MagicMock()
    db["config"].find_one.return_value = None
    with pytest.raises(ValueError, match="Config not found"):
        prepare_run(db, random_seed=1)
    config = ConfigModel(
        ship=Ship(length=1, width=1, max_weight=100),
        vehicles=[
            Vehicle(length=2, width=2, weight=10, eta=0, shipping_fee=75, x=0, y=0)
        ],
    )
    db["config"].find_one.return_value = config.model_dump(mode="json")
    with pytest.raises(ValueError, match="bounds"):
        prepare_run(db, random_seed=1)
