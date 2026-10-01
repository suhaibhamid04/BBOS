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
  storage.rawSet('room_categories', 'room-1', { id: 'room-1', propertyId: 'property-1', name: 'Premier Room', active: true });
  storage.rawSet('rate_periods', 'rate-1', { id: 'rate-1', propertyId: 'property-1', roomCategoryId: 'room-1', mealPlan: 'MAP', validFrom: '2026-10-01', validTo: '2026-10-31', status: 'ACTIVE' });
  storage.rawSet('accommodation_properties', 'property-2', { id: 'property-2', name: 'Lake Hotel', supplierId: 'supplier-1', status: 'ACTIVE' });
  storage.rawSet('room_categories', 'room-2', { id: 'room-2', propertyId: 'property-2', name: 'Lake Suite', active: true });
  storage.rawSet('rate_periods', 'rate-2', { id: 'rate-2', propertyId: 'property-2', roomCategoryId: 'room-2', mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2026-10-31', status: 'ACTIVE' });
  storage.rawSet('vehicle_categories', 'vehicle-1', { id: 'vehicle-1', name: 'Innova', displayName: 'Innova', active: true });
  storage.rawSet('transport_rate_periods', 'transport-rate-1', { id: 'transport-rate-1', vehicleCategoryId: 'vehicle-1', supplierId: 'supplier-1', serviceType: 'MULTI_DAY_JOURNEY', pricingUnit: 'PER_DAY', validFrom: '2026-10-01', validTo: '2026-10-31', status: 'ACTIVE' });
  storage.rawSet('activity_masters', 'activity-1', { id: 'activity-1', name: 'Shikara Ride', duration: '1 Hour', active: true });
  storage.rawSet('activity_rate_periods', 'activity-rate-1', { id: 'activity-rate-1', activityId: 'activity-1', supplierId: 'supplier-1', pricingModel: 'PER_PERSON', validFrom: '2026-10-01', validTo: '2026-10-31', status: 'ACTIVE' });
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

  test('hotel rate must cover every night and a failed replacement preserves the original item', async () => {
    const { storage, service } = harness(); seedInventory(storage);
    storage.rawSet('rate_periods', 'short-rate', { id: 'short-rate', propertyId: 'property-2', roomCategoryId: 'room-2', mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2026-10-03', status: 'ACTIVE' });
    const created = await service.addItineraryItem('day-own', {
      type: 'HOTEL', title: 'Original', description: 'Original',
      metadata: { inventoryType: 'ACCOMMODATION', propertyId: 'property-1', roomCategoryId: 'room-1', rateId: 'rate-1', mealPlan: 'MAP', checkInDate: '2026-10-02', nights: 2, rooms: 1, adults: 2, children: 0, childrenWithBed: 0, childrenWithoutBed: 0 },
    }, executive);
    const before = storage.rawGet('itinerary_days', 'day-own');
    await expectError(service.updateItineraryItem('day-own', created.item.id, {
      type: 'HOTEL', title: 'Replacement', description: 'Replacement',
      metadata: { inventoryType: 'ACCOMMODATION', propertyId: 'property-2', roomCategoryId: 'room-2', rateId: 'short-rate', mealPlan: 'CP', checkInDate: '2026-10-03', nights: 2, rooms: 1, adults: 2, children: 0, childrenWithBed: 0, childrenWithoutBed: 0 },
    }, executive), 'INVENTORY_RATE_MISMATCH', 422);
    expect(storage.rawGet('itinerary_days', 'day-own')).toEqual(before);
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
    }, executive), 'TRIP_COSTING_INCOMPLETE', 422);
    expect(storage.getAllAuditLogs()).toHaveLength(0);
  });

  test('Firestore rules prohibit direct browser itinerary and Trip deletion writes', async () => {
    const rules = await Bun.file(new URL('../../firestore.rules', import.meta.url)).text();
    expect(rules).toContain('allow create, update, delete: if false;');
    const tripBlock = rules.match(/match \/trips\/\{tripId\} \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    expect(tripBlock).toContain('allow delete: if false;');
  });
});
