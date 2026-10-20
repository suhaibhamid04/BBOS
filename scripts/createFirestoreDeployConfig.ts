import {
  createFirestoreDeploymentConfig,
  normalizeFirebaseProjectId,
  normalizeFirestoreDatabaseId,
} from '../shared/firestoreTopology.js';

const projectId = normalizeFirebaseProjectId(process.env.FIREBASE_PROJECT_ID);
const databaseId = normalizeFirestoreDatabaseId(process.env.BBOS_FIRESTORE_DATABASE_ID);
const projectFlag = process.argv.indexOf('--confirm-project');
const databaseFlag = process.argv.indexOf('--confirm-database');
const confirmedProject = projectFlag >= 0 ? process.argv[projectFlag + 1] : undefined;
const confirmedDatabase = databaseFlag >= 0 ? process.argv[databaseFlag + 1] : undefined;

if (confirmedProject !== projectId || confirmedDatabase !== databaseId) {
  throw new Error(
    'Config generation requires --confirm-project and --confirm-database matching FIREBASE_PROJECT_ID and BBOS_FIRESTORE_DATABASE_ID.',
  );
}

process.stdout.write(`${JSON.stringify(createFirestoreDeploymentConfig(databaseId), null, 2)}\n`);
