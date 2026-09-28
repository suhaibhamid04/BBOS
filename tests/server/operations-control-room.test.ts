import { describe, expect, it } from 'bun:test';
import {
  InMemoryOperationsControlRoomStorage,
  OperationsControlRoomError,
  OperationsControlRoomService,
  type OperationalBookingBundle,
  type OperationsActor,
} from '../../server/services/operationsControlRoomService';
import type {
  Booking,
  BookingAccommodation,
  BookingActivity,
  BookingTransport,
} from '../../src/types/booking';
import type { UserRole } from '../../src/types';

const NOW = new Date('2026-09-28T06:00:00.000Z');

function actor(role: UserRole, employeeId: string): OperationsActor {
  return {
    firebaseUid: `firebase-${employeeId}`,
    employeeId,
    role,
    active: true,
    name: `${role} User`,
  };
}

const founder = actor('Founder', 'employee-founder');
const admin = actor('Admin', 'employee-admin');
const operationsOne = actor('Operations', 'employee-operations-01');
const operationsTwo = actor('Operations', 'employee-operations-02');

function booking(id: string, overrides: Partial<Booking> = {}): Booking {
  return {
    id,
    bookingReference: `BBOS-${id}`,
    tripId: `trip-${id}`,
    customerId: `customer-${id}`,
    customerName: `Guest ${id}`,
    customerPhone: '+91 9000000000',
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    totalSellingPrice: 80_000,
    amountReceived: 80_000,
    amountPending: 0,
    travelStartDate: '2026-09-28',
    travelEndDate: '2026-10-01',
    assignedSalesEmployeeId: 'employee-sales-01',
    salesTeamId: 'sales-team-01',
    assignedOperationsEmployeeId: 'employee-operations-01',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function accommodation(bookingId: string, overrides: Partial<BookingAccommodation> = {}): BookingAccommodation {
  return {
    id: `hotel-${bookingId}`,
    bookingId,
    tripId: `trip-${bookingId}`,
    customerId: `customer-${bookingId}`,
    propertyId: 'property-01',
    propertyName: 'Lake Hotel',
    roomCategoryId: 'deluxe',
    roomCategoryName: 'Deluxe',
    mealPlan: 'CP',
    checkInDate: '2026-09-28',
    checkOutDate: '2026-10-01',
    nightsCount: 3,
    roomsCount: 1,
    adultsCount: 2,
    childrenCount: 0,
    guestNames: ['Primary Guest'],
    supplierId: 'supplier-hotel',
    supplierContactPhone: '+91 9111111111',
    confirmationStatus: 'CONFIRMED',
    supplierConfirmationCode: 'HOTEL-CNF-1',
    voucherStatus: 'GENERATED',
    schemaVersion: '2B-5',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function transport(bookingId: string, overrides: Partial<BookingTransport> = {}): BookingTransport {
  return {
    id: `transport-${bookingId}`,
    bookingId,
    tripId: `trip-${bookingId}`,
    customerId: `customer-${bookingId}`,
    vehicleCategoryId: 'vehicle-suv',
    vehicleCategoryName: 'SUV',
    routeName: 'Airport to Hotel',
    serviceDate: '2026-09-28',
    daysCount: 1,
    pickupLocation: 'Srinagar Airport',
    dropoffLocation: 'Lake Hotel',
    pickupTime: '10:30',
    passengerCount: 2,
    supplierId: 'supplier-transport',
    driverName: 'Driver One',
    driverPhone: '+91 9222222222',
    vehicleRegistrationNumber: 'JK01AB1234',
    confirmationStatus: 'CONFIRMED',
    voucherStatus: 'PENDING',
    schemaVersion: '2B-5',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function activity(bookingId: string, overrides: Partial<BookingActivity> = {}): BookingActivity {
  return {
    id: `activity-${bookingId}`,
    bookingId,
    tripId: `trip-${bookingId}`,
    customerId: `customer-${bookingId}`,
    activityMasterId: 'activity-shikara',
    activityName: 'Shikara Ride',
    destinationId: 'destination-srinagar',
    destinationName: 'Srinagar',
    serviceDate: '2026-09-30',
    sessionTime: '16:00',
    participantCount: 2,
    supplierId: 'supplier-activity',
    confirmationStatus: 'CONFIRMED',
    voucherStatus: 'PENDING',
    schemaVersion: '2B-5',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function bundle(root: Booking, options: {
  accommodations?: BookingAccommodation[];
  transports?: BookingTransport[];
  activities?: BookingActivity[];
} = {}): OperationalBookingBundle {
  return {
    booking: root,
    accommodations: options.accommodations || [],
    transports: options.transports || [],
    activities: options.activities || [],
    suppliers: [],
  };
}

function setup(bundles?: OperationalBookingBundle[]) {
  const defaultBooking = booking('assigned-one');
  const storage = new InMemoryOperationsControlRoomStorage({
    bundles: bundles || [bundle(defaultBooking, {
      accommodations: [accommodation(defaultBooking.id)],
      transports: [transport(defaultBooking.id)],
      activities: [activity(defaultBooking.id)],
    })],
    employees: [
      { employeeId: 'employee-operations-01', name: 'Operations One', role: 'Operations', active: true },
      { employeeId: 'employee-operations-02', name: 'Operations Two', role: 'Operations', active: true },
      { employeeId: 'employee-operations-inactive', name: 'Inactive Operations', role: 'Operations', active: false },
      { employeeId: 'employee-sales-01', name: 'Sales User', role: 'Sales Executive', active: true },
    ],
  });
  return { storage, service: new OperationsControlRoomService(storage, () => NOW) };
}

describe('Stage D5A Operations Control Room', () => {
  it('limits Operations to ASSIGNED Bookings using canonical employeeId', async () => {
    const one = booking('assigned-one');
    const two = booking('assigned-two', { assignedOperationsEmployeeId: operationsTwo.employeeId });
    const { service } = setup([
      bundle(one, { transports: [transport(one.id)] }),
      bundle(two, { transports: [transport(two.id)] }),
    ]);

    const result = await service.getControlRoom({ ...operationsOne, firebaseUid: operationsTwo.employeeId });
    expect([...result.today, ...result.upcoming].every((item) => item.bookingId === one.id)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(two.bookingReference);
  });

  it('fails closed for missing Operations assignment metadata', async () => {
    const unassigned = booking('unassigned-operations', { assignedOperationsEmployeeId: undefined });
    const { service } = setup([bundle(unassigned, { transports: [transport(unassigned.id)] })]);
    const result = await service.getControlRoom(operationsOne);
    expect(result.today).toHaveLength(0);
    expect(result.upcoming).toHaveLength(0);
    expect(result.attentionRequired).toHaveLength(0);
  });

  it('gives Founder/Admin ALL near-term operational scope and fails closed for prohibited roles', async () => {
    const assigned = booking('assigned');
    const unassigned = booking('unassigned', { assignedOperationsEmployeeId: undefined });
    const { service } = setup([
      bundle(assigned, { transports: [transport(assigned.id)] }),
      bundle(unassigned, { transports: [transport(unassigned.id)] }),
    ]);

    for (const leader of [founder, admin]) {
      const result = await service.getControlRoom(leader);
      expect(new Set([...result.today, ...result.upcoming].map((item) => item.bookingId))).toEqual(new Set([assigned.id, unassigned.id]));
    }
    for (const role of ['Accounts', 'Sales Manager', 'Sales Executive', 'Reservations', 'Marketing'] as const) {
      await expect(service.getControlRoom(actor(role, `employee-${role}`))).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it('derives Today and the bounded Upcoming window from stored booking services', async () => {
    const { service } = setup();
    const result = await service.getControlRoom(operationsOne);

    expect(result.asOf).toBe('2026-09-28');
    expect(result.horizonEnd).toBe('2026-10-05');
    expect(new Set(result.today.map((item) => item.type))).toEqual(new Set(['ARRIVAL', 'HOTEL_CHECK_IN', 'TRANSPORT']));
    expect(new Set(result.upcoming.map((item) => item.type))).toEqual(new Set(['DEPARTURE', 'HOTEL_CHECK_OUT', 'ACTIVITY']));
  });

  it("includes today's departure and hotel check-out movements", async () => {
    const root = booking('departing-today', { travelStartDate: '2026-09-25', travelEndDate: '2026-09-28' });
    const { service } = setup([bundle(root, {
      accommodations: [accommodation(root.id, { checkInDate: '2026-09-25', checkOutDate: '2026-09-28' })],
    })]);
    const result = await service.getControlRoom(operationsOne);
    expect(new Set(result.today.map((item) => item.type))).toEqual(new Set(['DEPARTURE', 'HOTEL_CHECK_OUT']));
  });

  it('excludes distant Bookings from the bounded workspace', async () => {
    const distant = booking('distant', { travelStartDate: '2026-12-01', travelEndDate: '2026-12-05' });
    const { service } = setup([bundle(distant, { transports: [transport(distant.id, { serviceDate: '2026-12-01' })] })]);
    const result = await service.getControlRoom(operationsOne);
    expect(result.today).toHaveLength(0);
    expect(result.upcoming).toHaveLength(0);
    expect(result.attentionRequired).toHaveLength(0);
  });

  it('derives attention for unconfirmed services, pending hotel, missing driver/vehicle, and missing data', async () => {
    const root = booking('attention');
    const { service } = setup([bundle(root, {
      accommodations: [accommodation(root.id, { confirmationStatus: 'REQUESTED' })],
      transports: [transport(root.id, {
        confirmationStatus: 'REQUESTED',
        driverName: undefined,
        driverPhone: undefined,
        vehicleRegistrationNumber: undefined,
        pickupLocation: '',
      })],
      activities: [activity(root.id, { activityName: '', destinationName: '', confirmationStatus: 'REQUESTED' })],
    })]);
    const result = await service.getControlRoom(operationsOne);
    const codes = new Set(result.attentionRequired.map((item) => item.code));
    expect(codes).toEqual(new Set([
      'HOTEL_CONFIRMATION_PENDING',
      'SERVICE_UNCONFIRMED',
      'DRIVER_DETAILS_MISSING',
      'VEHICLE_DETAILS_MISSING',
      'REQUIRED_SERVICE_DATA_MISSING',
    ]));
    expect([...result.today, ...result.upcoming].some((item) => item.readiness === 'ATTENTION_REQUIRED')).toBe(true);
  });

  it('does not create false attention for a complete confirmed service', async () => {
    const { service } = setup();
    const result = await service.getControlRoom(operationsOne);
    expect(result.attentionRequired).toHaveLength(0);
    expect([...result.today, ...result.upcoming].every((item) => item.readiness === 'READY')).toBe(true);
  });

  it('marks unreleased commercial workflow as NOT_READY without exposing payment totals', async () => {
    const root = booking('pending', { status: 'PENDING_PAYMENT', assignedOperationsEmployeeId: undefined });
    const { service } = setup([bundle(root, { transports: [transport(root.id)] })]);
    const result = await service.getControlRoom(founder);
    expect(result.today.find((item) => item.type === 'TRANSPORT')?.readiness).toBe('NOT_READY');
    expect(result.attentionRequired.map((item) => item.code)).toContain('BOOKING_NOT_OPERATIONALLY_READY');

    const serialized = JSON.stringify(result);
    for (const forbidden of ['totalSellingPrice', 'supplierCost', 'grossProfit', 'grossMargin', 'amountReceived', 'amountPending', 'paymentStatus']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('returns operational detail fields without financial data', async () => {
    const { service } = setup();
    const result = await service.getControlRoom(operationsOne);
    const transportItem = result.today.find((item) => item.type === 'TRANSPORT');
    expect(transportItem?.details).toMatchObject({
      driverName: 'Driver One',
      driverPhone: '+91 9222222222',
      vehicleRegistrationNumber: 'JK01AB1234',
      pickupLocation: 'Srinagar Airport',
      dropoffLocation: 'Lake Hotel',
    });
    expect((transportItem?.details as Record<string, unknown>).supplierCost).toBeUndefined();
  });

  it('allows Founder/Admin assignment and reassignment with canonical audit actors', async () => {
    for (const leader of [founder, admin]) {
      const root = booking(`assign-${leader.role}`, { assignedOperationsEmployeeId: undefined });
      const { service, storage } = setup([bundle(root, { transports: [transport(root.id)] })]);
      await service.assignOperations(root.id, { operationsEmployeeId: operationsOne.employeeId }, leader);
      await service.assignOperations(root.id, { operationsEmployeeId: operationsTwo.employeeId, reason: 'Shift coverage' }, leader);

      expect(storage.getBookingSync(root.id)?.assignedOperationsEmployeeId).toBe(operationsTwo.employeeId);
      expect(storage.getAudits().map((audit) => audit.action)).toEqual(['OPERATIONS_ASSIGNED', 'OPERATIONS_REASSIGNED']);
      expect(storage.getAudits().every((audit) => audit.actorId === leader.employeeId)).toBe(true);
    }
  });

  it('rejects assignment by Operations and causes zero writes', async () => {
    const root = booking('unauthorized', { assignedOperationsEmployeeId: undefined });
    const { service, storage } = setup([bundle(root)]);
    await expect(service.assignOperations(root.id, { operationsEmployeeId: operationsOne.employeeId }, operationsOne))
      .rejects.toBeInstanceOf(OperationsControlRoomError);
    expect(storage.getMutationCount()).toBe(0);
  });

  it('denies Sales, Accounts, Reservations, Operations, and Marketing assignment mutations', async () => {
    for (const role of ['Sales Manager', 'Sales Executive', 'Accounts', 'Reservations', 'Operations', 'Marketing'] as const) {
      const root = booking(`denied-${role}`, { assignedOperationsEmployeeId: undefined });
      const { service, storage } = setup([bundle(root)]);
      await expect(service.assignOperations(
        root.id,
        { operationsEmployeeId: operationsOne.employeeId },
        actor(role, `employee-${role}`),
      )).rejects.toMatchObject({ statusCode: 403 });
      expect(storage.getMutationCount()).toBe(0);
    }
  });

  it('rejects inactive, nonexistent, and non-Operations assignment targets with zero writes', async () => {
    for (const operationsEmployeeId of ['employee-operations-inactive', 'employee-missing', 'employee-sales-01']) {
      const root = booking(`invalid-${operationsEmployeeId}`, { assignedOperationsEmployeeId: undefined });
      const { service, storage } = setup([bundle(root)]);
      await expect(service.assignOperations(root.id, { operationsEmployeeId }, founder)).rejects.toBeInstanceOf(OperationsControlRoomError);
      expect(storage.getMutationCount()).toBe(0);
    }
  });

  it('rejects client-forged assignment fields and closed Booking history', async () => {
    const closed = booking('closed', { status: 'COMPLETED' });
    const { service, storage } = setup([bundle(closed)]);
    await expect(service.assignOperations(closed.id, {
      operationsEmployeeId: operationsTwo.employeeId,
      actorEmployeeId: founder.employeeId,
    }, founder)).rejects.toMatchObject({ code: 'PROTECTED_ASSIGNMENT_FIELD' });
    await expect(service.assignOperations(closed.id, {
      operationsEmployeeId: operationsTwo.employeeId,
    }, founder)).rejects.toMatchObject({ code: 'BOOKING_ASSIGNMENT_CLOSED' });
    expect(storage.getMutationCount()).toBe(0);
  });

  it('uses authenticated APIs instead of broad client DataContext or Firestore reads', async () => {
    const dashboardSource = await Bun.file(new URL('../../src/components/operations/OperationsDashboard.tsx', import.meta.url)).text();
    expect(dashboardSource).toContain('fetchOperationsControlRoom');
    expect(dashboardSource).not.toContain('useData');
    expect(dashboardSource).not.toContain('firebase/firestore');
    expect(dashboardSource).not.toContain('Mock Pending Actions');
  });
});
