import { describe, expect, it } from 'bun:test';
import {
  ApprovalInboxService,
  InMemoryApprovalInboxStorage,
  LowMarginQuoteApprovalService,
  type ApprovalInboxActor,
  type ApprovalInboxSources,
  type EmergencySpendDecisionService,
} from '../../server/services/approvalInboxService';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import { authorizeResource } from '../../server/authorization/policyEngine';
import { quoteResourceContext } from '../../server/authorization/resourceContext';
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
const salesExecutive = { ...actor('Sales Executive', 'employee-sales'), salesTeamId: 'team-kashmir' };
const salesManager = { ...actor('Sales Manager', 'employee-manager'), salesTeamId: 'team-kashmir' };

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
    updatedAt: UPDATED, salesEmployeeId: owner, salesEmployeeName: 'Sales Person', salesTeamId: 'team-kashmir',
    createdByEmployeeId: owner, tripId: 'trip-1', supplierCostSource: {
      type: 'TRIP', sourceId: 'trip-1', asOf: UPDATED, costingRevision: 4,
    },
    requiresLowMarginApproval: true, approval: {
      required: true, state: 'REVIEW_REQUIRED', thresholdPercent: 30, assessedAt: UPDATED,
    }, version: 1,
  };
}

function approvalTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trip-1', customerId: 'customer-1', title: 'Kashmir Package', destination: 'Kashmir',
    startDate: '2026-10-10', endDate: '2026-10-15', travelerCount: 2, adults: 2, children: 0,
    tripType: 'LEISURE', status: 'QUOTE_READY', currency: 'INR', totalSupplierCost: 150_000,
    totalSellingPrice: 200_000, grossProfit: 50_000, grossMargin: 25, costingStatus: 'CALCULATED',
    costingRevision: 4, costingCalculatedRevision: 4, assignedSalesEmployeeId: 'employee-sales',
    salesTeamId: 'team-kashmir', createdAt: CREATED, updatedAt: UPDATED,
    commercialApproval: { required: true, state: 'REVIEW_REQUIRED', thresholdPercent: 30, assessedAt: UPDATED },
    ...overrides,
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
      expect(new Set(inbox.awaitingMyDecision.map((item) => item.type))).toEqual(new Set(['EMERGENCY_SPEND', 'QUOTE_APPROVAL']));
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

  it('shows authorized Quote reviewers the decision economics without technical inventory fields', async () => {
    const quoteItem = (await setup().getInbox(founder)).allPending?.find((item) => item.type === 'QUOTE_APPROVAL');
    expect(quoteItem).toBeDefined();
    expect(quoteItem?.context).toMatchObject({
      customerName: 'Guest One', salespersonName: 'Sales Person', supplierCost: 150_000,
      sellingPrice: 200_000, profit: 50_000, marginPercent: 25, thresholdPercent: 30,
    });
    expect(JSON.stringify(quoteItem)).not.toContain('supplierCostSource');
  });

  it('makes TEAM low-margin Quotes actionable for the Sales Manager but not the Sales Executive', async () => {
    const managerInbox = await setup().getInbox(salesManager);
    expect(managerInbox.awaitingMyDecision).toHaveLength(1);
    expect(managerInbox.awaitingMyDecision[0]).toMatchObject({ type: 'QUOTE_APPROVAL', actionable: true });
    const executiveInbox = await setup().getInbox(salesExecutive);
    expect(executiveInbox.awaitingMyDecision).toEqual([]);
    expect(executiveInbox.submittedByMe[0]).toMatchObject({ type: 'QUOTE_APPROVAL', actionable: false });
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

  it('approves a TEAM Quote atomically and captures immutable reviewer/economics audit data', async () => {
    const q = quote();
    const storage = new InMemoryConversionStorageProvider({ quotes: [q], trips: [approvalTrip()] });
    const decisionService = new LowMarginQuoteApprovalService(storage, () => new Date('2026-09-28T00:00:00.000Z'));
    const service = new ApprovalInboxService(new InMemoryApprovalInboxStorage(sources()), undefined, decisionService);
    const decisionResponse = await service.decide('QUOTE_APPROVAL:quote-1', {
      decision: 'APPROVED', expectedUpdatedAt: `1:${UPDATED}`, decisionNote: 'Approved for strategic account.',
    }, salesManager) as Pick<Quote, 'id' | 'version' | 'updatedAt' | 'approval'>;
    expect(decisionResponse.approval).toMatchObject({
      required: true, state: 'APPROVED', currentDecision: {
        reviewerEmployeeId: salesManager.employeeId, totalSupplierCost: 150_000,
        totalSellingPrice: 200_000, grossProfit: 50_000, grossMargin: 25,
        thresholdPercent: 30, note: 'Approved for strategic account.',
      },
    });
    const approved = storage.rawGet('quotes', 'quote-1') as Quote;
    expect(storage.rawGet('trips', 'trip-1').commercialApproval.state).toBe('APPROVED');
    expect(authorizeResource(salesExecutive, 'QUOTE', 'CONVERT_TO_BOOKING', quoteResourceContext({ ...approved, status: 'SENT' })).allowed).toBe(true);
    const audit = storage.getAllAuditLogs().find(item => item.action === 'LOW_MARGIN_APPROVED');
    expect(audit).toMatchObject({ actorId: salesManager.employeeId, entityId: 'quote-1' });
    expect(audit?.after).toMatchObject({
      tripId: 'trip-1', quoteId: 'quote-1', reviewerEmployeeId: salesManager.employeeId,
      totalSupplierCost: 150_000, totalSellingPrice: 200_000, thresholdPercent: 30,
    });
  });

  it('keeps rejected Quotes blocked and records the optional reason', async () => {
    const storage = new InMemoryConversionStorageProvider({ quotes: [quote()], trips: [approvalTrip()] });
    const service = new LowMarginQuoteApprovalService(storage, () => new Date('2026-09-28T00:00:00.000Z'));
    const rejected = await service.decideQuote('quote-1', {
      decision: 'REJECTED', expectedUpdatedAt: `1:${UPDATED}`, decisionNote: 'Margin is not supportable.',
    }, founder);
    expect(rejected.approval).toMatchObject({ state: 'REJECTED', currentDecision: { note: 'Margin is not supportable.' } });
    expect(authorizeResource(salesExecutive, 'QUOTE', 'CONVERT_TO_BOOKING', quoteResourceContext({ ...rejected, status: 'SENT' }))).toMatchObject({
      allowed: false, code: 'APPROVAL_REQUIRED',
    });
    expect(storage.getAllAuditLogs().some(item => item.action === 'LOW_MARGIN_REJECTED')).toBe(true);
  });

  it('denies Sales self-approval and wrong-team managers with zero writes', async () => {
    for (const deniedActor of [salesExecutive, { ...salesManager, employeeId: 'manager-other', salesTeamId: 'team-ladakh' }]) {
      const storage = new InMemoryConversionStorageProvider({ quotes: [quote()], trips: [approvalTrip()] });
      const service = new LowMarginQuoteApprovalService(storage);
      await expect(service.decideQuote('quote-1', {
        decision: 'APPROVED', expectedUpdatedAt: `1:${UPDATED}`,
      }, deniedActor)).rejects.toMatchObject({ statusCode: 403 });
      expect(storage.rawGet('quotes', 'quote-1').approval.state).toBe('REVIEW_REQUIRED');
      expect(storage.getAllAuditLogs()).toHaveLength(0);
    }
  });

  it('rejects a forged reviewer identity instead of accepting client-authored approval metadata', async () => {
    const storage = new InMemoryConversionStorageProvider({ quotes: [quote()], trips: [approvalTrip()] });
    const service = new LowMarginQuoteApprovalService(storage);
    await expect(service.decideQuote('quote-1', {
      decision: 'APPROVED', expectedUpdatedAt: `1:${UPDATED}`, reviewerEmployeeId: 'employee-founder',
    } as any, salesManager)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_APPROVAL_DECISION' });
    expect(storage.rawGet('quotes', 'quote-1').approval.state).toBe('REVIEW_REQUIRED');
    expect(storage.getAllAuditLogs()).toHaveLength(0);
  });

  it('allows Founder/Admin ALL scope and rejects stale-screen or changed-economics decisions', async () => {
    for (const leader of [founder, admin]) {
      const storage = new InMemoryConversionStorageProvider({ quotes: [quote()], trips: [approvalTrip()] });
      const approved = await new LowMarginQuoteApprovalService(storage).decideQuote('quote-1', {
        decision: 'APPROVED', expectedUpdatedAt: `1:${UPDATED}`,
      }, leader);
      expect(approved.approval?.state).toBe('APPROVED');
    }

    const staleStorage = new InMemoryConversionStorageProvider({ quotes: [quote()], trips: [approvalTrip()] });
    const staleService = new LowMarginQuoteApprovalService(staleStorage);
    await expect(staleService.decideQuote('quote-1', {
      decision: 'APPROVED', expectedUpdatedAt: `0:${CREATED}`,
    }, salesManager)).rejects.toMatchObject({ code: 'QUOTE_APPROVAL_CONFLICT' });
    staleStorage.rawUpdate('trips', 'trip-1', { totalSellingPrice: 190_000, grossProfit: 40_000, grossMargin: 21.1 });
    await expect(staleService.decideQuote('quote-1', {
      decision: 'APPROVED', expectedUpdatedAt: `1:${UPDATED}`,
    }, salesManager)).rejects.toMatchObject({ code: 'QUOTE_APPROVAL_CONFLICT' });
    expect(staleStorage.getAllAuditLogs()).toHaveLength(0);
  });
});
