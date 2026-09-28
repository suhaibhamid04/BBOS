import { describe, expect, it } from 'bun:test';
import {
  InMemoryConfirmationStorageProvider,
  ServiceConfirmationService,
  type ConfirmationActor,
} from '../../server/services/serviceConfirmationService';
import type { Booking, BookingActivity, BookingTransport } from '../../src/types/booking';

function principal(
  role: ConfirmationActor['role'],
  employeeId: string,
): ConfirmationActor {
  return {
    firebaseUid: `firebase-${employeeId}`,
    employeeId,
    role,
    name: `${role} user`,
    active: true,
  };
}

const assignedOperations = principal('Operations', 'operations-01');

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-d3c',
    bookingReference: 'BBOS-D3C',
    tripId: 'trip-d3c',
    customerId: 'customer-d3c',
    status: 'IN_OPERATIONS',
    paymentStatus: 'PAID',
    amountReceived: 10000,
    amountPending: 0,
    travelStartDate: '2026-12-01',
    travelEndDate: '2026-12-03',
    assignedOperationsEmployeeId: assignedOperations.employeeId,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function transport(overrides: Partial<BookingTransport> = {}): BookingTransport {
  return {
    id: 'transport-d3c',
    bookingId: 'booking-d3c',
    tripId: 'trip-d3c',
    customerId: 'customer-d3c',
    vehicleCategoryId: 'vehicle-01',
    vehicleCategoryName: 'SUV',
    routeName: 'Airport to Hotel',
    serviceDate: '2026-12-01',
    daysCount: 1,
    pickupLocation: 'Airport',
    dropoffLocation: 'Hotel',
    passengerCount: 2,
    supplierId: 'supplier-transport',
    confirmationStatus: 'REQUESTED',
    voucherStatus: 'PENDING',
    schemaVersion: '2B-5',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function activity(overrides: Partial<BookingActivity> = {}): BookingActivity {
  return {
    id: 'activity-d3c',
    bookingId: 'booking-d3c',
    tripId: 'trip-d3c',
    customerId: 'customer-d3c',
    activityMasterId: 'activity-master-01',
    activityName: 'City Tour',
    destinationId: 'destination-01',
    destinationName: 'City',
    serviceDate: '2026-12-02',
    participantCount: 2,
    supplierId: 'supplier-activity',
    confirmationStatus: 'REQUESTED',
    voucherStatus: 'PENDING',
    schemaVersion: '2B-5',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(bookingOverrides: Partial<Booking> = {}) {
  const storage = new InMemoryConfirmationStorageProvider({
    bookings: [booking(bookingOverrides)],
    transports: [transport()],
    activities: [activity()],
  });
  return { storage, service: new ServiceConfirmationService(storage) };
}

describe('Stage D3C Booking authority lockdown', () => {
  it('denies all direct production Booking root mutations, including status, ownership, and assignments', async () => {
    const rules = await Bun.file(new URL('../../firestore.rules', import.meta.url)).text();
    const bookingRules = rules.match(/match \/bookings\/\{bookingId\} \{([\s\S]*?)match \/financial_snapshot/)?.[1] ?? '';

    expect(bookingRules).toContain('allow read: if false;');
    expect(bookingRules).toContain('allow create, update, delete: if false;');
    for (const protectedField of [
      'status', 'assignedSalesEmployeeId', 'salesTeamId',
      'assignedReservationsEmployeeId', 'assignedOperationsEmployeeId',
      'amountReceived', 'amountPending', 'paymentStatus',
      'confirmationProgress', 'totalSellingPrice',
    ]) {
      expect(bookingRules).toContain(protectedField);
    }
  });

  it('prevents Sales from forging CONFIRMED and Operations from forging IN_OPERATIONS through legacy browser paths', async () => {
    const contextSource = await Bun.file(new URL('../../src/context/DataContext.tsx', import.meta.url)).text();
    const repositorySource = await Bun.file(new URL('../../src/services/db/repositories.ts', import.meta.url)).text();

    expect(contextSource).toContain('Production Booking creation is server-authoritative');
    expect(contextSource).toContain('Production Booking updates are server-authoritative');
    expect(contextSource).not.toContain("setDoc(doc(db, 'bookings'");
    expect(repositorySource).not.toContain("BookingRepo = new FirestoreRepository<any>('bookings')");
  });

  it('allows assigned Operations to confirm transport and activity atomically', async () => {
    const { storage, service } = setup();

    await service.confirmTransport('booking-d3c', 'transport-d3c', {
      confirmationStatus: 'CONFIRMED',
      driverName: 'Assigned Driver',
    }, assignedOperations);
    expect(storage.getTransportSync('transport-d3c')).toMatchObject({
      confirmationStatus: 'CONFIRMED',
      driverName: 'Assigned Driver',
    });
    expect(storage.getBookingSync('booking-d3c')?.confirmationProgress?.confirmedServices).toBe(1);
    expect(storage.getAllAuditLogs()).toHaveLength(1);
    expect(storage.getMutationCount()).toBe(3);

    await service.confirmActivity('booking-d3c', 'activity-d3c', {
      confirmationStatus: 'CONFIRMED',
      supplierConfirmationCode: 'ACTIVITY-CNF-01',
    }, assignedOperations);
    expect(storage.getActivitySync('activity-d3c')?.confirmationStatus).toBe('CONFIRMED');
    expect(storage.getBookingSync('booking-d3c')?.confirmationProgress?.allConfirmed).toBe(true);
    expect(storage.getAllAuditLogs()).toHaveLength(2);
    expect(storage.getMutationCount()).toBe(6);
  });

  it('denies Operations when assignment metadata is missing with zero writes', async () => {
    const { storage, service } = setup({ assignedOperationsEmployeeId: undefined });

    await expect(service.confirmTransport(
      'booking-d3c', 'transport-d3c', { confirmationStatus: 'CONFIRMED' }, assignedOperations,
    )).rejects.toMatchObject({ statusCode: 403, code: 'MISSING_SCOPE_METADATA' });
    expect(storage.getMutationCount()).toBe(0);
  });

  it('denies another Operations employee with zero writes', async () => {
    const { storage, service } = setup();
    const anotherOperations = principal('Operations', 'operations-02');

    await expect(service.confirmActivity(
      'booking-d3c', 'activity-d3c', { confirmationStatus: 'CONFIRMED' }, anotherOperations,
    )).rejects.toMatchObject({ statusCode: 403, code: 'SCOPE_MISMATCH' });
    expect(storage.getMutationCount()).toBe(0);
  });

  for (const role of ['Founder', 'Admin'] as const) {
    it(`allows ${role} without Operations assignment`, async () => {
      const { storage, service } = setup({ assignedOperationsEmployeeId: 'operations-other' });
      await service.confirmTransport(
        'booking-d3c',
        'transport-d3c',
        { confirmationStatus: 'CONFIRMED' },
        principal(role, `${role.toLowerCase()}-01`),
      );
      expect(storage.getTransportSync('transport-d3c')?.confirmationStatus).toBe('CONFIRMED');
    });
  }

  it('uses canonical employeeId for audit even when compatibility aliases differ', async () => {
    const { storage, service } = setup();
    const actor = {
      ...assignedOperations,
      id: 'legacy-id-must-not-win',
      uid: 'firebase-or-legacy-uid-must-not-win',
    } as ConfirmationActor & { id: string; uid: string };

    await service.confirmActivity(
      'booking-d3c', 'activity-d3c', { confirmationStatus: 'CONFIRMED' }, actor,
    );
    expect(storage.getAllAuditLogs()[0].actorId).toBe(assignedOperations.employeeId);
  });

  it('denies non-Operations roles before any service or Booking write', async () => {
    const { storage, service } = setup();

    await expect(service.confirmTransport(
      'booking-d3c',
      'transport-d3c',
      { confirmationStatus: 'CONFIRMED' },
      principal('Sales Executive', 'sales-01'),
    )).rejects.toMatchObject({ statusCode: 403, code: 'ROLE_DENIED' });
    expect(storage.getMutationCount()).toBe(0);
  });

  it('blocks direct browser confirmation writes for transport and activity', async () => {
    const rules = await Bun.file(new URL('../../firestore.rules', import.meta.url)).text();
    const transportRules = rules.match(/match \/booking_transports\/\{docId\} \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    const activityRules = rules.match(/match \/booking_activities\/\{docId\} \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    expect(transportRules).toContain("'confirmationStatus'");
    expect(transportRules).toContain("'driverName'");
    expect(activityRules).toContain("'confirmationStatus'");
    expect(activityRules).toContain("'supplierConfirmationCode'");
  });
});
