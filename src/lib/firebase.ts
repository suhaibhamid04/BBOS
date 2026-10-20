import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';
import { loadBrowserFirestoreTopology } from './firebaseTopology';
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
  });
  const firebaseConfig = {
    ...firebaseConfigJson,
    projectId: firestoreTopology.projectId,
    ...(emulatorMode ? { authDomain: `${firestoreTopology.projectId}.firebaseapp.com` } : {}),
  };
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
  if (import.meta.env.PROD) throw error;
  console.warn('Firebase initialization error, will use mock/local fallback state:', error);
}

export { app, auth, db, firestoreTopology };
