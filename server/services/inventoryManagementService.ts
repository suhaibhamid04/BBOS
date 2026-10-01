import { randomUUID } from 'node:crypto';
import type { DocumentData, Query } from 'firebase-admin/firestore';
import { getAdminDb } from '../firebaseAdmin.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';
import type {
  AccommodationProperty,
  MealPlanType,
  RatePeriod,
  RateSupplement,
  RoomCategory,
} from '../../src/types/accommodation.js';
import type { ActivityMaster, ActivityRatePeriod } from '../../src/types/activity.js';
import type { TransportRatePeriod, VehicleCategory } from '../../src/types/transport.js';
import type { AuditLog, Supplier, SupplierType, UserRole } from '../../src/types/index.js';
import { DEMO_ACCOMMODATION_PROPERTIES, DEMO_RATE_PERIODS, DEMO_ROOM_CATEGORIES } from '../../src/services/accommodationDemoData.js';
import { DEMO_ACTIVITY_MASTERS, DEMO_ACTIVITY_RATE_PERIODS } from '../../src/services/activityDemoData.js';
import { DEMO_SUPPLIERS } from '../../src/services/demoData.js';
import { DEMO_TRANSPORT_RATE_PERIODS, DEMO_VEHICLE_CATEGORIES } from '../../src/services/transportDemoData.js';
import { APP_CONFIG } from '../../src/config.js';

type UnknownRecord = Record<string, unknown>;
export type InventoryCollection =
  | 'accommodation_properties' | 'room_categories' | 'rate_periods'
  | 'vehicle_categories' | 'transport_rate_periods'
  | 'activity_masters' | 'activity_rate_periods' | 'suppliers';

export interface InventoryActor extends AuthorizationPrincipal { name: string; role: UserRole | string }
export interface InventoryFilter { field: string; value: unknown }
export interface InventoryOverlapCheck { filters: InventoryFilter[]; excludeId?: string; validFrom: string; validTo: string | null }
export interface InventoryStorage {
  get<T>(collection: InventoryCollection, id: string): Promise<T | null>;
  list<T>(collection: InventoryCollection, filters?: InventoryFilter[]): Promise<T[]>;
  commit(collection: InventoryCollection, id: string, before: UnknownRecord | null, after: UnknownRecord, audit: AuditLog, overlap?: InventoryOverlapCheck): Promise<void>;
}

export class InventoryManagementError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'InventoryManagementError';
  }
}

const READ_ROLES: readonly UserRole[] = ['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Reservations', 'Operations'];
const RATE_READ_ROLES: readonly UserRole[] = ['Founder', 'Admin', 'Accounts', 'Reservations'];
const MANAGE_ROLES: readonly UserRole[] = ['Founder', 'Admin'];
const MEAL_PLANS: readonly MealPlanType[] = ['EP', 'CP', 'MAP', 'AP', 'CUSTOM'];

function clone<T>(value: T): T { return structuredClone(value); }
function firestoreDocument(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => firestoreDocument(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as UnknownRecord)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, firestoreDocument(item)]),
  );
}
function record(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InventoryManagementError(400, 'INVALID_INVENTORY_PAYLOAD', 'A JSON object is required.');
  return value as UnknownRecord;
}
function allowlist(value: UnknownRecord, fields: readonly string[]) {
  const rejected = Object.keys(value).filter((key) => !fields.includes(key));
  if (rejected.length) throw new InventoryManagementError(400, 'PROTECTED_INVENTORY_FIELD', `Unsupported or server-controlled fields: ${rejected.join(', ')}.`);
}
function text(value: unknown, field: string, max = 500, required = true): string | undefined {
  if ((value === undefined || value === null || value === '') && !required) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new InventoryManagementError(400, 'INVALID_INVENTORY_INPUT', `${field} must be a non-empty string of at most ${max} characters.`);
  return value.trim();
}
function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new InventoryManagementError(400, 'INVALID_INVENTORY_INPUT', `${field} must be boolean.`);
  return value;
}
function numberValue(value: unknown, field: string, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new InventoryManagementError(400, 'INVALID_INVENTORY_INPUT', `${field} must be a finite non-negative${integer ? ' integer' : ''}.`);
  }
  return value;
}
function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) throw new InventoryManagementError(400, 'INVALID_INVENTORY_INPUT', `${field} must be an array of non-empty strings.`);
  return value.map((item) => item.trim());
}
function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new InventoryManagementError(400, 'INVALID_INVENTORY_INPUT', `${field} is invalid.`);
  return value as T;
}
function dateValue(value: unknown, field: string, nullable = false): string | null {
  if (nullable && (value === null || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new InventoryManagementError(400, 'INVALID_INVENTORY_DATE', `${field} must be a valid YYYY-MM-DD date.`);
  }
  return value;
}
function optional<T>(value: unknown, parser: (input: unknown) => T): T | undefined { return value === undefined ? undefined : parser(value); }
function assertRole(actor: InventoryActor, roles: readonly UserRole[], message: string) {
  if (!actor.active || !actor.employeeId || !roles.includes(actor.role as UserRole)) throw new InventoryManagementError(403, 'INVENTORY_ACCESS_DENIED', message);
}
function audit(actor: InventoryActor, action: string, entityType: string, entityId: string, before: UnknownRecord | null, after: UnknownRecord, now: string): AuditLog {
  return { id: `audit-inventory-${randomUUID()}`, timestamp: now, actorType: 'HUMAN', actorId: actor.employeeId, actorName: `${actor.name} (${actor.role})`, action, entityType, entityId, before, after, reason: `${action.replaceAll('_', ' ')} by ${actor.employeeId}.` };
}
function overlaps(leftFrom: string, leftTo: string | null, rightFrom: string, rightTo: string | null) {
  return leftFrom <= (rightTo || '9999-12-31') && rightFrom <= (leftTo || '9999-12-31');
}
function sanitizeProperty(property: AccommodationProperty, actor: InventoryActor) {
  if (RATE_READ_ROLES.includes(actor.role as UserRole)) return property;
  const { internalNotes: _internalNotes, supplierId: _supplierId, ...safe } = property;
  return safe;
}
function sanitizeActivity(activity: ActivityMaster, actor: InventoryActor) {
  if (RATE_READ_ROLES.includes(actor.role as UserRole)) return activity;
  const { internalNotes: _internalNotes, operationalNotes: _operationalNotes, supplierId: _supplierId, ...safe } = activity;
  return safe;
}

const PROPERTY_FIELDS = ['name', 'propertyType', 'location', 'city', 'area', 'starCategory', 'description', 'amenities', 'contactName', 'contactPhone', 'contactEmail', 'address', 'internalNotes', 'preferredProperty', 'status', 'supplierId', 'currency', 'availabilityStatus'] as const;
const ROOM_FIELDS = ['propertyId', 'name', 'description', 'maxAdults', 'maxChildren', 'bedConfiguration', 'amenities', 'active', 'sortOrder'] as const;
const RATE_FIELDS = ['propertyId', 'roomCategoryId', 'mealPlan', 'validFrom', 'validTo', 'baseRate', 'currency', 'taxTreatment', 'customTaxPercent', 'confirmationStatus', 'supplements', 'notes', 'status'] as const;
const VEHICLE_FIELDS = ['name', 'displayName', 'category', 'seatingCapacity', 'passengerCapacity', 'luggageCapacity', 'operationalRegions', 'features', 'restrictions', 'active', 'sortOrder', 'notes'] as const;
const TRANSPORT_RATE_FIELDS = ['vehicleCategoryId', 'supplierId', 'routeId', 'serviceType', 'pricingUnit', 'baseRate', 'currency', 'validFrom', 'validTo', 'seasonLabel', 'availabilityStatus', 'taxTreatment', 'customTaxPercent', 'confirmationStatus', 'notes', 'status'] as const;
const ACTIVITY_FIELDS = ['name', 'category', 'destinationId', 'supplierId', 'description', 'customerDescription', 'duration', 'minParticipants', 'maxParticipants', 'ageRestrictions', 'operatingDays', 'operatingSessions', 'equipmentProvided', 'requiresGuide', 'requiresPermit', 'inclusions', 'exclusions', 'operationalNotes', 'internalNotes', 'active'] as const;
const ACTIVITY_RATE_FIELDS = ['activityId', 'supplierId', 'pricingModel', 'pricingComponents', 'currency', 'validFrom', 'validTo', 'seasonLabel', 'availabilityStatus', 'taxTreatment', 'customTaxPercent', 'confirmationStatus', 'notes', 'status'] as const;
const SUPPLIER_FIELDS = ['name', 'contactPerson', 'phone', 'email', 'city', 'paymentTerms', 'active', 'notes'] as const;

export class InventoryManagementService {
  constructor(private readonly storage: InventoryStorage = APP_CONFIG.DEMO_MODE ? demoInventoryStorage : new FirestoreInventoryStorage(), private readonly now = () => new Date()) {}

  async listProperties(actor: InventoryActor) { assertRole(actor, READ_ROLES, 'Inventory read access denied.'); return (await this.storage.list<AccommodationProperty>('accommodation_properties')).map((item) => sanitizeProperty(item, actor)); }
  async listAllRooms(actor: InventoryActor) { assertRole(actor, READ_ROLES, 'Inventory read access denied.'); return this.storage.list<RoomCategory>('room_categories'); }
  async listRooms(propertyId: string, actor: InventoryActor) { assertRole(actor, READ_ROLES, 'Inventory read access denied.'); return this.storage.list<RoomCategory>('room_categories', [{ field: 'propertyId', value: propertyId }]); }
  async listAllAccommodationRates(actor: InventoryActor) { assertRole(actor, RATE_READ_ROLES, 'Supplier-rate access denied.'); return this.storage.list<RatePeriod>('rate_periods'); }
  async listAccommodationRates(propertyId: string, actor: InventoryActor) { assertRole(actor, RATE_READ_ROLES, 'Supplier-rate access denied.'); return this.storage.list<RatePeriod>('rate_periods', [{ field: 'propertyId', value: propertyId }]); }
  async listVehicleCategories(actor: InventoryActor) { assertRole(actor, READ_ROLES, 'Inventory read access denied.'); return this.storage.list<VehicleCategory>('vehicle_categories'); }
  async listTransportRates(actor: InventoryActor) { assertRole(actor, RATE_READ_ROLES, 'Supplier-rate access denied.'); return this.storage.list<TransportRatePeriod>('transport_rate_periods'); }
  async listActivities(actor: InventoryActor) { assertRole(actor, READ_ROLES, 'Inventory read access denied.'); return (await this.storage.list<ActivityMaster>('activity_masters')).map((item) => sanitizeActivity(item, actor)); }
  async listActivityRates(actor: InventoryActor) { assertRole(actor, RATE_READ_ROLES, 'Supplier-rate access denied.'); return this.storage.list<ActivityRatePeriod>('activity_rate_periods'); }
  async listSuppliers(type: SupplierType, actor: InventoryActor) { assertRole(actor, RATE_READ_ROLES, 'Supplier identity access denied.'); return this.storage.list<Supplier>('suppliers', [{ field: 'type', value: type }]); }

  async createProperty(input: unknown, actor: InventoryActor) {
    assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); const payload = record(input); allowlist(payload, PROPERTY_FIELDS);
    const now = this.now().toISOString(); const id = `property-${randomUUID()}`;
    if (payload.supplierId) await this.requireSupplier(text(payload.supplierId, 'supplierId', 128)!, ['HOTEL', 'OTHER']);
    const entity: AccommodationProperty = {
      id, name: text(payload.name, 'name', 160)!, propertyType: enumValue(payload.propertyType ?? 'HOTEL', ['HOTEL', 'RESORT', 'HOUSEBOAT', 'HOMESTAY', 'OTHER'] as const, 'propertyType'),
      location: text(payload.location, 'location', 120)!, city: text(payload.city, 'city', 120)!, description: text(payload.description ?? '', 'description', 3000, false) || '', amenities: payload.amenities === undefined ? [] : stringArray(payload.amenities, 'amenities'),
      preferredProperty: payload.preferredProperty === undefined ? false : bool(payload.preferredProperty, 'preferredProperty'), status: enumValue(payload.status ?? 'ACTIVE', ['ACTIVE', 'INACTIVE'] as const, 'status'), currency: (text(payload.currency ?? 'INR', 'currency', 3)!).toUpperCase(), photos: [], availabilityStatus: enumValue(payload.availabilityStatus ?? 'NOT_CHECKED', ['NOT_CHECKED', 'REQUESTED', 'AVAILABLE', 'NOT_AVAILABLE', 'ON_HOLD', 'CONFIRMED'] as const, 'availabilityStatus'),
      ...this.optionalPropertyFields(payload), createdAt: now, updatedAt: now, createdBy: actor.employeeId, updatedBy: actor.employeeId,
    };
    await this.storage.commit('accommodation_properties', id, null, entity as unknown as UnknownRecord, audit(actor, 'PROPERTY_CREATED', 'ACCOMMODATION_PROPERTY', id, null, entity as unknown as UnknownRecord, now)); return entity;
  }

  async updateProperty(id: string, input: unknown, actor: InventoryActor) {
    assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); const existing = await this.required<AccommodationProperty>('accommodation_properties', id, 'PROPERTY_NOT_FOUND'); const payload = record(input); allowlist(payload, PROPERTY_FIELDS);
    if (payload.supplierId) await this.requireSupplier(text(payload.supplierId, 'supplierId', 128)!, ['HOTEL', 'OTHER']);
    const now = this.now().toISOString(); const patch = this.propertyPatch(payload); if (!Object.keys(patch).length) throw new InventoryManagementError(400, 'EMPTY_INVENTORY_UPDATE', 'No supported fields were provided.');
    const entity = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy, updatedAt: now, updatedBy: actor.employeeId };
    const action = existing.status === 'ACTIVE' && entity.status !== 'ACTIVE' ? 'PROPERTY_DISABLED' : 'PROPERTY_UPDATED';
    await this.storage.commit('accommodation_properties', id, existing as unknown as UnknownRecord, entity as unknown as UnknownRecord, audit(actor, action, 'ACCOMMODATION_PROPERTY', id, existing as unknown as UnknownRecord, entity as unknown as UnknownRecord, now)); return entity;
  }

  async createRoom(input: unknown, actor: InventoryActor) {
    assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); const payload = record(input); allowlist(payload, ROOM_FIELDS); const propertyId = text(payload.propertyId, 'propertyId', 128)!; await this.required('accommodation_properties', propertyId, 'PROPERTY_NOT_FOUND');
    const now = this.now().toISOString(); const id = `room-${randomUUID()}`; const entity: RoomCategory = { id, propertyId, name: text(payload.name, 'name', 120)!, description: text(payload.description, 'description', 1000, false), maxAdults: payload.maxAdults === undefined ? 2 : numberValue(payload.maxAdults, 'maxAdults', true), maxChildren: payload.maxChildren === undefined ? 1 : numberValue(payload.maxChildren, 'maxChildren', true), bedConfiguration: text(payload.bedConfiguration, 'bedConfiguration', 120, false), amenities: payload.amenities === undefined ? [] : stringArray(payload.amenities, 'amenities'), photos: [], active: payload.active === undefined ? true : bool(payload.active, 'active'), sortOrder: payload.sortOrder === undefined ? 0 : numberValue(payload.sortOrder, 'sortOrder', true), createdAt: now, updatedAt: now };
    await this.storage.commit('room_categories', id, null, entity as unknown as UnknownRecord, audit(actor, 'ROOM_CATEGORY_CREATED', 'ROOM_CATEGORY', id, null, entity as unknown as UnknownRecord, now)); return entity;
  }

  async updateRoom(id: string, input: unknown, actor: InventoryActor) {
    assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); const existing = await this.required<RoomCategory>('room_categories', id, 'ROOM_CATEGORY_NOT_FOUND'); const payload = record(input); allowlist(payload, ROOM_FIELDS.filter((field) => field !== 'propertyId')); const patch: Partial<RoomCategory> = {};
    if (payload.name !== undefined) patch.name = text(payload.name, 'name', 120)!; if (payload.description !== undefined) patch.description = text(payload.description, 'description', 1000, false); if (payload.maxAdults !== undefined) patch.maxAdults = numberValue(payload.maxAdults, 'maxAdults', true); if (payload.maxChildren !== undefined) patch.maxChildren = numberValue(payload.maxChildren, 'maxChildren', true); if (payload.bedConfiguration !== undefined) patch.bedConfiguration = text(payload.bedConfiguration, 'bedConfiguration', 120, false); if (payload.amenities !== undefined) patch.amenities = stringArray(payload.amenities, 'amenities'); if (payload.active !== undefined) patch.active = bool(payload.active, 'active'); if (payload.sortOrder !== undefined) patch.sortOrder = numberValue(payload.sortOrder, 'sortOrder', true);
    const now = this.now().toISOString(); const entity = { ...existing, ...patch, id: existing.id, propertyId: existing.propertyId, createdAt: existing.createdAt, updatedAt: now }; const action = existing.active && !entity.active ? 'ROOM_CATEGORY_DISABLED' : 'ROOM_CATEGORY_UPDATED';
    await this.storage.commit('room_categories', id, existing as unknown as UnknownRecord, entity as unknown as UnknownRecord, audit(actor, action, 'ROOM_CATEGORY', id, existing as unknown as UnknownRecord, entity as unknown as UnknownRecord, now)); return entity;
  }

  async createAccommodationRate(input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); return this.saveAccommodationRate(null, input, actor); }
  async updateAccommodationRate(id: string, input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); return this.saveAccommodationRate(await this.required<RatePeriod>('rate_periods', id, 'RATE_NOT_FOUND'), input, actor); }

  async createVehicle(input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); return this.saveVehicle(null, input, actor); }
  async updateVehicle(id: string, input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); return this.saveVehicle(await this.required<VehicleCategory>('vehicle_categories', id, 'VEHICLE_CATEGORY_NOT_FOUND'), input, actor); }
  async createTransportRate(input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); return this.saveTransportRate(null, input, actor); }
  async updateTransportRate(id: string, input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); return this.saveTransportRate(await this.required<TransportRatePeriod>('transport_rate_periods', id, 'TRANSPORT_RATE_NOT_FOUND'), input, actor); }
  async createActivity(input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); return this.saveActivity(null, input, actor); }
  async updateActivity(id: string, input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); return this.saveActivity(await this.required<ActivityMaster>('activity_masters', id, 'ACTIVITY_NOT_FOUND'), input, actor); }
  async createActivityRate(input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); return this.saveActivityRate(null, input, actor); }
  async updateActivityRate(id: string, input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); return this.saveActivityRate(await this.required<ActivityRatePeriod>('activity_rate_periods', id, 'ACTIVITY_RATE_NOT_FOUND'), input, actor); }
  async createSupplier(type: SupplierType, input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); return this.saveSupplier(type, null, input, actor); }
  async updateSupplier(type: SupplierType, id: string, input: unknown, actor: InventoryActor) { assertRole(actor, MANAGE_ROLES, 'Only Founder/Admin may manage inventory.'); const existing = await this.required<Supplier>('suppliers', id, 'SUPPLIER_NOT_FOUND'); if (existing.type !== type) throw new InventoryManagementError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found for this inventory domain.'); return this.saveSupplier(type, existing, input, actor); }

  async accommodationCalculationData(propertyId: string, roomCategoryId: string) { return { property: await this.storage.get<AccommodationProperty>('accommodation_properties', propertyId), room: await this.storage.get<RoomCategory>('room_categories', roomCategoryId), rates: await this.storage.list<RatePeriod>('rate_periods', [{ field: 'roomCategoryId', value: roomCategoryId }]) }; }
  async transportCalculationData(vehicleCategoryId: string, serviceType: string) { return this.storage.list<TransportRatePeriod>('transport_rate_periods', [{ field: 'vehicleCategoryId', value: vehicleCategoryId }, { field: 'serviceType', value: serviceType }]); }
  async activityCalculationData(activityId: string) { return this.storage.list<ActivityRatePeriod>('activity_rate_periods', [{ field: 'activityId', value: activityId }]); }
  async vehicleSnapshot(vehicleCategoryId: string) { return this.storage.get<VehicleCategory>('vehicle_categories', vehicleCategoryId); }
  async activitySnapshot(activityId: string) { return this.storage.get<ActivityMaster>('activity_masters', activityId); }
  async supplierSnapshot(supplierId?: string) { return supplierId ? this.storage.get<Supplier>('suppliers', supplierId) : null; }

  private async saveAccommodationRate(existing: RatePeriod | null, input: unknown, actor: InventoryActor) {
    const payload = record(input); allowlist(payload, existing ? RATE_FIELDS.filter((field) => !['propertyId', 'roomCategoryId'].includes(field)) : RATE_FIELDS); const propertyId = existing?.propertyId || text(payload.propertyId, 'propertyId', 128)!; const roomCategoryId = existing?.roomCategoryId || text(payload.roomCategoryId, 'roomCategoryId', 128)!;
    await this.required('accommodation_properties', propertyId, 'PROPERTY_NOT_FOUND'); const room = await this.required<RoomCategory>('room_categories', roomCategoryId, 'ROOM_CATEGORY_NOT_FOUND'); if (room.propertyId !== propertyId) throw new InventoryManagementError(422, 'ROOM_PROPERTY_MISMATCH', 'Room category does not belong to the selected property.');
    const validFrom = payload.validFrom === undefined && existing ? existing.validFrom : dateValue(payload.validFrom, 'validFrom')!; const validTo = payload.validTo === undefined && existing ? existing.validTo : dateValue(payload.validTo, 'validTo', true); if (validTo && validTo < validFrom) throw new InventoryManagementError(400, 'INVALID_RATE_PERIOD', 'validTo must not precede validFrom.');
    const mealPlan = payload.mealPlan === undefined && existing ? existing.mealPlan : enumValue(payload.mealPlan, MEAL_PLANS, 'mealPlan'); const status = payload.status === undefined && existing ? existing.status : enumValue(payload.status ?? 'ACTIVE', ['ACTIVE', 'ARCHIVED'] as const, 'status');
    if (status === 'ACTIVE') await this.ensureNoOverlap<RatePeriod>('rate_periods', existing?.id, [{ field: 'propertyId', value: propertyId }, { field: 'roomCategoryId', value: roomCategoryId }, { field: 'mealPlan', value: mealPlan }], validFrom, validTo);
    const now = this.now().toISOString(); const id = existing?.id || `rate-${randomUUID()}`; const supplements = payload.supplements === undefined ? existing?.supplements || [] : this.rateSupplements(payload.supplements, id);
    const entity: RatePeriod = { id, propertyId, roomCategoryId, contractType: 'STANDARD', mealPlan, validFrom, validTo, baseRate: payload.baseRate === undefined && existing ? existing.baseRate : numberValue(payload.baseRate, 'baseRate'), currency: (payload.currency === undefined && existing ? existing.currency : text(payload.currency ?? 'INR', 'currency', 3)!).toUpperCase(), taxTreatment: payload.taxTreatment === undefined && existing ? existing.taxTreatment : enumValue(payload.taxTreatment ?? 'INCLUSIVE', ['NET', 'INCLUSIVE', 'GST_5', 'GST_18', 'CUSTOM_TAX', 'NEEDS_CONFIRMATION'] as const, 'taxTreatment'), ...(payload.customTaxPercent !== undefined ? { customTaxPercent: numberValue(payload.customTaxPercent, 'customTaxPercent') } : existing?.customTaxPercent !== undefined ? { customTaxPercent: existing.customTaxPercent } : {}), confirmationStatus: payload.confirmationStatus === undefined && existing ? existing.confirmationStatus : enumValue(payload.confirmationStatus ?? 'CONFIRMED', ['CONFIRMED', 'NEEDS_CONFIRMATION'] as const, 'confirmationStatus'), supplements, ...(payload.notes !== undefined ? { notes: text(payload.notes, 'notes', 1000, false) } : existing?.notes ? { notes: existing.notes } : {}), createdAt: existing?.createdAt || now, updatedAt: now, createdBy: existing?.createdBy || actor.employeeId, updatedBy: actor.employeeId, status };
    const action = !existing ? 'CONTRACTED_RATE_CREATED' : existing.status === 'ACTIVE' && status === 'ARCHIVED' ? 'CONTRACTED_RATE_DISABLED' : 'CONTRACTED_RATE_UPDATED'; await this.storage.commit('rate_periods', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, audit(actor, action, 'ACCOMMODATION_RATE', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, now), status === 'ACTIVE' ? { filters: [{ field: 'propertyId', value: propertyId }, { field: 'roomCategoryId', value: roomCategoryId }, { field: 'mealPlan', value: mealPlan }], excludeId: existing?.id, validFrom, validTo } : undefined); return entity;
  }

  private async saveVehicle(existing: VehicleCategory | null, input: unknown, actor: InventoryActor) {
    const payload = record(input); allowlist(payload, VEHICLE_FIELDS); if (!existing) { text(payload.name, 'name', 120); text(payload.displayName, 'displayName', 160); enumValue(payload.category, ['SEDAN', 'SUV', 'MUV', 'TEMPO_TRAVELLER', 'BUS', 'LUXURY', 'CUSTOM'] as const, 'category'); numberValue(payload.seatingCapacity, 'seatingCapacity', true); numberValue(payload.passengerCapacity, 'passengerCapacity', true); } const value = <T>(key: string, parser: (input: unknown) => T, fallback?: T): T => payload[key] !== undefined ? parser(payload[key]) : (existing?.[key as keyof VehicleCategory] as T ?? fallback!); const now = this.now().toISOString(); const id = existing?.id || `vehicle-${randomUUID()}`;
    const entity: VehicleCategory = { id, name: value('name', (v) => text(v, 'name', 120)!), displayName: value('displayName', (v) => text(v, 'displayName', 160)!), category: value('category', (v) => enumValue(v, ['SEDAN', 'SUV', 'MUV', 'TEMPO_TRAVELLER', 'BUS', 'LUXURY', 'CUSTOM'] as const, 'category')), seatingCapacity: value('seatingCapacity', (v) => numberValue(v, 'seatingCapacity', true)), passengerCapacity: value('passengerCapacity', (v) => numberValue(v, 'passengerCapacity', true)), luggageCapacity: value('luggageCapacity', (v) => text(v, 'luggageCapacity', 120, false)), operationalRegions: value('operationalRegions', (v) => stringArray(v, 'operationalRegions'), []), features: value('features', (v) => stringArray(v, 'features'), []), restrictions: value('restrictions', (v) => stringArray(v, 'restrictions'), []), active: value('active', (v) => bool(v, 'active'), true), sortOrder: value('sortOrder', (v) => numberValue(v, 'sortOrder', true), 0), notes: value('notes', (v) => text(v, 'notes', 1000, false)), createdAt: existing?.createdAt || now, updatedAt: now };
    const action = !existing ? 'TRANSPORT_CATEGORY_CREATED' : existing.active && !entity.active ? 'TRANSPORT_CATEGORY_DISABLED' : 'TRANSPORT_CATEGORY_UPDATED'; await this.storage.commit('vehicle_categories', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, audit(actor, action, 'VEHICLE_CATEGORY', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, now)); return entity;
  }

  private async saveTransportRate(existing: TransportRatePeriod | null, input: unknown, actor: InventoryActor) {
    const payload = record(input); allowlist(payload, existing ? TRANSPORT_RATE_FIELDS.filter((field) => field !== 'vehicleCategoryId') : TRANSPORT_RATE_FIELDS); const vehicleCategoryId = existing?.vehicleCategoryId || text(payload.vehicleCategoryId, 'vehicleCategoryId', 128)!; await this.required('vehicle_categories', vehicleCategoryId, 'VEHICLE_CATEGORY_NOT_FOUND'); const supplierId = payload.supplierId === undefined && existing ? existing.supplierId : text(payload.supplierId, 'supplierId', 128)!; await this.requireSupplier(supplierId, ['TRANSPORT', 'OTHER']);
    const validFrom = payload.validFrom === undefined && existing ? existing.validFrom : dateValue(payload.validFrom, 'validFrom')!; const validTo = payload.validTo === undefined && existing ? existing.validTo : dateValue(payload.validTo, 'validTo', true); if (validTo && validTo < validFrom) throw new InventoryManagementError(400, 'INVALID_RATE_PERIOD', 'validTo must not precede validFrom.'); const serviceType = payload.serviceType === undefined && existing ? existing.serviceType : enumValue(payload.serviceType, ['AIRPORT_TRANSFER', 'RAILWAY_TRANSFER', 'HOTEL_TRANSFER', 'ONE_WAY_TRANSFER', 'ROUND_TRIP_TRANSFER', 'LOCAL_SIGHTSEEING', 'HALF_DAY_SIGHTSEEING', 'FULL_DAY_SIGHTSEEING', 'DAY_TRIP', 'MULTI_DAY_JOURNEY', 'OVERNIGHT_JOURNEY', 'CUSTOM'] as const, 'serviceType'); const pricingUnit = payload.pricingUnit === undefined && existing ? existing.pricingUnit : enumValue(payload.pricingUnit ?? 'PER_DAY', ['PER_DAY', 'PER_TRIP', 'PER_TRANSFER', 'PER_ROUTE', 'PER_KM', 'PER_HOUR', 'PER_JOURNEY', 'FIXED_MULTI_DAY', 'CUSTOM'] as const, 'pricingUnit'); const status = payload.status === undefined && existing ? existing.status : enumValue(payload.status ?? 'ACTIVE', ['ACTIVE', 'ARCHIVED'] as const, 'status'); if (status === 'ACTIVE') await this.ensureNoOverlap<TransportRatePeriod>('transport_rate_periods', existing?.id, [{ field: 'vehicleCategoryId', value: vehicleCategoryId }, { field: 'supplierId', value: supplierId }, { field: 'serviceType', value: serviceType }, { field: 'pricingUnit', value: pricingUnit }], validFrom, validTo);
    const now = this.now().toISOString(); const id = existing?.id || `transport-rate-${randomUUID()}`; const entity: TransportRatePeriod = { id, vehicleCategoryId, supplierId, ...(payload.routeId !== undefined ? { routeId: text(payload.routeId, 'routeId', 128, false) } : existing?.routeId ? { routeId: existing.routeId } : {}), serviceType, pricingUnit, baseRate: payload.baseRate === undefined && existing ? existing.baseRate : numberValue(payload.baseRate, 'baseRate'), currency: (payload.currency === undefined && existing ? existing.currency : text(payload.currency ?? 'INR', 'currency', 3)!).toUpperCase(), validFrom, validTo, ...(payload.seasonLabel !== undefined ? { seasonLabel: text(payload.seasonLabel, 'seasonLabel', 120, false) } : existing?.seasonLabel ? { seasonLabel: existing.seasonLabel } : {}), inclusions: existing?.inclusions || { vehicle: 'INCLUDED', driver: 'INCLUDED', fuel: 'INCLUDED', toll: 'EXCLUDED', parking: 'EXCLUDED', tax: 'INCLUDED', driverAllowance: 'INCLUDED', nightHalt: 'EXCLUDED', permits: 'EXCLUDED' }, availabilityStatus: payload.availabilityStatus === undefined && existing ? existing.availabilityStatus : enumValue(payload.availabilityStatus ?? 'AVAILABLE', ['AVAILABLE', 'UNAVAILABLE', 'NEEDS_CONFIRMATION', 'ON_REQUEST'] as const, 'availabilityStatus'), taxTreatment: payload.taxTreatment === undefined && existing ? existing.taxTreatment : enumValue(payload.taxTreatment ?? 'INCLUSIVE', ['NET', 'INCLUSIVE', 'GST_5', 'GST_18', 'CUSTOM_TAX', 'NEEDS_CONFIRMATION'] as const, 'taxTreatment'), confirmationStatus: payload.confirmationStatus === undefined && existing ? existing.confirmationStatus : enumValue(payload.confirmationStatus ?? 'CONFIRMED', ['CONFIRMED', 'NEEDS_CONFIRMATION'] as const, 'confirmationStatus'), ...(payload.notes !== undefined ? { notes: text(payload.notes, 'notes', 1000, false) } : existing?.notes ? { notes: existing.notes } : {}), status, createdAt: existing?.createdAt || now, updatedAt: now, createdBy: existing?.createdBy || actor.employeeId };
    const action = !existing ? 'TRANSPORT_RATE_CREATED' : existing.status === 'ACTIVE' && status === 'ARCHIVED' ? 'TRANSPORT_RATE_DISABLED' : 'TRANSPORT_RATE_UPDATED'; await this.storage.commit('transport_rate_periods', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, audit(actor, action, 'TRANSPORT_RATE', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, now), status === 'ACTIVE' ? { filters: [{ field: 'vehicleCategoryId', value: vehicleCategoryId }, { field: 'supplierId', value: supplierId }, { field: 'serviceType', value: serviceType }, { field: 'pricingUnit', value: pricingUnit }], excludeId: existing?.id, validFrom, validTo } : undefined); return entity;
  }

  private async saveActivity(existing: ActivityMaster | null, input: unknown, actor: InventoryActor) {
    const payload = record(input); allowlist(payload, ACTIVITY_FIELDS); if (!existing) { text(payload.name, 'name', 160); enumValue(payload.category, ['SIGHTSEEING', 'GUIDED_TOUR', 'EXCURSION', 'ADVENTURE', 'GONDOLA_CABLE_CAR', 'PONY_RIDE', 'RAFTING', 'SKIING', 'ATV', 'LOCAL_EXPERIENCE', 'ENTRY_TICKET', 'GUIDE_SERVICE', 'PERMIT', 'CUSTOM'] as const, 'category'); text(payload.destinationId, 'destinationId', 128); text(payload.description, 'description', 3000); } const supplierId = payload.supplierId === undefined && existing ? existing.supplierId : text(payload.supplierId, 'supplierId', 128)!; await this.requireSupplier(supplierId, ['ACTIVITY', 'OTHER']); const val = <T>(key: string, parser: (input: unknown) => T, fallback?: T): T => payload[key] !== undefined ? parser(payload[key]) : (existing?.[key as keyof ActivityMaster] as T ?? fallback!); const now = this.now().toISOString(); const id = existing?.id || `activity-${randomUUID()}`;
    const entity: ActivityMaster = { id, name: val('name', (v) => text(v, 'name', 160)!), category: val('category', (v) => enumValue(v, ['SIGHTSEEING', 'GUIDED_TOUR', 'EXCURSION', 'ADVENTURE', 'GONDOLA_CABLE_CAR', 'PONY_RIDE', 'RAFTING', 'SKIING', 'ATV', 'LOCAL_EXPERIENCE', 'ENTRY_TICKET', 'GUIDE_SERVICE', 'PERMIT', 'CUSTOM'] as const, 'category')), destinationId: val('destinationId', (v) => text(v, 'destinationId', 128)!), supplierId, description: val('description', (v) => text(v, 'description', 3000)!, ''), customerDescription: val('customerDescription', (v) => text(v, 'customerDescription', 2000, false)), duration: val('duration', (v) => text(v, 'duration', 120, false)), minParticipants: val('minParticipants', (v) => numberValue(v, 'minParticipants', true)), maxParticipants: val('maxParticipants', (v) => numberValue(v, 'maxParticipants', true)), ageRestrictions: val('ageRestrictions', (v) => text(v, 'ageRestrictions', 500, false)), operatingDays: val('operatingDays', (v) => stringArray(v, 'operatingDays'), []), operatingSessions: val('operatingSessions', (v) => stringArray(v, 'operatingSessions'), []), equipmentProvided: val('equipmentProvided', (v) => stringArray(v, 'equipmentProvided'), []), requiresGuide: val('requiresGuide', (v) => bool(v, 'requiresGuide'), false), requiresPermit: val('requiresPermit', (v) => bool(v, 'requiresPermit'), false), inclusions: val('inclusions', (v) => stringArray(v, 'inclusions'), []), exclusions: val('exclusions', (v) => stringArray(v, 'exclusions'), []), operationalNotes: val('operationalNotes', (v) => text(v, 'operationalNotes', 1000, false)), internalNotes: val('internalNotes', (v) => text(v, 'internalNotes', 1000, false)), active: val('active', (v) => bool(v, 'active'), true), createdAt: existing?.createdAt || now, updatedAt: now };
    const action = !existing ? 'ACTIVITY_CREATED' : existing.active && !entity.active ? 'ACTIVITY_DISABLED' : 'ACTIVITY_UPDATED'; await this.storage.commit('activity_masters', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, audit(actor, action, 'ACTIVITY_MASTER', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, now)); return entity;
  }

  private async saveActivityRate(existing: ActivityRatePeriod | null, input: unknown, actor: InventoryActor) {
    const payload = record(input); allowlist(payload, existing ? ACTIVITY_RATE_FIELDS.filter((field) => field !== 'activityId') : ACTIVITY_RATE_FIELDS); const activityId = existing?.activityId || text(payload.activityId, 'activityId', 128)!; await this.required('activity_masters', activityId, 'ACTIVITY_NOT_FOUND'); const supplierId = payload.supplierId === undefined && existing ? existing.supplierId : text(payload.supplierId, 'supplierId', 128)!; await this.requireSupplier(supplierId, ['ACTIVITY', 'OTHER']); const validFrom = payload.validFrom === undefined && existing ? existing.validFrom : dateValue(payload.validFrom, 'validFrom')!; const validTo = payload.validTo === undefined && existing ? existing.validTo : dateValue(payload.validTo, 'validTo', true); if (validTo && validTo < validFrom) throw new InventoryManagementError(400, 'INVALID_RATE_PERIOD', 'validTo must not precede validFrom.'); const pricingModel = payload.pricingModel === undefined && existing ? existing.pricingModel : enumValue(payload.pricingModel ?? 'PER_PERSON', ['PER_PERSON', 'PER_ADULT_CHILD', 'PER_COUPLE', 'PER_GROUP', 'PER_VEHICLE', 'PER_SESSION', 'PER_TICKET', 'PER_HOUR', 'PER_DAY', 'FIXED', 'CUSTOM'] as const, 'pricingModel'); const status = payload.status === undefined && existing ? existing.status : enumValue(payload.status ?? 'ACTIVE', ['ACTIVE', 'ARCHIVED'] as const, 'status'); if (status === 'ACTIVE') await this.ensureNoOverlap<ActivityRatePeriod>('activity_rate_periods', existing?.id, [{ field: 'activityId', value: activityId }, { field: 'supplierId', value: supplierId }, { field: 'pricingModel', value: pricingModel }], validFrom, validTo);
    const rawComponents = payload.pricingComponents === undefined && existing ? existing.pricingComponents : record(payload.pricingComponents); const pricingComponents: Record<string, number> = {}; for (const [key, value] of Object.entries(rawComponents)) pricingComponents[text(key, 'pricing component', 80)!] = numberValue(value, `pricingComponents.${key}`); if (!Object.keys(pricingComponents).length) throw new InventoryManagementError(400, 'INVALID_INVENTORY_INPUT', 'At least one pricing component is required.'); const now = this.now().toISOString(); const id = existing?.id || `activity-rate-${randomUUID()}`;
    const entity: ActivityRatePeriod = { id, activityId, supplierId, pricingModel, pricingComponents, currency: (payload.currency === undefined && existing ? existing.currency : text(payload.currency ?? 'INR', 'currency', 3)!).toUpperCase(), validFrom, validTo, ...(payload.seasonLabel !== undefined ? { seasonLabel: text(payload.seasonLabel, 'seasonLabel', 120, false) } : existing?.seasonLabel ? { seasonLabel: existing.seasonLabel } : {}), availabilityStatus: payload.availabilityStatus === undefined && existing ? existing.availabilityStatus : enumValue(payload.availabilityStatus ?? 'AVAILABLE', ['AVAILABLE', 'UNAVAILABLE', 'NEEDS_CONFIRMATION', 'ON_REQUEST'] as const, 'availabilityStatus'), taxTreatment: payload.taxTreatment === undefined && existing ? existing.taxTreatment : enumValue(payload.taxTreatment ?? 'INCLUSIVE', ['NET', 'INCLUSIVE', 'GST_5', 'GST_18', 'CUSTOM_TAX', 'NEEDS_CONFIRMATION'] as const, 'taxTreatment'), confirmationStatus: payload.confirmationStatus === undefined && existing ? existing.confirmationStatus : enumValue(payload.confirmationStatus ?? 'CONFIRMED', ['CONFIRMED', 'NEEDS_CONFIRMATION'] as const, 'confirmationStatus'), ...(payload.notes !== undefined ? { notes: text(payload.notes, 'notes', 1000, false) } : existing?.notes ? { notes: existing.notes } : {}), status, createdAt: existing?.createdAt || now, updatedAt: now };
    const action = !existing ? 'ACTIVITY_RATE_CREATED' : existing.status === 'ACTIVE' && status === 'ARCHIVED' ? 'ACTIVITY_RATE_DISABLED' : 'ACTIVITY_RATE_UPDATED'; await this.storage.commit('activity_rate_periods', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, audit(actor, action, 'ACTIVITY_RATE', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, now), status === 'ACTIVE' ? { filters: [{ field: 'activityId', value: activityId }, { field: 'supplierId', value: supplierId }, { field: 'pricingModel', value: pricingModel }], excludeId: existing?.id, validFrom, validTo } : undefined); return entity;
  }

  private async saveSupplier(type: SupplierType, existing: Supplier | null, input: unknown, actor: InventoryActor) {
    const payload = record(input); allowlist(payload, SUPPLIER_FIELDS); if (!existing) text(payload.name, 'name', 160); const val = <T>(key: string, parser: (input: unknown) => T, fallback?: T): T => payload[key] !== undefined ? parser(payload[key]) : (existing?.[key as keyof Supplier] as T ?? fallback!); const optionalText = (key: string, max: number) => val(key, (value) => text(value, key, max, false) || '', ''); const now = this.now().toISOString(); const id = existing?.id || `supplier-${randomUUID()}`; const entity: Supplier & { createdAt?: string; updatedAt?: string } = { id, type, name: val('name', (v) => text(v, 'name', 160)!), contactPerson: optionalText('contactPerson', 160), phone: optionalText('phone', 40), email: optionalText('email', 254), city: optionalText('city', 120), paymentTerms: optionalText('paymentTerms', 500), active: val('active', (v) => bool(v, 'active'), true), notes: val('notes', (v) => text(v, 'notes', 1000, false)), createdAt: (existing as any)?.createdAt || now, updatedAt: now };
    const action = !existing ? 'INVENTORY_SUPPLIER_CREATED' : existing.active && !entity.active ? 'INVENTORY_SUPPLIER_DISABLED' : 'INVENTORY_SUPPLIER_UPDATED'; await this.storage.commit('suppliers', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, audit(actor, action, 'SUPPLIER', id, existing as unknown as UnknownRecord | null, entity as unknown as UnknownRecord, now)); return entity;
  }

  private optionalPropertyFields(payload: UnknownRecord): Partial<AccommodationProperty> { return this.propertyPatch(payload); }
  private propertyPatch(payload: UnknownRecord): Partial<AccommodationProperty> {
    const patch: Partial<AccommodationProperty> = {};
    if (payload.name !== undefined) patch.name = text(payload.name, 'name', 160)!; if (payload.propertyType !== undefined) patch.propertyType = enumValue(payload.propertyType, ['HOTEL', 'RESORT', 'HOUSEBOAT', 'HOMESTAY', 'OTHER'] as const, 'propertyType'); if (payload.location !== undefined) patch.location = text(payload.location, 'location', 120)!; if (payload.city !== undefined) patch.city = text(payload.city, 'city', 120)!; if (payload.area !== undefined) patch.area = text(payload.area, 'area', 120, false); if (payload.starCategory !== undefined) patch.starCategory = text(payload.starCategory, 'starCategory', 80, false); if (payload.description !== undefined) patch.description = text(payload.description, 'description', 3000, false) || ''; if (payload.amenities !== undefined) patch.amenities = stringArray(payload.amenities, 'amenities'); if (payload.contactName !== undefined) patch.contactName = text(payload.contactName, 'contactName', 160, false); if (payload.contactPhone !== undefined) patch.contactPhone = text(payload.contactPhone, 'contactPhone', 40, false); if (payload.contactEmail !== undefined) patch.contactEmail = text(payload.contactEmail, 'contactEmail', 254, false); if (payload.address !== undefined) patch.address = text(payload.address, 'address', 500, false); if (payload.internalNotes !== undefined) patch.internalNotes = text(payload.internalNotes, 'internalNotes', 2000, false); if (payload.preferredProperty !== undefined) patch.preferredProperty = bool(payload.preferredProperty, 'preferredProperty'); if (payload.status !== undefined) patch.status = enumValue(payload.status, ['ACTIVE', 'INACTIVE'] as const, 'status'); if (payload.supplierId !== undefined) patch.supplierId = text(payload.supplierId, 'supplierId', 128, false); if (payload.currency !== undefined) patch.currency = text(payload.currency, 'currency', 3)!.toUpperCase(); if (payload.availabilityStatus !== undefined) patch.availabilityStatus = enumValue(payload.availabilityStatus, ['NOT_CHECKED', 'REQUESTED', 'AVAILABLE', 'NOT_AVAILABLE', 'ON_HOLD', 'CONFIRMED'] as const, 'availabilityStatus'); return patch;
  }
  private rateSupplements(value: unknown, ratePeriodId: string): RateSupplement[] { if (!Array.isArray(value)) throw new InventoryManagementError(400, 'INVALID_INVENTORY_INPUT', 'supplements must be an array.'); return value.map((entry, index) => { const item = record(entry); allowlist(item, ['type', 'name', 'amount', 'unit', 'taxTreatment', 'notes']); return { id: `supplement-${randomUUID()}`, ratePeriodId, type: enumValue(item.type, ['EB', 'CWB', 'CNB', 'ADULT_DINNER', 'CHILD_DINNER', 'LUNCH', 'GALA_DINNER', 'WEEKEND', 'SEASONAL', 'CUSTOM'] as const, `supplements[${index}].type`), name: text(item.name, `supplements[${index}].name`, 120)!, amount: numberValue(item.amount, `supplements[${index}].amount`), unit: enumValue(item.unit, ['per_room_night', 'per_person_night', 'per_child_night'] as const, `supplements[${index}].unit`), taxTreatment: enumValue(item.taxTreatment ?? 'INCLUSIVE', ['NET', 'INCLUSIVE', 'GST_5', 'GST_18', 'CUSTOM_TAX', 'NEEDS_CONFIRMATION'] as const, `supplements[${index}].taxTreatment`), ...(item.notes ? { notes: text(item.notes, `supplements[${index}].notes`, 500, false) } : {}) }; }); }
  private async requireSupplier(id: string, types: SupplierType[]) { const supplier = await this.required<Supplier>('suppliers', id, 'SUPPLIER_NOT_FOUND'); if (!supplier.active || !types.includes(supplier.type)) throw new InventoryManagementError(422, 'INVALID_SUPPLIER', 'Supplier is inactive or belongs to another inventory domain.'); return supplier; }
  private async required<T>(collection: InventoryCollection, id: string, code: string): Promise<T> { const value = await this.storage.get<T>(collection, id); if (!value) throw new InventoryManagementError(404, code, 'Inventory record not found.'); return value; }
  private async ensureNoOverlap<T extends { id: string; validFrom: string; validTo: string | null; status: string }>(collection: InventoryCollection, excludeId: string | undefined, filters: InventoryFilter[], validFrom: string, validTo: string | null) { const records = await this.storage.list<T>(collection, filters); if (records.some((item) => item.id !== excludeId && item.status === 'ACTIVE' && overlaps(validFrom, validTo, item.validFrom, item.validTo))) throw new InventoryManagementError(409, 'AMBIGUOUS_RATE_PERIOD', 'An active contracted rate already overlaps this validity period.'); }
}

export class FirestoreInventoryStorage implements InventoryStorage {
  async get<T>(collection: InventoryCollection, id: string) { const document = await getAdminDb().collection(collection).doc(id).get(); return document.exists ? ({ ...document.data(), id: document.id } as T) : null; }
  async list<T>(collection: InventoryCollection, filters: InventoryFilter[] = []) { let query: Query = getAdminDb().collection(collection); for (const filter of filters) query = query.where(filter.field, '==', filter.value); const snapshot = await query.limit(500).get(); return snapshot.docs.map((document) => ({ ...document.data(), id: document.id } as T)); }
  async commit(collection: InventoryCollection, id: string, before: UnknownRecord | null, after: UnknownRecord, entry: AuditLog, overlap?: InventoryOverlapCheck) { const db = getAdminDb(); await db.runTransaction(async (transaction) => { const reference = db.collection(collection).doc(id); const current = await transaction.get(reference); if (before === null && current.exists) throw new InventoryManagementError(409, 'INVENTORY_ID_CONFLICT', 'Inventory identifier already exists.'); if (before !== null && !current.exists) throw new InventoryManagementError(404, 'INVENTORY_NOT_FOUND', 'Inventory record no longer exists.'); if (overlap) { let query: Query = db.collection(collection); for (const filter of overlap.filters) query = query.where(filter.field, '==', filter.value); const matches = await transaction.get(query.limit(500)); if (matches.docs.some((document) => { const data = document.data(); return document.id !== overlap.excludeId && data.status === 'ACTIVE' && overlaps(overlap.validFrom, overlap.validTo, data.validFrom, data.validTo); })) throw new InventoryManagementError(409, 'AMBIGUOUS_RATE_PERIOD', 'An active contracted rate already overlaps this validity period.'); } transaction.set(reference, firestoreDocument(after) as DocumentData); transaction.create(db.collection('audit_logs').doc(entry.id), firestoreDocument(entry) as DocumentData); }); }
}

export class InMemoryInventoryStorage implements InventoryStorage {
  private data = new Map<InventoryCollection, Map<string, UnknownRecord>>(); readonly audits: AuditLog[] = []; mutationCount = 0;
  constructor(initial: Partial<Record<InventoryCollection, Array<{ id: string } & UnknownRecord>>> = {}) { for (const collection of Object.keys(initial) as InventoryCollection[]) this.data.set(collection, new Map((initial[collection] || []).map((item) => [item.id, clone(item)]))); }
  private collection(name: InventoryCollection) { let values = this.data.get(name); if (!values) { values = new Map(); this.data.set(name, values); } return values; }
  async get<T>(collection: InventoryCollection, id: string) { const value = this.collection(collection).get(id); return value ? clone(value) as T : null; }
  async list<T>(collection: InventoryCollection, filters: InventoryFilter[] = []) { return [...this.collection(collection).values()].filter((item) => filters.every((filter) => item[filter.field] === filter.value)).map((item) => clone(item) as T); }
  async commit(collection: InventoryCollection, id: string, before: UnknownRecord | null, after: UnknownRecord, entry: AuditLog, overlap?: InventoryOverlapCheck) { const values = this.collection(collection); if (before === null && values.has(id)) throw new InventoryManagementError(409, 'INVENTORY_ID_CONFLICT', 'Inventory identifier already exists.'); if (before !== null && !values.has(id)) throw new InventoryManagementError(404, 'INVENTORY_NOT_FOUND', 'Inventory record no longer exists.'); if (overlap && [...values.entries()].some(([recordId, value]) => recordId !== overlap.excludeId && value.status === 'ACTIVE' && overlap.filters.every((filter) => value[filter.field] === filter.value) && overlaps(overlap.validFrom, overlap.validTo, value.validFrom as string, value.validTo as string | null))) throw new InventoryManagementError(409, 'AMBIGUOUS_RATE_PERIOD', 'An active contracted rate already overlaps this validity period.'); values.set(id, clone(after)); this.audits.push(clone(entry)); this.mutationCount += 2; }
}

const demoInventoryStorage = new InMemoryInventoryStorage({
  accommodation_properties: DEMO_ACCOMMODATION_PROPERTIES as any,
  room_categories: DEMO_ROOM_CATEGORIES as any,
  rate_periods: DEMO_RATE_PERIODS as any,
  vehicle_categories: DEMO_VEHICLE_CATEGORIES as any,
  transport_rate_periods: DEMO_TRANSPORT_RATE_PERIODS as any,
  activity_masters: DEMO_ACTIVITY_MASTERS as any,
  activity_rate_periods: DEMO_ACTIVITY_RATE_PERIODS as any,
  suppliers: [
    ...DEMO_SUPPLIERS,
    { id: 'demo-activity-provider', name: 'Kashmir Experiences', type: 'ACTIVITY', contactPerson: 'Demo Provider', phone: '0000000000', email: 'activities@example.test', city: 'Srinagar', paymentTerms: 'On confirmation', active: true },
  ] as any,
});

export const inventoryManagementService = new InventoryManagementService();
