import {
  FirestoreTopologyError,
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
  VITE_BBOS_FIRESTORE_DATABASE_ID?: string;
  VITE_BBOS_ENVIRONMENT?: string;
  VITE_BBOS_LOCAL_PRODUCTION_DIAGNOSTIC?: string;
  VITE_BBOS_READ_ONLY_DIAGNOSTIC?: string;
}

export function loadBrowserFirestoreTopology(
  environment: BrowserFirestoreEnvironment,
): FirestoreTopology {
  const emulator = environment.VITE_FIREBASE_EMULATOR === 'true';
  const buildMode = environment.PROD === true
    ? 'production'
    : environment.MODE === 'test'
      ? 'test'
      : environment.MODE === undefined || environment.MODE === 'development'
        ? 'development'
        : undefined;
  if (!buildMode) {
    throw new FirestoreTopologyError(`Vite build mode is unsupported: ${environment.MODE}.`);
  }
  const requestedMode = environment.VITE_BBOS_ENVIRONMENT || buildMode;
  const localProductionDiagnostic = environment.VITE_BBOS_LOCAL_PRODUCTION_DIAGNOSTIC === 'true' && environment.VITE_BBOS_READ_ONLY_DIAGNOSTIC === 'true';
  if (requestedMode === 'production' && buildMode !== 'production' && !localProductionDiagnostic) {
    throw new FirestoreTopologyError('A production Firebase profile cannot run in the development browser without read-only diagnostic flags.');
  }
  if (buildMode === 'production' && !['production', 'staging'].includes(requestedMode)) {
    throw new FirestoreTopologyError('A production browser build requires VITE_BBOS_ENVIRONMENT=production or staging.');
  }
  if (requestedMode === 'staging' && buildMode !== 'production' && !emulator) {
    throw new FirestoreTopologyError('A live staging Firebase profile requires an optimized Vite build. Use emulators for local staging checks.');
  }
  return resolveFirestoreTopology({
    runtimeMode: localProductionDiagnostic && buildMode !== 'production' ? buildMode : requestedMode,
    emulator,
    projectId: environment.VITE_FIREBASE_PROJECT_ID || environment.FIREBASE_PROJECT_ID,
    databaseId: environment.VITE_BBOS_FIRESTORE_DATABASE_ID || environment.BBOS_FIRESTORE_DATABASE_ID,
    allowLocalProductionDiagnostic: environment.VITE_BBOS_LOCAL_PRODUCTION_DIAGNOSTIC === 'true',
    readOnlyDiagnostic: environment.VITE_BBOS_READ_ONLY_DIAGNOSTIC === 'true',
  });
}
