// Are existing pages drawn the same by two builds? Screenshots of the same route from two servers, compared pixel by pixel in a page.
// usage: node same.mjs <base-a> <base-b> <width>x<height> <path>...
import { createRequire } from 'node:module';
import path from 'node:path';
const [a, b, size, ...routes] = process.argv.slice(2), [width, height] = size.split('x').map(Number);
const require = createRequire(path.resolve(process.cwd(), 'proto') + '/');
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const shot = async (base, route) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', hasTouch: width < 700, isMobile: width < 700 });
  const page = await context.newPage();
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4500);
  const png = await page.screenshot({ style: '.skip-link{visibility:hidden!important}' });
  const text = await page.evaluate(() => document.querySelector('main')?.innerText ?? '');
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(x => x.getAttribute('href')).join('|'));
  await context.close();
  return { png, text, links };
};
const judge = await browser.newPage();
for (const route of routes) {
  const [x, y] = [await shot(a, route), await shot(b, route)];
  const diff = await judge.evaluate(async ([p, q]) => {
    const load = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = new OffscreenCanvas(i.width, i.height), g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height); };
    const [m, n] = [await load(p), await load(q)];
    if (m.width !== n.width || m.height !== n.height) return { pixels: -1, max: -1 };
    let pixels = 0, max = 0;
    for (let i = 0; i < m.data.length; i += 4) { const d = Math.max(Math.abs(m.data[i] - n.data[i]), Math.abs(m.data[i + 1] - n.data[i + 1]), Math.abs(m.data[i + 2] - n.data[i + 2])); if (d) { pixels++; if (d > max) max = d; } }
    return { pixels, max, total: m.width * m.height };
  }, [x.png.toString('base64'), y.png.toString('base64')]);
  console.log(JSON.stringify({ route, size, text: x.text === y.text, links: x.links === y.links, ...diff }));
}
await browser.close();
