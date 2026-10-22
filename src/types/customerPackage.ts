import type { PaymentScheduleMilestone } from '../policies/bookingBridgePolicy';

export type CustomerPackageServiceType = 'HOTEL' | 'TRANSPORT' | 'ACTIVITY' | 'OTHER';

export interface CustomerPackageItineraryItem {
  type: CustomerPackageServiceType;
  title: string;
  description?: string;
  propertyName?: string;
  roomCategoryName?: string;
  mealPlan?: string;
  checkInDate?: string;
  checkOutDate?: string;
  rooms?: number;
  vehicleName?: string;
  routeName?: string;
  serviceDate?: string;
  activityName?: string;
  inclusionStatus?: import('./activity').ActivityInclusionStatus;
}

export interface CustomerPackageDay {
  dayNumber: number;
  date: string;
  title: string;
  description?: string;
  location?: string;
  route?: string;
  placesCovered?: string[];
  overnightLocation?: string;
  meals?: string[];
  items: CustomerPackageItineraryItem[];
}

export interface CustomerPackageDocument {
  brand: {
    name: 'Booking Bridge';
    tagline: 'Travel, thoughtfully arranged';
    email: string;
    phone: string;
  };
  packageReference: string;
  customerName: string;
  destination: string;
  travelStartDate?: string;
  travelEndDate?: string;
  travelerCount: number;
  hotels: Array<{
    hotelName: string;
    roomCategoryName: string;
    mealPlan: string;
    checkInDate?: string;
    checkOutDate?: string;
    nights: number;
    rooms: number;
  }>;
  transports: Array<{
    vehicleName: string;
    route: string;
    serviceDate?: string;
    days: number;
    passengerCount: number;
    vehicleCount?: number;
    serviceDays?: import('./transport').TransportServiceDay[];
  }>;
  activities: Array<{
    activityName: string;
    serviceDate?: string;
    participantCount: number;
    inclusionStatus?: import('./activity').ActivityInclusionStatus;
  }>;
  itinerary: CustomerPackageDay[];
  packageSellingPrice: number;
  currency: string;
  inclusions: string[];
  exclusions: string[];
  termsAndConditions?: string;
  policyVersion?: string;
  paymentSchedule?: PaymentScheduleMilestone[];
  generatedAt: string;
}

/** Strictly customer-safe M5A comparison projection. */
export interface CustomerQuoteOptionSummary {
  optionId: string;
  quoteId: string;
  label: string;
  customerTitle?: string;
  order: number;
  recommended: boolean;
  status: import('./index').QuoteOptionStatus;
  packageSellingPrice: number;
  currency: string;
  travelerCount: number;
  durationDays?: number;
  durationNights?: number;
  hotelHighlights: string[];
  transportHighlights: string[];
  includedActivityHighlights: string[];
  optionalActivityHighlights: string[];
  validUntil: string;
}

export interface CustomerQuoteComparison {
  quoteGroupId: string;
  customerName: string;
  destination: string;
  title: string;
  options: CustomerQuoteOptionSummary[];
}

export type QuoteShareChannel = 'DOCUMENT' | 'EMAIL' | 'WHATSAPP';

export interface QuoteShareResult {
  quote: import('./index').Quote;
  customerPackage: CustomerPackageDocument;
}

export type CustomerShareStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';
export type CustomerShareExpiryDays = 7 | 14 | 30;

/** Dedicated public option DTO. It intentionally contains no Quote IDs or workflow state. */
export interface CustomerSharePublicOption {
  key: string;
  label: string;
  customerTitle?: string;
  order: number;
  recommended: boolean;
  packageSellingPrice: number;
  currency: string;
  travelerCount: number;
  durationDays?: number;
  durationNights?: number;
  hotelHighlights: string[];
  transportHighlights: string[];
  includedActivityHighlights: string[];
  optionalActivityHighlights: string[];
  validUntil: string;
  package: CustomerPackageDocument;
}

/** Immutable, allowlisted payload returned by the unauthenticated token route. */
export interface CustomerSharePublicView {
  brand: CustomerPackageDocument['brand'];
  title: string;
  preparedFor: string;
  destination: string;
  travelStartDate?: string;
  travelEndDate?: string;
  travelerCount: number;
  options: CustomerSharePublicOption[];
  frozenAt: string;
}

/** Safe employee-facing history row; token hashes and frozen payloads are never returned. */
export interface CustomerShareHistoryItem {
  shareId: string;
  quoteGroupId: string;
  version: number;
  status: CustomerShareStatus;
  createdByName: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  lastViewedAt?: string;
  firstViewedAt?: string;
  viewCount: number;
  pdfGeneratedCount?: number;
  whatsappPreparedCount?: number;
  emailPreparedCount?: number;
  lastPdfGeneratedAt?: string;
  lastWhatsappPreparedAt?: string;
  lastEmailPreparedAt?: string;
}

export interface CustomerShareCreateResult {
  share: CustomerShareHistoryItem;
  /** Returned only once at creation; share history never returns it. */
  publicPath: string;
}

export type CustomerDeliveryChannel = 'WHATSAPP' | 'EMAIL';

/** Employee-facing prepared delivery data. It contains no internal economics. */
export interface CustomerDeliveryPreparation {
  shareId: string;
  quoteGroupId: string;
  version: number;
  channel: CustomerDeliveryChannel;
  preparedAt: string;
  customerLink: string;
  recipient?: string;
  subject?: string;
  body: string;
  recipientAvailable: boolean;
}

export interface CustomerSharePdfDownload {
  blob: Blob;
  filename: string;
}
