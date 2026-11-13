import { ipcMain } from 'electron'
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
  CloseShiftPayload
} from '../shared/types'
import {
  listProducts,
  findProductByBarcode,
  upsertProduct,
  bulkUpsertProducts,
  deleteProduct,
  listCategories,
  upsertCategory,
  deleteCategory,
  listTaxRates,
  upsertTaxRate,
  deleteTaxRate,
  updateTaxSettings,
  listSuppliers,
  upsertSupplier,
  deleteSupplier,
  createPurchase,
  recentPurchases,
  listCustomers,
  upsertCustomer,
  deleteCustomer,
  recordCustomerPayment,
  getCustomerLedger,
  createSale,
  recentSales,
  getSaleForRefund,
  createRefund,
  dailyReport,
  monthlyReport,
  rangeReport,
  getSettings,
  saveOnboarding,
  updateStoreProfile,
  updateReceiptSettings,
  checkPin,
  setPin,
  listUsers,
  saveUser,
  deleteUser,
  verifyUserPin,
  getCurrentShift,
  openShift,
  closeShift,
  setSessionUser,
  currentCan,
  getRoles,
  saveRoles,
  elevate
} from './db'
import type { Permission, RoleDef } from '../shared/types'
import { printReceiptSilent } from './print'

// Backend authorization: throw if the signed-in user lacks a permission. The
// error surfaces to the renderer as a rejected IPC call.
function requirePerm(perm: Permission): void {
  if (!currentCan(perm)) throw new Error('FORBIDDEN:' + perm)
}

export function registerIpc(): void {
  ipcMain.handle('products:list', () => listProducts())
  ipcMain.handle('products:findByBarcode', (_e, barcode: string) => findProductByBarcode(barcode))
  ipcMain.handle('products:upsert', (_e, p: ProductInput) => {
    requirePerm('products')
    return upsertProduct(p)
  })
  ipcMain.handle('products:bulkUpsert', (_e, rows: ProductInput[]) => {
    requirePerm('products')
    return bulkUpsertProducts(rows)
  })
  ipcMain.handle('products:delete', (_e, id: string) => {
    requirePerm('products')
    return deleteProduct(id)
  })
  ipcMain.handle('categories:list', () => listCategories())
  ipcMain.handle('categories:upsert', (_e, c: CategoryInput) => {
    requirePerm('products')
    return upsertCategory(c)
  })
  ipcMain.handle('categories:delete', (_e, id: string) => {
    requirePerm('products')
    return deleteCategory(id)
  })
  ipcMain.handle('taxRates:list', () => listTaxRates())
  ipcMain.handle('taxRates:upsert', (_e, t: TaxRateInput) => {
    requirePerm('settings')
    return upsertTaxRate(t)
  })
  ipcMain.handle('taxRates:delete', (_e, id: string) => {
    requirePerm('settings')
    return deleteTaxRate(id)
  })
  ipcMain.handle('settings:updateTaxSettings', (_e, p: { taxInclusive: boolean }) => {
    requirePerm('settings')
    return updateTaxSettings(p)
  })
  ipcMain.handle('suppliers:list', () => listSuppliers())
  ipcMain.handle('suppliers:upsert', (_e, s: SupplierInput) => {
    requirePerm('purchases')
    return upsertSupplier(s)
  })
  ipcMain.handle('suppliers:delete', (_e, id: string) => {
    requirePerm('purchases')
    return deleteSupplier(id)
  })
  ipcMain.handle('purchases:create', (_e, p: PurchasePayload) => {
    requirePerm('purchases')
    return createPurchase(p)
  })
  ipcMain.handle('purchases:recent', (_e, limit?: number) => recentPurchases(limit))
  ipcMain.handle('customers:list', () => listCustomers())
  ipcMain.handle('customers:upsert', (_e, c: CustomerInput) => upsertCustomer(c))
  ipcMain.handle('customers:delete', (_e, id: string) => deleteCustomer(id))
  ipcMain.handle('customers:recordPayment', (_e, customerId: string, amount: number) =>
    recordCustomerPayment(customerId, amount)
  )
  ipcMain.handle('customers:ledger', (_e, customerId: string, limit?: number) =>
    getCustomerLedger(customerId, limit)
  )
  ipcMain.handle('sales:create', (_e, payload: SalePayload) => createSale(payload))
  ipcMain.handle('sales:recent', (_e, limit?: number) => recentSales(limit))
  ipcMain.handle('sales:getForRefund', (_e, id: string) => getSaleForRefund(id))
  ipcMain.handle('sales:refund', (_e, payload: RefundPayload) => createRefund(payload))
  ipcMain.handle('reports:daily', () => {
    requirePerm('reports')
    return dailyReport()
  })
  ipcMain.handle('reports:monthly', (_e, month: string) => {
    requirePerm('reports')
    return monthlyReport(month)
  })
  ipcMain.handle('reports:range', (_e, startIso: string, endIso: string) => {
    requirePerm('reports')
    return rangeReport(startIso, endIso)
  })
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:saveOnboarding', (_e, p: OnboardingPayload) => saveOnboarding(p))
  ipcMain.handle('settings:updateStoreProfile', (_e, p: StoreProfileInput) => {
    requirePerm('settings')
    return updateStoreProfile(p)
  })
  ipcMain.handle('settings:updateReceiptSettings', (_e, p: ReceiptSettingsInput) => {
    requirePerm('settings')
    return updateReceiptSettings(p)
  })
  ipcMain.handle('settings:getRoles', () => getRoles())
  ipcMain.handle('settings:saveRoles', (_e, roles: RoleDef[]) => {
    requirePerm('settings')
    return saveRoles(roles)
  })
  ipcMain.handle('session:setUser', (_e, userId: string | null) => setSessionUser(userId))
  ipcMain.handle('auth:checkPin', (_e, pin: string) => checkPin(pin))
  ipcMain.handle('auth:setPin', (_e, pin: string) => setPin(pin))
  ipcMain.handle('auth:elevate', (_e, permission: Permission, pin: string) =>
    elevate(permission, pin)
  )
  ipcMain.handle('users:list', () => listUsers())
  ipcMain.handle('users:save', (_e, u: UserInput) => {
    requirePerm('settings')
    return saveUser(u)
  })
  ipcMain.handle('users:delete', (_e, id: string) => {
    requirePerm('settings')
    return deleteUser(id)
  })
  ipcMain.handle('users:verifyPin', (_e, userId: string, pin: string) => verifyUserPin(userId, pin))
  ipcMain.handle('shifts:current', () => getCurrentShift())
  ipcMain.handle('shifts:open', (_e, p: OpenShiftPayload) => openShift(p))
  ipcMain.handle('shifts:close', (_e, p: CloseShiftPayload) => closeShift(p))
  ipcMain.handle('receipt:print', (_e, html: string) => printReceiptSilent(html))
}
