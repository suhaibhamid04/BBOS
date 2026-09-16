// =====================================================
// BOOKING LIFECYCLE TESTS
// Phase 2B-6 Stage 2
// Tests: dispatchToOperations, cancelBooking
// =====================================================

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  BookingLifecycleService,
  InMemoryLifecycleStorageProvider,
  LifecycleError,
} from '../../server/services/bookingLifecycleService';
import { Booking } from '../../src/types/booking';

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'book-test-01',
    bookingReference: 'BB-999001',
    tripId: 'trip-01',
    customerId: 'cust-01',
    customerName: 'Test Customer',
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    currency: 'INR',
    totalSellingPrice: 100000,
    totalAmount: 100000,
    amountReceived: 100000,
    amountPending: 0,
    travelStartDate: '2026-12-01',
    travelEndDate: '2026-12-07',
    confirmationProgress: {
      totalServices: 2,
      confirmedServices: 2,
      requestedServices: 0,
      cancelledServices: 0,
      allConfirmed: true,
    },
    schemaVersion: '2B-5',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

const opsActor = { id: 'emp-ops-01', name: 'Ops Manager', role: 'Operations' as const };
const adminActor = { id: 'emp-admin-01', name: 'Admin User', role: 'Admin' as const };
const founderActor = { id: 'emp-founder-01', name: 'Founder', role: 'Founder' as const };
const salesActor = { id: 'emp-sales-01', name: 'Sales Exec', role: 'Sales Executive' as const };

describe('BBOS Phase 2B-6 Stage 2 — Booking Lifecycle Service', () => {

  describe('1. dispatchToOperations', () => {
    it('1.1 transitions CONFIRMED → IN_OPERATIONS for Operations role', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking()] });
      const svc = new BookingLifecycleService(storage);

      const result = await svc.dispatchToOperations('book-test-01', opsActor);

      expect(result.success).toBe(true);
      expect(result.booking.status).toBe('IN_OPERATIONS');
      expect(storage.getAllBookings()[0].status).toBe('IN_OPERATIONS');
    });

    it('1.2 transitions CONFIRMED → IN_OPERATIONS for Admin role', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking()] });
      const svc = new BookingLifecycleService(storage);

      const result = await svc.dispatchToOperations('book-test-01', adminActor);
      expect(result.booking.status).toBe('IN_OPERATIONS');
    });

    it('1.3 transitions CONFIRMED → IN_OPERATIONS for Founder role', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking()] });
      const svc = new BookingLifecycleService(storage);

      const result = await svc.dispatchToOperations('book-test-01', founderActor);
      expect(result.booking.status).toBe('IN_OPERATIONS');
    });

    it('1.4 Sales Executive is rejected with 403 FORBIDDEN', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking()] });
      const svc = new BookingLifecycleService(storage);

      await expect(svc.dispatchToOperations('book-test-01', salesActor))
        .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('1.5 rejects dispatch if booking is PENDING_PAYMENT', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking({ status: 'PENDING_PAYMENT' })] });
      const svc = new BookingLifecycleService(storage);

      await expect(svc.dispatchToOperations('book-test-01', opsActor))
        .rejects.toMatchObject({ statusCode: 422, code: 'INVALID_STATE_TRANSITION' });
    });

    it('1.6 rejects dispatch if booking is already CANCELLED', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking({ status: 'CANCELLED' })] });
      const svc = new BookingLifecycleService(storage);

      await expect(svc.dispatchToOperations('book-test-01', opsActor))
        .rejects.toMatchObject({ statusCode: 422, code: 'INVALID_STATE_TRANSITION' });
    });

    it('1.7 is idempotent if booking is already IN_OPERATIONS', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking({ status: 'IN_OPERATIONS' })] });
      const svc = new BookingLifecycleService(storage);

      const result = await svc.dispatchToOperations('book-test-01', opsActor);
      expect(result.success).toBe(true);
      expect(result.booking.status).toBe('IN_OPERATIONS');
    });

    it('1.8 returns 404 for a non-existent booking', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [] });
      const svc = new BookingLifecycleService(storage);

      await expect(svc.dispatchToOperations('DOES-NOT-EXIST', opsActor))
        .rejects.toMatchObject({ statusCode: 404, code: 'BOOKING_NOT_FOUND' });
    });

    it('1.9 writes an immutable audit log entry on successful dispatch', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking()] });
      const svc = new BookingLifecycleService(storage);

      await svc.dispatchToOperations('book-test-01', opsActor);

      const logs = storage.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('BOOKING_DISPATCHED_TO_OPERATIONS');
      expect(logs[0].before.status).toBe('CONFIRMED');
      expect(logs[0].after.status).toBe('IN_OPERATIONS');
    });
  });

  describe('2. cancelBooking', () => {
    it('2.1 Admin can cancel a CONFIRMED booking with a valid reason', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking()] });
      const svc = new BookingLifecycleService(storage);

      const result = await svc.cancelBooking('book-test-01', { cancellationReason: 'Customer changed plans' }, adminActor);

      expect(result.success).toBe(true);
      expect(result.booking.status).toBe('CANCELLED');
      expect(storage.getAllBookings()[0].status).toBe('CANCELLED');
    });

    it('2.2 Founder can cancel an IN_OPERATIONS booking', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking({ status: 'IN_OPERATIONS' })] });
      const svc = new BookingLifecycleService(storage);

      const result = await svc.cancelBooking('book-test-01', { cancellationReason: 'Force majeure event' }, founderActor);
      expect(result.booking.status).toBe('CANCELLED');
    });

    it('2.3 Operations role is rejected with 403 FORBIDDEN', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking()] });
      const svc = new BookingLifecycleService(storage);

      await expect(svc.cancelBooking('book-test-01', { cancellationReason: 'Test reason here' }, opsActor))
        .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('2.4 rejects cancellation of an already CANCELLED booking', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking({ status: 'CANCELLED' })] });
      const svc = new BookingLifecycleService(storage);

      await expect(svc.cancelBooking('book-test-01', { cancellationReason: 'Some reason here' }, adminActor))
        .rejects.toMatchObject({ statusCode: 422, code: 'ALREADY_TERMINAL' });
    });

    it('2.5 rejects cancellation of a COMPLETED booking', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking({ status: 'COMPLETED' })] });
      const svc = new BookingLifecycleService(storage);

      await expect(svc.cancelBooking('book-test-01', { cancellationReason: 'Some reason here' }, adminActor))
        .rejects.toMatchObject({ statusCode: 422, code: 'ALREADY_TERMINAL' });
    });

    it('2.6 rejects empty cancellation reason', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking()] });
      const svc = new BookingLifecycleService(storage);

      await expect(svc.cancelBooking('book-test-01', { cancellationReason: '' }, adminActor))
        .rejects.toMatchObject({ statusCode: 400, code: 'CANCELLATION_REASON_REQUIRED' });
    });

    it('2.7 rejects cancellation reason shorter than 5 characters', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking()] });
      const svc = new BookingLifecycleService(storage);

      await expect(svc.cancelBooking('book-test-01', { cancellationReason: 'Bad' }, adminActor))
        .rejects.toMatchObject({ statusCode: 400, code: 'CANCELLATION_REASON_REQUIRED' });
    });

    it('2.8 writes an immutable audit log entry on cancellation', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [makeBooking()] });
      const svc = new BookingLifecycleService(storage);

      await svc.cancelBooking('book-test-01', { cancellationReason: 'Customer requested' }, adminActor);

      const logs = storage.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('BOOKING_CANCELLED');
      expect(logs[0].before.status).toBe('CONFIRMED');
      expect(logs[0].after.status).toBe('CANCELLED');
    });

    it('2.9 returns 404 for a non-existent booking', async () => {
      const storage = new InMemoryLifecycleStorageProvider({ bookings: [] });
      const svc = new BookingLifecycleService(storage);

      await expect(svc.cancelBooking('DOES-NOT-EXIST', { cancellationReason: 'Testing error path' }, adminActor))
        .rejects.toMatchObject({ statusCode: 404, code: 'BOOKING_NOT_FOUND' });
    });
  });
});
