import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  AuditLog,
  ConversationTimelineEntry,
  Lead,
  UnresolvedWhatsAppMessage,
  WhatsAppConversationContext,
  WhatsAppProviderStatus,
  WhatsAppSendInput,
  WhatsAppSendResult,
  WhatsAppTemplateOption,
} from '../../src/types/index.js';
import {
  FirestoreConversionStorageProvider,
  type ConversionStorageProvider,
} from '../../src/services/conversion/conversionStorageProvider.js';
import type { ConversationActor } from './conversationTimelineService.js';

type UnknownRecord = Record<string, any>;

export interface MessagingSendResult {
  externalMessageId: string;
  externalConversationId?: string;
  acceptedAt: string;
}
export interface MessagingTextRequest {
  recipient: string;
  body: string;
}

export interface MessagingTemplateRequest {
  recipient: string;
  templateName: string;
  languageCode: string;
  parameters: string[];
}

export type NormalizedMessagingEvent =
  | {
      kind: 'INBOUND_MESSAGE';
      provider: 'META' | 'META_MOCK';
      externalMessageId: string;
      externalConversationId?: string;
      senderPhone: string;
      senderName?: string;
      body: string;
      occurredAt: string;
      demoSimulation?: boolean;
    }
  | {
      kind: 'MESSAGE_STATUS';
      provider: 'META' | 'META_MOCK';
      externalMessageId: string;
      externalConversationId?: string;
      status: WhatsAppProviderStatus;
      occurredAt: string;
      failureCode?: string;
      failureMessage?: string;
      demoSimulation?: boolean;
    };

export interface MessagingProvider {
  readonly providerName: 'META' | 'META_MOCK';
  readonly configured: boolean;
  readonly demo: boolean;
  sendText(input: MessagingTextRequest): Promise<MessagingSendResult>;
  sendTemplate(input: MessagingTemplateRequest): Promise<MessagingSendResult>;
  normalizeWebhook(payload: unknown): NormalizedMessagingEvent[];
}

export interface MetaWhatsAppConfig {
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
  graphApiVersion?: string;
  approvedTemplates: WhatsAppTemplateOption[];
}

export class WhatsAppMessagingError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'WhatsAppMessagingError';
  }
}
function valueText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sanitizeProviderMessage(value: unknown): string {
  const message = valueText(value) || 'Meta rejected the WhatsApp request.';
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 300);
}

export function normalizeWhatsAppRecipient(value: unknown): string | undefined {
  const raw = valueText(value);
  if (!raw) return undefined;
  const explicitInternational = raw.startsWith('+') || raw.startsWith('00');
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) digits = digits.slice(2);
  if (!explicitInternational && digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15 || /^0/.test(digits)) return undefined;
  return digits;
}

function parseTemplates(value: string | undefined): WhatsAppTemplateOption[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(item => {
      const name = valueText(item?.name);
      const label = valueText(item?.label);
      const languageCode = valueText(item?.languageCode);
      return name && label && languageCode && /^[a-z0-9_]{1,512}$/.test(name)
        ? [{ name, label, languageCode }]
        : [];
    });
  } catch {
    return [];
  }
}

export function loadMetaWhatsAppConfig(environment: NodeJS.ProcessEnv = process.env): MetaWhatsAppConfig {
  return {
    accessToken: valueText(environment.META_WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: valueText(environment.META_WHATSAPP_PHONE_NUMBER_ID),
    businessAccountId: valueText(environment.META_WHATSAPP_BUSINESS_ACCOUNT_ID),
    webhookVerifyToken: valueText(environment.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    appSecret: valueText(environment.META_WHATSAPP_APP_SECRET),
    graphApiVersion: valueText(environment.META_WHATSAPP_GRAPH_API_VERSION),
    approvedTemplates: parseTemplates(environment.META_WHATSAPP_APPROVED_TEMPLATES),
  };
}

function mapMetaStatus(value: unknown): WhatsAppProviderStatus | undefined {
  const statuses: Record<string, WhatsAppProviderStatus> = {
    queued: 'QUEUED', sending: 'SENDING', sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED',
  };
  return statuses[String(value || '').toLowerCase()];
}

function metaTimestamp(value: unknown): string {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

export function normalizeMetaWebhookPayload(
  payload: unknown,
  provider: 'META' | 'META_MOCK' = 'META',
  expectedPhoneNumberId?: string,
  demoSimulation = false,
): NormalizedMessagingEvent[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new WhatsAppMessagingError(400, 'INVALID_META_WEBHOOK', 'The Meta webhook payload is malformed.');
  }
  const root = payload as UnknownRecord;
  if (root.object !== 'whatsapp_business_account' || !Array.isArray(root.entry)) {
    throw new WhatsAppMessagingError(400, 'INVALID_META_WEBHOOK', 'The payload is not a WhatsApp Business webhook.');
  }
  const result: NormalizedMessagingEvent[] = [];
  for (const entry of root.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'messages' || !change.value || typeof change.value !== 'object') continue;
      const phoneNumberId = valueText(change.value.metadata?.phone_number_id);
      if (expectedPhoneNumberId && phoneNumberId !== expectedPhoneNumberId) {
        throw new WhatsAppMessagingError(403, 'META_PHONE_NUMBER_MISMATCH', 'Webhook phone-number identity did not match BBOS configuration.');
      }
      const contactNames = new Map<string, string>();
      for (const contact of Array.isArray(change.value.contacts) ? change.value.contacts : []) {
        const phone = normalizeWhatsAppRecipient(contact?.wa_id);
        const name = valueText(contact?.profile?.name);
        if (phone && name) contactNames.set(phone, name);
      }
      for (const message of Array.isArray(change.value.messages) ? change.value.messages : []) {
        const externalMessageId = valueText(message?.id);
        const senderPhone = normalizeWhatsAppRecipient(message?.from);
        const body = message?.type === 'text' ? valueText(message?.text?.body) : undefined;
        if (!externalMessageId || !senderPhone || !body) continue;
        result.push({
          kind: 'INBOUND_MESSAGE', provider, externalMessageId, senderPhone,
          ...(contactNames.get(senderPhone) ? { senderName: contactNames.get(senderPhone) } : {}),
          body, occurredAt: metaTimestamp(message?.timestamp), ...(demoSimulation ? { demoSimulation: true } : {}),
        });
      }
      for (const statusValue of Array.isArray(change.value.statuses) ? change.value.statuses : []) {
        const externalMessageId = valueText(statusValue?.id);
        const status = mapMetaStatus(statusValue?.status);
        if (!externalMessageId || !status) continue;
        const error = Array.isArray(statusValue?.errors) ? statusValue.errors[0] : undefined;
        result.push({
          kind: 'MESSAGE_STATUS', provider, externalMessageId, status,
          ...(valueText(statusValue?.conversation?.id) ? { externalConversationId: valueText(statusValue.conversation.id) } : {}),
          occurredAt: metaTimestamp(statusValue?.timestamp),
          ...(valueText(error?.code) ? { failureCode: valueText(error.code) } : {}),
          ...(valueText(error?.title || error?.message) ? { failureMessage: sanitizeProviderMessage(error.title || error.message) } : {}),
          ...(demoSimulation ? { demoSimulation: true } : {}),
        });
      }
    }
  }
  return result;
}

export function verifyMetaWebhookSignature(rawBody: Buffer, signatureHeader: unknown, appSecret: string | undefined): boolean {
  const signature = valueText(signatureHeader);
  if (!appSecret || !signature?.startsWith('sha256=')) return false;
  const received = Buffer.from(signature.slice(7), 'hex');
  const expected = Buffer.from(createHmac('sha256', appSecret).update(rawBody).digest('hex'), 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export class MetaWhatsAppProvider implements MessagingProvider {
  readonly providerName = 'META' as const;
  readonly demo = false;
  readonly configured: boolean;

  constructor(
    readonly config: MetaWhatsAppConfig = loadMetaWhatsAppConfig(),
    private readonly request: typeof fetch = fetch,
  ) {
    this.configured = Boolean(config.accessToken && config.phoneNumberId && config.businessAccountId && config.webhookVerifyToken && config.appSecret && config.graphApiVersion);
  }

  private async send(payload: UnknownRecord): Promise<MessagingSendResult> {
    if (!this.configured) throw new WhatsAppMessagingError(503, 'META_WHATSAPP_NOT_CONFIGURED', 'Meta WhatsApp is not configured for this BBOS environment.');
    const response = await this.request(`https://graph.facebook.com/${this.config.graphApiVersion!}/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
    });
    const result = await response.json().catch(() => ({})) as UnknownRecord;
    const externalMessageId = valueText(result?.messages?.[0]?.id);
    if (!response.ok || !externalMessageId) {
      const providerCode = valueText(result?.error?.code) || 'META_SEND_FAILED';
      const providerMessage = sanitizeProviderMessage(result?.error?.message);
      const actionable = String(providerCode) === '131047'
        ? 'A WhatsApp template is required to start or resume this conversation.'
        : providerMessage;
      throw new WhatsAppMessagingError(response.status >= 400 && response.status < 500 ? 422 : 502, providerCode, actionable);
    }
    return { externalMessageId, acceptedAt: new Date().toISOString() };
  }

  sendText(input: MessagingTextRequest): Promise<MessagingSendResult> {
    return this.send({ to: input.recipient, type: 'text', text: { preview_url: true, body: input.body } });
  }

  sendTemplate(input: MessagingTemplateRequest): Promise<MessagingSendResult> {
    const components = input.parameters.length ? [{
      type: 'body', parameters: input.parameters.map(parameter => ({ type: 'text', text: parameter })),
    }] : undefined;
    return this.send({
      to: input.recipient, type: 'template',
      template: { name: input.templateName, language: { code: input.languageCode }, ...(components ? { components } : {}) },
    });
  }

  normalizeWebhook(payload: unknown): NormalizedMessagingEvent[] {
    return normalizeMetaWebhookPayload(payload, 'META', this.config.phoneNumberId);
  }
}

export class MockMetaWhatsAppProvider implements MessagingProvider {
  readonly providerName = 'META_MOCK' as const;
  readonly configured = true;
  readonly demo = true;
  readonly sent: Array<MessagingTextRequest | MessagingTemplateRequest> = [];
  private sequence = 0;
  private failure?: WhatsAppMessagingError;

  failNext(code = 'MOCK_PROVIDER_FAILURE', message = 'The demo Meta provider rejected this message.'): void {
    this.failure = new WhatsAppMessagingError(502, code, message);
  }

  private accepted(input: MessagingTextRequest | MessagingTemplateRequest): Promise<MessagingSendResult> {
    if (this.failure) {
      const error = this.failure;
      this.failure = undefined;
      return Promise.reject(error);
    }
    this.sent.push(structuredClone(input));
    this.sequence += 1;
    return Promise.resolve({ externalMessageId: `wamid.mock.${this.sequence}`, acceptedAt: new Date().toISOString() });
  }

  sendText(input: MessagingTextRequest): Promise<MessagingSendResult> { return this.accepted(input); }
  sendTemplate(input: MessagingTemplateRequest): Promise<MessagingSendResult> { return this.accepted(input); }
  normalizeWebhook(payload: unknown): NormalizedMessagingEvent[] {
    return normalizeMetaWebhookPayload(payload, 'META_MOCK', undefined, true);
  }
}

const openLeadStatuses = new Set(['NEW', 'CONTACTED', 'IN_PROGRESS', 'QUOTE_SHARED', 'NEGOTIATION', 'ON_HOLD']);
const salesRoles = new Set(['Founder', 'Admin', 'Sales Manager', 'Sales Executive']);
const statusRank: Record<Exclude<WhatsAppProviderStatus, 'FAILED'>, number> = {
  QUEUED: 0, SENDING: 1, SENT: 2, DELIVERED: 3, READ: 4,
};

function assertLeadAccess(actor: ConversationActor, lead: Lead): void {
  if (!actor.active || !salesRoles.has(actor.role)) throw new WhatsAppMessagingError(403, 'WHATSAPP_ACCESS_DENIED', 'This role cannot use Sales WhatsApp.');
  if (actor.role === 'Founder' || actor.role === 'Admin') return;
  if (actor.role === 'Sales Executive') {
    if (!lead.assignedEmployeeId) throw new WhatsAppMessagingError(403, 'MISSING_OWNER_METADATA', 'Lead owner metadata is required.');
    if (lead.assignedEmployeeId === actor.employeeId) return;
  }
  if (actor.role === 'Sales Manager') {
    if (!actor.salesTeamId || !lead.salesTeamId) throw new WhatsAppMessagingError(403, 'MISSING_TEAM_METADATA', 'Sales team metadata is required.');
    if (lead.salesTeamId === actor.salesTeamId) return;
  }
  throw new WhatsAppMessagingError(403, 'LEAD_SCOPE_DENIED', 'This Lead is outside your Sales scope.');
}

function entryFromStored(value: UnknownRecord): ConversationTimelineEntry {
  const { requestFingerprint: _fingerprint, idempotencyKey: _key, ...entry } = value;
  return structuredClone(entry) as ConversationTimelineEntry;
}

function sendFingerprint(input: WhatsAppSendInput, recipient: string): string {
  return createHash('sha256').update(JSON.stringify({
    recipient, messageType: input.messageType, body: valueText(input.body), templateName: input.templateName || null,
    languageCode: input.languageCode || null, templateParameters: input.templateParameters || [],
  })).digest('hex');
}

function safeProviderFailure(error: unknown): { code: string; message: string } {
  if (error instanceof WhatsAppMessagingError) return { code: error.code, message: sanitizeProviderMessage(error.message) };
  return { code: 'WHATSAPP_PROVIDER_UNAVAILABLE', message: 'WhatsApp could not be reached. Retry when the provider is available.' };
}

function canAdvanceStatus(current: WhatsAppProviderStatus | undefined, next: WhatsAppProviderStatus): boolean {
  if (!current) return true;
  if (current === 'READ' || current === 'FAILED') return false;
  if (next === 'FAILED') return statusRank[current] <= statusRank.SENT;
  return statusRank[next] >= statusRank[current];
}

export class WhatsAppMessagingService {
  constructor(
    private readonly storage: ConversionStorageProvider = new FirestoreConversionStorageProvider(),
    readonly provider: MessagingProvider = new MetaWhatsAppProvider(),
    readonly approvedTemplates: WhatsAppTemplateOption[] = provider instanceof MetaWhatsAppProvider
      ? provider.config.approvedTemplates
      : [{ name: 'kashmir_package_ready', label: 'Kashmir package ready', languageCode: 'en_US' }],
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async resolveLeadContext(leadId: string, actor: ConversationActor) {
    return this.storage.runTransaction(async transaction => {
      const lead = await transaction.get('leads', leadId) as Lead | null;
      if (!lead) throw new WhatsAppMessagingError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
      assertLeadAccess(actor, lead);
      const customer = await transaction.get('customers', lead.customerId) as UnknownRecord | null;
      const originalPhone = valueText(customer?.whatsApp) || valueText(lead.whatsAppNumber) || valueText(customer?.phone) || valueText(lead.customerPhone) || '';
      const normalizedRecipient = normalizeWhatsAppRecipient(originalPhone);
      const entries = await transaction.findByField('conversation_entries', 'leadId', leadId, 250);
      const inbound = entries
        .filter(entry => entry.providerConfirmed === true && entry.channel === 'WHATSAPP' && entry.direction === 'INBOUND')
        .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)))[0];
      const lastInboundAt = valueText(inbound?.occurredAt);
      const sessionWindowOpen = Boolean(lastInboundAt && this.now().getTime() - new Date(lastInboundAt).getTime() <= 24 * 60 * 60 * 1000);
      return { lead, originalPhone, normalizedRecipient, lastInboundAt, sessionWindowOpen };
    });
  }

  async getContext(leadIdValue: unknown, actor: ConversationActor): Promise<WhatsAppConversationContext> {
    const leadId = valueText(leadIdValue);
    if (!leadId) throw new WhatsAppMessagingError(400, 'LEAD_ID_REQUIRED', 'A Lead ID is required.');
    const context = await this.resolveLeadContext(leadId, actor);
    return {
      leadId, customerPhone: context.originalPhone,
      ...(context.normalizedRecipient ? { normalizedRecipient: context.normalizedRecipient } : {}),
      providerAvailable: this.provider.configured, demoProvider: this.provider.demo,
      sessionWindowOpen: context.sessionWindowOpen,
      ...(context.lastInboundAt ? { lastInboundAt: context.lastInboundAt } : {}),
      approvedTemplates: structuredClone(this.approvedTemplates),
    };
  }

  private validateSendInput(rawInput: unknown): WhatsAppSendInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) throw new WhatsAppMessagingError(400, 'INVALID_WHATSAPP_MESSAGE', 'WhatsApp message input must be an object.');
    const input = rawInput as UnknownRecord;
    const allowed = new Set(['idempotencyKey', 'messageType', 'body', 'templateName', 'languageCode', 'templateParameters']);
    const protectedField = Object.keys(input).find(key => !allowed.has(key));
    if (protectedField) throw new WhatsAppMessagingError(400, 'PROTECTED_WHATSAPP_FIELD', `${protectedField} is server-controlled or unsupported.`);
    const idempotencyKey = valueText(input.idempotencyKey);
    const body = valueText(input.body);
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) throw new WhatsAppMessagingError(400, 'INVALID_IDEMPOTENCY_KEY', 'A valid idempotency key is required.');
    if (!body || body.length > 4_000) throw new WhatsAppMessagingError(400, 'INVALID_WHATSAPP_BODY', 'WhatsApp text must be between 1 and 4,000 characters.');
    if (input.messageType !== 'TEXT' && input.messageType !== 'TEMPLATE') throw new WhatsAppMessagingError(400, 'INVALID_WHATSAPP_MESSAGE_TYPE', 'Choose a text or approved template message.');
    const templateParameters = input.templateParameters === undefined ? [] : input.templateParameters;
    if (!Array.isArray(templateParameters) || templateParameters.length > 10 || templateParameters.some(item => !valueText(item) || String(item).length > 1_000)) {
      throw new WhatsAppMessagingError(400, 'INVALID_TEMPLATE_PARAMETERS', 'Template parameters are invalid.');
    }
    return {
      idempotencyKey, body, messageType: input.messageType,
      ...(valueText(input.templateName) ? { templateName: valueText(input.templateName) } : {}),
      ...(valueText(input.languageCode) ? { languageCode: valueText(input.languageCode) } : {}),
      templateParameters: templateParameters.map(item => String(item).trim()),
    };
  }

  async send(leadIdValue: unknown, rawInput: unknown, actor: ConversationActor, retryOfEntryId?: string): Promise<WhatsAppSendResult> {
    const leadId = valueText(leadIdValue);
    if (!leadId) throw new WhatsAppMessagingError(400, 'LEAD_ID_REQUIRED', 'A Lead ID is required.');
    if (!this.provider.configured) throw new WhatsAppMessagingError(503, 'META_WHATSAPP_NOT_CONFIGURED', 'Meta WhatsApp is not configured for this BBOS environment.');
    const input = this.validateSendInput(rawInput);
    const context = await this.resolveLeadContext(leadId, actor);
    if (!context.normalizedRecipient) throw new WhatsAppMessagingError(422, 'INVALID_WHATSAPP_RECIPIENT', 'Add a valid customer WhatsApp number with country code before sending.');
    let template: WhatsAppTemplateOption | undefined;
    if (input.messageType === 'TEXT' && !context.sessionWindowOpen && !this.provider.demo) {
      throw new WhatsAppMessagingError(422, 'WHATSAPP_TEMPLATE_REQUIRED', 'A WhatsApp template is required to start or resume this conversation.');
    }
    if (input.messageType === 'TEMPLATE') {
      template = this.approvedTemplates.find(item => item.name === input.templateName && item.languageCode === input.languageCode);
      if (!template) throw new WhatsAppMessagingError(400, 'WHATSAPP_TEMPLATE_NOT_APPROVED', 'Choose a server-approved WhatsApp template.');
    }
    const fingerprint = sendFingerprint(input, context.normalizedRecipient);
    const entryId = `whatsapp-${createHash('sha256').update(`${leadId}:${actor.employeeId}:${input.idempotencyKey}`).digest('hex').slice(0, 40)}`;
    const reserved = await this.storage.runTransaction(async transaction => {
      const lead = await transaction.get('leads', leadId) as Lead | null;
      if (!lead) throw new WhatsAppMessagingError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
      assertLeadAccess(actor, lead);
      const existing = await transaction.get('conversation_entries', entryId) as UnknownRecord | null;
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) throw new WhatsAppMessagingError(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'This send key was already used for different WhatsApp content.');
        return { entry: entryFromStored(existing), idempotent: true };
      }
      if (retryOfEntryId) {
        const failed = await transaction.get('conversation_entries', retryOfEntryId) as UnknownRecord | null;
        if (!failed || failed.leadId !== leadId || failed.providerStatus !== 'FAILED' || failed.direction !== 'OUTBOUND') {
          throw new WhatsAppMessagingError(409, 'WHATSAPP_RETRY_NOT_ALLOWED', 'Only a failed outbound WhatsApp message can be retried.');
        }
      }
      const occurredAt = this.now().toISOString();
      const entry: ConversationTimelineEntry = {
        entryId, leadId, customerId: lead.customerId, entryType: 'MESSAGE', channel: 'WHATSAPP', direction: 'OUTBOUND',
        visibility: 'CUSTOMER_COMMUNICATION', title: input.messageType === 'TEMPLATE' ? `WhatsApp template · ${template!.label}` : 'WhatsApp message',
        body: input.body, actorType: 'EMPLOYEE', actorEmployeeId: actor.employeeId, actorName: actor.name,
        occurredAt, createdAt: occurredAt, attachmentIds: [], provider: this.provider.providerName,
        providerStatus: 'SENDING', customerPhone: context.normalizedRecipient, providerConfirmed: false,
        metadata: {
          sourceType: 'CONVERSATION_ENTRY', sourceId: entryId, messageType: input.messageType,
          ...(template ? { templateName: template.name } : {}), ...(this.provider.demo ? { demoSimulation: true } : {}),
          ...(retryOfEntryId ? { retryCount: 1, retryOfEntryId } as any : {}),
        },
      };
      transaction.set('conversation_entries', entryId, { ...entry, requestFingerprint: fingerprint, idempotencyKey: input.idempotencyKey });
      const action = retryOfEntryId ? 'WHATSAPP_MESSAGE_RETRY_REQUESTED' : 'WHATSAPP_MESSAGE_SEND_REQUESTED';
      const audit: AuditLog = {
        id: `audit-${entryId}`, timestamp: occurredAt, actorType: 'HUMAN', actorId: actor.employeeId,
        actorName: `${actor.name} (${actor.role})`, action, entityType: 'CONVERSATION_ENTRY', entityId: entryId,
        before: retryOfEntryId ? { retryOfEntryId } : null,
        after: { entryId, leadId, channel: 'WHATSAPP', recipient: context.normalizedRecipient.slice(-4).padStart(context.normalizedRecipient.length, '*'), messageType: input.messageType },
        reason: retryOfEntryId ? 'Employee requested a retry of a failed WhatsApp message.' : 'Employee requested a WhatsApp message send.',
      };
      transaction.set('audit_logs', audit.id, audit);
      return { entry, idempotent: false };
    });
    if (reserved.idempotent) return reserved;
    try {
      const accepted = input.messageType === 'TEXT'
        ? await this.provider.sendText({ recipient: context.normalizedRecipient, body: input.body })
        : await this.provider.sendTemplate({
            recipient: context.normalizedRecipient, templateName: template!.name,
            languageCode: template!.languageCode, parameters: input.templateParameters || [],
          });
      const entry = await this.storage.runTransaction(async transaction => {
        const stored = await transaction.get('conversation_entries', entryId) as UnknownRecord | null;
        if (!stored) throw new WhatsAppMessagingError(500, 'WHATSAPP_SEND_STATE_MISSING', 'WhatsApp send state could not be finalized.');
        const pendingStatuses = (await transaction.findByField('whatsapp_pending_statuses', 'externalMessageId', accepted.externalMessageId, 20))
          .filter(item => item.provider === this.provider.providerName)
          .sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));
        let providerStatus: WhatsAppProviderStatus = 'SENT';
        let statusUpdatedAt: string | undefined;
        let externalConversationId = accepted.externalConversationId;
        let metadata = stored.metadata || {};
        for (const pending of pendingStatuses) {
          if (canAdvanceStatus(providerStatus, pending.status)) {
            providerStatus = pending.status;
            statusUpdatedAt = pending.occurredAt;
            externalConversationId = pending.externalConversationId || externalConversationId;
            if (pending.status === 'FAILED') {
              metadata = {
                ...metadata,
                failureCode: pending.failureCode || 'META_DELIVERY_FAILED',
                failureMessage: sanitizeProviderMessage(pending.failureMessage),
              };
            }
          }
          transaction.delete('whatsapp_pending_statuses', pending.id);
        }
        const updated = {
          providerStatus, providerConfirmed: true, externalMessageId: accepted.externalMessageId,
          ...(externalConversationId ? { externalConversationId } : {}),
          ...(statusUpdatedAt ? { statusUpdatedAt } : {}),
          metadata,
        };
        transaction.update('conversation_entries', entryId, updated);
        return entryFromStored({ ...stored, ...updated });
      });
      return { entry, idempotent: false };
    } catch (error) {
      const failure = safeProviderFailure(error);
      const entry = await this.storage.runTransaction(async transaction => {
        const stored = await transaction.get('conversation_entries', entryId) as UnknownRecord | null;
        if (!stored) throw error;
        const updated = {
          providerStatus: 'FAILED', providerConfirmed: false,
          metadata: { ...(stored.metadata || {}), failureCode: failure.code, failureMessage: failure.message },
        };
        transaction.update('conversation_entries', entryId, updated);
        return entryFromStored({ ...stored, ...updated });
      });
      return { entry, idempotent: false };
    }
  }

  async retry(leadId: unknown, entryIdValue: unknown, rawInput: unknown, actor: ConversationActor): Promise<WhatsAppSendResult> {
    const entryId = valueText(entryIdValue);
    if (!entryId) throw new WhatsAppMessagingError(400, 'MESSAGE_ID_REQUIRED', 'A failed WhatsApp message ID is required.');
    const failed = await this.storage.runTransaction(transaction => transaction.get('conversation_entries', entryId)) as UnknownRecord | null;
    if (!failed || failed.leadId !== leadId || failed.providerStatus !== 'FAILED') throw new WhatsAppMessagingError(409, 'WHATSAPP_RETRY_NOT_ALLOWED', 'Only a failed WhatsApp message can be retried.');
    const supplied = rawInput && typeof rawInput === 'object' ? rawInput as UnknownRecord : {};
    const retryTemplate = failed.metadata?.templateName
      ? this.approvedTemplates.find(item => item.name === failed.metadata.templateName)
      : undefined;
    return this.send(leadId, {
      idempotencyKey: supplied.idempotencyKey,
      messageType: failed.metadata?.messageType || 'TEXT', body: failed.body,
      ...(retryTemplate ? { templateName: retryTemplate.name, languageCode: retryTemplate.languageCode, templateParameters: supplied.templateParameters || [] } : {}),
    }, actor, entryId);
  }

  async ingest(events: NormalizedMessagingEvent[]): Promise<{ processed: number; duplicates: number; unresolved: number }> {
    let processed = 0;
    let duplicates = 0;
    let unresolved = 0;
    for (const event of events) {
      const result = await this.storage.runTransaction(async transaction => {
        const receiptId = `meta-event-${createHash('sha256').update(JSON.stringify(event)).digest('hex').slice(0, 48)}`;
        if (await transaction.get('whatsapp_webhook_events', receiptId)) return 'DUPLICATE' as const;
        transaction.set('whatsapp_webhook_events', receiptId, {
          id: receiptId, provider: event.provider, kind: event.kind, externalMessageId: event.externalMessageId,
          occurredAt: event.occurredAt, receivedAt: this.now().toISOString(),
        });
        if (event.kind === 'MESSAGE_STATUS') {
          const matches = await transaction.findByField('conversation_entries', 'externalMessageId', event.externalMessageId, 2);
          const message = matches.find(item => item.provider === event.provider || (event.provider === 'META_MOCK' && item.provider === 'META_MOCK'));
          if (!message) {
            transaction.set('whatsapp_pending_statuses', receiptId, {
              id: receiptId, provider: event.provider, externalMessageId: event.externalMessageId,
              status: event.status, occurredAt: event.occurredAt,
              ...(event.externalConversationId ? { externalConversationId: event.externalConversationId } : {}),
              ...(event.failureCode ? { failureCode: event.failureCode } : {}),
              ...(event.failureMessage ? { failureMessage: sanitizeProviderMessage(event.failureMessage) } : {}),
              createdAt: this.now().toISOString(),
            });
            return 'PROCESSED' as const;
          }
          if (!canAdvanceStatus(message.providerStatus, event.status)) return 'PROCESSED' as const;
          transaction.update('conversation_entries', message.entryId || message.id, {
            providerStatus: event.status, providerConfirmed: true,
            ...(event.externalConversationId ? { externalConversationId: event.externalConversationId } : {}),
            statusUpdatedAt: event.occurredAt,
            ...(event.status === 'FAILED' ? {
              metadata: { ...(message.metadata || {}), failureCode: event.failureCode || 'META_DELIVERY_FAILED', failureMessage: sanitizeProviderMessage(event.failureMessage) },
            } : {}),
          });
          return 'PROCESSED' as const;
        }
        const existing = await transaction.findByField('conversation_entries', 'externalMessageId', event.externalMessageId, 1);
        if (existing.length) return 'DUPLICATE' as const;
        const directCustomers = await transaction.findByField('customers', 'normalizedPhone', event.senderPhone, 3);
        const customers = directCustomers.length ? directCustomers : (await transaction.list('customers', 500)).filter(customer =>
          [customer.normalizedPhone, customer.whatsApp, customer.phone].some(value => normalizeWhatsAppRecipient(value) === event.senderPhone),
        );
        let reason: UnresolvedWhatsAppMessage['reason'] | undefined;
        let lead: Lead | undefined;
        if (customers.length !== 1) reason = customers.length ? 'AMBIGUOUS_LEAD_MATCH' : 'NO_CUSTOMER_MATCH';
        else {
          const leads = (await transaction.findByField('leads', 'customerId', customers[0].id, 20) as Lead[])
            .filter(item => openLeadStatuses.has(item.status))
            .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
          if (leads.length === 1) lead = leads[0];
          else reason = leads.length ? 'AMBIGUOUS_LEAD_MATCH' : 'NO_OPEN_LEAD';
        }
        if (!lead) {
          const unresolvedId = `unmatched-${createHash('sha256').update(`${event.provider}:${event.externalMessageId}`).digest('hex').slice(0, 40)}`;
          const item: UnresolvedWhatsAppMessage = {
            unresolvedId, provider: event.provider, externalMessageId: event.externalMessageId,
            customerPhone: event.senderPhone, ...(event.senderName ? { customerName: event.senderName } : {}),
            body: event.body, occurredAt: event.occurredAt, createdAt: this.now().toISOString(), reason: reason!, status: 'UNRESOLVED',
          };
          transaction.set('unmatched_whatsapp', unresolvedId, item);
          return 'UNRESOLVED' as const;
        }
        const entryId = `whatsapp-in-${createHash('sha256').update(`${event.provider}:${event.externalMessageId}`).digest('hex').slice(0, 40)}`;
        const canonical: ConversationTimelineEntry = {
          entryId, leadId: lead.id, customerId: lead.customerId, entryType: 'MESSAGE', channel: 'WHATSAPP', direction: 'INBOUND',
          visibility: 'CUSTOMER_COMMUNICATION', title: 'WhatsApp message', body: event.body, actorType: 'CUSTOMER',
          actorName: event.senderName || lead.customerName || 'Customer', occurredAt: event.occurredAt, createdAt: this.now().toISOString(),
          attachmentIds: [], provider: event.provider, externalMessageId: event.externalMessageId,
          ...(event.externalConversationId ? { externalConversationId: event.externalConversationId } : {}),
          customerPhone: event.senderPhone, providerConfirmed: true,
          metadata: { sourceType: 'CONVERSATION_ENTRY', sourceId: entryId, messageType: 'TEXT', ...(event.demoSimulation ? { demoSimulation: true } : {}) },
        };
        transaction.set('conversation_entries', entryId, canonical);
        return 'PROCESSED' as const;
      });
      if (result === 'DUPLICATE') duplicates += 1;
      else if (result === 'UNRESOLVED') unresolved += 1;
      else processed += 1;
    }
    return { processed, duplicates, unresolved };
  }

  async listUnresolved(actor: ConversationActor): Promise<UnresolvedWhatsAppMessage[]> {
    if (!actor.active || !['Founder', 'Admin'].includes(actor.role)) throw new WhatsAppMessagingError(403, 'UNMATCHED_WHATSAPP_ACCESS_DENIED', 'Only Founder/Admin can review unmatched WhatsApp messages.');
    return this.storage.runTransaction(async transaction => (await transaction.list('unmatched_whatsapp', 100))
      .filter(item => item.status === 'UNRESOLVED')
      .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt))) as UnresolvedWhatsAppMessage[]);
  }

  async linkUnresolved(unresolvedIdValue: unknown, leadIdValue: unknown, actor: ConversationActor): Promise<ConversationTimelineEntry> {
    const unresolvedId = valueText(unresolvedIdValue);
    const leadId = valueText(leadIdValue);
    if (!unresolvedId || !leadId) throw new WhatsAppMessagingError(400, 'UNMATCHED_LINK_INPUT_REQUIRED', 'An unmatched message and Lead are required.');
    return this.storage.runTransaction(async transaction => {
      const item = await transaction.get('unmatched_whatsapp', unresolvedId) as UnresolvedWhatsAppMessage | null;
      if (!item) throw new WhatsAppMessagingError(404, 'UNMATCHED_WHATSAPP_NOT_FOUND', 'Unmatched WhatsApp message not found.');
      const lead = await transaction.get('leads', leadId) as Lead | null;
      if (!lead) throw new WhatsAppMessagingError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
      assertLeadAccess(actor, lead);
      if (item.status === 'LINKED' && item.linkedLeadId !== leadId) throw new WhatsAppMessagingError(409, 'UNMATCHED_ALREADY_LINKED', 'This WhatsApp message is already linked to another Lead.');
      const entryId = `whatsapp-in-${createHash('sha256').update(`${item.provider}:${item.externalMessageId}`).digest('hex').slice(0, 40)}`;
      const existing = await transaction.get('conversation_entries', entryId) as UnknownRecord | null;
      if (existing) return entryFromStored(existing);
      const entry: ConversationTimelineEntry = {
        entryId, leadId, customerId: lead.customerId, entryType: 'MESSAGE', channel: 'WHATSAPP', direction: 'INBOUND',
        visibility: 'CUSTOMER_COMMUNICATION', title: 'WhatsApp message', body: item.body, actorType: 'CUSTOMER',
        actorName: item.customerName || lead.customerName || 'Customer', occurredAt: item.occurredAt, createdAt: this.now().toISOString(),
        attachmentIds: [], provider: item.provider, externalMessageId: item.externalMessageId, customerPhone: item.customerPhone,
        providerConfirmed: true, metadata: { sourceType: 'CONVERSATION_ENTRY', sourceId: entryId, messageType: 'TEXT', ...(item.provider === 'META_MOCK' ? { demoSimulation: true } : {}) },
      };
      transaction.set('conversation_entries', entryId, entry);
      transaction.update('unmatched_whatsapp', unresolvedId, { status: 'LINKED', linkedLeadId: leadId, linkedAt: this.now().toISOString(), linkedByEmployeeId: actor.employeeId });
      const audit: AuditLog = {
        id: `audit-${randomUUID()}`, timestamp: this.now().toISOString(), actorType: 'HUMAN', actorId: actor.employeeId,
        actorName: `${actor.name} (${actor.role})`, action: 'UNMATCHED_WHATSAPP_LINKED', entityType: 'CONVERSATION_ENTRY', entityId: entryId,
        before: { unresolvedId }, after: { unresolvedId, leadId, entryId }, reason: 'Employee linked an unmatched provider message to an authorized Lead.',
      };
      transaction.set('audit_logs', audit.id, audit);
      return entry;
    });
  }
}
