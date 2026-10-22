import asyncio
from concurrent.futures import TimeoutError as FutureTimeoutError
from contextlib import suppress
from threading import Event

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from dtos.run import AnnealingRequest
from models.run import RunModel, StateSnapshot
from services.search_service import execute_runs

router = APIRouter()


@router.post("/api/search/simulated-annealing", response_model=list[RunModel])
def execute_annealing(request: AnnealingRequest) -> list[RunModel]:
    # Compute independently of MongoDB; users may save completed runs separately.
    try:
        return execute_runs(
            request.config, request.settings, request.random_seed, request.run_count
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.websocket("/api/search/simulated-annealing/stream")
async def stream_annealing(websocket: WebSocket) -> None:
    await websocket.accept()
    stopped = Event()
    worker = None
    try:
        request = AnnealingRequest.model_validate(await websocket.receive_json())
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict[str, object]] = asyncio.Queue(maxsize=4)

        def observe(index: int, snapshot: StateSnapshot) -> None:
            if stopped.is_set():
                raise RuntimeError("Search disconnected.")
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
            while True:
                try:
                    future.result(timeout=0.1)
                    break
                except FutureTimeoutError:
                    if not stopped.is_set():
                        continue
                    future.cancel()
                    raise RuntimeError("Search disconnected.") from None

        async def compute() -> None:
            try:
                runs = await asyncio.to_thread(
                    execute_runs,
                    request.config,
                    request.settings,
                    request.random_seed,
                    request.run_count,
                    observe,
                )
                await queue.put(
                    {
                        "type": "complete",
                        "runs": [run.model_dump(mode="json") for run in runs],
                    }
                )
            except (ValueError, RuntimeError) as exc:
                await queue.put({"type": "error", "message": str(exc)})

        worker = asyncio.create_task(compute())
        while True:
            message = await queue.get()
            await websocket.send_json(message)
            if message["type"] != "progress":
                break
    except ValidationError:
        await websocket.send_json(
            {"type": "error", "message": "Invalid search parameters or config."}
        )
    except WebSocketDisconnect:
        pass
    finally:
        stopped.set()
        if worker is not None:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker
        with suppress(RuntimeError, WebSocketDisconnect):
            await websocket.close()
