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

test('規劃中課程：只有大綱與明確標示，沒有測驗、練習或假的互動', async ({ page }) => {
  await page.goto('/curriculum/basic-sorting');
  await expect(page.getByRole('note').filter({ hasText: '這一課還在規劃中' })).toBeVisible();
  await expect(page.getByText('規劃中 v0.1.0')).toBeVisible();
  for (const id of ['#quiz', '#exercises', '#visualization']) await expect(page.locator(id)).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '學習進度' })).toHaveCount(0);
  await expect(page.getByText(/排序步驟.*Planned/).first()).toBeVisible();
  expect(await page.locator('main .objectives li').count()).toBeGreaterThanOrEqual(3);
  // A lesson with an existing lab links to it.
  await page.goto('/curriculum/stacks');
  await page.getByRole('link', { name: /Stack · 堆疊/ }).click();
  await expect(page).toHaveURL(/\/learn\/stack$/);
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


test('完整教材（基礎程式島與資料結構島）：每頁都沒有水平溢出，長程式碼、樹與圖只在自己的區塊內捲動', async ({ page }) => {
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
const stepper = (page: Page) => viz(page).getByRole('group', { name: /步驟控制/ });

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
