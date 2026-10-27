import React, { createContext, useContext, useState, useEffect } from 'react';
import { APP_CONFIG } from '../config';
import { buildMarketingCreativeDraft } from '../services/marketing/marketingTruthfulness';
import { assertDemoControlsAllowed } from '../services/demoModeGuard';
import { readApiPages } from '../services/auth/readApiPages';
import { inventoryApi } from '../services/inventory/inventoryApi';
import { authenticatedMutationHeaders, authenticatedReadHeaders } from '../services/auth/authenticatedApi';
import { calculateMixedAllocatedStayTotal, distributeGuestsAcrossRooms } from '../services/accommodationEngine';
import { calculateTransportCost } from '../services/transportEngine';
import { calculateActivityCost } from '../services/activityEngine';
import { buildCustomerPackageProjection } from '../services/quote/customerPackage';
import { buildCustomerSharePublicView } from '../services/quote/customerShareProjection';
import {
  demoShareHistory,
  effectiveDemoShareStatus,
  generateDemoShareToken,
  hashDemoShareToken,
  readDemoCustomerShares,
  writeDemoCustomerShares,
  type DemoCustomerShareRecord,
} from '../services/quote/customerShareDemo';
import { buildCustomerDeliveryPreparation } from '../services/quote/customerShareDelivery';
import { BOOKING_BRIDGE_POLICY_VERSION } from '../policies/bookingBridgePolicy';
import { buildCustomerSharePdf, customerSharePdfFilename } from '../services/quote/customerSharePdf';
import {
  composeDetailedCustomerItinerary,
  itineraryContentFingerprint,
  itineraryItemAffectsCustomerContent,
} from '../services/itinerary/customerItinerary';
import {
  Lead,
  Customer,
  Company,
  Task,
  Conversation,
  Message,
  Quote,
  QuoteBackupAccommodation,
  Booking,
  AiRecommendation,
  AiAction,
  ApprovalItem,
  AuditLog,
  TravelPackage,
  Integration,
  LeadStatus,
  CreateLeadInput,
  SalesAiAnalysisResult,
  MarketingAiStrategyResult,
  MarketingAiCreativeBrief,
  ContentItem,
  MarketingPillar,
  AdCampaign,
  AiAgentConfig,
  MarketingAiGenerateResult,
  Trip,
  ItineraryDay,
  ItineraryItem,
  Hotel,
  HotelRoom,
  HotelBooking,
  Transport,
  Driver,
  Activity,
  ActivityBooking,
  Supplier,
  Voucher,
  AccommodationProperty,
  RoomCategory,
  RatePeriod,
  NegotiatedRate,
  RateHistoryEntry,
  PropertyPhoto,
  RateCalculationResult,
  RateCalculationRequest,
  VehicleCategory,
  Destination,
  TransportRoute,
  TransportRatePeriod,
  TransportSupplement,
  ActivityMaster,
  ActivityRatePeriod,
  CustomerPackageDocument,
  CustomerDeliveryChannel,
  CustomerDeliveryPreparation,
  CustomerQuoteComparison,
  CustomerShareCreateResult,
  CustomerShareExpiryDays,
  CustomerShareHistoryItem,
  CustomerSharePdfDownload,
  QuoteShareChannel,
  QuoteShareResult,
  LeadInteractionInput,
  ConversationEntryCreateInput,
  ConversationEntryCreateResult,
  ConversationTimelineEntry,
  ConversationTimelinePage,
  UnresolvedWhatsAppMessage,
  WhatsAppConversationContext,
  WhatsAppSendInput,
  WhatsAppSendResult
} from '../types';
import { getLeadById, recordLeadInteraction as recordLeadInteractionApi } from '../services/leads/leadFollowUpApi';
import {
  createLeadConversationEntry,
  getLeadConversationTimeline,
  getLeadWhatsAppContext,
  linkUnresolvedWhatsApp as linkUnresolvedWhatsAppApi,
  listUnresolvedWhatsApp as listUnresolvedWhatsAppApi,
  retryLeadWhatsAppMessage,
  sendLeadWhatsAppMessage,
} from '../services/leads/conversationTimelineApi';
import { isTripCostingFresh } from '../utils/costingFreshness';
import {
  assessLowMarginPolicy,
  buildPackageSupplierCostBreakdown,
  calculatePackageEconomics,
  type PackageCostEntry,
} from '../utils/packageCommercials';
import {
  INITIAL_PACKAGES,
  DEMO_CUSTOMERS,
  DEMO_COMPANIES,
  DEMO_LEADS,
  DEMO_CONVERSATIONS,
  DEMO_MESSAGES,
  DEMO_TASKS,
  DEMO_QUOTES,
  DEMO_BOOKINGS,
  DEMO_RECOMMENDATIONS,
  DEMO_ACTIONS,
  DEMO_APPROVALS,
  DEMO_AUDIT_LOGS,
  SYSTEM_INTEGRATIONS,
  DEMO_CONTENT_CALENDAR,
  DEMO_PILLARS,
  DEMO_CAMPAIGNS,
  DEMO_AI_AGENTS,
  DEMO_TRIPS,
  DEMO_ITINERARIES,
  DEMO_HOTELS,
  DEMO_HOTEL_ROOMS,
  DEMO_HOTEL_BOOKINGS,
  DEMO_TRANSPORTS,
  DEMO_DRIVERS,
  DEMO_ACTIVITIES,
  DEMO_ACTIVITY_BOOKINGS,
  DEMO_SUPPLIERS,
  DEMO_VOUCHERS
} from '../services/demoData';
import {
  DEMO_ACCOMMODATION_PROPERTIES,
  DEMO_ROOM_CATEGORIES,
  DEMO_RATE_PERIODS
} from '../services/accommodationDemoData';
import {
  DEMO_VEHICLE_CATEGORIES,
  DEMO_DESTINATIONS,
  DEMO_TRANSPORT_ROUTES,
  DEMO_TRANSPORT_RATE_PERIODS,
  DEMO_TRANSPORT_SUPPLEMENTS
} from '../services/transportDemoData';
import {
  DEMO_ACTIVITY_MASTERS,
  DEMO_ACTIVITY_RATE_PERIODS
} from '../services/activityDemoData';
import { useAuth } from './AuthContext';
import { db } from '../lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

type QuoteDraftInput = Partial<Quote> & Pick<Quote, 'leadId' | 'customerId' | 'customerName' | 'destination' | 'validUntil'> & {
  basePrice?: number;
  discount?: number;
};

type TripDraftInput = Omit<Trip, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'grossProfit' | 'grossMargin' | 'totalSupplierCost' | 'totalSellingPrice'> & {
  budget?: number;
  totalSupplierCost?: number;
  totalSellingPrice?: number;
};
type TripUpdateInput = Partial<Trip> & { expectedCostingRevision?: number };

const TRIP_WRITE_FIELDS = [
  'customerId', 'leadId', 'title', 'destination', 'startDate', 'endDate',
  'travelerCount', 'adults', 'children', 'tripType', 'currency', 'budget',
  'childAges', 'pricingMode', 'pricingInput', 'expectedCostingRevision',
] as const;

function buildTripWritePayload(sourceValue: TripDraftInput | Partial<Trip>, isCreate: boolean): Record<string, unknown> {
  const source = sourceValue as Record<string, any>;
  const payload: Record<string, unknown> = {};
  for (const field of TRIP_WRITE_FIELDS) {
    if (source[field] !== undefined) payload[field] = source[field];
  }
  const sellingPrice = source.totalSellingPrice ?? source.budget;
  if (sellingPrice !== undefined) payload.totalSellingPrice = sellingPrice;
  else if (isCreate) payload.totalSellingPrice = 0;
  if (isCreate && payload.currency === undefined) payload.currency = 'INR';
  return payload;
}

const TRIP_COSTING_INPUT_FIELDS = new Set([
  'customerId', 'leadId', 'title', 'destination', 'startDate', 'endDate',
  'travelerCount', 'adults', 'children', 'childAges', 'tripType', 'currency',
]);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value === undefined ? null : value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map(key => [key, stableValue(record[key])]));
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function withoutUndefinedValues<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => withoutUndefinedValues(item)) as T;
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, withoutUndefinedValues(entry)]),
  ) as T;
}

function mirrorDemoItineraryDay(day: ItineraryDay): void {
  if (!db || !APP_CONFIG.DEMO_MODE) return;
  try {
    void setDoc(doc(db, 'itinerary_days', day.id), withoutUndefinedValues(day))
      .catch(err => console.warn('Firestore demo itinerary mirror notice:', err));
  } catch (err) {
    console.warn('Firestore demo itinerary mirror notice:', err);
  }
}

function deleteDemoItineraryDayMirror(dayId: string): void {
  if (!db || !APP_CONFIG.DEMO_MODE) return;
  try {
    void deleteDoc(doc(db, 'itinerary_days', dayId))
      .catch(err => console.warn('Firestore demo itinerary delete notice:', err));
  } catch (err) {
    console.warn('Firestore demo itinerary delete notice:', err);
  }
}

function itineraryCommercialValue(item: Partial<ItineraryItem>): Record<string, unknown> {
  const metadata = item.metadata && typeof item.metadata === 'object'
    ? { ...(item.metadata as Record<string, unknown>) }
    : item.metadata;
  if (metadata && typeof metadata === 'object' && 'packageSupplierRate' in metadata) {
    const rate = metadata.packageSupplierRate as Record<string, unknown> | undefined;
    metadata.packageSupplierRate = rate ? {
      entryMode: rate.entryMode,
      amount: rate.amount,
      childAmount: rate.childAmount ?? null,
      taxTreatment: rate.taxTreatment,
    } : rate;
  }
  if (item.type === 'TRANSPORT' && metadata && typeof metadata === 'object') {
    const serviceDays = Array.isArray(metadata.serviceDays) ? metadata.serviceDays : [];
    return {
      type: item.type, inventoryId: item.inventoryId, sellingPrice: item.sellingPrice,
      metadata: {
        vehicleCategoryId: metadata.vehicleCategoryId, rateId: metadata.rateId,
        serviceType: metadata.serviceType, pricingUnit: metadata.pricingUnit,
        startDate: metadata.startDate, vehicleCount: metadata.vehicleCount,
        chargeableDays: metadata.chargeableDays, nightHalts: metadata.nightHalts,
        occurrences: metadata.occurrences, distanceKm: metadata.distanceKm, hours: metadata.hours,
        packageSupplierRate: metadata.packageSupplierRate,
        serviceDays: serviceDays.map(value => { const day = value as Record<string, unknown>; return { dayNumber: day.dayNumber, date: day.date, serviceType: day.serviceType, chargeableTransportDay: day.chargeableTransportDay }; }),
      },
    };
  }
  if (item.type === 'ACTIVITY' && metadata && typeof metadata === 'object') {
    return {
      type: item.type, inventoryId: item.inventoryId, sellingPrice: item.sellingPrice,
      metadata: {
        activityId: metadata.activityId, rateId: metadata.rateId, pricingModel: metadata.pricingModel,
        date: metadata.date, adults: metadata.adults, children: metadata.children, infants: metadata.infants,
        vehicles: metadata.vehicles, groups: metadata.groups, tickets: metadata.tickets,
        hours: metadata.hours, days: metadata.days, sessions: metadata.sessions, units: metadata.units,
        inclusionStatus: metadata.inclusionStatus, packageSupplierRate: metadata.packageSupplierRate,
      },
    };
  }
  return {
    type: item.type, title: item.title, description: item.description,
    startTime: item.startTime, endTime: item.endTime,
    referenceId: item.referenceId, inventoryId: item.inventoryId,
    sellingPrice: item.sellingPrice, metadata,
  };
}

const QUOTE_WRITE_FIELDS = [
  'leadId', 'customerId', 'customerName', 'customerPhone', 'customerEmail',
  'destination', 'tripId', 'hotels', 'transports', 'activities', 'travelerCount',
  'adults', 'children', 'packageId', 'packageName', 'durationDays', 'durationNights',
  'validUntil', 'notes', 'internalNotes', 'inclusions', 'exclusions', 'termsAndConditions',
  'paymentSchedule',
  'backupAccommodations',
  'optionLabel', 'customerTitle',
] as const;

const QUOTE_ITEM_FINANCIAL_FIELDS = new Set([
  'supplierCost', 'totalSupplierCost', 'grossProfit', 'grossMargin', 'profit', 'quotedRate',
]);

function stripQuoteItemFinancials(items: unknown): unknown {
  if (!Array.isArray(items)) return items;
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>)
        .filter(([key]) => !QUOTE_ITEM_FINANCIAL_FIELDS.has(key)),
    );
  });
}

function projectBackupAccommodationSelections(items: unknown): unknown {
  if (!Array.isArray(items)) return items;
  return items.map(item => {
    const value = item as Record<string, unknown>;
    return {
      sourceTripItemId: value.sourceTripItemId,
      propertyId: value.propertyId,
      roomCategoryId: value.roomCategoryId,
      ratePeriodId: value.ratePeriodId,
      mealPlan: value.mealPlan,
    };
  });
}

function buildQuoteWritePayload(sourceValue: QuoteDraftInput | Partial<Quote>, includeStatus: boolean): Record<string, unknown> {
  const source = sourceValue as Record<string, any>;
  const payload: Record<string, unknown> = {};
  for (const field of QUOTE_WRITE_FIELDS) {
    if (source[field] !== undefined) {
      payload[field] = field === 'backupAccommodations'
        ? projectBackupAccommodationSelections(source[field])
        : ['hotels', 'transports', 'activities'].includes(field)
          ? stripQuoteItemFinancials(source[field])
          : source[field];
    }
  }

  const totalAmount = source.totalAmount ?? source.basePrice;
  const discountAmount = source.discountAmount ?? source.discount;
  if (totalAmount !== undefined) payload.totalAmount = totalAmount;
  else if (!includeStatus) payload.totalAmount = 0;
  if (discountAmount !== undefined) payload.discountAmount = discountAmount;
  else if (!includeStatus) payload.discountAmount = 0;
  if (!includeStatus && payload.travelerCount === undefined) payload.travelerCount = source.adults ?? 1;
  if (includeStatus && source.status !== undefined) payload.status = source.status;
  if (payload.packageId === 'custom-package') delete payload.packageId;
  return payload;
}

async function readApiResponse(response: Response): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `BBOS API request failed with status ${response.status}`);
    (error as any).code = body.code;
    throw error;
  }
  return body;
}

interface DataContextType {
  leads: Lead[];
  customers: Customer[];
  companies: Company[];
  tasks: Task[];
  conversations: Conversation[];
  messages: Message[];
  quotes: Quote[];
  bookings: Booking[];
  packages: TravelPackage[];
  recommendations: AiRecommendation[];
  aiActions: AiAction[];
  approvals: ApprovalItem[];
  auditLogs: AuditLog[];
  integrations: Integration[];
  contentCalendar: ContentItem[];
  marketingPillars: MarketingPillar[];
  campaigns: AdCampaign[];
  aiAgents: AiAgentConfig[];

  trips: Trip[];
  itineraryDays: ItineraryDay[];
  hotels: Hotel[];
  hotelRooms: HotelRoom[];
  transports: Transport[];
  drivers: Driver[];
  activities: Activity[];
  suppliers: Supplier[];
  vouchers: Voucher[];

  // Accommodation Inventory
  accommodationProperties: AccommodationProperty[];
  roomCategories: RoomCategory[];
  ratePeriods: RatePeriod[];
  negotiatedRates: NegotiatedRate[];

  // Transport & Activity Inventory (Phase 2B-4)
  vehicleCategories: VehicleCategory[];
  destinations: Destination[];
  transportRoutes: TransportRoute[];
  transportRatePeriods: TransportRatePeriod[];
  transportSupplements: TransportSupplement[];
  activityMasters: ActivityMaster[];
  activityRatePeriods: ActivityRatePeriod[];

  // Transport & Activity Actions
  addTransportRatePeriod: (rate: Omit<TransportRatePeriod, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TransportRatePeriod>;
  updateTransportRatePeriod: (id: string, updates: Partial<TransportRatePeriod>) => Promise<void>;
  deleteTransportRatePeriod: (id: string) => Promise<void>;
  
  addTransportSupplement: (supp: Omit<TransportSupplement, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TransportSupplement>;
  updateTransportSupplement: (id: string, updates: Partial<TransportSupplement>) => Promise<void>;
  deleteTransportSupplement: (id: string) => Promise<void>;
  
  addActivityMaster: (master: Omit<ActivityMaster, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ActivityMaster>;
  updateActivityMaster: (id: string, updates: Partial<ActivityMaster>) => Promise<void>;
  deleteActivityMaster: (id: string) => Promise<void>;
  
  addActivityRatePeriod: (rate: Omit<ActivityRatePeriod, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ActivityRatePeriod>;
  updateActivityRatePeriod: (id: string, updates: Partial<ActivityRatePeriod>) => Promise<void>;
  deleteActivityRatePeriod: (id: string) => Promise<void>;

  // Accommodation Property Actions
  addAccommodationProperty: (property: Omit<AccommodationProperty, 'id' | 'createdAt' | 'updatedAt'>) => Promise<AccommodationProperty>;
  updateAccommodationProperty: (id: string, updates: Partial<AccommodationProperty>) => Promise<void>;

  // Trip & Itinerary actions
  createTrip: (tripData: TripDraftInput, initialDaysCount?: number, fromPackageId?: string) => Promise<Trip>;
  createOrResumeLeadTrip: (leadId: string, persistedLead?: Lead) => Promise<Trip>;
  updateTrip: (id: string, updates: TripUpdateInput) => Promise<void>;
  addItineraryDay: (tripId: string, dayData?: Partial<ItineraryDay>) => Promise<ItineraryDay>;
  updateItineraryDay: (id: string, updates: Partial<ItineraryDay>) => Promise<void>;
  composeItineraryDayCustomerContent: (id: string, confirmReplace?: boolean) => Promise<ItineraryDay>;
  reviewItineraryDayCustomerContent: (id: string) => Promise<ItineraryDay>;
  deleteItineraryDay: (id: string) => Promise<void>;
  addItineraryItem: (dayId: string, item: Omit<ItineraryItem, 'id' | 'dayId'>) => Promise<ItineraryItem>;
  updateItineraryItem: (dayId: string, itemId: string, item: Omit<ItineraryItem, 'id' | 'dayId' | 'tripId' | 'supplierCost'>) => Promise<ItineraryItem>;
  deleteItineraryItem: (dayId: string, itemId: string) => Promise<void>;
  loadTripItinerary: (tripId: string) => Promise<ItineraryDay[]>;
  recalculateTripCost: (tripId: string) => Promise<void>;
  reconcileLeadTrip: (tripId: string) => Promise<Trip>;

  // Lead actions
  createLead: (lead: CreateLeadInput) => Promise<Lead>;
  updateLead: (id: string, updates: Partial<Lead>) => Promise<Lead>;
  updateLeadStatus: (id: string, status: LeadStatus) => Promise<void>;
  addLeadNote: (id: string, note: string) => Promise<void>;
  assignLead: (id: string, employeeId: string, employeeName?: string, note?: string) => Promise<void>;
  loadLead: (id: string) => Promise<Lead>;
  recordLeadInteraction: (id: string, input: Omit<LeadInteractionInput, 'expectedUpdatedAt'> & { expectedUpdatedAt?: string }) => Promise<Lead>;
  loadLeadConversation: (id: string, options?: { limit?: number; cursor?: string }) => Promise<ConversationTimelinePage>;
  addLeadConversationEntry: (id: string, input: ConversationEntryCreateInput) => Promise<ConversationEntryCreateResult>;
  loadLeadWhatsAppContext: (id: string) => Promise<WhatsAppConversationContext>;
  sendLeadWhatsApp: (id: string, input: WhatsAppSendInput) => Promise<WhatsAppSendResult>;
  retryLeadWhatsApp: (id: string, entryId: string, idempotencyKey: string) => Promise<WhatsAppSendResult>;
  listUnresolvedWhatsApp: () => Promise<UnresolvedWhatsAppMessage[]>;
  linkUnresolvedWhatsApp: (unresolvedId: string, leadId: string) => Promise<ConversationTimelineEntry>;

  // Customer actions
  createCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'totalBookings' | 'lifetimeValue'>) => Promise<Customer>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;

  // Task actions
  createTask: (task: Omit<Task, 'id' | 'createdAt'>) => Promise<Task>;
  toggleTaskStatus: (id: string) => Promise<void>;

  // Content actions
  createContentItem: (item: Omit<ContentItem, 'id' | 'createdAt'>) => Promise<ContentItem>;

  // Conversation & Messaging actions
  sendMessage: (conversationId: string, content: string, senderType?: 'EMPLOYEE' | 'CUSTOMER' | 'AI' | 'SYSTEM') => Promise<void>;

  // Quote actions
  createQuote: (quote: QuoteDraftInput) => Promise<Quote>;
  updateQuote: (id: string, updates: Partial<Quote>, createNewVersion?: boolean) => Promise<Quote>;
  convertQuoteToBooking: (quoteId: string) => Promise<Booking>;
  getQuoteBackupAccommodationOptions: (tripId: string, sourceTripItemId: string) => Promise<QuoteBackupAccommodation[]>;
  getCustomerPackage: (quoteId: string) => Promise<CustomerPackageDocument>;
  shareQuotePackage: (quoteId: string, channel: QuoteShareChannel, expectedVersion: number) => Promise<QuoteShareResult>;
  duplicateQuoteOption: (quoteId: string, input: { label: string; customerTitle?: string; totalAmount?: number; discountAmount?: number; validUntil?: string }) => Promise<Quote>;
  updateQuoteOption: (quoteId: string, input: { label?: string; customerTitle?: string; totalAmount?: number; discountAmount?: number; validUntil?: string; inclusions?: string[]; exclusions?: string[]; termsAndConditions?: string; paymentSchedule?: Quote['paymentSchedule']; backupAccommodations?: QuoteBackupAccommodation[] }) => Promise<Quote>;
  recommendQuoteOption: (quoteId: string) => Promise<Quote>;
  refreshQuoteOptionFromTrip: (quoteId: string) => Promise<Quote>;
  reorderQuoteOptions: (groupId: string, optionIds: string[]) => Promise<Quote[]>;
  getQuoteOptionComparison: (groupId: string) => Promise<CustomerQuoteComparison>;
  createCustomerShare: (groupId: string, expiresInDays: CustomerShareExpiryDays | null) => Promise<CustomerShareCreateResult>;
  listCustomerShares: (groupId: string) => Promise<CustomerShareHistoryItem[]>;
  revokeCustomerShare: (shareId: string) => Promise<CustomerShareHistoryItem>;
  downloadCustomerSharePdf: (shareId: string) => Promise<CustomerSharePdfDownload>;
  prepareCustomerShareDelivery: (shareId: string, channel: CustomerDeliveryChannel, publicUrl: string) => Promise<CustomerDeliveryPreparation>;

  // Booking actions
  createBooking: (bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt' | 'bookingReference'>) => Promise<Booking>;
  updateBooking: (id: string, updates: Partial<Booking>) => Promise<void>;

  // AI & Approvals
  approveAction: (approvalId: string, feedback?: string) => Promise<void>;
  rejectAction: (approvalId: string, feedback?: string) => Promise<void>;
  approveApproval: (approvalId: string, feedback?: string) => Promise<void>;
  rejectApproval: (approvalId: string, feedback?: string) => Promise<void>;
  submitForApproval: (item: Omit<ApprovalItem, 'id' | 'createdAt' | 'status'>) => Promise<ApprovalItem>;
  dismissRecommendation: (recId: string) => Promise<void>;
  acceptRecommendation: (recId: string) => Promise<void>;

  // AI Service Calls
  runSalesAiAnalysis: (leadId: string) => Promise<SalesAiAnalysisResult>;
  runMarketingStrategy: (destination: string, season: string, objective: string) => Promise<MarketingAiStrategyResult>;
  runMarketingAiGenerate: (params: MarketingAiCreativeBrief) => Promise<MarketingAiGenerateResult>;
  askCommandCenterAi: (question: string) => Promise<{ answer: string; suggestedActions: any[] }>;
  queryCommandCenter: (question: string) => Promise<{ answer: string; suggestedActions: any[] }>;

  // Demo state controls
  seedDemoData: () => void;
  clearDemoData: () => void;
  isLoading: boolean;
  dataLoadErrors: Partial<Record<'leads' | 'quotes' | 'bookings' | 'accommodation' | 'transport' | 'activities', string>>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [dataLoadErrors, setDataLoadErrors] = useState<DataContextType['dataLoadErrors']>({});

  // Local state with persistence cache
  const [leads, setLeads] = useState<Lead[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_leads');
    return saved ? JSON.parse(saved) : DEMO_LEADS;
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_customers');
    return saved ? JSON.parse(saved) : DEMO_CUSTOMERS;
  });

  const [companies, setCompanies] = useState<Company[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_companies');
    return saved ? JSON.parse(saved) : DEMO_COMPANIES;
  });

  const [tasks, setTasks] = useState<Task[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_tasks');
    return saved ? JSON.parse(saved) : DEMO_TASKS;
  });

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_conversations');
    return saved ? JSON.parse(saved) : DEMO_CONVERSATIONS;
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_messages');
    return saved ? JSON.parse(saved) : DEMO_MESSAGES;
  });

  const [quotes, setQuotes] = useState<Quote[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_quotes');
    return saved ? JSON.parse(saved) : DEMO_QUOTES;
  });

  const [bookings, setBookings] = useState<Booking[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_bookings');
    return saved ? JSON.parse(saved) : DEMO_BOOKINGS;
  });

  const [packages, setPackages] = useState<TravelPackage[]>(INITIAL_PACKAGES);

  const [recommendations, setRecommendations] = useState<AiRecommendation[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_recommendations');
    return saved ? JSON.parse(saved) : DEMO_RECOMMENDATIONS;
  });

  const [aiActions, setAiActions] = useState<AiAction[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_actions');
    return saved ? JSON.parse(saved) : DEMO_ACTIONS;
  });

  const [approvals, setApprovals] = useState<ApprovalItem[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_approvals');
    return saved ? JSON.parse(saved) : DEMO_APPROVALS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_audit_logs');
    return saved ? JSON.parse(saved) : DEMO_AUDIT_LOGS;
  });

  const [integrations] = useState<Integration[]>(SYSTEM_INTEGRATIONS);
  const [contentCalendar, setContentCalendar] = useState<ContentItem[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_content_calendar');
    return saved ? JSON.parse(saved) : DEMO_CONTENT_CALENDAR;
  });
  const [marketingPillars] = useState<MarketingPillar[]>(() => APP_CONFIG.DEMO_MODE ? DEMO_PILLARS : []);
  const [campaigns] = useState<AdCampaign[]>(() => APP_CONFIG.DEMO_MODE ? DEMO_CAMPAIGNS : []);
  const [aiAgents] = useState<AiAgentConfig[]>(() => APP_CONFIG.DEMO_MODE ? DEMO_AI_AGENTS : []);

  const [trips, setTrips] = useState<Trip[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_trips');
    return saved ? JSON.parse(saved) : DEMO_TRIPS;
  });

  const [itineraryDays, setItineraryDays] = useState<ItineraryDay[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_itinerary_days');
    return saved ? JSON.parse(saved) : DEMO_ITINERARIES;
  });

  const [hotelRooms] = useState<HotelRoom[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_hotel_rooms');
    return saved ? JSON.parse(saved) : DEMO_HOTEL_ROOMS;
  });

  const [hotels, setHotels] = useState<Hotel[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_hotels');
    return saved ? JSON.parse(saved) : DEMO_HOTELS;
  });

  const [transports, setTransports] = useState<Transport[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_transports');
    return saved ? JSON.parse(saved) : DEMO_TRANSPORTS;
  });

  const [drivers, setDrivers] = useState<Driver[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_drivers');
    return saved ? JSON.parse(saved) : DEMO_DRIVERS;
  });

  const [activities, setActivities] = useState<Activity[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_activities');
    return saved ? JSON.parse(saved) : DEMO_ACTIVITIES;
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_suppliers');
    return saved ? JSON.parse(saved) : DEMO_SUPPLIERS;
  });

  const [vouchers, setVouchers] = useState<Voucher[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_vouchers');
    return saved ? JSON.parse(saved) : DEMO_VOUCHERS;
  });

  const [accommodationProperties, setAccommodationProperties] = useState<AccommodationProperty[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_accommodation_properties');
    return saved ? JSON.parse(saved) : DEMO_ACCOMMODATION_PROPERTIES;
  });

  const [roomCategories, setRoomCategories] = useState<RoomCategory[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_room_categories');
    return saved ? JSON.parse(saved) : DEMO_ROOM_CATEGORIES;
  });

  const [ratePeriods, setRatePeriods] = useState<RatePeriod[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_rate_periods');
    return saved ? JSON.parse(saved) : DEMO_RATE_PERIODS;
  });

  const [negotiatedRates, setNegotiatedRates] = useState<NegotiatedRate[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const saved = localStorage.getItem('bb_negotiated_rates');
    return saved ? JSON.parse(saved) : [];
  });

  const [vehicleCategories, setVehicleCategories] = useState<VehicleCategory[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    return DEMO_VEHICLE_CATEGORIES;
  });

  const [destinations, setDestinations] = useState<Destination[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    return DEMO_DESTINATIONS;
  });

  const [transportRoutes, setTransportRoutes] = useState<TransportRoute[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    return DEMO_TRANSPORT_ROUTES;
  });

  const [transportRatePeriods, setTransportRatePeriods] = useState<TransportRatePeriod[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    return DEMO_TRANSPORT_RATE_PERIODS;
  });

  const [transportSupplements, setTransportSupplements] = useState<TransportSupplement[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    return DEMO_TRANSPORT_SUPPLEMENTS;
  });

  const [activityMasters, setActivityMasters] = useState<ActivityMaster[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    return DEMO_ACTIVITY_MASTERS;
  });

  const [activityRatePeriods, setActivityRatePeriods] = useState<ActivityRatePeriod[]>(() => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    return DEMO_ACTIVITY_RATE_PERIODS;
  });

  // Load production state through authenticated domain APIs.
  useEffect(() => {
    if (APP_CONFIG.DEMO_MODE) return;
    let disposed = false;
    const controller = new AbortController();
    
    const loadData = async () => {
      setIsLoading(true);
      try {
        const fetchApi = async (endpoint: string) => {
          const headers = await authenticatedReadHeaders(currentUser.employeeId);
          return readApiPages(endpoint, async url => {
            const res = await fetch(url, { headers, signal: controller.signal });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || `API fetch failed (${res.status})`);
            return json;
          });
        };

        const loadErrors: DataContextType['dataLoadErrors'] = {};
        const safely = async <T,>(
          promise: Promise<T>,
          domain?: keyof DataContextType['dataLoadErrors'],
        ): Promise<T | []> => {
          try {
            return await promise;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Request failed.';
            if (domain) loadErrors[domain] = message;
            else console.warn('[DATA] Non-critical data source could not be loaded:', message);
            return [];
          }
        };

        const canReadCustomers = ['Founder', 'Admin', 'Sales Manager', 'Sales Executive']
          .includes(currentUser?.role as any);
        const canReadQuotes = ['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive']
          .includes(currentUser?.role as any);
        // UX/data-loading optimization only. Firestore/API rules remain the
        // authority. Reservations needs supplier rates; Operations does not.
        const canReadRates = ['Founder', 'Admin', 'Accounts', 'Reservations'].includes(currentUser?.role as any);

        const [
          fetchedLeads, fetchedCustomers, fetchedQuotes, fetchedBookings, fetchedTrips,
          fetchedSuppliers, fetchedAccommProps, fetchedRoomCats, fetchedRatePeriods,
          fetchedVehicles, fetchedTransRates, fetchedActMasters, fetchedActRates
        ] = await Promise.all([
          safely(fetchApi('/api/leads'), 'leads'),
          safely(canReadCustomers ? fetchApi('/api/customers') : Promise.resolve([])),
          safely(canReadQuotes ? fetchApi('/api/quotes') : Promise.resolve([]), 'quotes'),
          safely(fetchApi('/api/bookings'), 'bookings'),
          safely(fetchApi('/api/trips')),
          safely(canReadRates ? Promise.all([
            fetchApi('/api/accommodation/suppliers'),
            fetchApi('/api/transport/suppliers'),
            fetchApi('/api/activities/providers')
          ]).then((groups) => groups.flat()) : Promise.resolve([])),
          safely(fetchApi('/api/accommodation/properties'), 'accommodation'), safely(fetchApi('/api/accommodation/rooms'), 'accommodation'),
          safely(canReadRates ? fetchApi('/api/accommodation/rates') : Promise.resolve([])),
          safely(fetchApi('/api/transport/vehicle-categories'), 'transport'),
          safely(canReadRates ? fetchApi('/api/transport/rates') : Promise.resolve([])),
          safely(fetchApi('/api/activities/masters'), 'activities'),
          safely(canReadRates ? fetchApi('/api/activities/rates') : Promise.resolve([]))
        ]);
        
        if (disposed) return;
        const scopedLeads = fetchedLeads as Lead[];
        const customerMap = new Map((fetchedCustomers as Customer[]).map(customer => [customer.id, customer]));
        setLeads(scopedLeads);
        setCustomers([...customerMap.values()]);
        setCompanies([]);
        setTasks(scopedLeads.filter(lead => Boolean(lead.nextFollowUpAt)).map(lead => ({
          id: `follow-up:${lead.id}`,
          title: `Follow up with ${lead.customerName}`,
          description: `${lead.destination} · ${lead.status.replaceAll('_', ' ')}`,
          assignedToId: lead.assignedEmployeeId,
          assignedToName: lead.assignedEmployeeName || 'Unassigned',
          relatedLeadId: lead.id,
          relatedCustomerId: lead.customerId,
          priority: lead.priority === 'HOT' ? 'URGENT' : lead.priority === 'WARM' ? 'HIGH' : 'MEDIUM',
          status: 'PENDING', dueAt: lead.nextFollowUpAt!, source: 'SYSTEM', createdAt: lead.createdAt,
        })));
        setConversations(scopedLeads.map(lead => ({
          id: lead.id, customerId: lead.customerId, customerName: lead.customerName,
          customerPhone: lead.customerPhone, leadId: lead.id, channel: 'WhatsApp',
          assignedEmployeeId: lead.assignedEmployeeId || '', assignedEmployeeName: lead.assignedEmployeeName || 'Unassigned',
          status: 'ACTIVE', unreadCount: 0, lastMessage: lead.lastContactOutcome?.replaceAll('_', ' ') || 'Open Lead conversation',
          lastMessageTimestamp: lead.lastContactAt || lead.updatedAt, createdAt: lead.createdAt, updatedAt: lead.updatedAt,
        })));
        setMessages([]);
        setQuotes(fetchedQuotes as any);
        setBookings(fetchedBookings as any);
        setRecommendations([]);
        setAiActions([]);
        setApprovals([]);
        setAuditLogs([]);
        setTrips(fetchedTrips as any);
        setHotels((fetchedAccommProps as AccommodationProperty[]).map(property => ({
          id: property.id, name: property.name, destination: property.location || property.city,
          category: property.starCategory || property.propertyType, address: property.address || '', contact: '',
          supplierId: '', description: property.description || '', amenities: property.amenities || [],
          active: property.status === 'ACTIVE',
        })));
        setTransports([]);
        setDrivers([]);
        setActivities([]);
        setSuppliers(fetchedSuppliers as any);
        setVouchers([]);
        setAccommodationProperties(fetchedAccommProps as any);
        setRoomCategories(fetchedRoomCats as any);
        setRatePeriods(fetchedRatePeriods as any);
        setNegotiatedRates([]);

        setVehicleCategories(fetchedVehicles as any);
        setDestinations([]);
        setTransportRoutes([]);
        setTransportRatePeriods(fetchedTransRates as any);
        setTransportSupplements([]);
        
        setActivityMasters(fetchedActMasters as any);
        setActivityRatePeriods(fetchedActRates as any);
        setDataLoadErrors(loadErrors);
      } catch (err) {
        console.error('Failed to load production data:', err);
      } finally {
        if (!disposed) setIsLoading(false);
      }
    };
    
    loadData();
    return () => { disposed = true; controller.abort(); };
  }, [currentUser.employeeId, currentUser.role]);

  // Sync to local storage for instant responsiveness (only in DEMO_MODE)
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_leads', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_customers', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_trips', JSON.stringify(trips));
  }, [trips]);

  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_itinerary_days', JSON.stringify(itineraryDays));
  }, [itineraryDays]);

  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_vouchers', JSON.stringify(vouchers));
  }, [vouchers]);

  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_accommodation_properties', JSON.stringify(accommodationProperties));
  }, [accommodationProperties]);

  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_room_categories', JSON.stringify(roomCategories));
  }, [roomCategories]);

  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_rate_periods', JSON.stringify(ratePeriods));
  }, [ratePeriods]);

  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_negotiated_rates', JSON.stringify(negotiatedRates));
  }, [negotiatedRates]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_tasks', JSON.stringify(tasks));
  }, [tasks]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_conversations', JSON.stringify(conversations));
  }, [conversations]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_messages', JSON.stringify(messages));
  }, [messages]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_quotes', JSON.stringify(quotes));
  }, [quotes]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_bookings', JSON.stringify(bookings));
  }, [bookings]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_recommendations', JSON.stringify(recommendations));
  }, [recommendations]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_actions', JSON.stringify(aiActions));
  }, [aiActions]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_approvals', JSON.stringify(approvals));
  }, [approvals]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_content_calendar', JSON.stringify(contentCalendar));
  }, [contentCalendar]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_trips', JSON.stringify(trips));
  }, [trips]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_hotels', JSON.stringify(hotels));
  }, [hotels]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_transports', JSON.stringify(transports));
  }, [transports]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_drivers', JSON.stringify(drivers));
  }, [drivers]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_activities', JSON.stringify(activities));
  }, [activities]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_suppliers', JSON.stringify(suppliers));
  }, [suppliers]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_vouchers', JSON.stringify(vouchers));
  }, [vouchers]);

  // Helper to log audit events with verified actor details
  const logAuditEvent = (action: string, entityType: string, entityId: string, before?: any, after?: any, reason?: string) => {
    // Production mutations are audited by their authenticated server workflow.
    // This local helper exists only to keep demo-mode UX history responsive.
    if (!APP_CONFIG.DEMO_MODE) return;
    const newLog: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorType: 'HUMAN',
      actorId: currentUser.employeeId,
      actorName: `${currentUser.name} (${currentUser.role})`,
      action,
      entityType,
      entityId,
      before: before || null,
      after: after || null,
      reason: reason || `Updated by ${currentUser.name}`
    };
    setAuditLogs(prev => [newLog, ...prev]);

  };

  // Lead CRUD
  const createLead = async (leadData: CreateLeadInput): Promise<Lead> => {
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: await authenticatedMutationHeaders(currentUser.employeeId),
        body: JSON.stringify(leadData)
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = typeof responseBody.code === 'string' ? `, ${responseBody.code}` : '';
        throw new Error(`Lead creation failed (${res.status}${code}): ${responseBody.error || 'The server did not provide an error message.'}`);
      }
      const { data: newLead } = responseBody;
      if (!newLead || typeof newLead !== 'object' || typeof newLead.id !== 'string' || !newLead.id) {
        throw new Error('Lead creation failed: the server returned an invalid Lead record. Reload and retry.');
      }
      setLeads(prev => [newLead, ...prev.filter(existing => existing.id !== newLead.id)]);
      return newLead;
    } catch (err) {
      console.error('API create lead failed:', err);
      throw err;
    }
  };

  const updateLead = async (id: string, updates: Partial<Lead>): Promise<Lead> => {
    const prevLead = leads.find(l => l.id === id);
    if (!prevLead) throw new Error('Lead not found. Reload the workspace and try again.');

    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: await authenticatedMutationHeaders(currentUser.employeeId),
        body: JSON.stringify({ ...updates, expectedUpdatedAt: prevLead.updatedAt })
      });
      const responseBody = await res.json().catch(() => ({}));
      if (res.ok) {
        const { data: updatedLead } = responseBody;
        setLeads(prev => prev.map(l => (l.id === id ? updatedLead : l)));
        if (APP_CONFIG.DEMO_MODE) {
          const fields = ['destination', 'travelStartDate', 'travelEndDate', 'nights', 'adults', 'children', 'childAges', 'focCount', 'hotelPreference', 'mealPlanPreference', 'vehiclePreference'] as const;
          const changes = fields
            .filter(field => JSON.stringify(prevLead[field] ?? null) !== JSON.stringify(updatedLead[field] ?? null))
            .map(field => ({ field, before: prevLead[field] ?? null, after: updatedLead[field] ?? null }));
          if (changes.length > 0) {
            const now = new Date().toISOString();
            setTrips(previous => previous.map(trip => trip.leadId !== id || !['DRAFT', 'ITINERARY_READY', 'QUOTE_READY', 'QUOTE_SENT', 'ACCEPTED'].includes(trip.status)
              ? trip
              : {
                  ...trip,
                  costingStatus: 'PENDING',
                  costingRevision: Number(trip.costingRevision || 0) + 1,
                  packageReview: {
                    required: true,
                    reason: 'LEAD_COMMERCIAL_DETAILS_CHANGED',
                    changes,
                    markedAt: now,
                    markedByEmployeeId: currentUser.employeeId,
                  },
                  updatedAt: now,
                  updatedByEmployeeId: currentUser.employeeId,
                }));
          }
        } else if (Array.isArray(responseBody.affectedTrips) && responseBody.affectedTrips.length > 0) {
          const affected = new Map<string, Trip>(responseBody.affectedTrips.map((trip: Trip) => [trip.id, trip]));
          setTrips(previous => previous.map(trip => affected.has(trip.id) ? { ...trip, ...affected.get(trip.id)! } : trip));
        }
        return updatedLead as Lead;
      } else {
        const suffix = responseBody.code ? ` (${responseBody.code})` : '';
        throw new Error(`${responseBody.error || `Failed to update Lead (${res.status}).`}${suffix}`);
      }
    } catch (err) {
      console.error('API lead update failed:', err);
      throw err;
    }
  };

  const updateLeadStatus = async (id: string, status: LeadStatus) => {
    await updateLead(id, { status });
  };

  const addLeadNote = async (id: string, note: string) => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    const timestamp = new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const formattedNote = `${lead.notes ? lead.notes + '\n\n' : ''}[${timestamp} - ${currentUser.name}]: ${note}`;
    await updateLead(id, { notes: formattedNote });
  };

  const assignLead = async (id: string, employeeId: string, _employeeName?: string, note?: string) => {
    const previous = leads.find(lead => lead.id === id);
    if (!previous) throw new Error('Lead not found. Reload the workspace and try again.');
    const response = await fetch(`/api/leads/${encodeURIComponent(id)}/assignment`, {
      method: 'PATCH',
      headers: await authenticatedMutationHeaders(currentUser.employeeId),
      body: JSON.stringify({ targetEmployeeId: employeeId, expectedUpdatedAt: previous.updatedAt, ...(note?.trim() ? { note: note.trim() } : {}) }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Lead reassignment failed (${response.status}).`);
    setLeads(items => items.map(lead => lead.id === id ? body.data : lead));
  };

  const recordLeadInteraction = async (
    id: string,
    input: Omit<LeadInteractionInput, 'expectedUpdatedAt'> & { expectedUpdatedAt?: string },
  ): Promise<Lead> => {
    const current = leads.find(lead => lead.id === id);
    const expectedUpdatedAt = input.expectedUpdatedAt || current?.updatedAt;
    if (!expectedUpdatedAt) throw new Error('Lead version is unavailable. Reload the Sales queue and try again.');
    const result = await recordLeadInteractionApi(id, { ...input, expectedUpdatedAt }, currentUser.employeeId);
    setLeads(items => items.some(lead => lead.id === id)
      ? items.map(lead => lead.id === id ? result.lead : lead)
      : [result.lead, ...items]);
    return result.lead;
  };

  const loadLead = async (id: string): Promise<Lead> => {
    const demoLead = APP_CONFIG.DEMO_MODE ? leads.find(lead => lead.id === id) : undefined;
    if (demoLead) return demoLead;
    const authoritativeLead = await getLeadById(id, currentUser.employeeId);
    setLeads(items => [authoritativeLead, ...items.filter(lead => lead.id !== id)]);
    return authoritativeLead;
  };

  const demoConversationProjection = (leadId: string): ConversationTimelineEntry[] => {
    if (!APP_CONFIG.DEMO_MODE) return [];
    const relevantQuotes = quotes.filter(quote => quote.leadId === leadId);
    const groupIds = new Set(relevantQuotes.map(quote => quote.quoteGroupId).filter((value): value is string => Boolean(value)));
    const relevantShares = readDemoCustomerShares().filter(share => groupIds.has(share.quoteGroupId));
    const projected: ConversationTimelineEntry[] = [];
    const quoteGroups = new Map<string, Quote[]>();
    for (const quote of relevantQuotes) {
      const key = quote.quoteGroupId || quote.id;
      quoteGroups.set(key, [...(quoteGroups.get(key) || []), quote]);
    }
    for (const [groupId, group] of quoteGroups) {
      const representative = group[0];
      const occurredAt = group.map(quote => quote.optionSnapshotCreatedAt || quote.createdAt).sort()[0];
      const version = 1;
      projected.push({
        entryId: `quote-group-created:${groupId}`, leadId, customerId: representative.customerId,
        ...(representative.tripId ? { tripId: representative.tripId } : {}),
        entryType: 'QUOTE_EVENT', channel: 'SYSTEM', direction: 'SYSTEM', visibility: 'SYSTEM',
        title: group.length > 1 ? 'Quote options created' : `Quote V${version} created`,
        ...(group.length > 1 ? { body: `${group.length} customer package options are available.` } : {}),
        actorType: 'SYSTEM', actorName: 'BBOS', occurredAt, createdAt: occurredAt, attachmentIds: [],
        metadata: { sourceType: 'QUOTE_GROUP', sourceId: groupId, quoteVersion: version },
      });
      const recommended = group.find(quote => quote.isRecommended);
      if (recommended) projected.push({
        entryId: `quote-recommended:${recommended.id}`, leadId, customerId: recommended.customerId,
        ...(recommended.tripId ? { tripId: recommended.tripId } : {}),
        entryType: 'QUOTE_EVENT', channel: 'SYSTEM', direction: 'SYSTEM', visibility: 'SYSTEM',
        title: `Option “${recommended.optionLabel || 'Recommended'}” recommended`, actorType: 'SYSTEM', actorName: 'BBOS',
        occurredAt: recommended.updatedAt || recommended.optionSnapshotCreatedAt || recommended.createdAt,
        createdAt: recommended.updatedAt || recommended.optionSnapshotCreatedAt || recommended.createdAt,
        attachmentIds: [], metadata: { sourceType: 'QUOTE', sourceId: recommended.id, quoteVersion: recommended.version || 1 },
      });
    }
    for (const share of relevantShares) {
      const quote = relevantQuotes.find(candidate => candidate.quoteGroupId === share.quoteGroupId);
      const customerId = quote?.customerId;
      projected.push({
        entryId: `share-created:${share.shareId}`, leadId, ...(customerId ? { customerId } : {}),
        entryType: 'SHARE_EVENT', channel: 'SYSTEM', direction: 'OUTBOUND', visibility: 'SYSTEM',
        title: `Customer package V${share.version} shared`, actorType: 'EMPLOYEE',
        actorEmployeeId: share.salesEmployeeId, actorName: share.createdByName, occurredAt: share.createdAt,
        createdAt: share.createdAt, attachmentIds: [], metadata: { sourceType: 'CUSTOMER_SHARE', sourceId: share.shareId, shareVersion: share.version },
      });
      if (share.lastViewedAt || share.firstViewedAt) {
        const occurredAt = share.lastViewedAt || share.firstViewedAt!;
        projected.push({
          entryId: `share-viewed:${share.shareId}:${occurredAt}`, leadId, ...(customerId ? { customerId } : {}),
          entryType: 'SHARE_EVENT', channel: 'SYSTEM', direction: 'INBOUND', visibility: 'SYSTEM',
          title: 'Package link viewed', body: `${Math.max(1, share.viewCount || 1)} recorded view${(share.viewCount || 1) === 1 ? '' : 's'}.`,
          actorType: 'CUSTOMER', actorName: 'Customer', occurredAt, createdAt: occurredAt, attachmentIds: [],
          metadata: { sourceType: 'CUSTOMER_SHARE', sourceId: share.shareId, shareVersion: share.version, viewCount: Math.max(1, share.viewCount || 1) },
        });
      }
      if (share.revokedAt) projected.push({
        entryId: `share-revoked:${share.shareId}`, leadId, ...(customerId ? { customerId } : {}),
        entryType: 'SHARE_EVENT', channel: 'SYSTEM', direction: 'SYSTEM', visibility: 'SYSTEM',
        title: 'Package link revoked', actorType: 'EMPLOYEE', actorEmployeeId: share.revokedByEmployeeId,
        actorName: 'Sales team', occurredAt: share.revokedAt, createdAt: share.revokedAt, attachmentIds: [],
        metadata: { sourceType: 'CUSTOMER_SHARE', sourceId: share.shareId, shareVersion: share.version },
      });
      for (const event of auditLogs.filter(log => log.entityId === share.shareId && ['WHATSAPP_SHARE_PREPARED', 'EMAIL_SHARE_PREPARED'].includes(log.action))) {
        const whatsapp = event.action === 'WHATSAPP_SHARE_PREPARED';
        projected.push({
          entryId: `share-delivery:${event.id}`, leadId, ...(customerId ? { customerId } : {}),
          entryType: 'SHARE_EVENT', channel: whatsapp ? 'WHATSAPP' : 'EMAIL', direction: 'OUTBOUND', visibility: 'CUSTOMER_COMMUNICATION',
          title: `${whatsapp ? 'WhatsApp' : 'Email'} package message prepared`, body: 'Prepared for external delivery; provider sending is not confirmed.',
          actorType: 'EMPLOYEE', actorEmployeeId: event.actorId, actorName: event.actorName.replace(/\s+\([^)]*\)$/, ''),
          occurredAt: event.timestamp, createdAt: event.timestamp, attachmentIds: [],
          metadata: { sourceType: 'AUDIT_EVENT', sourceId: event.id, shareVersion: share.version },
        });
      }
    }
    for (const booking of bookings.filter(item => item.leadId === leadId && ['CONFIRMED', 'IN_OPERATIONS', 'TRAVELLING', 'COMPLETED'].includes(item.status))) {
      projected.push({
        entryId: `booking-confirmed:${booking.id}`, leadId, customerId: booking.customerId, bookingId: booking.id, tripId: booking.tripId,
        entryType: 'BOOKING_EVENT', channel: 'SYSTEM', direction: 'SYSTEM', visibility: 'SYSTEM', title: 'Booking confirmed',
        body: booking.bookingReference ? `Booking ${booking.bookingReference}.` : undefined, actorType: 'SYSTEM', actorName: 'BBOS',
        occurredAt: booking.updatedAt, createdAt: booking.updatedAt, attachmentIds: [], metadata: { sourceType: 'BOOKING', sourceId: booking.id },
      });
    }
    return projected;
  };

  const loadLeadConversation = async (id: string, options: { limit?: number; cursor?: string } = {}): Promise<ConversationTimelinePage> => {
    const page = await getLeadConversationTimeline(id, currentUser.employeeId, options);
    if (!APP_CONFIG.DEMO_MODE || options.cursor) return page;
    const limit = options.limit || 30;
    const combined = [...new Map([...page.entries, ...demoConversationProjection(id)].map(entry => [entry.entryId, entry])).values()]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.entryId.localeCompare(left.entryId));
    return { entries: combined.slice(0, limit), hasMore: page.hasMore || combined.length > limit, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
  };

  const addLeadConversationEntry = async (id: string, input: ConversationEntryCreateInput): Promise<ConversationEntryCreateResult> => {
    return createLeadConversationEntry(id, input, currentUser.employeeId);
  };

  const loadLeadWhatsAppContext = async (id: string): Promise<WhatsAppConversationContext> => {
    return getLeadWhatsAppContext(id, currentUser.employeeId);
  };

  const sendLeadWhatsApp = async (id: string, input: WhatsAppSendInput): Promise<WhatsAppSendResult> => {
    return sendLeadWhatsAppMessage(id, input, currentUser.employeeId);
  };

  const retryLeadWhatsApp = async (id: string, entryId: string, idempotencyKey: string): Promise<WhatsAppSendResult> => {
    return retryLeadWhatsAppMessage(id, entryId, idempotencyKey, currentUser.employeeId);
  };

  const listUnresolvedWhatsApp = async (): Promise<UnresolvedWhatsAppMessage[]> => {
    return listUnresolvedWhatsAppApi(currentUser.employeeId);
  };

  const linkUnresolvedWhatsApp = async (unresolvedId: string, leadId: string): Promise<ConversationTimelineEntry> => {
    return linkUnresolvedWhatsAppApi(unresolvedId, leadId, currentUser.employeeId);
  };

  // Accommodation CRUD
  const addAccommodationProperty = async (propertyData: Omit<AccommodationProperty, 'id' | 'createdAt' | 'updatedAt'>): Promise<AccommodationProperty> => {
    const newProperty = await inventoryApi.createProperty(propertyData, currentUser.employeeId);
    setAccommodationProperties(prev => [newProperty, ...prev]);
    return newProperty;
  };

  const updateAccommodationProperty = async (id: string, updates: Partial<AccommodationProperty>) => {
    const prevProp = accommodationProperties.find(p => p.id === id);
    if (!prevProp) return;

    const updated = await inventoryApi.updateProperty(id, updates, currentUser.employeeId);
    setAccommodationProperties(prev => prev.map(p => (p.id === id ? updated : p)));
  };

  // Phase 2B-4: Transport CRUD
  const addTransportRatePeriod = async (data: Omit<TransportRatePeriod, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newRate = await inventoryApi.createTransportRate(data, currentUser.employeeId);
    setTransportRatePeriods(prev => [newRate, ...prev]);
    return newRate;
  };
  const updateTransportRatePeriod = async (id: string, updates: Partial<TransportRatePeriod>) => {
    const updated = await inventoryApi.updateTransportRate(id, updates, currentUser.employeeId);
    setTransportRatePeriods(prev => prev.map(r => r.id === id ? updated : r));
  };
  const deleteTransportRatePeriod = async (id: string) => {
    const updated = await inventoryApi.updateTransportRate(id, { status: 'ARCHIVED' }, currentUser.employeeId);
    setTransportRatePeriods(prev => prev.map(r => r.id === id ? updated : r));
  };

  const addTransportSupplement = async (data: Omit<TransportSupplement, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!APP_CONFIG.DEMO_MODE) throw new Error('Transport supplements require a server API before they can be changed in production.');
    const newSupp = { ...data, id: `tsupp-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setTransportSupplements(prev => [newSupp, ...prev]);
    return newSupp;
  };
  const updateTransportSupplement = async (id: string, updates: Partial<TransportSupplement>) => {
    if (!APP_CONFIG.DEMO_MODE) throw new Error('Transport supplements require a server API before they can be changed in production.');
    setTransportSupplements(prev => prev.map(s => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s));
  };
  const deleteTransportSupplement = async (id: string) => {
    if (!APP_CONFIG.DEMO_MODE) throw new Error('Transport supplements require a server API before they can be changed in production.');
    setTransportSupplements(prev => prev.filter(s => s.id !== id));
  };

  // Phase 2B-4: Activity CRUD
  const addActivityMaster = async (data: Omit<ActivityMaster, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newMaster = await inventoryApi.createActivity(data, currentUser.employeeId);
    setActivityMasters(prev => [newMaster, ...prev]);
    return newMaster;
  };
  const updateActivityMaster = async (id: string, updates: Partial<ActivityMaster>) => {
    const updated = await inventoryApi.updateActivity(id, updates, currentUser.employeeId);
    setActivityMasters(prev => prev.map(m => m.id === id ? updated : m));
  };
  const deleteActivityMaster = async (id: string) => {
    const updated = await inventoryApi.updateActivity(id, { active: false }, currentUser.employeeId);
    setActivityMasters(prev => prev.map(m => m.id === id ? updated : m));
  };

  const addActivityRatePeriod = async (data: Omit<ActivityRatePeriod, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newRate = await inventoryApi.createActivityRate(data, currentUser.employeeId);
    setActivityRatePeriods(prev => [newRate, ...prev]);
    return newRate;
  };
  const updateActivityRatePeriod = async (id: string, updates: Partial<ActivityRatePeriod>) => {
    const updated = await inventoryApi.updateActivityRate(id, updates, currentUser.employeeId);
    setActivityRatePeriods(prev => prev.map(r => r.id === id ? updated : r));
  };
  const deleteActivityRatePeriod = async (id: string) => {
    const updated = await inventoryApi.updateActivityRate(id, { status: 'ARCHIVED' }, currentUser.employeeId);
    setActivityRatePeriods(prev => prev.map(r => r.id === id ? updated : r));
  };

  // Customer CRUD
  const createCustomer = async (custData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'totalBookings' | 'lifetimeValue'>): Promise<Customer> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const legacyInput = custData as any;
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: await authenticatedMutationHeaders(currentUser.employeeId),
        body: JSON.stringify({
          name: custData.name,
          phone: custData.phone,
          whatsApp: custData.whatsApp || custData.phone,
          email: custData.email || '',
          city: custData.city || '',
          customerType: custData.customerType || (legacyInput.segment === 'B2B' ? 'B2B' : 'B2C'),
          preferences: custData.preferences || legacyInput.tags || [],
          notes: custData.notes || '',
          ...(custData.companyId ? { companyId: custData.companyId } : {}),
        }),
      });
      const result = await readApiResponse(response);
      const created = result.data as Customer;
      setCustomers(previous => [created, ...previous.filter(customer => customer.id !== created.id)]);
      return created;
    }
    const newCustomer: Customer = {
      ...custData,
      id: `cust-${Date.now()}`,
      totalBookings: 0,
      lifetimeValue: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: APP_CONFIG.DEMO_MODE
    };
    setCustomers(prev => [newCustomer, ...prev]);
    logAuditEvent('CUSTOMER_CREATED', 'CUSTOMER', newCustomer.id, null, newCustomer);

    return newCustomer;
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    if (!APP_CONFIG.DEMO_MODE) {
      const allowed = Object.fromEntries(Object.entries(updates).filter(([field]) => [
        'name', 'phone', 'whatsApp', 'email', 'city', 'customerType', 'preferences', 'notes', 'companyId',
      ].includes(field)));
      const response = await fetch(`/api/customers/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: await authenticatedMutationHeaders(currentUser.employeeId),
        body: JSON.stringify(allowed),
      });
      const result = await readApiResponse(response);
      const updated = result.data as Customer;
      setCustomers(previous => previous.map(customer => customer.id === id ? updated : customer));
      return;
    }
    const prevCust = customers.find(c => c.id === id);
    const updated = prevCust ? { ...prevCust, ...updates, updatedAt: new Date().toISOString() } : null;
    setCustomers(prev =>
      prev.map(c => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c))
    );
    logAuditEvent('CUSTOMER_UPDATED', 'CUSTOMER', id, prevCust, updates, `Updated customer ${prevCust?.name || id}`);

  };

  // Task CRUD
  const createTask = async (taskData: Omit<Task, 'id' | 'createdAt'>): Promise<Task> => {
    if (!APP_CONFIG.DEMO_MODE) {
      throw new Error('Standalone tasks are retired. Schedule the next follow-up on the Lead.');
    }
    const newTask: Task = {
      ...taskData,
      id: `task-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setTasks(prev => [newTask, ...prev]);
    logAuditEvent('TASK_CREATED', 'TASK', newTask.id, null, newTask, `Task created: ${newTask.title}`);
    return newTask;
  };

  const toggleTaskStatus = async (id: string) => {
    if (!APP_CONFIG.DEMO_MODE) {
      throw new Error('Follow-up completion must be recorded as a Lead interaction.');
    }
    setTasks(prev =>
      prev.map(t => {
        if (t.id === id) {
          const nextStatus = t.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
          return {
            ...t,
            status: nextStatus,
            completedAt: nextStatus === 'COMPLETED' ? new Date().toISOString() : undefined
          };
        }
        return t;
      })
    );
  };

  // Content Calendar CRUD
  const createContentItem = async (itemData: Omit<ContentItem, 'id' | 'createdAt'>): Promise<ContentItem> => {
    const newItem: ContentItem = {
      ...itemData,
      id: `content-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setContentCalendar(prev => [newItem, ...prev]);
    logAuditEvent('CONTENT_CREATED', 'CONTENT', newItem.id, null, newItem, `Scheduled ${newItem.contentType} on ${newItem.channel}`);
    return newItem;
  };

  // Messaging
  const sendMessage = async (conversationId: string, content: string, senderType: 'EMPLOYEE' | 'CUSTOMER' | 'AI' | 'SYSTEM' = 'EMPLOYEE') => {
    if (!APP_CONFIG.DEMO_MODE) {
      throw new Error('Use the Lead conversation timeline or WhatsApp workflow to send a message.');
    }
    const newMsg: Message = {
      id: `msg-${Date.now()}`,
      conversationId,
      senderType,
      senderId: currentUser.id,
      senderName: senderType === 'EMPLOYEE' ? currentUser.name : (senderType === 'AI' ? 'Booking Bridge AI Copilot' : 'Client'),
      content,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMsg]);
    setConversations(prev =>
      prev.map(c => (c.id === conversationId ? { ...c, lastMessage: content, lastMessageTimestamp: new Date().toISOString() } : c))
    );
  };

  // Trip & Itinerary Operations
  const createTrip = async (
    tripData: TripDraftInput,
    initialDaysCount?: number,
    fromPackageId?: string
  ): Promise<Trip> => {
    let newTrip: Trip;
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(buildTripWritePayload(tripData, true)),
      });
      const result = await readApiResponse(response);
      newTrip = result.data as Trip;
    } else {
      const tripId = `trip-${Date.now()}`;
      const sourceLead = tripData.leadId ? leads.find(lead => lead.id === tripData.leadId) : undefined;
      const assignedSalesEmployeeId = sourceLead?.assignedEmployeeId || currentUser.employeeId;
      const salesTeamId = sourceLead?.salesTeamId
        || (assignedSalesEmployeeId === currentUser.employeeId ? currentUser.salesTeamId : undefined);
      const initialCost = tripData.totalSupplierCost || 0;
      const initialPrice = tripData.totalSellingPrice ?? tripData.budget ?? 0;
      const profit = initialPrice - initialCost;
      const margin = initialPrice > 0 ? Number(((profit / initialPrice) * 100).toFixed(1)) : 0;
      newTrip = {
        ...tripData,
        id: tripId,
        status: 'DRAFT',
        currency: tripData.currency || 'INR',
        totalSupplierCost: initialCost,
        costingStatus: 'PENDING',
        costingRevision: 0,
        totalSellingPrice: initialPrice,
        grossProfit: profit,
        grossMargin: margin,
        assignedSalesEmployeeId,
        ...(salesTeamId ? { salesTeamId } : {}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDemo: true,
      };
    }
    const tripId = newTrip.id;

    // Generate Initial Days from Dates or Package
    const createdDays: ItineraryDay[] = [];
    const matchedPkg = fromPackageId ? packages.find(p => p.id === fromPackageId) : null;
    
    // Calculate days between start and end date if available
    let calculatedDays = initialDaysCount || 4;
    if (tripData.startDate && tripData.endDate) {
      const start = new Date(tripData.startDate).getTime();
      const end = new Date(tripData.endDate).getTime();
      const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 0 && diffDays < 30) {
        calculatedDays = diffDays;
      }
    }
    const daysToGenerate = matchedPkg ? matchedPkg.durationDays : calculatedDays;
    const startDateObj = tripData.startDate ? new Date(tripData.startDate) : new Date();

    for (let d = 1; d <= daysToGenerate; d++) {
      const dayDate = new Date(startDateObj);
      dayDate.setDate(dayDate.getDate() + (d - 1));
      const pkgDay = matchedPkg?.itinerary?.find(item => item.day === d);

      const newDay: ItineraryDay = {
        id: `day-${tripId}-${d}-${Date.now()}`,
        tripId,
        dayNumber: d,
        date: dayDate.toISOString().split('T')[0],
        title: pkgDay ? pkgDay.title : `Day ${d} - Itinerary`,
        location: tripData.destination || 'Destination',
        description: pkgDay ? pkgDay.description : '',
        items: []
      };
      createdDays.push(newDay);
    }

    let persistedDays = createdDays;
    if (!APP_CONFIG.DEMO_MODE && createdDays.length > 0) {
      persistedDays = [];
      for (const day of createdDays) {
        const response = await fetch(`/api/trips/${encodeURIComponent(newTrip.id)}/itinerary-days`, {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            date: day.date,
            title: day.title,
            location: day.location,
            description: day.description,
            ...(day.notes ? { notes: day.notes } : {}),
          }),
        });
        const result = await readApiResponse(response);
        persistedDays.push(result.data.day as ItineraryDay);
        newTrip = result.data.trip as Trip;
      }
    }

    setTrips(prev => [newTrip, ...prev]);
    if (persistedDays.length > 0) {
      setItineraryDays(prev => [...prev, ...persistedDays]);
    }

    if (APP_CONFIG.DEMO_MODE) {
      logAuditEvent('trip.created', 'TRIP', newTrip.id, null, newTrip, `Created new trip "${newTrip.title}" for ${newTrip.destination}`);
    }

    return newTrip;
  };

  const createOrResumeLeadTrip = async (leadId: string, persistedLead?: Lead): Promise<Trip> => {
    const existing = trips
      .filter(trip => trip.leadId === leadId && ['DRAFT', 'ITINERARY_READY', 'QUOTE_READY'].includes(trip.status))
      .sort((left, right) => String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt)))[0];
    if (existing) return existing;

    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/trips/from-lead/${encodeURIComponent(leadId)}`, {
        method: 'POST',
        headers: await getAuthHeaders(),
      });
      const result = await readApiResponse(response);
      const trip = result.data.trip as Trip;
      const days = Array.isArray(result.data.days) ? result.data.days as ItineraryDay[] : [];
      const customer = result.data.customer as Customer | undefined;
      setTrips(previous => [trip, ...previous.filter(item => item.id !== trip.id)]);
      if (days.length > 0) {
        setItineraryDays(previous => [
          ...previous.filter(day => day.tripId !== trip.id),
          ...days,
        ]);
      }
      if (customer) setCustomers(previous => [customer, ...previous.filter(item => item.id !== customer.id)]);
      return trip;
    }

    const lead = persistedLead || leads.find(item => item.id === leadId);
    if (!lead) throw new Error('Lead not found.');
    if (currentUser.role === 'Sales Executive' && lead.assignedEmployeeId !== currentUser.employeeId) {
      throw new Error('Sales Executives may only build packages for their own Leads.');
    }
    let customer = customers.find(item => item.id === lead.customerId);
    if (!customer) {
      customer = {
        id: lead.customerId,
        name: lead.customerName,
        phone: lead.customerPhone || '',
        email: lead.customerEmail || '',
        city: '',
        customerType: 'B2C',
        preferences: lead.keyInterests || [],
        notes: lead.notes || '',
        totalBookings: 0,
        lifetimeValue: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDemo: true,
      };
      setCustomers(previous => [customer!, ...previous.filter(item => item.id !== customer!.id)]);
    }
    if (!lead.travelStartDate || !lead.travelEndDate) throw new Error('Add the Lead travel start date and number of nights before building the package.');
    if (lead.adults === undefined) throw new Error('Add adult and child details to the Lead before building the package.');
    const children = (lead.childAges || []).length;
    const adults = lead.adults;
    return createTrip({
      customerId: customer.id,
      leadId: lead.id,
      title: `${lead.destination} ${lead.tripType || 'Custom Private Tour'} for ${lead.customerName}`,
      destination: lead.destination,
      startDate: lead.travelStartDate,
      endDate: lead.travelEndDate,
      travelerCount: adults + children,
      adults,
      children,
      childAges: lead.childAges || [],
      ...(lead.focCount !== undefined ? { focCount: lead.focCount } : {}),
      tripType: lead.tripType || 'Custom Private Tour',
      currency: 'INR',
      ...(lead.budget !== undefined ? { budget: lead.budget } : {}),
      totalSellingPrice: lead.budget || 0,
      ...(lead.hotelPreference ? { hotelPreference: lead.hotelPreference } : {}),
      ...(lead.mealPlanPreference ? { mealPlanPreference: lead.mealPlanPreference } : {}),
      ...(lead.vehiclePreference ? { vehiclePreference: lead.vehiclePreference } : {}),
      ...(lead.specialRequirements ? { specialRequirements: lead.specialRequirements } : {}),
      ...(lead.notes ? { leadNotes: lead.notes } : {}),
    });
  };

  const updateTrip = async (id: string, updates: TripUpdateInput) => {
    const prevTrip = trips.find(t => t.id === id);
    if (!prevTrip) throw new Error('Trip not found.');

    let updated: Trip;
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/trips/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify(buildTripWritePayload(updates, false)),
      });
      const result = await readApiResponse(response);
      updated = result.data as Trip;
    } else {
      const invalidatesCosting = Object.keys(updates).some(field =>
        TRIP_COSTING_INPUT_FIELDS.has(field) && !sameValue((prevTrip as any)[field], (updates as any)[field]),
      );
      const mode = updates.totalSellingPrice !== undefined && updates.pricingMode === undefined
        ? 'SELLING_PRICE'
        : updates.pricingMode || prevTrip.pricingMode || 'SELLING_PRICE';
      const pricingInput = updates.totalSellingPrice !== undefined && updates.pricingMode === undefined
        ? updates.totalSellingPrice
        : updates.pricingInput ?? prevTrip.pricingInput ?? prevTrip.totalSellingPrice;
      const economics = calculatePackageEconomics(prevTrip.totalSupplierCost || 0, mode, pricingInput);
      const { expectedCostingRevision: _expectedCostingRevision, ...safeUpdates } = updates;
      if (_expectedCostingRevision !== undefined && _expectedCostingRevision !== Number(prevTrip.costingRevision || 0)) {
        throw new Error('Package economics changed. Reload before saving pricing.');
      }
      const pricingChanged = prevTrip.totalSellingPrice !== economics.totalSellingPrice
        || (prevTrip.pricingMode || 'SELLING_PRICE') !== economics.pricingMode
        || Number(prevTrip.pricingInput ?? prevTrip.totalSellingPrice) !== economics.pricingInput;
      const nextRevision = Number(prevTrip.costingRevision || 0) + (invalidatesCosting || pricingChanged ? 1 : 0);
      updated = {
        ...prevTrip,
        ...safeUpdates,
        ...economics,
        ...(prevTrip.costingStatus === 'CALCULATED' && !invalidatesCosting ? {
          commercialApproval: assessLowMarginPolicy(economics.grossMargin, APP_CONFIG.LOW_MARGIN_THRESHOLD_PERCENT, new Date().toISOString()),
        } : {}),
        ...(invalidatesCosting ? {
          costingStatus: 'PENDING' as const,
          costingRevision: nextRevision,
        } : pricingChanged ? {
          costingRevision: nextRevision,
          ...(prevTrip.costingStatus === 'CALCULATED' ? { costingCalculatedRevision: nextRevision } : {}),
        } : {}),
        updatedAt: new Date().toISOString(),
      };
      logAuditEvent('trip.updated', 'TRIP', id, prevTrip, updates, `Updated trip ${prevTrip.title || id}`);
      if (prevTrip.pricingMode !== updated.pricingMode) {
        logAuditEvent('PRICING_MODE_CHANGED', 'TRIP', id, { pricingMode: prevTrip.pricingMode || 'SELLING_PRICE' }, { pricingMode: updated.pricingMode }, `Pricing mode changed by ${currentUser.employeeId}.`);
      }
      if (prevTrip.totalSellingPrice !== updated.totalSellingPrice) {
        logAuditEvent('SELLING_PRICE_CHANGED', 'TRIP', id, { totalSellingPrice: prevTrip.totalSellingPrice }, { totalSellingPrice: updated.totalSellingPrice, pricingMode: updated.pricingMode }, `Selling price changed by ${currentUser.employeeId}.`);
      }
    }
    setTrips(prev => prev.map(t => (t.id === id ? updated : t)));
  };

  const recalculateTripCost = async (tripId: string) => {
      const trip = trips.find(t => t.id === tripId);
      if (!trip) throw new Error('Trip not found.');
      if (trip.packageReview?.required) {
        throw new Error('Apply the latest Lead travel details before recalculating this package.');
      }

      const tripDaysLocal = itineraryDays.filter(d => d.tripId === tripId);
      const allItems = tripDaysLocal.flatMap(d => d.items || []);

      if (APP_CONFIG.DEMO_MODE) {
        const calculationRevision = Number(trip.costingRevision || 0);
        const itemSupplierCosts: Record<string, number> = {};
        let totalSupplierCost = 0;
        const costEntries: PackageCostEntry[] = [];
        const recordCost = (item: ItineraryItem, amount: number, category: PackageCostEntry['category']) => {
          itemSupplierCosts[item.id] = amount;
          totalSupplierCost += amount;
          costEntries.push({ category, label: item.title || 'Package service', amount });
        };
        for (const item of allItems) {
          const metadata = item.metadata || {};
          let supplierCost = 0;
          if (item.type === 'HOTEL') {
            if (!metadata.propertyId || !metadata.roomCategoryId || !metadata.checkInDate || !metadata.nights) {
              if (Number.isFinite(item.supplierCost) && Number(item.supplierCost) >= 0) {
                supplierCost = Number(item.supplierCost);
                recordCost(item, supplierCost, 'ACCOMMODATION');
                continue;
              }
              throw new Error('Accommodation item is missing authoritative inventory linkage.');
            }
            const room = roomCategories.find(value => value.id === metadata.roomCategoryId);
            if (!room) throw new Error(`Room category ${metadata.roomCategoryId || ''} not found.`);
            const childAges = Array.isArray(trip.childAges) ? trip.childAges : [];
            if (trip.children > 0 && childAges.length !== trip.children) {
              throw new Error('Child ages are required for accurate hotel costing. Return to the Lead or Trip and add every child age.');
            }
            const allocations = Array.isArray(metadata.roomAllocations)
              ? metadata.roomAllocations
              : distributeGuestsAcrossRooms(metadata.roomCategoryId, trip.adults, childAges, Number(metadata.rooms || 1));
            const calculation = calculateMixedAllocatedStayTotal(
              roomCategories.filter(value => value.propertyId === metadata.propertyId), ratePeriods.filter(value => value.propertyId === metadata.propertyId),
              metadata.propertyId, metadata.checkInDate, Number(metadata.nights || 0), allocations,
              { adults: trip.adults, children: trip.children, childAges }, metadata.mealPlan,
              metadata.packageSupplierRate,
            );
            if (!calculation.available) throw new Error('The selected accommodation is unavailable for these dates.');
            supplierCost = Number(calculation.totalAmount || 0);
          } else if (item.type === 'TRANSPORT') {
            const packageRate = metadata.packageSupplierRate;
            const packageCost = packageRate?.entryMode === 'TOTAL_SERVICE'
              ? Number(packageRate.amount)
              : packageRate?.entryMode === 'PER_VEHICLE_DAY'
                ? Number(packageRate.amount) * Math.max(1, Number(metadata.vehicleCount || 1)) * Math.max(1, Number(metadata.chargeableDays || metadata.vehicleDays || 1))
                : undefined;
            if (!metadata.vehicleCategoryId || (!metadata.rateId && packageCost === undefined) || !metadata.startDate || !metadata.serviceType) {
              if (Number.isFinite(item.supplierCost) && Number(item.supplierCost) >= 0) {
                supplierCost = Number(item.supplierCost);
                recordCost(item, supplierCost, 'TRANSPORT');
                continue;
              }
              throw new Error('Transport item is missing authoritative inventory linkage.');
            }
            const rate = transportRatePeriods.find(value => value.id === metadata.rateId);
            if (!rate && packageCost === undefined) throw new Error(`Transport rate ${metadata.rateId || ''} not found.`);
            const calculation = rate ? calculateTransportCost({
              ratePeriod: rate,
              supplements: transportSupplements,
              serviceParams: {
                vehicleDays: Number(metadata.vehicleDays || 1),
                vehicleCount: Number(metadata.vehicleCount || 1),
                chargeableDays: Number(metadata.chargeableDays || metadata.vehicleDays || 1),
                nightHalts: Number(metadata.nightHalts || 0),
                occurrences: Number(metadata.occurrences || 1),
                distanceKm: Number(metadata.distanceKm || 0),
                hours: Number(metadata.hours || 0),
              },
            }) : null;
            if (!calculation?.available && packageCost === undefined) throw new Error('The selected transport is unavailable for these dates.');
            supplierCost = Number(packageCost ?? calculation?.totalAmount ?? 0);
          } else if (item.type === 'ACTIVITY') {
            const packageRate = metadata.packageSupplierRate;
            const packageCost = packageRate?.entryMode === 'PER_PERSON'
              ? Number(packageRate.amount) * Math.max(0, Number(metadata.adults || trip.adults)) + Number(packageRate.childAmount ?? packageRate.amount) * Math.max(0, Number(metadata.children || trip.children))
              : packageRate?.entryMode === 'PER_CHILD' ? Number(packageRate.amount) * Math.max(0, Number(metadata.children || trip.children))
                : packageRate?.entryMode === 'PER_GROUP' ? Number(packageRate.amount) * Math.max(1, Number(metadata.groups || 1))
                  : packageRate?.entryMode === 'PER_UNIT' ? Number(packageRate.amount) * Math.max(1, Number(metadata.units || metadata.tickets || 1))
                    : ['FLAT_TOTAL', 'TOTAL_SERVICE'].includes(packageRate?.entryMode) ? Number(packageRate.amount) : undefined;
            if (!metadata.activityId || (!metadata.rateId && packageCost === undefined) || !metadata.date) {
              if (Number.isFinite(item.supplierCost) && Number(item.supplierCost) >= 0) {
                supplierCost = Number(item.supplierCost);
                recordCost(item, supplierCost, 'ACTIVITIES');
                continue;
              }
              throw new Error('Activity item is missing authoritative inventory linkage.');
            }
            const rate = activityRatePeriods.find(value => value.id === metadata.rateId);
            if (!rate && packageCost === undefined) throw new Error(`Activity rate ${metadata.rateId || ''} not found.`);
            const calculation = rate ? calculateActivityCost({
              ratePeriod: rate,
              params: {
                adults: Number(metadata.adults || trip.adults),
                children: Number(metadata.children || trip.children),
                infants: Number(metadata.infants || 0),
                vehicles: Number(metadata.vehicles || 0),
                groups: Number(metadata.groups || 0),
                tickets: Number(metadata.tickets || 0),
                hours: Number(metadata.hours || 0),
                days: Number(metadata.days || 0),
                sessions: Number(metadata.sessions || 0),
                units: Number(metadata.units || 0),
              },
            }) : null;
            if (!calculation?.available && packageCost === undefined) throw new Error('The selected activity is unavailable for these dates.');
            supplierCost = metadata.inclusionStatus === 'OPTIONAL' || metadata.inclusionStatus === 'NOT_INCLUDED'
              ? 0
              : Number(packageCost ?? calculation?.totalAmount ?? 0);
          } else {
            const inclusionStatus = metadata.inclusionStatus;
            const isIncluded = inclusionStatus !== 'OPTIONAL' && inclusionStatus !== 'NOT_INCLUDED';
            const hasAuthoritativeSource = typeof metadata.costSource === 'string' && metadata.costSource !== 'PENDING';
            if (!isIncluded || !hasAuthoritativeSource || !Number.isFinite(item.supplierCost)) continue;
            supplierCost = Number(item.supplierCost);
          }
          if (!Number.isFinite(supplierCost) || supplierCost < 0) throw new Error('Inventory costing returned an invalid supplier amount.');
          recordCost(
            item,
            supplierCost,
            item.type === 'HOTEL' ? 'ACCOMMODATION' : item.type === 'TRANSPORT' ? 'TRANSPORT' : item.type === 'ACTIVITY' ? 'ACTIVITIES' : 'OTHER',
          );
        }
        const supplierCostBreakdown = buildPackageSupplierCostBreakdown(costEntries);
        const economics = calculatePackageEconomics(
          totalSupplierCost,
          trip.pricingMode || 'SELLING_PRICE',
          trip.pricingInput ?? trip.totalSellingPrice,
        );
        const commercialApproval = assessLowMarginPolicy(
          economics.grossMargin,
          APP_CONFIG.LOW_MARGIN_THRESHOLD_PERCENT,
          new Date().toISOString(),
        );
        setItineraryDays(previous => previous.map(day => day.tripId !== tripId ? day : {
          ...day,
          items: (day.items || []).map(item => ({ ...item, supplierCost: itemSupplierCosts[item.id] ?? item.supplierCost })),
        }));
        setTrips(previous => previous.map(value => value.id !== tripId ? value : {
          ...value, ...economics, supplierCostBreakdown, commercialApproval,
          costingStatus: 'CALCULATED', costingCalculatedRevision: calculationRevision,
          updatedAt: new Date().toISOString(),
        }));
        return;
      }

      const response = await fetch('/api/trips/calculate-costs', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          tripId,
          items: allItems,
          totalSellingPrice: trip.totalSellingPrice
        })
      });

      const data = await readApiResponse(response);
      if (data.success && data.data) {
        const itemSupplierCosts = data.data.itemSupplierCosts || {};
        setItineraryDays(prev => prev.map(day => day.tripId !== tripId ? day : {
          ...day,
          items: (day.items || []).map(item => itemSupplierCosts[item.id] === undefined ? item : { ...item, supplierCost: itemSupplierCosts[item.id] }),
        }));
        setTrips(prev =>
          prev.map(t => (t.id === tripId ? { 
            ...t, 
            totalSupplierCost: data.data.totalSupplierCost, 
            supplierCostBreakdown: data.data.supplierCostBreakdown,
            totalSellingPrice: data.data.totalSellingPrice ?? t.totalSellingPrice,
            pricingMode: data.data.pricingMode ?? t.pricingMode,
            pricingInput: data.data.pricingInput ?? t.pricingInput,
            grossProfit: data.data.grossProfit, 
            grossMargin: data.data.grossMargin, 
            commercialApproval: data.data.commercialApproval,
            costingStatus: data.data.costingStatus,
            costingRevision: data.data.costingRevision ?? t.costingRevision,
            costingCalculatedRevision: data.data.costingCalculatedRevision ?? t.costingCalculatedRevision,
            updatedAt: data.data.updatedAt || new Date().toISOString()
          } : t))
        );
      }
  };

  const reconcileLeadTrip = async (tripId: string): Promise<Trip> => {
    const trip = trips.find(candidate => candidate.id === tripId);
    if (!trip) throw new Error('Trip not found.');
    if (!trip.packageReview?.required) return trip;

    let updated: Trip;
    if (APP_CONFIG.DEMO_MODE) {
      const lead = leads.find(candidate => candidate.id === trip.leadId);
      if (!lead?.travelStartDate || !lead.travelEndDate || lead.adults === undefined) {
        throw new Error('Complete the Lead travel dates and traveler details before applying changes.');
      }
      const now = new Date().toISOString();
      updated = {
        ...trip,
        destination: lead.destination,
        startDate: lead.travelStartDate,
        endDate: lead.travelEndDate,
        adults: lead.adults,
        children: lead.children || 0,
        childAges: [...(lead.childAges || [])],
        travelerCount: lead.adults + (lead.children || 0),
        focCount: lead.focCount || 0,
        hotelPreference: lead.hotelPreference || '',
        mealPlanPreference: lead.mealPlanPreference || '',
        vehiclePreference: lead.vehiclePreference || lead.transportPreference || '',
        specialRequirements: lead.specialRequirements || '',
        costingStatus: 'PENDING',
        costingRevision: Number(trip.costingRevision || 0) + 1,
        packageReview: {
          ...trip.packageReview,
          required: false,
          resolvedAt: now,
          resolvedByEmployeeId: currentUser.employeeId,
        },
        updatedAt: now,
        updatedByEmployeeId: currentUser.employeeId,
      };
    } else {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/reconcile-lead`, {
        method: 'POST',
        headers: await getAuthHeaders(),
      });
      const result = await readApiResponse(response);
      updated = result.data as Trip;
    }
    setTrips(previous => previous.map(candidate => candidate.id === tripId ? updated : candidate));
    return updated;
  };

  const loadTripItinerary = async (tripId: string): Promise<ItineraryDay[]> => {
    if (APP_CONFIG.DEMO_MODE) return itineraryDays.filter(day => day.tripId === tripId);
    const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/itinerary-days`, { headers: await getAuthHeaders() });
    const result = await readApiResponse(response);
    const days = (result.data?.days || []) as ItineraryDay[];
    setItineraryDays(prev => [...prev.filter(day => day.tripId !== tripId), ...days]);
    return days;
  };

  const addItineraryDay = async (tripId: string, dayData?: Partial<ItineraryDay>): Promise<ItineraryDay> => {
    const trip = trips.find(t => t.id === tripId);
    const existingDays = itineraryDays.filter(d => d.tripId === tripId);
    const nextDayNumber = existingDays.length + 1;

    let nextDate = new Date().toISOString().split('T')[0];
    if (trip?.startDate) {
      const d = new Date(trip.startDate);
      d.setDate(d.getDate() + (nextDayNumber - 1));
      nextDate = d.toISOString().split('T')[0];
    }

    let newDay: ItineraryDay = {
      id: `day-${tripId}-${nextDayNumber}-${Date.now()}`,
      tripId,
      dayNumber: nextDayNumber,
      date: dayData?.date || nextDate,
      title: dayData?.title || `Day ${nextDayNumber}`,
      location: dayData?.location || trip?.destination || 'Location',
      description: dayData?.description || '',
      notes: dayData?.notes || '',
      items: dayData?.items || []
    };
    const composedDay = composeDetailedCustomerItinerary(newDay);
    newDay = {
      ...newDay,
      title: dayData?.title || composedDay.title,
      description: dayData?.description || composedDay.description,
      customerContent: {
        style: 'DETAILED', status: 'CURRENT', sourceFingerprint: composedDay.sourceFingerprint,
        updatedAt: new Date().toISOString(), updatedByEmployeeId: currentUser.employeeId,
      },
    };

    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/itinerary-days`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          ...(dayData?.date !== undefined ? { date: dayData.date } : {}),
          ...(dayData?.title !== undefined ? { title: dayData.title } : {}),
          ...(dayData?.location !== undefined ? { location: dayData.location } : {}),
          ...(dayData?.description !== undefined ? { description: dayData.description } : {}),
          ...(dayData?.notes !== undefined ? { notes: dayData.notes } : {}),
        }),
      });
      const result = await readApiResponse(response);
      const created = result.data.day as ItineraryDay;
      const updatedTrip = result.data.trip as Trip;
      setItineraryDays(prev => [...prev, created]);
      setTrips(prev => prev.map(item => item.id === tripId ? updatedTrip : item));
      return created;
    }

    setItineraryDays(prev => [...prev, newDay]);
    setTrips(prev => prev.map(item => item.id === tripId ? {
      ...item, costingStatus: 'PENDING',
      costingRevision: Number(item.costingRevision || 0) + 1,
      updatedAt: new Date().toISOString(),
    } : item));
    logAuditEvent('itinerary.day.created', 'ITINERARY_DAY', newDay.id, null, newDay, `Added Day ${nextDayNumber} to trip ${trip?.title || tripId}`);

    mirrorDemoItineraryDay(newDay);

    return newDay;
  };

  const updateItineraryDay = async (id: string, updates: Partial<ItineraryDay>) => {
    const day = itineraryDays.find(d => d.id === id);
    if (!day) return;
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/trips/itinerary-days/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          ...(updates.date !== undefined ? { date: updates.date } : {}),
          ...(updates.title !== undefined ? { title: updates.title } : {}),
          ...(updates.location !== undefined ? { location: updates.location } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
        }),
      });
      const result = await readApiResponse(response);
      const updatedDay = result.data.day as ItineraryDay;
      const updatedTrip = result.data.trip as Trip;
      setItineraryDays(prev => prev.map(item => item.id === id ? updatedDay : item));
      setTrips(prev => prev.map(item => item.id === day.tripId ? updatedTrip : item));
      return;
    }
    let updatedDay = { ...day, ...updates };
    const changesCustomerFacts = (['date', 'location'] as const)
      .some(field => updates[field] !== undefined && !sameValue(day[field], updates[field]));
    if (changesCustomerFacts) {
      updatedDay = {
        ...updatedDay,
        customerContent: {
          style: 'DETAILED', status: 'REVIEW_NEEDED',
          sourceFingerprint: day.customerContent?.sourceFingerprint || itineraryContentFingerprint(day),
          updatedAt: new Date().toISOString(), updatedByEmployeeId: currentUser.employeeId,
        },
      };
    }
    setItineraryDays(prev => prev.map(d => (d.id === id ? updatedDay : d)));
    const invalidatesCosting = (['date', 'location'] as const)
      .some(field => updates[field] !== undefined && !sameValue(day[field], updates[field]));
    if (invalidatesCosting) setTrips(prev => prev.map(item => item.id === day.tripId ? {
      ...item, costingStatus: 'PENDING',
      costingRevision: Number(item.costingRevision || 0) + 1,
      updatedAt: new Date().toISOString(),
    } : item));
    mirrorDemoItineraryDay(updatedDay);
    
  };

  const composeItineraryDayCustomerContent = async (id: string, confirmReplace = false): Promise<ItineraryDay> => {
    const day = itineraryDays.find(candidate => candidate.id === id);
    if (!day) throw new Error('Itinerary day not found.');
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/trips/itinerary-days/${encodeURIComponent(id)}/compose-customer-content`, {
        method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ confirmReplace }),
      });
      const result = await readApiResponse(response);
      const updatedDay = result.data.day as ItineraryDay;
      setItineraryDays(previous => previous.map(candidate => candidate.id === id ? updatedDay : candidate));
      return updatedDay;
    }
    const composed = composeDetailedCustomerItinerary(day);
    const replacesCopy = Boolean(day.title.trim() || day.description.trim()) &&
      (day.title !== composed.title || day.description !== composed.description);
    if (replacesCopy && !confirmReplace) {
      throw new Error('Rebuilding will replace the current customer title and description.');
    }
    const now = new Date().toISOString();
    const updatedDay: ItineraryDay = {
      ...day, title: composed.title, description: composed.description,
      customerContent: {
        style: 'DETAILED', status: 'CURRENT', sourceFingerprint: composed.sourceFingerprint,
        updatedAt: now, updatedByEmployeeId: currentUser.employeeId,
        reviewedAt: now, reviewedByEmployeeId: currentUser.employeeId,
      },
    };
    setItineraryDays(previous => previous.map(candidate => candidate.id === id ? updatedDay : candidate));
    logAuditEvent('ITINERARY_DAY_CONTENT_COMPOSED', 'ITINERARY_DAY', id, day, updatedDay, 'Rebuilt deterministic customer itinerary copy.');
    return updatedDay;
  };

  const reviewItineraryDayCustomerContent = async (id: string): Promise<ItineraryDay> => {
    const day = itineraryDays.find(candidate => candidate.id === id);
    if (!day) throw new Error('Itinerary day not found.');
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/trips/itinerary-days/${encodeURIComponent(id)}/review-customer-content`, {
        method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({}),
      });
      const result = await readApiResponse(response);
      const updatedDay = result.data.day as ItineraryDay;
      setItineraryDays(previous => previous.map(candidate => candidate.id === id ? updatedDay : candidate));
      return updatedDay;
    }
    if (!day.title.trim() || !day.description.trim()) throw new Error('Add a customer title and detailed description before marking this day reviewed.');
    const now = new Date().toISOString();
    const updatedDay: ItineraryDay = {
      ...day,
      customerContent: {
        style: 'DETAILED', status: 'CURRENT', sourceFingerprint: itineraryContentFingerprint(day),
        updatedAt: now, updatedByEmployeeId: currentUser.employeeId,
        reviewedAt: now, reviewedByEmployeeId: currentUser.employeeId,
      },
    };
    setItineraryDays(previous => previous.map(candidate => candidate.id === id ? updatedDay : candidate));
    logAuditEvent('ITINERARY_DAY_REVIEWED', 'ITINERARY_DAY', id, day, updatedDay, 'Reviewed customer itinerary content.');
    return updatedDay;
  };

  const deleteItineraryDay = async (id: string) => {
    const day = itineraryDays.find(d => d.id === id);
    if (!day) return;
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/trips/itinerary-days/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      });
      const result = await readApiResponse(response);
      const updatedTrip = result.data.trip as Trip;
      setItineraryDays(prev => prev.filter(item => item.id !== id));
      setTrips(prev => prev.map(item => item.id === day.tripId ? updatedTrip : item));
      return;
    }
    const remainingDays = itineraryDays.filter(d => d.id !== id);
    setItineraryDays(remainingDays);

    setTrips(prev => prev.map(item => item.id === day.tripId ? {
      ...item, costingStatus: 'PENDING',
      costingRevision: Number(item.costingRevision || 0) + 1,
      updatedAt: new Date().toISOString(),
    } : item));

    deleteDemoItineraryDayMirror(id);
  };

  const addItineraryItem = async (dayId: string, itemData: Omit<ItineraryItem, 'id' | 'dayId'>): Promise<ItineraryItem> => {
    const targetDay = itineraryDays.find(d => d.id === dayId);
    if (!targetDay) throw new Error(`Day ${dayId} not found`);

    const now = new Date().toISOString();
    const demoItemData = APP_CONFIG.DEMO_MODE && itemData.metadata?.packageRateRequest
      ? { ...itemData, metadata: (() => { const { packageRateRequest, ...metadata } = itemData.metadata!; return { ...metadata, packageSupplierRate: { ...packageRateRequest, enteredByEmployeeId: currentUser.employeeId, enteredAt: now } }; })() }
      : itemData;
    const newItem: ItineraryItem = {
      ...demoItemData,
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      dayId,
      tripId: targetDay.tripId
    };

    if (!APP_CONFIG.DEMO_MODE) {
      const { supplierCost: _supplierCost, id: _id, dayId: _dayId, tripId: _tripId, ...safeItem } = itemData as ItineraryItem;
      const response = await fetch(`/api/trips/itinerary-days/${encodeURIComponent(dayId)}/items`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(safeItem),
      });
      const result = await readApiResponse(response);
      const updatedDay = result.data.day as ItineraryDay;
      const createdItem = result.data.item as ItineraryItem;
      const updatedTrip = result.data.trip as Trip;
      setItineraryDays(prev => prev.map(day => day.id === dayId ? updatedDay : day));
      setTrips(prev => prev.map(item => item.id === targetDay.tripId ? updatedTrip : item));
      return createdItem;
    }

    const updatedDay: ItineraryDay = {
      ...targetDay,
      items: [...(targetDay.items || []), newItem],
      customerContent: {
        style: 'DETAILED', status: 'REVIEW_NEEDED',
        sourceFingerprint: targetDay.customerContent?.sourceFingerprint || itineraryContentFingerprint(targetDay),
        updatedAt: now, updatedByEmployeeId: currentUser.employeeId,
      },
    };
    const updatedDays = itineraryDays.map(d => (d.id === dayId ? updatedDay : d));

    setItineraryDays(updatedDays);
    setTrips(prev => prev.map(item => item.id === targetDay.tripId ? {
      ...item, costingStatus: 'PENDING',
      costingRevision: Number(item.costingRevision || 0) + 1,
      updatedAt: new Date().toISOString(),
    } : item));

    const actionName = itemData.type === 'HOTEL' ? 'hotel.added_to_trip' :
                       itemData.type === 'TRANSPORT' ? 'transport.added_to_trip' :
                       itemData.type === 'ACTIVITY' ? 'activity.added_to_trip' : 'itinerary.item.added';

    logAuditEvent(actionName, 'ITINERARY_ITEM', newItem.id, null, newItem, `Added ${itemData.type}: ${itemData.title}`);

    mirrorDemoItineraryDay(updatedDay);

    return newItem;
  };

  const updateItineraryItem = async (dayId: string, itemId: string, itemData: Omit<ItineraryItem, 'id' | 'dayId' | 'tripId' | 'supplierCost'>): Promise<ItineraryItem> => {
    const targetDay = itineraryDays.find(day => day.id === dayId);
    const existing = targetDay?.items?.find(item => item.id === itemId);
    if (!targetDay || !existing) throw new Error('Itinerary item not found.');
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/trips/itinerary-days/${encodeURIComponent(dayId)}/items/${encodeURIComponent(itemId)}`, {
        method: 'PATCH', headers: await getAuthHeaders(), body: JSON.stringify(itemData),
      });
      const result = await readApiResponse(response);
      setItineraryDays(prev => prev.map(day => day.id === dayId ? result.data.day as ItineraryDay : day));
      setTrips(prev => prev.map(trip => trip.id === targetDay.tripId ? result.data.trip as Trip : trip));
      return result.data.item as ItineraryItem;
    }
    const now = new Date().toISOString();
    const demoItemData = itemData.metadata?.packageRateRequest
      ? { ...itemData, metadata: (() => { const { packageRateRequest, ...metadata } = itemData.metadata!; return { ...metadata, packageSupplierRate: { ...packageRateRequest, enteredByEmployeeId: currentUser.employeeId, enteredAt: now } }; })() }
      : itemData;
    const updatedItem = { ...demoItemData, id: itemId, dayId, tripId: targetDay.tripId } as ItineraryItem;
    let updatedDay: ItineraryDay = { ...targetDay, items: targetDay.items.map(item => item.id === itemId ? updatedItem : item) };
    if (itineraryItemAffectsCustomerContent(existing, updatedItem)) {
      updatedDay = {
        ...updatedDay,
        customerContent: {
          style: 'DETAILED', status: 'REVIEW_NEEDED',
          sourceFingerprint: targetDay.customerContent?.sourceFingerprint || itineraryContentFingerprint(targetDay),
          updatedAt: now, updatedByEmployeeId: currentUser.employeeId,
        },
      };
    }
    setItineraryDays(prev => prev.map(day => day.id === dayId ? updatedDay : day));
    const invalidatesCosting = !sameValue(
      itineraryCommercialValue(existing),
      itineraryCommercialValue(updatedItem),
    );
    if (invalidatesCosting) setTrips(prev => prev.map(trip => trip.id === targetDay.tripId ? {
      ...trip, costingStatus: 'PENDING',
      costingRevision: Number(trip.costingRevision || 0) + 1,
      updatedAt: new Date().toISOString(),
    } : trip));
    // Demo state is authoritative in localStorage. A best-effort Firebase
    // mirror must never prevent the in-app demo workflow from completing.
    mirrorDemoItineraryDay(updatedDay);
    return updatedItem;
  };

  const deleteItineraryItem = async (dayId: string, itemId: string) => {
    const targetDay = itineraryDays.find(d => d.id === dayId);
    if (!targetDay) return;
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/trips/itinerary-days/${encodeURIComponent(dayId)}/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      });
      const result = await readApiResponse(response);
      const updatedDay = result.data.day as ItineraryDay;
      const updatedTrip = result.data.trip as Trip;
      setItineraryDays(prev => prev.map(day => day.id === dayId ? updatedDay : day));
      setTrips(prev => prev.map(item => item.id === targetDay.tripId ? updatedTrip : item));
      return;
    }

    const updatedDay: ItineraryDay = {
      ...targetDay,
      items: (targetDay.items || []).filter(it => it.id !== itemId),
      customerContent: {
        style: 'DETAILED', status: 'REVIEW_NEEDED',
        sourceFingerprint: targetDay.customerContent?.sourceFingerprint || itineraryContentFingerprint(targetDay),
        updatedAt: new Date().toISOString(), updatedByEmployeeId: currentUser.employeeId,
      },
    };
    const updatedDays = itineraryDays.map(d => (d.id === dayId ? updatedDay : d));

    setItineraryDays(updatedDays);
    setTrips(prev => prev.map(item => item.id === targetDay.tripId ? {
      ...item, costingStatus: 'PENDING',
      costingRevision: Number(item.costingRevision || 0) + 1,
      updatedAt: new Date().toISOString(),
    } : item));

    mirrorDemoItineraryDay(updatedDay);
  };

  // Quotes
  const getQuoteBackupAccommodationOptions = async (
    tripId: string,
    sourceTripItemId: string,
  ): Promise<QuoteBackupAccommodation[]> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(
        `/api/quotes/trips/${encodeURIComponent(tripId)}/backup-accommodations?sourceTripItemId=${encodeURIComponent(sourceTripItemId)}`,
        { headers: await getAuthHeaders() },
      );
      const body = await readApiResponse(response);
      return body.data as QuoteBackupAccommodation[];
    }

    const source = itineraryDays.flatMap(day => day.tripId === tripId ? day.items || [] : [])
      .find(item => item.id === sourceTripItemId && item.type === 'HOTEL');
    const metadata = source?.metadata as Record<string, any> | undefined;
    if (!metadata?.checkInDate || !metadata?.mealPlan) return [];
    return ratePeriods.flatMap(rate => {
      if (rate.status !== 'ACTIVE' || rate.mealPlan !== metadata.mealPlan || rate.id === metadata.rateId ||
        metadata.checkInDate < rate.validFrom.slice(0, 10) || (rate.validTo && metadata.checkInDate > rate.validTo.slice(0, 10))) return [];
      const property = accommodationProperties.find(item => item.id === rate.propertyId && item.status === 'ACTIVE');
      const room = roomCategories.find(item => item.id === rate.roomCategoryId && item.active && item.propertyId === property?.id);
      if (!property || !room) return [];
      return [{
        id: `backup-${sourceTripItemId}-${rate.id}`,
        sourceTripItemId,
        propertyId: property.id,
        propertyName: property.name,
        roomCategoryId: room.id,
        roomCategoryName: room.name,
        ratePeriodId: rate.id,
        mealPlan: rate.mealPlan,
        checkInDate: metadata.checkInDate,
        checkOutDate: metadata.checkOutDate,
        nights: metadata.nights || 1,
        roomsCount: metadata.rooms || 1,
        adultsCount: metadata.adults || 1,
        childrenCount: metadata.children || 0,
      } satisfies QuoteBackupAccommodation];
    });
  };

  const buildDemoTripQuoteFields = (trip: Trip, backupSelections: QuoteBackupAccommodation[] = []) => {
    if (!isTripCostingFresh(trip)) {
      throw new Error('Package pricing needs updating before you can create or revise a Quote.');
    }
    const items = itineraryDays.filter(day => day.tripId === trip.id).flatMap(day => day.items || []);
    const inventoryItems = items.filter(item => ['HOTEL', 'TRANSPORT', 'ACTIVITY'].includes(item.type));
    if (!inventoryItems.length) throw new Error('The Trip has no inventory-linked services to quote.');
    for (const item of inventoryItems) {
      if (!item.metadata?.rateId && item.metadata?.costSource !== 'MANUAL_SUPPLIER_QUOTE') throw new Error(`Trip service ${item.title} is not linked to authoritative inventory or an approved manual supplier quote.`);
    }
    const hotels = inventoryItems.filter(item => item.type === 'HOTEL').map(item => ({
      id: item.id,
      sourceTripItemId: item.id,
      hotelId: item.metadata!.propertyId,
      propertyId: item.metadata!.propertyId,
      hotelName: item.metadata!.propertyName,
      roomCategoryId: item.metadata!.roomCategoryId,
      ratePeriodId: item.metadata!.rateId,
      roomType: item.metadata!.roomCategoryName,
      mealPlan: item.metadata!.mealPlan,
      checkInDate: item.metadata!.checkInDate,
      checkOutDate: item.metadata!.checkOutDate,
      nights: item.metadata!.nights || 1,
      roomsCount: item.metadata!.rooms || 1,
      adultsCount: item.metadata!.adults || trip.adults,
      childrenCount: item.metadata!.children || trip.children,
      specialRequests: item.description,
    }));
    const transports = inventoryItems.filter(item => item.type === 'TRANSPORT').map(item => ({
      id: item.id,
      sourceTripItemId: item.id,
      transportId: item.metadata!.vehicleCategoryId,
      vehicleCategoryId: item.metadata!.vehicleCategoryId,
      ratePeriodId: item.metadata!.rateId,
      transportRouteId: item.metadata!.routeId,
      vehicleType: item.metadata!.vehicleName,
      route: item.metadata!.routeName || item.description || item.metadata!.serviceType,
      serviceDate: item.metadata!.startDate,
      days: item.metadata!.vehicleDays || 1,
      vehicleCount: item.metadata!.vehicleCount || 1,
      chargeableDays: item.metadata!.chargeableDays || item.metadata!.vehicleDays || 1,
      serviceDays: item.metadata!.serviceDays,
      passengerCount: trip.travelerCount,
      supplierCost: item.supplierCost,
      costSource: item.metadata!.costSource,
      packageSupplierRate: item.metadata!.packageSupplierRate,
      originalContractedTotal: item.metadata!.contractedTotalSupplierCost,
      specialRequests: item.description,
    }));
    const activities = inventoryItems.filter(item => item.type === 'ACTIVITY').map(item => ({
      id: item.id,
      sourceTripItemId: item.id,
      activityId: item.metadata!.activityId,
      activityMasterId: item.metadata!.activityId,
      activityRatePeriodId: item.metadata!.rateId,
      name: item.metadata!.activityName,
      activityName: item.metadata!.activityName,
      serviceDate: item.metadata!.date,
      date: item.metadata!.date,
      pax: item.metadata!.tickets || (Number(item.metadata!.adults || 0) + Number(item.metadata!.children || 0)) || trip.travelerCount,
      pricingModel: item.metadata!.pricingModel,
      inclusionStatus: item.metadata!.inclusionStatus || 'INCLUDED',
      supplierCost: item.supplierCost,
      costSource: item.metadata!.costSource,
      packageSupplierRate: item.metadata!.packageSupplierRate,
      originalContractedTotal: item.metadata!.contractedTotalSupplierCost,
      specialRequests: item.description,
    }));
    const customer = customers.find(item => item.id === trip.customerId);
    const start = new Date(`${trip.startDate}T00:00:00Z`).getTime();
    const end = new Date(`${trip.endDate}T00:00:00Z`).getTime();
    const durationDays = Math.max(1, Math.round((end - start) / 86_400_000) + 1);
    return {
      leadId: trip.leadId || '', customerId: trip.customerId, customerName: customer?.name || 'Guest',
      customerPhone: customer?.phone, customerEmail: customer?.email, destination: trip.destination,
      tripId: trip.id, travelerCount: trip.travelerCount, adults: trip.adults, children: trip.children,
      durationDays, durationNights: Math.max(0, durationDays - 1), hotels, transports, activities,
      backupAccommodations: backupSelections,
      supplierCostBreakdown: trip.supplierCostBreakdown,
      pricingMode: trip.pricingMode || 'SELLING_PRICE',
      pricingInput: trip.pricingInput ?? trip.totalSellingPrice,
      requiresLowMarginApproval: trip.commercialApproval?.required === true,
      approval: trip.commercialApproval
        ? { ...trip.commercialApproval }
        : { required: false, state: 'NOT_REQUIRED' },
    };
  };

  const createQuote = async (quoteData: QuoteDraftInput): Promise<Quote> => {
    const payload = buildQuoteWritePayload(quoteData, false);

    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const body = await readApiResponse(response);
      const created = body.data as Quote;
      setQuotes(prev => [created, ...prev.filter(quote => quote.id !== created.id)]);
      return created;
    }

    // Explicit demo mode remains local UX state; production always uses the API.
    const linkedTrip = typeof payload.tripId === 'string'
      ? trips.find(trip => trip.id === payload.tripId)
      : undefined;
    const existingTripQuote = linkedTrip
      ? quotes.find(quote => quote.tripId === linkedTrip.id)
      : undefined;
    if (linkedTrip && !isTripCostingFresh(linkedTrip)) {
      throw new Error('Package pricing needs updating before you can create a Quote.');
    }
    if (existingTripQuote && !payload.optionLabel) return existingTripQuote;
    const tripFields = linkedTrip
      ? buildDemoTripQuoteFields(linkedTrip, (quoteData.backupAccommodations || []) as QuoteBackupAccommodation[])
      : {};
    const totalAmount = linkedTrip?.totalSellingPrice ?? (Number(payload.totalAmount) || 0);
    const discountAmount = linkedTrip ? 0 : Number(payload.discountAmount) || 0;
    const finalAmount = Math.max(0, totalAmount - discountAmount);
    const totalSupplierCost = linkedTrip?.totalSupplierCost;
    const newQuoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const existingOptions = linkedTrip ? quotes.filter(quote => quote.tripId === linkedTrip.id && quote.optionId) : [];
    const newQuote: Quote = {
      ...(payload as unknown as Quote),
      ...tripFields,
      id: newQuoteId,
      totalAmount,
      discountAmount,
      finalAmount,
      ...(totalSupplierCost !== undefined ? {
        totalSupplierCost,
        grossProfit: finalAmount - totalSupplierCost,
        grossMargin: finalAmount > 0 ? Number((((finalAmount - totalSupplierCost) / finalAmount) * 100).toFixed(1)) : 0,
        supplierCostSource: {
          type: 'TRIP' as const,
          sourceId: linkedTrip!.id,
          asOf: linkedTrip!.updatedAt,
          costingRevision: Number(linkedTrip!.costingRevision || 0),
        },
      } : {}),
      status: 'DRAFT',
      salesEmployeeId: currentUser.employeeId,
      salesEmployeeName: currentUser.name,
      ...(currentUser.salesTeamId ? { salesTeamId: currentUser.salesTeamId } : {}),
      createdByEmployeeId: currentUser.employeeId,
      updatedByEmployeeId: currentUser.employeeId,
      version: 1,
      versionHistory: [],
      policyVersion: BOOKING_BRIDGE_POLICY_VERSION,
      createdAt: now,
      updatedAt: now,
      isDemo: true,
    };
    if (payload.optionLabel && linkedTrip) {
      const reviewPending = itineraryDays.some(day => day.tripId === linkedTrip.id && day.customerContent?.status === 'REVIEW_NEEDED');
      if (reviewPending) throw new Error('Review the updated customer itinerary before creating a Quote option.');
      newQuote.optionId = newQuoteId;
      newQuote.quoteGroupId = existingOptions[0]?.quoteGroupId || newQuoteId;
      newQuote.optionLabel = String(payload.optionLabel);
      if (payload.customerTitle) newQuote.customerTitle = String(payload.customerTitle);
      newQuote.optionOrder = existingOptions.length + 1;
      newQuote.isRecommended = existingOptions.length === 0;
      newQuote.optionStatus = 'READY';
      newQuote.optionSnapshotCreatedAt = now;
      newQuote.customerPackageSnapshot = buildCustomerPackageProjection(
        newQuote,
        itineraryDays.filter(day => day.tripId === linkedTrip.id),
        linkedTrip,
        now,
      );
    }
    setQuotes(prev => [newQuote, ...prev.filter(quote => quote.id !== newQuote.id && (payload.optionLabel || quote.tripId !== newQuote.tripId))]);
    return newQuote;
  };

  const updateQuote = async (id: string, updates: Partial<Quote>, _createNewVersion = false): Promise<Quote> => {
    const prevQuote = quotes.find(q => q.id === id);
    if (!prevQuote) throw new Error(`Quote ${id} not found`);
    const payload = buildQuoteWritePayload(updates, true);

    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const body = await readApiResponse(response);
      const updated = body.data as Quote;
      setQuotes(prev => prev.map(quote => quote.id === id ? updated : quote));
      return updated;
    }

    const linkedTrip = prevQuote.tripId ? trips.find(trip => trip.id === prevQuote.tripId) : undefined;
    const backups = (updates.backupAccommodations ?? prevQuote.backupAccommodations ?? []) as QuoteBackupAccommodation[];
    const tripFields = linkedTrip ? buildDemoTripQuoteFields(linkedTrip, backups) : {};
    const totalAmount = linkedTrip?.totalSellingPrice ?? (Number(payload.totalAmount ?? prevQuote.totalAmount) || 0);
    const discountAmount = linkedTrip ? 0 : Number(payload.discountAmount ?? prevQuote.discountAmount) || 0;
    const finalAmount = Math.max(0, totalAmount - discountAmount);
    const totalSupplierCost = linkedTrip?.totalSupplierCost ?? prevQuote.totalSupplierCost;
    const updatedQuote: Quote = {
      ...prevQuote,
      ...(payload as Partial<Quote>),
      ...tripFields,
      totalAmount,
      discountAmount,
      finalAmount,
      ...(totalSupplierCost !== undefined ? {
        totalSupplierCost,
        grossProfit: finalAmount - totalSupplierCost,
        grossMargin: finalAmount > 0 ? Number((((finalAmount - totalSupplierCost) / finalAmount) * 100).toFixed(1)) : 0,
        ...(linkedTrip ? {
          supplierCostSource: {
            type: 'TRIP' as const,
            sourceId: linkedTrip.id,
            asOf: linkedTrip.updatedAt,
            costingRevision: Number(linkedTrip.costingRevision || 0),
          },
        } : {}),
      } : {}),
      version: (prevQuote.version || 1) + 1,
      versionHistory: [
        ...(prevQuote.versionHistory || []),
        {
          version: prevQuote.version || 1,
          updatedAt: prevQuote.updatedAt || prevQuote.createdAt,
          updatedBy: currentUser.employeeId,
          totalAmount: prevQuote.totalAmount,
          discountAmount: prevQuote.discountAmount,
          finalAmount: prevQuote.finalAmount,
          status: prevQuote.status,
          notes: prevQuote.notes,
          inclusions: prevQuote.inclusions,
          exclusions: prevQuote.exclusions,
          termsAndConditions: prevQuote.termsAndConditions,
          policyVersion: prevQuote.policyVersion,
          paymentSchedule: prevQuote.paymentSchedule,
          hotels: prevQuote.hotels,
          transports: prevQuote.transports,
          activities: prevQuote.activities,
          backupAccommodations: prevQuote.backupAccommodations,
          totalSupplierCost: prevQuote.totalSupplierCost,
          grossProfit: prevQuote.grossProfit,
          grossMargin: prevQuote.grossMargin,
          supplierCostBreakdown: prevQuote.supplierCostBreakdown,
          pricingMode: prevQuote.pricingMode,
          pricingInput: prevQuote.pricingInput,
          sharedAt: prevQuote.sharedAt,
          sharedByEmployeeId: prevQuote.sharedByEmployeeId,
          shareChannel: prevQuote.shareChannel,
          customerPackageSnapshot: prevQuote.customerPackageSnapshot,
        },
      ],
      updatedByEmployeeId: currentUser.employeeId,
      updatedAt: new Date().toISOString(),
    };
    delete updatedQuote.sharedAt;
    delete updatedQuote.sharedByEmployeeId;
    delete updatedQuote.shareChannel;
    delete updatedQuote.customerPackageSnapshot;
    setQuotes(prev => prev.map(q => q.id === id ? updatedQuote : q));
    return updatedQuote;
  };

  const getCustomerPackage = async (quoteId: string): Promise<CustomerPackageDocument> => {
    const quote = quotes.find(item => item.id === quoteId);
    if (!quote) throw new Error('Save the Quote before opening the customer package.');
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/customer-package`, {
        headers: await authenticatedReadHeaders(currentUser.employeeId),
      });
      const body = await readApiResponse(response);
      return body.data as CustomerPackageDocument;
    }
    if (quote.customerPackageSnapshot && (quote.sharedAt || quote.optionId)) return quote.customerPackageSnapshot;
    if (quote.sharedAt) return buildCustomerPackageProjection(quote, [], null, quote.sharedAt);
    const trip = quote.tripId ? trips.find(item => item.id === quote.tripId) : undefined;
    if (!trip) throw new Error('A customer package requires a persisted Trip-linked Quote.');
    if (!isTripCostingFresh(trip)) {
      throw new Error('Package pricing needs updating before you can preview or share this Quote.');
    }
    if (!Number.isFinite(quote.finalAmount) || quote.finalAmount <= 0) throw new Error('Set and save a positive package selling price first.');
    return buildCustomerPackageProjection(
      quote,
      itineraryDays.filter(day => day.tripId === trip.id),
      trip,
    );
  };

  const shareQuotePackage = async (
    quoteId: string,
    channel: QuoteShareChannel,
    expectedVersion: number,
  ): Promise<QuoteShareResult> => {
    const quote = quotes.find(item => item.id === quoteId);
    if (!quote) throw new Error('Save the Quote before sharing the customer package.');
    if (quote.approval?.required === true && quote.approval.state !== 'APPROVED') {
      throw new Error('This low-margin Quote requires commercial approval before sharing.');
    }
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/share`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ channel, expectedVersion }),
      });
      const body = await readApiResponse(response);
      const result = body.data as QuoteShareResult;
      setQuotes(previous => previous.map(item => item.id === quoteId ? result.quote : item));
      return result;
    }
    if ((quote.version || 1) !== expectedVersion) throw new Error('The Quote changed after this package was opened. Reload before sharing.');
    if (!quote.sharedAt && quote.tripId && itineraryDays.some(day =>
      day.tripId === quote.tripId && day.customerContent?.status === 'REVIEW_NEEDED')) {
      throw new Error('ITINERARY_REVIEW_REQUIRED: Review the updated customer itinerary before sharing this Quote.');
    }
    const customerPackage = await getCustomerPackage(quoteId);
    const now = new Date().toISOString();
    const sharedSnapshot = quote.optionId ? customerPackage : { ...customerPackage, generatedAt: now };
    const updated: Quote = {
      ...quote,
      status: 'SENT',
      sharedAt: now,
      sharedByEmployeeId: currentUser.employeeId,
      shareChannel: channel,
      customerPackageSnapshot: sharedSnapshot,
      ...(quote.optionId ? { optionStatus: 'SHARED' as const } : {}),
      version: (quote.version || 1) + 1,
      versionHistory: [
        ...(quote.versionHistory || []),
        {
          version: quote.version || 1,
          updatedAt: quote.updatedAt || quote.createdAt,
          updatedBy: currentUser.employeeId,
          totalAmount: quote.totalAmount,
          discountAmount: quote.discountAmount,
          finalAmount: quote.finalAmount,
          status: quote.status,
        },
      ],
      updatedAt: now,
      updatedByEmployeeId: currentUser.employeeId,
    };
    setQuotes(previous => previous.map(item => item.id === quoteId ? updated : item));
    logAuditEvent('QUOTE_SHARED', 'QUOTE', quoteId, quote, updated, `Customer package shared by ${currentUser.name}.`);
    return { quote: updated, customerPackage: sharedSnapshot };
  };

  const duplicateQuoteOption = async (
    quoteId: string,
    input: { label: string; customerTitle?: string; totalAmount?: number; discountAmount?: number; validUntil?: string },
  ): Promise<Quote> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/duplicate-option`, {
        method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(input),
      });
      const body = await readApiResponse(response);
      const created = body.data as Quote;
      setQuotes(previous => [created, ...previous]);
      return created;
    }
    const source = quotes.find(quote => quote.id === quoteId);
    if (!source?.optionId || !source.quoteGroupId || !source.customerPackageSnapshot) throw new Error('Only a frozen Quote option can be duplicated.');
    if (quotes.some(quote => quote.quoteGroupId === source.quoteGroupId && quote.optionStatus === 'ACCEPTED')) throw new Error('This option group already has an accepted Booking.');
    const now = new Date().toISOString();
    const id = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const totalAmount = input.totalAmount ?? source.totalAmount;
    const discountAmount = input.discountAmount ?? source.discountAmount;
    const finalAmount = totalAmount - discountAmount;
    if (source.totalSupplierCost !== undefined && finalAmount < source.totalSupplierCost) throw new Error('Selling price cannot be lower than authoritative supplier cost.');
    const group = quotes.filter(quote => quote.quoteGroupId === source.quoteGroupId);
    const created: Quote = {
      ...JSON.parse(JSON.stringify(source)), id, optionId: id, optionLabel: input.label,
      ...(input.customerTitle ? { customerTitle: input.customerTitle } : {}),
      optionOrder: group.length + 1, isRecommended: false, optionStatus: 'READY',
      optionSnapshotCreatedAt: now, status: 'DRAFT', totalAmount, discountAmount, finalAmount,
      ...(source.totalSupplierCost !== undefined ? {
        grossProfit: finalAmount - source.totalSupplierCost,
        grossMargin: finalAmount > 0 ? Number((((finalAmount - source.totalSupplierCost) / finalAmount) * 100).toFixed(1)) : 0,
      } : {}),
      validUntil: input.validUntil || source.validUntil, createdAt: now, updatedAt: now,
      createdByEmployeeId: currentUser.employeeId, updatedByEmployeeId: currentUser.employeeId,
      version: 1, versionHistory: [],
      customerPackageSnapshot: { ...source.customerPackageSnapshot, packageReference: id, packageSellingPrice: finalAmount, generatedAt: now },
    };
    delete created.sharedAt; delete created.sharedByEmployeeId; delete created.shareChannel; delete created.convertedBookingId;
    setQuotes(previous => [created, ...previous]);
    logAuditEvent('QUOTE_OPTION_DUPLICATED', 'QUOTE', id, null, created, `Quote option duplicated by ${currentUser.employeeId}.`);
    return created;
  };

  const updateQuoteOption = async (
    quoteId: string,
    input: { label?: string; customerTitle?: string; totalAmount?: number; discountAmount?: number; validUntil?: string; inclusions?: string[]; exclusions?: string[]; termsAndConditions?: string; paymentSchedule?: Quote['paymentSchedule']; backupAccommodations?: QuoteBackupAccommodation[] },
  ): Promise<Quote> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const requestInput = input.backupAccommodations
        ? { ...input, backupAccommodations: projectBackupAccommodationSelections(input.backupAccommodations) }
        : input;
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/option`, {
        method: 'PATCH', headers: await getAuthHeaders(), body: JSON.stringify(requestInput),
      });
      const body = await readApiResponse(response);
      const updated = body.data as Quote;
      setQuotes(previous => previous.map(quote => quote.id === quoteId ? updated : quote));
      return updated;
    }
    const source = quotes.find(quote => quote.id === quoteId);
    if (!source?.optionId || !source.customerPackageSnapshot) throw new Error('Quote option not found.');
    const now = new Date().toISOString();
    const totalAmount = input.totalAmount ?? source.totalAmount;
    const discountAmount = input.discountAmount ?? source.discountAmount;
    const finalAmount = totalAmount - discountAmount;
    if (source.totalSupplierCost !== undefined && finalAmount < source.totalSupplierCost) throw new Error('Selling price cannot be lower than authoritative supplier cost.');
    const updated: Quote = {
      ...source, optionLabel: input.label || source.optionLabel, customerTitle: input.customerTitle ?? source.customerTitle,
      totalAmount, discountAmount, finalAmount, validUntil: input.validUntil || source.validUntil,
      inclusions: input.inclusions ?? source.inclusions, exclusions: input.exclusions ?? source.exclusions,
      termsAndConditions: input.termsAndConditions ?? source.termsAndConditions,
      paymentSchedule: input.paymentSchedule ?? source.paymentSchedule,
      backupAccommodations: input.backupAccommodations ?? source.backupAccommodations,
      ...(source.totalSupplierCost !== undefined ? {
        grossProfit: finalAmount - source.totalSupplierCost,
        grossMargin: finalAmount > 0 ? Number((((finalAmount - source.totalSupplierCost) / finalAmount) * 100).toFixed(1)) : 0,
      } : {}),
      optionStatus: source.sharedAt ? 'SHARED' : 'READY', version: (source.version || 1) + 1,
      versionHistory: [...(source.versionHistory || []), {
        version: source.version || 1,
        updatedAt: source.updatedAt || source.createdAt,
        updatedBy: source.updatedByEmployeeId || currentUser.employeeId,
        totalAmount: source.totalAmount,
        discountAmount: source.discountAmount,
        finalAmount: source.finalAmount,
        status: source.status,
        hotels: source.hotels,
        transports: source.transports,
        activities: source.activities,
        backupAccommodations: source.backupAccommodations,
        totalSupplierCost: source.totalSupplierCost,
        grossProfit: source.grossProfit,
        grossMargin: source.grossMargin,
        inclusions: source.inclusions,
        exclusions: source.exclusions,
        termsAndConditions: source.termsAndConditions,
        policyVersion: source.policyVersion,
        paymentSchedule: source.paymentSchedule,
        customerPackageSnapshot: source.customerPackageSnapshot,
      }],
      updatedAt: now, updatedByEmployeeId: currentUser.employeeId,
      customerPackageSnapshot: {
        ...source.customerPackageSnapshot, packageSellingPrice: finalAmount,
        inclusions: input.inclusions ?? source.customerPackageSnapshot.inclusions,
        exclusions: input.exclusions ?? source.customerPackageSnapshot.exclusions,
        termsAndConditions: input.termsAndConditions ?? source.customerPackageSnapshot.termsAndConditions,
        policyVersion: source.customerPackageSnapshot.policyVersion,
        paymentSchedule: input.paymentSchedule ?? source.customerPackageSnapshot.paymentSchedule,
      },
    };
    delete updated.sharedAt; delete updated.sharedByEmployeeId; delete updated.shareChannel;
    setQuotes(previous => previous.map(quote => quote.id === quoteId ? updated : quote));
    logAuditEvent('QUOTE_OPTION_UPDATED', 'QUOTE', quoteId, source, updated, `Quote option updated by ${currentUser.employeeId}.`);
    return updated;
  };

  const recommendQuoteOption = async (quoteId: string): Promise<Quote> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/recommend-option`, { method: 'POST', headers: await getAuthHeaders(), body: '{}' });
      const body = await readApiResponse(response);
      const updated = body.data as Quote;
      setQuotes(previous => previous.map(quote => quote.quoteGroupId === updated.quoteGroupId ? { ...quote, isRecommended: quote.id === quoteId } : quote));
      return updated;
    }
    const selected = quotes.find(quote => quote.id === quoteId);
    if (!selected?.quoteGroupId) throw new Error('Quote option not found.');
    const updated = { ...selected, isRecommended: true };
    setQuotes(previous => previous.map(quote => quote.quoteGroupId === selected.quoteGroupId ? { ...quote, isRecommended: quote.id === quoteId } : quote));
    logAuditEvent('QUOTE_OPTION_RECOMMENDED', 'QUOTE', quoteId, selected, updated, `Quote option recommended by ${currentUser.employeeId}.`);
    return updated;
  };

  const refreshQuoteOptionFromTrip = async (quoteId: string): Promise<Quote> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/refresh-option`, { method: 'POST', headers: await getAuthHeaders(), body: '{}' });
      const body = await readApiResponse(response);
      const updated = body.data as Quote;
      setQuotes(previous => previous.map(quote => quote.id === quoteId ? updated : quote));
      return updated;
    }
    const source = quotes.find(quote => quote.id === quoteId);
    const trip = source?.tripId ? trips.find(item => item.id === source.tripId) : undefined;
    if (!source?.optionId || !trip) throw new Error('A Trip-linked Quote option is required.');
    if (!isTripCostingFresh(trip)) throw new Error('Package pricing needs updating before this option can be refreshed.');
    if (itineraryDays.some(day => day.tripId === trip.id && day.customerContent?.status === 'REVIEW_NEEDED')) throw new Error('Review the updated customer itinerary before refreshing this option.');
    const now = new Date().toISOString();
    const tripFields = buildDemoTripQuoteFields(trip, source.backupAccommodations || []);
    const totalAmount = trip.totalSellingPrice || source.totalAmount;
    const totalSupplierCost = trip.totalSupplierCost;
    const refreshed: Quote = {
      ...source, ...tripFields, totalAmount, discountAmount: 0, finalAmount: totalAmount,
      totalSupplierCost, grossProfit: totalAmount - totalSupplierCost,
      grossMargin: totalAmount > 0 ? Number((((totalAmount - totalSupplierCost) / totalAmount) * 100).toFixed(1)) : 0,
      supplierCostSource: { type: 'TRIP', sourceId: trip.id, asOf: trip.updatedAt, costingRevision: Number(trip.costingRevision || 0) },
      optionStatus: 'READY', optionSnapshotCreatedAt: now, version: (source.version || 1) + 1,
      updatedAt: now, updatedByEmployeeId: currentUser.employeeId,
    };
    refreshed.customerPackageSnapshot = buildCustomerPackageProjection(refreshed, itineraryDays.filter(day => day.tripId === trip.id), trip, now);
    delete refreshed.sharedAt; delete refreshed.sharedByEmployeeId; delete refreshed.shareChannel;
    setQuotes(previous => previous.map(quote => quote.id === quoteId ? refreshed : quote));
    logAuditEvent('QUOTE_OPTION_UPDATED', 'QUOTE', quoteId, source, refreshed, `Quote option refreshed by ${currentUser.employeeId}.`);
    return refreshed;
  };

  const reorderQuoteOptions = async (groupId: string, optionIds: string[]): Promise<Quote[]> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/groups/${encodeURIComponent(groupId)}/reorder`, {
        method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ optionIds }),
      });
      const body = await readApiResponse(response);
      const updated = body.data as Quote[];
      const byId = new Map(updated.map(quote => [quote.id, quote]));
      setQuotes(previous => previous.map(quote => byId.get(quote.id) || quote));
      return updated;
    }
    const group = quotes.filter(quote => quote.quoteGroupId === groupId);
    if (optionIds.length !== group.length || new Set(optionIds).size !== group.length) throw new Error('Every option must appear exactly once.');
    const updated = group.map(quote => ({ ...quote, optionOrder: optionIds.indexOf(quote.optionId!) + 1 }));
    const byId = new Map(updated.map(quote => [quote.id, quote]));
    setQuotes(previous => previous.map(quote => byId.get(quote.id) || quote));
    return updated;
  };

  const getQuoteOptionComparison = async (groupId: string): Promise<CustomerQuoteComparison> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/groups/${encodeURIComponent(groupId)}/customer-comparison`, { headers: await authenticatedReadHeaders(currentUser.employeeId) });
      const body = await readApiResponse(response);
      return body.data as CustomerQuoteComparison;
    }
    const group = quotes.filter(quote => quote.quoteGroupId === groupId && quote.customerPackageSnapshot).sort((a, b) => (a.optionOrder || 0) - (b.optionOrder || 0));
    if (!group.length) throw new Error('Quote option group not found.');
    return {
      quoteGroupId: groupId, customerName: group[0].customerName, destination: group[0].destination,
      title: group[0].customerTitle || `${group[0].destination} Package Options`,
      options: group.map(quote => ({
        optionId: quote.optionId!, quoteId: quote.id, label: quote.optionLabel || 'Package option',
        ...(quote.customerTitle ? { customerTitle: quote.customerTitle } : {}), order: quote.optionOrder || 0,
        recommended: quote.isRecommended === true, status: quote.optionStatus || 'READY',
        packageSellingPrice: quote.customerPackageSnapshot!.packageSellingPrice, currency: quote.customerPackageSnapshot!.currency,
        travelerCount: quote.travelerCount, durationDays: quote.durationDays, durationNights: quote.durationNights,
        hotelHighlights: quote.customerPackageSnapshot!.hotels.map(hotel => `${hotel.hotelName} — ${hotel.roomCategoryName}`),
        transportHighlights: quote.customerPackageSnapshot!.transports.map(item => item.vehicleName),
        includedActivityHighlights: quote.customerPackageSnapshot!.activities.filter(item => item.inclusionStatus !== 'OPTIONAL' && item.inclusionStatus !== 'NOT_INCLUDED').map(item => item.activityName),
        optionalActivityHighlights: quote.customerPackageSnapshot!.activities.filter(item => item.inclusionStatus === 'OPTIONAL').map(item => item.activityName),
        validUntil: quote.validUntil,
      })),
    };
  };

  const assertDemoShareScope = (salesEmployeeId?: string, salesTeamId?: string) => {
    if (['Founder', 'Admin'].includes(currentUser.role)) return;
    if (currentUser.role === 'Sales Executive' && salesEmployeeId === currentUser.employeeId) return;
    if (currentUser.role === 'Sales Manager' && salesTeamId && salesTeamId === currentUser.salesTeamId) return;
    throw new Error('You do not have access to manage this customer share.');
  };

  const createCustomerShare = async (
    groupId: string,
    expiresInDays: CustomerShareExpiryDays | null,
  ): Promise<CustomerShareCreateResult> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/groups/${encodeURIComponent(groupId)}/customer-shares`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ expiresInDays }),
      });
      const body = await readApiResponse(response);
      return body.data as CustomerShareCreateResult;
    }

    const group = quotes
      .filter(quote => quote.quoteGroupId === groupId)
      .sort((left, right) => (left.optionOrder || 0) - (right.optionOrder || 0));
    if (!group.length) throw new Error('Quote option group not found.');
    assertDemoShareScope(group[0].salesEmployeeId, group[0].salesTeamId);
    if (group.filter(option => option.isRecommended).length !== 1) throw new Error('Choose exactly one recommended option before sharing.');
    for (const option of group) {
      if (!option.optionId || !option.customerPackageSnapshot) throw new Error('Every option needs a frozen customer snapshot before sharing.');
      if (['ACCEPTED', 'SUPERSEDED', 'DECLINED'].includes(option.optionStatus || '')) throw new Error('This Quote Group can no longer be shared.');
      if (option.approval?.required === true && option.approval.state !== 'APPROVED') throw new Error('Commercial approval is required before sharing this package.');
      const trip = option.tripId ? trips.find(candidate => candidate.id === option.tripId) : undefined;
      if (!trip || !isTripCostingFresh(trip)) throw new Error('Package pricing needs updating before you can create a customer link.');
      if (option.supplierCostSource?.costingRevision !== undefined && option.supplierCostSource.costingRevision !== Number(trip.costingRevision || 0)) {
        throw new Error('Refresh every option from the current reviewed Package before creating a new customer link.');
      }
      if (itineraryDays.some(day => day.tripId === trip.id && day.customerContent?.status === 'REVIEW_NEEDED')) {
        throw new Error('Review the updated customer itinerary before sharing this package.');
      }
    }
    const now = new Date().toISOString();
    const token = generateDemoShareToken();
    const tokenHash = await hashDemoShareToken(token);
    const existing = readDemoCustomerShares();
    const version = existing.filter(record => record.quoteGroupId === groupId)
      .reduce((highest, record) => Math.max(highest, record.version), 0) + 1;
    const shareId = `share-${crypto.randomUUID()}`;
    const record: DemoCustomerShareRecord = {
      shareId,
      quoteGroupId: groupId,
      version,
      status: 'ACTIVE',
      createdByName: currentUser.name,
      createdAt: now,
      ...(expiresInDays ? { expiresAt: new Date(Date.parse(now) + expiresInDays * 86_400_000).toISOString() } : {}),
      viewCount: 0,
      tokenHash,
      snapshot: buildCustomerSharePublicView(group, now),
      salesEmployeeId: group[0].salesEmployeeId!,
      ...(group[0].salesTeamId ? { salesTeamId: group[0].salesTeamId } : {}),
    };
    writeDemoCustomerShares([...existing, record]);
    setQuotes(previous => previous.map(option => option.quoteGroupId === groupId ? {
      ...option,
      status: 'SENT',
      optionStatus: 'SHARED',
      sharedAt: now,
      sharedByEmployeeId: currentUser.employeeId,
      shareChannel: 'DOCUMENT',
      version: (option.version || 1) + 1,
      updatedAt: now,
      updatedByEmployeeId: currentUser.employeeId,
    } : option));
    logAuditEvent('CUSTOMER_SHARE_CREATED', 'CUSTOMER_SHARE', shareId, null, {
      shareId,
      quoteGroupId: groupId,
      version,
      ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    }, `Secure customer link created by ${currentUser.employeeId}.`);
    return { share: demoShareHistory(record, now), publicPath: `/quote/share/${token}` };
  };

  const listCustomerShares = async (groupId: string): Promise<CustomerShareHistoryItem[]> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/groups/${encodeURIComponent(groupId)}/customer-shares`, {
        headers: await authenticatedReadHeaders(currentUser.employeeId),
      });
      const body = await readApiResponse(response);
      return body.data as CustomerShareHistoryItem[];
    }
    const group = quotes.filter(quote => quote.quoteGroupId === groupId);
    if (!group.length) throw new Error('Quote option group not found.');
    assertDemoShareScope(group[0].salesEmployeeId, group[0].salesTeamId);
    const now = new Date().toISOString();
    return readDemoCustomerShares()
      .filter(record => record.quoteGroupId === groupId)
      .map(record => demoShareHistory(record, now))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  };

  const revokeCustomerShare = async (shareId: string): Promise<CustomerShareHistoryItem> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/customer-shares/${encodeURIComponent(shareId)}/revoke`, {
        method: 'POST', headers: await getAuthHeaders(), body: '{}',
      });
      const body = await readApiResponse(response);
      return body.data as CustomerShareHistoryItem;
    }
    const records = readDemoCustomerShares();
    const index = records.findIndex(record => record.shareId === shareId);
    if (index < 0) throw new Error('Customer share not found.');
    const stored = records[index];
    assertDemoShareScope(stored.salesEmployeeId, stored.salesTeamId);
    if (stored.status === 'REVOKED') return demoShareHistory(stored);
    const now = new Date().toISOString();
    const updated: DemoCustomerShareRecord = {
      ...stored, status: 'REVOKED', revokedAt: now, revokedByEmployeeId: currentUser.employeeId,
    };
    records[index] = updated;
    writeDemoCustomerShares(records);
    logAuditEvent('CUSTOMER_SHARE_REVOKED', 'CUSTOMER_SHARE', shareId,
      { shareId, quoteGroupId: stored.quoteGroupId, status: stored.status },
      { shareId, quoteGroupId: stored.quoteGroupId, status: 'REVOKED', revokedAt: now },
      `Customer link revoked by ${currentUser.employeeId}.`);
    return demoShareHistory(updated, now);
  };

  const downloadCustomerSharePdf = async (shareId: string): Promise<CustomerSharePdfDownload> => {
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/customer-shares/${encodeURIComponent(shareId)}/pdf`, {
        headers: await authenticatedReadHeaders(currentUser.employeeId),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `PDF generation failed (${response.status}).`);
      }
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || 'Booking-Bridge-Holiday-Package.pdf';
      return { blob: await response.blob(), filename };
    }
    const records = readDemoCustomerShares();
    const index = records.findIndex(record => record.shareId === shareId);
    if (index < 0) throw new Error('Customer share not found.');
    const stored = records[index];
    assertDemoShareScope(stored.salesEmployeeId, stored.salesTeamId);
    const now = new Date().toISOString();
    const updated: DemoCustomerShareRecord = {
      ...stored,
      pdfGeneratedCount: (stored.pdfGeneratedCount || 0) + 1,
      lastPdfGeneratedAt: now,
    };
    records[index] = updated;
    writeDemoCustomerShares(records);
    logAuditEvent('QUOTE_PDF_GENERATED', 'CUSTOMER_SHARE', shareId, null, {
      shareId, quoteGroupId: stored.quoteGroupId, version: stored.version, channel: 'PDF', generatedAt: now,
    }, `Customer-safe PDF generated from Quote Group V${stored.version}.`);
    const bytes = buildCustomerSharePdf(stored.snapshot, stored.version);
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return {
      blob: new Blob([data], { type: 'application/pdf' }),
      filename: customerSharePdfFilename(stored.snapshot, new Date(stored.createdAt).getUTCFullYear()),
    };
  };

  const prepareCustomerShareDelivery = async (
    shareId: string,
    channel: CustomerDeliveryChannel,
    publicUrl: string,
  ): Promise<CustomerDeliveryPreparation> => {
    let parsed: URL;
    try {
      parsed = new URL(publicUrl);
    } catch {
      throw new Error('Create a valid customer link before preparing delivery.');
    }
    const token = parsed.pathname.match(/^\/quote\/share\/([A-Za-z0-9_-]{43})\/?$/)?.[1];
    if (!token) throw new Error('Create a valid customer link before preparing delivery.');
    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/customer-shares/${encodeURIComponent(shareId)}/deliveries/prepare`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ channel, token }),
      });
      const body = await readApiResponse(response);
      return body.data as CustomerDeliveryPreparation;
    }
    const records = readDemoCustomerShares();
    const index = records.findIndex(record => record.shareId === shareId);
    if (index < 0) throw new Error('Customer share not found.');
    const stored = records[index];
    assertDemoShareScope(stored.salesEmployeeId, stored.salesTeamId);
    const now = new Date().toISOString();
    const status = effectiveDemoShareStatus(stored, now);
    if (status !== 'ACTIVE') throw new Error(`This customer link is ${status.toLowerCase()}. Create a fresh link before delivery.`);
    if (parsed.origin !== window.location.origin || await hashDemoShareToken(token) !== stored.tokenHash) {
      throw new Error('The selected secure link does not match this Quote version.');
    }
    const quote = quotes.find(candidate => candidate.quoteGroupId === stored.quoteGroupId);
    const customer = quote?.customerId ? customers.find(candidate => candidate.id === quote.customerId) : undefined;
    const prepared = buildCustomerDeliveryPreparation({
      shareId,
      quoteGroupId: stored.quoteGroupId,
      version: stored.version,
      channel,
      snapshot: stored.snapshot,
      customerLink: publicUrl,
      customerPhone: customer?.whatsApp || customer?.phone || quote?.customerPhone,
      customerEmail: customer?.email || quote?.customerEmail,
      preparedAt: now,
    });
    const updated: DemoCustomerShareRecord = {
      ...stored,
      ...(channel === 'WHATSAPP'
        ? { whatsappPreparedCount: (stored.whatsappPreparedCount || 0) + 1, lastWhatsappPreparedAt: now }
        : { emailPreparedCount: (stored.emailPreparedCount || 0) + 1, lastEmailPreparedAt: now }),
    };
    records[index] = updated;
    writeDemoCustomerShares(records);
    const action = channel === 'WHATSAPP' ? 'WHATSAPP_SHARE_PREPARED' : 'EMAIL_SHARE_PREPARED';
    logAuditEvent(action, 'CUSTOMER_SHARE', shareId, null, {
      shareId,
      quoteGroupId: stored.quoteGroupId,
      version: stored.version,
      channel,
      preparedAt: now,
      recipientAvailable: prepared.recipientAvailable,
    }, `${channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'} delivery prepared; external sending is not claimed.`);
    return prepared;
  };

  const createBooking = async (bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt' | 'bookingReference'>): Promise<Booking> => {
    if (!APP_CONFIG.DEMO_MODE) {
      throw new Error('Production Booking creation is server-authoritative. Use an authenticated Booking workflow API.');
    }
    const newBooking: Booking = {
      ...bookingData,
      id: `book-${Date.now()}`,
      bookingReference: `BB-${Math.floor(100000 + Math.random() * 900000)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: APP_CONFIG.DEMO_MODE
    };

    setBookings(prev => [newBooking, ...prev]);
    logAuditEvent('BOOKING_CREATED', 'BOOKING', newBooking.id, null, newBooking, `Booking ${newBooking.bookingReference} confirmed for ₹${newBooking.totalAmount.toLocaleString('en-IN')}`);

    return newBooking;
  };

  const updateBooking = async (id: string, updates: Partial<Booking>) => {
    if (!APP_CONFIG.DEMO_MODE) {
      throw new Error('Production Booking updates are server-authoritative. Use an authenticated Booking workflow API.');
    }
    const prevBooking = bookings.find(b => b.id === id);

    setBookings(prev => prev.map(b => (b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b)));
    logAuditEvent('BOOKING_UPDATED', 'BOOKING', id, prevBooking, updates, `Updated booking #${id}`);

  };

  const convertQuoteToBooking = async (quoteId: string): Promise<Booking> => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) throw new Error(`Quote ${quoteId} not found`);

    if (!APP_CONFIG.DEMO_MODE) {
      const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/convert-to-booking`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({}),
      });
      const body = await readApiResponse(response);
      const booking = body.booking as Booking;
      setBookings(prev => prev.some(item => item.id === booking.id) ? prev : [booking, ...prev]);
      setQuotes(prev => prev.map(item => quote.quoteGroupId && item.quoteGroupId === quote.quoteGroupId
        ? item.id === quoteId
          ? { ...item, status: 'ACCEPTED', optionStatus: 'ACCEPTED', convertedBookingId: booking.id, updatedAt: new Date().toISOString() }
          : { ...item, optionStatus: 'SUPERSEDED', updatedAt: new Date().toISOString() }
        : item.id === quoteId
          ? { ...item, status: 'ACCEPTED', convertedBookingId: booking.id, updatedAt: new Date().toISOString() }
          : item));
      return booking;
    }

    const trip = quote.tripId ? trips.find(t => t.id === quote.tripId) : null;

    const booking = await createBooking({
      quoteId: quote.id,
      quoteVersion: quote.version,
      tripId: quote.tripId || '',
      customerId: quote.customerId,
      customerName: quote.customerName,
      leadId: quote.leadId,
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      totalSellingPrice: quote.finalAmount,
      totalAmount: quote.finalAmount,
      amountReceived: 0,
      amountPending: quote.finalAmount,
      travelStartDate: trip?.startDate || new Date().toISOString().split('T')[0],
      travelEndDate: trip?.endDate || new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
      assignedSalesEmployeeId: quote.salesEmployeeId || currentUser.employeeId,
      salesTeamId: quote.salesTeamId,
      assignedOperationsEmployeeId: 'emp-05',
      ...(quote.quoteGroupId ? { quoteGroupId: quote.quoteGroupId } : {}),
      ...(quote.optionId ? { quoteOptionId: quote.optionId } : {}),
      ...(quote.customerPackageSnapshot ? { customerPackageSnapshot: quote.customerPackageSnapshot } : {}),
    });

    const now = new Date().toISOString();
    localStorage.setItem('bb_booking_accommodations', JSON.stringify((quote.hotels || []).map((item, index) => ({
      id: `bacc-${booking.id}-${index}`, bookingId: booking.id, tripId: booking.tripId,
      customerId: booking.customerId, sourceQuoteServiceId: item.id,
      propertyId: item.propertyId, propertyName: item.hotelName,
      roomCategoryId: item.roomCategoryId, roomCategoryName: item.roomType,
      mealPlan: item.mealPlan, checkInDate: item.checkInDate, checkOutDate: item.checkOutDate,
      nightsCount: item.nights, roomsCount: item.roomsCount || item.rooms || 1,
      adultsCount: item.adultsCount || quote.adults || 1, childrenCount: item.childrenCount || quote.children || 0,
      confirmationStatus: 'REQUESTED', voucherStatus: 'PENDING', schemaVersion: '2B-5', createdAt: now, updatedAt: now,
    }))));
    localStorage.setItem('bb_booking_transports', JSON.stringify((quote.transports || []).map((item, index) => ({
      id: `btrans-${booking.id}-${index}`, bookingId: booking.id, tripId: booking.tripId,
      customerId: booking.customerId, sourceQuoteServiceId: item.id,
      vehicleCategoryId: item.vehicleCategoryId, vehicleCategoryName: item.vehicleType,
      routeId: item.transportRouteId, routeName: item.route, serviceDate: item.serviceDate,
      daysCount: item.days, passengerCount: item.passengerCount || quote.travelerCount,
      confirmationStatus: 'REQUESTED', voucherStatus: 'PENDING', schemaVersion: '2B-5', createdAt: now, updatedAt: now,
    }))));
    localStorage.setItem('bb_booking_activities', JSON.stringify((quote.activities || []).map((item, index) => ({
      id: `bact-${booking.id}-${index}`, bookingId: booking.id, tripId: booking.tripId,
      customerId: booking.customerId, sourceQuoteServiceId: item.id,
      activityMasterId: item.activityMasterId || item.activityId, activityName: item.activityName || item.name,
      serviceDate: item.serviceDate || item.date, participantCount: item.pax,
      confirmationStatus: 'REQUESTED', voucherStatus: 'PENDING', schemaVersion: '2B-5', createdAt: now, updatedAt: now,
    }))));

    if (quote.quoteGroupId) {
      setQuotes(previous => previous.map(item => item.quoteGroupId === quote.quoteGroupId
        ? item.id === quote.id
          ? { ...item, status: 'ACCEPTED', optionStatus: 'ACCEPTED', convertedBookingId: booking.id }
          : { ...item, optionStatus: 'SUPERSEDED' }
        : item));
    } else {
      await updateQuote(quote.id, { status: 'ACCEPTED' });
    }

    if (trip) {
      await updateTrip(trip.id, { status: 'BOOKED' });
    }

    if (quote.leadId) {
      await updateLeadStatus(quote.leadId, 'CONVERTED');
    }

    logAuditEvent('QUOTE_CONVERTED_TO_BOOKING', 'QUOTE', quote.id, { status: quote.status }, { status: 'ACCEPTED', bookingId: booking.id }, `Quote converted to confirmed booking ${booking.bookingReference}`);

    return booking;
  };

  // Approvals
  const approveAction = async (approvalId: string, feedback?: string) => {
    if (!APP_CONFIG.DEMO_MODE) throw new Error('Production approvals must use the authoritative Needs Attention API.');
    const approval = approvals.find(a => a.id === approvalId);
    if (!approval) return;

    setApprovals(prev =>
      prev.map(a => (a.id === approvalId ? { ...a, status: 'APPROVED', reviewedBy: currentUser.name, reviewedByName: currentUser.name, reviewedAt: new Date().toISOString(), feedback } : a))
    );

    if (approval.actionId) {
      setAiActions(prev =>
        prev.map(act => (act.id === approval.actionId ? { ...act, status: 'APPROVED', approvedBy: currentUser.id, approvedByName: currentUser.name, approvedAt: new Date().toISOString() } : act))
      );
    }

    logAuditEvent('APPROVAL_GRANTED', 'APPROVAL', approvalId, null, approval.proposedData || approval.details, `Approved by ${currentUser.name}. ${feedback || ''}`);
  };

  const rejectAction = async (approvalId: string, feedback?: string) => {
    if (!APP_CONFIG.DEMO_MODE) throw new Error('Production approvals must use the authoritative Needs Attention API.');
    const approval = approvals.find(a => a.id === approvalId);
    if (!approval) return;

    setApprovals(prev =>
      prev.map(a => (a.id === approvalId ? { ...a, status: 'REJECTED', reviewedBy: currentUser.name, reviewedByName: currentUser.name, reviewedAt: new Date().toISOString(), feedback } : a))
    );

    if (approval.actionId) {
      setAiActions(prev =>
        prev.map(act => (act.id === approval.actionId ? { ...act, status: 'REJECTED' } : act))
      );
    }

    logAuditEvent('APPROVAL_REJECTED', 'APPROVAL', approvalId, null, null, `Rejected by ${currentUser.name}: ${feedback || 'Declined'}`);
  };

  const submitForApproval = async (itemData: Omit<ApprovalItem, 'id' | 'createdAt' | 'status'>): Promise<ApprovalItem> => {
    if (!APP_CONFIG.DEMO_MODE) throw new Error('Production approval requests must be created by an authoritative domain workflow.');
    const newItem: ApprovalItem = {
      ...itemData,
      id: `appr-${Date.now()}`,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    setApprovals(prev => [newItem, ...prev]);
    logAuditEvent('APPROVAL_REQUESTED', 'APPROVAL', newItem.id, null, newItem, `Requested review by ${newItem.requiresRole || 'Management'}`);
    return newItem;
  };

  const dismissRecommendation = async (recId: string) => {
    setRecommendations(prev =>
      prev.map(r => (r.id === recId ? { ...r, status: 'DISMISSED' } : r))
    );
  };

  const acceptRecommendation = async (recId: string) => {
    setRecommendations(prev =>
      prev.map(r => (r.id === recId ? { ...r, status: 'ACCEPTED' } : r))
    );
  };

  // Secure authenticated headers for server calls
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    return authenticatedMutationHeaders(currentUser.employeeId);
  };

  // Server AI Calls
  const runSalesAiAnalysis = async (leadId: string): Promise<SalesAiAnalysisResult> => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) throw new Error('Lead not found');

    const leadMessages = messages.filter(m => m.conversationId === `demo-conv-01` || m.conversationId === leadId);
    const headers = await getAuthHeaders();

    const response = await fetch('/api/ai/sales-analyze', {
      method: 'POST',
      headers,
      body: JSON.stringify({ lead, messages: leadMessages })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: Failed to analyze lead`);
    }

    const data = await response.json();
    const result: SalesAiAnalysisResult = data.data;

    // Update lead score and reasoning in state
    updateLead(leadId, {
      leadScore: result.leadScore,
      scoreReasoning: result.summary
    });

    logAuditEvent('AI_LEAD_ANALYSIS_COMPLETED', 'LEAD', leadId, { score: lead.leadScore }, { score: result.leadScore, recommendations: result.recommendedAction }, 'Sales AI completed real-time analysis');

    return result;
  };

  const runMarketingStrategy = async (destination: string, season: string, objective: string): Promise<MarketingAiStrategyResult> => {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/ai/marketing-strategy', {
      method: 'POST',
      headers,
      body: JSON.stringify({ destination, targetMonthOrSeason: season, primaryObjective: objective })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const correlation = typeof data.correlationId === 'string' ? ` Reference: ${data.correlationId}.` : '';
      const message = typeof data.error === 'string' ? data.error : 'Marketing AI is unavailable.';
      throw new Error(`${message}${correlation}`);
    }
    if (!data?.success || !data?.data) throw new Error('Marketing AI returned an invalid response. Please retry.');
    return data.data as MarketingAiStrategyResult;
  };

  const runMarketingAiGenerate = async (params: MarketingAiCreativeBrief): Promise<MarketingAiGenerateResult> => {
    const objective = [params.objective, `Audience: ${params.targetAudience}`, `Tone: ${params.tone}`, `Focus: ${params.specificFocus}`].join('\n');
    const strategyResult = await runMarketingStrategy(params.destination, 'Current planning period', objective);
    return buildMarketingCreativeDraft(strategyResult);
  };

  const askCommandCenterAi = async (question: string) => {
    const contextData = {
      totalLeads: leads.length,
      leadStatuses: leads.reduce((acc: any, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {}),
      highPriorityLeads: leads.filter(l => l.priority === 'HOT').map(l => ({ name: l.customerName, dest: l.destination, budget: l.budget, status: l.status })),
      pendingTasks: tasks.filter(t => t.status !== 'COMPLETED').map(t => ({ title: t.title, assignedTo: t.assignedToName, dueAt: t.dueAt, priority: t.priority })),
      pendingApprovals: approvals.filter(a => a.status === 'PENDING').map(a => ({ title: a.title, risk: a.riskLevel, summary: a.summary })),
      openQuotesCount: quotes.filter(q => q.status === 'SENT' || q.status === 'DRAFT').length
    };

    const headers = await getAuthHeaders();
    const response = await fetch('/api/ai/command-center', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        question,
        contextData
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: AI Command Center error`);
    }

    const data = await response.json();
    return data.data;
  };

  // Demo Controls
  const seedDemoData = () => {
    assertDemoControlsAllowed(APP_CONFIG.DEMO_MODE);
    writeDemoCustomerShares([]);
    setLeads(DEMO_LEADS);
    setCustomers(DEMO_CUSTOMERS);
    setCompanies(DEMO_COMPANIES);
    setTasks(DEMO_TASKS);
    setConversations(DEMO_CONVERSATIONS);
    setMessages(DEMO_MESSAGES);
    setQuotes(DEMO_QUOTES);
    setBookings(DEMO_BOOKINGS);
    setRecommendations(DEMO_RECOMMENDATIONS);
    setAiActions(DEMO_ACTIONS);
    setApprovals(DEMO_APPROVALS);
    setAuditLogs(DEMO_AUDIT_LOGS);
    setContentCalendar(DEMO_CONTENT_CALENDAR);
    logAuditEvent('DEMO_DATA_SEEDED', 'SYSTEM', 'system-demo-seed', null, null, 'Demo data re-seeded by user');
  };

  const clearDemoData = () => {
    assertDemoControlsAllowed(APP_CONFIG.DEMO_MODE);
    writeDemoCustomerShares([]);
    setLeads(prev => prev.filter(l => !l.isDemo));
    setCustomers(prev => prev.filter(c => !c.isDemo));
    setCompanies(prev => prev.filter(c => !c.isDemo));
    setTasks(prev => prev.filter(t => !t.isDemo));
    setConversations(prev => prev.filter(c => !c.isDemo));
    setMessages(prev => prev.filter(m => !m.id.startsWith('msg-')));
    setQuotes(prev => prev.filter(q => !q.isDemo));
    setBookings(prev => prev.filter(b => !b.isDemo));
    setRecommendations(prev => prev.filter(r => !r.isDemo));
    setAiActions(prev => prev.filter(a => !a.isDemo));
    setApprovals(prev => prev.filter(a => !a.id.includes('demo')));
    setContentCalendar(prev => prev.filter(c => c.id.startsWith('content-custom')));
    logAuditEvent('DEMO_DATA_CLEARED', 'SYSTEM', 'system-demo-clear', null, null, 'Demo data purged from active views');
  };

  return (
    <DataContext.Provider
      value={{
        leads,
        customers,
        companies,
        tasks,
        conversations,
        messages,
        quotes,
        bookings,
        packages,
        recommendations,
        aiActions,
        approvals,
        auditLogs,
        integrations,
        contentCalendar,
        marketingPillars,
        campaigns,
        aiAgents,
        trips,
        itineraryDays,
        hotels,
        hotelRooms,
        transports,
        drivers,
        activities,
        suppliers,
        vouchers,
        accommodationProperties,
        roomCategories,
        ratePeriods,
        negotiatedRates,
        vehicleCategories,
        destinations,
        transportRoutes,
        transportRatePeriods,
        transportSupplements,
        activityMasters,
        activityRatePeriods,
        addTransportRatePeriod,
        updateTransportRatePeriod,
        deleteTransportRatePeriod,
        addTransportSupplement,
        updateTransportSupplement,
        deleteTransportSupplement,
        addActivityMaster,
        updateActivityMaster,
        deleteActivityMaster,
        addActivityRatePeriod,
        updateActivityRatePeriod,
        deleteActivityRatePeriod,
        addAccommodationProperty,
        updateAccommodationProperty,
        createTrip,
        createOrResumeLeadTrip,
        updateTrip,
        addItineraryDay,
        updateItineraryDay,
        composeItineraryDayCustomerContent,
        reviewItineraryDayCustomerContent,
        deleteItineraryDay,
        addItineraryItem,
        updateItineraryItem,
        deleteItineraryItem,
        loadTripItinerary,
        recalculateTripCost,
        reconcileLeadTrip,
        createLead,
        updateLead,
        updateLeadStatus,
        addLeadNote,
        assignLead,
        loadLead,
        recordLeadInteraction,
        loadLeadConversation,
        addLeadConversationEntry,
        loadLeadWhatsAppContext,
        sendLeadWhatsApp,
        retryLeadWhatsApp,
        listUnresolvedWhatsApp,
        linkUnresolvedWhatsApp,
        createCustomer,
        updateCustomer,
        createTask,
        toggleTaskStatus,
        createContentItem,
        sendMessage,
        createQuote,
        updateQuote,
        convertQuoteToBooking,
        getQuoteBackupAccommodationOptions,
        getCustomerPackage,
        shareQuotePackage,
        duplicateQuoteOption,
        updateQuoteOption,
        recommendQuoteOption,
        refreshQuoteOptionFromTrip,
        reorderQuoteOptions,
        getQuoteOptionComparison,
        createCustomerShare,
        listCustomerShares,
        revokeCustomerShare,
        downloadCustomerSharePdf,
        prepareCustomerShareDelivery,
        createBooking,
        updateBooking,
        approveAction,
        rejectAction,
        approveApproval: approveAction,
        rejectApproval: rejectAction,
        submitForApproval,
        dismissRecommendation,
        acceptRecommendation,
        runSalesAiAnalysis,
        runMarketingStrategy,
        runMarketingAiGenerate,
        askCommandCenterAi,
        queryCommandCenter: askCommandCenterAi,
        seedDemoData,
        clearDemoData,
        isLoading,
        dataLoadErrors
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
