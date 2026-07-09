import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  // The harness is a single long-lived process holding shared, stateful,
  // IP-keyed rate-limit data and on-disk fixture files — serial execution
  // avoids races between spec files without needing per-test isolation
  // (fine for a local dev tool; this is not run in CI).
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/harness/serve.js',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: false,
    timeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
