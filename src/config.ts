/**
 * Demo data and demo identities are opt-in.  A production deployment must not
 * become a privileged demo environment merely because an environment variable
 * was omitted.
 *
 * Set both BBOS_DEMO_MODE and VITE_BBOS_DEMO_MODE to "true" for local demo
 * development.  The former configures the API process and the latter configures
 * the browser bundle.
 */
const serverDemoMode = typeof process !== 'undefined' ? process.env.BBOS_DEMO_MODE : undefined;
const clientDemoMode = import.meta.env.VITE_BBOS_DEMO_MODE;

export const APP_CONFIG = {
  DEMO_MODE: (serverDemoMode ?? clientDemoMode) === 'true',
};
