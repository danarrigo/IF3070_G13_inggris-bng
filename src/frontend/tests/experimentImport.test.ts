import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { parseExperimentImport } from '../src/experimentImport.ts'

const root = new URL('../../../input/', import.meta.url)
const hc = JSON.parse(readFileSync(new URL('requests/hc-sideways-seed-43.json', root), 'utf8'))

test('all 33 saved request files restore the exact algorithm parameters, seed, and config', () => {
  const files = readdirSync(new URL('requests/', root)).filter((file) => file.endsWith('.json'))
  assert.equal(files.length, 33)
  for (const file of files) {
    const raw = JSON.parse(readFileSync(new URL(`requests/${file}`, root), 'utf8'))
    const imported = parseExperimentImport(raw)
    assert.notEqual(imported.kind, 'config')
    if (imported.kind === 'config') throw new Error('Expected an experiment')
    assert.equal(imported.kind, raw.settings?.algorithm ?? 'hill_climbing')
    assert.deepEqual(imported.config, raw.config)
    assert.equal(imported.seed, raw.random_seed)
    assert.equal(imported.saveToOutput, raw.save_to_output)
    if (imported.kind === 'hill_climbing') {
      assert.equal(imported.settings.iterations, raw.iterations)
      assert.equal(imported.settings.variant, raw.variant)
      assert.equal(imported.settings.max_sideways, raw.max_sideways)
      assert.equal(imported.settings.max_restart, raw.max_restart)
      assert.equal(imported.showNeighbors, raw.show_neighbors)
    } else {
      assert.deepEqual(imported.settings, raw.settings)
      if (imported.kind === 'simulated_annealing') assert.equal(imported.runCount, raw.run_count)
      else assert.equal(imported.recordDemo, raw.record_demo)
    }
  }
})

test('config-only JSON imports without inventing experiment parameters', () => {
  const config = JSON.parse(readFileSync(new URL('config.json', root), 'utf8'))
  assert.deepEqual(parseExperimentImport(config), { kind: 'config', config })
})

test('invalid parameters and result files are rejected', () => {
  for (const data of [
    null,
    [],
    {},
    { ...hc, iterations: 0 },
    { ...hc, random_seed: '43' },
    { ...hc, variant: 'unknown' },
    { ...hc, save_to_output: 'true' },
    { ...hc, result: {} },
    { ...hc, config: { ...hc.config, vehicles: [hc.config.vehicles[0], hc.config.vehicles[0]] } },
    { ...hc, settings: { algorithm: 'unknown', iterations: 100 } },
  ])
    assert.throws(() => parseExperimentImport(data))
})
