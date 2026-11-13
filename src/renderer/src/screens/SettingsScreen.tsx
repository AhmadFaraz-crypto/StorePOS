import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, setCurrency, money } from '../api'
import { LANGUAGES, setLanguage, type LanguageCode } from '../i18n'
import { CURRENCIES, DEFAULT_CURRENCY } from '../currencies'
import { printReceipt } from '../receipt'
import { PERMISSIONS, OWNER_ROLE, blankPermissions } from '../../../shared/permissions'
import type {
  Category,
  TaxRate,
  Supplier,
  User,
  UserRole,
  RoleDef,
  Permission
} from '../../../shared/types'

const STORE_NAME_MAX = 40

type SectionId =
  | 'store'
  | 'language'
  | 'categories'
  | 'suppliers'
  | 'tax'
  | 'security'
  | 'users'
  | 'permissions'
  | 'receipt'
  | 'hardware'

interface SectionDef {
  id: SectionId
  icon: string
  labelKey: string
  ownerOnly?: boolean
}

const SECTIONS: SectionDef[] = [
  { id: 'store', icon: '🏪', labelKey: 'settings.storeProfile' },
  { id: 'language', icon: '🌐', labelKey: 'settings.language' },
  { id: 'categories', icon: '🏷️', labelKey: 'settings.categories' },
  { id: 'suppliers', icon: '🚚', labelKey: 'settings.suppliers' },
  { id: 'tax', icon: '🧾', labelKey: 'settings.tax' },
  { id: 'security', icon: '🔑', labelKey: 'settings.security' },
  { id: 'users', icon: '👥', labelKey: 'settings.users' },
  { id: 'permissions', icon: '🛡️', labelKey: 'settings.permissions', ownerOnly: true },
  { id: 'receipt', icon: '📄', labelKey: 'settings.receipt' },
  { id: 'hardware', icon: '🖨️', labelKey: 'settings.hardware' }
]

export default function SettingsScreen({
  onStoreUpdated,
  currentRole,
  roles,
  onRolesChanged
}: {
  onStoreUpdated: (storeName: string, logo: string | null) => void
  currentRole: UserRole
  roles: RoleDef[]
  onRolesChanged: (roles: RoleDef[]) => void
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const [storeName, setStoreName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [logo, setLogo] = useState<string | null>(null)
  const [currencyCode, setCurrencyCode] = useState(DEFAULT_CURRENCY.code)
  const [header, setHeader] = useState('')
  const [footer, setFooter] = useState('')
  const [autoPrint, setAutoPrint] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  const [newTaxName, setNewTaxName] = useState('')
  const [newTaxRate, setNewTaxRate] = useState('')
  const [taxInclusive, setTaxInclusive] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [newUserName, setNewUserName] = useState('')
  const [newUserPin, setNewUserPin] = useState('')
  const [newUserRole, setNewUserRole] = useState<UserRole>('cashier')
  const [toast, setToast] = useState<string | null>(null)
  const [active, setActive] = useState<SectionId>('store')
  const [catPage, setCatPage] = useState(1)
  const [supPage, setSupPage] = useState(1)
  // CRUD form state: which list is adding, and which row (if any) is being edited.
  const [addingCat, setAddingCat] = useState(false)
  const [editCat, setEditCat] = useState<{ id: string; name: string } | null>(null)
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [editSupplier, setEditSupplier] = useState<{ id: string; name: string; phone: string } | null>(
    null
  )
  const [addingTax, setAddingTax] = useState(false)
  const [editTax, setEditTax] = useState<{ id: string; name: string; rate: string } | null>(null)
  const [addingUser, setAddingUser] = useState(false)
  const [editUser, setEditUser] = useState<{
    id: string
    name: string
    role: UserRole
    pin: string
  } | null>(null)
  const [addingRole, setAddingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [expandedRole, setExpandedRole] = useState<string | null>(null)
  const scanTestRef = useRef<HTMLInputElement>(null)

  const navSections = SECTIONS.filter((s) => !s.ownerOnly || currentRole === 'owner')

  // Paginate the growable lists so a large catalog doesn't become an endless scroll.
  const PAGE_SIZE = 8
  const catPages = Math.max(1, Math.ceil(categories.length / PAGE_SIZE))
  const catP = Math.min(catPage, catPages)
  const catSlice = categories.slice((catP - 1) * PAGE_SIZE, catP * PAGE_SIZE)
  const supPages = Math.max(1, Math.ceil(suppliers.length / PAGE_SIZE))
  const supP = Math.min(supPage, supPages)
  const supSlice = suppliers.slice((supP - 1) * PAGE_SIZE, supP * PAGE_SIZE)

  const loadCategories = (): void => {
    api.categories.list().then(setCategories)
  }
  const loadTaxRates = (): void => {
    api.taxRates.list().then(setTaxRates)
  }
  const loadSuppliers = (): void => {
    api.suppliers.list().then(setSuppliers)
  }
  const loadUsers = (): void => {
    api.users.list().then(setUsers)
  }

  // ---- Roles CRUD ----
  // Built-in role keys show a translated name; custom roles show their stored name.
  const BUILTIN_ROLE_LABELS: Record<string, string> = {
    owner: 'settings.roleOwner',
    manager: 'settings.roleManager',
    cashier: 'settings.roleCashier'
  }
  const roleLabel = (key: string): string => {
    const r = roles.find((x) => x.key === key)
    if (BUILTIN_ROLE_LABELS[key]) return t(BUILTIN_ROLE_LABELS[key])
    return r?.name ?? key
  }

  const commitRoles = async (next: RoleDef[]): Promise<void> => {
    try {
      await api.settings.saveRoles(next)
      onRolesChanged(next)
    } catch (err) {
      const msg = String(err)
      const m = msg.match(/ROLE_IN_USE:(\S+)/)
      flash(m ? t('settings.roleInUse', { role: roleLabel(m[1]) }) : t('settings.roleSaveError'))
    }
  }

  const toggleRolePerm = (key: string, perm: Permission): void => {
    const next = roles.map((r) =>
      r.key === key ? { ...r, permissions: { ...r.permissions, [perm]: !r.permissions[perm] } } : r
    )
    void commitRoles(next)
  }

  const renameRole = (key: string, name: string): void => {
    onRolesChanged(roles.map((r) => (r.key === key ? { ...r, name } : r)))
  }
  const saveRename = (key: string): void => {
    void commitRoles(roles.map((r) => (r.key === key ? { ...r, name: r.name.trim() || key } : r)))
  }

  const addRole = (): void => {
    const name = newRoleName.trim()
    if (!name) return
    const role: RoleDef = {
      key: crypto.randomUUID(),
      name,
      system: false,
      allAccess: false,
      permissions: blankPermissions()
    }
    void commitRoles([...roles, role])
    setNewRoleName('')
    setAddingRole(false)
    setExpandedRole(role.key)
  }

  const deleteRole = (key: string): void => {
    void commitRoles(roles.filter((r) => r.key !== key))
    if (expandedRole === key) setExpandedRole(null)
  }

  useEffect(() => {
    loadCategories()
    loadTaxRates()
    loadSuppliers()
    loadUsers()
    api.settings.get().then((s) => {
      setStoreName(s.storeName)
      setAddress(s.address)
      setPhone(s.phone)
      setCurrencyCode(s.currencyCode)
      setHeader(s.receiptHeader)
      setFooter(s.receiptFooter)
      setAutoPrint(s.autoPrint)
      setTaxInclusive(s.taxInclusive)
      setLogo(s.logo)
    })
  }, [])

  const flash = (msg: string): void => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }

  const saveProfile = async (): Promise<void> => {
    if (!storeName.trim()) return
    const cur = CURRENCIES.find((c) => c.code === currencyCode) ?? DEFAULT_CURRENCY
    await api.settings.updateStoreProfile({
      storeName: storeName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      currencyCode: cur.code,
      currencySymbol: cur.symbol,
      currencyLocale: cur.locale,
      logo
    })
    setCurrency(cur.symbol, cur.locale)
    onStoreUpdated(storeName.trim(), logo)
    flash(t('settings.profileSaved'))
  }

  // Read an image file and downscale it to a small square-ish PNG data URL.
  const onLogoFile = (file: File | undefined): void => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 240
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        setLogo(canvas.toDataURL('image/png'))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const saveReceipt = async (): Promise<void> => {
    await api.settings.updateReceiptSettings({ header, footer, autoPrint })
    flash(t('settings.receiptSaved'))
  }

  const changePin = async (): Promise<void> => {
    if (!/^\d{4}$/.test(newPin)) return
    await api.auth.setPin(newPin)
    setNewPin('')
    flash(t('settings.pinUpdated'))
  }

  // ---- Categories CRUD ----
  const openAddCat = (): void => {
    setEditCat(null)
    setNewCategory('')
    setAddingCat(true)
  }
  const cancelCat = (): void => {
    setAddingCat(false)
    setEditCat(null)
    setNewCategory('')
  }
  const saveCat = async (): Promise<void> => {
    if (editCat) {
      if (!editCat.name.trim()) return
      await api.categories.upsert({ id: editCat.id, name: editCat.name.trim() })
    } else {
      if (!newCategory.trim()) return
      await api.categories.upsert({ name: newCategory.trim() })
    }
    cancelCat()
    loadCategories()
  }
  const removeCategory = async (id: string): Promise<void> => {
    await api.categories.delete(id)
    loadCategories()
  }

  // ---- Tax CRUD ----
  const openAddTax = (): void => {
    setEditTax(null)
    setNewTaxName('')
    setNewTaxRate('')
    setAddingTax(true)
  }
  const cancelTax = (): void => {
    setAddingTax(false)
    setEditTax(null)
    setNewTaxName('')
    setNewTaxRate('')
  }
  const saveTax = async (): Promise<void> => {
    const src = editTax ?? { id: '', name: newTaxName, rate: newTaxRate }
    if (!src.name.trim()) return
    const rate = (parseFloat(src.rate) || 0) / 100
    await api.taxRates.upsert(editTax ? { id: editTax.id, name: src.name.trim(), rate } : { name: src.name.trim(), rate })
    cancelTax()
    loadTaxRates()
  }
  const removeTaxRate = async (id: string): Promise<void> => {
    await api.taxRates.delete(id)
    loadTaxRates()
  }

  const toggleInclusive = async (value: boolean): Promise<void> => {
    setTaxInclusive(value)
    await api.settings.updateTaxSettings({ taxInclusive: value })
    flash(t('settings.saveProfile'))
  }

  // ---- Suppliers CRUD ----
  const openAddSupplier = (): void => {
    setEditSupplier(null)
    setNewSupplierName('')
    setNewSupplierPhone('')
    setAddingSupplier(true)
  }
  const cancelSupplier = (): void => {
    setAddingSupplier(false)
    setEditSupplier(null)
    setNewSupplierName('')
    setNewSupplierPhone('')
  }
  const saveSupplier = async (): Promise<void> => {
    const src = editSupplier ?? { id: '', name: newSupplierName, phone: newSupplierPhone }
    if (!src.name.trim()) return
    const payload = { name: src.name.trim(), phone: src.phone.trim() || null }
    await api.suppliers.upsert(editSupplier ? { id: editSupplier.id, ...payload } : payload)
    cancelSupplier()
    loadSuppliers()
  }
  const removeSupplier = async (id: string): Promise<void> => {
    await api.suppliers.delete(id)
    loadSuppliers()
  }

  // ---- Users CRUD ----
  const openAddUser = (): void => {
    setEditUser(null)
    setNewUserName('')
    setNewUserPin('')
    setNewUserRole('cashier')
    setAddingUser(true)
  }
  const openEditUser = (u: User): void => {
    setAddingUser(false)
    setEditUser({ id: u.id, name: u.name, role: u.role, pin: '' })
  }
  const cancelUser = (): void => {
    setAddingUser(false)
    setEditUser(null)
    setNewUserName('')
    setNewUserPin('')
    setNewUserRole('cashier')
  }
  const saveUser = async (): Promise<void> => {
    if (editUser) {
      if (!editUser.name.trim()) return
      // PIN optional on edit — blank keeps the existing one.
      if (editUser.pin && !/^\d{4}$/.test(editUser.pin)) return
      await api.users.save({
        id: editUser.id,
        name: editUser.name.trim(),
        role: editUser.role,
        pin: editUser.pin || undefined
      })
    } else {
      if (!newUserName.trim() || !/^\d{4}$/.test(newUserPin)) return
      await api.users.save({ name: newUserName.trim(), role: newUserRole, pin: newUserPin })
      flash(t('settings.userAdded'))
    }
    cancelUser()
    loadUsers()
  }
  const removeUser = async (id: string): Promise<void> => {
    try {
      await api.users.delete(id)
      loadUsers()
    } catch {
      flash(t('settings.cannotDeleteOwner'))
    }
  }

  const testPrint = (): void => {
    void printReceipt({
      storeName: storeName || 'StorePOS',
      logo,
      address,
      phone,
      header,
      footer,
      dateText: new Date().toLocaleString(i18n.language),
      items: [
        { name: 'Coca-Cola 500ml', qty: 2, lineTotal: 3 },
        { name: "Lay's Classic Chips", qty: 1, lineTotal: 2.49 }
      ],
      subtotal: 5.49,
      discount: 0,
      tax: 0.32,
      total: 5.81,
      paymentLabel: t('sale.cash'),
      tendered: 10,
      change: 4.19,
      labels: {
        subtotal: t('sale.subtotal'),
        discount: t('sale.discount'),
        tax: t('sale.tax'),
        total: t('sale.total'),
        change: t('sale.change')
      }
    })
  }

  return (
    <div className="settings-layout">
      <nav className="settings-nav">
        <div className="settings-nav-head">
          <h1>{t('settings.title')}</h1>
          <p>{t('settings.subtitle')}</p>
        </div>
        {navSections.map((s) => (
          <button
            key={s.id}
            className={active === s.id ? 'nav-item active' : 'nav-item'}
            onClick={() => setActive(s.id)}
          >
            <span className="nav-icon">{s.icon}</span>
            {t(s.labelKey)}
          </button>
        ))}
      </nav>

      <div className="settings-panel">
        {/* Store profile */}
        <section className="settings-card" hidden={active !== 'store'}>
          <h2 data-icon="🏪">{t('settings.storeProfile')}</h2>
        <div className="logo-field">
          <div className={logo ? 'logo-preview' : 'logo-preview empty'}>
            {logo ? <img src={logo} alt={t('settings.logo')} /> : <span>🏪</span>}
          </div>
          <div className="logo-actions">
            <span className="logo-label">{t('settings.logo')}</span>
            <div className="logo-buttons">
              <label className="ghost btn-sm logo-upload">
                {t('settings.logoUpload')}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onLogoFile(e.target.files?.[0])}
                />
              </label>
              {logo && (
                <button className="ghost btn-sm" onClick={() => setLogo(null)}>
                  {t('settings.logoRemove')}
                </button>
              )}
            </div>
            <span className="logo-hint">{t('settings.logoHint')}</span>
          </div>
        </div>
        <label>
          {t('settings.storeName')}
          <input
            maxLength={STORE_NAME_MAX}
            value={storeName}
            onChange={(e) => setStoreName(e.target.value.slice(0, STORE_NAME_MAX))}
          />
          <span className="char-count">
            {storeName.length}/{STORE_NAME_MAX}
          </span>
        </label>
        <label>
          {t('settings.address')}
          <input
            maxLength={120}
            placeholder={t('settings.optional')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label>
          {t('settings.phone')}
          <input
            maxLength={40}
            placeholder={t('settings.optional')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label>
          {t('settings.currency')}
          <select
            className="styled-select"
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.symbol}) — {c.code}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={saveProfile}>
          {t('settings.saveProfile')}
        </button>
      </section>

      {/* Language */}
      <section className="settings-card" hidden={active !== 'language'}>
        <h2 data-icon="🌐">{t('settings.language')}</h2>
        <select
          className="styled-select"
          value={i18n.language}
          onChange={(e) => setLanguage(e.target.value as LanguageCode)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </section>

      {/* Categories */}
      <section className="settings-card" hidden={active !== 'categories'}>
        <div className="card-head">
          <h2 data-icon="🏷️">{t('settings.categories')}</h2>
          <button className="crud-add" onClick={openAddCat}>+ {t('settings.add')}</button>
        </div>
        {(addingCat || editCat) && (
          <div className="crud-form">
            <input
              autoFocus
              placeholder={t('settings.categoryPlaceholder')}
              maxLength={40}
              value={editCat ? editCat.name : newCategory}
              onChange={(e) =>
                editCat ? setEditCat({ ...editCat, name: e.target.value }) : setNewCategory(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCat()
              }}
            />
            <div className="crud-form-actions">
              <button className="ghost btn-sm" onClick={cancelCat}>
                {t('settings.cancel')}
              </button>
              <button className="primary btn-sm" onClick={saveCat}>
                {t('settings.save')}
              </button>
            </div>
          </div>
        )}
        {categories.length === 0 ? (
          <div className="empty">{t('settings.emptyList')}</div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('settings.colName')}</th>
                  <th className="col-actions">{t('settings.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {catSlice.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title={t('settings.edit')}
                          onClick={() => {
                            setAddingCat(false)
                            setEditCat({ id: c.id, name: c.name })
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          className="icon-btn danger"
                          title={t('products.delete')}
                          onClick={() => removeCategory(c.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {catPages > 1 && (
              <div className="table-pager">
                <button className="ghost btn-sm" disabled={catP <= 1} onClick={() => setCatPage(catP - 1)}>
                  {t('products.prev')}
                </button>
                <span>{t('products.pageInfo', { current: catP, total: catPages })}</span>
                <button
                  className="ghost btn-sm"
                  disabled={catP >= catPages}
                  onClick={() => setCatPage(catP + 1)}
                >
                  {t('products.next')}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Distributors */}
      <section className="settings-card" hidden={active !== 'suppliers'}>
        <div className="card-head">
          <h2 data-icon="🚚">{t('settings.suppliers')}</h2>
          <button className="crud-add" onClick={openAddSupplier}>+ {t('settings.add')}</button>
        </div>
        {(addingSupplier || editSupplier) && (
          <div className="crud-form">
            <input
              autoFocus
              placeholder={t('settings.supplierName')}
              maxLength={60}
              value={editSupplier ? editSupplier.name : newSupplierName}
              onChange={(e) =>
                editSupplier
                  ? setEditSupplier({ ...editSupplier, name: e.target.value })
                  : setNewSupplierName(e.target.value)
              }
            />
            <input
              placeholder={t('settings.phone') + ' (' + t('settings.optional') + ')'}
              maxLength={40}
              value={editSupplier ? editSupplier.phone : newSupplierPhone}
              onChange={(e) =>
                editSupplier
                  ? setEditSupplier({ ...editSupplier, phone: e.target.value })
                  : setNewSupplierPhone(e.target.value)
              }
            />
            <div className="crud-form-actions">
              <button className="ghost btn-sm" onClick={cancelSupplier}>
                {t('settings.cancel')}
              </button>
              <button className="primary btn-sm" onClick={saveSupplier}>
                {t('settings.save')}
              </button>
            </div>
          </div>
        )}
        {suppliers.length === 0 ? (
          <div className="empty">{t('settings.emptyList')}</div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('settings.colName')}</th>
                  <th>{t('settings.colPhone')}</th>
                  <th className="col-num">{t('settings.colOutstanding')}</th>
                  <th className="col-actions">{t('settings.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {supSlice.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="col-muted">{s.phone || '—'}</td>
                    <td className="col-num">
                      {s.outstanding > 0.005 ? (
                        <span className="supplier-owed">{money(s.outstanding)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title={t('settings.edit')}
                          onClick={() => {
                            setAddingSupplier(false)
                            setEditSupplier({ id: s.id, name: s.name, phone: s.phone ?? '' })
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          className="icon-btn danger"
                          title={t('products.delete')}
                          onClick={() => removeSupplier(s.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {supPages > 1 && (
              <div className="table-pager">
                <button className="ghost btn-sm" disabled={supP <= 1} onClick={() => setSupPage(supP - 1)}>
                  {t('products.prev')}
                </button>
                <span>{t('products.pageInfo', { current: supP, total: supPages })}</span>
                <button
                  className="ghost btn-sm"
                  disabled={supP >= supPages}
                  onClick={() => setSupPage(supP + 1)}
                >
                  {t('products.next')}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Tax */}
      <section className="settings-card" hidden={active !== 'tax'}>
        <div className="card-head">
          <h2 data-icon="🧾">{t('settings.tax')}</h2>
          <button className="crud-add" onClick={openAddTax}>+ {t('settings.add')}</button>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={taxInclusive}
            onChange={(e) => toggleInclusive(e.target.checked)}
          />
          {t('settings.taxInclusive')}
        </label>
        {(addingTax || editTax) && (
          <div className="crud-form">
            <input
              autoFocus
              placeholder={t('settings.taxName')}
              maxLength={40}
              value={editTax ? editTax.name : newTaxName}
              onChange={(e) =>
                editTax ? setEditTax({ ...editTax, name: e.target.value }) : setNewTaxName(e.target.value)
              }
            />
            <input
              type="number"
              min={0}
              step="0.1"
              placeholder="%"
              value={editTax ? editTax.rate : newTaxRate}
              onChange={(e) =>
                editTax ? setEditTax({ ...editTax, rate: e.target.value }) : setNewTaxRate(e.target.value)
              }
            />
            <div className="crud-form-actions">
              <button className="ghost btn-sm" onClick={cancelTax}>
                {t('settings.cancel')}
              </button>
              <button className="primary btn-sm" onClick={saveTax}>
                {t('settings.save')}
              </button>
            </div>
          </div>
        )}
        <div className="cat-list">
          {taxRates.map((tr) => (
            <div key={tr.id} className="cat-row">
              <span>
                {tr.name} — {(tr.rate * 100).toFixed(tr.rate * 100 === Math.round(tr.rate * 100) ? 0 : 2)}%
              </span>
              <div className="row-actions">
                <button
                  className="icon-btn"
                  title={t('settings.edit')}
                  onClick={() => {
                    setAddingTax(false)
                    setEditTax({
                      id: tr.id,
                      name: tr.name,
                      rate: String(+(tr.rate * 100).toFixed(4))
                    })
                  }}
                >
                  ✏️
                </button>
                <button
                  className="icon-btn danger"
                  title={t('products.delete')}
                  onClick={() => removeTaxRate(tr.id)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
          {taxRates.length === 0 && <div className="empty">{t('settings.emptyList')}</div>}
        </div>
      </section>

      {/* Security */}
      <section className="settings-card" hidden={active !== 'security'}>
        <h2 data-icon="🔑">{t('settings.security')}</h2>
        <label>
          {t('settings.newPin')}
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </label>
        <button className="primary" disabled={!/^\d{4}$/.test(newPin)} onClick={changePin}>
          {t('settings.changePin')}
        </button>
      </section>

      {/* Users */}
      <section className="settings-card" hidden={active !== 'users'}>
        <div className="card-head">
          <h2 data-icon="👥">{t('settings.users')}</h2>
          <button className="crud-add" onClick={openAddUser}>+ {t('settings.add')}</button>
        </div>
        {(addingUser || editUser) && (
          <div className="crud-form">
            <input
              autoFocus
              placeholder={t('settings.userName')}
              maxLength={40}
              value={editUser ? editUser.name : newUserName}
              onChange={(e) =>
                editUser ? setEditUser({ ...editUser, name: e.target.value }) : setNewUserName(e.target.value)
              }
            />
            <div className="user-add-row">
              <select
                className="styled-select"
                value={editUser ? editUser.role : newUserRole}
                onChange={(e) =>
                  editUser
                    ? setEditUser({ ...editUser, role: e.target.value as UserRole })
                    : setNewUserRole(e.target.value as UserRole)
                }
              >
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {roleLabel(r.key)}
                  </option>
                ))}
              </select>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder={editUser ? t('settings.pinKeep') : t('settings.pin')}
                value={editUser ? editUser.pin : newUserPin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                  if (editUser) setEditUser({ ...editUser, pin: v })
                  else setNewUserPin(v)
                }}
              />
            </div>
            <div className="crud-form-actions">
              <button className="ghost btn-sm" onClick={cancelUser}>
                {t('settings.cancel')}
              </button>
              <button
                className="primary btn-sm"
                disabled={
                  editUser
                    ? !editUser.name.trim() || (!!editUser.pin && !/^\d{4}$/.test(editUser.pin))
                    : !newUserName.trim() || !/^\d{4}$/.test(newUserPin)
                }
                onClick={saveUser}
              >
                {t('settings.save')}
              </button>
            </div>
          </div>
        )}
        <div className="cat-list">
          {users.map((u) => (
            <div key={u.id} className="cat-row">
              <span className="user-row-name">
                {u.name}
                <span className={'user-role-tag role-' + u.role}>{roleLabel(u.role)}</span>
              </span>
              <div className="row-actions">
                <button
                  className="icon-btn"
                  title={t('settings.edit')}
                  onClick={() => openEditUser(u)}
                >
                  ✏️
                </button>
                {u.role !== 'owner' && (
                  <button
                    className="icon-btn danger"
                    title={t('products.delete')}
                    onClick={() => removeUser(u.id)}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Roles & permissions — owner only */}
      {currentRole === 'owner' && (
        <section className="settings-card" hidden={active !== 'permissions'}>
          <div className="card-head">
            <h2 data-icon="🛡️">{t('settings.permissions')}</h2>
            <button
              className="crud-add"
              onClick={() => {
                setNewRoleName('')
                setAddingRole(true)
              }}
            >
              + {t('settings.addRole')}
            </button>
          </div>
          <p className="perm-note">{t('settings.permissionsNote')}</p>

          {addingRole && (
            <div className="crud-form">
              <input
                autoFocus
                placeholder={t('settings.roleNamePlaceholder')}
                maxLength={30}
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addRole()
                }}
              />
              <div className="crud-form-actions">
                <button className="ghost btn-sm" onClick={() => setAddingRole(false)}>
                  {t('settings.cancel')}
                </button>
                <button className="primary btn-sm" disabled={!newRoleName.trim()} onClick={addRole}>
                  {t('settings.save')}
                </button>
              </div>
            </div>
          )}

          <div className="role-list">
            {roles.map((r) => {
              const expanded = expandedRole === r.key
              const assigned = users.filter((u) => u.role === r.key).length
              return (
                <div key={r.key} className="role-item">
                  <div className="role-head">
                    <span className="role-head-name">{roleLabel(r.key)}</span>
                    {r.allAccess && <span className="role-badge">{t('settings.allAccess')}</span>}
                    {assigned > 0 && (
                      <span className="role-assigned">{t('settings.roleUsers', { count: assigned })}</span>
                    )}
                    <div className="row-actions role-actions">
                      {!r.allAccess && (
                        <button
                          className="icon-btn"
                          title={t('settings.edit')}
                          onClick={() => setExpandedRole(expanded ? null : r.key)}
                        >
                          {expanded ? '▴' : '✏️'}
                        </button>
                      )}
                      {!r.system && (
                        <button
                          className="icon-btn danger"
                          title={t('products.delete')}
                          onClick={() => deleteRole(r.key)}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                  {expanded && !r.allAccess && (
                    <div className="role-editor">
                      {!BUILTIN_ROLE_LABELS[r.key] && (
                        <input
                          className="role-rename"
                          value={r.name}
                          maxLength={30}
                          placeholder={t('settings.roleNamePlaceholder')}
                          onChange={(e) => renameRole(r.key, e.target.value)}
                          onBlur={() => saveRename(r.key)}
                        />
                      )}
                      <div className="role-perms">
                        {PERMISSIONS.map((perm) => (
                          <label key={perm} className="perm-toggle-row">
                            <span>{t('settings.perm.' + perm)}</span>
                            <span className="perm-toggle">
                              <input
                                type="checkbox"
                                checked={r.permissions[perm]}
                                onChange={() => toggleRolePerm(r.key, perm)}
                              />
                              <span className="perm-switch" />
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="perm-note perm-owner-note">{t('settings.permissionsOwner')}</p>
        </section>
      )}

      {/* Receipt */}
      <section className="settings-card" hidden={active !== 'receipt'}>
        <h2 data-icon="📄">{t('settings.receipt')}</h2>
        <label>
          {t('settings.receiptHeader')}
          <input
            maxLength={200}
            placeholder={t('settings.headerPlaceholder')}
            value={header}
            onChange={(e) => setHeader(e.target.value)}
          />
        </label>
        <label>
          {t('settings.receiptFooter')}
          <input
            maxLength={200}
            placeholder={t('settings.footerPlaceholder')}
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoPrint}
            onChange={(e) => setAutoPrint(e.target.checked)}
          />
          {t('settings.autoPrint')}
        </label>
        <div className="settings-actions">
          <button className="primary" onClick={saveReceipt}>
            {t('settings.saveProfile')}
          </button>
          <button className="ghost" onClick={testPrint}>
            {t('settings.testPrint')}
          </button>
        </div>
      </section>

      {/* Scanner & hardware */}
      <section className="settings-card" hidden={active !== 'hardware'}>
        <h2 data-icon="🖨️">{t('settings.hardware')}</h2>
        <p className="settings-note">{t('settings.hardwareInfo')}</p>
        <input
          ref={scanTestRef}
          className="scan-test"
          placeholder={t('settings.scanTestPlaceholder')}
        />
      </section>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
