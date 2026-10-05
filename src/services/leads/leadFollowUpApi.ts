import type { Lead, LeadInteractionInput, LeadInteractionResult, SalesQueueProjection } from '../../types';
import { authenticatedMutationHeaders, authenticatedReadHeaders } from '../auth/authenticatedApi';

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !body || body.success !== true || body.data == null) {
    const error = new Error(typeof body?.error === 'string' ? body.error : `Lead follow-up request failed (${response.status}).`);
    Object.assign(error, { status: response.status, code: typeof body?.code === 'string' ? body.code : 'LEAD_FOLLOW_UP_REQUEST_FAILED' });
    throw error;
  }
  return body.data as T;
}

export async function getSalesQueue(employeeId: string): Promise<SalesQueueProjection> {
  return responseData(await fetch('/api/leads/sales-queue', {
    headers: await authenticatedReadHeaders(employeeId),
  }));
}

export async function getLeadById(leadId: string, employeeId: string): Promise<Lead> {
  return responseData(await fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
    headers: await authenticatedReadHeaders(employeeId),
  }));
}

export async function recordLeadInteraction(
  leadId: string,
  input: LeadInteractionInput,
  employeeId: string,
): Promise<LeadInteractionResult> {
  const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/interaction`, {
    method: 'POST',
    headers: await authenticatedMutationHeaders(employeeId),
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !body || body.success !== true || !body.data) {
    const error = new Error(typeof body?.error === 'string' ? body.error : `Lead interaction failed (${response.status}).`);
    Object.assign(error, { status: response.status, code: typeof body?.code === 'string' ? body.code : 'LEAD_INTERACTION_FAILED' });
    throw error;
  }
  return { lead: body.data, eventId: body.eventId || '', idempotent: body.idempotent === true };
}
