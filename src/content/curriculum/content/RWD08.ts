import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD08 container queries (RWD-2). A web-code lesson of HTML and CSS only: the same card of the made-up 小島商店 is put
 * in containers of explicit widths (a 200px sidebar and a fluid main column, a 240px and a 480px block), so the facts
 * under each page (which card switches to two columns, what a query on the element itself does, which of two nested
 * containers answers, what 10cqi computes to) are measured in Chromium, three of the pages at two viewport widths.
 * Flexbox and grid are not prerequisites: where a page needs columns, the grid declarations are in the example or in the
 * kept starter CSS with a one-line explanation, and the learner's work is the container, the query, the name and the
 * unit. Style queries, scroll-state queries and clamp() are not taught here.
 */

const CARD = String.raw`<article class="card">
      <div class="thumb"></div>
      <div class="text">
        <h2>椰子餅乾</h2>
        <p>每盒 12 片，島上現烤。</p>
      </div>
    </article>`;

const PAGE_HTML = String.raw`<div class="page">
  <aside class="side">
    ${CARD}
  </aside>
  <main class="main">
    ${CARD}
  </main>
</div>`;

// ---- examples ---------------------------------------------------------------------------------------------------
const mediaLimit: WebExample = {
  id: 'rwd08-media-limit', title: '同一張卡片在側欄與主欄：媒體查詢只有一個答案',
  description: '小島商店的頁面：`.page` 用 `display: grid` 與 `grid-template-columns: 200px 1fr` 分成 200px 的側欄與佔滿其餘寬度的主欄，中間相隔 20px（Grid 是 RWD05 的內容，這裡只要知道它排出這兩欄）。兩欄裡是同一張 `.card`。視窗至少 600px 寬時，媒體查詢用同樣的 grid 寫法把卡片分成 120px 的圖片欄與文字欄。',
  viewport: { width: 760, height: 400 },
  widths: [760, 580],
  files: {
    html: PAGE_HTML,
    css: String.raw`body { margin: 0; }
.page {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 20px;
}
.card { background-color: #e3f2fd; }
.thumb { height: 80px; background-color: #ffb74d; }
.text { padding: 8px; }
.card h2, .card p { margin: 0; font-size: 16px; }
@media (min-width: 600px) {
  .card {
    display: grid;
    grid-template-columns: 120px 1fr;
  }
}`,
  },
  observe: [
    { check: 'style', selector: '.main .card', property: 'display', value: 'grid', label: '視窗寬 760px，媒體查詢成立：主欄（540px）的卡片左右並排（`display` 是 `grid`）' },
    { check: 'style', selector: '.side .card', property: 'display', value: 'grid', label: '同一個視窗只有一個答案：200px 側欄裡的卡片也跟著左右並排' },
    { check: 'box', selector: '.side .text', measure: 'width', value: 80, label: '側欄的卡片扣掉 120px 的圖片，文字只剩 200 − 120 = 80px 寬' },
    { do: 'resize', width: 580 },
    { check: 'style', selector: '.main .card', property: 'display', value: 'block', label: '視窗改成 580px，媒體查詢不成立：主欄還有 360px，卡片仍然變回上下排列' },
    { check: 'style', selector: '.side .card', property: 'display', value: 'block', label: '側欄的卡片也一起變回上下排列：兩張卡片永遠同進同出' },
  ],
};

const firstQuery: WebExample = {
  id: 'rwd08-first-query', title: '改成容器查詢：兩張卡片各問各的容器',
  description: '和上一個範例同一份 HTML。樣式表只改了兩處：`.side` 與 `.main` 多了 `container-type: inline-size`，成為容器；原本的 `@media (min-width: 600px)` 換成 `@container (min-width: 400px)`。',
  viewport: { width: 760, height: 400 },
  widths: [760, 580],
  files: {
    html: PAGE_HTML,
    css: String.raw`body { margin: 0; }
.page {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 20px;
}
.side, .main { container-type: inline-size; }
.card { background-color: #e3f2fd; }
.thumb { height: 80px; background-color: #ffb74d; }
.text { padding: 8px; }
.card h2, .card p { margin: 0; font-size: 16px; }
@container (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: 120px 1fr;
  }
}`,
  },
  observe: [
    { check: 'style', selector: '.main', property: 'container-type', value: 'inline-size', label: '`.main` 的 `container-type` 計算後是 `inline-size`：它是可以被查詢寬度的容器' },
    { check: 'style', selector: '.main .card', property: 'display', value: 'grid', label: '視窗寬 760px：主欄寬 760 − 200 − 20 = 540px，至少 400px，裡面的卡片左右並排' },
    { check: 'style', selector: '.side .card', property: 'display', value: 'block', label: '同一個視窗、同一條規則：側欄只有 200px，裡面的卡片維持上下排列' },
    { check: 'box', selector: '.side .thumb', measure: 'width', value: 200, label: '側欄卡片的圖片佔滿 200px，文字在它下面，不再被擠成 80px' },
    { do: 'resize', width: 580 },
    { check: 'style', selector: '.main .card', property: 'display', value: 'block', label: '視窗改成 580px：主欄剩 360px，不到 400px，主欄的卡片自己變回上下排列' },
  ],
};

const selfQuery: WebExample = {
  id: 'rwd08-self-query', title: '卡片自己當容器，與外面包一層容器',
  description: '兩張相同的卡片，都在 480px 寬的位置。A 把 `container-type` 直接寫在卡片 `#own` 上；B 的卡片 `#wrapped` 外面包了一層 `.slot`，由 `.slot` 當容器。容器查詢想在容器至少 400px 時讓 `.card` 左右並排，並把標題改成紅色。',
  widths: [600],
  files: {
    html: String.raw`<p class="label">A：卡片自己是容器</p>
<article class="card" id="own">
  <div class="thumb"></div>
  <div class="text">
    <h2>椰子餅乾</h2>
    <p>每盒 12 片，島上現烤。</p>
  </div>
</article>
<p class="label">B：卡片外面包一層容器</p>
<div class="slot">
  <article class="card" id="wrapped">
    <div class="thumb"></div>
    <div class="text">
      <h2>椰子餅乾</h2>
      <p>每盒 12 片，島上現烤。</p>
    </div>
  </article>
</div>`,
    css: String.raw`body { margin: 0; }
.label { margin: 8px 0 4px; font-size: 14px; }
#own {
  width: 480px;
  container-type: inline-size;
}
.slot {
  width: 480px;
  container-type: inline-size;
}
.card { background-color: #e3f2fd; }
.thumb { height: 60px; background-color: #ffb74d; }
.text { padding: 8px; }
.card h2, .card p { margin: 0; font-size: 16px; }
@container (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: 120px 1fr;
  }
  .card h2 { color: #c62828; }
}`,
  },
  observe: [
    { check: 'style', selector: '#own', property: 'display', value: 'block', label: 'A：`#own` 寬 480px，但它自己就是容器，查詢裡的 `.card` 規則沒有套用在它身上（`display` 仍是 `block`）' },
    { check: 'box', selector: '#own .thumb', measure: 'width', value: 480, label: 'A：卡片仍然上下排列，圖片佔滿 480px' },
    { check: 'style', selector: '#own h2', property: 'color', value: '#c62828', label: 'A：標題是 `#own` 的後代，問得到 `#own` 的寬度，所以變成紅色：規則只套用了一半' },
    { check: 'style', selector: '#wrapped', property: 'display', value: 'grid', label: 'B：`#wrapped` 問的是外面的 `.slot`（480px），左右並排' },
    { check: 'box', selector: '#wrapped .thumb', measure: 'width', value: 120, label: 'B：圖片欄寬 120px' },
  ],
};

const named: WebExample = {
  id: 'rwd08-named', title: '兩層容器：沒有名稱問最近的，指名問外層',
  description: '小島圖書館的書架 `.shelf` 寬 560px，用 `container: shelf / inline-size` 同時取名並宣告類型；裡面的 `.slot` 寬 260px，也是容器，但沒有名稱。兩條查詢的條件都是 `(min-width: 400px)`，成立時把一行文字的背景改成綠色：第一條沒有名稱，第二條指名 `shelf`。',
  widths: [600],
  files: {
    html: String.raw`<section class="shelf">
  <div class="slot">
    <article class="card">
      <h2>島嶼植物圖鑑</h2>
      <p id="near">沒有名稱的查詢：問最近的容器</p>
      <p id="outer">指名 shelf 的查詢：問外層的書架</p>
    </article>
  </div>
</section>`,
    css: String.raw`body { margin: 0; }
.shelf {
  width: 560px;
  container: shelf / inline-size;
  background-color: #eceff1;
}
.slot {
  width: 260px;
  container-type: inline-size;
}
.card { background-color: #e3f2fd; }
.card h2, .card p {
  margin: 0;
  padding: 4px 8px;
  font-size: 15px;
}
.card p { background-color: #ffffff; }
@container (min-width: 400px) {
  #near { background-color: #a5d6a7; }
}
@container shelf (min-width: 400px) {
  #outer { background-color: #a5d6a7; }
}`,
  },
  observe: [
    { check: 'style', selector: '.shelf', property: 'container-name', value: 'shelf', label: '`container: shelf / inline-size` 讓 `.shelf` 的 `container-name` 計算後是 `shelf`' },
    { check: 'style', selector: '.shelf', property: 'container-type', value: 'inline-size', label: '同一條簡寫也設定了類型：`.shelf` 的 `container-type` 是 `inline-size`' },
    { check: 'style', selector: '#near', property: 'background-color', value: '#ffffff', label: '沒有名稱的查詢問最近的容器 `.slot`（260px）：不成立，背景仍是白色' },
    { check: 'style', selector: '#outer', property: 'background-color', value: '#a5d6a7', label: '指名 `shelf` 的查詢跳過 `.slot`，問外層的 `.shelf`（560px）：成立，背景變成綠色' },
  ],
};

const units: WebExample = {
  id: 'rwd08-units', title: '容器單位：字級跟著容器的寬度',
  description: '三個 `.slot` 都是容器：`#small` 寬 200px，`#large` 寬 400px，`#fluid` 沒有寫寬度，填滿整個頁面。裡面的標題都是同一條規則 `font-size: 10cqi`，底下的色條是 `width: 50cqi`。',
  widths: [600, 360],
  files: {
    html: String.raw`<div class="slot" id="small">
  <h2 class="title">限時特價</h2>
  <div class="bar"></div>
</div>
<div class="slot" id="large">
  <h2 class="title">限時特價</h2>
  <div class="bar"></div>
</div>
<div class="slot" id="fluid">
  <h2 class="title">限時特價</h2>
  <div class="bar"></div>
</div>`,
    css: String.raw`body { margin: 0; }
.slot {
  container-type: inline-size;
  margin-bottom: 12px;
  background-color: #e3f2fd;
}
#small { width: 200px; }
#large { width: 400px; }
.title {
  margin: 0;
  font-size: 10cqi;
}
.bar {
  width: 50cqi;
  height: 8px;
  background-color: #1565c0;
}`,
  },
  observe: [
    { check: 'style', selector: '#large .title', property: 'font-size', value: '40px', label: '容器寬 400px：`10cqi` 是 400 × 10% = 40px' },
    { check: 'style', selector: '#small .title', property: 'font-size', value: '20px', label: '同一條規則放進 200px 的容器：`10cqi` 是 20px' },
    { check: 'box', selector: '#small .bar', measure: 'width', value: 100, label: '`50cqi` 是容器寬度的一半：200px 的容器裡色條寬 100px' },
    { check: 'style', selector: '#fluid .title', property: 'font-size', value: '60px', label: '頁面寬 600px 時，填滿頁面的 `#fluid` 寬 600px，標題是 60px' },
    { do: 'resize', width: 360 },
    { check: 'style', selector: '#fluid .title', property: 'font-size', value: '36px', label: '頁面改成 360px 寬：容器變窄，標題跟著變成 36px' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const EX1_HTML = String.raw`<section class="column" id="side">
  <div class="slot">
    ${CARD}
  </div>
</section>
<section class="column" id="main">
  <div class="slot">
    ${CARD}
  </div>
</section>`;

const EX1_BASE = String.raw`body { margin: 0; }
.column { margin-bottom: 16px; }
#side { width: 240px; }
#main { width: 480px; }
.card { background-color: #e3f2fd; }
.thumb { height: 80px; background-color: #ffb74d; }
.text { padding: 8px; }
.card h2, .card p { margin: 0; font-size: 16px; }
`;
const EX1_WIDE = String.raw`
  .card {
    display: grid;
    grid-template-columns: 160px 1fr;
  }
}`;
const EX1_NOTE = '/* 左右並排的寫法（不用改）：grid 把卡片分成 160px 的圖片欄與佔滿其餘寬度的文字欄 */\n';

const exFirstContainer: WebExercise = {
  id: 'rwd08-ex-first-container', title: '把媒體查詢換成容器查詢',
  statement: 'index.html 不能改。同一張商品卡片 `.card` 出現兩次：一次在寬 240px 的 `#side`，一次在寬 480px 的 `#main`，兩張的外面都包了一層 `.slot`。style.css 的最後已經寫好卡片左右並排的寫法（用 grid 把卡片分成 160px 的圖片欄與文字欄，大括號裡面不用改），但它放在 `@media (min-width: 400px)` 裡：預覽與檢查用的頁面都是 600px 寬，所以兩張卡片都橫排了，240px 那張的文字被擠得很窄。請改成容器查詢：（1）讓 `.slot` 成為 `inline-size` 類型的容器；（2）讓那一段規則改成在「容器至少 400px 寬」時才套用。完成後，`#side` 裡的卡片上下排列（圖片 `.thumb` 寬 240px，文字 `.text` 從卡片的左緣開始），`#main` 裡的卡片左右並排（圖片寬 160px，文字的左緣在卡片左緣往右 160px）。`body { margin: 0; }` 要保留。',
  hints: [
    '容器查詢要兩個部分都到位：先有一個宣告成容器的祖先，再有一條問容器的規則。現在兩個都還沒有。',
    '在 `.slot` 的規則裡寫 `container-type: inline-size;`。再看樣式表最後那一段：`@media` 問的是視窗，要換成問容器的那一個 at 規則。',
    '把 `@media (min-width: 400px)` 改成 `@container (min-width: 400px)`，大括號裡面的規則原封不動。',
  ],
  explanation: '`container-type: inline-size` 讓兩個 `.slot` 都成為可以被查詢寬度的容器。`@container (min-width: 400px)` 裡的 `.card` 規則，對每一張卡片各自往上找最近的祖先容器：`#side` 裡的 `.slot` 寬 240px，條件不成立，卡片維持上下排列，圖片佔滿 240px；`#main` 裡的 `.slot` 寬 480px，條件成立，卡片分成 160px 的圖片欄與 320px 的文字欄。頁面有多寬已經不重要：同一條規則在同一個頁面上給了兩個答案。',
  widths: [600],
  fixed: { html: EX1_HTML },
  starter: { css: EX1_BASE + String.raw`.slot {
}
` + EX1_NOTE + '@media (min-width: 400px) {' + EX1_WIDE },
  solution: { css: EX1_BASE + String.raw`.slot {
  container-type: inline-size;
}
` + EX1_NOTE + '@container (min-width: 400px) {' + EX1_WIDE },
  steps: [
    { check: 'style', selector: '.slot', property: 'container-type', value: 'inline-size', label: '`.slot` 是 `inline-size` 類型的容器' },
    { check: 'box', selector: '#side .thumb', measure: 'width', value: 240, label: '240px 的 `#side` 裡：卡片上下排列，圖片佔滿 240px' },
    { check: 'box', selector: '#side .text', measure: 'left', value: 0, from: '#side .card', label: '240px 的 `#side` 裡：文字從卡片的左緣開始（在圖片下面，不是右邊）' },
    { check: 'box', selector: '#main .thumb', measure: 'width', value: 160, label: '480px 的 `#main` 裡：卡片左右並排，圖片欄寬 160px' },
    { check: 'box', selector: '#main .text', measure: 'left', value: 160, from: '#main .card', label: '480px 的 `#main` 裡：文字在圖片右邊，左緣在卡片左緣往右 160px' },
  ],
  mistakes: [
    { files: { css: EX1_BASE + String.raw`.slot {
}
` + EX1_NOTE + '@container (min-width: 400px) {' + EX1_WIDE }, why: '把 `@media` 改成了 `@container`，卻沒有替任何元素寫 `container-type`。頁面上沒有容器可以問，這條規則永遠不會套用：兩張卡片都上下排列，瀏覽器也不會提示錯誤。' },
    { files: { css: EX1_BASE + String.raw`.slot {
  container-type: inline-size;
}
` + EX1_NOTE + '@media (min-width: 400px) {' + EX1_WIDE }, why: '`.slot` 已經是容器了，規則卻還留在 `@media` 裡。媒體查詢問的仍然是視窗：頁面寬 600px 時兩張卡片一起橫排，240px 那張照樣被擠窄。宣告容器之後，還要用 `@container` 去問它。' },
  ],
};

const BOOK = String.raw`<div class="slot">
    <article class="card">
      <div class="cover"></div>
      <div class="text">
        <h2>島嶼植物圖鑑</h2>
        <p>可借閱 14 天。</p>
      </div>
    </article>
  </div>`;

const EX2_REST = String.raw`.cover { height: 100px; background-color: #81c784; }
.text { padding: 8px; }
.card h2, .card p { margin: 0; font-size: 16px; }
/* 左右並排的寫法（不用改）：grid 把書卡分成 140px 的封面欄與佔滿其餘寬度的文字欄 */
@container (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: 140px 1fr;
  }
  .cover { height: 140px; }
}`;

const exSelfQuery: WebExercise = {
  id: 'rwd08-ex-self-query', title: '修好只生效一半的書卡',
  statement: 'index.html 不能改。小島圖書館的書卡 `.card` 放在 `.slot` 裡，`.slot` 填滿整個頁面。樣式表想讓書卡在容器至少 400px 寬時左右並排：封面 `.cover` 寬 140px、高 140px，文字 `.text` 在封面右邊。把預覽切到 600px 看看現在的樣子：封面變高了，書卡卻沒有變成左右並排，查詢只生效了一半。請找出原因並修好，`@container` 那一段的大括號裡面不用改。檢查會先在 360px 寬的頁面量一次（書卡上下排列，封面寬 360px、高 100px），再把頁面改成 600px 寬量一次（封面寬 140px、高 140px，文字的左緣在書卡左緣往右 140px）。檢查還會把同一張書卡放進 300px 與 420px 的欄位再量一次，所以書卡要問的是「它所在的那一格」，不是整個頁面。`body { margin: 0; }` 要保留。',
  hints: [
    '查詢裡有兩條規則：`.cover` 的那一條生效了，`.card` 的那一條沒有。這兩個元素和「容器」的關係有什麼不同？',
    '現在的容器是 `.card` 自己。容器查詢只能改容器的後代，元素不能查詢自己：`.cover` 是後代，`.card` 不是。',
    '把 `container-type: inline-size;` 從 `.card` 的規則搬到包在外面的 `.slot`：新增一條 `.slot { container-type: inline-size; }`，並刪掉 `.card` 裡的那一行。',
  ],
  explanation: '原本的容器是 `.card` 自己。`@container` 裡的每一條規則，都是讓元素去問「自己的祖先」裡最近的容器：`.cover` 的祖先裡有 `.card`，所以高度的規則生效；`.card` 往上找，祖先裡沒有任何容器，它自己的規則永遠不套用。把 `container-type` 搬到外面的 `.slot` 之後，`.card` 與 `.cover` 問的都是 `.slot`：頁面寬 360px 時 `.slot` 是 360px，書卡上下排列；600px 時條件成立，書卡分成 140px 的封面欄與文字欄。把書卡連同 `.slot` 搬進 300px 的側欄，它問到的就是 300px，不必改任何一行 CSS。',
  viewport: { width: 360, height: 640 },
  widths: [360, 600],
  fixed: { html: String.raw`<main>
  ${BOOK}
</main>` },
  starter: { css: String.raw`body { margin: 0; }
.card {
  container-type: inline-size;
  background-color: #e8f5e9;
}
` + EX2_REST },
  solution: { css: String.raw`body { margin: 0; }
.slot { container-type: inline-size; }
.card {
  background-color: #e8f5e9;
}
` + EX2_REST },
  steps: [
    { check: 'box', selector: '.cover', measure: 'width', value: 360, label: '頁面寬 360px：書卡上下排列，封面佔滿 360px' },
    { check: 'box', selector: '.cover', measure: 'height', value: 100, label: '頁面寬 360px：封面高 100px' },
    { do: 'resize', width: 600 },
    { check: 'box', selector: '.cover', measure: 'width', value: 140, label: '頁面寬 600px：書卡左右並排，封面欄寬 140px' },
    { check: 'box', selector: '.cover', measure: 'height', value: 140, label: '頁面寬 600px：封面高 140px' },
    { check: 'box', selector: '.text', measure: 'left', value: 140, from: '.card', label: '頁面寬 600px：文字在封面右邊，左緣在書卡左緣往右 140px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
.card {
  container-type: inline-size;
  background-color: #e8f5e9;
}
` + EX2_REST.replace('  .card {\n    display: grid;', '  .slot .card {\n    display: grid;') }, why: '以為是選擇器不夠明確，把查詢裡的 `.card` 改成 `.slot .card`。問題不在選擇器：容器仍然是 `.card` 自己，它往上找不到任何容器，規則怎麼寫都不會套用在它身上。要改的是 `container-type` 寫在誰身上。' },
    { files: { css: String.raw`body {
  margin: 0;
  container-type: inline-size;
}
.card {
  background-color: #e8f5e9;
}
` + EX2_REST }, why: '把容器搬到最外層的 `body`。在這一頁看起來是對的，因為 `body` 剛好和頁面一樣寬；但這等於又回去問整個頁面：書卡放進 300px 的側欄時，問到的仍是 600px 的 `body`，照樣橫排（另一份檢查不通過）。容器應該是緊貼著元件的那一層。' },
  ],
  variants: [{
    title: '同一張書卡放進 300px 的側欄與 420px 的主欄，各自依所在的容器決定排法',
    fixed: { html: String.raw`<aside style="width: 300px;">
  ${BOOK}
</aside>
<main style="width: 420px;">
  ${BOOK}
</main>` },
    steps: [
      { do: 'resize', width: 600 },
      { check: 'box', selector: 'aside .cover', measure: 'width', value: 300, label: '300px 的側欄裡，書卡上下排列' },
      { check: 'box', selector: 'main .cover', measure: 'width', value: 140, label: '420px 的主欄裡，書卡左右並排' },
      { check: 'box', selector: 'main .text', measure: 'left', value: 140, from: 'main .card', label: '主欄的文字在封面右邊' },
    ],
  }],
};

const PRODUCT = (name: string, desc: string) => String.raw`<div class="slot">
    <article class="card">
      <div class="thumb"></div>
      <div class="text">
        <h3>${name}</h3>
        <p class="desc">${desc}</p>
      </div>
    </article>
  </div>`;

const EX3_HTML = String.raw`<h2 class="label">主內容區的面板</h2>
<section class="panel" id="wide">
  ${PRODUCT('椰子餅乾', '每盒 12 片，島上現烤。')}
  ${PRODUCT('海鹽牛奶糖', '每包 20 顆，不黏牙。')}
</section>
<h2 class="label">側欄的面板</h2>
<section class="panel" id="narrow">
  ${PRODUCT('椰子餅乾', '每盒 12 片，島上現烤。')}
</section>`;

const EX3_TOP = String.raw`body { margin: 0; }
.label { margin: 8px 0 4px; font-size: 14px; }
/* 版面（不用改）：寬面板用 grid 把兩張卡片排成各 270px 的兩欄，窄面板只有一欄 */
#wide {
  width: 560px;
  display: grid;
  grid-template-columns: 270px 270px;
  gap: 20px;
}
#narrow { width: 340px; }
`;
const EX3_CARD = String.raw`.card { background-color: #e3f2fd; }
.thumb { height: 60px; background-color: #ffb74d; }
.text { padding: 8px; }
.card h3, .card p { margin: 0; font-size: 16px; }
.desc { display: none; }
/* 卡片的排法（不用改）：問最近的 .slot，至少 300px 就左右並排 */
@container (min-width: 300px) {
  .card {
    display: grid;
    grid-template-columns: 100px 1fr;
  }
}
/* 說明文字：面板至少 500px 寬才顯示 */
`;
const EX3_DESC = String.raw`
  .desc { display: block; }
}`;

const exNamed: WebExercise = {
  id: 'rwd08-ex-named', title: '指名外層的面板',
  statement: 'index.html 不能改。小島商店的商品面板 `.panel` 出現兩次：`#wide` 寬 560px，裡面的兩張卡片排成各 270px 的兩欄；`#narrow` 寬 340px，只有一張卡片。`.panel` 與每張卡片外面的 `.slot` 都已經是容器。卡片要上下還是左右排，問的是最近的 `.slot`（已經寫好，不要改壞）。商品的說明文字 `.desc` 預設隱藏，設計上要在「面板」至少 500px 寬時才顯示；但樣式表最後那條查詢沒有名稱，問到的是最近的 `.slot`，兩個面板裡的說明都出不來。請替 `.panel` 取一個容器名稱，並讓最後那條查詢指名問它。完成後：`#wide` 裡的 `.desc` 顯示（`display: block`）、卡片仍然上下排列（圖片 `.thumb` 寬 270px）；`#narrow` 裡的 `.desc` 仍然隱藏、卡片仍然左右並排（圖片欄寬 100px）。檢查還會換一組面板寬度再量一次，所以不能靠調整 500px 這個數字去湊。',
  hints: [
    '沒有名稱的查詢問的是最近的祖先容器。`.desc` 往上找，先遇到的是 `.slot` 還是 `.panel`？',
    '用 `container-name`（或簡寫 `container: 名稱 / inline-size`）替 `.panel` 取名，例如 `panel`。`.slot` 的 `container-type` 要留著，卡片的排法還要問它。',
    '`.panel { container: panel / inline-size; }`，最後那條查詢改成 `@container panel (min-width: 500px)`。',
  ],
  explanation: '`.desc` 的祖先裡有兩個容器：近的是 `.slot`，遠的是 `.panel`。沒有名稱的 `@container (min-width: 500px)` 問最近的 `.slot`：270px 與 340px 都不到 500px，所以說明永遠不顯示。替 `.panel` 取名 `panel` 之後，`@container panel (min-width: 500px)` 會跳過沒有這個名稱的 `.slot`，一路往上找到 `.panel`：`#wide` 是 560px，說明顯示；`#narrow` 是 340px，維持隱藏。卡片的排法那條查詢沒有名稱，仍然問 `.slot`：`#wide` 的每一欄只有 270px，卡片上下排列；`#narrow` 的 `.slot` 有 340px，卡片左右並排。同一個面板裡，兩條查詢問的是不同的容器，答案剛好相反。',
  widths: [600],
  fixed: { html: EX3_HTML },
  starter: { css: EX3_TOP + String.raw`.panel { container-type: inline-size; }
.slot { container-type: inline-size; }
` + EX3_CARD + '@container (min-width: 500px) {' + EX3_DESC },
  solution: { css: EX3_TOP + String.raw`.panel { container: panel / inline-size; }
.slot { container-type: inline-size; }
` + EX3_CARD + '@container panel (min-width: 500px) {' + EX3_DESC },
  steps: [
    { check: 'style', selector: '#wide .desc', property: 'display', value: 'block', label: '寬面板（560px，至少 500px）：說明文字顯示出來' },
    { check: 'style', selector: '#narrow .desc', property: 'display', value: 'none', label: '窄面板（340px，不到 500px）：說明文字維持隱藏' },
    { check: 'box', selector: '#wide .thumb', measure: 'width', value: 270, label: '寬面板的每一欄只有 270px：卡片仍然上下排列，圖片寬 270px' },
    { check: 'box', selector: '#narrow .thumb', measure: 'width', value: 100, label: '窄面板的 `.slot` 有 340px：卡片仍然左右並排，圖片欄寬 100px' },
  ],
  mistakes: [
    { files: { css: EX3_TOP + String.raw`.panel { container-type: inline-size; }
.slot { container-type: inline-size; }
` + EX3_CARD + '@container panel (min-width: 500px) {' + EX3_DESC }, why: '查詢寫了名稱 `panel`，卻沒有替任何容器取這個名字。瀏覽器往上找不到叫 `panel` 的容器，這條規則永遠不套用，也沒有錯誤訊息。名稱要兩邊都寫：容器上的 `container-name`，與查詢裡 `@container` 後面的名稱。' },
    { files: { css: EX3_TOP + String.raw`.panel { container-type: inline-size; }
` + EX3_CARD + '@container (min-width: 500px) {' + EX3_DESC }, why: '把 `.slot` 的 `container-type` 刪掉，讓最近的容器變成 `.panel`。說明文字的確照面板的寬度顯示了，但卡片排法的那條查詢也跟著改問 `.panel`：寬面板有 560px，裡面只有 270px 寬的卡片被迫左右並排。兩層容器都要留著，用名稱區分要問哪一層。' },
    { files: { css: EX3_TOP + String.raw`.panel { container-type: inline-size; }
.slot { container: panel / inline-size; }
` + EX3_CARD + '@container panel (min-width: 500px) {' + EX3_DESC }, why: '名稱取在 `.slot` 上了。指名 `panel` 的查詢找到的是最近一個叫 `panel` 的容器，也就是 `.slot`，和原本沒有名稱時問到的是同一個：270px 與 340px 都不到 500px，說明還是不顯示。名稱要取在想問的那一層。' },
  ],
  variants: [{
    title: '寬面板改成一欄（卡片的容器 560px）、窄面板改成 300px：說明文字仍然只看面板的寬度',
    fixed: { html: EX3_HTML.replace('id="wide"', 'id="wide" style="grid-template-columns: 560px;"').replace('id="narrow"', 'id="narrow" style="width: 300px;"') },
    steps: [
      { check: 'style', selector: '#wide .desc', property: 'display', value: 'block', label: '寬面板仍是 560px：說明顯示' },
      { check: 'box', selector: '#wide .thumb', measure: 'width', value: 100, label: '卡片的容器變成 560px：卡片左右並排' },
      { check: 'style', selector: '#narrow .desc', property: 'display', value: 'none', label: '窄面板 300px：說明隱藏' },
      { check: 'box', selector: '#narrow .thumb', measure: 'width', value: 100, label: '窄面板的卡片容器 300px：卡片左右並排' },
    ],
  }],
};

const PROMO = String.raw`<div class="slot">
      <article class="promo">
        <h2 class="title">限時特價</h2>
        <p class="detail">椰子餅乾買二送一，只到週日。</p>
      </article>
    </div>`;
const EX4_HTML = String.raw`<div class="page">
  <aside class="side">
    ${PROMO}
  </aside>
  <main class="main">
    ${PROMO}
  </main>
</div>`;

const EX4_TOP = String.raw`body { margin: 0; }
/* 版面（不用改）：grid 把頁面分成 300px 的側欄與佔滿其餘寬度的主欄，中間相隔 20px */
.page {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
}
.promo { background-color: #fff8e1; }
`;

const exUnits: WebExercise = {
  id: 'rwd08-ex-units', title: '會跟著容器調整的促銷卡',
  statement: 'index.html 不能改。小島商店的促銷卡 `.promo` 出現兩次，外面各包一層 `.slot`：一張在 300px 的側欄 `.side`，一張在佔滿其餘寬度的主欄 `.main`（頁面寬 840px 時主欄是 840 − 300 − 20 = 520px；640px 時是 320px）。現在標題 `.title` 固定是 20px，說明 `.detail` 一律隱藏。請完成 style.css，讓促銷卡依自己所在的 `.slot` 調整：（1）`.slot` 是 `inline-size` 類型的容器；（2）`.title` 的字級是容器寬度的 5%，所以在 520px 的容器裡是 26px，在 300px 的容器裡是 15px；（3）`.detail` 只在容器至少 400px 寬時顯示（`display: block`），其他時候維持隱藏。檢查會在頁面寬 840px 時量兩張卡片，再把頁面改成 640px 量主欄那一張（字級 16px、說明隱藏）；還會換一個側欄寬度再量一次，所以不能替兩欄各寫一個固定的字級。版面的那幾行與 `body { margin: 0; }` 要保留。',
  hints: [
    '三件事各用這一課的一樣東西：宣告容器的屬性、容器單位、容器查詢。先讓 `.slot` 成為容器，後面兩件才有對象可以問。',
    '容器寬度的 1% 是 `1cqi`。「容器至少 400px 寬」寫成 `@container (min-width: 400px)` 或 `@container (width >= 400px)`。',
    '`.slot { container-type: inline-size; }`；`.title` 的字級改成 `5cqi`；最後加上 `@container (min-width: 400px) { .detail { display: block; } }`。',
  ],
  explanation: '`.slot` 成為容器之後，`.title` 的 `5cqi` 以最近的祖先容器為準：主欄的 `.slot` 寬 520px，字級是 520 × 5% = 26px；側欄的 `.slot` 寬 300px，字級是 15px。`@container (min-width: 400px)` 讓 `.detail` 只在容器夠寬時顯示：主欄 520px 成立，側欄 300px 不成立。頁面改成 640px 寬時，主欄剩 640 − 320 = 320px：標題自動變成 16px，說明也收了起來。樣式表裡沒有任何一個數字提到頁面多寬或卡片放在哪一欄，這張卡片搬到哪裡都能用。',
  viewport: { width: 840, height: 400 },
  widths: [840, 640],
  fixed: { html: EX4_HTML },
  starter: { css: EX4_TOP + String.raw`.title { margin: 0; font-size: 20px; }
.detail { margin: 0; font-size: 16px; display: none; }
` },
  solution: { css: EX4_TOP + String.raw`.slot { container-type: inline-size; }
.title { margin: 0; font-size: 5cqi; }
.detail { margin: 0; font-size: 16px; display: none; }
@container (min-width: 400px) {
  .detail { display: block; }
}
` },
  steps: [
    { check: 'style', selector: '.main .title', property: 'font-size', value: '26px', label: '頁面寬 840px：主欄的容器寬 520px，標題字級是它的 5%（26px）' },
    { check: 'style', selector: '.side .title', property: 'font-size', value: '15px', label: '頁面寬 840px：側欄的容器寬 300px，標題字級是 15px' },
    { check: 'style', selector: '.main .detail', property: 'display', value: 'block', label: '頁面寬 840px：主欄的容器至少 400px，說明顯示' },
    { check: 'style', selector: '.side .detail', property: 'display', value: 'none', label: '頁面寬 840px：側欄的容器不到 400px，說明隱藏' },
    { do: 'resize', width: 640 },
    { check: 'style', selector: '.main .title', property: 'font-size', value: '16px', label: '頁面寬 640px：主欄的容器剩 320px，標題字級變成 16px' },
    { check: 'style', selector: '.main .detail', property: 'display', value: 'none', label: '頁面寬 640px：主欄的容器不到 400px，說明隱藏' },
  ],
  mistakes: [
    { files: { css: EX4_TOP + String.raw`.title { margin: 0; font-size: 5vw; }
.detail { margin: 0; font-size: 16px; display: none; }
@media (min-width: 400px) {
  .detail { display: block; }
}
` }, why: '用了 `vw` 與 `@media`。這兩樣問的都是視窗：頁面寬 840px 時，兩張卡片的標題都是 840 × 5% = 42px，說明也一起顯示，300px 側欄裡的那一張完全沒有依自己的寬度調整。要跟著容器，單位用 `cqi`，查詢用 `@container`。' },
    { files: { css: EX4_TOP + String.raw`.title { margin: 0; font-size: 5cqi; }
.detail { margin: 0; font-size: 16px; display: none; }
@container (min-width: 400px) {
  .detail { display: block; }
}
` }, why: '單位與查詢都寫對了，卻忘了讓 `.slot` 成為容器。沒有容器時，`@container` 的規則永遠不套用，說明出不來；容器單位則改以視窗為準，`5cqi` 變成 840 × 5% = 42px。兩者都不會有錯誤訊息，所以要先檢查 `container-type`。' },
    { files: { css: EX4_TOP + String.raw`.title {
  margin: 0;
  container-type: inline-size;
  font-size: 5cqi;
}
.detail { margin: 0; font-size: 16px; display: none; }
@container (min-width: 400px) {
  .detail { display: block; }
}
` }, why: '把 `container-type` 寫在 `.title` 自己身上。容器單位和容器查詢一樣，問的是祖先：`.title` 往上找不到容器，`5cqi` 改以視窗為準（42px）；`.detail` 不在 `.title` 裡面，也沒有容器可以問。容器要是同時包住標題與說明的那一層 `.slot`。' },
  ],
  variants: [{
    title: '側欄換成 200px（主欄變成 620px），字級與說明仍然跟著各自的容器',
    fixed: { html: EX4_HTML.replace('<div class="page">', '<div class="page" style="grid-template-columns: 200px 1fr;">') },
    steps: [
      { check: 'style', selector: '.side .title', property: 'font-size', value: '10px', label: '側欄的容器 200px：標題 10px' },
      { check: 'style', selector: '.main .title', property: 'font-size', value: '31px', label: '主欄的容器 620px：標題 31px' },
      { check: 'style', selector: '.main .detail', property: 'display', value: 'block', label: '主欄的說明顯示' },
      { check: 'style', selector: '.side .detail', property: 'display', value: 'none', label: '側欄的說明隱藏' },
    ],
  }],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD08: LessonContent = {
  lessonId: 'RWD08',
  motivation: '同一張商品卡片，放進 200px 的側欄與 540px 的主欄，需要的排法並不一樣；媒體查詢只知道視窗多寬，只能給兩張卡片同一個答案。這一課用 `container-type` 把元素宣告成容器，再用 `@container` 讓卡片依「自己被放進多寬的地方」決定排法。學完之後，你能做出放在側欄或主內容都會自動調整的卡片元件，並說得出容器查詢與媒體查詢各該用在哪裡。',
  sections: [
    {
      id: 'rwd08-problem-section', title: '媒體查詢只認得視窗',
      blocks: [
        { type: 'p', text: 'RWD07 的媒體查詢（media query）問的是視窗（viewport）：視窗至少多寬，就套用哪一組規則。拿它來決定整個頁面的版面很合適：手機上一欄，寬螢幕上多一個側欄。但頁面是由許多可以重複使用的小單位組成的，例如商品卡片、留言、搜尋框，這種單位叫做元件（component）。同一個元件常常同時出現在頁面上寬度差很多的地方，這時候「視窗多寬」就不是它需要的答案。' },
        { type: 'example', id: 'rwd08-media-limit' },
        { type: 'p', text: '預覽一開始是 760px 寬的頁面。媒體查詢 `(min-width: 600px)` 成立，於是每一張 `.card` 都被分成 120px 的圖片欄與文字欄。主欄有 760 − 200 − 20 = 540px，左右並排很合適；側欄只有 200px，扣掉圖片，文字只剩 80px，一行擠不下幾個字。按預覽上方的 580px：媒體查詢不成立，兩張卡片一起變回上下排列，可是這時主欄還有 360px。兩張卡片永遠同進同出，因為它們問的是同一個視窗，得到的當然是同一個答案。' },
        { type: 'p', text: '只用媒體查詢也能硬修：再寫一條 `.side .card` 的例外，把側欄裡的卡片改回來。但這樣一來，卡片的 CSS 必須知道自己會被放在哪些地方；之後側欄改寬、主欄改成三欄，或是把卡片放進另一個頁面，每一個斷點（breakpoint）的數字都得重新推算。卡片真正想問的其實很單純：「我被放進去的這個地方有多寬？」容器查詢（container query）問的就是這件事。' },
        { type: 'table', head: ['頁面寬度', '媒體查詢 (min-width: 600px)', '側欄的卡片（200px）', '主欄的卡片'], rows: [
          ['760px', '成立', '左右並排，文字只剩 80px', '左右並排（主欄 540px）'],
          ['580px', '不成立', '上下排列', '上下排列（主欄其實還有 360px）'],
        ] },
        { type: 'callout', tone: 'tip', title: '動手試：換一個斷點也救不了', text: '按「動手改這個範例」，把 `600px` 改成 `900px` 再執行，然後切到 760px 的寬度：這次側欄的卡片不擠了，540px 的主欄卻也只能上下排列。不管把數字改成多少，兩張卡片的排法永遠一樣。問題不在斷點選得好不好，而在媒體查詢問錯了對象。' },
      ],
    },
    {
      id: 'rwd08-query-section', title: '宣告容器，寫出第一個容器查詢',
      blocks: [
        { type: 'p', text: '容器查詢要寫兩個地方。第一步，選出「它的寬度該決定元件排法」的那個元素，替它寫 `container-type: inline-size`，把它宣告成容器（container）。`container-type` 就是容器類型；`inline-size` 是行內方向的大小，在中文、英文這種橫書的頁面就是寬度。第二步，用 `@container` 寫條件與規則，語法和 `@media` 幾乎一樣，只是括號裡問的是容器的寬度：' },
        { type: 'list', items: [
          '`.side, .main { container-type: inline-size; }`：側欄與主欄各自成為容器。',
          '`@container (min-width: 400px) { .card { … } }`：大括號裡的規則，只在「容器至少 400px 寬」時套用。',
          '哪一個容器？每一個符合選擇器的元素各自往上找，問離自己最近的那個祖先容器。',
        ] },
        { type: 'example', id: 'rwd08-first-query' },
        { type: 'p', text: 'HTML 和上一個範例完全相同，樣式表只改了那兩處。頁面寬 760px 時，同一條 `.card` 規則有了兩個答案：側欄的卡片問 `.side`，200px 不到 400px，維持上下排列，圖片佔滿 200px；主欄的卡片問 `.main`，540px 成立，左右並排。按 580px：主欄剩下 580 − 220 = 360px，主欄的卡片自己變回上下排列。注意 400px 這個數字的意義變了：它說的不再是整個視窗，而是「這張卡片至少要多寬，左右並排才好看」：這是卡片自己的需求，和頁面長什麼樣子無關。' },
        { type: 'p', text: '這裡說的容器，和 flex 容器、grid 容器是不同的概念：任何元素只要寫了 `container-type`，就能被它的後代查詢，和它用什麼方式排版無關。另外有三個細節：' },
        { type: 'table', head: ['細節', '說明'], rows: [
          ['量的是內容區', '查詢比的是容器內容區（content box）的寬度，不含內距與邊框。容器寫 `box-sizing: border-box; width: 400px; padding: 0 20px;` 時，內容區只有 360px，`(min-width: 400px)` 不成立。'],
          ['範圍語法也能用', 'RWD07 的範圍語法在這裡一樣有效：`@container (width >= 400px)` 和 `@container (min-width: 400px)` 意思相同。'],
          ['不增加特異性', '和媒體查詢一樣，`@container` 不會讓裡面的規則比較「強」，同樣特異性的規則仍然是後寫的贏：把容器查詢寫在基本樣式的後面。'],
        ] },
        { type: 'callout', tone: 'warning', title: '忘了宣告容器，查詢永遠不成立', text: '只寫 `@container (min-width: 400px) { … }`，卻沒有任何祖先寫 `container-type`，是最常見的錯誤。這時元素往上找不到可以問的容器，大括號裡的規則永遠不會套用，瀏覽器也不會顯示任何錯誤，它不會退而求其次去問視窗。容器查詢沒有反應時，第一件事是到開發者工具選取那個祖先，確認它的 `container-type` 計算後不是預設的 `normal`。' },
        { type: 'callout', tone: 'tip', title: '動手試：拿掉容器', text: '把範例裡 `.side, .main { container-type: inline-size; }` 整行刪掉再執行：不管切到哪一個寬度，兩張卡片都上下排列。再把它加回來，改成只寫 `.main`：主欄的卡片恢復正常，側欄的卡片找不到容器，規則對它永遠不套用。' },
      ],
    },
    {
      id: 'rwd08-rules-section', title: '兩條規則：不能查詢自己，寬度不能靠內容',
      blocks: [
        { type: 'p', text: '`@container` 裡的規則，是讓元素依「祖先容器」的寬度改變樣式。尋找容器時，元素是從自己的父元素開始往上找的，所以一個元素就算自己是容器，也問不到自己：元素不能查詢自己。初學時最常犯的錯，就是把 `container-type` 寫在卡片上，又想在查詢裡改卡片自己的排法。' },
        { type: 'example', id: 'rwd08-self-query' },
        { type: 'p', text: 'A 的 `#own` 寬 480px，條件明明成立，卡片卻還是上下排列：它自己是容器，往上又找不到別的容器，`.card` 那條規則對它不套用。可是它的標題變紅了，因為 `h2` 是 `#own` 的後代，問得到 `#own`。「查詢裡有些規則生效、有些沒有」正是這個錯誤的特徵。B 多包了一層 `.slot` 當容器，`#wrapped` 與它的標題問的都是 `.slot`，兩條規則都生效。所以做元件時有兩種常見的安排：像上一節那樣，讓放置元件的區域（側欄、主欄）當容器；或是像 B，讓元件自己帶著一層專門當容器的外殼，搬到哪裡都能用。' },
        { type: 'p', text: '為什麼有這條規則，又為什麼一定要先寫 `container-type`？想像卡片可以依自己的寬度改變內容：寬度夠了就把文字放大，文字放大又把卡片撐寬，撐寬之後查詢的答案又可能改變，沒完沒了。瀏覽器要避免這種循環，就要求容器先做一個承諾：「我的寬度不由我的內容決定。」`container-type: inline-size` 就是這個承諾（規格裡稱為 containment）。有了它，瀏覽器可以先算出容器的寬度，再回答查詢，最後才排容器裡面的內容。' },
        { type: 'p', text: '這個承諾有代價。一般的區塊本來就是填滿父元素，寬度和內容無關，宣告成容器之後寬度不會改變。但有些元素的寬度是由內容撐出來的：行內區塊（`inline-block`）、沒有寫寬度的絕對定位元素、橫向 flex 容器裡沒有寫寬度的項目。它們一旦成為 `inline-size` 容器，瀏覽器計算寬度時會把內容當成 0px 寬，結果整個元素縮成 0px。' },
        { type: 'callout', tone: 'warning', title: '靠內容撐開的元素當了容器，寬度會變成 0', text: '替一個元素加上 `container-type: inline-size` 之後它突然不見了，或是裡面的文字擠成一個字一行，多半就是這個原因：它原本的寬度是內容撐出來的。解法是讓容器的寬度有別的來源：給它明確的 `width`（px 或百分比都可以），或讓它是會填滿父元素的一般區塊。也因為如此，容器通常選版面上的「格子」（一欄、一個區域、一層外殼），而不是選剛好包住文字的小元素。' },
        { type: 'table', head: ['container-type 的值', '可以查詢什麼', '對容器的要求'], rows: [
          ['`normal`（預設）', '不能查詢寬度或高度', '沒有'],
          ['`inline-size`', '寬度（行內方向的大小）', '寬度不能由內容決定；高度照常由內容決定'],
          ['`size`', '寬度與高度', '寬度與高度都不能由內容決定：沒有另外設定高度時，容器的高度會是 0'],
        ] },
        { type: 'p', text: '絕大多數的元件只需要問寬度，所以這一課都用 `inline-size`。`size` 只有在容器的高度本來就固定時才用得上。' },
        { type: 'callout', tone: 'tip', title: '動手試：讓容器縮成 0', text: '在範例裡，把 `.slot` 規則的 `width: 480px;` 換成 `display: inline-block;` 再執行。行內區塊的寬度本來由內容決定，現在內容被當成 0px 寬，`.slot` 整個縮成 0px：B 的圖片不見了，文字擠成一個字一行。再把 `.slot` 的 `container-type: inline-size;` 那一行也刪掉：`.slot` 不再是容器，寬度改成剛好包住卡片的內容。' },
      ],
    },
    {
      id: 'rwd08-name-section', title: '容器名稱：指定要問哪一個容器',
      blocks: [
        { type: 'p', text: '頁面稍微複雜一點，容器就會一層包一層：整個內容區是容器，裡面每一格又是容器。沒有名稱的 `@container` 一律問最近的祖先容器，但有時候想問的是外面那一層，例如「整個書架夠寬時，才顯示每本書的簡介」。這時替容器取名字：在容器上寫 `container-name: shelf`，查詢寫成 `@container shelf (min-width: 400px)`，名稱放在 `@container` 與括號之間。名稱是自己取的識別字，不加引號。' },
        { type: 'p', text: '`container-name` 與 `container-type` 可以用簡寫 `container` 一次寫完：名稱在前，斜線之後是類型，例如 `container: shelf / inline-size`。' },
        { type: 'example', id: 'rwd08-named' },
        { type: 'p', text: '兩條查詢的條件一模一樣，都是 `(min-width: 400px)`，差別只在問誰。第一行文字用的是沒有名稱的查詢：它問最近的 `.slot`，260px 不成立，背景維持白色。第二行指名 `shelf`：瀏覽器從它的父元素往上找，跳過沒有這個名稱的 `.slot`，找到 `.shelf`，560px 成立，背景變成綠色。同一個元素可以同時被好幾條查詢影響，每一條各問各的容器。' },
        { type: 'table', head: ['寫法', '問的是誰', '找不到時'], rows: [
          ['`@container (min-width: 400px)`', '最近的祖先容器', '規則不套用'],
          ['`@container shelf (min-width: 400px)`', '最近一個名稱是 `shelf` 的祖先容器，中間其他的容器都跳過', '規則不套用'],
        ] },
        { type: 'callout', tone: 'warning', title: '名稱打錯，或簡寫只寫了名稱', text: '名稱兩邊要一致：查詢寫 `@container shelves (…)`，容器卻叫 `shelf`，瀏覽器找不到叫這個名字的容器，規則永遠不套用，同樣沒有任何錯誤訊息。另一個陷阱是簡寫只寫一半：`container: shelf` 沒有斜線與類型，類型會回到預設的 `normal`，這個元素就不是可以查詢寬度的容器了，連原本寫在前面的 `container-type: inline-size` 也會被它蓋掉。用簡寫時，把 `/ inline-size` 一起寫上。' },
        { type: 'callout', tone: 'tip', title: '動手試：改寬度，再改名稱', text: '把範例裡 `.slot` 的 `width: 260px` 改成 `420px` 再執行：最近的容器也超過 400px 了，兩行都變成綠色。改回 260px，再把查詢裡的 `shelf` 改成 `shelves`：第二行變回白色，主控台沒有任何訊息。' },
      ],
    },
    {
      id: 'rwd08-units-section', title: '容器單位：跟著容器縮放的長度',
      blocks: [
        { type: 'p', text: '容器查詢像開關：過了某個寬度，就換一組規則。有些東西更適合連續地變化，例如標題的字級、卡片的內距：容器寬一點就大一點。這要用容器單位（container query length units）。最常用的是 `cqi`：`1cqi` 是容器行內方向大小的 1%，在橫書的頁面就是容器寬度的 1%。容器寬 400px 時，`10cqi` 是 40px；同一條規則放進 200px 的容器，就是 20px。' },
        { type: 'example', id: 'rwd08-units' },
        { type: 'p', text: '三個標題是同一條 `font-size: 10cqi`，大小卻不同：20px、40px，第三個跟著頁面的寬度走。按預覽上方的 600px 與 360px：`#fluid` 的標題在 60px 與 36px 之間切換，前兩個因為容器的寬度固定，完全不動。這就是它和 RWD02 的 `vw` 的差別：`vw` 看視窗，`cqi` 看容器。它和百分比也不一樣：`font-size` 的百分比是相對於父元素的字級，不是寬度；容器單位則可以用在任何接受長度的屬性上，字級、內距、間距都行，例如範例裡色條的 `width: 50cqi`。' },
        { type: 'table', head: ['單位', '1 個單位等於'], rows: [
          ['`cqw`', '容器寬度的 1%'],
          ['`cqh`', '容器高度的 1%'],
          ['`cqi`', '容器行內方向大小的 1%（橫書時和 `cqw` 相同）'],
          ['`cqb`', '容器區塊方向大小的 1%（橫書時和 `cqh` 相同）'],
          ['`cqmin`、`cqmax`', '`cqi` 與 `cqb` 之中比較小、比較大的那一個'],
        ] },
        { type: 'p', text: '容器單位找容器的方式和查詢相同：以最近的祖先容器為準，元素自己是容器也不算；它沒有指名的寫法。和高度有關的 `cqh`、`cqb` 需要 `size` 類型的容器：祖先裡只有 `inline-size` 的容器時，它們量不到容器的高度，會改以視窗的高度為準。' },
        { type: 'callout', tone: 'warning', title: '沒有容器時，容器單位會改看視窗', text: '`@container` 找不到容器時，規則是不套用；容器單位找不到容器時卻不會失效，而是改以視窗的大小為準，`10cqi` 悄悄變成視窗寬度的 10%，效果和 `10vw` 一樣。畫面上字還是有大小，只是跟錯了對象，很容易沒發現。用了 `cqi` 卻發現字級是跟著整個頁面在變，先檢查祖先有沒有寫 `container-type`。' },
        { type: 'callout', tone: 'note', title: '只用容器單位的字級沒有上下限', text: '`font-size: 5cqi` 在 200px 的容器裡只有 10px，小到難以閱讀；在 1200px 的容器裡是 60px，又大得離譜。實際的頁面會替這種會縮放的字級設定下限與上限，做法是 RWD09 的內容。這一課的練習只用單純的 `cqi`，重點在看懂它跟著誰變。' },
      ],
    },
    {
      id: 'rwd08-compare-section', title: '元件層級響應：和媒體查詢分工',
      blocks: [
        { type: 'p', text: '把這一課的做法合起來，就是元件層級響應（component-level responsiveness）：元件把自己的斷點帶在身上。「容器至少 400px 就左右並排」這條規則跟著卡片走，卡片放進側欄、主欄、三欄的版面或對話框，都依當下拿到的寬度自己調整，放它的頁面一行 CSS 都不必為它多寫。頁面版面之後怎麼改，也不會弄壞它。' },
        { type: 'p', text: '容器查詢並不取代媒體查詢，兩者問的對象不同，各有各的工作：' },
        { type: 'table', head: ['比較', '媒體查詢', '容器查詢'], rows: [
          ['問的對象', '視窗的大小，以及使用者的偏好設定', '祖先容器的大小'],
          ['事前準備', '不需要', '容器要先寫 `container-type`'],
          ['規則能套用在', '頁面上的任何元素', '容器的後代（不含容器自己）'],
          ['對應的相對單位', '`vw`、`vh`', '`cqw`、`cqi` 等容器單位'],
          ['適合的工作', '整個頁面的版面：幾欄、側欄要不要出現、導覽列的形式；深色模式、減少動態等偏好', '可重複使用的元件：卡片、清單項目、表單區塊在不同寬度的排法'],
        ] },
        { type: 'p', text: '實際的頁面是兩者接力。以這一課的頁面為例：媒體查詢（或 RWD05、RWD06 的 Grid）決定頁面有沒有側欄、每一欄多寬；每一欄是一個容器；欄裡的卡片再用容器查詢，依那一欄的寬度決定自己的排法。視窗變窄時，媒體查詢把側欄收掉，主欄變寬或變窄，卡片跟著主欄反應，兩邊都不需要知道對方的數字。至於 `prefers-color-scheme`、`prefers-reduced-motion` 這類偏好查詢，問的是使用者的設定而不是任何元素的大小，只能寫在 `@media` 裡。' },
        { type: 'p', text: '動手之前可以先問自己一個問題：這條規則是關於「整個頁面」，還是關於「一個元件」？前者用媒體查詢，後者用容器查詢。想多練習視窗寬度與斷點的配合，可以到互動實驗島的響應式版面模擬器，拖動寬度觀察版面在哪裡切換。' },
        { type: 'list', ordered: true, items: [
          '容器查詢沒有反應時，先看祖先裡有沒有元素寫了 `container-type`：沒有容器，規則永遠不套用。',
          '確認要改樣式的元素是容器的後代，而不是容器自己。',
          '有名稱的查詢，檢查名稱兩邊是否一致，以及 `container` 簡寫有沒有寫上類型。',
          '條件比的是容器內容區的寬度：容器有內距時，要把內距扣掉再比。',
          '容器突然縮成 0px 寬，代表它原本的寬度是內容撐出來的：給它明確的寬度。',
        ] },
        { type: 'callout', tone: 'tip', title: '動手試：回頭把第一個範例修好', text: '回到這一課的第一個範例，不看第二個範例，自己把它改成容器查詢：替 `.side` 與 `.main` 加上 `container-type: inline-size`，把 `@media (min-width: 600px)` 換成 `@container (min-width: 400px)`。執行後在 760px 與 580px 之間切換，確認側欄的卡片始終上下排列，主欄的卡片只在主欄至少 400px 時左右並排。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'rwd08-q1', prompt: '同一個頁面上，同一張 `.card` 同時出現在 200px 的側欄與 540px 的主欄。想讓主欄那張左右並排、側欄那張上下排列，而且卡片的 CSS 不必知道自己被放在哪一欄。該怎麼做？',
      options: [
        '用 `@media (min-width: 400px)`，視窗夠寬時讓 `.card` 左右並排',
        '讓兩欄成為容器，用 `@container (min-width: 400px)` 讓 `.card` 依所在容器的寬度決定排法',
        '把 `.card` 的寬度寫成 `50vw`，讓它跟著視窗縮放',
        '在 `.card` 上寫 `container-type: inline-size`，再用 `@container` 改 `.card` 自己的 `display`',
      ],
      answer: 1,
      explanation: '兩張卡片在同一個視窗裡，卻需要不同的答案，只有「問所在容器多寬」做得到：兩欄各自是容器，每張卡片問自己的那一欄。媒體查詢問的是視窗，同一個視窗只有一個答案，兩張卡片會一起並排或一起直排；`50vw` 同樣只看視窗，而且改的是寬度不是排法；把 `container-type` 寫在 `.card` 自己身上沒有用，因為元素不能查詢自己，查詢裡 `.card` 的規則不會套用在它身上。',
    },
    {
      id: 'rwd08-q2', prompt: '`.card` 寬 480px，它的祖先都不是容器。套用這段 CSS 之後，結果是什麼？',
      code: { language: 'CSS', text: '.card { container-type: inline-size; }\n@container (min-width: 400px) {\n  .card { display: grid; }\n  .card h2 { color: red; }\n}' },
      options: [
        '`.card` 變成 grid，裡面的 `h2` 也變成紅色',
        '兩條規則都沒有套用',
        '`.card` 變成 grid，`h2` 的顏色不變',
        '`.card` 的 `display` 不變，只有裡面的 `h2` 變成紅色',
      ],
      answer: 3,
      explanation: '查詢裡的每條規則，都是讓元素去問自己的祖先容器。`h2` 的祖先裡有 `.card` 這個容器，480px 至少 400px，所以變成紅色。`.card` 自己往上找不到任何容器（它自己不算），`display: grid` 那條規則對它不套用。「只生效一半」正是把 `container-type` 寫在元件自己身上的特徵；要兩條都生效，得在 `.card` 外面包一層元素當容器。',
    },
    {
      id: 'rwd08-q3', prompt: 'HTML 的結構是 `.main` 裡有 `.slot`，`.slot` 裡有 `.title` 與 `.note` 兩個元素。套用這段 CSS 之後，哪些元素變成綠色？',
      code: { language: 'CSS', text: '.main { width: 720px; container: main / inline-size; }\n.slot { width: 320px; container-type: inline-size; }\n@container (min-width: 600px) {\n  .title { color: green; }\n}\n@container main (min-width: 600px) {\n  .note { color: green; }\n}' },
      options: ['只有 `.note`', '只有 `.title`', '`.title` 與 `.note` 都變綠', '兩個都不變'],
      answer: 0,
      explanation: '沒有名稱的查詢問最近的祖先容器：`.title` 問到的是 `.slot`，320px 不到 600px，不變色。指名 `main` 的查詢會跳過沒有這個名稱的 `.slot`，問到 `.main`，720px 成立，所以 `.note` 變綠。兩條查詢的條件相同，答案不同，是因為問的對象不同；`.main` 用簡寫同時取了名稱並宣告了 `inline-size` 類型，所以是有效的容器。',
    },
    {
      id: 'rwd08-q4', prompt: '視窗寬 1000px。某個 `container-type: inline-size` 的容器寬 300px，裡面的標題寫了 `font-size: 8cqi`。標題的字級計算後是多少？',
      options: ['8px', '80px', '24px', '37.5px'],
      answer: 2,
      explanation: '`1cqi` 是容器行內方向大小（橫書時就是寬度）的 1%，容器寬 300px，所以 `8cqi` 是 300 × 8% = 24px，和視窗多寬無關。80px 是把它當成 `8vw`（1000 × 8%）的結果，那是找不到容器時才會發生的事；8px 是把單位當成 px；37.5px 是 300 ÷ 8，方向算反了。',
    },
    {
      id: 'rwd08-q5', prompt: '整份樣式表沒有任何元素寫 `container-type`，卻有這一段。瀏覽器會怎麼處理？',
      code: { language: 'CSS', text: '@container (min-width: 300px) {\n  .card { padding: 24px; }\n}' },
      options: [
        '改用視窗的寬度判斷：視窗至少 300px 時套用',
        '在主控台顯示錯誤，並停止套用整份樣式表',
        '自動把 `.card` 的父元素當成容器',
        '這條規則永遠不套用，也不會出現任何錯誤訊息',
      ],
      answer: 3,
      explanation: '`@container` 的規則需要一個宣告過 `container-type` 的祖先來回答。找不到容器時，條件無從成立，大括號裡的規則永遠不套用；這是合法的 CSS，所以沒有錯誤訊息，其他規則也照常運作。瀏覽器不會替你挑一個元素當容器，也不會改問視窗。會在找不到容器時改以視窗為準的是容器單位（例如 `cqi`），不是容器查詢。',
    },
    {
      id: 'rwd08-q6', prompt: '`.tag` 是一個只包著幾個字的行內區塊，沒有內距與邊框，也沒有寫寬度。加上第二條宣告之後，它的寬度會怎樣？',
      code: { language: 'CSS', text: '.tag {\n  display: inline-block;\n  container-type: inline-size;\n}' },
      options: [
        '變成 0px：瀏覽器計算它的寬度時，不再把內容算進去',
        '不變：仍然剛好包住裡面的文字',
        '變成和父元素一樣寬',
        '變成和視窗一樣寬',
      ],
      answer: 0,
      explanation: '`inline-size` 容器承諾「寬度不由內容決定」，瀏覽器計算它的寬度時會把內容當成 0px 寬。行內區塊的寬度本來完全靠內容撐開，沒有別的來源，於是縮成 0px，文字溢出到外面。它不會自動變成父元素或視窗的寬度：要填滿父元素得是一般的區塊，或另外寫 `width`。所以容器要選寬度有別的來源的元素。',
    },
    {
      id: 'rwd08-q7', prompt: '`.slot` 裡有一張 `.card`。套用這段 CSS 之後，`.card` 會不會變成 grid？',
      code: { language: 'CSS', text: '.slot {\n  box-sizing: border-box;\n  width: 400px;\n  padding: 0 20px;\n  container-type: inline-size;\n}\n@container (min-width: 400px) {\n  .card { display: grid; }\n}' },
      options: [
        '會：`.slot` 的寬度剛好是 400px',
        '會：`min-width` 比的其實是視窗的寬度',
        '不會：查詢比的是內容區的寬度，400 − 20 × 2 = 360px',
        '不會：有內距的元素不能當容器',
      ],
      answer: 2,
      explanation: '容器查詢比的是容器內容區的寬度，不含內距與邊框。`box-sizing: border-box` 讓 `width: 400px` 包含左右各 20px 的內距，內容區只剩 360px，不到 400px，所以條件不成立。「剛好 400px」看的是到邊框為止的寬度，不是查詢比的那個數字；`@container` 從不看視窗；有內距的元素當然可以當容器，只是要記得把內距扣掉再比。',
    },
    {
      id: 'rwd08-q8', prompt: '下面哪一件事應該用媒體查詢來做，而不是容器查詢？',
      options: [
        '商品卡片在窄的欄位裡上下排列，在寬的欄位裡左右並排',
        '使用者的系統設定成深色模式時，把頁面換成深色的配色',
        '標題的字級跟著它所在卡片的寬度縮放',
        '同一個留言元件放進側欄時，把頭像隱藏起來',
      ],
      answer: 1,
      explanation: '深色模式是使用者的偏好設定（`prefers-color-scheme`），和任何元素的大小無關，只有媒體查詢問得到，`@container` 不能問偏好。其餘三件事都是「元件依自己所在位置的寬度調整」：卡片的排法與留言的頭像用容器查詢，跟著卡片寬度縮放的字級用容器單位。這些如果改用媒體查詢，問到的是視窗，同一個視窗裡寬窄不同的位置會得到同一個答案。',
    },
  ],
  webCode: {
    examples: [mediaLimit, firstQuery, selfQuery, named, units],
    exercises: [exFirstContainer, exSelfQuery, exNamed, exUnits],
  },
};
