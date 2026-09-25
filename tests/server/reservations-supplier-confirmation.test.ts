import { describe, expect, it } from 'bun:test';
import {
  ConfirmationError,
  InMemoryConfirmationStorageProvider,
  ServiceConfirmationService,
  type ConfirmationActor,
} from '../../server/services/serviceConfirmationService';
import type {
  Booking,
  BookingAccommodation,
  FinancialSnapshot,
} from '../../src/types/booking';

const reservationsActor: ConfirmationActor = {
  firebaseUid: 'firebase-res-01',
  employeeId: 'employee-res-01',
  name: 'Assigned Reservations',
  role: 'Reservations',
  active: true,
};

function actor(role: ConfirmationActor['role'], employeeId: string): ConfirmationActor {
  return { firebaseUid: `firebase-${employeeId}`, employeeId, name: String(role), role, active: true };
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-01',
    bookingReference: 'BBOS-0001',
    tripId: 'trip-01',
    customerId: 'customer-01',
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    amountReceived: 20000,
    amountPending: 0,
    travelStartDate: '2026-12-10',
    travelEndDate: '2026-12-12',
    assignedReservationsEmployeeId: reservationsActor.employeeId,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function accommodation(overrides: Partial<BookingAccommodation> = {}): BookingAccommodation {
  return {
    id: 'accommodation-01',
    bookingId: 'booking-01',
    tripId: 'trip-01',
    customerId: 'customer-01',
    sourceQuoteServiceId: 'quote-hotel-01',
    propertyId: 'property-01',
    propertyName: 'Lake Hotel',
    roomCategoryId: 'room-deluxe',
    roomCategoryName: 'Deluxe',
    mealPlan: 'CP',
    checkInDate: '2026-12-10',
    checkOutDate: '2026-12-12',
    nightsCount: 2,
    roomsCount: 1,
    adultsCount: 2,
    childrenCount: 0,
    guestNames: ['Primary Guest'],
    supplierId: 'supplier-01',
    confirmationStatus: 'REQUESTED',
    voucherStatus: 'PENDING',
    schemaVersion: '2B-5',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function snapshot(): FinancialSnapshot {
  return {
    id: 'snapshot-01',
    bookingId: 'booking-01',
    snapshotVersion: 1,
    quoteId: 'quote-01',
    quoteVersion: 1,
    currency: 'INR',
    totalSellingPrice: 20000,
    totalSupplierCost: 10000,
    accommodationSupplierCost: 10000,
    transportSupplierCost: 0,
    activitySupplierCost: 0,
    otherSupplierCosts: 0,
    grossProfit: 10000,
    grossMargin: 50,
    lineItems: [{
      serviceId: 'quote-hotel-01',
      serviceType: 'ACCOMMODATION',
      supplierId: 'supplier-01',
      supplierName: 'Lake Hotel Supplier',
      inventoryMasterId: 'property-01',
      ratePeriodId: 'rate-01',
      rateContractType: 'NEGOTIATED',
      frozenSupplierUnitRate: 5000,
      units: 2,
      frozenSupplementsCost: 0,
      frozenTotalSupplierCost: 10000,
      taxTreatment: 'INCLUSIVE',
      taxAmount: 0,
      rateVerifiedAt: '2026-09-01T00:00:00.000Z',
    }],
    rateValidationFingerprint: 'fingerprint-01',
    createdAt: '2026-09-01T00:00:00.000Z',
    createdBy: 'employee-sales-01',
  };
}

function setup(bookingOverrides: Partial<Booking> = {}) {
  const storage = new InMemoryConfirmationStorageProvider({
    bookings: [booking(bookingOverrides)],
    accommodations: [accommodation()],
    financialSnapshots: [snapshot()],
  });
  return { storage, service: new ServiceConfirmationService(storage) };
}

const validConfirmation = {
  confirmationStatus: 'CONFIRMED' as const,
  supplierConfirmationCode: 'HOTEL-CNF-123',
};

describe('Stage D3B Reservations supplier confirmation', () => {
  it('allows the assigned Reservations employee and records authoritative status, actor, timestamp, and audit', async () => {
    const { storage, service } = setup();

    const result = await service.confirmAccommodation(
      'booking-01', 'accommodation-01', validConfirmation, reservationsActor,
    );

    expect(result.requiresCommercialApproval).toBe(false);
    const updated = storage.getAccommodationSync('accommodation-01')!;
    expect(updated.confirmationStatus).toBe('CONFIRMED');
    expect(updated.supplierConfirmation).toMatchObject({
      bookingReference: 'BBOS-0001',
      status: 'CONFIRMED',
      confirmationReference: 'HOTEL-CNF-123',
      updatedByEmployeeId: reservationsActor.employeeId,
      confirmedByEmployeeId: reservationsActor.employeeId,
    });
    expect(updated.supplierConfirmation?.confirmedAt).toBeTruthy();
    expect(storage.getAllAuditLogs()[0]).toMatchObject({
      actorId: reservationsActor.employeeId,
      action: 'SUPPLIER_ACCOMMODATION_CONFIRMATION_UPDATED',
    });
  });

  it('denies another, unassigned Reservations employee with zero writes', async () => {
    const { storage, service } = setup();
    const unassigned = actor('Reservations', 'employee-res-02');

    await expect(service.confirmAccommodation(
      'booking-01', 'accommodation-01', validConfirmation, unassigned,
    )).rejects.toMatchObject({ statusCode: 403, code: 'SCOPE_MISMATCH' });
    expect(storage.getMutationCount()).toBe(0);
  });

  it('fails closed when the Reservations assignment is missing', async () => {
    const { storage, service } = setup({ assignedReservationsEmployeeId: undefined });

    await expect(service.confirmAccommodation(
      'booking-01', 'accommodation-01', validConfirmation, reservationsActor,
    )).rejects.toMatchObject({ statusCode: 403, code: 'MISSING_SCOPE_METADATA' });
    expect(storage.getMutationCount()).toBe(0);
  });

  for (const [role, employeeId] of [
    ['Operations', 'employee-ops-01'],
    ['Accounts', 'employee-accounts-01'],
    ['Sales Manager', 'employee-manager-01'],
    ['Sales Executive', 'employee-sales-01'],
    ['Marketing', 'employee-marketing-01'],
  ] as const) {
    it(`denies ${role} mutation with zero writes`, async () => {
      const { storage, service } = setup();
      await expect(service.confirmAccommodation(
        'booking-01', 'accommodation-01', validConfirmation, actor(role, employeeId),
      )).rejects.toMatchObject({ statusCode: 403 });
      expect(storage.getMutationCount()).toBe(0);
    });
  }

  for (const role of ['Founder', 'Admin'] as const) {
    it(`allows ${role} across assignment boundaries`, async () => {
      const { storage, service } = setup({ assignedReservationsEmployeeId: 'someone-else' });
      await service.confirmAccommodation(
        'booking-01', 'accommodation-01', validConfirmation, actor(role, `employee-${role}`),
      );
      expect(storage.getAccommodationSync('accommodation-01')?.confirmationStatus).toBe('CONFIRMED');
    });
  }

  it('does not allow supplier confirmation before commercial Booking confirmation', async () => {
    const { storage, service } = setup({ status: 'PENDING_PAYMENT' });

    await expect(service.confirmAccommodation(
      'booking-01', 'accommodation-01', validConfirmation, actor('Admin', 'employee-admin-01'),
    )).rejects.toMatchObject({ statusCode: 422, code: 'BOOKING_NOT_COMMERCIALLY_READY' });
    expect(storage.getMutationCount()).toBe(0);
  });

  it('rejects protected commercial, assignment, and hotel-substitution fields with zero writes', async () => {
    const { storage, service } = setup();

    await expect(service.confirmAccommodation(
      'booking-01',
      'accommodation-01',
      {
        ...validConfirmation,
        propertyId: 'substitute-hotel',
        assignedReservationsEmployeeId: 'attacker',
        totalSupplierCost: 1,
        grossProfit: 1,
      } as any,
      reservationsActor,
    )).rejects.toBeInstanceOf(ConfirmationError);
    expect(storage.getMutationCount()).toBe(0);
    expect(storage.getAccommodationSync('accommodation-01')?.propertyId).toBe('property-01');
  });

  it('records a rate discrepancy without rewriting frozen economics and requires commercial approval', async () => {
    const { storage, service } = setup();

    const result = await service.confirmAccommodation('booking-01', 'accommodation-01', {
      ...validConfirmation,
      confirmedSupplierUnitRate: 5500,
      rateDiscrepancyReason: 'Supplier seasonal surcharge',
    }, reservationsActor);

    const updated = storage.getAccommodationSync('accommodation-01')!;
    expect(result.requiresCommercialApproval).toBe(true);
    expect(updated.confirmationStatus).toBe('REQUESTED');
    expect(updated.supplierConfirmation).toMatchObject({
      status: 'CONFIRMED',
      requiresCommercialApproval: true,
      rateDiscrepancy: {
        frozenSupplierUnitRate: 5000,
        confirmedSupplierUnitRate: 5500,
        difference: 500,
        reason: 'Supplier seasonal surcharge',
        approvalStatus: 'REQUIRED',
      },
    });
    expect((await storage.getFinancialSnapshot('booking-01'))?.totalSupplierCost).toBe(10000);
    expect((await storage.getFinancialSnapshot('booking-01'))?.lineItems[0].frozenSupplierUnitRate).toBe(5000);
  });

  it('requires a discrepancy reason and leaves state unchanged on failure', async () => {
    const { storage, service } = setup();

    await expect(service.confirmAccommodation('booking-01', 'accommodation-01', {
      ...validConfirmation,
      confirmedSupplierUnitRate: 5500,
    }, reservationsActor)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_CONFIRMATION_INPUT' });
    expect(storage.getMutationCount()).toBe(0);
  });

  it('marks supplier-confirmed term changes for later commercial approval', async () => {
    const { storage, service } = setup();

    await service.confirmAccommodation('booking-01', 'accommodation-01', {
      ...validConfirmation,
      confirmedRoomCategoryId: 'room-suite',
      confirmedRoomCategoryName: 'Suite',
    }, reservationsActor);

    const updated = storage.getAccommodationSync('accommodation-01')!;
    expect(updated.confirmationStatus).toBe('REQUESTED');
    expect(updated.supplierConfirmation?.status).toBe('CONFIRMED');
    expect(updated.supplierConfirmation?.requiresCommercialApproval).toBe(true);
  });

  it('Firestore rules block direct browser writes to migrated confirmation fields', async () => {
    const rules = await Bun.file('firestore.rules').text();
    expect(rules).toContain("'supplierConfirmation'");
    expect(rules).toContain("'confirmationStatus'");
    expect(rules).toContain('D3B supplier-confirmation fields are server-only');
  });
});
