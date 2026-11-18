// A1-P preflight: is the server behind <base> the release combination (world on, trials off, review tools off), and is
// it really the deployment, not Vercel's login page? Run it first; the other tools mean nothing if this fails.
// usage: node preview-check.mjs <copy-root> <base> [expected-commit]
//   <copy-root>: a checkout of the same commit with node_modules and, for the static comparison, a local world-only
//   build in .next (optional: without it the comparison is reported as not done).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const [root, base, commit = ''] = process.argv.slice(2);
const require = createRequire(path.resolve(root) + '/');
const { chromium } = require('@playwright/test');
const results = [], check = (id, ok, detail) => { results.push({ id, result: ok === null ? 'NOT TESTED' : ok ? 'PASS' : 'FAIL', detail }); };
const get = p => fetch(base + p, { redirect: 'manual' });
const REGIONS = ['cs', 'ai', 'design', 'web', 'sys'];
/** How many responses were Vercel's login page, when <base> is the Preview door (null otherwise). */
const door = async () => { try { const s = await (await fetch(base + '/__proxy/status')).json(); return s.target ? s : null; } catch { return null; } };
const finish = () => {
  const failed = results.filter(r => r.result === 'FAIL');
  console.log(JSON.stringify({ base, commit, checked: new Date().toISOString(), verdict: failed.length ? 'FAIL' : 'PASS', results }, null, 1));
  process.exit(failed.length ? 1 : 0);
};

// 1. Routes.
const home = await get('/'), homeText = await home.text();
const reached = home.status === 200 && /Logic Island/.test(homeText) && !/vercel\.com\/sso|Authentication Required/i.test(homeText);
check('app', reached, `/ answered ${home.status}${/vercel\.com/.test(home.headers.get('location') ?? '') ? ', a redirect to the Vercel login: the access credential is missing or was not accepted' : ''}`);
// Not the app: nothing below would mean anything.
if (!reached) { const s = await door(); if (s) check('no-login-pages', false, { access: s.access, requests: s.requests, loginPages: s.loginPages, errors: s.errors }); finish(); }
const want = { '/world': 200, ...Object.fromEntries(REGIONS.map(r => [`/world/${r}`, 200])), '/world/nowhere': 404, '/trials': 404, '/trials/review': 404, '/trials/ipas-aiap-basic': 404, '/trials/ccar-f': 404 };
const got = {}; for (const p of Object.keys(want)) got[p] = (await get(p)).status;
check('routes', Object.keys(want).every(p => got[p] === want[p]), got);

// 2. What the server decided at build time, as it is written in the prerendered pages.
const world = await (await get('/world')).text(), cs = await (await get('/world/cs')).text();
const reviewProp = html => [...html.matchAll(/review\\?":(true|false)/g)].map(m => m[1]);
check('review-prop', [world, cs].every(h => reviewProp(h).length > 0 && reviewProp(h).every(v => v === 'false')), { world: reviewProp(world), cs: reviewProp(cs) });
check('no-trial-links', ![homeText, world, cs].some(h => /href="\/trials/.test(h)), 'href="/trials" in /, /world, /world/cs');
check('noindex', /noindex/.test(world) ? true : null, 'the world pages still carry robots noindex (to be decided before A4)');

// 3. The same client code as a local build of the same commit (informational: another machine may hash differently).
const scripts = [...new Set([homeText, world, cs].flatMap(h => [...h.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map(m => m[1])))];
if (existsSync(path.join(root, '.next/static'))) {
  let same = 0; const differ = [];
  for (const src of scripts) {
    const file = path.join(root, '.next', decodeURIComponent(src.replace('/_next/', '').split('?')[0]));
    const remote = createHash('sha1').update(Buffer.from(await (await fetch(base + src)).arrayBuffer())).digest('hex');
    if (existsSync(file) && createHash('sha1').update(readFileSync(file)).digest('hex') === remote) same++; else differ.push(src);
  }
  check('static-identity', differ.length === 0 ? true : null, { scripts: scripts.length, identical: same, differ: differ.slice(0, 5) });
} else check('static-identity', null, 'no local .next to compare with');

// 4. The review parameters do nothing (P1-37), in a real browser.
try {
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })).newPage();
const links = async q => { await page.goto(base + '/world' + q, { waitUntil: 'networkidle' }); await page.locator('[data-links]').waitFor({ timeout: 30000 }); return page.evaluate(() => JSON.parse(document.querySelector('[data-links]').dataset.links).map(l => l.id)); };
const plain = await links(''), without = await links('?without=sys-cs,cs-ai,hub-cs');
check('without-ignored', plain.length > 0 && JSON.stringify(plain) === JSON.stringify(without), { plain: plain.length, withParameter: without.length });
await page.goto(base + '/world/cs?stress=glb', { waitUntil: 'networkidle' }); await page.locator('canvas').waitFor({ timeout: 30000 });
check('stress-ignored', await page.locator('[aria-label*="效能測試替身"]').count() === 0 && !(await page.content()).includes('效能測試替身'), 'no「效能測試替身」on /world/cs?stress=glb');
await browser.close();
} catch (error) { check('browser', false, String(error.message ?? error).split('\n')[0]); }

// 5. Nothing above was Vercel's login page (only known when <base> is the Preview door).
{ const s = await door(); if (s) check('no-login-pages', s.loginPages === 0 && s.errors === 0, { access: s.access, requests: s.requests, loginPages: s.loginPages, errors: s.errors }); }
finish();
