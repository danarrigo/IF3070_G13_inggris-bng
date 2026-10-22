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

Open the URL printed by Vite (usually http://localhost:5173). The scenario editor supports ship settings, a vehicle count with configurable random ranges (length, width, weight, shipping fee, and ETA), individual vehicle edits, an initial-arrangement grid preview, and saving/loading the main config. Generate creates unplaced vehicles; regenerating asks before replacing existing edits. Saving preserves the generated vehicles, not the generation controls. Start MongoDB and the backend to use save/load; editing and previewing work locally. The **Use custom starting positions** toggle is saved with the config as `preserve_positions`. Off (default) randomizes all positions and disables X/Y editing; on preserves filled X/Y pairs and randomizes vehicles without positions. Turning it off retains custom coordinates for later, but ignores them in the preview and initializer. The config page contains configuration only. Use **Next: Optimization** to open the separate Steepest Ascent page; **Back to config** preserves the current draft and generation controls.

Vite proxies HTTP and WebSocket `/api` requests to `http://127.0.0.1:8000`, so no development CORS configuration is needed.

## Bonus objective: ETA priority

On the Config page, select **Objective mode → ETA priority (bonus)**. This mode uses **ETA only**, not shipping fees:

```text
score = sum(maximum ETA in the config + 1 - vehicle ETA) for loaded vehicles
```

Smaller ETA earns more points; all contributions are positive, so an empty ship does not win simply by loading nothing. This maximizes total loaded urgency, not the average/minimum ETA. HC (all variants), SA, GA, replay, saved snapshots, and charts use the selected mode. ETA scores are labeled **ETA priority points**, never monetary revenue. **Shipping fee (required)** remains the default for mandatory experiments. Different objective modes produce different config hashes and are not mixed in same-config comparisons; existing fee-mode hashes remain compatible.

## Running Steepest Ascent

1. Configure or load a scenario and add vehicles on `/#config`.
2. Click **Next: Optimization**. Invalid or incomplete config fields must be corrected before continuing.
3. On `/#optimization`, select **Hill Climbing** under Algorithm, then choose **Steepest Ascent**, **Stochastic**, **Sideways Move**, or **Random Restart**. Set **Random seed** and **Max iterations** (1-10,000). Sideways exposes **Max sideways moves**; Random Restart exposes **Max restarts**, with the iteration budget shared across all attempts. Click the selected variant's Run button. The backend executes the current draft snapshot and saves the completed run in MongoDB. Saving the main config first is not required, and running does not overwrite it.
4. **Show every neighbor** is off by default: the scene moves directly to each completed iteration's chosen state, without best-so-far previews. Enable it to display each valid neighbor in order, without sampling or dropped frames. Amber wireframes identify the changed vehicles; the card shows the neighbor number, action, score, and whether it improves or ties the current/best score. Rejected previews never update the committed state or graph.
5. Use **Slower** / **Faster** to change visualization speed from **0.25× to 8×**, including during a run. Vehicle transitions follow the same speed. Large neighborhoods take time to display; speed changes do not change search decisions. Reduced-motion mode disables interpolated movement, not individual neighbor previews.
6. Use **Stop search** to cancel active work and pending playback. Disconnecting also cancels active computation. Partial runs are not saved; a run already saved before a disconnect remains stored.
7. Review objective values, search duration, iteration count, loaded/unloaded counts, and the objective graph. **Initial state** / **Current state** are available during execution, then **Initial state** / **Final state** after completion. **Draft** shows the editor preview. **Download JSON** exports completed, saved runs.

After optimization, use **Next: Results** to inspect **one run**: initial/final states, objective history, duration, iterations, and JSON export. Initial and final arrangements each have their own grid, shown together (stacked on small screens); the initial/final buttons independently control the 3D ship view. **Compare with** optionally adds one other MongoDB run with the exact same config hash to a side-by-side metrics table; it never replaces the primary result or ship view. Results is not an all-run history page.

**Compare iteration** lets you revisit any completed scan, toggle **Before iteration** / **After iteration** in the 3D and grid views, and inspect the objective delta. No-improvement scans show identical states. This replay is captured from the live stream and retained for the current page session, including after completion or cancellation; saved run JSON still contains the initial/final arrangements and objective history, not per-iteration placements.

Navigation uses browser history, so Back/Forward work without discarding the in-memory config draft, generator controls, algorithm settings, or completed result. Configuration always shows the draft arrangement, not the run's final state. Unsaved drafts do not survive a full browser refresh; use Save config before reloading.

The non-streaming endpoint remains `POST /api/optimization/hill-climbing`, with `{ "config": { ... }, "random_seed": 42, "iterations": 100 }`. Set `variant` to `steepest_ascent` (default), `stochastic`, `sideways`, or `random_restart`; optional `max_sideways` and `max_restart` configure their limits. Stochastic weights improving neighbors by their score increase. Random Restart returns the best state across attempts and records restart counts plus iterations per attempt.

### WebSocket protocol

Connect to `/api/optimization/hill-climbing/live` on the same host, then send the same execution request as the first JSON message. Add `"show_neighbors": true` to emit every valid neighbor (the API default is false). The frontend also sends `"acknowledge_progress": true` for lossless, paced delivery. One connection runs one search. Browser origins must match the request host.

- `progress`: `phase` (`initial`, `candidate`, `best`, or `iteration`), `iteration`, `arrangement`, `objective`, `current_objective`, `neighbors_evaluated`, and `runtime_ms`. The initial event additionally includes the config snapshot. `candidate` describes a non-winning neighbor; `best` describes a strictly improving best-so-far candidate. Neither commits it. `initial` and `iteration` describe committed states.
- `complete`: `run`, emitted only after persistence succeeds.
- `cancelled`: cancellation confirmed, without saving a partial run.
- `error`: `detail`, for invalid input, execution failure, or persistence failure.
- Client control message: `{ "type": "cancel" }`.
- With `acknowledge_progress` enabled, each progress event includes a `sequence` integer. After displaying that frame, send `{ "type": "ack", "sequence": 1 }` with its actual sequence. The server waits before sending the next progress event. Cancellation does not require acknowledging a pending frame.

CPU search runs off the event loop. A bounded queue plus per-frame acknowledgements prevent unbounded buffering without dropping neighbors; visualization waits are excluded from reported search time. Backpressure may pause the worker while the viewer catches up, and cancellation is checked during initialization, neighborhood enumeration, scoring, and before persistence. The existing HTTP endpoint uses the same algorithm without streaming.

The search rule remains strict Steepest Ascent: scan all valid neighbors, accept the highest objective only if it improves the current state, and stop at a local optimum or the requested iteration limit. Each iteration is one complete neighborhood scan, including the final no-improvement scan. Search time excludes database access, initial-state generation, and progress callback/delivery time. Large fleets/decks can be expensive because enumeration is exhaustive.

New execution results store the actual initial/final placements and search metrics. Older manually saved runs can have null metadata rather than fabricated initial states.

## Search foundation and assignment status

The shared Python foundation supports rectangle validation, shipping-fee scoring, seeded random initialization, and the required swap/move/orientation neighbor categories.

- Assignment runs use fully random initial positions by default. `prepare_run()` follows the saved config's `preserve_positions` toggle; an explicit `preserve_positions=True/False` argument can override it for a run. Custom-start mode is not the default experiment mode.
- Moves can choose any fitting deck coordinate, not just an adjacent cell. Moving outside the ship unloads a vehicle.
- Swaps exchange two loaded vehicles' anchors, or atomically replace a loaded vehicle with an unloaded one. Dimensions/orientation are retained for loaded vehicles and the whole result is validated.
- Outside vehicles have no stored coordinates in the placement-list representation. Two unloaded vehicles swapping is therefore unchanged and skipped. An unloaded vehicle's orientation is chosen when entering the deck.
- `prepare_run()` prepares a saved-config starting state; `prepare_config()` prepares an immutable request snapshot. The execution service passes that snapshot to the pure `steepest_ascent()` search and persists the result.

All four HC variants are available through the API and FE. Results label the actual variant, include sideways/restart metrics when applicable, and compare variants only across identical config snapshots. SA and GA have their own panels in the Algorithm selector, including their experiment plots. Remaining assignment work includes completing and reviewing the required experiments, comparison analysis, report, and release.

Experiments require 3 Hill Climbing runs, 3 SA runs, and 18 GA runs (9 varying iterations at fixed population size plus 9 varying population size at fixed iterations). Submit the report and saved outputs, include the completed Generative AI Usage Form in the report, and publish a tagged GitHub release as required by the assignment.

## Checks

```bash
(cd src/backend && uv run ruff format --check . && uv run ruff check . && uv run basedpyright && uv run pytest)
(cd src/frontend && npm run format:check && npm run lint && npm run typecheck && npm test && npm run build)
```

Backend application modules use strict type checking; tests use standard checking to accommodate dynamic mocks. Apply formatting with `uv run ruff format .` in `src/backend` and `npm run format` in `src/frontend`.

For production, serve `src/frontend/dist` with a static web server and route `/api` to the FastAPI service, including WebSocket upgrade support and the original Host header. Vite's development proxy does not apply to production builds. Run the backend with `uv run fastapi run main.py` from `src/backend`.
