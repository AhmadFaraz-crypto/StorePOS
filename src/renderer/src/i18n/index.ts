import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ur from './ur.json'
import ar from './ar.json'
import hi from './hi.json'
import es from './es.json'
import de from './de.json'
import zh from './zh.json'

export const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'hi', label: 'हिन्दी', dir: 'ltr' },
  { code: 'es', label: 'Español', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', dir: 'ltr' },
  { code: 'zh', label: '中文', dir: 'ltr' }
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

const STORAGE_KEY = 'storepos_lang'
const RTL_LANGS: string[] = LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.code)

function initialLanguage(): LanguageCode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && LANGUAGES.some((l) => l.code === stored)) return stored as LanguageCode
  return 'en'
}

const lng = initialLanguage()

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ur: { translation: ur },
    ar: { translation: ar },
    hi: { translation: hi },
    es: { translation: es },
    de: { translation: de },
    zh: { translation: zh }
  },
  lng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

// Mirror the whole layout for right-to-left languages.
export function applyDir(code: string): void {
  document.documentElement.dir = RTL_LANGS.includes(code) ? 'rtl' : 'ltr'
  document.documentElement.lang = code
}

export function setLanguage(code: LanguageCode): void {
  i18n.changeLanguage(code)
  localStorage.setItem(STORAGE_KEY, code)
  applyDir(code)
}

applyDir(lng)

export default i18n
