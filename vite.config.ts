import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { loadBrowserFirestoreTopology } from './src/lib/firebaseTopology';
import { loadFirebaseWebConfig } from './src/lib/firebaseWebConfig';

export default defineConfig(({ mode }) => {
  // Container and release verification builds provide an explicit environment
  // and must never absorb a developer's local .env files into the bundle.
  const fileEnvironment = process.env.BBOS_DISABLE_VITE_ENV_FILES === 'true'
    ? {}
    : loadEnv(mode, process.cwd(), '');
  const environment = { ...fileEnvironment, ...process.env };
  if (mode === 'production') {
    const topology = loadBrowserFirestoreTopology({
      MODE: mode,
      PROD: true,
      VITE_FIREBASE_EMULATOR: environment.VITE_FIREBASE_EMULATOR,
      VITE_FIREBASE_PROJECT_ID: environment.VITE_FIREBASE_PROJECT_ID,
      FIREBASE_PROJECT_ID: environment.FIREBASE_PROJECT_ID,
      BBOS_FIRESTORE_DATABASE_ID: environment.BBOS_FIRESTORE_DATABASE_ID,
      VITE_BBOS_FIRESTORE_DATABASE_ID: environment.VITE_BBOS_FIRESTORE_DATABASE_ID,
      VITE_BBOS_ENVIRONMENT: environment.VITE_BBOS_ENVIRONMENT || environment.BBOS_ENVIRONMENT,
      VITE_BBOS_LOCAL_PRODUCTION_DIAGNOSTIC: environment.VITE_BBOS_LOCAL_PRODUCTION_DIAGNOSTIC,
      VITE_BBOS_READ_ONLY_DIAGNOSTIC: environment.VITE_BBOS_READ_ONLY_DIAGNOSTIC,
    });
    loadFirebaseWebConfig({
      VITE_FIREBASE_EMULATOR: environment.VITE_FIREBASE_EMULATOR,
      VITE_FIREBASE_API_KEY: environment.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_APP_ID: environment.VITE_FIREBASE_APP_ID,
      VITE_FIREBASE_AUTH_DOMAIN: environment.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_STORAGE_BUCKET: environment.VITE_FIREBASE_STORAGE_BUCKET,
      VITE_FIREBASE_MESSAGING_SENDER_ID: environment.VITE_FIREBASE_MESSAGING_SENDER_ID,
      VITE_FIREBASE_MEASUREMENT_ID: environment.VITE_FIREBASE_MEASUREMENT_ID,
    }, topology.projectId);
  }
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.FIREBASE_PROJECT_ID': JSON.stringify(environment.FIREBASE_PROJECT_ID || ''),
      'import.meta.env.BBOS_FIRESTORE_DATABASE_ID': JSON.stringify(environment.BBOS_FIRESTORE_DATABASE_ID || ''),
      'import.meta.env.VITE_BBOS_FIRESTORE_DATABASE_ID': JSON.stringify(environment.VITE_BBOS_FIRESTORE_DATABASE_ID || environment.BBOS_FIRESTORE_DATABASE_ID || ''),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(environment.VITE_FIREBASE_PROJECT_ID || environment.FIREBASE_PROJECT_ID || ''),
      'import.meta.env.VITE_BBOS_ENVIRONMENT': JSON.stringify(environment.VITE_BBOS_ENVIRONMENT || environment.BBOS_ENVIRONMENT || (mode === 'production' ? 'production' : mode === 'staging' ? 'staging' : 'development')),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
