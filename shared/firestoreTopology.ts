export const DEFAULT_FIRESTORE_DATABASE_ID = '(default)';

export type FirestoreRuntimeMode = 'production' | 'development' | 'test';

export interface FirestoreTopology {
  projectId: string;
  databaseId: string;
  runtimeMode: FirestoreRuntimeMode;
  emulator: boolean;
  isDefaultDatabase: boolean;
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
  fallbackProjectId?: string;
  fallbackDatabaseId?: string;
  expectedProjectId?: string;
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
  const projectId = normalizeFirebaseProjectId(
    input.projectId || (production ? undefined : input.fallbackProjectId),
  );
  const databaseId = normalizeFirestoreDatabaseId(
    input.databaseId || (production ? undefined : input.fallbackDatabaseId),
  );
  const expectedProjectId = nonEmpty(input.expectedProjectId);
  if (expectedProjectId && projectId !== expectedProjectId) {
    throw new FirestoreTopologyError(
      `Firebase project configuration missing or inconsistent. Configured project ${projectId} does not match the client app project ${expectedProjectId}.`,
    );
  }
  return {
    projectId,
    databaseId,
    runtimeMode: mode,
    emulator: input.emulator === true,
    isDefaultDatabase: databaseId === DEFAULT_FIRESTORE_DATABASE_ID,
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
