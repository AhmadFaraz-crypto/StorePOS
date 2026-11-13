import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'

export default function Lock({
  storeName,
  onUnlock
}: {
  storeName: string
  onUnlock: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const submit = async (): Promise<void> => {
    const ok = await api.auth.checkPin(pin)
    if (ok) {
      onUnlock()
    } else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="lock">
      <div className="lock-card">
        <div className="brand">StorePOS</div>
        <div className="lock-store">{storeName}</div>
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
      </div>
    </div>
  )
}
