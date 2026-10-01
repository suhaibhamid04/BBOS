import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  testIgnore: '**/firebase-sales-flow.e2e.ts',
  fullyParallel: false,
  // The explicit-demo API adapters are process-wide in-memory stores. Running
  // files concurrently makes otherwise isolated browser contexts race on the
  // same authoritative demo records.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      BBOS_DEMO_MODE: 'true',
      VITE_BBOS_DEMO_MODE: 'true',
      NODE_ENV: 'development',
      PORT: '3100',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
