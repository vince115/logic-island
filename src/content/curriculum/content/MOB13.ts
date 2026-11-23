import type { WebExample, WebExercise, WebRoute, WebStep, WebViewport } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB13 The mobile apps capstone (MOB-3): the made-up 小島外送 as an installable, offline-capable web app, built in five
 * stages that each use the lessons before them: navigation and reach (a tab bar with aria-current, the primary action
 * in a bar right above it, both clear of the gesture bar: MOB01, MOB02, MOB06), touch and forms (44 × 44 targets with
 * a gap, a checkout form that asks for the right keyboards, lets the browser fill and has defaults: MOB03, MOB05),
 * installable (the manifest, read by MOB08's inspector, which is carried here as fixed code and unchanged), offline
 * (sw.js: a precached shell, network-first for the menu with a cached and then a precached fallback, an update that
 * cleans old caches and keeps the data cache: MOB09 on engine stage W10) and accessibility with performance (names
 * for icon controls, a status region, polling that ends: MOB10, MOB11). Each example is a finished slice of another
 * screen of the same app; each exercise asks for the stage on the menu page (or the checkout form); later stages keep
 * the earlier results in their fixed files. The last section is what no page can check: the record of a test on the
 * learner's own phone (MOB11's script, MOB12's matrix and report).
 *
 * Stand-ins, each named as one in the text: the safe area is read through --safe-bottom and a "模擬裝置" script or a
 * variant's <html style> sets it (MOB06); the manifest is a text in script.js read by the inspector (MOB08); the service
 * worker is the course's pretend one (MOB09), with the corrections of the brief's "part 2" and the lead's later note
 * (a used body fails the page's fetch, respondWith belongs to the listener's own turn, no registration while offline);
 * document.visibilityState is the `page` object of MOB10 in the one example that pauses polling.
 * Adapted from the suggested stages: the head links of stage 3 are shown and observed in that stage's example and are
 * carried as fixed markup in the exercises, because the inspector has to live in the fixed index.html (see the report).
 */

const lines = (...text: string[]) => text.join('\n');
const indent = (text: string[], by = '  ') => text.map(l => (l ? by + l : l));
const PHONE: WebViewport = { width: 360, height: 640 };
const shown = (items: string[]) => items.join('、');

// ---- the app's pages ----------------------------------------------------------------------------------------------
const LINK_MANIFEST = '<link rel="manifest" href="manifest.webmanifest">';
const META_THEME = '<meta name="theme-color" content="#d35400">';
const LINK_TOUCH_ICON = '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">';

/** A whole document of 小島外送. `install` adds the head lines of stage 3; `rootStyle` is a variant's stand-in device. */
const doc = (o: { title: string; body: string[]; install?: boolean; rootStyle?: string }) => lines(
  '<!DOCTYPE html>',
  `<html lang="zh-Hant"${o.rootStyle ? ` style="${o.rootStyle}"` : ''}>`,
  '<head>',
  '  <meta charset="utf-8">',
  '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  `  <title>${o.title}｜小島外送</title>`,
  ...(o.install ? indent([LINK_MANIFEST, META_THEME, LINK_TOUCH_ICON]) : []),
  '</head>',
  '<body>',
  ...o.body,
  '</body>',
  '</html>',
);

const TABS: [href: string, text: string][] = [['/', '首頁'], ['/menu/', '菜單'], ['/orders/', '訂單'], ['/me/', '我的']];
const tabBar = (current: string) => [
  '<nav id="tabs" aria-label="主要功能">',
  ...TABS.map(([href, text]) => `  <a href="${href}"${text === current ? ' aria-current="page"' : ''}>${text}</a>`),
  '</nav>',
];
const DISHES: [string, number][] = [['海鮮便當', 120], ['烤魚定食', 150], ['椒麻雞飯', 110], ['滷肉飯', 60], ['蛤蜊麵', 130], ['海藻湯', 40], ['魚丸湯', 45], ['燙青菜', 40], ['芒果冰', 70], ['冬瓜檸檬', 35]];
const HOME_PICKS = ['本週新菜：海膽丼', '人氣第一：海鮮便當', '今日特價：烤魚定食', '下雨天：蛤蜊麵', '清爽：海葡萄沙拉', '暖胃：魚丸湯', '飯後：芒果冰', '飲料：冬瓜檸檬', '素食：燙青菜', '兒童餐：滷肉飯'];

const MENU_NAV_BODY = [
  '<header id="top">',
  '  <h1>今日菜單</h1>',
  '</header>',
  '<main>',
  '  <ul id="list">',
  ...DISHES.map(([name, price]) => `    <li>${name}<span>${price} 元</span></li>`),
  '  </ul>',
  '</main>',
  '<div id="bar">',
  '  <a class="action" id="cart" href="/cart/">查看購物車（2 件）</a>',
  '</div>',
  ...tabBar('菜單'),
];
const HOME_NAV_BODY = [
  '<header id="top">',
  '  <h1>小島外送</h1>',
  '</header>',
  '<main>',
  '  <ul id="list">',
  ...HOME_PICKS.map(text => `    <li>${text}</li>`),
  '  </ul>',
  '</main>',
  '<div id="bar">',
  '  <a class="action" id="cart" href="/cart/">查看購物車（1 件）</a>',
  '</div>',
  ...tabBar('首頁'),
];

// ---- style.css of the app, stage by stage ---------------------------------------------------------------------------
const APP_BASE = [
  ':root {',
  '  /* 下方的安全區域：手機上由瀏覽器提供；預覽不是手機，得到的是 0px */',
  '  --safe-bottom: env(safe-area-inset-bottom, 0px);',
  '}',
  'body { margin: 0; font-family: system-ui, sans-serif; color: #2d3436; }',
  '#top { display: flex; align-items: center; justify-content: space-between; height: 48px; padding: 0 16px; background-color: #d35400; color: #ffffff; }',
  '#top h1 { margin: 0; font-size: 20px; }',
  '#list { margin: 0; padding: 0 16px; list-style: none; }',
  '#list li { display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; height: 56px; border-bottom: 1px solid #dfe6e9; }',
];
const ACTION_CSS = '.action { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 100%; height: 48px; border: 0; border-radius: 8px; background-color: #2d3436; color: #ffffff; font: inherit; font-weight: bold; text-decoration: none; }';

/** Stage 1: the four places the exercise asks for. `current` is a whole rule (the learner writes its selector). */
const navCss = (o: { main: string[]; bar: string[]; tabs: string[]; link: string[]; current: string[]; done?: boolean }) => [
  ...(o.done ? ['/* ── 第一關：導覽與可及範圍（已完成） ── */'] : []),
  o.done ? '/* 內容的最後讓出兩條固定列的高度 */' : '/* 一、內容的最後要讓出兩條固定列的高度，最後一道菜才不會被蓋住 */',
  'main {',
  ...o.main,
  '}',
  '',
  o.done ? '/* 操作列：固定在分頁列的正上方 */' : '/* 二、操作列（高 64px）：固定在分頁列的正上方，左右和視窗一樣寬 */',
  '#bar {',
  ...o.bar,
  '  box-sizing: border-box;',
  '  height: 64px;',
  '  padding: 8px 16px;',
  '  background-color: #ffffff;',
  '  box-shadow: 0 -1px 0 #b2bec3;',
  '}',
  ACTION_CSS,
  '',
  o.done ? '/* 分頁列：固定在視窗底部，連結留在手勢列的上方 */' : '/* 三、分頁列：固定在視窗底部、和視窗一樣寬；四個連結平分寬度，並留在手勢列的上方 */',
  '#tabs {',
  ...o.tabs,
  '  background-color: #ffffff;',
  '  box-shadow: 0 -1px 0 #b2bec3;',
  '}',
  '#tabs a {',
  ...o.link,
  '  display: flex;',
  '  align-items: center;',
  '  justify-content: center;',
  '  height: 56px;',
  '  color: #2d3436;',
  '  text-decoration: none;',
  '}',
  '',
  o.done ? '/* 目前所在的分頁：樣式跟著 aria-current */' : '/* 四、目前所在的分頁：粗體（再加上你喜歡的顏色） */',
  ...o.current,
];
const MAIN_DONE = ['  padding-bottom: calc(120px + var(--safe-bottom));'];
const BAR_DONE = ['  position: fixed;', '  left: 0;', '  right: 0;', '  bottom: calc(56px + var(--safe-bottom));'];
const TABS_DONE = ['  position: fixed;', '  left: 0;', '  right: 0;', '  bottom: 0;', '  display: flex;', '  padding-bottom: var(--safe-bottom);'];
const LINK_DONE = ['  flex: 1;'];
const CURRENT_DONE = ['#tabs a[aria-current="page"] {', '  font-weight: bold;', '  color: #a04000;', '  box-shadow: inset 0 3px 0 #a04000;', '}'];
const navStageCss = (o: { main: string[]; bar: string[]; tabs: string[]; link: string[]; current: string[] }) => lines(...APP_BASE, '', ...navCss(o));
const NAV_DONE = navCss({ main: MAIN_DONE, bar: BAR_DONE, tabs: TABS_DONE, link: LINK_DONE, current: CURRENT_DONE, done: true });

/** Stage 2's result as later stages carry it: 44 × 44 icon buttons with room between them. */
const TOUCH_DONE = [
  '/* ── 第二關：觸控目標（已完成） ── */',
  '.icon, .add { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; padding: 0; border: 0; border-radius: 8px; background-color: transparent; color: inherit; }',
  '.add { margin-left: 8px; background-color: #ffeaa7; }',
  '.icon svg, .add svg { width: 24px; height: 24px; fill: currentColor; }',
];
const CONTENT_CSS = [
  '/* 內容區 */',
  'main p { margin: 0; padding: 8px 16px; }',
  'main button.text { min-height: 44px; margin-right: 8px; padding: 0 12px; font: inherit; }',
  '#out, #status { min-height: 24px; background-color: #f1f2f6; }',
  '#notice { background-color: #ffeaa7; }',
  '.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }',
];
const APP_CSS = lines(...APP_BASE, '', ...NAV_DONE, '', ...TOUCH_DONE, '', ...CONTENT_CSS);

/** The stand-in device of MOB06, for the bottom inset only: a toggle that writes --safe-bottom on <html> and draws the band. */
const DEVICE_JS = lines(
  '// 模擬裝置：預覽不是手機，由這份指令稿扮演「有手勢列的手機」。',
  '// 真的手機上不需要它：--safe-bottom 的值來自瀏覽器的 env()。34px 只是例子的值。',
  'const root = document.documentElement;',
  '',
  '// 半透明的色帶：畫出手勢列佔用的範圍',
  "const band = document.createElement('div');",
  "band.id = 'unsafe';",
  "band.style.cssText = 'position: fixed; left: 0; right: 0; bottom: 0; z-index: 8; height: 0; pointer-events: none; background-color: rgba(0, 0, 0, 0.45);';",
  '',
  "const toggle = document.createElement('button');",
  "toggle.id = 'simulate';",
  "toggle.type = 'button';",
  "toggle.textContent = '模擬：有手勢列的手機';",
  "toggle.setAttribute('aria-pressed', 'false');",
  "toggle.style.cssText = 'position: fixed; left: 50%; top: 50%; z-index: 9; transform: translateX(-50%); min-height: 44px;';",
  'document.body.append(band, toggle);',
  '',
  "toggle.addEventListener('click', () => {",
  "  const on = toggle.getAttribute('aria-pressed') !== 'true';",
  "  toggle.setAttribute('aria-pressed', String(on));",
  "  if (on) root.style.setProperty('--safe-bottom', '34px');",
  "  else root.style.removeProperty('--safe-bottom');",
  "  band.style.height = on ? '34px' : '0';",
  '});',
);

// ---- icons ----------------------------------------------------------------------------------------------------------
const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 104.5 10l5 5 1.5-1.5-5-5A6 6 0 0010 4zm0 2a4 4 0 110 8 4 4 0 010-8z"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17v3h3l10-10-3-3zm12-12l3 3 1.5-1.5-3-3z"/></svg>';
const ICON_REFRESH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2l5 4-5 4V7a5 5 0 105 5h2a7 7 0 11-7-7z"/></svg>';

// ---- stage 1: the example (訂單頁) ------------------------------------------------------------------------------------
const ordersNav: WebExample = {
  id: 'mob13-orders-nav', title: '第一關的成果：訂單頁的分頁列與操作列',
  description: '小島外送的訂單頁在第一關完成時的樣子。四個目的地在視窗底部的分頁列 `#tabs` 裡，目前的「訂單」有 `aria-current="page"`；這一頁最主要的操作「聯絡外送員」在分頁列正上方的操作列 `#bar` 裡。頁面中間的「模擬」按鈕是 script.js 加上的替身，扮演一支下方有 34px 手勢列的手機（例子的值）。',
  viewport: PHONE,
  widths: [360, 412, 768],
  height: 560,
  files: {
    html: doc({
      title: '訂單進度',
      body: [
        '<header id="top">',
        '  <h1>訂單進度</h1>',
        '</header>',
        '<main>',
        '  <ol id="list">',
        '    <li>店家已接單<span>11:02</span></li>',
        '    <li>餐點製作中<span>11:05</span></li>',
        '    <li>外送員已取餐<span>11:20</span></li>',
        '    <li>外送中<span>大約 10 分鐘</span></li>',
        '  </ol>',
        '</main>',
        '<div id="bar">',
        '  <button type="button" class="action" id="call">聯絡外送員</button>',
        '</div>',
        ...tabBar('訂單'),
      ],
    }),
    css: lines(...APP_BASE, '', ...NAV_DONE),
    js: DEVICE_JS,
  },
  observe: [
    { check: 'name', selector: '#tabs a[aria-current="page"]', text: '訂單', label: '分頁列裡標著 `aria-current="page"` 的連結是「訂單」：畫面上的粗體與螢幕閱讀器聽到的「目前頁面」來自同一個屬性' },
    { check: 'box', selector: '#call', measure: 'bottom', value: 576, from: ':viewport', label: '視窗 360 × 640：「聯絡外送員」的下緣在 576px，離視窗底部 64px，就在分頁列的正上方' },
    { do: 'click', selector: '#simulate' },
    { check: 'box', selector: '#tabs a:nth-child(1)', measure: 'bottom', value: 606, from: ':viewport', label: '按下「模擬」（下方 34px 是手勢列）：分頁列的連結往上讓，下緣在 606px' },
    { check: 'box', selector: '#tabs', measure: 'bottom', value: 640, from: ':viewport', label: '分頁列本身仍然貼著視窗底部：讓出去的是內距，背景照樣鋪到螢幕邊緣' },
    { check: 'box', selector: '#bar', measure: 'bottom', value: 0, from: '#tabs', label: '操作列跟著往上移：它的下緣仍然接在分頁列的上緣' },
  ],
};

// ---- stage 1: the exercise (菜單頁) -----------------------------------------------------------------------------------
const NAV_SLOT = { main: [] as string[], bar: [] as string[], tabs: [] as string[], link: [] as string[], current: [] as string[] };
const lastDishClear = (label: string): WebStep[] => [
  { do: 'scroll', selector: ':page', top: 9999 },
  { check: 'box', selector: '#list li:last-child', measure: 'bottom', value: 0, op: 'max', from: '#bar', label },
];

const exNav: WebExercise = {
  id: 'mob13-x-nav', title: '第一關：分頁列、操作列與手勢列',
  statement: 'index.html 與 script.js 不能改（script.js 是「安全區域、方向與動態視窗高度」那一課的模擬裝置：預覽中間的按鈕把 `--safe-bottom` 換成 34px）。這是小島外送的菜單頁：十道菜的清單 `#list`，後面是操作列 `#bar`（裡面是「查看購物車」`#cart`）與分頁列 `#tabs`（四個連結，「菜單」已經有 `aria-current="page"`）。現在兩條列只是跟在清單後面。請完成 style.css 標出的四處：（一）`main` 的最後留出兩條列的高度，捲到最底時，最後一道菜整列都在操作列的上方。（二）`#bar` 固定在分頁列的正上方，左右和視窗一樣寬。（三）`#tabs` 固定在視窗底部、和視窗一樣寬；四個連結平分寬度；在下方有手勢列的手機上，連結要整個留在手勢列的上方，分頁列的背景仍然鋪到螢幕的下緣。（四）目前所在的分頁用粗體，樣式要跟著 `aria-current` 屬性走，不能寫死是第幾個連結。下方的安全區域一律用開頭準備好的 `var(--safe-bottom)` 讀取。檢查在 360 × 640 的視窗進行：先量沒有安全區域的畫面；另一份檢查換成首頁（目前的分頁是「首頁」），並把 `--safe-bottom` 設成 34px（例子的值）。',
  hints: [
    '先做（三）：固定定位的元素要說明它貼著視窗的哪幾邊；`display: flex` 加上連結的 `flex: 1` 讓四個連結平分寬度。連結高 56px 已經寫好，分頁列只要在下方多留一段和安全區域一樣大的內距。',
    '操作列要貼在分頁列的上面，而分頁列有多高？56px 的連結加上 `var(--safe-bottom)` 的內距。所以 `#bar` 的 `bottom` 不是固定的數字，要用 `calc()` 把兩者加起來；`main` 要讓出的高度還要再加上操作列的 64px。',
    '`#tabs { position: fixed; left: 0; right: 0; bottom: 0; display: flex; padding-bottom: var(--safe-bottom); }`、`#tabs a { flex: 1; }`、`#bar { position: fixed; left: 0; right: 0; bottom: calc(56px + var(--safe-bottom)); }`、`main { padding-bottom: calc(120px + var(--safe-bottom)); }`，最後加一條 `#tabs a[aria-current="page"] { font-weight: bold; }`。',
  ],
  explanation: '分頁列用 `position: fixed` 與 `bottom: 0` 貼著視窗底部，`left: 0` 與 `right: 0` 把它拉到和視窗一樣寬；`display: flex` 加上每個連結的 `flex: 1` 讓四個目的地平分 360px，各 90px。`padding-bottom: var(--safe-bottom)` 是「安全區域、方向與動態視窗高度」那一課的做法：分頁列的背景仍然鋪到螢幕邊緣，56px 高的連結則被內距推到手勢列的上方。分頁列因此會長高，所以其他兩處都要跟著它算：操作列的 `bottom` 是 `calc(56px + var(--safe-bottom))`，內容要讓出的是 64 + 56 = 120px 再加上安全區域。三個地方讀的是同一個自訂屬性，安全區域是 0px 還是 34px，它們都接得剛剛好。目前的分頁寫成屬性選擇器 `[aria-current="page"]`：同一份樣式表用在首頁、訂單頁，粗體會自己跟著那個屬性移到對的連結上。',
  viewport: PHONE,
  widths: [360, 412, 768],
  height: 560,
  fixed: { html: doc({ title: '菜單', body: MENU_NAV_BODY }), js: DEVICE_JS },
  starter: { css: navStageCss(NAV_SLOT) },
  solution: { css: navStageCss({ main: MAIN_DONE, bar: BAR_DONE, tabs: TABS_DONE, link: LINK_DONE, current: ['#tabs a[aria-current="page"] {', '  font-weight: bold;', '  color: #a04000;', '}'] }) },
  steps: [
    { check: 'box', selector: '#tabs', measure: 'bottom', value: 640, from: ':viewport', label: '視窗 360 × 640：分頁列 `#tabs` 的下緣貼著視窗的底部' },
    { check: 'box', selector: '#tabs a:nth-child(4)', measure: 'left', value: 270, from: ':viewport', label: '分頁列和視窗一樣寬，四個連結平分：第四個連結從 270px 的地方開始' },
    { check: 'style', selector: '#tabs a[aria-current="page"]', property: 'font-weight', value: ['700', 'bold'], label: '標著 `aria-current="page"` 的連結（這一頁是「菜單」）是粗體' },
    { check: 'box', selector: '#bar', measure: 'bottom', value: 0, from: '#tabs', label: '操作列 `#bar` 的下緣接在分頁列的上緣：兩條列沒有重疊，也沒有空隙' },
    { check: 'box', selector: '#cart', measure: 'width', value: 328, label: '操作列和視窗一樣寬：「查看購物車」`#cart` 寬 360 − 32 = 328px' },
    ...lastDishClear('捲到頁面最底：最後一道菜的下緣不低於操作列的上緣，沒有被蓋住'),
  ],
  variants: [
    {
      title: '同一份 style.css 用在首頁（目前的分頁是「首頁」），手機下方有 34px 的手勢列',
      fixed: { html: doc({ title: '首頁', body: HOME_NAV_BODY, rootStyle: '--safe-bottom: 34px;' }) },
      steps: [
        { check: 'box', selector: '#tabs a:nth-child(1)', measure: 'bottom', value: 606, from: ':viewport', label: '分頁列的連結整個在手勢列的上方：下緣在 606px' },
        { check: 'box', selector: '#tabs', measure: 'bottom', value: 640, from: ':viewport', label: '分頁列的背景仍然鋪到螢幕的下緣' },
        { check: 'style', selector: '#tabs a[aria-current="page"]', property: 'font-weight', value: ['700', 'bold'], label: '粗體跟著 `aria-current` 移到「首頁」' },
        { check: 'box', selector: '#bar', measure: 'bottom', value: 0, from: '#tabs', label: '操作列跟著分頁列往上移，仍然接在它的上緣' },
        ...lastDishClear('捲到最底：最後一列沒有被操作列蓋住'),
      ],
    },
  ],
  mistakes: [
    {
      files: { css: navStageCss({ main: MAIN_DONE, bar: BAR_DONE, tabs: TABS_DONE, link: LINK_DONE, current: ['#tabs a:nth-child(2) {', '  font-weight: bold;', '  color: #a04000;', '}'] }) },
      why: '目前的分頁寫成 `#tabs a:nth-child(2)`。菜單頁上它剛好是第二個連結，看起來沒問題；同一份樣式表拿到首頁或訂單頁，粗體卻還停在「菜單」上：畫面說你在菜單頁，`aria-current` 說你在別頁。樣式要寫在 `[aria-current="page"]` 上，換頁時只要搬動那個屬性。',
    },
    {
      files: { css: navStageCss({ main: ['  padding-bottom: 120px;'], bar: ['  position: fixed;', '  left: 0;', '  right: 0;', '  bottom: 56px;'], tabs: TABS_DONE, link: LINK_DONE, current: CURRENT_DONE }) },
      why: '分頁列讓出了安全區域，操作列與內容卻用固定的數字：`bottom: 56px` 與 `padding-bottom: 120px`。沒有手勢列的螢幕上一切正常；有 34px 手勢列的手機上，分頁列長高成 90px，操作列卻還停在離底部 56px 的地方：它下面的 34px 和分頁列疊在一起，「查看購物車」的下半部被蓋住。跟著分頁列走的數字，都要把 `var(--safe-bottom)` 一起算進去。',
    },
    {
      files: { css: navStageCss({ main: [], bar: BAR_DONE, tabs: TABS_DONE, link: LINK_DONE, current: CURRENT_DONE }) },
      why: '兩條列都固定好了，卻沒有替內容留位置。固定定位的元素不佔版面：這一頁的內容比視窗短，根本捲不動，最後一道菜整列、倒數第二道的大半，永遠壓在操作列與分頁列的下面。`main` 的最後要留出和兩條列一樣高的內距。',
    },
    {
      files: { css: navStageCss({ main: MAIN_DONE, bar: BAR_DONE, tabs: ['  position: fixed;', '  bottom: 0;', '  display: flex;', '  padding-bottom: var(--safe-bottom);'], link: LINK_DONE, current: CURRENT_DONE }) },
      why: '分頁列只寫了 `bottom: 0`，沒有 `left` 與 `right`。固定定位的元素沒有被指定寬度時，只會和內容一樣寬：四個連結擠在左下角，各自只有兩個字那麼寬，拇指很難按準。',
    },
  ],
};

// ---- stage 2: the example (我的資料) ----------------------------------------------------------------------------------
const FORM_BASE = [
  'body { margin: 0; font-family: system-ui, sans-serif; color: #2d3436; }',
  '#top { display: flex; align-items: center; height: 48px; padding: 0 16px; background-color: #d35400; color: #ffffff; }',
  '#top h1 { margin: 0; font-size: 20px; }',
  'form { display: grid; gap: 4px; padding: 8px 16px 24px; }',
  'form > label { margin-top: 8px; }',
  'input, textarea, button { box-sizing: border-box; font: inherit; font-size: 16px; }',
  'input:not([type="radio"]), textarea { width: 100%; min-height: 48px; padding: 8px 12px; }',
  '',
  '/* 一組選項：每個選項一列，整列都可以點 */',
  'fieldset { margin: 8px 0 0; padding: 0 12px; }',
  'fieldset label { display: flex; align-items: center; gap: 12px; min-height: 48px; }',
  'form > button { min-height: 48px; margin-top: 16px; border: 0; border-radius: 8px; background-color: #2d3436; color: #ffffff; font-weight: bold; }',
];

const profileForm: WebExample = {
  id: 'mob13-profile-form', title: '第二關的成果：「我的」頁面的聯絡資料',
  description: '小島外送「我的」頁面裡的表單。電子郵件與簡訊驗證碼各自說明要哪一種鍵盤、可以由誰代填；通知方式是預先選好的選項；常用地址旁的兩顆圖示按鈕，外框是 44 × 44，中間隔 8px。用手機開啟這一頁，依序點每個欄位，看鍵盤怎麼變。',
  viewport: PHONE,
  widths: [360, 412],
  files: {
    html: lines(
      '<header id="top">',
      '  <h1>我的資料</h1>',
      '</header>',
      '<form id="profile">',
      '  <label for="email">電子郵件</label>',
      '  <input id="email" name="email" type="email" autocomplete="email" required>',
      '',
      '  <label for="code">簡訊驗證碼（6 碼）</label>',
      '  <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" required>',
      '',
      '  <fieldset>',
      '    <legend>訂單進度的通知方式</legend>',
      '    <label><input type="radio" name="notify" value="sms" checked> 簡訊</label>',
      '    <label><input type="radio" name="notify" value="email"> 電子郵件</label>',
      '  </fieldset>',
      '',
      '  <div class="address">',
      '    <span>常用地址：港口路 12 號</span>',
      `    <button type="button" class="icon" id="edit" aria-label="編輯常用地址">${ICON_EDIT}</button>`,
      `    <button type="button" class="icon" id="more" aria-label="新增一個地址">${ICON_PLUS}</button>`,
      '  </div>',
      '',
      '  <button>儲存</button>',
      '</form>',
    ),
    css: lines(
      ...FORM_BASE,
      '',
      '/* 圖示按鈕：圖示 24px，外框至少 44 × 44，兩顆之間隔 8px */',
      '.address { display: flex; align-items: center; gap: 8px; margin-top: 8px; }',
      '.address span { flex: 1; }',
      '.icon {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  min-width: 44px;',
      '  min-height: 44px;',
      '  padding: 0;',
      '}',
      '.icon svg { width: 24px; height: 24px; fill: currentColor; }',
    ),
  },
  observe: [
    { check: 'attr', selector: '#code', name: 'inputmode', value: 'numeric', label: '驗證碼 `#code` 是一般的文字欄位，用 `inputmode="numeric"` 要求只有數字的鍵盤：它是一串數字，不是數量' },
    { check: 'attr', selector: '#code', name: 'autocomplete', value: 'one-time-code', label: '`#code` 的 `autocomplete` 是 `one-time-code`：支援的手機可以把簡訊裡的驗證碼帶進來' },
    { check: 'value', selector: 'input[name="notify"][value="sms"]', value: true, label: '通知方式預先選好「簡訊」：使用者什麼都不點，也有一個合理的答案' },
    { check: 'box', selector: '#edit', measure: 'width', value: 44, op: 'min', label: '「編輯常用地址」`#edit` 的外框至少 44px 寬（圖示本身只有 24px）' },
    { check: 'box', selector: '#edit', measure: 'right', value: -8, op: 'max', from: '#more', label: '`#edit` 的右緣和旁邊 `#more` 的左緣至少相隔 8px' },
  ],
};

// ---- stage 2: the exercise (結帳) -------------------------------------------------------------------------------------
const checkoutHtml = (o: { tel: string; address: string; taxid: string; cash: string; card: string }) => lines(
  '<header id="top">',
  '  <h1>結帳</h1>',
  '</header>',
  '<form id="checkout">',
  '  <label for="name">收件人</label>',
  '  <input id="name" name="name" autocomplete="name" required>',
  '',
  '  <label for="tel">手機號碼</label>',
  `  <input id="tel" name="tel"${o.tel} required>`,
  '',
  '  <label for="address">外送地址</label>',
  `  <textarea id="address" name="address" rows="2"${o.address} required></textarea>`,
  '',
  '  <label for="taxid">統一編號（選填，8 碼）</label>',
  `  <input id="taxid" name="taxid"${o.taxid}>`,
  '',
  '  <div class="qty">',
  '    <label for="qty">海鮮便當的份數</label>',
  '    <input id="qty" name="qty" type="number" min="1" max="9" value="1">',
  '    <button type="button" class="step" id="minus" aria-label="減少一份">−</button>',
  '    <button type="button" class="step" id="plus" aria-label="增加一份">＋</button>',
  '  </div>',
  '',
  '  <fieldset>',
  '    <legend>付款方式</legend>',
  `    <label><input type="radio" name="pay"${o.cash}> 貨到付現</label>`,
  `    <label><input type="radio" name="pay"${o.card}> 刷卡</label>`,
  '  </fieldset>',
  '',
  '  <button id="send">送出訂單</button>',
  '</form>',
);
const CHECKOUT_OLD = { tel: ' type="text"', address: '', taxid: ' type="number"', cash: '', card: '' };
const CHECKOUT_DONE = { tel: ' type="tel" autocomplete="tel"', address: ' autocomplete="street-address"', taxid: ' type="text" inputmode="numeric"', cash: ' value="cash" checked', card: ' value="card"' };
const checkoutCss = (qty: string[], step: string[]) => lines(
  ...FORM_BASE,
  '',
  '/* 份數：標籤、數字，與加、減兩顆按鈕排成一列 */',
  '.qty {',
  '  display: flex;',
  '  align-items: center;',
  '  margin-top: 8px;',
  ...qty,
  '}',
  '.qty label { flex: 1; }',
  '#qty { width: 64px; min-height: 44px; text-align: center; }',
  '',
  '/* 加、減按鈕 */',
  '.step {',
  ...step,
  '  padding: 0;',
  '  font-weight: bold;',
  '}',
);
const STEP_OLD = ['  width: 28px;', '  height: 28px;'];
const STEP_DONE = ['  min-width: 44px;', '  min-height: 44px;'];
const CHECKOUT_JS = lines(
  "const form = document.querySelector('#checkout');",
  "const qty = document.querySelector('#qty');",
  '',
  '// 份數的加、減按鈕：stepUp() 與 stepDown() 會停在 min 與 max',
  "document.querySelector('#minus').addEventListener('click', () => qty.stepDown());",
  "document.querySelector('#plus').addEventListener('click', () => qty.stepUp());",
  '',
  '// 回訪的顧客：把上次送出時記住的三項資料填回來',
  "const remembered = ['name', 'tel', 'address'];",
  'for (const key of remembered) {',
  "  const saved = localStorage.getItem('checkout-' + key);",
  '  if (saved !== null) form.elements[key].value = saved;',
  '}',
  "form.addEventListener('submit', () => {",
  '  for (const key of remembered) {',
  "    localStorage.setItem('checkout-' + key, form.elements[key].value);",
  '  }',
  '});',
);
const RETURNING = { 'checkout-name': '林小安', 'checkout-tel': '0912345678', 'checkout-address': '港口路 12 號' };

const exCheckout: WebExercise = {
  id: 'mob13-x-checkout', title: '第二關：好按的按鈕，少打字的結帳表單',
  statement: 'script.js 不能改（它讓加、減按鈕改變份數，並替回訪的顧客把上次的收件人、手機與地址填回來）。這是小島外送的結帳表單，在手機上有六個問題，請修改 index.html 與 style.css。index.html：（一）手機號碼 `#tel` 改用電話專用的 `type`，並加上電話的 `autocomplete` 記號。（二）外送地址 `#address` 加上「街道地址」的 `autocomplete` 記號。（三）統一編號 `#taxid` 是八個數字組成的編號，不是數量：不可以是 `type="number"`，改成文字欄位，再用 `inputmode` 要求只有數字的鍵盤。（四）付款方式的兩個選項各加上 `value`：貨到付現是 `cash`，刷卡是 `card`，並預先選好貨到付現。style.css：（五）加、減兩顆按鈕 `#minus` 與 `#plus` 的外框都至少 44 × 44。（六）兩顆按鈕之間至少相隔 8px。每個欄位的 `id`、`name` 與 `<label>` 請保留；份數 `#qty` 是真正的數量，維持 `type="number"`。檢查在 360px 寬的視窗讀這些屬性、量按鈕的外框。另一份檢查扮演回訪的顧客：三個欄位已經填好，他只按一下加號就送出，送出的資料必須是收件人、手機、地址、空白的統一編號、`qty=2` 與 `pay=cash`。',
  hints: [
    '鍵盤由 `type` 與 `inputmode` 決定，代填由 `autocomplete` 決定，兩件事各寫各的。電話的 `type` 與 `autocomplete` 記號剛好是同一個字；街道地址的記號是 `street-address`。',
    '統一編號寫成 `type="text" inputmode="numeric"`（值是 `numeric`，不是 `number`）。選項按鈕沒有 `value` 時，被選中送出的是 `on`；預先選好的那一個要加上 `checked`。',
    'style.css 裡，把 `.step` 的 `width: 28px; height: 28px;` 換成 `min-width: 44px; min-height: 44px;`，再替 `.qty` 加上 `gap: 8px;`。',
  ],
  explanation: '`type="tel"` 通常讓手機顯示撥號鍵盤，`autocomplete="tel"` 與 `autocomplete="street-address"` 讓瀏覽器可以用使用者存過的資料代填。統一編號是「由數字組成的一串符號」：`type="number"` 會把它當成可以加一、減一的數量，所以改成文字欄位，再用 `inputmode="numeric"` 只向手機要求數字鍵盤；份數才是真正的數量，`type="number"` 加上 `min`、`max` 用在它身上是對的。付款方式預先選好最常用的一項，使用者不必多點一下；每個選項有自己的 `value`，伺服器才分得出選了哪一個。加、減按鈕的觸控目標是外框，不是那個符號：`min-width` 與 `min-height` 把外框撐到 44 × 44，`.qty` 的 `gap` 在相鄰的外框之間留下 8px，手指偏一點也不會按到隔壁。回訪的顧客於是一個字都不用打：記住的資料填回來，預設值都有了，按一下加號就能送出。',
  viewport: PHONE,
  widths: [360, 412],
  fixed: { js: CHECKOUT_JS },
  starter: { html: checkoutHtml(CHECKOUT_OLD), css: checkoutCss([], STEP_OLD) },
  solution: { html: checkoutHtml(CHECKOUT_DONE), css: checkoutCss(['  gap: 8px;'], STEP_DONE) },
  steps: [
    { check: 'attr', selector: '#tel', name: 'type', value: 'tel', label: '手機號碼 `#tel` 用的是電話專用的 `type`' },
    { check: 'count', selector: '#taxid[type="number"]', count: 0, label: '統一編號 `#taxid` 不是 `type="number"`：它不是數量' },
    { check: 'attr', selector: '#taxid', name: 'inputmode', value: 'numeric', label: '`#taxid` 用 `inputmode` 要求只有數字的鍵盤' },
    { check: 'box', selector: '#minus', measure: 'width', value: 44, op: 'min', label: '減號按鈕 `#minus` 的外框至少 44px 寬' },
    { check: 'box', selector: '#minus', measure: 'height', value: 44, op: 'min', label: '`#minus` 的外框至少 44px 高' },
    { check: 'box', selector: '#minus', measure: 'right', value: -8, op: 'max', from: '#plus', label: '`#minus` 的右緣和 `#plus` 的左緣至少相隔 8px' },
  ],
  variants: [
    {
      title: '回訪的顧客（收件人、手機與地址已經記在裝置上）：只按一下加號就送出',
      setup: { storage: RETURNING },
      steps: [
        { check: 'box', selector: '#plus', measure: 'width', value: 44, op: 'min', label: '加號按鈕 `#plus` 的外框至少 44px 寬' },
        { check: 'box', selector: '#plus', measure: 'height', value: 44, op: 'min', label: '`#plus` 的外框至少 44px 高' },
        { check: 'attr', selector: '#tel', name: 'autocomplete', value: 'tel', match: 'includes', label: '`#tel` 有電話的 `autocomplete` 記號' },
        { check: 'attr', selector: '#address', name: 'autocomplete', value: 'street-address', match: 'includes', label: '`#address` 有街道地址的 `autocomplete` 記號' },
        { do: 'click', selector: '#plus' },
        { do: 'submit', selector: '#checkout' },
        { check: 'submitted', count: 1, data: { name: '林小安', tel: '0912345678', address: '港口路 12 號', taxid: '', qty: '2', pay: 'cash' }, label: '一個字都沒打就送得出去，而且資料完整：份數 2、付款方式 cash' },
      ],
    },
  ],
  mistakes: [
    {
      files: { html: checkoutHtml({ ...CHECKOUT_DONE, taxid: ' type="number" inputmode="numeric"' }), css: checkoutCss(['  gap: 8px;'], STEP_DONE) },
      why: '替統一編號加了 `inputmode="numeric"`，卻沒有把 `type="number"` 拿掉。鍵盤是對了，欄位仍然是數量欄位：按到方向鍵，編號就被加一、減一，旁邊還可能出現增減的小箭頭。`inputmode` 只管鍵盤，欄位的行為由 `type` 決定。',
    },
    {
      files: { html: checkoutHtml({ ...CHECKOUT_DONE, cash: ' checked', card: '' }), css: checkoutCss(['  gap: 8px;'], STEP_DONE) },
      why: '預先選好了貨到付現，兩個選項卻都沒有 `value`。沒有 `value` 的選項按鈕，被選中時送出的是 `on`：伺服器收到 `pay=on`，分不出顧客選的是付現還是刷卡。',
    },
    {
      files: { html: checkoutHtml(CHECKOUT_DONE), css: checkoutCss([], [...STEP_OLD, '  margin: 0 8px;']) },
      why: '用 `margin` 把兩顆按鈕隔開。看起來不擠了，但外距在外框的外面，點在空白上沒有任何反應：每顆按鈕點得到的仍然只有 28 × 28。要放大的是外框本身，用 `min-width` 與 `min-height`（或內距）。',
    },
  ],
};

// ---- stage 3: MOB08's inspector, carried as fixed code ---------------------------------------------------------------
/** The body of every page that reads a manifest: what the head declares, then the report's elements, script.js and the fixed inspector of MOB08 (unchanged). */
const INSPECTOR_BODY = String.raw`<h1>Manifest 檢查器</h1>
<p id="verdict"></p>
<ul id="problems"></ul>

<section id="card" aria-label="安裝預覽">
  <div id="card-bar"></div>
  <div id="card-splash"><span id="card-icon"></span></div>
  <dl>
    <dt>圖示下方的名稱</dt>
    <dd id="card-name"></dd>
    <dt>顯示模式</dt>
    <dd id="card-display"></dd>
    <dt>開啟的網址</dt>
    <dd id="card-start"></dd>
    <dt>圖示</dt>
    <dd id="card-icons"></dd>
    <dt>maskable 圖示</dt>
    <dd id="card-maskable"></dd>
  </dl>
</section>

<script src="script.js"></script>
<script>
// 固定的檢查器：這門課用它代替瀏覽器對 Manifest 的檢查。
// 假設網站是 https://food.example，Manifest 放在網站的根目錄。
const MANIFEST_URL = 'https://food.example/manifest.webmanifest';
const DISPLAY_MODES = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];

const isText = (value) => typeof value === 'string' && value.trim() !== '';
// 把 "192x192 512x512" 這種用空白分開的值拆成清單
const words = (value) => String(value).toLowerCase().split(' ');
// 圖示的用途：沒寫 purpose 就是 any
const purposeOf = (icon) => words(icon.purpose || 'any');

// 相對網址要相對於 Manifest 的網址來解析；不合法或跑到別的來源，回傳空字串
function resolve(path) {
  try {
    const url = new URL(path, MANIFEST_URL);
    return url.origin === new URL(MANIFEST_URL).origin ? url.href : '';
  } catch (error) {
    return '';
  }
}

function inspect(text) {
  const report = { problems: [], name: '', display: 'browser', startUrl: '', icons: [], theme: '', background: '' };
  const problem = (message) => report.problems.push(message);

  // 規則 1：先解析。不是合法的 JSON，後面就什麼都讀不到
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    problem('不是合法的 JSON：整份 Manifest 都不會被採用');
    return report;
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    problem('最外層必須是一個物件：{ … }');
    return report;
  }

  // 規則 2：name 與 short_name 至少要有一個；short_name 最多 12 個字元
  report.name = isText(manifest.short_name) ? manifest.short_name : isText(manifest.name) ? manifest.name : '';
  if (report.name === '') problem('需要 name 或 short_name');
  // [...文字] 把文字拆成一個一個字元
  if (isText(manifest.short_name) && [...manifest.short_name].length > 12) problem('short_name 超過 12 個字元');

  // 規則 3：要有 start_url，而且和網站同一個來源
  if (!isText(manifest.start_url)) {
    problem('需要 start_url');
  } else {
    report.startUrl = resolve(manifest.start_url);
    if (report.startUrl === '') problem('start_url 必須是和網站同一個來源的網址');
  }

  // 規則 4：display 是四個顯示模式之一。寫錯的值瀏覽器會忽略，改用 browser
  if (DISPLAY_MODES.includes(manifest.display)) report.display = manifest.display;
  else problem('display 必須是 fullscreen、standalone、minimal-ui 或 browser');

  // 規則 5：圖示要有 src；192x192 與 512x512 各要有一張 PNG，用途包含 any
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  report.icons = icons.filter((icon) => typeof icon === 'object' && icon !== null && isText(icon.src));
  for (const size of ['192x192', '512x512']) {
    const found = report.icons.some((icon) =>
      words(icon.sizes).includes(size) && icon.type === 'image/png' && purposeOf(icon).includes('any'));
    if (!found) problem('icons 需要一張 ' + size + ' 的 PNG 圖示（type 是 image/png，用途包含 any）');
  }

  // 規則 6：顏色有寫的話，必須是合法的 CSS 顏色
  const color = (member) => {
    if (!(member in manifest)) return '';
    if (CSS.supports('color', manifest[member])) return manifest[member];
    problem(member + ' 不是合法的 CSS 顏色');
    return '';
  };
  report.background = color('background_color');
  report.theme = color('theme_color');
  return report;
}

function show(report) {
  const put = (selector, text) => {
    document.querySelector(selector).textContent = text;
  };
  const count = report.problems.length;
  put('#verdict', count === 0 ? '沒有發現問題' : '發現 ' + count + ' 個問題');
  for (const message of report.problems) {
    const item = document.createElement('li');
    item.textContent = message;
    document.querySelector('#problems').append(item);
  }
  put('#card-icon', [...report.name].slice(0, 1).join(''));
  put('#card-name', report.name || '（沒有名稱）');
  put('#card-display', report.display);
  put('#card-start', report.startUrl || '（沒有設定）');
  const sizes = report.icons.map((icon) => (icon.sizes || '沒寫尺寸') + '（' + purposeOf(icon).join(' ') + '）');
  put('#card-icons', sizes.join('、') || '（沒有圖示）');
  put('#card-maskable', report.icons.some((icon) => purposeOf(icon).includes('maskable')) ? '有' : '沒有');
  // 上方色條是主題色，中間色塊是啟動畫面的背景色；沒寫或寫錯就維持灰色
  document.querySelector('#card-bar').style.backgroundColor = report.theme;
  document.querySelector('#card-splash').style.backgroundColor = report.background;
}

// script.js 如果有語法錯誤，manifestText 就不存在：當成空的文字
let text = '';
try {
  text = String(manifestText);
} catch (error) {
  text = '';
}
show(inspect(text));
</script>`;
const INSPECTOR_CSS = String.raw`body {
  margin: 0;
  padding: 12px 16px;
  font-family: system-ui, sans-serif;
}
h1 {
  margin: 0 0 8px;
  font-size: 20px;
}
#verdict {
  margin: 0 0 4px;
  font-weight: bold;
}
#problems {
  margin: 0 0 12px;
  padding-left: 20px;
  color: #b71c1c;
}
#card {
  overflow: hidden;
  border: 1px solid #b2bec3;
  border-radius: 12px;
}
#card-bar {
  height: 20px;
  background-color: #b2bec3;
}
#card-splash {
  display: grid;
  place-items: center;
  height: 88px;
  background-color: #dfe6e9;
}
#card-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background-color: #2d3436;
  color: white;
  font-size: 28px;
}
#card dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  padding: 12px;
}
#card dt {
  color: #636e72;
}
#card dd {
  margin: 0;
  overflow-wrap: anywhere;
}`;
const HEAD_REPORT = [
  '<p id="page-head"></p>',
  '<script>',
  '// 這一頁的 head 宣告了什麼：Manifest 的內容要和它對得上',
  '{',
  "  const link = document.querySelector('head link[rel=\"manifest\"]');",
  "  const theme = document.querySelector('head meta[name=\"theme-color\"]');",
  "  document.querySelector('#page-head').textContent = '這一頁的 head：連到 '",
  "    + (link ? link.getAttribute('href') : '（沒有 Manifest）') + '，主題色 ' + (theme ? theme.content : '（沒有）');",
  '}',
  '</script>',
];
const INSPECTOR_PAGE = doc({ title: '菜單', install: true, body: [...HEAD_REPORT, INSPECTOR_BODY] });
const INSPECTOR_PAGE_CSS = INSPECTOR_CSS + '\n#page-head {\n  margin: 0 0 12px;\n  padding: 8px 12px;\n  background-color: #f1f2f6;\n}';

/** script.js: the manifest as a text. `before` are script lines above it (comments); `json` is what goes between the braces. */
const manifestJs = (before: string[], json: string[]) => lines(...before, 'const manifestText = `{', ...json, '}`;');
const ICON_192 = '    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" }';
const ICON_512 = '    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }';
const ICON_MASKABLE = '    { "src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }';
const M_NAME = '  "name": "小島外送：海鮮便當送到你家",';
const M_SHORT = '  "short_name": "小島外送",';
const M_START = '  "start_url": "/menu/",';
const M_STANDALONE = '  "display": "standalone",';
const M_BACKGROUND = '  "background_color": "#ffffff",';
const M_THEME = '  "theme_color": "#d35400",';
const MANIFEST_DONE = [M_NAME, M_SHORT, M_START, M_STANDALONE, M_BACKGROUND, M_THEME, '  "icons": [', `${ICON_192},`, `${ICON_512},`, ICON_MASKABLE, '  ]'];

// ---- stage 3: the example (訂單明細頁的 head) --------------------------------------------------------------------------
const orderHead: WebExample = {
  id: 'mob13-order-head', title: '第三關的成果：每一頁的 head 都連到同一份 Manifest',
  description: '小島外送的訂單明細頁，一份完整的文件。`<head>` 裡有四行和這個專題有關：第一關的 `viewport-fit=cover`，以及 Manifest 的連結、主題色與 `apple-touch-icon`。script.js 把讀到的宣告寫在頁面上，並用最上面的色塊代替瀏覽器的工具列。這一頁不是入口，所以自己帶著一個回上一層的連結。',
  viewport: PHONE,
  files: {
    html: doc({
      title: '訂單 1024',
      install: true,
      body: [
        '<div id="toolbar">food.example（模擬的瀏覽器工具列）</div>',
        '<main>',
        '  <a id="back" href="/orders/">返回訂單列表</a>',
        '  <h1>訂單 1024</h1>',
        '  <ul>',
        '    <li>Manifest 的連結：<code id="manifest-href"></code></li>',
        '    <li>主題色：<code id="theme"></code></li>',
        '    <li>viewport 設定：<code id="viewport"></code></li>',
        '  </ul>',
        '</main>',
      ],
    }),
    css: lines(
      'body { margin: 0; font-family: system-ui, sans-serif; }',
      '#toolbar { padding: 10px 16px; background-color: #636e72; color: #ffffff; font-weight: bold; }',
      'main { padding: 0 16px; }',
      '#back { display: inline-flex; align-items: center; min-height: 44px; }',
      'h1 { margin: 0; font-size: 20px; }',
      'code { overflow-wrap: anywhere; }',
    ),
    js: lines(
      '// 讀出 head 裡和安裝有關的宣告，寫到頁面上',
      "const link = document.querySelector('head link[rel=\"manifest\"]');",
      "const theme = document.querySelector('head meta[name=\"theme-color\"]');",
      "const viewport = document.querySelector('head meta[name=\"viewport\"]');",
      '',
      "document.querySelector('#manifest-href').textContent = link ? link.getAttribute('href') : '沒有';",
      "document.querySelector('#theme').textContent = theme ? theme.content : '沒有';",
      "document.querySelector('#viewport').textContent = viewport ? viewport.content : '沒有';",
      '',
      '// 真正的瀏覽器會自己拿主題色去染工具列；這裡用最上面那一條色塊代替',
      "if (theme) document.querySelector('#toolbar').style.backgroundColor = theme.content;",
    ),
  },
  observe: [
    { check: 'attr', selector: 'head link[rel="manifest"]', name: 'href', value: 'manifest.webmanifest', label: '訂單明細頁的 `<head>` 也有 `rel="manifest"` 的 `<link>`：不是只有首頁才連到 Manifest' },
    { check: 'attr', selector: 'head meta[name="theme-color"]', name: 'content', value: '#d35400', label: '主題色寫在 `name="theme-color"` 的 `<meta>` 裡，值是 `#d35400`：Manifest 的 `theme_color` 要和它寫成同一個顏色' },
    { check: 'style', selector: '#toolbar', property: 'background-color', value: '#d35400', label: '指令稿讀到主題色，把模擬的工具列染成同一個橘色' },
    { check: 'attr', selector: 'head meta[name="viewport"]', name: 'content', value: 'viewport-fit=cover', match: 'includes', label: '第一關的 `viewport-fit=cover` 也在：安全區域的 `env()` 靠它才有意義' },
    { check: 'name', selector: '#back', text: '返回訂單列表', label: '頁面自己有「返回訂單列表」的連結：安裝成獨立視窗後，沒有瀏覽器的返回按鈕可以靠' },
  ],
};

// ---- stage 3: the exercise (the manifest) -----------------------------------------------------------------------------
const exManifest: WebExercise = {
  id: 'mob13-x-manifest', title: '第三關：把草稿修成可以安裝的 Manifest',
  statement: 'index.html 與 style.css 不能改。index.html 是菜單頁的文件：`<head>` 已經連到 manifest.webmanifest，主題色是 `#d35400`（頁面最上面那一行會把它讀出來）；下半部是「PWA 基礎：Manifest 與安裝」那一課的檢查器，一行都沒有改。script.js 的 `manifestText` 是同事留下的 Manifest 草稿，請把它修到檢查器沒有任何問題，並符合這些需求：（一）它必須是合法的 JSON。（二）圖示下方顯示「小島外送」。（三）從主畫面開啟時，一律到菜單頁 `https://food.example/menu/`（Manifest 放在網站的根目錄）。（四）開啟後是沒有網址列、保留系統狀態列的獨立視窗。（五）主題色和這一頁 `<head>` 宣告的相同。（六）圖示有三張 PNG：一般用途的 `icons/icon-192.png`（192 × 192）與 `icons/icon-512.png`（512 × 512），以及標成 maskable 的 `icons/maskable-512.png`（512 × 512）。`name` 與 `background_color` 已經是對的。檢查看的是檢查器的結果：問題清單是空的，安裝預覽的名稱、開啟的網址、顯示模式、上方色條與「maskable 圖示」都符合需求。',
  hints: [
    '先讓它解析得過：JSON 的陣列與物件，最後一項後面不能有逗號。解析成功之後，檢查器才會列出內容的問題，一次修一個、按一次「執行」。',
    '草稿缺了 `start_url`；`short_name` 太長；`display` 的值是瀏覽器分頁；`theme_color` 和頁面最上面那一行讀到的顏色不一樣；`icons` 只有一張。',
    '`"short_name": "小島外送"`、`"start_url": "/menu/"`、`"display": "standalone"`、`"theme_color": "#d35400"`；`icons` 裡補上 512 × 512 的那一張（`"sizes": "512x512"`、`"type": "image/png"`），再加第三張，多一個 `"purpose": "maskable"`。',
  ],
  explanation: '草稿最後一張圖示後面多了一個逗號：在 JavaScript 裡沒問題，在 JSON 裡整份文字就不合法，其餘寫對的成員也一個都讀不到，所以要先修它。接著是內容：`short_name` 給圖示下方用，要短；`start_url` 固定了每次開啟的入口，少了它，App 會從顧客安裝當下所在的那一頁開啟；`standalone` 是沒有瀏覽器介面、保留系統狀態列的視窗，草稿寫的 `browser` 會讓安裝後開起來仍然像一個分頁；`theme_color` 和每一頁 `<head>` 的 `theme-color` 寫成同一個顏色，安裝前後的工具列與狀態列才一致。圖示保留一般用途的 192 與 512 兩張，再另外加一張真的留了邊的 maskable 圖示：系統要裁切時用它，不裁切時用前兩張。',
  viewport: PHONE,
  fixed: { html: INSPECTOR_PAGE, css: INSPECTOR_PAGE_CSS },
  starter: {
    js: manifestJs(
      ['// 同事留下的草稿：先讓它成為合法的 JSON，再照題目的需求修正內容'],
      [M_NAME, '  "short_name": "小島外送：海鮮便當送到你家",', '  "display": "browser",', M_BACKGROUND, '  "theme_color": "#2d3436",', '  "icons": [', `${ICON_192},`, '  ]'],
    ),
  },
  solution: { js: manifestJs([], MANIFEST_DONE) },
  steps: [
    { check: 'count', selector: '#problems li', count: 0, label: '檢查器沒有列出任何問題：文字是合法的 JSON，每個成員也都過關' },
    { check: 'text', selector: '#card-name', text: '小島外送', label: '安裝預覽的「圖示下方的名稱」是小島外送' },
    { check: 'text', selector: '#card-start', text: 'https://food.example/menu/', label: '「開啟的網址」是菜單頁的完整網址' },
    { check: 'text', selector: '#card-display', text: 'standalone', label: '「顯示模式」是獨立視窗的那個值' },
    { check: 'style', selector: '#card-bar', property: 'background-color', value: '#d35400', label: '安裝預覽上方的色條，和這一頁 `<head>` 宣告的主題色相同' },
    { check: 'text', selector: '#card-maskable', text: '有', label: '「maskable 圖示」那一列是「有」' },
  ],
  mistakes: [
    {
      files: { js: manifestJs([], [M_NAME, M_SHORT, M_START, M_STANDALONE, M_BACKGROUND, M_THEME, '  "icons": [', `${ICON_192},`, `${ICON_512},`, `${ICON_MASKABLE},`, '  ]']) },
      why: '內容全部補對了，`icons` 陣列最後一張圖示的後面卻又留了一個逗號。只要有這一個逗號，整份文字就不是合法的 JSON：瀏覽器一個成員都讀不到，也不會提供安裝，頁面上卻看不出任何異狀。',
    },
    {
      files: { js: manifestJs([], [M_NAME, M_SHORT, M_START, M_STANDALONE, M_BACKGROUND, M_THEME, '  "icons": [', '    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },', '    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }', '  ]']) },
      why: '沒有另外加一張，而是把原本的兩張圖示都標成 maskable。只標 maskable 的圖示只用在要裁切的場合：不裁切的地方就沒有圖示可用了，而且一般的圖示沒有留邊，被裁切時主體照樣缺角。',
    },
    {
      files: { js: manifestJs([], [M_NAME, M_SHORT, M_START, M_STANDALONE, M_BACKGROUND, '  "theme_color": "#2d3436",', '  "icons": [', `${ICON_192},`, `${ICON_512},`, ICON_MASKABLE, '  ]']) },
      why: '其他都修好了，`theme_color` 卻留著草稿的深灰色。它是合法的顏色，檢查器不會把它列成問題；但每一頁 `<head>` 宣告的主題色是橘色，安裝後系統介面的顏色會和頁面對不起來。兩邊要寫成同一個顏色。',
    },
    {
      files: { js: manifestJs([], [M_NAME, M_SHORT, '  "start_url": ".",', M_STANDALONE, M_BACKGROUND, M_THEME, '  "icons": [', `${ICON_192},`, `${ICON_512},`, ICON_MASKABLE, '  ]']) },
      why: '把 `start_url` 寫成 `"."`。它代表 Manifest 所在的資料夾，在這裡是網站的首頁 `https://food.example/`，不是題目要的菜單頁。',
    },
  ],
};

// ---- stage 4: the pretend server and the pages ------------------------------------------------------------------------
const SHOP = ['每天 11:00 到 20:00', '滿 300 元免運費'];
const SHOP_OLD = ['每天 11:00 到 18:00', '滿 500 元免運費'];
const MENU = ['海鮮便當', '烤魚定食', '海藻湯'];
const MENU_OLD = ['海鮮便當', '炸魚排'];
const MENU_OTHER = ['蛤蜊麵', '海膽丼', '魚丸湯', '海葡萄沙拉'];
const OFFLINE = ['目前離線，這份資料還沒有存過'];
const API: WebRoute[] = [
  { path: '/static/shop.json', body: SHOP },
  { path: '/api/menu', body: MENU },
  { path: '/offline.json', body: OFFLINE },
];

const LOAD_JS = lines(
  "const out = document.querySelector('#out');",
  '',
  '// 向 path 要一份 JSON（文字的陣列），把內容寫到頁面上',
  'async function load(path) {',
  "  out.textContent = '載入中…';",
  '  try {',
  '    const response = await fetch(path);',
  "    if (!response.ok) throw new Error('HTTP ' + response.status);",
  '    const items = await response.json();',
  "    out.textContent = items.join('、');",
  '  } catch (error) {',
  "    out.textContent = '載入失敗';",
  '  }',
  '}',
);

// The orders page of the example.
const ORDERS = ['訂單 1024：外送中', '訂單 1019：已送達'];
const ORDERS_OLD = ['訂單 1019：已送達'];
const ordersOffline: WebExample = {
  id: 'mob13-orders-offline', title: '第四關的成果：訂單頁在離線時還看得到上次的訂單',
  description: '一位回訪的顧客打開訂單頁：上次造訪已經啟用了這份 sw.js，快取 `orders-v1` 裡留著當時的訂單。sw.js 用網路優先回答所有 GET 請求：連得上就拿新的並把副本存起來，連不上就用上次存的，連上次的都沒有，就自己造一個說明離線的回應。「再訂一次」是 POST 請求，sw.js 不插手。',
  viewport: PHONE,
  setup: {
    api: [{ path: '/api/orders', body: ORDERS }, { path: '/api/rider', body: ['外送員在中正路口'] }, { method: 'POST', path: '/api/orders', status: 201, body: { id: 1025 } }],
    worker: true,
    caches: { 'orders-v1': { '/api/orders': ORDERS_OLD } },
  },
  files: {
    html: lines(
      '<h1>我的訂單</h1>',
      '<p>',
      '  <button id="orders" type="button">重新整理訂單</button>',
      '  <button id="rider" type="button">外送員位置</button>',
      '  <button id="again" type="button">再訂一次</button>',
      '</p>',
      '<p id="out" role="status">尚未載入</p>',
    ),
    css: lines(
      'body { margin: 0; padding: 12px 16px; font-family: system-ui, sans-serif; }',
      'h1 { margin: 0 0 8px; font-size: 20px; }',
      'button { min-height: 44px; margin: 0 8px 8px 0; padding: 0 12px; font: inherit; }',
      '#out { margin: 0; padding: 8px 12px; background-color: #f1f2f6; }',
    ),
    js: lines(
      LOAD_JS,
      '',
      "document.querySelector('#orders').addEventListener('click', () => load('/api/orders'));",
      "document.querySelector('#rider').addEventListener('click', () => load('/api/rider'));",
      '',
      "document.querySelector('#again').addEventListener('click', async () => {",
      '  try {',
      "    const response = await fetch('/api/orders', {",
      "      method: 'POST',",
      "      headers: { 'Content-Type': 'application/json' },",
      "      body: JSON.stringify({ dish: '海鮮便當', count: 1 }),",
      '    });',
      "    out.textContent = response.ok ? '訂單已送出' : '訂單沒有成功';",
      '  } catch (error) {',
      "    out.textContent = '離線中，訂單沒有送出';",
      '  }',
      '});',
      '',
      "if ('serviceWorker' in navigator) {",
      "  navigator.serviceWorker.register('/sw.js');",
      '}',
    ),
    sw: lines(
      "const DATA = 'orders-v1';",
      '',
      "self.addEventListener('activate', (event) => {",
      '  event.waitUntil(self.clients.claim());',
      '});',
      '',
      "self.addEventListener('fetch', (event) => {",
      '  // 送出訂單這類會改變資料的請求只走網路：不呼叫 respondWith',
      "  if (event.request.method !== 'GET') return;",
      '  event.respondWith(networkFirst(event.request));',
      '});',
      '',
      '// 網路優先：連得上就存一份副本；連不上用上次存的；都沒有，就自己造一個回應',
      'async function networkFirst(request) {',
      '  const cache = await caches.open(DATA);',
      '  try {',
      '    const response = await fetch(request);',
      '    if (response.ok) await cache.put(request, response.clone());',
      '    return response;',
      '  } catch (error) {',
      '    const hit = await cache.match(request);',
      '    if (hit) return hit;',
      "    const body = JSON.stringify(['目前離線，連上網路後再試一次']);",
      "    return new Response(body, { headers: { 'Content-Type': 'application/json' } });",
      '  }',
      '}',
    ),
  },
  observe: [
    { do: 'click', selector: '#orders' },
    { do: 'wait', ms: 300 },
    { check: 'text', selector: '#out', text: shown(ORDERS), label: '連線中按「重新整理訂單」：拿到伺服器上的兩張訂單，不是快取裡只有一張的舊資料' },
    { do: 'network', online: false },
    { do: 'click', selector: '#orders' },
    { do: 'wait', ms: 300 },
    { check: 'text', selector: '#out', text: shown(ORDERS), label: '切斷網路後再按：顯示的是剛才存進快取的那一份，兩張訂單都在' },
    { check: 'request', path: '/api/orders', count: 2, label: '離線的這一次仍然先向網路送出了請求（前後共 2 次），失敗後才改用快取' },
    { do: 'click', selector: '#rider' },
    { do: 'wait', ms: 300 },
    { check: 'text', selector: '#out', text: '目前離線，連上網路後再試一次', label: '離線時按從來沒載入過的「外送員位置」：網路與快取都落空，頁面拿到 sw.js 自己造的離線訊息' },
    { do: 'click', selector: '#again' },
    { do: 'wait', ms: 300 },
    { check: 'text', selector: '#out', text: '離線中，訂單沒有送出', label: '離線時按「再訂一次」：POST 請求照實失敗，頁面說出訂單沒有送出' },
  ],
};

// ---- stage 4: the exercise (sw.js of the menu page) -------------------------------------------------------------------
const MENU_APP_BODY = [
  '<header id="top">',
  '  <h1>今日菜單</h1>',
  '</header>',
  '<main>',
  '  <p id="notice" hidden>',
  '    有新版本可以使用。',
  '    <button id="update" class="text" type="button">更新</button>',
  '  </p>',
  '  <p>',
  '    <button id="load" class="text" type="button">重新整理菜單</button>',
  '    <button id="shop" class="text" type="button">店家資訊</button>',
  '  </p>',
  '  <p id="out" role="status">尚未載入</p>',
  '</main>',
  '<div id="bar">',
  '  <a class="action" id="cart" href="/cart/">查看購物車（2 件）</a>',
  '</div>',
  ...tabBar('菜單'),
];
const MENU_APP_JS = lines(
  LOAD_JS,
  '',
  "document.querySelector('#load').addEventListener('click', () => load('/api/menu'));",
  "document.querySelector('#shop').addEventListener('click', () => load('/static/shop.json'));",
  '',
  "const notice = document.querySelector('#notice');",
  '',
  "if ('serviceWorker' in navigator) {",
  "  navigator.serviceWorker.register('/sw.js').then((registration) => {",
  '    // 有新版本在等待，而且這一頁本來就有 Service Worker 在控制：這才是「更新」',
  '    const offer = () => {',
  '      if (registration.waiting && navigator.serviceWorker.controller) notice.hidden = false;',
  '    };',
  '    offer();',
  "    registration.addEventListener('updatefound', () => {",
  "      registration.installing.addEventListener('statechange', offer);",
  '    });',
  '    // 使用者同意了：請等待中的 worker 不要再等',
  "    document.querySelector('#update').addEventListener('click', () => {",
  "      if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');",
  '    });',
  '  });',
  '',
  "  navigator.serviceWorker.addEventListener('controllerchange', () => {",
  '    // 真正的網站在這裡呼叫 location.reload()；預覽裡的頁面不能自己重新載入',
  "    notice.textContent = '已換成新版';",
  '  });',
  '}',
);

const swHead = (version: string) => [
  `const SHELL = 'shell-${version}'; // 外殼的快取：內容有更新，就換一個名字`,
  "const DATA = 'data-v1';   // 資料的快取：菜單這類會變的資料",
  "const FILES = ['/static/shop.json', '/offline.json'];",
];
const SW_INSTALL = [
  "self.addEventListener('install', (event) => {",
  '  // 預先快取外殼的檔案；存完才算安裝成功',
  '  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(FILES)));',
  '});',
];
const SW_ACTIVATE_CLAIM = [
  "self.addEventListener('activate', (event) => {",
  '  // 還缺：接手之前，先刪掉舊版本留下的外殼快取',
  '  event.waitUntil(self.clients.claim());',
  '});',
];
const swActivate = (keep: string) => [
  "self.addEventListener('activate', (event) => {",
  '  // 輪到自己上場：刪掉用不到的舊快取，再接手已經開著的頁面',
  '  event.waitUntil(',
  '    caches.keys()',
  '      .then((names) => Promise.all(',
  `        names.filter((name) => ${keep}).map((name) => caches.delete(name))`,
  '      ))',
  '      .then(() => self.clients.claim())',
  '  );',
  '});',
];
const SW_FETCH = [
  "self.addEventListener('fetch', (event) => {",
  '  const request = event.request;',
  '  // 送出訂單這類請求只走網路：不呼叫 respondWith',
  "  if (request.method !== 'GET') return;",
  '  const path = new URL(request.url).pathname;',
  "  if (path === '/api/menu') {",
  '    event.respondWith(networkFirst(request));',
  '  } else {',
  '    // 外殼的檔案：快取優先',
  '    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));',
  '  }',
  '});',
];
const SW_NETWORK_ONLY = [
  '// 菜單：目前只會上網路，離線就失敗',
  'async function networkFirst(request) {',
  '  return fetch(request);',
  '}',
];
const networkFirstFn = (body: string[]) => ['// 菜單：網路優先', 'async function networkFirst(request) {', ...body, '}'];
const NETWORK_FIRST_DONE = networkFirstFn([
  '  const cache = await caches.open(DATA);',
  '  try {',
  '    const response = await fetch(request);',
  '    // 副本進快取，原本的回應交回給頁面',
  '    if (response.ok) await cache.put(request, response.clone());',
  '    return response;',
  '  } catch (error) {',
  '    // 連不上：先找上次存的菜單，再沒有就交出預先快取的離線訊息',
  '    const hit = await cache.match(request);',
  "    return hit || caches.match('/offline.json');",
  '  }',
]);
const SW_MESSAGE = [
  "self.addEventListener('message', (event) => {",
  '  // 使用者按下「更新」，頁面才會送來這個訊息',
  "  if (event.data === 'SKIP_WAITING') self.skipWaiting();",
  '});',
];
const swFile = (o: { version: string; activate: string[]; networkFirst: string[] }) => lines(...swHead(o.version), '', ...SW_INSTALL, '', ...o.activate, '', ...SW_FETCH, '', ...o.networkFirst, '', ...SW_MESSAGE);
const KEEP_BOTH = 'name !== SHELL && name !== DATA';
/** The version that is live before stage 4: shell-v1, no cleanup, the menu straight from the network. */
const SW_V1 = swFile({ version: 'v1', activate: SW_ACTIVATE_CLAIM, networkFirst: SW_NETWORK_ONLY });
const SW_V2 = swFile({ version: 'v2', activate: swActivate(KEEP_BOTH), networkFirst: NETWORK_FIRST_DONE });
const LOAD_MENU: WebStep[] = [{ do: 'click', selector: '#load' }, { do: 'wait', ms: 300 }];

const exOffline: WebExercise = {
  id: 'mob13-x-offline', title: '第四關：推出會離線的第二版 sw.js',
  statement: 'index.html、style.css 與 script.js 不能改（頁面是前三關的成果；script.js 註冊 `/sw.js`，發現新版本在等待時顯示提示，顧客按下「更新」`#update` 才送出 `SKIP_WAITING`）。編輯器裡的 sw.js 是目前線上的第一版：顧客的裝置上已經啟用了它，快取 `shell-v1` 裡是舊的店家資訊，`data-v1` 裡是昨天的菜單。第一版有兩個問題：菜單只會上網路，離線就失敗；而且它從來不清理快取。店家資訊又剛好更新了。請把它改成第二版，做三件事：（一）外殼快取的名稱 `SHELL` 改成 `shell-v2`。（二）`activate`：先刪掉所有名稱既不是 `SHELL` 也不是 `DATA` 的快取，刪完再 `clients.claim()`；資料快取 `data-v1` 要留著。（三）`networkFirst(request)` 改成網路優先：先向網路要；回應成功時，把它的副本存進名稱是 `DATA` 的快取，再把原本的回應交回去；連不上時，交出 `DATA` 裡上次存的回應；連那個都沒有，就交出預先快取的 `/offline.json`。`install`、`fetch` 與 `message` 的監聽器已經寫好，不必動。檢查的方式：新版安裝後停在等待，`shell-v2` 裡有 `/static/shop.json`；按下「更新」後，`shell-v1` 被刪掉、`data-v1` 還在；按「重新整理菜單」看到伺服器的新菜單，切斷網路再按，看到的是剛才存下的那一份。另外用兩位顧客再檢查：第一次造訪、之後斷線的新顧客；回訪而且一開始就離線、快取裡沒有菜單的顧客。',
  hints: [
    '三件事各自獨立，照順序做。改了 `SHELL`，寫好的 `install` 就會把檔案存進新的快取，舊的 `shell-v1` 一筆都不必碰。',
    '`activate`：`caches.keys()` 交出所有快取的名稱，用 `filter` 留下「不是 `SHELL` 也不是 `DATA`」的，對每一個呼叫 `caches.delete(name)`，用 `Promise.all` 等它們完成，最後才 `self.clients.claim()`。整串交給 `event.waitUntil`。',
    '`networkFirst`：`const cache = await caches.open(DATA);`，然後 `try { const response = await fetch(request); if (response.ok) await cache.put(request, response.clone()); return response; } catch (error) { const hit = await cache.match(request); return hit || caches.match(\'/offline.json\'); }`。',
  ],
  explanation: '換了名字，第二版在 `install` 時把新的店家資訊存進自己的 `shell-v2`，舊版還在使用的 `shell-v1` 完全不受影響。新版安裝完成後停在等待，直到顧客按下「更新」，頁面送來 `SKIP_WAITING`。輪到它上場的 `activate` 才是清理的時機：`caches.keys()` 列出所有名稱，留下自己的外殼快取與資料快取，其餘刪掉。不刪的話，`caches.match` 會照建立的順序先找到 `shell-v1` 裡的舊資料；把 `data-v1` 也一起刪掉，顧客上次看過的菜單就沒了，下一次離線時只剩離線訊息。`networkFirst` 先 `await fetch(request)`：成功就把 `response.clone()` 存進 `data-v1`，原本的回應交回頁面（回應的本文只能讀一次，少了 `clone()`，頁面的請求會失敗）；連不上時進到 `catch`，先找上次存的菜單，再沒有才交出預先快取的 `/offline.json`。離線訊息是最後一關，而且早在安裝時就存好了。',
  viewport: PHONE,
  height: 560,
  setup: { api: API, worker: { previous: SW_V1 }, caches: { 'shell-v1': { '/static/shop.json': SHOP_OLD, '/offline.json': OFFLINE }, 'data-v1': { '/api/menu': MENU_OLD } } },
  fixed: { html: doc({ title: '菜單', install: true, body: MENU_APP_BODY }), css: APP_CSS, js: MENU_APP_JS },
  starter: { sw: SW_V1 },
  solution: { sw: SW_V2 },
  steps: [
    { do: 'wait', ms: 300 },
    { check: 'worker', state: 'waiting', controlling: true, label: '第二版的 sw.js 安裝完成後先等待：控制頁面的仍然是第一版' },
    { check: 'cache', path: '/static/shop.json', name: 'shell-v2', label: '第二版把 `/static/shop.json` 存進了自己的快取 `shell-v2`' },
    { do: 'click', selector: '#update' },
    { do: 'wait', ms: 100 },
    { check: 'cache', path: '/static/shop.json', name: 'shell-v1', match: 'absent', label: '按下「更新」：第二版接手，舊的外殼快取 `shell-v1` 被刪掉了' },
    { check: 'cache', path: '/api/menu', name: 'data-v1', label: '資料快取 `data-v1` 還在：顧客上次看過的菜單沒有被一起刪掉' },
    ...LOAD_MENU,
    { check: 'text', selector: '#out', text: shown(MENU), label: '連線中按「重新整理菜單」：顯示伺服器的新菜單，不是快取裡昨天的那一份' },
    { do: 'network', online: false },
    ...LOAD_MENU,
    { check: 'text', selector: '#out', text: shown(MENU), label: '切斷網路後再按：顯示剛才存進 `data-v1` 的新菜單，而不是「載入失敗」' },
  ],
  variants: [
    {
      title: '第一次造訪的新顧客：連線中看過菜單，之後斷線',
      setup: { api: API },
      steps: [
        { do: 'wait', ms: 300 },
        { check: 'worker', state: 'active', controlling: true, label: '沒有舊版要等：直接啟用並接手頁面' },
        ...LOAD_MENU,
        { check: 'text', selector: '#out', text: shown(MENU), label: '連線中顯示伺服器的菜單' },
        { do: 'network', online: false },
        ...LOAD_MENU,
        { check: 'text', selector: '#out', text: shown(MENU), label: '離線後顯示存下的菜單' },
        { check: 'request', path: '/api/menu', count: 2, label: '離線的那一次仍然先向網路送出請求（共 2 次）' },
        { do: 'click', selector: '#shop' },
        { do: 'wait', ms: 300 },
        { check: 'text', selector: '#out', text: shown(SHOP), label: '離線時「店家資訊」由 `shell-v2` 回答' },
      ],
    },
    {
      title: '回訪的顧客，一開始就離線，快取裡沒有菜單',
      setup: { api: API, worker: true, offline: true, caches: { 'shell-v2': { '/static/shop.json': SHOP, '/offline.json': OFFLINE } } },
      steps: [
        ...LOAD_MENU,
        { check: 'text', selector: '#out', text: shown(OFFLINE), label: '網路與資料快取都落空：頁面拿到預先快取的離線訊息' },
        { check: 'request', path: '/api/menu', count: 1, label: '離線訊息是最後一關：還是先向網路送出了一次請求' },
      ],
    },
    {
      title: '回訪的顧客，連線中，快取裡是昨天的菜單（伺服器換了另一份菜單）',
      setup: { api: [{ path: '/api/menu', body: MENU_OTHER }, API[0], API[2]], worker: true, caches: { 'shell-v2': { '/static/shop.json': SHOP, '/offline.json': OFFLINE }, 'data-v1': { '/api/menu': MENU_OLD } } },
      steps: [
        ...LOAD_MENU,
        { check: 'text', selector: '#out', text: shown(MENU_OTHER), label: '連線中顯示伺服器的菜單' },
        { do: 'network', online: false },
        ...LOAD_MENU,
        { check: 'text', selector: '#out', text: shown(MENU_OTHER), label: '離線後顯示的是剛才換新的那一份' },
      ],
    },
  ],
  mistakes: [
    {
      files: { sw: swFile({ version: 'v2', activate: swActivate(KEEP_BOTH), networkFirst: networkFirstFn([
        '  const cache = await caches.open(DATA);',
        '  try {',
        '    const response = await fetch(request);',
        '    if (response.ok) await cache.put(request, response);',
        '    return response;',
        '  } catch (error) {',
        '    const hit = await cache.match(request);',
        "    return hit || caches.match('/offline.json');",
        '  }',
      ]) }) },
      why: '把同一個回應又存又回傳：`cache.put(request, response)` 少了 `clone()`。回應的本文只能讀一次，快取為了存檔已經把它讀走；交回給頁面的是一個用過的回應，頁面的 `fetch()` 直接失敗。於是連線正常時反而顯示「載入失敗」，快取裡卻有一份完好的菜單。要存的是 `response.clone()`。',
    },
    {
      files: { sw: swFile({ version: 'v2', activate: [SW_ACTIVATE_CLAIM[0], SW_ACTIVATE_CLAIM[2], SW_ACTIVATE_CLAIM[3]], networkFirst: NETWORK_FIRST_DONE }) },
      why: '換了快取名稱，卻沒有在 `activate` 裡清理。`shell-v1` 永遠留在顧客的裝置上；更糟的是 `caches.match` 照建立的順序找，會先找到 `shell-v1` 裡的舊資料：第二版接手了，顧客按「店家資訊」看到的仍然是舊的營業時間。',
    },
    {
      files: { sw: swFile({ version: 'v2', activate: swActivate('name !== SHELL'), networkFirst: NETWORK_FIRST_DONE }) },
      why: '清理時只留下外殼快取，把 `data-v1` 也刪了。它不是舊版本的垃圾，而是顧客上次看過的菜單：更新之後如果剛好沒有網路，他本來還看得到昨天的菜單，現在只剩一句離線訊息。清理的名單要排除這一版還在用的每一個快取。',
    },
    {
      files: { sw: swFile({ version: 'v2', activate: swActivate(KEEP_BOTH), networkFirst: networkFirstFn([
        '  const cache = await caches.open(DATA);',
        '  const hit = await cache.match(request);',
        '  if (hit) return hit;',
        '  try {',
        '    const response = await fetch(request);',
        '    if (response.ok) await cache.put(request, response.clone());',
        '    return response;',
        '  } catch (error) {',
        "    return caches.match('/offline.json');",
        '  }',
      ]) }) },
      why: '先看快取、沒有才上網路：這是快取優先。顧客的 `data-v1` 裡有昨天的菜單，所以連線再正常，他看到的也永遠是昨天那一份；售完的品項、改過的價格都到不了他眼前。會變的資料要先問網路。',
    },
  ],
};

// ---- stage 5: the example (訂單進度) ----------------------------------------------------------------------------------
const order = (asks: number, state: string): WebRoute => ({ path: '/api/order?ask=' + asks, body: { state, done: false } });
const DELIVERED: WebRoute = { path: '/api/order', body: { state: '已送達', done: true } };
const asked = (count: number, label: string): WebStep => ({ check: 'request', path: '/api/order', count, label });
const TEN_SECONDS: WebStep = { do: 'wait', ms: 10000 };

const orderStatus: WebExample = {
  id: 'mob13-order-status', title: '第五關的成果：訂單進度頁說得出結果，也懂得停下來',
  description: '訂單進度頁每 10 秒向 `/api/order` 詢問一次。只有圖示的「重新整理」按鈕有無障礙名稱，進度寫在 `role="status"` 的區域裡；頁面被切到背景時暫停詢問，訂單送達之後就不再問。index.html 裡的 `page` 是「行動效能與省電」那一課的替身：兩顆「模擬」按鈕代替把頁面切到背景與切回來。',
  viewport: PHONE,
  setup: { api: [order(1, '餐點準備中'), order(2, '外送中'), DELIVERED] },
  files: {
    html: lines(
      '<header id="top">',
      '  <h1>訂單進度</h1>',
      `  <button type="button" class="icon" id="refresh" aria-label="重新整理訂單進度">${ICON_REFRESH}</button>`,
      '</header>',
      '<main>',
      '  <p id="state" role="status">查詢中…</p>',
      '  <p id="asked">已詢問 0 次</p>',
      '  <p>',
      '    <button id="hide" type="button">模擬：切到背景</button>',
      '    <button id="show" type="button">模擬：回到前景</button>',
      '  </p>',
      '</main>',
      '<script>',
      '  // 替身：預覽與檢查沒辦法真的把頁面切到背景，所以用 page 代替 document。',
      '  // 真實的網站讀 document.visibilityState，監聽 document 的 visibilitychange。',
      '  const page = new EventTarget();',
      "  page.visibilityState = 'visible';",
      '  {',
      '    const set = (state) => {',
      '      if (page.visibilityState === state) return;',
      '      page.visibilityState = state;',
      "      page.dispatchEvent(new Event('visibilitychange'));",
      '    };',
      "    document.addEventListener('page-hide', () => set('hidden'));",
      "    document.addEventListener('page-show', () => set('visible'));",
      "    document.querySelector('#hide').addEventListener('click', () => set('hidden'));",
      "    document.querySelector('#show').addEventListener('click', () => set('visible'));",
      '  }',
      '</script>',
      '<script src="script.js"></script>',
    ),
    css: lines(
      'body { margin: 0; font-family: system-ui, sans-serif; color: #2d3436; }',
      '#top { display: flex; align-items: center; justify-content: space-between; height: 48px; padding: 0 4px 0 16px; background-color: #d35400; color: #ffffff; }',
      '#top h1 { margin: 0; font-size: 20px; }',
      '.icon { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; padding: 0; border: 0; background-color: transparent; color: inherit; }',
      '.icon svg { width: 24px; height: 24px; fill: currentColor; }',
      'main { padding: 0 16px; }',
      '#state { font-size: 22px; font-weight: bold; }',
      'main button { min-height: 44px; margin: 0 8px 8px 0; padding: 0 12px; font: inherit; }',
    ),
    js: lines(
      "const state = document.querySelector('#state');",
      "const asked = document.querySelector('#asked');",
      'let count = 0;',
      'let timer = null;',
      'let done = false; // 訂單送達了嗎',
      '',
      'async function ask() {',
      '  count += 1;',
      "  asked.textContent = '已詢問 ' + count + ' 次';",
      "  const response = await fetch('/api/order?ask=' + count);",
      '  const order = await response.json();',
      '  state.textContent = order.state; // 寫進 role="status" 的區域',
      '  if (order.done) {',
      '    done = true;',
      '    stop(); // 送達之後就不必再問',
      '  }',
      '}',
      '',
      'function start() { // 先問一次，之後每 10 秒問一次',
      '  ask();',
      '  timer = setInterval(ask, 10000);',
      '}',
      '',
      'function stop() {',
      '  clearInterval(timer);',
      '  timer = null;',
      '}',
      '',
      '// 真實的網站：把 page 換成 document',
      "page.addEventListener('visibilitychange', () => {",
      "  if (page.visibilityState === 'hidden') stop();",
      '  else if (!done) start();',
      '});',
      '',
      "document.querySelector('#refresh').addEventListener('click', () => {",
      '  if (!done) ask();',
      '});',
      '',
      'start();',
    ),
  },
  observe: [
    { check: 'name', selector: '#refresh', text: '重新整理訂單進度', label: '只有圖示的按鈕 `#refresh` 有無障礙名稱「重新整理訂單進度」：名稱寫在按鈕上，圖示是 `aria-hidden`' },
    { check: 'role', selector: '#state', role: 'status', label: '進度寫在 `role="status"` 的區域裡：內容一變，螢幕閱讀器會在不打斷使用者的情況下唸出來' },
    { do: 'wait', ms: 300 },
    TEN_SECONDS,
    { do: 'dispatch', selector: 'body', event: 'page-hide' },
    TEN_SECONDS,
    TEN_SECONDS,
    asked(2, '前景的 10 秒問了 2 次；切到背景之後的 20 秒，一次也沒有多問'),
    { do: 'dispatch', selector: 'body', event: 'page-show' },
    { do: 'wait', ms: 300 },
    { check: 'text', selector: '#state', text: '已送達', label: '回到前景立刻問第 3 次：這一次的回答是「已送達」' },
    { do: 'dispatch', selector: 'body', event: 'page-hide' },
    { do: 'dispatch', selector: 'body', event: 'page-show' },
    TEN_SECONDS,
    asked(3, '送達之後再切換、再等 10 秒：請求停在 3 次，沒有重新開始輪詢'),
  ],
};

// ---- stage 5: the exercise (the finished menu page) --------------------------------------------------------------------
const FINAL_DISHES: [string, number][] = [['海鮮便當', 120], ['烤魚定食', 150], ['海藻湯', 40]];
const finalHtml = (o: { search: string; add: (dish: string) => string; status: string; icon?: (svg: string, label: string) => string }) => {
  const icon = o.icon ?? ((svg: string) => svg);
  return doc({
    title: '菜單',
    install: true,
    body: [
      '<header id="top">',
      '  <h1>今日菜單</h1>',
      `  <button type="button" class="icon" id="search"${o.search}>${icon(ICON_SEARCH, '搜尋')}</button>`,
      '</header>',
      '<main>',
      '  <p id="order">上一張訂單：<span id="order-state">查詢中…</span></p>',
      '  <ul id="list">',
      ...FINAL_DISHES.flatMap(([dish, price], i) => [
        '    <li>',
        `      <span>${dish}　${price} 元</span>`,
        `      <button type="button" class="add" id="add-${i + 1}" data-dish="${dish}"${o.add(dish)}>${icon(ICON_PLUS, `把${dish}加入購物車`)}</button>`,
        '    </li>',
      ]),
      '  </ul>',
      `  <p id="status"${o.status}></p>`,
      '</main>',
      '<div id="bar">',
      '  <a class="action" id="cart" href="/cart/"><span>查看購物車（<span id="count">0</span> 件）</span></a>',
      '</div>',
      ...tabBar('菜單'),
    ],
  });
};
const finalJs = (afterAnswer: string[]) => lines(
  '// 第四關的成果：註冊 Service Worker',
  "if ('serviceWorker' in navigator) {",
  "  navigator.serviceWorker.register('/sw.js');",
  '}',
  '',
  '// 加入購物車：更新數量，並把結果寫進 #status',
  "const status = document.querySelector('#status');",
  "const count = document.querySelector('#count');",
  'let inCart = 0;',
  "document.querySelector('#list').addEventListener('click', (event) => {",
  "  const button = event.target.closest('.add');",
  '  if (!button) return;',
  '  inCart += 1;',
  '  count.textContent = inCart;',
  "  status.textContent = '已加入購物車：' + button.dataset.dish;",
  '});',
  '',
  '// 上一張訂單的進度：先問一次，之後每 10 秒問一次',
  "const state = document.querySelector('#order-state');",
  'let asked = 0;',
  'const timer = setInterval(ask, 10000);',
  '',
  'async function ask() {',
  '  asked += 1;',
  "  const response = await fetch('/api/order?ask=' + asked);",
  '  const order = await response.json();',
  '  state.textContent = order.state;',
  ...afterAnswer,
  '}',
  '',
  'ask();',
);
const FINAL_OLD = { search: '', add: () => '', status: '' };
const FINAL_DONE = { search: ' aria-label="搜尋餐點"', add: (dish: string) => ` aria-label="把${dish}加入購物車"`, status: ' role="status"' };
const STOP_SLOT = ['  // 還缺一件事：訂單送達（order.done 是 true）之後，就不必再問了'];
const STOP_DONE = ['  // 訂單送達之後，就不必再問了', '  if (order.done) clearInterval(timer);'];
const FINAL_API: WebRoute[] = [...API, order(1, '餐點準備中'), order(2, '外送中'), DELIVERED];

const exFinish: WebExercise = {
  id: 'mob13-x-finish', title: '第五關：說得出名稱與結果，送達就停止詢問',
  statement: 'style.css 與 sw.js 不能改（它們是前四關的成果）。這是菜單頁的完成版，驗收時用手機的螢幕閱讀器與開發者工具找到三個問題，請修改 index.html 與 script.js。index.html：（一）右上角的搜尋按鈕 `#search` 只聽到「按鈕」；三顆加號按鈕 `#add-1`、`#add-2`、`#add-3` 也一樣，而且彼此分不出來。請替它們加上無障礙名稱：`#search` 的名稱裡要有「搜尋」，每一顆加號的名稱裡要有它那一列的菜名（海鮮便當、烤魚定食、海藻湯）。圖示的 `<svg>` 維持 `aria-hidden="true"`。（二）按下加號之後，指令稿把「已加入購物車：菜名」寫進 `#status`，螢幕閱讀器卻什麼都沒唸：請讓 `#status` 的角色是 `status`。script.js：（三）頁面每 10 秒向 `/api/order` 詢問上一張訂單的進度，訂單送達之後還在繼續問。伺服器的回答裡 `done` 是 `true` 時，請停止輪詢。檢查的方式：讀名稱與角色；按 `#add-1`，`#status` 的文字是「已加入購物車：海鮮便當」；再讓頁面的時鐘走 40 秒：這張訂單在第三次詢問時送達，請求必須停在 3 次。另一份檢查換成第二次詢問就送達的訂單。',
  hints: [
    '圖示寫了 `aria-hidden="true"`，對螢幕閱讀器來說這幾顆按鈕裡面什麼都沒有。名稱要給按鈕本身：最短的寫法是在 `<button>` 上加 `aria-label`。三顆加號的名稱要不一樣，把菜名寫進去。',
    '即時區域是一個屬性的事：在 `<p id="status">` 上加 `role="status"`。它要一開始就在頁面上、內容是空的，之後指令稿改它的文字，才會被唸出來。',
    '`setInterval` 回傳的編號已經存在 `timer` 裡。在 `ask()` 拿到回答之後加一行：`if (order.done) clearInterval(timer);`。',
  ],
  explanation: '`aria-label` 寫在按鈕上，按鈕就有了名稱：螢幕閱讀器選到時通常會唸出「搜尋餐點，按鈕」「把海鮮便當加入購物車，按鈕」。三顆加號如果都叫「加入購物車」，一路往右滑聽到的是三個一模一樣的按鈕，所以名稱裡要有菜名；名稱裡不必寫「按鈕」，角色本來就會被唸出來。`role="status"` 讓 `#status` 成為即時區域：指令稿一改它的文字，螢幕閱讀器通常會在不打斷使用者的情況下唸出「已加入購物車：海鮮便當」，看不到畫面的人才知道剛才那一下有沒有成功。輪詢的部分只要一行：`order.done` 是 `true` 時 `clearInterval(timer)`。訂單已經送達，再問一百次答案也一樣；每 10 秒把處理器與無線通訊叫醒一次，耗掉的是顧客的電量與流量。',
  viewport: PHONE,
  height: 560,
  setup: { api: FINAL_API },
  fixed: { css: APP_CSS, sw: SW_V2 },
  starter: { html: finalHtml(FINAL_OLD), js: finalJs(STOP_SLOT) },
  solution: { html: finalHtml(FINAL_DONE), js: finalJs(STOP_DONE) },
  steps: [
    { check: 'name', selector: '#search', text: '搜尋', match: 'includes', label: '搜尋按鈕 `#search` 的無障礙名稱裡有「搜尋」' },
    { check: 'name', selector: '#add-1', text: '海鮮便當', match: 'includes', label: '第一顆加號 `#add-1` 的名稱裡有它的菜名「海鮮便當」' },
    { check: 'name', selector: '#add-3', text: '海藻湯', match: 'includes', label: '第三顆加號 `#add-3` 的名稱裡有「海藻湯」：三顆按鈕聽起來不一樣' },
    { check: 'role', selector: '#status', role: 'status', label: '`#status` 的角色是 `status`' },
    { do: 'click', selector: '#add-1' },
    { check: 'text', selector: '#status', text: '已加入購物車：海鮮便當', label: '按下 `#add-1`：`#status` 的文字是「已加入購物車：海鮮便當」' },
    { do: 'wait', ms: 300 },
    TEN_SECONDS,
    TEN_SECONDS,
    TEN_SECONDS,
    TEN_SECONDS,
    asked(3, '頁面的時鐘走了 40 秒：訂單在第 3 次詢問時送達，之後沒有再送出任何請求'),
  ],
  variants: [
    {
      title: '另一張訂單：第二次詢問時就送達',
      setup: { api: [...API, order(1, '外送中'), DELIVERED] },
      steps: [
        { do: 'wait', ms: 300 },
        TEN_SECONDS,
        TEN_SECONDS,
        TEN_SECONDS,
        asked(2, '請求停在 2 次'),
        { check: 'text', selector: '#order-state', text: '已送達', label: '畫面顯示「已送達」' },
        { do: 'click', selector: '#add-2' },
        { check: 'text', selector: '#status', text: '已加入購物車：烤魚定食', label: '按第二顆加號，狀態訊息是那一道菜' },
      ],
    },
  ],
  mistakes: [
    {
      files: { html: finalHtml({ search: '', add: () => '', status: ' role="status"', icon: (svg, label) => svg.replace('aria-hidden="true"', `aria-hidden="true" aria-label="${label}"`) }), js: finalJs(STOP_DONE) },
      why: '把 `aria-label` 寫在 `<svg aria-hidden="true">` 上。`aria-hidden="true"` 已經把整個圖示從無障礙樹拿掉，寫在它上面的名稱也跟著消失：四顆按鈕仍然沒有名稱。名稱要寫在 `<button>` 上。',
    },
    {
      files: { html: finalHtml({ search: ' aria-label="搜尋餐點"', add: () => ' aria-label="加入購物車"', status: ' role="status"' }), js: finalJs(STOP_DONE) },
      why: '三顆加號都叫「加入購物車」。每一顆都有名稱了，卻是同一個名稱：用螢幕閱讀器一路往右滑，聽到三次一模一樣的「加入購物車，按鈕」，分不出哪一顆是哪一道菜。重複出現的控制項，名稱要帶上它所屬的那一項。',
    },
    {
      files: { html: finalHtml(FINAL_DONE), js: finalJs(['  if (order.done) state.textContent = \'已送達，請取餐\';']) },
      why: '送達時只改了畫面上的文字，沒有清掉計時器。畫面看起來完成了，背後的 `setInterval` 卻還在：40 秒裡問了 5 次，而且只要頁面開著就永遠不會停。該停的是計時器，要呼叫 `clearInterval(timer)`。',
    },
  ],
};

// ---- the lesson ---------------------------------------------------------------------------------------------------------
export const MOB13: LessonContent = {
  lessonId: 'MOB13',
  motivation: '前面十二堂課各處理手機上的一件事：拇指搆不搆得到、按鈕夠不夠大、表單好不好填、裝不裝得起來、沒有網路還能不能用。這一課把它們做在同一個產品上：把小島外送做成可以安裝、離線也打得開的 PWA。你會分五關完成它，最後拿自己的手機照著驗收紀錄表測一遍，把結果記下來。',
  sections: [
    {
      id: 'mob13-plan', title: '專題說明：把小島外送做成可安裝、可離線的 PWA',
      blocks: [
        { type: 'p', text: '這座島的前十二課，每一課解決手機上的一個問題。這一課只有一個題目，但要把它們用在同一個產品上：把「小島外送」做成一個漸進式網頁應用程式（PWA）。顧客把它安裝到主畫面，用拇指點餐、結帳；在電梯裡沒有訊號時仍然打得開，看得到上次的菜單；看不到螢幕的顧客用螢幕閱讀器也能完成同一件事；訂單送達之後，頁面不會繼續在背後耗電。選 PWA 這條路線的理由來自「原生、跨平台與 PWA 的選擇」那一課的規則表：小島外送不必上架應用程式商店，也沒有瀏覽器做不到的功能需求。' },
        { type: 'p', text: '專題分成五關。前四關各對應一組主題：行動導覽、觸控與表單、安裝、離線；第五關處理無障礙與效能。每一關的安排相同：先看這個 App 的另一個畫面怎麼做（範例），再替菜單頁或結帳頁做同一件事（練習）。練習的檔案是累積的：後面幾關不能改的檔案裡，帶著前面各關完成的結果。五關之後還有一節沒有練習的內容：拿自己的手機驗收，並把結果記錄下來。' },
        { type: 'table', head: ['關卡', '完成後的樣子', '用到的課', '練習要改的檔案'], rows: [
          ['第一關　行動導覽與可及範圍', '四個目的地在底部的分頁列，主要操作在它正上方的操作列，兩者都避開手勢列', '行動情境與限制、行動 UI 模式、安全區域、方向與動態視窗高度', 'style.css'],
          ['第二關　觸控與表單', '按鈕的外框至少 44 × 44、彼此相隔 8px；結帳表單叫出對的鍵盤、讓瀏覽器代填、有預設值', '觸控目標與手勢的實作、Pointer Events 與觸控事件、行動表單與虛擬鍵盤', 'index.html、style.css'],
          ['第三關　可安裝', '每一頁的 `<head>` 都連到 Manifest；Manifest 通過檢查器', '原生、跨平台與 PWA 的選擇，PWA 基礎：Manifest 與安裝', 'script.js 裡的 Manifest 文字'],
          ['第四關　可離線', '外殼預先快取；菜單用網路優先，離線時退回上次的內容；新版本清掉舊快取', 'Service Worker 與離線', 'sw.js'],
          ['第五關　無障礙與效能', '圖示按鈕有名稱，操作的結果說得出來，訂單送達後停止輪詢', '行動效能與省電、行動無障礙：螢幕閱讀器與縮放', 'index.html、script.js'],
          ['驗收', '在真機上照紀錄表逐項測過，並記下結果', '行動裝置測試：模擬器與真機', '沒有檔案：用你自己的手機'],
        ] },
        { type: 'p', text: '動手之前，先把「完成」說清楚。下表是這個專題的驗收標準，以及每一項在哪裡驗證得到。第三欄是這一課最重要的提醒：預覽的檢查能確認頁面的邏輯與量得到的數字，但有一部分的事實只存在於真正的手機上。' },
        { type: 'table', head: ['需求', '怎麼算完成', '在哪裡驗證'], rows: [
          ['單手操作', '四個目的地與主要操作都在螢幕下方，沒有被手勢列蓋住', '預覽的檢查量得到位置；手勢列實際的樣子要在真機或模擬器上看'],
          ['好按、好填', '觸控目標至少 44 × 44；回訪的顧客不必打字就能送出訂單', '預覽的檢查量外框、讀屬性；鍵盤與代填要在真機上看'],
          ['可安裝', 'Manifest 沒有問題，每一頁都連到它', '檢查器；實際安裝要在真機上做'],
          ['可離線', '看過的菜單離線時還在；沒看過的內容顯示離線訊息', '預覽的檢查（替身的 Service Worker）；發布前在真機上再確認'],
          ['無障礙', '每個控制項有名稱與角色；操作的結果寫進狀態訊息', '預覽的檢查讀名稱與角色；實際怎麼唸要在真機上聽'],
          ['不浪費電', '訂單送達之後不再送出請求', '預覽的檢查數請求的次數；卡不卡頓要在低階的真機上看'],
        ] },
        { type: 'callout', tone: 'note', title: '這一課用到的四個替身', text: '預覽是你瀏覽器裡的一個框架，不是一支手機，也不是一個獨立的網站。前面幾課各用過一個替身，這一課全部會出現，先一次說清楚。（一）安全區域：預覽沒有手勢列，`env()` 得到的永遠是 0px，所以頁面用自訂屬性 `--safe-bottom` 讀它，再由「模擬」按鈕或另一份檢查把它換成 34px。34px 是例子的值，不是任何一支手機的規格。（二）Manifest：預覽放不下 manifest.webmanifest，也安裝不了任何東西；Manifest 寫成 script.js 裡的一段文字，由固定的檢查器解析。（三）Service Worker：隔離的框架不能註冊真正的 Service Worker，也沒有 Cache API，由課程的替身執行你寫的 sw.js。只有頁面用 `fetch()` 送出的請求會經過它，頁面本身的 HTML、樣式表、指令稿與圖片不會；在預覽裡再按一次「執行」，等於同一位顧客再造訪一次，預覽下方的面板顯示它的狀態與快取。推播通知與背景同步不在這個專題裡。（四）頁面的可見狀態：預覽沒辦法真的把頁面切到背景，第五關的範例用 `page` 物件代替 `document`。這四樣東西在真正的網站上都由瀏覽器與裝置提供；它們在真機上實際的樣子，檢查看不到，那是最後一節的工作。' },
      ],
    },
    {
      id: 'mob13-nav', title: '第一關　行動導覽：分頁列、操作列與手勢列',
      blocks: [
        { type: 'p', text: '第一關決定顧客的拇指碰得到什麼。「行動 UI 模式」那一課的選法是先問三件事：這些是目的地還是動作、有幾個、多常用。小島外送有四個常去的目的地（首頁、菜單、訂單、我的），正好適合分頁列（tab bar）：一直在螢幕底部，按一下就到。每一頁另外有一個最主要的操作：菜單頁是「查看購物車」，訂單頁是「聯絡外送員」。照「行動情境與限制」那一課的可及範圍，它也該在螢幕下方，所以放在分頁列正上方的操作列。這個 App 的行動導覽就由這兩條列組成，做法有三個重點：' },
        { type: 'list', items: [
          '分頁列是 `<nav>` 裡的四個連結，不是 ARIA 的頁籤。目前所在的那一個用 `aria-current="page"` 標出來，粗體與顏色直接寫在這個屬性的選擇器上：畫面與螢幕閱讀器說的是同一件事。',
          '兩條列都用 `position: fixed` 固定在視窗下方。固定定位的元素不佔版面，所以內容的最後要留出和它們一樣高的內距，否則最後幾列永遠被蓋住。',
          '頁面的 viewport 設定有 `viewport-fit=cover`，背景可以鋪到螢幕的邊緣；代價是要自己避開手勢列（「安全區域、方向與動態視窗高度」那一課）。最底下的分頁列用 `padding-bottom: var(--safe-bottom)`：背景照樣鋪到底，連結被內距推到手勢列的上方。',
        ] },
        { type: 'example', id: 'mob13-orders-nav' },
        { type: 'p', text: '預覽一開始是 360px 寬。分頁列貼著底部，四個連結平分寬度，「訂單」是粗體；「聯絡外送員」在它的正上方，拇指不必往上伸。按頁面中間的「模擬：有手勢列的手機」：螢幕最下面 34px 被塗成深色，分頁列的連結往上讓了 34px，背景仍然鋪到底；操作列也跟著上移，兩條列之間沒有重疊，也沒有空隙。展開預覽下方的 DOM 樹，確認「訂單」那個連結帶著 `aria-current="page"`。會跟著安全區域變的數字有三個，而且是連動的：' },
        { type: 'table', head: ['下方的安全區域', '分頁列的高度', '操作列的 bottom', '內容最後要讓出的高度'], rows: [
          ['0px（預覽，或沒有手勢列的螢幕）', '56px', '56px', '64 + 56 = 120px'],
          ['34px（例子的值）', '56 + 34 = 90px', '90px', '64 + 90 = 154px'],
        ] },
        { type: 'p', text: '所以這三處都不能寫成固定的數字。分頁列是 `padding-bottom: var(--safe-bottom)`，操作列是 `bottom: calc(56px + var(--safe-bottom))`，內容是 `padding-bottom: calc(120px + var(--safe-bottom))`。它們讀的是同一個自訂屬性：手機回報多少，三處就一起變。' },
        { type: 'callout', tone: 'warning', title: '分頁列讓開了手勢列，它上面的東西卻沒有跟著動', text: '最常見的錯是只替分頁列處理安全區域，操作列仍然寫 `bottom: 56px`，內容仍然留 `120px`。在預覽與沒有手勢列的螢幕上完全看不出問題；到了有手勢列的手機上，分頁列長高了，操作列卻還停在原地，下面一截和分頁列疊在一起。只要一個元素的位置是「接在另一個會長高的元素上面」，它的數字就要用同一個變數來算。' },
        { type: 'callout', tone: 'warning', title: '用第幾個連結，或另外的 class 標示目前的分頁', text: '把粗體寫成 `#tabs a:nth-child(2)`，同一份樣式表拿到訂單頁，粗體還停在「菜單」上。另外加一個 `class="active"` 也有類似的風險：換頁時搬了 class，卻忘了搬 `aria-current`，畫面說你在訂單頁，螢幕閱讀器聽到的目前頁面卻是菜單。讓樣式直接跟著 `[aria-current="page"]`，要搬的東西就只有一個。' },
        { type: 'callout', tone: 'tip', title: '橫放時要再看一次', text: '兩條固定的列一共佔 120px。手機橫放時，視窗的高度可能只剩三百多像素，留給內容的就不多了。「安全區域、方向與動態視窗高度」那一課的做法，是在橫向而且高度不足時讓操作列不再固定，並把左右的安全區域也讓出來。這一關的練習不檢查這一項；把它記進最後一節的驗收，橫放時實際看一次。' },
      ],
    },
    {
      id: 'mob13-touch-form', title: '第二關　觸控與表單：好按的按鈕，少打字的結帳',
      blocks: [
        { type: 'p', text: '第二關處理觸控與表單，場景是整個 App 最花力氣的地方：結帳。在手機上，每一個字都要用拇指在半個螢幕大的鍵盤上敲出來。結帳頁因此不放分頁列，也不放固定的操作列：虛擬鍵盤出現之後，畫面大約只剩一半，固定在底部的東西只會擠掉正在填的欄位，所以送出按鈕跟在最後一個欄位的後面（「行動表單與虛擬鍵盤」那一課）。每個欄位都要回答三個問題：叫出哪一種鍵盤、瀏覽器能不能代填、能不能乾脆不用打。' },
        { type: 'table', head: ['欄位', '寫法', '理由'], rows: [
          ['電子郵件', '`type="email"`、`autocomplete="email"`', '手機通常顯示有 @ 的鍵盤；瀏覽器會檢查格式，也能代填'],
          ['手機號碼', '`type="tel"`、`autocomplete="tel"`', '手機通常顯示撥號鍵盤'],
          ['外送地址', '`<textarea>`、`autocomplete="street-address"`', '街道地址可以有好幾行'],
          ['簡訊驗證碼、統一編號', '`inputmode="numeric"`，不寫 `type="number"`；驗證碼再加上 `autocomplete="one-time-code"`', '它們是由數字組成的編號，不是數量'],
          ['份數', '`type="number"`，加上 `min`、`max` 與預設值 1', '真正的數量：可以加一、減一'],
          ['付款方式、通知方式', '選項按鈕，各有 `value`，預先選好最常用的一個', '用選的比用打的快；什麼都不點，也有一個合理的答案'],
        ] },
        { type: 'example', id: 'mob13-profile-form' },
        { type: 'p', text: '這是「我的」頁面裡的表單。用手機開啟這一頁的話，依序點電子郵件與驗證碼兩個欄位，看鍵盤怎麼換；在桌機上沒有虛擬鍵盤，請展開 DOM 樹看每個欄位的屬性。通知方式已經選好「簡訊」。常用地址旁有兩顆只有圖示的按鈕：圖示是 24px，按鈕的外框卻是 44 × 44，兩顆之間隔著 8px。' },
        { type: 'p', text: '觸控目標的規則沿用「觸控目標與手勢的實作」那一課：以至少 44 × 44 CSS 像素為目標，任何情況都不低於 24 × 24，相鄰的目標之間留至少 8px。要放大的是按鈕的外框，不是裡面的圖示：`min-width`、`min-height` 與內距都算進可以點的範圍，`margin` 不算。選項按鈕包在 `<label>` 裡，整列 48px 高都可以點。按鈕的監聽器一律聽 `click`：手指點一下、滑鼠與鍵盤的 Enter 都會觸發它（「Pointer Events 與觸控事件」那一課）；這個專題沒有拖曳，用不到指標事件。' },
        { type: 'callout', tone: 'warning', title: '只要是數字，就寫成 number', text: '統一編號、驗證碼、電話、卡號都由數字組成，卻都不是數量。寫成 `type="number"`，欄位就有了數量的行為：按到方向鍵，值被加一、減一；輸入的內容只要不是一個數字，欄位的值就是空的。要的只是數字鍵盤的話，維持文字欄位，加上 `inputmode="numeric"`：它只向手機要求鍵盤，不改變欄位的行為。結帳表單裡真正的數量只有份數。' },
        { type: 'callout', tone: 'tip', title: '回訪的顧客應該一個字都不用打', text: '把三種做法疊起來：`autocomplete` 讓瀏覽器代填；預設值讓「份數 1、貨到付現」不必動手；送出時把收件人、手機與地址記在 `localStorage`，下次自動填回來（卡號這類敏感的資料不記）。第二關的練習裡，記住與填回的指令稿已經寫好；你把屬性與預設值補對之後，回訪的顧客只要按一下加號就能送出訂單。' },
      ],
    },
    {
      id: 'mob13-install', title: '第三關　可安裝：每一頁的 head 與一份 Manifest',
      blocks: [
        { type: 'p', text: '第三關讓 App 裝得起來。「PWA 基礎：Manifest 與安裝」那一課的結論是：瀏覽器要先在目前這一頁的 `<head>` 找到 Manifest 的連結，讀得懂它，裡面有名稱、圖示、開啟的網址與顯示模式，才可能提供安裝；網站必須用 HTTPS 提供，有的瀏覽器另外要求網站註冊了 Service Worker（下一關）。所以這一關要交出兩樣東西：每一頁共用的 `<head>`，以及 Manifest 本身。先看 `<head>`。' },
        { type: 'example', id: 'mob13-order-head' },
        { type: 'p', text: '這是訂單明細頁。它不是入口，`<head>` 裡一樣有那幾行：顧客可能在任何一頁想要安裝，而瀏覽器只看目前這一頁。頁面上列出的是指令稿讀到的宣告；最上面那條色塊代替瀏覽器的工具列，被染成主題色。預覽沒有網路，不會真的去下載 manifest.webmanifest。這一頁還有一個「返回訂單列表」的連結：安裝成 `standalone` 之後沒有瀏覽器的返回按鈕，每一個不是入口的畫面都要自己帶著回上一層的方法；四個主要的畫面靠分頁列，更深一層的靠這種連結。' },
        { type: 'p', text: '再來是 Manifest。這個專題需要的成員與值如下：' },
        { type: 'table', head: ['成員', '值', '為什麼'], rows: [
          ['`name`', '小島外送：海鮮便當送到你家', '安裝的確認畫面與應用程式清單用完整的名稱'],
          ['`short_name`', '小島外送', '圖示下方放不下長的名稱'],
          ['`start_url`', '`/menu/`', '每次從圖示開啟都到菜單頁，而不是安裝當下所在的那一頁'],
          ['`display`', '`standalone`', '沒有網址列、保留系統狀態列的獨立視窗'],
          ['`background_color`', '`#ffffff`', '和頁面的背景同色，啟動畫面換到頁面時不會閃一下'],
          ['`theme_color`', '`#d35400`', '和每一頁 `<meta name="theme-color">` 宣告的顏色相同'],
          ['`icons`', '192 × 192 與 512 × 512 的 PNG，另加一張 512 × 512、標成 maskable 的圖示', '一般用途兩張；系統要把圖示裁成自己的形狀時，用留了邊的那一張'],
        ] },
        { type: 'p', text: '練習裡讀 Manifest 的，仍然是那一課的檢查器，程式一行都沒有改：Manifest 寫成 script.js 裡的 `manifestText`，檢查器先用 `JSON.parse` 解析，再逐條檢查名稱、`start_url`、`display`、圖示與顏色，把問題列出來，並畫出一張安裝預覽。它比瀏覽器嚴格：瀏覽器遇到不合法的成員只會悄悄忽略、改用預設值。這一課的頁面在最上面多了一行，顯示這一頁 `<head>` 宣告的連結與主題色，方便你對照 Manifest 的 `theme_color`。' },
        { type: 'callout', tone: 'warning', title: '先修語法，再修內容', text: 'Manifest 是 JSON，不是 JavaScript：最後一項後面的逗號、註解、單引號，只要出現一個，整份文字就不合法。後果不是那一行沒有效果，而是整份 Manifest 都不被採用：名稱、圖示、顯示模式一個都讀不到，頁面卻照常顯示，沒有任何錯誤畫面，唯一的症狀是瀏覽器不提供安裝。所以修 Manifest 的順序永遠是先讓它解析得過，再看檢查器列出的內容問題。' },
        { type: 'callout', tone: 'note', title: '安裝這件事，預覽驗證不了', text: '檢查器只能告訴你 Manifest 的內容沒有它看得出來的問題。瀏覽器願不願意提供安裝、安裝的入口在哪裡、圖示被裁成什麼形狀、啟動畫面長什麼樣子，各瀏覽器不同，只有在真機上實際安裝才看得到；`display-mode` 媒體查詢也要從圖示開啟之後才會成立。這些都列在最後一節的驗收紀錄表裡。' },
      ],
    },
    {
      id: 'mob13-offline', title: '第四關　可離線：一支 sw.js 的三件工作',
      blocks: [
        { type: 'p', text: '第四關讓 App 在沒有網路時還打得開。用的是「Service Worker 與離線」那一課的全部內容，這一次寫在同一支 sw.js 裡。第一件工作是替每一種資源選快取策略：' },
        { type: 'table', head: ['資源', '策略', '放在哪個快取', '理由'], rows: [
          ['外殼：頁面的 HTML、CSS、指令稿與圖示，以及店家資訊這類很少變的檔案', '安裝時預先快取，之後快取優先', '`shell-v2`，名稱帶著版本', '內容跟著版本走；改版時換一個名字'],
          ['今日菜單 `/api/menu`', '網路優先，連不上時退回上次存的', '`data-v1`', '售完、改價要馬上反映；離線時至少有上次的內容'],
          ['離線訊息 `/offline.json`', '預先快取，當成最後一關', '`shell-v2`', '替代的回應要趁還有網路的時候先存好'],
          ['送出訂單（POST）', '只走網路：不呼叫 `respondWith`', '不存', '不能拿舊的答案代替；Cache API 也只存 GET 請求的回應'],
        ] },
        { type: 'p', text: '第二件工作是更新。快取分成兩個是有原因的：外殼的快取跟著版本換名字，新版的 sw.js 在 `install` 時把新檔案存進 `shell-v2`，等它在 `activate` 上場，再把 `shell-v1` 刪掉。資料的快取 `data-v1` 不跟著外殼改版：顧客上次看過的菜單，是他離線時唯一看得到的內容，更新外殼時不該順手清掉。所以 `activate` 裡的清理是「刪掉所有既不是這一版的外殼快取、也不是資料快取的名稱」。新版本什麼時候上場，仍然由顧客決定：新版安裝後先等待，頁面顯示「有新版本」，顧客按下去，頁面才用 `postMessage` 送出 `SKIP_WAITING`。第三件工作是離線時的退路，先看一個做好的例子。' },
        { type: 'example', id: 'mob13-orders-offline' },
        { type: 'p', text: '這是一位回訪顧客的訂單頁：預覽下方的面板顯示 Service Worker 已經啟用並控制頁面，快取 `orders-v1` 裡是上次留下的一張訂單。按「重新整理訂單」：連線中拿到伺服器的兩張訂單，這份新的回應也存進了快取。按面板上的「切斷網路連線」，再按一次：仍然是兩張，而「網路請求」多了一筆失敗的請求。這就是網路優先：先試網路，失敗才用快取。接著按從來沒載入過的「外送員位置」：網路與快取都落空，sw.js 用 `new Response()` 自己造了一個說明離線的回應（練習用的是另一種做法：交出預先快取的 `/offline.json`）。最後按「再訂一次」：POST 請求沒有經過 `respondWith`，照實失敗，頁面說出訂單沒有送出，而不是假裝成功。' },
        { type: 'p', text: '`networkFirst` 只有十行，卻有三個不能省的細節：' },
        { type: 'list', items: [
          '`event.respondWith()` 要在監聽器執行的當下就呼叫，而且只能呼叫一次。所以把非同步的工作寫成一個回傳 Promise 的函式，整個交給它：`event.respondWith(networkFirst(request))`。先 `await` 別的東西再呼叫就太晚了：瀏覽器會丟出錯誤，請求照平常的方式送到網路。',
          '存進快取的是 `response.clone()`。回應的本文只能讀一次，快取為了存檔會把它讀走；原本那一份要留給頁面。',
          '存之前先看 `response.ok`。`fetch` 只有在連不上網路這一類情況才會失敗，伺服器回應 500 也算有回應；不檢查的話，一次伺服器錯誤就會把快取裡原本好好的菜單蓋掉。',
        ] },
        { type: 'callout', tone: 'warning', title: '同一個回應又存又回傳', text: '寫成 `cache.put(request, response)`，接著 `return response`，是最常見的錯。快取已經把本文讀走，交回給頁面的是一個用過的回應，頁面的 `fetch()` 會直接失敗。症狀很容易讓人找錯方向：連線正常時頁面顯示載入失敗，快取裡卻有一份完好的資料，等到離線、改由快取回答時反而看得到。看到「有網路才壞」，先檢查是不是少了 `clone()`。' },
        { type: 'callout', tone: 'warning', title: '清理快取的兩種錯', text: '第一種是不清：換了名字卻沒有在 `activate` 裡刪掉舊的。`shell-v1` 永遠留在顧客的裝置上，而 `caches.match` 照快取建立的順序找，會先找到舊快取裡的過期內容，新版等於白裝。第二種是清過頭：只留下這一版的外殼快取，把資料快取也刪了。連線時看不出問題，更新之後第一次離線，顧客上次看過的菜單就不見了。清理的名單，要排除這一版還在用的每一個快取。' },
        { type: 'callout', tone: 'note', title: '測試離線的順序，以及預覽示範不了的部分', text: '第一次造訪一定要有網路：沒有網路，瀏覽器連 sw.js 都下載不到，什麼都裝不起來。這支 sw.js 在 `activate` 裡呼叫了 `clients.claim()`，所以第一次造訪就會接手頁面；沒有它，頁面要到下一次載入才受控制。驗收離線時照這個順序：連線造訪、看過要離線使用的內容、再切斷網路。另外記得替身的限制：預覽裡只有 `fetch()` 的請求會經過 sw.js。真正的網站上，頁面本身的 HTML、CSS、指令稿與圖示也都經過它，所以這些檔案要列在預先快取的清單裡，離線時頁面才打得開。這一點預覽示範不了，要在真機上驗收。' },
      ],
    },
    {
      id: 'mob13-a11y-perf', title: '第五關　無障礙與效能：看不出來的問題',
      blocks: [
        { type: 'p', text: '最後一關處理眼睛看不出來的問題，也就是無障礙與效能。前四關做出來的頁面，用眼睛看、用手指點都沒有問題；但螢幕閱讀器讀的是角色、無障礙名稱與狀態，電池在意的是沒有人看的時候頁面還在做什麼。交付之前固定檢查三件事：' },
        { type: 'list', ordered: true, items: [
          '每個控制項都有名稱與角色。只有圖示的按鈕最容易漏：圖示寫了 `aria-hidden="true"`，按鈕裡就什麼都沒有，要在 `<button>` 上加 `aria-label`。同一個畫面上重複出現的按鈕（每道菜一顆加號），名稱要帶上它所屬的那一項。',
          '操作的結果說得出來。「已加入購物車」如果只是畫面某處多了一行字，螢幕閱讀器不會主動去唸；把它寫進一個一開始就在頁面上、內容是空的 `role="status"` 區域（「語意 HTML 與 ARIA 的無障礙實作」那一課的即時區域）。',
          '沒有人需要的工作要停下來。輪詢在任務完成時用 `clearInterval` 停掉；頁面被切到背景時暫停，回來再恢復（「行動效能與省電」那一課）。',
        ] },
        { type: 'example', id: 'mob13-order-status' },
        { type: 'p', text: '這是訂單進度頁。右上角只有圖示的按鈕，名稱寫在 `aria-label` 上；進度的文字在 `role="status"` 的段落裡。頁面一載入先問一次，之後每 10 秒問一次。按「模擬：切到背景」，等再久，「已詢問」的次數都不會增加；按「模擬：回到前景」，頁面立刻再問一次。伺服器在第三次詢問時回答已送達，輪詢就此停止，之後不論怎麼切換都不再詢問。`page` 是替身：真正的網站把它換成 `document`，讀 `document.visibilityState`，監聽 `document` 的 `visibilitychange`。這一類問題的症狀與修法整理如下：' },
        { type: 'table', head: ['症狀', '原因', '修法'], rows: [
          ['螢幕閱讀器選到按鈕時，通常只唸出「按鈕」', '按鈕只有圖示，沒有無障礙名稱', '在 `<button>` 上加 `aria-label`，或放一段視覺上隱藏的文字'],
          ['一排按鈕聽起來一模一樣', '重複的控制項用了同一個名稱', '名稱帶上所屬的項目，例如「把海鮮便當加入購物車」'],
          ['按了之後什麼都沒聽到', '結果寫在一般的元素裡', '寫進 `role="status"` 的區域'],
          ['往右滑的順序和畫面不一樣', '用 CSS 改了視覺上的順序', 'HTML 照要被讀到的順序寫，CSS 只管外觀'],
          ['任務已經完成，請求還在送', '計時器沒有清掉', '完成時呼叫 `clearInterval`'],
          ['手機放進口袋，頁面還在詢問', '沒有理會頁面的可見狀態', '監聽 `visibilitychange`，隱藏時暫停，回來時恢復'],
          ['點了之後要等一下才有反應', '一件長任務佔住了主執行緒', '把工作切成小批並讓路，或把不急的工作延後'],
        ] },
        { type: 'callout', tone: 'warning', title: '把名稱寫在被隱藏的圖示上', text: '`<svg aria-hidden="true" aria-label="搜尋">` 看起來有名稱，其實沒有：`aria-hidden="true"` 已經把整個圖示從無障礙樹拿掉，寫在它上面的名稱跟著消失，按鈕仍然只會被唸成「按鈕」。名稱要寫在控制項本身。同樣容易漏的是狀態訊息的區域：按下按鈕時才把 `role="status"` 的元素加進頁面，有些螢幕閱讀器來不及注意到它；讓它從一開始就在頁面上，之後只改裡面的文字。' },
        { type: 'callout', tone: 'note', title: '檢查聽不到螢幕閱讀器，也量不出卡頓', text: '這一關的檢查讀的是名稱與角色（用的是簡化過的規則），並依頁面的時鐘數請求的次數。它聽不到任何一套螢幕閱讀器實際唸出的句子，也量不出低階手機上的一次點擊要等多久。效能可以先在開發者工具裡把處理器與網路調慢，找出太重的工作；但調慢的電腦仍然不是那支手機。兩件事的結論都要回到真機上確認。' },
      ],
    },
    {
      id: 'mob13-acceptance', title: '真機驗收與記錄',
      blocks: [
        { type: 'p', text: '五關的檢查都通過了，但這個專題的最後一個目標是「在真機上驗證並記錄結果」，而這件事沒有任何頁面檢查得了。五個練習的檢查都跑在你瀏覽器的一個框架裡：那裡沒有手勢列與瀏海，沒有虛擬鍵盤，裝不了任何東西，Service Worker 是替身，也沒有螢幕閱讀器在唸。「行動裝置測試：模擬器與真機」那一課的表格說得很清楚：真實的效能、手指按下去的感覺、螢幕閱讀器實際的行為，只有真機上是真的。所以這一節沒有練習，只有一份要你自己拿手機完成的紀錄。' },
        { type: 'p', text: '要在真機上測，先把五關的成果組成一個真正的網站，放在一個用 HTTPS 提供的網址上（安裝與 Service Worker 都需要 HTTPS）。組起來的時候，有幾個地方和預覽裡的版本不同：' },
        { type: 'table', head: ['預覽裡的版本', '真正的網站'], rows: [
          ['Manifest 是 script.js 裡的一段文字', '獨立的檔案 manifest.webmanifest，內容只有從 `{` 到 `}` 的那一段；圖示是真的 PNG 檔'],
          ['「模擬裝置」的指令稿，以及 34px 這個例子的值', '拿掉那份指令稿；`env(safe-area-inset-bottom)` 的值由手機提供'],
          ['sw.js 預先快取的只有資料', '清單裡加上每個頁面的 HTML、CSS、指令稿與圖示；sw.js 放在網站的根目錄'],
          ['`controllerchange` 時只顯示一行字', '呼叫 `location.reload()`，讓整個頁面換成新版'],
          ['頁面的可見狀態用替身 `page`', '`document.visibilityState` 與 `document` 的 `visibilitychange`'],
          ['再按一次「執行」代表下一次造訪', '真的關掉再開啟；Service Worker 與快取的狀態到開發者工具裡看'],
        ] },
        { type: 'p', text: '測哪幾支裝置，用那一課的測試矩陣決定：列出會改變行為的維度（平台、螢幕尺寸、效能、系統版本、輔助設定），每個值至少有一支裝置涵蓋。只有一支手機也可以開始，但要在紀錄裡寫清楚它是哪一支；沒有涵蓋到的值（例如低階的機器、另一個平台）列成「尚未驗證」，不要當成通過。紀錄的開頭先寫三件事：裝置（機型的名稱，是真機還是模擬器）、系統與瀏覽器的版本、測試時用的網路。接著照下表逐項測試。這張表就是紀錄的範本：最後一欄由你填寫，記下「通過」或「不通過」，以及你實際看到的事。' },
        { type: 'table', head: ['項目', '怎麼做', '通過的標準', '結果與備註'], rows: [
          ['安裝', '用手機的瀏覽器開啟網站，從瀏覽器的選單或分享選單找到「安裝」或「加入主畫面」，再從主畫面的圖示開啟', '圖示完整，下方的名稱是「小島外送」；開啟後是沒有網址列的獨立視窗，停在菜單頁；每個畫面都有分頁列或返回的連結', '（由你填寫）'],
          ['離線', '連線開啟一次並看過菜單；把 App 完全關掉再開一次；開啟飛航模式，再從圖示開啟', '頁面打得開，看得到上次的菜單；沒看過的內容顯示離線訊息；送出訂單時明確說出沒有送出；關掉飛航模式後看到最新的菜單', '（由你填寫）'],
          ['螢幕閱讀器', '照「行動無障礙：螢幕閱讀器與縮放」那一課的測試腳本：開啟螢幕閱讀器，從頁面最上面一路往右滑到最後，再不看螢幕完成「把餐點加入購物車、結帳」', '每個控制項都聽得到名稱與角色；順序和畫面一致；分頁列說得出目前在哪一頁；「已加入購物車」有被唸出來', '（由你填寫）'],
          ['放大文字', '把系統與瀏覽器的字體大小調到最大；另外用兩指把頁面放大到兩倍以上', '字有變大；沒有文字被裁掉、截斷或疊在一起；不必左右捲動；底部的兩條列沒有蓋住正在讀的內容', '（由你填寫）'],
          ['橫向', '把手機轉成橫向，把主要任務做一次，再轉回直向', '內容與功能都還在；按鈕沒有落在瀏海或手勢列的位置；填表單時，鍵盤上方看得到正在填的欄位', '（由你填寫）'],
          ['低階裝置', '在矩陣裡效能最低的那一支上走一遍主要任務：開啟、把餐點加入購物車、結帳', '每一次點擊都很快有回應，捲動不會一頓一頓；接上遠端除錯看網路面板，訂單送達之後不再出現新的請求', '（由你填寫）'],
        ] },
        { type: 'p', text: '「結果與備註」不要只打一個勾。寫下看到的事實，例如「通過：圖示被裁成圓形，主體完整」，或「不通過：橫向時操作列蓋住最後一道菜」。每一筆不通過，都要變成一份可以重現的錯誤回報，欄位就是那一課的六個。下面是一個例子，裝置與版本都是虛構的：' },
        { type: 'list', items: [
          '裝置：小島 A1（真機）',
          '系統與瀏覽器版本：系統 4.2 版，瀏覽器 31 版',
          '重現步驟：1. 從主畫面的圖示開啟 App　2. 把手機轉成橫向　3. 把菜單捲到最底',
          '預期結果：最後一道菜完整顯示在操作列的上方',
          '實際結果：最後一道菜被操作列蓋住一半。每次都發生',
          '附件：橫向時的螢幕截圖',
        ] },
        { type: 'p', text: '修好之後，用同一個步驟、在同一支裝置上再測一次，把那一列改成通過，並註明是哪一天、哪一版測的。整張表不必每次發布都重做：每次發布，在矩陣的每一支裝置上走一遍主要任務（冒煙測試）；這六項完整的檢查，則在定期、或相關的程式有改動時做。看不出原因的問題，先接上遠端除錯，讓主控台的錯誤訊息與網路面板告訴你原因，不要在手機上用猜的。' },
        { type: 'callout', tone: 'warning', title: '預覽的檢查全部通過，不等於驗收過', text: '五個練習都打了勾，很容易就宣布「完成」。但那些檢查只證明了頁面的邏輯：位置算得對、屬性寫得對、sw.js 的流程走得通。圖示在主畫面上有沒有缺角、手勢列有沒有蓋住分頁列、鍵盤彈出來之後看不看得到欄位、舊手機上捲不捲得動、螢幕閱讀器實際唸了什麼，一項都還沒有人看過。沒有填完上面那張表之前，這個專題只完成了電腦上的那一半。' },
        { type: 'p', text: '這座島到這裡結束。你做出來的不只是一個頁面，而是一套做法：先決定拇指碰得到什麼，再讓每一次輸入都省力，讓網站裝得起來、斷線也能用，確認看不到螢幕的人一樣能完成任務，最後拿真正的手機驗證，並留下紀錄。之後不論用什麼工具開發行動應用，這張驗收紀錄表都用得上。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  visualization: {
    kind: 'challenge-stages', title: '小島外送 PWA：五個關卡',
    stages: [
      {
        title: '行動導覽與可及範圍', concepts: ['MOB01', 'MOB02', 'MOB06'],
        goal: '四個目的地在視窗底部的分頁列，目前的分頁由 aria-current 標示；主要操作在分頁列正上方的操作列；有手勢列的手機上，兩條列都往上讓，內容的最後一列沒有被蓋住。',
        detail: '目的地少而且常用，所以用分頁列；每一頁最主要的操作放在拇指旁邊的操作列。兩條列都是固定定位，不佔版面，內容要留出一樣高的內距。分頁列用 padding-bottom 讓出安全區域之後會長高，操作列的 bottom 與內容的內距都要用同一個 --safe-bottom 來算，不能寫成固定的數字。',
      },
      {
        title: '觸控與表單', concepts: ['MOB03', 'MOB04', 'MOB05'],
        goal: '加、減按鈕的外框至少 44 × 44、彼此相隔 8px；結帳表單的手機號碼、地址與統一編號叫出對的鍵盤並能代填，付款方式有預設值，回訪的顧客不必打字就能送出。',
        detail: '觸控目標是外框，不是圖示：用 min-width、min-height 或內距放大，margin 不算。由數字組成的編號不是數量，不寫 type="number"，用 inputmode="numeric" 只換鍵盤。autocomplete、預設值與記住的資料疊起來，把要打的字降到最少。按鈕聽 click，手指、滑鼠與鍵盤都能觸發。',
      },
      {
        title: '可安裝', concepts: ['MOB07', 'MOB08'],
        goal: '每一頁的 head 都連到 Manifest 並宣告主題色；Manifest 是合法的 JSON，有短名稱、固定的 start_url、standalone、和 head 相同的主題色，以及 192、512 與 maskable 三張圖示。',
        detail: '瀏覽器只看目前這一頁的 head，所以連結要放在每一頁。Manifest 只要有一個多餘的逗號，整份就不被採用，而頁面看不出任何異狀：先修語法，再修內容。安裝成獨立視窗後沒有瀏覽器的返回按鈕，每個畫面都要自己帶著導覽。實際能不能安裝、圖示怎麼裁，只有真機看得到。',
      },
      {
        title: '可離線', concepts: ['MOB09'],
        goal: '第二版的 sw.js 把外殼預先快取進 shell-v2，菜單用網路優先並存下副本，離線時退回上次的菜單，再沒有就交出離線訊息；按下更新後刪掉 shell-v1，留下 data-v1。',
        detail: '外殼的快取跟著版本換名字，資料的快取不跟著換；清理時排除這一版還在用的每一個快取。respondWith 要在監聽器執行的當下呼叫，把非同步的函式整個交給它。存進快取的是 response.clone()：同一個回應又存又回傳，頁面的請求會失敗。新版本先等待，由顧客決定什麼時候換。',
      },
      {
        title: '無障礙、效能與驗收', concepts: ['MOB10', 'MOB11', 'MOB12'],
        goal: '只有圖示的按鈕都有名稱，三顆加號各自帶著菜名；「已加入購物車」寫進 role="status" 的區域；訂單送達後輪詢停止。最後在真機上照紀錄表測過安裝、離線、螢幕閱讀器、放大文字、橫向與低階裝置。',
        detail: '名稱要寫在按鈕上，不是寫在 aria-hidden 的圖示上；重複的控制項，名稱帶上所屬的項目。狀態訊息的區域一開始就在頁面上。任務完成就清掉計時器，頁面在背景時暫停。這些檢查聽不到螢幕閱讀器，也量不出卡頓：最後一步是拿真正的手機逐項驗收，把看到的事實記下來，不通過的寫成可以重現的回報。',
      },
    ],
  },
  quiz: [
    {
      id: 'mob13-q1', prompt: '小島外送有四個常去的目的地，每一頁另外有一個最主要的操作（菜單頁是「查看購物車」）。在下方有手勢列的手機上，哪一種安排最合適？',
      options: [
        '把四個目的地收進左上角的選單按鈕，主要操作放在頁首的右上角',
        '分頁列固定在底部，把「查看購物車」做成分頁列的第五個項目',
        '分頁列固定在視窗底部，下方的內距讓出安全區域；主要操作放在它正上方的操作列，位置連同安全區域一起算',
        '分頁列與操作列都用 `bottom: 0` 固定在底部，再用 `z-index` 決定誰畫在上面',
      ],
      answer: 2,
      explanation: '目的地只有四個而且都常去，適合一直看得到的分頁列；主要操作放在它的正上方，仍然在拇指搆得到的範圍。分頁列在最底下，所以由它用下方的內距讓出安全區域，操作列的 `bottom` 再用同一個值往上算。左上角與右上角是單手握持時最難搆到的位置，選單按鈕還要多按一下。「查看購物車」是這一頁的動作，不是和首頁、訂單並列的目的地，混進分頁列會讓兩者分不清。兩條列都貼在 `bottom: 0` 只是互相蓋住，`z-index` 決定的是誰被蓋掉。',
    },
    {
      id: 'mob13-q2', prompt: '在下方安全區域是 34px 的手機上，套用這份樣式的頁面會怎樣？',
      code: { language: 'CSS', text: ':root { --safe-bottom: env(safe-area-inset-bottom, 0px); }\n#tabs {\n  position: fixed; left: 0; right: 0; bottom: 0;\n  padding-bottom: var(--safe-bottom);\n}\n#tabs a { height: 56px; }\n#bar {\n  position: fixed; left: 0; right: 0; bottom: 56px;\n  height: 64px;\n}' },
      options: [
        '分頁列長高成 90px，操作列卻還停在離底部 56px 的地方：兩條列重疊了 34px',
        '兩條列都自動往上移 34px，彼此仍然剛好相接',
        '分頁列仍然是 56px 高，它的連結落在手勢列的範圍裡',
        '`env()` 用在固定定位的元素上沒有作用，所以畫面和沒有安全區域時一樣',
      ],
      answer: 0,
      explanation: '分頁列的內距讀了 `--safe-bottom`，高度變成 56 + 34 = 90px，連結被推到手勢列的上方。操作列的 `bottom` 卻是寫死的 56px：它的下緣仍然離底部 56px，比分頁列的上緣低了 34px，兩者疊在一起。瀏覽器不會替固定定位的元素自動避讓，要自己把 `bottom` 寫成 `calc(56px + var(--safe-bottom))`。`env()` 的值和元素怎麼定位無關，在這裡照常生效。',
    },
    {
      id: 'mob13-q3', prompt: '結帳表單要收「統一編號」：由八個數字組成的編號。希望手機顯示只有數字的鍵盤，哪一種寫法最合適？',
      options: [
        '`<input type="number">`：這個欄位只收數字',
        '`<input type="tel">`：電話欄位也會叫出數字鍵盤',
        '`<input type="text" inputmode="number">`',
        '`<input type="text" inputmode="numeric">`',
      ],
      answer: 3,
      explanation: '統一編號是由數字組成的編號，不是數量。`type="number"` 會給它數量的行為：按到方向鍵，編號就被加一、減一。`type="tel"` 的鍵盤雖然接近，但它宣告這一格是電話號碼，瀏覽器代填時可能拿電話號碼來填它。`inputmode` 只向手機要求鍵盤、不改變欄位的行為，正好符合需求；它的值是 `numeric`，`number` 是 `type` 的值，寫在 `inputmode` 上瀏覽器不認得，等於沒寫。',
    },
    {
      id: 'mob13-q4', prompt: 'Manifest 的每個成員都寫對了，只有 `icons` 陣列最後一張圖示的後面多了一個逗號。在真正的瀏覽器裡會怎樣？',
      options: [
        '只有最後一張圖示被忽略，其餘的成員照常生效',
        '整份 Manifest 都不被採用：頁面照常顯示，但瀏覽器讀不到名稱與圖示，也不提供安裝',
        '頁面顯示錯誤畫面，直到 Manifest 修好為止',
        '瀏覽器會自動修正這個逗號，並在主控台留下一則提示',
      ],
      answer: 1,
      explanation: 'Manifest 是 JSON，最後一項後面的逗號讓整份文字不合法，解析就失敗了。瀏覽器不會只跳過那一行，也不會替你修正：整份 Manifest 一個成員都讀不到。頁面本身不受影響，照樣顯示、照樣能用，所以最明顯的症狀只有「瀏覽器不提供安裝」。這也是為什麼修 Manifest 要先確認語法，再看內容。',
    },
    {
      id: 'mob13-q5', prompt: '`fetch` 的監聽器把 `/api/menu` 交給這個函式。顧客在連線正常時按下「重新整理菜單」，會看到什麼？',
      code: { language: 'JavaScript', text: 'async function networkFirst(request) {\n  const cache = await caches.open(\'data-v1\');\n  try {\n    const response = await fetch(request);\n    await cache.put(request, response);\n    return response;\n  } catch (error) {\n    return cache.match(request);\n  }\n}' },
      options: [
        '載入失敗：回應的本文被 `cache.put` 讀走了，交回給頁面的回應不能用；快取裡卻存了一份完整的菜單',
        '最新的菜單，快取也跟著更新',
        '快取裡上次存的菜單，因為 `put` 之後會改由快取回答',
        '最新的菜單，但快取沒有更新，因為少了 `clone()` 的 `put` 會被忽略',
      ],
      answer: 0,
      explanation: '回應的本文只能讀一次。`cache.put(request, response)` 為了存檔把本文讀走，快取裡因此有一份完整的菜單；同一個回應再交回給頁面時已經被用過，頁面的 `fetch()` 會失敗。所以連線正常時反而顯示載入失敗。`put` 並沒有被忽略，也不會改由快取回答這一次請求。改成 `cache.put(request, response.clone())`，副本進快取，原本的回應交回頁面，才是選項二描述的結果。',
    },
    {
      id: 'mob13-q6', prompt: '第二版的 sw.js 把外殼快取改名為 `shell-v2`，菜單這類資料仍然存在 `data-v1`。顧客的裝置上有 `shell-v1` 與 `data-v1`。第二版的 `activate` 應該刪掉哪些快取？',
      options: [
        '全部刪掉，讓新版本從頭開始',
        '只刪 `data-v1`：資料最容易過期，外殼可以留著',
        '都不必刪：名稱不同，瀏覽器會自動清掉舊的那一個',
        '刪掉名稱既不是 `shell-v2` 也不是 `data-v1` 的快取',
      ],
      answer: 3,
      explanation: '清理的原則是排除這一版還在用的每一個快取，其餘刪掉：`shell-v2` 是剛預先快取好的外殼，`data-v1` 是顧客上次看過的菜單，都要留；`shell-v1` 沒有人用了，而且 `caches.match` 會先找到它裡面的舊內容，一定要刪。全部刪掉會連剛存好的外殼一起刪，離線時什麼都沒有。只刪 `data-v1` 剛好相反：丟掉了有用的資料，留下了過期的外殼。Cache API 裡的快取不會自己消失，瀏覽器不會替你清。',
    },
    {
      id: 'mob13-q7', prompt: '按下加號之後，指令稿把「已加入購物車：海鮮便當」寫進頁面下方的 `<p id="status">`。畫面上看得到這行字，用螢幕閱讀器操作的顧客卻什麼都沒聽到。最合適的修法是哪一個？',
      options: [
        '每次加入之後，用指令稿把焦點移到 `#status` 上',
        '替 `#status` 加上 `role="status"`，並讓它從一開始就在頁面上',
        '把這行字放大、加粗，並換成更醒目的顏色',
        '把訊息改寫進加號按鈕的 `aria-label`',
      ],
      answer: 1,
      explanation: '`role="status"` 讓這個區域成為即時區域：內容一改變，螢幕閱讀器會在不打斷使用者的情況下把它唸出來，焦點留在原來的按鈕上，顧客可以接著加下一道菜。把焦點搬到訊息上也聽得到，但顧客每加一道菜就被帶離清單，還得自己找回原來的位置。放大與換色只幫得到看得見的人。把訊息寫進按鈕的 `aria-label` 會改掉按鈕的名稱，下一次選到它時，聽到的不再是它能做什麼。',
    },
    {
      id: 'mob13-q8', prompt: '五個練習的檢查全部通過了。下列哪一項，仍然一定要拿真正的手機才驗證得到？',
      options: [
        'Manifest 的文字是不是合法的 JSON',
        '分頁列裡是哪一個連結帶著 `aria-current="page"`',
        '用拇指按分頁列時會不會誤觸系統的手勢列，以及低階的手機上捲動會不會一頓一頓',
        '訂單送達之後，頁面有沒有繼續送出請求',
      ],
      answer: 2,
      explanation: '手指的觸感、系統手勢與真實處理器的速度，都屬於真實的硬體：模擬器用的是電腦的硬體與滑鼠，裝置模式更只是改了視窗的大小，所以這一項只有真機看得到。其餘三項是頁面自己的內容與邏輯：JSON 的語法用任何檢查工具就能確認，`aria-current` 在 DOM 裡看得到，請求的次數在預覽或開發者工具的網路面板就數得出來。能在電腦上驗證的就在電腦上驗證，把真機的時間留給只有它看得到的問題。',
    },
  ],
  webCode: {
    examples: [ordersNav, profileForm, orderHead, ordersOffline, orderStatus],
    exercises: [exNav, exCheckout, exManifest, exOffline, exFinish],
  },
};
