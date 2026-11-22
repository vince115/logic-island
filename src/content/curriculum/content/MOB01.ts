import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB01 mobile context and constraints (MOB-1). The first lesson of the mobile apps island: an analysis lesson whose
 * exercises are small, concrete repairs of a phone page of 「小島外送」. Four parts follow the four concepts: the context of
 * use, one-handed use (a bottom action bar measured from the viewport's bottom at 360 × 640, after a scroll and in
 * landscape), the screen size (one column, the first screen, content deferred in <details>, nothing that needs hover)
 * and the network and battery (loading, empty and error states with a retry; polling that ends). Every measured box has
 * explicit pixel sizes. What a check cannot see is said in the text: the preview follows the learner's own device (no
 * touch is simulated, :hover follows their pointer), so "visible without hover" is pinned with hit and box checks on
 * the buttons themselves, never with a (hover) media feature. The pretend server of the two network pages answers by
 * the attempt number in the query (a route with a query matches only that query), which is how one page shows a
 * failure followed by a retry that succeeds; the exercise's routes are fixed, so its retry is checked by the second
 * request and the success path by a variant. Target sizes, Pointer Events, form keyboards and safe areas are only
 * pointed at (MOB03–MOB06).
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const desktopBorn: WebExample = {
  id: 'mob01-desktop-born', title: '在辦公桌上設計的訂單頁，拿到手機上',
  description: '小島外送的訂單頁，是在桌機的大螢幕上、用滑鼠設計出來的。預覽一開始是 360px 寬；請找出「送出訂單」在哪裡、每道菜的價格在哪裡，再按 1024px 看它原本的樣子。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 1024],
  files: {
    html: String.raw`<header id="top">
  <h1>小島外送</h1>
  <button type="button" id="order">送出訂單</button>
</header>
<main>
  <h2>你的訂單</h2>
  <ul id="list">
    <li class="dish">
      <span class="name">海鮮粥 × 1</span>
      <span class="actions"><button type="button">修改</button> <button type="button">移除</button></span>
      <span class="price">120 元</span>
    </li>
    <li class="dish">
      <span class="name">滷肉飯 × 2</span>
      <span class="actions"><button type="button">修改</button> <button type="button">移除</button></span>
      <span class="price">140 元</span>
    </li>
    <li class="dish">
      <span class="name">燙青菜 × 1</span>
      <span class="actions"><button type="button">修改</button> <button type="button">移除</button></span>
      <span class="price">50 元</span>
    </li>
  </ul>
</main>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
#top { position: relative; height: 56px; background-color: #e3f2fd; }
#top h1 { margin: 0; padding: 0 16px; font-size: 20px; line-height: 56px; }

/* 主要操作：右上角的小按鈕 */
#order {
  position: absolute;
  top: 16px;
  right: 16px;
  height: 24px;
  font-size: 12px;
}

main { padding: 0 16px; }
h2 { font-size: 18px; }

/* 明細的寬度寫死 */
#list { width: 480px; margin: 0; padding: 0; list-style: none; }
.dish {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #cfd8dc;
}
.dish .name { flex: 1; }

/* 游標停在這一列上，才顯示「修改」與「移除」 */
.dish .actions { display: none; }
.dish:hover .actions { display: inline; }`,
  },
  observe: [
    { check: 'box', selector: '#order', measure: 'top', value: 16, from: ':viewport', label: '視窗 360 × 640：主要操作「送出訂單」的上緣在離視窗頂端 16px 的地方，也就是右上角' },
    { check: 'box', selector: '#order', measure: 'height', value: 24, label: '這顆按鈕只有 24px 高' },
    { check: 'box', selector: '#list', measure: 'width', value: 480, label: '訂單明細 `#list` 的寬度寫死成 480px，比 360px 的視窗還寬：右邊的價格要左右捲動才看得到' },
    { check: 'style', selector: '.dish .actions', property: 'display', value: 'none', label: '沒有游標停在上面時，「修改」與「移除」不顯示（`display` 是 `none`）' },
  ],
};

const ORDER_ROWS = String.raw`    <li>海鮮粥 × 1<span>120 元</span></li>
    <li>滷肉飯 × 2<span>140 元</span></li>
    <li>燙青菜 × 1<span>50 元</span></li>
    <li>味噌湯 × 2<span>60 元</span></li>
    <li>冬瓜茶 × 2<span>50 元</span></li>
    <li>芒果冰 × 1<span>90 元</span></li>`;

const reachBar: WebExample = {
  id: 'mob01-reach-bar', title: '訂單頁：主要操作在拇指旁邊的操作列',
  description: '同一張訂單，重新安排操作的位置。「送出訂單」放在 `<body>` 最後面的 `#bar` 裡，`#bar` 用 `position: sticky; bottom: 0` 貼在視窗底部；「清空購物車」留在最上面的頁首。頁面比預覽長，請在預覽裡往下捲動。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  height: 640,
  files: {
    html: String.raw`<header id="top">
  <h1>你的訂單</h1>
  <button type="button" id="clear">清空購物車</button>
</header>
<main>
  <ul id="list">
` + ORDER_ROWS + String.raw`
  </ul>
  <p id="fee">外送費 30 元，約 25 分鐘送達。</p>
</main>
<div id="bar">
  <button type="button" id="order">送出訂單　540 元</button>
</div>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
#top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 56px;
  padding: 0 16px;
  background-color: #e3f2fd;
}
#top h1 { margin: 0; font-size: 20px; }

/* 破壞性的操作：留在最上面，離拇指最遠 */
#clear { height: 44px; font: inherit; }

#list { margin: 0; padding: 0; list-style: none; }
#list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
  height: 96px;
  padding: 0 16px;
  border-bottom: 1px solid #cfd8dc;
}
#fee { height: 40px; margin: 0; padding: 0 16px; line-height: 40px; }

/* 主要操作：貼在視窗底部的操作列 */
#bar {
  position: sticky;
  bottom: 0;
  padding: 12px 16px;
  background-color: #ffffff;
  border-top: 1px solid #cfd8dc;
}
#order {
  display: block;
  width: 100%;
  height: 48px;
  font: inherit;
  font-weight: bold;
}`,
  },
  observe: [
    { check: 'style', selector: '#bar', property: 'position', value: 'sticky', label: '操作列 `#bar` 的 `position` 是 `sticky`' },
    { check: 'box', selector: '#order', measure: 'top', value: 580, from: ':viewport', label: '視窗 360 × 640、還沒捲動：「送出訂單」的上緣在 580px，整顆按鈕落在視窗最下面的 60px 裡' },
    { check: 'box', selector: '#order', measure: 'width', value: 328, label: '按鈕寬 328px：360px 的視窗扣掉左右各 16px 的內距，左手或右手的拇指都按得到' },
    { check: 'box', selector: '#clear', measure: 'top', value: 6, from: ':viewport', label: '「清空購物車」的上緣在離視窗頂端 6px 的地方：和底部的主要操作相隔 500px 以上' },
    { do: 'scroll', selector: ':page', top: 100 },
    { check: 'box', selector: '#order', measure: 'top', value: 580, from: ':viewport', label: '把頁面往下捲 100px：「送出訂單」仍然在視窗裡的同一個位置（580px）' },
  ],
};

const firstScreen: WebExample = {
  id: 'mob01-first-screen', title: '菜單頁：一欄、重要的在前、次要的收合',
  description: '島嶼小館的菜單頁。頁首只說店名與是否營業，接著就是菜單；每道菜的「加入」按鈕一直顯示；店家介紹與營業時間放在最後的 `<details>` 裡，點了標題才展開。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  files: {
    html: String.raw`<header id="top">
  <h1>島嶼小館</h1>
  <p>營業中，約 25 分鐘送達</p>
</header>
<main>
  <h2>菜單</h2>
  <ul id="menu">
    <li class="dish"><span class="name">海鮮粥</span><span>120 元</span><button type="button" class="add">加入</button></li>
    <li class="dish"><span class="name">滷肉飯</span><span>70 元</span><button type="button" class="add">加入</button></li>
    <li class="dish"><span class="name">燙青菜</span><span>50 元</span><button type="button" class="add">加入</button></li>
    <li class="dish"><span class="name">味噌湯</span><span>30 元</span><button type="button" class="add">加入</button></li>
  </ul>
  <details id="about">
    <summary>店家介紹與營業時間</summary>
    <p>島嶼小館開在港口邊的老街上，海鮮粥的湯頭每天熬三個小時。</p>
    <p>營業時間：每天 11:00 到 20:00，週二公休。</p>
  </details>
</main>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
#top {
  box-sizing: border-box;
  height: 72px;
  padding: 12px 16px;
  background-color: #e3f2fd;
}
#top h1 { margin: 0; font-size: 20px; line-height: 28px; }
#top p { margin: 0; font-size: 14px; line-height: 20px; }
h2 { margin: 0; padding: 0 16px; font-size: 18px; line-height: 48px; }

#menu { margin: 0; padding: 0; list-style: none; }
.dish {
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  height: 72px;
  padding: 0 16px;
  border-top: 1px solid #cfd8dc;
}
.dish .name { flex: 1; font-weight: bold; }
/* 「加入」一直顯示：沒有任何 :hover 的規則 */
.dish .add { height: 44px; padding: 0 16px; font: inherit; }

#about { padding: 0 16px; border-top: 1px solid #cfd8dc; }
#about summary { font-weight: bold; line-height: 48px; }
#about p { margin: 0 0 12px; }`,
  },
  observe: [
    { check: 'box', selector: '.dish:first-child', measure: 'top', value: 120, label: '視窗 360 × 640：第一道菜從 120px 開始（頁首 72px 加上標題 48px）' },
    { check: 'box', selector: '.dish:nth-child(4)', measure: 'bottom', value: 408, label: '第四道菜的下緣在 408px：四道菜都在 640px 高的第一個畫面裡' },
    { check: 'hit', selector: '.dish:first-child .add', top: '.dish:first-child .add', label: '沒有游標停在上面，第一道菜的「加入」按鈕就畫在畫面上' },
    { check: 'attr', selector: '#about', name: 'open', match: 'absent', label: '`<details>` 一開始沒有 `open` 屬性：店家介紹是收合的，只佔一行標題' },
    { do: 'click', selector: '#about summary' },
    { check: 'attr', selector: '#about', name: 'open', label: '點一下 `<summary>`：瀏覽器替 `<details>` 加上 `open`，內容展開' },
  ],
};

const MENU_HTML = String.raw`<h1>今日菜單</h1>
<p id="status" role="status">載入中…</p>
<ul id="menu"></ul>
<button type="button" id="retry" hidden>重試</button>`;
const MENU_CSS = String.raw`body { margin: 0; padding: 16px; font-family: sans-serif; }
h1 { margin: 0 0 8px; font-size: 20px; }
#status { margin: 0 0 8px; }
#menu { margin: 0; padding: 0; list-style: none; }
#menu li { padding: 12px 0; border-bottom: 1px solid #cfd8dc; }
#retry { width: 100%; height: 48px; margin-top: 8px; font: inherit; }`;
const MENU_DATA = [{ name: '海鮮粥', price: 120 }, { name: '滷肉飯', price: 70 }, { name: '燙青菜', price: 50 }];
const FAILED_TEXT = '載入失敗，請檢查網路後重試';

const menuStates: WebExample = {
  id: 'mob01-menu-states', title: '菜單載入失敗：說出來，並且可以重試',
  description: '這個頁面向 `/api/menu` 要今日菜單。為了讓你看到整個過程，它的模擬伺服器被設定成：第一次嘗試（位址帶著 `attempt=1`）在 1.5 秒後斷線，之後的嘗試才會成功。',
  viewport: { width: 360, height: 640 },
  setup: { api: [
    { path: '/api/menu?attempt=1', fail: true, delay: 1500 },
    { path: '/api/menu', body: MENU_DATA, delay: 800 },
  ] },
  files: {
    html: MENU_HTML,
    css: MENU_CSS,
    js: String.raw`const statusLine = document.querySelector('#status');
const list = document.querySelector('#menu');
const retry = document.querySelector('#retry');
let attempt = 0;

async function loadMenu() {
  attempt += 1;
  statusLine.textContent = '載入中…';
  retry.hidden = true;
  try {
    const response = await fetch('/api/menu?attempt=' + attempt);
    if (!response.ok) throw new Error('狀態碼 ' + response.status);
    const dishes = await response.json();
    for (const dish of dishes) {
      const item = document.createElement('li');
      item.textContent = dish.name + ' ' + dish.price + ' 元';
      list.append(item);
    }
    statusLine.textContent = dishes.length > 0 ? '共 ' + dishes.length + ' 道菜' : '目前沒有供應中的餐點';
  } catch (error) {
    statusLine.textContent = '載入失敗，請檢查網路後重試';
    retry.hidden = false;
  }
}

retry.addEventListener('click', loadMenu);
loadMenu();`,
  },
  observe: [
    { check: 'text', selector: '#status', text: '載入中…', label: '請求一送出，頁面就顯示「載入中…」' },
    { do: 'wait', ms: 1500 },
    { check: 'text', selector: '#status', text: FAILED_TEXT, label: '1.5 秒後連線中斷：`#status` 改成「載入失敗，請檢查網路後重試」，不是停在「載入中…」' },
    { check: 'attr', selector: '#retry', name: 'hidden', match: 'absent', label: '「重試」按鈕出現了（`hidden` 屬性被拿掉）' },
    { do: 'click', selector: '#retry' },
    { do: 'wait', ms: 800 },
    { check: 'count', selector: '#menu li', count: 3, label: '按下「重試」：第二次請求成功，清單出現三道菜' },
    { check: 'request', path: '/api/menu', count: 2, label: '頁面一共向 `/api/menu` 送出兩次請求：失敗的一次，重試的一次' },
  ],
};

const polling: WebExample = {
  id: 'mob01-polling', title: '訂單進度：每 10 秒問一次，送達就停',
  description: '頁面每 10 秒向 `/api/order` 詢問一次訂單的進度。模擬伺服器的設定：第一次回答「餐點準備中」，第二次「外送中」，第三次起「已送達」。預覽載入約 20 秒後，看「已詢問」的次數停在哪裡；想從頭再看一次，展開「動手改這個範例」，按裡面的「執行」。',
  viewport: { width: 360, height: 640 },
  setup: { api: [
    { path: '/api/order?ask=1', body: { state: '餐點準備中', done: false }, delay: 200 },
    { path: '/api/order?ask=2', body: { state: '外送中', done: false }, delay: 200 },
    { path: '/api/order', body: { state: '已送達', done: true }, delay: 200 },
  ] },
  files: {
    html: String.raw`<h1>訂單進度</h1>
<p id="state" role="status">查詢中…</p>
<p id="asked">已詢問 0 次</p>`,
    css: String.raw`body { margin: 0; padding: 16px; font-family: sans-serif; }
h1 { margin: 0 0 8px; font-size: 20px; }
#state { margin: 0 0 8px; font-size: 24px; font-weight: bold; }
#asked { margin: 0; color: #455a64; }`,
    js: String.raw`const state = document.querySelector('#state');
const asked = document.querySelector('#asked');
let count = 0;
let timer = null;

async function ask() {
  count += 1;
  asked.textContent = '已詢問 ' + count + ' 次';
  try {
    const response = await fetch('/api/order?ask=' + count);
    const order = await response.json();
    state.textContent = order.state;
    if (order.done) clearInterval(timer); // 送達了：不再詢問
  } catch (error) {
    state.textContent = '暫時連不上，稍後會再試一次';
  }
}

ask();
timer = setInterval(ask, 10000); // 每 10 秒問一次，不是每秒`,
  },
  observe: [
    { do: 'wait', ms: 300 },
    { check: 'text', selector: '#state', text: '餐點準備中', label: '第一次詢問的回答：「餐點準備中」' },
    { do: 'wait', ms: 10000 },
    { do: 'wait', ms: 10000 },
    { check: 'text', selector: '#state', text: '已送達', label: '20 秒後，第三次詢問的回答是「已送達」' },
    { check: 'request', path: '/api/order', count: 3, label: '到這時頁面一共送出 3 次請求' },
    { do: 'wait', ms: 10000 },
    { do: 'wait', ms: 10000 },
    { do: 'wait', ms: 10000 },
    { check: 'request', path: '/api/order', count: 3, label: '再過 30 秒，請求仍然是 3 次：送達之後計時器已經用 `clearInterval` 停掉' },
    { check: 'text', selector: '#asked', text: '已詢問 3 次', label: '頁面上的次數停在「已詢問 3 次」' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const hoverCss = (rules: string) => String.raw`body { margin: 0; font-family: sans-serif; }
/* 這幾條請保留 */
h1 { margin: 0; padding: 12px 16px; font-size: 20px; }
#menu { margin: 0; padding: 0; list-style: none; }
.dish { padding: 12px 16px; border-top: 1px solid #cfd8dc; }
.info { display: flex; justify-content: space-between; margin: 0; }
.name { font-weight: bold; }
.actions { gap: 8px; margin: 8px 0 0; }
.actions button { height: 44px; padding: 0 16px; font: inherit; }

` + rules;
const HOVER_STARTER = String.raw`/* 桌機版的設計：游標停在一道菜上，才顯示它的兩顆按鈕。請改寫下面兩條 */
.dish .actions { display: none; }
.dish:hover .actions { display: flex; }
`;
const dishItem = (name: string, price: number) => String.raw`  <li class="dish">
    <p class="info"><span class="name">` + name + String.raw`</span><span>` + String(price) + String.raw` 元</span></p>
    <p class="actions"><button type="button" class="add">加入購物車</button><button type="button" class="fav">收藏</button></p>
  </li>`;

const exHover: WebExercise = {
  id: 'mob01-ex-hover', title: '滑過才出現的按鈕：讓它一直看得到',
  statement: 'index.html 不能改。小島外送的菜單有三道菜，每道菜的 `.actions` 裡有「加入購物車」（`.add`）與「收藏」（`.fav`）兩顆按鈕。桌機版的設計是游標停在一道菜上才顯示它們；用手機的人沒有游標，根本不知道這裡可以點餐。請改寫 style.css 最下面的兩條規則，讓每一道菜的兩顆按鈕不需要游標停留就一直顯示，而且在任何寬度都一樣；上面標示「請保留」的規則（包含按鈕 44px 的高度）不要動。檢查會在 360px 與 768px 兩種視窗寬度，看第一道菜與第三道菜的按鈕是不是真的畫在畫面上。提醒：不要把規則包進 `(hover: …)` 的媒體查詢，檢查是在你自己的裝置上執行的，結果會跟著裝置變。',
  hints: [
    '問題出在兩條規則的分工：第一條把 `.actions` 藏起來，第二條只在 `:hover` 成立時才把它顯示出來。沒有游標的裝置上，第二條幾乎沒有機會成立。',
    '讓 `.actions` 不靠任何條件就顯示：不要再用 `display: none` 藏它，`:hover` 那一條也就不需要了。',
    '把最下面兩條換成一條：`.dish .actions { display: flex; }`。',
  ],
  explanation: '`.dish:hover .actions` 只在指標停在那道菜上的時候成立。觸控螢幕沒有可以停留的游標，所以「先藏起來、滑過才顯示」等於把點餐的入口藏在使用者看不到的地方。參考解答把兩條規則換成 `.dish .actions { display: flex; }`：按鈕不靠任何狀態、任何寬度都顯示，`.actions` 上原本寫好的 `gap: 8px` 也跟著生效。直接刪掉那兩條規則同樣會通過，這時 `.actions` 是一般的段落，按鈕照樣看得到。`:hover` 可以留給加強用的效果，例如滑過時換底色；完成任務一定要用到的操作，不能只在滑過時出現。',
  viewport: { width: 360, height: 640 },
  widths: [360, 768],
  fixed: { html: String.raw`<h1>今日菜單</h1>
<ul id="menu">
` + [dishItem('海鮮粥', 120), dishItem('滷肉飯', 70), dishItem('燙青菜', 50)].join('\n') + String.raw`
</ul>` },
  starter: { css: hoverCss(HOVER_STARTER) },
  solution: { css: hoverCss(String.raw`/* 兩顆按鈕一直顯示 */
.dish .actions { display: flex; }
`) },
  steps: [
    { check: 'hit', selector: '.dish:first-child .add', top: '.dish:first-child .add', label: '視窗寬 360px、沒有游標停在上面：第一道菜的「加入購物車」畫在畫面上' },
    { check: 'box', selector: '.dish:nth-child(3) .fav', measure: 'height', value: 44, label: '第三道菜的「收藏」也顯示著，高度是保留下來的 44px' },
    { do: 'resize', width: 768 },
    { check: 'hit', selector: '.dish:first-child .add', top: '.dish:first-child .add', label: '視窗寬 768px（平板也是觸控螢幕）：第一道菜的「加入購物車」仍然畫在畫面上' },
    { check: 'box', selector: '.dish:nth-child(3) .add', measure: 'height', value: 44, label: '視窗寬 768px：第三道菜的「加入購物車」也顯示著（高 44px）' },
  ],
  mistakes: [
    { files: { css: hoverCss(HOVER_STARTER + String.raw`
@media (max-width: 600px) {
  .dish .actions { display: flex; }
}
`) }, why: '用寬度的媒體查詢只在 600px 以下顯示按鈕，把「螢幕窄」當成「用手指」。768px 寬的平板一樣是觸控螢幕，按鈕在那裡仍然要滑過才出現；反過來，桌機把視窗拉窄也不會變成觸控。螢幕的寬度說不出輸入的方式，必要的操作要在每一種寬度都顯示。' },
    { files: { css: hoverCss(String.raw`.dish .actions { display: none; }
.dish:hover .actions, .dish:active .actions { display: flex; }
`) }, why: '多加了 `:active`，想讓手指按住那道菜時出現按鈕。`:active` 只在按著的那段時間成立，手指一放開按鈕就消失，使用者還是按不到它們，而且事先完全看不出這裡有按鈕。必要的操作不該依賴任何「正在滑過」或「正在按住」的狀態。' },
  ],
};

const reachCss = (bar: string, extra = '') => String.raw`body { margin: 0; font-family: sans-serif; }
/* 這幾條請保留 */
#top { height: 56px; background-color: #e3f2fd; }
#top h1 { margin: 0; padding: 0 16px; font-size: 20px; line-height: 56px; }
#list { margin: 0; padding: 0; list-style: none; }
#list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
  height: 96px;
  padding: 0 16px;
  border-bottom: 1px solid #cfd8dc;
}
#note { height: 40px; margin: 0; padding: 0 16px; line-height: 40px; }
` + extra + String.raw`
` + bar;
const REACH_STARTER = String.raw`/* 從桌機版搬來的：按鈕縮在右上角。請改寫下面兩條 */
#bar {
  position: absolute;
  top: 12px;
  right: 16px;
}
#order {
  height: 32px;
  font-size: 14px;
}
`;
const REACH_ORDER = String.raw`#order {
  display: block;
  width: 100%;
  height: 48px;
  font: inherit;
  font-weight: bold;
}
`;
const REACH_STICKY = String.raw`/* 主要操作：貼在視窗底部的操作列 */
#bar {
  position: sticky;
  bottom: 0;
  padding: 12px 16px;
  background-color: #ffffff;
  border-top: 1px solid #cfd8dc;
}
` + REACH_ORDER;

const exReach: WebExercise = {
  id: 'mob01-ex-reach', title: '把送出訂單移到拇指搆得到的地方',
  statement: 'index.html 不能改。小島外送的訂單頁有六道菜，最後一行 `#note` 寫著外送費；`<body>` 的最後是 `<div id="bar">`，裡面只有主要操作「送出訂單」按鈕 `#order`。目前的 style.css 把 `#bar` 放在右上角，按鈕只有 32px 高。請改寫 style.css 最下面 `#bar` 與 `#order` 的兩條規則，把 `#bar` 做成底部的操作列：（1）`#bar` 的下緣貼齊視窗底部，頁面捲到哪裡都一樣；（2）`#order` 整顆落在視窗最下面的 120px 裡，寬度至少 300px；（3）捲到頁面最下面時，`#note` 那一行不能被操作列蓋住；（4）手機橫放時操作列仍然貼在視窗底部。用 `position: sticky` 或 `position: fixed` 都可以；上面標示「請保留」的規則不要動，需要時可以另外加規則。檢查用的視窗是 360 × 640：先量還沒捲動的位置，捲到最下面再量一次（頁面會被捲到底；如果你讓 `main` 自己捲動，它也會被捲到底），最後把視窗改成橫放的 640 × 360。',
  hints: [
    '要讓一個元素不跟著頁面捲走，是「定位與堆疊順序」那一課的 `position: sticky` 與 `position: fixed`。`#bar` 已經是 `<body>` 的最後一個元素，哪一種寫起來比較省事？',
    '`position: sticky; bottom: 0;` 讓 `#bar` 在頁面比視窗長時黏在視窗底部，捲到最下面時回到自己原本的位置，所以不會蓋住 `#note`。改用 `fixed` 的話，要寫 `left: 0; right: 0; bottom: 0;`，並替 `main` 加上不小於操作列高度的 `padding-bottom`。',
    '`#bar { position: sticky; bottom: 0; padding: 12px 16px; background-color: #ffffff; }`，`#order { display: block; width: 100%; height: 48px; }`。原本的 `top` 與 `right` 要拿掉。',
  ],
  explanation: '單手握著手機時，拇指最容易碰到的是螢幕的下半部，所以每一張訂單都要按的「送出訂單」應該在底部，而不是右上角。參考解答讓 `#bar` 用 `position: sticky; bottom: 0`：它仍然在一般排版流裡，頁面比視窗長的時候黏在視窗底部；捲到最下面時，它回到 `#note` 之後自己原本的位置，所以不會蓋住任何內容，也不需要另外留空間。`#bar` 的背景要塗滿，否則捲動時下面的菜會透出來。按鈕 `width: 100%`、高 48px：360px 的視窗扣掉左右各 16px 的內距是 328px，整列都按得到，上緣在 640 − 12 − 48 = 580px。橫放成 640 × 360 之後規則完全不用改，操作列的下緣跟著貼在 360px。改用 `position: fixed` 也可以通過，但固定定位的盒子不佔位置，要替 `main` 補上 `padding-bottom`，最後一行才捲得出來。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  fixed: { html: String.raw`<header id="top">
  <h1>你的訂單</h1>
</header>
<main>
  <ul id="list">
` + ORDER_ROWS + String.raw`
  </ul>
  <p id="note">外送費 30 元，約 25 分鐘送達。</p>
</main>
<div id="bar">
  <button type="button" id="order">送出訂單　540 元</button>
</div>` },
  starter: { css: reachCss(REACH_STARTER) },
  solution: { css: reachCss(REACH_STICKY) },
  steps: [
    { check: 'box', selector: '#bar', measure: 'bottom', value: 640, from: ':viewport', label: '視窗 360 × 640、還沒捲動：操作列 `#bar` 的下緣貼齊視窗底部（640px）' },
    { check: 'box', selector: '#order', measure: 'top', value: 520, op: 'min', from: ':viewport', label: '「送出訂單」整顆落在視窗最下面的 120px 裡（上緣在 520px 或更下面）' },
    { check: 'box', selector: '#order', measure: 'width', value: 300, op: 'min', label: '「送出訂單」的寬度至少 300px' },
    { do: 'scroll', selector: ':page', top: 2000 },
    { do: 'scroll', selector: 'main', top: 2000 },
    { check: 'box', selector: '#bar', measure: 'bottom', value: 640, from: ':viewport', label: '捲到頁面最下面：操作列的下緣仍然貼齊視窗底部' },
    { check: 'hit', selector: '#note', top: '#note', label: '捲到頁面最下面：最後一行 `#note` 沒有被操作列蓋住' },
    { do: 'resize', width: 640, height: 360 },
    { check: 'box', selector: '#bar', measure: 'bottom', value: 360, from: ':viewport', label: '手機橫放（視窗 640 × 360）：操作列的下緣貼齊視窗底部（360px）' },
  ],
  mistakes: [
    { files: { css: reachCss(String.raw`#bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px;
  background-color: #ffffff;
  border-top: 1px solid #cfd8dc;
}
` + REACH_ORDER) }, why: '改成 `position: fixed` 之後沒有替內容留位置。固定定位的盒子不佔空間，頁面的長度沒有把它算進去：捲到最下面時，外送費那一行剛好壓在操作列的底下，怎麼捲都看不到。要替 `main` 加上不小於操作列高度的 `padding-bottom`，或改用 `position: sticky`。' },
    { files: { css: reachCss(String.raw`#bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px;
  background-color: #ffffff;
  border-top: 1px solid #cfd8dc;
}
` + REACH_ORDER) }, why: '用了 `position: absolute; bottom: 0`。絕對定位的盒子是跟著頁面一起捲動的：一打開頁面它的確在第一個畫面的底部，還蓋住了那裡的菜；往下一捲，它就跟著內容往上跑，離開了拇指的位置。要留在視窗裡，用的是 `sticky` 或 `fixed`。' },
  ],
};

const PRIORITY_CSS = String.raw`body { margin: 0; font-family: sans-serif; }
#top { height: 56px; background-color: #e3f2fd; }
#top h1 { margin: 0; padding: 0 16px; font-size: 20px; line-height: 56px; }
section, details { padding: 0 16px; }
h2 { margin: 0; font-size: 18px; line-height: 48px; }
summary { font-size: 18px; font-weight: bold; line-height: 48px; }
p { margin: 0 0 12px; }
#menu ul { margin: 0; padding: 0; list-style: none; }
#menu li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 56px;
  border-top: 1px solid #cfd8dc;
}
#menu button { height: 44px; padding: 0 16px; font: inherit; }
#hero { display: block; width: 100%; height: 300px; object-fit: cover; }`;
/** A 360 × 300 decorative drawing (sky, sun, sea): the hero image the exercise removes. */
const HERO_IMAGE = String.raw`  <img id="hero" alt="" width="360" height="300" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='300' viewBox='0 0 360 300'%3E%3Crect width='360' height='300' fill='%2390caf9'/%3E%3Ccircle cx='280' cy='80' r='40' fill='%23fff59d'/%3E%3Crect y='220' width='360' height='80' fill='%231565c0'/%3E%3C/svg%3E">`;
const STORY_TEXT = String.raw`    <p>島嶼小館開在港口邊的老街上。第一代老闆原本是漁夫，退休後把船上煮給船員吃的海鮮粥搬上岸。</p>
    <p>現在由第二代經營，每天清晨到漁港挑選當天的漁獲，湯頭仍然照船上的做法熬三個小時。</p>`;
const STORY_SECTION = String.raw`  <section id="story">
    <h2>店家故事</h2>
` + STORY_TEXT + String.raw`
  </section>`;
const PROMO_SECTION = String.raw`  <section id="promo">
    <h2>本週優惠</h2>
    <p>滿 300 元免外送費。</p>
  </section>`;
const MENU_SECTION = String.raw`  <section id="menu">
    <h2>菜單</h2>
    <ul>
      <li>海鮮粥 120 元 <button type="button">加入</button></li>
      <li>滷肉飯 70 元 <button type="button">加入</button></li>
      <li>燙青菜 50 元 <button type="button">加入</button></li>
    </ul>
  </section>`;
const storePage = (...blocks: string[]) => String.raw`<header id="top">
  <h1>島嶼小館</h1>
</header>
<main>
` + blocks.join('\n') + String.raw`
</main>`;

const exPriority: WebExercise = {
  id: 'mob01-ex-priority', title: '第一個畫面留給菜單，店家故事延後',
  statement: 'style.css 不能改，這一題要改的是 index.html。島嶼小館的頁面在 360 × 640 的手機上一打開，先看到一張 300px 高、純裝飾的形象大圖 `#hero`，再來是兩大段「店家故事」與「本週優惠」，菜單整個落在第一個畫面之外；但來到這一頁的人多半是要點餐。請調整 `<main>` 裡的內容：（1）把 `#hero` 從頁面拿掉；（2）`#menu` 排第一，緊接在頁首下面；（3）`#promo` 緊接在 `#menu` 之後；（4）店家故事排到最後，並且放進一個 `<details>` 元素，一開始是收合的；（5）這個 `<details>` 要有 `<summary>`，文字是「店家故事」；（6）故事的兩段文字（兩個 `<p>`）都要留在 `<details>` 裡，不能刪。`#menu` 與 `#promo` 的 id 不要改。檢查會看 `#hero` 還在不在、`#menu` 的位置、區塊的先後，以及 `<details>` 的內容與狀態。',
  hints: [
    '先替每一塊分類：現在就要（菜單、優惠）、晚一點才要（店家故事）、不需要（裝飾的大圖）。樣式表沒有改變排列的規則，畫面由上到下的順序就是 HTML 的先後：刪掉 `<img id="hero">`，把整個 `<section id="menu">` 搬到 `<main>` 的最前面，再依序排好另外兩塊。',
    '`<details>` 的第一個子元素寫 `<summary>標題</summary>`，後面接著要收合的內容。不寫 `open` 屬性，它一開始就是收合的。',
    '把店家故事改成 `<details><summary>店家故事</summary><p>…</p><p>…</p></details>`，放在 `#promo` 的後面；原本的 `<h2>店家故事</h2>` 可以換成 `<summary>`。',
  ],
  explanation: '窄螢幕只有一欄，HTML 的順序就是使用者看到的順序。這一頁的主要任務是點餐，所以菜單緊接在 56px 高的頁首下面，一打開就看得到；優惠會影響要點多少，排第二。形象大圖是純裝飾（它的 `alt` 是空的），對點餐沒有幫助，卻佔掉第一個畫面將近一半的高度，所以直接拿掉。店家故事不一樣：有人想看，但不是每次點餐都要讀，所以是延後而不是刪除：放進 `<details>`，平常只佔 `<summary>` 那一行，點一下才展開，兩段文字都還在。`<summary>` 一定要寫，它是使用者判斷「裡面有沒有我要的東西」的唯一線索。參考解答把原本的 `<h2>店家故事</h2>` 換成 `<summary>`；把整個 `<section id="story">` 包進 `<details>` 也可以通過。',
  viewport: { width: 360, height: 640 },
  widths: [360, 768],
  fixed: { css: PRIORITY_CSS },
  starter: { html: storePage(HERO_IMAGE, STORY_SECTION, PROMO_SECTION, MENU_SECTION) },
  solution: { html: storePage(MENU_SECTION, PROMO_SECTION, String.raw`  <details>
    <summary>店家故事</summary>
` + STORY_TEXT + String.raw`
  </details>`) },
  steps: [
    { check: 'box', selector: '#menu', measure: 'top', value: 56, label: '視窗寬 360px：`#menu` 緊接在頁首下面（上緣在 56px），一打開頁面就看得到菜單' },
    { check: 'count', selector: '#hero', count: 0, label: '純裝飾的大圖 `#hero` 已經從頁面拿掉' },
    { check: 'count', selector: '#menu + #promo ~ details, #menu + #promo ~ * details', count: 1, label: '`#promo` 緊接在 `#menu` 之後，而它的後面有一個 `<details>`' },
    { check: 'text', selector: 'details > summary', text: '店家故事', label: '`<details>` 有 `<summary>`，文字是「店家故事」' },
    { check: 'count', selector: 'details p', count: 2, label: '故事的兩段文字都還在 `<details>` 裡' },
    { check: 'attr', selector: 'details', name: 'open', match: 'absent', label: '`<details>` 一開始是收合的（沒有 `open` 屬性）' },
  ],
  mistakes: [
    { files: { html: storePage(MENU_SECTION, HERO_IMAGE, STORY_SECTION, PROMO_SECTION) }, why: '只把菜單搬到最前面，其餘沒有動：菜單之後緊接著的仍然是裝飾的大圖與兩大段店家故事，優惠被推到最後，故事也沒有收合。排優先順序要替每一塊做決定：用不到的裝飾拿掉，不是每次都要讀的長內容延後並收合起來。' },
    { files: { html: storePage(MENU_SECTION, PROMO_SECTION, String.raw`  <details>
    <h2>店家故事</h2>
` + STORY_TEXT + String.raw`
  </details>`) }, why: '把故事放進了 `<details>`，卻沒有寫 `<summary>`。瀏覽器會自己補上一個籠統的預設標題，使用者看不出裡面是什麼；原本的 `<h2>` 則跟著內容一起被收合。`<details>` 的標題要寫在 `<summary>` 裡，而且要說出內容是什麼。' },
  ],
};

const RETRY_HEAD = String.raw`const statusLine = document.querySelector('#status');
const list = document.querySelector('#menu');
const retry = document.querySelector('#retry');
`;
const RETRY_SHOW = String.raw`    const dishes = await response.json();
    for (const dish of dishes) {
      const item = document.createElement('li');
      item.textContent = dish.name + ' ' + dish.price + ' 元';
      list.append(item);
    }
    statusLine.textContent = '共 ' + dishes.length + ' 道菜';
`;
const RETRY_STARTER = RETRY_HEAD + String.raw`
async function loadMenu() {
  statusLine.textContent = '載入中…';
  const response = await fetch('/api/menu');
  const dishes = await response.json();
  for (const dish of dishes) {
    const item = document.createElement('li');
    item.textContent = dish.name + ' ' + dish.price + ' 元';
    list.append(item);
  }
  statusLine.textContent = '共 ' + dishes.length + ' 道菜';
}

loadMenu();
`;
const RETRY_SOLUTION = RETRY_HEAD + String.raw`
async function loadMenu() {
  statusLine.textContent = '載入中…';
  retry.hidden = true;
  try {
    const response = await fetch('/api/menu');
    if (!response.ok) throw new Error('狀態碼 ' + response.status);
` + RETRY_SHOW + String.raw`  } catch (error) {
    statusLine.textContent = '載入失敗，請檢查網路後重試';
    retry.hidden = false;
  }
}

retry.addEventListener('click', loadMenu);
loadMenu();
`;

const exRetry: WebExercise = {
  id: 'mob01-ex-retry', title: '連線中斷時：說出來，並提供重試',
  statement: 'index.html 與 style.css 不能改。script.js 向 `/api/menu` 要今日菜單，成功時把每道菜放進 `#menu`，並把 `#status` 改成「共 3 道菜」這樣的句子。但連線失敗時它什麼都沒做，頁面永遠停在「載入中…」。這一題的模擬伺服器是連不上的（`fetch` 會被拒絕）。請修改 script.js：（1）請求送出後，`#status` 是「載入中…」；（2）請求失敗時，`#status` 的文字改成「載入失敗，請檢查網路後重試」，並讓「重試」按鈕 `#retry` 顯示出來（它在 HTML 裡有 `hidden` 屬性）；（3）按下 `#retry`，`#status` 立刻回到「載入中…」，並向 `/api/menu` 再送出一次請求；再失敗的話，同樣顯示失敗訊息與按鈕；（4）請求成功時維持原本的行為，而且 `#retry` 不顯示。伺服器回應了、但狀態碼不是成功（例如 500）時，也算失敗。檢查還會換成連得上的伺服器、另一份菜單與回 500 的伺服器各執行一次，所以菜單的內容要來自回應，不能寫死。',
  hints: [
    '`fetch` 連不上時，它回傳的 Promise 會被拒絕；在 `async` 函式裡，`await` 一個被拒絕的 Promise 會丟出錯誤。用 `try { … } catch (error) { … }` 把請求、讀取與顯示包起來，在 `catch` 裡處理失敗。',
    '`catch` 裡做兩件事：把 `#status` 的文字改成失敗訊息，以及 `retry.hidden = false`。`loadMenu` 一開始除了顯示「載入中…」，再加一行 `retry.hidden = true`，重試的時候按鈕才會先收起來。',
    '重試就是再呼叫一次同一個函式：`retry.addEventListener(\'click\', loadMenu);`。狀態碼的部分，在 `await fetch(…)` 的下一行寫 `if (!response.ok) throw new Error(…);`，讓它也走進 `catch`。',
  ],
  explanation: '行動網路上，請求失敗是常態。原本的程式沒有處理被拒絕的 Promise：`await fetch(…)` 丟出錯誤後，函式就此中斷，畫面停在「載入中…」，使用者不知道該等還是該放棄。參考解答把請求、讀取與顯示包進 `try`，`catch` 負責把失敗說出來，並拿掉 `#retry` 的 `hidden`。`loadMenu` 一開始就重設畫面（顯示「載入中…」、收起按鈕），所以同一個函式可以直接當成「重試」的處理函式：第一次載入與每一次重試走的是同一條路，不會有一邊忘了更新狀態。`if (!response.ok) throw …` 讓 500 這類「有回應但不成功」的情況也進到 `catch`；「fetch、JSON 與 API」那一課說過，這種回應不會讓 `fetch` 自己被拒絕。重試只重送失敗的那一個請求，不是重新整理整個頁面：使用者已經輸入的東西都還在。',
  viewport: { width: 360, height: 640 },
  setup: { api: [{ path: '/api/menu', fail: true, delay: 300 }] },
  fixed: { html: MENU_HTML, css: MENU_CSS },
  starter: { js: RETRY_STARTER },
  solution: { js: RETRY_SOLUTION },
  steps: [
    { check: 'text', selector: '#status', text: '載入中…', label: '請求送出後，`#status` 顯示「載入中…」' },
    { do: 'wait', ms: 300 },
    { check: 'text', selector: '#status', text: FAILED_TEXT, label: '連線失敗後，`#status` 的文字是「載入失敗，請檢查網路後重試」' },
    { check: 'box', selector: '#retry', measure: 'height', value: 48, label: '「重試」按鈕 `#retry` 顯示出來了（高 48px）' },
    { do: 'click', selector: '#retry' },
    { check: 'text', selector: '#status', text: '載入中…', label: '按下「重試」，`#status` 立刻回到「載入中…」' },
    { do: 'wait', ms: 300 },
    { check: 'request', path: '/api/menu', count: 2, label: '頁面向 `/api/menu` 送出了第二次請求' },
    { check: 'text', selector: '#status', text: FAILED_TEXT, label: '第二次也失敗：`#status` 再次顯示失敗訊息' },
  ],
  mistakes: [
    { files: { js: RETRY_HEAD + String.raw`
async function loadMenu() {
  statusLine.textContent = '載入中…';
  try {
    const response = await fetch('/api/menu');
` + RETRY_SHOW + String.raw`  } catch (error) {
    console.log('載入失敗', error.name);
  }
}

retry.addEventListener('click', loadMenu);
loadMenu();
` }, why: '加了 `try…catch`，但 `catch` 裡只有 `console.log`。錯誤的確被接住了，可是使用者看不到主控台：畫面仍然停在「載入中…」，「重試」按鈕也沒有出現。失敗要寫在頁面上，並告訴使用者下一步可以做什麼。' },
    { files: { js: RETRY_HEAD + String.raw`
async function loadMenu() {
  statusLine.textContent = '載入中…';
  try {
    const response = await fetch('/api/menu');
    if (!response.ok) throw new Error('狀態碼 ' + response.status);
` + RETRY_SHOW + String.raw`  } catch (error) {
    statusLine.textContent = '載入失敗，請檢查網路後重試';
    retry.hidden = false;
  }
}

loadMenu();
` }, why: '失敗訊息與「重試」按鈕都出現了，卻沒有替按鈕登記 `click` 的監聽器：按鈕怎麼按都沒有反應，也沒有送出第二次請求。出現在畫面上的按鈕一定要有作用；這裡只要 `retry.addEventListener(\'click\', loadMenu)`。' },
  ],
  variants: [
    {
      title: '連得上的伺服器：三道菜',
      setup: { api: [{ path: '/api/menu', body: MENU_DATA, delay: 300 }] },
      steps: [
        { do: 'wait', ms: 300 },
        { check: 'count', selector: '#menu li', count: 3, label: '清單有三道菜' },
        { check: 'text', selector: '#status', text: '共 3 道菜', label: '`#status` 是「共 3 道菜」' },
        { check: 'box', selector: '#retry', measure: 'height', value: 0, label: '成功時「重試」按鈕不顯示' },
        { check: 'request', path: '/api/menu', count: 1, label: '只送出一次請求' },
      ],
    },
    {
      title: '另一份菜單：兩道菜',
      setup: { api: [{ path: '/api/menu', body: [{ name: '鮮魚湯', price: 90 }, { name: '炒米粉', price: 65 }], delay: 300 }] },
      steps: [
        { do: 'wait', ms: 300 },
        { check: 'count', selector: '#menu li', count: 2, label: '清單有兩道菜' },
        { check: 'text', selector: '#menu li:first-child', text: '鮮魚湯 90 元', label: '第一道菜來自這個伺服器的回應' },
        { check: 'text', selector: '#status', text: '共 2 道菜', label: '`#status` 是「共 2 道菜」' },
      ],
    },
    {
      title: '伺服器故障：回 500',
      setup: { api: [{ path: '/api/menu', status: 500, body: { error: '廚房的系統維護中' }, delay: 300 }] },
      steps: [
        { do: 'wait', ms: 300 },
        { check: 'text', selector: '#status', text: FAILED_TEXT, label: '狀態碼 500 也顯示失敗訊息' },
        { check: 'box', selector: '#retry', measure: 'height', value: 48, label: '「重試」按鈕顯示出來' },
        { check: 'count', selector: '#menu li', count: 0, label: '清單是空的' },
      ],
    },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const MOB01: LessonContent = {
  lessonId: 'MOB01',
  motivation: '頁面在 360px 寬的螢幕上排得下，不代表它在手機上好用：使用者可能正單手拉著公車的拉環，訊號時有時無，電量只剩一成。這一課從手機真實的使用情境出發，讓你能把主要操作移到拇指搆得到的位置、替不穩定的網路準備好失敗訊息與重試，並指出一個網站在手機上最大的三個問題。',
  sections: [
    {
      id: 'mob01-context-section', title: '使用情境：手機是在什麼狀況下被使用的',
      blocks: [
        { type: 'p', text: '響應式設計島處理的是寬度：同一份頁面，在窄螢幕上也排得下。但排得下不等於用得順。行動裝置（mobile device）和桌機的差別不只是螢幕比較小，而是整個使用情境（context of use）都不一樣：人在哪裡、用什麼姿勢握著它、有多少時間、網路好不好。坐在書桌前的人有鍵盤、滑鼠、穩定的網路與完整的注意力；拿著手機的人，這些可能一樣都沒有。' },
        { type: 'p', text: '這座島用「小島外送」當例子：一個在手機上點餐的網站。想像它的使用者：下班搭公車的時候打開它，一手拉著拉環，一手握著手機，用拇指滑菜單；途中車子開進地下道，訊號斷了十幾秒；點到一半到站了，手機收進口袋，下車後再拿出來接著點。把這些狀況整理成表格，每一列都對應到設計上要做的事：' },
        { type: 'table', head: ['使用情境', '帶來的限制', '設計上要做的事'], rows: [
          ['時間短、常被打斷：等車、排隊、走路的空檔', '隨時可能放下手機，過幾分鐘才回來', '步驟要少；做到一半的東西（購物車、填到一半的資料）要留著'],
          ['單手握著，用拇指操作', '拇指搆不到整個螢幕；手指比滑鼠游標粗，也沒有「停在上面」的狀態', '重要的操作放在拇指旁邊；不依賴滑過（hover）才出現的東西'],
          ['在移動中、在戶外', '手會晃，注意力被分散；陽光下螢幕會反光', '按鈕夠大、彼此有距離；文字與背景的對比要足夠'],
          ['螢幕尺寸小，而且是直的', '一次只看得到一小段內容', '排成一欄，最重要的放在最前面'],
          ['用螢幕上的虛擬鍵盤（virtual keyboard）輸入', '打字慢、容易打錯', '能用選的就不要用打的；欄位越少越好'],
          ['靠行動網路連線、靠電池供電', '連線時快時慢，還會中斷；電量有限', '說出載入中與失敗的狀態，可以重試；頁面要輕'],
        ] },
        { type: 'p', text: '這一課依序處理其中四件事：使用情境本身、單手操作（one-handed use）、螢幕尺寸（screen size）、網路與電量。先看一個完全沒有考慮這些事的頁面。它沒有壞掉，在桌機上甚至很好用。' },
        { type: 'example', id: 'mob01-desktop-born' },
        { type: 'p', text: '預覽一開始是 360px 寬，請試著做訂單頁上最重要的一件事：送出訂單。按鈕在右上角，只有 24px 高；單手握著手機時，那是拇指最難搆到的角落。再找每道菜的價格：訂單明細的寬度寫死成 480px，價格排在視窗的外面，要左右捲動才看得到。最後是「修改」與「移除」：它們只在游標停在那道菜上時才出現。用滑鼠把游標移上去，兩顆按鈕就會出現；沒有游標的裝置上，使用者根本不知道這一列可以修改。按上方的 1024px 再看一次：同一個頁面在寬螢幕上、用滑鼠操作，這三件事都不成問題。這一類頁面的問題不在程式寫錯，而在設計它的人坐在辦公桌前。' },
        { type: 'callout', tone: 'note', title: '預覽跟著你自己的裝置', text: '預覽上方的寬度按鈕改變的只有頁面的寬度，它不會把你的滑鼠變成手指。用桌機讀這一課，`:hover` 照常會成立，你有精確的游標；用手機讀，預覽裡才是真的觸控（touch）。所以這座島的每一課，都請你盡量拿一支手機實際操作一次：單手握著，只用拇指。在桌機上至少先在腦中把游標換成拇指。' },
      ],
    },
    {
      id: 'mob01-reach-section', title: '單手操作：重要的操作放在拇指旁邊',
      blocks: [
        { type: 'p', text: '單手操作的時候，握著手機的那隻手同時要負責操作，能動的只有拇指。不換握法就碰得到的範圍，常被稱為拇指熱區（thumb zone），也就是拇指的可及範圍（reach）。手機越高，這個範圍佔螢幕的比例就越小：螢幕的下半部最容易碰到，越往上越費力，最上面的兩個角落通常要換個握法，或動用另一隻手。桌機網頁的習慣剛好相反：重要的按鈕常放在右上角，因為滑鼠移到哪裡都一樣省力。把這個習慣原封不動搬到手機上，最重要的操作就落在最難按的地方。' },
        { type: 'p', text: '所以在手機上，一個操作該放在哪裡，要看它多常用，以及按錯的代價有多大：' },
        { type: 'table', head: ['操作', '例子', '放在哪裡'], rows: [
          ['主要操作：這個畫面存在的目的', '送出訂單、加入購物車', '螢幕底部，拇指旁邊；一顆和螢幕差不多寬的按鈕'],
          ['常用的次要操作', '修改數量、切換分類', '螢幕的下半部，或緊貼著它所屬的內容'],
          ['不常用的操作', '設定、說明、登出', '螢幕上方，或收進選單'],
          ['破壞性的操作：做了很難復原', '清空購物車、刪除帳號', '遠離主要操作，不放在最好按的位置；執行前再確認一次'],
        ] },
        { type: 'p', text: '把主要操作放在底部，最常見的做法是操作列（action bar）：一條貼在視窗底部的橫列，裡面放那顆最重要的按鈕。它用的是「定位與堆疊順序」那一課的 `position: sticky` 或 `position: fixed`，沒有新的語法。' },
        { type: 'example', id: 'mob01-reach-bar' },
        { type: 'p', text: '`#bar` 寫在 `<body>` 的最後面，樣式是 `position: sticky; bottom: 0`：頁面比視窗長的時候，它黏在視窗的底部；捲到頁面最下面，它回到自己原本的位置，排在外送費那一行的後面，不蓋住任何內容。在預覽裡往下捲：六道菜從操作列的後面經過，「送出訂單」一直留在原地。按鈕寫了 `width: 100%`，高 48px，在 360px 寬的視窗裡是 328px 寬，整列都按得到，左手或右手握都一樣。按鈕上直接寫著金額，使用者送出之前不必捲回去找合計。' },
        { type: 'p', text: '「清空購物車」則留在頁首：它在視窗的最上面，離底部的主要操作 500px 以上，要刻意伸手才按得到，而且捲動之後就離開畫面。破壞性的操作如果緊貼在主要操作旁邊，車子一晃、拇指一偏，整張訂單就不見了。位置之外，這類操作在執行前還應該再確認一次，或提供復原的機會。' },
        { type: 'callout', tone: 'warning', title: '固定在底部的列，蓋住了最後一段內容', text: '把操作列寫成 `position: fixed; bottom: 0` 是最直覺的做法，但固定定位的盒子不佔位置：頁面的長度沒有把它算進去，捲到最下面時，最後一段內容剛好壓在操作列的底下，怎麼捲都捲不出來。被蓋住的常常是合計、外送費或條款這些送出前最該看到的東西。修法有兩種：替內容加上不小於操作列高度的 `padding-bottom`；或者像範例一樣用 `position: sticky`，讓操作列留在排版流裡。另外，操作列不要做得太高：手機橫放時視窗的高度可能只剩 360px 左右，一條 120px 高的列就佔掉三分之一。' },
        { type: 'callout', tone: 'tip', title: '動手試：改成 fixed，看最後一行', text: '按「動手改這個範例」，把 `#bar` 的 `position: sticky;` 改成 `position: fixed; left: 0; right: 0;` 再執行，然後把預覽捲到最下面：「外送費 30 元」那一行不見了，它被操作列蓋住。接著在樣式表的最後加上 `main { padding-bottom: 73px; }`（操作列的高度：上下內距各 12px、按鈕 48px、上邊框 1px）再執行：那一行回來了。' },
      ],
    },
    {
      id: 'mob01-screen-section', title: '螢幕尺寸：又窄又高的一欄',
      blocks: [
        { type: 'p', text: '螢幕尺寸是第二個限制。這座島用 360 × 640 CSS px 當作工作尺寸：練習的檢查從這個大小的視窗開始，預覽的寬度也從 360px 開始。真實的手機有寬有窄，所以它只是取樣，不是標準答案。360px 的寬度只夠排一欄，這是響應式設計島已經處理過的事。這裡要多看的是高度：還沒捲動就看得到的部分，也就是第一個畫面，只有 640px 高。使用者會捲動，但他是看了第一個畫面之後，才決定要不要往下捲的。' },
        { type: 'p', text: '因此順序比在桌機上更要緊。「響應式原則與行動優先」那一課說過內容優先：依重要性安排 HTML 的先後。在手機的使用情境下，可以對每一塊內容多問一句：它是現在就要、晚一點才要，還是根本不需要？' },
        { type: 'list', items: [
          '現在就要：完成主要任務一定會用到的東西，排在最前面。對菜單頁來說是店名、有沒有營業、菜色與「加入」按鈕。',
          '晚一點才要：有人會想看，但不是每一次都要看。排到後面，或是收合起來，點了才展開，這叫延後（defer）。例如店家介紹、營業時間、退款說明。',
          '不需要：對這個情境沒有幫助的裝飾，例如佔滿第一個畫面的形象大圖、自動輪播的橫幅。這些可以拿掉。要注意的是，拿掉的只能是裝飾；使用者用得到的資訊只能延後，不能因為螢幕小就刪掉。',
        ] },
        { type: 'p', text: '延後最省事的工具是原生的 `<details>` 與 `<summary>`（「語意 HTML 與 ARIA 的無障礙實作」那一課提過）：`<summary>` 是一直看得到的那一行標題，其餘的內容要點了標題才展開。展開與收合、鍵盤操作、目前的狀態都由瀏覽器處理，不必寫指令稿；`<details>` 身上有沒有 `open` 屬性，就是它現在展開與否。' },
        { type: 'example', id: 'mob01-first-screen' },
        { type: 'p', text: '頁首只有 72px 高，說了兩件現在就要知道的事：這是哪一家店、有沒有營業。接著是 48px 的標題與菜單：第一道菜從 120px 開始，每道菜 72px，第四道菜結束在 408px，四道菜全部落在第一個畫面裡，每一道的「加入」按鈕都一直顯示在右邊。店家介紹與營業時間排在最後，收合成一行；點一下「店家介紹與營業時間」就展開，再點一下收合。展開預覽下方的 DOM 樹，可以看到 `<details>` 在展開時多了 `open` 屬性。' },
        { type: 'callout', tone: 'warning', title: '只在滑過時才出現的操作', text: '桌機網頁常把次要的操作藏起來，游標移到項目上才顯示，或是滑過才展開的選單。這靠的是 `:hover`：指標停在元素上方時就成立的狀態，還不必按下去。手指沒有「停在上方」這回事，不是碰到螢幕，就是沒碰到。行動瀏覽器通常會在你點一下元素時順便套用 `:hover`，但那已經是一次點擊了，而且使用者事先完全看不出那裡藏著東西。原則是：完成任務要用到的操作一直顯示，或是放在一顆看得到的、真正的按鈕後面（「響應式導覽與表格」那一課的選單按鈕）；`:hover` 只用來加強，例如滑過時換個底色，並且可以包在「Media Query 與斷點策略」那一課的 `@media (hover: hover)` 裡。也不要用螢幕的寬度去猜輸入方式：平板很寬，卻是觸控；桌機的視窗可以拉得很窄，用的仍然是滑鼠。' },
        { type: 'callout', tone: 'tip', title: '動手試：把按鈕藏到滑過才出現', text: '按「動手改這個範例」，在樣式表的最後加上兩行：`.dish .add { display: none; }` 與 `.dish:hover .add { display: block; }`，再執行。用滑鼠的話，四顆「加入」按鈕都不見了，游標移到哪一道菜，那一道的按鈕才出現。請想像你是第一次打開這一頁的手機使用者：畫面上沒有任何線索告訴你可以點餐。看完之後把這兩行刪掉。' },
      ],
    },
    {
      id: 'mob01-network-section', title: '網路與電量之一：把連線失敗當成常態',
      blocks: [
        { type: 'p', text: '網路與電量是第三組限制。先說網路。手機靠行動網路或公共的無線網路連線：走進電梯、開進地下道、站在人擠人的月台上，請求變得很慢甚至直接失敗，是每天都會發生的事。在書桌前，請求失敗是意外；在手機上，它是必須設計的正常狀況。' },
        { type: 'p', text: '「fetch、JSON 與 API」那一課已經教過用 `fetch` 載入資料的頁面有載入中、成功與失敗幾種狀態，以及怎麼用 `try…catch` 與 `response.ok` 分辨它們。放到手機的使用情境裡，每一種狀態都要讓使用者看得到，而且失敗之後要有下一步：' },
        { type: 'table', head: ['狀態', '畫面上要有什麼', '少了它會怎樣'], rows: [
          ['載入中（loading）', '請求一送出就顯示「載入中…」', '畫面沒有反應，使用者以為沒按到，又按了好幾次'],
          ['成功，有資料', '資料本身，以及一句摘要，例如「共 3 道菜」', '使用者拿不到他要的東西'],
          ['成功，但沒有資料', '一句說明，例如「目前沒有供應中的餐點」', '一片空白，分不出是沒有資料還是壞掉了'],
          ['失敗', '發生了什麼事、可以怎麼辦，加上一顆「重試」按鈕', '永遠停在「載入中…」，只能關掉頁面'],
        ] },
        { type: 'example', id: 'mob01-menu-states' },
        { type: 'p', text: '這個頁面的模擬伺服器刻意讓第一次嘗試失敗，所以 script.js 在位址後面帶上第幾次嘗試（`attempt`）；真實的網站不需要這個參數，斷線自然會發生。預覽載入後先顯示「載入中…」，1.5 秒後連線中斷，所以你讀到這裡時，它多半已經停在失敗的畫面：「載入失敗，請檢查網路後重試」，下面是「重試」按鈕。按下「重試」：文字立刻回到「載入中…」，按鈕收起來，不到一秒後三道菜出現。預覽下方的「網路請求」列著兩筆紀錄：失敗的一次，成功的一次。想從頭再看一次，展開「動手改這個範例」，按裡面的「執行」。' },
        { type: 'p', text: '程式的重點有三個。第一，請求、讀取與顯示都包在 `try` 裡，`catch` 負責把失敗寫到頁面上，並拿掉按鈕的 `hidden` 屬性；`response.ok` 不成立時用 `throw` 丟出錯誤，讓「伺服器有回應但不成功」也走同一條路。第二，`loadMenu` 一開始就重設畫面：顯示「載入中…」、把按鈕收起來。所以「重試」按鈕的監聽器直接就是 `loadMenu`，第一次載入與每一次重試是同一段程式。第三，成功但陣列是空的時候，顯示的是「目前沒有供應中的餐點」，不是「共 0 道菜」，更不是一片空白。`#status` 寫了 `role="status"`，螢幕閱讀器的使用者也會聽到這些狀態的變化。' },
        { type: 'callout', tone: 'warning', title: '失敗了，畫面卻一直顯示載入中', text: '最常見的寫法是完全沒有 `catch`，或是 `catch` 裡只有一行 `console.log(error)`。開發的時候網路很穩，這段程式從來沒有被執行過，所以沒有人發現；到了使用者手上，連線一斷，畫面就永遠停在「載入中…」。使用者看不到主控台，不知道該繼續等還是該放棄。每寫一個 `fetch`，都要回答兩個問題：失敗的時候，使用者在畫面上看到什麼？他接下來可以按什麼？' },
        { type: 'callout', tone: 'note', title: '重試不是重新整理', text: '「請重新整理頁面」是很糟的失敗訊息：重新整理會把整個頁面重新載入一次，使用者填到一半的表單、捲到的位置都可能跟著不見，而且在訊號不好的地方，整頁重來只會更慢。重試只重送失敗的那一個請求，頁面上其他的東西原封不動。' },
      ],
    },
    {
      id: 'mob01-battery-section', title: '網路與電量之二：頁面要輕，也要懂得停下來',
      blocks: [
        { type: 'p', text: '再說電量。手機靠電池運作，行動網路的流量也常常是要算錢、有上限的。網頁每做一件事都有代價：送出請求要動用無線通訊，執行指令稿要動用處理器，畫面上有東西在動，螢幕就得不斷重畫。單獨一次都微不足道；會把電量與流量耗掉的，是那些沒有人在看的時候還不停重複的事。可以整理成四條原則：' },
        { type: 'list', items: [
          '頁面要輕：只載入這個畫面用得到的東西。大圖交給「響應式圖片與媒體」那一課的做法，讓窄螢幕拿到小的檔案；第一個畫面用不到的內容可以晚一點再載入。',
          '不要無止盡地輪詢（polling）。輪詢是每隔一段時間問伺服器一次「有沒有新的消息」。間隔要盡量拉長，而且一定要有結束的條件：事情做完了就停。頁面被切到背景時也該停下來，`document` 的 `visibilitychange` 事件會在這個時候通知你。',
          '不要無止盡的動畫：不停旋轉的裝飾、自動輪播的橫幅，都讓螢幕一直重畫。載入中的動畫在載入結束時就要停止並從畫面上移除。',
          '失敗之後不要自動、無限次地立刻重試：訊號不好的時候，這只會讓手機不停地白費力氣。把決定交給使用者（上一節的「重試」按鈕），或是每一次都把間隔拉長，並設定次數的上限。',
        ] },
        { type: 'example', id: 'mob01-polling' },
        { type: 'p', text: '這個頁面用「非同步 JavaScript：Promise 與 async／await」那一課的 `setInterval` 每 10 秒詢問一次訂單的進度。關鍵是 `ask` 裡的那一行 `if (order.done) clearInterval(timer);`：伺服器說已送達，計時器就停掉。預覽載入後的 20 秒內，狀態從「餐點準備中」變成「外送中」，再變成「已送達」；「已詢問」停在 3 次，下方的「網路請求」也停在三筆，之後不管再等多久都不會增加。算一下差別：沒有結束條件的話，這個頁面每分鐘送出 6 個請求，一直到使用者把它關掉為止，開著一小時就是 360 個；如果間隔寫成 1 秒，是每分鐘 60 個。`catch` 裡也沒有立刻重試，只是說明「稍後會再試一次」，等下一個 10 秒。' },
        { type: 'callout', tone: 'tip', title: '動手試：拿掉結束的條件', text: '展開「動手改這個範例」，把 `if (order.done) clearInterval(timer);` 整行刪掉再按「執行」，然後等半分鐘：狀態早就是「已送達」了，「已詢問」的次數卻每 10 秒加一，下方「網路請求」的清單越來越長。畫面看起來和原本一模一樣，這正是這類浪費難以發現的原因。再把 `10000` 改成 `1000` 看一次，然後把兩處都改回來。' },
      ],
    },
    {
      id: 'mob01-checklist-section', title: '檢查表：找出最大的三個問題',
      blocks: [
        { type: 'p', text: '把這一課的四個部分合起來，就是一張檢查表。在桌機上設計出來的頁面拿到手機上，最常出現的就是下面這六種問題。檢查的方法都一樣：拿一支手機，單手握著，在不太好的網路下，把這個網站最主要的那件事從頭到尾做一次。' },
        { type: 'table', head: ['常見的問題', '怎麼發現', '怎麼修'], rows: [
          ['主要操作在右上角，或要捲很久才到', '只用握著手機的那隻手的拇指，做一次主要任務', '移到螢幕底部的操作列（這一課）'],
          ['按鈕與連結太小，或擠在一起', '用拇指去按，看會不會按到隔壁', '加大、拉開距離（「觸控目標與手勢的實作」）'],
          ['操作或選單只在滑過時出現', '在真正的觸控裝置上找那個操作', '一直顯示，或放在看得到的按鈕後面（這一課）'],
          ['寬度寫死，頁面要左右捲動', '把視窗縮到 360px 寬', '流動的寬度與單欄排版（響應式設計島）'],
          ['連線慢或失敗時沒有任何回饋', '把手機切到飛航模式，再操作一次', '載入中、沒有資料、失敗三種狀態，加上重試（這一課）'],
          ['表單又長又難填', '用手機的虛擬鍵盤實際填一次', '減少欄位、選對輸入方式（「行動表單與虛擬鍵盤」）'],
        ] },
        { type: 'p', text: '一個頁面可能六種問題都有，時間卻只夠先修幾個。要挑出最大的三個，依序問這三個問題：' },
        { type: 'list', ordered: true, items: [
          '它會不會讓使用者完全做不完主要任務？看不到的操作、按不到的按鈕、永遠停在載入中的畫面，都屬於這一類，排在最前面。',
          '它會不會讓使用者做錯，而且代價很高？例如緊貼著「送出」的「清空」、小到常常按錯的按鈕。',
          '它只是讓人多花一點力氣嗎？要多捲幾下、要換手才按得到。這些也要修，但排在前兩類的後面。',
        ] },
        { type: 'p', text: '用這個方法回頭看第一節的訂單頁。「修改」與「移除」在觸控螢幕上看不到，屬於第一類。「送出訂單」只有 24px 高，又在單手最難搆到的右上角，而每一張訂單都得經過它，屬於第二類。價格排在視窗外面，要左右捲動才看得到，屬於第三類，但每一個使用者都會遇到。這就是它最大的三個問題；至於字體好不好看、圖示夠不夠精緻，都排在這些之後。' },
        { type: 'p', text: '這座島接下來的課，會把檢查表上還沒處理的項目一一補齊。下一課「行動 UI 模式：Tab bar、Drawer、Bottom sheet」比較三種手機上常見的導覽方式。「觸控目標與手勢的實作」說明按鈕要多大、彼此要隔多遠，以及手勢怎麼設計。「行動表單與虛擬鍵盤」處理在手機上填表單、配合虛擬鍵盤的做法。「安全區域、方向與動態視窗高度」處理螢幕的圓角、瀏海與底部的橫條：這一課貼在視窗底部的操作列，到了那一課還要再往上讓出一點位置。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob01-q1', prompt: '小島外送的使用者常常是這樣點餐的：站在公車上，一手拉著拉環，一手握著手機，點到一半到站了，下車後再拿出手機接著點。哪一項設計最符合這個使用情境？',
      options: [
        '把所有餐點與設定放在同一個很長的頁面上，讓使用者一次看完',
        '購物車的內容一直保留；主要操作放在螢幕底部，用一隻拇指就能完成',
        '把字級與按鈕縮小，讓一個畫面能放進更多的餐點',
        '超過 30 秒沒有操作就清空購物車，避免舊的訂單造成混淆',
      ],
      answer: 1,
      explanation: '這個情境有兩個特徵：單手操作，以及隨時會被打斷。主要操作放在底部，拇指才搆得到；購物車保留下來，使用者回來時才能接著做。很長的頁面在一次只看得到一小段的螢幕上要捲很久，而且找不到重點。縮小字級與按鈕，在晃動的車上只會更容易按錯。30 秒就清空購物車，正好懲罰了被打斷的使用者：他只是下了一趟車。',
    },
    {
      id: 'mob01-q2', prompt: '訂單頁有兩個操作：每張訂單都會按的「送出訂單」，以及很少用、按了就無法復原的「清空購物車」。在一支很高的手機上，哪一種安排最合適？',
      options: [
        '兩顆按鈕並排放在螢幕底部，都在拇指旁邊，按起來最快',
        '兩顆都放在右上角，和桌機版的位置一致，使用者不用重新學',
        '「清空購物車」放在螢幕底部，「送出訂單」放在頁首，避免使用者太快送出',
        '「送出訂單」放在螢幕底部的操作列；「清空購物車」放在離它遠的地方，執行前再確認一次',
      ],
      answer: 3,
      explanation: '位置要看多常用與按錯的代價。主要操作每次都要按，放在拇指最容易碰到的底部；破壞性的操作很少用、按錯的代價又高，要遠離主要操作，不放在最好按的位置，並在執行前確認。兩顆並排在底部，拇指稍微偏一點就會清空整張訂單。右上角是單手握著時最難搆到的地方，和桌機一致並不會讓它變得好按。把兩者的位置對調，則是讓最常用的操作最難按、最危險的操作最好按。',
    },
    {
      id: 'mob01-q3', prompt: '訂單頁的操作列用了下面的樣式。使用者回報：捲到頁面最下面時，最後一行「外送費 30 元」看不到。原因與修法是哪一個？',
      code: { language: 'CSS', text: '#bar {\n  position: fixed;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  height: 72px;\n}' },
      options: [
        '固定定位的盒子不佔位置，最後的內容被它蓋住；替內容加上至少 72px 的 `padding-bottom`，或改用 `position: sticky`',
        '`bottom: 0` 讓操作列跑到頁面的最後面；改成 `top: 0` 就不會蓋住內容',
        '`left: 0` 與 `right: 0` 把頁面撐寬了；刪掉這兩行，最後一行就會回來',
        '`position: fixed` 的元素會讓頁面無法捲動；改成 `position: absolute` 就可以捲到最下面',
      ],
      answer: 0,
      explanation: '`position: fixed` 的盒子離開了排版流，頁面的長度沒有把它算進去，所以捲到最下面時，最後 72px 的內容剛好在操作列的底下。替內容補上不小於操作列高度的 `padding-bottom`，或改用仍然佔位置的 `position: sticky`，最後一行才捲得出來。改成 `top: 0` 只是換成蓋住最上面的內容，主要操作還離開了拇指的範圍。`left` 與 `right` 只決定操作列自己的寬度，不會撐寬頁面。固定定位不會讓頁面不能捲動；改成 `absolute`，操作列會跟著頁面捲走。',
    },
    {
      id: 'mob01-q4', prompt: '菜單頁用下面的規則顯示每道菜的「加入購物車」按鈕。關於這個設計在手機上的問題，哪一個說法是對的？',
      code: { language: 'CSS', text: '.dish .add { display: none; }\n.dish:hover .add { display: block; }' },
      options: [
        '沒有問題：觸控螢幕上手指碰到螢幕之前，瀏覽器就會偵測到手指靠近並套用 `:hover`',
        '把第二條包進 `@media (max-width: 600px)` 就解決了：窄螢幕就是觸控螢幕',
        '手指沒有「停在上面但還沒按下」的狀態，使用者事先看不到這顆按鈕；必要的操作應該一直顯示',
        '`:hover` 在手機瀏覽器裡是語法錯誤，整份樣式表都會失效',
      ],
      answer: 2,
      explanation: '`:hover` 描述的是指標停在元素上、還沒按下去的狀態，手指沒有這種狀態。行動瀏覽器通常要等你點了那個元素才套用它，而使用者在點之前根本看不到按鈕，不知道這裡可以點餐。點餐是主要任務，按鈕應該一直顯示。一般的觸控螢幕感應不到還沒碰到螢幕的手指，`:hover` 也就不會提前成立。寬度不能代表輸入方式：平板超過 600px 卻是觸控，桌機的視窗也可以拉得很窄。`:hover` 在每個瀏覽器裡都是合法的選擇器，不會讓樣式表失效。',
    },
    {
      id: 'mob01-q5', prompt: '島嶼小館的頁面在 360 × 640 的螢幕上，由上到下是：300px 高的形象大圖、兩大段店家故事、營業時間，最後才是菜單。來到這一頁的人多半是要點餐。哪一種調整最合適？',
      options: [
        '把所有文字的字級縮小一半，讓菜單擠進第一個畫面',
        '用 `display: none` 在手機上藏起店家故事與營業時間，只留下菜單',
        '維持原來的順序，在最上面加一句「請往下捲動查看菜單」',
        '菜單移到最前面；店家故事與營業時間排到後面並收合在 `<details>` 裡；拿掉純裝飾的大圖',
      ],
      answer: 3,
      explanation: '第一個畫面要留給主要任務：菜單排最前面。店家故事與營業時間有人用得到，所以是延後（排到後面、收合起來，點了就展開），而不是刪除；純裝飾的大圖對點餐沒有幫助，可以拿掉。字級縮小一半，在晃動、反光的使用情境下根本讀不了。用 `display: none` 藏起來，手機使用者就完全拿不到營業時間這種有用的資訊。加一句提示沒有解決問題，只是把頁面該做的排序丟給使用者。',
    },
    {
      id: 'mob01-q6', prompt: '頁面一開始顯示「載入中…」，接著執行下面的程式。使用者正好走進電梯，連線中斷，`fetch` 被拒絕。他在畫面上會看到什麼？',
      code: { language: 'JavaScript', text: "async function loadMenu() {\n  try {\n    const response = await fetch('/api/menu');\n    const dishes = await response.json();\n    showDishes(dishes);\n  } catch (error) {\n    console.log(error);\n  }\n}\nloadMenu();" },
      options: [
        '一直停在「載入中…」：錯誤只寫進了主控台，頁面上什麼都沒變',
        '瀏覽器會自動在頁面上顯示錯誤訊息與重試按鈕',
        '`showDishes` 會收到空的陣列，畫面顯示沒有任何餐點',
        '瀏覽器會自動重新送出請求，直到成功為止',
      ],
      answer: 0,
      explanation: '`fetch` 被拒絕時，`await` 丟出錯誤，程式跳進 `catch`；`catch` 裡只有 `console.log`，頁面上的文字沒有人去改，所以永遠停在「載入中…」。使用者看不到主控台。瀏覽器不會替你的 `fetch` 顯示錯誤訊息或重試按鈕，也不會自動重送請求：失敗時畫面上要出現什麼、能按什麼，都得自己寫。`showDishes` 那一行根本沒有執行到，因為錯誤在它之前就丟出來了。',
    },
    {
      id: 'mob01-q7', prompt: '訂單進度頁要讓使用者知道餐點送到哪裡了。考慮到手機的電量與流量，哪一種做法最合適？',
      options: [
        '每秒向伺服器詢問一次，進度才會最即時',
        '只在頁面載入時詢問一次，之後要使用者自己重新整理',
        '每隔一段較長的時間詢問一次，送達之後就停止；頁面切到背景時也停下來',
        '持續播放一個旋轉的動畫，讓使用者知道頁面還活著，不必詢問伺服器',
      ],
      answer: 2,
      explanation: '輪詢的每一次詢問都要動用無線通訊與流量，所以間隔要盡量長，而且要有結束的條件：已送達就用 `clearInterval` 停掉，頁面不在前景時也不必再問。每秒問一次是每 10 秒問一次的十倍請求，對「外送到哪裡了」這種以分鐘計的資訊沒有意義。只問一次，使用者得不斷重新整理整個頁面，更耗流量也更麻煩。旋轉的動畫沒有提供任何進度，卻讓螢幕不停重畫。',
    },
    {
      id: 'mob01-q8', prompt: '你用手機檢查一個訂餐網站，記下五個問題：（甲）頁尾的版權文字偏小；（乙）「送出訂單」在右上角，只有 24px 高；（丙）「加入購物車」只在滑過餐點時才出現；（丁）連線中斷時畫面永遠停在「載入中…」；（戊）標誌在手機上有一點模糊。時間只夠先修三個，應該選哪三個？',
      options: [
        '甲、乙、戊：先處理看得到的外觀問題，使用者的第一印象最重要',
        '乙、丙、丁：它們讓使用者做不完點餐這件主要任務',
        '甲、丁、戊：挑修起來最快的，先把數量減下來',
        '甲、丙、戊：小字與模糊的圖在手機上最明顯',
      ],
      answer: 1,
      explanation: '排序的依據是對主要任務的影響。丙讓觸控螢幕的使用者看不到點餐的按鈕，丁讓使用者在連線不穩時卡住、不知道能做什麼，乙讓每一張訂單的最後一步都落在最難按、又最容易按錯的地方：這三個直接擋住或嚴重妨礙點餐。版權文字偏小與標誌模糊都不影響任何人完成訂單，屬於之後再修的外觀問題。依外觀、依明顯程度或依好不好修來挑，都會把真正擋路的問題留在網站上。',
    },
  ],
  webCode: {
    examples: [desktopBorn, reachBar, firstScreen, menuStates, polling],
    exercises: [exHover, exReach, exPriority, exRetry],
  },
};
