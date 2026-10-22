import type { Config } from '../types/config'
import type { AnnealingSettings, SearchRun, Snapshot } from '../types/run'

async function read(response: Response): Promise<unknown> {
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    throw new Error(
      typeof detail === 'string'
        ? detail
        : `Request failed (${response.status}). Check FastAPI; saving/loading also requires MongoDB.`
    )
  }
  return response.json()
}

export function streamAnnealing(
  config: Config,
  settings: AnnealingSettings,
  seed: number,
  count: 1 | 3,
  onProgress: (index: number, snapshot: Snapshot) => void,
  signal: AbortSignal,
  saveToOutput = false
): Promise<SearchRun[]> {
  return new Promise((resolve, reject) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/search/simulated-annealing/stream`
    )
    let finished = false
    function stop(error: Error) {
      if (finished) return
      finished = true
      socket.close()
      signal.removeEventListener('abort', abort)
      reject(error)
    }
    function abort() {
      stop(new Error('Search cancelled.'))
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
    }
    socket.onopen = () =>
      socket.send(
        JSON.stringify({
          config,
          settings,
          random_seed: seed,
          run_count: count,
          save_to_output: saveToOutput,
        })
      )
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'progress') onProgress(message.run_index, message.snapshot)
        else if (message.type === 'complete') {
          finished = true
          signal.removeEventListener('abort', abort)
          socket.close()
          resolve(message.runs)
        } else if (message.type === 'error') stop(new Error(message.message))
      } catch {
        stop(new Error('The backend returned an invalid search update.'))
      }
    }
    socket.onerror = () =>
      stop(new Error('Could not stream the run. Check FastAPI and the WebSocket proxy.'))
    socket.onclose = () => {
      if (!finished) stop(new Error('Search connection closed before completion.'))
    }
  })
}

export async function loadAnnealingRuns(): Promise<SearchRun[]> {
  const data = (await read(await fetch('/api/runs'))) as SearchRun[]
  return data.filter(
    (run) => run.settings.algorithm === 'simulated_annealing' && run.result.snapshots?.length > 0
  )
}
