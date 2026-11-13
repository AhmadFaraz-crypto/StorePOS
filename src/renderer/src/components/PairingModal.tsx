import { useTranslation } from 'react-i18next'
import type { ScannerInfo } from '../../../shared/types'

export default function PairingModal({
  info,
  connected,
  onClose
}: {
  info: ScannerInfo | null
  connected: boolean
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('pairing.title')}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {info ? (
          <>
            <div className="qr-wrap">
              <img src={info.qrDataUrl} alt="Pairing QR code" />
            </div>
            <ol className="pair-steps">
              <li>{t('pairing.step1')}</li>
              <li>{t('pairing.step2')}</li>
              <li>{t('pairing.step3')}</li>
              <li>{t('pairing.step4')}</li>
            </ol>
            <div className="pair-url">{info.url}</div>
            <div className={connected ? 'pair-status on' : 'pair-status'}>
              <span className={connected ? 'dot on' : 'dot'} />
              {connected ? t('pairing.connected') : t('pairing.waiting')}
            </div>
          </>
        ) : (
          <div className="empty">{t('pairing.unavailable')}</div>
        )}
      </div>
    </div>
  )
}
