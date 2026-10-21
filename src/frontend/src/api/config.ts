import type { Config, Ship, Vehicle } from '../types/config'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function integer(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum
}

function isShip(value: unknown): value is Ship {
  return isRecord(value) && integer(value.length, 1) && integer(value.width, 1)
    && integer(value.max_weight, 1)
}

function isVehicle(value: unknown): value is Vehicle {
  return isRecord(value) && typeof value.id === 'string'
    && (value.x === null || integer(value.x, 0))
    && (value.y === null || integer(value.y, 0))
    && integer(value.length, 1) && integer(value.width, 1)
    && integer(value.weight, 1) && integer(value.eta, 0)
    && integer(value.shipping_fee, 0)
}

async function readConfig(response: Response): Promise<Config> {
  if (!response.ok) {
    if (response.status === 409) throw new Error('A config was created elsewhere. Load it before saving again.')
    throw new Error(`Config request failed (${response.status}). Check that FastAPI and MongoDB are running.`)
  }
  const data: unknown = await response.json()
  if (!isRecord(data) || !isShip(data.ship) || !Array.isArray(data.vehicles)
    || !data.vehicles.every(isVehicle)
    || (data.preserve_positions !== undefined && typeof data.preserve_positions !== 'boolean')) {
    throw new Error('The API returned an unexpected config format.')
  }
  return { ship: data.ship, vehicles: data.vehicles,
    preserve_positions: data.preserve_positions === true }
}

export async function loadConfig(): Promise<Config | null> {
  const response = await fetch('/api/config')
  if (response.status === 404) return null
  return readConfig(response)
}

export async function saveConfig(config: Config): Promise<Config> {
  const existing = await fetch('/api/config')
  if (!existing.ok && existing.status !== 404) {
    throw new Error('Could not check the saved config. Check the backend connection.')
  }
  return readConfig(await fetch('/api/config', {
    method: existing.status === 404 ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }))
}
