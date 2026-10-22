import type { Config } from './types/config.ts'
import type { VehiclePlacement } from './types/run.ts'

export function objectiveUnit(config: Config): string {
  return config.objective_mode === 'eta_priority' ? 'ETA priority points' : 'million IDR'
}

export function objectiveLabel(config: Config): string {
  return config.objective_mode === 'eta_priority' ? 'ETA priority' : 'Shipping fee'
}

export function placementObjective(config: Config, placements: VehiclePlacement[]): number {
  const loaded = new Set(placements.map((item) => item.vehicle_id))
  const maximumEta = Math.max(0, ...config.vehicles.map((vehicle) => vehicle.eta))
  return config.vehicles.reduce(
    (total, vehicle) =>
      total +
      (!loaded.has(vehicle.id)
        ? 0
        : config.objective_mode === 'eta_priority'
          ? maximumEta + 1 - vehicle.eta
          : vehicle.shipping_fee),
    0
  )
}
