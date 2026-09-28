import { APP_CONFIG } from '../../config';
import { auth } from '../../lib/firebase';

/**
 * Production API identity always comes from a Firebase bearer token. The demo
 * employee header is emitted only when the browser is explicitly in DEMO_MODE.
 */
export async function authenticatedReadHeaders(demoEmployeeId: string): Promise<Record<string, string>> {
  if (APP_CONFIG.DEMO_MODE) return { 'X-Demo-User-Id': demoEmployeeId };

  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) throw new Error('Firebase authentication is required.');
  return { Authorization: `Bearer ${await firebaseUser.getIdToken()}` };
}

export async function authenticatedMutationHeaders(demoEmployeeId: string): Promise<Record<string, string>> {
  return {
    ...(await authenticatedReadHeaders(demoEmployeeId)),
    'Content-Type': 'application/json',
  };
}

export const bookingReadHeaders = authenticatedReadHeaders;
export const bookingMutationHeaders = authenticatedMutationHeaders;
