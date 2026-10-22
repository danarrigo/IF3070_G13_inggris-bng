from unittest.mock import MagicMock
from uuid import uuid4

from models.run import RunModel
from repository.run_repository import (
    delete_run_by_id,
    find_run_by_id,
    find_runs,
    insert_run,
)


def test_create_uses_run_id_and_serializes_document() -> None:
    db = MagicMock()
    vehicle_id = uuid4()
    run = RunModel.model_validate(
        {
            "configHash": "example_hash",
            "config": {
                "ship": {"length": 10, "width": 10, "max_weight": 1000},
                "vehicles": [],
            },
            "settings": {"algorithm": "hill_climbing", "iterations": 100},
            "random_seed": 42,
            "result": {
                "final_arrangement": [],
                "unloaded_vehicle_ids": [vehicle_id],
                "initial_objective": 0,
                "final_objective": 0,
                "objective_history": [],
                "runtime_ms": 1,
            },
        }
    )

    insert_run(db, run)

    db["runs"].insert_one.assert_called_once_with(
        {
            "_id": str(run.id),
            **run.model_dump(mode="json"),
        }
    )
    document = db["runs"].insert_one.call_args.args[0]
    assert isinstance(document["created_at"], str)
    assert document["result"]["unloaded_vehicle_ids"] == [str(vehicle_id)]


def test_get_uses_run_id() -> None:
    db = MagicMock()
    run_id = uuid4()

    find_run_by_id(db, run_id)

    db["runs"].find_one.assert_called_once_with({"_id": str(run_id)})


def test_list_returns_all_runs_newest_first() -> None:
    db = MagicMock()
    documents = [{"id": "example"}]
    db["runs"].find.return_value.sort.return_value = iter(documents)

    assert find_runs(db) == documents

    db["runs"].find.assert_called_once_with({})
    db["runs"].find.return_value.sort.assert_called_once_with("created_at", -1)


def test_list_filters_by_config_hash() -> None:
    db = MagicMock()

    find_runs(db, config_hash="example_hash")

    db["runs"].find.assert_called_once_with({"configHash": "example_hash"})


def test_delete_uses_run_id() -> None:
    db = MagicMock()
    run_id = uuid4()

    delete_run_by_id(db, run_id)

    db["runs"].delete_one.assert_called_once_with({"_id": str(run_id)})
