import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD03 flexbox basics: the flex container, the main and cross axes, justify-content and align-items (RWD-1). A web-code
 * lesson of HTML and CSS only: every page of the made-up 小島商店 has containers and items of explicit pixel sizes, so the
 * facts under it (where an item lands for each justify-content value, a centred box, an item pushed by an auto margin)
 * are measured in Chromium, two of them at two viewport widths. The exercises fix the HTML; the learner edits style.css
 * and is checked on computed styles and box positions. Wrapping and flex sizing (RWD04), grid and media queries are
 * not taught here.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const container: WebExample = {
  id: 'rwd03-container', title: '同一份清單：一般排版流與 flex 容器',
  description: '兩份 HTML 完全相同的清單，寬 300px。下面那一份的 `ul` 多了 `display: flex` 與 `height: 60px`，三個 `li` 成為 flex 項目。',
  files: {
    html: String.raw`<ul class="menu" id="plain">
  <li>首頁</li>
  <li>商品</li>
  <li>購物車</li>
</ul>
<ul class="menu" id="flexed">
  <li>首頁</li>
  <li>商品</li>
  <li>購物車</li>
</ul>`,
    css: String.raw`body { margin: 0; }
.menu {
  width: 300px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
  background-color: #e3f2fd;
}
.menu li {
  padding: 4px 12px;
  border: 1px solid #1565c0;
  background-color: #90caf9;
}
#flexed {
  display: flex;
  height: 60px;
}`,
  },
  observe: [
    { check: 'box', selector: '#plain li', measure: 'width', value: 300, label: '上面的清單在一般排版流裡：`li` 是區塊，填滿容器的 300px' },
    { check: 'style', selector: '#flexed', property: 'display', value: 'flex', label: '下面的 `ul` 的 `display` 計算後是 `flex`：它是 flex 容器' },
    { check: 'box', selector: '#flexed li:nth-child(2)', measure: 'top', value: 0, from: '#flexed li:first-child', label: '第二個項目和第一個排在同一列：兩者的上緣一樣高' },
    { check: 'box', selector: '#flexed li:first-child', measure: 'left', value: 0, from: '#flexed', label: '第一個項目從容器的左緣（主軸的起點）開始排' },
    { check: 'box', selector: '#flexed li:first-child', measure: 'height', value: 60, label: '項目沒有寫 `height`，卻和容器一樣高 60px：沿交錯軸被拉伸' },
  ],
};

const direction: WebExample = {
  id: 'rwd03-direction', title: '同樣的三個項目，兩種方向',
  description: '兩個寬 240px 的 flex 容器，裡面各有兩個 60 × 40px 的藍色項目與一個沒有設定大小的黃色項目。`#column` 只多了一行 `flex-direction: column`。',
  files: {
    html: String.raw`<div class="group" id="row">
  <div class="item">1</div>
  <div class="item">2</div>
  <div class="free">3</div>
</div>
<div class="group" id="column">
  <div class="item">1</div>
  <div class="item">2</div>
  <div class="free">3</div>
</div>`,
    css: String.raw`body { margin: 0; }
.group {
  display: flex;
  width: 240px;
  margin-bottom: 16px;
  background-color: #e3f2fd;
}
#column { flex-direction: column; }
.item {
  box-sizing: border-box;
  width: 60px;
  height: 40px;
  border: 1px solid #1565c0;
  background-color: #90caf9;
}
.free { border: 1px solid #f9a825; background-color: #ffe082; }`,
  },
  observe: [
    { check: 'style', selector: '#row', property: 'flex-direction', value: 'row', label: '`#row` 沒有寫 `flex-direction`，計算後是預設的 `row`' },
    { check: 'box', selector: '#row .item:nth-child(2)', measure: 'left', value: 60, from: '#row', label: '`row`：主軸是水平的，第二個項目接在第一個的右邊（左緣在 60px）' },
    { check: 'box', selector: '#row .free', measure: 'height', value: 40, label: '`row`：交錯軸是垂直的，黃色項目的高度被拉伸到和這一列一樣的 40px' },
    { check: 'box', selector: '#column .item:nth-child(2)', measure: 'top', value: 40, from: '#column', label: '`column`：主軸轉成由上到下，第二個項目排在第一個的下面（上緣在 40px）' },
    { check: 'box', selector: '#column .free', measure: 'width', value: 240, label: '`column`：交錯軸換成水平，黃色項目的寬度被拉伸到和容器一樣的 240px' },
  ],
};

const justify: WebExample = {
  id: 'rwd03-justify', title: 'justify-content 的六個值',
  description: '六個寬 300px 的 flex 容器，每個裡面有三個寬 60px 的項目（共 180px，剩下 120px）。六個容器只有 `justify-content` 不同，值寫在各自上方。',
  files: {
    html: String.raw`<p>flex-start</p>
<div class="row" id="start"><div></div><div></div><div></div></div>
<p>center</p>
<div class="row" id="center"><div></div><div></div><div></div></div>
<p>flex-end</p>
<div class="row" id="end"><div></div><div></div><div></div></div>
<p>space-between</p>
<div class="row" id="between"><div></div><div></div><div></div></div>
<p>space-around</p>
<div class="row" id="around"><div></div><div></div><div></div></div>
<p>space-evenly</p>
<div class="row" id="evenly"><div></div><div></div><div></div></div>`,
    css: String.raw`body { margin: 0; }
p { margin: 6px 0 2px; font-size: 13px; }
.row {
  display: flex;
  width: 300px;
  background-color: #e3f2fd;
}
.row div {
  box-sizing: border-box;
  width: 60px;
  height: 28px;
  border: 1px solid #1565c0;
  background-color: #90caf9;
}
#start { justify-content: flex-start; }
#center { justify-content: center; }
#end { justify-content: flex-end; }
#between { justify-content: space-between; }
#around { justify-content: space-around; }
#evenly { justify-content: space-evenly; }`,
  },
  observe: [
    { check: 'box', selector: '#center div:first-child', measure: 'left', value: 60, label: '`center`：剩下的 120px 平分在兩側，第一個項目的左緣在 60px' },
    { check: 'box', selector: '#end div:first-child', measure: 'left', value: 120, label: '`flex-end`：120px 全部在前面，第一個項目的左緣在 120px' },
    { check: 'box', selector: '#between div:last-child', measure: 'left', value: 240, label: '`space-between`：首尾貼邊、中間各 60px，最後一個項目的左緣在 240px（右緣貼著 300px）' },
    { check: 'box', selector: '#around div:first-child', measure: 'left', value: 20, label: '`space-around`：每個項目左右各 20px，第一個項目的左緣在 20px' },
    { check: 'box', selector: '#evenly div:first-child', measure: 'left', value: 30, label: '`space-evenly`：四段空白都是 30px，第一個項目的左緣在 30px' },
  ],
};

const align: WebExample = {
  id: 'rwd03-align', title: '交錯軸上的對齊，以及兩個方向都置中',
  description: '上面的 `#cross` 寬 300px、高 100px，用 `align-items: center` 對齊三個高度不同的項目，其中 C 另外寫了 `align-self: flex-end`。下面的 `#stage` 高 100px、寬度填滿頁面，把一則 140 × 40px 的訊息放在正中央。',
  widths: [360, 600],
  files: {
    html: String.raw`<div id="cross">
  <div class="item" id="a">A</div>
  <div class="item" id="b">B</div>
  <div class="item" id="c">C</div>
</div>
<div id="stage">
  <p id="message">已加入購物車</p>
</div>`,
    css: String.raw`body { margin: 0; }
#cross {
  display: flex;
  align-items: center;
  width: 300px;
  height: 100px;
  margin-bottom: 16px;
  background-color: #e3f2fd;
}
.item { width: 60px; background-color: #90caf9; }
#a { height: 40px; }
#b { height: 80px; }
#c { height: 40px; align-self: flex-end; }
#stage {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100px;
  background-color: #fff8e1;
}
#message {
  width: 140px;
  height: 40px;
  margin: 0;
  background-color: #ffe082;
}`,
  },
  observe: [
    { check: 'box', selector: '#a', measure: 'top', value: 30, from: '#cross', label: 'A 高 40px，在高 100px 的容器裡垂直置中：上緣在 (100 − 40) ÷ 2 = 30px' },
    { check: 'box', selector: '#c', measure: 'top', value: 60, from: '#cross', label: 'C 自己寫了 `align-self: flex-end`：貼著容器的下緣，上緣在 100 − 40 = 60px' },
    { check: 'box', selector: '#message', measure: 'top', value: 30, from: '#stage', label: '訊息在 `#stage` 裡垂直置中：上緣在 (100 − 40) ÷ 2 = 30px' },
    { check: 'box', selector: '#message', measure: 'left', value: 230, from: '#stage', label: '頁面寬 600px 時，訊息水平置中：左緣在 (600 − 140) ÷ 2 = 230px' },
    { do: 'resize', width: 360 },
    { check: 'box', selector: '#message', measure: 'left', value: 110, from: '#stage', label: '頁面改成 360px 寬，訊息仍然置中：左緣在 (360 − 140) ÷ 2 = 110px' },
  ],
};

const navbar: WebExample = {
  id: 'rwd03-navbar', title: '小島商店的頁首與商品：gap 與 auto 外距',
  description: '頁首 `.bar` 高 56px，裡面是寬 88px 的標誌與三個寬 64px 的連結，項目之間用 `gap: 16px` 隔開，「購物車」寫了 `margin-left: auto`。下面的商品 `.product` 是一張 64 × 64px 的縮圖加上文字。',
  widths: [360, 600],
  files: {
    html: String.raw`<header class="bar">
  <a class="logo" href="#home">小島商店</a>
  <a class="link" href="#new">新品</a>
  <a class="link" href="#sale">特價</a>
  <a class="link cart" href="#cart">購物車</a>
</header>
<article class="product">
  <div class="thumb"></div>
  <div class="info">
    <h2>手工椰子餅乾</h2>
    <p>每盒 12 片，島上現烤。</p>
  </div>
</article>`,
    css: String.raw`body { margin: 0; }
.bar {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 56px;
  background-color: #1565c0;
}
.bar a {
  width: 64px;
  height: 32px;
  line-height: 32px;
  text-align: center;
  background-color: #bbdefb;
}
.bar .logo { width: 88px; }
.cart { margin-left: auto; }
.product {
  display: flex;
  gap: 12px;
  padding: 12px;
}
.thumb { width: 64px; height: 64px; background-color: #ffe082; }
.info h2, .info p { margin: 0; font-size: 16px; }`,
  },
  observe: [
    { check: 'style', selector: '.bar', property: 'column-gap', value: '16px', label: '`gap: 16px` 讓左右相鄰的項目之間相隔 16px（`column-gap` 計算後是 16px）' },
    { check: 'box', selector: '.bar a:nth-child(2)', measure: 'left', value: 104, from: '.bar', label: '「新品」的左緣在 88（標誌）+ 16（間距）= 104px：連結成為項目後，`width` 直接有效' },
    { check: 'box', selector: '.cart', measure: 'right', value: 600, label: '頁面寬 600px 時，`margin-left: auto` 把「購物車」推到最右邊：右緣在 600px' },
    { do: 'resize', width: 360 },
    { check: 'box', selector: '.cart', measure: 'right', value: 360, label: '頁面改成 360px 寬，「購物車」仍然貼著右邊：右緣在 360px' },
    { check: 'box', selector: '.info', measure: 'left', value: 88, from: '.product', label: '商品的文字區排在縮圖右邊：左緣在 12（內距）+ 64（縮圖）+ 12（間距）= 88px' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const exNavRow: WebExercise = {
  id: 'rwd03-ex-nav-row', title: '把直的清單變成橫的導覽列',
  statement: 'index.html 不能改。小島商店的導覽是 `nav` 裡的一份清單 `#menu`，三個 `li` 各寬 90px、高 36px，現在一個疊一個往下排。請在 style.css 加上一條宣告，用 Flexbox 讓三個 `li` 排成同一列、一個緊接一個（第二個的左緣在第一個左緣往右 90px，第三個在 180px）。`li` 的寬度與高度不要改。',
  hints: [
    '要讓元素排成一列，`display: flex` 得寫在「它們的父元素」上。三個 `li` 的父元素是誰？',
    '`li` 的父元素是 `#menu`（那個 `ul`），不是外層的 `nav`，也不是 `li` 自己。',
    '在 `#menu` 的規則裡加一行 `display: flex;`。',
  ],
  explanation: '`display: flex` 讓 `#menu` 成為 flex 容器，它的直接子元素（三個 `li`）成為 flex 項目，沿著預設的主軸（`row`，由左到右）排在同一列：左緣依序在 0、90、180px。項目之間沒有縫隙，因為這一題沒有寫 `gap` 也沒有外距。`li` 的大小不必動，一條宣告就把一般排版流的直排換成了橫排。',
  fixed: { html: String.raw`<nav>
  <ul id="menu">
    <li><a href="#home">首頁</a></li>
    <li><a href="#products">商品</a></li>
    <li><a href="#about">關於我們</a></li>
  </ul>
</nav>` },
  starter: { css: String.raw`body { margin: 0; }
#menu {
  margin: 0;
  padding: 0;
  list-style: none;
}
#menu li {
  box-sizing: border-box;
  width: 90px;
  height: 36px;
  border: 1px solid #1565c0;
  background-color: #bbdefb;
}` },
  solution: { css: String.raw`body { margin: 0; }
#menu {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
}
#menu li {
  box-sizing: border-box;
  width: 90px;
  height: 36px;
  border: 1px solid #1565c0;
  background-color: #bbdefb;
}` },
  steps: [
    { check: 'style', selector: '#menu', property: 'display', value: ['flex', 'inline-flex'], label: '`#menu` 是 flex 容器' },
    { check: 'box', selector: '#menu li:nth-child(2)', measure: 'top', value: 0, from: '#menu li:first-child', label: '第二個 `li` 和第一個排在同一列：上緣一樣高' },
    { check: 'box', selector: '#menu li:nth-child(2)', measure: 'left', value: 90, from: '#menu li:first-child', label: '第二個 `li` 緊接在第一個的右邊：左緣在第一個左緣往右 90px' },
    { check: 'box', selector: '#menu li:nth-child(3)', measure: 'left', value: 180, from: '#menu li:first-child', label: '第三個 `li` 的左緣在第一個左緣往右 180px' },
    { check: 'box', selector: '#menu li:first-child', measure: 'width', value: 90, label: '`li` 的寬度維持 90px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#menu {
  margin: 0;
  padding: 0;
  list-style: none;
}
#menu li {
  display: flex;
  box-sizing: border-box;
  width: 90px;
  height: 36px;
  border: 1px solid #1565c0;
  background-color: #bbdefb;
}` }, why: '把 `display: flex` 寫在 `li` 上。這讓每個 `li` 各自成為容器（排的是它裡面的連結），三個 `li` 彼此之間仍然是一般排版流的區塊，照樣往下疊。要橫排的是誰，`display: flex` 就寫在它們的父元素上。' },
    { files: { css: String.raw`body { margin: 0; }
nav { display: flex; }
#menu {
  margin: 0;
  padding: 0;
  list-style: none;
}
#menu li {
  box-sizing: border-box;
  width: 90px;
  height: 36px;
  border: 1px solid #1565c0;
  background-color: #bbdefb;
}` }, why: '把 `display: flex` 寫在最外層的 `nav` 上。flex 容器只管直接子元素：`nav` 的項目只有 `ul` 一個，`li` 是孫元素，仍然往下疊。' },
  ],
};

const exSpaceBetween: WebExercise = {
  id: 'rwd03-ex-space-between', title: '頁首的三個區塊：兩端貼邊，中間平均',
  statement: 'index.html 不能改。頁首 `#bar` 已經是 flex 容器，裡面有三個各寬 100px 的連結：`#logo`、`#search`、`#cart`，現在全部擠在左邊。請讓 `#logo` 貼齊頁首的左緣、`#cart` 貼齊右緣，`#search` 在兩者的正中間，也就是把剩下的空間平均放在項目之間。檢查會在 360px 與 600px 兩種頁面寬度各量一次（預覽上方的按鈕可以切換），所以不能用寫死的外距去湊。`body { margin: 0; }` 與連結的寬度要保留。',
  hints: [
    '剩下的空間要放在主軸上的哪裡，是容器上哪一個屬性決定的？',
    '六個值裡，「第一個與最後一個貼邊、空間只放在項目之間」的是哪一個？注意 `space-around` 與 `space-evenly` 在兩端也會留空白。',
    '在 `#bar` 的規則裡加一行 `justify-content: space-between;`。',
  ],
  explanation: '`justify-content: space-between` 把主軸上的剩餘空間平分在相鄰的項目之間，首尾兩個項目貼齊容器的邊。頁面寬 360px 時剩下 360 − 300 = 60px，項目之間各 30px，三個左緣在 0、130、260px；寬 600px 時剩下 300px，項目之間各 150px，左緣在 0、250、500px。樣式表裡沒有任何一個和頁面寬度有關的數字：寬度改變時，瀏覽器會重新分配。',
  viewport: { width: 360, height: 400 },
  widths: [360, 600],
  fixed: { html: String.raw`<header id="bar">
  <a id="logo" href="#home">小島商店</a>
  <a id="search" href="#search">搜尋</a>
  <a id="cart" href="#cart">購物車</a>
</header>` },
  starter: { css: String.raw`body { margin: 0; }
#bar {
  display: flex;
  background-color: #1565c0;
}
#bar a {
  width: 100px;
  height: 40px;
  line-height: 40px;
  text-align: center;
  background-color: #bbdefb;
}` },
  solution: { css: String.raw`body { margin: 0; }
#bar {
  display: flex;
  justify-content: space-between;
  background-color: #1565c0;
}
#bar a {
  width: 100px;
  height: 40px;
  line-height: 40px;
  text-align: center;
  background-color: #bbdefb;
}` },
  steps: [
    { check: 'box', selector: '#logo', measure: 'left', value: 0, label: '頁面寬 360px：`#logo` 貼齊左緣（左緣在 0px）' },
    { check: 'box', selector: '#search', measure: 'left', value: 130, label: '頁面寬 360px：`#search` 在正中間（左緣在 130px）' },
    { check: 'box', selector: '#cart', measure: 'right', value: 360, label: '頁面寬 360px：`#cart` 貼齊右緣（右緣在 360px）' },
    { do: 'resize', width: 600 },
    { check: 'box', selector: '#search', measure: 'left', value: 250, label: '頁面寬 600px：`#search` 仍在正中間（左緣在 250px）' },
    { check: 'box', selector: '#cart', measure: 'right', value: 600, label: '頁面寬 600px：`#cart` 仍貼齊右緣（右緣在 600px）' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#bar {
  display: flex;
  justify-content: space-around;
  background-color: #1565c0;
}
#bar a {
  width: 100px;
  height: 40px;
  line-height: 40px;
  text-align: center;
  background-color: #bbdefb;
}` }, why: '用了 `space-around`。它把空間平分給每個項目的左右兩側，所以兩端也有空白：頁面寬 360px 時，`#logo` 的左緣在 10px，沒有貼邊。首尾要貼邊，用的是 `space-between`。' },
    { files: { css: String.raw`body { margin: 0; }
#bar {
  display: flex;
  background-color: #1565c0;
}
#bar a {
  width: 100px;
  height: 40px;
  line-height: 40px;
  text-align: center;
  background-color: #bbdefb;
}
#search, #cart { margin-left: 30px; }` }, why: '用寫死的 `margin-left: 30px` 去湊。360px 寬時剛好對，頁面一變寬就不對了：600px 時 `#search` 的左緣還在 130px，`#cart` 也沒有貼到右邊。讓瀏覽器分配剩餘空間，才能在每一種寬度都成立。' },
    { files: { css: String.raw`body { margin: 0; }
#bar {
  display: flex;
  background-color: #1565c0;
}
#bar a {
  width: 100px;
  height: 40px;
  line-height: 40px;
  text-align: center;
  background-color: #bbdefb;
}
#cart { margin-left: auto; }` }, why: '只替 `#cart` 寫了 `margin-left: auto`。auto 外距把全部的剩餘空間放在 `#cart` 的左邊：`#cart` 貼到右緣了，但 `#search` 仍然緊貼著 `#logo`，不在正中間。' },
  ],
};

const STAGE_HTML = String.raw`<div id="stage">
  <p id="notice">已加入購物車</p>
</div>`;

const exCenter: WebExercise = {
  id: 'rwd03-ex-center', title: '把提示訊息放在正中央',
  statement: 'index.html 不能改。`#stage` 是寬 300px、高 200px 的區域，裡面的提示訊息 `#notice` 寬 140px、高 60px，現在靠在左上角。請用 Flexbox 讓 `#notice` 在 `#stage` 裡水平、垂直都置中：置中之後，它的左緣會在 `#stage` 左緣往右 (300 − 140) ÷ 2 = 80px，上緣在往下 (200 − 60) ÷ 2 = 70px。兩個盒子的寬高都不要改，也不要用寫死的外距或內距去湊：檢查還會換一個大小不同的 `#stage` 再量一次。',
  hints: [
    '先讓 `#stage` 成為 flex 容器，對齊的屬性才有作用。',
    '水平方向（主軸）用 `justify-content`，垂直方向（交錯軸）用 `align-items`，兩個都寫在容器 `#stage` 上。',
    '在 `#stage` 的規則裡加上 `display: flex; justify-content: center; align-items: center;`。',
  ],
  explanation: '`display: flex` 讓 `#stage` 成為 flex 容器、`#notice` 成為項目。主軸是水平的：`justify-content: center` 把主軸上剩下的 300 − 140 = 160px 平分在兩側，各 80px。交錯軸是垂直的：`#stage` 有 200px 的高度，`align-items: center` 把剩下的 200 − 60 = 140px 平分在上下，各 70px。因為分配的是「剩下的空間」，`#stage` 換成別的大小時訊息仍然在正中央。',
  fixed: { html: STAGE_HTML },
  starter: { css: String.raw`body { margin: 0; }
#stage {
  width: 300px;
  height: 200px;
  background-color: #e3f2fd;
}
#notice {
  width: 140px;
  height: 60px;
  margin: 0;
  background-color: #ffe082;
}` },
  solution: { css: String.raw`body { margin: 0; }
#stage {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 300px;
  height: 200px;
  background-color: #e3f2fd;
}
#notice {
  width: 140px;
  height: 60px;
  margin: 0;
  background-color: #ffe082;
}` },
  steps: [
    { check: 'style', selector: '#stage', property: 'display', value: ['flex', 'inline-flex'], label: '`#stage` 是 flex 容器' },
    { check: 'box', selector: '#notice', measure: 'left', value: 80, from: '#stage', label: '`#notice` 水平置中：左緣在 `#stage` 左緣往右 80px' },
    { check: 'box', selector: '#notice', measure: 'top', value: 70, from: '#stage', label: '`#notice` 垂直置中：上緣在 `#stage` 上緣往下 70px' },
    { check: 'box', selector: '#notice', measure: 'width', value: 140, label: '`#notice` 的寬度維持 140px' },
    { check: 'box', selector: '#notice', measure: 'height', value: 60, label: '`#notice` 的高度維持 60px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#stage {
  justify-content: center;
  align-items: center;
  width: 300px;
  height: 200px;
  background-color: #e3f2fd;
}
#notice {
  width: 140px;
  height: 60px;
  margin: 0;
  background-color: #ffe082;
}` }, why: '寫了 `justify-content` 與 `align-items`，卻忘了 `display: flex`。`#stage` 還是一般的區塊，這兩條宣告對它沒有作用，瀏覽器也不會提示錯誤，訊息仍然在左上角。' },
    { files: { css: String.raw`body { margin: 0; }
#stage {
  display: flex;
  justify-content: center;
  width: 300px;
  height: 200px;
  background-color: #e3f2fd;
}
#notice {
  width: 140px;
  height: 60px;
  margin: 0;
  background-color: #ffe082;
}` }, why: '只寫了 `justify-content: center`。它只管主軸（水平方向）：訊息水平置中了，垂直方向仍然貼在上緣。交錯軸的置中要再加 `align-items: center`。' },
    { files: { css: String.raw`body { margin: 0; }
#stage {
  display: flex;
  width: 300px;
  height: 200px;
  background-color: #e3f2fd;
}
#notice {
  width: 140px;
  height: 60px;
  margin: 70px 80px;
  background-color: #ffe082;
}` }, why: '用寫死的 `margin: 70px 80px` 把訊息推到中間。只有在 `#stage` 剛好是 300 × 200px 時才對；換一個大小（另一份檢查）就偏掉了。`justify-content` 與 `align-items` 分配的是當下剩餘的空間，不必知道容器有多大。' },
  ],
  variants: [{
    title: '區域換成寬 400px、高 120px，訊息仍然要在正中央',
    fixed: { html: STAGE_HTML.replace('<div id="stage">', '<div id="stage" style="width: 400px; height: 120px;">') },
    steps: [
      { check: 'box', selector: '#notice', measure: 'left', value: 130, from: '#stage', label: '寬 400px 時，訊息的左緣在 130px' },
      { check: 'box', selector: '#notice', measure: 'top', value: 30, from: '#stage', label: '高 120px 時，訊息的上緣在 30px' },
    ],
  }],
};

const PANEL_HTML = String.raw`<main id="panel">
  <h1 id="name">椰子餅乾</h1>
  <p id="price">NT$ 120</p>
  <a id="buy" href="#buy">加入購物車</a>
</main>`;

const PANEL_ITEMS_CSS = String.raw`#name, #price, #buy {
  height: 40px;
  margin: 0;
  background-color: #90caf9;
}
#name { width: 200px; font-size: 20px; }
#price { width: 120px; }
#buy { width: 160px; }`;

const exColumn: WebExercise = {
  id: 'rwd03-ex-column', title: '直向的商品卡：一欄排下來，兩個方向都置中',
  statement: 'index.html 不能改。商品卡 `#panel` 寬 300px、高 240px，裡面有三個高 40px、寬度不同的元素：`#name`（200px）、`#price`（120px）、`#buy`（160px）。請只修改 `#panel` 的規則，用 Flexbox 完成：（1）三個項目由上到下排成一欄；（2）每個項目在 `#panel` 裡水平置中；（3）相鄰的項目之間相隔 20px；（4）三個項目整組在 `#panel` 裡垂直置中。動手前先算：`#price` 的左緣應該在 (300 − 120) ÷ 2 = 90px；三個項目加上兩段間距共 40 × 3 + 20 × 2 = 160px，所以 `#name` 的上緣應該在 (240 − 160) ÷ 2 = 40px。檢查還會換一個大小不同的 `#panel` 再量一次。',
  hints: [
    '先決定主軸：項目要往下排，`flex-direction` 該是什麼？主軸一換，`justify-content` 與 `align-items` 管的方向也跟著換。',
    '主軸是垂直的時候，水平置中是交錯軸的事（`align-items`），垂直置中才是主軸的事（`justify-content`）。項目之間的空白用 `gap`。',
    '在 `#panel` 的規則裡加上 `display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 20px;`。',
  ],
  explanation: '`flex-direction: column` 讓主軸由上到下，交錯軸變成水平。`align-items: center` 在交錯軸上讓每個項目各自置中：`#name` 的左緣在 (300 − 200) ÷ 2 = 50px，`#price` 在 90px，`#buy` 在 70px。`gap: 20px` 只在相鄰的項目之間留白。主軸上剩下 240 − 160 = 80px，`justify-content: center` 把它平分在上下各 40px，所以 `#name` 的上緣在 40px，`#price` 在 40 + 40 + 20 = 100px。`#buy` 是連結（行內元素），成為 flex 項目之後寬高直接有效。',
  fixed: { html: PANEL_HTML },
  starter: { css: String.raw`body { margin: 0; }
#panel {
  width: 300px;
  height: 240px;
  background-color: #e3f2fd;
}
` + PANEL_ITEMS_CSS },
  solution: { css: String.raw`body { margin: 0; }
#panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 20px;
  width: 300px;
  height: 240px;
  background-color: #e3f2fd;
}
` + PANEL_ITEMS_CSS },
  steps: [
    { check: 'style', selector: '#panel', property: 'display', value: ['flex', 'inline-flex'], label: '`#panel` 是 flex 容器' },
    { check: 'style', selector: '#panel', property: 'flex-direction', value: 'column', label: '`#panel` 的主軸是由上到下（`column`）' },
    { check: 'box', selector: '#price', measure: 'left', value: 90, from: '#panel', label: '`#price` 水平置中：左緣在 `#panel` 左緣往右 90px' },
    { check: 'box', selector: '#buy', measure: 'left', value: 70, from: '#panel', label: '`#buy` 水平置中：左緣在 `#panel` 左緣往右 70px' },
    { check: 'box', selector: '#name', measure: 'top', value: 40, from: '#panel', label: '三個項目整組垂直置中：`#name` 的上緣在 `#panel` 上緣往下 40px' },
    { check: 'box', selector: '#price', measure: 'top', value: 60, from: '#name', label: '相鄰的項目相隔 20px：`#price` 的上緣在 `#name` 上緣往下 60px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;
  width: 300px;
  height: 240px;
  background-color: #e3f2fd;
}
` + PANEL_ITEMS_CSS }, why: '以為 `justify-content: center` 永遠是水平置中。主軸改成 `column` 之後，它管的是垂直方向：整組垂直置中了，三個項目卻都靠在左邊。直向容器的水平置中是 `align-items: center`。' },
    { files: { css: String.raw`body { margin: 0; }
#panel {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  width: 300px;
  height: 240px;
  background-color: #e3f2fd;
}
` + PANEL_ITEMS_CSS }, why: '忘了 `flex-direction: column`。預設的主軸是 `row`：三個項目橫排成一列，加起來比 300px 的容器還寬，只好被壓窄。要往下排，得先把主軸改成 `column`。' },
    { files: { css: String.raw`body { margin: 0; }
#panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 300px;
  height: 240px;
  background-color: #e3f2fd;
}
` + PANEL_ITEMS_CSS.replace('margin: 0;', 'margin: 0 0 20px;') }, why: '不用 `gap`，改成替每個項目寫 `margin-bottom: 20px`。最後一個項目的下面也多了 20px，整組變成 180px 高，置中之後 `#name` 的上緣在 30px 而不是 40px，看起來偏上。`gap` 只在項目之間留白，不會多出這一段。' },
  ],
  variants: [{
    title: '商品卡換成寬 400px、高 300px，項目仍然置中、間距仍是 20px',
    fixed: { html: PANEL_HTML.replace('<main id="panel">', '<main id="panel" style="width: 400px; height: 300px;">') },
    steps: [
      { check: 'box', selector: '#price', measure: 'left', value: 140, from: '#panel', label: '寬 400px 時，`#price` 的左緣在 140px' },
      { check: 'box', selector: '#name', measure: 'top', value: 70, from: '#panel', label: '高 300px 時，`#name` 的上緣在 70px' },
      { check: 'box', selector: '#price', measure: 'top', value: 60, from: '#name', label: '間距仍是 20px' },
    ],
  }],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD03: LessonContent = {
  lessonId: 'RWD03',
  motivation: '導覽列要橫排、標誌靠左而購物車靠右、一則訊息要放在區塊的正中央：只靠區塊與行內的排版很難做到，頁面寬度一變又得重算。這一課用 `display: flex` 建立 flex 容器，分清楚主軸與交錯軸，再用 `justify-content` 與 `align-items` 分配剩下的空間。學完之後，你能做出水平的導覽列與兩個方向都置中的內容，並在動手之前先算出每個項目會落在哪裡。',
  sections: [
    {
      id: 'rwd03-container-section', title: 'flex 容器與 flex 項目',
      blocks: [
        { type: 'p', text: '在一般排版流裡，區塊一個接一個往下疊，行內元素排在文字行裡。想把三個區塊排成一列，可以把它們改成 `inline-block`，但元素之間會多出原始碼裡的空白造成的縫隙；想讓一個盒子在另一個盒子裡垂直置中，用到目前為止學過的屬性也很難寫得乾淨。Flexbox（彈性盒子排版，flexible box layout）是 CSS 專門為「把一排東西排好、對齊、分配空間」設計的排版方式，也是響應式設計最常用的工具：它分配的是容器當下剩餘的空間，所以頁面變寬或變窄時不必重算。' },
        { type: 'p', text: '用法從一條宣告開始：在父元素上寫 `display: flex`。這個父元素就成為 flex 容器（flex container），它的每一個直接子元素成為 flex 項目（flex item）。項目不再照區塊或行內的規則排，而是沿著一條叫做主軸（main axis）的線，一個接一個排在同一列。預設的主軸是水平的；在中文、英文這類由左到右書寫的頁面，項目從左邊開始往右排。' },
        { type: 'example', id: 'rwd03-container' },
        { type: 'p', text: '兩份清單的 HTML 完全相同，共用 `.menu` 的樣式：`list-style: none` 拿掉清單項目前面的圓點，`padding: 0` 拿掉瀏覽器替清單加上的左內距。差別只在 `#flexed` 多了 `display: flex` 與 `height: 60px`。上面的清單仍在一般排版流裡：每個 `li` 是區塊，各佔一列、填滿 300px。下面的清單裡，三個 `li` 成了 flex 項目，在預覽裡看三件事：' },
        { type: 'list', items: [
          '三個項目排在同一列，從容器的左邊開始，一個緊接一個，中間沒有縫隙。',
          '每個項目的寬度只包住自己的文字與內距，不再填滿 300px。右邊淺色的部分是容器剩下的空間，後面兩節就是在決定它要放在哪裡。',
          '沒有任何一個項目寫了 `height`，卻都和容器一樣高 60px：在和主軸垂直的方向，也就是交錯軸（cross axis）上，項目預設會被拉伸到填滿。',
        ] },
        { type: 'p', text: 'flex 容器自己對外仍然是一個區塊：它獨佔一列，沒有設定寬度時填滿父元素（範例裡是因為寫了 `width: 300px`）。改變的是容器裡面的排法。成為 flex 項目之後，一般排版流的幾條規則不再適用：' },
        { type: 'table', head: ['比較', '一般排版流的區塊', 'flex 項目（預設）'], rows: [
          ['怎麼排', '各佔一列，往下疊', '沿主軸排在同一列'],
          ['沒有設定寬度時', '填滿父元素的寬度', '剛好包住自己的內容'],
          ['沒有設定高度時', '剛好包住自己的內容', '拉伸到和這一列一樣高'],
          ['相鄰的外距', '上下相鄰的外距會合併', '不合併，各算各的'],
          ['原本是行內的元素（`a`、`span`）', '`width`、`height` 不適用', '成為項目後當成區塊計算，`width`、`height` 有效'],
        ] },
        { type: 'callout', tone: 'warning', title: '只有直接子元素是項目', text: '`display: flex` 只影響容器的直接子元素。導覽列常見的結構是 `nav` 裡有 `ul`，`ul` 裡有 `li`：把 `display: flex` 寫在 `nav` 上，項目只有 `ul` 一個，`li` 是孫元素，仍然往下疊。要讓 `li` 橫排，容器必須是它們的父元素 `ul`。反方向的錯誤也很常見：寫成 `li { display: flex; }`，結果是每個 `li` 各自變成容器，`li` 彼此之間仍然是一般排版流。記法是：要排成一列的是誰，就把 `display: flex` 寫在它們的父元素上。' },
        { type: 'callout', tone: 'tip', title: '動手試：拿掉高度，再拿掉 flex', text: '按「動手改這個範例」，把 `#flexed` 的 `height: 60px` 刪掉再執行：容器的高度改由項目決定，剛好包住它們。再把 `display: flex` 也刪掉：兩份清單變得一模一樣。一條宣告就能在兩種排法之間切換，HTML 完全不用動。' },
      ],
    },
    {
      id: 'rwd03-axes-section', title: '主軸與交錯軸：flex-direction',
      blocks: [
        { type: 'p', text: 'Flexbox 的對齊屬性都不說「水平」或「垂直」，而是說主軸與交錯軸。主軸是項目排列的方向，交錯軸和主軸垂直。先分清楚主軸與交錯軸各指哪個方向，才知道該用哪一個屬性。主軸的方向由容器的 `flex-direction` 決定：' },
        { type: 'table', head: ['flex-direction 的值', '主軸（項目排列的方向）', '交錯軸'], rows: [
          ['`row`（預設）', '水平，由左到右', '垂直'],
          ['`column`', '垂直，由上到下', '水平'],
          ['`row-reverse`', '水平，由右到左', '垂直'],
          ['`column-reverse`', '垂直，由下到上', '水平'],
        ] },
        { type: 'example', id: 'rwd03-direction' },
        { type: 'p', text: '兩個容器裡是同樣的三個項目：兩個藍色的寫了 `width: 60px; height: 40px`，黃色的什麼大小都沒寫。上面的容器沒有寫 `flex-direction`，就是預設的 `row`：第二個項目接在第一個的右邊；黃色項目的寬度只包住數字 3，高度卻被拉伸到和這一列一樣的 40px。下面的容器只多了一行 `flex-direction: column`：主軸轉成由上到下，項目往下排；交錯軸跟著換成水平，所以黃色項目現在是寬度被拉伸到和容器一樣的 240px，高度只包住文字。「沿主軸包住內容、沿交錯軸拉伸」這條規則沒有變，變的是兩條軸的方向。' },
        { type: 'p', text: '直向的 flex 容器乍看和一般排版流一樣，都是往下疊，但它仍然是 flex 排版：項目的外距不合併，而且後面兩節的對齊屬性都能用。這一課最值得記住的一張表，是哪一個屬性管哪一條軸：' },
        { type: 'table', head: ['屬性', '寫在哪裡', '管哪一條軸', 'row 時是哪個方向', 'column 時是哪個方向'], rows: [
          ['`justify-content`', '容器', '主軸', '水平', '垂直'],
          ['`align-items`', '容器', '交錯軸', '垂直', '水平'],
          ['`align-self`', '單一個項目', '交錯軸', '垂直', '水平'],
        ] },
        { type: 'callout', tone: 'warning', title: '畫面上的順序變了，原始碼的順序沒有變', text: '`row-reverse`、`column-reverse`，以及寫在項目上的 `order` 屬性（數字小的排在前面，預設都是 0），改變的只有畫面上的順序。鍵盤按 Tab 移動焦點的順序、螢幕閱讀器朗讀的順序，仍然照 HTML 原始碼的順序。把導覽列用 `row-reverse` 反過來排，使用鍵盤的人會看到焦點從最右邊開始一路往左移，和眼睛由左到右閱讀的順序相反。順序對內容有意義時，應該直接調整 HTML 裡的順序，而不是用 CSS 把它排成另一個樣子。' },
        { type: 'callout', tone: 'tip', title: '動手試：把起點換到右邊', text: '把範例裡 `#column` 的 `flex-direction: column` 改成 `flex-direction: row-reverse` 再執行。三個項目靠到容器的右邊，由右往左依序是 1、2、3：主軸的起點換到了右邊。下一節會用到 `flex-start` 這個值，它指的是「主軸的起點」，不一定是左邊。' },
      ],
    },
    {
      id: 'rwd03-justify-section', title: 'justify-content：沿主軸分配剩下的空間',
      blocks: [
        { type: 'p', text: '項目沿主軸排好之後，容器通常還有剩。下面的範例裡，每個容器寬 300px，三個項目各寬 60px，一共 180px，剩下 300 − 180 = 120px。這一段叫做剩餘空間（free space）。`justify-content` 寫在容器上，決定剩餘空間要放在主軸的哪裡；項目的大小不會因此改變。它有六個常用的值：' },
        { type: 'example', id: 'rwd03-justify' },
        { type: 'p', text: '六列的 HTML 與項目的大小完全相同，只有 `justify-content` 不同。對照下表，在預覽裡找出那 120px 被放到哪裡了：' },
        { type: 'table', head: ['justify-content 的值', '120px 怎麼分', '三個項目的左緣'], rows: [
          ['`flex-start`（沒有寫時的效果）', '全部放在最後一個項目之後', '0、60、120px'],
          ['`center`', '兩側各 60px', '60、120、180px'],
          ['`flex-end`', '全部放在第一個項目之前', '120、180、240px'],
          ['`space-between`', '分成 2 份放在項目之間，各 60px；兩端貼邊', '0、120、240px'],
          ['`space-around`', '分成 3 份，每個項目左右各得 20px：兩端 20px，項目之間 40px', '20、120、220px'],
          ['`space-evenly`', '分成 4 份，兩端與項目之間都是 30px', '30、120、210px'],
        ] },
        { type: 'p', text: '後三個值最容易混淆，差別在兩端。`space-between` 的第一個與最後一個項目貼齊容器的邊，空間只放在項目之間；`space-around` 把空間平分給每個項目的左右兩側，所以兩端的空白是項目之間的一半；`space-evenly` 讓每一段空白都一樣寬，包含兩端。「標誌貼左邊、購物車貼右邊」這種兩端貼邊的頁首，用的就是 `space-between`。' },
        { type: 'callout', tone: 'warning', title: '沒有剩餘空間，就沒有東西可分', text: '`justify-content` 分配的是剩下的空間。項目加起來剛好填滿容器時，六個值看起來都一樣。直向的容器最常遇到這個狀況：`flex-direction: column` 的容器沒有設定高度時，高度剛好包住所有項目，主軸上的剩餘空間是 0，寫了 `justify-content: center` 也不會垂直置中，要先給容器一個高度。另外，`justify-content` 要寫在容器上；寫在項目上並不會移動那個項目，瀏覽器也不會提示錯誤。' },
        { type: 'callout', tone: 'tip', title: '動手試：把容器改窄，先算再看', text: '把範例裡 `.row` 的 `width: 300px` 改成 `width: 240px`。剩餘空間變成 240 − 180 = 60px，先心算再執行：`center` 兩側各 30px；`space-between` 的項目之間各 30px；`space-evenly` 的四段空白各 15px。項目的寬度都沒有變，變的只有空白。' },
      ],
    },
    {
      id: 'rwd03-align-section', title: 'align-items：交錯軸上的對齊與置中',
      blocks: [
        { type: 'p', text: '`justify-content` 管主軸，交錯軸由 `align-items` 負責。它同樣寫在容器上，決定每個項目在交錯軸方向（主軸是 `row` 時就是垂直方向）靠哪裡：' },
        { type: 'table', head: ['align-items 的值', '項目在交錯軸上的位置（以 row 為例）'], rows: [
          ['`stretch`（沒有寫時的效果）', '沒有設定高度的項目被拉伸到填滿；設定了高度的項目維持自己的高度，靠上緣'],
          ['`flex-start`', '靠交錯軸的起點（上緣），高度包住內容'],
          ['`center`', '置中：上下的空白一樣多'],
          ['`flex-end`', '靠交錯軸的終點（下緣）'],
          ['`baseline`', '讓各個項目第一行文字的基線對齊，適合字級不同的文字並排'],
        ] },
        { type: 'p', text: '只想讓某一個項目和其他項目不一樣時，在那個項目上寫 `align-self`。它的值和 `align-items` 相同，會蓋過容器替它決定的對齊方式。' },
        { type: 'example', id: 'rwd03-align' },
        { type: 'p', text: '上面的容器 `#cross` 高 100px，寫了 `align-items: center`。A 高 40px，交錯軸上剩下 100 − 40 = 60px，上下各 30px，所以 A 的上緣在 30px；B 高 80px，上下各 10px。C 和 A 一樣高，但它自己寫了 `align-self: flex-end`，所以貼著容器的下緣，上緣在 100 − 40 = 60px。注意交錯軸上的剩餘空間是每個項目各算各的，不像主軸是所有項目加起來一起算。' },
        { type: 'p', text: '下面的容器 `#stage` 把兩條軸都用上了：`justify-content: center` 讓訊息在主軸（水平）置中，`align-items: center` 讓它在交錯軸（垂直）置中。`display: flex; justify-content: center; align-items: center;` 這三條宣告，是 Flexbox 最常被用到的組合。`#stage` 沒有寫寬度，所以填滿整個頁面；按預覽上方的寬度按鈕，在 360px 與 600px 之間切換：訊息的左緣從 (360 − 140) ÷ 2 = 110px 變成 (600 − 140) ÷ 2 = 230px，始終在正中央，樣式表裡沒有任何一個數字需要跟著改。' },
        { type: 'callout', tone: 'warning', title: '垂直置中需要容器有多出來的高度', text: '寫了 `align-items: center` 卻看不出置中，最常見的原因是容器沒有設定高度。橫向的容器沒有 `height` 時，高度剛好等於最高的那個項目；如果只有一個項目，或項目都一樣高，交錯軸上沒有剩餘空間，置中、靠上、靠下看起來都一樣。先替容器設定 `height`（或 `min-height`），置中才看得出來。第二個常見的錯誤是在直向的容器裡把兩個屬性記反：`flex-direction: column` 時，水平置中要用 `align-items`，垂直置中才是 `justify-content`。' },
        { type: 'callout', tone: 'note', title: '開發者工具裡看到的 normal', text: '沒有寫 `justify-content` 與 `align-items` 時，開發者工具顯示的計算值是 `normal`。在 flex 容器裡，`normal` 的效果分別和 `flex-start`、`stretch` 相同，所以這一課直接把它們稱為沒有寫時的效果。' },
        { type: 'callout', tone: 'tip', title: '動手試：看拉伸什麼時候發生', text: '把範例裡 `#cross` 的 `align-items: center` 整行刪掉再執行：A 與 B 有自己的高度，不會被拉伸，都靠到上緣；C 仍然靠下，因為 `align-self` 還在。再把 `#a` 的 `height: 40px` 也刪掉：A 沒有高度了，被拉伸成和容器一樣的 100px 高。' },
      ],
    },
    {
      id: 'rwd03-builds-section', title: '間距、auto 外距與常見的版面',
      blocks: [
        { type: 'p', text: '項目之間要留空白，最直接的寫法是容器上的 `gap`（間距）：`gap: 16px` 在相鄰的項目之間各留 16px，第一個項目之前與最後一個項目之後都不留。比起替每個項目寫外距，它不必另外處理「最後一個不要外距」。`gap` 的其他用法留到 RWD04。' },
        { type: 'p', text: '另一個實用的技巧是 auto 外距。在一般排版流裡，`margin: 0 auto` 讓有寬度的區塊水平置中；在 flex 容器裡，項目的外距寫成 `auto`，會把那個方向上全部的剩餘空間拿走。在某個項目上寫 `margin-left: auto`，剩餘空間就全部變成它左邊的外距，它和排在它後面的項目一起被推到主軸的另一端。這時剩餘空間已經被 auto 外距用完，`justify-content` 就沒有東西可分了。' },
        { type: 'example', id: 'rwd03-navbar' },
        { type: 'p', text: '頁首 `.bar` 是 flex 容器，四個連結直接是它的項目：連結原本是行內元素，成為項目之後 `width` 與 `height` 直接有效，不必再寫 `inline-block`。`align-items: center` 讓高 32px 的連結在高 56px 的頁首裡垂直置中；`gap: 16px` 讓「新品」的左緣在 88 + 16 = 104px。「購物車」寫了 `margin-left: auto`，被推到最右邊。按預覽上方的寬度按鈕在 360px 與 600px 之間切換：「購物車」的右緣始終貼著頁首的右邊，前三個項目留在左邊不動，多出來的寬度全部落在「特價」與「購物車」之間。' },
        { type: 'p', text: '頁首下面的商品是另一種常見的版面，叫做媒體物件（media object）：左邊一張固定大小的圖，右邊是文字。`.product` 只需要 `display: flex` 與 `gap: 12px`：縮圖與文字區 `.info` 並排，文字區的左緣在 12（內距）+ 64（縮圖）+ 12（間距）= 88px。文字很長、空間不夠時，項目會被壓窄；項目怎麼伸長、怎麼縮短、要不要換到下一列，由 `flex-grow`、`flex-shrink`、`flex-basis` 與 `flex-wrap` 控制，是下一課 RWD04 的內容。把這一課的幾種版面整理起來：' },
        { type: 'table', head: ['版面', '容器上的宣告', '項目上的宣告'], rows: [
          ['水平導覽列：標誌靠左，某些項目靠右', '`display: flex; align-items: center; gap: 16px;`', '要靠右的第一個項目寫 `margin-left: auto`'],
          ['兩端貼邊、平均分散的頁首', '`display: flex; justify-content: space-between;`', '不需要'],
          ['正中央的訊息', '`display: flex; justify-content: center; align-items: center;`，容器要有高度', '不需要'],
          ['媒體物件：左圖右文', '`display: flex; gap: 12px;`', '圖片給固定的寬高'],
        ] },
        { type: 'callout', tone: 'tip', title: '動手試：換一個項目來推', text: '把範例裡 `.cart { margin-left: auto; }` 整行刪掉，改在 `.bar .logo` 的規則裡加上 `margin-right: auto;` 再執行。現在剩餘空間全部變成標誌右邊的外距：標誌留在左邊，三個連結一起被推到右邊，彼此之間仍然相隔 16px。' },
      ],
    },
    {
      id: 'rwd03-predict-section', title: '動手之前，先預測項目的位置',
      blocks: [
        { type: 'p', text: '把這一課串起來。看到一段 Flexbox 的 CSS，照下面的順序問四個問題，就能在瀏覽器畫出來之前，算出每個項目的位置：' },
        { type: 'list', ordered: true, items: [
          '誰是 flex 容器？只有它的直接子元素是項目。',
          '`flex-direction` 是什麼？它決定主軸與交錯軸各是哪個方向；沒有寫就是 `row`。',
          '主軸上剩下多少？用容器在主軸方向的長度，減掉所有項目的長度與項目之間的 `gap`。再看 `justify-content`（或項目的 auto 外距）把這段剩餘空間放在哪裡。',
          '交錯軸上，每個項目各自看 `align-items`（或它自己的 `align-self`）：沒有設定大小的項目預設被拉伸，其他的依照值靠起點、置中或靠終點。',
        ] },
        { type: 'p', text: '舉一個例子：容器寬 320px、高 100px，寫了 `display: flex; gap: 10px; justify-content: flex-end; align-items: center;`，裡面有三個寬 80px、高 40px 的項目。主軸是水平的：剩餘空間是 320 − 80 × 3 − 10 × 2 = 60px，`flex-end` 把它全部放在最前面，所以三個項目的左緣在 60、150、240px。交錯軸是垂直的：每個項目上下各有 (100 − 40) ÷ 2 = 30px，上緣都在 30px。' },
        { type: 'table', head: ['想做的事', '主軸是 row 時', '主軸是 column 時'], rows: [
          ['水平置中', '`justify-content: center`', '`align-items: center`'],
          ['垂直置中', '`align-items: center`，容器要有高度', '`justify-content: center`，容器要有高度'],
          ['相鄰的項目之間留固定的空白', '`gap`', '`gap`'],
          ['把一個項目推到另一端', '該項目寫 `margin-left: auto`', '該項目寫 `margin-top: auto`'],
        ] },
        { type: 'p', text: '檢查實際的頁面時，開發者工具的 Elements 面板會在 flex 容器的標籤旁邊顯示一個 `flex` 標記；點選它，頁面上會標出容器裡每個項目的範圍與空白。想多練習各種值的組合，可以到互動實驗島的 Flexbox 練習場，調整屬性並立刻看到項目移動。' },
        { type: 'callout', tone: 'tip', title: '動手試：加上 gap 再算一次', text: '回到 justify-content 六個值的範例，在 `.row` 的規則裡加上 `gap: 10px;`。先算：剩餘空間變成 300 − 180 − 10 × 2 = 100px，所以 `flex-end` 那一列第一個項目的左緣在 100px，`center` 那一列在 50px。`space-between` 那一列看起來卻沒有變：項目之間是 10px 的間距加上 100 ÷ 2 = 50px 的剩餘空間，仍然是 60px。執行之後對照你的答案。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'rwd03-q1', prompt: '這段 HTML 搭配的樣式只有 `nav { display: flex; }`。哪些元素成為 flex 項目？',
      code: { language: 'HTML', text: '<nav>\n  <ul>\n    <li><a href="#home">首頁</a></li>\n    <li><a href="#shop">商品</a></li>\n  </ul>\n</nav>' },
      options: ['兩個 `li`', '兩個 `a`', '只有 `ul`', '`ul`、`li` 與 `a` 全部'],
      answer: 2,
      explanation: 'flex 容器只把自己的直接子元素變成項目。`nav` 的直接子元素只有 `ul`，所以項目只有它一個；`li` 是孫元素、`a` 是曾孫元素，仍然照原本的規則排，`display` 也不會繼承下去。要讓兩個 `li` 橫排，`display: flex` 要寫在它們的父元素 `ul` 上。',
    },
    {
      id: 'rwd03-q2', prompt: '`.row` 裡有三個 `div`。第一個 `div` 的左緣，距離 `.row` 的左緣多少？',
      code: { language: 'CSS', text: '.row {\n  display: flex;\n  width: 540px;\n  justify-content: space-around;\n}\n.row div { width: 100px; }' },
      options: ['0px', '40px', '60px', '120px'],
      answer: 1,
      explanation: '剩餘空間是 540 − 100 × 3 = 240px。`space-around` 把它平分給三個項目，每個項目得到 80px，左右各 40px，所以第一個項目的左緣在 40px（項目之間則是 40 + 40 = 80px）。0px 是 `space-between`（兩端貼邊）；60px 是 `space-evenly`（240 ÷ 4）；120px 是 `center`（240 ÷ 2）。',
    },
    {
      id: 'rwd03-q3', prompt: '容器寫了 `display: flex; flex-direction: column;`，寬 300px。要讓裡面一個寬 120px 的按鈕在容器裡水平置中，該在容器上加哪一條宣告？',
      options: ['`justify-content: center`', '`text-align: center`', '`align-self: center`', '`align-items: center`'],
      answer: 3,
      explanation: '`flex-direction: column` 時主軸是垂直的，水平方向是交錯軸，交錯軸上的對齊由容器的 `align-items` 決定。`justify-content: center` 管主軸，在這裡是垂直方向；`text-align: center` 置中的是盒子裡的文字，不會移動項目這個盒子；`align-self` 是寫在項目上、只影響那個項目自己的屬性，寫在容器上不會對齊它裡面的項目。',
    },
    {
      id: 'rwd03-q4', prompt: '`.tag` 是 `.bar` 的直接子元素，裡面只有一行文字。樣式只有下面這些。`.tag` 有多高？',
      code: { language: 'CSS', text: '.bar {\n  display: flex;\n  height: 80px;\n}\n.tag { width: 60px; }' },
      options: ['80px', '一行文字的高度', '40px', '60px'],
      answer: 0,
      explanation: '主軸是預設的 `row`，交錯軸是垂直的。沒有寫 `align-items` 時效果是 `stretch`：沒有設定高度的項目沿交錯軸被拉伸到填滿，所以 `.tag` 和容器一樣高 80px。「一行文字的高度」是一般排版流的區塊，或 `align-items` 設成 `flex-start`、`center` 時的結果；40px 與 60px 沒有任何規則會得出來，項目的高度和自己的寬度無關。',
    },
    {
      id: 'rwd03-q5', prompt: '`.box` 裡只有一個 `<p>`。套用這條規則之後，`<p>` 水平置中了，垂直方向卻看不出置中。最可能的原因是什麼？',
      code: { language: 'CSS', text: '.box {\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  background-color: lightyellow;\n}' },
      options: [
        '`align-items` 要寫在 `<p>` 上才有效',
        '垂直置中還要再加 `flex-direction: column`',
        '`.box` 沒有設定高度，高度剛好包住 `<p>`，交錯軸上沒有剩餘空間',
        '`<p>` 是區塊元素，不能成為 flex 項目',
      ],
      answer: 2,
      explanation: '`align-items: center` 分配的是交錯軸上的剩餘空間。`.box` 沒有 `height`，高度剛好包住唯一的項目，上下沒有多出來的空間，置中和靠上看起來一樣；替 `.box` 加上 `height` 或 `min-height` 就看得出來。`align-items` 本來就是寫在容器上；加了 `flex-direction: column` 只會讓兩個屬性管的方向對調；任何元素只要是 flex 容器的直接子元素，都會成為項目。',
    },
    {
      id: 'rwd03-q6', prompt: '導覽列的 HTML 依序是「首頁」「商品」「聯絡」三個連結，容器寫了 `display: flex; flex-direction: row-reverse;`，畫面上由左到右變成「聯絡」「商品」「首頁」。使用者連續按 Tab 鍵，焦點依序移到哪裡？',
      options: [
        '首頁、商品、聯絡：照 HTML 原始碼的順序',
        '聯絡、商品、首頁：照畫面上由左到右的順序',
        '只會停在「首頁」，其他兩個連結被略過',
        '三個連結成為 flex 項目之後，都無法用鍵盤取得焦點',
      ],
      answer: 0,
      explanation: '`row-reverse`（以及 `order`）只改變畫面上的排列，Tab 的順序與螢幕閱讀器朗讀的順序仍然照 HTML 原始碼：首頁、商品、聯絡。所以在畫面上，焦點是從最右邊往左移的，和視覺的閱讀順序相反。成為 flex 項目不會讓連結失去焦點，也不會略過任何一個；順序有意義時，應該直接調整 HTML。',
    },
    {
      id: 'rwd03-q7', prompt: '頁首是主軸為 `row` 的 flex 容器，裡面依序是「標誌」「新品」「特價」「購物車」四個項目，容器還有剩餘空間。只在「購物車」上寫 `margin-left: auto`，結果是什麼？',
      options: [
        '四個項目平均分散在整個頁首',
        '「購物車」在頁首裡水平置中，其他三個留在左邊',
        '沒有變化：flex 項目的 `auto` 外距等於 0',
        '「購物車」被推到最右邊，其他三個留在左邊',
      ],
      answer: 3,
      explanation: '在 flex 容器裡，項目的 auto 外距會拿走那個方向上全部的剩餘空間。`margin-left: auto` 讓剩餘空間全部變成「購物車」左邊的外距，把它推到主軸的終點（最右邊），前三個項目留在左邊不動。平均分散是 `justify-content` 的 `space-between` 等值的效果；只寫左邊的 auto 外距不會置中，因為剩餘空間全部在它的左邊；auto 外距在 flex 容器裡也不是 0，這正是它好用的地方。',
    },
    {
      id: 'rwd03-q8', prompt: '`.panel` 裡有兩個 `div`。第一個 `div` 的上緣，距離 `.panel` 的上緣多少？',
      code: { language: 'CSS', text: '.panel {\n  display: flex;\n  flex-direction: column;\n  justify-content: flex-end;\n  height: 200px;\n}\n.panel div { height: 50px; }' },
      options: ['0px', '100px', '50px', '150px'],
      answer: 1,
      explanation: '`flex-direction: column` 讓主軸由上到下，`justify-content` 管的就是垂直方向。剩餘空間是 200 − 50 × 2 = 100px，`flex-end` 把它全部放在第一個項目之前，所以第一個 `div` 的上緣在 100px，第二個在 150px。0px 是 `flex-start`（或把 `justify-content` 誤以為只管水平方向）的結果；50px 是 `center`（上下各 50px）；150px 是第二個 `div` 的上緣。',
    },
  ],
  webCode: {
    examples: [container, direction, justify, align, navbar],
    exercises: [exNavRow, exSpaceBetween, exCenter, exColumn],
  },
};
