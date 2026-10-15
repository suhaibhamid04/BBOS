import { describe, expect, test } from 'bun:test';
import type { ItineraryDay } from '../../src/types';
import {
  composeDetailedCustomerItinerary,
  deriveCustomerItineraryFacts,
  itineraryContentFingerprint,
  validateItineraryDayOrder,
} from '../../src/services/itinerary/customerItinerary';
import { buildCustomerPackageProjection } from '../../src/services/quote/customerPackage';

const day = (overrides: Partial<ItineraryDay> = {}): ItineraryDay => ({
  id: 'day-1', tripId: 'trip-1', dayNumber: 1, date: '2026-10-01',
  title: 'Operational title', description: 'Existing customer copy', location: 'Srinagar', items: [],
  ...overrides,
});

describe('M4.4 deterministic customer itinerary composition', () => {
  test('composes an arrival day only from structured route, stay, activity, and MAP facts', () => {
    const source = day({ items: [
      { id: 'transport', dayId: 'day-1', type: 'TRANSPORT', title: 'Transfer', description: 'Arrival transfer', supplierCost: 9_999, metadata: { serviceType: 'AIRPORT_PICKUP', routeName: 'Srinagar Airport → Nigeen Lake', vehicleName: 'Innova' } },
      { id: 'hotel', dayId: 'day-1', type: 'HOTEL', title: 'Stay', description: 'Lake stay', metadata: { propertyName: 'Nigeen Houseboat', roomCategoryName: 'Cedar Suite', mealPlan: 'MAP' } },
      { id: 'included', dayId: 'day-1', type: 'ACTIVITY', title: 'Ride', description: 'Lake cruise', metadata: { activityName: 'Shikara Ride', inclusionStatus: 'INCLUDED' } },
      { id: 'optional', dayId: 'day-1', type: 'ACTIVITY', title: 'Pony', description: 'Local option', metadata: { activityName: 'Pony Ride', inclusionStatus: 'OPTIONAL' } },
      { id: 'excluded', dayId: 'day-1', type: 'ACTIVITY', title: 'Ski', description: 'Not in price', metadata: { activityName: 'Ski Equipment', inclusionStatus: 'NOT_INCLUDED' } },
    ] });
    const composed = composeDetailedCustomerItinerary(source);
    expect(composed.title).toContain('Arrival');
    expect(composed.description).toContain('Shikara Ride');
    expect(composed.description).toContain('additional charge');
    expect(composed.description).toContain('Not included');
    expect(composed.facts.meals).toEqual(['Breakfast', 'Dinner']);
    expect(composed.description).not.toContain('9999');
  });

  test('uses authoritative Gulmarg and Pahalgam route facts without inventing services', () => {
    const gulmarg = composeDetailedCustomerItinerary(day({ location: 'Gulmarg', items: [{ id: 't1', dayId: 'day-1', type: 'TRANSPORT', title: 'SUV', description: 'Route', metadata: { routeName: 'Srinagar to Gulmarg' } }] }));
    const pahalgam = composeDetailedCustomerItinerary(day({ location: 'Pahalgam', items: [{ id: 't2', dayId: 'day-1', type: 'TRANSPORT', title: 'SUV', description: 'Route', metadata: { routeName: 'Gulmarg to Pahalgam' } }] }));
    expect(gulmarg.description).toContain('Srinagar to Gulmarg');
    expect(pahalgam.description).toContain('Gulmarg to Pahalgam');
    expect(`${gulmarg.description} ${pahalgam.description}`).not.toContain('Gondola');
  });

  test('meal wording follows meal plan and EP never implies breakfast', () => {
    const facts = (mealPlan: string) => deriveCustomerItineraryFacts(day({ items: [{ id: mealPlan, dayId: 'day-1', type: 'HOTEL', title: 'Hotel', description: 'Stay', metadata: { mealPlan } }] })).meals;
    expect(facts('EP')).toEqual([]);
    expect(facts('CP')).toEqual(['Breakfast']);
    expect(facts('MAP')).toEqual(['Breakfast', 'Dinner']);
    expect(facts('AP')).toEqual(['Breakfast', 'Lunch', 'Dinner']);
  });

  test('fingerprint follows customer facts but ignores costing fields', () => {
    const source = day({ items: [{ id: 'hotel', dayId: 'day-1', type: 'HOTEL', title: 'Hotel', description: 'Stay', supplierCost: 1_000, metadata: { propertyName: 'Hotel', mealPlan: 'CP', packageSupplierRate: { amount: 1_000 } } }] });
    const rateChange = { ...source, items: [{ ...source.items[0], supplierCost: 2_000, metadata: { ...source.items[0].metadata, packageSupplierRate: { amount: 2_000 } } }] };
    expect(itineraryContentFingerprint(rateChange)).toBe(itineraryContentFingerprint(source));
    expect(itineraryContentFingerprint({ ...source, location: 'Gulmarg' })).not.toBe(itineraryContentFingerprint(source));
  });

  test('customer projection is ordered, detailed, and excludes supplier/internal data', () => {
    const source = day({ description: 'A detailed Kashmir day.', items: [{ id: 'hotel', dayId: 'day-1', type: 'HOTEL', title: 'Hotel', description: 'Stay', supplierCost: 9_999, notes: 'internal', metadata: { propertyName: 'Valley Hotel', roomCategoryName: 'Deluxe', mealPlan: 'CP', supplierId: 'secret' } }] });
    const projection = buildCustomerPackageProjection({ id: 'quote-1', customerName: 'Guest', destination: 'Kashmir', travelerCount: 2, finalAmount: 50_000 }, [source], null);
    expect(projection.itinerary[0]).toMatchObject({ description: 'A detailed Kashmir day.', meals: ['Breakfast'] });
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('supplierCost');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('internal');
  });

  test('rejects duplicate day numbers and date order conflicts', () => {
    expect(() => validateItineraryDayOrder([day(), day({ id: 'day-2' })])).toThrow('unique');
    expect(() => validateItineraryDayOrder([day({ date: '2026-10-02' }), day({ id: 'day-2', dayNumber: 2, date: '2026-10-01' })])).toThrow('dates');
  });
});
