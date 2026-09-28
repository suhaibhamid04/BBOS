import type { OperationsControlRoomResponse } from '../../types/operationsControlRoom';
import type {
  CreateEmergencySpendInput,
  CreateOperationalIssueInput,
  EmergencySpendRequest,
  OperationalChangeRequest,
  OperationalIssue,
  UpdateOperationalIssueInput,
} from '../../types/liveOperations';
import {
  authenticatedMutationHeaders,
  authenticatedReadHeaders,
} from '../auth/authenticatedApi';

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export async function fetchOperationsControlRoom(
  demoEmployeeId: string,
): Promise<OperationsControlRoomResponse> {
  const response = await fetch('/api/operations/control-room', {
    headers: await authenticatedReadHeaders(demoEmployeeId),
  });
  const payload = await parseResponse<{ success: boolean; data: OperationsControlRoomResponse }>(response);
  return payload.data;
}

export async function assignOperationsEmployee(
  bookingId: string,
  operationsEmployeeId: string,
  demoEmployeeId: string,
  reason?: string,
) {
  const response = await fetch(`/api/operations/bookings/${encodeURIComponent(bookingId)}/assignment`, {
    method: 'PATCH',
    headers: await authenticatedMutationHeaders(demoEmployeeId),
    body: JSON.stringify({ operationsEmployeeId, ...(reason?.trim() ? { reason: reason.trim() } : {}) }),
  });
  return parseResponse<{
    success: boolean;
    data: { bookingId: string; assignedOperationsEmployeeId: string; isIdempotent?: boolean };
  }>(response);
}

export async function createOperationalIssue(bookingId: string, input: CreateOperationalIssueInput, employeeId: string) {
  const response = await fetch(`/api/operations/bookings/${encodeURIComponent(bookingId)}/issues`, {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId), body: JSON.stringify(input),
  });
  return (await parseResponse<{ success: boolean; data: OperationalIssue }>(response)).data;
}

export async function updateOperationalIssue(bookingId: string, issueId: string, input: UpdateOperationalIssueInput, employeeId: string) {
  const response = await fetch(`/api/operations/bookings/${encodeURIComponent(bookingId)}/issues/${encodeURIComponent(issueId)}`, {
    method: 'PATCH', headers: await authenticatedMutationHeaders(employeeId), body: JSON.stringify(input),
  });
  return (await parseResponse<{ success: boolean; data: OperationalIssue }>(response)).data;
}

export async function createEmergencySpendRequest(bookingId: string, input: CreateEmergencySpendInput, employeeId: string) {
  const response = await fetch(`/api/operations/bookings/${encodeURIComponent(bookingId)}/spend-requests`, {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId), body: JSON.stringify(input),
  });
  return (await parseResponse<{ success: boolean; data: EmergencySpendRequest }>(response)).data;
}

export async function decideEmergencySpend(request: EmergencySpendRequest, decision: 'APPROVED' | 'REJECTED', employeeId: string, rejectionReason?: string) {
  const response = await fetch(`/api/operations/spend-requests/${encodeURIComponent(request.id)}/decision`, {
    method: 'PATCH',
    headers: await authenticatedMutationHeaders(employeeId),
    body: JSON.stringify({ decision, expectedUpdatedAt: request.updatedAt, ...(rejectionReason ? { rejectionReason } : {}) }),
  });
  return (await parseResponse<{ success: boolean; data: EmergencySpendRequest }>(response)).data;
}

export async function createOperationalChangeRequest(
  bookingId: string,
  input: Pick<OperationalChangeRequest, 'changeType' | 'description' | 'linkedService'>,
  employeeId: string,
) {
  const response = await fetch(`/api/operations/bookings/${encodeURIComponent(bookingId)}/change-requests`, {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId), body: JSON.stringify(input),
  });
  return (await parseResponse<{ success: boolean; data: OperationalChangeRequest }>(response)).data;
}
