import {
  FirestoreTopologyError,
  resolveFirestoreTopology,
  type FirestoreTopology,
} from '../shared/firestoreTopology.js';

export function loadServerFirestoreTopology(
  environment: NodeJS.ProcessEnv = process.env,
): FirestoreTopology {
  const emulator = Boolean(environment.FIRESTORE_EMULATOR_HOST || environment.FIREBASE_AUTH_EMULATOR_HOST);
  const processMode = environment.NODE_ENV === 'production'
    ? 'production'
    : environment.NODE_ENV === 'test'
      ? 'test'
      : environment.NODE_ENV === undefined || environment.NODE_ENV === 'development'
        ? 'development'
        : undefined;
  if (!processMode) {
    throw new FirestoreTopologyError(`NODE_ENV is unsupported: ${environment.NODE_ENV}.`);
  }
  const requestedMode = environment.BBOS_ENVIRONMENT || processMode;
  const localProductionDiagnostic = environment.BBOS_LOCAL_PRODUCTION_DIAGNOSTIC === 'true' && environment.BBOS_READ_ONLY_DIAGNOSTIC === 'true';
  if (requestedMode === 'production' && processMode !== 'production' && !localProductionDiagnostic) {
    throw new FirestoreTopologyError('A production Firebase profile cannot run in a local development process without the approved read-only diagnostic flags.');
  }
  if (processMode === 'production' && !['production', 'staging'].includes(requestedMode)) {
    throw new FirestoreTopologyError('NODE_ENV=production requires BBOS_ENVIRONMENT=production or staging.');
  }
  if (requestedMode === 'staging' && processMode !== 'production' && !emulator) {
    throw new FirestoreTopologyError('A live staging Firebase profile requires NODE_ENV=production. Use emulators for local staging checks.');
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
