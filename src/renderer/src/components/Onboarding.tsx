import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage, type LanguageCode } from '../i18n'
import { CURRENCIES, DEFAULT_CURRENCY } from '../currencies'
import type { OnboardingPayload } from '../../../shared/types'

const STORE_NAME_MAX = 40

export default function Onboarding({
  onComplete
}: {
  onComplete: (payload: OnboardingPayload) => void
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const [step, setStep] = useState(1)
  const [storeName, setStoreName] = useState('')
  const [currencyCode, setCurrencyCode] = useState(DEFAULT_CURRENCY.code)
  const [ownerName, setOwnerName] = useState('')
  const [pin, setPin] = useState('')

  const pinValid = /^\d{4}$/.test(pin)
  const canFinish = storeName.trim().length > 0 && pinValid

  const finish = (): void => {
    const cur = CURRENCIES.find((c) => c.code === currencyCode) ?? DEFAULT_CURRENCY
    onComplete({
      storeName: storeName.trim(),
      currencyCode: cur.code,
      currencySymbol: cur.symbol,
      currencyLocale: cur.locale,
      ownerName: ownerName.trim() || 'Owner',
      pin
    })
  }

  return (
    <div className="onboarding">
      <div className="onboard-card">
        <div className="onboard-head">
          <div className="brand">StorePOS</div>
          <span className="onboard-step">{t('onboarding.step', { current: step, total: 2 })}</span>
        </div>

        {step === 1 && (
          <>
            <h1>{t('onboarding.welcome')}</h1>
            <p className="onboard-sub">{t('onboarding.subtitle')}</p>
            <h2>{t('onboarding.chooseLanguage')}</h2>
            <div className="lang-grid">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  className={i18n.language === l.code ? 'lang-tile active' : 'lang-tile'}
                  onClick={() => setLanguage(l.code as LanguageCode)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div className="onboard-actions">
              <button className="primary" onClick={() => setStep(2)}>
                {t('onboarding.next')}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>{t('onboarding.storeDetails')}</h1>
            <label>
              {t('onboarding.storeName')}
              <input
                autoFocus
                maxLength={STORE_NAME_MAX}
                placeholder={t('onboarding.storeNamePlaceholder')}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value.slice(0, STORE_NAME_MAX))}
              />
              <span className="char-count">
                {storeName.length}/{STORE_NAME_MAX}
              </span>
            </label>
            <label>
              {t('onboarding.currency')}
              <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.symbol}) — {c.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('onboarding.ownerName')}
              <input
                placeholder={t('onboarding.ownerNamePlaceholder')}
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </label>
            <label>
              {t('onboarding.pin')}
              <input
                inputMode="numeric"
                maxLength={4}
                placeholder={t('onboarding.pinPlaceholder')}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              <span className="onboard-hint">{t('onboarding.pinHint')}</span>
            </label>
            <div className="onboard-actions">
              <button className="ghost" onClick={() => setStep(1)}>
                {t('onboarding.back')}
              </button>
              <button className="primary" disabled={!canFinish} onClick={finish}>
                {t('onboarding.finish')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
