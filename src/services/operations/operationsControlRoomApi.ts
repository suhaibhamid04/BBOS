import type { OperationsControlRoomResponse } from '../../types/operationsControlRoom';
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
