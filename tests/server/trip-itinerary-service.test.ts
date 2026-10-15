import { describe, expect, test } from 'bun:test';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import { QuoteService } from '../../server/services/quoteService';
import { TripDomainError, TripService, type TripMutationActor } from '../../server/services/tripService';

const executive: TripMutationActor = {
  firebaseUid: 'firebase-exec-1', employeeId: 'exec-1', name: 'Executive One',
  role: 'Sales Executive', active: true, salesTeamId: 'team-a',
};
const manager: TripMutationActor = {
  firebaseUid: 'firebase-manager-1', employeeId: 'manager-1', name: 'Manager One',
  role: 'Sales Manager', active: true, salesTeamId: 'team-a',
};

function trip(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, customerId: 'customer-1', leadId: 'lead-1', title: 'Kashmir', destination: 'Kashmir',
    startDate: '2026-10-01', endDate: '2026-10-05', travelerCount: 2, adults: 2, children: 0,
    tripType: 'LEISURE', currency: 'INR', status: 'DRAFT', totalSupplierCost: 500,
    totalSellingPrice: 1_000, grossProfit: 500, grossMargin: 50, costingStatus: 'CALCULATED',
    assignedSalesEmployeeId: 'exec-1', salesTeamId: 'team-a',
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function day(id: string, tripId = 'trip-own') {
  return {
    id, tripId, dayNumber: 1, date: '2026-10-01', title: 'Arrival', location: 'Srinagar',
    description: 'Arrival day', items: [],
  };
}

function harness(trips = [trip('trip-own')], days = [day('day-own')]) {
  const storage = new InMemoryConversionStorageProvider({ trips });
  storage.rawSet('customers', 'customer-1', { id: 'customer-1', name: 'Customer One' });
  storage.rawSet('leads', 'lead-1', { id: 'lead-1', customerId: 'customer-1', assignedEmployeeId: 'exec-1' });
  for (const value of days) storage.rawSet('itinerary_days', value.id, value);
  return { storage, service: new TripService(storage) };
}

function seedInventory(storage: InMemoryConversionStorageProvider) {
  storage.rawSet('suppliers', 'supplier-1', { id: 'supplier-1', name: 'Valley Supplier', active: true });
  storage.rawSet('accommodation_properties', 'property-1', { id: 'property-1', name: 'Valley Hotel', supplierId: 'supplier-1', status: 'ACTIVE' });
  storage.rawSet('room_categories', 'room-1', { id: 'room-1', propertyId: 'property-1', name: 'Premier Room', maxAdults: 2, maxChildren: 2, active: true });
  storage.rawSet('rate_periods', 'rate-1', { id: 'rate-1', propertyId: 'property-1', roomCategoryId: 'room-1', contractType: 'STANDARD', mealPlan: 'MAP', validFrom: '2026-10-01', validTo: '2026-10-31', baseRate: 4_000, currency: 'INR', taxTreatment: 'NET', confirmationStatus: 'CONFIRMED', status: 'ACTIVE', supplements: [{ id: 'cwb', ratePeriodId: 'rate-1', type: 'CWB', amount: 500, unit: 'per_child_night', taxTreatment: 'NET' }] });
  storage.rawSet('room_categories', 'room-premium', { id: 'room-premium', propertyId: 'property-1', name: 'Premium Room', baseAdults: 2, maxAdults: 3, maxChildren: 1, maxChildrenWithoutBed: 1, maxTotalOccupancy: 3, active: true });
  storage.rawSet('rate_periods', 'rate-premium', { id: 'rate-premium', propertyId: 'property-1', roomCategoryId: 'room-premium', contractType: 'STANDARD', mealPlan: 'MAP', validFrom: '2026-10-01', validTo: '2026-10-31', baseRate: 6_000, currency: 'INR', taxTreatment: 'NET', confirmationStatus: 'CONFIRMED', status: 'ACTIVE', supplements: [{ id: 'eb', ratePeriodId: 'rate-premium', type: 'EB', amount: 1_000, unit: 'per_person_night', taxTreatment: 'NET' }] });
  storage.rawSet('accommodation_properties', 'property-2', { id: 'property-2', name: 'Lake Hotel', supplierId: 'supplier-1', status: 'ACTIVE' });
  storage.rawSet('room_categories', 'room-2', { id: 'room-2', propertyId: 'property-2', name: 'Lake Suite', maxAdults: 2, maxChildren: 2, active: true });
  storage.rawSet('rate_periods', 'rate-2', { id: 'rate-2', propertyId: 'property-2', roomCategoryId: 'room-2', contractType: 'STANDARD', mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2026-10-31', baseRate: 5_000, currency: 'INR', taxTreatment: 'NET', confirmationStatus: 'CONFIRMED', status: 'ACTIVE', supplements: [{ id: 'cwb', ratePeriodId: 'rate-2', type: 'CWB', amount: 500, unit: 'per_child_night', taxTreatment: 'NET' }] });
  storage.rawSet('vehicle_categories', 'vehicle-1', { id: 'vehicle-1', name: 'Innova', displayName: 'Innova', active: true });
  storage.rawSet('transport_rate_periods', 'transport-rate-1', { id: 'transport-rate-1', vehicleCategoryId: 'vehicle-1', supplierId: 'supplier-1', serviceType: 'MULTI_DAY_JOURNEY', pricingUnit: 'PER_DAY', baseRate: 5_000, currency: 'INR', validFrom: '2026-10-01', validTo: '2026-10-31', availabilityStatus: 'AVAILABLE', confirmationStatus: 'CONFIRMED', taxTreatment: 'NET', inclusions: { vehicle: 'INCLUDED', driver: 'INCLUDED', fuel: 'INCLUDED', toll: 'INCLUDED', parking: 'INCLUDED', tax: 'INCLUDED', driverAllowance: 'INCLUDED', nightHalt: 'INCLUDED', permits: 'INCLUDED' }, status: 'ACTIVE' });
  storage.rawSet('activity_masters', 'activity-1', { id: 'activity-1', name: 'Shikara Ride', supplierId: 'supplier-1', duration: '1 Hour', active: true });
  storage.rawSet('activity_rate_periods', 'activity-rate-1', { id: 'activity-rate-1', activityId: 'activity-1', supplierId: 'supplier-1', pricingModel: 'PER_PERSON', pricingComponents: { person: 700 }, currency: 'INR', validFrom: '2026-10-01', validTo: '2026-10-31', availabilityStatus: 'AVAILABLE', confirmationStatus: 'CONFIRMED', taxTreatment: 'NET', status: 'ACTIVE' });
}

async function expectError(promise: Promise<unknown>, code: string, status = 403) {
  try {
    await promise;
    throw new Error('Expected TripDomainError');
  } catch (error) {
    expect((error as TripDomainError).code).toBe(code);
    expect((error as TripDomainError).statusCode).toBe(status);
  }
}

describe('Stage D2B server-authoritative Trip itinerary and deletion mutations', () => {
  test('Sales Executive can mutate OWN itinerary and mutation invalidates costing', async () => {
    const { storage, service } = harness();
    const created = await service.createItineraryDay('trip-own', { title: 'Day Two', location: 'Pahalgam' }, executive);
    expect(created.day.tripId).toBe('trip-own');
    expect(created.trip.costingStatus).toBe('PENDING');

    const item = await service.addItineraryItem('day-own', {
      type: 'SIGHTSEEING', title: 'Lake visit', description: 'Dal Lake tour', sellingPrice: 0,
    }, executive);
    expect(item.day.items).toHaveLength(1);
    expect(storage.rawGet('trips', 'trip-own')?.costingStatus).toBe('PENDING');
  });

  test('Sales Executive cannot mutate another Executive itinerary and causes zero write', async () => {
    const otherTrip = trip('trip-other', { assignedSalesEmployeeId: 'exec-2' });
    const otherDay = day('day-other', 'trip-other');
    const { storage, service } = harness([otherTrip], [otherDay]);
    await expectError(service.updateItineraryDay('day-other', { title: 'Tampered' }, executive), 'RESOURCE_ACCESS_DENIED');
    expect(storage.rawGet('itinerary_days', 'day-other')).toEqual(otherDay);
    expect(storage.rawGet('trips', 'trip-other')).toEqual(otherTrip);
  });

  test('Sales Manager can mutate TEAM itinerary but not another team', async () => {
    const sameTeamTrip = trip('trip-team', { assignedSalesEmployeeId: 'exec-2' });
    const otherTeamTrip = trip('trip-other-team', { assignedSalesEmployeeId: 'exec-3', salesTeamId: 'team-b' });
    const { storage, service } = harness([sameTeamTrip, otherTeamTrip], [day('day-team', 'trip-team'), day('day-other-team', 'trip-other-team')]);
    const updated = await service.updateItineraryDay('day-team', { location: 'Gulmarg' }, manager);
    expect(updated.day.location).toBe('Gulmarg');
    await expectError(service.updateItineraryDay('day-other-team', { location: 'Denied' }, manager), 'RESOURCE_ACCESS_DENIED');
    expect(storage.rawGet('itinerary_days', 'day-other-team')?.location).toBe('Srinagar');
  });

  test('internal itinerary notes do not invalidate otherwise current costing', async () => {
    const { storage, service } = harness();
    const result = await service.updateItineraryDay('day-own', { notes: 'Call supplier after lunch.' }, executive);
    expect(result.day.notes).toBe('Call supplier after lunch.');
    expect(result.trip).toMatchObject({ costingStatus: 'CALCULATED' });
    expect(storage.getAllAuditLogs().filter(log => log.action === 'COSTING_INVALIDATED')).toHaveLength(0);
  });

  test('client owner, team, status, and supplier-cost fields are rejected without writes', async () => {
    const payloads = [
      { assignedSalesEmployeeId: 'exec-9' }, { salesTeamId: 'team-z' }, { status: 'BOOKED' },
      { supplierCost: 1 }, { metadata: { totalSupplierCost: 1 } },
    ];
    for (const payload of payloads) {
      const originalDay = day('day-own');
      const { storage, service } = harness([trip('trip-own')], [originalDay]);
      const operation = 'supplierCost' in payload || 'metadata' in payload
        ? service.addItineraryItem('day-own', { type: 'OTHER', title: 'X', description: 'Y', ...payload }, executive)
        : service.updateItineraryDay('day-own', payload, executive);
      await expectError(operation, 'SERVER_CONTROLLED_ITINERARY_FIELD', 400);
      expect(storage.rawGet('itinerary_days', 'day-own')).toEqual(originalDay);
      expect(storage.rawGet('trips', 'trip-own')?.costingStatus).toBe('CALCULATED');
    }
  });

  test('itinerary deletion follows the same Trip scope', async () => {
    const otherTrip = trip('trip-other', { assignedSalesEmployeeId: 'exec-2' });
    const otherDay = day('day-other', 'trip-other');
    const { storage, service } = harness([otherTrip], [otherDay]);
    await expectError(service.deleteItineraryDay('day-other', executive), 'RESOURCE_ACCESS_DENIED');
    expect(storage.rawGet('itinerary_days', 'day-other')).toEqual(otherDay);
  });

  test('inventory-backed items persist stable authoritative IDs, snapshots, and remain editable', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    const created = await service.addItineraryItem('day-own', {
      type: 'HOTEL', title: 'Client label', description: 'Client description', inventoryId: 'forged',
      metadata: { inventoryType: 'ACCOMMODATION', propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1, adults: 2, children: 0, childrenWithBed: 0, childrenWithoutBed: 0 },
    }, executive);
    expect(created.item.inventoryId).toBe('property-1');
    expect(created.item.metadata?.rateId).toBe('rate-1');
    expect(created.item.metadata?.supplierId).toBe('supplier-1');
    expect(created.item.title).toBe('Valley Hotel — Premier Room — MAP');

    const updated = await service.updateItineraryItem('day-own', created.item.id, {
      type: 'HOTEL', title: 'Ignored', description: 'Ignored',
      metadata: { inventoryType: 'ACCOMMODATION', propertyId: 'property-2', roomCategoryId: 'room-2', rateId: 'rate-2', mealPlan: 'CP', checkInDate: '2026-10-03', nights: 3, rooms: 2, adults: 2, children: 0, childrenWithBed: 0, childrenWithoutBed: 0 },
    }, executive);
    expect(updated.item.id).toBe(created.item.id);
    expect(updated.item.inventoryId).toBe('property-2');
    expect(updated.item.metadata?.propertyName).toBe('Lake Hotel');
    expect(updated.item.metadata?.roomCategoryName).toBe('Lake Suite');
    expect(updated.item.metadata?.mealPlan).toBe('CP');
    expect(updated.item.metadata?.rateId).toBe('rate-2');
    expect(updated.item.metadata?.nights).toBe(3);
    expect(updated.item.metadata?.rooms).toBe(2);
    expect(updated.trip.costingStatus).toBe('PENDING');
    expect(updated.day.items).toHaveLength(1);
  });

  test('package supplier rates are server-authored, audited, and never mutate master inventory', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    const created = await service.addItineraryItem('day-own', {
      type: 'HOTEL', title: 'Hotel', description: 'Stay',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1, roomAllocations: [{ roomIndex: 1, roomCategoryId: 'room-1', rateId: 'rate-1', adults: 2, children: 0, childAges: [] }], packageRateRequest: { entryMode: 'PER_ROOM_NIGHT', amount: 3_800, taxTreatment: 'NET', supplierQuoteReference: 'Phone call' } },
    }, executive);
    expect(created.item.metadata?.costSource).toBe('PACKAGE_RATE_OVERRIDE');
    expect(created.item.metadata?.packageSupplierRate).toMatchObject({ amount: 3_800, enteredByEmployeeId: 'exec-1', originalContractedTotal: 8_000 });
    expect(created.item.metadata?.packageSupplierRate.enteredAt).toBeString();
    expect(storage.rawGet('rate_periods', 'rate-1')?.baseRate).toBe(4_000);
    expect(storage.rawList('audit_logs').some(value => value.action === 'PACKAGE_SUPPLIER_RATE_ENTERED' && value.actorId === 'exec-1')).toBe(true);

    const changed = await service.updateItineraryItem('day-own', created.item.id, {
      type: 'HOTEL', title: 'Hotel', description: 'Stay',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1, roomAllocations: [{ roomIndex: 1, roomCategoryId: 'room-1', rateId: 'rate-1', adults: 2, children: 0, childAges: [] }], packageRateRequest: { entryMode: 'PER_ROOM_NIGHT', amount: 4_500, taxTreatment: 'NET' } },
    }, executive);
    expect(changed.item.metadata?.packageSupplierRate.amount).toBe(4_500);
    expect(storage.rawList('audit_logs').some(value => value.action === 'PACKAGE_SUPPLIER_RATE_CHANGED')).toBe(true);
  });

  test('supplier reference-only edit preserves current costing but a package amount edit invalidates it', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    const payload = (amount: number, supplierQuoteReference: string) => ({
      type: 'HOTEL', title: 'Hotel', description: 'Stay',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1, roomAllocations: [{ roomIndex: 1, roomCategoryId: 'room-1', rateId: 'rate-1', adults: 2, children: 0, childAges: [] }], packageRateRequest: { entryMode: 'PER_ROOM_NIGHT', amount, taxTreatment: 'NET', supplierQuoteReference } },
    });
    const created = await service.addItineraryItem('day-own', payload(3_800, 'Phone call'), executive);
    storage.rawUpdate('trips', 'trip-own', { costingStatus: 'CALCULATED', costingRevision: created.trip.costingRevision, costingCalculatedRevision: created.trip.costingRevision });

    const referenceOnly = await service.updateItineraryItem('day-own', created.item.id, payload(3_800, 'WhatsApp follow-up'), executive);
    expect(referenceOnly.trip.costingStatus).toBe('CALCULATED');
    expect(referenceOnly.trip.costingRevision).toBe(created.trip.costingRevision);

    const amountChanged = await service.updateItineraryItem('day-own', created.item.id, payload(4_200, 'WhatsApp follow-up'), executive);
    expect(amountChanged.trip.costingStatus).toBe('PENDING');
    expect(amountChanged.trip.costingRevision).toBe(Number(created.trip.costingRevision || 0) + 1);
    const invalidationCount = storage.rawList('audit_logs').filter(value => value.action === 'COSTING_INVALIDATED').length;

    const changedAgainWhilePending = await service.updateItineraryItem('day-own', created.item.id, payload(4_300, 'Second price change'), executive);
    expect(changedAgainWhilePending.trip.costingRevision).toBe(Number(amountChanged.trip.costingRevision || 0) + 1);
    expect(storage.rawList('audit_logs').filter(value => value.action === 'COSTING_INVALIDATED')).toHaveLength(invalidationCount);

    storage.rawUpdate('trips', 'trip-own', {
      costingStatus: 'CALCULATED',
      costingRevision: changedAgainWhilePending.trip.costingRevision,
      costingCalculatedRevision: changedAgainWhilePending.trip.costingRevision,
    });
    const removed = await service.updateItineraryItem('day-own', created.item.id, {
      type: 'HOTEL', title: 'Hotel', description: 'Stay',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1, roomAllocations: [{ roomIndex: 1, roomCategoryId: 'room-1', rateId: 'rate-1', adults: 2, children: 0, childAges: [] }] },
    }, executive);
    expect(removed.item.metadata?.packageSupplierRate).toBeUndefined();
    expect(removed.trip.costingStatus).toBe('PENDING');
  });

  test('manual package quote works without contract and hotel replacement clears old package pricing', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    storage.rawSet('rate_periods', 'rate-2', { ...storage.rawGet('rate_periods', 'rate-2'), status: 'ARCHIVED' });
    const created = await service.addItineraryItem('day-own', {
      type: 'HOTEL', title: 'Manual', description: 'Stay',
      metadata: { propertyId: 'property-2', roomCategoryId: 'room-2', mealPlan: 'CP', checkInDate: '2026-10-02', nights: 2, rooms: 1, roomAllocations: [{ roomIndex: 1, roomCategoryId: 'room-2', adults: 2, children: 0, childAges: [] }], packageRateRequest: { entryMode: 'TOTAL_STAY', amount: 9_250, taxTreatment: 'NET', supplierQuoteReference: 'WhatsApp' } },
    }, executive);
    expect(created.item.metadata?.costSource).toBe('MANUAL_SUPPLIER_QUOTE');
    expect(created.item.metadata?.rateId).toBeUndefined();

    storage.rawUpdate('trips', 'trip-own', {
      costingStatus: 'CALCULATED',
      costingRevision: created.trip.costingRevision,
      costingCalculatedRevision: created.trip.costingRevision,
    });
    const manualChanged = await service.updateItineraryItem('day-own', created.item.id, {
      type: 'HOTEL', title: 'Manual', description: 'Stay',
      metadata: { propertyId: 'property-2', roomCategoryId: 'room-2', mealPlan: 'CP', checkInDate: '2026-10-02', nights: 2, rooms: 1, roomAllocations: [{ roomIndex: 1, roomCategoryId: 'room-2', adults: 2, children: 0, childAges: [] }], packageRateRequest: { entryMode: 'TOTAL_STAY', amount: 10_000, taxTreatment: 'NET', supplierQuoteReference: 'Requoted' } },
    }, executive);
    expect(manualChanged.item.metadata?.packageSupplierRate.amount).toBe(10_000);
    expect(manualChanged.trip.costingStatus).toBe('PENDING');

    const replacement = await service.updateItineraryItem('day-own', manualChanged.item.id, {
      type: 'HOTEL', title: 'Contracted', description: 'Stay',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1, roomAllocations: [{ roomIndex: 1, roomCategoryId: 'room-1', rateId: 'rate-1', adults: 2, children: 0, childAges: [] }] },
    }, executive);
    expect(replacement.item.metadata?.costSource).toBe('INVENTORY_CONTRACTED');
    expect(replacement.item.metadata?.packageSupplierRate).toBeUndefined();
    expect(replacement.item.metadata?.supplierQuoteReference).toBeUndefined();
  });

  test.each([0, -1, Number.NaN])('rejects invalid package supplier amount %p with zero writes', async amount => {
    const originalDay = day('day-own');
    const { storage, service } = harness([trip('trip-own')], [originalDay]); seedInventory(storage);
    await expectError(service.addItineraryItem('day-own', {
      type: 'HOTEL', title: 'Invalid', description: 'Stay',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1, packageRateRequest: { entryMode: 'PER_ROOM_NIGHT', amount, taxTreatment: 'NET' } },
    }, executive), 'INVALID_PACKAGE_RATE_AMOUNT', 400);
    expect(storage.rawGet('itinerary_days', 'day-own')).toEqual(originalDay);
  });

  test('rejects forged package-rate actor metadata', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    await expectError(service.addItineraryItem('day-own', {
      type: 'HOTEL', title: 'Invalid', description: 'Stay',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1, packageRateRequest: { entryMode: 'PER_ROOM_NIGHT', amount: 3_800, taxTreatment: 'NET', enteredByEmployeeId: 'founder-1' } },
    }, executive), 'SERVER_CONTROLLED_ITINERARY_FIELD', 400);
  });

  test('a missing nightly rate requires package pricing and a failed replacement preserves the original item', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    storage.rawSet('rate_periods', 'rate-2', { ...storage.rawGet('rate_periods', 'rate-2'), status: 'ARCHIVED' });
    storage.rawSet('rate_periods', 'short-rate', { id: 'short-rate', propertyId: 'property-2', roomCategoryId: 'room-2', contractType: 'STANDARD', mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2026-10-03', baseRate: 5_000, currency: 'INR', taxTreatment: 'NET', confirmationStatus: 'CONFIRMED', status: 'ACTIVE', supplements: [] });
    const created = await service.addItineraryItem('day-own', {
      type: 'HOTEL', title: 'Original', description: 'Original',
      metadata: { inventoryType: 'ACCOMMODATION', propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1, adults: 2, children: 0, childrenWithBed: 0, childrenWithoutBed: 0 },
    }, executive);
    const before = storage.rawGet('itinerary_days', 'day-own');
    await expectError(service.updateItineraryItem('day-own', created.item.id, {
      type: 'HOTEL', title: 'Replacement', description: 'Replacement',
      metadata: { inventoryType: 'ACCOMMODATION', propertyId: 'property-2', roomCategoryId: 'room-2', rateId: 'short-rate', mealPlan: 'CP', checkInDate: '2026-10-03', nights: 2, rooms: 1, adults: 2, children: 0, childrenWithBed: 0, childrenWithoutBed: 0 },
    }, executive), 'PACKAGE_RATE_REQUIRED', 422);
    expect(storage.rawGet('itinerary_days', 'day-own')).toEqual(before);
  });

  test('server persists canonical per-room occupancy and rejects a party mismatch without writing', async () => {
    const familyTrip = trip('trip-own', { adults: 5, children: 1, childAges: [8], travelerCount: 6 });
    const originalDay = day('day-own');
    const { storage, service } = harness([familyTrip], [originalDay]); seedInventory(storage);
    const roomAllocations = [
      { roomIndex: 1, roomCategoryId: 'room-1', adults: 2, children: 0, childAges: [] },
      { roomIndex: 2, roomCategoryId: 'room-1', adults: 2, children: 0, childAges: [] },
      { roomIndex: 3, roomCategoryId: 'room-1', adults: 1, children: 1, childAges: [8] },
    ];
    const created = await service.addItineraryItem('day-own', {
      type: 'HOTEL', title: 'Client label', description: 'Client description',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 3, roomAllocations },
    }, executive);
    expect(created.item.metadata?.roomAllocations).toEqual(roomAllocations.map(allocation => ({ ...allocation, rateId: 'rate-1' })));
    expect(created.item.metadata?.childTreatments).toEqual([{ age: 8, category: 'CHILD_SUPPLEMENT', label: 'Child age 8 — child bed/supplement applies' }]);
    expect(created.item.metadata?.childrenWithBed).toBe(1);

    const before = storage.rawGet('itinerary_days', 'day-own');
    await expectError(service.updateItineraryItem('day-own', created.item.id, {
      type: 'HOTEL', title: 'Forged', description: 'Forged',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 2, roomAllocations: roomAllocations.slice(0, 2) },
    }, executive), 'INVALID_ROOM_DISTRIBUTION', 422);
    expect(storage.rawGet('itinerary_days', 'day-own')).toEqual(before);
  });

  test('server preserves customer demographics while deriving a 13-year-old as an adult-equivalent guest', async () => {
    const demographicTrip = trip('trip-own', { adults: 2, children: 1, childAges: [13], travelerCount: 3 });
    const { storage, service } = harness([demographicTrip], [day('day-own')]); seedInventory(storage);
    const created = await service.addItineraryItem('day-own', {
      type: 'HOTEL', title: 'Premium', description: 'Stay',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-premium', rateId: 'rate-premium', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1, roomAllocations: [{ roomIndex: 1, roomCategoryId: 'room-premium', rateId: 'rate-premium', adults: 2, children: 1, childAges: [13] }] },
    }, executive);
    expect(storage.rawGet('trips', 'trip-own')).toMatchObject({ adults: 2, children: 1, childAges: [13] });
    expect(created.item.metadata?.adults).toBe(2);
    expect(created.item.metadata?.children).toBe(1);
    expect(created.item.metadata?.childTreatments).toEqual([{ age: 13, category: 'COMMERCIAL_ADULT', label: 'Child age 13 — counted as adult' }]);
  });

  test('server retains and validates different room categories and rates in one hotel stay', async () => {
    const fourAdults = trip('trip-own', { adults: 4, children: 0, childAges: [], travelerCount: 4 });
    const { storage, service } = harness([fourAdults], [day('day-own')]); seedInventory(storage);
    const roomAllocations = [
      { roomIndex: 1, roomCategoryId: 'room-1', rateId: 'rate-1', adults: 2, children: 0, childAges: [] },
      { roomIndex: 2, roomCategoryId: 'room-premium', rateId: 'rate-premium', adults: 2, children: 0, childAges: [] },
    ];
    const created = await service.addItineraryItem('day-own', {
      type: 'HOTEL', title: 'Mixed rooms', description: 'Stay',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 2, roomAllocations },
    }, executive);
    expect(created.item.metadata?.roomAllocations).toEqual(roomAllocations);
    expect(created.item.title).toContain('Premier Room + Premium Room');
  });

  test('new accommodation cannot cost a child whose age is missing', async () => {
    const incomplete = trip('trip-own', { adults: 2, children: 1, travelerCount: 3, childAges: [] });
    const originalDay = day('day-own');
    const { storage, service } = harness([incomplete], [originalDay]); seedInventory(storage);
    await expectError(service.addItineraryItem('day-own', {
      type: 'HOTEL', title: 'Hotel', description: 'Stay',
      metadata: { propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1 },
    }, executive), 'CHILD_AGES_REQUIRED', 422);
    expect(storage.rawGet('itinerary_days', 'day-own')).toEqual(originalDay);
  });

  test('inventory-backed item rejects a mismatched rate without partial writes', async () => {
    const originalDay = day('day-own'); const { storage, service } = harness([trip('trip-own')], [originalDay]); seedInventory(storage);
    await expectError(service.addItineraryItem('day-own', {
      type: 'TRANSPORT', title: 'Innova', description: 'Day vehicle',
      metadata: { inventoryType: 'TRANSPORT', vehicleCategoryId: 'vehicle-1', rateId: 'activity-rate-1', serviceType: 'MULTI_DAY_JOURNEY', startDate: '2026-10-02', vehicleDays: 1 },
    }, executive), 'INVENTORY_REFERENCE_NOT_FOUND', 422);
    expect(storage.rawGet('itinerary_days', 'day-own')).toEqual(originalDay);
    expect(storage.rawGet('trips', 'trip-own')?.costingStatus).toBe('CALCULATED');
  });

  test('Trip deletion is resource-scoped and atomically removes its itinerary only when workflow permits', async () => {
    const ownDay = day('day-own');
    const { storage, service } = harness([trip('trip-own'), trip('trip-other', { assignedSalesEmployeeId: 'exec-2' })], [ownDay, day('day-other', 'trip-other')]);
    await expectError(service.deleteTrip('trip-other', executive), 'RESOURCE_ACCESS_DENIED');
    expect(storage.rawGet('trips', 'trip-other')).not.toBeNull();

    await service.deleteTrip('trip-own', executive);
    expect(storage.rawGet('trips', 'trip-own')).toBeNull();
    expect(storage.rawGet('itinerary_days', 'day-own')).toBeNull();
    expect(storage.rawGet('trips', 'trip-other')).not.toBeNull();
  });

  test('confirmed and operational Trip history cannot be destructively deleted', async () => {
    for (const status of ['QUOTE_SENT', 'BOOKED', 'IN_OPERATIONS', 'COMPLETED'] as const) {
      const original = trip('trip-own', { status });
      const { storage, service } = harness([original], [day('day-own')]);
      try {
        await service.deleteTrip('trip-own', executive);
        throw new Error('Expected protected Trip deletion to be denied.');
      } catch (error) {
        expect(['RESOURCE_ACCESS_DENIED', 'TRIP_DELETION_WORKFLOW_DENIED']).toContain((error as TripDomainError).code);
      }
      expect(storage.rawGet('trips', 'trip-own')).toEqual(original);
      expect(storage.rawGet('itinerary_days', 'day-own')).not.toBeNull();
    }
  });

  test('pending costing cannot masquerade as authoritative Quote cost', async () => {
    const pending = trip('trip-own', { costingStatus: 'PENDING', totalSupplierCost: 0 });
    const { storage } = harness([pending], []);
    const quotes = new QuoteService(storage);
    await expectError(quotes.createQuote({
      leadId: 'lead-1', customerId: 'customer-1', customerName: 'Customer One', destination: 'Kashmir',
      tripId: 'trip-own', travelerCount: 2, totalAmount: 1_000, discountAmount: 0,
      validUntil: '2026-10-31', hotels: [], transports: [], activities: [],
    }, executive), 'TRIP_COSTING_PENDING', 409);
    expect(storage.getAllAuditLogs()).toHaveLength(0);
  });

  test('Firestore rules prohibit direct browser itinerary and Trip deletion writes', async () => {
    const rules = await Bun.file(new URL('../../firestore.rules', import.meta.url)).text();
    expect(rules).toContain('allow create, update, delete: if false;');
    const tripBlock = rules.match(/match \/trips\/\{tripId\} \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    expect(tripBlock).toContain('allow delete: if false;');
  });
});

describe('Sales Core M4.2 transport and activity package persistence', () => {
  test('deduplicates same-date transport actions into chargeable days and preserves structured day service data', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    const created = await service.addItineraryItem('day-own', {
      type: 'TRANSPORT', title: 'Client transport', description: 'Route wording',
      metadata: {
        vehicleCategoryId: 'vehicle-1', rateId: 'transport-rate-1', serviceType: 'MULTI_DAY_JOURNEY', startDate: '2026-10-01',
        routeName: 'Airport, hotel and Dal Lake', vehicleDays: 3, vehicleCount: 2, nightHalts: 0, occurrences: 1, distanceKm: 0, hours: 0,
        serviceDays: [
          { dayNumber: 1, date: '2026-10-01', serviceType: 'AIRPORT_TRANSFER', from: 'Airport', to: 'Hotel', chargeableTransportDay: true },
          { dayNumber: 1, date: '2026-10-01', serviceType: 'LOCAL_SIGHTSEEING', route: 'Dal Lake', chargeableTransportDay: true },
          { dayNumber: 2, date: '2026-10-02', serviceType: 'DAY_EXCURSION', route: 'Srinagar → Gulmarg → Srinagar', places: ['Gulmarg'], title: 'Gulmarg Day Excursion', overnightLocation: 'Srinagar', notes: 'Return before dinner', chargeableTransportDay: true },
        ],
      },
    }, executive);
    expect(created.item.metadata).toMatchObject({ vehicleCount: 2, chargeableDays: 2, vehicleDays: 2, packagePricingBasis: 'PER_VEHICLE_PER_DAY' });
    expect(created.item.metadata?.serviceDays).toHaveLength(3);
    expect(created.item.metadata?.serviceDays?.[2]).toMatchObject({ title: 'Gulmarg Day Excursion', places: ['Gulmarg'], overnightLocation: 'Srinagar', notes: 'Return before dinner' });
    expect(created.item.metadata?.contractedTotalSupplierCost).toBe(20_000);
  });

  test('authors package-only transport pricing without changing master inventory and audits canonical employeeId', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    const created = await service.addItineraryItem('day-own', {
      type: 'TRANSPORT', title: 'Transport', description: 'Kashmir circuit',
      metadata: {
        vehicleCategoryId: 'vehicle-1', rateId: 'transport-rate-1', serviceType: 'MULTI_DAY_JOURNEY', startDate: '2026-10-01', routeName: 'Kashmir circuit',
        vehicleDays: 3, vehicleCount: 2, nightHalts: 0, occurrences: 1, distanceKm: 0, hours: 0,
        packageRateRequest: { entryMode: 'PER_VEHICLE_DAY', amount: 4_500, taxTreatment: 'NET', supplierQuoteReference: 'WhatsApp' },
      },
    }, executive);
    expect(created.item.metadata?.packageSupplierRate).toMatchObject({ amount: 4_500, enteredByEmployeeId: 'exec-1', originalContractedTotal: 30_000 });
    expect(created.item.metadata?.costSource).toBe('PACKAGE_RATE_OVERRIDE');
    expect(storage.rawGet('transport_rate_periods', 'transport-rate-1')?.baseRate).toBe(5_000);
    expect(storage.rawList('audit_logs').some(value => value.action === 'PACKAGE_SUPPLIER_RATE_ENTERED' && value.actorId === 'exec-1')).toBe(true);
  });

  test('route wording alone keeps costing current while vehicle economics invalidate it', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    const payload = (routeName: string, vehicleCount: number) => ({
      type: 'TRANSPORT', title: 'Transport label', description: routeName,
      metadata: { vehicleCategoryId: 'vehicle-1', rateId: 'transport-rate-1', serviceType: 'MULTI_DAY_JOURNEY', startDate: '2026-10-01', routeName, vehicleDays: 2, vehicleCount, nightHalts: 0, occurrences: 1, distanceKm: 0, hours: 0 },
    });
    const created = await service.addItineraryItem('day-own', payload('Airport to Gulmarg', 1), executive);
    storage.rawUpdate('trips', 'trip-own', { costingStatus: 'CALCULATED', costingRevision: created.trip.costingRevision, costingCalculatedRevision: created.trip.costingRevision });
    const wording = await service.updateItineraryItem('day-own', created.item.id, payload('Airport → Gulmarg via hotel', 1), executive);
    expect(wording.trip.costingStatus).toBe('CALCULATED');
    const commercial = await service.updateItineraryItem('day-own', created.item.id, payload('Airport → Gulmarg via hotel', 2), executive);
    expect(commercial.trip.costingStatus).toBe('PENDING');
  });

  test('persists activity pricing, inclusion, and package-rate provenance without mutating its master rate', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    const included = await service.addItineraryItem('day-own', {
      type: 'ACTIVITY', title: 'Ride', description: 'Customer wording',
      metadata: {
        activityId: 'activity-1', rateId: 'activity-rate-1', date: '2026-10-01', adults: 2, children: 1, infants: 0,
        vehicles: 1, groups: 1, tickets: 3, hours: 1, days: 1, sessions: 1, units: 1, inclusionStatus: 'INCLUDED',
        packageRateRequest: { entryMode: 'PER_PERSON', amount: 650, childAmount: 400, taxTreatment: 'NET' },
      },
    }, executive);
    expect(included.item.metadata).toMatchObject({ pricingModel: 'PER_PERSON', inclusionStatus: 'INCLUDED', costSource: 'PACKAGE_RATE_OVERRIDE' });
    expect(included.item.metadata?.packageSupplierRate).toMatchObject({ amount: 650, childAmount: 400, enteredByEmployeeId: 'exec-1', originalContractedTotal: 2_100 });
    expect(storage.rawGet('activity_rate_periods', 'activity-rate-1')?.pricingComponents).toEqual({ person: 700 });

    const optional = await service.addItineraryItem('day-own', {
      type: 'ACTIVITY', title: 'Optional ride', description: 'Choice',
      metadata: { activityId: 'activity-1', rateId: 'activity-rate-1', date: '2026-10-02', adults: 2, children: 0, infants: 0, vehicles: 1, groups: 1, tickets: 2, hours: 1, days: 1, sessions: 1, inclusionStatus: 'OPTIONAL' },
    }, executive);
    expect(optional.item.metadata?.inclusionStatus).toBe('OPTIONAL');
  });

  test('manual transport and activity supplier quotes work when no contracted period exists', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    const transport = await service.addItineraryItem('day-own', {
      type: 'TRANSPORT', title: 'Manual transport', description: 'Custom route',
      metadata: { vehicleCategoryId: 'vehicle-1', serviceType: 'CUSTOM', startDate: '2026-10-01', routeName: 'Custom route', vehicleDays: 2, vehicleCount: 1, nightHalts: 0, occurrences: 1, distanceKm: 0, hours: 0, packageRateRequest: { entryMode: 'TOTAL_SERVICE', amount: 8_500, taxTreatment: 'NET' } },
    }, executive);
    expect(transport.item.metadata).toMatchObject({ costSource: 'MANUAL_SUPPLIER_QUOTE' });
    expect(transport.item.metadata?.rateId).toBeUndefined();

    const activity = await service.addItineraryItem('day-own', {
      type: 'ACTIVITY', title: 'Manual activity', description: 'Private guide',
      metadata: { activityId: 'activity-1', date: '2026-10-01', adults: 2, children: 0, infants: 0, vehicles: 1, groups: 1, tickets: 2, hours: 1, days: 1, sessions: 1, inclusionStatus: 'INCLUDED', packageRateRequest: { entryMode: 'FLAT_TOTAL', amount: 3_000, taxTreatment: 'NET' } },
    }, executive);
    expect(activity.item.metadata).toMatchObject({ costSource: 'MANUAL_SUPPLIER_QUOTE' });
    expect(activity.item.metadata?.rateId).toBeUndefined();
  });

  test('customer copy edits are non-commercial, audited, and do not invalidate costing', async () => {
    const { storage, service } = harness();
    const result = await service.updateItineraryDay('day-own', {
      title: 'A Gentle Arrival in Srinagar',
      description: 'Meet your driver and settle into your planned stay at an easy pace.',
    }, executive);
    expect(result.trip.costingStatus).toBe('CALCULATED');
    expect(storage.rawGet('trips', 'trip-own')?.costingStatus).toBe('CALCULATED');
    expect(storage.rawList('audit_logs')).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'ITINERARY_DAY_TITLE_CHANGED', actorId: 'exec-1' }),
      expect.objectContaining({ action: 'ITINERARY_DAY_DESCRIPTION_CHANGED', actorId: 'exec-1' }),
    ]));
  });

  test('customer-relevant service changes preserve copy and require explicit review', async () => {
    const { storage, service } = harness();
    const original = storage.rawGet('itinerary_days', 'day-own');
    const changed = await service.addItineraryItem('day-own', {
      type: 'SIGHTSEEING', title: 'Dal Lake walk', description: 'A relaxed lakeside walk.',
    }, executive);
    expect(changed.day.title).toBe(original.title);
    expect(changed.day.description).toBe(original.description);
    expect(changed.day.customerContent?.status).toBe('REVIEW_NEEDED');

    await expectError(
      service.composeItineraryDayCustomerContent('day-own', { confirmReplace: false }, executive),
      'ITINERARY_CONTENT_REPLACE_CONFIRMATION_REQUIRED', 409,
    );
    const rebuilt = await service.composeItineraryDayCustomerContent('day-own', { confirmReplace: true }, executive);
    expect(rebuilt.day.customerContent).toMatchObject({ status: 'CURRENT', reviewedByEmployeeId: 'exec-1' });
    expect(rebuilt.trip.costingStatus).toBe('PENDING');

    const locationChange = await service.updateItineraryDay('day-own', { location: 'Gulmarg' }, executive);
    expect(locationChange.day.customerContent?.status).toBe('REVIEW_NEEDED');
    const reviewed = await service.reviewItineraryDayCustomerContent('day-own', executive);
    expect(reviewed.day.customerContent).toMatchObject({ status: 'CURRENT', reviewedByEmployeeId: 'exec-1' });
    expect(storage.rawList('audit_logs').some(value => value.action === 'ITINERARY_DAY_REVIEWED' && value.actorId === 'exec-1')).toBe(true);
  });
});
