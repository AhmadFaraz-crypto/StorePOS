import type { StorePosApi } from '../shared/types'

declare global {
  interface Window {
    api: StorePosApi
  }
}

export {}
