import type { DealScore } from '@/types';

/**
 * Calculate the deal score from two numbers.
 * Pure function — no side effects.
 *
 * Returns null if modelPrice < 30 (guard against data anomalies).
 */
export function calculateDealScore(
  listedPriceGbp: number,
  modelPrice: number,
): DealScore | null {
  if (modelPrice < 30) {
    return null;
  }

  const diff = listedPriceGbp - modelPrice;
  const percentageDiff = parseFloat(
    (Math.abs(diff) / modelPrice * 100).toFixed(1),
  );
  const savingsGbp = parseFloat(Math.abs(diff).toFixed(2));

  if (listedPriceGbp <= modelPrice) {
    return {
      label: 'Great Deal',
      percentageDiff,
      savingsGbp,
      direction: 'saving',
    };
  }

  if (listedPriceGbp <= modelPrice * 1.10) {
    return {
      label: 'Fair Price',
      percentageDiff,
      savingsGbp,
      direction: 'overpaying',
    };
  }

  return {
    label: 'Overpriced',
    percentageDiff,
    savingsGbp,
    direction: 'overpaying',
  };
}
