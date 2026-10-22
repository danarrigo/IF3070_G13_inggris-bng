import type { Job, JobRequest, Run } from '../types/run.ts'

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const detail = typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string'
      ? body.detail : `Request failed (${response.status}). Check the backend and input values.`
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}

export async function startJob(request: JobRequest): Promise<Job> {
  return read(await fetch('/api/jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  }))
}

export async function getJob(id: string, signal?: AbortSignal): Promise<Job> {
  return read(await fetch(`/api/jobs/${encodeURIComponent(id)}`, { signal }))
}

export async function getActiveJob(signal?: AbortSignal): Promise<Job | null> {
  return read(await fetch('/api/jobs/active', { signal }))
}

export async function listRuns(signal?: AbortSignal): Promise<Run[]> {
  const runs = await read<Run[]>(await fetch('/api/runs?include_trace=false', { signal }))
  return runs.filter(run => run.settings.algorithm === 'genetic_algorithm')
}

export async function getRun(id: string, signal?: AbortSignal): Promise<Run> {
  return read(await fetch(`/api/runs/${encodeURIComponent(id)}`, { signal }))
}

export async function cancelJob(id: string): Promise<Job> {
  return read(await fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }))
}

export async function deleteRun(id: string): Promise<void> {
  const response = await fetch(`/api/runs/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (response.status === 404) return // Already removed in another window.
  if (!response.ok) await read(response)
}
