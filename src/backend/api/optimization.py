import asyncio
import logging
from contextlib import suppress
from threading import Event
from typing import cast
from urllib.parse import urlsplit

from anyio import CancelScope
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from pymongo.errors import PyMongoError

from algorithms.cancellation import SearchCancelled, check_cancellation
from algorithms.hill_climbing import SearchProgress
from core.database import DatabaseDep
from dtos.optimization import SteepestAscentRequest
from models.run import RunModel
from services.optimization_service import execute_steepest_ascent

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/api/optimization/hill-climbing", response_model=RunModel, status_code=201
)
def run_steepest_ascent(request: SteepestAscentRequest, db: DatabaseDep) -> RunModel:
    try:
        return execute_steepest_ascent(db, request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(
            status_code=503, detail="Database unavailable. The run could not be saved."
        ) from exc


@router.websocket("/api/optimization/hill-climbing/live")
async def live_steepest_ascent(websocket: WebSocket, db: DatabaseDep) -> None:
    origin = websocket.headers.get("origin")
    if origin is not None and urlsplit(origin).netloc != websocket.headers.get("host"):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    try:
        raw = cast(object, await websocket.receive_json())
        request = SteepestAscentRequest.model_validate(raw)
    except WebSocketDisconnect:
        return
    except (ValidationError, ValueError):
        await websocket.send_json(
            {"type": "error", "detail": "Invalid execution request."}
        )
        await websocket.close(code=1008)
        return

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, object]] = asyncio.Queue(maxsize=8)
    cancelled = Event()
    disconnected = asyncio.Event()
    acknowledged = asyncio.Event()
    awaiting_sequence: int | None = None

    def report(progress: SearchProgress) -> None:
        check_cancellation(cancelled.is_set)
        event: dict[str, object] = {
            "type": "progress",
            "phase": progress.phase,
            "iteration": progress.iteration,
            "objective": progress.objective,
            "current_objective": progress.current_objective,
            "arrangement": [
                item.model_dump(mode="json") for item in progress.arrangement
            ],
            "neighbors_evaluated": progress.neighbors_evaluated,
            "runtime_ms": progress.runtime_ms,
        }
        if progress.phase == "initial":
            event["config"] = request.config.model_dump(mode="json")
        future = asyncio.run_coroutine_threadsafe(queue.put(event), loop)
        try:
            while True:
                check_cancellation(cancelled.is_set)
                try:
                    future.result(timeout=0.1)
                    return
                except TimeoutError:
                    continue
        finally:
            if not future.done():
                _ = future.cancel()

    async def produce() -> None:
        terminal: dict[str, object]
        try:
            run = await asyncio.to_thread(
                execute_steepest_ascent,
                db,
                request,
                on_progress=report,
                should_cancel=cancelled.is_set,
            )
            terminal = {"type": "complete", "run": run.model_dump(mode="json")}
        except SearchCancelled:
            terminal = {"type": "cancelled"}
        except ValueError as exc:
            terminal = {"type": "error", "detail": str(exc)}
        except PyMongoError:
            terminal = {
                "type": "error",
                "detail": "Database unavailable. The run could not be saved.",
            }
        except Exception:
            logger.exception("Live optimization failed")
            terminal = {"type": "error", "detail": "The search failed unexpectedly."}
        if not disconnected.is_set():
            await queue.put(terminal)

    async def send_events() -> None:
        nonlocal awaiting_sequence
        sequence = 0
        try:
            while True:
                event = await queue.get()
                if event["type"] == "progress":
                    if cancelled.is_set():
                        continue
                    if request.acknowledge_progress:
                        sequence += 1
                        event["sequence"] = sequence
                        acknowledged.clear()
                        awaiting_sequence = sequence
                await websocket.send_json(event)
                if event["type"] in ("complete", "error", "cancelled"):
                    await websocket.close()
                    return
                if request.acknowledge_progress:
                    await acknowledged.wait()
                    awaiting_sequence = None
        except (WebSocketDisconnect, OSError, RuntimeError):
            return

    async def receive_control() -> None:
        try:
            while True:
                raw = cast(object, await websocket.receive_json())
                message = cast(dict[str, object], raw) if isinstance(raw, dict) else {}
                if message.get("type") == "cancel":
                    cancelled.set()
                    acknowledged.set()
                elif message.get("type") == "ack" and request.acknowledge_progress:
                    sequence = message.get("sequence")
                    if type(sequence) is not int or sequence != awaiting_sequence:
                        await websocket.close(code=1008)
                        return
                    acknowledged.set()
                else:
                    await websocket.close(code=1008)
                    return
        except (WebSocketDisconnect, ValueError, OSError, RuntimeError):
            return

    worker = asyncio.create_task(produce())
    sender = asyncio.create_task(send_events())
    receiver = asyncio.create_task(receive_control())
    try:
        done, _ = await asyncio.wait(
            (sender, receiver), return_when=asyncio.FIRST_COMPLETED
        )
        for task in done:
            task.result()
    finally:
        disconnected.set()
        cancelled.set()
        _ = sender.cancel()
        _ = receiver.cancel()
        while not queue.empty():
            _ = queue.get_nowait()
        with CancelScope(shield=True):
            _ = await asyncio.gather(sender, receiver, return_exceptions=True)
            await worker
            with suppress(WebSocketDisconnect, RuntimeError, OSError):
                await websocket.close()
