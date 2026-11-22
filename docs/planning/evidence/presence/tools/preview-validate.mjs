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
 *   SHARE          instead of BYPASS: the `_vercel_share` value of a share link of the deployment (never printed).
 *                  Every browser and every request context opens the link once and keeps the cookie it is given.
 *   SKIP_TTL=1     skip the check that a silent visitor is dropped (up to four minutes: the timeout and the answer's lag)
 *   EXPECT_FIREWALL=<n>  a Vercel Firewall rate limit rule on /api/presence allows n requests a window: send more
 *                  and expect some to be answered 429 (skipped when not set; it makes about n + 60 requests)
 *   HEARTBEAT_MS, TTL_MS, RATE_LIMIT   what the deployment is expected to use (defaults 60000, 150000, 40)
 *   ONLY=<regexp>  run only the checks whose name matches (api.get always runs), to repeat one after a failure
 *   HOLD_MS        how long a count is watched before "nothing changed" is believed (default 32000: longer than
 *                  the CDN's and an instance's copies of the answer together)
 *
 * Part D (P7) adds what a launch needs beyond the counting: requests repeated and in the wrong order, the session
 * rate limit, a Firewall rule when one is declared, and six visitors at once (two on phones) for two minutes.
 * A whole run takes about a quarter of an hour.
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
/** With a share link: `context` (a browser context's `request`, or a request context) is let in, and keeps the cookie. */
const admit = async context => { if (process.env.SHARE) await context.get(`/?_vercel_share=${encodeURIComponent(process.env.SHARE)}`); return context; };
const require = createRequire(`${root}/package.json`);
const { chromium, request: requests } = require('@playwright/test');

const API = '/api/presence', LAG = 45_000;
const results = [];
const record = (id, status, detail) => { results.push({ id, status, detail }); console.log(`${status.padEnd(4)} ${id}${detail ? ` :: ${detail}` : ''}`); };
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : undefined;
async function check(id, run) {
  if (only && id !== 'api.get' && !only.test(id)) return record(id, 'SKIP', 'not selected (ONLY)');
  try { const detail = await run(); record(id, 'PASS', typeof detail === 'string' ? detail : ''); }
  catch (error) { record(id, error?.skip ? 'SKIP' : 'FAIL', String(error?.message ?? error).split('\n')[0]); }
}
const fail = message => { throw new Error(message); };
const skip = message => { throw Object.assign(new Error(message), { skip: true }); };
/** The same value, whatever order an object's keys come in (the API lists islands in its own order). */
const sorted = value => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

const api = await admit(await requests.newContext({ baseURL: base, extraHTTPHeaders: bypass }));
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
const visitor = async (options = {}) => { const context = await browser.newContext({ baseURL: base, extraHTTPHeaders: { ...bypass, ...(options.headers ?? {}) } }); await admit(context.request); return { context, page: await context.newPage() }; };
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
/**
 * The population the checks count from. An instance may answer from a count up to 15 seconds old, so one answer is
 * not enough: the same count has to come back for longer than that (from whichever instances answer), or the checks
 * would start from a number that is about to change, as they did in the local rehearsal with three instances.
 */
async function settledPopulation() {
  const counted = answer => JSON.stringify(sorted({ total: answer.total, islands: answer.islands, commons: answer.commons }));
  let last = await population(), since = Date.now();
  for (const deadline = Date.now() + 240_000; Date.now() - since < 20_000;) {
    if (Date.now() > deadline) { console.error('\nThe population keeps changing: run this when the deployment is quiet.'); await browser.close(); process.exit(1); }
    await new Promise(resolve => setTimeout(resolve, 2_000));
    const now = await population();
    if (counted(now) !== counted(last)) since = Date.now();
    last = now;
  }
  return last;
}
const baseline = await settledPopulation();
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

// ---- D. P7: requests in the wrong order and repeated, the rate limit, a crowd on desktops and phones ----------
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** A wrong count must be given the time to show: longer than the answer may lag, then the count is read again. */
const holds = async (what, wanted, read = delta) => { await sleep(HOLD); return until(what, read, wanted); };
const HOLD = Number(process.env.HOLD_MS ?? 32_000);
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
/**
 * A visitor as the API sees one, without a page: the requests a tab would send, in whatever order the check wants.
 * The first report only fetches the cookie; the session exists once the cookie has come back after the warm-up.
 */
async function session(tab) {
  const context = await admit(await requests.newContext({ baseURL: base, extraHTTPHeaders: { ...bypass, origin: new URL(base).origin, 'sec-fetch-site': 'same-origin', 'user-agent': BROWSER_UA } }));
  const post = async body => { const response = await context.post(API, { data: { v: 1, tab, ...body } }); return { status: response.status(), body: await response.json().catch(() => ({})), headers: response.headers() }; };
  const hello = await post({ since: Date.now(), place: { t: 'hub' } });
  if (hello.status !== 200 || !hello.headers['set-cookie']) fail(`the first report answered ${hello.status} and ${hello.headers['set-cookie'] ? 'a' : 'no'} cookie`);
  await sleep((hello.body.retryMs ?? 2_500) + 250);
  return { post, close: () => context.dispose() };
}
const island = id => ({ t: 'island', id });

await check('timing.reported', async () => {
  const probe = await session('dddddddd00000001');
  const answer = await probe.post({ since: Date.now(), place: { t: 'hub' } });
  await probe.post({ leave: true, at: Date.now() });
  await probe.close();
  const heartbeat = Number(process.env.HEARTBEAT_MS ?? 60_000), ttl = Number(process.env.TTL_MS ?? 150_000);
  if (answer.status !== 200 || answer.body.counted !== true) fail(`a session's report answered ${answer.status} ${JSON.stringify(answer.body)}`);
  if (answer.body.next !== heartbeat) fail(`the next report is asked for in ${answer.body.next} ms, expected ${heartbeat}`);
  if (first.ttlMs !== ttl) fail(`the timeout is ${first.ttlMs} ms, expected ${ttl}`);
  return `a report every ${heartbeat / 1000} s, a silent visitor dropped after ${ttl / 1000} s`;
});

await check('order.repeated-and-late', async () => {
  const tab = 'bbbbbbbb00000001', visitorO = await session(tab), started = Date.now();
  const counted = await visitorO.post({ since: started, place: island('structures') });
  if (counted.status !== 200 || counted.body.counted !== true) fail(`the report answered ${counted.status} ${JSON.stringify(counted.body)}`);
  await until('the session is on its island', delta, { total: 1, islands: { structures: 1 }, commons: {} });
  // The same report four more times at once (a retry, a proxy repeating a request): still one visitor.
  const repeats = await Promise.all(Array.from({ length: 4 }, () => visitorO.post({ since: started, place: island('structures') })));
  // An older report of the same tab, overtaken on the way: it must not move the visitor back.
  const late = await visitorO.post({ since: started - 30_000, place: island('databases') });
  // A goodbye from before the tab's latest report (the tab went to the background and came back): it must not remove the visitor.
  const stale = await visitorO.post({ leave: true, at: started - 10_000 });
  const statuses = [...repeats, late, stale].map(answer => answer.status);
  if (statuses.some(status => status !== 200)) fail(`statuses ${statuses}`);
  await holds('repeated, overtaken and stale requests change nothing', { total: 1, islands: { structures: 1 }, commons: {} });
  // The goodbye, twice, and after it a report the tab sent before leaving: the visitor stays gone.
  const left = Date.now();
  await visitorO.post({ leave: true, at: left });
  await Promise.all([visitorO.post({ leave: true, at: left }), visitorO.post({ since: started, place: island('structures') })]);
  await holds('a report from before the goodbye does not bring the visitor back', { total: 0, islands: {}, commons: {} });
  // A report from after the goodbye is the tab coming back.
  await visitorO.post({ since: Date.now(), place: island('databases') });
  await until('a newer report brings the visitor back, where it says', delta, { total: 1, islands: { databases: 1 }, commons: {} });
  await visitorO.post({ leave: true, at: Date.now() });
  await until('and the goodbye takes them away again', delta, { total: 0, islands: {}, commons: {} });
  await visitorO.close();
  return 'four repeats, an overtaken report, a stale goodbye, a report after the goodbye: one visitor, in the right place, gone when they left';
});

await check('rate.session', async () => {
  const limit = Number(process.env.RATE_LIMIT ?? 40), noisy = await session('cccccccc00000001'), since = Date.now();
  const answers = [];
  for (let i = 0; i < limit + 10; i += 1) answers.push(await noisy.post({ since, place: island('algorithms') }));
  const accepted = answers.filter(answer => answer.status === 200 && answer.body.counted === true).length;
  const refused = answers.filter(answer => answer.status === 429);
  if (accepted !== limit || refused.length !== 10) fail(`${accepted} reports accepted and ${refused.length} refused of ${answers.length} (statuses ${[...new Set(answers.map(answer => answer.status))]}), expected ${limit} and 10`);
  if (refused.some(answer => answer.body.error !== 'rate-limited' || !answer.headers['retry-after'])) fail('a refusal without "rate-limited" or without Retry-After');
  if (answers.findIndex(answer => answer.status === 429) !== limit) fail('a report was refused before the limit');
  // Another visitor is not held back by this one, and the noisy one is still one visitor where it was.
  const calm = await session('eeeeeeee00000001'), other = await calm.post({ since: Date.now(), place: island('foundations') });
  if (other.status !== 200 || other.body.counted !== true) fail(`another session's report answered ${other.status}`);
  await until('the refused reports changed nothing', delta, { total: 2, islands: { algorithms: 1, foundations: 1 }, commons: {} });
  // A goodbye is a write too: the session that used up its minute cannot say it until the minute is over. The
  // other one leaves at once.
  await Promise.all([noisy.post({ leave: true, at: Date.now() }), calm.post({ leave: true, at: Date.now() })]);
  await holds('a goodbye over the limit is refused like any other write', { total: 1, islands: { algorithms: 1 }, commons: {} });
  const wait = Math.max(0, Number(refused[0].headers['retry-after']) * 1000 - (Date.now() - since)) + 2_000;
  await sleep(wait);
  await noisy.post({ leave: true, at: Date.now() });
  await until('once its minute is over the session can leave', delta, { total: 0, islands: {}, commons: {} });
  await noisy.close(); await calm.close();
  return `${limit} reports a minute accepted, the next 10 answered 429 with Retry-After; another session unaffected; the limited session's goodbye waits for its minute to end`;
});

await check('rate.platform', async () => {
  // A Vercel Firewall rate limit rule on the API's path, when one is declared: EXPECT_FIREWALL=<requests it allows per window>.
  const allowed = Number(process.env.EXPECT_FIREWALL ?? 0);
  if (!allowed) skip('no Firewall rule declared (EXPECT_FIREWALL)');
  const statuses = [];
  for (let sent = 0; sent < allowed + 60; sent += 20) statuses.push(...await Promise.all(Array.from({ length: 20 }, async () => (await api.get(`${API}?burst=${Date.now()}-${++buster}`)).status())));
  const limited = statuses.filter(status => status === 429).length, other = statuses.filter(status => status !== 200 && status !== 429);
  if (other.length) fail(`unexpected statuses ${[...new Set(other)]}`);
  if (!limited) fail(`${statuses.length} requests in a burst and none was limited`);
  return `${statuses.length} requests: ${statuses.length - limited} answered, ${limited} limited (429)`;
});

await check('count.crowd', async () => {
  // Six visitors at once, two of them on phones, on four islands, a region page and the hub.
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
  const open = async (path, options = {}) => { const context = await browser.newContext({ baseURL: base, extraHTTPHeaders: bypass, ...options }); await admit(context.request); const page = await context.newPage(); return { context, page, path }; };
  const crowd = [await open('/curriculum#island-foundations'), await open('/curriculum#island-structures'), await open('/curriculum#island-algorithms'), await open('/regions/ai'),
    await open('/curriculum#island-foundations', phone), await open('/', phone)];
  const reports = [];
  crowd[1].page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === API) reports.push(Date.now()); });
  const errors = [];
  for (const member of crowd) member.page.on('pageerror', error => errors.push(String(error).split('\n')[0]));
  let figures = 'figures not checked', gaps = [];
  try {
  await Promise.all(crowd.map(member => member.page.goto(member.path)));
  const everyone = { total: 6, islands: { foundations: 2, structures: 1, algorithms: 1 }, commons: { ai: 1, hub: 1 } };
  await until('six visitors, each counted once where they are', delta, everyone, 60_000);
  if (EXPECT_NPC === 'live') {
    const onPhone = () => crowd[5].page.evaluate(() => document.querySelector('canvas')?.getAttribute('data-npc-foundations') ?? null);
    await until('the phone\'s map draws the two visitors of the foundations island', onPhone, '2', 75_000);
    figures = 'the phone\'s map draws two figures on the foundations island';
  }
  // Nobody moves for two minutes: everyone stays counted, and a page reports once a minute.
  const heartbeat = Number(process.env.HEARTBEAT_MS ?? 60_000), watched = Date.now();
  for (let waited = 0; waited < 2 * heartbeat + 10_000; waited += 15_000) {
    await sleep(15_000);
    const now = await delta();
    if (!same(now, everyone)) fail(`after ${Math.round((Date.now() - watched) / 1000)} s the count is ${JSON.stringify(now)}`);
  }
  const later = reports.filter(at => at > watched - 5_000);
  gaps = later.slice(1).map((at, index) => at - later[index]);
  if (later.length < 2 || gaps.some(gap => Math.abs(gap - heartbeat) > 8_000)) fail(`a page that stays reported at gaps of ${gaps.map(gap => Math.round(gap / 1000))} s (${later.length} reports in ${Math.round((Date.now() - watched) / 1000)} s), expected one every ${heartbeat / 1000} s`);
  // The phone on the island goes to another one.
  await crowd[4].page.evaluate(() => { location.hash = '#island-databases'; });
  await until('a visitor who goes to another island is counted there', delta, { total: 6, islands: { foundations: 1, structures: 1, algorithms: 1, databases: 1 }, commons: { ai: 1, hub: 1 } });
  } finally {
    // Also when a step above failed: visitors left behind would be counted for another timeout, in the next run too.
    for (const member of crowd) await goodbye(member.context);
  }
  await until('everyone is gone when their pages are', delta, { total: 0, islands: {}, commons: {} });
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  return `six visitors (two phones) counted once each for two minutes, reports ${gaps.map(gap => Math.round(gap / 1000)).join(' and ')} s apart; ${figures}; one moved island; all gone at the end`;
});

await browser.close();
const failed = results.filter(result => result.status === 'FAIL').length;
const report = { base: new URL(base).host, checked: new Date().toISOString(), expect: { store: EXPECT_STORE, npc: EXPECT_NPC }, passed: results.filter(r => r.status === 'PASS').length, failed, skipped: results.filter(r => r.status === 'SKIP').length, results };
if (process.env.OUT) writeFileSync(process.env.OUT, `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.passed} passed, ${failed} failed, ${report.skipped} skipped`);
process.exit(failed ? 1 : 0);
