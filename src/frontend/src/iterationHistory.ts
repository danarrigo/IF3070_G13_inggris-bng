import type { IterationChange, IterationComparison, VehiclePlacement } from './types/run.ts'

export function iterationChange(
  before: VehiclePlacement[],
  after: VehiclePlacement[],
  iteration: number,
  objective: number
): IterationChange {
  const previous = new Map(before.map((item) => [item.vehicle_id, item]))
  const current = new Set(after.map((item) => item.vehicle_id))
  return {
    iteration,
    objective,
    updated: after.filter((item) => {
      const old = previous.get(item.vehicle_id)
      return (
        !old ||
        item.x !== old.x ||
        item.y !== old.y ||
        item.length !== old.length ||
        item.width !== old.width
      )
    }),
    removed_vehicle_ids: before
      .filter((item) => !current.has(item.vehicle_id))
      .map((item) => item.vehicle_id),
  }
}

export function compareIteration(
  initial: VehiclePlacement[],
  initialObjective: number,
  changes: IterationChange[],
  iteration: number | null
): IterationComparison | null {
  const target = iteration ?? changes.at(-1)?.iteration
  if (target === undefined) return null
  const state = new Map(initial.map((item) => [item.vehicle_id, item]))
  let objective = initialObjective
  for (const change of changes) {
    const before =
      change.kind !== 'restart' && change.iteration === target ? [...state.values()] : null
    for (const id of change.removed_vehicle_ids) state.delete(id)
    for (const item of change.updated) state.set(item.vehicle_id, item)
    if (before)
      return {
        state_changed: change.updated.length > 0 || change.removed_vehicle_ids.length > 0,
        iteration: change.iteration,
        before,
        after: [...state.values()],
        before_objective: objective,
        after_objective: change.objective,
      }
    objective = change.objective
  }
  return null
}
