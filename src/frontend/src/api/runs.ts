import { parseRun } from './optimization.ts'
import type { SteepestAscentRun } from '../types/run.ts'

export function parseSavedRuns(data: unknown): { runs: SteepestAscentRun[]; unavailable: number } {
  if (!Array.isArray(data)) throw new Error('Invalid saved-run response.')
  const runs: SteepestAscentRun[] = []
  let unavailable = 0
  for (const item of data) {
    try {
      runs.push(parseRun(item))
    } catch {
      unavailable++
    }
  }
  return { runs, unavailable }
}

export async function loadRuns(signal: AbortSignal, configHash?: string) {
  const query = configHash ? `?config_hash=${encodeURIComponent(configHash)}` : ''
  const response = await fetch(`/api/runs${query}`, { signal })
  if (!response.ok) throw new Error('Could not load saved runs. Check FastAPI and MongoDB.')
  const data: unknown = await response.json()
  return parseSavedRuns(data)
}
