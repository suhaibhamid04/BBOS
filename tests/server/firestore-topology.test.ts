import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_FIRESTORE_DATABASE_ID,
  FirestoreTopologyError,
  PRODUCTION_FIREBASE_PROJECT_ID,
  createFirestoreDeploymentConfig,
  resolveFirestoreTopology,
} from '../../shared/firestoreTopology';
import { loadBrowserFirestoreTopology } from '../../src/lib/firebaseTopology';
import { loadServerFirestoreTopology } from '../../server/firestoreTopology';

const developmentProjectId = 'universal-arcana-hfjbn';
const namedDatabaseId = 'bbos-nonproduction-fixture';

describe('canonical Firestore topology', () => {
  it('selects the same explicit named development database for browser and Admin adapters', () => {
    const browser = loadBrowserFirestoreTopology({ MODE: 'development', VITE_BBOS_ENVIRONMENT: 'development', VITE_FIREBASE_PROJECT_ID: developmentProjectId, VITE_BBOS_FIRESTORE_DATABASE_ID: namedDatabaseId });
    const server = loadServerFirestoreTopology({ NODE_ENV: 'development', BBOS_ENVIRONMENT: 'development', FIREBASE_PROJECT_ID: developmentProjectId, BBOS_FIRESTORE_DATABASE_ID: namedDatabaseId });
    expect(browser).toEqual(server);
    expect(server.isDefaultDatabase).toBe(false);
  });

  it('represents the production default database explicitly', () => {
    const topology = resolveFirestoreTopology({ runtimeMode: 'production', projectId: PRODUCTION_FIREBASE_PROJECT_ID, databaseId: DEFAULT_FIRESTORE_DATABASE_ID });
    expect(topology.databaseId).toBe('(default)');
    expect(topology.isDefaultDatabase).toBe(true);
  });

  it('allows test topology only when an emulator is explicit', () => {
    const topology = resolveFirestoreTopology({ runtimeMode: 'test', projectId: 'bbos-test-project', databaseId: DEFAULT_FIRESTORE_DATABASE_ID, emulator: true });
    expect(topology.emulator).toBe(true);
    expect(() => resolveFirestoreTopology({ runtimeMode: 'test', projectId: 'bbos-test-project', databaseId: DEFAULT_FIRESTORE_DATABASE_ID })).toThrow('requires Firebase emulators');
  });

  it('fails closed when project or database configuration is missing', () => {
    expect(() => loadServerFirestoreTopology({ NODE_ENV: 'production', BBOS_ENVIRONMENT: 'production', FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID })).toThrow('Set BBOS_FIRESTORE_DATABASE_ID explicitly');
    expect(() => loadBrowserFirestoreTopology({ MODE: 'production', PROD: true, VITE_BBOS_ENVIRONMENT: 'production', VITE_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID })).toThrow('Set BBOS_FIRESTORE_DATABASE_ID explicitly');
    expect(() => loadServerFirestoreTopology({ NODE_ENV: 'production', BBOS_ENVIRONMENT: 'production', BBOS_FIRESTORE_DATABASE_ID: '(default)' })).toThrow('Set FIREBASE_PROJECT_ID explicitly');
  });

  it('rejects the wrong production project and invalid database identifiers', () => {
    expect(() => resolveFirestoreTopology({ runtimeMode: 'production', projectId: developmentProjectId, databaseId: '(default)' })).toThrow(`must target ${PRODUCTION_FIREBASE_PROJECT_ID}`);
    expect(() => resolveFirestoreTopology({ runtimeMode: 'development', projectId: developmentProjectId, databaseId: 'INVALID/database' })).toThrow(FirestoreTopologyError);
    expect(() => resolveFirestoreTopology({ runtimeMode: 'development', projectId: developmentProjectId, databaseId: ' (default) ' })).toThrow('must not contain surrounding whitespace');
  });

  it('blocks accidental local production access', () => {
    expect(() => loadServerFirestoreTopology({ NODE_ENV: 'development', BBOS_ENVIRONMENT: 'development', FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID, BBOS_FIRESTORE_DATABASE_ID: '(default)' })).toThrow('Local development cannot target the production Firebase project');
    expect(() => loadBrowserFirestoreTopology({ MODE: 'development', VITE_BBOS_ENVIRONMENT: 'development', VITE_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID, VITE_BBOS_FIRESTORE_DATABASE_ID: '(default)' })).toThrow('Local development cannot target the production Firebase project');
  });

  it('requires both flags and marks approved local production diagnostics read-only', () => {
    const topology = loadServerFirestoreTopology({
      NODE_ENV: 'development', BBOS_ENVIRONMENT: 'production', FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID,
      BBOS_FIRESTORE_DATABASE_ID: '(default)', BBOS_LOCAL_PRODUCTION_DIAGNOSTIC: 'true', BBOS_READ_ONLY_DIAGNOSTIC: 'true',
    });
    expect(topology.runtimeMode).toBe('development');
    expect(topology.readOnlyDiagnostic).toBe(true);
  });

  it('writes the approved database into rules and index deployment configuration', () => {
    expect(createFirestoreDeploymentConfig(namedDatabaseId)).toEqual({ firestore: { database: namedDatabaseId, rules: 'firestore.rules', indexes: 'firestore.indexes.json' } });
  });
});
