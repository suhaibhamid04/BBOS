import { getAdminDb } from '../firebaseAdmin.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';
import type { Booking, BookingAccommodation } from '../../src/types/booking.js';
import type { Quote, UserRole } from '../../src/types/index.js';
import type {
  ApprovalInboxDecisionInput,
  ApprovalInboxItem,
  ApprovalInboxResponse,
} from '../../src/types/approvalInbox.js';
import type { EmergencySpendRequest, OperationalChangeRequest } from '../../src/types/liveOperations.js';
import {
  LiveOperationsService,
  type LiveOperationsActor,
} from './liveOperationsService.js';

export interface ApprovalInboxSources {
  bookings: Booking[];
  emergencySpends: EmergencySpendRequest[];
  supplierRateDiscrepancies: BookingAccommodation[];
  operationalChanges: OperationalChangeRequest[];
  quotes: Quote[];
}

export interface ApprovalInboxStorage {
  listSources(actor: ApprovalInboxActor): Promise<ApprovalInboxSources>;
}

export interface EmergencySpendDecisionService {
  decideSpend(
    requestId: string,
    input: ApprovalInboxDecisionInput,
    actor: LiveOperationsActor,
  ): Promise<EmergencySpendRequest>;
}

export interface ApprovalInboxActor extends AuthorizationPrincipal {
  role: UserRole | string;
  name: string;
}

export class ApprovalInboxError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ApprovalInboxError';
  }
}

const ALLOWED_ROLES: readonly UserRole[] = [
  'Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Reservations', 'Operations',
];

function clone<T>(value: T): T { return structuredClone(value); }

function assertActor(actor: ApprovalInboxActor): asserts actor is ApprovalInboxActor & { role: UserRole } {
  if (!actor.active || !actor.employeeId || !ALLOWED_ROLES.includes(actor.role as UserRole)) {
    throw new ApprovalInboxError(403, 'APPROVAL_INBOX_DENIED', 'Approval Inbox access denied.');
  }
}

function itemId(type: ApprovalInboxItem['type'], sourceId: string) {
  return `${type}:${sourceId}`;
}

function statusFromQuote(quote: Quote): ApprovalInboxItem['status'] {
  if (quote.approval?.state === 'APPROVED') return 'APPROVED';
  if (quote.approval?.state === 'REJECTED') return 'REJECTED';
  return 'REVIEW_REQUIRED';
}

function sortNewest(items: ApprovalInboxItem[]) {
  return items.sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
}

export class ApprovalInboxService {
  constructor(
    private readonly storage: ApprovalInboxStorage = new FirestoreApprovalInboxStorage(),
    private readonly emergencySpendDecisions: EmergencySpendDecisionService = new LiveOperationsService(),
  ) {}

  async getInbox(actor: ApprovalInboxActor): Promise<ApprovalInboxResponse> {
    assertActor(actor);
    const sources = await this.storage.listSources(actor);
    const bookings = new Map(sources.bookings.map((booking) => [booking.id, booking]));
    const items: ApprovalInboxItem[] = [];

    for (const spend of sources.emergencySpends) {
      const booking = bookings.get(spend.bookingId);
      if (!booking) continue;
      const status = spend.status === 'REQUESTED' ? 'PENDING' : spend.status;
      const canDecide = spend.status === 'REQUESTED'
        && ['Founder', 'Admin', 'Accounts'].includes(actor.role)
        && spend.requestedByEmployeeId !== actor.employeeId;
      items.push({
        id: itemId('EMERGENCY_SPEND', spend.id),
        type: 'EMERGENCY_SPEND',
        sourceEntityType: 'EMERGENCY_SPEND_REQUEST',
        sourceEntityId: spend.id,
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        title: spend.purpose,
        summary: `${booking.bookingReference} · ${spend.reason}`,
        requestedByEmployeeId: spend.requestedByEmployeeId,
        requestedAt: spend.requestedAt,
        amountMinor: spend.amountMinor,
        currency: spend.currency,
        priority: spend.category === 'MEDICAL_LOGISTICS' ? 'CRITICAL' : 'HIGH',
        status,
        requiredApproverRoles: ['Founder', 'Admin', 'Accounts'],
        sourceVersion: spend.updatedAt,
        actionable: canDecide,
        route: { section: 'bookings', entityId: booking.id },
        context: {
          ...(booking.customerName ? { customerName: booking.customerName } : {}),
          reason: spend.reason,
        },
      });
    }

    for (const accommodation of sources.supplierRateDiscrepancies) {
      const discrepancy = accommodation.supplierConfirmation?.rateDiscrepancy;
      const booking = bookings.get(accommodation.bookingId);
      if (!booking || !discrepancy || accommodation.supplierConfirmation?.requiresCommercialApproval !== true) continue;
      items.push({
        id: itemId('SUPPLIER_RATE_DISCREPANCY', accommodation.id),
        type: 'SUPPLIER_RATE_DISCREPANCY',
        sourceEntityType: 'BOOKING_ACCOMMODATION',
        sourceEntityId: accommodation.id,
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        title: `Supplier rate discrepancy · ${accommodation.propertyName}`,
        summary: `${booking.bookingReference} · ${discrepancy.reason}`,
        requestedByEmployeeId: discrepancy.recordedByEmployeeId,
        requestedAt: discrepancy.recordedAt,
        currency: booking.currency,
        priority: 'HIGH',
        status: 'REVIEW_REQUIRED',
        requiredApproverRoles: ['Founder', 'Admin'],
        sourceVersion: accommodation.supplierConfirmation.updatedAt,
        actionable: false,
        route: { section: 'bookings', entityId: booking.id },
        context: {
          ...(booking.customerName ? { customerName: booking.customerName } : {}),
          serviceId: accommodation.id,
          serviceType: 'ACCOMMODATION',
          supplierId: accommodation.supplierId,
          propertyName: accommodation.propertyName,
          frozenSupplierUnitRate: discrepancy.frozenSupplierUnitRate,
          confirmedSupplierUnitRate: discrepancy.confirmedSupplierUnitRate,
          difference: discrepancy.difference,
          reason: discrepancy.reason,
        },
      });
    }

    for (const change of sources.operationalChanges) {
      const booking = bookings.get(change.bookingId);
      if (!booking) continue;
      items.push({
        id: itemId('OPERATIONAL_COMMERCIAL_CHANGE', change.id),
        type: 'OPERATIONAL_COMMERCIAL_CHANGE',
        sourceEntityType: 'OPERATIONAL_CHANGE_REQUEST',
        sourceEntityId: change.id,
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        title: `Operational change · ${change.changeType.replaceAll('_', ' ')}`,
        summary: `${booking.bookingReference} · ${change.description}`,
        requestedByEmployeeId: change.requestedByEmployeeId,
        requestedAt: change.requestedAt,
        priority: change.changeType === 'COMMERCIAL_COST' ? 'HIGH' : 'MEDIUM',
        status: 'REVIEW_REQUIRED',
        requiredApproverRoles: ['Founder', 'Admin'],
        sourceVersion: change.updatedAt,
        actionable: false,
        route: { section: 'bookings', entityId: booking.id },
        context: {
          ...(booking.customerName ? { customerName: booking.customerName } : {}),
          ...(change.linkedService ? {
            serviceId: change.linkedService.serviceId,
            serviceType: change.linkedService.type,
          } : {}),
          changeType: change.changeType,
          reason: change.description,
        },
      });
    }

    for (const quote of sources.quotes) {
      if (quote.approval?.required !== true) continue;
      const requester = quote.createdByEmployeeId || quote.salesEmployeeId;
      if (!requester) continue;
      const requestedAt = quote.updatedAt || quote.createdAt;
      items.push({
        id: itemId('QUOTE_APPROVAL', quote.id),
        type: 'QUOTE_APPROVAL',
        sourceEntityType: 'QUOTE',
        sourceEntityId: quote.id,
        quoteId: quote.id,
        quoteReference: `Quote ${quote.id}`,
        title: `Quote approval · ${quote.customerName}`,
        summary: `${quote.destination} · ${quote.travelerCount} traveller${quote.travelerCount === 1 ? '' : 's'}`,
        requestedByEmployeeId: requester,
        requestedAt,
        priority: 'MEDIUM',
        status: statusFromQuote(quote),
        requiredApproverRoles: ['Founder', 'Admin', 'Sales Manager'],
        sourceVersion: `${quote.version}:${requestedAt}`,
        actionable: false,
        route: { section: 'quotes', entityId: quote.id },
        context: {},
      });
    }

    sortNewest(items);
    const pending = items.filter((item) => item.status === 'PENDING' || item.status === 'REVIEW_REQUIRED');
    const oldestPendingAt = pending.length
      ? pending.reduce((oldest, item) => item.requestedAt < oldest ? item.requestedAt : oldest, pending[0].requestedAt)
      : undefined;

    return {
      awaitingMyDecision: items.filter((item) => item.actionable),
      submittedByMe: items.filter((item) => item.requestedByEmployeeId === actor.employeeId),
      recentlyDecided: items.filter((item) => item.status === 'APPROVED' || item.status === 'REJECTED').slice(0, 25),
      ...(['Founder', 'Admin'].includes(actor.role) ? { allPending: pending } : {}),
      summary: {
        pendingCount: pending.length,
        ...(oldestPendingAt ? { oldestPendingAt } : {}),
        highPriorityCount: pending.filter((item) => item.priority === 'HIGH' || item.priority === 'CRITICAL').length,
      },
    };
  }

  async decide(itemIdValue: string, input: ApprovalInboxDecisionInput, actor: ApprovalInboxActor) {
    assertActor(actor);
    if (!itemIdValue.startsWith('EMERGENCY_SPEND:')) {
      throw new ApprovalInboxError(422, 'APPROVAL_ITEM_NOT_ACTIONABLE', 'This Inbox item is review-only; no safe domain decision workflow exists yet.');
    }
    if (!['Founder', 'Admin', 'Accounts'].includes(actor.role)) {
      throw new ApprovalInboxError(403, 'APPROVAL_DECISION_DENIED', 'This role cannot decide emergency spend requests.');
    }
    const sourceId = itemIdValue.slice('EMERGENCY_SPEND:'.length);
    if (!sourceId) throw new ApprovalInboxError(400, 'INVALID_APPROVAL_ITEM', 'A valid Inbox item id is required.');
    return this.emergencySpendDecisions.decideSpend(sourceId, input, actor as LiveOperationsActor);
  }
}

export class InMemoryApprovalInboxStorage implements ApprovalInboxStorage {
  constructor(private readonly sources: ApprovalInboxSources) {}

  async listSources(actor: ApprovalInboxActor): Promise<ApprovalInboxSources> {
    assertActor(actor);
    const companyWide = actor.role === 'Founder' || actor.role === 'Admin';
    return clone({
      bookings: this.sources.bookings,
      emergencySpends: companyWide || actor.role === 'Accounts'
        ? this.sources.emergencySpends
        : actor.role === 'Operations'
          ? this.sources.emergencySpends.filter((item) => item.requestedByEmployeeId === actor.employeeId)
          : [],
      supplierRateDiscrepancies: companyWide
        ? this.sources.supplierRateDiscrepancies
        : actor.role === 'Reservations'
          ? this.sources.supplierRateDiscrepancies.filter((item) => item.supplierConfirmation?.rateDiscrepancy?.recordedByEmployeeId === actor.employeeId)
          : [],
      operationalChanges: companyWide
        ? this.sources.operationalChanges
        : actor.role === 'Operations'
          ? this.sources.operationalChanges.filter((item) => item.requestedByEmployeeId === actor.employeeId)
          : [],
      quotes: companyWide
        ? this.sources.quotes
        : actor.role === 'Sales Manager' || actor.role === 'Sales Executive'
          ? this.sources.quotes.filter((item) => (item.createdByEmployeeId || item.salesEmployeeId) === actor.employeeId)
          : [],
    });
  }
}

export class FirestoreApprovalInboxStorage implements ApprovalInboxStorage {
  private db() { return getAdminDb(); }

  async listSources(actor: ApprovalInboxActor): Promise<ApprovalInboxSources> {
    assertActor(actor);
    const db = this.db();
    const companyWide = actor.role === 'Founder' || actor.role === 'Admin';

    const spendQuery = companyWide || actor.role === 'Accounts'
      ? db.collection('emergency_spend_requests').limit(100)
      : actor.role === 'Operations'
        ? db.collection('emergency_spend_requests').where('requestedByEmployeeId', '==', actor.employeeId).limit(100)
        : null;
    const discrepancyQuery = companyWide
      ? db.collection('booking_accommodations').where('supplierConfirmation.requiresCommercialApproval', '==', true).limit(100)
      : actor.role === 'Reservations'
        ? db.collection('booking_accommodations').where('supplierConfirmation.rateDiscrepancy.recordedByEmployeeId', '==', actor.employeeId).limit(100)
        : null;
    const changeQuery = companyWide
      ? db.collection('operational_change_requests').limit(100)
      : actor.role === 'Operations'
        ? db.collection('operational_change_requests').where('requestedByEmployeeId', '==', actor.employeeId).limit(100)
        : null;
    const quoteQueries = companyWide
      ? [db.collection('quotes').where('approval.required', '==', true).limit(100)]
      : actor.role === 'Sales Manager' || actor.role === 'Sales Executive'
        ? [
            db.collection('quotes').where('salesEmployeeId', '==', actor.employeeId).limit(100),
            db.collection('quotes').where('createdByEmployeeId', '==', actor.employeeId).limit(100),
          ]
        : [];

    const [spendSnapshot, discrepancySnapshot, changeSnapshot, quoteSnapshots] = await Promise.all([
      spendQuery?.get(),
      discrepancyQuery?.get(),
      changeQuery?.get(),
      Promise.all(quoteQueries.map((query) => query.get())),
    ]);
    const emergencySpends = spendSnapshot?.docs.map((document) => ({ ...document.data(), id: document.id } as EmergencySpendRequest)) || [];
    const supplierRateDiscrepancies = discrepancySnapshot?.docs.map((document) => ({ ...document.data(), id: document.id } as BookingAccommodation)) || [];
    const operationalChanges = changeSnapshot?.docs.map((document) => ({ ...document.data(), id: document.id } as OperationalChangeRequest)) || [];
    const quoteMap = new Map<string, Quote>();
    for (const snapshot of quoteSnapshots) {
      for (const document of snapshot.docs) {
        const quote = { ...document.data(), id: document.id } as Quote;
        if (quote.approval?.required === true) quoteMap.set(quote.id, quote);
      }
    }

    const bookingIds = new Set<string>();
    for (const record of emergencySpends) bookingIds.add(record.bookingId);
    for (const record of supplierRateDiscrepancies) bookingIds.add(record.bookingId);
    for (const record of operationalChanges) bookingIds.add(record.bookingId);
    const bookingDocuments = bookingIds.size
      ? await db.getAll(...[...bookingIds].map((id) => db.collection('bookings').doc(id)))
      : [];
    const bookings = bookingDocuments
      .filter((document) => document.exists)
      .map((document) => ({ ...document.data(), id: document.id } as Booking));

    return {
      bookings,
      emergencySpends,
      supplierRateDiscrepancies,
      operationalChanges,
      quotes: [...quoteMap.values()],
    };
  }
}
