import { defineConfig, devices } from '@playwright/test';

// A1-P: the repo's two projects against a server that is already running (the Preview door, preview-proxy.mjs).
// Nothing is built or started here. Copy next to playwright.config.ts of the checkout under test, then:
//   REMOTE_BASE=http://127.0.0.1:3150 LOGIC_ISLAND_REGIONAL_WORLD=1 playwright test -c playwright.remote.config.ts
// LOGIC_ISLAND_TRIALS and LOGIC_ISLAND_WORLD_REVIEW stay unset: they must describe the build being tested.
if (!process.env.REMOTE_BASE) throw new Error('REMOTE_BASE is not set');
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.REMOTE_BASE, reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
