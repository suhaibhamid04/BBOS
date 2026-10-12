import { describe, expect, test } from 'bun:test';
import { calculateTransportCost } from '../src/services/transportEngine';
import { calculateActivityCost } from '../src/services/activityEngine';
import type { TransportRatePeriod } from '../src/types/transport';
import type { ActivityRatePeriod } from '../src/types/activity';

const transportRate: TransportRatePeriod = {
  id: 'transport-rate', vehicleCategoryId: 'innova', supplierId: 'supplier',
  serviceType: 'MULTI_DAY_JOURNEY', pricingUnit: 'PER_DAY', baseRate: 5_000,
  currency: 'INR', validFrom: '2026-10-01', validTo: null,
  inclusions: { vehicle: 'INCLUDED', driver: 'INCLUDED', fuel: 'INCLUDED', toll: 'INCLUDED', parking: 'INCLUDED', tax: 'INCLUDED', driverAllowance: 'INCLUDED', nightHalt: 'INCLUDED', permits: 'INCLUDED' },
  availabilityStatus: 'AVAILABLE', taxTreatment: 'NET', confirmationStatus: 'CONFIRMED',
  status: 'ACTIVE', createdAt: '2026-01-01', updatedAt: '2026-01-01',
};

const activityRate = (pricingModel: ActivityRatePeriod['pricingModel'], pricingComponents: Record<string, number>): ActivityRatePeriod => ({
  id: `activity-${pricingModel}`, activityId: 'activity', supplierId: 'supplier', pricingModel,
  pricingComponents, currency: 'INR', validFrom: '2026-10-01', validTo: null,
  availabilityStatus: 'AVAILABLE', taxTreatment: 'NET', confirmationStatus: 'CONFIRMED',
  status: 'ACTIVE', createdAt: '2026-01-01', updatedAt: '2026-01-01',
});

describe('M4.2 authoritative transport costing', () => {
  test('prices one Sedan for six chargeable days at 2,000 per vehicle/day', () => {
    const result = calculateTransportCost({ ratePeriod: { ...transportRate, vehicleCategoryId: 'sedan', baseRate: 2_000 }, supplements: [], serviceParams: { vehicleCount: 1, chargeableDays: 6 } });
    expect(result.totalAmount).toBe(12_000);
  });

  test('prices two vehicles for six chargeable days at 3,500 per vehicle/day', () => {
    const result = calculateTransportCost({ ratePeriod: { ...transportRate, baseRate: 3_500 }, supplements: [], serviceParams: { vehicleCount: 2, chargeableDays: 6 } });
    expect(result.totalAmount).toBe(42_000);
  });

  test('uses vehicle count × distinct chargeable days × daily rate', () => {
    const result = calculateTransportCost({ ratePeriod: transportRate, supplements: [], serviceParams: { vehicleCount: 2, chargeableDays: 5, vehicleDays: 7 } });
    expect(result.totalAmount).toBe(50_000);
    expect(result.breakdown.baseVehicleCost).toBe(50_000);
  });

  test('does not multiply a daily rate by same-day descriptive actions', () => {
    const result = calculateTransportCost({ ratePeriod: transportRate, supplements: [], serviceParams: { vehicleCount: 1, chargeableDays: 1, occurrences: 3 } });
    expect(result.totalAmount).toBe(5_000);
  });

  test('costs different vehicle groups independently within one package', () => {
    const innova = calculateTransportCost({ ratePeriod: { ...transportRate, vehicleCategoryId: 'innova', baseRate: 3_500 }, supplements: [], serviceParams: { vehicleCount: 1, chargeableDays: 5 } });
    const tempo = calculateTransportCost({ ratePeriod: { ...transportRate, vehicleCategoryId: 'tempo', baseRate: 5_000 }, supplements: [], serviceParams: { vehicleCount: 1, chargeableDays: 1 } });
    expect(innova.totalAmount + tempo.totalAmount).toBe(22_500);
  });
});

describe('M4.2 authoritative activity pricing models', () => {
  test('supports per-person, per-child, per-group, per-unit, and flat-total pricing', () => {
    expect(calculateActivityCost({ ratePeriod: activityRate('PER_PERSON', { person: 700 }), params: { adults: 2, children: 1 } }).totalAmount).toBe(2_100);
    expect(calculateActivityCost({ ratePeriod: activityRate('PER_CHILD', { child: 400 }), params: { children: 2 } }).totalAmount).toBe(800);
    expect(calculateActivityCost({ ratePeriod: activityRate('PER_GROUP', { group: 3_000 }), params: { groups: 2 } }).totalAmount).toBe(6_000);
    expect(calculateActivityCost({ ratePeriod: activityRate('PER_UNIT', { unit: 250 }), params: { units: 4 } }).totalAmount).toBe(1_000);
    expect(calculateActivityCost({ ratePeriod: activityRate('FLAT_TOTAL', { fixed: 5_500 }), params: {} }).totalAmount).toBe(5_500);
  });
});
