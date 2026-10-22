from typing import Annotated, cast

from fastapi import Depends, FastAPI
from pymongo import MongoClient
from pymongo.database import Database
from starlette.requests import HTTPConnection

from core.config import settings


def create_client() -> MongoClient[dict[str, object]]:
    return MongoClient(
        settings.mongodb_uri,
        serverSelectionTimeoutMS=5000,
    )


def get_database(connection: HTTPConnection) -> Database[dict[str, object]]:
    app = cast(FastAPI, connection.app)
    client = cast(MongoClient[dict[str, object]], app.state.mongo_client)
    return client[settings.mongodb_database]


type DatabaseDep = Annotated[Database[dict[str, object]], Depends(get_database)]
