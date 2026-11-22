import { expect, test } from '@playwright/test';
import { courses } from '../src/content/courses';
import { lessons } from '../src/content/curriculum/lessons';

/*
 * Phase E.5 (2026-11-02): Navigation & Learning Entry Consolidation. The header reads 探索群島／完整課綱／互動實驗島;
 * /visualize and /visualize/<slug> redirect permanently to /learn; every lab and every curriculum lesson still opens;
 * no internal link points at a page that is gone.
 */
const F01 = lessons.find(l => l.lessonId === 'F01')!;
/** A build made with LOGIC_ISLAND_P9_PROTOTYPE=1: / is the P9 world overview instead of the home map. */
const P9 = process.env.LOGIC_ISLAND_P9_PROTOTYPE === '1';
// The tool labs with a page, in registry order (P4, R7, R8, P7).
const TOOL_LABS = ['/learn/color-contrast', '/learn/flexbox-playground', '/learn/css-grid-playground', '/learn/responsive-layout', '/learn/mobile-ux', '/learn/linux-terminal'];

test('/visualize 與 /visualize/<slug> 永久轉址到 /learn，保留 slug 與查詢參數', async ({ request }) => {
  for (const [from, to] of [['/visualize', '/learn'], ['/visualize/array', '/learn/array'], ['/visualize/bfs?ref=bookmark&x=1', '/learn/bfs?ref=bookmark&x=1']]) {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(308);
    expect(res.headers().location, from).toBe(to);
  }
  // Followed, the redirect lands on the lab itself.
  const lab = await request.get('/visualize/array');
  expect(lab.status()).toBe(200);
  expect(lab.url()).toMatch(/\/learn\/array$/);
});

test('主選單：探索群島／完整課綱／互動實驗島，目前頁面標示；開始學習開啟 F01', async ({ page }, info) => {
  for (const [path, active] of [['/', '探索群島'], ['/curriculum', '完整課綱'], [`/curriculum/${F01.slug}`, '完整課綱'], ['/learn', '互動實驗島'], ['/learn/stack', '互動實驗島']]) {
    await page.goto(path);
    const menu = page.getByRole('navigation', { name: '主選單' });
    // 2026-11-12: a build with the trial system (LOGIC_ISLAND_TRIALS=1) adds 模擬考試 to the header.
    await expect(menu.getByRole('link')).toHaveText(['探索群島', '完整課綱', '互動實驗島', ...process.env.LOGIC_ISLAND_TRIALS === '1' ? ['模擬考試'] : []]);
    await expect(menu.locator('a.active'), path).toHaveText(active);
  }
  const start = page.getByRole('banner').getByRole('link', { name: /開始學習/, includeHidden: true });
  await expect(start).toHaveAttribute('href', `/curriculum/${F01.slug}`);
  // Phones hide 開始學習 (an existing header rule), so only the desktop clicks it.
  if (info.project.name.startsWith('desktop')) await start.click(); else await page.goto(`/curriculum/${F01.slug}`);
  await expect(page).toHaveURL(`/curriculum/${F01.slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(F01.title);
});

test('互動實驗島列出六個實驗；實驗頁沒有模式切換，麵包屑回到互動實驗島', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('互動實驗島');
  await expect(page).toHaveTitle(/^互動實驗島 \| Logic Island$/);
  // Multi-archipelago v2 (P4): the six algorithm labs, plus the tool labs that are open; planned ones are not links.
  await expect(page.locator('a.course-card:not([data-kind])')).toHaveCount(6);
  // R7: open tool labs are links, the planned ones cards without a link; P7 adds the Linux Terminal Simulator.
  // R8: the open tool labs, in registry order (CSS Grid from R8.1).
  expect(await page.locator('a.course-card[data-kind="tool"]').evaluateAll(as => as.map(a => a.getAttribute('href')))).toEqual(TOOL_LABS);
  await expect(page.locator('.course-card[data-status="planned"]').first()).toBeVisible();
  await expect(page.locator('a.course-card[data-status="planned"]')).toHaveCount(0);
  await page.goto('/learn/array');
  await expect(page.getByRole('link', { name: /專注互動實驗|閱讀完整教材/ })).toHaveCount(0);
  // Lab code tabs read C++, Java, Python, JavaScript (2026-11-02).
  await expect(page.getByRole('group', { name: '程式語言' }).getByRole('button')).toHaveText(['C++', 'Java', 'Python', 'JavaScript']);
  await page.locator('.breadcrumbs').getByRole('link', { name: '互動實驗島' }).click();
  await expect(page).toHaveURL('/learn');
});

test('完整課綱開頭的簡介：Think · Visualize · Code，從 F01 開始或先到互動實驗島', async ({ page }) => {
  await page.goto('/curriculum');
  const approach = page.getByRole('region', { name: /Think · Visualize · Code/ });
  await expect(approach.getByRole('listitem')).toHaveCount(3);
  await expect(page.locator('.hero, .hero-world')).toHaveCount(0);
  await approach.getByRole('link', { name: /先到互動實驗島/ }).click();
  await expect(page).toHaveURL('/learn');
  await page.goto('/curriculum');
  await page.getByRole('region', { name: /Think · Visualize · Code/ }).getByRole('link', { name: new RegExp(`從 F01`) }).click();
  await expect(page).toHaveURL(`/curriculum/${F01.slug}`);
});

test('404 頁指向完整課綱與互動實驗島', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.locator('main').getByRole('link', { name: /完整課綱/ })).toHaveAttribute('href', '/curriculum');
  await expect(page.locator('main').getByRole('link', { name: /互動實驗島/ })).toHaveAttribute('href', '/learn');
});

test('六個實驗與所有課綱頁（含資料庫應用島已開放的課）都能開啟，頁面內的站內連結沒有失效', async ({ page, request }, info) => {
  test.skip(!info.project.name.startsWith('desktop'), 'Same pages on both projects; one pass is enough.');
  test.setTimeout(240_000);
  // P4, R7: the open tool labs are crawled too (/learn/color-contrast, /learn/flexbox-playground); P7 adds /learn/linux-terminal.
  // R6: and the region overviews (P6 adds sys).
  const pages = ['/', '/learn', '/curriculum', ...['cs', 'ai', 'design', 'web', 'sys'].map(r => `/regions/${r}`), ...courses.map(c => `/learn/${c.slug}`), ...TOOL_LABS, ...lessons.map(l => `/curriculum/${l.slug}`)];
  expect(pages).toHaveLength(3 + 5 + courses.length + TOOL_LABS.length + lessons.length);
  const links = new Set<string>();
  for (const path of pages) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    for (const href of await page.locator('a[href^="/"]').evaluateAll(as => as.map(a => a.getAttribute('href')!)))
      links.add(href.split('#')[0]);
  }
  // No internal link may lead to /visualize (now only a redirect) or to a page that does not exist.
  expect([...links].filter(href => href.startsWith('/visualize'))).toEqual([]);
  const broken: string[] = [];
  for (const href of links) if (href && !pages.includes(href)) {
    const res = await request.get(href, { maxRedirects: 0 });
    if (res.status() !== 200) broken.push(`${href} → ${res.status()}`);
  }
  expect(broken).toEqual([]);
});

// 2026-11-12 unified sidebar: the tree opens the way to the current lesson, the island card leads back to its 3D island,
// and on phones the menu is a drawer that Escape closes.
test('側欄：目前課程所在的島與難度自動展開並標示，島嶼卡片回到 3D 島嶼；手機版是可用 Escape 關閉的抽屜', async ({ page }, info) => {
  const D10 = lessons.find(l => l.lessonId === 'D10')!;
  await page.goto(`/curriculum/${D10.slug}`);
  const sidebar = page.locator('#site-sidebar');
  if (info.project.name.startsWith('mobile')) {
    await expect(sidebar).toBeHidden();
    await page.getByRole('button', { name: '選單' }).click();
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole('button', { name: '關閉導覽選單' })).toBeFocused();
  }
  const tree = sidebar.getByRole('navigation', { name: '學習群島目錄' });
  await expect(tree.getByRole('button', { name: /資料結構島/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(tree.getByRole('button', { name: /基礎程式島/ })).toHaveAttribute('aria-expanded', 'false');
  // Multi-archipelago v2: the lesson's region opens with it; the other three regions stay closed.
  await expect(tree.getByRole('button', { name: /^程式與資訊群島/ })).toHaveAttribute('aria-expanded', 'true');
  for (const region of ['AI 人工智慧群島', '數位設計群島', '網頁與應用開發群島'])
    await expect(tree.getByRole('button', { name: new RegExp(`^${region}`) })).toHaveAttribute('aria-expanded', 'false');
  await expect(tree.locator('a[aria-current="page"]')).toHaveAttribute('href', `/curriculum/${D10.slug}`);
  // Never all 80 at once: only the open level's lessons are listed.
  expect(await tree.locator('a[href^="/curriculum/"]').count()).toBeLessThan(20);
  await expect(sidebar.getByRole('link', { name: '在 3D 世界中查看' })).toHaveAttribute('href', '/?island=structures');
  await expect(sidebar.getByText('島嶼 · 程式與資訊群島')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '麵包屑' })).toHaveText(/探索群島.*程式與資訊群島.*資料結構島.*D10/);
  if (info.project.name.startsWith('mobile')) {
    await page.keyboard.press('Escape');
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole('button', { name: '選單' })).toBeFocused();
  }
  await page.goto('/?island=structures');
  await expect(page.getByRole('navigation', { name: '主選單' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('island')).toBe('structures');
});

// Multi-archipelago v2 (P2): every planned lesson is shown as 規劃中 and never linked, in the sidebar and on /curriculum.
test('規劃中的群島與課程看得到但不能點：側欄停用列與完整課綱的大綱都沒有連結', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('desktop'), 'Same data on both projects.');
  await page.goto('/curriculum');
  await expect(page.getByRole('navigation', { name: '五大群島' }).getByRole('link')).toHaveCount(5);
  const ai = page.locator('#region-ai');
  await expect(ai.locator('#region-ai-title')).toContainText('AI 人工智慧群島');
  // AIF-1 (2026-11-22): AI 基礎島 is open, so the region lists its card and lessons, then its six planned islands.
  await expect(ai.locator('article')).toHaveCount(7);
  await expect(ai.getByRole('heading', { level: 2, name: /^AI 基礎島/ })).toBeVisible();
  await expect(ai.locator('details a')).toHaveCount(0);
  const tree = page.locator('#site-sidebar').getByRole('navigation', { name: '學習群島目錄' });
  await tree.getByRole('button', { name: /^AI 人工智慧群島/ }).click();
  await tree.getByRole('button', { name: /^生成式 AI 與大型語言模型/ }).click();
  await tree.getByRole('button', { name: /^大型語言模型島/ }).click();
  const rows = tree.locator('[aria-disabled="true"]');
  await expect(rows).toHaveCount(25);
  await expect(tree.locator('a[href*="prompt-engineering"]')).toHaveCount(0);
  expect((await page.request.get('/curriculum/prompt-engineering')).status()).toBe(404);
});

// Multi-archipelago v2 (P4): 色彩與無障礙實驗室 computes WCAG ratios as the learner types, and its fix passes.
test('色彩與無障礙實驗室：輸入顏色即時判定 AA／AAA，套用建議色後通過', async ({ page }) => {
  await page.goto('/learn/color-contrast');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('色彩與無障礙實驗室');
  const verdict = page.locator('[aria-live="polite"]');
  await expect(verdict).toContainText('對比率 2.67：1');
  await expect(verdict).toContainText('AA 未通過');
  const text = page.getByRole('textbox', { name: '文字顏色', exact: true });
  await text.fill('#767676');
  await expect(verdict).toContainText('對比率 4.54：1');
  await expect(verdict).toContainText('AA 通過');
  await text.fill('#9e9e9e');
  await page.getByRole('button', { name: /^套用 #/ }).first().click();
  await expect(verdict).toContainText('AA 通過');
  // Large text: 24px passes AA at 3:1.
  await text.fill('#949494');
  await page.getByRole('slider', { name: /^字級/ }).fill('24');
  await expect(verdict).toContainText('大型文字');
  await expect(verdict).toContainText('AA 通過');
  // The lessons that will use it are listed as planned, never linked.
  const lessons = page.getByRole('region', { name: '使用這個實驗的課程' });
  await expect(lessons.getByText('UI10')).toBeVisible();
  await expect(lessons.getByRole('link')).toHaveCount(0);
});

// P7: Linux Terminal Simulator. Commands run on a virtual file system in the page; a task completes from the result,
// permissions are enforced for the non-root learner, and a reset restores the starting machine.
test('Linux Terminal Simulator：指令改變虛擬檔案系統、任務依結果完成、權限有效、可重設', async ({ page }) => {
  await page.goto('/learn/linux-terminal');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Linux Terminal Simulator');
  const input = page.getByRole('textbox', { name: /^輸入指令/ });
  const screen = page.getByRole('log', { name: '終端機輸出' });
  const tasks = page.getByRole('region', { name: /完成 \d+／7/ });
  await expect(tasks.getByRole('heading', { level: 2 })).toContainText('完成 0／7');
  await input.fill('mkdir projects');
  await input.press('Enter');
  await input.fill('cd projects');
  await input.press('Enter');
  await expect(input).toHaveAccessibleName('輸入指令（目前位置 ~/projects）');
  await input.fill('echo "hello" > notes.txt');
  await input.press('Enter');
  await input.fill('cat notes.txt');
  await input.press('Enter');
  await expect(screen).toContainText('hello');
  await expect(tasks.getByRole('heading', { level: 2 })).toContainText('完成 2／7');
  await input.fill('cat /etc/shadow');
  await input.press('Enter');
  await expect(screen).toContainText('cat: /etc/shadow: Permission denied');
  await input.fill('ls | grep a');
  await input.press('Enter');
  await expect(screen).toContainText('不支援');
  // History: ↑ brings the last command back.
  await input.press('ArrowUp');
  await expect(input).toHaveValue('ls | grep a');
  await page.getByRole('button', { name: '重設環境' }).click();
  await expect(tasks.getByRole('heading', { level: 2 })).toContainText('完成 0／7');
  await expect(page.getByLabel('家目錄的檔案樹，含權限與目前位置')).not.toContainText('projects');
  // The lessons that use it: LNX-1 published LNX02, now a link to its page; the planned ones stay unlinked text.
  const lessons = page.getByRole('region', { name: '使用這個實驗的課程' });
  await expect(lessons.getByText('LNX02')).toBeVisible();
  await expect(lessons.getByRole('link', { name: /終端機與 Shell 基礎/ })).toHaveAttribute('href', '/curriculum/terminal-and-shell-basics');
  for (const href of await lessons.getByRole('link').evaluateAll(links => links.map(a => a.getAttribute('href') ?? '')))
    expect((await page.request.get(href)).status(), href).toBe(200);
});

// R6: AI 人工智慧群島 has a way in from the home map, /curriculum and the sidebar; its overview shows the seven islands
// under their three groups, every one 規劃中, and links to no lesson.
test('AI 群島入口：首頁「更多學習群島」→ 群島總覽，七座島三個主題，AI 基礎島全部開放、其餘六座規劃中；側欄標示目前群島', async ({ page }, info) => {
  const phone = info.project.name.startsWith('mobile');
  await page.goto('/');
  if (P9) {
    // P9.8b: in a build with LOGIC_ISLAND_P9_PROTOTYPE=1, / is the P9 world overview, whose guide is the home page's way
    // in to each archipelago (its P9 region page); the archipelago overview below is the same page in both builds.
    const entry = page.locator('[data-region-entry="ai"]');
    await expect(entry).toHaveAttribute('href', '/ai');
    await expect(entry).toContainText('AI 人工智慧群島');
    await page.goto('/regions/ai');
  } else {
    const more = page.getByRole('navigation', { name: '更多學習群島' });
    if (!await more.isVisible()) await page.getByRole('button', { name: /清單/ }).first().click();
    await expect(more.getByRole('link')).toHaveCount(4); // ai, design, web and (P6) sys
    // AIF-1 (2026-11-22): the AI foundations island opened its first five lessons; AIF-2 to AIF-5 the other fifteen.
    await expect(more.getByRole('link', { name: /AI 人工智慧群島/ })).toContainText('已開放 20／160 堂');
    await more.getByRole('link', { name: /AI 人工智慧群島/ }).click();
  }
  await expect(page).toHaveURL('/regions/ai');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI 人工智慧群島');
  const main = page.locator('main');
  for (const group of ['AI 原理與模型', '生成式 AI 與大型語言模型', 'AI 應用與系統工程']) await expect(main.getByRole('heading', { level: 2, name: new RegExp(`^${group}`) })).toBeVisible();
  await expect(main.locator('article')).toHaveCount(7);
  // AIF-5: the complete island's card says 已開放 (部分開放 before AIF20) and leads to its syllabus; each planned card's own tag says 規劃中 (its folded
  // outline marks every lesson 規劃中 as well: 140 more). No card links a lesson page directly.
  await expect(main.getByRole('article', { name: /AI 基礎島/ })).toContainText('已開放');
  await expect(main.getByRole('article', { name: /AI 基礎島/ })).not.toContainText('部分開放');
  await expect(main.getByRole('article', { name: /AI 基礎島/ }).getByRole('link')).toHaveAttribute('href', '/curriculum#island-ai-foundations');
  await expect(main.locator('article > div:first-child').getByText('規劃中', { exact: true })).toHaveCount(6);
  await expect(main.locator('article details').getByText('規劃中', { exact: true })).toHaveCount(140);
  await expect(main.locator('a[href^="/curriculum/"]')).toHaveCount(0);
  // The learning paths through the region, path J (AI 架構) among them, still 規劃中.
  const paths = main.locator('section[aria-labelledby="region-paths"] li');
  await expect(paths).toHaveCount(3);
  // A path's length is lessons to take, never lessons written: the open and planned counts are spelled out (R7).
  await expect(paths.filter({ hasText: 'AI 架構' })).toContainText('路線共 66 堂 · 已開放 20 堂 · 其餘 46 堂規劃中');
  await page.goto('/regions/web');
  await expect(page.locator('section[aria-labelledby="region-paths"] li')).toHaveText([/前端工程.*路線共 62 堂 · 已開放 11 堂 · 其餘 51 堂規劃中/]);
  await page.goto('/regions/ai');
  await expect(page.getByRole('navigation', { name: '麵包屑' })).toHaveText(/探索群島.*五大群島.*AI 人工智慧群島/);
  const sidebar = page.locator('#site-sidebar');
  if (phone) { await page.getByRole('button', { name: '選單' }).click(); await expect(sidebar).toBeVisible(); }
  const tree = sidebar.getByRole('navigation', { name: '學習群島目錄' });
  await expect(tree.getByRole('button', { name: /^AI 人工智慧群島/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(tree.locator('a[aria-current="page"]')).toHaveAttribute('href', '/regions/ai');
  if (phone) { await page.keyboard.press('Escape'); await expect(sidebar).toBeHidden(); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // /curriculum leads there too, and an unknown region is a 404.
  await page.goto('/curriculum');
  await expect(page.locator('#region-ai').getByRole('link', { name: 'AI 人工智慧群島總覽' })).toHaveAttribute('href', '/regions/ai');
  expect((await page.request.get('/regions/labs')).status()).toBe(404);
});

// R7: Flexbox Playground — the preview is a real flex container that follows the controls, and the CSS matches it.
test('Flexbox Playground：調整屬性後預覽與 CSS 同步，預設版面可一鍵套用，課程列為規劃中', async ({ page }) => {
  await page.goto('/learn/flexbox-playground');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Flexbox Playground');
  const preview = page.getByTestId('flex-preview'), css = page.locator('pre code');
  await expect(preview.locator('> div')).toHaveCount(4);
  await page.getByLabel('justify-content').selectOption('space-between');
  await page.getByLabel('align-items').selectOption('center');
  await expect(preview).toHaveCSS('justify-content', 'space-between');
  await expect(css).toContainText('justify-content: space-between;');
  await expect(css).toContainText('align-items: center;');
  // The reading list (the copy button has its own status region, R8).
  await expect(page.locator('ul[aria-live="polite"]')).toContainText('頭尾貼齊');
  await page.getByLabel('flex-direction').selectOption('column');
  await expect(preview).toHaveCSS('flex-direction', 'column');
  await expect(page.locator('ul[aria-live="polite"]')).toContainText('主軸是垂直方向');
  await page.getByRole('button', { name: '卡片換行' }).click();
  await expect(preview.locator('> div')).toHaveCount(7);
  await expect(css).toContainText('flex-wrap: wrap;');
  await page.getByLabel('flex-grow: 1 的項目').selectOption('2');
  await expect(preview.locator('> div').nth(1)).toHaveCSS('flex-grow', '1');
  await expect(css).toContainText('.item:nth-child(2)');
  const lessons = page.getByRole('region', { name: '使用這個實驗的課程' });
  await expect(lessons.getByText('RWD03')).toBeVisible();
  await expect(lessons.locator('a')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// R8.1: CSS Grid Playground — typed tracks reach the real grid only when valid; placements and presets follow.
test('CSS Grid Playground：輸入軌道與位置即時套用到真實格線，錯誤值標示且不套用，預設版面與 CSS 同步', async ({ page }) => {
  await page.goto('/learn/css-grid-playground');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('CSS Grid Playground');
  const preview = page.getByTestId('grid-preview'), css = page.locator('pre code'), cols = page.getByLabel('grid-template-columns');
  await expect(preview.locator('> div')).toHaveCount(6);
  await cols.fill('200px 1fr');
  await expect(preview).toHaveCSS('grid-template-columns', /^200px \d+(\.\d+)?px$/);
  await expect(css).toContainText('grid-template-columns: 200px 1fr;');
  // A half-typed value is flagged and the last valid one stays applied.
  await cols.fill('200px 1f');
  await expect(cols).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('看不懂這個值')).toBeVisible();
  await expect(css).toContainText('grid-template-columns: 200px 1fr;');
  await cols.fill('repeat(3, 1fr)');
  await expect(cols).toHaveAttribute('aria-invalid', 'false');
  await page.getByLabel('grid-column').fill('span 2');
  await expect(preview.locator('> div').first()).toHaveCSS('grid-column-start', 'span 2');
  await expect(css).toContainText('.item:nth-child(1) {\n  grid-column: span 2;');
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(css).toContainText('grid-template-rows: auto 1fr 1fr;');
  await expect(preview.locator('> div').first()).toHaveCSS('grid-column-end', '-1');
  await expect(page.locator('ul[aria-live="polite"]')).toContainText('第 2 個項目：列從第 2 條線到第 4 條線');
  await page.getByRole('checkbox', { name: '列與欄分開設定間距' }).check();
  await page.getByRole('slider').nth(1).fill('24');
  await expect(css).toContainText('column-gap: 24px;');
  // 複製 CSS puts exactly the shown code on the clipboard, and says so.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '複製 CSS' }).click();
  await expect(page.getByRole('status')).toHaveText('已複製到剪貼簿。');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await css.textContent());
  const lessons = page.getByRole('region', { name: '使用這個實驗的課程' });
  await expect(lessons.getByText('RWD05')).toBeVisible();
  await expect(lessons.locator('a')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// R8.2: Responsive Layout Simulator — the frame is really that wide, so the browser applies the media queries.
test('Responsive Layout Simulator：預覽框以真實寬度套用媒體查詢，斷點可調，頁面不水平溢出', async ({ page }) => {
  await page.goto('/learn/responsive-layout');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Responsive Layout Simulator');
  const frame = page.frameLocator('[data-testid="rwd-frame"]'), queries = page.getByRole('list', { name: '媒體查詢' }).getByRole('listitem');
  const columns = async () => (await frame.locator('.cards').evaluate(e => getComputedStyle(e).gridTemplateColumns)).split(' ').length;
  // Mobile: base rules only, one column.
  await expect(page.getByTestId('rwd-frame')).toHaveAttribute('title', /寬 375px/);
  expect(await frame.locator('.page').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(1);
  expect(await columns()).toBe(1);
  await expect(queries).toHaveText([/768px.*未套用/, /1024px.*未套用/]);
  // Tablet: min-width 768 applies (inclusive), two columns.
  await page.getByRole('button', { name: /^Tablet/ }).click();
  await expect(page.getByRole('button', { name: /^Tablet/ })).toHaveAttribute('aria-pressed', 'true');
  // The frame's viewport is exactly the width shown (a border once made it 2px narrower, just under the breakpoint).
  await expect.poll(() => frame.locator('html').evaluate(() => innerWidth)).toBe(768);
  await expect.poll(columns).toBe(2);
  await expect(queries).toHaveText([/768px.*套用中/, /1024px.*未套用/]);
  // Desktop: the page has three columns and the cards three.
  await page.getByRole('button', { name: /^Desktop/ }).click();
  await expect.poll(() => frame.locator('.page').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(3);
  // A custom width just under a moved breakpoint falls back to the tier below.
  await page.getByRole('slider', { name: /平板斷點/ }).fill('800');
  await page.getByLabel('自訂寬度（px）').fill('799');
  await expect.poll(columns).toBe(1);
  await expect(page.locator('pre code')).toContainText('@media (min-width: 800px)');
  await expect(page.locator('ul[aria-live="polite"]')).toContainText('視窗寬度 799px：手機');
  // Card layout at 1280: four columns.
  await page.getByRole('button', { name: '卡片列表' }).click();
  await page.getByRole('button', { name: /^Desktop/ }).click();
  await expect.poll(columns).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const lessons = page.getByRole('region', { name: '使用這個實驗的課程' });
  await expect(lessons.getByText('RWD01')).toBeVisible();
  await expect(lessons.locator('a')).toHaveCount(0);
});

// R8.3: Mobile Navigation Simulator — four working patterns, operated by keyboard, with measured touch targets.
test('Mobile Navigation Simulator：四種模式可切換操作，鍵盤、焦點與 ARIA 正確，觸控目標實測至少 48px', async ({ page }) => {
  await page.goto('/learn/mobile-ux');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mobile Navigation Simulator');
  const phone = page.getByTestId('phone'), touch = page.getByText(/^觸控目標：/);
  // Bottom navigation: the current page is aria-current, not only a colour.
  const bottom = phone.getByRole('navigation', { name: '主要導覽' });
  await bottom.getByRole('button', { name: '課程' }).click();
  await expect(bottom.getByRole('button', { name: '課程' })).toHaveAttribute('aria-current', 'page');
  await expect(phone.getByRole('heading', { level: 3 })).toHaveText('課程');
  await expect(touch).toContainText('達到建議的 48×48');
  // Drawer: a modal that takes focus, keeps Tab inside, closes on Escape and gives focus back.
  await page.getByRole('button', { name: 'Navigation Drawer' }).click();
  const opener = phone.getByRole('button', { name: '導覽', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(opener).toHaveAttribute('aria-expanded', 'true');
  const dialog = phone.getByRole('dialog', { name: '導覽', exact: true });
  await expect(dialog.getByRole('button', { name: '關閉導覽' })).toBeFocused();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '關閉導覽' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '我的' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(opener).toHaveAttribute('aria-expanded', 'false');
  await opener.click();
  await phone.getByRole('dialog').getByRole('button', { name: '搜尋' }).click();
  await expect(phone.getByRole('heading', { level: 3 })).toHaveText('搜尋');
  await expect(opener).toBeFocused();
  // Tabs: roving tabindex — arrows move selection and focus, Home and End jump.
  await page.getByRole('button', { name: 'Tabs', exact: true }).click();
  const tablist = phone.getByRole('tablist', { name: '課程分頁' });
  await tablist.getByRole('tab', { name: '課程內容' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tablist.getByRole('tab', { name: '討論' })).toBeFocused();
  await expect(tablist.getByRole('tab', { name: '討論' })).toHaveAttribute('aria-selected', 'true');
  await expect(phone.getByRole('tabpanel')).toHaveAccessibleName('討論');
  await page.keyboard.press('End');
  await expect(tablist.getByRole('tab', { name: '作業' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tablist.getByRole('tab', { name: '課程內容' })).toHaveAttribute('aria-selected', 'true');
  await expect(tablist.locator('[tabindex="0"]')).toHaveCount(1);
  // Hamburger: a disclosure that Escape collapses, returning focus to its button.
  await page.getByRole('button', { name: 'Hamburger Menu' }).click();
  const menuButton = phone.getByRole('button', { name: '選單' });
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await phone.getByRole('navigation', { name: '網站選單' }).getByRole('button', { name: '我的' }).focus();
  await page.keyboard.press('Escape');
  await expect(phone.getByRole('navigation', { name: '網站選單' })).toHaveCount(0);
  await expect(menuButton).toBeFocused();
  await expect(touch).toContainText('達到建議的 48×48');
  await expect(page.getByRole('heading', { name: /Hamburger Menu：什麼時候用/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const lessons = page.getByRole('region', { name: '使用這個實驗的課程' });
  await expect(lessons.getByText('MOB02')).toBeVisible();
  await expect(lessons.locator('a')).toHaveCount(0);
});
