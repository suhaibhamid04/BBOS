import type {
  ConversationEntryCreateInput,
  ConversationEntryCreateResult,
  ConversationTimelineEntry,
  ConversationTimelinePage,
  UnresolvedWhatsAppMessage,
  WhatsAppConversationContext,
  WhatsAppSendInput,
  WhatsAppSendResult,
} from '../../types';
import { authenticatedMutationHeaders, authenticatedReadHeaders } from '../auth/authenticatedApi';

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !body || body.success !== true || body.data == null) {
    const error = new Error(typeof body?.error === 'string' ? body.error : `Conversation request failed (${response.status}).`);
    Object.assign(error, { status: response.status, code: typeof body?.code === 'string' ? body.code : 'CONVERSATION_REQUEST_FAILED' });
    throw error;
  }
  return body.data as T;
}

export async function getLeadConversationTimeline(
  leadId: string,
  employeeId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<ConversationTimelinePage> {
  const query = new URLSearchParams();
  if (options.limit) query.set('limit', String(options.limit));
  if (options.cursor) query.set('cursor', options.cursor);
  const suffix = query.size ? `?${query.toString()}` : '';
  return readData(await fetch(`/api/leads/${encodeURIComponent(leadId)}/conversation${suffix}`, {
    headers: await authenticatedReadHeaders(employeeId),
  }));
}

export async function createLeadConversationEntry(
  leadId: string,
  input: ConversationEntryCreateInput,
  employeeId: string,
): Promise<ConversationEntryCreateResult> {
  const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/conversation/entries`, {
    method: 'POST',
    headers: await authenticatedMutationHeaders(employeeId),
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !body || body.success !== true || !body.data) {
    const error = new Error(typeof body?.error === 'string' ? body.error : `Conversation entry failed (${response.status}).`);
    Object.assign(error, { status: response.status, code: typeof body?.code === 'string' ? body.code : 'CONVERSATION_ENTRY_FAILED' });
    throw error;
  }
  return { entry: body.data, idempotent: body.idempotent === true };
}

export async function getLeadWhatsAppContext(leadId: string, employeeId: string): Promise<WhatsAppConversationContext> {
  return readData(await fetch(`/api/leads/${encodeURIComponent(leadId)}/whatsapp/context`, {
    headers: await authenticatedReadHeaders(employeeId),
  }));
}

export async function sendLeadWhatsAppMessage(
  leadId: string,
  input: WhatsAppSendInput,
  employeeId: string,
): Promise<WhatsAppSendResult> {
  const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/whatsapp/messages`, {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId), body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !body?.success || !body.data) {
    const error = new Error(typeof body?.error === 'string' ? body.error : `WhatsApp send failed (${response.status}).`);
    Object.assign(error, { status: response.status, code: body?.code || 'WHATSAPP_SEND_FAILED' });
    throw error;
  }
  return { entry: body.data, idempotent: body.idempotent === true };
}

export async function retryLeadWhatsAppMessage(
  leadId: string,
  entryId: string,
  idempotencyKey: string,
  employeeId: string,
): Promise<WhatsAppSendResult> {
  const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/whatsapp/messages/${encodeURIComponent(entryId)}/retry`, {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId), body: JSON.stringify({ idempotencyKey }),
  });
  const body = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !body?.success || !body.data) {
    const error = new Error(typeof body?.error === 'string' ? body.error : `WhatsApp retry failed (${response.status}).`);
    Object.assign(error, { status: response.status, code: body?.code || 'WHATSAPP_RETRY_FAILED' });
    throw error;
  }
  return { entry: body.data, idempotent: body.idempotent === true };
}

export async function listUnresolvedWhatsApp(employeeId: string): Promise<UnresolvedWhatsAppMessage[]> {
  return readData(await fetch('/api/leads/whatsapp/unresolved', { headers: await authenticatedReadHeaders(employeeId) }));
}

export async function linkUnresolvedWhatsApp(
  unresolvedId: string,
  leadId: string,
  employeeId: string,
): Promise<ConversationTimelineEntry> {
  return readData(await fetch(`/api/leads/whatsapp/unresolved/${encodeURIComponent(unresolvedId)}/link`, {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId), body: JSON.stringify({ leadId }),
  }));
}
