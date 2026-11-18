// Post-merge production checks that smoke.mjs does not cover: every lesson link of the curriculum answers 200,
// the Linux terminal lab runs commands, every flagged world route is absent. Lesson HTML is saved under <out> for the leak scan.
// usage: node post.mjs <node_modules-root> <base-url> <out-dir>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const require = createRequire(process.argv[2] + '/');
const { chromium } = require('@playwright/test');
const base = process.argv[3], out = process.argv[4];
mkdirSync(out, { recursive: true });
const fails = [];
const note = (ok, what) => { if (!ok) fails.push(what); return ok; };

const WORLD_ON = process.argv[5] === 'world';
for (const p of ['/world', '/world/cs', '/world/ai', '/world/design', '/world/web', '/world/sys', '/trials', '/trials/review', '/regions']) {
  const r = await fetch(base + p, { redirect: 'manual' });
  console.log(JSON.stringify({ gone: p, status: r.status }));
  const want = WORLD_ON && p.startsWith('/world') ? 200 : 404; note(r.status === want, `${p} is ${r.status}, expected ${want}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 200)));

// Every link into the curriculum that the curriculum page and the five region pages offer.
const hrefs = new Set();
for (const p of ['/curriculum', '/regions/cs', '/regions/ai', '/regions/design', '/regions/web', '/regions/sys']) {
  await page.goto(base + p, { waitUntil: 'networkidle' });
  for (const h of await page.evaluate(() => [...document.querySelectorAll('a[href^="/curriculum/"]')].map(a => new URL(a.href).pathname))) hrefs.add(h);
}
const lessons = [...hrefs].sort();
const depth = h => h.split('/').length - 2;
let ok = 0;
const bad = [];
for (let i = 0; i < lessons.length; i += 8) {
  await Promise.all(lessons.slice(i, i + 8).map(async h => {
    const r = await fetch(base + h, { redirect: 'manual' });
    const body = await r.text();
    writeFileSync(`${out}/${createHash('sha1').update(h).digest('hex').slice(0, 16)}.html`, body);
    if (r.status === 200 && /<h1/.test(body)) ok++; else bad.push(`${h} ${r.status}`);
  }));
}
console.log(JSON.stringify({ curriculumLinks: lessons.length, ok, bad, byDepth: lessons.reduce((m, h) => ({ ...m, [depth(h)]: (m[depth(h)] ?? 0) + 1 }), {}) }));
note(bad.length === 0, `curriculum links not 200: ${bad.join(', ')}`);

// The Linux terminal lab: commands are submitted with a real Enter key.
errors.length = 0;
await page.goto(base + '/learn/linux-terminal', { waitUntil: 'networkidle' });
const field = page.locator('#terminal-input');
const log = page.getByRole('log', { name: '終端機輸出' });
const run = async cmd => { await field.fill(cmd); await field.press('Enter'); await page.waitForTimeout(150); return (await log.innerText()).trim().split('\n').slice(-3).join(' ⏎ ').slice(0, 200); };
const pwd = await run('pwd');
const ls = await run('ls');
const made = await run('mkdir smoke-dir');
const after = await run('ls');
const tree = await page.locator('pre[aria-label^="家目錄的檔案樹"]').innerText();
console.log(JSON.stringify({ terminal: { pwd, ls, made, after, treeHasNewDir: tree.includes('smoke-dir'), errors: errors.slice(0, 4) } }));
note(/\/home\//.test(pwd), `terminal pwd printed: ${pwd}`);
note(after.includes('smoke-dir') && tree.includes('smoke-dir'), 'terminal mkdir did not show in ls and the tree');
note(!errors.length, `terminal errors: ${errors.join(' | ')}`);

await browser.close();
console.log(JSON.stringify({ fails }));
process.exit(fails.length ? 1 : 0);
