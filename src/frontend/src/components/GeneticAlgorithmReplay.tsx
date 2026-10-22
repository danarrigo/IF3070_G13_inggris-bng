import { useEffect, useMemo, useState } from 'react'
import type { Config } from '../types/config'
import type { DemoIndividual, DemoStep, Placement, Run } from '../types/run'
import { arrangementConfig, vehicleColor } from './runView'
import { geneParent, pairParents, rouletteSegments, sourcePopulation } from './demoReplay'

const titles: Record<DemoStep['kind'], string> = {
  population: 'Populasi',
  elite: 'Pertahankan elite',
  roulette: 'Roulette memilih induk',
  crossover: 'Crossover',
  validation: 'Validasi dan retry',
  mutation: 'Mutasi',
  admission: 'Anak masuk populasi baru',
  generation: 'Generasi berikutnya',
}

function ReplayGrid({
  config,
  placements,
  highlighted = [],
}: {
  config: Config
  placements: Placement[]
  highlighted?: string[]
}) {
  return (
    <div
      className="ship-grid replay-grid"
      role="img"
      aria-label="Susunan kendaraan pada langkah replay"
      style={{
        width: `min(100%, 220px, ${(300 * config.ship.width) / config.ship.length}px)`,
        aspectRatio: `${config.ship.width}/${config.ship.length}`,
        backgroundSize: `${100 / config.ship.width}% ${100 / config.ship.length}%`,
      }}
    >
      {placements.map((p) => (
        <div
          key={p.vehicle_id}
          className={`grid-vehicle ${highlighted.includes(p.vehicle_id) ? 'changed-vehicle' : ''}`}
          title={`${p.vehicle_id}: (${p.x}, ${p.y}), ${p.width} × ${p.length}`}
          style={{
            left: `${(p.x / config.ship.width) * 100}%`,
            top: `${(p.y / config.ship.length) * 100}%`,
            width: `${(p.width / config.ship.width) * 100}%`,
            height: `${(p.length / config.ship.length) * 100}%`,
            background: vehicleColor(p.vehicle_id),
          }}
        >
          V{config.vehicles.findIndex((v) => v.id === p.vehicle_id) + 1}
        </div>
      ))}
      {!placements.length && <span className="grid-placeholder">Semua kendaraan di luar</span>}
    </div>
  )
}

function PopulationCards({
  title,
  individuals,
  selected,
  onSelect,
  eliteId,
}: {
  title: string
  individuals: DemoIndividual[]
  selected: string
  onSelect: (individual: DemoIndividual) => void
  eliteId?: string
}) {
  const maximum = Math.max(0, ...individuals.map((i) => i.fitness))
  const average = individuals.length
    ? individuals.reduce((sum, i) => sum + i.fitness, 0) / individuals.length
    : 0
  return (
    <div className="population-group">
      <h3>{title}</h3>
      <p className="field-hint">
        {individuals.length} individu · maksimum {maximum} · rata-rata {average.toFixed(2)}
      </p>
      <div className="population-cards">
        {individuals.map((individual) => (
          <button
            key={individual.id}
            type="button"
            aria-pressed={selected === individual.id}
            onClick={() => onSelect(individual)}
          >
            <strong>
              {individual.id}
              {individual.id === eliteId ? ' · Elite' : ''}
            </strong>
            <span>Fitness {individual.fitness}</span>
            <small>{individual.arrangement.length} kendaraan dimuat</small>
          </button>
        ))}
      </div>
    </div>
  )
}

function Genes({
  config,
  label,
  placements,
  cut,
  child,
}: {
  config: Config
  label: string
  placements: Placement[]
  cut: number | null
  child?: number
}) {
  const byId = new Map(placements.map((p) => [p.vehicle_id, p]))
  return (
    <div className="gene-row">
      <strong className="gene-label">{label}</strong>
      {config.vehicles.map((vehicle, index) => {
        const placement = byId.get(vehicle.id)
        const origin = cut !== null && child ? geneParent(index, cut, child) : null
        return (
          <div
            key={vehicle.id}
            className={`gene-cell ${index === cut ? 'cut-start' : ''} ${origin ? `origin-${origin}` : ''}`}
          >
            <strong>
              <i style={{ background: vehicleColor(vehicle.id) }} />V{index + 1}
            </strong>
            <span>{placement ? `(${placement.x}, ${placement.y})` : 'Luar kapal'}</span>
            <small>{placement ? `${placement.width} × ${placement.length}` : 'Tidak dimuat'}</small>
            {origin && <small>Induk {origin}</small>}
          </div>
        )
      })}
    </div>
  )
}

function Roulette({ step }: { step: DemoStep }) {
  const segments = rouletteSegments(step.fitness)
  const marker =
    step.draw_kind === 'uniform'
      ? ((step.selected_index ?? 0) + 0.5) / segments.length
      : (step.draw ?? 0)
  return (
    <div className="roulette-view">
      <p className="field-hint">
        {step.draw_kind === 'uniform'
          ? `Semua fitness nol: peluang merata. Undian indeks asli ${step.draw} (mulai dari 0).`
          : `Total fitness ${step.fitness.reduce((a, b) => a + b, 0)}. Angka undian asli ${step.draw?.toFixed(6)} (${((step.draw ?? 0) * 100).toFixed(2)}%).`}
      </p>
      <div className="roulette-bar" aria-label="Bagian probabilitas roulette">
        {segments.map((segment) => (
          <span
            key={segment.index}
            style={{
              width: `${segment.probability * 100}%`,
              background: `hsl(${(segment.index * 57) % 360}, 35%, 40%)`,
            }}
            title={`I${segment.index + 1}: ${(segment.probability * 100).toFixed(2)}%`}
          >
            {segment.probability >= 0.08 ? `I${segment.index + 1}` : ''}
          </span>
        ))}
        <i
          className="roulette-marker"
          style={{ left: `${marker * 100}%` }}
          aria-label="Hasil undian"
        />
      </div>
      <table className="roulette-table">
        <thead>
          <tr>
            <th>Individu</th>
            <th>Fitness</th>
            <th>Peluang</th>
            <th>Hasil</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((segment) => (
            <tr
              key={segment.index}
              className={segment.index === step.selected_index ? 'selected-row' : ''}
            >
              <td>
                G{step.generation}-I{segment.index + 1}
              </td>
              <td>{segment.score}</td>
              <td>{(segment.probability * 100).toFixed(2)}%</td>
              <td>{segment.index === step.selected_index ? 'Induk terpilih' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="field-hint">
        Seleksi dengan pengembalian: individu yang sama boleh menjadi kedua induk.
      </p>
    </div>
  )
}

export default function GeneticAlgorithmReplay({
  run,
  onPreview,
}: {
  run: Run
  onPreview: (config: Config | null) => void
}) {
  const trace = run.result.demo_trace!
  const [index, setIndex] = useState(0)
  const [selection, setSelection] = useState<{ label: string; arrangement: Placement[] } | null>(
    null
  )
  const step = trace.steps[index]
  const source = sourcePopulation(trace, step)
  const parents = useMemo(() => pairParents(trace, step), [trace, step])
  const arrangement = useMemo(
    () =>
      selection?.arrangement ??
      step.arrangement ??
      step.individuals[0]?.arrangement ??
      parents[0] ??
      [],
    [selection, step, parents]
  )
  const label =
    selection?.label ??
    (step.child ? `Anak ${step.child}` : (step.individuals[0]?.id ?? titles[step.kind]))
  const generations = [...new Set(trace.steps.map((s) => s.generation))]
  const pairs = [
    ...new Set(
      trace.steps
        .filter((s) => s.generation === step.generation && s.pair !== null)
        .map((s) => s.pair!)
    ),
  ]
  const contextSteps = trace.steps
    .map((item, position) => ({ item, position }))
    .filter(({ item }) => item.generation === step.generation && item.pair === step.pair)
  const elite = trace.steps.find(
    (item) => item.kind === 'elite' && item.generation === step.generation
  )
  const sibling =
    step.kind === 'validation'
      ? trace.steps
          .slice(0, index)
          .find(
            (item) =>
              item.kind === 'validation' &&
              item.generation === step.generation &&
              item.pair === step.pair &&
              item.accepted &&
              item.child !== step.child
          )
      : undefined

  useEffect(() => {
    onPreview(arrangementConfig(run.config, arrangement))
  }, [run.config, arrangement, onPreview])

  function go(next: number) {
    setIndex(next)
    setSelection(null)
  }
  function select(individual: DemoIndividual) {
    setSelection({ label: individual.id, arrangement: individual.arrangement })
  }
  const isNewPopulation =
    step.kind === 'elite' || step.kind === 'admission' || step.kind === 'generation'

  return (
    <section className="ga-replay" aria-label="Rekaman proses Genetic Algorithm">
      <div className="section-heading">
        <h2>Proses GA · {titles[step.kind]}</h2>
        <span className="unit-tag">
          Langkah {index + 1}/{trace.steps.length}
        </span>
      </div>
      <div className="replay-navigation">
        <button type="button" disabled={index === 0} onClick={() => go(index - 1)}>
          Previous
        </button>
        <button
          type="button"
          disabled={index === trace.steps.length - 1}
          onClick={() => go(index + 1)}
        >
          Next
        </button>
        <label>
          Generasi
          <select
            aria-label="Generasi replay"
            value={step.generation}
            onChange={(event) =>
              go(
                trace.steps.findIndex(
                  (s) => s.kind === 'population' && s.generation === Number(event.target.value)
                )
              )
            }
          >
            {generations.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pasangan
          <select
            aria-label="Pasangan replay"
            value={step.pair ?? ''}
            onChange={(event) => {
              const pair = event.target.value === '' ? null : Number(event.target.value)
              go(
                trace.steps.findIndex(
                  (s) =>
                    s.generation === step.generation &&
                    (pair === null ? s.kind === 'population' : s.pair === pair)
                )
              )
            }}
          >
            <option value="">Populasi / elite</option>
            {pairs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tahap
          <select
            aria-label="Tahap replay"
            value={index}
            onChange={(event) => go(Number(event.target.value))}
          >
            {contextSteps.map(({ item, position }, stageIndex) => (
              <option key={position} value={position}>
                {titles[item.kind]}
                {item.kind === 'roulette' ? ` · induk ${stageIndex + 1}` : ''}
                {item.child ? ` · anak ${item.child}` : ''}
                {item.attempt ? ` · percobaan ${item.attempt}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="replay-narration" role="status">
        {step.message}
      </p>
      {step.pair !== null && (
        <p className="field-hint">
          Generasi {step.generation} → {step.generation + 1} · pasangan {step.pair}
          {step.child ? ` · anak ${step.child}` : ''}
        </p>
      )}
      {step.kind === 'roulette' && <Roulette step={step} />}
      {step.draw_kind === 'rate' && (
        <p className="draw-detail">
          Undian {(step.draw! * 100).toFixed(2)}% &lt; peluang {(step.rate! * 100).toFixed(2)}%?{' '}
          <strong>{step.draw! < step.rate! ? 'Ya' : 'Tidak'}</strong>
        </p>
      )}
      {(step.kind === 'crossover' || step.kind === 'validation') && (
        <>
          <p className="field-hint">
            {step.parent_ids.join(' + ')}
            {step.cut !== null ? ` · titik potong setelah V${step.cut}` : ''}
          </p>
          <div className="genes-scroll">
            {parents.map((parent, i) => (
              <Genes
                key={i}
                config={run.config}
                label={`Induk ${i + 1}`}
                placements={parent}
                cut={step.cut}
              />
            ))}
            {step.arrangement !== null && (
              <Genes
                config={run.config}
                label={`Anak ${step.child ?? ''}`}
                placements={step.arrangement}
                cut={step.cut}
                child={step.child ?? undefined}
              />
            )}
            {sibling?.arrangement && (
              <Genes
                config={run.config}
                label={`Anak ${sibling.child} valid`}
                placements={sibling.arrangement}
                cut={sibling.cut}
                child={sibling.child ?? undefined}
              />
            )}
          </div>
          {step.cut !== null && (
            <p className="field-hint">
              <span className="origin-label origin-1">Dari induk 1</span>{' '}
              <span className="origin-label origin-2">Dari induk 2</span> · titik potong ditandai
              garis putus-putus.
            </p>
          )}
          {!!step.retained_children.length && (
            <p className="field-hint">
              Anak {step.retained_children.join(', ')} sudah valid pada percobaan sebelumnya dan
              tidak dibuat ulang.
            </p>
          )}
          {!!step.errors.length && (
            <div className="error">
              {step.errors.map((error) => (
                <p key={error}>
                  {run.config.vehicles.reduce(
                    (text, v, i) => text.replaceAll(v.id, `V${i + 1}`),
                    error
                  )}
                </p>
              ))}
            </div>
          )}
        </>
      )}
      {isNewPopulation ? (
        <div className="generation-comparison">
          <PopulationCards
            title={`Populasi asal G${step.generation}`}
            individuals={source}
            selected={label}
            onSelect={select}
            eliteId={
              elite?.selected_index != null
                ? `G${step.generation}-I${elite.selected_index + 1}`
                : undefined
            }
          />
          <PopulationCards
            title={`Populasi baru G${step.generation + 1}${step.kind !== 'generation' ? ' (sedang diisi)' : ''}`}
            individuals={step.individuals}
            selected={label}
            onSelect={select}
            eliteId={`G${step.generation + 1}-I1`}
          />
        </div>
      ) : (
        step.kind === 'population' && (
          <PopulationCards
            title={`Generasi ${step.generation}`}
            individuals={step.individuals}
            selected={label}
            onSelect={select}
          />
        )
      )}
      {step.kind === 'mutation' && step.before !== null && (
        <div className="mutation-comparison">
          {[
            { label: 'Sebelum mutasi', arrangement: step.before },
            { label: 'Sesudah mutasi', arrangement: step.arrangement ?? [] },
          ].map((item) => (
            <div key={item.label}>
              <button type="button" onClick={() => setSelection(item)}>
                {item.label} · fitness{' '}
                {item.arrangement.reduce(
                  (sum, p) =>
                    sum +
                    (run.config.vehicles.find((v) => v.id === p.vehicle_id)?.shipping_fee ?? 0),
                  0
                )}
              </button>
              <ReplayGrid
                config={run.config}
                placements={item.arrangement}
                highlighted={step.changed_vehicle_ids}
              />
            </div>
          ))}
          <p className="field-hint">
            Operasi: {step.operation}. Kendaraan berubah:{' '}
            {step.changed_vehicle_ids
              .map((id) => `V${run.config.vehicles.findIndex((v) => v.id === id) + 1}`)
              .join(', ') || 'Tidak ada'}
            . Sorotan kuning menunjukkan perubahan; mutasi dapat menurunkan fitness.
          </p>
        </div>
      )}
      <div className="replay-preview">
        <h3>Viewer: {label}</h3>
        <p className="field-hint">
          Pilihan ini juga ditampilkan pada kapal 3D. Kandidat ditolak ditampilkan untuk menjelaskan
          pelanggaran, bukan sebagai solusi valid.
        </p>
        <ReplayGrid
          config={run.config}
          placements={arrangement}
          highlighted={step.changed_vehicle_ids}
        />
      </div>
      <p className="field-hint">
        Rekaman keputusan asli · tidak ada undian ulang saat Previous/Next · generasi 0 adalah
        populasi awal.
      </p>
    </section>
  )
}
