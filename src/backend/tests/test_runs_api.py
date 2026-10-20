import asyncio
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from pymongo.errors import DuplicateKeyError, ServerSelectionTimeoutError

from core.database import get_database
from main import app
from models.run import RunModel


@pytest.mark.parametrize(
    ("method", "case", "expected_status"),
    [
        ("POST", "success", 201),
        ("POST", "duplicate", 409),
        ("POST", "invalid", 422),
        ("GET", "detail", 200),
        ("GET", "missing", 404),
        ("GET", "invalid_id", 422),
        ("GET", "list", 200),
        ("GET", "filtered", 200),
        ("GET", "empty", 200),
        ("GET", "database_error", 500),
        ("DELETE", "success", 204),
        ("DELETE", "missing", 404),
    ],
)
def test_run_endpoints(method: str, case: str, expected_status: int) -> None:
    run = RunModel.model_validate({
        "configHash": "example_hash",
        "config": {
            "ship": {"length": 10, "width": 5, "max_weight": 1000},
            "vehicles": [],
        },
        "settings": {"algorithm": "hill_climbing", "iterations": 100},
        "random_seed": 42,
        "result": {
            "final_arrangement": [],
            "unloaded_vehicle_ids": [],
            "initial_objective": 0,
            "final_objective": 0,
            "objective_history": [],
            "runtime_ms": 1,
        },
    })
    payload = run.model_dump(mode="json")
    db = MagicMock()
    document = {"_id": str(run.id), **payload}
    db["runs"].find_one.return_value = None if case == "missing" else document
    db["runs"].find.return_value.sort.return_value = (
        [] if case == "empty" else [document]
    )
    db["runs"].delete_one.return_value.deleted_count = (
        0 if case == "missing" else 1
    )
    if case == "duplicate":
        db["runs"].insert_one.side_effect = DuplicateKeyError("duplicate")
    if case == "database_error":
        db["runs"].find_one.side_effect = ServerSelectionTimeoutError("unavailable")

    path = "/api/runs"
    if method == "DELETE" or (
        method == "GET" and case not in {"list", "filtered", "empty"}
    ):
        path += f"/{'invalid' if case == 'invalid_id' else run.id}"
    if case == "filtered":
        path += "?config_hash=example_hash"

    async def check_endpoint() -> None:
        app.dependency_overrides[get_database] = lambda: db
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app, raise_app_exceptions=False),
                base_url="http://test",
            ) as client:
                response = await client.request(
                    method,
                    path,
                    json=({} if case == "invalid" else payload)
                    if method == "POST"
                    else None,
                )
            assert response.status_code == expected_status
            if expected_status in {200, 201}:
                expected = (
                    [] if case == "empty"
                    else [payload] if case in {"list", "filtered"}
                    else payload
                )
                assert response.json() == expected
            if expected_status == 204:
                assert response.content == b""
            if case in {"list", "empty", "filtered"}:
                db["runs"].find.assert_called_once_with(
                    {"configHash": "example_hash"} if case == "filtered" else {}
                )
            if case == "invalid":
                db["runs"].insert_one.assert_not_called()
        finally:
            app.dependency_overrides.pop(get_database, None)

    asyncio.run(check_endpoint())
