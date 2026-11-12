import { test as base, expect, type Page } from '@playwright/test';
import { curriculum, lessons } from '../src/content/curriculum';
import { lessonsOfIsland } from '../src/content/world/catalog';
import { hasCapability } from '../src/content/curriculum/schema';

/*
 * Phase F.1a: the database island's SQL lessons on the production build: SQL examples with results, the SQL
 * playground (SQLite in a Web Worker, WebAssembly bundled by the build), exercise checking, the catalog's planned
 * lessons and the pager. Desktop and phone. Data-driven: it uses whatever DB lessons are written.
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
const db = lessons.filter(l => l.islandId === 'databases');
const DB01 = db[0], last = db.at(-1)!;
// F.1b: the lessons declaring the sql capability (DB08 is ER modeling only).
const sqlLessons = db.filter(l => hasCapability(l, 'sql'));
const sql = (id: string) => curriculum.contents[id as 'DB01']!.sql!;
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const playground = (page: Page) => page.locator('#playground');
async function runIn(page: Page, text: string) {
  const area = playground(page).getByLabel('SQL', { exact: true });
  await area.fill(text);
  await playground(page).getByRole('button', { name: '執行', exact: true }).click();
}

test('SQL 課程：沒有程式語言分頁，範例有語法高亮與結果表，先修與建議先修分開列出', async ({ page }) => {
  await page.goto(`/curriculum/${DB01.slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(DB01.title);
  await expect(page.getByRole('list', { name: '課程資訊' })).toContainText('語言SQL');
  await expect(page.getByRole('tablist')).toHaveCount(0);
  const example = sql(DB01.lessonId).examples[0];
  const figure = page.getByRole('heading', { name: example.title, exact: true }).locator('..');
  await expect(figure.locator('pre [class^="tk-"]').first()).toBeVisible();
  await expect(figure.getByRole('table')).toContainText(`${example.result.rows.length} 列`);
  await expect(page.getByRole('complementary', { name: '建議先完成' })).toContainText('也可以參考（非必要）');
  for (const id of ['#playground', '#quiz', '#exercises']) await expect(page.locator(id)).toHaveCount(1);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('SQL 練習場：預設查詢、空結果、錯誤回饋、修改後重設、重複執行與 Ctrl+Enter（只載入本站的 WebAssembly）', async ({ page, baseURL }) => {
  const requests: string[] = [];
  page.on('request', r => requests.push(r.url()));
  await page.goto(`/curriculum/${DB01.slug}`);
  const pg = playground(page);
  const preset = sql(DB01.lessonId).presets[0];
  await pg.getByRole('button', { name: preset.label, exact: true }).click();
  await expect(pg.getByLabel('SQL', { exact: true })).toHaveValue(preset.sql);
  await pg.getByRole('button', { name: '執行', exact: true }).click();
  await expect(pg.getByRole('table').first()).toBeVisible();
  // The WebAssembly comes from this site's build; nothing goes to another origin.
  expect(requests.some(u => /\/_next\/static\/media\/sql-wasm-browser\.[^/]+\.wasm$/.test(u))).toBe(true);
  // Only this site (whatever port the run uses) and inline data.
  expect(requests.filter(u => !u.startsWith(`${new URL(baseURL!).origin}/`) && !u.startsWith('data:'))).toEqual([]);

  await runIn(page, 'SELECT id, name FROM students WHERE grade > 12;');
  await expect(pg.getByRole('table')).toContainText('沒有符合的資料列（0 列）');
  await expect(pg.getByRole('columnheader')).toHaveText(['id', 'name']);

  await runIn(page, 'SELEC name FROM students;');
  await expect(pg.getByRole('alert')).toContainText('SQLite 錯誤');
  await expect(pg.getByRole('alert')).toContainText('syntax error');
  await expect(pg.getByRole('alert')).toContainText('語法錯誤');

  await runIn(page, "INSERT INTO students VALUES (9, '新同學', '甲', 10, NULL); SELECT COUNT(*) AS n FROM students;");
  await expect(pg.getByRole('cell', { name: '9', exact: true })).toBeVisible();
  await expect(pg).toContainText('已修改 1 列資料');
  await runIn(page, 'SELECT COUNT(*) AS n FROM students;');
  await expect(pg.getByRole('cell', { name: '9', exact: true })).toBeVisible();
  await pg.getByRole('button', { name: '重設資料' }).click();
  await expect(pg.getByText('資料已重設為原始狀態')).toBeVisible();
  // Ctrl+Enter runs from the editor.
  await pg.getByLabel('SQL', { exact: true }).fill('SELECT COUNT(*) AS n FROM students;');
  await pg.getByLabel('SQL', { exact: true }).press('Control+Enter');
  await expect(pg.getByRole('cell', { name: '8', exact: true })).toBeVisible();
  await pg.getByRole('button', { name: '執行', exact: true }).click();
  await expect(pg.getByRole('cell', { name: '8', exact: true })).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('SQL 練習：結果比對（錯誤、參考解答與另一種寫法都正確判定），隱藏測試不顯示預期資料', async ({ page }) => {
  // F.1b: lessons whose SQL exercises compare query results (DDL/DML probe exercises are covered in db-activities.spec.ts).
  for (const lesson of sqlLessons.filter(l => sql(l.lessonId).exercises.some(e => !e.probes))) {
    const exercise = sql(lesson.lessonId).exercises.find(e => !e.probes)!;
    await page.goto(`/curriculum/${lesson.slug}`);
    const article = page.getByRole('article', { name: exercise.title });
    const answer = article.getByLabel('你的 SQL');
    const check = article.getByRole('button', { name: '檢查答案' });
    await answer.fill(exercise.mistakes[0].sql);
    await check.click();
    await expect(article.getByText(/還沒通過/)).toBeVisible();
    for (const text of [exercise.solution, exercise.alternatives[0]]) {
      await answer.fill(text);
      await check.click();
      await expect(article.getByText(/全部通過/), `${lesson.lessonId} ${text}`).toBeVisible();
    }
    await expect(article.getByText(/隱藏測試 \d/).first()).toBeVisible();
    await expect(article.getByText('預期結果')).toHaveCount(0);
  }
});

test('目錄：資料庫應用島 20 堂全部開放（F.1d），最後一堂不接到其他島；規劃中的島的課沒有頁面', async ({ page }) => {
  await page.goto('/curriculum');
  const region = page.getByRole('region', { name: /資料庫應用島/ });
  expect(lessonsOfIsland('databases').filter(l => l.lessonStatus === 'planned')).toEqual([]);
  await expect(region.getByRole('listitem')).toHaveCount(20);
  // Shown like the other complete islands: the learner's progress, no "planned" count.
  await expect(region).toContainText('資料庫應用島：已完成 0／20 堂');
  await expect(region).not.toContainText('規劃中');
  await expect(region.getByRole('link')).toHaveCount(20);
  await region.getByRole('link', { name: DB01.title }).click();
  await expect(page).toHaveURL(`/curriculum/${DB01.slug}`);
  // A lesson of a planned island has no page.
  const planned = lessonsOfIsland('programming-languages')[0];
  expect((await page.request.get(`/curriculum/${planned.slug}`)).status()).toBe(404);
  await page.goto(`/curriculum/${last.slug}`);
  await expect(page.locator('a[rel="next"]')).toHaveCount(0);
  // F.1b: nothing links across to another island as "next"; the end of the island leads back to its syllabus.
  const end = page.getByRole('region', { name: '本島課程已到最後一堂' });
  await expect(end).toContainText(`這是資料庫應用島的最後一堂。`);
  await expect(end.getByRole('link', { name: '返回資料庫應用島課綱' })).toHaveAttribute('href', '/curriculum#island-databases');
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});
