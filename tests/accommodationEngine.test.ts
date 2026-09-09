import { expect, test, describe } from 'bun:test';
import { validateOccupancy, calculateStayTotal } from '../src/services/accommodationEngine';
import { RoomCategory, RatePeriod } from '../src/types';

describe('AccommodationEngine', () => {
  const mockRoom: RoomCategory = {
    id: 'room-1',
    propertyId: 'prop-1',
    name: 'Deluxe Room',
    maxAdults: 2,
    maxChildren: 1,
    active: true
  };

  const mockRates: RatePeriod[] = [{
    id: 'rate-1',
    propertyId: 'prop-1',
    roomCategoryId: 'room-1',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    baseRate: 5000,
    currency: 'INR',
    mealPlan: 'MAP',
    taxTreatment: 'INCLUSIVE',
    status: 'ACTIVE',
    confirmationStatus: 'CONFIRMED',
    supplements: []
  }];

  test('Validates occupancy correctly (Success)', () => {
    const result = validateOccupancy(mockRoom, 2, 0, 0, 0, []);
    expect(result.valid).toBe(true);
    expect(result.ebRequired).toBe(false); // Base takes 2A
  });

  test('Validates occupancy correctly (Extra Bed Required)', () => {
    // Room max is 2, pass 3 adults and provide an EB supplement
    const result = validateOccupancy(mockRoom, 3, 0, 0, 0, [{ id: 'eb1', propertyId: 'prop-1', type: 'EB', name: 'Extra Bed', amount: 1000, unit: 'PER_NIGHT_PER_PERSON' }]);
    expect(result.valid).toBe(true);
    expect(result.ebRequired).toBe(true); // Base is 2, third adult needs EB
  });

  test('Rejects over-occupancy', () => {
    // Room max is 2, pass 3 adults without EB supplement
    const result = validateOccupancy(mockRoom, 3, 0, 0, 0, []);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Extra bed supplement not available');
  });

  test('Calculates basic rate without supplements', () => {
    const result = calculateStayTotal(
      mockRoom,
      mockRates,
      'prop-1',
      '2026-05-10',
      2, // nights
      2, // adults
      0, // children
      0,
      0,
      'MAP'
    );

    expect(result.available).toBe(true);
    expect(result.nights).toBe(2);
    expect(result.totalBeforeTax).toBe(10000); // 5000 * 2
  });

  test('Fails calculation if no rate matches date', () => {
    const result = calculateStayTotal(
      mockRoom,
      mockRates,
      'prop-1',
      '2027-05-10', // Outside validFrom/To
      2,
      2,
      0,
      0,
      0,
      'MAP'
    );

    expect(result.available).toBe(false);
    expect(result.reason).toContain('RATE_NOT_AVAILABLE_FOR_DATES');
  });
});
