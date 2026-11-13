import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import type { Permission } from '../../../shared/types'

interface Props {
  permission: Permission
  title: string
  onApproved: (pin: string, approver: string) => void
  onCancel: () => void
}

// Asks for a manager/owner PIN that grants `permission`. The main process does the
// real check (auth.elevate); on success the PIN is handed back so the caller can
// attach it to the privileged request, which the backend re-validates.
export default function ElevateModal({
  permission,
  title,
  onApproved,
  onCancel
}: Props): JSX.Element {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (!pin || busy) return
    setBusy(true)
    const res = await api.auth.elevate(permission, pin)
    setBusy(false)
    if (res.ok) {
      onApproved(pin, res.name ?? '')
    } else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal elevate" onClick={(e) => e.stopPropagation()}>
        <div className="elevate-icon">🔒</div>
        <h2>{title}</h2>
        <p className="elevate-body">{t('elevate.body')}</p>
        <input
          className={error ? 'elevate-pin err' : 'elevate-pin'}
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder={t('elevate.pin')}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value)
            setError(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        {error && <div className="elevate-error">{t('elevate.wrong')}</div>}
        <div className="elevate-actions">
          <button className="ghost" onClick={onCancel}>
            {t('elevate.cancel')}
          </button>
          <button className="primary" disabled={!pin || busy} onClick={() => void submit()}>
            {t('elevate.approve')}
          </button>
        </div>
      </div>
    </div>
  )
}
