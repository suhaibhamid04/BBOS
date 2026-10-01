import React, { createContext, useContext, useState, useEffect } from 'react';
import { APP_CONFIG } from '../config';
import {
  CustomerRepo, CompanyRepo, ConversationRepo, MessageRepo,
  TaskRepo, PackageRepo, AuditLogRepo, AiRecommendationRepo,
  AiActionRepo, ItineraryDayRepo, HotelRepo, HotelRoomRepo,
  HotelBookingRepo, TransportRepo, DriverRepo, ActivityRepo, ActivityBookingRepo,
  VoucherRepo,
  NegotiatedRateRepo,
  PropertyPhotoRepo, RateHistoryRepo,
  DestinationRepo, TransportRouteRepo
} from '../services/db/repositories';
import { inventoryApi } from '../services/inventory/inventoryApi';
import { authenticatedMutationHeaders, authenticatedReadHeaders } from '../services/auth/authenticatedApi';
import { calculateStayTotal } from '../services/accommodationEngine';
import { calculateTransportCost } from '../services/transportEngine';
import { calculateActivityCost } from '../services/activityEngine';
import { buildCustomerPackageProjection } from '../services/quote/customerPackage';
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
  QuoteShareChannel,
  QuoteShareResult
} from '../types';
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
import { db, auth } from '../lib/firebase';
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

const TRIP_WRITE_FIELDS = [
  'customerId', 'leadId', 'title', 'destination', 'startDate', 'endDate',
  'travelerCount', 'adults', 'children', 'tripType', 'currency', 'budget',
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

const QUOTE_WRITE_FIELDS = [
  'leadId', 'customerId', 'customerName', 'customerPhone', 'customerEmail',
  'destination', 'tripId', 'hotels', 'transports', 'activities', 'travelerCount',
  'adults', 'children', 'packageId', 'packageName', 'durationDays', 'durationNights',
  'validUntil', 'notes', 'internalNotes', 'inclusions', 'exclusions', 'termsAndConditions',
  'backupAccommodations',
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
  updateTrip: (id: string, updates: Partial<Trip>) => Promise<void>;
  addItineraryDay: (tripId: string, dayData?: Partial<ItineraryDay>) => Promise<ItineraryDay>;
  updateItineraryDay: (id: string, updates: Partial<ItineraryDay>) => Promise<void>;
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
  assignLead: (id: string, employeeId: string, employeeName: string) => Promise<void>;

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
  runMarketingAiGenerate: (params: { destination: string; audience: string; campaignGoal: string; format: string }) => Promise<MarketingAiGenerateResult>;
  askCommandCenterAi: (question: string) => Promise<{ answer: string; suggestedActions: any[] }>;
  queryCommandCenter: (question: string) => Promise<{ answer: string; suggestedActions: any[] }>;

  // Demo state controls
  seedDemoData: () => void;
  clearDemoData: () => void;
  isLoading: boolean;
  dataLoadErrors: Partial<Record<'leads' | 'accommodation' | 'transport' | 'activities', string>>;
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
  const [marketingPillars] = useState<MarketingPillar[]>(DEMO_PILLARS);
  const [campaigns] = useState<AdCampaign[]>(DEMO_CAMPAIGNS);
  const [aiAgents] = useState<AiAgentConfig[]>(DEMO_AI_AGENTS);

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

  // Fetch from Firestore if not in DEMO mode
  useEffect(() => {
    if (APP_CONFIG.DEMO_MODE) return;
    
    const loadData = async () => {
      setIsLoading(true);
      try {
        const fetchApi = async (endpoint: string) => {
          const res = await fetch(endpoint, { headers: await authenticatedReadHeaders(currentUser.employeeId) });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || `API fetch failed (${res.status})`);
          return json.data || [];
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

        const canReadInventory = true; // All roles need inventory for TripBuilder
        const canReadQuotes = ['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive']
          .includes(currentUser?.role as any);
        // UX/data-loading optimization only. Firestore/API rules remain the
        // authority. Reservations needs supplier rates; Operations does not.
        const canReadRates = ['Founder', 'Admin', 'Accounts', 'Reservations'].includes(currentUser?.role as any);

        const [
          fetchedLeads, fetchedCustomers, fetchedCompanies, fetchedTasks,
          fetchedConversations, fetchedMessages, fetchedQuotes, fetchedBookings,
          fetchedRecs, fetchedActions, fetchedApprovals, fetchedLogs, fetchedPackages,
          fetchedTrips, fetchedHotels, fetchedTransports, fetchedDrivers, fetchedActivities, fetchedSuppliers, fetchedVouchers,
          fetchedAccommProps, fetchedRoomCats, fetchedRatePeriods, fetchedNegRates,
          fetchedVehicles, fetchedDestinations, fetchedRoutes, fetchedTransRates, fetchedTransSupps,
          fetchedActMasters, fetchedActRates
        ] = await Promise.all([
          safely(fetchApi('/api/leads'), 'leads'), safely(CustomerRepo.getAll()), safely(CompanyRepo.getAll()), safely(TaskRepo.getAll()),
          safely(ConversationRepo.getAll()), safely(MessageRepo.getAll()), safely(canReadQuotes ? fetchApi('/api/quotes') : Promise.resolve([])), safely(fetchApi('/api/bookings')),
          safely(AiRecommendationRepo.getAll()), safely(AiActionRepo.getAll()), Promise.resolve([]), safely(AuditLogRepo.getAll()),
          safely(PackageRepo.getAll()),
          safely(fetchApi('/api/trips')),
          safely(canReadInventory ? HotelRepo.getAll() : Promise.resolve([])),
          safely(canReadInventory ? TransportRepo.getAll() : Promise.resolve([])),
          safely(DriverRepo.getAll()),
          safely(canReadInventory ? ActivityRepo.getAll() : Promise.resolve([])),
          safely(canReadRates ? Promise.all([
            fetchApi('/api/accommodation/suppliers'),
            fetchApi('/api/transport/suppliers'),
            fetchApi('/api/activities/providers')
          ]).then((groups) => groups.flat()) : Promise.resolve([])), safely(VoucherRepo.getAll()),
          safely(fetchApi('/api/accommodation/properties'), 'accommodation'), safely(fetchApi('/api/accommodation/rooms'), 'accommodation'),
          safely(canReadRates ? fetchApi('/api/accommodation/rates') : Promise.resolve([])),
          safely(canReadRates ? NegotiatedRateRepo.getAll() : Promise.resolve([])),
          safely(fetchApi('/api/transport/vehicle-categories'), 'transport'), safely(DestinationRepo.getAll()), safely(TransportRouteRepo.getAll()),
          safely(canReadRates ? fetchApi('/api/transport/rates') : Promise.resolve([])),
          Promise.resolve([]),
          safely(fetchApi('/api/activities/masters'), 'activities'),
          safely(canReadRates ? fetchApi('/api/activities/rates') : Promise.resolve([]))
        ]);
        
        setLeads(fetchedLeads as any);
        setCustomers(fetchedCustomers as any);
        setCompanies(fetchedCompanies as any);
        setTasks(fetchedTasks as any);
        setConversations(fetchedConversations as any);
        setMessages(fetchedMessages as any);
        setQuotes(fetchedQuotes as any);
        setBookings(fetchedBookings as any);
        setRecommendations(fetchedRecs as any);
        setAiActions(fetchedActions as any);
        setApprovals(fetchedApprovals as any);
        setAuditLogs(fetchedLogs as any);
        if (fetchedPackages.length > 0) setPackages(fetchedPackages as any);
        if (fetchedTrips.length > 0) setTrips(fetchedTrips as any);
        if (fetchedHotels.length > 0) setHotels(fetchedHotels as any);
        if (fetchedTransports.length > 0) setTransports(fetchedTransports as any);
        if (fetchedDrivers.length > 0) setDrivers(fetchedDrivers as any);
        if (fetchedActivities.length > 0) setActivities(fetchedActivities as any);
        if (fetchedSuppliers.length > 0) setSuppliers(fetchedSuppliers as any);
        if (fetchedVouchers.length > 0) setVouchers(fetchedVouchers as any);
        setAccommodationProperties(fetchedAccommProps as any);
        setRoomCategories(fetchedRoomCats as any);
        if (fetchedRatePeriods.length > 0) setRatePeriods(fetchedRatePeriods as any);
        if (fetchedNegRates.length > 0) setNegotiatedRates(fetchedNegRates as any);

        setVehicleCategories(fetchedVehicles as any);
        if (fetchedDestinations.length > 0) setDestinations(fetchedDestinations as any);
        if (fetchedRoutes.length > 0) setTransportRoutes(fetchedRoutes as any);
        if (fetchedTransRates.length > 0) setTransportRatePeriods(fetchedTransRates as any);
        if (fetchedTransSupps.length > 0) setTransportSupplements(fetchedTransSupps as any);
        
        setActivityMasters(fetchedActMasters as any);
        if (fetchedActRates.length > 0) setActivityRatePeriods(fetchedActRates as any);
        setDataLoadErrors(loadErrors);
      } catch (err) {
        console.error("Failed to load data from Firestore:", err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
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
    localStorage.setItem('bb_tasks', JSON.stringify(tasks));
  }, [tasks]);
  useEffect(() => {
    localStorage.setItem('bb_conversations', JSON.stringify(conversations));
  }, [conversations]);
  useEffect(() => {
    localStorage.setItem('bb_messages', JSON.stringify(messages));
  }, [messages]);
  useEffect(() => {
    if (!APP_CONFIG.DEMO_MODE) return;
    localStorage.setItem('bb_quotes', JSON.stringify(quotes));
  }, [quotes]);
  useEffect(() => {
    localStorage.setItem('bb_bookings', JSON.stringify(bookings));
  }, [bookings]);
  useEffect(() => {
    localStorage.setItem('bb_recommendations', JSON.stringify(recommendations));
  }, [recommendations]);
  useEffect(() => {
    localStorage.setItem('bb_actions', JSON.stringify(aiActions));
  }, [aiActions]);
  useEffect(() => {
    localStorage.setItem('bb_approvals', JSON.stringify(approvals));
  }, [approvals]);
  useEffect(() => {
    localStorage.setItem('bb_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);
  useEffect(() => {
    localStorage.setItem('bb_content_calendar', JSON.stringify(contentCalendar));
  }, [contentCalendar]);
  useEffect(() => {
    localStorage.setItem('bb_trips', JSON.stringify(trips));
  }, [trips]);
  useEffect(() => {
    localStorage.setItem('bb_hotels', JSON.stringify(hotels));
  }, [hotels]);
  useEffect(() => {
    localStorage.setItem('bb_transports', JSON.stringify(transports));
  }, [transports]);
  useEffect(() => {
    localStorage.setItem('bb_drivers', JSON.stringify(drivers));
  }, [drivers]);
  useEffect(() => {
    localStorage.setItem('bb_activities', JSON.stringify(activities));
  }, [activities]);
  useEffect(() => {
    localStorage.setItem('bb_suppliers', JSON.stringify(suppliers));
  }, [suppliers]);
  useEffect(() => {
    localStorage.setItem('bb_vouchers', JSON.stringify(vouchers));
  }, [vouchers]);

  // Helper to log audit events with verified actor details
  const logAuditEvent = (action: string, entityType: string, entityId: string, before?: any, after?: any, reason?: string) => {
    const actorFirebaseUid = auth?.currentUser?.uid;
    const newLog: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorType: 'HUMAN',
      actorId: actorFirebaseUid || currentUser.id,
      actorName: `${currentUser.name} (${currentUser.role})`,
      action,
      entityType,
      entityId,
      before: before || null,
      after: after || null,
      reason: reason || `Updated by ${currentUser.name}`
    };
    setAuditLogs(prev => [newLog, ...prev]);

    // Async push to Firestore if available
    if (db) {
      try {
        const logDoc = doc(db, 'audit_logs', newLog.id);
        setDoc(logDoc, newLog).catch(e => console.warn('Firestore log write notice:', e));
      } catch (e) {
        // quiet fallback
      }
    }
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

  const assignLead = async (id: string, employeeId: string, employeeName: string) => {
    await updateLead(id, { assignedEmployeeId: employeeId, assignedEmployeeName: employeeName });
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

    if (db) {
      try {
        await setDoc(doc(db, 'customers', newCustomer.id), newCustomer);
      } catch (err) {
        console.warn('Firestore customer create notice:', err);
      }
    }
    return newCustomer;
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    const prevCust = customers.find(c => c.id === id);
    const updated = prevCust ? { ...prevCust, ...updates, updatedAt: new Date().toISOString() } : null;
    setCustomers(prev =>
      prev.map(c => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c))
    );
    logAuditEvent('CUSTOMER_UPDATED', 'CUSTOMER', id, prevCust, updates, `Updated customer ${prevCust?.name || id}`);

    if (db && updated) {
      try {
        await setDoc(doc(db, 'customers', id), updated);
      } catch (err) {
        console.warn('Firestore customer update notice:', err);
      }
    }
  };

  // Task CRUD
  const createTask = async (taskData: Omit<Task, 'id' | 'createdAt'>): Promise<Task> => {
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
        totalSellingPrice: initialPrice,
        grossProfit: profit,
        grossMargin: margin,
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

  const updateTrip = async (id: string, updates: Partial<Trip>) => {
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
      updated = { ...prevTrip, ...updates, updatedAt: new Date().toISOString() };
      logAuditEvent('trip.updated', 'TRIP', id, prevTrip, updates, `Updated trip ${prevTrip.title || id}`);
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
        const itemSupplierCosts: Record<string, number> = {};
        let totalSupplierCost = 0;
        for (const item of allItems) {
          const metadata = item.metadata || {};
          let supplierCost = 0;
          if (item.type === 'HOTEL') {
            if (!metadata.propertyId || !metadata.roomCategoryId || !metadata.checkInDate || !metadata.nights) {
              if (Number.isFinite(item.supplierCost) && Number(item.supplierCost) >= 0) {
                supplierCost = Number(item.supplierCost);
                itemSupplierCosts[item.id] = supplierCost;
                totalSupplierCost += supplierCost;
                continue;
              }
              throw new Error('Accommodation item is missing authoritative inventory linkage.');
            }
            const room = roomCategories.find(value => value.id === metadata.roomCategoryId);
            if (!room) throw new Error(`Room category ${metadata.roomCategoryId || ''} not found.`);
            const calculation = calculateStayTotal(
              room,
              ratePeriods.filter(value => value.propertyId === metadata.propertyId),
              metadata.propertyId,
              metadata.checkInDate,
              Number(metadata.nights || 0),
              Number(metadata.adults || trip.adults),
              Number(metadata.children || trip.children),
              Number(metadata.childrenWithBed || 0),
              Number(metadata.childrenWithoutBed || 0),
              metadata.mealPlan,
            );
            if (!calculation.available) throw new Error('The selected accommodation is unavailable for these dates.');
            supplierCost = Number(calculation.totalAmount || 0) * Number(metadata.rooms || 1);
          } else if (item.type === 'TRANSPORT') {
            if (!metadata.vehicleCategoryId || !metadata.rateId || !metadata.startDate || !metadata.serviceType) {
              if (Number.isFinite(item.supplierCost) && Number(item.supplierCost) >= 0) {
                supplierCost = Number(item.supplierCost);
                itemSupplierCosts[item.id] = supplierCost;
                totalSupplierCost += supplierCost;
                continue;
              }
              throw new Error('Transport item is missing authoritative inventory linkage.');
            }
            const rate = transportRatePeriods.find(value => value.id === metadata.rateId);
            if (!rate) throw new Error(`Transport rate ${metadata.rateId || ''} not found.`);
            const calculation = calculateTransportCost({
              ratePeriod: rate,
              supplements: transportSupplements,
              serviceParams: {
                vehicleDays: Number(metadata.vehicleDays || 1),
                nightHalts: Number(metadata.nightHalts || 0),
                occurrences: Number(metadata.occurrences || 1),
                distanceKm: Number(metadata.distanceKm || 0),
                hours: Number(metadata.hours || 0),
              },
            });
            if (!calculation.available) throw new Error('The selected transport is unavailable for these dates.');
            supplierCost = Number(calculation.totalAmount || 0);
          } else if (item.type === 'ACTIVITY') {
            if (!metadata.activityId || !metadata.rateId || !metadata.date) {
              if (Number.isFinite(item.supplierCost) && Number(item.supplierCost) >= 0) {
                supplierCost = Number(item.supplierCost);
                itemSupplierCosts[item.id] = supplierCost;
                totalSupplierCost += supplierCost;
                continue;
              }
              throw new Error('Activity item is missing authoritative inventory linkage.');
            }
            const rate = activityRatePeriods.find(value => value.id === metadata.rateId);
            if (!rate) throw new Error(`Activity rate ${metadata.rateId || ''} not found.`);
            const calculation = calculateActivityCost({
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
              },
            });
            if (!calculation.available) throw new Error('The selected activity is unavailable for these dates.');
            supplierCost = Number(calculation.totalAmount || 0);
          }
          if (!Number.isFinite(supplierCost) || supplierCost < 0) throw new Error('Inventory costing returned an invalid supplier amount.');
          itemSupplierCosts[item.id] = supplierCost;
          totalSupplierCost += supplierCost;
        }
        const grossProfit = trip.totalSellingPrice - totalSupplierCost;
        const grossMargin = trip.totalSellingPrice > 0
          ? Number(((grossProfit / trip.totalSellingPrice) * 100).toFixed(1))
          : 0;
        setItineraryDays(previous => previous.map(day => day.tripId !== tripId ? day : {
          ...day,
          items: (day.items || []).map(item => ({ ...item, supplierCost: itemSupplierCosts[item.id] ?? item.supplierCost })),
        }));
        setTrips(previous => previous.map(value => value.id !== tripId ? value : {
          ...value, totalSupplierCost, grossProfit, grossMargin,
          costingStatus: 'CALCULATED', updatedAt: new Date().toISOString(),
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
            grossProfit: data.data.grossProfit, 
            grossMargin: data.data.grossMargin, 
            costingStatus: data.data.costingStatus,
            updatedAt: new Date().toISOString() 
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

    const newDay: ItineraryDay = {
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
    setTrips(prev => prev.map(item => item.id === tripId ? { ...item, costingStatus: 'PENDING', updatedAt: new Date().toISOString() } : item));
    logAuditEvent('itinerary.day.created', 'ITINERARY_DAY', newDay.id, null, newDay, `Added Day ${nextDayNumber} to trip ${trip?.title || tripId}`);

    if (db && APP_CONFIG.DEMO_MODE) {
      try {
        await setDoc(doc(db, 'itinerary_days', newDay.id), newDay);
      } catch (err) {
        console.warn('Firestore add day notice:', err);
      }
    }

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
    setItineraryDays(prev =>
      prev.map(d => (d.id === id ? { ...d, ...updates } : d))
    );
    setTrips(prev => prev.map(item => item.id === day.tripId ? { ...item, costingStatus: 'PENDING', updatedAt: new Date().toISOString() } : item));
    if (db && APP_CONFIG.DEMO_MODE) {
      try {
        await setDoc(doc(db, 'itinerary_days', id), { ...day, ...updates });
      } catch (err) {
        console.warn('Firestore day update notice:', err);
      }
    }
    
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

    setTrips(prev => prev.map(item => item.id === day.tripId ? { ...item, costingStatus: 'PENDING', updatedAt: new Date().toISOString() } : item));

    if (db && APP_CONFIG.DEMO_MODE) {
      try {
        await deleteDoc(doc(db, 'itinerary_days', id));
      } catch (err) {
        console.warn('Firestore day delete notice:', err);
      }
    }
  };

  const addItineraryItem = async (dayId: string, itemData: Omit<ItineraryItem, 'id' | 'dayId'>): Promise<ItineraryItem> => {
    const targetDay = itineraryDays.find(d => d.id === dayId);
    if (!targetDay) throw new Error(`Day ${dayId} not found`);

    const newItem: ItineraryItem = {
      ...itemData,
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

    const updatedDay = { ...targetDay, items: [...(targetDay.items || []), newItem] };
    const updatedDays = itineraryDays.map(d => (d.id === dayId ? updatedDay : d));

    setItineraryDays(updatedDays);
    setTrips(prev => prev.map(item => item.id === targetDay.tripId ? { ...item, costingStatus: 'PENDING', updatedAt: new Date().toISOString() } : item));

    const actionName = itemData.type === 'HOTEL' ? 'hotel.added_to_trip' :
                       itemData.type === 'TRANSPORT' ? 'transport.added_to_trip' :
                       itemData.type === 'ACTIVITY' ? 'activity.added_to_trip' : 'itinerary.item.added';

    logAuditEvent(actionName, 'ITINERARY_ITEM', newItem.id, null, newItem, `Added ${itemData.type}: ${itemData.title}`);

    if (db && APP_CONFIG.DEMO_MODE) {
      try {
        await setDoc(doc(db, 'itinerary_days', dayId), updatedDay);
      } catch (err) {
        console.warn('Firestore add item notice:', err);
      }
    }

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
    const updatedItem = { ...itemData, id: itemId, dayId, tripId: targetDay.tripId } as ItineraryItem;
    const updatedDay = { ...targetDay, items: targetDay.items.map(item => item.id === itemId ? updatedItem : item) };
    setItineraryDays(prev => prev.map(day => day.id === dayId ? updatedDay : day));
    setTrips(prev => prev.map(trip => trip.id === targetDay.tripId ? { ...trip, costingStatus: 'PENDING', updatedAt: new Date().toISOString() } : trip));
    if (db) await setDoc(doc(db, 'itinerary_days', dayId), updatedDay).catch(console.warn);
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

    const updatedDay = { ...targetDay, items: (targetDay.items || []).filter(it => it.id !== itemId) };
    const updatedDays = itineraryDays.map(d => (d.id === dayId ? updatedDay : d));

    setItineraryDays(updatedDays);
    setTrips(prev => prev.map(item => item.id === targetDay.tripId ? { ...item, costingStatus: 'PENDING', updatedAt: new Date().toISOString() } : item));

    if (db && APP_CONFIG.DEMO_MODE) {
      try {
        await setDoc(doc(db, 'itinerary_days', dayId), updatedDay);
      } catch (err) {
        console.warn('Firestore delete item notice:', err);
      }
    }
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
    if (trip.costingStatus !== 'CALCULATED') throw new Error('Recalculate the Trip before creating or updating its Quote.');
    const items = itineraryDays.filter(day => day.tripId === trip.id).flatMap(day => day.items || []);
    const inventoryItems = items.filter(item => ['HOTEL', 'TRANSPORT', 'ACTIVITY'].includes(item.type));
    if (!inventoryItems.length) throw new Error('The Trip has no inventory-linked services to quote.');
    for (const item of inventoryItems) {
      if (!item.metadata?.rateId) throw new Error(`Trip service ${item.title} is not linked to authoritative inventory.`);
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
      passengerCount: trip.travelerCount,
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
    if (existingTripQuote) return existingTripQuote;
    const tripFields = linkedTrip
      ? buildDemoTripQuoteFields(linkedTrip, (quoteData.backupAccommodations || []) as QuoteBackupAccommodation[])
      : {};
    const totalAmount = Number(payload.totalAmount) || 0;
    const discountAmount = Number(payload.discountAmount) || 0;
    const finalAmount = Math.max(0, totalAmount - discountAmount);
    const totalSupplierCost = linkedTrip?.totalSupplierCost;
    const newQuote: Quote = {
      ...(payload as unknown as Quote),
      ...tripFields,
      id: `quote-${Date.now()}`,
      totalAmount,
      discountAmount,
      finalAmount,
      ...(totalSupplierCost !== undefined ? {
        totalSupplierCost,
        grossProfit: finalAmount - totalSupplierCost,
        grossMargin: finalAmount > 0 ? Number((((finalAmount - totalSupplierCost) / finalAmount) * 100).toFixed(1)) : 0,
      } : {}),
      status: 'DRAFT',
      salesEmployeeId: currentUser.employeeId,
      salesEmployeeName: currentUser.name,
      ...(currentUser.salesTeamId ? { salesTeamId: currentUser.salesTeamId } : {}),
      createdByEmployeeId: currentUser.employeeId,
      updatedByEmployeeId: currentUser.employeeId,
      version: 1,
      versionHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: true,
    };
    setQuotes(prev => [newQuote, ...prev.filter(quote => quote.id !== newQuote.id && quote.tripId !== newQuote.tripId)]);
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
    const totalAmount = Number(payload.totalAmount ?? prevQuote.totalAmount) || 0;
    const discountAmount = Number(payload.discountAmount ?? prevQuote.discountAmount) || 0;
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
        grossProfit: finalAmount - totalSupplierCost,
        grossMargin: finalAmount > 0 ? Number((((finalAmount - totalSupplierCost) / finalAmount) * 100).toFixed(1)) : 0,
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
          hotels: prevQuote.hotels,
          transports: prevQuote.transports,
          activities: prevQuote.activities,
          backupAccommodations: prevQuote.backupAccommodations,
          totalSupplierCost: prevQuote.totalSupplierCost,
          grossProfit: prevQuote.grossProfit,
          grossMargin: prevQuote.grossMargin,
        },
      ],
      updatedByEmployeeId: currentUser.employeeId,
      updatedAt: new Date().toISOString(),
    };
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
    const trip = quote.tripId ? trips.find(item => item.id === quote.tripId) : undefined;
    if (!trip) throw new Error('A customer package requires a persisted Trip-linked Quote.');
    if (trip.costingStatus !== 'CALCULATED') throw new Error('Recalculate the Trip before generating the customer package.');
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
    const customerPackage = await getCustomerPackage(quoteId);
    const now = new Date().toISOString();
    const updated: Quote = {
      ...quote,
      status: 'SENT',
      sharedAt: now,
      sharedByEmployeeId: currentUser.employeeId,
      shareChannel: channel,
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
    return { quote: updated, customerPackage: { ...customerPackage, generatedAt: now } };
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
      setQuotes(prev => prev.map(item => item.id === quoteId
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
      assignedOperationsEmployeeId: 'emp-05'
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

    await updateQuote(quote.id, { status: 'ACCEPTED' });

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

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: Failed to generate marketing strategy`);
    }

    const data = await response.json();
    return data.data;
  };

  const runMarketingAiGenerate = async (params: { destination: string; audience: string; campaignGoal: string; format: string }): Promise<MarketingAiGenerateResult> => {
    const strategyResult = await runMarketingStrategy(params.destination, 'Current Season', `${params.campaignGoal} for ${params.audience}`);
    
    return {
      campaignTitle: strategyResult.campaignIdea || `${params.destination} Luxury Experience`,
      targetAudienceRecommendation: strategyResult.audience || params.audience,
      videoHooks: strategyResult.contentIdeas?.map(c => c.hook || c.title) || [
        `Why booking standard hotels in ${params.destination} ruins the trip`,
        `The secret local experience most travel packages miss`
      ],
      adCopies: [
        `Escape to ${params.destination} with Booking Bridge OS curated luxury stays and dedicated private concierge. Guaranteed hassle-free permits and premium stays.`,
        `Discover majestic landscapes and handcrafted itineraries. Inquire today for custom package quotations.`
      ],
      instagramCaptions: strategyResult.contentIdeas?.map(c => `${c.title}: ${c.angle} #BookingBridge #${params.destination}`) || [
        `Golden views and unforgettable memories in ${params.destination}. 🌟 Tap the link in bio to plan your getaway.`
      ],
      visualPrompts: [
        `Cinematic sunset over calm waters with traditional wooden boats and majestic snow peaks in background`,
        `Warm lighting inside a luxury cedar wooden suite with traditional carpets and scenic mountain view`
      ]
    };
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
