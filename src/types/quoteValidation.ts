import { LineItemCostSnapshot } from './booking';

// =====================================================
// PRE-CONVERSION QUOTE VALIDATION — TYPE SYSTEM
// Phase 2B-5 Stage 3 & 4 for Booking Bridge OS
// =====================================================

export type ValidationOutcome =
  | 'AVAILABLE'
  | 'NEEDS_CONFIRMATION'
  | 'ON_REQUEST'
  | 'RATE_CHANGED'
  | 'SERVICE_UNAVAILABLE'
  | 'MISSING_RATE_CONFIGURATION'
  | 'REQUIRES_REPRICING';

export type ServiceType = 'ACCOMMODATION' | 'TRANSPORT' | 'ACTIVITY';

export type QuoteValidationMode = 'STANDARD' | 'CONVERSION';

export interface RateDiscrepancy {
  serviceType: ServiceType;
  serviceId: string;
  serviceName: string;
  ratePeriodId?: string;
  quotedRate?: number;
  currentRate?: number;
  currency: string;
  reason: string;
}

export interface ServiceValidationResult {
  serviceType: ServiceType;
  serviceId: string;
  serviceName: string;
  outcome: ValidationOutcome;
  isValid: boolean;
  canProceedToBooking: boolean; // true if AVAILABLE, NEEDS_CONFIRMATION, or ON_REQUEST

  // Rate details (Protected — sanitized for Sales Executive / Marketing)
  rateVerified: boolean;
  ratePeriodId?: string;
  authoritativeSupplierCost?: number;
  quotedSupplierCost?: number;
  isFoc?: boolean;
  focReason?: string;
  discrepancy?: RateDiscrepancy;
  lineItemSnapshot?: LineItemCostSnapshot;

  // Availability details
  availabilityStatus: 'AVAILABLE' | 'NEEDS_CONFIRMATION' | 'ON_REQUEST' | 'UNAVAILABLE';
  availabilityNotes?: string;

  // Diagnostics & errors
  errors: string[];
  warnings: string[];
}

export interface QuoteValidationResult {
  quoteId: string;
  quoteVersion: number;
  overallOutcome: ValidationOutcome;
  isValid: boolean;
  canConvert: boolean; // true if overallOutcome in ['AVAILABLE', 'NEEDS_CONFIRMATION', 'ON_REQUEST']

  // Summary counts
  totalServices: number;
  availableServices: number;
  needsConfirmationServices: number;
  onRequestServices: number;
  unavailableServices: number;
  rateChangedServices: number;
  missingRateServices: number;

  // Financial aggregates (Protected — sanitized for Sales Executive / Marketing)
  authoritativeTotalSupplierCost?: number;
  quotedTotalSupplierCost?: number;
  totalSellingPrice: number;
  estimatedGrossProfit?: number;
  estimatedGrossMargin?: number;

  // Detailed line item validation results
  services: ServiceValidationResult[];

  // High-level discrepancies & validation messages
  discrepancies: RateDiscrepancy[];
  errors: string[];
  warnings: string[];
  validatedAt: string;
}
