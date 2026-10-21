import { createHash, randomUUID } from 'node:crypto';
import type { AuditLog, UserRole } from '../../src/types/index.js';
import type {
  Booking,
  BookingAccommodation,
  BookingActivity,
  BookingTransport,
  FinancialSnapshot,
  LineItemCostSnapshot,
} from '../../src/types/booking.js';
import type { PaymentRecord } from '../../src/types/payment.js';
import type { SupplierPaymentRecord } from '../../src/types/supplierPayable.js';
import type {
  AmendmentServiceChange,
  BookingAmendment,
  CommissionLedgerEntry,
  CommissionSummary,
  CommercialExceptionSnapshot,
  CommercialServiceSnapshot,
  RefundCalculation,
  RefundDeduction,
  RefundLedgerEntry,
  RefundRequest,
  SupplierSubstitution,
} from '../../src/types/financialExceptions.js';
import {
  FirestoreConversionStorageProvider,
  type ConversionStorageProvider,
  type ConversionTransaction,
} from '../../src/services/conversion/conversionStorageProvider.js';

const DEFAULT_COMMISSION_AMOUNT = 500;
const ACTIVE_BOOKING_STATUSES: Booking['status'][] = ['CONFIRMED', 'IN_OPERATIONS', 'TRAVELLING'];

export interface FinancialExceptionActor {
  employeeId: string;
  name: string;
  role: UserRole;
  active: boolean;
  salesTeamId?: string;
}

export class FinancialExceptionError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
    this.name = 'FinancialExceptionError';
  }
}

type AmendmentInput = {
  reason?: unknown;
  proposedSellingPrice?: unknown;
  travelStartDate?: unknown;
  travelEndDate?: unknown;
  guestCount?: unknown;
  serviceChanges?: unknown;
};

type RefundCalculationInput = {
  reason?: unknown;
  supplierCancellationCharges?: unknown;
  nonRefundableSupplierPaymentIds?: unknown;
  recoverableSupplierAmounts?: unknown;
};

type MoneyEvidence = { amount: number; sourceReference: string; reason: string };

const clone = <T>(value: T): T => structuredClone(value);

function nowIso(clock: () => Date): string {
  return clock().toISOString();
}

function requireActor(actor: FinancialExceptionActor): void {
  if (actor.active !== true || !actor.employeeId?.trim()) {
    throw new FinancialExceptionError(403, 'FINANCIAL_EXCEPTION_ACTOR_INVALID', 'An active canonical employee identity is required.');
  }
}

function text(value: unknown, field: string, min = 1, max = 2000): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', `${field} must be ${min}-${max} characters.`);
  }
  return value.trim();
}

function isoDate(value: unknown, field: string): string {
  const result = text(value, field, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00.000Z`))) {
    throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', `${field} must be a valid ISO calendar date.`);
  }
  return result;
}

function amount(value: unknown, field: string, allowZero = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', `${field} must be a finite ${allowZero ? 'non-negative' : 'positive'} amount.`);
  }
  const rounded = Math.round(value * 100) / 100;
  if (!Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value - rounded) > 1e-8) {
    throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', `${field} must have at most two decimal places.`);
  }
  return rounded;
}

function signedAmount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
    throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', `${field} must be a finite non-zero amount.`);
  }
  const rounded = Math.round(value * 100) / 100;
  if (!Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value - rounded) > 1e-8) {
    throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', `${field} must have at most two decimal places.`);
  }
  return rounded;
}

function integer(value: unknown, field: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', `${field} must be an integer of at least ${minimum}.`);
  }
  return Number(value);
}

function assertAllowedFields(input: unknown, allowed: string[]): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', 'A JSON object is required.');
  }
  const unexpected = Object.keys(input).find(key => !allowed.includes(key));
  if (unexpected) {
    throw new FinancialExceptionError(400, 'AUTHORITATIVE_FIELD_REJECTED', `Unsupported or authoritative field: ${unexpected}.`);
  }
}

function audit(
  action: string,
  entityType: string,
  entityId: string,
  actor: FinancialExceptionActor,
  at: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  reason: string,
): AuditLog {
  return {
    id: `audit-a01-${randomUUID()}`,
    timestamp: at,
    actorType: 'HUMAN',
    actorId: actor.employeeId,
    actorName: `${actor.name} (${actor.role})`,
    action,
    entityType,
    entityId,
    before,
    after,
    reason,
  };
}

function assertBookingScope(booking: Booking, actor: FinancialExceptionActor, mode: 'SALES' | 'RESERVATIONS' | 'FINANCIAL' | 'READ'): void {
  requireActor(actor);
  if (actor.role === 'Founder' || actor.role === 'Admin') return;
  if (mode === 'FINANCIAL' && actor.role === 'Accounts') return;
  if ((mode === 'SALES' || mode === 'READ') && actor.role === 'Sales Executive' && booking.assignedSalesEmployeeId === actor.employeeId) return;
  if ((mode === 'SALES' || mode === 'READ') && actor.role === 'Sales Manager' && actor.salesTeamId && booking.salesTeamId === actor.salesTeamId) return;
  if ((mode === 'RESERVATIONS' || mode === 'READ') && actor.role === 'Reservations' && booking.assignedReservationsEmployeeId === actor.employeeId) return;
  if (mode === 'READ' && actor.role === 'Accounts') return;
  throw new FinancialExceptionError(403, 'FINANCIAL_EXCEPTION_SCOPE_DENIED', 'The actor is outside the authoritative Booking scope.');
}

function serviceCollection(type: CommercialServiceSnapshot['serviceType']): string {
  if (type === 'ACCOMMODATION') return 'booking_accommodations';
  if (type === 'TRANSPORT') return 'booking_transports';
  if (type === 'ACTIVITY') return 'booking_activities';
  throw new FinancialExceptionError(422, 'UNSUPPORTED_SERVICE_TYPE', 'Only accommodation, transport and activity services can be changed.');
}

function sourceServiceSnapshot(line: LineItemCostSnapshot, services: Array<BookingAccommodation | BookingTransport | BookingActivity>): CommercialServiceSnapshot {
  const service = services.find(candidate => candidate.id === line.serviceId || candidate.sourceQuoteServiceId === line.serviceId);
  const categoryId = line.serviceType === 'ACCOMMODATION'
    ? (service as BookingAccommodation | undefined)?.roomCategoryId
    : line.serviceType === 'TRANSPORT'
      ? (service as BookingTransport | undefined)?.vehicleCategoryId
      : undefined;
  const label = line.serviceType === 'ACCOMMODATION'
    ? (service as BookingAccommodation | undefined)?.propertyName
    : line.serviceType === 'TRANSPORT'
      ? (service as BookingTransport | undefined)?.vehicleCategoryName
      : (service as BookingActivity | undefined)?.activityName;
  return {
    serviceType: line.serviceType,
    serviceId: service?.id || line.serviceId,
    inventoryMasterId: line.inventoryMasterId,
    supplierId: line.supplierId,
    ...(categoryId ? { categoryId } : {}),
    label: label || line.supplierName || line.inventoryMasterId,
    supplierCost: line.frozenTotalSupplierCost,
  };
}

function guestCount(services: Array<BookingAccommodation | BookingTransport | BookingActivity>): number {
  let result = 1;
  for (const service of services) {
    if ('adultsCount' in service) result = Math.max(result, service.adultsCount + service.childrenCount);
    if ('passengerCount' in service) result = Math.max(result, service.passengerCount);
    if ('participantCount' in service) result = Math.max(result, service.participantCount);
  }
  return result;
}

function originalCommercialSnapshot(
  booking: Booking,
  snapshot: FinancialSnapshot,
  services: Array<BookingAccommodation | BookingTransport | BookingActivity>,
): CommercialExceptionSnapshot {
  return {
    currency: snapshot.currency || booking.currency || 'INR',
    supplierCost: snapshot.totalSupplierCost,
    sellingPrice: snapshot.totalSellingPrice,
    profit: snapshot.grossProfit,
    margin: snapshot.grossMargin,
    travelStartDate: booking.travelStartDate,
    travelEndDate: booking.travelEndDate,
    guestCount: guestCount(services),
    selectedServices: snapshot.lineItems.map(line => sourceServiceSnapshot(line, services)),
  };
}

function recalculate(base: CommercialExceptionSnapshot, sellingPrice: number): CommercialExceptionSnapshot {
  const profit = Math.round((sellingPrice - base.supplierCost) * 100) / 100;
  const margin = sellingPrice > 0 ? Math.round((profit / sellingPrice) * 10_000) / 100 : 0;
  return { ...clone(base), sellingPrice, profit, margin };
}

function snapshotDelta(before: CommercialExceptionSnapshot, after: CommercialExceptionSnapshot) {
  const prior = new Map(before.selectedServices.map(item => [item.serviceId, JSON.stringify(item)]));
  return {
    supplierCost: Math.round((after.supplierCost - before.supplierCost) * 100) / 100,
    sellingPrice: Math.round((after.sellingPrice - before.sellingPrice) * 100) / 100,
    profit: Math.round((after.profit - before.profit) * 100) / 100,
    margin: Math.round((after.margin - before.margin) * 100) / 100,
    guestCount: after.guestCount - before.guestCount,
    travelStartDateChanged: after.travelStartDate !== before.travelStartDate,
    travelEndDateChanged: after.travelEndDate !== before.travelEndDate,
    changedServiceIds: after.selectedServices.filter(item => prior.get(item.serviceId) !== JSON.stringify(item)).map(item => item.serviceId),
  };
}

function latestApplied(amendments: BookingAmendment[]): BookingAmendment | undefined {
  return amendments.filter(item => item.status === 'APPLIED').sort((a, b) => b.version - a.version)[0];
}

function moneyEvidence(value: unknown, field: string): MoneyEvidence[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', `${field} must be an array.`);
  return value.map((raw, index) => {
    assertAllowedFields(raw, ['amount', 'sourceReference', 'reason']);
    return {
      amount: amount(raw.amount, `${field}[${index}].amount`),
      sourceReference: text(raw.sourceReference, `${field}[${index}].sourceReference`, 1, 200),
      reason: text(raw.reason, `${field}[${index}].reason`, 3, 500),
    };
  });
}

function commissionSummary(employeeId: string, entries: CommissionLedgerEntry[]): CommissionSummary {
  const earned = entries.filter(item => item.type === 'EARNED').reduce((sum, item) => sum + item.amount, 0);
  const reversed = entries.filter(item => item.type === 'REVERSAL').reduce((sum, item) => sum + item.amount, 0);
  const adjusted = entries.filter(item => item.type === 'ADJUSTMENT').reduce((sum, item) => sum + item.amount, 0);
  const settled = entries.filter(item => item.type === 'SETTLED').reduce((sum, item) => sum + item.amount, 0);
  const payable = Math.round((earned - reversed + adjusted) * 100) / 100;
  return { employeeId, earned, reversed, adjusted, payable, settled, outstanding: Math.round((payable - settled) * 100) / 100, entries };
}

export class FinancialExceptionService {
  constructor(
    private readonly storage: ConversionStorageProvider = new FirestoreConversionStorageProvider(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async proposeAmendment(bookingId: string, rawInput: AmendmentInput, actor: FinancialExceptionActor): Promise<BookingAmendment> {
    assertAllowedFields(rawInput, ['reason', 'proposedSellingPrice', 'travelStartDate', 'travelEndDate', 'guestCount', 'serviceChanges']);
    const reason = text(rawInput.reason, 'reason', 5, 1000);
    const frozen = await this.storage.getFinancialSnapshot(bookingId);
    if (!frozen) throw new FinancialExceptionError(409, 'ORIGINAL_FINANCIAL_SNAPSHOT_MISSING', 'The immutable confirmation snapshot is required.');

    return this.storage.runTransaction(async tx => {
      const booking = await tx.get('bookings', bookingId) as Booking | null;
      if (!booking) throw new FinancialExceptionError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      assertBookingScope(booking, actor, 'SALES');
      if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
        throw new FinancialExceptionError(422, 'AMENDMENT_NOT_POST_CONFIRMATION', 'Only confirmed active bookings can be amended.');
      }
      const authoritativeFrozen = await tx.get(`bookings/${bookingId}/financial_snapshot`, frozen.id) as FinancialSnapshot | null;
      if (!authoritativeFrozen) throw new FinancialExceptionError(409, 'ORIGINAL_FINANCIAL_SNAPSHOT_MISSING', 'The immutable confirmation snapshot changed or is missing.');
      const [accommodations, transports, activities, amendments] = await Promise.all([
        tx.findByField('booking_accommodations', 'bookingId', bookingId, 200),
        tx.findByField('booking_transports', 'bookingId', bookingId, 200),
        tx.findByField('booking_activities', 'bookingId', bookingId, 200),
        tx.findByField('booking_amendments', 'bookingId', bookingId, 200),
      ]);
      const services = [...accommodations, ...transports, ...activities] as Array<BookingAccommodation | BookingTransport | BookingActivity>;
      const prior = latestApplied(amendments as BookingAmendment[]);
      const before = prior?.approved ? clone(prior.approved) : originalCommercialSnapshot(booking, authoritativeFrozen, services);
      let proposed = recalculate(before, rawInput.proposedSellingPrice === undefined
        ? before.sellingPrice
        : amount(rawInput.proposedSellingPrice, 'proposedSellingPrice'));
      if (rawInput.travelStartDate !== undefined) proposed.travelStartDate = isoDate(rawInput.travelStartDate, 'travelStartDate');
      if (rawInput.travelEndDate !== undefined) proposed.travelEndDate = isoDate(rawInput.travelEndDate, 'travelEndDate');
      if (proposed.travelEndDate < proposed.travelStartDate) {
        throw new FinancialExceptionError(400, 'INVALID_AMENDMENT_DATES', 'travelEndDate cannot precede travelStartDate.');
      }
      if (rawInput.guestCount !== undefined) proposed.guestCount = integer(rawInput.guestCount, 'guestCount');
      let serviceChanges: AmendmentServiceChange[] = [];
      if (rawInput.serviceChanges !== undefined) {
        if (!Array.isArray(rawInput.serviceChanges)) throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', 'serviceChanges must be an array.');
        serviceChanges = rawInput.serviceChanges.map((raw, index) => {
          assertAllowedFields(raw, ['serviceType', 'serviceId', 'customerFacingLabel']);
          if (!['ACCOMMODATION', 'TRANSPORT', 'ACTIVITY'].includes(String(raw.serviceType))) {
            throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', `serviceChanges[${index}].serviceType is invalid.`);
          }
          const serviceId = text(raw.serviceId, `serviceChanges[${index}].serviceId`, 1, 200);
          const selected = proposed.selectedServices.find(item => item.serviceId === serviceId && item.serviceType === raw.serviceType);
          if (!selected) throw new FinancialExceptionError(404, 'AMENDMENT_SERVICE_NOT_FOUND', `Service ${serviceId} is not in the authoritative snapshot.`);
          if (raw.customerFacingLabel !== undefined) selected.label = text(raw.customerFacingLabel, `serviceChanges[${index}].customerFacingLabel`, 1, 300);
          return { serviceType: raw.serviceType as AmendmentServiceChange['serviceType'], serviceId, ...(raw.customerFacingLabel ? { customerFacingLabel: String(raw.customerFacingLabel).trim() } : {}) };
        });
      }
      proposed = recalculate(proposed, proposed.sellingPrice);
      const version = amendments.reduce((max: number, item: BookingAmendment) => Math.max(max, item.version || 0), 0) + 1;
      const at = nowIso(this.clock);
      const amendment: BookingAmendment = {
        id: `amendment-${randomUUID()}`, bookingId, version, baseAppliedVersion: prior?.version || 0, status: 'PENDING_APPROVAL', reason,
        before, proposed, delta: snapshotDelta(before, proposed), serviceChanges,
        proposedByEmployeeId: actor.employeeId, proposedByRole: actor.role, proposedAt: at,
        createdAt: at, updatedAt: at,
      };
      tx.set('booking_amendments', amendment.id, amendment);
      const event = audit('AMENDMENT_REQUESTED', 'BOOKING_AMENDMENT', amendment.id, actor, at, null,
        { bookingId, version, status: amendment.status, before, proposed, delta: amendment.delta }, reason);
      tx.set('audit_logs', event.id, event);
      return amendment;
    });
  }

  async decideAmendment(amendmentId: string, decision: 'APPROVED' | 'REJECTED', note: unknown, actor: FinancialExceptionActor): Promise<BookingAmendment> {
    const decisionNote = text(note, decision === 'REJECTED' ? 'rejectionReason' : 'decisionNote', decision === 'REJECTED' ? 5 : 1, 1000);
    return this.storage.runTransaction(async tx => {
      const amendment = await tx.get('booking_amendments', amendmentId) as BookingAmendment | null;
      if (!amendment) throw new FinancialExceptionError(404, 'AMENDMENT_NOT_FOUND', 'Amendment not found.');
      const booking = await tx.get('bookings', amendment.bookingId) as Booking | null;
      if (!booking) throw new FinancialExceptionError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      requireActor(actor);
      if (!['Founder', 'Admin', 'Sales Manager'].includes(actor.role)) throw new FinancialExceptionError(403, 'AMENDMENT_APPROVAL_DENIED', 'Sales Manager or ALL scope approval is required.');
      if (actor.role === 'Sales Manager' && (!actor.salesTeamId || actor.salesTeamId !== booking.salesTeamId)) throw new FinancialExceptionError(403, 'AMENDMENT_APPROVAL_SCOPE_DENIED', 'Sales Managers may approve only their own team.');
      if (amendment.proposedByEmployeeId === actor.employeeId) throw new FinancialExceptionError(403, 'AMENDMENT_SELF_APPROVAL_DENIED', 'The amendment proposer cannot approve their own request.');
      if (amendment.status === decision) return amendment;
      if (amendment.status !== 'PENDING_APPROVAL') throw new FinancialExceptionError(409, 'AMENDMENT_ALREADY_DECIDED', 'The amendment is no longer pending approval.');
      const at = nowIso(this.clock);
      const updated: BookingAmendment = decision === 'APPROVED'
        ? { ...amendment, status: 'APPROVED', approved: clone(amendment.proposed), approvedByEmployeeId: actor.employeeId, approvedAt: at, updatedAt: at }
        : { ...amendment, status: 'REJECTED', rejectedByEmployeeId: actor.employeeId, rejectedAt: at, rejectionReason: decisionNote, updatedAt: at };
      tx.update('booking_amendments', amendmentId, updated);
      const event = audit(decision === 'APPROVED' ? 'AMENDMENT_APPROVED' : 'AMENDMENT_REJECTED', 'BOOKING_AMENDMENT', amendmentId, actor, at,
        { status: amendment.status }, { status: updated.status, ...(updated.approved ? { approved: updated.approved } : {}), note: decisionNote }, decisionNote);
      tx.set('audit_logs', event.id, event);
      return updated;
    });
  }

  async applyAmendment(amendmentId: string, actor: FinancialExceptionActor): Promise<{ amendment: BookingAmendment; booking: Booking; idempotent: boolean }> {
    return this.storage.runTransaction(async tx => {
      const amendment = await tx.get('booking_amendments', amendmentId) as BookingAmendment | null;
      if (!amendment) throw new FinancialExceptionError(404, 'AMENDMENT_NOT_FOUND', 'Amendment not found.');
      const booking = await tx.get('bookings', amendment.bookingId) as Booking | null;
      if (!booking) throw new FinancialExceptionError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      requireActor(actor);
      if (!['Founder', 'Admin', 'Sales Manager'].includes(actor.role)) throw new FinancialExceptionError(403, 'AMENDMENT_APPLY_DENIED', 'Only the approving commercial authority may apply an amendment.');
      if (actor.role === 'Sales Manager' && (!actor.salesTeamId || actor.salesTeamId !== booking.salesTeamId)) throw new FinancialExceptionError(403, 'AMENDMENT_APPROVAL_SCOPE_DENIED', 'Sales Managers may apply only their own team amendments.');
      if (amendment.status === 'APPLIED') return { amendment, booking, idempotent: true };
      if (amendment.status !== 'APPROVED' || !amendment.approved) throw new FinancialExceptionError(409, 'AMENDMENT_NOT_APPROVED', 'Approval and application are separate; this amendment is not approved.');
      const [accommodations, transports, activities, amendments] = await Promise.all([
        tx.findByField('booking_accommodations', 'bookingId', booking.id, 200),
        tx.findByField('booking_transports', 'bookingId', booking.id, 200),
        tx.findByField('booking_activities', 'bookingId', booking.id, 200),
        tx.findByField('booking_amendments', 'bookingId', booking.id, 200),
      ]);
      const currentAppliedVersion = latestApplied(amendments as BookingAmendment[])?.version || 0;
      if (currentAppliedVersion !== amendment.baseAppliedVersion) {
        throw new FinancialExceptionError(409, 'AMENDMENT_BASE_STALE', 'A newer commercial version was applied after this proposal. Create a new amendment from the current Booking state.');
      }
      const at = nowIso(this.clock);
      const approved = amendment.approved;
      const received = booking.amountReceived || 0;
      const bookingUpdate: Partial<Booking> = {
        travelStartDate: approved.travelStartDate, travelEndDate: approved.travelEndDate,
        totalSellingPrice: approved.sellingPrice, totalAmount: approved.sellingPrice,
        amountPending: Math.max(0, Math.round((approved.sellingPrice - received) * 100) / 100),
        isOverpaid: received > approved.sellingPrice,
        overpaidAmount: Math.max(0, Math.round((received - approved.sellingPrice) * 100) / 100),
        updatedAt: at,
      };
      const adults = Math.max(1, approved.guestCount);
      for (const item of accommodations as BookingAccommodation[]) {
        const label = amendment.serviceChanges.find(change => change.serviceType === 'ACCOMMODATION' && change.serviceId === item.id)?.customerFacingLabel;
        tx.update('booking_accommodations', item.id, { checkInDate: approved.travelStartDate, checkOutDate: approved.travelEndDate, adultsCount: adults, childrenCount: 0, ...(label ? { propertyName: label } : {}), updatedAt: at });
      }
      for (const item of transports as BookingTransport[]) {
        const label = amendment.serviceChanges.find(change => change.serviceType === 'TRANSPORT' && change.serviceId === item.id)?.customerFacingLabel;
        tx.update('booking_transports', item.id, { serviceDate: approved.travelStartDate, endDate: approved.travelEndDate, passengerCount: approved.guestCount, ...(label ? { vehicleCategoryName: label } : {}), updatedAt: at });
      }
      for (const item of activities as BookingActivity[]) {
        const label = amendment.serviceChanges.find(change => change.serviceType === 'ACTIVITY' && change.serviceId === item.id)?.customerFacingLabel;
        tx.update('booking_activities', item.id, { participantCount: approved.guestCount, ...(label ? { activityName: label } : {}), updatedAt: at });
      }
      tx.update('bookings', booking.id, bookingUpdate);
      const applied: BookingAmendment = { ...amendment, status: 'APPLIED', appliedByEmployeeId: actor.employeeId, appliedAt: at, updatedAt: at };
      tx.update('booking_amendments', amendment.id, applied);
      const event = audit('AMENDMENT_APPLIED', 'BOOKING_AMENDMENT', amendment.id, actor, at,
        { booking: { travelStartDate: booking.travelStartDate, travelEndDate: booking.travelEndDate, totalSellingPrice: booking.totalSellingPrice }, status: amendment.status },
        { booking: bookingUpdate, status: 'APPLIED', approved }, amendment.reason);
      tx.set('audit_logs', event.id, event);
      return { amendment: applied, booking: { ...booking, ...bookingUpdate }, idempotent: false };
    });
  }

  async proposeSubstitution(bookingId: string, rawInput: unknown, actor: FinancialExceptionActor): Promise<SupplierSubstitution> {
    assertAllowedFields(rawInput, ['serviceType', 'serviceId', 'ratePeriodId', 'reason']);
    const serviceType = String(rawInput.serviceType) as SupplierSubstitution['serviceType'];
    if (!['ACCOMMODATION', 'TRANSPORT', 'ACTIVITY'].includes(serviceType)) throw new FinancialExceptionError(400, 'INVALID_SUBSTITUTION_TYPE', 'serviceType is invalid.');
    const serviceId = text(rawInput.serviceId, 'serviceId', 1, 200);
    const ratePeriodId = text(rawInput.ratePeriodId, 'ratePeriodId', 1, 200);
    const reason = text(rawInput.reason, 'reason', 5, 1000);
    const frozen = await this.storage.getFinancialSnapshot(bookingId);
    if (!frozen) throw new FinancialExceptionError(409, 'ORIGINAL_FINANCIAL_SNAPSHOT_MISSING', 'The immutable confirmation snapshot is required.');

    return this.storage.runTransaction(async tx => {
      const booking = await tx.get('bookings', bookingId) as Booking | null;
      if (!booking) throw new FinancialExceptionError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      assertBookingScope(booking, actor, 'RESERVATIONS');
      if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) throw new FinancialExceptionError(422, 'SUBSTITUTION_BOOKING_STATE_INVALID', 'Substitution requires an active confirmed booking.');
      const authoritativeFrozen = await tx.get(`bookings/${bookingId}/financial_snapshot`, frozen.id) as FinancialSnapshot | null;
      const service = await tx.get(serviceCollection(serviceType), serviceId) as BookingAccommodation | BookingTransport | BookingActivity | null;
      if (!authoritativeFrozen || !service || service.bookingId !== bookingId) throw new FinancialExceptionError(404, 'SUBSTITUTION_SERVICE_NOT_FOUND', 'The authoritative service or snapshot was not found.');
      const sourceLine = authoritativeFrozen.lineItems.find(line => line.serviceId === serviceId || service.sourceQuoteServiceId === line.serviceId);
      if (!sourceLine) throw new FinancialExceptionError(409, 'SUBSTITUTION_FINANCIAL_LINE_MISSING', 'The service has no frozen financial line.');
      let replacement: CommercialServiceSnapshot;
      if (serviceType === 'ACCOMMODATION') {
        const rate = await tx.get('rate_periods', ratePeriodId) as any;
        if (!rate || rate.status === 'ARCHIVED') throw new FinancialExceptionError(404, 'SUBSTITUTION_RATE_NOT_FOUND', 'Replacement accommodation rate not found.');
        const [category, property] = await Promise.all([tx.get('room_categories', rate.roomCategoryId), tx.get('accommodation_properties', rate.propertyId)]);
        if (!category || !property || category.active === false || property.status !== 'ACTIVE') throw new FinancialExceptionError(422, 'SUBSTITUTION_INVENTORY_INACTIVE', 'Replacement accommodation inventory is inactive.');
        replacement = { serviceType, serviceId, inventoryMasterId: rate.propertyId, supplierId: property.supplierId || sourceLine.supplierId, categoryId: rate.roomCategoryId, label: `${property.name} — ${category.name}`, supplierCost: amount(rate.baseRate, 'authoritative replacement rate') * sourceLine.units };
      } else if (serviceType === 'TRANSPORT') {
        const rate = await tx.get('transport_rate_periods', ratePeriodId) as any;
        if (!rate || rate.status === 'ARCHIVED') throw new FinancialExceptionError(404, 'SUBSTITUTION_RATE_NOT_FOUND', 'Replacement transport rate not found.');
        const category = await tx.get('vehicle_categories', rate.vehicleCategoryId) as any;
        if (!category || category.active === false) throw new FinancialExceptionError(422, 'SUBSTITUTION_INVENTORY_INACTIVE', 'Replacement vehicle category is inactive.');
        replacement = { serviceType, serviceId, inventoryMasterId: rate.vehicleCategoryId, supplierId: rate.supplierId, categoryId: rate.vehicleCategoryId, label: category.displayName || category.name, supplierCost: amount(rate.baseRate, 'authoritative replacement rate') * sourceLine.units };
      } else {
        const rate = await tx.get('activity_rate_periods', ratePeriodId) as any;
        if (!rate || rate.status === 'ARCHIVED') throw new FinancialExceptionError(404, 'SUBSTITUTION_RATE_NOT_FOUND', 'Replacement activity rate not found.');
        const activity = await tx.get('activity_masters', rate.activityId) as any;
        const components = Object.values(rate.pricingComponents || {}).filter(value => typeof value === 'number') as number[];
        if (!activity || activity.active === false || components.length !== 1) throw new FinancialExceptionError(422, 'SUBSTITUTION_COST_POLICY_REQUIRED', 'Activity substitution requires one authoritative rate component; complex pricing needs an approved policy.');
        replacement = { serviceType, serviceId, inventoryMasterId: rate.activityId, supplierId: rate.supplierId, categoryId: activity.category, label: activity.name, supplierCost: amount(components[0], 'authoritative replacement rate') * sourceLine.units };
      }
      replacement.supplierCost = Math.round(replacement.supplierCost * 100) / 100;
      const original = sourceServiceSnapshot(sourceLine, [service]);
      const sameCategory = Boolean(original.categoryId && replacement.categoryId && original.categoryId === replacement.categoryId);
      const sameCommercialRange = replacement.supplierCost === original.supplierCost;
      const requiresAdminApproval = !sameCategory || !sameCommercialRange;
      const at = nowIso(this.clock);
      const substitution: SupplierSubstitution = {
        id: `substitution-${randomUUID()}`, bookingId, serviceType, serviceId, original, replacement,
        sameCategory, sameCommercialRange, material: requiresAdminApproval, customerEconomicsChanged: false,
        frozenSupplierCost: original.supplierCost, replacementSupplierCost: replacement.supplierCost,
        supplierCostDifference: Math.round((replacement.supplierCost - original.supplierCost) * 100) / 100,
        requiresAdminApproval, status: requiresAdminApproval ? 'PENDING_APPROVAL' : 'APPROVED', reason,
        proposedByEmployeeId: actor.employeeId, proposedAt: at,
        ...(!requiresAdminApproval ? { approvedByEmployeeId: 'SYSTEM_POLICY', approvedAt: at } : {}),
        createdAt: at, updatedAt: at,
      };
      tx.set('supplier_substitutions', substitution.id, substitution);
      const proposedEvent = audit('SUPPLIER_SUBSTITUTION_PROPOSED', 'SUPPLIER_SUBSTITUTION', substitution.id, actor, at, null, clone(substitution) as any, reason);
      tx.set('audit_logs', proposedEvent.id, proposedEvent);
      if (!requiresAdminApproval) {
        const approvedEvent = audit('SUPPLIER_SUBSTITUTION_APPROVED', 'SUPPLIER_SUBSTITUTION', substitution.id, actor, at, { status: 'PENDING_APPROVAL' }, { status: 'APPROVED', policy: 'EXACT_CATEGORY_AND_EXACT_COST' }, 'Automatically approved by the conservative same-category/exact-cost policy.');
        tx.set('audit_logs', approvedEvent.id, approvedEvent);
      }
      return substitution;
    });
  }

  async decideSubstitution(id: string, decision: 'APPROVED' | 'REJECTED', note: unknown, actor: FinancialExceptionActor): Promise<SupplierSubstitution> {
    const decisionNote = text(note, decision === 'REJECTED' ? 'rejectionReason' : 'decisionNote', decision === 'REJECTED' ? 5 : 1, 1000);
    return this.storage.runTransaction(async tx => {
      const item = await tx.get('supplier_substitutions', id) as SupplierSubstitution | null;
      if (!item) throw new FinancialExceptionError(404, 'SUBSTITUTION_NOT_FOUND', 'Substitution not found.');
      requireActor(actor);
      if (!['Founder', 'Admin'].includes(actor.role)) throw new FinancialExceptionError(403, 'SUBSTITUTION_APPROVAL_DENIED', 'Material substitutions require Founder/Admin approval.');
      if (item.status === decision) return item;
      if (item.status !== 'PENDING_APPROVAL') throw new FinancialExceptionError(409, 'SUBSTITUTION_ALREADY_DECIDED', 'Substitution is no longer pending.');
      const at = nowIso(this.clock);
      const updated: SupplierSubstitution = decision === 'APPROVED'
        ? { ...item, status: 'APPROVED', approvedByEmployeeId: actor.employeeId, approvedAt: at, updatedAt: at }
        : { ...item, status: 'REJECTED', rejectedByEmployeeId: actor.employeeId, rejectedAt: at, rejectionReason: decisionNote, updatedAt: at };
      tx.update('supplier_substitutions', id, updated);
      const event = audit(decision === 'APPROVED' ? 'SUPPLIER_SUBSTITUTION_APPROVED' : 'SUPPLIER_SUBSTITUTION_REJECTED', 'SUPPLIER_SUBSTITUTION', id, actor, at, { status: item.status }, { status: updated.status, note: decisionNote }, decisionNote);
      tx.set('audit_logs', event.id, event);
      return updated;
    });
  }

  async applySubstitution(id: string, actor: FinancialExceptionActor): Promise<{ substitution: SupplierSubstitution; idempotent: boolean }> {
    return this.storage.runTransaction(async tx => {
      const item = await tx.get('supplier_substitutions', id) as SupplierSubstitution | null;
      if (!item) throw new FinancialExceptionError(404, 'SUBSTITUTION_NOT_FOUND', 'Substitution not found.');
      const booking = await tx.get('bookings', item.bookingId) as Booking | null;
      if (!booking) throw new FinancialExceptionError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      assertBookingScope(booking, actor, item.requiresAdminApproval ? 'READ' : 'RESERVATIONS');
      if (item.requiresAdminApproval && !['Founder', 'Admin'].includes(actor.role) && actor.role !== 'Reservations') throw new FinancialExceptionError(403, 'SUBSTITUTION_APPLY_DENIED', 'The applied substitution must be within Reservations assignment or ALL scope.');
      const service = await tx.get(serviceCollection(item.serviceType), item.serviceId) as any;
      if (!service || service.bookingId !== item.bookingId) throw new FinancialExceptionError(404, 'SUBSTITUTION_SERVICE_NOT_FOUND', 'Service not found.');
      if (item.status === 'APPLIED') return { substitution: item, idempotent: true };
      if (item.status !== 'APPROVED') throw new FinancialExceptionError(409, 'SUBSTITUTION_NOT_APPROVED', 'The substitution is not approved.');
      const at = nowIso(this.clock);
      const patch: Record<string, unknown> = { supplierId: item.replacement.supplierId, updatedAt: at };
      if (item.serviceType === 'ACCOMMODATION') {
        patch.propertyId = item.replacement.inventoryMasterId;
        patch.propertyName = item.replacement.label.split(' — ')[0];
        patch.roomCategoryId = item.replacement.categoryId;
        patch.roomCategoryName = item.replacement.label.split(' — ')[1] || item.replacement.label;
        patch.supplierConfirmation = {
          ...(service.supplierConfirmation || {}), status: 'REQUESTED', updatedAt: at, updatedByEmployeeId: actor.employeeId,
          requiresCommercialApproval: item.supplierCostDifference !== 0,
          ...(item.supplierCostDifference !== 0 ? { rateDiscrepancy: {
            frozenSupplierUnitRate: item.original.supplierCost, confirmedSupplierUnitRate: item.replacement.supplierCost,
            difference: item.supplierCostDifference, reason: item.reason, recordedAt: at,
            recordedByEmployeeId: actor.employeeId, requiresCommercialApproval: true, approvalStatus: 'REQUIRED',
          } } : {}),
        };
      } else if (item.serviceType === 'TRANSPORT') {
        patch.vehicleCategoryId = item.replacement.categoryId;
        patch.vehicleCategoryName = item.replacement.label;
      } else {
        patch.activityMasterId = item.replacement.inventoryMasterId;
        patch.activityName = item.replacement.label;
      }
      tx.update(serviceCollection(item.serviceType), item.serviceId, patch);
      const applied: SupplierSubstitution = { ...item, status: 'APPLIED', appliedByEmployeeId: actor.employeeId, appliedAt: at, updatedAt: at };
      tx.update('supplier_substitutions', id, applied);
      const event = audit('SUPPLIER_SUBSTITUTION_APPLIED', 'SUPPLIER_SUBSTITUTION', id, actor, at,
        { service: { supplierId: service.supplierId }, status: item.status }, { service: patch, status: 'APPLIED', frozenEconomicsUnchanged: true }, item.reason);
      tx.set('audit_logs', event.id, event);
      return { substitution: applied, idempotent: false };
    });
  }

  async calculateRefund(bookingId: string, rawInput: RefundCalculationInput, actor: FinancialExceptionActor): Promise<RefundRequest> {
    assertAllowedFields(rawInput, ['reason', 'supplierCancellationCharges', 'nonRefundableSupplierPaymentIds', 'recoverableSupplierAmounts']);
    const reason = text(rawInput.reason, 'reason', 5, 1000);
    if (!['Accounts', 'Founder', 'Admin'].includes(actor.role)) throw new FinancialExceptionError(403, 'REFUND_CALCULATION_DENIED', 'Accounts or ALL scope is required.');
    requireActor(actor);
    const charges = moneyEvidence(rawInput.supplierCancellationCharges, 'supplierCancellationCharges');
    const recoveries = moneyEvidence(rawInput.recoverableSupplierAmounts, 'recoverableSupplierAmounts');
    const paymentIds = rawInput.nonRefundableSupplierPaymentIds === undefined ? [] : rawInput.nonRefundableSupplierPaymentIds;
    if (!Array.isArray(paymentIds) || paymentIds.some(value => typeof value !== 'string' || !value.trim())) throw new FinancialExceptionError(400, 'INVALID_FINANCIAL_EXCEPTION_INPUT', 'nonRefundableSupplierPaymentIds must be an array of IDs.');
    if (new Set(paymentIds.map(value => String(value).trim())).size !== paymentIds.length) throw new FinancialExceptionError(400, 'DUPLICATE_SUPPLIER_PAYMENT_EVIDENCE', 'Each non-refundable supplier payment may be referenced once.');

    return this.storage.runTransaction(async tx => {
      const booking = await tx.get('bookings', bookingId) as Booking | null;
      if (!booking) throw new FinancialExceptionError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      assertBookingScope(booking, actor, 'FINANCIAL');
      if (booking.status !== 'CANCELLED') throw new FinancialExceptionError(422, 'REFUND_REQUIRES_CANCELLED_BOOKING', 'Cancel the Booking before calculating a refund.');
      const [payments, supplierPayments, ledgers, policy] = await Promise.all([
        tx.findByField('payments', 'bookingId', bookingId, 500),
        tx.findByField('supplier_payments', 'bookingId', bookingId, 500),
        tx.findByField('refund_ledger', 'bookingId', bookingId, 500),
        tx.get('financial_policies', 'current'),
      ]);
      const verifiedPaymentsReceived = (payments as PaymentRecord[]).filter(item => item.status === 'VERIFIED').reduce((sum, item) => sum + amount(item.amount, `payment ${item.id}`), 0);
      const verifiedSupplier = new Map((supplierPayments as SupplierPaymentRecord[]).filter(item => item.status === 'VERIFIED').map(item => [item.id, item]));
      let nonRefundableSupplierPayments = 0;
      const deductions: RefundDeduction[] = charges.map(item => ({ type: 'SUPPLIER_CANCELLATION_CHARGE', ...item }));
      for (const rawId of paymentIds as string[]) {
        const id = rawId.trim();
        const entry = verifiedSupplier.get(id);
        if (!entry) throw new FinancialExceptionError(409, 'SUPPLIER_PAYMENT_NOT_VERIFIED', `Supplier payment ${id} is not a verified payment for this Booking.`);
        const supplierAmount = amount(entry.amountMinor / 100, `supplier payment ${id}`);
        nonRefundableSupplierPayments += supplierAmount;
        deductions.push({ type: 'NON_REFUNDABLE_SUPPLIER_PAYMENT', amount: supplierAmount, sourceReference: id, reason: 'Verified supplier payment marked non-refundable for this cancellation.' });
      }
      const supplierCancellationCharges = charges.reduce((sum, item) => sum + item.amount, 0);
      const recoverableSupplierAmounts = recoveries.reduce((sum, item) => sum + item.amount, 0);
      const supplierDeductions = Math.max(0, Math.round((supplierCancellationCharges + nonRefundableSupplierPayments - recoverableSupplierAmounts) * 100) / 100);
      const configuredFlat = policy && typeof policy.cancellationDeductionFlat === 'number' ? amount(policy.cancellationDeductionFlat, 'configured cancellation deduction') : 0;
      const configuredPercent = policy && typeof policy.cancellationDeductionPercent === 'number' ? amount(policy.cancellationDeductionPercent, 'configured cancellation deduction percent') : 0;
      const bookingBridgeDeductions = Math.round((configuredFlat + verifiedPaymentsReceived * configuredPercent / 100) * 100) / 100;
      if (bookingBridgeDeductions > 0) deductions.push({ type: 'BOOKING_BRIDGE_POLICY', amount: bookingBridgeDeductions, sourceReference: 'financial_policies/current', reason: 'Configured Booking Bridge cancellation deduction.' });
      const alreadyRefundedAmount = (ledgers as RefundLedgerEntry[]).reduce((sum, item) => sum + item.actualRefundedAmount, 0);
      const grossRefundableBasis = verifiedPaymentsReceived;
      const suggestedRefundAmount = Math.max(0, Math.round((grossRefundableBasis - supplierDeductions - bookingBridgeDeductions - alreadyRefundedAmount) * 100) / 100);
      const calculation: RefundCalculation = {
        verifiedPaymentsReceived, grossRefundableBasis, supplierCancellationCharges,
        nonRefundableSupplierPayments, recoverableSupplierAmounts, supplierDeductions,
        bookingBridgeDeductions, alreadyRefundedAmount, suggestedRefundAmount,
        policyCode: policy ? 'CONFIGURED_CANCELLATION_POLICY' : 'NO_CONFIGURED_BOOKING_BRIDGE_DEDUCTION',
      };
      const at = nowIso(this.clock);
      const refund: RefundRequest = {
        id: `refund-${randomUUID()}`, bookingId, customerId: booking.customerId, currency: booking.currency || 'INR',
        status: 'CALCULATED', reason, calculation, deductions,
        requestedAmount: suggestedRefundAmount, actualRefundedAmount: 0,
        requestedByEmployeeId: actor.employeeId, requestedAt: at, createdAt: at, updatedAt: at,
      };
      tx.set('refund_requests', refund.id, refund);
      const event = audit('REFUND_CALCULATED', 'REFUND_REQUEST', refund.id, actor, at, null, { bookingId, calculation, deductions }, reason);
      tx.set('audit_logs', event.id, event);
      return refund;
    });
  }

  async submitRefund(refundId: string, actor: FinancialExceptionActor): Promise<RefundRequest> {
    requireActor(actor);
    if (!['Accounts', 'Founder', 'Admin'].includes(actor.role)) throw new FinancialExceptionError(403, 'REFUND_REQUEST_DENIED', 'Accounts or ALL scope is required.');
    return this.storage.runTransaction(async tx => {
      const refund = await tx.get('refund_requests', refundId) as RefundRequest | null;
      if (!refund) throw new FinancialExceptionError(404, 'REFUND_NOT_FOUND', 'Refund request not found.');
      if (refund.requestedByEmployeeId !== actor.employeeId && !['Founder', 'Admin'].includes(actor.role)) throw new FinancialExceptionError(403, 'REFUND_REQUEST_SCOPE_DENIED', 'Only the calculator or ALL scope may submit this refund.');
      if (refund.status === 'PENDING_APPROVAL') return refund;
      if (refund.status !== 'CALCULATED') throw new FinancialExceptionError(409, 'REFUND_STATE_INVALID', 'Only a calculated refund may be submitted.');
      const at = nowIso(this.clock);
      const updated = { ...refund, status: 'PENDING_APPROVAL' as const, updatedAt: at };
      tx.update('refund_requests', refundId, updated);
      const event = audit('REFUND_REQUESTED', 'REFUND_REQUEST', refundId, actor, at, { status: refund.status }, { status: updated.status, requestedAmount: refund.requestedAmount }, refund.reason);
      tx.set('audit_logs', event.id, event);
      return updated;
    });
  }

  async decideRefund(refundId: string, decision: 'APPROVED' | 'REJECTED', rawInput: unknown, actor: FinancialExceptionActor): Promise<RefundRequest> {
    assertAllowedFields(rawInput, ['approvedAmount', 'decisionNote', 'rejectionReason']);
    requireActor(actor);
    if (!['Founder', 'Admin'].includes(actor.role)) throw new FinancialExceptionError(403, 'REFUND_APPROVAL_DENIED', 'Founder/Admin approval is required.');
    return this.storage.runTransaction(async tx => {
      const refund = await tx.get('refund_requests', refundId) as RefundRequest | null;
      if (!refund) throw new FinancialExceptionError(404, 'REFUND_NOT_FOUND', 'Refund request not found.');
      if (refund.requestedByEmployeeId === actor.employeeId) throw new FinancialExceptionError(403, 'REFUND_SELF_APPROVAL_DENIED', 'The refund requester cannot approve the same refund.');
      if (refund.status === decision) return refund;
      if (refund.status !== 'PENDING_APPROVAL') throw new FinancialExceptionError(409, 'REFUND_STATE_INVALID', 'Refund is not pending approval.');
      const note = text(rawInput.decisionNote ?? rawInput.rejectionReason, decision === 'REJECTED' ? 'rejectionReason' : 'decisionNote', decision === 'REJECTED' ? 5 : 1, 1000);
      const at = nowIso(this.clock);
      let updated: RefundRequest;
      if (decision === 'APPROVED') {
        const approvedAmount = rawInput.approvedAmount === undefined ? refund.requestedAmount : amount(rawInput.approvedAmount, 'approvedAmount');
        if (approvedAmount > refund.calculation.suggestedRefundAmount) throw new FinancialExceptionError(422, 'REFUND_EXCEEDS_SUGGESTION', 'Approval cannot exceed the current server-calculated suggestion. Recalculate with supporting evidence.');
        updated = { ...refund, status: 'APPROVED', approvedRefundAmount: approvedAmount, approvedByEmployeeId: actor.employeeId, approvedAt: at, updatedAt: at };
      } else {
        updated = { ...refund, status: 'REJECTED', rejectedByEmployeeId: actor.employeeId, rejectedAt: at, rejectionReason: note, updatedAt: at };
      }
      tx.update('refund_requests', refundId, updated);
      const event = audit(decision === 'APPROVED' ? 'REFUND_APPROVED' : 'REFUND_REJECTED', 'REFUND_REQUEST', refundId, actor, at,
        { status: refund.status }, { status: updated.status, approvedRefundAmount: updated.approvedRefundAmount, note }, note);
      tx.set('audit_logs', event.id, event);
      return updated;
    });
  }

  async markRefundPaid(refundId: string, rawInput: unknown, actor: FinancialExceptionActor): Promise<{ refund: RefundRequest; ledger: RefundLedgerEntry; idempotent: boolean }> {
    assertAllowedFields(rawInput, ['refundMethod', 'refundReference']);
    requireActor(actor);
    if (actor.role !== 'Accounts') throw new FinancialExceptionError(403, 'REFUND_PAYMENT_DENIED', 'Accounts must record the actual refund payment.');
    const refundMethod = text(rawInput.refundMethod, 'refundMethod', 2, 100);
    const refundReference = text(rawInput.refundReference, 'refundReference', 3, 200);
    return this.storage.runTransaction(async tx => {
      const refund = await tx.get('refund_requests', refundId) as RefundRequest | null;
      const ledgerId = `refund-ledger-${refundId}`;
      const [existingLedger, bookingLedgers] = await Promise.all([
        tx.get('refund_ledger', ledgerId),
        tx.findByField('refund_ledger', 'bookingId', refund?.bookingId || '', 500),
      ]) as [RefundLedgerEntry | null, RefundLedgerEntry[]];
      if (!refund) throw new FinancialExceptionError(404, 'REFUND_NOT_FOUND', 'Refund request not found.');
      if (refund.status === 'PAID' && existingLedger) return { refund, ledger: existingLedger, idempotent: true };
      if (refund.status !== 'APPROVED' || refund.approvedRefundAmount === undefined || !refund.approvedByEmployeeId) throw new FinancialExceptionError(409, 'REFUND_NOT_APPROVED', 'Approval does not mean paid; an approved refund is required.');
      if (refund.approvedByEmployeeId === actor.employeeId || refund.requestedByEmployeeId === actor.employeeId) throw new FinancialExceptionError(403, 'REFUND_SEPARATION_OF_DUTIES_DENIED', 'Requester/approver cannot also record payment.');
      const paidByOtherRequests = bookingLedgers.filter(item => item.refundId !== refundId).reduce((sum, item) => sum + item.actualRefundedAmount, 0);
      const remainingAuthorizedBasis = Math.max(0, Math.round((refund.calculation.grossRefundableBasis - refund.calculation.supplierDeductions - refund.calculation.bookingBridgeDeductions - paidByOtherRequests) * 100) / 100);
      if (refund.approvedRefundAmount > remainingAuthorizedBasis) {
        throw new FinancialExceptionError(409, 'REFUND_RECALCULATION_REQUIRED', 'Another refund changed the remaining refundable basis. Recalculate and approve a new request.');
      }
      const at = nowIso(this.clock);
      const ledger: RefundLedgerEntry = {
        id: ledgerId, refundId, bookingId: refund.bookingId, customerId: refund.customerId, currency: refund.currency,
        verifiedPaymentsReceived: refund.calculation.verifiedPaymentsReceived,
        grossRefundableBasis: refund.calculation.grossRefundableBasis,
        supplierDeductions: refund.calculation.supplierDeductions,
        bookingBridgeDeductions: refund.calculation.bookingBridgeDeductions,
        approvedRefundAmount: refund.approvedRefundAmount, actualRefundedAmount: refund.approvedRefundAmount,
        refundMethod, refundReference, requestedByEmployeeId: refund.requestedByEmployeeId,
        approvedByEmployeeId: refund.approvedByEmployeeId, processedByEmployeeId: actor.employeeId,
        reason: refund.reason, paidAt: at,
      };
      const updated: RefundRequest = {
        ...refund, status: 'PAID', actualRefundedAmount: refund.approvedRefundAmount,
        processedByEmployeeId: actor.employeeId, processedAt: at, refundMethod, refundReference, updatedAt: at,
      };
      tx.set('refund_ledger', ledgerId, ledger);
      tx.update('refund_requests', refundId, updated);
      const event = audit('REFUND_PAID', 'REFUND_REQUEST', refundId, actor, at, { status: refund.status }, { status: 'PAID', ledgerId, actualRefundedAmount: ledger.actualRefundedAmount, refundMethod, refundReference }, refund.reason);
      tx.set('audit_logs', event.id, event);
      return { refund: updated, ledger, idempotent: false };
    });
  }

  async adjustCommission(bookingId: string, rawInput: unknown, actor: FinancialExceptionActor): Promise<CommissionLedgerEntry> {
    assertAllowedFields(rawInput, ['amount', 'reason', 'idempotencyKey']);
    requireActor(actor);
    if (!['Founder', 'Admin'].includes(actor.role)) throw new FinancialExceptionError(403, 'COMMISSION_ADJUSTMENT_DENIED', 'Founder/Admin authority is required.');
    const adjustmentAmount = signedAmount(rawInput.amount, 'amount');
    const reason = text(rawInput.reason, 'reason', 5, 1000);
    const key = text(rawInput.idempotencyKey, 'idempotencyKey', 3, 160);
    return this.storage.runTransaction(async tx => {
      const booking = await tx.get('bookings', bookingId) as Booking | null;
      if (!booking || !booking.assignedSalesEmployeeId) throw new FinancialExceptionError(409, 'COMMISSION_OWNER_MISSING', 'Original Sales ownership is required.');
      const id = `commission-adjustment-${key}`;
      const existing = await tx.get('commission_ledger', id) as CommissionLedgerEntry | null;
      if (existing) return existing;
      const at = nowIso(this.clock);
      const entry: CommissionLedgerEntry = {
        id, bookingId, employeeId: booking.assignedSalesEmployeeId, type: 'ADJUSTMENT', amount: adjustmentAmount,
        currency: booking.currency || 'INR', bookingStatus: booking.status, reason,
        actorEmployeeId: actor.employeeId, createdAt: at, idempotencyKey: key,
      };
      tx.set('commission_ledger', id, entry);
      const event = audit('COMMISSION_ADJUSTED', 'COMMISSION_LEDGER', id, actor, at, null, clone(entry) as any, reason);
      tx.set('audit_logs', event.id, event);
      return entry;
    });
  }

  async settleCommission(employeeId: string, rawInput: unknown, actor: FinancialExceptionActor): Promise<{ entry: CommissionLedgerEntry; summary: CommissionSummary; idempotent: boolean }> {
    assertAllowedFields(rawInput, ['settlementReference', 'idempotencyKey', 'reason']);
    requireActor(actor);
    if (!['Accounts', 'Founder', 'Admin'].includes(actor.role)) throw new FinancialExceptionError(403, 'COMMISSION_SETTLEMENT_DENIED', 'Accounts or ALL scope is required.');
    const settlementReference = text(rawInput.settlementReference, 'settlementReference', 3, 200);
    const key = text(rawInput.idempotencyKey, 'idempotencyKey', 3, 160);
    const reason = text(rawInput.reason, 'reason', 5, 1000);
    return this.storage.runTransaction(async tx => {
      const entries = await tx.findByField('commission_ledger', 'employeeId', employeeId, 1000) as CommissionLedgerEntry[];
      const existing = entries.find(item => item.type === 'SETTLED' && item.idempotencyKey === key);
      if (existing) return { entry: existing, summary: commissionSummary(employeeId, entries), idempotent: true };
      const before = commissionSummary(employeeId, entries);
      if (before.outstanding <= 0) throw new FinancialExceptionError(422, 'NO_COMMISSION_PAYABLE', 'No positive commission is available for settlement.');
      const cycleFingerprint = createHash('sha256').update(JSON.stringify(entries
        .map(item => [item.id, item.type, item.amount])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0]))))).digest('hex').slice(0, 20);
      const id = `commission-settlement-${employeeId}-${cycleFingerprint}`;
      const existingCycle = await tx.get('commission_ledger', id) as CommissionLedgerEntry | null;
      if (existingCycle) return { entry: existingCycle, summary: commissionSummary(employeeId, entries), idempotent: true };
      const at = nowIso(this.clock);
      const entry: CommissionLedgerEntry = {
        id, bookingId: 'MULTIPLE', employeeId, type: 'SETTLED', amount: before.outstanding,
        currency: entries[0]?.currency || 'INR', bookingStatus: 'SETTLEMENT', reason,
        actorEmployeeId: actor.employeeId, createdAt: at, settlementReference, idempotencyKey: key,
      };
      tx.set('commission_ledger', id, entry);
      const event = audit('COMMISSION_SETTLED', 'COMMISSION_LEDGER', id, actor, at, null, clone(entry) as any, reason);
      tx.set('audit_logs', event.id, event);
      return { entry, summary: commissionSummary(employeeId, [...entries, entry]), idempotent: false };
    });
  }

  async getBookingOverview(bookingId: string, actor: FinancialExceptionActor) {
    return this.storage.runTransaction(async tx => {
      const booking = await tx.get('bookings', bookingId) as Booking | null;
      if (!booking) throw new FinancialExceptionError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      assertBookingScope(booking, actor, 'READ');
      const [amendments, substitutions, refunds, refundLedger, commissions, bookingAudits] = await Promise.all([
        tx.findByField('booking_amendments', 'bookingId', bookingId, 200),
        tx.findByField('supplier_substitutions', 'bookingId', bookingId, 200),
        tx.findByField('refund_requests', 'bookingId', bookingId, 200),
        tx.findByField('refund_ledger', 'bookingId', bookingId, 200),
        tx.findByField('commission_ledger', 'bookingId', bookingId, 200),
        tx.findByField('audit_logs', 'entityId', bookingId, 200),
      ]);
      const workflowIds = [...amendments, ...substitutions, ...refunds, ...commissions]
        .map(item => String(item.id || ''))
        .filter(Boolean);
      const workflowAuditGroups = await Promise.all(
        workflowIds.map(entityId => tx.findByField('audit_logs', 'entityId', entityId, 200)),
      );
      const audits = [...bookingAudits, ...workflowAuditGroups.flat()]
        .sort((left: any, right: any) => String(right.createdAt || right.timestamp || '').localeCompare(String(left.createdAt || left.timestamp || '')));
      const canSeeFullFinancials = ['Founder', 'Admin', 'Accounts'].includes(actor.role)
        || actor.role === 'Sales Manager'
        || (actor.role === 'Sales Executive' && booking.assignedSalesEmployeeId === actor.employeeId);
      return {
        bookingId,
        amendments: canSeeFullFinancials ? amendments : [],
        substitutions,
        refunds: canSeeFullFinancials ? refunds : [],
        refundLedger: ['Founder', 'Admin', 'Accounts'].includes(actor.role) ? refundLedger : [],
        commissions: canSeeFullFinancials ? commissions : [],
        auditTimeline: audits,
      };
    });
  }
}

export { DEFAULT_COMMISSION_AMOUNT };
