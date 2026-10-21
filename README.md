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

Open the URL printed by Vite (usually http://localhost:5173). The scenario editor supports ship settings, a vehicle count with configurable random ranges (length, width, weight, shipping fee, and ETA), individual vehicle edits, an initial-arrangement grid preview, and saving/loading the main config. Generate creates unplaced vehicles; regenerating asks before replacing existing edits. Saving preserves the generated vehicles, not the generation controls. Start MongoDB and the backend to use save/load; editing and previewing work locally. The **Use custom starting positions** toggle is saved with the config as `preserve_positions`. Off (default) randomizes all positions and disables X/Y editing; on preserves filled X/Y pairs and randomizes vehicles without positions. Turning it off retains custom coordinates for later, but ignores them in the preview and initializer. Algorithm execution is not implemented yet.

Vite proxies `/api` requests to `http://127.0.0.1:8000`, so no development CORS configuration is needed.

## Search foundation and assignment status

The shared Python foundation supports rectangle validation, shipping-fee scoring, seeded random initialization, and the required swap/move/orientation neighbor categories.

- Assignment runs use fully random initial positions by default. `prepare_run()` follows the saved config's `preserve_positions` toggle; an explicit `preserve_positions=True/False` argument can override it for a run. Custom-start mode is not the default experiment mode.
- Moves can choose any fitting deck coordinate, not just an adjacent cell. Moving outside the ship unloads a vehicle.
- Swaps exchange two loaded vehicles' anchors, or atomically replace a loaded vehicle with an unloaded one. Dimensions/orientation are retained for loaded vehicles and the whole result is validated.
- Outside vehicles have no stored coordinates in the placement-list representation. Two unloaded vehicles swapping is therefore unchanged and skipped. An unloaded vehicle's orientation is chosen when entering the deck.
- `prepare_run()` prepares a starting state only. No optimization algorithm or execution endpoint is implemented yet.

Remaining assignment work includes Hill Climbing (at least one named variant), Simulated Annealing, Genetic Algorithm, and their execution/results UI. Completed runs must preserve actual initial/final arrangements and objective values, duration, iteration counts, and the required algorithm-specific data: SA's `exp(delta_E / T)` history/local-optimum frequency and GA's maximum/average population objective history. These metrics are not produced by the current foundation.

Experiments require 3 Hill Climbing runs, 3 SA runs, and 18 GA runs (9 varying iterations at fixed population size plus 9 varying population size at fixed iterations). Submit the report and saved outputs, include the completed Generative AI Usage Form in the report, and publish a tagged GitHub release as required by the assignment.

## Checks

```bash
(cd src/backend && uv run pytest)
(cd src/frontend && npm run lint && npm test && npm run build)
```

For production, serve `src/frontend/dist` with a static web server and route `/api` to the FastAPI service. Vite's development proxy does not apply to production builds. Run the backend with `uv run fastapi run main.py` from `src/backend`.
