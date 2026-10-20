import firebaseConfigJson from '../firebase-applet-config.json';
import {
  DEFAULT_FIRESTORE_DATABASE_ID,
  resolveFirestoreTopology,
  type FirestoreTopology,
} from '../shared/firestoreTopology.js';

export function loadServerFirestoreTopology(
  environment: NodeJS.ProcessEnv = process.env,
): FirestoreTopology {
  const emulator = Boolean(environment.FIRESTORE_EMULATOR_HOST || environment.FIREBASE_AUTH_EMULATOR_HOST);
  const production = environment.NODE_ENV === 'production';
  return resolveFirestoreTopology({
    runtimeMode: environment.NODE_ENV,
    emulator,
    projectId: production
      ? environment.FIREBASE_PROJECT_ID
      : environment.FIREBASE_PROJECT_ID || environment.GCLOUD_PROJECT,
    databaseId: environment.BBOS_FIRESTORE_DATABASE_ID,
    fallbackProjectId: emulator ? 'bbos-qa3-local' : firebaseConfigJson.projectId,
    fallbackDatabaseId: DEFAULT_FIRESTORE_DATABASE_ID,
    expectedProjectId: production ? firebaseConfigJson.projectId : undefined,
  });
}
