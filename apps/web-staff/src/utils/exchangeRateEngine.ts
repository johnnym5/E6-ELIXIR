export interface ExchangeRates {
  [currencyCode: string]: number; // Rate relative to NGN (e.g., CAD: 1100, GBP: 2000, USD: 1500)
}

export const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  NGN: 1,
  GBP: 2000,
  CAD: 1100,
  USD: 1500,
  EUR: 1650,
  AUD: 1000,
};

export const convertCurrency = (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): number => {
  if (!amount || isNaN(amount)) return 0;
  if (fromCurrency === toCurrency) return amount;

  // Convert to NGN baseline first
  const amountInNgn = fromCurrency === 'NGN' ? amount : amount * (rates[fromCurrency] || 1);

  // Convert from NGN to target currency
  if (toCurrency === 'NGN') return amountInNgn;
  const targetRate = rates[toCurrency] || 1;
  return amountInNgn / targetRate;
};
