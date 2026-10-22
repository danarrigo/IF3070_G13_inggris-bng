import type { Config } from '../types/config'
import type { LiveRun, SteepestAscentRun } from '../types/run'
import { advanceLiveRun, parseProgress, parseRun } from './optimization'

export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled.')
    this.name = 'RunCancelledError'
  }
}

export function executeHillClimbingLive(
  config: Config,
  randomSeed: number,
  iterations: number,
  onProgress: (live: LiveRun) => void | Promise<void>,
  signal: AbortSignal,
  showNeighbors = false,
  settings: Pick<SteepestAscentRun['settings'], 'variant' | 'max_sideways' | 'max_restart'> = { variant: 'steepest_ascent' }
): Promise<SteepestAscentRun> {
  if (signal.aborted) return Promise.reject(new RunCancelledError())
  const payload = JSON.stringify({
    config,
    random_seed: randomSeed,
    iterations,
    show_neighbors: showNeighbors,
    acknowledge_progress: true,
    ...settings,
  })
  return new Promise((resolve, reject) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/optimization/hill-climbing/live`
    )
    let settled = false
    let live: LiveRun | null = null
    function cleanup() {
      signal.removeEventListener('abort', abort)
      socket.close()
    }
    function fail(error: Error) {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    function abort() {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'cancel' }))
      else fail(new RunCancelledError())
    }
    signal.addEventListener('abort', abort, { once: true })
    socket.onopen = () => {
      if (settled || signal.aborted) {
        socket.close()
        return
      }
      socket.send(payload)
    }
    socket.onmessage = async (event: MessageEvent<unknown>) => {
      if (settled) return
      try {
        if (typeof event.data !== 'string') throw new Error('Unexpected WebSocket message.')
        const data: unknown = JSON.parse(event.data)
        if (typeof data !== 'object' || data === null || !('type' in data))
          throw new Error('Invalid WebSocket message.')
        if (data.type === 'progress') {
          if (signal.aborted) return
          if (
            !('sequence' in data) ||
            typeof data.sequence !== 'number' ||
            !Number.isSafeInteger(data.sequence) ||
            data.sequence <= 0
          )
            throw new Error('Missing progress sequence.')
          live = advanceLiveRun(live, parseProgress(data), randomSeed)
          await onProgress(live)
          if (!settled && !signal.aborted && socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: 'ack', sequence: data.sequence }))
        } else if (data.type === 'complete') {
          const run = parseRun('run' in data ? data.run : null)
          settled = true
          cleanup()
          resolve(run)
        } else if (data.type === 'cancelled') {
          fail(new RunCancelledError())
        } else if (data.type === 'error') {
          fail(
            new Error(
              'detail' in data && typeof data.detail === 'string'
                ? data.detail
                : 'The live search failed.'
            )
          )
        } else throw new Error('Unknown WebSocket event.')
      } catch (error) {
        fail(error instanceof Error ? error : new Error('Could not read the live search update.'))
      }
    }
    socket.onerror = () =>
      fail(
        signal.aborted
          ? new RunCancelledError()
          : new Error('WebSocket unavailable. Check the backend connection.')
      )
    socket.onclose = () => {
      if (!settled)
        fail(
          signal.aborted
            ? new RunCancelledError()
            : new Error(
                'Connection lost before completion was confirmed. Check saved runs before retrying.'
              )
        )
    }
  })
}
