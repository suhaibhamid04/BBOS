export const DEFAULT_FIRESTORE_DATABASE_ID = '(default)';
export const PRODUCTION_FIREBASE_PROJECT_ID = 'booking-bridge-bbos-prod';

export type FirestoreRuntimeMode = 'production' | 'development' | 'test';

export interface FirestoreTopology {
  projectId: string;
  databaseId: string;
  runtimeMode: FirestoreRuntimeMode;
  emulator: boolean;
  isDefaultDatabase: boolean;
  readOnlyDiagnostic: boolean;
}

export class FirestoreTopologyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirestoreTopologyError';
  }
}

export interface ResolveFirestoreTopologyInput {
  projectId?: string;
  databaseId?: string;
  runtimeMode?: string;
  emulator?: boolean;
  expectedProjectId?: string;
  allowLocalProductionDiagnostic?: boolean;
  readOnlyDiagnostic?: boolean;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeFirestoreDatabaseId(value: string | undefined): string {
  const databaseId = nonEmpty(value);
  if (!databaseId) {
    throw new FirestoreTopologyError(
      'Firestore database configuration missing or inconsistent. Set BBOS_FIRESTORE_DATABASE_ID explicitly.',
    );
  }
  if (databaseId !== value) {
    throw new FirestoreTopologyError(
      'Firestore database configuration missing or inconsistent. BBOS_FIRESTORE_DATABASE_ID must not contain surrounding whitespace.',
    );
  }
  if (databaseId === DEFAULT_FIRESTORE_DATABASE_ID) return databaseId;
  if (!/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(databaseId)) {
    throw new FirestoreTopologyError(
      'Firestore database configuration missing or inconsistent. BBOS_FIRESTORE_DATABASE_ID is invalid.',
    );
  }
  return databaseId;
}

export function normalizeFirebaseProjectId(value: string | undefined): string {
  const projectId = nonEmpty(value);
  if (!projectId) {
    throw new FirestoreTopologyError(
      'Firebase project configuration missing or inconsistent. Set FIREBASE_PROJECT_ID explicitly.',
    );
  }
  if (projectId !== value) {
    throw new FirestoreTopologyError(
      'Firebase project configuration missing or inconsistent. FIREBASE_PROJECT_ID must not contain surrounding whitespace.',
    );
  }
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new FirestoreTopologyError(
      'Firebase project configuration missing or inconsistent. FIREBASE_PROJECT_ID is invalid.',
    );
  }
  return projectId;
}

function runtimeMode(value: string | undefined): FirestoreRuntimeMode {
  if (value === 'production') return 'production';
  if (value === 'test') return 'test';
  return 'development';
}

export function resolveFirestoreTopology(input: ResolveFirestoreTopologyInput): FirestoreTopology {
  const mode = runtimeMode(input.runtimeMode);
  const production = mode === 'production';
  const projectId = normalizeFirebaseProjectId(input.projectId);
  const databaseId = normalizeFirestoreDatabaseId(input.databaseId);
  const expectedProjectId = nonEmpty(input.expectedProjectId);
  if (expectedProjectId && projectId !== expectedProjectId) {
    throw new FirestoreTopologyError(
      `Firebase project configuration missing or inconsistent. Configured project ${projectId} does not match the client app project ${expectedProjectId}.`,
    );
  }
  if (production && projectId !== PRODUCTION_FIREBASE_PROJECT_ID) {
    throw new FirestoreTopologyError(
      `Production profile must target ${PRODUCTION_FIREBASE_PROJECT_ID}; received ${projectId}.`,
    );
  }
  const targetsProductionFromLocal = !production && projectId === PRODUCTION_FIREBASE_PROJECT_ID;
  const diagnosticAllowed = input.allowLocalProductionDiagnostic === true && input.readOnlyDiagnostic === true;
  if (targetsProductionFromLocal && !diagnosticAllowed) {
    throw new FirestoreTopologyError(
      'Local development cannot target the production Firebase project. For an approved read-only diagnostic, set both BBOS_LOCAL_PRODUCTION_DIAGNOSTIC=true and BBOS_READ_ONLY_DIAGNOSTIC=true.',
    );
  }
  if (mode === 'test' && !input.emulator) {
    throw new FirestoreTopologyError('Test profile requires Firebase emulators and refuses live Firebase access.');
  }
  return {
    projectId,
    databaseId,
    runtimeMode: mode,
    emulator: input.emulator === true,
    isDefaultDatabase: databaseId === DEFAULT_FIRESTORE_DATABASE_ID,
    readOnlyDiagnostic: targetsProductionFromLocal && diagnosticAllowed,
  };
}

export function createFirestoreDeploymentConfig(databaseId: string) {
  return {
    firestore: {
      database: normalizeFirestoreDatabaseId(databaseId),
      rules: 'firestore.rules',
      indexes: 'firestore.indexes.json',
    },
  };
}
