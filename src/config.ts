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
const serverLowMarginThreshold = typeof process !== 'undefined' ? process.env.BBOS_LOW_MARGIN_THRESHOLD_PERCENT : undefined;
const clientLowMarginThreshold = import.meta.env.VITE_BBOS_LOW_MARGIN_THRESHOLD_PERCENT;
const configuredLowMarginThreshold = serverLowMarginThreshold ?? clientLowMarginThreshold;

export const APP_CONFIG = {
  DEMO_MODE: (serverDemoMode ?? clientDemoMode) === 'true',
  LOW_MARGIN_THRESHOLD_PERCENT: configuredLowMarginThreshold === undefined || configuredLowMarginThreshold === ''
    ? undefined
    : Number(configuredLowMarginThreshold),
};
