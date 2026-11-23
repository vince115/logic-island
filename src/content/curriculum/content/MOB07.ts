import type { WebExample, WebExercise, WebStep, WebViewport } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB07 Native, cross-platform or PWA (MOB-2). A lesson about a decision, taught on the made-up 小島外送 and a few other
 * made-up products. The three routes are defined neutrally; the comparison table is qualitative (no versions, dates,
 * prices, market shares, and no statement that a named platform lacks a named feature); PWA limits are taught as "what
 * to verify and how" (compatibility tables, real devices), never as a list of who lacks what.
 *
 * The decision helper is the lesson's own teaching model, presented as "a reasonable set of rules for this course", not
 * an industry standard. Its rule table (the text of section 3, the example, the exercises and their reference solutions
 * all implement exactly this; first match wins):
 *   1. deepPlatform                                   → native          (deepest platform integration)
 *   2. (store || beyondBrowser) && platforms === 1    → native          (needs an app, one platform)
 *   3. (store || beyondBrowser)                       → cross-platform  (needs an app, several platforms)
 *   4. otherwise                                      → pwa             (nothing demands an app)
 * `rule()` and `route()` below are the same table in TypeScript: every expected value in the exercises' checks is
 * computed from them, so the pages' data and the checks cannot drift apart; the tests then prove in Chromium that the
 * reference solutions (written by hand, as a learner would) agree with them.
 *
 * Feature detection is practised against a stand-in `device` object that a fixed script defines (never `navigator`), so
 * no example fact and no check depends on the learner's own browser: a device without `share` is `{}` (so that
 * `'share' in device`, `device.share` and `typeof device.share` all detect it), a device with `share` is a fake that
 * writes what it was given into the page.
 * Out of scope: any framework's API, store submission steps, manifest members (MOB08), service workers (MOB09).
 */

const lines = (...text: string[]) => text.join('\n');
const PHONE: WebViewport = { width: 360, height: 640 };

// ---- the rule table ---------------------------------------------------------------------------------------------
type Route = 'pwa' | 'cross-platform' | 'native';
type Rule = 'deep' | 'appOne' | 'appMany' | 'web';
interface Needs { platforms: 1 | 2; store: boolean; beyondBrowser: boolean; deepPlatform: boolean }
interface Product { name: string; needs: Needs }

const LABELS: Record<Route, string> = { pwa: 'PWA', 'cross-platform': '跨平台框架', native: '原生 App' };
const RULE_ROUTE: Record<Rule, Route> = { deep: 'native', appOne: 'native', appMany: 'cross-platform', web: 'pwa' };
const REASONS: Record<Rule, string> = {
  deep: '需要最深的平台整合',
  appOne: '需要 App，只有一個平台',
  appMany: '需要 App，要支援多個平台',
  web: '沒有需求非 App 不可',
};
/** The lesson's rule table: the first rule that matches decides. */
function rule(needs: Needs): Rule {
  if (needs.deepPlatform) return 'deep';
  const needsApp = needs.store || needs.beyondBrowser;
  if (needsApp && needs.platforms === 1) return 'appOne';
  if (needsApp) return 'appMany';
  return 'web';
}
const route = (needs: Needs): Route => RULE_ROUTE[rule(needs)];

const need = (platforms: 1 | 2, flags: Partial<Omit<Needs, 'platforms'>> = {}): Needs => ({ platforms, store: false, beyondBrowser: false, deepPlatform: false, ...flags });
const needsJs = (n: Needs) => `{ platforms: ${n.platforms}, store: ${n.store}, beyondBrowser: ${n.beyondBrowser}, deepPlatform: ${n.deepPlatform} }`;

/** The five products of the helper page: one per rule, plus a one-platform product that still needs no app. */
const PRODUCTS: Product[] = [
  { name: '小島外送點餐', needs: need(2) },
  { name: '外送員接單', needs: need(1, { beyondBrowser: true }) },
  { name: '島嶼健走', needs: need(2, { store: true }) },
  { name: '潮汐小工具', needs: need(2, { store: true, deepPlatform: true }) },
  { name: '島嶼圖書館借閱', needs: need(1) },
];
/** Why each of them gets its route, in the learner's words (used in the check labels). */
const PRODUCT_NOTES = ['四個條件都不成立', '瀏覽器做不到的必要功能，一個平台', '必須上架，兩個平台', '最深的平台整合，同時也要上架兩個平台', '只有一個平台，但沒有需求非 App 不可'];

const PAGE_CSS = lines(
  'body { margin: 0; padding: 16px; font-family: sans-serif; line-height: 1.5; }',
  'h1 { margin: 0 0 12px; font-size: 20px; }',
  'h2 { margin: 16px 0 4px; font-size: 16px; }',
  'p { margin: 8px 0; }',
  'button { min-height: 44px; margin: 4px 4px 4px 0; padding: 0 16px; font: inherit; }',
);
const TABLE_CSS = lines(
  PAGE_CSS,
  'table { width: 100%; border-collapse: collapse; }',
  'caption { padding: 4px 0; text-align: left; font-weight: bold; }',
  'th, td { padding: 8px; border: 1px solid #b0bec5; text-align: left; font-size: 15px; }',
);

const productLines = (products: Product[]) => products.map(p => `    { name: '${p.name}',\n      needs: ${needsJs(p.needs)} },`).join('\n');

/**
 * The helper page: the products (and, for the exercise with reasons, the reasons) are data in index.html, script.js
 * holds only `chooseRoute`, and a fixed script after it draws one row per product. `verdict` pages show "route: reason".
 */
const routeHtml = (products: Product[], reasons?: Record<Rule, string>) => `<h1>該走哪一條路線？</h1>
<table>
  <thead>
    <tr><th scope="col">產品</th><th scope="col">${reasons ? '路線與理由' : '路線'}</th></tr>
  </thead>
  <tbody id="result"></tbody>
</table>
<script>
  const LABELS = { pwa: 'PWA', 'cross-platform': '跨平台框架', native: '原生 App' };
${reasons ? `  const REASONS = {
    deep: '${reasons.deep}',
    appOne: '${reasons.appOne}',
    appMany: '${reasons.appMany}',
    web: '${reasons.web}',
  };
` : ''}  const products = [
${productLines(products)}
  ];
</script>
<script src="script.js"></script>
<script>
  // 把每個產品的需求交給 chooseRoute，畫成表格的一列
  for (const product of products) {
    const result = chooseRoute(product.needs);
    const row = document.createElement('tr');
    const head = document.createElement('th');
    head.scope = 'row';
    head.textContent = product.name;
    const cell = document.createElement('td');
${reasons ? `    cell.className = 'verdict';
    cell.textContent = LABELS[result.route] + '：' + result.reason;` : `    cell.className = 'route';
    cell.textContent = LABELS[result];`}
    row.append(head, cell);
    document.querySelector('#result').append(row);
  }
</script>`;

const routeChecks = (products: Product[], notes?: string[]): WebStep[] => products.map((p, i): WebStep => ({
  check: 'text', selector: `#result tr:nth-child(${i + 1}) .route`, text: LABELS[route(p.needs)],
  label: `「${p.name}」${notes ? `（${notes[i]}）` : ''}的路線是「${LABELS[route(p.needs)]}」`,
}));
const verdictChecks = (products: Product[], reasons: Record<Rule, string>, notes?: string[]): WebStep[] => products.map((p, i): WebStep => ({
  check: 'text', selector: `#result tr:nth-child(${i + 1}) .verdict`, text: `${LABELS[route(p.needs)]}：${reasons[rule(p.needs)]}`,
  label: `「${p.name}」${notes ? `（${notes[i]}）` : ''}顯示「${LABELS[route(p.needs)]}：${reasons[rule(p.needs)]}」`,
}));

/** `chooseRoute` returning the route only: the example's script, and the body the first exercise reorders. */
const chooseJs = (...body: string[]) => lines(
  '// 規則由上往下檢查，第一條符合的就是答案',
  'function chooseRoute(needs) {',
  ...body,
  '}',
);
const CHOOSE_BODY = [
  "  if (needs.deepPlatform) return 'native';",
  '  const needsApp = needs.store || needs.beyondBrowser;',
  "  if (needsApp && needs.platforms === 1) return 'native';",
  "  if (needsApp) return 'cross-platform';",
  "  return 'pwa';",
];

// ---- examples ---------------------------------------------------------------------------------------------------
const examples: WebExample[] = [
  {
    id: 'mob07-codebases', title: '三條路線各要維護幾份程式碼',
    description: '勾選 App 要支援的手機平台，表格列出三條路線各要維護幾份程式碼。',
    viewport: PHONE,
    files: {
      html: lines(
        '<h1>小島外送要支援哪些平台？</h1>',
        '<p>',
        '  <label><input type="checkbox" id="android" checked> Android</label>',
        '  <label><input type="checkbox" id="ios" checked> iOS</label>',
        '</p>',
        '<table>',
        '  <caption>要維護的程式碼</caption>',
        '  <tbody>',
        '    <tr><th scope="row">原生 App</th><td id="native"></td></tr>',
        '    <tr><th scope="row">跨平台框架</th><td id="cross"></td></tr>',
        '    <tr><th scope="row">PWA</th><td id="pwa"></td></tr>',
        '  </tbody>',
        '</table>',
      ),
      css: TABLE_CSS,
      js: lines(
        "const boxes = document.querySelectorAll('input[type=\"checkbox\"]');",
        '',
        'function update() {',
        '  let platforms = 0;',
        '  for (const box of boxes) {',
        '    if (box.checked) platforms += 1;',
        '  }',
        "  document.querySelector('#native').textContent = `${platforms} 份：每個平台各一份`;",
        "  document.querySelector('#cross').textContent = platforms > 0 ? '1 份：各平台共用' : '0 份';",
        "  document.querySelector('#pwa').textContent = '1 份：就是網站本身';",
        '}',
        '',
        'for (const box of boxes) {',
        "  box.addEventListener('change', update);",
        '}',
        'update();',
      ),
    },
    observe: [
      { check: 'text', selector: '#native', text: '2 份：每個平台各一份', label: '兩個平台都勾選時，原生 App 要維護 2 份程式碼：每個平台各一份' },
      { check: 'text', selector: '#cross', text: '1 份：各平台共用', label: '跨平台框架是 1 份各平台共用的程式碼' },
      { do: 'check', selector: '#ios', checked: false },
      { check: 'text', selector: '#native', text: '1 份：每個平台各一份', label: '取消勾選 iOS，只剩一個平台：原生 App 變成 1 份，和跨平台框架一樣多' },
      { check: 'text', selector: '#pwa', text: '1 份：就是網站本身', label: 'PWA 一直是 1 份：它就是網站本身，和勾選幾個平台無關' },
    ],
  },
  {
    id: 'mob07-updates', title: '修正一個錯字，新版怎麼到使用者手上',
    description: '同一件小事在兩種發布方式下各要走幾步：網站部署後重新載入就是新版；商店裡的 App 要送出、通過審核，裝置再更新。',
    viewport: PHONE,
    files: {
      html: lines(
        '<h1>修正一個錯字之後</h1>',
        '<h2>網站或 PWA</h2>',
        '<p>伺服器上是第 <output id="web-live">1</output> 版，使用者看到第 <output id="web-seen">1</output> 版</p>',
        '<button id="web-deploy" type="button">部署新版</button>',
        '<button id="web-open" type="button">使用者重新載入</button>',
        '<h2>商店裡的 App</h2>',
        '<p>商店：<span id="store">第 1 版上架中</span></p>',
        '<p>使用者的裝置上是第 <output id="app-seen">1</output> 版</p>',
        '<button id="app-submit" type="button">送出新版</button>',
        '<button id="app-approve" type="button">審核通過</button>',
        '<button id="app-update" type="button">使用者的裝置更新</button>',
      ),
      css: PAGE_CSS,
      js: lines(
        'const show = (id, text) => { document.querySelector(id).textContent = text; };',
        'let webLive = 1;      // 伺服器上的版本',
        'let storeLive = 1;    // 商店裡可以安裝的版本',
        'let inReview = false; // 有沒有新版正在審核',
        '',
        "document.querySelector('#web-deploy').addEventListener('click', () => {",
        '  webLive += 1;',
        "  show('#web-live', webLive);",
        '});',
        "document.querySelector('#web-open').addEventListener('click', () => show('#web-seen', webLive));",
        '',
        "document.querySelector('#app-submit').addEventListener('click', () => {",
        '  inReview = true;',
        "  show('#store', `第 ${storeLive} 版上架中，第 ${storeLive + 1} 版審核中`);",
        '});',
        "document.querySelector('#app-approve').addEventListener('click', () => {",
        '  if (!inReview) return;',
        '  inReview = false;',
        '  storeLive += 1;',
        "  show('#store', `第 ${storeLive} 版上架中`);",
        '});',
        "document.querySelector('#app-update').addEventListener('click', () => show('#app-seen', storeLive));",
      ),
    },
    observe: [
      { do: 'click', selector: '#web-deploy' },
      { do: 'click', selector: '#web-open' },
      { check: 'text', selector: '#web-seen', text: '2', label: '網站：部署新版之後，使用者重新載入就看到第 2 版，一共兩步' },
      { do: 'click', selector: '#app-submit' },
      { check: 'text', selector: '#store', text: '第 1 版上架中，第 2 版審核中', label: 'App：送出新版之後，商店裡能安裝的仍是第 1 版，第 2 版還在審核' },
      { do: 'click', selector: '#app-update' },
      { check: 'text', selector: '#app-seen', text: '1', label: '審核還沒通過時，使用者的裝置就算更新，拿到的還是第 1 版' },
      { do: 'click', selector: '#app-approve' },
      { do: 'click', selector: '#app-update' },
      { check: 'text', selector: '#app-seen', text: '2', label: '審核通過、裝置再更新一次，使用者的裝置上才是第 2 版' },
    ],
  },
  {
    id: 'mob07-helper', title: '把五個產品交給規則表',
    description: 'index.html 記錄五個虛構產品的需求；script.js 的 `chooseRoute` 就是這一課的規則表，由上往下，第一條符合的就是答案。',
    viewport: PHONE,
    files: { html: routeHtml(PRODUCTS), css: TABLE_CSS, js: chooseJs(...CHOOSE_BODY) },
    observe: [
      { check: 'text', selector: '#result tr:nth-child(1) .route', text: 'PWA', label: '「小島外送點餐」四個條件都不成立，落到第 4 條規則：PWA' },
      { check: 'text', selector: '#result tr:nth-child(2) .route', text: '原生 App', label: '「外送員接單」有瀏覽器做不到的必要功能，而且只有一個平台，符合第 2 條規則：原生 App' },
      { check: 'text', selector: '#result tr:nth-child(3) .route', text: '跨平台框架', label: '「島嶼健走」必須上架、要支援兩個平台，符合第 3 條規則：跨平台框架' },
      { check: 'text', selector: '#result tr:nth-child(4) .route', text: '原生 App', label: '「潮汐小工具」同時符合第 1 條與第 3 條，第 1 條在前面，所以是原生 App' },
      { check: 'text', selector: '#result tr:nth-child(5) .route', text: 'PWA', label: '「島嶼圖書館借閱」只有一個平台，但沒有需求非 App 不可：仍然是 PWA' },
    ],
  },
  {
    id: 'mob07-share', title: '同一段程式，放在兩支不同的裝置上',
    description: '`setUpShare` 先偵測裝置有沒有 `share`：有就交給系統的分享面板，沒有就顯示可以複製的連結。兩個裝置都是替身物件，不是你的瀏覽器。',
    viewport: PHONE,
    files: {
      html: lines(
        '<h1>今日特餐：海鮮粥</h1>',
        '<section id="a">',
        '  <h2>裝置甲：有分享功能</h2>',
        '  <button class="share" type="button">分享</button>',
        '  <p class="fallback" hidden><label>複製這個連結 <input class="link" readonly></label></p>',
        '  <p class="log"></p>',
        '</section>',
        '<section id="b">',
        '  <h2>裝置乙：沒有分享功能</h2>',
        '  <button class="share" type="button">分享</button>',
        '  <p class="fallback" hidden><label>複製這個連結 <input class="link" readonly></label></p>',
        '  <p class="log"></p>',
        '</section>',
      ),
      css: lines(PAGE_CSS, 'input { box-sizing: border-box; width: 100%; height: 44px; font: inherit; }'),
      js: lines(
        "const page = { title: '今日特餐：海鮮粥', url: 'https://food.example/special' };",
        '',
        '// 兩個替身裝置：甲的 share 是假的，只把收到的資料寫在頁面上；乙沒有 share',
        'const deviceA = {',
        '  share(data) {',
        "    document.querySelector('#a .log').textContent = `系統的分享面板打開了：${data.title}`;",
        '    return Promise.resolve();',
        '  },',
        '};',
        'const deviceB = {};',
        '',
        'function setUpShare(section, device) {',
        "  section.querySelector('.share').addEventListener('click', () => {",
        "    if ('share' in device) {",
        '      device.share({ title: page.title, url: page.url });',
        '    } else {',
        "      section.querySelector('.fallback').hidden = false;",
        "      section.querySelector('.link').value = page.url;",
        '    }',
        '  });',
        '}',
        '',
        "setUpShare(document.querySelector('#a'), deviceA);",
        "setUpShare(document.querySelector('#b'), deviceB);",
      ),
    },
    observe: [
      { check: 'attr', selector: '#b .fallback', name: 'hidden', label: '還沒按之前，裝置乙的備用連結是隱藏的（有 `hidden` 屬性）' },
      { do: 'click', selector: '#a .share' },
      { check: 'text', selector: '#a .log', text: '系統的分享面板打開了：今日特餐：海鮮粥', label: '按裝置甲的「分享」：偵測到 `share`，程式把標題交給它' },
      { check: 'attr', selector: '#a .fallback', name: 'hidden', label: '裝置甲不需要退路：備用連結仍然隱藏' },
      { do: 'click', selector: '#b .share' },
      { check: 'attr', selector: '#b .fallback', name: 'hidden', match: 'absent', label: '按裝置乙的「分享」：沒有 `share`，備用連結顯示出來（`hidden` 被拿掉）' },
      { check: 'value', selector: '#b .link', value: 'https://food.example/special', label: '裝置乙的欄位裡是這一頁的網址，可以選取後複製' },
    ],
  },
  {
    id: 'mob07-needs', title: '需求一變，路線跟著變',
    description: '直接改四項需求，頁面用同一張規則表重新算出路線，並寫出這條路線的代價。',
    viewport: PHONE,
    files: {
      html: lines(
        '<h1>需求一變，路線跟著變</h1>',
        '<form id="needs">',
        '  <label><input type="checkbox" id="store"> 必須在應用程式商店上架</label>',
        '  <label><input type="checkbox" id="beyond"> 有必要功能是瀏覽器沒有提供的</label>',
        '  <label><input type="checkbox" id="deep"> 需要最深的平台整合</label>',
        '  <label>App 要支援的平台數',
        '    <select id="platforms"><option>1</option><option selected>2</option></select>',
        '  </label>',
        '</form>',
        '<p>路線：<strong id="route"></strong></p>',
        '<p id="cost"></p>',
        '<script>',
        "  const LABELS = { pwa: 'PWA', 'cross-platform': '跨平台框架', native: '原生 App' };",
        '  const COSTS = {',
        "    pwa: '代價：能用的裝置功能以瀏覽器為限，預設不在商店裡',",
        "    'cross-platform': '代價：要學框架、走商店的流程；框架沒包好的功能要寫原生模組',",
        "    native: '代價：每個平台各一份程式碼與人力，也要走商店的流程',",
        '  };',
        '</script>',
      ),
      css: lines(PAGE_CSS, 'label { display: block; padding: 8px 0; }', 'select { min-height: 44px; font: inherit; }'),
      js: lines(
        chooseJs(...CHOOSE_BODY),
        '',
        'function update() {',
        '  const route = chooseRoute({',
        "    platforms: Number(document.querySelector('#platforms').value),",
        "    store: document.querySelector('#store').checked,",
        "    beyondBrowser: document.querySelector('#beyond').checked,",
        "    deepPlatform: document.querySelector('#deep').checked,",
        '  });',
        "  document.querySelector('#route').textContent = LABELS[route];",
        "  document.querySelector('#cost').textContent = COSTS[route];",
        '}',
        '',
        "document.querySelector('#needs').addEventListener('change', update);",
        'update();',
      ),
    },
    observe: [
      { check: 'text', selector: '#route', text: 'PWA', label: '一開始四個條件都不成立：路線是 PWA' },
      { do: 'check', selector: '#beyond', checked: true },
      { check: 'text', selector: '#route', text: '跨平台框架', label: '勾選「有必要功能是瀏覽器沒有提供的」（兩個平台）：路線變成跨平台框架' },
      { do: 'select', selector: '#platforms', value: '1' },
      { check: 'text', selector: '#route', text: '原生 App', label: '再把平台數改成 1：路線變成原生 App' },
      { do: 'check', selector: '#beyond', checked: false },
      { check: 'text', selector: '#route', text: 'PWA', label: '取消勾選那項需求（平台數仍是 1）：路線回到 PWA，平台數本身不會把產品推向 App' },
      { check: 'text', selector: '#cost', text: '代價：能用的裝置功能以瀏覽器為限，預設不在商店裡', label: '路線下面寫著它的代價：PWA 能用的裝置功能以瀏覽器為限' },
    ],
  },
];

// ---- exercises --------------------------------------------------------------------------------------------------
const ORDER_VARIANT: Product[] = [
  { name: '山徑地圖', needs: need(2, { beyondBrowser: true, deepPlatform: true }) },
  { name: '漁港報價', needs: need(1, { deepPlatform: true }) },
  { name: '夜市點餐機', needs: need(2, { beyondBrowser: true }) },
  { name: '民宿管家', needs: need(1, { store: true }) },
  { name: '島嶼電台', needs: need(2) },
];

const VARIANT_REASONS: Record<Rule, string> = {
  deep: '和系統結合得最深，選原生',
  appOne: '要 App，單一平台',
  appMany: '要 App，多個平台',
  web: '網站就夠了',
};
const VERDICT_VARIANT: Product[] = [
  { name: '民宿管家', needs: need(1, { store: true, deepPlatform: true }) },
  { name: '夜市點餐機', needs: need(2, { beyondBrowser: true }) },
  { name: '漁港報價', needs: need(1, { store: true }) },
  { name: '島嶼電台', needs: need(1) },
  { name: '山徑地圖', needs: need(2, { store: true, beyondBrowser: true }) },
];
const verdictJs = (...body: string[]) => lines(
  '// 依規則表由上往下檢查，回傳 { route, reason }',
  'function chooseRoute(needs) {',
  ...body,
  '}',
);

const shareHtml = (dish: string, url: string, hasShare: boolean) => `<h1>${dish}</h1>
<p>小島外送今日供應</p>
<button id="share" type="button">分享這道菜</button>
<p id="fallback" hidden>
  <label for="link">複製這個連結</label>
  <input id="link" readonly>
</p>
<p id="log"></p>
<script>
  const page = { title: '${dish}', url: '${url}' };
${hasShare ? `  // 這一頁的裝置有分享功能。它是假的：只把收到的資料寫進 #log
  const device = {
    share(data) {
      document.querySelector('#log').textContent = '已交給系統分享：' + data.title + '（' + data.url + '）';
      return Promise.resolve();
    },
  };` : `  // 這一頁的裝置沒有分享功能
  const device = {};`}
</script>`;
const SHARE_CSS = lines(
  PAGE_CSS,
  'label { display: block; }',
  '#link { box-sizing: border-box; width: 100%; height: 44px; font: inherit; }',
);
const shareJs = (...body: string[]) => lines(
  "const button = document.querySelector('#share');",
  "const fallback = document.querySelector('#fallback');",
  "const link = document.querySelector('#link');",
  '',
  "button.addEventListener('click', () => {",
  ...body,
  '});',
);

interface Staged { name: string; now: Needs; later: Needs }
const STAGED: Staged[] = [
  { name: '小島外送', now: need(2), later: need(2, { beyondBrowser: true }) },
  { name: '島嶼圖書館借閱', now: need(1), later: need(1) },
  { name: '島嶼健走', now: need(2, { store: true }), later: need(2, { store: true, deepPlatform: true }) },
  { name: '外送員接單', now: need(1, { beyondBrowser: true }), later: need(1, { store: true, beyondBrowser: true }) },
];
const STAGED_NOTES = ['之後多了一項瀏覽器做不到的必要功能', '兩份需求相同', '之後需要最深的平台整合', '之後多了上架的要求，但算出來的路線沒有變'];
const STAGED_VARIANT: Staged[] = [
  { name: '海景民宿訂房', now: need(1), later: need(1, { store: true }) },
  { name: '夜市點餐機', now: need(2, { beyondBrowser: true }), later: need(2, { store: true, beyondBrowser: true }) },
  { name: '島嶼電台', now: need(2), later: need(2) },
  { name: '山徑地圖', now: need(2), later: need(2, { deepPlatform: true }) },
];
const planText = (p: Staged) => route(p.now) === route(p.later) ? `兩個階段都是：${LABELS[route(p.now)]}` : `第一版：${LABELS[route(p.now)]}；之後：${LABELS[route(p.later)]}`;
const stagedHtml = (products: Staged[]) => `<h1>分階段的決定</h1>
<table>
  <thead>
    <tr><th scope="col">產品</th><th scope="col">計畫</th></tr>
  </thead>
  <tbody id="result"></tbody>
</table>
<script>
  const LABELS = { pwa: 'PWA', 'cross-platform': '跨平台框架', native: '原生 App' };

  // 這一課的規則表：由上往下，第一條符合的就是答案
  function chooseRoute(needs) {
    if (needs.deepPlatform) return 'native';
    const needsApp = needs.store || needs.beyondBrowser;
    if (needsApp && needs.platforms === 1) return 'native';
    if (needsApp) return 'cross-platform';
    return 'pwa';
  }

  // now 是第一版的需求，later 是之後確定要做的需求
  const products = [
${products.map(p => `    { name: '${p.name}',\n      now: ${needsJs(p.now)},\n      later: ${needsJs(p.later)} },`).join('\n')}
  ];
</script>
<script src="script.js"></script>
<script>
  // 把每個產品交給 plan，畫成表格的一列
  for (const product of products) {
    const row = document.createElement('tr');
    const head = document.createElement('th');
    head.scope = 'row';
    head.textContent = product.name;
    const cell = document.createElement('td');
    cell.className = 'plan';
    cell.textContent = plan(product);
    row.append(head, cell);
    document.querySelector('#result').append(row);
  }
</script>`;
const planChecks = (products: Staged[], notes?: string[]): WebStep[] => products.map((p, i): WebStep => ({
  check: 'text', selector: `#result tr:nth-child(${i + 1}) .plan`, text: planText(p),
  label: `「${p.name}」${notes ? `（${notes[i]}）` : ''}的計畫是「${planText(p)}」`,
}));
const planJs = (...body: string[]) => lines(
  '// 回傳一句話：兩個階段各走哪一條路線',
  'function plan(product) {',
  ...body,
  '}',
);

const exercises: WebExercise[] = [
  {
    id: 'mob07-ex-order', title: '規則的先後：先符合的先決定',
    statement: 'index.html 與 style.css 不能改。index.html 記錄了五個產品的需求，並把每一個交給 script.js 的 `chooseRoute(needs)`，把回傳的路線畫成表格。這一課的規則表是：（1）`deepPlatform` 是 `true`，回傳 `\'native\'`；（2）`store` 或 `beyondBrowser` 是 `true`，而且 `platforms` 是 1，回傳 `\'native\'`；（3）`store` 或 `beyondBrowser` 是 `true`，回傳 `\'cross-platform\'`；（4）其餘回傳 `\'pwa\'`。由上往下，第一條符合的就是答案。現在的 `chooseRoute` 四條規則都寫了，先後卻放錯：「潮汐小工具」需要最深的平台整合，同時也要在兩個平台上架，被判成了跨平台框架。請調整 script.js，讓五個產品的路線都符合規則表。檢查還會換一組產品再執行一次，所以不要針對這一頁的資料補特例。',
    hints: [
      '函式由上往下執行，遇到第一個成立的 `if` 就 `return`，後面的規則沒有機會被檢查。先找出「潮汐小工具」是在哪一行被回傳的。',
      '它的 `store` 是 `true`、`platforms` 是 2，所以在 `if (needsApp) return \'cross-platform\';` 那一行就結束了，輪不到檢查 `deepPlatform` 的那一行。',
      '把 `if (needs.deepPlatform) return \'native\';` 移到函式的最前面（至少要在回傳 `\'cross-platform\'` 的那一行之前）。',
    ],
    explanation: '函式裡的 `if` 由上往下執行，第一個成立的就 `return`，所以「寫在前面」就是「優先」。規則表把 `deepPlatform` 放在第 1 條，是因為它指的就是只有原生接得住的需求：這樣的產品即使同時要在兩個平台上架，也不能因此改選跨平台框架。把那一行移到最前面之後，「潮汐小工具」先在第 1 條得到 `\'native\'`；其餘四個產品的 `deepPlatform` 都是 `false`，結果不變。第 1 條與第 2 條回傳的都是 `\'native\'`，所以這兩條誰先誰後不影響路線；重點是它必須排在回傳 `\'cross-platform\'` 的那一條之前。只替「`deepPlatform` 而且 `store`」補一條特例，這一頁看起來也對了，但規則說的是只要 `deepPlatform` 成立就選原生：換一組產品就會露出破綻。',
    viewport: PHONE,
    fixed: { html: routeHtml(PRODUCTS), css: TABLE_CSS },
    starter: { js: chooseJs(CHOOSE_BODY[1], CHOOSE_BODY[2], CHOOSE_BODY[3], CHOOSE_BODY[0], CHOOSE_BODY[4]) },
    solution: { js: chooseJs(...CHOOSE_BODY) },
    steps: [
      { check: 'count', selector: '#result tr', count: 5, label: '表格有五列：每個產品一列（`chooseRoute` 沒有丟出錯誤）' },
      ...routeChecks(PRODUCTS, PRODUCT_NOTES),
    ],
    mistakes: [
      {
        files: { js: chooseJs(CHOOSE_BODY[1], CHOOSE_BODY[3], CHOOSE_BODY[2], CHOOSE_BODY[0], CHOOSE_BODY[4]) },
        why: '把兩條「需要 App」的規則對調了：`if (needsApp) return \'cross-platform\';` 排到最前面，只要需要 App 就在這一行結束，後面的「只有一個平台」與 `deepPlatform` 兩條永遠輪不到。「外送員接單」只有一個平台，卻被判成跨平台框架，「潮汐小工具」也仍然是錯的。',
      },
      {
        files: { js: chooseJs(CHOOSE_BODY[1], "  if (needs.deepPlatform && needs.store) return 'native';", CHOOSE_BODY[2], CHOOSE_BODY[3], CHOOSE_BODY[0], CHOOSE_BODY[4]) },
        why: '只替這一頁出錯的那個產品補了一條特例（`deepPlatform` 而且 `store`）。這一頁的五個產品都對了，但規則表的第 1 條是「只要 `deepPlatform` 成立」：一個需要最深平台整合、需要瀏覽器做不到的功能、卻不必上架的兩平台產品，仍然會被判成跨平台框架。修規則要修順序，不是照著眼前的資料補洞。',
      },
    ],
    variants: [{
      title: '另一組產品',
      fixed: { html: routeHtml(ORDER_VARIANT) },
      steps: routeChecks(ORDER_VARIANT),
    }],
  },
  {
    id: 'mob07-ex-choose', title: '把規則表寫成函式，並說出理由',
    statement: 'index.html 與 style.css 不能改。index.html 定義了 `REASONS`（四條規則各自的理由，鍵是 `deep`、`appOne`、`appMany`、`web`）與五個產品，並把每個產品的 `needs` 交給 script.js 的 `chooseRoute(needs)`，用回傳的物件畫出「路線：理由」。請完成 `chooseRoute`，讓它回傳一個有 `route` 與 `reason` 兩個成員的物件：（1）`needs.deepPlatform` 是 `true`：`route` 是 `\'native\'`，`reason` 是 `REASONS.deep`；（2）`needs.store` 或 `needs.beyondBrowser` 是 `true`，而且 `needs.platforms` 是 1：`\'native\'` 與 `REASONS.appOne`；（3）`needs.store` 或 `needs.beyondBrowser` 是 `true`：`\'cross-platform\'` 與 `REASONS.appMany`；（4）其餘：`\'pwa\'` 與 `REASONS.web`。由上往下，第一條符合的就是答案：兩條都符合時，路線與理由都用前面那一條的。`needs.platforms` 只會是 1 或 2。檢查還會在另一個頁面上執行，那裡的產品與理由的文字都不同，所以理由要從 `REASONS` 取，不能自己打字。',
    hints: [
      '四條規則就是四個 `return`，由上往下寫：前三條各用一個 `if`，最後一條不需要條件。每個 `return` 回傳的是物件，例如 `{ route: \'pwa\', reason: REASONS.web }`。',
      '第 2、3 條都用到「`store` 或 `beyondBrowser`」：先算出來放進一個變數，`const needsApp = needs.store || needs.beyondBrowser;`，兩條規則就都讀得懂。',
      '第 2 條要兩個條件同時成立：`if (needsApp && needs.platforms === 1)`。只寫 `needs.platforms === 1` 的話，不需要 App 的單一平台產品也會被判成原生。',
    ],
    explanation: '參考解答照規則表的順序寫了三個 `if` 與一個最後的 `return`。第 1 條放最前面，所以同時符合第 1 條與後面規則的產品（例如「潮汐小工具」）拿到的是第 1 條的路線與理由。`needsApp` 把「`store` 或 `beyondBrowser`」這個意思取了名字：這兩種需求的來源不同，結論卻一樣，都是「網站做不到，需要 App」。第 2 條多看一件事：只有一個平台時，寫一份原生程式碼就夠，跨平台框架的「一份程式碼」沒有換到任何好處。四條都不符合才是 PWA：沒有需求把產品推向 App 時，維持成本最低、觸及最廣的路線。理由從 `REASONS` 取，所以函式回傳的不只是答案，還有「因為哪一個需求」：這正是說明取捨時要講的第一句話。',
    viewport: PHONE,
    fixed: { html: routeHtml(PRODUCTS, REASONS), css: TABLE_CSS },
    starter: { js: verdictJs("  return { route: 'pwa', reason: REASONS.web };") },
    solution: {
      js: verdictJs(
        "  if (needs.deepPlatform) return { route: 'native', reason: REASONS.deep };",
        '  const needsApp = needs.store || needs.beyondBrowser;',
        "  if (needsApp && needs.platforms === 1) return { route: 'native', reason: REASONS.appOne };",
        "  if (needsApp) return { route: 'cross-platform', reason: REASONS.appMany };",
        "  return { route: 'pwa', reason: REASONS.web };",
      ),
    },
    steps: [
      { check: 'count', selector: '#result tr', count: 5, label: '表格有五列：每個產品一列（`chooseRoute` 每次都回傳了物件）' },
      ...verdictChecks(PRODUCTS, REASONS, PRODUCT_NOTES),
    ],
    mistakes: [
      {
        files: {
          js: verdictJs(
            "  if (needs.deepPlatform) return { route: 'native', reason: REASONS.deep };",
            "  if (needs.platforms === 1) return { route: 'native', reason: REASONS.appOne };",
            "  if (needs.store || needs.beyondBrowser) return { route: 'cross-platform', reason: REASONS.appMany };",
            "  return { route: 'pwa', reason: REASONS.web };",
          ),
        },
        why: '第 2 條只看了平台數，漏掉「需要 App」這個前提：「島嶼圖書館借閱」只有一個平台，但沒有任何需求非 App 不可，卻被判成原生 App。平台數決定的是「需要 App 時選原生還是跨平台」，它本身不會把產品推向 App。',
      },
      {
        files: {
          js: verdictJs(
            "  if (needs.deepPlatform) return { route: 'native', reason: REASONS.deep };",
            '  const needsApp = needs.store && needs.beyondBrowser;',
            "  if (needsApp && needs.platforms === 1) return { route: 'native', reason: REASONS.appOne };",
            "  if (needsApp) return { route: 'cross-platform', reason: REASONS.appMany };",
            "  return { route: 'pwa', reason: REASONS.web };",
          ),
        },
        why: '把「或」寫成了 `&&`：要兩項需求同時成立才算需要 App。「外送員接單」只有瀏覽器做不到的功能、「島嶼健走」只有上架的要求，兩個都被判成 PWA。這兩項需求只要有一項成立，網站就不夠用了，要用 `||`。',
      },
      {
        files: {
          js: verdictJs(
            "  if (needs.deepPlatform) return 'native';",
            '  const needsApp = needs.store || needs.beyondBrowser;',
            "  if (needsApp && needs.platforms === 1) return 'native';",
            "  if (needsApp) return 'cross-platform';",
            "  return 'pwa';",
          ),
        },
        why: '規則的順序都對，但回傳的是字串，不是 `{ route, reason }` 物件：頁面讀不到 `route` 與 `reason`，每一列都顯示 undefined。只回傳路線，別人就看不到這個決定是因為哪一個需求。',
      },
    ],
    variants: [{
      title: '另一組產品，理由的文字也不同',
      fixed: { html: routeHtml(VERDICT_VARIANT, VARIANT_REASONS) },
      steps: verdictChecks(VERDICT_VARIANT, VARIANT_REASONS),
    }],
  },
  {
    id: 'mob07-ex-share', title: '分享按鈕：有就用，沒有就給連結',
    statement: 'index.html 與 style.css 不能改。index.html 的指令稿定義了兩個物件：`page`（這一頁的 `title` 與 `url`）與 `device`（代替 `navigator` 的替身裝置，所以結果和你用哪一個瀏覽器無關）。這一頁的 `device` 沒有 `share`，現在的 script.js 卻直接呼叫它：按下「分享這道菜」只會在主控台留下一則錯誤。請修改 `#share` 的點擊監聽器：（1）`device` 有 `share` 時，呼叫 `device.share`，交給它一個物件，其中 `title` 與 `url` 兩個成員的值來自 `page`；這時備用的欄位不要顯示。（2）`device` 沒有 `share` 時，讓 `#fallback` 顯示出來（它在 HTML 裡有 `hidden` 屬性），並把 `page.url` 放進欄位 `#link` 的值。（3）兩種情況都要等使用者按了按鈕才做。檢查用點擊按鈕來進行，還會換兩個頁面再執行：一個頁面的 `device` 有 `share`（假的，會把收到的標題與網址寫進 `#log`），另一個頁面是別道菜、沒有 `share`。',
    hints: [
      '呼叫之前先偵測：`\'share\' in device` 在 `device` 有 `share` 這個成員時是 `true`。用 `if … else` 把監聽器分成兩條路。',
      '`else` 裡做兩件事：`fallback.hidden = false;` 讓備用的區塊顯示出來，`link.value = page.url;` 把網址放進欄位。',
      '`if` 裡維持原本的那一行：`device.share({ title: page.title, url: page.url });`。注意它只收一個物件，不是兩個字串。',
    ],
    explanation: '原本的程式假設每一支裝置都有 `share`。在沒有的裝置上，`device.share` 是 `undefined`，把它當函式呼叫會丟出錯誤，按鈕就壞了。參考解答先用 `\'share\' in device` 做功能偵測：有，就把標題與網址放進一個物件交給它，這是加強；沒有，就走退路，顯示一個填好網址的唯讀欄位，使用者仍然可以把這道菜傳給朋友。兩條路都寫在點擊的監聽器裡，所以頁面載入時什麼都不會發生；真正的 `navigator.share` 也只允許在使用者操作之後呼叫。把 `device` 換成 `navigator`，這段程式就能放進真實的網站。',
    viewport: PHONE,
    fixed: { html: shareHtml('海鮮粥', 'https://food.example/dish/12', false), css: SHARE_CSS },
    starter: { js: shareJs('  device.share({ title: page.title, url: page.url });') },
    solution: {
      js: shareJs(
        "  if ('share' in device) {",
        '    device.share({ title: page.title, url: page.url });',
        '  } else {',
        '    fallback.hidden = false;',
        '    link.value = page.url;',
        '  }',
      ),
    },
    steps: [
      { check: 'box', selector: '#link', measure: 'height', value: 0, label: '還沒按按鈕之前，備用的連結欄位 `#link` 沒有顯示' },
      { do: 'click', selector: '#share' },
      { check: 'box', selector: '#link', measure: 'height', value: 44, label: '這一頁的裝置沒有 `share`：按下「分享這道菜」後，`#link` 顯示出來（高 44px）' },
      { check: 'value', selector: '#link', value: 'https://food.example/dish/12', label: '`#link` 的值是這一頁的網址' },
    ],
    mistakes: [
      {
        files: { js: shareJs('  fallback.hidden = false;', '  link.value = page.url;') },
        why: '乾脆不偵測，一律顯示連結欄位。這一頁看起來沒問題，但有分享功能的裝置也只拿到退路：系統的分享面板可以直接傳到使用者常用的 App，這個加強就白白放棄了。漸進增強是「有就用、沒有才退」，不是一律用最基本的做法。',
      },
      {
        files: {
          js: shareJs(
            "  if ('share' in device) {",
            '    device.share(page.title, page.url);',
            '  } else {',
            '    fallback.hidden = false;',
            '    link.value = page.url;',
            '  }',
          ),
        },
        why: '偵測寫對了，呼叫卻傳了兩個字串。`share` 只收一個物件，標題與網址是它的 `title` 與 `url` 兩個成員；傳字串進去，對方讀不到這兩個成員，分享出去的內容是 undefined。',
      },
      {
        files: {
          js: shareJs(
            "  if ('share' in device) {",
            '    device.share({ title: page.title, url: page.url });',
            '  } else {',
            '    fallback.hidden = false;',
            '  }',
          ),
        },
        why: '退路只做了一半：欄位顯示出來了，裡面卻是空的，使用者沒有東西可以複製。退路也要能完成原本的任務，這裡是把這一頁的網址交到使用者手上。',
      },
    ],
    variants: [
      {
        title: '有分享功能的裝置',
        fixed: { html: shareHtml('炒米粉', 'https://food.example/dish/7', true) },
        steps: [
          { check: 'text', selector: '#log', text: '', label: '還沒按之前，沒有呼叫 `device.share`' },
          { do: 'click', selector: '#share' },
          { check: 'text', selector: '#log', text: '已交給系統分享：炒米粉（https://food.example/dish/7）', label: '按下之後，`device.share` 收到這一頁的標題與網址' },
          { check: 'box', selector: '#link', measure: 'height', value: 0, label: '備用的欄位沒有顯示' },
        ],
      },
      {
        title: '另一道菜，裝置沒有分享功能',
        fixed: { html: shareHtml('鮮魚湯', 'https://food.example/dish/30', false) },
        steps: [
          { do: 'click', selector: '#share' },
          { check: 'box', selector: '#link', measure: 'height', value: 44, label: '`#link` 顯示出來' },
          { check: 'value', selector: '#link', value: 'https://food.example/dish/30', label: '`#link` 的值是這個頁面的網址' },
        ],
      },
    ],
  },
  {
    id: 'mob07-ex-stages', title: '分階段的決定：第一版與之後',
    statement: 'index.html 與 style.css 不能改。index.html 已經有這一課的規則表 `chooseRoute(needs)`（回傳 `\'pwa\'`、`\'cross-platform\'` 或 `\'native\'`）與 `LABELS`（把這三個值換成「PWA」「跨平台框架」「原生 App」）。每個產品有兩份需求：`now` 是第一版的，`later` 是之後確定要做的。請完成 script.js 的 `plan(product)`，回傳一句話：兩份需求算出來的路線相同時，回傳「兩個階段都是：」加上路線的名稱，例如「兩個階段都是：PWA」；不同時，回傳「第一版：」加上第一版路線的名稱，再加「；之後：」與之後路線的名稱，例如「第一版：PWA；之後：跨平台框架」。標點都是全形，名稱要用 `LABELS` 裡的寫法。要比的是算出來的路線，不是需求本身：需求變了，路線不一定跟著變。檢查還會換一組產品再執行一次。',
    hints: [
      '規則表已經寫好了，不必重寫：`chooseRoute(product.now)` 是第一版的路線，`chooseRoute(product.later)` 是之後的路線。先把兩個結果各放進一個變數。',
      '用 `===` 比較這兩個字串。相同就回傳「兩個階段都是：」接上 `LABELS[第一版的路線]`。',
      '不同時回傳 `第一版：${LABELS[first]}；之後：${LABELS[later]}` 這樣的樣板字串（`first`、`later` 是你存兩個路線的變數）。',
    ],
    explanation: '路線不是一次定終身：需求變了，就把新的需求再交給同一張規則表。參考解答對 `now` 與 `later` 各呼叫一次 `chooseRoute`，再比較兩個結果。「小島外送」第一版沒有任何需求非 App 不可，所以先走 PWA；之後多了一項瀏覽器做不到的必要功能，才改走跨平台框架，這就是「先 PWA，之後再做 App」的混合結果。「外送員接單」之後多了上架的要求，兩份需求不一樣，但它本來就已經需要 App、只有一個平台，兩次算出來都是原生 App：所以要比的是路線，不是需求物件。把這句話說給別人聽的時候，再補上兩件事就完整了：每個階段的代價，以及是哪一個需求讓路線改變。',
    viewport: PHONE,
    fixed: { html: stagedHtml(STAGED), css: TABLE_CSS },
    starter: { js: planJs('  return LABELS[chooseRoute(product.now)];') },
    solution: {
      js: planJs(
        '  const first = chooseRoute(product.now);',
        '  const later = chooseRoute(product.later);',
        '  if (first === later) return `兩個階段都是：${LABELS[first]}`;',
        '  return `第一版：${LABELS[first]}；之後：${LABELS[later]}`;',
      ),
    },
    steps: [
      { check: 'count', selector: '#result tr', count: 4, label: '表格有四列：每個產品一列（`plan` 沒有丟出錯誤）' },
      ...planChecks(STAGED, STAGED_NOTES),
    ],
    mistakes: [
      {
        files: { js: planJs('  const first = chooseRoute(product.now);', '  return `兩個階段都是：${LABELS[first]}`;') },
        why: '只看了第一版的需求，就當成永遠的答案。「小島外送」之後確定要做一項瀏覽器做不到的功能，計畫裡卻看不出路線會變：到時候才發現要多一份 App 的預算與人力，就太晚了。',
      },
      {
        files: {
          js: planJs(
            '  const first = chooseRoute(product.now);',
            '  const later = chooseRoute(product.later);',
            '  if (product.now === product.later) return `兩個階段都是：${LABELS[first]}`;',
            '  return `第一版：${LABELS[first]}；之後：${LABELS[later]}`;',
          ),
        },
        why: '比較的是兩個需求物件，不是算出來的路線。`now` 與 `later` 是兩個不同的物件，用 `===` 比一定不相等，所以連兩份需求完全相同的「島嶼圖書館借閱」也顯示成「第一版：PWA；之後：PWA」。要比的是 `chooseRoute` 回傳的兩個字串。',
      },
    ],
    variants: [{
      title: '另一組產品',
      fixed: { html: stagedHtml(STAGED_VARIANT) },
      steps: planChecks(STAGED_VARIANT),
    }],
  },
];

// ---- the lesson -------------------------------------------------------------------------------------------------
export const MOB07: LessonContent = {
  lessonId: 'MOB07',
  motivation: '「我們要不要做一個 App？」是每個行動產品遲早要回答的問題。這一課把原生 App、跨平台框架與 PWA 三條路線的能力與成本攤開來比較，再用一張從需求出發的規則表做決定。學完後你能為一個產品選出路線、說出它的取捨，並用功能偵測讓同一份程式在有與沒有某項功能的裝置上都能用。',
  sections: [
    {
      id: 'mob07-routes-section', title: '三條路線：原生 App、跨平台框架與 PWA',
      blocks: [
        { type: 'p', text: '這座島到目前為止，小島外送一直是一個網站：使用者在手機的瀏覽器裡打開網址，就能點餐。生意變好之後，老闆問了一個每個行動產品遲早都會遇到的問題：「我們是不是該做一個 App？」這個問題沒有到處都適用的答案，但有三條常見的技術路線可以選，各有各的能力與成本。這一課先把三條路線說清楚，再教你從需求推出選擇。' },
        { type: 'p', text: '第一條是原生 App（native app）：用平台自己的語言與介面工具寫成的應用程式。手機主要有 Android 與 iOS 兩個平台，Android 的原生 App 常用 Kotlin 寫，iOS 的常用 Swift 寫。兩邊的語言、介面元件與開發工具都不同，所以每個平台要各寫一份、各自維護。換來的是：平台開放給 App 的裝置功能都能直接使用，介面用的也是平台自己的元件。原生 App 通常透過應用程式商店（app store）發布：開發者把 App 送到商店，使用者從商店安裝與更新。' },
        { type: 'p', text: '第二條是跨平台框架（cross-platform framework）：只寫一份程式碼，由框架產出好幾個平台的 App。做法大致有兩種：讓各平台的 App 帶著同一個執行環境（runtime）去執行這份程式碼，或是把它編譯成各平台的程式。React Native 與 Flutter 都是這一類框架的例子。框架已經包好的功能可以直接用；還沒包好的，就要另外用平台的語言寫一小段原生模組（native module）接上去。產出的仍然是 App，所以同樣透過商店發布。' },
        { type: 'p', text: '第三條是 PWA（Progressive Web App，漸進式網頁應用程式）：一個可以安裝的網站。它還是用 HTML、CSS 與 JavaScript 寫的，有網址，用瀏覽器就能打開；再加上兩樣東西：一份描述名稱與圖示的 manifest 檔，讓它可以被安裝到手機的主畫面；一支叫 service worker 的指令稿，讓它在沒有網路時也打得開。這兩樣分別是「PWA 基礎：Manifest 與安裝」與「Service Worker 與離線」的主題，這一課只需要知道它們的用途。PWA 不必經過商店；它能使用的裝置功能，以瀏覽器開放給網頁的為限，而安裝的方式、通知與背景執行這幾件事，各平台的做法不同，也會隨時間改變。' },
        { type: 'p', text: '三條路線最直接的差別，是要維護幾份程式碼。下面的頁面替小島外送算了一下。' },
        { type: 'example', id: 'mob07-codebases' },
        { type: 'p', text: '兩個平台都勾選時，原生 App 是 2 份，跨平台框架與 PWA 都是 1 份。取消勾選其中一個平台：原生 App 變成 1 份，和另外兩條路線一樣多。記住這個觀察，後面的規則表會用到：只支援一個平台的時候，「一份程式碼」就不再是跨平台框架的優勢。表格沒說的還有兩件事：跨平台框架的那 1 份之外，可能還有幾段原生模組要維護；PWA 的那 1 份就是網站本身，如果產品本來就需要網站，走另外兩條路線時，網站那一份還要另外算。' },
        { type: 'callout', tone: 'note', title: '這一課比較的是路線，不是產品', text: '每一條路線底下都還有許多框架與工具可以選，它們改版得很快，誰比較好的答案也一直在變。這一課只談三條路線本身的性質：幾份程式碼、怎麼發布、能用哪些功能。這些性質變得慢，足夠用來做第一個決定；選定路線之後，才輪到比較那條路線上的工具。' },
      ],
    },
    {
      id: 'mob07-compare-section', title: '比較：每一條路線的能力與成本',
      blocks: [
        { type: 'p', text: '把三條路線放在同一張表裡，從七個面向比較。每一格寫的都是路線本身帶來的性質，不是某個產品或某個版本的狀況。' },
        { type: 'table', head: ['面向', '原生 App', '跨平台框架', 'PWA'], rows: [
          ['觸及與發布', '透過應用程式商店，每個平台各自上架；使用者通常要先安裝才能用', '同樣透過商店；一份程式碼可以產出多個平台的 App', '一個網址，有瀏覽器的裝置都能打開；不必安裝就能用，也可以安裝到主畫面'],
          ['裝置功能', '平台開放給 App 的功能都能用，新功能通常最先在這裡用得到', '常用的功能框架已經包好；其餘要寫原生模組，或等框架支援', '以瀏覽器開放的功能為限；同一項功能在不同平台、不同瀏覽器的支援程度可能不同'],
          ['高負載繪圖的效能', '最直接：沒有中間層，可以直接使用平台的繪圖功能', '一般的介面多半足夠；特別吃效能的部分要實測，必要時改寫成原生模組', '一般的介面與動畫足夠；長時間的高負載繪圖要在目標裝置上實測'],
          ['離線', 'App 安裝在裝置上，沒有網路也打得開；哪些資料離線可用由 App 自己決定', '和原生 App 相同', '要靠 service worker 事先把檔案存在裝置上才能離線開啟：做了才有'],
          ['更新', '新版送到商店、通過審核，使用者的裝置再更新；不同使用者可能停在不同版本', '同樣是商店裡的 App，走商店的流程', '部署到伺服器就是發布，使用者下次載入就取得新版'],
          ['成本與團隊技能', '每個平台一份程式碼，各需要熟悉那個平台的人；平台越多，成本越高', '一份主要的程式碼；要學框架，遇到原生模組時仍然需要懂平台的人', '一份程式碼，用的是已經會的網頁技術；已經有網站的團隊，起步成本最低'],
          ['被找到與連結', '在商店裡被搜尋與推薦；要從連結直接開到 App 裡的某個畫面，得另外設定', '和原生 App 相同', '每個畫面都可以有自己的網址，能被搜尋引擎找到、能直接貼給別人；預設不在商店裡'],
        ] },
        { type: 'p', text: '讀這張表有兩個重點。第一，沒有哪一欄每一列都贏：原生 App 的能力最完整，成本也最高；PWA 的觸及最廣、成本最低，能力卻以瀏覽器為限；跨平台框架介於兩者之間，多了一層框架要學、要等。這就是取捨（trade-off）：選一條路線，就是同時選了它的好處與代價。第二，最容易被低估的是「更新」那一列。下面的頁面模擬同一件小事：修正一個錯字之後，新版要走幾步才會到使用者手上。' },
        { type: 'example', id: 'mob07-updates' },
        { type: 'p', text: '先按「部署新版」，再按「使用者重新載入」：使用者看到的就是第 2 版，一共兩步。再看 App：按「送出新版」後，商店顯示第 2 版審核中，這時就算按「使用者的裝置更新」，裝置上仍然是第 1 版；要等「審核通過」，裝置再更新一次，才會變成第 2 版。審核要多久、使用者的裝置什麼時候更新，都不是開發者能決定的，所以同一個時間點，不同使用者手上可能是不同版本的 App，伺服器得同時應付新舊版本。網站也不是完全沒有這個問題：把檔案存在裝置上以便離線使用之後，使用者可能暫時看到舊版，這要到「Service Worker 與離線」那一課處理。' },
        { type: 'callout', tone: 'warning', title: '只看一列就下結論', text: '初學者常常只看表格的一列就決定：「原生的效能最好，所以做原生」「PWA 最便宜，所以做 PWA」。但每個產品在乎的列不一樣：一個每天從聊天訊息裡的連結被打開的點餐頁，最要緊的是「觸及與發布」與「更新」；一個必須連接特殊硬體的工具，最要緊的是「裝置功能」。先決定哪幾列對這個產品重要，再看那幾列誰合適；下一節把這件事整理成固定的步驟。' },
      ],
    },
    {
      id: 'mob07-decide-section', title: '取捨：從需求出發，不從技術出發',
      blocks: [
        { type: 'p', text: '比較可靠的順序是先把需求問清楚，再看哪一條路線接得住。至少問這五個問題：' },
        { type: 'list', items: [
          '有沒有非有不可的裝置功能？它在目標裝置的瀏覽器裡能不能用？（下一節談怎麼查證）',
          '離線要做到什麼程度：完全不需要、沒有網路時要能看已經載入過的內容，還是要能離線完成整件事？',
          '使用者怎麼來？是點連結、搜尋、掃 QR code 進來，還是習慣到商店找 App？',
          '預算與團隊：有多少人、會哪些技術、要支援幾個平台？',
          '多常更新？每天都在改的內容，和一年改兩次的工具，對「更新」那一列的要求不同。',
        ] },
        { type: 'p', text: '有一個合理的預設可以當起點：網站優先，需求逼你的時候才往 App 走。理由在比較表裡：網站的觸及最廣、起步成本最低，而且日後要加做 App 時，網站與伺服器都還用得上。它只是預設，不是定律：有些產品一開始就有非 App 不可的需求。' },
        { type: 'p', text: '為了把「需求逼你」說清楚，這一課把決定寫成一個函式 `chooseRoute(needs)`。`needs` 是一個物件，記錄四個問清楚之後的答案：' },
        { type: 'list', items: [
          '`platforms`：App 要支援幾個手機平台，1 或 2。',
          '`store`：必須在應用程式商店上架，例如合約這樣要求，或使用者只會到商店找它。',
          '`beyondBrowser`：有一項非有不可的功能，目標裝置的瀏覽器沒有提供。這一格要查證過才能填 `true`。',
          '`deepPlatform`：需要最深的平台整合，例如平台一推出新功能就要用上、要做成和系統緊密結合的元件，或效能必須壓到極限。',
        ] },
        { type: 'p', text: '規則由上往下檢查，第一條符合的就是答案：' },
        { type: 'table', head: ['順序', '條件', '回傳的路線', '理由'], rows: [
          ['1', '`deepPlatform` 是 `true`', '`native`：原生 App', '需要最深的平台整合：原生最完整，也最早用得到平台的功能'],
          ['2', '`store` 或 `beyondBrowser` 是 `true`，而且 `platforms` 是 1', '`native`：原生 App', '需要 App，只有一個平台：寫一份原生程式碼就夠，不必多學一層框架'],
          ['3', '`store` 或 `beyondBrowser` 是 `true`（`platforms` 是 2）', '`cross-platform`：跨平台框架', '需要 App，要支援多個平台：一份程式碼產出各平台的 App'],
          ['4', '以上都不符合', '`pwa`：PWA', '沒有需求非 App 不可：網站優先'],
        ] },
        { type: 'callout', tone: 'note', title: '這是這門課的規則，不是業界標準', text: '這張表是這門課為了把先後順序講清楚而定的一組合理規則。真實的決定還要把預算、時程與團隊會什麼算進去：例如團隊全是網頁工程師、預算只夠一份程式碼時，即使第 3 條成立，也可能先推出網站、暫時不做那項功能。關於上架也要補一句：有些商店接受把網站包裝成 App 上架，但規定各家不同，也會改變；這門課採保守的做法，需要上架就走本來就產出 App 的兩條路線。規則表的用處，是讓你說得出「因為哪一個需求，所以選這條路線」。' },
        { type: 'p', text: '下面的頁面把五個虛構的產品交給 `chooseRoute`。產品的需求寫在 index.html 的 `products` 裡，script.js 只有那個函式。' },
        { type: 'example', id: 'mob07-helper' },
        { type: 'p', text: '對照 `products` 一列一列看。「小島外送點餐」的使用者從連結進來，四個條件都不成立，是 PWA。「外送員接單」是公司配發同一款手機給外送員用的，要連接車上的出單機，團隊查證後確認那款手機的瀏覽器做不到：需要 App、只有一個平台，符合第 2 條，是原生 App。「島嶼健走」的合約寫明兩個平台的商店都要上架，符合第 3 條，是跨平台框架。「潮汐小工具」要做成顯示在手機桌面上的小工具，和系統緊密結合；它同時也要上架兩個平台，第 3 條也成立，但第 1 條在前面，所以是原生 App。「島嶼圖書館借閱」只打算支援館內配發的同一款平板，可是沒有任何需求非 App 不可，仍然是 PWA：平台數只在需要 App 的時候才有影響。' },
        { type: 'callout', tone: 'tip', title: '動手試：改一個需求', text: '按「動手改這個範例」，把「島嶼健走」的 `platforms` 改成 1 再執行：它的路線從跨平台框架變成原生 App。再把「小島外送點餐」的 `beyondBrowser` 改成 `true`：它從 PWA 變成跨平台框架。改的只是一個需求，函式一個字都沒動。' },
        { type: 'callout', tone: 'warning', title: '先選好技術，再回頭找理由', text: '決定路線時最常見的錯誤，是答案比問題先出現：「團隊剛學了某個框架，所以這個案子用它」「別家都有 App，所以我們也要」「聽說 PWA 是趨勢」。這些都不是這個產品的需求。檢查的方法很簡單：把理由說出來，看它是不是比較表裡某一列對這個產品的要求。如果說不出是哪一個需求把產品推向 App，預設就還是網站。' },
      ],
    },
    {
      id: 'mob07-limits-section', title: 'PWA 的限制：各平台不同，而且會變',
      blocks: [
        { type: 'p', text: '規則表裡最難填的一格是 `beyondBrowser`。PWA 能用的裝置功能，就是使用者那支裝置上的瀏覽器開放給網頁的功能。這句話有三個後果。第一，支援的程度依平台與瀏覽器而不同：同一項功能，在一個平台的瀏覽器裡能用，在另一個平台上可能不能用，或是行為有差別。第二，它依版本而不同，而且會變：瀏覽器持續加入新功能，偶爾也會收回或加上限制，去年的結論今年不一定成立。第三，有些功能還有附帶條件：要用 HTTPS、要使用者同意，在某些平台上還要先把網站安裝到主畫面。' },
        { type: 'p', text: '所以這一課不列「哪個平台不支援什麼」的清單：那種清單寫完的那一天就開始過期。該記住的是哪些功能特別需要查證，以及怎麼查證。' },
        { type: 'table', head: ['需要查證的功能', '為什麼不能直接假設'], rows: [
          ['推播通知（push notification）', '要使用者同意；各平台開放給網站的條件不同'],
          ['背景同步這一類的背景工作', '網站不在畫面上時還能做多少事，各瀏覽器的規定不同，不是每一個都提供'],
          ['安裝提示', '瀏覽器什麼時候、用什麼方式讓使用者安裝網站，各家不同（下一課會談安裝條件）'],
          ['和硬體相關的功能，例如藍牙、NFC', '只有部分瀏覽器提供'],
          ['長期存在裝置上的資料', '瀏覽器在某些情況下會清掉網站存的資料，規則各家不同'],
        ] },
        { type: 'p', text: '查證有固定的步驟：' },
        { type: 'list', ordered: true, items: [
          '列出產品非有不可的功能，一項一項查，不要只查印象中「應該可以」的那幾項。',
          '查最新的相容性表（compatibility table）：開發者文件裡，每一項功能的頁面通常附有一張表，列出各瀏覽器是否支援、有哪些限制。看的時候留意資料更新的時間。',
          '在真機上測試：每一個目標平台至少一支，在瀏覽器裡開一次，安裝到主畫面之後再開一次。模擬器與桌機瀏覽器的結果不能代替真機，「行動裝置測試：模擬器與真機」那一課會談。',
          '記下查證的時間與結果；每次要對客戶承諾新功能之前，重新查一次。',
          '替查不到、或各平台結果不一致的功能準備退路：下一節的功能偵測。',
        ] },
        { type: 'callout', tone: 'warning', title: '在自己的手機上可以，就答應了客戶', text: '最常見的事故是：開發者在自己的手機上試過，某項功能可以用，就寫進了合約；上線後才發現另一個平台的使用者用不了。在答應任何一項「做成 PWA 也可以」的功能之前，先完成上面的第 2 步與第 3 步。查證的結果如果是「有一個目標平台做不到，而這項功能非有不可」，那就是規則表裡的 `beyondBrowser: true`；如果這項功能只是加分，就交給下一節的做法。' },
      ],
    },
    {
      id: 'mob07-detect-section', title: '功能偵測：有就加強，沒有也能用',
      blocks: [
        { type: 'p', text: '決定走網站或 PWA 之後，就要接受一件事：同一份程式會在功能不一樣的瀏覽器裡執行。配合這個決定的工程習慣叫功能偵測（feature detection）：要用一項功能之前，先問這個瀏覽器有沒有它。以分享為例。Web Share API 讓網頁打開系統的分享面板，寫法是 `navigator.share({ title, url })`。它不是每個瀏覽器都有，所以真實的程式會先用 `if (\'share\' in navigator)` 檢查 `navigator` 物件上有沒有 `share` 這個成員，有才呼叫；沒有就走另一條路，例如顯示一個可以複製的連結。' },
        { type: 'p', text: '這就是「響應式原則與行動優先」那一課的漸進增強（progressive enhancement）用在裝置功能上：先有一個到處都能用的基礎（看得到、可以複製的連結），功能存在時再加強（系統的分享面板）。沒有那項功能的使用者拿到的不是壞掉的按鈕，而是另一種完成同一件事的方法。' },
        { type: 'p', text: '這一課的範例與練習不直接讀 `navigator`：那樣的話，結果會隨你現在用的瀏覽器而不同。頁面改用一個叫 `device` 的替身物件，由寫好的指令稿決定它有沒有 `share`；有的那一個是假的，只把收到的資料寫在頁面上，不會真的打開分享面板。寫真實的網站時，把 `device` 換成 `navigator`，就是同一段程式。' },
        { type: 'example', id: 'mob07-share' },
        { type: 'p', text: '兩個區塊用的是同一個函式 `setUpShare`。按裝置甲的「分享」：`\'share\' in device` 成立，程式呼叫 `device.share`，把標題與網址放在一個物件裡交給它，備用的欄位沒有出現。按裝置乙的「分享」：`deviceB` 是空的物件，條件不成立，走 `else`：拿掉 `hidden`，把網址填進唯讀的欄位，使用者可以選取之後複製。注意兩件事。第一，`share` 是在按鈕的點擊監聽器裡呼叫的：真正的 `navigator.share` 只能在使用者剛做了操作（例如點擊）的時候呼叫，頁面一載入就呼叫會被拒絕。第二，真正的 `navigator.share` 回傳 Promise；使用者把分享面板關掉、沒有分享時，這個 Promise 會被拒絕，所以正式的程式還要接住這個結果，而且不要把它當成錯誤顯示給使用者。' },
        { type: 'callout', tone: 'warning', title: '用瀏覽器的名字猜功能', text: '另一種常見的寫法是讀 `navigator.userAgent` 這個字串，看裡面有沒有某個瀏覽器或作業系統的名字，再推論「所以有（或沒有）這項功能」。這種推論很快就過期：瀏覽器會改版，同一個名字底下有新有舊，還有你沒聽過的瀏覽器。直接問功能本身在不在，答案才會一直是對的。同樣要避免的是：偵測到沒有，就把按鈕藏起來、什麼都不給。使用者想做的事（把這一頁傳給朋友）並沒有消失，退路要能完成同一件事。' },
        { type: 'callout', tone: 'note', title: '偵測到有，不代表一定成功', text: '功能存在只表示可以呼叫。使用者可能不同意、可能中途取消，裝置當下也可能做不到。所以每一項加強都要想好失敗時畫面上顯示什麼，就像「行動情境與限制」那一課處理連線失敗一樣。另外，功能偵測只適用於「加分」的功能：非有不可的功能沒有退路可言，那是上一節查證、規則表決定的事。' },
      ],
    },
    {
      id: 'mob07-hybrid-section', title: '混合的結果：決定會隨需求改變',
      blocks: [
        { type: 'p', text: '路線不是一次定終身，三條路線也不互斥。實際的產品常常落在混合的結果：' },
        { type: 'list', items: [
          '先 PWA，之後再做 App：第一版的需求瀏覽器都做得到，就先用成本最低的路線上線；等到出現非 App 不可的需求，再依規則表選原生或跨平台。網站與伺服器都還用得上。',
          '網站加上一個小的 App：大部分使用者從連結進來用網站；只有少數需要特殊裝置功能的角色（例如外送員）使用 App。',
          'App 為主，仍然保留網站：需要被搜尋到、被連結分享的內容放在網站上，再把想深入使用的人帶到 App。',
        ] },
        { type: 'p', text: '用規則表的話來說：`needs` 變了，就重新算一次 `chooseRoute`。下面的頁面讓你直接改需求，看路線與代價怎麼跟著變。' },
        { type: 'example', id: 'mob07-needs' },
        { type: 'p', text: '一開始四個條件都不成立，路線是 PWA。勾選「有必要功能是瀏覽器沒有提供的」：路線變成跨平台框架；再把平台數改成 1：變成原生 App。這時取消勾選那一項：路線回到 PWA，可見平台數本身不會把產品推向 App，推它的是需求。每一條路線的下方都寫著它的代價：說明一個決定的時候，好處與代價要一起講。' },
        { type: 'p', text: '把決定說給別人聽，可以用三句話：選哪一條路線、是因為哪一個需求；代價是什麼；什麼情況出現時要重新評估。例如：「小島外送先做 PWA，因為使用者從連結進來，目前沒有瀏覽器做不到的必要功能；代價是預設不在商店裡，能用的裝置功能以瀏覽器為限；之後如果確定要做瀏覽器沒有提供的功能，就重新評估。」說得出這三句話，才算做了決定，而不是挑了一個喜歡的技術。' },
        { type: 'p', text: '下一課「PWA 基礎：Manifest 與安裝」開始動手走 PWA 這條路線的第一步：讓網站可以被安裝到手機的主畫面。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob07-q1', prompt: '關於三條技術路線，哪一個敘述是正確的？',
      options: [
        '跨平台框架產出的是網站，所以不必經過應用程式商店',
        'PWA 要用各平台自己的語言重寫一次，才能安裝到主畫面',
        '原生 App 每個平台各寫一份；跨平台框架用一份程式碼產出多個平台的 App；PWA 是可以安裝的網站',
        '原生 App 與 PWA 都只能從應用程式商店安裝',
      ],
      answer: 2,
      explanation: '原生 App 用平台自己的語言與介面工具寫，所以每個平台各一份；跨平台框架的重點是一份程式碼產出多個平台的 App；PWA 仍然是用網頁技術寫的網站，加上 manifest 之後可以安裝。跨平台框架產出的是各平台的 App，同樣透過商店發布，不是不必上架的網站；PWA 不需要用平台的語言重寫；PWA 也不必經過商店，從瀏覽器就能安裝到主畫面。',
    },
    {
      id: 'mob07-q2', prompt: '「島嶼市集」是一個二手交易平台。需求訪談的結果：買家多半從聊天訊息裡的商品連結或搜尋進來；商品每天上架，頁面也常常調整；需要的功能是瀏覽、下單與上傳照片，團隊查證後確認目標裝置的瀏覽器都做得到；沒有上架商店的要求；團隊是三位網頁工程師。第一版最合適的路線是哪一個？',
      options: [
        'PWA：沒有需求非 App 不可，使用者從連結進來，團隊用已經會的技術就能做，更新只要部署',
        '原生 App：兩個平台各寫一份，能力最完整',
        '跨平台框架：一份程式碼就能上架兩個平台的商店',
        '先只做一個平台的原生 App，另一個平台的使用者之後再說',
      ],
      answer: 0,
      explanation: '四個條件都不成立（不必上架、沒有瀏覽器做不到的必要功能、不需要最深的平台整合），依規則表是 PWA；比較表也支持它：使用者從連結與搜尋進來，內容每天在變，團隊會的就是網頁技術。原生 App 的成本最高，而且每個點連結進來的買家都得先安裝，卻沒有任何需求要求它。跨平台框架解決的是「需要 App 又要多個平台」，這裡並不需要 App，只是多了框架要學、多了商店的流程。只做一個平台的原生 App 更糟：放棄了一部分使用者，沒有換到任何需要的能力。',
    },
    {
      id: 'mob07-q3', prompt: '依這一課的規則表（由上往下，第一條符合的就是答案），下面的呼叫回傳什麼？',
      code: { language: 'JavaScript', text: 'chooseRoute({\n  platforms: 2,\n  store: true,\n  beyondBrowser: false,\n  deepPlatform: true,\n});' },
      options: [
        '`\'cross-platform\'`：`store` 是 `true`，而且有兩個平台',
        '`\'pwa\'`：`beyondBrowser` 是 `false`，表示瀏覽器都做得到',
        '`\'cross-platform\'`：兩條規則都符合時，取成本比較低的那一條',
        '`\'native\'`：`deepPlatform` 是第 1 條規則，先符合的先決定',
      ],
      answer: 3,
      explanation: '`deepPlatform` 是 `true`，第 1 條規則就符合了，函式在那裡回傳 `\'native\'`，後面的規則不會再被檢查。`store` 是 `true`、有兩個平台，的確也符合第 3 條，但它排在後面；規則表沒有「取成本比較低」這回事，先後順序就是優先順序。`beyondBrowser` 是 `false` 只表示沒有瀏覽器做不到的必要功能，另外兩項需求（上架、最深的平台整合）仍然把產品推向 App，所以不會是 `\'pwa\'`。',
    },
    {
      id: 'mob07-q4', prompt: '客戶問：「如果做成 PWA，使用者收得到推播通知嗎？」哪一個回應最恰當？',
      options: [
        '「可以。PWA 能做到的事和 App 一樣。」',
        '「這需要查證。我會查最新的相容性表，並在每一個目標平台的真機上測試，包含安裝到主畫面之後的情況，再答覆您。」',
        '「不行。網站不可能發通知，要通知就一定得做原生 App。」',
        '「我的手機上試過可以，所以沒有問題。」',
      ],
      answer: 1,
      explanation: 'PWA 能用的功能取決於使用者裝置上的瀏覽器：各平台開放的條件不同，也會隨版本改變，所以負責的回答是先查最新的相容性表、再到每個目標平台的真機上測試，然後才承諾。「和 App 一樣」與「網站不可能」都是不查證就下的結論，一個答應得太多，一個放棄得太早。只在自己的手機上試過，說明的只有那一個平台、那一個版本，另一個平台的使用者可能完全不同。',
    },
    {
      id: 'mob07-q5', prompt: '分享按鈕的點擊監聽器要做到：有 Web Share API 的瀏覽器打開系統的分享面板，沒有的瀏覽器顯示可以複製的連結（`showLink()`）。哪一種寫法符合功能偵測與漸進增強？',
      options: [
        '`if (navigator.userAgent.includes(\'Mobile\')) { navigator.share(data); } else { showLink(); }`',
        '`if (\'share\' in navigator) { navigator.share(data); } else { showLink(); }`',
        '直接寫 `navigator.share(data);`，不支援的瀏覽器會自己略過這一行',
        '`if (\'share\' in navigator) { navigator.share(data); }`，沒有這項功能時什麼都不做',
      ],
      answer: 1,
      explanation: '`\'share\' in navigator` 直接問這項功能在不在：在就加強，不在就走退路，兩種使用者都能把頁面傳出去。讀 `userAgent` 是用名字猜功能：字串裡有沒有 Mobile，和這個瀏覽器有沒有 `share` 是兩回事，猜錯時不是丟出錯誤，就是錯過可以用的功能。不偵測就直接呼叫，在沒有 `share` 的瀏覽器裡會丟出錯誤，JavaScript 不會自己略過。只偵測、沒有 `else` 的寫法不會出錯，但沒有這項功能的使用者按了按鈕毫無反應，少了漸進增強要求的基礎。',
    },
    {
      id: 'mob07-q6', prompt: '小島外送的菜單有一個價格標錯了，工程師修好之後要發布。關於新版怎麼到使用者手上，哪一個說法正確？',
      options: [
        '不論哪一條路線，修正都要先通過商店的審核，使用者才看得到',
        '原生 App 送出新版的那一刻，所有使用者的裝置就同時換成新版',
        'PWA 安裝到主畫面之後就和網站無關了，要更新得請使用者重新安裝',
        '網站或 PWA 部署到伺服器之後，使用者下次載入就取得新版；商店裡的 App 要送出、通過審核，再等使用者的裝置更新',
      ],
      answer: 3,
      explanation: '網站與 PWA 的發布就是部署：檔案放上伺服器，使用者下次載入時取得（有把檔案存在裝置上的話，還要處理更新，那是之後的課）。商店裡的 App 多了兩段不由開發者決定的等待：審核，以及使用者裝置的更新，所以同一時間會有不同版本並存。網站不經過商店，不需要審核；送出新版不等於使用者已經更新；安裝到主畫面的 PWA 開的仍然是那個網站，不需要為了更新而重新安裝。',
    },
    {
      id: 'mob07-q7', prompt: '「港口巡檢」是給碼頭巡檢員用的工具。需求：公司統一配發同一款手機，只需要支援這一個平台；巡檢時一定要連接一台手持的檢測儀器，團隊查過相容性表，也在那款手機上實測，確認它的瀏覽器做不到；沒有上架商店的要求，也不需要和系統做更深的整合。依這一課的規則表，最合適的路線與理由是哪一個？',
      options: [
        '原生 App：有瀏覽器做不到的必要功能，所以需要 App；只有一個平台，寫一份原生程式碼就夠',
        'PWA：只有一個平台，用成本最低的路線就夠了',
        '跨平台框架：只要需要 App，一份程式碼產出多個平台一定比較划算',
        'PWA：先上線再說，連接儀器的部分用功能偵測處理',
      ],
      answer: 0,
      explanation: '`beyondBrowser` 是 `true`、`platforms` 是 1，符合第 2 條規則：需要 App，而且只有一個平台，原生 App 一份程式碼就夠。跨平台框架的好處是一份程式碼供多個平台使用，這裡只有一個平台，多學一層框架沒有換到東西，那項功能多半還是得寫原生模組。兩個 PWA 的選項都忽略了「非有不可」：平台數少不會讓瀏覽器多出那項功能；功能偵測的退路只適用於加分的功能，連接儀器是這個工具存在的目的，沒有退路可言。',
    },
    {
      id: 'mob07-q8', prompt: '「海景民宿訂房」第一版的需求，團隊查證後瀏覽器都做得到；預算只夠維護一份程式碼。老闆提到：明年也許會想加一項目前瀏覽器沒有提供的功能，但還沒決定。哪一個做法最合理？',
      options: [
        '現在就做兩個平台的原生 App，免得明年要重做',
        '現在就改用跨平台框架，因為那項功能遲早會需要',
        '先做 PWA，並把「確定要做那項功能」寫成重新評估的條件，到時候再依當時的需求決定',
        '先做 PWA，並向老闆保證那項功能到時候瀏覽器一定會支援',
      ],
      answer: 2,
      explanation: '第一版沒有任何需求非 App 不可，預算也只夠一份程式碼，所以先走 PWA；還沒決定的功能不是需求，把它寫成「什麼情況出現時重新評估」，就是分階段的決定。現在就做兩個平台的原生 App，是替一個不確定的需求付出最高的成本，而且超出預算。現在就用跨平台框架同樣是提早付代價：要學框架、走商店的流程，而那項功能可能根本不做。向老闆保證瀏覽器將來會支援，是沒有人能負責的承諾：支援與否要到時候查證。',
    },
  ],
  webCode: { examples, exercises },
};
