// Compare what two builds render, page by page: visible text, links, and the pixels of a settled full-viewport screenshot.
// usage: node cmp.mjs <copy-root> <baseA> <baseB> <out.jsonl> <path>...
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
const require = createRequire(process.argv[2] + '/');
const { chromium, devices } = require('@playwright/test');
const [a, b, out] = [process.argv[3], process.argv[4], process.argv[5]], pages = process.argv.slice(6);
writeFileSync(out, '');
const sha = buf => createHash('sha1').update(buf).digest('hex');
const browser = await chromium.launch();
async function settled(page) {
  // A 3D page: wait for the scene, its models and labels, then for two identical frames in a row.
  if (await page.locator('canvas').count()) {
    await page.waitForFunction(() => !document.querySelector('[data-model-source="loading"]') && !/準備 3D 場景中/.test(document.body.innerText), null, { timeout: 45000 }).catch(() => {});
  }
  let last = '', shot;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);
    shot = await page.screenshot({ style: '.skip-link{visibility:hidden!important}' });
    const h = sha(shot);
    if (h === last) return shot;
    last = h;
  }
  return shot;
}
for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 1000 } }], ['phone', { ...devices['iPhone 13'] }]]) {
  const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' });
  const page = await ctx.newPage(), probe = await ctx.newPage();
  for (const p of pages) {
    const got = [];
    for (const base of [a, b]) {
      await page.goto(base + p, { waitUntil: 'networkidle' });
      const shot = await settled(page);
      const dom = await page.evaluate(() => ({ text: document.body.innerText, links: [...document.querySelectorAll('a')].map(x => x.getAttribute('href') + '|' + x.textContent.trim()).join('\n'),
        buttons: [...document.querySelectorAll('button')].map(x => (x.getAttribute('aria-label') ?? '') + '|' + x.textContent.trim()).join('\n'),
        routes: [...document.querySelectorAll('button[data-route]')].map(x => x.dataset.target + '→' + x.dataset.route).join(',') }));
      got.push({ ...dom, shot });
    }
    let differing = 0;
    if (sha(got[0].shot) !== sha(got[1].shot)) {
      differing = await probe.evaluate(async ([x, y]) => {
        const load = async s => { const img = new Image(); img.src = 'data:image/png;base64,' + s; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
        const [p, q] = [await load(x), await load(y)];
        if (p.width !== q.width || p.height !== q.height) return -1;
        let n = 0; for (let i = 0; i < p.data.length; i += 4) if (p.data[i] !== q.data[i] || p.data[i + 1] !== q.data[i + 1] || p.data[i + 2] !== q.data[i + 2]) n++;
        return n;
      }, [got[0].shot.toString('base64'), got[1].shot.toString('base64')]);
    }
    const row = { name, p, text: got[0].text === got[1].text, links: got[0].links === got[1].links, buttons: got[0].buttons === got[1].buttons, pixels: differing, routesA: got[0].routes, routesB: got[1].routes };
    appendFileSync(out, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row));
  }
  await ctx.close();
}
await browser.close();
