// =====================================================
// ACCOMMODATION INVENTORY & RATE MANAGEMENT — TYPE SYSTEM
// Phase 2B-2 for Booking Bridge OS
// =====================================================

// --- Property Types ---

export type PropertyType = 'HOTEL' | 'RESORT' | 'HOUSEBOAT' | 'HOMESTAY' | 'OTHER';
export type PropertyStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

// --- Meal Plan Types ---

export type MealPlanType = 'EP' | 'CP' | 'MAP' | 'AP' | 'CUSTOM';

export const MEAL_PLAN_LABELS: Record<MealPlanType, string> = {
  EP: 'European Plan (Room Only)',
  CP: 'Continental Plan (Room + Breakfast)',
  MAP: 'Modified American Plan (Room + Breakfast + Dinner)',
  AP: 'American Plan (All Meals)',
  CUSTOM: 'Custom Meal Plan',
};

// --- Supplement Types ---

export type SupplementType =
  | 'EB'
  | 'CWB'
  | 'CNB'
  | 'ADULT_DINNER'
  | 'CHILD_DINNER'
  | 'LUNCH'
  | 'GALA_DINNER'
  | 'WEEKEND'
  | 'SEASONAL'
  | 'CUSTOM';

export const SUPPLEMENT_LABELS: Record<SupplementType, string> = {
  EB: 'Extra Bed',
  CWB: 'Child With Bed',
  CNB: 'Child Without Bed',
  ADULT_DINNER: 'Adult Dinner Supplement',
  CHILD_DINNER: 'Child Dinner Supplement',
  LUNCH: 'Lunch Supplement',
  GALA_DINNER: 'Gala Dinner',
  WEEKEND: 'Weekend Supplement',
  SEASONAL: 'Seasonal Supplement',
  CUSTOM: 'Custom Supplement',
};

// --- Tax Treatment ---

export type TaxTreatment = 'NET' | 'GST_5' | 'GST_18' | 'CUSTOM_TAX' | 'NEEDS_CONFIRMATION';

export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  NET: 'NET (Tax Included)',
  GST_5: 'GST 5% Additional',
  GST_18: 'GST 18% Additional',
  CUSTOM_TAX: 'Custom Tax Rate',
  NEEDS_CONFIRMATION: 'Needs Confirmation',
};

// --- Rate & Availability ---

export type RateContractType = 'STANDARD' | 'GROUP' | 'NEGOTIATED';
export type AvailabilityStatusType = 'NOT_CHECKED' | 'REQUESTED' | 'AVAILABLE' | 'NOT_AVAILABLE' | 'ON_HOLD' | 'CONFIRMED';
export type ConfirmationStatus = 'CONFIRMED' | 'NEEDS_CONFIRMATION';

// --- Photo Categories ---

export type PropertyPhotoCategory = 'EXTERIOR' | 'LOBBY' | 'RESTAURANT' | 'FACILITIES' | 'VIEW' | 'OTHER';
export type RoomPhotoCategory = 'ROOM' | 'BATHROOM' | 'VIEW' | 'OTHER';

// =====================================================
// DATA MODELS
// =====================================================

/** Photo reference for properties and room categories */
export interface PropertyPhoto {
  id: string;
  propertyId: string;
  roomCategoryId?: string;       // null = property-level photo
  category: PropertyPhotoCategory | RoomPhotoCategory;
  url?: string;                  // Storage reference URL (populated on upload)
  caption?: string;
  sortOrder: number;
  uploadedAt?: string;
  uploadedBy?: string;
}

/** Accommodation Property — the core property/hotel/houseboat record */
export interface AccommodationProperty {
  id: string;
  name: string;
  propertyType: PropertyType;
  location: string;              // Region: 'Kashmir', 'Ladakh', 'Jammu', etc.
  city: string;                  // 'Srinagar', 'Pahalgam', 'Gulmarg', etc.
  area?: string;                 // Sub-area if needed
  starCategory?: string;         // '3 Star', '4 Star', '5 Star Luxury', etc.
  description: string;
  amenities: string[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  /** PROTECTED — stripped at data-access layer for Sales Executive/Marketing */
  internalNotes?: string;
  preferredProperty: boolean;
  status: PropertyStatus;
  supplierId?: string;
  currency: string;              // Default 'INR'
  photos: PropertyPhoto[];
  availabilityStatus: AvailabilityStatusType; // Default 'NOT_CHECKED'
  // Timestamps & audit
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  isDemo?: boolean;
}

/** Room Category within a property */
export interface RoomCategory {
  id: string;
  propertyId: string;
  name: string;                  // 'Deluxe Room', 'Suite', 'Cottage', etc.
  description?: string;
  maxAdults: number;             // Default 2 (double sharing base)
  maxChildren: number;           // Default 1
  bedConfiguration?: string;     // e.g. '1 King' or '2 Twin'
  amenities: string[];
  photos: PropertyPhoto[];
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

/** Rate supplement — attached to a RatePeriod or NegotiatedRate */
export interface RateSupplement {
  id: string;
  ratePeriodId: string;          // FK to RatePeriod or NegotiatedRate
  type: SupplementType;
  name: string;                  // Display name, e.g. 'Extra Bed'
  amount: number;
  unit: 'per_room_night' | 'per_person_night' | 'per_child_night';
  taxTreatment: TaxTreatment;
  notes?: string;
  isDemo?: boolean;
}

/** Standard rate period for a room category. Contains STANDARD contract rates only. */
export interface RatePeriod {
  id: string;
  propertyId: string;
  roomCategoryId: string;
  contractType: 'STANDARD';      // Always STANDARD in this collection
  mealPlan: MealPlanType;
  validFrom: string;             // ISO date string YYYY-MM-DD
  validTo: string | null;        // null = open-ended
  baseRate: number;              // Per room per night (double sharing)
  currency: string;
  taxTreatment: TaxTreatment;
  customTaxPercent?: number;     // Only for CUSTOM_TAX
  confirmationStatus: ConfirmationStatus;
  supplements: RateSupplement[];
  notes?: string;
  // Audit
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  isDemo?: boolean;
}

/**
 * Negotiated/Group rate — SEPARATE from standard rate.
 * NEVER overwrites the corresponding RatePeriod.
 * Always references the original standard rate via standardRateId.
 */
export interface NegotiatedRate {
  id: string;
  propertyId: string;
  roomCategoryId: string;
  mealPlan: MealPlanType;
  standardRateId: string;        // FK to the original STANDARD RatePeriod
  standardBaseRate: number;      // Preserved original standard rate
  negotiatedBaseRate: number;    // Discounted rate
  contractType: 'GROUP' | 'NEGOTIATED';
  reason: string;
  bookingReference?: string;     // Trip/group ID if applicable
  validFrom: string;
  validTo: string | null;
  taxTreatment: TaxTreatment;
  customTaxPercent?: number;
  supplements: RateSupplement[];
  requestedBy?: string;
  approvedBy?: string;
  confirmationStatus: ConfirmationStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  status: 'ACTIVE' | 'ARCHIVED';
  isDemo?: boolean;
}

/** Immutable rate change record */
export interface RateHistoryEntry {
  id: string;
  entityType: 'RATE_PERIOD' | 'NEGOTIATED_RATE' | 'SUPPLEMENT';
  entityId: string;
  propertyId: string;            // For easier filtering
  field: string;
  previousValue: any;
  newValue: any;
  changedBy: string;
  changedAt: string;
  reason?: string;
}

// =====================================================
// RATE CALCULATION RESULT (returned by server API)
// =====================================================

/** Occupancy validation result */
export interface OccupancyValidation {
  valid: boolean;
  reason?: string;               // 'OCCUPANCY_EXCEEDS_ROOM_CAPACITY', 'EB_SUPPLEMENT_REQUIRED_BUT_MISSING', etc.
  ebRequired: boolean;
  cwbCount: number;
  cnbCount: number;
  suggestMultipleRooms?: boolean;
}

/** Sales-safe rate calculation result (supplier fields stripped for unauthorized roles) */
export interface RateCalculationResult {
  available: boolean;
  reason?: string;               // 'RATE_NOT_AVAILABLE_FOR_DATES', 'OCCUPANCY_EXCEEDS_ROOM_CAPACITY', etc.
  needsConfirmation?: boolean;
  propertyId?: string;
  propertyName?: string;
  roomCategoryId?: string;
  roomCategoryName?: string;
  mealPlan?: MealPlanType;
  nights?: number;
  sellingPricePerNight?: number;
  totalSellingPrice?: number;
  taxIncluded?: boolean;
  taxDescription?: string;
  applicableSupplements?: { name: string; displayAmount: number }[];
  // ONLY included for Founder/Admin/Accounts (stripped by server for other roles):
  supplierCostPerNight?: number;
  totalSupplierCost?: number;
  grossProfit?: number;
  grossMargin?: number;
  negotiatedRateApplied?: boolean;
  standardBaseRate?: number;
  negotiatedBaseRate?: number;
}

/** Request parameters for rate calculation */
export interface RateCalculationRequest {
  propertyId: string;
  roomCategoryId: string;
  checkInDate: string;           // ISO date
  nights: number;
  mealPlan: MealPlanType;
  adults: number;
  children: number;
  childrenWithBed: number;       // Number of children needing bed (CWB)
  childrenWithoutBed: number;    // Number of children without bed (CNB)
  useNegotiatedRate?: boolean;   // Only for authorized roles
  negotiatedRateId?: string;
}
