from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

from core.database import create_client


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    client = create_client()
    try:
        app.state.mongo_client = client
        yield
    finally:
        client.close()


app = FastAPI(title="DAI API", lifespan=lifespan)


class HealthResponse(BaseModel):
    status: str


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")
