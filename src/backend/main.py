from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

from api.config import router as config_router
from api.runs import router as runs_router
from api.jobs import router as jobs_router
from core.database import create_client
from services.job_service import JobManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    client = create_client()
    try:
        app.state.mongo_client = client
        yield
    finally:
        client.close()


app = FastAPI(title="DAI API", lifespan=lifespan)
app.state.jobs = JobManager()
app.include_router(config_router)
app.include_router(runs_router)
app.include_router(jobs_router)


class HealthResponse(BaseModel):
    status: str


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")
