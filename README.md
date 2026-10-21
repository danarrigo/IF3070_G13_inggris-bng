# Repository Tugas Besar 1 DAI

- 18224031
- 18224093
- 18224107

## Stack

- Backend: FastAPI (Python 3.12+), managed with uv
- Frontend: React + TypeScript, built with Vite (Node.js 22.12+)

## Development

Run each server in a separate terminal from the repository root.

### MongoDB

MongoDB runs in Docker while the backend and frontend stay local:

```bash
docker compose up -d mongodb
```

The database is available from local applications at `mongodb://devroot:devrootpassword@localhost:27017/?authSource=admin`.
The data persists in the `mongodb_data` Docker volume. Stop the container with:

```bash
docker compose down
```

To remove the database data as well, use `docker compose down -v`. Credentials and the host port can be overridden in a root `.env` file with `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, and `MONGO_PORT`.

### Backend

```bash
cd src/backend
uv sync
uv run fastapi dev main.py
```

API: http://127.0.0.1:8000 | Interactive docs: http://127.0.0.1:8000/docs

### Frontend

```bash
cd src/frontend
npm ci
npm run dev
```

Open the URL printed by Vite (usually http://localhost:5173). The scenario editor supports ship settings, a vehicle count with configurable random ranges (length, width, weight, shipping fee, and ETA), individual vehicle edits, an initial-arrangement grid preview, and saving/loading the main config. Generate creates unplaced vehicles; regenerating asks before replacing existing edits. Saving preserves the generated vehicles, not the generation controls. Start MongoDB and the backend to use save/load; editing and previewing work locally. Leave both vehicle positions empty for unplaced vehicles. Algorithm execution is not implemented yet.

Vite proxies `/api` requests to `http://127.0.0.1:8000`, so no development CORS configuration is needed.

## Checks

```bash
(cd src/backend && uv run pytest)
(cd src/frontend && npm run lint && npm test && npm run build)
```

For production, serve `src/frontend/dist` with a static web server and route `/api` to the FastAPI service. Vite's development proxy does not apply to production builds. Run the backend with `uv run fastapi run main.py` from `src/backend`.
