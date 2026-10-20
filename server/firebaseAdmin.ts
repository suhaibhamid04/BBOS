import { applicationDefault, initializeApp, getApp, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import { FirestoreTopologyError, type FirestoreTopology } from '../shared/firestoreTopology.js';
import { loadServerFirestoreTopology } from './firestoreTopology.js';

// Production requires explicit project/database topology plus application
// default credentials. Local/demo startup may initialize without usable remote
// credentials, but topology errors are never converted to another database.

let db: Firestore | null = null;
let auth: Auth | null = null;
let topology: FirestoreTopology | null = null;
let initializationError: Error | null = null;

try {
  topology = loadServerFirestoreTopology();
  if (!getApps().length) {
    initializeApp(topology.emulator
      ? { projectId: topology.projectId }
      : { credential: applicationDefault(), projectId: topology.projectId });
  }
  const adminApp = getApp();
  const initializedProjectId = adminApp.options.projectId;
  if (initializedProjectId && initializedProjectId !== topology.projectId) {
    throw new FirestoreTopologyError(
      `Firebase project configuration missing or inconsistent. Existing Admin app uses ${initializedProjectId}; configured project is ${topology.projectId}.`,
    );
  }
  db = getFirestore(adminApp, topology.databaseId);
  auth = getAuth(adminApp);
  console.log('[Firebase Admin] Initialized', {
    projectId: topology.projectId,
    databaseId: topology.databaseId,
    runtimeMode: topology.runtimeMode,
    emulator: topology.emulator,
  });
} catch (error) {
  initializationError = error instanceof Error ? error : new Error(String(error));
  console.warn('[Firebase Admin] Initialization warning: Secure backend writes are unavailable. Error:', initializationError.message);
}

export function assertFirebaseAdminStartup(): void {
  if (initializationError instanceof FirestoreTopologyError) throw initializationError;
  if (process.env.NODE_ENV === 'production' && (initializationError || !db || !auth || !topology)) {
    throw new Error(
      `Firestore database configuration missing or inconsistent. Firebase Admin startup failed: ${initializationError?.message || 'unknown initialization error'}`,
    );
  }
}

export function getFirebaseAdminTopology(): FirestoreTopology {
  if (!topology) {
    throw initializationError || new Error('Firestore topology is unavailable.');
  }
  return topology;
}

/**
 * Returns the admin Firestore instance if initialized, throwing if unavailable.
 */
export function getAdminDb(): Firestore {
  if (!db) {
    throw new Error(`Firebase Admin SDK is not initialized. Cannot perform secure backend operations. ${initializationError?.message || 'Check credentials and Firestore topology.'}`);
  }
  return db;
}

/**
 * Returns the admin Auth instance if initialized, throwing if unavailable.
 */
export function getAdminAuth(): Auth {
  if (!auth) {
    throw new Error(`Firebase Admin SDK is not initialized. ${initializationError?.message || 'Check credentials and Firestore topology.'}`);
  }
  return auth;
}
