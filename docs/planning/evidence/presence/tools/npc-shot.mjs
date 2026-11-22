import { createRequire } from 'node:module';
// Run from the repository root (or set ROOT), against a server you started yourself.
const require = createRequire(`${process.env.ROOT ?? process.cwd()}/package.json`);
const { chromium, devices } = require('@playwright/test');
const out = new URL('.', import.meta.url).pathname;
const base = process.env.BASE ?? 'http://127.0.0.1:3147';
const browser = await chromium.launch();
async function shot(name, options, path, online, clip) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', ...options });
  const page = await context.newPage();
  await page.goto(`${base}${path}`);
  await page.waitForFunction(() => document.querySelector('canvas')?.hasAttribute('data-npc-foundations'), null, { timeout: 30000 });
  await page.evaluate(n => window.__logicIslandPopulation.set({ foundations: n }), online);
  // Close the subjects panel so the whole island shows.
  await page.getByRole('button', { name: /關閉.*清單/ }).click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(14000);
  console.log(name, 'drawn', await page.evaluate(() => document.querySelector('canvas').getAttribute('data-npc-foundations')));
  await page.screenshot({ path: `${out}${name}.png`, ...(clip ? { clip } : {}) });
  await context.close();
}
await shot('npc2-focus', { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 }, '/?island=foundations', 40, { x: 380, y: 80, width: 720, height: 700 });
await shot('npc2-overview', { viewport: { width: 1440, height: 1000 } }, '/', 40, { x: 0, y: 64, width: 1100, height: 760 });
await shot('npc2-phone', { ...devices['iPhone 13'] }, '/?island=foundations', 40);
await browser.close();
