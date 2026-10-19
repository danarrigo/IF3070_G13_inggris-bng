import asyncio
from unittest.mock import MagicMock, patch

from main import app, lifespan


def test_lifespan_stores_and_closes_client() -> None:
    mongo_client = MagicMock()

    async def check_lifespan() -> None:
        with patch("main.create_client", return_value=mongo_client) as create_client:
            async with lifespan(app):
                create_client.assert_called_once_with()
                assert app.state.mongo_client is mongo_client
                mongo_client.close.assert_not_called()

            mongo_client.close.assert_called_once_with()

    asyncio.run(check_lifespan())
