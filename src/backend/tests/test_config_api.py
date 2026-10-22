import asyncio
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from pymongo.errors import DuplicateKeyError

from core.database import get_database
from main import app


@pytest.mark.parametrize("preserve_positions", [False, True])
@pytest.mark.parametrize(
    ("method", "case", "expected_status"),
    [
        ("GET", "success", 200),
        ("GET", "missing", 404),
        ("POST", "success", 201),
        ("POST", "duplicate", 409),
        ("POST", "invalid", 422),
        ("PUT", "success", 200),
        ("PUT", "missing", 404),
        ("DELETE", "success", 204),
        ("DELETE", "missing", 404),
    ],
)
def test_config_endpoints(
    method: str, case: str, expected_status: int, preserve_positions: bool
) -> None:
    db = MagicMock()
    payload = {
        "ship": {"length": 10, "width": 5, "max_weight": 1000},
        "vehicles": [],
        "preserve_positions": preserve_positions,
    }
    db["config"].find_one.return_value = (
        None if case == "missing" else {"_id": "config", **payload}
    )
    db["config"].replace_one.return_value.matched_count = 0 if case == "missing" else 1
    db["config"].delete_one.return_value.deleted_count = 0 if case == "missing" else 1
    if case == "duplicate":
        db["config"].insert_one.side_effect = DuplicateKeyError("duplicate")

    async def check_endpoint() -> None:
        app.dependency_overrides[get_database] = lambda: db
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.request(
                    method,
                    "/api/config",
                    json=({} if case == "invalid" else payload)
                    if method in {"POST", "PUT"}
                    else None,
                )
            assert response.status_code == expected_status
            if expected_status in {200, 201}:
                assert response.json() == {**payload, "objective_mode": "shipping_fee"}
                assert response.headers["content-type"] == "application/json"
            elif expected_status == 204:
                assert response.content == b""
            if case == "invalid":
                db["config"].insert_one.assert_not_called()
        finally:
            app.dependency_overrides.pop(get_database, None)

    asyncio.run(check_endpoint())
