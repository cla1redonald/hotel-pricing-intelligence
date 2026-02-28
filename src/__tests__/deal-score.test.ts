/**
 * Deal Score Tests
 * Tests for src/lib/deal-score.ts — pure function, no mocks required.
 * All tests are expected to FAIL until the implementation is written.
 */

import { describe, it, expect } from 'vitest';
import { calculateDealScore } from '@/lib/deal-score';
import type { DealScore } from '@/types';

// ---------------------------------------------------------------------------
// Great Deal category
// ---------------------------------------------------------------------------

describe('calculateDealScore — Great Deal', () => {
  it('returns Great Deal when listed price equals model price (at boundary)', () => {
    const result: DealScore | null = calculateDealScore(100, 100);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Great Deal');
    expect(result!.direction).toBe('saving');
    expect(result!.percentageDiff).toBeCloseTo(0, 1);
    expect(result!.savingsGbp).toBeCloseTo(0, 2);
  });

  it('returns Great Deal when listed price is below model price', () => {
    const result = calculateDealScore(100, 110);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Great Deal');
    expect(result!.direction).toBe('saving');
  });

  it('returns Great Deal when listed price is significantly below model price', () => {
    const result = calculateDealScore(150, 300);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Great Deal');
    expect(result!.direction).toBe('saving');
  });

  it('returns Great Deal when listed price is zero (extreme lower bound)', () => {
    const result = calculateDealScore(0, 100);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Great Deal');
    expect(result!.direction).toBe('saving');
  });

  it('calculates correct percentageDiff for Great Deal (100 listed, 200 model = 50% diff)', () => {
    const result = calculateDealScore(100, 200);
    expect(result).not.toBeNull();
    expect(result!.percentageDiff).toBeCloseTo(50.0, 1);
    expect(result!.savingsGbp).toBeCloseTo(100.0, 2);
    expect(result!.direction).toBe('saving');
  });

  it('percentageDiff is always positive for Great Deal', () => {
    const result = calculateDealScore(80, 100);
    expect(result).not.toBeNull();
    expect(result!.percentageDiff).toBeGreaterThan(0);
  });

  it('savingsGbp is always positive for Great Deal', () => {
    const result = calculateDealScore(80, 100);
    expect(result).not.toBeNull();
    expect(result!.savingsGbp).toBeGreaterThan(0);
    expect(result!.savingsGbp).toBeCloseTo(20, 2);
  });

  it('rounds percentageDiff to 1 decimal place', () => {
    // 90/100 = 10% diff exactly
    const result = calculateDealScore(90, 100);
    expect(result).not.toBeNull();
    const str = result!.percentageDiff.toString();
    const decimals = str.includes('.') ? str.split('.')[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(1);
  });

  it('rounds savingsGbp to 2 decimal places', () => {
    // Use a value that would produce a repeating decimal
    const result = calculateDealScore(100, 103);
    expect(result).not.toBeNull();
    const str = result!.savingsGbp.toString();
    const decimals = str.includes('.') ? str.split('.')[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Fair Price category
// ---------------------------------------------------------------------------

describe('calculateDealScore — Fair Price', () => {
  it('returns Fair Price when listed price is exactly 10% above model (boundary)', () => {
    // 10% above 100 = 110 → Fair Price threshold is <= modelPrice * 1.10
    const result: DealScore | null = calculateDealScore(110, 100);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Fair Price');
    expect(result!.direction).toBe('overpaying');
    expect(result!.percentageDiff).toBeCloseTo(10.0, 1);
    expect(result!.savingsGbp).toBeCloseTo(10.0, 2);
  });

  it('returns Fair Price when listed price is 5% above model', () => {
    const result = calculateDealScore(105, 100);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Fair Price');
    expect(result!.direction).toBe('overpaying');
  });

  it('returns Fair Price when listed price is 1% above model (just above Great Deal boundary)', () => {
    const result = calculateDealScore(101, 100);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Fair Price');
    expect(result!.direction).toBe('overpaying');
  });

  it('returns Fair Price for listed 110 vs model 100 — exactly at upper threshold', () => {
    const result = calculateDealScore(110, 100);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Fair Price');
    // NOT Overpriced at exactly 10%
    expect(result!.label).not.toBe('Overpriced');
  });

  it('savingsGbp reflects absolute difference for Fair Price', () => {
    const result = calculateDealScore(105, 100);
    expect(result).not.toBeNull();
    expect(result!.savingsGbp).toBeCloseTo(5.0, 2);
    expect(result!.savingsGbp).toBeGreaterThan(0);
  });

  it('percentageDiff is always positive for Fair Price', () => {
    const result = calculateDealScore(108, 100);
    expect(result).not.toBeNull();
    expect(result!.percentageDiff).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Overpriced category
// ---------------------------------------------------------------------------

describe('calculateDealScore — Overpriced', () => {
  it('returns Overpriced when listed price is just above 10% threshold', () => {
    // 11% above model: 111 vs 100
    const result: DealScore | null = calculateDealScore(111, 100);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Overpriced');
    expect(result!.direction).toBe('overpaying');
    expect(result!.percentageDiff).toBeCloseTo(11.0, 1);
  });

  it('returns Overpriced for listed 200 vs model 100 (100% overpriced)', () => {
    const result = calculateDealScore(200, 100);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Overpriced');
    expect(result!.direction).toBe('overpaying');
    expect(result!.percentageDiff).toBeCloseTo(100.0, 1);
    expect(result!.savingsGbp).toBeCloseTo(100.0, 2);
  });

  it('returns Overpriced and savingsGbp equals the difference', () => {
    const result = calculateDealScore(150, 100);
    expect(result).not.toBeNull();
    expect(result!.savingsGbp).toBeCloseTo(50.0, 2);
  });

  it('percentageDiff is always positive for Overpriced', () => {
    const result = calculateDealScore(120, 100);
    expect(result).not.toBeNull();
    expect(result!.percentageDiff).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// modelPrice < 30 guard
// ---------------------------------------------------------------------------

describe('calculateDealScore — modelPrice guard', () => {
  it('returns null when modelPrice is below 30', () => {
    expect(calculateDealScore(200, 20)).toBeNull();
  });

  it('returns null when modelPrice is 0', () => {
    expect(calculateDealScore(100, 0)).toBeNull();
  });

  it('returns null when modelPrice is 29 (just under threshold)', () => {
    expect(calculateDealScore(50, 29)).toBeNull();
  });

  it('returns a valid DealScore when modelPrice is exactly 30', () => {
    // 30 is NOT below the threshold — should process normally
    const result = calculateDealScore(30, 30);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Great Deal');
  });

  it('returns a valid DealScore when modelPrice is above 30', () => {
    const result = calculateDealScore(100, 100);
    expect(result).not.toBeNull();
  });

  it('returns null when modelPrice is negative', () => {
    expect(calculateDealScore(100, -5)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Boundary conditions between categories
// ---------------------------------------------------------------------------

describe('calculateDealScore — boundary conditions', () => {
  it('listed === model → Great Deal (not Fair Price)', () => {
    const result = calculateDealScore(250, 250);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Great Deal');
  });

  it('listed = modelPrice * 1.10 exactly → Fair Price (not Overpriced)', () => {
    const model = 200;
    const listed = model * 1.10; // 220
    const result = calculateDealScore(listed, model);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Fair Price');
    expect(result!.label).not.toBe('Overpriced');
  });

  it('listed just above modelPrice * 1.10 → Overpriced', () => {
    const model = 200;
    const listed = model * 1.10 + 0.01; // 220.01
    const result = calculateDealScore(listed, model);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Overpriced');
  });

  it('direction is saving for Great Deal and overpaying for others', () => {
    const greatDeal = calculateDealScore(80, 100);
    expect(greatDeal!.direction).toBe('saving');

    const fairPrice = calculateDealScore(105, 100);
    expect(fairPrice!.direction).toBe('overpaying');

    const overpriced = calculateDealScore(120, 100);
    expect(overpriced!.direction).toBe('overpaying');
  });
});

// ---------------------------------------------------------------------------
// Percentage and savings calculation accuracy
// ---------------------------------------------------------------------------

describe('calculateDealScore — percentage and savings math', () => {
  it('percentageDiff = |listed - model| / model * 100, rounded to 1dp', () => {
    // (120 - 100) / 100 * 100 = 20%
    const result = calculateDealScore(120, 100);
    expect(result!.percentageDiff).toBeCloseTo(20.0, 1);
  });

  it('savingsGbp = |listed - model|, rounded to 2dp', () => {
    const result = calculateDealScore(120, 100);
    expect(result!.savingsGbp).toBeCloseTo(20.0, 2);
  });

  it('percentageDiff is based on model price (not listed price)', () => {
    // 150 listed, 100 model → 50% diff (50/100), NOT 33% (50/150)
    const result = calculateDealScore(150, 100);
    expect(result!.percentageDiff).toBeCloseTo(50.0, 1);
  });

  it('savingsGbp is symmetric regardless of which direction', () => {
    const overpaying = calculateDealScore(150, 100);
    const saving = calculateDealScore(100, 150);
    expect(overpaying!.savingsGbp).toBeCloseTo(saving!.savingsGbp, 2);
  });

  it('handles real-world price values accurately', () => {
    // Listed: £349, Model: £298
    const result = calculateDealScore(349, 298);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('Overpriced');
    // (349 - 298) / 298 * 100 = 17.1%
    expect(result!.percentageDiff).toBeCloseTo(17.1, 1);
    expect(result!.savingsGbp).toBeCloseTo(51.0, 2);
  });
});
