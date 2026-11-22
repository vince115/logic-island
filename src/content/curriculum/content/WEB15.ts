import type { WebExample, WebExercise, WebRoute } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB15 The web foundations capstone (WEB-5): a small site without a framework, 小島圖書館, built in five stages that
 * each use the lessons before them: structure (WEB02–03), a shared style sheet (WEB05–07), a form with a submit handler
 * and event delegation (WEB04, WEB08–09), data from the pretend server with its three states and a remembered filter
 * (WEB10–12), and the accessibility and performance pass (WEB13–14: a menu button, a deferred script, reserved space).
 * The site has four pages (index, books, wishes, about); the preview shows one page at a time, so each example is a
 * finished slice of one page (mostly about.html) and each exercise asks for the same stage on another page. Later
 * stages keep the earlier stages' results as fixed files. Performance is never measured: what is checked is order
 * (a deferred script finds its elements) and layout shift as a box position before and after late content arrives on
 * the virtual clock. Every `observe` fact and every exercise (solution, starter, mistakes, variants) is run in Chromium
 * by the tests. Names, addresses and data are made up.
 */

const lines = (...text: string[]) => text.join('\n');
const indent = (text: string[], by = '  ') => text.map(l => (l ? by + l : l));

// ---- the site's shared parts ------------------------------------------------------------------------------------
type Page = 'index.html' | 'books.html' | 'wishes.html' | 'about.html';
const NAV: [Page, string][] = [['index.html', '首頁'], ['books.html', '新書'], ['wishes.html', '願望清單'], ['about.html', '關於本館']];
const navLinks = (current: Page) => NAV.map(([href, text]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${text}</a>`);

/** The header of stages 1–4: the site's name and the main menu as a row of links. Stage 1 has no classes yet. */
const siteHeader = (current: Page, classes = true) => [
  classes ? '<header class="site-header">' : '<header>',
  classes ? '  <a class="brand" href="index.html">小島圖書館</a>' : '  <a href="index.html">小島圖書館</a>',
  classes ? '  <nav class="site-nav" aria-label="主選單">' : '  <nav aria-label="主選單">',
  ...indent(navLinks(current), '    '),
  '  </nav>',
  '</header>',
];
/** The header of stage 5: the main menu behind an icon button. `label` is the button's accessible name (the exercise's starter has none). */
const menuHeader = (current: Page, label = ' aria-label="選單"') => [
  '<header class="site-header">',
  '  <a class="brand" href="index.html">小島圖書館</a>',
  '  <button class="menu-button" id="menu-button" type="button"',
  `          aria-expanded="false" aria-controls="site-menu"${label}>`,
  '    <span aria-hidden="true">☰</span>',
  '  </button>',
  '  <nav class="site-menu" id="site-menu" aria-label="主選單" hidden>',
  ...indent(navLinks(current), '    '),
  '  </nav>',
  '</header>',
];
const FOOTER = ['<footer class="site-footer">', '  <p>小島圖書館・島嶼路 1 號</p>', '</footer>'];

const page = (title: string, head: string[], body: string[]) => lines(
  '<!DOCTYPE html>',
  '<html lang="zh-Hant">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <meta name="viewport" content="width=device-width, initial-scale=1">',
  `  <title>${title}</title>`,
  ...indent(head),
  '</head>',
  '<body>',
  ...indent(body),
  '</body>',
  '</html>',
);

/**
 * style.css, the one style sheet of every page (stage 2). The three slots are what the stage-2 exercise asks for:
 * the header that stays at the top, the current page's link, and the card's box sizing.
 */
const siteCss = (o: { header: string; current: string; card: string; forms?: boolean }) => lines(
  'body { margin: 0; font-family: sans-serif; line-height: 1.6; color: #1f2933; }',
  '.site-header {',
  '  min-height: 48px; padding: 0 16px;',
  '  line-height: 48px;',
  '  background-color: #0d47a1;',
  o.header,
  '}',
  '.site-header a { margin-right: 12px; color: #ffffff; }',
  '.brand { font-weight: 700; text-decoration-line: none; }',
  '.site-nav { display: inline-block; }',
  o.current,
  'main { padding: 16px; }',
  'main h1 { margin: 0; font-size: 24px; line-height: 40px; }',
  'main h2 { margin: 0; font-size: 18px; line-height: 32px; }',
  'main section { margin-top: 16px; }',
  '.intro { margin: 0 0 16px; line-height: 24px; }',
  '.card {',
  '  position: relative;',
  '  width: 300px; max-width: 100%; padding: 16px;',
  '  border: 1px solid #90a4ae;',
  o.card,
  '}',
  '.card p { margin: 0; line-height: 24px; }',
  '.badge {',
  '  position: absolute; top: 8px; right: 8px;',
  '  width: 72px; height: 24px;',
  '  background-color: #ffb300;',
  '  font-size: 12px; line-height: 24px; text-align: center;',
  '}',
  '.rows { margin: 0 0 16px; padding: 0; list-style-type: none; }',
  '.rows li { height: 48px; border-bottom: 1px solid #cfd8dc; line-height: 48px; }',
  '.site-footer { padding: 16px; background-color: #eceff1; font-size: 14px; }',
  '.site-footer p { margin: 0; }',
  ...(o.forms ? ['form { margin: 16px 0; }', 'input, select, button { font-size: 16px; }', '.remove { margin-left: 12px; }'] : []),
);
const HEADER_DONE = '  position: sticky; top: 0; z-index: 10;';
const CURRENT_DONE = '.site-nav a[aria-current="page"] { font-weight: 700; }';
const CARD_DONE = '  box-sizing: border-box;';
const SITE_CSS = siteCss({ header: HEADER_DONE, current: CURRENT_DONE, card: CARD_DONE });
/** The same sheet once the pages have forms (stage 3 on). */
const SITE_CSS_FORMS = siteCss({ header: HEADER_DONE, current: CURRENT_DONE, card: CARD_DONE, forms: true });

/** style.css of stage 5: the header holds a menu button, and a notice arrives late. `notice` is the reserved space. */
const menuCss = (notice: string) => lines(
  'body { margin: 0; font-family: sans-serif; line-height: 1.6; color: #1f2933; }',
  '.site-header {',
  '  position: sticky; top: 0; z-index: 10;',
  '  height: 48px; padding: 0 16px;',
  '  line-height: 48px; background-color: #0d47a1;',
  '}',
  '.site-header a { color: #ffffff; }',
  '.brand { font-weight: 700; text-decoration-line: none; }',
  '.menu-button {',
  '  position: absolute; top: 8px; right: 16px;',
  '  width: 40px; height: 32px; font-size: 18px;',
  '}',
  '.site-menu {',
  '  position: absolute; top: 48px; right: 0;',
  '  width: 160px; padding: 8px 16px;',
  '  background-color: #0d47a1;',
  '}',
  '.site-menu a { display: block; line-height: 40px; }',
  '.site-menu a[aria-current="page"] { font-weight: 700; }',
  'main { padding: 16px; }',
  'main h1 { margin: 0; font-size: 24px; line-height: 40px; }',
  'main h2 { margin: 0; font-size: 18px; line-height: 32px; }',
  '.notice {',
  '  margin: 0; padding: 0 12px;',
  '  line-height: 48px; background-color: #fff3e0;',
  notice,
  '}',
  '.card { margin-top: 16px; padding: 16px; border: 1px solid #90a4ae; }',
  '.card p { margin: 0; }',
  '.site-footer { padding: 16px; background-color: #eceff1; font-size: 14px; }',
  '.site-footer p { margin: 0; }',
);
const NOTICE_RESERVED = '  min-height: 48px;';

// ---- examples: finished slices, mostly of about.html -------------------------------------------------------------
const ABOUT_INTRO = '小島圖書館在 1998 年開館，是島上唯一的公共圖書館。';
const FLOORS = ['地下一樓：期刊與報紙', '一樓：服務台、兒童閱覽區', '二樓：一般書庫、自習室', '三樓：島嶼文史資料室'];

const ASK_JS = lines(
  "const form = document.querySelector('#ask-form');",
  "const field = document.querySelector('#question');",
  "const list = document.querySelector('#questions');",
  '',
  "form.addEventListener('submit', (event) => {",
  '  event.preventDefault();',
  '  const text = field.value.trim();',
  "  if (text === '') return;",
  "  const item = document.createElement('li');",
  "  const words = document.createElement('span');",
  '  words.textContent = text;',
  "  const remove = document.createElement('button');",
  "  remove.type = 'button';",
  "  remove.className = 'remove';",
  "  remove.textContent = '刪除';",
  "  remove.setAttribute('aria-label', `刪除：${text}`);",
  '  item.append(words, remove);',
  '  list.append(item);',
  "  field.value = '';",
  '});',
  '',
  "list.addEventListener('click', (event) => {",
  "  const button = event.target.closest('.remove');",
  '  if (!button) return;',
  "  button.closest('li').remove();",
  '});',
);

const EVENTS_JS = lines(
  "const select = document.querySelector('#audience');",
  "const notice = document.querySelector('#notice');",
  "const list = document.querySelector('#events');",
  '',
  'async function loadEvents() {',
  "  notice.textContent = '載入中…';",
  '  list.replaceChildren();',
  '  try {',
  '    const response = await fetch(`/api/events?audience=${select.value}`);',
  '    if (!response.ok) throw new Error(`狀態碼 ${response.status}`);',
  '    const events = await response.json();',
  '    for (const activity of events) {',
  "      const item = document.createElement('li');",
  '      item.textContent = `${activity.day}　${activity.title}`;',
  '      list.append(item);',
  '    }',
  '    notice.textContent = `共 ${events.length} 場活動`;',
  "    if (events.length === 0) notice.textContent = '這一類本週沒有活動';",
  '  } catch (error) {',
  "    notice.textContent = '活動載入失敗，請稍後再試';",
  '  }',
  '}',
  '',
  "select.addEventListener('change', () => {",
  "  localStorage.setItem('audience', select.value);",
  '  loadEvents();',
  '});',
  '',
  "const saved = localStorage.getItem('audience');",
  'if (saved) select.value = saved;',
  'loadEvents();',
);
const EVENTS_API: WebRoute[] = [
  { path: '/api/events?audience=kids', delay: 300, body: [{ day: '週三 10:00', title: '親子故事時間' }, { day: '週日 10:00', title: '繪本手作' }] },
  { path: '/api/events?audience=adults', delay: 300, body: [] },
  { path: '/api/events?audience=seniors', delay: 300, status: 500, body: { error: '伺服器忙碌中' } },
  { path: '/api/events', delay: 300, body: [{ day: '週三 10:00', title: '親子故事時間' }, { day: '週六 14:00', title: '島嶼植物講座' }, { day: '週日 10:00', title: '繪本手作' }] },
];

const MENU_JS = [
  "const button = document.querySelector('#menu-button');",
  "const menu = document.querySelector('#site-menu');",
  '',
  'function setOpen(open) {',
  '  menu.hidden = !open;',
  "  button.setAttribute('aria-expanded', String(open));",
  '}',
  '',
  "button.addEventListener('click', () => {",
  '  setOpen(menu.hidden);',
  '});',
  '',
  "document.addEventListener('keydown', (event) => {",
  "  if (event.key !== 'Escape' || menu.hidden) return;",
  '  setOpen(false);',
  '  button.focus();',
  '});',
];

const examples: WebExample[] = [
  {
    id: 'web15-about-structure', title: '第一關的成果：「關於本館」的骨架',
    description: '`about.html` 在第一關完成時的樣子：一份完整的文件，沒有任何 CSS 與 JavaScript。頁首與主選單和其他三頁相同，只有 `aria-current="page"` 標在不同的連結上。',
    files: {
      html: page('關於本館｜小島圖書館', [], [
        ...siteHeader('about.html', false),
        '<main>',
        '  <h1>關於本館</h1>',
        `  <p>${ABOUT_INTRO}</p>`,
        '  <section>',
        '    <h2>館舍資訊</h2>',
        '    <p>地址：島嶼路 1 號</p>',
        '    <p>入館免費，不需要借書證。</p>',
        '  </section>',
        '  <section>',
        '    <h2>樓層介紹</h2>',
        '    <ul>',
        ...FLOORS.map(f => `      <li>${f}</li>`),
        '    </ul>',
        '  </section>',
        '</main>',
        '<footer>',
        '  <p>小島圖書館・島嶼路 1 號</p>',
        '</footer>',
      ]),
    },
    observe: [
      { check: 'text', selector: 'head > title', text: '關於本館｜小島圖書館', label: '`<title>` 是這一頁專屬的「關於本館｜小島圖書館」' },
      { check: 'role', selector: 'body > header', role: 'banner', label: '`body` 底下的 `<header>` 是頁首地標（角色是 banner）' },
      { check: 'attr', selector: 'nav a[aria-current="page"]', name: 'href', value: 'about.html', label: '主選單裡有 `aria-current="page"` 的連結，正是指向這一頁的 `about.html`' },
      { check: 'headings', label: '標題形成大綱：一個 `h1`（關於本館），底下兩個 `h2`，沒有跳級' },
      { do: 'click', selector: 'nav a[href="books.html"]' },
      { check: 'navigated', href: 'books.html', label: '點主選單的「新書」，連結要去同一個資料夾裡的 `books.html`（預覽只記錄，不會真的換頁）' },
    ],
  },
  {
    id: 'web15-about-style', title: '第二關的成果：同一頁，加上全站共用的樣式表',
    description: '`about.html` 的 `<body>` 加上 class，再套用全站共用的 `style.css`：黏在頂端的頁首、300px 的卡片與右上角的徽章。',
    files: {
      html: lines(
        ...siteHeader('about.html'),
        '<main>',
        '  <h1>關於本館</h1>',
        `  <p class="intro">${ABOUT_INTRO}</p>`,
        '  <section class="card">',
        '    <h2>館舍資訊</h2>',
        '    <p>地址：島嶼路 1 號</p>',
        '    <p>不需要借書證。</p>',
        '    <span class="badge">入館免費</span>',
        '  </section>',
        '  <section>',
        '    <h2>樓層介紹</h2>',
        '    <ul class="rows">',
        ...FLOORS.map(f => `      <li>${f}</li>`),
        '    </ul>',
        '  </section>',
        '</main>',
        ...FOOTER,
      ),
      css: SITE_CSS,
    },
    observe: [
      { check: 'style', selector: '.site-nav a[aria-current="page"]', property: 'font-weight', value: '700', label: '目前頁面的連結是粗體：樣式跟著 `aria-current="page"` 這個屬性走' },
      { check: 'box', selector: '.card', measure: 'width', value: 300, label: '`.card` 寫的是 `width: 300px`，連同留白與邊框量起來也是 300px（`box-sizing: border-box`）' },
      { do: 'scroll', selector: ':page', top: 130 },
      { check: 'box', selector: '.site-header', measure: 'top', value: 0, from: ':viewport', label: '頁面往下捲 130px 之後，頁首的上邊仍貼著視窗頂端（`position: sticky`）' },
      { check: 'hit', selector: '.site-header', top: '.site-header', label: '這時卡片正從頁首底下經過：頁首中心點上畫在最上面的是頁首自己（`z-index: 10`）' },
    ],
  },
  {
    id: 'web15-about-ask', title: '第三關的成果：把想問的問題記下來',
    description: '`about.html` 的一小塊：有標籤、必填的欄位；送出時由 `submit` 的監聽器把文字加進清單；清單上用事件委派處理每一顆「刪除」按鈕。',
    files: {
      html: lines(
        ...siteHeader('about.html'),
        '<main>',
        '  <h1>關於本館</h1>',
        '  <section>',
        '    <h2>想問館員的問題</h2>',
        '    <form id="ask-form">',
        '      <label for="question">想問的問題</label>',
        '      <input id="question" name="question" required>',
        '      <button>記下來</button>',
        '    </form>',
        '    <ul id="questions" class="rows"></ul>',
        '  </section>',
        '</main>',
      ),
      css: SITE_CSS_FORMS,
      js: ASK_JS,
    },
    observe: [
      { check: 'label', selector: '#question', text: '想問的問題', label: '欄位 `#question` 的標籤是「想問的問題」（`<label for>` 對到欄位的 `id`）' },
      { do: 'click', selector: '#ask-form button' },
      { check: 'count', selector: '#questions li', count: 0, label: '欄位空白時按「記下來」：`required` 擋下送出，清單沒有多出項目' },
      { do: 'input', selector: '#question', value: '自習室可以帶飲料嗎？' },
      { do: 'key', selector: '#question', key: 'Enter' },
      { check: 'text', selector: '#questions li span', text: '自習室可以帶飲料嗎？', label: '輸入問題後在欄位裡按 Enter，清單多了這個問題（Enter 也會觸發 `submit`）' },
      { check: 'name', selector: '#questions li .remove', text: '刪除：自習室可以帶飲料嗎？', label: '這一項的刪除按鈕，無障礙名稱是「刪除：自習室可以帶飲料嗎？」，聽得出要刪的是哪一項' },
      { do: 'input', selector: '#question', value: '舊雜誌可以外借嗎？' },
      { do: 'click', selector: '#ask-form button' },
      { do: 'click', selector: '#questions li:first-child .remove' },
      { check: 'text', selector: '#questions li:only-child span', text: '舊雜誌可以外借嗎？', label: '再加一個問題，然後按第一項的「刪除」：清單只剩第二個問題（按鈕是後來才建立的，靠事件委派處理）' },
    ],
  },
  {
    id: 'web15-home-events', title: '第四關的成果：首頁的本週活動',
    description: '`index.html` 的一小塊：依「對象」向 API 取活動清單，交代載入中、成功（包含沒有活動）與失敗；選過的對象存在 `localStorage`。這個範例模擬回訪的訪客：上次選了「親子」。假伺服器對「樂齡」刻意回應 500。',
    setup: { storage: { audience: 'kids' }, api: EVENTS_API },
    files: {
      html: lines(
        ...siteHeader('index.html'),
        '<main>',
        '  <h1>小島圖書館</h1>',
        '  <section>',
        '    <h2>本週活動</h2>',
        '    <label for="audience">對象</label>',
        '    <select id="audience">',
        '      <option value="all">全部</option>',
        '      <option value="kids">親子</option>',
        '      <option value="adults">成人</option>',
        '      <option value="seniors">樂齡</option>',
        '    </select>',
        '    <p id="notice" role="status"></p>',
        '    <ul id="events" class="rows"></ul>',
        '  </section>',
        '</main>',
      ),
      css: SITE_CSS_FORMS,
      js: EVENTS_JS,
    },
    observe: [
      { check: 'value', selector: '#audience', value: 'kids', label: '頁面一載入，選單就選在上次存下的「親子」（`localStorage` 的 `audience` 是 `kids`）' },
      { check: 'request', path: '/api/events?audience=kids', count: 1, label: '第一個請求就是 `/api/events?audience=kids`，沒有先載入「全部」' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '共 2 場活動', label: '300 毫秒後回應到了：清單有兩場親子活動，`#notice` 是「共 2 場活動」' },
      { do: 'select', selector: '#audience', value: 'adults' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '這一類本週沒有活動', label: '換成「成人」：伺服器回應 200 與空陣列，頁面說「這一類本週沒有活動」，不是留白' },
      { do: 'select', selector: '#audience', value: 'seniors' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '活動載入失敗，請稍後再試', label: '換成「樂齡」：伺服器回應 500，`response.ok` 是 `false`，頁面顯示失敗的訊息' },
    ],
  },
  {
    id: 'web15-about-menu', title: '第五關的成果：選單按鈕、defer 與預留的位置',
    description: '`about.html` 的最後一版：主選單收進一顆有無障礙名稱的按鈕，`aria-expanded` 跟著開合，Escape 收起並交還焦點；指令稿用 `defer` 載入；晚到的「今日開館狀態」事先留好了 48px。',
    setup: { api: [{ path: '/api/today', delay: 300, body: { message: '今天開館到 17:00' } }] },
    files: {
      html: page('關於本館｜小島圖書館', ['<link rel="stylesheet" href="style.css">', '<script src="script.js" defer></script>'], [
        ...menuHeader('about.html'),
        '<main>',
        '  <h1>關於本館</h1>',
        '  <p class="notice" id="today" role="status"></p>',
        '  <section class="card" id="info">',
        '    <h2>館舍資訊</h2>',
        '    <p>地址：島嶼路 1 號</p>',
        '    <p>入館免費，不需要借書證。</p>',
        '  </section>',
        '</main>',
        ...FOOTER,
      ]),
      css: menuCss(NOTICE_RESERVED),
      js: lines(
        ...MENU_JS,
        '',
        'async function loadToday() {',
        "  const today = document.querySelector('#today');",
        '  try {',
        "    const response = await fetch('/api/today');",
        '    if (!response.ok) throw new Error(`狀態碼 ${response.status}`);',
        '    const data = await response.json();',
        '    today.textContent = data.message;',
        '  } catch (error) {',
        "    today.textContent = '暫時查不到今日的開館狀態';",
        '  }',
        '}',
        'loadToday();',
      ),
    },
    observe: [
      { check: 'box', selector: '#info', measure: 'top', value: 168, label: '今日開館狀態還沒到（回應要 300 毫秒），卡片 `#info` 的上邊已經在 168px：`.notice` 先佔了 48px' },
      { do: 'wait', ms: 300 },
      { check: 'box', selector: '#info', measure: 'top', value: 168, label: '文字到了之後，`#info` 的上邊仍在 168px：沒有被往下推' },
      { check: 'name', selector: '#menu-button', text: '選單', label: '只有圖示的按鈕 `#menu-button`，無障礙名稱是「選單」（來自 `aria-label`）' },
      { do: 'click', selector: '#menu-button' },
      { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'true', label: '按下按鈕，選單打開，`aria-expanded` 變成 `true`' },
      { do: 'key', selector: '#site-menu a', key: 'Escape' },
      { check: 'focus', selector: '#menu-button', label: '焦點在選單的連結上時按 Escape：選單收起，焦點回到 `#menu-button`' },
    ],
  },
];

// ---- stage 1: the home page's structure ---------------------------------------------------------------------------
const EVENTS = ['週三 10:00　親子故事時間', '週四 19:00　島嶼文史讀書會', '週六 14:00　島嶼植物講座', '週日 10:00　二手書交換'];
const homeStructure = (o: { lang: string; title: string; header: [string, string]; nav: [string, string]; current: string; main: [string, string]; hours: string; events: string; footer: [string, string] }) => lines(
  '<!DOCTYPE html>',
  `<html${o.lang}>`,
  '<head>',
  '  <meta charset="utf-8">',
  '  <meta name="viewport" content="width=device-width, initial-scale=1">',
  `  <title>${o.title}</title>`,
  '</head>',
  '<body>',
  `  ${o.header[0]}`,
  '    <a href="index.html">小島圖書館</a>',
  `    ${o.nav[0]}`,
  `      <a href="index.html"${o.current}>首頁</a>`,
  '      <a href="books.html">新書</a>',
  '      <a href="wishes.html">願望清單</a>',
  '      <a href="about.html">關於本館</a>',
  `    ${o.nav[1]}`,
  `  ${o.header[1]}`,
  `  ${o.main[0]}`,
  '    <h1>小島圖書館</h1>',
  '    <p>借書、自習、聽故事，都在這裡。</p>',
  '    <section>',
  `      <${o.hours}>開放時間</${o.hours}>`,
  '      <p>週二至週日 9:00–17:00</p>',
  '      <p>週一休館</p>',
  '    </section>',
  '    <section>',
  `      <${o.events}>本週活動</${o.events}>`,
  '      <ul>',
  ...EVENTS.map(e => `        <li>${e}</li>`),
  '      </ul>',
  '    </section>',
  `  ${o.main[1]}`,
  `  ${o.footer[0]}`,
  '    <p>小島圖書館・島嶼路 1 號</p>',
  `  ${o.footer[1]}`,
  '</body>',
  '</html>',
);
const HOME_DONE = {
  lang: ' lang="zh-Hant"', title: '首頁｜小島圖書館', header: ['<header>', '</header>'] as [string, string], nav: ['<nav aria-label="主選單">', '</nav>'] as [string, string],
  current: ' aria-current="page"', main: ['<main>', '</main>'] as [string, string], hours: 'h2', events: 'h2', footer: ['<footer>', '</footer>'] as [string, string],
};

// ---- stage 2: the home page with classes, and the shared style sheet --------------------------------------------
const HOME_STYLED_HTML = page('首頁｜小島圖書館', ['<link rel="stylesheet" href="style.css">'], [
  ...siteHeader('index.html'),
  '<main>',
  '  <h1>小島圖書館</h1>',
  '  <p class="intro">借書、自習、聽故事，都在這裡。</p>',
  '  <section class="card">',
  '    <h2>開放時間</h2>',
  '    <p>週二至週日 9:00–17:00</p>',
  '    <p>週一休館</p>',
  '    <span class="badge">入館免費</span>',
  '  </section>',
  '  <section>',
  '    <h2>本週活動</h2>',
  '    <ul class="rows">',
  ...EVENTS.map(e => `      <li>${e}</li>`),
  '    </ul>',
  '  </section>',
  '</main>',
  ...FOOTER,
]);
const HEADER_SLOT = '  /* 三、捲動時留在視窗頂端，而且不被卡片蓋住 */';
const CURRENT_SLOT = '/* 一、主選單裡目前頁面的連結用粗體 */';
const CARD_SLOT = '  /* 二、讓 300px 的寬度包含留白與邊框 */';

// ---- stage 3: the wish list page ----------------------------------------------------------------------------------
const wishesHtml = (label: string, input: string) => lines(
  ...siteHeader('wishes.html'),
  '<main>',
  '  <h1>願望清單</h1>',
  '  <p class="intro">想看的書館內沒有？先記在這裡。</p>',
  '  <form id="wish-form">',
  `    ${label}`,
  `    ${input}`,
  '    <button>加入</button>',
  '  </form>',
  '  <ul id="wishes" class="rows"></ul>',
  '  <p id="browser"></p>',
  '</main>',
  ...FOOTER,
  '<script>',
  '  // 檢查用，請保留：回報這次送出有沒有被 preventDefault() 取消',
  "  document.addEventListener('submit', (event) => {",
  "    const report = document.querySelector('#browser');",
  "    report.textContent = '表單送出了：真正的網頁會在這時重新載入。';",
  "    if (event.defaultPrevented) report.textContent = '預設的送出已取消，頁面留在原地。';",
  '  });',
  '</script>',
);
const WISH_LABEL = '<label for="wish-title">想看的書名</label>';
const WISH_INPUT = '<input id="wish-title" name="title" required>';
const WISHES_DONE = wishesHtml(WISH_LABEL, WISH_INPUT);
const wishesJs = (submit: string[], rest: string[]) => lines(
  "const form = document.querySelector('#wish-form');",
  "const field = document.querySelector('#wish-title');",
  "const list = document.querySelector('#wishes');",
  '',
  '// 已經寫好：把一本書做成清單項目（書名加上「移除」按鈕），接到清單最後',
  'function addWish(title) {',
  "  const item = document.createElement('li');",
  "  const name = document.createElement('span');",
  "  name.className = 'title';",
  '  name.textContent = title;',
  "  const remove = document.createElement('button');",
  "  remove.type = 'button';",
  "  remove.className = 'remove';",
  "  remove.textContent = '移除';",
  "  remove.setAttribute('aria-label', `移除《${title}》`);",
  '  item.append(name, remove);',
  '  list.append(item);',
  '}',
  '',
  "form.addEventListener('submit', (event) => {",
  ...submit,
  '});',
  '',
  ...rest,
);
const WISH_SUBMIT = [
  '  event.preventDefault();',
  '  const title = field.value.trim();',
  "  if (title === '') return;",
  '  addWish(title);',
  "  field.value = '';",
];
const WISH_REMOVE = [
  "list.addEventListener('click', (event) => {",
  "  const button = event.target.closest('.remove');",
  '  if (!button) return;',
  "  button.closest('li').remove();",
  '});',
];

// ---- stage 4: the new books page ----------------------------------------------------------------------------------
const BOOKS_HTML = lines(
  ...siteHeader('books.html'),
  '<main>',
  '  <h1>本週新書</h1>',
  '  <label for="category">分類</label>',
  '  <select id="category">',
  '    <option value="all">全部</option>',
  '    <option value="nature">自然</option>',
  '    <option value="history">歷史</option>',
  '  </select>',
  '  <p id="notice" role="status"></p>',
  '  <ul id="books" class="rows"></ul>',
  '</main>',
  ...FOOTER,
);
const booksJs = (load: string[], change: string[], start: string[]) => lines(
  "const select = document.querySelector('#category');",
  "const notice = document.querySelector('#notice');",
  "const list = document.querySelector('#books');",
  '',
  '// 已經寫好：把每一本書做成清單項目',
  'function showBooks(books) {',
  '  for (const book of books) {',
  "    const item = document.createElement('li');",
  '    item.textContent = `${book.title}（${book.shelf}）`;',
  '    list.append(item);',
  '  }',
  '}',
  '',
  'async function loadBooks() {',
  ...load,
  '}',
  '',
  "select.addEventListener('change', () => {",
  ...change,
  '  loadBooks();',
  '});',
  '',
  ...start,
  'loadBooks();',
);
const BOOKS_FETCH = '    const response = await fetch(`/api/books?category=${select.value}`);';
const BOOKS_OK = '    if (!response.ok) throw new Error(`狀態碼 ${response.status}`);';
const BOOKS_COUNT = ['    notice.textContent = `共 ${books.length} 本新書`;', "    if (books.length === 0) notice.textContent = '這個分類目前沒有新書';"];
const booksLoad = (o: { clear?: boolean; ok?: boolean } = {}) => [
  "  notice.textContent = '載入中…';",
  ...(o.clear === false ? [] : ['  list.replaceChildren();']),
  '  try {',
  BOOKS_FETCH,
  ...(o.ok === false ? [] : [BOOKS_OK]),
  '    const books = await response.json();',
  '    showBooks(books);',
  ...BOOKS_COUNT,
  '  } catch (error) {',
  "    notice.textContent = '載入失敗，請稍後再試';",
  '  }',
];
const BOOKS_SAVE = ["  localStorage.setItem('category', select.value);"];
const BOOKS_RESTORE = ["const saved = localStorage.getItem('category');", 'if (saved) select.value = saved;'];
const NATURE = [{ title: '島嶼植物圖鑑', shelf: '二樓 A3' }, { title: '潮汐的故事', shelf: '二樓 A5' }];
const ALL_BOOKS = [...NATURE, { title: '燈塔與航線', shelf: '三樓 C1' }];
const BOOKS_API: WebRoute[] = [
  { path: '/api/books?category=nature', delay: 300, body: NATURE },
  { path: '/api/books?category=history', delay: 300, body: [] },
  { path: '/api/books', delay: 300, body: ALL_BOOKS },
];
const FAILED = '載入失敗，請稍後再試';

// ---- stage 5: the home page before it goes live -------------------------------------------------------------------
const homeFinalHtml = (script: string, label: string) => page('首頁｜小島圖書館', ['<link rel="stylesheet" href="style.css">', script], [
  ...menuHeader('index.html', label),
  '<main>',
  '  <h1>小島圖書館</h1>',
  '  <p class="notice" id="notice" role="status"></p>',
  '  <section class="card" id="hours">',
  '    <h2>開放時間</h2>',
  '    <p>週二至週日 9:00–17:00</p>',
  '    <p>週一休館</p>',
  '  </section>',
  '</main>',
  ...FOOTER,
]);
const SCRIPT_EARLY = '<script src="script.js"></script>';
const SCRIPT_DEFER = '<script src="script.js" defer></script>';
const MENU_LABEL = ' aria-label="選單"';
const homeFinalJs = (click: string[], rest: string[]) => lines(
  "const button = document.querySelector('#menu-button');",
  "const menu = document.querySelector('#site-menu');",
  "const notice = document.querySelector('#notice');",
  '',
  '// 已經寫好：向伺服器要今天的公告（第四關的做法）',
  'async function loadNotice() {',
  '  try {',
  "    const response = await fetch('/api/notice');",
  '    if (!response.ok) throw new Error(`狀態碼 ${response.status}`);',
  '    const data = await response.json();',
  '    notice.textContent = data.text;',
  '  } catch (error) {',
  "    notice.textContent = '公告暫時無法載入';",
  '  }',
  '}',
  'loadNotice();',
  '',
  "button.addEventListener('click', () => {",
  '  menu.hidden = !menu.hidden;',
  ...click,
  '});',
  '',
  ...rest,
);
const MENU_SYNC = ["  button.setAttribute('aria-expanded', String(!menu.hidden));"];
const MENU_ESCAPE = [
  "document.addEventListener('keydown', (event) => {",
  "  if (event.key !== 'Escape' || menu.hidden) return;",
  '  menu.hidden = true;',
  "  button.setAttribute('aria-expanded', 'false');",
  '  button.focus();',
  '});',
];
const NOTICE_SLOT = '  /* 公告晚一點才到：先替它留好位置 */';

const exercises: WebExercise[] = [
  {
    id: 'web15-x-structure', title: '第一關：首頁的語意骨架',
    statement: '這是小島圖書館的首頁 `index.html`。內容都在，但結構全是 `div`，標題層級也亂了。請把它改成第一關的骨架：（一）`<html>` 加上 `lang="zh-Hant"`，`<title>` 改成「首頁｜小島圖書館」；（二）把最外層的三個 `div` 換成 `<header>`、`<main>`、`<footer>`，三者都直接放在 `<body>` 底下；包住主選單四個連結的那個 `div` 換成 `<nav>`，仍留在 `<header>` 裡；（三）替主選單裡指向這一頁的連結（首頁）加上 `aria-current="page"`；（四）整頁只留一個 `<h1>`（小島圖書館），「開放時間」與「本週活動」改成 `<h2>`。連結的 `href` 與兩個 `<section>` 不用改。',
    hints: [
      '開始標籤與結束標籤要一起換：`<div class="header">` 換成 `<header>`，它對應的 `</div>` 換成 `</header>`。換成語意元素之後，原本的 `class` 就不需要了。',
      '`aria-current="page"` 加在 `<nav>` 裡面 `href="index.html"` 的那個連結上，不是加在站名的連結上。',
      '標題看的是層級，不是字的大小：頁面的主題是 `<h1>`，它底下的兩節都是 `<h2>`。「開放時間」原本用了第二個 `<h1>`，「本週活動」的 `<h4>` 則一口氣跳了兩級。',
    ],
    explanation: '`lang` 與 `<title>` 寫在文件的最外層：前者告訴瀏覽器與螢幕閱讀器這一頁用什麼語言，後者是分頁標籤與書籤上的名字，所以每一頁都要不同。`<header>`、`<main>`、`<footer>` 直接放在 `<body>` 底下時是地標，輔助科技的使用者可以直接跳到主要內容；`<nav>` 說明那一組連結是導覽。`aria-current="page"` 標出「你現在在這一頁」，第二關的樣式也會認這個屬性。標題則形成大綱：一個 `<h1>` 說這一頁的主題，兩個 `<h2>` 是它底下的兩節。',
    starter: {
      html: homeStructure({
        lang: '', title: '未命名', header: ['<div class="header">', '</div>'], nav: ['<div class="nav">', '</div>'], current: '',
        main: ['<div class="main">', '</div>'], hours: 'h1', events: 'h4', footer: ['<div class="footer">', '</div>'],
      }),
    },
    solution: { html: homeStructure(HOME_DONE) },
    steps: [
      { check: 'attr', selector: 'html', name: 'lang', value: 'zh-Hant', match: 'includes', label: '`<html>` 的 `lang` 是 `zh-Hant`' },
      { check: 'text', selector: 'head > title', text: '首頁', match: 'includes', label: '`<title>` 寫出這一頁的名稱「首頁」' },
      { check: 'count', selector: 'body > header ~ main ~ footer', count: 1, label: '`<body>` 底下依序有 `<header>`、`<main>`、`<footer>`' },
      { check: 'attr', selector: 'nav a[aria-current="page"]', name: 'href', value: 'index.html', label: '`<nav>` 裡標著 `aria-current="page"` 的連結，是指向 `index.html` 的「首頁」' },
      { check: 'headings', label: '標題形成大綱：只有一個 `<h1>`，而且沒有跳級' },
      { do: 'click', selector: 'body > header nav a[href="books.html"]' },
      { check: 'navigated', href: 'books.html', label: '主選單在頁首的 `<nav>` 裡：點其中的「新書」，連結要去 `books.html`' },
    ],
    mistakes: [
      {
        files: { html: homeStructure({ ...HOME_DONE, events: 'h4' }) },
        why: '地標都換好了，但「本週活動」還留著 `<h4>`，大概是因為它的字比較小、看起來剛好。標題的層級表示的是結構：`<h1>` 底下直接出現 `<h4>`，中間跳過了兩級，靠標題清單瀏覽的人會以為少了兩層內容。字的大小是 CSS 的事，第二關再調。',
      },
      {
        files: { html: homeStructure({ ...HOME_DONE, current: ' class="current"' }) },
        why: '用 `class="current"` 標示目前的頁面。class 只是給 CSS 與指令稿用的掛勾，輔助科技不會把它唸出來：畫面上之後可以把它畫成粗體，螢幕閱讀器的使用者卻仍然不知道自己在哪一頁。`aria-current="page"` 同時滿足兩者，樣式表也能直接認這個屬性。',
      },
    ],
  },
  {
    id: 'web15-x-style', title: '第二關：全站共用的樣式表',
    statement: 'index.html 是第一關完成的首頁，另外加上了給樣式用的 class 與卡片右上角的徽章，不能改。請在 style.css 補上三處（檔案裡有註解標出位置）：（一）主選單裡目前頁面的連結，也就是有 `aria-current="page"` 的那一個，用粗體（`font-weight: 700`），其他連結維持原樣；選擇器要認這個屬性，不要另外加 class。（二）`.card` 連同留白與邊框，量起來剛好寬 300px。（三）頁首 `.site-header` 在頁面捲動時留在視窗頂端（`position: sticky` 或 `fixed` 都可以）：還沒捲動時不能蓋住主標題，捲動後卡片要從它底下經過，不能蓋在它上面。檢查用的頁面寬 600px、高 400px。',
    hints: [
      '屬性選擇器寫在方括號裡：`a[aria-current="page"]`。前面再加上 `.site-nav`，就只會選到主選單裡的那一個連結。',
      '卡片現在量起來是 334px：300 加上左右留白 32 與左右邊框 2。最省事的做法不是重算 `width`，而是改變 `width` 所指的範圍（WEB06）。',
      '頁首要三個宣告：`position: sticky;`、`top: 0;`，再加上 `z-index`。卡片是 `position: relative` 的定位元素，原始碼又在頁首後面；頁首沒有 `z-index` 時，卡片捲上來會蓋住它。',
    ],
    explanation: '`.site-nav a[aria-current="page"]` 認的是 HTML 上的狀態：哪一頁的連結有這個屬性，粗體就出現在哪裡，四個頁面共用同一條規則。`box-sizing: border-box` 讓 `width: 300px` 包含留白與邊框，之後改留白也不必重算。頁首用 `position: sticky; top: 0;`：它仍佔著原本的位置，所以不會蓋住主標題（改用 `fixed` 的話，還要替 `body` 補上 48px 的 `padding-top`）；`z-index: 10` 讓它高過沒有寫 `z-index` 的卡片。',
    fixed: { html: HOME_STYLED_HTML },
    starter: { css: siteCss({ header: HEADER_SLOT, current: CURRENT_SLOT, card: CARD_SLOT }) },
    solution: { css: SITE_CSS },
    steps: [
      { check: 'style', selector: '.site-nav a[aria-current="page"]', property: 'font-weight', value: '700', label: '主選單裡目前頁面的連結（首頁）是粗體' },
      { check: 'style', selector: '.site-nav a[href="books.html"]', property: 'font-weight', value: '400', label: '主選單的其他連結（例如「新書」）維持一般粗細' },
      { check: 'box', selector: '.card', measure: 'width', value: 300, label: '`.card` 連同留白與邊框，寬度是 300px' },
      { check: 'hit', selector: 'main h1', top: 'main h1', label: '還沒捲動時，主標題沒有被頁首蓋住' },
      { do: 'scroll', selector: ':page', top: 150 },
      { check: 'box', selector: '.site-header', measure: 'top', value: 0, from: ':viewport', label: '頁面往下捲 150px 之後，頁首的上邊仍貼著視窗頂端' },
      { check: 'hit', selector: '.site-header', top: '.site-header', label: '這時卡片正從頁首底下經過：頁首的中心點上，畫在最上面的是頁首' },
    ],
    mistakes: [
      {
        files: { css: siteCss({ header: HEADER_DONE, current: '.site-nav a { font-weight: 700; }', card: CARD_DONE }) },
        why: '選擇器寫成 `.site-nav a`，主選單的四個連結全都變成粗體，「目前在哪一頁」反而看不出來了。要選的是帶著狀態的那一個：`.site-nav a[aria-current="page"]`。',
      },
      {
        files: { css: siteCss({ header: HEADER_DONE, current: CURRENT_DONE, card: '  width: 268px;' }) },
        why: '沒有改 `box-sizing`，而是把 `width` 重算成 268px（300 減掉左右留白 32），卻忘了左右邊框還有 2px：卡片量起來是 302px。每改一次留白或邊框就要重算一次，正是 `box-sizing: border-box` 要省掉的麻煩。',
      },
      {
        files: { css: siteCss({ header: '  position: sticky; top: 0;', current: CURRENT_DONE, card: CARD_DONE }) },
        why: '頁首黏住了，但沒有寫 `z-index`。卡片是 `position: relative` 的定位元素，原始碼又排在頁首後面；兩者都沒有 `z-index` 時，後寫的畫在上面，所以卡片與徽章捲上來時會蓋住頁首。',
      },
    ],
  },
  {
    id: 'web15-x-wishes', title: '第三關：願望清單的表單',
    statement: '這一關是 `wishes.html`（預覽裡的 index.html），要改兩個檔案。index.html：把「想看的書名」變成欄位 `#wish-title` 真正的標籤，並讓這個欄位必填。script.js 有兩處（註解標出了位置）：完成表單 `#wish-form` 的 `submit` 監聽器，取消預設的送出，把欄位的文字去掉前後空白後交給寫好的 `addWish`，再清空欄位；另外在清單 `#wishes` 上用事件委派處理「移除」按鈕（`class="remove"`），按到哪一顆，就移除它所在的 `li`，之後才加入的書也要移除得掉。index.html 最下面那段行內指令稿是檢查用的，會在 `#browser` 寫出這次送出有沒有被取消，請保留。style.css 是第二關的成果，不能改。',
    hints: [
      'HTML 的部分有兩處：把 `<span>` 換成 `<label>`，用 `for` 對到欄位的 `id`；替 `<input>` 加上 `required`。這樣欄位空白時，瀏覽器自己就會擋下送出。',
      '`submit` 的監聽器依序四件事：`event.preventDefault();`、讀 `field.value.trim()`、呼叫 `addWish(…)`、`field.value = \'\';`。書名要在監聽器裡面讀，才是送出當下的內容。',
      '移除用委派：`list.addEventListener(\'click\', (event) => { … })`，裡面先用 `event.target.closest(\'.remove\')` 找按鈕，找不到就 `return`；找到了再 `button.closest(\'li\').remove();`。',
    ],
    explanation: '先讓 HTML 做它能做的事：`<label for="wish-title">` 讓欄位有名字，`required` 讓瀏覽器在欄位空白時擋下送出，`submit` 事件根本不會發生。JavaScript 接手剩下的部分：監聽表單的 `submit`（按鈕與 Enter 都會觸發），第一行取消預設的送出，否則真正的網頁會重新載入、清單跟著消失；書名在監聽器裡讀，並用 `trim()` 去掉空白，只有空白時不加入。「移除」按鈕是 `addWish` 之後才建立的，所以監聽器登記在一開始就存在的 `#wishes` 上：點擊冒泡上來，再用 `closest` 判斷按到的是不是按鈕、它屬於哪個 `li`。`addWish` 還替每顆按鈕設了 `aria-label`（例如「移除《潮汐的故事》」），螢幕閱讀器的使用者才聽得出每一顆要移除的是哪本書。',
    fixed: { css: SITE_CSS_FORMS },
    starter: {
      html: wishesHtml('<span>想看的書名</span>', '<input id="wish-title" name="title">'),
      js: wishesJs(
        ['  // 取消預設的送出', '  // 把欄位的文字（去掉前後空白）交給 addWish', '  // 清空欄位'],
        ['// 在這裡用事件委派處理「移除」：在 list 上監聽 click，按到 .remove 就移除它所在的 li'],
      ),
    },
    solution: { html: WISHES_DONE, js: wishesJs(WISH_SUBMIT, WISH_REMOVE) },
    steps: [
      { check: 'label', selector: '#wish-title', text: '想看的書名', label: '欄位 `#wish-title` 的標籤是「想看的書名」' },
      { do: 'click', selector: '#wish-form button' },
      { check: 'count', selector: '#wishes li', count: 0, label: '欄位空白時按「加入」，清單沒有多出項目' },
      { do: 'input', selector: '#wish-title', value: '潮汐的故事' },
      { do: 'key', selector: '#wish-title', key: 'Enter' },
      { check: 'text', selector: '#wishes li .title', text: '潮汐的故事', label: '輸入書名後在欄位裡按 Enter，清單出現這本書' },
      { check: 'value', selector: '#wish-title', value: '', label: '加入之後欄位被清空' },
      { check: 'text', selector: '#browser', text: '已取消', match: 'includes', label: '`#browser` 回報這次送出的預設行為已取消' },
      { do: 'input', selector: '#wish-title', value: '島嶼植物圖鑑' },
      { do: 'click', selector: '#wish-form button' },
      { do: 'click', selector: '#wishes li:first-child .remove' },
      { check: 'text', selector: '#wishes li:only-child .title', text: '島嶼植物圖鑑', label: '再加入第二本，然後按第一本的「移除」：清單只剩第二本' },
    ],
    mistakes: [
      {
        files: { html: WISHES_DONE, js: wishesJs(WISH_SUBMIT.slice(1), WISH_REMOVE) },
        why: '少了 `event.preventDefault()`。預覽不會真的送出表單，所以看起來一切正常；但在真正的網頁上，監聽器一執行完，瀏覽器就送出表單並重新載入頁面，剛加上去的書立刻消失。`#browser` 那一行會告訴你送出沒有被取消。',
      },
      {
        files: { html: wishesHtml('<label>想看的書名</label>', WISH_INPUT), js: wishesJs(WISH_SUBMIT, WISH_REMOVE) },
        why: '把 `<span>` 換成了 `<label>`，卻沒有寫 `for="wish-title"`，也沒有把欄位包在裡面：這個 `<label>` 和欄位之間沒有任何關聯，點文字不會聚焦到欄位，螢幕閱讀器走到欄位時也唸不出它的名字。',
      },
      {
        files: {
          html: WISHES_DONE,
          js: wishesJs(WISH_SUBMIT, [
            "for (const button of document.querySelectorAll('.remove')) {",
            "  button.addEventListener('click', () => button.closest('li').remove());",
            '}',
          ]),
        },
        why: '在頁面載入時替「現有的」移除按鈕逐一登記監聽器。那個時候清單是空的，`querySelectorAll` 一顆按鈕也找不到；之後 `addWish` 建立的按鈕都沒有監聽器，怎麼按都沒有反應。把監聽器登記在 `#wishes` 上，交給事件委派。',
      },
    ],
  },
  {
    id: 'web15-x-books', title: '第四關：載入本週新書，記住上次的分類',
    statement: '這一關是 `books.html`。index.html 與 style.css 不能改；script.js 已經會向 `/api/books?category=分類` 要資料（伺服器回應一個 JSON 陣列，每本書有 `title` 與 `shelf`；「歷史」這個分類目前是空陣列），並用寫好的 `showBooks` 畫出清單，但只處理了一切順利的情況。請補上四件事，檔案裡的註解標出了位置。載入中：開始載入時，`#notice` 顯示「載入中…」，並清空 `#books` 裡上一次的結果。失敗：回應的 `response.ok` 不是 `true`，或連不上伺服器時，`#notice` 顯示「載入失敗，請稍後再試」，清單維持空的。成功：`#notice` 顯示「共 N 本新書」（N 是實際的本數），一本都沒有時顯示「這個分類目前沒有新書」。記住分類：每次換分類，把 `select.value` 存進 `localStorage` 的 `category`；頁面載入時如果有存過，先讓選單選到它，再發出第一個請求。檢查還會換成別的伺服器再執行：另一批新書、回應 500、連不上，以及一位上次選了「自然」的回訪訪客。',
    hints: [
      '「載入中…」與清空清單都要放在 `await fetch(…)` 的前面：每次換分類也會再走一遍。清空可以用 `list.replaceChildren();`：不帶參數時，它會把清單裡的子元素全部移除。',
      '用 `try { … } catch (error) { … }` 包住從 `fetch` 到顯示本數的幾行。`fetch` 只有在連不上時才會丟出錯誤，所以拿到 `response` 之後要自己加一行：`if (!response.ok) throw new Error(…);`，讓 404、500 也走到 `catch`。',
      '儲存是 `localStorage.setItem(\'category\', select.value);`；還原要寫在最後那行 `loadBooks();` 的前面：`const saved = localStorage.getItem(\'category\'); if (saved) select.value = saved;`。',
    ],
    explanation: '`loadBooks` 的每一段對應一種狀態。開頭先顯示「載入中…」並清空清單，換分類時舊的結果才不會留在畫面上。`try` 裡面，`fetch` 只在連不上伺服器時才丟出錯誤，所以 `if (!response.ok) throw …` 把 404、500 也變成錯誤，兩種失敗都由同一個 `catch` 顯示訊息。成功時還要分「有書」與「沒有書」：空陣列是成功的回應，使用者該看到一句話，而不是一片空白；參考解答先寫入「共 N 本新書」，本數是 0 時再換成另一句。分類存進 `localStorage` 用的是 `setItem`，還原時 `getItem` 在沒有存過的時候回傳 `null`，所以先用 `if (saved)` 判斷；還原寫在第一次 `loadBooks()` 之前，回訪的訪客才不會先載入「全部」再換一次。',
    setup: { api: BOOKS_API },
    fixed: { html: BOOKS_HTML, css: SITE_CSS_FORMS },
    starter: {
      js: booksJs(
        [
          '  // 載入中：顯示「載入中…」，並清空清單',
          '  // 失敗：用 try／catch 包住下面幾行，失敗時顯示「載入失敗，請稍後再試」',
          BOOKS_FETCH.slice(2),
          '  // 失敗：response.ok 不是 true 時，丟出錯誤',
          '  const books = await response.json();',
          '  showBooks(books);',
          '  // 成功：顯示「共 N 本新書」；一本都沒有時顯示「這個分類目前沒有新書」',
        ],
        ['  // 記住分類：把選到的分類存進 localStorage 的 category'],
        ['// 記住分類：localStorage 裡有上次的分類時，先讓 select 選到它'],
      ),
    },
    solution: { js: booksJs(booksLoad(), BOOKS_SAVE, BOOKS_RESTORE) },
    steps: [
      { check: 'text', selector: '#notice', text: '載入中…', label: '資料回來之前，`#notice` 顯示「載入中…」' },
      { do: 'wait', ms: 300 },
      { check: 'count', selector: '#books li', count: 3, label: '300 毫秒後，清單有「全部」分類的三本書' },
      { check: 'text', selector: '#notice', text: '共 3 本新書', label: '`#notice` 變成「共 3 本新書」' },
      { do: 'select', selector: '#category', value: 'history' },
      { do: 'wait', ms: 300 },
      { check: 'count', selector: '#books li', count: 0, label: '換成「歷史」（伺服器回應空陣列）：上一次的三本書已經清掉，清單是空的' },
      { check: 'text', selector: '#notice', text: '這個分類目前沒有新書', label: '`#notice` 顯示「這個分類目前沒有新書」' },
      { check: 'storage', key: 'category', value: 'history', label: '`localStorage` 的 `category` 存著剛選的 `history`' },
    ],
    mistakes: [
      {
        files: { js: booksJs(booksLoad({ ok: false }), BOOKS_SAVE, BOOKS_RESTORE) },
        why: '有 `try`／`catch`，卻沒有檢查 `response.ok`。伺服器回應 500 時 `fetch` 並不會丟出錯誤，程式照常把回應的內容當成書單：這次伺服器的錯誤回應剛好是一個空陣列，頁面就顯示「這個分類目前沒有新書」，把伺服器的故障說成沒有資料。',
      },
      {
        files: { js: booksJs(booksLoad({ clear: false }), BOOKS_SAVE, BOOKS_RESTORE) },
        why: '開始載入時沒有清空清單。換到「歷史」之後，`#notice` 說這個分類沒有新書，清單裡卻還留著上一個分類的三本；再換回有書的分類，新舊兩批還會疊在一起。',
      },
      {
        files: { js: booksJs(booksLoad(), BOOKS_SAVE, []) },
        why: '只存不讀：每次換分類都寫進了 `localStorage`，載入時卻沒有讀回來，回訪的訪客看到的永遠是「全部」。儲存與還原要成對出現，而且還原要在第一次 `loadBooks()` 之前。',
      },
    ],
    variants: [
      {
        title: '另一批新書，回應也比較慢',
        setup: { api: [{ path: '/api/books', delay: 500, body: [{ title: '海邊的地質課', shelf: '二樓 A1' }, { title: '漁港散步地圖', shelf: '三樓 C4' }] }] },
        steps: [
          { do: 'wait', ms: 300 },
          { check: 'text', selector: '#notice', text: '載入中…', label: '這個伺服器要 500 毫秒才回應：300 毫秒時仍是「載入中…」' },
          { do: 'wait', ms: 200 },
          { check: 'count', selector: '#books li', count: 2, label: '500 毫秒後清單有兩本書' },
          { check: 'text', selector: '#books li:first-child', text: '海邊的地質課', match: 'includes', label: '第一項是這批資料的第一本書' },
          { check: 'text', selector: '#notice', text: '共 2 本新書', label: '`#notice` 是「共 2 本新書」' },
        ],
      },
      {
        title: '伺服器回應 500',
        setup: { api: [{ path: '/api/books', delay: 300, status: 500, body: [] }] },
        steps: [
          { do: 'wait', ms: 300 },
          { check: 'text', selector: '#notice', text: FAILED, label: '狀態碼 500：顯示失敗的訊息' },
          { check: 'count', selector: '#books li', count: 0, label: '清單是空的' },
        ],
      },
      {
        title: '連不上伺服器',
        setup: { api: [{ path: '/api/books', delay: 300, fail: true }] },
        steps: [
          { do: 'wait', ms: 300 },
          { check: 'text', selector: '#notice', text: FAILED, label: '網路錯誤：顯示失敗的訊息' },
          { check: 'count', selector: '#books li', count: 0, label: '清單是空的' },
        ],
      },
      {
        title: '上次選了「自然」的回訪訪客',
        setup: { api: BOOKS_API, storage: { category: 'nature' } },
        steps: [
          { check: 'value', selector: '#category', value: 'nature', label: '選單一開始就選在「自然」' },
          { check: 'request', path: '/api/books?category=nature', count: 1, label: '第一個請求就帶著 category=nature' },
          { check: 'request', path: '/api/books?category=all', count: 0, label: '沒有先載入「全部」' },
          { do: 'wait', ms: 300 },
          { check: 'count', selector: '#books li', count: 2, label: '清單是自然類的兩本書' },
        ],
      },
    ],
  },
  {
    id: 'web15-x-launch', title: '第五關：上線前的無障礙與效能檢查',
    statement: '首頁上線前換了新的頁首：主選單收進右上角的「☰」按鈕，頁面還會向 `/api/notice` 要今天的公告。可是它沒有通過檢查，請修好四件事，三個檔案各有要改的地方。（一）index.html：指令稿在 `<head>` 裡太早執行，找不到頁面上的元素；讓它等整份文件解析完才執行。（二）index.html：「☰」按鈕沒有無障礙名稱，替它取名為「選單」。（三）script.js（註解標出了兩處）：按鈕開合選單時，`aria-expanded` 要跟著變成 `"true"` 或 `"false"`；選單開著時按 Escape，要收起選單、把 `aria-expanded` 改回 `"false"`，並把焦點交還給按鈕。（四）style.css：公告大約 300 毫秒後才到，一出現就把「開放時間」的卡片往下推了 48px；讓 `.notice` 在公告回來之前就佔好 48px 的高度。檢查用的頁面寬 600px，修好之後卡片 `#hours` 的上邊應該一直在 168px。',
    hints: [
      '前兩件事各是一個屬性：`<script src="script.js">` 加上 `defer`；按鈕加上 `aria-label="選單"`（圖示已經用 `aria-hidden="true"` 藏起來了，不要把名字加在那個 `<span>` 上）。',
      '`click` 的監聽器裡，`menu.hidden` 改完之後，選單「開著」就是 `!menu.hidden`：`button.setAttribute(\'aria-expanded\', String(!menu.hidden));`。`String(…)` 把 `true`／`false` 轉成屬性要的文字 `"true"`／`"false"`。',
      'Escape 用 `document.addEventListener(\'keydown\', (event) => { … })`：`event.key` 是 `\'Escape\'` 而且選單開著時，設 `menu.hidden = true`、把 `aria-expanded` 設回 `\'false\'`，最後 `button.focus();`。留位置則是替 `.notice` 加上 `min-height: 48px;`。',
    ],
    explanation: '放在 `<head>` 的 `<script>` 沒有 `defer` 時，瀏覽器解析到它就停下來執行，那時 `<body>` 還不存在，`querySelector` 回傳 `null`，第一個 `addEventListener` 就丟出錯誤；加上 `defer`，指令稿等整份文件解析完才執行。只有圖示的按鈕要有名字，`aria-label="選單"` 讓螢幕閱讀器唸得出它是什麼。ARIA 的狀態不會自己更新：`hidden` 每改一次，`aria-expanded` 就要跟著改一次，否則畫面與唸出來的狀態會不一致。Escape 收起選單後，原本的焦點所在的連結已經隱藏，所以用 `button.focus()` 把焦點交還給按鈕。最後，`.notice` 的 `min-height: 48px` 讓它在公告回來之前就佔著位置，文字到了之後下面的內容不必移動，這就是避免版面位移的做法。',
    setup: { api: [{ path: '/api/notice', delay: 300, body: { text: '三樓資料室本週暫停開放' } }] },
    starter: {
      html: homeFinalHtml(SCRIPT_EARLY, ''),
      css: menuCss(NOTICE_SLOT),
      js: homeFinalJs(
        ['  // 讓按鈕的 aria-expanded 跟著選單的開合，變成 "true" 或 "false"'],
        ['// 在這裡處理 Escape：選單開著時按下，就收起選單、更新 aria-expanded，並把焦點交還給按鈕'],
      ),
    },
    solution: { html: homeFinalHtml(SCRIPT_DEFER, MENU_LABEL), css: menuCss(NOTICE_RESERVED), js: homeFinalJs(MENU_SYNC, MENU_ESCAPE) },
    steps: [
      { check: 'box', selector: '#hours', measure: 'top', value: 168, label: '公告還沒到時，卡片 `#hours` 的上邊已經在 168px：公告的位置先留好了' },
      { do: 'wait', ms: 300 },
      { check: 'box', selector: '#hours', measure: 'top', value: 168, label: '公告在 300 毫秒後出現，`#hours` 的上邊仍在 168px，沒有被往下推' },
      { check: 'name', selector: '#menu-button', text: '選單', label: '按鈕 `#menu-button` 的無障礙名稱是「選單」' },
      { do: 'click', selector: '#menu-button' },
      { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'true', label: '按下按鈕打開選單，`aria-expanded` 變成 `true`' },
      { do: 'key', selector: '#site-menu a', key: 'Escape' },
      { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'false', label: '焦點在選單的第一個連結上時按 Escape，`aria-expanded` 變回 `false`' },
      { check: 'focus', selector: '#menu-button', label: '按 Escape 之後，焦點回到 `#menu-button`' },
    ],
    mistakes: [
      {
        files: { html: homeFinalHtml(SCRIPT_EARLY, MENU_LABEL), css: menuCss(NOTICE_RESERVED), js: homeFinalJs(MENU_SYNC, MENU_ESCAPE) },
        why: '其他三件事都修好了，`<script>` 卻還留在 `<head>` 裡、沒有 `defer`。指令稿執行時 `<body>` 還沒被解析，三個 `querySelector` 都回傳 `null`，登記 `click` 的那一行丟出錯誤，整份指令稿到此為止：按鈕按了沒反應，公告也出不來。主控台的錯誤會指出是 script.js 的哪一行。',
      },
      {
        files: {
          html: homeFinalHtml(SCRIPT_DEFER, MENU_LABEL), css: menuCss(NOTICE_RESERVED),
          js: homeFinalJs(MENU_SYNC, [
            "document.addEventListener('keydown', (event) => {",
            "  if (event.key === 'Escape') menu.hidden = true;",
            '});',
          ]),
        },
        why: 'Escape 只把選單藏起來。`aria-expanded` 還停在 `"true"`，螢幕閱讀器會說選單是展開的；焦點也還留在已經隱藏的連結上，鍵盤使用者下一次按 Tab 不知道會從哪裡開始。收起選單是三件事：隱藏、更新狀態、交還焦點。',
      },
      {
        files: {
          html: homeFinalHtml(SCRIPT_DEFER, '').replace('<span aria-hidden="true">', '<span aria-hidden="true" aria-label="選單">'),
          css: menuCss(NOTICE_RESERVED), js: homeFinalJs(MENU_SYNC, MENU_ESCAPE),
        },
        why: '把 `aria-label` 加在圖示的 `<span>` 上。那個 `<span>` 有 `aria-hidden="true"`，整個從輔助科技眼中消失，上面的名字也跟著不見，按鈕仍然沒有無障礙名稱。名字要給按鈕本身：`<button … aria-label="選單">`。',
      },
    ],
    variants: [
      {
        title: '另一則公告，晚一點才到',
        setup: { api: [{ path: '/api/notice', delay: 600, body: { text: '週六講座改到二樓舉行' } }] },
        steps: [
          { do: 'wait', ms: 300 },
          { check: 'box', selector: '#hours', measure: 'top', value: 168, label: '公告還沒到，卡片在 168px' },
          { do: 'wait', ms: 300 },
          { check: 'text', selector: '#notice', text: '週六講座改到二樓舉行', label: '公告顯示伺服器給的文字' },
          { check: 'box', selector: '#hours', measure: 'top', value: 168, label: '卡片仍在 168px' },
          { do: 'click', selector: '#menu-button' },
          { check: 'count', selector: '#site-menu[hidden]', count: 0, label: '按下按鈕，選單顯示出來' },
          { do: 'key', selector: '#site-menu a', key: 'Escape' },
          { check: 'count', selector: '#site-menu[hidden]', count: 1, label: '按 Escape，選單收起' },
        ],
      },
    ],
  },
];

export const WEB15: LessonContent = {
  lessonId: 'WEB15',
  motivation: '前面十四堂課各教一塊零件，這一課把它們組成一個真的網站：小島圖書館的四個頁面，不靠任何框架，只用 HTML、CSS 與 JavaScript。你會分五關完成它：語意結構、共用的樣式表、表單互動、向 API 取資料並記住訪客的選擇，最後通過無障礙與效能的檢查。',
  sections: [
    {
      id: 'web15-plan', title: '專題說明：小島圖書館的網站',
      blocks: [
        { type: 'p', text: '前面十四堂課，每一課都只處理一個主題的一小頁。這一課反過來：只有一個題目，但要用上整座島學過的東西。題目是替小島圖書館做一個小型網站，而且不靠任何框架（framework），只用瀏覽器本來就懂的三種語言：HTML、CSS 與 JavaScript。館員提了四項需求：訪客查得到開放時間與公告；能依分類瀏覽本週新書；能把想看的書記在願望清單裡；只用鍵盤或螢幕閱讀器的訪客也用得了，而且頁面載入時內容不會跳來跳去。' },
        { type: 'p', text: '一個多頁網站，其實就是放在同一個資料夾裡的幾份 HTML 檔，靠連結互相連過去。每一頁都是一份完整的文件，有自己的 `<title>`、自己的 `<h1>` 與自己的 `<main>`；頁首、主選單與頁尾則每一頁都相同。四個檔案在同一個資料夾，所以連結只要寫相對路徑，例如 `href="books.html"`（WEB03）。沒有框架時，這段共用的 HTML 得在每一頁各寫一份，改一次主選單就要改四個檔案；頁面再多下去這會變成負擔，那正是樣板與框架要解決的問題之一。這個專題只有四頁，手寫還應付得來。' },
        { type: 'table', head: ['頁面', '檔案', '主要內容', '在這一課的哪裡'], rows: [
          ['首頁', '`index.html`', '公告、開放時間、本週活動', '第一、二、五關的練習，第四關的範例'],
          ['新書', '`books.html`', '依分類向 API 取得本週新書', '第四關的練習'],
          ['願望清單', '`wishes.html`', '表單，以及可以移除項目的清單', '第三關的練習'],
          ['關於本館', '`about.html`', '館舍資訊、樓層介紹、想問館員的問題', '第一、二、三、五關的範例'],
        ] },
        { type: 'list', items: [
          '`index.html`、`books.html`、`wishes.html`、`about.html`：四個頁面放在同一個資料夾。',
          '`style.css`：全站共用的一份樣式表，每一頁的 `<head>` 都用 `<link rel="stylesheet" href="style.css">` 載入它。',
          '指令稿：每一頁只載入自己需要的程式，例如新書頁的 `books.js`，用 `<script src="books.js" defer></script>` 載入。',
        ] },
        { type: 'p', text: '預覽一次只能顯示一個頁面，三個檔案的名稱也固定是 index.html、style.css 與 script.js。所以這一課每個範例與練習的頁面，都是這個網站的其中一頁，`script.js` 就是那一頁的指令稿；點主選單的連結不會真的換頁，預覽下方會記下那個連結要去的 `href`。五關的安排如下，課文最後的互動圖可以再逐關回顧。' },
        { type: 'table', head: ['關卡', '完成後的樣子', '用到的課'], rows: [
          ['第一關　結構', '沒有任何樣式，頁面的每一塊是什麼仍然讀得出來', 'WEB02、WEB03'],
          ['第二關　樣式', '一份樣式表套用在四個頁面：黏在頂端的頁首、大小可預期的卡片', 'WEB05、WEB06、WEB07'],
          ['第三關　互動', '願望清單的表單：原生驗證、送出後加入清單、可以移除', 'WEB04、WEB08、WEB09'],
          ['第四關　資料', '新書清單來自 API，載入中、沒有資料與失敗都有交代，並記住上次選的分類', 'WEB10、WEB11、WEB12'],
          ['第五關　無障礙與效能', '選單按鈕鍵盤與螢幕閱讀器都能用；指令稿不擋住解析，晚到的內容不推擠版面', 'WEB13、WEB14'],
        ] },
        { type: 'callout', tone: 'tip', title: '一層一層疊上去', text: '五關的順序不是隨便排的：先 HTML，再 CSS，最後才是 JavaScript。每完成一層，頁面都是可以用的：只有 HTML 時讀得懂、連結點得動；加上 CSS 變得好看；JavaScript 只負責沒有它就做不到的事。這也是除錯的順序：畫面不對，先看結構，再看樣式，最後才懷疑程式。' },
      ],
    },
    {
      id: 'web15-structure', title: '第一關　結構：沒有樣式也讀得懂',
      blocks: [
        { type: 'p', text: '第一關不寫任何 CSS，目標是語意結構：光看標籤，就知道頁面的每一塊是什麼。四個頁面共用同一副骨架，只有 `<main>` 裡面的內容不同：' },
        { type: 'list', ordered: true, items: [
          '`<!DOCTYPE html>` 與 `<html lang="zh-Hant">`；`<head>` 裡宣告編碼與 viewport，再加上這一頁專屬的 `<title>`（WEB02）。',
          '`<header>`：站名（連回首頁的連結），以及包在 `<nav>` 裡的主選單。四個連結都寫相對路徑；指向目前這一頁的那一個，加上 `aria-current="page"`。',
          '`<main>`：這一頁獨有的內容，一頁只有一個。裡面唯一的 `<h1>` 寫這一頁的主題；每一節用 `<section>` 包起來，標題用 `<h2>`，層級不跳號。',
          '`<footer>`：每一頁都相同的聯絡資訊。',
        ] },
        { type: 'p', text: '下面是「關於本館」這一頁在第一關完成時的樣子。' },
        { type: 'example', id: 'web15-about-structure' },
        { type: 'p', text: '先看預覽：沒有任何樣式，但標題、段落與清單的層次一目了然，連結也都點得動。點一下主選單的「新書」，預覽下方會記錄它要去 `books.html`：四個檔案在同一個資料夾，相對路徑只要寫檔名。再展開 DOM 樹：`body` 底下依序是 `header`、`main`、`footer`，螢幕閱讀器的使用者可以靠這幾個地標（landmark）直接跳到主要內容。`aria-current="page"` 在畫面上還看不出差別，但螢幕閱讀器會把這個連結唸成「目前的頁面」之類的說法（實際的唸法依軟體而不同），使用者不必猜自己在哪一頁；第二關的樣式表也會認這個屬性。' },
        { type: 'table', head: ['項目', '這個網站的做法', '原因'], rows: [
          ['`<title>`', '「頁名｜站名」，例如「關於本館｜小島圖書館」', '分頁標籤、書籤與搜尋結果顯示的都是它；四頁都只寫站名就分不出來'],
          ['`<h1>`', '這一頁的主題；只有首頁用站名', '標題大綱從 `<h1>` 開始，它要回答「這一頁在講什麼」'],
          ['主選單的連結', '相對路徑：`href="about.html"`', '整個資料夾搬到別的位置，頁面之間的連結仍然有效'],
          ['目前的頁面', '`aria-current="page"`，不另外加 `class="current"`', '同一個屬性同時告訴輔助科技與樣式表，狀態只寫在一個地方'],
        ] },
        { type: 'callout', tone: 'warning', title: '複製頁面時最常忘記改的三個地方', text: '新的頁面通常是複製舊頁面改出來的。最常忘記改的是 `<title>`、`<h1>`，以及 `aria-current="page"` 還留在原來那個連結上：主選單告訴使用者「你在首頁」，其實他在「新書」。每新增一頁，就把這三處對一遍。' },
      ],
    },
    {
      id: 'web15-style', title: '第二關　樣式：一份樣式表管四個頁面',
      blocks: [
        { type: 'p', text: '第二關只新增一個檔案：`style.css`。四個頁面的 `<head>` 都用同一行 `<link>` 載入它，所以這一份樣式表要管全站。為了讓它好維護，這個專題守三條規則，都來自 WEB05 到 WEB07：' },
        { type: 'list', items: [
          '選擇器以 class 為主（`.site-header`、`.card`），特異性都很低而且差不多。之後要調整某一塊時，不必為了贏過舊規則而把選擇器越寫越長，更用不到 `!important`。',
          '設定了寬度的盒子用 `box-sizing: border-box`：`width` 寫多少，量起來就是多少，改留白與邊框時不必重算。',
          '只有需要蓋在別人上面的元素（頁首，以及之後的選單）才給 `z-index`，數字集中在少數幾個地方。',
        ] },
        { type: 'p', text: '`.card` 是全站重複使用的卡片：寬 300px、留白 16px、邊框 1px，再加上 `max-width: 100%`，螢幕比 300px 窄時不會超出版面。頁首用 `position: sticky; top: 0;` 留在視窗頂端：它仍然佔著原本的位置，所以不像 `fixed` 那樣需要替內容補上間距。卡片為了當右上角徽章的包含區塊而寫了 `position: relative`，它因此是定位元素，原始碼又排在頁首後面；頁首如果沒有 `z-index`，捲動時卡片會從頁首的上面經過。' },
        { type: 'example', id: 'web15-about-style' },
        { type: 'p', text: '在預覽裡往下捲：頁首留在最上面，卡片與徽章從它底下經過。接著用「動手改這個範例」做兩個實驗。刪掉 `.site-header` 的 `z-index: 10` 再捲一次，徽章就蓋到頁首上了。刪掉 `.card` 的 `box-sizing: border-box`，卡片變成 334px 寬：300 加上兩側留白 32 與兩側邊框 2。最後看主選單：「關於本館」是粗體，因為 `.site-nav a[aria-current="page"]` 這條規則跟著 HTML 的屬性走，換到別的頁面不必改 CSS。把預覽拉窄，頁首的連結會折成兩行；這個問題留到第五關處理。' },
        { type: 'table', head: ['選擇器', '特異性', '在這份樣式表的用途'], rows: [
          ['`.card`', '0-1-0', '可重複使用的元件：每一頁的卡片都長一樣'],
          ['`.site-header a`', '0-1-1', '只影響頁首裡的連結，不動到內文的連結'],
          ['`.site-nav a[aria-current="page"]`', '0-2-1', '狀態：目前頁面的連結。屬性選擇器和 class 同一級'],
          ['`#hours` 之類的 id 選擇器', '1-0-0', '這份樣式表不用：`id` 留給 `<label for>`、頁內錨點與指令稿，拿來寫樣式會讓後面的規則很難覆寫'],
        ] },
        { type: 'callout', tone: 'warning', title: '黏住的頁首被內容蓋過去', text: '`position: sticky` 讓頁首留在頂端，卻不保證它畫在最上面。頁面上只要有別的定位元素（這裡是 `position: relative` 的卡片），而且原始碼排在頁首之後，它捲上來時就會蓋住頁首。初學者常以為是 `sticky` 壞了，其實是堆疊順序的問題：替頁首加上 `z-index`。另外別忘了 `top: 0`，少了這個門檻，`sticky` 的元素根本不會黏住。' },
      ],
    },
    {
      id: 'web15-interaction', title: '第三關　互動：表單、送出與事件委派',
      blocks: [
        { type: 'p', text: '第三、第四關替頁面加上互動與資料：第三關處理訪客輸入的東西，第四關處理伺服器送來的東西。先做表單，順序仍然是 HTML 在前：`<label for="…">` 讓欄位有名字，點標籤的文字也會聚焦到欄位；`required` 讓瀏覽器在欄位空白時自己擋下送出並提示使用者。這兩件事一行 JavaScript 都不用寫（WEB04）。' },
        { type: 'p', text: 'JavaScript 只做 HTML 做不到的事。第一，監聽表單的 `submit`，而不是按鈕的 `click`：按鈕與 Enter 都會觸發 `submit`，而且它發生在原生驗證通過之後。第二，監聽器的第一行呼叫 `event.preventDefault()`，否則瀏覽器會送出表單、重新載入頁面，剛加進清單的項目立刻消失。第三，用 `createElement` 與 `textContent` 把訪客輸入的文字做成清單項目；不用 `innerHTML`，訪客輸入的 `<b>` 就只是三個字元，不會變成標籤（WEB08）。每個項目的「刪除」按鈕是之後才出現的，所以不逐一登記監聽器，而是在一開始就存在的 `<ul>` 上用事件委派處理（WEB09）。' },
        { type: 'p', text: '下面是「關於本館」頁裡的一小塊：讓訪客把想問館員的問題先記下來。`style.css` 仍是第二關那一份，只多了最後三行表單用的規則。' },
        { type: 'example', id: 'web15-about-ask' },
        { type: 'p', text: '什麼都不輸入就按「記下來」：瀏覽器顯示它自己的提示，清單沒有變化，`submit` 事件根本沒有發生。輸入一個問題後按 Enter，項目出現、欄位清空（`trim()` 會回傳去掉前後空白的字串，只剩空字串時就不加入）；再加一個，然後按第一項的「刪除」。這顆按鈕是程式剛剛才建立的，卻刪得掉，因為點擊會冒泡到 `#questions`，監聽器再用 `event.target.closest(\'.remove\')` 判斷按到的是不是刪除按鈕。另外注意 `aria-label` 那一行：畫面上每顆按鈕都寫「刪除」，螢幕閱讀器的使用者逐顆聽到的若只是「刪除、刪除、刪除」，分不出哪一顆對應哪個問題，所以程式替每顆按鈕取了包含問題內容的無障礙名稱（WEB13）。' },
        { type: 'callout', tone: 'warning', title: 'required 擋不住只有空白的輸入', text: '`required` 只檢查欄位是不是空的。訪客只按了幾下空白鍵，瀏覽器就認為欄位有內容，`submit` 照樣發生。所以監聽器裡先用 `trim()` 去掉前後的空白，剩下空字串就不加入。原生驗證是給使用者的第一道提示，不是唯一的一道檢查；資料如果要送到伺服器，伺服器還要再驗一次。' },
        { type: 'callout', tone: 'note', title: '這份清單還不會被記住', text: '清單只存在這個頁面的 DOM 裡，重新載入就空了。要讓它留下來，可以用 WEB12 的做法把陣列轉成 JSON 存進 `localStorage`；要讓館員真的收到，則要用 WEB11 的 `POST` 請求送到伺服器。這一關先把表單與清單本身做對；另外，預覽不會真的送出表單，只會在下方記錄送出的資料。' },
      ],
    },
    {
      id: 'web15-data', title: '第四關　資料：向 API 取清單，記住訪客的選擇',
      blocks: [
        { type: 'p', text: '第四關的資料來自伺服器。和 WEB11 一樣，預覽沒有網路，請求由頁面的假伺服器回答，預覽下方的「網路請求」會列出每個請求與它得到的狀態碼；程式的寫法和面對真正的伺服器時完全相同。任何向伺服器要資料的畫面都要交代三種狀態：載入中、成功（包含成功但一筆都沒有）、失敗。少了任何一種，使用者就會在某個時刻面對一片空白，不知道是還在等、真的沒有，還是壞了。' },
        { type: 'table', head: ['情況', '`fetch` 的結果', '頁面該顯示什麼'], rows: [
          ['回應 200，陣列裡有資料', 'Promise 是 fulfilled，`response.ok` 是 `true`', '清單與筆數'],
          ['回應 200，內容是空陣列', '同上：這也是成功', '一句說明，例如「這一類本週沒有活動」；不是留白，更不是錯誤訊息'],
          ['回應 404 或 500', 'Promise 仍然是 fulfilled，但 `response.ok` 是 `false`', '失敗的訊息；要自己檢查 `response.ok` 並丟出錯誤'],
          ['連不上伺服器', 'Promise 是 rejected，`await` 那一行丟出錯誤', '失敗的訊息；由 `catch` 接住'],
        ] },
        { type: 'p', text: '第二件事是記住訪客的選擇。訪客上次選了「親子」，下次打開首頁就應該直接看到親子活動。這種只跟這台瀏覽器有關、丟了也無妨的偏好，正適合放在 `localStorage`（WEB12）：選擇改變時用 `setItem` 存起來；頁面載入時先用 `getItem` 讀，有值就套用，然後才發出第一個請求。範例裡還有一個新的方法：`list.replaceChildren()` 不帶參數時，會把清單裡的子元素全部移除，每次重新載入之前先用它清掉上一次的結果。讀寫都用方法，不要寫成 `localStorage.audience` 這種屬性的形式，這個預覽也只支援方法。' },
        { type: 'example', id: 'web15-home-events' },
        { type: 'p', text: '這個範例模擬一位回訪的訪客：`localStorage` 裡已經有 `audience`，值是 `kids`。看「網路請求」：第一個請求就是 `/api/events?audience=kids`，頁面沒有先載入「全部」再換過去。把選單換成「成人」：短暫的「載入中…」之後是「這一類本週沒有活動」，伺服器回的是 200 與空陣列。再換成「樂齡」：這個範例的假伺服器刻意對它回應 500，頁面顯示「活動載入失敗，請稍後再試」，「網路請求」裡看得到那個 500。每換一次，「儲存的資料」裡的 `audience` 都跟著更新，下一次載入頁面時讀到的就是它。`<p id="notice" role="status">` 的 `role="status"` 則讓螢幕閱讀器在文字改變時把新的狀態唸出來（WEB13）。' },
        { type: 'callout', tone: 'warning', title: '404 與 500 不會進到 catch', text: '`fetch` 只有在連不上伺服器時才會 rejected。伺服器回了 404 或 500，對 `fetch` 來說是順利收到一個回應。少了 `if (!response.ok) throw …` 這一行，程式會把錯誤回應的內容當成資料繼續處理：運氣好是後面的程式出錯、剛好被 `catch` 接住；運氣不好是畫面顯示「共 undefined 場活動」，或是把伺服器的故障說成「沒有活動」。' },
        { type: 'callout', tone: 'note', title: '讀回來的資料不一定還有效', text: '`localStorage` 裡的值可能是舊版網站存的，例如一個已經被拿掉的選項。把 `<select>` 的 `value` 設成不存在的選項，它會變成什麼都沒選。正式的網站在套用之前要先確認這個值還在選項裡，不在就改用預設值；這個範例為了簡短省略了這一步。' },
      ],
    },
    {
      id: 'web15-quality', title: '第五關　無障礙與效能：上線前的檢查',
      blocks: [
        { type: 'p', text: '最後一關不加新功能，而是替已經做好的頁面補上兩種平常看不出來、卻一定有人會遇到的品質：無障礙與效能。場景是這樣的：四個連結在手機那麼窄的畫面上擠不下，所以把主選單收進頁首右邊的一顆選單按鈕。什麼寬度該用哪一種排法是響應式設計島的主題，這一關只管把選單本身做對。無障礙的部分都來自 WEB13：' },
        { type: 'list', items: [
          '用原生的 `<button>`：不必寫任何程式，它就能用 Tab 聚焦、用 Enter 與空白鍵按下。',
          '按鈕上只有圖示「☰」，所以用 `aria-label="選單"` 給它無障礙名稱；圖示本身包在 `aria-hidden="true"` 的 `<span>` 裡。',
          '`aria-expanded` 說出選單現在是開是關，`aria-controls` 指向選單的 `id`。ARIA 只改變被唸成什麼，不會自己動：每次開合，指令稿都要把 `aria-expanded` 改成正確的值。',
          '收起來的選單用 `hidden` 屬性：畫面上看不到，Tab 也走不進去。',
          '選單開著時按 Escape 會收起，並把焦點交還給按鈕；否則焦點留在已經消失的連結上，鍵盤使用者就迷路了。',
        ] },
        { type: 'p', text: '效能的部分做兩件事，都來自 WEB14。第一，指令稿用 `<script src="script.js" defer></script>` 放在 `<head>`：瀏覽器不必停下來等它，照常往下解析 HTML，等整份文件解析完才執行，那時指令稿要找的元素都已經存在。第二，替晚到的內容預留位置。這一頁的「今日開館狀態」要等伺服器回應才有文字；如果它原本的高度是 0，文字一到，下面的卡片就被往下推，這就是 WEB14 說的版面位移。解法是讓它在資料回來之前就佔好該有的高度：`min-height: 48px`。' },
        { type: 'example', id: 'web15-about-menu' },
        { type: 'p', text: '先看畫面：卡片上方有一條空著的色塊，假伺服器在 300 毫秒後回應，文字才出現，卡片沒有移動。刪掉 `.notice` 的 `min-height: 48px` 再執行一次，就看得到卡片被往下推。接著只用鍵盤操作：按 Tab 走到「☰」按鈕，按 Enter 打開選單，再按 Tab 走進第一個連結，然後按 Escape：選單收起，焦點回到按鈕。DOM 樹裡，按鈕的 `aria-expanded` 跟著在 `true` 與 `false` 之間切換：`setOpen` 每次都同時改 `hidden` 與 `aria-expanded`，兩者不會不一致（`String(open)` 把布林值轉成屬性要的文字）。兩件事要記得：預覽把 `defer` 模擬成在 `body` 結尾執行，所以 DOM 樹裡的 `script` 出現在 `body` 的最後；預覽也量不出真正的載入時間與 Core Web Vitals，頁面上線後要用 WEB14 介紹的 Lighthouse 與 Performance 面板實際量測，修改前後各量一次。' },
        { type: 'callout', tone: 'warning', title: 'CSS 的 display 會蓋掉 hidden', text: '`hidden` 屬性是靠瀏覽器內建的樣式 `display: none` 生效的。只要你的樣式表對同一個元素寫了 `display: block`（或其他的 `display` 值），就會蓋過它：屬性明明還在，選單卻收不起來，`aria-expanded` 也跟著與畫面不一致。這份樣式表只對選單裡的連結寫 `display: block`，沒有對 `.site-menu` 本身寫 `display`。如果一定要寫，就再補一條 `.site-menu[hidden] { display: none; }`。' },
        { type: 'callout', tone: 'tip', title: '預留位置的另一種做法', text: '`min-height` 之外，也可以讓那個位置一開始就有內容：例如先在 HTML 裡寫好「公告載入中…」，資料到了再換掉文字。兩種做法的重點相同：晚到的內容要取代已經佔好的位置，而不是擠進來把別人推開。如果事先不知道內容會有多高，就預留最常見的高度，並把晚到的內容放在其他內容的下方。' },
      ],
    },
    {
      id: 'web15-checklist', title: '檢查清單與下一步',
      blocks: [
        { type: 'p', text: '五關做完，網站的每一頁都應該通過下面這張清單。它也是這座島的總複習：每一列對應幾堂課，哪一列答不出來，就回去看那幾課。' },
        { type: 'table', head: ['面向', '要確認的事', '怎麼確認'], rows: [
          ['語意結構', '每一頁有 doctype、`lang` 與專屬的 `<title>`；`header`、`nav`、`main`、`footer` 各就各位；只有一個 `<h1>`，標題不跳級；目前頁面的連結有 `aria-current="page"`', '把樣式表拿掉仍然讀得懂；在開發者工具看 DOM 樹'],
          ['樣式', '全站共用一份樣式表；選擇器以 class 為主；設了寬度的盒子用 `border-box`；黏在頂端的頁首不蓋住內容，也不被內容蓋住', '把視窗拉窄、往下捲；在開發者工具看計算後的樣式'],
          ['互動', '每個欄位都有 `<label>`；能用原生驗證的就用；監聽 `submit` 並取消預設的送出；動態產生的按鈕用事件委派', '只用鍵盤送出一次；空白送出一次；新增之後立刻移除'],
          ['資料', '載入中、成功（包含沒有資料）、失敗都有畫面；檢查 `response.ok`；存在瀏覽器的只有偏好，讀不到時有預設值', '在開發者工具把網路切成離線再試；清掉儲存的資料後重新載入'],
          ['無障礙', '每個按鈕與連結都有無障礙名稱；自製元件的狀態寫在 ARIA 屬性上，並由指令稿維持；開合時焦點有去處', '放下滑鼠，只用鍵盤操作一遍；再用螢幕閱讀器聽一遍'],
          ['效能', '指令稿不擋住解析（`defer`）；晚到的內容有預留的位置；有圖片的話，寫了 `width` 與 `height`', '用 Lighthouse 量測，修改前後各量一次'],
        ] },
        { type: 'p', text: '這個網站還缺兩樣東西，正好是接下來兩座島的主題。第一，它在手機、平板與桌機上應該有不同的排法：主選單什麼時候收成按鈕、卡片什麼時候並排，是響應式設計島的內容。第二，四個頁面各有一份重複的頁首，清單的畫面與資料也靠手動保持一致；頁面與狀態再多下去，就需要元件與框架來管理，那是前端開發島的內容。到時候你會發現，框架最後產生的仍然是這一課親手寫過的東西：語意元素、樣式規則、事件監聽器與 `fetch`。' },
        { type: 'callout', tone: 'note', title: '這個專題沒有真正的後端', text: '新書、活動與公告都由預覽的假伺服器回答，願望清單也只存在頁面裡。把資料存進資料庫、讓館員登入後台管理，需要伺服器端的程式，不在這座島的範圍。你完成的是網站在瀏覽器裡的那一半；它需要伺服器提供什麼，已經寫在每一個 `fetch` 的位址與回應的格式裡。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  visualization: {
    kind: 'challenge-stages', title: '小島圖書館的網站：五個關卡',
    stages: [
      {
        title: '結構', concepts: ['WEB02', 'WEB03'],
        goal: '首頁是一份完整的文件：有 lang 與專屬的標題，header、nav、main、footer 各就各位，只有一個 h1，主選單標出目前的頁面。',
        detail: '四個頁面共用同一副骨架，只有 main 的內容不同。title 寫成「頁名｜站名」，h1 寫這一頁的主題；主選單的連結用相對路徑，目前頁面的連結用 aria-current="page" 而不是 class。複製頁面時最容易忘記改 title、h1 與 aria-current。',
      },
      {
        title: '樣式', concepts: ['WEB05', 'WEB06', 'WEB07'],
        goal: '一份全站共用的樣式表：目前頁面的連結是粗體，卡片量起來剛好 300px，頁首黏在視窗頂端而且不被卡片蓋住。',
        detail: '選擇器以 class 為主，特異性低而且接近；狀態跟著屬性走，用 .site-nav a[aria-current="page"]。設了寬度的盒子用 border-box，不必重算留白與邊框。sticky 的頁首要有 top 才會黏住，要有 z-index 才不會被後面的定位元素蓋過去。',
      },
      {
        title: '互動', concepts: ['WEB04', 'WEB08', 'WEB09'],
        goal: '願望清單的欄位有標籤而且必填；送出時不重新載入頁面，書名加進清單並清空欄位；每一項都移除得掉。',
        detail: '先用 label 與 required 讓瀏覽器做它會做的事，再監聽表單的 submit（按鈕與 Enter 都算），第一行 preventDefault。書名在監聽器裡讀，用 trim 去掉空白，用 createElement 與 textContent 建立項目。移除按鈕是後來才建立的，監聽器登記在清單上，用事件委派處理。',
      },
      {
        title: '資料', concepts: ['WEB10', 'WEB11', 'WEB12'],
        goal: '新書清單來自 API：載入中、有書、沒有書與失敗各有畫面；換分類時存下選擇，回訪時先還原再發出第一個請求。',
        detail: 'fetch 只在連不上時 rejected，404 與 500 要自己檢查 response.ok 再丟出錯誤，讓兩種失敗都進 catch。每次載入先顯示載入中並清空舊的清單；空陣列是成功，要給一句說明。localStorage 用 setItem 與 getItem，沒存過時讀到 null；還原要寫在第一次載入之前。',
      },
      {
        title: '無障礙與效能', concepts: ['WEB13', 'WEB14'],
        goal: '選單按鈕有名稱，aria-expanded 跟著開合，Escape 收起並交還焦點；指令稿用 defer 載入；公告到達前後，下面的卡片不移動。',
        detail: '只有圖示的按鈕用 aria-label 取名，名字不能加在 aria-hidden 的圖示上。ARIA 的狀態不會自己更新，hidden 每改一次 aria-expanded 就跟著改一次；樣式表不要對選單寫 display，否則會蓋掉 hidden。head 裡的指令稿加 defer 才找得到元素；晚到的內容用 min-height 先佔好位置。',
      },
    ],
  },
  quiz: [
    {
      id: 'web15-q1', prompt: '`books.html` 是小島圖書館四個頁面之一，內容是本週新書的清單。這一頁的 `<title>` 與 `<h1>` 怎麼寫最合適？',
      options: [
        '`<title>` 與 `<h1>` 都寫「小島圖書館」：全站一致最好記',
        '`<title>` 寫「新書｜小島圖書館」；頁首已經有站名，所以頁面裡不必放 `<h1>`',
        '`<title>` 寫「新書｜小島圖書館」，`<h1>` 寫「本週新書」',
        '`<title>` 寫「新書｜小島圖書館」；站名與「本週新書」各用一個 `<h1>`',
      ],
      answer: 2,
      explanation: '`<title>` 是分頁標籤、書籤與搜尋結果上的名字，每一頁都要不同，所以寫成「頁名｜站名」；`<h1>` 是標題大綱的起點，寫這一頁的主題「本週新書」。四頁都寫「小島圖書館」的話，使用者開了幾個分頁就分不出哪個是哪個。沒有 `<h1>` 的頁面，大綱少了起點，靠標題瀏覽的人找不到這一頁的主題。兩個 `<h1>` 則讓人分不清哪一個才是主題；站名是每一頁都重複的東西，放在 `<header>` 裡當連結就好。',
    },
    {
      id: 'web15-q2', prompt: '樣式表裡依序有這兩條規則。主選單 `<nav class="site-nav">` 裡那個有 `aria-current="page"` 的連結，最後是什麼粗細？',
      code: { language: 'CSS', text: 'a[aria-current="page"] { font-weight: 700; }\n.site-nav a { font-weight: 400; }' },
      options: [
        '400：兩條規則的特異性都是 0-1-1，平手時寫在後面的贏',
        '700：屬性選擇器的特異性比 class 選擇器高',
        '700：`aria-current` 代表狀態，瀏覽器會優先套用和狀態有關的規則',
        '不一定：要看 HTML 裡 `class` 與 `aria-current` 哪一個屬性寫在前面',
      ],
      answer: 0,
      explanation: '屬性選擇器和 class 選擇器在特異性裡是同一級。`a[aria-current="page"]` 是一個屬性加一個元素，`.site-nav a` 是一個 class 加一個元素，兩者都是 0-1-1；平手時由順序決定，寫在後面的 `.site-nav a` 贏，所以是 400。屬性選擇器並沒有比 class 高；串接也不會因為屬性「代表狀態」而優待它；HTML 裡屬性的先後順序更是完全不影響。要讓粗體贏，就把選擇器寫成 `.site-nav a[aria-current="page"]`（0-2-1），或把規則搬到後面。',
    },
    {
      id: 'web15-q3', prompt: '願望清單的表單要做到：按「加入」按鈕或在欄位裡按 Enter 都能加入；欄位空白時由 `required` 擋下，不執行加入的程式。監聽器該登記在哪裡？',
      options: [
        '按鈕的 `click`：使用者按的就是按鈕',
        '欄位的 `keydown`，判斷按的是不是 Enter；再另外登記按鈕的 `click`',
        '欄位的 `input`：內容一改變就加入',
        '表單的 `submit`：兩種送出方式都會觸發它，而且發生在原生驗證通過之後',
      ],
      answer: 3,
      explanation: '「送出表單」這件事對應的是表單的 `submit` 事件：按送出按鈕或在欄位裡按 Enter 都會觸發，而且瀏覽器先做原生驗證，沒通過就不會發生。按鈕的 `click` 發生在驗證之前，欄位空白時加入的程式照樣執行。自己監聽 `keydown` 加上 `click`，是把瀏覽器已經做好的事重寫一遍，還漏了驗證。`input` 則是每打一個字就觸發一次，清單會多出一堆打到一半的書名。',
    },
    {
      id: 'web15-q4', prompt: '網址打錯了一個字，伺服器回應 404，內容是 JSON：`{ "error": "Not Found" }`。這段程式執行後，`notice` 顯示什麼？',
      code: { language: 'JavaScript', text: "try {\n  const response = await fetch('/api/bookz');\n  const books = await response.json();\n  notice.textContent = `共 ${books.length} 本新書`;\n} catch (error) {\n  notice.textContent = '載入失敗';\n}" },
      options: [
        '「載入失敗」：404 會讓 `fetch` 回傳的 Promise 變成 rejected，由 `catch` 接住',
        '「共 undefined 本新書」：`fetch` 順利收到了回應，而那個物件沒有 `length`',
        '「共 0 本新書」：錯誤的回應會被當成空陣列',
        '維持原樣：收到 404 時，`await` 之後的程式不會執行',
      ],
      answer: 1,
      explanation: '`fetch` 只有在連不上伺服器時才會 rejected；404 是伺服器確實回了一個回應，Promise 是 fulfilled，只是 `response.ok` 為 `false`。這段程式沒有檢查它，於是 `response.json()` 把錯誤訊息解析成物件 `{ error: "Not Found" }`，物件沒有 `length`，樣板字串裡就出現 `undefined`。整段沒有任何一行丟出錯誤，所以不會進到 `catch`；回應也不會被自動換成空陣列；`await` 之後的程式照常執行。修法是在取得 `response` 之後加上 `if (!response.ok) throw new Error(…);`。',
    },
    {
      id: 'web15-q5', prompt: '螢幕閱讀器的使用者用 Tab 走到這顆按鈕時，會得到什麼資訊？',
      code: { language: 'HTML', text: '<button type="button">\n  <span aria-hidden="true">☰</span>\n</button>' },
      options: [
        '角色是按鈕，名稱是「☰」這個符號的讀音',
        '角色是按鈕，但沒有無障礙名稱：只知道這裡有一顆按鈕，不知道它做什麼',
        '什麼都沒有：`aria-hidden="true"` 讓整顆按鈕從輔助科技眼中消失，Tab 也會跳過它',
        '角色是按鈕，名稱是「選單」：瀏覽器會依圖示自動補上名稱',
      ],
      answer: 1,
      explanation: '`<button>` 是原生元素，角色是按鈕，Tab 也走得到。它的名稱來自裡面的文字，但唯一的內容被 `aria-hidden="true"` 藏起來了，所以名稱是空的，使用者只聽得到「按鈕」。符號不會被唸出來，正因為它被隱藏了（這也是刻意的：符號的讀音對使用者沒有幫助）。`aria-hidden` 是加在 `<span>` 上，隱藏的只有 `<span>`，按鈕本身還在。瀏覽器不會猜圖示的意思；名稱要自己給，例如在 `<button>` 上加 `aria-label="選單"`。',
    },
    {
      id: 'web15-q6', prompt: '首頁的公告要等伺服器回應才有文字。文字一出現，下面的卡片就被往下推了一截。哪一個做法能消除這次版面位移？',
      options: [
        '替載入公告的 `<script>` 加上 `defer`',
        '替公告加上 `z-index: 10`，讓它畫在卡片上面',
        '替公告加上 `role="status"`',
        '在資料回來之前，就用 `min-height` 替公告留好它該有的高度',
      ],
      answer: 3,
      explanation: '版面位移的原因是晚到的內容擠進了原本沒有位置的地方。先用 `min-height` 替公告佔好高度，文字到了只是填進去，下面的內容不必移動。`defer` 決定的是指令稿什麼時候執行，公告仍然要等伺服器回應，晚到的事實沒有改變。`z-index` 只影響定位元素誰畫在上面，不改變元素在排版流裡佔的位置。`role="status"` 讓螢幕閱讀器唸出新的文字，是無障礙的做法，和位置無關。',
    },
    {
      id: 'web15-q7', prompt: '願望清單一開始是空的，項目都是訪客之後才用表單加進去的。這段程式在頁面載入時執行一次。之後按項目上的「移除」按鈕，會發生什麼事？',
      code: { language: 'JavaScript', text: "const buttons = document.querySelectorAll('.remove');\nfor (const button of buttons) {\n  button.addEventListener('click', () => {\n    button.closest('li').remove();\n  });\n}" },
      options: [
        '沒有反應：載入時頁面上還沒有任何 `.remove`，迴圈一顆按鈕也沒登記到',
        '正常移除：`querySelectorAll` 回傳的清單會自動納入之後才加入的按鈕，並替它們補上監聽器',
        '主控台出現錯誤：`querySelectorAll` 找不到元素時回傳 `null`，不能拿來跑迴圈',
        '只有第一個加入的項目移除得掉',
      ],
      answer: 0,
      explanation: '`querySelectorAll` 回傳的是執行當下符合條件的元素；那時清單是空的，迴圈一次也沒跑，之後才建立的按鈕身上都沒有監聽器，所以按了沒有反應，主控台也沒有任何錯誤。它回傳的清單不會自動更新，更不會替新元素補登記。找不到元素時它回傳的是空的清單，不是 `null`（回傳 `null` 的是 `querySelector`），所以不會出錯。正確的做法是把監聽器登記在一開始就存在的 `<ul>` 上，用事件委派處理。',
    },
    {
      id: 'web15-q8', prompt: '`script.js` 的第一行是 `document.querySelector(\'#menu-button\').addEventListener(\'click\', toggleMenu);`。載入這個頁面時會發生什麼事，該怎麼修？',
      code: { language: 'HTML', text: '<head>\n  <script src="script.js"></script>\n</head>\n<body>\n  <button id="menu-button" type="button">選單</button>\n</body>' },
      options: [
        '一切正常：瀏覽器會等整份 HTML 解析完，才執行 `<head>` 裡的指令稿',
        '按鈕按了沒反應，但主控台沒有錯誤；要把 `click` 改成 `submit`',
        '第一行就丟出錯誤，指令稿停在那裡：執行時按鈕還不存在，`querySelector` 回傳 `null`。替 `<script>` 加上 `defer` 就能修好',
        '瀏覽器找不到按鈕時會先建立一顆，監聽器登記在那顆看不見的按鈕上',
      ],
      answer: 2,
      explanation: '沒有 `defer` 的 `<script src>` 在瀏覽器解析到它的那一刻就執行，這時 `<body>` 還沒被解析，`querySelector` 找不到按鈕而回傳 `null`，對 `null` 呼叫 `addEventListener` 會丟出錯誤，後面的程式都不會執行。加上 `defer`（或把 `<script>` 搬到 `</body>` 前面），指令稿就會等整份文件解析完才執行。瀏覽器不會自動等待，那正是 `defer` 的作用；這種情況主控台一定有錯誤，而且和事件類型無關；`querySelector` 也不會替你建立元素。',
    },
  ],
  webCode: { examples, exercises },
};
