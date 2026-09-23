import { describe, expect, it, mock } from 'bun:test';
import type { NextFunction, Request, Response } from 'express';
import {
  createAuthenticate,
  toPublicAuthenticatedUser,
  type AuthenticatedUser,
} from '../../server/middleware/auth';
import {
  EmployeeIdentityError,
  resolveActiveEmployeeIdentity,
  type EmployeeIdentityCandidate,
  type EmployeeIdentityStore,
  type VerifiedFirebaseIdentity,
} from '../../server/services/employeeIdentityService';
import { apiRouter } from '../../server/routes/api';

class InMemoryEmployeeIdentityStore implements EmployeeIdentityStore {
  constructor(private readonly candidates: EmployeeIdentityCandidate[]) {}

  async findByFirebaseUid(): Promise<EmployeeIdentityCandidate[]> {
    return this.candidates;
  }
}

const firebaseIdentity: VerifiedFirebaseIdentity = {
  firebaseUid: 'firebase-uid-123',
  email: 'firebase@example.com',
  name: 'Firebase Name',
};

const activeEmployee: EmployeeIdentityCandidate = {
  documentId: 'employee-document-9',
  data: {
    id: 'emp-sales-009',
    firebaseUid: 'firebase-uid-123',
    name: 'Ayesha Employee',
    email: 'ayesha@bookingbridge.com',
    role: 'Sales Executive',
    active: true,
  },
};

function buildResponse() {
  let statusCode = 200;
  let body: any;
  const response: Partial<Response> = {};
  response.status = mock((code: number) => {
    statusCode = code;
    return response as Response;
  }) as any;
  response.json = mock((value: any) => {
    body = value;
    return response as Response;
  }) as any;
  return {
    response: response as Response,
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

async function authenticateWith(
  candidates: EmployeeIdentityCandidate[],
  options: { tokenError?: Error; headers?: Record<string, string> } = {},
) {
  const request = {
    headers: options.headers || { authorization: 'Bearer valid-token' },
  } as unknown as Request;
  const result = buildResponse();
  const next = mock(() => undefined) as unknown as NextFunction;
  const middleware = createAuthenticate({
    demoMode: false,
    nodeEnv: 'production',
    verifyFirebaseToken: async () => {
      if (options.tokenError) throw options.tokenError;
      return firebaseIdentity;
    },
    resolveEmployee: (identity) =>
      resolveActiveEmployeeIdentity(identity, new InMemoryEmployeeIdentityStore(candidates)),
  });

  await middleware(request, result.response, next);
  return { request, result, next };
}

describe('Phase 2B-7A Stage A identity middleware', () => {
  it('accepts a valid Firebase token linked to one active employee', async () => {
    const { request, result, next } = await authenticateWith([activeEmployee]);

    expect(next).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(200);
    expect(request.user).toMatchObject({
      firebaseUid: 'firebase-uid-123',
      employeeId: 'emp-sales-009',
      id: 'emp-sales-009',
      uid: 'emp-sales-009',
      role: 'Sales Executive',
      active: true,
    });
    expect(request.user?.id).not.toBe(request.user?.firebaseUid);
    expect(request.user?.uid).not.toBe(request.user?.firebaseUid);
  });

  it('accepts Reservations as a valid active employee role', async () => {
    const reservationsEmployee: EmployeeIdentityCandidate = {
      documentId: 'emp-res-021',
      data: {
        employeeId: 'emp-res-021',
        firebaseUid: 'firebase-uid-123',
        name: 'Reservations Employee',
        email: 'reservations@bookingbridge.com',
        role: 'Reservations',
        active: true,
      },
    };

    const { request, result, next } = await authenticateWith([reservationsEmployee]);
    expect(result.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
    expect(request.user).toMatchObject({
      employeeId: 'emp-res-021',
      firebaseUid: 'firebase-uid-123',
      role: 'Reservations',
    });
  });

  it('serializes canonical Sales team organizational fields', async () => {
    const salesEmployee: EmployeeIdentityCandidate = {
      ...activeEmployee,
      data: {
        ...activeEmployee.data,
        salesTeamId: 'sales-team-01',
        managerEmployeeId: 'emp-mgr-01',
      },
    };

    const { request } = await authenticateWith([salesEmployee]);
    expect(request.user).toMatchObject({
      salesTeamId: 'sales-team-01',
      managerEmployeeId: 'emp-mgr-01',
    });
  });

  it('rejects a valid Firebase token with no employee record using 403', async () => {
    const { result, next } = await authenticateWith([]);
    expect(next).not.toHaveBeenCalled();
    expect(result.statusCode).toBe(403);
    expect(result.body.code).toBe('EMPLOYEE_NOT_FOUND');
  });

  it('rejects an inactive employee using 403', async () => {
    const candidate = { ...activeEmployee, data: { ...activeEmployee.data, active: false } };
    const { result } = await authenticateWith([candidate]);
    expect(result.statusCode).toBe(403);
    expect(result.body.code).toBe('EMPLOYEE_INACTIVE');
  });

  it('rejects an unknown employee role using 403', async () => {
    const candidate = { ...activeEmployee, data: { ...activeEmployee.data, role: 'Super User' } };
    const { result } = await authenticateWith([candidate]);
    expect(result.statusCode).toBe(403);
    expect(result.body.code).toBe('EMPLOYEE_ROLE_INVALID');
  });

  it('rejects multiple employee records linked to the same Firebase UID', async () => {
    const duplicate = {
      ...activeEmployee,
      documentId: 'second-employee-document',
      data: { ...activeEmployee.data, id: 'emp-sales-010' },
    };
    const { result } = await authenticateWith([activeEmployee, duplicate]);
    expect(result.statusCode).toBe(403);
    expect(result.body.code).toBe('EMPLOYEE_IDENTITY_AMBIGUOUS');
  });

  it('rejects an invalid Firebase token using 401', async () => {
    const { result } = await authenticateWith([], { tokenError: new Error('invalid signature') });
    expect(result.statusCode).toBe(401);
    expect(result.body.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('rejects an expired or revoked Firebase token when Admin verification fails', async () => {
    const { result } = await authenticateWith([], { tokenError: new Error('auth/id-token-revoked') });
    expect(result.statusCode).toBe(401);
    expect(result.body.error).toContain('revoked');
  });

  it('rejects production demo-header impersonation', async () => {
    const { result } = await authenticateWith([], {
      headers: { 'x-demo-user-id': 'emp-founder-01' },
    });
    expect(result.statusCode).toBe(401);
    expect(result.body.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects a production demo token even when a demo header is supplied', async () => {
    const { result } = await authenticateWith([], {
      headers: {
        authorization: 'Bearer demo-token',
        'x-demo-user-id': 'emp-founder-01',
      },
    });
    expect(result.statusCode).toBe(401);
    expect(result.body.code).toBe('AUTH_TOKEN_INVALID');
  });
});

describe('/api/auth/me authoritative response', () => {
  it('returns the resolved BBOS employee identity without compatibility ambiguity', async () => {
    const user: AuthenticatedUser = {
      id: 'emp-accounts-04',
      uid: 'emp-accounts-04',
      firebaseUid: 'firebase-accounts-uid',
      employeeId: 'emp-accounts-04',
      role: 'Accounts',
      name: 'Accounts User',
      email: 'accounts@bookingbridge.com',
      active: true,
    };

    const route = (apiRouter as any).stack.find(
      (layer: any) => layer.route?.path === '/auth/me' && layer.route.methods.get,
    );
    const handler = route.route.stack[0].handle;
    const result = buildResponse();
    await handler({ user } as Request, result.response, () => undefined);

    expect(result.body.user).toEqual(toPublicAuthenticatedUser(user));
    expect(result.body.user).toMatchObject({
      firebaseUid: 'firebase-accounts-uid',
      employeeId: 'emp-accounts-04',
      role: 'Accounts',
      active: true,
    });
    expect(result.body.user.id).toBeUndefined();
    expect(result.body.user.uid).toBeUndefined();
  });
});

describe('employee identity error contract', () => {
  it('uses typed authorization failures rather than assigning a fallback role', () => {
    const error = new EmployeeIdentityError('EMPLOYEE_NOT_FOUND', 'not found');
    expect(error.code).toBe('EMPLOYEE_NOT_FOUND');
  });
});
