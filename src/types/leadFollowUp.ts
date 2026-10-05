import type { Lead, LeadContactOutcome, LeadDropReason, LeadPriority, LeadStatus } from './lead';

export type SalesQueueGroup = 'OVERDUE' | 'TODAY' | 'NEEDS_ATTENTION' | 'UPCOMING';

export interface LeadInteractionInput {
  outcome: LeadContactOutcome;
  expectedUpdatedAt: string;
  idempotencyKey: string;
  note?: string;
  nextFollowUpAt?: string;
  dropReason?: LeadDropReason;
  dropNote?: string;
}

export interface LeadInteractionResult {
  lead: Lead;
  eventId: string;
  idempotent: boolean;
}

export interface SalesQueueItem {
  leadId: string;
  group: SalesQueueGroup;
  customerName: string;
  customerPhone: string;
  destination: string;
  travelStartDate?: string;
  travelEndDate?: string;
  nights?: number;
  adults?: number;
  children: number;
  childAges: number[];
  travelerCount?: number;
  status: LeadStatus;
  statusLabel: string;
  priority: LeadPriority;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  salesTeamId?: string;
  lastContactAt?: string;
  lastContactOutcome?: LeadContactOutcome;
  lastContactByEmployeeId?: string;
  nextFollowUpAt?: string | null;
  quoteContext?: {
    quoteId: string;
    status: string;
    sharedAt: string;
    ageDays: number;
    label: string;
  };
  secondaryContext: string[];
  updatedAt: string;
}

export interface SalesQueueProjection {
  businessTimeZone: 'Asia/Kolkata';
  businessDate: string;
  serverNow: string;
  groups: Record<SalesQueueGroup, SalesQueueItem[]>;
  counts: Record<SalesQueueGroup, number>;
}
