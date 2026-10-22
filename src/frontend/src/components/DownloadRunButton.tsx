import type { SteepestAscentRun } from '../types/run'

export default function DownloadRunButton({ run }: { run: SteepestAscentRun }) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${run.settings.variant.replaceAll('_', '-')}-${run.id}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return (
    <button type="button" onClick={download}>
      Download JSON
    </button>
  )
}
