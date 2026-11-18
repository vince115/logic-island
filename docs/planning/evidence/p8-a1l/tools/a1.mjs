// A1-L: the world overview and the five region maps of one build at the seven reviewed widths. Per page and size:
// what the page drew (labels, pins, list, links, sideways overflow), the last frame's draw calls and triangles
// (perf/instrument.mjs, as in the earlier phases) and a screenshot stamped with viewport, build and commit.
// Then the interactions on one phone and one desktop size, the CS islands against the home page, and every link.
// usage: node a1.mjs <copy-root> <base-url> <out-dir> <build-name> <commit>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const [root, base, out, build, commit, part = 'all'] = process.argv.slice(2);
const require = createRequire(root + '/');
const { chromium } = require('@playwright/test');
const { instrument } = await import(root + '/perf/instrument.mjs');
mkdirSync(out + '/shots', { recursive: true });
const SIZES = [[320, 568], [375, 812], [390, 844], [834, 1112], [1024, 768], [1280, 800], [1440, 1000]];
const REGIONS = ['cs', 'ai', 'design', 'web', 'sys'];
const PAGES = ['/world', ...REGIONS.map(r => `/world/${r}`)];
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const bench = await (await browser.newContext()).newPage();
const lines = [];
const say = o => { lines.push(o); console.log(JSON.stringify(o)); };

/** The screenshot with a strip below it naming the viewport, the build and the commit; JPEG. */
const stamp = (png, text, quality = .72) => bench.evaluate(async ([b64, text, quality]) => {
  const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const strip = 22, c = new OffscreenCanvas(img.width, img.height + strip), g = c.getContext('2d');
  g.drawImage(img, 0, 0); g.fillStyle = '#10161d'; g.fillRect(0, img.height, img.width, strip);
  g.fillStyle = '#e8eef4'; g.font = `${img.width < 400 ? 9 : 12}px ui-monospace, Menlo, monospace`; g.textBaseline = 'middle'; g.fillText(text, 6, img.height + strip / 2);
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality });
  const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}, [png.toString('base64'), text, quality]);
const shoot = async (page, name, path, w, h) => {
  const jpg = await stamp(await page.screenshot(), `A1-L | ${build} | ${commit.slice(0, 7)} | ${path} | ${w}x${h} | headless Chromium`);
  writeFileSync(`${out}/shots/${name}.jpg`, Buffer.from(jpg, 'base64'));
};
/** No new frame for `quiet` ms. */
const settle = async (page, quiet = 800, limit = 25000) => {
  const t0 = Date.now(); let n = -1, since = Date.now();
  while (Date.now() - t0 < limit) {
    const now = await page.evaluate(() => window.__perfEntries.length);
    if (now !== n) { n = now; since = Date.now(); } else if (now > 0 && Date.now() - since >= quiet) return true;
    await page.waitForTimeout(100);
  }
  return false;
};
const lastFrame = page => page.evaluate(() => { const e = window.__perfEntries, b = e.at(-1), a = e.at(-2) ?? { main: 0, mainTriangles: 0, offscreen: 0, offscreenTriangles: 0 };
  return { frames: e.length, drawCalls: b.main - a.main, triangles: Math.round(b.mainTriangles - a.mainTriangles), offscreenCalls: b.offscreen - a.offscreen }; });
const overlap = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
const context = async (w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', ...(w < 768 ? { isMobile: true, hasTouch: true } : w < 1024 ? { hasTouch: true } : {}) });
  await ctx.addInitScript(instrument);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)));
  return { ctx, page, errors };
};

// 1. Every page at every size.
for (const [w, h] of part === 'all' ? SIZES : []) {
  const { ctx, page, errors } = await context(w, h);
  for (const path of PAGES) {
    errors.length = 0;
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.locator('canvas').waitFor({ state: 'visible', timeout: 30000 });
    const overview = path === '/world';
    await page.locator(overview ? 'button[data-target]' : 'button[aria-label^="聚焦"]').first().waitFor({ state: 'attached', timeout: 30000 });
    const settled = await settle(page);
    await page.waitForTimeout(400);
    const dom = await page.evaluate(overview => {
      const rect = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const common = { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, canvas: rect(document.querySelector('canvas')) };
      if (overview) {
        const wrap = document.querySelector('[data-links]');
        return { ...common, shape: wrap.dataset.shape, compact: wrap.dataset.compact, stage: rect(wrap), links: JSON.parse(wrap.dataset.links).map(l => l.id),
          labels: [...wrap.querySelectorAll('button[data-target]')].map(b => ({ id: b.dataset.target, visible: getComputedStyle(b).visibility !== 'hidden', touch: parseFloat(getComputedStyle(b, '::before').height) || 0, ...rect(b) })),
          guide: rect(document.querySelector('nav[aria-label="世界導覽"]')),
          guideWorld: [...document.querySelectorAll('nav[aria-label="世界導覽"] a[href^="/world/"]')].map(a => a.getAttribute('href')),
          guideText: document.querySelector('nav[aria-label="世界導覽"]').innerText.replace(/\s+/g, ' ').slice(0, 900) };
      }
      const list = document.querySelector('[aria-label="選擇學習島嶼"]');
      return { ...common, labels: [...document.querySelectorAll('button[aria-label^="聚焦"]')].map(b => ({ name: b.getAttribute('aria-label'), text: b.innerText.trim().length, touch: [parseFloat(getComputedStyle(b, '::before').width) || 0, parseFloat(getComputedStyle(b, '::before').height) || 0], ...rect(b) })),
        choices: [...document.querySelectorAll('[data-island-choice]')].map(e => e.dataset.islandChoice), listBox: rect(list?.closest('div[class*="sideNavigation"]')),
        more: [...document.querySelectorAll('nav[aria-label$="以外"] a')].map(a => a.getAttribute('href') + ' | ' + a.innerText.replace(/\s+/g, ' ')) };
    }, overview);
    const frame = await lastFrame(page);
    const L = dom.labels, c = overview ? dom.stage : dom.canvas, problems = [];
    for (const [i, a] of L.entries()) {
      if (!(a.x >= c.x - 1 && a.r <= c.r + 1 && a.y >= c.y - 1 && a.b <= c.b + 1)) problems.push(`${a.id ?? a.name} outside the map`);
      for (const b of L.slice(i + 1)) if (overlap(a, b)) problems.push(`${a.id ?? a.name} overlaps ${b.id ?? b.name}`);
    }
    const cover = overview ? (dom.shape === 'wide' ? dom.guide : null) : (w >= 768 ? dom.listBox : null);
    if (cover) for (const a of L) if (overlap(a, cover)) problems.push(`${a.id ?? a.name} under the ${overview ? 'guide' : 'list'}`);
    if (dom.overflow > 0) problems.push(`sideways overflow ${dom.overflow}`);
    if (!settled) problems.push('never settled');
    const name = `${path === '/world' ? 'overview' : 'region-' + path.split('/')[2]}-${w}`;
    await shoot(page, name, path, w, h);
    say({ kind: 'page', path, w, h, shot: name, ...frame, labels: L.length, labelsVisible: overview ? L.filter(l => l.visible).length : undefined, planned: overview ? undefined : L.filter(l => /規劃中/.test(l.name)).length,
      pins: overview ? undefined : L.filter(l => l.text === 0 || l.w <= 48).length, labelHeights: [...new Set(L.map(l => Math.round(l.h)))], touch: [...new Set(L.map(l => JSON.stringify(l.touch)))],
      listed: overview ? dom.guideWorld.length : dom.choices.length, links: dom.links, shape: dom.shape, compact: dom.compact, more: dom.more, guideText: w === 1440 ? dom.guideText : undefined, problems, errors: errors.slice(0, 3) });
  }
  await ctx.close();
}

// 2. Interactions: a list choice, the address, Back, Escape and the keyboard, on one phone and one desktop size.
for (const [w, h] of [[375, 812], [1440, 1000]]) {
  const { ctx, page, errors } = await context(w, h);
  await page.goto(base + '/world/cs', { waitUntil: 'networkidle' });
  await page.locator('button[aria-label^="聚焦"]').first().waitFor({ state: 'attached' });
  await settle(page);
  const steps = [];
  const state = async what => steps.push({ what, url: new URL(page.url()).pathname + new URL(page.url()).search, panel: await page.locator('[role="region"][aria-label$="教材入口"], section[aria-label$="教材入口"]').first().getAttribute('aria-label').catch(() => null),
    focus: await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.dataset?.islandChoice ?? document.activeElement?.tagName) });
  await page.locator('[data-island-choice="databases"]').click();
  await page.waitForURL(/island=databases/); await settle(page); await page.waitForTimeout(300); await state('choose 資料庫應用島 from the list');
  const sheet = await page.evaluate(() => { const p = document.querySelector('aside[class*="subjectsFloating"]'), c = document.querySelector('canvas').getBoundingClientRect(); if (!p) return null; const r = p.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), canvasTop: Math.round(c.top), canvasBottom: Math.round(c.bottom), shareOfMap: Math.max(0, Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top)) / c.height,
      lessonLinks: p.querySelectorAll('a[href^="/curriculum/"]').length }; });
  await shoot(page, `focus-cs-databases-${w}`, '/world/cs?island=databases', w, h);
  if (w < 768) { await page.getByRole('button', { name: '關閉科目清單' }).tap(); await page.waitForTimeout(500); await settle(page);
    steps.push({ what: 'close the subjects sheet', sheets: await page.locator('aside[class*="subjectsFloating"]').count() });
    await shoot(page, `focus-cs-databases-${w}-sheet-closed`, '/world/cs?island=databases (sheet closed)', w, h); }
  await page.goBack(); await page.waitForURL(u => !u.search.includes('island')); await settle(page); await state('Back');
  await page.goForward(); await page.waitForURL(/island=databases/); await settle(page); await state('Forward');
  await page.keyboard.press('Escape'); await page.waitForURL(u => !u.search.includes('island')); await page.waitForTimeout(700); await state('Escape');
  await page.goto(base + '/world/cs?island=nowhere', { waitUntil: 'networkidle' }); await settle(page); await state('unknown island id in the address');
  if (w >= 1024) {
    await page.goto(base + '/world/cs', { waitUntil: 'networkidle' }); await page.locator('button[aria-label^="聚焦"]').first().waitFor({ state: 'attached' }); await settle(page);
    await page.locator('button[aria-label^="聚焦資料結構島"]').focus(); await page.keyboard.press('Enter'); await page.waitForURL(/island=structures/); await settle(page); await state('keyboard: Enter on a label');
    await page.keyboard.press('Escape'); await page.waitForURL(u => !u.search.includes('island')); await page.waitForTimeout(800); await state('keyboard: Escape');
    await page.goto(base + '/world', { waitUntil: 'networkidle' }); await page.locator('button[data-target]').first().waitFor({ state: 'attached' }); await settle(page);
    await page.locator('button[data-target="ai"]').focus(); await page.keyboard.press('Enter'); await page.waitForURL('**/world/ai'); await state('overview: Enter on the AI label');
    await page.goBack(); await page.waitForURL('**/world'); await page.waitForTimeout(600); await state('Back to the overview');
  }
  say({ kind: 'interaction', w, h, sheet, steps, errors: errors.slice(0, 3) });
  await ctx.close();
}

// 3. Every island of every region, focused through the address: its panel's links; a planned island has no lesson link.
{
  const { ctx, page, errors } = await context(1440, 1000);
  const hrefs = new Set(), islands = [];
  for (const path of PAGES) {
    await page.goto(base + path, { waitUntil: 'networkidle' }); await page.locator('canvas').waitFor(); await settle(page);
    for (const h of await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')))) hrefs.add(h);
    if (path === '/world') continue;
    const ids = await page.evaluate(() => [...document.querySelectorAll('[data-island-choice]')].map(e => [e.dataset.islandChoice, e.innerText.replace(/\s+/g, ' ').trim().slice(0, 40)]));
    for (const [id, label] of ids) {
      await page.evaluate(id => history.pushState(null, '', `?island=${id}`), id);
      const panel = page.locator('[aria-label$="教材入口"]').first();
      await panel.waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(id => document.querySelector('[aria-label$="教材入口"]') && new URLSearchParams(location.search).get('island') === id, id);
      await page.waitForTimeout(150);
      const info = await page.evaluate(() => { const p = document.querySelector('[aria-label$="教材入口"]'), sheet = document.querySelector('aside[class*="subjectsFloating"]');
        return { name: p.getAttribute('aria-label'), sheet: sheet?.getAttribute('aria-label') ?? null, links: [...p.querySelectorAll('a[href]'), ...(sheet?.querySelectorAll('a[href]') ?? [])].map(a => a.getAttribute('href')), text: p.innerText.replace(/\s+/g, ' ').slice(0, 200) }; });
      info.links.forEach(h => hrefs.add(h));
      islands.push({ region: path.split('/')[2], id, label, panel: info.name, sheet: info.sheet, planned: /規劃中/.test(info.text + label), lessonLinks: info.links.filter(h => /^\/(curriculum|learn)\/./.test(h)).length, links: info.links.length,
        other: [...new Set(info.links.filter(h => !/^\/curriculum\/./.test(h)))] });
    }
  }
  const status = {};
  for (const h of [...hrefs].filter(h => h.startsWith('/')).sort()) { const r = await fetch(base + h.split('#')[0], { redirect: 'manual' }); status[h] = r.status;
    if (h.includes('#')) { const id = h.split('#')[1]; status[h] += (await r.text()).includes(`id="${id}"`) ? ' anchor' : ' NO-ANCHOR'; } }
  const bad = Object.entries(status).filter(([, s]) => !String(s).startsWith('200') || String(s).includes('NO-ANCHOR'));
  say({ kind: 'islands', count: islands.length, byRegion: Object.fromEntries(REGIONS.map(r => [r, islands.filter(i => i.region === r).length])), planned: islands.filter(i => i.planned).length,
    plannedWithLessonLinks: islands.filter(i => i.planned && i.lessonLinks).map(i => i.id), plannedWithSheet: islands.filter(i => i.planned && i.sheet).map(i => i.id), open: islands.filter(i => !i.planned).map(i => `${i.id}:${i.lessonLinks}`), plannedOther: [...new Set(islands.filter(i => i.planned).flatMap(i => i.other))].length });
  say({ kind: 'links', checked: Object.keys(status).length, bad, trials: Object.keys(status).filter(h => h.startsWith('/trials')), external: [...hrefs].filter(h => !h.startsWith('/')) , errors: errors.slice(0, 3) });
  writeFileSync(`${out}/islands.json`, JSON.stringify({ islands, status }, null, 1));

  // 4. V-06: the four CS subject islands on /world/cs against the same islands on the home page.
  const panelOf = async url => { await page.goto(base + url, { waitUntil: 'networkidle' }); const p = page.locator('[aria-label$="教材入口"]').first(); await p.waitFor({ state: 'visible', timeout: 20000 }); await page.waitForTimeout(300);
    await page.locator('aside[class*="subjectsFloating"]').waitFor({ state: 'visible', timeout: 20000 });
    return page.evaluate(() => { const p = document.querySelector('[aria-label$="教材入口"]'), sheet = document.querySelector('aside[class*="subjectsFloating"]'); for (const d of sheet.querySelectorAll('details')) d.open = true;
      return { name: p.getAttribute('aria-label'), links: [...sheet.querySelectorAll('a[href]'), ...p.querySelectorAll('a[href]')].map(a => a.getAttribute('href') + ' | ' + a.innerText.replace(/\s+/g, ' ').trim()), text: (sheet.innerText + ' ## ' + p.innerText).replace(/\s+/g, ' ').trim() }; }); };
  for (const id of ['foundations', 'structures', 'algorithms', 'databases']) {
    const home = await panelOf(`/?island=${id}`), world = await panelOf(`/world/cs?island=${id}`);
    say({ kind: 'cs-vs-home', id, name: home.name, sameName: home.name === world.name, sameLinks: home.links.join('\n') === world.links.join('\n'), sameText: home.text === world.text, links: home.links.length,
      onlyHome: home.links.filter(l => !world.links.includes(l)).slice(0, 4), onlyWorld: world.links.filter(l => !home.links.includes(l)).slice(0, 4) });
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/a1${part === 'all' ? '' : '-' + part}.jsonl`, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
