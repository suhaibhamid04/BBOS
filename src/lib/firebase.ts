import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

try {
  const emulatorMode = import.meta.env.VITE_FIREBASE_EMULATOR === 'true';
  const emulatorProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'bbos-qa3-local';
  const firebaseConfig = emulatorMode
    ? { ...firebaseConfigJson, projectId: emulatorProjectId, authDomain: `${emulatorProjectId}.firebaseapp.com` }
    : firebaseConfigJson;
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  auth = getAuth(app);
  // Support custom databaseId if configured, or default
  if (!emulatorMode && firebaseConfigJson.firestoreDatabaseId && firebaseConfigJson.firestoreDatabaseId !== '(default)') {
    db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);
  } else {
    db = getFirestore(app);
  }

  if (emulatorMode && !(globalThis as any).__bbosFirebaseEmulatorsConnected) {
    const authHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1';
    const authPort = Number(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT || 9099);
    const firestoreHost = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
    const firestorePort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080);
    connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, firestoreHost, firestorePort);
    (globalThis as any).__bbosFirebaseEmulatorsConnected = true;
  }
} catch (error) {
  console.warn('Firebase initialization error, will use mock/local fallback state:', error);
}

export { app, auth, db };
