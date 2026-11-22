import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD07 media queries and breakpoints (RWD-2). A web-code lesson of HTML and CSS only. The prerequisite is RWD02, so no
 * page needs flexbox or grid: columns are inline-blocks with percentage widths (as in RWD02's exercises), written into
 * the base styles, and what a media query changes is a width, a colour or a display value. Every width claim is
 * measured in Chromium just below, at and just above a breakpoint (resize steps). The preference queries
 * (prefers-color-scheme, prefers-reduced-motion) cannot be switched by the preview or the checks: the page that
 * contains them states only what holds under either setting, and the text says so. Container queries (RWD08), clamp()
 * (RWD09) and responsive images (RWD10) are not taught here.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const anatomy: WebExample = {
  id: 'rwd07-anatomy', title: '一條媒體查詢：600px 以上分成兩欄',
  description: '島嶼圖書館的首頁有 `#side` 與 `#main` 兩個區塊，高 80px。基本樣式讓它們各佔 `100%` 的寬度；最下面的媒體查詢在視窗寬 600px 以上時，把寬度改成 `30%` 與 `70%`。',
  viewport: { width: 360, height: 400 },
  widths: [360, 599, 600, 1000],
  files: {
    html: String.raw`<div id="page"><aside id="side" class="col">書籍分類</aside><main id="main" class="col">本週新書</main></div>`,
    css: String.raw`body { margin: 0; }
.col {
  display: inline-block;
  vertical-align: top;
  box-sizing: border-box;
  width: 100%;
  height: 80px;
  padding: 12px;
}
#side { background-color: #bbdefb; }
#main { background-color: #ffe082; }

@media screen and (min-width: 600px) {
  #side { width: 30%; }
  #main { width: 70%; }
}`,
  },
  observe: [
    { check: 'box', selector: '#side', measure: 'width', value: 360, label: '視窗寬 360px：條件不成立，`#side` 用基本樣式的 `width: 100%`，寬 360px' },
    { check: 'box', selector: '#main', measure: 'top', value: 80, from: '#page', label: '`#main` 排在 `#side` 的下面：上緣在 80px' },
    { do: 'resize', width: 599 },
    { check: 'box', selector: '#side', measure: 'width', value: 599, label: '視窗寬 599px：只差 1px，條件仍然不成立，`#side` 寬 599px' },
    { do: 'resize', width: 600 },
    { check: 'box', selector: '#side', measure: 'width', value: 180, label: '視窗寬 600px：條件成立，`#side` 寬 600 × 30% = 180px' },
    { check: 'box', selector: '#main', measure: 'left', value: 180, from: '#page', label: '`#main` 排到 `#side` 的右邊：左緣在 180px' },
  ],
};

const order: WebExample = {
  id: 'rwd07-order', title: '同一條查詢，三種寫法',
  description: '三個段落的基本背景色都是淡藍色，也都想在視窗寬 600px 以上時變成黃色。A 把媒體查詢寫在基本樣式後面；B 把順序反過來；C 的查詢寫在後面，但裡面用的是類別選擇器 `.note`。',
  viewport: { width: 360, height: 400 },
  widths: [360, 800],
  files: {
    html: String.raw`<p id="a" class="note">A：基本樣式在前，查詢在後</p>
<p id="b" class="note">B：查詢在前，基本樣式在後</p>
<p id="c" class="note">C：查詢在後，但選擇器比較弱</p>`,
    css: String.raw`body { margin: 0; }
.note { margin: 0 0 8px; padding: 12px; }

/* A */
#a { background-color: #bbdefb; }
@media (min-width: 600px) {
  #a { background-color: #ffe082; }
}

/* B */
@media (min-width: 600px) {
  #b { background-color: #ffe082; }
}
#b { background-color: #bbdefb; }

/* C */
#c { background-color: #bbdefb; }
@media (min-width: 600px) {
  .note { background-color: #ffe082; }
}`,
  },
  observe: [
    { check: 'style', selector: '#a', property: 'background-color', value: '#bbdefb', label: '視窗寬 360px：查詢不成立，A 是基本樣式的淡藍色' },
    { do: 'resize', width: 800 },
    { check: 'style', selector: '#a', property: 'background-color', value: '#ffe082', label: '視窗寬 800px：A 的查詢成立，而且寫在基本樣式後面，背景變成黃色' },
    { check: 'style', selector: '#b', property: 'background-color', value: '#bbdefb', label: 'B 的查詢同樣成立，卻被寫在它後面的基本樣式蓋過：仍然是淡藍色' },
    { check: 'style', selector: '#c', property: 'background-color', value: '#bbdefb', label: 'C 的查詢寫在後面，但 `.note` 的特異性低於 `#c`：仍然是淡藍色' },
  ],
};

const boundary: WebExample = {
  id: 'rwd07-boundary', title: '恰好 700px：兩種寫法的差別',
  description: '四個段落預設都是 `display: none`，各由一條媒體查詢打開。上面兩個用 `max-width: 700px` 與 `min-width: 700px`，下面兩個用範圍語法的 `width < 700px` 與 `width >= 700px`。預覽一開始就是 700px 寬。',
  viewport: { width: 700, height: 400 },
  widths: [700, 699, 701],
  files: {
    html: String.raw`<h2>max-width 搭配 min-width</h2>
<p id="old-narrow">窄版的規則成立</p>
<p id="old-wide">寬版的規則成立</p>
<h2>範圍語法</h2>
<p id="new-narrow">窄版的規則成立</p>
<p id="new-wide">寬版的規則成立</p>`,
    css: String.raw`body { margin: 0; padding: 8px; }
h2 { margin: 8px 0 4px; font-size: 16px; }
p {
  display: none;
  margin: 0 0 4px;
  padding: 8px;
  background-color: #ffe082;
}

@media (max-width: 700px) { #old-narrow { display: block; } }
@media (min-width: 700px) { #old-wide { display: block; } }

@media (width < 700px) { #new-narrow { display: block; } }
@media (width >= 700px) { #new-wide { display: block; } }`,
  },
  observe: [
    { check: 'style', selector: '#old-narrow', property: 'display', value: 'block', label: '視窗寬 700px：`(max-width: 700px)` 成立，因為 700 ≤ 700' },
    { check: 'style', selector: '#old-wide', property: 'display', value: 'block', label: '同一個寬度，`(min-width: 700px)` 也成立，因為 700 ≥ 700：窄版與寬版的規則同時套用' },
    { check: 'style', selector: '#new-narrow', property: 'display', value: 'none', label: '`(width < 700px)` 在 700px 不成立：這個段落沒有顯示' },
    { check: 'style', selector: '#new-wide', property: 'display', value: 'block', label: '`(width >= 700px)` 成立：範圍語法的這一組在 700px 只有一條成立' },
    { do: 'resize', width: 699 },
    { check: 'style', selector: '#old-wide', property: 'display', value: 'none', label: '視窗改成 699px：`(min-width: 700px)` 不再成立，只剩窄版的規則' },
  ],
};

const contentBreakpoint: WebExample = {
  id: 'rwd07-content-breakpoint', title: '斷點放在一行快要太長的地方',
  description: '島嶼圖書館的文章頁：`#story` 是文章，`#more` 是延伸閱讀，兩者的內距都是 `1em`。基本樣式是單欄；唯一的媒體查詢 `(min-width: 40em)` 讓它們以 60% 與 40% 並排，`#page` 另外用 `max-width: 60em` 封頂。以下的數字以瀏覽器預設的 16px 字級計算。',
  widths: [360, 600, 640, 1200],
  files: {
    html: String.raw`<div id="page"><article id="story">
  <h1>潮間帶的一天</h1>
  <p>退潮之後，礁岩上留下一個個小水窪。寄居蟹揹著撿來的殼慢慢橫越，海葵在水裡張開觸手，等下一波潮水把食物送來。蹲下來看十分鐘，原本安靜的水窪就會熱鬧起來：小魚從石縫探頭，藤壺伸出蔓足，像在向路過的人招手。漲潮之前記得回到岸上，把這片礁岩還給海。</p>
</article><aside id="more">
  <h2>延伸閱讀</h2>
  <p>島嶼的候鳥</p>
</aside></div>`,
    css: String.raw`body { margin: 0; }
#page { max-width: 60em; margin: 0 auto; }
#story, #more {
  display: inline-block;
  vertical-align: top;
  box-sizing: border-box;
  width: 100%;
  padding: 1em;
}
#more { background-color: #e3f2fd; }
h1, h2 { margin: 0 0 8px; font-size: 1.25em; }
p { margin: 0; line-height: 1.7; }

/* 文章與延伸閱讀並排：單欄的一行快要超過 40 個字的地方 */
@media (min-width: 40em) {
  #story { width: 60%; }
  #more { width: 40%; }
}`,
  },
  observe: [
    { check: 'box', selector: '#story', measure: 'width', value: 600, label: '視窗寬 600px：還沒到斷點，文章佔滿整個寬度（一行約 35 個字）' },
    { do: 'resize', width: 640 },
    { check: 'box', selector: '#story', measure: 'width', value: 384, label: '視窗寬 640px（預設字級下的 40em）：查詢成立，文章寬 640 × 60% = 384px（一行 22 個字）' },
    { check: 'box', selector: '#more', measure: 'left', value: 384, from: '#page', label: '延伸閱讀排到文章的右邊：左緣在 384px' },
    { do: 'resize', width: 1200 },
    { check: 'box', selector: '#page', measure: 'width', value: 960, label: '視窗寬 1200px：`max-width: 60em` 讓整頁停在 960px，文章不再變寬' },
    { check: 'box', selector: '#page', measure: 'left', value: 120, label: '多出來的 240px 由 `margin: 0 auto` 平分在兩側：整頁的左緣在 120px' },
  ],
};

const preferences: WebExample = {
  id: 'rwd07-preferences', title: '跟著系統設定走的三條查詢',
  description: '基本樣式是白底深色字，按鈕的背景色用 0.4 秒漸變。三條媒體查詢都和寬度無關：`prefers-color-scheme: dark` 換成深色的配色，`prefers-reduced-motion: reduce` 把漸變的時間改成 0，`hover: hover` 只在能把游標停在元素上的裝置加上滑過的樣式。',
  files: {
    html: String.raw`<h1>島嶼圖書館</h1>
<p>這一頁的顏色與漸變，會跟著你的系統設定改變。</p>
<a id="go" href="#borrow">借閱這本書</a>`,
    css: String.raw`body {
  margin: 0;
  padding: 16px;
  background-color: #ffffff;
  color: #1a1a1a;
}
h1 { margin: 0 0 8px; font-size: 22px; }
#go {
  display: inline-block;
  padding: 8px 16px;
  background-color: #1565c0;
  color: #ffffff;
  transition-property: background-color;
  transition-duration: 0.4s;
}
#go:focus { background-color: #0d3c78; }

@media (hover: hover) {
  #go:hover { background-color: #0d3c78; }
}
@media (prefers-color-scheme: dark) {
  body { background-color: #121212; color: #f5f5f5; }
}
@media (prefers-reduced-motion: reduce) {
  #go { transition-duration: 0s; }
}`,
  },
  observe: [
    { check: 'style', selector: 'body', property: 'background-color', value: ['#ffffff', '#121212'], label: '`body` 的背景色是 `#ffffff` 或 `#121212`：由瀏覽器回報的外觀偏好（淺色或深色）決定' },
    { check: 'style', selector: 'body', property: 'color', value: ['#1a1a1a', '#f5f5f5'], label: '文字的顏色跟著成對更換：`#1a1a1a` 或 `#f5f5f5`' },
    { check: 'style', selector: '#go', property: 'transition-duration', value: ['0.4s', '0s'], label: '按鈕的 `transition-duration` 是 0.4s 或 0s：由系統有沒有開啟「減少動態效果」決定' },
    { check: 'style', selector: '#go', property: 'transition-property', value: 'background-color', label: '不論哪一種設定，會漸變的屬性都是 `background-color`：偏好查詢只改了時間' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const SHOP_BASE_CSS = String.raw`body { margin: 0; }
/* 基本樣式（單欄）：這幾行請保留 */
.col {
  display: inline-block;
  vertical-align: top;
  box-sizing: border-box;
  width: 100%;
  height: 100px;
  padding: 12px;
}
#list { background-color: #ffe082; }
#cart { background-color: #bbdefb; }
`;

const exTwoColumns: WebExercise = {
  id: 'rwd07-ex-two-columns', title: '加一條媒體查詢：700px 以上分成兩欄',
  statement: 'index.html 不能改。小島商店的頁面有商品列表 `#list` 與購物車 `#cart` 兩個區塊，各高 100px。style.css 已經寫好單欄的基本樣式（兩個區塊都是 `inline-block`、`width: 100%`，所以上下疊）。請在基本樣式的後面加上一條媒體查詢：視窗寬度在 700px 以上（含 700px）時，`#list` 佔 `#shop` 寬度的 65%，`#cart` 佔 35%，兩者並排。寬度請用百分比，基本樣式請保留。檢查會在 360px、699px、700px 與 1000px 四種視窗寬度量（預覽上方的按鈕可以切換）。',
  hints: [
    '「700px 以上才套用」是條件，條件寫在 `@media` 後面的括號裡。700px「以上」對應的是 `min-width` 還是 `max-width`？',
    '查詢的大括號裡要放完整的規則：選擇器加上宣告。這一題只需要改兩個元素的 `width`，其他的宣告基本樣式已經有了。',
    '在檔案最後加上 `@media (min-width: 700px) { #list { width: 65%; } #cart { width: 35%; } }`。',
  ],
  explanation: '`(min-width: 700px)` 在視窗寬度大於或等於 700px 時成立。360px 與 699px 時條件不成立，兩個區塊用基本樣式的 `width: 100%`，各佔一行。700px 時條件成立，查詢裡的兩條規則和基本樣式的 `.col` 一起比：`#list` 與 `#cart` 是 id 選擇器，而且寫在後面，所以寬度變成 700 × 65% = 455px 與 700 × 35% = 245px，合計剛好 100%，排進同一行。因為用的是百分比，1000px 時自動變成 650px 與 350px。寫成 `(width >= 700px)` 也完全一樣。',
  viewport: { width: 360, height: 400 },
  widths: [360, 699, 700, 1000],
  fixed: { html: String.raw`<div id="shop"><main id="list" class="col">商品列表</main><aside id="cart" class="col">購物車</aside></div>` },
  starter: { css: SHOP_BASE_CSS + String.raw`
/* 在下面加上媒體查詢 */
` },
  solution: { css: SHOP_BASE_CSS + String.raw`
/* 在下面加上媒體查詢 */
@media (min-width: 700px) {
  #list { width: 65%; }
  #cart { width: 35%; }
}
` },
  steps: [
    { check: 'box', selector: '#list', measure: 'width', value: 360, label: '視窗寬 360px：單欄，`#list` 佔滿整個寬度（360px）' },
    { check: 'box', selector: '#cart', measure: 'top', value: 100, from: '#shop', label: '視窗寬 360px：`#cart` 排在 `#list` 的下面（上緣在 100px）' },
    { do: 'resize', width: 699 },
    { check: 'box', selector: '#list', measure: 'width', value: 699, label: '視窗寬 699px：仍然是單欄，`#list` 寬 699px' },
    { do: 'resize', width: 700 },
    { check: 'box', selector: '#list', measure: 'width', value: 455, label: '視窗寬 700px：`#list` 佔 65%，寬 455px' },
    { check: 'box', selector: '#cart', measure: 'left', value: 455, from: '#shop', label: '視窗寬 700px：`#cart` 排到 `#list` 的右邊（左緣在 455px）' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#cart', measure: 'left', value: 650, from: '#shop', label: '視窗寬 1000px：比例不變，`#cart` 的左緣在 650px' },
  ],
  mistakes: [
    { files: { css: SHOP_BASE_CSS + String.raw`
/* 在下面加上媒體查詢 */
@media (max-width: 700px) {
  #list { width: 65%; }
  #cart { width: 35%; }
}
` }, why: '把 `min-width` 寫成 `max-width`。`(max-width: 700px)` 是「700px 以下」才成立，結果反過來：360px 的手機上擠成兩欄，1000px 的寬螢幕反而是單欄。`min-` 讀成「至少」，`max-` 讀成「至多」。' },
    { files: { css: SHOP_BASE_CSS + String.raw`
/* 在下面加上媒體查詢 */
@media (width > 700px) {
  #list { width: 65%; }
  #cart { width: 35%; }
}
` }, why: '用了範圍語法的 `>`。`(width > 700px)` 不包含 700px 本身，視窗恰好 700px 寬時仍然是單欄。「700px 以上（含 700px）」要寫成 `(width >= 700px)` 或 `(min-width: 700px)`。' },
    { files: { css: SHOP_BASE_CSS + String.raw`
/* 在下面加上媒體查詢 */
@media (min-width: 700) {
  #list { width: 65%; }
  #cart { width: 35%; }
}
` }, why: '`700` 後面少了單位。除了 0 以外，長度一定要有單位；`(min-width: 700)` 是寫錯的條件，瀏覽器把整條查詢當成永遠不成立，也不會提示錯誤，所以任何寬度都是單欄。' },
  ],
};

const ORDER_QUERY_CSS = String.raw`/* 寬版：700px 以上 */
@media (min-width: 700px) {
  #title { font-size: 32px; }
  #menu li { width: 25%; }
}
`;
const ORDER_TITLE_CSS = String.raw`#title {
  margin: 0;
  padding: 12px;
  font-size: 20px;
}
`;
const ORDER_MENU_CSS = String.raw`#menu {
  margin: 0;
  padding: 0;
  list-style: none;
}
#menu li {
  display: inline-block;
  vertical-align: top;
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding: 8px 12px;
  border: 1px solid #1565c0;
  background-color: #bbdefb;
}
`;

const exOrder: WebExercise = {
  id: 'rwd07-ex-order', title: '寬版的樣式沒有生效：把順序排對',
  statement: 'index.html 不能改。小島商店的頁首有標題 `#title` 與選單 `#menu`（四個 `li`）。設計是：基本樣式下標題的字級 20px、每個選單項目佔滿一列；視窗寬 700px 以上時，標題變成 32px，四個項目各佔 25% 排成一列。style.css 裡這些規則都寫了，數字也都對，可是把預覽切到 1000px，頁面還是窄版的樣子。請找出原因並修好：不要更改任何數字，也不要刪掉規則。檢查會在 360px 與 1000px 兩種視窗寬度量。',
  hints: [
    '在 1000px 寬時，`(min-width: 700px)` 確實成立。問題不在條件，而在條件成立之後，查詢裡的規則和誰比、誰贏。',
    '`#title` 在查詢裡外各有一條規則，選擇器一模一樣，特異性相同。這時候決定勝負的是什麼？',
    '把整個 `@media (min-width: 700px) { … }` 區塊搬到檔案的最後面，放在所有基本樣式之後。',
  ],
  explanation: '媒體查詢不會替裡面的規則增加特異性。1000px 寬時查詢成立，`#title { font-size: 32px; }` 與外面的 `#title { font-size: 20px; }` 特異性相同，寫在後面的贏；原本基本樣式寫在查詢後面，所以 20px 蓋過了 32px，`#menu li` 的 `width` 也是同樣的情形。把查詢搬到基本樣式之後，條件成立時它就寫在後面而勝出：標題 32px，四個項目各寬 1000 × 25% = 250px，排成一列。360px 時查詢不成立，仍然是基本樣式。行動優先的樣式表固定這樣排：先基本樣式，再由窄到寬的 `min-width` 查詢。',
  viewport: { width: 360, height: 400 },
  widths: [360, 1000],
  fixed: { html: String.raw`<h1 id="title">小島商店</h1>
<ul id="menu"><li>新品</li><li>特價</li><li>禮盒</li><li>門市</li></ul>` },
  starter: { css: String.raw`body { margin: 0; }

` + ORDER_QUERY_CSS + String.raw`
/* 基本樣式 */
` + ORDER_TITLE_CSS + ORDER_MENU_CSS },
  solution: { css: String.raw`body { margin: 0; }

/* 基本樣式 */
` + ORDER_TITLE_CSS + ORDER_MENU_CSS + String.raw`
` + ORDER_QUERY_CSS },
  steps: [
    { check: 'style', selector: '#title', property: 'font-size', value: '20px', label: '視窗寬 360px：標題的字級是 20px' },
    { check: 'box', selector: '#menu li:first-child', measure: 'width', value: 360, label: '視窗寬 360px：選單項目佔滿一列（寬 360px）' },
    { do: 'resize', width: 1000 },
    { check: 'style', selector: '#title', property: 'font-size', value: '32px', label: '視窗寬 1000px：標題的字級是 32px' },
    { check: 'box', selector: '#menu li:first-child', measure: 'width', value: 250, label: '視窗寬 1000px：選單項目佔 25%，寬 250px' },
    { check: 'box', selector: '#menu li:nth-child(4)', measure: 'left', value: 750, from: '#menu', label: '視窗寬 1000px：四個項目排成一列，第四個的左緣在 750px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }

/* 基本樣式 */
` + ORDER_TITLE_CSS + String.raw`
` + ORDER_QUERY_CSS + String.raw`
` + ORDER_MENU_CSS }, why: '只把標題的基本樣式搬到查詢前面，選單的基本樣式還留在查詢後面。標題修好了，但 `#menu li { width: 100%; }` 仍然寫在查詢的 `width: 25%` 之後，1000px 寬時選單還是一項一列。每一條被查詢覆寫的基本樣式，都要在查詢之前。' },
    { files: { css: String.raw`body { margin: 0; }

` + ORDER_QUERY_CSS + String.raw`
/* 基本樣式 */
` + ORDER_TITLE_CSS.replace('font-size: 20px;', 'font-size: 32px;') + ORDER_MENU_CSS.replace('width: 100%;', 'width: 25%;') }, why: '直接把基本樣式的數字改成寬版的值。1000px 寬時看起來對了，但基本樣式沒有條件，任何寬度都套用：360px 的手機上標題也是 32px，四個項目擠成一列、各只有 90px 寬。該動的是順序，不是數字。' },
  ],
};

const OVERLAP_BASE_CSS = String.raw`body { margin: 0; }
#toggle { display: block; margin: 8px; }
.col {
  display: inline-block;
  vertical-align: top;
  box-sizing: border-box;
  height: 120px;
  padding: 12px;
}
#side { width: 30%; background-color: #bbdefb; }
#main { width: 70%; background-color: #ffe082; }
`;
const OVERLAP_NARROW_RULES = String.raw`  #side { display: none; }
  #main { width: 100%; }
}
`;
const OVERLAP_WIDE_RULES = String.raw`  #toggle { display: none; }
}
`;
const overlapCss = (narrow: string, wide: string) => OVERLAP_BASE_CSS + String.raw`
/* 窄版：藏起選單，內容佔滿整個寬度，改用「選單」按鈕 */
@media ` + narrow + String.raw` {
` + OVERLAP_NARROW_RULES + String.raw`
/* 寬版：選單一直看得到，不需要按鈕 */
@media ` + wide + String.raw` {
` + OVERLAP_WIDE_RULES;

const exOverlap: WebExercise = {
  id: 'rwd07-ex-overlap', title: '恰好 700px 時，選單和按鈕都不見了',
  statement: 'index.html 不能改。島嶼圖書館的頁面是桌機優先的寫法：基本樣式是寬版（選單 `#side` 佔 30%、內容 `#main` 佔 70%）；窄版的查詢把 `#side` 藏起來、讓 `#main` 佔滿，改由「選單」按鈕 `#toggle` 開啟選單；寬版的查詢把用不到的 `#toggle` 藏起來。（這一題只處理 CSS，按鈕不會真的打開選單。）有讀者回報：視窗恰好 700px 寬時，選單和按鈕都不見了，沒有辦法到別的分類。請把預覽切到 700px 重現這個問題，然後修改媒體查詢的條件，讓任何寬度都只有一組規則成立：小於 700px 是窄版，700px 以上（含 700px）是寬版。檢查會在 699px、700px、701px 三種視窗寬度量。',
  hints: [
    '`(max-width: 700px)` 是「700px 以下」，`(min-width: 700px)` 是「700px 以上」。兩個條件都包含 700px 本身，所以 700px 寬時兩組規則一起套用。',
    '題目要 700px 算寬版，所以該改的是窄版的條件：讓它在 700px 不成立，在 699px（以及 699.5px 這樣的寬度）仍然成立。',
    '把窄版的條件改成範圍語法的 `(width < 700px)`。',
  ],
  explanation: '`max-width` 與 `min-width` 都包含自己寫的那個數字，所以原本的兩條查詢在恰好 700px 時同時成立：窄版把 `#side` 藏起來，寬版把 `#toggle` 藏起來，兩個都不見了。把窄版的條件改成 `(width < 700px)` 之後，它和 `(min-width: 700px)`（也就是 `width >= 700px`）剛好互補：699px 只有窄版成立，700px 與 701px 只有寬版成立，`#side` 寬 700 × 30% = 210px，`#main` 寬 490px。把窄版寫成 `(max-width: 699px)` 在整數的寬度下也會通過，但使用者縮放頁面時視窗可能是 699.5px，那時兩條都不成立；`<` 沒有這個縫隙。',
  viewport: { width: 699, height: 400 },
  widths: [699, 700, 701],
  fixed: { html: String.raw`<button id="toggle" type="button">選單</button>
<div id="page"><nav id="side" class="col">分類選單</nav><main id="main" class="col">本週新書</main></div>` },
  starter: { css: overlapCss('(max-width: 700px)', '(min-width: 700px)') },
  solution: { css: overlapCss('(width < 700px)', '(min-width: 700px)') },
  steps: [
    { check: 'style', selector: '#side', property: 'display', value: 'none', label: '視窗寬 699px：窄版，選單 `#side` 藏起來' },
    { check: 'style', selector: '#toggle', property: 'display', value: ['block', 'inline-block'], label: '視窗寬 699px：「選單」按鈕 `#toggle` 看得到' },
    { do: 'resize', width: 700 },
    { check: 'box', selector: '#side', measure: 'width', value: 210, label: '視窗寬 700px：寬版，選單 `#side` 看得到，寬 210px' },
    { check: 'box', selector: '#main', measure: 'width', value: 490, label: '視窗寬 700px：內容 `#main` 寬 490px' },
    { check: 'style', selector: '#toggle', property: 'display', value: 'none', label: '視窗寬 700px：用不到的按鈕 `#toggle` 藏起來' },
    { do: 'resize', width: 701 },
    { check: 'box', selector: '#main', measure: 'left', value: 210, from: '#page', label: '視窗寬 701px：仍然是寬版，`#main` 在選單的右邊（左緣約在 210px）' },
  ],
  mistakes: [
    { files: { css: overlapCss('(max-width: 700px)', '(min-width: 701px)') }, why: '改的是寬版的條件：`(min-width: 701px)`。兩條查詢不再同時成立了，但 700px 被劃到窄版，和題目要求的「700px 以上是寬版」相反；而且視窗是 700.5px 這種寬度時，兩條都不成立。要改的是窄版那一條，讓它不包含 700px。' },
    { files: { css: OVERLAP_BASE_CSS + String.raw`
/* 寬版：選單一直看得到，不需要按鈕 */
@media (min-width: 700px) {
` + OVERLAP_WIDE_RULES + String.raw`
/* 窄版：藏起選單，內容佔滿整個寬度，改用「選單」按鈕 */
@media (max-width: 700px) {
` + OVERLAP_NARROW_RULES }, why: '把兩條查詢的前後順序對調。順序只在「兩條規則設定同一個元素的同一個屬性」時才分得出勝負；這裡窄版改的是 `#side` 與 `#main`，寬版改的是 `#toggle`，互不相干，700px 寬時兩組照樣一起套用。要解決的是條件重疊，不是順序。' },
  ],
};

const SHELF_BASE_CSS = String.raw`body { margin: 0; }
#shelf { margin: 0; padding: 0; list-style: none; }
/* 商品卡的基本樣式（一欄）：這幾行請保留 */
#shelf li {
  display: inline-block;
  vertical-align: top;
  box-sizing: border-box;
  width: 100%;
  height: 80px;
  padding: 12px;
  border: 1px solid #f9a825;
  background-color: #ffe082;
}
`;

const exThreeTiers: WebExercise = {
  id: 'rwd07-ex-three-tiers', title: '三段式的商品列表：一欄、兩欄、四欄',
  statement: 'index.html 不能改。小島商店的商品列表 `#shelf` 有四張商品卡（四個 `li`），各高 80px。style.css 已經寫好行動優先的基本樣式：每張卡 `width: 100%`，一欄排下來。請在基本樣式的後面加上媒體查詢，做出三段：視窗小於 600px 是一欄；600px 以上、小於 900px 是兩欄（每張卡佔 50%）；900px 以上是四欄（每張卡佔 25%）。600px 與 900px 本身都屬於比較寬的那一段。寬度請用百分比，基本樣式請保留。檢查會在斷點的兩側量：599px、600px、899px、900px。',
  hints: [
    '基本樣式已經是「小於 600px」的那一段，不需要替它寫查詢。剩下兩段各需要一條查詢，共兩個斷點。',
    '行動優先的寫法只用 `min-width`，由窄到寬排列。視窗 1000px 寬時，`(min-width: 600px)` 與 `(min-width: 900px)` 都成立，哪一條要寫在後面才會贏？',
    '依序加上 `@media (min-width: 600px) { #shelf li { width: 50%; } }` 與 `@media (min-width: 900px) { #shelf li { width: 25%; } }`。',
  ],
  explanation: '兩條 `min-width` 的查詢把寬度切成三段，段與段之間沒有重疊也沒有縫隙。599px 時兩條都不成立：基本樣式的一欄。600px 到 899px 只有第一條成立：每張卡 50%，600px 時寬 300px，第三張卡換到第二列。900px 以上兩條都成立，選擇器相同、特異性相同，寫在後面的 25% 勝出：每張卡寬 900 × 25% = 225px，四張排成一列。所以順序一定是由窄到寬。中間那一段不需要寫成 `(min-width: 600px) and (max-width: 899px)`：讓後面的查詢蓋過前面的就夠了，也不會在邊界出錯。',
  viewport: { width: 599, height: 400 },
  widths: [360, 599, 600, 899, 900],
  fixed: { html: String.raw`<ul id="shelf"><li>椰子餅乾</li><li>鳳梨果醬</li><li>海鹽堅果</li><li>芒果乾</li></ul>` },
  starter: { css: SHELF_BASE_CSS + String.raw`
/* 在下面加上媒體查詢 */
` },
  solution: { css: SHELF_BASE_CSS + String.raw`
/* 在下面加上媒體查詢 */
@media (min-width: 600px) {
  #shelf li { width: 50%; }
}
@media (min-width: 900px) {
  #shelf li { width: 25%; }
}
` },
  steps: [
    { check: 'box', selector: '#shelf li:first-child', measure: 'width', value: 599, label: '視窗寬 599px：一欄，商品卡寬 599px' },
    { do: 'resize', width: 600 },
    { check: 'box', selector: '#shelf li:nth-child(2)', measure: 'left', value: 300, from: '#shelf', label: '視窗寬 600px：兩欄，第二張卡的左緣在 300px' },
    { check: 'box', selector: '#shelf li:nth-child(3)', measure: 'top', value: 80, from: '#shelf', label: '視窗寬 600px：第三張卡換到第二列（上緣在 80px）' },
    { do: 'resize', width: 899 },
    { check: 'box', selector: '#shelf li:nth-child(2)', measure: 'left', value: 449.5, from: '#shelf', label: '視窗寬 899px：仍然是兩欄，第二張卡的左緣在 449.5px' },
    { do: 'resize', width: 900 },
    { check: 'box', selector: '#shelf li:first-child', measure: 'width', value: 225, label: '視窗寬 900px：四欄，商品卡寬 225px' },
    { check: 'box', selector: '#shelf li:nth-child(4)', measure: 'left', value: 675, from: '#shelf', label: '視窗寬 900px：四張卡排成一列，第四張的左緣在 675px' },
  ],
  mistakes: [
    { files: { css: SHELF_BASE_CSS + String.raw`
/* 在下面加上媒體查詢 */
@media (min-width: 900px) {
  #shelf li { width: 25%; }
}
@media (min-width: 600px) {
  #shelf li { width: 50%; }
}
` }, why: '兩條查詢的順序由寬到窄。視窗 900px 寬時兩條都成立，特異性相同，寫在後面的 `(min-width: 600px)` 勝出，所以永遠到不了四欄。`min-width` 的查詢要由窄到寬排：600px 的在前，900px 的在後。' },
    { files: { css: SHELF_BASE_CSS + String.raw`
/* 在下面加上媒體查詢 */
@media (min-width: 600px) and (max-width: 900px) {
  #shelf li { width: 50%; }
}
@media (min-width: 901px) {
  #shelf li { width: 25%; }
}
` }, why: '把中段寫成 600px 到 900px、寬版從 901px 開始。`max-width: 900px` 包含 900px，所以視窗恰好 900px 寬時仍然是兩欄，和題目的「900px 以上是四欄」差了 1px；900.5px 這樣的寬度則兩條都不成立，掉回一欄。只用 `min-width`、由窄到寬排，就不必自己算每一段的上限。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD07: LessonContent = {
  lessonId: 'RWD07',
  motivation: '手機上上下疊的兩個區塊，到了寬螢幕要左右並排；系統設成深色的人，希望頁面也是深色的。這些不是把尺寸等比例放大做得到的，而是「條件成立時換一組規則」。這一課把媒體查詢（Media Query）的語法、規則的先後順序與邊界講清楚，再學怎麼依內容訂出最少而足夠的斷點，並用偏好查詢回應深色模式與減少動態效果的設定。',
  sections: [
    {
      id: 'rwd07-anatomy-section', title: 'Media Query 的結構：條件成立才套用的規則',
      blocks: [
        { type: 'p', text: '「viewport 與相對單位」那一課的百分比與相對單位，讓尺寸跟著視窗連續地變：視窗寬一點，區塊就寬一點。但有些改變不是連續的。兩個區塊在手機上只能上下疊，到了寬螢幕應該左右並排；這是換一種排法，不是放大一點。CSS 需要一個「如果」：如果視窗夠寬，就多套用這幾條規則。這個「如果」就是媒體查詢（Media Query）。「響應式原則與行動優先」那一課用過一條，這一課把它拆開來看。' },
        { type: 'p', text: '一條媒體查詢長這樣：`@media screen and (min-width: 600px) { #side { width: 30%; } }`。由左到右有四個部分：' },
        { type: 'table', head: ['部分', '例子', '意思'], rows: [
          ['`@media`', '`@media`', '一條媒體查詢的開頭'],
          ['媒體類型（media type）', '`screen`、`print`、`all`', '頁面輸出到哪裡：螢幕、列印，或全部。可以省略，省略就等於 `all`'],
          ['`and`', '`screen and (…)`', '把類型與條件、條件與條件接起來：兩邊都成立才算成立'],
          ['媒體特徵（media feature）', '`(min-width: 600px)`', '寫在括號裡的條件，問的是視窗或裝置現在的狀況'],
          ['大括號裡的規則', '`#side { width: 30%; }`', '一條或多條完整的規則：條件成立時才生效，不成立時就像沒有寫'],
        ] },
        { type: 'p', text: '大多數時候不需要寫媒體類型，直接寫 `@media (min-width: 600px) { … }` 就好；這一課後面的查詢都這樣寫。`min-width: 600px` 這個特徵的意思是「視窗的寬度至少 600px」，也就是 600px 以上。' },
        { type: 'example', id: 'rwd07-anatomy' },
        { type: 'p', text: '先看基本樣式：`.col` 是 `inline-block`，寬度 `100%`，所以 `#side` 與 `#main` 各自佔滿一行，上下疊在一起。（index.html 裡兩個元素的標籤緊貼著寫，中間沒有空白，`inline-block` 之間才不會多出一個空格寬的縫隙；「viewport 與相對單位」那一課的練習用過同樣的寫法。）預覽一開始是 360px 寬，查詢的條件不成立，你看到的就是基本樣式。接著按預覽上方的寬度按鈕：' },
        { type: 'list', items: [
          '599px：只差 1px，條件仍然不成立，還是上下疊。',
          '600px：條件成立，查詢裡的兩條規則生效。`#side` 寬 600 × 30% = 180px，`#main` 寬 420px，兩者合計 100%，排進同一行。',
          '1000px：條件仍然成立。因為寬度寫的是百分比，兩欄跟著變成 300px 與 700px。媒體查詢負責換排法，百分比負責在同一種排法裡跟著伸縮。',
        ] },
        { type: 'p', text: '有三件事要記住。第一，瀏覽器會持續評估條件：視窗的寬度每次改變（拉動視窗、手機轉向），它就重新判斷一次，不需要重新整理，也不需要 JavaScript。第二，`min-width` 問的是視窗（viewport）的寬度，不是某個元素的寬度，也不是螢幕的實體像素。第三，正因為問的是視窗，每個頁面 `<head>` 裡的 viewport 設定不能少：沒有那一行，手機會用大約 980px 的虛擬寬度排版，媒體查詢也依 980px 判斷，手機拿到的就是寬螢幕的版面。' },
        { type: 'callout', tone: 'warning', title: '寫錯的查詢不會報錯，只是永遠不成立', text: '初學時最常見的三種寫錯：條件少了括號（`@media min-width: 600px { … }`）；數字少了單位（`(min-width: 600)`）；大括號裡直接寫宣告、沒有選擇器（`@media (min-width: 600px) { width: 30%; }`）。前兩種讓整條查詢永遠不成立，第三種的宣告因為不屬於任何規則而被丟掉。瀏覽器都不會提示錯誤，頁面只是「怎麼拉寬都沒反應」。遇到這種情況，先逐字檢查查詢的寫法。' },
        { type: 'callout', tone: 'tip', title: '動手試：移動斷點', text: '按「動手改這個範例」，把 `600px` 改成 `480px` 再執行，然後切換寬度：現在 599px 也是兩欄了，360px 仍然上下疊：分界移到了 480px。再把 `screen and` 刪掉，只留 `@media (min-width: 480px)`：畫面沒有任何差別，因為省略媒體類型就等於 `all`，螢幕也包含在內。' },
      ],
    },
    {
      id: 'rwd07-cascade-section', title: '順序決定誰贏：媒體查詢不加特異性',
      blocks: [
        { type: 'p', text: '媒體查詢只決定一件事：裡面的規則要不要參加。條件成立之後，這些規則就和樣式表裡其他的規則一起照串接（cascade）的規則比（網頁基礎島「CSS 選擇器、串接與特異性」那一課）：先比特異性，特異性相同時，寫在後面的贏。`@media` 不會替裡面的選擇器加上任何特異性，「條件成立的規則優先」這種事並不存在。' },
        { type: 'example', id: 'rwd07-order' },
        { type: 'p', text: '三個段落都想在 600px 以上變成黃色，三條查詢的條件一模一樣。按寬度按鈕切到 800px，只有 A 變黃：' },
        { type: 'table', head: ['段落', '樣式表裡的順序', '800px 寬時的結果', '原因'], rows: [
          ['A', '基本樣式 `#a`，然後是查詢裡的 `#a`', '黃色', '兩條規則特異性相同，查詢裡的那條寫在後面'],
          ['B', '查詢裡的 `#b`，然後是基本樣式 `#b`', '淡藍色', '特異性相同，基本樣式寫在後面，把查詢蓋掉了'],
          ['C', '基本樣式 `#c`，然後是查詢裡的 `.note`', '淡藍色', '查詢雖然寫在後面，但類別選擇器的特異性低於 id 選擇器'],
        ] },
        { type: 'p', text: '所以媒體查詢放在哪裡很重要。最不容易出錯的排法叫做行動優先（mobile first）：先寫不帶任何條件的基本樣式，也就是最窄的版面；再用 `min-width` 的查詢，由窄到寬一層一層往上加。為什麼要由窄到寬？視窗 1000px 寬時，`(min-width: 600px)` 與 `(min-width: 900px)` 兩個條件都成立，如果它們設定同一個屬性，寫在後面的贏，所以比較寬的斷點一定要放在後面。' },
        { type: 'table', head: ['寫法', '基本樣式是', '查詢用的特徵', '查詢的排列'], rows: [
          ['行動優先', '最窄的版面，通常是單欄', '`min-width`', '由窄到寬：600px 的在前，900px 的在後'],
          ['桌機優先', '最寬的版面', '`max-width`', '由寬到窄：900px 的在前，600px 的在後'],
        ] },
        { type: 'p', text: '兩種寫法都做得出同樣的頁面，這座島採用行動優先。理由很實際：單欄的版面幾乎就是一般排版流，需要的 CSS 最少；每一條查詢只是在寬度夠的時候「多加一點」，而不是把寬版的樣式一條一條取消掉。' },
        { type: 'callout', tone: 'warning', title: '基本樣式寫在查詢後面，查詢就白寫了', text: '這個錯誤通常不是故意的：把同一個元件的樣式整理在一起，查詢剛好排在前面；或是幾週後在檔案最下面補了一條基本樣式，沒有注意到上面的查詢設定了同一個屬性。症狀是「查詢明明成立，樣式卻沒有變」。在開發者工具裡選取那個元素，會看到查詢裡的宣告被劃掉，下面有另一條規則蓋過它。修法是把順序排對，不是加 `!important`。' },
        { type: 'callout', tone: 'tip', title: '動手試：把 B 修好', text: '在範例裡把 B 的兩段對調：先寫 `#b { background-color: #bbdefb; }`，再寫查詢。執行後切到 800px，B 變成黃色。再試 C：把查詢裡的 `.note` 改成 `#c`，C 也變黃了。兩種修法對應兩個原因：一個是順序，一個是特異性。' },
      ],
    },
    {
      id: 'rwd07-range-section', title: '寬度條件：min-width、max-width 與範圍語法',
      blocks: [
        { type: 'p', text: '`min-width: 700px` 是「視窗寬度至少 700px」，`max-width: 700px` 是「視窗寬度至多 700px」。兩個都包含 700px 本身。`min-`、`max-` 這種前綴的寫法用了很多年，缺點是讀的時候要在腦中轉一下，而且沒有辦法直接說「小於」。現在的瀏覽器支援更直接的範圍語法（range syntax）：在括號裡用 `<`、`<=`、`>`、`>=` 比較 `width`。' },
        { type: 'table', head: ['想說的條件', '前綴的寫法', '範圍語法'], rows: [
          ['700px 以上（含 700px）', '`(min-width: 700px)`', '`(width >= 700px)`'],
          ['700px 以下（含 700px）', '`(max-width: 700px)`', '`(width <= 700px)`'],
          ['小於 700px（不含 700px）', '沒有直接的寫法，常見的是用 `(max-width: 699.98px)` 來湊', '`(width < 700px)`'],
          ['600px 以上、小於 900px', '`(min-width: 600px) and (max-width: 899.98px)`', '`(600px <= width < 900px)`'],
        ] },
        { type: 'p', text: '「含不含那個數字」看起來是小事，卻是媒體查詢最有名的陷阱。很多樣式表用同一個數字寫一對查詢：`(max-width: 700px)` 放窄版的規則，`(min-width: 700px)` 放寬版的規則。下面的範例把這一對查詢與範圍語法的一對查詢放在一起，預覽一開始就停在 700px：' },
        { type: 'example', id: 'rwd07-boundary' },
        { type: 'p', text: '上面那一組，兩個段落都顯示了：700 ≤ 700 成立，700 ≥ 700 也成立，窄版與寬版的規則在這 1px 同時套用。真實的頁面上，這會變成「選單被窄版藏起來、選單按鈕被寬版藏起來」之類一半一半的版面，而且只在恰好 700px 寬的視窗出現，很難發現。下面那一組只顯示一個段落：`<` 與 `>=` 剛好互補。按 699px 與 701px 的按鈕對照，兩組在其他寬度的結果相同，差別只在 700px。' },
        { type: 'p', text: '把窄版改成 `(max-width: 699px)` 可以避開重疊，卻留下另一個洞：視窗的寬度不一定是整數。使用者縮放頁面時，瀏覽器算出的視窗寬度可能是 699.5px，這時 `(max-width: 699px)` 與 `(min-width: 700px)` 都不成立，兩組規則都沒有套用。所以才有人寫 699.98px 這種數字。比較乾淨的做法有兩個：用範圍語法的 `<` 與 `>=`；或是像上一節的行動優先那樣，全部只用 `min-width`，讓後面的查詢蓋過前面的，根本不需要寫每一段的上限。' },
        { type: 'p', text: '條件可以組合。三種接法的意思不同：' },
        { type: 'table', head: ['接法', '意思', '例子'], rows: [
          ['`and`', '兩邊都成立才成立', '`(min-width: 600px) and (orientation: landscape)`'],
          ['逗號', '任何一邊成立就成立，也就是「或」', '`(max-width: 400px), (min-width: 1200px)`：很窄或很寬的時候'],
          ['`not`', '把一整條查詢的結果反過來', '`not screen and (min-width: 700px)`：不是「700px 以上的螢幕」的時候'],
        ] },
        { type: 'p', text: '表裡的 `orientation` 看的是視窗的形狀：高度大於或等於寬度時是 `portrait`（直向），否則是 `landscape`（橫向）。媒體類型 `print` 則用來寫只在列印時套用的規則，例如 `@media print { nav { display: none; } }` 讓印出來的紙上沒有導覽列。' },
        { type: 'callout', tone: 'warning', title: '逗號是「或」，不是「而且」', text: '想寫「600px 到 899px 之間」，卻寫成 `@media (min-width: 600px), (max-width: 899px)`：逗號兩邊只要有一邊成立就成立，300px 的視窗符合右邊，1200px 的視窗符合左邊，結果是任何寬度都成立。兩個條件要同時成立，用的是 `and`，或直接寫成範圍語法的 `(600px <= width < 900px)`。' },
        { type: 'callout', tone: 'tip', title: '動手試：做出一個洞', text: '在範例裡把 `(max-width: 700px)` 改成 `(max-width: 699px)`，再把 `(min-width: 700px)` 改成 `(min-width: 701px)`，執行後按 700px：上面那一組一個段落也沒有顯示，因為 700px 兩條都不符合。重疊與漏洞是同一個問題的兩面：兩個條件沒有剛好接在一起。' },
      ],
    },
    {
      id: 'rwd07-strategy-section', title: '斷點策略：內容導向斷點',
      blocks: [
        { type: 'p', text: '版面換一種排法的那個寬度，叫做斷點（breakpoint）。語法會了之後，真正的問題是：斷點該訂在多少？直覺的答案是照裝置訂：手機一個、平板一個、桌機一個。但裝置的尺寸有幾百種，每年都在變；視窗也不等於螢幕，桌機的瀏覽器可以拉成任何寬度，平板可以把畫面分成兩半。照裝置訂的數字，很快就對不上。' },
        { type: 'p', text: '內容導向斷點（content-driven breakpoint）反過來想：不問「這是什麼裝置」，只問「內容在這個寬度還好不好讀」。做法是：' },
        { type: 'list', ordered: true, items: [
          '從最窄的寬度開始，寫好單欄的基本樣式。',
          '慢慢把視窗拉寬，盯著內容看：一行文字是不是長到不好讀？卡片是不是被拉得又寬又扁？留白是不是大到空洞？',
          '版面開始不對勁的那個寬度就是斷點：在那裡加一條 `min-width` 的查詢，換成更適合的排法。',
          '繼續拉寬，重複同樣的步驟，直到再寬也不需要改變為止。最後常常用 `max-width` 把整頁封頂。',
        ] },
        { type: 'p', text: '「一行太長」有具體的標準可以參考。一行太長時，眼睛讀到行尾，回頭很難找到下一行的開頭。英文常見的建議是每行 45 到 75 個字元；無障礙指引 WCAG 的進階要求把上限訂在 80 個字元，中文、日文、韓文則是 40 個字。內文字級 16px 時，40 個中文字就是 640px 寬。' },
        { type: 'example', id: 'rwd07-content-breakpoint' },
        { type: 'p', text: '這個文章頁的內距是左右各 16px，所以單欄時一行大約是（視窗寬度 − 32）÷ 16 個字。按 360px：一行約 20 個字，很好讀。按 600px：一行約 35 個字，快要到上限了。再寬下去就會超過 40 個字，所以斷點放在這附近：640px 以上，文章與延伸閱讀並排，文章只佔 60%，一行回到 22 個字。繼續拉寬到 960px，一行是 34 個字；再寬就由 `#page` 的 `max-width: 60em` 封頂，按 1200px 可以看到整頁停在 960px、置中。整個頁面只有一個斷點加上一個 `max-width`，任何寬度下一行都不超過 40 個字。' },
        { type: 'p', text: '這條查詢的斷點寫的是 `40em` 而不是 `640px`。媒體查詢裡的 `em`（`rem` 也一樣）以瀏覽器的初始字級為基準，也就是使用者在瀏覽器設定裡選的預設字級，沒有改過的話是 16px，所以 `40em` 等於 640px。它不看樣式表替 `html` 或其他元素設定的 `font-size`。有些團隊偏好用 `em` 寫斷點：使用者把預設字級調大成 20px 時，`40em` 變成 800px，字變大了、一行放得下的字變少了，版面也跟著晚一點才分成兩欄，行長維持差不多；用 px 寫的斷點不會跟著動。' },
        { type: 'p', text: '訂斷點時還有三個原則：' },
        { type: 'list', items: [
          '斷點要少。多數頁面兩到三個就夠了；每多一個斷點，就多一種版面要設計、要測試。',
          '用「什麼改變了」來稱呼斷點，不用裝置的名字。註解寫 `/* 文章與延伸閱讀並排 */`，半年後還看得懂；寫 `/* 平板 */`，沒有人記得當初指的是哪一種平板。',
          '斷點與斷點之間也要好看。靠百分比、`max-width` 這些會流動的寫法撐住中間的每一種寬度，斷點只負責換排法。',
        ] },
        { type: 'callout', tone: 'note', title: '一個元件一個斷點也可以', text: '斷點不必是全站共用的一組數字。導覽列可能在 500px 就放得下所有連結，文章要到 640px 才需要並排：各自在內容需要的地方換排法，就是內容導向。團隊為了溝通方便而約定幾個常用的數字也很常見，但那是為了一致，不是因為那些數字對應某種裝置。' },
        { type: 'callout', tone: 'tip', title: '動手試：改掉 html 的字級，斷點會不會動', text: '在範例的 style.css 最前面加上 `html { font-size: 20px; }` 再執行。字變大了，內距的 `1em` 也跟著變大；但按 600px 與 640px 的按鈕，版面仍然在 640px 分成兩欄：查詢裡的 `40em` 不看 `html` 的設定。同一份樣式表裡，`#page` 的 `max-width: 60em` 是一般的宣告，它就跟著變成 1200px 了。想看更多寬度下的版面，可以到互動實驗島的 Responsive Layout Simulator 拖動寬度。' },
      ],
    },
    {
      id: 'rwd07-preferences-section', title: '偏好查詢：回應使用者的系統設定',
      blocks: [
        { type: 'p', text: '媒體特徵不只有寬度。有一類特徵問的是使用者在作業系統或瀏覽器裡做的設定，叫做偏好查詢（preference query）。使用者已經在系統裡說過「我要深色」「我不要動畫」，頁面應該聽得到：' },
        { type: 'table', head: ['媒體特徵', '常用的值', '對應的系統設定', '頁面通常怎麼回應'], rows: [
          ['`prefers-color-scheme`', '`light`、`dark`', '外觀是淺色還是深色', '換一組背景與文字的顏色'],
          ['`prefers-reduced-motion`', '`reduce`、`no-preference`', '有沒有開啟「減少動態效果」', '拿掉或縮短動畫與漸變'],
          ['`prefers-contrast`', '`more`、`less`、`no-preference`', '有沒有要求提高（或降低）對比', '加深邊框，拉開文字與背景的明暗差距'],
        ] },
        { type: 'p', text: '其中 `prefers-reduced-motion` 最容易被忽略。大範圍的滑動、縮放與視差效果，會讓一部分的人頭暈甚至想吐；他們在系統裡開啟「減少動態效果」，就是請所有的畫面安靜一點。' },
        { type: 'example', id: 'rwd07-preferences' },
        { type: 'p', text: '這個頁面的基本樣式是白底深色字。`#go` 的 `transition-property` 與 `transition-duration` 是這一課第一次出現的屬性：它們讓 `background-color` 改變時不是瞬間換色，而是在 0.4 秒內漸變。把游標移到按鈕上（或點一下讓它取得焦點），可以看到背景慢慢變深；如果它是瞬間變色的，表示瀏覽器回報了「減少動態效果」，正是下面第二條查詢的作用。最下面的三條查詢各管一件事：' },
        { type: 'list', items: [
          '`(prefers-color-scheme: dark)`：系統外觀是深色時，`body` 的背景與文字換成深底淺字。注意兩個顏色是成對換的。',
          '`(prefers-reduced-motion: reduce)`：把漸變的時間改成 0s。顏色還是會變，使用者仍然知道游標停在按鈕上，只是不再有動態。功能留著，動態拿掉。',
          '`(hover: hover)`：只有主要的輸入裝置能把游標停在元素上時（滑鼠、觸控板），才加上 `:hover` 的樣式。',
        ] },
        { type: 'p', text: '這裡要說清楚一個限制：預覽與練習的檢查都沒有辦法替你切換系統設定。範例下方列出的事實因此只能寫成「是這個值或那個值」，你看到哪一個，取決於瀏覽器回報給這個頁面的偏好。想親眼看到切換的效果，請把這個範例的 HTML 與 CSS 存成自己的檔案，直接用瀏覽器開啟，然後用下面兩個方法之一：到作業系統的外觀設定把淺色改成深色（以及開啟減少動態效果）；或是打開瀏覽器的開發者工具，找模擬媒體特徵的功能（常見的位置是 Rendering 面板），直接指定 `prefers-color-scheme` 與 `prefers-reduced-motion` 的值，不必更動系統。' },
        { type: 'p', text: '`hover` 與另一個特徵 `pointer` 描述的是輸入裝置，不是偏好。`(hover: none)` 表示主要的輸入方式無法停在元素上（多數觸控螢幕）；`(pointer: coarse)` 表示指標不精確（手指），`(pointer: fine)` 表示精確（滑鼠）。把滑過才出現的效果包在 `@media (hover: hover)` 裡，觸控裝置上就不會出現「點了一下，滑過的樣式卻卡著不走」的狀況；`(pointer: coarse)` 則常用來把按鈕加大一點。不論如何，重要的內容不能只在滑過時才出現。' },
        { type: 'callout', tone: 'warning', title: '深色模式只換了背景，文字就不見了', text: '在 `(prefers-color-scheme: dark)` 裡只寫 `background-color`，忘了 `color`：深色的背景配上原本深色的文字，整頁看起來是空的。淺色模式的使用者（包括寫這段 CSS 的你）完全不會發現。背景色與文字色永遠成對修改；連結、邊框、按鈕這些有自己顏色的元素，也要在深色下逐一看過。' },
        { type: 'callout', tone: 'tip', title: '動手試：和寬度的條件接在一起', text: '偏好查詢可以和其他條件用 `and` 連接。把範例的 `@media (prefers-color-scheme: dark)` 改成 `@media (prefers-color-scheme: dark) and (min-width: 600px)`：現在深色的配色只在視窗寬 600px 以上、而且系統是深色外觀時才套用。如果預覽裡的頁面本來就是白底，這個改動看不出差別，原因就是上面說的限制：預覽沒有辦法替你切換外觀偏好。' },
      ],
    },
    {
      id: 'rwd07-checklist-section', title: '整理：替一個頁面訂出最少而足夠的斷點',
      blocks: [
        { type: 'p', text: '把這一課串成一個流程。拿到一個頁面時：先確認 `<head>` 裡有 viewport 設定；寫好單欄的基本樣式，盡量用百分比與 `max-width` 讓它自己伸縮；把視窗慢慢拉寬，在內容開始不好讀的地方放一個 `min-width` 的斷點；查詢一律放在基本樣式之後，由窄到寬排；最後補上偏好查詢。斷點的數量由內容決定，不是由裝置的清單決定。' },
        { type: 'p', text: '媒體查詢出錯時，症狀大多可以直接對應到原因：' },
        { type: 'table', head: ['症狀', '最可能的原因', '修法'], rows: [
          ['查詢裡的樣式在任何寬度都沒有生效', '基本樣式寫在查詢後面；或查詢寫錯了（少了括號或單位）', '把查詢搬到基本樣式之後；逐字檢查查詢的寫法'],
          ['只在恰好斷點的寬度，版面一半窄版、一半寬版', '`max-width` 與 `min-width` 用了同一個數字，兩個條件重疊', '改用範圍語法的 `<` 與 `>=`，或全部只用 `min-width`'],
          ['很寬的視窗套用到的是中間那一段的樣式', '多條 `min-width` 的查詢沒有由窄到寬排', '比較寬的斷點放在後面'],
          ['手機上出現的是寬螢幕的版面', '頁面沒有 viewport 設定，手機用大約 980px 判斷', '在 `<head>` 加上 viewport 設定'],
          ['深色模式下文字看不見', '深色的查詢只換了背景色', '背景色與文字色成對修改'],
        ] },
        { type: 'p', text: '測試斷點時，不要只看 360px 與 1200px 這種離斷點很遠的寬度。問題幾乎都出在邊界：斷點的前 1px、斷點本身、後 1px，例如 699px、700px、701px。這一課的練習就是這樣檢查的，預覽上方的寬度按鈕也照這個方式給。' },
        { type: 'p', text: '媒體查詢看的是整個視窗。同一張商品卡，放在寬的主欄與放在窄的側欄，視窗的寬度一樣，需要的排法卻不同；讓元件依照「自己所在的容器有多寬」來調整，是下一課容器查詢（container query）的內容。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'rwd07-q1', prompt: '這條規則裡的 `width: 50%` 什麼時候會套用到 `.card`？',
      code: { language: 'CSS', text: '@media (min-width: 600px) {\n  .card { width: 50%; }\n}' },
      options: [
        '視窗的寬度小於 600px 時',
        '視窗的寬度在 600px 以上（含 600px）時',
        '`.card` 自己的寬度在 600px 以上時',
        '螢幕的實體像素有 600 個以上時，和瀏覽器視窗多寬無關',
      ],
      answer: 1,
      explanation: '`min-width: 600px` 的意思是「視窗的寬度至少 600px」，包含 600px 本身，所以 600px 以上時查詢裡的規則才生效。「小於 600px」是把 `min-` 讀反了；媒體查詢問的是視窗，不是被選到的元素有多寬（那是下一課容器查詢的事）；它用的也是 CSS 的 px 與瀏覽器視窗的寬度，不是螢幕的實體像素。',
    },
    {
      id: 'rwd07-q2', prompt: '樣式表只有下面這些規則。視窗寬 1000px 時，`.title` 的字級是多少？為什麼？',
      code: { language: 'CSS', text: '@media (min-width: 800px) {\n  .title { font-size: 32px; }\n}\n.title { font-size: 20px; }' },
      options: [
        '32px：條件成立的媒體查詢，優先於查詢外面的規則',
        '32px：寫在媒體查詢裡的選擇器，特異性比較高',
        '瀏覽器預設的字級：兩條規則互相衝突，所以都失效',
        '20px：兩條規則的特異性相同，寫在後面的贏',
      ],
      answer: 3,
      explanation: '1000px 寬時查詢成立，但媒體查詢不會替裡面的規則增加特異性，也沒有「條件成立就優先」這回事。兩條規則的選擇器都是 `.title`，特異性相同，於是寫在後面的 `font-size: 20px` 勝出。衝突的宣告不會一起失效，串接一定會選出一個贏家。要讓 32px 生效，把查詢搬到基本樣式的後面。',
    },
    {
      id: 'rwd07-q3', prompt: '樣式表有這兩條查詢。視窗恰好 700px 寬時，哪一個敘述是對的？',
      code: { language: 'CSS', text: '@media (max-width: 700px) {\n  .sidebar { display: none; }\n}\n@media (min-width: 700px) {\n  .content { width: 70%; }\n}' },
      options: [
        '兩條查詢都成立：側欄被藏起來，內容卻只有 70% 寬',
        '只有 `max-width` 那一條成立：側欄被藏起來，內容維持原本的寬度',
        '只有 `min-width` 那一條成立：側欄還在，內容是 70% 寬',
        '兩條都不成立：700px 剛好落在兩個條件之間',
      ],
      answer: 0,
      explanation: '`max-width: 700px` 是 700px 以下，`min-width: 700px` 是 700px 以上，兩個都包含 700px 本身，所以恰好 700px 時兩條同時成立：側欄不見了，內容卻讓出 30% 的空白。兩條都不成立的「洞」是另一種寫法（例如 `max-width: 699px` 配 `min-width: 701px`）才會出現的。把第一條改成 `(width < 700px)`，兩個條件就剛好互補。',
    },
    {
      id: 'rwd07-q4', prompt: '哪一條查詢的意思是「視窗寬度在 600px 以上，而且小於 900px」？',
      options: [
        '`@media (min-width: 600px) and (max-width: 900px)`',
        '`@media (min-width: 600px), (max-width: 899px)`',
        '`@media (600px <= width < 900px)`',
        '`@media (600px < width <= 900px)`',
      ],
      answer: 2,
      explanation: '範圍語法的 `(600px <= width < 900px)` 照字面讀就是：600px 以上（含）、小於 900px（不含）。第一個選項的 `max-width: 900px` 包含 900px，多了 1px。第二個選項用的是逗號，逗號是「或」：300px 符合右邊、1200px 符合左邊，任何寬度都成立。最後一個選項的不等號方向相反：不包含 600px，卻包含 900px。',
    },
    {
      id: 'rwd07-q5', prompt: '使用者的瀏覽器預設字級是 16px，沒有改過。樣式表如下。這條查詢從視窗多寬開始成立？',
      code: { language: 'CSS', text: 'html { font-size: 10px; }\n@media (min-width: 30em) {\n  .menu { width: 25%; }\n}' },
      options: [
        '300px：30 乘上 `html` 設定的 10px',
        '30px：媒體查詢裡的 `em` 等於 1px',
        '要看 `.menu` 自己的字級：`em` 以套用規則的元素為基準',
        '480px：30 乘上瀏覽器預設的 16px',
      ],
      answer: 3,
      explanation: '媒體查詢裡的 `em` 以瀏覽器的初始字級（使用者的預設字級）為基準，不看樣式表替任何元素設定的 `font-size`，所以 `30em` 是 30 × 16 = 480px。300px 是把 `html` 的 10px 拿來算，那是一般宣告裡 `rem` 的算法；查詢的條件在選到任何元素之前就要判斷，不可能以 `.menu` 的字級為基準；`em` 也從來不等於 1px。',
    },
    {
      id: 'rwd07-q6', prompt: '你要替一個文章頁訂斷點。哪一種做法是內容導向斷點？',
      options: [
        '從最窄的版面開始慢慢拉寬，在一行文字長到不好讀的寬度放一個斷點',
        '查出最多人用的三種手機與平板的螢幕寬度，各放一個斷點',
        '每隔 100px 放一個斷點，確保每一種寬度都有專屬的樣式',
        '先做好 1920px 寬的版面，再用 `max-width` 的查詢一路往下修到手機',
      ],
      answer: 0,
      explanation: '內容導向斷點由內容決定：拉寬視窗，版面開始不好讀（行太長、卡片太扁、留白空洞）的那個寬度才是斷點。照裝置的清單訂，數字很快就過時，而且視窗不等於螢幕。每隔 100px 一個斷點製造了一大堆要維護、要測試的版面，卻不代表內容在那些寬度需要改變。從最寬的版面往下修是桌機優先的寫法，它說的是查詢的方向，沒有回答斷點該放在哪裡。',
    },
    {
      id: 'rwd07-q7', prompt: '什麼情況下，`.banner` 的 `transition-duration` 會是 0s？',
      code: { language: 'CSS', text: '.banner { transition-duration: 0.5s; }\n@media (prefers-reduced-motion: reduce) {\n  .banner { transition-duration: 0s; }\n}' },
      options: [
        '視窗窄到放不下動態效果的時候',
        '裝置的效能不夠時，由瀏覽器自動判斷',
        '使用者在系統設定裡開啟了減少動態效果的時候',
        '頁面第一次載入的時候；重新整理之後回到 0.5s',
      ],
      answer: 2,
      explanation: '`prefers-reduced-motion: reduce` 是偏好查詢：使用者在作業系統（或瀏覽器）裡開啟「減少動態效果」時成立，這時寫在後面的 0s 蓋過 0.5s。它和視窗的寬度無關，也不是瀏覽器依效能做的判斷；只要設定沒有變，重新整理幾次結果都一樣。',
    },
    {
      id: 'rwd07-q8', prompt: '視窗寬 1000px 時，`.card` 的寬度是容器的多少？',
      code: { language: 'CSS', text: '.card { width: 100%; }\n@media (min-width: 900px) {\n  .card { width: 25%; }\n}\n@media (min-width: 600px) {\n  .card { width: 50%; }\n}' },
      options: ['25%', '50%', '100%', '75%'],
      answer: 1,
      explanation: '1000px 寬時，`(min-width: 900px)` 與 `(min-width: 600px)` 兩個條件都成立。三條規則的選擇器相同、特異性相同，寫在最後面的 `width: 50%` 勝出。25% 是作者原本想要的結果，但要把 900px 的查詢移到 600px 的後面才得到：`min-width` 的查詢要由窄到寬排。100% 是兩條查詢都不成立（小於 600px）時的結果；75% 不會出現，宣告不會相加。',
    },
  ],
  webCode: {
    examples: [anatomy, order, boundary, contentBreakpoint, preferences],
    exercises: [exTwoColumns, exOrder, exOverlap, exThreeTiers],
  },
};
