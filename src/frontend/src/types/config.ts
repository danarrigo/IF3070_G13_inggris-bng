export interface Ship {
  length: number
  width: number
  max_weight: number
}

export interface Vehicle {
  id: string
  x: number | null
  y: number | null
  length: number
  width: number
  weight: number
  eta: number
  shipping_fee: number
}

export interface Config {
  ship: Ship
  vehicles: Vehicle[]
  preserve_positions: boolean
}
