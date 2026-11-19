// One contact sheet per page: its seven reviewed widths side by side at one height. usage: node sheets.mjs <copy-root> <shots-dir> <out-dir> <footer>
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [root, shots, out, footer] = process.argv.slice(2);
const require = createRequire(root + '/');
const { chromium } = require('@playwright/test');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const WIDTHS = [320, 375, 390, 834, 1024, 1280, 1440];
for (const name of ['overview', 'region-cs', 'region-ai', 'region-design', 'region-web', 'region-sys']) {
  const images = WIDTHS.map(w => readFileSync(`${shots}/${name}-${w}.jpg`).toString('base64'));
  const b64 = await page.evaluate(async ([images, widths, footer, name]) => {
    const bitmaps = await Promise.all(images.map(async s => createImageBitmap(await (await fetch('data:image/jpeg;base64,' + s)).blob())));
    const H = 430, gap = 10, cap = 18, foot = 24;
    const sized = bitmaps.map(b => ({ b, w: Math.round(b.width * H / b.height) }));
    const W = sized.reduce((n, s) => n + s.w + gap, gap);
    const c = new OffscreenCanvas(W, H + cap + foot + gap), g = c.getContext('2d');
    g.fillStyle = '#10161d'; g.fillRect(0, 0, c.width, c.height); g.font = '12px ui-monospace, Menlo, monospace'; g.textBaseline = 'middle';
    let x = gap;
    sized.forEach((s, i) => { g.fillStyle = '#e8eef4'; g.fillText(`${widths[i]} px`, x, cap / 2 + 1); g.drawImage(s.b, x, cap, s.w, H); x += s.w + gap; });
    g.fillStyle = '#9fb3c4'; g.fillText(`${name} | ${footer}`, gap, H + cap + gap + foot / 2 - 4);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: .8 });
    const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, [images, WIDTHS, footer, name]);
  writeFileSync(`${out}/sheet-${name}.jpg`, Buffer.from(b64, 'base64'));
}
await browser.close();
