import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD06 CSS Grid, areas and auto-placement (RWD-2): grid-template-areas and grid-area, redefining only the template at a
 * breakpoint, minmax() (and why a bare 1fr track is pushed wide by its content), repeat(auto-fit / auto-fill, minmax()),
 * grid-auto-rows and grid-auto-flow (row, column, dense). A web-code lesson of HTML and CSS only: every page of the
 * made-up 小島圖書館 and 小島商店 is built from tracks whose sizes follow from explicit numbers, so the facts under it
 * (where an area lands, how many columns fit at 360, 640 and 1000px, which item fills a hole) are measured in Chromium at
 * several viewport widths. The exercises fix the HTML; the learner edits style.css and is checked on box positions after
 * `resize` steps. Line-based placement, fr and repeat(n, …) are RWD05; media query syntax in depth is RWD07; container
 * queries are RWD08.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const areas: WebExample = {
  id: 'rwd06-areas', title: '用一張圖描述小島圖書館的版面',
  description: '`.page` 是兩欄（160px 與 `1fr`）、三列（50、140、40px）、間距 10px 的格線。`grid-template-areas` 的三個字串就是三列，四個區塊各自用 `grid-area` 說自己是哪一塊。',
  widths: [600, 400],
  files: {
    html: String.raw`<div class="page">
  <header>小島圖書館</header>
  <nav>分類</nav>
  <main>本週新書</main>
  <footer>開館時間</footer>
</div>`,
    css: String.raw`body { margin: 0; }
.page {
  display: grid;
  grid-template-columns: 160px 1fr;
  grid-template-rows: 50px 140px 40px;
  gap: 10px;
  grid-template-areas:
    "header header"
    "nav    main"
    ".      footer";
}
header { grid-area: header; background-color: #90caf9; }
nav    { grid-area: nav;    background-color: #ffe082; }
main   { grid-area: main;   background-color: #c8e6c9; }
footer { grid-area: footer; background-color: #e0e0e0; }`,
  },
  observe: [
    { check: 'box', selector: 'header', measure: 'width', value: 600, label: '`header` 這個名字在第一列寫了兩次：頁首橫跨兩欄，頁面寬 600px 時它也是 600px 寬' },
    { check: 'box', selector: 'nav', measure: 'width', value: 160, label: '`nav` 在第二列的第一格：寬度就是第一欄的 160px' },
    { check: 'box', selector: 'main', measure: 'left', value: 170, label: '`main` 在第二列的第二格：左緣在 160（第一欄）+ 10（間距）= 170px' },
    { check: 'box', selector: 'footer', measure: 'left', value: 170, label: '第三列的第一格是 `.`：左下角留空，頁尾從 170px 開始' },
    { check: 'box', selector: 'footer', measure: 'top', value: 210, label: '頁尾在第三列：上緣在 50 + 10 + 140 + 10 = 210px' },
  ],
};

const areasResponsive: WebExample = {
  id: 'rwd06-areas-responsive', title: '同樣的四個區塊，在斷點換一張圖',
  description: '基本樣式是一欄的模板：四個區域由上往下各佔一列。頁面寬度至少 600px 時，媒體查詢只重新定義 `.page` 的欄寬與模板，四個區塊自己的規則一個字都沒有動。',
  widths: [360, 800],
  viewport: { width: 360, height: 640 },
  files: {
    html: String.raw`<div class="page">
  <header>小島圖書館</header>
  <nav>分類</nav>
  <main>本週新書</main>
  <footer>開館時間</footer>
</div>`,
    css: String.raw`body { margin: 0; }
.page {
  display: grid;
  gap: 10px;
  grid-template-areas:
    "header"
    "nav"
    "main"
    "footer";
}
header { grid-area: header; min-height: 50px;  background-color: #90caf9; }
nav    { grid-area: nav;    min-height: 60px;  background-color: #ffe082; }
main   { grid-area: main;   min-height: 160px; background-color: #c8e6c9; }
footer { grid-area: footer; min-height: 40px;  background-color: #e0e0e0; }

@media (min-width: 600px) {
  .page {
    grid-template-columns: 180px 1fr;
    grid-template-areas:
      "header header"
      "nav    main"
      "footer footer";
  }
}`,
  },
  observe: [
    { check: 'box', selector: 'nav', measure: 'width', value: 360, label: '頁面寬 360px：模板只有一欄，`nav` 和頁面一樣寬' },
    { check: 'box', selector: 'main', measure: 'top', value: 130, label: '頁面寬 360px：`main` 排在 `nav` 下面，上緣在 50 + 10 + 60 + 10 = 130px' },
    { do: 'resize', width: 800 },
    { check: 'box', selector: 'nav', measure: 'width', value: 180, label: '頁面改成 800px 寬：媒體查詢換了模板，`nav` 變成左邊 180px 的側欄' },
    { check: 'box', selector: 'main', measure: 'top', value: 60, label: '頁面寬 800px：`main` 移到 `nav` 的右邊，和它同一列（上緣在 60px）' },
    { check: 'box', selector: 'main', measure: 'left', value: 190, label: '頁面寬 800px：`main` 的左緣在 180 + 10 = 190px' },
  ],
};

const minmaxTracks: WebExample = {
  id: 'rwd06-minmax', title: 'minmax 的下限，以及被內容撐開的 1fr',
  description: '三個兩欄的格線，欄的定義寫在各自的上方。第一個的側欄至少 200px；後兩個的第一格裡都有一張寫了 `width: 400px` 的時刻表（藍色），差別只在欄寬是 `1fr` 還是 `minmax(0, 1fr)`。',
  widths: [600, 1000, 360],
  files: {
    html: String.raw`<p>minmax(200px, 1fr) 3fr</p>
<div class="grid" id="share">
  <div class="a">分類</div>
  <div class="b">書單</div>
</div>
<p>1fr 1fr</p>
<div class="grid" id="blown">
  <div class="a"><div class="chart">寬 400px 的時刻表</div></div>
  <div class="b">說明</div>
</div>
<p>minmax(0, 1fr) minmax(0, 1fr)</p>
<div class="grid" id="fixed">
  <div class="a"><div class="chart">寬 400px 的時刻表</div></div>
  <div class="b">說明</div>
</div>`,
    css: String.raw`body { margin: 0; }
p { margin: 12px 0 4px; font-size: 14px; }
.grid { display: grid; }
#share { grid-template-columns: minmax(200px, 1fr) 3fr; }
#blown { grid-template-columns: 1fr 1fr; }
#fixed { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.a { background-color: #ffe082; }
.b { border-bottom: 4px solid #2e7d32; }
.chart {
  width: 400px;
  height: 40px;
  background-color: #90caf9;
}`,
  },
  observe: [
    { check: 'box', selector: '#share .a', measure: 'width', value: 200, label: '頁面寬 600px：一份是 600 ÷ 4 = 150px，比下限小，所以 `minmax(200px, 1fr)` 的欄停在 200px' },
    { check: 'box', selector: '#blown .a', measure: 'width', value: 400, label: '`1fr 1fr`：第一欄被 400px 的時刻表撐成 400px，不是一半的 300px' },
    { check: 'box', selector: '#blown .b', measure: 'width', value: 200, label: '`1fr 1fr`：第二欄只剩 600 − 400 = 200px' },
    { check: 'box', selector: '#fixed .a', measure: 'width', value: 300, label: '`minmax(0, 1fr)`：下限是 0，兩欄真的各 300px（時刻表超出自己的格子）' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#share .a', measure: 'width', value: 250, label: '頁面改成 1000px 寬：一份是 1000 ÷ 4 = 250px，超過下限，`minmax(200px, 1fr)` 的欄照比例變成 250px' },
  ],
};

const autoColumns: WebExample = {
  id: 'rwd06-auto-columns', title: '不寫媒體查詢的圖片牆，以及 auto-fill 與 auto-fit 的差別',
  description: '三個格線的間距都是 20px、每欄至少 160px。上面的 `#wall` 有六張照片，用 `auto-fit`；下面兩個格線各只有兩張照片，`#fill` 用 `auto-fill`、`#fit` 用 `auto-fit`。樣式表裡沒有任何媒體查詢。',
  widths: [360, 640, 1000],
  viewport: { width: 360, height: 640 },
  files: {
    html: String.raw`<div class="grid" id="wall">
  <div class="photo">1</div>
  <div class="photo">2</div>
  <div class="photo">3</div>
  <div class="photo">4</div>
  <div class="photo">5</div>
  <div class="photo">6</div>
</div>
<p>只有兩張照片：auto-fill</p>
<div class="grid" id="fill">
  <div class="photo">A</div>
  <div class="photo">B</div>
</div>
<p>只有兩張照片：auto-fit</p>
<div class="grid" id="fit">
  <div class="photo">A</div>
  <div class="photo">B</div>
</div>`,
    css: String.raw`body { margin: 0; }
p { margin: 12px 0 4px; font-size: 14px; }
.grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
#fill {
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
}
.photo {
  height: 70px;
  background-color: #90caf9;
}`,
  },
  observe: [
    { check: 'box', selector: '#wall .photo', measure: 'width', value: 170, label: '頁面寬 360px：(360 + 20) ÷ 180 捨去小數是 2 欄，每欄 (360 − 20) ÷ 2 = 170px' },
    { do: 'resize', width: 640 },
    { check: 'box', selector: '#wall .photo', measure: 'width', value: 200, label: '頁面改成 640px 寬：(640 + 20) ÷ 180 捨去小數是 3 欄，每欄 (640 − 40) ÷ 3 = 200px' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#wall .photo', measure: 'width', value: 184, label: '頁面改成 1000px 寬：(1000 + 20) ÷ 180 捨去小數是 5 欄，每欄 (1000 − 80) ÷ 5 = 184px' },
    { check: 'box', selector: '#fill .photo', measure: 'width', value: 184, label: '頁面寬 1000px，`auto-fill`：空的三欄仍然佔著位置，兩張照片各 184px' },
    { check: 'box', selector: '#fit .photo', measure: 'width', value: 490, label: '頁面寬 1000px，`auto-fit`：空的欄收合成 0，兩張照片各 (1000 − 20) ÷ 2 = 490px' },
  ],
};

const boardHtml = (id: string) => `<div class="board" id="${id}">
  <div class="i1">1</div>
  <div class="i2 wide">2</div>
  <div class="i3 wide">3</div>
  <div class="i4">4</div>
  <div class="i5 wide">5</div>
  <div class="i6">6</div>
</div>`;

const dense: WebExample = {
  id: 'rwd06-dense', title: '跨欄留下的洞，與 dense 的回填',
  description: '兩個一樣的格線：四欄各 70px、間距 10px，隱含列的高度由 `grid-auto-rows: 50px` 決定。六個項目裡，黃色的 2、3、5 寫了 `grid-column: span 2`。下面的 `#dense` 只多了一行 `grid-auto-flow: dense`。',
  files: {
    html: `<p>grid-auto-flow: row（預設）</p>\n${boardHtml('sparse')}\n<p>grid-auto-flow: dense</p>\n${boardHtml('dense')}`,
    css: String.raw`body { margin: 0; }
p { margin: 10px 0 4px; font-size: 14px; }
.board {
  display: grid;
  grid-template-columns: repeat(4, 70px);
  grid-auto-rows: 50px;
  gap: 10px;
}
.board div { background-color: #90caf9; }
.board .wide {
  grid-column: span 2;
  background-color: #ffe082;
}
#dense { grid-auto-flow: dense; }`,
  },
  observe: [
    { check: 'style', selector: '#sparse', property: 'grid-auto-flow', value: 'row', label: '上面的格線沒有寫 `grid-auto-flow`，計算後是預設的 `row`' },
    { check: 'box', selector: '#sparse .i4', measure: 'top', value: 60, from: '#sparse', label: '預設的排法不回頭：4 接在 3 的後面，排在第二列（上緣在 50 + 10 = 60px），第一列的最後一格空著' },
    { check: 'box', selector: '#dense .i4', measure: 'top', value: 0, from: '#dense', label: '`dense`：4 被放回第一列（上緣在 0px）' },
    { check: 'box', selector: '#dense .i4', measure: 'left', value: 240, from: '#dense', label: '`dense`：4 補上第一列的最後一格，左緣在 3 × (70 + 10) = 240px' },
    { check: 'box', selector: '#dense .i6', measure: 'height', value: 50, label: '沒有寫 `grid-template-rows`：每一列都是隱含列，高度是 `grid-auto-rows` 的 50px' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const SHOP_ITEMS_CSS = String.raw`header { grid-area: header;  background-color: #90caf9; }
aside  { grid-area: sidebar; background-color: #ffe082; }
main   { grid-area: main;    background-color: #c8e6c9; }
footer { grid-area: footer;  background-color: #e0e0e0; }`;

/** The 小島商店 page of the first exercise, with the template the learner (or a mistake) writes. */
const shopCss = (template: string) => String.raw`body { margin: 0; }
#shop {
  display: grid;
  grid-template-columns: 180px 1fr;
  grid-template-rows: 60px 180px 40px;
  gap: 12px;
` + template + String.raw`}
` + SHOP_ITEMS_CSS;

const exAreas: WebExercise = {
  id: 'rwd06-ex-areas', title: '替小島商店畫出版面',
  statement: 'index.html 不能改。小島商店的頁面 `#shop` 已經是格線：兩欄（180px 與 `1fr`）、三列（60、180、40px）、間距 12px。四個區塊也各自用 `grid-area` 取好了名字：`header`、`sidebar`、`main`、`footer`。但容器還沒有畫出這些區域，四個區塊找不到自己的位置，全被擠到格線外面的右下角。請在 `#shop` 的規則裡加上一條 `grid-template-areas`，畫出這個版面：第一列整列是頁首；第二列左邊是側欄、右邊是主內容；第三列整列是頁尾。檢查在頁面寬 600px 時測量：頁首與頁尾都是 600px 寬，側欄寬 180px、上緣在 72px，主內容的左緣在 192px，頁尾的上緣在 264px。欄、列、間距與四條 `grid-area` 都不要改。',
  hints: [
    '格線有三列，所以 `grid-template-areas` 要寫三個字串；每一列有兩欄，所以每個字串裡要有兩個名字。',
    '一個區域要橫跨兩欄，就在那一列把它的名字寫兩次。第二列的兩個名字，左邊的對應 180px 那一欄。',
    '在 `#shop` 裡加上 `grid-template-areas: "header header" "sidebar main" "footer footer";`（三個字串可以各寫一行）。',
  ],
  explanation: '`grid-template-areas` 的每個字串是一列、字串裡的每個名字是一格。第一列寫兩次 `header`，頁首就橫跨兩欄：寬 600px。第二列是 `sidebar main`：側欄落在 180px 的第一欄，上緣在 60 + 12 = 72px；主內容在第二欄，左緣在 180 + 12 = 192px。第三列寫兩次 `footer`：頁尾橫跨兩欄，上緣在 72 + 180 + 12 = 264px。四個區塊的 `grid-area` 完全沒有動：版面長什麼樣子，只看容器上的這張圖。',
  widths: [600],
  fixed: { html: String.raw`<div id="shop">
  <header>小島商店</header>
  <aside>商品分類</aside>
  <main>本週特價</main>
  <footer>營業時間</footer>
</div>` },
  starter: { css: shopCss('') },
  solution: { css: shopCss(String.raw`  grid-template-areas:
    "header  header"
    "sidebar main"
    "footer  footer";
`) },
  steps: [
    { check: 'box', selector: 'header', measure: 'width', value: 600, label: '頁首橫跨兩欄：寬 600px' },
    { check: 'box', selector: 'aside', measure: 'width', value: 180, label: '側欄在左邊那一欄：寬 180px' },
    { check: 'box', selector: 'aside', measure: 'top', value: 72, label: '側欄在第二列：上緣在 72px' },
    { check: 'box', selector: 'main', measure: 'left', value: 192, label: '主內容在側欄的右邊：左緣在 192px' },
    { check: 'box', selector: 'footer', measure: 'top', value: 264, label: '頁尾在第三列：上緣在 264px' },
    { check: 'box', selector: 'footer', measure: 'width', value: 600, label: '頁尾橫跨兩欄：寬 600px' },
  ],
  mistakes: [
    { files: { css: shopCss(String.raw`  grid-template-areas:
    "header"
    "sidebar main"
    "footer";
`) }, why: '頁首與頁尾那兩列只寫了一個名字。每一列的格數必須相同，三個字串的格數是 1、2、1，整條 `grid-template-areas` 因此無效而被瀏覽器丟掉，畫面和沒寫一樣。要橫跨兩欄，就把名字寫兩次：`"header header"`。' },
    { files: { css: shopCss(String.raw`  grid-template-areas:
    "header  header"
    "main    sidebar"
    "footer  footer";
`) }, why: '第二列的兩個名字左右寫反了。字串裡由左到右的順序就是欄的順序：`main` 寫在前面，主內容就落在 180px 的第一欄，側欄反而拿到右邊寬的那一欄。' },
    { files: { css: shopCss(String.raw`  grid-template-areas: "header header sidebar main footer footer";
`) }, why: '把六個名字全寫在同一個字串裡。一個字串就是一列，所以這是「一列六欄」的版面，不是三列兩欄。每一列要用自己的一對引號。' },
  ],
};

const LIBRARY_BASE_CSS = String.raw`body { margin: 0; }
#page {
  display: grid;
  gap: 10px;
  grid-template-areas:
    "header"
    "main"
    "aside"
    "footer";
}
header { grid-area: header; min-height: 60px;  background-color: #90caf9; }
main   { grid-area: main;   min-height: 200px; background-color: #c8e6c9; }
aside  { grid-area: aside;  min-height: 50px;  background-color: #ffe082; }
footer { grid-area: footer; min-height: 40px;  background-color: #e0e0e0; }
`;

const exResponsive: WebExercise = {
  id: 'rwd06-ex-responsive-areas', title: '行動優先的圖書館頁面：寬螢幕才出現側欄',
  statement: 'index.html 不能改。小島圖書館的頁面 `#page` 是行動優先的寫法：基本樣式是一欄的模板，頁首（至少高 60px）、主內容（200px）、側欄 `aside`（50px）、頁尾（40px）由上往下排，間距 10px。請在 style.css 的最後加上一個媒體查詢：頁面寬度至少 700px 時，把版面改成兩欄，左邊的欄佔剩下的全部寬度、右邊的欄固定 240px；頁首與頁尾各自橫跨兩欄，中間那一列左邊是主內容、右邊是側欄。只要重新定義 `#page` 的欄寬與模板，四個區塊的規則不必動。檢查會在 360px、700px、1000px 三種頁面寬度測量（預覽上方的按鈕可以切換）：360px 時側欄的上緣在 280px；700px 時側欄的左緣在 460px、上緣在 70px；1000px 時主內容寬 750px。',
  hints: [
    '媒體查詢的寫法是 `@media (min-width: 700px) { … }`，大括號裡再寫一條 `#page { … }` 的規則。',
    '在那條規則裡要給兩樣東西：`grid-template-columns`（左邊 `1fr`、右邊 240px），以及三列的 `grid-template-areas`。',
    '`@media (min-width: 700px) { #page { grid-template-columns: 1fr 240px; grid-template-areas: "header header" "main aside" "footer footer"; } }`。',
  ],
  explanation: '基本樣式的模板只有一欄，四個區域各佔一列：360px 時側欄的上緣在 60 + 10 + 200 + 10 = 280px。媒體查詢寫在基本樣式之後，條件成立時用同樣的特異性蓋過它，重新定義欄寬與模板：`1fr 240px` 讓側欄固定 240px、主內容拿走其餘的寬度。700px 時主內容寬 700 − 240 − 10 = 450px，側欄的左緣在 450 + 10 = 460px，和主內容同一列（上緣在 60 + 10 = 70px）；1000px 時主內容寬 1000 − 240 − 10 = 750px。四個區塊的 `grid-area` 在兩種版面都是同一個名字，所以媒體查詢裡不需要碰它們。',
  viewport: { width: 360, height: 640 },
  widths: [360, 700, 1000],
  fixed: { html: String.raw`<div id="page">
  <header>小島圖書館</header>
  <main>新書介紹</main>
  <aside>借閱排行</aside>
  <footer>聯絡我們</footer>
</div>` },
  starter: { css: LIBRARY_BASE_CSS },
  solution: { css: LIBRARY_BASE_CSS + String.raw`
@media (min-width: 700px) {
  #page {
    grid-template-columns: 1fr 240px;
    grid-template-areas:
      "header header"
      "main   aside"
      "footer footer";
  }
}` },
  steps: [
    { check: 'box', selector: 'aside', measure: 'top', value: 280, label: '頁面寬 360px：仍然是一欄，側欄排在主內容下面（上緣在 280px）' },
    { do: 'resize', width: 700 },
    { check: 'box', selector: 'header', measure: 'width', value: 700, label: '頁面寬 700px：頁首橫跨兩欄（寬 700px）' },
    { check: 'box', selector: 'aside', measure: 'left', value: 460, label: '頁面寬 700px：側欄在右邊 240px 的那一欄（左緣在 460px）' },
    { check: 'box', selector: 'aside', measure: 'top', value: 70, label: '頁面寬 700px：側欄和主內容同一列（上緣在 70px）' },
    { check: 'box', selector: 'footer', measure: 'width', value: 700, label: '頁面寬 700px：頁尾橫跨兩欄（寬 700px）' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: 'main', measure: 'width', value: 750, label: '頁面寬 1000px：主內容拿走側欄以外的寬度（750px）' },
  ],
  mistakes: [
    { files: { css: LIBRARY_BASE_CSS + String.raw`
@media (min-width: 700px) {
  #page {
    grid-template-areas:
      "header header"
      "main   aside"
      "footer footer";
  }
}` }, why: '只換了模板，沒有給欄寬。模板說了「有兩欄」，卻沒有說每一欄多寬：兩欄都是 `auto`，寬度由內容與剩餘空間決定，側欄不會是 240px。`grid-template-areas` 只負責命名，軌道的大小仍然要用 `grid-template-columns` 寫。' },
    { files: { css: LIBRARY_BASE_CSS + String.raw`
@media (max-width: 700px) {
  #page {
    grid-template-columns: 1fr 240px;
    grid-template-areas:
      "header header"
      "main   aside"
      "footer footer";
  }
}` }, why: '條件寫成了 `max-width: 700px`。這是「寬度不超過 700px 時」才成立：手機反而變成兩欄，寬螢幕卻維持一欄。行動優先的基本樣式給窄的畫面，加寬時才套用的規則要用 `min-width`。' },
    { files: { css: LIBRARY_BASE_CSS + String.raw`
@media (min-width: 700px) {
  #page {
    grid-template-columns: 1fr 240px;
    grid-template-areas:
      "header header"
      "aside  main"
      "footer footer";
  }
}` }, why: '模板裡把 `aside` 寫在左邊，欄寬卻是 `1fr 240px`。名字由左到右對應的是欄的順序：側欄落在寬的第一欄，主內容被塞進 240px。模板的每一格要和 `grid-template-columns` 的每一欄對得起來。' },
  ],
};

const PHOTO_NAMES = ['海灘', '燈塔', '漁港', '椰林', '夕陽', '市集', '步道', '星空'];
const wallHtml = (count: number) => `<div id="wall">\n${PHOTO_NAMES.slice(0, count).map(name => `  <div class="photo">${name}</div>`).join('\n')}\n</div>`;

/** The photo wall of the third exercise, with the declarations (and any rules after it) of an answer. */
const wallCss = (columns: string, after = '') => String.raw`body { margin: 0; }
#wall {
  display: grid;
  gap: 20px;
` + columns + String.raw`}
.photo {
  height: 100px;
  background-color: #90caf9;
}` + after;

const exWall: WebExercise = {
  id: 'rwd06-ex-photo-wall', title: '不寫媒體查詢的圖片牆',
  statement: 'index.html 不能改。`#wall` 是小島攝影社的圖片牆，裡面有八張照片（用色塊代表），每張高 100px，現在全部排成一欄。請在 `#wall` 的規則裡加上一條宣告，不寫任何媒體查詢，讓欄數隨容器的寬度自動增減：每一欄至少 200px 寬，排得下幾欄就排幾欄，再把剩下的寬度平均分給每一欄；照片少到排不滿一列時，要拉寬填滿整列，不留空欄。`gap: 20px` 與 `body { margin: 0; }` 要保留。動手前先用公式算：欄數是 (容器寬 + 20) ÷ (200 + 20) 無條件捨去。頁面寬 300px 時是 1 欄（每欄 300px），500px 時 2 欄（240px），700px 時 3 欄（220px），1000px 時 4 欄（235px）。檢查會在這四種寬度各量一次；另外還會把同一面牆放進寬 700px 的欄位，以及換成只有兩張照片的牆，再各檢查一次。',
  hints: [
    '欄數不寫死，就把 `repeat()` 的第一個參數換成關鍵字；「至少 200px、有剩就平分」是 `minmax()` 的工作。',
    '關鍵字有 `auto-fill` 與 `auto-fit` 兩個。題目要求照片很少時「拉寬填滿整列，不留空欄」，哪一個會把空的欄收合？',
    '在 `#wall` 裡加上 `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));`。',
  ],
  explanation: '`repeat(auto-fit, minmax(200px, 1fr))` 請瀏覽器自己算欄數：在容器裡放進最多個「至少 200px」的欄，欄與欄之間還要留 20px 的間距，所以欄數是 (容器寬 + 20) ÷ 220 無條件捨去；接著 `1fr` 把剩下的寬度平分給每一欄。300px 時只放得下 1 欄；500px 時 2 欄，每欄 (500 − 20) ÷ 2 = 240px；700px 時 3 欄，每欄 (700 − 40) ÷ 3 = 220px；1000px 時 4 欄，每欄 (1000 − 60) ÷ 4 = 235px。這條規則看的是容器的寬度而不是視窗的寬度，所以牆被放進 700px 的欄位時自動變成 3 欄。`auto-fit` 會把沒有項目的欄收合，只有兩張照片時兩張各佔 (1000 − 20) ÷ 2 = 490px。',
  viewport: { width: 300, height: 1000 },
  widths: [300, 500, 700, 1000],
  fixed: { html: wallHtml(8) },
  starter: { css: wallCss('') },
  solution: { css: wallCss(String.raw`  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
`) },
  steps: [
    { check: 'box', selector: '.photo', measure: 'width', value: 300, label: '頁面寬 300px：只有 1 欄，照片寬 300px' },
    { check: 'box', selector: '.photo:nth-child(2)', measure: 'top', value: 120, from: '#wall', label: '頁面寬 300px：第二張照片排在第一張下面（上緣在 100 + 20 = 120px）' },
    { do: 'resize', width: 500 },
    { check: 'box', selector: '.photo', measure: 'width', value: 240, label: '頁面寬 500px：2 欄，每欄 240px' },
    { do: 'resize', width: 700 },
    { check: 'box', selector: '.photo', measure: 'width', value: 220, label: '頁面寬 700px：3 欄，每欄 220px' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '.photo', measure: 'width', value: 235, label: '頁面寬 1000px：4 欄，每欄 235px' },
    { check: 'box', selector: '.photo:nth-child(4)', measure: 'left', value: 765, from: '#wall', label: '頁面寬 1000px：第四張照片在第一列的最後一欄（左緣在 3 × (235 + 20) = 765px）' },
  ],
  mistakes: [
    { files: { css: wallCss(String.raw`  grid-template-columns: repeat(auto-fit, 200px);
`) }, why: '少了 `minmax()`，每一欄固定 200px。欄數會自動增減，但欄不會伸長：頁面寬 300px 時照片只有 200px 寬，右邊空著 100px。要「至少 200px、有剩就平分」，得寫成 `minmax(200px, 1fr)`。' },
    { files: { css: wallCss(String.raw`  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
`) }, why: '用了 `auto-fill`。八張照片時看不出差別，但牆上只有兩張照片、頁面寬 1000px 時，`auto-fill` 仍然保留四欄的位置：兩張各 235px，右邊留下兩欄空白。要讓剩下的照片拉寬填滿，用的是會收合空欄的 `auto-fit`。' },
    { files: { css: wallCss('', String.raw`
@media (min-width: 420px) { #wall { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 640px) { #wall { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 860px) { #wall { grid-template-columns: repeat(4, 1fr); } }`) }, why: '用三個媒體查詢把欄數寫死。四種頁面寬度量起來都對，但媒體查詢看的是視窗而不是容器：牆被放進寬 700px 的欄位時，視窗仍然是 1000px 寬，照樣排成 4 欄，每欄只有 160px。`auto-fit` 配 `minmax()` 才是跟著容器算欄數。' },
  ],
  variants: [
    {
      title: '同一面牆放進寬 700px 的欄位（視窗寬 1000px）：欄數跟著容器，是 3 欄',
      fixed: { html: `<div style="width: 700px;">\n${wallHtml(8)}\n</div>` },
      steps: [
        { do: 'resize', width: 1000 },
        { check: 'box', selector: '.photo', measure: 'width', value: 220, label: '容器寬 700px：3 欄，每欄 220px' },
        { check: 'box', selector: '.photo:nth-child(4)', measure: 'top', value: 120, from: '#wall', label: '第四張照片換到第二列' },
      ],
    },
    {
      title: '牆上只有兩張照片（視窗寬 1000px）：兩張拉寬填滿整列',
      fixed: { html: wallHtml(2) },
      steps: [
        { do: 'resize', width: 1000 },
        { check: 'box', selector: '.photo', measure: 'width', value: 490, label: '兩張照片各 490px' },
        { check: 'box', selector: '.photo:nth-child(2)', measure: 'left', value: 510, from: '#wall', label: '第二張的左緣在 510px' },
      ],
    },
  ],
};

/** The featured board of the last exercise: what the learner adds to the container, and the rule of the wide tiles. */
const boardCss = (container: string, wide: string) => String.raw`body { margin: 0; }
#board {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
` + container + String.raw`}
.tile { background-color: #bbdefb; }
.wide {
` + wide + String.raw`  background-color: #ffe082;
}`;

const exDense: WebExercise = {
  id: 'rwd06-ex-dense-board', title: '精選看板：跨欄的橫幅、固定的列高、補滿的空格',
  statement: 'index.html 不能改。小島商店的精選看板 `#board` 有五張卡片：`#t1`、`#t2` 是橫幅（有 `wide` 這個 class），`#t3`、`#t4`、`#t5` 是小卡片。容器已經用 `repeat(auto-fit, minmax(160px, 1fr))` 與 `gap: 12px` 自動決定欄數：頁面寬 600px 時是 3 欄、每欄 192px，400px 時是 2 欄、每欄 194px。請完成三件事：（1）兩張橫幅各自橫跨兩欄；（2）不管排出幾列，每一列都是 100px 高；（3）橫幅換到下一列時留下的空格，由後面的小卡片回頭補上。這是一塊順序不重要的裝飾性看板，所以可以讓瀏覽器回填。檢查在 600px 時測量：`#t1` 寬 396px，`#t2` 的上緣在 112px，`#t3` 補在第一列的第三欄（左緣 408px、上緣 0px）；再把頁面改成 400px：`#t3` 的上緣在 224px，第四列的 `#t5` 仍然高 100px。`grid-template-columns`、`gap` 與 `body { margin: 0; }` 不要改。',
  hints: [
    '三件事對應三個屬性：項目上的 `grid-column`、容器上的 `grid-auto-rows` 與 `grid-auto-flow`。',
    '列數會隨欄數改變，所以列高不能用 `grid-template-rows` 一列一列寫，要設定「自動產生的列」的高度。橫跨兩欄用 `span`。',
    '在 `#board` 裡加上 `grid-auto-rows: 100px; grid-auto-flow: dense;`，在 `.wide` 裡加上 `grid-column: span 2;`。',
  ],
  explanation: '`grid-column: span 2` 讓橫幅佔兩欄：600px 時寬 192 × 2 + 12 = 396px。這個格線沒有寫 `grid-template-rows`，每一列都是隱含列，`grid-auto-rows: 100px` 讓它們全都是 100px 高，所以第二列的上緣在 100 + 12 = 112px。3 欄時 `#t1` 佔了第一列的前兩欄，`#t2` 在剩下的一格放不下，只好換到第二列，第一列的第三欄就空了；`grid-auto-flow: dense` 讓瀏覽器替後面的每個項目從頭找第一個放得下的位置，`#t3` 於是補上那一格（左緣在 2 × (192 + 12) = 408px）。400px 時只有 2 欄，兩張橫幅各佔一整列，沒有洞可補：`#t3` 在第三列（上緣在 2 × 112 = 224px），`#t5` 在第四列。畫面上的順序變了，HTML 的順序沒有變，所以這個寫法只適合順序不重要的內容。',
  viewport: { width: 600, height: 600 },
  widths: [600, 400],
  fixed: { html: String.raw`<div id="board">
  <div class="tile wide" id="t1">本週主打：椰子餅乾</div>
  <div class="tile wide" id="t2">新品：海鹽牛奶糖</div>
  <div class="tile" id="t3">鳳梨乾</div>
  <div class="tile" id="t4">芒果乾</div>
  <div class="tile" id="t5">香蕉脆片</div>
</div>` },
  starter: { css: boardCss('', '') },
  solution: { css: boardCss(String.raw`  grid-auto-rows: 100px;
  grid-auto-flow: dense;
`, String.raw`  grid-column: span 2;
`) },
  steps: [
    { check: 'box', selector: '#t1', measure: 'width', value: 396, label: '頁面寬 600px：橫幅 `#t1` 橫跨兩欄（寬 396px）' },
    { check: 'box', selector: '#t2', measure: 'top', value: 112, from: '#board', label: '頁面寬 600px：第一列高 100px，`#t2` 在第二列（上緣在 112px）' },
    { check: 'box', selector: '#t3', measure: 'top', value: 0, from: '#board', label: '頁面寬 600px：`#t3` 補上第一列的空格（上緣在 0px）' },
    { check: 'box', selector: '#t3', measure: 'left', value: 408, from: '#board', label: '頁面寬 600px：`#t3` 在第三欄（左緣在 408px）' },
    { do: 'resize', width: 400 },
    { check: 'box', selector: '#t3', measure: 'top', value: 224, from: '#board', label: '頁面寬 400px：兩張橫幅各佔一列，`#t3` 在第三列（上緣在 224px）' },
    { check: 'box', selector: '#t5', measure: 'height', value: 100, label: '頁面寬 400px：第四列的 `#t5` 也是 100px 高' },
  ],
  mistakes: [
    { files: { css: boardCss(String.raw`  grid-auto-rows: 100px;
`, String.raw`  grid-column: span 2;
`) }, why: '沒有寫 `grid-auto-flow: dense`。預設的自動排列只往前走、不回頭：`#t2` 換到第二列之後，`#t3` 接在它後面，第一列的第三欄就一直空著。' },
    { files: { css: boardCss(String.raw`  grid-template-rows: 100px;
  grid-auto-flow: dense;
`, String.raw`  grid-column: span 2;
`) }, why: '用 `grid-template-rows: 100px` 設定列高。它只定義了第一列，第二列以後是自動產生的隱含列，高度只包住文字。不知道會有幾列的時候，列高要用 `grid-auto-rows` 設定。' },
    { files: { css: boardCss(String.raw`  grid-auto-rows: 100px;
  grid-auto-flow: dense;
`, String.raw`  grid-column: 2;
`) }, why: '把 `grid-column: span 2` 寫成 `grid-column: 2`，少了 `span`。單獨一個數字是「從第 2 條格線開始」，也就是指定放在第二欄，寬度只有一欄。要「佔兩欄」，關鍵字 `span` 不能省。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD06: LessonContent = {
  lessonId: 'RWD06',
  motivation: '用格線編號放項目，版面一改就要把每個項目的編號重算一次；卡片牆想在手機排一欄、在桌機排四欄，又得替每個寬度各寫一段媒體查詢。這一課用 `grid-template-areas` 把版面直接畫成一張圖，用 `repeat(auto-fit, minmax(…))` 讓瀏覽器自己算欄數，再用 `grid-auto-flow` 控制自動排列。學完之後，你能不寫任何 Media Query 就做出會自動調整欄數的圖片牆。',
  sections: [
    {
      id: 'rwd06-areas-section', title: '用 grid-template-areas 把版面畫出來',
      blocks: [
        { type: 'p', text: 'RWD05 用格線編號放項目：頁首是 `grid-column: 1 / -1`，側欄是第 2 列的第 1 欄。這樣寫有兩個不方便的地方。第一，想知道版面長什麼樣子，得把每個項目的編號讀過一遍，在腦中拼起來。第二，版面多加一欄，所有的編號都要重算。命名區域（named grid area）換了一個方向：先替每一塊取名字，再在容器上用名字把整個版面「畫」出來。' },
        { type: 'p', text: '做法分兩步。第一步，在容器上寫 `grid-template-areas`：值是幾個用引號包起來的字串，每個字串是一列；字串裡用空白隔開的每個名字是一格。相鄰的格子寫同一個名字，就合併成一個區域；不屬於任何區域的格子寫一個句點 `.`。第二步，在每個項目上寫 `grid-area: 名字`（名字不加引號），它就會被放進同名的區域。' },
        { type: 'example', id: 'rwd06-areas' },
        { type: 'p', text: '把 CSS 裡的三個字串和預覽對照著看（預覽一開始是 600px 寬，上方的按鈕可以切換）。第一列是 `"header header"`：同一個名字佔了兩格，所以頁首橫跨兩欄，寬 600px。第二列是 `"nav main"`：`nav` 在 160px 的第一欄，`main` 在第二欄，左緣在 160 + 10 = 170px。第三列是 `". footer"`：第一格是句點，左下角留空，頁尾從 170px 開始。名字之間多打幾個空白沒有關係，所以可以把每一列的名字上下對齊，讓這段 CSS 看起來就像版面的縮圖。' },
        { type: 'p', text: '模板只負責命名，不負責大小：每一欄多寬、每一列多高，仍然由 RWD05 學過的 `grid-template-columns` 與 `grid-template-rows` 決定，模板的欄數與列數要和它們對得起來。寫模板時有幾條規則：' },
        { type: 'table', head: ['規則', '說明'], rows: [
          ['一個字串是一列', '有幾個字串就有幾列；每個字串各用一對引號'],
          ['每一列的格數要相同', '三列就是三個字串，每個字串裡的名字（含句點）一樣多'],
          ['同名的格子合成一個區域', '可以橫跨多欄，也可以直跨多列，但形狀必須是矩形'],
          ['句點是空格', '`.` 代表這一格不屬於任何區域，會留白'],
          ['項目用名字認領區域', '`grid-area: header`，不加引號；一個區域的名字在模板裡只能圍出一塊'],
        ] },
        { type: 'callout', tone: 'warning', title: '模板寫錯時，瀏覽器不會提示', text: '有三種寫錯最常見，而且都不會出現錯誤訊息。第一，各列的格數不同，例如第一列只寫 `"header"`、第二列寫 `"nav main"`：整條 `grid-template-areas` 無效，被瀏覽器丟掉。第二，區域不是矩形，例如 L 形，或同一個名字出現在不相連的兩處：同樣整條無效。第三，項目的 `grid-area` 拼錯（`sidbar`），或模板裡根本沒有這個名字：項目找不到自己的區域，會被放到格線外面、自動多出來的軌道上，通常擠在右下角變成很小的一塊。版面突然亂掉時，先打開開發者工具看 `grid-template-areas` 這條宣告有沒有被劃掉，再核對每個名字的拼字。' },
        { type: 'callout', tone: 'tip', title: '動手試：改圖，不改項目', text: '按「動手改這個範例」，把第三列改成 `"footer footer"` 再執行：頁尾變成橫跨兩欄。接著把第二列改成 `"main nav"`：兩個區域左右對調了，但欄寬沒有跟著換，`main` 落在 160px 的那一欄。再把 `grid-template-columns` 改成 `1fr 160px`，側欄才真的搬到右邊。整個過程中，四個項目的規則都沒有動。' },
      ],
    },
    {
      id: 'rwd06-responsive-section', title: '在斷點換一張圖，就換一個版面',
      blocks: [
        { type: 'p', text: '命名區域最好用的地方是響應式設計。照行動優先（mobile first）的做法，基本樣式給窄的畫面：四個區塊由上往下排成一欄；畫面夠寬時，才在一個斷點（breakpoint）改成有側欄的版面。用格線編號的話，媒體查詢（media query）裡得把每個項目的位置重寫一遍；用命名區域，項目的 `grid-area` 從頭到尾不變，媒體查詢裡只要替容器換一張圖。' },
        { type: 'example', id: 'rwd06-areas-responsive' },
        { type: 'p', text: '先看基本樣式：模板是四個只有一格的字串，也就是一欄四列。沒有寫 `grid-template-columns`，唯一的一欄填滿容器；列高也沒有寫，由內容決定（範例用 `min-height` 讓每一塊有個看得見的高度）。按預覽上方的 360 按鈕：`nav` 和頁面一樣寬，`main` 排在它下面，上緣在 50 + 10 + 60 + 10 = 130px。' },
        { type: 'p', text: '再按 800 按鈕。`@media (min-width: 600px)` 的條件成立，裡面那條 `.page` 規則蓋過基本樣式的模板：欄變成 `180px 1fr`，圖變成三列兩欄。`nav` 成為左邊 180px 的側欄，`main` 移到它的右邊（左緣在 180 + 10 = 190px），兩者在同一列。注意 `nav` 的高度：它只寫了 `min-height: 60px`，現在卻和 `main` 一樣高 160px，因為格線項目預設會被拉伸到填滿自己的區域。整個媒體查詢只有一條規則、兩條宣告；`header`、`nav`、`main`、`footer` 的四條規則沒有出現在裡面。媒體查詢的完整語法與斷點該訂在哪裡，是 RWD07 的內容。' },
        { type: 'callout', tone: 'warning', title: '畫面上的順序可以換，原始碼的順序不會跟著換', text: '模板可以把區域排成和 HTML 不同的順序，例如在基本樣式裡把 `"main"` 寫在 `"nav"` 前面。但是鍵盤按 Tab 移動焦點的順序、螢幕閱讀器朗讀的順序，永遠照 HTML 原始碼。畫面上先看到主內容、焦點卻先跑到下面的導覽連結，使用鍵盤的人會很困惑。這個範例的 HTML 順序是頁首、導覽、主內容、頁尾，兩種版面的閱讀順序都和它一致。先把 HTML 排成合理的閱讀順序，再用模板安排位置，不要反過來靠模板去修正順序。' },
        { type: 'callout', tone: 'tip', title: '動手試：把側欄搬到右邊', text: '在媒體查詢裡改兩個地方：`grid-template-columns` 改成 `1fr 180px`，第二列的字串改成 `"main nav"`。執行後按 800 按鈕：側欄到了右邊，`main` 的左緣回到 0px；按 360 按鈕，一欄的版面完全不受影響。' },
      ],
    },
    {
      id: 'rwd06-minmax-section', title: 'minmax：替軌道訂下限與上限',
      blocks: [
        { type: 'p', text: '到目前為止，一條軌道的大小只有一個值：`200px` 是固定的，畫面再寬也不會變；`1fr` 會伸縮，但畫面一窄就可能縮到放不下內容。`minmax(下限, 上限)` 讓軌道的大小是一個範圍：不會比下限小，也不會比上限大。凡是能寫軌道大小的地方都能用它：`grid-template-columns`、`grid-template-rows`，以及後面會用到的 `grid-auto-rows`。' },
        { type: 'p', text: '最常見的寫法是 `minmax(200px, 1fr)`：這一欄至少 200px，有多的空間時再照比例分一份。下面範例的第一個格線是 `minmax(200px, 1fr) 3fr`，兩欄一共 4 份。頁面寬 1000px 時，一份是 1000 ÷ 4 = 250px，側欄 250px、內容 750px。頁面寬 600px 時，一份只有 150px，比下限小，所以側欄停在 200px，剩下的 400px 全部給 `3fr` 的那一欄。' },
        { type: 'example', id: 'rwd06-minmax' },
        { type: 'p', text: '按 600 與 1000 兩個按鈕，看第一個格線的黃色側欄在 200px 與 250px 之間變化。接著看後兩個格線，它們示範一個很常見的陷阱。兩個格線都想要「兩欄等寬」，第一格裡都放了一張寫了 `width: 400px` 的時刻表。`#blown` 寫的是 `1fr 1fr`：頁面寬 600px 時，你會預期兩欄各 300px，實際上卻是 400px 與 200px。' },
        { type: 'p', text: '原因是 `1fr` 其實等於 `minmax(auto, 1fr)`。下限 `auto` 的意思是「不能比內容的最小寬度還窄」，而內容的最小寬度，就是裡面最寬的那個不能斷開的東西：一張固定寬度的圖片或表格、一個很長的網址、`pre` 裡的一行程式碼。時刻表至少要 400px，第一欄就被撐到 400px，第二欄只能拿剩下的 200px。`#fixed` 把兩欄都寫成 `minmax(0, 1fr)`：下限是 0，瀏覽器不再看內容，兩欄各 300px。時刻表仍然是 400px 寬，於是超出自己的格子、蓋到第二格上面；這是內容本身的問題，要在那一格上處理，例如加上 `overflow: auto` 讓它在格子裡捲動。' },
        { type: 'table', head: ['寫法', '意思', '常見用途'], rows: [
          ['`minmax(200px, 1fr)`', '至少 200px；有剩餘空間時分一份', '不能太窄的側欄、卡片的欄'],
          ['`minmax(0, 1fr)`', '純粹照比例分，不管內容多寬', '一定要等寬的欄'],
          ['`minmax(100px, auto)`', '至少 100px；內容比較多時跟著長大', '列高：短的內容也有基本高度'],
          ['`1fr`', '等於 `minmax(auto, 1fr)`：照比例分，但不會比內容的最小寬度窄', '內容都是一般文字的欄'],
        ] },
        { type: 'callout', tone: 'warning', title: '1fr 不保證等寬', text: '寫了 `repeat(3, 1fr)`，其中一欄卻比較寬，或是頁面在手機上多出水平捲軸，原因多半是某一格裡有不能縮小的內容，把那條軌道撐開了。在範例按 360 按鈕就看得到：`#blown` 的第一欄仍然是 400px，第二欄（綠色底線那一格）整個被推到頁面外面；`#fixed` 的兩欄各 180px，都還在頁面裡。需要嚴格等寬時寫 `repeat(3, minmax(0, 1fr))`；另一種做法是在那個項目上寫 `min-width: 0`，效果相同。還有兩個寫法上的限制：`fr` 只能放在上限，`minmax(1fr, 200px)` 是無效的；上限比下限小的時候，上限會被忽略，軌道就等於下限。' },
        { type: 'callout', tone: 'tip', title: '動手試：讓太寬的內容在格子裡捲動', text: '在範例的 CSS 最後加上 `#fixed .a { overflow: auto; }` 再執行：時刻表不再蓋到第二格，而是在 300px 的格子裡出現水平捲軸。再把 `#share` 的 `minmax(200px, 1fr)` 改成 `1fr`，按 600 按鈕：側欄沒有下限了，縮成 600 ÷ 4 = 150px。' },
      ],
    },
    {
      id: 'rwd06-auto-section', title: 'auto-fill 與 auto-fit：讓瀏覽器決定欄數',
      blocks: [
        { type: 'p', text: '`repeat(3, 1fr)` 把欄數寫死了。三欄在桌機上剛好，到了 360px 寬的手機，每欄只剩一百出頭，照片小得看不清楚；要在不同寬度換欄數，就得替每個寬度寫一段媒體查詢。其實你真正在意的不是「幾欄」，而是「每一欄不要比多少還窄」。把 `repeat()` 的次數換成關鍵字 `auto-fit`（或 `auto-fill`），再用 `minmax()` 說出最小欄寬，欄數就交給瀏覽器算：`repeat(auto-fit, minmax(160px, 1fr))` 的意思是「放進最多個至少 160px 的欄，再把剩下的寬度平分給它們」。' },
        { type: 'p', text: '欄數可以自己先算出來。n 欄之間有 n − 1 段間距，所以 n 欄最少需要 n × 最小欄寬 + (n − 1) × 間距 的寬度。整理之後：欄數 = (容器寬 + 間距) ÷ (最小欄寬 + 間距)，無條件捨去，最少 1 欄。欄數決定之後，每欄的寬度 = (容器寬 − (欄數 − 1) × 間距) ÷ 欄數。這裡的容器寬指的是容器的內容寬度。以最小欄寬 160px、間距 20px 為例：' },
        { type: 'table', head: ['容器寬', '(容器寬 + 20) ÷ 180', '欄數', '每欄的寬度'], rows: [
          ['360px', '2.11…', '2', '(360 − 20) ÷ 2 = 170px'],
          ['640px', '3.66…', '3', '(640 − 40) ÷ 3 = 200px'],
          ['1000px', '5.66…', '5', '(1000 − 80) ÷ 5 = 184px'],
        ] },
        { type: 'example', id: 'rwd06-auto-columns' },
        { type: 'p', text: '依序按 360、640、1000 三個按鈕，看最上面的 `#wall`：六張照片排成 2 欄、3 欄、5 欄（第六張換到第二列），每欄的寬度和上表算的一樣。樣式表裡沒有任何媒體查詢，也沒有任何一個和頁面寬度有關的數字。而且這條規則看的是容器的寬度，不是視窗的寬度：同一面牆放進比較窄的側欄，會自動用比較少的欄。' },
        { type: 'p', text: '`auto-fill` 與 `auto-fit` 算出來的欄數完全相同，差別只在「項目比欄數少」的時候。下面兩個格線各只有兩張照片。360px 時剛好 2 欄，兩者一模一樣。按 1000 按鈕：瀏覽器算出 5 欄，但只有兩個項目，後三欄是空的。`auto-fill`（填入）把空的欄留著：兩張照片各 184px，右邊一大片空白。`auto-fit`（貼合）把空的欄連同它們的間距收合成 0：剩下的兩欄平分整個寬度，各 (1000 − 20) ÷ 2 = 490px。' },
        { type: 'table', head: ['比較', 'auto-fill', 'auto-fit'], rows: [
          ['算出來的欄數', '相同', '相同'],
          ['沒有項目的欄', '保留，佔著位置', '收合成 0'],
          ['項目很少時', '維持原本的欄寬，靠起點排，後面留白', '拉寬到填滿整列'],
          ['項目排滿第一列之後', '看不出差別', '看不出差別'],
          ['適合', '卡片大小要一致，不希望只有一兩張時變得很寬', '內容要永遠填滿容器的寬度'],
        ] },
        { type: 'callout', tone: 'warning', title: '少了 minmax，或下限比容器還寬', text: '這個寫法有三個常見的錯。第一，寫成 `repeat(auto-fit, 1fr)`：瀏覽器需要一個確定的最小欄寬才算得出欄數，只有 `1fr` 是無效的宣告，整條被丟掉。第二，寫成 `repeat(auto-fit, 160px)`：欄數會自動增減，但每欄固定 160px 不會伸長，右邊常常留下一段空白。第三，下限比容器還寬：`minmax(300px, 1fr)` 放在 240px 寬的容器裡，仍然會有一欄 300px，超出容器、造成水平捲軸。下限要選最窄的畫面也放得下的數字；進階的寫法是 `minmax(min(300px, 100%), 1fr)`，讓下限不會超過容器本身的寬度。' },
        { type: 'callout', tone: 'tip', title: '動手試：換一個下限，先算再看', text: '把範例裡兩處的 `160px` 都改成 `220px`，先用公式算：360px 時 (360 + 20) ÷ 240 = 1.58…，1 欄，每欄 360px；640px 時 2.75，2 欄，每欄 (640 − 20) ÷ 2 = 310px；1000px 時 4.25，4 欄，每欄 (1000 − 60) ÷ 4 = 235px。執行後按三個寬度按鈕，對照你的答案。' },
      ],
    },
    {
      id: 'rwd06-flow-section', title: '控制自動排列：grid-auto-rows 與 grid-auto-flow',
      blocks: [
        { type: 'p', text: '沒有指定位置的項目，由瀏覽器自動排列（auto-placement）：照原始碼的順序，一格一格填進格線；明確定義的列用完了，就自動產生新的列，叫做隱含列（implicit row）。圖片牆的欄數會變，列數也跟著變，沒辦法用 `grid-template-rows` 一列一列寫，所以要改用 `grid-auto-rows` 設定每一條隱含列的高度。沒有寫的時候是 `auto`，高度剛好包住內容；`grid-auto-rows: 50px` 讓每一條隱含列都是 50px；`grid-auto-rows: minmax(100px, auto)` 讓它們至少 100px，內容多的那一列再長高。' },
        { type: 'p', text: '`grid-auto-flow` 決定自動排列往哪個方向走，以及要不要回頭補空格：' },
        { type: 'table', head: ['grid-auto-flow 的值', '排法'], rows: [
          ['`row`（預設）', '一列一列排，由左到右；列不夠就新增隱含列'],
          ['`column`', '一欄一欄排，由上到下；欄不夠就新增隱含欄，寬度由 `grid-auto-columns` 決定'],
          ['`dense`（等於 `row dense`）', '一列一列排，但每個項目都從頭找第一個放得下的空格'],
          ['`column dense`', '一欄一欄排，同樣會回頭補空格'],
        ] },
        { type: 'p', text: '`column` 的例子：容器寫了 `grid-template-rows: repeat(2, 50px); grid-auto-flow: column; grid-auto-columns: 100px;`，裡面有六個項目。項目由上到下填滿兩列就換下一欄：1、2 在第一欄，3、4 在第二欄（左緣在 100px），5、6 在第三欄（左緣在 200px）。' },
        { type: 'p', text: '什麼時候會有空格？當項目跨了好幾格的時候。RWD05 學過 `grid-column: span 2` 讓項目佔兩欄。預設的排法只往前走、不回頭：下一個項目在這一列剩下的位置放不下，就換到下一列，剩下的位置就空在那裡。' },
        { type: 'example', id: 'rwd06-dense' },
        { type: 'p', text: '先看上面的格線，一步一步排：1 在第一列第 1 欄；2 佔兩欄，在第 2、3 欄；3 也要兩欄，但第一列只剩第 4 欄一格，只好換到第二列，第一列的最後一格就空了。4 接在 3 後面；5 又放不下，換到第三列，第二列的最後一格也空了。結果是三列，第一列與第二列的最後一格各留下一個洞。下面的格線只多了 `grid-auto-flow: dense`：瀏覽器替每個項目都從頭找起，4 補上第一列的洞（左緣在 3 × 80 = 240px），5 補進第二列的第 3、4 欄，6 排到第三列。洞不見了，但畫面上的順序變成 1、2、4、3、5、6。兩個格線都沒有寫 `grid-template-rows`，每一列 50px 來自 `grid-auto-rows`。' },
        { type: 'callout', tone: 'warning', title: 'dense 會打亂畫面上的順序', text: '`dense` 改變的只有畫面：鍵盤的 Tab 順序與螢幕閱讀器的朗讀順序仍然照 HTML。項目裡有連結或按鈕時，焦點會在畫面上跳來跳去；內容的順序有意義時（步驟、排行榜、依時間排列的消息），看的人也會讀錯順序。`dense` 只適合順序不重要的內容，例如裝飾性的圖片牆。另外，在 `auto-fit` 的格線裡用 `span 2` 要小心窄的畫面：只排得下一欄時，跨兩欄的項目仍然需要第二欄，瀏覽器會多產生一條隱含欄，後面的項目可能被排進去而擠成很窄。要用跨欄，就確定最窄的畫面也至少有兩欄，或只在夠寬的斷點才讓項目跨欄。' },
        { type: 'callout', tone: 'tip', title: '動手試：沒有洞，就沒有東西可補', text: '把範例裡 `.board .wide` 的 `span 2` 改成 `span 3`，先預測再執行：1 與 2 剛好排滿第一列（1 + 3 = 4 欄），3 與 4 排滿第二列，5 與 6 排滿第三列。沒有任何一格空著，所以兩個格線變得一模一樣。`dense` 只有在有洞的時候才會改變排法。' },
      ],
    },
    {
      id: 'rwd06-choose-section', title: '這一課的寫法整理，以及 Grid 與 Flexbox 怎麼選',
      blocks: [
        { type: 'p', text: '把這一課的工具整理成一張表。遇到版面的需求時，先想它屬於哪一列：' },
        { type: 'table', head: ['想做的事', '寫法'], rows: [
          ['用一張圖描述整頁的版面', '容器寫 `grid-template-areas`，每個項目寫 `grid-area`'],
          ['在斷點換成另一個版面', '媒體查詢裡只重新定義容器的 `grid-template-columns` 與 `grid-template-areas`'],
          ['側欄不能比 200px 窄', '`minmax(200px, 1fr)`'],
          ['幾欄一定要等寬', '`repeat(3, minmax(0, 1fr))`'],
          ['欄數隨容器的寬度自動增減', '`repeat(auto-fit, minmax(160px, 1fr))`，卡片大小要一致時改用 `auto-fill`'],
          ['不知道有幾列，但每列要有基本高度', '`grid-auto-rows: minmax(100px, auto)`'],
          ['補滿跨欄造成的空格', '`grid-auto-flow: dense`，只用在順序不重要的內容'],
        ] },
        { type: 'p', text: '再練習一次欄數的公式：容器寬 500px，寫了 `gap: 10px` 與 `grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))`。欄數是 (500 + 10) ÷ (120 + 10) = 3.92…，無條件捨去是 3 欄；每欄 (500 − 20) ÷ 3 = 160px。如果只有兩個項目，`auto-fill` 的兩個項目各 160px，第三欄空著；換成 `auto-fit`，兩個項目各 (500 − 10) ÷ 2 = 245px。' },
        { type: 'p', text: '除了 Grid，CSS 還有另一種排版方式 Flexbox（RWD03、RWD04 的主題）。兩者的出發點不同：Grid 從容器出發，先定義欄與列，再把項目放進格子，一次管兩個方向；Flexbox 從項目出發，把一排項目依各自的大小排開，一次只管一個方向。它們不互相排斥：整頁用 Grid 分區，區域裡的一排按鈕用 Flexbox，是很常見的組合。' },
        { type: 'table', head: ['情況', '比較適合'], rows: [
          ['整頁的版面：頁首、側欄、主內容、頁尾', 'Grid（命名區域）'],
          ['一批卡片要同時對齊成欄與列', 'Grid（`auto-fit` 配 `minmax()`）'],
          ['一排長短不一的項目：導覽連結、按鈕、標籤', 'Flexbox'],
          ['只有一個方向，項目的大小由自己的內容決定', 'Flexbox'],
        ] },
        { type: 'p', text: '檢查實際的頁面時，開發者工具的 Elements 面板會在 grid 容器的標籤旁邊顯示一個 `grid` 標記；點選它，頁面上會畫出格線與每一條軌道的範圍，空的格子與隱含的軌道一眼就看得出來。想多試幾種模板與 `minmax()` 的組合，可以到互動實驗島的 CSS Grid 練習場，調整數值並立刻看到格線的變化。' },
        { type: 'callout', tone: 'note', title: '這一課沒有用到媒體查詢的地方', text: '圖片牆的欄數是瀏覽器用容器的寬度算出來的，所以同一段 CSS 放在整頁、放在側欄、放在任何寬度的容器裡都成立。整頁的版面要不要出現側欄，則是「視窗夠不夠寬」的問題，那才是媒體查詢該管的事。兩種做法各管一層：頁面的骨架用模板與斷點，骨架裡的卡片用 `auto-fit` 與 `minmax()`。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'rwd06-q1', prompt: '下面四個 `grid-template-areas` 的值，哪一個是有效的？',
      options: [
        '`"header header" "nav header"`',
        '`"header" "nav main"`',
        '`"header header" "nav main" "nav footer"`',
        '`"nav main" "main nav"`',
      ],
      answer: 2,
      explanation: '第三個值的每一列都是兩格，`header` 橫跨第一列、`nav` 直跨第二與第三列，每個區域都是矩形，所以有效。第一個值的 `header` 是 L 形，不是矩形；第二個值兩列的格數不同（1 格與 2 格）；第四個值的 `nav` 與 `main` 各出現在不相連的兩處，一個名字只能圍出一塊。後三種都會讓整條宣告無效，而且瀏覽器不會提示。',
    },
    {
      id: 'rwd06-q2', prompt: '套用 `grid-area: main` 的項目有多寬？',
      code: { language: 'CSS', text: '.page {\n  display: grid;\n  width: 800px;\n  gap: 20px;\n  grid-template-columns: 200px 1fr;\n  grid-template-areas:\n    "header header"\n    "side   main";\n}' },
      options: ['580px', '600px', '800px', '400px'],
      answer: 0,
      explanation: '`main` 在第二列的第二格，寬度就是第二欄的寬度。第一欄固定 200px，兩欄之間有 20px 的間距，`1fr` 拿走剩下的 800 − 200 − 20 = 580px。600px 是忘了扣掉間距；800px 是橫跨兩欄的 `header` 的寬度；400px 是把兩欄當成平分。模板只決定項目放在哪一格，格子多寬仍然由 `grid-template-columns` 決定。',
    },
    {
      id: 'rwd06-q3', prompt: '容器寬 600px，裡面有六張卡片。會排成幾欄，每欄多寬？',
      code: { language: 'CSS', text: '.cards {\n  display: grid;\n  gap: 20px;\n  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));\n}' },
      options: ['3 欄，每欄 200px', '3 欄，每欄約 186.67px', '2 欄，每欄 200px', '2 欄，每欄 290px'],
      answer: 3,
      explanation: '欄數是 (600 + 20) ÷ (200 + 20) = 2.81…，無條件捨去是 2 欄；每欄 (600 − 20) ÷ 2 = 290px。3 欄各 200px 是忘了間距：三欄加兩段間距要 640px，放不下。3 欄各 186.67px 違反了下限 200px。2 欄各 200px 是忘了上限 `1fr` 會把剩下的寬度平分給每一欄。',
    },
    {
      id: 'rwd06-q4', prompt: '容器寬 860px，裡面只有兩張卡片。把這段 CSS 的 `auto-fill` 改成 `auto-fit`，每張卡片的寬度有什麼變化？',
      code: { language: 'CSS', text: '.cards {\n  display: grid;\n  gap: 20px;\n  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));\n}' },
      options: ['沒有變化，都是 200px', '從 200px 變成 420px', '從 420px 變成 200px', '從 200px 變成 430px'],
      answer: 1,
      explanation: '兩個關鍵字算出來的欄數相同：(860 + 20) ÷ 220 = 4 欄，每欄 (860 − 60) ÷ 4 = 200px。`auto-fill` 保留空的兩欄，卡片各 200px；`auto-fit` 把空的欄連同間距收合，兩張卡片平分 860 − 20 = 840px，各 420px。「沒有變化」只有在卡片排滿第一列時才成立；420px 變 200px 是把兩者記反了；430px 是忘了兩張卡片之間還有一段 20px 的間距。',
    },
    {
      id: 'rwd06-q5', prompt: '容器寬 600px，寫了 `grid-template-columns: 1fr 1fr`，沒有間距。第一格裡有一個寫了 `width: 400px` 的表格區塊，第二格只有幾個字。兩欄各多寬？',
      options: [
        '300px 與 300px：`1fr` 永遠平分，表格超出自己的格子',
        '400px 與 200px：`1fr` 的下限是 `auto`，軌道不會比內容的最小寬度窄',
        '400px 與 300px：第一欄被撐開，第二欄維持一半，整個格線超出容器',
        '600px 與 0px：內容比較寬的那一欄會佔滿整個容器',
      ],
      answer: 1,
      explanation: '`1fr` 等於 `minmax(auto, 1fr)`，下限 `auto` 讓軌道不能比內容的最小寬度窄：第一欄被撐到 400px，第二欄拿剩下的 200px。300px 與 300px 是寫成 `minmax(0, 1fr)` 才有的結果。第二欄不會維持 300px，因為 `fr` 分的是扣掉第一欄之後剩下的空間，格線本身沒有超出容器。第一欄也只會被撐到內容需要的 400px，不會佔滿 600px。',
    },
    {
      id: 'rwd06-q6', prompt: '格線有三欄，寫了 `grid-auto-flow: dense`。裡面依序是 A、B、C、D 四個項目，其中 A 與 B 寫了 `grid-column: span 2`。C 會排在哪裡？',
      options: [
        '第二列的第三欄，接在 B 的後面',
        '第三列的第一欄',
        '第一列，和 A 疊在一起',
        '第一列的第三欄，補上 A 右邊的空格',
      ],
      answer: 3,
      explanation: 'A 佔第一列的第 1、2 欄；B 需要兩欄，第一列只剩一格，換到第二列的第 1、2 欄，第一列的第三欄空了下來。`dense` 讓 C 從頭找第一個放得下的位置，所以補上第一列的第三欄，D 再補上第二列的第三欄。「接在 B 的後面」是沒有寫 `dense` 時的結果；C 不會跑到第三列，因為前面還有空格；自動排列也不會讓項目重疊。畫面上的順序變成 A、C、B、D，但 Tab 與螢幕閱讀器的順序仍然是 A、B、C、D。',
    },
    {
      id: 'rwd06-q7', prompt: '格線裡有六個項目，每個項目的內容都只有一行文字。第三列有多高？',
      code: { language: 'CSS', text: '.list {\n  display: grid;\n  grid-template-columns: repeat(2, 1fr);\n  grid-template-rows: 80px;\n  grid-auto-rows: minmax(100px, auto);\n}' },
      options: ['100px', '80px', '一行文字的高度', '0px，因為沒有定義第三列'],
      answer: 0,
      explanation: '六個項目排成兩欄，需要三列。`grid-template-rows: 80px` 只定義了第一列；第二、第三列是自動產生的隱含列，高度由 `grid-auto-rows` 決定：`minmax(100px, auto)` 是至少 100px、內容更多時才長高，一行文字不到 100px，所以是 100px。80px 只是第一列的高度；「一行文字的高度」是沒有寫 `grid-auto-rows`（預設 `auto`）時的結果；項目排不下時瀏覽器會自動產生新的列，不會是 0px。',
    },
    {
      id: 'rwd06-q8', prompt: '頁面用命名區域排版：四個項目各有自己的 `grid-area`，容器的基本樣式是一欄的模板。要在寬度至少 700px 時改成「側欄在左、主內容在右」的兩欄版面，媒體查詢裡最少要寫什麼？',
      options: [
        '把四個項目的 `grid-area` 都改成新的格線編號',
        '在容器加上 `grid-auto-flow: column`，區域就會自動排成兩欄',
        '只改容器：重新定義 `grid-template-areas`，並用 `grid-template-columns` 給出兩欄的寬度',
        '只改容器的 `grid-template-columns`，模板會自動跟著變成兩欄',
      ],
      answer: 2,
      explanation: '項目是用名字認領區域的，名字在兩種版面都一樣，所以媒體查詢裡只要替容器換一張圖（`grid-template-areas`），再用 `grid-template-columns` 說明兩欄各多寬。項目的 `grid-area` 不必改，這正是命名區域比格線編號方便的地方。`grid-auto-flow` 只影響沒有指定位置的項目，有名字的項目不受它影響。只改 `grid-template-columns` 也不夠：模板仍然是一欄四列的那張圖，區域不會自己重新安排。',
    },
  ],
  webCode: {
    examples: [areas, areasResponsive, minmaxTracks, autoColumns, dense],
    exercises: [exAreas, exResponsive, exWall, exDense],
  },
};
