import { createHash, randomUUID } from 'node:crypto';
import type { DocumentData } from 'firebase-admin/firestore';
import { getAdminDb } from '../firebaseAdmin.js';
import { authorizeResource, resolveQueryScope } from '../authorization/policyEngine.js';
import { bookingResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationAction, AuthorizationPrincipal } from '../authorization/policyTypes.js';
import type { AuditLog, UserRole } from '../../src/types/index.js';
import type {
  Booking,
  BookingAccommodation,
  BookingActivity,
  BookingTransport,
  FinancialSnapshot,
  LineItemCostSnapshot,
} from '../../src/types/booking.js';
import type { PaymentMethod } from '../../src/types/payment.js';
import type {
  RecordSupplierPaymentInput,
  SupplierPayable,
  SupplierPayableOperationalView,
  SupplierPayableSummary,
  SupplierPaymentRecord,
  SupplierPaymentType,
  SupplierRateDiscrepancySummary,
  SupplierServiceType,
} from '../../src/types/supplierPayable.js';

type UnknownRecord = Record<string, unknown>;

export interface SupplierPaymentActor extends AuthorizationPrincipal {
  name: string;
  role: UserRole;
}

export interface SupplierSourceBundle {
  booking: Booking;
  snapshot: FinancialSnapshot;
  accommodations: BookingAccommodation[];
  transports: BookingTransport[];
  activities: BookingActivity[];
}

export interface SupplierPayableTransaction {
  getSourceBundle(bookingId: string): Promise<SupplierSourceBundle | null>;
  getPayment(paymentId: string): Promise<SupplierPaymentRecord | null>;
  getPaymentsForObligation(obligationId: string): Promise<SupplierPaymentRecord[]>;
  setPayment(paymentId: string, payment: SupplierPaymentRecord): void;
  updatePayment(paymentId: string, updates: Partial<SupplierPaymentRecord>): void;
  setAuditLog(auditId: string, audit: AuditLog): void;
}

export interface SupplierPayableStorageProvider {
  listSourceBundles(): Promise<SupplierSourceBundle[]>;
  listPayments(): Promise<SupplierPaymentRecord[]>;
  runTransaction<T>(operation: (transaction: SupplierPayableTransaction) => Promise<T>): Promise<T>;
}

export class SupplierPayableError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'SupplierPayableError';
  }
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'BANK_TRANSFER', 'UPI', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'CHEQUE', 'OTHER',
];
const PAYMENT_TYPES: SupplierPaymentType[] = ['ADVANCE', 'PARTIAL', 'FINAL_SETTLEMENT'];
const RECORD_FIELDS = new Set([
  'amount', 'paymentDate', 'paymentMethod', 'referenceNumber', 'paymentType', 'notes', 'idempotencyKey',
]);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function record(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SupplierPayableError(400, 'INVALID_SUPPLIER_PAYMENT_PAYLOAD', 'Supplier payment payload must be an object.');
  }
  return value as UnknownRecord;
}

function toMinor(value: unknown, code: string, label: string, allowZero = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new SupplierPayableError(422, code, `${label} must be a finite ${allowZero ? 'non-negative' : 'positive'} amount.`);
  }
  const scaled = value * 100;
  const minor = Math.round(scaled);
  if (!Number.isSafeInteger(minor) || Math.abs(scaled - minor) > 1e-8) {
    throw new SupplierPayableError(422, code, `${label} must have no more than two decimal places.`);
  }
  return minor;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function obligationId(bookingId: string, line: LineItemCostSnapshot): string {
  const digest = createHash('sha256')
    .update(`${bookingId}|${line.serviceType}|${line.serviceId}`)
    .digest('hex')
    .slice(0, 24);
  return `SPO-${digest}`;
}

function audit(
  action: string,
  actor: SupplierPaymentActor,
  entityId: string,
  before: UnknownRecord | null,
  after: UnknownRecord,
  reason: string,
  now: string,
): AuditLog {
  return {
    id: `audit-supplier-payment-${randomUUID()}`,
    timestamp: now,
    actorType: 'HUMAN',
    actorId: actor.employeeId,
    actorName: `${actor.name} (${actor.role})`,
    action,
    entityType: 'SUPPLIER_PAYMENT',
    entityId,
    before,
    after,
    reason,
  };
}

function authorize(
  actor: SupplierPaymentActor,
  booking: Booking,
  action: AuthorizationAction,
): void {
  const decision = authorizeResource(actor, 'SUPPLIER_PAYABLE', action, bookingResourceContext(booking));
  if (!decision.allowed) {
    throw new SupplierPayableError(403, decision.code, decision.reason, { scope: decision.scope });
  }
}

function asUnknown(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function matchService(bundle: SupplierSourceBundle, line: LineItemCostSnapshot):
  BookingAccommodation | BookingTransport | BookingActivity | undefined {
  const candidates = line.serviceType === 'ACCOMMODATION'
    ? bundle.accommodations
    : line.serviceType === 'TRANSPORT'
      ? bundle.transports
      : line.serviceType === 'ACTIVITY'
        ? bundle.activities
        : [];
  const exact = candidates.filter((service) => service.sourceQuoteServiceId === line.serviceId || service.id === line.serviceId);
  if (exact.length === 1) return exact[0];
  const compatible = candidates.filter((service) => {
    if (service.supplierId !== line.supplierId) return false;
    if (line.serviceType === 'ACCOMMODATION') {
      return (service as BookingAccommodation).propertyId === line.inventoryMasterId;
    }
    if (line.serviceType === 'TRANSPORT') {
      return (service as BookingTransport).vehicleCategoryId === line.inventoryMasterId;
    }
    return (service as BookingActivity).activityMasterId === line.inventoryMasterId;
  });
  return compatible.length === 1 ? compatible[0] : undefined;
}

function serviceMetadata(
  line: LineItemCostSnapshot,
  service?: BookingAccommodation | BookingTransport | BookingActivity,
) {
  if (!service) return { serviceName: line.supplierName };
  const raw = asUnknown(service);
  const dueDate = typeof raw.supplierPaymentDueDate === 'string' && validDate(raw.supplierPaymentDueDate)
    ? raw.supplierPaymentDueDate
    : undefined;
  if (line.serviceType === 'ACCOMMODATION') {
    const accommodation = service as BookingAccommodation;
    return {
      serviceName: accommodation.propertyName,
      serviceStartDate: accommodation.checkInDate,
      serviceEndDate: accommodation.checkOutDate,
      ...(dueDate ? { dueDate } : {}),
    };
  }
  if (line.serviceType === 'TRANSPORT') {
    const transport = service as BookingTransport;
    return {
      serviceName: transport.routeName || transport.vehicleCategoryName,
      serviceStartDate: transport.serviceDate,
      serviceEndDate: transport.endDate,
      settlementPeriod: transport.serviceDate?.slice(0, 7),
      ...(dueDate ? { dueDate } : {}),
    };
  }
  const activity = service as BookingActivity;
  return {
    serviceName: activity.activityName,
    serviceStartDate: activity.serviceDate,
    serviceEndDate: activity.serviceDate,
    ...(dueDate ? { dueDate } : {}),
  };
}

function discrepancy(service?: BookingAccommodation | BookingTransport | BookingActivity): {
  requiresCommercialApproval: boolean;
  rateDiscrepancy?: SupplierRateDiscrepancySummary;
} {
  if (!service) return { requiresCommercialApproval: false };
  const confirmation = asUnknown(asUnknown(service).supplierConfirmation);
  const rawDiscrepancy = asUnknown(confirmation.rateDiscrepancy);
  const requiresCommercialApproval = confirmation.requiresCommercialApproval === true;
  if (!rawDiscrepancy.reason) return { requiresCommercialApproval };
  return {
    requiresCommercialApproval,
    rateDiscrepancy: {
      frozenSupplierUnitRateMinor: toMinor(rawDiscrepancy.frozenSupplierUnitRate, 'INVALID_FROZEN_SNAPSHOT', 'Frozen supplier unit rate', true),
      confirmedSupplierUnitRateMinor: toMinor(rawDiscrepancy.confirmedSupplierUnitRate, 'INVALID_DISCREPANCY', 'Confirmed supplier unit rate', true),
      differenceMinor: toMinor(Math.abs(Number(rawDiscrepancy.difference)), 'INVALID_DISCREPANCY', 'Supplier rate difference', true),
      reason: String(rawDiscrepancy.reason),
      recordedAt: String(rawDiscrepancy.recordedAt || ''),
      recordedByEmployeeId: String(rawDiscrepancy.recordedByEmployeeId || ''),
      approvalStatus: 'REQUIRED',
    },
  };
}

function verifiedTotal(payments: SupplierPaymentRecord[]): number {
  let total = 0;
  for (const payment of payments) {
    if (payment.status !== 'VERIFIED') continue;
    if (!Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0) {
      throw new SupplierPayableError(422, 'INVALID_SUPPLIER_PAYMENT_LEDGER', 'Supplier payment ledger contains an invalid amount.');
    }
    total += payment.amountMinor;
    if (!Number.isSafeInteger(total)) {
      throw new SupplierPayableError(422, 'INVALID_SUPPLIER_PAYMENT_LEDGER', 'Supplier payment total exceeds the safe range.');
    }
  }
  return total;
}

function buildPayable(
  bundle: SupplierSourceBundle,
  line: LineItemCostSnapshot,
  payments: SupplierPaymentRecord[],
  includePayments = false,
): SupplierPayable {
  const service = matchService(bundle, line);
  const frozenLiabilityMinor = toMinor(
    line.frozenTotalSupplierCost,
    'INVALID_FROZEN_SNAPSHOT',
    'Frozen supplier liability',
    true,
  );
  const linkedPayments = payments.filter((payment) => payment.obligationId === obligationId(bundle.booking.id, line));
  const verifiedPaidMinor = verifiedTotal(linkedPayments);
  const outstandingMinor = Math.max(0, frozenLiabilityMinor - verifiedPaidMinor);
  const overpaidMinor = Math.max(0, verifiedPaidMinor - frozenLiabilityMinor);
  const discrepancyState = discrepancy(service);
  let settlementStatus: SupplierPayable['settlementStatus'] = 'UNPAID';
  if (discrepancyState.requiresCommercialApproval) settlementStatus = 'PENDING_APPROVAL';
  else if (overpaidMinor > 0) settlementStatus = 'OVERPAID';
  else if (frozenLiabilityMinor > 0 && outstandingMinor === 0) settlementStatus = 'SETTLED';
  else if (verifiedPaidMinor > 0) settlementStatus = 'PARTIALLY_PAID';

  return {
    obligationId: obligationId(bundle.booking.id, line),
    bookingId: bundle.booking.id,
    bookingReference: bundle.booking.bookingReference,
    sourceSnapshotId: bundle.snapshot.id,
    sourceSnapshotVersion: bundle.snapshot.snapshotVersion,
    sourceServiceId: line.serviceId,
    ...(service ? { bookingServiceId: service.id } : {}),
    supplierId: line.supplierId,
    supplierName: line.supplierName,
    serviceType: line.serviceType as SupplierServiceType,
    ...serviceMetadata(line, service),
    currency: bundle.snapshot.currency,
    frozenLiabilityMinor,
    verifiedPaidMinor,
    outstandingMinor,
    overpaidMinor,
    settlementStatus,
    ...(service?.confirmationStatus ? { confirmationStatus: service.confirmationStatus } : {}),
    ...discrepancyState,
    sourceIntegrityStatus: service ? 'READY' : 'MISSING_SERVICE_LINK',
    canRecordPayment: Boolean(service),
    ...(includePayments ? { payments: linkedPayments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } : {}),
  };
}

function allPayables(bundle: SupplierSourceBundle, payments: SupplierPaymentRecord[], includePayments = false): SupplierPayable[] {
  return bundle.snapshot.lineItems.map((line) => buildPayable(bundle, line, payments, includePayments));
}

function operationsProjection(payable: SupplierPayable): SupplierPayableOperationalView {
  return {
    obligationId: payable.obligationId,
    bookingId: payable.bookingId,
    bookingReference: payable.bookingReference,
    ...(payable.bookingServiceId ? { bookingServiceId: payable.bookingServiceId } : {}),
    supplierId: payable.supplierId,
    supplierName: payable.supplierName,
    serviceType: payable.serviceType,
    serviceName: payable.serviceName,
    ...(payable.serviceStartDate ? { serviceStartDate: payable.serviceStartDate } : {}),
    ...(payable.serviceEndDate ? { serviceEndDate: payable.serviceEndDate } : {}),
    ...(payable.dueDate ? { dueDate: payable.dueDate } : {}),
    settlementStatus: payable.settlementStatus,
    ...(payable.confirmationStatus ? { confirmationStatus: payable.confirmationStatus } : {}),
    requiresCommercialApproval: payable.requiresCommercialApproval,
    sourceIntegrityStatus: payable.sourceIntegrityStatus,
  };
}

function summary(payables: SupplierPayable[]): SupplierPayableSummary[] {
  const grouped = new Map<string, SupplierPayableSummary>();
  const today = new Date().toISOString().slice(0, 10);
  for (const payable of payables) {
    const current = grouped.get(payable.currency) || {
      currency: payable.currency,
      totalFrozenLiabilityMinor: 0,
      totalVerifiedPaidMinor: 0,
      totalOutstandingMinor: 0,
      totalOverpaidMinor: 0,
      overdueCount: 0,
      partiallyPaidCount: 0,
      disputedCount: 0,
      obligationCount: 0,
    };
    current.totalFrozenLiabilityMinor += payable.frozenLiabilityMinor;
    current.totalVerifiedPaidMinor += payable.verifiedPaidMinor;
    current.totalOutstandingMinor += payable.outstandingMinor;
    current.totalOverpaidMinor += payable.overpaidMinor;
    current.obligationCount += 1;
    if (payable.dueDate && payable.dueDate < today && payable.outstandingMinor > 0) current.overdueCount += 1;
    if (payable.settlementStatus === 'PARTIALLY_PAID') current.partiallyPaidCount += 1;
    if (payable.requiresCommercialApproval) current.disputedCount += 1;
    grouped.set(payable.currency, current);
  }
  return [...grouped.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

function validateRecordInput(input: unknown): {
  amountMinor: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  paymentType: SupplierPaymentType;
  notes?: string;
  idempotencyKey?: string;
} {
  const payload = record(input);
  const unsupported = Object.keys(payload).filter((field) => !RECORD_FIELDS.has(field));
  if (unsupported.length) {
    throw new SupplierPayableError(400, 'PROTECTED_SUPPLIER_PAYMENT_FIELD', `Unsupported or server-controlled fields: ${unsupported.join(', ')}.`);
  }
  const amountMinor = toMinor(payload.amount, 'INVALID_SUPPLIER_PAYMENT_AMOUNT', 'Supplier payment');
  if (!validDate(payload.paymentDate)) {
    throw new SupplierPayableError(400, 'INVALID_SUPPLIER_PAYMENT_DATE', 'paymentDate must be a valid YYYY-MM-DD date.');
  }
  if (!PAYMENT_METHODS.includes(payload.paymentMethod as PaymentMethod)) {
    throw new SupplierPayableError(400, 'INVALID_SUPPLIER_PAYMENT_METHOD', 'Unsupported supplier payment method.');
  }
  if (!PAYMENT_TYPES.includes(payload.paymentType as SupplierPaymentType)) {
    throw new SupplierPayableError(400, 'INVALID_SUPPLIER_PAYMENT_TYPE', 'Unsupported supplier payment type.');
  }
  if (typeof payload.referenceNumber !== 'string' || !payload.referenceNumber.trim()) {
    throw new SupplierPayableError(400, 'SUPPLIER_PAYMENT_REFERENCE_REQUIRED', 'A transaction reference is required.');
  }
  const referenceNumber = payload.referenceNumber.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 ._:/#()-]{0,99}$/.test(referenceNumber)) {
    throw new SupplierPayableError(400, 'INVALID_SUPPLIER_PAYMENT_REFERENCE', 'Transaction reference contains unsupported characters.');
  }
  if (payload.notes !== undefined && (typeof payload.notes !== 'string' || payload.notes.length > 2000)) {
    throw new SupplierPayableError(400, 'INVALID_SUPPLIER_PAYMENT_NOTES', 'notes must be at most 2000 characters.');
  }
  if (
    payload.idempotencyKey !== undefined &&
    (typeof payload.idempotencyKey !== 'string' || !payload.idempotencyKey.trim() || payload.idempotencyKey.length > 128)
  ) {
    throw new SupplierPayableError(400, 'INVALID_IDEMPOTENCY_KEY', 'idempotencyKey must be 1-128 characters.');
  }
  return {
    amountMinor,
    paymentDate: payload.paymentDate,
    paymentMethod: payload.paymentMethod as PaymentMethod,
    referenceNumber,
    paymentType: payload.paymentType as SupplierPaymentType,
    ...(typeof payload.notes === 'string' && payload.notes.trim() ? { notes: payload.notes.trim() } : {}),
    ...(typeof payload.idempotencyKey === 'string' ? { idempotencyKey: payload.idempotencyKey.trim() } : {}),
  };
}

function requiredReason(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 500) {
    throw new SupplierPayableError(400, 'SUPPLIER_PAYMENT_REASON_REQUIRED', `${label} must be 5-500 characters.`);
  }
  return value.trim();
}

function findPayable(bundle: SupplierSourceBundle, payments: SupplierPaymentRecord[], id: string, includePayments = true): SupplierPayable {
  const payable = allPayables(bundle, payments, includePayments).find((candidate) => candidate.obligationId === id);
  if (!payable) throw new SupplierPayableError(404, 'SUPPLIER_OBLIGATION_NOT_FOUND', 'Supplier obligation not found.');
  if (!payable.bookingServiceId) {
    throw new SupplierPayableError(422, 'SUPPLIER_SERVICE_LINK_MISSING', 'The frozen liability cannot be linked to exactly one Booking service.');
  }
  return payable;
}

export class SupplierPayableService {
  constructor(private readonly storage: SupplierPayableStorageProvider = new FirestoreSupplierPayableStorageProvider()) {}

  async listPayables(actor: SupplierPaymentActor): Promise<{
    obligations: Array<SupplierPayable | SupplierPayableOperationalView>;
    summaries?: SupplierPayableSummary[];
  }> {
    const queryScope = resolveQueryScope(actor, 'SUPPLIER_PAYABLE', 'READ_SUPPLIER_PAYABLE');
    if (queryScope.scope === 'NONE') {
      throw new SupplierPayableError(403, 'ROLE_DENIED', queryScope.deniedReason || 'Supplier payable access denied.');
    }
    const [bundles, payments] = await Promise.all([this.storage.listSourceBundles(), this.storage.listPayments()]);
    const visible: SupplierPayable[] = [];
    for (const bundle of bundles) {
      const decision = authorizeResource(actor, 'SUPPLIER_PAYABLE', 'READ_SUPPLIER_PAYABLE', bookingResourceContext(bundle.booking));
      if (!decision.allowed) continue;
      visible.push(...allPayables(bundle, payments));
    }
    visible.sort((a, b) => (a.dueDate || a.serviceStartDate || '').localeCompare(b.dueDate || b.serviceStartDate || ''));
    if (actor.role === 'Operations') return { obligations: visible.map(operationsProjection) };
    return {
      obligations: visible,
      ...(['Founder', 'Admin', 'Accounts'].includes(actor.role) ? { summaries: summary(visible) } : {}),
    };
  }

  async getBookingSettlement(bookingId: string, actor: SupplierPaymentActor) {
    const [bundles, payments] = await Promise.all([this.storage.listSourceBundles(), this.storage.listPayments()]);
    const bundle = bundles.find((candidate) => candidate.booking.id === bookingId);
    if (!bundle) throw new SupplierPayableError(404, 'BOOKING_PAYABLES_NOT_FOUND', 'Booking supplier obligations not found.');
    authorize(actor, bundle.booking, 'READ_SUPPLIER_PAYABLE');
    const payables = allPayables(bundle, payments);
    if (actor.role === 'Operations') return { obligations: payables.map(operationsProjection) };
    return { obligations: payables, summaries: summary(payables) };
  }

  async getPayable(bookingId: string, id: string, actor: SupplierPaymentActor) {
    const [bundles, payments] = await Promise.all([this.storage.listSourceBundles(), this.storage.listPayments()]);
    const bundle = bundles.find((candidate) => candidate.booking.id === bookingId);
    if (!bundle) throw new SupplierPayableError(404, 'BOOKING_PAYABLES_NOT_FOUND', 'Booking supplier obligations not found.');
    authorize(actor, bundle.booking, 'READ_SUPPLIER_PAYABLE');
    const payable = findPayable(bundle, payments, id);
    return actor.role === 'Operations' ? operationsProjection(payable) : payable;
  }

  async recordPayment(
    bookingId: string,
    id: string,
    input: RecordSupplierPaymentInput | unknown,
    actor: SupplierPaymentActor,
  ) {
    const request = validateRecordInput(input);
    return this.storage.runTransaction(async (transaction) => {
      const bundle = await transaction.getSourceBundle(bookingId);
      if (!bundle) throw new SupplierPayableError(404, 'BOOKING_PAYABLES_NOT_FOUND', 'Booking supplier obligations not found.');
      authorize(actor, bundle.booking, 'RECORD_SUPPLIER_PAYMENT');
      const payments = await transaction.getPaymentsForObligation(id);
      const payable = findPayable(bundle, payments, id);
      if (request.idempotencyKey) {
        const existing = payments.find((payment) => payment.idempotencyKey === request.idempotencyKey);
        if (existing) {
          if (
            existing.amountMinor !== request.amountMinor ||
            existing.paymentMethod !== request.paymentMethod ||
            existing.referenceNumber !== request.referenceNumber ||
            existing.paymentType !== request.paymentType
          ) {
            throw new SupplierPayableError(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'Idempotency key was used with different supplier payment data.');
          }
          return { payment: existing, obligation: payable, isIdempotent: true };
        }
      }
      if (payments.some((payment) =>
        payment.paymentMethod === request.paymentMethod &&
        payment.referenceNumber === request.referenceNumber &&
        (payment.status === 'RECORDED' || payment.status === 'VERIFIED')
      )) {
        throw new SupplierPayableError(409, 'DUPLICATE_SUPPLIER_PAYMENT_REFERENCE', 'This supplier transaction reference already exists for the obligation.');
      }
      const now = new Date().toISOString();
      const payment: SupplierPaymentRecord = {
        id: `SPAY-${randomUUID()}`,
        obligationId: id,
        bookingId,
        bookingReference: payable.bookingReference,
        sourceSnapshotId: payable.sourceSnapshotId,
        sourceServiceId: payable.sourceServiceId,
        bookingServiceId: payable.bookingServiceId!,
        supplierId: payable.supplierId,
        supplierName: payable.supplierName,
        serviceType: payable.serviceType,
        amountMinor: request.amountMinor,
        currency: payable.currency,
        paymentDate: request.paymentDate,
        paymentMethod: request.paymentMethod,
        referenceNumber: request.referenceNumber,
        paymentType: request.paymentType,
        ...(request.notes ? { notes: request.notes } : {}),
        status: 'RECORDED',
        recordedByEmployeeId: actor.employeeId,
        recordedByName: actor.name,
        recordedAt: now,
        ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
        createdAt: now,
        updatedAt: now,
        schemaVersion: 'D4B-1',
      };
      transaction.setPayment(payment.id, payment);
      const event = audit(
        'SUPPLIER_PAYMENT_RECORDED', actor, payment.id, null,
        { bookingId, obligationId: id, supplierId: payment.supplierId, amountMinor: payment.amountMinor, status: payment.status },
        `Supplier payment recorded for ${payable.supplierName}.`, now,
      );
      transaction.setAuditLog(event.id, event);
      return { payment, obligation: findPayable(bundle, [...payments, payment], id) };
    });
  }

  async verifyPayment(bookingId: string, id: string, paymentId: string, actor: SupplierPaymentActor) {
    return this.storage.runTransaction(async (transaction) => {
      const bundle = await transaction.getSourceBundle(bookingId);
      if (!bundle) throw new SupplierPayableError(404, 'BOOKING_PAYABLES_NOT_FOUND', 'Booking supplier obligations not found.');
      authorize(actor, bundle.booking, 'VERIFY_SUPPLIER_PAYMENT');
      const [payment, payments] = await Promise.all([
        transaction.getPayment(paymentId),
        transaction.getPaymentsForObligation(id),
      ]);
      const payable = findPayable(bundle, payments, id);
      if (!payment || payment.bookingId !== bookingId || payment.obligationId !== id) {
        throw new SupplierPayableError(404, 'SUPPLIER_PAYMENT_NOT_FOUND', 'Supplier payment not found for this obligation.');
      }
      if (payment.status === 'VERIFIED') return { payment, obligation: payable, isIdempotent: true };
      if (payment.status !== 'RECORDED') {
        throw new SupplierPayableError(422, 'INVALID_SUPPLIER_PAYMENT_TRANSITION', `Cannot verify a ${payment.status} supplier payment.`);
      }
      if (actor.role === 'Accounts' && payment.recordedByEmployeeId === actor.employeeId) {
        throw new SupplierPayableError(403, 'SELF_VERIFICATION_BLOCKED', 'Accounts users cannot verify their own supplier payment record.');
      }
      const now = new Date().toISOString();
      const updates: Partial<SupplierPaymentRecord> = {
        status: 'VERIFIED',
        verifiedByEmployeeId: actor.employeeId,
        verifiedByName: actor.name,
        verifiedAt: now,
        updatedAt: now,
      };
      transaction.updatePayment(paymentId, updates);
      const updatedPayment = { ...payment, ...updates } as SupplierPaymentRecord;
      const updatedPayments = payments.map((candidate) => candidate.id === paymentId ? updatedPayment : candidate);
      const updatedPayable = findPayable(bundle, updatedPayments, id);
      const event = audit(
        'SUPPLIER_PAYMENT_VERIFIED', actor, paymentId,
        { status: payment.status },
        { status: 'VERIFIED', obligationId: id, amountMinor: payment.amountMinor, outstandingMinor: updatedPayable.outstandingMinor },
        `Supplier payment verified for ${payable.supplierName}.`, now,
      );
      transaction.setAuditLog(event.id, event);
      if (payable.outstandingMinor > 0 && updatedPayable.outstandingMinor === 0) {
        const settled = audit(
          'SUPPLIER_SETTLED', actor, id,
          { outstandingMinor: payable.outstandingMinor },
          { outstandingMinor: 0, overpaidMinor: updatedPayable.overpaidMinor },
          `Frozen supplier obligation settled for ${payable.supplierName}.`, now,
        );
        transaction.setAuditLog(settled.id, settled);
      }
      return { payment: updatedPayment, obligation: updatedPayable };
    });
  }

  async rejectPayment(
    bookingId: string,
    id: string,
    paymentId: string,
    reasonInput: unknown,
    actor: SupplierPaymentActor,
  ) {
    const rejectionReason = requiredReason(reasonInput, 'rejectionReason');
    return this.storage.runTransaction(async (transaction) => {
      const bundle = await transaction.getSourceBundle(bookingId);
      if (!bundle) throw new SupplierPayableError(404, 'BOOKING_PAYABLES_NOT_FOUND', 'Booking supplier obligations not found.');
      authorize(actor, bundle.booking, 'VERIFY_SUPPLIER_PAYMENT');
      const [payment, payments] = await Promise.all([
        transaction.getPayment(paymentId),
        transaction.getPaymentsForObligation(id),
      ]);
      findPayable(bundle, payments, id);
      if (!payment || payment.bookingId !== bookingId || payment.obligationId !== id) {
        throw new SupplierPayableError(404, 'SUPPLIER_PAYMENT_NOT_FOUND', 'Supplier payment not found for this obligation.');
      }
      if (payment.status === 'REJECTED') return { payment, obligation: findPayable(bundle, payments, id), isIdempotent: true };
      if (payment.status !== 'RECORDED') {
        throw new SupplierPayableError(422, 'INVALID_SUPPLIER_PAYMENT_TRANSITION', `Cannot reject a ${payment.status} supplier payment.`);
      }
      const now = new Date().toISOString();
      const updates: Partial<SupplierPaymentRecord> = {
        status: 'REJECTED',
        rejectedByEmployeeId: actor.employeeId,
        rejectedByName: actor.name,
        rejectedAt: now,
        rejectionReason,
        updatedAt: now,
      };
      transaction.updatePayment(paymentId, updates);
      const updatedPayment = { ...payment, ...updates } as SupplierPaymentRecord;
      const event = audit(
        'SUPPLIER_PAYMENT_REJECTED', actor, paymentId,
        { status: payment.status }, { status: 'REJECTED', obligationId: id }, rejectionReason, now,
      );
      transaction.setAuditLog(event.id, event);
      return {
        payment: updatedPayment,
        obligation: findPayable(bundle, payments.map((item) => item.id === paymentId ? updatedPayment : item), id),
      };
    });
  }

  async voidPayment(
    bookingId: string,
    id: string,
    paymentId: string,
    reasonInput: unknown,
    actor: SupplierPaymentActor,
  ) {
    const voidReason = requiredReason(reasonInput, 'voidReason');
    return this.storage.runTransaction(async (transaction) => {
      const bundle = await transaction.getSourceBundle(bookingId);
      if (!bundle) throw new SupplierPayableError(404, 'BOOKING_PAYABLES_NOT_FOUND', 'Booking supplier obligations not found.');
      authorize(actor, bundle.booking, 'VOID_SUPPLIER_PAYMENT');
      const [payment, payments] = await Promise.all([
        transaction.getPayment(paymentId),
        transaction.getPaymentsForObligation(id),
      ]);
      findPayable(bundle, payments, id);
      if (!payment || payment.bookingId !== bookingId || payment.obligationId !== id) {
        throw new SupplierPayableError(404, 'SUPPLIER_PAYMENT_NOT_FOUND', 'Supplier payment not found for this obligation.');
      }
      if (payment.status === 'VOIDED') return { payment, obligation: findPayable(bundle, payments, id), isIdempotent: true };
      if (payment.status !== 'VERIFIED') {
        throw new SupplierPayableError(422, 'INVALID_SUPPLIER_PAYMENT_TRANSITION', `Cannot void a ${payment.status} supplier payment.`);
      }
      const now = new Date().toISOString();
      const updates: Partial<SupplierPaymentRecord> = {
        status: 'VOIDED',
        voidedByEmployeeId: actor.employeeId,
        voidedByName: actor.name,
        voidedAt: now,
        voidReason,
        updatedAt: now,
      };
      transaction.updatePayment(paymentId, updates);
      const updatedPayment = { ...payment, ...updates } as SupplierPaymentRecord;
      const updatedPayments = payments.map((item) => item.id === paymentId ? updatedPayment : item);
      const updatedPayable = findPayable(bundle, updatedPayments, id);
      const event = audit(
        'SUPPLIER_PAYMENT_VOIDED', actor, paymentId,
        { status: payment.status },
        { status: 'VOIDED', obligationId: id, outstandingMinor: updatedPayable.outstandingMinor },
        voidReason, now,
      );
      transaction.setAuditLog(event.id, event);
      return { payment: updatedPayment, obligation: updatedPayable };
    });
  }
}

export class InMemorySupplierPayableStorageProvider implements SupplierPayableStorageProvider {
  private readonly bundles = new Map<string, SupplierSourceBundle>();
  private readonly payments = new Map<string, SupplierPaymentRecord>();
  private readonly audits = new Map<string, AuditLog>();
  private mutationCount = 0;

  constructor(initial?: { bundles?: SupplierSourceBundle[]; payments?: SupplierPaymentRecord[] }) {
    for (const bundle of initial?.bundles || []) this.bundles.set(bundle.booking.id, clone(bundle));
    for (const payment of initial?.payments || []) this.payments.set(payment.id, clone(payment));
  }

  async listSourceBundles() { return [...this.bundles.values()].map(clone); }
  async listPayments() { return [...this.payments.values()].map(clone); }

  async runTransaction<T>(operation: (transaction: SupplierPayableTransaction) => Promise<T>): Promise<T> {
    const paymentSnapshot = new Map([...this.payments].map(([id, payment]) => [id, clone(payment)]));
    const stagedSets = new Map<string, SupplierPaymentRecord>();
    const stagedUpdates = new Map<string, Partial<SupplierPaymentRecord>>();
    const stagedAudits = new Map<string, AuditLog>();
    const transaction: SupplierPayableTransaction = {
      getSourceBundle: async (bookingId) => {
        const bundle = this.bundles.get(bookingId);
        return bundle ? clone(bundle) : null;
      },
      getPayment: async (paymentId) => {
        const payment = paymentSnapshot.get(paymentId);
        return payment ? clone(payment) : null;
      },
      getPaymentsForObligation: async (id) => [...paymentSnapshot.values()]
        .filter((payment) => payment.obligationId === id).map(clone),
      setPayment: (paymentId, payment) => stagedSets.set(paymentId, clone(payment)),
      updatePayment: (paymentId, updates) => stagedUpdates.set(paymentId, clone(updates)),
      setAuditLog: (auditId, event) => stagedAudits.set(auditId, clone(event)),
    };
    const result = await operation(transaction);
    for (const [id, payment] of stagedSets) this.payments.set(id, payment);
    for (const [id, updates] of stagedUpdates) {
      const current = this.payments.get(id);
      if (current) this.payments.set(id, { ...current, ...updates });
    }
    for (const [id, event] of stagedAudits) this.audits.set(id, event);
    this.mutationCount += stagedSets.size + stagedUpdates.size + stagedAudits.size;
    return result;
  }

  getMutationCount() { return this.mutationCount; }
  getPayments() { return [...this.payments.values()].map(clone); }
  getAudits() { return [...this.audits.values()].map(clone); }
}

export class FirestoreSupplierPayableStorageProvider implements SupplierPayableStorageProvider {
  private db() { return getAdminDb(); }

  async listSourceBundles(): Promise<SupplierSourceBundle[]> {
    const db = this.db();
    const [bookings, snapshots, accommodations, transports, activities] = await Promise.all([
      db.collection('bookings').orderBy('createdAt', 'desc').limit(200).get(),
      db.collectionGroup('financial_snapshot').limit(500).get(),
      db.collection('booking_accommodations').limit(1000).get(),
      db.collection('booking_transports').limit(1000).get(),
      db.collection('booking_activities').limit(1000).get(),
    ]);
    const latest = new Map<string, FinancialSnapshot>();
    for (const document of snapshots.docs) {
      const snapshot = { ...document.data(), id: document.id } as FinancialSnapshot;
      const existing = latest.get(snapshot.bookingId);
      if (!existing || snapshot.snapshotVersion > existing.snapshotVersion) latest.set(snapshot.bookingId, snapshot);
    }
    const accommodationData = accommodations.docs.map((document) => ({ ...document.data(), id: document.id } as BookingAccommodation));
    const transportData = transports.docs.map((document) => ({ ...document.data(), id: document.id } as BookingTransport));
    const activityData = activities.docs.map((document) => ({ ...document.data(), id: document.id } as BookingActivity));
    return bookings.docs.flatMap((document) => {
      const booking = { ...document.data(), id: document.id } as Booking;
      const snapshot = latest.get(booking.id);
      if (!snapshot) return [];
      return [{
        booking,
        snapshot,
        accommodations: accommodationData.filter((service) => service.bookingId === booking.id),
        transports: transportData.filter((service) => service.bookingId === booking.id),
        activities: activityData.filter((service) => service.bookingId === booking.id),
      }];
    });
  }

  async listPayments(): Promise<SupplierPaymentRecord[]> {
    const snapshot = await this.db().collection('supplier_payments').limit(2000).get();
    return snapshot.docs.map((document) => ({ ...document.data(), id: document.id } as SupplierPaymentRecord));
  }

  async runTransaction<T>(operation: (transaction: SupplierPayableTransaction) => Promise<T>): Promise<T> {
    const db = this.db();
    return db.runTransaction(async (firestoreTransaction) => {
      const transaction: SupplierPayableTransaction = {
        getSourceBundle: async (bookingId) => {
          const bookingRef = db.collection('bookings').doc(bookingId);
          const snapshotQuery = bookingRef.collection('financial_snapshot').orderBy('snapshotVersion', 'desc').limit(1);
          const accommodationQuery = db.collection('booking_accommodations').where('bookingId', '==', bookingId);
          const transportQuery = db.collection('booking_transports').where('bookingId', '==', bookingId);
          const activityQuery = db.collection('booking_activities').where('bookingId', '==', bookingId);
          const [booking, snapshots, accommodations, transports, activities] = await Promise.all([
            firestoreTransaction.get(bookingRef),
            firestoreTransaction.get(snapshotQuery),
            firestoreTransaction.get(accommodationQuery),
            firestoreTransaction.get(transportQuery),
            firestoreTransaction.get(activityQuery),
          ]);
          if (!booking.exists || snapshots.empty) return null;
          return {
            booking: { ...booking.data(), id: booking.id } as Booking,
            snapshot: { ...snapshots.docs[0].data(), id: snapshots.docs[0].id } as FinancialSnapshot,
            accommodations: accommodations.docs.map((document) => ({ ...document.data(), id: document.id } as BookingAccommodation)),
            transports: transports.docs.map((document) => ({ ...document.data(), id: document.id } as BookingTransport)),
            activities: activities.docs.map((document) => ({ ...document.data(), id: document.id } as BookingActivity)),
          };
        },
        getPayment: async (paymentId) => {
          const document = await firestoreTransaction.get(db.collection('supplier_payments').doc(paymentId));
          return document.exists ? { ...document.data(), id: document.id } as SupplierPaymentRecord : null;
        },
        getPaymentsForObligation: async (id) => {
          const snapshot = await firestoreTransaction.get(
            db.collection('supplier_payments').where('obligationId', '==', id),
          );
          return snapshot.docs.map((document) => ({ ...document.data(), id: document.id } as SupplierPaymentRecord));
        },
        setPayment: (paymentId, payment) => {
          firestoreTransaction.set(db.collection('supplier_payments').doc(paymentId), payment as DocumentData);
        },
        updatePayment: (paymentId, updates) => {
          firestoreTransaction.update(db.collection('supplier_payments').doc(paymentId), updates as DocumentData);
        },
        setAuditLog: (auditId, event) => {
          firestoreTransaction.set(db.collection('audit_logs').doc(auditId), event);
        },
      };
      return operation(transaction);
    });
  }
}
