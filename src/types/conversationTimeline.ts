import type { LeadContactOutcome } from './lead';

export const CONVERSATION_ENTRY_TYPES = [
  'MESSAGE',
  'INTERNAL_NOTE',
  'CALL_LOG',
  'SALES_INTERACTION',
  'QUOTE_EVENT',
  'SHARE_EVENT',
  'PAYMENT_EVENT',
  'BOOKING_EVENT',
  'SYSTEM_EVENT',
] as const;

export type ConversationEntryType = (typeof CONVERSATION_ENTRY_TYPES)[number];
export type ConversationChannel = 'WHATSAPP' | 'EMAIL' | 'PHONE' | 'MANUAL' | 'SYSTEM';
export type ConversationDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL' | 'SYSTEM';
export type ConversationVisibility = 'INTERNAL_ONLY' | 'CUSTOMER_COMMUNICATION' | 'SYSTEM';
export type ConversationActorType = 'CUSTOMER' | 'EMPLOYEE' | 'SYSTEM';
export type WhatsAppProviderStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
export type WhatsAppMessageType = 'TEXT' | 'TEMPLATE';

/**
 * Customer-relationship history. This is intentionally separate from AuditLog:
 * it contains communication and useful business milestones, not technical changes.
 */
export interface ConversationTimelineEntry {
  entryId: string;
  customerId?: string;
  leadId: string;
  tripId?: string;
  bookingId?: string;
  entryType: ConversationEntryType;
  channel: ConversationChannel;
  direction: ConversationDirection;
  visibility: ConversationVisibility;
  title: string;
  body?: string;
  actorType: ConversationActorType;
  actorEmployeeId?: string;
  actorName: string;
  occurredAt: string;
  createdAt: string;
  attachmentIds: string[];
  provider?: string;
  externalMessageId?: string;
  externalConversationId?: string;
  providerStatus?: WhatsAppProviderStatus;
  customerPhone?: string;
  providerConfirmed?: boolean;
  metadata?: {
    sourceType?: string;
    sourceId?: string;
    outcome?: LeadContactOutcome;
    nextFollowUpAt?: string | null;
    quoteVersion?: number;
    shareVersion?: number;
    viewCount?: number;
    amount?: number;
    currency?: string;
    manualLog?: boolean;
    demoSimulation?: boolean;
    messageType?: WhatsAppMessageType;
    templateName?: string;
    failureCode?: string;
    failureMessage?: string;
    retryCount?: number;
  };
}

export interface ConversationTimelinePage {
  entries: ConversationTimelineEntry[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface ConversationEntryCreateInput {
  kind: 'INTERNAL_NOTE' | 'MANUAL_CONTACT';
  body: string;
  idempotencyKey: string;
  channel?: Exclude<ConversationChannel, 'SYSTEM'>;
  direction?: Extract<ConversationDirection, 'INBOUND' | 'OUTBOUND'>;
  outcome?: LeadContactOutcome;
}

export interface ConversationEntryCreateResult {
  entry: ConversationTimelineEntry;
  idempotent: boolean;
}

export interface WhatsAppTemplateOption {
  name: string;
  label: string;
  languageCode: string;
}

export interface WhatsAppConversationContext {
  leadId: string;
  customerPhone: string;
  normalizedRecipient?: string;
  providerAvailable: boolean;
  demoProvider: boolean;
  sessionWindowOpen: boolean;
  lastInboundAt?: string;
  approvedTemplates: WhatsAppTemplateOption[];
}

export interface WhatsAppSendInput {
  idempotencyKey: string;
  messageType: WhatsAppMessageType;
  body: string;
  templateName?: string;
  languageCode?: string;
  templateParameters?: string[];
}

export interface WhatsAppSendResult {
  entry: ConversationTimelineEntry;
  idempotent: boolean;
}

export interface UnresolvedWhatsAppMessage {
  unresolvedId: string;
  provider: 'META' | 'META_MOCK';
  externalMessageId: string;
  customerPhone: string;
  customerName?: string;
  body: string;
  occurredAt: string;
  createdAt: string;
  reason: 'NO_CUSTOMER_MATCH' | 'NO_OPEN_LEAD' | 'AMBIGUOUS_LEAD_MATCH';
  status: 'UNRESOLVED' | 'LINKED';
  linkedLeadId?: string;
}
