import asyncio
import logging
from concurrent.futures import TimeoutError as FutureTimeoutError
from contextlib import suppress
from threading import Event
from urllib.parse import urlsplit

from anyio import CancelScope
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from pymongo.errors import PyMongoError

from algorithms.cancellation import SearchCancelled
from core.database import DatabaseDep
from dtos.run import AnnealingRequest
from models.run import RunModel, StateSnapshot
from services.output_service import OutputExportError
from services.search_service import execute_saved_runs

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/api/search/simulated-annealing", response_model=list[RunModel])
def execute_annealing(request: AnnealingRequest, db: DatabaseDep) -> list[RunModel]:
    try:
        return execute_saved_runs(db, request)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except OutputExportError as exc:
        logger.exception("SA output export failed")
        raise HTTPException(
            500, "Runs saved in MongoDB, but writing output files failed."
        ) from exc
    except PyMongoError as exc:
        raise HTTPException(
            503, "Database unavailable. Completed runs could not be saved."
        ) from exc


@router.websocket("/api/search/simulated-annealing/stream")
async def stream_annealing(websocket: WebSocket, db: DatabaseDep) -> None:
    origin = websocket.headers.get("origin")
    if origin is not None and urlsplit(origin).netloc != websocket.headers.get("host"):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    try:
        request = AnnealingRequest.model_validate(await websocket.receive_json())
    except (ValidationError, ValueError):
        await websocket.send_json(
            {"type": "error", "message": "Invalid search parameters or config."}
        )
        await websocket.close(code=1008)
        return
    except WebSocketDisconnect:
        return
    stopped = Event()
    disconnected = asyncio.Event()
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, object]] = asyncio.Queue(maxsize=4)

    def observe(index: int, snapshot: StateSnapshot) -> None:
        if stopped.is_set():
            raise SearchCancelled("Search disconnected.")
        future = asyncio.run_coroutine_threadsafe(
            queue.put(
                {
                    "type": "progress",
                    "run_index": index,
                    "snapshot": snapshot.model_dump(mode="json"),
                }
            ),
            loop,
        )
        try:
            while True:
                if stopped.is_set():
                    raise SearchCancelled("Search disconnected.")
                try:
                    future.result(timeout=0.1)
                    return
                except FutureTimeoutError:
                    continue
        finally:
            if not future.done():
                _ = future.cancel()

    async def compute() -> None:
        terminal: dict[str, object]
        try:
            runs = await asyncio.to_thread(
                execute_saved_runs, db, request, observe, stopped.is_set
            )
            terminal = {
                "type": "complete",
                "runs": [run.model_dump(mode="json") for run in runs],
            }
        except OutputExportError:
            logger.exception("SA output export failed")
            terminal = {
                "type": "error",
                "message": "Runs saved in MongoDB, but writing output files failed.",
            }
        except PyMongoError:
            terminal = {
                "type": "error",
                "message": "Database unavailable. Completed runs could not be saved.",
            }
        except (ValueError, RuntimeError, SearchCancelled) as exc:
            terminal = {"type": "error", "message": str(exc)}
        if not disconnected.is_set():
            await queue.put(terminal)

    async def send_events() -> None:
        try:
            while True:
                message = await queue.get()
                await websocket.send_json(message)
                if message["type"] != "progress":
                    await websocket.close()
                    return
        except (WebSocketDisconnect, OSError, RuntimeError):
            return

    async def receive_disconnect() -> None:
        try:
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    return
        except (WebSocketDisconnect, OSError, RuntimeError):
            return

    worker = asyncio.create_task(compute())
    sender = asyncio.create_task(send_events())
    receiver = asyncio.create_task(receive_disconnect())
    try:
        done, _ = await asyncio.wait(
            (sender, receiver), return_when=asyncio.FIRST_COMPLETED
        )
        for task in done:
            task.result()
    finally:
        stopped.set()
        disconnected.set()
        _ = sender.cancel()
        _ = receiver.cancel()
        while not queue.empty():
            _ = queue.get_nowait()
        with CancelScope(shield=True):
            _ = await asyncio.gather(sender, receiver, return_exceptions=True)
            await worker
            with suppress(RuntimeError, WebSocketDisconnect, OSError):
                await websocket.close()
