export type UserRole =
  | 'Founder'
  | 'Admin'
  | 'Sales Manager'
  | 'Sales Executive'
  | 'Marketing'
  | 'Operations'
  | 'Accounts';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  department: string;
  avatarUrl?: string;
  active: boolean;
  createdAt: string;
  lastLogin: string;
}

export interface RolePermissions {
  role: UserRole;
  description: string;
  canViewAllSales: boolean;
  canManageLeads: boolean;
  canSendQuotes: boolean;
  canManageMarketing: boolean;
  canViewFinancials: boolean;
  canManageOperations: boolean;
  canManageUsers: boolean;
  canAccessAiCommand: boolean;
  canApproveActions: boolean;
  canViewAuditLogs: boolean;
  canManageSettings: boolean;
  canManageTrips: boolean;
  canManageBookings: boolean;
  canViewMargins: boolean;
  canManageAccommodation: boolean;
  canViewSupplierRates: boolean;
  canManageNegotiatedRates: boolean;
  leadAccessScope: 'ALL' | 'ASSIGNED_ONLY' | 'NONE';
}

export type CustomerType = 'B2C' | 'B2B';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  whatsApp?: string;
  email: string;
  city: string;
  customerType: CustomerType;
  preferences: string[];
  notes: string;
  totalBookings: number;
  lifetimeValue: number;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export type CompanyStatus = 'PROSPECT' | 'CONTACTED' | 'QUALIFIED' | 'ACTIVE' | 'DORMANT' | 'LOST';

export interface Company {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  city: string;
  agencyType: string;
  status: CompanyStatus;
  assignedEmployee?: string;
  notes?: string;
  totalBookings: number;
  totalRevenue: number;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export type DestinationRegion =
  | 'Kashmir'
  | 'Jammu'
  | 'Ladakh'
  | 'Himachal'
  | 'Kerala'
  | 'Goa'
  | 'Golden Triangle'
  | 'General'
  | 'Other Domestic';

export type TripType =
  | 'Honeymoon'
  | 'Family Vacation'
  | 'Adventure & Trekking'
  | 'Luxury Houseboat & Resort'
  | 'Corporate Group'
  | 'Pilgrimage'
  | 'Custom Private Tour';

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'QUOTE_SENT'
  | 'NEGOTIATION'
  | 'BOOKED'
  | 'LOST'
  | 'NURTURE';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Lead {
  id: string;
  customerId: string;
  companyId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  source: string;
  sourcePlatform: 'Meta Ads' | 'Google Ads' | 'Instagram Direct' | 'WhatsApp Inbound' | 'Website Form' | 'Referral' | 'Direct Call' | string;
  campaignId?: string;
  adId?: string;
  contentId?: string;
  destination: DestinationRegion;
  travelStartDate: string;
  travelEndDate: string;
  travelerCount: number;
  tripType: TripType;
  budget: number;
  hotelPreference?: string;
  transportPreference?: string;
  status: LeadStatus;
  leadScore: number;
  bookingProbability?: number;
  assignedEmployeeId: string;
  assignedEmployeeName: string;
  assignedManagerId?: string;
  priority: Priority;
  lastContactAt: string;
  nextFollowUpAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
  scoreReasoning?: string;
  keyInterests?: string[];
}

export interface LeadEvent {
  id: string;
  leadId: string;
  actorType: 'HUMAN' | 'AI' | 'SYSTEM';
  actorId: string;
  actorName: string;
  eventType: 'STATUS_CHANGE' | 'NOTE_ADDED' | 'FOLLOWUP_SCHEDULED' | 'AI_ANALYSIS' | 'QUOTE_CREATED' | 'ASSIGNMENT';
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export type MessageSenderType = 'CUSTOMER' | 'EMPLOYEE' | 'AI' | 'SYSTEM';

export interface Message {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  aiGenerated?: boolean;
  aiApproved?: boolean;
  metadata?: {
    intent?: string;
    sentiment?: 'positive' | 'neutral' | 'negative' | 'hesitant';
    suggestedAction?: string;
  };
}

export interface Conversation {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  leadId?: string;
  channel: 'WhatsApp' | 'Instagram' | 'Facebook' | 'Email' | 'Website Chat' | 'Phone Log';
  assignedEmployeeId: string;
  assignedEmployeeName: string;
  status: 'ACTIVE' | 'PENDING' | 'RESOLVED';
  unreadCount: number;
  lastMessage: string;
  lastMessageTimestamp: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export type TaskSource = 'HUMAN' | 'AI' | 'SYSTEM';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'PENDING';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo?: string;
  assignedToId?: string;
  assignedToName: string;
  createdBy?: string;
  createdByName?: string;
  relatedLeadId?: string;
  relatedCustomerId?: string;
  priority: Priority;
  status: TaskStatus;
  dueAt: string;
  source: TaskSource;
  createdAt: string;
  completedAt?: string;
  aiReasoning?: string;
  isDemo?: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'ALERT' | 'APPROVAL' | 'SUCCESS';
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface TravelPackage {
  id: string;
  title: string;
  destination: DestinationRegion;
  durationDays: number;
  durationNights: number;
  basePrice: number;
  featuredImage?: string;
  highlights: string[];
  inclusions: string[];
  itinerary: { day: number; title: string; description: string }[];
}

export interface QuoteVersion {
  version: number;
  updatedAt: string;
  updatedBy?: string;
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  notes?: string;
  inclusions?: string[];
  exclusions?: string[];
  termsAndConditions?: string;
}

export type QuoteStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface QuoteHotelItem {
  id?: string;
  hotelId?: string;
  hotelName: string;
  roomType: string;
  mealPlan: string;
  checkInDate?: string;
  nights: number;
  rate?: number; // Optional component-level selling price
  supplierCost?: number; // Should be stripped from customer preview
}

export interface QuoteTransportItem {
  id?: string;
  transportId?: string;
  vehicleType: string;
  route: string;
  days: number;
  rate: number;
  supplierCost?: number;
}

export interface QuoteActivityItem {
  id?: string;
  activityId?: string;
  name: string;
  pax: number;
  rate: number;
  supplierCost?: number;
}

export interface Quote {
  id: string;
  leadId: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  destination: DestinationRegion | string;
  tripId?: string;
  items?: any[];
  hotels?: QuoteHotelItem[];
  transports?: QuoteTransportItem[];
  activities?: QuoteActivityItem[];
  travelerCount: number;
  adults?: number;
  children?: number;
  packageId?: string;
  packageName?: string;
  durationDays?: number;
  durationNights?: number;
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  // Role-gated financials
  totalCost?: number;
  grossProfit?: number;
  grossMargin?: number;
  status: QuoteStatus;
  validUntil: string;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
  internalNotes?: string;
  inclusions?: string[];
  exclusions?: string[];
  termsAndConditions?: string;
  salesEmployeeId?: string;
  salesEmployeeName?: string;
  version: number;
  versionHistory?: QuoteVersion[];
  isDemo?: boolean;
}

export type BookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'IN_OPERATIONS' | 'TRAVELLING' | 'COMPLETED' | 'CANCELLED';

export interface Booking {
  id: string;
  tripId: string;
  customerId: string;
  leadId?: string;
  quoteId?: string;
  bookingReference: string;
  status: BookingStatus;
  totalAmount: number;
  amountReceived: number;
  amountPending: number;
  travelStartDate: string;
  travelEndDate: string;
  assignedSalesEmployeeId?: string;
  assignedOperationsEmployeeId?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export type TripStatus =
  | 'DRAFT'
  | 'ITINERARY_READY'
  | 'QUOTE_READY'
  | 'QUOTE_SENT'
  | 'ACCEPTED'
  | 'BOOKED'
  | 'IN_OPERATIONS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Trip {
  id: string;
  customerId: string;
  leadId?: string;
  title: string;
  destination: DestinationRegion | string;
  startDate: string;
  endDate: string;
  travelerCount: number;
  adults: number;
  children: number;
  tripType: TripType | string;
  status: TripStatus;
  currency: string;
  totalCost: number;
  totalSellingPrice: number;
  grossProfit: number;
  grossMargin: number;
  budget?: number;
  assignedSalesEmployeeId?: string;
  assignedOperationsEmployeeId?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export type ItineraryItemType = 'HOTEL' | 'TRANSPORT' | 'ACTIVITY' | 'MEAL' | 'SIGHTSEEING' | 'TRANSFER' | 'FREE_TIME' | 'OTHER';

export interface ItineraryItem {
  id: string;
  dayId: string;
  tripId?: string;
  type: ItineraryItemType;
  title: string;
  description: string;
  startTime?: string;
  endTime?: string;
  referenceId?: string;
  supplierCost?: number;
  sellingPrice?: number;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface ItineraryDay {
  id: string;
  tripId: string;
  dayNumber: number;
  date: string;
  title: string;
  description: string;
  location: string;
  notes?: string;
  items: ItineraryItem[];
}

export interface Hotel {
  id: string;
  name: string;
  destination: string;
  category: string;
  address: string;
  contact: string;
  supplierId: string;
  description: string;
  amenities: string[];
  active: boolean;
  isDemo?: boolean;
}

export interface HotelRoom {
  id: string;
  hotelId: string;
  roomType: string;
  mealPlan: string;
  season?: string;
  supplierCost: number;
  sellingPrice: number;
  currency: string;
  validFrom?: string;
  validTo?: string;
}

export type BookingComponentStatus = 'DRAFT' | 'REQUESTED' | 'CONFIRMED' | 'CANCELLED';

export interface HotelBooking {
  id: string;
  tripId: string;
  hotelId: string;
  supplierId: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  mealPlan: string;
  rooms: number;
  guests: number;
  supplierCost: number;
  sellingPrice: number;
  profit: number;
  status: BookingComponentStatus;
  confirmationNumber?: string;
  specialRequests?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Transport {
  id: string;
  tripId: string;
  date: string;
  pickup: string;
  dropoff: string;
  vehicleType: string;
  supplierId: string;
  driverId?: string;
  supplierCost: number;
  sellingPrice: number;
  profit: number;
  status: BookingComponentStatus;
  notes?: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  vehicleNumber: string;
  supplierId: string;
  active: boolean;
  notes?: string;
  isDemo?: boolean;
}

export interface Activity {
  id: string;
  name: string;
  destination: string;
  supplierId: string;
  description: string;
  supplierCost: number;
  sellingPrice: number;
  active: boolean;
  isDemo?: boolean;
}

export interface ActivityBooking {
  id: string;
  tripId: string;
  activityId: string;
  date: string;
  participants: number;
  supplierCost: number;
  sellingPrice: number;
  profit?: number;
  status: BookingComponentStatus;
  confirmationNumber?: string;
  notes?: string;
}

export type SupplierType = 'HOTEL' | 'TRANSPORT' | 'ACTIVITY' | 'OTHER';

export interface Supplier {
  id: string;
  name: string;
  type: SupplierType;
  contactPerson: string;
  phone: string;
  email: string;
  city: string;
  paymentTerms: string;
  active: boolean;
  notes?: string;
  isDemo?: boolean;
}

export type VoucherType = 'HOTEL' | 'TRANSPORT' | 'ACTIVITY' | 'FINAL_TRAVEL_PACK';
export type VoucherStatus = 'PENDING' | 'GENERATED' | 'SENT';

export interface Voucher {
  id: string;
  bookingId: string;
  tripId: string;
  type: VoucherType;
  status: VoucherStatus;
  generatedAt?: string;
  fileUrl?: string;
  isDemo?: boolean;
}

export type AiCategory =
  | 'SALES'
  | 'MARKETING'
  | 'CUSTOMER'
  | 'OPERATIONS'
  | 'FINANCE'
  | 'GENERAL';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AiRecommendation {
  id: string;
  category: AiCategory;
  title: string;
  description: string;
  priority: Priority;
  relatedEntityType?: 'LEAD' | 'CAMPAIGN' | 'CUSTOMER' | 'QUOTE' | 'OPERATION';
  relatedEntityId?: string;
  recommendedAction: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  status: 'PENDING' | 'ACCEPTED' | 'DISMISSED' | 'EXECUTED';
  confidenceScore: number;
  createdAt: string;
  isDemo?: boolean;
}

export type AiActionStatus =
  | 'PROPOSED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED';

export interface AiAction {
  id: string;
  agent: string;
  actionType: string;
  targetType: string;
  targetId: string;
  parameters: Record<string, any>;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  executedAt?: string;
  result?: string;
  status: AiActionStatus;
  reasoning: string;
  createdAt: string;
  isDemo?: boolean;
}

export interface ApprovalItem {
  id: string;
  actionId?: string;
  title?: string;
  category?: string;
  summary: string;
  aiReasoning?: string;
  reason?: string;
  riskLevel?: RiskLevel;
  impactLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  actionType?: string;
  proposedData?: Record<string, any>;
  details?: Record<string, any>;
  originalData?: Record<string, any>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedBy: string;
  requiresRole?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  feedback?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorType: 'HUMAN' | 'AI' | 'SYSTEM';
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  reason?: string;
  approvalId?: string;
}

export interface Integration {
  id: string;
  name: string;
  category: 'ADVERTISING' | 'MESSAGING' | 'CREATIVE' | 'PAYMENTS' | 'COMMUNICATION' | 'PRODUCTIVITY';
  status: 'CONNECTED' | 'NOT_CONNECTED' | 'REQUIRES_AUTH' | 'CONFIGURATION_REQUIRED';
  description: string;
  iconName: string;
  apiDocsUrl?: string;
  lastSync?: string;
  features: string[];
}

export interface AiObjectionAnalysis {
  objectionType: string;
  underlyingConcern: string;
  customerSentiment: 'positive' | 'neutral' | 'negative' | 'hesitant';
  recommendedStrategy: string;
  suggestedResponse: string;
}

export interface AiSalesPlaybookStep {
  step: number;
  action: string;
  description: string;
}

export interface SalesAiAnalysisResult {
  summary: string;
  intent: string;
  objections: string[];
  priceSensitivity: string;
  urgency: string;
  leadScore: number;
  bookingProbability: number;
  recommendedAction: string;
  followUpAt: string;
  salesApproach: string;
  suggestedReply: string;
  playbook?: AiSalesPlaybookStep[];
  objectionAnalysis?: AiObjectionAnalysis;
}

export interface MarketingAiStrategyResult {
  objective: string;
  audience: string;
  campaignIdea: string;
  contentPillars: string[];
  contentIdeas: { title: string; angle: string; format: string; hook: string }[];
  recommendedFormats: string[];
  recommendedCTA: string;
  KPIs: string[];
}

export interface ContentItem {
  id: string;
  title: string;
  channel: 'Instagram' | 'Facebook' | 'Meta Ads' | 'Email' | 'YouTube' | 'Blog';
  contentType: 'Reel' | 'Carousel' | 'Static Post' | 'Ad Copy' | 'Newsletter' | 'Story';
  destination: string;
  caption: string;
  visualPrompt?: string;
  hashtags: string[];
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  scheduledFor: string;
  generatedBy: 'AI' | 'HUMAN';
  createdAt?: string;
}

export interface MarketingPillar {
  id: string;
  pillarName: string;
  destination: string;
  theme: string;
  targetAudience: string;
  primaryChannel: string;
  sampleHooks: string[];
}

export interface AdCampaign {
  id: string;
  name: string;
  platform: 'Meta Ads' | 'Google Ads' | 'Instagram Sponsored';
  targetDestination: string;
  objective: string;
  budget: number;
  spent: number;
  leadsGenerated: number;
  bookingsCount: number;
  revenueGenerated: number;
  roas: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  startDate: string;
  endDate?: string;
}

export interface AiAgentConfig {
  id: string;
  name: string;
  purpose: string;
  autonomyLevel: 'SUGGEST_ONLY' | 'ASSISTED' | 'SEMI_AUTONOMOUS' | 'FULL_AUTONOMOUS';
  permittedTools: string[];
  requiresHumanApproval: boolean;
  status: 'ACTIVE' | 'STANDBY' | 'MAINTENANCE';
}

export interface MarketingAiGenerateResult {
  campaignTitle: string;
  targetAudienceRecommendation: string;
  videoHooks: string[];
  adCopies: string[];
  instagramCaptions: string[];
  visualPrompts: string[];
}

// Re-export all accommodation inventory & rate management types
export type {
  PropertyType,
  PropertyStatus,
  MealPlanType,
  SupplementType,
  TaxTreatment,
  RateContractType,
  AvailabilityStatusType,
  ConfirmationStatus,
  PropertyPhotoCategory,
  RoomPhotoCategory,
  PropertyPhoto,
  AccommodationProperty,
  RoomCategory,
  RateSupplement,
  RatePeriod,
  NegotiatedRate,
  RateHistoryEntry,
  OccupancyValidation,
  RateCalculationResult,
  RateCalculationRequest,
} from './accommodation';

export {
  MEAL_PLAN_LABELS,
  SUPPLEMENT_LABELS,
  TAX_TREATMENT_LABELS,
} from './accommodation';
