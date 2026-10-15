import { beforeEach, describe, expect, it } from 'bun:test';
import {
  ConversationTimelineService,
  InMemoryConversationTimelineReadProvider,
  type ConversationActor,
} from '../../server/services/conversationTimelineService';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import type { Lead } from '../../src/types';

describe('M6A conversation domain and unified timeline', () => {
  let storage: InMemoryConversionStorageProvider;
  let service: ConversationTimelineService;

  const executive: ConversationActor = { employeeId: 'emp-sales-01', role: 'Sales Executive', active: true, salesTeamId: 'team-01', name: 'Sana' };
  const otherExecutive: ConversationActor = { employeeId: 'emp-sales-02', role: 'Sales Executive', active: true, salesTeamId: 'team-01', name: 'Omar' };
  const manager: ConversationActor = { employeeId: 'emp-manager-01', role: 'Sales Manager', active: true, salesTeamId: 'team-01', name: 'Manager' };
  const otherManager: ConversationActor = { employeeId: 'emp-manager-02', role: 'Sales Manager', active: true, salesTeamId: 'team-02', name: 'Other Manager' };
  const founder: ConversationActor = { employeeId: 'emp-founder-01', role: 'Founder', active: true, name: 'Founder' };
  const marketing: ConversationActor = { employeeId: 'emp-marketing-01', role: 'Marketing', active: true, name: 'Marketing' };

  const lead: Lead = {
    id: 'lead-01', customerId: 'customer-01', customerName: 'Aamir Khan', customerPhone: '9999999999',
    sourceId: 'DIRECT_CALL', source: 'Direct Call', sourcePlatform: 'Direct Call', createdSourceType: 'MANUAL', tags: [],
    destination: 'Kashmir', childAges: [], status: 'IN_PROGRESS', priority: 'HOT', assignedEmployeeId: executive.employeeId,
    assignedEmployeeName: executive.name, salesTeamId: 'team-01', notes: '', createdByEmployeeId: executive.employeeId,
    updatedByEmployeeId: executive.employeeId, createdAt: '2026-10-01T01:00:00.000Z', updatedAt: '2026-10-01T01:00:00.000Z',
  };

  beforeEach(() => {
    storage = new InMemoryConversionStorageProvider({ leads: [lead] });
    service = new ConversationTimelineService(storage, new InMemoryConversationTimelineReadProvider(storage), () => new Date('2026-10-01T10:00:00.000Z'));
  });

  it('adds immutable internal notes and manual inbound/outbound contacts with canonical actor and idempotency', async () => {
    const noteInput = { kind: 'INTERNAL_NOTE' as const, body: 'Customer prefers a hotel near the Gondola.', idempotencyKey: 'note-request-001' };
    const note = await service.addEntry(lead.id, noteInput, executive);
    expect(note.idempotent).toBe(false);
    expect(note.entry).toMatchObject({
      entryType: 'INTERNAL_NOTE', visibility: 'INTERNAL_ONLY', direction: 'INTERNAL',
      actorEmployeeId: executive.employeeId, actorName: executive.name,
    });
    expect((await service.addEntry(lead.id, noteInput, executive)).idempotent).toBe(true);
    expect(storage.rawList('conversation_entries')).toHaveLength(1);
    await expect(service.addEntry(lead.id, { ...noteInput, body: 'Different content' }, executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });

    const inbound = await service.addEntry(lead.id, {
      kind: 'MANUAL_CONTACT', body: 'Customer wants Premium hotel.', idempotencyKey: 'contact-in-001', channel: 'WHATSAPP', direction: 'INBOUND',
    }, executive);
    expect(inbound.entry).toMatchObject({ entryType: 'MESSAGE', channel: 'WHATSAPP', direction: 'INBOUND', visibility: 'CUSTOMER_COMMUNICATION', metadata: { manualLog: true } });
    const outbound = await service.addEntry(lead.id, {
      kind: 'MANUAL_CONTACT', body: 'Promised to share a revised option.', idempotencyKey: 'contact-out-001', channel: 'EMAIL', direction: 'OUTBOUND',
    }, executive);
    expect(outbound.entry.direction).toBe('OUTBOUND');
    const call = await service.addEntry(lead.id, {
      kind: 'MANUAL_CONTACT', body: 'Asked for a callback tomorrow.', idempotencyKey: 'phone-call-001', channel: 'PHONE', direction: 'INBOUND', outcome: 'CALLBACK_REQUESTED',
    }, executive);
    expect(call.entry).toMatchObject({ entryType: 'CALL_LOG', title: 'Phone call · Callback requested', metadata: { outcome: 'CALLBACK_REQUESTED', manualLog: true } });

    const audits = storage.rawList('audit_logs');
    expect(audits.find(item => item.action === 'INTERNAL_NOTE_ADDED')).toMatchObject({ actorId: executive.employeeId, entityType: 'CONVERSATION_ENTRY' });
    expect(audits.filter(item => item.action === 'CUSTOMER_CONTACT_LOGGED')).toHaveLength(3);
    expect(JSON.stringify(audits)).not.toContain('Customer prefers a hotel near the Gondola.');
  });

  it('enforces OWN, TEAM and ALL scope and fails closed for unauthorized or malformed authority', async () => {
    expect((await service.getTimeline(lead.id, executive)).entries.length).toBeGreaterThan(0);
    expect((await service.getTimeline(lead.id, manager)).entries.length).toBeGreaterThan(0);
    expect((await service.getTimeline(lead.id, founder)).entries.length).toBeGreaterThan(0);
    await expect(service.getTimeline(lead.id, otherExecutive)).rejects.toMatchObject({ statusCode: 403, code: 'LEAD_SCOPE_DENIED' });
    await expect(service.getTimeline(lead.id, otherManager)).rejects.toMatchObject({ statusCode: 403, code: 'LEAD_SCOPE_DENIED' });
    await expect(service.getTimeline(lead.id, marketing)).rejects.toMatchObject({ statusCode: 403, code: 'CONVERSATION_ACCESS_DENIED' });
    await expect(service.addEntry(lead.id, {
      kind: 'INTERNAL_NOTE', body: 'Forged', idempotencyKey: 'forged-entry-001', actorEmployeeId: founder.employeeId,
    } as any, executive)).rejects.toMatchObject({ statusCode: 400, code: 'PROTECTED_CONVERSATION_FIELD' });
    await expect(service.addEntry(lead.id, {
      kind: 'SYSTEM_EVENT', body: 'Payment received', idempotencyKey: 'forged-system-01',
    } as any, executive)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ENTRY_KIND' });
    await expect(service.addEntry(lead.id, {
      kind: 'MANUAL_CONTACT', body: 'Forged provider event', idempotencyKey: 'forged-provider-01',
      channel: 'WHATSAPP', direction: 'INBOUND', provider: 'META', providerStatus: 'READ', providerConfirmed: true,
    } as any, executive)).rejects.toMatchObject({ statusCode: 400, code: 'PROTECTED_CONVERSATION_FIELD' });
    expect(storage.rawList('conversation_entries')).toHaveLength(0);

    storage.rawUpdate('leads', lead.id, { assignedEmployeeId: null });
    await expect(service.getTimeline(lead.id, executive)).rejects.toMatchObject({ statusCode: 403, code: 'MISSING_OWNER_METADATA' });
  });

  it('projects meaningful domain history chronologically without exposing technical or supplier economics', async () => {
    storage.rawSet('lead_events', 'lead-event-01', {
      id: 'lead-event-01', leadId: lead.id, actorType: 'HUMAN', actorId: executive.employeeId, actorName: executive.name,
      eventType: 'INTERACTION_RECORDED', description: 'Callback requested', timestamp: '2026-10-01T02:00:00.000Z',
      metadata: { outcome: 'CALLBACK_REQUESTED', note: 'Customer called about dates.', nextFollowUpAt: '2026-10-02T05:00:00.000Z' },
    });
    storage.rawSet('quotes', 'quote-01', {
      id: 'quote-01', leadId: lead.id, customerId: lead.customerId, customerName: lead.customerName, destination: 'Kashmir',
      travelerCount: 2, totalAmount: 72000, discountAmount: 0, finalAmount: 72000, totalSupplierCost: 50000,
      grossProfit: 22000, grossMargin: 30.5, status: 'SENT', validUntil: '2026-10-31', tripId: 'trip-01',
      quoteGroupId: 'group-01', optionId: 'quote-01', optionLabel: 'Recommended', optionOrder: 1, isRecommended: true,
      optionStatus: 'SHARED', version: 1, versionHistory: [], salesEmployeeId: executive.employeeId, salesTeamId: 'team-01',
      createdAt: '2026-10-01T03:00:00.000Z', updatedAt: '2026-10-01T03:10:00.000Z',
    });
    storage.rawSet('customer_shares', 'share-01', {
      id: 'share-01', leadId: lead.id, customerId: lead.customerId, quoteGroupId: 'group-01', version: 2,
      createdByEmployeeId: executive.employeeId, createdByName: executive.name, salesEmployeeId: executive.employeeId,
      salesTeamId: 'team-01', status: 'ACTIVE', tokenHash: 'secret-token-hash', snapshot: { supplierCost: 999 },
      createdAt: '2026-10-01T04:00:00.000Z', firstViewedAt: '2026-10-01T06:00:00.000Z',
      lastViewedAt: '2026-10-01T07:00:00.000Z', viewCount: 2,
    });
    storage.rawSet('audit_logs', 'audit-whatsapp', {
      id: 'audit-whatsapp', timestamp: '2026-10-01T05:00:00.000Z', actorType: 'HUMAN', actorId: executive.employeeId,
      actorName: 'Sana (Sales Executive)', action: 'WHATSAPP_SHARE_PREPARED', entityType: 'CUSTOMER_SHARE', entityId: 'share-01',
      after: { version: 2, supplierCost: 50000, grossProfit: 22000 },
    });
    storage.rawSet('audit_logs', 'audit-email', {
      id: 'audit-email', timestamp: '2026-10-01T05:30:00.000Z', actorType: 'HUMAN', actorId: executive.employeeId,
      actorName: 'Sana (Sales Executive)', action: 'EMAIL_SHARE_PREPARED', entityType: 'CUSTOMER_SHARE', entityId: 'share-01', after: { version: 2 },
    });
    storage.rawSet('bookings', 'booking-01', {
      id: 'booking-01', bookingReference: 'BB-1001', tripId: 'trip-01', leadId: lead.id, customerId: lead.customerId,
      status: 'CONFIRMED', amountReceived: 5000, amountPending: 67000, travelStartDate: '2026-11-01', travelEndDate: '2026-11-06',
      assignedSalesEmployeeId: executive.employeeId, salesTeamId: 'team-01', createdAt: '2026-10-01T07:30:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z',
    });
    storage.rawSet('payments', 'payment-01', {
      id: 'payment-01', bookingId: 'booking-01', customerId: lead.customerId, amount: 5000, currency: 'INR', paymentDate: '2026-10-01',
      paymentMethod: 'UPI', referenceNumber: 'UTR-1', paymentType: 'ADVANCE', status: 'VERIFIED', recordedBy: executive.employeeId,
      verifiedByEmployeeId: 'emp-accounts-01', verifiedByName: 'Accounts', verifiedAt: '2026-10-01T08:00:00.000Z',
      createdAt: '2026-10-01T07:50:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z',
    });
    storage.rawSet('audit_logs', 'audit-confirmed', {
      id: 'audit-confirmed', timestamp: '2026-10-01T09:00:00.000Z', actorType: 'HUMAN', actorId: 'emp-accounts-01',
      actorName: 'Accounts User (Accounts)', action: 'BOOKING_CONFIRMED_FROM_PAYMENT', entityType: 'BOOKING', entityId: 'booking-01',
      after: { status: 'CONFIRMED', grossProfit: 22000 },
    });

    const page = await service.getTimeline(lead.id, executive, { limit: 30 });
    const titles = page.entries.map(entry => entry.title);
    expect(titles).toContain('Lead created');
    expect(titles).toContain('Callback requested');
    expect(titles).toContain('Quote V1 created');
    expect(titles).toContain('Customer package V2 shared');
    expect(titles).toContain('WhatsApp package message prepared');
    expect(titles).toContain('Email package message prepared');
    expect(titles).toContain('Package link viewed');
    expect(titles).toContain('Verified payment received');
    expect(titles).toContain('Booking confirmed');
    expect(titles.some(title => /sent/i.test(title))).toBe(false);
    expect(page.entries.map(entry => entry.occurredAt)).toEqual([...page.entries.map(entry => entry.occurredAt)].sort().reverse());
    expect(new Set(page.entries.map(entry => entry.entryId)).size).toBe(page.entries.length);
    const serialized = JSON.stringify(page);
    for (const forbidden of ['supplierCost', 'grossProfit', 'grossMargin', 'secret-token-hash']) expect(serialized).not.toContain(forbidden);
    expect(page.entries.find(entry => entry.entryId === 'lead-event:lead-event-01')?.body).toContain('Follow-up scheduled');
    expect(page.entries.find(entry => entry.entryId === 'payment-verified:payment-01')?.body).toBe('INR 5,000');
  });

  it('paginates deterministically with no duplicate or missing entries across equal timestamps', async () => {
    for (let index = 0; index < 307; index += 1) {
      const occurredAt = new Date(Date.parse('2026-09-01T10:00:00.000Z') + Math.floor(index / 3) * 1_000).toISOString();
      storage.rawSet('conversation_entries', `entry-${String(index).padStart(3, '0')}`, {
        entryId: `entry-${String(index).padStart(3, '0')}`, leadId: lead.id, customerId: lead.customerId,
        entryType: 'INTERNAL_NOTE', channel: 'MANUAL', direction: 'INTERNAL', visibility: 'INTERNAL_ONLY',
        title: 'Internal note', body: `Note ${index}`, actorType: 'EMPLOYEE', actorEmployeeId: executive.employeeId,
        actorName: executive.name, occurredAt, createdAt: occurredAt, attachmentIds: [],
      });
    }
    const collected: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.getTimeline(lead.id, executive, { limit: 10, cursor });
      collected.push(...page.entries.map(entry => entry.entryId));
      cursor = page.nextCursor;
      if (!page.hasMore) break;
    } while (cursor);
    // 307 stored entries cross the per-query source bound, plus Lead creation.
    expect(collected).toHaveLength(308);
    expect(new Set(collected).size).toBe(308);
    expect(collected).toContain('lead-created:lead-01');
  });

  it('keeps internal notes out of customer share data and makes manual semantics explicit', async () => {
    const result = await service.addEntry(lead.id, {
      kind: 'INTERNAL_NOTE', body: 'Never show this to the customer.', idempotencyKey: 'private-note-001',
    }, executive);
    storage.rawSet('customer_shares', 'share-safe', {
      id: 'share-safe', quoteGroupId: 'no-group', version: 1, createdByEmployeeId: executive.employeeId,
      createdByName: executive.name, salesEmployeeId: executive.employeeId, createdAt: '2026-10-01T11:00:00.000Z',
      snapshot: { title: 'Customer package' }, tokenHash: 'hash', status: 'ACTIVE',
    });
    expect(result.entry.visibility).toBe('INTERNAL_ONLY');
    expect(JSON.stringify(storage.rawGet('customer_shares', 'share-safe'))).not.toContain('Never show this to the customer.');
    const manual = await service.addEntry(lead.id, {
      kind: 'MANUAL_CONTACT', body: 'Customer requested Premium.', idempotencyKey: 'manual-contact-02', channel: 'WHATSAPP', direction: 'INBOUND',
    }, executive);
    expect(manual.entry.metadata?.manualLog).toBe(true);
    expect(manual.entry.provider).toBeUndefined();
    expect(manual.entry.externalMessageId).toBeUndefined();
  });
});
