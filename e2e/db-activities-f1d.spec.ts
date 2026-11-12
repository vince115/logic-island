import { test as base, expect, type Page } from '@playwright/test';
import { curriculum, lessons } from '../src/content/curriculum';
import { hasCapability } from '../src/content/curriculum/schema';
import { expectedOpsAnswer, OPS_FIELDS } from '../src/lib/ops/check';
import { lessonNavigation } from '../src/content/world/navigation';

/*
 * Phase F.1d: the activities DB16–DB20 brought, on the production build, desktop and phone. Round trips of each data
 * access strategy, driver examples, parameterized playground runs and exercises (hostile values, crash checks), the
 * data-model comparison, backup and replication simulations with their exercises, and the end of the database island.
 * Data-driven: it uses whatever DB lessons declare these capabilities.
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
const sequenceLesson = db.find(l => hasCapability(l, 'protocol-sequence'));
const driverLesson = db.find(l => hasCapability(l, 'driver-code'));
const opsLesson = db.find(l => hasCapability(l, 'architecture-diagram'));
const paramsLesson = db.find(l => content(l.lessonId).sql?.params && content(l.lessonId).sql?.dataset === 'auth');

test('往返序列：每種做法實際執行，列出每次往返的 SQL、參數與列數；可重設', async ({ page }) => {
  test.skip(!sequenceLesson, 'no protocol-sequence lesson yet');
  const example = content(sequenceLesson!.lessonId).sequences![0];
  await page.goto(`/curriculum/${sequenceLesson!.slug}`);
  const box = page.locator('div', { has: page.getByRole('heading', { name: example.title, exact: true }) }).last();
  const strategies = box.getByRole('group', { name: '資料存取的做法' });
  const perRow = example.strategies.findIndex(s => s.then?.mode === 'per-row'), joined = example.strategies.findIndex(s => !s.then);
  await strategies.getByRole('button', { name: example.strategies[perRow].label }).click();
  const trips = box.getByRole('list', { name: `${example.strategies[perRow].label} 的往返` }).getByRole('listitem');
  await expect(trips.first()).toBeVisible({ timeout: 15_000 });
  const n = await trips.count();
  expect(n).toBeGreaterThan(2);
  await expect(box.getByText(/參數：/).first()).toBeVisible();
  await strategies.getByRole('button', { name: example.strategies[joined].label }).click();
  await expect(box.getByRole('list', { name: `${example.strategies[joined].label} 的往返` }).getByRole('listitem')).toHaveCount(1, { timeout: 15_000 });
  await expect(box.getByText(new RegExp(`已執行的做法：.*${n} 次往返`))).toBeVisible();
  await strategies.getByRole('button', { name: '重設' }).click();
  await expect(box.getByText('已執行的做法')).toHaveCount(0);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('驅動程式範例：Python、JavaScript、Java 分頁；顯示 Python／JavaScript 的輸出，Java 註明只編譯', async ({ page }) => {
  test.skip(!driverLesson, 'no driver-code lesson yet');
  const example = content(driverLesson!.lessonId).driverCode!.examples.find(e => e.code.Java)!;
  await page.goto(`/curriculum/${driverLesson!.slug}`);
  const box = page.locator('div', { has: page.getByRole('heading', { name: example.title, exact: true }) }).last();
  const tabs = box.getByRole('tablist');
  for (const name of ['Python', 'JavaScript', 'Java']) await expect(tabs.getByRole('tab', { name, exact: true })).toBeVisible();
  await tabs.getByRole('tab', { name: 'JavaScript', exact: true }).click();
  await expect(box.getByText("require('node:sqlite')", { exact: false })).toBeVisible();
  await expect(box.getByText(example.output.split('\n')[0], { exact: false }).first()).toBeVisible();
  await expect(box.getByText(/Java 版本只在自動檢查中編譯/)).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('參數化查詢：練習場的參數值另外綁定，惡意輸入只是資料', async ({ page }) => {
  test.skip(!paramsLesson, 'no parameterized auth playground yet');
  await page.goto(`/curriculum/${paramsLesson!.slug}`);
  const playground = page.locator('section', { has: page.getByRole('heading', { name: 'SQL 練習場' }) });
  await playground.getByLabel('SQL', { exact: true }).fill('SELECT username FROM users WHERE username = ? AND active = 1;');
  const params = playground.getByLabel(/參數值（每行一個/);
  await params.fill('alice');
  await playground.getByRole('button', { name: '執行', exact: true }).click();
  await expect(playground.getByRole('cell', { name: 'alice', exact: true })).toBeVisible({ timeout: 15_000 });
  await params.fill("alice' --");
  await playground.getByRole('button', { name: '執行', exact: true }).click();
  await expect(playground.getByText(/0 列/).first()).toBeVisible({ timeout: 15_000 });
  await expect(playground.getByRole('cell', { name: 'alice', exact: true })).toHaveCount(0);
});

test('參數組與當機檢查的練習：典型錯誤（拼接、少了交易）被指出；參考解答通過', async ({ page }) => {
  const exercises = db.flatMap(l => (content(l.lessonId).sql?.exercises ?? []).filter(e => e.paramSets || e.atomic).map(e => ({ l, e })));
  test.skip(!exercises.length, 'no parameterized or crash-checked exercise yet');
  // One of each kind, so the run stays short.
  const pick = [exercises.find(x => x.e.paramSets), exercises.find(x => x.e.atomic && x.l.lessonId !== 'DB14') ?? exercises.find(x => x.e.atomic)].filter(x => x !== undefined);
  for (const { l, e } of pick) {
    await page.goto(`/curriculum/${l.slug}`);
    const article = page.getByRole('article', { name: e.title }), answer = article.getByLabel('你的 SQL'), check = article.getByRole('button', { name: '檢查答案' });
    await answer.fill(e.mistakes[0].sql);
    await check.click();
    await expect(article.getByText(/還沒通過/), `${e.id} mistake`).toBeVisible({ timeout: 20_000 });
    await answer.fill(e.solution);
    await check.click();
    await expect(article.getByText(/全部通過/), e.id).toBeVisible({ timeout: 20_000 });
  }
});

test('資料模型比較：勾選操作，表格與結論用資料模型的說法', async ({ page }) => {
  const lesson = db.find(l => l.visualizationType === 'ds-comparison');
  test.skip(!lesson, 'no data-model comparison yet');
  const viz = content(lesson!.lessonId).visualization as Extract<NonNullable<ReturnType<typeof content>['visualization']>, { kind: 'ds-comparison' }>;
  await page.goto(`/curriculum/${lesson!.slug}`);
  const table = page.getByRole('table', { name: viz.wording!.caption });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: viz.wording!.subject })).toBeVisible();
  const picker = page.getByRole('group', { name: '這個問題需要哪些操作？（可複選）' });
  const last = viz.operations.at(-1)!;
  await picker.getByLabel(last.label).check();
  await expect(table.getByRole('columnheader', { name: last.label })).toBeVisible();
  for (const o of viz.operations) await picker.getByLabel(o.label).setChecked(false);
  await expect(page.getByText('請至少選一項操作。')).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('備份與複寫：架構圖與模擬；改變故障時間、日誌封存與複寫方式，結果跟著重算；可重設', async ({ page }) => {
  test.skip(!opsLesson, 'no architecture-diagram lesson yet');
  const { backups, replication } = content(opsLesson!.lessonId).ops!;
  await page.goto(`/curriculum/${opsLesson!.slug}`);
  const backup = page.locator('div', { has: page.getByRole('heading', { name: backups[0].title, exact: true }) }).last();
  await expect(backup.getByRole('img', { name: /系統架構/ })).toBeVisible();
  const loss = backup.getByText(/遺失 \d+ 分鐘的資料/);
  const before = await loss.textContent();
  await backup.getByLabel(/持續封存日誌/).click();
  await expect(loss).not.toHaveText(before!);
  await backup.getByRole('button', { name: '重設' }).click();
  await expect(loss).toHaveText(before!);
  const rep = page.locator('div', { has: page.getByRole('heading', { name: replication[0].title, exact: true }) }).last();
  await rep.getByLabel('複寫方式').selectOption('sync');
  await expect(rep.getByText('（過時）')).toHaveCount(0);
  await rep.getByRole('button', { name: '重設' }).click();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('備份與複寫練習：答案由模擬器算出；錯的答案得到提示，正確答案通過；可清除', async ({ page }) => {
  test.skip(!opsLesson, 'no architecture-diagram lesson yet');
  await page.goto(`/curriculum/${opsLesson!.slug}`);
  for (const e of content(opsLesson!.lessonId).ops!.exercises) {
    const article = page.getByRole('article', { name: e.title });
    const fill = async (answer: Record<string, number>) => {
      for (const [k, v] of Object.entries(answer)) await article.getByLabel(OPS_FIELDS[e.task][k]).fill(String(v));
    };
    await fill(e.mistakes[0].answer);
    await article.getByRole('button', { name: '檢查答案' }).click();
    await expect(article.getByText('還沒通過：'), `${e.id} mistake`).toBeVisible();
    await article.getByRole('button', { name: '清除' }).click();
    await fill(expectedOpsAnswer(e));
    await article.getByRole('button', { name: '檢查答案' }).click();
    await expect(article.getByText('正確。'), e.id).toBeVisible();
  }
});

test('資料庫應用島的最後一堂：關卡可逐步前進；頁尾說明本島已到最後一堂，不連到其他島的第一堂', async ({ page }) => {
  const last = db.at(-1)!;
  test.skip(!lessonNavigation(last.lessonId).islandComplete, 'the database island is not written to the end yet');
  await page.goto(`/curriculum/${last.slug}`);
  await expect(page.getByRole('heading', { name: '本島課程已到最後一堂' })).toBeVisible();
  // The footer leads only back to the island's syllabus, or on to what a learning path or a bridge names; no "next lesson".
  const nav = lessonNavigation(last.lessonId);
  const allowed = ['/curriculum#island-databases', ...nav.paths.flatMap(p => p.next?.href ? [p.next.href] : []), ...nav.bridges.map(b => b.href)];
  const footer = page.locator('section', { has: page.getByRole('heading', { name: '本島課程已到最後一堂' }) });
  for (const href of await footer.getByRole('link').evaluateAll(links => links.map(a => a.getAttribute('href')))) expect(allowed).toContain(href);
  await expect(page.getByRole('link', { name: /下一堂/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /本島課程已到最後一堂/ })).toHaveAttribute('href', '/curriculum#island-databases');
  const stages = page.getByText(/階段 1／\d+/);
  await expect(stages).toBeVisible();
  await page.getByRole('button', { name: '下一步' }).first().click();
  await expect(page.getByText(/階段 2／\d+/)).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});
