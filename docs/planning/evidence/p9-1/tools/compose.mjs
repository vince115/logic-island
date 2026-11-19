// Side-by-side sheets: P8 on the left, P9.1 on the right, with a caption strip. usage: node compose.mjs <cap-dir> <out-dir> <commit>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const [cap, out, commit] = process.argv.slice(2);
const require = createRequire(path.resolve(process.cwd(), 'proto') + '/');
const { chromium } = require('@playwright/test');
const LEVELS = [['world', 'World', '/world', '/p9'], ['region', 'CS Region', '/world/cs', '/p9/cs'], ['island', 'Basics Island', '/world/cs?island=foundations', '/p9/cs?island=foundations']];
const SIZES = [[1440, 1000], [834, 1112], [375, 812]];
const browser = await chromium.launch();
for (const [level, title, p8, p9] of LEVELS) for (const [w, h] of SIZES) {
  const data = name => 'data:image/png;base64,' + fs.readFileSync(path.join(cap, `${name}-${level}-${w}.png`)).toString('base64');
  const page = await browser.newPage({ viewport: { width: w * 2 + 36, height: h + 78 }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:#10202c;font:13px/1.3 ui-monospace,Menlo,monospace;color:#e8f0f5">
    <div style="display:flex;gap:12px;padding:12px 12px 0">
      ${[['P8 (main)', p8, 'p8'], ['P9.1 prototype', p9, 'p9']].map(([label, route, name]) => `<figure style="margin:0"><figcaption style="height:26px;white-space:nowrap;overflow:hidden"><b style="color:${name === 'p9' ? '#8fe3b0' : '#ffd08a'}">${label}</b> &nbsp;${route}</figcaption><img src="${data(name)}" width="${w}" height="${h}" style="display:block"></figure>`).join('')}
    </div><p style="margin:8px 12px 0;white-space:nowrap;overflow:hidden">P9.1 | ${title} | ${w}x${h} | ${commit} | local build, headless Chromium (SwiftShader) | not a real device</p></body>`);
  await page.screenshot({ path: path.join(out, `${level}-${w}.jpg`), type: 'jpeg', quality: 78 });
  await page.close();
  console.log(`${level}-${w}.jpg`);
}
await browser.close();
