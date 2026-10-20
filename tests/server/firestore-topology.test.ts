import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_FIRESTORE_DATABASE_ID,
  FirestoreTopologyError,
  createFirestoreDeploymentConfig,
  resolveFirestoreTopology,
} from '../../shared/firestoreTopology';
import { loadBrowserFirestoreTopology } from '../../src/lib/firebaseTopology';
import { loadServerFirestoreTopology } from '../../server/firestoreTopology';

const projectId = 'universal-arcana-hfjbn';
const namedDatabaseId = 'bbos-nonproduction-fixture';

describe('canonical Firestore topology', () => {
  it('selects the same explicit named database for browser and Admin adapters', () => {
    const browser = loadBrowserFirestoreTopology({
      MODE: 'production',
      PROD: true,
      FIREBASE_PROJECT_ID: projectId,
      BBOS_FIRESTORE_DATABASE_ID: namedDatabaseId,
    });
    const server = loadServerFirestoreTopology({
      NODE_ENV: 'production',
      FIREBASE_PROJECT_ID: projectId,
      BBOS_FIRESTORE_DATABASE_ID: namedDatabaseId,
    });

    expect(browser).toEqual(server);
    expect(server.databaseId).toBe(namedDatabaseId);
    expect(server.isDefaultDatabase).toBe(false);
  });

  it('represents the default database explicitly rather than as undefined', () => {
    const topology = resolveFirestoreTopology({
      runtimeMode: 'test',
      projectId: 'bbos-test-project',
      databaseId: DEFAULT_FIRESTORE_DATABASE_ID,
    });
    expect(topology.databaseId).toBe('(default)');
    expect(topology.isDefaultDatabase).toBe(true);
  });

  it('lets nonproduction browser and server fixtures resolve the same seeded record by topology', () => {
    const browser = loadBrowserFirestoreTopology({
      MODE: 'test',
      FIREBASE_PROJECT_ID: projectId,
      BBOS_FIRESTORE_DATABASE_ID: namedDatabaseId,
    });
    const server = loadServerFirestoreTopology({
      NODE_ENV: 'test',
      FIREBASE_PROJECT_ID: projectId,
      BBOS_FIRESTORE_DATABASE_ID: namedDatabaseId,
    });
    const fixture = new Map<string, Map<string, unknown>>();
    const serverDatabase = fixture.get(server.databaseId) || new Map<string, unknown>();
    fixture.set(server.databaseId, serverDatabase);
    serverDatabase.set('topology-proof/known-record', { value: 'same-database' });

    expect(fixture.get(browser.databaseId)?.get('topology-proof/known-record')).toEqual({
      value: 'same-database',
    });
  });

  it('fails closed when production database configuration is missing', () => {
    expect(() => loadServerFirestoreTopology({
      NODE_ENV: 'production',
      FIREBASE_PROJECT_ID: projectId,
    })).toThrow('Set BBOS_FIRESTORE_DATABASE_ID explicitly');
    expect(() => loadBrowserFirestoreTopology({
      MODE: 'production',
      PROD: true,
      FIREBASE_PROJECT_ID: projectId,
    })).toThrow('Set BBOS_FIRESTORE_DATABASE_ID explicitly');
  });

  it('does not accept GCLOUD_PROJECT as an implicit production project fallback', () => {
    expect(() => loadServerFirestoreTopology({
      NODE_ENV: 'production',
      GCLOUD_PROJECT: projectId,
      BBOS_FIRESTORE_DATABASE_ID: namedDatabaseId,
    })).toThrow('Set FIREBASE_PROJECT_ID explicitly');
  });

  it('rejects invalid database IDs and inconsistent client projects', () => {
    expect(() => resolveFirestoreTopology({
      runtimeMode: 'production',
      projectId,
      databaseId: 'INVALID/database',
    })).toThrow(FirestoreTopologyError);
    expect(() => resolveFirestoreTopology({
      runtimeMode: 'production',
      projectId,
      databaseId: ' (default) ',
    })).toThrow('must not contain surrounding whitespace');
    expect(() => loadServerFirestoreTopology({
      NODE_ENV: 'production',
      FIREBASE_PROJECT_ID: 'another-firebase-project',
      BBOS_FIRESTORE_DATABASE_ID: namedDatabaseId,
    })).toThrow('does not match the client app project');
  });

  it('writes the approved database into rules and index deployment configuration', () => {
    expect(createFirestoreDeploymentConfig(namedDatabaseId)).toEqual({
      firestore: {
        database: namedDatabaseId,
        rules: 'firestore.rules',
        indexes: 'firestore.indexes.json',
      },
    });
  });
});
