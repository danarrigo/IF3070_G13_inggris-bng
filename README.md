# Optimasi Pemuatan Kendaraan ke Kapal

Tugas Besar 1 IF3070 Dasar Inteligensi Artifisial 2026/2027, **Kelompok 13 - inggris-bng**.

Aplikasi ini mencari susunan kendaraan pada geladak kapal untuk memaksimalkan total shipping fee tanpa overlap, keluar batas geladak, atau melebihi kapasitas berat. Implementasi pencarian menggunakan Python: Steepest Ascent, Stochastic, Sideways, Random Restart Hill Climbing, Simulated Annealing, dan Genetic Algorithm. Antarmuka web menyediakan konfigurasi, visualisasi 2D/3D, grafik hasil, penyimpanan MongoDB, serta ekspor berkas eksperimen. Bonus objective ETA tersedia terpisah dari objective wajib shipping fee.

## Anggota dan pembagian tugas

| NIM | Pembagian tugas |
| --- | --- |
| 18224031 | Implementasi Hill Climbing |
| 18224093 | Implementasi Simulated Annealing |
| 18224107 | Implementasi Genetic Algorithm |

## Struktur repository

```text
src/backend/    Algoritma Python, FastAPI, penyimpanan, dan pengujian
src/frontend/   Antarmuka React/TypeScript dan visualisasi Three.js
input/          Config, 33 request eksperimen, state awal, dan indeks input-output
output/         Hasil run, ringkasan metrik, grafik SVG, dan experiments.csv
docs/           Lokasi laporan PDF dan lampiran tugas
```

Laporan PDF belum tersedia di `docs/`. Berkas eksperimen tidak menggantikan analisis, laporan, referensi, atau Form Penggunaan Generative AI.

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
# Preserve an existing environment file; copy defaults on first setup only.
[ -f .env ] || cp .env.example .env
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

Open the URL printed by Vite (usually http://localhost:5173). The scenario editor supports ship settings, a vehicle count with configurable random ranges (length, width, weight, shipping fee, and ETA), individual vehicle edits, an initial-arrangement grid preview, and saving/loading the main config. Generate creates unplaced vehicles; regenerating asks before replacing existing edits. Saving preserves the generated vehicles, not the generation controls. Start MongoDB and the backend to use save/load; editing and previewing work locally. The **Use custom starting positions** toggle is saved with the config as `preserve_positions`. Off (default) randomizes all positions and disables X/Y editing; on preserves filled X/Y pairs and randomizes vehicles without positions. Turning it off retains custom coordinates for later, but ignores them in the preview and initializer. The config page contains configuration only. Use **Next: Optimization** to open the separate optimization page and choose HC, SA, or GA; **Back to config** preserves the current draft and generation controls.

Vite proxies HTTP and WebSocket `/api` requests to `http://127.0.0.1:8000`, so no development CORS configuration is needed.

## Saving and exporting results

To replay an experiment in the web UI, click **Import experiment JSON** and choose a file from `input/requests/`. It restores the config, algorithm/variant, seed, parameters, and output/demo options without starting a run or overwriting the saved MongoDB config. Review the fields and click Run. Importing `input/config.json` restores only the configuration. Imports are disabled during an active run, and replacing an edited draft requires confirmation.

Completed web runs for HC, SA, and GA automatically save to MongoDB. SA's single-run and three-experiment actions report completion only after storage succeeds; database failures are shown as errors. The standalone SA experiment CLI remains available without MongoDB.

- HC: download the selected run as JSON.
- SA: export all runs in the current experiment batch as JSON.
- GA: saved history and replay are available.

For any algorithm, enable **Save results to output/** before running. Completed runs also write to `output/<algorithm>/<run-id>/`:

- `summary.json`: seed, objective mode/unit, parameters, scores, duration, iteration/generation counts, and applicable sideways/restart/stagnation metrics.
- `run.json`: full config, initial/final states, histories, and replay data when recorded.
- `initial.svg`, `final.svg`: deck arrangement and unloaded vehicles.
- `objective.svg`: objective history; GA includes population maximum and average.
- SA additionally writes `exponential.svg`. If the raw exponential overflows, the graph explicitly uses its natural logarithm. JSON retains finite raw exponentials and `log_acceptance`; overflowed raw exponentials are `null`.

Files are generated by the backend in this repository, not in the browser Downloads folder. MongoDB auto-save remains enabled independently of the checkbox. Failed/cancelled searches do not generate report bundles; completed bundles are published only after all their files have been written. SA's `stuck_count` counts stagnation-window episodes, not proven local optima.

## Bonus objective: ETA priority

On the Config page, select **Objective mode → ETA priority (bonus)**. This mode uses **ETA only**, not shipping fees:

```text
score = sum(maximum ETA in the config + 1 - vehicle ETA) for loaded vehicles
```

Smaller ETA earns more points; all contributions are positive, so an empty ship does not win simply by loading nothing. This maximizes total loaded urgency, not the average/minimum ETA. HC (all variants), SA, GA, replay, saved snapshots, and charts use the selected mode. ETA scores are labeled **ETA priority points**, never monetary revenue. **Shipping fee (required)** remains the default for mandatory experiments. Different objective modes produce different config hashes and are not mixed in same-config comparisons; existing fee-mode hashes remain compatible.

## Running Hill Climbing

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

All four HC variants are available through the API and FE. Results label the actual variant, include sideways/restart metrics when applicable, and compare variants only across identical config snapshots. SA and GA have their own panels in the Algorithm selector, including their experiment plots.

### Eksperimen yang sudah dijalankan

Sebanyak **33 run** tersimpan di `output/`, dengan input masing-masing di `input/requests/` dan pemetaan run ID di `input/experiments.json`. Rekap lintas run tersedia di `output/experiments.csv`.

Semua memakai kapal berukuran 10 x 20, kapasitas berat 10.000, daftar 10 kendaraan yang sama, objective **shipping fee**, dan custom starting positions nonaktif. Seed 42, 43, dan 44 digunakan pada setiap varian/konfigurasi. Untuk seed yang sama, state awal keempat varian HC dan SA telah diperiksa identik; state antar-seed berbeda. GA menggunakan populasi susunan acak dan melaporkan individu terbaik dari populasi awal sebagai initial arrangement.

| Algoritma/kelompok | Parameter | Run |
| --- | --- | ---: |
| Steepest Ascent HC | Maksimum 100 iterasi | 3 |
| Stochastic HC | Maksimum 100 iterasi | 3 |
| Sideways HC | Maksimum 100 iterasi; batas sideways berturut-turut 10 | 3 |
| Random Restart HC | Total maksimum 100 iterasi; maksimum 3 restart | 3 |
| SA | Maksimum 1.000 iterasi; suhu awal 1.000; cooling rate 0,99; suhu minimum 0,001; stagnation window 100 | 3 |
| GA: populasi tetap | Populasi 30; iterasi 50, 100, 200; masing-masing 3 run | 9 |
| GA: iterasi tetap | Iterasi 100; populasi 10, 20, 40; masing-masing 3 run | 9 |
| **Total** | | **33** |

GA menggunakan crossover rate 0,8 dan mutation rate 0,3; demo recording nonaktif. Parameter lengkap tersimpan pada request dan summary setiap run. Buka SVG lewat browser untuk melihat gambar dan grafik.

### Catatan interpretasi dan pengumpulan

- Sideways membatasi gerakan sama-skor **berturut-turut**; perbaikan skor mereset hitungan. Cocokkan interpretasi ini dengan salindia/asisten karena spesifikasi tidak menjelaskan reset.
- SA `stuck_count` menghitung episode tanpa best objective baru selama stagnation window, bukan pembuktian local optimum. Jelaskan definisinya dalam analisis.
- Config, seed, dan parameter disimpan agar eksperimen dapat dijalankan ulang. Mengimpor file tidak mengunci field: perubahan manual dapat mengubah hasil. Pengulangan seluruh 33 run untuk memverifikasi determinisme belum dilakukan; durasi, timestamp, dan run ID memang dapat berbeda.
- Bandingkan skor akhir, durasi, konsistensi tiga pengulangan, serta pengaruh populasi/iterasi GA. Jangan menyimpulkan global optimum tanpa dasar pembanding atau pembuktian.
- Laporan PDF di `docs/` harus mencakup cover, deskripsi persoalan, implementasi algoritma, hasil dan analisis beserta visualisasi, kesimpulan/saran, pembagian tugas, referensi, serta Form Penggunaan Generative AI yang diisi jujur.
- Sebelum pengumpulan, lengkapi pembagian tugas README, commit/push sumber beserta `input/` dan `output/`, pastikan repository public, dan buat release dengan tag **`vX.Y`** sesuai milestone/revisi.

## Checks

```bash
(cd src/backend && uv run ruff format --check . && uv run ruff check . && uv run basedpyright && uv run pytest)
(cd src/frontend && npm run format:check && npm run lint && npm run typecheck && npm test && npm run build)
```

Backend application modules use strict type checking; tests use standard checking to accommodate dynamic mocks. Apply formatting with `uv run ruff format .` in `src/backend` and `npm run format` in `src/frontend`.

For production, serve `src/frontend/dist` with a static web server and route `/api` to the FastAPI service, including WebSocket upgrade support and the original Host header. Vite's development proxy does not apply to production builds. Run the backend with `uv run fastapi run main.py` from `src/backend`.
