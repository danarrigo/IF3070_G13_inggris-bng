import { lazy, Suspense, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { loadConfig, saveConfig } from './api/config'
import VehicleGenerator from './components/VehicleGenerator'
import AnnealingPanel from './components/AnnealingPanel'
import type { Config, Vehicle } from './types/config'
import './App.css'

const ShipBackground = lazy(() => import('./components/ShipBackground'))

const initialConfig: Config = {
  ship: { length: 20, width: 10, max_weight: 10000 },
  vehicles: [],
  preserve_positions: false,
}

function NumberField({ label, value, min = 0, optional = false, disabled = false, onChange }: {
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
      <input form="config-form" type="number" min={min} step={1} required={!optional} disabled={disabled}
        value={value ?? ''} placeholder={optional ? 'Unplaced' : undefined}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.valueAsNumber)} />
    </label>
  )
}

function App() {
  const [config, setConfig] = useState<Config>(initialConfig)
  const [runPreviewConfig, setRunPreviewConfig] = useState<Config | null>(null)
  const [message, setMessage] = useState('Start with a ship, then add your vehicles.')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  function edit(next: Config) {
    setRunPreviewConfig(null)
    setConfig(next)
    setDirty(true)
    setError('')
  }

  function updateVehicle(id: string, patch: Partial<Vehicle>) {
    edit({ ...config, vehicles: config.vehicles.map((vehicle) => vehicle.id === id ? { ...vehicle, ...patch } : vehicle) })
  }

  function addVehicle() {
    edit({ ...config, vehicles: [...config.vehicles, {
      id: crypto.randomUUID(), x: null, y: null, length: 4, width: 2,
      weight: 1000, eta: 0, shipping_fee: 500,
    }] })
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
        setRunPreviewConfig(null)
        setDirty(false)
        setMessage('Loaded the saved configuration.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load config.')
    } finally {
      setBusy(false)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (config.preserve_positions && config.vehicles.some((vehicle) => (vehicle.x === null) !== (vehicle.y === null))) {
      setError('Set both X and Y for a vehicle, or leave both empty.')
      return
    }
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

  const previewConfig = useMemo(() => config.preserve_positions ? config : {
    ...config, vehicles: config.vehicles.map((vehicle) => ({ ...vehicle, x: null, y: null })),
  }, [config])
  const placed = previewConfig.vehicles.filter((vehicle) => vehicle.x !== null && vehicle.y !== null)
  const totalWeight = placed.reduce((sum, vehicle) => sum + vehicle.weight, 0)
  const warnings: string[] = []
  if (totalWeight > config.ship.max_weight) warnings.push('Placed vehicles exceed the ship weight capacity.')
  previewConfig.vehicles.forEach((vehicle, index) => {
    if (vehicle.x !== null && vehicle.y !== null
      && (vehicle.x + vehicle.width > config.ship.width || vehicle.y + vehicle.length > config.ship.length)) {
      warnings.push(`Vehicle ${index + 1} extends beyond the ship.`)
    }
  })
  const overlap = placed.some((a, index) => placed.slice(index + 1).some((b) =>
    a.x !== null && a.y !== null && b.x !== null && b.y !== null
    && a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.length && a.y + a.length > b.y))
  if (overlap) warnings.push('Some placed vehicles overlap.')

  return (
    <main>
      <Suspense fallback={<div className="ship-background" aria-hidden="true" />}>
        <ShipBackground config={runPreviewConfig ?? previewConfig} />
      </Suspense>
      <div className="config-shell">
      <form id="config-form" onSubmit={(event) => { void save(event) }} />
        <fieldset disabled={busy} className="editor-fieldset">
          <div className="toolbar">
            <h1>Configuration<span className={`edit-indicator ${dirty ? 'is-dirty' : ''}`} aria-label={dirty ? 'Unsaved changes' : 'No unsaved changes'} /></h1>
            <div className="actions">
              <button type="button" onClick={() => { void load() }}>Load saved</button>
              <button form="config-form" type="submit" className="primary">Save config</button>
            </div>
          </div>
          <p className="status-message" role="status">{busy ? 'Connecting to backend...' : message}</p>
          {error && <p className="error" role="alert">{error}</p>}

          <div className="workspace">
            <div className="configuration">
              <section className="panel" aria-labelledby="ship-heading">
                <div className="section-heading"><h2 id="ship-heading">Ship</h2><span className="unit-tag">Grid units</span></div>
                <div className="ship-fields">
                  {(['length', 'width', 'max_weight'] as const).map((key) => (
                    <NumberField key={key} label={key === 'max_weight' ? 'Weight capacity' : key === 'length' ? 'Length (Y)' : 'Width (X)'}
                      value={config.ship[key]} min={1}
                      onChange={(value) => edit({ ...config, ship: { ...config.ship, [key]: value ?? 0 } })} />
                  ))}
                </div>
                <p className="field-hint">Drag the 3D background to rotate. Unplaced vehicles are staged beside the ship; vehicle height is illustrative.</p>
              </section>

              <section className="panel start-options" aria-label="Initial state">
                <label className="start-mode">
                  <span><strong>Use custom starting positions</strong>
                    <small>{config.preserve_positions
                      ? 'Filled X/Y positions are preserved. Vehicles without positions are randomized.'
                      : 'All positions are randomized when a run starts. Saved coordinates are ignored.'}</small>
                  </span>
                  <input type="checkbox" role="switch" checked={config.preserve_positions}
                    aria-label="Use custom starting positions"
                    onChange={(event) => edit({ ...config, preserve_positions: event.target.checked })} />
                  <span className="switch-track" aria-hidden="true" />
                </label>
              </section>

              <section className="panel" aria-labelledby="vehicles-heading">
                <div className="section-heading"><h2 id="vehicles-heading">Vehicles <span className="count">{config.vehicles.length}</span></h2>
                  <button type="button" className="text-button" onClick={addVehicle}>+ Add vehicle</button></div>
                <VehicleGenerator vehicleCount={config.vehicles.length} onGenerate={(vehicles) => {
                  edit({ ...config, vehicles })
                  setMessage(`Generated ${vehicles.length} vehicles. Customize any values below, then save your config.`)
                }} />
                {config.vehicles.length === 0 && <div className="empty-state"><h3>No vehicles yet</h3>
                  <p>Generate vehicles using your ranges, or add one manually.</p></div>}
                <div className="vehicle-list">
                  {config.vehicles.map((vehicle, index) => (
                    <details className="vehicle-card" key={vehicle.id} open={index === 0}
                      onInvalidCapture={(event) => { event.currentTarget.open = true }}>
                      <summary>
                        <span className="vehicle-name"><span className="vehicle-dot" style={{ background: `hsl(${index * 67 + 165} 45% 35%)` }} />Vehicle {String(index + 1).padStart(2, '0')}</span>
                        <span className="vehicle-summary">{vehicle.width} × {vehicle.length}<span className="summary-divider">/</span>{vehicle.weight.toLocaleString()} weight</span>
                        <span className="expand-icon" aria-hidden="true">+</span>
                      </summary>
                      <div className="vehicle-body"><div className="vehicle-fields">
                        {(['length', 'width', 'weight', 'eta', 'shipping_fee', 'x', 'y'] as const).map((key) => (
                          <NumberField key={key} label={key === 'shipping_fee' ? 'Shipping fee' : key === 'eta' ? 'ETA' : key === 'x' ? 'Position X' : key === 'y' ? 'Position Y' : key[0].toUpperCase() + key.slice(1)}
                            value={vehicle[key]} optional={key === 'x' || key === 'y'}
                            disabled={!config.preserve_positions && (key === 'x' || key === 'y')}
                            min={key === 'length' || key === 'width' || key === 'weight' ? 1 : 0}
                            onChange={(value) => updateVehicle(vehicle.id, { [key]: value ?? (key === 'x' || key === 'y' ? null : 0) })} />
                        ))}
                      </div>
                      <div className="vehicle-footer"><p className="field-hint">{config.preserve_positions ? 'Leave both positions empty to randomize this vehicle.' : 'Enable custom starting positions to edit X/Y.'}</p>
                        <button className="remove" type="button" aria-label={`Remove vehicle ${index + 1}`}
                          onClick={() => edit({ ...config, vehicles: config.vehicles.filter((item) => item.id !== vehicle.id) })}>Remove vehicle</button></div>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            </div>

            <AnnealingPanel config={config} onPreview={setRunPreviewConfig} />
            <details className="panel preview">
              <summary><span>Initial arrangement</span><span className="preview-summary">{placed.length} placed <span aria-hidden="true">+</span></span></summary>
              <div className="preview-body">
              <div className="stats"><div><strong>{placed.length}/{config.vehicles.length}</strong><span>Placed vehicles</span></div>
                <div><strong>{totalWeight.toLocaleString()}</strong><span>/ {config.ship.max_weight.toLocaleString()} weight</span></div></div>
              <div className="capacity-track" aria-hidden="true"><span style={{ width: `${Math.min(100, totalWeight / Math.max(1, config.ship.max_weight) * 100)}%` }} /></div>
              <div className="deck-label"><span>TOP VIEW</span><span>{config.ship.width} × {config.ship.length} units</span></div>
              {config.ship.width > 0 && config.ship.length > 0 ? (
                <div className="ship-grid" role="img" aria-label={`Ship grid, ${config.ship.width} wide by ${config.ship.length} long, ${placed.length} placed vehicles`}
                  style={{ width: `min(100%, 320px, ${460 * config.ship.width / config.ship.length}px)`, aspectRatio: `${config.ship.width} / ${config.ship.length}`, backgroundSize: `${100 / config.ship.width}% ${100 / config.ship.length}%` }}>
                  {previewConfig.vehicles.map((vehicle, index) => vehicle.x !== null && vehicle.y !== null && (
                    <div key={vehicle.id} className="grid-vehicle" title={`Vehicle ${index + 1}: (${vehicle.x}, ${vehicle.y}), ${vehicle.width} × ${vehicle.length}`}
                      style={{ left: `${vehicle.x / config.ship.width * 100}%`, top: `${vehicle.y / config.ship.length * 100}%`,
                        width: `${vehicle.width / config.ship.width * 100}%`, height: `${vehicle.length / config.ship.length * 100}%`, background: `hsl(${index * 67 + 165} 45% 35%)` }}>V{index + 1}</div>
                  ))}
                  {placed.length === 0 && <span className="grid-placeholder">No placed vehicles</span>}
                </div>
              ) : <p className="error">Enter positive ship dimensions to show the grid.</p>}
              {warnings.length > 0 && <div className="warnings" role="status"><strong>Arrangement needs attention</strong><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
              <div className="preview-key"><span><i />{placed.length} placed</span><span><i />{config.vehicles.length - placed.length} unplaced</span><span>(0, 0) top-left</span></div>
              </div>
            </details>
          </div>
        </fieldset>
      </div>
    </main>
  )
}

export default App
