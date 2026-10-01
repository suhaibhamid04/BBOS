import {
  bookingMutationHeaders,
  bookingReadHeaders,
} from '../auth/authenticatedApi';

export interface ReservationsAssignee {
  employeeId: string;
  name: string;
  role: string;
  active: boolean;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`);
  }
  return payload as T;
}

export async function listReservationsAssignees(demoEmployeeId: string): Promise<ReservationsAssignee[]> {
  const response = await fetch('/api/bookings/reservations-assignees', {
    headers: await bookingReadHeaders(demoEmployeeId),
  });
  return (await parseResponse<{ success: true; data: ReservationsAssignee[] }>(response)).data;
}

export async function assignReservationsEmployee(
  bookingId: string,
  input: { employeeId: string; expectedUpdatedAt: string; reason?: string },
  demoEmployeeId: string,
): Promise<{ bookingId: string; assignedReservationsEmployeeId: string; updatedAt: string }> {
  const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/reservations-assignment`, {
    method: 'PATCH',
    headers: await bookingMutationHeaders(demoEmployeeId),
    body: JSON.stringify(input),
  });
  return (await parseResponse<{
    success: true;
    data: { bookingId: string; assignedReservationsEmployeeId: string; updatedAt: string };
  }>(response)).data;
}
