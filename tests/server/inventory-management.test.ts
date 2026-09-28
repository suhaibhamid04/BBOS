import { beforeEach, describe, expect, it } from 'bun:test';
import {
  InMemoryInventoryStorage,
  InventoryManagementError,
  InventoryManagementService,
  type InventoryActor,
} from '../../server/services/inventoryManagementService';

const founder: InventoryActor = {
  firebaseUid: 'firebase-founder-not-employee-id',
  employeeId: 'emp-founder-01',
  name: 'Founder',
  role: 'Founder',
  active: true,
};
const admin: InventoryActor = { ...founder, firebaseUid: 'firebase-admin', employeeId: 'emp-admin-01', name: 'Admin', role: 'Admin' };
const reservations: InventoryActor = { ...founder, employeeId: 'emp-res-01', name: 'Reservations', role: 'Reservations' };
const operations: InventoryActor = { ...founder, employeeId: 'emp-ops-01', name: 'Operations', role: 'Operations' };

describe('UX1 authoritative inventory management', () => {
  let storage: InMemoryInventoryStorage;
  let service: InventoryManagementService;

  beforeEach(() => {
    storage = new InMemoryInventoryStorage();
    service = new InventoryManagementService(storage, () => new Date('2026-09-28T10:00:00.000Z'));
  });

  async function supplier(type: 'HOTEL' | 'TRANSPORT' | 'ACTIVITY', name: string) {
    return service.createSupplier(type, { name, city: 'Srinagar', active: true }, founder);
  }

  it('creates, edits and soft-disables a property with a stable server ID', async () => {
    const hotelSupplier = await supplier('HOTEL', 'Hotel Partner');
    const created = await service.createProperty({
      name: 'Lake View', propertyType: 'HOTEL', location: 'Boulevard Road', city: 'Srinagar',
      supplierId: hotelSupplier.id, amenities: ['WiFi'], status: 'ACTIVE',
    }, founder);
    const updated = await service.updateProperty(created.id, { name: 'Lake View Grand' }, admin);
    const disabled = await service.updateProperty(created.id, { status: 'INACTIVE' }, founder);

    expect(created.id.startsWith('property-')).toBe(true);
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Lake View Grand');
    expect(disabled.status).toBe('INACTIVE');
    expect(storage.audits.map((entry) => entry.action)).toContain('PROPERTY_DISABLED');
  });

  it('persists multiple room categories without overwriting and preserves their IDs', async () => {
    const property = await service.createProperty({ name: 'Pine Hotel', propertyType: 'HOTEL', location: 'Pahalgam', city: 'Pahalgam' }, founder);
    const deluxe = await service.createRoom({ propertyId: property.id, name: 'Deluxe', maxAdults: 2, maxChildren: 1 }, founder);
    const family = await service.createRoom({ propertyId: property.id, name: 'Family Suite', maxAdults: 4, maxChildren: 2 }, founder);
    const edited = await service.updateRoom(deluxe.id, { bedConfiguration: 'King' }, admin);
    const rooms = await service.listRooms(property.id, operations);

    expect(rooms).toHaveLength(2);
    expect(new Set(rooms.map((room) => room.id)).size).toBe(2);
    expect(edited.id).toBe(deluxe.id);
    expect(rooms.find((room) => room.id === family.id)?.name).toBe('Family Suite');
  });

  it('supports meal plans and occupancy supplements while rejecting ambiguous overlapping rates', async () => {
    const property = await service.createProperty({ name: 'Snow Hotel', propertyType: 'HOTEL', location: 'Gulmarg', city: 'Gulmarg' }, founder);
    const room = await service.createRoom({ propertyId: property.id, name: 'Mountain Room' }, founder);
    const rate = await service.createAccommodationRate({
      propertyId: property.id, roomCategoryId: room.id, mealPlan: 'MAP', validFrom: '2026-10-01', validTo: '2026-12-31', baseRate: 8500,
      supplements: [{ type: 'EB', name: 'Extra bed', amount: 1800, unit: 'per_person_night' }, { type: 'CWB', name: 'Child with bed', amount: 1200, unit: 'per_child_night' }],
    }, founder);

    expect(rate.supplements.map((item) => item.type)).toEqual(['EB', 'CWB']);
    await expect(service.createAccommodationRate({
      propertyId: property.id, roomCategoryId: room.id, mealPlan: 'MAP', validFrom: '2026-12-01', validTo: '2027-01-31', baseRate: 9000,
    }, founder)).rejects.toMatchObject({ statusCode: 409, code: 'AMBIGUOUS_RATE_PERIOD' });
    expect(await service.listAllAccommodationRates(reservations)).toHaveLength(1);
  });

  it('creates distinct vehicles and validates transport supplier and rate validity', async () => {
    const provider = await supplier('TRANSPORT', 'Valley Cabs');
    const sedan = await service.createVehicle({ name: 'Sedan', displayName: 'Sedan AC', category: 'SEDAN', seatingCapacity: 5, passengerCapacity: 4, operationalRegions: ['Kashmir'], features: ['AC'] }, founder);
    const innova = await service.createVehicle({ name: 'Innova', displayName: 'Innova Crysta', category: 'MUV', seatingCapacity: 7, passengerCapacity: 6, operationalRegions: ['Kashmir'], features: ['AC'] }, founder);
    const rate = await service.createTransportRate({ vehicleCategoryId: innova.id, supplierId: provider.id, serviceType: 'MULTI_DAY_JOURNEY', pricingUnit: 'PER_DAY', baseRate: 6500, validFrom: '2026-10-01', validTo: '2027-03-31' }, admin);

    expect(sedan.id).not.toBe(innova.id);
    expect(rate.pricingUnit).toBe('PER_DAY');
    expect(rate.vehicleCategoryId).toBe(innova.id);
    await expect(service.createTransportRate({ vehicleCategoryId: innova.id, supplierId: provider.id, serviceType: 'MULTI_DAY_JOURNEY', pricingUnit: 'PER_DAY', baseRate: 7000, validFrom: '2027-01-01', validTo: '2027-06-30' }, founder)).rejects.toMatchObject({ code: 'AMBIGUOUS_RATE_PERIOD' });
  });

  it('creates activity providers, activities and flexible contracted rates', async () => {
    const provider = await supplier('ACTIVITY', 'Adventure Co');
    const activity = await service.createActivity({ name: 'River Rafting', category: 'RAFTING', destinationId: 'pahalgam', supplierId: provider.id, description: 'Guided rafting', customerDescription: 'A scenic guided run', duration: '2 hours' }, founder);
    const rate = await service.createActivityRate({ activityId: activity.id, supplierId: provider.id, pricingModel: 'PER_PERSON', pricingComponents: { adult: 2200, child: 1600 }, validFrom: '2026-05-01', validTo: '2026-10-31' }, admin);

    expect(rate.activityId).toBe(activity.id);
    expect(rate.pricingComponents).toEqual({ adult: 2200, child: 1600 });
    expect((await service.listActivities(operations))[0].supplierId).toBeUndefined();
  });

  it('keeps supplier rates available to Reservations but inaccessible to Operations', async () => {
    await expect(service.listTransportRates(operations)).rejects.toBeInstanceOf(InventoryManagementError);
    await expect(service.listActivityRates(operations)).rejects.toMatchObject({ statusCode: 403 });
    expect(await service.listTransportRates(reservations)).toEqual([]);
    expect(await service.listActivityRates(reservations)).toEqual([]);
  });

  it('allows only Founder/Admin mutations and fails closed for inactive or unknown roles', async () => {
    await expect(service.createProperty({ name: 'Denied', propertyType: 'HOTEL', location: 'X', city: 'X' }, operations)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.createVehicle({ name: 'Denied' }, reservations)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.listProperties({ ...founder, role: 'Unknown Role' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.listProperties({ ...founder, active: false })).rejects.toMatchObject({ statusCode: 403 });
    expect(storage.mutationCount).toBe(0);
  });

  it('rejects client-controlled IDs/timestamps and records the canonical employeeId in audits', async () => {
    await expect(service.createProperty({ id: 'forged', name: 'Bad', propertyType: 'HOTEL', location: 'X', city: 'X', createdAt: '2000-01-01' }, founder)).rejects.toMatchObject({ code: 'PROTECTED_INVENTORY_FIELD' });
    const property = await service.createProperty({ name: 'Audited', propertyType: 'HOTEL', location: 'X', city: 'X' }, founder);
    const entry = storage.audits.find((audit) => audit.entityId === property.id)!;
    expect(entry.actorId).toBe('emp-founder-01');
    expect(entry.actorId).not.toBe(founder.firebaseUid);
  });
});
