import React, { createContext, useContext, useState, useEffect } from 'react';
import { APP_CONFIG } from '../config';
import {
  EmployeeRepo, CustomerRepo, CompanyRepo, LeadRepo, ConversationRepo, MessageRepo, 
  TaskRepo, QuoteRepo, BookingRepo, PackageRepo, AuditLogRepo, AiRecommendationRepo, 
  AiActionRepo, ApprovalRepo, TripRepo, ItineraryDayRepo, HotelRepo, HotelRoomRepo,
  HotelBookingRepo, TransportRepo, DriverRepo, ActivityRepo, ActivityBookingRepo,
  SupplierRepo, VoucherRepo,
  AccommodationPropertyRepo, RoomCategoryRepo, RatePeriodRepo, NegotiatedRateRepo,
  PropertyPhotoRepo, RateHistoryRepo,
  VehicleCategoryRepo, DestinationRepo, TransportRouteRepo, TransportRatePeriodRepo,
  TransportSupplementRepo, ActivityMasterRepo, ActivityRatePeriodRepo
} from '../services/db/repositories';
import {
  Lead,
  Customer,
  Company,
  Task,
  Conversation,
  Message,
  Quote,
  Booking,
  AiRecommendation,
  AiAction,
  ApprovalItem,
  AuditLog,
  TravelPackage,
  Integration,
  LeadStatus,
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
  ActivityRatePeriod
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
  createTrip: (tripData: Omit<Trip, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'grossProfit' | 'grossMargin' | 'totalCost' | 'totalSellingPrice'> & { budget?: number; totalCost?: number; totalSellingPrice?: number }, initialDaysCount?: number, fromPackageId?: string) => Promise<Trip>;
  updateTrip: (id: string, updates: Partial<Trip>) => Promise<void>;
  addItineraryDay: (tripId: string, dayData?: Partial<ItineraryDay>) => Promise<ItineraryDay>;
  updateItineraryDay: (id: string, updates: Partial<ItineraryDay>) => Promise<void>;
  deleteItineraryDay: (id: string) => Promise<void>;
  addItineraryItem: (dayId: string, item: Omit<ItineraryItem, 'id' | 'dayId'>) => Promise<ItineraryItem>;
  deleteItineraryItem: (dayId: string, itemId: string) => Promise<void>;

  // Lead actions
  createLead: (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Lead>;
  updateLead: (id: string, updates: Partial<Lead>) => Promise<void>;
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
  createQuote: (quote: Omit<Quote, 'id' | 'createdAt' | 'version'> & { version?: number }) => Promise<Quote>;
  updateQuote: (id: string, updates: Partial<Quote>, createNewVersion?: boolean) => Promise<Quote>;
  convertQuoteToBooking: (quoteId: string) => Promise<Booking>;

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
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

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
        const [
          fetchedLeads, fetchedCustomers, fetchedCompanies, fetchedTasks,
          fetchedConversations, fetchedMessages, fetchedQuotes, fetchedBookings,
          fetchedRecs, fetchedActions, fetchedApprovals, fetchedLogs, fetchedPackages,
          fetchedTrips, fetchedHotels, fetchedTransports, fetchedDrivers, fetchedActivities, fetchedSuppliers, fetchedVouchers,
          fetchedAccommProps, fetchedRoomCats, fetchedRatePeriods, fetchedNegRates,
          fetchedVehicles, fetchedDestinations, fetchedRoutes, fetchedTransRates, fetchedTransSupps,
          fetchedActMasters, fetchedActRates
        ] = await Promise.all([
          LeadRepo.getAll(), CustomerRepo.getAll(), CompanyRepo.getAll(), TaskRepo.getAll(),
          ConversationRepo.getAll(), MessageRepo.getAll(), QuoteRepo.getAll(), BookingRepo.getAll(),
          AiRecommendationRepo.getAll(), AiActionRepo.getAll(), ApprovalRepo.getAll(), AuditLogRepo.getAll(),
          PackageRepo.getAll(),
          TripRepo.getAll(), HotelRepo.getAll(), TransportRepo.getAll(), DriverRepo.getAll(), ActivityRepo.getAll(), SupplierRepo.getAll(), VoucherRepo.getAll(),
          AccommodationPropertyRepo.getAll(), RoomCategoryRepo.getAll(), RatePeriodRepo.getAll(), NegotiatedRateRepo.getAll(),
          VehicleCategoryRepo.getAll(), DestinationRepo.getAll(), TransportRouteRepo.getAll(), TransportRatePeriodRepo.getAll(), TransportSupplementRepo.getAll(),
          ActivityMasterRepo.getAll(), ActivityRatePeriodRepo.getAll()
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
        if (fetchedAccommProps.length > 0) setAccommodationProperties(fetchedAccommProps as any);
        if (fetchedRoomCats.length > 0) setRoomCategories(fetchedRoomCats as any);
        if (fetchedRatePeriods.length > 0) setRatePeriods(fetchedRatePeriods as any);
        if (fetchedNegRates.length > 0) setNegotiatedRates(fetchedNegRates as any);

        if (fetchedVehicles.length > 0) setVehicleCategories(fetchedVehicles as any);
        if (fetchedDestinations.length > 0) setDestinations(fetchedDestinations as any);
        if (fetchedRoutes.length > 0) setTransportRoutes(fetchedRoutes as any);
        if (fetchedTransRates.length > 0) setTransportRatePeriods(fetchedTransRates as any);
        if (fetchedTransSupps.length > 0) setTransportSupplements(fetchedTransSupps as any);
        
        if (fetchedActMasters.length > 0) setActivityMasters(fetchedActMasters as any);
        if (fetchedActRates.length > 0) setActivityRatePeriods(fetchedActRates as any);
      } catch (err) {
        console.error("Failed to load data from Firestore:", err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);

  // Sync to local storage for instant responsiveness (only in DEMO_MODE)
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
  const createLead = async (leadData: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<Lead> => {
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-User-Id': currentUser.id
        },
        body: JSON.stringify(leadData)
      });
      if (!res.ok) throw new Error('Failed to create lead');
      const { data: newLead } = await res.json();
      setLeads(prev => [newLead, ...prev]);
      return newLead;
    } catch (err) {
      console.error('API create lead failed:', err);
      throw err;
    }
  };

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    const prevLead = leads.find(l => l.id === id);
    if (!prevLead) return;

    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-User-Id': currentUser.id
        },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const { data: updatedLead } = await res.json();
        setLeads(prev => prev.map(l => (l.id === id ? updatedLead : l)));
      } else {
        console.error('Failed to update lead via API');
      }
    } catch (err) {
      console.error('API lead update failed:', err);
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
    try {
      const res = await fetch('/api/accommodation/properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-User-Id': currentUser.id
        },
        body: JSON.stringify(propertyData)
      });
      if (!res.ok) throw new Error('Failed to create property');
      const { data: newProperty } = await res.json();
      setAccommodationProperties(prev => [newProperty, ...prev]);
      return newProperty;
    } catch (err) {
      console.error('API create property failed:', err);
      throw err;
    }
  };

  const updateAccommodationProperty = async (id: string, updates: Partial<AccommodationProperty>) => {
    const prevProp = accommodationProperties.find(p => p.id === id);
    if (!prevProp) return;

    try {
      const res = await fetch(`/api/accommodation/properties/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-User-Id': currentUser.id
        },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const { data: updated } = await res.json();
        setAccommodationProperties(prev => prev.map(p => (p.id === id ? updated : p)));
      } else {
        console.error('Failed to update property via API');
      }
    } catch (err) {
      console.error('API update property failed:', err);
    }
  };

  // Phase 2B-4: Transport CRUD
  const addTransportRatePeriod = async (data: Omit<TransportRatePeriod, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newRate = { ...data, id: `trate-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setTransportRatePeriods(prev => [newRate, ...prev]);
    if (db) await setDoc(doc(db, 'transport_rate_periods', newRate.id), newRate).catch(console.warn);
    return newRate;
  };
  const updateTransportRatePeriod = async (id: string, updates: Partial<TransportRatePeriod>) => {
    setTransportRatePeriods(prev => prev.map(r => r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r));
    if (db) await setDoc(doc(db, 'transport_rate_periods', id), { ...updates, updatedAt: new Date().toISOString() }, { merge: true }).catch(console.warn);
  };
  const deleteTransportRatePeriod = async (id: string) => {
    setTransportRatePeriods(prev => prev.filter(r => r.id !== id));
    if (db) await deleteDoc(doc(db, 'transport_rate_periods', id)).catch(console.warn);
  };

  const addTransportSupplement = async (data: Omit<TransportSupplement, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newSupp = { ...data, id: `tsupp-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setTransportSupplements(prev => [newSupp, ...prev]);
    if (db) await setDoc(doc(db, 'transport_supplements', newSupp.id), newSupp).catch(console.warn);
    return newSupp;
  };
  const updateTransportSupplement = async (id: string, updates: Partial<TransportSupplement>) => {
    setTransportSupplements(prev => prev.map(s => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s));
    if (db) await setDoc(doc(db, 'transport_supplements', id), { ...updates, updatedAt: new Date().toISOString() }, { merge: true }).catch(console.warn);
  };
  const deleteTransportSupplement = async (id: string) => {
    setTransportSupplements(prev => prev.filter(s => s.id !== id));
    if (db) await deleteDoc(doc(db, 'transport_supplements', id)).catch(console.warn);
  };

  // Phase 2B-4: Activity CRUD
  const addActivityMaster = async (data: Omit<ActivityMaster, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newMaster = { ...data, id: `actm-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setActivityMasters(prev => [newMaster, ...prev]);
    if (db) await setDoc(doc(db, 'activity_masters', newMaster.id), newMaster).catch(console.warn);
    return newMaster;
  };
  const updateActivityMaster = async (id: string, updates: Partial<ActivityMaster>) => {
    setActivityMasters(prev => prev.map(m => m.id === id ? { ...m, ...updates, updatedAt: new Date().toISOString() } : m));
    if (db) await setDoc(doc(db, 'activity_masters', id), { ...updates, updatedAt: new Date().toISOString() }, { merge: true }).catch(console.warn);
  };
  const deleteActivityMaster = async (id: string) => {
    setActivityMasters(prev => prev.filter(m => m.id !== id));
    if (db) await deleteDoc(doc(db, 'activity_masters', id)).catch(console.warn);
  };

  const addActivityRatePeriod = async (data: Omit<ActivityRatePeriod, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newRate = { ...data, id: `actr-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setActivityRatePeriods(prev => [newRate, ...prev]);
    if (db) await setDoc(doc(db, 'activity_rate_periods', newRate.id), newRate).catch(console.warn);
    return newRate;
  };
  const updateActivityRatePeriod = async (id: string, updates: Partial<ActivityRatePeriod>) => {
    setActivityRatePeriods(prev => prev.map(r => r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r));
    if (db) await setDoc(doc(db, 'activity_rate_periods', id), { ...updates, updatedAt: new Date().toISOString() }, { merge: true }).catch(console.warn);
  };
  const deleteActivityRatePeriod = async (id: string) => {
    setActivityRatePeriods(prev => prev.filter(r => r.id !== id));
    if (db) await deleteDoc(doc(db, 'activity_rate_periods', id)).catch(console.warn);
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
    tripData: Omit<Trip, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'grossProfit' | 'grossMargin' | 'totalCost' | 'totalSellingPrice'> & { budget?: number; totalCost?: number; totalSellingPrice?: number },
    initialDaysCount?: number,
    fromPackageId?: string
  ): Promise<Trip> => {
    const tripId = `trip-${Date.now()}`;
    const initialCost = tripData.totalCost || 0;
    const initialPrice = tripData.totalSellingPrice || tripData.budget || 0;
    const profit = initialPrice - initialCost;
    const margin = initialPrice > 0 ? Number(((profit / initialPrice) * 100).toFixed(1)) : 0;

    const newTrip: Trip = {
      ...tripData,
      id: tripId,
      status: 'DRAFT',
      currency: tripData.currency || 'INR',
      totalCost: initialCost,
      totalSellingPrice: initialPrice,
      grossProfit: profit,
      grossMargin: margin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: APP_CONFIG.DEMO_MODE
    };

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

    setTrips(prev => [newTrip, ...prev]);
    if (createdDays.length > 0) {
      setItineraryDays(prev => [...prev, ...createdDays]);
    }

    logAuditEvent('trip.created', 'TRIP', newTrip.id, null, newTrip, `Created new trip "${newTrip.title}" for ${newTrip.destination}`);

    if (db) {
      try {
        await setDoc(doc(db, 'trips', newTrip.id), newTrip);
        for (const day of createdDays) {
          await setDoc(doc(db, 'itinerary_days', day.id), day);
        }
      } catch (err) {
        console.warn('Firestore trip create notice:', err);
      }
    }

    return newTrip;
  };

  const updateTrip = async (id: string, updates: Partial<Trip>) => {
    const prevTrip = trips.find(t => t.id === id);
    const updated = prevTrip ? { ...prevTrip, ...updates, updatedAt: new Date().toISOString() } : null;
    setTrips(prev =>
      prev.map(t => (t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t))
    );
    logAuditEvent('trip.updated', 'TRIP', id, prevTrip, updates, `Updated trip ${prevTrip?.title || id}`);

    // If totalSellingPrice changed, we need to recalculate margin/profit
    if (updates.totalSellingPrice !== undefined) {
      setTimeout(() => {
        recalculateTripCost(id);
      }, 50);
    }

    if (db && updated) {
      try {
        await setDoc(doc(db, 'trips', id), updated);
      } catch (err) {
        console.warn('Firestore update trip notice:', err);
      }
    }
  };

  const recalculateTripCost = async (tripId: string) => {
    try {
      const trip = trips.find(t => t.id === tripId);
      if (!trip) return;

      const tripDaysLocal = itineraryDays.filter(d => d.tripId === tripId);
      const allItems = tripDaysLocal.flatMap(d => d.items || []);

      const response = await fetch('/api/trips/calculate-costs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-User-Id': currentUser.id
        },
        body: JSON.stringify({
          tripId,
          items: allItems,
          totalSellingPrice: trip.totalSellingPrice
        })
      });

      const data = await response.json();
      if (data.success && data.data) {
        setTrips(prev =>
          prev.map(t => (t.id === tripId ? { 
            ...t, 
            totalCost: data.data.totalCost, 
            grossProfit: data.data.grossProfit, 
            grossMargin: data.data.grossMargin, 
            updatedAt: new Date().toISOString() 
          } : t))
        );
      }
    } catch (err) {
      console.error('Failed to recalculate trip cost:', err);
    }
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

    setItineraryDays(prev => [...prev, newDay]);
    logAuditEvent('itinerary.day.created', 'ITINERARY_DAY', newDay.id, null, newDay, `Added Day ${nextDayNumber} to trip ${trip?.title || tripId}`);

    if (db) {
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
    setItineraryDays(prev =>
      prev.map(d => (d.id === id ? { ...d, ...updates } : d))
    );
    if (db && day) {
      try {
        await setDoc(doc(db, 'itinerary_days', id), { ...day, ...updates });
      } catch (err) {
        console.warn('Firestore day update notice:', err);
      }
    }
    
    // Ensure state is updated so recalculateTripCost sends the right items
    if (day) {
      setTimeout(() => {
        recalculateTripCost(day.tripId);
      }, 50);
    }
  };

  const deleteItineraryDay = async (id: string) => {
    const day = itineraryDays.find(d => d.id === id);
    if (!day) return;
    const remainingDays = itineraryDays.filter(d => d.id !== id);
    setItineraryDays(remainingDays);

    // Recompute costing for trip via server
    recalculateTripCost(day.tripId);

    if (db) {
      try {
        await deleteDoc(doc(db, 'itinerary_days', id));
        const updatedTrip = trips.find(t => t.id === day.tripId);
        if (updatedTrip) {
          await setDoc(doc(db, 'trips', day.tripId), { ...updatedTrip, updatedAt: new Date().toISOString() });
        }
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

    const updatedDay = { ...targetDay, items: [...(targetDay.items || []), newItem] };
    const updatedDays = itineraryDays.map(d => (d.id === dayId ? updatedDay : d));

    setItineraryDays(updatedDays);

    // Ensure state is updated so recalculateTripCost sends the right items
    setTimeout(() => {
      recalculateTripCost(targetDay.tripId);
    }, 50);

    const actionName = itemData.type === 'HOTEL' ? 'hotel.added_to_trip' :
                       itemData.type === 'TRANSPORT' ? 'transport.added_to_trip' :
                       itemData.type === 'ACTIVITY' ? 'activity.added_to_trip' : 'itinerary.item.added';

    logAuditEvent(actionName, 'ITINERARY_ITEM', newItem.id, null, newItem, `Added ${itemData.type}: ${itemData.title}`);

    if (db) {
      try {
        await setDoc(doc(db, 'itinerary_days', dayId), updatedDay);
        const currentTrip = trips.find(t => t.id === targetDay.tripId);
        if (currentTrip) {
          await setDoc(doc(db, 'trips', targetDay.tripId), { ...currentTrip, updatedAt: new Date().toISOString() });
        }
      } catch (err) {
        console.warn('Firestore add item notice:', err);
      }
    }

    return newItem;
  };

  const deleteItineraryItem = async (dayId: string, itemId: string) => {
    const targetDay = itineraryDays.find(d => d.id === dayId);
    if (!targetDay) return;

    const updatedDay = { ...targetDay, items: (targetDay.items || []).filter(it => it.id !== itemId) };
    const updatedDays = itineraryDays.map(d => (d.id === dayId ? updatedDay : d));

    setItineraryDays(updatedDays);

    // Ensure state is updated so recalculateTripCost sends the right items
    setTimeout(() => {
      recalculateTripCost(targetDay.tripId);
    }, 50);

    if (db) {
      try {
        await setDoc(doc(db, 'itinerary_days', dayId), updatedDay);
        const currentTrip = trips.find(t => t.id === targetDay.tripId);
        if (currentTrip) {
          await setDoc(doc(db, 'trips', targetDay.tripId), { ...currentTrip, updatedAt: new Date().toISOString() });
        }
      } catch (err) {
        console.warn('Firestore delete item notice:', err);
      }
    }
  };

  // Quotes
  const createQuote = async (quoteData: Omit<Quote, 'id' | 'createdAt' | 'version'> & { version?: number }): Promise<Quote> => {
    const newQuote: Quote = {
      ...quoteData,
      id: `quote-${Date.now()}`,
      version: quoteData.version || 1,
      versionHistory: quoteData.versionHistory || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: APP_CONFIG.DEMO_MODE
    };
    setQuotes(prev => [newQuote, ...prev]);
    logAuditEvent('QUOTE_CREATED', 'QUOTE', newQuote.id, null, newQuote, `Generated quote of ₹${newQuote.finalAmount.toLocaleString('en-IN')}`);

    if (db) {
      try {
        await setDoc(doc(db, 'quotes', newQuote.id), newQuote);
      } catch (err) {
        console.warn('Firestore quote create notice:', err);
      }
    }
    return newQuote;
  };

  const updateQuote = async (id: string, updates: Partial<Quote>, createNewVersion = false): Promise<Quote> => {
    const prevQuote = quotes.find(q => q.id === id);
    if (!prevQuote) throw new Error(`Quote ${id} not found`);

    let nextVersion = prevQuote.version || 1;
    let nextHistory = [...(prevQuote.versionHistory || [])];

    if (createNewVersion) {
      nextHistory.push({
        version: prevQuote.version || 1,
        updatedAt: prevQuote.updatedAt || prevQuote.createdAt,
        updatedBy: currentUser.name,
        totalAmount: prevQuote.totalAmount,
        discountAmount: prevQuote.discountAmount,
        finalAmount: prevQuote.finalAmount,
        status: prevQuote.status,
        notes: prevQuote.notes,
        inclusions: prevQuote.inclusions,
        exclusions: prevQuote.exclusions,
        termsAndConditions: prevQuote.termsAndConditions
      });
      nextVersion = nextVersion + 1;
    }

    const updatedQuote: Quote = {
      ...prevQuote,
      ...updates,
      version: nextVersion,
      versionHistory: nextHistory,
      updatedAt: new Date().toISOString()
    };

    setQuotes(prev => prev.map(q => (q.id === id ? updatedQuote : q)));
    logAuditEvent('QUOTE_UPDATED', 'QUOTE', id, prevQuote, updates, `Updated quote #${id} (Version ${nextVersion})`);

    if (db) {
      try {
        await setDoc(doc(db, 'quotes', id), updatedQuote);
      } catch (err) {
        console.warn('Firestore quote update notice:', err);
      }
    }
    return updatedQuote;
  };

  const createBooking = async (bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt' | 'bookingReference'>): Promise<Booking> => {
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

    if (db) {
      try {
        await setDoc(doc(db, 'bookings', newBooking.id), newBooking);
      } catch (err) {
        console.warn('Firestore booking create notice:', err);
      }
    }
    return newBooking;
  };

  const updateBooking = async (id: string, updates: Partial<Booking>) => {
    const prevBooking = bookings.find(b => b.id === id);
    const updated = prevBooking ? { ...prevBooking, ...updates, updatedAt: new Date().toISOString() } : null;

    setBookings(prev => prev.map(b => (b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b)));
    logAuditEvent('BOOKING_UPDATED', 'BOOKING', id, prevBooking, updates, `Updated booking #${id}`);

    if (db && updated) {
      try {
        await setDoc(doc(db, 'bookings', id), updated);
      } catch (err) {
        console.warn('Firestore booking update notice:', err);
      }
    }
  };

  const convertQuoteToBooking = async (quoteId: string): Promise<Booking> => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) throw new Error(`Quote ${quoteId} not found`);

    const trip = quote.tripId ? trips.find(t => t.id === quote.tripId) : null;

    const booking = await createBooking({
      quoteId: quote.id,
      tripId: quote.tripId || '',
      customerId: quote.customerId,
      leadId: quote.leadId,
      status: 'CONFIRMED',
      totalAmount: quote.finalAmount,
      amountReceived: 0,
      amountPending: quote.finalAmount,
      travelStartDate: trip?.startDate || new Date().toISOString().split('T')[0],
      travelEndDate: trip?.endDate || new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
      assignedSalesEmployeeId: quote.salesEmployeeId || currentUser.id,
      assignedOperationsEmployeeId: 'emp-05'
    });

    await updateQuote(quote.id, { status: 'ACCEPTED' });

    if (trip) {
      await updateTrip(trip.id, { status: 'BOOKED' });
    }

    if (quote.leadId) {
      await updateLeadStatus(quote.leadId, 'BOOKED');
    }

    logAuditEvent('QUOTE_CONVERTED_TO_BOOKING', 'QUOTE', quote.id, { status: quote.status }, { status: 'ACCEPTED', bookingId: booking.id }, `Quote converted to confirmed booking ${booking.bookingReference}`);

    return booking;
  };

  // Approvals
  const approveAction = async (approvalId: string, feedback?: string) => {
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Demo-User-Id': currentUser.id,
    };
    if (auth && auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      } catch (err) {
        console.warn('Could not get Firebase ID token:', err);
      }
    }
    return headers;
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
      highPriorityLeads: leads.filter(l => l.priority === 'HIGH' || l.priority === 'URGENT').map(l => ({ name: l.customerName, dest: l.destination, budget: l.budget, status: l.status })),
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
        updateTrip,
        addItineraryDay,
        updateItineraryDay,
        deleteItineraryDay,
        addItineraryItem,
        deleteItineraryItem,
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
        isLoading
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
