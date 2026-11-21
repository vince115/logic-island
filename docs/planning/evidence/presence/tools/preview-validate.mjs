import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

/*
 * P6-E: checks a deployed build of the presence system from the outside, with real browsers: the API's surface, the
 * counting (tabs, visitors, regions, planned islands, privacy signals, goodbyes, the timeout), that the deployment's
 * instances share one store, and the figures on the home map. Made for a Vercel Preview deployment; it also runs
 * against a local `next start` (EXPECT_STORE=memory).
 *
 *   ROOT=<repo with node_modules> BASE=https://<preview-url> node preview-validate.mjs
 *
 *   EXPECT_STORE   shared (default) | memory   what the GET's x-presence-store header must say
 *   EXPECT_NPC     live (default) | mock | off  how the build was made (LOGIC_ISLAND_POPULATION_NPC)
 *   BYPASS         a Vercel "Protection Bypass for Automation" secret, when the deployment is behind Vercel
 *                  Authentication (sent as the x-vercel-protection-bypass header; never printed)
 *   SKIP_TTL=1     skip the check that a silent visitor is dropped (up to four minutes: the timeout and the answer's lag)
 *   OUT=<file>     also write the report as JSON
 *
 * It reads counts as differences from what it found when it started, and waits for each one (the population answer
 * may be 15 seconds old at the CDN and another 15 in a server instance), so a few other visitors do not break it;
 * run it when the deployment is otherwise quiet. It never runs against the production site: PRODUCTION_HOSTS
 * (comma-separated, default logic-island-psi.vercel.app) are refused.
 */
const root = process.env.ROOT, base = (process.env.BASE ?? '').replace(/\/$/, '');
if (!root || !/^https?:\/\//.test(base)) { console.error('usage: ROOT=<repo> BASE=<url> node preview-validate.mjs'); process.exit(2); }
const refused = (process.env.PRODUCTION_HOSTS ?? 'logic-island-psi.vercel.app').split(',').map(host => host.trim()).filter(Boolean);
if (refused.includes(new URL(base).host)) { console.error(`refused: ${new URL(base).host} is a production host; this check is for Preview deployments`); process.exit(2); }
const EXPECT_STORE = process.env.EXPECT_STORE ?? 'shared', EXPECT_NPC = process.env.EXPECT_NPC ?? 'live';
const bypass = process.env.BYPASS ? { 'x-vercel-protection-bypass': process.env.BYPASS } : {};
const require = createRequire(`${root}/package.json`);
const { chromium, request: requests } = require('@playwright/test');

const API = '/api/presence', LAG = 45_000;
const results = [];
const record = (id, status, detail) => { results.push({ id, status, detail }); console.log(`${status.padEnd(4)} ${id}${detail ? ` :: ${detail}` : ''}`); };
async function check(id, run) {
  try { const detail = await run(); record(id, 'PASS', typeof detail === 'string' ? detail : ''); }
  catch (error) { record(id, error?.skip ? 'SKIP' : 'FAIL', String(error?.message ?? error).split('\n')[0]); }
}
const fail = message => { throw new Error(message); };
const skip = message => { throw Object.assign(new Error(message), { skip: true }); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const api = await requests.newContext({ baseURL: base, extraHTTPHeaders: bypass });
let buster = 0;
/** The population, past the CDN's copy (a query of its own); a server instance may still answer from its last count. */
const population = async () => { const response = await api.get(`${API}?check=${Date.now()}-${++buster}`); if (!response.ok()) fail(`GET ${API} answered ${response.status()}`); return response.json(); };
async function until(what, read, wanted, timeout = LAG) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    last = await read();
    if (same(last, wanted)) return last;
    if (Date.now() > deadline) fail(`${what}: expected ${JSON.stringify(wanted)}, still ${JSON.stringify(last)} after ${Math.round(timeout / 1000)} s`);
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
}

const browser = await chromium.launch();
const visitor = async (options = {}) => { const context = await browser.newContext({ baseURL: base, extraHTTPHeaders: { ...bypass, ...(options.headers ?? {}) } }); return { context, page: await context.newPage() }; };
const goodbye = async context => { for (const page of context.pages()) await page.goto('about:blank').catch(() => {}); await context.close(); };

// ---- A. the API's surface -------------------------------------------------------------------------------------
let first;
await check('api.get', async () => {
  const response = await api.get(API);
  if (response.status() === 401 || /vercel\.com\/sso|Authentication Required/i.test(await response.text().catch(() => ''))) fail('the deployment is behind Vercel Authentication: pass BYPASS, or run where the browser is signed in');
  if (response.status() === 404) fail('404: the build has no presence API (LOGIC_ISLAND_PRESENCE=1 was not set for this deployment)');
  if (response.status() === 503) fail(`503 ${(await response.json().catch(() => ({}))).error ?? ''}: the secret or the shared store is not configured`);
  if (response.status() !== 200) fail(`status ${response.status()}`);
  first = await response.json();
  const keys = Object.keys(first).sort();
  if (!same(keys, ['at', 'commons', 'hub', 'islands', 'regions', 'total', 'ttlMs', 'v'])) fail(`keys ${keys}`);
  const headers = response.headers();
  if (headers['cache-control'] !== 'public, max-age=15, s-maxage=15' && !/max-age=15/.test(headers['cache-control'] ?? '')) fail(`cache-control ${headers['cache-control']}`);
  if (headers['set-cookie']) fail('the GET sets a cookie');
  if (headers['access-control-allow-origin']) fail('the GET allows other origins');
  if (headers['x-content-type-options'] !== 'nosniff') fail('no nosniff');
  return `total ${first.total}, cache-control "${headers['cache-control']}"`;
});
if (!first) { console.error('\nThe API does not answer; nothing else can be checked.'); await browser.close(); process.exit(1); }
await check('api.store', async () => {
  const kind = (await api.get(`${API}?check=store`)).headers()['x-presence-store'];
  if (kind !== EXPECT_STORE) fail(`x-presence-store is "${kind}", expected "${EXPECT_STORE}"${kind === 'memory' ? ' (no shared store is connected to this environment: every instance counts only its own visitors)' : ''}`);
  return kind;
});
await check('api.cdn', async () => {
  await api.get(API);
  const headers = (await api.get(API)).headers();
  if (!headers['x-vercel-cache']) skip('not behind the Vercel CDN');
  if (headers['x-vercel-cache'] !== 'HIT') fail(`x-vercel-cache ${headers['x-vercel-cache']} on a second GET within 15 s`);
  return `x-vercel-cache HIT, age ${headers.age ?? '?'}`;
});
await check('api.refusals', async () => {
  const beat = { v: 1, tab: 'aaaaaaaa00000001', since: Date.now(), place: { t: 'hub' } };
  const statuses = [(await api.post(API, { data: beat })).status(), (await api.post(API, { headers: { origin: 'https://example.com' }, data: beat })).status(),
    (await api.put(API, { data: beat })).status(), (await api.delete(API)).status(), (await api.get('/api')).status(), (await api.get(`${API}/sessions`)).status()];
  if (!same(statuses, [403, 403, 405, 405, 404, 404])) fail(`statuses ${statuses} (POST without Origin, POST from another origin, PUT, DELETE, /api, ${API}/sessions)`);
  return 'cross-origin 403, other methods 405, nothing else under /api';
});

// ---- B. counting ----------------------------------------------------------------------------------------------
const baseline = await population();
const delta = async () => {
  const now = await population(), islands = {};
  for (const id of new Set([...Object.keys(now.islands), ...Object.keys(baseline.islands)])) { const d = (now.islands[id] ?? 0) - (baseline.islands[id] ?? 0); if (d) islands[id] = d; }
  const commons = {};
  for (const id of Object.keys(now.commons ?? {})) { const d = now.commons[id] - (baseline.commons?.[id] ?? 0); if (d) commons[id] = d; }
  return { total: now.total - baseline.total, islands, commons };
};
const a = await visitor();
await check('count.visitor', async () => {
  await a.page.goto('/curriculum#island-foundations');
  await until('one visitor on the foundations island', delta, { total: 1, islands: { foundations: 1 }, commons: {} });
  const cookie = (await a.context.cookies()).find(c => c.name === 'li_presence');
  if (!cookie) fail('no li_presence cookie');
  if (cookie.path !== API || !cookie.httpOnly || cookie.sameSite !== 'Strict' || cookie.expires !== -1) fail(`cookie attributes ${JSON.stringify({ path: cookie.path, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, expires: cookie.expires })}`);
  if (base.startsWith('https://') && !cookie.secure) fail('the cookie is not Secure on https');
  if ((await a.page.evaluate(() => document.cookie)).includes('li_presence')) fail('a script can read the cookie');
  const text = JSON.stringify(await population());
  for (const part of cookie.value.split('.').slice(1)) if (text.includes(part)) fail('the population answer holds part of a session token');
  return 'counted once; session cookie HttpOnly, SameSite=Strict, path /api/presence';
});
await check('count.two-tabs', async () => {
  const second = await a.context.newPage();
  await second.goto('/curriculum#island-structures');
  await until('two tabs of one browser are one visitor, where the newer tab is', delta, { total: 1, islands: { structures: 1 }, commons: {} });
  await second.close();
  await a.page.bringToFront();
  // The second tab's goodbye took the session away (it was the tab in use). The first tab is still open and visible:
  // it hears that the other one left and reports again a moment later, without waiting for its next minute.
  // (Going there and back in the first tab adds nothing: the place is the same when the page looks again.)
  await a.page.evaluate(() => { location.hash = '#island-databases'; location.hash = '#island-foundations'; });
  await until('the visitor is back on the first tab\'s island', delta, { total: 1, islands: { foundations: 1 }, commons: {} });
  return 'one visitor, following the tab in use';
});
const b = await visitor();
await check('count.region', async () => {
  await b.page.goto('/regions/ai');
  await until('a second visitor on a region\'s own page', delta, { total: 2, islands: { foundations: 1 }, commons: { ai: 1 } });
  return 'a region\'s page counts in the region\'s commons, on no island';
});
await check('count.planned-island', async () => {
  await b.page.goto('/curriculum#island-machine-learning');
  // Give a wrong count the time to show: the answer must settle on "in the AI region, on no island".
  await new Promise(resolve => setTimeout(resolve, 8_000));
  const settled = await until('a planned island\'s visitor is in its region\'s commons', delta, { total: 2, islands: { foundations: 1 }, commons: { ai: 1 } });
  if ('machine-learning' in (await population()).islands) fail('a planned island has a count of its own');
  return `nobody is counted on a planned island (${JSON.stringify(settled)})`;
});
await check('count.privacy-signal', async () => {
  const quiet = await visitor({ headers: { 'Sec-GPC': '1' } });
  await quiet.context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { configurable: true, get: () => true }));
  await quiet.page.goto('/curriculum#island-algorithms');
  await quiet.page.waitForTimeout(8_000);
  const cookies = (await quiet.context.cookies()).map(c => c.name);
  await until('a browser that asks not to be tracked is not counted', delta, { total: 2, islands: { foundations: 1 }, commons: { ai: 1 } }, 20_000);
  await quiet.context.close();
  if (cookies.includes('li_presence')) fail('a browser with Global Privacy Control got the presence cookie');
  return 'not counted, no cookie';
});
await check('store.agreement', async () => {
  // Nothing has changed for a while now: every instance's count must be the same one.
  await new Promise(resolve => setTimeout(resolve, 20_000));
  const answers = await Promise.all(Array.from({ length: 24 }, () => population())), totals = [...new Set(answers.map(answer => `${answer.total}/${JSON.stringify(answer.islands)}`))];
  if (totals.length !== 1) fail(`24 simultaneous requests gave ${totals.length} different counts: ${totals.join(' | ')}`);
  return `24 simultaneous requests, one count (${totals[0]})`;
});

// ---- C. the figures on the home map ---------------------------------------------------------------------------
const watcher = await visitor();
const drawn = () => watcher.page.evaluate(() => document.querySelector('canvas')?.getAttribute('data-npc-foundations') ?? null);
await check('npc.source', async () => {
  await watcher.page.goto('/');
  if (EXPECT_NPC === 'off') {
    await watcher.page.waitForTimeout(8_000);
    if (await drawn() !== null) fail('the map draws figures in a build that should have none');
    return 'no figures';
  }
  await until('the home map has its figures\' layer', async () => (await drawn()) !== null, true, 60_000);
  const hook = await watcher.page.evaluate(() => '__logicIslandPopulation' in window);
  if (hook !== (EXPECT_NPC === 'mock')) fail(`the mock hook is ${hook ? 'present' : 'absent'} in a build expected to be "${EXPECT_NPC}"`);
  return `figures from ${EXPECT_NPC} data`;
});
await check('npc.live', async () => {
  if (EXPECT_NPC !== 'live') skip(`the build draws ${EXPECT_NPC} data`);
  // The watcher is a visitor too (at the hub); visitor A is still on the foundations island.
  await until('visitor A as one figure on the foundations island', drawn, '1', 75_000);
  return 'one visitor on the island, one figure on the map';
});

await check('count.goodbye', async () => {
  await goodbye(a.context);
  await until('visitor A is gone as soon as their page is', async () => (await delta()).islands.foundations ?? 0, 0);
  if (EXPECT_NPC === 'live') await until('and so is their figure', drawn, '0', 75_000);
  return 'a closed page is no longer counted (and its figure leaves the map)';
});
await goodbye(watcher.context);
await check('count.timeout', async () => {
  if (process.env.SKIP_TTL === '1') skip('SKIP_TTL=1');
  await until('visitor B is still counted', async () => (await delta()).commons.ai ?? 0, 1);
  // The network goes away with the tab open: no heartbeat, no goodbye.
  await b.context.setOffline(true);
  // The visitor's last report was at most one heartbeat ago; the timeout (the snapshot's own `ttlMs`) runs from it.
  const ttl = first?.ttlMs ?? 150_000;
  await new Promise(resolve => setTimeout(resolve, Math.min(50_000, ttl / 3)));
  if (((await delta()).commons.ai ?? 0) !== 1) fail(`a silent visitor was dropped inside the ${ttl / 1000}-second timeout`);
  await until('a silent visitor is dropped after the timeout', async () => (await delta()).commons.ai ?? 0, 0, ttl + LAG);
  return `kept for a while, then dropped within the timeout (${ttl / 1000} s) and the answer's lag`;
});
await b.context.close().catch(() => {});
await check('count.clean', async () => { await until('nobody of this check is left', async () => (await delta()).total, 0, (first?.ttlMs ?? 150_000) + LAG); return 'the population is back where it was'; });

await browser.close();
const failed = results.filter(result => result.status === 'FAIL').length;
const report = { base: new URL(base).host, checked: new Date().toISOString(), expect: { store: EXPECT_STORE, npc: EXPECT_NPC }, passed: results.filter(r => r.status === 'PASS').length, failed, skipped: results.filter(r => r.status === 'SKIP').length, results };
if (process.env.OUT) writeFileSync(process.env.OUT, `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.passed} passed, ${failed} failed, ${report.skipped} skipped`);
process.exit(failed ? 1 : 0);
