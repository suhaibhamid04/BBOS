import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  AuditLog,
  CustomerPackageDocument,
  CustomerDeliveryChannel,
  CustomerDeliveryPreparation,
  CustomerQuoteComparison,
  CustomerShareCreateResult,
  CustomerShareExpiryDays,
  CustomerShareHistoryItem,
  CustomerSharePublicView,
  CustomerShareStatus,
  Quote,
  QuoteOptionStatus,
  QuoteShareChannel,
  QuoteStatus,
  QuoteVersion,
} from '../../src/types/index.js';
import { buildCustomerPackageProjection } from '../../src/services/quote/customerPackage.js';
import { buildCustomerSharePublicView } from '../../src/services/quote/customerShareProjection.js';
import { buildCustomerDeliveryPreparation } from '../../src/services/quote/customerShareDelivery.js';
import { buildCustomerSharePdf, customerSharePdfFilename } from '../../src/services/quote/customerSharePdf.js';
import {
  FirestoreConversionStorageProvider,
  type ConversionStorageProvider,
  type ConversionTransaction,
} from '../../src/services/conversion/conversionStorageProvider.js';
import { assertAuthorizedResource, ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { quoteResourceContext, tripResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';
import { isTripCostingFresh } from '../../src/utils/costingFreshness.js';
import { assessLowMarginPolicy, isLowMarginApprovalCurrent } from '../../src/utils/packageCommercials.js';
import {
  BOOKING_BRIDGE_POLICY_VERSION,
  STANDARD_CUSTOMER_POLICY_PRESET,
  type PaymentScheduleMilestone,
} from '../../src/policies/bookingBridgePolicy.js';

type UnknownRecord = Record<string, any>;

interface CustomerShareRecord {
  id: string;
  quoteGroupId: string;
  leadId?: string;
  customerId?: string;
  tripId?: string;
  version: number;
  quoteVersions: Array<{ quoteId: string; version: number }>;
  tokenHash: string;
  status: CustomerShareStatus;
  createdByEmployeeId: string;
  createdByName: string;
  salesEmployeeId: string;
  salesTeamId?: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  revokedByEmployeeId?: string;
  firstViewedAt?: string;
  lastViewedAt?: string;
  viewCount: number;
  pdfGeneratedCount?: number;
  whatsappPreparedCount?: number;
  emailPreparedCount?: number;
  lastPdfGeneratedAt?: string;
  lastWhatsappPreparedAt?: string;
  lastEmailPreparedAt?: string;
  snapshot: CustomerSharePublicView;
}

const CUSTOMER_SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CUSTOMER_SHARE_EXPIRY_DAYS = new Set<CustomerShareExpiryDays>([7, 14, 30]);

function hashCustomerShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function effectiveCustomerShareStatus(record: CustomerShareRecord, now: string): CustomerShareStatus {
  if (record.status === 'REVOKED') return 'REVOKED';
  if (record.expiresAt && record.expiresAt <= now) return 'EXPIRED';
  return 'ACTIVE';
}

function customerShareHistory(record: CustomerShareRecord, now = new Date().toISOString()): CustomerShareHistoryItem {
  return {
    shareId: record.id,
    quoteGroupId: record.quoteGroupId,
    version: record.version,
    status: effectiveCustomerShareStatus(record, now),
    createdByName: record.createdByName,
    createdAt: record.createdAt,
    ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
    ...(record.firstViewedAt ? { firstViewedAt: record.firstViewedAt } : {}),
    ...(record.lastViewedAt ? { lastViewedAt: record.lastViewedAt } : {}),
    viewCount: record.viewCount || 0,
    ...(record.pdfGeneratedCount ? { pdfGeneratedCount: record.pdfGeneratedCount } : {}),
    ...(record.whatsappPreparedCount ? { whatsappPreparedCount: record.whatsappPreparedCount } : {}),
    ...(record.emailPreparedCount ? { emailPreparedCount: record.emailPreparedCount } : {}),
    ...(record.lastPdfGeneratedAt ? { lastPdfGeneratedAt: record.lastPdfGeneratedAt } : {}),
    ...(record.lastWhatsappPreparedAt ? { lastWhatsappPreparedAt: record.lastWhatsappPreparedAt } : {}),
    ...(record.lastEmailPreparedAt ? { lastEmailPreparedAt: record.lastEmailPreparedAt } : {}),
  };
}

function assertCustomerShareActor(actor: QuoteMutationActor): void {
  if (!['Founder', 'Admin', 'Sales Manager', 'Sales Executive'].includes(actor.role)) {
    throw new QuoteDomainError(403, 'RESOURCE_ACCESS_DENIED', 'This role cannot manage customer shares.');
  }
}

export interface QuoteMutationActor extends AuthorizationPrincipal {
  name: string;
  email?: string;
  isDemo?: boolean;
}

export class QuoteDomainError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'QuoteDomainError';
  }
}

const CREATE_FIELDS = new Set([
  'leadId', 'customerId', 'customerName', 'customerPhone', 'customerEmail',
  'destination', 'tripId', 'hotels', 'transports', 'activities', 'travelerCount',
  'adults', 'children', 'packageId', 'packageName', 'durationDays', 'durationNights',
  'totalAmount', 'discountAmount', 'validUntil', 'notes', 'internalNotes',
  'inclusions', 'exclusions', 'termsAndConditions', 'backupAccommodations',
  'paymentSchedule',
  'optionLabel', 'customerTitle',
]);

const UPDATE_FIELDS = new Set([...CREATE_FIELDS, 'status']);

const SERVER_CONTROLLED_FIELDS = new Set([
  'id', 'salesEmployeeId', 'salesEmployeeName', 'salesTeamId', 'createdByEmployeeId',
  'updatedByEmployeeId', 'createdAt', 'updatedAt', 'version', 'versionHistory',
  'totalSupplierCost', 'grossProfit', 'grossMargin', 'profit', 'finalAmount',
  'supplierCostSource', 'requiresLowMarginApproval', 'approval', 'convertedBookingId',
  'supplierCostBreakdown', 'pricingMode', 'pricingInput',
  'convertedAt', 'convertedBy', 'isDemo',
  'sharedAt', 'sharedByEmployeeId', 'shareChannel',
  'customerPackageSnapshot',
  'policyVersion',
  'quoteGroupId', 'optionId', 'optionOrder', 'isRecommended', 'optionStatus',
  'optionSnapshotCreatedAt',
]);

const NESTED_FINANCIAL_FIELDS = new Set([
  'supplierCost', 'totalSupplierCost', 'grossProfit', 'grossMargin', 'profit',
  'internalCost', 'supplierPayment', 'quotedRate',
]);

const HOTEL_FIELDS = new Set([
  'id', 'sourceTripItemId', 'hotelId', 'hotelName', 'propertyId', 'roomCategoryId', 'ratePeriodId',
  'negotiatedRateId', 'roomType', 'mealPlan', 'checkInDate', 'checkOutDate', 'nights',
  'roomsCount', 'rooms', 'adultsCount', 'childrenCount', 'rate',
  'isFoc', 'focReason', 'guestNames', 'specialRequests',
]);

const TRANSPORT_FIELDS = new Set([
  'id', 'sourceTripItemId', 'transportId', 'vehicleCategoryId', 'transportRouteId', 'ratePeriodId',
  'vehicleType', 'route', 'serviceDate', 'days', 'passengerCount', 'pickupLocation',
  'dropoffLocation', 'rate', 'isFoc', 'focReason', 'specialRequests',
  'vehicleCount', 'chargeableDays', 'serviceDays', 'costSource', 'packageSupplierRate', 'originalContractedTotal',
]);

const ACTIVITY_FIELDS = new Set([
  'id', 'sourceTripItemId', 'activityId', 'activityMasterId', 'activityRatePeriodId', 'name',
  'activityName', 'destinationId', 'destinationName', 'serviceDate', 'date', 'pax',
  'rate', 'isFoc', 'focReason', 'specialRequests', 'pricingModel', 'inclusionStatus',
  'costSource', 'packageSupplierRate', 'originalContractedTotal',
]);

const BACKUP_ACCOMMODATION_FIELDS = new Set([
  'sourceTripItemId', 'propertyId', 'roomCategoryId', 'ratePeriodId', 'mealPlan',
]);

const STATUS_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  DRAFT: ['DRAFT', 'PENDING_APPROVAL', 'SENT'],
  PENDING_APPROVAL: ['PENDING_APPROVAL', 'DRAFT', 'SENT'],
  SENT: ['SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED'],
  VIEWED: ['VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: ['ACCEPTED'],
  REJECTED: ['REJECTED'],
  EXPIRED: ['EXPIRED'],
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown): UnknownRecord {
  if (!isRecord(value)) throw new QuoteDomainError(400, 'INVALID_QUOTE_PAYLOAD', 'Quote payload must be an object.');
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new QuoteDomainError(400, 'INVALID_QUOTE_FIELD', `${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new QuoteDomainError(400, 'INVALID_QUOTE_FIELD', `${field} must be a string.`);
  }
  return value;
}

function optionalIsoDate(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new QuoteDomainError(400, 'INVALID_QUOTE_FIELD', `${field} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new QuoteDomainError(400, 'INVALID_QUOTE_FIELD', `${field} must be a valid calendar date.`);
  }
  return value;
}

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new QuoteDomainError(400, 'INVALID_FINANCIAL_VALUE', `${field} must be a finite, non-negative number.`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string, required = false): number | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new QuoteDomainError(400, 'INVALID_QUOTE_FIELD', `${field} must be a positive integer.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new QuoteDomainError(400, 'INVALID_QUOTE_FIELD', `${field} must be a non-negative integer.`);
  }
  return value;
}

function assertNoControlledFields(value: unknown, path = 'quote'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoControlledFields(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    const isRootField = path === 'quote';
    if ((isRootField && SERVER_CONTROLLED_FIELDS.has(key)) || NESTED_FINANCIAL_FIELDS.has(key)) {
      throw new QuoteDomainError(
        400,
        'SERVER_CONTROLLED_FIELD',
        `${path}.${key} is server-controlled and cannot be submitted by the client.`,
      );
    }
    assertNoControlledFields(nested, `${path}.${key}`);
  }
}

function sanitizeStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new QuoteDomainError(400, 'INVALID_QUOTE_FIELD', `${field} must be an array of strings.`);
  }
  return value.map(item => item.trim()).filter(Boolean);
}

function sanitizePaymentSchedule(value: unknown): PaymentScheduleMilestone[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new QuoteDomainError(400, 'INVALID_PAYMENT_SCHEDULE', 'paymentSchedule must contain at least one milestone.');
  }
  const schedule = value.map((raw, index) => {
    if (!isRecord(raw)) throw new QuoteDomainError(400, 'INVALID_PAYMENT_SCHEDULE', `paymentSchedule[${index}] must be an object.`);
    const unsupported = Object.keys(raw).find(key => !['percentage', 'timing', 'label', 'dueDate'].includes(key));
    if (unsupported) throw new QuoteDomainError(400, 'INVALID_PAYMENT_SCHEDULE', `paymentSchedule[${index}].${unsupported} is not accepted.`);
    const percentage = finiteNonNegative(raw.percentage, `paymentSchedule[${index}].percentage`);
    if (percentage <= 0 || percentage > 100) throw new QuoteDomainError(400, 'INVALID_PAYMENT_SCHEDULE', `paymentSchedule[${index}].percentage must be greater than 0 and at most 100.`);
    if (!['AT_BOOKING', 'BEFORE_DEPARTURE', 'CUSTOM'].includes(String(raw.timing))) {
      throw new QuoteDomainError(400, 'INVALID_PAYMENT_SCHEDULE', `paymentSchedule[${index}].timing is invalid.`);
    }
    const label = requireNonEmptyString(raw.label, `paymentSchedule[${index}].label`);
    const dueDate = optionalIsoDate(raw.dueDate, `paymentSchedule[${index}].dueDate`);
    return { percentage, timing: raw.timing as PaymentScheduleMilestone['timing'], label, ...(dueDate ? { dueDate } : {}) };
  });
  const total = Math.round(schedule.reduce((sum, item) => sum + item.percentage, 0) * 100) / 100;
  if (total !== 100) throw new QuoteDomainError(400, 'INVALID_PAYMENT_SCHEDULE', 'paymentSchedule percentages must total 100.');
  return schedule;
}

function sanitizeItems(value: unknown, field: string, allowed: Set<string>): UnknownRecord[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new QuoteDomainError(400, 'INVALID_QUOTE_FIELD', `${field} must be an array.`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new QuoteDomainError(400, 'INVALID_QUOTE_FIELD', `${field}[${index}] must be an object.`);
    }
    const sanitized: UnknownRecord = {};
    for (const [key, nested] of Object.entries(item)) {
      if (!allowed.has(key)) {
        throw new QuoteDomainError(400, 'UNKNOWN_QUOTE_FIELD', `${field}[${index}].${key} is not accepted.`);
      }
      if (['rate', 'quotedRate'].includes(key) && nested !== undefined) finiteNonNegative(nested, `${field}[${index}].${key}`);
      sanitized[key] = nested;
    }
    return sanitized;
  });
}

function sanitizeInput(value: unknown, mode: 'CREATE' | 'UPDATE'): UnknownRecord {
  const input = requireRecord(value);
  assertNoControlledFields(input);
  const allowed = mode === 'CREATE' ? CREATE_FIELDS : UPDATE_FIELDS;
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) {
      throw new QuoteDomainError(400, 'UNKNOWN_QUOTE_FIELD', `${field} is not accepted for Quote ${mode.toLowerCase()}.`);
    }
  }

  const output: UnknownRecord = {};
  const stringFields = [
    'leadId', 'customerId', 'customerName', 'customerPhone', 'customerEmail', 'destination',
    'tripId', 'packageId', 'packageName', 'notes', 'internalNotes',
    'termsAndConditions', 'optionLabel', 'customerTitle',
  ];
  for (const field of stringFields) {
    const normalized = optionalString(input[field], field);
    if (normalized !== undefined) output[field] = normalized;
  }
  const validUntil = optionalIsoDate(input.validUntil, 'validUntil');
  if (validUntil !== undefined) output.validUntil = validUntil;

  for (const field of ['travelerCount', 'adults', 'durationDays', 'durationNights']) {
    const normalized = positiveInteger(input[field], field);
    if (normalized !== undefined) output[field] = normalized;
  }
  const children = nonNegativeInteger(input.children, 'children');
  if (children !== undefined) output.children = children;

  if (input.totalAmount !== undefined) output.totalAmount = finiteNonNegative(input.totalAmount, 'totalAmount');
  if (input.discountAmount !== undefined) output.discountAmount = finiteNonNegative(input.discountAmount, 'discountAmount');

  const inclusions = sanitizeStringArray(input.inclusions, 'inclusions');
  const exclusions = sanitizeStringArray(input.exclusions, 'exclusions');
  if (inclusions !== undefined) output.inclusions = inclusions;
  if (exclusions !== undefined) output.exclusions = exclusions;
  const paymentSchedule = sanitizePaymentSchedule(input.paymentSchedule);
  if (paymentSchedule !== undefined) output.paymentSchedule = paymentSchedule;

  const hotels = sanitizeItems(input.hotels, 'hotels', HOTEL_FIELDS);
  const transports = sanitizeItems(input.transports, 'transports', TRANSPORT_FIELDS);
  const activities = sanitizeItems(input.activities, 'activities', ACTIVITY_FIELDS);
  const backupAccommodations = sanitizeItems(
    input.backupAccommodations,
    'backupAccommodations',
    BACKUP_ACCOMMODATION_FIELDS,
  );
  if (hotels !== undefined) output.hotels = hotels;
  if (transports !== undefined) output.transports = transports;
  if (activities !== undefined) output.activities = activities;
  if (backupAccommodations !== undefined) output.backupAccommodations = backupAccommodations;

  if (mode === 'UPDATE' && input.status !== undefined) {
    if (typeof input.status !== 'string' || !Object.prototype.hasOwnProperty.call(STATUS_TRANSITIONS, input.status)) {
      throw new QuoteDomainError(400, 'INVALID_QUOTE_STATUS', 'Quote status is not recognized.');
    }
    output.status = input.status;
  }
  return output;
}

function validateRequiredCreateFields(input: UnknownRecord): void {
  for (const field of ['leadId', 'customerId', 'customerName', 'destination', 'validUntil']) {
    input[field] = requireNonEmptyString(input[field], field);
  }
  input.travelerCount = positiveInteger(input.travelerCount, 'travelerCount', true);
  input.totalAmount = finiteNonNegative(input.totalAmount, 'totalAmount');
  input.discountAmount = finiteNonNegative(input.discountAmount ?? 0, 'discountAmount');
}

function calculateFinancials(totalAmount: number, discountAmount: number, supplierCost?: number): UnknownRecord {
  if (discountAmount > totalAmount) {
    throw new QuoteDomainError(400, 'INVALID_FINANCIAL_VALUE', 'discountAmount cannot exceed totalAmount.');
  }
  const finalAmount = totalAmount - discountAmount;
  if (supplierCost === undefined) return { totalAmount, discountAmount, finalAmount };

  const grossProfit = finalAmount - supplierCost;
  if (grossProfit < 0) {
    throw new QuoteDomainError(
      422,
      'NEGATIVE_MARGIN_NOT_ALLOWED',
      'The proposed selling price cannot be lower than authoritative supplier cost.',
    );
  }
  const grossMargin = finalAmount > 0
    ? Number(((grossProfit / finalAmount) * 100).toFixed(1))
    : 0;
  return { totalAmount, discountAmount, finalAmount, totalSupplierCost: supplierCost, grossProfit, grossMargin };
}

function versionSnapshot(quote: Quote, actor: QuoteMutationActor): QuoteVersion {
  return {
    version: quote.version || 1,
    updatedAt: quote.updatedAt || quote.createdAt,
    updatedBy: quote.updatedByEmployeeId || quote.createdByEmployeeId || quote.salesEmployeeId || actor.employeeId,
    totalAmount: quote.totalAmount,
    discountAmount: quote.discountAmount,
    finalAmount: quote.finalAmount,
    status: quote.status,
    hotels: quote.hotels,
    transports: quote.transports,
    activities: quote.activities,
    backupAccommodations: quote.backupAccommodations,
    totalSupplierCost: quote.totalSupplierCost,
    grossProfit: quote.grossProfit,
    grossMargin: quote.grossMargin,
    supplierCostBreakdown: quote.supplierCostBreakdown,
    pricingMode: quote.pricingMode,
    pricingInput: quote.pricingInput,
    ...(quote.sharedAt ? { sharedAt: quote.sharedAt } : {}),
    ...(quote.sharedByEmployeeId ? { sharedByEmployeeId: quote.sharedByEmployeeId } : {}),
    ...(quote.shareChannel ? { shareChannel: quote.shareChannel } : {}),
    ...(quote.customerPackageSnapshot ? { customerPackageSnapshot: quote.customerPackageSnapshot } : {}),
    ...(quote.notes !== undefined ? { notes: quote.notes } : {}),
    ...(quote.inclusions !== undefined ? { inclusions: quote.inclusions } : {}),
    ...(quote.exclusions !== undefined ? { exclusions: quote.exclusions } : {}),
    ...(quote.termsAndConditions !== undefined ? { termsAndConditions: quote.termsAndConditions } : {}),
    ...(quote.policyVersion !== undefined ? { policyVersion: quote.policyVersion } : {}),
    ...(quote.paymentSchedule !== undefined ? { paymentSchedule: quote.paymentSchedule } : {}),
  };
}

function assertTripCostingFresh(trip: UnknownRecord, operation: string): void {
  if (!isTripCostingFresh(trip)) {
    throw new QuoteDomainError(
      409,
      'TRIP_COSTING_PENDING',
      `Package pricing needs updating before you can ${operation}.`,
      { updateCostsRequired: true, packageReviewRequired: trip.packageReview?.required === true },
    );
  }
}

function auditEvent(
  action: string,
  quoteId: string,
  actor: QuoteMutationActor,
  before: UnknownRecord | null,
  after: UnknownRecord,
  now: string,
): AuditLog {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    actorType: 'HUMAN',
    actorId: actor.employeeId,
    actorName: `${actor.name} (${actor.role})`,
    action,
    entityType: 'QUOTE',
    entityId: quoteId,
    before,
    after,
    reason: action === 'QUOTE_CREATED'
      ? 'Server-authoritative Quote created.'
      : action === 'QUOTE_SHARED'
        ? 'Customer-safe package shared from the authoritative Quote.'
        : 'Server-authoritative Quote revision saved.',
  };
}

async function buildStoredCustomerPackage(
  tx: ConversionTransaction,
  quote: Quote,
  generatedAt: string,
  requireReviewedItinerary = false,
): Promise<CustomerPackageDocument> {
  if (quote.customerPackageSnapshot && (quote.sharedAt || quote.optionId)) {
    return quote.customerPackageSnapshot;
  }
  if (quote.sharedAt) {
    // Compatibility for Quotes shared before immutable package snapshots were
    // introduced. Use Quote-owned fields only; never rehydrate from a changed Trip.
    return buildCustomerPackageProjection(quote, [], null, quote.sharedAt);
  }
  if (!quote.tripId) {
    throw new QuoteDomainError(422, 'TRIP_LINK_REQUIRED', 'A customer package requires a persisted Trip-linked Quote.');
  }
  if (!Number.isFinite(quote.finalAmount) || quote.finalAmount <= 0) {
    throw new QuoteDomainError(422, 'QUOTE_SELLING_PRICE_REQUIRED', 'Set and save a positive package selling price before sharing.');
  }
  if (!Number.isFinite(quote.totalSupplierCost)) {
    throw new QuoteDomainError(422, 'QUOTE_FINANCIALS_INCOMPLETE', 'The Quote must contain authoritative costing before sharing.');
  }
  const trip = await tx.get('trips', quote.tripId);
  if (!trip) throw new QuoteDomainError(404, 'TRIP_NOT_FOUND', 'The Quote Trip no longer exists.');
  assertTripCostingFresh(trip, 'preview or share this Quote');
  const sourceRevision = quote.supplierCostSource?.costingRevision;
  const tripRevision = Number(trip.costingRevision || 0);
  const staleSource = sourceRevision !== undefined
    ? sourceRevision !== tripRevision
    : Boolean(quote.supplierCostSource?.asOf && trip.updatedAt && quote.supplierCostSource.asOf !== trip.updatedAt);
  if (staleSource) {
    throw new QuoteDomainError(409, 'QUOTE_TRIP_VERSION_STALE', 'Save a new Quote revision after the latest Trip changes before sharing.');
  }
  const days = await tx.findByField('itinerary_days', 'tripId', quote.tripId, 60);
  if (requireReviewedItinerary && days.some(day => day.customerContent?.status === 'REVIEW_NEEDED')) {
    throw new QuoteDomainError(
      409,
      'ITINERARY_REVIEW_REQUIRED',
      'Review the updated customer itinerary before sharing this Quote.',
      { itineraryReviewRequired: true },
    );
  }
  try {
    return buildCustomerPackageProjection(quote, days, trip, generatedAt);
  } catch (error) {
    throw new QuoteDomainError(422, 'INVALID_ITINERARY_ORDER', error instanceof Error ? error.message : 'The itinerary day order is invalid.');
  }
}

async function assertCustomerShareGroupReady(
  tx: ConversionTransaction,
  group: Quote[],
  actor: QuoteMutationActor,
): Promise<void> {
  assertCustomerShareActor(actor);
  if (!group.length) throw new QuoteDomainError(404, 'QUOTE_GROUP_NOT_FOUND', 'Quote option group not found.');
  const recommendedCount = group.filter(option => option.isRecommended === true).length;
  if (recommendedCount !== 1) {
    throw new QuoteDomainError(409, 'QUOTE_GROUP_RECOMMENDATION_INVALID', 'Choose exactly one recommended option before sharing.');
  }

  const checkedTrips = new Map<string, UnknownRecord>();
  for (const option of group) {
    try {
      assertAuthorizedResource(actor, 'QUOTE', 'READ_DETAIL', quoteResourceContext(option));
    } catch (error) {
      translateAuthorizationError(error);
    }
    if (!option.optionId || !option.customerPackageSnapshot) {
      throw new QuoteDomainError(409, 'QUOTE_OPTION_SNAPSHOT_REQUIRED', 'Every shared option must have a frozen customer snapshot.');
    }
    if (['ACCEPTED', 'SUPERSEDED', 'DECLINED'].includes(option.optionStatus || '')) {
      throw new QuoteDomainError(409, 'QUOTE_SHARE_WORKFLOW_DENIED', 'Accepted, superseded, or declined options cannot enter a new customer share.');
    }
    if (option.approval?.required === true && !isLowMarginApprovalCurrent(option.approval, option)) {
      throw new QuoteDomainError(409, 'COMMERCIAL_APPROVAL_REQUIRED', 'Commercial approval is required before sharing this package.');
    }
    if (!option.tripId) throw new QuoteDomainError(422, 'TRIP_LINK_REQUIRED', 'Every shared option must be linked to its authoritative Trip.');

    let trip = checkedTrips.get(option.tripId);
    if (!trip) {
      trip = await tx.get('trips', option.tripId) as UnknownRecord | null || undefined;
      if (!trip) throw new QuoteDomainError(404, 'TRIP_NOT_FOUND', 'The Quote Trip no longer exists.');
      assertTripCostingFresh(trip, 'create a customer link');
      const days = await tx.findByField('itinerary_days', 'tripId', option.tripId, 60) as UnknownRecord[];
      if (days.some(day => day.customerContent?.status === 'REVIEW_NEEDED')) {
        throw new QuoteDomainError(409, 'ITINERARY_REVIEW_REQUIRED', 'Review the updated customer itinerary before sharing this package.');
      }
      checkedTrips.set(option.tripId, trip);
    }
    const sourceRevision = option.supplierCostSource?.costingRevision;
    const tripRevision = Number(trip.costingRevision || 0);
    const sourceIsStale = sourceRevision !== undefined
      ? sourceRevision !== tripRevision
      : Boolean(option.supplierCostSource?.asOf && trip.updatedAt && option.supplierCostSource.asOf !== trip.updatedAt);
    if (sourceIsStale) {
      throw new QuoteDomainError(409, 'QUOTE_TRIP_VERSION_STALE', 'Refresh every option from the current reviewed Package before creating a new customer link.');
    }
  }
}

function requireOptionLabel(value: unknown, field = 'optionLabel'): string {
  const label = requireNonEmptyString(value, field);
  if (label.length > 80) throw new QuoteDomainError(400, 'INVALID_OPTION_LABEL', `${field} must be 80 characters or fewer.`);
  return label;
}

function optionStatusForQuote(status: QuoteStatus): QuoteOptionStatus {
  if (status === 'SENT' || status === 'VIEWED') return 'SHARED';
  if (status === 'ACCEPTED') return 'ACCEPTED';
  if (status === 'REJECTED' || status === 'EXPIRED') return 'DECLINED';
  return 'READY';
}

function customerComparison(groupId: string, quotes: Quote[]): CustomerQuoteComparison {
  const options = quotes
    .filter(quote => quote.optionId && quote.customerPackageSnapshot)
    .sort((left, right) => (left.optionOrder || 0) - (right.optionOrder || 0))
    .map(quote => {
      const customerPackage = quote.customerPackageSnapshot!;
      return {
        optionId: quote.optionId!,
        quoteId: quote.id,
        label: quote.optionLabel || 'Package option',
        ...(quote.customerTitle ? { customerTitle: quote.customerTitle } : {}),
        order: quote.optionOrder || 0,
        recommended: quote.isRecommended === true,
        status: quote.optionStatus || optionStatusForQuote(quote.status),
        packageSellingPrice: customerPackage.packageSellingPrice,
        currency: customerPackage.currency,
        travelerCount: customerPackage.travelerCount,
        ...(quote.durationDays ? { durationDays: quote.durationDays } : {}),
        ...(quote.durationNights ? { durationNights: quote.durationNights } : {}),
        hotelHighlights: customerPackage.hotels.map(hotel => `${hotel.hotelName} — ${hotel.roomCategoryName}`),
        transportHighlights: customerPackage.transports.map(transport => transport.vehicleName),
        includedActivityHighlights: customerPackage.activities
          .filter(activity => activity.inclusionStatus !== 'OPTIONAL' && activity.inclusionStatus !== 'NOT_INCLUDED')
          .map(activity => activity.activityName),
        optionalActivityHighlights: customerPackage.activities
          .filter(activity => activity.inclusionStatus === 'OPTIONAL')
          .map(activity => activity.activityName),
        validUntil: quote.validUntil,
      };
    });
  const first = quotes[0];
  return {
    quoteGroupId: groupId,
    customerName: first?.customerName || 'Guest',
    destination: first?.destination || 'Your destination',
    title: first?.customerTitle || `${first?.destination || 'Holiday'} Package Options`,
    options,
  };
}

function translateAuthorizationError(error: unknown): never {
  if (error instanceof ResourceAuthorizationError) {
    throw new QuoteDomainError(403, 'RESOURCE_ACCESS_DENIED', error.message, error.decision);
  }
  throw error;
}

export class QuoteService {
  constructor(private readonly storage: ConversionStorageProvider = new FirestoreConversionStorageProvider()) {}

  async getBackupAccommodationOptions(
    tripIdValue: unknown,
    sourceTripItemIdValue: unknown,
    actor: QuoteMutationActor,
  ): Promise<UnknownRecord[]> {
    const tripId = requireNonEmptyString(tripIdValue, 'tripId');
    const sourceTripItemId = requireNonEmptyString(sourceTripItemIdValue, 'sourceTripItemId');
    return this.storage.runTransaction(async tx => {
      const trip = await tx.get('trips', tripId) as UnknownRecord | null;
      if (!trip) throw new QuoteDomainError(404, 'TRIP_NOT_FOUND', 'The linked Trip does not exist.');
      try {
        assertAuthorizedResource(actor, 'TRIP', 'READ_DETAIL', tripResourceContext({ ...trip, id: tripId }));
      } catch (error) {
        translateAuthorizationError(error);
      }
      assertTripCostingFresh(trip, 'select Quote alternatives');
      const days = await tx.findByField('itinerary_days', 'tripId', tripId, 60) as UnknownRecord[];
      const source = days.flatMap(day => Array.isArray(day.items) ? day.items : [])
        .find(item => item?.id === sourceTripItemId && item?.type === 'HOTEL');
      if (!source || !isRecord(source.metadata)) {
        throw new QuoteDomainError(404, 'TRIP_SERVICE_NOT_FOUND', 'The primary Trip hotel service was not found.');
      }
      const metadata = source.metadata;
      const checkInDate = requireNonEmptyString(metadata.checkInDate, 'source hotel checkInDate');
      const mealPlan = requireNonEmptyString(metadata.mealPlan, 'source hotel mealPlan');
      const rates = await tx.findByField('rate_periods', 'mealPlan', mealPlan, 100) as UnknownRecord[];
      const options: UnknownRecord[] = [];
      for (const rate of rates) {
        if (rate.status !== 'ACTIVE' || typeof rate.validFrom !== 'string' || checkInDate < rate.validFrom.slice(0, 10) ||
          (rate.validTo && checkInDate > String(rate.validTo).slice(0, 10))) continue;
        if (rate.id === metadata.rateId) continue;
        const [property, room] = await Promise.all([
          tx.get('accommodation_properties', rate.propertyId),
          tx.get('room_categories', rate.roomCategoryId),
        ]);
        if (!property || property.status !== 'ACTIVE' || !room || room.active !== true || room.propertyId !== property.id) continue;
        options.push({
          sourceTripItemId,
          propertyId: property.id,
          propertyName: property.name,
          roomCategoryId: room.id,
          roomCategoryName: room.name,
          ratePeriodId: rate.id,
          mealPlan,
          checkInDate,
          ...(metadata.checkOutDate ? { checkOutDate: metadata.checkOutDate } : {}),
        });
      }
      return options.slice(0, 50);
    });
  }

  async getCustomerPackage(quoteIdValue: unknown, actor: QuoteMutationActor): Promise<CustomerPackageDocument> {
    const quoteId = requireNonEmptyString(quoteIdValue, 'quoteId');
    return this.storage.runTransaction(async tx => {
      const quote = await tx.get('quotes', quoteId) as Quote | null;
      if (!quote) throw new QuoteDomainError(404, 'QUOTE_NOT_FOUND', 'Quote not found.');
      try {
        assertAuthorizedResource(actor, 'QUOTE', 'READ_DETAIL', quoteResourceContext(quote));
      } catch (error) {
        translateAuthorizationError(error);
      }
      return buildStoredCustomerPackage(tx, quote, new Date().toISOString());
    });
  }

  async getOptionComparison(groupIdValue: unknown, actor: QuoteMutationActor): Promise<CustomerQuoteComparison> {
    const groupId = requireNonEmptyString(groupIdValue, 'quoteGroupId');
    return this.storage.runTransaction(async tx => {
      const quotes = await tx.findByField('quotes', 'quoteGroupId', groupId, 25) as Quote[];
      if (!quotes.length) throw new QuoteDomainError(404, 'QUOTE_GROUP_NOT_FOUND', 'Quote option group not found.');
      for (const quote of quotes) {
        try {
          assertAuthorizedResource(actor, 'QUOTE', 'READ_DETAIL', quoteResourceContext(quote));
        } catch (error) {
          translateAuthorizationError(error);
        }
      }
      return customerComparison(groupId, quotes);
    });
  }

  async createCustomerShare(
    groupIdValue: unknown,
    rawInput: unknown,
    actor: QuoteMutationActor,
  ): Promise<CustomerShareCreateResult> {
    const groupId = requireNonEmptyString(groupIdValue, 'quoteGroupId');
    const input = requireRecord(rawInput);
    const unknown = Object.keys(input).find(key => key !== 'expiresInDays');
    if (unknown) throw new QuoteDomainError(400, 'UNSUPPORTED_SHARE_FIELD', `Unsupported share field: ${unknown}.`);
    const requestedExpiry = input.expiresInDays;
    if (requestedExpiry !== undefined && requestedExpiry !== null && !CUSTOMER_SHARE_EXPIRY_DAYS.has(requestedExpiry)) {
      throw new QuoteDomainError(400, 'INVALID_SHARE_EXPIRY', 'expiresInDays must be 7, 14, 30, or null.');
    }
    const expiresInDays = requestedExpiry === null
      ? undefined
      : (requestedExpiry === undefined ? 14 : requestedExpiry as CustomerShareExpiryDays);
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashCustomerShareToken(token);
    const shareId = `share-${randomUUID()}`;
    const now = new Date().toISOString();

    return this.storage.runTransaction(async tx => {
      const group = await tx.findByField('quotes', 'quoteGroupId', groupId, 25) as Quote[];
      await assertCustomerShareGroupReady(tx, group, actor);
      const owner = group[0].salesEmployeeId;
      const team = group[0].salesTeamId;
      if (!owner || group.some(option => option.salesEmployeeId !== owner || option.salesTeamId !== team)) {
        throw new QuoteDomainError(409, 'QUOTE_GROUP_SCOPE_INVALID', 'Quote Group ownership metadata is inconsistent.');
      }
      const collision = await tx.findByField('customer_shares', 'tokenHash', tokenHash, 2);
      if (collision.length) throw new QuoteDomainError(500, 'SHARE_TOKEN_COLLISION', 'Unable to create a secure customer link.');
      const priorShares = await tx.findByField('customer_shares', 'quoteGroupId', groupId, 100) as CustomerShareRecord[];
      const version = priorShares.reduce((highest, share) => Math.max(highest, Number(share.version || 0)), 0) + 1;
      // Firestore rejects undefined values. The public projection is deliberately
      // allowlisted; serializing it also removes optional undefined leaves before
      // the immutable snapshot is persisted.
      const snapshot = JSON.parse(JSON.stringify(
        buildCustomerSharePublicView(group, now),
      )) as CustomerSharePublicView;
      const record: CustomerShareRecord = {
        id: shareId,
        quoteGroupId: groupId,
        leadId: group[0].leadId,
        customerId: group[0].customerId,
        ...(group[0].tripId ? { tripId: group[0].tripId } : {}),
        version,
        quoteVersions: group.map(option => ({ quoteId: option.id, version: option.version || 1 })),
        tokenHash,
        status: 'ACTIVE',
        createdByEmployeeId: actor.employeeId,
        createdByName: actor.name,
        salesEmployeeId: owner,
        ...(team ? { salesTeamId: team } : {}),
        createdAt: now,
        ...(expiresInDays ? { expiresAt: new Date(Date.parse(now) + expiresInDays * 86_400_000).toISOString() } : {}),
        viewCount: 0,
        snapshot,
      };
      for (const option of group) {
        tx.update('quotes', option.id, {
          status: 'SENT',
          optionStatus: 'SHARED',
          sharedAt: now,
          sharedByEmployeeId: actor.employeeId,
          shareChannel: 'DOCUMENT',
          version: (option.version || 1) + 1,
          versionHistory: [...(option.versionHistory || []), versionSnapshot(option, actor)],
          updatedAt: now,
          updatedByEmployeeId: actor.employeeId,
        });
      }
      const history = customerShareHistory(record, now);
      const audit = {
        ...auditEvent('CUSTOMER_SHARE_CREATED', shareId, actor, null, {
          shareId,
          quoteGroupId: groupId,
          version,
          createdAt: now,
          ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
        }, now),
        entityType: 'CUSTOMER_SHARE',
        reason: 'Secure customer Quote Group link created from frozen option snapshots.',
      } as AuditLog;
      tx.set('customer_shares', shareId, record);
      tx.set('audit_logs', audit.id, audit);
      return { share: history, publicPath: `/quote/share/${token}` };
    });
  }

  async listCustomerShares(groupIdValue: unknown, actor: QuoteMutationActor): Promise<CustomerShareHistoryItem[]> {
    const groupId = requireNonEmptyString(groupIdValue, 'quoteGroupId');
    return this.storage.runTransaction(async tx => {
      const group = await tx.findByField('quotes', 'quoteGroupId', groupId, 25) as Quote[];
      if (!group.length) throw new QuoteDomainError(404, 'QUOTE_GROUP_NOT_FOUND', 'Quote option group not found.');
      for (const option of group) {
        try {
          assertAuthorizedResource(actor, 'QUOTE', 'READ_DETAIL', quoteResourceContext(option));
        } catch (error) {
          translateAuthorizationError(error);
        }
      }
      const now = new Date().toISOString();
      const shares = await tx.findByField('customer_shares', 'quoteGroupId', groupId, 100) as CustomerShareRecord[];
      return shares
        .map(record => customerShareHistory(record, now))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    });
  }

  async revokeCustomerShare(shareIdValue: unknown, actor: QuoteMutationActor): Promise<CustomerShareHistoryItem> {
    const shareId = requireNonEmptyString(shareIdValue, 'shareId');
    assertCustomerShareActor(actor);
    return this.storage.runTransaction(async tx => {
      const stored = await tx.get('customer_shares', shareId) as CustomerShareRecord | null;
      if (!stored) throw new QuoteDomainError(404, 'CUSTOMER_SHARE_NOT_FOUND', 'Customer share not found.');
      try {
        assertAuthorizedResource(actor, 'QUOTE', 'READ_DETAIL', quoteResourceContext({
          salesEmployeeId: stored.salesEmployeeId,
          salesTeamId: stored.salesTeamId,
        }));
      } catch (error) {
        translateAuthorizationError(error);
      }
      if (stored.status === 'REVOKED') return customerShareHistory(stored);
      const now = new Date().toISOString();
      const updated: CustomerShareRecord = {
        ...stored,
        status: 'REVOKED',
        revokedAt: now,
        revokedByEmployeeId: actor.employeeId,
      };
      const audit = {
        ...auditEvent('CUSTOMER_SHARE_REVOKED', shareId, actor,
          { shareId, quoteGroupId: stored.quoteGroupId, status: effectiveCustomerShareStatus(stored, now) },
          { shareId, quoteGroupId: stored.quoteGroupId, status: 'REVOKED', revokedAt: now }, now),
        entityType: 'CUSTOMER_SHARE',
        reason: 'Customer access token revoked without deleting Quote history.',
      } as AuditLog;
      tx.update('customer_shares', shareId, updated);
      tx.set('audit_logs', audit.id, audit);
      return customerShareHistory(updated, now);
    });
  }

  async openCustomerShare(tokenValue: unknown): Promise<CustomerSharePublicView> {
    const token = typeof tokenValue === 'string' ? tokenValue.trim() : '';
    if (!CUSTOMER_SHARE_TOKEN_PATTERN.test(token)) {
      throw new QuoteDomainError(404, 'CUSTOMER_SHARE_NOT_FOUND', 'This package link could not be found.');
    }
    const tokenHash = hashCustomerShareToken(token);
    return this.storage.runTransaction(async tx => {
      const matches = await tx.findByField('customer_shares', 'tokenHash', tokenHash, 2) as CustomerShareRecord[];
      if (matches.length !== 1) {
        throw new QuoteDomainError(404, 'CUSTOMER_SHARE_NOT_FOUND', 'This package link could not be found.');
      }
      const stored = matches[0];
      const now = new Date().toISOString();
      const status = effectiveCustomerShareStatus(stored, now);
      if (status === 'REVOKED') {
        throw new QuoteDomainError(410, 'CUSTOMER_SHARE_REVOKED', 'This package link is no longer available.');
      }
      if (status === 'EXPIRED') {
        if (stored.status !== 'EXPIRED') tx.update('customer_shares', stored.id, { status: 'EXPIRED' });
        throw new QuoteDomainError(410, 'CUSTOMER_SHARE_EXPIRED', 'This package link has expired. Please contact Booking Bridge for an updated itinerary.');
      }
      tx.update('customer_shares', stored.id, {
        ...(stored.firstViewedAt ? {} : { firstViewedAt: now }),
        lastViewedAt: now,
        viewCount: (stored.viewCount || 0) + 1,
      });
      return JSON.parse(JSON.stringify(stored.snapshot)) as CustomerSharePublicView;
    });
  }

  async generateCustomerSharePdf(
    shareIdValue: unknown,
    actor: QuoteMutationActor,
  ): Promise<{ bytes: Uint8Array; filename: string; share: CustomerShareHistoryItem }> {
    const shareId = requireNonEmptyString(shareIdValue, 'shareId');
    assertCustomerShareActor(actor);
    return this.storage.runTransaction(async tx => {
      const stored = await tx.get('customer_shares', shareId) as CustomerShareRecord | null;
      if (!stored) throw new QuoteDomainError(404, 'CUSTOMER_SHARE_NOT_FOUND', 'Customer share not found.');
      try {
        assertAuthorizedResource(actor, 'QUOTE', 'READ_DETAIL', quoteResourceContext({
          salesEmployeeId: stored.salesEmployeeId,
          salesTeamId: stored.salesTeamId,
        }));
      } catch (error) {
        translateAuthorizationError(error);
      }
      const now = new Date().toISOString();
      const bytes = buildCustomerSharePdf(stored.snapshot, stored.version);
      const updated: CustomerShareRecord = {
        ...stored,
        pdfGeneratedCount: (stored.pdfGeneratedCount || 0) + 1,
        lastPdfGeneratedAt: now,
      };
      const audit = {
        ...auditEvent('QUOTE_PDF_GENERATED', shareId, actor, null, {
          shareId,
          quoteGroupId: stored.quoteGroupId,
          version: stored.version,
          channel: 'PDF',
          linkStatus: effectiveCustomerShareStatus(stored, now),
          generatedAt: now,
        }, now),
        entityType: 'CUSTOMER_SHARE',
        reason: 'Customer-safe PDF generated from the immutable CustomerShare snapshot.',
      } as AuditLog;
      tx.update('customer_shares', shareId, updated);
      tx.set('audit_logs', audit.id, audit);
      return {
        bytes,
        filename: customerSharePdfFilename(stored.snapshot, new Date(stored.createdAt).getUTCFullYear()),
        share: customerShareHistory(updated, now),
      };
    });
  }

  async prepareCustomerShareDelivery(
    shareIdValue: unknown,
    rawInput: unknown,
    publicOriginValue: string,
    actor: QuoteMutationActor,
  ): Promise<CustomerDeliveryPreparation> {
    const shareId = requireNonEmptyString(shareIdValue, 'shareId');
    assertCustomerShareActor(actor);
    const input = requireRecord(rawInput);
    const unsupported = Object.keys(input).find(key => !['channel', 'token'].includes(key));
    if (unsupported) throw new QuoteDomainError(400, 'UNSUPPORTED_DELIVERY_FIELD', `Unsupported delivery field: ${unsupported}.`);
    const channel = input.channel;
    if (channel !== 'WHATSAPP' && channel !== 'EMAIL') {
      throw new QuoteDomainError(400, 'INVALID_DELIVERY_CHANNEL', 'channel must be WHATSAPP or EMAIL.');
    }
    const token = typeof input.token === 'string' ? input.token.trim() : '';
    if (!CUSTOMER_SHARE_TOKEN_PATTERN.test(token)) {
      throw new QuoteDomainError(409, 'ACTIVE_CUSTOMER_LINK_REQUIRED', 'Create or select a valid active customer link before preparing delivery.');
    }
    let publicOrigin: string;
    try {
      const parsed = new URL(publicOriginValue);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported public protocol.');
      publicOrigin = parsed.origin;
    } catch {
      throw new QuoteDomainError(500, 'PUBLIC_APP_ORIGIN_INVALID', 'The public Booking Bridge URL is not configured correctly.');
    }

    return this.storage.runTransaction(async tx => {
      const stored = await tx.get('customer_shares', shareId) as CustomerShareRecord | null;
      if (!stored) throw new QuoteDomainError(404, 'CUSTOMER_SHARE_NOT_FOUND', 'Customer share not found.');
      try {
        assertAuthorizedResource(actor, 'QUOTE', 'READ_DETAIL', quoteResourceContext({
          salesEmployeeId: stored.salesEmployeeId,
          salesTeamId: stored.salesTeamId,
        }));
      } catch (error) {
        translateAuthorizationError(error);
      }
      const now = new Date().toISOString();
      const status = effectiveCustomerShareStatus(stored, now);
      if (status !== 'ACTIVE') {
        throw new QuoteDomainError(409, 'ACTIVE_CUSTOMER_LINK_REQUIRED', `This customer link is ${status.toLowerCase()}. Create a fresh link before delivery.`);
      }
      if (hashCustomerShareToken(token) !== stored.tokenHash) {
        throw new QuoteDomainError(409, 'ACTIVE_CUSTOMER_LINK_REQUIRED', 'The selected secure link does not match this Quote version.');
      }
      const quoteReference = stored.quoteVersions[0];
      const quote = quoteReference ? await tx.get('quotes', quoteReference.quoteId) as Quote | null : null;
      const customer = quote?.customerId ? await tx.get('customers', quote.customerId) as UnknownRecord | null : null;
      const customerPhone = customer?.whatsApp || customer?.phone || quote?.customerPhone;
      const customerEmail = customer?.email || quote?.customerEmail;
      const prepared = buildCustomerDeliveryPreparation({
        shareId,
        quoteGroupId: stored.quoteGroupId,
        version: stored.version,
        channel: channel as CustomerDeliveryChannel,
        snapshot: stored.snapshot,
        customerLink: `${publicOrigin}/quote/share/${token}`,
        customerPhone,
        customerEmail,
        preparedAt: now,
      });
      const isWhatsapp = channel === 'WHATSAPP';
      const updated: CustomerShareRecord = {
        ...stored,
        ...(isWhatsapp
          ? { whatsappPreparedCount: (stored.whatsappPreparedCount || 0) + 1, lastWhatsappPreparedAt: now }
          : { emailPreparedCount: (stored.emailPreparedCount || 0) + 1, lastEmailPreparedAt: now }),
      };
      const action = isWhatsapp ? 'WHATSAPP_SHARE_PREPARED' : 'EMAIL_SHARE_PREPARED';
      const audit = {
        ...auditEvent(action, shareId, actor, null, {
          shareId,
          quoteGroupId: stored.quoteGroupId,
          version: stored.version,
          channel,
          preparedAt: now,
          recipientAvailable: prepared.recipientAvailable,
        }, now),
        entityType: 'CUSTOMER_SHARE',
        reason: `${channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'} delivery prepared for the immutable CustomerShare snapshot; external sending is not claimed.`,
      } as AuditLog;
      tx.update('customer_shares', shareId, updated);
      tx.set('audit_logs', audit.id, audit);
      return prepared;
    });
  }

  async duplicateOption(sourceQuoteIdValue: unknown, rawInput: unknown, actor: QuoteMutationActor): Promise<Quote> {
    const sourceQuoteId = requireNonEmptyString(sourceQuoteIdValue, 'quoteId');
    const input = requireRecord(rawInput);
    const supported = new Set(['label', 'customerTitle', 'totalAmount', 'discountAmount', 'validUntil']);
    const unknown = Object.keys(input).find(key => !supported.has(key));
    if (unknown) throw new QuoteDomainError(400, 'UNSUPPORTED_OPTION_FIELD', `Unsupported option field: ${unknown}.`);
    const label = requireOptionLabel(input.label, 'label');
    const customerTitle = input.customerTitle === undefined ? undefined : requireOptionLabel(input.customerTitle, 'customerTitle');
    const totalAmount = input.totalAmount === undefined ? undefined : finiteNonNegative(input.totalAmount, 'totalAmount');
    const discountAmount = input.discountAmount === undefined ? undefined : finiteNonNegative(input.discountAmount, 'discountAmount');
    const validUntil = input.validUntil === undefined ? undefined : optionalIsoDate(input.validUntil, 'validUntil');
    const now = new Date().toISOString();
    const quoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return this.storage.runTransaction(async tx => {
      const source = await tx.get('quotes', sourceQuoteId) as Quote | null;
      if (!source?.optionId || !source.quoteGroupId || !source.customerPackageSnapshot) {
        throw new QuoteDomainError(409, 'QUOTE_OPTION_REQUIRED', 'Only a frozen Quote option can be duplicated.');
      }
      try {
        assertAuthorizedResource(actor, 'QUOTE', 'UPDATE_COMMERCIAL', quoteResourceContext(source));
      } catch (error) {
        translateAuthorizationError(error);
      }
      const group = await tx.findByField('quotes', 'quoteGroupId', source.quoteGroupId, 25) as Quote[];
      if (group.some(option => option.convertedBookingId || option.optionStatus === 'ACCEPTED')) {
        throw new QuoteDomainError(409, 'QUOTE_GROUP_ALREADY_ACCEPTED', 'This option group already has an accepted Booking.');
      }
      const financials = calculateFinancials(
        totalAmount ?? source.totalAmount,
        discountAmount ?? source.discountAmount,
        source.totalSupplierCost,
      );
      const threshold = source.approval?.thresholdPercent;
      const approval = assessLowMarginPolicy(Number(financials.grossMargin || 0), threshold, now);
      if (approval.required) {
        throw new QuoteDomainError(409, 'COMMERCIAL_APPROVAL_REQUIRED', 'The duplicated option requires low-margin approval before it can be frozen.');
      }
      const clone = JSON.parse(JSON.stringify(source)) as Quote;
      const option: Quote = {
        ...clone,
        ...financials,
        id: quoteId,
        optionId: quoteId,
        optionLabel: label,
        ...(customerTitle ? { customerTitle } : {}),
        optionOrder: group.length + 1,
        isRecommended: false,
        optionStatus: 'READY',
        optionSnapshotCreatedAt: now,
        status: 'DRAFT',
        approval,
        createdAt: now,
        updatedAt: now,
        createdByEmployeeId: actor.employeeId,
        updatedByEmployeeId: actor.employeeId,
        version: 1,
        versionHistory: [],
        customerPackageSnapshot: {
          ...clone.customerPackageSnapshot!,
          packageReference: quoteId,
          packageSellingPrice: Number(financials.finalAmount),
          generatedAt: now,
        },
      };
      delete option.sharedAt;
      delete option.sharedByEmployeeId;
      delete option.shareChannel;
      delete option.convertedBookingId;
      const audit = auditEvent('QUOTE_OPTION_DUPLICATED', quoteId, actor, null, option as UnknownRecord, now);
      tx.set('quotes', quoteId, option);
      tx.set('audit_logs', audit.id, audit);
      return option;
    });
  }

  async updateOption(quoteIdValue: unknown, rawInput: unknown, actor: QuoteMutationActor): Promise<Quote> {
    const quoteId = requireNonEmptyString(quoteIdValue, 'quoteId');
    const input = requireRecord(rawInput);
    const supported = new Set(['label', 'customerTitle', 'totalAmount', 'discountAmount', 'validUntil', 'inclusions', 'exclusions', 'termsAndConditions', 'paymentSchedule', 'backupAccommodations']);
    const unknown = Object.keys(input).find(key => !supported.has(key));
    if (unknown) throw new QuoteDomainError(400, 'UNSUPPORTED_OPTION_FIELD', `Unsupported option field: ${unknown}.`);
    if (!Object.keys(input).length) throw new QuoteDomainError(400, 'EMPTY_OPTION_UPDATE', 'No option fields were supplied.');
    return this.storage.runTransaction(async tx => {
      const stored = await tx.get('quotes', quoteId) as Quote | null;
      if (!stored?.optionId || !stored.customerPackageSnapshot) throw new QuoteDomainError(409, 'QUOTE_OPTION_REQUIRED', 'Quote option not found.');
      try {
        assertAuthorizedResource(actor, 'QUOTE', 'UPDATE_COMMERCIAL', quoteResourceContext(stored));
      } catch (error) {
        translateAuthorizationError(error);
      }
      if (['ACCEPTED', 'SUPERSEDED'].includes(stored.optionStatus || '')) {
        throw new QuoteDomainError(409, 'OPTION_IMMUTABLE', 'Accepted or superseded options cannot be edited.');
      }
      const now = new Date().toISOString();
      const totalAmount = input.totalAmount === undefined ? stored.totalAmount : finiteNonNegative(input.totalAmount, 'totalAmount');
      const discountAmount = input.discountAmount === undefined ? stored.discountAmount : finiteNonNegative(input.discountAmount, 'discountAmount');
      const financials = calculateFinancials(totalAmount, discountAmount, stored.totalSupplierCost);
      const approval = assessLowMarginPolicy(Number(financials.grossMargin || 0), stored.approval?.thresholdPercent, now);
      const label = input.label === undefined ? stored.optionLabel : requireOptionLabel(input.label, 'label');
      const customerTitle = input.customerTitle === undefined ? stored.customerTitle : requireOptionLabel(input.customerTitle, 'customerTitle');
      const inclusions = input.inclusions === undefined ? stored.inclusions : sanitizeStringArray(input.inclusions, 'inclusions');
      const exclusions = input.exclusions === undefined ? stored.exclusions : sanitizeStringArray(input.exclusions, 'exclusions');
      const termsAndConditions = input.termsAndConditions === undefined ? stored.termsAndConditions : optionalString(input.termsAndConditions, 'termsAndConditions');
      const paymentSchedule = input.paymentSchedule === undefined ? stored.paymentSchedule : sanitizePaymentSchedule(input.paymentSchedule);
      const validUntil = input.validUntil === undefined ? stored.validUntil : optionalIsoDate(input.validUntil, 'validUntil')!;
      const backupSelections = input.backupAccommodations === undefined
        ? undefined
        : sanitizeItems(input.backupAccommodations, 'backupAccommodations', BACKUP_ACCOMMODATION_FIELDS)!;
      const backupAccommodations = backupSelections === undefined
        ? stored.backupAccommodations
        : await this.resolveBackupAccommodations(tx, backupSelections, (stored.hotels || []) as UnknownRecord[]);
      const updated: Quote = {
        ...stored,
        ...financials,
        optionLabel: label,
        ...(customerTitle ? { customerTitle } : {}),
        inclusions,
        exclusions,
        termsAndConditions,
        paymentSchedule,
        backupAccommodations: backupAccommodations as Quote['backupAccommodations'],
        validUntil,
        approval,
        optionStatus: approval.required ? 'DRAFT' : (stored.sharedAt ? 'SHARED' : 'READY'),
        version: (stored.version || 1) + 1,
        versionHistory: [...(stored.versionHistory || []), versionSnapshot(stored, actor)],
        updatedAt: now,
        updatedByEmployeeId: actor.employeeId,
        customerPackageSnapshot: {
          ...stored.customerPackageSnapshot,
          packageSellingPrice: Number(financials.finalAmount),
          inclusions: inclusions || [],
          exclusions: exclusions || [],
          ...(termsAndConditions ? { termsAndConditions } : {}),
          ...(stored.policyVersion ? { policyVersion: stored.policyVersion } : {}),
          ...(paymentSchedule ? { paymentSchedule } : {}),
          generatedAt: now,
        },
      };
      delete updated.sharedAt;
      delete updated.sharedByEmployeeId;
      delete updated.shareChannel;
      const audit = auditEvent('QUOTE_OPTION_UPDATED', quoteId, actor, stored as UnknownRecord, updated as UnknownRecord, now);
      tx.update('quotes', quoteId, updated);
      tx.set('audit_logs', audit.id, audit);
      return updated;
    });
  }

  async refreshOptionFromTrip(quoteIdValue: unknown, actor: QuoteMutationActor): Promise<Quote> {
    const quoteId = requireNonEmptyString(quoteIdValue, 'quoteId');
    return this.storage.runTransaction(async tx => {
      const stored = await tx.get('quotes', quoteId) as Quote | null;
      if (!stored?.optionId || !stored.tripId) throw new QuoteDomainError(409, 'QUOTE_OPTION_REQUIRED', 'A Trip-linked Quote option is required.');
      try {
        assertAuthorizedResource(actor, 'QUOTE', 'UPDATE_COMMERCIAL', quoteResourceContext(stored));
      } catch (error) {
        translateAuthorizationError(error);
      }
      if (['ACCEPTED', 'SUPERSEDED'].includes(stored.optionStatus || '')) throw new QuoteDomainError(409, 'OPTION_IMMUTABLE', 'Accepted or superseded options cannot be refreshed.');
      const resolved = await this.resolveSupplierCostAndLinks(tx, stored as unknown as UnknownRecord, actor);
      if (resolved.ownerEmployeeId !== stored.salesEmployeeId || resolved.salesTeamId !== stored.salesTeamId) {
        throw new QuoteDomainError(409, 'QUOTE_OWNERSHIP_TRANSFER_NOT_ALLOWED', 'Refreshing cannot change option ownership or team.');
      }
      const financials = calculateFinancials(
        resolved.sellingPrice ?? stored.totalAmount,
        resolved.sellingPrice !== undefined ? 0 : stored.discountAmount,
        resolved.cost,
      );
      const now = new Date().toISOString();
      const refreshed: Quote = {
        ...stored,
        ...(resolved.quoteFields || {}),
        ...financials,
        ...(resolved.source ? { supplierCostSource: resolved.source } : {}),
        optionStatus: 'READY',
        optionSnapshotCreatedAt: now,
        version: (stored.version || 1) + 1,
        versionHistory: [...(stored.versionHistory || []), versionSnapshot(stored, actor)],
        updatedAt: now,
        updatedByEmployeeId: actor.employeeId,
      };
      delete refreshed.sharedAt;
      delete refreshed.sharedByEmployeeId;
      delete refreshed.shareChannel;
      delete refreshed.customerPackageSnapshot;
      if (refreshed.approval?.required === true && !isLowMarginApprovalCurrent(refreshed.approval, refreshed)) {
        throw new QuoteDomainError(409, 'COMMERCIAL_APPROVAL_REQUIRED', 'The refreshed option requires commercial approval before it can be frozen.');
      }
      refreshed.customerPackageSnapshot = await buildStoredCustomerPackage(tx, refreshed, now, true);
      const audit = auditEvent('QUOTE_OPTION_UPDATED', quoteId, actor, stored as UnknownRecord, refreshed as UnknownRecord, now);
      tx.update('quotes', quoteId, refreshed);
      tx.set('audit_logs', audit.id, audit);
      return refreshed;
    });
  }

  async recommendOption(quoteIdValue: unknown, actor: QuoteMutationActor): Promise<Quote> {
    const quoteId = requireNonEmptyString(quoteIdValue, 'quoteId');
    const now = new Date().toISOString();
    return this.storage.runTransaction(async tx => {
      const selected = await tx.get('quotes', quoteId) as Quote | null;
      if (!selected?.optionId || !selected.quoteGroupId) throw new QuoteDomainError(409, 'QUOTE_OPTION_REQUIRED', 'Quote option not found.');
      try {
        assertAuthorizedResource(actor, 'QUOTE', 'UPDATE_COMMERCIAL', quoteResourceContext(selected));
      } catch (error) {
        translateAuthorizationError(error);
      }
      const group = await tx.findByField('quotes', 'quoteGroupId', selected.quoteGroupId, 25) as Quote[];
      for (const option of group) {
        tx.update('quotes', option.id, { isRecommended: option.id === quoteId, updatedAt: now, updatedByEmployeeId: actor.employeeId });
      }
      const updated = { ...selected, isRecommended: true, updatedAt: now, updatedByEmployeeId: actor.employeeId };
      const audit = auditEvent('QUOTE_OPTION_RECOMMENDED', quoteId, actor, selected as UnknownRecord, updated as UnknownRecord, now);
      tx.set('audit_logs', audit.id, audit);
      return updated;
    });
  }

  async reorderOptions(groupIdValue: unknown, rawInput: unknown, actor: QuoteMutationActor): Promise<Quote[]> {
    const groupId = requireNonEmptyString(groupIdValue, 'quoteGroupId');
    const input = requireRecord(rawInput);
    if (!Array.isArray(input.optionIds) || input.optionIds.some(value => typeof value !== 'string')) {
      throw new QuoteDomainError(400, 'INVALID_OPTION_ORDER', 'optionIds must be an array of option IDs.');
    }
    return this.storage.runTransaction(async tx => {
      const group = await tx.findByField('quotes', 'quoteGroupId', groupId, 25) as Quote[];
      if (!group.length) throw new QuoteDomainError(404, 'QUOTE_GROUP_NOT_FOUND', 'Quote option group not found.');
      try {
        assertAuthorizedResource(actor, 'QUOTE', 'UPDATE_COMMERCIAL', quoteResourceContext(group[0]));
      } catch (error) {
        translateAuthorizationError(error);
      }
      const expected = new Set(group.map(option => option.optionId));
      if (input.optionIds.length !== group.length || new Set(input.optionIds).size !== group.length || input.optionIds.some(id => !expected.has(id))) {
        throw new QuoteDomainError(400, 'INVALID_OPTION_ORDER', 'optionIds must contain every option in this group exactly once.');
      }
      const now = new Date().toISOString();
      const updated = group.map(option => ({ ...option, optionOrder: input.optionIds.indexOf(option.optionId) + 1, updatedAt: now, updatedByEmployeeId: actor.employeeId }));
      for (const option of updated) tx.update('quotes', option.id, option);
      const audit = auditEvent('QUOTE_OPTIONS_REORDERED', groupId, actor, null, { optionIds: input.optionIds }, now);
      tx.set('audit_logs', audit.id, audit);
      return updated.sort((left, right) => (left.optionOrder || 0) - (right.optionOrder || 0));
    });
  }

  async shareQuote(
    quoteIdValue: unknown,
    rawInput: unknown,
    actor: QuoteMutationActor,
  ): Promise<{ quote: Quote; customerPackage: CustomerPackageDocument }> {
    const quoteId = requireNonEmptyString(quoteIdValue, 'quoteId');
    const input = requireRecord(rawInput);
    const unknownFields = Object.keys(input).filter(key => !['channel', 'expectedVersion'].includes(key));
    if (unknownFields.length) {
      throw new QuoteDomainError(400, 'UNSUPPORTED_SHARE_FIELD', `Unsupported share field: ${unknownFields[0]}.`);
    }
    const channel = requireNonEmptyString(input.channel, 'channel') as QuoteShareChannel;
    if (!['DOCUMENT', 'EMAIL', 'WHATSAPP'].includes(channel)) {
      throw new QuoteDomainError(400, 'INVALID_SHARE_CHANNEL', 'channel must be DOCUMENT, EMAIL, or WHATSAPP.');
    }
    const expectedVersion = positiveInteger(input.expectedVersion, 'expectedVersion', true)!;

    return this.storage.runTransaction(async tx => {
      const stored = await tx.get('quotes', quoteId) as Quote | null;
      if (!stored) throw new QuoteDomainError(404, 'QUOTE_NOT_FOUND', 'Quote not found.');
      try {
        assertAuthorizedResource(actor, 'QUOTE', 'UPDATE_COMMERCIAL', quoteResourceContext(stored));
      } catch (error) {
        translateAuthorizationError(error);
      }
      if ((stored.version || 1) !== expectedVersion) {
        throw new QuoteDomainError(409, 'QUOTE_VERSION_CONFLICT', 'The Quote changed after this package was opened. Reload before sharing.');
      }
      if (!['DRAFT', 'PENDING_APPROVAL', 'SENT'].includes(stored.status)) {
        throw new QuoteDomainError(409, 'QUOTE_SHARE_WORKFLOW_DENIED', `A ${stored.status} Quote cannot enter the share workflow.`);
      }
      if (stored.optionId && ['ACCEPTED', 'SUPERSEDED', 'DECLINED'].includes(stored.optionStatus || '')) {
        throw new QuoteDomainError(409, 'QUOTE_SHARE_WORKFLOW_DENIED', `A ${stored.optionStatus} option cannot be shared.`);
      }
      if (stored.approval?.required === true && !isLowMarginApprovalCurrent(stored.approval, stored)) {
        throw new QuoteDomainError(409, 'COMMERCIAL_APPROVAL_REQUIRED', 'This low-margin Quote requires commercial approval before sharing.');
      }
      if (stored.tripId && !stored.optionId) {
        const trip = await tx.get('trips', stored.tripId) as UnknownRecord | null;
        if (!trip) throw new QuoteDomainError(404, 'TRIP_NOT_FOUND', 'The Quote Trip no longer exists.');
        assertTripCostingFresh(trip, 'share this Quote');
        const sourceRevision = stored.supplierCostSource?.costingRevision;
        const tripRevision = Number(trip.costingRevision || 0);
        const sourceIsStale = sourceRevision !== undefined
          ? sourceRevision !== tripRevision
          : Boolean(stored.supplierCostSource?.asOf && trip.updatedAt && stored.supplierCostSource.asOf !== trip.updatedAt);
        if (sourceIsStale) {
          throw new QuoteDomainError(409, 'QUOTE_TRIP_VERSION_STALE', 'Save a fresh Quote revision using the updated package costs before sharing.');
        }
      }
      const now = new Date().toISOString();
      const customerPackage = await buildStoredCustomerPackage(tx, stored, now, true);
      const updated: Quote = {
        ...stored,
        status: 'SENT',
        sharedAt: now,
        sharedByEmployeeId: actor.employeeId,
        shareChannel: channel,
        customerPackageSnapshot: stored.optionId ? customerPackage : { ...customerPackage, generatedAt: now },
        ...(stored.optionId ? { optionStatus: 'SHARED' as const } : {}),
        version: (stored.version || 1) + 1,
        versionHistory: [...(stored.versionHistory || []), versionSnapshot(stored, actor)],
        updatedAt: now,
        updatedByEmployeeId: actor.employeeId,
      };
      const audit = auditEvent(stored.optionId ? 'QUOTE_OPTION_SHARED_STATE_CHANGED' : 'QUOTE_SHARED', quoteId, actor, stored as UnknownRecord, updated as UnknownRecord, now);
      tx.update('quotes', quoteId, updated);
      tx.set('audit_logs', audit.id, audit);
      return { quote: updated, customerPackage: updated.customerPackageSnapshot! };
    });
  }

  async createQuote(rawInput: unknown, actor: QuoteMutationActor): Promise<Quote> {
    const input = sanitizeInput(rawInput, 'CREATE');
    input.inclusions ??= [...STANDARD_CUSTOMER_POLICY_PRESET.inclusions];
    input.exclusions ??= [...STANDARD_CUSTOMER_POLICY_PRESET.exclusions];
    input.termsAndConditions ??= STANDARD_CUSTOMER_POLICY_PRESET.termsAndConditions;
    input.paymentSchedule ??= STANDARD_CUSTOMER_POLICY_PRESET.paymentSchedule.map(item => ({ ...item }));
    input.policyVersion = BOOKING_BRIDGE_POLICY_VERSION;
    validateRequiredCreateFields(input);
    if (!input.tripId && ['hotels', 'transports', 'activities'].some(field => Array.isArray(input[field]) && input[field].length > 0)) {
      throw new QuoteDomainError(
        422,
        'TRIP_LINK_REQUIRED',
        'New Quote services must come from an authoritative, calculated Trip.',
      );
    }
    if ((actor.role === 'Sales Executive' || actor.role === 'Sales Manager') && !actor.salesTeamId) {
      throw new QuoteDomainError(403, 'MISSING_TEAM_METADATA', 'A Sales employee must belong to a sales team to create Quotes.');
    }

    const quoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    return this.storage.runTransaction(async tx => {
      let tripQuotes: Quote[] = [];
      if (input.tripId) {
        tripQuotes = await tx.findByField('quotes', 'tripId', input.tripId, 25) as Quote[];
        const existing = tripQuotes
          .sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')))[0];
        if (existing && !input.optionLabel) {
          try {
            assertAuthorizedResource(actor, 'QUOTE', 'UPDATE_COMMERCIAL', quoteResourceContext(existing));
          } catch (error) {
            translateAuthorizationError(error);
          }
          await this.resolveSupplierCostAndLinks(tx, existing as unknown as UnknownRecord, actor);
          return existing;
        }
      }
      const linkage = await this.resolveSupplierCostAndLinks(tx, input, actor);
      // Validate legacy client proposal fields even though a Trip-backed Quote
      // always freezes the authoritative Trip selling economics below.
      calculateFinancials(input.totalAmount, input.discountAmount, linkage.cost);
      const financials = calculateFinancials(
        linkage.sellingPrice ?? input.totalAmount,
        linkage.sellingPrice !== undefined ? 0 : input.discountAmount,
        linkage.cost,
      );
      const quote: Quote = {
        ...input,
        ...(linkage.quoteFields || {}),
        ...financials,
        id: quoteId,
        salesEmployeeId: linkage.ownerEmployeeId,
        salesEmployeeName: linkage.ownerEmployeeName,
        salesTeamId: linkage.salesTeamId,
        createdByEmployeeId: actor.employeeId,
        updatedByEmployeeId: actor.employeeId,
        ...(linkage.source ? { supplierCostSource: linkage.source } : {}),
        status: 'DRAFT',
        version: 1,
        versionHistory: [],
        createdAt: now,
        updatedAt: now,
        ...(actor.isDemo ? { isDemo: true } : {}),
      } as Quote;

      if (input.optionLabel) {
        const existingOption = tripQuotes.find(candidate => candidate.optionId && candidate.quoteGroupId);
        const optionOrder = tripQuotes.filter(candidate => candidate.optionId).length + 1;
        quote.optionId = quoteId;
        quote.quoteGroupId = existingOption?.quoteGroupId || quoteId;
        quote.optionLabel = requireOptionLabel(input.optionLabel);
        if (input.customerTitle) quote.customerTitle = requireOptionLabel(input.customerTitle, 'customerTitle');
        quote.optionOrder = optionOrder;
        quote.isRecommended = optionOrder === 1;
        quote.optionStatus = 'READY';
        quote.optionSnapshotCreatedAt = now;
        if (quote.approval?.required === true && !isLowMarginApprovalCurrent(quote.approval, quote)) {
          throw new QuoteDomainError(409, 'COMMERCIAL_APPROVAL_REQUIRED', 'This option requires commercial approval before it can be frozen.');
        }
        quote.customerPackageSnapshot = await buildStoredCustomerPackage(tx, quote, now, true);
      }

      try {
        assertAuthorizedResource(actor, 'QUOTE', 'UPDATE_COMMERCIAL', quoteResourceContext(quote));
      } catch (error) {
        translateAuthorizationError(error);
      }

      const audit = auditEvent(input.optionLabel ? 'QUOTE_OPTION_CREATED' : 'QUOTE_CREATED', quoteId, actor, null, quote as UnknownRecord, now);
      tx.set('quotes', quoteId, quote);
      tx.set('audit_logs', audit.id, audit);
      return quote;
    });
  }

  async updateQuote(quoteId: string, rawInput: unknown, actor: QuoteMutationActor): Promise<Quote> {
    requireNonEmptyString(quoteId, 'quoteId');
    const input = sanitizeInput(rawInput, 'UPDATE');
    if (Object.keys(input).length === 0) {
      throw new QuoteDomainError(400, 'EMPTY_QUOTE_UPDATE', 'No permitted Quote fields were supplied.');
    }

    return this.storage.runTransaction(async tx => {
      const stored = await tx.get('quotes', quoteId) as Quote | null;
      if (!stored) throw new QuoteDomainError(404, 'QUOTE_NOT_FOUND', 'Quote not found.');

      try {
        assertAuthorizedResource(actor, 'QUOTE', 'UPDATE_COMMERCIAL', quoteResourceContext(stored));
      } catch (error) {
        translateAuthorizationError(error);
      }

      const nextStatus = (input.status || stored.status) as QuoteStatus;
      if (!STATUS_TRANSITIONS[stored.status]?.includes(nextStatus)) {
        throw new QuoteDomainError(
          409,
          'INVALID_STATUS_TRANSITION',
          `Quote status cannot transition from ${stored.status} to ${nextStatus}.`,
        );
      }

      const merged = { ...stored, ...input, status: nextStatus } as Quote;
      const supplier = await this.resolveSupplierCostAndLinks(tx, merged as UnknownRecord, actor);
      if (
        supplier.ownerEmployeeId !== stored.salesEmployeeId ||
        supplier.salesTeamId !== stored.salesTeamId
      ) {
        throw new QuoteDomainError(
          409,
          'QUOTE_OWNERSHIP_TRANSFER_NOT_ALLOWED',
          'Changing Quote linkage cannot transfer its Sales owner or team.',
        );
      }
      calculateFinancials(
        finiteNonNegative(merged.totalAmount, 'totalAmount'),
        finiteNonNegative(merged.discountAmount, 'discountAmount'),
        supplier.cost,
      );
      const financials = calculateFinancials(
        supplier.sellingPrice ?? finiteNonNegative(merged.totalAmount, 'totalAmount'),
        supplier.sellingPrice !== undefined ? 0 : finiteNonNegative(merged.discountAmount, 'discountAmount'),
        supplier.cost,
      );

      const proposedApproval = supplier.quoteFields?.approval as Quote['approval'] | undefined;
      const proposedCommercials = {
        ...merged,
        ...financials,
        ...(supplier.source ? { supplierCostSource: supplier.source } : {}),
      };
      if (nextStatus === 'SENT' && proposedApproval?.required === true && !isLowMarginApprovalCurrent(proposedApproval, proposedCommercials)) {
        throw new QuoteDomainError(409, 'COMMERCIAL_APPROVAL_REQUIRED', 'This low-margin Quote requires commercial approval before sending.');
      }

      if (['SENT', 'VIEWED', 'ACCEPTED'].includes(nextStatus)) {
        if (supplier.cost === undefined || financials.finalAmount <= 0) {
          throw new QuoteDomainError(
            422,
            'QUOTE_FINANCIALS_INCOMPLETE',
            'A Quote must have authoritative supplier cost and a positive selling price before leaving draft workflow.',
          );
        }
      }

      const now = new Date().toISOString();
      const history = [...(stored.versionHistory || []), versionSnapshot(stored, actor)];
      const incomingApproval = supplier.quoteFields?.approval as Quote['approval'] | undefined;
      const priorHistory = stored.approval?.history || [];
      const incomingHistory = incomingApproval?.history || [];
      const approvalHistory = [...priorHistory];
      for (const entry of incomingHistory) {
        if (!approvalHistory.some(existing => existing.decidedAt === entry.decidedAt && existing.reviewerEmployeeId === entry.reviewerEmployeeId)) {
          approvalHistory.push(entry);
        }
      }
      const quoteFields = supplier.quoteFields
        ? {
            ...supplier.quoteFields,
            ...(incomingApproval ? {
              approval: {
                ...incomingApproval,
                ...(approvalHistory.length ? { history: approvalHistory } : {}),
              },
            } : {}),
          }
        : undefined;
      const updated: Quote = {
        ...stored,
        ...input,
        ...(quoteFields || {}),
        ...financials,
        status: nextStatus,
        version: (stored.version || 1) + 1,
        versionHistory: history,
        updatedAt: now,
        updatedByEmployeeId: actor.employeeId,
        ...(supplier.source ? { supplierCostSource: supplier.source } : {}),
      };
      delete updated.sharedAt;
      delete updated.sharedByEmployeeId;
      delete updated.shareChannel;
      delete updated.customerPackageSnapshot;
      if (supplier.cost === undefined) {
        delete updated.totalSupplierCost;
        delete updated.grossProfit;
        delete updated.grossMargin;
        delete updated.supplierCostSource;
      }

      const audit = auditEvent('QUOTE_UPDATED', quoteId, actor, stored as UnknownRecord, updated as UnknownRecord, now);
      tx.update('quotes', quoteId, updated);
      tx.set('audit_logs', audit.id, audit);
      return updated;
    });
  }

  private async resolveSupplierCostAndLinks(
    tx: ConversionTransaction,
    quote: UnknownRecord,
    actor: QuoteMutationActor,
  ): Promise<{
    cost?: number;
    sellingPrice?: number;
    source?: { type: 'TRIP'; sourceId: string; asOf: string; costingRevision?: number };
    ownerEmployeeId: string;
    ownerEmployeeName: string;
    salesTeamId: string;
    quoteFields?: UnknownRecord;
  }> {
    const customerId = requireNonEmptyString(quote.customerId, 'customerId');
    const customer = await tx.get('customers', customerId);
    if (!customer) throw new QuoteDomainError(400, 'CUSTOMER_NOT_FOUND', 'The linked customer does not exist.');

    const leadId = requireNonEmptyString(quote.leadId, 'leadId');
    const lead = await tx.get('leads', leadId) as UnknownRecord | null;
    if (!lead) throw new QuoteDomainError(400, 'LEAD_NOT_FOUND', 'The linked lead does not exist.');
    if (lead.customerId && lead.customerId !== customerId) {
      throw new QuoteDomainError(400, 'QUOTE_LINK_MISMATCH', 'Quote customerId does not match the authoritative Lead.');
    }
    const attribution = await this.resolveLinkedLeadAttribution(tx, lead, actor);

    if (quote.packageId) {
      const packageRecord = await tx.get('packages', requireNonEmptyString(quote.packageId, 'packageId'));
      if (!packageRecord) throw new QuoteDomainError(400, 'PACKAGE_NOT_FOUND', 'The linked package does not exist.');
    }

    if (!quote.tripId) return attribution;
    const tripId = requireNonEmptyString(quote.tripId, 'tripId');
    const trip = await tx.get('trips', tripId) as UnknownRecord | null;
    if (!trip) throw new QuoteDomainError(400, 'TRIP_NOT_FOUND', 'The linked Trip does not exist.');

    try {
      assertAuthorizedResource(actor, 'TRIP', 'READ_DETAIL', tripResourceContext({ ...trip, id: tripId }));
    } catch (error) {
      translateAuthorizationError(error);
    }

    if (trip.customerId !== quote.customerId) {
      throw new QuoteDomainError(400, 'QUOTE_LINK_MISMATCH', 'Quote customerId does not match the authoritative Trip.');
    }
    if (trip.leadId && quote.leadId && trip.leadId !== quote.leadId) {
      throw new QuoteDomainError(400, 'QUOTE_LINK_MISMATCH', 'Quote leadId does not match the authoritative Trip.');
    }
    if (
      trip.assignedSalesEmployeeId !== attribution.ownerEmployeeId ||
      trip.salesTeamId !== attribution.salesTeamId
    ) {
      throw new QuoteDomainError(
        400,
        'QUOTE_LINK_MISMATCH',
        'Trip Sales owner/team does not match the authoritative Lead assignment.',
      );
    }

    // UX3: Trip-backed Quotes are commercial documents and may only be created
    // or revised from a fresh, authoritative Trip costing result.
    assertTripCostingFresh(trip, 'create or revise a Quote');
    const cost = finiteNonNegative(trip.totalSupplierCost, 'authoritative Trip totalSupplierCost');
    const quoteFields = await this.resolveTripQuoteFields(tx, tripId, trip, customer, quote);
    return {
      ...attribution,
      cost,
      sellingPrice: finiteNonNegative(trip.totalSellingPrice, 'authoritative Trip totalSellingPrice'),
      quoteFields,
      source: {
        type: 'TRIP',
        sourceId: tripId,
        asOf: typeof trip.updatedAt === 'string' ? trip.updatedAt : new Date().toISOString(),
        costingRevision: Number(trip.costingRevision || 0),
      },
    };
  }

  private async resolveTripQuoteFields(
    tx: ConversionTransaction,
    tripId: string,
    trip: UnknownRecord,
    customer: UnknownRecord,
    quote: UnknownRecord,
  ): Promise<UnknownRecord> {
    const days = await tx.findByField('itinerary_days', 'tripId', tripId, 60) as UnknownRecord[];
    const orderedDays = [...days].sort((left, right) => Number(left.dayNumber || 0) - Number(right.dayNumber || 0));
    const hotels: UnknownRecord[] = [];
    const transports: UnknownRecord[] = [];
    const activities: UnknownRecord[] = [];

    for (const day of orderedDays) {
      for (const item of Array.isArray(day.items) ? day.items : []) {
        if (!isRecord(item) || !['HOTEL', 'TRANSPORT', 'ACTIVITY'].includes(String(item.type))) continue;
        const metadata = item.metadata;
        if (!isRecord(metadata)) {
          throw new QuoteDomainError(
            422,
            'TRIP_SERVICE_LINKAGE_INCOMPLETE',
            `Trip service ${item.id || item.title || 'unknown'} is not linked to authoritative inventory.`,
          );
        }
        const sourceTripItemId = requireNonEmptyString(item.id, 'Trip itinerary item id');

        if (item.type === 'HOTEL') {
          const costSource = typeof metadata.costSource === 'string' ? metadata.costSource : 'INVENTORY_CONTRACTED';
          const ratePeriodId = typeof metadata.rateId === 'string' && metadata.rateId.trim() ? metadata.rateId.trim() : undefined;
          if (!ratePeriodId && costSource !== 'MANUAL_SUPPLIER_QUOTE') throw new QuoteDomainError(422, 'TRIP_SERVICE_LINKAGE_INCOMPLETE', `${sourceTripItemId} has no accommodation rate or approved manual supplier quote.`);
          hotels.push({
            id: sourceTripItemId,
            sourceTripItemId,
            hotelId: requireNonEmptyString(metadata.propertyId, `${sourceTripItemId}.metadata.propertyId`),
            propertyId: metadata.propertyId,
            hotelName: requireNonEmptyString(metadata.propertyName, `${sourceTripItemId}.metadata.propertyName`),
            roomCategoryId: requireNonEmptyString(metadata.roomCategoryId, `${sourceTripItemId}.metadata.roomCategoryId`),
            ...(ratePeriodId ? { ratePeriodId } : {}),
            roomType: requireNonEmptyString(metadata.roomCategoryName, `${sourceTripItemId}.metadata.roomCategoryName`),
            mealPlan: requireNonEmptyString(metadata.mealPlan, `${sourceTripItemId}.metadata.mealPlan`),
            checkInDate: requireNonEmptyString(metadata.checkInDate, `${sourceTripItemId}.metadata.checkInDate`),
            ...(metadata.checkOutDate ? { checkOutDate: metadata.checkOutDate } : {}),
            nights: positiveInteger(metadata.nights, `${sourceTripItemId}.metadata.nights`, true),
            roomsCount: positiveInteger(metadata.rooms ?? 1, `${sourceTripItemId}.metadata.rooms`, true),
            adultsCount: positiveInteger(metadata.adults ?? trip.adults ?? 1, `${sourceTripItemId}.metadata.adults`, true),
            childrenCount: nonNegativeInteger(metadata.children ?? trip.children ?? 0, `${sourceTripItemId}.metadata.children`) ?? 0,
            ...(typeof item.supplierCost === 'number' ? { supplierCost: finiteNonNegative(item.supplierCost, `${sourceTripItemId}.supplierCost`) } : {}),
            costSource,
            ...(isRecord(metadata.packageSupplierRate) ? { packageSupplierRate: metadata.packageSupplierRate } : {}),
            ...(typeof metadata.contractedTotalSupplierCost === 'number' ? { originalContractedTotal: metadata.contractedTotalSupplierCost } : {}),
            ...(Array.isArray(metadata.nightlyRateBreakdown) ? { nightlyRateBreakdown: metadata.nightlyRateBreakdown } : {}),
            ...(Array.isArray(metadata.roomAllocations) ? { roomAllocations: metadata.roomAllocations } : {}),
            ...(item.description ? { specialRequests: String(item.description) } : {}),
          });
        } else if (item.type === 'TRANSPORT') {
          const costSource = typeof metadata.costSource === 'string' ? metadata.costSource : 'INVENTORY_CONTRACTED';
          const ratePeriodId = typeof metadata.rateId === 'string' && metadata.rateId.trim() ? metadata.rateId.trim() : undefined;
          if (!ratePeriodId && costSource !== 'MANUAL_SUPPLIER_QUOTE') throw new QuoteDomainError(422, 'TRIP_SERVICE_LINKAGE_INCOMPLETE', `${sourceTripItemId} has no transport rate or approved manual supplier quote.`);
          transports.push({
            id: sourceTripItemId,
            sourceTripItemId,
            transportId: requireNonEmptyString(metadata.vehicleCategoryId, `${sourceTripItemId}.metadata.vehicleCategoryId`),
            vehicleCategoryId: metadata.vehicleCategoryId,
            ...(ratePeriodId ? { ratePeriodId } : {}),
            ...(metadata.routeId ? { transportRouteId: metadata.routeId } : {}),
            vehicleType: requireNonEmptyString(metadata.vehicleName, `${sourceTripItemId}.metadata.vehicleName`),
            route: String(metadata.routeName || item.description || metadata.serviceType || 'Trip itinerary service'),
            serviceDate: requireNonEmptyString(metadata.startDate, `${sourceTripItemId}.metadata.startDate`),
            days: positiveInteger(metadata.vehicleDays ?? 1, `${sourceTripItemId}.metadata.vehicleDays`, true),
            vehicleCount: positiveInteger(metadata.vehicleCount ?? 1, `${sourceTripItemId}.metadata.vehicleCount`, true),
            chargeableDays: positiveInteger(metadata.chargeableDays ?? metadata.vehicleDays ?? 1, `${sourceTripItemId}.metadata.chargeableDays`, true),
            ...(Array.isArray(metadata.serviceDays) ? { serviceDays: metadata.serviceDays } : {}),
            passengerCount: positiveInteger(trip.travelerCount ?? 1, 'Trip travelerCount', true),
            ...(typeof item.supplierCost === 'number' ? { supplierCost: finiteNonNegative(item.supplierCost, `${sourceTripItemId}.supplierCost`) } : {}),
            costSource,
            ...(isRecord(metadata.packageSupplierRate) ? { packageSupplierRate: metadata.packageSupplierRate } : {}),
            ...(typeof metadata.contractedTotalSupplierCost === 'number' ? { originalContractedTotal: metadata.contractedTotalSupplierCost } : {}),
            ...(metadata.pickupLocation ? { pickupLocation: metadata.pickupLocation } : {}),
            ...(metadata.dropoffLocation ? { dropoffLocation: metadata.dropoffLocation } : {}),
            ...(item.description ? { specialRequests: String(item.description) } : {}),
          });
        } else {
          const costSource = typeof metadata.costSource === 'string' ? metadata.costSource : 'INVENTORY_CONTRACTED';
          const ratePeriodId = typeof metadata.rateId === 'string' && metadata.rateId.trim() ? metadata.rateId.trim() : undefined;
          if (!ratePeriodId && costSource !== 'MANUAL_SUPPLIER_QUOTE') throw new QuoteDomainError(422, 'TRIP_SERVICE_LINKAGE_INCOMPLETE', `${sourceTripItemId} has no activity rate or approved manual supplier quote.`);
          const participants = Number(metadata.tickets || 0) ||
            (Number(metadata.adults || 0) + Number(metadata.children || 0)) ||
            Number(trip.travelerCount || 1);
          activities.push({
            id: sourceTripItemId,
            sourceTripItemId,
            activityId: requireNonEmptyString(metadata.activityId, `${sourceTripItemId}.metadata.activityId`),
            activityMasterId: metadata.activityId,
            ...(ratePeriodId ? { activityRatePeriodId: ratePeriodId } : {}),
            name: requireNonEmptyString(metadata.activityName, `${sourceTripItemId}.metadata.activityName`),
            activityName: metadata.activityName,
            serviceDate: requireNonEmptyString(metadata.date, `${sourceTripItemId}.metadata.date`),
            date: metadata.date,
            pax: positiveInteger(participants, `${sourceTripItemId}.participants`, true),
            pricingModel: metadata.pricingModel,
            inclusionStatus: metadata.inclusionStatus || 'INCLUDED',
            ...(typeof item.supplierCost === 'number' ? { supplierCost: finiteNonNegative(item.supplierCost, `${sourceTripItemId}.supplierCost`) } : {}),
            costSource,
            ...(isRecord(metadata.packageSupplierRate) ? { packageSupplierRate: metadata.packageSupplierRate } : {}),
            ...(typeof metadata.contractedTotalSupplierCost === 'number' ? { originalContractedTotal: metadata.contractedTotalSupplierCost } : {}),
            ...(item.description ? { specialRequests: String(item.description) } : {}),
          });
        }
      }
    }

    if (hotels.length + transports.length + activities.length === 0) {
      throw new QuoteDomainError(422, 'TRIP_HAS_NO_QUOTABLE_SERVICES', 'The Trip has no inventory-linked services to quote.');
    }

    const backupAccommodations = await this.resolveBackupAccommodations(
      tx,
      Array.isArray(quote.backupAccommodations) ? quote.backupAccommodations : [],
      hotels,
    );
    const startDate = typeof trip.startDate === 'string' ? trip.startDate : '';
    const endDate = typeof trip.endDate === 'string' ? trip.endDate : startDate;
    const durationDays = startDate && endDate
      ? Math.max(1, Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86_400_000) + 1)
      : orderedDays.length;

    return {
      leadId: trip.leadId,
      customerId: trip.customerId,
      customerName: customer.name || quote.customerName,
      ...(customer.phone ? { customerPhone: customer.phone } : {}),
      ...(customer.email ? { customerEmail: customer.email } : {}),
      destination: trip.destination,
      tripId,
      travelerCount: trip.travelerCount,
      adults: trip.adults,
      children: trip.children,
      durationDays,
      durationNights: Math.max(0, durationDays - 1),
      hotels,
      transports,
      activities,
      backupAccommodations,
      ...(trip.supplierCostBreakdown ? { supplierCostBreakdown: trip.supplierCostBreakdown } : {}),
      pricingMode: trip.pricingMode || 'SELLING_PRICE',
      pricingInput: trip.pricingInput ?? trip.totalSellingPrice,
      requiresLowMarginApproval: trip.commercialApproval?.required === true,
      approval: trip.commercialApproval
        ? { ...trip.commercialApproval }
        : { required: false, state: 'NOT_REQUIRED' },
    };
  }

  private async resolveBackupAccommodations(
    tx: ConversionTransaction,
    selections: UnknownRecord[],
    primaryHotels: UnknownRecord[],
  ): Promise<UnknownRecord[]> {
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    const result: UnknownRecord[] = [];
    for (const selection of selections) {
      if (!isRecord(selection)) throw new QuoteDomainError(400, 'INVALID_BACKUP_ACCOMMODATION', 'Backup accommodation must be an object.');
      const sourceTripItemId = requireNonEmptyString(selection.sourceTripItemId, 'backupAccommodations.sourceTripItemId');
      const primary = primaryHotels.find(item => item.sourceTripItemId === sourceTripItemId);
      if (!primary) throw new QuoteDomainError(422, 'INVALID_BACKUP_ACCOMMODATION', 'Backup accommodation does not reference a primary Trip hotel service.');
      const nextCount = (counts.get(sourceTripItemId) || 0) + 1;
      if (nextCount > 2) throw new QuoteDomainError(422, 'TOO_MANY_BACKUP_ACCOMMODATIONS', 'At most two backup hotels may be selected for each primary stay.');
      counts.set(sourceTripItemId, nextCount);

      const propertyId = requireNonEmptyString(selection.propertyId, 'backupAccommodations.propertyId');
      const roomCategoryId = requireNonEmptyString(selection.roomCategoryId, 'backupAccommodations.roomCategoryId');
      const ratePeriodId = requireNonEmptyString(selection.ratePeriodId, 'backupAccommodations.ratePeriodId');
      const key = `${sourceTripItemId}:${ratePeriodId}`;
      if (seen.has(key)) throw new QuoteDomainError(422, 'DUPLICATE_BACKUP_ACCOMMODATION', 'The same backup rate cannot be selected twice.');
      seen.add(key);
      if (propertyId === primary.propertyId && roomCategoryId === primary.roomCategoryId && ratePeriodId === primary.ratePeriodId) {
        throw new QuoteDomainError(422, 'INVALID_BACKUP_ACCOMMODATION', 'The primary stay cannot also be its own backup.');
      }

      const [property, room, rate] = await Promise.all([
        tx.get('accommodation_properties', propertyId),
        tx.get('room_categories', roomCategoryId),
        tx.get('rate_periods', ratePeriodId),
      ]);
      const checkInDate = String(primary.checkInDate || '');
      const mealPlan = requireNonEmptyString(selection.mealPlan, 'backupAccommodations.mealPlan');
      const dateValid = typeof rate?.validFrom === 'string' && checkInDate >= rate.validFrom.slice(0, 10) &&
        (!rate.validTo || checkInDate <= String(rate.validTo).slice(0, 10));
      if (!property || !room || !rate || property.status !== 'ACTIVE' || room.active !== true || rate.status !== 'ACTIVE' ||
        room.propertyId !== propertyId || rate.propertyId !== propertyId || rate.roomCategoryId !== roomCategoryId ||
        rate.mealPlan !== mealPlan || !dateValid) {
        throw new QuoteDomainError(422, 'INVALID_BACKUP_ACCOMMODATION', 'Backup hotel inventory or rate is inactive, invalid, or not valid for the Trip dates.');
      }
      result.push({
        id: `backup-${sourceTripItemId}-${ratePeriodId}`,
        sourceTripItemId,
        propertyId,
        propertyName: property.name,
        roomCategoryId,
        roomCategoryName: room.name,
        ratePeriodId,
        mealPlan,
        checkInDate,
        ...(primary.checkOutDate ? { checkOutDate: primary.checkOutDate } : {}),
        nights: primary.nights,
        roomsCount: primary.roomsCount,
        adultsCount: primary.adultsCount,
        childrenCount: primary.childrenCount,
      });
    }
    return result;
  }

  private async resolveLinkedLeadAttribution(
    tx: ConversionTransaction,
    lead: UnknownRecord,
    actor: QuoteMutationActor,
  ): Promise<{ ownerEmployeeId: string; ownerEmployeeName: string; salesTeamId: string }> {
    const ownerEmployeeId = typeof lead.assignedEmployeeId === 'string'
      ? lead.assignedEmployeeId.trim()
      : '';
    if (!ownerEmployeeId) {
      throw new QuoteDomainError(
        403,
        'LINKED_LEAD_ACCESS_DENIED',
        'The linked Lead must have a stable assigned Sales employee.',
      );
    }

    if (actor.role === 'Sales Executive') {
      if (ownerEmployeeId !== actor.employeeId) {
        throw new QuoteDomainError(
          403,
          'LINKED_LEAD_ACCESS_DENIED',
          'Sales Executives may only create or update Quotes linked to their own assigned Lead.',
        );
      }
      if (!actor.salesTeamId) {
        throw new QuoteDomainError(403, 'MISSING_TEAM_METADATA', 'Sales Executive team metadata is required.');
      }
      return {
        ownerEmployeeId,
        ownerEmployeeName: actor.name,
        salesTeamId: actor.salesTeamId,
      };
    }

    if (actor.role === 'Sales Manager' && ownerEmployeeId === actor.employeeId) {
      if (!actor.salesTeamId) {
        throw new QuoteDomainError(403, 'MISSING_TEAM_METADATA', 'Sales Manager team metadata is required.');
      }
      return {
        ownerEmployeeId,
        ownerEmployeeName: actor.name,
        salesTeamId: actor.salesTeamId,
      };
    }

    const employeeMatches = await tx.findByField('employees', 'employeeId', ownerEmployeeId, 2) as UnknownRecord[];
    if (employeeMatches.length > 1) {
      throw new QuoteDomainError(
        403,
        'LINKED_LEAD_ACCESS_DENIED',
        'The linked Lead employee identity is ambiguous.',
      );
    }
    // Migration-compatible fallback only. Stage A permits employee document
    // IDs to differ from stable employeeId, so the explicit field query is
    // authoritative whenever it exists.
    const assignedEmployee = employeeMatches[0]
      ?? await tx.get('employees', ownerEmployeeId) as UnknownRecord | null;
    const ownerRole = assignedEmployee?.role;
    const employeeTeamId = assignedEmployee?.salesTeamId ?? assignedEmployee?.teamId;
    if (
      !assignedEmployee ||
      assignedEmployee.active !== true ||
      (ownerRole !== 'Sales Executive' && ownerRole !== 'Sales Manager') ||
      typeof employeeTeamId !== 'string' ||
      !employeeTeamId.trim()
    ) {
      throw new QuoteDomainError(
        403,
        'LINKED_LEAD_ACCESS_DENIED',
        'The linked Lead must resolve to one active Sales employee with team metadata.',
      );
    }

    const salesTeamId = employeeTeamId.trim();
    if (actor.role === 'Sales Manager' && (!actor.salesTeamId || salesTeamId !== actor.salesTeamId)) {
      throw new QuoteDomainError(
        403,
        'LINKED_LEAD_ACCESS_DENIED',
        'Sales Managers may only create or update Quotes linked to a Lead in their sales team.',
      );
    }

    return {
      ownerEmployeeId,
      ownerEmployeeName: typeof assignedEmployee.name === 'string' && assignedEmployee.name.trim()
        ? assignedEmployee.name.trim()
        : ownerEmployeeId,
      salesTeamId,
    };
  }
}
