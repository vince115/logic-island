// Side-by-side sheets from pairs. usage: node compose2.mjs <cap-dir> <out-dir> <caption-suffix> <name>=<leftFile>|<leftLabel>|<rightFile>|<rightLabel>|<width>x<height>|<title> ...
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const [cap, out, suffix, ...jobs] = process.argv.slice(2);
const require = createRequire(path.resolve(process.cwd(), 'proto') + '/');
const { chromium } = require('@playwright/test');
const browser = await chromium.launch();
for (const job of jobs) {
  const name = job.slice(0, job.indexOf('=')), [lf, ll, rf, rl, size, title] = job.slice(job.indexOf('=') + 1).split('|'), [w, h] = size.split('x').map(Number);
  const data = f => 'data:image/png;base64,' + fs.readFileSync(path.join(cap, f + '.png')).toString('base64');
  const page = await browser.newPage({ viewport: { width: w * 2 + 36, height: h + 78 }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:#10202c;font:13px/1.3 ui-monospace,Menlo,monospace;color:#e8f0f5"><div style="display:flex;gap:12px;padding:12px 12px 0">
    ${[[ll, lf, '#ffd08a'], [rl, rf, '#8fe3b0']].map(([label, f, c]) => `<figure style="margin:0"><figcaption style="height:26px;white-space:nowrap;overflow:hidden"><b style="color:${c}">${label}</b></figcaption><img src="${data(f)}" width="${w}" height="${h}" style="display:block"></figure>`).join('')}
    </div><p style="margin:8px 12px 0;white-space:nowrap;overflow:hidden">${title} | ${w}x${h} | ${suffix}</p></body>`);
  await page.screenshot({ path: path.join(out, name + '.jpg'), type: 'jpeg', quality: 76 });
  await page.close(); console.log(name);
}
await browser.close();
