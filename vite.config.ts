import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.FIREBASE_PROJECT_ID': JSON.stringify(environment.FIREBASE_PROJECT_ID || ''),
      'import.meta.env.BBOS_FIRESTORE_DATABASE_ID': JSON.stringify(environment.BBOS_FIRESTORE_DATABASE_ID || ''),
      'import.meta.env.VITE_BBOS_FIRESTORE_DATABASE_ID': JSON.stringify(environment.VITE_BBOS_FIRESTORE_DATABASE_ID || environment.BBOS_FIRESTORE_DATABASE_ID || ''),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(environment.VITE_FIREBASE_PROJECT_ID || environment.FIREBASE_PROJECT_ID || ''),
      'import.meta.env.VITE_BBOS_ENVIRONMENT': JSON.stringify(environment.VITE_BBOS_ENVIRONMENT || environment.BBOS_ENVIRONMENT || (mode === 'production' ? 'production' : 'development')),
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
