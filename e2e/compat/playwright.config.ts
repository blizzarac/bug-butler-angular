import { defineConfig, devices } from '@playwright/test';

// Runs compat.spec.ts against a freshly generated app on the newest Angular that uses the packed library.
// ROOT must point at that app's built `browser` folder. See .github/workflows/ci.yml.
const port = 4301;

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices['Desktop Chrome'],
    contextOptions: { reducedMotion: 'reduce' },
    launchOptions: process.env['CHROMIUM_PATH'] ? { executablePath: process.env['CHROMIUM_PATH'] } : {},
  },
  webServer: { command: 'node ../serve.mjs', port, env: { PORT: String(port), ROOT: process.env['ROOT'] ?? '' } },
});
