import type { LiveRun } from '../types/run.ts'

export function createSearchPlayback(onFrame: (frame: LiveRun) => void, delay = 450) {
  const queue: { frame: LiveRun; resolve: () => void }[] = []
  const waiters: (() => void)[] = []
  let current: { frame: LiveRun; resolve: () => void } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let speed = 1
  let remaining = 0
  let startedAt = 0

  function settled() {
    for (const resolve of waiters.splice(0)) resolve()
  }

  function schedule() {
    startedAt = performance.now()
    timer = setTimeout(advance, delay === 0 ? 0 : Math.max(32, remaining / speed))
  }

  function advance() {
    timer = null
    current?.resolve()
    current = queue.shift() ?? null
    if (!current || disposed) {
      settled()
      return
    }
    onFrame(current.frame)
    remaining = delay === 0 ? 0 : current.frame.phase === 'iteration' ? delay + 150 : delay
    schedule()
  }

  return {
    push(frame: LiveRun): Promise<void> {
      if (disposed) return Promise.resolve()
      return new Promise((resolve) => {
        queue.push({ frame, resolve })
        if (current === null) advance()
      })
    },
    setSpeed(rate: number) {
      if (!Number.isFinite(rate) || rate < 0.25 || rate > 8)
        throw new Error('Playback speed must be between 0.25 and 8.')
      if (timer !== null) {
        remaining = Math.max(0, remaining - (performance.now() - startedAt) * speed)
        clearTimeout(timer)
      }
      speed = rate
      if (current && !disposed) schedule()
    },
    drain(): Promise<void> {
      if (disposed || (current === null && queue.length === 0)) return Promise.resolve()
      return new Promise((resolve) => waiters.push(resolve))
    },
    dispose() {
      disposed = true
      if (timer !== null) clearTimeout(timer)
      timer = null
      current?.resolve()
      current = null
      for (const pending of queue.splice(0)) pending.resolve()
      settled()
    },
  }
}
