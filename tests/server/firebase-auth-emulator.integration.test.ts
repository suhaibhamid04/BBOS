import { describe, expect, it } from 'bun:test';
import type { Request, Response } from 'express';
import { createAuthenticate } from '../../server/middleware/auth';

const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

async function createEmulatorIdentity() {
  if (!authEmulatorHost) throw new Error('FIREBASE_AUTH_EMULATOR_HOST is required.');
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await fetch(`http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=qa3-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `sales-${unique}@qa3.test`, password: 'Qa3-Password-123!', returnSecureToken: true }),
  });
  const payload = await response.json() as { idToken?: string; localId?: string; error?: unknown };
  if (!response.ok || !payload.idToken || !payload.localId) throw new Error(`Auth Emulator signup failed: ${JSON.stringify(payload.error)}`);
  return { idToken: payload.idToken, firebaseUid: payload.localId };
}

describe.skipIf(!authEmulatorHost)('QA3 Firebase Auth Emulator integration', () => {
  it('verifies a real emulator token and resolves a distinct canonical BBOS employeeId', async () => {
    const identity = await createEmulatorIdentity();
    const authenticate = createAuthenticate({
      demoMode: false,
      nodeEnv: 'test',
      resolveEmployee: async (verified) => ({
        firebaseUid: verified.firebaseUid,
        employeeId: 'qa3-sales-executive',
        role: 'Sales Executive',
        name: 'QA3 Sales Executive',
        email: verified.email || '',
        active: true,
        salesTeamId: 'qa3-team-a',
      }),
    });
    const req = { headers: { authorization: `Bearer ${identity.idToken}` } } as Request;
    const json = () => undefined;
    const res = { status: () => ({ json }), json } as unknown as Response;
    let nextCalled = false;
    await authenticate(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(req.user).toMatchObject({
      firebaseUid: identity.firebaseUid,
      employeeId: 'qa3-sales-executive',
      role: 'Sales Executive',
      salesTeamId: 'qa3-team-a',
    });
    expect(req.user?.firebaseUid).not.toBe(req.user?.employeeId);
  });
});
