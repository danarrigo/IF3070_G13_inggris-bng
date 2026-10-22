import asyncio
from threading import Event
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from pymongo.errors import ConnectionFailure

from algorithms.cancellation import SearchCancelled
from core.database import get_database
from dtos.run import AnnealingRequest
from main import app
from models.config import ConfigModel, Ship, Vehicle
from models.run import SimulatedAnnealingSettings
from services.search_service import execute_saved_runs


def request():
    return AnnealingRequest(
        config=ConfigModel(
            ship=Ship(length=1, width=1, max_weight=1),
            vehicles=[Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10)],
        ),
        settings=SimulatedAnnealingSettings(
            algorithm="simulated_annealing",
            iterations=1,
            initial_temperature=10,
            cooling_rate=0.9,
        ),
        random_seed=42,
        run_count=1,
    )


@pytest.mark.parametrize("stream", [False, True])
def test_storage_failure_is_reported_instead_of_claiming_completion(stream):
    db = MagicMock()
    db["runs"].insert_one.side_effect = ConnectionFailure("offline")
    app.dependency_overrides[get_database] = lambda: db
    try:
        payload = request().model_dump(mode="json")
        if stream:
            with (
                TestClient(app) as client,
                client.websocket_connect(
                    "/api/search/simulated-annealing/stream"
                ) as socket,
            ):
                socket.send_json(payload)
                while True:
                    event = socket.receive_json()
                    if event["type"] != "progress":
                        break
                assert event["type"] == "error"
                assert "could not be saved" in event["message"]
        else:

            async def check():
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as client:
                    response = await client.post(
                        "/api/search/simulated-annealing", json=payload
                    )
                assert response.status_code == 503

            asyncio.run(check())
    finally:
        app.dependency_overrides.pop(get_database, None)


def test_cancelled_execution_never_persists_an_unconfirmed_result():
    db = MagicMock()
    cancelled = Event()

    def stop(index, snapshot):
        cancelled.set()

    with pytest.raises(SearchCancelled):
        execute_saved_runs(
            db, request(), on_snapshot=stop, should_cancel=cancelled.is_set
        )
    db["runs"].insert_one.assert_not_called()
