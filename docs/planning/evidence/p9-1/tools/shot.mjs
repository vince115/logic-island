// usage: node shot.mjs <base> <out-dir> <name>=<path>@<width>x<height> ...   (waits for the canvas to be drawn)
import { createRequire } from 'node:module';
import path from 'node:path';
const [base, out, ...jobs] = process.argv.slice(2);
const require = createRequire(path.resolve(process.cwd(), 'app') + '/');
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const job of jobs) {
  const name = job.slice(0, job.indexOf('=')), rest = job.slice(job.indexOf('=') + 1), route = rest.slice(0, rest.lastIndexOf('@')), [width, height] = rest.slice(rest.lastIndexOf('@') + 1).split('x').map(Number);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', hasTouch: width < 700, isMobile: width < 700 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 60000 }).catch(() => errors.push('no canvas'));
  await page.waitForTimeout(Number(process.env.SETTLE ?? 2500));
  await page.screenshot({ path: path.join(out, name + '.png'), style: '.skip-link{visibility:hidden!important} nextjs-portal{display:none!important}' });
  console.log(name, errors.length ? 'ERRORS ' + JSON.stringify(errors.slice(0, 4)) : 'ok');
  await context.close();
}
await browser.close();
