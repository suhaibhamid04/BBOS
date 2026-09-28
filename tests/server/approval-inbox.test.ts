import { describe, expect, it } from 'bun:test';
import {
  ApprovalInboxService,
  InMemoryApprovalInboxStorage,
  type ApprovalInboxActor,
  type ApprovalInboxSources,
  type EmergencySpendDecisionService,
} from '../../server/services/approvalInboxService';
import {
  InMemoryLiveOperationsStorage,
  LiveOperationsService,
} from '../../server/services/liveOperationsService';
import type { Booking, BookingAccommodation } from '../../src/types/booking';
import type { Quote, UserRole } from '../../src/types';
import type { EmergencySpendRequest, OperationalChangeRequest } from '../../src/types/liveOperations';
import path from 'node:path';

const CREATED = '2026-09-20T10:00:00.000Z';
const UPDATED = '2026-09-21T10:00:00.000Z';

function actor(role: UserRole, employeeId: string): ApprovalInboxActor {
  return { firebaseUid: `firebase-${employeeId}`, employeeId, role, active: true, name: `${role} User` };
}

const founder = actor('Founder', 'employee-founder');
const admin = actor('Admin', 'employee-admin');
const accounts = actor('Accounts', 'employee-accounts');
const operations = actor('Operations', 'employee-ops');
const reservations = actor('Reservations', 'employee-reservations');

function booking(): Booking {
  return {
    id: 'booking-1', bookingReference: 'BBOS-001', tripId: 'trip-1', customerId: 'customer-1', customerName: 'Guest One',
    status: 'IN_OPERATIONS', paymentStatus: 'PAID', amountReceived: 100_000, amountPending: 0, currency: 'INR',
    travelStartDate: '2026-09-20', travelEndDate: '2026-09-25', assignedOperationsEmployeeId: operations.employeeId,
    assignedReservationsEmployeeId: reservations.employeeId, createdAt: CREATED, updatedAt: UPDATED,
  };
}

function spend(overrides: Partial<EmergencySpendRequest> = {}): EmergencySpendRequest {
  return {
    id: 'spend-1', bookingId: 'booking-1', amountMinor: 25_000, currency: 'INR', purpose: 'Replacement transfer',
    category: 'REPLACEMENT_TRANSPORT', reason: 'Vehicle breakdown', requestedByEmployeeId: operations.employeeId,
    requestedAt: CREATED, status: 'REQUESTED', createdAt: CREATED, updatedAt: UPDATED, ...overrides,
  };
}

function change(overrides: Partial<OperationalChangeRequest> = {}): OperationalChangeRequest {
  return {
    id: 'change-1', bookingId: 'booking-1', changeType: 'COMMERCIAL_COST', description: 'Supplier requested a surcharge.',
    status: 'REQUIRES_COMMERCIAL_APPROVAL', requestedByEmployeeId: operations.employeeId, requestedAt: CREATED,
    createdAt: CREATED, updatedAt: UPDATED, ...overrides,
  };
}

function accommodation(recordedByEmployeeId = reservations.employeeId): BookingAccommodation {
  return {
    id: 'accommodation-1', bookingId: 'booking-1', tripId: 'trip-1', customerId: 'customer-1', propertyId: 'property-1',
    propertyName: 'Mountain Hotel', roomCategoryId: 'room-1', roomCategoryName: 'Deluxe', mealPlan: 'MAP',
    checkInDate: '2026-09-20', checkOutDate: '2026-09-22', nightsCount: 2, roomsCount: 1, adultsCount: 2,
    childrenCount: 0, supplierId: 'supplier-secret', confirmationStatus: 'REQUESTED', voucherStatus: 'PENDING',
    supplierConfirmation: {
      bookingReference: 'BBOS-001', serviceId: 'accommodation-1', supplierId: 'supplier-secret', propertyId: 'property-1',
      propertyName: 'Mountain Hotel', status: 'REQUESTED', confirmedRoomCategoryId: 'room-1', confirmedRoomCategoryName: 'Deluxe',
      confirmedMealPlan: 'MAP', confirmedCheckInDate: '2026-09-20', confirmedCheckOutDate: '2026-09-22',
      confirmedGuestNames: ['Guest One'], confirmedRoomsCount: 1, confirmedAdultsCount: 2, confirmedChildrenCount: 0,
      updatedAt: UPDATED, updatedByEmployeeId: recordedByEmployeeId, requiresCommercialApproval: true,
      rateDiscrepancy: {
        frozenSupplierUnitRate: 10_000, confirmedSupplierUnitRate: 12_000, difference: 2_000,
        reason: 'Seasonal surcharge', recordedAt: CREATED, recordedByEmployeeId,
        requiresCommercialApproval: true, approvalStatus: 'REQUIRED',
      },
    },
    schemaVersion: '2B-5', createdAt: CREATED, updatedAt: UPDATED,
  };
}

function quote(owner = 'employee-sales'): Quote {
  return {
    id: 'quote-1', leadId: 'lead-1', customerId: 'customer-1', customerName: 'Guest One', destination: 'Kashmir',
    travelerCount: 2, totalAmount: 200_000, discountAmount: 0, finalAmount: 200_000, totalSupplierCost: 150_000,
    grossProfit: 50_000, grossMargin: 25, status: 'DRAFT', validUntil: '2026-10-01', createdAt: CREATED,
    updatedAt: UPDATED, salesEmployeeId: owner, createdByEmployeeId: owner,
    requiresLowMarginApproval: true, approval: { required: true, state: 'PENDING' }, version: 1,
  };
}

function sources(spends = [spend()]): ApprovalInboxSources {
  return {
    bookings: [booking()], emergencySpends: spends, supplierRateDiscrepancies: [accommodation()],
    operationalChanges: [change()], quotes: [quote()],
  };
}

function setup(initial = sources(), decisions?: EmergencySpendDecisionService) {
  return new ApprovalInboxService(new InMemoryApprovalInboxStorage(initial), decisions);
}

describe('Unified Approval Inbox visibility', () => {
  it('keeps the legacy approval collection server-only', async () => {
    const rules = await Bun.file(path.join(process.cwd(), 'firestore.rules')).text();
    const block = rules.match(/match \/approvals\/\{approvalId\} \{([\s\S]*?)\n\s*\}/)?.[1] || '';
    expect(block).toContain('allow read, create, update, delete: if false');
  });

  it('gives Founder and Admin a company-wide pending view across all current sources', async () => {
    for (const leader of [founder, admin]) {
      const inbox = await setup().getInbox(leader);
      expect(new Set(inbox.allPending?.map((item) => item.type))).toEqual(new Set([
        'EMERGENCY_SPEND', 'SUPPLIER_RATE_DISCREPANCY', 'OPERATIONAL_COMMERCIAL_CHANGE', 'QUOTE_APPROVAL',
      ]));
      expect(inbox.awaitingMyDecision.map((item) => item.type)).toEqual(['EMERGENCY_SPEND']);
    }
  });

  it('limits Accounts to authorized financial spend items and does not leak Quote or supplier details', async () => {
    const inbox = await setup().getInbox(accounts);
    const visible = [...inbox.awaitingMyDecision, ...inbox.submittedByMe, ...inbox.recentlyDecided];
    expect(visible.every((item) => item.type === 'EMERGENCY_SPEND')).toBe(true);
    expect(JSON.stringify(inbox)).not.toContain('supplier-secret');
    expect(JSON.stringify(inbox)).not.toContain('grossMargin');
  });

  it('shows Operations only submitted-own spend/change status without approval power', async () => {
    const otherSpend = spend({ id: 'spend-other', requestedByEmployeeId: 'employee-other' });
    const inbox = await setup(sources([spend(), otherSpend])).getInbox(operations);
    expect(inbox.submittedByMe.map((item) => item.type).sort()).toEqual(['EMERGENCY_SPEND', 'OPERATIONAL_COMMERCIAL_CHANGE']);
    expect(inbox.awaitingMyDecision).toEqual([]);
    expect(JSON.stringify(inbox)).not.toContain('spend-other');
  });

  it('shows Reservations only their own rate discrepancy escalation', async () => {
    const initial = sources();
    initial.supplierRateDiscrepancies.push(accommodation('employee-other'));
    initial.supplierRateDiscrepancies[1].id = 'accommodation-other';
    const inbox = await setup(initial).getInbox(reservations);
    expect(inbox.submittedByMe).toHaveLength(1);
    expect(inbox.submittedByMe[0]).toMatchObject({ type: 'SUPPLIER_RATE_DISCREPANCY', actionable: false });
  });

  it('fails closed for Marketing and unknown roles', async () => {
    await expect(setup().getInbox(actor('Marketing', 'employee-marketing'))).rejects.toMatchObject({ statusCode: 403 });
    await expect(setup().getInbox({ ...founder, role: 'Unknown Role' })).rejects.toMatchObject({ code: 'APPROVAL_INBOX_DENIED' });
  });

  it('computes notification counts only from the actor-visible scope', async () => {
    const founderInbox = await setup().getInbox(founder);
    const accountsInbox = await setup().getInbox(accounts);
    const operationsInbox = await setup().getInbox(operations);
    expect(founderInbox.summary).toMatchObject({ pendingCount: 4, highPriorityCount: 3, oldestPendingAt: CREATED });
    expect(accountsInbox.summary).toMatchObject({ pendingCount: 1, highPriorityCount: 1 });
    expect(operationsInbox.summary).toMatchObject({ pendingCount: 2, highPriorityCount: 2 });
  });

  it('does not expose Quote supplier cost/profit through the normalized projection', async () => {
    const quoteItem = (await setup().getInbox(founder)).allPending?.find((item) => item.type === 'QUOTE_APPROVAL');
    expect(quoteItem).toBeDefined();
    expect(JSON.stringify(quoteItem)).not.toContain('150000');
    expect(JSON.stringify(quoteItem)).not.toContain('grossProfit');
  });
});

describe('Unified Approval Inbox decision routing', () => {
  it('routes emergency-spend decisions through the existing authoritative service', async () => {
    const calls: unknown[][] = [];
    const decisions: EmergencySpendDecisionService = {
      async decideSpend(...args) { calls.push(args); return spend({ status: 'APPROVED' }); },
    };
    await setup(sources(), decisions).decide('EMERGENCY_SPEND:spend-1', {
      decision: 'APPROVED', expectedUpdatedAt: UPDATED,
    }, accounts);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('spend-1');
    expect(calls[0][2]).toMatchObject({ employeeId: accounts.employeeId });
  });

  it('refuses to falsely approve a review-only commercial change', async () => {
    let calls = 0;
    const decisions: EmergencySpendDecisionService = {
      async decideSpend() { calls += 1; return spend(); },
    };
    await expect(setup(sources(), decisions).decide('OPERATIONAL_COMMERCIAL_CHANGE:change-1', {
      decision: 'APPROVED', expectedUpdatedAt: UPDATED,
    }, founder)).rejects.toMatchObject({ statusCode: 422, code: 'APPROVAL_ITEM_NOT_ACTIONABLE' });
    expect(calls).toBe(0);
  });

  it('preserves anti-self-approval, stale-version, and already-decided protections', async () => {
    const selfRequested = spend({ requestedByEmployeeId: accounts.employeeId });
    const selfStorage = new InMemoryLiveOperationsStorage({ bookings: [booking()], spendRequests: [selfRequested] });
    const selfService = setup(sources([selfRequested]), new LiveOperationsService(selfStorage, () => new Date('2026-09-28T00:00:00.000Z')));
    await expect(selfService.decide('EMERGENCY_SPEND:spend-1', { decision: 'APPROVED', expectedUpdatedAt: UPDATED }, accounts))
      .rejects.toMatchObject({ code: 'SELF_APPROVAL_DENIED' });
    expect(selfStorage.getMutationCount()).toBe(0);

    const domainStorage = new InMemoryLiveOperationsStorage({ bookings: [booking()], spendRequests: [spend()] });
    const service = setup(sources(), new LiveOperationsService(domainStorage, () => new Date('2026-09-28T00:00:00.000Z')));
    await expect(service.decide('EMERGENCY_SPEND:spend-1', { decision: 'APPROVED', expectedUpdatedAt: 'stale' }, accounts))
      .rejects.toMatchObject({ code: 'SPEND_CONFLICT' });
    expect(domainStorage.getMutationCount()).toBe(0);

    const approved = await service.decide('EMERGENCY_SPEND:spend-1', { decision: 'APPROVED', expectedUpdatedAt: UPDATED }, accounts);
    expect(approved.status).toBe('APPROVED');
    await expect(service.decide('EMERGENCY_SPEND:spend-1', { decision: 'REJECTED', expectedUpdatedAt: approved.updatedAt, rejectionReason: 'No' }, founder))
      .rejects.toMatchObject({ code: 'SPEND_ALREADY_DECIDED' });
  });
});
