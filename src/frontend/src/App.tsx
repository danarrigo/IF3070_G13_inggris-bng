import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [status, setStatus] = useState('Checking connection...')

  useEffect(() => {
    const controller = new AbortController()

    async function checkHealth() {
      try {
        const response = await fetch('/api/health', {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Health check failed')
        const data: unknown = await response.json()
        if (
          typeof data !== 'object' ||
          data === null ||
          !('status' in data) ||
          data.status !== 'ok'
        ) {
          throw new Error('Unexpected health response')
        }
        setStatus('Backend connected')
      } catch {
        if (!controller.signal.aborted) {
          setStatus('Backend unavailable. Start the FastAPI server and refresh.')
        }
      }
    }

    void checkHealth()
    return () => controller.abort()
  }, [])

  return (
    <main>
      <p className="eyebrow">DAI PROJECT</p>
      <h1>FastAPI + React</h1>
      <p>Your React + TypeScript frontend is running with Vite.</p>
      <p className="status" role="status">{status}</p>
      <a href="http://127.0.0.1:8000/docs">Open API documentation</a>
    </main>
  )
}

export default App
