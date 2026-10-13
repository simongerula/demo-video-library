// Shared path for the logged-in storage state used by functional clips.
// Written by tests/setup/auth.setup.ts (setup project, never recorded),
// consumed via test.use({ storageState }) so library videos open already
// logged in — the login flow is never on camera.
export const PROFILE_STATE_PATH = 'test-results/.auth/profile.json';
