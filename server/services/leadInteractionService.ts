import { createHash } from 'node:crypto';
import type {
  Lead,
  LeadContactOutcome,
  LeadDropReason,
  LeadEvent,
  LeadInteractionInput,
  LeadInteractionResult,
  SalesQueueGroup,
  SalesQueueItem,
  SalesQueueProjection,
} from '../../src/types/index.js';
import {
  businessDateKey,
  classifyLeadFollowUp,
  SALES_BUSINESS_TIME_ZONE,
} from '../../src/utils/businessTime.js';
import {
  FirestoreConversionStorageProvider,
  type ConversionStorageProvider,
} from '../../src/services/conversion/conversionStorageProvider.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';

type UnknownRecord = Record<string, any>;

export interface LeadInteractionActor extends AuthorizationPrincipal {
  name: string;
}

const outcomes = new Set<LeadContactOutcome>([
  'NO_ANSWER', 'CALLBACK_REQUESTED', 'INTERESTED', 'QUOTE_REQUESTED',
  'NEGOTIATING', 'ADVANCE_PROMISED', 'NOT_INTERESTED',
]);
const dropReasons = new Set<LeadDropReason>([
  'NO_RESPONSE', 'BUDGET_MISMATCH', 'BOOKED_ELSEWHERE', 'DATES_UNAVAILABLE',
  'INVALID_ENQUIRY', 'DUPLICATE', 'NOT_INTERESTED', 'OTHER',
]);
const closedStatuses = new Set(['CONVERTED', 'DROPPED', 'CANCELLED']);

export class LeadInteractionError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'LeadInteractionError';
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function authorize(actor: LeadInteractionActor, lead: Lead) {
  if (actor.role === 'Founder' || actor.role === 'Admin') return;
  if (actor.role === 'Sales Executive' && lead.assignedEmployeeId === actor.employeeId) return;
  if (actor.role === 'Sales Manager' && actor.salesTeamId && lead.salesTeamId === actor.salesTeamId) return;
  throw new LeadInteractionError(403, 'LEAD_SCOPE_DENIED', 'This Lead is outside your Sales scope.');
}

function interactionStatus(current: Lead['status'], outcome: LeadContactOutcome): Lead['status'] {
  if (outcome === 'NOT_INTERESTED') return 'DROPPED';
  if (outcome === 'NEGOTIATING') return 'NEGOTIATION';
  if (current !== 'NEW' && current !== 'CONTACTED') return current;
  if (outcome === 'NO_ANSWER' || outcome === 'CALLBACK_REQUESTED') return 'CONTACTED';
  return 'IN_PROGRESS';
}

function fingerprint(input: LeadInteractionInput): string {
  return createHash('sha256').update(JSON.stringify({
    outcome: input.outcome,
    expectedUpdatedAt: input.expectedUpdatedAt,
    note: text(input.note) || null,
    nextFollowUpAt: text(input.nextFollowUpAt) || null,
    dropReason: input.dropReason || null,
    dropNote: text(input.dropNote) || null,
  })).digest('hex');
}

function eventId(leadId: string, actorEmployeeId: string, idempotencyKey: string): string {
  return `lead-event-${createHash('sha256').update(`${leadId}:${actorEmployeeId}:${idempotencyKey}`).digest('hex').slice(0, 32)}`;
}

function outcomeLabel(outcome: LeadContactOutcome): string {
  const labels: Record<LeadContactOutcome, string> = {
    NO_ANSWER: 'No answer', CALLBACK_REQUESTED: 'Callback requested', INTERESTED: 'Spoke — interested',
    QUOTE_REQUESTED: 'Quote requested', NEGOTIATING: 'Negotiating', ADVANCE_PROMISED: 'Advance promised',
    NOT_INTERESTED: 'Not interested',
  };
  return labels[outcome];
}

function statusLabel(status: Lead['status']): string {
  const labels: Record<Lead['status'], string> = {
    NEW: 'New Lead', CONTACTED: 'In progress', IN_PROGRESS: 'In progress',
    QUOTE_SHARED: 'Quote sent — awaiting reply', NEGOTIATION: 'Negotiating', ON_HOLD: 'On hold',
    CONVERTED: 'Booked', DROPPED: 'Closed', CANCELLED: 'Cancelled',
  };
  return labels[status];
}

function validateNextFollowUp(value: unknown): string | undefined {
  const normalized = text(value);
  if (!normalized) return undefined;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new LeadInteractionError(400, 'INVALID_FOLLOW_UP_TIME', 'nextFollowUpAt must be a valid date and time.');
  }
  return parsed.toISOString();
}

function queueSort(group: SalesQueueGroup, left: SalesQueueItem, right: SalesQueueItem): number {
  if (group === 'NEEDS_ATTENTION') return right.updatedAt.localeCompare(left.updatedAt);
  return String(left.nextFollowUpAt || '').localeCompare(String(right.nextFollowUpAt || ''));
}

export class LeadInteractionService {
  constructor(
    private readonly storage: ConversionStorageProvider = new FirestoreConversionStorageProvider(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async recordInteraction(
    leadId: string,
    raw: LeadInteractionInput,
    actor: LeadInteractionActor,
  ): Promise<LeadInteractionResult> {
    if (!outcomes.has(raw.outcome)) throw new LeadInteractionError(400, 'INVALID_CONTACT_OUTCOME', 'Choose a supported contact outcome.');
    const expectedUpdatedAt = text(raw.expectedUpdatedAt);
    if (!expectedUpdatedAt) throw new LeadInteractionError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedUpdatedAt is required.');
    const idempotencyKey = text(raw.idempotencyKey);
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
      throw new LeadInteractionError(400, 'INVALID_IDEMPOTENCY_KEY', 'A valid idempotencyKey is required.');
    }
    const note = text(raw.note);
    if (note && note.length > 2_000) throw new LeadInteractionError(400, 'INTERACTION_NOTE_TOO_LONG', 'Interaction notes must be 2,000 characters or fewer.');
    const nextFollowUpAt = validateNextFollowUp(raw.nextFollowUpAt);
    if (['CALLBACK_REQUESTED', 'NEGOTIATING'].includes(raw.outcome) && !nextFollowUpAt) {
      throw new LeadInteractionError(400, 'NEXT_FOLLOW_UP_REQUIRED', `${outcomeLabel(raw.outcome)} requires a next follow-up date and time.`);
    }
    if (raw.outcome === 'NOT_INTERESTED' && (!raw.dropReason || !dropReasons.has(raw.dropReason))) {
      throw new LeadInteractionError(400, 'DROP_REASON_REQUIRED', 'A valid drop reason is required when the customer is not interested.');
    }

    const requestFingerprint = fingerprint(raw);
    const interactionEventId = eventId(leadId, actor.employeeId, idempotencyKey);
    return this.storage.runTransaction(async tx => {
      const existingEvent = await tx.get('lead_events', interactionEventId) as LeadEvent | null;
      const stored = await tx.get('leads', leadId) as Lead | null;
      if (!stored) throw new LeadInteractionError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
      authorize(actor, stored);
      if (existingEvent) {
        if (existingEvent.metadata?.requestFingerprint !== requestFingerprint) {
          throw new LeadInteractionError(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'This idempotency key was already used for a different interaction.');
        }
        return { lead: stored, eventId: existingEvent.id, idempotent: true };
      }
      if (closedStatuses.has(stored.status)) throw new LeadInteractionError(422, 'LEAD_CLOSED', 'Closed Leads cannot receive new Sales interactions.');
      if (stored.updatedAt !== expectedUpdatedAt) {
        throw new LeadInteractionError(409, 'LEAD_VERSION_CONFLICT', 'This Lead changed after you opened it. Reload before recording the interaction.');
      }

      const occurredAt = this.now().toISOString();
      const resultingStatus = interactionStatus(stored.status, raw.outcome);
      const updated: Lead = {
        ...stored,
        status: resultingStatus,
        lastContactAt: occurredAt,
        lastContactOutcome: raw.outcome,
        lastContactByEmployeeId: actor.employeeId,
        nextFollowUpAt: raw.outcome === 'NOT_INTERESTED' ? null : nextFollowUpAt || null,
        updatedAt: occurredAt,
        updatedByEmployeeId: actor.employeeId,
        ...(raw.outcome === 'NOT_INTERESTED' ? {
          dropReason: raw.dropReason!,
          ...(text(raw.dropNote) || note ? { dropNote: text(raw.dropNote) || note } : {}),
        } : {}),
      };
      if (raw.outcome !== 'NOT_INTERESTED') {
        delete updated.dropReason;
        delete updated.dropNote;
      }

      const event: LeadEvent = {
        id: interactionEventId,
        leadId,
        actorType: 'HUMAN',
        actorId: actor.employeeId,
        actorName: actor.name,
        eventType: 'INTERACTION_RECORDED',
        description: outcomeLabel(raw.outcome),
        timestamp: occurredAt,
        metadata: {
          outcome: raw.outcome,
          ...(note ? { note } : {}),
          nextFollowUpAt: updated.nextFollowUpAt,
          previousStatus: stored.status,
          resultingStatus,
          idempotencyKey,
          requestFingerprint,
        },
      };
      const audit = {
        id: `audit-${interactionEventId}`,
        action: raw.outcome === 'NOT_INTERESTED' ? 'LEAD_DROPPED' : 'LEAD_INTERACTION_RECORDED',
        entityType: 'LEAD', entityId: leadId,
        actorId: actor.employeeId, actorName: `${actor.name} (${actor.role})`,
        actor: { id: actor.employeeId, name: actor.name, role: actor.role },
        before: stored,
        after: updated,
        summary: `${outcomeLabel(raw.outcome)} recorded.`,
        reason: `${outcomeLabel(raw.outcome)} recorded.`,
        timestamp: occurredAt,
      };
      tx.set('leads', leadId, updated);
      tx.set('lead_events', event.id, event);
      tx.set('audit_logs', audit.id, audit);
      return { lead: updated, eventId: event.id, idempotent: false };
    });
  }

  async getSalesQueue(actor: LeadInteractionActor): Promise<SalesQueueProjection> {
    if (!['Founder', 'Admin', 'Sales Manager', 'Sales Executive'].includes(actor.role)) {
      throw new LeadInteractionError(403, 'SALES_QUEUE_DENIED', 'This role cannot access the Sales queue.');
    }
    if (actor.role === 'Sales Manager' && !actor.salesTeamId) {
      throw new LeadInteractionError(403, 'MISSING_TEAM_METADATA', 'Sales team metadata is required.');
    }
    const now = this.now();
    return this.storage.runTransaction(async tx => {
      const leads = actor.role === 'Sales Executive'
        ? await tx.findByField('leads', 'assignedEmployeeId', actor.employeeId, 500)
        : actor.role === 'Sales Manager'
          ? await tx.findByField('leads', 'salesTeamId', actor.salesTeamId!, 500)
          : await tx.list('leads', 500);
      const quotes = actor.role === 'Sales Executive'
        ? await tx.findByField('quotes', 'salesEmployeeId', actor.employeeId, 1_000)
        : actor.role === 'Sales Manager'
          ? await tx.findByField('quotes', 'salesTeamId', actor.salesTeamId!, 1_000)
          : await tx.list('quotes', 1_000);
      const quotesByLead = new Map<string, UnknownRecord>();
      for (const quote of quotes) {
        if (!quote.leadId || !quote.sharedAt) continue;
        const existing = quotesByLead.get(quote.leadId);
        if (!existing || String(quote.sharedAt) > String(existing.sharedAt)) quotesByLead.set(quote.leadId, quote);
      }

      const groups: SalesQueueProjection['groups'] = { OVERDUE: [], TODAY: [], NEEDS_ATTENTION: [], UPCOMING: [] };
      for (const rawLead of leads) {
        const lead = rawLead as Lead;
        const group = classifyLeadFollowUp(lead, now);
        if (!group) continue;
        const quote = quotesByLead.get(lead.id);
        const secondaryContext: string[] = [];
        if (lead.status === 'NEW') secondaryContext.push('New Lead');
        if (lead.status === 'QUOTE_SHARED') secondaryContext.push('Quote sent — awaiting reply');
        if (lead.status === 'NEGOTIATION') secondaryContext.push('Negotiating');
        if (lead.lastContactOutcome === 'ADVANCE_PROMISED') secondaryContext.push('Advance promised — payment not yet verified');
        const item: SalesQueueItem = {
          leadId: lead.id, group,
          customerName: lead.customerName,
          customerPhone: lead.customerPhone || '',
          destination: lead.destination,
          ...(lead.travelStartDate ? { travelStartDate: lead.travelStartDate } : {}),
          ...(lead.travelEndDate ? { travelEndDate: lead.travelEndDate } : {}),
          ...(lead.nights !== undefined ? { nights: lead.nights } : {}),
          ...(lead.adults !== undefined ? { adults: lead.adults } : {}),
          children: lead.children || 0,
          childAges: Array.isArray(lead.childAges) ? lead.childAges : [],
          ...(lead.travelerCount !== undefined ? { travelerCount: lead.travelerCount } : {}),
          status: lead.status,
          statusLabel: statusLabel(lead.status),
          priority: lead.priority,
          ...(lead.assignedEmployeeId ? { assignedEmployeeId: lead.assignedEmployeeId } : {}),
          ...(lead.assignedEmployeeName ? { assignedEmployeeName: lead.assignedEmployeeName } : {}),
          ...(lead.salesTeamId ? { salesTeamId: lead.salesTeamId } : {}),
          ...(lead.lastContactAt ? { lastContactAt: lead.lastContactAt } : {}),
          ...(lead.lastContactOutcome ? { lastContactOutcome: lead.lastContactOutcome } : {}),
          ...(lead.lastContactByEmployeeId ? { lastContactByEmployeeId: lead.lastContactByEmployeeId } : {}),
          nextFollowUpAt: lead.nextFollowUpAt || null,
          secondaryContext,
          updatedAt: lead.updatedAt,
        };
        if (quote?.sharedAt) {
          const ageDays = Math.max(0, Math.floor((now.getTime() - new Date(quote.sharedAt).getTime()) / 86_400_000));
          item.quoteContext = {
            quoteId: quote.id,
            status: quote.status || 'SENT',
            sharedAt: quote.sharedAt,
            ageDays,
            label: ageDays === 0 ? 'Quote sent today' : ageDays === 1 ? 'Quote sent yesterday' : `Quote sent ${ageDays} days ago`,
          };
        }
        groups[group].push(item);
      }
      for (const group of Object.keys(groups) as SalesQueueGroup[]) groups[group].sort((a, b) => queueSort(group, a, b));
      return {
        businessTimeZone: SALES_BUSINESS_TIME_ZONE,
        businessDate: businessDateKey(now),
        serverNow: now.toISOString(),
        groups,
        counts: {
          OVERDUE: groups.OVERDUE.length,
          TODAY: groups.TODAY.length,
          NEEDS_ATTENTION: groups.NEEDS_ATTENTION.length,
          UPCOMING: groups.UPCOMING.length,
        },
      };
    });
  }
}
