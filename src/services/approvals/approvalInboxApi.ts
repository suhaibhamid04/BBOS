import type {
  ApprovalInboxDecisionInput,
  ApprovalInboxResponse,
  ApprovalInboxSummary,
} from '../../types/approvalInbox';
import { authenticatedMutationHeaders, authenticatedReadHeaders } from '../auth/authenticatedApi';

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`);
  }
  return payload as T;
}

export async function fetchApprovalInbox(employeeId: string): Promise<ApprovalInboxResponse> {
  const response = await fetch('/api/approvals', {
    headers: await authenticatedReadHeaders(employeeId),
  });
  return (await parseResponse<{ success: boolean; data: ApprovalInboxResponse }>(response)).data;
}

export async function fetchApprovalInboxSummary(employeeId: string): Promise<ApprovalInboxSummary> {
  const response = await fetch('/api/approvals/summary', {
    headers: await authenticatedReadHeaders(employeeId),
  });
  return (await parseResponse<{ success: boolean; data: ApprovalInboxSummary }>(response)).data;
}

export async function decideApprovalInboxItem(
  itemId: string,
  input: ApprovalInboxDecisionInput,
  employeeId: string,
) {
  const response = await fetch(`/api/approvals/${encodeURIComponent(itemId)}/decision`, {
    method: 'PATCH',
    headers: await authenticatedMutationHeaders(employeeId),
    body: JSON.stringify(input),
  });
  return (await parseResponse<{ success: boolean; data: unknown }>(response)).data;
}
