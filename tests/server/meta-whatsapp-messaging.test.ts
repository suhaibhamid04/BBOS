import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'bun:test';
import type { Lead, WhatsAppTemplateOption } from '../../src/types';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import type { ConversationActor } from '../../server/services/conversationTimelineService';
import {
  MockMetaWhatsAppProvider,
  MetaWhatsAppProvider,
  WhatsAppMessagingService,
  normalizeMetaWebhookPayload,
  normalizeWhatsAppRecipient,
  verifyMetaWebhookSignature,
} from '../../server/services/whatsappMessagingService';

describe('M6B Meta WhatsApp messaging', () => {
  let storage: InMemoryConversionStorageProvider;
  let provider: MockMetaWhatsAppProvider;
  let service: WhatsAppMessagingService;
  let now: Date;

  const executive: ConversationActor = { employeeId: 'emp-sales-01', role: 'Sales Executive', active: true, salesTeamId: 'team-01', name: 'Sana' };
  const otherExecutive: ConversationActor = { employeeId: 'emp-sales-02', role: 'Sales Executive', active: true, salesTeamId: 'team-01', name: 'Omar' };
  const manager: ConversationActor = { employeeId: 'emp-manager-01', role: 'Sales Manager', active: true, salesTeamId: 'team-01', name: 'Manager' };
  const otherManager: ConversationActor = { employeeId: 'emp-manager-02', role: 'Sales Manager', active: true, salesTeamId: 'team-02', name: 'Other manager' };
  const founder: ConversationActor = { employeeId: 'emp-founder-01', role: 'Founder', active: true, name: 'Founder' };

  const lead: Lead = {
    id: 'lead-01', customerId: 'customer-01', customerName: 'Aamir Khan', customerPhone: '9876543210',
    sourceId: 'WHATSAPP', source: 'WhatsApp', sourcePlatform: 'WhatsApp', createdSourceType: 'MANUAL', tags: [],
    destination: 'Kashmir', childAges: [], status: 'IN_PROGRESS', priority: 'HOT', assignedEmployeeId: executive.employeeId,
    assignedEmployeeName: executive.name, salesTeamId: 'team-01', notes: '', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  };

  beforeEach(() => {
    now = new Date('2026-10-14T10:00:00.000Z');
    storage = new InMemoryConversionStorageProvider({ leads: [lead] });
    storage.rawSet('customers', lead.customerId, {
      id: lead.customerId, name: lead.customerName, phone: '+91 98765 43210', normalizedPhone: '919876543210',
      email: 'aamir@example.com', city: 'Delhi', customerType: 'B2C', preferences: [], notes: '', totalBookings: 0,
      lifetimeValue: 0, createdAt: lead.createdAt, updatedAt: lead.updatedAt,
    });
    provider = new MockMetaWhatsAppProvider();
    service = new WhatsAppMessagingService(storage, provider, undefined, () => new Date(now));
  });

  it('normalizes India-default and explicit international recipients without unsafe guessing', () => {
    expect(normalizeWhatsAppRecipient('98765 43210')).toBe('919876543210');
    expect(normalizeWhatsAppRecipient('+44 7700 900123')).toBe('447700900123');
    expect(normalizeWhatsAppRecipient('0091 98765 43210')).toBe('919876543210');
    expect(normalizeWhatsAppRecipient('7654321')).toBeUndefined();
    expect(normalizeWhatsAppRecipient('not a phone')).toBeUndefined();
  });

  it('sends through the adapter with server actor/recipient and deduplicates repeated clicks', async () => {
    const input = { idempotencyKey: 'send-message-001', messageType: 'TEXT' as const, body: 'Your Kashmir option is ready.' };
    const first = await service.send(lead.id, input, executive);
    const duplicate = await service.send(lead.id, input, executive);
    expect(first.entry).toMatchObject({
      leadId: lead.id, actorEmployeeId: executive.employeeId, customerPhone: '919876543210', provider: 'META_MOCK',
      externalMessageId: 'wamid.mock.1', providerStatus: 'SENT', providerConfirmed: true,
    });
    expect(duplicate.idempotent).toBe(true);
    expect(provider.sent).toEqual([{ recipient: '919876543210', body: input.body }]);
    expect(storage.rawList('conversation_entries')).toHaveLength(1);
    const audit = storage.rawList('audit_logs')[0];
    expect(audit).toMatchObject({ action: 'WHATSAPP_MESSAGE_SEND_REQUESTED', actorId: executive.employeeId });
    expect(JSON.stringify(audit)).not.toContain(input.body);
  });

  it('coalesces rapid duplicate sends before the provider is invoked twice', async () => {
    const input = { idempotencyKey: 'rapid-send-001', messageType: 'TEXT' as const, body: 'One click, one message.' };
    const [first, second] = await Promise.all([
      service.send(lead.id, input, executive),
      service.send(lead.id, input, executive),
    ]);
    expect([first.idempotent, second.idempotent].sort()).toEqual([false, true]);
    expect(provider.sent).toHaveLength(1);
    expect(storage.rawList('conversation_entries')).toHaveLength(1);
  });

  it('enforces OWN/TEAM/ALL scope before invoking the provider', async () => {
    const input = { idempotencyKey: 'send-message-002', messageType: 'TEXT' as const, body: 'Scoped message.' };
    await expect(service.send(lead.id, input, otherExecutive)).rejects.toMatchObject({ statusCode: 403, code: 'LEAD_SCOPE_DENIED' });
    await expect(service.send(lead.id, { ...input, idempotencyKey: 'send-message-003' }, otherManager)).rejects.toMatchObject({ statusCode: 403, code: 'LEAD_SCOPE_DENIED' });
    expect((await service.send(lead.id, { ...input, idempotencyKey: 'send-message-004' }, manager)).entry.providerStatus).toBe('SENT');
    expect((await service.send(lead.id, { ...input, idempotencyKey: 'send-message-005' }, founder)).entry.providerStatus).toBe('SENT');
    expect(provider.sent).toHaveLength(2);
  });

  it('keeps failed attempts visible and makes retry idempotent', async () => {
    provider.failNext('MOCK_DOWN', 'Mock provider unavailable.');
    const failed = await service.send(lead.id, { idempotencyKey: 'failed-send-001', messageType: 'TEXT', body: 'Please review the option.' }, executive);
    expect(failed.entry).toMatchObject({ providerStatus: 'FAILED', metadata: { failureCode: 'MOCK_DOWN', failureMessage: 'Mock provider unavailable.' } });
    const retry = await service.retry(lead.id, failed.entry.entryId, { idempotencyKey: 'retry-send-001' }, executive);
    const duplicateRetry = await service.retry(lead.id, failed.entry.entryId, { idempotencyKey: 'retry-send-001' }, executive);
    expect(retry.entry).toMatchObject({ providerStatus: 'SENT', externalMessageId: 'wamid.mock.1' });
    expect(duplicateRetry.idempotent).toBe(true);
    expect(storage.rawGet('conversation_entries', failed.entry.entryId).providerStatus).toBe('FAILED');
    expect(storage.rawList('conversation_entries')).toHaveLength(2);
    expect(provider.sent).toHaveLength(1);
    expect(storage.rawList('audit_logs').map(item => item.action)).toContain('WHATSAPP_MESSAGE_RETRY_REQUESTED');
  });

  it('matches one open Lead by exact normalized customer phone and deduplicates webhook retries', async () => {
    const event = {
      kind: 'INBOUND_MESSAGE' as const, provider: 'META_MOCK' as const, externalMessageId: 'wamid.inbound.1',
      senderPhone: '919876543210', senderName: 'Aamir', body: 'Can we change the Gulmarg hotel?',
      occurredAt: '2026-10-14T09:30:00.000Z', demoSimulation: true,
    };
    expect(await service.ingest([event])).toEqual({ processed: 1, duplicates: 0, unresolved: 0 });
    expect(await service.ingest([event])).toEqual({ processed: 0, duplicates: 1, unresolved: 0 });
    const entry = storage.rawList('conversation_entries')[0];
    expect(entry).toMatchObject({
      leadId: lead.id, direction: 'INBOUND', actorType: 'CUSTOMER', providerConfirmed: true,
      externalMessageId: event.externalMessageId, metadata: { demoSimulation: true },
    });
    expect(entry.metadata.manualLog).toBeUndefined();
    expect(storage.rawList('conversation_entries')).toHaveLength(1);
  });

  it('routes unknown and ambiguous senders to the unresolved queue instead of guessing', async () => {
    const unknown = {
      kind: 'INBOUND_MESSAGE' as const, provider: 'META_MOCK' as const, externalMessageId: 'wamid.unknown',
      senderPhone: '919999999999', body: 'I need a Kashmir package', occurredAt: now.toISOString(), demoSimulation: true,
    };
    expect((await service.ingest([unknown])).unresolved).toBe(1);
    storage.rawSet('leads', 'lead-02', { ...lead, id: 'lead-02', updatedAt: '2026-10-02T00:00:00.000Z' });
    const ambiguous = { ...unknown, externalMessageId: 'wamid.ambiguous', senderPhone: '919876543210' };
    expect((await service.ingest([ambiguous])).unresolved).toBe(1);
    const queue = await service.listUnresolved(founder);
    expect(queue.map(item => item.reason).sort()).toEqual(['AMBIGUOUS_LEAD_MATCH', 'NO_CUSTOMER_MATCH']);
    await expect(service.listUnresolved(executive)).rejects.toMatchObject({ statusCode: 403 });
    const linked = await service.linkUnresolved(queue.find(item => item.reason === 'NO_CUSTOMER_MATCH')!.unresolvedId, lead.id, founder);
    expect(linked.leadId).toBe(lead.id);
    expect(storage.rawList('audit_logs').find(item => item.action === 'UNMATCHED_WHATSAPP_LINKED')?.actorId).toBe(founder.employeeId);
  });

  it('applies duplicated and out-of-order provider status events monotonically', async () => {
    const sent = await service.send(lead.id, { idempotencyKey: 'status-send-001', messageType: 'TEXT', body: 'Status test.' }, executive);
    const externalMessageId = sent.entry.externalMessageId!;
    const status = (providerStatus: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED', suffix: string) => ({
      kind: 'MESSAGE_STATUS' as const, provider: 'META_MOCK' as const, externalMessageId, status: providerStatus,
      occurredAt: `2026-10-14T10:0${suffix}:00.000Z`, demoSimulation: true,
    });
    await service.ingest([status('SENT', '1'), status('DELIVERED', '2'), status('READ', '3')]);
    await service.ingest([status('SENT', '4'), status('READ', '3')]);
    expect(storage.rawGet('conversation_entries', sent.entry.entryId).providerStatus).toBe('READ');
    const second = await service.send(lead.id, { idempotencyKey: 'status-send-002', messageType: 'TEXT', body: 'Failure test.' }, executive);
    await service.ingest([{ ...status('FAILED', '5'), externalMessageId: second.entry.externalMessageId! }]);
    expect(storage.rawGet('conversation_entries', second.entry.entryId).providerStatus).toBe('FAILED');
  });

  it('reconciles a provider status that races ahead of outbound send finalization', async () => {
    await service.ingest([{
      kind: 'MESSAGE_STATUS', provider: 'META_MOCK', externalMessageId: 'wamid.mock.1', status: 'READ',
      occurredAt: '2026-10-14T10:01:00.000Z', externalConversationId: 'conversation-race', demoSimulation: true,
    }]);
    expect(storage.rawList('whatsapp_pending_statuses')).toHaveLength(1);

    const sent = await service.send(lead.id, {
      idempotencyKey: 'status-race-001', messageType: 'TEXT', body: 'Reconcile early status.',
    }, executive);

    expect(sent.entry).toMatchObject({
      externalMessageId: 'wamid.mock.1', externalConversationId: 'conversation-race', providerStatus: 'READ',
      statusUpdatedAt: '2026-10-14T10:01:00.000Z',
    });
    expect(storage.rawList('whatsapp_pending_statuses')).toHaveLength(0);
  });

  it('requires an approved template outside the 24-hour window and accepts free-form within it', async () => {
    const templates: WhatsAppTemplateOption[] = [{ name: 'kashmir_package_ready', label: 'Kashmir package ready', languageCode: 'en_US' }];
    Object.defineProperties(provider, { demo: { value: false }, providerName: { value: 'META' } });
    service = new WhatsAppMessagingService(storage, provider, templates, () => new Date(now));
    await expect(service.send(lead.id, { idempotencyKey: 'window-text-001', messageType: 'TEXT', body: 'Outside window.' }, executive))
      .rejects.toMatchObject({ code: 'WHATSAPP_TEMPLATE_REQUIRED' });
    await expect(service.send(lead.id, {
      idempotencyKey: 'bad-template-001', messageType: 'TEMPLATE', body: 'Bad template.', templateName: 'client_forged', languageCode: 'en_US',
    }, executive)).rejects.toMatchObject({ code: 'WHATSAPP_TEMPLATE_NOT_APPROVED' });
    expect((await service.send(lead.id, {
      idempotencyKey: 'template-send-001', messageType: 'TEMPLATE', body: 'Your package is ready.', templateName: 'kashmir_package_ready', languageCode: 'en_US',
    }, executive)).entry.providerStatus).toBe('SENT');
    storage.rawSet('conversation_entries', 'recent-inbound', {
      entryId: 'recent-inbound', leadId: lead.id, customerId: lead.customerId, entryType: 'MESSAGE', channel: 'WHATSAPP', direction: 'INBOUND',
      visibility: 'CUSTOMER_COMMUNICATION', title: 'WhatsApp message', body: 'Hello', actorType: 'CUSTOMER', actorName: lead.customerName,
      occurredAt: '2026-10-14T09:00:00.000Z', createdAt: '2026-10-14T09:00:00.000Z', attachmentIds: [], provider: 'META', providerConfirmed: true,
    });
    expect((await service.send(lead.id, { idempotencyKey: 'window-text-002', messageType: 'TEXT', body: 'Within window.' }, executive)).entry.providerStatus).toBe('SENT');
  });

  it('verifies webhook HMAC and normalizes Meta inbound/status payloads', () => {
    const raw = Buffer.from('{"object":"whatsapp_business_account"}');
    const secret = 'test-app-secret';
    const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    expect(verifyMetaWebhookSignature(raw, signature, secret)).toBe(true);
    expect(verifyMetaWebhookSignature(raw, `${signature.slice(0, -1)}0`, secret)).toBe(false);
    expect(verifyMetaWebhookSignature(raw, undefined, secret)).toBe(false);
    const events = normalizeMetaWebhookPayload({
      object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: 'phone-01' }, contacts: [{ wa_id: '919876543210', profile: { name: 'Aamir' } }],
        messages: [{ id: 'wamid.in.2', from: '919876543210', timestamp: '1791972000', type: 'text', text: { body: 'Hello' } }],
        statuses: [{ id: 'wamid.out.2', status: 'delivered', timestamp: '1791972060', conversation: { id: 'conversation-01' } }],
      } }] }],
    }, 'META', 'phone-01');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: 'INBOUND_MESSAGE', externalMessageId: 'wamid.in.2', senderPhone: '919876543210', senderName: 'Aamir' });
    expect(events[1]).toMatchObject({ kind: 'MESSAGE_STATUS', status: 'DELIVERED', externalConversationId: 'conversation-01' });
  });

  it('never exposes Meta credentials through the browser context DTO', async () => {
    const accessToken = 'test-only-access-token';
    const appSecret = 'test-only-app-secret';
    const meta = new MetaWhatsAppProvider({
      accessToken, appSecret, phoneNumberId: 'phone-01', businessAccountId: 'waba-01', webhookVerifyToken: 'verify-01',
      graphApiVersion: 'vXX.X', approvedTemplates: [{ name: 'kashmir_package_ready', label: 'Kashmir package ready', languageCode: 'en_US' }],
    }, async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 }));
    const productionService = new WhatsAppMessagingService(storage, meta, meta.config.approvedTemplates, () => new Date(now));
    const context = await productionService.getContext(lead.id, executive);
    expect(context.providerAvailable).toBe(true);
    expect(JSON.stringify(context)).not.toContain(accessToken);
    expect(JSON.stringify(context)).not.toContain(appSecret);
    expect(JSON.stringify(context)).not.toContain('verify-01');
  });
});
