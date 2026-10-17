import { describe, expect, it, spyOn } from 'bun:test';
import { BookingLifecycleService, InMemoryLifecycleStorageProvider } from '../../server/services/bookingLifecycleService';
import { VoucherService, InMemoryVoucherStorageProvider } from '../../server/services/voucherService';
import type { Booking, BookingAccommodation } from '../../src/types/booking';

const operations = { id: 'legacy-id', employeeId: 'ops-a', uid: 'firebase-other', name: 'Operations A', role: 'Operations' as const, active: true };
const admin = { ...operations, employeeId: 'admin-a', role: 'Admin' as const };
function booking(status: Booking['status'] = 'CONFIRMED'): Booking {
  return {
    id: 'audit-booking', bookingReference: 'BB-AUDIT', tripId: 'audit-trip', customerId: 'customer-a',
    status, assignedOperationsEmployeeId: 'ops-a', currency: 'INR', paymentStatus: 'PAID',
    totalSellingPrice: 100, totalAmount: 100, amountReceived: 100, amountPending: 0,
    travelStartDate: '2026-12-01', travelEndDate: '2026-12-02', schemaVersion: '2B-5',
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', guestNotes: 'Dietary requirement',
    confirmationProgress: { totalServices: 1, confirmedServices: 1, requestedServices: 0, cancelledServices: 0, allConfirmed: true },
  };
}
function accommodation(): BookingAccommodation {
  return {
    id: 'audit-hotel', bookingId: 'audit-booking', tripId: 'audit-trip', customerId: 'customer-a',
    propertyId: 'hotel', propertyName: 'Hotel', roomCategoryId: 'room', roomCategoryName: 'Room',
    mealPlan: 'EP', checkInDate: '2026-12-01', checkOutDate: '2026-12-02', nightsCount: 1,
    roomsCount: 1, adultsCount: 2, childrenCount: 0, supplierId: 'supplier', confirmationStatus: 'CONFIRMED',
    schemaVersion: '2B-5', createdAt: '2026-10-01', updatedAt: '2026-10-01',
  };
}

describe('audit: scoped and atomic operational mutations', () => {
  for (const status of ['CONFIRMED', 'IN_OPERATIONS'] as const) {
    it(`denies cross-assignment dispatch even on the ${status} idempotency path`, async () => {
      const store = new InMemoryLifecycleStorageProvider({ bookings: [booking(status)] });
      await expect(new BookingLifecycleService(store).dispatchToOperations('audit-booking', { ...operations, employeeId: 'ops-b' }))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(store.getAllBookings()[0].status).toBe(status);
      expect(store.getAllAuditLogs()).toHaveLength(0);
    });
  }
  it('denies inactive actors and missing assignments', async () => {
    const root = booking();
    delete root.assignedOperationsEmployeeId;
    const service = new BookingLifecycleService(new InMemoryLifecycleStorageProvider({ bookings: [root] }));
    await expect(service.dispatchToOperations(root.id, operations)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.dispatchToOperations(root.id, { ...admin, active: false })).rejects.toMatchObject({ statusCode: 403 });
  });
  it('does not resurrect a cancelled booking during concurrent dispatch', async () => {
    const store = new InMemoryLifecycleStorageProvider({ bookings: [booking()] });
    const service = new BookingLifecycleService(store);
    const result = await Promise.allSettled([
      service.cancelBooking('audit-booking', { cancellationReason: 'Customer cancelled' }, admin),
      service.dispatchToOperations('audit-booking', operations),
    ]);
    expect(result[0].status).toBe('fulfilled');
    expect(store.getAllBookings()[0].status).toBe('CANCELLED');
    expect(store.getAllBookings()[0].guestNotes).toContain('Dietary requirement');
    expect(store.getAllAuditLogs().every(event => ['admin-a', 'ops-a'].includes(event.actorId))).toBe(true);
  });
  it('rolls back status if the audit write fails', async () => {
    class FailingAuditStore extends InMemoryLifecycleStorageProvider {
      override runTransaction<T>(operation: Parameters<InMemoryLifecycleStorageProvider['runTransaction']>[0]): Promise<T> {
        return super.runTransaction(async transaction => {
          spyOn(transaction, 'logAuditEvent').mockRejectedValue(new Error('audit unavailable'));
          return operation(transaction);
        }) as Promise<T>;
      }
    }
    const store = new FailingAuditStore({ bookings: [booking()] });
    await expect(new BookingLifecycleService(store).dispatchToOperations('audit-booking', operations)).rejects.toThrow('audit unavailable');
    expect(store.getAllBookings()[0].status).toBe('CONFIRMED');
  });
  it('rejects non-string cancellation reasons without a write', async () => {
    const store = new InMemoryLifecycleStorageProvider({ bookings: [booking()] });
    await expect(new BookingLifecycleService(store).cancelBooking('audit-booking', { cancellationReason: 42 } as never, admin))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(store.getAllAuditLogs()).toHaveLength(0);
  });
  it('denies other Operations staff before returning or generating vouchers', async () => {
    const store = new InMemoryVoucherStorageProvider({ bookings: [booking('IN_OPERATIONS')], accommodations: [accommodation()] });
    const service = new VoucherService(store);
    await expect(service.generateVouchers('audit-booking', { ...operations, employeeId: 'ops-b' })).rejects.toMatchObject({ statusCode: 403 });
    expect(store.getAllVouchers()).toHaveLength(0);
    await service.generateVouchers('audit-booking', operations);
    await expect(service.generateVouchers('audit-booking', { ...operations, employeeId: 'ops-b' })).rejects.toMatchObject({ statusCode: 403 });
  });
  it('concurrent voucher requests commit one linked set', async () => {
    const store = new InMemoryVoucherStorageProvider({ bookings: [booking('IN_OPERATIONS')], accommodations: [accommodation()] });
    const service = new VoucherService(store);
    const [a, b] = await Promise.all([service.generateVouchers('audit-booking', operations), service.generateVouchers('audit-booking', operations)]);
    expect(a.vouchers[0].id).toBe(b.vouchers[0].id);
    expect(store.getAllVouchers()).toHaveLength(1);
    expect(store.getAccommodationSync('audit-hotel')?.voucherId).toBe(a.vouchers[0].id);
  });
  it('does not overwrite vouchers when multiple services share the same clock tick and legacy random suffix', async () => {
    const store = new InMemoryVoucherStorageProvider({ bookings: [booking('IN_OPERATIONS')],
      accommodations: [accommodation(), { ...accommodation(), id: 'audit-hotel-2' }] });
    const clock = spyOn(Date, 'now').mockReturnValue(1000);
    const random = spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const result = await new VoucherService(store).generateVouchers('audit-booking', operations);
      expect(new Set(result.vouchers.map(voucher => voucher.id)).size).toBe(2);
      expect(store.getAllVouchers()).toHaveLength(2);
    } finally { clock.mockRestore(); random.mockRestore(); }
  });
  it('rolls back voucher creation and service links on audit failure', async () => {
    const store = new InMemoryVoucherStorageProvider({ bookings: [booking('IN_OPERATIONS')], accommodations: [accommodation()] });
    const service = new VoucherService({ runTransaction: operation => store.runTransaction(async transaction => {
      spyOn(transaction, 'logAuditEvent').mockRejectedValue(new Error('audit unavailable'));
      return operation(transaction);
    }) });
    await expect(service.generateVouchers('audit-booking', operations)).rejects.toThrow('audit unavailable');
    expect(store.getAllVouchers()).toHaveLength(0);
    expect(store.getAccommodationSync('audit-hotel')?.voucherId).toBeUndefined();
  });
  it('rejects a stale allConfirmed flag and incomplete historical voucher sets', async () => {
    const stale = new InMemoryVoucherStorageProvider({ bookings: [booking('IN_OPERATIONS')], accommodations: [{ ...accommodation(), confirmationStatus: 'REQUESTED' }] });
    await expect(new VoucherService(stale).generateVouchers('audit-booking', operations)).rejects.toMatchObject({ code: 'SERVICES_NOT_FULLY_CONFIRMED' });
    const partial = new InMemoryVoucherStorageProvider({ bookings: [booking('IN_OPERATIONS')], accommodations: [accommodation()], vouchers: [{ id: 'old-partial', bookingId: 'audit-booking', tripId: 'audit-trip', type: 'HOTEL', status: 'GENERATED' }] });
    await expect(new VoucherService(partial).generateVouchers('audit-booking', operations)).rejects.toMatchObject({ code: 'INCOMPLETE_VOUCHERS' });
  });
});
