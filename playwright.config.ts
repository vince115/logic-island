import { defineConfig, devices } from '@playwright/test';

// This suite requires explicit permission to access the local browser preview.
// It has NOT been executed while the saved browser access policy blocks localhost.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'pnpm start --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
