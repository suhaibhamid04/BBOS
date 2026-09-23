import { describe, expect, it, mock } from 'bun:test';
import {
  assertDemoIdentitySwitchingAllowed,
  fetchAuthoritativeIdentity,
  resolveInitialBrowserIdentity,
} from '../../src/services/auth/authoritativeIdentity';
import { PRESET_USERS } from '../../src/services/permissions';

describe('browser authoritative BBOS identity', () => {
  it('ignores a persisted elevated role when production demo mode is disabled', () => {
    const forgedFounder = JSON.stringify({
      ...PRESET_USERS[0],
      id: 'attacker-controlled-id',
      role: 'Founder',
      active: true,
    });

    expect(resolveInitialBrowserIdentity(false, forgedFounder, PRESET_USERS[0])).toBeNull();
  });

  it('rejects demo identity switching outside explicit demo mode', () => {
    expect(() => assertDemoIdentitySwitchingAllowed(false)).toThrow('outside DEMO_MODE');
  });

  it('uses the role and employeeId returned by /api/auth/me', async () => {
    const firebaseUser = {
      getIdToken: mock(async () => 'firebase-id-token'),
    };
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer firebase-id-token' });
      return new Response(JSON.stringify({
        user: {
          firebaseUid: 'firebase-uid',
          employeeId: 'emp-admin-07',
          role: 'Admin',
          name: 'Authoritative Admin',
          email: 'admin@bookingbridge.com',
          active: true,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const profile = await fetchAuthoritativeIdentity(firebaseUser as any, fetchMock as any);

    expect(profile.id).toBe('emp-admin-07');
    expect(profile.firebaseUid).toBe('firebase-uid');
    expect(profile.role).toBe('Admin');
  });

  it('accepts the authoritative Reservations production role', async () => {
    const firebaseUser = { getIdToken: async () => 'reservations-token' };
    const fetchMock = async () => new Response(JSON.stringify({
      user: {
        firebaseUid: 'firebase-res-1',
        employeeId: 'emp-res-1',
        role: 'Reservations',
        name: 'Reservations User',
        email: 'reservations@example.com',
        active: true,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const profile = await fetchAuthoritativeIdentity(firebaseUser as any, fetchMock as any);
    expect(profile.role).toBe('Reservations');
    expect(profile.employeeId).toBe('emp-res-1');
  });

  it('maps Sales team organizational fields into the browser profile', async () => {
    const firebaseUser = { getIdToken: async () => 'sales-token' };
    const fetchMock = async () => new Response(JSON.stringify({
      user: {
        firebaseUid: 'firebase-sales-1', employeeId: 'emp-sales-1', role: 'Sales Executive',
        name: 'Sales User', email: 'sales@example.com', active: true,
        salesTeamId: 'sales-team-01', managerEmployeeId: 'emp-mgr-01',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const profile = await fetchAuthoritativeIdentity(firebaseUser as any, fetchMock as any);
    expect(profile.salesTeamId).toBe('sales-team-01');
    expect(profile.managerEmployeeId).toBe('emp-mgr-01');
  });

  it('rejects malformed organizational identity fields', async () => {
    const firebaseUser = { getIdToken: async () => 'token' };
    const fetchMock = async () => new Response(JSON.stringify({
      user: {
        firebaseUid: 'uid', employeeId: 'emp-1', role: 'Sales Executive',
        name: 'Bad Team', email: 'bad-team@example.com', active: true,
        salesTeamId: 42,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    expect(fetchAuthoritativeIdentity(firebaseUser as any, fetchMock as any))
      .rejects.toThrow('invalid BBOS employee identity');
  });

  it('does not accept an unknown role from the server', async () => {
    const firebaseUser = { getIdToken: async () => 'token' };
    const fetchMock = async () => new Response(JSON.stringify({
      user: {
        firebaseUid: 'uid', employeeId: 'emp-1', role: 'Super User',
        name: 'Bad Role', email: 'bad@example.com', active: true,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    expect(fetchAuthoritativeIdentity(firebaseUser as any, fetchMock as any))
      .rejects.toThrow('invalid BBOS employee identity');
  });

  it('does not grant application authority after Firebase-only signup/login', async () => {
    const firebaseUser = { getIdToken: async () => 'token' };
    const fetchMock = async () => new Response(JSON.stringify({
      error: 'Firebase account is not linked to a BBOS employee record.',
      code: 'EMPLOYEE_NOT_FOUND',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });

    expect(fetchAuthoritativeIdentity(firebaseUser as any, fetchMock as any))
      .rejects.toThrow('not linked to a BBOS employee');
  });
});
