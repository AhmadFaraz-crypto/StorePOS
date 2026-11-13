import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import type { User, RoleDef } from '../../../shared/types'

const BUILTIN_ROLE_LABELS: Record<string, string> = {
  owner: 'settings.roleOwner',
  manager: 'settings.roleManager',
  cashier: 'settings.roleCashier'
}

export default function Login({
  storeName,
  storeLogo,
  onLogin
}: {
  storeName: string
  storeLogo?: string | null
  onLogin: (user: User) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<RoleDef[]>([])
  const [selected, setSelected] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    api.users.list().then(setUsers)
    api.settings.getRoles().then(setRoles)
  }, [])

  const roleLabel = (key: string): string =>
    BUILTIN_ROLE_LABELS[key] ? t(BUILTIN_ROLE_LABELS[key]) : (roles.find((r) => r.key === key)?.name ?? key)

  const pick = (u: User): void => {
    if (!u.hasPin) {
      onLogin(u)
      return
    }
    setSelected(u)
    setPin('')
    setError(false)
  }

  const submit = async (): Promise<void> => {
    if (!selected) return
    const ok = await api.users.verifyPin(selected.id, pin)
    if (ok) onLogin(selected)
    else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="lock">
      <div className={selected ? 'lock-card' : 'login-card'}>
        {storeLogo && <img className="lock-logo" src={storeLogo} alt="" />}
        <div className="brand">{storeName}</div>

        {!selected ? (
          <>
            <h2>{t('lock.who')}</h2>
            <div className="user-grid">
              {users.map((u) => (
                <button key={u.id} className="user-tile" onClick={() => pick(u)}>
                  <span className="user-avatar">{u.name.slice(0, 1).toUpperCase()}</span>
                  <span className="user-tile-name">{u.name}</span>
                  <span className="user-tile-role">{roleLabel(u.role)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="lock-store">{selected.name}</div>
            <h2>{t('lock.title')}</h2>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={4}
              className={error ? 'lock-pin error' : 'lock-pin'}
              value={pin}
              onChange={(e) => {
                setError(false)
                setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pin.length === 4) submit()
              }}
            />
            {error && <div className="lock-error">{t('lock.wrong')}</div>}
            <button className="primary" disabled={pin.length !== 4} onClick={submit}>
              {t('lock.unlock')}
            </button>
            <button className="ghost login-back" onClick={() => setSelected(null)}>
              ‹ {t('lock.who')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
