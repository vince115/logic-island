import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB02 mobile UI patterns (MOB-1): tab bar, drawer and bottom sheet, each as a small working build on the food-ordering
 * app 小島外送, and how to choose between them. The tab bar is a nav of links with aria-current (not an ARIA tablist),
 * fixed to the bottom; the drawer builds on RWD11's menu button and adds what an overlay needs (backdrop, inert on the
 * page, focus in and back, Escape); the bottom sheet is a <dialog> opened with showModal(), restyled to sit at the
 * bottom, compared with show() for a non-modal sheet. Verified in Chromium in the sandboxed check frame before writing:
 * showModal() works (top layer, ::backdrop, focus moves in, close() gives focus back, :modal matches), the inert
 * attribute blocks focus() and Tab, a closed dialog given `display` by the author is shown, a button in a
 * <form method="dialog"> closes its dialog and its value becomes returnValue (returnValue stays after a close by Escape
 * or by close() without an argument, so the sheet example clears it when it opens). What the checks cannot do, said in
 * the text where it matters: the engine's Escape is a script-made key event, so it reaches a page's own keydown listener
 * (the drawer) but not the browser's built-in "Escape closes a modal dialog" (the sheets are closed through their
 * buttons in checks); a script-made click still reaches an inert element, so "the page behind cannot be operated" is
 * checked through the inert attribute, focus, :modal and what is on top (hit), not by a click. The sheet exercise
 * accepts every way of closing and reporting: a click listener, a close listener reading returnValue, or a form with
 * method dialog (its index.html may be edited for that; two different actions are clicked instead of a variant).
 * Gestures (swiping a drawer, dragging a sheet) are MOB03/MOB04; safe areas are MOB06.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const tabBar: WebExample = {
  id: 'mob02-tabbar', title: '分頁列：四個目的地固定在視窗底部',
  description: '小島外送的「我的訂單」頁面。四個最常去的目的地放在 `<nav id="tabs">` 裡，用固定定位貼在視窗底部並平分寬度；目前所在的「訂單」有 `aria-current="page"`。每個連結裡的圖示是加了 `aria-hidden="true"` 的行內 `<svg>`。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  files: {
    html: String.raw`<header id="top">小島外送</header>
<main>
  <h1>我的訂單</h1>
  <p>海鹽雞腿便當：外送中，大約 10 分鐘後抵達。</p>
</main>
<nav id="tabs" aria-label="主要功能">
  <a href="/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8v10H3z"/></svg>首頁</a>
  <a href="/menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v3H4zm0 6h16v3H4zm0 6h16v3H4z"/></svg>菜單</a>
  <a href="/orders" aria-current="page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>訂單</a>
  <a href="/me"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0z"/></svg>我的</a>
</nav>`,
    css: String.raw`body { margin: 0; min-height: 480px; padding-bottom: 56px; }
#top { padding: 12px 16px; background-color: #e3f2fd; font-weight: bold; }
main { padding: 0 16px; }

/* 分頁列：貼著視窗底部，和視窗一樣寬 */
#tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  box-sizing: border-box;
  display: flex;
  height: 56px;
  background-color: #ffffff;
  border-top: 1px solid #b0bec5;
}
/* 每個項目平分寬度；圖示在上、文字在下 */
#tabs a {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-top: 3px solid transparent;
  font-size: 12px;
  color: #455a64;
  text-decoration: none;
}
#tabs svg { width: 24px; height: 24px; fill: currentColor; }

/* 目前的頁面：樣式直接跟著 aria-current */
#tabs a[aria-current="page"] {
  border-top-color: #0d47a1;
  color: #0d47a1;
  font-weight: bold;
}`,
  },
  observe: [
    { check: 'box', selector: '#tabs', measure: 'bottom', value: 640, from: ':viewport', label: '視窗寬 360px、高 640px：分頁列的下緣貼著視窗的底部（640px）' },
    { check: 'box', selector: '#tabs a:nth-child(2)', measure: 'left', value: 90, from: ':viewport', label: '四個項目平分 360px，每個 90px：第二個項目從 90px 的地方開始' },
    { check: 'role', selector: '#tabs', role: 'navigation', label: '分頁列是一個導覽地標（`<nav>` 的角色是 navigation），不是頁籤' },
    { check: 'name', selector: '#tabs a[aria-current="page"]', text: '訂單', label: '標著 `aria-current="page"` 的連結，無障礙名稱是「訂單」：圖示有 `aria-hidden`，不算進名稱' },
    { do: 'resize', width: 412 },
    { check: 'box', selector: '#tabs a:nth-child(2)', measure: 'left', value: 103, from: ':viewport', label: '視窗寬 412px：仍然平分，每個項目 103px' },
  ],
};

const DRAWER_CSS = String.raw`body { margin: 0; min-height: 480px; }
#top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: #e3f2fd;
}
#menu-button, #drawer-close { padding: 10px 16px; font: inherit; }
main { padding: 0 16px; }

/* 遮罩：鋪滿整個視窗 */
#backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.4);
}
/* 抽屜：貼著視窗左邊，從上到下；內容太長時自己捲動 */
#drawer {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  box-sizing: border-box;
  width: 260px;
  padding: 12px;
  overflow-y: auto;
  background-color: #ffffff;
}
#drawer a { display: block; padding: 12px 4px; }`;

const drawerHtml = (links: [string, string][]) => String.raw`<div id="page">
  <header id="top">
    <button type="button" id="menu-button" aria-expanded="false" aria-controls="drawer">選單</button>
    <a id="logo" href="/">小島外送</a>
    <a id="cart" href="/cart">購物車</a>
  </header>
  <main>
    <h1>今日菜單</h1>
    <p>海鹽雞腿便當 120 元</p>
  </main>
</div>
<div id="backdrop" hidden></div>
<nav id="drawer" aria-label="更多功能" hidden>
  <button type="button" id="drawer-close">關閉選單</button>
` + links.map(([href, text]) => `  <a href="${href}">${text}</a>`).join('\n') + String.raw`
</nav>`;

const DRAWER_JS_HEAD = String.raw`const page = document.querySelector('#page');
const button = document.querySelector('#menu-button');
const drawer = document.querySelector('#drawer');
const backdrop = document.querySelector('#backdrop');
const closeButton = document.querySelector('#drawer-close');
`;
const DRAWER_JS_CLICKS = String.raw`
button.addEventListener('click', () => setOpen(true));
closeButton.addEventListener('click', () => setOpen(false));
backdrop.addEventListener('click', () => setOpen(false));
`;
const DRAWER_JS_SETOPEN = String.raw`
function setOpen(open) {
  drawer.hidden = !open;
  backdrop.hidden = !open;
  page.inert = open; // 抽屜開著時，背後的頁面不能操作
  button.setAttribute('aria-expanded', String(open));
  if (open) {
    closeButton.focus(); // 焦點移進抽屜
  } else {
    button.focus(); // inert 已經拿掉，焦點才還得回去
  }
}
`;
const DRAWER_JS_ESCAPE = String.raw`document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !drawer.hidden) setOpen(false);
});
`;
const DRAWER_JS = DRAWER_JS_HEAD + DRAWER_JS_SETOPEN + DRAWER_JS_CLICKS + DRAWER_JS_ESCAPE;

const drawer: WebExample = {
  id: 'mob02-drawer', title: '抽屜：選單按鈕、遮罩，與不能操作的背景',
  description: '小島外送的菜單頁。六個次要的目的地收在 `<nav id="drawer">` 裡，由頁首的「選單」按鈕開啟；抽屜開著時，遮罩 `#backdrop` 蓋住頁面，包住頁面內容的 `#page` 被設成 `inert`。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  files: {
    html: drawerHtml([['/coupons', '優惠券'], ['/address', '外送地址'], ['/history', '歷史訂單'], ['/pay', '付款方式'], ['/settings', '設定'], ['/help', '客服中心']]),
    css: DRAWER_CSS,
    js: DRAWER_JS,
  },
  observe: [
    { do: 'click', selector: '#menu-button' },
    { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'true', label: '點一下「選單」：抽屜開啟，按鈕的 `aria-expanded` 變成 `true`' },
    { check: 'focus', selector: '#drawer-close', label: '焦點被移進抽屜，停在「關閉選單」按鈕上' },
    { check: 'attr', selector: '#page', name: 'inert', label: '包住頁面內容的 `#page` 多了 `inert` 屬性：裡面的東西暫時不能操作' },
    { check: 'hit', selector: '#cart', top: '#backdrop', label: '頁首的「購物車」被遮罩蓋住：那個位置畫在最上面的是 `#backdrop`' },
    { do: 'key', selector: '#drawer a', key: 'Escape' },
    { check: 'focus', selector: '#menu-button', label: '焦點在抽屜的連結上時按 Escape：抽屜關閉，焦點回到「選單」按鈕' },
  ],
};

const SHEET_CSS = String.raw`body { margin: 0; min-height: 480px; }
main { padding: 0 16px; }
#more { padding: 10px 16px; font: inherit; }

/* 底部面板：把預設置中的對話框改成貼著底部、和視窗一樣寬 */
#sheet {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  margin: auto 0 0;
  border: 0;
  border-radius: 16px 16px 0 0;
  padding: 0;
}
#sheet::backdrop { background-color: rgba(0, 0, 0, 0.4); }

/* 內距寫在裡面的容器上，對話框自己的 padding 是 0 */
#sheet-body { padding: 8px 16px 16px; }
#sheet-body h2 { margin: 8px 0; font-size: 18px; }
#sheet-body button {
  display: block;
  width: 100%;
  min-height: 48px;
  margin-top: 8px;
  font: inherit;
}`;

const sheetPage = (panel: string) => String.raw`<main>
  <h1>我的訂單</h1>
  <article id="order">
    <h2>海鹽雞腿便當</h2>
    <p>已送達，120 元</p>
    <button type="button" id="more">更多動作</button>
  </article>
  <p id="status" role="status"></p>
</main>
<dialog id="sheet" aria-labelledby="sheet-title">
` + panel + String.raw`
</dialog>`;

const sheet: WebExample = {
  id: 'mob02-sheet', title: '底部面板：用對話框做一份動作清單',
  description: '「我的訂單」裡的一筆訂單。按「更多動作」，`<dialog id="sheet">` 用 `showModal()` 開啟，樣式把它改成貼著視窗底部的面板。面板裡的按鈕放在 `<form method="dialog">` 裡：按下任何一顆，面板就關閉，那顆按鈕的 `value` 成為對話框的 `returnValue`。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  files: {
    html: sheetPage(String.raw`  <form method="dialog" id="sheet-body">
    <h2 id="sheet-title">訂單：海鹽雞腿便當</h2>
    <button value="再訂一次">再訂一次</button>
    <button value="查看明細">查看明細</button>
    <button value="刪除紀錄">刪除紀錄</button>
    <button value="">取消</button>
  </form>`),
    css: SHEET_CSS,
    js: String.raw`const more = document.querySelector('#more');
const sheet = document.querySelector('#sheet');
const statusLine = document.querySelector('#status');

more.addEventListener('click', () => {
  sheet.returnValue = ''; // 清掉上一次留下的結果
  sheet.showModal(); // 強制回應：焦點移進面板，其餘的頁面不能操作
});

// 點在面板外面的遮罩上：事件的 target 是 dialog 自己
sheet.addEventListener('click', (event) => {
  if (event.target === sheet) sheet.close();
});

// 不管從哪一條路關閉，最後都會收到 close 事件
sheet.addEventListener('close', () => {
  if (sheet.returnValue !== '') {
    statusLine.textContent = '已選擇：' + sheet.returnValue;
  }
});`,
  },
  observe: [
    { do: 'click', selector: '#more' },
    { check: 'box', selector: '#sheet', measure: 'bottom', value: 640, from: ':viewport', label: '點「更多動作」：面板開啟，下緣貼著視窗的底部（640px）' },
    { check: 'focus', selector: '#sheet-body button:first-of-type', label: '焦點自動移到面板裡第一個可以聚焦的元素：「再訂一次」' },
    { check: 'hit', selector: '#more', top: '#sheet', label: '後面的「更多動作」被擋住：那個位置畫在最上面的是對話框（它的遮罩）' },
    { do: 'click', selector: '#sheet-body button' },
    { check: 'text', selector: '#status', text: '已選擇：再訂一次', label: '按「再訂一次」：表單關閉面板，`close` 的監聽器把 `returnValue` 寫到頁面上' },
    { check: 'focus', selector: '#more', label: '面板關閉後，焦點自動回到開啟它的「更多動作」按鈕' },
  ],
};

const twoWays: WebExample = {
  id: 'mob02-two-ways', title: '同一個對話框的兩種開法：非強制回應與強制回應',
  description: '菜單頁上有一塊購物車面板 `<dialog id="cart">`，兩顆按鈕分別用 `show()` 與 `showModal()` 開啟它。「加入購物車」會把面板裡的件數加一，用來確認頁面此刻能不能操作。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  files: {
    html: String.raw`<main>
  <h1>今日菜單</h1>
  <p>海鹽雞腿便當 120 元</p>
  <button type="button" id="add">加入購物車</button>
  <p>
    <button type="button" id="open-show">用 show() 開啟</button>
    <button type="button" id="open-modal">用 showModal() 開啟</button>
  </p>
</main>
<dialog id="cart" aria-labelledby="cart-title">
  <h2 id="cart-title">購物車</h2>
  <p>目前有 <output id="count">0</output> 件</p>
  <button type="button" id="close">關閉</button>
</dialog>`,
    css: String.raw`body { margin: 0; min-height: 480px; }
main { padding: 0 16px; }
button { padding: 10px 12px; font: inherit; }

/* 兩種開法都貼在視窗底部 */
#cart {
  position: fixed;
  inset: auto 0 0 0;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  margin: 0;
  border: 0;
  border-top: 1px solid #90a4ae;
  padding: 4px 16px 16px;
}
#cart::backdrop { background-color: rgba(0, 0, 0, 0.4); }`,
    js: String.raw`const cart = document.querySelector('#cart');
const count = document.querySelector('#count');

function reopen(modal) {
  if (cart.open) cart.close(); // 已經開著，就先關掉再換另一種開法
  if (modal) {
    cart.showModal();
  } else {
    cart.show();
  }
}

document.querySelector('#open-show').addEventListener('click', () => reopen(false));
document.querySelector('#open-modal').addEventListener('click', () => reopen(true));
document.querySelector('#close').addEventListener('click', () => cart.close());
document.querySelector('#add').addEventListener('click', () => {
  count.textContent = Number(count.textContent) + 1;
});`,
  },
  observe: [
    { do: 'click', selector: '#open-show' },
    { check: 'count', selector: '#cart:modal', count: 0, label: '用 `show()` 開啟：面板出現了，但它不是強制回應的（不符合 `:modal`）' },
    { check: 'hit', selector: '#add', top: '#add', label: '頁面沒有被擋住：「加入購物車」的位置上，畫在最上面的仍然是它自己' },
    { do: 'click', selector: '#close' },
    { do: 'click', selector: '#open-modal' },
    { check: 'count', selector: '#cart:modal', count: 1, label: '關閉後改用 `showModal()` 開啟：同一個面板現在是強制回應的（符合 `:modal`）' },
    { check: 'hit', selector: '#add', top: '#cart', label: '頁面被擋住了：「加入購物車」的位置上，畫在最上面的是對話框（它的遮罩）' },
    { do: 'click', selector: '#close' },
    { check: 'focus', selector: '#open-modal', label: '按「關閉」：焦點回到剛才開啟它的按鈕' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const TABS_HTML = String.raw`<header id="top">小島外送</header>
<main>
  <h1>我的訂單</h1>
  <p>海鹽雞腿便當：外送中，大約 10 分鐘後抵達。</p>
</main>
<nav id="tabs" aria-label="主要功能">
  <a href="/">首頁</a>
  <a href="/menu">菜單</a>
  <a href="/orders" aria-current="page">訂單</a>
  <a href="/me">我的</a>
</nav>`;

const tabsCss = (bar: string, rest = '') => String.raw`body { margin: 0; min-height: 480px; padding-bottom: 56px; }
#top { padding: 12px 16px; background-color: #fff3e0; font-weight: bold; }
main { padding: 0 16px; }

/* 分頁列的外觀：這幾行請保留，把你的宣告加在後面 */
#tabs {
  box-sizing: border-box;
  height: 56px;
  background-color: #ffffff;
  border-top: 1px solid #b0bec5;
` + bar + String.raw`}
#tabs a {
  line-height: 55px;
  text-align: center;
  color: #455a64;
  text-decoration: none;
}
` + rest;

const TABS_FIXED = String.raw`  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
`;
const TABS_REST = String.raw`#tabs a { flex: 1; }
#tabs a[aria-current="page"] { font-weight: bold; }
`;

const exTabBar: WebExercise = {
  id: 'mob02-ex-tabbar', title: '把一排連結變成底部的分頁列',
  statement: 'index.html 不能改。小島外送的「我的訂單」頁面最後有一個 `<nav id="tabs">`，裡面是四個連結，其中「訂單」已經有 `aria-current="page"`。目前它只是跟在內容後面的一排字。請修改 style.css，把它變成分頁列：`#tabs` 用 `position: fixed` 固定在視窗底部（下緣貼著視窗的下緣），左右和視窗一樣寬；四個連結平分整列的寬度（視窗寬 360px 時每個 90px），中間不留間距；標著 `aria-current="page"` 的那個連結用粗體（`font-weight` 是 700）。原本的宣告請保留。檢查會在 360 × 640 的視窗量一次，再把寬度改成 412px 量一次，所以寬度不能寫死成像素。',
  hints: [
    '先處理位置：固定定位的元素要用 `top`、`right`、`bottom`、`left` 說明它貼著視窗的哪幾邊。只寫 `bottom: 0` 的話，它的寬度會縮成和內容一樣寬。',
    '再處理平分：把 `#tabs` 變成 flex 容器，讓每個連結拿到同樣多的寬度（`flex: 1`）。目前頁面的樣式用屬性選擇器 `#tabs a[aria-current="page"]` 來寫。',
    '在 `#tabs` 的規則裡加上 `position: fixed; left: 0; right: 0; bottom: 0; display: flex;`，再加兩條規則：`#tabs a { flex: 1; }` 與 `#tabs a[aria-current="page"] { font-weight: bold; }`。',
  ],
  explanation: '`position: fixed` 讓 `#tabs` 以視窗為準定位：`bottom: 0` 貼著視窗底部，`left: 0` 與 `right: 0` 把它拉到和視窗一樣寬，頁面捲動時它留在原地。`display: flex` 加上每個連結的 `flex: 1` 讓四個項目平分寬度：360px 時各 90px，412px 時各 103px，不必替任何一種手機算寬度；成為 flex 項目之後，整格都是連結，都按得到。目前頁面的粗體寫在 `[aria-current="page"]` 這個屬性選擇器上：螢幕閱讀器聽到的「目前頁面」與畫面上加粗的項目來自同一個屬性，換頁時只要搬動這個屬性。`body` 原本就有的 `padding-bottom: 56px` 替分頁列留了位置，內容的最後一段不會被它蓋住。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  fixed: { html: TABS_HTML },
  starter: { css: tabsCss('') },
  solution: { css: tabsCss(TABS_FIXED, TABS_REST) },
  steps: [
    { check: 'style', selector: '#tabs', property: 'position', value: 'fixed', label: '分頁列固定在視窗上（`#tabs` 的 `position` 是 `fixed`）' },
    { check: 'box', selector: '#tabs', measure: 'bottom', value: 640, from: ':viewport', label: '視窗 360 × 640：分頁列的下緣貼著視窗的底部' },
    { check: 'box', selector: '#tabs a:nth-child(2)', measure: 'left', value: 90, from: ':viewport', label: '四個連結平分寬度：第二個連結從離視窗左邊 90px 的地方開始' },
    { check: 'box', selector: '#tabs a:nth-child(4)', measure: 'right', value: 360, from: ':viewport', label: '分頁列和視窗一樣寬：第四個連結的右緣貼著視窗的右邊（360px）' },
    { check: 'style', selector: '#tabs a[aria-current="page"]', property: 'font-weight', value: ['700', 'bold'], label: '目前頁面的連結（有 `aria-current="page"`）是粗體' },
    { do: 'resize', width: 412 },
    { check: 'box', selector: '#tabs a:nth-child(4)', measure: 'left', value: 309, from: ':viewport', label: '視窗寬 412px：四個連結仍然平分，第四個從 309px 的地方開始' },
  ],
  mistakes: [
    { files: { css: tabsCss(String.raw`  position: sticky;
  bottom: 0;
  display: flex;
`, TABS_REST) }, why: '用了 `position: sticky; bottom: 0`。黏貼定位的元素仍然留在一般的排版流裡：這一頁的內容比視窗短，分頁列就跟在內容的後面，沒有貼到視窗的底部。要它不管內容多長都在視窗底部，用的是 `fixed`。' },
    { files: { css: tabsCss(String.raw`  position: fixed;
  bottom: 0;
  display: flex;
`, TABS_REST) }, why: '只寫了 `bottom: 0`，沒有 `left` 與 `right`（或 `width: 100%`）。固定定位的元素沒有被指定寬度時，只會和內容一樣寬：四個項目擠在左下角，右邊一大片是空的。' },
    { files: { css: tabsCss(TABS_FIXED, String.raw`#tabs a[aria-current="page"] { font-weight: bold; }
`) }, why: '`#tabs` 成了 flex 容器，卻沒有讓連結平分寬度（少了 `flex: 1`）。四個連結各自只有文字那麼寬，全部靠左排：可以按的範圍只剩文字本身，拇指很難按準。' },
  ],
};

const DRAWER_JS_STARTER = DRAWER_JS_HEAD + String.raw`
function setOpen(open) {
  drawer.hidden = !open;
  backdrop.hidden = !open;
  page.inert = open; // 抽屜開著時，背後的頁面不能操作
  // 還缺：更新 aria-expanded，並決定焦點要去哪裡
}
` + DRAWER_JS_CLICKS + String.raw`// 還缺：按 Escape 關閉
`;

const exDrawer: WebExercise = {
  id: 'mob02-ex-drawer', title: '把抽屜做完：狀態、焦點與 Escape',
  statement: 'index.html 與 style.css 不能改。頁首的「選單」按鈕 `#menu-button`（`aria-expanded="false"`、`aria-controls="drawer"`）開啟抽屜 `#drawer`；抽屜裡有「關閉選單」按鈕 `#drawer-close` 與幾個連結，後面墊著遮罩 `#backdrop`。script.js 已經會開關抽屜與遮罩，並把 `#page` 設成 `inert`。請補上三件事。一、`aria-expanded`：抽屜開著時是 `"true"`，關閉後是 `"false"`。二、焦點：開啟時移到抽屜裡的 `#drawer-close`；不管用哪一種方式關閉（關閉按鈕、點遮罩、Escape），焦點都回到 `#menu-button`。三、抽屜開著時按 Escape 會關閉它，焦點在抽屜裡的任何元素上都要有效。檢查的順序：點「選單」、在抽屜的第一個連結上按 Escape、再開一次並點遮罩。檢查還會在另一個連結不同的頁面上再執行一次，改用鍵盤的 Enter 開啟、用「關閉選單」按鈕關閉。',
  hints: [
    '三種關閉方式都呼叫 `setOpen(false)`，開啟則呼叫 `setOpen(true)`：把 `aria-expanded` 與焦點都寫進 `setOpen`，每一條路就都顧到了。',
    '焦點的順序要注意：`hidden` 的元素與 `inert` 裡的元素都不能取得焦點。所以 `closeButton.focus()` 要寫在 `drawer.hidden = false` 之後，`button.focus()` 要寫在 `page.inert = false` 之後。Escape 要在哪個元素上監聽，焦點在抽屜裡的連結上時才接得到？',
    '在 `setOpen` 的最後加上 `button.setAttribute(\'aria-expanded\', String(open));` 以及 `if (open) closeButton.focus(); else button.focus();`。檔案最後加上 `document.addEventListener(\'keydown\', (event) => { if (event.key === \'Escape\' && !drawer.hidden) setOpen(false); });`。',
  ],
  explanation: '`setOpen(open)` 是唯一改變抽屜狀態的地方，三種關閉方式與開啟都經過它，所以把 `aria-expanded` 與焦點寫在裡面，狀態就不會有哪一條路漏掉。順序是關鍵：函式先切換 `hidden` 與 `inert`，最後才搬焦點。開啟時抽屜已經顯示，`closeButton.focus()` 才有效；關閉時 `#page` 的 `inert` 已經拿掉，`button.focus()` 才還得回去。對 `hidden` 或 `inert` 的元素呼叫 `focus()` 不會有任何效果，也不會報錯。Escape 的監聽器登記在 `document` 上：`keydown` 會冒泡，焦點在關閉按鈕或任何一個連結上都接得到；條件裡的 `!drawer.hidden` 讓它在抽屜關著的時候什麼都不做。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  fixed: { html: drawerHtml([['/coupons', '優惠券'], ['/address', '外送地址'], ['/history', '歷史訂單'], ['/settings', '設定'], ['/help', '客服中心']]), css: DRAWER_CSS },
  starter: { js: DRAWER_JS_STARTER },
  solution: { js: DRAWER_JS },
  steps: [
    { do: 'click', selector: '#menu-button' },
    { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'true', label: '點「選單」開啟抽屜：`#menu-button` 的 `aria-expanded` 變成 `true`' },
    { check: 'focus', selector: '#drawer a, #drawer button', label: '開啟後，焦點在抽屜裡（關閉按鈕或其中一個連結）' },
    { do: 'key', selector: '#drawer a', key: 'Escape' },
    { check: 'style', selector: '#drawer', property: 'display', value: 'none', label: '焦點在抽屜的第一個連結上時按 Escape：抽屜關閉（`display` 是 `none`）' },
    { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'false', label: '關閉後，`aria-expanded` 回到 `false`' },
    { check: 'focus', selector: '#menu-button', label: '按 Escape 關閉後，焦點回到 `#menu-button`' },
    { do: 'click', selector: '#menu-button' },
    { do: 'click', selector: '#backdrop' },
    { check: 'focus', selector: '#menu-button', label: '再開一次，改點遮罩關閉：焦點同樣回到 `#menu-button`' },
  ],
  mistakes: [
    { files: { js: DRAWER_JS_HEAD + DRAWER_JS_SETOPEN + DRAWER_JS_CLICKS + String.raw`button.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setOpen(false);
});
` }, why: 'Escape 的監聽器登記在「選單」按鈕上。抽屜開著的時候，焦點在抽屜裡，按鍵事件從抽屜裡的元素往上冒泡，不會經過那顆按鈕：按 Escape 沒有反應。登記在 `document`（或抽屜本身）上，才接得到抽屜裡的按鍵。' },
    { files: { js: DRAWER_JS_HEAD + String.raw`
function setOpen(open) {
  button.setAttribute('aria-expanded', String(open));
  if (open) {
    closeButton.focus();
  } else {
    button.focus();
  }
  drawer.hidden = !open;
  backdrop.hidden = !open;
  page.inert = open; // 抽屜開著時，背後的頁面不能操作
}
` + DRAWER_JS_CLICKS + DRAWER_JS_ESCAPE }, why: '先搬焦點，才切換 `hidden` 與 `inert`。開啟時抽屜還藏著，`closeButton.focus()` 沒有效果，焦點留在後面的按鈕上；關閉時 `#page` 還是 `inert`，`button.focus()` 同樣沒有效果，焦點沒有還回去。要先讓目的地可以聚焦，再呼叫 `focus()`。' },
    { files: { js: DRAWER_JS_HEAD + String.raw`
function setOpen(open) {
  drawer.hidden = !open;
  backdrop.hidden = !open;
  page.inert = open; // 抽屜開著時，背後的頁面不能操作
  button.setAttribute('aria-expanded', String(open));
  if (open) closeButton.focus();
}
` + DRAWER_JS_CLICKS + String.raw`document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !drawer.hidden) {
    setOpen(false);
    button.focus();
  }
});
` }, why: '只有 Escape 那條路把焦點還給按鈕。用「關閉選單」按鈕或點遮罩關閉時，原本有焦點的元素被藏起來，焦點就遺失了。三種關閉方式要有同樣的結果，所以還焦點要寫在它們共用的 `setOpen` 裡。' },
  ],
  variants: [{
    title: '另一個頁面：兩個連結，用 Enter 開啟、用關閉按鈕關閉',
    fixed: { html: drawerHtml([['/address', '外送地址'], ['/help', '客服中心']]) },
    steps: [
      { do: 'key', selector: '#menu-button', key: 'Enter' },
      { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'true', label: '在按鈕上按 Enter 開啟' },
      { check: 'focus', selector: '#drawer a, #drawer button', label: '焦點在抽屜裡' },
      { do: 'click', selector: '#drawer-close' },
      { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'false', label: '按關閉按鈕後 aria-expanded 是 false' },
      { check: 'focus', selector: '#menu-button', label: '焦點回到選單按鈕' },
      { check: 'attr', selector: '#page', name: 'inert', match: 'absent', label: '頁面不再是 inert' },
      { do: 'key', selector: '#menu-button', key: 'Escape' },
      { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'false', label: '抽屜關著時按 Escape 沒有影響' },
      { do: 'click', selector: '#menu-button' },
      { do: 'key', selector: '#drawer-close', key: 'Escape' },
      { check: 'style', selector: '#drawer', property: 'display', value: 'none', label: '焦點在關閉按鈕上時按 Escape 也會關閉' },
      { check: 'focus', selector: '#menu-button', label: '焦點回到選單按鈕' },
    ],
  }],
};

const SHEET_EX_HTML = sheetPage(String.raw`  <div id="sheet-body">
    <h2 id="sheet-title">訂單：海鹽雞腿便當</h2>
    <button type="button" class="action" id="again">再訂一次</button>
    <button type="button" class="action" id="detail">查看明細</button>
    <button type="button" class="action" id="remove">刪除紀錄</button>
    <button type="button" id="cancel">取消</button>
  </div>`);

const SHEET_JS_HEAD = String.raw`const more = document.querySelector('#more');
const sheet = document.querySelector('#sheet');
const cancel = document.querySelector('#cancel');
const statusLine = document.querySelector('#status');
`;
const SHEET_JS_OPEN_CANCEL = String.raw`
more.addEventListener('click', () => {
  sheet.showModal();
});

cancel.addEventListener('click', () => {
  sheet.close();
});
`;
const SHEET_JS_ACTION = String.raw`
sheet.addEventListener('click', (event) => {
  const action = event.target.closest('.action');
  if (!action) return;
  statusLine.textContent = '已選擇：' + action.textContent;
  sheet.close();
});
`;

const exSheet: WebExercise = {
  id: 'mob02-ex-sheet', title: '開啟與關閉一塊底部面板',
  statement: 'style.css 不能改。訂單上的「更多動作」按鈕 `#more` 要開啟面板 `<dialog id="sheet">`；面板裡有三顆 `class="action"` 的動作按鈕（`#again`、`#detail`、`#remove`）與「取消」按鈕 `#cancel`，樣式已經把對話框排在視窗底部。請完成 script.js，讓頁面做到三件事。一、點 `#more`：用強制回應的方式開啟面板（檢查會用 `:modal` 確認）。二、點任何一顆 `.action`：面板關閉，`#status` 寫著「已選擇：」加上那顆按鈕的文字。三、點 `#cancel`：面板關閉，`#status` 的內容不變。面板要用對話框自己的方式關閉，焦點才會自動回到 `#more`。做法不只一種：可以在點擊的監聽器裡寫入結果再呼叫 `close()`，也可以把結果交給 `close()`，在 `close` 事件裡從 `returnValue` 讀出來。index.html 可以不改；想改成用 `<form method="dialog">` 讓按鈕自己關閉面板也可以，只要保留這些 `id` 與類別。檢查會先選第一個動作，再開一次按「取消」，最後選第三個動作。真正的瀏覽器裡按 Escape 就會關閉強制回應的對話框，不必自己寫，檢查也不會按它。',
  hints: [
    '`<dialog>` 有三個方法：`show()`、`showModal()` 與 `close()`。哪一個開啟的對話框會擋住後面的頁面、把焦點移進去？',
    '動作按鈕有三顆：在 `sheet` 上登記一個 `click` 監聽器，用 `event.target.closest(\'.action\')` 找出被點到的是哪一顆（事件委派），文字用它的 `textContent`。「取消」不是動作：它只關閉面板，不要把它也寫進 `#status`。',
    '`more.addEventListener(\'click\', () => sheet.showModal());`、`cancel.addEventListener(\'click\', () => sheet.close());`，面板的監聽器裡找到 `action` 之後寫 `statusLine.textContent = \'已選擇：\' + action.textContent;` 再呼叫 `sheet.close();`。另一種寫法：呼叫 `sheet.close(action.textContent)`，在 `close` 事件的監聽器裡用 `sheet.returnValue` 寫入。',
  ],
  explanation: '`showModal()` 把對話框放到最上層、產生遮罩、讓頁面其他部分不能操作，並把焦點移進面板；`close()` 關閉它，並把焦點還給開啟前有焦點的元素，也就是 `#more`。這些都是瀏覽器做的，指令稿只需要在對的時候呼叫這兩個方法。參考解答用事件委派處理動作按鈕：監聽器登記在面板上，`closest(\'.action\')` 找出被點到的按鈕，所以「取消」不會被當成動作，面板裡有幾個動作也都適用同一段程式。選了動作之後一定要關閉：面板是強制回應的，不關閉，使用者就回不到頁面。另外兩種做法同樣通過檢查：把文字交給 `sheet.close(action.textContent)`，在 `close` 事件裡讀 `returnValue`；或是像底部面板那一節的範例，把按鈕放進 `<form method="dialog">` 並替動作按鈕寫上 `value`，關閉就交給瀏覽器。用 `returnValue` 時要記得它會留著上一次的值：取消的那條路不能把舊的結果當成新的選擇。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  fixed: { css: SHEET_CSS },
  starter: { html: SHEET_EX_HTML, js: SHEET_JS_HEAD + String.raw`
more.addEventListener('click', () => {
  // 開啟面板
});

cancel.addEventListener('click', () => {
  // 關閉面板
});

sheet.addEventListener('click', (event) => {
  // 點到 .action：把結果寫進 #status，再關閉面板
});
` },
  solution: { html: SHEET_EX_HTML, js: SHEET_JS_HEAD + SHEET_JS_OPEN_CANCEL + SHEET_JS_ACTION },
  steps: [
    { do: 'click', selector: '#more' },
    { check: 'count', selector: '#sheet:modal', count: 1, label: '點「更多動作」：面板以強制回應的方式開啟（符合 `:modal`），頁面其他部分暫時不能操作' },
    { do: 'click', selector: '#again' },
    { check: 'text', selector: '#status', text: '已選擇：再訂一次', label: '點第一個動作 `#again`：`#status` 寫著「已選擇：」加上那顆按鈕的文字' },
    { check: 'attr', selector: '#sheet', name: 'open', match: 'absent', label: '選了動作之後，面板關閉（`#sheet` 沒有 `open` 屬性）' },
    { do: 'click', selector: '#more' },
    { do: 'click', selector: '#cancel' },
    { check: 'focus', selector: '#more', label: '再開一次，點「取消」：面板關閉，焦點回到 `#more`' },
    { check: 'text', selector: '#status', text: '已選擇：再訂一次', label: '取消不是動作：`#status` 仍然是上一次的結果' },
    { do: 'click', selector: '#more' },
    { do: 'click', selector: '#remove' },
    { check: 'text', selector: '#status', text: '已選擇：刪除紀錄', label: '再開一次，點第三個動作 `#remove`：`#status` 換成它的文字' },
  ],
  mistakes: [
    { files: { html: SHEET_EX_HTML, js: SHEET_JS_HEAD + String.raw`
more.addEventListener('click', () => {
  sheet.show();
});

cancel.addEventListener('click', () => {
  sheet.close();
});
` + SHEET_JS_ACTION }, why: '用 `show()` 開啟。這樣開的對話框是非強制回應的：沒有遮罩，後面的頁面照樣可以操作，按 Escape 也不會關閉；它也不在最上層，而是依一般的定位出現在頁面中，不會貼在視窗底部。要使用者先選一個動作的面板，用的是 `showModal()`。' },
    { files: { html: SHEET_EX_HTML, js: SHEET_JS_HEAD + SHEET_JS_OPEN_CANCEL + String.raw`
sheet.addEventListener('click', (event) => {
  const action = event.target.closest('.action');
  if (!action) return;
  statusLine.textContent = '已選擇：' + action.textContent;
});
` }, why: '選了動作之後只寫了結果，沒有關閉面板。面板是強制回應的：它不關閉，後面的頁面就一直不能操作，使用者看得到結果卻碰不到頁面，還得自己再按一次「取消」。' },
    { files: { html: SHEET_EX_HTML, js: SHEET_JS_HEAD + String.raw`
more.addEventListener('click', () => {
  sheet.showModal();
});

sheet.addEventListener('click', (event) => {
  const pressed = event.target.closest('button');
  if (!pressed) return;
  statusLine.textContent = '已選擇：' + pressed.textContent;
  sheet.close();
});
` }, why: '把面板裡所有的按鈕都當成動作。按「取消」時面板是關了，頁面上卻寫著「已選擇：取消」，蓋掉上一次真正的選擇。取消是「什麼都不做」：監聽器要分辨被點到的是 `.action` 還是 `#cancel`。' },
  ],
};

const MORE_CSS = String.raw`body { margin: 0; min-height: 480px; padding-bottom: 56px; }
main { padding: 0 16px; }

/* 分頁列：裡面的每個項目（連結或按鈕）平分寬度 */
#tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  box-sizing: border-box;
  display: flex;
  height: 56px;
  background-color: #ffffff;
  border-top: 1px solid #b0bec5;
}
#tabs a, #tabs button {
  flex: 1;
  min-width: 0;
  border: 0;
  padding: 0;
  background: none;
  font: inherit;
  font-size: 13px;
  line-height: 55px;
  text-align: center;
  color: #455a64;
  text-decoration: none;
}
#tabs a[aria-current="page"] { color: #0d47a1; font-weight: bold; }

/* 「更多」開啟的底部面板 */
#more-sheet {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  margin: auto 0 0;
  border: 0;
  border-radius: 16px 16px 0 0;
  padding: 8px 16px 16px;
}
#more-sheet::backdrop { background-color: rgba(0, 0, 0, 0.4); }
#more-links a { display: block; padding: 12px 0; }
#more-close { width: 100%; min-height: 48px; font: inherit; }`;

const MORE_JS = String.raw`const sheet = document.querySelector('#more-sheet');

// 事件委派：#more-button 是你加進 HTML 的，這裡不必改
document.addEventListener('click', (event) => {
  if (event.target.closest('#more-button')) sheet.showModal();
  if (event.target.closest('#more-close')) sheet.close();
});`;

const moreHtml = (tabs: string, links: string) => String.raw`<main>
  <h1>小島外送</h1>
  <p>今天想吃什麼？</p>
</main>
<nav id="tabs" aria-label="主要功能">
` + tabs + String.raw`</nav>
<dialog id="more-sheet" aria-labelledby="more-title">
  <h2 id="more-title">更多功能</h2>
  <div id="more-links">
` + links + String.raw`  </div>
  <button type="button" id="more-close">關閉</button>
</dialog>`;

const RARE_IN_TABS = '#tabs a[href="/coupons"], #tabs a[href="/address"], #tabs a[href="/help"]';
const RARE_IN_SHEET = '#more-sheet a[href="/coupons"], #more-sheet a[href="/address"], #more-sheet a[href="/help"]';

const exMore: WebExercise = {
  id: 'mob02-ex-more', title: '七個項目的分頁列：留下四個，其餘收進更多',
  statement: 'style.css 與 script.js 不能改。小島外送的分頁列 `#tabs` 塞了七個連結，視窗寬 360px 時每個只剩大約 51px。使用紀錄顯示：首頁、菜單、訂單、購物車幾乎每次造訪都會用到；優惠券、地址、客服偶爾才用。請修改 index.html：分頁列只留下那四個最常用的連結，後面加一個「更多」，寫成按鈕 `<button type="button" id="more-button">`（它開啟面板，不是前往另一頁），排在分頁列的最後；優惠券、地址、客服三個連結搬進面板 `#more-sheet` 裡的 `#more-links`，一個都不能少，`href` 不要改。script.js 已經寫好：點 `#more-button` 會開啟面板。樣式會讓分頁列裡的項目平分寬度，所以五個項目各 72px。檢查在 360px 量一次、412px 再量一次，最後點「更多」。',
  hints: [
    '先分類：七個連結裡哪四個是「幾乎每次都用」的？它們留在 `<nav id="tabs">` 裡；另外三個整行剪下，貼到 `<div id="more-links">` 裡面。',
    '「更多」不是連結：它不會帶人到另一個頁面，而是開啟一塊面板，所以用 `<button type="button">`。它的 `id` 要是 `more-button`，指令稿才認得它。',
    '`#tabs` 裡依序是首頁、菜單、訂單、購物車四個 `<a>`，最後一行是 `<button type="button" id="more-button">更多</button>`；`#more-links` 裡是 `<a href="/coupons">優惠券</a>`、`<a href="/address">地址</a>`、`<a href="/help">客服</a>`。',
  ],
  explanation: '分頁列的每個項目都要夠寬：七個項目各 51px，文字擠在一起，手指也容易按到隔壁；五個項目各 72px 就寬鬆得多。留下誰，看的是使用頻率，不是原本的排列順序：首頁、菜單、訂單、購物車幾乎每次都用，值得一直留在拇指旁邊。少用的三個沒有被刪掉，而是多按一下就到：「更多」開啟底部面板，裡面仍然是三個連結。「更多」本身是 `<button>`：它做的事是開啟面板，螢幕閱讀器會說它是按鈕，使用者就不會以為按下去要換頁；其餘四個是前往另一頁的連結。這就是分頁列加底部面板的組合：連次要功能的入口都在畫面底部，比放在上方角落的選單按鈕好按。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  fixed: { css: MORE_CSS, js: MORE_JS },
  starter: { html: moreHtml(String.raw`  <a href="/" aria-current="page">首頁</a>
  <a href="/coupons">優惠券</a>
  <a href="/menu">菜單</a>
  <a href="/address">地址</a>
  <a href="/orders">訂單</a>
  <a href="/help">客服</a>
  <a href="/cart">購物車</a>
`, '') },
  solution: { html: moreHtml(String.raw`  <a href="/" aria-current="page">首頁</a>
  <a href="/menu">菜單</a>
  <a href="/orders">訂單</a>
  <a href="/cart">購物車</a>
  <button type="button" id="more-button">更多</button>
`, String.raw`    <a href="/coupons">優惠券</a>
    <a href="/address">地址</a>
    <a href="/help">客服</a>
`) },
  steps: [
    { check: 'count', selector: RARE_IN_TABS, count: 0, label: '優惠券、地址、客服不再佔用分頁列（`#tabs` 裡沒有這三個連結）' },
    { check: 'count', selector: RARE_IN_SHEET, count: 3, label: '這三個連結都搬進了面板 `#more-sheet`，一個都沒有少' },
    { check: 'role', selector: '#tabs #more-button', role: 'button', label: '分頁列裡的「更多」（`#more-button`）是按鈕，不是連結' },
    { check: 'box', selector: '#more-button', measure: 'left', value: 288, from: ':viewport', label: '視窗寬 360px：分頁列共五個等寬的項目，各 72px，「更多」排在最後（從 288px 開始）' },
    { do: 'resize', width: 412 },
    { check: 'box', selector: '#more-button', measure: 'left', value: 329.6, from: ':viewport', label: '視窗寬 412px：五個項目仍然平分，「更多」從 329.6px 開始' },
    { do: 'click', selector: '#more-button' },
    { check: 'attr', selector: '#more-sheet', name: 'open', label: '點「更多」：面板開啟' },
  ],
  mistakes: [
    { files: { html: moreHtml(String.raw`  <a href="/" aria-current="page">首頁</a>
  <a href="/menu">菜單</a>
  <a href="/orders">訂單</a>
  <a href="/cart">購物車</a>
`, '') }, why: '把少用的三個連結直接刪掉。分頁列是寬鬆了，但優惠券、地址與客服從此沒有任何入口。少用不等於沒用：次要的功能要收起來，不是拿掉。' },
    { files: { html: moreHtml(String.raw`  <a href="/" aria-current="page">首頁</a>
  <a href="/coupons">優惠券</a>
  <a href="/menu">菜單</a>
  <a href="/address">地址</a>
  <button type="button" id="more-button">更多</button>
`, String.raw`    <a href="/orders">訂單</a>
    <a href="/help">客服</a>
    <a href="/cart">購物車</a>
`) }, why: '照原本的順序留下排在最前面的四個。結果偶爾才用的優惠券與地址佔著分頁列，每次都要用的訂單與購物車反而被收進面板，要多按一下。留下誰，要看使用頻率。' },
    { files: { html: moreHtml(String.raw`  <a href="/" aria-current="page">首頁</a>
  <a href="/menu">菜單</a>
  <a href="/orders">訂單</a>
  <a href="/cart">購物車</a>
  <a href="#more-sheet" id="more-button">更多</a>
`, String.raw`    <a href="/coupons">優惠券</a>
    <a href="/address">地址</a>
    <a href="/help">客服</a>
`) }, why: '把「更多」寫成連結。它不會帶人到另一個頁面，而是開啟一塊面板：這是按鈕的工作。寫成 `<a>`，螢幕閱讀器會說它是連結，使用者以為按下去要換頁；用原生的 `<button>` 才名實相符。' },
  ],
};

// ---- lesson -----------------------------------------------------------------------------------------------------
export const MOB02: LessonContent = {
  lessonId: 'MOB02',
  motivation: '手機上最常去的地方要放在哪裡、不常去的收到哪裡、針對眼前這筆資料的動作從哪裡出現，各有一種慣用的介面模式。這一課把分頁列、抽屜與底部面板各做一遍，讓你能替一個 App 選出合適的導覽模式，並說得出理由。',
  sections: [
    {
      id: 'mob02-three-patterns', title: '三種模式，回答三個不同的問題',
      blocks: [
        { type: 'p', text: '響應式設計島的「響應式導覽與表格」處理的是頁首那一排連結在窄螢幕上怎麼辦：換行、橫向捲動，或收合到選單按鈕後面。一個天天在手機上用的網站（訂餐、借書、記帳）還有三個更前面的問題要回答：使用者最常去的那幾個地方，放在哪裡才能一隻手就按得到？不常去的那些收到哪裡？針對眼前這一筆資料的動作（再訂一次、刪除）又從哪裡出現？手機介面對這三個問題各有一個慣用的答案，稱為 UI 模式（UI pattern）：' },
        { type: 'list', items: [
          '分頁列（Tab bar）：固定在畫面底部的一列，放三到五個最上層的目的地。一直看得到，按一下就到。',
          '抽屜（Drawer）：平常藏在畫面外，按了選單按鈕才從側邊蓋上來的面板，放數量多或不常用的目的地。',
          '底部面板（Bottom sheet）：從畫面底部升起、蓋住一部分頁面的面板，放和目前畫面有關的動作或細節。',
        ] },
        { type: 'p', text: '三者可以用三件事來比：平常看不看得到、到達要按幾下、落在拇指可及範圍（reach）的哪裡。上一課談過單手操作：直立握著一支長手機時，拇指最容易碰到的是畫面的下半部，最難碰到的是上方的兩個角落。' },
        { type: 'table', head: ['模式', '放什麼', '平常看得到嗎', '到達要按幾下', '可及範圍'], rows: [
          ['分頁列', '少數幾個最常去的目的地', '一直看得到，但永遠佔掉底部一列的高度', '一下', '在畫面底部，最容易按到'],
          ['抽屜', '很多個，或不常去的目的地', '看不到，只看得到一顆選單按鈕', '兩下：先開抽屜，再選', '選單按鈕常在上方的角落，最難按到'],
          ['底部面板', '目前畫面的動作或細節，不是目的地', '需要的時候才出現', '兩下：先按開啟它的按鈕，再選', '從底部升起，選項就在拇指旁邊'],
        ] },
        { type: 'p', text: '這一課用同一個例子「小島外送」（一個訂餐網站）把三種模式各做一遍，用的都是你學過的東西：`<nav>` 與連結、固定定位、一顆有 `aria-expanded` 的按鈕，以及原生的 `<dialog>`。這三個名字來自手機 App 的介面，HTML 沒有同名的元素；要做的是用對的元素把同樣的行為做出來，讓觸控、鍵盤與螢幕閱讀器都能用。最後一節整理模式選擇的依據。' },
        { type: 'callout', tone: 'note', title: '這一課的預覽是手機的大小', text: '範例與練習都在寬 360px、高 640px 的視窗裡檢查，預覽上方的按鈕可以切換寬度。用手指從邊緣滑出抽屜、把面板往下拖來關閉，這類手勢要到後面「觸控目標與手勢的實作」與「Pointer Events 與觸控事件」兩課才做。這一課的每個元件都用按鈕開關：手勢只能是額外的捷徑，按鈕一定要在。' },
      ],
    },
    {
      id: 'mob02-tabbar-section', title: '分頁列：最常去的地方一直在拇指旁邊',
      blocks: [
        { type: 'p', text: '分頁列適合放最上層、彼此平行、使用者會來回切換的目的地，例如首頁、菜單、訂單、我的。它的好處是三個「不用」：不用找（一直在畫面上）、不用伸手（在底部）、不用多按（一下就到），而且目前在哪一頁一眼就看得出來。代價是它永遠佔掉一列的高度，而且放不了幾個項目。' },
        { type: 'example', id: 'mob02-tabbar' },
        { type: 'p', text: '先看 index.html。分頁列就是一個 `<nav aria-label="主要功能">`，裡面四個連結。每個連結有圖示也有文字：圖示幫助辨認，文字才說得清楚它是什麼；只有圖示的分頁，使用者得用猜的。圖示是行內的 `<svg>`，寫了 `aria-hidden="true"`：連結的無障礙名稱由文字提供就夠了，圖示不必再被唸一次。目前所在的頁面用 `aria-current="page"` 標示，螢幕閱讀器走到「訂單」時會說出它是目前的頁面。`<nav>` 寫在 `<main>` 的後面：它在畫面上位於內容的下方，DOM 的順序和看到的順序一致，Tab 走的順序也就一致；使用螢幕閱讀器的人可以靠地標直接跳到這個導覽。' },
        { type: 'p', text: 'style.css 做三件事。第一，`position: fixed` 加上 `left: 0; right: 0; bottom: 0`，讓這一列貼著視窗的底部、和視窗一樣寬，頁面捲動時它不動（網頁基礎島「定位與堆疊順序」的固定定位）。第二，`display: flex` 加上每個連結的 `flex: 1`：四個項目平分寬度，360px 時各 90px；按預覽上方的 412px，就變成各 103px，不必替每一種手機算寬度。連結本身是 flex 項目，整格都是它的範圍，都按得到。第三，目前頁面的樣式寫在屬性選擇器 `#tabs a[aria-current="page"]` 上，而不是另外加一個類別：螢幕閱讀器聽到的狀態與畫面上看到的狀態來自同一個屬性，不會出現「畫面上亮著訂單，唸出來的目前頁面卻是首頁」這種不同步。除了顏色，目前的項目還加粗、多一條上邊線：辨認不能只靠顏色。' },
        { type: 'p', text: '固定定位的元素不佔版面的位置，頁面最後 56px 的內容會被它蓋住，所以 `body` 寫了 `padding-bottom: 56px` 替分頁列留出位置。底部有圓角或系統橫條的手機還要再多留一段，那是後面「安全區域、方向與動態視窗高度」那一課的內容。按 768px 可以看到，分頁列在寬螢幕上顯得太空：真正的專案會用一條媒體查詢，把同一個 `<nav>` 改放到頁面的上方或側邊，HTML 不用動。' },
        { type: 'callout', tone: 'warning', title: '分頁列不是 ARIA 的頁籤', text: '看到「分頁」兩個字，很容易想替它加上 `role="tablist"` 與 `role="tab"`。那一組角色是給「在同一頁裡切換幾塊面板」的元件用的：使用者會預期用方向鍵在頁籤之間移動，每個頁籤對應一塊 `role="tabpanel"` 的面板，選中的那個用 `aria-selected` 標示。分頁列的每一項是前往另一個頁面的連結，按下去會換網址：它是導覽，正確的寫法就是 `<nav>` 裡的 `<a>`，目前的頁面用 `aria-current="page"`。寫上 `role="tab"`，反而把「這是連結」的資訊蓋掉，還承諾了你沒有實作的鍵盤操作。' },
        { type: 'callout', tone: 'tip', title: '動手試：拿掉平分，搬動目前頁面', text: '按「動手改這個範例」，把 `#tabs a` 規則裡的 `flex: 1;` 刪掉再執行：四個項目各自只有內容那麼寬，全部擠在左邊。把它加回去，再到 index.html 把 `aria-current="page"` 從「訂單」搬到「菜單」：不必改任何 CSS，亮起來的項目就跟著換了。' },
      ],
    },
    {
      id: 'mob02-drawer-section', title: '抽屜：放得下很多，但要多按一下',
      blocks: [
        { type: 'p', text: '目的地超過五個，或有些很少用（設定、客服、付款方式），分頁列放不下，也不值得放。抽屜把它們收在畫面外：平常只看得到一顆選單按鈕，按了之後一塊面板從側邊蓋上來，裡面由上往下列出所有項目，再多也可以在抽屜裡捲動。代價有兩個。看不到的東西不容易被想起來：打開之前，使用者不知道裡面有什麼。每去一個地方都要按兩下。所以抽屜適合次要的目的地，不適合天天要用的那幾個。' },
        { type: 'p', text: '那顆選單按鈕你已經做過：「響應式導覽與表格」裡收合的導覽，用的就是一顆有 `aria-expanded` 與 `aria-controls` 的原生 `<button>`，清單用 `hidden` 收合，按 Escape 關閉，焦點回到按鈕。那一課的清單是在原地展開的，把下面的內容往下推。抽屜的不同在於它蓋在頁面的上面，因此多出四件事：' },
        { type: 'list', ordered: true, items: [
          '定位：抽屜用 `position: fixed` 貼著視窗的一邊，從上到下，不佔版面的位置。',
          '遮罩（backdrop）：一個同樣固定定位、鋪滿視窗的半透明元素，墊在抽屜的下面、頁面的上面。它讓人看得出後面的頁面暫時不能用，點它就關閉抽屜。',
          '背後的頁面不能操作：抽屜開著時，Tab 不應該走到被蓋住的連結上，螢幕閱讀器也不應該讀到它們。',
          '焦點：開啟時把焦點移進抽屜，關閉時還給選單按鈕。',
        ] },
        { type: 'example', id: 'mob02-drawer' },
        { type: 'p', text: 'index.html 分成三塊：`#page` 包住整個頁面的內容（頁首與 `<main>`），接著是遮罩 `#backdrop`，最後是抽屜 `<nav id="drawer">`；遮罩與抽屜一開始都有 `hidden`。抽屜裡的第一個元素是「關閉選單」按鈕：畫面上一定要有一個看得到、按得到的關閉方式，不能只靠 Escape 或點遮罩。style.css 沒有寫 `z-index`：遮罩與抽屜都是固定定位，會畫在沒有定位的頁面內容上面；兩者之間，寫在後面的抽屜蓋住遮罩。它也沒有替這兩個元素設定 `display`，`hidden` 才收得起來（樣式表裡的 `display` 會蓋過 `hidden`，那一課提醒過）。' },
        { type: 'p', text: '第三件事靠的是 `inert` 屬性。元素加上 `inert` 之後，它和裡面所有的內容都不能被點擊、不能取得焦點，也從無障礙樹消失；外觀完全不變，所以才需要遮罩讓人看得出來。`inert` 要加在「抽屜以外的內容」上，HTML 才會把頁面包成 `#page`，讓它和抽屜是兄弟。script.js 的 `setOpen(open)` 把所有的事放在同一個函式裡：切換抽屜與遮罩的 `hidden`、設定 `page.inert`、更新 `aria-expanded`，最後搬動焦點。' },
        { type: 'p', text: '在預覽裡點「選單」：抽屜蓋住左邊的 260px，右邊剩下的是遮罩，焦點在「關閉選單」上。按 Tab 走過抽屜裡的連結，它不會停在後面的「購物車」上。然後按 Escape，或點右邊的遮罩，或按「關閉選單」：三條路都呼叫 `setOpen(false)`，抽屜收起，焦點回到「選單」按鈕。Escape 的監聽器登記在 `document` 上：不管焦點在抽屜裡的哪個元素，`keydown` 冒泡上來都接得到。' },
        { type: 'callout', tone: 'warning', title: '先讓目的地可以聚焦，再搬焦點', text: '`inert` 裡的元素不能取得焦點：對它呼叫 `focus()` 不會有任何效果，也不會報錯。關閉抽屜時如果先寫 `button.focus()`、後寫 `page.inert = false`，焦點就還不回去：抽屜收起來了，畫面上卻沒有任何焦點外框，只用鍵盤的人不知道自己在哪裡。開啟時也一樣，要先拿掉抽屜的 `hidden`，才能把焦點移進去。另一個同類的錯誤是把 `inert` 加在 `<body>` 上：抽屜也在 `<body>` 裡，會跟著一起不能操作。' },
        { type: 'callout', tone: 'tip', title: '動手試：拿掉 inert', text: '按「動手改這個範例」，把 `setOpen` 裡的 `page.inert = open;` 那一行刪掉再執行。點「選單」開啟抽屜，焦點在「關閉選單」上；這時按 Shift+Tab 往回走：焦點依序停在遮罩後面的「購物車」「小島外送」與「選單」上。畫面上它們被遮住了，鍵盤卻照樣操作得到。' },
        { type: 'p', text: '這四件事每一件都要自己寫、自己測。對於「蓋住頁面、要使用者先處理它」的面板，HTML 有一個現成的元素把這些事包起來：下一節用它來做底部面板，抽屜同樣可以用它來做。' },
      ],
    },
    {
      id: 'mob02-sheet-section', title: '底部面板：動作從拇指旁邊升起',
      blocks: [
        { type: 'p', text: '訂單列表裡的每一筆訂單都有幾個動作：再訂一次、查看明細、刪除紀錄。把三顆按鈕塞進每一列太擠，為了選一個動作換到另一個頁面又太重。底部面板是手機上常見的答案：按下這一筆的「更多動作」，一塊面板從底部升起，列出和這一筆有關的選項；選一個或取消，面板收起來，人還在原來的畫面。它放的是動作與細節，和前兩種模式放的目的地不同；選項出現在畫面的底部，正好在拇指旁邊。' },
        { type: 'p', text: '這種「先處理我，才能回去操作頁面」的面板，稱為強制回應（modal）。它需要的正是上一節那四件事。原生的 `<dialog>` 元素用 `showModal()` 方法開啟時，瀏覽器全部代勞：' },
        { type: 'list', items: [
          '對話框畫在所有內容的最上層（top layer），不必管 `z-index`。',
          '自動產生遮罩，它的樣式用 `::backdrop` 虛擬元素設定。',
          '頁面其他部分自動變成不能操作，效果和 `inert` 一樣，不必自己包一個 `#page`。',
          '焦點自動移進對話框：移到裡面第一個可以聚焦的元素，或你用 `autofocus` 屬性指定的那一個。',
          '按 Escape 會關閉對話框。',
          '用 `close()` 方法或 Escape 關閉之後，焦點自動回到開啟之前有焦點的元素。',
        ] },
        { type: 'example', id: 'mob02-sheet' },
        { type: 'p', text: 'index.html 裡，面板是 `<dialog id="sheet" aria-labelledby="sheet-title">`。`<dialog>` 的角色就是 dialog，`aria-labelledby` 指向裡面的標題，所以它的無障礙名稱是「訂單：海鹽雞腿便當」。沒有 `open` 屬性的 `<dialog>` 不會顯示；`showModal()` 替它加上 `open`，關閉時再拿掉。面板裡的四顆按鈕放在一個 `<form method="dialog">` 裡。這種表單不會把資料送到任何地方：按下裡面的送出按鈕（表單裡的 `<button>` 預設就是送出按鈕），瀏覽器直接關閉它所在的對話框，並把那顆按鈕的 `value` 記在對話框的 `returnValue` 屬性上，一行指令稿都不用寫。三個動作的 `value` 就是動作的名稱，「取消」的 `value` 是空字串。' },
        { type: 'p', text: '瀏覽器預設把強制回應的對話框放在視窗的正中央，寬度跟著內容。style.css 用幾行把它改成底部面板。`width: 100%` 與 `max-width: 100%` 讓它和視窗一樣寬：預設的 `max-width` 會在兩側留邊，所以要一起改。`margin: auto 0 0` 把預設四邊都是 `auto` 的外距改成只剩上方是 `auto`：多出來的空間全部被推到上面，對話框就貼到底部。`border-radius` 只把上面兩個角變圓，`box-sizing: border-box` 讓 `width: 100%` 把內距算在裡面。按預覽上方的寬度按鈕再開一次面板，它都貼著底部、和視窗一樣寬。' },
        { type: 'p', text: '關閉交給表單之後，script.js 只剩三件事。「更多動作」的監聽器先把 `sheet.returnValue` 設成空字串，再呼叫 `sheet.showModal()`：`returnValue` 會一直留著上一次的值，不清掉的話，這一次什麼都沒選就關閉，讀到的還是上一次的動作。第二個監聽器處理點在面板外面的遮罩：這時點擊事件的 `target` 是 `<dialog>` 元素自己，所以 `event.target === sheet` 時呼叫 `sheet.close()`。為了讓這個判斷只對遮罩成立，`<dialog>` 自己的 `padding` 是 0，內距改寫在裡面的表單 `#sheet-body` 上：點在面板裡的任何地方，`target` 都是表單或它裡面的元素。第三個監聽器聽的是 `close` 事件：不管面板是被按鈕、Escape 還是遮罩關掉的，關閉之後瀏覽器都會送出它。在這裡讀 `sheet.returnValue`：不是空字串，就是使用者選的動作，把它寫進 `#status`。關閉之後要做的事寫在 `close` 事件裡，才不會漏掉任何一條路。' },
        { type: 'p', text: '操作一次。點「更多動作」：面板從底部出現，後面的頁面變暗，焦點在第一個選項「再訂一次」上。按 Tab 走過面板裡的按鈕，它不會停在後面的「更多動作」上。按 Escape（或點遮罩、按「取消」）：面板關閉，焦點回到「更多動作」，頁面上沒有新的訊息。再開一次，點「刪除紀錄」：面板同樣關閉，頁面上出現「已選擇：刪除紀錄」。不用表單也做得到同樣的事：替按鈕登記點擊的監聽器，自己呼叫 `sheet.close()`。`close()` 可以帶一個字串，它同樣會成為 `returnValue`；不帶的話，`returnValue` 維持原來的值。' },
        { type: 'callout', tone: 'warning', title: '不要替關著的對話框設定 display', text: '想把面板裡的按鈕排成一列，很容易寫出 `#sheet { display: flex; }`。沒有 `open` 的對話框之所以不顯示，靠的是瀏覽器內建的 `display: none`；你的樣式表一替它寫 `display`，就把內建的那一條蓋掉了：面板從頁面一載入就攤在那裡，而且它不是用 `showModal()` 開的，沒有遮罩，頁面其他部分照樣可以操作。要排版，就排裡面的容器（例如 `#sheet-body`），或把選擇器寫成 `#sheet[open]`。這和 `hidden` 屬性被 `display` 蓋過是同一個陷阱。' },
      ],
    },
    {
      id: 'mob02-modal-section', title: '強制回應，還是陪著頁面',
      blocks: [
        { type: 'p', text: '不是每一塊底部面板都應該擋住頁面。購物車的摘要、正在播放的歌曲、地圖上被選取的地點：這些面板是陪著頁面一起用的，使用者要能一邊看面板，一邊繼續操作後面的頁面。這是非強制回應（non-modal）的面板。`<dialog>` 兩種都能做，差別只在用哪一個方法開啟。' },
        { type: 'example', id: 'mob02-two-ways' },
        { type: 'p', text: '範例裡只有一個 `<dialog id="cart">`，兩顆按鈕分別用 `show()` 與 `showModal()` 開啟它。先按「用 show() 開啟」：面板出現在底部，沒有遮罩；按上面的「加入購物車」，面板裡的件數跟著增加，頁面完全沒有被擋住。按「關閉」，再按「用 showModal() 開啟」：頁面變暗，「加入購物車」按不到了，要先關閉面板。CSS 的 `:modal` 虛擬類別只選得到以強制回應方式開啟的對話框，範例下方列出的事實就是用它來分辨兩種狀態。' },
        { type: 'table', head: ['比較', '用 show() 開啟：非強制回應', '用 showModal() 開啟：強制回應'], rows: [
          ['頁面其他部分', '照常可以操作', '不能操作，螢幕閱讀器也讀不到'],
          ['遮罩', '沒有', '有，用 `::backdrop` 設定樣式'],
          ['畫在哪裡', '和一般元素一樣，依 CSS 的定位與堆疊順序', '所有內容的最上層'],
          ['按 Escape', '瀏覽器不會替你關閉', '關閉對話框'],
          ['預設的位置', '`position: absolute`，要自己定位', '`position: fixed`，在視窗的中央'],
          ['適合', '陪著頁面的資訊：購物車摘要、播放列', '要先做決定的事：選一個動作、確認刪除'],
        ] },
        { type: 'p', text: '因為兩種開法預設的位置不同，這個範例自己寫了 `position: fixed` 與 `inset: auto 0 0 0`（上方不指定，其餘三邊貼齊），兩種開法才都貼在底部。非強制回應的面板不擋住操作，卻會蓋住頁面底部的內容：和分頁列一樣要替它留出位置，而且面板要小，不能把使用者正要用的東西蓋住。另外，已經開著的對話框不能直接換另一種方式再開一次（瀏覽器會丟出錯誤），所以範例的 `reopen` 先看 `cart.open`，開著就先關掉。' },
        { type: 'p', text: '怎麼選：只有「使用者不回應，就不該繼續」的事才用強制回應。強制回應會打斷人，用多了很煩；用了，就一定要有明確的離開方式：一顆看得到的「取消」或「關閉」按鈕，加上 Escape 與點遮罩。' },
        { type: 'callout', tone: 'note', title: '這一課的檢查怎麼關閉面板', text: '檢查步驟裡的「按下 Escape」是由指令稿送出 `keydown` 與 `keyup` 事件：頁面自己登記的監聽器收得到，所以手寫的抽屜是用它自己的監聽器來檢查 Escape 的。瀏覽器內建的「按 Escape 關閉強制回應的對話框」只對真正的按鍵有反應，指令稿送出的事件觸發不了它；因此這一課凡是用 `<dialog>` 做的面板，檢查都是按面板裡的按鈕來關閉。在真正的瀏覽器裡，Escape 會自己關閉強制回應的對話框，不必替它寫監聽器：請你在預覽裡按一次確認。' },
      ],
    },
    {
      id: 'mob02-choose-section', title: '模式選擇：是目的地還是動作，有幾個，多常用',
      blocks: [
        { type: 'p', text: '三種模式不是三選一，而是各管一種內容。做模式選擇時，對每一樣要放進介面的東西問三個問題：它是目的地還是動作？同類的有幾個？多常用？' },
        { type: 'table', head: ['內容', '建議的模式', '理由'], rows: [
          ['三到五個最上層的目的地，幾乎每次都會用到', '分頁列', '一直看得到，在拇指旁邊，一下就到'],
          ['最上層的目的地超過五個', '最常用的四個留在分頁列，其餘收進「更多」', '每個項目要夠寬，文字才放得下，手指才按得準'],
          ['很少用的目的地：設定、客服、條款', '抽屜，或「更多」裡的清單', '不值得長期佔用畫面，多按一下可以接受'],
          ['針對目前這一筆資料的幾個動作', '強制回應的底部面板', '選項出現在拇指旁邊，選完就回到原來的畫面'],
          ['陪著頁面的摘要或狀態', '非強制回應的底部面板', '不打斷操作；要替它留出位置'],
        ] },
        { type: 'p', text: '「五個」這個上限算得出來。視窗寬 360px 時，五個項目各 72px，一個圖示加上兩三個字還放得下；七個項目各只剩大約 51px，文字不是縮小就是被截掉，手指也容易按到隔壁。目的地變多的時候，該做的是排出使用頻率，而不是把字縮小。' },
        { type: 'p', text: '模式可以組合，常見的有兩種。第一種是分頁列加底部面板：分頁列的最後一個項目是「更多」，按下去升起一塊面板，列出其餘的目的地。「更多」是一顆按鈕（它開啟面板，不是前往另一頁），其餘幾個仍然是連結。這樣連次要功能的入口都在拇指旁邊，比放在上方角落的選單按鈕好按。第二種是分頁列加抽屜：主要的目的地在底部，設定與帳戶這類項目收在抽屜裡。' },
        { type: 'callout', tone: 'warning', title: '三種常見的用錯', text: '用抽屜藏三個項目：三個連結放得下，藏起來只是讓每一次切換多按一下，而且打開之前沒有人知道裡面有什麼。在分頁列塞七個項目：每個項目窄到文字放不下、手指按不準。把底部面板當成主導覽：主要的目的地每次都要先開面板才看得到，分頁列「一直看得到、一下就到」的好處全部不見；面板是給目前畫面的動作與細節用的。' },
        { type: 'p', text: '選好之後，用可及範圍再檢查一次：最常用的東西是不是在畫面的下半部？分頁列與底部面板天生在底部。抽屜的選單按鈕如果放在上方的角落，就是整個畫面最難按到的位置，所以它只適合收不常用的東西。面板裡的「取消」放在最下面，比放在面板右上角的叉叉好按；刪除這類無法復原的動作，不要放在最順手的位置。' },
        { type: 'p', text: '許多 App 的抽屜可以從畫面的邊緣滑出來，面板可以往下拖著關閉。在網頁上，從畫面邊緣開始的滑動常常已經是系統或瀏覽器自己的手勢（例如回到上一頁），自己再做一個就會互相搶；怎麼避開是下一課「觸控目標與手勢的實作」的內容。不管之後加不加手勢，這一課的按鈕都要留著。最後，每一個做好的元件都用同一份清單驗收：' },
        { type: 'list', items: [
          '只用鍵盤：Tab 到得了每個項目；抽屜或強制回應的面板開著時，Tab 到不了後面的頁面；Escape 關得掉；關閉後焦點回到開啟它的按鈕。',
          '名稱與狀態：分頁列是有名稱的 `<nav>`，目前的頁面有 `aria-current="page"`；選單按鈕的 `aria-expanded` 和畫面一致；面板有無障礙名稱。',
          '在 360px 寬的視窗：分頁列每個項目的文字完整，頁面最後的內容沒有被分頁列或面板蓋住。',
          '每一塊蓋住頁面的面板都有一顆看得到的關閉按鈕。',
        ] },
        { type: 'p', text: '想實際比較三種模式操作起來的差別，可以到互動實驗島的 Mobile Navigation Simulator 切換著試。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob02-q1', prompt: '「小島圖書館」的手機版有四個最上層的頁面：首頁、找書、我的借閱、帳戶。讀者幾乎每次來都會在它們之間切換。哪一種模式最合適？',
      options: [
        '抽屜：四個項目收在選單按鈕後面，畫面最乾淨',
        '底部面板：按一顆「前往」按鈕，升起面板列出四個頁面',
        '分頁列：四個連結固定在畫面的底部',
        '把四個連結縮小，排在頁首的右上角',
      ],
      answer: 2,
      explanation: '少數幾個、常用、會來回切換的最上層目的地，正是分頁列的用途：一直看得到，在拇指旁邊，一下就到。收進抽屜，每次切換都要多按一下，而且看不到目前有哪些地方可去。底部面板是給目前畫面的動作用的，拿來當主導覽，每次都得先開面板。頁首的右上角是單手最難按到的位置，縮小的連結又更難按準。',
    },
    {
      id: 'mob02-q2', prompt: '分頁列的四個項目各自前往不同的頁面。下面哪一種標記是對的？',
      options: [
        '`<nav>` 裡放四個 `<a>`，目前頁面的那個連結加上 `aria-current="page"`',
        '容器加 `role="tablist"`，每個連結加 `role="tab"`，目前的加 `aria-selected="true"`',
        '四個 `<button>`，點擊時由指令稿換頁，目前的加 `aria-pressed="true"`',
        '四個 `<div>` 加上點擊的監聽器，目前的加一個 `current` 類別',
      ],
      answer: 0,
      explanation: '前往另一個頁面的是連結，一組導覽連結放在 `<nav>` 裡，目前所在的頁面用 `aria-current="page"` 標示。`tablist` 與 `tab` 是給同一頁裡切換面板的頁籤元件用的，會讓使用者預期方向鍵操作與對應的面板，也蓋掉了「這是連結」的資訊。`<button>` 的工作是在頁面上做一件事，不是前往另一頁，`aria-pressed` 說的是開關的狀態。`<div>` 沒有角色、不能聚焦，類別也只是外觀，螢幕閱讀器讀不到。',
    },
    {
      id: 'mob02-q3', prompt: '抽屜開著時，包住頁面內容的 `page` 是 `inert`，選單按鈕 `button` 在 `page` 裡面。用下面的函式關閉抽屜，結果是什麼？',
      code: { language: 'JavaScript', text: 'function closeDrawer() {\n  button.focus();\n  drawer.hidden = true;\n  backdrop.hidden = true;\n  page.inert = false;\n}' },
      options: [
        '焦點回到選單按鈕：`focus()` 會等到 `inert` 拿掉之後才生效',
        '焦點回到選單按鈕：`inert` 只擋滑鼠與觸控，不影響焦點',
        '抽屜關不起來：瀏覽器在第一行丟出錯誤，後面三行不會執行',
        '抽屜關閉了，但焦點沒有回到選單按鈕：對 `inert` 裡的元素呼叫 `focus()` 沒有效果',
      ],
      answer: 3,
      explanation: '`inert` 裡的元素不能取得焦點。呼叫 `button.focus()` 的當下，`page` 還是 `inert`，這一行什麼都沒做；它不會報錯，也不會等到之後才補做，後面三行照常執行。結果抽屜收起來了，焦點卻沒有回到按鈕。`inert` 擋掉的包括點擊、焦點與螢幕閱讀器，不是只有滑鼠與觸控。修法是調換順序：先 `page.inert = false`，再 `button.focus()`。',
    },
    {
      id: 'mob02-q4', prompt: '同一個 `<dialog>`，用 `show()` 與 `showModal()` 開啟有什麼差別？',
      options: [
        '沒有差別：`show()` 只是 `showModal()` 的簡寫',
        '`showModal()` 開啟的對話框有 `::backdrop` 遮罩，頁面其他部分不能操作，按 Escape 會關閉；`show()` 開啟的沒有這些',
        '`show()` 會把對話框畫在最上層並擋住頁面，`showModal()` 只是讓它顯示出來',
        '用 `show()` 開啟的對話框可以用 `close()` 關閉，用 `showModal()` 開啟的不行',
      ],
      answer: 1,
      explanation: '`showModal()` 以強制回應的方式開啟：對話框進到最上層，有遮罩，頁面其他部分不能操作，焦點移進去，按 Escape 會關閉。`show()` 是非強制回應的：沒有遮罩，頁面照常可以操作，瀏覽器也不會因為 Escape 替你關閉它。第三個選項把兩者說反了。兩種方式開啟的對話框都用 `close()` 關閉。',
    },
    {
      id: 'mob02-q5', prompt: '小島外送的分頁列有七個項目，視窗寬 360px 時每個只有大約 51px 寬。使用紀錄顯示其中四個幾乎每次都用，另外三個很少用。哪一種修正最合適？',
      options: [
        '四個常用的留在分頁列，再加一個「更多」按鈕，把另外三個放進它開啟的面板或抽屜',
        '把文字拿掉，只留圖示，七個就放得下了',
        '把很少用的三個刪掉，分頁列剩下四個',
        '讓分頁列可以左右捲動，七個都留著',
      ],
      answer: 0,
      explanation: '依使用頻率分層：常用的留在一直看得到、一下就到的分頁列，少用的收到多按一下的地方，分頁列變成五個各 72px 的項目。只留圖示，使用者得猜每個圖示的意思。少用不等於沒用，刪掉之後那三個功能就沒有入口了。可以捲動的分頁列把一部分項目藏到畫面外，失去「一直看得到」這個最主要的好處，使用者也不知道右邊還有東西。',
    },
    {
      id: 'mob02-q6', prompt: 'HTML 裡的面板是 `<dialog id="sheet">`，沒有 `open` 屬性，樣式表有下面這條規則。頁面載入之後會怎樣？',
      code: { language: 'CSS', text: '#sheet {\n  display: flex;\n  flex-direction: column;\n}' },
      options: [
        '面板不顯示，要等指令稿呼叫 `showModal()` 才出現',
        '面板不顯示，而且之後呼叫 `showModal()` 也打不開',
        '面板顯示在視窗的正中央，並且有遮罩擋住頁面',
        '面板一載入就顯示在頁面上，沒有遮罩，頁面其他部分照樣可以操作',
      ],
      answer: 3,
      explanation: '沒有 `open` 的對話框不顯示，靠的是瀏覽器內建樣式裡的 `display: none`；樣式表裡的 `display: flex` 蓋過了它，所以面板從一開始就畫在頁面上。它沒有經過 `showModal()`，不在最上層，沒有遮罩，也不會讓頁面其他部分不能操作。要排版就排裡面的容器，或把選擇器寫成 `#sheet[open]`。這和 `hidden` 屬性被樣式表的 `display` 蓋過是同一個陷阱。',
    },
    {
      id: 'mob02-q7', prompt: '訂單列表的每一筆訂單都有三個動作：再訂一次、查看明細、刪除紀錄。要讓手機上的使用者對其中一筆選一個動作，哪一種做法最合適？',
      options: [
        '在分頁列加上三個項目：再訂一次、查看明細、刪除紀錄',
        '每一筆放一顆「更多動作」按鈕，開啟強制回應的底部面板，列出三個動作與「取消」',
        '把三個動作收進側邊的抽屜，和設定、客服排在一起',
        '滑鼠移到某一筆上面時，才在那一列顯示三顆按鈕',
      ],
      answer: 1,
      explanation: '這三個是針對某一筆資料的動作，不是目的地：底部面板在需要時從拇指旁邊升起，選完或取消就回到原來的列表；使用者要先做選擇才繼續，所以用強制回應，並附上「取消」。分頁列放的是全站的目的地，而且它不知道動作是對哪一筆做的。抽屜同樣是全站的導覽，和眼前這一筆無關。觸控螢幕沒有「滑鼠移到上面」這件事，那三顆按鈕在手機上永遠不會出現。',
    },
    {
      id: 'mob02-q8', prompt: '單手直立握著一支長手機。關於三種模式的可及範圍，哪一個敘述正確？',
      options: [
        '抽屜最容易到達，因為它的選單按鈕通常在畫面上方的角落',
        '三種模式的可及範圍相同，選哪一種只是外觀上的偏好',
        '分頁列與底部面板都在畫面的底部，拇指容易按到；放在上方角落的選單按鈕最難按到',
        '底部面板最難到達，因為它會蓋住一部分頁面',
      ],
      answer: 2,
      explanation: '拇指最容易碰到的是畫面的下半部，最難碰到的是上方的兩個角落。分頁列固定在底部，底部面板從底部升起，選項都在拇指旁邊；選單按鈕放在上方的角落時，正好落在最難按到的位置，這也是抽屜只適合收不常用項目的原因之一。可及範圍是選擇模式的依據，不是外觀的偏好。面板蓋住頁面和它好不好按沒有關係。',
    },
  ],
  webCode: {
    examples: [tabBar, drawer, sheet, twoWays],
    exercises: [exTabBar, exDrawer, exSheet, exMore],
  },
};
