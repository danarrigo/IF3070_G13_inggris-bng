import type { Config } from '../types/config.ts'
import type { Placement } from '../types/run.ts'

export function arrangementConfig(config: Config, placements: Placement[]): Config {
  const byId = new Map(placements.map(p => [p.vehicle_id, p]))
  return { ...config, preserve_positions: true, vehicles: config.vehicles.map(vehicle => {
    const placement = byId.get(vehicle.id)
    return placement ? { ...vehicle, x: placement.x, y: placement.y, length: placement.length, width: placement.width }
      : { ...vehicle, x: null, y: null }
  }) }
}

export function vehicleColor(id: string): string {
  let hash = 0
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return `hsl(${((hash % 360) + 360) % 360}, 45%, 35%)`
}
