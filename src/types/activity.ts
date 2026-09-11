import { TaxTreatment, ConfirmationStatus } from './accommodation';
import { InventoryAvailabilityStatus } from './transport';

// =====================================================
// ACTIVITY INVENTORY & RATE MANAGEMENT — TYPE SYSTEM
// Phase 2B-4 for Booking Bridge OS
// =====================================================

export type ActivityCategoryType =
  | 'SIGHTSEEING'
  | 'GUIDED_TOUR'
  | 'EXCURSION'
  | 'ADVENTURE'
  | 'GONDOLA_CABLE_CAR'
  | 'PONY_RIDE'
  | 'RAFTING'
  | 'SKIING'
  | 'ATV'
  | 'LOCAL_EXPERIENCE'
  | 'ENTRY_TICKET'
  | 'GUIDE_SERVICE'
  | 'PERMIT'
  | 'CUSTOM';

export interface ActivityMaster {
  id: string;
  name: string;                  // 'Gulmarg Gondola Phase 1 & 2'
  category: ActivityCategoryType;
  destinationId: string;         // FK to Destination
  supplierId: string;            // FK to Supplier
  description: string;
  customerDescription?: string;  // Safe for customer preview
  duration?: string;             // '2 hours', 'Half day'
  minParticipants?: number;
  maxParticipants?: number;
  ageRestrictions?: string;
  operatingDays?: string[];      // ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  operatingSessions?: string[];  // ['09:00','14:00']
  equipmentProvided?: string[];
  requiresGuide?: boolean;
  requiresPermit?: boolean;
  inclusions?: string[];
  exclusions?: string[];
  operationalNotes?: string;     // PROTECTED
  internalNotes?: string;        // PROTECTED
  photos?: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export type ActivityPricingModel =
  | 'PER_PERSON'
  | 'PER_ADULT_CHILD'
  | 'PER_COUPLE'
  | 'PER_GROUP'
  | 'PER_VEHICLE'
  | 'PER_SESSION'
  | 'PER_TICKET'
  | 'PER_HOUR'
  | 'PER_DAY'
  | 'FIXED'
  | 'CUSTOM';

export interface ActivityRatePeriod {
  id: string;
  activityId: string;             // FK to ActivityMaster
  supplierId: string;
  
  // Flexible Pricing Architecture
  pricingModel: ActivityPricingModel;
  pricingComponents: Record<string, number>; // Dynamic map based on the model
  
  currency: string;
  validFrom: string;
  validTo: string | null;
  seasonLabel?: string;
  
  // CORE Availability Status (Rate Exists != Service Available)
  availabilityStatus: InventoryAvailabilityStatus; 
  
  taxTreatment: TaxTreatment;
  customTaxPercent?: number;
  confirmationStatus: ConfirmationStatus;
  notes?: string;                  // PROTECTED
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface NegotiatedActivityRate {
  id: string;
  activityId: string;
  supplierId: string;
  standardRateId: string;
  
  pricingModel: ActivityPricingModel;
  standardPricingComponents: Record<string, number>;
  negotiatedPricingComponents: Record<string, number>;
  
  currency: string;
  validFrom: string;
  validTo: string | null;
  seasonLabel?: string;
  availabilityStatus: InventoryAvailabilityStatus;
  taxTreatment: TaxTreatment;
  customTaxPercent?: number;
  confirmationStatus: ConfirmationStatus;
  reason: string;
  bookingReference?: string;
  requestedBy?: string;
  approvedBy?: string;
  notes?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

// --- Activity Cost Engine Result ---

export interface ActivityCostCalculation {
  available: boolean;
  totalAmount: number;
  breakdown: {
    baseCost: number;
    details: { name: string; amount: number; count: number }[];
  };
}
