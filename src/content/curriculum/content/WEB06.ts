import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB06 the box model and normal flow (WEB-2). A web-code lesson of HTML and CSS only: every example is a small page of
 * the made-up 小島圖書館 with boxes of explicit pixel sizes, so the facts under it (total widths, where the next box
 * starts, a collapsed margin) are measured in Chromium. The exercises fix the HTML; the learner edits style.css and is
 * checked on box measurements and computed styles. Flexbox, grid, floats and positioning are not taught here.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const boxParts: WebExample = {
  id: 'web06-box-parts', title: '一張卡片的四層：內容、內距、邊框、外距',
  description: '小島圖書館的開放時間卡片：`width: 200px`、`height: 80px`，四邊各有 20px 的內距、5px 的邊框與 15px 的外距。下面黃色的元素緊接在卡片之後。',
  files: {
    html: String.raw`<div class="card">開放時間：週二至週日 9:00–17:00，週一休館。</div>
<div class="next">下一個元素從這裡開始。</div>`,
    css: String.raw`body { margin: 0; }
.card {
  width: 200px;
  height: 80px;
  padding: 20px;
  border: 5px solid #1565c0;
  margin: 15px;
  background-color: #bbdefb;
}
.next { background-color: #ffe082; }`,
  },
  observe: [
    { check: 'style', selector: '.card', property: 'width', value: '200px', label: '`width` 計算後是 200px：它量的是內容，不是整個盒子' },
    { check: 'box', selector: '.card', measure: 'width', value: 250, label: '卡片到邊框為止寬 250px：200 + 20 × 2 + 5 × 2' },
    { check: 'box', selector: '.card', measure: 'height', value: 130, label: '卡片到邊框為止高 130px：80 + 20 × 2 + 5 × 2' },
    { check: 'box', selector: '.card', measure: 'left', value: 15, label: '卡片的左緣距離頁面左邊 15px：那一段空白是左外距' },
    { check: 'box', selector: '.next', measure: 'top', value: 160, label: '下一個元素的上緣在 160px：15（上外距）+ 130（卡片）+ 15（下外距）' },
  ],
};

const boxSizing: WebExample = {
  id: 'web06-box-sizing', title: '同樣的 width，兩種算法',
  description: '兩張卡片共用 `.card` 的 `width: 200px`、`padding: 20px` 與 5px 的邊框；第二張只多了一行 `box-sizing: border-box`。',
  files: {
    html: String.raw`<div class="card" id="first">第一張：預設的 content-box</div>
<div class="card" id="second">第二張：border-box</div>`,
    css: String.raw`body { margin: 0; }
.card {
  width: 200px;
  padding: 20px;
  border: 5px solid #1565c0;
  margin: 10px;
  background-color: #bbdefb;
}
#second { box-sizing: border-box; }`,
  },
  observe: [
    { check: 'style', selector: '#first', property: 'box-sizing', value: 'content-box', label: '第一張沒有寫 `box-sizing`，計算後是預設的 `content-box`' },
    { check: 'box', selector: '#first', measure: 'width', value: 250, label: '第一張到邊框為止寬 250px：內距與邊框加在 200px 的外面' },
    { check: 'box', selector: '#second', measure: 'width', value: 200, label: '第二張到邊框為止寬 200px：`width` 寫多少，盒子就是多少' },
    { check: 'style', selector: '#second', property: 'padding-left', value: '20px', label: '第二張的內距仍是 20px：變窄的是內容（剩 150px），不是內距' },
  ],
};

const flow: WebExample = {
  id: 'web06-flow', title: '區塊往下疊，行內排在同一行',
  description: '寬 280px 的 `.page` 裡有一個標題與兩個段落（區塊），段落裡各有一個黃色的 `span.tag`（行內）。兩個標籤都寫了 `width: 120px; height: 40px;`，第二個多了 `display: inline-block`。',
  files: {
    html: String.raw`<div class="page">
  <h2 class="title">本週公告</h2>
  <p class="note">週六 <span class="tag">提早閉館</span>，15:00 以後不開放借還書。</p>
  <p class="note">兒童區 <span class="tag sized">整修中</span> 到週五。</p>
</div>`,
    css: String.raw`body { margin: 0; }
.page { width: 280px; }
.title { height: 40px; margin: 0; background-color: #bbdefb; }
.note { margin: 0; border: 2px solid #1565c0; }
.tag { width: 120px; height: 40px; background-color: #ffe082; }
.sized { display: inline-block; }`,
  },
  observe: [
    { check: 'box', selector: '.title', measure: 'width', value: 280, label: '標題沒有設定 `width`：區塊盒子填滿父元素的 280px' },
    { check: 'box', selector: '.note', measure: 'top', value: 40, from: '.title', label: '第一個段落從標題的正下方開始：上緣在標題上緣往下 40px（標題的高度）' },
    { check: 'style', selector: '.tag', property: 'display', value: 'inline', label: '第一個標籤的 `display` 計算後是預設的 `inline`：`width` 與 `height` 對它不適用' },
    { check: 'box', selector: '.sized', measure: 'width', value: 120, label: '第二個標籤是 `inline-block`：寬 120px 生效了' },
    { check: 'box', selector: '.sized', measure: 'height', value: 40, label: '第二個標籤高 40px：`height` 也生效了' },
  ],
};

const collapse: WebExample = {
  id: 'web06-collapse', title: '上下相鄰的外距只算較大的一個',
  description: '三則高 50px 的公告往下疊。公告一的下外距是 30px，公告二的上、下外距各 20px，公告三的上外距是 20px。',
  files: {
    html: String.raw`<div class="notice" id="first">公告一：下外距 30px</div>
<div class="notice" id="second">公告二：上外距 20px、下外距 20px</div>
<div class="notice" id="third">公告三：上外距 20px</div>`,
    css: String.raw`body { margin: 0; }
.notice { height: 50px; background-color: #bbdefb; }
#first { margin-bottom: 30px; }
#second { margin-top: 20px; margin-bottom: 20px; }
#third { margin-top: 20px; }`,
  },
  observe: [
    { check: 'style', selector: '#first', property: 'margin-bottom', value: '30px', label: '公告一的下外距計算後是 30px' },
    { check: 'style', selector: '#second', property: 'margin-top', value: '20px', label: '公告二的上外距計算後仍是 20px：兩個外距都在，只是疊在一起' },
    { check: 'box', selector: '#second', measure: 'top', value: 80, from: '#first', label: '公告二的上緣在公告一上緣往下 80px：高 50px 加上 30px 的空白，不是 50 + 30 + 20 = 100px' },
    { check: 'box', selector: '#third', measure: 'top', value: 70, from: '#second', label: '公告三的上緣在公告二上緣往下 70px：兩個 20px 合併成一個 20px，不是 40px' },
  ],
};

const parentMargin: WebExample = {
  id: 'web06-parent-margin', title: '跑到父元素外面的外距，以及用 auto 置中',
  description: '兩個寬 260px 的淡藍色書架 `.shelf`，裡面各有一張寬 160px、`margin-top: 30px`、左右外距為 `auto` 的黃色標籤。兩個書架只差在 `#padded` 多了 `padding-top: 10px`。',
  files: {
    html: String.raw`<div class="shelf" id="plain">
  <p class="label">外層沒有內距</p>
</div>
<div class="shelf" id="padded">
  <p class="label">外層有上內距</p>
</div>`,
    css: String.raw`body { margin: 0; }
.shelf { width: 260px; margin-bottom: 20px; background-color: #bbdefb; }
#padded { padding-top: 10px; }
.label {
  width: 160px;
  height: 40px;
  margin-top: 30px;
  margin-bottom: 0;
  margin-left: auto;
  margin-right: auto;
  background-color: #ffe082;
}`,
  },
  observe: [
    { check: 'box', selector: '#plain .label', measure: 'top', value: 0, from: '#plain', label: '第一個書架：標籤的上緣貼著書架的上緣（相距 0px），30px 的外距不在書架裡面' },
    { check: 'box', selector: '#plain', measure: 'top', value: 30, label: '那 30px 跑到書架外面：書架自己的上緣在距離頁面頂端 30px 的地方' },
    { check: 'box', selector: '#padded .label', measure: 'top', value: 40, from: '#padded', label: '第二個書架有上內距，外距不合併：標籤的上緣在書架上緣往下 10 + 30 = 40px' },
    { check: 'box', selector: '#plain .label', measure: 'left', value: 50, from: '#plain', label: '左右外距都是 `auto`：剩下的 260 − 160 = 100px 平分，標籤的左緣距離書架左緣 50px' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const exContentWidth: WebExercise = {
  id: 'web06-ex-content-width', title: '把卡片算成剛好 300px',
  statement: 'index.html 不能改。圖書館首頁的欄位只有 300px 寬，`#card` 連同內距與邊框卻超出去了。請只修改 `width` 的數字，讓 `#card` 到邊框為止的總寬度剛好是 300px。四邊的內距要維持 20px、邊框要維持 5px，這一題先不使用 `box-sizing`。',
  hints: [
    '先算出現在的總寬度：把 `width`、左右兩邊的內距、左右兩邊的邊框加起來。',
    '總寬度 = `width` + 20 × 2 + 5 × 2。要讓總寬度是 300，`width` 要比 300 少多少？',
    '內距與邊框一共佔 40 + 10 = 50px，所以把 `width` 改成 `250px`。',
  ],
  explanation: '預設的 `box-sizing` 是 `content-box`，`width` 只是內容的寬度：總寬度 = 250 + 20 + 20 + 5 + 5 = 300px。起始的 `width: 300px` 算出來是 350px，比欄位多了 50px。內距與邊框都是左右各一份，兩邊都要算進去。',
  fixed: { html: String.raw`<div id="card">開放時間：週二至週日 9:00–17:00</div>` },
  starter: { css: String.raw`#card {
  width: 300px;
  padding: 20px;
  border: 5px solid #1565c0;
  background-color: #bbdefb;
}` },
  solution: { css: String.raw`#card {
  width: 250px;
  padding: 20px;
  border: 5px solid #1565c0;
  background-color: #bbdefb;
}` },
  steps: [
    { check: 'box', selector: '#card', measure: 'width', value: 300, label: '`#card` 到邊框為止的總寬度是 300px' },
    { check: 'style', selector: '#card', property: 'padding-left', value: '20px', label: '`#card` 的左內距維持 20px' },
    { check: 'style', selector: '#card', property: 'padding-right', value: '20px', label: '`#card` 的右內距維持 20px' },
    { check: 'style', selector: '#card', property: 'border-left-width', value: '5px', label: '`#card` 的邊框維持 5px 粗' },
    { check: 'style', selector: '#card', property: 'box-sizing', value: 'content-box', label: '這一題不使用 `box-sizing`：`#card` 維持預設的 `content-box`' },
  ],
  mistakes: [
    { files: { css: String.raw`#card {
  width: 275px;
  padding: 20px;
  border: 5px solid #1565c0;
  background-color: #bbdefb;
}` }, why: '只扣了一邊的內距與邊框（300 − 20 − 5 = 275）。內距和邊框左右各有一份，總寬度是 275 + 40 + 10 = 325px，還是超出 25px。' },
    { files: { css: String.raw`#card {
  width: 290px;
  padding: 0;
  border: 5px solid #1565c0;
  background-color: #bbdefb;
}` }, why: '把內距拿掉來湊出 300px。總寬度對了，但文字緊貼著邊框；題目要求內距維持 20px，該調整的是 `width`。' },
  ],
};

const BORDER_BOX_HTML = String.raw`<div class="card" id="hours">開放時間：週二至週日 9:00–17:00</div>
<div class="card" id="notice">週六提早在 15:00 閉館</div>`;

const exBorderBox: WebExercise = {
  id: 'web06-ex-border-box', title: '內距不同的兩張卡片，一樣寬',
  statement: 'index.html 不能改。兩張卡片的內距不同（`#hours` 四邊 20px；`#notice` 上下 10px、左右 40px），所以雖然都套用了 `width: 300px`，實際的總寬度卻是 350px 與 390px。請在 `.card` 的規則裡加一條宣告，讓兩張卡片到邊框為止的總寬度都剛好是 300px。`width`、`padding` 與 `border` 的數字都不要改。',
  hints: [
    '有一個 CSS 屬性可以改變 `width` 指的是盒子的哪一層。',
    '讓 `width` 算到邊框為止的值是 `border-box`；寫在兩張卡片共用的規則裡，兩張才都會套用。',
    '在 `.card` 的大括號裡加一行 `box-sizing: border-box;`。',
  ],
  explanation: '`box-sizing: border-box` 讓 `width: 300px` 代表到邊框為止的整個盒子，內距與邊框往裡面扣：`#hours` 的內容變成 300 − 40 − 10 = 250px，`#notice` 的內容變成 300 − 80 − 10 = 210px，兩張的總寬度都是 300px。之後內距再怎麼改，總寬度都不必重算，這就是多數專案全域套用 `border-box` 的原因。',
  fixed: { html: BORDER_BOX_HTML },
  starter: { css: String.raw`.card {
  width: 300px;
  border: 5px solid #1565c0;
  margin-bottom: 10px;
  background-color: #bbdefb;
}
#hours { padding: 20px; }
#notice { padding: 10px 40px; }` },
  solution: { css: String.raw`.card {
  box-sizing: border-box;
  width: 300px;
  border: 5px solid #1565c0;
  margin-bottom: 10px;
  background-color: #bbdefb;
}
#hours { padding: 20px; }
#notice { padding: 10px 40px; }` },
  steps: [
    { check: 'style', selector: '#hours', property: 'box-sizing', value: 'border-box', label: '`#hours` 的 `box-sizing` 是 `border-box`' },
    { check: 'style', selector: '#notice', property: 'box-sizing', value: 'border-box', label: '`#notice` 的 `box-sizing` 是 `border-box`' },
    { check: 'box', selector: '#hours', measure: 'width', value: 300, label: '`#hours` 到邊框為止的總寬度是 300px' },
    { check: 'box', selector: '#notice', measure: 'width', value: 300, label: '`#notice` 到邊框為止的總寬度是 300px' },
    { check: 'style', selector: '#hours', property: 'padding-left', value: '20px', label: '`#hours` 的左內距維持 20px' },
    { check: 'style', selector: '#notice', property: 'padding-left', value: '40px', label: '`#notice` 的左內距維持 40px' },
  ],
  mistakes: [
    { files: { css: String.raw`.card {
  width: 250px;
  border: 5px solid #1565c0;
  margin-bottom: 10px;
  background-color: #bbdefb;
}
#hours { padding: 20px; }
#notice { padding: 10px 40px; }` }, why: '用上一題的方法把 `width` 改成 250px：`#hours` 剛好 300px，但 `#notice` 的內距不同，總寬度是 250 + 80 + 10 = 340px。每張卡片都得各算一次，這正是 `border-box` 要省掉的麻煩。' },
    { files: { css: String.raw`.card {
  width: 300px;
  border: 5px solid #1565c0;
  margin-bottom: 10px;
  background-color: #bbdefb;
}
#hours { padding: 20px; box-sizing: border-box; }
#notice { padding: 10px 40px; }` }, why: '只把 `box-sizing: border-box` 寫在 `#hours` 的規則裡，`#notice` 仍是預設的 `content-box`，總寬度還是 390px。`box-sizing` 不會自動套用到其他元素，要寫在兩張卡片共用的 `.card` 規則裡。' },
    { files: { css: String.raw`.card {
  box-sizing: border;
  width: 300px;
  border: 5px solid #1565c0;
  margin-bottom: 10px;
  background-color: #bbdefb;
}
#hours { padding: 20px; }
#notice { padding: 10px 40px; }` }, why: '值寫成了 `border`。`box-sizing` 只認得 `content-box` 與 `border-box`，瀏覽器會略過這條不認得的宣告，頁面上沒有任何錯誤訊息，卡片維持原來的寬度。' },
  ],
};

const exInlineBlock: WebExercise = {
  id: 'web06-ex-inline-block-nav', title: '讓導覽連結有固定的大小',
  statement: 'index.html 不能改。style.css 已經替 `#menu` 裡的三個連結寫了 `width: 90px` 與 `height: 36px`，但預覽裡淡藍色的底只包住文字：連結是行內元素，寬高對它不適用。請修改 style.css，讓三個連結都成為寬 90px、高 36px 的盒子，而且仍然並排在同一行（三個連結的上緣一樣高）。',
  hints: [
    '寬高沒有生效，問題不在數字，而在連結產生的是哪一種盒子。',
    '`display` 的哪一個值「排在行內，但寬高有效」？注意 `block` 會讓每個連結獨佔一列。',
    '在 `#menu a` 的規則裡加上 `display: inline-block;`。',
  ],
  explanation: '`<a>` 預設是行內盒子，`width` 與 `height` 對它不適用，所以原本的兩條宣告沒有效果。`display: inline-block` 讓連結仍然像文字一樣排在行內（三個並排），同時成為可以設定寬高的盒子。`display` 只改變排版方式，這三個元素仍然是連結。',
  fixed: { html: String.raw`<nav id="menu">
  <a id="to-hours" href="#hours">開放時間</a>
  <a id="to-news" href="#news">新書通報</a>
  <a id="to-contact" href="#contact">聯絡我們</a>
</nav>` },
  starter: { css: String.raw`#menu a {
  width: 90px;
  height: 36px;
  background-color: #bbdefb;
}` },
  solution: { css: String.raw`#menu a {
  display: inline-block;
  width: 90px;
  height: 36px;
  background-color: #bbdefb;
}` },
  steps: [
    { check: 'box', selector: '#to-hours', measure: 'width', value: 90, label: '「開放時間」連結寬 90px' },
    { check: 'box', selector: '#to-hours', measure: 'height', value: 36, label: '「開放時間」連結高 36px' },
    { check: 'box', selector: '#to-contact', measure: 'width', value: 90, label: '「聯絡我們」連結也寬 90px' },
    { check: 'box', selector: '#to-news', measure: 'top', value: 0, from: '#to-hours', label: '「新書通報」和「開放時間」排在同一行：上緣一樣高' },
    { check: 'box', selector: '#to-contact', measure: 'top', value: 0, from: '#to-hours', label: '「聯絡我們」也在同一行' },
  ],
  mistakes: [
    { files: { css: String.raw`#menu a {
  display: block;
  width: 90px;
  height: 36px;
  background-color: #bbdefb;
}` }, why: '`display: block` 讓寬高生效了，但區塊盒子各佔一列，三個連結變成直的一排。要並排又要有寬高，用的是 `inline-block`。' },
    { files: { css: String.raw`#menu {
  display: inline-block;
}
#menu a {
  width: 90px;
  height: 36px;
  background-color: #bbdefb;
}` }, why: '把 `display: inline-block` 寫在外層的 `#menu` 上。`display` 不會繼承：改變的是 `nav` 自己的盒子，裡面的連結仍然是行內盒子，寬高照樣不適用。' },
  ],
};

const BOARD_HTML = String.raw`<main id="board">
  <div class="notice" id="n1">週六提早在 15:00 閉館</div>
  <div class="notice" id="n2">兒童區整修中</div>
  <div class="notice" id="n3">新書區在一樓</div>
</main>`;

const exBoard: WebExercise = {
  id: 'web06-ex-notice-board', title: '排好公告欄：置中，間距 24px',
  statement: 'index.html 不能改。公告欄 `#board` 寬 300px，裡面有三則高 60px 的公告。請完成兩件事：（1）讓 `#board` 在頁面上水平置中，用左右外距 `auto` 來做，不要寫死數字；（2）讓相鄰兩則公告之間的空白剛好是 24px。起始的樣式替每則公告上下各寫了 12px 的外距，想湊出 24px，實際上卻只有 12px。`body { margin: 0; }`、`#board` 的寬度與公告的高度都要保留。檢查用的頁面寬 600px，所以置中之後 `#board` 的左緣會在 150px 的位置。',
  hints: [
    '兩則公告之間，上面那則的下外距和下面那則的上外距會合併，只算較大的一個，不會相加。',
    '要有 24px 的間距，相鄰的兩個外距裡較大的那個必須是 24px。置中則是替有寬度的區塊設定左右外距。',
    '`.notice` 改成 `margin-top: 0; margin-bottom: 24px;`；`#board` 加上 `margin-left: auto; margin-right: auto;`（或簡寫 `margin: 0 auto;`）。',
  ],
  explanation: '置中：`#board` 有明確的寬度 300px，左右外距設成 `auto` 之後，瀏覽器把剩下的 600 − 300 = 300px 平分，左右各 150px；頁面或公告欄的寬度改變時也會重新平分。間距：相鄰公告的下外距與上外距會合併，只取較大的一個，所以把 `margin-bottom` 設為 24px、`margin-top` 設為 0（兩者都寫 24px 也可以），相鄰兩則之間就是 24px。只用一個方向的外距控制間距，最不容易算錯。',
  fixed: { html: BOARD_HTML },
  starter: { css: String.raw`body { margin: 0; }
#board {
  width: 300px;
}
.notice {
  height: 60px;
  margin-top: 12px;
  margin-bottom: 12px;
  background-color: #bbdefb;
}` },
  solution: { css: String.raw`body { margin: 0; }
#board {
  width: 300px;
  margin: 0 auto;
}
.notice {
  height: 60px;
  margin-top: 0;
  margin-bottom: 24px;
  background-color: #bbdefb;
}` },
  steps: [
    { check: 'box', selector: '#board', measure: 'width', value: 300, label: '`#board` 的寬度維持 300px' },
    { check: 'box', selector: '#board', measure: 'left', value: 150, label: '`#board` 水平置中：左緣距離頁面左邊 150px，也就是 (600 − 300) ÷ 2' },
    { check: 'box', selector: '#n1', measure: 'height', value: 60, label: '公告的高度維持 60px' },
    { check: 'box', selector: '#n2', measure: 'top', value: 84, from: '#n1', label: '第二則公告的上緣在第一則上緣往下 84px：高 60px 加上 24px 的空白' },
    { check: 'box', selector: '#n3', measure: 'top', value: 84, from: '#n2', label: '第三則公告的上緣在第二則上緣往下 84px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#board {
  width: 300px;
  margin: 0 auto;
}
.notice {
  height: 60px;
  margin-top: 12px;
  margin-bottom: 12px;
  background-color: #bbdefb;
}` }, why: '只做了置中，公告的外距沒有動。上下各 12px 的外距在相鄰的兩則之間會合併成一個 12px，不會相加成 24px。' },
    { files: { css: String.raw`body { margin: 0; }
#board {
  width: 300px;
  text-align: center;
}
.notice {
  height: 60px;
  margin-top: 0;
  margin-bottom: 24px;
  background-color: #bbdefb;
}` }, why: '`text-align: center` 置中的是盒子裡的文字，`#board` 這個盒子仍然靠在頁面左邊。要移動盒子本身，用的是左右外距 `auto`。' },
    { files: { css: String.raw`body { margin: 0; }
#board {
  width: 300px;
  margin: auto 0;
}
.notice {
  height: 60px;
  margin-top: 0;
  margin-bottom: 24px;
  background-color: #bbdefb;
}` }, why: '簡寫兩個值的順序是「上下、左右」：`margin: auto 0` 是上下 `auto`、左右 0，盒子不會水平置中（一般排版流裡，上下的 `auto` 等於 0）。要寫成 `margin: 0 auto`。' },
    { files: { css: String.raw`body { margin: 0; }
#board {
  width: 300px;
  margin-left: 150px;
}
.notice {
  height: 60px;
  margin-top: 0;
  margin-bottom: 24px;
  background-color: #bbdefb;
}` }, why: '把置中寫死成 `margin-left: 150px`，只有在頁面剛好 600px 寬、公告欄剛好 300px 寬時才對，寬度一變就偏掉（所以另一份寬度不同的檢查不會通過）。`auto` 讓瀏覽器依當下的寬度平分。' },
  ],
  variants: [{
    title: '公告欄換成 200px 寬，仍然要置中，間距仍是 24px',
    fixed: { html: BOARD_HTML.replace('<main id="board">', '<main id="board" style="width: 200px;">') },
    steps: [
      { check: 'box', selector: '#board', measure: 'left', value: 200, label: '寬 200px 的公告欄置中後，左緣在 200px' },
      { check: 'box', selector: '#n2', measure: 'top', value: 84, from: '#n1', label: '相鄰公告的間距仍是 24px' },
    ],
  }],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const WEB06: LessonContent = {
  lessonId: 'WEB06',
  motivation: '寫了 `width: 300px` 的卡片，量起來卻是 350px；兩個段落各留 20px 的外距，中間只隔了 20px 而不是 40px。這一課把每個元素當成一個盒子來看：盒模型的四層怎麼相加、`box-sizing` 怎麼改變算法、區塊與行內的盒子各自怎麼排、外距什麼時候會合併。學完之後，你可以在動手寫之前，先算出一個元素在頁面上佔多大的空間。',
  sections: [
    {
      id: 'web06-box-section', title: '每個元素都是一個盒子',
      blocks: [
        { type: 'p', text: '瀏覽器排版時，把頁面上的每一個元素都當成一個長方形的盒子；盒子由哪幾層組成、大小怎麼算，這套規則叫做盒模型（box model）。一個盒子由內到外有四層：' },
        { type: 'list', items: [
          '內容（content）：文字或圖片所在的區域。`width` 與 `height` 預設設定的就是這一層的大小。',
          '內距（padding）：內容與邊框之間的留白，元素的背景色會鋪到這一層。',
          '邊框（border）：包住內距的框線，有自己的粗細、樣式與顏色。',
          '外距（margin）：邊框以外的留白，用來和其他元素保持距離。外距永遠是透明的，不會顯示元素的背景色。',
        ] },
        { type: 'p', text: '下面是小島圖書館的開放時間卡片。規則裡的 `padding: 20px` 與 `margin: 15px` 只寫一個值，代表上、右、下、左四邊都一樣；`border: 5px solid #1565c0` 依序是邊框的粗細、樣式（`solid` 是實線）與顏色。' },
        { type: 'example', id: 'web06-box-parts' },
        { type: 'p', text: '先看預覽：淡藍色的底鋪滿內容與內距，外面是深藍色的邊框，邊框再往外那一圈 15px 的空白就是外距。CSS 寫的是 `width: 200px`，「這個頁面在瀏覽器裡的事實」卻說卡片寬 250px：因為 `width` 只管內容那一層，左右的內距與邊框要另外加上去。高度也是同樣的算法：' },
        { type: 'table', head: ['方向', '內容', '內距（兩邊）', '邊框（兩邊）', '到邊框為止的盒子', '連外距一起佔用的空間'], rows: [
          ['寬', '`width: 200px`', '20 + 20 = 40px', '5 + 5 = 10px', '200 + 40 + 10 = 250px', '250 + 15 + 15 = 280px'],
          ['高', '`height: 80px`', '20 + 20 = 40px', '5 + 5 = 10px', '80 + 40 + 10 = 130px', '130 + 15 + 15 = 160px'],
        ] },
        { type: 'p', text: '外距不算在盒子自己的大小裡，但它會把鄰居推開：黃色的下一個元素，上緣在距離頁面頂端 160px 的地方，也就是 15（上外距）+ 130（卡片）+ 15（下外距）。範例第一行的 `body { margin: 0; }` 是為了去掉瀏覽器預設替 `body` 加上的 8px 外距，這樣量位置時才會從 0 算起；這一課的範例都會先寫這一行。' },
        { type: 'callout', tone: 'warning', title: 'width 不是盒子的總寬度', text: '初學者最常見的誤會，是把 `width` 當成整個盒子的寬度。想讓卡片剛好放進 300px 寬的欄位，寫了 `width: 300px`，再加上 `padding: 20px` 與 5px 的邊框，卡片實際上是 300 + 40 + 10 = 350px，比欄位多出 50px。計算總寬度時，內距與邊框都是左右各一份，兩邊都要加。' },
        { type: 'callout', tone: 'tip', title: '動手試：改一個數字，先猜再看', text: '按「動手改這個範例」，把 `padding: 20px` 改成 `padding: 40px`。先心算：卡片會變成 200 + 80 + 10 = 290px 寬，內容的 200px 沒有變，是淡藍色的留白變厚了。再把 `margin: 15px` 改成 `margin: 0`：卡片貼到頁面的左上角，黃色的元素也緊貼著卡片的下緣。' },
      ],
    },
    {
      id: 'web06-box-sizing-section', title: 'box-sizing：讓 width 代表整個盒子',
      blocks: [
        { type: 'p', text: '每次都要拿設計稿上的寬度去扣掉內距與邊框，很容易算錯；而且只要改了內距，`width` 又得重算一次。CSS 屬性 `box-sizing` 決定 `width` 與 `height` 指的是盒子的哪一層：預設值 `content-box` 指的是內容；改成 `border-box`，指的就是到邊框為止的整個盒子，內距與邊框改成往裡面扣。' },
        { type: 'example', id: 'web06-box-sizing' },
        { type: 'p', text: '兩張卡片套用同一條 `.card` 規則，`width`、`padding`、`border` 完全相同，只差 `#second` 多了一行 `box-sizing: border-box`。第一張照上一節的算法是 200 + 40 + 10 = 250px。第二張的整個盒子就是 200px，瀏覽器自己把內容縮成 200 − 40 − 10 = 150px，所以裡面的文字比較早換行。外距不受影響：兩種算法都不會把外距算進 `width`。' },
        { type: 'table', head: ['box-sizing 的值', 'width: 200px 指的是', '內容的寬', '到邊框為止的總寬'], rows: [
          ['`content-box`（預設）', '只有內容', '200px', '200 + 40 + 10 = 250px'],
          ['`border-box`', '內容＋內距＋邊框', '200 − 40 − 10 = 150px', '200px'],
        ] },
        { type: 'p', text: '`border-box` 讓「寫多少，盒子就是多少」，所以多數專案會在樣式表的最前面放這一條規則，一次套用到所有元素：`*, *::before, *::after { box-sizing: border-box; }`。選擇器 `*` 會選到每一個元素；`::before` 與 `::after` 是由 CSS 在元素裡產生的偽元素（之後的課才會用到），`*` 選不到它們，所以一起列出來。這一課的範例為了讓你看清楚兩種算法的差別，只在需要的地方才寫 `box-sizing`；沒寫的就是預設的 `content-box`。' },
        { type: 'callout', tone: 'tip', title: '動手試：只改內距', text: '把範例裡 `.card` 的 `padding: 20px` 改成 `padding: 40px` 再執行。第一張變成 200 + 80 + 10 = 290px 寬；第二張仍然是 200px，只是內容剩下 200 − 80 − 10 = 110px。用 `border-box` 時，調整內距不會改變盒子佔的寬度。' },
        { type: 'callout', tone: 'note', title: '讀別人的 CSS，先找這一行', text: '接手一份樣式表時，先確認裡面有沒有全域的 `box-sizing: border-box`。同樣是 `width: 200px; padding: 20px;`，有這一行時盒子寬 200px，沒有時寬 240px（還沒算邊框）。把一段 CSS 從某個專案複製到另一個專案之後「寬度不對」，原因常常就是兩邊的 `box-sizing` 不同。' },
      ],
    },
    {
      id: 'web06-flow-section', title: '一般排版流：區塊與行內',
      blocks: [
        { type: 'p', text: '知道一個盒子多大之後，下一個問題是它被放在哪裡。沒有寫任何排版用的 CSS 時，瀏覽器照元素在 HTML 裡的順序，由上到下、由左到右把盒子排出來，這叫一般排版流（normal flow）。盒子怎麼排，要看它是區塊（block）還是行內（inline）。分清楚區塊與行內，是預測版面的第一步：' },
        { type: 'table', head: ['比較', '區塊盒子', '行內盒子'], rows: [
          ['預設是這一種的元素', '`div`、`p`、`h1`–`h6`、`ul`、`header`、`main`、`section`', '`span`、`a`、`strong`、`em`'],
          ['怎麼排', '自己佔一整列，一個接一個往下疊', '和文字一樣排在同一行，排不下就換到下一行'],
          ['沒有設定時的寬度', '填滿父元素可用的寬度', '剛好包住自己的內容'],
          ['`width` 與 `height`', '有效', '不適用'],
          ['外距', '四邊都有效', '左右有效，上下不適用'],
        ] },
        { type: 'example', id: 'web06-flow' },
        { type: 'p', text: '在預覽裡看三件事。第一，標題「本週公告」只有四個字，淡藍色的底卻有 280px 寬：區塊沒有設定 `width` 時，會填滿父元素 `.page` 的寬度。第二，兩個段落一個接一個往下排，第一個段落就從標題的正下方開始。第三，第一個黃色標籤是行內的 `span`：它排在句子中間，CSS 雖然寫了 `width: 120px; height: 40px;`，黃色的底仍然只包住「提早閉館」四個字。瀏覽器沒有顯示任何錯誤，這兩條宣告只是不適用於行內盒子。第二個標籤多了一行 `display: inline-block`，同樣的寬高就生效了。' },
        { type: 'p', text: 'CSS 屬性 `display` 決定一個元素產生哪一種盒子。每個元素都有瀏覽器給的預設值（`div` 是 `block`，`span` 是 `inline`），你可以用 `display` 改掉它：' },
        { type: 'table', head: ['display 的值', '排在哪裡', '寬高與上下外距', '常見用途'], rows: [
          ['`block`', '自己佔一整列', '有效', '讓連結或 `span` 變成獨佔一列的區塊'],
          ['`inline`', '排在行內', '不適用', '行內元素的預設值，很少需要自己寫'],
          ['`inline-block`', '排在行內，像一個比較大的字', '有效', '要並排、又要有固定大小的導覽連結、標籤'],
          ['`none`', '不產生盒子', '不佔任何空間', '把元素從畫面上拿掉'],
        ] },
        { type: 'p', text: '`display: none` 的元素不產生盒子：畫面上看不到，也不佔位置，螢幕閱讀器同樣讀不到它，但它仍然留在 DOM 樹裡。另外要記得，`display` 只改變排版方式，不改變元素的意義：把 `<a>` 設成 `display: block`，它仍然是連結；把 `<div>` 設成 `display: inline`，它也不會變成 `<span>`。圖片 `<img>` 與表單的 `<input>`、`<button>` 比較特別：它們排在行內，卻可以直接設定寬高。' },
        { type: 'callout', tone: 'warning', title: '對行內元素設定寬高沒有效果', text: '替 `<a>` 或 `<span>` 寫了 `width`、`height` 或 `margin-top` 卻「沒反應」，是初學者很常遇到的狀況。瀏覽器不會提示任何錯誤，因為這些宣告本身是合法的，只是不適用於行內盒子。先把元素改成 `display: inline-block`（要並排）或 `display: block`（要獨佔一列），寬高才會生效。另外，行內盒子上下的內距與邊框雖然畫得出來，卻不會把上下兩行推開，可能蓋到鄰近的文字。' },
      ],
    },
    {
      id: 'web06-collapse-section', title: '外距合併：上下相鄰的外距只算一個',
      blocks: [
        { type: 'p', text: '上下相疊的兩個區塊，上面那個有下外距、下面那個有上外距，直覺會以為兩者之間的空白是兩個數字相加。實際上，上下相鄰的兩個外距會疊在一起變成一個，大小取兩者之中較大的那個。這個規則叫做外距合併（margin collapsing）：' },
        { type: 'example', id: 'web06-collapse' },
        { type: 'p', text: '公告一的下外距是 30px，公告二的上外距是 20px，兩者之間的空白是 30px，不是 50px：較小的 20px 被較大的 30px 蓋過去了。公告二與公告三之間也一樣，20px 遇到 20px，合併成一個 20px，不是 40px。所以公告二的上緣在公告一上緣往下 80px 的地方：公告一高 50px，加上 30px 的空白。注意「事實」裡兩個外距計算後的值都沒有變，仍是 30px 與 20px；合併改變的是它們佔用的空間，不是屬性的值。' },
        { type: 'p', text: '這個規則對文章的排版很方便：每個段落上下都有外距時，段落與段落之間的距離不會變成兩倍，和第一段上方、最後一段下方的距離一樣。外距合併只在特定的條件下發生：' },
        { type: 'list', items: [
          '只發生在上下方向。左右的外距從不合併：`margin-right: 30px` 的盒子右邊緊接著 `margin-left: 20px` 的盒子，兩個外距各算各的，合計 50px。',
          '只發生在一般排版流裡的區塊之間。行內盒子與 `inline-block` 盒子的外距不合併；之後在響應式設計島學到的 flex 與 grid 排版裡，項目的外距也不合併。',
          '兩個外距必須直接相鄰。中間只要隔著內距、邊框或任何內容，就各算各的。',
        ] },
        { type: 'callout', tone: 'warning', title: '間距不是兩個外距相加', text: '想讓兩則公告相隔 24px，於是替每一則寫 `margin-top: 12px; margin-bottom: 12px;`，結果只隔了 12px：兩個 12px 合併成一個。要有 24px 的間距，相鄰的兩個外距裡較大的那個必須是 24px。比較不容易出錯的習慣是只用一個方向的外距來控制間距，例如每一則都只寫 `margin-bottom: 24px`。' },
        { type: 'callout', tone: 'tip', title: '動手試：改變誰比較大', text: '把範例裡 `#second` 的 `margin-top: 20px` 改成 `margin-top: 50px` 再執行：現在較大的是 50px，公告一與公告二之間的空白變成 50px。再改成 `margin-top: 10px`：空白回到 30px，因為較大的仍然是公告一的 30px，把 10px 再改小也不會有任何變化。' },
      ],
    },
    {
      id: 'web06-parent-section', title: '父子之間的外距，以及用 auto 置中',
      blocks: [
        { type: 'p', text: '外距合併還有一種更讓人困惑的情況，發生在父元素和它的第一個子元素之間。如果父元素的上緣和子元素的上外距之間沒有任何東西隔開（父元素沒有上內距，也沒有上邊框），兩者的上外距同樣會合併，看起來就像子元素的外距「跑到父元素外面」：' },
        { type: 'example', id: 'web06-parent-margin' },
        { type: 'p', text: '兩個淡藍色的書架裡各有一張黃色標籤，標籤都寫了 `margin-top: 30px`。第一個書架沒有內距也沒有邊框：標籤貼著書架的上緣，那 30px 的空白出現在書架的上方，把整個書架推到距離頁面頂端 30px 的地方。第二個書架只多了 `padding-top: 10px`：內距隔在中間，外距不再合併，30px 留在書架裡面，所以標籤的上緣在書架上緣往下 10 + 30 = 40px，淡藍色的底也跟著變高。' },
        { type: 'p', text: '所以當你想在容器「裡面」的上方留白，卻看到整個容器往下移、容器的背景色沒有變高，原因多半就是這個。解法通常是把留白改寫成父元素的 `padding-top`，而不是第一個子元素的 `margin-top`。下緣也有同樣的現象：父元素沒有設定高度、也沒有下內距與下邊框時，最後一個子元素的下外距同樣會跑到父元素外面。' },
        { type: 'p', text: '同一個範例還示範了左右外距的一個常見用途：置中。標籤寬 160px，書架寬 260px，剩下 100px。把標籤的左右外距都設成 `auto`，瀏覽器就把剩下的寬度平分給兩邊，各 50px，標籤便水平置中了。條件是這個區塊要有明確的 `width`：沒有設定寬度的區塊本來就填滿父元素，沒有剩下的空間可以分。`auto` 只能這樣處理左右方向；在一般排版流裡，上下外距寫 `auto` 等於 0，不會垂直置中。置中的是盒子本身，要讓盒子裡的文字置中則是另一個屬性 `text-align: center` 的工作。' },
        { type: 'callout', tone: 'tip', title: '動手試：換成邊框也擋得住', text: '把範例裡 `#padded` 的 `padding-top: 10px` 改成 `border-top: 1px solid #1565c0` 再執行。只有 1px 的邊框同樣把父子的外距隔開了：標籤留在書架裡面，上方有 30px 的淡藍色。再把這一行整個刪掉，第二個書架就和第一個一樣，外距又跑到外面去。' },
      ],
    },
    {
      id: 'web06-tools-section', title: '簡寫、內容溢出與檢查工具',
      blocks: [
        { type: 'p', text: '外距的四個方向各有自己的屬性：`margin-top`、`margin-right`、`margin-bottom`、`margin-left`，內距也一樣（`padding-top` 等）。四邊一起寫時用簡寫 `margin` 與 `padding`，可以給一到四個值。只寫一個值時四邊都相同；寫兩個以上時，順序從上邊開始、順時針繞一圈（上、右、下、左），沒寫到下邊就沿用上邊的值，沒寫到左邊就沿用右邊的值：' },
        { type: 'table', head: ['寫法', '上', '右', '下', '左'], rows: [
          ['`margin: 10px`', '10px', '10px', '10px', '10px'],
          ['`margin: 10px 20px`', '10px', '20px', '10px', '20px'],
          ['`margin: 10px 20px 30px`', '10px', '20px', '30px', '20px'],
          ['`margin: 10px 20px 30px 40px`', '10px', '20px', '30px', '40px'],
        ] },
        { type: 'p', text: '兩個值的寫法最常用，意思是「上下、左右」，所以上一節的置中通常寫成 `margin: 0 auto`：上下 0，左右 `auto`。數值是 0 的時候可以不寫單位，其他長度一定要有單位。這一課只用 px（像素）；其他的長度單位在響應式設計島介紹。' },
        { type: 'callout', tone: 'warning', title: '簡寫會一次設定四個邊', text: '`margin: 0 auto` 不只設定左右，也把上下外距設成 0。如果同一條規則裡前面已經寫了 `margin-top: 24px`，後面再寫 `margin: 0 auto`，上外距就被蓋回 0（後寫的宣告勝出）。只想改一邊時，用 `margin-top` 這樣的單邊屬性，或是把簡寫放在前面、單邊屬性放在後面。另一個常見的錯誤是把順序記反：`margin: auto 0` 是上下 `auto`、左右 0，盒子不會置中。' },
        { type: 'p', text: '盒子的大小固定之後，內容有可能比盒子大，例如在高 80px 的卡片裡放了十行字。CSS 屬性 `overflow` 決定這時候怎麼辦：預設值 `visible` 讓多出來的內容直接畫到盒子外面，盒子本身的大小不變，文字可能和後面的元素疊在一起；`hidden` 把超出的部分切掉；`auto` 則在放不下時讓盒子自己出現捲軸。內容長度不固定的盒子，最好不要寫死 `height`，讓高度隨內容長高。' },
        { type: 'p', text: '檢查盒子最快的方法是開發者工具。在 Elements 面板點選一個元素，再切到 Computed（計算樣式）分頁，最上面有一張盒模型圖：由內到外的四個框分別標出內容的寬 × 高，以及 padding、border、margin 四邊的數值（Firefox 把這張圖放在 Layout 分頁）。把滑鼠移到 Elements 面板裡的某個元素上，頁面上也會用不同的顏色標出它的這四層。量到的寬度和預期不同時，先看這張圖是哪一層的數字和你想的不一樣。' },
        { type: 'p', text: '把這一課串起來，預測一個元素佔多大的空間，可以照這個順序問：' },
        { type: 'list', ordered: true, items: [
          '它是區塊、行內，還是 `inline-block`？行內盒子的 `width`、`height` 與上下外距不適用，大小由內容決定。',
          '它的 `box-sizing` 是哪一個？`content-box`（預設）時，總寬度是 `width` 加上兩邊的內距與兩邊的邊框；`border-box` 時，總寬度就是 `width`。',
          '加上外距，才是它連同留白佔用的空間；左右的外距直接相加。',
          '上下相鄰的區塊外距會合併，取較大的一個；父元素沒有內距與邊框時，第一個子元素的上外距會跑到父元素外面。',
        ] },
        { type: 'callout', tone: 'tip', title: '動手試：先預測，再驗證', text: '回到第一節的開放時間卡片，把 `padding: 20px` 改成 `padding: 10px 30px`。先算再執行：上下內距 10px、左右內距 30px，所以卡片寬 200 + 60 + 10 = 270px，高 80 + 20 + 10 = 110px。算對了，就表示你已經能在瀏覽器畫出來之前，知道盒子有多大。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'web06-q1', prompt: '這條規則沒有設定 `box-sizing`。`.card` 到邊框為止的總寬度是多少？',
      code: { language: 'CSS', text: '.card {\n  width: 240px;\n  padding: 16px;\n  border: 4px solid navy;\n  margin: 10px;\n}' },
      options: ['240px', '260px', '280px', '300px'],
      answer: 2,
      explanation: '預設是 `content-box`，`width` 只算內容：總寬度 = 240 + 16 × 2 + 4 × 2 = 280px。240px 是把 `width` 當成整個盒子；260px 只加了一邊的內距與邊框（240 + 16 + 4）；300px 把左右各 10px 的外距也算進去了，外距在邊框之外，不屬於盒子自己的寬度。',
    },
    {
      id: 'web06-q2', prompt: '一個元素的樣式是 `box-sizing: border-box; width: 240px; padding: 16px; border: 4px solid navy;`。它的內容區有多寬？',
      options: ['200px', '208px', '240px', '280px'],
      answer: 0,
      explanation: '`border-box` 讓 `width: 240px` 代表到邊框為止的整個盒子，內距與邊框往裡面扣：240 − 16 × 2 − 4 × 2 = 200px。208px 只扣了內距，忘了邊框也算在 `width` 裡；240px 是 `content-box` 時內容的寬度；280px 是 `content-box` 時整個盒子的寬度。',
    },
    {
      id: 'web06-q3', prompt: '`.tag` 是一個沒有改過 `display` 的 `<span>`，位在一段文字中間。下面四條宣告裡，哪些會改變它的排版？',
      code: { language: 'CSS', text: '.tag {\n  width: 200px;\n  height: 50px;\n  margin-top: 20px;\n  margin-left: 20px;\n}' },
      options: ['四條都會', '只有 `width` 與 `height`', '只有 `margin-top`', '只有 `margin-left`'],
      answer: 3,
      explanation: '`<span>` 預設是行內盒子：`width`、`height` 與上下外距對它都不適用，大小由文字決定；左右外距則有效，所以只有 `margin-left: 20px` 會在它的左邊多出 20px 的空白。「四條都會」是區塊或 `inline-block` 盒子才有的結果：要讓寬高與上外距也生效，得先把它改成 `display: inline-block` 或 `display: block`。',
    },
    {
      id: 'web06-q4', prompt: '`.intro` 與 `.detail` 是上下相鄰的兩個 `<div>`，中間沒有其他東西。兩者之間的空白有多高？',
      code: { language: 'CSS', text: '.intro { margin-bottom: 40px; }\n.detail { margin-top: 25px; }' },
      options: ['65px', '40px', '25px', '15px'],
      answer: 1,
      explanation: '上下相鄰的區塊外距會合併，取較大的一個，所以是 40px。65px 是把兩個外距相加，那是左右方向才有的算法；25px 取了較小的一個；15px 是兩者相減，外距合併不是相減。',
    },
    {
      id: 'web06-q5', prompt: '導覽列的三個連結要並排在同一行，而且每一個都要是寬 100px、高 40px 的盒子。該替連結加上哪一條宣告？',
      options: ['`display: block`', '`display: inline-block`', '`display: inline`', '`box-sizing: border-box`'],
      answer: 1,
      explanation: '`inline-block` 的盒子排在行內（所以並排），同時可以設定寬高。`block` 的寬高也有效，但每個區塊獨佔一列，三個連結會直的排下來；`inline` 是連結原本的預設值，寬高不適用；`box-sizing` 只改變 `width` 的算法，行內盒子的 `width` 本來就不適用，改了也沒有用。',
    },
    {
      id: 'web06-q6', prompt: '淡黃色底的 `.panel` 沒有內距也沒有邊框，它的第一個子元素是寫了 `margin-top: 30px` 的標題。畫面上會看到什麼？',
      options: [
        '標題上方多出 30px 的淡黃色空白，`.panel` 的位置不變',
        '30px 的外距完全消失，標題與 `.panel` 都不移動',
        '`.panel` 往下移 30px，裡面的標題上方再多 30px 的淡黃色空白',
        '30px 的空白出現在 `.panel` 的上方，標題貼著 `.panel` 的上緣',
      ],
      answer: 3,
      explanation: '父元素沒有上內距與上邊框時，第一個子元素的上外距會和父元素的上外距合併，結果空白出現在 `.panel` 的外面（上方），標題貼著 `.panel` 的上緣。外距沒有消失，也不會算兩次。「標題上方多出淡黃色空白、`.panel` 不動」是把留白寫成 `.panel` 的 `padding-top` 才會有的結果；替 `.panel` 加上上邊框，也能把兩個外距隔開。',
    },
    {
      id: 'web06-q7', prompt: '`padding: 8px 16px 24px;` 設定的四邊內距各是多少？',
      options: [
        '上 8px、左右各 16px、下 24px',
        '上 8px、右 16px、下 24px、左 0',
        '上下各 8px、左 16px、右 24px',
        '上 8px、右 16px、下 24px、左 8px',
      ],
      answer: 0,
      explanation: '簡寫的值從上邊開始順時針排：三個值依序是上、右、下，沒寫到的左邊沿用對邊（右邊）的 16px，所以是上 8px、左右各 16px、下 24px。左邊不會變成 0，也不是沿用上邊的 8px；「上下、左右」是只寫兩個值時的意思。',
    },
    {
      id: 'web06-q8', prompt: '`.banner` 是 `<main>` 裡的一個 `<div>`。寫了這條規則之後，它沒有置中，仍然和原來一樣填滿整個寬度。最可能的原因是什麼？',
      code: { language: 'CSS', text: '.banner {\n  margin: 0 auto;\n  background-color: lightblue;\n}' },
      options: [
        '`auto` 只對上下外距有效，左右要寫明確的數字',
        '盒子的置中要用 `text-align: center`，`margin` 做不到',
        '`.banner` 沒有設定 `width`，區塊填滿了可用的寬度，沒有剩下的空間可以平分',
        '`<div>` 是行內元素，外距對它不適用',
      ],
      answer: 2,
      explanation: '左右外距的 `auto` 是把「剩下的寬度」平分給兩邊；沒有設定 `width` 的區塊會填滿父元素，剩下的寬度是 0，所以看不出置中。加上例如 `width: 300px` 就會置中。`auto` 正是用在左右方向，上下的 `auto` 在一般排版流裡才等於 0；`text-align: center` 置中的是盒子裡的文字；`<div>` 是區塊元素，四邊的外距都有效。',
    },
  ],
  webCode: {
    examples: [boxParts, boxSizing, flow, collapse, parentMargin],
    exercises: [exContentWidth, exBorderBox, exInlineBlock, exBoard],
  },
};
