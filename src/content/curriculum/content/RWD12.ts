import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD12 The responsive design capstone (RWD-3): one page laid out for 360, 768 and 1280 px, the home page of the
 * made-up 小島市集, built in five stages that each use the lessons before them: a fluid mobile-first skeleton (RWD01–02),
 * a flex header whose menu collapses behind a real button below 700px (RWD03–04, RWD11), a named-area grid redrawn at
 * 700px and 1100px (RWD05–07), a product card that asks its container (RWD06, RWD08), and a clamp() heading with a
 * fluid image (RWD09–10). Each example is a finished slice of another page of the same site (攤位介紹, with its own
 * numbers) and each exercise asks for the same stage on the home page; later stages keep the earlier stages' results
 * in their files. Every exercise page pins the root font size to 16px (the px that follow from rem are then the same
 * in every learner's browser) and stages 1 and 5 are checked again at 20px. Breakpoints and container conditions are
 * in px. Every `observe` fact and every exercise (solution, starter, mistakes, variants) is run in Chromium by the
 * tests at two or three viewport widths. What the preview cannot show (srcset choices, real zoom, the user's font
 * setting, a real device) is named in the text as something to test by hand.
 */

const lines = (...text: string[]) => text.join('\n');
const indent = (text: string[], by = '  ') => text.map(l => (l ? by + l : l));

// ---- the home page (index.html), stage by stage --------------------------------------------------------------------
type Link = [href: string, text: string];
const NAV: Link[] = [['index.html', '首頁'], ['stalls.html', '攤位介紹'], ['events.html', '本週活動'], ['visit.html', '交通資訊'], ['join.html', '攤主招募'], ['about.html', '關於市集']];
const NAV_SHORT: Link[] = [['index.html', '首頁'], ['stalls.html', '攤位'], ['events.html', '活動'], ['visit.html', '交通']];
const navLinks = (links: Link[], current: string) => links.map(([href, text]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${text}</a>`);

/**
 * A whole document. The exercises state the root font size (16px, or 20px in a variant) so that the px that follow from
 * rem are the same in every learner's browser; the examples leave it to the browser.
 */
const doc = (o: { title: string; root?: number; body: string[]; script?: boolean }) => lines(
  '<!DOCTYPE html>',
  o.root ? `<html lang="zh-Hant" style="font-size: ${o.root}px;">` : '<html lang="zh-Hant">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <meta name="viewport" content="width=device-width, initial-scale=1">',
  `  <title>${o.title}</title>`,
  '  <link rel="stylesheet" href="style.css">',
  '</head>',
  '<body>',
  ...indent(o.body),
  ...(o.script ? ['  <script src="script.js"></script>'] : []),
  '</body>',
  '</html>',
);

/** Stage 1: the name of the site and the main menu as plain links. */
const HEADER_PLAIN = [
  '<header class="site-header">',
  '  <div class="wrap">',
  '    <a class="brand" href="index.html">小島市集</a>',
  '    <nav class="site-nav" aria-label="主選單">',
  ...indent(navLinks(NAV, 'index.html'), '      '),
  '    </nav>',
  '  </div>',
  '</header>',
];
/** Stage 2 on: the menu behind a real button. */
const headerMenu = (links: Link[]) => [
  '<header class="site-header">',
  '  <div class="wrap bar">',
  '    <a class="brand" href="index.html">小島市集</a>',
  '    <button class="menu-button" id="menu-button" type="button"',
  '            aria-expanded="false" aria-controls="site-menu">選單</button>',
  '    <nav class="site-nav" id="site-menu" aria-label="主選單">',
  ...indent(navLinks(links, 'index.html'), '      '),
  '    </nav>',
  '  </div>',
  '</header>',
];
const HERO_IMAGE = "<img class=\"hero-img\" src=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='300'%3E%3Crect width='1200' height='300' fill='%237fc8a9'/%3E%3Crect y='210' width='1200' height='90' fill='%23f4b860'/%3E%3Ccircle cx='1020' cy='80' r='44' fill='%23fff3c4'/%3E%3C/svg%3E\"";
const hero = (image = false) => [
  '<section id="hero">',
  '  <h1>週末，來小島市集</h1>',
  '  <p class="promo" id="promo">本週主打：鳳梨果乾買二送一</p>',
  ...(image ? [`  ${HERO_IMAGE}`, '       width="1200" height="300" alt="小島市集的攤位：遮陽棚下擺著果乾與手作商品">'] : []),
  '</section>',
];
const FEATURED_LIST = [
  '<section id="featured">',
  '  <h2>今日推薦</h2>',
  '  <ul>',
  '    <li>鳳梨果乾　每包 120 元</li>',
  '    <li>海鹽手工皂　每塊 90 元</li>',
  '    <li>椰殼小夜燈　每盞 350 元</li>',
  '  </ul>',
  '</section>',
];
const NOTICE_TEXT = '週日下午三點有街頭音樂會，B 區提早收攤。';
const NOTICE_PLAIN = ['<aside id="notice">', '  <h2>市集公告</h2>', `  <p>${NOTICE_TEXT}</p>`, '</aside>'];
const EVENTS = [
  '<section id="events">',
  '  <h2>本週活動</h2>',
  '  <ul>',
  '    <li>週六 10:00　果乾試吃</li>',
  '    <li>週六 14:00　手工皂教室</li>',
  '    <li>週日 15:00　街頭音樂會</li>',
  '  </ul>',
  '</section>',
];
const FOOTER = ['<footer class="site-footer">', '  <div class="wrap">', '    <p>小島市集・港口路 1 號・每週六、日 9:00–17:00</p>', '  </div>', '</footer>'];

const card = (name: string, price: string) => [
  '<article class="card">',
  '  <div class="thumb"></div>',
  '  <div class="text">',
  `    <h3>${name}</h3>`,
  `    <p>${price}</p>`,
  '  </div>',
  '</article>',
];
const PRODUCTS: [string, string][] = [['鳳梨果乾', '每包 120 元'], ['海鹽手工皂', '每塊 90 元'], ['椰殼小夜燈', '每盞 350 元']];
const FEATURED_CARDS = [
  '<section id="featured">',
  '  <h2>今日推薦</h2>',
  '  <ul class="cards">',
  ...PRODUCTS.flatMap(([name, price]) => ['    <li class="slot">', ...indent(card(name, price), '      '), '    </li>']),
  '  </ul>',
  '</section>',
];
const NOTICE_CARD = [
  '<aside id="notice">',
  '  <h2>市集公告</h2>',
  `  <p>${NOTICE_TEXT}</p>`,
  '  <div class="slot">',
  ...indent(card('本日特價：芒果乾', '每包 99 元'), '    '),
  '  </div>',
  '</aside>',
];

/** index.html at each stage. */
const homeSkeleton = (root: number) => doc({ title: '小島市集', root, body: [...HEADER_PLAIN, '<main class="wrap">', ...indent([...hero(), ...FEATURED_LIST, ...NOTICE_PLAIN, ...EVENTS]), '</main>', ...FOOTER] });
const homeHeader = (links: Link[]) => doc({ title: '小島市集', root: 16, script: true, body: [...headerMenu(links), '<main class="wrap">', ...indent([...hero(), ...FEATURED_LIST, ...NOTICE_PLAIN, ...EVENTS]), '</main>', ...FOOTER] });
const HOME_LAYOUT = doc({ title: '小島市集', root: 16, script: true, body: [...headerMenu(NAV), '<main class="wrap layout">', ...indent([...hero(), ...FEATURED_LIST, ...NOTICE_PLAIN, ...EVENTS]), '</main>', ...FOOTER] });
const HOME_CARDS = doc({ title: '小島市集', root: 16, script: true, body: [...headerMenu(NAV), '<main class="wrap layout">', ...indent([...hero(), ...FEATURED_CARDS, ...NOTICE_CARD, ...EVENTS]), '</main>', ...FOOTER] });
const homeFinal = (root: number) => doc({ title: '小島市集', root, script: true, body: [...headerMenu(NAV), '<main class="wrap layout">', ...indent([...hero(true), ...FEATURED_CARDS, ...NOTICE_CARD, ...EVENTS]), '</main>', ...FOOTER] });

// ---- style.css of the home page, stage by stage --------------------------------------------------------------------
const CSS_RESET = [
  'body { margin: 0; font-family: sans-serif; line-height: 1.6; color: #2b2b2b; background-color: #fffaf0; }',
  'h1, h2, h3, p, ul { margin: 0; }',
  'ul { padding: 0; list-style: none; }',
  'h2 { margin-bottom: 0.5rem; font-size: 1.25rem; }',
];
const H1_FIXED = 'h1 { font-size: 1.75rem; line-height: 1.2; }';
const FOOTER_CSS = '.site-footer { margin-top: 2rem; padding: 1rem 0; background-color: #efe6d5; font-size: 0.875rem; }';

/** Stage 1: the whole sheet, with the three places the exercise asks for. */
const skeletonCss = (o: { wrap: string[]; gap: string; promo: string }) => lines(
  ...CSS_RESET,
  H1_FIXED,
  '',
  '/* 一、整頁共用的欄 */',
  '.wrap {',
  ...o.wrap,
  '}',
  '.site-header { padding: 0.5rem 0; background-color: #0b5c56; }',
  '.site-header a { margin-right: 0.75rem; color: #ffffff; }',
  '.brand { font-weight: 700; }',
  '',
  '/* 二、main 裡每個區塊上方的距離 */',
  'main > * {',
  o.gap,
  '}',
  '',
  '/* 三、本週主打的色塊 */',
  '.promo {',
  o.promo,
  '  height: 3rem;',
  '  margin-top: 0.5rem;',
  '  line-height: 3rem;',
  '  text-align: center;',
  '  background-color: #ffe0a3;',
  '}',
  FOOTER_CSS,
);
const WRAP_OLD = ['  width: 1152px;', '  margin: 0 auto;', '  padding: 0 16px;'];
const WRAP_DONE = ['  box-sizing: border-box;', '  max-width: 72rem;', '  margin: 0 auto;', '  padding: 0 1rem;'];

/** Stages 2–5: the first stage's result, one rule a line. `flow` keeps the spacing between the blocks of main (until the grid's gap takes over in stage 3). */
const firstDone = (flow: boolean) => [
  '/* ── 第一關：骨架（已完成） ── */',
  '.wrap { box-sizing: border-box; max-width: 72rem; margin: 0 auto; padding: 0 1rem; }',
  ...(flow ? ['main > * { margin-top: 1.5rem; }'] : []),
  '.promo { max-width: 30rem; height: 3rem; margin-top: 0.5rem; line-height: 3rem; text-align: center; background-color: #ffe0a3; }',
  FOOTER_CSS,
];
/** Stage 2: the header. `bar` is the flex container's declarations and `wide` the rules from 700px up. */
const headerCss = (o: { bar: string[]; wide: string[]; done?: boolean }) => [
  o.done ? '/* ── 第二關：頁首與導覽（已完成） ── */' : '/* ── 第二關：頁首與導覽 ── */',
  '.site-header { background-color: #0b5c56; }',
  '.site-header a { color: #ffffff; }',
  '.bar {',
  '  padding-top: 0.5rem;',
  '  padding-bottom: 0.5rem;',
  ...o.bar,
  '}',
  '.brand { font-size: 1.25rem; font-weight: 700; line-height: 2.5rem; text-decoration-line: none; }',
  '.menu-button { width: 4.5rem; height: 2.5rem; font-size: 1rem; }',
  '.site-nav { display: none; flex-basis: 100%; }',
  '.is-open { display: block; }',
  '.site-nav a { display: block; padding: 0 0.75rem; line-height: 2.75rem; }',
  ...o.wide,
];
const BAR_SLOT = ['  /* 一、站名靠左、按鈕靠右，兩者對齊中線；放不下時可以換行 */'];
const BAR_DONE = ['  display: flex;', '  flex-wrap: wrap;', '  justify-content: space-between;', '  align-items: center;'];
const WIDE_SLOT = ['', '/* 二、700px 以上：藏起按鈕；選單不論開合都排成一列，回到站名的同一列 */'];
const WIDE_DONE = ['@media (min-width: 700px) {', '  .menu-button { display: none; }', '  .site-nav { display: flex; flex-basis: auto; }', '}'];
const HEADER_DONE = headerCss({ bar: BAR_DONE, wide: WIDE_DONE, done: true });
const headerStageCss = (bar: string[], wide: string[]) => lines(...CSS_RESET, H1_FIXED, '', ...firstDone(true), '', ...headerCss({ bar, wide }));

/** Stage 3: the page grid; `queries` is what the exercise asks for. */
const layoutCss = (queries: string[], done = false) => [
  done ? '/* ── 第三關：頁面版面（已完成） ── */' : '/* ── 第三關：頁面版面 ── */',
  '.layout {',
  '  display: grid;',
  '  gap: 1rem;',
  '  margin-top: 1.5rem;',
  '  grid-template-areas:',
  '    "hero"',
  '    "featured"',
  '    "notice"',
  '    "events";',
  '}',
  '#hero { grid-area: hero; }',
  '#featured { grid-area: featured; }',
  '#notice { grid-area: notice; }',
  '#events { grid-area: events; }',
  ...queries,
];
const LAYOUT_SLOT = ['', '/* 一、700px 以上：兩欄 */', '', '/* 二、1100px 以上：三欄 */'];
const QUERY_700 = [
  '@media (min-width: 700px) {',
  '  .layout {',
  '    grid-template-columns: 1fr 15rem;',
  '    grid-template-areas:',
  '      "hero     hero"',
  '      "featured notice"',
  '      "events   events";',
  '  }',
  '}',
];
const QUERY_1100 = [
  '@media (min-width: 1100px) {',
  '  .layout {',
  '    grid-template-columns: 1fr 15rem 15rem;',
  '    grid-template-areas:',
  '      "hero     hero   hero"',
  '      "featured notice events";',
  '  }',
  '}',
];
const LAYOUT_DONE = layoutCss([...QUERY_700, ...QUERY_1100], true);
const layoutStageCss = (queries: string[]) => lines(...CSS_RESET, H1_FIXED, '', ...firstDone(false), '', ...HEADER_DONE, '', ...layoutCss(queries));

/** Stage 4: the product card. */
const cardsCss = (o: { columns: string; slot: string; card?: string; query: string[]; done?: boolean }) => [
  o.done ? '/* ── 第四關：商品卡（已完成） ── */' : '/* ── 第四關：商品卡 ── */',
  '.cards {',
  '  display: grid;',
  '  gap: 1rem;',
  o.columns,
  '}',
  '.slot {',
  o.slot,
  '}',
  ...(o.card ? ['.card {', '  background-color: #ffffff;', o.card, '}'] : ['.card { background-color: #ffffff; }']),
  '.thumb { height: 6rem; background-color: #f4b860; }',
  '.text { padding: 0.5rem 0.75rem; }',
  '.card h3 { font-size: 1rem; }',
  '#notice .slot { margin-top: 0.5rem; }',
  ...o.query,
];
const COLUMNS_SLOT = '  /* 一、欄數跟著寬度增減：每欄至少 14rem，剩下的寬度平分 */';
const COLUMNS_DONE = '  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));';
const SLOT_SLOT = '  /* 二、讓每一格成為可以查詢寬度的容器 */';
const SLOT_DONE = '  container-type: inline-size;';
const CARD_QUERY_SLOT = ['', '/* 三、卡片所在的格子至少 280px 寬時，改成左右並排：6rem 的圖片欄與文字欄 */'];
const CARD_SIDE_BY_SIDE = ['  .card {', '    display: grid;', '    grid-template-columns: 6rem 1fr;', '  }', '}'];
const CARD_QUERY_DONE = ['@container (min-width: 280px) {', ...CARD_SIDE_BY_SIDE];
const CARDS_DONE = cardsCss({ columns: COLUMNS_DONE, slot: SLOT_DONE, query: CARD_QUERY_DONE, done: true });
const cardsStageCss = (o: { columns: string; slot: string; card?: string; query: string[] }) => lines(...CSS_RESET, H1_FIXED, '', ...firstDone(false), '', ...HEADER_DONE, '', ...LAYOUT_DONE, '', ...cardsCss(o));

/** Stage 5: the heading's size and the hero image. */
const finishCss = (o: { h1: string; image: string[] }) => lines(
  ...CSS_RESET, '', ...firstDone(false), '', ...HEADER_DONE, '', ...LAYOUT_DONE, '', ...CARDS_DONE, '',
  '/* ── 第五關：字級與圖片 ── */',
  'h1 {',
  '  line-height: 1.2;',
  '  /* 一、最小 1.75rem、最大 3rem，中間跟著視窗寬度變化 */',
  o.h1,
  '}',
  '.hero-img {',
  '  display: block;',
  '  margin-top: 0.75rem;',
  '  /* 二、最寬等於所在的欄，高度等比例縮放 */',
  ...o.image,
  '}',
);
const H1_OLD = '  font-size: 1.75rem;';
const H1_DONE = '  font-size: clamp(1.75rem, 1rem + 3.125vw, 3rem);';
const IMAGE_DONE = ['  max-width: 100%;', '  height: auto;'];

// ---- script.js of the home page ------------------------------------------------------------------------------------
const menuJs = (setOpen: string[]) => lines(
  "const button = document.querySelector('#menu-button');",
  "const menu = document.querySelector('#site-menu');",
  '',
  'function setOpen(open) {',
  ...setOpen,
  '}',
  '',
  '// 以下不用改：按鈕切換開合；選單開著時按 Escape 會收起，並把焦點交還給按鈕',
  "button.addEventListener('click', () => {",
  "  setOpen(button.getAttribute('aria-expanded') !== 'true');",
  '});',
  '',
  "document.addEventListener('keydown', (event) => {",
  "  if (event.key !== 'Escape' || button.getAttribute('aria-expanded') !== 'true') return;",
  '  setOpen(false);',
  '  button.focus();',
  '});',
);
const SET_OPEN_SLOT = ['  // 在這裡完成：依 open 更新按鈕的 aria-expanded，並替選單加上或拿掉 is-open'];
const SET_OPEN_DONE = ["  button.setAttribute('aria-expanded', String(open));", "  menu.classList.toggle('is-open', open);"];
const MENU_JS = menuJs(SET_OPEN_DONE);

// ---- examples: finished slices of the stalls page (攤位介紹) -------------------------------------------------------
const WRAP_RULE = ['.wrap {', '  box-sizing: border-box;', '  max-width: 72rem;', '  margin: 0 auto;', '  padding: 0 1rem;', '}'];

const stallsSkeleton: WebExample = {
  id: 'rwd12-stalls-skeleton', title: '第一關的成果：攤位頁的骨架',
  description: '市集的另一頁「攤位介紹」在第一關完成時的樣子：內容依重要性排好，頁首、主內容與頁尾各包一層 `.wrap`。沒有任何媒體查詢，也還沒有欄；所有的長度都用 rem。',
  viewport: { width: 360, height: 640 },
  widths: [360, 768, 1280],
  files: {
    html: doc({
      title: '攤位介紹｜小島市集',
      body: [
        '<header class="site-header">',
        '  <div class="wrap">',
        '    <a class="brand" href="index.html">小島市集</a>',
        '    <nav class="site-nav" aria-label="主選單">',
        ...indent(navLinks(NAV, 'stalls.html'), '      '),
        '    </nav>',
        '  </div>',
        '</header>',
        '<main class="wrap">',
        '  <section id="intro">',
        '    <h1>攤位介紹</h1>',
        '    <p>本週共有 24 個攤位，分成小吃、手作與農產三區。</p>',
        '  </section>',
        '  <section id="list">',
        '    <h2>本週攤位</h2>',
        '    <ul>',
        '      <li>A3　阿海果乾</li>',
        '      <li>B1　海風手工皂</li>',
        '      <li>C5　山坡小農</li>',
        '    </ul>',
        '  </section>',
        '  <aside id="visit">',
        '    <h2>交通資訊</h2>',
        '    <p>港口站下車，步行 5 分鐘。</p>',
        '  </aside>',
        '  <section id="hours">',
        '    <h2>營業時間</h2>',
        '    <p>每週六、日 9:00–17:00</p>',
        '  </section>',
        '</main>',
        ...FOOTER,
      ],
    }),
    css: lines(
      'body { margin: 0; font-family: sans-serif; line-height: 1.6; color: #2b2b2b; background-color: #fffaf0; }',
      'h1, h2, p, ul { margin: 0; }',
      'ul { padding-left: 1.25rem; }',
      ...WRAP_RULE,
      '.site-header { padding: 0.5rem 0; background-color: #0b5c56; }',
      '.site-header a { margin-right: 0.75rem; color: #ffffff; }',
      '.brand { font-weight: 700; }',
      'main > * { margin-top: 1.5rem; }',
      FOOTER_CSS,
    ),
  },
  observe: [
    { check: 'count', selector: '#list ~ #visit', count: 1, label: '原始碼裡「本週攤位」寫在「交通資訊」的前面：重要的內容先出現' },
    { check: 'box', selector: 'main', measure: 'width', value: 360, label: '視窗寬 360px：`main`（也是 `.wrap`）和視窗一樣寬，沒有超出去' },
    { check: 'style', selector: 'main', property: 'padding-left', value: '16px', label: '`.wrap` 的左內距是 1rem，預設字級下是 16px：內容不貼著視窗的邊' },
    { do: 'resize', width: 1280 },
    { check: 'box', selector: 'main', measure: 'width', value: 1152, label: '視窗寬 1280px：`max-width: 72rem` 讓 `main` 連同內距停在 1152px' },
    { check: 'box', selector: 'main', measure: 'left', value: 64, label: '多出來的 128px 由 `margin: 0 auto` 平分：`main` 的左緣在 64px' },
  ],
};

const stallsFilter: WebExample = {
  id: 'rwd12-stalls-filter', title: '第二關的成果：攤位頁的分類列',
  description: '攤位頁的分類列：標題在左，「分類」按鈕在右。600px 以下四個分類收在按鈕後面，按鈕的 `aria-expanded` 與清單的 `is-open` 由指令稿一起切換；600px 以上按鈕消失，分類一直排成一列。',
  viewport: { width: 360, height: 400 },
  widths: [360, 768, 1280],
  files: {
    html: lines(
      '<section class="wrap filter">',
      '  <h2 class="filter-title">本週攤位</h2>',
      '  <button class="filter-button" id="filter-button" type="button"',
      '          aria-expanded="false" aria-controls="filter-list">分類</button>',
      '  <ul class="filter-list" id="filter-list">',
      '    <li><a href="#food">小吃</a></li>',
      '    <li><a href="#craft">手作</a></li>',
      '    <li><a href="#farm">農產</a></li>',
      '    <li><a href="#books">二手書</a></li>',
      '  </ul>',
      '</section>',
      '<p class="wrap">A3　阿海果乾、B1　海風手工皂、C5　山坡小農</p>',
    ),
    css: lines(
      'body { margin: 0; font-family: sans-serif; line-height: 1.6; }',
      ...WRAP_RULE,
      '.filter {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  justify-content: space-between;',
      '  align-items: center;',
      '  padding-top: 0.5rem;',
      '  padding-bottom: 0.5rem;',
      '  background-color: #efe6d5;',
      '}',
      '.filter-title { margin: 0; font-size: 1.25rem; line-height: 2.5rem; }',
      '.filter-button { width: 4.5rem; height: 2.5rem; font-size: 1rem; }',
      '.filter-list {',
      '  display: none;',
      '  flex-basis: 100%;',
      '  margin: 0;',
      '  padding: 0;',
      '  list-style: none;',
      '}',
      '.is-open { display: block; }',
      '.filter-list a { display: block; padding: 0 0.75rem; line-height: 2.75rem; }',
      '',
      '@media (min-width: 600px) {',
      '  .filter-button { display: none; }',
      '  .filter-list { display: flex; flex-basis: auto; }',
      '}',
    ),
    js: lines(
      "const button = document.querySelector('#filter-button');",
      "const list = document.querySelector('#filter-list');",
      '',
      'function setOpen(open) {',
      "  button.setAttribute('aria-expanded', String(open));",
      "  list.classList.toggle('is-open', open);",
      '}',
      '',
      "button.addEventListener('click', () => {",
      "  setOpen(button.getAttribute('aria-expanded') !== 'true');",
      '});',
      '',
      "document.addEventListener('keydown', (event) => {",
      "  if (event.key !== 'Escape' || button.getAttribute('aria-expanded') !== 'true') return;",
      '  setOpen(false);',
      '  button.focus();',
      '});',
    ),
  },
  observe: [
    { check: 'style', selector: '.filter-list', property: 'display', value: 'none', label: '視窗寬 360px：分類清單收合著（`display` 是 `none`），只看得到標題與按鈕' },
    { do: 'click', selector: '#filter-button' },
    { check: 'attr', selector: '#filter-button', name: 'aria-expanded', value: 'true', label: '按下「分類」：按鈕的 `aria-expanded` 變成 `true`' },
    { check: 'box', selector: '.filter-list', measure: 'width', value: 328, label: '清單顯示出來，換到第二列並佔滿整列：寬 360 − 32 = 328px（`flex-basis: 100%` 加上 `flex-wrap: wrap`）' },
    { do: 'click', selector: '#filter-button' },
    { do: 'resize', width: 768 },
    { check: 'style', selector: '#filter-button', property: 'display', value: 'none', label: '再按一次關上，然後把視窗改成 768px：按鈕不顯示' },
    { check: 'style', selector: '.filter-list', property: 'display', value: 'flex', label: '清單雖然沒有 `is-open`，寬版的規則仍然讓它顯示成一列（`display` 是 `flex`）' },
  ],
};

const stallsLayout: WebExample = {
  id: 'rwd12-stalls-layout', title: '第三關的成果：攤位頁的三種版面',
  description: '攤位頁的四個區塊用色塊代表，原始碼的順序是攤位介紹、本週攤位、交通資訊、營業時間。`.layout` 是 grid：基本樣式畫一欄的圖，700px 與 1100px 兩個媒體查詢各重畫一次，並給出欄寬。',
  viewport: { width: 360, height: 640 },
  widths: [360, 768, 1280],
  files: {
    html: lines(
      '<main class="wrap layout">',
      '  <section id="intro">攤位介紹</section>',
      '  <section id="list">本週攤位</section>',
      '  <aside id="visit">交通資訊</aside>',
      '  <section id="hours">營業時間</section>',
      '</main>',
    ),
    css: lines(
      'body { margin: 0; font-family: sans-serif; }',
      ...WRAP_RULE,
      '.layout {',
      '  display: grid;',
      '  gap: 1rem;',
      '  grid-template-areas:',
      '    "intro"',
      '    "list"',
      '    "visit"',
      '    "hours";',
      '}',
      '#intro { grid-area: intro; min-height: 4rem; background-color: #ffe0a3; }',
      '#list { grid-area: list; min-height: 10rem; background-color: #c8e6c9; }',
      '#visit { grid-area: visit; min-height: 4rem; background-color: #bbdefb; }',
      '#hours { grid-area: hours; min-height: 4rem; background-color: #e1bee7; }',
      '',
      '@media (min-width: 700px) {',
      '  .layout {',
      '    grid-template-columns: 14rem 1fr;',
      '    grid-template-areas:',
      '      "intro intro"',
      '      "visit list"',
      '      "hours list";',
      '  }',
      '}',
      '@media (min-width: 1100px) {',
      '  .layout {',
      '    grid-template-columns: 14rem 1fr 14rem;',
      '    grid-template-areas:',
      '      "intro intro intro"',
      '      "visit list  hours";',
      '  }',
      '}',
    ),
  },
  observe: [
    { check: 'box', selector: '#list', measure: 'width', value: 328, label: '視窗寬 360px：一欄，「本週攤位」寬 360 − 32 = 328px' },
    { do: 'resize', width: 768 },
    { check: 'box', selector: '#visit', measure: 'left', value: 16, label: '視窗寬 768px：「交通資訊」在原始碼裡排在後面，畫面上卻在左欄（左緣在 16px）' },
    { check: 'box', selector: '#list', measure: 'left', value: 256, label: '「本週攤位」在右邊：左緣在 16 + 224 + 16 = 256px，寬 496px' },
    { do: 'resize', width: 1280 },
    { check: 'box', selector: '#hours', measure: 'left', value: 976, label: '視窗寬 1280px：「營業時間」移到第三欄，左緣在 80 + 224 + 16 + 640 + 16 = 976px' },
    { check: 'box', selector: '#hours', measure: 'top', value: 0, from: '#list', label: '「營業時間」和「本週攤位」在同一列：兩者的上緣一樣高' },
  ],
};

const stallCard = (name: string, place: string) => [
  '<article class="stall">',
  '  <div class="photo"></div>',
  '  <div class="info">',
  `    <h3>${name}</h3>`,
  `    <p>${place}</p>`,
  '  </div>',
  '</article>',
];
const stallsCards: WebExample = {
  id: 'rwd12-stalls-card', title: '第四關的成果：攤位卡自己看容器',
  description: '攤位頁的攤位卡 `.stall` 出現在兩個地方：左邊的清單（欄數由 `auto-fit` 決定）與 700px 以上才移到右邊的「新攤位」（側欄寬 16rem）。每張卡片外面包一層 `.cell` 當容器；容器至少 264px 寬時，卡片改成左右並排。',
  viewport: { width: 360, height: 800 },
  widths: [360, 768, 1280],
  files: {
    html: lines(
      '<main class="wrap page">',
      '  <section id="list">',
      '    <h2>本週攤位</h2>',
      '    <ul class="stalls">',
      ...[['阿海果乾', 'A3・果乾、蜜餞'], ['海風手工皂', 'B1・手工皂'], ['山坡小農', 'C5・當季蔬果']].flatMap(([name, place]) => ['      <li class="cell">', ...indent(stallCard(name, place), '        '), '      </li>']),
      '    </ul>',
      '  </section>',
      '  <aside id="new">',
      '    <h2>新攤位</h2>',
      '    <div class="cell">',
      ...indent(stallCard('椰子冰舖', 'A7・現做椰子冰'), '      '),
      '    </div>',
      '  </aside>',
      '</main>',
    ),
    css: lines(
      'body { margin: 0; font-family: sans-serif; line-height: 1.6; background-color: #fffaf0; }',
      'h2, h3, p, ul { margin: 0; }',
      'ul { padding: 0; list-style: none; }',
      ...WRAP_RULE,
      '.page { display: grid; gap: 1rem; }',
      '@media (min-width: 700px) {',
      '  .page { grid-template-columns: 1fr 16rem; }',
      '}',
      '',
      '.stalls {',
      '  display: grid;',
      '  gap: 1rem;',
      '  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));',
      '}',
      '.cell { container-type: inline-size; }',
      '.stall { background-color: #ffffff; }',
      '.photo { height: 6rem; background-color: #7fc8a9; }',
      '.info { padding: 0.5rem 0.75rem; }',
      '.stall h3 { font-size: 1rem; }',
      '',
      '@container (min-width: 264px) {',
      '  .stall {',
      '    display: grid;',
      '    grid-template-columns: 6rem 1fr;',
      '  }',
      '}',
    ),
  },
  observe: [
    { check: 'box', selector: '#list .photo', measure: 'width', value: 96, label: '視窗寬 360px：清單只有一欄，每格 328px，至少 264px，卡片左右並排（照片欄寬 96px）' },
    { do: 'resize', width: 768 },
    { check: 'box', selector: '#list .cell', measure: 'width', value: 224, label: '視窗寬 768px：清單寬 464px，分成 2 欄，每格 (464 − 16) ÷ 2 = 224px' },
    { check: 'box', selector: '#list .photo', measure: 'width', value: 224, label: '視窗變寬了，格子卻變窄：224px 不到 264px，卡片改成上下排列（照片佔滿 224px）' },
    { do: 'resize', width: 1280 },
    { check: 'box', selector: '#list .photo', measure: 'width', value: 96, label: '視窗寬 1280px：清單寬 848px，分成 3 欄，每格 272px，卡片又是左右並排' },
    { check: 'box', selector: '#new .photo', measure: 'width', value: 256, label: '同一個視窗、同一條規則：256px 側欄裡的卡片仍然上下排列（照片佔滿 256px）' },
  ],
};

const MAP_IMAGE = "<img class=\"map\" src=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400'%3E%3Crect width='800' height='400' fill='%23c8e6c9'/%3E%3Crect x='40' y='40' width='320' height='140' fill='%23ffe0a3'/%3E%3Crect x='440' y='40' width='320' height='140' fill='%23bbdefb'/%3E%3Crect x='40' y='220' width='720' height='140' fill='%23ffffff'/%3E%3C/svg%3E\"";
const stallsFinish: WebExample = {
  id: 'rwd12-stalls-type-image', title: '第五關的成果：攤位頁的標題與配置圖',
  description: '攤位頁的主標題用 `clamp()` 設定字級；攤位配置圖是一張原始尺寸 800 × 400px 的圖片，`<img>` 上寫了 `width` 與 `height`，CSS 只有 `max-width: 100%` 與 `height: auto` 兩個宣告。以下的數字以預設的 16px 字級計算。',
  viewport: { width: 360, height: 640 },
  widths: [360, 768, 1280],
  files: {
    html: lines(
      '<main class="wrap">',
      '  <h1>攤位介紹</h1>',
      '  <p>本週共有 24 個攤位，分成小吃、手作與農產三區。</p>',
      `  ${MAP_IMAGE}`,
      '       width="800" height="400" alt="攤位配置圖：入口在南側，左上是小吃區，右上是手作區，下方是農產區">',
      '</main>',
    ),
    css: lines(
      'body { margin: 0; font-family: sans-serif; line-height: 1.6; background-color: #fffaf0; }',
      ...WRAP_RULE,
      'h1 {',
      '  margin: 1rem 0 0.5rem;',
      '  line-height: 1.2;',
      '  font-size: clamp(1.5rem, 0.75rem + 3.125vw, 2.75rem);',
      '}',
      'p { margin: 0 0 1rem; }',
      '.map {',
      '  display: block;',
      '  max-width: 100%;',
      '  height: auto;',
      '}',
    ),
  },
  observe: [
    { check: 'style', selector: 'h1', property: 'font-size', value: '24px', label: '視窗寬 360px：偏好值是 12 + 11.25 = 23.25px，小於最小值，標題是 1.5rem（24px）' },
    { check: 'box', selector: '.map', measure: 'height', value: 164, label: '配置圖縮成 328px 寬，高度跟著是 164px：維持 2：1，沒有變形' },
    { do: 'resize', width: 768 },
    { check: 'style', selector: 'h1', property: 'font-size', value: '36px', label: '視窗寬 768px：偏好值 12 + 24 = 36px 在兩個端點之間，標題就是 36px' },
    { do: 'resize', width: 1280 },
    { check: 'style', selector: 'h1', property: 'font-size', value: '44px', label: '視窗寬 1280px：偏好值 52px 超過最大值，標題停在 2.75rem（44px）' },
    { check: 'box', selector: '.map', measure: 'width', value: 800, label: '欄有 1120px 寬，配置圖仍然是原始的 800px：`max-width` 只限制上限，不會把圖片放大' },
  ],
};

// ---- exercises: the same five stages on the home page -------------------------------------------------------------
const exSkeleton: WebExercise = {
  id: 'rwd12-x-skeleton', title: '第一關：讓首頁的骨架流動起來',
  statement: '這是小島市集首頁的第一版 index.html（不能改）：內容已經依重要性排好，頁首、主內容與頁尾各包了一層 `.wrap`。style.css 卻是舊的桌機樣式，寬度與留白都用 px 寫死，在 360px 的視窗要左右捲動才看得完。請改掉註解標出的三處，長度都用 rem：（一）`.wrap`：視窗比它窄時填滿視窗；連同左右內距在內最寬 72rem，超過時置中；左右內距各 1rem。（二）`main` 裡每個區塊上方的距離改成 1.5rem。（三）本週主打的色塊 `.promo` 最寬 30rem，所在的欄比較窄時跟著變窄。根字級是 16px 時，檢查會量到：360px 寬的頁面上 `main` 寬 360px、`#promo` 寬 328px；1280px 寬時 `main` 寬 1152px、左緣在 64px，`#promo` 寬 480px。另一份檢查把根字級換成 20px（就像使用者調大了預設字級），每個尺寸都要跟著變成 1.25 倍，所以答案裡不能留下 px。`body` 的 `margin: 0` 要保留。',
  hints: [
    '`width` 是「一定這麼寬」，`max-width` 是「最多這麼寬」。區塊元素本來就會填滿容器，所以流動的欄只需要一個上限，不需要 `width`。',
    'px 換成 rem 是除以 16：1152px 是 72rem，16px 是 1rem，24px 是 1.5rem，480px 是 30rem。「連同內距最寬 72rem」表示內距要算在寬度裡面，那是 `box-sizing` 的工作。',
    '`.wrap` 寫成 `box-sizing: border-box; max-width: 72rem; margin: 0 auto; padding: 0 1rem;`；第二處寫 `margin-top: 1.5rem;`；`.promo` 的 `width: 480px` 改成 `max-width: 30rem`。',
  ],
  explanation: '`.wrap` 沒有 `width`，所以在 360px 的視窗裡它就是 360px 寬，扣掉左右各 1rem 的內距，內容有 328px；`.promo` 的上限 30rem 比 328px 大，於是跟著欄縮成 328px。視窗 1280px 寬時，`max-width: 72rem` 把 `.wrap` 停在 1152px，`margin: 0 auto` 把多出來的 128px 平分成左右各 64px；`box-sizing: border-box` 讓這 1152px 已經包含內距。這時 `.promo` 所在的欄有 1120px，它停在自己的上限 480px。所有的數字都用 rem，根字級變成 20px 時就是 1440px、20px、30px 與 600px，版面的比例不變。',
  viewport: { width: 360, height: 1200 },
  widths: [360, 768, 1280],
  fixed: { html: homeSkeleton(16) },
  starter: { css: skeletonCss({ wrap: WRAP_OLD, gap: '  margin-top: 24px;', promo: '  width: 480px;' }) },
  solution: { css: skeletonCss({ wrap: WRAP_DONE, gap: '  margin-top: 1.5rem;', promo: '  max-width: 30rem;' }) },
  steps: [
    { check: 'box', selector: 'main', measure: 'width', value: 360, label: '頁面寬 360px：`main`（它也是 `.wrap`）和視窗一樣寬，360px，沒有超出去' },
    { check: 'box', selector: '#promo', measure: 'width', value: 328, label: '頁面寬 360px：`#promo` 跟著欄變窄，寬 328px（左右各留 1rem 的內距）' },
    { check: 'style', selector: '#featured', property: 'margin-top', value: '24px', label: '`#featured` 上方的距離是 1.5rem（根字級 16px 時是 24px）' },
    { do: 'resize', width: 1280 },
    { check: 'box', selector: 'main', measure: 'width', value: 1152, label: '頁面寬 1280px：`main` 連同內距停在 72rem，寬 1152px' },
    { check: 'box', selector: 'main', measure: 'left', value: 64, label: '頁面寬 1280px：`main` 置中，左緣在 64px' },
    { check: 'box', selector: '#promo', measure: 'width', value: 480, label: '頁面寬 1280px：`#promo` 停在自己的上限 30rem，寬 480px' },
  ],
  mistakes: [
    {
      files: { css: skeletonCss({ wrap: ['  width: 100%;', '  max-width: 72rem;', '  margin: 0 auto;', '  padding: 0 1rem;'], gap: '  margin-top: 1.5rem;', promo: '  max-width: 30rem;' }) },
      why: '加了 `width: 100%` 卻沒有 `box-sizing: border-box`。`100%` 指的是內容的寬度，左右再各加 1rem 的內距，`.wrap` 在 360px 的視窗裡變成 392px，頁面又可以左右捲動了；1280px 時也多出 2rem，成了 1184px。',
    },
    {
      files: { css: skeletonCss({ wrap: ['  box-sizing: border-box;', '  max-width: 1152px;', '  margin: 0 auto;', '  padding: 0 16px;'], gap: '  margin-top: 24px;', promo: '  max-width: 480px;' }) },
      why: '做法都對，單位卻還是 px。根字級 16px 時量起來完全一樣，所以第一份檢查會通過；但使用者把預設字級調成 20px 時，文字變大了，欄寬的上限與留白卻留在原地：一行能放的字變少，留白相對變小。用 rem 寫，這些尺寸才會跟著文字一起放大。',
    },
    {
      files: { css: skeletonCss({ wrap: WRAP_DONE, gap: '  margin-top: 1.5rem;', promo: '  width: 100%;' }) },
      why: '把 `.promo` 改成 `width: 100%`。窄視窗不再超出去了，但它在任何寬度都填滿整欄：1280px 時色塊寬 1120px，不是設計的 480px。要的是「最多 30rem」，那是 `max-width`。',
    },
  ],
  variants: [
    {
      title: '根字級是 20px（使用者把預設字級調大）：欄寬、內距與留白都跟著放大',
      fixed: { html: homeSkeleton(20) },
      steps: [
        { check: 'box', selector: '#promo', measure: 'width', value: 320, label: '頁面寬 360px：左右內距各 20px，`#promo` 寬 320px' },
        { check: 'style', selector: '#featured', property: 'margin-top', value: '30px', label: '`#featured` 上方的距離是 30px' },
        { do: 'resize', width: 1600 },
        { check: 'box', selector: 'main', measure: 'width', value: 1440, label: '頁面寬 1600px：`main` 停在 72 × 20 = 1440px' },
        { check: 'box', selector: '#promo', measure: 'width', value: 600, label: '`#promo` 的上限是 30 × 20 = 600px' },
      ],
    },
  ],
};

const exHeader: WebExercise = {
  id: 'rwd12-x-header', title: '第二關：頁首與會收合的主選單',
  statement: 'index.html 不能改。頁首多了一顆「選單」按鈕 `#menu-button`（帶有 `aria-expanded="false"` 與 `aria-controls`），主選單是 `#site-menu`，class 是 `site-nav`。style.css 已經有第一關的結果與頁首的基本樣式：選單預設是 `display: none`；加上 `is-open` 這個 class 時顯示，並用 `flex-basis: 100%` 佔一整列。請完成三處：（一）style.css：讓 `.bar` 成為 flex 容器並允許換行；站名靠左、按鈕靠右，兩者在交錯軸上置中。（二）style.css：視窗寬 700px 以上（含 700px）時藏起按鈕；選單不論有沒有 `is-open` 都用 `display: flex` 排成一列，並把 `flex-basis` 改回 `auto`，讓它回到站名的同一列。（三）script.js：完成 `setOpen(open)`。`open` 是 `true` 時把按鈕的 `aria-expanded` 設成 `"true"`、替選單加上 `is-open`；是 `false` 時設成 `"false"`、拿掉 `is-open`。檢查先在 360px 寬的頁面量：按鈕的右緣在 344px，選單沒有顯示；按一下按鈕，`aria-expanded` 是 `true`，選單佔滿第二列（寬 328px）。接著再按一下把選單關上，把頁面改成 768px：按鈕不顯示，六個連結排在站名的同一列（最後一個連結的上緣在 8px）。另一份檢查換成只有四個連結的選單：打開後按 Escape 要收起並把焦點交還給按鈕；再打開一次，把頁面改成 1000px，連結同樣要排成一列。',
  hints: [
    '先做 CSS 的第一處。四個宣告分別回答四個問題：怎麼排（`display: flex`）、放不下時能不能換行、主軸上怎麼分配空間、交錯軸上怎麼對齊。',
    '`setOpen` 只要兩行：`button.setAttribute(\'aria-expanded\', String(open));` 與 `menu.classList.toggle(\'is-open\', open);`。`toggle` 的第二個參數是 `true` 時加上 class，是 `false` 時拿掉。',
    '寬版寫在檔案的最後：`@media (min-width: 700px) { .menu-button { display: none; } .site-nav { display: flex; flex-basis: auto; } }`。這裡的 `.site-nav` 和前面的 `.is-open` 特異性相同，寫在後面，所以不論開合都贏。',
  ],
  explanation: '`.bar` 成為 flex 容器後，`justify-content: space-between` 把站名與按鈕推到兩端：360px 的頁面上，按鈕的右緣在 360 − 16 = 344px；`align-items: center` 讓高度不同的兩者對齊中線。`flex-wrap: wrap` 讓打開的選單（`flex-basis: 100%`）換到第二列，佔滿 328px。`setOpen` 把狀態同時寫在兩個地方：`aria-expanded` 給輔助科技，`is-open` 給 CSS。700px 以上，按鈕用 `display: none` 藏起來；`.site-nav { display: flex; }` 寫在 `.is-open` 之後、特異性相同，所以選單不論有沒有 `is-open` 都排成一列：在 360px 關上再拉寬不會消失，開著拉寬也不會停在直排。`flex-basis: auto` 讓它回到站名的同一列，上緣貼著 `.bar` 的內距，在 8px。',
  viewport: { width: 360, height: 800 },
  widths: [360, 768, 1280],
  fixed: { html: homeHeader(NAV) },
  starter: { css: headerStageCss(BAR_SLOT, WIDE_SLOT), js: menuJs(SET_OPEN_SLOT) },
  solution: { css: headerStageCss(BAR_DONE, ['', ...WIDE_DONE]), js: MENU_JS },
  steps: [
    { check: 'box', selector: '#menu-button', measure: 'right', value: 344, label: '頁面寬 360px：「選單」按鈕在頁首的右端，右緣在 344px' },
    { check: 'style', selector: '.site-nav', property: 'display', value: 'none', label: '頁面寬 360px：選單一開始是收合的（`display` 是 `none`）' },
    { do: 'click', selector: '#menu-button' },
    { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'true', label: '按一下按鈕：`aria-expanded` 變成 `true`' },
    { check: 'box', selector: '.site-nav', measure: 'width', value: 328, label: '選單顯示出來，自己佔滿一列：寬 328px' },
    { do: 'click', selector: '#menu-button' },
    { do: 'resize', width: 768 },
    { check: 'style', selector: '#menu-button', property: 'display', value: 'none', label: '再按一下關上選單，把頁面改成 768px：按鈕不顯示' },
    { check: 'box', selector: '.site-nav a:last-child', measure: 'top', value: 8, label: '頁面寬 768px：選單雖然關上了，六個連結仍然顯示在站名的同一列（最後一個連結的上緣在 8px）' },
  ],
  mistakes: [
    {
      files: { css: headerStageCss(BAR_DONE, ['', '@media (min-width: 700px) {', '  .menu-button { display: none; }', '}']), js: MENU_JS },
      why: '寬版的查詢只藏了按鈕，沒有替選單寫 `display`。選單沒有 `is-open` 時仍然是基本樣式的 `display: none`：使用者在窄視窗把選單關上（或從來沒有打開過），視窗一變寬，按鈕與選單都不見了，整個導覽消失。寬版要明確寫出 `.site-nav { display: flex; }`。',
    },
    {
      files: { css: headerStageCss(BAR_DONE, ['', ...WIDE_DONE]), js: menuJs(["  menu.classList.toggle('is-open', open);"]) },
      why: '`setOpen` 只切換了 `is-open`，沒有更新 `aria-expanded`。畫面上選單打開了，按鈕卻一直告訴螢幕閱讀器「已收合」；而且這份指令稿用 `aria-expanded` 判斷目前的狀態，所以選單打開之後再也關不起來。ARIA 的狀態不會自己更新，要和畫面一起改。',
    },
    {
      files: { css: headerStageCss(BAR_DONE, ['', '@media (min-width: 700px) {', '  .menu-button { display: none; }', '  .site-nav { display: flex; }', '}']), js: MENU_JS },
      why: '寬版沒有把 `flex-basis` 改回 `auto`。選單顯示了，卻還帶著窄版的 `flex-basis: 100%`：它佔滿一整列，被換到站名的下面，頁首變成兩列高。只在窄版有意義的宣告，要在寬版的查詢裡還原。',
    },
  ],
  variants: [
    {
      title: '選單換成四個比較短的連結：Escape 會收起並交還焦點；開著選單把頁面拉寬，連結仍然排成一列',
      fixed: { html: homeHeader(NAV_SHORT) },
      steps: [
        { do: 'click', selector: '#menu-button' },
        { do: 'key', selector: '#site-menu a', key: 'Escape' },
        { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'false', label: '打開後在連結上按 Escape：`aria-expanded` 變回 `false`' },
        { check: 'style', selector: '.site-nav', property: 'display', value: 'none', label: '選單收起' },
        { check: 'focus', selector: '#menu-button', label: '焦點回到按鈕' },
        { do: 'click', selector: '#menu-button' },
        { do: 'resize', width: 1000 },
        { check: 'style', selector: '#menu-button', property: 'display', value: 'none', label: '頁面寬 1000px：按鈕不顯示' },
        { check: 'box', selector: '.site-nav a:last-child', measure: 'top', value: 8, label: '選單開著拉寬：四個連結排在站名的同一列' },
      ],
    },
  ],
};

const exLayout: WebExercise = {
  id: 'rwd12-x-layout', title: '第三關：一欄、兩欄、三欄的頁面版面',
  statement: 'index.html 與 script.js 是前兩關完成的結果，不能改。`main` 多了一個 class `layout`：style.css 的「第三關」已經把它設成 grid（區塊之間的距離從這一關起由 1rem 的 `gap` 負責），四個區塊也用 `grid-area` 取好了名字：`hero`（主標題）、`featured`（今日推薦）、`notice`（市集公告）、`events`（本週活動），基本樣式是一欄。請在檔案最後加上兩個媒體查詢：（一）視窗寬 700px 以上：分成兩欄，右欄 15rem，左欄佔其餘的寬度；主標題橫跨兩欄，第二列左邊是今日推薦、右邊是市集公告，第三列的本週活動橫跨兩欄。（二）視窗寬 1100px 以上：分成三欄，第二、三欄各 15rem；主標題橫跨三欄，第二列由左到右是今日推薦、市集公告、本週活動。四個區塊的 `grid-area` 不用動。檢查會量：360px 時 `#notice` 寬 328px；768px 時 `#notice` 的左緣在 512px、`#events` 寬 736px；1280px 時 `#hero` 寬 1120px、`#notice` 的左緣在 704px、`#events` 的左緣在 960px。',
  hints: [
    '每個查詢裡只需要一條 `.layout { … }` 的規則，裡面寫兩樣東西：`grid-template-columns`（每一欄多寬）與 `grid-template-areas`（每一格是誰）。',
    '圖的每一列是一個字串，每一列的格數要相同。要橫跨兩欄，就把名字寫兩次：`"hero hero"`。兩個查詢都用 `min-width`，700px 的在前，1100px 的在後。',
    '700px：`grid-template-columns: 1fr 15rem;` 與 `grid-template-areas: "hero hero" "featured notice" "events events";`。1100px：`1fr 15rem 15rem` 與 `"hero hero hero" "featured notice events"`。',
  ],
  explanation: '360px 時兩個查詢都不成立，四個區塊排成一欄，各寬 360 − 32 = 328px。768px 時第一個查詢成立：grid 容器裡可以分配的寬度是 736px，右欄 15rem 是 240px，間距 16px，左欄拿到 736 − 240 − 16 = 480px，所以市集公告的左緣在 16 + 480 + 16 = 512px；本週活動在第三列橫跨兩欄，寬 736px。1280px 時兩個查詢都成立，寫在後面的 1100px 那一條勝出：`.wrap` 停在 1152px，可以分配的是 1120px，左欄是 1120 − 240 − 240 − 32 = 608px；主內容的左緣在 80px，所以市集公告在 80 + 608 + 16 = 704px，本週活動在 704 + 240 + 16 = 960px。區塊的名字從頭到尾沒有變，變的只有圖與欄寬；三種寬度的畫面順序也都和原始碼一致。',
  viewport: { width: 360, height: 1200 },
  widths: [360, 768, 1280],
  fixed: { html: HOME_LAYOUT, js: MENU_JS },
  starter: { css: layoutStageCss(LAYOUT_SLOT) },
  solution: { css: layoutStageCss(['', '/* 一、700px 以上：兩欄 */', ...QUERY_700, '', '/* 二、1100px 以上：三欄 */', ...QUERY_1100]) },
  steps: [
    { check: 'box', selector: '#notice', measure: 'width', value: 328, label: '頁面寬 360px：一欄，市集公告 `#notice` 佔滿整欄（寬 328px）' },
    { do: 'resize', width: 768 },
    { check: 'box', selector: '#notice', measure: 'left', value: 512, label: '頁面寬 768px：市集公告在 15rem 的右欄，左緣在 512px' },
    { check: 'box', selector: '#events', measure: 'width', value: 736, label: '頁面寬 768px：本週活動 `#events` 橫跨兩欄，寬 736px' },
    { do: 'resize', width: 1280 },
    { check: 'box', selector: '#hero', measure: 'width', value: 1120, label: '頁面寬 1280px：主標題 `#hero` 橫跨三欄，寬 1120px' },
    { check: 'box', selector: '#notice', measure: 'left', value: 704, label: '頁面寬 1280px：市集公告在第二欄，左緣在 704px' },
    { check: 'box', selector: '#events', measure: 'left', value: 960, label: '頁面寬 1280px：本週活動移到第三欄，左緣在 960px' },
  ],
  mistakes: [
    {
      files: { css: layoutStageCss(['', ...QUERY_1100, '', ...QUERY_700]) },
      why: '兩個查詢的順序由寬到窄。1280px 寬時兩個條件都成立，選擇器相同、特異性相同，寫在後面的 700px 那一條勝出，頁面永遠到不了三欄。`min-width` 的查詢要由窄到寬排。',
    },
    {
      files: { css: layoutStageCss(['', ...QUERY_700, '', '@media (min-width: 1100px) {', '  .layout {', '    grid-template-areas:', '      "hero     hero   hero"', '      "featured notice events";', '  }', '}']) },
      why: '1100px 的查詢只重畫了圖，沒有改欄寬。`grid-template-columns` 仍然是 700px 那一條的 `1fr 15rem`，圖卻有三欄：第三欄沒有定義，寬度是 `auto`，只有內容那麼寬，本週活動被擠在右邊窄窄的一欄，市集公告的位置也跟著偏掉。每次重畫圖，欄寬要一起重寫。',
    },
    {
      files: { css: layoutStageCss(['', ...QUERY_700.map(l => l.replace('"featured notice"', '"notice   featured"')), '', ...QUERY_1100]) },
      why: '700px 的圖裡，第二列的兩個名字寫反了。字串裡由左到右就是欄的順序：`notice` 寫在前面，市集公告就落在會伸縮的左欄，今日推薦反而被塞進 15rem 的右欄。圖的每一格要和 `grid-template-columns` 的每一欄對得起來。',
    },
  ],
};

const exCards: WebExercise = {
  id: 'rwd12-x-cards', title: '第四關：會自己調整的商品卡',
  statement: 'index.html 與 script.js 不能改。今日推薦的三件商品與市集公告裡的「本日特價」都換成了商品卡 `.card`：`.thumb` 是照片的位置（高 6rem，先用色塊代表），`.text` 是文字；每張卡片外面都包了一層 `.slot`。請在 style.css 的「第四關」完成三處：（一）`.cards` 的欄數不要寫死：每欄至少 14rem，排得下幾欄就排幾欄，再把剩下的寬度平分。（二）讓每個 `.slot` 成為可以查詢寬度的容器。（三）卡片所在的 `.slot` 至少 280px 寬時，`.card` 改成左右並排：左邊是 6rem 寬的 `.thumb`，右邊是 `.text`；不到 280px 時維持上下排列。卡片的排法不可以由視窗的寬度決定。檢查會量：360px 時今日推薦的卡片是橫排（`.thumb` 寬 96px）；768px 時每格寬 232px，卡片是直排（`.thumb` 寬 232px）；1280px 時每格寬 296px，卡片是橫排，而 240px 側欄裡的那一張仍然是直排（`.thumb` 寬 240px）。',
  hints: [
    '第一處是「CSS Grid 進階：區域與自動排列」那一課的寫法：`repeat()` 的次數換成 `auto-fit`，欄寬用 `minmax(下限, 1fr)`。',
    '容器是 `.slot`，不是 `.card`：`.slot { container-type: inline-size; }`。問容器的規則寫成 `@container (min-width: 280px) { … }`。',
    '查詢裡寫 `.card { display: grid; grid-template-columns: 6rem 1fr; }`：第一欄 6rem 放 `.thumb`，第二欄放 `.text`。',
  ],
  explanation: '`repeat(auto-fit, minmax(14rem, 1fr))` 讓欄數跟著今日推薦的寬度：360px 時它有 328px，只放得下一欄；768px 時有 480px，(480 + 16) ÷ (224 + 16) 無條件捨去是 2 欄，每欄 (480 − 16) ÷ 2 = 232px；1280px 時有 608px，仍然是 2 欄，每欄 296px。`.slot` 是容器，`@container (min-width: 280px)` 讓每張卡片各自問自己的格子：328px 與 296px 的格子成立，卡片分成 6rem 的圖片欄與文字欄；232px 的格子與 240px 的側欄不成立，維持上下排列。768px 的格子比 360px 時還窄：決定卡片排法的是容器，不是視窗。',
  viewport: { width: 360, height: 1200 },
  widths: [360, 768, 1280],
  fixed: { html: HOME_CARDS, js: MENU_JS },
  starter: { css: cardsStageCss({ columns: COLUMNS_SLOT, slot: SLOT_SLOT, query: CARD_QUERY_SLOT }) },
  solution: { css: cardsStageCss({ columns: COLUMNS_DONE, slot: SLOT_DONE, query: ['', ...CARD_QUERY_DONE] }) },
  steps: [
    { check: 'box', selector: '#featured .thumb', measure: 'width', value: 96, label: '頁面寬 360px：今日推薦只有一欄（每格 328px），卡片左右並排，`.thumb` 寬 96px' },
    { do: 'resize', width: 768 },
    { check: 'box', selector: '#featured .slot', measure: 'width', value: 232, label: '頁面寬 768px：今日推薦分成兩欄，每格寬 232px' },
    { check: 'box', selector: '#featured .thumb', measure: 'width', value: 232, label: '頁面寬 768px：格子不到 280px，卡片上下排列，`.thumb` 佔滿 232px' },
    { do: 'resize', width: 1280 },
    { check: 'box', selector: '#featured .slot', measure: 'width', value: 296, label: '頁面寬 1280px：今日推薦仍是兩欄，每格寬 296px' },
    { check: 'box', selector: '#featured .thumb', measure: 'width', value: 96, label: '頁面寬 1280px：今日推薦的卡片左右並排，`.thumb` 寬 96px' },
    { check: 'box', selector: '#notice .thumb', measure: 'width', value: 240, label: '頁面寬 1280px：240px 側欄裡的卡片仍然上下排列，`.thumb` 佔滿 240px' },
  ],
  mistakes: [
    {
      files: { css: cardsStageCss({ columns: COLUMNS_DONE, slot: SLOT_DONE, query: ['', '@media (min-width: 280px) {', ...CARD_SIDE_BY_SIDE] }) },
      why: '卡片的排法寫在 `@media (min-width: 280px)` 裡。任何裝置的視窗都比 280px 寬，所以這個條件永遠成立：768px 時 232px 的格子、1280px 時 240px 的側欄，卡片全部橫排，文字被擠得很窄。卡片要問的是自己的格子，用 `@container`。',
    },
    {
      files: { css: cardsStageCss({ columns: COLUMNS_DONE, slot: SLOT_SLOT, card: '  container-type: inline-size;', query: ['', ...CARD_QUERY_DONE] }) },
      why: '把 `container-type: inline-size` 寫在 `.card` 上。`@container` 裡的 `.card` 規則要找的是卡片的「祖先」裡最近的容器，卡片不能查詢自己；`.slot` 不是容器，於是這條規則永遠不套用，所有卡片都是直排。容器要設在外面的 `.slot`。',
    },
    {
      files: { css: cardsStageCss({ columns: '  grid-template-columns: repeat(2, 1fr);', slot: SLOT_DONE, query: ['', ...CARD_QUERY_DONE] }) },
      why: '把欄數寫死成 `repeat(2, 1fr)`。768px 與 1280px 量起來一樣，但 360px 的手機上也硬分成兩欄，每格只有 156px，卡片只能直排，商品名稱被擠在很窄的格子裡。欄數要讓 `auto-fit` 依寬度決定。',
    },
  ],
};

const exFinish: WebExercise = {
  id: 'rwd12-x-finish', title: '第五關：字級、圖片與最後的驗收',
  statement: 'index.html 與 script.js 不能改。主標題區多了一張主視覺圖片 `.hero-img`，`<img>` 上寫了 `width="1200"` 與 `height="300"`。驗收時發現兩個問題：圖片在 360px 的手機上把整個內容欄撐成 1200px 寬，頁面可以左右捲動；主標題在每一種寬度都是 1.75rem，桌機上顯得太小。請在 style.css 的「第五關」修好：（一）`h1` 的字級用 `clamp()`：最小 1.75rem、最大 3rem，中間的偏好值是 `1rem + 3.125vw`。（二）`.hero-img` 最寬等於所在的欄，高度依原圖 4：1 的比例縮放，不可以變形。根字級 16px 時，檢查會量到：360px 的頁面上標題 28px，圖片寬 328px、高 82px；768px 時標題 40px；1280px 時標題 48px，圖片高 280px。另一份檢查把根字級換成 20px：標題在 360px 時要是 35px，所以三個值都要帶著 rem。完成後，用預覽上方的 699 與 1099 兩個按鈕看看兩個斷點的前 1px，再照課文最後的測試清單走一遍。',
  hints: [
    '`clamp()` 的三個值依序是最小值、偏好值、最大值，用逗號分開；偏好值可以直接寫加法：`1rem + 3.125vw`。',
    '圖片要兩個宣告：一個限制寬度（`max-width: 100%`），一個讓高度重新依比例計算。少了後者，高度會留在 `height` 屬性寫的 300px。',
    '`h1` 寫 `font-size: clamp(1.75rem, 1rem + 3.125vw, 3rem);`，`.hero-img` 加上 `max-width: 100%;` 與 `height: auto;`。',
  ],
  explanation: '偏好值 `1rem + 3.125vw` 在 360px 的視窗是 16 + 11.25 = 27.25px，比最小值 1.75rem（28px）小，取 28px；768px 時是 16 + 24 = 40px，落在兩個端點之間；1280px 時是 16 + 40 = 56px，超過最大值 3rem，取 48px。換算下來，標題在 384px 以下固定 28px，到 1024px 長到 48px 之後不再變大。圖片的 `max-width: 100%` 讓它最寬等於主標題區的寬度：360px 時 328px，1280px 時 1120px；`height: auto` 讓高度依 `width` 與 `height` 屬性給的 4：1 計算，分別是 82px 與 280px。圖片不再比欄寬，原本被它撐開的 grid 欄回到 328px，橫向捲軸也跟著消失。',
  viewport: { width: 360, height: 1200 },
  widths: [360, 699, 768, 1099, 1280],
  fixed: { html: homeFinal(16), js: MENU_JS },
  starter: { css: finishCss({ h1: H1_OLD, image: [] }) },
  solution: { css: finishCss({ h1: H1_DONE, image: IMAGE_DONE }) },
  steps: [
    { check: 'style', selector: 'h1', property: 'font-size', value: '28px', label: '頁面寬 360px：主標題的字級是最小值 1.75rem（28px）' },
    { check: 'box', selector: '.hero-img', measure: 'width', value: 328, label: '頁面寬 360px：圖片和所在的欄一樣寬，328px，沒有超出去' },
    { check: 'box', selector: '.hero-img', measure: 'height', value: 82, label: '頁面寬 360px：圖片維持 4：1，高 82px' },
    { do: 'resize', width: 768 },
    { check: 'style', selector: 'h1', property: 'font-size', value: '40px', label: '頁面寬 768px：主標題的字級在兩個端點之間，40px' },
    { do: 'resize', width: 1280 },
    { check: 'style', selector: 'h1', property: 'font-size', value: '48px', label: '頁面寬 1280px：主標題停在最大值 3rem（48px）' },
    { check: 'box', selector: '.hero-img', measure: 'height', value: 280, label: '頁面寬 1280px：圖片寬 1120px，高 280px' },
  ],
  mistakes: [
    {
      files: { css: finishCss({ h1: H1_DONE, image: ['  max-width: 100%;'] }) },
      why: '圖片只寫了 `max-width: 100%`。寬度縮成 328px 了，高度卻仍然是 `height` 屬性的 300px，圖片被拉成又高又窄。有 `width` 與 `height` 屬性的圖片，限制寬度時一定要配上 `height: auto`。',
    },
    {
      files: { css: finishCss({ h1: '  font-size: clamp(28px, 16px + 3.125vw, 48px);', image: IMAGE_DONE }) },
      why: '`clamp()` 的三個值都用 px。根字級 16px 時每個寬度量起來都對，但使用者把預設字級調成 20px 時，標題仍然是 28px 到 48px：內文都放大了，標題卻沒有跟上。最小值、最大值與偏好值的常數項用 rem，字級才保有可縮放性。',
    },
    {
      files: { css: finishCss({ h1: '  font-size: calc(1rem + 3.125vw);', image: IMAGE_DONE }) },
      why: '只寫了偏好值 `calc(1rem + 3.125vw)`，沒有 `clamp()`。768px 時剛好是 40px，但字級沒有上下限：360px 時是 27.25px，1280px 時是 56px，視窗越寬標題越大，沒有盡頭。`clamp()` 的第一個與第三個值就是用來設定這兩道界線。',
    },
  ],
  variants: [
    {
      title: '根字級是 20px（使用者把預設字級調大）：主標題跟著放大',
      fixed: { html: homeFinal(20) },
      steps: [
        { check: 'style', selector: 'h1', property: 'font-size', value: '35px', label: '頁面寬 360px：最小值 1.75rem 是 35px' },
        { do: 'resize', width: 768 },
        { check: 'style', selector: 'h1', property: 'font-size', value: '44px', label: '頁面寬 768px：20 + 24 = 44px' },
        { do: 'resize', width: 1280 },
        { check: 'style', selector: 'h1', property: 'font-size', value: '60px', label: '頁面寬 1280px：最大值 3rem 是 60px' },
      ],
    },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD12: LessonContent = {
  lessonId: 'RWD12',
  motivation: '前面十一堂課各教一種技術，這一課把它們用在同一個頁面上：小島市集的首頁，從 360px 的手機到 1280px 的桌機都好用。你會分五關完成它：行動優先的骨架、會收合的導覽、三種寬度的頁面版面、依容器調整的商品卡，以及流體字級與圖片，最後照測試清單在多種寬度下驗收。',
  sections: [
    {
      id: 'rwd12-plan', title: '專題說明：小島市集的首頁',
      blocks: [
        { type: 'p', text: '前面十一堂課，每一課處理一種技術：相對單位、Flexbox、Grid、媒體查詢（media query）、容器查詢（container query）、流體字級、圖片與導覽。這一課只有一個題目，但要把它們用在同一個頁面上：替「小島市集」做首頁，不論視窗（viewport）是 360px 寬的手機還是 1280px 寬的桌機都好用。這種跨裝置版面不是替三種裝置各做一個頁面，而是一份 HTML、一份樣式表，在每一種寬度都成立。' },
        { type: 'p', text: '動手之前先做兩個決定。第一是內容的優先順序：行動優先（mobile first）的頁面在最窄的畫面上就是一欄，由上到下的順序就是 HTML 的順序，所以最重要的要寫在最前面。市集的首頁依序是：站名與主選單、主標題與本週主打、今日推薦的商品、市集公告、本週活動、頁尾的地址與營業時間。第二是在哪些寬度驗收。這個專題選 360px、768px 與 1280px 三個代表寬度，大約是手機、直拿的平板與筆電的視窗；它們是檢查用的樣本，不是斷點。下表是每個部位在三個寬度該有的樣子。' },
        { type: 'table', head: ['部位', '360px', '768px', '1280px', '用什麼做'], rows: [
          ['頁首的主選單', '收在「選單」按鈕後面', '排成一列，一直顯示', '同 768px', 'Flexbox、700px 的媒體查詢、幾行 JavaScript'],
          ['頁面版面', '一欄', '兩欄：今日推薦與市集公告並排', '三欄：再加上本週活動', 'Grid 的命名區域、700px 與 1100px 的媒體查詢'],
          ['商品卡', '一欄，卡片橫排', '兩欄，卡片直排', '兩欄，卡片橫排；側欄裡的那一張直排', '`auto-fit` 的 Grid、容器查詢'],
          ['主標題的字級', '28px', '40px', '48px', '`clamp()`'],
          ['主視覺圖片', '328 × 82px', '736 × 184px', '1120 × 280px', '`max-width: 100%` 與 `height: auto`'],
        ] },
        { type: 'p', text: '斷點（breakpoint）只有兩個，都是把視窗慢慢拉寬、看內容在哪裡開始不好用而訂出來的，也就是「Media Query 與斷點策略」那一課的內容導向斷點：700px 是站名與主選單的六個連結排得進同一列、市集公告也適合移到右邊的寬度；1100px 是放得下第三欄的寬度。三個驗收寬度各落在一段裡：360px 在第一段，768px 在第二段，1280px 在第三段。這個專題的斷點與容器查詢的條件用 px 寫，數字可以直接和視窗的寬度對照；其他的尺寸與留白用 rem。' },
        { type: 'table', head: ['關卡', '完成後的樣子', '用到的課'], rows: [
          ['第一關　骨架', '內容依重要性排好；整頁共用一個流動、有上限、置中的欄；任何寬度都不必橫向捲動', 'RWD01 響應式原則與行動優先、RWD02 viewport 與相對單位'],
          ['第二關　頁首與導覽', '站名靠左、按鈕靠右；700px 以下主選單收在按鈕後面，以上一直顯示', 'RWD03、RWD04 Flexbox，RWD11 響應式導覽與表格'],
          ['第三關　頁面版面', '同樣四個區塊，在 700px 與 1100px 各換一種排法', 'RWD05、RWD06 CSS Grid，RWD07 Media Query 與斷點策略'],
          ['第四關　商品卡', '欄數自動增減；卡片依所在格子的寬度決定橫排或直排', 'RWD06 CSS Grid 進階、RWD08 Container Query'],
          ['第五關　字級與圖片', '主標題在兩個端點之間平滑變化；圖片跟著欄縮放而不變形；整頁通過驗收', 'RWD09 流體字級與 clamp()、RWD10 響應式圖片與媒體'],
        ] },
        { type: 'p', text: '每一關的安排相同：先看市集的另一頁「攤位介紹」怎麼做（範例），再替首頁做同一件事（練習）。兩頁的內容與數字不同，做法是同一套。練習的檔案是累積的：每一關的 index.html 與 style.css 都包含前面各關完成的結果，style.css 用註解標出這一關要寫的位置。範例與練習的預覽上方都有 360、768、1280 三個寬度按鈕，檢查也是在這幾個寬度量同一份答案。課文最後的互動圖可以再逐關回顧。' },
        { type: 'callout', tone: 'note', title: '練習的頁面把根字級寫成 16px', text: '五個練習的 index.html 都在 `<html>` 上用行內樣式寫了 `font-size: 16px`。這是為了讓檢查量到的數字在每個人的瀏覽器都一樣：72rem 一定是 1152px，1rem 一定是 16px。它代替的是「瀏覽器預設的字級」；第一關與第五關另外用 20px 再檢查一次，確認用 rem 寫的尺寸會跟著放大。真實的網站不要把根字級寫死成 px，那會讓使用者調整的預設字級失去作用。' },
      ],
    },
    {
      id: 'rwd12-skeleton', title: '第一關　骨架：先讓一欄的頁面站得住',
      blocks: [
        { type: 'p', text: '第一關不寫任何媒體查詢。行動優先的樣式表裡，沒有條件的基本樣式就是最窄的版面：所有區塊照 HTML 的順序由上往下排成一欄。這一關要確定這個一欄的頁面在任何寬度都站得住：不超出視窗，太寬時有上限，留白會跟著字級。之後每一關都只是在寬度夠的時候多加一點。骨架要顧四件事：' },
        { type: 'list', ordered: true, items: [
          '`<head>` 裡有 `<meta name="viewport" content="width=device-width, initial-scale=1">`。少了它，手機會用大約 980px 的虛擬寬度排版，後面幾關的媒體查詢全部判斷錯誤（「viewport 與相對單位」那一課）。',
          'HTML 的順序就是內容的優先順序：主要內容在前，補充的資訊在後。CSS 之後可以把區塊畫到別的欄，但螢幕閱讀器與 Tab 鍵走的永遠是原始碼的順序。',
          '整頁共用一個欄 `.wrap`：`max-width: 72rem` 是上限，`margin: 0 auto` 把它置中，`padding: 0 1rem` 讓內容不貼著視窗的邊，`box-sizing: border-box` 把內距算進寬度裡。頁首、主內容與頁尾各包一層 `.wrap`，三者的左右邊緣就會對齊。',
          '所有寫死的寬度都換成上限：`width: 480px` 改成 `max-width: 30rem`。區塊本來就會填滿所在的欄，上限只在欄比它寬時才起作用。',
        ] },
        { type: 'example', id: 'rwd12-stalls-skeleton' },
        { type: 'p', text: '這是攤位頁在第一關完成時的樣子，沒有用到任何版面的技巧。先按 360：內容離視窗的左右各 16px，沒有橫向捲軸。再按 1280：`.wrap` 停在 72 × 16 = 1152px，多出來的 128px 由 `margin: 0 auto` 平分，左右各 64px；頁首的深綠色背景則鋪滿整個視窗，因為背景畫在外層的 `<header>` 上，`.wrap` 只管裡面的內容。展開 DOM 樹：`main` 裡依序是攤位介紹、本週攤位、交通資訊、營業時間，這就是手機上由上到下的順序。把寫死的樣式改成流動的，大致就是下面四種替換。' },
        { type: 'table', head: ['寫死的寫法', '改成', '為什麼'], rows: [
          ['`width: 1152px`', '`max-width: 72rem`', '視窗比它窄時，區塊跟著視窗縮；比它寬時停在上限'],
          ['`padding: 0 16px`、`margin-top: 24px`', '`padding: 0 1rem`、`margin-top: 1.5rem`', '使用者把預設字級調大時，留白跟著文字一起放大，比例不會跑掉'],
          ['`width: 100%` 再加內距', '不寫 `width`，或加上 `box-sizing: border-box`', '`100%` 指的是內容的寬度，再加內距就比容器寬'],
          ['`width: 480px` 的色塊', '`max-width: 30rem`（圖片則是 `max-width: 100%`）', '放得下時維持設計的大小，放不下時跟著欄縮'],
        ] },
        { type: 'callout', tone: 'warning', title: '寫的是 72rem，量起來卻是 74rem', text: '`max-width` 與 `width` 一樣，預設指的是內容的寬度。只寫 `max-width: 72rem; padding: 0 1rem;` 的話，區塊連同內距最寬是 74rem；再加上 `width: 100%` 更糟，360px 的視窗裡它會是 360 + 32 = 392px，整頁多出橫向捲軸。只要一個區塊同時有寬度（或上限）與內距，就加上 `box-sizing: border-box`，讓寫的數字等於量到的數字（網頁基礎島「盒模型與一般排版流」那一課）。' },
        { type: 'callout', tone: 'tip', title: '找出是誰造成橫向捲動', text: '頁面在窄視窗可以左右捲動時，先暫時加上一條 `* { outline: 1px solid red; }`：每個元素都被框出來，超出視窗右邊的那一個就是原因。`outline` 不佔空間，不會改變版面；找到之後記得刪掉。常見的元兇只有幾種：寫死的 `width`、`100%` 加內距、沒有限制寬度的圖片，以及一長串不能斷開的文字，例如網址。' },
      ],
    },
    {
      id: 'rwd12-header', title: '第二關　頁首與導覽：一列放不下，就收進按鈕',
      blocks: [
        { type: 'p', text: '頁首要排兩樣東西：左邊的站名，右邊的操作。這是一維的排列，交給 Flexbox：`display: flex` 加上 `justify-content: space-between` 把兩者推到兩端，`align-items: center` 讓高度不同的兩者在交錯軸上對齊中線（「Flexbox 基礎：主軸與交錯軸」那一課）。主選單的六個連結在 360px 的手機上和站名擠不進同一列，所以 700px 以下把它們收在一顆按鈕後面，這是「響應式導覽與表格」那一課的導覽收合。收合要三方合作，各管各的：' },
        { type: 'list', items: [
          'HTML：一顆真正的 `<button>`，上面寫著文字，帶有 `aria-expanded="false"` 與指向清單的 `aria-controls`。真正的按鈕本來就能用 Tab 聚焦、用 Enter 與空白鍵按下。',
          'JavaScript：只負責記錄狀態。按下按鈕時同時改兩個地方：按鈕的 `aria-expanded`（告訴螢幕閱讀器現在是開是關），以及清單上的 class `is-open`（給 CSS 用）。開著時按 Escape 會收起，並把焦點交還給按鈕。',
          'CSS：決定每一種狀態在每一種寬度長什麼樣子。基本樣式裡清單是 `display: none`：它不佔空間，Tab 也走不進去。有 `is-open` 時顯示，並用 `flex-basis: 100%` 佔滿一整列，所以容器要寫 `flex-wrap: wrap` 讓它換到第二列（「Flexbox 進階：伸縮、換行與對齊」那一課）。斷點以上，按鈕是 `display: none`，清單固定是 `display: flex`。',
        ] },
        { type: 'p', text: '下面是攤位頁的分類列，用的是同一套做法。它的斷點是 600px：四個分類比主選單的六個連結短，比較早就排得下。' },
        { type: 'example', id: 'rwd12-stalls-filter' },
        { type: 'p', text: '預覽一開始是 360px：只看到標題與「分類」按鈕。按一下按鈕，四個分類出現在第二列；展開 DOM 樹，按鈕的 `aria-expanded` 變成 `true`，`ul` 多了 `is-open`。這時按 Escape，清單收起。接著做最重要的實驗：在 360px 把清單關上，再按 768。按鈕不見了，四個分類排成一列：清單沒有 `is-open`，寬版的規則仍然讓它顯示。' },
        { type: 'p', text: '指令稿的核心是 `setOpen(open)`。`button.setAttribute(\'aria-expanded\', String(open))` 把布林值轉成屬性要的文字 `"true"` 或 `"false"`；`list.classList.toggle(\'is-open\', open)` 的第二個參數是「要不要有這個 class」：`true` 就加上，`false` 就拿掉。兩行寫在同一個函式裡，狀態就不會只改一半。樣式表裡則有一個刻意的安排：狀態的規則寫成 `.is-open { display: block; }`，只有一個 class，特異性是 0-1-0；寬版的 `.filter-list { display: flex; }` 也是 0-1-0，而且寫在後面。媒體查詢不會替裡面的規則增加特異性，條件成立時靠的是順序：不論清單有沒有 `is-open`，寬版都贏。' },
        { type: 'callout', tone: 'warning', title: '在手機上關掉選單，桌機上選單就不見了', text: '收合的導覽有兩條最容易漏掉的路徑。第一條：寬版的查詢只藏了按鈕，忘了替清單寫 `display`。使用者在窄視窗把清單關上（或從來沒有打開），把視窗拉寬或把手機轉成橫向之後，清單仍然是 `display: none`，按鈕也不見了，整個導覽消失。第二條正好相反：把狀態寫成 `.filter-list.is-open { display: block; }`，特異性變成 0-2-0，贏過寬版的規則；使用者開著清單把視窗拉寬，清單就停在直排。兩條路徑都要親手試一次：關著拉寬、開著拉寬。' },
        { type: 'callout', tone: 'note', title: '行動優先也有要改回來的宣告', text: '`flex-basis: 100%` 是窄版才需要的：它讓打開的清單自己佔一列。到了寬版要把它改回 `flex-basis: auto`，否則清單仍然佔滿一整列，被換到標題的下面。行動優先的原則是寬的時候多加一點，但只在窄版有意義的宣告，仍然要在查詢裡還原。另外，這個做法依賴指令稿：指令稿萬一沒有載入，窄視窗上的清單就打不開；更穩的做法是讓清單一開始就顯示，由指令稿執行時才把它收起來。想多練習幾種收合的做法，可以到互動實驗島的 Mobile Navigation Simulator。' },
      ],
    },
    {
      id: 'rwd12-layout', title: '第三關　頁面版面：一張圖，在兩個斷點各重畫一次',
      blocks: [
        { type: 'p', text: '頁首與卡片是元件，這一關排的是整個頁面：哪個區塊在哪一欄、誰橫跨整列。這是同時管欄與列的二維版面，而且要在特定的視窗寬度換一種排法，所以用 Grid 的命名區域搭配媒體查詢（「CSS Grid 進階：區域與自動排列」與「Media Query 與斷點策略」兩課）。做法分成兩半：每個區塊用 `grid-area` 取一次名字，之後不再動它；容器的 `grid-template-areas` 則像一張圖，基本樣式畫一欄的圖，每個斷點各重畫一次，同時用 `grid-template-columns` 給出每一欄的寬度。' },
        { type: 'example', id: 'rwd12-stalls-layout' },
        { type: 'p', text: '這是攤位頁的版面，四個區塊用色塊代表。按 360：四塊照原始碼的順序排成一欄。按 768：`grid-template-columns: 14rem 1fr` 分出 224px 的左欄，交通資訊與營業時間疊在左欄，本週攤位在右邊跨兩列。按 1280：多了第三欄，營業時間移到最右邊，和本週攤位同一列。三張圖的對照如下。' },
        { type: 'table', head: ['視窗寬度', '欄寬', '圖（每個字串是一列）', '本週攤位的寬度'], rows: [
          ['小於 700px', '不寫，只有一欄', '`"intro" "list" "visit" "hours"`', '360px 時是 360 − 32 = 328px'],
          ['700px 以上', '`14rem 1fr`', '`"intro intro" "visit list" "hours list"`', '768px 時是 736 − 224 − 16 = 496px'],
          ['1100px 以上', '`14rem 1fr 14rem`', '`"intro intro intro" "visit list hours"`', '1280px 時是 1120 − 448 − 32 = 640px'],
        ] },
        { type: 'p', text: '寬度是這樣算的：`.wrap` 的左右內距各 16px，所以 768px 的視窗裡，grid 容器裡可以分配的寬度是 736px；1280px 時 `.wrap` 停在 1152px，可以分配的是 1120px。固定的欄與間距（gap）先扣掉，剩下的都歸 `1fr` 那一欄。兩條查詢都用 `min-width`，由窄到寬排：視窗 1280px 寬時兩個條件都成立，寫在後面的 1100px 那一條蓋過 700px 那一條。' },
        { type: 'callout', tone: 'warning', title: '畫面上的順序變了，Tab 的順序沒有變', text: '攤位頁在 700px 以上把交通資訊放到左欄，畫面上它排在本週攤位的前面，原始碼裡卻在後面。`grid-template-areas` 只改變畫在哪裡，螢幕閱讀器的朗讀順序與 Tab 鍵的順序仍然照 HTML。區塊裡如果有連結或按鈕，鍵盤使用者會看到焦點先到右邊、再回到左邊。搬動的幅度小、區塊各自獨立時可以接受；順序差得太遠時，該改的是 HTML。首頁的練習裡，三種寬度的畫面順序都和原始碼一致。' },
        { type: 'callout', tone: 'tip', title: '重畫圖的時候，欄寬也要重寫', text: '`grid-template-areas` 只負責命名，不決定軌道的大小。在 1100px 的查詢裡把圖畫成三欄，卻沒有把 `grid-template-columns` 改成三個值，第三欄就沒有定義，寬度是 `auto`，只由內容決定。每次重畫圖，欄寬也要跟著重寫。想先試幾種排法，可以到互動實驗島的 CSS Grid 練習場。' },
      ],
    },
    {
      id: 'rwd12-card', title: '第四關　商品卡：元件看的是容器，不是視窗',
      blocks: [
        { type: 'p', text: '卡片是會被放到好幾個地方的元件：清單裡有好幾張，側欄裡也有一張。它有兩種排法：位置夠寬時圖在左、文字在右，位置窄時圖在上、文字在下。問題是「位置夠不夠寬」不能問視窗。首頁在 360px 的手機上是一欄，卡片所在的格子有 328px；到了 768px 的平板，清單分成兩欄，每格反而只剩 232px。視窗變寬，元件卻變窄了。這種元件響應要讓卡片問自己的容器（「Container Query」那一課）。這一關把三件事接在一起：' },
        { type: 'list', items: [
          '清單的欄數交給 Grid：`grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr))`。每欄至少 13rem，排得下幾欄就幾欄，剩下的寬度平分；欄數是「(清單寬 + 間距) ÷ (最小欄寬 + 間距)」無條件捨去。這條規則看的是清單自己的寬度，不需要媒體查詢。',
          '每張卡片外面包一層當作容器：`.cell { container-type: inline-size; }`。容器查詢只能改容器的後代，元素不能查詢自己，所以容器是卡片外面的那一層，不是卡片。',
          '卡片的橫排寫在容器查詢裡：`@container (min-width: 264px) { .stall { … } }`。264px 是照片的 96px 加上文字至少需要的 168px：條件來自元件自己的內容，和頁面的斷點無關。',
        ] },
        { type: 'example', id: 'rwd12-stalls-card' },
        { type: 'p', text: '這是攤位頁的攤位卡。依序按三個寬度，同時注意清單裡的卡片與「新攤位」裡的那一張：' },
        { type: 'table', head: ['視窗寬度', '清單的寬度', '欄數與每格的寬度', '清單裡的卡片', '「新攤位」的卡片'], rows: [
          ['360px', '328px', '1 欄，328px', '橫排（328 ≥ 264）', '排在清單下方，328px，橫排'],
          ['768px', '736 − 256 − 16 = 464px', '2 欄，各 224px', '直排（224 < 264）', '在 256px 的側欄，直排'],
          ['1280px', '1120 − 256 − 16 = 848px', '3 欄，各 272px', '橫排（272 ≥ 264）', '在 256px 的側欄，直排'],
        ] },
        { type: 'p', text: '1280px 那一列最值得看：同一個視窗、同一條規則，清單裡的卡片是橫排，側欄的卡片是直排。媒體查詢做不到這件事，因為視窗只有一個寬度。也因為卡片只認容器，之後把它搬到別的地方（頁尾、另一頁的三欄版面），都不必再改它的 CSS。' },
        { type: 'callout', tone: 'warning', title: '把 container-type 寫在卡片自己身上', text: '最常見的錯是 `.stall { container-type: inline-size; }`，再寫 `@container (min-width: 264px) { .stall { … } }`。查詢裡的 `.stall` 會往上找「祖先」裡最近的容器，自己不算；祖先裡沒有容器，這條規則就永遠不套用，卡片永遠是直排，瀏覽器也不會提示錯誤。另一個錯是沿用媒體查詢：`@media (min-width: 264px)` 在任何手機上都成立，所有卡片一律橫排，224px 的格子裡文字被擠成窄窄的一條。' },
        { type: 'callout', tone: 'tip', title: '下限要放得進最窄的容器', text: '`minmax(13rem, 1fr)` 的 13rem 是 208px：清單再窄，也會有一欄 208px 寬，超出去就是橫向捲軸。所以下限要選最窄的畫面也放得下的數字。這個頁面最窄的情況是 320px 的手機，清單有 320 − 32 = 288px，放得下。' },
      ],
    },
    {
      id: 'rwd12-type-image', title: '第五關　字級與圖片：在兩個端點之間平滑變化',
      blocks: [
        { type: 'p', text: '最後一關處理圖片與字級，兩樣都會隨寬度改變大小。主標題在手機上用 3rem 太大，在桌機上用 1.5rem 又太小；用媒體查詢分段調整，字級會在斷點突然跳一級。`clamp()` 可以讓它在兩個端點之間平滑變化（「流體字級與 clamp()」那一課）：`clamp(最小值, 偏好值, 最大值)` 得到的是偏好值，但不會小於最小值，也不會大於最大值。攤位頁的標題是 `font-size: clamp(1.5rem, 0.75rem + 3.125vw, 2.75rem)`。偏好值由兩部分相加：`3.125vw` 是視窗寬度的 3.125%，讓字級跟著視窗變；`0.75rem` 跟著根字級。以預設的 16px 計算：' },
        { type: 'table', head: ['視窗寬度', '偏好值', '標題的字級'], rows: [
          ['360px', '12 + 11.25 = 23.25px', '24px：小於最小值 1.5rem，取最小值'],
          ['768px', '12 + 24 = 36px', '36px：在兩個端點之間，取偏好值'],
          ['1280px', '12 + 40 = 52px', '44px：大於最大值 2.75rem，取最大值'],
        ] },
        { type: 'p', text: '三個值都帶著 rem，不是單純的 px 或 vw，原因是可縮放性：只用 `vw` 的字級只認視窗，使用者把瀏覽器的預設字級調大時，文字不會跟著放大；最小值、最大值與偏好值裡的常數項用 rem 寫，字級才會回應使用者的設定。圖片的規則只有兩行：`max-width: 100%` 讓圖片最寬等於所在的欄，`height: auto` 讓高度依寬度等比例計算（「響應式圖片與媒體」那一課）。`<img>` 上的 `width` 與 `height` 屬性仍然要寫：瀏覽器靠這兩個數字在圖片下載之前就算出長寬比、留好位置，圖片到了之後，下面的內容不會被往下推。' },
        { type: 'example', id: 'rwd12-stalls-type-image' },
        { type: 'p', text: '按 360：標題 24px，配置圖寬 328px、高 164px，維持 2：1。按 768：標題 36px，圖寬 736px、高 368px。按 1280：標題停在 44px；圖片只有 800px 寬，沒有被拉大到 1120px。`max-width` 是上限，不會把圖片放大到超過原本的尺寸；想讓圖片永遠填滿欄，要寫的是 `width: 100%`，代價是圖片在寬螢幕上被放大而變模糊。' },
        { type: 'callout', tone: 'warning', title: '只寫 max-width，圖片就變形', text: '有 `width="800" height="400"` 的圖片，瀏覽器會把這兩個屬性當成預設的寬與高。只寫 `max-width: 100%` 時，寬度在窄視窗被限制成 328px，高度卻仍然是屬性寫的 400px：圖片變得又高又窄。一定要成對寫上 `height: auto`，高度才會改由長寬比計算。在範例裡刪掉 `height: auto` 再按 360，就看得到變形的配置圖。' },
        { type: 'callout', tone: 'warning', title: '一張大圖撐破整個版面', text: '沒有限制寬度的圖片不只是自己超出去。它放在 grid 的 `1fr` 欄或沒有指定寬度的欄裡時，那一欄不能比內容的最小寬度窄（「CSS Grid 進階：區域與自動排列」那一課的 `minmax`）：整欄被撐成圖片的寬度，同一欄的標題與卡片全部跟著變寬，頁面出現橫向捲軸。症狀看起來像整個版面壞了，原因卻只是一張圖少了 `max-width: 100%`。第五關的首頁一開始就是這個狀態。' },
        { type: 'callout', tone: 'note', title: '預覽看不到的兩件事', text: '這一課的預覽沒有網路，圖片是直接寫在 `src` 裡的小圖，所以看不出 `srcset` 會讓瀏覽器選哪一個檔案，也看不到圖片晚到時的版面位移。預覽與檢查也沒有辦法替你調整瀏覽器的字級設定或縮放比例。這幾項要在自己的瀏覽器裡親手試，下一節的測試清單會列出來。' },
      ],
    },
    {
      id: 'rwd12-checklist', title: '測試清單與下一步',
      blocks: [
        { type: 'p', text: '五關做完，頁面在 360、768、1280px 三個寬度都通過了檢查。但使用者的視窗不會剛好是這三個數字，測試才是這個專題真正的最後一步：把頁面放到你沒有特別設計過的情況裡，看它會不會壞。第五關的練習預覽多了 699 與 1099 兩個寬度按鈕，正是兩個斷點的前 1px；做完之後，拿那一頁把下面的清單走一遍。' },
        { type: 'table', head: ['測試項目', '怎麼做', '應該看到'], rows: [
          ['三個驗收寬度', '360、768、1280px 各看一次', '一欄、兩欄、三欄；沒有橫向捲軸'],
          ['斷點的兩側', '699 與 700px、1099 與 1100px', '每一側都是完整的版面，沒有一半窄版、一半寬版'],
          ['中間的寬度', '在自己的瀏覽器把視窗從最窄慢慢拉到最寬', '任何寬度都沒有重疊、被裁掉或擠出去的內容；特別注意斷點前後幾十 px'],
          ['更窄的手機', '把視窗縮到 320px', '`.wrap` 仍有內距，商品卡的欄放得下，標題沒有超出去'],
          ['文字放大', '把瀏覽器縮放到 200%；另外再把預設字級調大', '文字都跟著變大，沒有被裁掉；版面退回比較窄的排法是正常的'],
          ['很長的內容', '把一個商品名稱換成很長的英文字或網址', '沒有撐破卡片與欄；撐破時在那個元素加上 `overflow-wrap: anywhere`'],
          ['鍵盤', '360px 時只用 Tab、Enter 與 Escape 操作選單', '選單開合自如；關著的時候 Tab 不會走進去；按 Escape 之後焦點回到按鈕'],
          ['圖片', '在真實的網站上限制網路速度後重新載入', '圖片到達之前位置已經留好，下面的內容沒有移動'],
          ['真實的裝置', '用一支手機打開頁面，直拿、橫拿各一次', '和模擬的寬度一致；手指點得到每一個連結與按鈕'],
        ] },
        { type: 'p', text: '測試時發現的問題，多半可以從症狀直接找到原因：' },
        { type: 'table', head: ['症狀', '最可能的原因', '回去看哪一關'], rows: [
          ['窄視窗可以左右捲動', '寫死的寬度、`100%` 加內距、沒有限制寬度的圖片，或一長串不能斷開的文字', '第一關、第五關'],
          ['把視窗拉寬之後，導覽不見了或停在直排', '寬版沒有替清單寫 `display`，或狀態的選擇器特異性太高', '第二關'],
          ['寬螢幕套用的是中間那一段的版面', '`min-width` 的查詢沒有由窄到寬排', '第三關'],
          ['側欄裡的卡片被擠得很窄', '卡片的排法問的是視窗（媒體查詢），不是容器', '第四關'],
          ['圖片變形', '只寫了 `max-width: 100%`，少了 `height: auto`', '第五關'],
          ['調大預設字級後，標題沒有變大', '字級只用 `vw` 或 px，沒有 rem 的成分', '第五關'],
        ] },
        { type: 'p', text: '這個首頁還有可以繼續做的地方：商品的照片用 `srcset` 與 `sizes` 提供不同解析度的檔案，活動的時間表在窄視窗的排法，深色模式的配色。這些分別是「響應式圖片與媒體」「響應式導覽與表格」與「Media Query 與斷點策略」的內容，做法都和這五關一樣：先讓窄的版面成立，再在需要的地方加條件。想不寫程式就觀察一個版面在各種寬度的變化，可以用互動實驗島的 Responsive Layout Simulator。' },
        { type: 'p', text: '接下來是前端開發島。首頁與攤位頁各有一份重複的頁首，商品卡的 HTML 也複製了好幾次；頁面與元件再多下去，就需要用元件與框架來管理。到時候每個元件的樣式，仍然是這座島的內容：流動的寬度、Flexbox 與 Grid、問視窗的媒體查詢與問容器的容器查詢。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  visualization: {
    kind: 'challenge-stages', title: '小島市集的首頁：五個關卡',
    stages: [
      {
        title: '行動優先的骨架', concepts: ['RWD01', 'RWD02'],
        goal: '首頁的內容依重要性排好，.wrap 在 360px 填滿視窗、在 1280px 停在 72rem 並置中，留白都用 rem，任何寬度都不必橫向捲動。',
        detail: '沒有任何媒體查詢的基本樣式就是最窄的版面，所以先讓一欄的頁面站得住。寫死的 width 換成 max-width，內距用 box-sizing: border-box 算進寬度裡，否則 100% 加內距會超出視窗。尺寸用 rem，使用者調大預設字級時，欄寬與留白才會跟著放大。',
      },
      {
        title: '頁首與導覽', concepts: ['RWD03', 'RWD04', 'RWD11'],
        goal: '頁首是一個 flex 容器，站名靠左、選單按鈕靠右；700px 以下主選單收在按鈕後面，aria-expanded 跟著開合，700px 以上按鈕消失、主選單一直排成一列。',
        detail: '開合的狀態由指令稿同時寫在兩個地方：按鈕的 aria-expanded 與選單的 is-open。寬版的規則寫在 .is-open 之後、特異性相同，所以不論開合都是 flex；窄版才需要的 flex-basis: 100% 要在寬版改回 auto。最容易漏掉的路徑是在手機上關掉選單，再把視窗拉寬。',
      },
      {
        title: '頁面版面', concepts: ['RWD05', 'RWD06', 'RWD07'],
        goal: '同樣四個區塊：360px 排成一欄，700px 以上市集公告移到今日推薦的右邊，1100px 以上本週活動成為第三欄。',
        detail: '每個區塊只取一次 grid-area 的名字，媒體查詢裡只重畫 grid-template-areas 與欄寬。查詢由窄到寬排，1100px 的寫在 700px 後面才會贏。重畫了圖卻沒有補上新欄的寬度，多出來的欄會是 auto。畫面順序和原始碼一致，Tab 與螢幕閱讀器的順序才不會亂。',
      },
      {
        title: '會自己調整的商品卡', concepts: ['RWD06', 'RWD08'],
        goal: '商品卡的欄數由 auto-fit 決定，卡片在所在的格子至少 280px 寬時左右並排：360px 與 1280px 的主欄是橫排，768px 的主欄與 240px 的側欄是直排。',
        detail: '視窗變寬不代表元件變寬：768px 時每格只有 232px，比手機上的 328px 還窄，所以卡片該問的是容器而不是視窗。container-type 要寫在卡片外面的那一層，元素不能查詢自己。同一條規則在同一個視窗裡可以給出兩個答案。',
      },
      {
        title: '字級、圖片與驗收', concepts: ['RWD09', 'RWD10'],
        goal: '主標題用 clamp() 從 28px 平滑長到 48px，主視覺圖片跟著欄寬縮放而不變形，整頁在 360、768、1280px 都通過檢查。',
        detail: 'clamp() 的偏好值是 rem 加 vw：vw 讓字級跟著視窗變，rem 讓它仍然回應使用者的字級設定。有 width 與 height 屬性的圖片，max-width: 100% 要配 height: auto，否則高度留在屬性的數字而變形。一張沒有限制寬度的大圖會把 grid 的欄撐開，整頁出現橫向捲軸。最後在斷點的兩側與中間的寬度各看一次。',
      },
    ],
  },
  quiz: [
    {
      id: 'rwd12-q1', prompt: '首頁在 360px 是一欄；700px 以上市集公告要移到今日推薦的右邊，主標題橫跨兩欄；1100px 以上本週活動再成為第三欄。哪一組工具最適合做這件事？',
      options: [
        '替每個區塊各寫一個容器查詢，讓區塊依自己的寬度決定要排在哪一欄',
        '把 `main` 設成 `display: flex` 與 `flex-wrap: wrap`，替每個區塊設定 `flex-basis`，讓它們放不下時自己換行',
        '把 `main` 設成 grid，替每個區塊取 `grid-area` 的名字，在兩個媒體查詢裡各重畫一次 `grid-template-areas`',
        '用 `clamp()` 設定每個區塊的寬度，讓寬度在兩個端點之間平滑變化',
      ],
      answer: 2,
      explanation: '這是整個頁面在特定的視窗寬度換一種排法：條件是視窗，所以用媒體查詢；要同時管欄與列、還有區塊橫跨整列，所以用 Grid 的命名區域。容器查詢改的是容器裡面的後代怎麼排，區塊不能靠查詢自己來決定自己在頁面的哪一欄。`flex-wrap` 只能照順序換行，做不出「主標題橫跨、公告在右」這種二維的安排，也沒辦法指定在哪個寬度換。`clamp()` 讓一個數值平滑變化，不會換排法。',
    },
    {
      id: 'rwd12-q2', prompt: '視窗寬 1280px。同一張 `.card` 放在兩個 `.slot` 裡：主欄的 `.slot` 寬 296px，側欄的寬 240px。套用下面的樣式後，哪一個敘述正確？',
      code: { language: 'CSS', text: '.slot { container-type: inline-size; }\n@container (min-width: 280px) {\n  .card { display: grid; grid-template-columns: 6rem 1fr; }\n}' },
      options: [
        '主欄的卡片左右並排，側欄的卡片維持上下排列：每張卡片問的是自己所在的 `.slot`',
        '兩張都左右並排：視窗寬 1280px，大於 280px',
        '兩張都維持上下排列：`.card` 本身不是容器，所以這條規則永遠不成立',
        '兩張都左右並排：容器查詢看的是頁面上最寬的那個容器',
      ],
      answer: 0,
      explanation: '`@container` 裡的 `.card` 規則，對每一張卡片各自往上找最近的祖先容器：主欄的 `.slot` 是 296px，條件成立；側欄的是 240px，條件不成立。容器查詢不看視窗，1280px 這個數字和它無關；也沒有「最寬的容器」這種規則。卡片本身不需要是容器：被查詢的是它外面的 `.slot`，卡片是容器的後代，正好是容器查詢改得到的對象。',
    },
    {
      id: 'rwd12-q3', prompt: '頁面沒有設定 `html` 的字級。一位使用者把瀏覽器的預設字級從 16px 調成 20px，視窗寬 1600px。套用這條規則的 `.wrap`，連同內距有多寬？',
      code: { language: 'CSS', text: '.wrap {\n  box-sizing: border-box;\n  max-width: 72rem;\n  margin: 0 auto;\n  padding: 0 1rem;\n}' },
      options: [
        '1152px：`rem` 固定等於 16px',
        '1600px：`max-width` 用了相對單位，在寬視窗上不會生效',
        '1480px：72 × 20 = 1440px，再加上左右各 20px 的內距',
        '1440px：72 × 20，內距已經包含在裡面',
      ],
      answer: 3,
      explanation: '`rem` 以根元素的字級為基準；頁面沒有另外設定時，根字級就是使用者的預設字級 20px，所以 72rem 是 1440px，並不固定是 16px。`box-sizing: border-box` 讓 `max-width` 指的是連同內距與邊框的寬度，左右各 20px 的內距已經算在 1440px 裡，不會再加成 1480px。視窗有 1600px，比上限寬，所以 `.wrap` 停在 1440px 並置中；相對單位的 `max-width` 一樣會生效。',
    },
    {
      id: 'rwd12-q4', prompt: '根字級是 16px。視窗寬 320px 時，這個標題的字級計算後是多少？',
      code: { language: 'CSS', text: 'h1 { font-size: clamp(1.75rem, 1rem + 3.125vw, 3rem); }' },
      options: ['26px', '28px', '10px', '48px'],
      answer: 1,
      explanation: '偏好值是 1rem + 3.125vw = 16 + 320 × 3.125% = 16 + 10 = 26px。它比最小值 1.75rem（28px）小，所以 `clamp()` 取最小值 28px。26px 是忘了下限；10px 是只算了 `vw` 的部分；48px 是最大值，視窗要到 1024px 以上才會用到。',
    },
    {
      id: 'rwd12-q5', prompt: '所在的欄寬 328px。這張圖片顯示出來的尺寸是多少？',
      code: { language: 'HTML', text: '<style>\n  img { max-width: 100%; }\n</style>\n<img src="market.jpg" width="1200" height="300" alt="市集的攤位">' },
      options: [
        '328 × 300px：寬度被限制住了，高度仍然照 `height` 屬性，圖片變形',
        '328 × 82px：瀏覽器一定會維持原圖的長寬比',
        '1200 × 300px：HTML 屬性優先於 CSS',
        '328px 寬，高度是 0：沒有寫 `height: auto` 的圖片沒有高度',
      ],
      answer: 0,
      explanation: '`width` 與 `height` 屬性會成為圖片預設的寬與高。`max-width: 100%` 只把寬度限制成 328px，高度沒有人改，仍然是 300px，原本 4：1 的圖被拉成又高又窄。再加上 `height: auto`，高度才會依長寬比算成 82px。屬性的優先順序比樣式表的宣告低，所以寬度不會留在 1200px；圖片也不會因此沒有高度。',
    },
    {
      id: 'rwd12-q6', prompt: '使用者在 360px 寬的手機上打開選單（`.site-nav` 多了 `is-open`），接著把手機轉成橫向，視窗變成 800px 寬。這時 `.site-nav` 的 `display` 是什麼？',
      code: { language: 'CSS', text: '.site-nav { display: none; }\n.site-nav.is-open { display: block; }\n@media (min-width: 700px) {\n  .site-nav { display: flex; }\n}' },
      options: [
        '`flex`：媒體查詢的條件成立，裡面的規則優先於外面的規則',
        '`flex`：三條規則裡它寫在最後面',
        '`none`：基本樣式不受媒體查詢影響',
        '`block`：`.site-nav.is-open` 的特異性是 0-2-0，高於查詢裡 `.site-nav` 的 0-1-0',
      ],
      answer: 3,
      explanation: '800px 時查詢成立，三條規則都選到這個元素。串接先比特異性：`.site-nav.is-open` 有兩個 class（0-2-0），贏過只有一個 class 的兩條規則，所以是 `block`，連結停在直排。媒體查詢不會替裡面的規則增加特異性；「寫在後面的贏」只在特異性相同時才算數。修法是把狀態的規則寫成 `.is-open { display: block; }`，讓它和寬版的規則特異性相同，由順序決定。',
    },
    {
      id: 'rwd12-q7', prompt: '市集後來增加了分頁，主選單變成九個連結。樣式表仍然在 700px 以上把「選單」按鈕藏起來、連結排成一列。在 360px 與 1280px 驗收都沒問題，但把視窗慢慢拉寬到 720px 時，連結排不進頁首，最後幾個超出視窗的右邊。最合適的修法是哪一個？',
      options: [
        '替頁首加上 `overflow: hidden`，把超出去的連結裁掉',
        '把收合主選單的斷點往上移到九個連結真的排得下的寬度，在那之前繼續使用選單按鈕',
        '在 720px 加一個斷點，把連結的字級縮小到 10px',
        '不用修：720px 不是常見裝置的寬度',
      ],
      answer: 1,
      explanation: '斷點要由內容決定：內容變了，斷點也要跟著重新訂。九個連結在 700px 還排不下，就把斷點移到排得下的寬度，中間這一段繼續用選單按鈕。`overflow: hidden` 讓幾個連結直接消失，使用者再也到不了那幾頁。10px 的字幾乎沒辦法閱讀，也點不準。使用者的視窗可以是任何寬度：平板的分割畫面、沒有放到最大的瀏覽器視窗，都可能剛好是 720px；只在三個驗收寬度看過，正是這種問題會漏掉的原因。',
    },
    {
      id: 'rwd12-q8', prompt: '首頁的 `.layout` 是只有一欄的 grid，裡面有一張 `width="1200"` 的圖片，樣式表沒有替圖片寫任何規則。視窗寬 360px 時，整個內容欄變成 1200px 寬，頁面可以左右捲動。原因與修法是哪一個？',
      options: [
        '`.wrap` 的 `max-width: 72rem` 在手機上太寬；把它改成 `max-width: 360px`',
        'viewport 設定寫錯了；把 `width=device-width` 改成 `width=1200`',
        'grid 的欄不會比內容的最小寬度窄，1200px 的圖片把欄撐開了；替圖片加上 `max-width: 100%` 與 `height: auto`',
        '媒體查詢的順序錯了；把 `min-width` 的查詢改成由寬到窄排',
      ],
      answer: 2,
      explanation: '沒有指定寬度的 grid 欄（以及 `1fr` 的欄）下限是內容的最小寬度：一張 1200px 寬、不會縮的圖片，就把整欄撐成 1200px，同一欄的其他區塊跟著變寬。讓圖片的寬度不超過所在的欄，欄就回到視窗的寬度。`max-width: 72rem` 只是上限，在 360px 的視窗不起作用，把它寫死成 360px 會毀掉其他寬度的版面。把 viewport 改成 `width=1200` 等於要手機用桌機的寬度排版再縮小。這個問題和媒體查詢的順序無關。',
    },
  ],
  webCode: {
    examples: [stallsSkeleton, stallsFilter, stallsLayout, stallsCards, stallsFinish],
    exercises: [exSkeleton, exHeader, exLayout, exCards, exFinish],
  },
};
