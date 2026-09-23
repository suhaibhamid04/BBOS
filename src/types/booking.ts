import { MealPlanType, TaxTreatment } from './accommodation';

// =====================================================
// BOOKING & SERVICE FULFILLMENT — TYPE SYSTEM
// Phase 2B-5 for Booking Bridge OS
// Document Version: 2.0.0
// =====================================================

// --- Commercial Booking Statuses ---

export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'IN_OPERATIONS'
  | 'TRAVELLING'
  | 'COMPLETED'
  | 'CANCELLED';

export type PaymentStatus =
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE';

export type BookingComponentStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'CANCELLED';

export type VoucherStatus =
  | 'PENDING'
  | 'GENERATED'
  | 'SENT';

export interface ConfirmationProgress {
  totalServices: number;
  confirmedServices: number;
  requestedServices: number;
  cancelledServices: number;
  allConfirmed: boolean;
}

/**
 * Top-Level Commercial Booking Document
 * Stored at: bookings/{bookingId}
 * 
 * STRICT INVARIANT: ZERO supplier-cost or margin fields.
 * FORBIDDEN: totalSupplierCost, grossProfit, grossMargin, hotelCost, transportCost, activityCost, supplierBuyRate, etc.
 */
export interface Booking {
  id: string;
  bookingReference: string;
  tripId: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  leadId?: string;
  quoteId?: string;
  quoteVersion?: number;

  // Commercial state (Server-authoritative, client-immutable)
  status: BookingStatus;
  paymentStatus?: PaymentStatus;
  currency?: string;
  totalSellingPrice?: number;
  totalAmount?: number; // Backward-compatibility alias for totalSellingPrice
  amountReceived: number;
  amountPending: number;
  isOverpaid?: boolean;
  overpaidAmount?: number;

  // Operational fulfillment metrics
  confirmationProgress?: ConfirmationProgress;
  travelStartDate: string; // ISO Date YYYY-MM-DD
  travelEndDate: string;   // ISO Date YYYY-MM-DD
  assignedSalesEmployeeId?: string;
  assignedSalesManagerId?: string;
  /** Stable BBOS employeeId; future Stage C access will be ASSIGNED-scoped. */
  assignedReservationsEmployeeId?: string;
  assignedOperationsEmployeeId?: string;

  // Notes & tracking
  guestNotes?: string;
  specialRequests?: string;
  schemaVersion?: '2B-5';
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

// =====================================================
// FINANCIAL SNAPSHOT (IMMUTABLE SERVER-AUTHORITATIVE STRUCTURE)
// Stored at: bookings/{bookingId}/financial_snapshot/{snapshotId}
// Access: Founder, Admin, Accounts ONLY
// Direct Client Writes: PROHIBITED (Server Admin SDK Only)
// =====================================================

export interface LineItemCostSnapshot {
  serviceId: string;
  serviceType: 'ACCOMMODATION' | 'TRANSPORT' | 'ACTIVITY' | 'OTHER';
  supplierId: string;
  supplierName: string;
  inventoryMasterId: string;
  ratePeriodId: string;
  rateContractType: 'STANDARD' | 'NEGOTIATED' | 'GROUP';
  frozenSupplierUnitRate: number;
  units: number;
  frozenSupplementsCost: number;
  frozenTotalSupplierCost: number;
  taxTreatment: TaxTreatment;
  taxAmount: number;
  rateVerifiedAt: string;
}

export interface FinancialSnapshot {
  id: string;
  bookingId: string;
  snapshotVersion: number;
  quoteId: string;
  quoteVersion: number;
  currency: string;
  totalSellingPrice: number;
  totalSupplierCost: number;
  accommodationSupplierCost: number;
  transportSupplierCost: number;
  activitySupplierCost: number;
  otherSupplierCosts: number;
  grossProfit: number;
  grossMargin: number;
  lineItems: LineItemCostSnapshot[];
  rateValidationFingerprint: string;
  createdAt: string;
  createdBy: string;
}

// =====================================================
// MODERN SERVICE EXECUTION DOCUMENTS
// Stored at: booking_accommodations/{id}, booking_transports/{id}, booking_activities/{id}
// STRICT INVARIANT: ZERO supplier buy-cost or margin fields!
// =====================================================

export interface BookingAccommodation {
  id: string;
  bookingId: string;
  tripId: string;
  customerId: string;

  // [A] Commercial / Sales-Safe Fields (Readable: Sales, Ops, Accounts)
  propertyId: string;
  propertyName: string;
  roomCategoryId: string;
  roomCategoryName: string;
  mealPlan: MealPlanType;
  checkInDate: string;
  checkOutDate: string;
  nightsCount: number;
  roomsCount: number;
  adultsCount: number;
  childrenCount: number;
  guestNames?: string[];
  specialRequests?: string;

  // [B] Operations / Dispatch Fields (Editable by Operations & Admin)
  supplierId: string;
  supplierContactName?: string;
  supplierContactPhone?: string;
  confirmationStatus: BookingComponentStatus;
  supplierConfirmationCode?: string;
  allocatedRoomNumbers?: string[];
  operationalNotes?: string;
  supplierNotes?: string;
  voucherId?: string;
  voucherStatus: VoucherStatus;

  // Metadata
  schemaVersion: '2B-5';
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface BookingTransport {
  id: string;
  bookingId: string;
  tripId: string;
  customerId: string;

  // [A] Commercial / Sales-Safe Fields (Readable: Sales, Ops, Accounts)
  vehicleCategoryId: string;
  vehicleCategoryName: string;
  routeId?: string;
  routeName: string;
  serviceDate: string;
  endDate?: string;
  daysCount: number;
  pickupLocation: string;
  dropoffLocation: string;
  pickupTime?: string;
  passengerCount: number;
  specialRequests?: string;

  // [B] Operations / Dispatch Fields (Editable by Operations & Admin)
  supplierId: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleRegistrationNumber?: string;
  confirmationStatus: BookingComponentStatus;
  operationalNotes?: string;
  supplierNotes?: string;
  voucherId?: string;
  voucherStatus: VoucherStatus;

  // Metadata
  schemaVersion: '2B-5';
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface BookingActivity {
  id: string;
  bookingId: string;
  tripId: string;
  customerId: string;

  // [A] Commercial / Sales-Safe Fields (Readable: Sales, Ops, Accounts)
  activityMasterId: string;
  activityName: string;
  destinationId: string;
  destinationName: string;
  serviceDate: string;
  sessionTime?: string;
  participantCount: number;
  leadGuestName?: string;
  specialRequests?: string;

  // [B] Operations / Dispatch Fields (Editable by Operations & Admin)
  supplierId: string;
  confirmationStatus: BookingComponentStatus;
  supplierConfirmationCode?: string;
  ticketNumbers?: string[];
  assignedGuideName?: string;
  assignedGuidePhone?: string;
  operationalNotes?: string;
  voucherId?: string;
  voucherStatus: VoucherStatus;

  // Metadata
  schemaVersion: '2B-5';
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}
