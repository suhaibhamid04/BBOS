import type { AuditLog, ItineraryDay, ItineraryItem, Trip } from '../../src/types/index.js';
import {
  FirestoreConversionStorageProvider,
  type ConversionStorageProvider,
  type ConversionTransaction,
} from '../../src/services/conversion/conversionStorageProvider.js';
import { assertAuthorizedResource, ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { tripResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';
import {
  calculateMixedAllocatedStayTotal,
  distributeGuestsAcrossRooms,
  validateRoomAllocationsForCategories,
} from '../../src/services/accommodationEngine.js';
import type { PackageSupplierRate, PackageSupplierRateInput, RoomAllocation, RoomCategory, RatePeriod, TaxTreatment } from '../../src/types/accommodation.js';

type UnknownRecord = Record<string, any>;

export interface TripMutationActor extends AuthorizationPrincipal {
  name: string;
  email?: string;
  isDemo?: boolean;
}

export interface LeadTripResult {
  trip: Trip;
  days: ItineraryDay[];
  customer?: UnknownRecord;
  resumed: boolean;
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
  'childAges', 'totalSellingPrice',
]);
const SERVER_CONTROLLED_FIELDS = new Set([
  'id', 'status', 'totalSupplierCost', 'totalCost', 'grossProfit', 'grossMargin',
  'profit', 'margin', 'assignedSalesEmployeeId', 'salesTeamId',
  'assignedReservationsEmployeeId', 'assignedOperationsEmployeeId',
  'createdByEmployeeId', 'updatedByEmployeeId', 'createdAt', 'updatedAt',
  'isDemo', 'schemaVersion', 'costingStatus', 'packageReview',
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
  'costSource', 'packageSupplierRate', 'contractedTotalSupplierCost',
  'nightlyRateBreakdown', 'enteredByEmployeeId', 'enteredAt',
]);
const PACKAGE_RATE_MAX = 100_000_000;
const PACKAGE_RATE_INPUT_FIELDS = new Set(['entryMode', 'amount', 'taxTreatment', 'supplierQuoteReference', 'overrideReason']);
const PACKAGE_RATE_TAXES = new Set<TaxTreatment>(['NET', 'INCLUSIVE', 'GST_5', 'GST_18', 'CUSTOM_TAX', 'NEEDS_CONFIRMATION']);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutUndefined(item)) as T;
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, withoutUndefined(item)]),
  ) as T;
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

function dateIsWithin(date: string, validFrom: unknown, validTo: unknown): boolean {
  const from = typeof validFrom === 'string' ? validFrom.slice(0, 10) : '';
  const to = typeof validTo === 'string' && validTo ? validTo.slice(0, 10) : null;
  return Boolean(from) && date >= from && (!to || date <= to);
}

function stayIsWithin(checkInDate: string, nights: number, validFrom: unknown, validTo: unknown): boolean {
  if (!dateIsWithin(checkInDate, validFrom, validTo)) return false;
  const finalNight = new Date(`${checkInDate}T00:00:00Z`);
  finalNight.setUTCDate(finalNight.getUTCDate() + nights - 1);
  return dateIsWithin(finalNight.toISOString().slice(0, 10), validFrom, validTo);
}

function validatePackageRateProposal(value: unknown): PackageSupplierRateInput | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new TripDomainError(400, 'INVALID_PACKAGE_RATE', 'Package supplier rate must be an object.');
  const unsupported = Object.keys(value).find(key => !PACKAGE_RATE_INPUT_FIELDS.has(key));
  if (unsupported) throw new TripDomainError(400, 'SERVER_CONTROLLED_PACKAGE_RATE_FIELD', `${unsupported} is not accepted from the client.`);
  if (value.entryMode !== 'PER_ROOM_NIGHT' && value.entryMode !== 'TOTAL_STAY') throw new TripDomainError(400, 'INVALID_PACKAGE_RATE_MODE', 'Choose a per-room/night rate or total-stay supplier quote.');
  if (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount <= 0 || value.amount > PACKAGE_RATE_MAX) throw new TripDomainError(400, 'INVALID_PACKAGE_RATE_AMOUNT', `Package supplier rate must be greater than zero and no more than ${PACKAGE_RATE_MAX}.`);
  if (!PACKAGE_RATE_TAXES.has(value.taxTreatment as TaxTreatment)) throw new TripDomainError(400, 'INVALID_PACKAGE_RATE_TAX', 'Package supplier rate tax treatment is invalid.');
  const optionalText = (key: 'supplierQuoteReference' | 'overrideReason') => {
    if (value[key] === undefined) return undefined;
    if (typeof value[key] !== 'string') throw new TripDomainError(400, 'INVALID_PACKAGE_RATE_REFERENCE', `${key} must be text.`);
    return value[key].trim().slice(0, 500) || undefined;
  };
  const supplierQuoteReference = optionalText('supplierQuoteReference');
  const overrideReason = optionalText('overrideReason');
  return { entryMode: value.entryMode, amount: value.amount, taxTreatment: value.taxTreatment as TaxTreatment, ...(supplierQuoteReference ? { supplierQuoteReference } : {}), ...(overrideReason ? { overrideReason } : {}) };
}

function packageRateSignature(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return JSON.stringify({
    entryMode: value.entryMode,
    amount: value.amount,
    taxTreatment: value.taxTreatment,
    supplierQuoteReference: value.supplierQuoteReference || null,
    overrideReason: value.overrideReason || null,
  });
}

async function resolveInventoryItem(tx: ConversionTransaction, input: UnknownRecord, trip: Trip, actor: TripMutationActor, now: string): Promise<UnknownRecord> {
  if (!['HOTEL', 'TRANSPORT', 'ACTIVITY'].includes(String(input.type))) return input;
  const metadata = input.metadata;
  if (!isRecord(metadata)) {
    throw new TripDomainError(422, 'INVENTORY_LINK_REQUIRED', `${input.type} itinerary items must reference authoritative inventory.`);
  }

  if (input.type === 'HOTEL') {
    const propertyId = nonEmptyString(metadata.propertyId, 'metadata.propertyId');
    const roomCategoryId = nonEmptyString(metadata.roomCategoryId, 'metadata.roomCategoryId');
    const checkInDate = validateDate(metadata.checkInDate, 'metadata.checkInDate');
    const nights = nonNegativeInteger(metadata.nights, 'metadata.nights');
    const rooms = metadata.rooms === undefined ? 1 : nonNegativeInteger(metadata.rooms, 'metadata.rooms');
    const packageRateProposal = validatePackageRateProposal(metadata.packageRateRequest);
    if (nights < 1 || rooms < 1) throw new TripDomainError(400, 'INVALID_ITINERARY_FIELD', 'Accommodation nights and rooms must be at least 1.');
    const [property, roomValue, propertyRateValues] = await Promise.all([
      tx.get('accommodation_properties', propertyId),
      tx.get('room_categories', roomCategoryId),
      tx.findByField('rate_periods', 'propertyId', propertyId, 500),
    ]);
    const room = roomValue as RoomCategory | null;
    const propertyRates = (propertyRateValues as RatePeriod[]).filter(value => value.status === 'ACTIVE');
    let rateId = typeof metadata.rateId === 'string' ? metadata.rateId.trim() : '';
    let rate = rateId ? propertyRates.find(value => value.id === rateId) || null : propertyRates.find(value => value.roomCategoryId === roomCategoryId && value.mealPlan === metadata.mealPlan && dateIsWithin(checkInDate, value.validFrom, value.validTo)) || null;
    if (!rate && packageRateProposal) {
      rate = { id: 'PACKAGE', propertyId, roomCategoryId, contractType: 'STANDARD', mealPlan: metadata.mealPlan, validFrom: checkInDate, validTo: null, baseRate: packageRateProposal.amount, currency: 'INR', taxTreatment: packageRateProposal.taxTreatment, confirmationStatus: 'CONFIRMED', supplements: [
        { id: 'package-eb', ratePeriodId: 'PACKAGE', type: 'EB', name: 'Extra Bed', amount: 0, unit: 'per_person_night', taxTreatment: 'NET' },
        { id: 'package-cwb', ratePeriodId: 'PACKAGE', type: 'CWB', name: 'Child With Bed', amount: 0, unit: 'per_child_night', taxTreatment: 'NET' },
      ], createdAt: '', updatedAt: '', status: 'ACTIVE' } as RatePeriod;
      rateId = rate.id;
    }
    if (!property || !room || !rate) throw new TripDomainError(422, packageRateProposal ? 'INVENTORY_REFERENCE_NOT_FOUND' : 'PACKAGE_RATE_REQUIRED', packageRateProposal ? 'Selected accommodation inventory no longer exists.' : 'No contracted rate is available. Enter a package supplier rate to continue.');
    if (property.status !== 'ACTIVE' || !room.active || rate.status !== 'ACTIVE') throw new TripDomainError(409, 'INVENTORY_INACTIVE', 'Only active accommodation inventory may be newly selected.');
    if (room.propertyId !== propertyId || rate.propertyId !== propertyId || rate.roomCategoryId !== roomCategoryId || rate.mealPlan !== metadata.mealPlan || !dateIsWithin(checkInDate, rate.validFrom, rate.validTo)) {
      throw new TripDomainError(422, 'INVENTORY_RATE_MISMATCH', 'The selected accommodation rate does not match the property, room, meal plan, or service date.');
    }
    const childAges = Array.isArray(trip.childAges) ? trip.childAges.map(Number) : [];
    if (trip.children > 0 && childAges.length !== trip.children) {
      throw new TripDomainError(422, 'CHILD_AGES_REQUIRED', 'Child ages are required for accurate hotel costing. Return to the Lead or Trip and add every child age.');
    }
    const suppliedAllocations = Array.isArray(metadata.roomAllocations) ? metadata.roomAllocations as RoomAllocation[] : null;
    let roomAllocations: RoomAllocation[];
    try {
      roomAllocations = suppliedAllocations || distributeGuestsAcrossRooms(roomCategoryId, trip.adults, childAges, rooms);
    } catch (error) {
      throw new TripDomainError(422, 'INVALID_ROOM_DISTRIBUTION', error instanceof Error ? error.message : 'Room distribution is invalid.');
    }
    const canonicalAllocations = roomAllocations.map((allocation, index) => ({
      ...allocation,
      rateId: allocation.rateId || propertyRates.find(value => value.roomCategoryId === allocation.roomCategoryId && value.mealPlan === metadata.mealPlan && dateIsWithin(checkInDate, value.validFrom, value.validTo))?.id || (packageRateProposal ? 'PACKAGE' : undefined),
      roomIndex: allocation.roomIndex || index + 1,
    }));
    if (canonicalAllocations[0]?.roomCategoryId !== roomCategoryId || canonicalAllocations[0]?.rateId !== rateId) {
      throw new TripDomainError(422, 'INVENTORY_RATE_MISMATCH', 'The primary room category and rate must match Room 1.');
    }
    if (canonicalAllocations.some(allocation => !allocation.rateId) && !packageRateProposal) {
      throw new TripDomainError(422, 'INVENTORY_RATE_MISMATCH', 'Every room category must have an authoritative contracted rate.');
    }
    if (new Set(canonicalAllocations.map(allocation => allocation.roomCategoryId)).size > 1 && packageRateProposal?.entryMode === 'PER_ROOM_NIGHT') {
      throw new TripDomainError(422, 'AMBIGUOUS_MIXED_ROOM_PACKAGE_RATE', 'Use a total-stay supplier quote when the stay contains different room categories.');
    }
    const categoryIds = [...new Set(canonicalAllocations.map(allocation => allocation.roomCategoryId))];
    const rateIds = [...new Set(canonicalAllocations.map(allocation => allocation.rateId!))];
    const [categoryValues, rateValues] = await Promise.all([
      Promise.all(categoryIds.map(id => tx.get('room_categories', id))),
      Promise.all(rateIds.map(id => id === 'PACKAGE' ? Promise.resolve(rate) : tx.get('rate_periods', id))),
    ]);
    const occupancyRooms = categoryValues.filter((value): value is RoomCategory => Boolean(value));
    const occupancyRates = rateValues.filter((value): value is RatePeriod => Boolean(value));
    if (occupancyRooms.length !== categoryIds.length || occupancyRates.length !== rateIds.length) throw new TripDomainError(422, 'INVENTORY_REFERENCE_NOT_FOUND', 'A selected room category or rate no longer exists.');
    for (const allocation of canonicalAllocations) {
      const allocationRoom = occupancyRooms.find(value => value.id === allocation.roomCategoryId)!;
      const allocationRate = occupancyRates.find(value => value.id === allocation.rateId)!;
      if (allocationRoom.propertyId !== propertyId || !allocationRoom.active || allocationRate.status !== 'ACTIVE' || allocationRate.propertyId !== propertyId || (allocationRate.id !== 'PACKAGE' && allocationRate.roomCategoryId !== allocationRoom.id) || allocationRate.mealPlan !== metadata.mealPlan || !dateIsWithin(checkInDate, allocationRate.validFrom, allocationRate.validTo)) {
        throw new TripDomainError(422, 'INVENTORY_RATE_MISMATCH', `Room ${allocation.roomIndex} does not match an active room category and contracted rate for this stay.`);
      }
    }
    const occupancy = validateRoomAllocationsForCategories(canonicalAllocations, occupancyRooms, {
      adults: trip.adults,
      children: trip.children,
      childAges,
    }, new Map(occupancyRooms.map(category => [category.id, occupancyRates.find(value => value.id === canonicalAllocations.find(allocation => allocation.roomCategoryId === category.id)?.rateId)?.supplements || []])));
    if (occupancy.valid === false) throw new TripDomainError(422, 'INVALID_ROOM_DISTRIBUTION', occupancy.reason);
    const calculation = calculateMixedAllocatedStayTotal(
      occupancyRooms,
      propertyRates,
      propertyId,
      checkInDate,
      nights,
      canonicalAllocations,
      { adults: trip.adults, children: trip.children, childAges },
      metadata.mealPlan,
      packageRateProposal,
    );
    if (!calculation.available) throw new TripDomainError(422, calculation.costSource === 'PENDING' ? 'PACKAGE_RATE_REQUIRED' : 'INVALID_ROOM_DISTRIBUTION', calculation.reason || 'Accommodation costing is unavailable.');
    const packageSupplierRate: PackageSupplierRate | undefined = packageRateProposal ? {
      ...packageRateProposal,
      enteredByEmployeeId: actor.employeeId,
      enteredAt: now,
      ...(calculation.contractedTotalSupplierCost !== undefined ? { originalContractedTotal: calculation.contractedTotalSupplierCost } : {}),
    } : undefined;
    const supplier = property.supplierId ? await tx.get('suppliers', property.supplierId) : null;
    const checkOut = new Date(`${checkInDate}T00:00:00Z`); checkOut.setUTCDate(checkOut.getUTCDate() + nights);
    const { packageRateRequest: _packageRateRequest, ...safeMetadata } = metadata;
    return {
      ...input,
      referenceId: propertyId,
      inventoryId: propertyId,
      title: `${property.name} — ${[...new Set(occupancyRooms.map(value => value.name))].join(' + ')} — ${rate.mealPlan}`,
      description: `${nights} night${nights === 1 ? '' : 's'} · ${rooms} room${rooms === 1 ? '' : 's'}`,
      metadata: {
        ...safeMetadata, inventoryType: 'ACCOMMODATION', propertyId, propertyName: property.name,
        roomCategoryId, roomCategoryName: room.name, ...(calculation.ratePeriodId ? { rateId: calculation.ratePeriodId } : {}), supplierId: property.supplierId,
        supplierName: supplier?.name, mealPlan: rate.mealPlan, checkInDate,
        checkOutDate: checkOut.toISOString().slice(0, 10), nights, rooms: roomAllocations.length,
        adults: trip.adults, children: trip.children,
        childrenWithBed: occupancy.childTreatments.filter(item => item.category === 'CHILD_SUPPLEMENT').length,
        childrenWithoutBed: occupancy.childTreatments.filter(item => item.category === 'COMPLIMENTARY_NO_BED').length,
        roomAllocations: calculation.roomAllocations || canonicalAllocations,
        childTreatments: occupancy.childTreatments,
        costSource: calculation.costSource,
        ...(packageSupplierRate ? { packageSupplierRate } : {}),
        ...(calculation.contractedTotalSupplierCost !== undefined ? { contractedTotalSupplierCost: calculation.contractedTotalSupplierCost } : {}),
        ...(calculation.nightlyRateBreakdown ? { nightlyRateBreakdown: calculation.nightlyRateBreakdown } : {}),
      },
    };
  }

  if (input.type === 'TRANSPORT') {
    const rateId = nonEmptyString(metadata.rateId, 'metadata.rateId');
    const vehicleCategoryId = nonEmptyString(metadata.vehicleCategoryId, 'metadata.vehicleCategoryId');
    const startDate = validateDate(metadata.startDate, 'metadata.startDate');
    const serviceType = nonEmptyString(metadata.serviceType, 'metadata.serviceType');
    const [vehicle, rate] = await Promise.all([
      tx.get('vehicle_categories', vehicleCategoryId),
      tx.get('transport_rate_periods', rateId),
    ]);
    if (!vehicle || !rate) throw new TripDomainError(422, 'INVENTORY_REFERENCE_NOT_FOUND', 'Selected transport inventory or rate no longer exists.');
    if (!vehicle.active || rate.status !== 'ACTIVE') throw new TripDomainError(409, 'INVENTORY_INACTIVE', 'Only active transport inventory may be newly selected.');
    if (rate.vehicleCategoryId !== vehicleCategoryId || rate.serviceType !== serviceType || !dateIsWithin(startDate, rate.validFrom, rate.validTo)) {
      throw new TripDomainError(422, 'INVENTORY_RATE_MISMATCH', 'The selected transport rate does not match the vehicle, service type, or service date.');
    }
    const supplier = await tx.get('suppliers', rate.supplierId);
    return {
      ...input,
      referenceId: vehicleCategoryId,
      inventoryId: vehicleCategoryId,
      title: `${vehicle.displayName || vehicle.name} — ${supplier?.name || 'Contracted supplier'} — ${rate.pricingUnit}`,
      metadata: {
        ...metadata, inventoryType: 'TRANSPORT', vehicleCategoryId,
        vehicleName: vehicle.displayName || vehicle.name, rateId, supplierId: rate.supplierId,
        supplierName: supplier?.name, serviceType, pricingUnit: rate.pricingUnit, startDate,
      },
    };
  }

  const activityId = nonEmptyString(metadata.activityId, 'metadata.activityId');
  const rateId = nonEmptyString(metadata.rateId, 'metadata.rateId');
  const date = validateDate(metadata.date, 'metadata.date');
  const [activity, rate] = await Promise.all([
    tx.get('activity_masters', activityId),
    tx.get('activity_rate_periods', rateId),
  ]);
  if (!activity || !rate) throw new TripDomainError(422, 'INVENTORY_REFERENCE_NOT_FOUND', 'Selected activity inventory or rate no longer exists.');
  if (!activity.active || rate.status !== 'ACTIVE') throw new TripDomainError(409, 'INVENTORY_INACTIVE', 'Only active activity inventory may be newly selected.');
  if (rate.activityId !== activityId || !dateIsWithin(date, rate.validFrom, rate.validTo)) {
    throw new TripDomainError(422, 'INVENTORY_RATE_MISMATCH', 'The selected activity rate does not match the activity or service date.');
  }
  const supplier = await tx.get('suppliers', rate.supplierId);
  return {
    ...input,
    referenceId: activityId,
    inventoryId: activityId,
    title: `${activity.name}${activity.duration ? ` — ${activity.duration}` : ''}`,
    metadata: {
      ...metadata, inventoryType: 'ACTIVITY', activityId, activityName: activity.name,
      rateId, supplierId: rate.supplierId, supplierName: supplier?.name,
      pricingModel: rate.pricingModel, date, duration: activity.duration,
    },
  };
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
  const rawChildAges = value.childAges === undefined && children === 0 ? [] : value.childAges;
  if (!Array.isArray(rawChildAges) || rawChildAges.length !== children) {
    throw new TripDomainError(400, 'INVALID_TRIP_FIELD', 'childAges must contain one age for every child.');
  }
  const childAges = rawChildAges.map((age, index) => nonNegativeInteger(age, `childAges[${index}]`));
  if (childAges.some(age => age > 17)) throw new TripDomainError(400, 'INVALID_TRIP_FIELD', 'Child ages must be between 0 and 17.');

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
    childAges,
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

  async createOrResumeLeadTrip(leadIdValue: string, actor: TripMutationActor): Promise<LeadTripResult> {
    if (!MUTATION_ROLES.has(actor.role)) {
      throw new TripDomainError(403, 'ROLE_DENIED', 'This role cannot build Trips from Leads.');
    }
    const leadId = nonEmptyString(leadIdValue, 'leadId');

    return this.storage.runTransaction(async tx => {
      const lead = await tx.get('leads', leadId) as UnknownRecord | null;
      if (!lead) throw new TripDomainError(404, 'LEAD_NOT_FOUND', 'Lead not found.');

      const attribution = await this.resolveLeadAttribution(tx, lead, actor);
      const existingTrips = await tx.findByField('trips', 'leadId', leadId, 25) as Trip[];
      const resumable = existingTrips
        .filter(trip => ['DRAFT', 'ITINERARY_READY', 'QUOTE_READY'].includes(trip.status))
        .sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')))[0];

      if (resumable) {
        try {
          assertAuthorizedResource(actor, 'TRIP', 'UPDATE_COMMERCIAL', tripResourceContext(resumable));
        } catch (error) {
          translateAuthorizationError(error);
        }
        const days = await tx.findByField('itinerary_days', 'tripId', resumable.id, 60) as ItineraryDay[];
        const customer = await tx.get('customers', resumable.customerId) as UnknownRecord | null;
        return {
          trip: resumable,
          days: days.sort((left, right) => left.dayNumber - right.dayNumber),
          ...(customer ? { customer } : {}),
          resumed: true,
        };
      }

      const customerId = nonEmptyString(lead.customerId, 'Lead customerId');
      let customer = await tx.get('customers', customerId) as UnknownRecord | null;
      const now = new Date().toISOString();
      if (!customer) {
        customer = {
          id: customerId,
          name: nonEmptyString(lead.customerName, 'Lead customerName'),
          phone: typeof lead.customerPhone === 'string' ? lead.customerPhone.trim() : '',
          email: typeof lead.customerEmail === 'string' ? lead.customerEmail.trim() : '',
          city: '',
          customerType: 'B2C',
          preferences: [],
          notes: typeof lead.notes === 'string' ? lead.notes : '',
          totalBookings: 0,
          lifetimeValue: 0,
          createdAt: now,
          updatedAt: now,
          ...(actor.isDemo ? { isDemo: true } : {}),
        };
        tx.set('customers', customerId, customer);
      }

      const destination = nonEmptyString(lead.destination, 'Lead destination');
      const tripType = typeof lead.tripType === 'string' && lead.tripType.trim() ? lead.tripType.trim() : 'Custom Private Tour';
      if (!lead.travelStartDate || !lead.travelEndDate) {
        throw new TripDomainError(422, 'LEAD_TRAVEL_DATES_REQUIRED', 'Add the Lead travel start date and number of nights before building the package.');
      }
      if (lead.adults === undefined && lead.travelerCount === undefined) {
        throw new TripDomainError(422, 'LEAD_PAX_REQUIRED', 'Add the Lead adult and child details before building the package.');
      }
      const hasStructuredChildAges = Array.isArray(lead.childAges);
      const childAges = hasStructuredChildAges
        ? lead.childAges.map((age: unknown) => nonNegativeInteger(age, 'Lead child age'))
        : [];
      if (childAges.some(age => age > 17)) {
        throw new TripDomainError(422, 'INVALID_LEAD_TRAVELERS', 'Lead child ages must be between 0 and 17.');
      }
      const storedChildren = lead.children === undefined ? childAges.length : nonNegativeInteger(lead.children, 'Lead children');
      if (hasStructuredChildAges && childAges.length !== storedChildren) {
        throw new TripDomainError(422, 'INVALID_LEAD_TRAVELERS', 'Lead must contain one age for every child.');
      }
      const storedAdults = lead.adults === undefined
        ? nonNegativeInteger(lead.travelerCount, 'Lead travelerCount') - storedChildren
        : nonNegativeInteger(lead.adults, 'Lead adults');
      const travelerCount = storedAdults + storedChildren;
      if (lead.travelerCount !== undefined && nonNegativeInteger(lead.travelerCount, 'Lead travelerCount') !== travelerCount) {
        throw new TripDomainError(422, 'INVALID_LEAD_TRAVELERS', 'Lead travelerCount must equal adults plus children.');
      }
      if (storedAdults < 1 || storedAdults + storedChildren !== travelerCount) {
        throw new TripDomainError(422, 'INVALID_LEAD_TRAVELERS', 'Lead traveler details must include at least one adult and match travelerCount.');
      }
      const startDate = validateDate(lead.travelStartDate, 'Lead travelStartDate');
      const endDate = validateDate(lead.travelEndDate, 'Lead travelEndDate');
      if (endDate < startDate) {
        throw new TripDomainError(422, 'INVALID_LEAD_DATES', 'Lead travel end date cannot be before its start date.');
      }
      const budget = lead.budget === undefined ? undefined : finiteNonNegative(lead.budget, 'Lead budget');
      const tripId = `trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const financials = calculateFinancials(budget || 0, 0);
      const trip: Trip = {
        id: tripId,
        customerId,
        leadId,
        title: `${destination} ${tripType} for ${customer.name}`,
        destination,
        startDate,
        endDate,
        travelerCount,
        adults: storedAdults,
        children: storedChildren,
        childAges,
        ...(lead.focCount !== undefined ? { focCount: nonNegativeInteger(lead.focCount, 'Lead FOC count') } : {}),
        tripType,
        currency: 'INR',
        ...(budget !== undefined ? { budget } : {}),
        ...(typeof lead.hotelPreference === 'string' && lead.hotelPreference.trim() ? { hotelPreference: lead.hotelPreference.trim() } : {}),
        ...(typeof lead.mealPlanPreference === 'string' && lead.mealPlanPreference.trim() ? { mealPlanPreference: lead.mealPlanPreference.trim() } : {}),
        ...(typeof (lead.vehiclePreference || lead.transportPreference) === 'string' && (lead.vehiclePreference || lead.transportPreference).trim() ? { vehiclePreference: (lead.vehiclePreference || lead.transportPreference).trim() } : {}),
        ...(typeof lead.specialRequirements === 'string' && lead.specialRequirements.trim() ? { specialRequirements: lead.specialRequirements.trim() } : {}),
        ...(typeof lead.notes === 'string' && lead.notes.trim() ? { leadNotes: lead.notes.trim() } : {}),
        ...financials,
        status: 'DRAFT',
        costingStatus: 'PENDING',
        assignedSalesEmployeeId: attribution.ownerEmployeeId,
        salesTeamId: attribution.salesTeamId,
        createdByEmployeeId: actor.employeeId,
        updatedByEmployeeId: actor.employeeId,
        createdAt: now,
        updatedAt: now,
        ...(actor.isDemo ? { isDemo: true } : {}),
      };

      try {
        assertAuthorizedResource(actor, 'TRIP', 'UPDATE_COMMERCIAL', tripResourceContext(trip));
      } catch (error) {
        translateAuthorizationError(error);
      }

      const durationDays = Math.round(
        (new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86_400_000,
      ) + 1;
      if (durationDays < 1 || durationDays > 30) {
        throw new TripDomainError(422, 'INVALID_LEAD_DATES', 'Lead travel dates must span between 1 and 30 days.');
      }
      const days: ItineraryDay[] = Array.from({ length: durationDays }, (_, index) => ({
        id: `day-${tripId}-${index + 1}`,
        tripId,
        dayNumber: index + 1,
        date: nextItineraryDate(trip as UnknownRecord, index + 1),
        title: `Day ${index + 1} - Itinerary`,
        description: '',
        location: destination,
        items: [],
      }));

      tx.set('trips', tripId, trip);
      for (const day of days) tx.set('itinerary_days', day.id, day);
      const audit = auditEvent('TRIP_CREATED_FROM_LEAD', 'TRIP', tripId, actor, null, trip as UnknownRecord, now);
      tx.set('audit_logs', audit.id, audit);
      return { trip, days, customer, resumed: false };
    });
  }

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

  async reconcileLeadChanges(tripId: string, actor: TripMutationActor): Promise<Trip> {
    nonEmptyString(tripId, 'tripId');
    if (!MUTATION_ROLES.has(actor.role)) {
      throw new TripDomainError(403, 'ROLE_DENIED', 'This role cannot reconcile commercial Trip data.');
    }

    return this.storage.runTransaction(async tx => {
      const stored = await tx.get('trips', tripId) as UnknownRecord | null;
      if (!stored) throw new TripDomainError(404, 'TRIP_NOT_FOUND', 'Trip not found.');
      try {
        assertAuthorizedResource(actor, 'TRIP', 'UPDATE_COMMERCIAL', tripResourceContext(stored));
      } catch (error) {
        translateAuthorizationError(error);
      }
      if (!stored.packageReview?.required) {
        throw new TripDomainError(409, 'PACKAGE_REVIEW_NOT_REQUIRED', 'This package does not have pending Lead changes.');
      }
      const leadId = nonEmptyString(stored.leadId, 'Trip leadId');
      const lead = await tx.get('leads', leadId) as UnknownRecord | null;
      if (!lead) throw new TripDomainError(404, 'LEAD_NOT_FOUND', 'The linked Lead no longer exists.');

      const startDate = validateDate(lead.travelStartDate, 'Lead travelStartDate');
      const endDate = validateDate(lead.travelEndDate, 'Lead travelEndDate');
      if (endDate < startDate) throw new TripDomainError(422, 'INVALID_LEAD_DATES', 'Lead travel dates are invalid.');
      const childAges = Array.isArray(lead.childAges)
        ? lead.childAges.map((age: unknown) => nonNegativeInteger(age, 'Lead child age'))
        : [];
      if (childAges.some(age => age > 17)) throw new TripDomainError(422, 'INVALID_LEAD_TRAVELERS', 'Lead child ages must be between 0 and 17.');
      const children = lead.children === undefined ? childAges.length : nonNegativeInteger(lead.children, 'Lead children');
      const adults = nonNegativeInteger(lead.adults, 'Lead adults');
      if (adults < 1 || children !== childAges.length) {
        throw new TripDomainError(422, 'INVALID_LEAD_TRAVELERS', 'Lead traveler details are incomplete.');
      }

      const now = new Date().toISOString();
      const updated = {
        ...stored,
        id: tripId,
        destination: nonEmptyString(lead.destination, 'Lead destination'),
        startDate,
        endDate,
        adults,
        children,
        childAges,
        travelerCount: adults + children,
        focCount: lead.focCount === undefined ? 0 : nonNegativeInteger(lead.focCount, 'Lead FOC count'),
        hotelPreference: typeof lead.hotelPreference === 'string' ? lead.hotelPreference.trim() : '',
        mealPlanPreference: typeof lead.mealPlanPreference === 'string' ? lead.mealPlanPreference.trim() : '',
        vehiclePreference: typeof (lead.vehiclePreference || lead.transportPreference) === 'string'
          ? String(lead.vehiclePreference || lead.transportPreference).trim()
          : '',
        specialRequirements: typeof lead.specialRequirements === 'string' ? lead.specialRequirements.trim() : '',
        costingStatus: 'PENDING',
        packageReview: {
          ...stored.packageReview,
          required: false,
          resolvedAt: now,
          resolvedByEmployeeId: actor.employeeId,
        },
        updatedAt: now,
        updatedByEmployeeId: actor.employeeId,
      } as Trip;
      const audit = auditEvent('PACKAGE_LEAD_CHANGES_APPLIED', 'TRIP', tripId, actor, stored, updated as UnknownRecord, now);
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
      const resolvedInput = await resolveInventoryItem(tx, input, trip as Trip, actor, now);
      const item = withoutUndefined({
        ...resolvedInput,
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        dayId,
        tripId: storedDay.tripId,
      }) as ItineraryItem;
      const day: ItineraryDay = { ...storedDay, items: [...(storedDay.items || []), item] };
      const updatedTrip = this.markCostingPending(trip, actor, now);
      tx.update('itinerary_days', dayId, day);
      tx.update('trips', trip.id, updatedTrip);
      const audit = auditEvent('ITINERARY_ITEM_CREATED', 'ITINERARY_ITEM', item.id, actor, null, item as UnknownRecord, now);
      tx.set('audit_logs', audit.id, audit);
      const packageRate = isRecord(item.metadata) && isRecord(item.metadata.packageSupplierRate) ? item.metadata.packageSupplierRate : null;
      if (packageRate) {
        const rateAudit = auditEvent('PACKAGE_SUPPLIER_RATE_ENTERED', 'ITINERARY_ITEM', item.id, actor, null, {
          tripId: storedDay.tripId, propertyId: item.metadata?.propertyId, roomCategoryId: item.metadata?.roomCategoryId,
          packageSupplierRate: packageRate, contractedTotalSupplierCost: item.metadata?.contractedTotalSupplierCost,
        }, now);
        tx.set('audit_logs', rateAudit.id, rateAudit);
      }
      return { day, item, trip: updatedTrip as Trip };
    });
  }

  async updateItineraryItem(dayId: string, itemId: string, rawInput: unknown, actor: TripMutationActor): Promise<{ day: ItineraryDay; item: ItineraryItem; trip: Trip }> {
    nonEmptyString(dayId, 'dayId'); nonEmptyString(itemId, 'itemId');
    const input = sanitizeItineraryItemInput(rawInput);
    return this.storage.runTransaction(async tx => {
      const storedDay = await tx.get('itinerary_days', dayId) as ItineraryDay | null;
      if (!storedDay) throw new TripDomainError(404, 'ITINERARY_DAY_NOT_FOUND', 'Itinerary day not found.');
      const existing = (storedDay.items || []).find(candidate => candidate.id === itemId);
      if (!existing) throw new TripDomainError(404, 'ITINERARY_ITEM_NOT_FOUND', 'Itinerary item not found.');
      const trip = await this.loadAuthorizedCommercialTrip(tx, storedDay.tripId, actor);
      const now = new Date().toISOString();
      const resolvedInput = await resolveInventoryItem(tx, input, trip as Trip, actor, now);
      if (isRecord(existing.metadata) && isRecord(resolvedInput.metadata)) {
        const previousPackageRate = existing.metadata.packageSupplierRate;
        if (packageRateSignature(previousPackageRate) === packageRateSignature(resolvedInput.metadata.packageSupplierRate)) {
          resolvedInput.metadata.packageSupplierRate = previousPackageRate;
        }
      }
      const item = withoutUndefined({ ...resolvedInput, id: existing.id, dayId, tripId: storedDay.tripId }) as ItineraryItem;
      const day = { ...storedDay, items: (storedDay.items || []).map(candidate => candidate.id === itemId ? item : candidate) } as ItineraryDay;
      const updatedTrip = this.markCostingPending(trip, actor, now);
      tx.update('itinerary_days', dayId, day); tx.update('trips', trip.id, updatedTrip);
      const audit = auditEvent('ITINERARY_ITEM_UPDATED', 'ITINERARY_ITEM', itemId, actor, existing as UnknownRecord, item as UnknownRecord, now);
      tx.set('audit_logs', audit.id, audit);
      const beforeRate = isRecord(existing.metadata) && isRecord(existing.metadata.packageSupplierRate) ? existing.metadata.packageSupplierRate : null;
      const afterRate = isRecord(item.metadata) && isRecord(item.metadata.packageSupplierRate) ? item.metadata.packageSupplierRate : null;
      if (JSON.stringify(beforeRate) !== JSON.stringify(afterRate)) {
        const rateAudit = auditEvent(afterRate && !beforeRate ? 'PACKAGE_SUPPLIER_RATE_ENTERED' : 'PACKAGE_SUPPLIER_RATE_CHANGED', 'ITINERARY_ITEM', itemId, actor, beforeRate ? { packageSupplierRate: beforeRate } : null, {
          tripId: storedDay.tripId, propertyId: item.metadata?.propertyId, roomCategoryId: item.metadata?.roomCategoryId,
          ...(afterRate ? { packageSupplierRate: afterRate } : {}), contractedTotalSupplierCost: item.metadata?.contractedTotalSupplierCost,
        }, now);
        tx.set('audit_logs', rateAudit.id, rateAudit);
      }
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

    return this.resolveLeadAttribution(tx, lead, actor);
  }

  private async resolveLeadAttribution(
    tx: ConversionTransaction,
    lead: UnknownRecord,
    actor: TripMutationActor,
  ): Promise<{ ownerEmployeeId: string; salesTeamId: string }> {
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
