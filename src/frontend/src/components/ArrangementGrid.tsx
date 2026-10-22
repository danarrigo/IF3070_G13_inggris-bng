import type { Config } from '../types/config'

export default function ArrangementGrid({
  config,
  label = 'Ship grid',
}: {
  config: Config
  label?: string
}) {
  const { ship, vehicles } = config
  const placed = vehicles.filter((vehicle) => vehicle.x !== null && vehicle.y !== null)
  if (!(ship.width > 0 && ship.length > 0))
    return <p className="error">Enter positive ship dimensions to show the grid.</p>
  return (
    <div
      className="ship-grid"
      role="img"
      aria-label={`${label}, ${ship.width} wide by ${ship.length} long, ${placed.length} placed vehicles`}
      style={{
        width: `min(100%, 320px, ${(460 * ship.width) / ship.length}px)`,
        aspectRatio: `${ship.width} / ${ship.length}`,
        backgroundSize: `${100 / ship.width}% ${100 / ship.length}%`,
      }}
    >
      {vehicles.map(
        (vehicle, index) =>
          vehicle.x !== null &&
          vehicle.y !== null && (
            <div
              key={vehicle.id}
              className="grid-vehicle"
              title={`Vehicle ${index + 1}: (${vehicle.x}, ${vehicle.y}), ${vehicle.width} × ${vehicle.length}`}
              style={{
                left: `${(vehicle.x / ship.width) * 100}%`,
                top: `${(vehicle.y / ship.length) * 100}%`,
                width: `${(vehicle.width / ship.width) * 100}%`,
                height: `${(vehicle.length / ship.length) * 100}%`,
                background: `hsl(${index * 67 + 165} 45% 35%)`,
              }}
            >
              V{index + 1}
            </div>
          )
      )}
      {placed.length === 0 && <span className="grid-placeholder">No placed vehicles</span>}
    </div>
  )
}
