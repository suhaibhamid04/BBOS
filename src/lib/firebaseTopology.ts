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
  const processMode = environment.PROD === true ? 'production' : environment.MODE === 'test' ? 'test' : 'development';
  const requestedMode = environment.VITE_BBOS_ENVIRONMENT || processMode;
  const localProductionDiagnostic = environment.VITE_BBOS_LOCAL_PRODUCTION_DIAGNOSTIC === 'true' && environment.VITE_BBOS_READ_ONLY_DIAGNOSTIC === 'true';
  if (requestedMode === 'production' && processMode !== 'production' && !localProductionDiagnostic) {
    throw new FirestoreTopologyError('A production Firebase profile cannot run in the development browser without read-only diagnostic flags.');
  }
  if (processMode === 'production' && requestedMode !== 'production') {
    throw new FirestoreTopologyError('A production browser build requires VITE_BBOS_ENVIRONMENT=production.');
  }
  return resolveFirestoreTopology({
    runtimeMode: localProductionDiagnostic && processMode !== 'production' ? processMode : requestedMode,
    emulator,
    projectId: environment.VITE_FIREBASE_PROJECT_ID || environment.FIREBASE_PROJECT_ID,
    databaseId: environment.VITE_BBOS_FIRESTORE_DATABASE_ID || environment.BBOS_FIRESTORE_DATABASE_ID,
    allowLocalProductionDiagnostic: environment.VITE_BBOS_LOCAL_PRODUCTION_DIAGNOSTIC === 'true',
    readOnlyDiagnostic: environment.VITE_BBOS_READ_ONLY_DIAGNOSTIC === 'true',
  });
}
