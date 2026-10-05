// =====================================================
// ACCOMMODATION RATE CALCULATION ENGINE
// Phase 2B-2 — Booking Bridge OS
// =====================================================

import type {
  RoomCategory,
  RatePeriod,
  RateSupplement,
  NegotiatedRate,
  OccupancyValidation,
  RateCalculationResult,
  RateCalculationRequest,
  MealPlanType,
  TaxTreatment,
  SupplementType,
  RoomAllocation,
  ChildAgePolicy,
  ChildChargingTreatment,
  AccommodationCostSource,
  AccommodationNightlyRateBreakdown,
  PackageSupplierRateInput,
} from '../types/accommodation';
import type { UserRole } from '../types';

// =====================================================
// OCCUPANCY VALIDATION
// =====================================================

export const DEFAULT_CHILD_AGE_POLICY: ChildAgePolicy = {
  complimentaryMaxAge: 5,
  childSupplementMaxAge: 11,
  adultFromAge: 12,
};

export function resolveChildAgePolicy(roomCategory?: Pick<RoomCategory, 'childAgePolicy'>): ChildAgePolicy {
  return { ...DEFAULT_CHILD_AGE_POLICY, ...(roomCategory?.childAgePolicy || {}) };
}

export function classifyChildAge(age: number, policy: ChildAgePolicy = DEFAULT_CHILD_AGE_POLICY): ChildChargingTreatment {
  if (!Number.isInteger(age) || age < 0) throw new Error('Every child age must be a non-negative whole number.');
  if (age >= policy.adultFromAge) return { age, category: 'COMMERCIAL_ADULT', label: `Child age ${age} — counted as adult` };
  if (age <= policy.complimentaryMaxAge) return { age, category: 'COMPLIMENTARY_NO_BED', label: `Child age ${age} — included without bed charge` };
  return { age, category: 'CHILD_SUPPLEMENT', label: `Child age ${age} — child bed/supplement applies` };
}

export function deriveChildTreatments(childAges: number[], roomCategory?: Pick<RoomCategory, 'childAgePolicy'>): ChildChargingTreatment[] {
  const policy = resolveChildAgePolicy(roomCategory);
  return childAges.map(age => classifyChildAge(age, policy));
}

export interface ResolvedRoomOccupancyRules {
  baseAdults: number;
  maxAdults: number;
  maxExtraAdults: number;
  maxChildren: number;
  maxChildrenWithoutBed: number;
  maxTotalOccupancy?: number;
}

/** Resolves migration-safe defaults while keeping each RoomCategory authoritative. */
export function resolveRoomOccupancyRules(roomCategory: Pick<RoomCategory, 'baseAdults' | 'maxAdults' | 'maxChildren' | 'maxChildrenWithoutBed' | 'maxTotalOccupancy'>): ResolvedRoomOccupancyRules {
  const configuredMaxAdults = Number.isInteger(roomCategory.maxAdults) && roomCategory.maxAdults > 0 ? roomCategory.maxAdults : 2;
  const configuredBase = roomCategory.baseAdults;
  const hasExplicitRules = Number.isInteger(configuredBase) && Number(configuredBase) > 0;
  // Before M4.1A, maxAdults represented standard occupancy and the engine allowed
  // one extra adult. Preserve that behavior only for legacy records without the
  // new explicit baseAdults field; every newly saved category is fully explicit.
  const baseAdults = hasExplicitRules ? Math.min(Number(configuredBase), configuredMaxAdults) : configuredMaxAdults;
  const maxAdults = hasExplicitRules ? configuredMaxAdults : configuredMaxAdults + 1;
  const maxChildren = Number.isInteger(roomCategory.maxChildren) && roomCategory.maxChildren >= 0 ? roomCategory.maxChildren : 1;
  const configuredWithoutBed = roomCategory.maxChildrenWithoutBed;
  const maxChildrenWithoutBed = Number.isInteger(configuredWithoutBed) && Number(configuredWithoutBed) >= 0
    ? Math.min(Number(configuredWithoutBed), maxChildren)
    : Math.min(1, maxChildren);
  return {
    baseAdults,
    maxAdults,
    maxExtraAdults: Math.max(0, maxAdults - baseAdults),
    maxChildren,
    maxChildrenWithoutBed,
    ...(roomCategory.maxTotalOccupancy !== undefined ? { maxTotalOccupancy: roomCategory.maxTotalOccupancy } : {}),
  };
}

export function suggestRoomCount(roomCategory: Pick<RoomCategory, 'baseAdults' | 'maxAdults' | 'maxChildren' | 'maxChildrenWithoutBed' | 'maxTotalOccupancy' | 'childAgePolicy'>, adults: number, childAges: number[]): number {
  const commercialAdults = adults + deriveChildTreatments(childAges, roomCategory).filter(item => item.category === 'COMMERCIAL_ADULT').length;
  const childrenBelowAdultAge = childAges.length - (commercialAdults - adults);
  const rules = resolveRoomOccupancyRules(roomCategory);
  const adultRooms = Math.ceil(commercialAdults / Math.max(1, rules.maxAdults));
  const childRooms = childrenBelowAdultAge > 0 ? Math.ceil(childrenBelowAdultAge / Math.max(1, rules.maxChildren)) : 0;
  const totalRooms = rules.maxTotalOccupancy && rules.maxTotalOccupancy > 0
    ? Math.ceil((adults + childAges.length) / rules.maxTotalOccupancy)
    : 0;
  return Math.max(1, adultRooms, childRooms, totalRooms);
}

export function distributeGuestsAcrossRooms(
  roomCategoryId: string,
  adults: number,
  childAges: number[],
  roomCount: number,
): RoomAllocation[] {
  const count = Math.max(1, Math.floor(roomCount));
  if (adults + childAges.length < count) throw new Error('Remove empty rooms or reduce the room count.');
  const allocations = Array.from({ length: count }, (_, index): RoomAllocation => ({
    roomIndex: index + 1, roomCategoryId, adults: 0, children: 0, childAges: [],
  }));
  for (let index = 0; index < adults; index += 1) allocations[index % count].adults += 1;
  for (let index = 0; index < childAges.length; index += 1) {
    const target = allocations[(count - 1 - (index % count) + count) % count];
    target.childAges.push(childAges[index]);
    target.children = target.childAges.length;
  }
  return allocations;
}

export interface PartyConsistencyInput { adults: number; children: number; childAges?: number[] }

type RoomSupplements = ReadonlyMap<string, RateSupplement[]> | Record<string, RateSupplement[]>;

function supplementsFor(categoryId: string, source: RoomSupplements): RateSupplement[] {
  return source instanceof Map ? source.get(categoryId) || [] : source[categoryId] || [];
}

export function validateRoomAllocationsForCategories(
  allocations: RoomAllocation[],
  roomCategories: RoomCategory[],
  party: PartyConsistencyInput,
  supplementsByCategory: RoomSupplements,
): { valid: true; childTreatments: ChildChargingTreatment[] } | { valid: false; reason: string } {
  if (!Array.isArray(allocations) || allocations.length === 0) return { valid: false, reason: 'Add at least one room and assign the guests.' };
  if (party.children > 0 && (!Array.isArray(party.childAges) || party.childAges.length !== party.children)) {
    return { valid: false, reason: 'Child ages are required for accurate hotel costing. Return to the Lead or Trip and add every child age.' };
  }
  const expectedAges = [...(party.childAges || [])].sort((a, b) => a - b);
  const allocationAges = allocations.flatMap(room => room.childAges || []).sort((a, b) => a - b);
  const totalAdults = allocations.reduce((sum, room) => sum + Number(room.adults || 0), 0);
  const totalChildren = allocations.reduce((sum, room) => sum + Number(room.children || 0), 0);
  if (totalAdults !== party.adults || totalChildren !== party.children || allocationAges.length !== party.children || expectedAges.some((age, index) => age !== allocationAges[index])) {
    return { valid: false, reason: `Room guests must match the Trip party: ${party.adults} adult(s) and ${party.children} child(ren) with their saved ages.` };
  }
  const categories = new Map(roomCategories.map(category => [category.id, category]));
  const seen = new Set<number>();
  const childTreatments: ChildChargingTreatment[] = [];
  for (const room of allocations) {
    if (!Number.isInteger(room.roomIndex) || room.roomIndex < 1 || seen.has(room.roomIndex)) return { valid: false, reason: 'Every room must have a unique room number.' };
    seen.add(room.roomIndex);
    const roomCategory = categories.get(room.roomCategoryId);
    if (!roomCategory) return { valid: false, reason: `Room ${room.roomIndex} references an unavailable room category.` };
    if (!Number.isInteger(room.adults) || room.adults < 0 || !Number.isInteger(room.children) || room.children < 0 || !Array.isArray(room.childAges) || room.children !== room.childAges.length) {
      return { valid: false, reason: `Room ${room.roomIndex} has an invalid guest distribution.` };
    }
    if (room.adults + room.children === 0) return { valid: false, reason: `Room ${room.roomIndex} is empty. Assign a guest or remove the room.` };
    const treatments = deriveChildTreatments(room.childAges, roomCategory);
    childTreatments.push(...treatments);
    const commercialAdults = room.adults + treatments.filter(item => item.category === 'COMMERCIAL_ADULT').length;
    const childSupplements = treatments.filter(item => item.category === 'CHILD_SUPPLEMENT').length;
    const complimentaryChildren = treatments.filter(item => item.category === 'COMPLIMENTARY_NO_BED').length;
    const rules = resolveRoomOccupancyRules(roomCategory);
    if (rules.maxTotalOccupancy !== undefined && room.adults + room.children > rules.maxTotalOccupancy) {
      return { valid: false, reason: `Room ${room.roomIndex} allows at most ${rules.maxTotalOccupancy} guests. Move a guest to another room or add a room.` };
    }
    const occupancy = validateOccupancy(roomCategory, commercialAdults, childSupplements + complimentaryChildren, childSupplements, complimentaryChildren, supplementsFor(roomCategory.id, supplementsByCategory));
    if (!occupancy.valid) return { valid: false, reason: `Room ${room.roomIndex}: ${occupancy.reason}` };
  }
  return { valid: true, childTreatments };
}

export function validateRoomAllocations(
  allocations: RoomAllocation[],
  roomCategory: RoomCategory,
  party: PartyConsistencyInput,
  supplements: RateSupplement[],
): { valid: true; childTreatments: ChildChargingTreatment[] } | { valid: false; reason: string } {
  return validateRoomAllocationsForCategories(allocations, [roomCategory], party, { [roomCategory.id]: supplements });
}

/**
 * Validates whether requested occupancy can fit in the room category.
 * Does NOT blindly assume 3 adults = 1 room + EB.
 * Checks actual room capacity and supplement availability.
 */
export function validateOccupancy(
  roomCategory: RoomCategory,
  adults: number,
  children: number,
  childrenWithBed: number,
  childrenWithoutBed: number,
  availableSupplements: RateSupplement[]
): OccupancyValidation {
  const rules = resolveRoomOccupancyRules(roomCategory);
  const { baseAdults, maxAdults, maxChildren, maxChildrenWithoutBed } = rules;

  // Validate children counts add up
  if (childrenWithBed + childrenWithoutBed > children) {
    return {
      valid: false,
      reason: 'Children with bed + children without bed exceeds total children count.',
      ebRequired: false,
      cwbCount: 0,
      cnbCount: 0,
    };
  }

  if (rules.maxTotalOccupancy !== undefined && adults + children > rules.maxTotalOccupancy) {
    return {
      valid: false,
      reason: `Room "${roomCategory.name}" allows at most ${rules.maxTotalOccupancy} guests. Add another room or choose a larger category.`,
      ebRequired: false,
      extraAdultCount: 0,
      cwbCount: 0,
      cnbCount: 0,
      suggestMultipleRooms: true,
    };
  }

  // Check if children exceed room capacity
  if (children > maxChildren) {
    return {
      valid: false,
      reason: `Room "${roomCategory.name}" supports maximum ${maxChildren} child(ren). Requested: ${children}.`,
      ebRequired: false,
      cwbCount: 0,
      cnbCount: 0,
      suggestMultipleRooms: true,
    };
  }

  if (childrenWithoutBed > maxChildrenWithoutBed) {
    return {
      valid: false,
      reason: `Room "${roomCategory.name}" allows ${maxChildrenWithoutBed} child${maxChildrenWithoutBed === 1 ? '' : 'ren'} without a bed. Add another room or choose a larger category.`,
      ebRequired: false,
      extraAdultCount: 0,
      cwbCount: 0,
      cnbCount: 0,
      suggestMultipleRooms: true,
    };
  }

  if (adults > maxAdults) {
    return {
      valid: false,
      reason: `Room "${roomCategory.name}" supports at most ${maxAdults} adult${maxAdults === 1 ? '' : 's'}. Add another room or choose a larger category.`,
      ebRequired: false,
      extraAdultCount: 0,
      cwbCount: 0,
      cnbCount: 0,
      suggestMultipleRooms: true,
    };
  }

  const extraAdultCount = Math.max(0, adults - baseAdults);
  const ebRequired = extraAdultCount > 0;
  if (ebRequired && !availableSupplements.some(s => s.type === 'EB')) {
    return {
      valid: false,
      reason: `Room "${roomCategory.name}" permits ${extraAdultCount} extra adult${extraAdultCount === 1 ? '' : 's'}, but no extra-bed supplement is configured for this rate.`,
      ebRequired: true,
      extraAdultCount,
      cwbCount: 0,
      cnbCount: 0,
    };
  }

  // Validate CWB supplement exists if children with bed requested
  if (childrenWithBed > 0) {
    const hasCwb = availableSupplements.some(s => s.type === 'CWB');
    if (!hasCwb) {
      return {
        valid: false,
        reason: `Child With Bed (CWB) supplement not available for room "${roomCategory.name}".`,
        ebRequired,
        extraAdultCount,
        cwbCount: 0,
        cnbCount: 0,
      };
    }
  }

  return {
    valid: true,
    ebRequired,
    extraAdultCount,
    cwbCount: childrenWithBed,
    cnbCount: childrenWithoutBed,
  };
}

// =====================================================
// RATE DATE MATCHING
// =====================================================

/**
 * Finds the applicable STANDARD rate period for a given date.
 * Returns null if no matching rate exists. Never returns zero.
 */
export function findApplicableRate(
  propertyId: string,
  roomCategoryId: string,
  checkInDate: string,
  rates: RatePeriod[],
  mealPlan?: MealPlanType
): RatePeriod | null {
  const checkIn = new Date(checkInDate);

  const candidates = rates.filter(r => {
    if (r.propertyId !== propertyId) return false;
    if (r.roomCategoryId !== roomCategoryId) return false;
    if (r.status !== 'ACTIVE') return false;
    if (mealPlan && r.mealPlan !== mealPlan) return false;

    const from = new Date(r.validFrom);
    if (checkIn < from) return false;

    if (r.validTo !== null) {
      const to = new Date(r.validTo);
      if (checkIn > to) return false;
    }

    return true;
  });

  if (candidates.length === 0) return null;

  // Prefer the most specific date range (non-null validTo)
  const withEndDate = candidates.filter(r => r.validTo !== null);
  if (withEndDate.length > 0) {
    // Among those with end dates, pick the one with the narrowest range
    withEndDate.sort((a, b) => {
      const rangeA = new Date(a.validTo!).getTime() - new Date(a.validFrom).getTime();
      const rangeB = new Date(b.validTo!).getTime() - new Date(b.validFrom).getTime();
      return rangeA - rangeB;
    });
    return withEndDate[0];
  }

  // Fallback to open-ended rate (sorted by newest validFrom)
  candidates.sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime());
  return candidates[0];
}

// =====================================================
// TAX APPLICATION
// =====================================================

export interface TaxResult {
  grossAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxDescription: string;
  needsConfirmation: boolean;
}

/**
 * Applies appropriate tax treatment to an amount.
 * NET: tax already included. GST_5/18: additional. NEEDS_CONFIRMATION: flagged.
 */
export function applyTax(
  amount: number,
  taxTreatment: TaxTreatment,
  customTaxPercent?: number
): TaxResult {
  switch (taxTreatment) {
    case 'NET':
    case 'INCLUSIVE':
      return {
        grossAmount: amount,
        taxAmount: 0,
        totalAmount: amount,
        taxDescription: 'Tax Included (NET)',
        needsConfirmation: false,
      };
    case 'GST_5':
      return {
        grossAmount: amount,
        taxAmount: Math.round(amount * 0.05),
        totalAmount: Math.round(amount * 1.05),
        taxDescription: 'GST 5%',
        needsConfirmation: false,
      };
    case 'GST_18':
      return {
        grossAmount: amount,
        taxAmount: Math.round(amount * 0.18),
        totalAmount: Math.round(amount * 1.18),
        taxDescription: 'GST 18%',
        needsConfirmation: false,
      };
    case 'CUSTOM_TAX': {
      const pct = customTaxPercent || 0;
      return {
        grossAmount: amount,
        taxAmount: Math.round(amount * (pct / 100)),
        totalAmount: Math.round(amount * (1 + pct / 100)),
        taxDescription: `Custom Tax ${pct}%`,
        needsConfirmation: false,
      };
    }
    case 'NEEDS_CONFIRMATION':
    default:
      return {
        grossAmount: amount,
        taxAmount: 0,
        totalAmount: amount,
        taxDescription: 'Tax treatment needs confirmation',
        needsConfirmation: true,
      };
  }
}

// =====================================================
// ROOM-NIGHT COST CALCULATION
// =====================================================

export interface RoomNightBreakdown {
  baseRate: number;
  ebAmount: number;
  cwbAmount: number;
  cnbAmount: number;
  otherSupplements: { name: string; amount: number }[];
  subtotal: number;
  taxResult: TaxResult;
  total: number;
}

/**
 * Calculates the cost of a single room-night including applicable supplements.
 * Respects occupancy validation results.
 */
export function calculateRoomNightCost(
  ratePeriod: RatePeriod,
  occupancy: OccupancyValidation
): RoomNightBreakdown {
  const { baseRate, supplements, taxTreatment, customTaxPercent } = ratePeriod;

  let ebAmount = 0;
  let cwbAmount = 0;
  let cnbAmount = 0;
  const otherSupplements: { name: string; amount: number }[] = [];

  if (occupancy.ebRequired) {
    const ebSup = supplements.find(s => s.type === 'EB');
    ebAmount = (ebSup?.amount || 0) * Math.max(1, occupancy.extraAdultCount || 1);
  }

  if (occupancy.cwbCount > 0) {
    const cwbSup = supplements.find(s => s.type === 'CWB');
    cwbAmount = (cwbSup?.amount || 0) * occupancy.cwbCount;
  }

  if (occupancy.cnbCount > 0) {
    const cnbSup = supplements.find(s => s.type === 'CNB');
    cnbAmount = (cnbSup?.amount || 0) * occupancy.cnbCount;
  }

  // Apply non-occupancy supplements (dinner supplements, etc.)
  for (const sup of supplements) {
    if (['EB', 'CWB', 'CNB'].includes(sup.type)) continue;
    otherSupplements.push({ name: sup.name, amount: sup.amount });
  }

  const supplementsTotal = otherSupplements.reduce((s, x) => s + x.amount, 0);
  const subtotal = baseRate + ebAmount + cwbAmount + cnbAmount + supplementsTotal;
  const taxResult = applyTax(subtotal, taxTreatment, customTaxPercent);

  return {
    baseRate,
    ebAmount,
    cwbAmount,
    cnbAmount,
    otherSupplements,
    subtotal,
    taxResult,
    total: taxResult.totalAmount,
  };
}

// =====================================================
// FULL STAY CALCULATION
// =====================================================

export interface StayCalculation {
  available: boolean;
  reason?: string;
  needsConfirmation: boolean;
  nights: number;
  perNightBreakdown?: RoomNightBreakdown;
  totalBeforeTax?: number;
  totalTax?: number;
  totalAmount?: number;
  taxDescription?: string;
  mealPlan?: MealPlanType;
  ratePeriodId?: string;
  occupancyValidation?: OccupancyValidation;
  roomAllocations?: RoomAllocation[];
  childTreatments?: ChildChargingTreatment[];
  roomBreakdowns?: Array<{ roomIndex: number; roomCategoryId: string; rateId?: string; totalAmount: number; occupancyValidation?: OccupancyValidation }>;
  costSource?: AccommodationCostSource;
  contractedTotalSupplierCost?: number;
  packageSupplierRate?: PackageSupplierRateInput;
  nightlyRateBreakdown?: AccommodationNightlyRateBreakdown[];
  missingRateDates?: string[];
}

function stayNightDates(checkInDate: string, nights: number): string[] {
  if (!Number.isInteger(nights) || nights < 1) return [];
  const start = new Date(`${checkInDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return [];
  return Array.from({ length: nights }, (_, offset) => {
    const night = new Date(start);
    night.setUTCDate(night.getUTCDate() + offset);
    return night.toISOString().slice(0, 10);
  });
}

function rateForNight(
  propertyId: string,
  roomCategoryId: string,
  date: string,
  rates: RatePeriod[],
  mealPlan?: MealPlanType,
  preferredRateId?: string,
): RatePeriod | null {
  const preferred = preferredRateId ? rates.find(rate => rate.id === preferredRateId) : undefined;
  if (preferred && findApplicableRate(propertyId, roomCategoryId, date, [preferred], mealPlan)) return preferred;
  return findApplicableRate(propertyId, roomCategoryId, date, rates, mealPlan);
}

/**
 * Full stay calculation pipeline:
 * 1. Validates occupancy against room category
 * 2. Finds applicable rate period
 * 3. Calculates per-night cost with supplements
 * 4. Multiplies by nights and applies tax
 */
export function calculateStayTotal(
  roomCategory: RoomCategory,
  rates: RatePeriod[],
  propertyId: string,
  checkInDate: string,
  nights: number,
  adults: number,
  children: number,
  childrenWithBed: number,
  childrenWithoutBed: number,
  mealPlan?: MealPlanType
): StayCalculation {
  if (nights <= 0) {
    return { available: false, reason: 'Number of nights must be at least 1.', needsConfirmation: false, nights: 0 };
  }

  const dates = stayNightDates(checkInDate, nights);
  if (dates.length !== nights) {
    return { available: false, reason: 'INVALID_STAY_DATES', needsConfirmation: false, nights };
  }
  const nightlyRates = dates.map(date => rateForNight(propertyId, roomCategory.id, date, rates, mealPlan));
  const missingRateDates = dates.filter((_, index) => !nightlyRates[index]);
  if (missingRateDates.length) {
    return {
      available: false,
      reason: 'RATE_NOT_AVAILABLE_FOR_DATES',
      needsConfirmation: false,
      nights,
      costSource: 'PENDING',
      missingRateDates,
    };
  }
  let totalBeforeTax = 0;
  let totalTax = 0;
  let totalAmount = 0;
  let needsConfirmation = false;
  let firstOccupancy: OccupancyValidation | undefined;
  let firstNight: RoomNightBreakdown | undefined;
  const nightlyRateBreakdown: AccommodationNightlyRateBreakdown[] = [];
  for (let index = 0; index < dates.length; index += 1) {
    const rate = nightlyRates[index]!;
    const occupancy = validateOccupancy(roomCategory, adults, children, childrenWithBed, childrenWithoutBed, rate.supplements);
    if (!occupancy.valid) return { available: false, reason: occupancy.reason || 'OCCUPANCY_EXCEEDS_ROOM_CAPACITY', needsConfirmation: false, nights, occupancyValidation: occupancy };
    const cost = calculateRoomNightCost(rate, occupancy);
    firstOccupancy ||= occupancy;
    firstNight ||= cost;
    totalBeforeTax += cost.subtotal;
    totalTax += cost.taxResult.taxAmount;
    totalAmount += cost.total;
    needsConfirmation ||= rate.confirmationStatus === 'NEEDS_CONFIRMATION' || cost.taxResult.needsConfirmation;
    nightlyRateBreakdown.push({ roomIndex: 1, roomCategoryId: roomCategory.id, date: dates[index], rateId: rate.id, baseRate: rate.baseRate, totalAmount: cost.total });
  }
  const firstRate = nightlyRates[0]!;

  return {
    available: true,
    needsConfirmation,
    nights,
    perNightBreakdown: firstNight,
    totalBeforeTax,
    totalTax,
    totalAmount,
    taxDescription: firstNight?.taxResult.taxDescription,
    mealPlan: firstRate.mealPlan,
    ratePeriodId: firstRate.id,
    occupancyValidation: firstOccupancy,
    costSource: 'INVENTORY_CONTRACTED',
    contractedTotalSupplierCost: totalAmount,
    nightlyRateBreakdown,
  };
}

/** Calculates each physical room independently, then adds the room stay totals. */
export function calculateAllocatedStayTotal(
  roomCategory: RoomCategory,
  rates: RatePeriod[],
  propertyId: string,
  checkInDate: string,
  nights: number,
  allocations: RoomAllocation[],
  party: PartyConsistencyInput,
  mealPlan?: MealPlanType,
): StayCalculation {
  const rate = findApplicableRate(propertyId, roomCategory.id, checkInDate, rates, mealPlan);
  if (!rate) return { available: false, reason: 'RATE_NOT_AVAILABLE_FOR_DATES', needsConfirmation: false, nights };
  const consistency = validateRoomAllocations(allocations, roomCategory, party, rate.supplements);
  if (consistency.valid === false) return { available: false, reason: consistency.reason, needsConfirmation: false, nights, roomAllocations: allocations };

  const roomBreakdowns: NonNullable<StayCalculation['roomBreakdowns']> = [];
  let totalAmount = 0;
  let totalBeforeTax = 0;
  let totalTax = 0;
  let needsConfirmation = false;
  let taxDescription = '';
  for (const allocation of [...allocations].sort((left, right) => left.roomIndex - right.roomIndex)) {
    const treatments = deriveChildTreatments(allocation.childAges, roomCategory);
    const commercialAdults = allocation.adults + treatments.filter(item => item.category === 'COMMERCIAL_ADULT').length;
    const childSupplements = treatments.filter(item => item.category === 'CHILD_SUPPLEMENT').length;
    const complimentaryChildren = treatments.filter(item => item.category === 'COMPLIMENTARY_NO_BED').length;
    const roomStay = calculateStayTotal(
      roomCategory, [rate], propertyId, checkInDate, nights,
      commercialAdults, childSupplements + complimentaryChildren,
      childSupplements, complimentaryChildren, mealPlan,
    );
    if (!roomStay.available || !Number.isFinite(roomStay.totalAmount)) {
      return { available: false, reason: `Room ${allocation.roomIndex}: ${roomStay.reason || 'This room cannot accommodate the assigned guests.'}`, needsConfirmation: false, nights, roomAllocations: allocations };
    }
    totalAmount += roomStay.totalAmount || 0;
    totalBeforeTax += roomStay.totalBeforeTax || 0;
    totalTax += roomStay.totalTax || 0;
    needsConfirmation ||= roomStay.needsConfirmation;
    taxDescription = roomStay.taxDescription || taxDescription;
    roomBreakdowns.push({ roomIndex: allocation.roomIndex, roomCategoryId: roomCategory.id, rateId: rate.id, totalAmount: roomStay.totalAmount || 0, occupancyValidation: roomStay.occupancyValidation });
  }
  return {
    available: true,
    needsConfirmation,
    nights,
    totalBeforeTax,
    totalTax,
    totalAmount,
    taxDescription,
    mealPlan: rate.mealPlan,
    ratePeriodId: rate.id,
    roomAllocations: allocations,
    childTreatments: consistency.childTreatments,
    roomBreakdowns,
  };
}

/** Calculates a hotel stay where each physical room may use a different category/rate. */
export function calculateMixedAllocatedStayTotal(
  roomCategories: RoomCategory[],
  rates: RatePeriod[],
  propertyId: string,
  checkInDate: string,
  nights: number,
  allocations: RoomAllocation[],
  party: PartyConsistencyInput,
  mealPlan?: MealPlanType,
  packageRate?: PackageSupplierRateInput,
): StayCalculation {
  const categories = new Map(roomCategories.map(category => [category.id, category]));
  const dates = stayNightDates(checkInDate, nights);
  if (dates.length !== nights || allocations.length === 0) return { available: false, reason: 'INVALID_STAY_DATES', needsConfirmation: false, nights };
  const nightlyRates = new Map<string, RatePeriod>();
  const missingRateDates = new Set<string>();
  for (const allocation of allocations) {
    const category = categories.get(allocation.roomCategoryId);
    if (!category || category.propertyId !== propertyId || !category.active) {
      return { available: false, reason: `Room ${allocation.roomIndex} references an unavailable room category.`, needsConfirmation: false, nights, roomAllocations: allocations };
    }
    for (let nightIndex = 0; nightIndex < dates.length; nightIndex += 1) {
      const date = dates[nightIndex];
      const rate = rateForNight(propertyId, category.id, date, rates, mealPlan, nightIndex === 0 ? allocation.rateId : undefined);
      if (rate) nightlyRates.set(`${allocation.roomIndex}:${date}`, rate);
      else missingRateDates.add(date);
    }
  }

  const supplementMap = new Map<string, RateSupplement[]>();
  for (const allocation of allocations) {
    const firstRate = nightlyRates.get(`${allocation.roomIndex}:${dates[0]}`);
    supplementMap.set(allocation.roomCategoryId, firstRate?.supplements || (packageRate ? [
      { id: 'package-eb', ratePeriodId: 'PACKAGE', type: 'EB', name: 'Extra Bed', amount: 0, unit: 'per_person_night', taxTreatment: 'NET' },
      { id: 'package-cwb', ratePeriodId: 'PACKAGE', type: 'CWB', name: 'Child With Bed', amount: 0, unit: 'per_child_night', taxTreatment: 'NET' },
    ] : []));
  }
  const consistency = validateRoomAllocationsForCategories(allocations, roomCategories, party, supplementMap);
  if (consistency.valid === false) return { available: false, reason: consistency.reason, needsConfirmation: false, nights, roomAllocations: allocations };

  if (missingRateDates.size > 0 && !packageRate) {
    return {
      available: false,
      reason: 'No contracted rate is available for every room and night. Enter a package supplier rate to continue.',
      needsConfirmation: false,
      nights,
      roomAllocations: allocations,
      costSource: 'PENDING',
      missingRateDates: [...missingRateDates].sort(),
    };
  }

  const canonicalAllocations: RoomAllocation[] = [];
  const roomBreakdowns: NonNullable<StayCalculation['roomBreakdowns']> = [];
  const nightlyRateBreakdown: AccommodationNightlyRateBreakdown[] = [];
  let totalAmount = 0;
  let totalBeforeTax = 0;
  let totalTax = 0;
  let needsConfirmation = false;
  let taxDescription = '';
  for (const allocation of [...allocations].sort((left, right) => left.roomIndex - right.roomIndex)) {
    const category = categories.get(allocation.roomCategoryId)!;
    const treatments = deriveChildTreatments(allocation.childAges, category);
    const commercialAdults = allocation.adults + treatments.filter(item => item.category === 'COMMERCIAL_ADULT').length;
    const childSupplements = treatments.filter(item => item.category === 'CHILD_SUPPLEMENT').length;
    const complimentaryChildren = treatments.filter(item => item.category === 'COMPLIMENTARY_NO_BED').length;
    let roomTotal = 0;
    let roomOccupancy: OccupancyValidation | undefined;
    for (const date of dates) {
      const contractedRate = nightlyRates.get(`${allocation.roomIndex}:${date}`);
      const validationSupplements = contractedRate?.supplements || supplementMap.get(category.id) || [];
      const occupancy = validateOccupancy(category, commercialAdults, childSupplements + complimentaryChildren, childSupplements, complimentaryChildren, validationSupplements);
      if (!occupancy.valid) return { available: false, reason: `Room ${allocation.roomIndex}: ${occupancy.reason}`, needsConfirmation: false, nights, roomAllocations: allocations };
      roomOccupancy ||= occupancy;
      const effectiveRate: RatePeriod = packageRate?.entryMode === 'PER_ROOM_NIGHT'
        ? {
            ...(contractedRate || { id: 'PACKAGE', propertyId, roomCategoryId: category.id, contractType: 'STANDARD' as const, mealPlan: mealPlan || 'CUSTOM', validFrom: date, validTo: date, currency: 'INR', confirmationStatus: 'CONFIRMED' as const, supplements: [], createdAt: '', updatedAt: '', status: 'ACTIVE' as const }),
            id: contractedRate?.id || 'PACKAGE',
            baseRate: packageRate.amount,
            supplements: contractedRate?.supplements || [],
            taxTreatment: packageRate.taxTreatment,
          }
        : contractedRate!;
      if (!effectiveRate) continue;
      const cost = calculateRoomNightCost(effectiveRate, occupancy);
      roomTotal += cost.total;
      totalAmount += cost.total;
      totalBeforeTax += cost.subtotal;
      totalTax += cost.taxResult.taxAmount;
      needsConfirmation ||= effectiveRate.confirmationStatus === 'NEEDS_CONFIRMATION' || cost.taxResult.needsConfirmation;
      taxDescription = cost.taxResult.taxDescription || taxDescription;
      nightlyRateBreakdown.push({ roomIndex: allocation.roomIndex, roomCategoryId: category.id, date, rateId: contractedRate?.id || 'PACKAGE', baseRate: effectiveRate.baseRate, totalAmount: cost.total });
    }
    const firstRate = nightlyRates.get(`${allocation.roomIndex}:${dates[0]}`);
    canonicalAllocations.push({ ...allocation, ...(firstRate ? { rateId: firstRate.id } : { rateId: undefined }) });
    roomBreakdowns.push({ roomIndex: allocation.roomIndex, roomCategoryId: category.id, rateId: firstRate?.id, totalAmount: roomTotal, occupancyValidation: roomOccupancy });
  }
  const contractedTotalSupplierCost = missingRateDates.size === 0
    ? nightlyRateBreakdown.reduce((sum, night) => {
        const rate = nightlyRates.get(`${night.roomIndex}:${night.date}`)!;
        const allocation = allocations.find(item => item.roomIndex === night.roomIndex)!;
        const category = categories.get(allocation.roomCategoryId)!;
        const treatments = deriveChildTreatments(allocation.childAges, category);
        const occupancy = validateOccupancy(category, allocation.adults + treatments.filter(item => item.category === 'COMMERCIAL_ADULT').length, treatments.filter(item => item.category !== 'COMMERCIAL_ADULT').length, treatments.filter(item => item.category === 'CHILD_SUPPLEMENT').length, treatments.filter(item => item.category === 'COMPLIMENTARY_NO_BED').length, rate.supplements);
        return sum + (occupancy.valid ? calculateRoomNightCost(rate, occupancy).total : 0);
      }, 0)
    : undefined;
  if (packageRate?.entryMode === 'TOTAL_STAY') {
    const total = applyTax(packageRate.amount, packageRate.taxTreatment);
    totalBeforeTax = total.grossAmount;
    totalTax = total.taxAmount;
    totalAmount = total.totalAmount;
    taxDescription = total.taxDescription;
    needsConfirmation ||= total.needsConfirmation;
    const divisor = allocations.length * dates.length;
    nightlyRateBreakdown.splice(0, nightlyRateBreakdown.length, ...allocations.flatMap(allocation => dates.map(date => ({ roomIndex: allocation.roomIndex, roomCategoryId: allocation.roomCategoryId, date, rateId: nightlyRates.get(`${allocation.roomIndex}:${date}`)?.id || 'PACKAGE', baseRate: divisor ? packageRate.amount / divisor : packageRate.amount, totalAmount: divisor ? total.totalAmount / divisor : total.totalAmount }))));
    for (const room of roomBreakdowns) room.totalAmount = total.totalAmount / roomBreakdowns.length;
  }
  const firstRate = nightlyRates.get(`${allocations[0].roomIndex}:${dates[0]}`);
  const costSource: AccommodationCostSource = packageRate
    ? (missingRateDates.size > 0 ? 'MANUAL_SUPPLIER_QUOTE' : 'PACKAGE_RATE_OVERRIDE')
    : 'INVENTORY_CONTRACTED';
  return {
    available: true,
    needsConfirmation,
    nights,
    totalBeforeTax,
    totalTax,
    totalAmount,
    taxDescription,
    mealPlan,
    ratePeriodId: firstRate?.id,
    roomAllocations: canonicalAllocations,
    childTreatments: consistency.childTreatments,
    roomBreakdowns,
    costSource,
    ...(contractedTotalSupplierCost !== undefined ? { contractedTotalSupplierCost } : {}),
    ...(packageRate ? { packageSupplierRate: packageRate } : {}),
    nightlyRateBreakdown,
  };
}

// =====================================================
// ROLE-GATED RESULT BUILDER (runs server-side)
// =====================================================

/** Supplier rates/costs are operational inputs, not package profit authority. */
const SUPPLIER_RATE_ACCESS_ROLES: UserRole[] = ['Founder', 'Admin', 'Accounts', 'Reservations'];

/**
 * Builds a RateCalculationResult, stripping supplier/margin fields
 * for unauthorized roles. This MUST run on the server, not client.
 */
export function buildRoleGatedResult(
  stayCalc: StayCalculation,
  ratePeriod: RatePeriod | null,
  negotiatedRate: NegotiatedRate | null,
  propertyName: string,
  roomCategoryName: string,
  userRole: UserRole
): RateCalculationResult {
  if (!stayCalc.available) {
    return {
      available: false,
      reason: stayCalc.reason,
      needsConfirmation: stayCalc.needsConfirmation,
      propertyName,
      roomCategoryName,
      costSource: stayCalc.costSource || 'PENDING',
      ...(stayCalc.missingRateDates ? { missingRateDates: stayCalc.missingRateDates } : {}),
    };
  }

  const roomCount = Math.max(1, stayCalc.roomAllocations?.length || 1);
  const supplierCostPerNight = stayCalc.packageSupplierRate?.entryMode === 'PER_ROOM_NIGHT'
    ? stayCalc.packageSupplierRate.amount
    : (stayCalc.totalAmount || 0) / Math.max(1, stayCalc.nights * roomCount);
  const totalSupplierCost = stayCalc.totalAmount || 0;

  const supplements = stayCalc.perNightBreakdown
    ? [
        ...(stayCalc.perNightBreakdown.ebAmount > 0 ? [{ name: 'Extra Bed', displayAmount: stayCalc.perNightBreakdown.ebAmount }] : []),
        ...(stayCalc.perNightBreakdown.cwbAmount > 0 ? [{ name: 'Child With Bed', displayAmount: stayCalc.perNightBreakdown.cwbAmount }] : []),
        ...(stayCalc.perNightBreakdown.cnbAmount > 0 ? [{ name: 'Child Without Bed', displayAmount: stayCalc.perNightBreakdown.cnbAmount }] : []),
        ...stayCalc.perNightBreakdown.otherSupplements.map(s => ({ name: s.name, displayAmount: s.amount })),
      ]
    : [];

  // Base result (sales-safe — available to all roles)
  const result: RateCalculationResult = {
    available: true,
    needsConfirmation: stayCalc.needsConfirmation,
    propertyId: ratePeriod?.propertyId,
    propertyName,
    roomCategoryId: ratePeriod?.roomCategoryId,
    roomCategoryName,
    rateId: ratePeriod?.id,
    mealPlan: ratePeriod?.mealPlan || stayCalc.mealPlan,
    nights: stayCalc.nights,
    taxIncluded: ratePeriod ? ['NET', 'INCLUSIVE'].includes(ratePeriod.taxTreatment) : ['NET', 'INCLUSIVE'].includes(stayCalc.packageSupplierRate?.taxTreatment || ''),
    taxDescription: stayCalc.taxDescription,
    applicableSupplements: supplements,
    ...(stayCalc.roomAllocations ? { roomAllocations: stayCalc.roomAllocations } : {}),
    ...(stayCalc.childTreatments ? { childTreatments: stayCalc.childTreatments } : {}),
    costSource: stayCalc.costSource || (negotiatedRate ? 'INVENTORY_NEGOTIATED' : 'INVENTORY_CONTRACTED'),
    ...(stayCalc.nightlyRateBreakdown ? { nightlyRateBreakdown: stayCalc.nightlyRateBreakdown } : {}),
    ...(stayCalc.missingRateDates ? { missingRateDates: stayCalc.missingRateDates } : {}),
  };

  // Add supplier/financial data ONLY for authorized roles
  if (SUPPLIER_RATE_ACCESS_ROLES.includes(userRole)) {
    result.supplierCostPerNight = supplierCostPerNight;
    result.totalSupplierCost = totalSupplierCost;
    if (stayCalc.contractedTotalSupplierCost !== undefined) result.contractedTotalSupplierCost = stayCalc.contractedTotalSupplierCost;
    if (stayCalc.packageSupplierRate) result.packageSupplierRate = stayCalc.packageSupplierRate;

    if (negotiatedRate) {
      result.negotiatedRateApplied = true;
      result.standardBaseRate = negotiatedRate.standardBaseRate;
      result.negotiatedBaseRate = negotiatedRate.negotiatedBaseRate;
    }
  }

  return result;
}

/**
 * Strips protected fields from an AccommodationProperty for unauthorized roles.
 * internalNotes is removed for Sales Executive, Sales Manager, and Marketing.
 */
export function sanitizePropertyForRole(
  property: Record<string, any>,
  userRole: UserRole
): Record<string, any> {
  const INTERNAL_NOTES_VISIBLE_ROLES: UserRole[] = ['Founder', 'Admin', 'Accounts', 'Reservations'];

  if (INTERNAL_NOTES_VISIBLE_ROLES.includes(userRole)) {
    return property;
  }

  // Strip internalNotes for unauthorized roles
  const { internalNotes, ...sanitized } = property;
  return sanitized;
}

/**
 * Checks if a user role has access to view raw supplier rate data.
 */
export function canAccessRateData(userRole: UserRole): boolean {
  return SUPPLIER_RATE_ACCESS_ROLES.includes(userRole);
}

/**
 * Checks if a user role has access to view negotiated rate data.
 */
export function canAccessNegotiatedRates(userRole: UserRole): boolean {
  return SUPPLIER_RATE_ACCESS_ROLES.includes(userRole);
}
