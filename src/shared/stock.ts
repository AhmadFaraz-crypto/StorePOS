// Low-stock classification, shared so the Sale and Products screens agree.
export const LOW_STOCK_THRESHOLD = 5

export type StockLevel = 'out' | 'low' | 'ok'

export function stockLevel(qty: number, threshold: number = LOW_STOCK_THRESHOLD): StockLevel {
  if (qty <= 0) return 'out'
  if (qty <= threshold) return 'low'
  return 'ok'
}
