import type { AuditLog, Quote, QuoteStatus, QuoteVersion } from '../../src/types/index.js';
import {
  FirestoreConversionStorageProvider,
  type ConversionStorageProvider,
  type ConversionTransaction,
} from '../../src/services/conversion/conversionStorageProvider.js';
import { assertAuthorizedResource, ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { quoteResourceContext, tripResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';

type UnknownRecord = Record<string, any>;

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
  'inclusions', 'exclusions', 'termsAndConditions',
]);

const UPDATE_FIELDS = new Set([...CREATE_FIELDS, 'status']);

const SERVER_CONTROLLED_FIELDS = new Set([
  'id', 'salesEmployeeId', 'salesEmployeeName', 'salesTeamId', 'createdByEmployeeId',
  'updatedByEmployeeId', 'createdAt', 'updatedAt', 'version', 'versionHistory',
  'totalSupplierCost', 'grossProfit', 'grossMargin', 'profit', 'finalAmount',
  'supplierCostSource', 'requiresLowMarginApproval', 'approval', 'convertedBookingId',
  'convertedAt', 'convertedBy', 'isDemo',
]);

const NESTED_FINANCIAL_FIELDS = new Set([
  'supplierCost', 'totalSupplierCost', 'grossProfit', 'grossMargin', 'profit',
  'internalCost', 'supplierPayment', 'quotedRate',
]);

const HOTEL_FIELDS = new Set([
  'id', 'hotelId', 'hotelName', 'propertyId', 'roomCategoryId', 'ratePeriodId',
  'negotiatedRateId', 'roomType', 'mealPlan', 'checkInDate', 'checkOutDate', 'nights',
  'roomsCount', 'rooms', 'adultsCount', 'childrenCount', 'rate',
  'isFoc', 'focReason', 'guestNames', 'specialRequests',
]);

const TRANSPORT_FIELDS = new Set([
  'id', 'transportId', 'vehicleCategoryId', 'transportRouteId', 'ratePeriodId',
  'vehicleType', 'route', 'serviceDate', 'days', 'passengerCount', 'pickupLocation',
  'dropoffLocation', 'rate', 'isFoc', 'focReason', 'specialRequests',
]);

const ACTIVITY_FIELDS = new Set([
  'id', 'activityId', 'activityMasterId', 'activityRatePeriodId', 'name',
  'activityName', 'destinationId', 'destinationName', 'serviceDate', 'date', 'pax',
  'rate', 'isFoc', 'focReason', 'specialRequests',
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
    'termsAndConditions',
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

  const hotels = sanitizeItems(input.hotels, 'hotels', HOTEL_FIELDS);
  const transports = sanitizeItems(input.transports, 'transports', TRANSPORT_FIELDS);
  const activities = sanitizeItems(input.activities, 'activities', ACTIVITY_FIELDS);
  if (hotels !== undefined) output.hotels = hotels;
  if (transports !== undefined) output.transports = transports;
  if (activities !== undefined) output.activities = activities;

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
    ...(quote.notes !== undefined ? { notes: quote.notes } : {}),
    ...(quote.inclusions !== undefined ? { inclusions: quote.inclusions } : {}),
    ...(quote.exclusions !== undefined ? { exclusions: quote.exclusions } : {}),
    ...(quote.termsAndConditions !== undefined ? { termsAndConditions: quote.termsAndConditions } : {}),
  };
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
    reason: action === 'QUOTE_CREATED' ? 'Server-authoritative Quote created.' : 'Server-authoritative Quote revision saved.',
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

  async createQuote(rawInput: unknown, actor: QuoteMutationActor): Promise<Quote> {
    const input = sanitizeInput(rawInput, 'CREATE');
    validateRequiredCreateFields(input);
    if ((actor.role === 'Sales Executive' || actor.role === 'Sales Manager') && !actor.salesTeamId) {
      throw new QuoteDomainError(403, 'MISSING_TEAM_METADATA', 'A Sales employee must belong to a sales team to create Quotes.');
    }

    const quoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    return this.storage.runTransaction(async tx => {
      const linkage = await this.resolveSupplierCostAndLinks(tx, input, actor);
      const financials = calculateFinancials(input.totalAmount, input.discountAmount, linkage.cost);
      const quote: Quote = {
        ...input,
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

      try {
        assertAuthorizedResource(actor, 'QUOTE', 'UPDATE_COMMERCIAL', quoteResourceContext(quote));
      } catch (error) {
        translateAuthorizationError(error);
      }

      const audit = auditEvent('QUOTE_CREATED', quoteId, actor, null, quote as UnknownRecord, now);
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
      const financials = calculateFinancials(
        finiteNonNegative(merged.totalAmount, 'totalAmount'),
        finiteNonNegative(merged.discountAmount, 'discountAmount'),
        supplier.cost,
      );

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
      const updated: Quote = {
        ...stored,
        ...input,
        ...financials,
        status: nextStatus,
        version: (stored.version || 1) + 1,
        versionHistory: history,
        updatedAt: now,
        updatedByEmployeeId: actor.employeeId,
        ...(supplier.source ? { supplierCostSource: supplier.source } : {}),
      };
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
    source?: { type: 'TRIP'; sourceId: string; asOf: string };
    ownerEmployeeId: string;
    ownerEmployeeName: string;
    salesTeamId: string;
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

    // D2B: zero is only commercially authoritative after the pricing engine
    // explicitly marks the persisted Trip as calculated. Pending itinerary
    // changes may still show the previous aggregate, so Quotes remain draft
    // and cannot progress until a fresh calculation completes.
    if (trip.costingStatus !== 'CALCULATED') {
      return attribution;
    }
    const cost = finiteNonNegative(trip.totalSupplierCost, 'authoritative Trip totalSupplierCost');
    return {
      ...attribution,
      cost,
      source: {
        type: 'TRIP',
        sourceId: tripId,
        asOf: typeof trip.updatedAt === 'string' ? trip.updatedAt : new Date().toISOString(),
      },
    };
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
