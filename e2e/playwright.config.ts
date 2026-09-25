import { defineConfig, devices } from '@playwright/test';

const port = 4300;

export default defineConfig({
  testDir: '.',
  testIgnore: ['compat/**'],
  timeout: 30_000,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    // No panel animation, so element boxes are stable when the test reads them.
    contextOptions: { reducedMotion: 'reduce' },
    // Use a preinstalled Chromium when one is provided (e.g. in containers without `playwright install`).
    launchOptions: process.env['CHROMIUM_PATH'] ? { executablePath: process.env['CHROMIUM_PATH'] } : {},
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    cwd: '..',
    port,
    reuseExistingServer: !process.env['CI'],
    env: { PORT: String(port) },
  },
});
