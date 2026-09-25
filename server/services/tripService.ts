import type { AuditLog, ItineraryDay, ItineraryItem, Trip } from '../../src/types/index.js';
import {
  FirestoreConversionStorageProvider,
  type ConversionStorageProvider,
  type ConversionTransaction,
} from '../../src/services/conversion/conversionStorageProvider.js';
import { assertAuthorizedResource, ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { tripResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';

type UnknownRecord = Record<string, any>;

export interface TripMutationActor extends AuthorizationPrincipal {
  name: string;
  email?: string;
  isDemo?: boolean;
}

export class TripDomainError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'TripDomainError';
  }
}

const MUTATION_ROLES = new Set(['Founder', 'Admin', 'Sales Manager', 'Sales Executive']);
const WRITABLE_FIELDS = new Set([
  'customerId', 'leadId', 'title', 'destination', 'startDate', 'endDate',
  'travelerCount', 'adults', 'children', 'tripType', 'currency', 'budget',
  'totalSellingPrice',
]);
const SERVER_CONTROLLED_FIELDS = new Set([
  'id', 'status', 'totalSupplierCost', 'totalCost', 'grossProfit', 'grossMargin',
  'profit', 'margin', 'assignedSalesEmployeeId', 'salesTeamId',
  'assignedReservationsEmployeeId', 'assignedOperationsEmployeeId',
  'createdByEmployeeId', 'updatedByEmployeeId', 'createdAt', 'updatedAt',
  'isDemo', 'schemaVersion', 'costingStatus',
]);
const ITINERARY_DAY_FIELDS = new Set(['date', 'title', 'description', 'location', 'notes']);
const ITINERARY_ITEM_FIELDS = new Set([
  'type', 'title', 'description', 'startTime', 'endTime', 'referenceId',
  'inventoryId', 'sellingPrice', 'notes', 'metadata', 'transportMetadata', 'activityMetadata',
]);
const ITINERARY_SERVER_CONTROLLED_FIELDS = new Set([
  'id', 'tripId', 'dayId', 'dayNumber', 'items', 'status', 'owner', 'team',
  'assignedSalesEmployeeId', 'salesTeamId', 'supplierCost', 'totalSupplierCost',
  'grossProfit', 'grossMargin', 'costingStatus', 'createdAt', 'updatedAt',
]);
const NESTED_PROTECTED_ITINERARY_FIELDS = new Set([
  'supplierCost', 'totalSupplierCost', 'grossProfit', 'grossMargin',
  'assignedSalesEmployeeId', 'salesTeamId', 'status', 'costingStatus',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeInput(rawInput: unknown): UnknownRecord {
  if (!isRecord(rawInput)) {
    throw new TripDomainError(400, 'INVALID_TRIP_PAYLOAD', 'Trip payload must be an object.');
  }

  const result: UnknownRecord = {};
  for (const [key, value] of Object.entries(rawInput)) {
    if (SERVER_CONTROLLED_FIELDS.has(key)) {
      throw new TripDomainError(400, 'SERVER_CONTROLLED_TRIP_FIELD', `${key} is controlled by the server.`);
    }
    if (!WRITABLE_FIELDS.has(key)) {
      throw new TripDomainError(400, 'UNSUPPORTED_TRIP_FIELD', `${key} is not a permitted Trip mutation field.`);
    }
    result[key] = value;
  }
  return result;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TripDomainError(400, 'INVALID_TRIP_FIELD', `${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalNonEmptyString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return nonEmptyString(value, field);
}

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TripDomainError(400, 'INVALID_TRIP_FIELD', `${field} must be a finite, non-negative number.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = finiteNonNegative(value, field);
  if (!Number.isInteger(parsed)) {
    throw new TripDomainError(400, 'INVALID_TRIP_FIELD', `${field} must be an integer.`);
  }
  return parsed;
}

function validateDate(value: unknown, field: string): string {
  const date = nonEmptyString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new TripDomainError(400, 'INVALID_TRIP_FIELD', `${field} must be a valid YYYY-MM-DD date.`);
  }
  return date;
}

function validateTripFields(value: UnknownRecord): UnknownRecord {
  const adults = nonNegativeInteger(value.adults, 'adults');
  const children = nonNegativeInteger(value.children, 'children');
  if (adults < 1) {
    throw new TripDomainError(400, 'INVALID_TRIP_FIELD', 'adults must be at least 1.');
  }
  const travelerCount = adults + children;
  if (value.travelerCount !== undefined && nonNegativeInteger(value.travelerCount, 'travelerCount') !== travelerCount) {
    throw new TripDomainError(400, 'INVALID_TRIP_FIELD', 'travelerCount must equal adults plus children.');
  }

  const startDate = validateDate(value.startDate, 'startDate');
  const endDate = validateDate(value.endDate, 'endDate');
  if (endDate < startDate) {
    throw new TripDomainError(400, 'INVALID_TRIP_FIELD', 'endDate cannot be before startDate.');
  }

  const totalSellingPrice = finiteNonNegative(value.totalSellingPrice, 'totalSellingPrice');
  const budget = value.budget === undefined ? undefined : finiteNonNegative(value.budget, 'budget');
  const currency = nonEmptyString(value.currency, 'currency').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new TripDomainError(400, 'INVALID_TRIP_FIELD', 'currency must be a three-letter currency code.');
  }

  return {
    customerId: nonEmptyString(value.customerId, 'customerId'),
    ...(optionalNonEmptyString(value.leadId, 'leadId') ? { leadId: optionalNonEmptyString(value.leadId, 'leadId') } : {}),
    title: nonEmptyString(value.title, 'title'),
    destination: nonEmptyString(value.destination, 'destination'),
    startDate,
    endDate,
    travelerCount,
    adults,
    children,
    tripType: nonEmptyString(value.tripType, 'tripType'),
    currency,
    ...(budget !== undefined ? { budget } : {}),
    totalSellingPrice,
  };
}

function calculateFinancials(totalSellingPrice: number, totalSupplierCost: number) {
  const grossProfit = totalSellingPrice - totalSupplierCost;
  return {
    totalSupplierCost,
    totalSellingPrice,
    grossProfit,
    grossMargin: totalSellingPrice > 0
      ? Number(((grossProfit / totalSellingPrice) * 100).toFixed(1))
      : 0,
  };
}

function sanitizeItineraryDayInput(rawInput: unknown, mode: 'CREATE' | 'UPDATE'): UnknownRecord {
  if (rawInput === undefined && mode === 'CREATE') return {};
  if (!isRecord(rawInput)) {
    throw new TripDomainError(400, 'INVALID_ITINERARY_PAYLOAD', 'Itinerary day payload must be an object.');
  }
  const output: UnknownRecord = {};
  for (const [key, value] of Object.entries(rawInput)) {
    if (ITINERARY_SERVER_CONTROLLED_FIELDS.has(key)) {
      throw new TripDomainError(400, 'SERVER_CONTROLLED_ITINERARY_FIELD', `${key} is controlled by the server.`);
    }
    if (!ITINERARY_DAY_FIELDS.has(key)) {
      throw new TripDomainError(400, 'UNSUPPORTED_ITINERARY_FIELD', `${key} is not a permitted itinerary day field.`);
    }
    if (key === 'date') output.date = validateDate(value, 'date');
    else output[key] = nonEmptyString(value, key);
  }
  return output;
}

function assertNoNestedProtectedFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoNestedProtectedFields(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (NESTED_PROTECTED_ITINERARY_FIELDS.has(key)) {
      throw new TripDomainError(400, 'SERVER_CONTROLLED_ITINERARY_FIELD', `${key} is controlled by the server.`);
    }
    assertNoNestedProtectedFields(nested);
  }
}

function sanitizeItineraryItemInput(rawInput: unknown): UnknownRecord {
  if (!isRecord(rawInput)) {
    throw new TripDomainError(400, 'INVALID_ITINERARY_PAYLOAD', 'Itinerary item payload must be an object.');
  }
  const output: UnknownRecord = {};
  let metadata: unknown;
  for (const [key, value] of Object.entries(rawInput)) {
    if (ITINERARY_SERVER_CONTROLLED_FIELDS.has(key)) {
      throw new TripDomainError(400, 'SERVER_CONTROLLED_ITINERARY_FIELD', `${key} is controlled by the server.`);
    }
    if (!ITINERARY_ITEM_FIELDS.has(key)) {
      throw new TripDomainError(400, 'UNSUPPORTED_ITINERARY_FIELD', `${key} is not a permitted itinerary item field.`);
    }
    if (key === 'metadata' || key === 'transportMetadata' || key === 'activityMetadata') {
      metadata ??= value;
      continue;
    }
    if (key === 'sellingPrice') {
      output.sellingPrice = finiteNonNegative(value, 'sellingPrice');
    } else {
      output[key] = nonEmptyString(value, key);
    }
  }

  const validTypes = new Set(['HOTEL', 'TRANSPORT', 'ACTIVITY', 'MEAL', 'SIGHTSEEING', 'TRANSFER', 'FREE_TIME', 'OTHER']);
  if (!validTypes.has(nonEmptyString(output.type, 'type'))) {
    throw new TripDomainError(400, 'INVALID_ITINERARY_FIELD', 'type is not a recognized itinerary item type.');
  }
  output.title = nonEmptyString(output.title, 'title');
  output.description = nonEmptyString(output.description, 'description');
  if (metadata !== undefined) {
    if (!isRecord(metadata)) {
      throw new TripDomainError(400, 'INVALID_ITINERARY_FIELD', 'metadata must be an object.');
    }
    assertNoNestedProtectedFields(metadata);
    output.metadata = metadata;
  }
  return output;
}

function nextItineraryDate(trip: UnknownRecord, dayNumber: number): string {
  const startDate = validateDate(trip.startDate, 'Trip startDate');
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayNumber - 1);
  return date.toISOString().slice(0, 10);
}

function translateAuthorizationError(error: unknown): never {
  if (error instanceof ResourceAuthorizationError) {
    throw new TripDomainError(403, 'RESOURCE_ACCESS_DENIED', error.message, error.decision);
  }
  throw error;
}

function auditEvent(
  action: string,
  entityType: 'TRIP' | 'ITINERARY_DAY' | 'ITINERARY_ITEM',
  entityId: string,
  actor: TripMutationActor,
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
    entityType,
    entityId,
    before,
    after,
    reason: `Server-authoritative ${entityType} mutation: ${action}.`,
  };
}

export class TripService {
  constructor(private readonly storage: ConversionStorageProvider = new FirestoreConversionStorageProvider()) {}

  async createTrip(rawInput: unknown, actor: TripMutationActor): Promise<Trip> {
    if (!MUTATION_ROLES.has(actor.role)) {
      throw new TripDomainError(403, 'ROLE_DENIED', 'This role cannot create Trips.');
    }
    const input = validateTripFields(sanitizeInput(rawInput));
    const tripId = `trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    return this.storage.runTransaction(async tx => {
      const attribution = await this.resolveAttribution(tx, input, actor);
      const financials = calculateFinancials(input.totalSellingPrice, 0);
      const trip: Trip = {
        ...input,
        ...financials,
        id: tripId,
        status: 'DRAFT',
        costingStatus: 'PENDING',
        assignedSalesEmployeeId: attribution.ownerEmployeeId,
        salesTeamId: attribution.salesTeamId,
        createdByEmployeeId: actor.employeeId,
        updatedByEmployeeId: actor.employeeId,
        createdAt: now,
        updatedAt: now,
        ...(actor.isDemo ? { isDemo: true } : {}),
      } as Trip;

      try {
        assertAuthorizedResource(actor, 'TRIP', 'UPDATE_COMMERCIAL', tripResourceContext(trip));
      } catch (error) {
        translateAuthorizationError(error);
      }

      const audit = auditEvent('TRIP_CREATED', 'TRIP', tripId, actor, null, trip as UnknownRecord, now);
      tx.set('trips', tripId, trip);
      tx.set('audit_logs', audit.id, audit);
      return trip;
    });
  }

  async updateTrip(tripId: string, rawInput: unknown, actor: TripMutationActor): Promise<Trip> {
    nonEmptyString(tripId, 'tripId');
    if (!MUTATION_ROLES.has(actor.role)) {
      throw new TripDomainError(403, 'ROLE_DENIED', 'This role cannot update commercial Trip data.');
    }
    const input = sanitizeInput(rawInput);
    if (Object.keys(input).length === 0) {
      throw new TripDomainError(400, 'EMPTY_TRIP_UPDATE', 'No permitted Trip fields were supplied.');
    }

    return this.storage.runTransaction(async tx => {
      const stored = await tx.get('trips', tripId) as UnknownRecord | null;
      if (!stored) throw new TripDomainError(404, 'TRIP_NOT_FOUND', 'Trip not found.');

      try {
        assertAuthorizedResource(actor, 'TRIP', 'UPDATE_COMMERCIAL', tripResourceContext(stored));
      } catch (error) {
        translateAuthorizationError(error);
      }

      const normalizedStored = {
        ...stored,
        totalSupplierCost: stored.totalSupplierCost ?? stored.totalCost,
      };
      const validated = validateTripFields({ ...normalizedStored, ...input });
      const attribution = await this.resolveAttribution(tx, validated, actor, {
        ownerEmployeeId: stored.assignedSalesEmployeeId,
        salesTeamId: stored.salesTeamId,
      });
      if (
        attribution.ownerEmployeeId !== stored.assignedSalesEmployeeId ||
        attribution.salesTeamId !== stored.salesTeamId
      ) {
        throw new TripDomainError(
          409,
          'TRIP_OWNERSHIP_TRANSFER_NOT_ALLOWED',
          'Changing Trip linkage cannot transfer its Sales owner or team.',
        );
      }

      const authoritativeCost = finiteNonNegative(normalizedStored.totalSupplierCost, 'authoritative Trip totalSupplierCost');
      const now = new Date().toISOString();
      const updated: Trip = {
        ...stored,
        ...validated,
        ...calculateFinancials(validated.totalSellingPrice, authoritativeCost),
        id: tripId,
        status: stored.status,
        assignedSalesEmployeeId: stored.assignedSalesEmployeeId,
        salesTeamId: stored.salesTeamId,
        createdAt: stored.createdAt,
        updatedByEmployeeId: actor.employeeId,
        updatedAt: now,
      } as Trip;
      delete (updated as UnknownRecord).totalCost;

      const audit = auditEvent('TRIP_UPDATED', 'TRIP', tripId, actor, stored, updated as UnknownRecord, now);
      tx.update('trips', tripId, updated);
      tx.set('audit_logs', audit.id, audit);
      return updated;
    });
  }

  async createItineraryDay(tripId: string, rawInput: unknown, actor: TripMutationActor): Promise<{ day: ItineraryDay; trip: Trip }> {
    nonEmptyString(tripId, 'tripId');
    const input = sanitizeItineraryDayInput(rawInput, 'CREATE');
    return this.storage.runTransaction(async tx => {
      const trip = await this.loadAuthorizedCommercialTrip(tx, tripId, actor);
      const existingDays = await tx.findByField('itinerary_days', 'tripId', tripId, 500) as ItineraryDay[];
      const dayNumber = existingDays.reduce((highest, day) => Math.max(highest, Number(day.dayNumber) || 0), 0) + 1;
      const now = new Date().toISOString();
      const day: ItineraryDay = {
        id: `day-${tripId}-${dayNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tripId,
        dayNumber,
        date: typeof input.date === 'string' ? input.date : nextItineraryDate(trip, dayNumber),
        title: typeof input.title === 'string' ? input.title : `Day ${dayNumber}`,
        location: typeof input.location === 'string' ? input.location : String(trip.destination || 'Location'),
        description: typeof input.description === 'string' ? input.description : '',
        ...(typeof input.notes === 'string' ? { notes: input.notes } : {}),
        items: [],
      };
      const updatedTrip = this.markCostingPending(trip, actor, now);
      tx.set('itinerary_days', day.id, day);
      tx.update('trips', tripId, updatedTrip);
      const audit = auditEvent('ITINERARY_DAY_CREATED', 'ITINERARY_DAY', day.id, actor, null, day as UnknownRecord, now);
      tx.set('audit_logs', audit.id, audit);
      return { day, trip: updatedTrip as Trip };
    });
  }

  async updateItineraryDay(dayId: string, rawInput: unknown, actor: TripMutationActor): Promise<{ day: ItineraryDay; trip: Trip }> {
    nonEmptyString(dayId, 'dayId');
    const input = sanitizeItineraryDayInput(rawInput, 'UPDATE');
    if (Object.keys(input).length === 0) {
      throw new TripDomainError(400, 'EMPTY_ITINERARY_UPDATE', 'No permitted itinerary day fields were supplied.');
    }
    return this.storage.runTransaction(async tx => {
      const storedDay = await tx.get('itinerary_days', dayId) as ItineraryDay | null;
      if (!storedDay) throw new TripDomainError(404, 'ITINERARY_DAY_NOT_FOUND', 'Itinerary day not found.');
      const trip = await this.loadAuthorizedCommercialTrip(tx, storedDay.tripId, actor);
      const now = new Date().toISOString();
      const day = { ...storedDay, ...input, id: storedDay.id, tripId: storedDay.tripId, dayNumber: storedDay.dayNumber, items: storedDay.items || [] } as ItineraryDay;
      const updatedTrip = this.markCostingPending(trip, actor, now);
      tx.update('itinerary_days', dayId, day);
      tx.update('trips', trip.id, updatedTrip);
      const audit = auditEvent('ITINERARY_DAY_UPDATED', 'ITINERARY_DAY', dayId, actor, storedDay as UnknownRecord, day as UnknownRecord, now);
      tx.set('audit_logs', audit.id, audit);
      return { day, trip: updatedTrip as Trip };
    });
  }

  async deleteItineraryDay(dayId: string, actor: TripMutationActor): Promise<{ trip: Trip }> {
    nonEmptyString(dayId, 'dayId');
    return this.storage.runTransaction(async tx => {
      const storedDay = await tx.get('itinerary_days', dayId) as ItineraryDay | null;
      if (!storedDay) throw new TripDomainError(404, 'ITINERARY_DAY_NOT_FOUND', 'Itinerary day not found.');
      const trip = await this.loadAuthorizedCommercialTrip(tx, storedDay.tripId, actor);
      const now = new Date().toISOString();
      const updatedTrip = this.markCostingPending(trip, actor, now);
      tx.delete('itinerary_days', dayId);
      tx.update('trips', trip.id, updatedTrip);
      const audit = auditEvent('ITINERARY_DAY_DELETED', 'ITINERARY_DAY', dayId, actor, storedDay as UnknownRecord, {}, now);
      tx.set('audit_logs', audit.id, audit);
      return { trip: updatedTrip as Trip };
    });
  }

  async addItineraryItem(dayId: string, rawInput: unknown, actor: TripMutationActor): Promise<{ day: ItineraryDay; item: ItineraryItem; trip: Trip }> {
    nonEmptyString(dayId, 'dayId');
    const input = sanitizeItineraryItemInput(rawInput);
    return this.storage.runTransaction(async tx => {
      const storedDay = await tx.get('itinerary_days', dayId) as ItineraryDay | null;
      if (!storedDay) throw new TripDomainError(404, 'ITINERARY_DAY_NOT_FOUND', 'Itinerary day not found.');
      const trip = await this.loadAuthorizedCommercialTrip(tx, storedDay.tripId, actor);
      const now = new Date().toISOString();
      const item: ItineraryItem = {
        ...input,
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        dayId,
        tripId: storedDay.tripId,
      } as ItineraryItem;
      const day: ItineraryDay = { ...storedDay, items: [...(storedDay.items || []), item] };
      const updatedTrip = this.markCostingPending(trip, actor, now);
      tx.update('itinerary_days', dayId, day);
      tx.update('trips', trip.id, updatedTrip);
      const audit = auditEvent('ITINERARY_ITEM_CREATED', 'ITINERARY_ITEM', item.id, actor, null, item as UnknownRecord, now);
      tx.set('audit_logs', audit.id, audit);
      return { day, item, trip: updatedTrip as Trip };
    });
  }

  async deleteItineraryItem(dayId: string, itemId: string, actor: TripMutationActor): Promise<{ day: ItineraryDay; trip: Trip }> {
    nonEmptyString(dayId, 'dayId');
    nonEmptyString(itemId, 'itemId');
    return this.storage.runTransaction(async tx => {
      const storedDay = await tx.get('itinerary_days', dayId) as ItineraryDay | null;
      if (!storedDay) throw new TripDomainError(404, 'ITINERARY_DAY_NOT_FOUND', 'Itinerary day not found.');
      const item = (storedDay.items || []).find(candidate => candidate.id === itemId);
      if (!item) throw new TripDomainError(404, 'ITINERARY_ITEM_NOT_FOUND', 'Itinerary item not found.');
      const trip = await this.loadAuthorizedCommercialTrip(tx, storedDay.tripId, actor);
      const now = new Date().toISOString();
      const day: ItineraryDay = { ...storedDay, items: (storedDay.items || []).filter(candidate => candidate.id !== itemId) };
      const updatedTrip = this.markCostingPending(trip, actor, now);
      tx.update('itinerary_days', dayId, day);
      tx.update('trips', trip.id, updatedTrip);
      const audit = auditEvent('ITINERARY_ITEM_DELETED', 'ITINERARY_ITEM', itemId, actor, item as UnknownRecord, {}, now);
      tx.set('audit_logs', audit.id, audit);
      return { day, trip: updatedTrip as Trip };
    });
  }

  async deleteTrip(tripId: string, actor: TripMutationActor): Promise<void> {
    nonEmptyString(tripId, 'tripId');
    return this.storage.runTransaction(async tx => {
      const trip = await this.loadAuthorizedCommercialTrip(tx, tripId, actor);
      if (trip.status !== 'DRAFT' && trip.status !== 'ITINERARY_READY') {
        throw new TripDomainError(
          409,
          'TRIP_DELETION_WORKFLOW_DENIED',
          'Only Draft or Itinerary Ready Trips may be deleted; confirmed or running commercial history is protected.',
        );
      }
      const days = await tx.findByField('itinerary_days', 'tripId', tripId, 500) as ItineraryDay[];
      const now = new Date().toISOString();
      for (const day of days) tx.delete('itinerary_days', day.id);
      tx.delete('trips', tripId);
      const audit = auditEvent('TRIP_DELETED', 'TRIP', tripId, actor, trip, {}, now);
      tx.set('audit_logs', audit.id, audit);
    });
  }

  private async loadAuthorizedCommercialTrip(
    tx: ConversionTransaction,
    tripId: string,
    actor: TripMutationActor,
  ): Promise<UnknownRecord> {
    const trip = await tx.get('trips', tripId) as UnknownRecord | null;
    if (!trip) throw new TripDomainError(404, 'TRIP_NOT_FOUND', 'Trip not found.');
    if (!MUTATION_ROLES.has(actor.role)) {
      throw new TripDomainError(403, 'ROLE_DENIED', 'This role cannot mutate commercial Trip itinerary data.');
    }
    try {
      assertAuthorizedResource(actor, 'TRIP', 'UPDATE_COMMERCIAL', tripResourceContext(trip));
    } catch (error) {
      translateAuthorizationError(error);
    }
    return trip;
  }

  private markCostingPending(trip: UnknownRecord, actor: TripMutationActor, now: string): UnknownRecord {
    return {
      ...trip,
      costingStatus: 'PENDING',
      updatedAt: now,
      updatedByEmployeeId: actor.employeeId,
    };
  }

  private async resolveAttribution(
    tx: ConversionTransaction,
    trip: UnknownRecord,
    actor: TripMutationActor,
    existing?: { ownerEmployeeId?: unknown; salesTeamId?: unknown },
  ): Promise<{ ownerEmployeeId: string; salesTeamId: string }> {
    const customerId = nonEmptyString(trip.customerId, 'customerId');
    const customer = await tx.get('customers', customerId);
    if (!customer) throw new TripDomainError(400, 'CUSTOMER_NOT_FOUND', 'The linked customer does not exist.');

    if (!trip.leadId) {
      if (
        existing && typeof existing.ownerEmployeeId === 'string' && existing.ownerEmployeeId.trim() &&
        typeof existing.salesTeamId === 'string' && existing.salesTeamId.trim()
      ) {
        return {
          ownerEmployeeId: existing.ownerEmployeeId.trim(),
          salesTeamId: existing.salesTeamId.trim(),
        };
      }
      if ((actor.role === 'Sales Executive' || actor.role === 'Sales Manager') && actor.salesTeamId) {
        return { ownerEmployeeId: actor.employeeId, salesTeamId: actor.salesTeamId };
      }
      throw new TripDomainError(
        422,
        'LEAD_REQUIRED_FOR_ATTRIBUTION',
        'A linked Lead is required when the actor has no authoritative Sales team.',
      );
    }

    const leadId = nonEmptyString(trip.leadId, 'leadId');
    const lead = await tx.get('leads', leadId) as UnknownRecord | null;
    if (!lead) throw new TripDomainError(400, 'LEAD_NOT_FOUND', 'The linked Lead does not exist.');
    if (lead.customerId && lead.customerId !== customerId) {
      throw new TripDomainError(400, 'TRIP_LINK_MISMATCH', 'Trip customerId does not match the authoritative Lead.');
    }

    const ownerEmployeeId = typeof lead.assignedEmployeeId === 'string' ? lead.assignedEmployeeId.trim() : '';
    if (!ownerEmployeeId) {
      throw new TripDomainError(403, 'LINKED_LEAD_ACCESS_DENIED', 'The linked Lead has no stable Sales employee assignment.');
    }

    if (actor.role === 'Sales Executive') {
      if (ownerEmployeeId !== actor.employeeId || !actor.salesTeamId) {
        throw new TripDomainError(403, 'LINKED_LEAD_ACCESS_DENIED', 'Sales Executives may only use their own assigned Lead.');
      }
      return { ownerEmployeeId, salesTeamId: actor.salesTeamId };
    }

    if (actor.role === 'Sales Manager' && ownerEmployeeId === actor.employeeId) {
      if (!actor.salesTeamId) {
        throw new TripDomainError(403, 'MISSING_TEAM_METADATA', 'Sales Manager team metadata is required.');
      }
      return { ownerEmployeeId, salesTeamId: actor.salesTeamId };
    }

    const employeeMatches = await tx.findByField('employees', 'employeeId', ownerEmployeeId, 2) as UnknownRecord[];
    if (employeeMatches.length > 1) {
      throw new TripDomainError(403, 'LINKED_LEAD_ACCESS_DENIED', 'The linked Lead employee identity is ambiguous.');
    }
    const employee = employeeMatches[0] ?? await tx.get('employees', ownerEmployeeId) as UnknownRecord | null;
    const teamValue = employee?.salesTeamId ?? employee?.teamId;
    if (
      !employee || employee.active !== true ||
      (employee.role !== 'Sales Executive' && employee.role !== 'Sales Manager') ||
      typeof teamValue !== 'string' || !teamValue.trim()
    ) {
      throw new TripDomainError(
        403,
        'LINKED_LEAD_ACCESS_DENIED',
        'The linked Lead must resolve to one active Sales employee with team metadata.',
      );
    }

    const salesTeamId = teamValue.trim();
    if (actor.role === 'Sales Manager' && actor.salesTeamId !== salesTeamId) {
      throw new TripDomainError(403, 'LINKED_LEAD_ACCESS_DENIED', 'Sales Managers may only use Leads assigned within their team.');
    }
    return { ownerEmployeeId, salesTeamId };
  }
}
