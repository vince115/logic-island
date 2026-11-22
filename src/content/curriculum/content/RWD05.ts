import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD05 CSS Grid basics: the grid container, column and row tracks, the fr unit, gap, auto-placement with implicit rows,
 * line-based placement (grid-column / grid-row, span, 1 / -1) and alignment inside a cell (RWD-2). A web-code lesson of
 * HTML and CSS only: every page of the made-up 小島圖書館／小島商店 has tracks whose sizes follow from explicit numbers
 * (px tracks, fr shares of a known width, gaps), so the facts under it are measured in Chromium, two pages at two
 * viewport widths. The exercises fix the HTML; the learner edits style.css and is checked on `display` and on box
 * sizes and positions, three of them at two widths (`resize`), two with another container or another number of items.
 * The page layout uses one min-width media query (base: one column). Named areas, auto-fit/auto-fill, minmax() and
 * grid-auto-flow are RWD06 and are not taught here.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const SHELF_ITEMS = String.raw`  <div>小說</div>
  <div>科普</div>
  <div>繪本</div>
  <div>歷史</div>
  <div>旅遊</div>
  <div>漫畫</div>`;

const container: WebExample = {
  id: 'rwd05-container', title: '同樣的六個分類：一般排版流與 grid 容器',
  description: '小島圖書館的六個分類，兩份 HTML 完全相同，容器都寬 300px。下面那一份的容器多了 `display: grid` 與 `grid-template-columns: 100px 100px 100px`，六個 `div` 成為 grid 項目。',
  files: {
    html: `<div class="shelf" id="plain">\n${SHELF_ITEMS}\n</div>\n<div class="shelf" id="grid">\n${SHELF_ITEMS}\n</div>`,
    css: String.raw`body { margin: 0; }
.shelf {
  width: 300px;
  margin-bottom: 16px;
  background-color: #e3f2fd;
}
.shelf div {
  box-sizing: border-box;
  height: 40px;
  border: 1px solid #1565c0;
  background-color: #90caf9;
}
#grid {
  display: grid;
  grid-template-columns: 100px 100px 100px;
}`,
  },
  observe: [
    { check: 'box', selector: '#plain div', measure: 'width', value: 300, label: '上面的容器在一般排版流裡：每個 `div` 是區塊，填滿 300px、各佔一列' },
    { check: 'style', selector: '#grid', property: 'display', value: 'grid', label: '下面的容器的 `display` 計算後是 `grid`：它是 grid 容器' },
    { check: 'box', selector: '#grid div:nth-child(2)', measure: 'left', value: 100, from: '#grid', label: '第二個項目排在第二欄：左緣在容器左緣往右 100px' },
    { check: 'box', selector: '#grid div:nth-child(4)', measure: 'left', value: 0, from: '#grid', label: '三欄排滿之後，第四個項目回到第一欄（左緣在 0px）' },
    { check: 'box', selector: '#grid div:nth-child(4)', measure: 'top', value: 40, from: '#grid', label: '第四個項目自動排到第二列：上緣在第一列的 40px 之下' },
  ],
};

const tracks: WebExample = {
  id: 'rwd05-fr', title: 'px、fr 與 repeat：三種欄的寫法',
  description: '三個 grid 容器都沒有寫寬度，所以和頁面一樣寬；每個容器上方的文字就是它的欄的寫法。`#fixed` 是 `200px 1fr`，`#ratio` 是 `1fr 2fr 1fr` 加上 20px 的間距，`#equal` 是 `repeat(3, 1fr)` 加上 12px 的間距。',
  widths: [600, 360],
  files: {
    html: String.raw`<p>200px 1fr</p>
<div class="grid" id="fixed"><div>200px</div><div>1fr</div></div>
<p>1fr 2fr 1fr，間距 20px</p>
<div class="grid" id="ratio"><div>1fr</div><div>2fr</div><div>1fr</div></div>
<p>repeat(3, 1fr)，間距 12px</p>
<div class="grid" id="equal"><div>1fr</div><div>1fr</div><div>1fr</div></div>`,
    css: String.raw`body { margin: 0; }
p { margin: 8px 0 2px; font-size: 13px; }
.grid {
  display: grid;
  background-color: #e3f2fd;
}
.grid div {
  height: 36px;
  line-height: 36px;
  text-align: center;
  background-color: #90caf9;
}
.grid div:nth-child(2) { background-color: #ffe082; }
#fixed { grid-template-columns: 200px 1fr; }
#ratio { grid-template-columns: 1fr 2fr 1fr; gap: 20px; }
#equal { grid-template-columns: repeat(3, 1fr); gap: 12px; }`,
  },
  observe: [
    { check: 'box', selector: '#fixed div:nth-child(2)', measure: 'width', value: 400, label: '頁面寬 600px：`200px 1fr` 的第二欄拿走剩下的 600 − 200 = 400px' },
    { check: 'box', selector: '#ratio div:nth-child(2)', measure: 'width', value: 280, label: '頁面寬 600px：`1fr 2fr 1fr` 扣掉兩段 20px 的間距後分成 4 份，每份 140px，中間的 `2fr` 是 280px' },
    { check: 'box', selector: '#equal div:first-child', measure: 'width', value: 192, label: '頁面寬 600px：`repeat(3, 1fr)` 的每一欄是 (600 − 12 × 2) ÷ 3 = 192px' },
    { do: 'resize', width: 360 },
    { check: 'box', selector: '#fixed div:first-child', measure: 'width', value: 200, label: '頁面改成 360px 寬：寫 `200px` 的欄仍然是 200px' },
    { check: 'box', selector: '#fixed div:nth-child(2)', measure: 'width', value: 160, label: '頁面改成 360px 寬：`1fr` 的欄跟著縮成 360 − 200 = 160px' },
  ],
};

const autoPlacement: WebExample = {
  id: 'rwd05-auto', title: '七件商品自動排進三欄',
  description: '小島商店的商品格 `#shop` 寬 300px：三個 `1fr` 的欄，只定義了一列 60px 的列，`gap: 10px 15px`，另外用 `grid-auto-rows: 40px` 決定自動長出來的列有多高。七個項目都沒有指定位置。',
  files: {
    html: String.raw`<div id="shop">
  <div>椰子餅乾</div>
  <div>鳳梨乾</div>
  <div>海鹽糖</div>
  <div>芒果茶</div>
  <div>貝殼皂</div>
  <div>明信片</div>
  <div>帆布袋</div>
</div>`,
    css: String.raw`body { margin: 0; }
#shop {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: 60px;
  grid-auto-rows: 40px;
  gap: 10px 15px;
  width: 300px;
  background-color: #e3f2fd;
}
#shop div {
  font-size: 14px;
  background-color: #90caf9;
}`,
  },
  observe: [
    { check: 'style', selector: '#shop', property: 'row-gap', value: '10px', label: '`gap: 10px 15px` 的第一個值是列與列之間的間距（`row-gap` 計算後是 10px）' },
    { check: 'box', selector: '#shop div:nth-child(2)', measure: 'left', value: 105, from: '#shop', label: '每欄寬 (300 − 15 × 2) ÷ 3 = 90px，第二個項目的左緣在 90 + 15 = 105px' },
    { check: 'box', selector: '#shop div:nth-child(4)', measure: 'top', value: 70, from: '#shop', label: '第四個項目排到第二列：上緣在 60（第一列）+ 10（間距）= 70px' },
    { check: 'box', selector: '#shop div:nth-child(4)', measure: 'height', value: 40, label: '第二列是自動長出來的列，高度由 `grid-auto-rows` 決定：40px' },
    { check: 'box', selector: '#shop div:nth-child(7)', measure: 'top', value: 120, from: '#shop', label: '第七個項目獨自排在第三列：上緣在 70 + 40 + 10 = 120px' },
  ],
};

const placement: WebExample = {
  id: 'rwd05-place', title: '用格線編號放置項目',
  description: '`#board` 有四個 70px 的欄、三個 50px 的列，間距 10px。A、B、C 用 `grid-column` 與 `grid-row` 指定位置；D 沒有指定位置，只設定了自己的大小（30 × 20px）與在格子裡的對齊方式。',
  files: {
    html: String.raw`<div id="board">
  <div id="a">A</div>
  <div id="b">B</div>
  <div id="c">C</div>
  <div id="d">D</div>
</div>`,
    css: String.raw`body { margin: 0; }
#board {
  display: grid;
  grid-template-columns: repeat(4, 70px);
  grid-template-rows: repeat(3, 50px);
  gap: 10px;
  width: 310px;
  background-color: #e3f2fd;
}
#a { grid-column: 1 / 3; grid-row: 1; background-color: #90caf9; }
#b { grid-column: 3 / -1; grid-row: 1 / 3; background-color: #ffe082; }
#c { grid-column: 1 / -1; grid-row: 3; background-color: #a5d6a7; }
#d {
  width: 30px;
  height: 20px;
  justify-self: end;
  align-self: center;
  font-size: 12px;
  line-height: 20px;
  background-color: #ef9a9a;
}`,
  },
  observe: [
    { check: 'box', selector: '#a', measure: 'width', value: 150, label: 'A 從第 1 條直線到第 3 條直線：佔兩欄，寬 70 + 10 + 70 = 150px（中間的間距也算在內）' },
    { check: 'box', selector: '#b', measure: 'height', value: 110, label: 'B 的 `grid-row: 1 / 3` 佔兩列：高 50 + 10 + 50 = 110px' },
    { check: 'box', selector: '#c', measure: 'width', value: 310, label: 'C 的 `grid-column: 1 / -1` 從第一條線到最後一條線：橫跨四欄，寬 310px' },
    { check: 'box', selector: '#d', measure: 'left', value: 40, from: '#board', label: 'D 自動排進第一個空格（第二列第一欄），`justify-self: end` 讓它靠格子的右緣：左緣在 70 − 30 = 40px' },
    { check: 'box', selector: '#d', measure: 'top', value: 75, from: '#board', label: 'D 的 `align-self: center` 讓它在高 50px 的格子裡垂直置中：上緣在 60 + (50 − 20) ÷ 2 = 75px' },
  ],
};

const pageLayout: WebExample = {
  id: 'rwd05-page', title: '小島圖書館的頁面：一欄變兩欄',
  description: '`#page` 是 grid 容器，裡面依序是頁首、側欄、內容區與頁尾。基本樣式只有一欄；視窗寬度至少 600px 時，媒體查詢把它改成 `200px 1fr` 兩欄，並讓頁首與頁尾橫跨所有的欄。',
  widths: [360, 800],
  viewport: { width: 360, height: 400 },
  files: {
    html: String.raw`<div id="page">
  <header id="top">小島圖書館</header>
  <nav id="side">
    <a href="#novel">小說</a>
    <a href="#science">科普</a>
  </nav>
  <main id="content">
    <a href="#new">本週新書</a>
  </main>
  <footer id="bottom">開放時間 9:00–17:00</footer>
</div>`,
    css: String.raw`body { margin: 0; }
#page {
  display: grid;
  grid-template-rows: 48px 80px 160px 48px;
  gap: 8px;
}
#top, #bottom { background-color: #1565c0; color: white; }
#side { background-color: #ffe082; }
#content { background-color: #bbdefb; }
@media (min-width: 600px) {
  #page {
    grid-template-columns: 200px 1fr;
    grid-template-rows: 48px 160px 48px;
  }
  #top, #bottom { grid-column: 1 / -1; }
}`,
  },
  observe: [
    { check: 'box', selector: '#side', measure: 'width', value: 360, label: '頁面寬 360px：只有一欄，側欄和頁面一樣寬' },
    { check: 'box', selector: '#content', measure: 'top', value: 144, from: '#page', label: '頁面寬 360px：內容區排在側欄下面，上緣在 48 + 8 + 80 + 8 = 144px' },
    { do: 'resize', width: 800 },
    { check: 'box', selector: '#top', measure: 'width', value: 800, label: '頁面改成 800px 寬：頁首橫跨兩欄，寬 800px' },
    { check: 'box', selector: '#content', measure: 'left', value: 208, from: '#page', label: '頁面寬 800px：內容區排到側欄的右邊，左緣在 200 + 8 = 208px' },
    { check: 'box', selector: '#content', measure: 'width', value: 592, label: '頁面寬 800px：`1fr` 的內容區拿走剩下的 800 − 200 − 8 = 592px' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const SHELF_HTML = String.raw`<div id="shelf">
  <div class="book">島上的星空</div>
  <div class="book">潮間帶散步</div>
  <div class="book">燈塔日記</div>
  <div class="book">椰子樹下</div>
  <div class="book">海風食譜</div>
  <div class="book">小船與貓</div>
</div>`;

const BOOK_CSS = String.raw`.book {
  box-sizing: border-box;
  height: 60px;
  border: 1px solid #1565c0;
  background-color: #bbdefb;
}`;

const shelfCss = (declarations: string) => `body { margin: 0; }\n#shelf {\n${declarations}  width: 320px;\n  background-color: #e3f2fd;\n}\n${BOOK_CSS}`;

const exThreeColumns: WebExercise = {
  id: 'rwd05-ex-three-columns', title: '把書卡排成三個一樣寬的欄',
  statement: 'index.html 不能改。書架 `#shelf` 寬 320px，裡面有六張高 60px 的書卡 `.book`，現在一張疊一張。這一題練習 Grid：請在 `#shelf` 的規則裡加上宣告，讓它成為 grid 容器，把書卡排成三個一樣寬的欄，欄與欄、列與列之間都相隔 10px。動手前先算：每一欄寬 (320 − 10 × 2) ÷ 3 = 100px；第二張書卡的左緣在 110px；第四張換到第二列，上緣在 60 + 10 = 70px。三欄要平分書架的寬度，不能把欄寬寫死：檢查還會換一個 440px 寬的書架再量一次。`body { margin: 0; }`、書架的寬度與書卡的高度要保留。',
  hints: [
    '需要三條宣告，都寫在容器 `#shelf` 上：一條讓它成為 grid 容器，一條定義三個欄，一條決定間距。',
    '「一樣寬、而且平分剩下的空間」的欄要用 fr 單位；百分比不會替間距留位置，寫死的 px 換一個書架就不對了。',
    '在 `#shelf` 的規則裡加上 `display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;`。',
  ],
  explanation: '`display: grid` 讓 `#shelf` 成為 grid 容器，六張書卡成為 grid 項目。`grid-template-columns: repeat(3, 1fr)` 定義三個欄的軌道，寫成 `1fr 1fr 1fr` 也一樣：書架的 320px 先扣掉兩段 10px 的間距，剩下的 300px 分成 3 份，每份 100px。書卡依原始碼的順序自動填進格子：前三張在第一列，第四張回到第一欄、排在第二列。沒有寫 `grid-template-rows`，列是自動長出來的，高度就是書卡的 60px，加上 10px 的列間距，第二列的上緣在 70px。書架換成 440px 時，同一份樣式算出 (440 − 20) ÷ 3 = 140px 的欄。',
  fixed: { html: SHELF_HTML },
  starter: { css: shelfCss('') },
  solution: { css: shelfCss('  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 10px;\n') },
  steps: [
    { check: 'style', selector: '#shelf', property: 'display', value: ['grid', 'inline-grid'], label: '`#shelf` 是 grid 容器' },
    { check: 'box', selector: '.book:first-child', measure: 'width', value: 100, label: '每一欄寬 100px：第一張書卡寬 100px' },
    { check: 'box', selector: '.book:nth-child(2)', measure: 'left', value: 110, from: '#shelf', label: '第二張書卡在第二欄：左緣在書架左緣往右 110px' },
    { check: 'box', selector: '.book:nth-child(4)', measure: 'left', value: 0, from: '#shelf', label: '第四張書卡回到第一欄：左緣貼齊書架的左緣' },
    { check: 'box', selector: '.book:nth-child(4)', measure: 'top', value: 70, from: '#shelf', label: '第四張書卡在第二列：上緣在書架上緣往下 70px' },
  ],
  mistakes: [
    { files: { css: shelfCss('  grid-template-columns: repeat(3, 1fr);\n  gap: 10px;\n') }, why: '定義了欄與間距，卻忘了 `display: grid`。`#shelf` 還是一般的區塊，`grid-template-columns` 對它沒有作用，瀏覽器也不會提示錯誤，書卡照樣一張疊一張。' },
    { files: { css: shelfCss('  display: grid;\n  grid-template-columns: 33.33% 33.33% 33.33%;\n  gap: 10px;\n') }, why: '用百分比平分三欄。百分比算的是整個書架的寬度，不會扣掉間距：每欄 106.66px，三欄加上兩段間距共 340px，比 320px 的書架多出 20px，最後一欄凸到外面。會扣掉間距再平分的是 fr 單位。' },
    { files: { css: shelfCss('  display: grid;\n  grid-template-columns: 100px 100px 100px;\n  gap: 10px;\n') }, why: '把算出來的 100px 直接寫死。在 320px 的書架裡看起來正確，書架換成 440px（另一份檢查）時，三欄仍然各 100px，右邊空了一大塊。`1fr` 會在容器變寬時重新分配。' },
  ],
  variants: [{
    title: '書架換成 440px 寬，三欄仍然一樣寬並填滿書架',
    fixed: { html: SHELF_HTML.replace('<div id="shelf">', '<div id="shelf" style="width: 440px;">') },
    steps: [
      { check: 'box', selector: '.book:first-child', measure: 'width', value: 140, label: '寬 440px 時，每一欄寬 140px' },
      { check: 'box', selector: '.book:nth-child(3)', measure: 'left', value: 300, from: '#shelf', label: '寬 440px 時，第三張書卡的左緣在 300px' },
    ],
  }],
};

const SIDEBAR_BLOCKS_CSS = String.raw`#side { height: 120px; background-color: #ffe082; }
#content { height: 120px; background-color: #bbdefb; }`;

const exSidebar: WebExercise = {
  id: 'rwd05-ex-sidebar', title: '固定寬度的側欄，會伸縮的內容區',
  statement: 'index.html 不能改。`#layout` 沒有寫寬度，所以和頁面一樣寬；裡面是側欄 `#side` 與內容區 `#content`，現在上下疊在一起。這一題練習 Grid：請讓 `#layout` 成為 grid 容器，排成兩欄：`#side` 在左邊，寬度固定 200px；`#content` 在右邊，拿走剩下的全部寬度；兩欄之間相隔 20px。先算：頁面寬 600px 時，`#content` 的左緣在 220px、寬 600 − 200 − 20 = 380px；頁面寬 1000px 時寬 780px。檢查會在 600px 與 1000px 兩種頁面寬度各量一次（預覽上方的按鈕可以切換）。`body { margin: 0; }` 與兩個區塊的高度要保留。',
  hints: [
    '兩個欄的寬度都寫在容器的 `grid-template-columns` 裡，不是寫在 `#side` 或 `#content` 上。',
    '固定的那一欄用 px；「剩下的全部」用 `1fr`。兩欄之間的空白用 `gap`。',
    '在 `#layout` 的規則裡寫 `display: grid; grid-template-columns: 200px 1fr; gap: 20px;`。',
  ],
  explanation: '`grid-template-columns: 200px 1fr` 定義兩個欄的軌道：第一欄固定 200px，第二欄是 `1fr`。fr 單位分的是剩下的空間：頁面寬 600px 時，扣掉 200px 的側欄與 20px 的間距，`1fr` 是 380px；頁面寬 1000px 時是 780px。側欄不管頁面多寬都是 200px。兩個項目依原始碼的順序自動放進第一欄與第二欄，不必替它們指定位置，也不必替它們寫寬度：沒有設定寬度的 grid 項目會填滿自己的格子。',
  widths: [600, 1000],
  fixed: { html: String.raw`<div id="layout">
  <nav id="side">分類</nav>
  <main id="content">本週新書</main>
</div>` },
  starter: { css: `body { margin: 0; }\n#layout {\n  background-color: #e3f2fd;\n}\n${SIDEBAR_BLOCKS_CSS}` },
  solution: { css: `body { margin: 0; }\n#layout {\n  display: grid;\n  grid-template-columns: 200px 1fr;\n  gap: 20px;\n  background-color: #e3f2fd;\n}\n${SIDEBAR_BLOCKS_CSS}` },
  steps: [
    { check: 'style', selector: '#layout', property: 'display', value: ['grid', 'inline-grid'], label: '`#layout` 是 grid 容器' },
    { check: 'box', selector: '#side', measure: 'width', value: 200, label: '頁面寬 600px：`#side` 寬 200px' },
    { check: 'box', selector: '#content', measure: 'left', value: 220, from: '#layout', label: '頁面寬 600px：`#content` 在側欄右邊、相隔 20px（左緣在 220px）' },
    { check: 'box', selector: '#content', measure: 'width', value: 380, label: '頁面寬 600px：`#content` 拿走剩下的 380px' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#side', measure: 'width', value: 200, label: '頁面寬 1000px：`#side` 仍然是 200px' },
    { check: 'box', selector: '#content', measure: 'width', value: 780, label: '頁面寬 1000px：`#content` 變成 780px' },
  ],
  mistakes: [
    { files: { css: `body { margin: 0; }\n#layout {\n  display: grid;\n  grid-template-columns: 200px 380px;\n  gap: 20px;\n  background-color: #e3f2fd;\n}\n${SIDEBAR_BLOCKS_CSS}` }, why: '照 600px 的頁面算出 380px，直接寫死。頁面寬 600px 時剛好，改成 1000px 時內容區仍然只有 380px，右邊空著 400px。「剩下的全部」要交給 `1fr`，讓瀏覽器在每個寬度重新計算。' },
    { files: { css: `body { margin: 0; }\n#layout {\n  display: grid;\n  grid-template-columns: 1fr 2fr;\n  gap: 20px;\n  background-color: #e3f2fd;\n}\n${SIDEBAR_BLOCKS_CSS}` }, why: '兩欄都用 fr。fr 是比例：頁面寬 600px 時側欄是 (600 − 20) ÷ 3 ≈ 193px，頁面寬 1000px 時變成約 327px，側欄跟著頁面一起變寬。要固定寬度的欄就寫固定的長度，只有要伸縮的欄用 fr。' },
    { files: { css: `body { margin: 0; }\n#layout {\n  display: grid;\n  gap: 20px;\n  background-color: #e3f2fd;\n}\n#side { width: 200px; height: 120px; background-color: #ffe082; }\n#content { height: 120px; background-color: #bbdefb; }` }, why: '沒有定義欄，改成替 `#side` 寫 `width: 200px`。少了 `grid-template-columns`，格線只有一欄：側欄變窄了，內容區卻仍然排在它的下面。有幾欄、每欄多寬，是在容器上用軌道決定的，不是靠項目自己的寬度。' },
  ],
};

const STORE_HTML = String.raw`<div id="page">
  <header id="top">小島商店</header>
  <main id="content">今日商品</main>
  <aside id="side">購物車</aside>
  <footer id="bottom">營業時間 10:00–18:00</footer>
</div>`;

const STORE_BASE_CSS = String.raw`body { margin: 0; }
#page {
  display: grid;
  gap: 10px;
}
#top, #bottom { height: 50px; background-color: #1565c0; color: white; }
#content { height: 120px; background-color: #bbdefb; }
#side { height: 120px; background-color: #ffe082; }`;

const storeCss = (outside: string, inside: string) => `${STORE_BASE_CSS}\n${outside}@media (min-width: 600px) {\n  #page { grid-template-columns: 1fr 200px; }\n${inside}}`;

const exPage: WebExercise = {
  id: 'rwd05-ex-page', title: '讓頁首與頁尾橫跨整個頁面',
  statement: 'index.html 不能改。小島商店的 `#page` 是 grid 容器，裡面依序是頁首 `#top`、內容區 `#content`、側欄 `#side`、頁尾 `#bottom`。樣式表已經寫好：窄畫面只有一欄，四個區塊由上往下排；視窗寬度至少 600px 時，媒體查詢把 `#page` 改成 `1fr 200px` 兩欄。可是寬畫面現在排錯了：四個區塊依序填進 2 × 2 的格子，頁首只佔左上角那一格。請加上放置的宣告，讓寬畫面變成三列：`#top` 橫跨兩欄，第二列是 `#content`（左）與 `#side`（右，寬 200px），`#bottom` 橫跨兩欄。窄畫面必須維持一欄。檢查會在 360px 與 800px 兩種頁面寬度各量一次；已經寫好的規則不要改。',
  hints: [
    '需要指定位置的只有頁首與頁尾：它們各自橫跨所有的欄之後，`#content` 與 `#side` 會自動排進中間那一列。',
    '橫跨所有的欄，是從第一條直的格線到最後一條：`grid-column` 的起始線寫 `1`，結束線可以用負數從尾端數。',
    '在媒體查詢裡加上 `#top, #bottom { grid-column: 1 / -1; }`。',
  ],
  explanation: '`grid-column: 1 / -1` 讓項目從第一條直的格線排到最後一條：兩欄的格線有三條直線，`-1` 就是第 3 條，所以頁首橫跨兩欄、寬 800px。頁首佔滿第一列之後，沒有指定位置的 `#content` 與 `#side` 依原始碼的順序自動排進第二列的第一欄與第二欄：`#content` 寬 800 − 200 − 10 = 590px，`#side` 的左緣在 600px。頁尾同樣橫跨兩欄，排在第三列。這條宣告寫在媒體查詢裡最清楚；寫在外面也可以，因為窄畫面沒有定義欄，`1 / -1` 在那裡只佔一欄。在媒體查詢裡寫 `grid-column: 1 / 3` 或 `grid-column: span 2` 也能通過，但欄數改變時要跟著改。',
  viewport: { width: 360, height: 400 },
  widths: [360, 800],
  fixed: { html: STORE_HTML },
  starter: { css: storeCss('', '') },
  solution: { css: storeCss('', '  #top, #bottom { grid-column: 1 / -1; }\n') },
  steps: [
    { check: 'box', selector: '#content', measure: 'width', value: 360, label: '頁面寬 360px：只有一欄，`#content` 和頁面一樣寬' },
    { check: 'box', selector: '#side', measure: 'top', value: 190, from: '#page', label: '頁面寬 360px：`#side` 排在 `#content` 的下面（上緣在 190px）' },
    { do: 'resize', width: 800 },
    { check: 'box', selector: '#top', measure: 'width', value: 800, label: '頁面寬 800px：`#top` 橫跨兩欄，寬 800px' },
    { check: 'box', selector: '#content', measure: 'top', value: 60, from: '#page', label: '頁面寬 800px：`#content` 在第二列（上緣在 60px）' },
    { check: 'box', selector: '#side', measure: 'left', value: 600, from: '#page', label: '頁面寬 800px：`#side` 在第二欄（左緣在 600px）' },
    { check: 'box', selector: '#bottom', measure: 'width', value: 800, label: '頁面寬 800px：`#bottom` 橫跨兩欄，寬 800px' },
  ],
  mistakes: [
    { files: { css: storeCss('', '  #top { grid-column: 1 / -1; }\n') }, why: '只處理了頁首。頁首橫跨兩欄之後，`#content` 與 `#side` 排進第二列，頁尾被自動放到第三列的第一欄：它只有一欄寬，右下角空著一格。頁尾也要自己寫 `grid-column`。' },
    { files: { css: storeCss('', '  #top, #bottom { grid-column: 1 / 2; }\n') }, why: '以為 `1 / 2` 是「第 1 欄到第 2 欄」。這兩個數字是格線的編號：第 1 條線到第 2 條線之間只有第一欄，所以畫面和沒寫一樣。兩欄的格線有三條直線，橫跨兩欄是 `1 / 3`，或不必數的 `1 / -1`。' },
    { files: { css: storeCss('#top, #bottom { grid-column: span 2; }\n', '') }, why: '把 `grid-column: span 2` 寫在媒體查詢外面。窄畫面本來只有一欄，頁首要求橫跨兩欄，瀏覽器只好多長出一欄：`#content` 與 `#side` 在 360px 的畫面上也被排成左右並排。和欄數有關的放置，要寫在定義了那些欄的媒體查詢裡，或改用 `1 / -1`。' },
  ],
};

const WALL_HTML = String.raw`<div id="wall">
  <div class="photo" id="feature">燈塔</div>
  <div class="photo">沙灘</div>
  <div class="photo">碼頭</div>
  <div class="photo">市集</div>
  <div class="photo">椰林</div>
  <div class="photo">夕陽</div>
</div>`;

const wallCss = (wall: string, photo: string, feature: string) => `body { margin: 0; }\n#wall {\n${wall}  background-color: #e3f2fd;\n}\n.photo {${photo} background-color: #90caf9; }\n#feature {${feature} background-color: #ffe082; }`;

const exWall: WebExercise = {
  id: 'rwd05-ex-wall', title: '相片牆：一張大圖，其餘自動排好',
  statement: 'index.html 不能改。相片牆 `#wall` 沒有寫寬度，和頁面一樣寬；裡面有六張相片 `.photo`，第一張是 `#feature`。這一題練習 Grid，請完成：（1）`#wall` 是 grid 容器，有三個一樣寬的欄；（2）欄與欄、列與列之間都相隔 12px；（3）每一列高 100px，不論相片有幾張；（4）`#feature` 佔左上角兩欄寬、兩列高的區域，其餘相片自動排進剩下的格子。先算：頁面寬 360px 時每欄是 (360 − 12 × 2) ÷ 3 = 112px，`#feature` 寬 112 × 2 + 12 = 236px、高 100 × 2 + 12 = 212px；第三張相片排在大圖的右邊、第二張的下面，左緣在 248px、上緣在 112px。頁面寬 600px 時每欄 192px，`#feature` 寬 396px。檢查會在 360px 與 600px 各量一次，還會換成八張相片再量一次，所以列的高度不能只寫給前三列。`body { margin: 0; }` 要保留。',
  hints: [
    '容器上需要四件事：成為 grid 容器、三個平分寬度的欄、間距，以及「每一列」的高度。相片的張數不固定時，列是自動長出來的。',
    '自動長出來的列的高度由 `grid-auto-rows` 決定。大圖不必指定從哪一條線開始：它本來就排第一個，只要說它橫跨幾欄、幾列（`span`）。',
    '`#wall` 寫 `display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 100px; gap: 12px;`，`#feature` 寫 `grid-column: span 2; grid-row: span 2;`。',
  ],
  explanation: '`repeat(3, 1fr)` 把扣掉兩段間距之後的寬度平分成三欄：頁面寬 360px 時每欄 112px，600px 時 192px。這一題沒有寫 `grid-template-rows`，每一列都是自動長出來的列，`grid-auto-rows: 100px` 讓它們全部是 100px，相片再多也一樣。`#feature` 的 `grid-column: span 2; grid-row: span 2` 只說橫跨幾個軌道，位置仍由自動放置決定：它是第一個項目，所以佔左上角的 2 × 2 區域，寬 112 + 12 + 112 = 236px、高 212px（跨過的間距也算在內）。其餘相片依原始碼的順序填進空格：第二張在第一列第三欄，第三張在第二列第三欄（左緣 248px、上緣 112px），第四張起排在第三列。寫成 `grid-column: 1 / 3; grid-row: 1 / 3` 結果相同。',
  viewport: { width: 360, height: 400 },
  widths: [360, 600],
  fixed: { html: WALL_HTML },
  starter: { css: wallCss('', '', '') },
  solution: { css: wallCss('  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  grid-auto-rows: 100px;\n  gap: 12px;\n', '', ' grid-column: span 2; grid-row: span 2;') },
  steps: [
    { check: 'style', selector: '#wall', property: 'display', value: ['grid', 'inline-grid'], label: '`#wall` 是 grid 容器' },
    { check: 'box', selector: '#feature', measure: 'width', value: 236, label: '頁面寬 360px：`#feature` 橫跨兩欄，寬 236px' },
    { check: 'box', selector: '#feature', measure: 'height', value: 212, label: '`#feature` 橫跨兩列，高 212px' },
    { check: 'box', selector: '.photo:nth-child(3)', measure: 'left', value: 248, from: '#wall', label: '頁面寬 360px：第三張相片在第三欄（左緣在 248px）' },
    { check: 'box', selector: '.photo:nth-child(3)', measure: 'top', value: 112, from: '#wall', label: '第三張相片在第二列，大圖的右邊（上緣在 112px）' },
    { do: 'resize', width: 600 },
    { check: 'box', selector: '#feature', measure: 'width', value: 396, label: '頁面寬 600px：`#feature` 寬 396px' },
  ],
  mistakes: [
    { files: { css: wallCss('  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  grid-auto-rows: 100px;\n  gap: 12px;\n', '', ' grid-column: span 2;') }, why: '只寫了 `grid-column: span 2`。大圖橫跨了兩欄，卻只有一列高（100px）：第三張相片排到第二列的第一欄，在大圖的下面而不是右邊。橫跨兩列要另外寫 `grid-row: span 2`，欄與列是分開指定的。' },
    { files: { css: wallCss('  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  grid-template-rows: repeat(3, 100px);\n  gap: 12px;\n', '', ' grid-column: span 2; grid-row: span 2;') }, why: '用 `grid-template-rows: repeat(3, 100px)` 定義了三列。六張相片剛好用完這三列，看起來正確；換成八張相片（另一份檢查）時，第四列是自動長出來的，高度只包住文字，不是 100px。要讓「每一列」都一樣高，用 `grid-auto-rows`。' },
    { files: { css: wallCss('  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 12px;\n', ' height: 100px;', ' grid-column: span 2; grid-row: span 2;') }, why: '不設定列的高度，改成替每張相片寫 `height: 100px`。`#feature` 也是 `.photo`：它雖然佔了兩列，自己的高度卻被寫死成 100px，只蓋住區域的上半部。設定了高度的項目不會被拉伸到填滿格子；高度應該交給列的軌道決定。' },
  ],
  variants: [{
    title: '換成八張相片：第四列也要是 100px 高',
    fixed: { html: WALL_HTML.replace('</div>\n</div>', '</div>\n  <div class="photo">漁船</div>\n  <div class="photo">星空</div>\n</div>') },
    steps: [
      { check: 'count', selector: '.photo', count: 8, label: '相片牆有八張相片' },
      { check: 'box', selector: '.photo:nth-child(4)', measure: 'top', value: 224, from: '#wall', label: '第四張相片在第三列（上緣在 224px）' },
      { check: 'box', selector: '.photo:nth-child(7)', measure: 'top', value: 336, from: '#wall', label: '第七張相片在第四列（上緣在 336px）' },
      { check: 'box', selector: '.photo:nth-child(7)', measure: 'height', value: 100, label: '第四列也是 100px 高' },
      { check: 'box', selector: '.photo:nth-child(8)', measure: 'left', value: 124, from: '#wall', label: '第八張相片在第四列第二欄（左緣在 124px）' },
    ],
  }],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD05: LessonContent = {
  lessonId: 'RWD05',
  motivation: '相片牆、商品格、有頁首與側欄的整個頁面，都是橫的要對齊、直的也要對齊的版面，只靠一般排版流很難排好。這一課用 `display: grid` 在容器上定義欄與列的軌道，用 fr 單位分配剩下的空間，再用格線編號把項目放到指定的格位。學完之後，你能用 CSS Grid 做出有頁首、側欄、內容區與頁尾的版面，並在動手之前先算出每一塊的位置與大小。',
  sections: [
    {
      id: 'rwd05-container-section', title: 'grid 容器：同時排欄與列',
      blocks: [
        { type: 'p', text: '在一般排版流裡，區塊一個接一個往下疊。想把六個分類排成三欄兩列，就得替每個盒子算寬度、想辦法讓它們並排，還要處理換列；頁面的骨架（上面是頁首、左邊是側欄、右邊是內容、下面是頁尾）更是橫的與直的都要對齊。CSS Grid（格線排版，grid layout）是為這種二維（two-dimensional）的版面設計的：先在父元素上宣告一張由欄（column）與列（row）組成的格線，子元素再住進格子裡。版面寫在容器上，子元素不必各自計算寬度與位置。如果你學過 RWD03 的 Flexbox：它一次沿一條軸排一排東西，Grid 則同時管欄與列。' },
        { type: 'p', text: '用法從一條宣告開始：在父元素上寫 `display: grid`。這個父元素就成為 grid 容器（grid container），它的每一個直接子元素成為 grid 項目（grid item）。只寫這一條，畫面幾乎看不出變化，因為還沒有告訴瀏覽器要幾欄，預設只有一欄。欄用 `grid-template-columns` 定義：每寫一個長度，就多一欄。' },
        { type: 'example', id: 'rwd05-container' },
        { type: 'p', text: '兩個容器的 HTML 完全相同，共用 `.shelf` 的樣式。上面的容器仍在一般排版流裡：每個 `div` 是區塊，各佔一列、填滿 300px。下面的容器多了兩條宣告：`display: grid` 與 `grid-template-columns: 100px 100px 100px`（三個 100px 的欄）。在預覽裡看三件事：' },
        { type: 'list', items: [
          '六個項目依 HTML 原始碼的順序，由左到右一格一格填進去。三欄排滿之後，第四個項目自動換到下一列的第一欄。',
          '沒有任何一個項目寫了 `width`，每個卻都是 100px 寬：項目預設會填滿自己所在的格子，寬度由欄決定。',
          '樣式表沒有定義列。列是瀏覽器依項目的數量自動加上的，高度剛好是項目的 40px，所以第四個項目的上緣在 40px。',
        ] },
        { type: 'p', text: 'grid 容器自己對外仍然是一個區塊：它獨佔一列，沒有設定寬度時填滿父元素。改變的是容器裡面的排法。成為 grid 項目之後，一般排版流的幾條規則不再適用：' },
        { type: 'table', head: ['比較', '一般排版流的區塊', 'grid 項目（預設）'], rows: [
          ['怎麼排', '各佔一列，往下疊', '依原始碼的順序填進格子，一列排滿就換下一列'],
          ['沒有設定寬度時', '填滿父元素的寬度', '填滿自己所在的格子（欄的寬度）'],
          ['沒有設定高度時', '剛好包住自己的內容', '填滿自己所在的格子（列的高度）'],
          ['相鄰的外距', '上下相鄰的外距會合併', '不合併，各算各的'],
          ['原本是行內的元素（`a`、`span`）', '`width`、`height` 不適用', '成為項目後當成區塊計算，`width`、`height` 有效'],
        ] },
        { type: 'callout', tone: 'warning', title: '只有直接子元素是項目', text: '`display: grid` 只影響容器的直接子元素。常見的結構是 `nav` 裡有 `ul`，`ul` 裡有 `li`：把 `display: grid` 與 `grid-template-columns` 寫在 `nav` 上，項目只有 `ul` 一個，`li` 是孫元素，仍然往下疊。要讓 `li` 排成格子，容器必須是它們的父元素 `ul`。另一個常見的狀況是只寫了 `display: grid` 就以為會自動變成多欄：沒有 `grid-template-columns` 時只有一欄，畫面和一般排版流幾乎一樣。' },
        { type: 'callout', tone: 'tip', title: '動手試：改欄數，再把欄拿掉', text: '按「動手改這個範例」，把 `grid-template-columns: 100px 100px 100px` 改成 `150px 150px` 再執行：變成兩欄三列，HTML 完全沒動。再把這一整行刪掉、只留 `display: grid`：剩下一欄，六個項目往下疊，每個都填滿 300px，看起來和上面的容器一樣。' },
      ],
    },
    {
      id: 'rwd05-tracks-section', title: '軌道、格線與 fr 單位',
      blocks: [
        { type: 'p', text: '先認識四個名詞，後面每一節都會用到。軌道（track）是一整欄或一整列：`grid-template-columns` 定義欄的軌道，`grid-template-rows` 用同樣的寫法定義列的軌道。格線（grid line）是軌道兩側的分隔線，從 1 開始編號：三個欄有四條直的格線，在由左到右書寫的頁面，第 1 條在最左邊，第 4 條在最右邊。格子（cell）是一欄與一列交會的那一格。區域（area）是一個格子，或相鄰的幾個格子組成的矩形。' },
        { type: 'p', text: '軌道的大小有幾種寫法。固定的 px 最單純，但容器變寬時它不會跟著變。要讓版面跟著容器伸縮，靠的是 fr 單位（fraction，一份）：容器的寬度先扣掉固定的軌道與所有的間距，剩下的空間再依 fr 前面的數字按比例分。' },
        { type: 'table', head: ['軌道的寫法', '意思', '容器寬 600px 時'], rows: [
          ['`200px`', '固定的長度，容器變寬變窄都不變', '200px'],
          ['`25%`', '容器寬度的百分比；不會替間距留位置', '150px'],
          ['`auto`', '依內容決定；沒有 fr 軌道而容器還有剩時，剩下的空間平分給 auto 軌道', '看內容'],
          ['`1fr`', '剩餘空間的一份', '看其他軌道與間距'],
        ] },
        { type: 'p', text: '用 600px 寬的容器算三個例子。`200px 1fr`：扣掉 200px 剩下 400px，只有一個 `1fr`，所以第二欄是 400px。`1fr 2fr 1fr` 加上 `gap: 20px`：三欄之間有兩段間距，600 − 20 × 2 = 560px，一共 1 + 2 + 1 = 4 份，每份 140px，三欄是 140、280、140px。三個一樣寬的欄可以寫 `1fr 1fr 1fr`，也可以寫 `repeat(3, 1fr)`：`repeat()` 的第一個數字是重複幾次。加上 `gap: 12px` 時，每欄是 (600 − 12 × 2) ÷ 3 = 192px。' },
        { type: 'example', id: 'rwd05-fr' },
        { type: 'p', text: '三個容器都沒有寫寬度，所以和頁面一樣寬。先在 600px 的預覽裡對照上面的算式，再按預覽上方的寬度按鈕切到 360px：`#fixed` 的第一欄仍然是 200px，`1fr` 的第二欄從 400px 縮成 360 − 200 = 160px；`#ratio` 變成 (360 − 40) ÷ 4 = 80px 一份，三欄是 80、160、80px，比例沒有變；`#equal` 的每一欄變成 (360 − 24) ÷ 3 = 112px。樣式表裡沒有任何一個數字和頁面的寬度有關，寬度一變，瀏覽器就重新分配。這就是 fr 單位在響應式設計裡好用的原因。' },
        { type: 'callout', tone: 'warning', title: '百分比加上間距會超出容器', text: '想要兩個一樣寬的欄，很多人第一個想到 `grid-template-columns: 50% 50%`。只要再加上 `gap: 20px` 就出問題：百分比算的是整個容器的寬度，600px 的容器裡兩欄各 300px，加上 20px 的間距共 620px，比容器多出 20px，第二欄凸到容器外面；容器和頁面一樣寬時，整個頁面還會出現水平捲軸。改成 `1fr 1fr`：fr 單位會先扣掉間距，兩欄各 (600 − 20) ÷ 2 = 290px，剛好填滿。' },
        { type: 'callout', tone: 'note', title: '1fr 的欄不會比內容更窄', text: '`1fr` 的軌道有一個下限：它不會縮得比裡面的內容（例如一個很長、無法斷行的字串，或一張很寬的圖片）更窄。遇到這種內容時，幾個 `1fr` 的欄就不再一樣寬。這一課的範例都是短短的文字，不會碰到；怎麼處理是下一課 RWD06 的內容。' },
        { type: 'callout', tone: 'tip', title: '動手試：改間距，先算再看', text: '在 600px 的預覽下，把範例裡 `#ratio` 的 `gap: 20px` 改成 `gap: 40px`。先算：600 − 40 × 2 = 520px，分成 4 份，每份 130px，三欄是 130、260、130px。執行之後對照。再把 `#fixed` 改成 `200px 1fr 1fr`，並在它的 HTML 裡多加一個 `<div>`：剩下的 400px 由兩個 `1fr` 平分，各 200px。' },
      ],
    },
    {
      id: 'rwd05-auto-section', title: '間距與自動放置',
      blocks: [
        { type: 'p', text: '軌道之間的空白用容器上的 `gap`（間距）設定。`gap: 10px` 讓列與列、欄與欄之間都相隔 10px；寫兩個值時，第一個是列的間距（`row-gap`），第二個是欄的間距（`column-gap`），所以 `gap: 10px 15px` 是上下相鄰的項目隔 10px、左右相鄰的隔 15px。間距只出現在軌道與軌道之間，容器的邊緣不會多出空白，也不必替「最後一個項目」另外處理。' },
        { type: 'p', text: '沒有指定位置的項目，由瀏覽器自動放置（auto-placement）：依 HTML 原始碼的順序，從第一列的第一欄開始，由左到右一格一格填，一列排滿就換下一列。樣式表明確定義的列用完了也沒關係，瀏覽器會自動加上新的列來放剩下的項目，這些叫做隱含的列（implicit row）。隱含的列預設的高度是 `auto`，剛好包住內容；想指定它們的高度，在容器上寫 `grid-auto-rows`。' },
        { type: 'example', id: 'rwd05-auto' },
        { type: 'p', text: '`#shop` 寬 300px，三個 `1fr` 的欄之間有兩段 15px 的間距，每欄是 (300 − 30) ÷ 3 = 90px，三欄的左緣在 0、105、210px。`grid-template-rows: 60px` 只定義了一列，所以明確的格線是三欄一列，只有三個格子。七個項目依序填入：前三個在第一列（高 60px）；第四個放不下了，瀏覽器加上第二列，它的上緣在 60 + 10 = 70px；第七個獨自在第三列，上緣在 70 + 40 + 10 = 120px，右邊兩格空著。第二、三列都是隱含的列，高度是 `grid-auto-rows` 給的 40px。項目都沒有寫寬高，各自填滿自己的格子。' },
        { type: 'callout', tone: 'warning', title: 'grid-template-rows 只管你寫出來的那幾列', text: '想讓「每一列」都是 60px 而寫了 `grid-template-rows: 60px`，結果只有第一列是 60px，後面自動長出來的列仍然依內容決定高度。`grid-template-rows` 寫了幾個值，就只定義幾列。項目的數量不固定時（商品、相片、文章列表），通常不知道會有幾列：這時候不要去數列數，改用 `grid-auto-rows: 60px` 設定所有隱含的列。很多版面連列的高度都不必寫，讓內容自己決定就好。' },
        { type: 'callout', tone: 'tip', title: '動手試：看隱含的列怎麼長出來', text: '把範例裡的 `grid-auto-rows: 40px` 整行刪掉再執行：第二、三列縮成剛好包住一行文字的高度，第一列仍然是 60px。接著在 HTML 的最後多加一行 `<div>新商品</div>`：它自動排進第三列的第二欄，樣式表完全不用改。再把 `gap: 10px 15px` 改成 `gap: 10px`，先算每欄的新寬度：(300 − 20) ÷ 3，約 93.3px。' },
      ],
    },
    {
      id: 'rwd05-placement-section', title: '項目放置：用格線編號指定位置',
      blocks: [
        { type: 'p', text: '自動放置一個項目只給一個格子。頁首要橫跨所有的欄、一張主打的相片要佔兩欄兩列，就需要項目放置（placement）：在項目上用 `grid-column` 指定它從第幾條直的格線排到第幾條，用 `grid-row` 指定橫的格線。寫法是「起始線 / 結束線」，項目佔據兩條線之間的軌道。' },
        { type: 'table', head: ['寫在項目上的宣告', '意思'], rows: [
          ['`grid-column: 1 / 3`', '從第 1 條直線到第 3 條直線：佔第 1、2 欄'],
          ['`grid-row: 2`', '只寫起始線：從第 2 條橫線開始，佔一列，也就是第 2 列'],
          ['`grid-column: span 2`', '橫跨 2 欄；從哪裡開始仍由自動放置決定'],
          ['`grid-column: 2 / span 2`', '從第 2 條直線開始，橫跨 2 欄：佔第 2、3 欄'],
          ['`grid-column: 1 / -1`', '負數從最後一條線往回數，`-1` 是最後一條：橫跨所有的欄'],
        ] },
        { type: 'example', id: 'rwd05-place' },
        { type: 'p', text: '`#board` 有四欄（五條直線）與三列（四條橫線）。A 寫 `grid-column: 1 / 3; grid-row: 1`：在第一列，佔第 1、2 欄，寬 70 + 10 + 70 = 150px，橫跨的項目會連中間的間距一起蓋住。B 寫 `grid-column: 3 / -1`，`-1` 在這裡是第 5 條線，所以佔第 3、4 欄，左緣在 160px；`grid-row: 1 / 3` 讓它佔第 1、2 列，高 50 + 10 + 50 = 110px。C 寫 `grid-column: 1 / -1; grid-row: 3`：在第三列橫跨四欄，寬 310px。D 沒有任何放置的宣告：瀏覽器先放好有指定位置的 A、B、C，再把 D 自動放進第一個空的格子，也就是第二列的第一欄。' },
        { type: 'p', text: 'A、B、C 都沒有寫寬高，各自填滿自己的區域：項目在格子裡的對齊方式預設是拉伸（開發者工具顯示的預設值是 `normal`，對這些一般的盒子，效果和 `stretch` 相同）。D 寫了 `width: 30px; height: 20px`，比它 70 × 50px 的格子小，這時可以決定它靠格子的哪裡。`justify-self` 管水平方向：`end` 讓 D 貼著格子的右緣，左緣在 70 − 30 = 40px。`align-self` 管垂直方向：`center` 讓它上下置中，上緣在 60 + (50 − 20) ÷ 2 = 75px。這兩個屬性寫在項目上，常用的值是 `start`、`center`、`end`、`stretch`。要一次設定容器裡所有的項目，在容器上寫 `justify-items` 與 `align-items`；`place-items: center` 是同時設定兩者的簡寫，讓每個項目都在自己的格子正中央。' },
        { type: 'p', text: '放置還有一個自動放置做不到的效果：兩個項目可以放進同一個格子，互相重疊。重疊時，HTML 裡寫在後面的項目畫在上面，也可以用 WEB07 學過的 `z-index` 調整。' },
        { type: 'callout', tone: 'warning', title: '編號數的是線，不是欄', text: '`grid-column: 1 / 3` 佔的是兩欄，不是三欄：數字是格線的編號，三個欄有四條直線，要橫跨三欄得寫 `1 / 4`。把結束線少算一條，是 Grid 最常見的錯誤。另一個方向的錯誤是指定到格線以外：四欄的格線裡寫 `grid-column: 6`，瀏覽器不會報錯，而是自動多長出欄來放它，版面旁邊莫名多出一塊。還要注意 `-1` 指的是明確定義的最後一條線：沒有寫 `grid-template-rows` 時，`grid-row: 1 / -1` 並不會跨過所有自動長出來的列。' },
        { type: 'callout', tone: 'tip', title: '動手試：換一種寫法，再製造重疊', text: '把範例裡 `#a` 的 `grid-column: 1 / 3` 改成 `grid-column: span 2` 再執行：畫面不變，因為 A 在第一列從第一欄開始。接著把 `#b` 的 `grid-row: 1 / 3` 改成 `grid-row: 1 / -1`：B 往下延伸到第三列，和 C 在右下角的兩個格子重疊；C 在 HTML 裡寫在 B 的後面，所以畫在上面，蓋住 B 的下半部。' },
      ],
    },
    {
      id: 'rwd05-page-section', title: '頁面骨架：頁首、側欄、內容區與頁尾',
      blocks: [
        { type: 'p', text: '把前面幾節合起來，就能排出最常見的頁面骨架：頁首橫跨上方，中間左邊是側欄、右邊是內容區，頁尾橫跨下方。做法是行動優先（mobile first）：基本樣式給窄畫面，只有一欄，四個區塊照 HTML 的順序由上往下排；畫面夠寬時，再用一個媒體查詢（media query）換成兩欄。`@media (min-width: 600px) { … }` 的意思是：大括號裡的規則只在視窗（viewport）寬度至少 600px 時生效。RWD01 用過這個寫法，完整的語法與斷點（breakpoint）該怎麼選，留到 RWD07。' },
        { type: 'example', id: 'rwd05-page' },
        { type: 'p', text: '預覽一開始是 360px 寬。這時媒體查詢不成立，`#page` 沒有 `grid-template-columns`，只有一欄；`grid-template-rows: 48px 80px 160px 48px` 給了四列，頁首、側欄、內容區、頁尾依序各佔一列，內容區的上緣在 48 + 8 + 80 + 8 = 144px。按預覽上方的按鈕切到 800px，媒體查詢裡的三件事同時生效：' },
        { type: 'list', ordered: true, items: [
          '`grid-template-columns: 200px 1fr` 把格線改成兩欄：側欄固定 200px，內容區拿走剩下的 800 − 200 − 8 = 592px。',
          '`#top, #bottom { grid-column: 1 / -1; }` 讓頁首與頁尾從第一條直線排到最後一條，橫跨兩欄。',
          '`grid-template-rows` 改成三列。頁首佔滿第一列之後，沒有指定位置的側欄與內容區自動排進第二列的第一欄與第二欄，頁尾在第三列。',
        ] },
        { type: 'table', head: ['區塊', '窄畫面（一欄）', '視窗至少 600px（兩欄）'], rows: [
          ['頁首 `#top`', '第 1 列', '第 1 列，橫跨兩欄'],
          ['側欄 `#side`', '第 2 列，和頁面一樣寬', '第 2 列第 1 欄，寬 200px'],
          ['內容區 `#content`', '第 3 列', '第 2 列第 2 欄，寬度是 `1fr`'],
          ['頁尾 `#bottom`', '第 4 列', '第 3 列，橫跨兩欄'],
        ] },
        { type: 'p', text: '整個版面的變化只發生在容器 `#page` 與兩條放置的宣告上，四個區塊自己沒有寫任何寬度。為了讓預覽裡每一塊都看得清楚，範例用 `grid-template-rows` 替每一列寫了固定的高度；真正的頁面通常不寫列的高度，讓內容決定（`auto`），只定義欄。' },
        { type: 'callout', tone: 'tip', title: '動手試：把側欄改成按比例伸縮', text: '把媒體查詢裡的 `grid-template-columns: 200px 1fr` 改成 `1fr 3fr`，在 800px 的預覽下執行：扣掉 8px 的間距後分成 4 份，側欄是 (800 − 8) ÷ 4 = 198px，內容區 594px。再按「填滿欄位」或其他寬度：現在側欄會跟著頁面一起變寬變窄，而原本的 `200px` 不會。固定寬度還是按比例，看側欄裡放的是什麼內容。' },
      ],
    },
    {
      id: 'rwd05-order-section', title: '畫面順序、原始碼順序與檢查方法',
      blocks: [
        { type: 'p', text: '項目放置可以把任何一個項目放到任何一個格子，和它在 HTML 裡排第幾個無關。這很方便，也是 Grid 最需要小心的地方：改變的只有畫面。' },
        { type: 'callout', tone: 'warning', title: '放置不會改變閱讀與鍵盤的順序', text: '用 `grid-column`、`grid-row` 把項目移到別的位置，鍵盤按 Tab 移動焦點的順序、螢幕閱讀器朗讀的順序，仍然照 HTML 原始碼的順序。如果把寫在最後面的區塊放到畫面的最上方，看畫面的人最先看到它，用鍵盤或螢幕閱讀器的人卻最後才遇到它，焦點還會在畫面上跳來跳去。所以先把 HTML 寫成合理的閱讀順序，再用 Grid 排版；不要靠放置去補救順序寫錯的 HTML。' },
        { type: 'callout', tone: 'tip', title: '動手試：把側欄搬到右邊，再按 Tab', text: '回到上一節的頁面範例，把媒體查詢裡的欄改成 `grid-template-columns: 1fr 200px`，並在媒體查詢裡加上 `#side { grid-column: 2; grid-row: 2; }` 與 `#content { grid-column: 1; grid-row: 2; }`，在 800px 的預覽下執行：側欄到了右邊。先點一下預覽最上方的頁首「小島圖書館」，再連續按 Tab：焦點先到右邊側欄的「小說」「科普」，才回到左邊的「本週新書」，因為 HTML 裡 `nav` 仍然寫在 `main` 的前面。' },
        { type: 'p', text: '看到一段 Grid 的 CSS，照下面的順序問四個問題，就能在瀏覽器畫出來之前算出每個項目的位置：' },
        { type: 'list', ordered: true, items: [
          '誰是 grid 容器？只有它的直接子元素是項目。',
          '有幾欄、每欄多寬？先扣掉固定的軌道與所有的間距，剩下的空間再依 fr 單位的數字分。',
          '哪些項目有指定位置？先放它們；其餘的依原始碼的順序填進空格，明確的列不夠就長出隱含的列。',
          '每個項目在自己的格子裡怎麼對齊？沒有另外設定時是填滿。',
        ] },
        { type: 'p', text: '舉一個例子：容器寬 500px，寫了 `display: grid; grid-template-columns: 100px 1fr 1fr; gap: 20px;`，裡面有五個項目，第一個寫了 `grid-column: 1 / -1`。欄：500 − 100 − 20 × 2 = 360px，兩個 `1fr` 各 180px，三欄的左緣在 0、120、320px。放置：第一個項目橫跨三欄，獨佔第一列，寬 500px；第二、三、四個自動排進第二列的三個格子；第五個排到第三列的第一欄，寬 100px。' },
        { type: 'table', head: ['想做的事', '寫在哪裡', '宣告'], rows: [
          ['建立格線', '容器', '`display: grid`'],
          ['定義欄與列的軌道', '容器', '`grid-template-columns`、`grid-template-rows`'],
          ['軌道之間留空白', '容器', '`gap`'],
          ['設定自動長出來的列的高度', '容器', '`grid-auto-rows`'],
          ['讓一個項目橫跨多欄或多列', '項目', '`grid-column`、`grid-row`（格線編號或 `span`）'],
          ['在格子裡對齊', '容器（全部項目）或項目（單一個）', '`justify-items`、`align-items`；`justify-self`、`align-self`'],
        ] },
        { type: 'p', text: '檢查實際的頁面時，開發者工具的 Elements 面板會在 grid 容器的標籤旁邊顯示一個 `grid` 標記；點選它，頁面上會畫出每一條格線與軌道的範圍，還可以顯示格線的編號，對照 `grid-column` 寫的數字最方便。想多練習欄、列與放置的各種組合，可以到互動實驗島的 CSS Grid 練習場，調整數值並立刻看到格線改變。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'rwd05-q1', prompt: '`.list` 裡有四個 `div`，和 Grid 有關的樣式只有下面這一條。畫面上這四個 `div` 怎麼排？',
      code: { language: 'CSS', text: '.list {\n  display: grid;\n}' },
      options: [
        '排成一列四欄：grid 容器會自動把項目橫排',
        '排成兩欄兩列：grid 容器會自動排成最接近正方形的格子',
        '排成一欄四列，一個疊一個，看起來和一般排版流差不多',
        '四個 `div` 疊在同一個格子裡，只看得到最後一個',
      ],
      answer: 2,
      explanation: '沒有 `grid-template-columns` 時，格線只有一欄。四個項目依原始碼的順序自動放置，每個各佔一列（都是隱含的列），所以是一欄四列，和一般排版流的區塊看起來差不多。瀏覽器不會替你猜要幾欄：要橫排或排成兩欄，必須自己定義欄的軌道。項目只有在被放置到同一個格子時才會重疊，自動放置不會把兩個項目放進同一格。',
    },
    {
      id: 'rwd05-q2', prompt: '`.grid` 寬 500px。第三欄有多寬？',
      code: { language: 'CSS', text: '.grid {\n  display: grid;\n  width: 500px;\n  grid-template-columns: 100px 1fr 3fr;\n  gap: 20px;\n}' },
      options: ['270px', '300px', '360px', '375px'],
      answer: 0,
      explanation: 'fr 單位分的是剩下的空間：500 − 100（固定的欄）− 20 × 2（三欄之間的兩段間距）= 360px。一共 1 + 3 = 4 份，每份 90px，第三欄是 3 份，270px。300px 是忘了扣間距（400 × 3 ÷ 4）；360px 是全部的剩餘空間，還沒有分給第二欄；375px 是直接拿 500px 來分（500 × 3 ÷ 4），固定的欄與間距都沒扣。',
    },
    {
      id: 'rwd05-q3', prompt: '一個有四欄的 grid 容器裡，某個項目寫了 `grid-column: 2 / 4`。它佔了哪幾欄？',
      options: [
        '第 2、3、4 欄，共三欄',
        '第 2、3 欄，共兩欄',
        '第 2 欄與第 4 欄，中間空著第 3 欄',
        '第 3、4 欄，共兩欄',
      ],
      answer: 1,
      explanation: '`grid-column` 的數字是格線的編號，不是欄的編號。第 2 條直線是第 2 欄的左緣，第 4 條直線是第 3 欄的右緣，所以項目佔第 2、3 兩欄。要佔第 2 到第 4 欄，結束線要寫到第 5 條：`2 / 5`，或 `2 / -1`。第 3、4 欄是 `3 / 5`。項目佔的區域一定是連續的矩形，不會跳過中間的欄。',
    },
    {
      id: 'rwd05-q4', prompt: '`.shop` 裡有五個項目，都沒有指定位置。第五個項目在哪裡？它所在的那一列有多高？',
      code: { language: 'CSS', text: '.shop {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  grid-template-rows: 80px;\n}' },
      options: [
        '第 1 列的第 5 欄：瀏覽器會自動多加兩欄',
        '第 2 列第 2 欄，那一列和第一列一樣是 80px',
        '不會顯示：格線只有三個格子，放不下的項目被捨棄',
        '第 2 列第 2 欄，那一列的高度由內容決定',
      ],
      answer: 3,
      explanation: '自動放置由左到右填滿一列就換下一列：前三個項目在第一列，第四、五個在第二列的第一、二欄。`grid-template-rows: 80px` 只定義了第一列；第二列是瀏覽器自動加上的隱含的列，沒有寫 `grid-auto-rows` 時高度是 `auto`，由內容決定，不會跟著是 80px。放不下的項目不會被捨棄，預設也不是往右多加欄，而是往下多加列。',
    },
    {
      id: 'rwd05-q5', prompt: '頁首要橫跨 grid 容器所有的欄。容器目前定義了三欄，之後可能改成四欄。哪一種寫法在欄數改變之後不必跟著修改？',
      options: [
        '`grid-column: 1 / 3`',
        '`grid-column: 1 / -1`',
        '`grid-column: span 3`',
        '`grid-column: 1 / 4`',
      ],
      answer: 1,
      explanation: '`-1` 是 `grid-template-columns` 定義的最後一條格線，`1 / -1` 永遠從第一條排到最後一條，欄數怎麼改都橫跨全部。`1 / 3` 現在就只佔兩欄（三欄有四條線）。`span 3` 與 `1 / 4` 在三欄時正確，但把欄數寫死了：改成四欄之後，頁首仍然只佔三欄，第四欄空著。',
    },
    {
      id: 'rwd05-q6', prompt: '`.pair` 寬 600px，裡面有兩個項目。結果是什麼？',
      code: { language: 'CSS', text: '.pair {\n  display: grid;\n  width: 600px;\n  grid-template-columns: 50% 50%;\n  gap: 20px;\n}' },
      options: [
        '兩欄各 290px：百分比會先扣掉間距再計算',
        '兩欄各 300px，間距被忽略，剛好填滿 600px',
        '第二個項目放不下，自動換到第二列',
        '兩欄各 300px，加上間距共 620px，比容器多出 20px',
      ],
      answer: 3,
      explanation: '百分比的軌道算的是容器的寬度，不管有沒有間距：兩欄各 300px，中間再加 20px，一共 620px，第二欄有 20px 凸到容器外面。先扣掉間距再分的是 fr 單位：`1fr 1fr` 才會得到各 290px。間距不會因為空間不夠而被忽略；欄數由 `grid-template-columns` 決定，項目也不會因為太寬就自己換到下一列。',
    },
    {
      id: 'rwd05-q7', prompt: 'grid 容器裡的 HTML 依序是「甲」「乙」「丙」三個連結。樣式用 `grid-column` 與 `grid-row` 把「丙」放到第一列第一欄、「甲」放到第一列第三欄，「乙」自動排進中間的格子，畫面上由左到右是「丙」「乙」「甲」。使用者連續按 Tab 鍵，焦點依序移到哪裡？',
      options: [
        '甲、乙、丙：照 HTML 原始碼的順序',
        '丙、乙、甲：照畫面上由左到右的順序',
        '乙、甲、丙：有指定位置的項目排在最後',
        '只會停在沒有被移動過的「乙」',
      ],
      answer: 0,
      explanation: '項目放置只改變畫面上的位置。Tab 的順序與螢幕閱讀器朗讀的順序仍然照 HTML 原始碼：甲、乙、丙。所以在畫面上，焦點是從最右邊開始往左移的，和眼睛由左到右閱讀的順序相反。有沒有指定位置不影響焦點的順序，被放置的連結也不會失去焦點。順序對內容有意義時，應該直接調整 HTML。',
    },
    {
      id: 'rwd05-q8', prompt: 'grid 容器寫了 `place-items: center`，裡面的項目都只有一行文字，沒有設定寬度與高度。項目會怎麼顯示？',
      options: [
        '仍然填滿自己的格子，只有裡面的文字置中',
        '所有的軌道一起移到容器的正中央，項目仍然填滿格子',
        '縮成剛好包住內容的大小，停在自己格子的正中央',
        '沒有變化：`place-items` 只對設定了寬高的項目有效',
      ],
      answer: 2,
      explanation: '`place-items: center` 同時把 `justify-items` 與 `align-items` 設成 `center`。項目只有在對齊方式維持預設的拉伸（`stretch`）時才會填滿格子；改成 `center` 之後，沒有設定寬高的項目縮成剛好包住內容，並在自己的格子裡水平、垂直置中。置中盒子裡的文字是 `text-align` 的工作，盒子本身不會因此移動；`place-items` 對齊的是每個項目在格子裡的位置，不會搬動軌道。',
    },
  ],
  webCode: {
    examples: [container, tracks, autoPlacement, placement, pageLayout],
    exercises: [exThreeColumns, exSidebar, exPage, exWall],
  },
};
