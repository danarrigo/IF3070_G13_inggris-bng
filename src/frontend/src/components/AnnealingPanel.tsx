import { useEffect, useRef, useState } from 'react'
import { streamAnnealing, loadAnnealingRuns, saveRun } from '../api/annealing'
import type { Config } from '../types/config'
import { arrangementConfig } from '../types/run'
import { vehicleColor } from './runView'
import { objectiveLabel, objectiveUnit } from '../objective'
import type { AnnealingSettings, Placement, SearchRun } from '../types/run'

function Chart({
  title,
  series,
  logarithmic = false,
}: {
  title: string
  series: { label: string; color: string; values: [number, number | null][] }[]
  logarithmic?: boolean
}) {
  const points = series
    .flatMap((line) => line.values)
    .filter((p): p is [number, number] => p[1] !== null && Number.isFinite(p[1]))
  if (!points.length) return <p className="field-hint">{title}: no data.</p>
  const min = Math.min(0, ...points.map((p) => p[1]))
  const max = Math.max(1, ...points.map((p) => p[1]))
  const end = Math.max(1, ...points.map((p) => p[0]))
  const y = (value: number) => 125 - ((value - min) / (max - min)) * 105
  return (
    <figure className="sa-chart">
      <figcaption>
        {title}
        {logarithmic ? ' - log scale (natural log)' : ''}
      </figcaption>
      <svg
        viewBox="0 0 440 155"
        role="img"
        aria-label={`${title}; iterations 0 to ${end}; range ${min.toPrecision(3)} to ${max.toPrecision(3)}`}
      >
        <path d="M45 15V125H425" fill="none" stroke="#aeb9af" />
        <text x="2" y="24">
          {max.toPrecision(3)}
        </text>
        <text x="2" y="128">
          {min.toPrecision(3)}
        </text>
        <text x="43" y="145">
          0
        </text>
        <text x="350" y="145">
          {end} iterations
        </text>
        {series.map((line) => {
          // Separate paths at missing samples instead of inventing values.
          let connected = false
          const path = line.values
            .map(([iteration, value]) => {
              if (value === null || !Number.isFinite(value)) {
                connected = false
                return ''
              }
              const command = connected ? 'L' : 'M'
              connected = true
              return `${command}${45 + (iteration / end) * 380},${y(value)}`
            })
            .join(' ')
          return (
            <path key={line.label} d={path} fill="none" stroke={line.color} strokeWidth="1.5" />
          )
        })}
      </svg>
      <div className="sa-legend">
        {series.map((line) => (
          <span key={line.label} style={{ color: line.color }}>
            {line.label}
          </span>
        ))}
      </div>
    </figure>
  )
}

function Deck({ config }: { config: Config }) {
  const placed = config.vehicles.filter((v) => v.x !== null && v.y !== null)
  return (
    <div
      className="ship-grid sa-deck"
      role="img"
      aria-label={`Search state with ${placed.length} loaded vehicles`}
      style={{
        aspectRatio: `${config.ship.width} / ${config.ship.length}`,
        backgroundSize: `${100 / config.ship.width}% ${100 / config.ship.length}%`,
      }}
    >
      {config.vehicles.map(
        (v, index) =>
          v.x !== null &&
          v.y !== null && (
            <div
              key={v.id}
              className="grid-vehicle"
              title={`V${index + 1}: (${v.x}, ${v.y}), ${v.width} × ${v.length}`}
              style={{
                left: `${(v.x / config.ship.width) * 100}%`,
                top: `${(v.y / config.ship.length) * 100}%`,
                width: `${(v.width / config.ship.width) * 100}%`,
                height: `${(v.length / config.ship.length) * 100}%`,
                background: vehicleColor(v.id),
              }}
            >
              V{index + 1}
            </div>
          )
      )}
    </div>
  )
}

export default function AnnealingPanel({
  config,
  onPreview,
  onRunningChange,
}: {
  config: Config
  onPreview: (config: Config | null) => void
  onRunningChange: (running: boolean) => void
}) {
  const [settings, setSettings] = useState<AnnealingSettings>({
    algorithm: 'simulated_annealing',
    iterations: 1000,
    initial_temperature: 1000,
    cooling_rate: 0.995,
    minimum_temperature: 0.001,
    stagnation_window: 100,
  })
  const [seed, setSeed] = useState(42)
  const [runs, setRuns] = useState<SearchRun[]>([])
  const [selected, setSelected] = useState(0)
  const [frame, setFrame] = useState(0)
  const [view, setView] = useState<'initial' | 'final' | 'last' | 'replay'>('final')
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const run = runs[selected]
  const snapshots = run?.result.snapshots ?? []
  const snapshot = snapshots[Math.min(frame, snapshots.length - 1)]
  let placements: Placement[] = []
  if (run)
    placements =
      view === 'initial'
        ? run.result.initial_arrangement
        : view === 'last'
          ? run.result.last_arrangement
          : view === 'replay'
            ? (snapshot?.arrangement ?? [])
            : run.result.final_arrangement
  const shown = run ? arrangementConfig(run.config, placements) : null

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(
      () =>
        setFrame((previous) => {
          if (previous >= snapshots.length - 1) {
            setPlaying(false)
            return previous
          }
          return previous + 1
        }),
      350
    )
    return () => window.clearInterval(timer)
  }, [playing, snapshots.length])

  useEffect(() => {
    if (!run) return
    const state =
      view === 'initial'
        ? run.result.initial_arrangement
        : view === 'last'
          ? run.result.last_arrangement
          : view === 'replay'
            ? (run.result.snapshots[frame]?.arrangement ?? [])
            : run.result.final_arrangement
    onPreview(arrangementConfig(run.config, state))
  }, [run, view, frame, onPreview])

  async function perform(action: () => Promise<void>) {
    setBusy(true)
    onRunningChange(true)
    setError('')
    setPlaying(false)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed.')
    } finally {
      setBusy(false)
      onRunningChange(false)
    }
  }

  async function execute(count: 1 | 3) {
    await perform(async () => {
      controller.current = new AbortController()
      const result = await streamAnnealing(
        config,
        settings,
        seed,
        count,
        (index, snapshot) => {
          setMessage(
            `Run ${index + 1}/${count}, iteration ${snapshot.iteration}, objective ${snapshot.objective}`
          )
          onPreview(arrangementConfig(config, snapshot.arrangement))
        },
        controller.current.signal
      )
      setRuns(result)
      setSelected(0)
      setFrame(0)
      setView('final')
      setMessage(
        `${result.length} run(s) completed. Final means best state found; last state is also available.`
      )
    })
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(runs, null, 2)], { type: 'application/json' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'simulated-annealing-experiments.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const history = run?.result.annealing_history ?? []
  const overflow = history.some((p) => p.delta !== null && p.exponential === null)
  const fields = [
    ['iterations', 'Maximum iterations', 1, 10000, 1],
    ['initial_temperature', 'Initial temperature', 0.000001, 1e12, 'any'],
    ['cooling_rate', 'Cooling rate', 0.000001, 0.999999, 'any'],
    ['minimum_temperature', 'Minimum temperature', 1e-12, 1e12, 'any'],
    ['stagnation_window', 'Stagnation window', 1, 10000, 1],
  ] as const

  return (
    <section className="panel sa-panel" aria-labelledby="sa-heading">
      <div className="section-heading">
        <h2 id="sa-heading">Simulated Annealing</h2>
        <span className="unit-tag">{objectiveLabel(config)}</span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void execute(1)
        }}
      >
        <fieldset className="editor-fieldset" disabled={busy}>
          <div className="sa-fields">
            {fields.map(([key, label, min, max, step]) => (
              <label className="number-field" key={key}>
                <span>{label}</span>
                <input
                  required
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={Number.isNaN(settings[key]) ? '' : settings[key]}
                  onChange={(event) =>
                    setSettings({ ...settings, [key]: event.target.valueAsNumber })
                  }
                />
              </label>
            ))}
            <label className="number-field">
              <span>Random seed</span>
              <input
                required
                type="number"
                min={0}
                max={4294967292}
                step={1}
                value={Number.isNaN(seed) ? '' : seed}
                onChange={(event) => setSeed(event.target.valueAsNumber)}
              />
            </label>
          </div>
          <p className="field-hint">
            Uses the current draft, up to 200 vehicles. Custom starting positions off: randomize all
            positions. On: preserve filled X/Y pairs. No MongoDB is needed to compute.
          </p>
          <div className="sa-actions">
            <button type="submit" className="primary">
              Run SA
            </button>
            <button
              type="button"
              onClick={(event) => {
                if (event.currentTarget.form?.reportValidity()) void execute(3)
              }}
            >
              Run 3 experiments
            </button>
            <button
              type="button"
              onClick={() => {
                void perform(async () => {
                  const saved = await loadAnnealingRuns()
                  setRuns(saved)
                  setSelected(0)
                  setFrame(0)
                  setView('final')
                  setMessage(`Loaded ${saved.length} saved SA runs.`)
                  if (!saved.length) onPreview(null)
                })
              }}
            >
              Load saved runs
            </button>
          </div>
        </fieldset>
      </form>
      {busy && (
        <p role="status" className="field-hint">
          Processing request… The 3D scene follows sampled search states.{' '}
          <button type="button" onClick={() => controller.current?.abort()}>
            Cancel search
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="field-hint">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {run && shown && (
        <>
          <div className="sa-table-wrap">
            <table className="sa-table">
              <caption>Experiment comparison</caption>
              <thead>
                <tr>
                  <th>Run / seed</th>
                  <th>Objective</th>
                  <th>Initial</th>
                  <th>Best</th>
                  <th>Last</th>
                  <th>Iterations</th>
                  <th>Time (ms)</th>
                  <th>Stuck*</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((item, index) => (
                  <tr key={item.id} aria-selected={selected === index}>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(index)
                          setFrame(0)
                          setPlaying(false)
                        }}
                      >
                        {index + 1} / {item.random_seed}
                      </button>
                    </td>
                    <td>{objectiveLabel(item.config)}</td>
                    <td>{item.result.initial_objective}</td>
                    <td>{item.result.final_objective}</td>
                    <td>
                      {item.result.annealing_history.at(-1)?.objective ??
                        item.result.initial_objective}
                    </td>
                    <td>{item.result.iterations_completed}</td>
                    <td>{item.result.runtime_ms.toFixed(1)}</td>
                    <td>{item.result.stuck_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint">
            *Stuck = one episode of at least {run.settings.stagnation_window} iterations without a
            new best score. This is a stagnation indicator, not proof of a local optimum. A new best
            resets the episode.
          </p>
          <p className="field-hint">
            Selected run uses its own config snapshot and parameters. Stop: {run.result.stop_reason}
            . Loaded: {run.result.final_arrangement.length}; unloaded:{' '}
            {run.result.unloaded_vehicle_ids.length}. Config: {run.configHash.slice(0, 12)}.
          </p>
          <div className="sa-actions">
            <button
              disabled={busy}
              onClick={() => {
                void perform(async () => {
                  const saved = await saveRun(run)
                  setRuns((previous) =>
                    previous.map((item, index) => (index === selected ? saved : item))
                  )
                  setMessage('Selected run saved to MongoDB.')
                })
              }}
            >
              Save selected run
            </button>
            <button onClick={download}>Export all JSON</button>
            <button
              onClick={() => {
                setPlaying(false)
                onPreview(null)
              }}
            >
              Show input draft in 3D
            </button>
          </div>
          <div className="sa-actions">
            {(['initial', 'final', 'last', 'replay'] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={view === mode}
                onClick={() => {
                  setView(mode)
                  setPlaying(false)
                  onPreview(
                    arrangementConfig(
                      run.config,
                      mode === 'initial'
                        ? run.result.initial_arrangement
                        : mode === 'last'
                          ? run.result.last_arrangement
                          : mode === 'replay'
                            ? (snapshot?.arrangement ?? [])
                            : run.result.final_arrangement
                    )
                  )
                }}
              >
                {mode === 'final'
                  ? 'Best / final'
                  : mode === 'initial'
                    ? 'Initial'
                    : mode === 'last'
                      ? 'Last current'
                      : 'Replay'}
              </button>
            ))}
          </div>
          {view === 'replay' && (
            <div>
              <label className="number-field">
                <span>
                  Iteration {snapshot?.iteration ?? 0} · score {snapshot?.objective ?? 0}
                </span>
                <input
                  aria-label="Replay snapshot"
                  type="range"
                  min={0}
                  max={Math.max(0, snapshots.length - 1)}
                  value={frame}
                  onChange={(event) => {
                    setPlaying(false)
                    setFrame(Number(event.target.value))
                  }}
                />
              </label>
              <button
                onClick={() => {
                  if (frame >= snapshots.length - 1) setFrame(0)
                  setPlaying(!playing)
                }}
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <p className="field-hint">
                Replay uses up to 102 recorded snapshots; charts contain every iteration. Playback
                follows a completed run.
              </p>
            </div>
          )}
          <Deck config={shown} />
          <p className="field-hint">
            Unloaded in this view:{' '}
            {shown.vehicles
              .map((v, i) => (v.x === null ? `V${i + 1}` : null))
              .filter(Boolean)
              .join(', ') || 'none'}
            . Their 3D models appear beside the ship.
          </p>
          <Chart
            title={`Objective vs iteration (${objectiveUnit(run.config)})`}
            series={[
              {
                label: 'Current',
                color: '#326b68',
                values: [
                  [0, run.result.initial_objective],
                  ...history.map((p) => [p.iteration, p.objective] as [number, number]),
                ],
              },
              {
                label: 'Best',
                color: '#ae6a36',
                values: [
                  [0, run.result.initial_objective],
                  ...history.map((p) => [p.iteration, p.best_objective] as [number, number]),
                ],
              },
            ]}
          />
          <Chart
            title="exp(ΔE / T) vs iteration"
            logarithmic={overflow}
            series={[
              {
                label: overflow ? 'ln(exp(ΔE/T)) = ΔE/T' : 'exp(ΔE/T), before capping',
                color: '#805693',
                values: history.map((p) => [
                  p.iteration,
                  overflow ? p.log_acceptance : p.exponential,
                ]),
              },
            ]}
          />
          <p className="field-hint">
            Raw exp(ΔE/T) can exceed 1. Values that overflow are null in JSON, with ΔE/T retained.
            The chart switches to a log scale on overflow.
          </p>
          <Chart
            title="Acceptance probability vs iteration"
            series={[
              {
                label: 'min(1, exp(ΔE/T))',
                color: '#38694a',
                values: history.map((p) => [
                  p.iteration,
                  p.candidate_found ? p.acceptance_probability : null,
                ]),
              },
            ]}
          />
        </>
      )}
    </section>
  )
}
