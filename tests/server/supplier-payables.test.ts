import { describe, expect, it } from 'bun:test';
import {
  InMemorySupplierPayableStorageProvider,
  SupplierPayableService,
  type SupplierPaymentActor,
  type SupplierSourceBundle,
} from '../../server/services/supplierPayableService';
import type {
  Booking,
  BookingAccommodation,
  FinancialSnapshot,
} from '../../src/types/booking';

function actor(role: SupplierPaymentActor['role'], employeeId: string): SupplierPaymentActor {
  return {
    firebaseUid: `firebase-${employeeId}`,
    employeeId,
    name: `${role} User`,
    role,
    active: true,
  };
}

const accountsRecorder = actor('Accounts', 'employee-accounts-01');
const accountsVerifier = actor('Accounts', 'employee-accounts-02');
const founder = actor('Founder', 'employee-founder-01');

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-d4b-01',
    bookingReference: 'BBOS-D4B-01',
    tripId: 'trip-01',
    customerId: 'customer-01',
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    amountReceived: 25_000,
    amountPending: 0,
    travelStartDate: '2026-12-10',
    travelEndDate: '2026-12-12',
    assignedReservationsEmployeeId: 'employee-reservations-01',
    assignedOperationsEmployeeId: 'employee-operations-01',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function accommodation(overrides: Partial<BookingAccommodation> = {}): BookingAccommodation {
  return {
    id: 'booking-accommodation-01',
    bookingId: 'booking-d4b-01',
    tripId: 'trip-01',
    customerId: 'customer-01',
    sourceQuoteServiceId: 'quote-hotel-01',
    propertyId: 'property-01',
    propertyName: 'Lake Hotel',
    roomCategoryId: 'deluxe',
    roomCategoryName: 'Deluxe',
    mealPlan: 'CP',
    checkInDate: '2026-12-10',
    checkOutDate: '2026-12-12',
    nightsCount: 2,
    roomsCount: 1,
    adultsCount: 2,
    childrenCount: 0,
    supplierId: 'supplier-hotel-01',
    confirmationStatus: 'CONFIRMED',
    voucherStatus: 'PENDING',
    schemaVersion: '2B-5',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function snapshot(frozenTotalSupplierCost = 18_000): FinancialSnapshot {
  return {
    id: 'snapshot-d4b-01',
    bookingId: 'booking-d4b-01',
    snapshotVersion: 1,
    quoteId: 'quote-01',
    quoteVersion: 1,
    currency: 'INR',
    totalSellingPrice: 25_000,
    totalSupplierCost: frozenTotalSupplierCost,
    accommodationSupplierCost: frozenTotalSupplierCost,
    transportSupplierCost: 0,
    activitySupplierCost: 0,
    otherSupplierCosts: 0,
    grossProfit: 7_000,
    grossMargin: 28,
    lineItems: [{
      serviceId: 'quote-hotel-01',
      serviceType: 'ACCOMMODATION',
      supplierId: 'supplier-hotel-01',
      supplierName: 'Lake Hotel Supplier',
      inventoryMasterId: 'property-01',
      ratePeriodId: 'rate-01',
      rateContractType: 'NEGOTIATED',
      frozenSupplierUnitRate: frozenTotalSupplierCost / 2,
      units: 2,
      frozenSupplementsCost: 0,
      frozenTotalSupplierCost,
      taxTreatment: 'INCLUSIVE',
      taxAmount: 0,
      rateVerifiedAt: '2026-09-01T00:00:00.000Z',
    }],
    rateValidationFingerprint: 'frozen-fingerprint',
    createdAt: '2026-09-01T00:00:00.000Z',
    createdBy: 'employee-sales-01',
  };
}

function setup(options: {
  booking?: Partial<Booking>;
  accommodation?: Partial<BookingAccommodation>;
  frozenTotalSupplierCost?: number;
} = {}) {
  const bundle: SupplierSourceBundle = {
    booking: booking(options.booking),
    snapshot: snapshot(options.frozenTotalSupplierCost),
    accommodations: [accommodation(options.accommodation)],
    transports: [],
    activities: [],
  };
  const storage = new InMemorySupplierPayableStorageProvider({ bundles: [bundle] });
  const service = new SupplierPayableService(storage);
  return { storage, service };
}

async function obligation(service: SupplierPayableService, accessActor = accountsRecorder) {
  const result = await service.listPayables(accessActor);
  return result.obligations[0] as any;
}

const paymentInput = {
  amount: 2_000,
  paymentDate: '2026-09-26',
  paymentMethod: 'BANK_TRANSFER' as const,
  referenceNumber: 'UTR-D4B-001',
  paymentType: 'ADVANCE' as const,
};

describe('Stage D4B supplier payables', () => {
  it('allows Accounts, Founder, and Admin to read company supplier dues', async () => {
    for (const accessActor of [accountsRecorder, founder, actor('Admin', 'employee-admin-01')]) {
      const { service } = setup();
      const result = await service.listPayables(accessActor);
      expect(result.obligations).toHaveLength(1);
      expect(result.summaries?.[0]).toMatchObject({
        totalFrozenLiabilityMinor: 1_800_000,
        totalOutstandingMinor: 1_800_000,
        obligationCount: 1,
      });
    }
  });

  it('allows Accounts, Founder, and Admin to record supplier payments', async () => {
    for (const paymentActor of [accountsRecorder, founder, actor('Admin', 'employee-admin-01')]) {
      const { service } = setup();
      const item = await obligation(service);
      const result = await service.recordPayment(
        item.bookingId,
        item.obligationId,
        { ...paymentInput, referenceNumber: `REF-${paymentActor.employeeId}` },
        paymentActor,
      );
      expect(result.payment).toMatchObject({
        status: 'RECORDED',
        recordedByEmployeeId: paymentActor.employeeId,
      });
    }
  });

  it('scopes Reservations and Operations reads to assigned Bookings and hides amounts from Operations', async () => {
    const { service } = setup();
    const reservations = await service.listPayables(actor('Reservations', 'employee-reservations-01'));
    expect((reservations.obligations[0] as any).frozenLiabilityMinor).toBe(1_800_000);
    expect(await service.listPayables(actor('Reservations', 'employee-reservations-02'))).toMatchObject({ obligations: [] });

    const operations = await service.listPayables(actor('Operations', 'employee-operations-01'));
    expect((operations.obligations[0] as any).settlementStatus).toBe('UNPAID');
    expect((operations.obligations[0] as any).frozenLiabilityMinor).toBeUndefined();
    expect(await service.listPayables(actor('Operations', 'employee-operations-02'))).toMatchObject({ obligations: [] });
  });

  it('denies Sales and Marketing reads and all non-Accounts payment mutations with zero writes', async () => {
    for (const deniedActor of [
      actor('Sales Manager', 'employee-manager-01'),
      actor('Sales Executive', 'employee-sales-01'),
      actor('Reservations', 'employee-reservations-01'),
      actor('Operations', 'employee-operations-01'),
      actor('Marketing', 'employee-marketing-01'),
    ]) {
      const { storage, service } = setup();
      if (deniedActor.role === 'Sales Manager' || deniedActor.role === 'Sales Executive' || deniedActor.role === 'Marketing') {
        await expect(service.listPayables(deniedActor)).rejects.toMatchObject({ statusCode: 403 });
      }
      const item = await obligation(service);
      await expect(service.recordPayment(item.bookingId, item.obligationId, paymentInput, deniedActor))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(storage.getMutationCount()).toBe(0);
    }
  });

  it('derives liability and linkage only from the frozen snapshot and rejects forged authority fields', async () => {
    const { storage, service } = setup();
    const item = await obligation(service);
    expect(item).toMatchObject({
      supplierId: 'supplier-hotel-01',
      bookingServiceId: 'booking-accommodation-01',
      sourceSnapshotId: 'snapshot-d4b-01',
      frozenLiabilityMinor: 1_800_000,
    });
    await expect(service.recordPayment(item.bookingId, item.obligationId, {
      ...paymentInput,
      frozenLiabilityMinor: 1,
      supplierId: 'attacker',
      status: 'VERIFIED',
      recordedByEmployeeId: 'attacker',
      createdAt: '2000-01-01',
    } as any, accountsRecorder)).rejects.toMatchObject({ code: 'PROTECTED_SUPPLIER_PAYMENT_FIELD' });
    expect(storage.getMutationCount()).toBe(0);
  });

  it('records an advance without reducing balance until another Accounts employee verifies it', async () => {
    const { storage, service } = setup();
    const item = await obligation(service);
    const recorded = await service.recordPayment(item.bookingId, item.obligationId, paymentInput, accountsRecorder);
    expect(recorded.payment).toMatchObject({
      status: 'RECORDED',
      amountMinor: 200_000,
      recordedByEmployeeId: accountsRecorder.employeeId,
    });
    expect(recorded.obligation.outstandingMinor).toBe(1_800_000);
    await expect(service.verifyPayment(
      item.bookingId, item.obligationId, recorded.payment.id, accountsRecorder,
    )).rejects.toMatchObject({ code: 'SELF_VERIFICATION_BLOCKED' });

    const verified = await service.verifyPayment(
      item.bookingId, item.obligationId, recorded.payment.id, accountsVerifier,
    );
    expect(verified.obligation).toMatchObject({
      verifiedPaidMinor: 200_000,
      outstandingMinor: 1_600_000,
      settlementStatus: 'PARTIALLY_PAID',
    });
    expect(storage.getAudits().map((event) => event.action)).toContain('SUPPLIER_PAYMENT_VERIFIED');
  });

  it('supports partial then full settlement and emits a canonical settlement audit', async () => {
    const { storage, service } = setup();
    const item = await obligation(service);
    const advance = await service.recordPayment(item.bookingId, item.obligationId, paymentInput, accountsRecorder);
    await service.verifyPayment(item.bookingId, item.obligationId, advance.payment.id, accountsVerifier);
    const settlement = await service.recordPayment(item.bookingId, item.obligationId, {
      ...paymentInput,
      amount: 16_000,
      referenceNumber: 'UTR-D4B-SETTLEMENT',
      paymentType: 'FINAL_SETTLEMENT',
    }, accountsRecorder);
    const result = await service.verifyPayment(item.bookingId, item.obligationId, settlement.payment.id, founder);
    expect(result.obligation).toMatchObject({
      verifiedPaidMinor: 1_800_000,
      outstandingMinor: 0,
      overpaidMinor: 0,
      settlementStatus: 'SETTLED',
    });
    expect(storage.getAudits().find((event) => event.action === 'SUPPLIER_SETTLED')).toMatchObject({
      actorId: founder.employeeId,
      entityId: item.obligationId,
    });
  });

  it('handles overpayment explicitly without a negative outstanding balance', async () => {
    const { service } = setup();
    const item = await obligation(service);
    const recorded = await service.recordPayment(item.bookingId, item.obligationId, {
      ...paymentInput,
      amount: 18_100,
    }, accountsRecorder);
    const result = await service.verifyPayment(item.bookingId, item.obligationId, recorded.payment.id, founder);
    expect(result.obligation).toMatchObject({
      outstandingMinor: 0,
      overpaidMinor: 10_000,
      settlementStatus: 'OVERPAID',
    });
  });

  it('excludes RECORDED and REJECTED payments from balances and supports Founder/Admin voiding', async () => {
    const { service } = setup();
    const item = await obligation(service);
    const recorded = await service.recordPayment(item.bookingId, item.obligationId, paymentInput, accountsRecorder);
    expect(recorded.obligation.verifiedPaidMinor).toBe(0);
    const rejected = await service.rejectPayment(
      item.bookingId, item.obligationId, recorded.payment.id, 'Reference could not be validated', accountsVerifier,
    );
    expect(rejected.obligation.verifiedPaidMinor).toBe(0);

    const next = await service.recordPayment(item.bookingId, item.obligationId, {
      ...paymentInput,
      referenceNumber: 'UTR-D4B-002',
    }, accountsRecorder);
    await service.verifyPayment(item.bookingId, item.obligationId, next.payment.id, founder);
    const voided = await service.voidPayment(
      item.bookingId, item.obligationId, next.payment.id, 'Bank reversed the transfer', founder,
    );
    expect(voided.obligation).toMatchObject({ verifiedPaidMinor: 0, outstandingMinor: 1_800_000 });
  });

  it('uses exact integer minor-unit arithmetic for decimal liabilities and payments', async () => {
    const { service } = setup({ frozenTotalSupplierCost: 0.3 });
    const item = await obligation(service);
    const first = await service.recordPayment(item.bookingId, item.obligationId, {
      ...paymentInput, amount: 0.1, referenceNumber: 'DECIMAL-01',
    }, accountsRecorder);
    await service.verifyPayment(item.bookingId, item.obligationId, first.payment.id, founder);
    const second = await service.recordPayment(item.bookingId, item.obligationId, {
      ...paymentInput, amount: 0.2, referenceNumber: 'DECIMAL-02',
    }, accountsRecorder);
    const result = await service.verifyPayment(item.bookingId, item.obligationId, second.payment.id, founder);
    expect(result.obligation).toMatchObject({
      frozenLiabilityMinor: 30,
      verifiedPaidMinor: 30,
      outstandingMinor: 0,
      settlementStatus: 'SETTLED',
    });
  });

  it('shows an unresolved supplier discrepancy without rewriting the frozen liability', async () => {
    const { service } = setup({
      accommodation: {
        supplierConfirmation: {
          bookingReference: 'BBOS-D4B-01',
          serviceId: 'booking-accommodation-01',
          supplierId: 'supplier-hotel-01',
          propertyId: 'property-01',
          propertyName: 'Lake Hotel',
          status: 'CONFIRMED',
          confirmedRoomCategoryId: 'deluxe',
          confirmedRoomCategoryName: 'Deluxe',
          confirmedMealPlan: 'CP',
          confirmedCheckInDate: '2026-12-10',
          confirmedCheckOutDate: '2026-12-12',
          confirmedGuestNames: [],
          confirmedRoomsCount: 1,
          confirmedAdultsCount: 2,
          confirmedChildrenCount: 0,
          updatedAt: '2026-09-10T00:00:00.000Z',
          updatedByEmployeeId: 'employee-reservations-01',
          requiresCommercialApproval: true,
          rateDiscrepancy: {
            frozenSupplierUnitRate: 9_000,
            confirmedSupplierUnitRate: 10_000,
            difference: 1_000,
            reason: 'Seasonal surcharge requested',
            recordedAt: '2026-09-10T00:00:00.000Z',
            recordedByEmployeeId: 'employee-reservations-01',
            requiresCommercialApproval: true,
            approvalStatus: 'REQUIRED',
          },
        },
      },
    });
    const item = await obligation(service);
    expect(item).toMatchObject({
      frozenLiabilityMinor: 1_800_000,
      settlementStatus: 'PENDING_APPROVAL',
      requiresCommercialApproval: true,
      rateDiscrepancy: {
        confirmedSupplierUnitRateMinor: 1_000_000,
        approvalStatus: 'REQUIRED',
      },
    });
  });

  it('uses canonical employeeId in all supplier payment audits', async () => {
    const { storage, service } = setup();
    const item = await obligation(service);
    const compatibilityActor = { ...accountsRecorder, id: 'legacy-id', uid: 'firebase-like-id' } as any;
    await service.recordPayment(item.bookingId, item.obligationId, paymentInput, compatibilityActor);
    expect(storage.getAudits()[0]).toMatchObject({
      action: 'SUPPLIER_PAYMENT_RECORDED',
      actorId: accountsRecorder.employeeId,
    });
  });

  it('locks supplier payment documents and authoritative audits in Firestore rules', async () => {
    const rules = await Bun.file('firestore.rules').text();
    const paymentRules = rules.match(/match \/supplier_payments\/\{paymentId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    expect(paymentRules).toContain('allow read, create, update, delete: if false;');
    expect(paymentRules).not.toContain('request.resource.data.status');
    expect(rules).toContain("entityType != 'SUPPLIER_PAYMENT'");
    expect(rules).toContain('SUPPLIER_PAYMENT_RECORDED');
    expect(rules).toContain('SUPPLIER_PAYMENT_VERIFIED');
    expect(rules).toContain('SUPPLIER_SETTLED');
  });
});
