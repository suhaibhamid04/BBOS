import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_FIRESTORE_DATABASE_ID,
  FirestoreTopologyError,
  PRODUCTION_FIREBASE_PROJECT_ID,
  STAGING_FIREBASE_PROJECT_ID,
  createFirestoreDeploymentConfig,
  resolveFirestoreTopology,
} from '../../shared/firestoreTopology';
import { loadBrowserFirestoreTopology } from '../../src/lib/firebaseTopology';
import { loadFirebaseWebConfig } from '../../src/lib/firebaseWebConfig';
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
    expect(loadServerFirestoreTopology({
      NODE_ENV: 'production', BBOS_ENVIRONMENT: 'production', FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID,
      GCLOUD_PROJECT: PRODUCTION_FIREBASE_PROJECT_ID, BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toEqual(topology);
    expect(loadBrowserFirestoreTopology({
      MODE: 'production', PROD: true, VITE_BBOS_ENVIRONMENT: 'production',
      VITE_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID, VITE_BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toEqual(topology);
  });

  it('accepts the staging default database for an optimized browser build and Cloud Run process', () => {
    const browser = loadBrowserFirestoreTopology({
      MODE: 'staging', PROD: true, VITE_BBOS_ENVIRONMENT: 'staging',
      VITE_FIREBASE_PROJECT_ID: STAGING_FIREBASE_PROJECT_ID, VITE_BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    });
    const server = loadServerFirestoreTopology({
      NODE_ENV: 'production', BBOS_ENVIRONMENT: 'staging', FIREBASE_PROJECT_ID: STAGING_FIREBASE_PROJECT_ID,
      GCLOUD_PROJECT: STAGING_FIREBASE_PROJECT_ID, BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    });
    expect(browser).toEqual(server);
    expect(server.runtimeMode).toBe('staging');
    expect(server.isDefaultDatabase).toBe(true);
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

  it('keeps staging and production projects isolated in both directions', () => {
    expect(() => resolveFirestoreTopology({
      runtimeMode: 'staging', projectId: PRODUCTION_FIREBASE_PROJECT_ID, databaseId: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow(`must target ${STAGING_FIREBASE_PROJECT_ID}`);
    expect(() => resolveFirestoreTopology({
      runtimeMode: 'production', projectId: STAGING_FIREBASE_PROJECT_ID, databaseId: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow(`must target ${PRODUCTION_FIREBASE_PROJECT_ID}`);
    expect(() => loadBrowserFirestoreTopology({
      MODE: 'staging', PROD: true, VITE_BBOS_ENVIRONMENT: 'staging',
      VITE_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID, VITE_BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow(`must target ${STAGING_FIREBASE_PROJECT_ID}`);
    expect(() => loadServerFirestoreTopology({
      NODE_ENV: 'production', BBOS_ENVIRONMENT: 'production', FIREBASE_PROJECT_ID: STAGING_FIREBASE_PROJECT_ID,
      BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow(`must target ${PRODUCTION_FIREBASE_PROJECT_ID}`);
  });

  it('requires explicit staging project, database, and matching Cloud Run project identity', () => {
    expect(() => loadServerFirestoreTopology({
      NODE_ENV: 'production', BBOS_ENVIRONMENT: 'staging', BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow('Set FIREBASE_PROJECT_ID explicitly');
    expect(() => loadServerFirestoreTopology({
      NODE_ENV: 'production', BBOS_ENVIRONMENT: 'staging', FIREBASE_PROJECT_ID: STAGING_FIREBASE_PROJECT_ID,
    })).toThrow('Set BBOS_FIRESTORE_DATABASE_ID explicitly');
    expect(() => loadBrowserFirestoreTopology({
      MODE: 'staging', PROD: true, VITE_BBOS_ENVIRONMENT: 'staging',
      VITE_BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow('Set FIREBASE_PROJECT_ID explicitly');
    expect(() => loadBrowserFirestoreTopology({
      MODE: 'staging', PROD: true, VITE_BBOS_ENVIRONMENT: 'staging', VITE_FIREBASE_PROJECT_ID: STAGING_FIREBASE_PROJECT_ID,
    })).toThrow('Set BBOS_FIRESTORE_DATABASE_ID explicitly');
    expect(() => loadServerFirestoreTopology({
      NODE_ENV: 'production', BBOS_ENVIRONMENT: 'staging', FIREBASE_PROJECT_ID: STAGING_FIREBASE_PROJECT_ID,
      BBOS_FIRESTORE_DATABASE_ID: namedDatabaseId,
    })).toThrow('must target the explicit (default) Firestore database');
    expect(() => loadServerFirestoreTopology({
      NODE_ENV: 'production', BBOS_ENVIRONMENT: 'staging', FIREBASE_PROJECT_ID: STAGING_FIREBASE_PROJECT_ID,
      GCLOUD_PROJECT: PRODUCTION_FIREBASE_PROJECT_ID, BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow('does not match the client app project');
  });

  it('rejects unknown runtime and process environment names', () => {
    expect(() => resolveFirestoreTopology({
      runtimeMode: 'preview', projectId: developmentProjectId, databaseId: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow('unsupported');
    expect(() => loadServerFirestoreTopology({
      NODE_ENV: 'preview', BBOS_ENVIRONMENT: 'preview', FIREBASE_PROJECT_ID: developmentProjectId,
      BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow('NODE_ENV is unsupported');
    expect(() => loadBrowserFirestoreTopology({
      MODE: 'preview', VITE_BBOS_ENVIRONMENT: 'preview', VITE_FIREBASE_PROJECT_ID: developmentProjectId,
      VITE_BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow('Vite build mode is unsupported');
    expect(() => loadServerFirestoreTopology({
      NODE_ENV: 'production', BBOS_ENVIRONMENT: 'preview', FIREBASE_PROJECT_ID: developmentProjectId,
      BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow('requires BBOS_ENVIRONMENT=production or staging');
    expect(() => loadBrowserFirestoreTopology({
      MODE: 'production', PROD: true, VITE_BBOS_ENVIRONMENT: 'preview', VITE_FIREBASE_PROJECT_ID: developmentProjectId,
      VITE_BBOS_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_ID,
    })).toThrow('requires VITE_BBOS_ENVIRONMENT=production or staging');
  });

  it('validates project-bound Firebase Web configuration without assuming an App ID format', () => {
    const config = loadFirebaseWebConfig({
      VITE_FIREBASE_API_KEY: 'public-web-api-key',
      VITE_FIREBASE_APP_ID: '1:123456789:web:opaque-value',
      VITE_FIREBASE_AUTH_DOMAIN: `${STAGING_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      VITE_FIREBASE_STORAGE_BUCKET: `${STAGING_FIREBASE_PROJECT_ID}.appspot.com`,
      VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
    }, STAGING_FIREBASE_PROJECT_ID);
    expect(config.projectId).toBe(STAGING_FIREBASE_PROJECT_ID);
    expect(config.authDomain).toBe(`${STAGING_FIREBASE_PROJECT_ID}.firebaseapp.com`);

    expect(() => loadFirebaseWebConfig({
      VITE_FIREBASE_API_KEY: 'public-web-api-key', VITE_FIREBASE_APP_ID: 'opaque-app-id',
      VITE_FIREBASE_AUTH_DOMAIN: `${PRODUCTION_FIREBASE_PROJECT_ID}.firebaseapp.com`,
    }, STAGING_FIREBASE_PROJECT_ID)).toThrow('belongs to a different Firebase project');
    expect(() => loadFirebaseWebConfig({
      VITE_FIREBASE_API_KEY: 'public-web-api-key', VITE_FIREBASE_APP_ID: '1:123456789:web:opaque-value',
      VITE_FIREBASE_AUTH_DOMAIN: `${STAGING_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      VITE_FIREBASE_MESSAGING_SENDER_ID: '987654321',
    }, STAGING_FIREBASE_PROJECT_ID)).toThrow('identify different Firebase projects');
    expect(loadFirebaseWebConfig({
      VITE_FIREBASE_API_KEY: 'public-web-api-key', VITE_FIREBASE_APP_ID: 'opaque-app-id',
      VITE_FIREBASE_AUTH_DOMAIN: 'auth.staging.bookingbridge.example',
    }, STAGING_FIREBASE_PROJECT_ID).appId).toBe('opaque-app-id');
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
