// Thin typed accessor for the preload bridge. Importing from here keeps the
// `window.api` reference in one place so screens stay clean.
import type { StorePosApi } from '../../shared/types'

export const api: StorePosApi = window.api

// Currency formatting is driven by the store's configured currency, set once at
// app start (and after onboarding) via setCurrency. Defaults keep pre-onboarding
// amounts sensible.
let currencyConfig = { symbol: 'Rs', locale: 'en-PK' }

export function setCurrency(symbol: string | null, locale: string | null): void {
  currencyConfig = {
    symbol: symbol || 'Rs',
    locale: locale || 'en-PK'
  }
}

export const currencySymbol = (): string => currencyConfig.symbol

export const money = (n: number): string =>
  currencyConfig.symbol +
  ' ' +
  n.toLocaleString(currencyConfig.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
