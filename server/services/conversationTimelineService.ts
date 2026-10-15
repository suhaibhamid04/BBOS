import { createHash } from 'node:crypto';
import type {
  AuditLog,
  Booking,
  ConversationEntryCreateInput,
  ConversationEntryCreateResult,
  ConversationTimelineEntry,
  ConversationTimelinePage,
  Lead,
  LeadContactOutcome,
  LeadEvent,
  PaymentRecord,
  Quote,
} from '../../src/types/index.js';
import {
  FirestoreConversionStorageProvider,
  InMemoryConversionStorageProvider,
  type ConversionStorageProvider,
} from '../../src/services/conversion/conversionStorageProvider.js';
import { getAdminDb } from '../firebaseAdmin.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';

type UnknownRecord = Record<string, any>;

export interface ConversationActor extends AuthorizationPrincipal {
  name: string;
}

interface CustomerShareSource extends UnknownRecord {
  id: string;
  quoteGroupId: string;
  version: number;
  createdAt: string;
  createdByEmployeeId: string;
  createdByName: string;
  firstViewedAt?: string;
  lastViewedAt?: string;
  viewCount?: number;
  revokedAt?: string;
  revokedByEmployeeId?: string;
}

export interface ConversationTimelineSources {
  lead: Lead | null;
  entries: UnknownRecord[];
  leadEvents: LeadEvent[];
  quotes: Quote[];
  shares: CustomerShareSource[];
  bookings: Booking[];
  payments: PaymentRecord[];
  audits: AuditLog[];
}

export interface ConversationTimelineReadProvider {
  load(leadId: string, beforeOccurredAt?: string): Promise<ConversationTimelineSources>;
}

const SOURCE_LIMIT = 250;
const salesRoles = new Set(['Founder', 'Admin', 'Sales Manager', 'Sales Executive']);
const channels = new Set(['WHATSAPP', 'EMAIL', 'PHONE', 'MANUAL']);
const directions = new Set(['INBOUND', 'OUTBOUND']);
const outcomes = new Set<LeadContactOutcome>([
  'NO_ANSWER', 'CALLBACK_REQUESTED', 'INTERESTED', 'QUOTE_REQUESTED',
  'NEGOTIATING', 'ADVANCE_PROMISED', 'NOT_INTERESTED',
]);

export class ConversationTimelineError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ConversationTimelineError';
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function assertLeadAccess(actor: ConversationActor, lead: Lead): void {
  if (!actor.active || !salesRoles.has(actor.role)) {
    throw new ConversationTimelineError(403, 'CONVERSATION_ACCESS_DENIED', 'This role cannot access Sales conversations.');
  }
  if (actor.role === 'Founder' || actor.role === 'Admin') return;
  if (actor.role === 'Sales Executive') {
    if (!lead.assignedEmployeeId) throw new ConversationTimelineError(403, 'MISSING_OWNER_METADATA', 'Lead owner metadata is required.');
    if (lead.assignedEmployeeId === actor.employeeId) return;
  }
  if (actor.role === 'Sales Manager') {
    if (!actor.salesTeamId || !lead.salesTeamId) throw new ConversationTimelineError(403, 'MISSING_TEAM_METADATA', 'Sales team metadata is required.');
    if (lead.salesTeamId === actor.salesTeamId) return;
  }
  throw new ConversationTimelineError(403, 'LEAD_SCOPE_DENIED', 'This conversation is outside your Sales scope.');
}

function chunks<T>(values: T[], size = 30): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  return [...new Map(values.map(value => [value.id, value])).values()];
}

export class FirestoreConversationTimelineReadProvider implements ConversationTimelineReadProvider {
  async load(leadId: string, beforeOccurredAt?: string): Promise<ConversationTimelineSources> {
    const db = getAdminDb();
    const leadSnapshot = await db.collection('leads').doc(leadId).get();
    if (!leadSnapshot.exists) return { lead: null, entries: [], leadEvents: [], quotes: [], shares: [], bookings: [], payments: [], audits: [] };
    const lead = { id: leadSnapshot.id, ...leadSnapshot.data() } as Lead;
    let entryQuery: FirebaseFirestore.Query = db.collection('conversation_entries').where('leadId', '==', leadId);
    let eventQuery: FirebaseFirestore.Query = db.collection('lead_events').where('leadId', '==', leadId);
    if (beforeOccurredAt) {
      entryQuery = entryQuery.where('occurredAt', '<=', beforeOccurredAt);
      eventQuery = eventQuery.where('timestamp', '<=', beforeOccurredAt);
    }
    const [entrySnapshot, eventSnapshot, quoteSnapshot, bookingSnapshot] = await Promise.all([
      entryQuery.orderBy('occurredAt', 'desc').orderBy('entryId', 'desc').limit(SOURCE_LIMIT).get(),
      eventQuery.orderBy('timestamp', 'desc').orderBy('id', 'desc').limit(SOURCE_LIMIT).get(),
      db.collection('quotes').where('leadId', '==', leadId).limit(SOURCE_LIMIT).get(),
      db.collection('bookings').where('leadId', '==', leadId).limit(SOURCE_LIMIT).get(),
    ]);
    const entries = entrySnapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    const leadEvents = eventSnapshot.docs.map(document => ({ id: document.id, ...document.data() } as LeadEvent));
    const quotes = quoteSnapshot.docs.map(document => ({ id: document.id, ...document.data() } as Quote));
    const bookings = bookingSnapshot.docs.map(document => ({ id: document.id, ...document.data() } as Booking));

    const quoteGroupIds = [...new Set(quotes.map(quote => quote.quoteGroupId).filter((value): value is string => Boolean(value)))];
    const shareSnapshots = await Promise.all(chunks(quoteGroupIds).map(groupIds =>
      db.collection('customer_shares').where('quoteGroupId', 'in', groupIds).limit(SOURCE_LIMIT).get(),
    ));
    const shares = uniqueById(shareSnapshots.flatMap(snapshot => snapshot.docs.map(document => ({ id: document.id, ...document.data() } as CustomerShareSource))));

    const bookingIds = bookings.map(booking => booking.id);
    const paymentSnapshots = await Promise.all(chunks(bookingIds).map(ids =>
      db.collection('payments').where('bookingId', 'in', ids).limit(SOURCE_LIMIT).get(),
    ));
    const payments = uniqueById(paymentSnapshots.flatMap(snapshot => snapshot.docs.map(document => ({ id: document.id, ...document.data() } as PaymentRecord))));

    const auditableIds = [...new Set([...quotes.map(quote => quote.id), ...shares.map(share => share.id), ...bookings.map(booking => booking.id)])];
    const auditSnapshots = await Promise.all(chunks(auditableIds).map(ids =>
      db.collection('audit_logs').where('entityId', 'in', ids).limit(SOURCE_LIMIT).get(),
    ));
    const audits = uniqueById(auditSnapshots.flatMap(snapshot => snapshot.docs.map(document => ({ id: document.id, ...document.data() } as AuditLog))));
    return { lead, entries, leadEvents, quotes, shares, bookings, payments, audits };
  }
}

export class InMemoryConversationTimelineReadProvider implements ConversationTimelineReadProvider {
  constructor(private readonly storage: InMemoryConversionStorageProvider) {}

  async load(leadId: string, beforeOccurredAt?: string): Promise<ConversationTimelineSources> {
    const lead = this.storage.rawGet('leads', leadId) as Lead | null;
    if (!lead) return { lead: null, entries: [], leadEvents: [], quotes: [], shares: [], bookings: [], payments: [], audits: [] };
    const entries = this.storage.rawList('conversation_entries')
      .filter(value => value.leadId === leadId && (!beforeOccurredAt || value.occurredAt <= beforeOccurredAt))
      .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)) || String(right.entryId || right.id).localeCompare(String(left.entryId || left.id)))
      .slice(0, SOURCE_LIMIT);
    const leadEvents = this.storage.rawList('lead_events')
      .filter(value => value.leadId === leadId && (!beforeOccurredAt || value.timestamp <= beforeOccurredAt))
      .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)) || String(right.id).localeCompare(String(left.id)))
      .slice(0, SOURCE_LIMIT) as LeadEvent[];
    const quotes = this.storage.rawList('quotes').filter(value => value.leadId === leadId).slice(0, SOURCE_LIMIT) as Quote[];
    const groupIds = new Set(quotes.map(quote => quote.quoteGroupId).filter(Boolean));
    const shares = this.storage.rawList('customer_shares').filter(value => value.leadId === leadId || groupIds.has(value.quoteGroupId)).slice(0, SOURCE_LIMIT) as CustomerShareSource[];
    const bookings = this.storage.rawList('bookings').filter(value => value.leadId === leadId).slice(0, SOURCE_LIMIT) as Booking[];
    const bookingIds = new Set(bookings.map(booking => booking.id));
    const payments = this.storage.rawList('payments').filter(value => bookingIds.has(value.bookingId)).slice(0, SOURCE_LIMIT) as PaymentRecord[];
    const auditableIds = new Set([...quotes.map(quote => quote.id), ...shares.map(share => share.id), ...bookings.map(booking => booking.id)]);
    const audits = this.storage.rawList('audit_logs').filter(value => auditableIds.has(value.entityId)).slice(0, SOURCE_LIMIT) as AuditLog[];
    return { lead, entries, leadEvents, quotes, shares, bookings, payments, audits };
  }
}

function storedEntry(value: UnknownRecord): ConversationTimelineEntry | null {
  const entryId = text(value.entryId || value.id);
  const leadId = text(value.leadId);
  const occurredAt = text(value.occurredAt);
  const title = text(value.title);
  if (!entryId || !leadId || !occurredAt || !title) return null;
  return {
    entryId, leadId,
    ...(text(value.customerId) ? { customerId: text(value.customerId) } : {}),
    ...(text(value.tripId) ? { tripId: text(value.tripId) } : {}),
    ...(text(value.bookingId) ? { bookingId: text(value.bookingId) } : {}),
    entryType: value.entryType,
    channel: value.channel,
    direction: value.direction,
    visibility: value.visibility,
    title,
    ...(text(value.body) ? { body: text(value.body) } : {}),
    actorType: value.actorType,
    ...(text(value.actorEmployeeId) ? { actorEmployeeId: text(value.actorEmployeeId) } : {}),
    actorName: text(value.actorName) || 'System',
    occurredAt,
    createdAt: text(value.createdAt) || occurredAt,
    attachmentIds: Array.isArray(value.attachmentIds) ? value.attachmentIds.filter((item: unknown) => typeof item === 'string') : [],
    ...(text(value.provider) ? { provider: text(value.provider) } : {}),
    ...(text(value.externalMessageId) ? { externalMessageId: text(value.externalMessageId) } : {}),
    ...(text(value.externalConversationId) ? { externalConversationId: text(value.externalConversationId) } : {}),
    ...(text(value.providerStatus) ? { providerStatus: text(value.providerStatus) } : {}),
    ...(text(value.customerPhone) ? { customerPhone: text(value.customerPhone) } : {}),
    ...(typeof value.providerConfirmed === 'boolean' ? { providerConfirmed: value.providerConfirmed } : {}),
    ...(value.metadata && typeof value.metadata === 'object' ? { metadata: clone(value.metadata) } : {}),
  } as ConversationTimelineEntry;
}

function projectedEntry(input: Omit<ConversationTimelineEntry, 'attachmentIds' | 'createdAt'> & { createdAt?: string }): ConversationTimelineEntry {
  return { ...input, createdAt: input.createdAt || input.occurredAt, attachmentIds: [] };
}

function outcomeLabel(value: unknown): string {
  const labels: Record<string, string> = {
    NO_ANSWER: 'No answer', CALLBACK_REQUESTED: 'Callback requested', INTERESTED: 'Customer interested',
    QUOTE_REQUESTED: 'Quote requested', NEGOTIATING: 'Negotiation update', ADVANCE_PROMISED: 'Advance promised',
    NOT_INTERESTED: 'Customer not interested',
  };
  return labels[String(value)] || 'Sales interaction';
}

function cleanActorName(value: unknown): string {
  return text(value)?.replace(/\s+\([^)]*\)$/, '') || 'System';
}

function encodeCursor(entry: ConversationTimelineEntry): string {
  return Buffer.from(JSON.stringify({ occurredAt: entry.occurredAt, entryId: entry.entryId }), 'utf8').toString('base64url');
}

function decodeCursor(value: unknown): { occurredAt: string; entryId: string } | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!text(parsed.occurredAt) || !text(parsed.entryId)) throw new Error('Invalid cursor');
    return { occurredAt: parsed.occurredAt, entryId: parsed.entryId };
  } catch {
    throw new ConversationTimelineError(400, 'INVALID_TIMELINE_CURSOR', 'The conversation cursor is invalid.');
  }
}

function sortNewestFirst(left: ConversationTimelineEntry, right: ConversationTimelineEntry): number {
  return right.occurredAt.localeCompare(left.occurredAt) || right.entryId.localeCompare(left.entryId);
}

function isAfterCursor(entry: ConversationTimelineEntry, cursor: { occurredAt: string; entryId: string }): boolean {
  return entry.occurredAt < cursor.occurredAt || (entry.occurredAt === cursor.occurredAt && entry.entryId < cursor.entryId);
}

function projectTimeline(sources: ConversationTimelineSources): ConversationTimelineEntry[] {
  const lead = sources.lead!;
  const result: ConversationTimelineEntry[] = [];
  for (const value of sources.entries) {
    const entry = storedEntry(value);
    if (entry) result.push(entry);
  }

  result.push(projectedEntry({
    entryId: `lead-created:${lead.id}`, leadId: lead.id, customerId: lead.customerId,
    entryType: 'SYSTEM_EVENT', channel: 'SYSTEM', direction: 'SYSTEM', visibility: 'SYSTEM',
    title: 'Lead created', body: `${lead.destination} enquiry created.`, actorType: 'SYSTEM', actorName: 'BBOS',
    occurredAt: lead.createdAt, metadata: { sourceType: 'LEAD', sourceId: lead.id },
  }));
  if (text(lead.notes)) result.push(projectedEntry({
    entryId: `lead-notes:${lead.id}`, leadId: lead.id, customerId: lead.customerId,
    entryType: 'INTERNAL_NOTE', channel: 'MANUAL', direction: 'INTERNAL', visibility: 'INTERNAL_ONLY',
    title: 'Lead notes', body: lead.notes, actorType: 'EMPLOYEE', actorEmployeeId: lead.updatedByEmployeeId || lead.createdByEmployeeId,
    actorName: lead.assignedEmployeeName || 'Sales team', occurredAt: lead.updatedAt || lead.createdAt,
    metadata: { sourceType: 'LEAD', sourceId: lead.id },
  }));

  for (const event of sources.leadEvents) {
    const outcome = event.metadata?.outcome;
    const followUp = event.metadata?.nextFollowUpAt;
    const bodyParts = [text(event.metadata?.note)];
    if (followUp) bodyParts.push(`Follow-up scheduled for ${new Date(followUp).toLocaleString('en-IN')}.`);
    result.push(projectedEntry({
      entryId: `lead-event:${event.id}`, leadId: lead.id, customerId: lead.customerId,
      entryType: event.eventType === 'INTERACTION_RECORDED' ? 'SALES_INTERACTION' : 'SYSTEM_EVENT',
      channel: event.eventType === 'INTERACTION_RECORDED' ? 'PHONE' : 'SYSTEM',
      direction: event.eventType === 'INTERACTION_RECORDED' ? 'OUTBOUND' : 'SYSTEM',
      visibility: event.eventType === 'INTERACTION_RECORDED' ? 'CUSTOMER_COMMUNICATION' : 'SYSTEM',
      title: outcomeLabel(outcome || event.description), ...(bodyParts.filter(Boolean).length ? { body: bodyParts.filter(Boolean).join(' ') } : {}),
      actorType: event.actorType === 'SYSTEM' ? 'SYSTEM' : 'EMPLOYEE',
      ...(event.actorType !== 'SYSTEM' ? { actorEmployeeId: event.actorId } : {}), actorName: event.actorName || 'BBOS',
      occurredAt: event.timestamp, metadata: { sourceType: 'LEAD_EVENT', sourceId: event.id, ...(outcome ? { outcome } : {}), nextFollowUpAt: followUp || null },
    } as any));
  }

  const quoteGroups = new Map<string, Quote[]>();
  for (const quote of sources.quotes) {
    const key = quote.quoteGroupId || quote.id;
    quoteGroups.set(key, [...(quoteGroups.get(key) || []), quote]);
  }
  for (const [groupId, group] of quoteGroups) {
    const occurredAt = group.map(quote => quote.optionSnapshotCreatedAt || quote.createdAt).sort()[0];
    const representative = group[0];
    const version = 1;
    result.push(projectedEntry({
      entryId: `quote-group-created:${groupId}`, leadId: lead.id, customerId: lead.customerId, tripId: representative.tripId,
      entryType: 'QUOTE_EVENT', channel: 'SYSTEM', direction: 'SYSTEM', visibility: 'SYSTEM',
      title: group.length > 1 ? `Quote options created` : `Quote V${version} created`,
      body: group.length > 1 ? `${group.length} customer package options are available.` : undefined,
      actorType: 'SYSTEM', actorName: 'BBOS', occurredAt,
      metadata: { sourceType: 'QUOTE_GROUP', sourceId: groupId, quoteVersion: version },
    }));
    const recommended = group.find(quote => quote.isRecommended);
    if (recommended) result.push(projectedEntry({
      entryId: `quote-recommended:${recommended.id}`, leadId: lead.id, customerId: lead.customerId, tripId: recommended.tripId,
      entryType: 'QUOTE_EVENT', channel: 'SYSTEM', direction: 'SYSTEM', visibility: 'SYSTEM',
      title: `Option “${recommended.optionLabel || 'Recommended'}” recommended`, actorType: 'SYSTEM', actorName: 'BBOS',
      occurredAt: recommended.updatedAt || recommended.optionSnapshotCreatedAt || recommended.createdAt,
      metadata: { sourceType: 'QUOTE', sourceId: recommended.id, quoteVersion: recommended.version || 1 },
    }));
    const accepted = group.find(quote => quote.optionStatus === 'ACCEPTED' || quote.status === 'ACCEPTED');
    if (accepted) result.push(projectedEntry({
      entryId: `quote-accepted:${accepted.id}`, leadId: lead.id, customerId: lead.customerId, tripId: accepted.tripId,
      entryType: 'QUOTE_EVENT', channel: 'SYSTEM', direction: 'SYSTEM', visibility: 'SYSTEM',
      title: `Option “${accepted.optionLabel || 'Quote'}” accepted`, actorType: 'SYSTEM', actorName: 'BBOS',
      occurredAt: accepted.updatedAt || accepted.createdAt,
      metadata: { sourceType: 'QUOTE', sourceId: accepted.id, quoteVersion: accepted.version || 1 },
    }));
  }

  const auditsByEntity = new Map<string, AuditLog[]>();
  for (const audit of sources.audits) auditsByEntity.set(audit.entityId, [...(auditsByEntity.get(audit.entityId) || []), audit]);
  for (const quote of sources.quotes) {
    for (const audit of auditsByEntity.get(quote.id) || []) {
      if (!['QUOTE_UPDATED', 'QUOTE_OPTION_UPDATED'].includes(audit.action)) continue;
      const version = Number((audit.after as any)?.version || quote.version || 1);
      result.push(projectedEntry({
        entryId: `quote-revision:${audit.id}`, leadId: lead.id, customerId: lead.customerId, tripId: quote.tripId,
        entryType: 'QUOTE_EVENT', channel: 'SYSTEM', direction: 'SYSTEM', visibility: 'SYSTEM',
        title: `Quote V${version} created`, actorType: 'EMPLOYEE', actorEmployeeId: audit.actorId,
        actorName: cleanActorName(audit.actorName), occurredAt: audit.timestamp,
        metadata: { sourceType: 'AUDIT_EVENT', sourceId: audit.id, quoteVersion: version },
      }));
    }
  }
  for (const share of sources.shares) {
    result.push(projectedEntry({
      entryId: `share-created:${share.id}`, leadId: lead.id, customerId: lead.customerId,
      entryType: 'SHARE_EVENT', channel: 'SYSTEM', direction: 'OUTBOUND', visibility: 'SYSTEM',
      title: `Customer package V${share.version || 1} shared`, actorType: 'EMPLOYEE',
      actorEmployeeId: share.createdByEmployeeId, actorName: share.createdByName || 'Sales team', occurredAt: share.createdAt,
      metadata: { sourceType: 'CUSTOMER_SHARE', sourceId: share.id, shareVersion: share.version || 1 },
    }));
    if (share.lastViewedAt || share.firstViewedAt) result.push(projectedEntry({
      entryId: `share-viewed:${share.id}:${share.lastViewedAt || share.firstViewedAt}`, leadId: lead.id, customerId: lead.customerId,
      entryType: 'SHARE_EVENT', channel: 'SYSTEM', direction: 'INBOUND', visibility: 'SYSTEM',
      title: 'Package link viewed', body: `${Math.max(1, Number(share.viewCount || 1))} recorded view${Number(share.viewCount || 1) === 1 ? '' : 's'}.`,
      actorType: 'CUSTOMER', actorName: 'Customer', occurredAt: share.lastViewedAt || share.firstViewedAt!,
      metadata: { sourceType: 'CUSTOMER_SHARE', sourceId: share.id, shareVersion: share.version || 1, viewCount: Math.max(1, Number(share.viewCount || 1)) },
    }));
    if (share.revokedAt) result.push(projectedEntry({
      entryId: `share-revoked:${share.id}`, leadId: lead.id, customerId: lead.customerId,
      entryType: 'SHARE_EVENT', channel: 'SYSTEM', direction: 'SYSTEM', visibility: 'SYSTEM',
      title: 'Package link revoked', actorType: 'EMPLOYEE', actorEmployeeId: share.revokedByEmployeeId,
      actorName: 'Sales team', occurredAt: share.revokedAt,
      metadata: { sourceType: 'CUSTOMER_SHARE', sourceId: share.id, shareVersion: share.version || 1 },
    }));
    for (const audit of auditsByEntity.get(share.id) || []) {
      if (!['WHATSAPP_SHARE_PREPARED', 'EMAIL_SHARE_PREPARED'].includes(audit.action)) continue;
      const isWhatsapp = audit.action === 'WHATSAPP_SHARE_PREPARED';
      result.push(projectedEntry({
        entryId: `share-delivery:${audit.id}`, leadId: lead.id, customerId: lead.customerId,
        entryType: 'SHARE_EVENT', channel: isWhatsapp ? 'WHATSAPP' : 'EMAIL', direction: 'OUTBOUND', visibility: 'CUSTOMER_COMMUNICATION',
        title: `${isWhatsapp ? 'WhatsApp' : 'Email'} package message prepared`,
        body: 'Prepared for external delivery; provider sending is not confirmed.', actorType: 'EMPLOYEE',
        actorEmployeeId: audit.actorId, actorName: cleanActorName(audit.actorName), occurredAt: audit.timestamp,
        metadata: { sourceType: 'AUDIT_EVENT', sourceId: audit.id, shareVersion: Number((audit.after as any)?.version || share.version || 1) },
      }));
    }
  }

  for (const payment of sources.payments.filter(value => value.status === 'VERIFIED' && value.verifiedAt)) {
    result.push(projectedEntry({
      entryId: `payment-verified:${payment.id}`, leadId: lead.id, customerId: lead.customerId, bookingId: payment.bookingId,
      entryType: 'PAYMENT_EVENT', channel: 'SYSTEM', direction: 'INBOUND', visibility: 'SYSTEM',
      title: 'Verified payment received', body: `${payment.currency || 'INR'} ${Number(payment.amount).toLocaleString('en-IN')}`,
      actorType: 'EMPLOYEE', actorEmployeeId: payment.verifiedByEmployeeId, actorName: payment.verifiedByName || 'Accounts',
      occurredAt: payment.verifiedAt!, metadata: { sourceType: 'PAYMENT', sourceId: payment.id, amount: payment.amount, currency: payment.currency || 'INR' },
    }));
  }
  for (const booking of sources.bookings) {
    const confirmationAudit = (auditsByEntity.get(booking.id) || []).find(audit => audit.action === 'BOOKING_CONFIRMED_FROM_PAYMENT');
    if (!confirmationAudit && booking.status === 'PENDING_PAYMENT') continue;
    if (!confirmationAudit && !['CONFIRMED', 'IN_OPERATIONS', 'TRAVELLING', 'COMPLETED'].includes(booking.status)) continue;
    result.push(projectedEntry({
      entryId: `booking-confirmed:${booking.id}`, leadId: lead.id, customerId: lead.customerId, bookingId: booking.id, tripId: booking.tripId,
      entryType: 'BOOKING_EVENT', channel: 'SYSTEM', direction: 'SYSTEM', visibility: 'SYSTEM',
      title: 'Booking confirmed', body: booking.bookingReference ? `Booking ${booking.bookingReference}.` : undefined,
      actorType: confirmationAudit?.actorType === 'HUMAN' ? 'EMPLOYEE' : 'SYSTEM',
      ...(confirmationAudit?.actorId ? { actorEmployeeId: confirmationAudit.actorId } : {}),
      actorName: confirmationAudit ? cleanActorName(confirmationAudit.actorName) : 'BBOS',
      occurredAt: confirmationAudit?.timestamp || booking.updatedAt,
      metadata: { sourceType: confirmationAudit ? 'AUDIT_EVENT' : 'BOOKING', sourceId: confirmationAudit?.id || booking.id },
    }));
  }

  return [...new Map(result.map(entry => [entry.entryId, entry])).values()].sort(sortNewestFirst);
}

function entryFingerprint(input: ConversationEntryCreateInput): string {
  return createHash('sha256').update(JSON.stringify({
    kind: input.kind,
    body: text(input.body),
    channel: input.channel || null,
    direction: input.direction || null,
    outcome: input.outcome || null,
  })).digest('hex');
}

export class ConversationTimelineService {
  constructor(
    private readonly storage: ConversionStorageProvider = new FirestoreConversionStorageProvider(),
    private readonly reader: ConversationTimelineReadProvider = new FirestoreConversationTimelineReadProvider(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getTimeline(leadIdValue: unknown, actor: ConversationActor, options: { limit?: unknown; cursor?: unknown } = {}): Promise<ConversationTimelinePage> {
    const leadId = text(leadIdValue);
    if (!leadId) throw new ConversationTimelineError(400, 'LEAD_ID_REQUIRED', 'A Lead ID is required.');
    const limitNumber = options.limit === undefined ? 30 : Number(options.limit);
    if (!Number.isInteger(limitNumber) || limitNumber < 1 || limitNumber > 50) {
      throw new ConversationTimelineError(400, 'INVALID_TIMELINE_LIMIT', 'Conversation page size must be between 1 and 50.');
    }
    const cursor = decodeCursor(options.cursor);
    const sources = await this.reader.load(leadId, cursor?.occurredAt);
    if (!sources.lead) throw new ConversationTimelineError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
    assertLeadAccess(actor, sources.lead);
    const ordered = projectTimeline(sources);
    const eligible = cursor ? ordered.filter(entry => isAfterCursor(entry, cursor)) : ordered;
    const entries = eligible.slice(0, limitNumber);
    const hasMore = eligible.length > limitNumber;
    return {
      entries,
      hasMore,
      ...(hasMore && entries.length ? { nextCursor: encodeCursor(entries[entries.length - 1]) } : {}),
    };
  }

  async addEntry(leadIdValue: unknown, rawInput: unknown, actor: ConversationActor): Promise<ConversationEntryCreateResult> {
    const leadId = text(leadIdValue);
    if (!leadId) throw new ConversationTimelineError(400, 'LEAD_ID_REQUIRED', 'A Lead ID is required.');
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new ConversationTimelineError(400, 'INVALID_CONVERSATION_ENTRY', 'Conversation entry input must be an object.');
    }
    const input = rawInput as ConversationEntryCreateInput;
    const supported = new Set(['kind', 'body', 'idempotencyKey', 'channel', 'direction', 'outcome']);
    const unsupported = Object.keys(input).find(field => !supported.has(field));
    if (unsupported) throw new ConversationTimelineError(400, 'PROTECTED_CONVERSATION_FIELD', `${unsupported} is server-controlled or unsupported.`);
    if (input.kind !== 'INTERNAL_NOTE' && input.kind !== 'MANUAL_CONTACT') {
      throw new ConversationTimelineError(400, 'INVALID_ENTRY_KIND', 'Only an internal note or manual customer contact can be logged.');
    }
    const body = text(input.body);
    if (!body || body.length > 4_000) throw new ConversationTimelineError(400, 'INVALID_ENTRY_BODY', 'Entry text must be between 1 and 4,000 characters.');
    const idempotencyKey = text(input.idempotencyKey);
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
      throw new ConversationTimelineError(400, 'INVALID_IDEMPOTENCY_KEY', 'A valid idempotency key is required.');
    }
    if (input.kind === 'INTERNAL_NOTE' && (input.channel || input.direction || input.outcome)) {
      throw new ConversationTimelineError(400, 'INVALID_INTERNAL_NOTE_FIELDS', 'Internal notes do not accept customer channel, direction, or outcome fields.');
    }
    if (input.kind === 'MANUAL_CONTACT') {
      if (!channels.has(String(input.channel))) throw new ConversationTimelineError(400, 'INVALID_CONTACT_CHANNEL', 'Choose Phone, WhatsApp, Email, or Other.');
      if (!directions.has(String(input.direction))) throw new ConversationTimelineError(400, 'INVALID_CONTACT_DIRECTION', 'Choose inbound or outbound contact.');
      if (input.outcome && (!outcomes.has(input.outcome) || input.channel !== 'PHONE')) {
        throw new ConversationTimelineError(400, 'INVALID_CONTACT_OUTCOME', 'M3 outcomes may be attached only to manually logged phone calls.');
      }
    }
    const requestFingerprint = entryFingerprint({ ...input, body, idempotencyKey });
    const entryId = `conversation-${createHash('sha256').update(`${leadId}:${actor.employeeId}:${idempotencyKey}`).digest('hex').slice(0, 40)}`;

    return this.storage.runTransaction(async transaction => {
      const lead = await transaction.get('leads', leadId) as Lead | null;
      if (!lead) throw new ConversationTimelineError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
      assertLeadAccess(actor, lead);
      const existing = await transaction.get('conversation_entries', entryId) as UnknownRecord | null;
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw new ConversationTimelineError(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'This idempotency key was already used for different conversation content.');
        }
        const entry = storedEntry(existing);
        if (!entry) throw new ConversationTimelineError(500, 'INVALID_STORED_ENTRY', 'The stored conversation entry is invalid.');
        return { entry, idempotent: true };
      }
      const occurredAt = this.now().toISOString();
      const manualContact = input.kind === 'MANUAL_CONTACT';
      const channel = manualContact ? input.channel! : 'MANUAL';
      const entry: ConversationTimelineEntry = {
        entryId, leadId, customerId: lead.customerId,
        entryType: manualContact ? (channel === 'PHONE' ? 'CALL_LOG' : 'MESSAGE') : 'INTERNAL_NOTE',
        channel,
        direction: manualContact ? input.direction! : 'INTERNAL',
        visibility: manualContact ? 'CUSTOMER_COMMUNICATION' : 'INTERNAL_ONLY',
        title: manualContact
          ? channel === 'PHONE' && input.outcome ? `Phone call · ${outcomeLabel(input.outcome)}` : `${channel === 'MANUAL' ? 'Other' : channel.charAt(0) + channel.slice(1).toLowerCase()} contact logged`
          : 'Internal note',
        body,
        actorType: 'EMPLOYEE', actorEmployeeId: actor.employeeId, actorName: actor.name,
        occurredAt, createdAt: occurredAt, attachmentIds: [],
        metadata: { sourceType: 'CONVERSATION_ENTRY', sourceId: entryId, ...(input.outcome ? { outcome: input.outcome } : {}), ...(manualContact ? { manualLog: true } : {}) },
      };
      const stored = { ...entry, requestFingerprint, idempotencyKey };
      const action = manualContact ? 'CUSTOMER_CONTACT_LOGGED' : 'INTERNAL_NOTE_ADDED';
      const audit: AuditLog = {
        id: `audit-${entryId}`, timestamp: occurredAt, actorType: 'HUMAN', actorId: actor.employeeId,
        actorName: `${actor.name} (${actor.role})`, action, entityType: 'CONVERSATION_ENTRY', entityId: entryId,
        before: null, after: { entryId, leadId, entryType: entry.entryType, channel: entry.channel, direction: entry.direction, visibility: entry.visibility },
        reason: manualContact ? 'Manual customer contact recorded by Sales.' : 'Internal Sales note added.',
      };
      transaction.set('conversation_entries', entryId, stored);
      transaction.set('audit_logs', audit.id, audit);
      return { entry, idempotent: false };
    });
  }
}
