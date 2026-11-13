import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import type { ScannerInfo } from '../../shared/types'

export type ScanHandler = (code: string) => void

export interface ScannerContextValue {
  phoneConnected: boolean
  scannerInfo: ScannerInfo | null
  openPairing: () => void
  // The active screen registers the function that should receive scans.
  setScanHandler: (fn: ScanHandler | null) => void
  // Jump to the Products tab to add a product with this barcode pre-filled.
  requestAddProduct: (barcode: string) => void
  pendingBarcode: string | null
  consumePendingBarcode: () => void
  // Jump to the Sale tab to start a credit sale for this customer.
  startCreditSale: (customerId: string) => void
  pendingCreditCustomer: string | null
  consumePendingCreditCustomer: () => void
}

const ScannerContext = createContext<ScannerContextValue | null>(null)

export function ScannerProvider({
  value,
  children
}: {
  value: ScannerContextValue
  children: ReactNode
}): JSX.Element {
  return <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>
}

export function useScanner(): ScannerContextValue {
  const ctx = useContext(ScannerContext)
  if (!ctx) throw new Error('useScanner must be used within a ScannerProvider')
  return ctx
}

// Register a scan handler for the lifetime of the calling component. The latest
// mounted screen wins, so switching tabs routes scans to the visible screen.
export function useScanHandler(fn: ScanHandler): void {
  const { setScanHandler } = useScanner()
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const handler: ScanHandler = (code) => ref.current(code)
    setScanHandler(handler)
    return () => setScanHandler(null)
  }, [setScanHandler])
}
