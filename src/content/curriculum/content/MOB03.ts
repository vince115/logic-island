import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB03 touch targets and gestures (MOB-1). Targets big enough for a finger (WCAG 2.2: 24 × 24 CSS px minimum at AA
 * with exceptions, 44 × 44 enhanced at AAA: the only sizes attributed to a named guideline), made bigger with
 * min-width/min-height and padding (margin is not part of the target), a hit area enlarged without changing the look
 * (a transparent pseudo-element with a negative inset, or padding with a negative margin), neighbours whose enlarged
 * areas must not overlap, then gestures: screen edges belong to the system, touch-action says which gestures the
 * browser keeps, overscroll-behavior stops scroll chaining, and every gesture has a visible, tappable alternative.
 *
 * How the claims are checked. Sizes: `box` with op min. Where a tap lands: `hit` reads the centre of an element, so
 * the pages carry small red marker dots (`pointer-events: none`, so hit testing goes through them) at the points a
 * finger would land on; the check states which element is on top there (a pseudo-element reports its owner). Where a
 * fact is "this point does NOT reach the control", the page is built so that another element that does not contain the
 * control lies under the dot. touch-action and overscroll-behavior are compared as computed styles only: what they do
 * to a finger cannot be observed in a check or with a mouse, and the text says so and asks for a phone. The two pages
 * with a swipe carry a few lines of pointer code (pointerdown/pointerup), explained in one sentence: Pointer Events
 * are MOB04.
 */

const icon = (d: string) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="${d}"/></svg>`;
const HEART = icon('M12 21C5 15 3 12 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5c0 3.5-2 6.5-9 12.5z');
const SHARE = icon('M12 3l5 5h-4v7h-2V8H7zM5 14h2v5h10v-5h2v7H5z');
const PLUS = icon('M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z');
const CROSS = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#e0e0e0"/><path d="M8 8l8 8M16 8l-8 8" stroke="#212121" stroke-width="2"/></svg>';

// ---- examples ---------------------------------------------------------------------------------------------------
const threeButtons = `  <button type="button" aria-label="收藏">${HEART}</button>
  <button type="button" aria-label="分享">${SHARE}</button>
  <button type="button" aria-label="加入購物車">${PLUS}</button>`;

const sizes: WebExample = {
  id: 'mob03-sizes', title: '同樣三顆圖示按鈕：24px 貼在一起，與 44px 加上間距',
  description: '小島外送餐點頁的三顆圖示按鈕（收藏、分享、加入購物車）排了兩次，HTML 完全相同。橘色的方塊是按鈕的外框，也就是手指點得到的範圍；圖示都是 24 × 24。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: `<p>A：按鈕和圖示一樣大，彼此貼在一起</p>
<div class="row" id="small">
${threeButtons}
</div>
<p>B：圖示一樣大，按鈕至少 44 × 44，間距 8px</p>
<div class="row" id="large">
${threeButtons}
</div>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
p { margin: 16px 16px 8px; }
.row { display: flex; padding: 0 16px; }
.row button {
  padding: 0;
  border: 0;
  background-color: #ffcc80;
  outline: 1px solid #ef6c00;
  outline-offset: -1px;
}
.row svg { display: block; }

/* A：按鈕的外框就是圖示的大小 */
#small button { width: 24px; height: 24px; }

/* B：圖示還是 24px，按鈕至少 44 × 44，彼此相隔 8px */
#large { gap: 8px; }
#large button {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}`,
  },
  observe: [
    { check: 'box', selector: '#small button', measure: 'width', value: 24, label: 'A：按鈕的外框寬 24px，和圖示一樣大' },
    { check: 'box', selector: '#large button', measure: 'width', value: 44, op: 'min', label: 'B：按鈕的外框至少 44px 寬' },
    { check: 'box', selector: '#large button', measure: 'height', value: 44, op: 'min', label: 'B：按鈕的外框至少 44px 高' },
    { check: 'box', selector: '#large svg', measure: 'width', value: 24, label: 'B：按鈕裡的圖示仍然是 24px 寬，外觀沒有變' },
    { check: 'box', selector: '#large button:nth-child(1)', measure: 'right', value: -8, from: '#large button:nth-child(2)', label: 'B：第一顆按鈕的右緣在第二顆左緣的左邊 8px，兩個目標之間有 8px 的間距' },
  ],
};

const paddingMargin: WebExample = {
  id: 'mob03-padding-margin', title: '內距算進目標，外距不算；label 讓整列都能點',
  description: '兩個文字連結的文字區都是 200 × 20。A（`#pad`）四周加的是內距，B（`#mar`）加的是同樣大小的外距；橘色是連結的外框。下面的「加辣」是包在 `<label>` 裡的核取方塊。兩個紅點是記號：一個在 A 的文字上方，一個在 B 的文字上方。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: String.raw`<nav id="links" aria-label="快速連結">
  <a id="pad" href="/menu">A：看菜單（內距 12px）</a>
  <a id="mar" href="/orders">B：查訂單（外距 12px）</a>
</nav>
<label id="spicy-row">
  <input type="checkbox" id="spicy" name="spicy">
  <span id="spicy-text">加辣（點這一列的任何地方）</span>
</label>
<i class="dot" id="tap-pad"></i>
<i class="dot" id="tap-mar"></i>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
#links a {
  display: block;
  width: 200px;
  height: 20px;
  line-height: 20px;
  background-color: #ffcc80;
}
/* A：內距是外框的一部分，外框變成 232 × 44 */
#pad { padding: 12px 16px; }
/* B：外距在外框的外面，外框還是 200 × 20 */
#mar { margin: 12px 16px; }

#spicy-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 0 16px;
  background-color: #e3f2fd;
}

/* 紅點只是記號；pointer-events: none 讓點擊穿過它 */
.dot {
  position: absolute;
  left: 113px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #d32f2f;
  pointer-events: none;
}
#tap-pad { top: 3px; }
#tap-mar { top: 47px; }`,
  },
  observe: [
    { check: 'box', selector: '#pad', measure: 'height', value: 44, label: 'A 的外框高 44px：文字的 20px 加上、下各 12px 的內距' },
    { check: 'hit', selector: '#tap-pad', top: '#pad', label: 'A 的紅點在文字上方、內距的範圍裡：這個位置點到的是連結 A' },
    { check: 'box', selector: '#mar', measure: 'height', value: 20, label: 'B 的外框仍然只有 20px 高：外距不在外框裡，點在那圈空白上碰不到連結' },
    { do: 'click', selector: '#spicy-text' },
    { check: 'value', selector: '#spicy', value: true, label: '點「加辣」的文字，核取方塊就被勾選：`<label>` 把整列變成同一個目標' },
    { check: 'box', selector: '#spicy-row', measure: 'height', value: 48, op: 'min', label: '「加辣」這一列至少 48px 高' },
  ],
};

const hitArea: WebExample = {
  id: 'mob03-hit-area', title: '看起來一樣的兩個關閉連結：其中一個的點擊區域每邊多了 10px',
  description: '兩個標題列的右邊各有一個 24 × 24 的關閉連結，外觀與位置完全相同。A 的連結 `#close-a` 多了一個透明的偽元素，把點擊區域擴大成 44 × 44；B 的 `#close-b` 沒有。每一列的紅點都在 × 左邊 8px 的地方。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: `<div class="bar" id="bar-a">
  <span class="title" id="title-a">A：放大了點擊區域</span>
  <a class="close" id="close-a" href="/menu" aria-label="關閉購物車 A">${CROSS}</a>
  <i class="dot" id="tap-a"></i>
</div>
<div class="bar" id="bar-b">
  <span class="title" id="title-b">B：沒有放大</span>
  <a class="close" id="close-b" href="/menu" aria-label="關閉購物車 B">${CROSS}</a>
  <i class="dot" id="tap-b"></i>
</div>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
.bar {
  position: relative;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 16px;
  margin-bottom: 12px;
  background-color: #fff3e0;
}
.title { flex: 1; align-self: stretch; line-height: 56px; }
.close { display: block; width: 24px; height: 24px; }
.close svg { display: block; }

/* A 多了這兩條：外觀不變，點擊區域每一邊往外 10px */
#close-a { position: relative; }
#close-a::before {
  content: '';
  position: absolute;
  inset: -10px;
}

/* 紅點：× 左邊 8px 的地方；pointer-events: none 讓點擊穿過它 */
.dot {
  position: absolute;
  right: 45px;
  top: 25px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #d32f2f;
  pointer-events: none;
}`,
  },
  observe: [
    { check: 'box', selector: '#close-a', measure: 'width', value: 24, label: 'A 的關閉連結，外框仍然是 24px 寬：版面沒有變' },
    { check: 'style', selector: '#close-a', pseudo: '::before', property: 'top', value: '-10px', label: 'A 的 `::before` 從外框的上緣再往外 10px（`top` 計算後是 `-10px`）' },
    { check: 'hit', selector: '#tap-a', top: '#close-a', label: 'A 的紅點在 × 的外框之外 8px：這個位置點到的是 `#close-a`' },
    { check: 'box', selector: '#close-b', measure: 'width', value: 24, label: 'B 的關閉連結同樣是 24px 寬' },
    { check: 'hit', selector: '#tap-b', top: '#title-b', label: 'B 的紅點在同樣的位置：點到的是標題 `#title-b`，不是關閉連結' },
  ],
};

const pairButtons = (suffix: string) => `  <button type="button" id="fav-${suffix}" aria-label="收藏">${HEART}</button>
  <button type="button" id="share-${suffix}" aria-label="分享">${SHARE}</button>
  <i class="dot" id="tap-${suffix}"></i>`;

const overlap: WebExample = {
  id: 'mob03-overlap', title: '放大過頭：相鄰兩個目標的點擊區域疊在一起',
  description: '兩列各有「收藏」與「分享」兩顆 24px 的按鈕，都用 `::before` 放大點擊區域。為了看得見，這一頁故意把偽元素塗成半透明的藍色（平常是透明的）。C 列間距 8px、每邊往外 12px；D 列間距 24px、每邊往外 10px。兩列的紅點都在「收藏」的外框裡面、離右緣 2px。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: `<p>C：間距 8px，每邊往外 12px</p>
<div class="row" id="crowded">
${pairButtons('c')}
</div>
<p>D：間距 24px，每邊往外 10px</p>
<div class="row" id="spaced">
${pairButtons('d')}
</div>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
p { margin: 12px 16px 0; }
.row { position: relative; display: flex; padding: 20px 16px; }
.row button {
  position: relative;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background-color: #ffcc80;
}
.row svg { display: block; }
/* 放大的點擊區域：故意塗上半透明的藍色，平常是透明的 */
.row button::before {
  content: '';
  position: absolute;
  background-color: rgba(25, 118, 210, 0.2);
}

/* C：12 + 12 = 24，比間距 8px 大：兩個區域重疊 */
#crowded { gap: 8px; }
#crowded button::before { inset: -12px; }

/* D：10 + 10 = 20，比間距 24px 小：不重疊 */
#spaced { gap: 24px; }
#spaced button::before { inset: -10px; }

/* 紅點：在「收藏」的外框裡面，離右緣 2px */
.dot {
  position: absolute;
  left: 35px;
  top: 29px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #d32f2f;
  pointer-events: none;
}`,
  },
  observe: [
    { check: 'box', selector: '#fav-c', measure: 'right', value: -8, from: '#share-c', label: 'C：兩顆按鈕的外框之間只有 8px' },
    { check: 'hit', selector: '#tap-c', top: '#share-c', label: 'C：紅點明明在「收藏」的外框裡面，點到的卻是「分享」：它放大的區域蓋了過來，而且畫在上面' },
    { check: 'hit', selector: '#fav-c', top: '#fav-c', label: 'C：「收藏」的正中央仍然點得到自己，所以隨手點一下不會發現問題' },
    { check: 'box', selector: '#fav-d', measure: 'right', value: -24, from: '#share-d', label: 'D：兩顆按鈕的外框之間有 24px' },
    { check: 'hit', selector: '#tap-d', top: '#fav-d', label: 'D：同樣位置的紅點，點到的是「收藏」：兩個放大的區域沒有重疊' },
  ],
};

const SWIPE_JS = String.raw`const strip = document.querySelector('#strip');
const track = document.querySelector('#track');
const now = document.querySelector('#now');
let index = 0;
let startX = null;

function show(next) {
  index = Math.max(0, Math.min(2, next));
  track.style.transform = 'translateX(' + index * -100 + '%)';
  now.textContent = '第 ' + (index + 1) + ' 道，共 3 道';
}

// 替代操作：兩顆看得到的按鈕
document.querySelector('#prev').addEventListener('click', () => show(index - 1));
document.querySelector('#next').addEventListener('click', () => show(index + 1));

// 手勢：按住往左或往右滑超過 40px（指標事件，下一課說明）
strip.addEventListener('pointerdown', (event) => { startX = event.clientX; });
strip.addEventListener('pointerup', (event) => {
  if (startX === null) return;
  const moved = event.clientX - startX;
  if (moved < -40) show(index + 1);
  if (moved > 40) show(index - 1);
  startX = null;
});
strip.addEventListener('pointercancel', () => { startX = null; });`;

const gestures: WebExample = {
  id: 'mob03-gestures', title: '可以左右滑的推薦卡片、兩顆按鈕，和一塊會捲動的備註',
  description: '小島外送的「今日推薦」有三張卡片，一次顯示一張：在卡片上左右滑可以換卡片，按「上一道」「下一道」也可以。下面的「店家備註」是一塊自己會上下捲動的區域。style.css 裡有三個和手勢有關的宣告：`#strip` 的 `touch-action: pan-y`、按鈕的 `touch-action: manipulation`、`#notes` 的 `overscroll-behavior: contain`。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: String.raw`<h1>今日推薦</h1>
<div id="strip">
  <div id="track">
    <article class="card">海鹽薯條</article>
    <article class="card">椒麻雞飯</article>
    <article class="card">冬瓜檸檬</article>
  </div>
</div>
<div id="pager">
  <button type="button" id="prev">上一道</button>
  <span id="now">第 1 道，共 3 道</span>
  <button type="button" id="next">下一道</button>
</div>
<h2 id="notes-title">店家備註</h2>
<div id="notes" role="region" aria-labelledby="notes-title" tabindex="0">
  <p>每天上午十一點開始接單。</p>
  <p>薯條現炸，大約等八分鐘。</p>
  <p>椒麻雞飯可以選擇不辣。</p>
  <p>冬瓜檸檬固定微糖。</p>
  <p>外送範圍是島上的三個村子。</p>
  <p>下雨天送達時間會晚一點。</p>
</div>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
h1, h2 { margin: 12px 16px; font-size: 18px; }

/* 左右滑交給指令稿；上下滑仍然由瀏覽器捲動頁面 */
#strip { overflow: hidden; touch-action: pan-y; }
#track { display: flex; }
.card {
  flex: none;
  width: 100%;
  height: 120px;
  line-height: 120px;
  text-align: center;
  background-color: #ffcc80;
}

#pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
}
/* 連按兩下不會被當成「點兩下放大」 */
#pager button { min-width: 88px; min-height: 44px; touch-action: manipulation; }

/* 捲到盡頭就停住，不帶著後面的頁面一起捲 */
#notes {
  height: 120px;
  margin: 0 16px;
  padding: 0 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background-color: #e3f2fd;
}`,
    js: SWIPE_JS,
  },
  observe: [
    { check: 'style', selector: '#strip', property: 'touch-action', value: 'pan-y', label: '`#strip` 的 `touch-action` 計算後是 `pan-y`：上下捲動留給瀏覽器，其餘交給指令稿' },
    { check: 'style', selector: '#next', property: 'touch-action', value: 'manipulation', label: '「下一道」按鈕的 `touch-action` 是 `manipulation`' },
    { check: 'style', selector: '#notes', property: 'overscroll-behavior-y', value: 'contain', label: '`#notes` 的 `overscroll-behavior-y` 是 `contain`' },
    { do: 'pointer', selector: '#strip', type: 'down', x: 300, y: 60, pointerType: 'touch' },
    { do: 'pointer', selector: '#strip', type: 'up', x: 100, y: 60, pointerType: 'touch' },
    { check: 'text', selector: '#now', text: '第 2 道，共 3 道', label: '手勢：手指在卡片上按下、往左移 200px 後放開，換到第 2 道' },
    { do: 'click', selector: '#prev' },
    { check: 'text', selector: '#now', text: '第 1 道，共 3 道', label: '替代操作：不滑動，點一下「上一道」也能回到第 1 道' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const ICONS_BASE_CSS = String.raw`body { margin: 0; font-family: sans-serif; }
#top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
}
h1 { margin: 0; font-size: 20px; }
`;
const ICONS_SVG_RULE = String.raw`/* 圖示固定 24 × 24：這一條請保留 */
.icon-btn svg { display: block; width: 24px; height: 24px; }
`;
const iconsCss = (actions: string, button: string, svgRule = ICONS_SVG_RULE) => ICONS_BASE_CSS + svgRule + String.raw`
#actions {
  display: flex;
` + actions + String.raw`}
.icon-btn {
` + button + String.raw`  padding: 0;
  border: 0;
  background-color: #ffcc80;
}
`;

const exIcons: WebExercise = {
  id: 'mob03-ex-icon-buttons', title: '三顆圖示按鈕：目標做到 44 × 44，圖示維持 24px',
  statement: 'index.html 不能改。小島外送餐點頁的標題旁有三顆圖示按鈕：收藏 `#like`、分享 `#share`、加入購物車 `#add`。現在每顆按鈕的外框只有 24 × 24，而且貼在一起，用手指很容易按錯。請修改 style.css：三顆按鈕的外框都要至少 44 × 44，相鄰兩顆的外框之間至少相隔 8px；按鈕裡的圖示（`svg`）要維持 24 × 24，不要跟著放大。檢查在 360px 寬的視窗進行：量 `#like` 與 `#add` 的外框、相鄰按鈕之間的距離，以及 `#like` 裡圖示的寬度。',
  hints: [
    '目標的大小是按鈕外框的大小，不是圖示的大小。看 `.icon-btn` 這條規則：是哪兩行把外框限制在 24px？',
    '把固定的 `width`、`height` 換成 `min-width: 44px` 與 `min-height: 44px`。再用 `display: inline-flex`、`align-items: center`、`justify-content: center` 讓 24px 的圖示留在按鈕的正中央。',
    '間距寫在容器上：`#actions` 已經是 flex 容器，替它加一行 `gap: 8px;`。',
  ],
  explanation: '觸控目標是按鈕的外框，圖示只是畫在裡面的內容。`min-width: 44px` 與 `min-height: 44px` 只規定下限：外框至少 44 × 44，內容更大時還能再長大。`.icon-btn svg` 那條規則沒有動，圖示仍然是 24 × 24；`display: inline-flex` 加上兩個置中，讓它留在外框的正中央，所以看起來只是圖示周圍多了一圈可以點的範圍。`#actions` 的 `gap: 8px` 在相鄰的外框之間留下 8px，手指稍微偏一點也不會落在隔壁的按鈕上。把 `width`、`height` 直接改成 44px（或更大），或拿掉它們改用 `padding: 10px`，再用外距隔開，同樣可以通過。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  fixed: { html: `<header id="top">
  <h1>海鹽薯條</h1>
  <div id="actions">
    <button type="button" class="icon-btn" id="like" aria-label="收藏">${HEART}</button>
    <button type="button" class="icon-btn" id="share" aria-label="分享">${SHARE}</button>
    <button type="button" class="icon-btn" id="add" aria-label="加入購物車">${PLUS}</button>
  </div>
</header>
<p>現炸的粗薯條，撒上島上自己曬的海鹽。</p>` },
  starter: { css: iconsCss('', String.raw`  width: 24px;
  height: 24px;
`) },
  solution: { css: iconsCss(String.raw`  gap: 8px;
`, String.raw`  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`) },
  steps: [
    { check: 'box', selector: '#like', measure: 'width', value: 44, op: 'min', label: '「收藏」按鈕 `#like` 的外框至少 44px 寬' },
    { check: 'box', selector: '#like', measure: 'height', value: 44, op: 'min', label: '`#like` 的外框至少 44px 高' },
    { check: 'box', selector: '#add', measure: 'width', value: 44, op: 'min', label: '最後一顆「加入購物車」`#add` 的外框也至少 44px 寬' },
    { check: 'box', selector: '#like', measure: 'right', value: -8, op: 'max', from: '#share', label: '`#like` 的右緣和 `#share` 的左緣至少相隔 8px' },
    { check: 'box', selector: '#share', measure: 'right', value: -8, op: 'max', from: '#add', label: '`#share` 的右緣和 `#add` 的左緣至少相隔 8px' },
    { check: 'box', selector: '#like svg', measure: 'width', value: 24, label: '`#like` 裡的圖示仍然是 24px 寬' },
  ],
  mistakes: [
    { files: { css: iconsCss(String.raw`  gap: 8px;
`, String.raw`  width: 24px;
  height: 24px;
`).replace('  padding: 0;\n  border: 0;', '  padding: 10px;\n  border: 0;') }, why: '加了 `padding: 10px`，卻沒有拿掉 `width: 24px` 與 `height: 24px`。`<button>` 預設是 `box-sizing: border-box`，24px 的寬度已經包含內距：外框仍然是 24 × 24，內距只是往裡面擠，圖示反而溢出按鈕。要嘛拿掉固定的寬高，要嘛改用 `min-width`、`min-height`。' },
    { files: { css: iconsCss('', String.raw`  width: 24px;
  height: 24px;
  margin: 10px;
`) }, why: '用 `margin: 10px` 把按鈕隔開。按鈕之間的確多了空白，看起來比較不擠，但外距在外框的外面，點在空白上沒有任何反應：每顆按鈕點得到的還是只有 24 × 24。' },
    { files: { css: iconsCss(String.raw`  gap: 8px;
`, String.raw`  width: 44px;
  height: 44px;
`, String.raw`/* 圖示固定 24 × 24：這一條請保留 */
.icon-btn svg { display: block; width: 44px; height: 44px; }
`) }, why: '把圖示也一起放大成 44 × 44。目標是夠大了，但外觀也變了：題目要的是圖示維持 24px，只讓可以點的範圍變大。目標的大小由按鈕的外框決定，不需要動圖示。' },
  ],
};

const CLOSE_BASE_CSS = String.raw`body { margin: 0; font-family: sans-serif; }
/* 版面：以下到紅點為止請保留 */
#bar {
  position: relative;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 16px;
  background-color: #fff3e0;
}
#title { flex: 1; margin: 0; font-size: 18px; }
#clear { width: 64px; height: 44px; margin-right: 20px; }
#close svg { display: block; }
.dot {
  position: absolute;
  top: 25px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #d32f2f;
  pointer-events: none;
}
#tap-left { right: 45px; }
#tap-below { right: 25px; top: 45px; }
#tap-clear { right: 60px; }

/* 關閉連結：外框 24 × 24。請在這裡擴大它的點擊區域 */
`;
const closeCss = (rules: string) => CLOSE_BASE_CSS + rules;
const CLOSE_PLAIN = String.raw`#close {
  display: block;
  width: 24px;
  height: 24px;
}
`;

const exClose: WebExercise = {
  id: 'mob03-ex-close-hit-area', title: '關閉連結：外觀不動，點擊區域擴大到 44 × 44',
  statement: 'index.html 不能改。購物車的標題列 `#bar` 右邊有「清空」按鈕 `#clear` 與關閉連結 `#close`。`#close` 的外觀只有 24 × 24，和 `#clear` 之間留著 20px 的空白。設計要求外觀與版面都不能變：× 的圖示維持在原位，「清空」也不能被推開。請修改 style.css，把 `#close` 的點擊區域向上、下、左、右各擴大至少 10px。頁面上有三個紅點當記號（它們寫了 `pointer-events: none`，點擊會穿過去）：`#tap-left` 在 × 的左邊 8px，`#tap-below` 在 × 的下方 8px，這兩個位置點到的都必須是 `#close`；`#tap-clear` 在「清空」按鈕裡面、離它的右緣 3px，這裡點到的必須仍然是 `#clear`。用偽元素，或用內距加上負的外距，都可以。',
  hints: [
    '直接加 `padding` 會讓 `#close` 的外框變大，把 × 和「清空」往左推。需要的是一塊「不佔版面」的透明區域：絕對定位的元素不佔版面。',
    '替 `#close` 加一個偽元素 `#close::before`，寫 `position: absolute` 與 `inset: -10px`。偽元素要有 `content` 才會出現；絕對定位要有一個定位基準，否則它會以更外層的 `#bar` 為準。',
    '兩條規則：`#close` 多一行 `position: relative;`；`#close::before { content: \'\'; position: absolute; inset: -10px; }`。',
  ],
  explanation: '`#close::before` 是 `#close` 的一部分：點到偽元素，就是點到 `#close`。`content: \'\'` 讓它存在；`position: absolute` 讓它離開一般排版流，不佔版面，所以 × 與「清空」都留在原位；`#close` 自己的 `position: relative` 讓偽元素以 `#close` 的外框為基準，`inset: -10px` 表示四邊各往外 10px，點擊區域變成 44 × 44。它的左緣離「清空」的右緣還有 10px，兩個目標沒有重疊。另一種寫法是 `#close { padding: 10px; margin: -10px; }`：外框真的變成 44 × 44，負的外距把多出來的部分抵銷，周圍同樣不會移動；這個寫法只適合沒有背景與邊框的元素。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  fixed: { html: `<div id="bar">
  <h1 id="title">購物車</h1>
  <button type="button" id="clear">清空</button>
  <a id="close" href="/menu" aria-label="關閉購物車">${CROSS}</a>
  <i class="dot" id="tap-left"></i>
  <i class="dot" id="tap-below"></i>
  <i class="dot" id="tap-clear"></i>
</div>
<p>海鹽薯條 × 1、冬瓜檸檬 × 2</p>` },
  starter: { css: closeCss(CLOSE_PLAIN) },
  solution: { css: closeCss(String.raw`#close {
  display: block;
  width: 24px;
  height: 24px;
  position: relative;
}
#close::before {
  content: '';
  position: absolute;
  inset: -10px;
}
`) },
  steps: [
    { check: 'box', selector: '#close svg', measure: 'left', value: 320, label: '× 的圖示沒有移動：左緣仍然在離頁面左邊 320px 的地方' },
    { check: 'box', selector: '#clear', measure: 'left', value: 236, label: '「清空」按鈕沒有被推開：左緣仍然在 236px' },
    { check: 'hit', selector: '#tap-left', top: '#close', label: '× 左邊 8px 的紅點 `#tap-left`：這個位置點到的是 `#close`' },
    { check: 'hit', selector: '#tap-below', top: '#close', label: '× 下方 8px 的紅點 `#tap-below`：這個位置點到的也是 `#close`' },
    { check: 'hit', selector: '#tap-clear', top: '#clear', label: '「清空」按鈕裡靠右緣的紅點 `#tap-clear`：這個位置點到的仍然是 `#clear`' },
  ],
  mistakes: [
    { files: { css: closeCss(String.raw`#close {
  display: block;
  width: 24px;
  height: 24px;
  padding: 10px;
}
`) }, why: '直接替 `#close` 加 `padding: 10px`。點擊區域是變大了，但外框也變成 44 × 44：× 往左移了 10px，「清空」也跟著被推開，版面變了。要不佔版面，就用絕對定位的偽元素，或再加上 `margin: -10px` 把多出來的外框抵銷。' },
    { files: { css: closeCss(String.raw`#close {
  display: block;
  width: 24px;
  height: 24px;
  position: relative;
}
#close::before {
  position: absolute;
  inset: -10px;
}
`) }, why: '少了 `content: \'\'`。`::before` 與 `::after` 沒有 `content` 就不會產生，後面寫的定位與 `inset` 全部沒有對象：點擊區域還是原本的 24 × 24。' },
    { files: { css: closeCss(String.raw`#close {
  display: block;
  width: 24px;
  height: 24px;
}
#close::before {
  content: '';
  position: absolute;
  inset: -10px;
}
`) }, why: '少了 `#close` 的 `position: relative`。絕對定位的偽元素會以最近的定位祖先為基準，這裡是 `#bar`：透明的偽元素蓋住整個標題列，點「清空」、點標題，全部變成關閉購物車。' },
  ],
};

const DEALS_HTML = String.raw`<h1>今日套餐</h1>
<div id="strip">
  <div id="track">
    <article class="card">A 餐：薯條加冬瓜檸檬</article>
    <article class="card">B 餐：椒麻雞飯加湯</article>
    <article class="card">C 餐：雙人分享餐</article>
  </div>
</div>
<div id="pager">
  <button type="button" id="prev">上一個</button>
  <span id="now">第 1 道，共 3 道</span>
  <button type="button" id="next">下一個</button>
</div>
<h2 id="terms-title">訂購須知</h2>
<div id="terms" role="region" aria-labelledby="terms-title" tabindex="0">
  <p>套餐內容不能更換。</p>
  <p>每筆訂單最多五份套餐。</p>
  <p>送出後三分鐘內可以取消。</p>
  <p>超過三分鐘請直接聯絡店家。</p>
  <p>餐點送達時請當面確認。</p>
  <p>下雨天送達時間會晚一點。</p>
</div>`;
const dealsCss = (body: string, strip: string, buttons: string, terms: string) => String.raw`body { margin: 0; font-family: sans-serif; }
` + body + String.raw`h1, h2 { margin: 12px 16px; font-size: 18px; }

#strip {
  overflow: hidden;
` + strip + String.raw`}
#track { display: flex; }
.card {
  flex: none;
  width: 100%;
  height: 120px;
  line-height: 120px;
  text-align: center;
  background-color: #ffcc80;
}

#pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
}
#pager button {
  min-width: 88px;
  min-height: 44px;
` + buttons + String.raw`}

#terms {
  height: 120px;
  margin: 0 16px;
  padding: 0 12px;
  overflow-y: auto;
  background-color: #e3f2fd;
` + terms + String.raw`}
`;
const DEALS_OLD_BODY = String.raw`/* 上一位開發者加的：不讓瀏覽器搶走左右滑的手勢 */
body { touch-action: none; }
`;

const exGestures: WebExercise = {
  id: 'mob03-ex-touch-action', title: '把鎖死整頁的手勢設定，改成各管各的三個宣告',
  statement: 'index.html 與 script.js 不能改。小島外送的「今日套餐」可以在卡片 `#strip` 上左右滑來換套餐（由 script.js 處理），也可以按 `#prev`、`#next`；下面的「訂購須知」`#terms` 是一塊自己會上下捲動的區域。上一位開發者為了不讓瀏覽器搶走左右滑，在 `body` 寫了 `touch-action: none`，結果在手機上整頁都不能用手指捲動，也不能縮放。請修改 style.css：(1) 拿掉 `body` 上的這個限制；(2) 只在 `#strip` 上限制：上下滑要留給瀏覽器捲動頁面，左右滑交給指令稿；(3) `#prev` 與 `#next` 被連按時不要觸發「點兩下放大」，但從按鈕上開始的捲動與雙指縮放要照常；(4) `#terms` 捲到盡頭時，不要帶著後面的頁面一起捲。檢查讀的是這些元素計算後的 `touch-action` 與 `overscroll-behavior-y`；這幾個宣告管的是手指的操作，在桌機上用滑鼠無法確認它們的效果；寫完之後請用手機開啟這一頁，在預覽裡用手指試。',
  hints: [
    '`touch-action` 的值寫的是「哪些手勢留給瀏覽器」。`body` 上的 `none` 表示什麼都不留，而且祖先的限制會算進頁面上每一個元素：先把那一條規則刪掉。',
    '卡片上要留給瀏覽器的是上下捲動：`pan-y`。按鈕要留下捲動與雙指縮放、只去掉點兩下放大：`manipulation`。',
    '捲到盡頭不往外傳，是 `overscroll-behavior: contain`，要寫在會捲動的那個元素 `#terms` 上。',
  ],
  explanation: '`touch-action` 列出的是瀏覽器可以自己處理的手勢，沒列出的才交給指令稿。`#strip` 寫 `pan-y`：手指從卡片上開始上下滑，瀏覽器照常捲動頁面；左右滑不在清單裡，瀏覽器不處理，script.js 才收得到完整的滑動。按鈕寫 `manipulation`：捲動與雙指縮放都保留，只是不做點兩下放大，連按「下一個」不會突然放大畫面。`body` 上的 `none` 必須拿掉：瀏覽器會把祖先的限制一起算，寫在 `body` 等於整頁每個位置都不能捲、不能縮放。`#terms` 的 `overscroll-behavior: contain` 讓這塊區域捲到盡頭就停住，不把剩下的捲動交給外層的頁面。限制只寫在需要的元件上，而且寫最小的那一個。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  fixed: { html: DEALS_HTML, js: SWIPE_JS },
  starter: { css: dealsCss(DEALS_OLD_BODY, '', '', '') },
  solution: { css: dealsCss('', '  touch-action: pan-y;\n', '  touch-action: manipulation;\n', '  overscroll-behavior: contain;\n') },
  steps: [
    { check: 'style', selector: 'body', property: 'touch-action', value: ['auto', 'manipulation'], label: '`body` 不再禁止捲動與縮放（`touch-action` 計算後是 `auto`，或只去掉點兩下放大的 `manipulation`）' },
    { check: 'style', selector: '#strip', property: 'touch-action', value: ['pan-y', 'pan-y pinch-zoom'], label: '`#strip`：上下捲動留給瀏覽器，左右滑交給指令稿' },
    { check: 'style', selector: '#prev', property: 'touch-action', value: 'manipulation', label: '`#prev`：保留捲動與雙指縮放，不做點兩下放大' },
    { check: 'style', selector: '#next', property: 'touch-action', value: 'manipulation', label: '`#next` 也一樣' },
    { check: 'style', selector: '#terms', property: 'overscroll-behavior-y', value: ['contain', 'none'], label: '`#terms` 捲到上下盡頭時，不把捲動交給外層的頁面' },
  ],
  mistakes: [
    { files: { css: dealsCss('', '  touch-action: pan-x;\n', '  touch-action: manipulation;\n', '  overscroll-behavior: contain;\n') }, why: '在 `#strip` 寫成 `touch-action: pan-x`，以為值是「我要處理的方向」。意思正好相反：`pan-x` 是把左右滑留給瀏覽器，指令稿收不到完整的左右滑；上下滑反而不捲動頁面了。自己處理左右滑的元件要寫 `pan-y`。' },
    { files: { css: dealsCss('', '  touch-action: none;\n', '  touch-action: manipulation;\n', '  overscroll-behavior: contain;\n') }, why: '把 `none` 從 `body` 搬到 `#strip`。左右滑沒問題，但手指只要從卡片上開始往上滑，頁面就不會捲；卡片佔了畫面的一大塊，使用者會覺得頁面卡住了。這個元件只需要自己處理左右方向，上下要留給瀏覽器。' },
    { files: { css: dealsCss(String.raw`body { overscroll-behavior: contain; }
`, '  touch-action: pan-y;\n', '  touch-action: manipulation;\n', '') }, why: '把 `overscroll-behavior: contain` 寫在 `body` 上。這個屬性不會繼承，`#terms` 自己仍然是預設的 `auto`：它捲到盡頭時，剩下的捲動照樣交給外層。要寫在會捲動的那個元素上。' },
  ],
};

const CART_CSS = String.raw`body { margin: 0; font-family: sans-serif; }
h1 { margin: 12px 16px; font-size: 20px; }
#cart { margin: 0; padding: 0; list-style: none; }
#cart li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid #e0e0e0;
  touch-action: pan-y;
}
.delete { min-width: 44px; min-height: 44px; padding: 0 12px; }
p { margin: 12px 16px; }`;
const DISHES = ['海鹽薯條', '椒麻雞飯', '冬瓜檸檬'];
const cartHtml = (button: (dish: string) => string) => `<h1>購物車</h1>
<ul id="cart">
${DISHES.map(dish => `  <li><span class="name">${dish}</span>${button(dish)}</li>`).join('\n')}
</ul>
<p id="count">購物車有 3 項</p>
<p>在一列上往左滑，可以刪除那一項。</p>`;
const CART_JS_HEAD = String.raw`const list = document.querySelector('#cart');
const count = document.querySelector('#count');

function removeRow(row) {
  row.remove();
  count.textContent = '購物車有 ' + list.children.length + ' 項';
}

// 手勢：按住一列往左滑超過 80px 就刪除（指標事件，下一課說明）。這一段不用改
let startX = null;
list.addEventListener('pointerdown', (event) => { startX = event.clientX; });
list.addEventListener('pointerup', (event) => {
  const row = event.target.closest('li');
  if (row && startX !== null && startX - event.clientX > 80) removeRow(row);
  startX = null;
});

// 替代操作：點「刪除」按鈕也要能刪除那一列。請寫在下面
`;
const CART_JS_CLICK = String.raw`list.addEventListener('click', (event) => {
  const button = event.target.closest('.delete');
  if (button) removeRow(button.closest('li'));
});
`;
const realButton = (dish: string) => `<button type="button" class="delete" aria-label="刪除${dish}">刪除</button>`;

const exDelete: WebExercise = {
  id: 'mob03-ex-delete-button', title: '滑動刪除之外：替每一列加上看得到的刪除按鈕',
  statement: 'style.css 不能改。小島外送的購物車 `#cart` 有三列，目前只能用「在一列上往左滑」刪除，畫面上沒有任何看得到的刪除方法。請替這個手勢加上替代操作。index.html：在每個 `<li>` 裡、品名 `<span class="name">` 的後面，加一顆 `class` 是 `delete` 的按鈕；它必須是真正的按鈕（鍵盤可以操作），而且無障礙名稱要同時說出動作與對象，也就是包含「刪除」與那一列的品名（例如「刪除海鹽薯條」）；品名的 `<span class="name">` 請保留。script.js：點擊（或在按鈕上按 Enter）刪除按鈕時，刪除它所在的那一列，並讓 `#count` 的文字跟著更新（已經寫好的 `removeRow(row)` 會做這兩件事）；原本的滑動刪除要保留。檢查會點第二列的按鈕、在第一列的按鈕上按 Enter，最後在剩下的那一列用手指往左滑。',
  hints: [
    '按鈕用 `<button type="button" class="delete">`：原生的按鈕本來就能聚焦，也能用 Enter 與空白鍵啟動。三顆按鈕上都只寫「刪除」的話，使用螢幕閱讀器的人分不出哪一顆刪哪一項。',
    '名稱可以用 `aria-label` 寫完整，例如 `aria-label="刪除海鹽薯條"`，按鈕上看得到的文字仍然是「刪除」。指令稿不必替每顆按鈕各登記一次：在 `list` 上登記一個 `click` 監聽器（事件委派）。',
    '監聽器裡用 `event.target.closest(\'.delete\')` 找出被點的按鈕；找得到，就呼叫 `removeRow(button.closest(\'li\'))`。',
  ],
  explanation: '滑動是看不見的捷徑，按鈕才是每個人都找得到、做得到的操作：`<button>` 可以用手指點、用滑鼠點、用鍵盤的 Enter 與空白鍵啟動，螢幕閱讀器也會把它讀成按鈕。`aria-label="刪除海鹽薯條"` 讓名稱說出刪的是哪一項，而且包含了看得到的文字「刪除」。指令稿在清單上登記一個 `click` 監聽器，用 `closest(\'.delete\')` 判斷點到的是不是刪除按鈕，再把它所在的 `<li>` 交給 `removeRow`：按鈕和手勢呼叫同一個函式，所以兩條路做的事完全一樣，`#count` 也都會更新。在按鈕上按下再放開，手指幾乎沒有移動，滑動的那一段判斷不會成立，兩者不會互相干擾。style.css 已經替 `.delete` 設了至少 44 × 44 的外框，並替每一列寫了 `touch-action: pan-y`：上下捲動留給瀏覽器，左右滑才交給指令稿。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  fixed: { css: CART_CSS },
  starter: { html: cartHtml(() => ''), js: CART_JS_HEAD },
  solution: { html: cartHtml(realButton), js: CART_JS_HEAD + CART_JS_CLICK },
  steps: [
    { check: 'role', selector: '#cart li:nth-child(1) .delete', role: 'button', label: '第一列有一個 `class` 是 `delete` 的元素，它的角色是按鈕' },
    { check: 'name', selector: '#cart li:nth-child(1) .delete', text: '刪除', match: 'includes', label: '它的無障礙名稱裡有「刪除」' },
    { check: 'name', selector: '#cart li:nth-child(3) .delete', text: '冬瓜檸檬', match: 'includes', label: '名稱說得出刪的是哪一項：第三列按鈕的名稱裡有「冬瓜檸檬」' },
    { do: 'click', selector: '#cart li:nth-child(2) .delete' },
    { check: 'text', selector: '#count', text: '購物車有 2 項', label: '點第二列的刪除按鈕：少了一列，`#count` 變成「購物車有 2 項」' },
    { do: 'key', selector: '#cart li:nth-child(1) .delete', key: 'Enter' },
    { check: 'text', selector: '#cart .name', text: '冬瓜檸檬', label: '在第一列的刪除按鈕上按 Enter：第一列也被刪除，剩下的第一項是「冬瓜檸檬」' },
    { do: 'pointer', selector: '#cart li', type: 'down', x: 300, y: 28, pointerType: 'touch' },
    { do: 'pointer', selector: '#cart li', type: 'up', x: 100, y: 28, pointerType: 'touch' },
    { check: 'count', selector: '#cart li', count: 0, label: '原本的手勢還在：在剩下的那一列按下、往左移 200px 後放開，它也被刪除' },
  ],
  mistakes: [
    { files: { html: cartHtml(dish => `<span class="delete" aria-label="刪除${dish}">刪除</span>`), js: CART_JS_HEAD + CART_JS_CLICK }, why: '用 `<span class="delete">` 當按鈕。用手指或滑鼠點它的確會刪除，但它不能聚焦，按 Enter 沒有反應，螢幕閱讀器也不會說它是按鈕：替代操作反而只有一部分的人能用。請用原生的 `<button>`。' },
    { files: { html: cartHtml(() => '<button type="button" class="delete">×</button>'), js: CART_JS_HEAD + CART_JS_CLICK }, why: '按鈕上只有一個「×」。它的無障礙名稱就是「×」：沒有說這顆按鈕會刪除，也沒有說刪的是哪一項，三顆按鈕聽起來一模一樣。用看得到的文字或 `aria-label` 寫出「刪除」加上品名。' },
    { files: { html: cartHtml(realButton), js: CART_JS_HEAD + String.raw`list.addEventListener('click', (event) => {
  const button = event.target.closest('.delete');
  if (button) button.closest('li').remove();
});
` }, why: '按鈕寫對了，點擊時卻直接呼叫 `remove()`，沒有經過 `removeRow`。那一列消失了，但 `#count` 仍然寫著「購物車有 3 項」：按鈕和手勢做的事不一樣。替代操作要和手勢呼叫同一個函式。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const MOB03: LessonContent = {
  lessonId: 'MOB03',
  motivation: '滑鼠游標的尖端只有一個點，手指按下去卻是一片：在桌機上點得很準的 24px 圖示，到了手機上常常點不到，或是點到隔壁。這一課把觸控目標做到夠大，在不改變外觀的前提下擴大點擊區域，讓相鄰的目標不會互相搶走點擊；再處理手勢：不和系統手勢搶螢幕的邊緣，用 `touch-action` 告訴瀏覽器哪些手勢留給它，並替每一個手勢準備一顆看得到的按鈕。',
  sections: [
    {
      id: 'mob03-target-size-section', title: '手指不是游標：觸控目標尺寸',
      blocks: [
        { type: 'p', text: '觸控目標（touch target）是畫面上可以用手指操作的元素實際會回應的那一塊範圍：一個連結、一顆按鈕、一個核取方塊。用滑鼠的時候，游標的尖端是一個點，你看得到它停在哪裡，24px 的圖示綽綽有餘。觸控（touch）不一樣：指腹貼上螢幕的是一片而不是一個點，手指本身還會擋住正要點的東西；再加上「行動情境與限制」那一課說的單手握著、邊走邊用，落點比你以為的更不準。目標太小，要點好幾次才點得到；目標太擠，點到的是隔壁，而隔壁如果剛好是「刪除」，後果比點不到更糟。' },
        { type: 'p', text: '多大才夠？最常被引用的是 WCAG（網頁內容無障礙指引）2.2 版裡的兩條準則，單位都是 CSS 像素：' },
        { type: 'table', head: ['出處', '尺寸', '補充'], rows: [
          ['WCAG 2.2「目標尺寸（最低）」，AA 級', '至少 24 × 24', '有例外，例如句子裡的行內連結，或目標雖然比較小、但和其他目標之間留有足夠的間距'],
          ['WCAG 2.2「目標尺寸（加強）」，AAA 級', '至少 44 × 44', '同樣有例外，例如句子裡的行內連結'],
          ['各平台的設計指引', '常見的建議大約是 44 到 48', '數字不完全相同，方向一致：比 24 大得多'],
        ] },
        { type: 'p', text: '這一課採用的規則是：以至少 44 × 44 為目標，任何情況都不低於 24 × 24，而且目標之間要留間距（常見的做法是至少 8px）。這些數字是 CSS 像素，不是螢幕的實體像素；它們有意義的前提是頁面有正確的 viewport 設定（「viewport 與相對單位」那一課），否則整頁被縮小顯示，44px 的按鈕也會小得點不到。' },
        { type: 'example', id: 'mob03-sizes' },
        { type: 'p', text: '預覽一開始是 360px 寬。兩列的 HTML 完全相同，都是三顆裡面放了 24px 圖示的 `<button>`；橘色的方塊是按鈕的外框，也就是手指點得到的範圍。A 列的按鈕和圖示一樣大，三顆緊緊貼在一起，整列只有 72px 寬：一根手指就蓋住兩顆。B 列的圖示沒有變，但每顆按鈕的外框是 44 × 44，中間各留 8px。展開預覽下方「瀏覽器建立的 DOM 樹」可以確認兩列的元素一模一樣，差別全部來自 style.css；怎麼寫，下一節說明。' },
        { type: 'callout', tone: 'warning', title: '只用滑鼠測試，永遠不會發現目標太小', text: '在桌機上用滑鼠點 A 列，每一顆都點得準，所以這個問題在開發時很容易被放過。觸控目標一定要用手指測：用手機開啟頁面，用拇指（而不是小心翼翼的食指）連續點幾次，看看有沒有點錯。如果用手機開啟這一頁，現在就可以在上面的預覽試試 A 列與 B 列的差別。' },
      ],
    },
    {
      id: 'mob03-make-bigger-section', title: '把目標做大：最小尺寸、內距與整列可點',
      blocks: [
        { type: 'p', text: '目標的大小就是元素外框的大小，也就是「盒模型與一般排版流」那一課裡內容加上內距與邊框的那個盒子；所以把目標做大，就是把外框做大，內容可以不變。上一節 B 列的寫法是最常用的一種：`min-width: 44px` 與 `min-height: 44px` 規定外框的下限，再用 `display: inline-flex`、`align-items: center`、`justify-content: center` 把 24px 的圖示放在正中央。用 `min-` 而不是固定的 `width`、`height`，是因為按鈕上的文字比較長，或使用者把字級調大的時候，外框還能跟著長大，內容不會溢出外框。' },
        { type: 'p', text: '文字連結與文字按鈕更常用的是內距（padding）。這裡有一個初學者常搞混的地方：內距是外框的一部分，點在內距上就是點在元素上；外距（margin）是外框外面的空白，不屬於這個元素，點在上面碰不到它。兩者在畫面上都是「文字周圍多了一圈空白」，對手指來說卻完全不同。' },
        { type: 'example', id: 'mob03-padding-margin' },
        { type: 'p', text: '兩個連結的文字區都是 200 × 20。A 寫 `padding: 12px 16px`：橘色的外框長成 232 × 44，文字上方的紅點落在內距裡，那個位置點到的仍然是連結 A。B 寫 `margin: 12px 16px`：橘色的外框還是 200 × 20，它上方的紅點落在外距裡，點下去什麼都不會發生。在預覽裡各點一次兩個紅點的位置：預覽不會真的離開頁面，只會在下方顯示你點到的連結要前往哪裡；點 B 的紅點時，下方不會有任何變化。（紅點寫了 `pointer-events: none`，點擊會穿過它，落在它下面的元素上；這一課的頁面都用這種紅點標出「手指落在這裡」。）' },
        { type: 'p', text: '這兩個連結都寫了 `display: block`。行內的連結也可以加上下內距，但行內元素的上下內距不會把前後的行推開，放大的外框會蓋到相鄰的行上；所以獨立成一列的連結（導覽、清單的項目）通常改成 `block`、`inline-block`，或讓它成為 flex 項目。句子中間的連結則維持原樣：那正是指引裡的例外。' },
        { type: 'p', text: '最下面的「加辣」示範另一種放大的方法。核取方塊本身很小，但「表單元素與原生驗證」那一課學過：`<label>` 包住控制項之後，點標籤的文字就等於點控制項。再替 `<label>` 加上 `display: flex`、`min-height: 48px` 與左右內距，整列淺藍色的範圍都成了同一個目標。點一下文字或文字右邊的空白，核取方塊都會被勾選。' },
        { type: 'callout', tone: 'warning', title: '替按鈕加了內距，外框卻沒有變大', text: '`<button>` 和多數元素不同：瀏覽器的預設樣式替它寫了 `box-sizing: border-box`，所以 `width` 與 `height` 指的是含內距的外框。原本寫著 `width: 24px; height: 24px` 的圖示按鈕，再加 `padding: 10px`，外框仍然是 24 × 24：內距往裡面擠，圖示反而溢出按鈕。要讓內距撐大按鈕，先拿掉固定的寬高，或改用 `min-width`、`min-height`。' },
        { type: 'callout', tone: 'tip', title: '動手試：把外距換成內距', text: '按「動手改這個範例」，把 `#mar { margin: 12px 16px; }` 改成 `#mar { padding: 12px 16px; }` 再執行。B 的橘色外框變成和 A 一樣的 232 × 44，並且往上貼到 A 的下緣；原本落在空白裡的那個紅點，現在落在 B 的內距裡，點它就會點到連結 B。同樣的 12px，寫成內距才是目標的一部分。' },
      ],
    },
    {
      id: 'mob03-hit-area-section', title: '擴大點擊區域而不改變外觀',
      blocks: [
        { type: 'p', text: '有時候外框不能變大：設計稿上的關閉鈕就是一個小小的 24px 的 ×，加了內距會把旁邊的東西推開，或讓有背景色的圓形變成一大塊。這時候要分開兩件事：看得見的外觀，和實際接收點擊的點擊區域（hit area）。點擊區域通常就是外框，但可以用一塊透明、不佔版面的區域把它向外擴大。最常見的做法是偽元素（pseudo-element）：`::before` 與 `::after` 是 CSS 替元素產生的子元素，不必改 HTML。三個步驟：' },
        { type: 'list', ordered: true, items: [
          '元素自己寫 `position: relative`，成為偽元素的定位基準（「定位與堆疊順序」那一課的包含區塊）。',
          '替 `::before`（或 `::after`）寫 `content: \'\'`。沒有 `content` 的偽元素不會產生。',
          '偽元素寫 `position: absolute` 與 `inset: -10px`。`inset` 是 `top`、`right`、`bottom`、`left` 的簡寫；負值表示每一邊都從元素的外框再往外 10px。',
        ] },
        { type: 'p', text: '偽元素是元素的一部分：點在偽元素上，收到點擊的就是它所屬的那個元素，連結照樣前往它的 `href`，按鈕照樣觸發 `click`。它是絕對定位的，不佔版面，所以元素的外框與周圍的版面完全不變；它沒有背景，所以看不見。' },
        { type: 'example', id: 'mob03-hit-area' },
        { type: 'p', text: '兩個標題列看起來一模一樣：關閉連結的外框都是 24 × 24，位置相同。A 的 `#close-a` 多了上面三個步驟，點擊區域從 24 × 24 擴大成 44 × 44。兩列的紅點都在 × 左邊 8px 的地方。點 A 的紅點：預覽下方顯示了連結要前往的 `/menu`，表示這個位置屬於 `#close-a`。點 B 的紅點：沒有任何反應，那個位置上是標題 `#title-b` 的盒子。' },
        { type: 'p', text: '另一種做法不用偽元素：替元素加透明的內距，再用同樣大小的負外距把它抵銷，例如 `padding: 10px; margin: -10px;`。外框真的變成 44 × 44，負的外距讓周圍的元素留在原位。它比較短，但外框變大之後，元素的背景色與邊框會跟著變大，所以只適合沒有背景與邊框、只有一個圖示的元素。不論用哪一種，放大的區域都要以看得見的圖示為中心：使用者瞄準的是他看得到的東西。' },
        { type: 'callout', tone: 'tip', title: '動手試：讓看不見的點擊區域現形', text: '按「動手改這個範例」，在 `#close-a::before` 的規則裡加一行 `background-color: rgba(211, 47, 47, 0.2);` 再執行：× 的周圍出現一塊 44 × 44 的淡紅色，紅點落在它的範圍裡。接著把 `content: \'\';` 那一行刪掉：色塊消失，偽元素根本沒有產生。把它加回去，改成刪掉 `#close-a { position: relative; }`：色塊變成蓋住整個 A 列，因為偽元素改以最近的定位祖先 `.bar` 為基準，這時點標題的任何地方都會變成關閉。開發時先塗上顏色確認範圍，確認完再拿掉，是很實用的習慣。' },
      ],
    },
    {
      id: 'mob03-neighbours-section', title: '間距與重疊：別讓鄰居搶走點擊',
      blocks: [
        { type: 'p', text: '放大的點擊區域看不見，這帶來一個新的風險：相鄰兩個目標的區域疊在一起，而你在畫面上完全看不出來。重疊的地方只有一個元素收得到點擊，就是畫在最上面的那一個。兩個都是定位元素、都沒有設定 `z-index` 的時候，HTML 裡寫在後面的畫在上面（「定位與堆疊順序」那一課）。' },
        { type: 'example', id: 'mob03-overlap' },
        { type: 'p', text: '為了看得見，這一頁把偽元素塗成半透明的藍色。C 列的兩顆按鈕相隔 8px，每邊各往外 12px：「收藏」的區域往右伸出 12px，「分享」的區域往左伸出 12px，加起來 24px，比 8px 的間距多了 16px，中間顏色比較深的那一條就是重疊的部分。「分享」在 HTML 裡排在後面，重疊的地方歸它；它的區域甚至蓋進了「收藏」外框的右邊 4px。紅點就在那裡：明明落在「收藏」的橘色方塊裡，點到的卻是「分享」。而「收藏」的正中央仍然點得到自己，所以隨手點一下測試不會發現。D 列把間距拉大到 24px、每邊往外 10px：兩個區域各是 44 × 44，中間還隔著 4px，同樣位置的紅點點到的是「收藏」。' },
        { type: 'p', text: '規則可以直接用算的：相鄰兩個目標朝對方放大的量加起來，不能超過它們外框之間的間距。C 列是 12 + 12 = 24，大於 8；D 列是 10 + 10 = 20，小於 24。間距不夠的時候有兩條路：把間距加大（flex 或 grid 容器的 `gap` 最方便），或接受比較小的放大量。即使不放大點擊區域，緊貼在一起的目標也容易按錯，所以目標之間本來就該留間距；會造成損失的操作（刪除、清空）更要離常用的操作遠一點。' },
        { type: 'p', text: '要確認某個位置到底會點到誰，可以在開發者工具的主控台呼叫 `document.elementFromPoint(x, y)`：它回傳視窗裡那個座標上畫在最上面的元素（座標落在偽元素上時，回傳的是偽元素所屬的元素）。這一課的練習就是用同樣的方法，在紅點的位置檢查點到的是誰。' },
        { type: 'callout', tone: 'warning', title: '放大自己的目標，卻蓋住了別人的', text: '把 `inset` 的負值越寫越大，自己的按鈕的確越來越好點，代價是鄰居能點的範圍被吃掉，而且畫面上沒有任何線索。每次擴大點擊區域，都要連鄰居一起檢查：點鄰居看得見的範圍的邊緣，確認收到點擊的還是它。另一個相關的錯誤是忘了元素自己的 `position: relative`：偽元素會以更外層的定位祖先為基準，一口氣蓋住整個區塊。' },
        { type: 'callout', tone: 'tip', title: '動手試：算出剛好不重疊的放大量', text: 'C 列的間距是 8px，兩邊平分，每邊最多只能往外 4px。按「動手改這個範例」，把 `#crowded button::before { inset: -12px; }` 改成 `inset: -4px;` 再執行：兩塊藍色剛好相接，沒有比較深的那一條，紅點回到「收藏」的範圍裡。不過這時每個區域只有 32 × 32：想要 44 × 44，就得像 D 列一樣把間距加大。' },
      ],
    },
    {
      id: 'mob03-gesture-conflicts-section', title: '手勢衝突：系統手勢、touch-action 與 overscroll-behavior',
      blocks: [
        { type: 'p', text: '手勢（gesture）是點一下以外的觸控操作：滑動、拖曳、雙指開合、長按、點兩下。在你寫任何指令稿之前，瀏覽器與作業系統就已經用掉了其中很多個（實際的手勢依裝置與瀏覽器而不同）：' },
        { type: 'table', head: ['手勢', '誰在用', '用來做什麼'], rows: [
          ['上下滑、左右滑', '瀏覽器', '捲動頁面，或捲動頁面裡會捲動的區域'],
          ['雙指開合', '瀏覽器', '縮放頁面'],
          ['點兩下', '部分瀏覽器', '放大點到的那一塊內容'],
          ['在頁面頂端繼續往下拉', '部分瀏覽器', '重新整理'],
          ['從螢幕的左右邊緣往內滑', '作業系統或瀏覽器', '返回上一頁'],
          ['從螢幕底部往上滑', '作業系統', '回到主畫面、切換 App'],
        ] },
        { type: 'p', text: '手勢衝突指的是：你設計的手勢和上面的某一個用了同樣的動作、同樣的位置，使用者想做的是 A，發生的卻是 B。避開的原則有兩條。第一，螢幕的邊緣屬於系統：不要把自訂手勢的起點放在左右邊緣（例如「從左緣滑出抽屜」）、最底部或頁面的最頂端。系統層級的手勢頁面攔不到；瀏覽器自己的手勢使用者早就習慣了，也不該去搶。第二，自訂的手勢和瀏覽器的捲動、縮放發生在同一塊區域時，用 CSS 的 `touch-action` 把界線說清楚。' },
        { type: 'p', text: '`touch-action` 寫在元素上，告訴瀏覽器：手指從這個元素開始的時候，哪些手勢由瀏覽器自己處理。沒有列出來的，瀏覽器不處理，留給你的指令稿。' },
        { type: 'table', head: ['值', '留給瀏覽器的手勢', '適合'], rows: [
          ['`auto`（預設）', '全部：捲動、雙指縮放、點兩下放大', '一般的內容'],
          ['`manipulation`', '捲動與雙指縮放；不做點兩下放大', '會被連續快按的按鈕，例如數量的加、減'],
          ['`pan-y`', '只有上下捲動', '自己處理左右滑的元件：輪播、可以滑動刪除的列'],
          ['`pan-x`', '只有左右捲動', '自己處理上下拖曳的元件'],
          ['`none`', '都不留', '整塊都由指令稿處理的元件：畫板、地圖、拖曳用的把手'],
        ] },
        { type: 'p', text: '有三件事要記得。值寫的是「留給瀏覽器的」，不是「我要處理的」：自己處理左右滑的輪播要寫 `pan-y`，寫成 `pan-x` 就反了。`pan-y` 也不包含雙指縮放，想保留可以寫成 `pan-y pinch-zoom`。這個屬性不會繼承，但瀏覽器會把祖先的限制一起算進來：在 `body` 寫 `touch-action: none`，整頁的每個位置都不能用手指捲動與縮放。至於 `manipulation`：有些瀏覽器為了分辨「點一下」和「點兩下放大」，會在第一下之後稍等，看第二下會不會來；宣告這個元素不需要點兩下放大，瀏覽器就不必等，連按也不會突然放大畫面。' },
        { type: 'p', text: '另一種衝突發生在兩層捲動之間。頁面裡有一塊自己會捲動的區域（抽屜、底部面板、聊天視窗），使用者把它捲到盡頭之後手指繼續滑，瀏覽器會把剩下的捲動交給外層：面板後面的頁面跟著動了起來，這叫連鎖捲動（scroll chaining）。在會捲動的那個元素上寫 `overscroll-behavior: contain`，它捲到盡頭就停住，不再往外傳；`none` 還會連盡頭的回彈效果一起拿掉。' },
        { type: 'example', id: 'mob03-gestures' },
        { type: 'p', text: '這一頁有三個宣告。卡片的容器 `#strip` 寫 `touch-action: pan-y`：script.js 處理左右滑（按下時記住位置，放開時看移動了多少，往左超過 40px 就換下一張；用的是指標事件，下一課「Pointer Events 與觸控事件」說明），而手指從卡片上開始上下滑的時候，瀏覽器照常捲動頁面。兩顆按鈕寫 `touch-action: manipulation`。「店家備註」`#notes` 寫 `overscroll-behavior: contain`。在預覽裡用滑鼠按住卡片往左拖再放開，卡片會換；指標事件同時涵蓋滑鼠與手指。' },
        { type: 'callout', tone: 'note', title: '這三個宣告的效果，桌機的預覽與檢查都看不到', text: '`touch-action` 只管手指與觸控筆直接在螢幕上的操作，滑鼠完全不受影響；`overscroll-behavior` 在這裡要處理的，同樣是手指把一塊區域捲到盡頭之後的事。所以在桌機上用滑鼠操作預覽，無法確認這三行有沒有發揮作用；這一課的檢查也只能讀「計算後的樣式」，確認宣告寫在對的元素上、值是對的，檢查不到它們對手指的效果。要看效果，請用手機開啟這一頁，在預覽裡用手指操作：從卡片上開始上下滑、左右滑，連按幾次「下一道」，把備註捲到底之後繼續滑。再按「動手改這個範例」，把其中一行刪掉後執行，同樣的動作再做一次，比較兩者的差別。螢幕邊緣的系統手勢則只有在真的手機上才試得到。' },
      ],
    },
    {
      id: 'mob03-alternatives-section', title: '替代操作：每個手勢都要有一顆看得到的按鈕',
      blocks: [
        { type: 'p', text: '手勢有三個先天的問題。它是看不見的：沒有人告訴你，你不會知道購物車的一列可以往左滑。它不是每個人都做得到：手會抖的人、單手握著手機的人、用觸控筆或其他輔具的人，很難準確地沿著一條路徑滑動。它也不是每種輸入方式都有：用滑鼠或鍵盤的人沒有「滑」這個動作，而螢幕閱讀器開啟的時候，滑動手勢是拿來在元素之間移動的，通常到不了你的頁面。' },
        { type: 'p', text: '所以原則很簡單：每一個手勢，都要有一個看得到、點一下就能完成的替代操作。WCAG 也有同樣精神的要求：需要沿著路徑移動（滑動、拖曳）或用到多根手指的操作，必須也能用單一指標、不必沿路徑移動的方式完成，除非那條路徑本身就是功能的一部分（例如手寫簽名）。' },
        { type: 'table', head: ['手勢', '替代操作'], rows: [
          ['在一列上往左滑來刪除', '列上一顆看得到的「刪除」按鈕'],
          ['左右滑換卡片', '「上一張」「下一張」按鈕'],
          ['雙指開合縮放地圖', '放大、縮小兩顆按鈕'],
          ['長按叫出選單', '一顆「更多」按鈕'],
          ['拖曳調整順序', '「上移」「下移」按鈕'],
        ] },
        { type: 'p', text: '回頭看上一節的範例，它已經照這個原則做了：左右滑和「上一道」「下一道」兩顆按鈕做的是同一件事，而且呼叫的是同一個函式 `show()`。這是值得照著做的順序：先把按鈕做好、做對，手勢只是加在上面的捷徑。按鈕本身也是觸控目標，前面幾節的要求全部適用：至少 44 × 44，彼此有間距，用原生的 `<button>`，而且有說得出動作的名稱（「語意 HTML 與 ARIA 的無障礙實作」那一課）；一排「刪除」按鈕的名稱還要說得出各自刪的是哪一項。' },
        { type: 'callout', tone: 'warning', title: '不要用關掉縮放來解決手勢衝突', text: '自訂的手勢被瀏覽器的縮放或捲動打斷時，最省事的「修法」是把它們整個關掉：在 viewport 設定加上 `user-scalable=no` 或 `maximum-scale=1`（「viewport 與相對單位」那一課說過為什麼不行），或在 `body` 寫 `touch-action: none`。雙指放大是視力不好的人閱讀頁面的方法，不能為了一個輪播拿掉。正確的做法是把限制寫在需要它的那個元件上，而且只寫最小的那一個：輪播寫 `pan-y`，不是整頁寫 `none`。' },
        { type: 'p', text: '最後一個練習會替只能滑動刪除的購物車補上按鈕。想多看幾種行動導覽的版面，可以到互動實驗島的 Mobile Navigation Simulator，留意每一個可以點的項目夠不夠大、彼此之間有沒有間距。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob03-q1', prompt: '關於 WCAG 2.2 對目標尺寸的要求，哪一個說法正確？',
      options: [
        'AA 級的最低尺寸是 44 × 44 CSS 像素，AAA 級的加強尺寸是 48 × 48',
        '只要圖示畫成 24 × 24，不論按鈕的外框多大，都符合 AAA 級的加強尺寸',
        'AA 級的最低尺寸是 24 × 24 CSS 像素（有例外，例如句子裡的行內連結），AAA 級的加強尺寸是 44 × 44',
        'WCAG 只規定目標之間的間距，沒有規定目標本身的大小',
      ],
      answer: 2,
      explanation: 'WCAG 2.2 有兩條目標尺寸的準則：AA 級的「最低」是 24 × 24 CSS 像素，並列出例外（句子裡的行內連結、和其他目標之間留有足夠間距的小目標等）；AAA 級的「加強」是 44 × 44。48 是部分平台設計指引裡常見的建議，不是 WCAG 的數字。目標的大小看的是能接收點擊的範圍，不是圖示畫多大。間距只是最低尺寸的例外條件之一，準則規定的是目標本身。',
    },
    {
      id: 'mob03-q2', prompt: '獨立成一列的文字連結「查看訂單」只有 20px 高。要讓它的觸控目標變成 44px 高，文字的大小不變，哪一個做法有效？',
      options: [
        '把它設成 `display: block`，上、下各加 12px 的 `padding`',
        '上、下各加 12px 的 `margin`',
        '維持 `display: inline`，加上 `min-height: 44px`',
        '用 `transform: scale(2.2)` 把它放大',
      ],
      answer: 0,
      explanation: '內距是外框的一部分：20 + 12 + 12 = 44px，整塊都點得到，文字大小不變。外距在外框的外面，點在上面碰不到連結，目標還是 20px 高。`min-height` 對行內元素沒有作用，行內元素的高度不由 `width`、`height` 這一類屬性決定。`transform: scale()` 會把文字一起放大成兩倍多，外觀變了，而且它不佔版面，放大的部分會蓋到上下的內容。',
    },
    {
      id: 'mob03-q3', prompt: '想把 24px 的關閉連結 `#close` 的點擊區域每邊擴大 10px，寫了下面的樣式，點擊區域卻沒有變大。少了什麼？',
      code: { language: 'CSS', text: '#close {\n  position: relative;\n}\n#close::before {\n  position: absolute;\n  inset: -10px;\n}' },
      options: [
        '`inset` 不能寫負值，要改成 `margin: -10px`',
        '偽元素收不到點擊，要在 HTML 裡多加一個真正的 `<span>`',
        '少了 `z-index: 1`，偽元素被 `#close` 自己蓋住了',
        '少了 `content: \'\'`：沒有 `content` 的 `::before` 不會產生',
      ],
      answer: 3,
      explanation: '`::before` 與 `::after` 一定要有 `content`（空字串也可以）才會產生；少了它，定位與 `inset` 都沒有對象。`inset` 可以是負值，負值正是「從外框再往外」的意思。偽元素是元素的一部分，點在它上面，收到點擊的就是 `#close`，不需要另外加元素。絕對定位的偽元素本來就畫在 `#close` 的一般內容之上，不需要 `z-index`。',
    },
    {
      id: 'mob03-q4', prompt: '兩顆相鄰的 24px 圖示按鈕，HTML 裡先寫「收藏」、後寫「分享」，外框相隔 8px。兩顆都寫了 `position: relative`，並用 `::before` 加上 `inset: -12px` 擴大點擊區域，都沒有設定 `z-index`。手指點在「收藏」圖示靠右緣的地方，會怎麼樣？',
      options: [
        '兩顆按鈕都收到點擊',
        '「分享」收到點擊：它的偽元素往左伸了 12px，蓋進「收藏」的右側，而且畫在上面',
        '「收藏」收到點擊：看得見的圖示永遠優先於看不見的偽元素',
        '沒有任何按鈕收到點擊：重疊的區域會互相抵銷',
      ],
      answer: 1,
      explanation: '「分享」的偽元素往左伸出 12px，越過 8px 的間距，再蓋進「收藏」外框的右邊 4px。兩顆按鈕都是定位元素、沒有 `z-index`，HTML 裡後面的「分享」連同它的偽元素畫在上面，所以重疊的地方歸它。一次點擊只有畫在最上面的那個元素收得到，不會兩個都收到，也不會抵銷；瀏覽器不管元素看不看得見，只看誰畫在上面。修法是加大間距，或縮小放大量。',
    },
    {
      id: 'mob03-q5', prompt: '一排推薦卡片由指令稿處理左右滑來換卡片；手指從卡片上開始上下滑的時候，頁面要能照常捲動。卡片的容器該寫哪一個宣告？',
      options: [
        '`touch-action: pan-x`',
        '`touch-action: none`',
        '`touch-action: manipulation`',
        '`touch-action: pan-y`',
      ],
      answer: 3,
      explanation: '`touch-action` 的值是「留給瀏覽器處理的手勢」。`pan-y` 把上下捲動留給瀏覽器，左右滑不在清單裡，才會完整地交給指令稿。`pan-x` 正好相反：左右滑被瀏覽器拿走，上下滑反而不捲動頁面。`none` 什麼都不留，手指從卡片上開始就捲不動頁面。`manipulation` 仍然把上下與左右的捲動都留給瀏覽器，只是少了點兩下放大。',
    },
    {
      id: 'mob03-q6', prompt: '小島外送想加一個手勢：從螢幕的左邊緣往右滑，滑出選單抽屜。這個設計最大的問題是什麼？',
      options: [
        '在很多手機上，從螢幕邊緣往內滑是系統或瀏覽器的「返回」手勢：兩者衝突，使用者想開選單，卻離開了頁面',
        '抽屜只能從螢幕的右邊滑出來',
        '瀏覽器不允許網頁的指令稿偵測左右方向的滑動',
        '加上這個手勢之後，頁面就不能用雙指縮放',
      ],
      answer: 0,
      explanation: '螢幕的邊緣屬於系統：從左右邊緣往內滑在很多裝置上是返回上一頁，頁面攔不到，使用者的動作會被系統拿走。抽屜從哪一邊出來是設計的選擇，沒有只能從右邊的限制。指令稿可以偵測任何方向的滑動，上一節的範例就在處理左右滑。手勢本身不會讓頁面不能縮放，除非你另外寫了禁止縮放的設定。比較好的做法是用一顆看得到的選單按鈕開抽屜。',
    },
    {
      id: 'mob03-q7', prompt: '底部面板裡有一份可以上下捲動的清單。使用者把清單捲到底，手指繼續往上滑，面板後面的頁面跟著捲動了。該怎麼修？',
      options: [
        '在 `body` 寫 `overflow: hidden`，讓頁面永遠不能捲動',
        '在會捲動的清單上寫 `overscroll-behavior: contain`',
        '在清單上寫 `touch-action: none`',
        '在 viewport 設定加上 `user-scalable=no`',
      ],
      answer: 1,
      explanation: '清單捲到盡頭後，瀏覽器把剩下的捲動交給外層，這是連鎖捲動；`overscroll-behavior: contain` 寫在會捲動的元素上，讓它到盡頭就停住。`body` 永遠 `overflow: hidden` 會讓面板關掉之後頁面也捲不動。`touch-action: none` 會讓清單自己也不能用手指捲。`user-scalable=no` 管的是縮放，和捲動無關，而且會讓需要放大閱讀的人無法使用。',
    },
    {
      id: 'mob03-q8', prompt: '購物車的每一列只能用「往左滑」刪除，畫面上沒有其他刪除的方法。哪一個修正最好？',
      options: [
        '在頁面最上面加一行說明：「往左滑可以刪除」',
        '把觸發的距離從 80px 縮短成 20px，讓手勢更容易成功',
        '保留滑動，並在每一列加上一顆看得到、名稱說得出刪哪一項的「刪除」按鈕',
        '把手勢改成長按一秒刪除',
      ],
      answer: 2,
      explanation: '手勢需要替代操作：一顆看得到的原生按鈕，用手指、滑鼠、鍵盤與螢幕閱讀器都能操作，滑動則留下來當捷徑。只加說明文字解決了「不知道可以滑」，但做不到滑動的人、用鍵盤的人仍然刪不掉。把距離縮短成 20px 會讓上下捲動時稍微偏一點就誤刪。長按同樣是看不見、也不是每個人都做得到的手勢，只是換了一個問題。',
    },
  ],
  webCode: {
    examples: [sizes, paddingMargin, hitArea, overlap, gestures],
    exercises: [exIcons, exClose, exGestures, exDelete],
  },
};
