import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, Firestore } from 'firebase/firestore';
import { loadBrowserFirestoreTopology } from './firebaseTopology';
import { loadFirebaseWebConfig } from './firebaseWebConfig';
import type { FirestoreTopology } from '../../shared/firestoreTopology';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let firestoreTopology: FirestoreTopology;

try {
  const emulatorMode = import.meta.env.VITE_FIREBASE_EMULATOR === 'true';
  firestoreTopology = loadBrowserFirestoreTopology({
    MODE: import.meta.env.MODE,
    VITE_FIREBASE_EMULATOR: import.meta.env.VITE_FIREBASE_EMULATOR,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    FIREBASE_PROJECT_ID: import.meta.env.FIREBASE_PROJECT_ID,
    BBOS_FIRESTORE_DATABASE_ID: import.meta.env.BBOS_FIRESTORE_DATABASE_ID,
    VITE_BBOS_FIRESTORE_DATABASE_ID: import.meta.env.VITE_BBOS_FIRESTORE_DATABASE_ID,
    VITE_BBOS_ENVIRONMENT: import.meta.env.VITE_BBOS_ENVIRONMENT,
    VITE_BBOS_LOCAL_PRODUCTION_DIAGNOSTIC: import.meta.env.VITE_BBOS_LOCAL_PRODUCTION_DIAGNOSTIC,
    VITE_BBOS_READ_ONLY_DIAGNOSTIC: import.meta.env.VITE_BBOS_READ_ONLY_DIAGNOSTIC,
  });
  const firebaseConfig = loadFirebaseWebConfig({
    VITE_FIREBASE_EMULATOR: import.meta.env.VITE_FIREBASE_EMULATOR,
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_MEASUREMENT_ID: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  }, firestoreTopology.projectId);
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  auth = getAuth(app);
  db = getFirestore(app, firestoreTopology.databaseId);

  if (emulatorMode && !(globalThis as any).__bbosFirebaseEmulatorsConnected) {
    const authHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1';
    const authPort = Number(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT || 9099);
    const firestoreHost = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
    const firestorePort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080);
    connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, firestoreHost, firestorePort);
    (globalThis as any).__bbosFirebaseEmulatorsConnected = true;
  }
  console.info('[Firebase Client] Firestore topology', {
    projectId: firestoreTopology.projectId,
    databaseId: firestoreTopology.databaseId,
    runtimeMode: firestoreTopology.runtimeMode,
    emulator: firestoreTopology.emulator,
  });
} catch (error) {
  throw error;
}

export { app, auth, db, firestoreTopology };
