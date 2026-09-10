import { applicationDefault, initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

// Initialize the Firebase Admin SDK
// This requires GOOGLE_APPLICATION_CREDENTIALS to be set in the environment,
// OR FIREBASE_PROJECT_ID if running in an environment with default credentials.
// For development/demo without a real service account, it initializes a mock or gracefully fails
// operations requiring admin rights, preventing hard crashes.

let db: Firestore | null = null;
let auth: Auth | null = null;

try {
  // If FIREBASE_MOCK_MODE or similar is set, we could mock entirely.
  // We attempt standard initialization which auto-discovers GOOGLE_APPLICATION_CREDENTIALS
  if (!getApps().length) {
    initializeApp({
        credential: applicationDefault()
    });
  }
  db = getFirestore();
  auth = getAuth();
  console.log('[Firebase Admin] Successfully initialized server-side Admin SDK');
} catch (error) {
  console.warn('[Firebase Admin] Initialization warning: Could not initialize Admin SDK. Secure backend writes will not be available. Error:', (error as Error).message);
}

/**
 * Returns the admin Firestore instance if initialized, throwing if unavailable.
 */
export function getAdminDb(): Firestore {
  if (!db) {
    throw new Error('Firebase Admin SDK is not initialized. Cannot perform secure backend operations. Check GOOGLE_APPLICATION_CREDENTIALS.');
  }
  return db;
}

/**
 * Returns the admin Auth instance if initialized, throwing if unavailable.
 */
export function getAdminAuth(): Auth {
  if (!auth) {
    throw new Error('Firebase Admin SDK is not initialized. Check GOOGLE_APPLICATION_CREDENTIALS.');
  }
  return auth;
}
