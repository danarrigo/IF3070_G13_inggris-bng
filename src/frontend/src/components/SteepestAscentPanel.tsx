import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { executeHillClimbingLive, RunCancelledError } from '../api/liveOptimization'
import type { Config } from '../types/config'
import { objectiveUnit } from '../objective'
import type {
  HillClimbingVariant,
  IterationComparison,
  LiveRun,
  SceneView,
  SteepestAscentRun,
} from '../types/run'
import { hillClimbingLabels, hillClimbingStopLabels, isHillClimbingVariant } from '../types/run'
import ObjectiveChart from './ObjectiveChart'
import DownloadRunButton from './DownloadRunButton'
import { describeNeighbor, sameConfig } from './runPresentation'
import { createSearchPlayback } from './searchPlayback'

const playbackSpeeds = [0.25, 0.5, 1, 2, 4, 8]

function SteepestAscentPanel({
  config,
  run,
  live,
  view,
  onViewChange,
  playbackSpeed,
  onSpeedChange,
  selectedIteration,
  comparison,
  onComparisonChange,
  onComplete,
  onProgress,
  onStart,
  onRunningChange,
  validateConfig,
}: {
  config: Config
  run: SteepestAscentRun | null
  live: LiveRun | null
  view: SceneView
  onViewChange: (view: SceneView) => void
  playbackSpeed: number
  onSpeedChange: (speed: number) => void
  selectedIteration: number | null
  comparison: IterationComparison | null
  onComparisonChange: (iteration: number | null, side: 'before' | 'after') => void
  onComplete: (run: SteepestAscentRun) => void
  onProgress: (live: LiveRun) => void
  onStart: () => void
  onRunningChange: (running: boolean) => void
  validateConfig: () => boolean
}) {
  const [seed, setSeed] = useState<number | null>(42)
  const [iterations, setIterations] = useState<number | null>(100)
  const [variant, setVariant] = useState<HillClimbingVariant>('steepest_ascent')
  const [maxSideways, setMaxSideways] = useState<number | null>(100)
  const [maxRestart, setMaxRestart] = useState<number | null>(10)
  const [running, setRunning] = useState(false)
  const [showNeighbors, setShowNeighbors] = useState(false)
  const [saveToOutput, setSaveToOutput] = useState(false)
  const [outputRunId, setOutputRunId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  const playbackRef = useRef<ReturnType<typeof createSearchPlayback> | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controllerRef.current?.abort()
      playbackRef.current?.dispose()
    }
  }, [])

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (controllerRef.current) return
    setError('')
    if (!validateConfig()) {
      setError('Fix the configuration fields before starting the run.')
      return
    }
    if (
      seed === null ||
      iterations === null ||
      (variant === 'sideways' && maxSideways === null) ||
      (variant === 'random_restart' && maxRestart === null)
    )
      return
    const controller = new AbortController()
    controllerRef.current = controller
    setCancelling(false)
    setCancelled(false)
    setOutputRunId(null)
    setRunning(true)
    onRunningChange(true)
    onStart()
    const playback = createSearchPlayback((frame) => {
      if (mounted.current) onProgress(frame)
    })
    playback.setSpeed(playbackSpeed)
    playbackRef.current = playback
    try {
      const completed = await executeHillClimbingLive(
        config,
        seed,
        iterations,
        (frame) => {
          if (!showNeighbors && (frame.phase === 'best' || frame.phase === 'candidate')) return
          return playback.push(frame)
        },
        controller.signal,
        showNeighbors,
        {
          variant,
          max_sideways: maxSideways ?? 100,
          max_restart: maxRestart ?? 10,
          save_to_output: saveToOutput,
        }
      )
      await playback.drain()
      if (mounted.current) {
        onComplete(completed)
        setOutputRunId(saveToOutput ? completed.id : null)
      }
    } catch (cause) {
      playback.dispose()
      if (mounted.current) {
        if (cause instanceof RunCancelledError) setCancelled(true)
        else setError(cause instanceof Error ? cause.message : 'Could not complete the run.')
      }
    } finally {
      playback.dispose()
      playbackRef.current = null
      controllerRef.current = null
      if (mounted.current) {
        setRunning(false)
        setCancelling(false)
        onRunningChange(false)
      }
    }
  }

  function stop() {
    setCancelling(true)
    controllerRef.current?.abort()
    playbackRef.current?.dispose()
  }

  function changeSpeed(direction: number) {
    const index = playbackSpeeds.indexOf(playbackSpeed)
    const speed =
      playbackSpeeds[Math.max(0, Math.min(playbackSpeeds.length - 1, index + direction))]
    playbackRef.current?.setSpeed(speed)
    onSpeedChange(speed)
  }

  const preview = live?.neighbor_preview
  const previewVerdict =
    preview && live
      ? preview.kind === 'best'
        ? 'New best so far'
        : preview.objective < live.objective
          ? 'Worse than current'
          : preview.objective === live.objective
            ? live.variant === 'sideways'
              ? 'Equal score; eligible sideways move'
              : 'Equal to current; not improving'
            : preview.objective === live.best_objective
              ? 'Ties the best score in this scan'
              : 'Improves current, but below best so far'
      : ''
  const displayVariant = run?.settings.variant ?? live?.variant ?? variant
  const snapshot = run?.config ?? live?.config
  const unit = objectiveUnit(snapshot ?? config)
  const changed = snapshot !== undefined && !sameConfig(snapshot, config)
  const initialObjective = run?.result.initial_objective ?? live?.initial_objective ?? 0
  const objective = run?.result.final_objective ?? live?.objective ?? 0
  const arrangement = run?.result.final_arrangement ?? live?.arrangement ?? []
  const history = run?.result.objective_history ?? live?.objective_history ?? []
  const runtime = run?.result.runtime_ms ?? live?.runtime_ms ?? 0
  const completedIterations = run?.result.iterations_completed ?? live?.iteration ?? 0
  const evaluated = run?.result.neighbors_evaluated ?? live?.neighbors_evaluated ?? 0
  const stages: SceneView[] = run
    ? ['configuration', 'initial', 'final']
    : ['configuration', 'initial', 'live']

  return (
    <section className="panel optimization-panel" aria-labelledby="optimization-heading">
      <div className="section-heading">
        <h2 id="optimization-heading">Hill Climbing</h2>
        <span className="unit-tag">{hillClimbingLabels[variant]}</span>
      </div>
      <form
        onSubmit={(event) => {
          void execute(event)
        }}
        className="optimization-form"
      >
        <fieldset disabled={running} className="run-controls">
          <label className="number-field saved-run-picker hc-variant">
            <span>Hill Climbing variant</span>
            <select
              aria-label="Hill Climbing variant"
              value={variant}
              onChange={(event) => {
                if (isHillClimbingVariant(event.target.value)) setVariant(event.target.value)
              }}
            >
              {Object.entries(hillClimbingLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="optimization-fields">
            <label className="number-field">
              <span>Random seed</span>
              <input
                type="number"
                step={1}
                min={0}
                max={Number.MAX_SAFE_INTEGER}
                required
                value={seed ?? ''}
                onChange={(event) =>
                  setSeed(event.target.value === '' ? null : event.target.valueAsNumber)
                }
              />
            </label>
            <label className="number-field">
              <span>Max iterations</span>
              <input
                type="number"
                step={1}
                min={1}
                max={10000}
                required
                value={iterations ?? ''}
                onChange={(event) =>
                  setIterations(event.target.value === '' ? null : event.target.valueAsNumber)
                }
              />
            </label>
            {(variant === 'sideways' || variant === 'random_restart') && (
              <label className="number-field">
                <span>{variant === 'sideways' ? 'Max sideways moves' : 'Max restarts'}</span>
                <input
                  type="number"
                  min={0}
                  max={variant === 'sideways' ? 10000 : 1000}
                  step={1}
                  required
                  value={(variant === 'sideways' ? maxSideways : maxRestart) ?? ''}
                  onChange={(event) => {
                    const value = event.target.value === '' ? null : event.target.valueAsNumber
                    if (variant === 'sideways') setMaxSideways(value)
                    else setMaxRestart(value)
                  }}
                />
              </label>
            )}
          </div>
          <p className="field-hint">
            {variant === 'stochastic'
              ? 'Randomly chooses an improving neighbor, weighted by its improvement. It need not choose the maximum.'
              : variant === 'sideways'
                ? 'Allows equal-score moves up to the consecutive sideways limit; improvement resets the counter.'
                : variant === 'random_restart'
                  ? 'Restarts from fresh random states and returns the best found. Max iterations is the total budget across all attempts.'
                  : 'Chooses the highest-scoring neighbor only when it strictly improves the current state.'}
          </p>
          <label className="neighbor-exploration">
            <input
              type="checkbox"
              checked={saveToOutput}
              onChange={(event) => setSaveToOutput(event.target.checked)}
            />
            <span>
              Save results to output/
              <small>JSON metrics, initial/final SVGs, and objective chart.</small>
            </span>
          </label>
          <label className="neighbor-exploration">
            <input
              type="checkbox"
              checked={showNeighbors}
              onChange={(event) => setShowNeighbors(event.target.checked)}
            />
            <span>
              Show every neighbor
              <small>
                All valid candidates in order, without skipped frames. Large neighborhoods can take
                time to visualize.
              </small>
            </span>
          </label>
          <button
            type="submit"
            className="primary run-button"
            disabled={running || config.vehicles.length === 0}
          >
            {running
              ? `Running ${hillClimbingLabels[variant]}...`
              : `Run ${hillClimbingLabels[variant]}`}
          </button>
        </fieldset>
      </form>
      <div className="playback-speed" role="group" aria-label="Visualization speed">
        <span>Visualization speed</span>
        <button
          type="button"
          onClick={() => changeSpeed(-1)}
          disabled={playbackSpeed === playbackSpeeds[0]}
          aria-label="Slow down visualization"
        >
          Slower
        </button>
        <output aria-live="polite" aria-label="Playback speed">
          {playbackSpeed}×
        </output>
        <button
          type="button"
          onClick={() => changeSpeed(1)}
          disabled={playbackSpeed === playbackSpeeds.at(-1)}
          aria-label="Speed up visualization"
        >
          Faster
        </button>
      </div>
      {running && (
        <button type="button" className="stop-button" onClick={stop} disabled={cancelling}>
          {cancelling ? 'Stopping...' : 'Stop search'}
        </button>
      )}
      <p className="field-hint">
        {showNeighbors
          ? 'Amber wireframes preview neighbors; solid vehicles show the committed state. Motion interpolates between validated states.'
          : 'Each completed iteration moves directly to its chosen state, without intermediate neighbor previews.'}
      </p>
      {running && (
        <p role="status" className="run-status">
          {cancelling
            ? 'Stopping the backend search...'
            : live
              ? `Live visualization: ${live.neighbors_evaluated} neighbors evaluated, ${live.iteration} scans completed.`
              : 'Connecting and generating the initial state...'}
        </p>
      )}
      {outputRunId && run?.id === outputRunId && (
        <p role="status" className="field-hint">
          Files saved: output/hill_climbing/{outputRunId}/
        </p>
      )}
      {cancelled && (
        <p role="status" className="run-status">
          Search stopped. Partial results were not saved.
        </p>
      )}
      {error && (
        <p role="alert" className="error run-error">
          {error}
        </p>
      )}
      {(run || live) && snapshot && (
        <div className="run-results" role="region" aria-label="Hill Climbing results">
          <div className="section-heading">
            <h3>
              {hillClimbingLabels[displayVariant]} {run ? 'results' : 'visualization'}
            </h3>
            <span className="saved-label">
              {run
                ? 'Saved'
                : running
                  ? 'Live'
                  : cancelled
                    ? 'Stopped · not saved'
                    : 'Completion unconfirmed'}
            </span>
          </div>
          {changed && (
            <p className="snapshot-notice">
              The config has changed. These results use the captured run snapshot.
            </p>
          )}
          <div className="scene-switch" role="group" aria-label="3D scene view">
            {stages.map((stage) => (
              <button
                key={stage}
                type="button"
                aria-pressed={view === stage}
                onClick={() => onViewChange(stage)}
              >
                {stage === 'configuration'
                  ? 'Draft'
                  : stage === 'initial'
                    ? 'Initial state'
                    : stage === 'live'
                      ? 'Current state'
                      : 'Final state'}
              </button>
            ))}
          </div>
          {comparison && live && (
            <section className="iteration-comparison" aria-label="Iteration comparison">
              <label className="number-field">
                <span>Compare iteration</span>
                <select
                  value={selectedIteration ?? 'latest'}
                  onChange={(event) =>
                    onComparisonChange(
                      event.target.value === 'latest' ? null : Number(event.target.value),
                      'before'
                    )
                  }
                >
                  <option value="latest">Latest completed iteration ({live.iteration})</option>
                  {live.iteration_changes
                    .filter((change) => change.kind !== 'restart')
                    .map((change) => (
                      <option key={change.iteration} value={change.iteration}>
                        Iteration {change.iteration}
                      </option>
                    ))}
                </select>
              </label>
              <div className="iteration-objective" aria-live="polite">
                <span>
                  {comparison.before_objective.toLocaleString()} →{' '}
                  {comparison.after_objective.toLocaleString()} {unit}
                </span>
                <strong>
                  {comparison.after_objective > comparison.before_objective
                    ? `+${(comparison.after_objective - comparison.before_objective).toLocaleString()}`
                    : comparison.state_changed
                      ? 'Sideways move'
                      : 'No improvement'}
                </strong>
              </div>
              <div
                className="scene-switch"
                role="group"
                aria-label={`Iteration ${comparison.iteration} state`}
              >
                {(['before', 'after'] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    aria-pressed={view === side}
                    onClick={() => onComparisonChange(comparison.iteration, side)}
                  >
                    {side === 'before' ? 'Before iteration' : 'After iteration'}
                  </button>
                ))}
              </div>
              <p className="field-hint">
                Iteration {comparison.iteration}.{' '}
                {comparison.before_objective === comparison.after_objective
                  ? comparison.state_changed
                    ? 'Sideways move: the arrangement changed, but the objective stayed equal.'
                    : 'No better neighbor was found; both states are identical.'
                  : 'Compare the state entering this scan with its chosen state.'}
              </p>
            </section>
          )}
          {preview && live && !run && (
            <div className="candidate-preview" role="status">
              <strong>
                Neighbor #{live.neighbors_evaluated}: {preview.objective.toLocaleString()} {unit}
              </strong>
              <span>
                Iteration {live.evaluating_iteration} ·{' '}
                {describeNeighbor(live.config, live.arrangement, preview.arrangement)} ·{' '}
                {previewVerdict}.
              </span>
              <span>
                Best found: {(live.best_objective ?? live.objective).toLocaleString()} {unit}. Amber
                wireframe is a preview in Current state view, not a committed state.
              </span>
            </div>
          )}
          <dl className="run-metrics">
            <div>
              <dt>Initial objective</dt>
              <dd>
                {initialObjective.toLocaleString()}
                <small>{unit}</small>
              </dd>
            </div>
            <div>
              <dt>{run ? 'Final objective' : 'Current objective'}</dt>
              <dd>
                {objective.toLocaleString()}
                <small>{unit}</small>
              </dd>
            </div>
            <div>
              <dt>Loaded / total</dt>
              <dd>
                {arrangement.length} / {snapshot.vehicles.length}
              </dd>
            </div>
            <div>
              <dt>Unloaded</dt>
              <dd>{snapshot.vehicles.length - arrangement.length}</dd>
            </div>
            <div>
              <dt>Iterations</dt>
              <dd>{completedIterations}</dd>
            </div>
            <div>
              <dt>Search time</dt>
              <dd>
                {runtime < 1000 ? `${runtime.toFixed(1)} ms` : `${(runtime / 1000).toFixed(2)} s`}
              </dd>
            </div>
          </dl>
          {displayVariant === 'sideways' && (
            <p className="field-hint">
              Sideways moves: {run?.result.sideways_moves ?? live?.sideways_moves ?? 'Unavailable'}.
            </p>
          )}
          {displayVariant === 'random_restart' && (
            <p className="field-hint">
              Restarts completed:{' '}
              {run?.result.restarts_completed ?? live?.restarts_completed ?? 'Unavailable'}. The
              chart follows the search; a restart can lower its score. The final result returns the
              best state across all attempts.
              {run?.result.iterations_per_restart &&
                ` Scans per attempt (initial first): ${run.result.iterations_per_restart.join(', ')}.`}
            </p>
          )}
          <ObjectiveChart history={history} unit={unit} />
          <p className="field-hint">
            {run
              ? `Stopped: ${hillClimbingStopLabels[run.result.stop_reason]}`
              : `${evaluated.toLocaleString()} neighbors evaluated so far.`}{' '}
            {run &&
              `${evaluated.toLocaleString()} neighbors evaluated. Iterations include the final no-improvement scan.`}
          </p>
          <div className="run-footer">
            <span>
              Seed {run?.random_seed ?? live?.random_seed}
              {run ? ` · ${run.id.slice(0, 8)}` : ''}
            </span>
            {run && <DownloadRunButton run={run} />}
          </div>
        </div>
      )}
    </section>
  )
}

export default SteepestAscentPanel
