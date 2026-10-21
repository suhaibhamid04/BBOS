import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { FinancialExceptionService } from '../../server/services/financialExceptionService';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import { PaymentService } from '../../src/services/payment/paymentService';
import { InMemoryPaymentStorageProvider } from '../../src/services/payment/paymentStorageProvider';
import { BookingLifecycleService, InMemoryLifecycleStorageProvider } from '../../server/services/bookingLifecycleService';
import type { Booking, BookingAccommodation, FinancialSnapshot } from '../../src/types/booking';
import type { CommissionLedgerEntry, RefundLedgerEntry } from '../../src/types/financialExceptions';
import type { PaymentRecord } from '../../src/types/payment';
import type { SupplierPaymentRecord } from '../../src/types/supplierPayable';

const AT = '2026-10-21T10:00:00.000Z';
const sales = { employeeId: 'sales-1', name: 'Sales One', role: 'Sales Executive' as const, active: true, salesTeamId: 'team-1' };
const manager = { employeeId: 'manager-1', name: 'Manager One', role: 'Sales Manager' as const, active: true, salesTeamId: 'team-1' };
const otherManager = { ...manager, employeeId: 'manager-2', salesTeamId: 'team-2' };
const admin = { employeeId: 'admin-1', name: 'Admin', role: 'Admin' as const, active: true };
const accounts1 = { employeeId: 'accounts-1', name: 'Accounts One', role: 'Accounts' as const, active: true };
const accounts2 = { employeeId: 'accounts-2', name: 'Accounts Two', role: 'Accounts' as const, active: true };
const reservations = { employeeId: 'res-1', name: 'Reservations One', role: 'Reservations' as const, active: true };
const otherReservations = { ...reservations, employeeId: 'res-2' };

function booking(status: Booking['status'] = 'CONFIRMED'): Booking {
  return {
    id: 'booking-a01', bookingReference: 'BB-A01', tripId: 'trip-a01', customerId: 'customer-a01',
    status, paymentStatus: 'PAID', currency: 'INR', totalSellingPrice: 100_000, totalAmount: 100_000,
    amountReceived: 100_000, amountPending: 0, travelStartDate: '2026-12-01', travelEndDate: '2026-12-05',
    assignedSalesEmployeeId: 'sales-1', assignedSalesManagerId: 'manager-1', salesTeamId: 'team-1',
    assignedReservationsEmployeeId: 'res-1', assignedOperationsEmployeeId: 'ops-1',
    createdAt: AT, updatedAt: AT, schemaVersion: '2B-5',
  };
}

function accommodation(): BookingAccommodation {
  return {
    id: 'stay-1', bookingId: 'booking-a01', tripId: 'trip-a01', customerId: 'customer-a01', sourceQuoteServiceId: 'quote-stay-1',
    propertyId: 'hotel-old', propertyName: 'Old Hotel', roomCategoryId: 'deluxe', roomCategoryName: 'Deluxe', mealPlan: 'MAP',
    checkInDate: '2026-12-01', checkOutDate: '2026-12-05', nightsCount: 4, roomsCount: 1,
    adultsCount: 2, childrenCount: 0, supplierId: 'supplier-old', confirmationStatus: 'CONFIRMED', voucherStatus: 'PENDING',
    schemaVersion: '2B-5', createdAt: AT, updatedAt: AT,
  };
}

function snapshot(): FinancialSnapshot {
  return {
    id: 'snapshot-a01', bookingId: 'booking-a01', snapshotVersion: 1, quoteId: 'quote-a01', quoteVersion: 1,
    currency: 'INR', totalSellingPrice: 100_000, totalSupplierCost: 60_000,
    accommodationSupplierCost: 10_000, transportSupplierCost: 30_000, activitySupplierCost: 20_000, otherSupplierCosts: 0,
    grossProfit: 40_000, grossMargin: 40,
    lineItems: [{
      serviceId: 'quote-stay-1', serviceType: 'ACCOMMODATION', supplierId: 'supplier-old', supplierName: 'Old Supplier',
      inventoryMasterId: 'hotel-old', rateContractType: 'STANDARD', frozenSupplierUnitRate: 5_000, units: 2,
      frozenSupplementsCost: 0, frozenTotalSupplierCost: 10_000, taxTreatment: 'INCLUSIVE', taxAmount: 0, rateVerifiedAt: AT,
    }],
    rateValidationFingerprint: 'frozen-a01', createdAt: AT, createdBy: 'sales-1',
  };
}

function exceptionStore(status: Booking['status'] = 'CONFIRMED') {
  const store = new InMemoryConversionStorageProvider({ bookings: [booking(status)] });
  store.rawSet('booking_accommodations', 'stay-1', accommodation());
  store.rawSet('bookings/booking-a01/financial_snapshot', 'snapshot-a01', snapshot());
  store.rawSet('accommodation_properties', 'hotel-same', { id: 'hotel-same', name: 'Same Range Hotel', supplierId: 'supplier-new', status: 'ACTIVE' });
  store.rawSet('room_categories', 'deluxe', { id: 'deluxe', propertyId: 'hotel-same', name: 'Deluxe', active: true });
  store.rawSet('rate_periods', 'rate-same', { id: 'rate-same', propertyId: 'hotel-same', roomCategoryId: 'deluxe', baseRate: 5_000, status: 'ACTIVE' });
  store.rawSet('accommodation_properties', 'hotel-material', { id: 'hotel-material', name: 'Material Hotel', supplierId: 'supplier-material', status: 'ACTIVE' });
  store.rawSet('room_categories', 'suite', { id: 'suite', propertyId: 'hotel-material', name: 'Suite', active: true });
  store.rawSet('rate_periods', 'rate-material', { id: 'rate-material', propertyId: 'hotel-material', roomCategoryId: 'suite', baseRate: 7_000, status: 'ACTIVE' });
  return store;
}

describe('A01 financial and commercial exception workflows', () => {
  it('keeps every A01 collection behind server APIs', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    for (const collection of [
      'booking_amendments', 'supplier_substitutions', 'refund_requests',
      'refund_ledger', 'commission_ledger', 'financial_policies',
    ]) {
      const start = rules.indexOf(`match /${collection}/`);
      expect(start).toBeGreaterThan(-1);
      expect(rules.slice(start, start + 220)).toContain('allow read, create, update, delete: if false;');
    }
  });

  it('versions, approves and applies a server-recalculated amendment exactly once while preserving the original snapshot', async () => {
    const store = exceptionStore();
    const service = new FinancialExceptionService(store, () => new Date(AT));

    await expect(service.proposeAmendment('booking-a01', {
      reason: 'Attempt forged economics', proposedSellingPrice: 120_000, supplierCost: 1,
    } as never, sales)).rejects.toMatchObject({ code: 'AUTHORITATIVE_FIELD_REJECTED' });

    const proposed = await service.proposeAmendment('booking-a01', {
      reason: 'Customer extends dates and accepts a revised package price', proposedSellingPrice: 120_000,
      travelStartDate: '2026-12-02', travelEndDate: '2026-12-07', guestCount: 3,
    }, sales);
    expect(proposed.status).toBe('PENDING_APPROVAL');
    expect(proposed.before).toMatchObject({ supplierCost: 60_000, sellingPrice: 100_000, profit: 40_000, margin: 40 });
    expect(proposed.proposed).toMatchObject({ supplierCost: 60_000, sellingPrice: 120_000, profit: 60_000, margin: 50, guestCount: 3 });
    await expect(service.applyAmendment(proposed.id, manager)).rejects.toMatchObject({ code: 'AMENDMENT_NOT_APPROVED' });
    await expect(service.decideAmendment(proposed.id, 'APPROVED', 'Approved', otherManager)).rejects.toMatchObject({ code: 'AMENDMENT_APPROVAL_SCOPE_DENIED' });

    const approved = await service.decideAmendment(proposed.id, 'APPROVED', 'Commercial change approved', manager);
    expect(approved.status).toBe('APPROVED');
    expect(approved.approved).toEqual(approved.proposed);
    const first = await service.applyAmendment(proposed.id, manager);
    const second = await service.applyAmendment(proposed.id, manager);
    expect(first.amendment.status).toBe('APPLIED');
    expect(second.idempotent).toBe(true);
    expect(store.rawGet('bookings', 'booking-a01')).toMatchObject({ totalSellingPrice: 120_000, travelStartDate: '2026-12-02', travelEndDate: '2026-12-07' });
    expect(store.rawGet('booking_accommodations', 'stay-1')).toMatchObject({ adultsCount: 3, checkInDate: '2026-12-02', checkOutDate: '2026-12-07' });
    expect(await store.getFinancialSnapshot('booking-a01')).toEqual(snapshot());
    expect(store.rawList('audit_logs').map(item => item.action)).toEqual(['AMENDMENT_REQUESTED', 'AMENDMENT_APPROVED', 'AMENDMENT_APPLIED']);
    const overview = await service.getBookingOverview('booking-a01', manager);
    expect(overview.auditTimeline.map((item: any) => item.action)).toEqual(expect.arrayContaining(['AMENDMENT_REQUESTED', 'AMENDMENT_APPROVED', 'AMENDMENT_APPLIED']));
  });

  it('rejects an amendment without changing Booking economics', async () => {
    const store = exceptionStore();
    const service = new FinancialExceptionService(store, () => new Date(AT));
    const proposed = await service.proposeAmendment('booking-a01', { reason: 'Requested customer discount', proposedSellingPrice: 90_000 }, sales);
    const rejected = await service.decideAmendment(proposed.id, 'REJECTED', 'Margin is below the approved commercial floor', manager);
    expect(rejected).toMatchObject({ status: 'REJECTED', rejectionReason: 'Margin is below the approved commercial floor' });
    expect(store.rawGet('bookings', 'booking-a01').totalSellingPrice).toBe(100_000);
    expect(await store.getFinancialSnapshot('booking-a01')).toEqual(snapshot());
  });

  it('rejects an approved amendment whose base version became stale', async () => {
    const store = exceptionStore();
    const service = new FinancialExceptionService(store, () => new Date(AT));
    const first = await service.proposeAmendment('booking-a01', { reason: 'First approved commercial revision', proposedSellingPrice: 110_000 }, sales);
    const second = await service.proposeAmendment('booking-a01', { reason: 'Parallel commercial revision', proposedSellingPrice: 115_000 }, sales);
    await service.decideAmendment(first.id, 'APPROVED', 'First revision approved', manager);
    await service.decideAmendment(second.id, 'APPROVED', 'Parallel revision approved', manager);
    await service.applyAmendment(first.id, manager);
    await expect(service.applyAmendment(second.id, manager)).rejects.toMatchObject({ code: 'AMENDMENT_BASE_STALE' });
    expect(store.rawGet('bookings', 'booking-a01').totalSellingPrice).toBe(110_000);
  });

  it('allows assigned Reservations to apply an exact-category/exact-cost substitution and requires Admin for material changes', async () => {
    const store = exceptionStore();
    const service = new FinancialExceptionService(store, () => new Date(AT));
    await expect(service.proposeSubstitution('booking-a01', {
      serviceType: 'ACCOMMODATION', serviceId: 'stay-1', ratePeriodId: 'rate-same', reason: 'Original supplier unavailable',
    }, otherReservations)).rejects.toMatchObject({ code: 'FINANCIAL_EXCEPTION_SCOPE_DENIED' });

    const safe = await service.proposeSubstitution('booking-a01', {
      serviceType: 'ACCOMMODATION', serviceId: 'stay-1', ratePeriodId: 'rate-same', reason: 'Original supplier unavailable',
    }, reservations);
    expect(safe).toMatchObject({ sameCategory: true, sameCommercialRange: true, requiresAdminApproval: false, status: 'APPROVED' });
    const applied = await service.applySubstitution(safe.id, reservations);
    expect(applied.substitution.status).toBe('APPLIED');
    expect(store.rawGet('booking_accommodations', 'stay-1')).toMatchObject({ propertyId: 'hotel-same', supplierId: 'supplier-new' });
    expect(await store.getFinancialSnapshot('booking-a01')).toEqual(snapshot());

    const material = await service.proposeSubstitution('booking-a01', {
      serviceType: 'ACCOMMODATION', serviceId: 'stay-1', ratePeriodId: 'rate-material', reason: 'Only upgraded category remains available',
    }, reservations);
    expect(material).toMatchObject({ material: true, requiresAdminApproval: true, status: 'PENDING_APPROVAL', supplierCostDifference: 4_000 });
    await expect(service.applySubstitution(material.id, reservations)).rejects.toMatchObject({ code: 'SUBSTITUTION_NOT_APPROVED' });
    await service.decideSubstitution(material.id, 'APPROVED', 'Approved exceptional replacement', admin);
    await service.applySubstitution(material.id, reservations);
    expect(store.rawGet('booking_accommodations', 'stay-1').supplierConfirmation.rateDiscrepancy).toMatchObject({
      difference: 4_000, requiresCommercialApproval: true, approvalStatus: 'REQUIRED',
    });
    expect(store.rawGet('bookings', 'booking-a01').totalSellingPrice).toBe(100_000);
  });

  it('calculates, dual-approves and records a refund separately from immutable payments', async () => {
    const store = exceptionStore('CANCELLED');
    const payment: PaymentRecord = {
      id: 'payment-1', bookingId: 'booking-a01', bookingReference: 'BB-A01', customerId: 'customer-a01', customerName: 'Customer',
      amount: 100_000, currency: 'INR', paymentDate: '2026-10-01', paymentMethod: 'UPI', referenceNumber: 'PAY-REF', paymentType: 'FULL',
      status: 'VERIFIED', recordedByEmployeeId: 'sales-1', recordedBy: 'sales-1', recordedByName: 'Sales One', recordedByRole: 'Sales Executive',
      recordedAt: AT, createdAt: AT, updatedAt: AT,
    };
    const supplierPayment = {
      id: 'supplier-payment-1', bookingId: 'booking-a01', amountMinor: 2_000_000, status: 'VERIFIED',
    } as SupplierPaymentRecord;
    const priorLedger = { id: 'prior-refund', bookingId: 'booking-a01', actualRefundedAmount: 5_000 } as RefundLedgerEntry;
    store.rawSet('payments', payment.id, payment);
    store.rawSet('supplier_payments', supplierPayment.id, supplierPayment);
    store.rawSet('refund_ledger', priorLedger.id, priorLedger);
    const service = new FinancialExceptionService(store, () => new Date(AT));

    const calculated = await service.calculateRefund('booking-a01', {
      reason: 'Customer cancellation after supplier commitments',
      supplierCancellationCharges: [{ amount: 10_000, sourceReference: 'supplier-letter-1', reason: 'Supplier cancellation charge' }],
      nonRefundableSupplierPaymentIds: ['supplier-payment-1'],
      recoverableSupplierAmounts: [{ amount: 5_000, sourceReference: 'supplier-credit-1', reason: 'Recoverable supplier credit' }],
    }, accounts1);
    expect(calculated.calculation).toMatchObject({
      verifiedPaymentsReceived: 100_000, supplierCancellationCharges: 10_000,
      nonRefundableSupplierPayments: 20_000, recoverableSupplierAmounts: 5_000,
      supplierDeductions: 25_000, alreadyRefundedAmount: 5_000, suggestedRefundAmount: 70_000,
    });
    const pending = await service.submitRefund(calculated.id, accounts1);
    expect(pending.status).toBe('PENDING_APPROVAL');
    await expect(service.decideRefund(calculated.id, 'APPROVED', { decisionNote: 'Self approve' }, { ...admin, employeeId: accounts1.employeeId })).rejects.toMatchObject({ code: 'REFUND_SELF_APPROVAL_DENIED' });
    const approved = await service.decideRefund(calculated.id, 'APPROVED', { approvedAmount: 70_000, decisionNote: 'Evidence reviewed' }, admin);
    expect(approved).toMatchObject({ status: 'APPROVED', actualRefundedAmount: 0 });
    await expect(service.markRefundPaid(calculated.id, { refundMethod: 'BANK_TRANSFER', refundReference: 'RF-1' }, accounts1)).rejects.toMatchObject({ code: 'REFUND_SEPARATION_OF_DUTIES_DENIED' });
    const paid = await service.markRefundPaid(calculated.id, { refundMethod: 'BANK_TRANSFER', refundReference: 'RF-1' }, accounts2);
    const repeated = await service.markRefundPaid(calculated.id, { refundMethod: 'BANK_TRANSFER', refundReference: 'RF-1' }, accounts2);
    expect(paid.refund.status).toBe('PAID');
    expect(paid.ledger.actualRefundedAmount).toBe(70_000);
    expect(repeated.idempotent).toBe(true);
    expect(store.rawList('refund_ledger')).toHaveLength(2);
    expect(store.rawGet('payments', payment.id)).toEqual(payment);
  });

  it('keeps rejected refunds non-financial', async () => {
    const store = exceptionStore('CANCELLED');
    store.rawSet('payments', 'payment-1', { id: 'payment-1', bookingId: 'booking-a01', amount: 20_000, status: 'VERIFIED' });
    const service = new FinancialExceptionService(store, () => new Date(AT));
    const request = await service.calculateRefund('booking-a01', { reason: 'Cancellation refund request' }, accounts1);
    await service.submitRefund(request.id, accounts1);
    const rejected = await service.decideRefund(request.id, 'REJECTED', { rejectionReason: 'Supporting supplier evidence is incomplete' }, admin);
    expect(rejected.status).toBe('REJECTED');
    expect(store.rawList('refund_ledger')).toHaveLength(0);
  });

  it('prevents overlapping approved refunds from exceeding the remaining refundable basis', async () => {
    const store = exceptionStore('CANCELLED');
    store.rawSet('payments', 'payment-1', { id: 'payment-1', bookingId: 'booking-a01', amount: 100_000, status: 'VERIFIED' });
    const service = new FinancialExceptionService(store, () => new Date(AT));
    const first = await service.calculateRefund('booking-a01', { reason: 'First parallel refund calculation' }, accounts1);
    const second = await service.calculateRefund('booking-a01', { reason: 'Second parallel refund calculation' }, accounts1);
    for (const request of [first, second]) {
      await service.submitRefund(request.id, accounts1);
      await service.decideRefund(request.id, 'APPROVED', { approvedAmount: 70_000, decisionNote: 'Approved against current calculation' }, admin);
    }
    await service.markRefundPaid(first.id, { refundMethod: 'BANK_TRANSFER', refundReference: 'RF-PARALLEL-1' }, accounts2);
    await expect(service.markRefundPaid(second.id, { refundMethod: 'BANK_TRANSFER', refundReference: 'RF-PARALLEL-2' }, accounts2)).rejects.toMatchObject({ code: 'REFUND_RECALCULATION_REQUIRED' });
    expect(store.rawList('refund_ledger')).toHaveLength(1);
  });

  it('earns one configurable commission for the original Sales owner at confirmation', async () => {
    const root = booking('PENDING_PAYMENT');
    root.amountReceived = 0;
    root.amountPending = 100_000;
    root.paymentStatus = 'UNPAID';
    const payment: PaymentRecord = {
      id: 'payment-confirm', bookingId: root.id, bookingReference: root.bookingReference, customerId: root.customerId,
      amount: 20_000, currency: 'INR', paymentDate: '2026-10-21', paymentMethod: 'UPI', referenceNumber: 'PAY-CNF', paymentType: 'ADVANCE',
      status: 'RECORDED', recordedByEmployeeId: 'sales-1', recordedBy: 'sales-1', recordedByName: 'Sales One', recordedByRole: 'Sales Executive', recordedAt: AT, createdAt: AT, updatedAt: AT,
    };
    const store = new InMemoryPaymentStorageProvider({
      bookings: [root], payments: [payment], employees: [{ employeeId: 'sales-1', commissionPerConfirmedBooking: 750 }],
    });
    const service = new PaymentService(store);
    const verificationActor = { id: 'accounts-1', employeeId: 'accounts-1', name: 'Accounts', role: 'Accounts' as const, active: true };
    const first = await service.verifyPayment(root.id, payment.id, verificationActor);
    const second = await service.verifyPayment(root.id, payment.id, verificationActor);
    expect(first.booking.status).toBe('CONFIRMED');
    expect(second.isIdempotent).toBe(true);
    expect(store.getCommissionEntries()).toEqual([expect.objectContaining({ type: 'EARNED', amount: 750, employeeId: 'sales-1' })]);
  });

  it('reverses commission on cancellation without deleting earned history or changing Sales ownership', async () => {
    const root = booking('CONFIRMED');
    const earned: CommissionLedgerEntry = {
      id: `commission-earned-${root.id}`, bookingId: root.id, employeeId: 'sales-1', type: 'EARNED', amount: 500,
      currency: 'INR', bookingStatus: 'CONFIRMED', reason: 'Earned', actorEmployeeId: 'accounts-1', createdAt: AT, idempotencyKey: 'earned',
    };
    const store = new InMemoryLifecycleStorageProvider({ bookings: [root], commissionEntries: [earned] });
    await new BookingLifecycleService(store).cancelBooking(root.id, { cancellationReason: 'Customer requested cancellation' }, { id: 'admin-1', ...admin });
    const entries = store.getAllCommissionEntries();
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual(expect.objectContaining({ type: 'REVERSAL', amount: 500, employeeId: 'sales-1', originalEntryId: earned.id }));
    expect(entries).toContainEqual(earned);
    expect(store.getAllBookings()[0].assignedSalesEmployeeId).toBe('sales-1');
    expect(store.getAllAuditLogs()).toContainEqual(expect.objectContaining({ action: 'COMMISSION_REVERSED' }));
  });

  it('backfills an auditable earned entry before reversing a legacy confirmed Booking', async () => {
    const root = booking('CONFIRMED');
    const store = new InMemoryLifecycleStorageProvider({
      bookings: [root],
      employees: [{ employeeId: 'sales-1', commissionPerConfirmedBooking: 625 }],
    });
    await new BookingLifecycleService(store).cancelBooking(root.id, { cancellationReason: 'Customer requested cancellation' }, { id: 'admin-1', ...admin });
    expect(store.getAllCommissionEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'EARNED', amount: 625, employeeId: 'sales-1' }),
      expect.objectContaining({ type: 'REVERSAL', amount: 625, employeeId: 'sales-1' }),
    ]));
    expect(store.getAllAuditLogs()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'COMMISSION_EARNED' }),
      expect.objectContaining({ action: 'COMMISSION_REVERSED' }),
    ]));
  });

  it('settles payable commission explicitly and idempotently while denying Sales settlement', async () => {
    const store = exceptionStore();
    store.rawSet('commission_ledger', 'earned-1', {
      id: 'earned-1', bookingId: 'booking-a01', employeeId: 'sales-1', type: 'EARNED', amount: 500,
      currency: 'INR', bookingStatus: 'CONFIRMED', reason: 'Earned', actorEmployeeId: 'accounts-1', createdAt: AT, idempotencyKey: 'earned-1',
    });
    const service = new FinancialExceptionService(store, () => new Date(AT));
    await expect(service.settleCommission('sales-1', { settlementReference: 'PAYROLL-1', idempotencyKey: 'settle-1', reason: 'October settlement' }, sales)).rejects.toMatchObject({ code: 'COMMISSION_SETTLEMENT_DENIED' });
    const first = await service.settleCommission('sales-1', { settlementReference: 'PAYROLL-1', idempotencyKey: 'settle-1', reason: 'October settlement' }, accounts1);
    const second = await service.settleCommission('sales-1', { settlementReference: 'PAYROLL-1', idempotencyKey: 'settle-1', reason: 'October settlement' }, accounts1);
    expect(first.summary).toMatchObject({ earned: 500, payable: 500, settled: 500, outstanding: 0 });
    expect(second.idempotent).toBe(true);
    expect(store.rawList('commission_ledger')).toHaveLength(2);
  });

  it('supports signed audited commission adjustments and serializes competing settlements', async () => {
    const store = exceptionStore();
    store.rawSet('commission_ledger', 'earned-1', {
      id: 'earned-1', bookingId: 'booking-a01', employeeId: 'sales-1', type: 'EARNED', amount: 500,
      currency: 'INR', bookingStatus: 'CONFIRMED', reason: 'Earned', actorEmployeeId: 'accounts-1', createdAt: AT, idempotencyKey: 'earned-1',
    });
    const service = new FinancialExceptionService(store, () => new Date(AT));
    await expect(service.adjustCommission('booking-a01', { amount: -100, reason: 'Approved correction to commission', idempotencyKey: 'adjust-negative' }, sales)).rejects.toMatchObject({ code: 'COMMISSION_ADJUSTMENT_DENIED' });
    await service.adjustCommission('booking-a01', { amount: -100, reason: 'Approved correction to commission', idempotencyKey: 'adjust-negative' }, admin);
    const attempts = await Promise.allSettled([
      service.settleCommission('sales-1', { settlementReference: 'PAYROLL-A', idempotencyKey: 'settle-a', reason: 'Concurrent settlement A' }, accounts1),
      service.settleCommission('sales-1', { settlementReference: 'PAYROLL-B', idempotencyKey: 'settle-b', reason: 'Concurrent settlement B' }, accounts2),
    ]);
    expect(attempts.filter(result => result.status === 'fulfilled' || result.status === 'rejected')).toHaveLength(2);
    expect(store.rawList('commission_ledger').filter(item => item.type === 'SETTLED')).toHaveLength(1);
    expect(store.rawList('commission_ledger').find(item => item.type === 'SETTLED').amount).toBe(400);
  });
});
