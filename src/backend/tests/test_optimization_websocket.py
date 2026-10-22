from collections.abc import Callable
from threading import Event
from time import monotonic
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from algorithms.cancellation import SearchCancelled
from algorithms.hill_climbing import SearchProgress
from core.database import get_database
from main import app
from models.config import ConfigModel, Ship, Vehicle
from models.run import RunModel


def request_payload() -> dict[str, object]:
    config = ConfigModel(
        ship=Ship(length=1, width=1, max_weight=1),
        preserve_positions=True,
        vehicles=[
            Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10, x=0, y=0),
            Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=30),
        ],
    )
    return {
        "config": config.model_dump(mode="json"),
        "random_seed": 42,
        "iterations": 10,
    }


@pytest.mark.parametrize("show_neighbors", [False, True])
def test_streams_actual_best_candidates_and_iterations_then_saves_complete_run(
    show_neighbors: bool,
) -> None:
    db = MagicMock()
    app.dependency_overrides[get_database] = lambda: db
    try:
        with (
            TestClient(app) as client,
            client.websocket_connect("/api/optimization/hill-climbing/live") as socket,
        ):
            socket.send_json({**request_payload(), "show_neighbors": show_neighbors})
            frames = []
            while True:
                event = socket.receive_json()
                frames.append(event)
                if event["type"] != "progress":
                    break
        assert frames[-1]["type"] == "complete"
        progress = frames[:-1]
        assert (
            any(event["phase"] == "candidate" for event in progress) == show_neighbors
        )
        assert [
            event["phase"] for event in progress if event["phase"] != "candidate"
        ] == [
            "initial",
            "best",
            "iteration",
            "iteration",
        ]
        best = next(event for event in progress if event["phase"] == "best")
        assert best["objective"] == 30
        assert best["current_objective"] == 10
        run = RunModel.model_validate(frames[-1]["run"])
        assert run.result.final_objective == 30
        assert run.result.initial_arrangement is not None
        assert progress[0]["arrangement"] == [
            item.model_dump(mode="json") for item in run.result.initial_arrangement
        ]
        db["runs"].insert_one.assert_called_once_with(
            {"_id": str(run.id), **run.model_dump(mode="json")}
        )
    finally:
        app.dependency_overrides.pop(get_database, None)


def test_lossless_progress_waits_for_ack_and_delivers_every_neighbor() -> None:
    db = MagicMock()
    app.dependency_overrides[get_database] = lambda: db
    try:
        with (
            TestClient(app) as client,
            client.websocket_connect("/api/optimization/hill-climbing/live") as socket,
        ):
            socket.send_json(
                {
                    **request_payload(),
                    "show_neighbors": True,
                    "acknowledge_progress": True,
                }
            )
            frames = []
            while True:
                event = socket.receive_json()
                if event["type"] != "progress":
                    break
                frames.append(event)
                assert event["sequence"] == len(frames)
                socket.send_json({"type": "ack", "sequence": event["sequence"]})
            assert event["type"] == "complete"
            run = RunModel.model_validate(event["run"])
            neighbors = [
                item for item in frames if item["phase"] in ("candidate", "best")
            ]
            assert len(neighbors) == run.result.neighbors_evaluated
            assert [item["neighbors_evaluated"] for item in neighbors] == list(
                range(1, len(neighbors) + 1)
            )
            assert run.result.final_objective == 30
    finally:
        app.dependency_overrides.pop(get_database, None)


def test_cancel_unblocks_lossless_progress_without_ack_or_partial_save() -> None:
    db = MagicMock()
    app.dependency_overrides[get_database] = lambda: db
    payload = request_payload()
    config = ConfigModel.model_validate(payload["config"])
    config.ship.width = 20
    try:
        with (
            TestClient(app) as client,
            client.websocket_connect("/api/optimization/hill-climbing/live") as socket,
        ):
            socket.send_json(
                {
                    **payload,
                    "config": config.model_dump(mode="json"),
                    "show_neighbors": True,
                    "acknowledge_progress": True,
                }
            )
            first = socket.receive_json()
            assert first["phase"] == "initial"
            assert first["sequence"] == 1
            socket.send_json({"type": "cancel"})
            assert socket.receive_json()["type"] == "cancelled"
        db["runs"].insert_one.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_database, None)


@pytest.mark.parametrize("disconnect", [False, True])
def test_cancel_or_disconnect_signals_worker_and_never_saves_partial_run(
    monkeypatch, disconnect: bool
) -> None:
    stopped = Event()
    db = MagicMock()

    def wait_for_cancel(
        db,
        request,
        *,
        on_progress: Callable[[SearchProgress], None],
        should_cancel: Callable[[], bool],
    ):
        on_progress(
            SearchProgress(
                phase="initial",
                iteration=0,
                objective=0,
                current_objective=0,
                arrangement=[],
                neighbors_evaluated=0,
                runtime_ms=0,
            )
        )
        deadline = monotonic() + 3
        while not should_cancel():
            if monotonic() >= deadline:
                raise AssertionError("Worker was not cancelled")
            _ = stopped.wait(0.005)
        stopped.set()
        raise SearchCancelled()

    monkeypatch.setattr("api.optimization.execute_steepest_ascent", wait_for_cancel)
    app.dependency_overrides[get_database] = lambda: db
    try:
        with TestClient(app) as client:
            with client.websocket_connect(
                "/api/optimization/hill-climbing/live"
            ) as socket:
                socket.send_json(request_payload())
                assert socket.receive_json()["type"] == "progress"
                if not disconnect:
                    socket.send_json({"type": "cancel"})
                    assert socket.receive_json()["type"] == "cancelled"
            assert stopped.wait(2)
        db["runs"].insert_one.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_database, None)


def test_rejects_bad_request_and_cross_origin_connections() -> None:
    db = MagicMock()
    app.dependency_overrides[get_database] = lambda: db
    try:
        with TestClient(app) as client:
            with client.websocket_connect(
                "/api/optimization/hill-climbing/live"
            ) as socket:
                socket.send_json({})
                assert socket.receive_json()["type"] == "error"
            with (
                pytest.raises(WebSocketDisconnect) as error,
                client.websocket_connect(
                    "/api/optimization/hill-climbing/live",
                    headers={"origin": "https://untrusted.example"},
                ),
            ):
                pass
            assert error.value.code == 1008
        db["runs"].insert_one.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_database, None)
