import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * D.3-0 rendering measurements; not part of `test:e2e`. See docs/handoff/TESTING_STATUS.md.
 * PERF_BASE_URL points at an already running production server (otherwise the base web server starts);
 * PERF_GPU=metal renders on the Mac GPU instead of SwiftShader. Camera transitions animate (no reduced motion).
 */
const args = process.env.PERF_GPU === 'metal' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [];
export default defineConfig({
  ...base,
  testDir: './perf',
  testMatch: '*.perf.ts',
  timeout: 900_000,
  use: { ...base.use, baseURL: process.env.PERF_BASE_URL ?? base.use?.baseURL, reducedMotion: 'no-preference', trace: 'off', screenshot: 'off' },
  projects: base.projects?.map(project => ({ ...project, use: { ...project.use, launchOptions: { args } } })),
  webServer: process.env.PERF_BASE_URL ? undefined : base.webServer,
});
