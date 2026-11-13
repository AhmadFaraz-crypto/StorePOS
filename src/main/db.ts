import { app } from 'electron'
import { join } from 'path'
import { randomUUID, createHash } from 'crypto'
import Database from 'better-sqlite3'
import type {
  Product,
  ProductInput,
  Sale,
  SaleItem,
  SalePayload,
  DailyReport,
  DailyReportRow,
  SettingsInfo,
  OnboardingPayload
} from '../shared/types'
import { round2, calcTotals, calcRefund, lineEx, purchaseTotal } from '../shared/calc'
import {
  roleCan,
  normalizeRoles,
  DEFAULT_ROLES,
  type UserRole,
  type Permission,
  type RoleDef
} from '../shared/permissions'
import type {
  RecentSale,
  SaleItemRefundable,
  RefundPayload,
  TaxRate,
  TaxRateInput,
  Supplier,
  SupplierInput,
  PurchasePayload,
  PurchaseRow,
  Customer,
  CustomerInput,
  CustomerLedgerEntry,
  Shift,
  ShiftReport,
  OpenShiftPayload,
  CloseShiftPayload
} from '../shared/types'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) throw new Error('Database has not been initialized')
  return db
}

export function initDb(): void {
  const file = join(app.getPath('userData'), 'storepos.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate()
  seed()
}

function migrate(): void {
  // Every table carries id (UUID), store_id, updated_at and a soft-delete
  // column so the local schema can sync to a cloud backend later without a
  // painful migration (last-write-wins on updated_at, store_id = tenant).
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      address     TEXT,
      currency    TEXT NOT NULL DEFAULT 'USD',
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      store_id    TEXT NOT NULL REFERENCES stores(id),
      name        TEXT NOT NULL,
      pin         TEXT,
      role        TEXT NOT NULL DEFAULT 'cashier',
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id          TEXT PRIMARY KEY,
      store_id    TEXT NOT NULL REFERENCES stores(id),
      name        TEXT NOT NULL,
      barcode     TEXT,
      price       REAL NOT NULL DEFAULT 0,
      cost        REAL NOT NULL DEFAULT 0,
      tax_rate    REAL NOT NULL DEFAULT 0,
      stock_qty   REAL NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

    CREATE TABLE IF NOT EXISTS categories (
      id          TEXT PRIMARY KEY,
      store_id    TEXT NOT NULL REFERENCES stores(id),
      name        TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS tax_rates (
      id          TEXT PRIMARY KEY,
      store_id    TEXT NOT NULL REFERENCES stores(id),
      name        TEXT NOT NULL,
      rate        REAL NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id          TEXT PRIMARY KEY,
      store_id    TEXT NOT NULL REFERENCES stores(id),
      name        TEXT NOT NULL,
      phone       TEXT,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id          TEXT PRIMARY KEY,
      store_id    TEXT NOT NULL REFERENCES stores(id),
      name        TEXT NOT NULL,
      phone       TEXT,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id              TEXT PRIMARY KEY,
      store_id        TEXT NOT NULL REFERENCES stores(id),
      user_id         TEXT,
      opening_float   REAL NOT NULL DEFAULT 0,
      closing_counted REAL,
      closed_by       TEXT,
      status          TEXT NOT NULL DEFAULT 'open',
      opened_at       TEXT NOT NULL,
      closed_at       TEXT,
      updated_at      TEXT NOT NULL,
      deleted_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);

    CREATE TABLE IF NOT EXISTS customer_payments (
      id          TEXT PRIMARY KEY,
      store_id    TEXT NOT NULL REFERENCES stores(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      amount      REAL NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);

    CREATE TABLE IF NOT EXISTS purchases (
      id          TEXT PRIMARY KEY,
      store_id    TEXT NOT NULL REFERENCES stores(id),
      supplier_id TEXT,
      total       REAL NOT NULL DEFAULT 0,
      paid        REAL NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at);

    CREATE TABLE IF NOT EXISTS purchase_items (
      id          TEXT PRIMARY KEY,
      store_id    TEXT NOT NULL REFERENCES stores(id),
      purchase_id TEXT NOT NULL REFERENCES purchases(id),
      product_id  TEXT NOT NULL REFERENCES products(id),
      name        TEXT NOT NULL,
      qty         REAL NOT NULL,
      unit_cost   REAL NOT NULL,
      line_total  REAL NOT NULL,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

    CREATE TABLE IF NOT EXISTS sales (
      id             TEXT PRIMARY KEY,
      store_id       TEXT NOT NULL REFERENCES stores(id),
      subtotal       REAL NOT NULL,
      tax            REAL NOT NULL,
      total          REAL NOT NULL,
      payment_method TEXT NOT NULL,
      tendered       REAL NOT NULL,
      change_due     REAL NOT NULL,
      cashier_id     TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL,
      deleted_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);

    CREATE TABLE IF NOT EXISTS sale_items (
      id          TEXT PRIMARY KEY,
      store_id    TEXT NOT NULL REFERENCES stores(id),
      sale_id     TEXT NOT NULL REFERENCES sales(id),
      product_id  TEXT NOT NULL REFERENCES products(id),
      name        TEXT NOT NULL,
      qty         REAL NOT NULL,
      unit_price  REAL NOT NULL,
      cost        REAL NOT NULL DEFAULT 0,
      line_total  REAL NOT NULL,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
  `)

  // Lightweight migrations for databases created before a column existed.
  addColumnIfMissing('sale_items', 'cost', 'REAL NOT NULL DEFAULT 0')
  addColumnIfMissing('stores', 'currency_symbol', 'TEXT')
  addColumnIfMissing('stores', 'currency_locale', 'TEXT')
  addColumnIfMissing('stores', 'onboarded', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing('stores', 'receipt_header', 'TEXT')
  addColumnIfMissing('stores', 'receipt_footer', 'TEXT')
  addColumnIfMissing('stores', 'auto_print', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing('stores', 'phone', 'TEXT')
  addColumnIfMissing('stores', 'logo', 'TEXT')
  addColumnIfMissing('users', 'pin_hash', 'TEXT')
  addColumnIfMissing('products', 'category_id', 'TEXT')
  addColumnIfMissing('sales', 'discount', 'REAL NOT NULL DEFAULT 0')
  addColumnIfMissing('sale_items', 'discount', 'REAL NOT NULL DEFAULT 0')
  addColumnIfMissing('sales', 'kind', "TEXT NOT NULL DEFAULT 'sale'")
  addColumnIfMissing('sales', 'refund_of', 'TEXT')
  addColumnIfMissing('products', 'tax_rate_id', 'TEXT')
  addColumnIfMissing('stores', 'tax_inclusive', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing('sales', 'customer_id', 'TEXT')
  addColumnIfMissing('sales', 'paid', 'REAL NOT NULL DEFAULT 0')
  addColumnIfMissing('sales', 'shift_id', 'TEXT')
  addColumnIfMissing('stores', 'permissions', 'TEXT')
  addColumnIfMissing('stores', 'roles', 'TEXT')
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function now(): string {
  return new Date().toISOString()
}

function seed(): void {
  const count = db.prepare(`SELECT COUNT(*) AS n FROM stores`).get() as { n: number }
  if (count.n > 0) return
  const storeId = randomUUID()
  const ts = now()
  db.prepare(
    `INSERT INTO stores (id, name, currency, updated_at) VALUES (?, ?, ?, ?)`
  ).run(storeId, 'My Store', 'PKR', ts)
  db.prepare(
    `INSERT INTO users (id, store_id, name, pin, role, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), storeId, 'Owner', '0000', 'owner', ts)
}

export function getDefaultStoreId(): string {
  const row = db
    .prepare(`SELECT id FROM stores WHERE deleted_at IS NULL ORDER BY updated_at LIMIT 1`)
    .get() as { id: string } | undefined
  if (!row) throw new Error('No store configured')
  return row.id
}

// ---- Settings, onboarding & auth ----

function hashPin(pin: string): string {
  return createHash('sha256').update('storepos:' + pin).digest('hex')
}

// ---- Access control (roles & permissions) ----

// The user currently signed in on this device. Set on login, cleared on lock.
// Access checks run against this user's role, so the main process — not just the
// hidden UI — is the enforcement boundary.
let sessionUserId: string | null = null

export function setSessionUser(userId: string | null): void {
  sessionUserId = userId
}

function sessionRole(): UserRole | null {
  if (!sessionUserId) return null
  const row = db
    .prepare(`SELECT role FROM users WHERE id = ? AND deleted_at IS NULL`)
    .get(sessionUserId) as { role: string } | undefined
  return (row?.role as UserRole) ?? null
}

// The store's roles. Stored as JSON in stores.roles; on first read we migrate from
// any legacy per-role permission overrides so earlier customizations survive.
function storedRoles(): RoleDef[] {
  const storeId = getDefaultStoreId()
  const row = db
    .prepare(`SELECT roles, permissions FROM stores WHERE id = ?`)
    .get(storeId) as { roles: string | null; permissions: string | null } | undefined
  if (row?.roles) {
    try {
      return normalizeRoles(JSON.parse(row.roles))
    } catch {
      /* fall through to rebuild */
    }
  }
  // Migrate: seed defaults, folding in legacy {manager:{…}, cashier:{…}} overrides.
  let overrides: Record<string, Partial<Record<Permission, boolean>>> = {}
  try {
    overrides = row?.permissions ? JSON.parse(row.permissions) : {}
  } catch {
    overrides = {}
  }
  const seeded = DEFAULT_ROLES.map((d) => ({
    ...d,
    permissions: { ...d.permissions, ...(overrides[d.key] ?? {}) }
  }))
  const roles = normalizeRoles(seeded)
  db.prepare(`UPDATE stores SET roles = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(roles),
    now(),
    storeId
  )
  return roles
}

export function getRoles(): RoleDef[] {
  return storedRoles()
}

export function saveRoles(input: RoleDef[]): void {
  const roles = normalizeRoles(input)
  // Guard: never leave a user pointing at a role that no longer exists.
  const used = db
    .prepare(`SELECT DISTINCT role FROM users WHERE store_id = ? AND deleted_at IS NULL`)
    .all(getDefaultStoreId()) as { role: string }[]
  for (const u of used) {
    if (!roles.some((r) => r.key === u.role)) throw new Error('ROLE_IN_USE:' + u.role)
  }
  db.prepare(`UPDATE stores SET roles = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(roles),
    now(),
    getDefaultStoreId()
  )
}

/** Does the signed-in user hold this permission right now? No session → denied. */
export function currentCan(perm: Permission): boolean {
  const role = sessionRole()
  if (!role) return false
  return roleCan(role, perm, storedRoles())
}

/** True if some active user whose role grants `permission` has this PIN. */
function approvalGrants(permission: Permission, pin: string | undefined): boolean {
  if (!pin) return false
  const roles = storedRoles()
  const users = db
    .prepare(
      `SELECT role, pin_hash FROM users WHERE store_id = ? AND deleted_at IS NULL AND pin_hash IS NOT NULL`
    )
    .all(getDefaultStoreId()) as { role: string; pin_hash: string }[]
  const hashed = hashPin(pin)
  return users.some((u) => u.pin_hash === hashed && roleCan(u.role, permission, roles))
}

/** Elevation check used by the UI: does this PIN authorize `permission`? */
export function elevate(permission: Permission, pin: string): { ok: boolean; name: string | null } {
  const roles = storedRoles()
  const users = db
    .prepare(
      `SELECT name, role, pin_hash FROM users WHERE store_id = ? AND deleted_at IS NULL AND pin_hash IS NOT NULL`
    )
    .all(getDefaultStoreId()) as { name: string; role: string; pin_hash: string }[]
  const hashed = hashPin(pin)
  const grantor = users.find((u) => u.pin_hash === hashed && roleCan(u.role, permission, roles))
  return grantor ? { ok: true, name: grantor.name } : { ok: false, name: null }
}

interface StoreRow {
  id: string
  name: string
  address: string | null
  phone: string | null
  currency: string
  currency_symbol: string | null
  currency_locale: string | null
  onboarded: number
  receipt_header: string | null
  receipt_footer: string | null
  auto_print: number
  tax_inclusive: number
  logo: string | null
}

function getOwner(storeId: string): { id: string; name: string; pin_hash: string | null } | undefined {
  return db
    .prepare(
      `SELECT id, name, pin_hash FROM users
        WHERE store_id = ? AND role = 'owner' AND deleted_at IS NULL
        ORDER BY updated_at LIMIT 1`
    )
    .get(storeId) as { id: string; name: string; pin_hash: string | null } | undefined
}

export function getSettings(): SettingsInfo {
  const storeId = getDefaultStoreId()
  const store = db.prepare(`SELECT * FROM stores WHERE id = ?`).get(storeId) as StoreRow
  const owner = getOwner(storeId)
  return {
    storeName: store.name,
    address: store.address ?? '',
    phone: store.phone ?? '',
    currencyCode: store.currency,
    currencySymbol: store.currency_symbol,
    currencyLocale: store.currency_locale,
    onboarded: store.onboarded === 1,
    hasPin: !!owner?.pin_hash,
    ownerName: owner?.name ?? 'Owner',
    receiptHeader: store.receipt_header ?? '',
    receiptFooter: store.receipt_footer ?? '',
    autoPrint: store.auto_print === 1,
    taxInclusive: store.tax_inclusive === 1,
    logo: store.logo ?? null
  }
}

export function updateTaxSettings(p: { taxInclusive: boolean }): void {
  db.prepare(`UPDATE stores SET tax_inclusive = ?, updated_at = ? WHERE id = ?`).run(
    p.taxInclusive ? 1 : 0,
    now(),
    getDefaultStoreId()
  )
}

// ---- Tax rates (groups) ----

export function listTaxRates(): TaxRate[] {
  return db
    .prepare(`SELECT * FROM tax_rates WHERE deleted_at IS NULL ORDER BY rate, name COLLATE NOCASE`)
    .all() as TaxRate[]
}

export function upsertTaxRate(t: TaxRateInput): TaxRate {
  const ts = now()
  const name = t.name.trim().slice(0, 40)
  const rate = Math.max(0, t.rate)
  if (t.id) {
    db.prepare(`UPDATE tax_rates SET name = ?, rate = ?, updated_at = ? WHERE id = ?`).run(
      name,
      rate,
      ts,
      t.id
    )
    // Propagate the new rate to every product assigned to this group.
    db.prepare(`UPDATE products SET tax_rate = ?, updated_at = ? WHERE tax_rate_id = ?`).run(
      rate,
      ts,
      t.id
    )
    return db.prepare(`SELECT * FROM tax_rates WHERE id = ?`).get(t.id) as TaxRate
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO tax_rates (id, store_id, name, rate, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, getDefaultStoreId(), name, rate, ts)
  return db.prepare(`SELECT * FROM tax_rates WHERE id = ?`).get(id) as TaxRate
}

export function deleteTaxRate(id: string): void {
  const ts = now()
  const tx = db.transaction(() => {
    db.prepare(`UPDATE tax_rates SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, id)
    db.prepare(`UPDATE products SET tax_rate_id = NULL, updated_at = ? WHERE tax_rate_id = ?`).run(
      ts,
      id
    )
  })
  tx()
}

// ---- Suppliers (distributors) & purchases ----

export function listSuppliers(): Supplier[] {
  return db
    .prepare(
      `SELECT s.*,
              COALESCE((SELECT SUM(p.total - p.paid) FROM purchases p
                         WHERE p.supplier_id = s.id AND p.deleted_at IS NULL), 0) AS outstanding
         FROM suppliers s
        WHERE s.deleted_at IS NULL
        ORDER BY s.name COLLATE NOCASE`
    )
    .all() as Supplier[]
}

export function upsertSupplier(s: SupplierInput): Supplier {
  const ts = now()
  const name = s.name.trim().slice(0, 60)
  const phone = s.phone?.trim() ? s.phone.trim().slice(0, 40) : null
  if (s.id) {
    db.prepare(`UPDATE suppliers SET name = ?, phone = ?, updated_at = ? WHERE id = ?`).run(
      name,
      phone,
      ts,
      s.id
    )
    return getSupplier(s.id)
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO suppliers (id, store_id, name, phone, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, getDefaultStoreId(), name, phone, ts)
  return getSupplier(id)
}

function getSupplier(id: string): Supplier {
  return db
    .prepare(
      `SELECT s.*,
              COALESCE((SELECT SUM(p.total - p.paid) FROM purchases p
                         WHERE p.supplier_id = s.id AND p.deleted_at IS NULL), 0) AS outstanding
         FROM suppliers s WHERE s.id = ?`
    )
    .get(id) as Supplier
}

export function deleteSupplier(id: string): void {
  const ts = now()
  db.prepare(`UPDATE suppliers SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, id)
}

export function createPurchase(payload: PurchasePayload): PurchaseRow {
  const ts = now()
  const storeId = getDefaultStoreId()
  const purchaseId = randomUUID()
  const lines = payload.items
    .filter((i) => i.qty > 0)
    .map((i) => ({ ...i, lineTotal: round2(i.unit_cost * i.qty) }))
  if (lines.length === 0) throw new Error('Purchase has no items')
  const total = purchaseTotal(lines.map((l) => ({ qty: l.qty, unitCost: l.unit_cost })))
  const paid = Math.max(0, round2(payload.paid))

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO purchases (id, store_id, supplier_id, total, paid, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(purchaseId, storeId, payload.supplier_id, total, paid, ts, ts)

    const insItem = db.prepare(
      `INSERT INTO purchase_items
         (id, store_id, purchase_id, product_id, name, qty, unit_cost, line_total, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    // Receiving stock: increase quantity and update the product's cost.
    const receive = db.prepare(
      `UPDATE products SET stock_qty = stock_qty + ?, cost = ?, updated_at = ? WHERE id = ?`
    )
    for (const line of lines) {
      const product = getProduct(line.product_id)
      insItem.run(
        randomUUID(),
        storeId,
        purchaseId,
        line.product_id,
        product?.name ?? 'Item',
        line.qty,
        line.unit_cost,
        line.lineTotal,
        ts
      )
      receive.run(line.qty, line.unit_cost, ts, line.product_id)
    }
  })
  tx()

  return getPurchase(purchaseId)
}

function getPurchase(id: string): PurchaseRow {
  return db
    .prepare(
      `SELECT p.id, p.supplier_id, p.total, p.paid, p.created_at,
              (SELECT name FROM suppliers WHERE id = p.supplier_id) AS supplier_name,
              (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS item_count
         FROM purchases p WHERE p.id = ?`
    )
    .get(id) as PurchaseRow
}

export function recentPurchases(limit = 30): PurchaseRow[] {
  return db
    .prepare(
      `SELECT p.id, p.supplier_id, p.total, p.paid, p.created_at,
              (SELECT name FROM suppliers WHERE id = p.supplier_id) AS supplier_name,
              (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS item_count
         FROM purchases p
        WHERE p.deleted_at IS NULL
        ORDER BY p.created_at DESC
        LIMIT ?`
    )
    .all(limit) as PurchaseRow[]
}

// ---- Customers & credit (khata) ----

const CUSTOMER_BALANCE_SQL = `
  COALESCE((SELECT SUM(s.total - s.paid) FROM sales s
             WHERE s.customer_id = c.id AND s.deleted_at IS NULL), 0)
  - COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp
               WHERE cp.customer_id = c.id AND cp.deleted_at IS NULL), 0)`

export function listCustomers(): Customer[] {
  return db
    .prepare(
      `SELECT c.*, ${CUSTOMER_BALANCE_SQL} AS balance
         FROM customers c
        WHERE c.deleted_at IS NULL
        ORDER BY c.name COLLATE NOCASE`
    )
    .all() as Customer[]
}

function getCustomer(id: string): Customer {
  return db
    .prepare(`SELECT c.*, ${CUSTOMER_BALANCE_SQL} AS balance FROM customers c WHERE c.id = ?`)
    .get(id) as Customer
}

export function upsertCustomer(c: CustomerInput): Customer {
  const ts = now()
  const name = c.name.trim().slice(0, 60)
  const phone = c.phone?.trim() ? c.phone.trim().slice(0, 40) : null
  if (c.id) {
    db.prepare(`UPDATE customers SET name = ?, phone = ?, updated_at = ? WHERE id = ?`).run(
      name,
      phone,
      ts,
      c.id
    )
    return getCustomer(c.id)
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO customers (id, store_id, name, phone, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, getDefaultStoreId(), name, phone, ts)
  return getCustomer(id)
}

export function deleteCustomer(id: string): void {
  const ts = now()
  db.prepare(`UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, id)
}

export function recordCustomerPayment(customerId: string, amount: number): void {
  const amt = round2(Math.max(0, amount))
  if (amt <= 0) return
  const ts = now()
  db.prepare(
    `INSERT INTO customer_payments (id, store_id, customer_id, amount, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), getDefaultStoreId(), customerId, amt, ts, ts)
}

export function getCustomerLedger(customerId: string, limit = 50): CustomerLedgerEntry[] {
  return db
    .prepare(
      `SELECT s.id, 'sale' AS type, (s.total - s.paid) AS amount, s.created_at,
              (SELECT GROUP_CONCAT(
                        si.name || ' ×' ||
                        (CASE WHEN si.qty = CAST(si.qty AS INTEGER)
                              THEN CAST(si.qty AS INTEGER) ELSE si.qty END),
                        ', ')
                 FROM sale_items si
                WHERE si.sale_id = s.id AND si.deleted_at IS NULL) AS detail
         FROM sales s
        WHERE s.customer_id = ? AND s.deleted_at IS NULL AND (s.total - s.paid) > 0
       UNION ALL
       SELECT id, 'payment' AS type, amount, created_at, NULL AS detail
         FROM customer_payments
        WHERE customer_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(customerId, customerId, limit) as CustomerLedgerEntry[]
}

export function updateStoreProfile(p: {
  storeName: string
  address: string
  phone: string
  currencyCode: string
  currencySymbol: string
  currencyLocale: string
  logo: string | null
}): void {
  const storeId = getDefaultStoreId()
  // Only accept a reasonably sized data-URL image; otherwise clear it.
  const logo =
    p.logo && p.logo.startsWith('data:image/') && p.logo.length < 400_000 ? p.logo : null
  db.prepare(
    `UPDATE stores
        SET name = ?, address = ?, phone = ?, currency = ?, currency_symbol = ?,
            currency_locale = ?, logo = ?, updated_at = ?
      WHERE id = ?`
  ).run(
    p.storeName.trim().slice(0, 40),
    p.address.trim().slice(0, 120),
    p.phone.trim().slice(0, 40),
    p.currencyCode,
    p.currencySymbol,
    p.currencyLocale,
    logo,
    now(),
    storeId
  )
}

export function updateReceiptSettings(p: {
  header: string
  footer: string
  autoPrint: boolean
}): void {
  const storeId = getDefaultStoreId()
  db.prepare(
    `UPDATE stores SET receipt_header = ?, receipt_footer = ?, auto_print = ?, updated_at = ? WHERE id = ?`
  ).run(p.header.slice(0, 200), p.footer.slice(0, 200), p.autoPrint ? 1 : 0, now(), storeId)
}

export function setPin(pin: string): void {
  const storeId = getDefaultStoreId()
  const owner = getOwner(storeId)
  const pinHash = pin ? hashPin(pin) : null
  if (owner) {
    db.prepare(`UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?`).run(
      pinHash,
      now(),
      owner.id
    )
  }
}

export function saveOnboarding(p: OnboardingPayload): void {
  const ts = now()
  const storeId = getDefaultStoreId()
  // Safety net: clamp the store name even if a caller bypasses the UI limit.
  const storeName = p.storeName.trim().slice(0, 40)
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE stores
          SET name = ?, currency = ?, currency_symbol = ?, currency_locale = ?,
              onboarded = 1, updated_at = ?
        WHERE id = ?`
    ).run(storeName, p.currencyCode, p.currencySymbol, p.currencyLocale, ts, storeId)

    const owner = getOwner(storeId)
    const pinHash = p.pin ? hashPin(p.pin) : null
    if (owner) {
      db.prepare(`UPDATE users SET name = ?, pin_hash = ?, updated_at = ? WHERE id = ?`).run(
        p.ownerName,
        pinHash,
        ts,
        owner.id
      )
    } else {
      db.prepare(
        `INSERT INTO users (id, store_id, name, pin_hash, role, updated_at)
         VALUES (?, ?, ?, ?, 'owner', ?)`
      ).run(randomUUID(), storeId, p.ownerName, pinHash, ts)
    }
  })
  tx()
}

export function checkPin(pin: string): boolean {
  const owner = getOwner(getDefaultStoreId())
  if (!owner?.pin_hash) return true // no PIN set → nothing to unlock
  return hashPin(pin) === owner.pin_hash
}

// ---- Users (cashiers) ----

export function listUsers(): import('../shared/types').User[] {
  return db
    .prepare(
      `SELECT id, name, role, (pin_hash IS NOT NULL) AS hasPin
         FROM users
        WHERE store_id = ? AND deleted_at IS NULL
        ORDER BY (role = 'owner') DESC, name COLLATE NOCASE`
    )
    .all(getDefaultStoreId())
    .map((r) => {
      const row = r as { id: string; name: string; role: string; hasPin: number }
      return { id: row.id, name: row.name, role: row.role as 'owner' | 'cashier', hasPin: !!row.hasPin }
    })
}

export function saveUser(u: import('../shared/types').UserInput): import('../shared/types').User {
  const ts = now()
  const storeId = getDefaultStoreId()
  const name = u.name.trim().slice(0, 40)
  const role = u.role === 'owner' ? 'owner' : 'cashier'
  if (u.id) {
    if (u.pin) {
      db.prepare(`UPDATE users SET name = ?, role = ?, pin_hash = ?, updated_at = ? WHERE id = ?`).run(
        name,
        role,
        hashPin(u.pin),
        ts,
        u.id
      )
    } else {
      db.prepare(`UPDATE users SET name = ?, role = ?, updated_at = ? WHERE id = ?`).run(
        name,
        role,
        ts,
        u.id
      )
    }
    return getUser(u.id)
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO users (id, store_id, name, pin_hash, role, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, storeId, name, u.pin ? hashPin(u.pin) : null, role, ts)
  return getUser(id)
}

function getUser(id: string): import('../shared/types').User {
  const row = db
    .prepare(`SELECT id, name, role, (pin_hash IS NOT NULL) AS hasPin FROM users WHERE id = ?`)
    .get(id) as { id: string; name: string; role: string; hasPin: number }
  return {
    id: row.id,
    name: row.name,
    role: row.role as 'owner' | 'cashier',
    hasPin: !!row.hasPin
  }
}

export function deleteUser(id: string): void {
  const storeId = getDefaultStoreId()
  const user = db.prepare(`SELECT role FROM users WHERE id = ?`).get(id) as
    | { role: string }
    | undefined
  if (user?.role === 'owner') {
    const owners = db
      .prepare(
        `SELECT COUNT(*) AS n FROM users WHERE store_id = ? AND role = 'owner' AND deleted_at IS NULL`
      )
      .get(storeId) as { n: number }
    if (owners.n <= 1) throw new Error('Cannot delete the last owner')
  }
  const ts = now()
  db.prepare(`UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, id)
}

export function verifyUserPin(userId: string, pin: string): boolean {
  const row = db.prepare(`SELECT pin_hash FROM users WHERE id = ? AND deleted_at IS NULL`).get(
    userId
  ) as { pin_hash: string | null } | undefined
  if (!row) return false
  if (!row.pin_hash) return true
  return hashPin(pin) === row.pin_hash
}

// ---- Shifts (day-close / Z-report) ----

function getCurrentShiftId(): string | null {
  const row = db
    .prepare(
      `SELECT id FROM shifts WHERE store_id = ? AND status = 'open' AND deleted_at IS NULL
        ORDER BY opened_at DESC LIMIT 1`
    )
    .get(getDefaultStoreId()) as { id: string } | undefined
  return row?.id ?? null
}

export function getCurrentShift(): Shift | null {
  const row = db
    .prepare(
      `SELECT id, user_id, opening_float, opened_at, status FROM shifts
        WHERE store_id = ? AND status = 'open' AND deleted_at IS NULL
        ORDER BY opened_at DESC LIMIT 1`
    )
    .get(getDefaultStoreId()) as Shift | undefined
  return row ?? null
}

export function openShift(p: OpenShiftPayload): Shift {
  if (getCurrentShiftId()) throw new Error('A shift is already open')
  const ts = now()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO shifts (id, store_id, user_id, opening_float, status, opened_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?)`
  ).run(id, getDefaultStoreId(), p.userId, round2(Math.max(0, p.openingFloat)), ts, ts)
  return getCurrentShift() as Shift
}

function userName(id: string | null): string {
  if (!id) return ''
  const row = db.prepare(`SELECT name FROM users WHERE id = ?`).get(id) as
    | { name: string }
    | undefined
  return row?.name ?? ''
}

export function closeShift(p: CloseShiftPayload): ShiftReport {
  const shift = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(p.shiftId) as
    | {
        id: string
        user_id: string | null
        opening_float: number
        opened_at: string
        status: string
      }
    | undefined
  if (!shift || shift.status !== 'open') throw new Error('Shift is not open')
  const ts = now()
  const counted = round2(Math.max(0, p.countedCash))

  const agg = db
    .prepare(
      `SELECT COUNT(CASE WHEN kind = 'sale' THEN 1 END) AS salesCount,
              COALESCE(SUM(total), 0) AS total,
              COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0)
                + COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN paid ELSE 0 END), 0) AS cashMovement
         FROM sales
        WHERE shift_id = ? AND deleted_at IS NULL`
    )
    .get(p.shiftId) as { salesCount: number; total: number; cashMovement: number }

  const byMethod = db
    .prepare(
      `SELECT payment_method,
              COUNT(CASE WHEN kind = 'sale' THEN 1 END) AS count,
              COALESCE(SUM(total), 0) AS total
         FROM sales
        WHERE shift_id = ? AND deleted_at IS NULL
        GROUP BY payment_method`
    )
    .all(p.shiftId) as DailyReportRow[]

  const cashExpected = round2(shift.opening_float + agg.cashMovement)
  const overShort = round2(counted - cashExpected)

  db.prepare(
    `UPDATE shifts SET status = 'closed', closing_counted = ?, closed_by = ?, closed_at = ?, updated_at = ?
      WHERE id = ?`
  ).run(counted, p.userId, ts, ts, p.shiftId)

  return {
    shiftId: shift.id,
    openingFloat: round2(shift.opening_float),
    cashExpected,
    countedCash: counted,
    overShort,
    salesCount: agg.salesCount,
    total: round2(agg.total),
    byMethod,
    openedAt: shift.opened_at,
    closedAt: ts,
    openedByName: userName(shift.user_id),
    closedByName: userName(p.userId)
  }
}

// ---- Products ----

export function listProducts(): Product[] {
  return db
    .prepare(`SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE`)
    .all() as Product[]
}

export function getProduct(id: string): Product {
  return db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) as Product
}

export function findProductByBarcode(barcode: string): Product | undefined {
  return db
    .prepare(`SELECT * FROM products WHERE barcode = ? AND deleted_at IS NULL`)
    .get(barcode) as Product | undefined
}

export function upsertProduct(p: ProductInput): Product {
  const ts = now()
  const categoryId = p.category_id ?? null
  const taxRateId = p.tax_rate_id ?? null
  if (p.id) {
    db.prepare(
      `UPDATE products
         SET name = ?, barcode = ?, price = ?, cost = ?, tax_rate = ?, tax_rate_id = ?,
             stock_qty = ?, category_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      p.name,
      p.barcode,
      p.price,
      p.cost,
      p.tax_rate,
      taxRateId,
      p.stock_qty,
      categoryId,
      ts,
      p.id
    )
    return getProduct(p.id)
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO products
       (id, store_id, name, barcode, price, cost, tax_rate, tax_rate_id, stock_qty, category_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    getDefaultStoreId(),
    p.name,
    p.barcode,
    p.price,
    p.cost,
    p.tax_rate,
    taxRateId,
    p.stock_qty,
    categoryId,
    ts
  )
  return getProduct(id)
}

// ---- Categories ----

export function listCategories(): import('../shared/types').Category[] {
  return db
    .prepare(
      `SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name COLLATE NOCASE`
    )
    .all() as import('../shared/types').Category[]
}

export function upsertCategory(c: {
  id?: string
  name: string
}): import('../shared/types').Category {
  const ts = now()
  const name = c.name.trim().slice(0, 40)
  if (c.id) {
    db.prepare(`UPDATE categories SET name = ?, updated_at = ? WHERE id = ?`).run(name, ts, c.id)
    return db.prepare(`SELECT * FROM categories WHERE id = ?`).get(c.id) as import(
      '../shared/types'
    ).Category
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO categories (id, store_id, name, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, getDefaultStoreId(), name, 0, ts)
  return db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id) as import(
    '../shared/types'
  ).Category
}

export function deleteCategory(id: string): void {
  const ts = now()
  const tx = db.transaction(() => {
    db.prepare(`UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, id)
    // Products in a deleted category fall back to uncategorized.
    db.prepare(
      `UPDATE products SET category_id = NULL, updated_at = ? WHERE category_id = ?`
    ).run(ts, id)
  })
  tx()
}

export function deleteProduct(id: string): void {
  const ts = now()
  db.prepare(`UPDATE products SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(ts, ts, id)
}

// Bulk import: update an existing product when the barcode matches, else insert.
// Rows without a barcode are always inserted (nothing to match on).
export function bulkUpsertProducts(rows: ProductInput[]): { added: number; updated: number } {
  const ts = now()
  const storeId = getDefaultStoreId()
  const findByBarcode = db.prepare(
    `SELECT id FROM products WHERE barcode = ? AND deleted_at IS NULL`
  )
  const upd = db.prepare(
    `UPDATE products
        SET name = ?, price = ?, cost = ?, tax_rate = ?, stock_qty = ?, updated_at = ?
      WHERE id = ?`
  )
  const ins = db.prepare(
    `INSERT INTO products (id, store_id, name, barcode, price, cost, tax_rate, stock_qty, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let added = 0
  let updated = 0
  const tx = db.transaction((items: ProductInput[]) => {
    for (const r of items) {
      const existing = r.barcode
        ? (findByBarcode.get(r.barcode) as { id: string } | undefined)
        : undefined
      if (existing) {
        upd.run(r.name, r.price, r.cost, r.tax_rate, r.stock_qty, ts, existing.id)
        updated++
      } else {
        ins.run(
          randomUUID(),
          storeId,
          r.name,
          r.barcode,
          r.price,
          r.cost,
          r.tax_rate,
          r.stock_qty,
          ts
        )
        added++
      }
    }
  })
  tx(rows)
  return { added, updated }
}

// ---- Sales ----

export function createSale(payload: SalePayload): Sale {
  const ts = now()
  const storeId = getDefaultStoreId()
  const saleId = randomUUID()
  const cartDiscount = Math.max(payload.discount ?? 0, 0)

  // A discount (whole-cart or any line) needs the 'discount' permission, or a
  // manager PIN authorizing it. Enforced here so the UI can't be bypassed.
  const hasDiscount = cartDiscount > 0 || payload.items.some((i) => (i.discount ?? 0) > 0)
  if (hasDiscount && !currentCan('discount') && !approvalGrants('discount', payload.discountApprovalPin)) {
    throw new Error('FORBIDDEN:discount')
  }
  const inclusive =
    (db.prepare(`SELECT tax_inclusive FROM stores WHERE id = ?`).get(storeId) as {
      tax_inclusive: number
    }).tax_inclusive === 1

  const lineInputs = payload.items.map((i) => ({
    unitPrice: i.unit_price,
    qty: i.qty,
    taxRate: i.tax_rate,
    discount: i.discount
  }))
  const totals = calcTotals(lineInputs, cartDiscount, inclusive)
  // For credit sales, "paid" is what was collected now (may be partial); the rest
  // goes on the customer's account. Cash/card are always paid in full.
  const paidNow =
    payload.payment_method === 'credit'
      ? Math.min(Math.max(payload.paid ?? 0, 0), totals.total)
      : totals.total
  const customerId = payload.payment_method === 'credit' ? payload.customer_id ?? null : null
  const changeDue =
    payload.payment_method === 'credit' ? 0 : round2(payload.tendered - totals.total)

  // Work in ex-tax figures so stored amounts (and reports) are mode-agnostic.
  // Distribute the cart-level discount across lines proportional to each line's
  // ex-tax net, so each sale_item records its full share.
  const exs = lineInputs.map((l) => lineEx(l, inclusive))
  const afterLine = exs.reduce((s, e) => s + e.netEx, 0)
  const cartDisc = Math.min(cartDiscount, afterLine)

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sales
         (id, store_id, subtotal, discount, tax, total, payment_method, tendered, change_due,
          customer_id, paid, cashier_id, shift_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      saleId,
      storeId,
      totals.subtotal,
      totals.discount,
      totals.tax,
      totals.total,
      payload.payment_method,
      payload.tendered,
      changeDue,
      customerId,
      paidNow,
      payload.cashier_id ?? null,
      getCurrentShiftId(),
      ts,
      ts
    )

    const insItem = db.prepare(
      `INSERT INTO sale_items
         (id, store_id, sale_id, product_id, name, qty, unit_price, cost, discount, line_total, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const decStock = db.prepare(
      `UPDATE products SET stock_qty = stock_qty - ?, updated_at = ? WHERE id = ?`
    )
    payload.items.forEach((item, idx) => {
      const product = getProduct(item.product_id)
      const e = exs[idx]
      const share = afterLine > 0 ? cartDisc * (e.netEx / afterLine) : 0
      const discount = round2(e.discEx + share)
      insItem.run(
        randomUUID(),
        storeId,
        saleId,
        item.product_id,
        product?.name ?? 'Item',
        item.qty,
        item.unit_price,
        product?.cost ?? 0,
        discount,
        round2(e.grossEx),
        ts
      )
      decStock.run(item.qty, ts, item.product_id)
    })
  })
  tx()

  return getSale(saleId)
}

export function getSale(id: string): Sale {
  const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(id) as Sale
  const items = db
    .prepare(`SELECT * FROM sale_items WHERE sale_id = ? AND deleted_at IS NULL`)
    .all(id) as SaleItem[]
  return { ...sale, items }
}

// ---- Returns / refunds ----

export function recentSales(limit = 20): RecentSale[] {
  return db
    .prepare(
      `SELECT s.id, s.total, s.created_at,
              (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
         FROM sales s
        WHERE s.deleted_at IS NULL AND s.kind = 'sale'
        ORDER BY s.created_at DESC
        LIMIT ?`
    )
    .all(limit) as RecentSale[]
}

// How much of each line is still refundable (original qty minus already refunded).
export function getSaleForRefund(id: string): { sale: Sale; items: SaleItemRefundable[] } | null {
  const sale = db.prepare(`SELECT * FROM sales WHERE id = ? AND kind = 'sale'`).get(id) as
    | Sale
    | undefined
  if (!sale) return null
  const items = db
    .prepare(`SELECT * FROM sale_items WHERE sale_id = ? AND deleted_at IS NULL`)
    .all(id) as SaleItem[]
  const refundedRow = db.prepare(
    `SELECT COALESCE(SUM(-si.qty), 0) AS refunded
       FROM sale_items si
       JOIN sales r ON r.id = si.sale_id
      WHERE r.refund_of = ? AND si.product_id = ?`
  )
  const refundable = items.map((it) => {
    const r = refundedRow.get(id, it.product_id) as { refunded: number }
    return { ...it, refundable: Math.max(0, it.qty - r.refunded) }
  })
  return { sale: { ...sale, items }, items: refundable }
}

export function createRefund(payload: RefundPayload): Sale {
  // Refunds are a shrinkage risk: require the 'refund' permission or a manager PIN.
  if (!currentCan('refund') && !approvalGrants('refund', payload.approvalPin)) {
    throw new Error('FORBIDDEN:refund')
  }
  const ts = now()
  const storeId = getDefaultStoreId()
  const original = getSaleForRefund(payload.saleId)
  if (!original) throw new Error('Original sale not found')

  const byId = new Map(original.items.map((i) => [i.id, i]))
  const requested = payload.lines
    .map((l) => ({ item: byId.get(l.saleItemId), qty: Math.max(0, Math.floor(l.qty)) }))
    .filter((l) => l.item && l.qty > 0) as { item: SaleItemRefundable; qty: number }[]

  for (const { item, qty } of requested) {
    if (qty > item.refundable) {
      throw new Error(`Cannot refund more than ${item.refundable} of ${item.name}`)
    }
  }
  if (requested.length === 0) throw new Error('Nothing to refund')

  const originalNet = original.sale.subtotal - original.sale.discount
  const calc = calcRefund(
    requested.map(({ item, qty }) => ({
      origQty: item.qty,
      lineTotal: item.line_total,
      discount: item.discount,
      refundQty: qty
    })),
    original.sale.tax,
    originalNet
  )

  const refundId = randomUUID()
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sales
         (id, store_id, subtotal, discount, tax, total, payment_method, tendered, change_due,
          kind, refund_of, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'refund', ?, ?, ?)`
    ).run(
      refundId,
      storeId,
      -calc.subtotal,
      -calc.discount,
      -calc.tax,
      -calc.total,
      original.sale.payment_method,
      payload.saleId,
      ts,
      ts
    )

    const insItem = db.prepare(
      `INSERT INTO sale_items
         (id, store_id, sale_id, product_id, name, qty, unit_price, cost, discount, line_total, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const restock = db.prepare(
      `UPDATE products SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?`
    )
    requested.forEach(({ item, qty }, idx) => {
      insItem.run(
        randomUUID(),
        storeId,
        refundId,
        item.product_id,
        item.name,
        -qty,
        item.unit_price,
        item.cost,
        -calc.lines[idx].discount,
        -calc.lines[idx].gross,
        ts
      )
      restock.run(qty, ts, item.product_id)
    })
  })
  tx()

  return getSale(refundId)
}

// ---- Reports ----

export function dailyReport(): DailyReport {
  // Compute the local-day boundaries, then convert to UTC ISO to match how
  // created_at is stored (toISOString is UTC).
  const d = new Date()
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const startIso = start.toISOString()
  const endIso = end.toISOString()

  const summary = db
    .prepare(
      `SELECT COUNT(CASE WHEN kind = 'sale' THEN 1 END) AS count,
              COALESCE(SUM(total), 0) AS total
         FROM sales
        WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?`
    )
    .get(startIso, endIso) as { count: number; total: number }

  const byMethod = db
    .prepare(
      `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM sales
        WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?
        GROUP BY payment_method`
    )
    .all(startIso, endIso) as DailyReportRow[]

  return {
    date: start.toLocaleDateString(),
    count: summary.count,
    total: round2(summary.total),
    byMethod
  }
}

export function monthlyReport(month: string): import('../shared/types').MonthlyReport {
  // month is 'YYYY-MM'. Build local month boundaries, then convert to UTC ISO
  // to match stored created_at values.
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 1)
  const startIso = start.toISOString()
  const endIso = end.toISOString()

  const sales = db
    .prepare(
      `SELECT COUNT(CASE WHEN kind = 'sale' THEN 1 END) AS salesCount,
              COALESCE(SUM(subtotal - discount), 0) AS netSales,
              COALESCE(SUM(tax), 0)                 AS taxCollected,
              COALESCE(SUM(total), 0)               AS grossSales
         FROM sales
        WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?`
    )
    .get(startIso, endIso) as {
    salesCount: number
    netSales: number
    taxCollected: number
    grossSales: number
  }

  const items = db
    .prepare(
      `SELECT COALESCE(SUM(si.qty), 0)          AS itemsSold,
              COALESCE(SUM(si.cost * si.qty), 0) AS cogs
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
        WHERE s.deleted_at IS NULL AND si.deleted_at IS NULL
          AND s.created_at >= ? AND s.created_at < ?`
    )
    .get(startIso, endIso) as { itemsSold: number; cogs: number }

  const byMethod = db
    .prepare(
      `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM sales
        WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?
        GROUP BY payment_method`
    )
    .all(startIso, endIso) as DailyReportRow[]

  const topProducts = db
    .prepare(
      `SELECT si.name                                              AS name,
              SUM(si.qty)                                          AS qty,
              SUM(si.line_total - si.discount)                     AS revenue,
              SUM(si.line_total - si.discount - si.cost * si.qty)  AS profit
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
        WHERE s.deleted_at IS NULL AND si.deleted_at IS NULL
          AND s.created_at >= ? AND s.created_at < ?
        GROUP BY si.product_id, si.name
        ORDER BY profit DESC
        LIMIT 5`
    )
    .all(startIso, endIso) as { name: string; qty: number; revenue: number; profit: number }[]

  const daily = db
    .prepare(
      `SELECT date(s.created_at, 'localtime')                          AS date,
              COALESCE(SUM(si.line_total - si.discount), 0)            AS revenue,
              COALESCE(SUM(si.line_total - si.discount - si.cost * si.qty), 0) AS profit
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
        WHERE s.deleted_at IS NULL AND si.deleted_at IS NULL
          AND s.created_at >= ? AND s.created_at < ?
        GROUP BY date(s.created_at, 'localtime')
        ORDER BY date`
    )
    .all(startIso, endIso) as { date: string; revenue: number; profit: number }[]

  const netSales = round2(sales.netSales)
  const cogs = round2(items.cogs)
  const grossProfit = round2(netSales - cogs)

  return {
    month,
    label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    salesCount: sales.salesCount,
    itemsSold: items.itemsSold,
    grossSales: round2(sales.grossSales),
    netSales,
    taxCollected: round2(sales.taxCollected),
    cogs,
    grossProfit,
    margin: netSales > 0 ? grossProfit / netSales : 0,
    byMethod,
    topProducts: topProducts.map((t) => ({
      name: t.name,
      qty: t.qty,
      revenue: round2(t.revenue),
      profit: round2(t.profit)
    })),
    daily: daily.map((d) => ({
      date: d.date,
      revenue: round2(d.revenue),
      profit: round2(d.profit)
    }))
  }
}

export function rangeReport(
  startIso: string,
  endIso: string
): import('../shared/types').RangeReport {
  const sales = db
    .prepare(
      `SELECT COUNT(CASE WHEN kind = 'sale' THEN 1 END) AS salesCount,
              COALESCE(SUM(subtotal - discount), 0) AS netSales,
              COALESCE(SUM(tax), 0)                 AS taxCollected,
              COALESCE(SUM(total), 0)               AS grossSales
         FROM sales
        WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?`
    )
    .get(startIso, endIso) as {
    salesCount: number
    netSales: number
    taxCollected: number
    grossSales: number
  }

  const items = db
    .prepare(
      `SELECT COALESCE(SUM(si.qty), 0) AS itemsSold, COALESCE(SUM(si.cost * si.qty), 0) AS cogs
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE s.deleted_at IS NULL AND si.deleted_at IS NULL AND s.created_at >= ? AND s.created_at < ?`
    )
    .get(startIso, endIso) as { itemsSold: number; cogs: number }

  const byMethod = db
    .prepare(
      `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM sales WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?
        GROUP BY payment_method`
    )
    .all(startIso, endIso) as DailyReportRow[]

  const topProducts = db
    .prepare(
      `SELECT si.name AS name, SUM(si.qty) AS qty,
              SUM(si.line_total - si.discount) AS revenue,
              SUM(si.line_total - si.discount - si.cost * si.qty) AS profit
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE s.deleted_at IS NULL AND si.deleted_at IS NULL AND s.created_at >= ? AND s.created_at < ?
        GROUP BY si.product_id, si.name ORDER BY profit DESC LIMIT 5`
    )
    .all(startIso, endIso) as { name: string; qty: number; revenue: number; profit: number }[]

  const daily = db
    .prepare(
      `SELECT date(s.created_at, 'localtime') AS date,
              COALESCE(SUM(si.line_total - si.discount), 0) AS revenue,
              COALESCE(SUM(si.line_total - si.discount - si.cost * si.qty), 0) AS profit
         FROM sales s JOIN sale_items si ON si.sale_id = s.id
        WHERE s.deleted_at IS NULL AND si.deleted_at IS NULL AND s.created_at >= ? AND s.created_at < ?
        GROUP BY date(s.created_at, 'localtime') ORDER BY date`
    )
    .all(startIso, endIso) as { date: string; revenue: number; profit: number }[]

  const byCategory = db
    .prepare(
      `SELECT cat.name AS name,
              SUM(si.line_total - si.discount) AS revenue,
              SUM(si.line_total - si.discount - si.cost * si.qty) AS profit
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN categories cat ON cat.id = p.category_id
        WHERE s.deleted_at IS NULL AND si.deleted_at IS NULL AND s.created_at >= ? AND s.created_at < ?
        GROUP BY cat.name ORDER BY revenue DESC`
    )
    .all(startIso, endIso) as { name: string | null; revenue: number; profit: number }[]

  const byCashier = db
    .prepare(
      `SELECT u.name AS name,
              COUNT(CASE WHEN s.kind = 'sale' THEN 1 END) AS count,
              COALESCE(SUM(s.total), 0) AS total
         FROM sales s LEFT JOIN users u ON u.id = s.cashier_id
        WHERE s.deleted_at IS NULL AND s.created_at >= ? AND s.created_at < ?
        GROUP BY s.cashier_id ORDER BY total DESC`
    )
    .all(startIso, endIso) as { name: string | null; count: number; total: number }[]

  const receivable = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN bal > 0 THEN bal ELSE 0 END), 0) AS total FROM (
         SELECT (SELECT COALESCE(SUM(total - paid),0) FROM sales s WHERE s.customer_id = c.id AND s.deleted_at IS NULL)
              - (SELECT COALESCE(SUM(amount),0) FROM customer_payments cp WHERE cp.customer_id = c.id AND cp.deleted_at IS NULL) AS bal
           FROM customers c WHERE c.deleted_at IS NULL)`
    )
    .get() as { total: number }

  const payable = db
    .prepare(
      `SELECT COALESCE(SUM(total - paid), 0) AS total FROM purchases WHERE deleted_at IS NULL`
    )
    .get() as { total: number }

  const netSales = round2(sales.netSales)
  const cogs = round2(items.cogs)
  const grossProfit = round2(netSales - cogs)

  return {
    salesCount: sales.salesCount,
    itemsSold: items.itemsSold,
    grossSales: round2(sales.grossSales),
    netSales,
    taxCollected: round2(sales.taxCollected),
    cogs,
    grossProfit,
    margin: netSales > 0 ? grossProfit / netSales : 0,
    byMethod,
    topProducts: topProducts.map((t) => ({
      name: t.name,
      qty: t.qty,
      revenue: round2(t.revenue),
      profit: round2(t.profit)
    })),
    daily: daily.map((d) => ({ date: d.date, revenue: round2(d.revenue), profit: round2(d.profit) })),
    byCategory: byCategory.map((c) => ({
      name: c.name,
      revenue: round2(c.revenue),
      profit: round2(c.profit)
    })),
    byCashier: byCashier.map((c) => ({ name: c.name, count: c.count, total: round2(c.total) })),
    receivableFromCustomers: round2(receivable.total),
    payableToSuppliers: round2(payable.total)
  }
}
