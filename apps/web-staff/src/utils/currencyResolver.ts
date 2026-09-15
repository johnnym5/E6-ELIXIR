/**
 * Dynamic Target Country Currency Resolver
 * Maps study destinations to their respective currency codes and symbols.
 */

interface CurrencyInfo {
  code: string;
  symbol: string;
}

const COUNTRY_MAP: Record<string, CurrencyInfo> = {
  'canada': { code: 'CAD', symbol: 'C$' },
  'united states': { code: 'USD', symbol: '$' },
  'usa': { code: 'USD', symbol: '$' },
  'us': { code: 'USD', symbol: '$' },
  'united kingdom': { code: 'GBP', symbol: '£' },
  'uk': { code: 'GBP', symbol: '£' },
  'england': { code: 'GBP', symbol: '£' },
  'germany': { code: 'EUR', symbol: '€' },
  'france': { code: 'EUR', symbol: '€' },
  'europe': { code: 'EUR', symbol: '€' },
  'ireland': { code: 'EUR', symbol: '€' },
  'australia': { code: 'AUD', symbol: 'A$' },
  'nigeria': { code: 'NGN', symbol: '₦' },
};

export const getCurrencyInfo = (country?: string): CurrencyInfo => {
  if (!country) return { code: 'GBP', symbol: '£' };
  const normalized = country.trim().toLowerCase();
  return COUNTRY_MAP[normalized] || { code: 'GBP', symbol: '£' };
};

export const getCurrencySymbol = (country?: string): string => {
  return getCurrencyInfo(country).symbol;
};

export const getCurrencyCode = (country?: string): string => {
  return getCurrencyInfo(country).code;
};

/**
 * userRole === 'ADMIN' specific resolver
 */
export const resolveCountryCurrency = (country?: string): string => {
  switch (country?.trim().toLowerCase()) {
    case 'canada': return 'CAD';
    case 'united states': case 'usa': return 'USD';
    case 'united kingdom': case 'uk': return 'GBP';
    case 'europe': case 'germany': case 'france': return 'EUR';
    case 'australia': return 'AUD';
    default: return 'NGN';
  }
};
