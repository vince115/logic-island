import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD04 flexbox, part two: how flex items get their sizes (RWD-1). A web-code lesson of HTML and CSS only. Every page is
 * a row of boxes whose sizes follow from explicit numbers (flex-basis, gap, the viewport's width), so the facts under
 * each example and the exercises' checks are box measurements at several viewport widths (`resize`). The one page whose
 * broken half depends on the width of text (the min-width: 0 example) is only measured on its repaired half. No grid and
 * no media query rule appears anywhere: the wrapping card row is the point (RWD05 and RWD07 teach those).
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const grow: WebExample = {
  id: 'rwd04-grow', title: '剩餘空間分成 1：2：1',
  description: '三個項目的 `flex-basis` 都是 100px，`flex-grow` 分別是 1、2、1。容器沒有設定寬度，所以和頁面一樣寬：請用預覽上方的按鈕切換 600px、1000px、360px。',
  widths: [600, 1000, 360],
  files: {
    html: String.raw`<div class="row">
  <div class="item" id="a">A：1 份</div>
  <div class="item" id="b">B：2 份</div>
  <div class="item" id="c">C：1 份</div>
</div>`,
    css: String.raw`body { margin: 0; }
.row { display: flex; }
.item {
  flex-basis: 100px;
  height: 60px;
  background-color: #bbdefb;
}
#a { flex-grow: 1; }
#b { flex-grow: 2; background-color: #ffe082; }
#c { flex-grow: 1; background-color: #c8e6c9; }`,
  },
  observe: [
    { check: 'box', selector: '#a', measure: 'width', value: 175, label: '頁面寬 600px 時，A 寬 175px：起始的 100px，加上剩餘 300px 的四分之一（75px）' },
    { check: 'box', selector: '#b', measure: 'width', value: 250, label: 'B 寬 250px：起始的 100px 加上兩份（150px）；它不是 A 的兩倍' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#a', measure: 'width', value: 275, label: '1000px 時剩餘 700px，每一份 175px：A 寬 275px' },
    { check: 'box', selector: '#b', measure: 'width', value: 450, label: '1000px 時 B 寬 450px：100 + 175 × 2' },
    { do: 'resize', width: 360 },
    { check: 'box', selector: '#b', measure: 'width', value: 130, label: '360px 時只剩 60px，每一份 15px：B 寬 130px' },
  ],
};

const shrink: WebExample = {
  id: 'rwd04-shrink', title: '空間不夠時，依起始大小的比例縮小',
  description: '三個項目的 `flex-basis` 是 120px、240px、480px，加起來 840px。綠色的 `#keep` 寫了 `flex-shrink: 0`；A 和 B 沒有寫，是預設的 1。',
  widths: [600, 360, 1000],
  files: {
    html: String.raw`<div class="row">
  <div class="item" id="keep">不縮</div>
  <div class="item" id="a">A</div>
  <div class="item" id="b">B</div>
</div>`,
    css: String.raw`body { margin: 0; }
.row { display: flex; }
.item { height: 60px; }
#keep {
  flex-basis: 120px;
  flex-shrink: 0;
  background-color: #c8e6c9;
}
#a { flex-basis: 240px; background-color: #bbdefb; }
#b { flex-basis: 480px; background-color: #ffe082; }`,
  },
  observe: [
    { check: 'box', selector: '#keep', measure: 'width', value: 120, label: '頁面寬 600px 時，`flex-shrink: 0` 的項目維持 120px' },
    { check: 'box', selector: '#a', measure: 'width', value: 160, label: 'A 從 240px 縮到 160px：不夠的 240px 裡，它分攤三分之一（80px）' },
    { check: 'box', selector: '#b', measure: 'width', value: 320, label: 'B 從 480px 縮到 320px：起始大小是 A 的兩倍，縮掉的也是兩倍（160px）' },
    { do: 'resize', width: 360 },
    { check: 'box', selector: '#a', measure: 'width', value: 80, label: '360px 時少了 480px：A 縮到 80px（B 是 160px，綠色的仍是 120px）' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#b', measure: 'width', value: 480, label: '1000px 時放得下：B 就是起始的 480px，沒有縮小，也沒有長大' },
  ],
};

const SHORTHAND_ROW = (prefix: string) => String.raw`  <div class="item" id="${prefix}1"><div class="content short">短</div></div>
  <div class="item" id="${prefix}2"><div class="content long">比較長的內容</div></div>
  <div class="item" id="${prefix}3"><div class="content short">短</div></div>`;

const shorthand: WebExample = {
  id: 'rwd04-flex-shorthand', title: 'flex: 1、flex: auto 與 flex: none',
  description: '三列的內容完全相同：每個項目裡是一塊固定寬度的內容（底下有深藍色的線），兩邊的寬 60px，中間的寬 180px。三列的項目分別套用 `flex: 1`、`flex: auto`、`flex: none`。',
  widths: [600, 360],
  files: {
    html: `<p class="name">flex: 1</p>
<div class="row" id="equal">
${SHORTHAND_ROW('e')}
</div>
<p class="name">flex: auto</p>
<div class="row" id="auto">
${SHORTHAND_ROW('a')}
</div>
<p class="name">flex: none</p>
<div class="row" id="none">
${SHORTHAND_ROW('n')}
</div>`,
    css: String.raw`body { margin: 0; }
.name { margin: 8px 0 2px; }
.row { display: flex; background-color: #eceff1; }
.item { background-color: #bbdefb; }
.item:nth-child(2) { background-color: #ffe082; }
.content { height: 32px; border-bottom: 4px solid #1565c0; }
.short { width: 60px; }
.long { width: 180px; }
#equal .item { flex: 1; }
#auto .item { flex: auto; }
#none .item { flex: none; }`,
  },
  observe: [
    { check: 'box', selector: '#e2', measure: 'width', value: 200, label: '頁面寬 600px 時，`flex: 1` 的三個項目都是 200px：中間的內容比較長，項目也沒有比較寬' },
    { check: 'box', selector: '#a1', measure: 'width', value: 160, label: '`flex: auto` 的第一個項目寬 160px：內容的 60px，加上剩餘 300px 的三分之一' },
    { check: 'box', selector: '#a2', measure: 'width', value: 280, label: '`flex: auto` 的中間項目寬 280px：內容的 180px 加上 100px，仍然比兩邊寬 120px' },
    { check: 'box', selector: '#n2', measure: 'width', value: 180, label: '`flex: none` 的中間項目寬 180px：就是內容的寬度，不長大' },
    { do: 'resize', width: 360 },
    { check: 'box', selector: '#e1', measure: 'width', value: 90, label: '360px 時 `flex: 1` 的第一個項目只有 90px，不是 120px：中間的項目縮不到比 180px 的內容還窄' },
  ],
};

const NOTICE = String.raw`  <div class="badge">公告</div>
  <div class="text">
    <div class="title">夏季閱讀節開始報名（七月一日至八月三十一日）：各分館的開放時間同步調整，場次、名額與報名方式請看公告全文</div>
  </div>`;

const minWidth: WebExample = {
  id: 'rwd04-min-width', title: '被長標題撐破的項目，與 min-width: 0',
  description: '兩則公告的 HTML 相同：左邊是寬 80px、`flex: none` 的標籤，右邊的 `.text` 是 `flex: 1`，裡面的標題設定成單行、放不下時以「…」結尾。第二則（`#fixed`）的 `.text` 只多了一行 `min-width: 0`。',
  widths: [600, 360],
  files: {
    html: `<div class="notice" id="broken">
${NOTICE}
</div>
<div class="notice" id="fixed">
${NOTICE}
</div>`,
    css: String.raw`body { margin: 0; }
.notice {
  display: flex;
  margin-bottom: 12px;
  background-color: #eceff1;
}
.badge { flex: none; width: 80px; background-color: #c8e6c9; }
.text { flex: 1; background-color: #bbdefb; }
.title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#fixed .text { min-width: 0; }`,
  },
  observe: [
    { check: 'style', selector: '#broken .text', property: 'min-width', value: 'auto', label: '第一則的 `.text` 沒有寫 `min-width`：flex 項目的預設值計算後是 `auto`，不是 0' },
    { check: 'style', selector: '#fixed .text', property: 'min-width', value: '0px', label: '第二則的 `.text` 的 `min-width` 計算後是 0px' },
    { check: 'box', selector: '#fixed .text', measure: 'width', value: 520, label: '頁面寬 600px 時，第二則的 `.text` 寬 520px：剛好是標籤右邊剩下的寬度（600 − 80）' },
    { check: 'box', selector: '#fixed .title', measure: 'width', value: 520, label: '第二則的標題盒子也是 520px：比文字窄，超出的部分才會被切掉並顯示「…」' },
    { do: 'resize', width: 360 },
    { check: 'box', selector: '#fixed .text', measure: 'width', value: 280, label: '360px 時第二則的 `.text` 跟著縮到 280px（360 − 80）' },
  ],
};

const wrapCards: WebExample = {
  id: 'rwd04-wrap-cards', title: '會自動換行、填滿每一行的卡片',
  description: '五張卡片都是 `flex: 1 1 200px`，容器允許換行，間距 20px。請依序按 360px、600px、1000px，看一行放了幾張、每張多寬。',
  widths: [360, 600, 1000],
  viewport: { width: 360, height: 640 },
  files: {
    html: String.raw`<div id="cards">
  <div class="card" id="c1">新書通報</div>
  <div class="card" id="c2">借閱排行</div>
  <div class="card" id="c3">活動報名</div>
  <div class="card" id="c4">開放時間</div>
  <div class="card" id="c5">聯絡我們</div>
</div>`,
    css: String.raw`body { margin: 0; }
#cards {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}
.card {
  flex: 1 1 200px;
  height: 80px;
  background-color: #bbdefb;
}`,
  },
  observe: [
    { check: 'box', selector: '#c1', measure: 'width', value: 360, label: '頁面寬 360px 時一行只放得下一張：第一張被拉寬到 360px' },
    { check: 'box', selector: '#c2', measure: 'top', value: 100, from: '#c1', label: '第二張換到下一行：上緣在第一張上緣往下 100px（卡片高 80px 加上 20px 的行距）' },
    { do: 'resize', width: 600 },
    { check: 'box', selector: '#c2', measure: 'left', value: 310, from: '#c1', label: '600px 時一行兩張：第二張的左緣在第一張左緣往右 310px（卡片 290px 加上 20px 的間距）' },
    { check: 'box', selector: '#c5', measure: 'width', value: 600, label: '600px 時第五張自己一行，寬 600px：每一行只分配自己的剩餘空間' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#c4', measure: 'left', value: 765, from: '#c1', label: '1000px 時一行四張：第四張的左緣在 765px，也就是三張 235px 的卡片加三個 20px 的間距' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const exGrow: WebExercise = {
  id: 'rwd04-ex-grow-shares', title: '把剩下的空間分成 1：2：1',
  statement: 'index.html 不能改。圖書館的工具列 `#bar` 裡有三個區塊：`#menu`（分類）、`#search`（搜尋館藏）、`#account`（登入）。style.css 已經讓每一塊的起始大小是 120px（`flex-basis: 120px`），所以右邊留下一段空白。請修改 style.css，把剩下的空間分成 1：2：1：`#menu` 與 `#account` 各拿 1 份，`#search` 拿 2 份。三個區塊的起始大小要維持 120px，`body { margin: 0; }` 也要保留。檢查會在頁面寬 600px 與 1000px 時各量一次：600px 時剩下 240px，1000px 時剩下 640px。',
  hints: [
    '哪一個屬性決定「剩餘空間分幾份給這個項目」？它的預設值是 0，所以現在沒有人長大。',
    '三個區塊都要長大：共用的 `.part` 可以先各給 1 份，再讓 `#search` 的份數是 2。注意不要用會把起始大小改掉的簡寫。',
    '在 `.part` 的規則裡加上 `flex-grow: 1;`，在 `#search` 的規則裡加上 `flex-grow: 2;`。',
  ],
  explanation: '600px 時三個起始大小共 360px，剩下 240px；`flex-grow` 的總和是 1 + 2 + 1 = 4，每一份 60px，所以三個區塊是 180、240、180px。1000px 時剩下 640px，每一份 160px，是 280、440、280px。`#search` 是 id 選擇器，特異性比 `.part` 高，它的 `flex-grow: 2` 會蓋過共用的 1。這一題用單獨的 `flex-grow` 而不是簡寫 `flex: 1`，因為簡寫會把起始大小改成 0。',
  widths: [600, 1000, 360],
  fixed: { html: String.raw`<header id="bar">
  <div class="part" id="menu">分類</div>
  <div class="part" id="search">搜尋館藏</div>
  <div class="part" id="account">登入</div>
</header>` },
  starter: { css: String.raw`body { margin: 0; }
#bar { display: flex; }
.part {
  flex-basis: 120px;
  height: 48px;
  background-color: #bbdefb;
}
#search { background-color: #ffe082; }` },
  solution: { css: String.raw`body { margin: 0; }
#bar { display: flex; }
.part {
  flex-basis: 120px;
  flex-grow: 1;
  height: 48px;
  background-color: #bbdefb;
}
#search { flex-grow: 2; background-color: #ffe082; }` },
  steps: [
    { check: 'box', selector: '#menu', measure: 'width', value: 180, label: '頁面寬 600px 時，`#menu` 寬 180px：起始的 120px 加上 1 份剩餘空間' },
    { check: 'box', selector: '#search', measure: 'width', value: 240, label: '`#search` 寬 240px：起始的 120px 加上 2 份' },
    { check: 'box', selector: '#account', measure: 'width', value: 180, label: '`#account` 寬 180px' },
    { check: 'style', selector: '#search', property: 'flex-basis', value: '120px', label: '起始大小沒有被改掉：`#search` 的 `flex-basis` 仍是 120px' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#search', measure: 'width', value: 440, label: '1000px 時 `#search` 寬 440px：剩餘的 640px 裡它拿一半' },
    { check: 'box', selector: '#menu', measure: 'width', value: 280, label: '1000px 時 `#menu` 寬 280px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#bar { display: flex; }
.part {
  flex-basis: 120px;
  flex: 1;
  height: 48px;
  background-color: #bbdefb;
}
#search { flex: 2; background-color: #ffe082; }` }, why: '用了簡寫 `flex: 1` 與 `flex: 2`。簡寫把 `flex-basis` 改成 0%，前一行的 120px 被蓋掉了：600px 全部照 1：2：1 分，結果是 150、300、150px，不是題目要的 180、240、180px。只想改「長大的份數」時，寫 `flex-grow`。' },
    { files: { css: String.raw`body { margin: 0; }
#bar { display: flex; }
.part {
  flex-basis: 120px;
  height: 48px;
  background-color: #bbdefb;
}
#search { flex-grow: 2; background-color: #ffe082; }` }, why: '只替 `#search` 寫了 `flex-grow: 2`。另外兩個區塊仍是預設的 0，一份都不拿，240px 全部歸 `#search`：結果是 120、360、120px。比例是所有項目的 `flex-grow` 一起算的，要 1：2：1，三個都得寫。' },
    { files: { css: String.raw`body { margin: 0; }
#bar { display: flex; }
.part {
  flex-basis: 120px;
  flex-grow: 1;
  height: 48px;
  background-color: #bbdefb;
}
#search { background-color: #ffe082; }` }, why: '三個區塊都是 `flex-grow: 1`，剩餘空間平分，每個都是 200px。`#search` 要拿兩份，得另外替它寫 `flex-grow: 2`。' },
  ],
};

const exSidebar: WebExercise = {
  id: 'rwd04-ex-sidebar', title: '固定 200px 的側欄，會伸縮的主要內容',
  statement: 'index.html 不能改。`#layout` 的左邊是側欄 `#side`，右邊是主要內容 `#main`，中間有 20px 的 `gap`。起始的樣式想讓側欄寬 200px、主要內容「佔滿」，於是替 `#main` 寫了 `width: 100%`；結果兩個起始大小加起來超過容器，在 600px 寬的頁面上，側欄被壓到只剩 145px。請修改 style.css，讓 `#side` 在任何寬度下都剛好是 200px，`#main` 則佔滿扣掉側欄與間距之後剩下的寬度。`body { margin: 0; }` 與 20px 的 `gap` 要保留。檢查會在頁面寬 600px、1000px、360px 時各量一次。',
  hints: [
    '側欄為什麼會變窄？`width` 只是起始大小；空間不夠時，`flex-shrink` 是預設值 1 的項目都要分攤。',
    '側欄要「不長大、不縮小、起始 200px」；主要內容要「從 0 開始，把剩下的空間全部拿走」，而不是先佔 100% 再被壓回來。',
    '`#side` 寫 `flex: 0 0 200px;`，`#main` 把 `width: 100%;` 換成 `flex: 1;`。',
  ],
  explanation: '`flex: 0 0 200px` 讓側欄的起始大小是 200px，而且不參與長大與縮小，所以任何寬度下都是 200px。`#main` 的 `flex: 1` 是 `flex: 1 1 0%`：起始大小是 0，扣掉側欄與 20px 的間距之後，剩下的空間全部分給它：600px 時是 380px，1000px 時是 780px，360px 時是 140px。原本的 `width: 100%` 讓 `#main` 的起始大小等於整個容器，兩個項目加起來一定超過容器，才會觸發縮小。只替 `#side` 加上 `flex-shrink: 0` 也能通過檢查，因為不夠的部分全部由 `#main` 吸收；不過「先佔滿、再被壓回來」比較難讀，`flex: 1` 直接說出了意圖。',
  widths: [600, 1000, 360],
  fixed: { html: String.raw`<div id="layout">
  <nav id="side">館藏分類</nav>
  <main id="main">本週新書</main>
</div>` },
  starter: { css: String.raw`body { margin: 0; }
#layout { display: flex; gap: 20px; }
#side {
  width: 200px;
  height: 120px;
  background-color: #c8e6c9;
}
#main {
  width: 100%;
  height: 120px;
  background-color: #bbdefb;
}` },
  solution: { css: String.raw`body { margin: 0; }
#layout { display: flex; gap: 20px; }
#side {
  flex: 0 0 200px;
  height: 120px;
  background-color: #c8e6c9;
}
#main {
  flex: 1;
  height: 120px;
  background-color: #bbdefb;
}` },
  steps: [
    { check: 'box', selector: '#side', measure: 'width', value: 200, label: '頁面寬 600px 時，`#side` 寬 200px' },
    { check: 'box', selector: '#main', measure: 'width', value: 380, label: '`#main` 佔滿剩下的寬度：380px（600 − 200 − 20）' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#side', measure: 'width', value: 200, label: '1000px 時 `#side` 仍是 200px：沒有跟著長大' },
    { check: 'box', selector: '#main', measure: 'width', value: 780, label: '1000px 時 `#main` 寬 780px' },
    { do: 'resize', width: 360 },
    { check: 'box', selector: '#side', measure: 'width', value: 200, label: '360px 時 `#side` 仍是 200px：沒有被壓縮' },
    { check: 'box', selector: '#main', measure: 'width', value: 140, label: '360px 時 `#main` 寬 140px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#layout { display: flex; gap: 20px; }
#side {
  width: 200px;
  height: 120px;
  background-color: #c8e6c9;
}
#main {
  flex-grow: 1;
  width: 100%;
  height: 120px;
  background-color: #bbdefb;
}` }, why: '替 `#main` 加了 `flex-grow: 1`，但 `width: 100%` 還在。`flex-grow` 只在有剩餘空間時才有作用；這裡兩個起始大小加上間距是 200 + 600 + 20 = 820px，比 600px 的容器大，發生的是縮小，側欄仍然被壓到 145px。' },
    { files: { css: String.raw`body { margin: 0; }
#layout { display: flex; gap: 20px; }
#side {
  flex: 1;
  height: 120px;
  background-color: #c8e6c9;
}
#main {
  flex: 3;
  height: 120px;
  background-color: #bbdefb;
}` }, why: '把兩欄寫成 1：3 的比例。側欄的寬度會跟著頁面改變：600px 時是 (600 − 20) ÷ 4 = 145px，1000px 時是 245px，都不是 200px。固定寬度的欄不能用比例，要用不長大也不縮小的寫法。' },
  ],
};

const exCards: WebExercise = {
  id: 'rwd04-ex-card-row', title: '不寫任何寬度條件，也會換行的卡片列',
  statement: 'index.html 不能改。`#cards` 裡有六張書籍卡片，現在全部擠在同一行。請修改 style.css：（1）讓 `#cards` 允許換行；（2）卡片之間、行與行之間的間距都是 16px，用 `#cards` 的 `gap` 來做，不要用外距；（3）每張卡片的起始寬度是 240px：一行放得下幾張就放幾張，放好之後一起拉寬，把那一行填滿。`#cards` 四邊 16px 的內距、卡片的高度與 `body { margin: 0; }` 都要保留。檢查會在頁面寬 360px、600px、1000px 時各量一次，結果應該分別是一行一張（每張 328px）、一行兩張（每張 276px）、一行三張（每張 312px）。',
  hints: [
    '需要三件事：容器允許換行、容器的間距、每張卡片的起始大小與「可以長大」。',
    '卡片要「從 240px 開始，可以長大填滿這一行」。起始大小如果是 0，瀏覽器會認為一行放得下所有卡片，就不會換行。',
    '`#cards` 加上 `flex-wrap: wrap;` 與 `gap: 16px;`，`.card` 加上 `flex: 1 1 240px;`。',
  ],
  explanation: '`#cards` 的內容區比頁面窄 32px（左右內距各 16px）。360px 時內容區是 328px：兩張 240px 加一個間距需要 496px，放不下，所以一行一張，各自拉寬到 328px。600px 時內容區是 568px：兩張需要 496px，放得下，三張需要 752px，放不下，所以一行兩張，每張 (568 − 16) ÷ 2 = 276px。1000px 時內容區是 968px：三張需要 752px，四張需要 1008px，所以一行三張，每張 (968 − 32) ÷ 3 = 312px。三種版面都來自同一條 `flex: 1 1 240px`，沒有任何一條規則提到頁面的寬度。',
  widths: [360, 600, 1000],
  viewport: { width: 360, height: 640 },
  fixed: { html: String.raw`<section id="cards">
  <article class="card" id="c1">潮汐圖鑑</article>
  <article class="card" id="c2">燈塔的故事</article>
  <article class="card" id="c3">渡輪時刻</article>
  <article class="card" id="c4">海邊的植物</article>
  <article class="card" id="c5">島上的鳥</article>
  <article class="card" id="c6">夜觀星空</article>
</section>` },
  starter: { css: String.raw`body { margin: 0; }
#cards {
  display: flex;
  padding: 16px;
}
.card {
  box-sizing: border-box;
  height: 60px;
  padding: 8px 12px;
  background-color: #bbdefb;
}` },
  solution: { css: String.raw`body { margin: 0; }
#cards {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px;
}
.card {
  flex: 1 1 240px;
  box-sizing: border-box;
  height: 60px;
  padding: 8px 12px;
  background-color: #bbdefb;
}` },
  steps: [
    { check: 'style', selector: '#cards', property: 'row-gap', value: '16px', label: '間距由 `#cards` 的 `gap` 提供：行與行的間距（`row-gap`）計算後是 16px' },
    { check: 'box', selector: '#c1', measure: 'width', value: 328, label: '頁面寬 360px 時一行一張：第一張寬 328px（360 扣掉左右各 16px 的內距）' },
    { check: 'box', selector: '#c2', measure: 'top', value: 76, from: '#c1', label: '第二張在第一張的下一行：上緣相距 76px（卡片高 60px 加上 16px 的間距）' },
    { do: 'resize', width: 600 },
    { check: 'box', selector: '#c2', measure: 'left', value: 292, from: '#c1', label: '600px 時一行兩張：第二張的左緣在第一張左緣往右 292px（卡片 276px 加上 16px 的間距）' },
    { check: 'box', selector: '#c3', measure: 'top', value: 76, from: '#c1', label: '600px 時第三張換到第二行：上緣在第一張上緣往下 76px' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#c3', measure: 'left', value: 656, from: '#c1', label: '1000px 時一行三張：第三張的左緣在第一張左緣往右 656px（兩張 312px 的卡片加兩個 16px 的間距）' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#cards {
  display: flex;
  gap: 16px;
  padding: 16px;
}
.card {
  flex: 1 1 240px;
  box-sizing: border-box;
  height: 60px;
  padding: 8px 12px;
  background-color: #bbdefb;
}` }, why: '卡片寫了 `flex: 1 1 240px`，容器也有 `gap`，但少了 `flex-wrap: wrap`。預設的 `nowrap` 不允許換行，六張卡片只能在同一行裡一起縮小：360px 時每張只剩 41px 左右。' },
    { files: { css: String.raw`body { margin: 0; }
#cards {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px;
}
.card {
  flex: 0 0 240px;
  box-sizing: border-box;
  height: 60px;
  padding: 8px 12px;
  background-color: #bbdefb;
}` }, why: '卡片寫成 `flex: 0 0 240px`：會換行，但不長大。360px 時卡片只有 240px 寬，右邊留下 88px 的空白；題目要的是放好之後拉寬填滿這一行，`flex-grow` 不能是 0。' },
    { files: { css: String.raw`body { margin: 0; }
#cards {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px;
}
.card {
  flex: 1;
  box-sizing: border-box;
  height: 60px;
  padding: 8px 12px;
  background-color: #bbdefb;
}` }, why: '卡片寫成 `flex: 1`，起始大小是 0。瀏覽器用起始大小判斷一行放不放得下，六個 0 永遠放得下，所以即使寫了 `flex-wrap: wrap` 也不會換行，結果和沒有換行一樣擠。' },
    { files: { css: String.raw`body { margin: 0; }
#cards {
  display: flex;
  flex-wrap: wrap;
  padding: 16px;
}
.card {
  flex: 1 1 240px;
  box-sizing: border-box;
  height: 60px;
  margin: 8px;
  padding: 8px 12px;
  background-color: #bbdefb;
}` }, why: '用每張卡片的 `margin: 8px` 來做間距。卡片之間確實是 8 + 8 = 16px，但最外圈的卡片和容器之間也多了 8px：360px 時卡片只有 312px 寬，不是 328px。外距做的間距，邊緣要另外想辦法抵銷；`gap` 只出現在項目與項目之間。' },
  ],
};

const exLongTitle: WebExercise = {
  id: 'rwd04-ex-long-title', title: '修好被長書名撐破的一列',
  statement: 'index.html 不能改。書單的一列 `#book` 是 flex 容器：左邊是寬 60px 的封面 `#cover`，右邊的 `#info` 寫了 `flex: 1`，裡面有書名 `#title` 與出版社。書名設定成單行顯示，放不下時應該以「…」結尾；但書名很長，`#info` 被它撐得比容器還寬，整列超出頁面，「…」也沒有出現。請修改 style.css，讓 `#info` 縮回封面右邊剩下的寬度（頁面寬 360px 時是 288px，600px 時是 528px），書名的盒子也跟著一樣寬。書名必須維持單行（不能拿掉 `white-space: nowrap`），封面維持 60px，`body { margin: 0; }` 與 12px 的 `gap` 也要保留。',
  hints: [
    '`#info` 為什麼不肯縮？flex 項目的 `min-width` 預設是 `auto`：不能比內容所需的最小寬度窄，而單行的書名很寬。',
    '要改的是 flex 項目本身，也就是 `#book` 的直接子元素 `#info`；不是裡面的 `#title`，也不是外面的 `#book`。',
    '在 `#info` 的規則裡加上 `min-width: 0;`。',
  ],
  explanation: '`#info` 的 `flex: 1` 本來就會讓它佔剩下的寬度：360 − 60 − 12 = 288px。擋住它的是 `min-width` 的預設值 `auto`：項目不能比內容的最小寬度窄，而 `white-space: nowrap` 的書名整行都不能斷開。`min-width: 0` 取消這個下限之後，`#info` 縮回 288px（600px 時是 528px）；裡面的 `#title` 是區塊，寬度跟著 `#info`。這時文字比盒子寬，`overflow: hidden` 與 `text-overflow: ellipsis` 才有東西可以切，「…」就出現了。在 `#info` 上寫 `overflow: hidden` 也有同樣的效果。',
  widths: [360, 600],
  viewport: { width: 360, height: 640 },
  fixed: { html: String.raw`<article id="book">
  <div id="cover">封面</div>
  <div id="info">
    <h2 id="title">小島潮汐、燈塔與渡輪圖鑑：The Complete Illustrated Field Guide to the Tides, Lighthouses and Ferries of the Small Islands（增訂第三版）</h2>
    <p id="publisher">島嶼出版社</p>
  </div>
</article>` },
  starter: { css: String.raw`body { margin: 0; }
#book { display: flex; gap: 12px; }
#cover {
  flex: none;
  width: 60px;
  height: 80px;
  background-color: #c8e6c9;
}
#info { flex: 1; background-color: #bbdefb; }
#title {
  margin: 0;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#publisher { margin: 0; }` },
  solution: { css: String.raw`body { margin: 0; }
#book { display: flex; gap: 12px; }
#cover {
  flex: none;
  width: 60px;
  height: 80px;
  background-color: #c8e6c9;
}
#info { flex: 1; min-width: 0; background-color: #bbdefb; }
#title {
  margin: 0;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#publisher { margin: 0; }` },
  steps: [
    { check: 'box', selector: '#info', measure: 'width', value: 288, label: '頁面寬 360px 時，`#info` 寬 288px：封面右邊剩下的寬度（360 − 60 − 12）' },
    { check: 'box', selector: '#title', measure: 'width', value: 288, label: '書名的盒子也是 288px 寬，沒有被文字撐開' },
    { check: 'style', selector: '#title', property: 'white-space', value: 'nowrap', label: '書名維持單行顯示' },
    { check: 'box', selector: '#cover', measure: 'width', value: 60, label: '封面維持 60px 寬' },
    { do: 'resize', width: 600 },
    { check: 'box', selector: '#info', measure: 'width', value: 528, label: '600px 時 `#info` 寬 528px（600 − 60 − 12）' },
    { check: 'box', selector: '#title', measure: 'width', value: 528, label: '600px 時書名的盒子也是 528px 寬' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#book { display: flex; gap: 12px; }
#cover {
  flex: none;
  width: 60px;
  height: 80px;
  background-color: #c8e6c9;
}
#info { flex: 1; background-color: #bbdefb; }
#title {
  min-width: 0;
  margin: 0;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#publisher { margin: 0; }` }, why: '把 `min-width: 0` 寫在 `#title` 上。`#title` 不是 flex 項目，它的 `min-width` 本來就相當於 0；不肯縮的是外面的 `#info`，它仍然被書名撐開。' },
    { files: { css: String.raw`body { margin: 0; }
#book { display: flex; gap: 12px; overflow: hidden; }
#cover {
  flex: none;
  width: 60px;
  height: 80px;
  background-color: #c8e6c9;
}
#info { flex: 1; background-color: #bbdefb; }
#title {
  margin: 0;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#publisher { margin: 0; }` }, why: '在容器 `#book` 上寫 `overflow: hidden`。超出去的部分看不見了，但 `#info` 仍然和書名一樣寬，只是被容器切掉：書名的結尾沒有「…」。問題要在項目上解決，不是把它藏起來。' },
    { files: { css: String.raw`body { margin: 0; }
#book { display: flex; flex-wrap: wrap; gap: 12px; }
#cover {
  flex: none;
  width: 60px;
  height: 80px;
  background-color: #c8e6c9;
}
#info { flex: 1; background-color: #bbdefb; }
#title {
  margin: 0;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#publisher { margin: 0; }` }, why: '替 `#book` 加上 `flex-wrap: wrap`，想讓放不下的 `#info` 換到下一行。它確實換行了，但它的最小寬度仍然是整行書名的寬度，比整個容器還寬，照樣超出頁面。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD04: LessonContent = {
  lessonId: 'RWD04',
  motivation: '三個項目並排時，誰該變寬、誰該維持原來的大小？視窗變窄、放不下的時候，是一起縮小、擠出容器，還是換到下一行？這一課說明 Flexbox 怎麼替項目決定大小：從 `flex-basis` 的起始大小開始，有剩餘空間就依 `flex-grow` 分配，空間不夠就依 `flex-shrink` 縮小；再加上 `flex-wrap` 與 `gap`，你就能做出會依寬度自動換行、把每一行填滿的卡片列。',
  sections: [
    {
      id: 'rwd04-grow-section', title: '起始大小與剩餘空間：flex-basis 與 flex-grow',
      blocks: [
        { type: 'p', text: '上一課用 `display: flex` 把項目排成一列，項目都是「內容多寬就多寬」，剩下的空間再用 `justify-content` 擺在項目的前後或中間。這一課反過來問：能不能把剩下的空間分給項目本身，讓搜尋框變寬、讓三張卡片填滿整列？Flexbox 決定項目在主軸方向的大小時，固定照三個步驟（這一課都以預設的橫向主軸說明，所以談的是寬度；主軸是直向時，把寬換成高即可）：' },
        { type: 'list', ordered: true, items: [
          '找出每個項目的起始大小（flex base size）。先看 `flex-basis`；它是預設值 `auto` 時改看 `width`；連 `width` 也沒寫，就是內容本身的寬度。',
          '把所有項目的起始大小（加上項目之間的 `gap`）加起來，和容器的寬度比較。',
          '加起來比容器小，就有剩餘空間（free space）：依每個項目的 `flex-grow` 分配。加起來比容器大，空間不夠：依 `flex-shrink` 縮小（下一節）。',
        ] },
        { type: 'p', text: '`flex-basis` 的意思是「分配之前，這個項目先佔多少」；寫了長度之後，同一個項目的 `width` 就不再用來決定起始大小。`flex-grow` 是一個沒有單位的數字，代表剩餘空間要分幾份給這個項目；預設是 0，也就是一份都不拿。下面三個項目的 `flex-basis` 都是 100px，`flex-grow` 分別是 1、2、1。' },
        { type: 'example', id: 'rwd04-grow' },
        { type: 'p', text: '範例一開始的寬度是 600px。三個起始大小加起來是 300px，剩下 300px；`flex-grow` 的總和是 1 + 2 + 1 = 4，所以每一份是 75px：' },
        { type: 'table', head: ['項目', 'flex-basis', 'flex-grow', '分到的剩餘空間', '最後的寬度'], rows: [
          ['A', '100px', '1', '300 × 1/4 = 75px', '100 + 75 = 175px'],
          ['B', '100px', '2', '300 × 2/4 = 150px', '100 + 150 = 250px'],
          ['C', '100px', '1', '300 × 1/4 = 75px', '100 + 75 = 175px'],
        ] },
        { type: 'p', text: '注意 B 並不是 A 的兩倍寬（250px 對 175px）：分成 1：2：1 的是剩下的 300px，不是整個容器。按預覽上方的寬度按鈕，用同一套算法驗證：1000px 時剩下 700px，每一份 175px，三個項目是 275、450、275px；360px 時只剩 60px，每一份 15px，是 115、130、115px。起始的 100px 始終不變，變的只有分到的部分。' },
        { type: 'p', text: '`flex-grow` 只看比例：1、2、1 和 2、4、2 的結果相同。如果只有一個項目寫了 `flex-grow: 1`，其他都是預設的 0，全部的剩餘空間就都歸它，這是「搜尋框吃掉剩下的寬度」最簡單的寫法。沒有寫 `flex-grow` 的一列，項目排完之後容器的右邊會留白，原因也在這裡：沒有任何項目的 `flex-grow` 大於 0。' },
        { type: 'callout', tone: 'warning', title: 'flex-grow 分的是剩餘空間，不是總寬度', text: '看到 `flex-grow: 2` 就以為這個項目會是 `flex-grow: 1` 的兩倍寬，是最常見的誤會。兩倍的是「分到的剩餘空間」，每個項目還有自己的起始大小。只有起始大小都是 0 的時候，寬度的比例才會等於 `flex-grow` 的比例；第三節的 `flex: 1` 就是這種寫法。' },
        { type: 'callout', tone: 'tip', title: '動手試：改起始大小，先算再看', text: '在 600px 的寬度下，按「動手改這個範例」，把 `.item` 的 `flex-basis: 100px` 改成 `flex-basis: 0`：整個 600px 都是剩餘空間，三個項目變成 150、300、150px，這時 B 才剛好是 A 的兩倍。再改成 `flex-basis: 200px`：起始大小加起來剛好 600px，沒有剩餘空間，三個都是 200px，`flex-grow` 寫多少都沒有差別。' },
      ],
    },
    {
      id: 'rwd04-shrink-section', title: '空間不夠時：flex-shrink',
      blocks: [
        { type: 'p', text: '起始大小加起來比容器大的時候，項目預設不會超出容器，而是一起縮小：每個項目的 `flex-shrink` 預設是 1。並排的項目在視窗變窄時會跟著變窄，就是它在作用。縮小的算法和長大有一點不同：每個項目縮掉的量，和「`flex-shrink` × 起始大小」成正比。也就是說，`flex-shrink` 相同時，起始大小越大的項目縮得越多。' },
        { type: 'p', text: '下面三個項目的起始大小是 120、240、480px，加起來 840px。綠色的第一個寫了 `flex-shrink: 0`（不縮），A 和 B 都是預設的 1。' },
        { type: 'example', id: 'rwd04-shrink' },
        { type: 'p', text: '容器寬 600px 時少了 840 − 600 = 240px，要由 A 和 B 分攤。A 的權重是 1 × 240 = 240，B 是 1 × 480 = 480，合計 720：' },
        { type: 'table', head: ['項目', 'flex-basis', 'flex-shrink', '權重', '縮掉的寬度', '最後的寬度'], rows: [
          ['不縮', '120px', '0', '0 × 120 = 0', '0', '120px'],
          ['A', '240px', '1（預設）', '1 × 240 = 240', '240 × 240/720 = 80px', '240 − 80 = 160px'],
          ['B', '480px', '1（預設）', '1 × 480 = 480', '240 × 480/720 = 160px', '480 − 160 = 320px'],
        ] },
        { type: 'p', text: 'A 和 B 各縮掉自己的三分之一，縮完仍然維持 1：2 的比例（160px 對 320px）。如果是平均各扣 120px，A 會只剩一半，B 卻只少四分之一；乘上起始大小，就是為了不讓小的項目先被壓扁。按 360px：這次少了 480px，A 縮到 80px、B 縮到 160px，綠色的項目仍是 120px。按 1000px：840px 放得下，沒有人需要縮；三個項目的 `flex-grow` 都是預設的 0，也沒有人長大，右邊留下 160px 的空白。長大和縮小不會同時發生：有剩才分，不夠才縮。' },
        { type: 'p', text: '`flex-shrink: 0` 常用在不該變形的項目上：商標、圖示、頭像、固定寬度的側欄。另外，縮小有一個下限：項目不會縮得比內容所需的最小寬度還窄。這一頁的內容只有一兩個字，所以看不出來；第四節會專門處理這個下限造成的問題。' },
        { type: 'callout', tone: 'warning', title: '寫了 width 的項目也會被壓縮', text: '替圓形頭像（一個 `div`）寫了 `width: 48px; height: 48px;`，放進 flex 容器之後，窄螢幕上卻被壓成比 48px 還窄的橢圓：`width` 只是起始大小，`flex-shrink` 預設是 1，空間不夠時每個項目都要分攤。不能變形的項目要自己寫 `flex-shrink: 0`。反過來，也不要為了省事把所有項目都設成 `flex-shrink: 0`：沒有人肯縮，內容就會超出容器。' },
        { type: 'callout', tone: 'tip', title: '動手試：讓 A 縮得更多', text: '在 600px 的寬度下，替 `#a` 加上 `flex-shrink: 3`。先算：A 的權重變成 3 × 240 = 720，B 仍是 480，合計 1200；A 要縮 240 × 720 ÷ 1200 = 144px，剩 96px；B 縮 96px，剩 384px。再把 `#keep` 的 `flex-shrink: 0` 刪掉，綠色的項目也會跟著變窄。' },
      ],
    },
    {
      id: 'rwd04-shorthand-section', title: 'flex 簡寫：三個值一次寫',
      blocks: [
        { type: 'p', text: '`flex-grow`、`flex-shrink`、`flex-basis` 通常用簡寫 `flex` 寫在一起，順序是「長大、縮小、起始大小」。例如 `flex: 0 0 200px` 是不長大、不縮小、起始 200px，也就是固定 200px 寬；`flex: 1 1 200px` 是從 200px 開始，可以長大也可以縮小。常用的組合有更短的寫法：' },
        { type: 'table', head: ['寫法', '等於', '行為', '常見用途'], rows: [
          ['不寫（預設值）', '`flex: 0 1 auto`', '以 `width` 或內容為起始大小，不長大，不夠時縮小', '一般的項目'],
          ['`flex: 1`', '`flex: 1 1 0%`', '起始大小是 0，整列的空間全部照比例分', '等寬的欄、吃掉剩餘空間的主要區域'],
          ['`flex: auto`', '`flex: 1 1 auto`', '以 `width` 或內容為起始大小，再平分剩餘空間', '內容長的項目可以寬一點的導覽列'],
          ['`flex: none`', '`flex: 0 0 auto`', '維持 `width` 或內容的大小，不長大也不縮小', '圖示、按鈕、頭像'],
          ['`flex: 0 0 200px`', '三個值都寫出來', '固定 200px', '固定寬度的側欄'],
        ] },
        { type: 'p', text: '`flex: 1` 和 `flex: auto` 只差在起始大小，結果卻很不一樣。下面三列的內容完全相同：為了讓數字好算，每個項目裡放的是一塊固定寬度的內容（底下有一條深藍色的線），兩邊的是 60px，中間的是 180px。三列分別套用 `flex: 1`、`flex: auto`、`flex: none`。' },
        { type: 'example', id: 'rwd04-flex-shorthand' },
        { type: 'p', text: '容器寬 600px。第一列 `flex: 1`：起始大小是 0，600px 全部是剩餘空間，三個項目各拿 200px，內容的長短不影響結果。第二列 `flex: auto`：起始大小是內容的 60、180、60px，用掉 300px，剩下的 300px 平分，每個加 100px，變成 160、280、160px；內容原本相差的 120px 還在。第三列 `flex: none`：就是 60、180、60px，剩下的 300px 留白。所以要做等寬的欄，寫的是 `flex: 1`；寫成 `flex: auto` 之後發現「怎麼不一樣寬」，是很常見的疑問。同樣的道理，`flex: 2` 是 `flex: 2 1 0%`：和 `flex: 1` 的項目放在一起，因為起始大小都是 0，它才會真的是兩倍寬。' },
        { type: 'p', text: '再按 360px 看第一列：三個項目不再等寬，變成 90、180、90px。平分的話每個是 120px，但中間的內容有 180px，項目縮不到比內容還窄，只好由另外兩個讓出空間。「等寬」的前提，是每個項目的內容都放得進自己的那一份。' },
        { type: 'callout', tone: 'warning', title: '簡寫會連沒寫的值一起設定', text: '`flex: 1` 不只設定 `flex-grow`，也把 `flex-basis` 設成 0%：同一個項目先前寫的 `flex-basis: 120px` 或 `width: 120px` 就不再是起始大小了。只想讓項目長大、起始大小要保留時，寫單獨的 `flex-grow: 1`，或把三個值寫完整：`flex: 1 1 120px`。另一個容易誤會的寫法是 `flex: 200px`：只寫一個長度時，它等於 `flex: 1 1 200px`，項目會長大也會縮小；要固定 200px，得寫 `flex: 0 0 200px`。' },
        { type: 'callout', tone: 'tip', title: '動手試：把中間的內容加寬', text: '在 600px 的寬度下，把 `.long` 的 `width: 180px` 改成 `width: 300px`。第一列變成 150、300、150px：中間的項目被內容撐到 300px，就不等寬了。第二列是 120、360、120px（起始 60 + 300 + 60 = 420px，剩下的 180px 每個分 60px），第三列是 60、300、60px。' },
      ],
    },
    {
      id: 'rwd04-min-width-section', title: '縮不下去的項目：min-width: 0',
      blocks: [
        { type: 'p', text: '上一節的最後，項目「縮不到比內容還窄」。原因是一個預設值：一般的區塊，`min-width` 的預設值相當於 0；但 flex 容器裡的項目，`min-width` 的預設值 `auto` 代表「不能比內容所需的最小寬度還窄」。中文字之間到處都可以換行，所以一段中文的最小寬度大約只有一個字，平常不會注意到這個下限。遇到不能換行的內容就不一樣了：一長串網址、很長的英文單字、寫了 `white-space: nowrap` 的單行標題、一整行程式碼、很寬的表格。' },
        { type: 'p', text: '下面兩則公告的結構相同：左邊是 `flex: none`、寬 80px 的標籤，右邊的 `.text` 寫了 `flex: 1`，照理要佔剩下的 520px。`.text` 裡的標題是單行顯示，而且設定了放不下時以「…」結尾（`overflow: hidden` 加上 `text-overflow: ellipsis`）。兩則只差在第二則的 `.text` 多了一行 `min-width: 0`。' },
        { type: 'example', id: 'rwd04-min-width' },
        { type: 'p', text: '第一則：標題一整行的寬度超過 520px，`.text` 不肯縮得比它窄，於是淡藍色的 `.text` 連同標題一起伸出灰色的容器右邊，頁面多了一條水平捲軸；「…」也沒有出現，因為標題的盒子和文字一樣寬，沒有東西被切掉。第二則：`min-width: 0` 取消了下限，`.text` 縮回剩下的寬度（600px 時是 520px，按 360px 時是 280px），標題的盒子跟著變窄，超出的文字才被切掉並顯示「…」。' },
        { type: 'p', text: '修法不只一種，重點都是讓這個項目「可以比內容窄」：在項目上寫 `min-width: 0`；或在項目上寫 `overflow: hidden`、`overflow: auto`，內容超出時由項目自己裁切或捲動，下限同樣變成 0；如果內容是可以斷開的長網址或長單字，也可以在文字上寫 `overflow-wrap: anywhere`，允許它在任何位置換行。主軸是直向（`flex-direction: column`）時，同樣的問題出在高度，對應的是 `min-height: 0`。' },
        { type: 'callout', tone: 'warning', title: '內容把版面撐破時，先檢查 min-width', text: '症狀通常是：窄螢幕上出現水平捲軸、寫了 `flex: 1` 的欄位比預期寬、`text-overflow: ellipsis` 沒有作用。這時加大 `flex-shrink` 沒有用，下限還在；把 `overflow: hidden` 寫在外層的容器上，只是把伸出去的部分藏起來，項目仍然太寬。`min-width: 0` 要寫在「項目」上，也就是 flex 容器的直接子元素：寫在項目裡面的標題上，或寫在容器上，都不會有效果。' },
        { type: 'callout', tone: 'tip', title: '動手試：寫錯位置', text: '把最後一條規則的選擇器從 `#fixed .text` 改成 `#fixed .title` 再執行：第二則也壞了，因為標題不是 flex 項目，真正不肯縮的是它外面的 `.text`。改回來之後，再把 `min-width: 0` 換成 `overflow: hidden` 試試看，結果和原來一樣。' },
      ],
    },
    {
      id: 'rwd04-wrap-section', title: '放不下就換行：flex-wrap',
      blocks: [
        { type: 'p', text: '到目前為止，所有項目都擠在同一行：`flex-wrap` 的預設值是 `nowrap`，空間不夠就縮，縮不下去就超出容器。對一排卡片來說，一直縮下去並不合理：手機上六張卡片擠成六條細長的直條，誰也讀不了。`flex-wrap: wrap` 允許換行：瀏覽器依起始大小一個一個排，下一個項目放不下時，就從新的一行開始。換行之後，每一行各自是一條獨立的列：這一行剩下的空間，由這一行的項目依 `flex-grow` 分配。' },
        { type: 'p', text: '把換行和 `flex: 1 1 200px` 放在一起，就是很實用的寫法：「每張卡片至少要有 200px 才放進這一行；一行放得下幾張就放幾張；放好之後一起拉寬，把這一行填滿」。下面的五張卡片就是這樣寫的，卡片之間用上一課學過的 `gap` 隔開 20px；判斷「放不放得下」時，`gap` 也要算進去。中間那個 1 是 `flex-shrink`：容器比 200px 還窄時，卡片可以縮小，不會超出去。' },
        { type: 'example', id: 'rwd04-wrap-cards' },
        { type: 'p', text: '這個範例一開始是 360px 寬，請依序按 600px、1000px，對照下表：' },
        { type: 'table', head: ['視窗寬度', '一行放得下幾張', '這一行剩下的空間', '每張卡片的寬度'], rows: [
          ['360px', '1 張（2 張需要 200 × 2 + 20 = 420px）', '160px', '360px'],
          ['600px', '2 張（420px；3 張需要 640px）', '180px，每張分 90px', '290px'],
          ['1000px', '4 張（860px；5 張需要 1080px）', '140px，每張分 35px', '235px'],
        ] },
        { type: 'p', text: '整份 CSS 沒有任何一條規則提到 360、600 或 1000：一行幾張完全由容器當下的寬度決定，所以不需要替不同的視窗寬度各寫一套樣式，也就用不到媒體查詢（media query）。你只要決定一個數字：卡片最窄可以接受多寬。這個數字來自內容，和 RWD01 說的「依內容而不是依裝置決定版面」是同一件事。' },
        { type: 'p', text: '再看最後一行。600px 時第五張自己一行，被拉成 600px 寬；1000px 時也一樣，寬 1000px。每一行只分配自己的剩餘空間，不知道其他行的存在，所以上下兩行的卡片不會對齊成整齊的欄。如果需要「每一格都對齊、最後一行也維持同樣的寬度」，那是下一課 Grid 的工作。' },
        { type: 'callout', tone: 'warning', title: '寫了 wrap 卻不換行', text: '把卡片寫成 `flex: 1`，再替容器加上 `flex-wrap: wrap`，卡片仍然全部擠在同一行。放不放得下是用起始大小判斷的，而 `flex: 1` 的起始大小是 0：再多張也「放得下」。要換行，起始大小必須是一個有意義的寬度，例如 `flex: 1 1 200px`。相反的寫法 `flex: 0 0 200px` 會換行，但卡片不長大，每一行的右邊會留下一段空白。' },
        { type: 'callout', tone: 'tip', title: '動手試：把起始寬度改成 300px', text: '把 `flex: 1 1 200px` 改成 `flex: 1 1 300px`，先算再按寬度按鈕：600px 時兩張需要 620px，放不下，所以一行一張，每張 600px；1000px 時三張需要 940px，一行三張，每張 (1000 − 40) ÷ 3 = 320px，第二行剩下的兩張各是 490px。' },
      ],
    },
    {
      id: 'rwd04-gap-section', title: 'gap、多行的對齊，以及何時用 Flexbox',
      blocks: [
        { type: 'p', text: '換行之後，間距有兩個方向：同一行裡項目與項目之間的是 `column-gap`，行與行之間的是 `row-gap`。`gap: 20px` 一次設定兩者；寫兩個值時，前面是 `row-gap`、後面是 `column-gap`，例如 `gap: 8px 20px` 是行距 8px、項目之間 20px。（這是橫向排列的情況；主軸是直向時，項目之間的間距換成 `row-gap`。）另一種做法是替每個項目加外距，兩者的差別在邊緣：' },
        { type: 'table', head: ['比較', '每個項目寫外距（右邊與下面各 20px）', '容器寫 gap: 20px'], rows: [
          ['間距出現在哪裡', '每個項目的右邊與下面，包括每一行的最後一個與最後一行', '只在項目與項目之間、行與行之間'],
          ['容器的邊緣', '右邊與底下各多出 20px，要再用負的外距或 `:last-child` 抵銷', '第一個與最後一個項目貼齊容器，不需要抵銷'],
          ['換行的判斷', '外距算在項目佔的空間裡：兩張 200px 的卡片需要 440px', '只算中間的間距：兩張需要 420px'],
          ['寫在哪裡', '每一個項目', '容器上的一條宣告'],
        ] },
        { type: 'p', text: '回到上一節的卡片：600px 時第一張的左緣在 0、第二張的右緣在 600px，兩張之間剛好 20px，邊緣沒有多餘的空白。計算剩餘空間時，`gap` 會先被扣掉：600 − 200 × 2 − 20 = 180px。還要記得 WEB06 提過的一點：flex 項目的外距不會合併，如果每張卡片上下各有 20px 的外距，行與行之間會是 40px 而不是 20px。用 `gap` 就沒有這些要記的事。' },
        { type: 'p', text: '多行時的對齊也分兩層。上一課的 `align-items` 管的是「每一行之內」：一行的高度由這一行最高的項目決定，其他項目在這個高度裡靠上、置中或拉伸。`align-content` 管的是「行與行」：容器在交錯軸方向比所有的行加起來還高時，多出來的空間怎麼分。預設的行為是把多出來的高度平均分給每一行（拉伸），也可以改成 `flex-start`（所有的行靠上）、`center`、`space-between` 等。它只對允許換行的容器有作用；`nowrap` 的單行容器用 `align-items` 就夠了。' },
        { type: 'p', text: '最後是工具的選擇。Flexbox 一次只管一個方向，項目的大小主要由內容與項目自己的 `flex` 決定；下一課的 Grid 由容器先定好欄與列，再把項目放進去。' },
        { type: 'table', head: ['比較', 'Flexbox', 'Grid（RWD05）'], rows: [
          ['排的方向', '一維：一列或一欄；換行後每一行各算各的', '二維：欄與列同時對齊'],
          ['大小由誰決定', '內容，加上項目的 `flex-grow`、`flex-shrink`、`flex-basis`', '容器定義的欄寬與列高'],
          ['適合的版面', '導覽列、工具列、按鈕群組、圖文並排、數量不定而且不必對齊成欄的卡片', '整頁的版面、要對齊成欄的卡片牆、像表格一樣的排列'],
        ] },
        { type: 'p', text: '把這一課串起來，預測一個 flex 項目的寬度，可以照這個順序問：' },
        { type: 'list', ordered: true, items: [
          '它的起始大小是多少？先看 `flex-basis`（或簡寫 `flex` 的第三個值）；是 `auto` 就看 `width`，再沒有就是內容的寬度。',
          '這一行的起始大小加上 `gap`，比容器小還是大？允許換行時，先依起始大小決定每一行有哪些項目。',
          '有剩餘空間：依 `flex-grow` 的比例分；大家都是 0 就留白。',
          '空間不夠：依「`flex-shrink` × 起始大小」的比例縮，但不會比內容的最小寬度窄，除非項目寫了 `min-width: 0`。',
        ] },
        { type: 'callout', tone: 'tip', title: '動手試：行距與多行的對齊', text: '回到上一節的卡片範例，按 600px，把 `gap: 20px` 改成 `gap: 8px 20px`：卡片左右仍相隔 20px，上下只隔 8px。接著替 `#cards` 加上 `height: 400px`：三行之間的空白變大了，因為多出來的高度平均分給了每一行；再加上 `align-content: flex-start`，三行就靠上排在一起。' },
        { type: 'callout', tone: 'note', title: '想多練幾種組合', text: '互動實驗島的 Flexbox 練習場可以切換幾種常見的版面，對照每個屬性改變了什麼；做完下面的練習之後，可以到那裡再試試這一課的 `flex-grow`、`flex-wrap` 與 `gap`。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'rwd04-q1', prompt: '容器是寬 500px 的 flex 容器，沒有間距，裡面只有 `.a` 與 `.b` 兩個項目。`.b` 最後多寬？',
      code: { language: 'CSS', text: '.a { flex-basis: 100px; flex-grow: 1; }\n.b { flex-basis: 100px; flex-grow: 2; }' },
      options: ['200px', '約 333px', '300px', '400px'],
      answer: 2,
      explanation: '起始大小共 200px，剩下 300px；`flex-grow` 是 1：2，`.b` 拿到三分之二，也就是 200px，加上自己起始的 100px 是 300px。約 333px 是把整個 500px 照 1：2 分，那是起始大小為 0 時才有的結果；200px 只是 `.b` 分到的部分（也是 `.a` 最後的寬度）；400px 是 `.a` 沒有寫 `flex-grow`、剩餘空間全歸 `.b` 的情況。',
    },
    {
      id: 'rwd04-q2', prompt: '`flex: 1` 是哪三個宣告的簡寫？',
      options: [
        '`flex-grow: 1; flex-shrink: 1; flex-basis: 0%;`',
        '`flex-grow: 1; flex-shrink: 1; flex-basis: auto;`',
        '`flex-grow: 1; flex-shrink: 0; flex-basis: auto;`',
        '`flex-grow: 0; flex-shrink: 1; flex-basis: auto;`',
      ],
      answer: 0,
      explanation: '`flex: 1` 等於 `flex: 1 1 0%`：可以長大、可以縮小，起始大小是 0，所以整列的空間全部照比例分。起始大小是 `auto` 的 `1 1 auto` 是 `flex: auto`，會先保留內容的寬度；`0 1 auto` 是什麼都不寫時的預設值；`1 0 auto` 則沒有對應的關鍵字，而且 `flex: 1` 並不會關掉縮小。',
    },
    {
      id: 'rwd04-q3', prompt: '容器寬 300px。項目 A 的 `flex-basis` 是 100px，B 的是 300px，兩者的 `flex-shrink` 都是預設的 1，內容都只有一兩個字。A 最後多寬？',
      options: ['50px', '75px', '100px', '25px'],
      answer: 1,
      explanation: '起始大小共 400px，少了 100px。縮掉的量和「`flex-shrink` × 起始大小」成正比：權重是 100 與 300，A 分攤 100 × 100/400 = 25px，剩下 75px（B 縮 75px，剩 225px）。50px 是把不夠的 100px 平均各扣 50px，縮小不是平均分攤；100px 是以為 A 不會縮；25px 是 A 縮掉的量，不是它最後的寬度。',
    },
    {
      id: 'rwd04-q4', prompt: '側欄固定 200px，右邊的 `.content` 寫了 `flex: 1`。`.content` 裡有一行很長、不能斷開的網址，結果 `.content` 被撐得超出容器，頁面出現水平捲軸。要讓 `.content` 縮回剩下的寬度，該怎麼做？',
      options: [
        '把 `.content` 的 `flex-shrink` 改成更大的數字，例如 5',
        '在容器上加 `flex-wrap: wrap`',
        '把 `.content` 的 `flex-grow` 改成 0',
        '在 `.content` 上加 `min-width: 0`',
      ],
      answer: 3,
      explanation: 'flex 項目的 `min-width` 預設是 `auto`，不能比內容所需的最小寬度窄；`min-width: 0` 取消這個下限，`.content` 才能縮回剩下的寬度（網址本身再用 `overflow-wrap: anywhere` 或項目的 `overflow: auto` 處理）。`flex-shrink` 再大也越不過下限；`flex-wrap: wrap` 會讓 `.content` 整個掉到側欄的下一行，不再並排，而且它仍然不能比網址窄；`flex-grow` 管的是長大，這裡的問題是縮不下去。',
    },
    {
      id: 'rwd04-q5', prompt: '容器寬 700px、沒有內距，樣式是 `display: flex; flex-wrap: wrap; gap: 20px;`，裡面有六張 `flex: 1 1 200px` 的卡片。第一行有幾張？每張多寬？',
      options: ['3 張，每張 200px', '3 張，每張 220px', '2 張，每張 340px', '6 張，每張 100px'],
      answer: 1,
      explanation: '三張需要 200 × 3 + 20 × 2 = 640px，放得下；四張需要 860px，放不下，所以一行三張。這一行剩下 60px，三張各分 20px，每張 220px。每張 200px 是 `flex-grow` 為 0（例如 `flex: 0 0 200px`）時的結果；兩張一行是三張放不下時才會發生；六張各 100px 是沒有 `flex-wrap: wrap`、全部擠在同一行縮小的結果。',
    },
    {
      id: 'rwd04-q6', prompt: '`gap: 8px 24px;` 寫在橫向排列、允許換行的 flex 容器上。同一行裡相鄰的兩個項目相隔多少？',
      options: ['8px', '32px', '16px', '24px'],
      answer: 3,
      explanation: '`gap` 寫兩個值時，前面是 `row-gap`（行與行之間），後面是 `column-gap`（同一行裡項目與項目之間），所以同一行的項目相隔 24px，上下兩行相隔 8px。8px 是把順序記反了；32px 與 16px 是把兩個值相加或取平均，兩個方向的間距各自獨立，不會合在一起。',
    },
    {
      id: 'rwd04-q7', prompt: '三個分頁標籤的文字長短不同（「首頁」、「新書與活動通報」、「館藏」），要讓三個標籤一樣寬，合起來填滿整列。每個標籤該寫哪一條宣告？',
      options: ['`flex: 1`', '`flex: auto`', '`flex: none`', '`flex-shrink: 0`'],
      answer: 0,
      explanation: '`flex: 1` 的起始大小是 0，整列的空間全部平分，文字長短不影響結果（前提是每個標籤的文字放得進自己那一份）。`flex: auto` 以文字的寬度為起始大小，再平分剩下的空間，文字長的標籤還是比較寬；`flex: none` 不長大，三個標籤只有文字那麼寬，填不滿整列；`flex-shrink: 0` 只是不讓項目縮小，和分配剩餘空間無關。',
    },
    {
      id: 'rwd04-q8', prompt: '容器寬 600px，樣式是 `display: flex; flex-wrap: wrap;`，沒有間距，裡面有三張 `flex: 1 1 250px` 的卡片。第三張卡片多寬？',
      options: ['200px', '250px', '600px', '300px'],
      answer: 2,
      explanation: '兩張需要 500px，放得下；三張需要 750px，放不下，所以第三張換到第二行。每一行只分配自己的剩餘空間：第二行只有它一張，整行 600px 都歸它。300px 是第一行兩張卡片的寬度，換行後上下行並不會對齊成欄（要對齊是 Grid 的工作）；250px 是不會長大時的寬度；200px 是三張擠在同一行平分的結果，但起始大小 250px 的三張放不進同一行。',
    },
  ],
  webCode: {
    examples: [grow, shrink, shorthand, minWidth, wrapCards],
    exercises: [exGrow, exSidebar, exCards, exLongTitle],
  },
};
