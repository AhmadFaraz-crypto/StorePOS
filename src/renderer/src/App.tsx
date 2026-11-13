import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SaleScreen from './screens/SaleScreen'
import ProductsScreen from './screens/ProductsScreen'
import ReportsScreen from './screens/ReportsScreen'
import ReturnsScreen from './screens/ReturnsScreen'
import PurchasesScreen from './screens/PurchasesScreen'
import CustomersScreen from './screens/CustomersScreen'
import SettingsScreen from './screens/SettingsScreen'
import PairingModal from './components/PairingModal'
import ShiftModal from './components/ShiftModal'
import Onboarding from './components/Onboarding'
import Login from './components/Login'
import { ScannerProvider, type ScanHandler, type ScannerContextValue } from './ScannerContext'
import { api, setCurrency } from './api'
import { roleCan, DEFAULT_ROLES, tabPermission } from '../../shared/permissions'
import type { ScannerInfo, User, RoleDef } from '../../shared/types'

type Tab = 'sale' | 'products' | 'purchases' | 'reports' | 'returns' | 'customers' | 'settings'
type Phase = 'loading' | 'onboarding' | 'login' | 'ready'

const TABS: Tab[] = ['sale', 'products', 'purchases', 'reports', 'returns', 'customers', 'settings']

export default function App(): JSX.Element {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('loading')
  const [storeName, setStoreName] = useState('StorePOS')
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<RoleDef[]>(DEFAULT_ROLES)
  const [tab, setTab] = useState<Tab>('sale')
  const [storeLogo, setStoreLogo] = useState<string | null>(null)
  const [scannerInfo, setScannerInfo] = useState<ScannerInfo | null>(null)
  const [phoneConnected, setPhoneConnected] = useState(false)
  const [showPairing, setShowPairing] = useState(false)
  const [showShift, setShowShift] = useState(false)
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null)
  const [pendingCreditCustomer, setPendingCreditCustomer] = useState<string | null>(null)
  const scanHandlerRef = useRef<ScanHandler | null>(null)
  const prevConnected = useRef(false)

  useEffect(() => {
    api.settings.get().then((s) => {
      setCurrency(s.currencySymbol, s.currencyLocale)
      setStoreName(s.storeName)
      setStoreLogo(s.logo)
      if (!s.onboarded) setPhase('onboarding')
      else setPhase('login')
    })
  }, [])

  useEffect(() => {
    if (phase !== 'ready') return
    api.scanner.info().then(setScannerInfo)
    const offScan = api.scanner.onScan((code) => scanHandlerRef.current?.(code))
    const offStatus = api.scanner.onStatus(setPhoneConnected)
    return () => {
      offScan()
      offStatus()
    }
  }, [phase])

  useEffect(() => {
    if (!prevConnected.current && phoneConnected && showPairing) {
      const id = window.setTimeout(() => setShowPairing(false), 900)
      prevConnected.current = phoneConnected
      return () => window.clearTimeout(id)
    }
    prevConnected.current = phoneConnected
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneConnected])

  const lock = (): void => {
    void api.session.setUser(null)
    setUser(null)
    setPhase('login')
  }

  if (phase === 'loading') return <div className="splash">StorePOS</div>

  if (phase === 'onboarding') {
    return (
      <Onboarding
        onComplete={async (payload) => {
          await api.settings.saveOnboarding(payload)
          setCurrency(payload.currencySymbol, payload.currencyLocale)
          setStoreName(payload.storeName)
          setPhase('login')
        }}
      />
    )
  }

  if (phase === 'login' || !user) {
    return (
      <Login
        storeName={storeName}
        storeLogo={storeLogo}
        onLogin={async (u) => {
          await api.session.setUser(u.id)
          const r = await api.settings.getRoles()
          setRoles(r)
          setUser(u)
          setTab('sale')
          setPhase('ready')
        }}
      />
    )
  }

  const visibleTabs = TABS.filter((tb) => {
    const perm = tabPermission(tb)
    return !perm || roleCan(user.role, perm, roles)
  })
  const canDiscount = roleCan(user.role, 'discount', roles)
  const canRefund = roleCan(user.role, 'refund', roles)

  const ctx: ScannerContextValue = {
    phoneConnected,
    scannerInfo,
    openPairing: () => setShowPairing(true),
    setScanHandler: (fn) => {
      scanHandlerRef.current = fn
    },
    requestAddProduct: (barcode) => {
      setPendingBarcode(barcode)
      setTab('products')
    },
    pendingBarcode,
    consumePendingBarcode: () => setPendingBarcode(null),
    startCreditSale: (customerId) => {
      setPendingCreditCustomer(customerId)
      setTab('sale')
    },
    pendingCreditCustomer,
    consumePendingCreditCustomer: () => setPendingCreditCustomer(null)
  }

  return (
    <ScannerProvider value={ctx}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            {storeLogo && <img className="brand-logo" src={storeLogo} alt="" />}
            {storeName}
          </div>
          <nav className="tabs">
            {visibleTabs.map((key) => (
              <button
                key={key}
                className={tab === key ? 'tab active' : 'tab'}
                onClick={() => setTab(key)}
              >
                {t(`app.${key}`)}
              </button>
            ))}
          </nav>
          <div className="header-right">
            <button className="phone-btn" onClick={() => setShowShift(true)}>
              {t('shift.button')}
            </button>
            <button className="phone-btn" onClick={() => setShowPairing(true)}>
              <span className={phoneConnected ? 'dot on' : 'dot'} />
              {phoneConnected ? t('app.phoneConnected') : t('app.connectPhone')}
            </button>
            <button className="phone-btn" onClick={lock} title={t('app.lock')}>
              {user.name} · {t('app.lock')}
            </button>
          </div>
        </header>
        <main
          className={
            tab === 'settings' || tab === 'reports' ? 'content content-flush' : 'content'
          }
        >
          {tab === 'sale' && <SaleScreen cashierId={user.id} canDiscount={canDiscount} />}
          {tab === 'products' && <ProductsScreen />}
          {tab === 'purchases' && <PurchasesScreen />}
          {tab === 'reports' && <ReportsScreen />}
          {tab === 'returns' && <ReturnsScreen canRefund={canRefund} />}
          {tab === 'customers' && <CustomersScreen />}
          {tab === 'settings' && (
            <SettingsScreen
              onStoreUpdated={(name, logo) => {
                setStoreName(name)
                setStoreLogo(logo)
              }}
              currentRole={user.role}
              roles={roles}
              onRolesChanged={setRoles}
            />
          )}
        </main>
        {showPairing && (
          <PairingModal
            info={scannerInfo}
            connected={phoneConnected}
            onClose={() => setShowPairing(false)}
          />
        )}
        {showShift && <ShiftModal userId={user.id} onClose={() => setShowShift(false)} />}
      </div>
    </ScannerProvider>
  )
}
