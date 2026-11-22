import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD11 responsive navigation and tables (RWD-3). Two components that break on a narrow screen and the patterns for
 * each, chosen by the content: a navigation that wraps, scrolls sideways or collapses behind a menu button (the
 * disclosure button of WEB13: aria-expanded, hidden, Escape, focus back), and a table that scrolls inside a named,
 * focusable wrapper, drops low-priority columns or reflows into cards labelled from data-label. The one page with
 * JavaScript is the collapsing menu; the point that is new here is the cascade across the breakpoint (the browser's
 * rule for hidden < the author's rule in the media query < an inline style written by a script). Every width claim is
 * measured in Chromium at 360px and after a resize; boxes that are measured have explicit pixel sizes. What the checks
 * cannot see is said in the text: whether the page itself scrolls sideways (pinned through the wrapper's width and
 * overflow-x), a scrollbar's look, and what a screen reader makes of a table whose display was changed (stated as a
 * risk that depends on the browser). The computed `content` of ::before is compared in both forms browsers report
 * (the resolved string, or attr(data-label) as written). Off-canvas drawers and focus traps are named, not taught.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const LIBRARY_LINKS = String.raw`  <a href="/find">找書</a>
  <a href="/hours">開放時間</a>
  <a href="/new">新書</a>
  <a href="/events">活動</a>
  <a href="/card">借書證</a>
  <a href="/about">關於本館</a>`;

const twoWays: WebExample = {
  id: 'rwd11-nav-two-ways', title: '同樣六個連結：放不下就換行，或維持一列左右捲動',
  description: '島嶼圖書館的主導覽有六個連結，每個寬 96px，寫了 `flex: none` 所以不會被壓縮。A（`#wrap`）多寫 `flex-wrap: wrap`，B（`#strip`）多寫 `overflow-x: auto`，其他樣式完全相同。',
  viewport: { width: 360, height: 640 },
  widths: [360, 700],
  files: {
    html: String.raw`<p>A：放不下就換行</p>
<nav id="wrap" aria-label="主選單（換行的版本）">
` + LIBRARY_LINKS + String.raw`
</nav>
<p>B：維持一列，左右捲動</p>
<nav id="strip" aria-label="主選單（橫向捲動的版本）">
` + LIBRARY_LINKS + String.raw`
</nav>`,
    css: String.raw`body { margin: 0; }
p { margin: 12px 8px 4px; }
nav {
  display: flex;
  gap: 8px;
  padding: 8px;
  background-color: #e3f2fd;
}
nav a {
  flex: none;
  width: 96px;
  height: 40px;
  line-height: 40px;
  text-align: center;
  background-color: #ffffff;
}

/* A：放不下就換行 */
#wrap { flex-wrap: wrap; }

/* B：維持一列，在自己的框裡左右捲動 */
#strip { overflow-x: auto; }`,
  },
  observe: [
    { check: 'box', selector: '#wrap a:nth-child(4)', measure: 'top', value: 56, from: '#wrap', label: '視窗寬 360px：A 的一列只放得下三個連結，第四個換到第二列（上緣在 8 + 40 + 8 = 56px）' },
    { check: 'box', selector: '#strip', measure: 'width', value: 360, label: 'B 的外框 `#strip` 和視窗一樣寬（360px），沒有把頁面撐寬' },
    { check: 'box', selector: '#strip a:nth-child(6)', measure: 'right', value: 624, from: '#strip', label: 'B 的六個連結仍然排成一列：第六個的右緣在 624px，超出外框的部分要在 `#strip` 裡面捲動才看得到' },
    { check: 'style', selector: '#strip', property: 'overflow-x', value: 'auto', label: '`#strip` 的 `overflow-x` 是 `auto`：內容超出時，由它自己提供捲動' },
    { do: 'resize', width: 700 },
    { check: 'box', selector: '#wrap a:nth-child(6)', measure: 'top', value: 8, from: '#wrap', label: '視窗寬 700px：六個連結一列放得下，A 的第六個連結回到第一列' },
  ],
};

const MENU_JS = String.raw`const nav = document.querySelector('#main-nav');
const button = document.querySelector('#menu-button');
const menu = document.querySelector('#menu');

function setOpen(open) {
  menu.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
}

button.addEventListener('click', () => {
  setOpen(menu.hidden); // 現在是收合的，就展開；反之收合
});

nav.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menu.hidden) {
    setOpen(false);
    button.focus(); // 把焦點還給選單按鈕
  }
});`;

const menu: WebExample = {
  id: 'rwd11-menu', title: '會收合的主導覽：窄版是選單按鈕，寬版一直顯示',
  description: '島嶼圖書館的頁首。窄版只看得到「選單」按鈕，清單 `#menu` 用 `hidden` 收合，由 script.js 開合；樣式表最下面的媒體查詢在視窗寬 700px 以上把按鈕藏起來，並讓清單排成一列。',
  viewport: { width: 360, height: 640 },
  widths: [360, 700, 1000],
  files: {
    html: String.raw`<header id="top">
  <a id="logo" href="/">島嶼圖書館</a>
  <nav id="main-nav" aria-label="主選單">
    <button type="button" id="menu-button" aria-expanded="false" aria-controls="menu">選單</button>
    <ul id="menu" hidden>
      <li><a href="/find">找書</a></li>
      <li><a href="/hours">開放時間</a></li>
      <li><a href="/new">新書</a></li>
      <li><a href="/events">活動</a></li>
      <li><a href="/card">借書證</a></li>
    </ul>
  </nav>
</header>
<main>
  <h1>本週新書</h1>
  <p>《潮間帶的一天》已經上架。</p>
</main>`,
    css: String.raw`body { margin: 0; }
#top { padding: 12px; background-color: #e3f2fd; }
#logo { font-weight: bold; }
#main-nav { margin-top: 8px; }
#menu-button { padding: 6px 16px; font: inherit; }
#menu { margin: 8px 0 0; padding: 0; list-style: none; }
#menu a { display: block; padding: 8px 0; }
main { padding: 0 12px; }

/* 寬版：700px 以上不需要按鈕，清單一直顯示 */
@media (min-width: 700px) {
  #top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  #main-nav { margin-top: 0; }
  #menu-button { display: none; }
  #menu { display: flex; gap: 16px; margin: 0; }
}`,
    js: MENU_JS,
  },
  observe: [
    { check: 'style', selector: '#menu', property: 'display', value: 'none', label: '視窗寬 360px：清單 `#menu` 有 `hidden` 屬性，沒有顯示（`display` 是 `none`）' },
    { do: 'click', selector: '#menu-button' },
    { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'true', label: '點一下「選單」按鈕：清單展開，`aria-expanded` 變成 `true`' },
    { do: 'key', selector: '#menu li:first-child a', key: 'Escape' },
    { check: 'focus', selector: '#menu-button', label: '焦點在第一個連結上時按 Escape：清單收合，焦點回到「選單」按鈕' },
    { do: 'resize', width: 1000 },
    { check: 'style', selector: '#menu-button', property: 'display', value: 'none', label: '視窗寬 1000px：按鈕不顯示（`display` 是 `none`）' },
    { check: 'style', selector: '#menu', property: 'display', value: 'flex', label: '清單身上仍然有 `hidden`，但媒體查詢裡的 `display: flex` 蓋過它：寬版的清單照樣顯示' },
  ],
};

const tableScroll: WebExample = {
  id: 'rwd11-table-scroll', title: '比較表：在有名稱、可以聚焦的外框裡水平捲動',
  description: '三種借書證的比較表 `#plans` 至少要 560px 寬（`min-width`）。表格外面包了一個 `.table-scroll`：它寫了 `overflow-x: auto`，並且有 `tabindex="0"`、`role="region"` 與指向表格標題的 `aria-labelledby`。',
  viewport: { width: 360, height: 640 },
  widths: [360, 800],
  files: {
    html: String.raw`<h1>借書證方案</h1>
<div class="table-scroll" role="region" aria-labelledby="plans-title" tabindex="0">
  <table id="plans">
    <caption id="plans-title">三種借書證的比較</caption>
    <thead>
      <tr><th scope="col">項目</th><th scope="col">一般證</th><th scope="col">家庭證</th><th scope="col">研究證</th></tr>
    </thead>
    <tbody>
      <tr><th scope="row">可借冊數</th><td>5 冊</td><td>15 冊</td><td>30 冊</td></tr>
      <tr><th scope="row">借期</th><td>21 天</td><td>21 天</td><td>42 天</td></tr>
      <tr><th scope="row">可續借</th><td>2 次</td><td>2 次</td><td>3 次</td></tr>
      <tr><th scope="row">預約上限</th><td>3 本</td><td>6 本</td><td>10 本</td></tr>
    </tbody>
  </table>
</div>
<p>辦證請洽一樓服務台。</p>`,
    css: String.raw`body { margin: 0; }
h1 { margin: 12px; font-size: 20px; }
p { margin: 12px; }

/* 外框：表格放不下時，在這裡面左右捲動 */
.table-scroll { overflow-x: auto; }
.table-scroll:focus-visible {
  outline: 3px solid #d35400;
  outline-offset: -3px;
}

#plans {
  width: 100%;
  min-width: 560px;
  border-collapse: collapse;
}
#plans caption {
  padding: 8px 12px;
  text-align: left;
  font-weight: bold;
}
#plans th, #plans td {
  padding: 8px 12px;
  border: 1px solid #b0bec5;
  text-align: left;
}`,
  },
  observe: [
    { check: 'box', selector: '.table-scroll', measure: 'width', value: 360, label: '視窗寬 360px：外框 `.table-scroll` 和視窗一樣寬（360px）' },
    { check: 'box', selector: '#plans', measure: 'width', value: 560, label: '裡面的表格維持 560px：超出的 200px 在外框裡左右捲動，頁面本身沒有變寬' },
    { check: 'name', selector: '.table-scroll', text: '三種借書證的比較', label: '外框的無障礙名稱來自 `aria-labelledby` 指到的表格標題：「三種借書證的比較」' },
    { do: 'tab' },
    { check: 'focus', selector: '.table-scroll', label: '按一次 Tab：焦點停在外框上（`tabindex="0"`），鍵盤才有辦法捲動它' },
    { do: 'resize', width: 800 },
    { check: 'box', selector: '#plans', measure: 'width', value: 800, label: '視窗寬 800px：放得下了，表格填滿外框（800px），不需要捲動' },
  ],
};

const tablePriority: WebExample = {
  id: 'rwd11-table-priority', title: '新書清單：窄版只留下最重要的三欄',
  description: '本月新書的表格 `#books` 有五欄。「分類」與「出版年」是補充的資料，欄位標題與儲存格都加了類別 `extra`；視窗小於 600px 時，一條媒體查詢把它們整欄藏起來。書名是連結，完整的資料在每本書自己的頁面上。',
  viewport: { width: 360, height: 640 },
  widths: [360, 700],
  files: {
    html: String.raw`<table id="books">
  <caption>本月新書</caption>
  <thead>
    <tr><th scope="col">書名</th><th scope="col">作者</th><th scope="col" class="extra">分類</th><th scope="col" class="extra">出版年</th><th scope="col">館藏地</th></tr>
  </thead>
  <tbody>
    <tr><th scope="row"><a href="/books/tide">潮間帶的一天</a></th><td>周海寧</td><td class="extra">自然</td><td class="extra">2025</td><td>二樓</td></tr>
    <tr><th scope="row"><a href="/books/birds">島嶼的候鳥</a></th><td>林礁生</td><td class="extra">自然</td><td class="extra">2024</td><td>二樓</td></tr>
    <tr><th scope="row"><a href="/books/lamp">燈塔的貓</a></th><td>吳小汐</td><td class="extra">繪本</td><td class="extra">2025</td><td>兒童室</td></tr>
  </tbody>
</table>`,
    css: String.raw`body { margin: 0; }
#books { width: 100%; border-collapse: collapse; }
#books caption {
  padding: 8px 12px;
  text-align: left;
  font-weight: bold;
}
#books th, #books td {
  padding: 8px 12px;
  border-bottom: 1px solid #b0bec5;
  text-align: left;
}

/* 窄版：藏起補充的欄位，留下書名、作者與館藏地 */
@media (width < 600px) {
  #books .extra { display: none; }
}`,
  },
  observe: [
    { check: 'style', selector: '#books th.extra', property: 'display', value: 'none', label: '視窗寬 360px：欄位標題「分類」不顯示（`display` 是 `none`）' },
    { check: 'style', selector: '#books td.extra', property: 'display', value: 'none', label: '同一欄的儲存格也一起藏起來：欄位標題與資料要成對處理' },
    { check: 'box', selector: '#books', measure: 'width', value: 360, label: '剩下三欄的表格剛好是視窗的寬度（360px），不需要橫向捲動' },
    { do: 'resize', width: 700 },
    { check: 'style', selector: '#books th.extra', property: 'display', value: 'table-cell', label: '視窗寬 700px：查詢不成立，「分類」回到表格儲存格原本的 `display`（`table-cell`）' },
  ],
};

const tableReflow: WebExample = {
  id: 'rwd11-table-reflow', title: '借閱紀錄：每一列重排成一張卡片',
  description: '「我的借閱」表格 `#loans`：每一列的第一格是 `<th scope="row">`（書名），其餘三格是 `<td>`，各自用 `data-label` 屬性寫著欄位名稱。視窗小於 600px 時，一條媒體查詢把表格重排成卡片，並用 `::before` 把 `data-label` 顯示在值的前面。',
  viewport: { width: 360, height: 640 },
  widths: [360, 700],
  files: {
    html: String.raw`<table id="loans">
  <caption>我的借閱</caption>
  <thead>
    <tr><th scope="col">書名</th><th scope="col">到期日</th><th scope="col">可續借</th><th scope="col">取書館</th></tr>
  </thead>
  <tbody>
    <tr><th scope="row">潮間帶的一天</th><td data-label="到期日">12 月 5 日</td><td data-label="可續借">2 次</td><td data-label="取書館">總館</td></tr>
    <tr><th scope="row">島嶼的候鳥</th><td data-label="到期日">12 月 9 日</td><td data-label="可續借">1 次</td><td data-label="取書館">港口分館</td></tr>
    <tr><th scope="row">燈塔的貓</th><td data-label="到期日">12 月 16 日</td><td data-label="可續借">0 次</td><td data-label="取書館">總館</td></tr>
  </tbody>
</table>`,
    css: String.raw`body { margin: 0; }
#loans { width: 100%; border-collapse: collapse; }
#loans caption {
  padding: 8px 12px;
  text-align: left;
  font-weight: bold;
}
#loans th, #loans td {
  padding: 8px 12px;
  border-bottom: 1px solid #b0bec5;
  text-align: left;
}

/* 窄版：每一列重排成一張卡片 */
@media (width < 600px) {
  #loans thead { display: none; }
  #loans, #loans caption, #loans tbody,
  #loans tr, #loans th, #loans td { display: block; }
  #loans tr { margin: 0 12px 12px; border: 1px solid #90a4ae; }
  #loans td::before {
    content: attr(data-label);
    display: inline-block;
    width: 5em;
    color: #546e7a;
  }
}`,
  },
  observe: [
    { check: 'style', selector: '#loans tbody td', property: 'display', value: 'block', label: '視窗寬 360px：`<td>` 的 `display` 是 `block`，不再照表格的規則排' },
    { check: 'box', selector: '#loans tbody td:nth-of-type(2)', measure: 'left', value: 0, from: '#loans tbody td', label: '同一列的第二個 `<td>` 排在第一個的正下方：兩者的左緣對齊' },
    { check: 'style', selector: '#loans tbody td', property: 'content', pseudo: '::before', value: ['"到期日"', 'attr(data-label)'], label: '第一個 `<td>` 的 `::before` 顯示它自己的 `data-label`：「到期日」' },
    { check: 'style', selector: '#loans thead', property: 'display', value: 'none', label: '欄位標題那一列（`<thead>`）不顯示' },
    { do: 'resize', width: 700 },
    { check: 'style', selector: '#loans tbody td', property: 'display', value: 'table-cell', label: '視窗寬 700px：查詢不成立，`<td>` 回到 `table-cell`，表格是原本的樣子' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const catsCss = (cats: string, extra = '') => String.raw`body { margin: 0; }
` + extra + String.raw`#cats {
  display: flex;
  gap: 8px;
  padding: 8px;
  background-color: #fff3e0;
` + cats + String.raw`}
/* 每個分類寬 88px，不會被壓縮：這一條請保留 */
#cats a {
  flex: none;
  width: 88px;
  height: 40px;
  line-height: 40px;
  text-align: center;
  background-color: #ffffff;
}
main { padding: 0 12px; }
`;

const exStrip: WebExercise = {
  id: 'rwd11-ex-strip', title: '八個分類：維持一列，在自己的框裡捲動',
  statement: 'index.html 不能改。小島商店的分類列 `#cats` 有八個分類連結，每個寬 88px、不會被壓縮；八個連結加上間距與內距共需 776px。視窗寬 360px 時它們衝出 `#cats`，把整個頁面撐出橫向捲軸（把預覽切到 360px 可以看到）。分類是同一層級的一長串項目，設計決定：維持一列，讓 `#cats` 在自己的框裡左右捲動，頁面本身不變寬。請只修改 style.css 裡 `#cats` 的規則：連結的寬度與 `flex: none` 請保留，連結不能換行，也不能被切掉而捲不到。檢查會在 360px 與 1000px 兩種視窗寬度量。',
  hints: [
    '連結已經排成一列，而且不會被壓縮，缺的只是「超出的部分怎麼辦」。這由 `overflow-x` 決定，它要寫在哪一個元素上，那個元素才會自己捲動？',
    '`overflow-x` 的值裡，`hidden` 會把超出的部分切掉，使用者捲不到；能捲動的是 `auto`（需要時才能捲）與 `scroll`。',
    '在 `#cats` 的規則裡加上一行 `overflow-x: auto;`。',
  ],
  explanation: '`#cats` 是區塊層級的 flex 容器，它自己的外框一直是視窗的寬度；衝出去的是裡面不能壓縮的連結。替 `#cats` 寫 `overflow-x: auto` 之後，超出的內容不再算進頁面的寬度，而是留在 `#cats` 裡面捲動：360px 時外框仍然是 360px，第八個連結仍然在離左邊 8 + 7 × 96 = 680px 的地方，往左滑就看得到。1000px 時 776px 的內容放得下，`auto` 不會出現捲軸，所以不需要媒體查詢。連結本身可以聚焦，用 Tab 走到畫面外的分類時，瀏覽器會自動把它捲進來。',
  viewport: { width: 360, height: 640 },
  widths: [360, 1000],
  fixed: { html: String.raw`<nav id="cats" aria-label="商品分類">
  <a href="/tea">茶葉</a>
  <a href="/cookies">餅乾</a>
  <a href="/jam">果醬</a>
  <a href="/nuts">堅果</a>
  <a href="/dried">果乾</a>
  <a href="/gift">禮盒</a>
  <a href="/cups">杯盤</a>
  <a href="/sale">特價</a>
</nav>
<main>
  <h1>小島商店</h1>
  <p>本週主打：海鹽堅果。</p>
</main>` },
  starter: { css: catsCss('') },
  solution: { css: catsCss(String.raw`  overflow-x: auto;
`) },
  steps: [
    { check: 'style', selector: '#cats', property: 'overflow-x', value: ['auto', 'scroll'], label: '視窗寬 360px：`#cats` 自己可以左右捲動（`overflow-x` 是 `auto` 或 `scroll`）' },
    { check: 'box', selector: '#cats', measure: 'width', value: 360, label: '視窗寬 360px：`#cats` 的外框和視窗一樣寬（360px）' },
    { check: 'box', selector: '#cats a:nth-child(8)', measure: 'left', value: 680, from: '#cats', label: '視窗寬 360px：八個分類仍然排成一列、沒有被壓窄，第八個的左緣在離 `#cats` 左邊 680px 的地方' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#cats', measure: 'width', value: 1000, label: '視窗寬 1000px：`#cats` 佔滿視窗（1000px）' },
    { check: 'box', selector: '#cats a:nth-child(8)', measure: 'left', value: 680, from: '#cats', label: '視窗寬 1000px：八個分類一列放得下，第八個的位置不變（680px）' },
  ],
  mistakes: [
    { files: { css: catsCss(String.raw`  overflow-x: hidden;
`) }, why: '寫成 `overflow-x: hidden`。頁面的確不再橫向捲動，但第五個以後的分類直接被切掉：用滑鼠或手指都捲不到它們。`hidden` 是把內容藏起來，`auto` 才是讓這個區域可以捲動。' },
    { files: { css: catsCss(String.raw`  flex-wrap: wrap;
`) }, why: '改成 `flex-wrap: wrap` 讓連結換行。這是另一種做法，頁面也不會橫向捲動，但八個分類在 360px 排成三列，佔掉 152px 的高度，把商品往下推；這一題要的是維持一列的橫向捲動。連結少的時候才適合換行。' },
    { files: { css: catsCss('', String.raw`body { overflow-x: auto; }
`) }, why: '把 `overflow-x: auto` 寫在 `body` 上。`body` 的 `overflow` 會交給視窗處理，結果和沒寫一樣：捲動的仍然是整個頁面，標題與內文跟著一起左右移動。要捲動的是放連結的那個容器 `#cats`。' },
  ],
};

const shopHtml = (links: [string, string][]) => String.raw`<header id="top">
  <a id="logo" href="/">小島商店</a>
  <nav id="shop-nav" aria-label="主選單">
    <button type="button" id="menu-button" aria-expanded="false" aria-controls="menu">選單</button>
    <ul id="menu" hidden>
` + links.map(([href, text]) => `      <li><a href="${href}">${text}</a></li>`).join('\n') + String.raw`
    </ul>
  </nav>
</header>
<main>
  <h1>本週主打</h1>
  <p>海鹽堅果，每包 180 元。</p>
</main>`;

const SHOP_BASE_CSS = String.raw`body { margin: 0; }
/* 基本樣式（窄版）：這幾行請保留 */
#top { padding: 12px; background-color: #fff3e0; }
#logo { font-weight: bold; }
#shop-nav { margin-top: 8px; }
#menu-button { padding: 6px 16px; font: inherit; }
#menu { margin: 8px 0 0; padding: 0; list-style: none; }
#menu a { display: block; padding: 8px 0; }
main { padding: 0 12px; }

/* 寬版（700px 以上）的規則寫在下面 */
`;
const SHOP_WIDE_CSS = String.raw`@media (min-width: 700px) {
  #top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  #shop-nav { margin-top: 0; }
  #menu-button { display: none; }
  #menu { display: flex; gap: 16px; margin: 0; }
}
`;
const SHOP_JS_HEAD = String.raw`const nav = document.querySelector('#shop-nav');
const button = document.querySelector('#menu-button');
const menu = document.querySelector('#menu');
`;
const SHOP_JS_INLINE = SHOP_JS_HEAD + String.raw`
function setOpen(open) {
  menu.style.display = open ? 'block' : 'none';
  button.setAttribute('aria-expanded', String(open));
}

button.addEventListener('click', () => {
  setOpen(button.getAttribute('aria-expanded') === 'false');
});
`;
const SHOP_JS_HIDDEN = SHOP_JS_HEAD + String.raw`
function setOpen(open) {
  menu.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
}

button.addEventListener('click', () => {
  setOpen(menu.hidden);
});
`;
const SHOP_JS_ESCAPE = String.raw`
nav.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menu.hidden) {
    setOpen(false);
    button.focus();
  }
});
`;

const exMenu: WebExercise = {
  id: 'rwd11-ex-menu', title: '收合的選單：窄版能開合，寬版不能被卡住',
  statement: 'index.html 不能改。小島商店的頁首有一顆選單按鈕 `#menu-button`（`aria-expanded="false"`、`aria-controls="menu"`）與清單 `#menu`（一開始有 `hidden`）。請完成兩個檔案。style.css：在基本樣式的後面加上媒體查詢，視窗寬 700px 以上（含 700px）時 `#menu-button` 的 `display` 是 `none`，`#menu` 用 `display: flex` 排成一列；基本樣式請保留。script.js：目前的寫法在窄版可以用滑鼠開合，請把它改到符合這些條件：展開時 `aria-expanded` 是 `"true"`、`#menu` 看得到；收合時 `aria-expanded` 是 `"false"`、`#menu` 的 `display` 是 `none`；焦點在按鈕或清單裡的連結上時按 Escape，清單收合，焦點回到 `#menu-button`；在窄版收合過之後把視窗拉寬，寬版的清單仍然要顯示。檢查從 360px 開始：展開、按 Escape 收合，再把視窗改成 1000px。檢查還會在另一個連結不同的頁面上再執行一次，並縮回 360px 確認選單仍然能開合。',
  hints: [
    '先把媒體查詢寫好，然後在預覽裡照檢查的順序操作一次：360px 展開、收合，再按 1000px。清單沒有出現的話，展開預覽下方的 DOM 樹，看看 `ul#menu` 身上多了什麼。',
    '指令稿用 `menu.style.display` 寫的是行內樣式，它會蓋過樣式表裡所有的規則，包括媒體查詢裡的 `display: flex`。讓指令稿只切換 `hidden`：`menu.hidden = !open;`，點擊時呼叫 `setOpen(menu.hidden)`。`hidden` 的效果來自瀏覽器內建的樣式，你的查詢蓋得過它。',
    'Escape：在 `#shop-nav` 上登記 `keydown`，`event.key === \'Escape\'` 而且清單是展開的（`!menu.hidden`）時，呼叫 `setOpen(false)`，再呼叫 `button.focus()`。媒體查詢是 `@media (min-width: 700px) { #menu-button { display: none; } #menu { display: flex; } }`。',
  ],
  explanation: '清單顯不顯示有三個來源在比：`hidden` 屬性靠的是瀏覽器內建的 `display: none`，最弱；樣式表裡的規則蓋過它；元素的行內樣式又蓋過樣式表。原本的指令稿用 `menu.style.display = \'none\'` 收合，行內樣式一路留到寬版，把查詢裡的 `display: flex` 蓋掉，寬版就沒有導覽了。改成切換 `hidden` 之後，窄版沒有任何規則設定 `#menu` 的 `display`，`hidden` 生效；700px 以上查詢裡的 `#menu { display: flex; }` 蓋過 `hidden`，不論收合狀態是什麼，清單都顯示，而 `#menu-button { display: none; }` 讓用不到的按鈕離開畫面、Tab 順序與無障礙樹。`setOpen` 把 `hidden` 與 `aria-expanded` 綁在一起，Escape 的監聽器登記在 `#shop-nav` 上，靠冒泡接住來自按鈕與連結的按鍵，收合後呼叫 `button.focus()` 把焦點還給按鈕。',
  viewport: { width: 360, height: 640 },
  widths: [360, 700, 1000],
  fixed: { html: shopHtml([['/new', '新品'], ['/sale', '特價'], ['/gift', '禮盒'], ['/stores', '門市']]) },
  starter: { css: SHOP_BASE_CSS, js: SHOP_JS_INLINE },
  solution: { css: SHOP_BASE_CSS + SHOP_WIDE_CSS, js: SHOP_JS_HIDDEN + SHOP_JS_ESCAPE },
  steps: [
    { do: 'click', selector: '#menu-button' },
    { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'true', label: '視窗寬 360px：點一下「選單」按鈕，`aria-expanded` 變成 `true`' },
    { check: 'style', selector: '#menu', property: 'display', value: ['block', 'flex', 'grid'], label: '視窗寬 360px：清單展開了（`#menu` 的 `display` 不是 `none`）' },
    { do: 'key', selector: '#menu li:first-child a', key: 'Escape' },
    { check: 'style', selector: '#menu', property: 'display', value: 'none', label: '焦點在清單的第一個連結上時按 Escape：清單收合（`display` 是 `none`）' },
    { check: 'focus', selector: '#menu-button', label: '按 Escape 之後，焦點回到 `#menu-button`' },
    { do: 'resize', width: 1000 },
    { check: 'style', selector: '#menu-button', property: 'display', value: 'none', label: '視窗寬 1000px：`#menu-button` 不顯示（`display` 是 `none`）' },
    { check: 'style', selector: '#menu', property: 'display', value: ['flex', 'grid'], label: '視窗寬 1000px：剛才在窄版收合過，清單仍然顯示並排成一列（`display` 是 `flex`）' },
  ],
  mistakes: [
    { files: { css: SHOP_BASE_CSS + SHOP_WIDE_CSS, js: SHOP_JS_INLINE + String.raw`
nav.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
    setOpen(false);
    button.focus();
  }
});
` }, why: '媒體查詢與 Escape 都寫了，收合卻仍然用 `menu.style.display = \'none\'`。行內樣式蓋過樣式表裡的規則：在窄版收合過之後拉寬視窗，查詢裡的 `display: flex` 輸給行內的 `display: none`，寬版沒有按鈕，也沒有清單。指令稿只改狀態（`hidden`），顯示交給樣式表。' },
    { files: { css: SHOP_BASE_CSS.replace('#menu { margin: 8px 0 0; padding: 0; list-style: none; }', '#menu { display: flex; flex-direction: column; margin: 8px 0 0; padding: 0; list-style: none; }') + SHOP_WIDE_CSS.replace('#menu { display: flex; gap: 16px; margin: 0; }', '#menu { flex-direction: row; gap: 16px; margin: 0; }'), js: SHOP_JS_HIDDEN + SHOP_JS_ESCAPE }, why: '在基本樣式替 `#menu` 寫了 `display: flex`（想讓窄版也用 flex 直向排列）。樣式表裡的 `display` 會蓋過 `hidden` 屬性：清單從一開始就是展開的，按鈕與 Escape 照常切換 `hidden` 與 `aria-expanded`，畫面卻沒有任何變化。基本樣式不要設定被 `hidden` 收合的元素的 `display`。' },
    { files: { css: SHOP_BASE_CSS + SHOP_WIDE_CSS, js: SHOP_JS_HIDDEN + String.raw`
nav.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setOpen(false);
  }
});
` }, why: 'Escape 收合了清單，卻沒有呼叫 `button.focus()`。原本有焦點的連結被藏起來，焦點沒有回到按鈕：只用鍵盤與使用螢幕閱讀器的人不知道自己在頁面的哪裡。' },
  ],
  variants: [{
    title: '另一個頁面：三個連結，用按鈕收合後拉寬再縮回',
    fixed: { html: shopHtml([['/tea', '茶葉'], ['/cookies', '餅乾'], ['/jam', '果醬']]) },
    steps: [
      { do: 'click', selector: '#menu-button' },
      { do: 'click', selector: '#menu-button' },
      { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'false', label: '用按鈕展開再收合，`aria-expanded` 回到 `false`' },
      { check: 'style', selector: '#menu', property: 'display', value: 'none', label: '清單收合' },
      { do: 'resize', width: 1000 },
      { check: 'style', selector: '#menu', property: 'display', value: ['flex', 'grid'], label: '拉寬到 1000px，清單顯示' },
      { do: 'resize', width: 360 },
      { check: 'style', selector: '#menu', property: 'display', value: 'none', label: '縮回 360px，清單仍然是收合的' },
      { do: 'key', selector: '#menu-button', key: 'Enter' },
      { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'true', label: '在按鈕上按 Enter 展開' },
      { check: 'style', selector: '#menu', property: 'display', value: ['block', 'flex', 'grid'], label: '清單展開' },
      { do: 'key', selector: '#menu-button', key: 'Escape' },
      { check: 'attr', selector: '#menu-button', name: 'aria-expanded', value: 'false', label: '焦點在按鈕上時按 Escape 也會收合' },
      { check: 'focus', selector: '#menu-button', label: '焦點留在按鈕上' },
    ],
  }],
};

const shipHtml = (wrapper: string) => String.raw`<h1>寄送方式</h1>
` + wrapper + String.raw`
  <table id="ship">
    <caption id="ship-title">寄送方式比較</caption>
    <thead>
      <tr><th scope="col">方式</th><th scope="col">運費</th><th scope="col">到貨時間</th><th scope="col">免運門檻</th></tr>
    </thead>
    <tbody>
      <tr><th scope="row">超商取貨</th><td>60 元</td><td>2 到 3 天</td><td>滿 800 元</td></tr>
      <tr><th scope="row">宅配</th><td>100 元</td><td>1 到 2 天</td><td>滿 1500 元</td></tr>
      <tr><th scope="row">離島宅配</th><td>180 元</td><td>3 到 5 天</td><td>不適用</td></tr>
    </tbody>
  </table>
</div>`;
const SHIP_BASE_CSS = String.raw`body { margin: 0; }
h1 { margin: 12px; font-size: 20px; }

/* 表格至少 600px 寬，欄位才不會擠在一起：這幾條請保留 */
#ship {
  width: 100%;
  min-width: 600px;
  border-collapse: collapse;
}
#ship caption {
  padding: 8px 12px;
  text-align: left;
  font-weight: bold;
}
#ship th, #ship td {
  padding: 8px 12px;
  border: 1px solid #b0bec5;
  text-align: left;
}
#ship-wrap:focus-visible {
  outline: 3px solid #d35400;
  outline-offset: -3px;
}

/* 在下面替 #ship-wrap 加上樣式 */
`;
const SHIP_SCROLL_CSS = String.raw`#ship-wrap { overflow-x: auto; }
`;

const exTableScroll: WebExercise = {
  id: 'rwd11-ex-table-scroll', title: '比較表：捲動的是外框，不是頁面',
  statement: '小島商店的寄送方式比較表 `#ship` 至少要 600px 寬才不會擠在一起（`min-width: 600px`，請保留）。在 360px 寬的視窗，它把整個頁面撐出橫向捲軸，標題也跟著被捲走。使用者要橫向比較三種寄送方式，所以表格不重排，改成在自己的外框裡捲動。表格外面已經包了一個 `<div id="ship-wrap">`，請把它做成可以水平捲動、鍵盤也能使用的區域。style.css：讓 `#ship-wrap` 自己可以左右捲動，表格維持 600px 寬。index.html：讓 `#ship-wrap` 可以用 Tab 聚焦，角色是 region，無障礙名稱是表格標題的文字「寄送方式比較」（指向 `<caption>`，或直接把名稱寫在屬性裡都可以）。',
  hints: [
    '分成兩件事做。CSS：超出的內容要留在誰的裡面捲動，`overflow-x` 就寫在誰身上。HTML：一個 `<div>` 預設不能聚焦、沒有角色、也沒有名稱，三樣各由一個屬性補上。',
    '`overflow-x` 寫在 `<table>` 上不會讓它變成可以捲動的區域，要寫在包著它的 `#ship-wrap` 上。能聚焦靠的是 `tabindex="0"`。',
    '樣式表加上 `#ship-wrap { overflow-x: auto; }`；HTML 改成 `<div id="ship-wrap" role="region" aria-labelledby="ship-title" tabindex="0">`。',
  ],
  explanation: '`#ship-wrap` 是一般的區塊，寬度跟著視窗（360px）；裡面的表格因為 `min-width` 維持 600px。替外框寫 `overflow-x: auto`，超出的 240px 就留在外框裡捲動，不再算進頁面的寬度，標題不會跟著移動。滑鼠與觸控可以直接捲動這個區域，鍵盤卻要先把焦點移進去，而表格裡沒有可以聚焦的元素，所以外框加上 `tabindex="0"`；可以聚焦的元素需要角色與名稱，螢幕閱讀器的使用者停在上面時才聽得出這是什麼：`role="region"` 給角色，`aria-labelledby="ship-title"` 借用 `<caption>` 的文字當名稱（把 `<div>` 換成有名稱的 `<section>` 也會得到 region 這個角色）。',
  viewport: { width: 360, height: 640 },
  widths: [360, 800],
  starter: { html: shipHtml('<div id="ship-wrap">'), css: SHIP_BASE_CSS },
  solution: { html: shipHtml('<div id="ship-wrap" role="region" aria-labelledby="ship-title" tabindex="0">'), css: SHIP_BASE_CSS + SHIP_SCROLL_CSS },
  steps: [
    { check: 'style', selector: '#ship-wrap', property: 'overflow-x', value: ['auto', 'scroll'], label: '視窗寬 360px：`#ship-wrap` 自己可以左右捲動（`overflow-x` 是 `auto` 或 `scroll`）' },
    { check: 'box', selector: '#ship-wrap', measure: 'width', value: 360, label: '`#ship-wrap` 的外框和視窗一樣寬（360px）' },
    { check: 'box', selector: '#ship', measure: 'width', value: 600, label: '表格 `#ship` 維持 600px 寬，沒有被擠小' },
    { check: 'role', selector: '#ship-wrap', role: 'region', label: '`#ship-wrap` 的角色是 region' },
    { check: 'name', selector: '#ship-wrap', text: '寄送方式比較', label: '`#ship-wrap` 的無障礙名稱是「寄送方式比較」' },
    { do: 'tab' },
    { check: 'focus', selector: '#ship-wrap', label: '按一次 Tab，焦點停在 `#ship-wrap` 上' },
  ],
  mistakes: [
    { files: { html: shipHtml('<div id="ship-wrap" role="region" aria-labelledby="ship-title" tabindex="0">'), css: SHIP_BASE_CSS + String.raw`#ship { overflow-x: auto; }
` }, why: '把 `overflow-x: auto` 寫在表格 `#ship` 上。表格的寬度由 `min-width` 與內容撐開，`overflow` 寫在它身上不會讓它變成可以捲動的區域：外框沒有擋住它，整個頁面照樣橫向捲動。要寫在包著表格的 `#ship-wrap` 上。' },
    { files: { html: shipHtml('<div id="ship-wrap" tabindex="0">'), css: SHIP_BASE_CSS + SHIP_SCROLL_CSS }, why: '只加了 `tabindex="0"`。鍵盤的焦點停得上去，也能用方向鍵捲動，但這個 `<div>` 沒有角色、沒有名稱：螢幕閱讀器的使用者停在上面時，聽不出這是哪一個區域、為什麼會停在這裡。可以聚焦的元素要有角色與名稱。' },
    { files: { html: shipHtml('<div id="ship-wrap" role="region" aria-labelledby="ship-title">'), css: SHIP_BASE_CSS + SHIP_SCROLL_CSS }, why: '有角色與名稱，卻沒有 `tabindex="0"`。滑鼠與觸控可以捲動，只用鍵盤的人卻沒有辦法把焦點移進這個區域，也就不能用方向鍵捲動。有些瀏覽器會自動讓可以捲動的區域能夠聚焦，但不是每一個都會，所以要自己寫上。' },
  ],
};

const ordersHtml = (caption: string, heads: [string, string, string, string], rows: [string, string, string, string][]) => String.raw`<table id="orders">
  <caption>` + caption + String.raw`</caption>
  <thead>
    <tr>` + heads.map(h => `<th scope="col">${h}</th>`).join('') + String.raw`</tr>
  </thead>
  <tbody>
` + rows.map(([id, ...cells]) => `    <tr><th scope="row">${id}</th>${cells.map((c, i) => `<td data-label="${heads[i + 1]}">${c}</td>`).join('')}</tr>`).join('\n') + String.raw`
  </tbody>
</table>`;

const ORDERS_BASE_CSS = String.raw`body { margin: 0; }
/* 基本樣式（表格）：這幾條請保留 */
#orders { width: 100%; border-collapse: collapse; }
#orders caption {
  padding: 8px 12px;
  text-align: left;
  font-weight: bold;
}
#orders th, #orders td {
  padding: 8px 12px;
  border-bottom: 1px solid #b0bec5;
  text-align: left;
}

/* 窄版（小於 600px）：在下面把每一列重排成一張卡片 */
`;
const reflowCss = (query: string, head: string, label: string) => query + String.raw` {
` + head + String.raw`  #orders, #orders caption, #orders tbody,
  #orders tr, #orders th, #orders td { display: block; }
  #orders tr { margin: 0 12px 12px; border: 1px solid #90a4ae; }
` + label + String.raw`}
`;
const ORDERS_HEAD_RULE = String.raw`  #orders thead { display: none; }
`;
const ORDERS_LABEL_RULE = String.raw`  #orders td::before {
    content: attr(data-label);
    display: inline-block;
    width: 5em;
    color: #546e7a;
  }
`;

const exReflow: WebExercise = {
  id: 'rwd11-ex-reflow', title: '我的訂單：窄版重排成卡片',
  statement: 'index.html 不能改。小島商店的「我的訂單」表格 `#orders` 有四欄：每一列的第一格是 `<th scope="row">`（訂單編號），其餘三格是 `<td>`，各自帶著寫了欄位名稱的 `data-label` 屬性。使用者一次只查一筆訂單，所以窄版把每一列重排成一張卡片。請在 style.css 基本樣式的後面加上規則，讓視窗寬度小於 600px 時：一、`<thead>` 的欄位標題列不佔畫面的空間；二、每個 `<td>` 的 `display` 是 `block`，同一列的 `<td>` 上下疊、左緣對齊；三、每個 `<td>` 用 `::before` 顯示自己的 `data-label`，`content` 只放屬性的值，不要另外加冒號或其他文字。600px 以上（含 600px）維持原本的表格：`<td>` 是 `table-cell`，`::before` 不產生內容。基本樣式請保留。檢查會在 360px 與 600px 量，還會在另一張欄位名稱不同的表格上再執行一次，所以標籤不能寫死在 CSS 裡。',
  hints: [
    '「小於 600px 才套用」的規則全部放進同一條媒體查詢。小於（不含 600px）用範圍語法最直接。先處理排版：哪些元素的 `display` 要改，欄位標題那一列怎麼辦？',
    '在查詢裡把 `#orders`、`caption`、`tbody`、`tr`、`th`、`td` 的 `display` 都改成 `block`，`thead` 改成 `none`。標籤用 `td::before`，它的 `content` 可以用 `attr()` 讀取元素自己的屬性。',
    '`@media (width < 600px) { #orders thead { display: none; } #orders, #orders caption, #orders tbody, #orders tr, #orders th, #orders td { display: block; } #orders td::before { content: attr(data-label); } }`，再替 `tr` 加上邊框與外距，卡片就分得開。',
  ],
  explanation: '`(width < 600px)` 不包含 600px：599px 以下重排，600px 起整段規則像沒有寫一樣，表格元素回到各自預設的 `display`，`::before` 沒有 `content` 也就不產生盒子。只在窄版改 `display`，比先改掉再逐一設回 `table-row`、`table-cell` 安全。查詢裡，`thead` 用 `display: none` 藏起來；其餘的表格元素改成 `block` 之後由上往下疊，每個 `<tr>` 加上邊框與外距就是一張卡片，開頭的 `<th scope="row">` 成了卡片的標題。`td::before { content: attr(data-label); }` 讓每個儲存格讀自己的屬性，一條規則適用所有欄位，換一張表格也不用改 CSS。要記得這個做法的風險：表格元素的 `display` 被改掉之後，一部分瀏覽器不再把它們當成表格告訴輔助科技，上線前要用螢幕閱讀器實測。',
  viewport: { width: 360, height: 640 },
  widths: [360, 599, 600, 800],
  fixed: { html: ordersHtml('我的訂單', ['訂單編號', '訂購日', '金額', '狀態'], [['A1024', '11 月 3 日', '680 元', '已出貨'], ['A1031', '11 月 12 日', '1250 元', '備貨中'], ['A1040', '11 月 20 日', '320 元', '已取消']]) },
  starter: { css: ORDERS_BASE_CSS },
  solution: { css: ORDERS_BASE_CSS + reflowCss('@media (width < 600px)', ORDERS_HEAD_RULE, ORDERS_LABEL_RULE) },
  steps: [
    { check: 'style', selector: '#orders tbody td', property: 'display', value: ['block', 'flex', 'grid'], label: '視窗寬 360px：`<td>` 不再是表格的儲存格，`display` 是 `block`' },
    { check: 'box', selector: '#orders tbody td:nth-of-type(2)', measure: 'left', value: 0, from: '#orders tbody td', label: '視窗寬 360px：同一列的第二個 `<td>` 和第一個的左緣對齊（上下疊，不是左右排）' },
    { check: 'style', selector: '#orders tbody td', property: 'content', pseudo: '::before', value: ['"訂購日"', 'attr(data-label)'], label: '視窗寬 360px：第一個 `<td>` 的 `::before` 顯示它的 `data-label`「訂購日」' },
    { check: 'box', selector: '#orders thead', measure: 'height', value: 0, label: '視窗寬 360px：欄位標題那一列（`<thead>`）不佔畫面的空間' },
    { do: 'resize', width: 600 },
    { check: 'style', selector: '#orders tbody td', property: 'display', value: 'table-cell', label: '視窗寬 600px：回到表格，`<td>` 的 `display` 是 `table-cell`' },
    { check: 'style', selector: '#orders tbody td', property: 'content', pseudo: '::before', value: ['none', 'normal'], label: '視窗寬 600px：`<td>` 的 `::before` 不產生內容' },
  ],
  mistakes: [
    { files: { css: ORDERS_BASE_CSS + reflowCss('@media (max-width: 600px)', ORDERS_HEAD_RULE, ORDERS_LABEL_RULE) }, why: '條件寫成 `(max-width: 600px)`。`max-width` 包含 600px 本身，視窗恰好 600px 寬時仍然是卡片，和題目的「600px 以上維持表格」差了 1px。「小於 600px」要寫成 `(width < 600px)`。' },
    { files: { css: ORDERS_BASE_CSS + reflowCss('@media (width < 600px)', '', ORDERS_LABEL_RULE) }, why: '忘了處理 `<thead>`。儲存格都改成卡片了，欄位標題那一列卻還在，變成疊在最上面的四行字（訂單編號、訂購日、金額、狀態），和下面任何一張卡片都對不起來。標籤已經由 `data-label` 提供，標題列要藏起來。' },
    { files: { css: ORDERS_BASE_CSS + reflowCss('@media (width < 600px)', ORDERS_HEAD_RULE, String.raw`  #orders td::before { display: inline-block; width: 5em; color: #546e7a; }
  #orders td:nth-of-type(1)::before { content: "訂購日"; }
  #orders td:nth-of-type(2)::before { content: "金額"; }
  #orders td:nth-of-type(3)::before { content: "狀態"; }
`) }, why: '把標籤的文字直接寫在 CSS 裡。這張表格看起來是對的，但欄位名稱現在有三份（`<thead>`、`data-label`、CSS）；換一張欄位不同的表格，或 HTML 改了欄位順序，卡片上的標籤就是錯的。用 `attr(data-label)` 讓每個儲存格讀自己的屬性。' },
  ],
  variants: [{
    title: '另一張表格：付款與取貨的欄位',
    fixed: { html: ordersHtml('取貨資訊', ['訂單編號', '付款方式', '取貨門市', '取貨期限'], [['A1024', '貨到付款', '港口門市', '11 月 10 日'], ['A1031', '信用卡', '市場門市', '11 月 19 日']]) },
    steps: [
      { check: 'style', selector: '#orders tbody td', property: 'content', pseudo: '::before', value: ['"付款方式"', 'attr(data-label)'], label: '360px：標籤是這張表格的「付款方式」' },
      { check: 'box', selector: '#orders thead', measure: 'height', value: 0, label: '360px：欄位標題列不佔空間' },
      { do: 'resize', width: 599 },
      { check: 'style', selector: '#orders tbody td', property: 'display', value: ['block', 'flex', 'grid'], label: '599px：仍然是卡片' },
      { do: 'resize', width: 600 },
      { check: 'style', selector: '#orders thead', property: 'display', value: 'table-header-group', label: '600px：欄位標題列回來了' },
      { check: 'style', selector: '#orders tbody td', property: 'display', value: 'table-cell', label: '600px：回到表格' },
    ],
  }],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD11: LessonContent = {
  lessonId: 'RWD11',
  motivation: '桌機上一字排開的主導覽，到了 360px 寬的手機只放得下三個連結；五個欄位的表格，不是把頁面撐出橫向捲軸，就是擠成一行只剩一兩個字。這一課先替導覽排出優先順序，在換行、橫向捲動與收合到選單按鈕之間選一種，並把收合的選單做到鍵盤與螢幕閱讀器都能用；再依資料的特性，替表格選擇水平捲動、隱藏次要欄位或重排成卡片。',
  sections: [
    {
      id: 'rwd11-nav-patterns', title: '窄螢幕上的導覽：先排優先順序，再選做法',
      blocks: [
        { type: 'p', text: '寬螢幕上，導覽通常是頁首裡的一列連結（「Flexbox 基礎：主軸與交錯軸」那一課做過）。連結的數量不會因為螢幕變窄而減少：六個連結在 1000px 寬的視窗綽綽有餘，在 360px 寬的手機上卻放不下。放不下的時候瀏覽器不會替你決定怎麼辦；什麼都不做的結果，是連結衝出視窗，整個頁面可以左右捲動（「viewport 與相對單位」那一課的橫向捲動）。窄螢幕上的導覽有三種常見的做法：' },
        { type: 'table', head: ['做法', '怎麼做', '適合', '代價'], rows: [
          ['留在畫面上，放不下就換行', '容器寫 `flex-wrap: wrap`', '連結少（大約五個以內）、文字短', '連結一多就佔掉好幾列，把內容往下推'],
          ['維持一列，左右捲動', '容器寫 `overflow-x: auto`，項目不壓縮、不換行', '同一層級的一長串項目：分類、標籤、頁籤', '畫面外的項目看不到，需要提示使用者後面還有'],
          ['收合到選單按鈕後面', '一顆 `<button>` 加上幾行 JavaScript（下一節）', '連結多，或頁首還要放標誌、搜尋、購物車', '連結平常看不到，要多按一下；需要指令稿'],
        ] },
        { type: 'p', text: '下面的頁面把同樣六個連結，用前兩種做法各排一次。' },
        { type: 'example', id: 'rwd11-nav-two-ways' },
        { type: 'p', text: '預覽一開始是 360px 寬。兩個 `<nav>` 都是 flex 容器，內距 8px、`gap` 8px；每個連結寬 96px，而且寫了 `flex: none`，不會被壓縮（「Flexbox 進階：伸縮、換行與對齊」那一課）。六個連結加上五個間距共需 6 × 96 + 5 × 8 = 616px，容器的內容區卻只有 360 − 16 = 344px。A 多寫了 `flex-wrap: wrap`：一列放得下三個（3 × 96 + 2 × 8 = 304px），第四個起換到第二列。B 多寫的是 `overflow-x: auto`：連結仍然排成一列，超出的部分留在 `#strip` 裡面，由它自己左右捲動；`#strip` 的外框還是 360px，頁面本身沒有變寬。在 B 上用觸控板或手指左右滑動試試看。再按上方的 700px：一列放得下了，兩種做法看起來一模一樣。兩者都不需要媒體查詢：`wrap` 只在放不下時換行，`auto` 只在內容超出時才能捲動。（真實的導覽列通常讓連結的寬度跟著文字走，再用 `white-space: nowrap` 讓文字不折行；這裡固定成 96px 只是為了讓數字好算。）' },
        { type: 'p', text: '橫向捲動最大的問題是「看不到的東西，使用者不知道它存在」。B 在 360px 時，第四個連結被外框切掉，只露出左邊的 40px：這個只露出一部分的連結，就是「後面還有」的提示。如果外框剛好切在兩個連結之間，使用者會以為導覽只有三個連結。所以常見的做法是調整項目的寬度或間距，讓最後一個看得到的項目露出一部分，或在邊緣加一道漸層的陰影。鍵盤則不用另外處理：連結本身可以聚焦，用 Tab 走到畫面外的連結時，瀏覽器會自動把它捲進畫面（後面的表格就沒有這麼方便）。' },
        { type: 'p', text: '不管選哪一種做法，先做的都是排出優先順序（priority）：哪些連結是多數人來這個網站要找的？「找書」與「開放時間」每天都有人按，「關於本館」一年按不到幾次。最重要的排在最前面：換行時它們在第一列，橫向捲動時不用捲就看得到；範例裡的順序就是這樣排的。連結很多的時候可以更進一步：只把最常用的幾個留在畫面上，其餘的收進一顆「更多」按鈕。這個做法常被稱為 priority+ 導覽。' },
        { type: 'callout', tone: 'warning', title: '把超出的連結切掉，或把捲軸藏起來', text: '看到橫向捲軸，初學者常直接寫 `overflow-x: hidden`。捲軸不見了，超出的連結也跟著被切掉：用滑鼠或手指都捲不到它們，等於把導覽刪掉一半。能捲動的值是 `auto`。另一個相近的錯誤是覺得捲軸不好看，用 CSS 把它隱藏：觸控螢幕還能用手指滑，用滑鼠的人卻看不到任何線索知道右邊還有東西。要隱藏捲軸，就一定要留下別的提示（露出一半的項目、邊緣的陰影），並且實際用滑鼠與鍵盤操作過。' },
        { type: 'callout', tone: 'tip', title: '動手試：什麼都不做，以及連結變寬', text: '在 360px 的寬度下，按「動手改這個範例」，把 `#wrap { flex-wrap: wrap; }` 整條刪掉再執行：A 的連結不換行了，後面的連結衝出視窗，整個預覽變成可以左右捲動，這就是什麼都不做的結果。把那一條加回去，再把 `nav a` 的 `width: 96px` 改成 `width: 120px`：一列只放得下兩個（2 × 120 + 8 = 248px），A 變成三列。連結越寬、越多，換行佔掉的高度就越多，這時就該考慮另外兩種做法。' },
      ],
    },
    {
      id: 'rwd11-collapse', title: '導覽收合：一顆真正的選單按鈕',
      blocks: [
        { type: 'p', text: '連結多到換行要佔三四列的時候，就把整份清單收起來，只留下一顆按鈕，這就是導覽收合。按鈕上常見的圖示是三條橫線，俗稱漢堡選單（hamburger menu）。這個元件你其實做過：網頁基礎島「語意 HTML 與 ARIA 的無障礙實作」那一課最後修好的下拉選單，就是一顆有 `aria-expanded` 的按鈕，控制一份用 `hidden` 收合的清單。這一課新增的問題只有一個：它只在窄螢幕才需要收合，寬螢幕上清單要一直顯示，按鈕要消失。' },
        { type: 'p', text: '做對的選單按鈕有四個條件。前三個是那一課的內容，這裡只列重點：' },
        { type: 'list', items: [
          '它是原生的 `<button type="button">`，而且有名稱。只放三條線的圖示時，要用 `aria-label` 或看不見的文字替它取名字，例如「選單」；範例直接把文字寫在按鈕上。',
          '按鈕上有 `aria-expanded`（收合是 `false`，展開是 `true`）與指向清單 `id` 的 `aria-controls`；每一次開合，指令稿都要更新 `aria-expanded`。',
          '收合的清單用 `hidden` 屬性或 `display: none` 藏起來，它才會同時離開畫面、Tab 順序與無障礙樹。按 Escape 可以收合，收合之後焦點回到按鈕。',
          '從斷點以上，按鈕不顯示，清單一直顯示，而且不受窄版收合狀態的影響。',
        ] },
        { type: 'example', id: 'rwd11-menu' },
        { type: 'p', text: 'index.html 與 script.js 幾乎就是那一課的寫法。按鈕放在 `<nav>` 的裡面：清單收合時，導覽這個地標仍然在，裡面有一顆說明狀態的按鈕。清單 `#menu` 一開始有 `hidden`；`setOpen(open)` 同時設定 `menu.hidden` 與 `aria-expanded`，點擊時呼叫 `setOpen(menu.hidden)`；`keydown` 的監聽器登記在 `<nav>` 上，靠冒泡接住來自按鈕與連結的按鍵，按下 Escape 時收合並呼叫 `button.focus()`。' },
        { type: 'p', text: '新的部分在 style.css。基本樣式（窄版）完全沒有設定 `#menu` 的 `display`，所以 `hidden` 屬性靠瀏覽器內建的 `display: none` 把清單藏起來。最下面的媒體查詢在 700px 以上做兩件事：`#menu-button { display: none; }` 讓按鈕消失，同時離開 Tab 順序與無障礙樹；`#menu { display: flex; }` 讓清單排成一列。關鍵在第二條：你寫在樣式表裡的 `display` 會蓋過 `hidden` 屬性的效果（那一課的提示「display 會蓋過 hidden」），所以不管 `#menu` 身上此刻有沒有 `hidden`，寬版的清單都會顯示。那一課要你提防的事，在這裡是刻意使用的。' },
        { type: 'p', text: '照這個順序操作一次。預覽一開始是 360px：點「選單」，清單展開；按 Escape，清單收合，焦點回到按鈕（預覽裡的連結不會真的離開頁面）。讓清單維持收合，按上方的 700px 或 1000px：按鈕不見了，五個連結排成一列。展開預覽下方「瀏覽器建立的 DOM 樹」，`ul#menu` 仍然帶著 `hidden`，它只是被查詢裡的規則蓋過了。再按回 360px：清單回到收合的樣子，`aria-expanded` 也還是 `false`，狀態沒有亂掉。' },
        { type: 'callout', tone: 'note', title: '指令稿沒有執行的時候', text: '這個範例的 HTML 一開始就替清單寫了 `hidden`。萬一 script.js 沒有載入或執行到一半出錯，窄螢幕上的按鈕按了沒有反應，清單永遠打不開。更穩固的寫法是漸進增強（「響應式原則與行動優先」那一課）：HTML 裡清單不寫 `hidden`，改成按鈕寫 `hidden`；指令稿開始執行時先拿掉按鈕的 `hidden`，再呼叫 `setOpen(false)` 收合清單。這樣指令稿失敗時，使用者看到的是一份完整展開的清單：佔位置，但每個連結都按得到。' },
        { type: 'callout', tone: 'tip', title: '動手試：拿掉寬版的那一條規則', text: '按「動手改這個範例」，把媒體查詢裡的 `#menu { display: flex; gap: 16px; margin: 0; }` 整條刪掉再執行。360px 一切正常；讓清單維持收合，按 1000px：按鈕照樣消失，清單卻沒有出現，寬版連一個導覽連結都沒有。媒體查詢把按鈕藏起來的同時，一定要負責把清單顯示出來。' },
      ],
    },
    {
      id: 'rwd11-collapse-traps', title: '跨過斷點：兩個讓選單卡住的錯誤',
      blocks: [
        { type: 'p', text: '收合的選單有兩件事在決定清單顯不顯示：指令稿記下的收合狀態，以及媒體查詢。兩邊都在設定同一個元素的 `display`，誰贏由串接決定。除了特異性與先後，還要看宣告來自哪裡，由弱到強是：' },
        { type: 'table', head: ['來源', '例子', '強弱'], rows: [
          ['瀏覽器內建的預設樣式', '`hidden` 屬性的 `display: none`', '最弱：你的樣式表裡任何一條設定 `display` 的規則都會蓋過它'],
          ['你的樣式表', '`#menu { display: flex; }`，不論在不在媒體查詢裡', '蓋過瀏覽器的預設樣式；規則彼此之間比特異性與先後'],
          ['元素的行內樣式', '指令稿執行 `menu.style.display = \'none\'` 寫上的 `style` 屬性', '蓋過樣式表裡所有沒有 `!important` 的規則'],
        ] },
        { type: 'p', text: '由這張表可以推出兩個方向相反的錯誤。兩個都很常見，而且都不會在「一開始就用寬螢幕開啟」的測試裡出現。' },
        { type: 'callout', tone: 'warning', title: '寬版的清單不見了', text: '指令稿用 `menu.style.display = \'none\'` 收合清單。窄版一切正常；但使用者在窄版開過又關上選單之後把視窗拉寬（或把手機轉成橫向），行內樣式的 `display: none` 蓋過媒體查詢裡的 `display: flex`：寬版沒有按鈕，也沒有清單。重新整理就好了，所以很難被回報。修法：指令稿只改狀態（`hidden` 屬性、類別或 `data-` 屬性），顯不顯示交給樣式表決定。' },
        { type: 'callout', tone: 'warning', title: '窄版的清單關不起來', text: '反過來，在基本樣式替清單寫了 `display`，例如想讓窄版也用 flex 直向排列而寫了 `#menu { display: flex; flex-direction: column; }`。這條規則蓋過 `hidden` 屬性：清單從一開始就是展開的，按鈕怎麼按，`aria-expanded` 都照常切換，畫面卻沒有變化。修法：基本樣式不要設定被 `hidden` 收合的元素的 `display`；真的需要，就把那條規則的選擇器寫成 `#menu:not([hidden])`，只在沒有 `hidden` 的時候套用。' },
        { type: 'p', text: '很多專案不用 `hidden`，而是讓指令稿切換一個類別（或 `data-open` 屬性），例如 `menu.classList.toggle(\'open\')`，樣式表寫 `#menu { display: none; }` 與 `#menu.open { display: block; }`。要檢查的是同一件事。寬版查詢裡的 `#menu { display: flex; }` 與基本樣式的 `#menu { display: none; }` 特異性相同，查詢寫在後面，所以贏；可是 `#menu.open` 多了一個類別，特異性比較高：清單在窄版展開著的時候被拉寬，套用到的是 `block` 而不是 `flex`，連結變成直的一排。寬版的規則要把兩種狀態都蓋過，例如寫成 `#menu, #menu.open { display: flex; }`。不管用哪一種寫法，測試的步驟都一樣：' },
        { type: 'list', ordered: true, items: [
          '窄版：展開、收合、按 Escape，確認 `aria-expanded` 和畫面一致，焦點回到按鈕。',
          '窄版收合之後拉寬：清單要顯示，按鈕要消失。',
          '窄版展開之後拉寬：清單的排法要和上一步相同。',
          '再縮回窄版：選單還能正常開合。',
        ] },
        { type: 'p', text: '這一課的選單是在原地展開的：清單把下面的內容往下推。從畫面側邊滑出、蓋住頁面的抽屜式選單（off-canvas drawer）還要多處理兩件事：開著的時候把焦點留在抽屜裡（焦點陷阱，focus trap），並且鎖住背景頁面的捲動。那是互動設計島的內容，這一課不做。想比較幾種手機導覽操作起來的差別，可以到互動實驗島的 Mobile Navigation Simulator。' },
        { type: 'callout', tone: 'tip', title: '動手試：重現第一個錯誤', text: '回到上一節的範例，把 `setOpen` 裡的 `menu.hidden = !open;` 改成 `menu.style.display = open ? \'block\' : \'none\';`，再把點擊的那一行改成 `setOpen(button.getAttribute(\'aria-expanded\') === \'false\');`，然後執行。在 360px 點兩下按鈕（展開再收合），再按 1000px：清單沒有出現。展開 DOM 樹，`ul#menu` 身上多了 `style="display: none;"`，就是它蓋過了媒體查詢。' },
      ],
    },
    {
      id: 'rwd11-table-scroll-section', title: '表格之一：在自己的外框裡水平捲動',
      blocks: [
        { type: 'p', text: '表格是另一個在窄螢幕上出問題的元件。這一課用到的表格標記只有這幾個：`<caption>` 是表格的標題；`<thead>` 與 `<tbody>` 分開標題列與資料列；欄位標題寫成 `<th scope="col">`，每一列開頭說明「這一列是誰」的儲存格寫成 `<th scope="row">`，其餘的資料是 `<td>`。表格的每一欄至少要和欄裡最長、不能斷行的內容一樣寬；欄位一多，整個表格需要的寬度就超過手機的視窗。結果不是把頁面撐出橫向捲軸，就是每一格被擠到一行只剩一兩個字。' },
        { type: 'p', text: '表格在窄螢幕上有三種處理方式，選哪一種要看資料的特性。第一種最單純，也最不容易出錯：表格維持原本的樣子，放進一個外框，在外框裡水平捲動。它適合用來比較的資料：使用者要沿著一列橫向比、沿著一欄直向比，欄與列的對齊不能被拆散。' },
        { type: 'example', id: 'rwd11-table-scroll' },
        { type: 'p', text: '做法是在表格外面包一個元素（這裡是 `.table-scroll`），替它寫 `overflow-x: auto`。表格自己寫了 `min-width: 560px`：四欄平均各 140px。不寫 `min-width`，瀏覽器會盡量把表格擠進外框，文字可以斷行的欄位會被壓得很窄；`min-width` 是在告訴瀏覽器：寧可捲動，也不要擠壓。預覽 360px 時，外框寬 360px，裡面的表格寬 560px，超出的 200px 留在外框裡捲動，頁面本身沒有變寬：上面的標題與下面的段落都不會跟著左右移動。按 800px：外框比 560px 寬，表格的 `width: 100%` 讓它填滿外框，不需要捲動，和一般的表格沒有兩樣。`overflow-x` 必須寫在外面的容器上：寫在 `<table>` 自己身上，不會讓它變成可以捲動的區域（除非把表格的 `display` 改掉，而那會帶來下一節說的風險）。' },
        { type: 'p', text: '外框上另外三個屬性是給鍵盤與螢幕閱讀器的。滑鼠與觸控可以直接捲動這個區域；鍵盤卻要先把焦點移進去，才能用方向鍵捲動，而表格裡沒有任何可以聚焦的元素。所以：' },
        { type: 'list', items: [
          '`tabindex="0"`：讓外框排進 Tab 順序。焦點停在上面時，按左右方向鍵就能捲動。有些瀏覽器會自動讓這種可以捲動的區域能夠聚焦，但不是每一個都會，自己寫上才保險。',
          '`role="region"`：可以聚焦的元素需要角色，否則螢幕閱讀器的使用者停在上面時，聽不出這是什麼。',
          '`aria-labelledby="plans-title"`：有了角色還需要名稱。這裡指向表格的 `<caption>`，名稱就是「三種借書證的比較」，畫面上的標題改了，名稱也跟著改。',
        ] },
        { type: 'p', text: '樣式表也替外框寫了 `:focus-visible` 的外框線，看得出焦點在哪裡。這個外框純粹是為了捲動而加的容器，所以用 `<div>` 加 `role="region"`；寫成有名稱的 `<section>` 也會得到同樣的角色。在預覽裡用滑鼠點一下「借書證方案」這個標題，再按 Tab：焦點停在表格的外框上，這時按右方向鍵，表格就會往左捲。' },
        { type: 'callout', tone: 'tip', title: '動手試：拿掉外框的捲動', text: '在 360px 的寬度下，把 `.table-scroll { overflow-x: auto; }` 整條刪掉再執行：560px 的表格衝出外框，整個頁面變成可以左右捲動，標題與下面的段落都跟著被捲走。加回去之後再試一個常見的加強：替 `#plans th[scope="row"]` 加上 `position: sticky; left: 0; background-color: #ffffff;`（網頁基礎島的定位那一課），捲動時第一欄會留在左邊，一直看得到每一列是什麼。' },
      ],
    },
    {
      id: 'rwd11-table-reflow-section', title: '表格之二：隱藏次要欄位，或重排成卡片',
      blocks: [
        { type: 'p', text: '第二種做法回到優先順序：不是每一欄都同樣重要。新書清單裡，書名與作者是每個人都要看的，分類與出版年只是補充。窄螢幕上可以把次要的欄位藏起來，讓剩下的欄位寬鬆地排進視窗。' },
        { type: 'example', id: 'rwd11-table-priority' },
        { type: 'p', text: '「分類」與「出版年」的欄位標題和每一個儲存格都加了類別 `extra`，一條 `@media (width < 600px) { #books .extra { display: none; } }` 在窄版把它們整欄拿掉；600px 以上查詢不成立，它們就是原本的儲存格。按 360px 與 700px 對照：窄版剩下書名、作者與館藏地三欄。這裡用的是範圍語法的「小於」，不是行動優先慣用的 `min-width`，理由很實際：表格元素預設的 `display` 各不相同（`table-cell`、`table-row`、`table-header-group`…），先全部藏起來、到了寬版再逐一設回去很容易寫錯；只在窄版動手，寬版就什麼都不用寫。' },
        { type: 'callout', tone: 'warning', title: '被隱藏的欄位，手機上誰都拿不到', text: '`display: none` 的欄位不只是看不到，螢幕閱讀器也讀不到：窄螢幕上的使用者沒有任何辦法取得那些資料。所以只能隱藏真正次要的欄位，而且要留一條路：範例裡每個書名都是連結，完整的資料在那本書自己的頁面上。使用者做決定時需要的欄位（價格、到期日、庫存）不是次要的，不能藏；如果每一欄都重要，就改用水平捲動或下面的重排。' },
        { type: 'p', text: '第三種做法是表格重排：把每一列改排成一張卡片，原本左右並排的儲存格改成上下疊，每個值的前面標上它的欄位名稱。它適合一筆一筆的紀錄：使用者一次只看一筆（我借的這本書什麼時候到期），不需要跨列比較。' },
        { type: 'example', id: 'rwd11-table-reflow' },
        { type: 'p', text: '重排全部寫在一條 `(width < 600px)` 的查詢裡，分成三步：' },
        { type: 'list', ordered: true, items: [
          '`#loans thead { display: none; }`：欄位標題那一列在卡片裡沒有位置，先藏起來。',
          '把 `<table>`、`<caption>`、`<tbody>`、`<tr>`、`<th>`、`<td>` 的 `display` 全部改成 `block`：它們不再照表格的規則排版，而是像一般的區塊由上往下疊。每個 `<tr>` 加上邊框與外距，就是一張卡片；每一列開頭的 `<th scope="row">`（書名）成了卡片的標題。',
          '欄位標題藏起來之後，每個值是什麼意思？HTML 在每個 `<td>` 上用 `data-label` 屬性再寫一次欄位名稱，CSS 用 `td::before { content: attr(data-label); }` 把它顯示在值的前面。`::before` 是虛擬元素：它在元素內容的最前面產生一個盒子，文字由 `content` 決定；`attr(data-label)` 的意思是「取這個元素自己的 `data-label` 屬性值」。所以三個 `<td>` 共用一條規則，各自顯示自己的標籤。',
        ] },
        { type: 'p', text: '按 360px：三張卡片，每張是書名加上三行「標籤與值」。按 700px：查詢不成立，整段規則像沒有寫一樣，表格回到原本的樣子，`::before` 沒有 `content`，也就不產生任何東西。這個做法有兩個代價。第一，欄位名稱在 HTML 裡寫了兩次（`<thead>` 一次，每個 `data-label` 一次），改名稱時兩邊都要改。第二，`::before` 產生的文字不在 DOM 裡，不能被選取或複製，只適合放這種輔助的標籤，不能放只出現在這裡的資料。' },
        { type: 'callout', tone: 'warning', title: '改掉 display，表格的語意可能跟著不見', text: '瀏覽器把 `<table>` 當成表格告訴輔助科技，螢幕閱讀器的使用者才能逐格移動，並在每一格聽到它屬於哪一欄。把表格元素的 `display` 改成 `block`、`flex` 或 `grid` 之後，在一部分瀏覽器裡，這些元素就不再以表格的角色出現在無障礙樹上；會不會發生，要看瀏覽器與它的版本，所以不能假設你的使用者遇不到。該怎麼辦：真正需要對照欄與列的資料，優先用上一節的水平捲動，不要動 `display`。決定重排時，常見的補救是在 HTML 替這些元素明確寫上角色（`role="table"`、`role="row"`、`role="columnheader"`、`role="cell"` 等），然後一定要用螢幕閱讀器，在你支援的瀏覽器上實際聽一遍。' },
        { type: 'callout', tone: 'tip', title: '動手試：標題列與引號', text: '在 360px 的寬度下，把查詢裡的 `#loans thead { display: none; }` 刪掉再執行：四個欄位標題變成疊在最上面的四行字，和下面任何一張卡片都對不起來。把它加回去，再把 `content: attr(data-label);` 改成 `content: "data-label";`：每個值的前面出現的是 data-label 這幾個英文字。引號裡的是固定的文字，`attr()` 才會去讀屬性。' },
      ],
    },
    {
      id: 'rwd11-decision-section', title: '整理：依內容選擇做法',
      blocks: [
        { type: 'p', text: '導覽與表格的做法沒有哪一種永遠最好。要問的不是「手機版長什麼樣子」，而是內容有多少、使用者拿它來做什麼。把這一課的六種做法放在一起：' },
        { type: 'table', head: ['內容的特性', '建議的做法', '要注意的事'], rows: [
          ['主導覽只有少數幾個短連結', '留在畫面上，`flex-wrap: wrap`', '連結增加之後要重新評估'],
          ['同一層級的一長串分類或標籤', '一列橫向捲動，`overflow-x: auto`', '提示後面還有；最常用的排在最前面'],
          ['主導覽的連結很多，或頁首很擠', '導覽收合到選單按鈕', '真正的 `<button>`、`aria-expanded`、Escape 與焦點；寬版的規則要蓋過收合狀態'],
          ['要橫向、直向比較的資料：方案、規格、時刻表', '表格在有名稱、可以聚焦的外框裡水平捲動', '頁面本身不能橫向捲動'],
          ['有幾欄只是補充的清單', '窄版隱藏次要的欄位', '被隱藏的資料要有別的地方可以取得'],
          ['一筆一筆的紀錄：訂單、借閱、聯絡人', '表格重排成卡片，用 `data-label` 標出欄位', '`display` 改掉之後表格語意的風險；用螢幕閱讀器實測'],
        ] },
        { type: 'p', text: '做法可以組合：一張欄位很多的比較表，可以先隱藏一兩欄真正次要的資料，剩下的仍然放在外框裡捲動。不能省的是最後的驗收，這一課的元件都要多做幾項：' },
        { type: 'list', items: [
          '在 360px、斷點的前後 1px、以及一個很寬的寬度各看一次；任何寬度下，頁面本身都不能橫向捲動。',
          '只用鍵盤走一遍：Tab 到得了每個連結與每個捲動區域，Escape 關得掉選單，焦點沒有落在看不見的東西上。',
          '在窄版開合過選單之後再拉寬，確認寬版的導覽還在；再縮回去，確認選單還能開合。',
          '把瀏覽器的文字放大之後再看一次：原本一列放得下的導覽可能放不下了，原本不用捲動的表格可能需要捲動了。',
        ] },
        { type: 'p', text: '下一課是這座島的綜合專題：一個頁面從手機到桌機的完整版面。它的頁首會用到這一課的導覽收合：窄版收到選單按鈕後面，寬版一直顯示。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'rwd11-q1', prompt: '小島商店的主導覽只有四個短連結：新品、特價、禮盒、門市。360px 寬的視窗一列只放得下三個。哪一種處理最合適？',
      options: [
        '把四個連結全部收進一顆選單按鈕，頁首比較乾淨',
        '替 `body` 寫 `overflow-x: hidden`，讓第四個連結不要撐出橫向捲軸',
        '讓導覽列 `flex-wrap: wrap`，放不下的連結換到第二列',
        '把連結的字級縮小到 10px，直到一列放得下四個',
      ],
      answer: 2,
      explanation: '連結少、文字短的時候，讓它們留在畫面上、放不下就換行，代價只是多一列的高度，每個連結都看得到、一按就到。收進選單按鈕要多按一下、要寫指令稿，四個連結不值得。`overflow-x: hidden` 只是把第四個連結切掉，使用者再也按不到「門市」。把字縮到 10px 則是犧牲所有人的閱讀來換一列的空間。',
    },
    {
      id: 'rwd11-q2', prompt: 'HTML 裡的清單是 `<ul id="menu" hidden>`，樣式表如下。視窗寬 360px 時，清單看得到嗎？',
      code: { language: 'CSS', text: '#menu {\n  display: flex;\n  flex-direction: column;\n}\n@media (min-width: 700px) {\n  #menu { flex-direction: row; }\n}' },
      options: [
        '看得到：樣式表裡的 `display: flex` 蓋過了 `hidden` 屬性的 `display: none`',
        '看不到：`hidden` 屬性的優先順序高於樣式表裡的任何規則',
        '看不到：媒體查詢不成立時，查詢外面設定同一個元素的規則也不會生效',
        '畫面上看不到，但螢幕閱讀器讀得到：`hidden` 只影響畫面',
      ],
      answer: 0,
      explanation: '`hidden` 屬性靠的是瀏覽器內建的 `display: none`，它的順位排在你的樣式表之後。`#menu { display: flex; }` 寫在查詢外面，任何寬度都套用，所以清單一直是展開的，`hidden` 形同沒有寫。媒體查詢成不成立只影響查詢裡面的規則，和外面的規則無關。`hidden` 生效時，元素是同時從畫面、Tab 順序與無障礙樹消失，沒有「只影響畫面」這回事。',
    },
    {
      id: 'rwd11-q3', prompt: '選單的指令稿用下面這一行收合清單，樣式表有 `@media (min-width: 700px) { #menu { display: flex; } }`。使用者在 360px 寬時開過又關上選單，然後把視窗拉到 1000px。結果是什麼？',
      code: { language: 'JavaScript', text: "menu.style.display = 'none';" },
      options: [
        '清單顯示：媒體查詢成立時，裡面的規則優先於其他所有樣式',
        '清單顯示：視窗的寬度改變時，瀏覽器會清掉指令稿寫上的行內樣式',
        '清單不顯示：`min-width` 的查詢在拉寬視窗時不會重新判斷，要重新整理才會成立',
        '清單不顯示：行內樣式的 `display: none` 蓋過樣式表裡的 `display: flex`',
      ],
      answer: 3,
      explanation: '`menu.style.display = \'none\'` 寫的是元素的行內樣式，它蓋過樣式表裡所有沒有 `!important` 的規則，媒體查詢裡的也一樣；查詢成立並不會讓裡面的規則變強。行內樣式寫上去之後會一直留在元素上，瀏覽器不會因為視窗變寬就把它清掉。媒體查詢則是隨時重新判斷的，不需要重新整理。修法是讓指令稿只切換 `hidden` 或類別，顯示交給樣式表。',
    },
    {
      id: 'rwd11-q4', prompt: '可以水平捲動的表格外框寫了 `tabindex="0"`。這個屬性主要是為了誰？',
      options: [
        '觸控螢幕的使用者：沒有它，手指滑不動這個區域',
        '只用鍵盤的使用者：焦點要先停在外框上，才能用方向鍵捲動',
        '搜尋引擎：有 `tabindex` 的區域才會被當成重要內容',
        '用滑鼠的使用者：沒有它，滾輪與捲軸都不能捲動這個區域',
      ],
      answer: 1,
      explanation: '滑鼠與觸控本來就能直接捲動 `overflow-x: auto` 的區域，和 `tabindex` 無關。鍵盤要捲動一個區域，焦點得先在它裡面；表格裡沒有可以聚焦的元素，所以替外框加上 `tabindex="0"` 讓它排進 Tab 順序。有些瀏覽器會自動讓可以捲動的區域能夠聚焦，但不能假設每一個都會。可以聚焦之後，還要用 `role="region"` 與名稱說明它是什麼。`tabindex` 和搜尋引擎無關。',
    },
    {
      id: 'rwd11-q5', prompt: '三種借書證方案的比較表：每一列是一個項目（可借冊數、借期…），每一欄是一種方案。使用者要橫向比較同一個項目在三種方案裡的差別，也要直向看同一種方案的所有項目。窄螢幕上哪一種做法最合適？',
      options: [
        '表格重排成卡片：每一列變成一張卡片，儲存格上下疊',
        '只留下第一種方案的那一欄，其他兩欄用 `display: none` 藏起來',
        '把表格存成一張圖片，讓它跟著視窗縮小',
        '表格維持原樣，放在可以水平捲動的外框裡',
      ],
      answer: 3,
      explanation: '比較用的資料靠的是欄與列的對齊：同一列、同一欄的數字要排在一起才比得出來。水平捲動保留了這個對齊，表格的語意也完全沒有動到。重排成卡片之後，每張卡片只有一個項目，同一種方案的數字散在不同的卡片裡，直向比不了，還要承擔改掉 `display` 的語意風險。藏起兩種方案，等於把使用者要比較的對象拿掉。圖片裡的文字縮小後看不清楚，不能選取、不能放大重排，螢幕閱讀器也讀不到裡面的資料。',
    },
    {
      id: 'rwd11-q6', prompt: '窄版把表格重排成卡片。這個儲存格的值前面會顯示什麼？',
      code: { language: 'CSS', text: '/* HTML：<td data-label="到期日">12 月 5 日</td> */\ntd::before {\n  content: "data-label";\n}' },
      options: [
        '到期日',
        'data-label 這幾個英文字',
        '什麼都不顯示：`content` 只能寫在媒體查詢裡',
        '12 月 5 日，也就是儲存格自己的文字再出現一次',
      ],
      answer: 1,
      explanation: '`content` 的值如果是引號包起來的字串，顯示的就是那串固定的文字，所以每個儲存格前面都是 data-label 這幾個字。要讀取元素自己的屬性，寫的是不加引號的 `attr(data-label)`，這時才會顯示「到期日」。`content` 寫在哪裡都可以，和媒體查詢無關；它也不會去讀元素的文字內容。',
    },
    {
      id: 'rwd11-q7', prompt: '把 `<table>`、`<tr>`、`<td>` 的 `display` 改成 `block`，重排成卡片。在無障礙上要留意的風險是什麼？',
      options: [
        '在一部分瀏覽器裡，這些元素不再以表格的角色告訴輔助科技，逐格移動與欄位的對應可能失效',
        '`display: block` 會把儲存格的文字從 DOM 移除，螢幕閱讀器讀不到任何資料',
        '每個儲存格都會變成 Tab 會停的位置，鍵盤使用者要多按很多次 Tab',
        '所有的瀏覽器都會忽略這條規則：表格元素的 `display` 不能更改',
      ],
      answer: 0,
      explanation: '表格元素的 `display` 被改掉之後，一部分瀏覽器不再把它們當成表格放進無障礙樹，是否發生要看瀏覽器與版本；所以真正需要對照欄與列的資料優先用水平捲動，重排時補上明確的角色並用螢幕閱讀器實測。`display` 只改變排版方式，文字仍然在 DOM 裡。它也不會讓元素變成可以聚焦。表格元素的 `display` 當然可以改，重排靠的就是這一點。',
    },
    {
      id: 'rwd11-q8', prompt: '訂單表格有五欄：商品、數量、單價、小計、備註。團隊想在窄螢幕隱藏一些欄位。哪一個判斷是對的？',
      options: [
        '隱藏最寬的那一欄，不管它是什麼，省下的空間最多',
        '用 `display: none` 隱藏的欄位螢幕閱讀器仍然讀得到，所以隱藏哪一欄都沒有損失',
        '只隱藏真正次要的欄位（例如備註），並確認被隱藏的資料在別的地方拿得到',
        '隱藏小計：使用者可以自己用數量乘上單價算出來',
      ],
      answer: 2,
      explanation: '隱藏欄位是依優先順序做取捨：只有對多數人不影響決定的補充資料可以藏，而且要留一條取得它的路（例如訂單的明細頁）。依寬度來挑會把最重要的欄位（通常是商品名稱）藏掉。`display: none` 的內容對所有人都消失，螢幕閱讀器同樣讀不到。小計正是使用者最想確認的數字，要人自己心算就是把頁面該做的事丟給使用者。',
    },
  ],
  webCode: {
    examples: [twoWays, menu, tableScroll, tablePriority, tableReflow],
    exercises: [exStrip, exMenu, exTableScroll, exReflow],
  },
};
