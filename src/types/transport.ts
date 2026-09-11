import { TaxTreatment, ConfirmationStatus } from './accommodation';

// =====================================================
// TRANSPORT INVENTORY & RATE MANAGEMENT — TYPE SYSTEM
// Phase 2B-4 for Booking Bridge OS
// =====================================================

// --- Vehicle & Master Data Types ---

export type VehicleCategoryType = 'SEDAN' | 'SUV' | 'MUV' | 'TEMPO_TRAVELLER' | 'BUS' | 'LUXURY' | 'CUSTOM';

export interface VehicleCategory {
  id: string;
  name: string;              // 'Innova Crysta AC'
  displayName: string;       // 'Toyota Innova Crysta (AC)'
  category: VehicleCategoryType;
  seatingCapacity: number;   // e.g. 32 (fully configurable)
  passengerCapacity: number; // e.g. 30 (excluding driver/helper)
  luggageCapacity?: string;  // '3 large bags'
  operationalRegions: string[]; // ['Kashmir', 'Jammu', 'Ladakh']
  features: string[];        // ['AC', '4x4', 'Snow Chains']
  restrictions?: string[];   // ['Not suitable for Khardung La in winter']
  active: boolean;
  sortOrder: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export type DestinationCategoryType = 'CITY' | 'HILL_STATION' | 'LAKE' | 'VALLEY' | 'PASS' | 'RELIGIOUS' | 'AIRPORT' | 'RAILWAY' | 'OTHER';

export interface Destination {
  id: string;
  name: string;              // 'Gulmarg'
  region: string;            // 'Kashmir'
  state: string;             // 'Jammu & Kashmir'
  category: DestinationCategoryType;
  altitude?: number;         // meters
  coordinates?: { lat: number; lng: number };
  seasonalAccess?: string;   // 'Year-round' or 'May-October'
  operationalNotes?: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export type RouteType = 'ONE_WAY' | 'ROUND_TRIP' | 'CIRCUIT' | 'DAY_TRIP';

export interface TransportRoute {
  id: string;
  name: string;                 // 'Srinagar → Pahalgam → Gulmarg → Srinagar'
  origin: string;               // destinationId
  destination: string;          // destinationId
  waypoints?: string[];         // intermediate destinationIds
  routeType: RouteType;
  estimatedDistanceKm?: number;
  estimatedDurationHours?: number;
  vehicleRestrictions?: string[];  // vehicleCategoryIds not permitted
  seasonalRestrictions?: string;   // 'Closed Nov-Apr'
  requiresLocalVehicle?: boolean;
  requiresPermit?: boolean;
  operationalNotes?: string;       // PROTECTED — stripped for Sales
  active: boolean;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

// --- Transport Services & Rates ---

export type TransportServiceType =
  | 'AIRPORT_TRANSFER'
  | 'RAILWAY_TRANSFER'
  | 'HOTEL_TRANSFER'
  | 'ONE_WAY_TRANSFER'
  | 'ROUND_TRIP_TRANSFER'
  | 'LOCAL_SIGHTSEEING'
  | 'HALF_DAY_SIGHTSEEING'
  | 'FULL_DAY_SIGHTSEEING'
  | 'DAY_TRIP'
  | 'MULTI_DAY_JOURNEY'
  | 'OVERNIGHT_JOURNEY'
  | 'CUSTOM';

export type TransportPricingUnit =
  | 'PER_DAY'
  | 'PER_TRIP'
  | 'PER_TRANSFER'
  | 'PER_ROUTE'
  | 'PER_KM'
  | 'PER_HOUR'
  | 'PER_JOURNEY'
  | 'FIXED_MULTI_DAY'
  | 'CUSTOM';

export type TransportInclusionStatus = 'INCLUDED' | 'EXCLUDED' | 'ADDITIONAL' | 'NEEDS_CONFIRMATION';
export type InventoryAvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'NEEDS_CONFIRMATION' | 'ON_REQUEST';

export interface TransportRatePeriod {
  id: string;
  vehicleCategoryId: string;
  supplierId: string;
  routeId?: string;              // null = applies to any route for this vehicle
  serviceType: TransportServiceType;
  pricingUnit: TransportPricingUnit;
  baseRate: number;              // Rate per pricing unit
  currency: string;              // 'INR'
  validFrom: string;             // ISO date
  validTo: string | null;        // null = open-ended
  seasonLabel?: string;          // 'Peak Season', 'Off Season'
  
  // Explicit Inclusion Model
  inclusions: {
    vehicle: TransportInclusionStatus;
    driver: TransportInclusionStatus;
    fuel: TransportInclusionStatus;
    toll: TransportInclusionStatus;
    parking: TransportInclusionStatus;
    tax: TransportInclusionStatus;
    driverAllowance: TransportInclusionStatus;
    nightHalt: TransportInclusionStatus;
    permits: TransportInclusionStatus;
  };

  availabilityStatus: InventoryAvailabilityStatus; // Distinguishes 'Rate Exists' from 'Available'
  
  // Tax
  taxTreatment: TaxTreatment;
  customTaxPercent?: number;
  confirmationStatus: ConfirmationStatus;
  notes?: string;                // PROTECTED
  // Audit
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  isDemo?: boolean;
}

export type TransportSupplementType = 'DRIVER_ALLOWANCE' | 'NIGHT_HALT' | 'TOLL' | 'PARKING' | 'PERMIT' | 'EXTRA_DAY' | 'OVERTIME' | 'CUSTOM';
export type TransportSupplementUnit = 'per_day' | 'per_night' | 'per_occurrence' | 'flat';

export interface TransportSupplement {
  id: string;
  ratePeriodId: string;       // FK to TransportRatePeriod
  type: TransportSupplementType;
  name: string;
  amount: number;
  unit: TransportSupplementUnit;
  notes?: string;
  isDemo?: boolean;
}

export interface NegotiatedTransportRate {
  id: string;
  vehicleCategoryId: string;
  supplierId: string;
  standardRateId: string;        // FK to the original standard TransportRatePeriod
  routeId?: string;
  serviceType: TransportServiceType;
  pricingUnit: TransportPricingUnit;
  standardBaseRate: number;      // Preserved original standard rate
  negotiatedBaseRate: number;    // Discounted rate
  currency: string;
  validFrom: string;
  validTo: string | null;
  seasonLabel?: string;
  inclusions: {
    vehicle: TransportInclusionStatus;
    driver: TransportInclusionStatus;
    fuel: TransportInclusionStatus;
    toll: TransportInclusionStatus;
    parking: TransportInclusionStatus;
    tax: TransportInclusionStatus;
    driverAllowance: TransportInclusionStatus;
    nightHalt: TransportInclusionStatus;
    permits: TransportInclusionStatus;
  };
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

// --- Transport Cost Calculation Engine Result ---

export interface TransportCostCalculation {
  available: boolean;
  totalAmount: number;
  breakdown: {
    baseVehicleCost: number;
    includedCharges: string[];
    additionalChargesTotal: number;
    additionalChargesDetails: { name: string; amount: number }[];
  };
}
