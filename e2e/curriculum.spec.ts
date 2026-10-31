import { test as base, expect, type Page } from '@playwright/test';
import { lessons } from '@/content/curriculum';

/*
 * Phase E.1 curriculum: the /curriculum directory, the five complete lessons (F01..F05) and the planned outlines, on
 * desktop and phone. Progress lives in localStorage, so each test starts from a fresh browser context.
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
const phone = () => test.info().project.name.startsWith('mobile');
const COMPLETE = ['programs-and-algorithms', 'variables-and-types', 'input-and-output', 'operators-and-precedence', 'conditionals'];
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const quiz = (page: Page) => page.locator('#quiz');
/** E.3: the structures-island lessons written so far, and the visualization tests' pages. */
const STRUCTURE_PAGES = lessons.filter(l => l.islandId === 'structures' && l.lessonStatus === 'complete').map(l => l.slug);

test('課綱目錄：60 堂課、三島各 20 堂，五堂完整教材，其餘標示規劃中', async ({ page }) => {
  await page.goto('/curriculum');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('60 堂課，三座島。');
  for (const island of ['基礎程式島', '資料結構島', '演算法島']) {
    const list = page.getByRole('region', { name: new RegExp(island) }).getByRole('listitem');
    await expect(list, island).toHaveCount(20);
  }
  const complete = lessons.filter(l => l.lessonStatus === 'complete').length;
  await expect(page.getByText('完整教材', { exact: true })).toHaveCount(complete);
  await expect(page.getByText('規劃中', { exact: true })).toHaveCount(60 - complete);
  for (const slug of COMPLETE) await expect(page.locator(`a[href="/curriculum/${slug}"]`)).toHaveCount(1);
  // Every lesson page exists, planned ones included.
  const hrefs = await page.locator('main ol a').evaluateAll(links => links.map(a => a.getAttribute('href')));
  expect(hrefs).toHaveLength(60);
  for (const href of [hrefs[0], hrefs[29], hrefs[59]]) expect((await page.request.get(href!)).status(), href!).toBe(200);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('完整教材 F01：目標、三語範例切換（全頁同步、鍵盤）、變數追蹤逐步執行', async ({ page }) => {
  await page.goto('/curriculum/programs-and-algorithms');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('程式與演算法入門');
  await expect(page.getByRole('heading', { name: '學習目標' })).toBeVisible();
  expect(await page.locator('main .objectives li').count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole('note').filter({ hasText: '規劃中' })).toHaveCount(0);
  const panels = page.getByRole('tabpanel');
  await expect(panels.first()).toContainText('#include <iostream>');
  await page.getByRole('tablist', { name: '第一支程式：程式語言' }).getByRole('tab', { name: 'Python' }).click();
  // One choice switches every code block on the page.
  for (let i = 0; i < await panels.count(); i++) await expect(panels.nth(i)).not.toContainText('#include');
  await expect(panels.first()).toContainText('print("Hello, Logic Island!")');
  await page.getByRole('tablist', { name: '第一支程式：程式語言' }).getByRole('tab', { name: 'Python' }).press('ArrowRight');
  await expect(page.getByRole('tablist', { name: '第一支程式：程式語言' }).getByRole('tab', { name: 'Java' })).toBeFocused();
  await expect(panels.first()).toContainText('public class Main');
  // The choice is remembered on the next page.
  await page.goto('/curriculum/variables-and-types');
  await expect(page.getByRole('tabpanel').first()).toContainText('public class Main');
  await page.goto('/curriculum/programs-and-algorithms');
  const viz = page.locator('#visualization');
  await expect(viz.getByText('步驟 1／7')).toBeVisible();
  await expect(viz.getByRole('button', { name: '上一步' })).toBeDisabled();
  for (let i = 0; i < 4; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText('步驟 5／7')).toBeVisible();
  await expect(viz.locator('tbody tr').filter({ hasText: 'average' })).toContainText('83');
  await expect(viz.locator('[aria-current="step"]')).toContainText('average = total // 3');
  await viz.getByRole('button', { name: '下一步' }).click();
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByRole('button', { name: '下一步' })).toBeDisabled();
  await expect(viz.getByText('average = 83', { exact: false }).last()).toBeVisible();
  await viz.getByRole('button', { name: '重來' }).click();
  await expect(viz.getByText('步驟 1／7')).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('程式碼複製：複製目前選的語言', async ({ page, context }) => {
  test.skip(phone(), '剪貼簿權限在桌機 Chromium 測試');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/curriculum/input-and-output');
  const first = page.locator('figure').first();
  await first.getByRole('tab', { name: 'C++' }).click();
  await first.getByRole('button', { name: '複製 C++ 程式碼' }).click();
  await expect(first.getByRole('status')).toHaveText('已複製到剪貼簿');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('std::cin >> a >> b;');
});

test('觀念測驗與進度：未答完不送出；答錯顯示解析與差幾題；全對＋讀完才完成，重新整理後保留', async ({ page }) => {
  await page.goto('/curriculum/conditionals');
  const status = quiz(page).getByRole('status');
  await quiz(page).getByRole('button', { name: '提交答案' }).click();
  await expect(status).toHaveText('還有題目沒有作答。');
  const questions = quiz(page).locator('fieldset');
  const count = await questions.count();
  expect(count).toBeGreaterThanOrEqual(3);
  // Wrong first: pick the first option everywhere, then read which were right from the feedback.
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole('radio').first().check();
  await quiz(page).getByRole('button', { name: '提交答案' }).click();
  await expect(status).toContainText('答對');
  const feedback = quiz(page).locator('[data-result]').filter({ has: page.locator('p') });
  await expect(feedback.first()).toBeVisible();
  for (let i = 0; i < count; i++) await expect(questions.nth(i).getByText(/答對了|答錯了，正確答案是/).first()).toBeVisible();
  const correctIndex = await questions.evaluateAll(sets => sets.map(set => [...set.querySelectorAll('label')].findIndex(l => l.getAttribute('data-correct') === 'true')));
  expect(correctIndex.every(i => i >= 0)).toBe(true);
  await expect(page.getByRole('region', { name: '學習進度' }).getByText('進行中')).toBeVisible();
  // Retry, all right.
  await quiz(page).getByRole('button', { name: '重新作答' }).click();
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole('radio').nth(correctIndex[i]).check();
  await quiz(page).getByRole('button', { name: '提交答案' }).click();
  await expect(status).toHaveText(`答對 ${count}／${count} 題，通過！`);
  const progress = page.getByRole('region', { name: '學習進度' });
  await expect(progress.getByText('進行中')).toBeVisible();  // the reading is not confirmed yet
  await progress.getByRole('button', { name: '我已讀完本課內容' }).click();
  await expect(progress.getByText('已完成', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: '學習進度' }).getByText('已完成', { exact: true })).toBeVisible();
  await page.goto('/curriculum');
  const row = page.getByRole('listitem').filter({ hasText: '條件判斷' }).first();
  await expect(row.getByText('已完成', { exact: true })).toBeVisible();
  // The next lesson (planned) still shows the completed prerequisite.
  await page.goto('/curriculum/logical-operators');
  await expect(page.getByRole('complementary', { name: '建議先完成' }).getByText('已完成', { exact: true })).toBeVisible();
});

test('條件分支視覺化：邊界值走進正確的分支', async ({ page }) => {
  await page.goto('/curriculum/conditionals');
  const viz = page.locator('#visualization');
  const value = viz.getByRole('spinbutton');
  for (const [score, result] of [[85, 'B'], [90, 'A'], [89, 'B'], [60, 'D'], [59, 'F'], [-1, 'Invalid'], [101, 'Invalid']] as const) {
    await value.fill(String(score));
    await expect(viz.locator('[aria-live]'), String(score)).toContainText(`輸出 ${result}`);
  }
  await value.fill('59');
  await expect(viz.locator('li[data-state="taken"]')).toContainText('else');
  await expect(viz.locator('li[data-state="skipped"]')).toHaveCount(0);
});

test('規劃中課程只有大綱（全部完成後目錄不再有規劃中）；有互動實驗的課程連到實驗', async ({ page }) => {
  // Data-driven: while some lesson is still planned, its page shows the outline only; once all 60 are complete, none is.
  const planned = lessons.find(l => l.lessonStatus === 'planned');
  if (planned) {
    await page.goto(`/curriculum/${planned.slug}`);
    await expect(page.getByRole('note').filter({ hasText: '這一課還在規劃中' })).toBeVisible();
    await expect(page.getByText(`規劃中 v${planned.version}`)).toBeVisible();
    for (const id of ['#quiz', '#exercises', '#visualization']) await expect(page.locator(id)).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByRole('region', { name: '學習進度' })).toHaveCount(0);
    expect(await page.locator('main .objectives li').count()).toBeGreaterThanOrEqual(3);
  } else {
    await page.goto('/curriculum');
    await expect(page.getByText('規劃中', { exact: true })).toHaveCount(0);
    await expect(page.getByText('完整教材', { exact: true })).toHaveCount(lessons.length);
  }
  // Lessons with an existing lab link to it (the six labs are not rebuilt).
  for (const [slug, name, lab] of [['stacks', /Stack · 堆疊/, 'stack'], ['binary-search', /Binary Search · 二分搜尋/, 'binary-search'], ['breadth-first-search', /BFS · 廣度優先搜尋/, 'bfs']] as const) {
    await page.goto(`/curriculum/${slug}`);
    await page.getByRole('link', { name }).click();
    await expect(page).toHaveURL(new RegExp(`/learn/${lab}$`));
  }
});

test('上一堂／下一堂依建議順序，跨島相接；先修只提示不封鎖', async ({ page }) => {
  await page.goto('/curriculum/programs-and-algorithms');
  await expect(page.locator('a[rel="prev"]')).toHaveCount(0);
  await expect(page.locator('a[rel="next"]')).toHaveAttribute('href', '/curriculum/variables-and-types');
  await expect(page.getByText('這是起點，不需要先修課程。')).toBeVisible();
  await page.locator('a[rel="next"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('變數與資料型別');
  await expect(page.getByRole('complementary', { name: '建議先完成' }).getByRole('link')).toHaveText('F01 程式與演算法入門');
  await page.goto('/curriculum/foundations-challenge');
  await expect(page.locator('a[rel="next"]')).toHaveAttribute('href', '/curriculum/data-structures-overview');
  await page.goto('/curriculum/algorithms-challenge');
  await expect(page.locator('a[rel="next"]')).toHaveCount(0);
  // An advanced lesson opens directly, without its prerequisites done.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('演算法島綜合試煉');
});

test('進度資料：無法讀取的舊資料先備份；較新版本的資料不被覆寫', async ({ page }) => {
  await page.goto('/curriculum');
  await page.evaluate(() => localStorage.setItem('logic-island.progress', '{broken'));
  await page.goto('/curriculum/programs-and-algorithms');
  await expect(page.getByRole('region', { name: '學習進度' }).getByText('進行中')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('logic-island.progress.backup'))).toBe('{broken');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('logic-island.progress')))!)).toMatchObject({ version: 1, lessons: { F01: {} } });
  const newer = JSON.stringify({ version: 2, lessons: { F01: { kept: true } } });
  await page.evaluate(value => localStorage.setItem('logic-island.progress', value), newer);
  await page.reload();
  await expect(page.getByText('此瀏覽器的進度由較新版本的網站儲存')).toBeVisible();
  await page.getByRole('button', { name: '我已讀完本課內容' }).click();
  expect(await page.evaluate(() => localStorage.getItem('logic-island.progress'))).toBe(newer);
});

test('無障礙：每個按鈕、連結與輸入都有名稱；標題只有一個 h1；練習標明沒有線上評測', async ({ page }) => {
  for (const slug of [COMPLETE[0], COMPLETE[4], 'for-loops', 'recursion-basics', 'complexity-basics', 'foundations-challenge', 'basic-sorting', ...STRUCTURE_PAGES]) {
    await page.goto(`/curriculum/${slug}`);
    await expect(page.locator('h1')).toHaveCount(1);
    const unnamed = await page.locator('main').evaluate(main => [...main.querySelectorAll('button, a[href], input, select, [role="tab"]')]
      .filter(el => !(el.getAttribute('aria-label') || el.textContent?.trim() || (el.id && main.querySelector(`label[for="${el.id}"]`)) || el.closest('label')))
      .map(el => el.outerHTML.slice(0, 80)));
    expect(unnamed, slug).toEqual([]);
  }
  await page.goto(`/curriculum/${COMPLETE[2]}`);
  await expect(page.getByRole('note').filter({ hasText: '目前沒有線上評測' })).toBeVisible();
  for (const fieldset of await quiz(page).locator('fieldset').all()) await expect(fieldset.locator('legend')).not.toBeEmpty();
});

test('既有教材不變：/learn 仍是六份互動教材，並連到課綱', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.locator('a.course-card')).toHaveCount(6);
  await page.getByRole('link', { name: /查看 60 堂完整課綱/ }).click();
  await expect(page).toHaveURL(/\/curriculum$/);
  await page.goto('/learn/array');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Array');
  await page.goto('/visualize');
  await expect(page.getByRole('link', { name: /查看 60 堂完整課綱/ })).toHaveCount(0);
});

/*
 * Phase E.2: the shared trace (loops, arrays, call stack), the compound-condition view, complexity and challenge
 * stages. Every state is also written out in words, not only shown by colour.
 */
test('迴圈視覺化（F07）：每一輪的條件與次數，條件不成立時說明迴圈結束', async ({ page }) => {
  await page.goto('/curriculum/for-loops');
  const viz = page.locator('#visualization');
  await expect(viz.getByText('步驟 1／9')).toBeVisible();
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText(/for i 第 1 輪/).first()).toBeVisible();
  await expect(viz.getByText('成立，繼續')).toBeVisible();
  for (let i = 0; i < 6; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText(/第 4 輪/).first()).toBeVisible();
  await expect(viz.getByText('不成立，結束迴圈')).toBeVisible();
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.locator('pre').last()).toHaveText('6');
});

test('巢狀迴圈視覺化（F09）：同時顯示外層與內層的輪次', async ({ page }) => {
  await page.goto('/curriculum/nested-loops');
  const viz = page.locator('#visualization');
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText(/外層 i 第 1 輪/).first()).toBeVisible();
  await expect(viz.getByText(/內層 j 第 1 輪/).first()).toBeVisible();
});

test('陣列與字串視覺化（F10）：讀取的格子以文字標示，越界時說明範圍', async ({ page }) => {
  await page.goto('/curriculum/string-basics');
  const viz = page.locator('#visualization');
  for (let i = 0; i < 2; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.locator('td[data-mark="read"]')).toHaveCount(2);
  await expect(viz.getByText('讀取', { exact: true }).first()).toBeVisible();
  for (let i = 0; i < 2; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText('越界：索引 5 不在 0～4 之內')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('複合條件（F06）：短路略過的比較以文字標示', async ({ page }) => {
  await page.goto('/curriculum/logical-operators');
  const viz = page.locator('#visualization');
  await viz.getByRole('spinbutton').fill('8');
  await expect(viz.locator('[aria-live]')).toContainText('輸出 半票');
  // age = 8: in "age < 12 || age >= 65" the right side is never computed.
  await expect(viz.getByText('短路，未計算')).toBeVisible();
  await viz.getByRole('spinbutton').fill('30');
  await expect(viz.locator('[aria-live]')).toContainText('輸出 全票');
});


test('函式呼叫視覺化（F13）：呼叫時堆疊多一層並標示執行中與等待中，return 後消失', async ({ page }) => {
  await page.goto('/curriculum/functions');
  const viz = page.locator('#visualization');
  await expect(viz.getByText('呼叫堆疊（1 層，最上面正在執行）')).toBeVisible();
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText('呼叫堆疊（2 層，最上面正在執行）')).toBeVisible();
  await expect(viz.getByText('（執行中）')).toHaveCount(1);
  await expect(viz.getByText('（等待中）')).toHaveCount(1);
  for (let i = 0; i < 2; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText(/回傳 9/)).toBeVisible();
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText('呼叫堆疊（1 層，最上面正在執行）')).toBeVisible();
});

test('二維陣列視覺化（F12）：列與行的索引，以及越界的鄰居以文字說明', async ({ page }) => {
  await page.goto('/curriculum/two-dimensional-arrays');
  const viz = page.locator('#visualization');
  await expect(viz.locator('figcaption')).toHaveText('g：3 列 × 3 行');
  for (let i = 0; i < 2; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText(/越界：索引 \[-1\]\[0\]/)).toBeVisible();
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.locator('td[data-mark="read"]')).toContainText('4');
});

test('遞迴視覺化（F18）：堆疊長到終止條件，再一層層回傳', async ({ page }) => {
  await page.goto('/curriculum/recursion-basics');
  const viz = page.locator('#visualization');
  for (let i = 0; i < 3; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText('呼叫堆疊（4 層，最上面正在執行）')).toBeVisible();
  await expect(viz.locator('[class*="frameName"]').filter({ hasText: '回傳 1' })).toBeVisible();
  for (let i = 0; i < 3; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText('呼叫堆疊（1 層，最上面正在執行）')).toBeVisible();
  await expect(viz.locator('pre').last()).toHaveText('6');
});

test('複雜度示意模型（F19）：標明是公式計算的次數，不是實測時間', async ({ page }) => {
  await page.goto('/curriculum/complexity-basics');
  const viz = page.locator('#visualization');
  await expect(viz.getByRole('note')).toContainText('不是實際執行時間的量測');
  await viz.getByRole('spinbutton').fill('10');
  const quadratic = viz.getByRole('listitem').filter({ hasText: 'O(n²)' });
  await expect(quadratic).toContainText('100 次');
  await expect(viz.locator('[aria-live]')).toContainText('n = 10 時，最多的是 O(n²)：100 次');
});

test('綜合挑戰（F20）：逐階段前進，每階段列出用到的課程', async ({ page }) => {
  await page.goto('/curriculum/foundations-challenge');
  const viz = page.locator('#visualization');
  await expect(viz.getByRole('heading', { name: '階段 1：讀入與驗證' })).toBeVisible();
  await expect(viz.getByText('F05 條件判斷')).toBeVisible();
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByRole('heading', { name: '階段 2：計算總分與各科最高' })).toBeVisible();
  await expect(viz.getByText('✓ 完成')).toHaveCount(1);
});

test('新教材的進度（F13）：全對＋讀完才完成，重新整理後保留', async ({ page }) => {
  await page.goto('/curriculum/functions');
  const questions = quiz(page).locator('fieldset');
  const count = await questions.count();
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole('radio').first().check();
  await quiz(page).getByRole('button', { name: '提交答案' }).click();
  const right = await questions.evaluateAll(sets => sets.map(set => [...set.querySelectorAll('label')].findIndex(l => l.getAttribute('data-correct') === 'true')));
  await quiz(page).getByRole('button', { name: '重新作答' }).click();
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole('radio').nth(right[i]).check();
  await quiz(page).getByRole('button', { name: '提交答案' }).click();
  const progress = page.getByRole('region', { name: '學習進度' });
  await progress.getByRole('button', { name: '我已讀完本課內容' }).click();
  await expect(progress.getByText('已完成', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: '學習進度' }).getByText('已完成', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '學習進度' })).toContainText('基礎程式島：已完成 1／20 堂');
});

test('基礎程式島整體完成：20 堂都完成後，目錄與 F20 都顯示全部完成；既有進度不被覆寫', async ({ page }) => {
  await page.goto('/curriculum');
  await page.evaluate(() => {
    const at = '2026-11-01T10:00:00.000Z', lessons: Record<string, unknown> = {};
    for (let i = 1; i <= 20; i++) lessons[`F${String(i).padStart(2, '0')}`] = { startedAt: at, readAt: at, quiz: { correct: 4, total: 4, at }, completedAt: at };
    localStorage.setItem('logic-island.progress', JSON.stringify({ version: 1, lessons }));
  });
  await page.reload();
  const island = page.getByRole('region', { name: /基礎程式島/ });
  await expect(island).toContainText('基礎程式島：已完成 20／20 堂');
  await expect(island.getByText('基礎程式島全部完成！')).toBeVisible();
  await page.goto('/curriculum/foundations-challenge');
  await expect(page.getByRole('region', { name: '學習進度' }).getByText('基礎程式島全部完成！')).toBeVisible();
  // Opening the lesson again keeps the stored progress as it was.
  const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('logic-island.progress')))!);
  expect(stored.lessons.F20).toMatchObject({ completedAt: '2026-11-01T10:00:00.000Z', quiz: { correct: 4, total: 4 } });
  expect(Object.keys(stored.lessons)).toHaveLength(20);
});


test('所有完整教材：每頁都沒有水平溢出，長程式碼、樹與圖只在自己的區塊內捲動', async ({ page }) => {
  test.setTimeout(180_000);
  for (const lesson of lessons.filter(l => l.lessonStatus === 'complete')) {
    await page.goto(`/curriculum/${lesson.slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.title);
    expect(await noOverflow(page), lesson.lessonId).toBeLessThanOrEqual(0);
    // Code blocks that are wider than the screen scroll inside themselves.
    const wide = await page.locator('pre, [class*="dsScroll"], figure[class*="cells"]').evaluateAll(els => els.filter(p => p.scrollWidth > p.clientWidth + 1).map(p => getComputedStyle(p).overflowX));
    for (const overflow of wide) expect(['auto', 'scroll'], lesson.lessonId).toContain(overflow);
  }
});

// ---- E.3 data-structure visualizations ---------------------------------------------------------------------------
const viz = (page: Page) => page.locator('#visualization');
const stepper = (page: Page) => viz(page).getByRole('group', { name: /步驟控制/ }).first();

test('堆疊視覺化（D05）：逐步 push／pop，頂端以文字標示；方向鍵可切換步驟；自己試試會限制輸入範圍並說明 underflow', async ({ page }) => {
  await page.goto('/curriculum/stacks');
  const v = viz(page);
  await expect(v.getByText('堆疊與佇列（Implemented）')).toBeVisible();
  await expect(v.getByText(/步驟 1／\d+/)).toBeVisible();
  await stepper(page).getByRole('button', { name: '下一步' }).click();
  await expect(v.getByText(/步驟 2／\d+/)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(v.getByText(/步驟 3／\d+/)).toBeVisible();
  await page.keyboard.press('Home');
  await expect(v.getByText(/步驟 1／\d+/)).toBeVisible();
  await expect(v.getByRole('figure').first()).toContainText(/頂端|空的/);
  // Try it yourself: values are clamped to 0..99; popping an empty stack is an underflow that changes nothing.
  const pg = v.getByRole('region', { name: /自己試試/ });
  await pg.getByLabel('值').fill('150');
  await expect(pg.getByLabel('值')).toHaveValue('99');
  await pg.getByRole('button', { name: 'push(99)' }).click();
  await expect(pg.getByText('push 99：放到頂端，大小變成 1。')).toBeVisible();
  await pg.getByRole('button', { name: 'pop', exact: true }).click();
  await pg.getByRole('button', { name: 'pop', exact: true }).click();
  await expect(pg.getByText(/Underflow/).first()).toBeVisible();
  await pg.getByRole('button', { name: '清空' }).click();
  await expect(pg.getByText('還沒有任何操作。')).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('鏈結串列視覺化（D04）：節點、next 與 null 結尾以文字呈現；搜尋沿著節點逐一前進', async ({ page }) => {
  await page.goto('/curriculum/linked-lists');
  const v = viz(page);
  await expect(v.getByText('鏈結串列（Implemented）')).toBeVisible();
  await expect(v.getByRole('figure').first()).toContainText('null');
  await expect(v.getByRole('figure').first()).toContainText('head');
  const pg = v.getByRole('region', { name: /自己試試/ });
  for (const value of ['3', '7']) { await pg.getByLabel('值').fill(value); await pg.getByRole('button', { name: `push_back(${value})` }).click(); }
  await pg.getByLabel('值').fill('8');
  await pg.getByRole('button', { name: 'find(8)' }).click();
  await expect(pg.getByText('cur 走到 null（串列的結尾）：找不到 8。')).toBeVisible();
  await expect(pg.getByRole('figure')).toContainText('cur = null');
});

test('動態陣列視覺化（D02）：容量已滿時擴容並說明複製成本；自己試試最多 10 個元素', async ({ page }) => {
  await page.goto('/curriculum/arrays-and-dynamic-arrays');
  const v = viz(page);
  const next = stepper(page).getByRole('button', { name: '下一步' });
  while (!(await v.getByText(/容量已滿/).count()) && await next.isEnabled()) await next.click();
  await expect(v.getByText(/容量已滿.*配置容量 \d+ 的新空間/)).toBeVisible();
  await expect(v.getByRole('figure').first()).toContainText(/容量 \d+/);
  const pg = v.getByRole('region', { name: /自己試試/ });
  for (let i = 0; i < 10; i++) await pg.getByRole('button', { name: /^push_back/ }).click();
  await expect(pg.getByRole('button', { name: /^push_back/ })).toBeDisabled();
  await expect(pg.getByText('已達 10 個元素的上限，請先移除元素。')).toBeVisible();
  await expect(pg.getByRole('figure')).toContainText('長度 10、容量 16');
});

test('資料結構比較（D01）：勾選需要的操作，表格以文字標示適合／較慢並列出都適合的結構', async ({ page }) => {
  await page.goto('/curriculum/data-structures-overview');
  const v = viz(page);
  await expect(v.getByText('資料結構比較（Implemented）')).toBeVisible();
  const boxes = v.getByRole('checkbox');
  expect(await boxes.count()).toBeGreaterThanOrEqual(2);
  for (const box of await boxes.all()) if (await box.isChecked()) await box.uncheck();
  await expect(v.getByText('請至少選一項操作。')).toBeVisible();
  await expect(v.getByRole('table')).toHaveCount(0);
  await boxes.first().check();
  await expect(v.getByRole('table')).toContainText(/適合|較慢/);
  await expect(v.getByText(/這些操作都適合的結構|沒有一種結構/)).toBeVisible();
});

test('佇列與雙端佇列（D06、D07）：先進先出，兩端都能操作，空的時候以文字說明', async ({ page }) => {
  await page.goto('/curriculum/queues');
  let pg = viz(page).getByRole('region', { name: /自己試試/ });
  for (const value of ['1', '2']) { await pg.getByLabel('值').fill(value); await pg.getByRole('button', { name: `push(${value})` }).click(); }
  await pg.getByRole('button', { name: 'pop', exact: true }).click();
  await expect(pg.getByText('pop：從前端移除最早進入的 1（先進先出）。')).toBeVisible();
  await expect(pg.getByRole('figure')).toContainText('前端／尾端');
  await page.goto('/curriculum/deques');
  pg = viz(page).getByRole('region', { name: /自己試試/ });
  await pg.getByLabel('值').fill('4');
  await pg.getByRole('button', { name: 'push_back(4)' }).click();
  await pg.getByLabel('值').fill('3');
  await pg.getByRole('button', { name: 'push_front(3)' }).click();
  await expect(pg.getByRole('figure').getByRole('listitem')).toHaveText([/^3/, /^4/]);
  for (let i = 0; i < 3; i++) await pg.getByRole('button', { name: 'pop_back' }).click();
  await expect(pg.getByText(/Underflow/).first()).toBeVisible();
});

test('雜湊視覺化（D08、D10）：鍵依 hash mod m 放進桶，碰撞與重複以文字說明，只比對同一個桶', async ({ page }) => {
  await page.goto('/curriculum/hash-tables');
  const v = viz(page);
  await expect(v.getByText('雜湊表（Implemented）')).toBeVisible();
  const pg = v.getByRole('region', { name: /自己試試/ });
  for (const value of ['3', '8']) { await pg.getByLabel('值').fill(value); await pg.getByRole('button', { name: `add(${value})` }).click(); }
  await expect(pg.getByText(/hash\(8\)：8 mod 5 = 3 → 桶 3。桶 3 已經有元素（碰撞）/)).toBeVisible();
  await expect(pg.getByRole('row', { name: /桶 3/ })).toContainText('3');
  await pg.getByLabel('值').fill('13');
  await pg.getByRole('button', { name: 'contains(13)' }).click();
  await expect(pg.getByText(/只在桶 3 的串列中比對（2 個元素）：沒有 13/)).toBeVisible();
  await page.goto('/curriculum/sets');
  const set = viz(page).getByRole('region', { name: /自己試試/ });
  await set.getByLabel('值').fill('4');
  await set.getByRole('button', { name: 'add(4)' }).click();
  await set.getByRole('button', { name: 'add(4)' }).click();
  await expect(set.getByText(/4 已在集合中：集合不存重複元素/)).toBeVisible();
});

test('樹與 BST 視覺化（D13、D14）：走訪到最後輸出完整順序；BST 的插入、搜尋與刪除有文字版結構', async ({ page }) => {
  await page.goto('/curriculum/tree-traversal');
  let v = viz(page);
  await expect(v.getByText('樹的走訪（Implemented）')).toBeVisible();
  await stepper(page).getByRole('button', { name: '下一步' }).focus();
  await page.keyboard.press('End');
  // At the last step the whole visiting order has been printed.
  await expect(v.locator('[class*="vizOutput"] pre')).toHaveText(/\S+( \S+){3,}/);
  await expect(v.getByRole('list', { name: /的結構/ }).first()).toContainText('根：');
  await page.goto('/curriculum/binary-search-trees');
  v = viz(page);
  const pg = v.getByRole('region', { name: /自己試試/ });
  for (const value of ['50', '30', '70', '60']) { await pg.getByLabel('值').fill(value); await pg.getByRole('button', { name: `insert(${value})` }).click(); }
  const outline = pg.getByRole('list', { name: 'BST的結構' });
  await expect(outline).toContainText('根：50');
  await expect(outline).toContainText('左：30');
  await pg.getByLabel('值').fill('60');
  await pg.getByRole('button', { name: 'search(60)' }).click();
  await expect(pg.getByText('60 > 50：往右子樹。')).toBeVisible();
  await expect(pg.getByText('找到 60。比較次數等於所在深度 + 1。')).toBeVisible();
  await pg.getByLabel('值').fill('50');
  await pg.getByRole('button', { name: 'remove(50)' }).click();
  await expect(pg.getByText('50 有兩個孩子：找右子樹中最小的節點（後繼）來取代它。')).toBeVisible();
  await expect(outline).toContainText('根：60');
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('堆積視覺化（D15）：push 逐步上浮、pop 逐步下沉，陣列與樹同時顯示', async ({ page }) => {
  await page.goto('/curriculum/heaps-and-priority-queues');
  const pg = viz(page).getByRole('region', { name: /自己試試/ });
  for (const value of ['5', '3', '8', '1']) { await pg.getByLabel('值').fill(value); await pg.getByRole('button', { name: `push(${value})` }).click(); }
  await expect(pg.getByText(/往上浮一層/).first()).toBeVisible();
  await pg.getByRole('button', { name: 'top', exact: true }).click();
  await expect(pg.getByText('top：最小值永遠在根（索引 0）：1。O(1)。')).toBeVisible();
  await pg.getByRole('button', { name: 'pop', exact: true }).click();
  await expect(pg.getByText('pop：取出根的 1，把最後一個元素 5 搬到根。')).toBeVisible();
  await expect(pg.getByRole('figure').first()).toContainText('heap：長度 3');
  await expect(pg.getByRole('list', { name: /heap（以樹呈現）的結構/ })).toContainText('根：3');
});

test('圖與並查集視覺化（D17、D18）：鄰接串列與矩陣是圖的文字版；並查集合併、路徑壓縮與集合清單', async ({ page }) => {
  await page.goto('/curriculum/graph-representations');
  const v = viz(page);
  await expect(v.getByText('圖的走訪（Implemented）')).toBeVisible();
  await stepper(page).getByRole('button', { name: '下一步' }).focus();
  await page.keyboard.press('End');
  await expect(v.getByText('鄰接串列（adjacency list）')).toBeVisible();
  await expect(v.getByText(/鄰接矩陣（adjacency matrix）/)).toBeVisible();
  await expect(v.getByRole('figure').first()).toContainText(/有向.*圖，\d+ 個頂點、\d+ 條邊/);
  await page.goto('/curriculum/disjoint-set-union');
  const pg = viz(page).getByRole('region', { name: /自己試試/ });
  const pair = async (a: string, b: string, op: string) => { await pg.getByLabel('a', { exact: true }).fill(a); await pg.getByLabel('b', { exact: true }).fill(b); await pg.getByRole('button', { name: `${op}(${a}, ${b})` }).click(); };
  await pair('0', '1', 'union');
  await pair('2', '3', 'union');
  await pair('1', '3', 'union');
  await expect(pg.getByText(/集合：\{0, 1, 2, 3\}/)).toBeVisible();
  await pg.getByLabel('a', { exact: true }).fill('99');
  await expect(pg.getByLabel('a', { exact: true })).toHaveValue('7');
  await pair('0', '5', 'connected');
  await expect(pg.getByText(/0 與 5 的根分別是 0 與 5：不同集合/)).toBeVisible();
});

test('資料結構島的進度（D05）：全對＋讀完才完成，重新整理後保留，不改動基礎程式島的進度', async ({ page }) => {
  await page.goto('/curriculum');
  await page.evaluate(() => {
    const at = '2026-11-01T10:00:00.000Z';
    localStorage.setItem('logic-island.progress', JSON.stringify({ version: 1, lessons: { F01: { startedAt: at, readAt: at, quiz: { correct: 4, total: 4, at }, completedAt: at } } }));
  });
  await page.goto('/curriculum/stacks');
  const progress = page.getByRole('region', { name: '學習進度' });
  await expect(progress.getByText('進行中', { exact: true })).toBeVisible();
  const questions = quiz(page).locator('fieldset');
  const count = await questions.count();
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole('radio').first().check();
  await quiz(page).getByRole('button', { name: '提交答案' }).click();
  const right = await questions.evaluateAll(sets => sets.map(set => [...set.querySelectorAll('label')].findIndex(l => l.getAttribute('data-correct') === 'true')));
  await quiz(page).getByRole('button', { name: '重新作答' }).click();
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole('radio').nth(right[i]).check();
  await quiz(page).getByRole('button', { name: '提交答案' }).click();
  await progress.getByRole('button', { name: '我已讀完本課內容' }).click();
  await expect(progress.getByText('已完成', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: '學習進度' })).toContainText(`資料結構島：已完成 1／${STRUCTURE_PAGES.length} 堂`);
  const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('logic-island.progress')))!);
  expect(stored.lessons.F01).toEqual({ startedAt: '2026-11-01T10:00:00.000Z', readAt: '2026-11-01T10:00:00.000Z', quiz: { correct: 4, total: 4, at: '2026-11-01T10:00:00.000Z' }, completedAt: '2026-11-01T10:00:00.000Z' });
  expect(stored.lessons.D05.quiz).toMatchObject({ correct: count, total: count });
  // Previous / next follow the recommended order within the island.
  await expect(page.locator('a[rel="prev"]')).toHaveAttribute('href', '/curriculum/linked-lists');
  await expect(page.locator('a[rel="next"]')).toHaveAttribute('href', '/curriculum/queues');
});

test('資料結構島整體完成：20 堂都完成後，目錄與 D20 都顯示全部完成；目錄的完整教材數與資料一致', async ({ page }) => {
  await page.goto('/curriculum');
  await page.evaluate(() => {
    const at = '2026-11-01T10:00:00.000Z', lessons: Record<string, unknown> = {};
    for (let i = 1; i <= 20; i++) lessons[`D${String(i).padStart(2, '0')}`] = { startedAt: at, readAt: at, quiz: { correct: 4, total: 4, at }, completedAt: at };
    localStorage.setItem('logic-island.progress', JSON.stringify({ version: 1, lessons }));
  });
  await page.reload();
  await expect(page.getByText('完整教材', { exact: true })).toHaveCount(lessons.filter(l => l.lessonStatus === 'complete').length);
  const island = page.getByRole('region', { name: /資料結構島/ });
  await expect(island).toContainText('資料結構島：已完成 20／20 堂');
  await expect(island.getByText('資料結構島全部完成！')).toBeVisible();
  await expect(page.getByRole('region', { name: /基礎程式島/ })).toContainText('基礎程式島：已完成 0／20 堂');
  await page.goto('/curriculum/structures-challenge');
  await expect(page.getByRole('region', { name: '學習進度' }).getByText('資料結構島全部完成！')).toBeVisible();
  await expect(page.locator('a[rel="next"]')).toHaveAttribute('href', '/curriculum/algorithm-analysis');
  const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('logic-island.progress')))!);
  expect(Object.keys(stored.lessons)).toHaveLength(20);
});

// ---- E.4 algorithm visualizations ---------------------------------------------------------------------------------
const tryIt = (page: Page) => viz(page).getByRole('region', { name: /自己試試/ });
const toEnd = async (scope: ReturnType<Page['locator']>) => { await scope.getByRole('button', { name: '下一步' }).first().focus(); await scope.page().keyboard.press('End'); };

test('搜尋（A03、A04）：範圍、指標與迴圈不變量；自己試試檢查輸入並要求排序', async ({ page }) => {
  await page.goto('/curriculum/binary-search');
  const v = viz(page);
  await expect(v.getByText('陣列與字串（Implemented）')).toBeVisible();
  await expect(v.getByText(/迴圈不變量/).first()).toBeVisible();
  await stepper(page).getByRole('button', { name: '下一步' }).click();
  await expect(v.getByRole('figure').first()).toContainText(/↑.*mid/);
  const t = tryIt(page);
  await t.getByLabel('資料').fill('5, 1, 3');
  await expect(t.getByRole('alert')).toHaveText('二分搜尋需要由小到大排好的資料。');
  await t.getByLabel('資料').fill('1, 3, 5, 7, 9');
  await t.getByLabel('目標', { exact: true }).fill('7');
  await toEnd(t);
  await expect(t.getByText('找到目標 7，索引是 3。')).toBeVisible();
  await t.getByLabel('資料').fill('1, 3, 500');
  await expect(t.getByRole('alert')).toHaveText('每個數都必須是 −99 到 99 的整數。');
  await page.goto('/curriculum/linear-search');
  const l = tryIt(page);
  await l.getByLabel('資料').fill('4 8 4');
  await l.getByLabel('目標', { exact: true }).fill('6');
  await toEnd(l);
  await expect(l.getByText(/走完整個陣列都沒有 6，回傳 −1/)).toBeVisible();
});

test('排序（A05）：逐步比較與交換、最後輸出排好的陣列；自己試試使用 Bubble Sort 實驗的引擎', async ({ page }) => {
  await page.goto('/curriculum/basic-sorting');
  const v = viz(page);
  await expect(v.getByText('排序步驟（Implemented）')).toBeVisible();
  await stepper(page).getByRole('button', { name: '下一步' }).focus();
  await page.keyboard.press('End');
  const out = v.locator('[class*="vizOutput"] pre').first();
  const numbers = (await out.textContent())!.trim().split(/\s+/).map(Number);
  expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  const t = tryIt(page);
  await t.getByLabel('資料').fill('3, -2, 3, 1');
  await t.getByRole('button', { name: '下一步' }).click();
  await expect(t.getByText('比較相鄰元素 3 與 -2。')).toBeVisible();
  await toEnd(t);
  await expect(t.locator('[class*="vizOutput"] pre')).toHaveText('-2 1 3 3');
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('進階排序（A06、A07）：逐步執行到最後陣列已排好；自己試試排出正確結果（含重複與負數）', async ({ page }) => {
  for (const slug of ['merge-sort', 'quick-sort']) {
    await page.goto(`/curriculum/${slug}`);
    const v = viz(page);
    await expect(v.getByText('排序步驟（Implemented）')).toBeVisible();
    await stepper(page).getByRole('button', { name: '下一步' }).focus();
    await page.keyboard.press('End');
    const numbers = (await v.locator('[class*="vizOutput"] pre').first().textContent())!.trim().split(/\s+/).map(Number);
    expect(numbers, slug).toEqual([...numbers].sort((a, b) => a - b));
    const t = tryIt(page);
    await t.getByLabel('資料').fill('9, -4, 0, 9, 3, -4');
    await toEnd(t);
    await expect(t.locator('[class*="vizOutput"] pre')).toHaveText('-4 -4 0 3 9 9');
  }
});

test('雙指標、滑動視窗、前綴和（A08～A10）：指標與範圍以文字標示；視窗拒絕負數', async ({ page }) => {
  await page.goto('/curriculum/two-pointers');
  let t = tryIt(page);
  await t.getByLabel('資料').fill('1, 2, 4, 7, 11');
  await t.getByLabel('目標', { exact: true }).fill('11');
  await expect(t.getByRole('figure').first()).toContainText(/↑left/);
  await toEnd(t);
  await expect(t.locator('[class*="vizOutput"] pre')).toHaveText('2 3');
  await page.goto('/curriculum/sliding-window');
  t = tryIt(page);
  await t.getByLabel('資料').fill('2, -1, 3');
  await expect(t.getByRole('alert')).toContainText('只適用於非負整數');
  await t.getByLabel('資料').fill('2, 3, 1, 2, 4, 3');
  await t.getByLabel('目標和').fill('7');
  await toEnd(t);
  await expect(t.locator('[class*="vizOutput"] pre')).toHaveText('2');
  await page.goto('/curriculum/prefix-sums');
  const v = viz(page);
  await stepper(page).getByRole('button', { name: '下一步' }).click();
  await expect(v.getByRole('figure', { name: 'P' }).first()).toBeVisible();
});

test('遞迴樹與回溯（A11、A12）：呼叫樹有文字大綱，呼叫堆疊同步顯示', async ({ page }) => {
  for (const slug of ['recursion-and-divide-and-conquer', 'backtracking']) {
    await page.goto(`/curriculum/${slug}`);
    const v = viz(page);
    await expect(v.getByText('遞迴樹（Implemented）')).toBeVisible();
    for (let i = 0; i < 4; i++) await stepper(page).getByRole('button', { name: '下一步' }).click();
    await expect(v.getByRole('list', { name: /的結構/ }).first()).toContainText('根：');
    await expect(v.getByText(/呼叫堆疊（\d+ 層/)).toBeVisible();
    await page.keyboard.press('End');
    await expect(v.locator('[class*="vizOutput"] pre')).not.toBeEmpty();
  }
});

test('貪心（A13）：候選逐一標示選取或捨棄與原因', async ({ page }) => {
  await page.goto('/curriculum/greedy');
  const v = viz(page);
  await expect(v.getByText('貪心選擇（Implemented）')).toBeVisible();
  await stepper(page).getByRole('button', { name: '下一步' }).focus();
  await page.keyboard.press('End');
  const table = v.getByRole('table').filter({ has: page.locator('caption') }).last();
  await expect(table).toContainText('選取');
  await expect(table).toContainText(/捨棄/);
});

test('BFS 與 DFS（A14、A15）：佇列／堆疊、距離與父節點表；自己試試選起點，到不了的節點以文字說明', async ({ page }) => {
  await page.goto('/curriculum/breadth-first-search');
  let t = tryIt(page);
  await expect(t.getByRole('table', { name: '距離與父節點' })).toBeVisible();
  await expect(t.getByRole('figure').filter({ hasText: '佇列（frontier）' })).toBeVisible();
  await toEnd(t);
  await expect(t.getByText(/佇列空了，走訪順序/)).toBeVisible();
  const options = await t.getByLabel('起點').locator('option').allTextContents();
  await t.getByLabel('起點').selectOption(options.at(-1)!);
  await toEnd(t);
  await expect(t.getByText(new RegExp(`佇列空了，走訪順序 ${options.at(-1)}`))).toBeVisible();
  await page.goto('/curriculum/depth-first-search');
  t = tryIt(page);
  await expect(t.getByRole('figure').filter({ hasText: '堆疊' })).toBeVisible();
  await toEnd(t);
  await expect(t.getByText(/堆疊空了，拜訪順序/)).toBeVisible();
});

test('最短路徑（A16）：距離表、鬆弛與路徑還原；Dijkstra 要求非負權重', async ({ page }) => {
  await page.goto('/curriculum/shortest-paths');
  const v = viz(page);
  await expect(page.locator('main').getByText(/非負/).first()).toBeVisible();
  await stepper(page).getByRole('button', { name: '下一步' }).focus();
  await page.keyboard.press('End');
  await expect(v.getByRole('table', { name: '距離表' }).first()).toBeVisible();
  await expect(v.getByText(/沿著 parent 從 .+ 倒推回/).first()).toBeVisible();
  const t = tryIt(page);
  await toEnd(t);
  await expect(t.getByRole('table', { name: '距離表' })).toContainText('是');
});

test('動態規劃與背包（A17、A18）：表格的列與行有標籤，讀取與寫入的格子以文字標示；容量輸入受限', async ({ page }) => {
  await page.goto('/curriculum/dynamic-programming-intro');
  let v = viz(page);
  await expect(v.getByText('動態規劃表（Implemented）')).toBeVisible();
  for (let i = 0; i < 3; i++) await stepper(page).getByRole('button', { name: '下一步' }).click();
  await expect(v.getByRole('figure').filter({ hasText: '寫入' }).first()).toBeVisible();
  await page.goto('/curriculum/knapsack');
  v = viz(page);
  const t = tryIt(page);
  await t.getByLabel(/背包容量/).fill('99');
  await expect(t.getByLabel(/背包容量/)).toHaveValue('12');
  await toEnd(t);
  await expect(t.getByText(/最佳價值 dp\[\d+\]\[12\]/)).toBeVisible();
  await expect(t.getByRole('figure').first()).toContainText('w=12');
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('課綱全部完成：A20 沒有不存在的下一堂，改為回到課綱；60 堂都完成時顯示全部完成', async ({ page }) => {
  await page.goto('/curriculum/algorithms-challenge');
  await expect(page.locator('a[rel="next"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /回到課綱/ })).toHaveAttribute('href', '/curriculum');
  await expect(page.locator('a[rel="prev"]')).toHaveAttribute('href', '/curriculum/apcs-strategies');
  await page.goto('/curriculum/structures-challenge');
  await expect(page.locator('a[rel="next"]')).toHaveAttribute('href', '/curriculum/algorithm-analysis');
  await page.evaluate(() => {
    const at = '2026-11-01T10:00:00.000Z', lessons: Record<string, unknown> = {};
    for (const p of ['F', 'D', 'A']) for (let i = 1; i <= 20; i++) lessons[`${p}${String(i).padStart(2, '0')}`] = { startedAt: at, readAt: at, quiz: { correct: 5, total: 5, at }, completedAt: at };
    localStorage.setItem('logic-island.progress', JSON.stringify({ version: 1, lessons }));
  });
  await page.goto('/curriculum');
  await expect(page.getByText('完整教材', { exact: true })).toHaveCount(60);
  await expect(page.getByText('全部課程：已完成 60／60 堂')).toBeVisible();
  await expect(page.getByText('60 堂課全部完成！').first()).toBeVisible();
  await expect(page.getByRole('region', { name: /演算法島/ })).toContainText('演算法島全部完成！');
  await page.goto('/curriculum/algorithms-challenge');
  await expect(page.getByRole('region', { name: '學習進度' }).getByText('演算法島全部完成！')).toBeVisible();
  await expect(page.getByText('60 堂課全部完成！')).toBeVisible();
});
