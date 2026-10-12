import { getAdminDb } from '../firebaseAdmin.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';
import type { Booking, BookingAccommodation } from '../../src/types/booking.js';
import type { AuditLog, LowMarginApprovalDecision, Quote, UserRole } from '../../src/types/index.js';
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
import {
  FirestoreConversionStorageProvider,
  type ConversionStorageProvider,
} from '../../src/services/conversion/conversionStorageProvider.js';
import { isTripCostingFresh } from '../../src/utils/costingFreshness.js';

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

export interface QuoteApprovalDecisionService {
  decideQuote(
    quoteId: string,
    input: ApprovalInboxDecisionInput,
    actor: ApprovalInboxActor,
  ): Promise<Quote>;
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

function quoteSourceVersion(quote: Quote): string {
  return `${quote.version || 1}:${quote.updatedAt || quote.createdAt}`;
}

function quoteCanBeDecidedBy(quote: Quote, actor: ApprovalInboxActor): boolean {
  if (!['REVIEW_REQUIRED', 'PENDING'].includes(String(quote.approval?.state))) return false;
  if (actor.role === 'Founder' || actor.role === 'Admin') return true;
  return actor.role === 'Sales Manager'
    && Boolean(actor.salesTeamId)
    && Boolean(quote.salesTeamId)
    && actor.salesTeamId === quote.salesTeamId;
}

function sortNewest(items: ApprovalInboxItem[]) {
  return items.sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
}

export class ApprovalInboxService {
  constructor(
    private readonly storage: ApprovalInboxStorage = new FirestoreApprovalInboxStorage(),
    private readonly emergencySpendDecisions: EmergencySpendDecisionService = new LiveOperationsService(),
    private readonly quoteApprovalDecisions: QuoteApprovalDecisionService = new LowMarginQuoteApprovalService(),
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
      const currentDecision = quote.approval?.currentDecision;
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
        sourceVersion: quoteSourceVersion(quote),
        actionable: quoteCanBeDecidedBy(quote, actor),
        route: { section: 'quotes', entityId: quote.id },
        context: {
          ...(quote.tripId ? { tripId: quote.tripId } : {}),
          customerName: quote.customerName,
          ...(quote.salesEmployeeName ? { salespersonName: quote.salesEmployeeName } : {}),
          ...(Number.isFinite(quote.totalSupplierCost) ? { supplierCost: quote.totalSupplierCost } : {}),
          ...(Number.isFinite(quote.finalAmount) ? { sellingPrice: quote.finalAmount } : {}),
          ...(Number.isFinite(quote.grossProfit) ? { profit: quote.grossProfit } : {}),
          ...(Number.isFinite(quote.grossMargin) ? { marginPercent: quote.grossMargin } : {}),
          ...(Number.isFinite(quote.approval?.thresholdPercent) ? { thresholdPercent: quote.approval!.thresholdPercent } : {}),
          ...(quote.internalNotes || quote.notes ? { salesNote: quote.internalNotes || quote.notes } : {}),
          ...(currentDecision?.reviewerName ? { decidedByName: currentDecision.reviewerName } : {}),
          ...(currentDecision?.note ? { decisionNote: currentDecision.note } : {}),
        },
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
    if (itemIdValue.startsWith('QUOTE_APPROVAL:')) {
      const sourceId = itemIdValue.slice('QUOTE_APPROVAL:'.length);
      if (!sourceId) throw new ApprovalInboxError(400, 'INVALID_APPROVAL_ITEM', 'A valid Inbox item id is required.');
      const quote = await this.quoteApprovalDecisions.decideQuote(sourceId, input, actor);
      return {
        id: quote.id,
        version: quote.version,
        updatedAt: quote.updatedAt,
        approval: quote.approval,
      };
    }
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

function requireDecisionInput(input: ApprovalInboxDecisionInput): {
  decision: 'APPROVED' | 'REJECTED'; expectedSourceVersion: string; note?: string;
} {
  if (!input || typeof input !== 'object' || !['APPROVED', 'REJECTED'].includes(input.decision)) {
    throw new ApprovalInboxError(400, 'INVALID_APPROVAL_DECISION', 'decision must be APPROVED or REJECTED.');
  }
  const allowedFields = new Set(['decision', 'expectedUpdatedAt', 'rejectionReason', 'decisionNote']);
  const unknownField = Object.keys(input).find(field => !allowedFields.has(field));
  if (unknownField) {
    throw new ApprovalInboxError(400, 'INVALID_APPROVAL_DECISION', `Unsupported approval decision field: ${unknownField}.`);
  }
  if (typeof input.expectedUpdatedAt !== 'string' || !input.expectedUpdatedAt.trim()) {
    throw new ApprovalInboxError(400, 'INVALID_APPROVAL_DECISION', 'The reviewed approval version is required.');
  }
  const rawNote = input.decisionNote ?? input.rejectionReason;
  if (rawNote !== undefined && typeof rawNote !== 'string') {
    throw new ApprovalInboxError(400, 'INVALID_APPROVAL_DECISION', 'Decision note must be a string.');
  }
  const note = rawNote?.trim();
  if (note && note.length > 1000) {
    throw new ApprovalInboxError(400, 'INVALID_APPROVAL_DECISION', 'Decision note must not exceed 1000 characters.');
  }
  return { decision: input.decision, expectedSourceVersion: input.expectedUpdatedAt.trim(), ...(note ? { note } : {}) };
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApprovalInboxError(409, 'QUOTE_APPROVAL_CONTEXT_INCOMPLETE', `${field} is missing from the current commercial review.`);
  }
  return value;
}

function sameNumber(left: unknown, right: unknown): boolean {
  return typeof left === 'number' && typeof right === 'number' && Number.isFinite(left) && left === right;
}

/** Narrow authoritative decision workflow for the existing low-margin Quote item. */
export class LowMarginQuoteApprovalService implements QuoteApprovalDecisionService {
  constructor(
    private readonly storage: ConversionStorageProvider = new FirestoreConversionStorageProvider(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async decideQuote(quoteId: string, rawInput: ApprovalInboxDecisionInput, actor: ApprovalInboxActor): Promise<Quote> {
    if (!['Founder', 'Admin', 'Sales Manager'].includes(actor.role)) {
      throw new ApprovalInboxError(403, 'QUOTE_APPROVAL_DENIED', 'This role cannot decide low-margin Quote approvals.');
    }
    const input = requireDecisionInput(rawInput);
    return this.storage.runTransaction(async tx => {
      const quote = await tx.get('quotes', quoteId) as Quote | null;
      if (!quote) throw new ApprovalInboxError(404, 'QUOTE_APPROVAL_NOT_FOUND', 'The Quote approval no longer exists.');
      if (actor.role === 'Sales Manager') {
        if (!actor.salesTeamId || !quote.salesTeamId || actor.salesTeamId !== quote.salesTeamId) {
          throw new ApprovalInboxError(403, 'QUOTE_APPROVAL_SCOPE_DENIED', 'Sales Managers may decide low-margin Quotes for their own team only.');
        }
      }
      if (quote.approval?.required !== true) {
        throw new ApprovalInboxError(409, 'QUOTE_APPROVAL_NOT_REQUIRED', 'The current Quote economics no longer require approval. Reload the approval inbox.');
      }
      if (!['REVIEW_REQUIRED', 'PENDING'].includes(String(quote.approval.state))) {
        throw new ApprovalInboxError(409, 'QUOTE_APPROVAL_ALREADY_DECIDED', 'This commercial review has already been decided or superseded.');
      }
      if (quoteSourceVersion(quote) !== input.expectedSourceVersion) {
        throw new ApprovalInboxError(409, 'QUOTE_APPROVAL_CONFLICT', 'Quote economics changed after this review was opened. Reload current economics before deciding.');
      }

      const supplierCost = requiredNumber(quote.totalSupplierCost, 'Supplier cost');
      const sellingPrice = requiredNumber(quote.finalAmount, 'Selling price');
      const profit = requiredNumber(quote.grossProfit, 'Profit');
      const margin = requiredNumber(quote.grossMargin, 'Margin');
      const threshold = requiredNumber(quote.approval.thresholdPercent, 'Configured margin threshold');
      if (margin >= threshold) {
        throw new ApprovalInboxError(409, 'QUOTE_APPROVAL_NOT_REQUIRED', 'The current Quote margin no longer requires approval. Reload the approval inbox.');
      }
      let trip: Record<string, any> | null = null;
      const sourceRevision = quote.supplierCostSource?.costingRevision;
      if (quote.tripId) {
        trip = await tx.get('trips', quote.tripId);
        const tripRevision = Number(trip?.costingRevision || 0);
        if (
          !trip || !isTripCostingFresh(trip) || sourceRevision === undefined || sourceRevision !== tripRevision
          || !sameNumber(trip.totalSupplierCost, supplierCost)
          || !sameNumber(trip.totalSellingPrice, sellingPrice)
          || !sameNumber(trip.grossProfit, profit)
          || !sameNumber(trip.grossMargin, margin)
          || trip.commercialApproval?.required !== true
          || !sameNumber(trip.commercialApproval?.thresholdPercent, threshold)
        ) {
          throw new ApprovalInboxError(409, 'QUOTE_APPROVAL_CONFLICT', 'Trip or Quote economics changed after this review was opened. Reload current economics before deciding.');
        }
      }

      const now = this.clock().toISOString();
      const decision: LowMarginApprovalDecision = {
        decision: input.decision,
        quoteVersion: quote.version || 1,
        ...(sourceRevision !== undefined ? { costingRevision: sourceRevision } : {}),
        totalSupplierCost: supplierCost,
        totalSellingPrice: sellingPrice,
        grossProfit: profit,
        grossMargin: margin,
        thresholdPercent: threshold,
        reviewerEmployeeId: actor.employeeId,
        reviewerName: actor.name,
        decidedAt: now,
        ...(input.note ? { note: input.note } : {}),
      };
      const history = [...(quote.approval.history || []), decision];
      const approval = {
        ...quote.approval,
        state: input.decision,
        currentDecision: decision,
        history,
      };
      const updated: Quote = {
        ...quote,
        approval,
        version: (quote.version || 1) + 1,
        updatedAt: now,
        updatedByEmployeeId: actor.employeeId,
      };
      tx.update('quotes', quoteId, updated);

      if (trip) {
        tx.update('trips', quote.tripId!, {
          commercialApproval: {
            ...trip.commercialApproval,
            state: input.decision,
            currentDecision: decision,
            history: [...(trip.commercialApproval?.history || []), decision],
          },
          updatedAt: now,
          updatedByEmployeeId: actor.employeeId,
        });
      }

      const audit: AuditLog = {
        id: `audit-low-margin-${quoteId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: now,
        actorType: 'HUMAN',
        actorId: actor.employeeId,
        actorName: `${actor.name} (${actor.role})`,
        action: input.decision === 'APPROVED' ? 'LOW_MARGIN_APPROVED' : 'LOW_MARGIN_REJECTED',
        entityType: 'QUOTE',
        entityId: quoteId,
        before: { tripId: quote.tripId, approval: quote.approval },
        after: { tripId: quote.tripId, quoteId, ...decision },
        reason: input.note || (input.decision === 'APPROVED' ? 'Low-margin commercial exception approved.' : 'Low-margin commercial exception rejected.'),
      };
      tx.set('audit_logs', audit.id, audit);
      return updated;
    });
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
        : actor.role === 'Sales Manager'
          ? actor.salesTeamId
            ? this.sources.quotes.filter((item) => item.salesTeamId === actor.salesTeamId)
            : []
        : actor.role === 'Sales Executive'
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
      : actor.role === 'Sales Manager'
        ? actor.salesTeamId
          ? [db.collection('quotes').where('salesTeamId', '==', actor.salesTeamId).limit(100)]
          : []
      : actor.role === 'Sales Executive'
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
