/**
 * Currency Conversion Tests
 * Tests for src/lib/currency.ts — static lookup table and converter functions.
 * All tests are expected to FAIL until the implementation is written.
 */

import { describe, it, expect } from 'vitest';
import {
  convertToGbp,
  formatWithOriginal,
  SUPPORTED_CURRENCIES,
  type Currency,
} from '@/lib/currency';

// ---------------------------------------------------------------------------
// SUPPORTED_CURRENCIES constant
// ---------------------------------------------------------------------------

describe('SUPPORTED_CURRENCIES', () => {
  it('exports the three supported currencies as a tuple', () => {
    expect(SUPPORTED_CURRENCIES).toContain('GBP');
    expect(SUPPORTED_CURRENCIES).toContain('USD');
    expect(SUPPORTED_CURRENCIES).toContain('EUR');
  });

  it('has exactly 3 entries', () => {
    expect(SUPPORTED_CURRENCIES).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// convertToGbp — GBP passthrough
// ---------------------------------------------------------------------------

describe('convertToGbp — GBP passthrough', () => {
  it('returns the same amount for GBP (rate = 1.0)', () => {
    expect(convertToGbp(100, 'GBP')).toBe(100);
  });

  it('returns 0 for 0 GBP', () => {
    expect(convertToGbp(0, 'GBP')).toBe(0);
  });

  it('returns the exact amount without any rounding for GBP', () => {
    expect(convertToGbp(299.99, 'GBP')).toBeCloseTo(299.99, 2);
  });

  it('handles large GBP amounts as passthrough', () => {
    expect(convertToGbp(9999, 'GBP')).toBe(9999);
  });
});

// ---------------------------------------------------------------------------
// convertToGbp — USD conversion
// ---------------------------------------------------------------------------

describe('convertToGbp — USD conversion', () => {
  it('converts 100 USD to GBP using rate 0.79', () => {
    expect(convertToGbp(100, 'USD')).toBeCloseTo(79, 2);
  });

  it('converts 200 USD to 158 GBP', () => {
    expect(convertToGbp(200, 'USD')).toBeCloseTo(158, 2);
  });

  it('converts 350 USD correctly', () => {
    // 350 * 0.79 = 276.5
    expect(convertToGbp(350, 'USD')).toBeCloseTo(276.5, 2);
  });

  it('converts 1 USD to 0.79 GBP', () => {
    expect(convertToGbp(1, 'USD')).toBeCloseTo(0.79, 2);
  });

  it('converts 0 USD to 0 GBP', () => {
    expect(convertToGbp(0, 'USD')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// convertToGbp — EUR conversion
// ---------------------------------------------------------------------------

describe('convertToGbp — EUR conversion', () => {
  it('converts 100 EUR to GBP using rate 0.86', () => {
    expect(convertToGbp(100, 'EUR')).toBeCloseTo(86, 2);
  });

  it('converts 200 EUR to 172 GBP', () => {
    expect(convertToGbp(200, 'EUR')).toBeCloseTo(172, 2);
  });

  it('converts 250 EUR correctly', () => {
    // 250 * 0.86 = 215
    expect(convertToGbp(250, 'EUR')).toBeCloseTo(215, 2);
  });

  it('converts 1 EUR to 0.86 GBP', () => {
    expect(convertToGbp(1, 'EUR')).toBeCloseTo(0.86, 2);
  });

  it('converts 0 EUR to 0 GBP', () => {
    expect(convertToGbp(0, 'EUR')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatWithOriginal — GBP display (no original needed)
// ---------------------------------------------------------------------------

describe('formatWithOriginal — GBP', () => {
  it('returns £amount format for GBP with no conversion note', () => {
    expect(formatWithOriginal(100, 'GBP')).toBe('£100');
  });

  it('handles GBP with decimal amount', () => {
    expect(formatWithOriginal(299.50, 'GBP')).toBe('£299.50');
  });

  it('does not include ~ or parentheses for GBP', () => {
    const result = formatWithOriginal(350, 'GBP');
    expect(result).not.toContain('~');
    expect(result).not.toContain('(');
  });
});

// ---------------------------------------------------------------------------
// formatWithOriginal — USD display with GBP equivalent
// ---------------------------------------------------------------------------

describe('formatWithOriginal — USD', () => {
  it('returns $amount (~£gbpAmount) format for USD', () => {
    expect(formatWithOriginal(350, 'USD')).toBe('$350 (~£277)');
  });

  it('returns $100 (~£79) for 100 USD', () => {
    expect(formatWithOriginal(100, 'USD')).toBe('$100 (~£79)');
  });

  it('includes the ~ symbol for approximate conversion in USD', () => {
    const result = formatWithOriginal(200, 'USD');
    expect(result).toContain('~');
    expect(result).toContain('$200');
    expect(result).toContain('£');
  });

  it('rounds the GBP equivalent to a whole number for USD display', () => {
    // 350 * 0.79 = 276.5 → displays as £277 (rounded)
    const result = formatWithOriginal(350, 'USD');
    expect(result).toContain('277');
  });
});

// ---------------------------------------------------------------------------
// formatWithOriginal — EUR display with GBP equivalent
// ---------------------------------------------------------------------------

describe('formatWithOriginal — EUR', () => {
  it('returns €amount (~£gbpAmount) format for EUR', () => {
    // 200 * 0.86 = 172
    expect(formatWithOriginal(200, 'EUR')).toBe('€200 (~£172)');
  });

  it('returns €100 (~£86) for 100 EUR', () => {
    expect(formatWithOriginal(100, 'EUR')).toBe('€100 (~£86)');
  });

  it('includes the ~ symbol for approximate conversion in EUR', () => {
    const result = formatWithOriginal(150, 'EUR');
    expect(result).toContain('~');
    expect(result).toContain('€150');
    expect(result).toContain('£');
  });
});

// ---------------------------------------------------------------------------
// Type safety — Currency type is derived from SUPPORTED_CURRENCIES
// ---------------------------------------------------------------------------

describe('Currency type', () => {
  it('accepts GBP, USD, EUR as valid Currency values', () => {
    // This is a compile-time check enforced by TypeScript, but we can verify
    // runtime behaviour by calling the function with each valid value
    const currencies: Currency[] = ['GBP', 'USD', 'EUR'];
    for (const currency of currencies) {
      expect(() => convertToGbp(100, currency)).not.toThrow();
    }
  });
});
