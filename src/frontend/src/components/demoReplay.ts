import type { DemoStep, DemoTrace } from '../types/run.ts'

export function rouletteSegments(fitness: number[]) {
  const total = fitness.reduce((sum, value) => sum + value, 0)
  let start = 0
  return fitness.map((score, index) => {
    const probability = total ? score / total : 1 / fitness.length
    const segment = { index, score, probability, start, end: start + probability }
    start = segment.end
    return segment
  })
}

export function sourcePopulation(trace: DemoTrace, step: DemoStep) {
  return trace.steps.find(item => item.kind === 'population' && item.generation === step.generation)?.individuals ?? []
}

export function pairParents(trace: DemoTrace, step: DemoStep) {
  return trace.steps.find(item => item.kind === 'crossover' && item.generation === step.generation
    && item.pair === step.pair && item.parents.length === 2)?.parents ?? []
}

export function geneParent(index: number, cut: number, child: number) {
  return index < cut ? child : 3 - child
}
