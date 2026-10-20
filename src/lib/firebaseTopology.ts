import firebaseConfigJson from '../../firebase-applet-config.json';
import {
  DEFAULT_FIRESTORE_DATABASE_ID,
  resolveFirestoreTopology,
  type FirestoreTopology,
} from '../../shared/firestoreTopology';

export interface BrowserFirestoreEnvironment {
  MODE?: string;
  PROD?: boolean;
  VITE_FIREBASE_EMULATOR?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  FIREBASE_PROJECT_ID?: string;
  BBOS_FIRESTORE_DATABASE_ID?: string;
}

export function loadBrowserFirestoreTopology(
  environment: BrowserFirestoreEnvironment,
): FirestoreTopology {
  const emulator = environment.VITE_FIREBASE_EMULATOR === 'true';
  const mode = environment.PROD === true ? 'production' : environment.MODE;
  return resolveFirestoreTopology({
    runtimeMode: mode,
    emulator,
    projectId: emulator
      ? environment.VITE_FIREBASE_PROJECT_ID || environment.FIREBASE_PROJECT_ID
      : environment.FIREBASE_PROJECT_ID,
    databaseId: environment.BBOS_FIRESTORE_DATABASE_ID,
    fallbackProjectId: emulator
      ? environment.VITE_FIREBASE_PROJECT_ID || 'bbos-qa3-local'
      : firebaseConfigJson.projectId,
    fallbackDatabaseId: DEFAULT_FIRESTORE_DATABASE_ID,
    expectedProjectId: emulator ? undefined : firebaseConfigJson.projectId,
  });
}
