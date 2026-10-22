import asyncio
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from pymongo.errors import ServerSelectionTimeoutError

from algorithms.validation import validate_arrangement
from core.database import get_database
from main import app
from models.config import ConfigModel, Ship, Vehicle
from models.run import RunModel


@pytest.mark.parametrize(
    ("case", "status"), [("success", 201), ("invalid", 422), ("database_error", 503)]
)
def test_executes_current_config_and_saves_real_result(case: str, status: int) -> None:
    first = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10, x=0, y=0)
    second = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=30)
    config = ConfigModel(
        ship=Ship(length=1, width=1, max_weight=1),
        vehicles=[first, second],
        preserve_positions=True,
    )
    if case == "invalid":
        config.vehicles[0].x = 10
    db = MagicMock()
    if case == "database_error":
        db["runs"].insert_one.side_effect = ServerSelectionTimeoutError("offline")

    async def check() -> None:
        app.dependency_overrides[get_database] = lambda: db
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/optimization/hill-climbing",
                    json={
                        "config": config.model_dump(mode="json"),
                        "random_seed": 42,
                        "iterations": 10,
                    },
                )
            assert response.status_code == status
            db["config"].find_one.assert_not_called()
            db["config"].replace_one.assert_not_called()
            if status == 201:
                run = RunModel.model_validate(response.json())
                assert run.settings.algorithm == "hill_climbing"
                assert run.result.initial_objective == 10
                assert run.result.final_objective == 30
                assert run.result.initial_arrangement is not None
                assert run.result.initial_arrangement[0].vehicle_id == first.id
                assert run.result.final_arrangement[0].vehicle_id == second.id
                assert run.result.iterations_completed == 2
                assert run.result.stop_reason == "local_optimum"
                assert run.config == config
                db["runs"].insert_one.assert_called_once_with(
                    {"_id": str(run.id), **run.model_dump(mode="json")}
                )
            elif status == 422:
                db["runs"].insert_one.assert_not_called()
        finally:
            app.dependency_overrides.pop(get_database, None)

    asyncio.run(check())


def test_random_start_is_reproducible_and_ignores_inactive_preview_coordinates() -> (
    None
):
    vehicle = Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10, x=99, y=99)
    config = ConfigModel(ship=Ship(length=3, width=3, max_weight=1), vehicles=[vehicle])
    db = MagicMock()

    async def check() -> None:
        app.dependency_overrides[get_database] = lambda: db
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                payload = {
                    "config": config.model_dump(mode="json"),
                    "random_seed": 42,
                    "iterations": 10,
                }
                first_response = await client.post(
                    "/api/optimization/hill-climbing", json=payload
                )
                second_response = await client.post(
                    "/api/optimization/hill-climbing", json=payload
                )
            assert first_response.status_code == second_response.status_code == 201
            first = RunModel.model_validate(first_response.json())
            second = RunModel.model_validate(second_response.json())
            assert first.result.initial_arrangement == second.result.initial_arrangement
            assert first.result.final_arrangement == second.result.final_arrangement
            assert first.result.objective_history == second.result.objective_history
            assert first.result.initial_arrangement is not None
            assert validate_arrangement(config, first.result.initial_arrangement) == []
            assert first.config.vehicles[0].x == 99
        finally:
            app.dependency_overrides.pop(get_database, None)

    asyncio.run(check())


def test_rejects_invalid_iteration_limit_before_execution() -> None:
    db = MagicMock()

    async def check() -> None:
        app.dependency_overrides[get_database] = lambda: db
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/optimization/hill-climbing",
                    json={
                        "config": {
                            "ship": {"length": 1, "width": 1, "max_weight": 1},
                            "vehicles": [],
                        },
                        "iterations": 0,
                    },
                )
            assert response.status_code == 422
            db["runs"].insert_one.assert_not_called()
        finally:
            app.dependency_overrides.pop(get_database, None)

    asyncio.run(check())
