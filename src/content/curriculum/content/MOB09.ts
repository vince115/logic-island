import type { WebExample, WebExercise, WebRoute, WebViewport } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB09 Service workers and offline (MOB-3). The first lesson on engine stage W10, the pretend service worker: a
 * sandboxed frame can register no real one and has no Cache API, so the harness runs the page's sw.js with the life
 * cycle of the specification in small. The lesson says so once, early (section 1), with what the stand-in leaves out:
 * only fetch() calls pass through it (never the document or its img/link/script loads), it is never stopped between
 * events, nothing persists outside the preview ("執行" again is the next visit), no push or background sync.
 * The site is the made-up 小島外送; every GET of its pretend server answers a JSON array of strings, so one `load(path)`
 * in the page shows any of them and the offline fallback (/offline.json) has the same shape as the data it stands in for.
 * The stand-in enforces what a browser does where the lesson leans on it: a body is read once (cache.put takes it, so
 * "put then return the same response" fails and is a typical mistake of the network-first exercise), a cache keeps GET
 * answers only, only the active worker may claim, sw.js has no document, a version that waits keeps waiting when the
 * page is run again. Network-only is taught as "do not call respondWith". Pages read a new worker in `updatefound`.
 * The `request` check counts every request sent to the network, failed ones included; labels say "送出".
 * Stated without vendor detail: where the developer tools show service workers. Out of scope: push, background sync,
 * Workbox, IndexedDB, navigation preload, the scope option's header, updateViaCache.
 */

const PHONE: WebViewport = { width: 360, height: 640 };
const shown = (items: string[]) => items.join('、');

const SHOP = ['每天 11:00 到 20:00', '滿 300 元免運費'];
const SHOP_OLD = ['每天 11:00 到 18:00', '滿 500 元免運費'];
const SHOP_OTHER = ['週一公休', '外送範圍：全島'];
const MENU = ['海鮮便當', '烤魚定食', '海藻湯'];
const MENU_OLD = ['海鮮便當', '炸魚排'];
const MENU_OTHER = ['蛤蜊麵', '海膽丼', '魚丸湯', '海葡萄沙拉'];
const NOTICE = ['颱風天提早到 17:00 打烊'];
const NOTICE_OLD = ['本週四公休'];
const OFFLINE = ['目前離線，這份資料還沒有存過'];

/** The pretend server of 小島外送. */
const API: WebRoute[] = [
  { path: '/static/shop.json', body: SHOP },
  { path: '/api/menu', body: MENU },
  { path: '/api/notice', body: NOTICE },
  { path: '/offline.json', body: OFFLINE },
  { method: 'POST', path: '/api/orders', status: 201, body: { id: 12 } },
];

const PAGE_CSS = String.raw`body {
  margin: 0;
  padding: 12px 16px;
  font-family: system-ui, sans-serif;
}
h1 {
  margin: 0 0 8px;
  font-size: 20px;
}
button {
  min-height: 44px;
  margin: 0 4px 8px 0;
  padding: 0 12px;
  font-size: 16px;
}
#out {
  padding: 8px 12px;
  background-color: #f1f2f6;
}
#notice {
  padding: 8px 12px;
  background-color: #ffeaa7;
}`;

/** script.js of most pages starts with this: one function that asks for a JSON list and shows it. */
const LOAD_JS = String.raw`const out = document.querySelector('#out');

// 向 path 要一份 JSON（文字的陣列），把內容寫到頁面上
async function load(path) {
  out.textContent = '載入中…';
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const items = await response.json();
    out.textContent = items.join('、');
  } catch (error) {
    out.textContent = '載入失敗';
  }
}`;

const REGISTER_JS = String.raw`if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}`;

const pageJs = (...parts: string[]) => parts.join('\n\n');
const onClick = (id: string, path: string) => `document.querySelector('#${id}').addEventListener('click', () => load('${path}'));`;

// ---- section 2: the first visit ------------------------------------------------------------------------------------
const FIRST_HTML = String.raw`<h1>小島外送</h1>
<p>Service Worker 的狀態：<output id="state">尚未註冊</output></p>
<p>這個頁面：<output id="control"></output></p>
<button id="shop" type="button">店家資訊</button>
<p id="out">尚未載入</p>`;

const FIRST_JS = String.raw`const state = document.querySelector('#state');
const control = document.querySelector('#control');
const out = document.querySelector('#out');

// controller 是「正在控制這個頁面的 worker」；沒有的話是 null
function showControl() {
  const controlled = navigator.serviceWorker.controller !== null;
  control.textContent = controlled ? '由 Service Worker 控制' : '沒有被控制';
}

function report(worker) {
  state.textContent = worker.state;
  console.log('狀態：' + worker.state);
  showControl();
}

if ('serviceWorker' in navigator) {
  showControl();
  navigator.serviceWorker.register('/sw.js').then((registration) => {
    // 回訪：上一次造訪留下的 worker 已經在 active 的位置
    if (registration.active) report(registration.active);
    // 第一次造訪（或 sw.js 有新版本）：瀏覽器找到一個要安裝的 worker
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      report(worker);
      worker.addEventListener('statechange', () => report(worker));
    });
  });
} else {
  state.textContent = '這個瀏覽器不支援';
}

document.querySelector('#shop').addEventListener('click', async () => {
  try {
    const response = await fetch('/static/shop.json');
    out.textContent = (await response.json()).join('、');
  } catch (error) {
    out.textContent = '載入失敗';
  }
});`;

const FIRST_SW = String.raw`const CACHE = 'shell-v1';
const SHELL = ['/static/shop.json', '/offline.json'];

self.addEventListener('install', (event) => {
  // 安裝：把之後要用的檔案存進快取。
  // waitUntil 讓瀏覽器等到存完，才算安裝成功
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
  );
});

self.addEventListener('activate', (event) => {
  // 啟用：這裡先什麼都不做（下面的說明會請你換成一行程式）
});

self.addEventListener('fetch', (event) => {
  // 只有受控制的頁面，請求才會送到這裡
  console.log('sw.js 收到請求：' + new URL(event.request.url).pathname);
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});`;

// ---- section 3: the Cache API from a page ---------------------------------------------------------------------------
const CACHE_HTML = String.raw`<h1>Cache API 試驗台</h1>
<button id="save" type="button">抓菜單並存進快取</button>
<button id="read" type="button">從快取讀菜單</button>
<button id="clear" type="button">刪掉這個快取</button>
<p id="out">尚未操作</p>
<p>目前有的快取：<output id="names">（沒有）</output></p>`;

const CACHE_JS = String.raw`const out = document.querySelector('#out');
const names = document.querySelector('#names');

async function showNames() {
  const list = await caches.keys();
  names.textContent = list.join('、') || '（沒有）';
}

document.querySelector('#save').addEventListener('click', async () => {
  const response = await fetch('/api/menu');
  const cache = await caches.open('data-v1');
  // 副本存進快取，原本那一份留給自己讀
  await cache.put('/api/menu', response.clone());
  const dishes = await response.json();
  out.textContent = '從網路：' + dishes.join('、');
  try {
    // 同一個回應的本文，讀第二次
    await response.json();
  } catch (error) {
    console.log('第二次讀取失敗：' + error.name);
  }
  showNames();
});

document.querySelector('#read').addEventListener('click', async () => {
  const hit = await caches.match('/api/menu');
  if (hit === undefined) {
    out.textContent = '快取裡沒有';
    return;
  }
  const dishes = await hit.json();
  out.textContent = '從快取：' + dishes.join('、');
});

document.querySelector('#clear').addEventListener('click', async () => {
  await caches.delete('data-v1');
  showNames();
});`;

// ---- section 4: four strategies in one worker -----------------------------------------------------------------------
const STRATEGY_HTML = String.raw`<h1>小島外送</h1>
<p>
  <button id="shop" type="button">店家資訊</button>
  <button id="menu" type="button">今日菜單</button>
  <button id="news" type="button">店家公告</button>
  <button id="order" type="button">送出訂單</button>
</p>
<p id="out">尚未載入</p>`;

const ORDER_JS = String.raw`document.querySelector('#order').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dish: '海鮮便當', count: 2 }),
    });
    out.textContent = response.ok ? '訂單已送出' : '訂單沒有成功';
  } catch (error) {
    out.textContent = '離線中，訂單沒有送出';
  }
});`;

const NETWORK_FIRST_FN = String.raw`// 網路優先：先上網路並更新快取，連不上才用快取
async function networkFirst(request) {
  const cache = await caches.open(DATA);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return cache.match(request);
  }
}`;

const STRATEGY_SW = String.raw`const DATA = 'data-v1';

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const path = new URL(request.url).pathname;
  // 只走網路：不是 GET 的請求不呼叫 respondWith，照常送到伺服器
  if (request.method !== 'GET') return;
  if (path.startsWith('/static/')) event.respondWith(cacheFirst(request));
  else if (path === '/api/menu') event.respondWith(networkFirst(request));
  else if (path === '/api/notice') event.respondWith(staleWhileRevalidate(event));
});

// 快取優先：快取有就用，沒有才上網路
async function cacheFirst(request) {
  const hit = await caches.match(request);
  return hit || fetch(request);
}

${NETWORK_FIRST_FN}

// 先用快取、背景更新：馬上交出快取的版本，同時抓新的存起來
async function staleWhileRevalidate(event) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(event.request);
  const update = fetch(event.request)
    .then(async (response) => {
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })
    .catch(() => hit);
  // 回應交出去之後，背景的更新還沒做完：請瀏覽器先別停掉 worker
  event.waitUntil(update);
  return hit || update;
}`;

// ---- section 5: the offline fallback --------------------------------------------------------------------------------
const OFFLINE_HTML = String.raw`<h1>小島外送</h1>
<p>
  <button id="menu" type="button">今日菜單</button>
  <button id="news" type="button">店家公告</button>
</p>
<p id="out">尚未載入</p>`;

const OFFLINE_SW = String.raw`const CACHE = 'shell-v1';
const DATA = 'data-v1';

self.addEventListener('install', (event) => {
  // 離線時要交出的替代回應，要趁還有網路的時候先存好
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/offline.json']))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(DATA);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    // 網路與快取都沒有答案：交出預先存好的離線訊息
    return hit || caches.match('/offline.json');
  }
}`;

// ---- section 6 and exercise 4: an update ----------------------------------------------------------------------------
const UPDATE_HTML = String.raw`<h1>小島外送</h1>
<p id="notice" hidden>
  有新版本可以使用。
  <button id="reload" type="button">重新整理</button>
</p>
<button id="shop" type="button">店家資訊</button>
<p id="out">尚未載入</p>`;

const UPDATE_JS = pageJs(LOAD_JS, onClick('shop', '/static/shop.json'), String.raw`const notice = document.querySelector('#notice');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then((registration) => {
    // 有新版本在等待，而且這個頁面本來就有 worker 在控制：這才是「更新」
    const offer = () => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        notice.hidden = false;
      }
    };
    offer();
    registration.addEventListener('updatefound', () => {
      registration.installing.addEventListener('statechange', offer);
    });
    // 使用者同意了：請等待中的 worker 不要再等
    document.querySelector('#reload').addEventListener('click', () => {
      if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');
    });
  });

  // 控制這個頁面的 worker 換人了
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // 真正的網站在這裡呼叫 location.reload()；
    // 預覽裡的頁面不能自己重新載入，改成顯示一行字
    notice.textContent = '已換成新版';
  });
}`);

const INSTALL_SHOP = String.raw`self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
  );
});`;
const FETCH_CACHE_FIRST = String.raw`self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});`;
const ACTIVATE_CLAIM = String.raw`self.addEventListener('activate', (event) => {
  // 啟用後立刻接手已經開著的頁面
  event.waitUntil(self.clients.claim());
});`;
const ACTIVATE_CLEAN = String.raw`self.addEventListener('activate', (event) => {
  // 輪到自己上場：刪掉舊版本留下的快取，再接手已經開著的頁面
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});`;
const MESSAGE_SKIP = String.raw`self.addEventListener('message', (event) => {
  // 使用者按下「重新整理」，頁面才會送來這個訊息
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});`;
const shellHead = (version: string, note = '') => `const CACHE = 'shell-${version}';${note}\nconst SHELL = ['/static/shop.json'];`;

/** The version that is live before the update: cache shell-v1, no cleanup, no way to skip waiting. */
const SW_V1 = pageJs(shellHead('v1'), INSTALL_SHOP, ACTIVATE_CLAIM, FETCH_CACHE_FIRST);
const SW_V2 = pageJs(shellHead('v2', ' // 內容有更新，就換一個名字'), INSTALL_SHOP, ACTIVATE_CLEAN, FETCH_CACHE_FIRST, MESSAGE_SKIP);

// ---- examples ---------------------------------------------------------------------------------------------------
const examples: WebExample[] = [
  {
    id: 'mob09-ex-first', title: '第一次造訪：註冊、安裝、啟用',
    description: '一位顧客第一次打開小島外送。script.js 偵測瀏覽器支援之後註冊 `/sw.js`，把 worker 走過的每個狀態印到主控台，並顯示這個頁面有沒有被控制。sw.js 在安裝時預先快取兩個檔案；收到請求時先印一行字，再從快取找答案，找不到才上網路。',
    viewport: PHONE,
    setup: { api: API },
    files: { html: FIRST_HTML, css: PAGE_CSS, js: FIRST_JS, sw: FIRST_SW },
    observe: [
      { check: 'worker', state: 'installing', controlling: false, label: '頁面剛載入時，Service Worker 還在安裝中：它在等伺服器送回要預先快取的兩個檔案' },
      { do: 'wait', ms: 300 },
      { check: 'console', lines: ['狀態：installing', '狀態：installed', '狀態：activating', '狀態：activated'], match: 'includes', label: '主控台依序印出 installing、installed、activating、activated' },
      { check: 'cache', path: '/offline.json', name: 'shell-v1', label: '安裝完成後，快取 `shell-v1` 裡有預先存好的 `/offline.json`' },
      { check: 'worker', state: 'active', controlling: false, label: '它已經啟用，但這一次造訪的頁面沒有被它控制' },
      { do: 'click', selector: '#shop' },
      { do: 'wait', ms: 300 },
      { check: 'request', path: '/static/shop.json', count: 2, label: '按「店家資訊」：請求沒有經過 sw.js，直接送到伺服器（連同安裝時預先快取的那一次，`/static/shop.json` 一共被要了 2 次）' },
    ],
  },
  {
    id: 'mob09-ex-cache', title: 'Cache API 試驗台',
    description: '這一頁沒有 Service Worker：頁面的指令稿自己使用 `caches`。三顆按鈕分別把 `/api/menu` 的回應存進快取 `data-v1`、從快取把它讀回來、刪掉整個快取。',
    viewport: PHONE,
    setup: { api: API },
    files: { html: CACHE_HTML, css: PAGE_CSS, js: CACHE_JS },
    observe: [
      { do: 'click', selector: '#read' },
      { do: 'wait', ms: 100 },
      { check: 'text', selector: '#out', text: '快取裡沒有', label: '還沒存過就讀：`caches.match` 交出 `undefined`，不是錯誤' },
      { do: 'click', selector: '#save' },
      { do: 'wait', ms: 300 },
      { check: 'cache', path: '/api/menu', name: 'data-v1', label: '按「抓菜單並存進快取」之後，`data-v1` 裡有 `/api/menu` 的回應' },
      { check: 'console', lines: ['第二次讀取失敗：TypeError'], label: '同一個回應的本文讀第二次會失敗（TypeError）；存進快取的是事先 `clone()` 出來的副本' },
      { do: 'network', online: false },
      { do: 'click', selector: '#read' },
      { do: 'wait', ms: 100 },
      { check: 'text', selector: '#out', text: `從快取：${shown(MENU)}`, label: '切斷網路後按「從快取讀菜單」：菜單仍然拿得到' },
      { do: 'click', selector: '#clear' },
      { do: 'wait', ms: 100 },
      { check: 'cache', path: '/api/menu', match: 'absent', label: '按「刪掉這個快取」之後，任何快取裡都沒有 `/api/menu` 了' },
    ],
  },
  {
    id: 'mob09-ex-strategies', title: '四種策略，各管一種資源',
    description: '一位回訪的顧客：上次造訪已經啟用了這份 sw.js，快取裡留著當時的店家資訊、昨天的菜單與上一則公告。sw.js 的 `fetch` 監聽器依請求的方法與路徑，把它交給四種策略之一。',
    viewport: PHONE,
    setup: { api: API, worker: true, caches: { 'shell-v1': { '/static/shop.json': SHOP }, 'data-v1': { '/api/menu': MENU_OLD, '/api/notice': NOTICE_OLD } } },
    files: {
      html: STRATEGY_HTML, css: PAGE_CSS, sw: STRATEGY_SW,
      js: pageJs(LOAD_JS, [onClick('shop', '/static/shop.json'), onClick('menu', '/api/menu'), onClick('news', '/api/notice')].join('\n'), ORDER_JS, REGISTER_JS),
    },
    observe: [
      { do: 'click', selector: '#shop' },
      { do: 'wait', ms: 300 },
      { check: 'request', path: '/static/shop.json', count: 0, label: '店家資訊（快取優先）：答案來自快取，沒有任何請求送到網路' },
      { do: 'click', selector: '#menu' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(MENU), label: '今日菜單（網路優先）：連線中拿到的是伺服器的新菜單，不是快取裡昨天的那一份' },
      { do: 'click', selector: '#news' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(NOTICE_OLD), label: '店家公告（先用快取、背景更新）：連線中第一次按，看到的仍是快取裡的舊公告' },
      { do: 'click', selector: '#news' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(NOTICE), label: '再按一次：剛才在背景抓回來的新公告已經在快取裡了' },
      { do: 'click', selector: '#order' },
      { do: 'wait', ms: 300 },
      { check: 'request', method: 'POST', path: '/api/orders', count: 1, body: { dish: '海鮮便當', count: 2 }, label: '送出訂單（只走網路）：POST 請求連同內容原封不動送到伺服器' },
    ],
  },
  {
    id: 'mob09-ex-offline', title: '網路與快取都落空時的離線訊息',
    description: '一位回訪的顧客，這次一打開頁面就沒有網路。快取裡有上次看過的菜單，但他從來沒看過店家公告。sw.js 用網路優先回答所有 GET 請求，最後一關是預先快取的 `/offline.json`。',
    viewport: PHONE,
    setup: { api: API, worker: true, offline: true, caches: { 'shell-v1': { '/offline.json': OFFLINE }, 'data-v1': { '/api/menu': MENU_OLD } } },
    files: {
      html: OFFLINE_HTML, css: PAGE_CSS, sw: OFFLINE_SW,
      js: pageJs(LOAD_JS, [onClick('menu', '/api/menu'), onClick('news', '/api/notice')].join('\n'), REGISTER_JS),
    },
    observe: [
      { do: 'click', selector: '#menu' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(MENU_OLD), label: '離線時按「今日菜單」：網路失敗，改用上次存進快取的菜單' },
      { do: 'click', selector: '#news' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(OFFLINE), label: '離線時按「店家公告」：網路與快取都沒有，頁面拿到的是預先快取的離線訊息，而不是失敗的請求' },
      { check: 'request', path: '/api/notice', count: 1, label: '離線訊息是最後一關：Service Worker 還是先向網路送出了一次請求' },
      { do: 'network', online: true },
      { do: 'click', selector: '#news' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(NOTICE), label: '恢復連線後再按：拿到伺服器上真正的公告' },
      { check: 'cache', path: '/api/notice', name: 'data-v1', label: '這則公告也存進了 `data-v1`：下次離線時就看得到' },
    ],
  },
  {
    id: 'mob09-ex-update', title: '新版本在等待：請使用者決定',
    description: '這位顧客上次造訪時啟用的是第一版（快取 `shell-v1`，店家資訊寫著營業到 18:00）。伺服器上的 sw.js 現在是這裡列出的第二版，店家資訊也更新了。頁面發現有新版本在等待時顯示提示；按下「重新整理」，才通知新版本接手。',
    viewport: PHONE,
    setup: { api: API, worker: { previous: SW_V1 }, caches: { 'shell-v1': { '/static/shop.json': SHOP_OLD } } },
    files: { html: UPDATE_HTML, css: PAGE_CSS, js: UPDATE_JS, sw: SW_V2 },
    observe: [
      { do: 'wait', ms: 300 },
      { check: 'worker', state: 'waiting', controlling: true, label: '新版的 sw.js 安裝完成後停在等待：控制頁面的仍然是舊版' },
      { check: 'count', selector: '#notice:not([hidden])', count: 1, label: '頁面發現 `registration.waiting` 有東西，顯示「有新版本可以使用」' },
      { do: 'click', selector: '#shop' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(SHOP_OLD), label: '這時按「店家資訊」：回答的還是舊版與舊快取，營業到 18:00' },
      { do: 'click', selector: '#reload' },
      { do: 'wait', ms: 100 },
      { check: 'cache', path: '/static/shop.json', name: 'shell-v1', match: 'absent', label: '按下提示裡的「重新整理」：新版接手，並在 `activate` 裡刪掉了舊快取 `shell-v1`' },
      { do: 'click', selector: '#shop' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(SHOP), label: '再按「店家資訊」：答案來自新版的快取 `shell-v2`，營業到 20:00' },
    ],
  },
];

// ---- exercises --------------------------------------------------------------------------------------------------
const SHOP_PAGE_HTML = String.raw`<h1>小島外送</h1>
<button id="shop" type="button">店家資訊</button>
<p id="out">尚未載入</p>`;
const SHOP_MENU_HTML = String.raw`<h1>小島外送</h1>
<button id="shop" type="button">店家資訊</button>
<button id="menu" type="button">今日菜單</button>
<p id="out">尚未載入</p>`;
const MENU_PAGE_HTML = String.raw`<h1>小島外送</h1>
<button id="menu" type="button">今日菜單</button>
<p id="out">尚未載入</p>`;

const PRECACHE_HEAD = String.raw`const CACHE = 'shell-v1';
const SHELL = ['/static/shop.json', '/offline.json'];`;
const precacheSw = (install: string, list = PRECACHE_HEAD) => pageJs(list, install, ACTIVATE_CLAIM, String.raw`self.addEventListener('fetch', (event) => {
  // 快取優先：快取有就用，沒有才上網路
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});`);

const cacheFirstSw = (handler: string) => pageJs(shellHead('v1'), INSTALL_SHOP, ACTIVATE_CLAIM, `self.addEventListener('fetch', (event) => {\n${handler}\n});`);

const networkFirstSw = (fn: string) => pageJs(String.raw`const DATA = 'data-v1';`, ACTIVATE_CLAIM, String.raw`self.addEventListener('fetch', (event) => {
  const path = new URL(event.request.url).pathname;
  // 只有菜單由這個函式回答；其他請求照常送到網路
  if (path === '/api/menu') event.respondWith(networkFirst(event.request));
});`, fn);

const exercises: WebExercise[] = [
  {
    id: 'mob09-x-precache', title: '安裝時預先快取',
    statement: 'index.html、style.css 與 script.js 不能改。sw.js 的 `activate` 與 `fetch` 已經寫好（啟用後用 `clients.claim()` 接手頁面；請求先找快取，找不到才上網路），但 `install` 裡什麼都沒做：快取是空的，離線時「店家資訊」載不出來。請完成 `install` 的處理：把常數 `SHELL` 列出的兩個網址（`/static/shop.json` 與 `/offline.json`）存進名稱是 `CACHE`（也就是 `shell-v1`）的快取，並且讓瀏覽器等到存完，才算安裝成功。檢查的方式：模擬的伺服器要 100 毫秒才回應，所以頁面剛載入時 Service Worker 應該還在安裝中；等待之後它已經啟用並控制頁面，`shell-v1` 裡有這兩個網址；最後切斷網路按「店家資訊」，資料照樣顯示。',
    hints: [
      '`install` 的事件物件有一個方法，用來告訴瀏覽器「等這個 Promise 完成，安裝才算結束」。要交給它的 Promise 是兩步：打開快取，然後把清單裡的網址全部抓回來存進去。',
      '打開快取是 `caches.open(CACHE)`，它交出快取物件；把一整份清單存進去是 `cache.addAll(SHELL)`。兩步用 `.then` 串起來，串好的整個 Promise 交給 `event.waitUntil(...)`。',
      '`event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));`。箭頭函式如果加了大括號，裡面要寫 `return cache.addAll(SHELL);`。',
    ],
    explanation: '`caches.open(CACHE)` 打開（必要時建立）快取，`cache.addAll(SHELL)` 向伺服器要回清單上的每個網址並存進去。關鍵是把這個 Promise 交給 `event.waitUntil`：瀏覽器會等它完成才把安裝當成成功，所以在伺服器回應之前，worker 一直停在安裝中；如果有任何一個網址抓不到，Promise 失敗，這次安裝也跟著失敗，不會留下一個快取不完整的 Service Worker。安裝成功後，寫好的 `activate` 接手頁面，`fetch` 就能在離線時從快取回答。',
    viewport: PHONE,
    setup: { api: API },
    fixed: { html: SHOP_PAGE_HTML, css: PAGE_CSS, js: pageJs(LOAD_JS, onClick('shop', '/static/shop.json'), REGISTER_JS) },
    starter: { sw: precacheSw(String.raw`self.addEventListener('install', (event) => {
  // 在這裡把 SHELL 的網址存進名稱是 CACHE 的快取
});`) },
    solution: { sw: precacheSw(INSTALL_SHOP) },
    steps: [
      { check: 'worker', state: 'installing', label: '頁面剛載入、伺服器還沒回應時，Service Worker 還在安裝中：安裝會等預先快取完成' },
      { do: 'wait', ms: 300 },
      { check: 'worker', state: 'active', controlling: true, label: '等待之後，Service Worker 已經啟用，並且控制這個頁面' },
      { check: 'cache', path: '/static/shop.json', name: 'shell-v1', label: '快取 `shell-v1` 裡有 `/static/shop.json`' },
      { check: 'cache', path: '/offline.json', name: 'shell-v1', label: '快取 `shell-v1` 裡有 `/offline.json`' },
      { do: 'network', online: false },
      { do: 'click', selector: '#shop' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(SHOP), label: '切斷網路後按「店家資訊」，頁面顯示快取裡的店家資訊' },
    ],
    mistakes: [
      {
        files: { sw: precacheSw(String.raw`self.addEventListener('install', (event) => {
  caches.open(CACHE).then((cache) => cache.addAll(SHELL));
});`) },
        why: '打開了快取、也呼叫了 `addAll`，卻沒有把 Promise 交給 `event.waitUntil`。瀏覽器不會等：檔案還在路上，安裝就已經算成功。在真正的瀏覽器裡，worker 可能在存完之前被停掉；其中一個檔案抓不到時，也不會讓安裝失敗，留下一個快取不完整的 Service Worker。',
      },
      {
        files: { sw: precacheSw(String.raw`self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      cache.addAll(SHELL);
    })
  );
});`) },
        why: '箭頭函式加了大括號，卻忘了 `return`。`.then` 交出的 Promise 不會等 `addAll`，馬上就完成，`waitUntil` 等到的是一個「什麼都還沒存」的 Promise：效果和沒寫 `waitUntil` 一樣。',
      },
      {
        files: { sw: precacheSw(INSTALL_SHOP, String.raw`const CACHE = 'shell-v1';
const SHELL = ['/static/shop.json', '/offline.html'];`) },
        why: '順手把清單裡的 `/offline.json` 改成了伺服器上沒有的 `/offline.html`。`addAll` 是全有或全無：有一個網址得到 404，整個 Promise 就失敗，`/static/shop.json` 也不會被存下來；安裝失敗，這個 Service Worker 直接被丟棄。',
      },
    ],
  },
  {
    id: 'mob09-x-cache-first', title: '用快取優先回答請求',
    statement: 'index.html、style.css 與 script.js 不能改。sw.js 已經會在安裝時把 `/static/shop.json` 存進 `shell-v1`，啟用後也會接手頁面，但 `fetch` 的處理是空的，所以每個請求還是直接送到網路。請完成 `fetch` 的處理，用快取優先回答頁面的請求：快取裡有這個請求的回應，就交出它；沒有，才向網路要，並把網路的回應交回去。檢查的方式：連線中按「店家資訊」，資料出現，而且送到網路的 `/static/shop.json` 請求只有安裝時預先快取的那一次；按「今日菜單」（沒有預先快取），資料照常從網路取得；切斷網路後再按「店家資訊」，仍然有資料，也沒有多送出請求。另外會用一位「回訪而且離線」的顧客再檢查一次：他的快取裡是另一份店家資訊。',
    hints: [
      '要讓 Service Worker 回答請求，得呼叫事件物件的 `respondWith`，交給它一個「會交出回應的 Promise」。光是查快取而沒有交給 `respondWith`，請求還是照常送到網路。',
      '`caches.match(event.request)` 在所有快取裡找這個請求：找到時交出回應，找不到時交出 `undefined`。找不到的時候，改用 `fetch(event.request)` 向網路要。',
      '`event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));`',
    ],
    explanation: '`caches.match(event.request)` 找到時交出快取裡的回應，找不到時交出 `undefined`；`hit || fetch(event.request)` 就是「有就用，沒有才上網路」。整個 Promise 交給 `event.respondWith`，這個請求才由 Service Worker 回答。因為先看快取，預先快取過的店家資訊完全不會再碰網路，離線時自然也拿得到；沒存過的菜單則走 `fetch`，連線時照常運作。',
    viewport: PHONE,
    setup: { api: API },
    fixed: { html: SHOP_MENU_HTML, css: PAGE_CSS, js: pageJs(LOAD_JS, [onClick('shop', '/static/shop.json'), onClick('menu', '/api/menu')].join('\n'), REGISTER_JS) },
    starter: { sw: cacheFirstSw('  // 在這裡用「快取優先」回答 event.request') },
    solution: { sw: cacheFirstSw('  event.respondWith(\n    caches.match(event.request).then((hit) => hit || fetch(event.request))\n  );') },
    steps: [
      { do: 'wait', ms: 300 },
      { do: 'click', selector: '#shop' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(SHOP), label: '連線中按「店家資訊」：頁面顯示店家資訊' },
      { check: 'request', path: '/static/shop.json', count: 1, label: '這個答案來自快取：送到網路的 `/static/shop.json` 請求，只有安裝時預先快取的那一次' },
      { do: 'click', selector: '#menu' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(MENU), label: '按「今日菜單」：快取裡沒有的請求，改由網路回答' },
      { do: 'network', online: false },
      { do: 'click', selector: '#shop' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(SHOP), label: '切斷網路後再按「店家資訊」：仍然顯示店家資訊' },
      { check: 'request', path: '/static/shop.json', count: 1, label: '離線時也沒有再向網路送出 `/static/shop.json` 的請求' },
    ],
    variants: [
      {
        title: '回訪而且離線的顧客（快取裡是另一份店家資訊）',
        setup: { api: API, worker: true, offline: true, caches: { 'shell-v1': { '/static/shop.json': SHOP_OTHER } } },
        steps: [
          { check: 'worker', state: 'active', controlling: true, label: '回訪：頁面一載入就由 Service Worker 控制' },
          { do: 'click', selector: '#shop' },
          { do: 'wait', ms: 300 },
          { check: 'text', selector: '#out', text: shown(SHOP_OTHER), label: '離線時顯示快取裡的店家資訊' },
          { check: 'request', path: '/static/shop.json', count: 0, label: '沒有任何請求送到網路' },
        ],
      },
    ],
    mistakes: [
      {
        files: { sw: cacheFirstSw('  event.respondWith(caches.match(event.request));') },
        why: '只查快取，沒有「找不到就上網路」的後半段。快取裡沒有的請求（例如今日菜單），`caches.match` 交出 `undefined`，`respondWith` 拿不到回應，頁面的請求就失敗了：連線正常也一樣。',
      },
      {
        files: { sw: cacheFirstSw('  caches.match(event.request).then((hit) => hit || fetch(event.request));') },
        why: '查了快取，卻沒有把結果交給 `event.respondWith`。Service Worker 沒有表示「這個請求由我回答」，瀏覽器就照平常的方式把請求送到網路：連線時看不出差別，一離線就什麼都載不到。',
      },
      {
        files: { sw: cacheFirstSw('  event.respondWith(\n    fetch(event.request).catch(() => caches.match(event.request))\n  );') },
        why: '寫成了網路優先：先上網路，失敗才用快取。離線時畫面看起來一樣有資料，但每一次都先送出一個請求；對內容不會變的檔案來說，這是多繞一圈，連線很慢的時候，使用者要等到網路失敗才看得到畫面。',
      },
    ],
  },
  {
    id: 'mob09-x-network-first', title: '菜單用網路優先，離線時退回快取',
    statement: 'index.html、style.css 與 script.js 不能改。sw.js 的 `fetch` 監聽器已經把 `/api/menu` 的請求交給函式 `networkFirst(request)`，但這個函式目前只會 `fetch`：離線就失敗。請把 `networkFirst` 改成網路優先：先向網路要；拿到成功的回應時，把它的副本（`response.clone()`）存進名稱是 `DATA`（也就是 `data-v1`）的快取，再把原本的回應交回去；向網路要失敗時（離線），改交出快取裡上次存的回應。檢查的方式：連線中按「今日菜單」，顯示伺服器的菜單，而且 `data-v1` 裡多了 `/api/menu`；切斷網路後再按，顯示的是剛才存下的菜單，而且這一次仍然先向網路送出了請求。另外會用兩位回訪的顧客再檢查：一位連線中、快取裡是昨天的菜單（要看到伺服器的新菜單，快取也要跟著換新）；一位一開始就離線（要看到快取裡的菜單）。',
    hints: [
      '`fetch` 連不上時會讓 Promise 失敗：在 `async` 函式裡用 `try { … } catch (error) { … }` 包住 `await fetch(request)`，`try` 裡處理拿到回應的情況，`catch` 裡處理離線。',
      '拿到回應後，用 `caches.open(DATA)` 打開快取，再 `cache.put(request, …)` 存進去。回應的本文只能讀一次：要存的是 `response.clone()`，原本那一份交回給頁面。',
      '`try` 裡：`const response = await fetch(request);`，`if (response.ok) await cache.put(request, response.clone());`，`return response;`。`catch` 裡：`return cache.match(request);`。`const cache = await caches.open(DATA);` 寫在 `try` 的前面，兩邊都用得到。',
    ],
    explanation: '網路優先的順序是「先網路、後快取」：`await fetch(request)` 成功時，把 `response.clone()` 存進 `data-v1`，原本的回應交回給頁面，所以每一次成功的請求都順手把快取換新；`fetch` 失敗（離線）時進到 `catch`，用 `cache.match(request)` 交出上次存下的那一份。先看 `response.ok` 再存，是為了不讓伺服器的錯誤回應蓋掉快取裡原本好好的資料。注意離線那一次仍然先試了網路：這正是它和快取優先的差別，也是連線中永遠拿得到最新菜單的原因。',
    viewport: PHONE,
    setup: { api: API },
    fixed: { html: MENU_PAGE_HTML, css: PAGE_CSS, js: pageJs(LOAD_JS, onClick('menu', '/api/menu'), REGISTER_JS) },
    starter: { sw: networkFirstSw(String.raw`// 網路優先：目前只會上網路，離線就失敗
async function networkFirst(request) {
  return fetch(request);
}`) },
    solution: { sw: networkFirstSw(NETWORK_FIRST_FN) },
    steps: [
      { do: 'wait', ms: 300 },
      { do: 'click', selector: '#menu' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(MENU), label: '連線中按「今日菜單」：顯示伺服器的菜單' },
      { check: 'cache', path: '/api/menu', name: 'data-v1', label: '拿到回應後，快取 `data-v1` 裡存了一份 `/api/menu`' },
      { do: 'network', online: false },
      { do: 'click', selector: '#menu' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(MENU), label: '切斷網路後再按：顯示剛才存下的菜單，而不是「載入失敗」' },
      { check: 'request', path: '/api/menu', count: 2, label: '離線那一次仍然先向網路送出請求（前後一共 2 次），失敗後才改用快取' },
    ],
    variants: [
      {
        title: '回訪的顧客，連線中，快取裡是昨天的菜單',
        setup: { api: [{ path: '/api/menu', body: MENU_OTHER }], worker: true, caches: { 'data-v1': { '/api/menu': MENU_OLD } } },
        steps: [
          { do: 'click', selector: '#menu' },
          { do: 'wait', ms: 300 },
          { check: 'text', selector: '#out', text: shown(MENU_OTHER), label: '連線中顯示伺服器的新菜單，不是快取裡的舊菜單' },
          { do: 'network', online: false },
          { do: 'click', selector: '#menu' },
          { do: 'wait', ms: 300 },
          { check: 'text', selector: '#out', text: shown(MENU_OTHER), label: '離線後顯示的是剛才換新的那一份' },
        ],
      },
      {
        title: '回訪的顧客，一開始就離線',
        setup: { api: API, worker: true, offline: true, caches: { 'data-v1': { '/api/menu': MENU_OLD } } },
        steps: [
          { do: 'click', selector: '#menu' },
          { do: 'wait', ms: 300 },
          { check: 'text', selector: '#out', text: shown(MENU_OLD), label: '離線時顯示快取裡上次的菜單' },
          { check: 'request', path: '/api/menu', count: 1, label: '先向網路送出了一次請求' },
        ],
      },
    ],
    mistakes: [
      {
        files: { sw: networkFirstSw(String.raw`async function networkFirst(request) {
  const cache = await caches.open(DATA);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response);
    return response;
  } catch (error) {
    return cache.match(request);
  }
}`) },
        why: '把同一個 `response` 先存進快取，又交回給頁面，少了 `clone()`。回應的本文只能讀一次：`cache.put` 已經把它讀走，交給 `respondWith` 的是用過的回應，瀏覽器把這個請求當成失敗，頁面的 `fetch()` 得到錯誤：連線正常時反而「載入失敗」。快取裡倒是存好了，所以切斷網路、改由快取回答之後又突然正常：這種時好時壞的錯誤特別難找。',
      },
      {
        files: { sw: networkFirstSw(String.raw`async function networkFirst(request) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}`) },
        why: '先看快取、沒有才上網路：這是快取優先。第一次載入之後，菜單就固定在當時存下的那一份；品項售完、改了價，顧客在連線正常時看到的仍然是舊菜單，直到快取被刪掉為止。',
      },
      {
        files: { sw: networkFirstSw(String.raw`async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (error) {
    return caches.match(request);
  }
}`) },
        why: '離線時知道要找快取，連線時卻從來沒有把回應存進去。快取裡沒有東西可以退回：`caches.match` 交出 `undefined`，頁面的請求照樣失敗。網路優先的前半段有兩件事：交回回應，並且存一份副本。',
      },
    ],
  },
  {
    id: 'mob09-x-update', title: '推出第二版：換快取、清舊的、等使用者同意',
    statement: 'index.html、style.css 與 script.js 不能改。編輯器裡的 sw.js 是目前線上的第一版，顧客的裝置上已經啟用了它，快取 `shell-v1` 裡是舊的店家資訊（所以一個字都不改的話，瀏覽器不會把它當成新版本，什麼都不會發生）。店家資訊更新了，請把這份 sw.js 改成第二版，做三件事：（一）快取的名稱改成 `shell-v2`。（二）在 `activate` 裡，先刪掉所有名稱不是 `shell-v2` 的快取，刪完再 `clients.claim()`。（三）加上 `message` 事件的監聽器：收到的資料是字串 `SKIP_WAITING` 時，呼叫 `self.skipWaiting()`。固定的 script.js 在發現新版本等待時顯示提示，使用者按下「重新整理」（`#reload`）才送出這個訊息；不要在其他地方呼叫 `skipWaiting`。檢查的方式：新版安裝後停在等待，`shell-v2` 裡有 `/static/shop.json`；按下「重新整理」後新版接手，`shell-v1` 被刪掉、`shell-v2` 還在，再按「店家資訊」顯示新的內容。另外會用「裝置上留著好幾個舊快取」與「第一次造訪的新顧客」再各檢查一次。',
    hints: [
      '三件事各自獨立。先改最上面的常數；`install` 與 `fetch` 都透過 `CACHE` 這個名字做事，不必動。',
      '`caches.keys()` 交出所有快取的名稱。用 `filter` 留下「不等於 `CACHE`」的名稱，對每一個呼叫 `caches.delete(name)`，再用 `Promise.all` 等它們全部完成；整串交給 `event.waitUntil`，最後接上原本的 `self.clients.claim()`。',
      '`event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))).then(() => self.clients.claim()));`；訊息的監聽器是 `self.addEventListener(\'message\', (event) => { if (event.data === \'SKIP_WAITING\') self.skipWaiting(); });`。',
    ],
    explanation: '換了名字，新版在 `install` 時把新內容存進自己的 `shell-v2`，完全不碰舊版還在使用的 `shell-v1`。新版安裝完成後停在等待，因為舊版還控制著頁面；直到使用者按下提示，頁面送來 `SKIP_WAITING`，`self.skipWaiting()` 才讓它啟用。`activate` 是清理的時機：這時已經沒有人使用舊快取，用 `caches.keys()` 找出所有不是自己這一版的名稱，全部刪掉。不刪的話，`caches.match` 會照建立的順序先找到 `shell-v1` 裡的舊資料，新版等於白裝。',
    viewport: PHONE,
    setup: { api: API, worker: { previous: SW_V1 }, caches: { 'shell-v1': { '/static/shop.json': SHOP_OLD } } },
    fixed: { html: UPDATE_HTML, css: PAGE_CSS, js: UPDATE_JS },
    starter: { sw: SW_V1 },
    solution: { sw: SW_V2 },
    steps: [
      { do: 'wait', ms: 300 },
      { check: 'worker', state: 'waiting', controlling: true, label: '新的 sw.js 安裝完成後先等待：舊版仍然控制著頁面' },
      { check: 'cache', path: '/static/shop.json', name: 'shell-v2', label: '新版把 `/static/shop.json` 存進了自己的快取 `shell-v2`' },
      { do: 'click', selector: '#reload' },
      { do: 'wait', ms: 100 },
      { check: 'worker', state: 'active', controlling: true, label: '按下頁面上的「重新整理」之後，新版啟用並接手頁面' },
      { check: 'cache', path: '/static/shop.json', name: 'shell-v1', match: 'absent', label: '舊版留下的快取 `shell-v1` 被刪掉了' },
      { check: 'cache', path: '/static/shop.json', name: 'shell-v2', label: '新版自己的快取 `shell-v2` 還在' },
      { do: 'click', selector: '#shop' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#out', text: shown(SHOP), label: '按「店家資訊」：顯示新版快取裡的內容' },
    ],
    variants: [
      {
        title: '裝置上留著好幾個舊快取',
        setup: { api: API, worker: { previous: SW_V1 }, caches: { 'shell-beta': { '/static/shop.json': SHOP_OTHER }, 'shell-v0': { '/static/shop.json': SHOP_OTHER }, 'shell-v1': { '/static/shop.json': SHOP_OLD } } },
        steps: [
          { do: 'wait', ms: 300 },
          { check: 'worker', state: 'waiting', controlling: true, label: '新版在等待' },
          { do: 'click', selector: '#reload' },
          { do: 'wait', ms: 100 },
          { check: 'cache', path: '/static/shop.json', name: 'shell-beta', match: 'absent', label: '`shell-beta` 被刪掉' },
          { check: 'cache', path: '/static/shop.json', name: 'shell-v0', match: 'absent', label: '`shell-v0` 被刪掉' },
          { check: 'cache', path: '/static/shop.json', name: 'shell-v1', match: 'absent', label: '`shell-v1` 被刪掉' },
          { do: 'click', selector: '#shop' },
          { do: 'wait', ms: 300 },
          { check: 'text', selector: '#out', text: shown(SHOP), label: '顯示新版的內容' },
        ],
      },
      {
        title: '第一次造訪的新顧客',
        setup: { api: API },
        steps: [
          { do: 'wait', ms: 300 },
          { check: 'worker', state: 'active', controlling: true, label: '沒有舊版要等：直接啟用並接手頁面' },
          { check: 'count', selector: '#notice[hidden]', count: 1, label: '第一次安裝不是更新：提示沒有出現' },
          { do: 'network', online: false },
          { do: 'click', selector: '#shop' },
          { do: 'wait', ms: 300 },
          { check: 'text', selector: '#out', text: shown(SHOP), label: '離線時由 `shell-v2` 回答' },
        ],
      },
    ],
    mistakes: [
      {
        files: { sw: pageJs(shellHead('v2'), String.raw`self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
  );
});`, ACTIVATE_CLEAN, FETCH_CACHE_FIRST) },
        why: '沒有等使用者同意，直接在 `install` 裡呼叫 `self.skipWaiting()`。新版一裝好就強行接手：頁面還是舊版的程式，背後的 Service Worker 與快取卻已經換成新的，提示也來不及出現。題目要的是新版先等待，收到 `SKIP_WAITING` 訊息才接手。',
      },
      {
        files: { sw: pageJs(shellHead('v2'), INSTALL_SHOP, ACTIVATE_CLAIM, FETCH_CACHE_FIRST, MESSAGE_SKIP) },
        why: '換了快取名稱、也處理了訊息，卻沒有在 `activate` 裡清理。`shell-v1` 永遠留在裝置上；更糟的是 `caches.match` 照建立的順序找，會先找到 `shell-v1` 裡的舊資料：新版接手了，顧客看到的還是舊的店家資訊。',
      },
      {
        files: { sw: pageJs(shellHead('v2'), INSTALL_SHOP, String.raw`self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});`, FETCH_CACHE_FIRST, MESSAGE_SKIP) },
        why: '清理時沒有排除自己：把所有快取都刪了，連剛在 `install` 裡存好的 `shell-v2` 也一起刪掉。連線時看不出問題（快取裡沒有就上網路），一離線就什麼都沒有，預先快取等於白做。',
      },
    ],
  },
];

export const MOB09: LessonContent = {
  lessonId: 'MOB09',
  motivation: '顧客在捷運上、電梯裡、訊號只剩一格的地方打開小島外送，看到的不該是瀏覽器的「沒有網路」畫面。這一課替網站加上一支 Service Worker：把需要的檔案存在裝置上，依資源決定先問快取還是先問網路，並在推出新版時，不讓使用者卡在舊版。',
  sections: [
    {
      id: 'mob09-what', title: '站在頁面與網路之間的 Service Worker',
      blocks: [
        { type: 'p', text: '「PWA 基礎：Manifest 與安裝」讓網站裝得起來，但沒有網路時點開圖示，看到的仍然是瀏覽器的錯誤畫面：頁面的每一個檔案都要向伺服器要，要不到就什麼都沒有。Service Worker 補上的就是這一塊。它是一支 JavaScript 檔案（習慣叫 sw.js），由瀏覽器在頁面之外另外執行，位置在頁面與網路之間：受它控制的頁面發出的每一個請求，包括頁面本身的 HTML、樣式表、指令稿、圖片，以及 `fetch()` 送出的請求，都會先送到它手上。它可以把請求照常交給網路，可以從自己存的快取裡拿出回應，也可以自己造一個回應。離線還打得開，靠的就是「網路不通時，由它從快取回答」。' },
        { type: 'p', text: '它和頁面上的指令稿有三個根本的不同：' },
        { type: 'list', items: [
          '它不是頁面的一部分：沒有 `document`，碰不到 DOM。要和頁面溝通，得用 `postMessage` 互傳訊息。',
          '它只在 HTTPS 的網站上運作（在自己電腦上開發時，`localhost` 是例外）。一支能攔下所有請求的程式，不能讓人有機會在傳輸途中掉包。',
          '它是事件驅動的：有事件（安裝、請求、訊息）才被叫起來；處理完、閒置一陣子之後，瀏覽器隨時可能把它停掉，下次有事件再重新啟動，從 sw.js 的第一行重新執行。所以不能把要留到下一次的東西放在變數裡：要留的資料得存進快取這類儲存空間。',
        ] },
        { type: 'p', text: '頁面要先註冊（register）它：在頁面的指令稿裡呼叫 `navigator.serviceWorker.register(\'/sw.js\')`，它回傳一個 Promise，成功時交出一個註冊物件（registration）。不支援的環境裡沒有 `navigator.serviceWorker`，所以先用 `\'serviceWorker\' in navigator` 偵測再註冊：沒有它，網站照常運作，只是不能離線。每次載入頁面都呼叫一次沒有關係，同一個檔案已經註冊過時，瀏覽器不會重複安裝。' },
        { type: 'p', text: '一個 Service Worker 管得到哪些頁面，稱為它的範圍（scope）：預設是 sw.js 所在的資料夾，以及底下的所有網址。所以 sw.js 通常放在網站的根目錄、用 `/sw.js` 註冊，才管得到整個網站；放在 `/js/sw.js` 的話，它只管得到 `/js/` 底下的頁面。' },
        { type: 'callout', tone: 'note', title: '這一課的 Service Worker 是替身', text: '預覽裡的頁面跑在一個隔離的框架裡，瀏覽器不允許它註冊真正的 Service Worker，那裡也沒有 Cache API。所以這一課由課程提供一個替身：它執行你寫的 sw.js，事件（`install`、`activate`、`fetch`、`message`）、生命週期與快取的行為都照著規格走，只是小了一號。它沒做到的事先說清楚。（一）只有頁面用 `fetch()` 送出的請求會經過它；頁面本身的 HTML 以及 `<link>`、`<script>`、`<img>` 的載入不會。所以這一課都用 `fetch()` 讀取的資料來示範；真正的網站上，這些請求全部都會經過 Service Worker。（二）它不是另外一條執行緒，也不會在兩個事件之間被停掉；真正的 Service Worker 在頁面之外獨立執行，而且隨時可能被停掉。所以在預覽裡，靠變數記住上一個事件的結果看起來行得通，放到真正的網站上卻不可靠。（三）註冊與快取只存在這個預覽裡：再按一次「執行」，等於同一位訪客再造訪一次，上一次留下的 Service Worker 與快取都還在。預覽下方的「Service Worker 與快取」面板顯示它的狀態與每個快取的內容，並有按鈕可以切斷網路，或讓預覽回到一開始的狀態。（四）推播通知與背景同步不在這一課的範圍，替身也沒有。在真正的網站上，這些要到開發者工具裡看：有 Application（應用程式）面板的瀏覽器，會在那裡列出已註冊的 Service Worker、它的狀態，以及快取裡的每一筆內容。' },
      ],
    },
    {
      id: 'mob09-lifecycle', title: '註冊之後：安裝、等待、啟用',
      blocks: [
        { type: 'p', text: '從呼叫 `register()` 到真正攔下請求，中間有幾個固定的階段，合起來就是 Service Worker 生命週期（life cycle）。瀏覽器先下載並執行 sw.js，再依序對它發出事件；頁面可以從 worker 物件的 `state` 讀出它走到哪裡：' },
        { type: 'table', head: ['state 的值', '發生了什麼', 'sw.js 通常在這時做什麼'], rows: [
          ['`installing`', '瀏覽器發出 `install` 事件；每個版本只會收到一次', '預先快取（precache）：把之後離線要用的檔案存起來'],
          ['`installed`', '安裝成功。如果已經有舊版本在運作，就停在這裡等待（waiting）', '什麼都不做，等輪到自己'],
          ['`activating`', '輪到它上場，瀏覽器發出 `activate` 事件', '清掉舊版本留下的快取'],
          ['`activated`', '啟用完成，可以開始收到 `fetch` 事件', '回答受它控制的頁面的請求'],
          ['`redundant`', '安裝失敗，或被更新的版本取代', '它已經被丟棄，不會再收到任何事件'],
        ] },
        { type: 'p', text: '`install` 與 `activate` 的事件物件有一個 `waitUntil(promise)`：它告訴瀏覽器「這個 Promise 完成之前，這個階段還沒結束」。安裝時最常做的事，是預先快取網站的外殼（app shell），也就是畫出介面所需的 HTML、CSS、指令稿與圖示，寫成 `event.waitUntil(caches.open(\'shell-v1\').then((cache) => cache.addAll(清單)))`。`caches` 屬於下一節的 Cache API，這裡先看流程：Promise 成功，安裝才算成功；Promise 失敗（例如清單裡有一個檔案抓不到），這次安裝就失敗，worker 變成 `redundant` 被丟棄。少了 `waitUntil`，瀏覽器不會等：檔案還沒存完，它就當作安裝好了。' },
        { type: 'example', id: 'mob09-ex-first' },
        { type: 'p', text: '看預覽與主控台：頁面一載入，worker 的狀態先是 `installing`，這時 sw.js 正在等伺服器送回要預先快取的兩個檔案；接著主控台依序印出 `installed`、`activating`、`activated`，面板上的快取 `shell-v1` 也有了兩個網址。可是「這個頁面」那一行寫的是「沒有被控制」。按下「店家資訊」：資料出來了，主控台卻沒有出現「sw.js 收到請求」。這個請求沒有經過 Service Worker，直接到了伺服器：「網路請求」裡連同預先快取的兩筆，一共三筆。' },
        { type: 'p', text: '原因在於控制（control）的規則：一個頁面由哪個 Service Worker 控制，在頁面開始載入的時候就決定了。第一次造訪時，頁面載入在先、註冊在後，載入的當下還沒有任何啟用的 worker，所以這一整次造訪都不受控制；worker 啟用之後，要到下一次載入頁面才接手。現在展開範例下方的「動手改這個範例」，什麼都不必改，直接按「執行」（在預覽裡，這等於同一位訪客再來一次）：狀態直接是 `activated`，頁面「由 Service Worker 控制」。再按「店家資訊」，主控台出現「sw.js 收到請求：/static/shop.json」，而預覽下方沒有任何網路請求：答案來自快取。這時按面板上的「切斷網路連線」，再按一次「店家資訊」，照樣有資料。' },
        { type: 'p', text: '不想等到下一次載入，可以在 `activate` 裡呼叫 `self.clients.claim()`：它讓剛啟用的 worker 立刻接手範圍內已經開著的頁面。試試看：把 sw.js 裡 `activate` 的那一行註解換成 `event.waitUntil(self.clients.claim());`，按「執行」，再按面板上的「移除 Service Worker 與快取並重新載入」，從第一次造訪重來。這次 worker 一啟用，頁面就變成「由 Service Worker 控制」。（剛按下「執行」時，面板會說有新版本在等待：改過的 sw.js 對瀏覽器來說是一個新版本，這是最後一節的主題。）要不要 `claim()` 是一種取捨：它讓第一次造訪就用得到快取，但同一個頁面前半段的請求沒有經過 worker、後半段卻有，寫 `fetch` 的處理時要把這種情況想進去。' },
        { type: 'callout', tone: 'warning', title: '以為註冊完，這一次造訪就能離線', text: '註冊成功，主控台也看到 `activated`，於是馬上切斷網路測試，結果什麼都載不到，就以為 sw.js 寫錯了。其實是這一次造訪的頁面還沒有被控制：請求根本沒有送到 Service Worker。重新載入一次（或在 `activate` 裡呼叫 `clients.claim()`），請求才會經過它。測試離線的順序永遠是：先連線造訪一次，重新載入，再切斷網路。' },
      ],
    },
    {
      id: 'mob09-cache', title: 'Cache API：由你管理的快取',
      blocks: [
        { type: 'p', text: 'Service Worker 存放回應的地方是 Cache API。它和瀏覽器自動管理的 HTTP 快取是兩回事：這裡存什麼、什麼時候更新、什麼時候刪除，全部由你的程式決定，存進去的東西不會自己過期。它有兩層：最外層的 `caches` 管理許多有名字的快取；每個快取裡，是一組一組「請求與它的回應」。`caches` 在 Service Worker 裡可以用，在頁面的指令稿裡也可以用（同樣只限 HTTPS），兩邊看到的是同一份資料。下面每個方法都回傳 Promise：' },
        { type: 'table', head: ['寫法', '做什麼', '注意'], rows: [
          ['`caches.open(名稱)`', '打開這個名字的快取；沒有就建立一個', '交出快取物件，也就是下面幾列的 `cache`'],
          ['`cache.addAll([網址, …])`', '把清單上的網址全部抓回來，存進這個快取', '全有或全無：有一個連不上，或回應不是成功的狀態碼，整個 Promise 失敗，一筆都不存'],
          ['`cache.put(請求, 回應)`', '把你手上的回應，存成這個請求的答案', '給什麼就存什麼，連 404 的回應也照存；只能存 GET 請求'],
          ['`cache.match(請求)`', '在這一個快取裡找這個請求的回應', '找不到時交出 `undefined`，不是錯誤'],
          ['`caches.match(請求)`', '在所有的快取裡找', '依快取建立的先後順序找，交出第一個符合的'],
          ['`caches.keys()`', '交出所有快取的名稱', '清理舊快取時用它列出名單'],
          ['`caches.delete(名稱)`', '刪掉整個快取', '交出 `true` 或 `false`：原本有沒有這個快取'],
        ] },
        { type: 'example', id: 'mob09-ex-cache' },
        { type: 'p', text: '先按「從快取讀菜單」：什麼都還沒存，`caches.match` 交出 `undefined`，頁面顯示「快取裡沒有」。再按「抓菜單並存進快取」：頁面向 `/api/menu` 要資料，把回應的一份副本放進 `data-v1`，再把原本那一份讀成 JSON 顯示出來；預覽下方多了「Service Worker 與快取」面板，裡面有 `data-v1`。現在按面板上的「切斷網路連線」，再按「從快取讀菜單」：沒有網路，菜單還是拿得到。這就是離線的全部原理，接下來只是把「存」與「讀」搬進 Service Worker。' },
        { type: 'p', text: '主控台裡還有一行「第二次讀取失敗：TypeError」。回應的本文（body）是一條只能讀一次的資料流：`response.json()` 或 `response.text()` 讀過之後，同一個回應就不能再讀。把回應存進快取，同樣會把本文讀走。所以「存一份、自己也要用一份」的時候，要在任何人讀取之前先用 `response.clone()` 複製：一份交給 `cache.put`，另一份自己用。這在 Service Worker 裡天天遇到：從網路拿到的回應，既要存進快取，又要交回給頁面。' },
        { type: 'p', text: '試試看：在「動手改這個範例」裡把 `response.clone()` 改成 `response`，按「執行」，再按「抓菜單並存進快取」。面板上有 `data-v1`，表示存進去了；但下一行的 `response.json()` 已經讀不到本文，畫面上沒有菜單，主控台多了一個錯誤。' },
        { type: 'callout', tone: 'warning', title: '同一個回應又存又回傳', text: '在 `fetch` 的處理裡寫了 `cache.put(request, response)`，接著直接 `return response`，是最常見的錯誤：`put` 已經把本文讀走，交給 `respondWith` 的是一個用過的回應，瀏覽器把這個請求當成失敗：頁面的 `fetch()` 得到的是錯誤，不是資料。麻煩的是快取裡確實存進去了：離線時改由快取回答，反而一切正常，連線時才出錯。正確的寫法是 `cache.put(request, response.clone())`，而且要在任何人讀取本文之前就複製：本文被讀過之後才呼叫 `clone()`，它一樣會丟出錯誤。' },
        { type: 'p', text: '快取的名稱由你取，習慣在名稱裡帶上版本，例如 `shell-v1`：外殼的檔案有更新時，換成 `shell-v2` 另外存一份，再把舊的整個刪掉（最後一節）。快取不會自己清理：沒有刪掉的舊快取會一直留在使用者的裝置上；而 `caches.match` 又是照建立的順序找，舊快取裡過期的內容會比新的先被找到。' },
      ],
    },
    {
      id: 'mob09-strategies', title: '快取策略：先問快取，還是先問網路',
      blocks: [
        { type: 'p', text: '`fetch` 事件是 Service Worker 的日常工作：受控制的頁面每發出一個請求，就觸發一次。事件物件的 `event.request` 是那個請求（`url` 是完整的網址，`method` 是 GET、POST 等方法）；`event.respondWith(…)` 的意思是「這個請求由我回答」，括號裡放一個回應，或一個會交出回應的 Promise。沒有呼叫 `respondWith` 的請求，照平常的方式送到網路，和沒有 Service Worker 時一樣。`respondWith` 必須在處理函式執行的當下就呼叫，不能等到 `await` 之後：晚了一步，它會丟出錯誤，請求則照常送到網路，等於沒有攔下。所以習慣把非同步的工作包成一個回傳 Promise 的函式，整個交給它，要等的事情都在那個函式裡等。另外，在 Service Worker 裡呼叫 `fetch()` 是真的向網路送出請求，不會再繞回自己的 `fetch` 事件。' },
        { type: 'p', text: '回應要從哪裡來，就是快取策略（caching strategy）。沒有一種策略適合所有的資源，常用的有四種：' },
        { type: 'table', head: ['策略', '做法', '代價'], rows: [
          ['快取優先（cache-first）', '快取有就用；沒有才上網路', '快取裡的那一份不換掉，就永遠看到舊的'],
          ['網路優先（network-first）', '先上網路，成功就順手更新快取；連不上才用快取', '連線很慢時，要等到網路失敗才輪到快取'],
          ['先用快取、背景更新（stale-while-revalidate）', '馬上交出快取裡的版本，同時在背景抓新的存起來', '這一次看到的可能是舊的，下一次才是新的'],
          ['只走網路（network-only）', '不呼叫 `respondWith`，完全交給網路', '離線時就是失敗，頁面要自己告訴使用者'],
        ] },
        { type: 'example', id: 'mob09-ex-strategies' },
        { type: 'p', text: '這是一位回訪顧客看到的頁面：上次造訪已經啟用了 sw.js，面板上看得到快取裡留著當時的店家資訊、昨天的菜單與上一則公告。四顆按鈕各走一種策略，依序按按看。「店家資訊」：沒有任何網路請求，答案來自快取。「今日菜單」：出現了一筆網路請求，畫面上是伺服器的新菜單，快取也跟著換新。「店家公告」第一次按：明明連線中，看到的卻是快取裡的舊公告「本週四公休」，同時「網路請求」多了一筆，那是背景的更新；再按一次，才是新公告。「送出訂單」：POST 請求原封不動到了伺服器。接著按面板上的「切斷網路連線」，四顆再各按一次：前三個都還有資料（菜單是剛才存下的那一份），只有訂單失敗，而它本來就不該假裝成功。' },
        { type: 'p', text: 'sw.js 值得一段一段讀。最上面的 `fetch` 監聽器只做分派：看請求的方法與路徑，決定交給哪一個函式。三個函式都是 `async`，它們回傳的 Promise 直接交給 `respondWith`。`networkFirst` 在存進快取之前先看 `response.ok`：`fetch` 只有在完全連不上時才會失敗，伺服器回應 500 也算「有回應」；不檢查的話，一次伺服器錯誤就會把快取裡原本好好的資料蓋掉。`staleWhileRevalidate` 裡的 `event.waitUntil(update)` 是告訴瀏覽器：回應雖然已經交出去，背景的更新還沒做完，先別把 worker 停掉。' },
        { type: 'p', text: '替每一種資源選策略，問兩個問題就夠了：它會不會變？看到舊的要不要緊？以小島外送為例：' },
        { type: 'table', head: ['資源', '策略', '理由'], rows: [
          ['檔名帶版本的 CSS、指令稿、圖示與字型', '快取優先', '同一個檔名的內容不會變；改版時檔名跟著換'],
          ['頁面的 HTML', '網路優先，連不上時退回快取', '希望看到最新的頁面；離線時至少打得開'],
          ['今日菜單 `/api/menu`', '網路優先', '售完、改價要馬上反映'],
          ['店家公告、顧客的大頭貼', '先用快取、背景更新', '晚一次看到無妨，換來立刻顯示'],
          ['送出訂單、付款、登入（POST 這類會改變資料的請求）', '只走網路', '不能拿舊的答案代替；Cache API 也不能存這類請求'],
        ] },
        { type: 'callout', tone: 'warning', title: '所有請求都用快取優先', text: '把每個請求都寫成快取優先最省事，離線測試也全部會過，但資料從此不再更新：菜單改了價，顧客看到的永遠是第一次存下的那一份，直到快取被刪掉為止。快取優先只留給內容不會變的檔案；會變的資料，至少要用網路優先，或先用快取、背景更新。' },
      ],
    },
    {
      id: 'mob09-offline', title: '離線頁面：網路與快取都沒有答案的時候',
      blocks: [
        { type: 'p', text: '網路優先在連不上時退回快取，但快取不是什麼都有：顧客離線時點進一個從來沒看過的頁面，網路沒有，快取也沒有。這時如果什麼都不做，使用者看到的就是瀏覽器內建的錯誤畫面，等於沒有做離線。比較好的做法是準備一份離線頁面（offline page）：一個簡單的 HTML，說明目前離線、哪些內容還看得到、連上網路後再試一次。把它放進安裝時預先快取的清單；在 `fetch` 處理的最後一關，兩邊都沒有答案時，就交出它。' },
        { type: 'p', text: '真正的網站會先判斷請求的種類。「要載入一個頁面」的請求稱為導覽請求（navigation request），它的 `event.request.mode` 是 `\'navigate\'`：只有這種請求適合用一整頁的 HTML 代替，寫成 `caches.match(\'/offline.html\')`。圖片可以換成一張預先快取的替代圖；資料請求則回一份形狀相同的 JSON，讓頁面的程式照常運作。預覽裡的替身不會攔下頁面本身的載入（第一節說過），所以下面的範例示範的是資料請求：`/offline.json` 是預先快取的離線訊息，格式和菜單、公告一樣，是文字的陣列。' },
        { type: 'example', id: 'mob09-ex-offline' },
        { type: 'p', text: '這位顧客一打開頁面就是離線的（面板上寫著離線）。「今日菜單」上次看過，快取裡有，照樣顯示。「店家公告」從來沒載入過：網路失敗、快取落空，Service Worker 交出 `/offline.json` 的內容，頁面顯示的是一句說明，而不是「載入失敗」。按面板上的「恢復網路連線」之後再按「店家公告」，拿到的就是真正的公告，而且它被存進了快取：下次離線時也看得到了。' },
        { type: 'p', text: '有兩個細節。第一，離線時要交出的替代回應，必須趁還有網路的時候先存好：所以它在 `install` 的預先快取清單裡，而不是等到出事了才去抓。第二，替代回應是最後一關，不是第一關：先試網路、再試快取，都落空才輪到它；順序寫反了，使用者會在連線正常時看到離線訊息。' },
        { type: 'p', text: '資料請求的替代回應也可以不預先快取，由 Service Worker 當場造一個：`new Response(JSON.stringify([\'目前離線\']), { headers: { \'Content-Type\': \'application/json\' } })`。試試看：把範例 sw.js 最後的 `caches.match(\'/offline.json\')` 換成這一段，按「執行」，再按「店家公告」：出現的還是原本的離線訊息。這位顧客離線，瀏覽器連新的 sw.js 都抓不到，仍然由上次啟用的那一份服務；真正的瀏覽器也是這樣，改過的 sw.js 要等到有網路的造訪才會被發現。接著按面板上的「回到一開始的狀態並重新載入」：預覽把你改過的 sw.js 當成這位顧客上次造訪時就啟用的版本，這時按「店家公告」，顯示的就是你寫的那一句。整頁的離線頁面與替代圖片則還是要預先快取：它們不適合寫成 sw.js 裡的一段文字。' },
        { type: 'callout', tone: 'tip', title: '離線時送不出去的操作', text: '只走網路的請求（例如送出訂單）在離線時一定失敗，這是對的：不能假裝訂單成立了。該做的是讓頁面清楚說出「目前離線，訂單沒有送出」，並把使用者填好的內容留在畫面上，等連線恢復再送一次。離線頁面與離線訊息也一樣：說清楚現在看到的是之前存下的內容，或者暫時沒有內容，不要留一個空白的畫面。' },
      ],
    },
    {
      id: 'mob09-update', title: '更新流程：新版本怎麼接手',
      blocks: [
        { type: 'p', text: '網站會改版，sw.js 與它快取的檔案也要跟著換。使用者每次造訪網站，瀏覽器都會重新檢查 sw.js；只要內容和已經註冊的那一份有任何不同，就當成新版本，開始一次新的生命週期。這是更新流程的起點，而最讓人意外的是下一步：新版本安裝完成之後，不會馬上上場。只要還有任何一個分頁由舊版本控制著，新版本就停在等待（waiting）；等這些分頁全部關掉，或有人明確叫它不要等，它才啟用。只按重新整理是不夠的：瀏覽器是先開始載入新的頁面，才放掉舊的，舊版本始終有頁面在用。' },
        { type: 'p', text: '這樣設計是為了保護開著的頁面。它是用舊版的 HTML 與指令稿畫出來的；背後的 Service Worker 如果突然換成新版，快取也換了一批檔案，舊頁面再去要資源時，拿到的可能是對不上的東西。所以一次完整的更新分成三件事：' },
        { type: 'list', ordered: true, items: [
          '換一個快取名稱。新版的 sw.js 把 `shell-v1` 改成 `shell-v2`，在 `install` 裡把新的檔案存進新的快取。這時舊版還在服務頁面，舊快取一筆都不能動。',
          '在 `activate` 裡清掉舊快取。輪到新版上場，才代表沒有人再用舊快取了：用 `caches.keys()` 列出所有名稱，把不是自己這一版的都 `caches.delete()` 掉。',
          '讓使用者決定什麼時候換。頁面發現有新版本在等待，就顯示「有新版本」的提示；使用者按下去，頁面才用 `postMessage` 通知等待中的 worker。worker 收到後呼叫 `self.skipWaiting()`，不再等待、立刻啟用；頁面再從 `controllerchange` 事件得知控制它的 worker 換了，重新載入自己。',
        ] },
        { type: 'example', id: 'mob09-ex-update' },
        { type: 'p', text: '預覽載入後，面板顯示有新版本已安裝、等待中，快取有 `shell-v1` 與 `shell-v2` 兩個，頁面上出現黃色的提示。先不要按它，按「店家資訊」：回答的仍然是舊版與舊快取，營業到 18:00。再按提示裡的「重新整理」：新版接手，`shell-v1` 被刪掉，這時按「店家資訊」就是新的營業時間。真正的頁面會在 `controllerchange` 裡呼叫 `location.reload()`，讓整個頁面都換成新版的檔案；預覽裡的頁面不能自己重新載入，所以範例改成顯示一行字。' },
        { type: 'p', text: 'script.js 有兩個細節。`registration.waiting` 是「已經安裝、正在等待的那個 worker」，沒有的話是 `null`：頁面一載入就先看一次（新版本可能上次造訪就在等了），再監聽 `updatefound` 與新 worker 的 `statechange`，它變成 `installed` 時再看一次。另外，顯示提示之前要確認 `navigator.serviceWorker.controller` 存在：第一次造訪時 worker 也會經過 `installed`，但那是第一次安裝，不是更新；這時頁面沒有 controller，不該跳出「有新版本」。' },
        { type: 'callout', tone: 'warning', title: '在 install 裡無條件呼叫 skipWaiting', text: '為了省掉提示，直接在 `install` 的處理裡寫 `self.skipWaiting()`，新版本一裝好就強行接手所有開著的頁面。那些頁面跑的是舊版的程式，背後卻換成了新版的 Service Worker 與新快取：舊頁面要的檔案可能已經被刪掉，或者拿到格式對不上的新資料，而且出錯的情況很難重現。除非確定新舊版本可以混用，否則讓新版本等待，由使用者的確認（或下一次完整的造訪）來切換。' },
        { type: 'p', text: '想親眼確認「只按重新整理是不夠的」，回到範例一開始的狀態（面板上的「回到一開始的狀態並重新載入」），在新版本還在等待時展開「動手改這個範例」，什麼都不改，直接按「執行」：預覽重新載入了，面板上新版本仍然在等待，提示也再出現一次，和真正的瀏覽器一樣。按下提示裡的「重新整理」之後再按「執行」，才是一次平常的回訪：只有新版，沒有提示。在真正的網站上測試更新，同樣要到開發者工具裡：有 Application 面板的瀏覽器，可以在那裡看到正在等待的版本，通常也能取消註冊、清空快取，從第一次造訪重新測起。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob09-q1', prompt: '顧客第一次打開小島外送。頁面註冊了 sw.js，主控台顯示它的狀態已經是 `activated`；`activate` 裡沒有呼叫 `clients.claim()`。這時頁面用 `fetch()` 送出的請求會怎樣？',
      options: [
        '經過 sw.js 的 `fetch` 處理，因為 worker 已經啟用了',
        '全部失敗，直到頁面重新載入為止',
        '不經過 Service Worker，直接送到網路：這個頁面載入時還沒有啟用的 worker，這一次造訪不受控制',
        '先排隊等候，下一次造訪時再一起交給 Service Worker',
      ],
      answer: 2,
      explanation: '一個頁面由誰控制，在它開始載入時就決定了。第一次造訪時頁面先載入、之後才註冊，所以即使 worker 已經 `activated`，這一次造訪的請求也不會送到它那裡，要到下一次載入（或 worker 呼叫了 `clients.claim()`）才會。「已啟用」不等於「已控制這個頁面」，這是最常見的誤會。不受控制的請求並不會失敗或排隊，它們只是照平常的方式送到網路，和沒有 Service Worker 時一樣。',
    },
    {
      id: 'mob09-q2', prompt: '`install` 的處理裡用 `event.waitUntil` 等待 `cache.addAll([\'/index.html\', \'/style.css\', \'/logo.png\'])`，但伺服器上沒有 `/logo.png`（回應 404）。結果是什麼？',
      options: [
        '`addAll` 整個失敗，一個檔案都沒有存進去；安裝失敗，這個 worker 被丟棄',
        '前兩個檔案存進快取，`/logo.png` 被略過，安裝成功',
        '三個網址都存進快取，其中 `/logo.png` 存的是 404 的回應',
        '安裝成功，但 worker 會停在等待，直到伺服器上出現 `/logo.png`',
      ],
      answer: 0,
      explanation: '`addAll` 是全有或全無：只要有一個網址連不上，或回應不是成功的狀態碼，它的 Promise 就失敗，而且一筆都不存。這個 Promise 交給了 `waitUntil`，所以安裝跟著失敗，worker 變成 `redundant`；如果裝置上原本有舊版本，舊版本繼續運作。它不會略過失敗的那一個，也不會把 404 存進去（照存 404 的是 `cache.put`）。「等待」則是安裝成功之後、舊版本還在控制頁面時才有的狀態，和檔案抓不抓得到無關。',
    },
    {
      id: 'mob09-q3', prompt: '這段 `fetch` 的處理想把網路的回應存進快取，同時交回給頁面。它的問題是什麼？',
      code: { language: 'JavaScript', text: 'self.addEventListener(\'fetch\', (event) => {\n  event.respondWith(\n    caches.open(\'data-v1\').then((cache) =>\n      fetch(event.request).then((response) => {\n        cache.put(event.request, response);\n        return response;\n      })\n    )\n  );\n});' },
      options: [
        '`respondWith` 不能接受 Promise，只能接受已經拿到手的回應',
        '`caches.open` 只能在 `install` 事件裡呼叫',
        '在 Service Worker 裡呼叫 `fetch` 會再觸發自己的 `fetch` 事件，變成無窮迴圈',
        '回應的本文只能讀一次：`cache.put` 讀走了它，交回給頁面的回應已經不能用；應該存 `response.clone()`',
      ],
      answer: 3,
      explanation: '回應的本文是只能讀一次的資料流。`cache.put(event.request, response)` 為了存檔而讀取本文，同一個回應再交給 `respondWith` 時已經被用過，瀏覽器會把這個請求當成失敗。改成 `cache.put(event.request, response.clone())`，副本進快取、原本的交回頁面。其他三項都不對：`respondWith` 正是設計來接受 Promise 的；`caches` 在任何事件裡、甚至在頁面上都可以用；Service Worker 自己發出的 `fetch` 直接送到網路，不會再經過自己。',
    },
    {
      id: 'mob09-q4', prompt: '小島外送的「今日菜單」隨時可能有品項售完。希望顧客在連線時一定看到最新的菜單，離線時至少看得到上次的內容。`/api/menu` 該用哪一種快取策略？',
      options: [
        '快取優先',
        '網路優先，連不上時退回快取',
        '只走網路',
        '先用快取、背景更新',
      ],
      answer: 1,
      explanation: '網路優先先向伺服器要，成功就拿到最新的菜單並順手更新快取；連不上時才交出快取裡上次存的那一份，兩個要求都滿足。快取優先在第一次存下之後就不再問網路，售完的品項會一直顯示。只走網路在離線時什麼都沒有。先用快取、背景更新看起來接近，但它在連線正常時，這一次交出的仍然是快取裡的舊菜單，新的要到下一次才看得到，不符合「連線時一定看到最新」。',
    },
    {
      id: 'mob09-q5', prompt: '「店家公告」用的是先用快取、背景更新（stale-while-revalidate）。快取裡有一則舊公告，伺服器上已經換成新公告。顧客在連線正常時先後打開公告兩次，中間隔了幾秒。他各看到什麼？',
      options: [
        '第一次是舊公告，第二次是新公告',
        '兩次都是新公告：連線正常時，這個策略一定先等網路的回應',
        '兩次都是舊公告：只有離線時才會動到快取',
        '第一次是新公告，第二次是舊公告',
      ],
      answer: 0,
      explanation: '這個策略不等網路：快取裡有，就馬上交出快取的版本，所以第一次看到舊公告；同時它在背景向伺服器要新的並存進快取，幾秒後的第二次，快取裡已經是新公告。「先等網路」是網路優先的做法。它也不是離線時才更新快取，正好相反：只有連得上網路時，背景的更新才會成功。它用「這一次可能是舊的」換來「立刻顯示」，適合晚一次看到也無妨的內容。',
    },
    {
      id: 'mob09-q6', prompt: '網站推出了新版的 sw.js。一位一直開著網站分頁的顧客按了重新整理，開發者工具顯示新版本「等待中」，頁面仍然由舊版本控制。為什麼？',
      options: [
        '新版的 sw.js 有語法錯誤，所以瀏覽器不肯啟用它',
        '新版本必須等舊版本的快取全部過期，才能啟用',
        '新版本的 `install` 還沒執行，要等使用者和頁面互動之後才會開始',
        '新版本安裝完成後，要等到沒有任何頁面由舊版本控制才會啟用；重新整理時舊的頁面還沒被放掉，所以它繼續等',
      ],
      answer: 3,
      explanation: '新版本安裝成功之後進入等待，直到舊版本不再控制任何頁面，或它被 `skipWaiting()` 叫上場。重新整理時，瀏覽器先開始載入新的頁面才放掉舊的，舊版本始終有頁面在用，所以新版本繼續等：要關掉這個網站所有的分頁再打開，或由頁面的提示通知它跳過等待。有語法錯誤的 sw.js 根本裝不起來，不會出現「等待中」。Cache API 裡的東西不會自己過期，更新也和使用者有沒有互動無關；「等待中」本身就表示 `install` 已經完成了。',
    },
    {
      id: 'mob09-q7', prompt: '新版的 sw.js 改用快取 `shell-v2`。刪除舊快取 `shell-v1` 的程式應該寫在哪裡？',
      options: [
        '寫在 `install`：越早刪掉，越省使用者裝置的空間',
        '寫在 `activate`：這時新版本才真正上場，舊版本不再服務任何頁面，刪掉舊快取才安全',
        '寫在 `fetch`：每次有請求時順便檢查一次最保險',
        '不必寫：快取名稱不同，瀏覽器會自動刪掉舊的那一個',
      ],
      answer: 1,
      explanation: '新版本在 `install` 時，舊版本通常還控制著開著的頁面，仍然要從 `shell-v1` 回答請求；這時刪掉它，等於抽走正在使用中的檔案。等到 `activate`，新版本接手了，舊快取才沒有人用。寫在 `fetch` 裡則是每個請求都多做一次不必要的工作。瀏覽器也不會替你清理：Cache API 裡的快取由程式自己管理，不刪就一直留著，而且 `caches.match` 還會先找到舊快取裡的過期內容。',
    },
    {
      id: 'mob09-q8', prompt: 'sw.js 的最上面宣告了 `let count = 0;`，每次收到 `fetch` 事件就把它加一，想統計這個網站一共發出了多少請求。在真正的瀏覽器裡，這個數字為什麼不可靠？',
      options: [
        '用 `let` 宣告的變數，在 Service Worker 裡不能修改',
        '`fetch` 事件的處理函式讀不到函式外面的變數',
        '瀏覽器會在 Service Worker 閒置時把它停掉，下次有事件再從頭執行 sw.js：變數又回到 0',
        '每一個請求都由一個全新的 Service Worker 處理，彼此不共用任何變數',
      ],
      answer: 2,
      explanation: 'Service Worker 是事件驅動的：沒有事件要處理時，瀏覽器隨時可能把它停掉以節省資源，下次有事件再重新啟動，從 sw.js 的第一行執行，`count` 就回到 0。它還活著的期間，連續的事件確實共用同一個變數，所以不是「每個請求一個新的 worker」，數字會時對時錯，更難察覺。變數本身可以修改、處理函式也讀得到它，這和一般的 JavaScript 沒有不同。要跨事件保留的資料，必須寫進儲存空間。（預覽裡的替身不會被停掉，所以這個問題在預覽裡看不出來。）',
    },
  ],
  webCode: { examples, exercises },
};
