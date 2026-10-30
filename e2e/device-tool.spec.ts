import { spawn, type ChildProcess } from 'node:child_process';
import { test as base, expect, type Page } from '@playwright/test';
import { expectListFallback } from './fallbacks';

/**
 * D.3-4 preparation: the real-device tool (perf/device/server.mjs) works end to end here, in emulated Chromium, before
 * it goes to a phone. These are checks of the tool, not device results: on SwiftShader it must call its own numbers
 * unreliable.
 */
type Tool = { url: string; process: ChildProcess };
const test = base.extend<{ errors: string[] }, { tool: Tool }>({
  tool: [async ({}, use, workerInfo) => {
    const upstream = String(workerInfo.project.use.baseURL);
    const child = spawn(process.execPath, ['perf/device/server.mjs', '--upstream', upstream, '--port', '0', '--host', '127.0.0.1',
      '--out', `${workerInfo.project.outputDir}/device-tool-${workerInfo.workerIndex}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    const port = await new Promise<string>((resolve, reject) => {
      child.stdout!.on('data', (chunk: Buffer) => { const ready = /PROBE_READY port=(\d+)/.exec(String(chunk)); if (ready) resolve(ready[1]); });
      child.on('exit', code => reject(new Error(`device server exited (${code})`)));
    });
    await use({ url: `http://127.0.0.1:${port}`, process: child });
    child.kill();
  }, { scope: 'worker' }],
  // Hydration problems from the injected script would show up as console errors.
  errors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use(errors);
  }, { scope: 'test' }],
});
const ROUTES = ['/islands/candidate', '/islands/legacy'];
const phone = () => test.info().project.name.startsWith('mobile');
const label = (page: Page) => page.getByRole('button', { name: '聚焦基礎程式島', exact: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const results = async (page: Page, tool: Tool): Promise<any[]> => (await page.request.get(`${tool.url}/__probe/report.json`)).json();

test('沒有開啟量測時，頁面原樣經過量測 proxy', async ({ page, tool }) => {
  for (const route of ROUTES) {
    const direct = await (await page.request.get(route)).text();
    const proxied = await page.request.get(`${tool.url}${route}`);
    expect(await proxied.text(), route).toBe(direct);
  }
});

test('區網暴露：只轉址到本機路徑、錯誤不回傳堆疊、拒絕過大的請求', async ({ page, tool }) => {
  for (const to of ['//example.com/', '/\\example.com/', 'https://example.com/']) {
    const answer = await page.request.get(`${tool.url}/__probe/mode?set=off&to=${encodeURIComponent(to)}`, { maxRedirects: 0 });
    expect(answer.status(), to).toBe(303);
    expect(answer.headers().location, to).toBe('/__probe/');
  }
  // A Buffer is sent as is (a string would be JSON-encoded by Playwright).
  const broken = await page.request.post(`${tool.url}/__probe/pinch`, { data: Buffer.from('not json'), headers: { 'content-type': 'application/json' } });
  expect(broken.status()).toBe(500);
  expect(await broken.text()).not.toMatch(/server\.mjs|\n\s+at /);
  // Valid JSON of the wrong shape is refused before it reaches the disk, so the report keeps working.
  const odd = await page.request.post(`${tool.url}/__probe/pinch`, { data: { route: '/islands/candidate' } });
  expect(odd.status()).toBe(400);
  expect((await page.request.get(`${tool.url}/__probe/report`)).status()).toBe(200);
  const huge = await page.request.post(`${tool.url}/__probe/checklist`, { data: 'x'.repeat(17 * 1024 * 1024) }).catch(() => null);
  if (huge) expect(huge.status()).toBe(500);
});

test.describe('自動量測', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('一輪候選頁與舊版：數字與桌面量測一致，軟體算圖標為不可靠', async ({ page, tool, errors }) => {
    test.setTimeout(300_000);
    await page.goto(`${tool.url}/__probe/`);
    await page.getByLabel('裝置型號').fill('self-test');
    await page.getByLabel('已確認低耗電／省電模式關閉').check();
    // One round instead of three, to keep the self-test short (and it must then say "too few rounds").
    await page.locator('input[name=rounds]').evaluate(input => { (input as HTMLInputElement).value = '1'; });
    await page.getByRole('button', { name: '開始自動量測' }).click();
    await page.waitForURL(/\/__probe\/report/, { timeout: 240_000 });
    const run = (await results(page, tool)).find(item => item.kind === 'run' && item.device.model === 'self-test');
    expect(run.state).toBe('done');
    expect(run.steps.map((s: { route: string }) => s.route)).toEqual([...ROUTES, ...ROUTES]);
    for (const step of run.steps) expect(step.raw.error, step.route).toBeUndefined();
    const { candidate, legacy } = run.result;
    // The same frame costs as perf/world.perf.ts measures (D.3-3 preflight §5).
    expect([candidate.overviewDraws, candidate.shadowDraws]).toEqual([43, 0]);
    expect([legacy.overviewDraws, legacy.shadowDraws]).toEqual([146, 112]);
    for (const route of [candidate, legacy]) {
      expect(route.rounds).toBe(1);
      expect(route.flightFps).toBeGreaterThan(0);
      expect(route.firstFrameMs).toBeGreaterThan(0);
      expect(route.glbReadyMs).toBeGreaterThan(0);
      expect(route.idleFrames).toBe(0);
      expect(route.flags).toEqual(expect.arrayContaining(['software', 'few-rounds']));
    }
    for (const check of run.result.checks) expect(check.verdict, check.id).toBe('unreliable');
    await expect(page.getByRole('heading', { name: /自動量測/ })).toBeVisible();
    await expect(page.getByText('不可靠，不判定').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

for (const route of ROUTES) test.describe(route, () => {
  test('故障注入：WebGL 無法建立、context 遺失都改為清單；GLB 失敗回到暫代建築', async ({ page, tool }) => {
    await page.goto(`${tool.url}/__probe/mode?set=webgl-fail&to=${route}`);
    await expectListFallback(page);
    await expect(page.getByText('量測工具故障注入：webgl-fail')).toBeVisible();
    await page.goto(`${tool.url}/__probe/mode?set=context-loss&to=${route}`);
    await expectListFallback(page);
    await page.goto(`${tool.url}/__probe/mode?set=glb-fail&to=${route}`);
    await expect(label(page)).toHaveAttribute('data-model-source', 'geometry', { timeout: 30_000 });
    await page.goto(`${tool.url}/__probe/mode?set=off&to=${route}`);
    await expect(label(page)).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
    await expect(page.getByText(/量測工具故障注入/)).toHaveCount(0);
  });

  test('雙指縮放：每次雙指觸控計時，送出後存成結果', async ({ page, tool, errors }) => {
    test.skip(!phone(), '需要觸控');
    await page.goto(`${tool.url}/__probe/mode?set=pinch&to=${route}`);
    await expect(label(page)).toHaveAttribute('data-model-source', 'glb', { timeout: 30_000 });
    const send = page.getByRole('button', { name: /送出雙指縮放量測/ });
    await expect(send).toHaveText('送出雙指縮放量測（0 次）');
    const box = (await page.locator('canvas').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    /** Two fingers on the map moving apart (spread > 0) or together, over 30 touch moves. */
    const pinchBy = async (spread: number) => {
      const at = (d: number) => [{ x: x - 40 - d, y, id: 1 }, { x: x + 40 + d, y, id: 2 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
      for (let i = 1; i <= 30; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(spread * i / 30) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    for (const spread of [80, -60, 50]) await pinchBy(spread);
    await expect(send).toHaveText('送出雙指縮放量測（3 次）');
    await send.click();
    await page.waitForURL(/\/__probe\/report/);
    const saved = (await results(page, tool)).find(item => item.kind === 'pinch' && item.route === route);
    expect(saved.result.sessions).toBe(3);
    expect(saved.result.flags).toContain('software');
    expect(errors).toEqual([]);
  });
});

test('人工檢查表：存成結果並列在報告', async ({ page, tool }) => {
  await page.goto(`${tool.url}/__probe/checklist`);
  await page.getByLabel('裝置型號').fill('checklist-self-test');
  await page.getByLabel('T-01 candidate').selectOption('pass');
  await page.getByLabel('T-04 legacy').selectOption('na');
  await page.getByLabel('T-06 備註').fill('頁面不捲動');
  await page.getByRole('button', { name: '儲存檢查表' }).click();
  await page.waitForURL(/\/__probe\/report/);
  const saved = (await results(page, tool)).find(item => item.kind === 'checklist' && item.model === 'checklist-self-test');
  expect(saved.results).toMatchObject({ 'T-01:candidate': 'pass', 'T-04:legacy': 'na', 'T-06:note': '頁面不捲動' });
  await expect(page.getByRole('heading', { name: /人工檢查表/ })).toBeVisible();
});
