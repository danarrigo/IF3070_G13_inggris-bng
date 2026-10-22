import { useEffect, useMemo, useState } from 'react'
import { loadRuns } from '../api/runs'
import type { SteepestAscentRun } from '../types/run'
import { hillClimbingLabels, hillClimbingStopLabels } from '../types/run'
import DownloadRunButton from './DownloadRunButton'
import ObjectiveChart from './ObjectiveChart'
import ArrangementGrid from './ArrangementGrid'
import { configForRunView } from './runPresentation'

function duration(ms: number) {
  return ms < 1000 ? `${ms.toFixed(1)} ms` : `${(ms / 1000).toFixed(2)} s`
}

export default function ResultsPage({
  active,
  run,
  latestRun,
  view,
  onViewChange,
  onLoadDefault,
}: {
  active: boolean
  run: SteepestAscentRun | null
  latestRun: SteepestAscentRun | null
  view: 'initial' | 'final'
  onViewChange: (view: 'initial' | 'final') => void
  onLoadDefault: (run: SteepestAscentRun) => void
}) {
  const [saved, setSaved] = useState<SteepestAscentRun[]>([])
  const [unavailable, setUnavailable] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [comparisonId, setComparisonId] = useState('')

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    void loadRuns(controller.signal, run?.configHash)
      .then((data) => {
        if (controller.signal.aborted) return
        setError('')
        setSaved(data.runs)
        setUnavailable(data.unavailable)
        if (data.runs[0]) onLoadDefault(data.runs[0])
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            'Comparison data unavailable. Check FastAPI and MongoDB, then refresh. The current result is still available below.'
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [active, refresh, onLoadDefault, run?.configHash])

  const runs = useMemo(
    () =>
      latestRun && !saved.some((item) => item.id === latestRun.id) ? [latestRun, ...saved] : saved,
    [latestRun, saved]
  )
  const comparable = run
    ? runs.filter((item) => item.configHash === run.configHash && item.id !== run.id)
    : []
  const comparison = comparable.find((item) => item.id === comparisonId)
  const result = run?.result

  return (
    <section className="panel results-page" aria-labelledby="results-heading">
      <div className="section-heading">
        <h2 id="results-heading">Run result</h2>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            setError('')
            setRefresh((value) => value + 1)
          }}
        >
          {loading ? 'Loading...' : 'Refresh comparisons'}
        </button>
      </div>
      <p className="field-hint">
        Results for this run only. You can optionally compare it with another saved run using the
        same config.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {unavailable > 0 && (
        <p className="field-hint">
          {unavailable} older or unsupported records lack complete Hill Climbing data and are not
          shown.
        </p>
      )}
      {!run && !loading && (
        <p className="empty-state">
          Complete a run on the Optimization page to view its result here.
        </p>
      )}
      {run && result && (
        <div role="region" aria-label="Saved run results">
          <div className="section-heading result-title">
            <h3>{hillClimbingLabels[run.settings.variant]}</h3>
            <span className="saved-label">Saved</span>
          </div>
          <p className="field-hint">
            Seed {run.random_seed} · Limit {run.settings.iterations} scans ·{' '}
            {new Date(run.created_at).toLocaleString()}
          </p>
          <p className="field-hint">3D ship view</p>
          <div className="scene-switch" role="group" aria-label="Result state view">
            {(['initial', 'final'] as const).map((stage) => (
              <button
                key={stage}
                type="button"
                aria-pressed={view === stage}
                onClick={() => onViewChange(stage)}
              >
                {stage === 'initial' ? 'Initial state' : 'Final state'}
              </button>
            ))}
          </div>
          <div className="result-arrangements">
            {(['initial', 'final'] as const).map((stage) => {
              const placements =
                stage === 'initial' ? result.initial_arrangement : result.final_arrangement
              const objective =
                stage === 'initial' ? result.initial_objective : result.final_objective
              return (
                <section
                  key={stage}
                  className="arrangement-card"
                  aria-label={`${stage === 'initial' ? 'Initial' : 'Final'} arrangement`}
                >
                  <h3>{stage === 'initial' ? 'Initial arrangement' : 'Final arrangement'}</h3>
                  <p className="field-hint">
                    {objective.toLocaleString()} million IDR · {placements.length} loaded ·{' '}
                    {run.config.vehicles.length - placements.length} unloaded
                  </p>
                  <ArrangementGrid
                    config={configForRunView(run, stage)}
                    label={`${stage === 'initial' ? 'Initial' : 'Final'} arrangement grid`}
                  />
                </section>
              )
            })}
          </div>
          <dl className="run-metrics">
            <div>
              <dt>Initial objective</dt>
              <dd>
                {result.initial_objective.toLocaleString()}
                <small>million IDR</small>
              </dd>
            </div>
            <div>
              <dt>Final objective</dt>
              <dd>
                {result.final_objective.toLocaleString()}
                <small>million IDR</small>
              </dd>
            </div>
            <div>
              <dt>Improvement</dt>
              <dd>
                +{(result.final_objective - result.initial_objective).toLocaleString()}
                <small>million IDR</small>
              </dd>
            </div>
            <div>
              <dt>Search duration</dt>
              <dd>{duration(result.runtime_ms)}</dd>
            </div>
            <div>
              <dt>Total iterations</dt>
              <dd>{result.iterations_completed}</dd>
            </div>
            <div>
              <dt>Final loaded / total</dt>
              <dd>
                {result.final_arrangement.length} / {run.config.vehicles.length}
              </dd>
            </div>
            <div>
              <dt>Final unloaded</dt>
              <dd>{result.unloaded_vehicle_ids.length}</dd>
            </div>
            <div>
              <dt>Neighbors evaluated</dt>
              <dd>{result.neighbors_evaluated.toLocaleString()}</dd>
            </div>
          </dl>
          {run.settings.variant === 'sideways' && (
            <p className="field-hint">
              Sideways moves: {result.sideways_moves ?? 'Unavailable'} · Consecutive limit:{' '}
              {run.settings.max_sideways ?? 'Unavailable'}.
            </p>
          )}
          {run.settings.variant === 'random_restart' && (
            <div className="field-hint">
              <p>
                Restarts completed: {result.restarts_completed ?? 'Unavailable'} /{' '}
                {run.settings.max_restart ?? 'Unavailable'}. Final state is the best found across
                all attempts. Drops in the search trace mark fresh restarts.
              </p>
              {result.iterations_per_restart && (
                <details>
                  <summary>Iterations per restart</summary>
                  <ul>
                    {result.iterations_per_restart.map((count, index) => (
                      <li key={index}>
                        {index === 0 ? 'Initial search' : `Restart ${index}`}: {count} scans
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          <ObjectiveChart history={result.objective_history} />
          <p className="field-hint">
            {hillClimbingStopLabels[result.stop_reason]} Iterations include the terminal
            no-improvement scan. Search time excludes initialization, database access, and
            visualization waits.
          </p>
          <div className="run-footer">
            <span>
              Run {run.id.slice(0, 8)} · Config {run.configHash.slice(0, 8)}
            </span>
            <DownloadRunButton run={run} />
          </div>
          <section className="run-comparison" aria-label="Experiment comparison">
            <div className="section-heading">
              <h3>Compare this run</h3>
              <span className="unit-tag">Same config only</span>
            </div>
            <p className="field-hint">
              The main result and ship view stay on this run. Choose one same-config run as a
              comparator.
            </p>
            <label className="number-field saved-run-picker">
              <span>Compare with</span>
              <select
                value={comparison?.id ?? ''}
                onChange={(event) => setComparisonId(event.target.value)}
              >
                <option value="">No comparison</option>
                {comparable.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id.slice(0, 8)} · {hillClimbingLabels[item.settings.variant]} · Seed{' '}
                    {item.random_seed} · Objective {item.result.final_objective}
                  </option>
                ))}
              </select>
            </label>
            {comparable.length === 0 && !loading && (
              <p className="field-hint">No other completed run with the same config yet.</p>
            )}
            {comparison && (
              <div
                className="run-table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Saved run comparison"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Variant</th>
                      <th>Seed</th>
                      <th>Initial</th>
                      <th>Final</th>
                      <th>Duration</th>
                      <th>Scans / limit</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[run, comparison].map((item) => (
                      <tr key={item.id} aria-current={item.id === run.id ? 'true' : undefined}>
                        <td>{hillClimbingLabels[item.settings.variant]}</td>
                        <td>{item.random_seed}</td>
                        <td>{item.result.initial_objective}</td>
                        <td>{item.result.final_objective}</td>
                        <td>{duration(item.result.runtime_ms)}</td>
                        <td>
                          {item.result.iterations_completed} / {item.settings.iterations}
                        </td>
                        <td>{item.id === run.id ? 'This run' : 'Comparison'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
