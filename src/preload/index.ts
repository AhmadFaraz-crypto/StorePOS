import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  ProductInput,
  SalePayload,
  OnboardingPayload,
  StoreProfileInput,
  ReceiptSettingsInput,
  CategoryInput,
  RefundPayload,
  TaxRateInput,
  SupplierInput,
  PurchasePayload,
  CustomerInput,
  UserInput,
  OpenShiftPayload,
  CloseShiftPayload,
  StorePosApi
} from '../shared/types'

const api: StorePosApi = {
  products: {
    list: () => ipcRenderer.invoke('products:list'),
    findByBarcode: (barcode: string) => ipcRenderer.invoke('products:findByBarcode', barcode),
    upsert: (p: ProductInput) => ipcRenderer.invoke('products:upsert', p),
    bulkUpsert: (rows: ProductInput[]) => ipcRenderer.invoke('products:bulkUpsert', rows),
    delete: (id: string) => ipcRenderer.invoke('products:delete', id)
  },
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    upsert: (c: CategoryInput) => ipcRenderer.invoke('categories:upsert', c),
    delete: (id: string) => ipcRenderer.invoke('categories:delete', id)
  },
  taxRates: {
    list: () => ipcRenderer.invoke('taxRates:list'),
    upsert: (tr: TaxRateInput) => ipcRenderer.invoke('taxRates:upsert', tr),
    delete: (id: string) => ipcRenderer.invoke('taxRates:delete', id)
  },
  suppliers: {
    list: () => ipcRenderer.invoke('suppliers:list'),
    upsert: (s: SupplierInput) => ipcRenderer.invoke('suppliers:upsert', s),
    delete: (id: string) => ipcRenderer.invoke('suppliers:delete', id)
  },
  purchases: {
    create: (payload: PurchasePayload) => ipcRenderer.invoke('purchases:create', payload),
    recent: (limit?: number) => ipcRenderer.invoke('purchases:recent', limit)
  },
  customers: {
    list: () => ipcRenderer.invoke('customers:list'),
    upsert: (c: CustomerInput) => ipcRenderer.invoke('customers:upsert', c),
    delete: (id: string) => ipcRenderer.invoke('customers:delete', id),
    recordPayment: (customerId: string, amount: number) =>
      ipcRenderer.invoke('customers:recordPayment', customerId, amount),
    ledger: (customerId: string, limit?: number) =>
      ipcRenderer.invoke('customers:ledger', customerId, limit)
  },
  sales: {
    create: (payload: SalePayload) => ipcRenderer.invoke('sales:create', payload),
    recent: (limit?: number) => ipcRenderer.invoke('sales:recent', limit),
    getForRefund: (id: string) => ipcRenderer.invoke('sales:getForRefund', id),
    refund: (payload: RefundPayload) => ipcRenderer.invoke('sales:refund', payload)
  },
  reports: {
    daily: () => ipcRenderer.invoke('reports:daily'),
    monthly: (month: string) => ipcRenderer.invoke('reports:monthly', month),
    range: (startIso: string, endIso: string) =>
      ipcRenderer.invoke('reports:range', startIso, endIso)
  },
  scanner: {
    info: () => ipcRenderer.invoke('scanner:info'),
    onScan: (cb: (code: string) => void) => {
      const handler = (_e: IpcRendererEvent, code: string): void => cb(code)
      ipcRenderer.on('scanner:scan', handler)
      return () => ipcRenderer.removeListener('scanner:scan', handler)
    },
    onStatus: (cb: (connected: boolean) => void) => {
      const handler = (_e: IpcRendererEvent, connected: boolean): void => cb(connected)
      ipcRenderer.on('scanner:status', handler)
      return () => ipcRenderer.removeListener('scanner:status', handler)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    saveOnboarding: (payload: OnboardingPayload) =>
      ipcRenderer.invoke('settings:saveOnboarding', payload),
    updateStoreProfile: (payload: StoreProfileInput) =>
      ipcRenderer.invoke('settings:updateStoreProfile', payload),
    updateReceiptSettings: (payload: ReceiptSettingsInput) =>
      ipcRenderer.invoke('settings:updateReceiptSettings', payload),
    updateTaxSettings: (payload: { taxInclusive: boolean }) =>
      ipcRenderer.invoke('settings:updateTaxSettings', payload),
    getRoles: () => ipcRenderer.invoke('settings:getRoles'),
    saveRoles: (roles) => ipcRenderer.invoke('settings:saveRoles', roles)
  },
  session: {
    setUser: (userId: string | null) => ipcRenderer.invoke('session:setUser', userId)
  },
  auth: {
    checkPin: (pin: string) => ipcRenderer.invoke('auth:checkPin', pin),
    setPin: (pin: string) => ipcRenderer.invoke('auth:setPin', pin),
    elevate: (permission, pin: string) => ipcRenderer.invoke('auth:elevate', permission, pin)
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    save: (u: UserInput) => ipcRenderer.invoke('users:save', u),
    delete: (id: string) => ipcRenderer.invoke('users:delete', id),
    verifyPin: (userId: string, pin: string) => ipcRenderer.invoke('users:verifyPin', userId, pin)
  },
  shifts: {
    current: () => ipcRenderer.invoke('shifts:current'),
    open: (payload: OpenShiftPayload) => ipcRenderer.invoke('shifts:open', payload),
    close: (payload: CloseShiftPayload) => ipcRenderer.invoke('shifts:close', payload)
  },
  receipt: {
    print: (html: string) => ipcRenderer.invoke('receipt:print', html)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // Fallback when contextIsolation is disabled (should not happen here).
  // @ts-ignore — define on window directly
  window.api = api
}
