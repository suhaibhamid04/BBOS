import type { DestinationRegion, TripType } from './index';

export const LEAD_SOURCES = [
  { id: 'META_FACEBOOK_ADS', label: 'Meta/Facebook Ads', sourceType: 'META' },
  { id: 'INSTAGRAM', label: 'Instagram', sourceType: 'MANUAL' },
  { id: 'GOOGLE_ADS', label: 'Google Ads', sourceType: 'MANUAL' },
  { id: 'WEBSITE', label: 'Website', sourceType: 'WEBSITE' },
  { id: 'REFERRAL', label: 'Referral', sourceType: 'MANUAL' },
  { id: 'REPEAT_CUSTOMER', label: 'Repeat Customer', sourceType: 'MANUAL' },
  { id: 'DIRECT_CALL', label: 'Direct Call', sourceType: 'MANUAL' },
  { id: 'WHATSAPP', label: 'WhatsApp', sourceType: 'MANUAL' },
  { id: 'B2B', label: 'B2B', sourceType: 'MANUAL' },
  { id: 'OFFLINE_WALK_IN', label: 'Offline/Walk-in', sourceType: 'MANUAL' },
] as const;

export type LeadSourceId = (typeof LEAD_SOURCES)[number]['id'];
export type LeadCreatedSourceType = 'MANUAL' | 'IMPORT' | 'API' | 'META' | 'WEBSITE';

export const LEAD_STAGES = [
  'NEW', 'CONTACTED', 'IN_PROGRESS', 'QUOTE_SHARED', 'NEGOTIATION',
  'ON_HOLD', 'CONVERTED', 'DROPPED', 'CANCELLED',
] as const;
export type LeadStatus = (typeof LEAD_STAGES)[number];

export const LEAD_PRIORITIES = ['HOT', 'WARM', 'NORMAL', 'COLD'] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const LEAD_DROP_REASONS = [
  'NO_RESPONSE', 'BUDGET_MISMATCH', 'BOOKED_ELSEWHERE', 'DATES_UNAVAILABLE',
  'INVALID_ENQUIRY', 'DUPLICATE', 'NOT_INTERESTED', 'OTHER',
] as const;
export type LeadDropReason = (typeof LEAD_DROP_REASONS)[number];

export interface Lead {
  id: string;
  customerId: string;
  companyId?: string;
  salutation?: string;
  customerName: string;
  customerPhone: string;
  alternatePhone?: string;
  whatsAppNumber?: string;
  customerEmail?: string;
  customerCity?: string;

  sourceId: LeadSourceId;
  source: string;
  sourcePlatform: string;
  sourceReference?: string;
  createdSourceType: LeadCreatedSourceType;
  campaignId?: string;
  formId?: string;
  adId?: string;
  contentId?: string;
  tags: string[];

  destination: DestinationRegion;
  travelStartDate?: string;
  travelEndDate?: string;
  nights?: number;
  travelerCount?: number;
  adults?: number;
  children?: number;
  childAges: number[];
  focCount?: number;
  tripType?: TripType;
  budget?: number;
  hotelPreference?: string;
  mealPlanPreference?: string;
  vehiclePreference?: string;
  /** Compatibility alias retained while existing package code migrates. */
  transportPreference?: string;
  specialRequirements?: string;

  status: LeadStatus;
  priority: LeadPriority;
  assignedEmployeeId: string;
  assignedEmployeeName: string;
  salesTeamId?: string;
  assignedManagerId?: string;
  notes: string;
  dropReason?: LeadDropReason;
  dropNote?: string;

  leadScore?: number;
  bookingProbability?: number;
  lastContactAt?: string;
  nextFollowUpAt?: string;
  keyInterests?: string[];
  scoreReasoning?: string;
  creationRequestId?: string;
  createdByEmployeeId?: string;
  updatedByEmployeeId?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export type CreateLeadInput = Omit<Partial<Lead>,
  'id' | 'customerId' | 'source' | 'sourcePlatform' | 'createdSourceType' |
  'status' | 'salesTeamId' | 'assignedEmployeeName' | 'createdByEmployeeId' |
  'updatedByEmployeeId' | 'createdAt' | 'updatedAt'
> & {
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  destination: DestinationRegion;
  sourceId: LeadSourceId;
  assignedEmployeeId?: string;
  creationRequestId?: string;
};

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

export function leadSourceById(value: unknown) {
  return LEAD_SOURCES.find(source => source.id === value);
}

export function normalizeLeadPhone(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '').replace(/^0+/, '') : '';
}

export function normalizeLeadEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
