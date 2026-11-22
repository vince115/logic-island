import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

/*
 * P7: the shared store fails while visitors are online, in each of the ways it can, and comes back. For the local
 * rehearsal only (local-preview-stack.mjs), whose control address switches the store's behaviour:
 *
 *   ROOT=<repo with node_modules> BASE=http://127.0.0.1:3156 CONTROL=http://127.0.0.1:3159 node store-flap-check.mjs
 *
 * It checks, with two sessions and one real page online: that every instance stops answering from its last count
 * within the count's own lifetime and says only `unavailable` (never why); that a store which is unreachable, too
 * slow, refusing, or out of its plan's commands all look the same from outside and fail fast; that nothing is cached;
 * and that when the store is back the visitors are counted again without anyone reloading a page.
 * OUT=<file> also writes the report as JSON.
 */
const root = process.env.ROOT, base = (process.env.BASE ?? '').replace(/\/$/, ''), control = (process.env.CONTROL ?? '').replace(/\/$/, '');
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
if (!root || !local.test(base) || !local.test(control)) { console.error('usage: ROOT=<repo> BASE=http://127.0.0.1:<port> CONTROL=http://127.0.0.1:<port> node store-flap-check.mjs'); process.exit(2); }
const require = createRequire(`${root}/package.json`);
const { chromium, request: requests } = require('@playwright/test');
const API = '/api/presence', results = [];
const record = (id, status, detail) => { results.push({ id, status, detail }); console.log(`${status.padEnd(4)} ${id}${detail ? ` :: ${detail}` : ''}`); };
async function check(id, run) {
  try { const detail = await run(); record(id, 'PASS', typeof detail === 'string' ? detail : ''); }
  catch (error) { record(id, 'FAIL', String(error?.message ?? error).split('\n')[0]); }
}
const fail = message => { throw new Error(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const INSTANCES = Number(process.env.INSTANCES ?? 3);

const api = await requests.newContext({ baseURL: base });
const switchTo = async mode => { const response = await fetch(`${control}/mode/${mode}`); if (!response.ok) fail(`the control address refused ${mode}`); };
let buster = 0;
const get = async () => { const started = Date.now(), response = await api.get(`${API}?flap=${Date.now()}-${++buster}`); return { status: response.status(), text: await response.text(), headers: response.headers(), took: Date.now() - started }; };
const total = async () => { const answer = await get(); return answer.status === 200 ? JSON.parse(answer.text).total : `status ${answer.status}`; };
async function until(what, read, wanted, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const last = await read();
    if (JSON.stringify(last) === JSON.stringify(wanted)) return last;
    if (Date.now() > deadline) fail(`${what}: expected ${JSON.stringify(wanted)}, still ${JSON.stringify(last)} after ${Math.round(timeout / 1000)} s`);
    await sleep(1_500);
  }
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
async function session(tab) {
  const context = await requests.newContext({ baseURL: base, extraHTTPHeaders: { origin: base, 'sec-fetch-site': 'same-origin', 'user-agent': UA } });
  const post = async body => { const started = Date.now(), response = await context.post(API, { data: { v: 1, tab, ...body } }); return { status: response.status(), text: await response.text(), headers: response.headers(), took: Date.now() - started }; };
  const hello = await post({ since: Date.now(), place: { t: 'hub' } });
  await sleep((JSON.parse(hello.text).retryMs ?? 2_500) + 250);
  return { post, beat: () => post({ since: Date.now(), place: { t: 'island', id: 'foundations' } }) };
}
/** What a failing store must look like from outside, whatever is wrong with it. */
function unavailable(answer, what, slowest) {
  if (answer.status !== 503) fail(`${what}: status ${answer.status}`);
  if (answer.text !== '{"ok":false,"error":"unavailable"}') fail(`${what}: the answer says more than "unavailable": ${answer.text.slice(0, 120)}`);
  if (answer.headers['cache-control'] !== 'no-store') fail(`${what}: the failure may be cached (${answer.headers['cache-control']})`);
  if (!answer.headers['retry-after']) fail(`${what}: no Retry-After`);
  if (answer.took > slowest) fail(`${what}: took ${answer.took} ms`);
}

await switchTo('up');
const before = await total();
const one = await session('ffffffff00000001'), two = await session('ffffffff00000002');
const browser = await chromium.launch(), context = await browser.newContext({ baseURL: base }), page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error).split('\n')[0]));
/** The page's own reports, as they were answered. */
const reports = [];
page.on('response', response => { if (response.request().method() === 'POST' && new URL(response.url()).pathname === API) reports.push({ at: Date.now(), status: response.status() }); });

await check('online', async () => {
  if (typeof before !== 'number') fail(`the API answers ${before} before anything is switched`);
  for (const answer of [await one.beat(), await two.beat()]) if (answer.status !== 200 || !JSON.parse(answer.text).counted) fail(`a report answered ${answer.status} ${answer.text}`);
  await page.goto('/curriculum#island-structures');
  await until('two sessions and a page are counted', total, before + 3, 60_000);
  return 'two sessions and one page counted';
});

await check('down', async () => {
  await switchTo('down');
  const write = await one.beat();
  unavailable(write, 'a report while the store drops connections', 4_000);
  // An instance may answer from its last count for as long as a count lives (15 s), and no longer.
  const started = Date.now();
  await until('every instance says unavailable', async () => { const answers = []; for (let i = 0; i < INSTANCES; i += 1) answers.push((await get()).status); return answers; }, Array(INSTANCES).fill(503), 25_000);
  const everyInstance = Math.round((Date.now() - started) / 1000);
  for (let i = 0; i < INSTANCES; i += 1) unavailable(await get(), 'the count while the store drops connections', 4_000);
  // The failure lasts long enough for the open page's next report to meet it (a page reports once a minute).
  await until('the open page\'s report is refused', async () => reports.some(report => report.status === 503), true, 80_000);
  return `reports 503 at once (${write.took} ms); every instance's count 503 within ${everyInstance} s; the open page's own report refused too; nothing cacheable, nothing about the cause`;
});

for (const [mode, what, slowest] of [['slow', 'a store that takes 6 s', 5_000], ['refuse', 'a store that answers 500', 4_000], ['quota', 'a plan that has used up its commands', 4_000]]) {
  await check(mode, async () => {
    await switchTo(mode);
    const write = await two.beat();
    unavailable(write, `a report with ${what}`, slowest);
    const read = await get();
    unavailable(read, `the count with ${what}`, slowest);
    if (/limit|quota|usage|500000|upstash|redis|127\.0\.0\.1/i.test(write.text + read.text)) fail('the answer names the store or its error');
    return `${what}: 503 unavailable, report in ${write.took} ms, count in ${read.took} ms`;
  });
}

await check('pages', async () => {
  // The store is still failing: the site itself is untouched.
  const lesson = await context.newPage();
  lesson.on('pageerror', error => errors.push(String(error).split('\n')[0]));
  const response = await lesson.goto('/curriculum');
  if (response?.status() !== 200) fail(`/curriculum answered ${response?.status()}`);
  if (!(await lesson.locator('h1').first().isVisible())) fail('the curriculum page shows no heading');
  await lesson.close();
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  return 'a page loads and nothing throws while the store fails';
});

await check('recovery', async () => {
  await switchTo('up');
  const started = Date.now();
  for (const answer of [await one.beat(), await two.beat()]) if (answer.status !== 200 || !JSON.parse(answer.text).counted) fail(`a report after the store came back answered ${answer.status} ${answer.text}`);
  await until('the sessions are counted again', async () => { const now = await total(); return typeof now === 'number' && now >= before + 2; }, true, 45_000);
  const sessionsBack = Math.round((Date.now() - started) / 1000);
  // What the store held before it failed is still there, so the page is counted again at once if the failure was
  // shorter than the timeout. Its own next report is the proof that it carries on: nobody reloads it, and it was
  // told to wait a minute after each refusal.
  await until('the page that stayed open is counted', total, before + 3, 45_000);
  const refusedDuring = reports.filter(report => report.status === 503).length;
  await until('the page reports again by itself, and is answered', async () => reports.some(report => report.at > started && report.status === 200), true, 150_000);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  return `sessions counted again ${sessionsBack} s after the store came back; the open page (${refusedDuring} of its reports refused during the failure) reported again by itself ${Math.round((Date.now() - started) / 1000)} s after`;
});

await check('clean', async () => {
  await Promise.all([one.post({ leave: true, at: Date.now() }), two.post({ leave: true, at: Date.now() })]);
  await page.goto('about:blank');
  await until('nobody of this check is left', total, before, 60_000);
  return 'the population is back where it was';
});

await browser.close();
const failed = results.filter(result => result.status === 'FAIL').length;
const report = { base: new URL(base).host, checked: new Date().toISOString(), passed: results.length - failed, failed, results };
if (process.env.OUT) writeFileSync(process.env.OUT, `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
