import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  cancelJob,
  deleteRun,
  getActiveJob,
  getJob,
  getRun,
  listRuns,
  startJob,
} from '../api/genetic'
import GeneticAlgorithmReplay from './GeneticAlgorithmReplay'
import './GeneticAlgorithm.css'
import type { Config } from '../types/config'
import type { GASettings, Job, PopulationPoint, Run } from '../types/run'
import { arrangementConfig, vehicleColor } from './runView'

function FitnessChart({ points }: { points: PopulationPoint[] }) {
  if (!points.length)
    return <p className="field-hint">Fitness history appears after initialization.</p>
  const maximum = Math.max(1, ...points.map((p) => p.maximum))
  const last = Math.max(1, points[points.length - 1].generation)
  const x = (generation: number) => 44 + (generation / last) * 476
  const y = (value: number) => 172 - (value / maximum) * 150
  return (
    <figure className="fitness-chart">
      <svg
        viewBox="0 0 540 210"
        role="img"
        aria-label="Maximum and average population fitness by generation"
      >
        <path d="M44 16V172H520" fill="none" stroke="#aab6ad" />
        <text x="4" y="20">
          {maximum}
        </text>
        <text x="28" y="177">
          0
        </text>
        <text x="44" y="196">
          0
        </text>
        <text x="490" y="196">
          {points[points.length - 1].generation}
        </text>
        <text x="230" y="207">
          Generation
        </text>
        {(['maximum', 'average'] as const).map((key) => (
          <g key={key}>
            <polyline
              fill="none"
              stroke={key === 'maximum' ? '#285b42' : '#b77e33'}
              strokeWidth="2"
              points={points.map((p) => `${x(p.generation)},${y(p[key])}`).join(' ')}
            />
            {points.map((p) => (
              <circle
                key={p.generation}
                cx={x(p.generation)}
                cy={y(p[key])}
                r="3"
                fill={key === 'maximum' ? '#285b42' : '#b77e33'}
              >
                <title>{`Generation ${p.generation} · ${key}: ${p[key].toFixed(2)}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <figcaption>
        <span className="maximum-key">Maximum fitness</span>
        <span className="average-key">Average fitness</span>
      </figcaption>
    </figure>
  )
}

export default function GeneticAlgorithmPanel({
  config,
  onPreview,
  onRunningChange,
}: {
  config: Config
  onPreview: (config: Config | null) => void
  onRunningChange: (running: boolean) => void
}) {
  const [settings, setSettings] = useState<GASettings>({
    algorithm: 'genetic_algorithm',
    iterations: 100,
    population_size: 30,
    crossover_rate: 0.8,
    mutation_rate: 0.1,
  })
  const [seed, setSeed] = useState(42)
  const [job, setJob] = useState<Job | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [history, setHistory] = useState<Run[]>([])
  const [starting, setStarting] = useState(false)
  const [recovering, setRecovering] = useState(true)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [state, setState] = useState<'initial' | 'final'>('initial')
  const [view, setView] = useState<'3d' | '2d'>('3d')
  const [showResult, setShowResult] = useState(true)
  const [recordDemo, setRecordDemo] = useState(false)
  const [replayOpen, setReplayOpen] = useState(false)
  const [loadingResult, setLoadingResult] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const submitting = useRef(false)
  const active = jobId !== null || job?.status === 'queued' || job?.status === 'running'
  useEffect(() => {
    onRunningChange(active || starting)
  }, [active, starting, onRunningChange])

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()
    getActiveJob(controller.signal)
      .then((current) => {
        if (!ignore && current) {
          setJob(current)
          setJobId(current.id)
        }
      })
      .catch((cause) => {
        if (!ignore) setError(String(cause))
      })
      .finally(() => {
        if (!ignore) setRecovering(false)
      })
    listRuns(controller.signal)
      .then((runs) => {
        if (!ignore) setHistory(runs)
      })
      .catch((cause) => {
        if (!ignore) setHistoryError(String(cause))
      })
    return () => {
      ignore = true
      controller.abort()
    }
  }, [])

  // Recursive timeout prevents overlapping polls. Cleanup ignores stale responses.
  // Reference: https://react.dev/learn/synchronizing-with-effects#fetching-data
  useEffect(() => {
    if (!jobId) return
    let ignore = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function poll() {
      try {
        const current = await getJob(jobId!, controller.signal)
        if (ignore) return
        setJob(current)
        setError('')
        if (current.status === 'completed' && current.run) {
          const completed = current.run.result.demo_recorded
            ? await getRun(current.run.id, controller.signal)
            : current.run
          if (ignore) return
          setRun(completed)
          setReplayOpen(false)
          setState('final')
          setJobId(null)
          setStopping(false)
          setHistory((items) => [
            current.run!,
            ...items.filter((item) => item.id !== current.run!.id),
          ])
          return
        }
        if (current.status === 'failed') {
          setError(current.error ?? 'Search failed.')
          setJobId(null)
          setStopping(false)
          return
        }
        if (current.status === 'cancelled') {
          setJobId(null)
          setStopping(false)
          return
        }
      } catch (cause) {
        if (ignore) return
        setError(`${String(cause)} Polling will retry. If the backend restarted, use Reconnect.`)
      }
      if (!ignore) timer = setTimeout(poll, 750)
    }
    void poll()
    return () => {
      ignore = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [jobId])

  const source = run?.config ?? job?.request.config
  const placements = run
    ? state === 'initial'
      ? run.result.initial_arrangement
      : run.result.final_arrangement
    : job?.initial_arrangement
  useEffect(() => {
    if (replayOpen) return
    onPreview(showResult && source && placements ? arrangementConfig(source, placements) : null)
  }, [source, placements, showResult, onPreview, replayOpen])

  async function start(event: FormEvent) {
    event.preventDefault()
    if (submitting.current || active) return
    submitting.current = true
    setStarting(true)
    setError('')
    try {
      const created = await startJob({
        config,
        settings,
        random_seed: seed,
        record_demo: recordDemo,
      })
      setStopping(false)
      setDeleteCandidate(null)
      setRun(null)
      setReplayOpen(false)
      setState('initial')
      setShowResult(true)
      setJob(created)
      setJobId(created.id)
    } catch (cause) {
      setError(String(cause))
    } finally {
      submitting.current = false
      setStarting(false)
    }
  }

  async function reconnect() {
    setRecovering(true)
    try {
      const current = await getActiveJob()
      setJobId(current?.id ?? null)
      setJob(current)
      setError('')
      setHistory(await listRuns())
      setHistoryError('')
    } catch (cause) {
      setError(String(cause))
    } finally {
      setRecovering(false)
    }
  }

  async function refreshHistory() {
    try {
      setHistory(await listRuns())
      setHistoryError('')
    } catch (cause) {
      setHistoryError(String(cause))
    }
  }

  async function openRun(item: Run) {
    setLoadingResult(true)
    setError('')
    try {
      const detail = await getRun(item.id)
      setRun(detail)
      setJob(null)
      setJobId(null)
      setState('final')
      setShowResult(true)
      setReplayOpen(false)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setLoadingResult(false)
    }
  }

  async function stopSearch() {
    if (!job || stopping) return
    setStopping(true)
    setError('')
    try {
      setJob(await cancelJob(job.id))
    } catch (cause) {
      setError(String(cause))
      setStopping(false)
    }
  }

  async function removeRun(item: Run) {
    setDeletingId(item.id)
    setHistoryError('')
    try {
      await deleteRun(item.id)
      setHistory((items) => items.filter((saved) => saved.id !== item.id))
      setDeleteCandidate(null)
      if (run?.id === item.id) {
        setRun(null)
        setJob(null)
        setReplayOpen(false)
      }
    } catch (cause) {
      setHistoryError(String(cause))
    } finally {
      setDeletingId(null)
    }
  }

  const points = run?.result.population_history ?? job?.population_history ?? []
  const latest = points[points.length - 1]
  const total = job?.request.settings.iterations ?? settings.iterations
  const progress = job ? Math.round((job.generation / total) * 100) : 0
  const displayConfig = source && placements ? arrangementConfig(source, placements) : null
  const loaded = displayConfig?.vehicles.filter((v) => v.x !== null && v.y !== null) ?? []
  const shownSettings = run?.settings ?? job?.request.settings

  return (
    <section className="ga-panel" aria-labelledby="ga-heading">
      <div className="section-heading">
        <h2 id="ga-heading">Genetic Algorithm</h2>
        <span className="unit-tag">Roulette · One-point · 1 elite</span>
      </div>
      <form
        onSubmit={(event) => {
          void start(event)
        }}
      >
        <fieldset
          className="editor-fieldset"
          disabled={starting || recovering || active || loadingResult || deletingId !== null}
        >
          <div className="vehicle-fields">
            {(['iterations', 'population_size', 'crossover_rate', 'mutation_rate'] as const).map(
              (key) => {
                const rate = key.endsWith('_rate')
                const label = {
                  iterations: 'Generations',
                  population_size: 'Population size',
                  crossover_rate: 'Crossover (%)',
                  mutation_rate: 'Mutation (%)',
                }[key]
                return (
                  <label className="number-field" key={key}>
                    <span>{label}</span>
                    <input
                      required
                      type="number"
                      min={rate ? 0 : key === 'population_size' ? 2 : 1}
                      max={rate ? 100 : recordDemo ? 10 : undefined}
                      step={rate ? 0.1 : 1}
                      value={rate ? Number((settings[key] * 100).toFixed(6)) : settings[key]}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          [key]: event.target.valueAsNumber / (rate ? 100 : 1),
                        })
                      }
                    />
                  </label>
                )
              }
            )}
            <label className="number-field">
              <span>Random seed</span>
              <input
                required
                type="number"
                step="1"
                value={seed}
                onChange={(event) => setSeed(event.target.valueAsNumber)}
              />
            </label>
          </div>
          <label className="demo-option">
            <input
              type="checkbox"
              checked={recordDemo}
              onChange={(event) => setRecordDemo(event.target.checked)}
            />
            Rekam proses untuk demo
          </label>
          {recordDemo && (
            <div className="demo-help">
              <p className="field-hint">
                Rekam roulette, crossover/retry, mutasi, dan pergantian generasi. Maksimum 10
                individu, 10 generasi, 30 kendaraan. Parameter tidak diubah otomatis.
              </p>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, population_size: 6, iterations: 5 })}
              >
                Gunakan contoh 6 individu / 5 generasi
              </button>
              {config.vehicles.length > 30 && (
                <p className="error">
                  Kurangi kendaraan menjadi paling banyak 30 untuk merekam demo.
                </p>
              )}
            </div>
          )}
          <p className="field-hint">
            Runs the current draft. Mutation is applied per child. Crossover retries at most 20
            times before copying its parent.
          </p>
          <button
            className="primary run-button"
            type="submit"
            disabled={recordDemo && config.vehicles.length > 30}
          >
            {starting
              ? 'Starting…'
              : recovering
                ? 'Connecting…'
                : active
                  ? 'Search running…'
                  : 'Run Genetic Algorithm'}
          </button>
        </fieldset>
      </form>
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => {
              void reconnect()
            }}
          >
            Reconnect
          </button>
        </div>
      )}
      {job && (
        <div className="job-progress" role="status" aria-live="polite">
          <div className="section-heading">
            <strong>{job.stage}</strong>
            <span>
              Generation {job.generation}/{total} · {progress}% ·{' '}
              {(job.elapsed_ms / 1000).toFixed(1)}s elapsed
            </span>
          </div>
          <progress max={total} value={job.generation} aria-label="Generations completed" />
          {active && (
            <>
              <button
                type="button"
                className="stop-button"
                disabled={stopping || job.stage === 'cancelling' || job.stage === 'saving'}
                onClick={() => {
                  void stopSearch()
                }}
              >
                {stopping || job.stage === 'cancelling'
                  ? 'Stopping…'
                  : job.stage === 'saving'
                    ? 'Saving result…'
                    : 'Stop search'}
              </button>
              <p className="field-hint">
                Stop membatalkan pencarian pada checkpoint berikutnya. Hasil run yang dibatalkan
                tidak disimpan.
              </p>
            </>
          )}
          {latest && (
            <p>
              Maximum {latest.maximum.toLocaleString()} · Average {latest.average.toFixed(2)}
            </p>
          )}
          {job.status === 'cancelled' && (
            <p>
              Pencarian dihentikan. Grafik terakhir tetap terlihat; hasil tidak disimpan. Lu bisa
              mulai run baru.
            </p>
          )}
        </div>
      )}
      <FitnessChart points={points} />
      {run && (
        <div className="replay-launch">
          {run.result.demo_trace?.steps.length ? (
            <button className="primary" type="button" onClick={() => setReplayOpen(!replayOpen)}>
              {replayOpen ? 'Tutup proses GA' : 'Lihat proses GA'}
            </button>
          ) : (
            <p className="field-hint">
              Rekaman langkah tidak tersedia untuk run ini. Aktifkan mode demo sebelum run untuk
              merekam proses.
            </p>
          )}
        </div>
      )}
      {replayOpen && run?.result.demo_trace && (
        <GeneticAlgorithmReplay key={run.id} run={run} onPreview={onPreview} />
      )}
      {displayConfig && !replayOpen && (
        <div className="ga-result">
          <div className="result-controls" role="group" aria-label="Arrangement selection">
            <button
              type="button"
              aria-pressed={state === 'initial'}
              disabled={!run?.result.initial_arrangement || active}
              onClick={() => setState('initial')}
            >
              Initial
            </button>
            <button
              type="button"
              aria-pressed={state === 'final'}
              disabled={!run || active}
              onClick={() => setState('final')}
            >
              Final
            </button>
            <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>
              3D
            </button>
            <button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>
              2D
            </button>
            <button type="button" onClick={() => setShowResult(!showResult)}>
              {showResult ? 'Preview draft' : 'Preview result'}
            </button>
          </div>
          <p className="field-hint">
            {state === 'initial'
              ? 'Initial: best individual of generation 0.'
              : 'Final: best individual of the last generation.'}{' '}
            The 3D background shows {showResult ? 'this result' : 'your draft'}.
          </p>
          {run && (
            <div className="stats result-stats">
              <div>
                <strong>
                  {run.result.initial_objective.toLocaleString()} →{' '}
                  {run.result.final_objective.toLocaleString()}
                </strong>
                <span>
                  Shipping fee (+
                  {(run.result.final_objective - run.result.initial_objective).toLocaleString()})
                </span>
              </div>
              <div>
                <strong>{(run.result.runtime_ms / 1000).toFixed(2)}s</strong>
                <span>Search time · {run.result.generations_completed ?? '-'} generations</span>
              </div>
            </div>
          )}
          <p className="field-hint">
            Shown arrangement: {loaded.length}/{displayConfig.vehicles.length} loaded ·{' '}
            {loaded.reduce((sum, v) => sum + v.weight, 0).toLocaleString()}/
            {displayConfig.ship.max_weight.toLocaleString()} weight.
          </p>
          {view === '2d' && (
            <div
              className="ship-grid result-grid"
              role="img"
              aria-label={`${state} arrangement grid`}
              style={{
                width: `min(100%, 320px, ${(440 * displayConfig.ship.width) / displayConfig.ship.length}px)`,
                aspectRatio: `${displayConfig.ship.width}/${displayConfig.ship.length}`,
                backgroundSize: `${100 / displayConfig.ship.width}% ${100 / displayConfig.ship.length}%`,
              }}
            >
              {loaded.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className="grid-vehicle"
                  title={`${vehicle.id}: (${vehicle.x}, ${vehicle.y})`}
                  style={{
                    left: `${(vehicle.x! / displayConfig.ship.width) * 100}%`,
                    top: `${(vehicle.y! / displayConfig.ship.length) * 100}%`,
                    width: `${(vehicle.width / displayConfig.ship.width) * 100}%`,
                    height: `${(vehicle.length / displayConfig.ship.length) * 100}%`,
                    background: vehicleColor(vehicle.id),
                  }}
                >
                  V{displayConfig.vehicles.findIndex((v) => v.id === vehicle.id) + 1}
                </div>
              ))}
            </div>
          )}
          <p className="field-hint">
            Unloaded:{' '}
            {displayConfig.vehicles
              .filter((v) => v.x === null)
              .map((v) => `V${displayConfig.vehicles.findIndex((item) => item.id === v.id) + 1}`)
              .join(', ') || 'None'}
          </p>
        </div>
      )}
      {shownSettings && (
        <p className="field-hint">
          Run settings: {shownSettings.population_size} individuals · {shownSettings.iterations}{' '}
          generations · crossover {shownSettings.crossover_rate * 100}% · mutation{' '}
          {shownSettings.mutation_rate * 100}% · seed {run?.random_seed ?? job?.request.random_seed}
        </p>
      )}
      <div className="section-heading history-heading">
        <h2>Saved GA runs</h2>
        <button
          type="button"
          disabled={active || deletingId !== null}
          onClick={() => {
            void refreshHistory()
          }}
        >
          Refresh
        </button>
      </div>
      {historyError && (
        <p className="error" role="alert">
          {historyError}
        </p>
      )}
      {!history.length && (
        <p className="field-hint">Completed runs appear here after being saved to MongoDB.</p>
      )}
      {loadingResult && (
        <p role="status" className="field-hint">
          Memuat hasil dan rekaman…
        </p>
      )}
      <div className="run-history">
        {history.map((item) => (
          <div className="saved-run" key={item.id}>
            <button
              type="button"
              className="open-run"
              disabled={active || starting || loadingResult || deletingId !== null}
              onClick={() => {
                void openRun(item)
              }}
            >
              {new Date(item.created_at).toLocaleString()} · fee{' '}
              {item.result.final_objective.toLocaleString()} · seed {item.random_seed}
              {item.result.demo_recorded ? ' · demo' : ''}
            </button>
            <button
              type="button"
              className="remove"
              aria-label={`Hapus run ${item.id}`}
              disabled={active || starting || loadingResult || deletingId !== null}
              onClick={() => setDeleteCandidate(item.id)}
            >
              Hapus
            </button>
            {deleteCandidate === item.id && (
              <div className="delete-confirmation">
                <p>
                  Hapus permanen hasil di atas beserta rekaman demonya? Tindakan ini tidak dapat
                  dibatalkan.
                </p>
                <button
                  type="button"
                  disabled={deletingId !== null}
                  onClick={() => {
                    void removeRun(item)
                  }}
                >
                  {deletingId === item.id ? 'Menghapus…' : 'Hapus permanen'}
                </button>
                <button
                  type="button"
                  disabled={deletingId !== null}
                  onClick={() => setDeleteCandidate(null)}
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
