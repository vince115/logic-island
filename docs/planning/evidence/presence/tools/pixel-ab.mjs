import { createRequire } from 'node:module';
// Run from the repository root (or set ROOT), against servers you started yourself.
const root = process.env.ROOT ?? process.cwd();
const require = createRequire(`${root}/package.json`);
const { chromium, devices } = require('@playwright/test');
const A = process.env.BASE_A ?? 'http://127.0.0.1:3148', B = process.env.BASE_B ?? 'http://127.0.0.1:3147';
const browser = await chromium.launch();
const profiles = { desktop: { viewport: { width: 1440, height: 1000 } }, phone: { ...devices['iPhone 13'] } };
const paths = ['/', '/?island=foundations', '/?island=databases', '/curriculum', '/curriculum/programs-and-algorithms', '/learn', '/learn/bubble-sort', '/regions/cs', '/islands/candidate'];
const style = '.skip-link{visibility:hidden!important}';
async function shot(base, options, path) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  const requests = [];
  page.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/_next/static/')) requests.push(u.pathname); });
  await page.goto(base + path, { waitUntil: 'networkidle' });
  if (path.startsWith('/?') || path === '/' || path.startsWith('/islands')) {
    await page.waitForFunction(() => document.querySelector('button[data-model-source="glb"]') || document.querySelectorAll('canvas').length, null, { timeout: 30000 });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-model-source]')].every(b => b.getAttribute('data-model-source') !== 'loading'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.evaluate(() => scrollTo(0, 0));
  const png = await page.screenshot({ style, animations: 'disabled' });
  const html = await page.content();
  await context.close();
  return { png, requests: [...new Set(requests)].length, html: html.length };
}
const judge = await (await browser.newContext()).newPage();
async function diff(a, b) {
  return judge.evaluate(async ([x, y]) => {
    const load = async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height); };
    const [p, q] = [await load(x), await load(y)];
    if (p.width !== q.width || p.height !== q.height) return { size: `${p.width}x${p.height} vs ${q.width}x${q.height}` };
    let n = 0, max = 0;
    for (let i = 0; i < p.data.length; i += 4) { const d = Math.max(Math.abs(p.data[i] - q.data[i]), Math.abs(p.data[i + 1] - q.data[i + 1]), Math.abs(p.data[i + 2] - q.data[i + 2])); if (d) { n++; if (d > max) max = d; } }
    return { pixels: p.width * p.height, different: n, max };
  }, [a.toString('base64'), b.toString('base64')]);
}
for (const [name, options] of Object.entries(profiles)) for (const path of paths) {
  const a = await shot(A, options, path), b = await shot(B, options, path);
  const d = await diff(a.png, b.png);
  console.log(name.padEnd(8), path.padEnd(40), JSON.stringify(d), 'static requests', a.requests, 'vs', b.requests, 'dom', a.html, 'vs', b.html);
}
await browser.close();
