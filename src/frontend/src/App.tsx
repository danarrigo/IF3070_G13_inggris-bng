import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { FormEvent } from 'react'
import { loadConfig, saveConfig } from './api/config'
import { compareIteration } from './iterationHistory'
import { objectiveLabel } from './objective'
import { parseExperimentImport } from './experimentImport'
import type { HCImport, SAImport, GAImport } from './experimentImport'
import VehicleGenerator from './components/VehicleGenerator'
import SteepestAscentPanel from './components/SteepestAscentPanel'
import AnnealingPanel from './components/AnnealingPanel'
import GeneticAlgorithmPanel from './components/GeneticAlgorithmPanel'
import { vehicleColor } from './components/runView'
import ResultsPage from './components/ResultsPage'
import ArrangementGrid from './components/ArrangementGrid'
import { configForPlacements, configForRunView } from './components/runPresentation'
import type { LiveRun, SceneView, SteepestAscentRun } from './types/run'
import type { Config, Vehicle } from './types/config'
import './App.css'

const ShipBackground = lazy(() => import('./components/ShipBackground'))

function subscribeToPage(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

type Page = 'config' | 'optimization' | 'results'

function currentPage(): Page {
  if (window.location.hash === '#results') return 'results'
  return window.location.hash === '#optimization' ? 'optimization' : 'config'
}

const initialConfig: Config = {
  ship: { length: 20, width: 10, max_weight: 10000 },
  vehicles: [],
  preserve_positions: false,
}

function NumberField({
  label,
  value,
  min = 0,
  optional = false,
  disabled = false,
  onChange,
}: {
  label: string
  value: number | null
  min?: number
  optional?: boolean
  disabled?: boolean
  onChange: (value: number | null) => void
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        form="config-form"
        type="number"
        min={min}
        step={1}
        required={!optional}
        disabled={disabled}
        value={value ?? ''}
        placeholder={optional ? 'Unplaced' : undefined}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : event.target.valueAsNumber)
        }
      />
    </label>
  )
}

function App() {
  const page = useSyncExternalStore(subscribeToPage, currentPage, () => 'config')
  const [config, setConfig] = useState<Config>(initialConfig)
  const [hcImport, setHCImport] = useState<(HCImport & { key: number }) | null>(null)
  const [saImport, setSAImport] = useState<(SAImport & { key: number }) | null>(null)
  const [gaImport, setGAImport] = useState<(GAImport & { key: number }) | null>(null)
  const [importNotice, setImportNotice] = useState('')
  const importSequence = useRef(0)
  const importInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('Start with a ship, then add your vehicles.')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [running, setRunning] = useState(false)
  const [algorithm, setAlgorithm] = useState<
    'hill_climbing' | 'simulated_annealing' | 'genetic_algorithm'
  >('hill_climbing')
  const [annealingPreview, setAnnealingPreview] = useState<Config | null>(null)
  const [geneticPreview, setGeneticPreview] = useState<Config | null>(null)
  const handleGARunning = useCallback((active: boolean) => {
    setRunning(active)
    if (active) setAlgorithm('genetic_algorithm')
  }, [])
  const [completedRun, setCompletedRun] = useState<SteepestAscentRun | null>(null)
  const [resultRun, setResultRun] = useState<SteepestAscentRun | null>(null)
  const [resultView, setResultView] = useState<'initial' | 'final'>('final')
  const loadDefaultResult = useCallback((run: SteepestAscentRun) => {
    setResultRun((current) => current ?? run)
  }, [])
  const [liveRun, setLiveRun] = useState<LiveRun | null>(null)
  const [view, setView] = useState<SceneView>('configuration')
  const [selectedIteration, setSelectedIteration] = useState<number | null>(null)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const configFormRef = useRef<HTMLFormElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [page])

  function edit(next: Config) {
    setConfig(next)
    setView('configuration')
    setDirty(true)
    setError('')
  }

  function updateVehicle(id: string, patch: Partial<Vehicle>) {
    edit({
      ...config,
      vehicles: config.vehicles.map((vehicle) =>
        vehicle.id === id ? { ...vehicle, ...patch } : vehicle
      ),
    })
  }

  function addVehicle() {
    edit({
      ...config,
      vehicles: [
        ...config.vehicles,
        {
          id: crypto.randomUUID(),
          x: null,
          y: null,
          length: 4,
          width: 2,
          weight: 1000,
          eta: 0,
          shipping_fee: 500,
        },
      ],
    })
  }

  async function importExperiment(file: File) {
    if (busy || running) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error('Choose an input JSON file smaller than 5 MB.')
      const imported = parseExperimentImport(JSON.parse(await file.text()))
      if (dirty && !window.confirm('Replace the current draft with this experiment input?')) return
      edit(imported.config)
      setCompletedRun(null)
      setLiveRun(null)
      setSelectedIteration(null)
      setAnnealingPreview(null)
      setGeneticPreview(null)
      if (imported.kind !== 'config') {
        const preset = { ...imported, key: ++importSequence.current }
        if (preset.kind === 'hill_climbing') setHCImport(preset)
        else if (preset.kind === 'simulated_annealing') setSAImport(preset)
        else setGAImport(preset)
        setAlgorithm(imported.kind)
        navigate('optimization')
      } else navigate('config')
      setImportNotice(
        `Imported ${file.name}. ${imported.kind === 'config' ? 'Configuration only; algorithm settings are unchanged.' : 'Config, seed, and parameters loaded. Review them, then click Run.'} The saved MongoDB config has not been overwritten.`
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import experiment JSON.')
    } finally {
      setBusy(false)
    }
  }

  async function load() {
    if (dirty && !window.confirm('Replace your unsaved changes with the saved config?')) return
    setBusy(true)
    setError('')
    try {
      const saved = await loadConfig()
      if (saved === null) {
        setMessage('No saved config yet. Your current draft has been kept.')
      } else {
        setConfig(saved)
        setView('configuration')
        setDirty(false)
        setMessage('Loaded the saved configuration.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load config.')
    } finally {
      setBusy(false)
    }
  }

  function navigate(next: Page) {
    window.location.hash = next
    window.scrollTo({ top: 0 })
  }

  function openResults() {
    if (completedRun && !running) setResultRun(completedRun)
    setResultView('final')
    navigate('results')
  }

  function validateConfig(): boolean {
    const form = configFormRef.current
    if (!form || !form.checkValidity()) {
      if (page === 'optimization') {
        setError('Fix the configuration fields before continuing.')
        navigate('config')
      } else {
        form?.reportValidity()
      }
      return false
    }
    if (
      config.preserve_positions &&
      config.vehicles.some((vehicle) => (vehicle.x === null) !== (vehicle.y === null))
    ) {
      setError('Set both X and Y for a vehicle, or leave both empty.')
      if (page === 'optimization') navigate('config')
      else window.scrollTo({ top: 0 })
      return false
    }
    setError('')
    return true
  }

  function nextPage() {
    if (running) {
      setView('live')
      navigate('optimization')
      return
    }
    if (!validateConfig()) return
    if (config.vehicles.length === 0) {
      setError('Add or generate vehicles before continuing.')
      window.scrollTo({ top: 0 })
      return
    }
    navigate('optimization')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validateConfig()) return
    setBusy(true)
    setError('')
    try {
      setConfig(await saveConfig(config))
      setDirty(false)
      setMessage('Configuration saved to MongoDB.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save config.')
    } finally {
      setBusy(false)
    }
  }

  const draftPreview = useMemo(
    () =>
      config.preserve_positions
        ? config
        : {
            ...config,
            vehicles: config.vehicles.map((vehicle) => ({ ...vehicle, x: null, y: null })),
          },
    [config]
  )
  const liveConfig = liveRun?.config
  const liveArrangement = liveRun?.arrangement
  const liveInitial = liveRun?.initial_arrangement
  const previewCandidate = liveRun?.neighbor_preview?.arrangement
  const iterationChanges = liveRun?.iteration_changes
  const liveInitialObjective = liveRun?.initial_objective
  const comparison = useMemo(
    () =>
      liveInitial && liveInitialObjective !== undefined && iterationChanges
        ? compareIteration(liveInitial, liveInitialObjective, iterationChanges, selectedIteration)
        : null,
    [liveInitial, liveInitialObjective, iterationChanges, selectedIteration]
  )
  const comparisonPreview = useMemo(
    () =>
      liveConfig && comparison && (view === 'before' || view === 'after')
        ? configForPlacements(liveConfig, comparison[view])
        : null,
    [liveConfig, comparison, view]
  )
  const livePreview = useMemo(
    () => (liveConfig && liveArrangement ? configForPlacements(liveConfig, liveArrangement) : null),
    [liveConfig, liveArrangement]
  )
  const liveInitialPreview = useMemo(
    () => (liveConfig && liveInitial ? configForPlacements(liveConfig, liveInitial) : null),
    [liveConfig, liveInitial]
  )
  const candidatePreview = useMemo(
    () =>
      liveConfig && previewCandidate ? configForPlacements(liveConfig, previewCandidate) : null,
    [liveConfig, previewCandidate]
  )
  const previewConfig = useMemo(() => {
    if (page === 'results')
      return resultRun ? configForRunView(resultRun, resultView) : draftPreview
    if (page === 'optimization' && algorithm === 'genetic_algorithm')
      return geneticPreview ?? draftPreview
    if (page === 'optimization' && algorithm === 'simulated_annealing')
      return annealingPreview ?? draftPreview
    if (page !== 'optimization' || view === 'configuration') return draftPreview
    if (view === 'live') return livePreview ?? draftPreview
    if (view === 'before' || view === 'after') return comparisonPreview ?? draftPreview
    if (completedRun) return configForRunView(completedRun, view)
    return view === 'initial' ? (liveInitialPreview ?? draftPreview) : draftPreview
  }, [
    completedRun,
    page,
    view,
    draftPreview,
    livePreview,
    liveInitialPreview,
    comparisonPreview,
    resultRun,
    resultView,
    algorithm,
    annealingPreview,
    geneticPreview,
  ])
  const displayShip = previewConfig.ship
  const placed = previewConfig.vehicles.filter(
    (vehicle) => vehicle.x !== null && vehicle.y !== null
  )
  const totalWeight = placed.reduce((sum, vehicle) => sum + vehicle.weight, 0)
  const warnings: string[] = []
  if (totalWeight > displayShip.max_weight)
    warnings.push('Placed vehicles exceed the ship weight capacity.')
  previewConfig.vehicles.forEach((vehicle, index) => {
    if (
      vehicle.x !== null &&
      vehicle.y !== null &&
      (vehicle.x + vehicle.width > displayShip.width ||
        vehicle.y + vehicle.length > displayShip.length)
    ) {
      warnings.push(`Vehicle ${index + 1} extends beyond the ship.`)
    }
  })
  const overlap = placed.some((a, index) =>
    placed
      .slice(index + 1)
      .some(
        (b) =>
          a.x !== null &&
          a.y !== null &&
          b.x !== null &&
          b.y !== null &&
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.length &&
          a.y + a.length > b.y
      )
  )
  if (overlap) warnings.push('Some placed vehicles overlap.')

  return (
    <main>
      <Suspense fallback={<div className="ship-background" aria-hidden="true" />}>
        <ShipBackground
          config={previewConfig}
          candidate={
            page === 'optimization' && algorithm === 'hill_climbing' && view === 'live'
              ? candidatePreview
              : null
          }
          transitionDuration={550 / playbackSpeed}
          animate={
            page === 'results' ||
            (page === 'optimization' && view !== 'configuration' && liveRun?.phase !== 'initial')
          }
        />
      </Suspense>
      <div className="config-shell">
        <form
          id="config-form"
          ref={configFormRef}
          onSubmit={(event) => {
            void save(event)
          }}
        />
        <fieldset disabled={busy} className="editor-fieldset">
          <div className="toolbar">
            <div className="page-title">
              <h1 ref={headingRef} tabIndex={-1}>
                {page === 'config'
                  ? 'Configuration'
                  : page === 'optimization'
                    ? 'Optimization'
                    : 'Results'}
              </h1>
              {page === 'config' && (
                <span
                  className={`edit-indicator ${dirty ? 'is-dirty' : ''}`}
                  role="img"
                  aria-label={dirty ? 'Unsaved changes' : 'No unsaved changes'}
                />
              )}
            </div>
            <div className="actions">
              <button
                type="button"
                disabled={busy || running}
                onClick={() => importInput.current?.click()}
                title="Import experiment JSON from input/requests/ or input/config.json"
              >
                Import JSON
              </button>
              <input
                ref={importInput}
                type="file"
                accept=".json,application/json"
                aria-label="Experiment JSON file"
                hidden
                disabled={busy || running}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (file) void importExperiment(file)
                }}
              />
              {page === 'config' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      void load()
                    }}
                  >
                    Load saved
                  </button>
                  <button form="config-form" type="submit" className="primary">
                    Save config
                  </button>
                  <button type="button" onClick={openResults}>
                    Saved results
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(page === 'results' ? 'optimization' : 'config')}
                >
                  {page === 'results' ? 'Back to optimization' : 'Back to config'}
                </button>
              )}
            </div>
          </div>
          <p className="status-message" role="status">
            {running
              ? 'Optimization request is active.'
              : busy
                ? 'Connecting to backend...'
                : page === 'config'
                  ? message
                  : page === 'results'
                    ? 'Inspect saved run snapshots and compare experiments.'
                    : 'Set the seed and iteration limit, then run the current scenario.'}
          </p>
          {importNotice && (
            <p className="field-hint" role="status">
              {importNotice}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="config-navigation" hidden={page !== 'config'}>
            <button type="button" className="primary next-button" onClick={nextPage}>
              {running ? 'View live run' : 'Next: Optimization'} <span aria-hidden="true">→</span>
            </button>
            <p className="field-hint">
              Your draft carries over. Saving the main config is optional.
            </p>
          </div>
          <div hidden={page !== 'optimization'}>
            <label className="number-field saved-run-picker algorithm-picker">
              <span>Algorithm</span>
              <select
                value={algorithm}
                disabled={running}
                onChange={(event) =>
                  setAlgorithm(
                    event.target.value === 'simulated_annealing'
                      ? 'simulated_annealing'
                      : event.target.value === 'genetic_algorithm'
                        ? 'genetic_algorithm'
                        : 'hill_climbing'
                  )
                }
              >
                <option value="hill_climbing">Hill Climbing</option>
                <option value="simulated_annealing">Simulated Annealing</option>
                <option value="genetic_algorithm">Genetic Algorithm</option>
              </select>
            </label>
            <div className="config-navigation" hidden={algorithm !== 'hill_climbing'}>
              <button type="button" className="primary next-button" onClick={openResults}>
                {running ? 'View saved results' : 'Next: Results'} <span aria-hidden="true">→</span>
              </button>
              <p className="field-hint">
                Completed runs are saved automatically. Results also includes your saved experiment
                history.
              </p>
            </div>
            <p className="scenario-summary">
              {config.ship.width} × {config.ship.length} deck · {config.vehicles.length} vehicles ·{' '}
              {config.preserve_positions ? 'Custom start' : 'Random start'} ·{' '}
              {objectiveLabel(config)}
            </p>
            <div hidden={algorithm !== 'hill_climbing'}>
              <SteepestAscentPanel
                key={hcImport?.key ?? 0}
                preset={hcImport ?? undefined}
                config={config}
                run={completedRun}
                live={liveRun}
                view={view}
                onViewChange={(next) => {
                  setView(next)
                  if (next === 'live') setSelectedIteration(null)
                }}
                playbackSpeed={playbackSpeed}
                onSpeedChange={setPlaybackSpeed}
                selectedIteration={selectedIteration}
                comparison={comparison}
                onComparisonChange={(iteration, side) => {
                  setSelectedIteration(iteration)
                  setView(side)
                }}
                validateConfig={validateConfig}
                onStart={() => {
                  setCompletedRun(null)
                  setLiveRun(null)
                  setSelectedIteration(null)
                  setView('live')
                }}
                onProgress={setLiveRun}
                onRunningChange={(active) => {
                  setRunning(active)
                  if (!active)
                    setLiveRun((previous) =>
                      previous
                        ? {
                            ...previous,
                            best_candidate: null,
                            best_objective: null,
                            neighbor_preview: null,
                          }
                        : null
                    )
                }}
                onComplete={(run) => {
                  setCompletedRun(run)
                  loadDefaultResult(run)
                  setView('final')
                }}
              />
            </div>
            <div hidden={algorithm !== 'simulated_annealing'}>
              <AnnealingPanel
                key={saImport?.key ?? 0}
                preset={saImport ?? undefined}
                config={config}
                onPreview={setAnnealingPreview}
                onRunningChange={setRunning}
              />
            </div>
            <div hidden={algorithm !== 'genetic_algorithm'}>
              <GeneticAlgorithmPanel
                key={gaImport?.key ?? 0}
                preset={gaImport ?? undefined}
                config={config}
                onPreview={setGeneticPreview}
                onRunningChange={handleGARunning}
              />
            </div>
          </div>
          <div hidden={page !== 'results'}>
            <ResultsPage
              active={page === 'results'}
              run={resultRun}
              latestRun={completedRun}
              view={resultView}
              onViewChange={setResultView}
              onLoadDefault={loadDefaultResult}
            />
          </div>

          <div className="workspace">
            <div className="configuration" hidden={page !== 'config'}>
              <section className="panel" aria-labelledby="ship-heading">
                <div className="section-heading">
                  <h2 id="ship-heading">Ship</h2>
                  <span className="unit-tag">Grid units</span>
                </div>
                <div className="ship-fields">
                  {(['length', 'width', 'max_weight'] as const).map((key) => (
                    <NumberField
                      key={key}
                      label={
                        key === 'max_weight'
                          ? 'Weight capacity'
                          : key === 'length'
                            ? 'Length (Y)'
                            : 'Width (X)'
                      }
                      value={config.ship[key]}
                      min={1}
                      onChange={(value) =>
                        edit({ ...config, ship: { ...config.ship, [key]: value ?? 0 } })
                      }
                    />
                  ))}
                </div>
                <p className="field-hint">
                  Drag the 3D background to rotate. Unplaced vehicles are staged beside the ship;
                  vehicle height is illustrative.
                </p>
              </section>

              <section className="panel" aria-labelledby="objective-heading">
                <div className="section-heading">
                  <h2 id="objective-heading">Objective</h2>
                  <span className="unit-tag">Applies to HC, SA, and GA</span>
                </div>
                <label className="number-field saved-run-picker">
                  <span>Objective mode</span>
                  <select
                    form="config-form"
                    aria-label="Objective mode"
                    value={config.objective_mode ?? 'shipping_fee'}
                    onChange={(event) =>
                      edit({
                        ...config,
                        objective_mode:
                          event.target.value === 'eta_priority' ? 'eta_priority' : 'shipping_fee',
                      })
                    }
                  >
                    <option value="shipping_fee">Shipping fee (required)</option>
                    <option value="eta_priority">ETA priority (bonus)</option>
                  </select>
                </label>
                <p className="field-hint">
                  {config.objective_mode === 'eta_priority'
                    ? 'ETA only: each loaded vehicle earns max ETA + 1 - its ETA points. Smaller ETA is preferred; shipping fee is ignored.'
                    : 'Maximize the shipping fees of loaded vehicles. Default for the required experiments.'}
                </p>
              </section>
              <section className="panel start-options" aria-label="Initial state">
                <label className="start-mode">
                  <span>
                    <strong>Use custom starting positions</strong>
                    <small>
                      {config.preserve_positions
                        ? 'Filled X/Y positions are preserved. Vehicles without positions are randomized.'
                        : 'All positions are randomized when a run starts. Saved coordinates are ignored.'}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={config.preserve_positions}
                    aria-label="Use custom starting positions"
                    onChange={(event) =>
                      edit({ ...config, preserve_positions: event.target.checked })
                    }
                  />
                  <span className="switch-track" aria-hidden="true" />
                </label>
              </section>

              <section className="panel" aria-labelledby="vehicles-heading">
                <div className="section-heading">
                  <h2 id="vehicles-heading">
                    Vehicles <span className="count">{config.vehicles.length}</span>
                  </h2>
                  <button type="button" className="text-button" onClick={addVehicle}>
                    + Add vehicle
                  </button>
                </div>
                <VehicleGenerator
                  vehicleCount={config.vehicles.length}
                  onGenerate={(vehicles) => {
                    edit({ ...config, vehicles })
                    setMessage(
                      `Generated ${vehicles.length} vehicles. Customize any values below, then save your config.`
                    )
                  }}
                />
                {config.vehicles.length === 0 && (
                  <div className="empty-state">
                    <h3>No vehicles yet</h3>
                    <p>Generate vehicles using your ranges, or add one manually.</p>
                  </div>
                )}
                <div className="vehicle-list">
                  {config.vehicles.map((vehicle, index) => (
                    <details
                      className="vehicle-card"
                      key={vehicle.id}
                      open={index === 0}
                      onInvalidCapture={(event) => {
                        event.currentTarget.open = true
                      }}
                    >
                      <summary>
                        <span className="vehicle-name">
                          <span
                            className="vehicle-dot"
                            style={{ background: vehicleColor(vehicle.id) }}
                          />
                          Vehicle {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="vehicle-summary">
                          {vehicle.width} × {vehicle.length}
                          <span className="summary-divider">/</span>
                          {vehicle.weight.toLocaleString()} weight
                        </span>
                        <span className="expand-icon" aria-hidden="true">
                          +
                        </span>
                      </summary>
                      <div className="vehicle-body">
                        <div className="vehicle-fields">
                          {(
                            ['length', 'width', 'weight', 'eta', 'shipping_fee', 'x', 'y'] as const
                          ).map((key) => (
                            <NumberField
                              key={key}
                              label={
                                key === 'shipping_fee'
                                  ? 'Shipping fee'
                                  : key === 'eta'
                                    ? 'ETA'
                                    : key === 'x'
                                      ? 'Position X'
                                      : key === 'y'
                                        ? 'Position Y'
                                        : key[0].toUpperCase() + key.slice(1)
                              }
                              value={vehicle[key]}
                              optional={key === 'x' || key === 'y'}
                              disabled={!config.preserve_positions && (key === 'x' || key === 'y')}
                              min={key === 'length' || key === 'width' || key === 'weight' ? 1 : 0}
                              onChange={(value) =>
                                updateVehicle(vehicle.id, {
                                  [key]: value ?? (key === 'x' || key === 'y' ? null : 0),
                                })
                              }
                            />
                          ))}
                        </div>
                        <div className="vehicle-footer">
                          <p className="field-hint">
                            {config.preserve_positions
                              ? 'Leave both positions empty to randomize this vehicle.'
                              : 'Enable custom starting positions to edit X/Y.'}
                          </p>
                          <button
                            className="remove"
                            type="button"
                            aria-label={`Remove vehicle ${index + 1}`}
                            onClick={() =>
                              edit({
                                ...config,
                                vehicles: config.vehicles.filter((item) => item.id !== vehicle.id),
                              })
                            }
                          >
                            Remove vehicle
                          </button>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            </div>

            <details className="panel preview" hidden={page === 'results'}>
              <summary>
                <span>
                  {page === 'config' || view === 'configuration'
                    ? 'Draft arrangement'
                    : view === 'initial'
                      ? 'Initial run arrangement'
                      : view === 'live'
                        ? 'Current search state'
                        : view === 'before' || view === 'after'
                          ? `Iteration ${comparison?.iteration ?? ''}: ${view === 'before' ? 'Before' : 'After'}`
                          : 'Final arrangement'}
                </span>
                <span className="preview-summary">
                  {placed.length} placed <span aria-hidden="true">+</span>
                </span>
              </summary>
              <div className="preview-body">
                <div className="stats">
                  <div>
                    <strong>
                      {placed.length}/{previewConfig.vehicles.length}
                    </strong>
                    <span>Placed vehicles</span>
                  </div>
                  <div>
                    <strong>{totalWeight.toLocaleString()}</strong>
                    <span>/ {displayShip.max_weight.toLocaleString()} weight</span>
                  </div>
                </div>
                <div className="capacity-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.min(100, (totalWeight / Math.max(1, displayShip.max_weight)) * 100)}%`,
                    }}
                  />
                </div>
                <div className="deck-label">
                  <span>TOP VIEW</span>
                  <span>
                    {displayShip.width} × {displayShip.length} units
                  </span>
                </div>
                <ArrangementGrid config={previewConfig} />
                {warnings.length > 0 && (
                  <div className="warnings" role="status">
                    <strong>Arrangement needs attention</strong>
                    <ul>
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="preview-key">
                  <span>
                    <i />
                    {placed.length} placed
                  </span>
                  <span>
                    <i />
                    {previewConfig.vehicles.length - placed.length} unplaced
                  </span>
                  <span>(0, 0) top-left</span>
                </div>
              </div>
            </details>
          </div>
        </fieldset>
      </div>
    </main>
  )
}

export default App
