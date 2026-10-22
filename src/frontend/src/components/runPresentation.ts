import { iterationChange } from '../iterationHistory.ts'
import type { Config } from '../types/config.ts'
import type { SteepestAscentRun, VehiclePlacement } from '../types/run.ts'

export function sameConfig(first: Config, second: Config): boolean {
  return (
    first.preserve_positions === second.preserve_positions &&
    first.ship.length === second.ship.length &&
    first.ship.width === second.ship.width &&
    first.ship.max_weight === second.ship.max_weight &&
    first.vehicles.length === second.vehicles.length &&
    first.vehicles.every((vehicle, index) =>
      (['id', 'x', 'y', 'length', 'width', 'weight', 'eta', 'shipping_fee'] as const).every(
        (key) => vehicle[key] === second.vehicles[index][key]
      )
    )
  )
}

export function describeNeighbor(
  config: Config,
  before: VehiclePlacement[],
  after: VehiclePlacement[]
): string {
  const change = iterationChange(before, after, 0, 0)
  const previous = new Map(before.map((item) => [item.vehicle_id, item]))
  const added = change.updated.some((item) => !previous.has(item.vehicle_id))
  const removed = change.removed_vehicle_ids.length > 0
  const rotated = change.updated.some((item) => {
    const old = previous.get(item.vehicle_id)
    return old && (old.length !== item.length || old.width !== item.width)
  })
  const action =
    added && removed
      ? 'Swap'
      : added
        ? 'Load'
        : removed
          ? 'Unload'
          : change.updated.length > 1
            ? 'Swap'
            : rotated
              ? 'Rotate'
              : change.updated.length
                ? 'Move'
                : 'Unchanged'
  const ids = new Set([
    ...change.removed_vehicle_ids,
    ...change.updated.map((item) => item.vehicle_id),
  ])
  const labels = config.vehicles.flatMap((vehicle, index) =>
    ids.has(vehicle.id) ? [`V${index + 1}`] : []
  )
  return `${action} ${labels.join(' + ')}`.trim()
}

export function configForRunView(run: SteepestAscentRun, stage: 'initial' | 'final'): Config {
  const placements =
    stage === 'initial' ? run.result.initial_arrangement : run.result.final_arrangement
  return configForPlacements(run.config, placements)
}

export function configForPlacements(config: Config, placements: VehiclePlacement[]): Config {
  const byId = new Map(placements.map((placement) => [placement.vehicle_id, placement]))
  return {
    ...config,
    ship: { ...config.ship },
    preserve_positions: true,
    vehicles: config.vehicles.map((vehicle) => {
      const placement = byId.get(vehicle.id)
      return placement
        ? {
            ...vehicle,
            x: placement.x,
            y: placement.y,
            length: placement.length,
            width: placement.width,
          }
        : { ...vehicle, x: null, y: null }
    }),
  }
}
