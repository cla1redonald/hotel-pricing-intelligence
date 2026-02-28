/**
 * Static GBP conversion rates and converter functions.
 * Covers the 3-currency scope: GBP, USD, EUR.
 */

export const SUPPORTED_CURRENCIES = ['GBP', 'USD', 'EUR'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

// Multiply foreign amount by rate to get GBP
const TO_GBP: Record<Currency, number> = {
  GBP: 1.0,
  USD: 0.79,
  EUR: 0.86,
};

/**
 * Convert an amount in the given currency to GBP.
 */
export function convertToGbp(amount: number, currency: Currency): number {
  return amount * TO_GBP[currency];
}

/**
 * Format an amount with its currency symbol, optionally showing GBP equivalent.
 * e.g. "£350" or "$350 (~£277)"
 */
export function formatWithOriginal(amount: number, currency: Currency): string {
  if (currency === 'GBP') {
    // Show exact GBP amount (preserve decimals if present)
    const formatted = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
    return `£${formatted}`;
  }

  const symbol = currency === 'USD' ? '$' : '€';
  const gbpEquivalent = Math.round(convertToGbp(amount, currency));
  const originalAmount = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
  return `${symbol}${originalAmount} (~£${gbpEquivalent})`;
}
