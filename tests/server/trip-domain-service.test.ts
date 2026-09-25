import { describe, expect, test } from 'bun:test';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import {
  TripDomainError,
  TripService,
  type TripMutationActor,
} from '../../server/services/tripService';

const executive: TripMutationActor = {
  firebaseUid: 'firebase-exec-1',
  employeeId: 'exec-1',
  name: 'Executive One',
  role: 'Sales Executive',
  active: true,
  salesTeamId: 'team-a',
};

const manager: TripMutationActor = {
  firebaseUid: 'firebase-manager-1',
  employeeId: 'manager-1',
  name: 'Manager One',
  role: 'Sales Manager',
  active: true,
  salesTeamId: 'team-a',
};

function tripInput(overrides: Record<string, unknown> = {}) {
  return {
    customerId: 'customer-1',
    title: 'Kashmir Escape',
    destination: 'Kashmir',
    startDate: '2026-10-01',
    endDate: '2026-10-05',
    travelerCount: 3,
    adults: 2,
    children: 1,
    tripType: 'LEISURE',
    currency: 'INR',
    budget: 1200,
    totalSellingPrice: 1000,
    ...overrides,
  };
}

function storedTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trip-1',
    ...tripInput(),
    status: 'DRAFT',
    totalSupplierCost: 100,
    grossProfit: 900,
    grossMargin: 90,
    assignedSalesEmployeeId: 'exec-1',
    salesTeamId: 'team-a',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function harness(trips: Record<string, unknown>[] = []) {
  const storage = new InMemoryConversionStorageProvider({ trips });
  storage.rawSet('customers', 'customer-1', { id: 'customer-1', name: 'Customer One' });
  storage.rawSet('customers', 'customer-2', { id: 'customer-2', name: 'Customer Two' });
  storage.rawSet('employees', 'employee-doc-exec-2', {
    id: 'employee-doc-exec-2',
    employeeId: 'exec-2',
    name: 'Executive Two',
    role: 'Sales Executive',
    active: true,
    salesTeamId: 'team-a',
  });
  storage.rawSet('employees', 'employee-doc-exec-3', {
    id: 'employee-doc-exec-3',
    employeeId: 'exec-3',
    name: 'Executive Three',
    role: 'Sales Executive',
    active: true,
    salesTeamId: 'team-b',
  });
  storage.rawSet('leads', 'lead-team-a', {
    id: 'lead-team-a', customerId: 'customer-1', assignedEmployeeId: 'exec-2',
  });
  storage.rawSet('leads', 'lead-team-b', {
    id: 'lead-team-b', customerId: 'customer-1', assignedEmployeeId: 'exec-3',
  });
  return { storage, service: new TripService(storage) };
}

async function expectTripError(promise: Promise<unknown>, code: string, statusCode: number) {
  try {
    await promise;
    throw new Error('Expected TripDomainError');
  } catch (error) {
    expect(error).toBeInstanceOf(TripDomainError);
    expect((error as TripDomainError).code).toBe(code);
    expect((error as TripDomainError).statusCode).toBe(statusCode);
  }
}

describe('Stage D2A server-authoritative Trip mutations', () => {
  test('Sales Executive creates an OWN Trip with server-owned scope and financials', async () => {
    const { service } = harness();
    const trip = await service.createTrip(tripInput(), executive);

    expect(trip.assignedSalesEmployeeId).toBe('exec-1');
    expect(trip.salesTeamId).toBe('team-a');
    expect(trip.status).toBe('DRAFT');
    expect(trip.totalSupplierCost).toBe(0);
    expect(trip.totalSellingPrice).toBe(1000);
    expect(trip.grossProfit).toBe(1000);
    expect(trip.grossMargin).toBe(100);
    expect(trip.createdByEmployeeId).toBe('exec-1');
  });

  test('Sales Executive updates OWN Trip and selling-price financials are derived from stored cost', async () => {
    const { service } = harness([storedTrip()]);
    const trip = await service.updateTrip('trip-1', { totalSellingPrice: 500 }, executive);

    expect(trip.totalSupplierCost).toBe(100);
    expect(trip.totalSellingPrice).toBe(500);
    expect(trip.grossProfit).toBe(400);
    expect(trip.grossMargin).toBe(80);
    expect(trip.updatedByEmployeeId).toBe('exec-1');
  });

  test('Sales Executive cannot update another Executive Trip and causes zero Trip write', async () => {
    const original = storedTrip({ assignedSalesEmployeeId: 'exec-2' });
    const { storage, service } = harness([original]);

    await expectTripError(service.updateTrip('trip-1', { title: 'Unauthorized' }, executive), 'RESOURCE_ACCESS_DENIED', 403);
    expect(storage.rawGet('trips', 'trip-1')).toEqual(original);
  });

  test('Sales Manager updates same-team Trip but not another team', async () => {
    const sameTeam = storedTrip({ id: 'trip-team', assignedSalesEmployeeId: 'exec-2' });
    const otherTeam = storedTrip({ id: 'trip-other', assignedSalesEmployeeId: 'exec-3', salesTeamId: 'team-b' });
    const { storage, service } = harness([sameTeam, otherTeam]);

    const updated = await service.updateTrip('trip-team', { title: 'Manager Approved' }, manager);
    expect(updated.title).toBe('Manager Approved');
    expect(updated.assignedSalesEmployeeId).toBe('exec-2');

    await expectTripError(service.updateTrip('trip-other', { title: 'Denied' }, manager), 'RESOURCE_ACCESS_DENIED', 403);
    expect(storage.rawGet('trips', 'trip-other')).toEqual(otherTeam);
  });

  test('Sales Manager create derives TEAM owner from authoritative Lead assignment', async () => {
    const { service } = harness();
    const trip = await service.createTrip(tripInput({ leadId: 'lead-team-a' }), manager);
    expect(trip.assignedSalesEmployeeId).toBe('exec-2');
    expect(trip.salesTeamId).toBe('team-a');

    await expectTripError(
      service.createTrip(tripInput({ leadId: 'lead-team-b' }), manager),
      'LINKED_LEAD_ACCESS_DENIED',
      403,
    );
  });

  test('Founder and Admin can update Trips across Sales teams without changing attribution', async () => {
    for (const role of ['Founder', 'Admin'] as const) {
      const original = storedTrip({ assignedSalesEmployeeId: 'exec-3', salesTeamId: 'team-b' });
      const { service } = harness([original]);
      const updated = await service.updateTrip('trip-1', { title: `${role} update` }, { ...executive, role });
      expect(updated.title).toBe(`${role} update`);
      expect(updated.assignedSalesEmployeeId).toBe('exec-3');
      expect(updated.salesTeamId).toBe('team-b');
    }
  });

  test('client cannot mutate owner, team, supplier cost, profit, margin, or workflow state', async () => {
    const controlledFields = [
      ['assignedSalesEmployeeId', 'exec-9'],
      ['salesTeamId', 'team-z'],
      ['totalSupplierCost', 1],
      ['grossProfit', 999],
      ['grossMargin', 99],
      ['status', 'BOOKED'],
    ] as const;

    for (const [field, value] of controlledFields) {
      const original = storedTrip();
      const { storage, service } = harness([original]);
      await expectTripError(
        service.updateTrip('trip-1', { [field]: value }, executive),
        'SERVER_CONTROLLED_TRIP_FIELD',
        400,
      );
      expect(storage.rawGet('trips', 'trip-1')).toEqual(original);
    }
  });

  test('selling price must be finite and non-negative and invalid input causes zero write', async () => {
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const original = storedTrip();
      const { storage, service } = harness([original]);
      await expectTripError(
        service.updateTrip('trip-1', { totalSellingPrice: invalid }, executive),
        'INVALID_TRIP_FIELD',
        400,
      );
      expect(storage.rawGet('trips', 'trip-1')).toEqual(original);
    }
  });

  test('Accounts, Reservations, Operations, and Marketing have no commercial mutation authority', async () => {
    for (const role of ['Accounts', 'Reservations', 'Operations', 'Marketing'] as const) {
      const original = storedTrip();
      const { storage, service } = harness([original]);
      await expectTripError(
        service.updateTrip('trip-1', { title: `${role} edit` }, { ...executive, role }),
        'ROLE_DENIED',
        403,
      );
      expect(storage.rawGet('trips', 'trip-1')).toEqual(original);
    }
  });

  test('Firestore rules prohibit direct browser Trip create/update bypasses', async () => {
    const rules = await Bun.file(new URL('../../firestore.rules', import.meta.url)).text();
    const tripBlock = rules.match(/match \/trips\/\{tripId\} \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    expect(tripBlock).toContain('allow create, update: if false;');
  });
});
