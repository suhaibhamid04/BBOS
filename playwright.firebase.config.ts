import { defineConfig, devices } from '@playwright/test';

const qa3ProjectId = 'bbos-qa3-local';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/firebase-sales-flow.e2e.ts',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://127.0.0.1:3200',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      BBOS_DEMO_MODE: 'false',
      VITE_BBOS_DEMO_MODE: 'false',
      VITE_FIREBASE_EMULATOR: 'true',
      VITE_FIREBASE_PROJECT_ID: qa3ProjectId,
      VITE_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1',
      VITE_FIREBASE_AUTH_EMULATOR_PORT: '9099',
      VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1',
      VITE_FIRESTORE_EMULATOR_PORT: '8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_PROJECT_ID: qa3ProjectId,
      GCLOUD_PROJECT: qa3ProjectId,
      NODE_ENV: 'development',
      PORT: '3200',
    },
  },
  projects: [{ name: 'firebase-emulator-chromium', use: { ...devices['Desktop Chrome'] } }],
});
