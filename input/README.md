# Experiment inputs

All 33 experiments use `config.json`: the saved 10 x 20 deck, weight capacity 10000, and the same 10 vehicles. Shipping fee is the mandatory objective; custom starting positions are disabled. The original saved configuration is not modified.

## Plan

- HC: all four variants, each with seeds 42, 43, 44 (12 runs). Total iteration budget 100; consecutive sideways limit 10; random restart limit 3 (up to four attempts).
- SA: seeds 42, 43, 44 (3 runs). Maximum 1000 iterations; initial temperature 1000; cooling rate 0.99; minimum temperature 0.001; stagnation window 100.
- GA: (population, iterations) = (30, 50), (30, 100), (30, 200), (10, 100), (20, 100), (40, 100). Each combination uses seeds 42, 43, 44 (18 runs). Crossover 0.8; mutation 0.3; demo recording off.

## Reproduce and locate results

`requests/` contains complete JSON request bodies, including the full configuration. `experiments.json` lists each request, its POST endpoint, status, run ID, and output directory. With FastAPI and MongoDB running, POST the corresponding JSON to its listed endpoint. GA starts an asynchronous job; poll `/api/jobs/<job-id>` until completed. Re-running creates new run IDs and output folders.

For example:

```bash
curl --fail-with-body -H 'Content-Type: application/json' --data-binary @input/requests/hc-steepest_ascent-seed-42.json http://localhost:8000/api/optimization/hill-climbing
```

`initial_states/seed-*.json` records the actual shared HC/SA starting arrangement. Different seeds vary the start; all HC variants and SA are checked to share exactly the same initial arrangement for a given seed. GA instead reports the best individual in its initial population, which can vary with population size.

Results are saved in MongoDB and `output/<algorithm>/<run-id>/`. Each bundle contains `summary.json`, full `run.json`, initial/final SVG arrangements, and objective charts. SA also includes the exponential chart; overflow is explicitly represented using the natural logarithm. `output/experiments.csv` summarizes completed runs for analysis.

SA stuck counts are stagnation-window episodes, not a proof of local optima. Sideways uses a consecutive limit reset by improvements. These definitions must be disclosed in the report.
