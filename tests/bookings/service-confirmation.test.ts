// =====================================================
// SERVICE CONFIRMATION & VOUCHER TESTS
// Phase 2B-6 Stage 2
// Tests: confirmAccommodation, confirmTransport, confirmActivity,
//        generateVouchers, confirmationProgress recomputation
// =====================================================

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ServiceConfirmationService,
  InMemoryConfirmationStorageProvider,
  ConfirmationError,
} from '../../server/services/serviceConfirmationService';
import {
  VoucherService,
  InMemoryVoucherStorageProvider,
  VoucherError,
} from '../../server/services/voucherService';
import { Booking, BookingAccommodation, BookingTransport, BookingActivity } from '../../src/types/booking';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'book-01',
    bookingReference: 'BB-001',
    tripId: 'trip-01',
    customerId: 'cust-01',
    status: 'IN_OPERATIONS',
    paymentStatus: 'PAID',
    currency: 'INR',
    totalSellingPrice: 100000,
    totalAmount: 100000,
    amountReceived: 100000,
    amountPending: 0,
    travelStartDate: '2026-12-01',
    travelEndDate: '2026-12-07',
    confirmationProgress: {
      totalServices: 3,
      confirmedServices: 0,
      requestedServices: 3,
      cancelledServices: 0,
      allConfirmed: false,
    },
    schemaVersion: '2B-5',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

function makeAccommodation(overrides: Partial<BookingAccommodation> = {}): BookingAccommodation {
  return {
    id: 'acc-01', bookingId: 'book-01', tripId: 'trip-01', customerId: 'cust-01',
    propertyId: 'prop-01', propertyName: 'Test Hotel', roomCategoryId: 'rc-01', roomCategoryName: 'Deluxe',
    mealPlan: 'BB', checkInDate: '2026-12-01', checkOutDate: '2026-12-04', nightsCount: 3,
    roomsCount: 1, adultsCount: 2, childrenCount: 0,
    supplierId: 'sup-01', confirmationStatus: 'REQUESTED', voucherStatus: 'PENDING',
    schemaVersion: '2B-5', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

function makeTransport(overrides: Partial<BookingTransport> = {}): BookingTransport {
  return {
    id: 'trans-01', bookingId: 'book-01', tripId: 'trip-01', customerId: 'cust-01',
    vehicleCategoryId: 'vc-01', vehicleCategoryName: 'Sedan', routeName: 'Airport Transfer',
    serviceDate: '2026-12-01', daysCount: 1, pickupLocation: 'Airport', dropoffLocation: 'Hotel',
    passengerCount: 2, supplierId: 'sup-02', confirmationStatus: 'REQUESTED', voucherStatus: 'PENDING',
    schemaVersion: '2B-5', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

function makeActivity(overrides: Partial<BookingActivity> = {}): BookingActivity {
  return {
    id: 'act-01', bookingId: 'book-01', tripId: 'trip-01', customerId: 'cust-01',
    activityMasterId: 'am-01', activityName: 'Safari Tour', destinationId: 'dest-01',
    destinationName: 'Jungle', serviceDate: '2026-12-03', participantCount: 2,
    supplierId: 'sup-03', confirmationStatus: 'REQUESTED', voucherStatus: 'PENDING',
    schemaVersion: '2B-5', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

const opsActor = { id: 'emp-ops-01', name: 'Ops Manager', role: 'Operations' as const };
const adminActor = { id: 'emp-admin-01', name: 'Admin User', role: 'Admin' as const };
const salesActor = { id: 'emp-sales-01', name: 'Sales Exec', role: 'Sales Executive' as const };

// ── ServiceConfirmationService Tests ─────────────────────────────────────────

describe('BBOS Phase 2B-6 Stage 2 — Service Confirmation Service', () => {

  describe('1. confirmAccommodation', () => {
    it('1.1 updates operational fields and sets confirmationStatus to CONFIRMED', async () => {
      const storage = new InMemoryConfirmationStorageProvider({
        bookings: [makeBooking()],
        accommodations: [makeAccommodation()],
        transports: [makeTransport()],
        activities: [makeActivity()],
      });
      const svc = new ServiceConfirmationService(storage);

      const result = await svc.confirmAccommodation('book-01', 'acc-01', {
        confirmationStatus: 'CONFIRMED',
        supplierConfirmationCode: 'HRS-12345',
        supplierContactName: 'Mr. Patel',
        operationalNotes: 'Early check-in requested',
      }, opsActor);

      expect(result.success).toBe(true);
      const updated = storage.getAccommodationSync('acc-01')!;
      expect(updated.confirmationStatus).toBe('CONFIRMED');
      expect(updated.supplierConfirmationCode).toBe('HRS-12345');
      expect(updated.supplierContactName).toBe('Mr. Patel');
      expect(updated.operationalNotes).toBe('Early check-in requested');
    });

    it('1.2 recomputes confirmationProgress after accommodation is confirmed', async () => {
      const storage = new InMemoryConfirmationStorageProvider({
        bookings: [makeBooking()],
        accommodations: [makeAccommodation()],
        transports: [makeTransport()],
        activities: [makeActivity()],
      });
      const svc = new ServiceConfirmationService(storage);

      const result = await svc.confirmAccommodation('book-01', 'acc-01', { confirmationStatus: 'CONFIRMED' }, opsActor);

      expect(result.confirmationProgress.confirmedServices).toBe(1);
      expect(result.confirmationProgress.totalServices).toBe(3);
      expect(result.confirmationProgress.allConfirmed).toBe(false);
    });

    it('1.3 allConfirmed is true when ALL services are CONFIRMED', async () => {
      const storage = new InMemoryConfirmationStorageProvider({
        bookings: [makeBooking()],
        accommodations: [makeAccommodation({ confirmationStatus: 'CONFIRMED' })],
        transports: [makeTransport({ confirmationStatus: 'CONFIRMED' })],
        activities: [makeActivity()],
      });
      const svc = new ServiceConfirmationService(storage);

      const result = await svc.confirmActivity('book-01', 'act-01', { confirmationStatus: 'CONFIRMED' }, opsActor);

      expect(result.confirmationProgress.allConfirmed).toBe(true);
      expect(result.confirmationProgress.confirmedServices).toBe(3);
    });

    it('1.4 Sales Executive is rejected with 403 FORBIDDEN', async () => {
      const storage = new InMemoryConfirmationStorageProvider({ bookings: [makeBooking()], accommodations: [makeAccommodation()] });
      const svc = new ServiceConfirmationService(storage);

      await expect(svc.confirmAccommodation('book-01', 'acc-01', { confirmationStatus: 'CONFIRMED' }, salesActor))
        .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('1.5 rejects update on a cancelled booking', async () => {
      const storage = new InMemoryConfirmationStorageProvider({
        bookings: [makeBooking({ status: 'CANCELLED' })],
        accommodations: [makeAccommodation()],
      });
      const svc = new ServiceConfirmationService(storage);

      await expect(svc.confirmAccommodation('book-01', 'acc-01', { confirmationStatus: 'CONFIRMED' }, opsActor))
        .rejects.toMatchObject({ statusCode: 422, code: 'BOOKING_CANCELLED' });
    });

    it('1.6 rejects cross-booking IDOR (serviceId belongs to different booking)', async () => {
      const storage = new InMemoryConfirmationStorageProvider({
        bookings: [makeBooking({ id: 'book-01' }), makeBooking({ id: 'book-02', bookingReference: 'BB-002' })],
        accommodations: [makeAccommodation({ bookingId: 'book-02' })],
      });
      const svc = new ServiceConfirmationService(storage);

      await expect(svc.confirmAccommodation('book-01', 'acc-01', { confirmationStatus: 'CONFIRMED' }, opsActor))
        .rejects.toMatchObject({ statusCode: 404, code: 'SERVICE_NOT_FOUND' });
    });

    it('1.7 does not allow commercial fields to be mutated through the DTO', async () => {
      const storage = new InMemoryConfirmationStorageProvider({
        bookings: [makeBooking()],
        accommodations: [makeAccommodation()],
        transports: [],
        activities: [],
      });
      const svc = new ServiceConfirmationService(storage);

      // Even if attacker sends commercial fields, they must be silently dropped
      await svc.confirmAccommodation('book-01', 'acc-01', {
        confirmationStatus: 'CONFIRMED',
        ...(({ propertyId: 'HACKED', checkInDate: '2020-01-01' } as any)),
      } as any, opsActor);

      const updated = storage.getAccommodationSync('acc-01')!;
      expect(updated.propertyId).toBe('prop-01'); // unchanged
      expect(updated.checkInDate).toBe('2026-12-01'); // unchanged
    });

    it('1.8 writes an audit log for each accommodation confirmation', async () => {
      const storage = new InMemoryConfirmationStorageProvider({
        bookings: [makeBooking()],
        accommodations: [makeAccommodation()],
        transports: [],
        activities: [],
      });
      const svc = new ServiceConfirmationService(storage);

      await svc.confirmAccommodation('book-01', 'acc-01', { confirmationStatus: 'CONFIRMED' }, opsActor);

      const logs = storage.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('SERVICE_ACCOMMODATION_CONFIRMED');
    });
  });

  describe('2. confirmTransport', () => {
    it('2.1 updates driver details and confirmationStatus', async () => {
      const storage = new InMemoryConfirmationStorageProvider({
        bookings: [makeBooking()],
        accommodations: [],
        transports: [makeTransport()],
        activities: [],
      });
      const svc = new ServiceConfirmationService(storage);

      await svc.confirmTransport('book-01', 'trans-01', {
        confirmationStatus: 'CONFIRMED',
        driverName: 'Rajesh Kumar',
        driverPhone: '+91 9876543210',
        vehicleRegistrationNumber: 'DL 01 AB 5678',
      }, opsActor);

      const updated = storage.getTransportSync('trans-01')!;
      expect(updated.confirmationStatus).toBe('CONFIRMED');
      expect(updated.driverName).toBe('Rajesh Kumar');
      expect(updated.driverPhone).toBe('+91 9876543210');
      expect(updated.vehicleRegistrationNumber).toBe('DL 01 AB 5678');
    });

    it('2.2 does not allow commercial route fields to be mutated', async () => {
      const storage = new InMemoryConfirmationStorageProvider({
        bookings: [makeBooking()],
        accommodations: [],
        transports: [makeTransport()],
        activities: [],
      });
      const svc = new ServiceConfirmationService(storage);

      await svc.confirmTransport('book-01', 'trans-01', {
        confirmationStatus: 'CONFIRMED',
        ...(({ pickupLocation: 'HACKED', serviceDate: '2020-01-01' } as any)),
      } as any, opsActor);

      const updated = storage.getTransportSync('trans-01')!;
      expect(updated.pickupLocation).toBe('Airport'); // unchanged
      expect(updated.serviceDate).toBe('2026-12-01'); // unchanged
    });
  });

  describe('3. confirmActivity', () => {
    it('3.1 updates guide assignment and ticket numbers', async () => {
      const storage = new InMemoryConfirmationStorageProvider({
        bookings: [makeBooking()],
        accommodations: [],
        transports: [],
        activities: [makeActivity()],
      });
      const svc = new ServiceConfirmationService(storage);

      await svc.confirmActivity('book-01', 'act-01', {
        confirmationStatus: 'CONFIRMED',
        supplierConfirmationCode: 'SFRI-98765',
        assignedGuideName: 'Amit Singh',
        assignedGuidePhone: '+91 9988776655',
        ticketNumbers: ['TK-001', 'TK-002'],
      }, opsActor);

      const updated = storage.getActivitySync('act-01')!;
      expect(updated.confirmationStatus).toBe('CONFIRMED');
      expect(updated.supplierConfirmationCode).toBe('SFRI-98765');
      expect(updated.assignedGuideName).toBe('Amit Singh');
      expect(updated.ticketNumbers).toEqual(['TK-001', 'TK-002']);
    });

    it('3.2 does not allow commercial activity fields to be mutated', async () => {
      const storage = new InMemoryConfirmationStorageProvider({
        bookings: [makeBooking()],
        accommodations: [],
        transports: [],
        activities: [makeActivity()],
      });
      const svc = new ServiceConfirmationService(storage);

      await svc.confirmActivity('book-01', 'act-01', {
        confirmationStatus: 'CONFIRMED',
        ...(({ activityName: 'HACKED', serviceDate: '2020-01-01' } as any)),
      } as any, opsActor);

      const updated = storage.getActivitySync('act-01')!;
      expect(updated.activityName).toBe('Safari Tour'); // unchanged
      expect(updated.serviceDate).toBe('2026-12-03'); // unchanged
    });
  });
});

// ── VoucherService Tests ──────────────────────────────────────────────────────

describe('BBOS Phase 2B-6 Stage 2 — Voucher Service', () => {

  function fullyConfirmedBooking(): Booking {
    return makeBooking({
      status: 'IN_OPERATIONS',
      confirmationProgress: { totalServices: 3, confirmedServices: 3, requestedServices: 0, cancelledServices: 0, allConfirmed: true },
    });
  }

  it('4.1 generates one voucher per service for a fully-confirmed IN_OPERATIONS booking', async () => {
    const storage = new InMemoryVoucherStorageProvider({
      bookings: [fullyConfirmedBooking()],
      accommodations: [makeAccommodation({ confirmationStatus: 'CONFIRMED' })],
      transports: [makeTransport({ confirmationStatus: 'CONFIRMED' })],
      activities: [makeActivity({ confirmationStatus: 'CONFIRMED' })],
    });
    const svc = new VoucherService(storage);

    const result = await svc.generateVouchers('book-01', opsActor);

    expect(result.success).toBe(true);
    expect(result.vouchers).toHaveLength(3);
    expect(result.vouchers.map(v => v.type).sort()).toEqual(['ACTIVITY', 'HOTEL', 'TRANSPORT'].sort());
  });

  it('4.2 sets voucherStatus to GENERATED on each service document', async () => {
    const storage = new InMemoryVoucherStorageProvider({
      bookings: [fullyConfirmedBooking()],
      accommodations: [makeAccommodation({ confirmationStatus: 'CONFIRMED' })],
      transports: [makeTransport({ confirmationStatus: 'CONFIRMED' })],
      activities: [makeActivity({ confirmationStatus: 'CONFIRMED' })],
    });
    const svc = new VoucherService(storage);

    await svc.generateVouchers('book-01', opsActor);

    expect(storage.getAccommodationSync('acc-01')!.voucherStatus).toBe('GENERATED');
    expect(storage.getTransportSync('trans-01')!.voucherStatus).toBe('GENERATED');
    expect(storage.getActivitySync('act-01')!.voucherStatus).toBe('GENERATED');
  });

  it('4.3 links voucherId back onto each service document', async () => {
    const storage = new InMemoryVoucherStorageProvider({
      bookings: [fullyConfirmedBooking()],
      accommodations: [makeAccommodation({ confirmationStatus: 'CONFIRMED' })],
      transports: [],
      activities: [],
    });
    const svc = new VoucherService(storage);

    const result = await svc.generateVouchers('book-01', opsActor);
    const acc = storage.getAccommodationSync('acc-01')!;

    expect(acc.voucherId).toBe(result.vouchers[0].id);
  });

  it('4.4 fails with 422 INVALID_BOOKING_STATUS if booking is not IN_OPERATIONS', async () => {
    const storage = new InMemoryVoucherStorageProvider({
      bookings: [makeBooking({ status: 'CONFIRMED', confirmationProgress: { totalServices: 1, confirmedServices: 1, requestedServices: 0, cancelledServices: 0, allConfirmed: true } })],
      accommodations: [makeAccommodation({ confirmationStatus: 'CONFIRMED' })],
    });
    const svc = new VoucherService(storage);

    await expect(svc.generateVouchers('book-01', opsActor))
      .rejects.toMatchObject({ statusCode: 422, code: 'INVALID_BOOKING_STATUS' });
  });

  it('4.5 fails with 422 SERVICES_NOT_FULLY_CONFIRMED if allConfirmed is false', async () => {
    const storage = new InMemoryVoucherStorageProvider({
      bookings: [makeBooking({ status: 'IN_OPERATIONS', confirmationProgress: { totalServices: 2, confirmedServices: 1, requestedServices: 1, cancelledServices: 0, allConfirmed: false } })],
      accommodations: [makeAccommodation({ confirmationStatus: 'CONFIRMED' })],
      transports: [makeTransport({ confirmationStatus: 'REQUESTED' })],
    });
    const svc = new VoucherService(storage);

    await expect(svc.generateVouchers('book-01', opsActor))
      .rejects.toMatchObject({ statusCode: 422, code: 'SERVICES_NOT_FULLY_CONFIRMED' });
  });

  it('4.6 Sales Executive is rejected with 403 FORBIDDEN', async () => {
    const storage = new InMemoryVoucherStorageProvider({ bookings: [fullyConfirmedBooking()], accommodations: [] });
    const svc = new VoucherService(storage);

    await expect(svc.generateVouchers('book-01', salesActor))
      .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('4.7 is idempotent — returns existing vouchers on second call', async () => {
    const storage = new InMemoryVoucherStorageProvider({
      bookings: [fullyConfirmedBooking()],
      accommodations: [makeAccommodation({ confirmationStatus: 'CONFIRMED' })],
      transports: [],
      activities: [],
    });
    const svc = new VoucherService(storage);

    const first = await svc.generateVouchers('book-01', opsActor);
    const second = await svc.generateVouchers('book-01', opsActor);

    expect(second.vouchers).toHaveLength(first.vouchers.length);
    expect(second.vouchers[0].id).toBe(first.vouchers[0].id); // Same voucher IDs
    expect(storage.getAllVouchers()).toHaveLength(1); // Not duplicated
  });

  it('4.8 returns 404 for a non-existent booking', async () => {
    const storage = new InMemoryVoucherStorageProvider({ bookings: [] });
    const svc = new VoucherService(storage);

    await expect(svc.generateVouchers('DOES-NOT-EXIST', opsActor))
      .rejects.toMatchObject({ statusCode: 404, code: 'BOOKING_NOT_FOUND' });
  });
});
