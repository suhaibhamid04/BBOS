import {
  FirestoreTopologyError,
  resolveFirestoreTopology,
  type FirestoreTopology,
} from '../shared/firestoreTopology.js';

export function loadServerFirestoreTopology(
  environment: NodeJS.ProcessEnv = process.env,
): FirestoreTopology {
  const emulator = Boolean(environment.FIRESTORE_EMULATOR_HOST || environment.FIREBASE_AUTH_EMULATOR_HOST);
  const processMode = environment.NODE_ENV === 'production' ? 'production' : environment.NODE_ENV === 'test' ? 'test' : 'development';
  const requestedMode = environment.BBOS_ENVIRONMENT || processMode;
  const localProductionDiagnostic = environment.BBOS_LOCAL_PRODUCTION_DIAGNOSTIC === 'true' && environment.BBOS_READ_ONLY_DIAGNOSTIC === 'true';
  if (requestedMode === 'production' && processMode !== 'production' && !localProductionDiagnostic) {
    throw new FirestoreTopologyError('A production Firebase profile cannot run in a local development process without the approved read-only diagnostic flags.');
  }
  if (processMode === 'production' && requestedMode !== 'production') {
    throw new FirestoreTopologyError('NODE_ENV=production requires BBOS_ENVIRONMENT=production.');
  }
  return resolveFirestoreTopology({
    runtimeMode: localProductionDiagnostic && processMode !== 'production' ? processMode : requestedMode,
    emulator,
    projectId: environment.FIREBASE_PROJECT_ID,
    databaseId: environment.BBOS_FIRESTORE_DATABASE_ID,
    expectedProjectId: environment.GCLOUD_PROJECT,
    allowLocalProductionDiagnostic: environment.BBOS_LOCAL_PRODUCTION_DIAGNOSTIC === 'true',
    readOnlyDiagnostic: environment.BBOS_READ_ONLY_DIAGNOSTIC === 'true',
  });
}
