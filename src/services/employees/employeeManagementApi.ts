import type { EmployeeMutationInput, ManagedEmployee, SalesTeam } from '../../types';
import {
  authenticatedMutationHeaders,
  authenticatedReadHeaders,
} from '../auth/authenticatedApi';

interface EmployeeListResponse {
  success: boolean;
  data: ManagedEmployee[];
  teams: SalesTeam[];
}

interface EmployeeResponse {
  success: boolean;
  data: ManagedEmployee;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export async function listManagedEmployees(
  demoEmployeeId: string,
): Promise<{ employees: ManagedEmployee[]; teams: SalesTeam[] }> {
  const response = await fetch('/api/employees', {
    headers: await authenticatedReadHeaders(demoEmployeeId),
  });
  const payload = await parseResponse<EmployeeListResponse>(response);
  return { employees: payload.data, teams: payload.teams };
}

export async function createManagedEmployee(
  input: EmployeeMutationInput & Required<Pick<EmployeeMutationInput, 'employeeId' | 'name' | 'email' | 'role' | 'active'>>,
  demoEmployeeId: string,
): Promise<ManagedEmployee> {
  const response = await fetch('/api/employees', {
    method: 'POST',
    headers: await authenticatedMutationHeaders(demoEmployeeId),
    body: JSON.stringify(input),
  });
  return (await parseResponse<EmployeeResponse>(response)).data;
}

export async function updateManagedEmployee(
  employeeId: string,
  input: EmployeeMutationInput,
  demoEmployeeId: string,
): Promise<ManagedEmployee> {
  const response = await fetch(`/api/employees/${encodeURIComponent(employeeId)}`, {
    method: 'PATCH',
    headers: await authenticatedMutationHeaders(demoEmployeeId),
    body: JSON.stringify(input),
  });
  return (await parseResponse<EmployeeResponse>(response)).data;
}
