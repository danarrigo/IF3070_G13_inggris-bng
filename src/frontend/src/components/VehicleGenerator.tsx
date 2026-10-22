import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Vehicle } from '../types/config'

const fields = [
  { key: 'length', label: 'Length', minimum: 1 },
  { key: 'width', label: 'Width', minimum: 1 },
  { key: 'weight', label: 'Weight', minimum: 1 },
  { key: 'shipping_fee', label: 'Shipping fee', minimum: 0 },
  { key: 'eta', label: 'ETA', minimum: 0 },
] as const

type RangeKey = (typeof fields)[number]['key']
type Range = { min: number | null; max: number | null }

function VehicleGenerator({
  vehicleCount,
  onGenerate,
}: {
  vehicleCount: number
  onGenerate: (vehicles: Vehicle[]) => void
}) {
  const [count, setCount] = useState<number | null>(10)
  const [ranges, setRanges] = useState<Record<RangeKey, Range>>({
    length: { min: 2, max: 5 },
    width: { min: 1, max: 3 },
    weight: { min: 500, max: 2000 },
    shipping_fee: { min: 100, max: 1000 },
    eta: { min: 0, max: 60 },
  })
  const [error, setError] = useState('')

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (count === null || !Number.isSafeInteger(count) || count < 1 || count > 1000) {
      setError('Enter a vehicle count between 1 and 1,000.')
      return
    }
    for (const field of fields) {
      const { min, max } = ranges[field.key]
      if (
        min === null ||
        max === null ||
        !Number.isSafeInteger(min) ||
        !Number.isSafeInteger(max) ||
        min < field.minimum ||
        max < min
      ) {
        setError(`${field.label}: enter whole-number bounds with minimum no greater than maximum.`)
        return
      }
    }
    if (
      vehicleCount > 0 &&
      !window.confirm(
        'Replace all current vehicles, including custom edits and positions, with new random vehicles?'
      )
    )
      return

    function random(key: RangeKey): number {
      const { min, max } = ranges[key]
      // Bounds have been checked above; null cannot reach generation.
      if (min === null || max === null) throw new Error('Missing range bounds')
      return min + Math.floor(Math.random() * (max - min + 1))
    }

    onGenerate(
      Array.from({ length: count }, () => ({
        id: crypto.randomUUID(),
        x: null,
        y: null,
        length: random('length'),
        width: random('width'),
        weight: random('weight'),
        shipping_fee: random('shipping_fee'),
        eta: random('eta'),
      }))
    )
    setError('')
  }

  return (
    <form className="vehicle-generator" onSubmit={generate}>
      <div className="generation-header">
        <label className="number-field">
          <span>Number of vehicles</span>
          <input
            type="number"
            min={1}
            max={1000}
            step={1}
            required
            value={count ?? ''}
            onChange={(event) =>
              setCount(event.target.value === '' ? null : event.target.valueAsNumber)
            }
          />
        </label>
        <button type="submit" className="primary">
          {vehicleCount > 0 ? 'Regenerate vehicles' : 'Generate vehicles'}
        </button>
      </div>
      <p className="field-hint">Random ranges, inclusive. Customize individual vehicles below.</p>
      <div className="range-table">
        <span aria-hidden="true">Property</span>
        <span aria-hidden="true">Minimum</span>
        <span aria-hidden="true">Maximum</span>
        {fields.map((field) => (
          <div className="range-row" key={field.key}>
            <span>{field.label}</span>
            {(['min', 'max'] as const).map((bound) => (
              <label key={bound}>
                <span className="sr-only">
                  {field.label} {bound === 'min' ? 'minimum' : 'maximum'}
                </span>
                <input
                  type="number"
                  required
                  step={1}
                  min={bound === 'max' ? (ranges[field.key].min ?? field.minimum) : field.minimum}
                  max={Number.MAX_SAFE_INTEGER - 1}
                  value={ranges[field.key][bound] ?? ''}
                  onChange={(event) => {
                    const value = event.target.value === '' ? null : event.target.valueAsNumber
                    setRanges((previous) => ({
                      ...previous,
                      [field.key]: { ...previous[field.key], [bound]: value },
                    }))
                    setError('')
                  }}
                />
              </label>
            ))}
          </div>
        ))}
      </div>
      <p className="field-hint">Vehicles start unplaced. Regenerating replaces the current list.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

export default VehicleGenerator
