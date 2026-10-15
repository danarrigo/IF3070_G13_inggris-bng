# Repository Tugas Besar 1 DAI

- 18224031
- 18224093
- 18224107

## Stack

- Backend: FastAPI (Python 3.12+), managed with uv
- Frontend: React + TypeScript, built with Vite (Node.js 22.12+)

## Development

Run each server in a separate terminal from the repository root.

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

Open the URL printed by Vite (usually http://localhost:5173). The starter page checks the backend connection. Vite proxies `/api` requests to `http://127.0.0.1:8000`, so no development CORS configuration is needed.

## Checks

```bash
(cd src/backend && uv run pytest)
(cd src/frontend && npm run lint && npm run build)
```

For production, serve `src/frontend/dist` with a static web server and route `/api` to the FastAPI service. Vite's development proxy does not apply to production builds. Run the backend with `uv run fastapi run main.py` from `src/backend`.
