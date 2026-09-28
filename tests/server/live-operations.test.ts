import { describe, expect, it } from 'bun:test';
import {
  InMemoryLiveOperationsStorage,
  LiveOperationsService,
  type LiveOperationsActor,
} from '../../server/services/liveOperationsService';
import {
  InMemoryConfirmationStorageProvider,
  ServiceConfirmationService,
} from '../../server/services/serviceConfirmationService';
import {
  InMemoryOperationsControlRoomStorage,
  OperationsControlRoomService,
  type OperationalBookingBundle,
} from '../../server/services/operationsControlRoomService';
import type { Booking, BookingActivity, BookingTransport } from '../../src/types/booking';
import type { EmergencySpendRequest } from '../../src/types/liveOperations';
import type { UserRole } from '../../src/types';

const NOW = new Date('2026-09-28T06:00:00.000Z');
const INITIAL_UPDATED_AT = '2026-09-01T00:00:00.000Z';

function actor(role: UserRole, employeeId: string): LiveOperationsActor {
  return { firebaseUid: `firebase-${employeeId}`, employeeId, role, active: true, name: `${role} User` };
}

const opsOne = actor('Operations', 'employee-ops-01');
const opsTwo = actor('Operations', 'employee-ops-02');
const founder = actor('Founder', 'employee-founder');
const admin = actor('Admin', 'employee-admin');
const accounts = actor('Accounts', 'employee-accounts');

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-live-01', bookingReference: 'BBOS-LIVE-01', tripId: 'trip-live-01', customerId: 'customer-live-01',
    customerName: 'Live Guest', status: 'IN_OPERATIONS', paymentStatus: 'PAID', amountReceived: 50_000, amountPending: 0,
    travelStartDate: '2026-09-28', travelEndDate: '2026-10-01', assignedOperationsEmployeeId: opsOne.employeeId,
    createdAt: INITIAL_UPDATED_AT, updatedAt: INITIAL_UPDATED_AT, ...overrides,
  };
}

function transport(overrides: Partial<BookingTransport> = {}): BookingTransport {
  return {
    id: 'transport-live-01', bookingId: 'booking-live-01', tripId: 'trip-live-01', customerId: 'customer-live-01',
    vehicleCategoryId: 'vehicle-suv', vehicleCategoryName: 'SUV', routeName: 'Airport transfer', serviceDate: '2026-09-28',
    daysCount: 1, pickupLocation: 'Airport', dropoffLocation: 'Hotel', passengerCount: 2, supplierId: 'supplier-transport',
    confirmationStatus: 'CONFIRMED', voucherStatus: 'GENERATED', schemaVersion: '2B-5',
    createdAt: INITIAL_UPDATED_AT, updatedAt: INITIAL_UPDATED_AT, ...overrides,
  };
}

function activity(overrides: Partial<BookingActivity> = {}): BookingActivity {
  return {
    id: 'activity-live-01', bookingId: 'booking-live-01', tripId: 'trip-live-01', customerId: 'customer-live-01',
    activityMasterId: 'activity-01', activityName: 'City Tour', destinationId: 'destination-01', destinationName: 'Srinagar',
    serviceDate: '2026-09-29', participantCount: 2, supplierId: 'supplier-activity', confirmationStatus: 'CONFIRMED',
    voucherStatus: 'GENERATED', schemaVersion: '2B-5', createdAt: INITIAL_UPDATED_AT, updatedAt: INITIAL_UPDATED_AT, ...overrides,
  };
}

function setup(root: Booking = booking()) {
  const storage = new InMemoryLiveOperationsStorage({
    bookings: [root],
    serviceLinks: [
      { bookingId: root.id, type: 'TRANSPORT', serviceId: 'transport-live-01' },
      { bookingId: root.id, type: 'ACTIVITY', serviceId: 'activity-live-01' },
    ],
  });
  return { storage, service: new LiveOperationsService(storage, () => NOW) };
}

const issueInput = {
  category: 'TRANSPORT' as const,
  title: 'Guest pickup delayed',
  description: 'Driver is delayed by twenty minutes.',
  priority: 'HIGH' as const,
  hasFinancialImpact: false,
  linkedService: { type: 'TRANSPORT' as const, serviceId: 'transport-live-01' },
};

const spendInput = {
  amountMinor: 250_000,
  currency: 'INR',
  purpose: 'Replacement taxi',
  category: 'REPLACEMENT_TRANSPORT' as const,
  reason: 'Original vehicle became unavailable during the trip.',
};

describe('Stage D5B guest issues', () => {
  it('allows assigned Operations to create an issue with server-authored identity', async () => {
    const { service, storage } = setup();
    const issue = await service.createIssue(booking().id, issueInput, { ...opsOne, firebaseUid: opsTwo.employeeId });
    expect(issue).toMatchObject({ status: 'OPEN', reportedByEmployeeId: opsOne.employeeId, assignedEmployeeId: opsOne.employeeId });
    expect(storage.getAudits()[0]).toMatchObject({ action: 'OPERATIONS_ISSUE_CREATED', actorId: opsOne.employeeId });
  });

  it('denies unassigned and another Operations employee with zero writes', async () => {
    for (const [root, operationActor] of [
      [booking({ assignedOperationsEmployeeId: undefined }), opsOne],
      [booking(), opsTwo],
    ] as const) {
      const { service, storage } = setup(root);
      await expect(service.createIssue(root.id, issueInput, operationActor)).rejects.toMatchObject({ statusCode: 403 });
      expect(storage.getMutationCount()).toBe(0);
    }
  });

  it('allows Founder/Admin across assignments and rejects other roles', async () => {
    for (const leader of [founder, admin]) {
      const { service } = setup(booking({ assignedOperationsEmployeeId: undefined }));
      expect((await service.createIssue(booking().id, issueInput, leader)).status).toBe('OPEN');
    }
    for (const role of ['Reservations', 'Accounts', 'Sales Manager', 'Sales Executive', 'Marketing'] as const) {
      const { service, storage } = setup();
      await expect(service.createIssue(booking().id, issueInput, actor(role, `employee-${role}`))).rejects.toMatchObject({ statusCode: 403 });
      expect(storage.getMutationCount()).toBe(0);
    }
  });

  it('validates lifecycle, rejects forged reporter/resolver, and records canonical resolver', async () => {
    const { service, storage } = setup();
    await expect(service.createIssue(booking().id, { ...issueInput, reportedByEmployeeId: 'forged' }, opsOne))
      .rejects.toMatchObject({ code: 'PROTECTED_ISSUE_FIELD' });
    const issue = await service.createIssue(booking().id, issueInput, opsOne);
    await expect(service.updateIssue(booking().id, issue.id, {
      status: 'RESOLVED', resolutionNotes: 'Guest transferred safely.', resolvedByEmployeeId: 'forged', expectedUpdatedAt: issue.updatedAt,
    }, opsOne)).rejects.toMatchObject({ code: 'PROTECTED_ISSUE_FIELD' });
    const resolved = await service.updateIssue(booking().id, issue.id, {
      status: 'RESOLVED', resolutionNotes: 'Guest transferred safely.', expectedUpdatedAt: issue.updatedAt,
    }, { ...opsOne, firebaseUid: 'unrelated-firebase-uid' });
    expect(resolved).toMatchObject({ status: 'RESOLVED', resolvedByEmployeeId: opsOne.employeeId });
    expect(storage.getAudits().at(-1)).toMatchObject({ action: 'OPERATIONS_ISSUE_RESOLVED', actorId: opsOne.employeeId });
    await expect(service.updateIssue(booking().id, issue.id, { status: 'OPEN', expectedUpdatedAt: resolved.updatedAt }, opsOne))
      .rejects.toMatchObject({ code: 'ISSUE_ALREADY_RESOLVED' });
  });
});

describe('Stage D5B live operational service updates', () => {
  function operationalSetup() {
    const storage = new InMemoryConfirmationStorageProvider({ bookings: [booking()], transports: [transport()], activities: [activity()] });
    return { storage, service: new ServiceConfirmationService(storage) };
  }

  it('allows assigned Operations to update driver, vehicle, pickup time, and notes', async () => {
    const { service, storage } = operationalSetup();
    await service.confirmTransport(booking().id, transport().id, {
      driverName: 'New Driver', driverPhone: '+91 9999999999', vehicleRegistrationNumber: 'JK01AA1234',
      pickupTime: '11:30', operationalNotes: 'Meet at gate 2', expectedUpdatedAt: INITIAL_UPDATED_AT,
    }, opsOne);
    expect(storage.getTransportSync(transport().id)).toMatchObject({ driverName: 'New Driver', vehicleRegistrationNumber: 'JK01AA1234', pickupTime: '11:30', operationalNotes: 'Meet at gate 2' });
    expect(storage.getAllAuditLogs()[0]).toMatchObject({ action: 'OPERATIONAL_SERVICE_UPDATED', actorId: opsOne.employeeId });
  });

  it('denies unauthorized Operations and causes zero writes', async () => {
    const { service, storage } = operationalSetup();
    await expect(service.confirmTransport(booking().id, transport().id, { driverName: 'Forged' }, opsTwo)).rejects.toMatchObject({ statusCode: 403 });
    expect(storage.getMutationCount()).toBe(0);
  });

  it('rejects commercial, financial, ownership, and assignment fields', async () => {
    for (const protectedPayload of [
      { supplierId: 'other-supplier' }, { totalSupplierCost: 1 }, { amountReceived: 0 },
      { assignedOperationsEmployeeId: opsTwo.employeeId }, { vehicleCategoryId: 'luxury-bus' },
    ]) {
      const { service, storage } = operationalSetup();
      await expect(service.confirmTransport(booking().id, transport().id, protectedPayload as any, opsOne))
        .rejects.toMatchObject({ code: 'PROTECTED_OPERATIONAL_FIELD' });
      expect(storage.getMutationCount()).toBe(0);
    }
  });

  it('rejects stale service updates safely', async () => {
    const { service, storage } = operationalSetup();
    await expect(service.confirmActivity(booking().id, activity().id, {
      assignedGuideName: 'Guide', expectedUpdatedAt: 'stale-version',
    }, opsOne)).rejects.toMatchObject({ statusCode: 409, code: 'CONFIRMATION_CONFLICT' });
    expect(storage.getMutationCount()).toBe(0);
  });
});

describe('Stage D5B emergency operational spend', () => {
  it('allows assigned Operations to request spend using integer minor units', async () => {
    const { service, storage } = setup();
    const request = await service.requestSpend(booking().id, spendInput, opsOne);
    expect(request).toMatchObject({ amountMinor: 250_000, currency: 'INR', status: 'REQUESTED', requestedByEmployeeId: opsOne.employeeId });
    expect(storage.getAudits()[0]).toMatchObject({ action: 'EMERGENCY_SPEND_REQUESTED', actorId: opsOne.employeeId });
    expect(await service.listSpendRequests(opsOne)).toHaveLength(1);
    expect(await service.listSpendRequests(accounts)).toHaveLength(1);
    await expect(service.listSpendRequests(actor('Marketing', 'employee-marketing'))).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects invalid/non-integer amounts and forged approval fields with zero writes', async () => {
    for (const input of [
      { ...spendInput, amountMinor: 12.5 }, { ...spendInput, amountMinor: 0 },
      { ...spendInput, status: 'APPROVED' }, { ...spendInput, approvedByEmployeeId: opsOne.employeeId },
    ]) {
      const { service, storage } = setup();
      await expect(service.requestSpend(booking().id, input, opsOne)).rejects.toBeTruthy();
      expect(storage.getMutationCount()).toBe(0);
    }
  });

  it('denies Operations approval and enforces anti-self-approval', async () => {
    const { service, storage } = setup();
    const request = await service.requestSpend(booking().id, spendInput, opsOne);
    const beforeDecision = storage.getMutationCount();
    await expect(service.decideSpend(request.id, { decision: 'APPROVED', expectedUpdatedAt: request.updatedAt }, opsOne))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(storage.getMutationCount()).toBe(beforeDecision);

    const selfSetup = setup();
    const founderRequest = await selfSetup.service.requestSpend(booking().id, spendInput, founder);
    await expect(selfSetup.service.decideSpend(founderRequest.id, { decision: 'APPROVED', expectedUpdatedAt: founderRequest.updatedAt }, founder))
      .rejects.toMatchObject({ code: 'SELF_APPROVAL_DENIED' });
  });

  it('allows Accounts, Founder, and Admin to approve or reject transactionally', async () => {
    for (const [approver, decision] of [[accounts, 'APPROVED'], [founder, 'APPROVED'], [admin, 'REJECTED']] as const) {
      const { service, storage } = setup();
      const request = await service.requestSpend(booking().id, spendInput, opsOne);
      const decided = await service.decideSpend(request.id, {
        decision, expectedUpdatedAt: request.updatedAt, ...(decision === 'REJECTED' ? { rejectionReason: 'Receipt or purpose was insufficient.' } : {}),
      }, approver);
      expect(decided.status).toBe(decision);
      expect(storage.getAudits().at(-1)).toMatchObject({ action: `EMERGENCY_SPEND_${decision}`, actorId: approver.employeeId });
    }
  });

  it('keeps rejected requests non-authoritative and detects stale decisions', async () => {
    const { service, storage } = setup();
    const request = await service.requestSpend(booking().id, spendInput, opsOne);
    await expect(service.decideSpend(request.id, { decision: 'APPROVED', expectedUpdatedAt: 'stale' }, accounts))
      .rejects.toMatchObject({ code: 'SPEND_CONFLICT' });
    const rejected = await service.decideSpend(request.id, {
      decision: 'REJECTED', rejectionReason: 'Not an approved operational necessity.', expectedUpdatedAt: request.updatedAt,
    }, accounts);
    expect(rejected.status).toBe('REJECTED');
    expect((rejected as EmergencySpendRequest & { actualSpendMinor?: number }).actualSpendMinor).toBeUndefined();
  });
});

describe('Stage D5B commercial-change escalation and Control Room signals', () => {
  it('records significant changes for later approval without changing commercial records', async () => {
    const { service, storage } = setup();
    const change = await service.createChangeRequest(booking().id, {
      changeType: 'COMMERCIAL_COST', description: 'Replacement transport requires a supplier price increase.',
      linkedService: { type: 'TRANSPORT', serviceId: transport().id },
    }, opsOne);
    expect(change.status).toBe('REQUIRES_COMMERCIAL_APPROVAL');
    expect(storage.getChanges()).toHaveLength(1);
    expect(storage.getAudits()[0]).toMatchObject({ action: 'OPERATIONAL_CHANGE_ESCALATED', actorId: opsOne.employeeId });
  });

  it('surfaces open/high issues, pending spend, and commercial follow-up while resolved routine issues disappear', async () => {
    const root = booking();
    const liveStorage = new InMemoryLiveOperationsStorage({ bookings: [root] });
    const liveService = new LiveOperationsService(liveStorage, () => NOW);
    const issue = await liveService.createIssue(root.id, { ...issueInput, linkedService: undefined }, opsOne);
    await liveService.requestSpend(root.id, spendInput, opsOne);
    await liveService.createChangeRequest(root.id, { changeType: 'SERVICE_SCOPE', description: 'Guest requests an additional sightseeing service.' }, opsOne);
    const bundle: OperationalBookingBundle = { booking: root, accommodations: [], transports: [transport()], activities: [], suppliers: [] };
    const controlStorage = new InMemoryOperationsControlRoomStorage({ bundles: [bundle] });
    const controlRoom = new OperationsControlRoomService(controlStorage, () => NOW, 7, liveService);

    const founderView = await controlRoom.getControlRoom(founder);
    expect(founderView.openIssues).toHaveLength(1);
    expect(founderView.pendingSpendRequests).toHaveLength(1);
    expect(founderView.commercialChangeRequests).toHaveLength(1);
    expect(founderView.attentionRequired.map((item) => item.code)).toContain('HIGH_PRIORITY_GUEST_ISSUE');
    expect(founderView.attentionRequired.map((item) => item.code)).toContain('EMERGENCY_SPEND_APPROVAL_REQUIRED');
    expect(founderView.attentionRequired.map((item) => item.code)).toContain('COMMERCIAL_CHANGE_FOLLOW_UP_REQUIRED');

    await liveService.updateIssue(root.id, issue.id, { status: 'RESOLVED', resolutionNotes: 'Resolved routinely.', expectedUpdatedAt: issue.updatedAt }, opsOne);
    const operationsView = await controlRoom.getControlRoom(opsOne);
    expect(operationsView.openIssues).toHaveLength(0);
    expect(operationsView.attentionRequired.map((item) => item.code)).not.toContain('HIGH_PRIORITY_GUEST_ISSUE');
    expect(operationsView.attentionRequired.map((item) => item.code)).not.toContain('EMERGENCY_SPEND_APPROVAL_REQUIRED');
  });

  it('keeps D5B records and authoritative audit events server-only in Firestore rules', async () => {
    const rules = await Bun.file(new URL('../../firestore.rules', import.meta.url)).text();
    for (const collection of ['booking_operational_issues', 'operational_change_requests', 'emergency_spend_requests']) {
      const block = rules.match(new RegExp(`match /${collection}/\\{[^}]+\\} \\{([\\s\\S]*?)\\n    \\}`))?.[1] || '';
      expect(block).toContain('allow read, create, update, delete: if false;');
    }
    const transportRules = rules.match(/match \/booking_transports\/\{docId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    expect(transportRules).toContain("'pickupTime'");
    for (const action of [
      'OPERATIONS_ISSUE_CREATED', 'OPERATIONS_ISSUE_UPDATED', 'OPERATIONS_ISSUE_RESOLVED',
      'OPERATIONAL_SERVICE_UPDATED', 'OPERATIONAL_CHANGE_ESCALATED',
      'EMERGENCY_SPEND_REQUESTED', 'EMERGENCY_SPEND_APPROVED', 'EMERGENCY_SPEND_REJECTED',
    ]) expect(rules).toContain(action);
  });
});
