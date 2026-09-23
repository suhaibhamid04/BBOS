import type { User } from 'firebase/auth';
import {
  AuthenticatedEmployeeIdentity,
  isUserRole,
  UserProfile,
} from '../../types';

export interface IdentityFetchResponse {
  user?: Partial<AuthenticatedEmployeeIdentity>;
  error?: string;
  code?: string;
}

export type IdentityFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function resolveInitialBrowserIdentity(
  demoMode: boolean,
  serializedDemoIdentity: string | null,
  demoFallback: UserProfile,
): UserProfile | null {
  if (!demoMode) return null;

  if (serializedDemoIdentity) {
    try {
      const parsed = JSON.parse(serializedDemoIdentity) as Partial<UserProfile>;
      if (
        typeof parsed.id === 'string' &&
        typeof parsed.employeeId === 'string' &&
        typeof parsed.firebaseUid === 'string' &&
        typeof parsed.name === 'string' &&
        isUserRole(parsed.role) &&
        parsed.active === true
      ) {
        return parsed as UserProfile;
      }
    } catch {
      // Malformed demo-only state falls through to the preset demo identity.
    }
  }

  return demoFallback;
}

export function assertDemoIdentitySwitchingAllowed(demoMode: boolean): void {
  if (!demoMode) {
    throw new Error('Demo identity switching is disabled outside DEMO_MODE.');
  }
}

function validateIdentity(value: Partial<AuthenticatedEmployeeIdentity> | undefined): AuthenticatedEmployeeIdentity {
  if (
    !value ||
    typeof value.firebaseUid !== 'string' ||
    !value.firebaseUid ||
    typeof value.employeeId !== 'string' ||
    !value.employeeId ||
    !isUserRole(value.role) ||
    typeof value.name !== 'string' ||
    typeof value.email !== 'string' ||
    (value.salesTeamId !== undefined && (typeof value.salesTeamId !== 'string' || !value.salesTeamId.trim())) ||
    (value.managerEmployeeId !== undefined && (typeof value.managerEmployeeId !== 'string' || !value.managerEmployeeId.trim())) ||
    value.active !== true
  ) {
    throw new Error('Server returned an invalid BBOS employee identity.');
  }

  return value as AuthenticatedEmployeeIdentity;
}

export function identityToUserProfile(identity: AuthenticatedEmployeeIdentity): UserProfile {
  return {
    id: identity.employeeId,
    employeeId: identity.employeeId,
    firebaseUid: identity.firebaseUid,
    name: identity.name,
    email: identity.email,
    phone: identity.phone || '',
    role: identity.role,
    department: identity.department || '',
    active: true,
    createdAt: identity.createdAt || '',
    lastLogin: identity.lastLogin || new Date().toISOString(),
    ...(identity.salesTeamId ? { salesTeamId: identity.salesTeamId } : {}),
    ...(identity.managerEmployeeId ? { managerEmployeeId: identity.managerEmployeeId } : {}),
  };
}

export async function fetchAuthoritativeIdentity(
  firebaseUser: Pick<User, 'getIdToken'>,
  fetchImpl: IdentityFetch = fetch,
): Promise<UserProfile> {
  const token = await firebaseUser.getIdToken();
  const response = await fetchImpl('/api/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const payload = (await response.json().catch(() => ({}))) as IdentityFetchResponse;
  if (!response.ok) {
    throw new Error(payload.error || `BBOS employee authorization failed (${response.status}).`);
  }

  return identityToUserProfile(validateIdentity(payload.user));
}
