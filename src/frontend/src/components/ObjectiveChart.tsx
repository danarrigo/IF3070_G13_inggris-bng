import type { ObjectivePoint } from '../types/run'

function ObjectiveChart({ history }: { history: ObjectivePoint[] }) {
  const width = 440
  const height = 150
  const left = 48
  const right = 12
  const top = 16
  const bottom = 30
  const low = Math.min(...history.map((point) => point.objective))
  const high = Math.max(...history.map((point) => point.objective))
  const padding = Math.max(1, (high - low) * 0.15)
  const min = Math.max(0, low - padding)
  const max = high + padding
  const lastIteration = Math.max(1, history.at(-1)?.iteration ?? 1)
  const x = (iteration: number) => left + (iteration / lastIteration) * (width - left - right)
  const y = (objective: number) => top + ((max - objective) / (max - min)) * (height - top - bottom)
  const points = history.map((point) => `${x(point.iteration)},${y(point.objective)}`).join(' ')

  return (
    <figure className="objective-chart">
      <figcaption>
        Objective by iteration <span>Million IDR</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Objective by iteration, from ${low} to ${high} million IDR`}
      >
        {[min, (min + max) / 2, max].map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="#e2e8dc" />
            <text x={left - 8} y={y(tick) + 4} textAnchor="end" fill="#718066" fontSize="11">
              {Number(tick.toFixed(1)).toLocaleString()}
            </text>
          </g>
        ))}
        <polyline
          points={points}
          fill="none"
          stroke="#3e6a4b"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {history.map((point, index) => (
          <circle
            key={`${point.iteration}-${index}`}
            cx={x(point.iteration)}
            cy={y(point.objective)}
            r={2.5}
            fill="#3e6a4b"
          >
            <title>
              Iteration {point.iteration}: {point.objective}
            </title>
          </circle>
        ))}
        <text x={left} y={height - 8} fill="#718066" fontSize="11">
          0
        </text>
        <text x={width - right} y={height - 8} textAnchor="end" fill="#718066" fontSize="11">
          {lastIteration}
        </text>
        <text
          x={(left + width - right) / 2}
          y={height - 8}
          textAnchor="middle"
          fill="#718066"
          fontSize="11"
        >
          Iteration
        </text>
      </svg>
    </figure>
  )
}

export default ObjectiveChart
