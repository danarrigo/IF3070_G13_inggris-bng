from typing import cast

from fastapi import FastAPI, Request
from pymongo import MongoClient
from pymongo.database import Database

from core.config import settings


def create_client() -> MongoClient[dict[str, object]]:
    return MongoClient(
        settings.mongodb_uri,
        serverSelectionTimeoutMS=5000,
    )


def get_database(request: Request) -> Database[dict[str, object]]:
    app = cast(FastAPI, request.app)
    client = cast(MongoClient[dict[str, object]], app.state.mongo_client)
    return client[settings.mongodb_database]
