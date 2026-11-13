// Currency presets offered during onboarding. `symbol` is what we prefix to
// amounts; `locale` controls digit grouping / decimal separators.
export interface Currency {
  code: string
  symbol: string
  locale: string
  name: string
}

export const CURRENCIES: Currency[] = [
  { code: 'PKR', symbol: 'Rs', locale: 'en-PK', name: 'Pakistani Rupee' },
  { code: 'USD', symbol: '$', locale: 'en-US', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', locale: 'de-DE', name: 'Euro' },
  { code: 'GBP', symbol: '£', locale: 'en-GB', name: 'British Pound' },
  { code: 'INR', symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
  { code: 'SAR', symbol: '﷼', locale: 'ar-SA', name: 'Saudi Riyal' },
  { code: 'AED', symbol: 'د.إ', locale: 'ar-AE', name: 'UAE Dirham' },
  { code: 'CNY', symbol: '¥', locale: 'zh-CN', name: 'Chinese Yuan' },
  { code: 'TRY', symbol: '₺', locale: 'tr-TR', name: 'Turkish Lira' },
  { code: 'NGN', symbol: '₦', locale: 'en-NG', name: 'Nigerian Naira' },
  { code: 'BDT', symbol: '৳', locale: 'bn-BD', name: 'Bangladeshi Taka' }
]

export const DEFAULT_CURRENCY = CURRENCIES[0]
