import type { LeadAssignmentHistoryEntry, LeadDistributionOverview } from '../../types';
import { authenticatedMutationHeaders, authenticatedReadHeaders } from '../auth/authenticatedApi';

const REQUEST_TIMEOUT_MS = 10_000;

export class LeadDistributionApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string,
  ) {
    super(message);
    this.name = 'LeadDistributionApiError';
  }
}

async function requestPayload<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LeadDistributionApiError('The Lead Distribution request timed out. Check that the BBOS server is running, then retry.', null, 'REQUEST_TIMEOUT');
    }
    throw new LeadDistributionApiError(
      error instanceof Error ? error.message : 'The BBOS server could not be reached.',
      null,
      'NETWORK_ERROR',
    );
  } finally {
    window.clearTimeout(timeout);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    await response.text().catch(() => '');
    throw new LeadDistributionApiError(
      'The server returned the application page instead of Lead Distribution data. Restart the current BBOS dev server and retry.',
      response.status,
      'NON_JSON_API_RESPONSE',
    );
  }

  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  const code = typeof body?.code === 'string' ? body.code : response.ok ? 'INVALID_API_RESPONSE' : 'LEAD_DISTRIBUTION_REQUEST_FAILED';
  const message = typeof body?.error === 'string' ? body.error : response.ok
    ? 'The Lead Distribution response did not contain valid settings data.'
    : `Lead Distribution request failed (${response.status}).`;
  if (!response.ok || body?.success !== true || !Object.prototype.hasOwnProperty.call(body, 'data') || body.data == null) {
    throw new LeadDistributionApiError(message, response.status, code);
  }
  return body.data as T;
}

export async function getLeadDistributionOverview(employeeId: string): Promise<LeadDistributionOverview> {
  return requestPayload('/api/leads/distribution/overview', { headers: await authenticatedReadHeaders(employeeId) });
}

export async function updateLeadDistributionConfiguration(
  input: Partial<LeadDistributionOverview['configuration']>,
  employeeId: string,
): Promise<LeadDistributionOverview> {
  return requestPayload('/api/leads/distribution/config', {
    method: 'PATCH', headers: await authenticatedMutationHeaders(employeeId), body: JSON.stringify(input),
  });
}

export async function getLeadAssignmentOptions(employeeId: string) {
  return requestPayload<Array<{ employeeId: string; name: string; role: 'Sales Executive' | 'Sales Manager'; salesTeamId: string }>>(
    '/api/leads/assignment-options', { headers: await authenticatedReadHeaders(employeeId) },
  );
}

export async function getLeadAssignmentHistory(leadId: string, employeeId: string) {
  return requestPayload<LeadAssignmentHistoryEntry[]>(`/api/leads/${encodeURIComponent(leadId)}/assignment-history`, {
    headers: await authenticatedReadHeaders(employeeId),
  });
}
