import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

/*
 * P7: what a visitor sees when the presence system's shared store is down. Run it against a local `next start` of a
 * build with the presence API and live figures, started with a store address nothing answers at:
 *
 *   LOGIC_ISLAND_PRESENCE=1 LOGIC_ISLAND_POPULATION_NPC=live next build
 *   KV_REST_API_URL=https://127.0.0.1:9 KV_REST_API_TOKEN=unused LOGIC_ISLAND_PRESENCE=1 LOGIC_ISLAND_POPULATION_NPC=live next start --port <port>
 *   ROOT=<repo with node_modules> BASE=http://127.0.0.1:<port> node store-outage-check.mjs
 *
 * It checks that the API fails fast and says only `unavailable`, and that everything else is as it is without the
 * presence system: the home map draws (with no visitor figures), an island can be focused, a lesson's animation
 * plays, the curriculum and a region page render, and no page throws. OUT=<file> also writes the report as JSON.
 * Local addresses only: it is not a check to run against a deployment.
 */
const root = process.env.ROOT, base = (process.env.BASE ?? '').replace(/\/$/, '');
if (!root || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) { console.error('usage: ROOT=<repo> BASE=http://127.0.0.1:<port> node store-outage-check.mjs'); process.exit(2); }
const require = createRequire(`${root}/package.json`);
const { chromium, request: requests } = require('@playwright/test');
const API = '/api/presence', results = [];
const record = (id, status, detail) => { results.push({ id, status, detail }); console.log(`${status.padEnd(4)} ${id}${detail ? ` :: ${detail}` : ''}`); };
async function check(id, run) {
  try { const detail = await run(); record(id, 'PASS', typeof detail === 'string' ? detail : ''); }
  catch (error) { record(id, 'FAIL', String(error?.message ?? error).split('\n')[0]); }
}
const fail = message => { throw new Error(message); };

const api = await requests.newContext({ baseURL: base });
await check('api.get', async () => {
  const started = Date.now(), response = await api.get(API), took = Date.now() - started, text = await response.text();
  if (response.status() !== 503 || JSON.parse(text).error !== 'unavailable') fail(`expected 503 unavailable, got ${response.status()} ${text.slice(0, 80)}`);
  if (response.headers()['cache-control'] !== 'no-store') fail(`the failure is cacheable: ${response.headers()['cache-control']}`);
  if (/127\.0\.0\.1:9|unused|ECONN/i.test(text)) fail('the answer names the store');
  if (took > 5_000) fail(`took ${took} ms`);
  return `503 unavailable, no-store, in ${took} ms`;
});
await check('api.post', async () => {
  const headers = { origin: base, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 Chrome/140' };
  const body = () => JSON.stringify({ v: 1, tab: 'aaaaaaaa00000001', since: Date.now(), place: { t: 'hub' } });
  // The cookie is issued without the store; the report that follows needs it.
  const hello = await api.post(API, { headers, data: body() });
  if (hello.status() !== 200) fail(`first contact answered ${hello.status()}`);
  await new Promise(resolve => setTimeout(resolve, 3_000));
  const started = Date.now(), response = await api.post(API, { headers, data: body() }), took = Date.now() - started, text = await response.text();
  if (response.status() !== 503 || JSON.parse(text).error !== 'unavailable') fail(`expected 503 unavailable, got ${response.status()} ${text.slice(0, 80)}`);
  if (took > 5_000) fail(`took ${took} ms`);
  return `503 unavailable in ${took} ms, retry-after ${response.headers()['retry-after']} s`;
});

const browser = await chromium.launch();
for (const [name, options] of Object.entries({ desktop: { viewport: { width: 1440, height: 1000 } }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } })) {
  const context = await browser.newContext({ baseURL: base, reducedMotion: 'reduce', ...options }), page = await context.newPage();
  const thrown = [], failedApi = [];
  page.on('pageerror', error => thrown.push(String(error.message).split('\n')[0]));
  page.on('response', response => { if (new URL(response.url()).pathname === API) failedApi.push(response.status()); });
  await check(`${name}.home-map`, async () => {
    await page.goto('/');
    await page.getByRole('button', { name: '聚焦基礎程式島', exact: true }).waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('canvas')?.hasAttribute('data-npc-foundations'), null, { timeout: 30_000 });
    // Long enough for a report and two counts to have failed.
    await page.waitForTimeout(18_000);
    const state = await page.evaluate(() => { const canvas = document.querySelector('canvas'); return { figures: canvas.getAttribute('data-npc-foundations'), width: canvas.width, height: canvas.height }; });
    if (state.figures !== '0') fail(`figures on an island with the store down: ${state.figures}`);
    if (!(state.width > 100 && state.height > 100)) fail('the map has no canvas to speak of');
    if (!failedApi.includes(503)) fail(`the page never met the failing API (${failedApi.join(',')})`);
    await page.getByRole('button', { name: '聚焦基礎程式島', exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('island') === 'foundations', null, { timeout: 10_000 });
    return `map drawn ${state.width}x${state.height}, no visitor figures, island focus works; API answered ${[...new Set(failedApi)].join(',')}`;
  });
  await check(`${name}.lesson`, async () => {
    const response = await page.goto('/learn/array');
    if (response.status() !== 200) fail(`/learn/array answered ${response.status()}`);
    const next = page.getByRole('button', { name: '下一步', exact: true });
    await next.waitFor({ timeout: 15_000 });
    await next.click();
    await page.locator('.step-count').filter({ hasText: /^2 \// }).waitFor({ timeout: 5_000 });
    return 'a lesson page renders and its player steps';
  });
  await check(`${name}.pages`, async () => {
    const seen = [];
    for (const path of ['/curriculum', '/curriculum/programs-and-algorithms', '/regions/cs', '/learn/bfs']) {
      const response = await page.goto(path);
      if (response.status() !== 200) fail(`${path} answered ${response.status()}`);
      if ((await page.locator('h1').first().innerText()).trim() === '') fail(`${path} has no heading`);
      seen.push(path);
    }
    return seen.join(' ');
  });
  await check(`${name}.no-errors`, async () => { if (thrown.length) fail(`page errors: ${thrown.slice(0, 3).join(' | ')}`); return 'no page threw'; });
  await context.close();
}
await browser.close();
const failed = results.filter(result => result.status === 'FAIL').length;
const report = { checked: new Date().toISOString(), passed: results.length - failed, failed, results };
if (process.env.OUT) writeFileSync(process.env.OUT, `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
