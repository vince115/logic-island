import { test as base, expect, type Page } from '@playwright/test';
import { curriculum, lessons } from '../src/content/curriculum';
import { hasCapability } from '../src/content/curriculum/schema';
import { expectedAnswer } from '../src/lib/txn/check';
import type { Anomaly } from '../src/lib/txn/schedule';
import { ANOMALY_TEXT } from '../src/lib/txn/schedule';

/*
 * Phase F.1c: the query-plan and transaction-timeline activities on the production build, desktop and phone. Plans in
 * the SQL playground, the B+ tree explorer, plan-checked exercises, the write-ahead-log timeline with a crash, the
 * two-transaction scheduler with model and level, and the transaction exercises. Data-driven: it uses whatever DB
 * lessons declare these capabilities.
 */
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const db = lessons.filter(l => l.islandId === 'databases' && l.lessonStatus === 'complete');
const content = (id: string) => curriculum.contents[id as 'DB01']!;
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const planLesson = db.find(l => hasCapability(l, 'query-plan'));
const txLesson = db.find(l => hasCapability(l, 'transaction-timeline') && content(l.lessonId).transactions!.timelines.length);
const scheduleLesson = db.find(l => hasCapability(l, 'transaction-timeline') && content(l.lessonId).transactions!.schedules.length);

test('查詢計畫：練習場把 EXPLAIN QUERY PLAN 寫成步驟並顯示執行時間；建索引後變成索引搜尋', async ({ page }) => {
  test.skip(!planLesson, 'no query-plan lesson yet');
  await page.goto(`/curriculum/${planLesson!.slug}`);
  const pg = page.locator('#playground'), area = pg.getByLabel('SQL', { exact: true }), run = pg.getByRole('button', { name: '執行', exact: true });
  await area.fill('EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 42;');
  await run.click();
  await expect(pg.getByText('全表掃描', { exact: true })).toBeVisible();
  await expect(pg.getByText(/SQLite 執行時間約/)).toBeVisible();
  await area.fill('CREATE INDEX e2e_by_customer ON orders(customer_id); EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 42;');
  await run.click();
  await expect(pg.getByText('索引搜尋', { exact: true })).toBeVisible();
  // The plan is shown twice: as named steps (code) and in the raw result table.
  await expect(pg.getByRole('code').filter({ hasText: /^SEARCH orders USING INDEX e2e_by_customer/ })).toBeVisible();
  await expect(pg.getByRole('cell', { name: /USING INDEX e2e_by_customer/ })).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('B+ 樹：搜尋經過的節點與範圍沿葉節點鏈走過的葉子，以文字說明；錯誤輸入有提示；可重設', async ({ page }) => {
  const lesson = db.find(l => content(l.lessonId).queryPlan?.trees.length);
  test.skip(!lesson, 'no B+ tree example yet');
  const tree = content(lesson!.lessonId).queryPlan!.trees[0];
  await page.goto(`/curriculum/${lesson!.slug}`);
  const box = page.locator('div', { has: page.getByRole('heading', { name: tree.title, exact: true }) }).last();
  const key = tree.keys[Math.floor(tree.keys.length / 2)];
  await box.getByLabel('找鍵（或範圍下限）').fill(String(key));
  await box.getByLabel('範圍上限（可空白）').fill('');
  await box.getByRole('button', { name: '搜尋' }).click();
  await expect(box.getByText(new RegExp(`找 ${key}：經過 \\d+ 個節點.*在葉節點找到`))).toBeVisible();
  await box.getByLabel('範圍上限（可空白）').fill(String(key + 100));
  await box.getByRole('button', { name: '搜尋' }).click();
  await expect(box.getByText(/再沿著葉節點鏈走過 \d+ 個葉節點/)).toBeVisible();
  await box.getByLabel('依序插入的鍵').fill('5, 3, x');
  await expect(box.getByText('鍵要是 0 到 999 的整數。')).toBeVisible();
  await expect(box.getByRole('button', { name: '重新建樹' })).toBeDisabled();
  await box.getByRole('button', { name: '重設' }).click();
  await expect(box.getByLabel('依序插入的鍵')).toHaveValue(tree.keys.join(', '));
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('依查詢計畫檢查的練習：結果對但仍全表掃描會被指出；參考解答通過', async ({ page }) => {
  test.skip(!planLesson, 'no query-plan lesson yet');
  const exercises = db.flatMap(l => (content(l.lessonId).sql?.exercises ?? []).filter(e => e.plan || e.probes?.some(p => p.plan)).map(e => ({ l, e })));
  for (const { l, e } of exercises.slice(0, 2)) {
    await page.goto(`/curriculum/${l.slug}`);
    const article = page.getByRole('article', { name: e.title }), answer = article.getByLabel('你的 SQL'), check = article.getByRole('button', { name: '檢查答案' });
    await answer.fill(e.mistakes[0].sql);
    await check.click();
    await expect(article.getByText(/還沒通過/), `${e.id} mistake`).toBeVisible({ timeout: 15_000 });
    await answer.fill(e.solution);
    await check.click();
    await expect(article.getByText(/全部通過/), e.id).toBeVisible({ timeout: 15_000 });
  }
});

test('交易時間軸：逐步看已提交的值、交易內的值與日誌；在任一步當機後看復原結果', async ({ page }) => {
  test.skip(!txLesson, 'no timeline yet');
  const timeline = content(txLesson!.lessonId).transactions!.timelines[0];
  await page.goto(`/curriculum/${txLesson!.slug}`);
  const box = page.locator('div', { has: page.getByRole('heading', { name: timeline.title, exact: true }) }).last();
  await expect(box.getByText('沒有進行中的交易')).toBeVisible();
  for (let i = 0; i < Math.min(2, timeline.script.steps.length); i++) await box.getByRole('button', { name: '下一步' }).click();
  await box.getByRole('button', { name: /在第 \d+ 步之後當機/ }).click();
  await expect(box.getByText('當機後復原')).toBeVisible();
  await expect(box.getByText(/重做：.*捨棄：/)).toBeVisible();
  await box.getByRole('button', { name: '重設' }).click();
  await expect(box.getByText('當機後復原')).toHaveCount(0);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('交錯排程：切換並行控制與隔離等級，看實際執行、等待、中止、最後的值與異常', async ({ page }) => {
  test.skip(!scheduleLesson, 'no schedule yet');
  const schedule = content(scheduleLesson!.lessonId).transactions!.schedules[0];
  await page.goto(`/curriculum/${scheduleLesson!.slug}`);
  const box = page.locator('div', { has: page.getByRole('heading', { name: schedule.title, exact: true }) }).last();
  await expect(box.getByText('發生的異常')).toBeVisible();
  await box.getByLabel('並行控制').selectOption('locking');
  await box.getByLabel('隔離等級').selectOption('READ UNCOMMITTED');
  await expect(box.getByText('最後的值：', { exact: false })).toBeVisible();
  await box.getByLabel('隔離等級').selectOption('SERIALIZABLE');
  await expect(box.getByRole('table')).toBeVisible();
  await box.getByRole('button', { name: '上一步' }).click();
  await expect(box.getByText('發生的異常')).toHaveCount(0);
  await box.getByRole('button', { name: '顯示全部' }).click();
  await expect(box.getByText('發生的異常')).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('交易練習：答案由模擬器算出；錯的答案得到提示，正確答案通過；可清除', async ({ page }) => {
  const exercises = db.flatMap(l => (content(l.lessonId).transactions?.exercises ?? []).map(e => ({ l, e })));
  test.skip(!exercises.length, 'no transaction exercise yet');
  for (const { l, e } of exercises) {
    await page.goto(`/curriculum/${l.slug}`);
    const article = page.getByRole('article', { name: e.title });
    const fill = async (answer: ReturnType<typeof expectedAnswer>) => {
      if (e.task === 'anomalies') for (const [a, text] of Object.entries(ANOMALY_TEXT))
        await article.getByLabel(text, { exact: true }).setChecked((answer as Anomaly[]).includes(a as Anomaly));
      else if (e.task === 'level') await article.getByLabel(/最弱、但足夠的隔離等級/).selectOption(answer as string);
      else for (const [k, v] of Object.entries(answer as Record<string, number>)) await article.getByLabel(`${k} 的值`).fill(String(v));
    };
    await fill(e.mistakes[0].answer);
    await article.getByRole('button', { name: '檢查答案' }).click();
    await expect(article.getByText('還沒通過：'), `${e.id} mistake`).toBeVisible();
    await article.getByRole('button', { name: '清除' }).click();
    await fill(expectedAnswer(e));
    await article.getByRole('button', { name: '檢查答案' }).click();
    await expect(article.getByText('正確。'), e.id).toBeVisible();
  }
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('程式課程不載入任何資料庫活動的程式、資料集或 WebAssembly（F.1c：資料集曾因頂層呼叫被打包進每一課）', async ({ page }) => {
  const bodies: string[] = [], wasm: string[] = [];
  page.on('response', async r => {
    const path = new URL(r.url()).pathname;
    if (path.endsWith('.wasm')) wasm.push(path);
    if (path.startsWith('/_next/static/') && path.endsWith('.js')) bodies.push(await r.text().catch(() => ''));
  });
  for (const slug of ['programs-and-algorithms', 'algorithms-challenge']) await page.goto(`/curriculum/${slug}`, { waitUntil: 'networkidle' });
  const markers = { datasets: '王小明', sales: '2024-06-01', sqlPlayground: 'Ctrl＋Enter（Mac：⌘＋Enter）執行', erBuilder: '檢查 ER 模型',
    normalization: '回到原始的表', bplus: '依序插入的鍵', transactions: '並行控制',
    // F.1d: round-trip sequences and the backup / replication simulations.
    sequences: '資料存取的做法', ops: '持續封存日誌', params: '參數值由驅動程式另外傳給資料庫' };
  for (const [name, marker] of Object.entries(markers)) expect(bodies.some(b => b.includes(marker)), name).toBe(false);
  expect(bodies.length).toBeGreaterThan(5);
  expect(wasm).toEqual([]);
});
