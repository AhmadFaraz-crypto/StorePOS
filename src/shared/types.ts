// Shared types used by the main process, preload bridge, and renderer.
// Keeping them in one place means the IPC contract stays in sync across layers.

export interface Product {
  id: string
  store_id: string
  name: string
  barcode: string | null
  price: number
  cost: number
  tax_rate: number // stored as a fraction, e.g. 0.05 for 5%
  tax_rate_id: string | null
  stock_qty: number
  category_id: string | null
  updated_at: string
  deleted_at: string | null
}

export interface ProductInput {
  id?: string
  name: string
  barcode: string | null
  price: number
  cost: number
  tax_rate: number
  tax_rate_id?: string | null
  stock_qty: number
  category_id?: string | null
}

export interface TaxRate {
  id: string
  store_id: string
  name: string
  rate: number // fraction
  updated_at: string
  deleted_at: string | null
}

export interface TaxRateInput {
  id?: string
  name: string
  rate: number
}

export interface Category {
  id: string
  store_id: string
  name: string
  sort_order: number
  updated_at: string
  deleted_at: string | null
}

export interface CategoryInput {
  id?: string
  name: string
}

export interface Supplier {
  id: string
  store_id: string
  name: string
  phone: string | null
  outstanding: number // total owed across unpaid purchases
  updated_at: string
  deleted_at: string | null
}

export interface SupplierInput {
  id?: string
  name: string
  phone: string | null
}

export interface PurchaseItemInput {
  product_id: string
  qty: number
  unit_cost: number
}

export interface PurchasePayload {
  supplier_id: string | null
  paid: number
  items: PurchaseItemInput[]
}

export interface PurchaseRow {
  id: string
  supplier_id: string | null
  supplier_name: string | null
  total: number
  paid: number
  item_count: number
  created_at: string
}

export interface Customer {
  id: string
  store_id: string
  name: string
  phone: string | null
  balance: number // amount the customer still owes
  updated_at: string
  deleted_at: string | null
}

export interface CustomerInput {
  id?: string
  name: string
  phone: string | null
}

export interface CustomerLedgerEntry {
  id: string
  type: 'sale' | 'payment'
  amount: number // sale = debt added; payment = amount paid
  detail: string | null // for sale entries: "Coca-Cola ×2, Bread ×1"
  created_at: string
}

export interface SaleItemInput {
  product_id: string
  qty: number
  unit_price: number
  tax_rate: number
  discount?: number // absolute amount off this line (pre-tax)
}

export type PaymentMethod = 'cash' | 'card' | 'credit'

export interface SalePayload {
  items: SaleItemInput[]
  payment_method: PaymentMethod
  tendered: number
  discount?: number // whole-cart discount, absolute amount
  customer_id?: string | null
  paid?: number // amount collected now (credit sales may be partial)
  cashier_id?: string | null
  discountApprovalPin?: string // manager PIN authorizing a discount, when the cashier lacks the right
}

export interface Shift {
  id: string
  user_id: string | null
  opening_float: number
  opened_at: string
  status: string
}

export interface ShiftReport {
  shiftId: string
  openingFloat: number
  cashExpected: number
  countedCash: number
  overShort: number // counted - expected (negative = short)
  salesCount: number
  total: number
  byMethod: DailyReportRow[]
  openedAt: string
  closedAt: string
  openedByName: string
  closedByName: string
}

export interface OpenShiftPayload {
  userId: string | null
  openingFloat: number
}

export interface CloseShiftPayload {
  shiftId: string
  countedCash: number
  userId: string | null
}

export type { UserRole, Permission, RoleDef } from './permissions'
import type { UserRole, Permission, RoleDef } from './permissions'

export interface User {
  id: string
  name: string
  role: UserRole
  hasPin: boolean
}

export interface UserInput {
  id?: string
  name: string
  role: UserRole
  pin?: string // required on create; optional on edit (keeps existing if blank)
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  name: string
  qty: number
  unit_price: number
  cost: number
  discount: number
  line_total: number
}

export interface Sale {
  id: string
  store_id: string
  subtotal: number
  discount: number
  tax: number
  total: number
  payment_method: PaymentMethod
  tendered: number
  change_due: number
  created_at: string
  updated_at: string
  kind?: string // 'sale' | 'refund'
  refund_of?: string | null
  customer_id?: string | null
  paid?: number
  items: SaleItem[]
}

export interface RecentSale {
  id: string
  total: number
  created_at: string
  item_count: number
}

export interface SaleItemRefundable extends SaleItem {
  refundable: number
}

export interface RefundLineInput {
  saleItemId: string
  qty: number
}

export interface RefundPayload {
  saleId: string
  lines: RefundLineInput[]
  approvalPin?: string // manager PIN authorizing the refund, when the cashier lacks the right
}

export interface DailyReportRow {
  payment_method: PaymentMethod
  count: number
  total: number
}

export interface DailyReport {
  date: string
  count: number
  total: number
  byMethod: DailyReportRow[]
}

export interface TopProduct {
  name: string
  qty: number
  revenue: number
  profit: number
}

export interface MonthlyDailyRow {
  date: string
  revenue: number
  profit: number
}

export interface CategoryReportRow {
  name: string | null // null = uncategorized
  revenue: number
  profit: number
}

export interface CashierReportRow {
  name: string | null // null = unassigned
  count: number
  total: number
}

export interface RangeReport {
  salesCount: number
  itemsSold: number
  grossSales: number
  netSales: number
  taxCollected: number
  cogs: number
  grossProfit: number
  margin: number
  byMethod: DailyReportRow[]
  topProducts: TopProduct[]
  daily: MonthlyDailyRow[]
  byCategory: CategoryReportRow[]
  byCashier: CashierReportRow[]
  receivableFromCustomers: number
  payableToSuppliers: number
}

export interface MonthlyReport {
  month: string // 'YYYY-MM'
  label: string // e.g. 'November 2026'
  salesCount: number
  itemsSold: number
  grossSales: number // revenue including tax
  netSales: number // revenue excluding tax
  taxCollected: number
  cogs: number // cost of goods sold
  grossProfit: number // netSales - cogs
  margin: number // grossProfit / netSales (fraction)
  byMethod: DailyReportRow[]
  topProducts: TopProduct[]
  daily: MonthlyDailyRow[]
}

export interface ScannerInfo {
  url: string
  port: number
  token: string
  qrDataUrl: string
}

export interface SettingsInfo {
  storeName: string
  address: string
  phone: string
  currencyCode: string
  currencySymbol: string | null
  currencyLocale: string | null
  onboarded: boolean
  hasPin: boolean
  ownerName: string
  receiptHeader: string
  receiptFooter: string
  autoPrint: boolean
  taxInclusive: boolean
  logo: string | null // store logo as a data-URL (PNG), or null
}

export interface StoreProfileInput {
  storeName: string
  address: string
  phone: string
  currencyCode: string
  currencySymbol: string
  currencyLocale: string
  logo: string | null
}

export interface ReceiptSettingsInput {
  header: string
  footer: string
  autoPrint: boolean
}

export interface OnboardingPayload {
  storeName: string
  currencyCode: string
  currencySymbol: string
  currencyLocale: string
  ownerName: string
  pin: string
}

export interface StorePosApi {
  products: {
    list(): Promise<Product[]>
    findByBarcode(barcode: string): Promise<Product | undefined>
    upsert(p: ProductInput): Promise<Product>
    bulkUpsert(rows: ProductInput[]): Promise<{ added: number; updated: number }>
    delete(id: string): Promise<void>
  }
  categories: {
    list(): Promise<Category[]>
    upsert(c: CategoryInput): Promise<Category>
    delete(id: string): Promise<void>
  }
  taxRates: {
    list(): Promise<TaxRate[]>
    upsert(t: TaxRateInput): Promise<TaxRate>
    delete(id: string): Promise<void>
  }
  suppliers: {
    list(): Promise<Supplier[]>
    upsert(s: SupplierInput): Promise<Supplier>
    delete(id: string): Promise<void>
  }
  purchases: {
    create(payload: PurchasePayload): Promise<PurchaseRow>
    recent(limit?: number): Promise<PurchaseRow[]>
  }
  customers: {
    list(): Promise<Customer[]>
    upsert(c: CustomerInput): Promise<Customer>
    delete(id: string): Promise<void>
    recordPayment(customerId: string, amount: number): Promise<void>
    ledger(customerId: string, limit?: number): Promise<CustomerLedgerEntry[]>
  }
  sales: {
    create(payload: SalePayload): Promise<Sale>
    recent(limit?: number): Promise<RecentSale[]>
    getForRefund(id: string): Promise<{ sale: Sale; items: SaleItemRefundable[] } | null>
    refund(payload: RefundPayload): Promise<Sale>
  }
  reports: {
    daily(): Promise<DailyReport>
    monthly(month: string): Promise<MonthlyReport>
    range(startIso: string, endIso: string): Promise<RangeReport>
  }
  scanner: {
    info(): Promise<ScannerInfo | null>
    onScan(cb: (code: string) => void): () => void
    onStatus(cb: (connected: boolean) => void): () => void
  }
  settings: {
    get(): Promise<SettingsInfo>
    saveOnboarding(payload: OnboardingPayload): Promise<void>
    updateStoreProfile(payload: StoreProfileInput): Promise<void>
    updateReceiptSettings(payload: ReceiptSettingsInput): Promise<void>
    updateTaxSettings(payload: { taxInclusive: boolean }): Promise<void>
    getRoles(): Promise<RoleDef[]>
    saveRoles(roles: RoleDef[]): Promise<void>
  }
  session: {
    setUser(userId: string | null): Promise<void>
  }
  auth: {
    checkPin(pin: string): Promise<boolean>
    setPin(pin: string): Promise<void>
    elevate(permission: Permission, pin: string): Promise<{ ok: boolean; name: string | null }>
  }
  users: {
    list(): Promise<User[]>
    save(u: UserInput): Promise<User>
    delete(id: string): Promise<void>
    verifyPin(userId: string, pin: string): Promise<boolean>
  }
  shifts: {
    current(): Promise<Shift | null>
    open(payload: OpenShiftPayload): Promise<Shift>
    close(payload: CloseShiftPayload): Promise<ShiftReport>
  }
  receipt: {
    print(html: string): Promise<boolean>
  }
}
