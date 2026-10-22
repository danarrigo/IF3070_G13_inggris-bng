import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cancelJob, deleteRun } from '../src/api/genetic.ts'

test('Stop posts to the job cancellation endpoint', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/jobs/example/cancel')
    assert.equal(init.method, 'POST')
    return new Response(JSON.stringify({ stage: 'cancelling' }), { status: 202 })
  })
  assert.equal((await cancelJob('example')).stage, 'cancelling')
})

test('Delete uses the existing endpoint and accepts empty 204 responses', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/runs/example')
    assert.equal(init.method, 'DELETE')
    return new Response(null, { status: 204 })
  })
  await deleteRun('example')
})

test('Already deleted runs are removed locally while real failures are surfaced', async (context) => {
  const fetch = context.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 404 })
  )
  await deleteRun('gone')
  fetch.mock.mockImplementation(
    async () => new Response(JSON.stringify({ detail: 'Database unavailable' }), { status: 500 })
  )
  await assert.rejects(deleteRun('example'), /Database unavailable/)
})
