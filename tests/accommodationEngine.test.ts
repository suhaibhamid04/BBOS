import { expect, test, describe } from 'bun:test';
import {
  validateOccupancy,
  calculateStayTotal,
  calculateAllocatedStayTotal,
  calculateMixedAllocatedStayTotal,
  deriveChildTreatments,
  distributeGuestsAcrossRooms,
  suggestRoomCount,
} from '../src/services/accommodationEngine';
import { RoomCategory, RatePeriod } from '../src/types';

describe('AccommodationEngine', () => {
  const mockRoom: RoomCategory = {
    id: 'room-1',
    propertyId: 'prop-1',
    name: 'Deluxe Room',
    baseAdults: 2,
    maxAdults: 3,
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
    expect(result.reason).toContain('no extra-bed supplement is configured');
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

describe('M4.1A room-by-room occupancy', () => {
  const room: RoomCategory = { id: 'ordinary-double', propertyId: 'property-1', name: 'Ordinary Double', baseAdults: 2, maxAdults: 2, maxChildren: 2, maxChildrenWithoutBed: 1, maxTotalOccupancy: 4, active: true } as RoomCategory;
  const rate: RatePeriod = {
    id: 'rate-family', propertyId: 'property-1', roomCategoryId: room.id,
    validFrom: '2026-01-01', validTo: '2026-12-31', baseRate: 5_000,
    currency: 'INR', mealPlan: 'MAP', taxTreatment: 'INCLUSIVE', status: 'ACTIVE', confirmationStatus: 'CONFIRMED',
    supplements: [
      { id: 'eb', ratePeriodId: 'rate-family', type: 'EB', name: 'Extra adult', amount: 1_000, unit: 'per_person_night', taxTreatment: 'INCLUSIVE' },
      { id: 'child', ratePeriodId: 'rate-family', type: 'CWB', name: 'Child supplement', amount: 500, unit: 'per_child_night', taxTreatment: 'INCLUSIVE' },
    ],
  };

  const calculate = (adults: number, childAges: number[], roomCount: number) => {
    const allocations = distributeGuestsAcrossRooms(room.id, adults, childAges, roomCount);
    return { allocations, result: calculateAllocatedStayTotal(room, [rate], room.propertyId, '2026-10-10', 2, allocations, { adults, children: childAges.length, childAges }, 'MAP') };
  };

  test.each([[2, 1], [4, 2], [6, 3]] as const)('%i adults cost independently across %i room(s)', (adults, rooms) => {
    const outcome = calculate(adults, [], rooms);
    expect(outcome.result.available).toBe(true);
    expect(outcome.result.roomBreakdowns).toHaveLength(rooms);
    expect(outcome.result.totalAmount).toBe(5_000 * 2 * rooms);
  });

  test('4 adults in 2 rooms avoids the former whole-party capacity failure', () => {
    const { allocations, result } = calculate(4, [], 2);
    expect(allocations.map(item => item.adults)).toEqual([2, 2]);
    expect(result.available).toBe(true);
  });

  test('5 adults and child age 8 suggest 3 rooms and retain the child age', () => {
    expect(suggestRoomCount(room, 5, [8])).toBe(3);
    const { allocations, result } = calculate(5, [8], 3);
    expect(allocations.map(item => item.adults)).toEqual([2, 2, 1]);
    expect(allocations[2].childAges).toEqual([8]);
    expect(result.childTreatments).toEqual([{ age: 8, category: 'CHILD_SUPPLEMENT', label: 'Child age 8 — child bed/supplement applies' }]);
  });

  test('ages 4 and 9 retain different default charging treatments', () => {
    const { result } = calculate(2, [4, 9], 1);
    expect(result.available).toBe(true);
    expect(result.childTreatments?.map(item => item.category)).toEqual(['COMPLIMENTARY_NO_BED', 'CHILD_SUPPLEMENT']);
    expect(result.totalAmount).toBe(11_000);
  });

  test('age 12+ remains a child in demographics while costing as one adult-equivalent guest', () => {
    const extraCapable = { ...room, id: 'extra-capable', name: 'Triple-capable room', maxAdults: 3, maxTotalOccupancy: 3 };
    const extraRate = { ...rate, id: 'rate-extra', roomCategoryId: extraCapable.id };
    const allocation = [{ roomIndex: 1, roomCategoryId: extraCapable.id, adults: 2, children: 1, childAges: [13] }];
    const party = { adults: 2, children: 1, childAges: [13] };
    const result = calculateAllocatedStayTotal(extraCapable, [extraRate], extraCapable.propertyId, '2026-10-10', 2, allocation, party, 'MAP');
    expect(result.available).toBe(true);
    expect(party).toEqual({ adults: 2, children: 1, childAges: [13] });
    expect(result.roomAllocations).toEqual(allocation);
    expect(deriveChildTreatments([13], extraCapable)[0].category).toBe('COMMERCIAL_ADULT');
    expect(result.totalAmount).toBe(12_000);
  });

  test('3 adults fit one explicitly extra-bed-capable room and include the supplement', () => {
    const category = { ...room, id: 'triple', name: 'Triple-capable', maxAdults: 3, maxTotalOccupancy: 3 };
    const categoryRate = { ...rate, id: 'rate-triple', roomCategoryId: category.id };
    const result = calculateAllocatedStayTotal(category, [categoryRate], category.propertyId, '2026-10-10', 2, [{ roomIndex: 1, roomCategoryId: category.id, adults: 3, children: 0, childAges: [] }], { adults: 3, children: 0, childAges: [] }, 'MAP');
    expect(result.available).toBe(true);
    expect(result.roomBreakdowns?.[0].occupancyValidation?.extraAdultCount).toBe(1);
    expect(result.totalAmount).toBe(12_000);
  });

  test('3 adults do not fit a category with no extra-adult capacity even when the rate has an extra-bed price', () => {
    const result = calculateAllocatedStayTotal(room, [rate], room.propertyId, '2026-10-10', 2, [{ roomIndex: 1, roomCategoryId: room.id, adults: 3, children: 0, childAges: [] }], { adults: 3, children: 0, childAges: [] }, 'MAP');
    expect(result.available).toBe(false);
    expect(result.reason).toContain('Add another room or choose a larger category');
  });

  test('legacy categories without explicit baseAdults preserve the former one-extra-adult contract behavior', () => {
    const legacyCategory = { ...room, id: 'legacy-double', name: 'Legacy Double', baseAdults: undefined, maxAdults: 2, maxTotalOccupancy: 3 };
    const legacyRate = { ...rate, id: 'rate-legacy', roomCategoryId: legacyCategory.id };
    const result = calculateAllocatedStayTotal(legacyCategory, [legacyRate], legacyCategory.propertyId, '2026-10-10', 2, [{ roomIndex: 1, roomCategoryId: legacyCategory.id, adults: 3, children: 0, childAges: [] }], { adults: 3, children: 0, childAges: [] }, 'MAP');
    expect(result.available).toBe(true);
    expect(result.totalAmount).toBe(12_000);
  });

  test('4 adults fit one explicitly configured four-adult category but not an ordinary double', () => {
    const family = { ...room, id: 'configured-four-adult', name: 'Configured Four Adult', baseAdults: 4, maxAdults: 4, maxTotalOccupancy: 4 };
    const familyRate = { ...rate, id: 'rate-four', roomCategoryId: family.id };
    const allocation = [{ roomIndex: 1, roomCategoryId: family.id, adults: 4, children: 0, childAges: [] }];
    expect(calculateAllocatedStayTotal(family, [familyRate], family.propertyId, '2026-10-10', 2, allocation, { adults: 4, children: 0, childAges: [] }, 'MAP').available).toBe(true);
    const invalid = calculateAllocatedStayTotal(room, [rate], room.propertyId, '2026-10-10', 2, [{ ...allocation[0], roomCategoryId: room.id }], { adults: 4, children: 0, childAges: [] }, 'MAP');
    expect(invalid.available).toBe(false);
    expect(invalid.reason).toContain('Add another room or choose a larger category');
  });

  test('Deluxe and Premium rooms in one stay validate and cost with their own categories and rates', () => {
    const deluxe = { ...room, id: 'deluxe', name: 'Deluxe Room' };
    const premium = { ...room, id: 'premium', name: 'Premium Room' };
    const deluxeRate = { ...rate, id: 'rate-deluxe', roomCategoryId: deluxe.id, baseRate: 5_000 };
    const premiumRate = { ...rate, id: 'rate-premium', roomCategoryId: premium.id, baseRate: 7_000 };
    const allocations = [
      { roomIndex: 1, roomCategoryId: deluxe.id, adults: 2, children: 0, childAges: [] },
      { roomIndex: 2, roomCategoryId: premium.id, adults: 2, children: 0, childAges: [] },
    ];
    const result = calculateMixedAllocatedStayTotal([deluxe, premium], [deluxeRate, premiumRate], room.propertyId, '2026-10-10', 2, allocations, { adults: 4, children: 0, childAges: [] }, 'MAP');
    expect(result.available).toBe(true);
    expect(result.totalAmount).toBe(24_000);
    expect(result.roomAllocations?.map(item => [item.roomCategoryId, item.rateId])).toEqual([['deluxe', 'rate-deluxe'], ['premium', 'rate-premium']]);
    expect(result.roomBreakdowns?.map(item => item.totalAmount)).toEqual([10_000, 14_000]);
  });

  test('party mismatch and missing child age fail with actionable messages', () => {
    const allocations = distributeGuestsAcrossRooms(room.id, 4, [], 2);
    const mismatch = calculateAllocatedStayTotal(room, [rate], room.propertyId, '2026-10-10', 1, allocations, { adults: 5, children: 0, childAges: [] }, 'MAP');
    expect(mismatch.available).toBe(false);
    expect(mismatch.reason).toContain('must match the Trip party');
    const missing = calculateAllocatedStayTotal(room, [rate], room.propertyId, '2026-10-10', 1, [{ roomIndex: 1, roomCategoryId: room.id, adults: 2, children: 1, childAges: [] }], { adults: 2, children: 1 }, 'MAP');
    expect(missing.available).toBe(false);
    expect(missing.reason).toContain('Child ages are required');
  });
});

describe('M4.1B rate correctness and package supplier costs', () => {
  const room = { id: 'deluxe', propertyId: 'hotel', name: 'Deluxe', baseAdults: 2, maxAdults: 2, maxChildren: 1, active: true } as RoomCategory;
  const rate = (id: string, from: string, to: string, amount: number, roomCategoryId = room.id): RatePeriod => ({
    id, propertyId: 'hotel', roomCategoryId, contractType: 'STANDARD', mealPlan: 'MAP',
    validFrom: from, validTo: to, baseRate: amount, currency: 'INR', taxTreatment: 'NET',
    confirmationStatus: 'CONFIRMED', supplements: [], createdAt: '', updatedAt: '', status: 'ACTIVE',
  });
  const allocation = [{ roomIndex: 1, roomCategoryId: room.id, adults: 2, children: 0, childAges: [] }];
  const party = { adults: 2, children: 0, childAges: [] };

  test('prices every night across contracted seasonal boundaries', () => {
    const result = calculateMixedAllocatedStayTotal(
      [room], [rate('sep', '2026-09-01', '2026-09-30', 3_500), rate('oct', '2026-10-01', '2026-10-31', 4_000)],
      'hotel', '2026-09-28', 7, allocation, party, 'MAP',
    );
    expect(result.available).toBe(true);
    expect(result.totalAmount).toBe(26_500);
    expect(result.nightlyRateBreakdown?.map(item => item.baseRate)).toEqual([3_500, 3_500, 3_500, 4_000, 4_000, 4_000, 4_000]);
    expect(result.costSource).toBe('INVENTORY_CONTRACTED');
  });

  test('package per-room/night rate overrides the package only and retains contracted total', () => {
    const master = rate('contract', '2026-01-01', '2026-12-31', 4_000);
    const result = calculateMixedAllocatedStayTotal([room], [master], 'hotel', '2026-10-01', 2, allocation, party, 'MAP', {
      entryMode: 'PER_ROOM_NIGHT', amount: 3_800, taxTreatment: 'NET', supplierQuoteReference: 'Phone call',
    });
    expect(result.totalAmount).toBe(7_600);
    expect(result.contractedTotalSupplierCost).toBe(8_000);
    expect(result.costSource).toBe('PACKAGE_RATE_OVERRIDE');
    expect(master.baseRate).toBe(4_000);
  });

  test('package rate higher than contract and exact total-stay supplier quotes are allowed', () => {
    const master = rate('contract', '2026-01-01', '2026-12-31', 4_000);
    const higher = calculateMixedAllocatedStayTotal([room], [master], 'hotel', '2026-10-01', 2, allocation, party, 'MAP', { entryMode: 'PER_ROOM_NIGHT', amount: 4_500, taxTreatment: 'NET' });
    const total = calculateMixedAllocatedStayTotal([room], [master], 'hotel', '2026-10-01', 2, allocation, party, 'MAP', { entryMode: 'TOTAL_STAY', amount: 8_750, taxTreatment: 'NET' });
    expect(higher.totalAmount).toBe(9_000);
    expect(total.totalAmount).toBe(8_750);
  });

  test('manual supplier quote permits a stay without a contracted rate', () => {
    const result = calculateMixedAllocatedStayTotal([room], [], 'hotel', '2026-10-01', 2, allocation, party, 'MAP', { entryMode: 'PER_ROOM_NIGHT', amount: 4_500, taxTreatment: 'NET' });
    expect(result.available).toBe(true);
    expect(result.totalAmount).toBe(9_000);
    expect(result.costSource).toBe('MANUAL_SUPPLIER_QUOTE');
    expect(result.ratePeriodId).toBeUndefined();
  });

  test('manual supplier quote applies its explicit tax treatment', () => {
    const result = calculateMixedAllocatedStayTotal([room], [], 'hotel', '2026-10-01', 2, allocation, party, 'MAP', { entryMode: 'PER_ROOM_NIGHT', amount: 4_500, taxTreatment: 'GST_5' });
    expect(result.available).toBe(true);
    expect(result.totalAmount).toBe(9_450);
    expect(result.costSource).toBe('MANUAL_SUPPLIER_QUOTE');
  });

  test('mixed categories keep independent nightly rates and accept only unambiguous total override', () => {
    const premium = { ...room, id: 'premium', name: 'Premium' };
    const allocations = [allocation[0], { roomIndex: 2, roomCategoryId: premium.id, adults: 2, children: 0, childAges: [] }];
    const result = calculateMixedAllocatedStayTotal([room, premium], [rate('deluxe-rate', '2026-01-01', '2026-12-31', 4_000), rate('premium-rate', '2026-01-01', '2026-12-31', 6_000, premium.id)], 'hotel', '2026-10-01', 2, allocations, { adults: 4, children: 0, childAges: [] }, 'MAP');
    expect(result.totalAmount).toBe(20_000);
    expect(result.roomBreakdowns?.map(value => value.totalAmount)).toEqual([8_000, 12_000]);
  });
});
