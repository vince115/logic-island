// Compare what two builds render: the visible text, the links and a full-page screenshot of each page.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(process.argv[2] + '/');
const { chromium, devices } = require('@playwright/test');
const [a, b] = [process.argv[3], process.argv[4]], pages = process.argv.slice(5);
const browser = await chromium.launch();
for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 1000 } }], ['phone', { ...devices['iPhone 13'] }]]) {
  const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const p of pages) {
    const got = [];
    for (const base of [a, b]) {
      await page.goto(base + p, { waitUntil: 'networkidle' });
      if (name === 'phone') { const menu = page.getByRole('button', { name: /選單|目錄|導覽/ }).first(); if (await menu.count()) await menu.click().catch(() => {}); }
      await page.waitForTimeout(400);
      const dom = await page.evaluate(() => ({ text: document.body.innerText, links: [...document.querySelectorAll('a')].map(x => x.getAttribute('href') + '|' + x.textContent.trim()).join('\n'),
        nav: [...document.querySelectorAll('nav, aside')].map(n => (n.getAttribute('aria-label') ?? '') + ':' + n.querySelectorAll('a,button,summary').length).join(',') }));
      const shot = createHash('sha1').update(await page.screenshot({ fullPage: true, style: '.skip-link{visibility:hidden!important}' })).digest('hex');
      got.push({ ...dom, shot });
    }
    console.log(JSON.stringify({ name, p, text: got[0].text === got[1].text, links: got[0].links === got[1].links, nav: got[0].nav === got[1].nav, pixels: got[0].shot === got[1].shot, navShape: got[0].nav.slice(0, 120) }));
  }
  await ctx.close();
}
await browser.close();
