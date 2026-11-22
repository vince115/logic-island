import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB11 mobile accessibility (MOB-3). How a mobile screen reader is driven (explore by touch, swipe to the next and
 * previous element, double-tap to activate, a rotor or menu to jump by headings and landmarks: generic, the two
 * built-in ones named once), a test script and a record table for the learner's own phone, zoom and text size (never
 * block zoom, text containers that grow, wrapping instead of truncating, reflow at 320 CSS px), orientation locks, and
 * alternatives to gestures (drag → move up/down buttons with a status message). WCAG requirements are given in words,
 * without success-criterion numbers.
 *
 * How the claims are checked. Nothing here can hear a screen reader: the text says so once and hands the listening to
 * the learner. The pages check what a screen reader depends on: names and roles (the engine's simplified reading),
 * the order Tab visits elements in (DOM order, the same order a swipe follows), Enter on a control, focus after a DOM
 * move, and the text put into a role="status" region. A user's larger text is stood in for by a root font size written
 * on <html> (16px, and 24px in a variant or an example); reflow by a 320px viewport and box edges that stay inside it;
 * an orientation lock by a resize to 640 × 360 and what is on top at a control's centre (hit).
 */

const icon = (d: string) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="${d}"/></svg>`;
const HEART = icon('M12 21C5 15 3 12 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5c0 3.5-2 6.5-9 12.5z');
const BACK = icon('M14.5 4L6.5 12l8 8 1.5-1.5L9.5 12 16 5.5z');
const SEARCH = icon('M10 3a7 7 0 1 0 4.2 12.6l4.6 4.6 1.4-1.4-4.6-4.6A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z');
const CART = icon('M3 4h3l2 9h9l2-7H8l-.4-2zM9 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z');

// ---- examples ---------------------------------------------------------------------------------------------------
const swipeOrder: WebExample = {
  id: 'mob11-swipe-order', title: '畫面的順序與 DOM 的順序：結帳的三個步驟排了兩次',
  description: '小島外送的結帳頁有三個步驟的按鈕。A 組在 HTML 裡先寫「3 付款」，再用 CSS 的 `order` 把它排到畫面的最後；B 組的 HTML 順序就是畫面的順序。兩組看起來一模一樣。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: String.raw`<h1>結帳的三個步驟</h1>
<p>A：HTML 先寫「付款」，再用 order 排到最後</p>
<div class="steps" id="a">
  <button type="button" id="a-pay" class="third">3 付款</button>
  <button type="button" id="a-pick" class="first">1 選餐點</button>
  <button type="button" id="a-addr" class="second">2 填地址</button>
</div>
<p>B：HTML 的順序就是畫面的順序</p>
<div class="steps" id="b">
  <button type="button" id="b-pick">1 選餐點</button>
  <button type="button" id="b-addr">2 填地址</button>
  <button type="button" id="b-pay">3 付款</button>
</div>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
h1 { margin: 12px 16px; font-size: 1.25rem; }
p { margin: 12px 16px 8px; }
.steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px;
}
.steps button {
  height: 44px;
  padding: 0 12px;
  font-size: 1rem;
  text-align: left;
}

/* A：order 只改變畫在哪裡，不改變 DOM 的順序 */
.first { order: 1; }
.second { order: 2; }
.third { order: 3; }

:focus-visible { outline: 3px solid #ef6c00; outline-offset: 2px; }`,
  },
  observe: [
    { check: 'box', selector: '#a-pay', measure: 'top', value: 104, from: '#a-pick', label: 'A：畫面上「3 付款」在「1 選餐點」的下方 104px，排在第三個' },
    { do: 'tab' },
    { check: 'focus', selector: '#a-pay', label: 'A：按一次 Tab，焦點先到的卻是「3 付款」：它在 HTML 裡寫在最前面' },
    { do: 'tab' },
    { check: 'focus', selector: '#a-pick', label: 'A：再按一次 Tab，才到畫面上的第一顆「1 選餐點」' },
    { do: 'tab' },
    { do: 'tab' },
    { check: 'focus', selector: '#b-pick', label: 'B：走完 A 的三顆之後，焦點到 B 的「1 選餐點」' },
    { do: 'tab' },
    { do: 'tab' },
    { check: 'focus', selector: '#b-pay', label: 'B：再按兩次 Tab 才到「3 付款」，順序和畫面一致' },
  ],
};

const auditPage: WebExample = {
  id: 'mob11-audit-page', title: '待測的餐點頁：四個要記下來的問題',
  description: '小島外送的餐點頁，用眼睛看、用手指點都正常：右上角是收藏的愛心，中間可以加減數量，下面是「加入購物車」，按下去會出現一行訊息。這一頁是拿來測試的，裡面故意留了四個問題。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: `<header id="top">
  <h1>海鹽薯條</h1>
  <button type="button" id="fav">${HEART}</button>
</header>
<p>現炸的粗薯條，一份 60 元。</p>
<div id="qty-row">
  <button type="button" id="minus">−</button>
  <span id="qty">1</span>
  <button type="button" id="plus">+</button>
</div>
<div id="add" class="btn">加入購物車</div>
<p id="msg"></p>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
#top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 16px;
}
h1 { margin: 0; font-size: 1.25rem; }
p { margin: 8px 16px; }
#fav, #qty-row button {
  min-width: 44px;
  min-height: 44px;
  font-size: 1.25rem;
}
#qty-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
}
.btn {
  margin: 8px 16px;
  min-height: 48px;
  line-height: 48px;
  text-align: center;
  border-radius: 8px;
  background-color: #ffcc80;
}`,
    js: String.raw`const qty = document.querySelector('#qty');
const msg = document.querySelector('#msg');

document.querySelector('#plus').addEventListener('click', () => {
  qty.textContent = Number(qty.textContent) + 1;
});
document.querySelector('#minus').addEventListener('click', () => {
  qty.textContent = Math.max(1, Number(qty.textContent) - 1);
});
document.querySelector('#add').addEventListener('click', () => {
  msg.textContent = '已加入購物車：' + qty.textContent + ' 份';
});`,
  },
  observe: [
    { check: 'name', selector: '#fav', text: '', label: '愛心按鈕 `#fav` 的無障礙名稱是空的：裡面只有一個對輔助科技隱藏的圖示' },
    { check: 'name', selector: '#plus', text: '+', label: '加號按鈕 `#plus` 的名稱只有一個符號「+」' },
    { check: 'role', selector: '#add', role: 'generic', label: '「加入購物車」`#add` 是 `<div>`：角色是 generic，不是 button' },
    { do: 'click', selector: '#add' },
    { check: 'text', selector: '#msg', text: '已加入購物車：1 份', label: '點「加入購物車」之後，`#msg` 的文字變成「已加入購物車：1 份」' },
    { check: 'role', selector: '#msg', role: 'paragraph', label: '但 `#msg` 的角色只是 paragraph，不是 status：它不是即時區域' },
  ],
};

const LARGE_CARD = (id: string) => `  <article class="card" id="${id}">
    <h2 class="title">椒麻雞飯套餐加冬瓜檸檬</h2>
    <button type="button" class="btn">再訂一次</button>
  </article>`;

const largeText: WebExample = {
  id: 'mob11-large-text', title: '文字放大成 1.5 倍、視窗 320px 寬：寫死尺寸的卡片與會長大的卡片',
  description: '預覽改不了你的字體設定，所以這一頁在 `<html>` 上把根字級寫成 24px，代替「使用者把文字放大成 1.5 倍」（真實的網站不要這樣寫）。兩張卡片的 HTML 相同，字級都用 rem。A 的寬度與高度寫死、標題不換行；B 沒有寫死寬度，高度只規定下限。',
  viewport: { width: 320, height: 640 },
  widths: [320, 360, 412],
  files: {
    html: `<!DOCTYPE html>
<html lang="zh-Hant" style="font-size: 24px;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>放大文字之後</title>
</head>
<body>
  <p class="note">A：寬高寫死，標題不換行</p>
${LARGE_CARD('fixed')}
  <p class="note">B：高度只有下限，標題會換行</p>
${LARGE_CARD('fluid')}
</body>
</html>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
.note { margin: 12px 16px 4px; font-size: 0.75rem; }
.card {
  box-sizing: border-box;
  margin: 0 16px;
  padding: 12px;
  background-color: #fff3e0;
}
.title { margin: 0 0 8px; font-size: 1.25rem; line-height: 1.4; }
.btn {
  display: block;
  min-height: 2.75rem;
  padding: 0 1rem;
  font-size: 0.875rem;
}

/* A：根字級 16px 時，12 + 28 + 8 + 44 + 12 剛好是 104px，所以沒有人發現問題 */
#fixed { width: 340px; height: 104px; overflow: hidden; }
#fixed .title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* B：寬度交給版面，高度只規定下限 */
#fluid { min-height: 104px; }`,
  },
  observe: [
    { check: 'box', selector: '#fixed', measure: 'height', value: 104, label: 'A：文字放大了，卡片仍然是寫死的 104px 高' },
    { check: 'box', selector: '#fixed .btn', measure: 'bottom', value: 128, from: '#fixed', label: 'A：按鈕的下緣在卡片上緣往下 128px 的地方：超出卡片 24px，被裁掉了' },
    { check: 'box', selector: '#fixed', measure: 'right', value: 356, label: 'A：寬度寫死 340px，右緣在 356px：超出 320px 寬的視窗，要左右捲動' },
    { check: 'box', selector: '#fluid', measure: 'right', value: 304, label: 'B：沒有寫死寬度，右緣在 304px，留在視窗裡' },
    { check: 'box', selector: '#fluid', measure: 'bottom', value: 66, op: 'min', from: '#fluid .btn', label: 'B：卡片跟著內容長高，66px 高的按鈕整顆在卡片裡面' },
  ],
};

const LOCK_RULES = String.raw`#rotate { display: none; }

/* 上一位開發者加的：橫放的版面沒有設計，乾脆不給用 */
@media (orientation: landscape) {
  #app { display: none; }
  #rotate {
    display: flex;
    position: fixed;
    inset: 0;
    align-items: center;
    justify-content: center;
    margin: 0;
    background-color: #263238;
    color: #ffffff;
  }
}`;

const orientationLock: WebExample = {
  id: 'mob11-orientation', title: '橫放就不給用：用媒體查詢做出來的方向鎖定',
  description: '小島外送的外送進度頁。style.css 的最後有一段媒體查詢：視窗是橫向時，把整個 `#app` 藏起來，改成顯示一句「請把手機轉成直向」。預覽上方的按鈕可以切換 360px（直放）與 640px（橫放）兩種寬度。',
  viewport: { width: 360, height: 640 },
  widths: [360, 640],
  height: 400,
  files: {
    html: String.raw`<main id="app">
  <h1>外送進度</h1>
  <p>椒麻雞飯 × 1</p>
  <p id="eta">預計 12 分鐘後送達</p>
  <button type="button" id="call">聯絡外送員</button>
</main>
<p id="rotate">請把手機轉成直向</p>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
#app { padding: 12px 16px; }
h1 { margin: 0 0 8px; font-size: 1.25rem; }
#app p { margin: 0; line-height: 2; }
#call { margin-top: 12px; min-width: 160px; min-height: 44px; font-size: 1rem; }
` + LOCK_RULES,
  },
  observe: [
    { check: 'style', selector: '#app', property: 'display', value: 'block', label: '直放（360 × 640）：`#app` 照常顯示' },
    { check: 'style', selector: '#rotate', property: 'display', value: 'none', label: '直放：提示 `#rotate` 是藏起來的' },
    { do: 'resize', width: 640, height: 360 },
    { check: 'style', selector: '#app', property: 'display', value: 'none', label: '橫放（640 × 360）：整個 `#app` 被 `display: none` 藏起來，進度與按鈕都不見了' },
    { check: 'style', selector: '#rotate', property: 'display', value: 'flex', label: '橫放：畫面上只剩「請把手機轉成直向」' },
  ],
};

const REORDER_CSS = String.raw`body { margin: 0; font-family: sans-serif; }
h1 { margin: 12px 16px; font-size: 1.25rem; }
p { margin: 8px 16px; }
#stops { margin: 0; padding: 0; list-style: none; }
#stops li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding-right: 8px;
  border-bottom: 1px solid #e0e0e0;
}
/* 拖曳用的把手：這一塊的手勢全部交給指令稿 */
.handle {
  width: 44px;
  height: 56px;
  line-height: 56px;
  text-align: center;
  touch-action: none;
  user-select: none;
}
.name { flex: 1; }
.up, .down { min-width: 44px; min-height: 44px; }
#status { min-height: 1.5em; }
:focus-visible { outline: 3px solid #ef6c00; outline-offset: 2px; }`;

const REORDER_JS_HEAD = String.raw`const list = document.querySelector('#stops');
const status = document.querySelector('#status');

// 把 item 放到第 index 個位置（從 0 算起，超出範圍就停在頭或尾），並把結果寫進 #status
function moveTo(item, index) {
  const others = Array.from(list.children).filter((li) => li !== item);
  const place = Math.max(0, Math.min(others.length, index));
  list.insertBefore(item, others[place] || null);
  const name = item.querySelector('.name').textContent;
  status.textContent = name + '現在是第 ' + (place + 1) + ' 項，共 ' + list.children.length + ' 項';
}

// 手勢：按住 ≡，拖到另一列上放開。這一段不用改
let dragged = null;
list.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.handle')) dragged = event.target.closest('li');
});
list.addEventListener('pointerup', (event) => {
  const under = document.elementFromPoint(event.clientX, event.clientY);
  const target = under ? under.closest('#stops li') : null;
  if (dragged && target) moveTo(dragged, Array.from(list.children).indexOf(target));
  dragged = null;
});
list.addEventListener('pointercancel', () => { dragged = null; });

`;
const REORDER_JS_BUTTONS = String.raw`// 替代操作：上移、下移按鈕
list.addEventListener('click', (event) => {
  const button = event.target.closest('.up, .down');
  if (!button) return;
  const item = button.closest('li');
  const index = Array.from(list.children).indexOf(item);
  moveTo(item, button.classList.contains('up') ? index - 1 : index + 1);
  button.focus(); // 搬動之後，把焦點還給同一顆按鈕
});
`;

type RowButtons = (name: string) => string;
const reorderRows = (names: string[], buttons: RowButtons) => names.map(name =>
  `  <li><span class="handle" aria-hidden="true">≡</span><span class="name">${name}</span>${buttons(name)}</li>`).join('\n');
const moveButtons: RowButtons = name =>
  `<button type="button" class="up" aria-label="上移${name}">▲</button><button type="button" class="down" aria-label="下移${name}">▼</button>`;

const reorder: WebExample = {
  id: 'mob11-reorder', title: '可以拖曳排序的清單，加上上移、下移按鈕與狀態訊息',
  description: '小島外送「我的最愛」的三道餐點。按住每一列左邊的 ≡ 拖到另一列上放開，可以調整順序；每一列右邊的 ▲、▼ 兩顆按鈕做同一件事。每次移動後，清單下方 `role="status"` 的 `#status` 會寫出新的位置。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: `<h1>我的最愛</h1>
<p>按住 ≡ 拖到另一列上放開，或按 ▲、▼ 調整順序。</p>
<ol id="stops">
${reorderRows(['海鹽薯條', '椒麻雞飯', '冬瓜檸檬'], moveButtons)}
</ol>
<p id="status" role="status"></p>`,
    css: REORDER_CSS,
    js: REORDER_JS_HEAD + REORDER_JS_BUTTONS,
  },
  observe: [
    { do: 'pointer', selector: '#stops li:nth-child(1) .handle', type: 'down', pointerType: 'touch' },
    { do: 'pointer', selector: '#stops li:nth-child(3)', type: 'up', pointerType: 'touch' },
    { check: 'text', selector: '#stops li:nth-child(3) .name', text: '海鹽薯條', label: '手勢：手指按住第一列的 ≡，移到第三列上放開，「海鹽薯條」變成第 3 項' },
    { do: 'click', selector: '#stops li:nth-child(3) .up' },
    { check: 'text', selector: '#stops li:nth-child(2) .name', text: '海鹽薯條', label: '替代操作：不拖曳，點一下它的「上移」按鈕，「海鹽薯條」回到第 2 項' },
    { check: 'text', selector: '#status', text: '海鹽薯條現在是第 2 項，共 3 項', label: '`#status` 的文字變成「海鹽薯條現在是第 2 項，共 3 項」' },
    { check: 'role', selector: '#status', role: 'status', label: '`#status` 的角色是 status：它是即時區域' },
    { check: 'focus', selector: '#stops li:nth-child(2) .up', label: '焦點還在剛才按的那顆「上移」按鈕上，它跟著「海鹽薯條」到了第二列' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const NAMES_CSS = String.raw`body { margin: 0; font-family: sans-serif; }
#top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background-color: #fff3e0;
}
#top h1 { flex: 1; margin: 0; font-size: 1.25rem; }
#top a, #top button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border: 0;
  background-color: transparent;
  color: inherit;
}
#top svg { display: block; }
main { padding: 16px; }
#order {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background-color: #ffcc80;
  color: #212121;
  font-family: inherit;
  font-size: 1rem;
  line-height: 48px;
  text-align: center;
}
/* 畫面上看不到、螢幕閱讀器讀得到的文字，需要時可以用 */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
:focus-visible { outline: 3px solid #1565c0; outline-offset: 2px; }`;
const NAMES_JS = String.raw`const order = document.querySelector('#order');
const status = document.querySelector('#status');

order.addEventListener('click', () => {
  status.textContent = '已加入購物車';
});`;
const namesHtml = (back: string, search: string, cart: string, order: string) => `<header id="top">
  ${back}
  <h1>阿海小吃</h1>
  ${search}
  ${cart}
</header>
<main>
  <p>現炸的海鹽薯條，一份 60 元。</p>
  ${order}
  <p id="status" role="status"></p>
</main>`;

const exNames: WebExercise = {
  id: 'mob11-ex-names', title: '照著測試紀錄修正：三個沒有名稱的圖示，與一顆不是按鈕的按鈕',
  statement: 'style.css 與 script.js 不能改。有人用手機的螢幕閱讀器測了小島外送的店家頁，測試紀錄有四筆：(1) 左上角的返回連結 `#back` 只聽到「連結」；(2) 搜尋 `#search` 只聽到「按鈕」；(3) 購物車 `#cart` 也只聽到「按鈕」；(4)「加入購物車」`#order` 只唸出文字，聽不出它是按鈕，接上外接鍵盤時也到不了它。請修改 index.html：三個圖示控制項都要有無障礙名稱，分別包含「返回」「搜尋」「購物車」；`#order` 的角色要是按鈕，而且在它上面按 Enter 要和點它一樣，讓 `#status` 出現「已加入購物車」（script.js 只登記了 `click`，不能改，所以要靠元素本身）。每個元素的 `id` 請保留；圖示的 `<svg>` 可以維持 `aria-hidden="true"`。',
  hints: [
    '圖示的 `<svg>` 寫了 `aria-hidden="true"`，對螢幕閱讀器來說這三個控制項裡面什麼都沒有。名稱要給控制項本身：寫在 `<a>` 或 `<button>` 上，不是寫在被隱藏的圖示上。',
    '最短的寫法是在控制項上加 `aria-label`，例如 `<button type="button" id="search" aria-label="搜尋">`。也可以在控制項裡加一個 `<span class="visually-hidden">搜尋</span>`。',
    '`#order` 換成原生的按鈕：`<button type="button" id="order">加入購物車</button>`。原生按鈕本來就有按鈕的角色、可以聚焦，按 Enter 或空白鍵會觸發 `click`。',
  ],
  explanation: '`aria-label` 寫在連結與按鈕上，它們就有了名稱：螢幕閱讀器選到時通常會唸出「返回店家列表，連結」「搜尋，按鈕」「購物車，按鈕」這樣的描述。圖示維持 `aria-hidden="true"`，它只是裝飾，名稱由控制項提供。`#order` 換成 `<button type="button">` 之後，三件事一次到位：角色是按鈕；可以取得焦點，外接鍵盤與開關控制到得了它；按 Enter 或空白鍵會觸發 `click`，所以只登記了 `click` 的 script.js 不必改。這正是「語意 HTML 與 ARIA 的無障礙實作」那一課的第一條規則：有原生元素就用原生元素。名稱裡不必寫「按鈕」或「連結」，角色本來就會被唸出來。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  fixed: { css: NAMES_CSS, js: NAMES_JS },
  starter: { html: namesHtml(
    `<a id="back" href="/shops">${BACK}</a>`,
    `<button type="button" id="search">${SEARCH}</button>`,
    `<button type="button" id="cart">${CART}</button>`,
    '<div id="order">加入購物車</div>',
  ) },
  solution: { html: namesHtml(
    `<a id="back" href="/shops" aria-label="返回店家列表">${BACK}</a>`,
    `<button type="button" id="search" aria-label="搜尋">${SEARCH}</button>`,
    `<button type="button" id="cart" aria-label="購物車">${CART}</button>`,
    '<button type="button" id="order">加入購物車</button>',
  ) },
  steps: [
    { check: 'name', selector: '#back', text: '返回', match: 'includes', label: '返回連結 `#back` 的無障礙名稱裡有「返回」' },
    { check: 'name', selector: '#search', text: '搜尋', match: 'includes', label: '`#search` 的無障礙名稱裡有「搜尋」' },
    { check: 'name', selector: '#cart', text: '購物車', match: 'includes', label: '`#cart` 的無障礙名稱裡有「購物車」' },
    { check: 'role', selector: '#order', role: 'button', label: '`#order` 的角色是按鈕' },
    { check: 'name', selector: '#order', text: '加入購物車', match: 'includes', label: '`#order` 的名稱裡仍然有「加入購物車」' },
    { do: 'key', selector: '#order', key: 'Enter' },
    { check: 'text', selector: '#status', text: '已加入購物車', label: '在 `#order` 上按 Enter，`#status` 出現「已加入購物車」' },
  ],
  mistakes: [
    { files: { html: namesHtml(
      `<a id="back" href="/shops">${BACK.replace('aria-hidden="true"', 'aria-hidden="true" aria-label="返回"')}</a>`,
      `<button type="button" id="search">${SEARCH.replace('aria-hidden="true"', 'aria-hidden="true" aria-label="搜尋"')}</button>`,
      `<button type="button" id="cart">${CART.replace('aria-hidden="true"', 'aria-hidden="true" aria-label="購物車"')}</button>`,
      '<button type="button" id="order">加入購物車</button>',
    ) }, why: '把 `aria-label` 寫在 `<svg aria-hidden="true">` 上。`aria-hidden="true"` 已經把整個圖示從無障礙樹拿掉，寫在它上面的名稱也跟著消失：連結與按鈕仍然沒有名稱。名稱要寫在控制項本身（`<a>`、`<button>`）上。' },
    { files: { html: namesHtml(
      `<a id="back" href="/shops" aria-label="返回店家列表">${BACK}</a>`,
      `<button type="button" id="search" aria-label="搜尋">${SEARCH}</button>`,
      `<button type="button" id="cart" aria-label="購物車">${CART}</button>`,
      '<div id="order" role="button" tabindex="0">加入購物車</div>',
    ) }, why: '替 `<div>` 補上 `role="button"` 與 `tabindex="0"`。螢幕閱讀器會說它是按鈕，焦點也到得了，但按 Enter 沒有任何反應：`role` 只改說法、不改行為，鍵盤操作要另外寫 `keydown` 監聽器，而這一題的 script.js 不能改。換成原生的 `<button>`，三件事一次解決。' },
  ],
};

const cardPage = (root: number) => `<!DOCTYPE html>
<html lang="zh-Hant" style="font-size: ${root}px;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>小島外送：上一筆訂單</title>
</head>
<body>
  <article id="card">
    <h2 id="title">椒麻雞飯套餐（大份、不辣）加冬瓜檸檬與海鹽薯條</h2>
    <div id="actions">
      <button type="button" class="btn" id="again">再訂一次</button>
      <button type="button" class="btn" id="detail">查看明細</button>
    </div>
  </article>
</body>
</html>`;
const cardCss = (card: string, title: string, actions: string, btn: string) => String.raw`body { margin: 0; font-family: sans-serif; }
#card {
  box-sizing: border-box;
  margin: 16px;
  padding: 12px;
  background-color: #fff3e0;
` + card + String.raw`}
#title {
  margin: 0 0 8px;
  line-height: 1.4;
` + title + String.raw`}
#actions {
  display: flex;
  gap: 8px;
` + actions + String.raw`}
.btn {
` + btn + String.raw`}
`;
const CARD_OLD = ['  width: 340px;\n  height: 104px;\n  overflow: hidden;\n', '  font-size: 20px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n', '', '  flex: none;\n  width: 154px;\n  height: 44px;\n  font-size: 14px;\n'] as const;
const CARD_GOOD_BTN = '  min-height: 44px;\n  padding: 0 16px;\n  font-size: 0.875rem;\n';
const WRAPS = ['normal', 'pre-wrap', 'pre-line', 'break-spaces'];

const exLargeText: WebExercise = {
  id: 'mob11-ex-large-text', title: '讓訂單卡片撐過 320px 的視窗與放大的文字',
  statement: 'index.html 不能改。小島外送的「上一筆訂單」卡片 `#card` 在 360px 寬、預設字級的手機上剛好放得下，但測試紀錄有三筆：視窗 320px 寬時要左右捲動；標題太長被截成「…」；把文字放大之後，字沒有變大，或變大了卻被卡片裁掉。請修改 style.css：(1) 視窗 320px 寬時，卡片與兩顆按鈕都不能超出視窗；(2) 標題 `#title` 放不下時要換行，不要截斷；(3) 卡片的高度要跟著內容長大，最後一顆按鈕 `#detail` 必須整顆在卡片裡面；(4) 字級維持設計稿的大小，但要跟著根字級放大：標題相當於 20px、按鈕相當於 14px，請以 1rem = 16px 換算成 rem；(5) 按鈕仍然至少 44px 高。`#card` 的 `margin`、`padding` 與 `box-sizing` 請保留。index.html 用行內樣式把根元素的字級寫成 16px，代替「瀏覽器預設的字級」。檢查在 320px 寬的視窗進行；另一份檢查會把根字級換成 24px（就像使用者把文字放大成 1.5 倍）：這時標題要是 30px、按鈕的字要是 21px，同樣不能超出視窗、不能被裁掉。所以答案裡的字級不能是 px，也不要在 style.css 設定 `html` 的字級。',
  hints: [
    '先找出寫死的尺寸：`#card` 的 `width` 與 `height`、`.btn` 的 `width`。區塊元素不寫 `width` 就會填滿容器；高度不寫，或改成 `min-height`，就會跟著內容長大。',
    '`#title` 的 `white-space: nowrap` 是不換行的原因，連同 `overflow` 與 `text-overflow` 一起刪掉。字級除以 16：20px 是 `1.25rem`，14px 是 `0.875rem`。',
    '兩顆按鈕：拿掉 `flex: none` 與 `width: 154px`，寬度交給文字與 `padding`；`height: 44px` 改成 `min-height: 44px`。再替 `#actions` 加上 `flex-wrap: wrap`，放不下時第二顆會換到下一列。',
  ],
  explanation: '原本的樣式把三件事寫死了：卡片 340px 寬、104px 高，按鈕各 154px 寬。在 360px 寬、字級 16px 的手機上，這些數字剛好湊得起來，所以寫的人看不到問題；視窗一窄或文字一大，就超出去或被裁掉。修正後，`#card` 不寫寬度，自動填滿視窗扣掉兩側 16px 外距的空間；不寫高度，所以標題換成兩行、三行時卡片跟著長高。`#title` 拿掉 `white-space: nowrap` 與 `text-overflow: ellipsis`：使用者放大文字是為了讀到內容，截成「…」等於把內容拿走。字級換成 `1.25rem` 與 `0.875rem`：根字級 16px 時仍然是 20px 與 14px，根字級 24px 時變成 30px 與 21px。按鈕用 `min-height` 保住 44px 的觸控目標，`#actions` 的 `flex-wrap: wrap` 讓放不下的按鈕換到下一列。`min-height: 104px`、`max-width: 340px` 這類「只規定界線」的寫法同樣可以通過。',
  viewport: { width: 320, height: 640 },
  widths: [320, 360, 412],
  fixed: { html: cardPage(16) },
  starter: { css: cardCss(...CARD_OLD) },
  solution: { css: cardCss('', '  font-size: 1.25rem;\n', '  flex-wrap: wrap;\n', CARD_GOOD_BTN) },
  steps: [
    { check: 'box', selector: '#card', measure: 'right', value: 320, op: 'max', label: '視窗寬 320px：卡片 `#card` 的右緣沒有超出視窗' },
    { check: 'box', selector: '#detail', measure: 'right', value: 320, op: 'max', label: '第二顆按鈕 `#detail` 的右緣也沒有超出視窗' },
    { check: 'style', selector: '#title', property: 'white-space', value: WRAPS, label: '標題 `#title` 放不下時會換行（`white-space` 計算後不是 `nowrap`）' },
    { check: 'box', selector: '#card', measure: 'bottom', value: 44, op: 'min', from: '#detail', label: '卡片跟著內容長高：卡片的下緣在 `#detail` 上緣的下方至少 44px，按鈕整顆在卡片裡' },
    { check: 'style', selector: '#title', property: 'font-size', value: '20px', label: '根字級 16px 時，標題的字級是 20px' },
    { check: 'box', selector: '#again', measure: 'height', value: 44, op: 'min', label: '按鈕 `#again` 仍然至少 44px 高' },
  ],
  mistakes: [
    { files: { css: cardCss('  width: 100%;\n', '  font-size: 1.25rem;\n', '  flex-wrap: wrap;\n', CARD_GOOD_BTN) }, why: '把 `width: 340px` 改成 `width: 100%`。100% 是整個視窗的寬度 320px，再加上左邊 16px 的外距，卡片的右緣在 336px：還是超出視窗。區塊元素不寫 `width`，才會自動扣掉外距、填滿剩下的空間；想保留上限就寫 `max-width`。' },
    { files: { css: cardCss('  height: 6.5rem;\n  overflow: hidden;\n', '  font-size: 1.25rem;\n', '  flex-wrap: wrap;\n', CARD_GOOD_BTN) }, why: '把高度從 `104px` 換成 `6.5rem`，以為用了 rem 就會跟著長大。它的確會跟著根字級變大，但仍然是寫死的：標題換成兩行之後內容變高，卡片不會跟著長，按鈕的下面一截被 `overflow: hidden` 裁掉。裝文字的容器不寫高度，或只寫 `min-height`。' },
    { files: { css: cardCss('', '  font-size: 1.25rem;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n', '  flex-wrap: wrap;\n', CARD_GOOD_BTN) }, why: '留著 `white-space: nowrap` 與 `text-overflow: ellipsis`，覺得截斷比較整齊。卡片不會超出視窗了，但標題只看得到前幾個字；文字放得越大，看得到的字越少。使用者放大是為了讀內容，請讓標題換行。' },
    { files: { css: cardCss('', '  font-size: 20px;\n', '  flex-wrap: wrap;\n', '  min-height: 44px;\n  padding: 0 16px;\n  font-size: 14px;\n') }, why: '版面都修好了，字級卻還是 `20px` 與 `14px`。根字級 16px 時每一項檢查都會過，自己測也看不出問題；但在會改變根字級的設定下，px 的字一動也不動（根字級 24px 的那份檢查不會通過）。換成 `1.25rem` 與 `0.875rem`。' },
  ],
  variants: [{
    title: '根元素的字級換成 24px：字要變成 1.5 倍，卡片仍然不超出視窗、不裁掉按鈕',
    fixed: { html: cardPage(24) },
    steps: [
      { check: 'style', selector: '#title', property: 'font-size', value: '30px', label: '根字級 24px：標題的字級是 30px' },
      { check: 'style', selector: '#again', property: 'font-size', value: '21px', label: '根字級 24px：按鈕的字級是 21px' },
      { check: 'box', selector: '#card', measure: 'right', value: 320, op: 'max', label: '卡片的右緣沒有超出 320px 寬的視窗' },
      { check: 'box', selector: '#detail', measure: 'right', value: 320, op: 'max', label: '`#detail` 的右緣沒有超出視窗' },
      { check: 'box', selector: '#card', measure: 'bottom', value: 44, op: 'min', from: '#detail', label: '`#detail` 整顆在卡片裡' },
    ],
  }],
};

const PLACES = ['碼頭', '燈塔', '國小'];
const routeHtml = (buttons: RowButtons, status: string) => `<h1>送餐順序</h1>
<p>按住 ≡ 拖到另一列上放開，可以調整順序。</p>
<ol id="stops">
${reorderRows(PLACES, buttons)}
</ol>
${status}`;
const REORDER_JS_TODO = String.raw`// 替代操作：點「上移」「下移」按鈕也要能調整順序。請寫在下面
`;
const STATUS_PLAIN = '<p id="status"></p>';
const STATUS_LIVE = '<p id="status" role="status"></p>';

const exReorder: WebExercise = {
  id: 'mob11-ex-reorder', title: '拖曳排序之外：加上上移、下移按鈕，並說出新的位置',
  statement: 'style.css 不能改。外送員的「送餐順序」`#stops` 有三站，目前只能按住 ≡ 拖曳來調整：螢幕閱讀器的使用者、做不了拖曳的人都排不了。請加上觸控替代。index.html：(1) 在每個 `<li>` 裡、站名 `<span class="name">` 的後面加兩顆真正的按鈕，`class` 分別是 `up` 與 `down`；無障礙名稱要說出動作與對象，也就是分別包含「上移」「下移」，而且都包含那一列的站名（例如「上移燈塔」）。(2) 讓 `#status` 成為即時區域，角色要是 status。script.js：點擊 `.up` 或 `.down`（或在上面按 Enter）時，把那一列往前或往後移一個位置。請呼叫已經寫好的 `moveTo(item, index)`：它會搬動那一列（`index` 從 0 算起，超出範圍會停在頭或尾），並把「燈塔現在是第 1 項，共 3 項」這樣的句子寫進 `#status`。移動之後，焦點必須留在剛才按的那顆按鈕上。原本的拖曳要保留。檢查會先用手指把第一站「碼頭」拖到最後，再在它的「上移」按鈕上按 Enter。',
  hints: [
    '按鈕用 `<button type="button" class="up">`。三列的按鈕如果都只寫「▲」，聽起來一模一樣：用 `aria-label` 把名稱寫完整，例如 `aria-label="上移碼頭"`。`#status` 加上 `role="status"` 就是即時區域。',
    '指令稿不必替六顆按鈕各登記一次：在 `list` 上登記一個 `click` 監聽器，用 `event.target.closest(\'.up, .down\')` 找出被按的按鈕，再用 `button.closest(\'li\')` 找到那一列。那一列目前的位置是 `Array.from(list.children).indexOf(item)`。',
    '上移是 `moveTo(item, index - 1)`，下移是 `moveTo(item, index + 1)`。`moveTo` 會把那一列從清單拿出來再放回去，裡面的按鈕通常會因此失去焦點：最後補一行 `button.focus();`。',
  ],
  explanation: '拖曳是需要沿著路徑移動的操作，一定要有「點一下」就能完成的替代：每一列的「上移」「下移」是原生的 `<button>`，手指、鍵盤、開關控制與螢幕閱讀器都能啟動。`aria-label="上移碼頭"` 讓六顆按鈕各有說得出對象的名稱。指令稿在清單上登記一個 `click` 監聽器，算出那一列目前的位置，再交給 `moveTo`：按鈕和拖曳呼叫的是同一個函式，所以兩條路做的事完全一樣，`#status` 也都會更新。`#status` 有 `role="status"`，文字一改變，螢幕閱讀器通常會在使用者手邊的事告一段落後唸出「碼頭現在是第 2 項，共 3 項」；少了它，按鈕按下去聽起來就像沒有反應。最後的 `button.focus()` 也不能少：`insertBefore` 搬動的是整個 `<li>`，裡面原本有焦點的按鈕通常會失去焦點，使用者得重新找到剛才的位置；把焦點還給它，就能連續按好幾次。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  fixed: { css: REORDER_CSS },
  starter: { html: routeHtml(() => '', STATUS_PLAIN), js: REORDER_JS_HEAD + REORDER_JS_TODO },
  solution: { html: routeHtml(moveButtons, STATUS_LIVE), js: REORDER_JS_HEAD + REORDER_JS_BUTTONS },
  steps: [
    { check: 'name', selector: '#stops li:nth-child(2) .up', text: '上移', match: 'includes', label: '第二列有一顆 `class` 是 `up` 的按鈕，無障礙名稱裡有「上移」' },
    { check: 'name', selector: '#stops li:nth-child(3) .down', text: '國小', match: 'includes', label: '名稱說得出移的是哪一站：第三列 `.down` 的名稱裡有「國小」' },
    { check: 'role', selector: '#status', role: 'status', label: '`#status` 的角色是 status' },
    { do: 'pointer', selector: '#stops li:nth-child(1) .handle', type: 'down', pointerType: 'touch' },
    { do: 'pointer', selector: '#stops li:nth-child(3)', type: 'up', pointerType: 'touch' },
    { do: 'key', selector: '#stops li:nth-child(3) .up', key: 'Enter' },
    { check: 'text', selector: '#stops li:nth-child(2) .name', text: '碼頭', label: '先用手指把第一站「碼頭」拖到最後，再在它的 `.up` 按鈕上按 Enter：「碼頭」變成第 2 項' },
    { check: 'text', selector: '#status', text: '碼頭現在是第 2 項，共 3 項', label: '`#status` 的文字是「碼頭現在是第 2 項，共 3 項」' },
    { check: 'focus', selector: '#stops li:nth-child(2) .up', label: '焦點還在剛才按的那顆按鈕上（它跟著「碼頭」到了第二列）' },
  ],
  mistakes: [
    { files: { html: routeHtml(() => '<button type="button" class="up">▲</button><button type="button" class="down">▼</button>', STATUS_LIVE), js: REORDER_JS_HEAD + REORDER_JS_BUTTONS }, why: '按鈕上只有「▲」「▼」兩個符號。它們的無障礙名稱就是符號本身：沒有說是上移還是下移，也沒有說移的是哪一站，六顆按鈕聽起來只有兩種。用 `aria-label` 寫出動作與站名。' },
    { files: { html: routeHtml(moveButtons, STATUS_LIVE), js: REORDER_JS_HEAD + String.raw`// 替代操作：上移、下移按鈕
list.addEventListener('click', (event) => {
  const button = event.target.closest('.up, .down');
  if (!button) return;
  const item = button.closest('li');
  const index = Array.from(list.children).indexOf(item);
  moveTo(item, button.classList.contains('up') ? index - 1 : index + 1);
});
` }, why: '順序換了，訊息也寫了，卻沒有把焦點還給按鈕。`insertBefore` 把整列拿出來再放回去，裡面的按鈕因此失去焦點：再按一次 Enter 已經沒有反應，鍵盤使用者得重新找到那顆按鈕，螢幕閱讀器選取的位置也可能跑掉，想連按兩次「上移」都很困難。在 `moveTo` 之後加上 `button.focus();`。' },
    { files: { html: routeHtml(moveButtons, STATUS_LIVE), js: REORDER_JS_HEAD + String.raw`// 替代操作：上移、下移按鈕
list.addEventListener('click', (event) => {
  const button = event.target.closest('.up, .down');
  if (!button) return;
  const item = button.closest('li');
  if (button.classList.contains('up') && item.previousElementSibling) {
    list.insertBefore(item, item.previousElementSibling);
  }
  if (button.classList.contains('down') && item.nextElementSibling) {
    list.insertBefore(item.nextElementSibling, item);
  }
  button.focus();
});
` }, why: '自己用 `insertBefore` 搬動，沒有經過 `moveTo`。畫面上的順序換了，但 `#status` 沒有更新：看不到畫面的人按了按鈕，什麼都沒聽到，不知道有沒有成功。替代操作要和手勢呼叫同一個函式，結果才會一樣，也才會被說出來。' },
  ],
};

const lockPage = (viewport: string, rotate: string) => `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="${viewport}">
  <title>小島外送：確認訂單</title>
</head>
<body>
  <main id="app">
    <h1 id="title">確認訂單</h1>
    <p>海鹽薯條 × 1</p>
    <p>冬瓜檸檬 × 2</p>
    <p id="total">合計 150 元</p>
    <button type="button" id="pay">送出訂單</button>
  </main>
${rotate}</body>
</html>`;
const LOCK_BASE_CSS = String.raw`body { margin: 0; font-family: sans-serif; }
#app { padding: 12px 16px; }
h1 { margin: 0 0 8px; font-size: 1.25rem; }
#app p { margin: 0; line-height: 2; }
#pay { margin-top: 12px; min-width: 160px; min-height: 44px; font-size: 1rem; }
`;
const VIEWPORT_LOCKED = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
const VIEWPORT_OPEN = 'width=device-width, initial-scale=1';
const ROTATE_P = '  <p id="rotate">請把手機轉成直向再使用</p>\n';

const exOrientation: WebExercise = {
  id: 'mob11-ex-orientation-zoom', title: '拿掉方向鎖定與禁止縮放',
  statement: '小島外送的「確認訂單」頁收到兩筆測試紀錄：(1) 用兩指無法放大頁面；(2) 手機一橫放，訂單就不見了，只剩一句「請把手機轉成直向再使用」，手機固定在支架上的人完全無法送出訂單。請修改 index.html 與 style.css。index.html：`name` 是 `viewport` 的 `<meta>` 要留著，`content` 仍然要有 `width=device-width` 與 `initial-scale=1`，但不能再有 `user-scalable` 或 `maximum-scale`。style.css：橫放時 `#app` 的內容要照常顯示，「送出訂單」按鈕 `#pay` 與標題 `#title` 都要看得到、點得到，不能被藏起來，也不能被任何東西蓋住；提示 `#rotate` 可以刪掉。檢查會先在 360 × 640 的視窗確認 `#pay` 點得到，再把視窗改成 640 × 360（手機橫放）檢查一次。預覽是嵌在課程頁面裡的框架，viewport 設定在這裡看不出效果，所以這一項檢查讀的是屬性；修好之後請在自己的手機上用兩指放大來確認。',
  hints: [
    'viewport 的 `content` 是用逗號分開的一串設定。把 `maximum-scale=1` 與 `user-scalable=no` 兩項連同前面的逗號刪掉，留下前兩項。',
    '橫放時是誰把訂單藏起來的？看 style.css 最後的 `@media (orientation: landscape)`：裡面有兩條規則，一條藏 `#app`，一條讓 `#rotate` 蓋住整個畫面。',
    '最簡單的修法是把整個 `@media (orientation: landscape) { … }` 區塊刪掉；`#rotate` 那句提示沒有用了，連同 HTML 裡的 `<p id="rotate">` 一起刪掉也可以。',
  ],
  explanation: '`maximum-scale=1` 與 `user-scalable=no` 的作用是不讓使用者用兩指放大，需要放大才讀得到字的人因此被擋在外面；只留 `width=device-width, initial-scale=1`。方向鎖定則來自那段媒體查詢：視窗橫向時，`#app { display: none; }` 把整張訂單藏起來，`#rotate` 用 `position: fixed` 與 `inset: 0` 蓋住畫面。把整個區塊刪掉，橫放時頁面就照一般的排版顯示，640px 寬的視窗放這張訂單綽綽有餘。「請旋轉裝置」不是替代方案：手機固定在輪椅或支架上的人轉不了。橫放後真正要處理的是高度變少，那是「安全區域、方向與動態視窗高度」那一課的工作：調整版面，而不是拒絕使用者。',
  viewport: { width: 360, height: 640 },
  widths: [360, 640],
  height: 400,
  starter: { html: lockPage(VIEWPORT_LOCKED, ROTATE_P), css: LOCK_BASE_CSS + LOCK_RULES + '\n' },
  solution: { html: lockPage(VIEWPORT_OPEN, ''), css: LOCK_BASE_CSS },
  steps: [
    { check: 'count', selector: 'meta[name="viewport"][content*="user-scalable"], meta[name="viewport"][content*="maximum-scale"]', count: 0, label: 'viewport 設定裡沒有 `user-scalable` 或 `maximum-scale`：不限制使用者縮放' },
    { check: 'attr', selector: 'meta[name="viewport"]', name: 'content', value: 'width=device-width', match: 'includes', label: 'viewport 設定還在，`content` 裡有 `width=device-width`' },
    { check: 'hit', selector: '#pay', top: '#pay', label: '直放（360 × 640）：「送出訂單」`#pay` 看得到、點得到' },
    { do: 'resize', width: 640, height: 360 },
    { check: 'hit', selector: '#pay', top: '#pay', label: '橫放（640 × 360）：`#pay` 仍然看得到、點得到，沒有被藏起來或蓋住' },
    { check: 'hit', selector: '#title', top: '#app', label: '橫放：標題 `#title` 也看得到，它的位置上沒有別的東西蓋著' },
  ],
  mistakes: [
    { files: { html: lockPage('width=device-width, initial-scale=1, maximum-scale=1', ROTATE_P), css: LOCK_BASE_CSS }, why: '只刪掉 `user-scalable=no`，留下 `maximum-scale=1`。最大縮放比例是 1，等於還是不能放大：兩個設定都是在限制縮放，要一起拿掉。' },
    { files: { html: lockPage(VIEWPORT_OPEN, ROTATE_P), css: LOCK_BASE_CSS + LOCK_RULES.replace('  #app { display: none; }\n', '') + '\n' }, why: '只刪掉 `#app { display: none; }`，那句提示還留在媒體查詢裡。訂單是顯示出來了，但 `#rotate` 仍然用 `position: fixed` 與 `inset: 0` 蓋住整個畫面：看不到，也點不到。整個媒體查詢都要拿掉。' },
    { files: { html: lockPage(VIEWPORT_OPEN, ROTATE_P), css: LOCK_BASE_CSS + LOCK_RULES.replace('@media (orientation: landscape) {', '@media (orientation: landscape) and (max-height: 480px) {') + '\n' }, why: '把條件縮小成「橫向而且高度不到 480px」，想只擋手機、放過平板。但被擋的正是橫放的手機：640 × 360 的視窗完全符合條件，訂單照樣不見。方向鎖定不是範圍太大的問題，而是根本不該有。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const MOB11: LessonContent = {
  lessonId: 'MOB11',
  motivation: '手機內建的螢幕閱讀器，讓看不到螢幕的人用滑動與聆聽操作網頁；也有很多人把文字放大、把手機固定成橫向，或做不出拖曳與雙指的手勢。這一課帶你用自己的手機把頁面聽一遍，照著測試腳本記下問題，再動手修掉最常見的幾種：沒有名稱的圖示按鈕、文字一放大就破掉的卡片、鎖住方向的頁面，以及只能拖曳的操作。',
  sections: [
    {
      id: 'mob11-screen-reader-section', title: '行動螢幕閱讀器：用滑的和聽的操作手機',
      blocks: [
        { type: 'p', text: '「語意 HTML 與 ARIA 的無障礙實作」那一課說過，螢幕閱讀器讀的不是畫面上的像素，而是瀏覽器替每個元素準備的角色、無障礙名稱與狀態；那一課的操作方式是鍵盤的 Tab、Enter 與 Escape。手機沒有鍵盤，行動螢幕閱讀器（mobile screen reader）換了一套用手指的操作方式，而且不必另外安裝：兩大行動平台各內建一套，iOS 的叫 VoiceOver，Android 的叫 TalkBack。兩者的細節不同，下面是多數情況下共通的基本動作：' },
        { type: 'table', head: ['動作', '通常的效果'], rows: [
          ['手指貼著螢幕慢慢移動（觸摸探索）', '唸出手指底下的元素，並選取它'],
          ['往右滑一下、往左滑一下', '選取下一個、上一個元素，並唸出來'],
          ['在螢幕的任何位置點兩下', '啟動目前選取的元素，相當於平常的點一下'],
          ['切換導覽的方式（轉輪或選單）', '改成逐一跳到標題、連結、地標或表單控制項'],
        ] },
        { type: 'p', text: '開啟之後，平常的「點一下」不再直接按下按鈕：它只是選取並唸出那個元素，要點兩下才啟動；捲動等其他手勢也會跟著改變。確切的手勢依平台與設定而不同，測試之前請先讀該平台的官方說明。對寫網頁的人來說，重要的是這套操作方式帶來的三個結果：' },
        { type: 'list', items: [
          '閱讀順序就是 DOM 的順序。往右滑走訪元素的順序，通常是它們在 HTML 裡的先後，和 CSS 把它們畫在哪裡無關。',
          '每個控制項都要有名稱與角色。使用者聽到的是「加入購物車，按鈕」這樣的描述：少了名稱只剩「按鈕」，少了角色只剩一串文字，聽不出可以按。',
          '狀態與結果要說得出來。畫面另一處悄悄出現的「已加入購物車」，沒有人會主動唸。',
        ] },
        { type: 'p', text: '第二、三點在那一課已經學過做法，這一課的重點是到手機上去驗證它們。先看第一點，下面的頁面把同樣的三顆按鈕排了兩次：' },
        { type: 'example', id: 'mob11-swipe-order' },
        { type: 'p', text: '預覽裡沒有螢幕閱讀器，這一頁用 Tab 鍵代替：Tab 和螢幕閱讀器的左右滑一樣，通常都照 DOM 的順序走（差別是 Tab 只停在可以操作的元素上，滑動連文字也會停）。先用滑鼠點一下預覽裡的標題，再按 Tab：焦點先落在 A 組的「3 付款」，也就是畫面上的第三顆，再按才到「1 選餐點」。A 組的 HTML 先寫了付款按鈕，再用 CSS 的 `order` 把它排到最後；`order` 只改變畫在哪裡，不改變 DOM。用螢幕閱讀器的人一路往右滑，在這一組最先聽到的通常就是「付款」，會以為這一頁一開始就要他付錢。B 組的 HTML 順序和畫面一致，不論用看的、用 Tab 還是用滑的，都是 1、2、3。' },
        { type: 'p', text: '會讓畫面和 DOM 順序脫節的不只有 `order`：`flex-direction` 的 `row-reverse` 與 `column-reverse`、把格線項目指定到別的位置、用絕對定位把元素搬到別處，都有同樣的效果。原則是先把 HTML 寫成要被讀到的順序，CSS 只負責外觀。' },
        { type: 'callout', tone: 'note', title: '這一課的檢查聽不到螢幕閱讀器', text: '這一課的範例與練習會檢查角色、無障礙名稱、Tab 的順序、焦點的位置與狀態訊息的文字。角色與名稱用的是簡化過的規則，足以抓出這一課教的錯誤；但檢查聽不到任何一套螢幕閱讀器實際唸出的句子，也不知道它在你的手機上怎麼反應。所以文中描述螢幕閱讀器的行為時都說「通常」。真正的驗證只有一種：下一節的測試腳本，用你自己的手機照著做一遍。' },
      ],
    },
    {
      id: 'mob11-test-script-section', title: '照著做的測試腳本與問題紀錄',
      blocks: [
        { type: 'p', text: '第一次開螢幕閱讀器的人常常不知道該測什麼，滑了幾下就關掉。下面是一份可以照著做的測試腳本，拿任何一個頁面都能用；測的時候把視線移開螢幕，才聽得出問題。' },
        { type: 'list', ordered: true, items: [
          '先查好怎麼關掉。螢幕閱讀器在系統設定的無障礙（或稱協助工具、輔助使用）項目裡；開啟之後手勢全都變了，第一次很容易關不掉。多數手機可以設定一個快速開關它的捷徑，先把捷徑設好。',
          '用手機的瀏覽器開啟要測的頁面，再開啟螢幕閱讀器。',
          '從頁面的最上面開始，一路往右滑到最後一個元素。每停一次聽三件事：它叫什麼、它是什麼、它現在的狀態。順序和畫面一致嗎？有沒有唸出不該出現的東西，例如裝飾用的圖示，或被抽屜蓋住的頁面？',
          '把導覽方式切換成標題，再一個一個跳過去：只聽標題，聽得出這一頁的大綱嗎？',
          '不看螢幕，完成這一頁最主要的任務，例如把一份餐點加入購物車再送出訂單。',
          '打開每一個會出現的東西（抽屜、底部面板、對話框）：選取的位置有沒有跟進去？出得來嗎？關掉之後回到哪裡？',
          '每遇到一個問題就記一筆：在哪裡、聽到什麼、原本應該聽到什麼。',
        ] },
        { type: 'p', text: '拿下面的餐點頁練習。它用眼睛看、用手指點都沒有問題，請先在預覽裡操作一遍，再看它在瀏覽器裡的事實。' },
        { type: 'example', id: 'mob11-audit-page' },
        { type: 'p', text: '對這一頁執行腳本的第三步與第五步，紀錄大致會是下面這張表。每一筆都寫成「位置、聽到什麼、為什麼不行、怎麼修」，交給別人也看得懂：' },
        { type: 'table', head: ['位置', '聽到的或發生的事', '為什麼不行', '修法'], rows: [
          ['右上角的愛心', '通常只聽到「按鈕」', '沒有無障礙名稱：圖示寫了 `aria-hidden="true"`，按鈕裡沒有別的內容', '在 `<button>` 上加 `aria-label="收藏"`'],
          ['數量旁的加號、減號', '多半只唸出符號本身', '名稱沒有說出增加或減少的是什麼', '`aria-label="增加數量"`、`aria-label="減少數量"`'],
          ['加入購物車', '通常只唸出「加入購物車」，沒有說它是按鈕', '`<div>` 沒有按鈕的角色，也不能取得焦點', '換成原生的 `<button>`'],
          ['按下加入購物車之後', '什麼都沒聽到', '訊息出現在別處的 `<p>`，它不是即時區域', '把訊息寫進 `role="status"` 的元素'],
        ] },
        { type: 'p', text: '表裡的四個修法都是「語意 HTML 與 ARIA 的無障礙實作」那一課教過的：名稱寫在控制項上、先用原生元素、結果寫進即時區域。新的是找出它們的方法：這四個問題用眼睛都看不出來，照著腳本聽一遍，每一個都躲不掉。第一個練習會請你照著這樣的紀錄修正另一個頁面。' },
        { type: 'callout', tone: 'warning', title: '開著螢幕閱讀器，卻還是用眼睛操作', text: '初學者測試時常常眼睛盯著螢幕，用手指直接摸到想按的按鈕，點兩下，覺得「可以用」就結束了。這樣只測到按鈕按不按得下去：順序錯了、名稱聽不懂、結果沒有唸出來，全部測不到，因為你的眼睛已經替你補上了這些資訊。請用往右滑的方式一個一個走，並把視線移開螢幕；聽不懂的地方，就是要記下來的問題。' },
        { type: 'callout', tone: 'tip', title: '動手試：修好一筆，再聽一次', text: '按「動手改這個範例」，把 `<div id="add" class="btn">` 改成 `<button type="button" id="add" class="btn">`（結尾的標籤也要改），再替 `#msg` 加上 `role="status"`，然後執行。用手機開啟這一頁的話，可以試著開啟螢幕閱讀器，在預覽裡滑到這顆按鈕，聽聽看修改前後的差別。' },
      ],
    },
    {
      id: 'mob11-zoom-text-section', title: '縮放與文字大小：放大之後還能用嗎',
      blocks: [
        { type: 'p', text: '需要協助的人不一定用螢幕閱讀器。更多人只是需要大一點的字：把手機的字體調大、用兩指把頁面撥大，或把瀏覽器的頁面縮放調高。縮放與文字大小要顧到三件事。' },
        { type: 'p', text: '第一，不要擋住縮放。「viewport 與相對單位」那一課說過，viewport 設定裡的 `user-scalable=no` 與 `maximum-scale=1` 會讓使用者無法用兩指放大；「觸控目標與手勢的實作」那一課也提過，在 `body` 寫 `touch-action: none` 有同樣的後果。WCAG 對文字的要求是：不靠輔助科技，文字也要能放大到 200%，而且內容與功能都不受影響。' },
        { type: 'p', text: '第二，文字變大時版面要撐得住。手機的系統設定與瀏覽器大多有調整字體大小的選項；它們怎麼作用到網頁上，依平台與瀏覽器而不同，但結果是一樣的：字變大了，螢幕的寬度沒有變。一行放得下的字變少，原本一行的標題變成兩行、三行。撐得住的版面有三個習慣：' },
        { type: 'list', items: [
          '字級用 rem（「流體字級與 clamp()」那一課）。寫死 px 的字級，在會改變根字級的設定下不會跟著放大。',
          '裝文字的容器不寫死高度：用 `min-height` 代替 `height`，讓它跟著內容長高。',
          '讓文字換行，不要截斷。`white-space: nowrap` 加上 `text-overflow: ellipsis` 會把放不下的字變成「…」：使用者正是因為看不清楚才放大，結果反而讀不到。一排按鈕放不下時，用 `flex-wrap: wrap` 換到下一列。',
        ] },
        { type: 'p', text: '第三，畫面變窄時不要逼人左右捲動。WCAG 的重排（reflow）要求，用文字說是：內容在相當於 320 CSS 像素寬的畫面上，只靠上下捲動就能讀完與操作，不必同時左右捲動；地圖、資料表格這類本來就需要二維版面的內容除外。320 這個數字相當於 1280px 寬的視窗放大到 400%；小尺寸的手機，或把系統的顯示大小調大之後的手機，視窗也可能只有這麼寬。最常見的原因是寫死的寬度：`width: 340px` 在 360px 寬的手機上沒事，到了 320px 就超出去。' },
        { type: 'example', id: 'mob11-large-text' },
        { type: 'p', text: '預覽一開始是 320px 寬，而這一頁的根字級被寫成 24px，代替把文字放大成 1.5 倍的使用者。兩張卡片的字級都用 rem，所以字都變大了：標題從 20px 變成 30px，按鈕的最小高度從 44px 變成 66px。A 的 `width: 340px` 與 `height: 104px` 是在根字級 16px 時量好的，那時剛好放得下；現在按鈕下面的 24px 被 `overflow: hidden` 裁掉，標題被截成「…」，卡片的右緣還超出視窗 36px，整頁變成要左右捲動才看得完。B 沒有寫寬度，高度只寫 `min-height`，標題也沒有 `nowrap`：標題放不下就換行，卡片跟著長高，按鈕完整地留在裡面，右緣停在 304px。' },
        { type: 'callout', tone: 'warning', title: '寫死的高度，在自己的手機上永遠看不出問題', text: '`height: 104px` 配上 `overflow: hidden` 是最難發現的一種錯誤：在預設的字體大小下，內容剛好放得下，寫的人、測的人都看不到任何異狀；只有把文字放大的使用者會看到被切掉一截的按鈕。只要容器裡裝的是文字，就不要寫死高度；真的需要一個最小的高度，寫 `min-height`。' },
        { type: 'callout', tone: 'note', title: '預覽做不到的事，要到手機上測', text: '預覽改不了你手機的字體設定，也不能替你用兩指縮放。這一課用「把根字級寫成 24px」代替放大文字，用 320px 寬的預覽代替重排，練習的檢查也是這樣做的。自己的頁面寫完之後，請在手機上做三件事：把系統與瀏覽器的字體大小調到最大；用兩指把頁面放大到兩倍以上；找一支窄螢幕的手機，或把顯示大小調大。每一次都看：字有沒有變大、有沒有內容被裁掉或疊在一起、要不要左右捲動。' },
        { type: 'callout', tone: 'tip', title: '動手試：把 A 修成 B', text: '按「動手改這個範例」，把 `#fixed` 的 `width: 340px;` 刪掉，再把 `height: 104px` 改成 `min-height: 104px` 後執行：卡片不再超出視窗，按鈕也回到卡片裡，但標題仍然是一行加「…」。接著把 `#fixed .title` 那條規則整個刪掉，標題才會完整地換行顯示。' },
      ],
    },
    {
      id: 'mob11-orientation-section', title: '方向鎖定：不要替使用者決定手機怎麼拿',
      blocks: [
        { type: 'p', text: '方向鎖定（orientation lock）是指頁面只能在直向或橫向其中一種方向使用。這樣做的原因通常很單純：只設計了直向的版面，橫放時不好看，乾脆不給用。但有些人的手機或平板固定在輪椅或支架上，轉不了；也有人把文字放大之後，習慣橫著讀比較寬的一行。WCAG 的要求是：內容的顯示與操作不能被限制在單一的方向，除非那個方向是功能所必需的，例如模擬鋼琴鍵盤的頁面需要橫向。' },
        { type: 'p', text: '鎖住方向的做法不只一種，下面三種都算：' },
        { type: 'table', head: ['做法', '寫在哪裡', '說明'], rows: [
          ['橫放時把內容藏起來，只顯示「請把手機轉直」', 'CSS 的 `orientation` 媒體查詢', '網頁上最常見。頁面其實還在，只是被 `display: none` 藏起來，或被一塊提示蓋住'],
          ['安裝之後固定方向', 'Web App Manifest 的 `orientation` 成員', '「PWA 基礎：Manifest 與安裝」那一課的 manifest 還有一個當時沒有用到的成員：寫了 `"orientation": "portrait"`，安裝後的畫面就固定成直向；不是功能必需就不要寫'],
          ['用指令稿鎖定', '`screen.orientation.lock()`', '瀏覽器只在特定的情況下允許，這一課的預覽裡不能用；同樣是非必要不用'],
        ] },
        { type: 'example', id: 'mob11-orientation' },
        { type: 'p', text: '預覽一開始是 360px 寬，外送進度與「聯絡外送員」按鈕都在。按預覽上方的 640px：視窗變成橫向，整頁只剩一句「請把手機轉成直向」。展開預覽下方「瀏覽器建立的 DOM 樹」可以看到 `#app` 還在，是 style.css 最後那段 `@media (orientation: landscape)` 用 `display: none` 把它藏起來的。對手機轉不了的人來說，這一頁等於不存在：他看不到餐點什麼時候到，也聯絡不了外送員。' },
        { type: 'p', text: '按「動手改這個範例」，把整個 `@media` 區塊刪掉再執行，切到 640px：內容照常顯示，而且版面一點問題也沒有。多數頁面都是這樣，「橫放不能用」只是沒有試過。橫放後真正需要處理的是高度變少，例如把頁首縮矮、不讓操作列佔掉太多空間，這些是「安全區域、方向與動態視窗高度」那一課教過的調整。' },
        { type: 'callout', tone: 'warning', title: '一句「請旋轉裝置」不是替代方案', text: '有人以為只要畫面上有說明，使用者照做就好，所以不算鎖定。但這句話要求的正是有些人做不到的事：手機或平板橫著固定在支架上的人，看到的永遠是這句提示。該做的是讓頁面在兩個方向都能顯示與操作；版面可以不同，內容與功能不能少。' },
      ],
    },
    {
      id: 'mob11-touch-alternatives-section', title: '觸控替代：拖曳、多指與晃動都要有按鈕',
      blocks: [
        { type: 'p', text: '「觸控目標與手勢的實作」那一課替滑動刪除加了一顆刪除按鈕，「Pointer Events 與觸控事件」那一課替可以拖曳的滑桿補上了方向鍵。這個原則在 WCAG 裡分成三條要求，用文字說是：' },
        { type: 'list', items: [
          '需要沿著路徑移動（例如滑動）或用到多根手指（例如雙指開合）的手勢，必須也能用單一指標、不必沿著路徑的方式完成，例如點一下。',
          '用拖曳完成的操作，必須也能不拖曳、只用單一指標完成。',
          '靠晃動或傾斜裝置觸發的功能，必須也能用畫面上的控制項操作，而且要能把動作觸發關掉：手會抖的人可能誤觸，裝置固定住的人則根本晃不了。',
        ] },
        { type: 'p', text: '三條都有同一個例外：那個手勢或動作本身就是功能所必需的。對螢幕閱讀器的使用者來說，這些替代不是「比較方便」，而是「做不做得到」：螢幕閱讀器開著的時候，手指的滑動與拖曳多半被它拿去當導覽的手勢，通常到不了你的指令稿。觸控替代就是替每一個只靠手勢的操作，準備一個點一下就能完成的控制項：' },
        { type: 'table', head: ['只靠手勢的操作', '觸控替代'], rows: [
          ['拖曳一列來調整清單的順序', '每一列的「上移」「下移」按鈕'],
          ['雙指開合縮放地圖', '「放大」「縮小」兩顆按鈕'],
          ['拖曳滑桿', '可以點的加、減按鈕，或原生的 `<input type="range">`'],
          ['晃動手機來復原', '一顆「復原」按鈕'],
        ] },
        { type: 'example', id: 'mob11-reorder' },
        { type: 'p', text: '在預覽裡用滑鼠或手指按住第一列的 ≡，拖到第三列上放開：「海鹽薯條」移到最後。再按它那一列的 ▲：它往上移一列，清單下方出現「海鹽薯條現在是第 2 項，共 3 項」。（為了讓程式短一點，拖曳時那一列不會跟著手指移動，放開時才換位置。）script.js 有四個值得看的地方。' },
        { type: 'list', items: [
          '拖曳與按鈕呼叫的是同一個函式 `moveTo(item, index)`：它搬動那一列，並把結果寫進 `#status`。兩條路做的事完全一樣，不會出現「按鈕移了卻沒有訊息」的情況。',
          '放開時用 `document.elementFromPoint(event.clientX, event.clientY)` 找出手指底下的那一列，而不是看 `event.target`：手指的 `pointerup` 通常會發給它按下時的那個元素，也就是 ≡ 自己。',
          '按鈕的名稱用 `aria-label` 寫成「上移海鹽薯條」「下移海鹽薯條」：六顆按鈕各自說得出動作與對象。≡ 只能用指標拖，螢幕閱讀器的使用者用不到，所以寫了 `aria-hidden="true"`。',
          '`moveTo` 之後有一行 `button.focus()`。`insertBefore` 會把整列從清單拿出來再放回去，裡面的按鈕通常會因此失去焦點；把焦點還給它，使用者才能連續按好幾次。',
        ] },
        { type: 'p', text: '最後是狀態訊息。按鈕按下去之後，那一列在畫面上換了位置，看得到的人一眼就知道；螢幕閱讀器的使用者只聽得到他選取的那顆按鈕，而它的名稱沒有變。所以結果要寫進即時區域：`<p id="status" role="status">` 從一開始就在頁面裡，內容是空的，每次移動只改它的文字，螢幕閱讀器通常會在使用者手邊的事告一段落後把新的文字唸出來（`aria-live="polite"` 有同樣的效果）。「已加入購物車」「已刪除」「已儲存」這類不需要使用者馬上處理的結果，都適合這樣處理。' },
        { type: 'callout', tone: 'tip', title: '動手試：拿掉焦點那一行', text: '按「動手改這個範例」，把 `button.focus();` 那一行刪掉再執行。先點一下標題，按幾次 Tab 走到第二列的 ▲，按 Enter：那一列移上去了，但橘色的焦點外框不見了。焦點已經不在任何按鈕上，再按 Enter 也沒有反應，得重新找到那顆按鈕才能再移一次。對只能一步一步走的人來說，每移動一次就要重新找一次位置。' },
      ],
    },
    {
      id: 'mob11-fix-list-section', title: '把測試結果整理成必須修正的清單',
      blocks: [
        { type: 'p', text: '把前面幾節合起來，一個頁面在手機上的無障礙測試有六項。每一項都有明確的「不通過」，遇到就列進必須修正的清單：' },
        { type: 'table', head: ['測試', '怎麼做', '必須修正的情況'], rows: [
          ['螢幕閱讀器', '照第二節的腳本，滑過整頁並完成主要任務', '控制項沒有名稱或角色；順序和畫面不一致；選取的位置被困住或遺失；操作的結果沒有被說出來'],
          ['兩指縮放', '用兩指把頁面放大到兩倍以上', '放大不了'],
          ['文字大小', '把系統與瀏覽器的字體大小調到最大', '字沒有變大；文字被裁掉、截斷或疊在一起'],
          ['窄螢幕', '在 320px 寬的視窗看每一頁', '要左右捲動才讀得完'],
          ['方向', '把手機轉成橫向，再轉回來', '內容不見了，或畫面要求轉回去'],
          ['手勢', '列出頁面上每一個滑動、拖曳、雙指與晃動的操作', '沒有點一下就能完成的替代'],
        ] },
        { type: 'p', text: '清單要排順序。排最前面的是讓人完全做不了事的問題：按不到的「送出訂單」、鎖住的方向、放大不了的頁面、只能拖曳的排序。其次是做得了但會讓人弄錯的：順序錯亂、名稱聽不懂、結果沒有唸出來。每一筆照第二節的格式寫成「位置、發生的事、為什麼不行、修法」，修完之後用同一個步驟再測一次，確認真的修好了，而且沒有弄壞別的地方。' },
        { type: 'p', text: '自動化的檢查工具可以先替你找出一部分問題，例如沒有名稱的按鈕；但順序合不合理、名稱聽不聽得懂、訊息有沒有在對的時候被唸出來，工具判斷不了，仍然要靠這一課的方法親自測。要在哪些裝置上測、怎麼安排，是「行動裝置測試：模擬器與真機」那一課的主題。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob11-q1', prompt: '行動螢幕閱讀器開著的時候，使用者通常怎麼按下畫面上的「送出訂單」按鈕？',
      options: [
        '和平常一樣，直接在按鈕上點一下',
        '先用滑動或觸摸探索選到它，聽到名稱與角色之後，再點兩下',
        '在按鈕上長按，直到手機震動',
        '晃一下手機',
      ],
      answer: 1,
      explanation: '螢幕閱讀器開著時，點一下通常只是選取並唸出那個元素；使用者先用往右滑或觸摸探索找到按鈕，聽到「送出訂單，按鈕」，再點兩下啟動它。直接點一下不會按下按鈕。長按與晃動都不是啟動控制項的基本動作；確切的手勢依平台而不同，但「選取之後點兩下」是兩大平台共通的做法。',
    },
    {
      id: 'mob11-q2', prompt: '這一列在畫面上由左到右是「回上一步」「付款」。螢幕閱讀器的使用者從前一個元素往右滑，進到這一列時通常先聽到哪一顆？',
      code: { language: 'HTML', text: '<style>\n  .bar { display: flex; flex-direction: row-reverse; }\n</style>\n<div class="bar">\n  <button type="button">付款</button>\n  <button type="button">回上一步</button>\n</div>' },
      options: [
        '「回上一步」，因為它在畫面的左邊',
        '兩顆會被合在一起，唸成一個元素',
        '都聽不到：`row-reverse` 會把按鈕從無障礙樹拿掉',
        '「付款」，因為它在 HTML 裡寫在前面',
      ],
      answer: 3,
      explanation: '往右滑走訪元素的順序通常是 DOM 的順序，和 CSS 把元素畫在哪裡無關：`row-reverse` 只把畫面上的排列反過來，HTML 裡「付款」仍然在前面，所以先聽到它。畫面的左右位置只影響觸摸探索時手指摸到誰。`row-reverse` 不會合併元素，也不會把它們從無障礙樹拿掉。要讓兩種順序一致，就把 HTML 寫成要被讀到的順序。',
    },
    {
      id: 'mob11-q3', prompt: '測試紀錄寫著：「選到購物車圖示時，只聽到『按鈕』」。哪一個修法能讓它有名稱？',
      code: { language: 'HTML', text: '<button type="button" id="cart">\n  <svg aria-hidden="true" width="24" height="24">…</svg>\n</button>' },
      options: [
        '在 `<button>` 上加 `aria-label="購物車"`',
        '在那個 `<svg aria-hidden="true">` 上加 `aria-label="購物車"`',
        '把 `<button>` 換成 `<div role="button">`',
        '把圖示從 24px 放大成 44px',
      ],
      answer: 0,
      explanation: '名稱要寫在控制項本身：`<button aria-label="購物車">` 會被唸成「購物車，按鈕」。圖示有 `aria-hidden="true"`，整個從無障礙樹被拿掉，寫在它上面的 `aria-label` 也跟著消失。換成 `<div role="button">` 仍然沒有名稱，還少了原生按鈕的焦點與鍵盤操作。放大圖示改善的是觸控目標，和名稱無關。',
    },
    {
      id: 'mob11-q4', prompt: '關於 WCAG 對重排（reflow）的要求，哪一個說法正確？',
      options: [
        '頁面在任何寬度都不能出現捲軸，上下捲動也不行',
        '只要使用者左右捲動之後讀得完內容，就符合要求',
        '內容在相當於 320 CSS 像素寬的畫面上，不必同時上下與左右捲動就能閱讀與操作；地圖、資料表格等需要二維版面的內容除外',
        '頁面應該禁止縮放，版面才不會因為放大而跑掉',
      ],
      answer: 2,
      explanation: '重排的要求是：在相當於 320 CSS 像素寬的畫面上，內容只靠一個方向的捲動（通常是上下）就能讀完與操作，並把本來就需要二維版面的內容列為例外。上下捲動是正常的，要避免的是「還得左右捲」。左右捲動才讀得完正是不符合的情況。禁止縮放則違反了另一條要求：文字要能放大到 200%。',
    },
    {
      id: 'mob11-q5', prompt: '使用者把文字放大之後，這張卡片的標題變成兩行，下半截被裁掉了。哪一個修正最好？',
      code: { language: 'CSS', text: '.card { height: 72px; overflow: hidden; }\n.card h2 { margin: 0; font-size: 1.25rem; }' },
      options: [
        '把 `font-size` 改成 `20px`，讓標題不再跟著放大',
        '加上 `white-space: nowrap` 與 `text-overflow: ellipsis`，放不下的字用「…」代替',
        '在 viewport 設定加上 `maximum-scale=1`，不讓使用者放大',
        '把 `height: 72px` 改成 `min-height: 72px`，讓卡片跟著內容長高',
      ],
      answer: 3,
      explanation: '問題出在寫死的高度：內容變高了，容器不會跟著長。`min-height` 只規定下限，標題換成兩行時卡片就長高，什麼都不會被裁掉。把字級改成 px 是讓字不再回應使用者的設定，等於拒絕他的需求。截成「…」讓放大的人反而讀不到完整的標題。`maximum-scale=1` 擋的是兩指縮放，同樣是把需要放大的人擋在外面。',
    },
    {
      id: 'mob11-q6', prompt: '`#rotate` 的內容是「請把手機轉成直向」。這段樣式有什麼問題？',
      code: { language: 'CSS', text: '#rotate { display: none; }\n@media (orientation: landscape) {\n  main { display: none; }\n  #rotate { display: block; }\n}' },
      options: [
        '語法錯誤：`orientation` 不是有效的媒體特徵',
        '它把頁面鎖在直向：手機固定在支架上、轉不了的人完全用不了這個頁面',
        '沒有問題：只要有文字提示使用者旋轉裝置，就符合無障礙的要求',
        '它只會影響桌機，手機橫放時不會套用',
      ],
      answer: 1,
      explanation: '視窗橫向時 `main` 被藏起來，只剩一句提示：這就是方向鎖定。內容的顯示與操作不能被限制在單一方向，除非那個方向是功能所必需的；手機固定住的人看到的永遠是那句提示。`orientation` 是有效的媒體特徵，橫放的手機正好符合 `landscape`。有提示不代表可以鎖：提示要求的正是那些人做不到的事。',
    },
    {
      id: 'mob11-q7', prompt: '待辦清單只能「按住一列拖曳」來調整順序。哪一個觸控替代最合適？',
      options: [
        '改成長按一秒之後再拖曳',
        '改成在列上往左、往右滑動來移動',
        '保留拖曳，並在每一列加上名稱包含項目的「上移」「下移」按鈕',
        '在清單上方加一行說明：「拖曳可以調整順序」',
      ],
      answer: 2,
      explanation: '拖曳需要替代：不必拖曳、用單一指標點一下就能完成的控制項。每一列的「上移」「下移」按鈕用手指、鍵盤與螢幕閱讀器都能啟動，名稱裡有項目才分得出是哪一列的按鈕；拖曳可以留下來當捷徑。長按後再拖仍然是拖曳。左右滑動是另一種沿著路徑的手勢，螢幕閱讀器開著時通常到不了頁面。說明文字只解決了「不知道可以拖」，做不到拖曳的人還是排不了。',
    },
    {
      id: 'mob11-q8', prompt: '使用者按了「上移」，那一列在畫面上往上移了一格，但螢幕閱讀器什麼都沒說。哪一個做法最合適？',
      options: [
        '頁面一開始就放一個 `role="status"` 的空元素，每次移動後把「燈塔現在是第 1 項，共 3 項」寫進去',
        '每次移動後跳出一個要按「確定」才能關掉的對話框',
        '每次移動後把焦點移到頁面最上面的標題，讓使用者把整份清單重新聽一遍',
        '替整份清單加上 `aria-hidden="true"`，避免唸出過時的順序',
      ],
      answer: 0,
      explanation: '不需要使用者馬上處理的結果，寫進即時區域：`role="status"` 的元素從一開始就在頁面裡，之後只改它的文字，螢幕閱讀器通常會在不打斷使用者的情況下唸出來，焦點留在原來的按鈕上，可以接著再按。每次都跳對話框會打斷操作，移一格要多按一次。把焦點搬到頁面開頭，使用者得重新走回剛才的位置。`aria-hidden="true"` 會讓整份清單連同裡面的按鈕都讀不到，而那些按鈕仍然可以聚焦。',
    },
  ],
  webCode: {
    examples: [swipeOrder, auditPage, largeText, orientationLock, reorder],
    exercises: [exNames, exLargeText, exReorder, exOrientation],
  },
};
