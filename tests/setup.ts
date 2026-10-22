// Unit/service tests run against in-memory providers. Override any developer
// machine .env values before application modules load so a test cannot select
// a live Firebase project. Emulator suites run in their own commands/processes.
process.env.NODE_ENV = 'test';
process.env.BBOS_ENVIRONMENT = 'test';
process.env.BBOS_DEMO_MODE = 'true';
process.env.VITE_BBOS_DEMO_MODE = 'true';
if (!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_PROJECT_ID = 'bbos-unit-test-local';
  process.env.BBOS_FIRESTORE_DATABASE_ID = '(default)';
}
