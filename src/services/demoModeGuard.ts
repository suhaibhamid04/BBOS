export function assertDemoControlsAllowed(demoMode: boolean): void {
  if (!demoMode) {
    throw new Error('Demo fixture controls are disabled outside explicit demo mode.');
  }
}
