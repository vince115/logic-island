import type { WebExample, WebExercise, WebRoute, WebStep, WebViewport } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB10 Mobile performance and battery (MOB-3). A web-code lesson on the made-up 小島外送. Low-end devices and measuring
 * under CPU and network throttling (described, no numbers attributed to a device or a tool), the main thread and long
 * tasks (chunks that yield, deferring, debouncing, one write per frame, read-then-write), animation cost (transform and
 * opacity, will-change, requestAnimationFrame, prefers-reduced-motion) and saving power (stop what nobody sees).
 *
 * Nothing here measures time: a check's clock is virtual and runs in the learner's own browser, so every page shows
 * ORDER and COUNTS: steps done before the first task ends, the order in which queued work gets its turn, how many
 * frames were drawn, how many requests were sent over a stretch of the page's clock.
 * Stand-ins, each named as one in the text:
 * - A tap that arrives during work is a 0 ms timer queued when the work starts (mob10-yield), or a real click step
 *   between two timers of the virtual clock (exercise 1). "The screen had a chance to update" is a 0 ms timer queued
 *   by each batch that prints the progress it sees when its turn comes.
 * - document.visibilityState cannot be changed by a check or in a preview: index.html carries `page`, an EventTarget
 *   with `visibilityState` and a `visibilitychange` event, driven by two buttons (preview) and by the custom events
 *   page-hide / page-show that a dispatch step fires on body (checks). The real names are given beside it.
 * - A transition takes real time, so no check looks at a box right after a class toggle: the moved or open state is
 *   in the markup from the start (mob10-transform, the variant of exercise 3), where no transition runs.
 * mob10-frame relies on one real animation frame after a `wait` step (engine: MOB-2); it is an example only, no
 * exercise depends on requestAnimationFrame.
 */

const PHONE: WebViewport = { width: 360, height: 640 };
const PAGE_CSS = String.raw`body { margin: 0; padding: 16px; font-family: sans-serif; }
h1 { margin: 0 0 12px; font-size: 20px; }
p { margin: 8px 0; }
button { min-height: 44px; padding: 0 16px; font: inherit; }`;

// ---- examples -------------------------------------------------------------------------------------------------------

const startup: WebExample = {
  id: 'mob10-startup', title: '啟動時的三件工作，擠在同一件任務裡',
  description: '小島外送的首頁。指令稿一載入就做三件工作，`work` 用迴圈的圈數代表工作量；做完之後才登記「開始點餐」的監聽器。',
  viewport: PHONE,
  files: {
    html: String.raw`<h1>小島外送</h1>
<button id="order" type="button">開始點餐</button>
<p id="first">計算中…</p>
<p id="reply"></p>`,
    css: PAGE_CSS,
    js: String.raw`let steps = 0; // 這一頁到目前為止做了幾步

// 用「步數」代表工作量：步數到哪裡都一樣，慢的手機每一步花得比較久
function work(name, count) {
  for (let i = 0; i < count; i += 1) steps += 1;
  console.log(name + '：' + count + ' 步');
}

work('畫出菜單', 300);   // 第一個畫面就要用
work('準備評論區', 400); // 往下捲才看得到
work('準備地圖', 500);   // 按「看地圖」才用得到

// 執行到這裡，第一件任務才要結束
document.querySelector('#first').textContent = '「開始點餐」能回應之前，這一頁先做了 ' + steps + ' 步';
console.log('第一件任務結束：已做 ' + steps + ' 步');

document.querySelector('#order').addEventListener('click', () => {
  document.querySelector('#reply').textContent = '好的，開始點餐';
});`,
  },
  observe: [
    { check: 'console', lines: ['畫出菜單：300 步', '準備評論區：400 步', '準備地圖：500 步', '第一件任務結束：已做 1200 步'], label: '主控台的順序：三件工作一件接一件，都做完了第一件任務才結束，這時已經做了 1200 步' },
    { check: 'text', selector: '#first', text: '「開始點餐」能回應之前，這一頁先做了 1200 步', label: '頁面上的說明：「開始點餐」能回應之前，先做了 1200 步，其中只有 300 步是第一個畫面需要的' },
    { do: 'click', selector: '#order' },
    { check: 'text', selector: '#reply', text: '好的，開始點餐', label: '第一件任務結束之後按「開始點餐」：監聽器已經登記，頁面回答「好的，開始點餐」' },
  ],
};

const yielding: WebExample = {
  id: 'mob10-yield', title: '同樣是 await：等 Promise 不讓路，等計時器才讓路',
  description: '兩個按鈕都把 600 筆歷史訂單分成三批整理，差別只在每一批之後 `await` 什麼。開始整理的同時，`queueTap` 排進一件 0 毫秒的任務，代表使用者在整理期間按了一下。',
  viewport: PHONE,
  files: {
    html: String.raw`<h1>歷史訂單</h1>
<p><button id="micro" type="button">整理：每批之後等一個 Promise</button></p>
<p><button id="timer" type="button">整理：每批之後等 pause()</button></p>
<p id="status">有 600 筆訂單還沒整理</p>`,
    css: PAGE_CSS,
    js: String.raw`const statusText = document.querySelector('#status');

// 讓路：等一個 0 毫秒的計時器，後面的程式就成了「下一件任務」
const pause = () => new Promise(resolve => setTimeout(resolve, 0));

// 代表使用者在整理期間按了一下：一件排進任務佇列的工作
function queueTap(name) {
  setTimeout(() => {
    console.log(name + '：輪到點擊了，這時畫面是「' + statusText.textContent + '」');
  }, 0);
}

async function sortOrders(name, giveWay) {
  queueTap(name);
  for (let done = 200; done <= 600; done += 200) {
    statusText.textContent = '已整理 ' + done + ' 筆'; // 整理好一批
    console.log(name + '：整理好 ' + done + ' 筆');
    await giveWay();
  }
}

document.querySelector('#micro').addEventListener('click', () => {
  sortOrders('等 Promise', () => Promise.resolve());
});
document.querySelector('#timer').addEventListener('click', () => {
  sortOrders('等計時器', pause);
});`,
  },
  observe: [
    { do: 'click', selector: '#micro' },
    { do: 'wait', ms: 1 },
    { check: 'console', lines: ['等 Promise：整理好 200 筆', '等 Promise：整理好 400 筆', '等 Promise：整理好 600 筆', '等 Promise：輪到點擊了，這時畫面是「已整理 600 筆」'], label: '按第一個按鈕：三批都整理完了才輪到點擊。`await` 一個已經完成的 Promise 只排進微任務，沒有讓路' },
    { do: 'click', selector: '#timer' },
    { do: 'wait', ms: 1 },
    { check: 'console', match: 'includes', lines: ['等計時器：整理好 200 筆', '等計時器：輪到點擊了，這時畫面是「已整理 200 筆」', '等計時器：整理好 400 筆', '等計時器：整理好 600 筆'], label: '按第二個按鈕：第一批之後就輪到點擊，然後才是第二、第三批。`await pause()` 把後面的工作排成另一件任務' },
    { check: 'text', selector: '#status', text: '已整理 600 筆', label: '兩種寫法最後都整理完 600 筆：結果相同，差別只在中間讓不讓別的工作插進來' },
  ],
};

const frame: WebExample = {
  id: 'mob10-frame', title: '五筆位置更新，一個畫格只畫一次',
  description: '按鈕一口氣送進五筆外送員的位置。`onPosition` 只記下最新的位置並預約下一個畫格；真正改畫面的 `draw` 交給 `requestAnimationFrame`。',
  viewport: PHONE,
  files: {
    html: String.raw`<h1>外送員位置</h1>
<button id="burst" type="button">一口氣收到 5 筆位置</button>
<div id="road"><div id="rider"></div></div>
<p id="count">收到 0 筆，畫了 0 次</p>`,
    css: PAGE_CSS + String.raw`
#road { width: 300px; height: 24px; margin-top: 12px; background: #cfd8dc; }
#rider { width: 24px; height: 24px; background: #e65100; }`,
    js: String.raw`const rider = document.querySelector('#rider');
const count = document.querySelector('#count');
let latest = 0;        // 最新的位置（px）
let received = 0;
let drawn = 0;
let scheduled = false; // 已經預約下一個畫格了嗎

// 真正改畫面的地方：一個畫格最多執行一次
function draw() {
  scheduled = false;
  drawn += 1;
  rider.style.transform = 'translateX(' + latest + 'px)';
  count.textContent = '收到 ' + received + ' 筆，畫了 ' + drawn + ' 次';
}

// 每收到一筆位置：只記下來，還沒預約的話就預約下一個畫格
function onPosition(x) {
  latest = x;
  received += 1;
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(draw);
  }
}

document.querySelector('#burst').addEventListener('click', () => {
  for (const x of [40, 90, 150, 210, 260]) onPosition(x);
});`,
  },
  observe: [
    { do: 'click', selector: '#burst' },
    { do: 'wait', ms: 1 },
    { check: 'text', selector: '#count', text: '收到 5 筆，畫了 1 次', label: '按一下按鈕、等下一個畫格：收到 5 筆位置，`draw` 只執行 1 次' },
    { check: 'style', selector: '#rider', property: 'transform', value: 'translateX(260px)', label: '方塊直接畫在最後一筆的位置（`translateX(260px)`）：前四筆沒有畫到螢幕上，也不需要' },
    { do: 'click', selector: '#burst' },
    { do: 'wait', ms: 1 },
    { check: 'text', selector: '#count', text: '收到 10 筆，畫了 2 次', label: '再按一次：又收到 5 筆，只多畫 1 次' },
  ],
};

const transform: WebExample = {
  id: 'mob10-transform', title: '兩種移動：改 margin-left，或改 transform',
  description: '兩個方塊都往右移了 200px，頁面一開始就是「已出發」的狀態。上面的改 `margin-left`，下面的改 `transform`；按鈕讓它們一起滑回去、再出發。',
  viewport: PHONE,
  files: {
    html: String.raw`<h1>外送員出發了</h1>
<p class="how">用 margin-left 移動</p>
<div class="track">
  <div class="rider go" id="by-margin"></div>
  <span id="tag-margin">外送員</span>
</div>
<p class="how">用 transform 移動</p>
<div class="track">
  <div class="rider go" id="by-transform"></div>
  <span id="tag-transform">外送員</span>
</div>
<button id="toggle" type="button">回到店家／再出發</button>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
h1 { margin: 16px; font-size: 20px; }
.how { margin: 12px 16px 4px; }
button { min-height: 44px; margin: 16px; padding: 0 16px; font: inherit; }
.track { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #eceff1; }
.rider { flex: none; width: 40px; height: 40px; background: #e65100; }

/* 上面：改的是版面屬性，滑動時每一個畫格都要重新排版 */
#by-margin { transition: margin-left 0.6s; }
#by-margin.go { margin-left: 200px; }

/* 下面：改的是 transform，版面不變 */
#by-transform { transition: transform 0.6s; will-change: transform; }
#by-transform.go { transform: translateX(200px); }

@media (prefers-reduced-motion: reduce) {
  #by-margin, #by-transform { transition-duration: 0s; }
}`,
    js: String.raw`const riders = document.querySelectorAll('.rider');

document.querySelector('#toggle').addEventListener('click', () => {
  for (const rider of riders) rider.classList.toggle('go');
});`,
  },
  observe: [
    { check: 'box', selector: '#by-margin', measure: 'left', value: 216, label: '上面的方塊用 `margin-left: 200px` 移動，左邊緣在 216px（留白 16px＋200px）' },
    { check: 'box', selector: '#tag-margin', measure: 'left', value: 264, label: '它右邊的標籤被推到 264px：`margin-left` 改變了版面，後面的內容跟著重排' },
    { check: 'box', selector: '#by-transform', measure: 'left', value: 216, label: '下面的方塊用 `transform: translateX(200px)` 移動，同樣畫在 216px' },
    { check: 'box', selector: '#tag-transform', measure: 'left', value: 64, label: '它右邊的標籤仍然在 64px：對版面來說方塊沒有移動，`transform` 只改變它被畫在哪裡' },
    { check: 'style', selector: '#by-transform', property: 'transition-property', value: 'transform', label: '下面的方塊漸變的屬性是 `transform`，不是任何版面屬性' },
  ],
};

/** The stand-in for the Page Visibility API: `page` with visibilityState and a visibilitychange event. */
const VISIBILITY_HELPER = String.raw`<p class="sim">
  <button id="hide" type="button">模擬：切到背景</button>
  <button id="show" type="button">模擬：回到前景</button>
</p>
<p id="vis">頁面狀態：visible</p>
<script>
  // 替身：預覽與檢查沒辦法真的把頁面切到背景，所以用 page 代替 document。
  // 真實的網站讀 document.visibilityState，監聽 document 的 visibilitychange。
  const page = new EventTarget();
  page.visibilityState = 'visible';
  page.hidden = false;
  {
    const set = state => {
      if (page.visibilityState === state) return;
      page.visibilityState = state;
      page.hidden = state === 'hidden';
      document.querySelector('#vis').textContent = '頁面狀態：' + state;
      const event = new Event('visibilitychange');
      page.dispatchEvent(event);
      if (typeof page.onvisibilitychange === 'function') page.onvisibilitychange(event);
    };
    document.addEventListener('page-hide', () => set('hidden'));
    document.addEventListener('page-show', () => set('visible'));
    document.querySelector('#hide').addEventListener('click', () => set('hidden'));
    document.querySelector('#show').addEventListener('click', () => set('visible'));
  }
</script>
<script src="script.js"></script>`;
const VISIBILITY_CSS = PAGE_CSS + String.raw`
#where, #state { font-size: 22px; font-weight: bold; }
.sim { margin-top: 16px; }
.sim button { margin: 0 8px 8px 0; }
#vis { color: #455a64; }`;

const visibility: WebExample = {
  id: 'mob10-visibility', title: '外送員位置：頁面在背景時不再詢問',
  description: '頁面每 10 秒向 `/api/rider` 詢問一次外送員的位置。index.html 裡的 `page` 是 `document` 的替身：兩個「模擬」按鈕改變 `page.visibilityState`，並在 `page` 上觸發 `visibilitychange`。',
  viewport: PHONE,
  setup: { api: [{ path: '/api/rider', body: { place: '中正路口' } }] },
  files: {
    html: String.raw`<h1>外送員位置</h1>
<p id="where" role="status">查詢中…</p>
<p id="asked">已詢問 0 次</p>
` + VISIBILITY_HELPER,
    css: VISIBILITY_CSS,
    js: String.raw`const where = document.querySelector('#where');
const asked = document.querySelector('#asked');
let count = 0;
let timer = null;

async function ask() {
  count += 1;
  asked.textContent = '已詢問 ' + count + ' 次';
  const response = await fetch('/api/rider');
  const rider = await response.json();
  where.textContent = rider.place;
}

function start() { // 先問一次，之後每 10 秒問一次
  ask();
  timer = setInterval(ask, 10000);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

// 真實的網站：把 page 換成 document
page.addEventListener('visibilitychange', () => {
  if (page.visibilityState === 'hidden') stop();
  else start();
});

if (page.visibilityState === 'visible') start();`,
  },
  observe: [
    { do: 'wait', ms: 300 },
    { do: 'wait', ms: 10000 },
    { do: 'wait', ms: 10000 },
    { check: 'request', path: '/api/rider', count: 3, label: '頁面在前景的 20 秒：載入時問一次，之後每 10 秒一次，共 3 次請求' },
    { do: 'dispatch', selector: 'body', event: 'page-hide' },
    { do: 'wait', ms: 10000 },
    { do: 'wait', ms: 10000 },
    { check: 'request', path: '/api/rider', count: 3, label: '切到背景之後再過 20 秒：請求仍然是 3 次，計時器已經被 `clearInterval` 停掉' },
    { do: 'dispatch', selector: 'body', event: 'page-show' },
    { do: 'wait', ms: 300 },
    { check: 'request', path: '/api/rider', count: 4, label: '回到前景：不等下一個 10 秒，立刻問一次（第 4 次）' },
    { do: 'wait', ms: 10000 },
    { check: 'request', path: '/api/rider', count: 5, label: '再過 10 秒：第 5 次，恢復每 10 秒一次，而且只有一個計時器在問' },
    { check: 'text', selector: '#asked', text: '已詢問 5 次', label: '頁面上的次數是「已詢問 5 次」：整整 50 秒裡，在背景的 20 秒一次也沒有問' },
  ],
};

const examples: WebExample[] = [startup, yielding, frame, transform, visibility];

// ---- exercise 1: chunks that yield -------------------------------------------------------------------------------------

const menuHtml = (total: number, batch: number) => `<h1>全部菜色</h1>
<p>
  <button id="show" type="button">顯示全部菜色</button>
  <button id="add" type="button">加入購物車</button>
</p>
<p id="progress">尚未顯示</p>
<p id="cart">購物車：0 件</p>
<ol id="menu"></ol>
<script>
  const TOTAL = ${total}; // 菜色的總數
  const BATCH = ${batch}; // 一批畫幾道
  let shown = 0;      // 已經畫好幾道

  // 畫出下一批菜色，並排一件 0 毫秒的小任務：輪到它時，把當時畫面上的進度印出來
  function drawBatch() {
    for (let i = 1; i <= BATCH; i += 1) {
      const item = document.createElement('li');
      item.textContent = '菜色 ' + (shown + i);
      document.querySelector('#menu').append(item);
    }
    shown += BATCH;
    document.querySelector('#progress').textContent = '已顯示 ' + shown + ' / ' + TOTAL + ' 道';
    setTimeout(() => console.log('畫面更新：' + document.querySelector('#progress').textContent), 0);
  }

  // 讓路：等一個 0 毫秒的計時器
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));

  {
    let inCart = 0;
    document.querySelector('#add').addEventListener('click', () => {
      inCart += 1;
      document.querySelector('#cart').textContent = '購物車：' + inCart + ' 件';
      console.log('點擊：加入購物車（這時已顯示 ' + shown + ' 道）');
    });
  }
</script>
<script src="script.js"></script>`;
const MENU_CSS = PAGE_CSS + String.raw`
button { margin: 0 8px 8px 0; }
#menu { height: 120px; margin: 8px 0 0; padding-left: 56px; overflow-y: auto; border: 1px solid #b0bec5; }`;
const showAllJs = (comment: string, body: string, listener = "document.querySelector('#show').addEventListener('click', showAll);") => `${comment}
${body}

${listener}`;
const chunkSteps = (total: number, batch: number): WebStep[] => {
  const marks = Array.from({ length: total / batch }, (_, i) => (i + 1) * batch);
  const tap = `點擊：加入購物車（這時已顯示 ${batch} 道）`;
  return [
    { do: 'click', selector: '#show' },
    { do: 'click', selector: '#add' },
    { check: 'console', match: 'includes', lines: [tap], label: `按下「顯示全部菜色」後緊接著按「加入購物車」：點擊被處理時只畫好第一批（${batch} 道），沒有等 ${total} 道都畫完` },
    { check: 'text', selector: '#cart', text: '購物車：1 件', label: '購物車的數字已經變成 1 件' },
    { do: 'wait', ms: 1000 },
    { check: 'console', match: 'includes', lines: [tap, ...marks.map(m => `畫面更新：已顯示 ${m} / ${total} 道`)], label: `每畫完一批，畫面都有機會更新一次：主控台裡的進度依序是 ${marks.join('、')}` },
    { check: 'count', selector: '#menu li', count: total, label: `最後清單裡有 ${total} 道菜` },
    { check: 'text', selector: '#progress', text: `已顯示 ${total} / ${total} 道`, label: `進度文字是「已顯示 ${total} / ${total} 道」` },
  ];
};

const exChunks: WebExercise = {
  id: 'mob10-ex-chunks', title: '把畫出全部菜色的長任務切開',
  statement: 'index.html 不能改。它準備了三個變數：`TOTAL`（菜色總數）、`BATCH`（一批幾道）、`shown`（已經畫好幾道），以及兩個函式。`drawBatch()` 畫出下一批菜色，同時排一件 0 毫秒的小任務，輪到它的時候把當時畫面上的進度印在主控台：這件小任務代表瀏覽器在兩件任務之間才有的機會（更新畫面、處理點擊）。`pause()` 回傳一個等 0 毫秒計時器的 Promise。現在 script.js 的 `showAll` 用迴圈把所有批次一口氣畫完，是一件長任務。請修改 `showAll`：按下「顯示全部菜色」的那一件任務裡只畫第一批，之後每畫完一批就讓路一次，直到全部畫完。檢查會在按下「顯示全部菜色」之後立刻按「加入購物車」：這次點擊要在只畫好第一批的時候就被處理；接著主控台要依序出現每一批之後的進度（200、400、600）。檢查還會換一組總數與批次大小再執行一次，所以請用 `TOTAL` 與 `shown` 判斷，不要把批數寫死。檢查裡的計時器由頁面自己的時鐘控制，請用 `pause()` 或 `setTimeout` 讓路。',
  hints: [
    '迴圈的條件不用改。要改的是每一圈結束時發生的事：現在它立刻進入下一圈，中間沒有任何空檔。',
    '`pause()` 回傳一個 Promise。要「等」它，`showAll` 必須是 `async` 函式，而且呼叫的前面要寫 `await`。',
    '在 `function showAll()` 的前面加上 `async`，在 `drawBatch();` 的下一行寫 `await pause();`。',
  ],
  explanation: '`await pause()` 讓 `showAll` 在這裡停下來，等一個 0 毫秒的計時器；計時器的回呼是一件新的任務，所以迴圈的下一圈被排到任務佇列的後面。目前這件任務就此結束，瀏覽器可以先處理排隊中的點擊、更新畫面，再回來畫下一批。按下按鈕的那件任務裡仍然先畫了第一批，使用者馬上看得到東西。用 `setTimeout` 寫成「畫一批，再用計時器排下一批」的遞迴函式，效果相同，也能通過檢查。每一批還是要夠小：這裡的一批只是幾百個清單項目，真正的頁面要在節流的條件下錄影，確認每一批都不是長任務。',
  viewport: PHONE,
  fixed: { html: menuHtml(600, 200), css: MENU_CSS },
  starter: { js: showAllJs('// 現在：所有批次都擠在同一件任務裡，中間沒有讓路', String.raw`function showAll() {
  while (shown < TOTAL) {
    drawBatch();
  }
}`) },
  solution: { js: showAllJs('// 每畫完一批就讓路一次：下一批成了另一件任務', String.raw`async function showAll() {
  while (shown < TOTAL) {
    drawBatch();
    await pause();
  }
}`) },
  steps: chunkSteps(600, 200),
  mistakes: [
    {
      files: { js: showAllJs('// 呼叫了 pause()，卻沒有等它', String.raw`function showAll() {
  while (shown < TOTAL) {
    drawBatch();
    pause();
  }
}`) },
      why: '呼叫了 `pause()` 卻沒有寫 `await`（函式也不是 `async`）。計時器照樣排了，迴圈卻沒有停下來等它，立刻進入下一圈：所有批次仍然在同一件任務裡畫完，點擊要等到 600 道都畫好才被處理，三次「畫面更新」看到的也都是 600。',
    },
    {
      files: { js: showAllJs('// 每一批之後等一個已經完成的 Promise', String.raw`async function showAll() {
  while (shown < TOTAL) {
    drawBatch();
    await Promise.resolve();
  }
}`) },
      why: '`await` 的是一個已經完成的 Promise。後面的程式只排進微任務佇列，而瀏覽器要把微任務全部做完，才輪得到下一件任務：三批還是一口氣畫完，點擊照樣排在最後。有 `await` 不等於有讓路，等待的必須是計時器這類真正的任務。',
    },
    {
      files: { js: showAllJs('// 把整個迴圈延後', String.raw`function showAll() {
  while (shown < TOTAL) {
    drawBatch();
  }
}`, String.raw`document.querySelector('#show').addEventListener('click', () => {
  setTimeout(showAll, 0);
});`) },
      why: '用 `setTimeout` 把整個 `showAll` 延後。按下按鈕的那一刻什麼都沒畫，使用者看不到任何回饋；輪到它執行時，所有批次仍然擠在同一件任務裡。延後只是把長任務搬到晚一點，並沒有把它切開：那之後的點擊一樣要等。',
    },
  ],
  variants: [{
    title: '另一份菜單：500 道，一批 100 道',
    fixed: { html: menuHtml(500, 100) },
    steps: chunkSteps(500, 100),
  }],
};

// ---- exercise 2: a debounced search ---------------------------------------------------------------------------------

const SEARCH_HTML = String.raw`<h1>搜尋菜色</h1>
<label for="q">想吃什麼？</label>
<input id="q" type="search" autocomplete="off">
<p id="count">已送出 0 次請求</p>
<ul id="result"></ul>
<script>
  // 向伺服器搜尋，把回應的菜名畫進 #result（這個函式不用改）
  let sent = 0;
  async function search(text) {
    sent += 1;
    document.querySelector('#count').textContent = '已送出 ' + sent + ' 次請求';
    const response = await fetch('/api/dishes?q=' + encodeURIComponent(text));
    const dishes = await response.json();
    const items = dishes.map(name => {
      const item = document.createElement('li');
      item.textContent = name;
      return item;
    });
    document.querySelector('#result').replaceChildren(...items);
  }
</script>
<script src="script.js"></script>`;
const SEARCH_CSS = PAGE_CSS + String.raw`
label { display: block; margin-bottom: 4px; }
#q { box-sizing: border-box; width: 100%; height: 44px; padding: 0 12px; font: inherit; }
#result { margin: 8px 0 0; padding-left: 24px; }`;
const dishes = (word: string, ...names: string[]): WebRoute => ({ path: '/api/dishes?q=' + encodeURIComponent(word), body: names });
const NO_DISHES: WebRoute = { path: '/api/dishes', body: [] };
const searchJs = (...body: string[]) => ["const input = document.querySelector('#q');", ...body].join('\n');

const exDebounce: WebExercise = {
  id: 'mob10-ex-debounce', title: '搜尋框：停下來才送出請求',
  statement: 'index.html 不能改。它定義了 `search(text)`：向 `/api/dishes?q=…` 送出請求，把伺服器回應的菜名畫進 `#result`；每呼叫一次，「已送出幾次請求」就加一。現在 script.js 在每一次 `input` 事件都呼叫 `search`：連續輸入三次就送出三個請求，前兩個的結果沒有人要看。請替它加上防彈跳：使用者停止輸入滿 300 毫秒，才用輸入框當時的文字搜尋一次；300 毫秒內又有新的輸入，就取消原本排的那一次、重新計時。檢查會模擬打字：每 100 毫秒輸入一次，停下來之後在第 250 毫秒確認還沒有任何請求，在第 350 毫秒確認正好送出一次，並確認畫出來的是最後輸入的那個詞的結果；接著再打另一個詞，確認只多一次請求。',
  hints: [
    '不要在監聽器裡直接呼叫 `search`：改成排一個 300 毫秒後才執行的計時器。',
    '每一次輸入都要先取消上一次排的計時器。`setTimeout` 會回傳編號，把它存在監聽器「外面」的變數裡，下一次輸入才拿得到。',
    '在監聽器外面寫 `let timer = null;`；監聽器裡先 `clearTimeout(timer);`，再 `timer = setTimeout(() => search(input.value), 300);`。',
  ],
  explanation: '每一次輸入都做兩件事：`clearTimeout(timer)` 取消上一次還沒執行的搜尋，`setTimeout` 再排一次新的。只要使用者還在打字，計時器就一直被取消、重排；停下來滿 300 毫秒，最後排的那一次才真的執行，而且回呼執行時才讀 `input.value`，拿到的是完整的文字。三次輸入只送出一個請求：少做兩次搜尋的工作，也少送兩個沒有人要看的請求。`timer` 必須宣告在監聽器的外面：宣告在裡面的話，每一次輸入都是一個全新的變數，`clearTimeout` 拿到的永遠不是上一次的編號。',
  viewport: PHONE,
  fixed: { html: SEARCH_HTML, css: SEARCH_CSS },
  setup: { api: [dishes('牛肉麵', '紅燒牛肉麵', '清燉牛肉麵'), dishes('滷肉飯', '滷肉飯', '滷肉飯便當'), NO_DISHES] },
  starter: { js: searchJs('', '// 現在：每打一個字就搜尋一次', "input.addEventListener('input', () => {", '  search(input.value);', '});') },
  solution: { js: searchJs('let timer = null; // 上一次排的搜尋', '', "input.addEventListener('input', () => {", '  clearTimeout(timer);', '  timer = setTimeout(() => search(input.value), 300);', '});') },
  steps: [
    { do: 'input', selector: '#q', value: '牛' },
    { do: 'wait', ms: 100 },
    { do: 'input', selector: '#q', value: '牛肉' },
    { do: 'wait', ms: 100 },
    { do: 'input', selector: '#q', value: '牛肉麵' },
    { do: 'wait', ms: 250 },
    { check: 'request', path: '/api/dishes', count: 0, label: '每 100 毫秒輸入一次、共三次，再停 250 毫秒：一個請求都還沒有送出' },
    { do: 'wait', ms: 100 },
    { check: 'request', path: '/api/dishes', count: 1, label: '停止輸入 350 毫秒時：正好送出 1 次請求' },
    { do: 'wait', ms: 200 },
    { check: 'text', selector: '#result li:first-child', text: '紅燒牛肉麵', label: '畫出來的是「牛肉麵」的搜尋結果：搜尋用的是最後輸入的完整文字' },
    { do: 'input', selector: '#q', value: '滷' },
    { do: 'wait', ms: 100 },
    { do: 'input', selector: '#q', value: '滷肉飯' },
    { do: 'wait', ms: 350 },
    { do: 'wait', ms: 200 },
    { check: 'request', path: '/api/dishes', count: 2, label: '再輸入兩次、停下來：只多送出 1 次請求，一共 2 次' },
    { check: 'text', selector: '#result li:first-child', text: '滷肉飯', label: '結果換成「滷肉飯」的' },
  ],
  mistakes: [
    {
      files: { js: searchJs('', "input.addEventListener('input', () => {", '  setTimeout(() => search(input.value), 300);', '});') },
      why: '只把搜尋延後 300 毫秒，沒有取消上一次排的計時器。三次輸入排了三個計時器，全部都會執行：請求一個也沒少，只是晚了 300 毫秒才送。防彈跳少不了 `clearTimeout`。',
    },
    {
      files: { js: searchJs('', "input.addEventListener('input', () => {", '  let timer = null;', '  clearTimeout(timer);', '  timer = setTimeout(() => search(input.value), 300);', '});') },
      why: '`timer` 宣告在監聽器裡面。每一次輸入執行監聽器時，它都是一個全新的變數，值是 `null`：`clearTimeout(null)` 什麼也沒取消，上一次排的搜尋照樣執行。存編號的變數要宣告在監聽器外面。',
    },
    {
      files: { js: searchJs('let waiting = false;', '', "input.addEventListener('input', () => {", '  if (waiting) return;', '  waiting = true;', '  search(input.value);', '  setTimeout(() => { waiting = false; }, 300);', '});') },
      why: '改成「第一次輸入立刻搜尋，接下來的 300 毫秒不理會任何輸入」。請求確實只有一個，但搜尋的是第一個字「牛」，使用者打完「牛肉麵」之後看到的卻不是它的結果。防彈跳要等使用者停下來，用最後的文字搜尋。',
    },
  ],
  variants: [{
    title: '打得更快的另一個詞',
    setup: { api: [dishes('珍珠奶茶', '珍珠奶茶', '珍珠鮮奶茶'), NO_DISHES] },
    steps: [
      { do: 'input', selector: '#q', value: '珍' },
      { do: 'wait', ms: 50 },
      { do: 'input', selector: '#q', value: '珍珠' },
      { do: 'wait', ms: 50 },
      { do: 'input', selector: '#q', value: '珍珠奶' },
      { do: 'wait', ms: 50 },
      { do: 'input', selector: '#q', value: '珍珠奶茶' },
      { do: 'wait', ms: 250 },
      { check: 'request', path: '/api/dishes', count: 0, label: '四次輸入之後停 250 毫秒：還沒有請求' },
      { do: 'wait', ms: 100 },
      { check: 'request', path: '/api/dishes', count: 1, label: '停止輸入 350 毫秒時：正好 1 次請求' },
      { do: 'wait', ms: 200 },
      { check: 'text', selector: '#result li:first-child', text: '珍珠奶茶', label: '畫出來的是完整文字的搜尋結果' },
    ],
  }],
};

// ---- exercise 3: from right to transform --------------------------------------------------------------------------------

const sheetHtml = (open: boolean) => `<header class="top">
  <h1>小島外送</h1>
  <button id="toggle" type="button" aria-expanded="${open}" aria-controls="cart">購物車</button>
</header>
<main>
  <p>今日菜單：紅燒牛肉麵、滷肉飯、燙青菜。</p>
</main>
<aside id="cart" class="sheet${open ? ' open' : '" inert="'}">
  <h2>購物車</h2>
  <p>紅燒牛肉麵 × 1</p>
</aside>`;
const SHEET_JS = String.raw`const toggle = document.querySelector('#toggle');
const cart = document.querySelector('#cart');

// 按一下：加上或拿掉 open 類別；關著的面板用 inert 讓鍵盤與螢幕閱讀器略過
toggle.addEventListener('click', () => {
  const open = cart.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
  cart.inert = !open;
});`;
const sheetCss = (rules: string) => String.raw`body { margin: 0; font-family: sans-serif; }
/* 這幾條請保留 */
.top { display: flex; justify-content: space-between; align-items: center; height: 56px; padding: 0 16px; background: #0d47a1; color: white; }
.top h1 { margin: 0; font-size: 20px; }
#toggle { min-height: 44px; padding: 0 16px; font: inherit; }
main { padding: 16px; }
.sheet { position: fixed; top: 56px; bottom: 0; box-sizing: border-box; width: 280px; padding: 16px; background: #fff8e1; }
.sheet h2 { margin: 0 0 8px; font-size: 18px; }

` + rules;
const SHEET_PROPERTIES = ['transform', 'translate', 'transform, opacity', 'opacity, transform', 'transform, visibility', 'visibility, transform'];
const sheetChecks = (left: number, state: string): WebStep[] => [
  { check: 'box', selector: '#cart', measure: 'left', value: left, label: `${state}：面板的左邊緣在 ${left}px` },
  { check: 'style', selector: '#cart', property: 'right', value: '0px', label: `${state}：面板的 \`right\` 是 0，版面位置和另一個狀態相同` },
  { check: 'style', selector: '#cart', property: 'transition-property', value: SHEET_PROPERTIES, label: '漸變的屬性是 `transform`，沒有任何版面屬性' },
];

const exTransform: WebExercise = {
  id: 'mob10-ex-transform', title: '購物車面板：把動畫從 right 換成 transform',
  statement: 'index.html 與 script.js 不能改：按「購物車」，指令稿會替面板 `#cart` 加上或拿掉 `open` 類別。現在 style.css 最後的兩條規則用 `right` 把面板移進移出（關閉時 `right: -280px`，打開時 `right: 0`），漸變的也是 `right`，動畫的每一個畫格都要重新排版。請只改寫這兩條規則：（1）面板的 `right` 不論開或關都是 `0`，也就是它的版面位置就是打開時的位置；（2）關閉時（沒有 `open`）用 `transform` 把它往右移出畫面，打開時回到原位；（3）`transition` 只列出 `transform`，時間維持 `0.3s`。面板寬 280px，檢查用的視窗寬 360px：關閉時面板的左邊緣要在 360px，打開時在 80px。漸變要花真實的時間，檢查沒辦法等它，所以「打開」的狀態是用另一份一開始就帶著 `open` 類別的 index.html 檢查的。上方標示「請保留」的規則不要更動。',
  hints: [
    '先決定面板在版面裡的位置：讓它一直待在打開時的地方，`right` 就不必再變了。',
    '關閉的面板要往右移一個面板的寬度。`translateX()` 可以寫 `280px`，也可以寫 `100%`（元素自己的寬度）。',
    '`.sheet` 寫 `right: 0; transform: translateX(100%); transition: transform 0.3s;`，`.sheet.open` 寫 `transform: translateX(0);`。',
  ],
  explanation: '面板的 `right` 固定是 `0`：對版面來說它一直在打開時的位置，開關的過程不需要重新排版。關閉時 `transform: translateX(280px)` 只是把它「畫」到視窗外面，打開時回到 `translateX(0)`；`transition: transform 0.3s` 讓這個改變變成動畫，而 `transform` 的動畫通常只需要合成，不經過排版與繪製，在低階裝置上順得多。`translateX(100%)` 的百分比是元素自己的寬度，面板改寬度時不必跟著改數字，是更常見的寫法。真實的頁面還應該照「Media Query 與斷點策略」那一課，替開啟「減少動態效果」的使用者把 `transition-duration` 改成 `0s`；檢查無法切換這個設定，所以這一題沒有要求。',
  viewport: PHONE,
  fixed: { html: sheetHtml(false), js: SHEET_JS },
  starter: { css: sheetCss(String.raw`/* 請改寫下面兩條：現在用 right 把面板移進移出 */
.sheet {
  right: -280px;
  transition: right 0.3s;
}
.sheet.open {
  right: 0;
}`) },
  solution: { css: sheetCss(String.raw`/* 版面位置固定在打開時的地方，關閉時用 transform 移出畫面 */
.sheet {
  right: 0;
  transform: translateX(280px);
  transition: transform 0.3s;
}
.sheet.open {
  transform: translateX(0);
}`) },
  steps: sheetChecks(360, '關閉時'),
  mistakes: [
    {
      files: { css: sheetCss(String.raw`.sheet {
  right: -280px;
  transition: transform 0.3s;
}
.sheet.open {
  right: 0;
}`) },
      why: '只把 `transition` 裡的 `right` 換成 `transform`，移動面板的仍然是 `right`。現在改變的屬性（`right`）不在漸變的清單裡，面板會瞬間跳進跳出，連動畫都沒有了；`transform` 則從頭到尾沒有變過。要換的是「用哪個屬性移動」，不只是 `transition` 後面的字。',
    },
    {
      files: { css: sheetCss(String.raw`.sheet {
  right: 0;
  transform: translateX(280px);
  transition: right 0.3s;
}
.sheet.open {
  transform: translateX(0);
}`) },
      why: '位移改用 `transform` 了，`transition` 卻還寫著 `right`。`right` 已經不會改變，真正在變的 `transform` 又不在漸變的清單裡：面板同樣是瞬間跳到定位。`transition` 列的屬性要和實際改變的屬性一致。',
    },
    {
      files: { css: sheetCss(String.raw`.sheet {
  right: 0;
  transform: translateX(280px);
  transition: all 0.3s;
}
.sheet.open {
  transform: translateX(0);
}`) },
      why: '用了 `transition: all`。這一頁現在看起來沒問題，但 `all` 會讓這個元素日後任何屬性的改變都變成動畫，包括寬度、內距這些版面屬性，等於替昂貴的動畫留了後門。請明確寫出 `transform`。',
    },
  ],
  variants: [{
    title: '面板一開始就是打開的',
    fixed: { html: sheetHtml(true) },
    steps: sheetChecks(80, '打開時'),
  }],
};

// ---- exercise 4: polling that pauses, resumes and ends ------------------------------------------------------------------

const ORDER_HTML = String.raw`<h1>訂單進度</h1>
<p id="state" role="status">查詢中…</p>
<p id="asked">已詢問 0 次</p>
` + VISIBILITY_HELPER;
const orderJs = (ask: string, tail: string) => String.raw`const state = document.querySelector('#state');
const asked = document.querySelector('#asked');
let count = 0;
let timer = null;
let done = false; // 訂單送達了嗎

async function ask() {
  count += 1;
  asked.textContent = '已詢問 ' + count + ' 次';
  const response = await fetch('/api/order?ask=' + count);
  const order = await response.json();
` + ask + String.raw`
  if (order.done) {
    done = true;
    stop();
  }
}

function start() { // 先問一次，之後每 10 秒問一次
  ask();
  timer = setInterval(ask, 10000);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

start();

` + tail;
const SHOW_STATE = '  state.textContent = order.state;';
const order = (asks: number, state: string): WebRoute => ({ path: '/api/order?ask=' + asks, body: { state, done: false } });
const DELIVERED: WebRoute = { path: '/api/order', body: { state: '已送達', done: true } };
const HIDE: WebStep = { do: 'dispatch', selector: 'body', event: 'page-hide' };
const SHOW: WebStep = { do: 'dispatch', selector: 'body', event: 'page-show' };
const asks = (count: number, label: string): WebStep => ({ check: 'request', path: '/api/order', count, label });

const exPolling: WebExercise = {
  id: 'mob10-ex-polling', title: '訂單進度：背景暫停，回來恢復，送達就不再問',
  statement: "index.html 不能改。它提供替身 `page`：`page.visibilityState` 是 `'visible'` 或 `'hidden'`，改變時 `page` 上會觸發 `visibilitychange` 事件（在真實的網站上，這兩者是 `document.visibilityState` 與 `document` 的 `visibilitychange`）。script.js 已經會輪詢：`start()` 先問一次、之後每 10 秒問一次，`stop()` 清掉計時器；伺服器回答 `done: true`（已送達）時，`ask` 把 `done` 設成 `true` 並停止。問題是頁面在背景時，它照樣每 10 秒問一次。請在 script.js 的最後加上監聽器：（1）頁面變成 `hidden` 時停止輪詢；（2）回到 `visible` 時立刻問一次，並恢復每 10 秒一次；（3）訂單送達之後，不論頁面怎麼切換，都不再送出任何請求。同一時間只能有一個計時器在問。在預覽裡可以用兩個「模擬」按鈕切換；檢查則在 `body` 上觸發 `page-hide` 與 `page-show` 事件，並依頁面的時鐘數請求的次數。",
  hints: [
    '`start()` 與 `stop()` 都寫好了。你要寫的只有一個監聽器，由它決定什麼時候呼叫哪一個。',
    "用 `page.addEventListener('visibilitychange', …)` 登記；在監聽器裡讀 `page.visibilityState`：是 `'hidden'` 就 `stop()`，否則 `start()`。",
    '回到前景時先看 `done`：訂單已經送達就什麼都不做，寫成 `else if (!done) start();`。',
  ],
  explanation: "監聽器在頁面被藏起來時呼叫 `stop()`，`clearInterval` 把計時器清掉：背景的那段時間，處理器不會每 10 秒被叫醒，無線通訊也不必為了沒有人看的資料保持運作。回到前景時 `start()` 先問一次，因為離開的這段時間畫面上的資料已經舊了，接著才恢復每 10 秒一次。`!done` 是容易漏掉的一步：訂單送達後 `ask` 已經把輪詢停掉，如果回到前景時無條件 `start()`，一個早就結束的輪詢會被重新啟動，而且再也不會停。因為背景時一定先 `stop()`，回來才 `start()`，頁面上同一時間只會有一個計時器。真實的網站只要把 `page` 換成 `document`。",
  viewport: PHONE,
  fixed: { html: ORDER_HTML, css: VISIBILITY_CSS },
  setup: { api: [order(1, '餐點準備中'), order(2, '餐點準備中'), order(3, '外送中'), order(4, '外送中'), DELIVERED] },
  starter: { js: orderJs(SHOW_STATE, '// 在這裡加上監聽器：背景時停止，回到前景時恢復，送達之後不再啟動') },
  solution: { js: orderJs(SHOW_STATE, String.raw`// 真實的網站：把 page 換成 document
page.addEventListener('visibilitychange', () => {
  if (page.visibilityState === 'hidden') stop();
  else if (!done) start();
});`) },
  steps: [
    { do: 'wait', ms: 300 },
    { do: 'wait', ms: 10000 },
    asks(2, '頁面在前景的前 10 秒：載入時問一次，10 秒後再問一次，共 2 次請求'),
    HIDE,
    { do: 'wait', ms: 10000 },
    { do: 'wait', ms: 10000 },
    asks(2, '切到背景之後過了 20 秒：一次也沒有多問，仍然是 2 次'),
    SHOW,
    { do: 'wait', ms: 300 },
    asks(3, '回到前景：立刻問一次（第 3 次），不等下一個 10 秒'),
    { do: 'wait', ms: 10000 },
    asks(4, '再過 10 秒：第 4 次。恢復成每 10 秒一次，而且只有一個計時器在問'),
    { do: 'wait', ms: 10000 },
    HIDE,
    SHOW,
    { do: 'wait', ms: 300 },
    asks(5, '第 5 次的回答是「已送達」；之後再切到背景、又回到前景：請求停在 5 次，沒有重新開始輪詢'),
    { check: 'text', selector: '#state', text: '已送達', label: '畫面顯示「已送達」' },
  ],
  mistakes: [
    {
      files: { js: orderJs(SHOW_STATE, String.raw`page.addEventListener('visibilitychange', () => {
  if (page.visibilityState === 'hidden') stop();
});`) },
      why: '只處理了「藏起來就停」，沒有處理回來的時候。使用者回到頁面之後，畫面永遠停在離開前的那個狀態，再也不會更新：他以為餐點還在準備，其實早就送到門口了。暫停一定要配上恢復。',
    },
    {
      files: { js: orderJs(SHOW_STATE, String.raw`page.addEventListener('visibilitychange', () => {
  if (page.visibilityState === 'hidden') stop();
  else start();
});`) },
      why: '回到前景時無條件呼叫 `start()`。訂單還在路上時沒有問題；可是送達之後輪詢本來已經停了，使用者只要切出去再回來，它就被重新啟動：立刻多問一次，之後每 10 秒一次，而且再也不會停。恢復之前要先確認 `done`。',
    },
    {
      files: { js: orderJs(String.raw`  if (page.visibilityState === 'hidden') return; // 背景時不更新畫面
  state.textContent = order.state;`, '') },
      why: '改成「頁面在背景時，收到回應也不更新畫面」。計時器照樣每 10 秒把處理器叫醒，請求照樣送出，省下的只有改一行文字的工作；耗電的部分一點也沒少。要停的是計時器，不是畫面的更新。',
    },
  ],
  variants: [{
    title: '另一張訂單：第二次詢問時就送達',
    setup: { api: [order(1, '外送中'), DELIVERED] },
    steps: [
      { do: 'wait', ms: 300 },
      HIDE,
      { do: 'wait', ms: 10000 },
      { do: 'wait', ms: 10000 },
      asks(1, '載入時問一次，接著在背景的 20 秒沒有多問'),
      SHOW,
      { do: 'wait', ms: 300 },
      asks(2, '回到前景立刻問第 2 次'),
      { check: 'text', selector: '#state', text: '已送達', label: '第 2 次的回答是「已送達」' },
      HIDE,
      SHOW,
      { do: 'wait', ms: 10000 },
      asks(2, '送達之後再切換、再等 10 秒：請求停在 2 次'),
    ],
  }],
};

const exercises: WebExercise[] = [exChunks, exDebounce, exTransform, exPolling];

// ---- the lesson ---------------------------------------------------------------------------------------------------------

export const MOB10: LessonContent = {
  lessonId: 'MOB10',
  motivation: '在你的電腦上一切流暢的頁面，到了使用者那支用了幾年的手機上，可能按了沒反應、動畫一頓一頓，還讓手機發燙。這一課教你在節流的條件下重現並量測這些問題，把佔住主執行緒的長任務切開、延後或乾脆不做，讓動畫只動 `transform` 與 `opacity`，並在沒有人看的時候把輪詢與動畫停下來。學完後你能找出一個頁面在低階手機上卡頓的原因並改善。',
  sections: [
    {
      id: 'mob10-s-lowend', title: '低階裝置：在你的電腦上很順，不代表在手機上也順',
      blocks: [
        { type: 'p', text: '開發網頁用的多半是效能不錯的電腦，接著穩定的網路，還插著電。使用者手上的卻可能是一支低階裝置（low-end device）：價格便宜、或已經用了好幾年的手機，處理器比你的電腦慢得多，記憶體也少；它走的是時快時慢的行動網路，而且靠電池供電。開了省電模式或機身發燙的時候，系統通常還會再把處理器放慢。同一份 JavaScript，在你的電腦上一眨眼就執行完，在這樣的手機上可能就是一段「按了沒反應」的時間。' },
        { type: 'p', text: '所以「在我的電腦上很順」說明不了什麼。「網頁效能基礎：載入與 Core Web Vitals」那一課介紹過兩件事，這一課會一直用到：頁面的 JavaScript、事件的監聽器與畫面的更新都排在同一條主執行緒上，一件超過 50 毫秒的任務稱為長任務；而量測要用開發者工具的 Performance（效能）面板錄影，再和真實使用者的資料對照。這一課把鏡頭移到手機上：先讓你的電腦「變慢」來重現問題，再處理行動裝置上最常見的三種原因：長任務、昂貴的動畫，以及沒有人在看卻停不下來的工作。' },
        { type: 'p', text: '讓電腦變慢的方法叫節流（throttling）：開發者工具可以刻意把處理器與網路放慢，讓你在桌上就看得到問題。下面以 Chromium 系列瀏覽器（例如 Chrome、Edge）的開發者工具為例，說明在節流的條件下量測的步驟；選項的位置與名稱會隨版本變動，其他瀏覽器提供的節流功能也不完全相同，但要做的事是一樣的：' },
        { type: 'list', ordered: true, items: [
          '打開開發者工具，切到裝置模擬模式，選一個手機的尺寸。',
          '在 Performance 面板的設定裡開啟 CPU 節流（CPU throttling），選一個放慢的等級；再開啟網路節流（network throttling），選一個比較慢的行動網路設定。',
          '按下錄製，實際做一次會卡的操作，例如頁面一載入就按主要的按鈕、在搜尋框打字、打開面板，然後停止錄製。',
          '在時間軸上主執行緒的那一列，找被標示出來的長任務；點開它，看時間花在哪一個函式。',
          '修改之後，用完全相同的設定再錄一次，比較同一個操作。',
        ] },
        { type: 'p', text: '節流是放大鏡，不是真的手機。它告訴你的與沒有告訴你的，要分清楚：' },
        { type: 'table', head: ['工具', '模擬得到', '模擬不到'], rows: [
          ['CPU 節流', '把頁面的工作放慢：長任務變得更長，更容易在時間軸上看見', '真實手機的記憶體上限、繪圖晶片的能力、發燙之後的降速，以及其他 App 同時在搶資源'],
          ['網路節流', '比較慢的下載速度與比較久的回應延遲', '訊號時有時無、走進電梯就斷線這一類真實的不穩定'],
          ['裝置模擬模式', '手機的視窗尺寸與觸控事件', '它仍然是你電腦上的瀏覽器與硬體，不是手機的'],
        ] },
        { type: 'p', text: '因此節流用來找原因、比較修改前後；結論要在真的手機上確認，尤其是你的使用者實際在用的那一類低階裝置。怎麼挑裝置、怎麼把手機接上電腦除錯，是「行動裝置測試：模擬器與真機」那一課的主題。' },
        { type: 'callout', tone: 'note', title: '這一課的頁面不量時間，只看順序與次數', text: '本站的預覽量不出「慢了幾毫秒」：每個人的電腦速度不同，練習的檢查用的又是虛擬的時鐘，計時器不會真的等待。所以這一課的頁面都用數得出來的東西說明問題：做了幾步、畫了幾次、送了幾次請求，以及事情發生的先後。步數在每一台裝置上都一樣，差別只在每一步要花多久；步數少、順序對，在慢的手機上才會快。真正的毫秒數，要用上面的步驟在真實的網站上量。' },
        { type: 'p', text: '下面是小島外送的首頁。它的指令稿一載入就做三件工作，`work` 用迴圈的圈數代表工作量。先看主控台，再看按鈕下方的那一行字。' },
        { type: 'example', id: 'mob10-startup' },
        { type: 'p', text: "三件工作加起來 1200 步，全部擠在指令稿的第一件任務裡，「開始點餐」的監聽器要等它們做完才登記得上；任務結束之前，使用者的點擊只能排隊。在你的電腦上這 1200 步快到感覺不出來，這正是問題被藏起來的原因。可是三件工作裡，只有「畫出菜單」是第一個畫面需要的。展開「動手改這個範例」，把 `work('準備評論區', 400);` 與 `work('準備地圖', 500);` 兩行搬進一個 `setTimeout(() => { … }, 0);` 的大括號裡，再按「執行」：主控台的第二行變成「第一件任務結束：已做 300 步」，另外兩件工作排在它後面才做。工作的總量沒有變，但使用者能開始操作之前要等的，從 1200 步降到 300 步。" },
        { type: 'callout', tone: 'warning', title: '只在自己的電腦上測試', text: '功能做完，在自己的電腦上點一點覺得很順，就上線了：這是最常見的錯誤。你的電腦把長任務藏了起來，使用者的手機卻藏不住。養成習慣：每做完一個會動、要載入資料或要處理大量內容的功能，就開啟 CPU 與網路節流操作一次；上線之前，至少在一支不是最新、最貴的真手機上試過。' },
      ],
    },
    {
      id: 'mob10-s-main', title: '主執行緒：長任務為什麼讓手機卡住，怎麼把它切開',
      blocks: [
        { type: 'p', text: '主執行緒（main thread）是瀏覽器替每個頁面準備的一條工作線。下面這些事都在它上面排隊，一次只做一件：' },
        { type: 'list', items: [
          '執行 JavaScript：指令稿本身、計時器的回呼函式、Promise 的回呼函式。',
          '執行事件的監聽器：點擊、輸入、指標事件。',
          '計算樣式與版面配置：每個元素套用哪些規則、盒子多大、放在哪裡。',
          '準備繪製：決定哪些地方要重畫、要畫成什麼樣子。',
        ] },
        { type: 'p', text: '所以一件長任務進行的時候，使用者按下的按鈕要排隊，打的字不會出現，畫面也停在上一個樣子。捲動是少數的例外：多數瀏覽器把捲動交給另一條執行緒處理，長任務期間頁面通常還捲得動；但「Pointer Events 與觸控事件」那一課說過，只要捲動的地方有非被動的觸控或滾輪監聽器，捲動也得等主執行緒。低階裝置把這一切放大：同一件任務在快的電腦上遠低於 50 毫秒，在慢的手機上就可能成為長任務。' },
        { type: 'p', text: '找出長任務的方法就是上一節的錄影：在節流的條件下錄下卡住的操作，時間軸會把長任務標示出來，點開就能看到是哪個函式佔了時間。找到之後，依序問三個問題：這件工作能不能不做？能不能晚一點做？都不行的話，能不能切成小塊，每做完一塊就讓路（yield）一次？前兩個問題留到下一節，這一節先看最後一個。' },
        { type: 'p', text: '讓路的意思是讓目前這件任務結束，把剩下的工作排成之後的另一件任務；兩件任務之間，瀏覽器才有機會處理排隊中的點擊、更新畫面。「網頁效能基礎：載入與 Core Web Vitals」那一課用 `setTimeout` 把下一批排進佇列；配合「非同步 JavaScript：Promise 與 async／await」那一課的 `await`，可以把它包成一個小工具：`const pause = () => new Promise(resolve => setTimeout(resolve, 0));`。在 `async` 函式的迴圈裡，每處理完一批就寫一行 `await pause();`：這一行之後的程式，要等那個 0 毫秒的計時器到期才繼續，而計時器的回呼是一件新的任務。' },
        { type: 'p', text: '下面的頁面整理 600 筆歷史訂單，一批 200 筆。兩個按鈕執行同一個函式，只差在每一批之後 `await` 的東西：一個等一個已經完成的 Promise，另一個等 `pause()`。這些批次在你的電腦上一瞬間就做完，你來不及在中間按任何東西，所以頁面替你做了這件事：開始整理的同時，`queueTap` 用一個 0 毫秒的計時器排進一件任務，代表使用者在整理期間按了一下。兩個按鈕各按一次，看那次「點擊」在主控台裡排在第幾行。' },
        { type: 'example', id: 'mob10-yield' },
        { type: 'p', text: '按第一個按鈕：三批都整理完了，才輪到那次點擊，它看到的畫面已經是「已整理 600 筆」。按第二個：第一批之後就輪到點擊，那時畫面是「已整理 200 筆」。原因在「非同步 JavaScript：Promise 與 async／await」那一課的事件迴圈：一件任務結束後，瀏覽器會先把微任務佇列清空，才取下一件任務。`await` 一個已經完成的 Promise，後面的程式立刻排進微任務佇列；每一批做完又排進下一批，佇列一直清不完，點擊這件任務就只能等。`await pause()` 等的 Promise 則要到計時器的回呼執行時才完成，而計時器的回呼是一件任務，會乖乖排在那次點擊的後面。' },
        { type: 'callout', tone: 'warning', title: '有 await 不等於有讓路', text: '把函式改成 `async`、在迴圈裡加上 `await`，並不會自動把主執行緒讓出來。`await` 後面如果是已經完成的 Promise，或是一個裡面沒有真正等待任何事的 `async` 函式，接下來的程式只是排進微任務，整段工作對使用者來說仍然是一件長任務：按鈕照樣沒反應，畫面照樣不更新。要讓路，等待的必須是一件真正的任務，例如 `setTimeout` 的計時器。另一個常見的錯誤是呼叫了 `pause()` 卻忘了寫 `await`：計時器照排，迴圈卻沒有停下來等它。' },
        { type: 'p', text: '一批要多大？原則是每一件任務都要短到使用者感覺不出來：以 50 毫秒為上限，而且要在節流的條件下量，不是在你的電腦上量。切得太細也有代價：每一次讓路都要重新排隊，整件工作會晚一點做完，所以用錄影找一個兩邊都能接受的大小。另外，完全不碰 DOM 的大量計算，還可以交給 Web Worker 在另一條執行緒上做；這一課只提名稱。' },
      ],
    },
    {
      id: 'mob10-s-less', title: '少做一點：延後、防彈跳、合併到畫格與先讀後寫',
      blocks: [
        { type: 'p', text: '切開長任務只是讓它不擋路，工作量並沒有變少。在處理器慢、電池小的手機上，更有效的是根本少做。常見的做法有四種：' },
        { type: 'list', items: [
          '延後不急的工作：先做使用者等著看、等著按的，其餘的排到後面。第一節你已經動手做過：把評論區與地圖的準備搬進 `setTimeout`，第一件任務就從 1200 步變成 300 步。統計資料的回報、還看不到的區塊，都屬於可以延後的工作。',
          '防彈跳（debounce）：使用者連續操作時，等他停下來再做一次，不要每一下都做。搜尋框是典型的例子：每輸入一次就有一次 `input` 事件，每次都向伺服器搜尋的話，打完「牛肉麵」至少送出三個請求，只有最後一個的結果有人要看。做法是用一個計時器：每次輸入先 `clearTimeout(timer);` 取消上一次排的搜尋，再 `timer = setTimeout(() => search(input.value), 300);` 重新排一次。只有停止輸入滿 300 毫秒，最後排的那一次才真的執行。',
          '合併到畫格：螢幕每秒重畫許多次，每一次稱為一個畫格（frame）。`pointermove`、`scroll` 這類事件，或從伺服器連續送來的資料，可能在兩個畫格之間就來了好幾筆；每一筆都去改畫面，使用者也只看得到最後一筆的結果。`requestAnimationFrame(函式)` 請瀏覽器在下一次重畫之前呼叫這個函式一次：收到資料時只把最新的值記下來，真正改畫面的工作交給它，一個畫格最多做一次。',
          '先讀後寫：不要在迴圈裡交替讀取與修改版面。這一節的最後說明。',
        ] },
        { type: 'p', text: '下面的頁面示範第三種。按鈕一口氣送進五筆外送員的位置；在真實的頁面上，它們可能來自五次 `pointermove`，或五則伺服器送來的訊息。`onPosition` 只做兩件事：記下最新的位置，以及在還沒預約的時候預約下一個畫格；`draw` 才真的移動方塊、更新文字。' },
        { type: 'example', id: 'mob10-frame' },
        { type: 'p', text: '按一下按鈕，文字是「收到 5 筆，畫了 1 次」：前四筆位置從來沒有畫到螢幕上，也不需要畫，方塊直接出現在最後的 260px。`scheduled` 這個旗標是關鍵：沒有它，五筆資料會預約五次 `draw`，在同一個畫格裡把同樣的結果寫五遍。展開「動手改這個範例」，把 `if (!scheduled) {` 改成 `if (true) {` 再按「執行」試一次，文字會變成「收到 5 筆，畫了 5 次」。' },
        { type: 'p', text: "最後是先讀後寫。「網頁效能基礎：載入與 Core Web Vitals」那一課提過版面抖動：瀏覽器平常會把樣式的修改先記著，等到要畫下一個畫格時才一次重新排版；可是只要你在修改之後立刻讀取 `offsetWidth`、`offsetHeight`、`getBoundingClientRect()` 這類和版面有關的值，它就得當場排版一次才答得出來。迴圈裡寫 `card.style.height = card.offsetWidth / 2 + 'px';`，每一圈都是先讀再寫；從第二圈起，每一次讀取都逼瀏覽器先替上一圈的修改排版，200 張卡片就是將近 200 次排版。改成兩個迴圈：第一個只讀，把每張卡片的寬度存進陣列；第二個只寫。讀的時候版面沒有被改過，瀏覽器不必重排；寫完之後，等下一個畫格排版一次就夠了。" },
        { type: 'callout', tone: 'tip', title: '防彈跳的延遲沒有標準答案', text: '延遲太短，使用者還在打字就送出請求；太長，他停下來之後要等很久才看到結果。300 毫秒左右是常見的起點，實際的數字要拿真實的操作來試。寫的時候注意一個細節：存計時器編號的 `timer` 要宣告在監聽器的外面，下一次輸入才找得到上一次的編號。另外別把兩個名詞弄混：防彈跳是你的程式少做事；第一節的節流是開發者工具把你的電腦變慢，用來量測。' },
      ],
    },
    {
      id: 'mob10-s-animation', title: '動畫效能：只動 transform 與 opacity',
      blocks: [
        { type: 'p', text: '動畫是每一個畫格都改一點東西，所以「改一次要付出多少代價」會乘上畫格的數量，動畫效能看的就是這個代價。「網頁效能基礎：載入與 Core Web Vitals」那一課的關鍵渲染路徑說過，瀏覽器要先做版面配置、再繪製；繪製好的內容最後還要經過合成（compositing），才組成螢幕上的畫面。動畫改的屬性不同，每一個畫格要重做的步驟也不同：' },
        { type: 'table', head: ['動畫改的屬性', '例子', '每一個畫格要重做的事'], rows: [
          ['版面屬性', '`width`、`height`、`margin`、`padding`、`top`、`left`、`right`、`bottom`', '重新排版、重新繪製、再合成；受影響的元素越多越貴'],
          ['只影響外觀的屬性', '`color`、`background-color`、`box-shadow`', '不必排版，但要重新繪製、再合成'],
          ['`transform` 與 `opacity`', '`transform: translateX(…)`、`scale(…)`、`rotate(…)`，以及 `opacity`', '通常只要合成：元素被當成一張已經畫好的圖，由合成器（compositor）移動、縮放或改變透明度'],
        ] },
        { type: 'p', text: '第三列就是通則：動畫盡量只改 `transform` 與 `opacity`。它們不改變版面，其他元素不必跟著動；而且合成通常不在主執行緒上進行，就算主執行緒正忙著一件長任務，用 CSS 漸變寫的這類動畫多半還能繼續動。各家瀏覽器的做法不完全相同，所以這裡說的是「通常」，但方向是一致的。' },
        { type: 'p', text: '下面的頁面用兩種方式把外送員的方塊往右移 200px。頁面一開始就是「已出發」的狀態；按按鈕，兩個方塊會一起滑回店家，再按一次又出發。漸變用的是「Media Query 與斷點策略」那一課見過的 `transition-property` 與 `transition-duration`，這裡合寫成一行，例如 `transition: transform 0.6s`。' },
        { type: 'example', id: 'mob10-transform' },
        { type: 'p', text: '兩個方塊在畫面上走的距離一樣，差別在旁邊的「外送員」標籤。上面那一列改的是 `margin-left`：方塊在版面裡真的往右移了，標籤被推著走；滑動的過程中，瀏覽器每一個畫格都要替這一列重新排版。下面那一列改的是 `transform`：版面裡的方塊從頭到尾都在原地，所以標籤一動也不動，方塊只是被「畫」在右邊 200px 的地方。這也提醒你一件事：用 `transform` 移動的元素不會把別人推開。所以要先把元素排在它該在的位置，再用 `transform` 把它移開或移回來。常見的寫法是：面板的版面位置就是打開時的位置，關閉時用 `translateX(100%)` 或 `translateY(100%)` 把它移出畫面；百分比指的是元素自己的寬度或高度。' },
        { type: 'p', text: '範例裡下面的方塊還寫了 `will-change: transform`。它是給瀏覽器的提示：這個元素的 `transform` 即將改變，可以先替它準備好獨立的圖層，動畫開始時就不必臨時準備。它不是越多越好：每一個圖層都要佔記憶體，而記憶體正是低階裝置最缺的東西。只加在少數真的會動、而且動的時候看得出卡頓的元素上，不要寫成套用到所有元素的規則。' },
        { type: 'p', text: '用 JavaScript 逐格改畫面的動畫，例如跟著手指移動的元素，要用上一節的 `requestAnimationFrame`，不要用 `setInterval`。計時器不知道螢幕什麼時候重畫：它可能在兩次重畫之間執行兩次，白做一次；也可能來不及趕上某一次重畫，動畫就頓一下。`requestAnimationFrame` 的回呼跟著螢幕的節奏，每個畫格一次；頁面看不到的時候，瀏覽器通常就不呼叫它。回呼裡同樣只改 `transform` 或 `opacity`。' },
        { type: 'p', text: '最後，動畫不是每個人都想要的。「Media Query 與斷點策略」那一課介紹過 `prefers-reduced-motion`：使用者在系統裡開啟「減少動態效果」時，把漸變的時間改成 0，或換成不會大範圍移動的效果。範例的樣式表最後就有這條規則；預覽跟著你自己的系統設定走，所以如果方塊是瞬間跳過去的，就是這條規則在作用。' },
        { type: 'callout', tone: 'warning', title: '用 left 或 top 做移動的動畫', text: '把元素設成 `position: absolute`，再用 `transition: left 0.3s` 或計時器一點一點改 `left`，是最直覺、也最常見的寫法。它在你的電腦上看起來沒問題，在低階裝置上卻容易一頓一頓，因為每一個畫格都要重新排版。把位移改用 `transform: translate(…)`，漸變只列出 `transform`。相關的陷阱還有 `transition: all`：它讓所有屬性的改變都變成動畫，包括你沒打算動的版面屬性；請明確寫出要漸變的屬性。' },
      ],
    },
    {
      id: 'mob10-s-power', title: '省電：沒有人在看的時候，就停下來',
      blocks: [
        { type: 'p', text: '「行動情境與限制」那一課說過，網頁每做一件事都要動用處理器、無線通訊或螢幕；會把電量耗掉的，是那些沒有人在看、卻不停重複的事。那一課也讓輪詢（polling）在訂單送達時停下來。省電的另外一半是：頁面看不到的時候也要停。使用者把手機鎖上放進口袋、切到別的 App、或換到另一個分頁時，你的頁面還活著，計時器還在走，請求還在送。' },
        { type: 'p', text: '行動網路在這裡特別吃虧。手機的無線通訊元件傳完資料之後，通常不會馬上回到省電的狀態，而會先保持在耗電的狀態一小段時間，以免馬上又要傳。每隔幾秒送一個小請求，等於讓它一直沒有機會休息：耗電的主要不是資料量，而是「一直醒著」。所以原則是：' },
        { type: 'list', items: [
          '沒有人看就停：頁面被藏起來時，停止輪詢、動畫，以及只為了更新畫面的計時器。',
          '做完就停：訂單送達、上傳完成、倒數結束，計時器就該用 `clearInterval` 清掉。',
          '能等事件就不要輪詢：想知道頁面是不是被藏起來了、欄位的內容是不是改了，瀏覽器都有事件會通知你，不要用計時器每秒去檢查一次。',
          '非問不可的時候，把間隔拉長，要送的資料合併成一次送。',
        ] },
        { type: 'p', text: "「頁面看不看得到」由 Page Visibility API 提供。`document.visibilityState` 的值是 `'visible'` 或 `'hidden'`；狀態改變時，`document` 上會觸發 `visibilitychange` 事件。切到別的分頁、把瀏覽器縮到最小、切到別的 App、鎖定螢幕，通常都會讓它變成 `'hidden'`。瀏覽器自己也會替背景的頁面節省資源，通常會暫停 `requestAnimationFrame` 的回呼、把計時器放慢；但放慢不是停止，你排的請求還是會送出去，所以要自己停。" },
        { type: 'p', text: '預覽和檢查都沒辦法真的把頁面切到背景，所以這一課的頁面用一個替身：寫在 index.html 裡的 `page` 物件。它的用法和真實的 API 一一對應，把 `page` 換成 `document`，就是真實網站上的寫法：' },
        { type: 'table', head: ['真實的網站', '這一課的頁面'], rows: [
          ['`document.visibilityState`', '`page.visibilityState`'],
          ["`document.addEventListener('visibilitychange', …)`", "`page.addEventListener('visibilitychange', …)`"],
          ['`document.hidden`：布林值，頁面被藏起來時是 `true`', '`page.hidden`'],
          ['使用者切到別的 App，或鎖定螢幕', '按「模擬：切到背景」；練習的檢查則是在 `body` 上觸發自訂的 `page-hide` 事件'],
          ['使用者回到這個頁面', '按「模擬：回到前景」；檢查觸發的是自訂的 `page-show` 事件'],
        ] },
        { type: 'example', id: 'mob10-visibility' },
        { type: 'p', text: 'script.js 把輪詢包成 `start` 與 `stop` 兩個函式，監聽器只決定呼叫哪一個。頁面載入後等十幾秒，看「已詢問」的次數每 10 秒加一；按「模擬：切到背景」，次數就停住，預覽下方的「網路請求」也不再增加；按「模擬：回到前景」，馬上多問一次，因為離開了一陣子，畫面上的資料已經舊了，然後恢復每 10 秒一次。注意最後一行不是直接呼叫 `start()`，而是先確認頁面看得到：使用者也可能在背景的分頁裡打開你的網頁。' },
        { type: 'p', text: '還有兩件事要說清楚。第一，替身不會跟著你真的切換分頁而改變：只要沒有按「模擬：切到背景」，這個預覽在你往下讀的時候仍然每 10 秒問一次，它不知道你已經沒在看它了。真實的頁面接上 `document` 之後，瀏覽器才會在使用者離開時通知它。第二，這個範例故意沒有結束的條件；「送達就停」加上「背景暫停」之後，有一個容易漏掉的細節，留給這一課的最後一個練習。' },
        { type: 'callout', tone: 'warning', title: '背景時只是不更新畫面，請求卻照送', text: "一種常見的「省電」寫法，是在收到回應之後檢查頁面是不是 `'hidden'`，是的話就不更新畫面。這省不到什麼：耗電的是計時器把處理器叫醒、以及請求讓無線通訊保持運作，而這兩件事都照常發生。要停的是計時器本身。回到前景時也要小心不要重複啟動：如果沒有先 `clearInterval`，就再呼叫一次 `setInterval`，頁面上會有兩個計時器同時在問，請求變成兩倍。" },
      ],
    },
    {
      id: 'mob10-s-checklist', title: '檢查表：從症狀找原因',
      blocks: [
        { type: 'p', text: '把這一課合起來，就是一張從症狀找原因的檢查表。症狀要在節流的條件下、或在真的低階裝置上觀察；「怎麼確認」那一欄用的是第一節的錄影方法，以及 Network（網路）面板的請求清單。' },
        { type: 'table', head: ['症狀', '可能的原因', '怎麼確認', '修法'], rows: [
          ['頁面剛出現時看得到，卻按不動', '啟動時把不急的工作都擠在第一件任務裡', '錄下載入的過程，看第一個畫面出現前後的長任務', '只做第一個畫面需要的，其餘延後'],
          ['按了按鈕，慢半拍才有反應', '監聽器裡有長任務，或點擊排在別的長任務後面', '錄下那一次點擊，看主執行緒在忙哪個函式', '少做、延後；切成小批，每批之後讓路'],
          ['打字時一頓一頓，每個字都送出請求', '每一次 `input` 事件都做完整的搜尋', '看 Network 面板：打一個詞出現幾個請求', '防彈跳'],
          ['拖曳或捲動時，畫面跟不上手指', '每一個事件都改畫面；迴圈裡交替讀寫版面', '錄下操作，看一個畫格裡是不是反覆排版', '合併到畫格；先讀後寫；用被動監聽器'],
          ['動畫一頓一頓', '動畫改的是版面屬性，或同時有長任務', '錄下動畫，看每一個畫格是不是都在重新排版', '改用 `transform` 與 `opacity`；用 JavaScript 逐格更新時用 `requestAnimationFrame`'],
          ['手機發燙、電量掉得快', '頁面在背景仍然輪詢，或計時器、動畫沒有結束', '切到別的分頁一陣子再回來，看 Network 面板裡這段時間有沒有新的請求', '`visibilitychange` 時停止；做完就停；拉長間隔'],
        ] },
        { type: 'p', text: '使用這張表的順序和「網頁效能基礎：載入與 Core Web Vitals」那一課一樣：先量，找出最大的那一個問題，一次改一件，再用同樣的設定量一次。不要憑感覺動手：把動畫全部拿掉、把所有函式都改成 `async`，都可能花了力氣卻沒有碰到真正的原因。' },
        { type: 'p', text: '這一課的四個練習各修一種原因：把畫出全部菜色的迴圈切開並讓路、替搜尋框加上防彈跳、把面板的動畫從 `right` 換成 `transform`，以及讓訂單的輪詢在背景暫停、回到前景恢復、送達後不再啟動。每一題檢查的都是順序與次數；真實的毫秒數，請回到自己的專案，用節流與真機去量。' },
        { type: 'callout', tone: 'tip', title: '一項改善，要在兩個地方成立', text: '先在節流的條件下重新錄影，確認那件長任務、那些多餘的請求或排版真的不見了；再拿一支真的手機操作一次，確認感受也變好了。只有第一項，可能只是在你的電腦上變好；只有第二項，你不知道是哪一個修改有效，下次也無從複製。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob10-q1', prompt: '你在筆電上開發訂單頁，操作起來一切流暢；使用者卻回報，在用了幾年的手機上按「送出」之後要等一下才有反應。哪一個做法最能幫你找到原因？',
      options: [
        '在筆電上多重新整理幾次，確認每一次都流暢',
        '把頁面上所有的動畫都拿掉，再請使用者試一次',
        '在開發者工具開啟 CPU 節流，錄下按「送出」的過程，找出那次點擊前後的長任務；修改後再到真的手機上確認',
        '請使用者換一支比較新的手機',
      ],
      answer: 2,
      explanation: '快的電腦會把長任務藏起來，所以要先用 CPU 節流把頁面的工作放慢，錄下那一次操作，才看得到是哪一件任務佔住主執行緒；節流模擬不了真實手機的全部狀況，改完還要在真機上確認。在同一台筆電上重複測試，問題還是藏著。還不知道原因就把動畫全部拿掉，是憑感覺動手，很可能根本沒有碰到真正的原因。請使用者換手機沒有解決問題，其他用同類手機的人照樣卡。',
    },
    {
      id: 'mob10-q2', prompt: '`process` 處理每一批都很快，但批次很多。使用者在處理期間按了另一個按鈕。那次點擊什麼時候才會被處理？',
      code: { language: 'JavaScript', text: 'async function processAll(batches) {\n  for (const batch of batches) {\n    process(batch);\n    await Promise.resolve();\n  }\n}' },
      options: [
        '全部的批次都處理完之後：`await` 一個已經完成的 Promise，後面的程式只排進微任務，而瀏覽器要把微任務做完才輪到下一件任務',
        '第一批處理完之後：只要寫了 `await`，就會把主執行緒讓出來',
        '立刻：`async` 函式是在另一條執行緒上執行的',
        '永遠不會：長任務進行期間的點擊會被瀏覽器丟掉',
      ],
      answer: 0,
      explanation: '`await Promise.resolve()` 之後的程式排進微任務佇列。一件任務結束後，瀏覽器會先把微任務全部做完，包括過程中新排進來的，才取下一件任務；點擊是一件任務，所以要等所有批次做完。「有 `await` 就讓路」是常見的誤解：要讓路，等的必須是計時器這類真正的任務，例如 `await pause()`。`async` 函式仍然在主執行緒上執行。點擊也不會被丟掉，只是排隊，使用者感受到的就是按了沒反應。',
    },
    {
      id: 'mob10-q3', prompt: '外送首頁的指令稿一載入就依序做四件事：（甲）畫出第一個畫面的菜單；（乙）送出這次造訪的統計資料；（丙）準備按了「看地圖」才會出現的地圖；（丁）替「開始點餐」按鈕登記監聽器。在低階裝置上，頁面出現後有一段時間按不動。哪一種安排最合理？',
      options: [
        '四件事都用 `setTimeout` 延後，讓第一件任務什麼都不做',
        '把（甲）與（丁）延後，先做（乙）與（丙）',
        '維持原狀：指令稿必須一次從頭執行到尾，沒有辦法調整',
        '先做（甲）與（丁），把（乙）與（丙）延後到第一件任務之後',
      ],
      answer: 3,
      explanation: '（甲）是使用者一進來就要看的，（丁）是他馬上要按的，這兩件要先做；統計資料與還看不到的地圖都不急，用 `setTimeout` 排到後面，第一件任務就短得多，按鈕也更早能回應。四件都延後的話，第一個畫面與按鈕反而更晚才能用。先做（乙）（丙）正好相反，把使用者等著的東西排到最後。指令稿雖然從頭執行到尾，但哪些工作放進計時器的回呼、留到之後的任務再做，是你可以決定的。',
    },
    {
      id: 'mob10-q4', prompt: '使用者很快地輸入「牛肉麵」，過程中觸發了三次 `input` 事件，彼此的間隔都遠小於 300 毫秒。`search` 一共會被呼叫幾次？',
      code: { language: 'JavaScript', text: "input.addEventListener('input', () => {\n  setTimeout(() => search(input.value), 300);\n});" },
      options: [
        '0 次：計時器會互相取消',
        '3 次：每一次輸入都排了自己的計時器，全部都會執行，只是各晚了 300 毫秒',
        '1 次：在最後一次輸入的 300 毫秒之後',
        '1 次：在第一次輸入的時候',
      ],
      answer: 1,
      explanation: '這段程式只有「延後」，沒有「取消」。三次輸入排了三個計時器，沒有任何一個被 `clearTimeout` 取消，所以三個都會到期，`search` 被呼叫三次，請求一個也沒少；而且它們執行時輸入框裡都已經是完整的文字，等於用同一個詞搜尋了三次。計時器不會自己互相取消。要變成「停下來 300 毫秒後只搜尋一次」，得把編號存在監聽器外面的變數裡，每次輸入先 `clearTimeout` 再重新排。',
    },
    {
      id: 'mob10-q5', prompt: '頁面上有 200 張卡片，這段程式在低階裝置上很慢。原因與修法是哪一個？',
      code: { language: 'JavaScript', text: "for (const card of cards) {\n  const width = card.offsetWidth;\n  card.style.height = width / 2 + 'px';\n}" },
      options: [
        '`for...of` 迴圈本身很慢；改用 `forEach` 就會變快',
        '每一圈都是先讀版面、再改樣式，下一圈的讀取逼瀏覽器先替上一圈的修改重新排版；改成先用一個迴圈讀完所有寬度，再用另一個迴圈寫入',
        '`offsetWidth` 每讀一次就送出一個網路請求；改成把寬度存進 `localStorage`',
        '用 JavaScript 設定的高度不會生效；改用 `setAttribute` 才行',
      ],
      answer: 1,
      explanation: '`offsetWidth` 是和版面有關的值。上一圈剛改過 `style.height`，版面已經是舊的，瀏覽器必須當場重新排版才能回答這一圈的讀取：200 張卡片就是將近 200 次排版。把讀與寫分開，讀的時候版面沒有被改過，寫完之後等下一個畫格排版一次就夠了。換一種迴圈的寫法不會改變讀寫交錯的順序。讀取 `offsetWidth` 不會送出任何請求。用 JavaScript 設定的 `style.height` 當然會生效，問題正是每一次修改之後緊接著又讀取版面。',
    },
    {
      id: 'mob10-q6', prompt: '底部面板滑上來的動畫，在低階裝置上一頓一頓。現在的寫法是面板從 `bottom: -300px` 變成 `bottom: 0`，搭配 `transition: bottom 0.3s`。哪一個修改最對症？',
      options: [
        '面板固定在 `bottom: 0`，關閉時用 `transform: translateY(100%)` 移出畫面，漸變改成 `transition: transform 0.3s`',
        '把時間改成 `0.1s`，讓動畫快一點結束',
        '替面板加上 `will-change: bottom`',
        '拿掉 `transition`，改用 `setInterval` 每 10 毫秒把 `bottom` 加一點',
      ],
      answer: 0,
      explanation: '`bottom` 是版面屬性，動畫的每一個畫格都要重新排版；改成只動 `transform`，通常只需要合成，不經過排版與繪製，這才處理到原因。縮短時間只是讓卡頓的畫格變少，每一格的代價沒有變。`will-change` 只是提示，而且 `bottom` 的改變本來就得排版，寫了也不會變便宜。改用計時器逐步修改 `bottom` 更糟：同樣每一步都要排版，還多了和螢幕重畫節奏不同步的問題。',
    },
    {
      id: 'mob10-q7', prompt: '有一段動畫用 `setInterval(draw, 10)` 逐步更新畫面，你想改用 `requestAnimationFrame`。關於 `requestAnimationFrame`，哪一個說法正確？',
      options: [
        '回呼是在另一條執行緒上執行的，所以裡面可以放很長的計算',
        '它保證每 10 毫秒執行一次，比計時器準時',
        '只要用了它，動畫改的是 `left` 還是 `transform` 就沒有差別',
        '瀏覽器在每一次重畫之前呼叫回呼一次，更新的節奏跟著螢幕；頁面看不到的時候，通常就不呼叫',
      ],
      answer: 3,
      explanation: '`requestAnimationFrame` 的回呼跟著螢幕的重畫，每個畫格一次，不會在兩次重畫之間白做，頁面在背景時瀏覽器通常也不呼叫它，所以適合用來更新畫面。它的回呼一樣在主執行緒上執行，裡面放長的計算照樣會讓畫面卡住。它沒有固定的毫秒數，節奏由螢幕與瀏覽器決定。它也不改變屬性的代價：回呼裡改 `left` 仍然每一格都要排版，還是應該改 `transform`。',
    },
    {
      id: 'mob10-q8', prompt: '訂單進度頁每 10 秒向伺服器詢問一次。使用者把手機鎖上、放進口袋，十分鐘後才拿出來看。哪一種做法最省電，而且他回來時看到的資訊是新的？',
      options: [
        '維持每 10 秒詢問，但頁面在背景時收到回應不更新畫面',
        '頁面在背景時把間隔縮短成 1 秒，確保回來時一定是最新的',
        '`visibilitychange` 時，如果 `document.visibilityState` 是 `hidden` 就 `clearInterval`；回到 `visible` 時，訂單還沒送達的話立刻問一次，再重新開始計時',
        '什麼都不必做：頁面一到背景，瀏覽器就會自動取消所有的計時器與請求',
      ],
      answer: 2,
      explanation: '背景時把計時器清掉，處理器與無線通訊在這十分鐘裡都不必為這個頁面工作；回來時立刻問一次，畫面馬上是新的，而訂單已經送達就不必再啟動。只是不更新畫面的話，計時器與請求照常進行，耗電的部分一點也沒少。背景時問得更頻繁正好相反，替沒有人看的畫面花更多的電。瀏覽器通常會把背景頁面的計時器放慢，但不會替你取消：放慢不是停止，請求還是會送出去。',
    },
  ],
  webCode: { examples, exercises },
};
