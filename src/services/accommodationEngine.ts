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
} from '../types/accommodation';
import type { UserRole } from '../types';

// =====================================================
// OCCUPANCY VALIDATION
// =====================================================

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
  const { maxAdults, maxChildren } = roomCategory;

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

  // Check adults
  let ebRequired = false;

  if (adults <= maxAdults) {
    // Fits within base occupancy — no EB needed
    ebRequired = false;
  } else if (adults === maxAdults + 1) {
    // Exactly one extra adult — needs EB supplement
    const hasEbSupplement = availableSupplements.some(s => s.type === 'EB');
    if (!hasEbSupplement) {
      return {
        valid: false,
        reason: `Room "${roomCategory.name}" holds ${maxAdults} adults. Extra bed supplement not available for additional adult.`,
        ebRequired: true,
        cwbCount: 0,
        cnbCount: 0,
        suggestMultipleRooms: true,
      };
    }
    ebRequired = true;
  } else {
    // More than maxAdults + 1 — cannot fit
    return {
      valid: false,
      reason: `Room "${roomCategory.name}" cannot accommodate ${adults} adults (max ${maxAdults} + 1 extra bed). Consider booking multiple rooms.`,
      ebRequired: false,
      cwbCount: 0,
      cnbCount: 0,
      suggestMultipleRooms: true,
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
        cwbCount: 0,
        cnbCount: 0,
      };
    }
  }

  // Validate CNB supplement exists if children without bed requested
  if (childrenWithoutBed > 0) {
    const hasCnb = availableSupplements.some(s => s.type === 'CNB');
    if (!hasCnb) {
      return {
        valid: false,
        reason: `Child Without Bed (CNB) supplement not available for room "${roomCategory.name}".`,
        ebRequired,
        cwbCount: childrenWithBed,
        cnbCount: 0,
      };
    }
  }

  return {
    valid: true,
    ebRequired,
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
    ebAmount = ebSup?.amount || 0;
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

  // 1. Find applicable rate
  const rate = findApplicableRate(propertyId, roomCategory.id, checkInDate, rates, mealPlan);
  if (!rate) {
    return {
      available: false,
      reason: 'RATE_NOT_AVAILABLE_FOR_DATES',
      needsConfirmation: false,
      nights,
    };
  }

  // 2. Validate occupancy
  const occupancy = validateOccupancy(roomCategory, adults, children, childrenWithBed, childrenWithoutBed, rate.supplements);
  if (!occupancy.valid) {
    return {
      available: false,
      reason: occupancy.reason || 'OCCUPANCY_EXCEEDS_ROOM_CAPACITY',
      needsConfirmation: false,
      nights,
      occupancyValidation: occupancy,
    };
  }

  // 3. Calculate per-night cost
  const perNight = calculateRoomNightCost(rate, occupancy);

  // 4. Multiply by nights
  const totalBeforeTax = perNight.subtotal * nights;
  const totalTaxResult = applyTax(totalBeforeTax, rate.taxTreatment, rate.customTaxPercent);

  return {
    available: true,
    needsConfirmation: rate.confirmationStatus === 'NEEDS_CONFIRMATION' || totalTaxResult.needsConfirmation,
    nights,
    perNightBreakdown: perNight,
    totalBeforeTax,
    totalTax: totalTaxResult.taxAmount,
    totalAmount: totalTaxResult.totalAmount,
    taxDescription: totalTaxResult.taxDescription,
    mealPlan: rate.mealPlan,
    ratePeriodId: rate.id,
    occupancyValidation: occupancy,
  };
}

// =====================================================
// ROLE-GATED RESULT BUILDER (runs server-side)
// =====================================================

/** Roles that can see full supplier cost data */
const FULL_FINANCIAL_ACCESS_ROLES: UserRole[] = ['Founder', 'Admin', 'Accounts'];

/** Roles that can see rate data but not negotiate */
const RATE_VIEW_ROLES: UserRole[] = ['Founder', 'Admin', 'Accounts', 'Operations'];

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
  if (!stayCalc.available || !ratePeriod) {
    return {
      available: false,
      reason: stayCalc.reason,
      needsConfirmation: stayCalc.needsConfirmation,
      propertyName,
      roomCategoryName,
    };
  }

  const supplierCostPerNight = stayCalc.perNightBreakdown?.total || 0;
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
    propertyId: ratePeriod.propertyId,
    propertyName,
    roomCategoryId: ratePeriod.roomCategoryId,
    roomCategoryName,
    mealPlan: ratePeriod.mealPlan,
    nights: stayCalc.nights,
    taxIncluded: ratePeriod.taxTreatment === 'NET',
    taxDescription: stayCalc.taxDescription,
    applicableSupplements: supplements,
  };

  // Add supplier/financial data ONLY for authorized roles
  if (FULL_FINANCIAL_ACCESS_ROLES.includes(userRole)) {
    result.supplierCostPerNight = supplierCostPerNight;
    result.totalSupplierCost = totalSupplierCost;

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
  const INTERNAL_NOTES_VISIBLE_ROLES: UserRole[] = ['Founder', 'Admin', 'Operations', 'Accounts'];

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
  return RATE_VIEW_ROLES.includes(userRole);
}

/**
 * Checks if a user role has access to view negotiated rate data.
 */
export function canAccessNegotiatedRates(userRole: UserRole): boolean {
  return FULL_FINANCIAL_ACCESS_ROLES.includes(userRole);
}
