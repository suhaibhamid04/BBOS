import { describe, expect, test } from 'bun:test';
import {
  assessLowMarginPolicy,
  buildPackageSupplierCostBreakdown,
  calculatePackageEconomics,
} from '../src/utils/packageCommercials';

describe('M4.3 package commercial costing', () => {
  test('aggregates accommodation, transport, included activities, and authoritative other services', () => {
    const breakdown = buildPackageSupplierCostBreakdown([
      { category: 'ACCOMMODATION', label: 'Kashmir hotels', amount: 42_000 },
      { category: 'TRANSPORT', label: 'Sedan × 6 days', amount: 12_000 },
      { category: 'ACTIVITIES', label: 'Included activities', amount: 4_500 },
      { category: 'OTHER', label: 'Guide service', amount: 2_500 },
    ]);
    expect(breakdown).toMatchObject({
      accommodation: { total: 42_000 }, transport: { total: 12_000 },
      activities: { total: 4_500 }, other: { total: 2_500 }, total: 61_000,
    });
    expect(JSON.stringify(breakdown)).not.toContain('inventoryId');
  });

  test('derives canonical economics for selling price, target profit, and target margin', () => {
    expect(calculatePackageEconomics(61_000, 'SELLING_PRICE', 72_000)).toMatchObject({
      totalSellingPrice: 72_000, grossProfit: 11_000, grossMargin: 15.3,
    });
    expect(calculatePackageEconomics(61_000, 'TARGET_PROFIT', 8_000)).toMatchObject({
      totalSellingPrice: 69_000, grossProfit: 8_000, grossMargin: 11.6,
    });
    expect(calculatePackageEconomics(61_000, 'TARGET_MARGIN', 15)).toMatchObject({
      totalSellingPrice: 71_765, grossProfit: 10_765, grossMargin: 15,
    });
  });

  test('uses the supplied configurable low-margin threshold without a hardcoded percentage', () => {
    expect(assessLowMarginPolicy(12, 10, '2026-10-09T00:00:00.000Z').required).toBe(false);
    expect(assessLowMarginPolicy(12, 15, '2026-10-09T00:00:00.000Z')).toMatchObject({ required: true, state: 'REVIEW_REQUIRED', thresholdPercent: 15 });
    expect(assessLowMarginPolicy(1, undefined, '2026-10-09T00:00:00.000Z')).toMatchObject({ required: false, state: 'NOT_REQUIRED' });
  });

  test('rejects invalid financial inputs', () => {
    expect(() => calculatePackageEconomics(61_000, 'SELLING_PRICE', Number.NaN)).toThrow();
    expect(() => calculatePackageEconomics(61_000, 'SELLING_PRICE', -1)).toThrow();
    expect(() => calculatePackageEconomics(61_000, 'TARGET_MARGIN', 100)).toThrow();
  });
});
