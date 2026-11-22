import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB05 CSS selectors, the cascade and specificity (WEB-2). A web-code lesson: every example is a small page of the
 * made-up 小島圖書館 whose computed styles (checked in Chromium) prove which rule won; in the exercises the HTML is
 * fixed and the learner edits style.css. No JavaScript. Out of scope: the box model (WEB06), positioning (WEB07),
 * custom properties, @layer, :is()/:where(), media queries and units.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const rule: WebExample = {
  id: 'web05-rule', title: '兩條規則、四條宣告',
  description: '小島圖書館的公告頁。index.html 用 `<link>` 引用 style.css；style.css 有兩條規則，各有兩條宣告。',
  files: {
    html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>小島圖書館公告</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>小島圖書館</h1>
  <p>週六提早在 15:00 閉館。</p>
  <p>二樓自習室整修到月底。</p>
</body>
</html>`,
    css: String.raw`h1 {
  color: #1a5276;
  font-size: 28px;
}

p {
  color: #333333;
  font-size: 18px;
}`,
  },
  observe: [
    { check: 'style', selector: 'h1', property: 'color', value: '#1a5276', label: '`h1` 規則的第一條宣告生效：標題的文字是 `#1a5276`' },
    { check: 'style', selector: 'h1', property: 'font-size', value: '28px', label: '同一條規則的第二條宣告也生效：標題的字是 28px' },
    { check: 'style', selector: 'p', property: 'color', value: '#333333', label: '第一個段落的文字是 `#333333`' },
    { check: 'style', selector: 'p + p', property: 'color', value: '#333333', label: '第二個段落也是 `#333333`：一條規則套用到選擇器選到的每一個元素' },
    { check: 'count', selector: 'head > style', count: 1, label: '預覽把 style.css 的內容放進 `head` 裡的一個 `style` 元素，位置就是原本的 `<link>`' },
  ],
};

const selectors: WebExample = {
  id: 'web05-selectors', title: '型別、class、id 與群組選擇器',
  description: '同一頁有三種段落：一般的、`class` 含有 `notice` 的公告，以及 `id` 是 `hours` 的開放時間。五條規則各設定不同的 CSS 屬性。',
  files: {
    html: String.raw`<h1>小島圖書館</h1>
<h2>公告</h2>
<p class="notice">週六提早在 15:00 閉館。</p>
<p>歡迎利用線上預約借書。</p>
<p class="notice urgent">颱風天全日休館。</p>
<h2>開放時間</h2>
<p id="hours">週二至週日 9:00–17:00</p>`,
    css: String.raw`h1, h2 {
  color: #1a5276;
}

p {
  color: #333333;
}

.notice {
  background-color: #fff3cd;
}

.urgent {
  font-weight: bold;
}

#hours {
  font-size: 20px;
}`,
  },
  observe: [
    { check: 'style', selector: 'h2', property: 'color', value: '#1a5276', label: '群組選擇器 `h1, h2` 讓 `h2` 也是 `#1a5276`' },
    { check: 'count', selector: '.notice', count: 2, label: '`.notice` 選到兩個元素：`class` 裡有 `notice` 的兩個段落' },
    { check: 'style', selector: '.urgent', property: 'background-color', value: '#fff3cd', label: '第三個段落有兩個 class：底色來自 `.notice` 規則' },
    { check: 'style', selector: '.urgent', property: 'font-weight', value: 'bold', label: '同一個段落的粗體來自 `.urgent` 規則' },
    { check: 'style', selector: '#hours', property: 'font-size', value: '20px', label: '`#hours` 只選到 `id` 是 `hours` 的那一個段落：它的字是 20px' },
  ],
};

const combinators: WebExample = {
  id: 'web05-combinators', title: '後代、子代與虛擬類別',
  description: '導覽列與內文裡都有連結；`main` 底下有兩個段落，另一個段落包在 `section` 裡。四條規則都依元素的位置或狀態來選。',
  files: {
    html: String.raw`<nav>
  <a href="#new">新書通報</a>
  <a href="#hours">開放時間</a>
  <a href="#card">借書證</a>
</nav>
<main>
  <p>借書前請先到櫃台辦理<a href="#card">借書證</a>。</p>
  <section class="tip">
    <p>小提醒：每本書可借 14 天。</p>
  </section>
  <p>還書請投入門口的還書箱。</p>
</main>`,
    css: String.raw`nav a {
  text-decoration: none;
  margin-right: 12px;
}

nav a:first-child {
  font-weight: bold;
}

nav a:hover {
  background-color: #fff3cd;
}

main > p {
  border-left: 4px solid #1a5276;
  padding-left: 8px;
}`,
  },
  observe: [
    { check: 'style', selector: 'nav a', property: 'text-decoration-line', value: 'none', label: '後代選擇器 `nav a` 選到導覽列裡的連結：它們沒有底線' },
    { check: 'style', selector: 'main a', property: 'text-decoration-line', value: 'underline', label: '內文裡的連結不在 `nav` 裡，維持瀏覽器預設的底線' },
    { check: 'style', selector: 'nav a', property: 'font-weight', value: 'bold', label: '`nav a:first-child` 選到排第一的連結「新書通報」：它是粗體' },
    { check: 'style', selector: 'main > p', property: 'border-left-width', value: '4px', label: '子代選擇器 `main > p` 選到 `main` 的子段落：左邊有 4px 的邊框' },
    { check: 'style', selector: '.tip p', property: 'border-left-width', value: '0px', label: '`.tip` 裡的段落是 `main` 的孫元素，`main > p` 選不到：沒有邊框' },
  ],
};

const cascade: WebExample = {
  id: 'web05-cascade', title: '五條宣告搶同一個屬性',
  description: '四個段落的 `color` 各有好幾條宣告在搶。規則故意從特異性高的寫到低的；`/* … */` 是 CSS 的註解，瀏覽器會略過。',
  files: {
    html: String.raw`<h2>本週公告</h2>
<p>歡迎光臨小島圖書館。</p>
<p class="notice">週六提早在 15:00 閉館。</p>
<p class="notice" id="hours">今天開放到 17:00。</p>
<p class="notice" style="color: #6c3483;">週一休館。</p>`,
    css: String.raw`/* 特異性 1-0-0 */
#hours {
  color: #1e8449;
}

/* 特異性 0-1-0 */
.notice {
  color: #b03a2e;
}

/* 特異性 0-0-1 */
p {
  color: #1a5276;
}

/* 特異性 0-0-1，寫在後面 */
p {
  color: #333333;
}

h2 {
  font-weight: normal;
}`,
  },
  observe: [
    { check: 'style', selector: 'h2 + p', property: 'color', value: '#333333', label: '第一個段落：兩條 `p` 規則特異性相同，寫在後面的 `#333333` 勝出' },
    { check: 'style', selector: 'p.notice', property: 'color', value: '#b03a2e', label: '第二個段落：`.notice`（0-1-0）寫在 `p`（0-0-1）前面，仍然勝出' },
    { check: 'style', selector: '#hours', property: 'color', value: '#1e8449', label: '第三個段落：`#hours`（1-0-0）贏過 `.notice` 與 `p`' },
    { check: 'style', selector: 'p[style]', property: 'color', value: '#6c3483', label: '第四個段落：行內的 `style` 屬性贏過樣式表裡的選擇器' },
    { check: 'style', selector: 'h2', property: 'font-weight', value: 'normal', label: '標題不是粗體：你寫的 `h2` 規則蓋過了瀏覽器的預設樣式' },
  ],
};

const inheritance: WebExample = {
  id: 'web05-inheritance', title: '會繼承的與不會繼承的',
  description: '只有兩條規則：`#hours` 替整個 `section` 設定顏色、字型、邊框與內距，`strong` 設定自己的顏色。標題、段落與連結都沒有自己的規則。',
  files: {
    html: String.raw`<section id="hours">
  <h2>開放時間</h2>
  <p>週二至週日 <strong>9:00–17:00</strong></p>
  <p>週一休館，<a href="#news">看本週公告</a>。</p>
</section>`,
    css: String.raw`#hours {
  color: #1a5276;
  font-family: sans-serif;
  border: 2px solid #1a5276;
  padding: 12px;
}

strong {
  color: #b03a2e;
}`,
  },
  observe: [
    { check: 'style', selector: '#hours h2', property: 'color', value: '#1a5276', label: '沒有規則指定 `h2` 的 `color`：它繼承了 `#hours` 的 `#1a5276`' },
    { check: 'style', selector: '#hours p', property: 'color', value: '#1a5276', label: '段落的 `color` 也是繼承來的 `#1a5276`' },
    { check: 'style', selector: '#hours', property: 'border-top-width', value: '2px', label: '`section` 自己有 2px 的邊框' },
    { check: 'style', selector: '#hours p', property: 'border-top-width', value: '0px', label: '`border` 不會繼承：段落沒有邊框' },
    { check: 'style', selector: 'strong', property: 'color', value: '#b03a2e', label: '直接選到 `strong` 的規則（0-0-1）贏過從 `#hours` 繼承來的顏色' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const exClass: WebExercise = {
  id: 'web05-ex-class', title: '只替公告上色',
  statement: 'index.html 不能改。頁面上有三個段落，其中兩則公告的 `class` 是 `notice`。在 style.css 加一條規則，讓 `class` 含有 `notice` 的段落文字顏色變成 `#b03a2e`。原本的兩條規則留著：`#intro` 那一段要維持 `#333333`，`h1` 要維持 `#1a5276`。隱藏的檢查會換一份公告排在不同位置的頁面再試一次，所以要用 class 來選，不要靠段落的順序。',
  hints: [
    '要選「某一類」元素，用 class 選擇器：一個點，後面接 class 的名稱。',
    '新規則寫成「選擇器 { 屬性: 值; }」，文字顏色的 CSS 屬性是 `color`。原本的 `p` 規則不用改。',
    '選擇器是 `.notice`，宣告是 `color: #b03a2e;`。公告同時被 `p` 與 `.notice` 選到，class 選擇器的特異性比較高，所以公告聽新規則的。',
  ],
  explanation: '`.notice { color: #b03a2e; }` 選到所有 `class` 含有 `notice` 的元素。兩則公告同時也被 `p` 規則選到，兩條宣告都設定 `color`：`.notice` 的特異性是 0-1-0，比 `p` 的 0-0-1 高，所以公告是 `#b03a2e`，新規則寫在 `p` 的前面或後面都一樣。`#intro` 那一段沒有 `notice` 這個 class，只被 `p` 選到，維持 `#333333`。',
  fixed: { html: String.raw`<h1>小島圖書館</h1>
<p class="notice">週六提早在 15:00 閉館。</p>
<p id="intro">歡迎利用線上預約借書。</p>
<p class="notice">二樓自習室整修到月底。</p>` },
  starter: { css: String.raw`h1 {
  color: #1a5276;
}

p {
  color: #333333;
}
` },
  solution: { css: String.raw`h1 {
  color: #1a5276;
}

p {
  color: #333333;
}

.notice {
  color: #b03a2e;
}` },
  steps: [
    { check: 'style', selector: '.notice', property: 'color', value: '#b03a2e', label: '第一則公告的文字是 `#b03a2e`' },
    { check: 'style', selector: '#intro + .notice', property: 'color', value: '#b03a2e', label: '第二則公告的文字也是 `#b03a2e`' },
    { check: 'style', selector: '#intro', property: 'color', value: '#333333', label: '不是公告的 `#intro` 維持 `#333333`' },
    { check: 'style', selector: 'h1', property: 'color', value: '#1a5276', label: '標題維持 `#1a5276`' },
  ],
  mistakes: [
    { files: { css: String.raw`h1 {
  color: #1a5276;
}

p {
  color: #333333;
}

notice {
  color: #b03a2e;
}` }, why: '選擇器少了開頭的點。`notice` 是型別選擇器，找的是 `<notice>` 這種標籤；頁面上沒有這種元素，規則一個都選不到，瀏覽器也不會提醒。class 選擇器要寫成 `.notice`。' },
    { files: { css: String.raw`h1 {
  color: #1a5276;
}

p {
  color: #b03a2e;
}` }, why: '直接把 `p` 規則的顏色改掉，三個段落全部變色，`#intro` 也不再是 `#333333`。`p` 選到的是所有段落；要區分公告和一般段落，得用只有公告才有的 class。' },
    { files: { css: String.raw`h1 {
  color: #1a5276;
}

p {
  color: #333333;
}

#notice {
  color: #b03a2e;
}` }, why: '把 `.` 寫成了 `#`。`#notice` 是 id 選擇器，找的是 `id="notice"` 的元素；公告上寫的是 `class="notice"`，所以選不到。' },
  ],
  variants: [{
    title: '公告排在最後面的另一頁',
    fixed: { html: String.raw`<h1>小島圖書館</h1>
<p id="intro">今天照常開放。</p>
<p>還書請投入門口的還書箱。</p>
<p class="notice">颱風天全日休館。</p>` },
    steps: [
      { check: 'style', selector: '.notice', property: 'color', value: '#b03a2e', label: '公告的文字是 `#b03a2e`' },
      { check: 'style', selector: '#intro', property: 'color', value: '#333333', label: '`#intro` 維持 `#333333`' },
      { check: 'style', selector: '#intro + p', property: 'color', value: '#333333', label: '第二個一般段落維持 `#333333`' },
    ],
  }],
};

const exCurrent: WebExercise = {
  id: 'web05-ex-current', title: '讓目前頁面的連結變色',
  statement: 'index.html 不能改。設計上，選單 `.menu` 裡的連結是 `#1a5276`，其中 `class="current"` 的「開放時間」要是 `#b03a2e`。style.css 兩條規則都寫了，「開放時間」卻還是 `#1a5276`。先算出兩個選擇器的特異性，再修改選擇器，讓 `.menu` 裡的 `.current` 是 `#b03a2e`，另外兩個連結維持 `#1a5276`。不要用 `!important`：隱藏的檢查會換一份「開放時間」連結上另外寫了行內樣式的頁面，確認行內樣式仍然生效。',
  hints: [
    '`.menu a` 有一個 class 選擇器和一個型別選擇器，`.current` 只有一個 class 選擇器。哪一個的特異性比較高？這時候順序還有用嗎？',
    '讓 `.current` 那條規則的選擇器再明確一點，特異性至少要追上 `.menu a`；如果只是追平，還要寫在它後面才會贏。',
    '例如把選擇器改成 `.menu .current`（中間有空白：「`.menu` 裡面的 `.current`」），特異性是 0-2-0，高過 `.menu a` 的 0-1-1。',
  ],
  explanation: '`.menu a` 的特異性是 0-1-1，`.current` 是 0-1-0：第二關就輸了，所以把規則搬到後面也沒有用。改成 `.menu .current`（0-2-0）或 `.menu a.current`（0-2-1）就會勝出，而且只多了一個 class，之後要再蓋過它也不難。另外兩個連結沒有 `current` 這個 class，仍然只被 `.menu a` 選到。`!important` 也能讓它變色，但會連行內樣式一起蓋掉，以後只能用另一個 `!important` 才改得動。',
  fixed: { html: String.raw`<nav class="menu">
  <a href="#new">新書通報</a>
  <a class="current" href="#hours">開放時間</a>
  <a href="#card">借書證</a>
</nav>` },
  starter: { css: String.raw`.current {
  color: #b03a2e;
}

.menu a {
  color: #1a5276;
}` },
  solution: { css: String.raw`.menu .current {
  color: #b03a2e;
}

.menu a {
  color: #1a5276;
}` },
  steps: [
    { check: 'style', selector: '.menu .current', property: 'color', value: '#b03a2e', label: '選單裡 `class` 是 `current` 的「開放時間」是 `#b03a2e`' },
    { check: 'style', selector: '.menu a', property: 'color', value: '#1a5276', label: '第一個連結「新書通報」維持 `#1a5276`' },
    { check: 'style', selector: '.menu .current + a', property: 'color', value: '#1a5276', label: '第三個連結「借書證」維持 `#1a5276`' },
  ],
  mistakes: [
    { files: { css: String.raw`.menu a {
  color: #1a5276;
}

.current {
  color: #b03a2e;
}` }, why: '只把 `.current` 規則搬到後面。順序是最後一關：`.menu a` 的特異性是 0-1-1，`.current` 只有 0-1-0，在特異性這一關就分出勝負了，輪不到順序。' },
    { files: { css: String.raw`.menu.current {
  color: #b03a2e;
}

.menu a {
  color: #1a5276;
}` }, why: '`.menu.current` 中間沒有空白，意思是「同一個元素同時有 `menu` 與 `current` 兩個 class」，頁面上沒有這樣的元素。要選「`.menu` 裡面的 `.current`」，兩個選擇器之間要有空白。' },
    { files: { css: String.raw`.current {
  color: #b03a2e !important;
}

.menu a {
  color: #1a5276;
}` }, why: '`!important` 確實讓這一頁的「開放時間」變了色，但它連元素上的行內樣式都蓋過去（隱藏的檢查看的就是這一點）。之後想再調整這個連結的顏色，只能再寫一個 `!important`。該修的是選擇器的特異性。' },
    { files: { css: String.raw`.current {
  color: #b03a2e;
}

.menu a {
  color: #b03a2e;
}` }, why: '把 `.menu a` 的顏色改成 `#b03a2e`，「開放時間」是變色了，但另外兩個連結也跟著變，分不出哪一個是目前的頁面。' },
  ],
  variants: [{
    title: '開放時間的連結另外寫了行內樣式',
    fixed: { html: String.raw`<nav class="menu">
  <a href="#new">新書通報</a>
  <a class="current" href="#hours" style="color: #6c3483;">開放時間</a>
  <a href="#card">借書證</a>
</nav>` },
    steps: [
      { check: 'style', selector: '.menu .current', property: 'color', value: '#6c3483', label: '行內樣式指定的 `#6c3483` 仍然生效' },
      { check: 'style', selector: '.menu a', property: 'color', value: '#1a5276', label: '第一個連結維持 `#1a5276`' },
    ],
  }],
};

const exFloors: WebExercise = {
  id: 'web05-ex-floors', title: '只標出最外層的樓層',
  statement: 'index.html 不能改。樓層清單 `.floors` 有兩層：最外層的 `li` 是「一樓」「二樓」，它們各自包著一份內層的清單。現在的規則讓每一個 `li` 都有左邊框。請修改 style.css 做到兩件事：（1）只有最外層的兩個 `li`（也就是 `.floors` 的子元素）有 4px 的左邊框，內層的 `li` 沒有左邊框；（2）最外層的 `li` 是粗體（`font-weight: bold`），內層的 `li` 是一般粗細（`font-weight: normal`）。',
  hints: [
    '`.floors li` 是後代選擇器，不管隔幾層都選得到。只選「下一層」要用哪一個組合符號？',
    '把選擇器改成 `.floors > li` 之後，在同一條規則加上 `font-weight: bold;`，再執行看看內層的字：`font-weight` 會不會繼承？',
    '內層的字跟著變粗是繼承造成的。再寫一條直接選到內層的規則，例如 `.floors ul { font-weight: normal; }` 或 `.floors li li { font-weight: normal; }`。',
  ],
  explanation: '`.floors > li` 只選到父元素是 `.floors` 的兩個 `li`，所以邊框只畫在最外層；`border` 不會繼承，內層自然沒有。`font-weight` 則會繼承：最外層的 `li` 變粗，包在它裡面的清單也跟著粗。`>` 決定的是規則選到誰，不能阻止值往下傳；要讓內層回到一般粗細，得有一條直接選到內層的規則（`.floors ul` 選到內層的清單，它的 `li` 再從它繼承 `normal`），直接指定的值贏過繼承來的值。',
  fixed: { html: String.raw`<ul class="floors">
  <li>一樓
    <ul>
      <li>兒童區</li>
      <li>期刊區</li>
    </ul>
  </li>
  <li>二樓
    <ul>
      <li>自習室</li>
    </ul>
  </li>
</ul>` },
  starter: { css: String.raw`.floors li {
  border-left: 4px solid #1a5276;
  padding-left: 8px;
}` },
  solution: { css: String.raw`.floors > li {
  border-left: 4px solid #1a5276;
  padding-left: 8px;
  font-weight: bold;
}

.floors ul {
  font-weight: normal;
}` },
  steps: [
    { check: 'style', selector: '.floors > li', property: 'border-left-width', value: '4px', label: '最外層的第一個項目「一樓」有 4px 的左邊框' },
    { check: 'style', selector: '.floors > li + li', property: 'border-left-width', value: '4px', label: '最外層的第二個項目「二樓」也有 4px 的左邊框' },
    { check: 'style', selector: '.floors li li', property: 'border-left-width', value: '0px', label: '內層的項目沒有左邊框' },
    { check: 'style', selector: '.floors > li', property: 'font-weight', value: 'bold', label: '最外層的項目是粗體' },
    { check: 'style', selector: '.floors li li', property: 'font-weight', value: 'normal', label: '內層的項目是一般粗細' },
  ],
  mistakes: [
    { files: { css: String.raw`ul > li {
  border-left: 4px solid #1a5276;
  padding-left: 8px;
  font-weight: bold;
}

.floors ul {
  font-weight: normal;
}` }, why: '把選擇器寫成 `ul > li`。內層的 `li` 的父元素也是一個 `ul`，所以每一個 `li` 都符合，邊框還是全部都有。`>` 的左邊要寫能認出最外層清單的 `.floors`。' },
    { files: { css: String.raw`.floors > li {
  border-left: 4px solid #1a5276;
  padding-left: 8px;
  font-weight: bold;
}` }, why: '邊框對了，但內層的字也變成粗體。`>` 只決定規則選到誰；`font-weight` 會繼承，值照樣從最外層的 `li` 傳給它裡面的清單。要再寫一條直接選到內層的規則，把 `font-weight` 設回 `normal`。' },
  ],
};

const exRefactor: WebExercise = {
  id: 'web05-ex-refactor', title: '換掉太強的選擇器',
  statement: 'index.html 不能改。style.css 想做到三件事：一般段落是 `#333333`；警示（`class` 含有 `alert`）是 `#b03a2e`；已經過期的警示（同時有 `alert` 與 `expired`）是 `#666666`。現在四個段落卻全部是 `#333333`。先比較三個選擇器的特異性，預測是哪一條規則贏了；再把那條規則的選擇器換成特異性比較低的寫法，讓四個段落各自是該有的顏色。請不要用 `!important`，也不要靠更強的選擇器硬蓋。',
  hints: [
    '算一算：`#news p`、`.alert`、`.expired` 的特異性各是多少？有 id 的那一條，class 規則贏得過嗎？',
    '問題在第一條規則的選擇器，不在後面兩條。「所有段落」不需要用 id 來選。',
    '把 `#news p` 改成 `p`（0-0-1）或 `section p`（0-0-2）。之後 `.alert`（0-1-0）就贏過它；`.alert` 與 `.expired` 特異性相同，同時有兩個 class 的段落聽寫在後面的 `.expired`。',
  ],
  explanation: '`#news p` 的特異性是 1-0-1，`.alert` 與 `.expired` 都只有 0-1-0，在特異性這一關就輸了，所以四個段落全是 `#333333`。把第一條的選擇器換成 `p`（0-0-1），一個 class 就能贏過它；`.alert` 與 `.expired` 平手，同時有這兩個 class 的段落由寫在後面的 `.expired` 決定。三條規則的特異性都很低，通用的寫前面、特例寫後面，以後要再加例外，也只需要多一個 class。',
  fixed: { html: String.raw`<section id="news">
  <h2>本週公告</h2>
  <p>歡迎利用線上預約借書。</p>
  <p class="alert">颱風天全日休館。</p>
  <p class="alert expired">上週的停電已經恢復。</p>
  <p>還書請投入門口的還書箱。</p>
</section>` },
  starter: { css: String.raw`#news p {
  color: #333333;
}

.alert {
  color: #b03a2e;
}

.expired {
  color: #666666;
}` },
  solution: { css: String.raw`p {
  color: #333333;
}

.alert {
  color: #b03a2e;
}

.expired {
  color: #666666;
}` },
  steps: [
    { check: 'style', selector: 'h2 + p', property: 'color', value: '#333333', label: '第一個一般段落是 `#333333`' },
    { check: 'style', selector: '.alert', property: 'color', value: '#b03a2e', label: '警示「颱風天全日休館。」是 `#b03a2e`' },
    { check: 'style', selector: '.alert.expired', property: 'color', value: '#666666', label: '已經過期的警示是 `#666666`' },
    { check: 'style', selector: '.expired + p', property: 'color', value: '#333333', label: '最後一個一般段落是 `#333333`' },
  ],
  mistakes: [
    { files: { css: String.raw`#news p {
  color: #333333;
}

.alert {
  color: #b03a2e !important;
}

.expired {
  color: #666666;
}` }, why: '替 `.alert` 加上 `!important`。警示是變色了，但 `!important` 贏過所有沒加的宣告，連寫在後面的 `.expired` 也蓋掉，過期的警示跟著變成 `#b03a2e`。要救回來只能再加一個 `!important`，樣式表就這樣越寫越難改。' },
    { files: { css: String.raw`#news p {
  color: #333333;
}

#news .alert {
  color: #b03a2e;
}

.expired {
  color: #666666;
}` }, why: '用更強的 `#news .alert`（1-1-0）硬蓋過 `#news p`（1-0-1）。警示是變色了，但 `.expired`（0-1-0）現在贏不了它，過期的警示也成了 `#b03a2e`；每加一條規則都得把 id 再寫一次。把第一條規則的特異性降下來，才是一次解決。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const WEB05: LessonContent = {
  lessonId: 'WEB05',
  motivation: '「我明明寫了樣式，為什麼沒有生效？」幾乎都不是瀏覽器出錯，而是規則沒有選到那個元素，或是另一條規則贏了。這一課先學會用選擇器準確選出想要的元素，再學瀏覽器在多條規則互相衝突時怎麼決定誰生效：串接、特異性與繼承。學完之後，面對頁面上任何一個元素，你都說得出它的每一項樣式是哪一條規則決定的。',
  sections: [
    {
      id: 'web05-rule-section', title: '一條規則的組成，以及 CSS 寫在哪裡',
      blocks: [
        { type: 'p', text: 'WEB01 看過一條 CSS 規則：`h1 { color: #1a5276; }`。這一課要寫很多條，先把每個部分的名字說清楚，之後查資料、看開發者工具時才對得上。一條規則（rule）分成兩部分：大括號前面的選擇器（selector）決定「套用到哪些元素」，大括號和裡面的內容是宣告區塊（declaration block），決定「改成什麼樣子」。區塊裡的每一條宣告（declaration）寫成「屬性: 值;」：冒號前面是 CSS 屬性（property），冒號後面是值（value），最後以分號結尾。以 `h1 { color: #1a5276; font-size: 28px; }` 為例：' },
        { type: 'table', head: ['部分', '在這條規則裡', '作用'], rows: [
          ['選擇器', '`h1`', '選出頁面上所有的 `h1` 元素'],
          ['宣告區塊', '`{` 到 `}`', '包住這條規則的所有宣告'],
          ['宣告', '`color: #1a5276;` 與 `font-size: 28px;`', '一條宣告設定一項外觀；一條規則可以有很多條宣告，通常一行寫一條'],
          ['CSS 屬性', '`color`、`font-size`', '要設定的是哪一項外觀：文字顏色、字的大小'],
          ['值', '`#1a5276`、`28px`', '設定成什麼'],
        ] },
        { type: 'example', id: 'web05-rule' },
        { type: 'p', text: 'style.css 裡有兩條規則、四條宣告。`p` 規則只寫了一次，兩個段落都變成 `#333333`、18px：選擇器選到幾個元素，宣告就套用到幾個元素。打開「動手改這個範例」，在 `p` 規則裡加一行 `font-weight: bold;` 再執行，兩個段落會一起變粗。這一課的範例只用幾個一看就懂的 CSS 屬性：`color`（文字顏色）、`background-color`（底色）、`font-size`（字的大小）、`font-weight`（粗細）、`text-decoration`（底線等文字裝飾）與 `border`（邊框）；重點是「誰被選到」與「誰贏」，不是屬性本身。' },
        { type: 'p', text: 'CSS 可以寫在三個地方，範例用的是第一種。本站的預覽不能下載檔案，所以會把 style.css 的內容放進一個 `style` 元素，擺在 `<link>` 原本的位置；打開 DOM 樹，`head` 裡看到的就是它。' },
        { type: 'table', head: ['寫在哪裡', '寫法', '影響範圍'], rows: [
          ['獨立的樣式表檔案', '規則寫在 style.css，HTML 的 `<head>` 裡用 `<link rel="stylesheet" href="style.css">` 引用', '引用這個檔案的每一頁'],
          ['style 元素', '在 `<head>` 裡寫 `<style>` 與 `</style>`，規則放在中間', '只有這一頁'],
          ['style 屬性', '寫在元素的開始標籤上，例如 `<p style="color: #b03a2e;">`：只有宣告，沒有選擇器。這種寫法稱為行內樣式（inline style）', '只有這一個元素'],
        ] },
        { type: 'list', items: [
          '優先用獨立的檔案：整個網站的每一頁都引用同一份 style.css，改一個地方，全站一起換。',
          'HTML 只管內容、CSS 只管外觀，兩個檔案都比較好讀，也可以分開修改。',
          '瀏覽器可以把下載過的 style.css 存起來，逛到同一個網站的下一頁時不必重新下載。',
          '行內樣式沒有選擇器，每個元素都得各寫一次；它的優先順序又很高，之後很難用樣式表蓋過（第四節會看到）。',
        ] },
        { type: 'callout', tone: 'warning', title: '少一個分號，壞掉的是兩條宣告', text: '分號是宣告與宣告之間的分隔。上一條宣告的結尾漏了分號，瀏覽器會把下一行也當成同一條宣告的值：`color: #333333` 換行接 `font-size: 18px;`，讀起來是一條值很奇怪的 `color` 宣告，整條無效，於是顏色和字的大小兩個都沒有生效。少了結尾的 `}` 也一樣麻煩：後面那條規則會被當成這條規則的一部分，不會照你的意思套用。兩種情況瀏覽器都不會顯示錯誤訊息；樣式整批失效時，先檢查分號和大括號有沒有成對。' },
      ],
    },
    {
      id: 'web05-selectors-section', title: '基本選擇器：型別、class、id 與群組',
      blocks: [
        { type: 'p', text: '選擇器的工作只有一件：從頁面上選出元素。最基本的三種，剛好對應 HTML 裡的三樣東西：標籤名稱、`class` 屬性與 `id` 屬性（後兩個屬性在 WEB02 介紹過）。' },
        { type: 'table', head: ['選擇器', '寫法', '選到誰'], rows: [
          ['型別選擇器（type selector）', '標籤名稱，例如 `p`', '頁面上每一個 `p` 元素'],
          ['class 選擇器（class selector）', '一個點加上 class 名稱，例如 `.notice`', '`class` 屬性裡有 `notice` 的所有元素：`<p class="notice">`、`<li class="notice urgent">` 都算'],
          ['id 選擇器（id selector）', '`#` 加上 id，例如 `#hours`', '`id` 是 `hours` 的那一個元素；同一個 id 在一頁裡只能出現一次'],
          ['群組', '用逗號隔開幾個選擇器，例如 `h1, h2`', '符合其中任何一個的元素：所有 `h1` 與所有 `h2`'],
        ] },
        { type: 'example', id: 'web05-selectors' },
        { type: 'p', text: '對照預覽和 style.css：三個 `h1`、`h2` 標題都是深藍色，因為 `h1, h2` 把同一組宣告交給兩個選擇器，不必重複寫兩條規則。四個段落都被 `p` 選到，文字是 `#333333`。有淡黃底色的是 `class` 裡有 `notice` 的兩段。第三個段落寫的是 `class="notice urgent"`：用空白隔開兩個名稱，表示它同時屬於兩類，所以 `.notice` 的底色和 `.urgent` 的粗體都套用在它身上。最後一段的字比較大，因為整頁只有它的 `id` 是 `hours`。' },
        { type: 'p', text: '基本選擇器可以直接接在一起寫，中間不留空白，意思是「同時符合」：`p.notice` 是「有 `notice` 這個 class 的 `p`」，`.notice.urgent` 是「同時有這兩個 class 的元素」。按「動手改這個範例」，把 `.urgent` 改成 `.notice.urgent`，結果不變；再把 HTML 第四行的 `<p>` 改成 `<p class="urgent">`，執行後它不會變粗，因為它沒有 `notice`。' },
        { type: 'p', text: '三種之中，日常最常用的是 class。型別選擇器的範圍太大：`p` 一寫，整頁的段落全部中選，適合設定「所有段落共通」的樣式，不適合挑出其中幾個。id 一頁只能用在一個元素上，為它寫的規則沒辦法給別的元素重複使用，而且第四節會看到，它的特異性高得不好處理。class 的名字可以自己取，可以用在任意多個元素上，一個元素也可以有好幾個 class。取名字時說它「是什麼」（`notice`、`card`），不要說它「長怎樣」（`red-text`）：哪天公告改成橘色，名字還是對的。' },
        { type: 'callout', tone: 'warning', title: '少了一個點，或多了一個空白', text: '把 `.notice` 寫成 `notice`，它就變成型別選擇器，找的是 `<notice>` 這種標籤；頁面上沒有，規則一個元素都選不到，瀏覽器也不會提醒你。class 與 id 的名稱在標準模式的頁面裡區分大小寫，`.Notice` 選不到 `class="notice"`。另外，`p.notice` 與 `p .notice` 只差一個空白，意思完全不同：前者是「有這個 class 的段落」，後者是下一節的後代選擇器，選的是「段落裡面、有這個 class 的元素」。' },
      ],
    },
    {
      id: 'web05-combinators-section', title: '依位置與狀態來選：後代、子代與虛擬類別',
      blocks: [
        { type: 'p', text: '有時候想選的不是「某一類元素」，而是「某個地方的元素」：導覽列裡的連結不要底線，內文裡的連結照舊。替導覽列的每個連結各加一個 class 當然可以，但 HTML 的結構本身已經說明了它們在哪裡。用組合符號把兩個選擇器接起來，就能依照元素在 DOM 樹上的位置來選；再加上冒號開頭的虛擬類別（pseudo-class），還能依照元素當下的狀態來選。' },
        { type: 'table', head: ['寫法', '名稱', '選到誰'], rows: [
          ['`nav a`（中間是空白）', '後代選擇器', '`nav` 裡面所有的 `a`，不管中間隔了幾層'],
          ['`main > p`', '子代選擇器', '父元素就是 `main` 的 `p`：只算下一層，孫元素不算'],
          ['`a:first-child`', '虛擬類別', '本身是父元素第一個子元素的 `a`'],
          ['`a:hover`', '虛擬類別', '滑鼠游標正停在上面的 `a`'],
        ] },
        { type: 'example', id: 'web05-combinators' },
        { type: 'p', text: '讀這類選擇器要從最右邊讀起：`nav a` 選到的是 `a`，左邊的 `nav` 只是條件，樣式不會套用到 `nav` 本身。看預覽：導覽列的三個連結沒有底線；內文裡的「借書證」不在 `nav` 裡，維持瀏覽器預設的底線。`main > p` 替 `main` 的兩個子段落畫了左邊框；「小提醒」那一段也在 `main` 裡面，但它的父元素是 `section`，對 `main` 來說是孫元素，所以沒有邊框。打開「動手改這個範例」，把 `main > p` 的 `>` 刪掉變成後代選擇器 `main p`，再執行：三個段落都有邊框了。' },
        { type: 'p', text: '虛擬類別不需要在 HTML 裡多寫任何東西。`nav a:first-child` 選到 `nav` 裡排第一的連結，所以「新書通報」是粗體。`nav a:hover` 只在游標移到連結上的那段時間成立：用滑鼠在預覽裡把游標移上去，底色出現，移開就消失。常用的還有 `:focus`：元素取得鍵盤焦點時成立，例如用 Tab 鍵移到連結或 WEB04 的輸入欄位上。另外有一種用中括號、依 HTML 屬性來選的屬性選擇器（attribute selector）：`input[type="email"]` 只選到 `type` 是 `email` 的輸入欄位。' },
        { type: 'callout', tone: 'warning', title: 'first-child 不是「第一個這種元素」', text: '`p:first-child` 的意思是「一個 `p`，而且它是父元素的第一個子元素」，不是「父元素裡的第一個 `p`」。如果 `main` 裡依序是一個 `h2` 和兩個 `p`，`main` 的第一個子元素是 `h2`，`main > p:first-child` 一個都選不到，瀏覽器也不會提醒你。規則沒有生效時，先到 DOM 樹確認那個元素是不是真的排在第一個。' },
        { type: 'callout', tone: 'tip', title: '選擇器越短越好', text: '`nav a` 這樣兩段的選擇器很實用；但不要順著 DOM 樹一路寫下去，像 `main section ul li a`。這種選擇器只要 HTML 的結構動了一層就失效，別人也很難一眼看出它想選什麼。結構說不清楚的時候，替元素取一個 class，往往比加長選擇器好。' },
      ],
    },
    {
      id: 'web05-cascade-section', title: '串接與特異性：同一個屬性只有一個贏家',
      blocks: [
        { type: 'p', text: '到目前為止，選到同一個元素的規則剛好都設定不同的 CSS 屬性，所以全部一起生效。實際的樣式表很快就會撞在一起：`p` 規則說段落是深灰色，`.notice` 規則說公告是紅褐色，那麼 `<p class="notice">` 是什麼顏色？一個元素的一個屬性，最後只能有一個值。瀏覽器會把選到這個元素、又設定了這個屬性的宣告全部找出來，再依固定的規則選出唯一的贏家，這個過程就是串接（cascade），CSS（Cascading Style Sheets）的第一個字指的就是它。對你自己寫的樣式表，依序比三關，前一關分出勝負就不再往下比：' },
        { type: 'list', ordered: true, items: [
          '重要性：值的後面加了 `!important` 的宣告，贏過所有沒加的。它是特例，第六節說明為什麼盡量不要用；以下先假設都沒有加。',
          '特異性（specificity）：選擇器把對象指得越明確，特異性越高。高的贏，和它寫在前面或後面無關。',
          '原始碼順序：特異性也相同時，寫在後面的贏。',
        ] },
        { type: 'p', text: '特異性不是一個數字，而是三個計數器，這一課寫成 A-B-C。A 是選擇器裡 id 選擇器的個數；B 是 class 選擇器、屬性選擇器與虛擬類別的個數；C 是型別選擇器的個數。比較時從 A 比起：A 大的贏；A 相同才比 B；B 也相同才比 C。計數器之間不會進位：十個 class 也贏不過一個 id，十個型別選擇器也贏不過一個 class。空白與 `>` 這些組合符號不計分；用逗號寫成群組的選擇器，各自算各自的。' },
        { type: 'table', head: ['選擇器', 'A：id', 'B：class、屬性、虛擬類別', 'C：型別', '特異性'], rows: [
          ['`p`', '0', '0', '1', '0-0-1'],
          ['`ul > li`', '0', '0', '2', '0-0-2'],
          ['`.note`', '0', '1', '0', '0-1-0'],
          ['`a:hover`', '0', '1', '1', '0-1-1'],
          ['`input[type="email"]`', '0', '1', '1', '0-1-1'],
          ['`nav a.active`', '0', '1', '2', '0-1-2'],
          ['`#hours`', '1', '0', '0', '1-0-0'],
          ['`#hours .note`', '1', '1', '0', '1-1-0'],
        ] },
        { type: 'example', id: 'web05-cascade' },
        { type: 'p', text: '這份 style.css 故意把規則從特異性高的排到低的。如果「寫在後面的贏」是唯一的規則，最後一條 `p` 會讓四個段落都是 `#333333`；預覽裡卻有四種顏色。一段一段看：' },
        { type: 'list', items: [
          '第一個段落只被兩條 `p` 規則選到，特異性都是 0-0-1，平手，這時才比順序：後面的 `#333333` 贏過前面的 `#1a5276`。',
          '第二個段落多了 `.notice`（0-1-0）。它寫在兩條 `p` 規則的前面，仍然勝出：特異性在順序之前就分出了勝負。',
          '第三個段落還有 `#hours`（1-0-0），一個 id 贏過 class 與型別，所以是綠色。',
          '第四個段落的顏色寫在 `style` 屬性裡。行內樣式不用算特異性：它贏過樣式表裡的任何選擇器，連 id 選擇器也不例外。把第三個段落也加上 `style="color: #6c3483;"` 再執行，就能驗證。',
          '標題 `h2` 不是粗體。WEB01 看過，沒有寫任何 CSS 時標題也又大又粗，那是瀏覽器內建的預設樣式（user-agent stylesheet）。預設樣式的順位排在你寫的樣式表之後：只要你的規則選到同一個元素、設定同一個屬性，不必比特異性就會蓋過它，所以 `h2 { font-weight: normal; }` 生效了。',
        ] },
        { type: 'callout', tone: 'note', title: '比的是一條一條的宣告，不是整條規則', text: '串接是一個屬性一個屬性分開比的，輸掉的只是那一條宣告。打開「動手改這個範例」，在 `.notice` 規則裡加一行 `background-color: #fdf2e9;` 再執行：三個公告段落都有了底色，包括文字顏色輸給 `#hours` 的第三段，和輸給行內樣式的第四段。沒有別的宣告來搶 `background-color`，`.notice` 的這一條就照常生效。' },
        { type: 'callout', tone: 'warning', title: '把規則搬到後面，救不了特異性比較低的選擇器', text: '最常見的誤解是「CSS 由上往下讀，所以寫在後面的一定贏」。順序是最後一關，只有在重要性與特異性都平手時才用得上。一條 `.notice`（0-1-0）的規則不管搬到檔案多後面，都贏不過 `#news p`（1-0-1）。樣式被蓋過時，先算兩邊的特異性，不要急著搬位置。' },
      ],
    },
    {
      id: 'web05-inheritance-section', title: '繼承：沒有人指定時，沿用父元素的值',
      blocks: [
        { type: 'p', text: '上一節處理的是「好幾條宣告都直接指定了同一個元素的同一個屬性」。相反的情況其實更常見：沒有任何一條宣告替這個元素設定這個屬性。這時候，有些 CSS 屬性會沿用父元素的值，稱為繼承（inheritance）；其他屬性則用它自己的初始值。因為有繼承，只要在 `body` 上設定一次 `color` 與 `font-family`，整頁的文字都會跟著變，不必替每一種元素各寫一遍。' },
        { type: 'table', head: ['CSS 屬性', '會不會繼承', '為什麼這樣設計'], rows: [
          ['`color`、`font-family`、`font-size`、`font-weight`、`line-height`', '會', '和文字有關的屬性大多會繼承：外層設定一次，裡面的文字都沿用'],
          ['`border`、`margin`、`padding`、`background-color`', '不會', '和盒子有關的屬性大多不會繼承：外層畫了邊框，不代表裡面每個段落、每個連結都要各畫一圈'],
        ] },
        { type: 'example', id: 'web05-inheritance' },
        { type: 'p', text: '整頁只有兩條規則。`#hours` 選到的是 `section`，但標題和兩個段落的文字都成了 `#1a5276`、字型也換成無襯線字體：沒有任何規則替它們指定 `color` 與 `font-family`，於是沿用父元素的值。邊框只有外面一圈：`border` 與 `padding` 不會繼承，段落各自仍是沒有邊框的盒子。底色比較容易讓人誤會：如果替 `section` 加上 `background-color`，裡面的段落看起來也有底色，那是因為元素的背景預設是透明的，透出了後面父元素的底色，不是繼承。' },
        { type: 'p', text: '再看兩個沒有變成深藍色的地方。「9:00–17:00」是紅褐色：`strong` 規則直接選到它，蓋過了繼承。「看本週公告」這個連結維持瀏覽器預設的連結顏色：預設樣式裡有規則直接選到連結並指定了 `color`，繼承來的值同樣輪不到。標題的字比段落大，也是預設樣式直接替 `h2` 指定了 `font-size` 的緣故。繼承是最後才用上的候補：只有在完全沒有宣告直接指定這個元素的這個屬性時，才輪到它。' },
        { type: 'callout', tone: 'warning', title: '外層的選擇器再強，傳下來的值還是最弱', text: '範例裡，`#hours` 的特異性是 1-0-0，`strong` 只有 0-0-1，為什麼 `strong` 贏了？因為特異性只用來比較「直接選到同一個元素」的宣告。`#hours` 選到的是 `section`，不是 `strong`；對 `strong` 來說，直接選到它、又設定 `color` 的只有 `strong` 規則這一條，根本沒有對手。常見的狀況是：在外層的區塊上設定了文字顏色，裡面的段落卻沒有變。原因多半是樣式表某處有一條 `p { color: … }` 直接選到了段落；任何直接選到元素的宣告，不論特異性多低，都贏過繼承來的值。' },
        { type: 'callout', tone: 'tip', title: '想要它繼承，可以明說', text: '任何屬性的值都可以寫成 `inherit`，意思是「這個屬性用父元素的值」。在範例的 style.css 最後加一條 `a { color: inherit; }` 再執行，連結就會跟著 `section` 變成 `#1a5276`。這條規則直接選到了連結，所以贏過預設樣式；它指定的值則是「向父元素要」。' },
      ],
    },
    {
      id: 'web05-low-specificity-section', title: '讓特異性維持得低，並且查得出是誰贏了',
      blocks: [
        { type: 'p', text: '特異性高的選擇器，就像在會議上越喊越大聲。某條規則一旦用了 id 或一長串選擇器，之後想替它寫例外的規則就得寫得更長、更強；幾輪之後，有人受不了，加上 `!important`。' },
        { type: 'p', text: '在宣告的值後面、分號前面加上 `!important`，例如 `color: #b03a2e !important;`，這條宣告就在串接的第一關勝出：不論特異性、不論順序，連行內樣式都輸給它。聽起來很方便，問題在後面：下一個想改這個屬性的人，唯一的辦法是也寫 `!important`，兩條都有 `!important` 的宣告再回頭比特異性與順序，等於同一套比賽重來一次，樣式表卻更難讀了。它也讓「看選擇器就能判斷誰贏」這件事不再可靠。`!important` 的正當用途很少，例如你無法修改、只能蓋過的第三方樣式表；自己的樣式表裡出現衝突，該修的是選擇器。' },
        { type: 'table', head: ['寫法', '特異性', '問題', '比較好的寫法'], rows: [
          ['`#news p`', '1-0-1', '用了 id：之後只靠 class 的規則都蓋不過它', '直接選 `p`，需要區分時替區塊或段落加 class'],
          ['`main section ul li a`', '0-0-5', '一長串：HTML 的結構動一層就失效，也看不出想選的是什麼', '替連結取一個 class，例如 `.shelf-link`'],
          ['`div.card p.note`', '0-2-2', '多寫了不需要的標籤名稱與外層條件，特異性白白變高', '`.note`，或 `.card .note`'],
          ['`color: #b03a2e !important;`', '（不比特異性）', '只能用另一個 `!important` 蓋過', '找出是哪條規則贏了，調整選擇器'],
        ] },
        { type: 'list', items: [
          '以 class 為主，選擇器盡量只有一到兩段。',
          'id 留給頁內連結的錨點（WEB03）、`label` 的 `for`（WEB04）與 JavaScript，不拿來寫樣式。',
          '整頁共通的樣式（字型、文字顏色）寫在 `body` 這樣的外層，交給繼承。',
          '通用的規則寫前面，特例寫後面：特異性相同時，後面的特例自然勝出。',
          '不用 `!important` 解決自己樣式表裡的衝突。',
        ] },
        { type: 'p', text: '樣式沒有照預期出現時，不要用猜的。在真正的網頁上對著那個元素按右鍵，選「檢查」，開發者工具的 Elements（元素）面板會標出它，旁邊的 Styles（樣式）窗格列出所有選到它的規則：優先的排在上面，輸掉的宣告畫著刪除線，從哪一個祖先元素繼承來的值也會另外列出；Computed（計算樣式）窗格則直接列出每個屬性最後的值。各家瀏覽器的名稱略有不同，提供的資訊大致相同。對照這些資訊，依序回答三個問題：' },
        { type: 'list', ordered: true, items: [
          '我的規則有沒有選到這個元素？窗格裡找不到那條規則，就是選擇器的問題：少了點、多了空白、class 拼錯，或是位置和你想的不一樣。',
          '規則在，但宣告被畫上刪除線？有另一條宣告贏了。看贏的那一條的選擇器，依序比重要性、特異性、順序。',
          '沒有任何規則直接指定這個屬性？那麼值是繼承來的，或是瀏覽器的預設樣式。',
        ] },
        { type: 'callout', tone: 'tip', title: '一句話說出誰決定了這個樣式', text: '練習看著任何一個元素的任何一個屬性，把來源說成一句話：「這個段落的文字是 `#b03a2e`，因為 `.notice` 與 `p` 都直接選到它，`.notice` 的特異性 0-1-0 比較高。」或是「這個標題是深藍色，因為沒有規則直接指定它的 `color`，它繼承了 `section` 的值。」說得出這句話，就知道該改哪一條規則；說不出來，就打開開發者工具查，不要再加一條更強的規則蓋上去。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'web05-q1', prompt: '想讓 `<nav>` 裡面的連結沒有底線，頁面其他地方的連結不受影響。選擇器該怎麼寫？',
      options: ['`nav, a`', '`nav.a`', '`nav a`', '`a nav`'],
      answer: 2,
      explanation: '`nav a` 是後代選擇器，選到 `nav` 裡面所有的 `a`，其他地方的連結不符合。`nav, a` 是群組，會選到所有的 `nav` 和頁面上每一個 `a`；`nav.a` 的意思是「`class` 含有 `a` 的 `nav` 元素」；`a nav` 方向反了，選的是連結裡面的 `nav`。',
    },
    {
      id: 'web05-q2', prompt: '選擇器 `.shelf > li` 在下面這個頁面上選到幾個 `li`？',
      code: { language: 'HTML', text: '<ul class="shelf">\n  <li>文學\n    <ul>\n      <li>小說</li>\n      <li>詩集</li>\n    </ul>\n  </li>\n  <li>科學</li>\n</ul>' },
      options: ['2 個', '4 個', '1 個', '3 個'],
      answer: 0,
      explanation: '`>` 是子代選擇器，只選父元素就是 `.shelf` 的 `li`：「文學」與「科學」兩個。「小說」與「詩集」的父元素是內層那個沒有 class 的 `ul`，它們是 `.shelf` 的後代，卻不是子元素，所以選不到；寫成後代選擇器 `.shelf li` 才會四個都選到。',
    },
    {
      id: 'web05-q3', prompt: '選擇器 `nav a.active` 的特異性是多少？（依序是 id 的個數、class／屬性／虛擬類別的個數、型別的個數）',
      options: ['0-0-3', '1-0-2', '0-2-1', '0-1-2'],
      answer: 3,
      explanation: '沒有 id 選擇器（0）；一個 class 選擇器 `.active`（1）；兩個型別選擇器 `nav` 與 `a`（2），所以是 0-1-2，中間的空白是組合符號，不計分。0-0-3 把 `.active` 也當成型別選擇器；1-0-2 把 class 算成了 id；0-2-1 把 `nav` 當成了 class。',
    },
    {
      id: 'web05-q4', prompt: '頁面上有 `<p class="notice">週六提早閉館</p>`，樣式表只有下面兩條規則。這個段落的文字是什麼顏色？',
      code: { language: 'CSS', text: '.notice {\n  color: #b03a2e;\n}\n\np {\n  color: #333333;\n}' },
      options: ['`#333333`，因為 `p` 規則寫在後面', '`#b03a2e`，因為 `.notice` 的特異性比 `p` 高', '兩個顏色混在一起', '瀏覽器預設的黑色，因為兩條規則互相衝突而都失效'],
      answer: 1,
      explanation: '`.notice` 的特異性是 0-1-0，`p` 是 0-0-1；特異性比順序先比，所以 `.notice` 的 `#b03a2e` 勝出，寫在後面的 `p` 幫不上忙。只有特異性相同時才輪到「後面的贏」。串接一定會選出唯一的贏家：顏色不會混合，衝突的宣告也不會一起失效。',
    },
    {
      id: 'web05-q5', prompt: '頁面上有 `<div class="card"><p class="intro">歡迎光臨</p></div>`，樣式表只有下面兩條規則。段落的文字是什麼顏色？為什麼？',
      code: { language: 'CSS', text: '.card p {\n  color: #1e8449;\n}\n\np.intro {\n  color: #1a5276;\n}' },
      options: ['`#1e8449`，因為 `.card p` 有兩段，指得比較明確', '`#1a5276`，因為兩者特異性相同，寫在後面的贏', '`#1e8449`，因為寫在前面的規則先套用，後面的不能再改', '`#1a5276`，因為 `p.intro` 中間沒有空白，特異性比較高'],
      answer: 1,
      explanation: '兩個選擇器都是一個 class 加一個型別，特異性同為 0-1-1，平手之後才比順序，寫在後面的 `p.intro` 勝出，所以是 `#1a5276`。有沒有空白、分成幾段都不影響計分，所以「兩段比較明確」和「沒有空白比較高」都不對；CSS 也沒有「先寫先贏」這回事，特異性相同時是後面的贏。',
    },
    {
      id: 'web05-q6', prompt: '頁面上有 `<section id="hours"><p>週一休館</p></section>`，樣式表只有下面兩條規則。段落的文字是什麼顏色？為什麼？',
      code: { language: 'CSS', text: '#hours {\n  color: #1e8449;\n}\n\np {\n  color: #333333;\n}' },
      options: ['`#1e8449`，因為 id 選擇器的特異性 1-0-0 比 `p` 的 0-0-1 高', '`#1e8449`，因為 `color` 會繼承，而繼承來的值優先', '`#333333`，因為 `p` 規則寫在後面', '`#333333`，因為 `p` 規則直接選到段落，贏過繼承來的值'],
      answer: 3,
      explanation: '`#hours` 選到的是 `section`，段落能從它得到的只有繼承來的顏色；`p` 規則直接選到段落，而任何直接選到元素的宣告，不論特異性多低，都贏過繼承來的值，所以是 `#333333`。特異性只比較選到同一個元素的宣告，1-0-0 對 0-0-1 在這裡用不上；繼承是最弱的，不是優先的；結果也和順序無關，把 `p` 規則搬到前面還是 `#333333`。',
    },
    {
      id: 'web05-q7', prompt: '在 `<article>` 上設定下列四個 CSS 屬性。哪一個不會被裡面的段落繼承？',
      options: ['`border`', '`color`', '`font-family`', '`line-height`'],
      answer: 0,
      explanation: '`border` 是和盒子有關的屬性，不會繼承：`article` 畫了邊框，裡面的段落不會各自多一圈。`color`、`font-family` 與 `line-height` 都和文字有關，會由父元素傳給裡面的元素，所以在外層設定一次，段落就跟著改變。',
    },
    {
      id: 'web05-q8', prompt: '`.current { color: #b03a2e; }` 輸給了 `.menu a { color: #1a5276; }`，選單裡 `class="current"` 的連結沒有變色。下列哪一個修法最好？',
      options: ['在 `.current` 的宣告後面加上 `!important`', '把 `.current` 規則搬到檔案的最後面', '把選擇器改成 `.menu .current`', '替那個連結加上 `id`，改用 id 選擇器'],
      answer: 2,
      explanation: '`.menu a` 是 0-1-1，`.current` 是 0-1-0；改成 `.menu .current`（0-2-0）就以最小的幅度勝出，之後要再調整也容易。搬到最後面沒有用：特異性不同時輪不到順序。`!important` 和 id 選擇器都能讓它變色，但前者之後只能用另一個 `!important` 蓋過，後者把特異性一口氣拉到 1-0-0，以後替它寫例外的規則都得跟著用 id。',
    },
  ],
  webCode: {
    examples: [rule, selectors, combinators, cascade, inheritance],
    exercises: [exClass, exCurrent, exFloors, exRefactor],
  },
};
