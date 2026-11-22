import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB06 safe areas, orientation and the dynamic viewport height (MOB-2). viewport-fit=cover lets the page reach the
 * screen's edges; env(safe-area-inset-*) are the distances it must then keep clear; max(16px, inset) on a bottom
 * bar's own padding; the content's padding follows the bar's height; landscape is a height problem (orientation says
 * shape only, so the query also asks for the height) and moves the insets to the sides; dvh/svh/lvh for a shell that is
 * as tall as what is visible.
 *
 * How the claims are checked. A desktop frame has no notch: measured in Chromium (a probe test, removed), every
 * env(safe-area-inset-*) computes to 0px in the check frame, a custom property holding env(…, 0px) computes to 0px,
 * max(16px, var(--safe-bottom)) to 16px, and an inline `--safe-bottom: 34px` on <html> overrides the :root rule (34px;
 * calc(16px + …) gives 50px). So every page reads the insets through custom properties on :root, and a stand-in for
 * the device sets them: in the preview a script (script.js, "模擬裝置") adds a toggle button that writes example
 * values on <html> and draws the unsafe bands; in the checks a variant's fixed HTML carries the same values in the
 * style attribute of <html> (in the first exercise the learner edits the HTML, so the variant replaces the fixed
 * script with one that presses the toggle at load). The text says once, in the first section, that this is a teaching
 * device and that the numbers are examples, not any device's. 100dvh, 100svh and 100lvh all equal the frame's height
 * (measured: 640, then 360 and 500 after resize); a toolbar appearing is a resize to a lower height.
 */

type Insets = { top: number; right: number; bottom: number; left: number };
/** script.js of the pages with a stand-in device: a toggle that writes example insets on <html> and draws them. */
const deviceJs = (name: string, d: Insets) => `// 模擬裝置：預覽不是手機，由這份指令稿扮演「${name}」。
// 真的手機上不需要它：--safe-* 的值來自瀏覽器的 env()。
const device = { top: '${d.top}px', right: '${d.right}px', bottom: '${d.bottom}px', left: '${d.left}px' };
const root = document.documentElement;

// 半透明的邊框：畫出螢幕上不安全的範圍
const unsafe = document.createElement('div');
unsafe.id = 'unsafe';
unsafe.style.cssText = 'position: fixed; inset: 0; z-index: 8; pointer-events: none; border: 0 solid rgba(0, 0, 0, 0.45);';

const toggle = document.createElement('button');
toggle.id = 'simulate';
toggle.type = 'button';
toggle.textContent = '模擬：${name}';
toggle.setAttribute('aria-pressed', 'false');
toggle.style.cssText = 'position: fixed; left: 50%; top: 45%; z-index: 9; transform: translateX(-50%); min-height: 44px;';
document.body.append(unsafe, toggle);

toggle.addEventListener('click', () => {
  const on = toggle.getAttribute('aria-pressed') !== 'true';
  toggle.setAttribute('aria-pressed', String(on));
  for (const side in device) {
    if (on) root.style.setProperty('--safe-' + side, device[side]);
    else root.style.removeProperty('--safe-' + side);
  }
  unsafe.style.borderWidth = on ? Object.values(device).join(' ') : '0';
});
`;
const PORTRAIT_PHONE = deviceJs('有手勢列的手機', { top: 0, right: 0, bottom: 34, left: 0 });
const LANDSCAPE_PHONE = deviceJs('橫放、瀏海在左邊的手機', { top: 0, right: 0, bottom: 21, left: 44 });

/** A whole document of 小島外送; `fit` adds viewport-fit=cover, `rootStyle` is the stand-in device of a variant. */
const page = (title: string, body: string, fit = true, rootStyle = '') => `<!DOCTYPE html>
<html lang="zh-Hant"${rootStyle ? ` style="${rootStyle}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1${fit ? ', viewport-fit=cover' : ''}">
<title>${title}｜小島外送</title>
</head>
<body>
${body}
</body>
</html>`;

const CART_BODY = String.raw`<header id="top">
  <h1>購物車</h1>
</header>
<main>
  <ul id="items">
    <li>海鹽薯條 × 1</li>
    <li>椒麻雞飯 × 1</li>
    <li>冬瓜檸檬 × 2</li>
  </ul>
</main>
<div id="bar">
  <button type="button" id="pay">送出訂單</button>
</div>`;

const ORDER_LINES = ['海鹽薯條 × 1', '椒麻雞飯 × 1', '冬瓜檸檬 × 2', '炸魚薄餅 × 1', '海鮮粥 × 1', '滷肉飯 × 2', '燙青菜 × 1', '紫菜蛋花湯 × 1', '芒果冰 × 1', '外送費'];
const CHECKOUT_BODY = `<header id="top">
  <h1>確認訂單</h1>
</header>
<main>
  <ul id="items">
${ORDER_LINES.map(line => `    <li>${line}</li>`).join('\n')}
  </ul>
  <p id="total">合計 860 元</p>
</main>
<div id="bar">
  <button type="button" id="pay">送出訂單</button>
</div>`;

const PAGE_CSS = String.raw`body { margin: 0; min-height: 480px; font-family: sans-serif; }
#top h1 {
  margin: 0;
  padding: 0 16px;
  font-size: 20px;
  line-height: 48px;
  background-color: #e3f2fd;
}
#items { margin: 0; padding: 0 16px; list-style: none; }
#items li { line-height: 48px; border-bottom: 1px solid #cfd8dc; }
`;
const PAY_CSS = String.raw`#pay { display: block; width: 100%; height: 48px; font: inherit; }
`;
const barCss = (padding: string, extra = '') => String.raw`#bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
` + padding + extra + String.raw`  background-color: #ffffff;
  box-shadow: 0 -1px 0 #b0bec5;
}
`;

// ---- examples ---------------------------------------------------------------------------------------------------
const edgeToEdge: WebExample = {
  id: 'mob06-edge-to-edge', title: '延伸到螢幕邊緣的頁面，還沒有處理安全區域',
  description: '小島外送的購物車。index.html 的 viewport 設定有 `viewport-fit=cover`；「送出訂單」在貼著視窗下緣的操作列 `#bar` 裡，操作列的內距是固定的 8px。頁面中間的「模擬」按鈕不是頁面的一部分，它由 script.js 加上，扮演一支有手勢列的手機：按下去，螢幕最下面 34px（例子的值）會被塗成半透明的深色。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  files: {
    html: page('購物車', CART_BODY),
    css: PAGE_CSS + String.raw`
/* 操作列：貼著視窗的下緣，內距固定 8px */
` + barCss('  padding: 8px 16px;\n') + PAY_CSS,
    js: PORTRAIT_PHONE,
  },
  observe: [
    { check: 'attr', selector: 'meta[name="viewport"]', name: 'content', value: 'viewport-fit=cover', match: 'includes', label: 'viewport 設定裡有 `viewport-fit=cover`：頁面要求延伸到螢幕的邊緣' },
    { check: 'box', selector: '#bar', measure: 'bottom', value: 640, from: ':viewport', label: '視窗高 640px：操作列的下緣就是視窗的下緣' },
    { do: 'click', selector: '#simulate' },
    { check: 'style', selector: '#unsafe', property: 'border-bottom-width', value: '34px', label: '按下「模擬」：螢幕最下面 34px 被標成手勢列的範圍' },
    { check: 'style', selector: '#bar', property: 'padding-bottom', value: '8px', label: '操作列的下方內距仍然是 8px：這個頁面沒有做任何避讓' },
    { check: 'box', selector: '#pay', measure: 'bottom', value: 632, from: ':viewport', label: '「送出訂單」的下緣離螢幕下緣只有 8px：按鈕的下半部落在那 34px 裡' },
  ],
};

const SAFE_ROOT_ALL = String.raw`/* 向瀏覽器要安全區域的四個距離；沒有這個變數時用後備值 0px */
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
}
`;

const envValues: WebExample = {
  id: 'mob06-env', title: '用 env() 讀出安全區域，收進自訂屬性',
  description: '和上一個範例同一個購物車，style.css 多了兩件事：開頭的 `:root` 規則把四個 `env()` 各收進一個自訂屬性；操作列的下方內距改成 `calc(8px + var(--safe-bottom))`，也就是原本的 8px 再加上下方的安全區域。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  files: {
    html: page('購物車', CART_BODY),
    css: SAFE_ROOT_ALL + PAGE_CSS + String.raw`
/* 下方內距：原本的 8px，再加上下方的安全區域 */
` + barCss('  padding: 8px 16px;\n', '  padding-bottom: calc(8px + var(--safe-bottom));\n') + PAY_CSS,
    js: PORTRAIT_PHONE,
  },
  observe: [
    { check: 'style', selector: 'html', property: '--safe-bottom', value: '0px', label: '預覽不是手機：`env(safe-area-inset-bottom, 0px)` 得到 0px，`--safe-bottom` 就是 0px' },
    { check: 'style', selector: '#bar', property: 'padding-bottom', value: '8px', label: '所以操作列的下方內距是 8 + 0 = 8px' },
    { do: 'click', selector: '#simulate' },
    { check: 'style', selector: 'html', property: '--safe-bottom', value: '34px', label: '按下「模擬」：`<html>` 的行內樣式把 `--safe-bottom` 換成 34px，蓋過 `:root` 規則' },
    { check: 'style', selector: '#bar', property: 'padding-bottom', value: '42px', label: '同一條宣告，下方內距變成 8 + 34 = 42px' },
    { check: 'box', selector: '#pay', measure: 'bottom', value: 598, from: ':viewport', label: '「送出訂單」的下緣在螢幕下緣上方 42px：整顆按鈕離開了 34px 的手勢列' },
  ],
};

const BAR_BOTTOM_ROOT = String.raw`:root {
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  /* 操作列下方要留的距離：平常 16px，安全區域比較大時改用它 */
  --bar-bottom: max(16px, var(--safe-bottom));
}
`;
const TOTAL_CSS = String.raw`#total { margin: 0; padding: 0 16px; line-height: 48px; font-weight: bold; }
`;

const bottomBar: WebExample = {
  id: 'mob06-bottom-bar', title: '底部操作列：max() 寫在內距上，內容讓出操作列的高度',
  description: '小島外送的確認訂單頁，內容比一個畫面長。操作列的上方內距是 12px、按鈕高 48px，下方內距是 `max(16px, var(--safe-bottom))`，這個值另外收在 `--bar-bottom` 裡；`<main>` 的下方內距用同一個值算出操作列的高度。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  files: {
    html: page('確認訂單', CHECKOUT_BODY),
    css: BAR_BOTTOM_ROOT + PAGE_CSS + TOTAL_CSS + String.raw`
/* 內容的最後讓出操作列的高度：上方內距 12 + 按鈕 48 + 下方的距離 */
main { padding-bottom: calc(60px + var(--bar-bottom)); }
` + barCss('  padding: 12px 16px var(--bar-bottom);\n') + PAY_CSS,
    js: PORTRAIT_PHONE,
  },
  observe: [
    { check: 'style', selector: '#bar', property: 'padding-bottom', value: '16px', label: '沒有安全區域時：`max(16px, 0px)` 是 16px，按鈕下方仍然有留白' },
    { do: 'click', selector: '#simulate' },
    { check: 'style', selector: '#bar', property: 'padding-bottom', value: '34px', label: '按下「模擬」：`max(16px, 34px)` 是 34px' },
    { check: 'box', selector: '#pay', measure: 'bottom', value: 606, from: ':viewport', label: '「送出訂單」的下緣在螢幕下緣上方 34px：剛好在手勢列的範圍之上' },
    { check: 'box', selector: '#pay', measure: 'height', value: 48, label: '按鈕仍然是 48px 高：變高的是操作列，按鈕沒有被擠壓' },
    { do: 'scroll', selector: ':page', top: 9999 },
    { check: 'box', selector: '#total', measure: 'bottom', value: 0, from: '#bar', label: '捲到最底：「合計」的下緣剛好接在操作列的上緣，沒有被蓋住' },
  ],
};

const STATUS_BODY = String.raw`<header id="top">
  <h1 id="title">訂單狀態</h1>
</header>
<main>
  <p>店家已接單</p>
  <p>餐點製作中</p>
  <p>外送員已取餐</p>
  <p>大約 12 分鐘後送達</p>
  <p>外送員：阿海</p>
  <p>付款方式：貨到付款</p>
  <p>餐點：海鹽薯條 × 1</p>
  <p>餐點：椒麻雞飯 × 1</p>
  <p>餐點：冬瓜檸檬 × 2</p>
</main>
<div id="bar">
  <button type="button" id="pay">聯絡外送員</button>
</div>`;

const landscape: WebExample = {
  id: 'mob06-landscape', title: '橫放的手機：頁首變矮、操作列不再黏住、左右避開瀏海',
  description: '小島外送的訂單狀態頁。直向時頁首 `#top` 高 72px 並黏在上方，操作列 `#bar` 黏在下方。最後一段媒體查詢處理「橫向而且高度不超過 480px」的視窗。`#top`、`<main>` 與 `#bar` 的左右內距都是 `max(16px, …)` 配上那一側的安全區域。「模擬」按鈕扮演一支橫放、瀏海在左邊的手機（例子的值：左 44px、下 21px）。預覽的高度固定在大約 400px。',
  viewport: { width: 360, height: 640 },
  widths: [360, 640],
  height: 400,
  files: {
    html: page('訂單狀態', STATUS_BODY),
    css: String.raw`:root {
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
}
body { margin: 0; font-family: sans-serif; }
/* 左右：平常 16px；那一側的安全區域比較大時改用它 */
#top, main, #bar {
  padding-left: max(16px, var(--safe-left));
  padding-right: max(16px, var(--safe-right));
}
#top {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  height: 72px;
  background-color: #e3f2fd;
}
#title { margin: 0; font-size: 20px; }
main p { margin: 0; line-height: 48px; border-bottom: 1px solid #cfd8dc; }
#bar {
  position: sticky;
  bottom: 0;
  padding-top: 12px;
  padding-bottom: max(16px, var(--safe-bottom));
  background-color: #ffffff;
}
` + PAY_CSS + String.raw`
/* 橫放的手機：高度只剩三百多 px，頁首變矮，操作列回到內容的最後 */
@media (orientation: landscape) and (max-height: 480px) {
  #top { height: 44px; }
  #bar { position: static; }
}`,
    js: LANDSCAPE_PHONE,
  },
  observe: [
    { check: 'box', selector: '#top', measure: 'height', value: 72, label: '直向（360 × 640）：頁首高 72px' },
    { do: 'resize', width: 640, height: 360 },
    { check: 'box', selector: '#top', measure: 'height', value: 44, label: '橫向而且高度只有 360px（640 × 360）：頁首變成 44px 高' },
    { check: 'style', selector: '#bar', property: 'position', value: 'static', label: '操作列的 `position` 變成 `static`：不再黏在視窗下緣' },
    { do: 'click', selector: '#simulate' },
    { check: 'style', selector: 'main', property: 'padding-left', value: '44px', label: '按下「模擬」（瀏海在左邊）：`<main>` 的左內距是 `max(16px, 44px)`，也就是 44px' },
    { check: 'style', selector: 'main', property: 'padding-right', value: '16px', label: '右邊沒有瀏海，右內距仍然是 16px' },
  ],
};

const SHELL_BODY = (lines: string[]) => `<div id="app">
  <header id="top">
    <h1>確認訂單</h1>
  </header>
  <main id="items">
${lines.map(line => `    <p>${line}</p>`).join('\n')}
  </main>
  <footer id="foot">
    <button type="button" id="pay">送出訂單</button>
  </footer>
</div>`;
const SHELL_PARTS_CSS = String.raw`#top { height: 56px; background-color: #e3f2fd; }
#top h1 { margin: 0; padding: 0 16px; font-size: 20px; line-height: 56px; }
#items p { margin: 0; line-height: 48px; border-bottom: 1px solid #cfd8dc; }
#foot {
  box-sizing: border-box;
  height: 64px;
  padding: 8px 16px;
  background-color: #ffffff;
  box-shadow: 0 -1px 0 #b0bec5;
}
` + PAY_CSS;

const dvhShell: WebExample = {
  id: 'mob06-dvh-shell', title: '和看得到的視窗一樣高的版面：頁首、會捲動的中間、頁尾',
  description: '確認訂單頁做成 App 常見的版面：`#app` 是三列的 grid，高度是 `100dvh`；頁首與頁尾永遠在畫面上，中間的清單 `#items` 放不下的部分在自己裡面捲動。預覽的高度固定在大約 480px。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  height: 480,
  files: {
    html: SHELL_BODY(ORDER_LINES.concat(['合計 860 元'])),
    css: String.raw`body { margin: 0; font-family: sans-serif; }
/* 三列：頁首、佔滿剩下高度的中間、頁尾；整體和看得到的視窗一樣高 */
#app {
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100dvh;
}
/* 中間放不下的內容，在自己裡面捲動 */
#items { padding: 0 16px; overflow-y: auto; }
` + SHELL_PARTS_CSS,
  },
  observe: [
    { check: 'box', selector: '#app', measure: 'height', value: 640, label: '視窗高 640px：`100dvh` 是 640px，`#app` 剛好一個視窗高' },
    { check: 'box', selector: '#foot', measure: 'bottom', value: 640, from: ':viewport', label: '頁尾的下緣貼著視窗的下緣' },
    { check: 'style', selector: '#items', property: 'overflow-y', value: 'auto', label: '中間的清單 `overflow-y` 是 `auto`：放不下的部分在自己裡面捲動' },
    { do: 'resize', width: 360, height: 500 },
    { check: 'box', selector: '#app', measure: 'height', value: 500, label: '視窗變成 500px 高（代表瀏覽器的工具列出現）：`#app` 跟著變成 500px' },
    { check: 'box', selector: '#foot', measure: 'bottom', value: 500, from: ':viewport', label: '頁尾的下緣仍然貼著視窗的下緣，「送出訂單」沒有被擠到畫面外' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const SAFE_BOTTOM_ROOT = String.raw`/* 下方的安全區域（這一條請保留）：預覽裡是 0px */
:root { --safe-bottom: env(safe-area-inset-bottom, 0px); }
`;
const safeBarCss = (bar: string) => SAFE_BOTTOM_ROOT + PAGE_CSS + String.raw`
/* 操作列：上方內距 12px，按鈕高 48px */
` + bar + PAY_CSS;

const exSafeBar: WebExercise = {
  id: 'mob06-ex-safe-bar', title: '讓頁面延伸到邊緣，並讓操作列避開手勢列',
  statement: 'script.js 不能改：它是「模擬裝置」，在頁面中間加上一顆「模擬」按鈕，按下去會把 `<html>` 的 `--safe-bottom` 換成 34px（例子的值），並把螢幕最下面 34px 塗成深色。小島外送的購物車要做兩件事。index.html：在 viewport 設定裡加上 `viewport-fit=cover`，原本的 `width=device-width, initial-scale=1` 要保留。style.css：操作列 `#bar` 要繼續貼著視窗的下緣，它的下方內距平常是 16px；下方的安全區域比 16px 大的時候，改用安全區域的大小，讓「送出訂單」`#pay` 完全離開手勢列。安全區域請用 style.css 開頭已經準備好的 `var(--safe-bottom)` 讀取，不要直接寫 `env()`：檢查做兩次，第一次是沒有安全區域的螢幕（`--safe-bottom` 是 0px），第二次一開始就按下「模擬」（34px）。兩次都在 360 × 640 的視窗裡量 `#pay` 的下緣、`#bar` 的下緣與 `#pay` 的高度；在預覽裡按「模擬」可以先看到第二次的情形。',
  hints: [
    'viewport 設定是 `<meta name="viewport">` 的 `content`，用逗號隔開每一項：在原本的兩項後面再加一項。',
    '「平常 16px，安全區域比較大時改用它」就是兩個值取比較大的那一個：`max()`。',
    '把 `#bar` 的 `padding: 12px 16px 16px;` 改成 `padding: 12px 16px max(16px, var(--safe-bottom));`，或另外加一行 `padding-bottom: max(16px, var(--safe-bottom));`。',
  ],
  explanation: '`viewport-fit=cover` 讓頁面延伸到螢幕的邊緣；從這一刻起，避開手勢列是頁面自己的事。`max(16px, var(--safe-bottom))` 取兩個值裡比較大的：沒有安全區域的螢幕上是 `max(16px, 0px)`，也就是 16px，按鈕下方仍然有留白；有 34px 手勢列的手機上是 34px，按鈕的下緣剛好停在手勢列的上面。它寫在操作列自己的內距上，所以操作列仍然貼著視窗的下緣、背景一路鋪到螢幕邊緣，變高的只有內距，按鈕還是 48px。`--safe-bottom` 的值在真的手機上來自 `:root` 規則裡的 `env(safe-area-inset-bottom, 0px)`；這一題的第二次檢查則由模擬裝置把它換成 34px。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  fixed: { js: PORTRAIT_PHONE },
  starter: { html: page('購物車', CART_BODY, false), css: safeBarCss(barCss('  padding: 12px 16px 16px;\n')) },
  solution: { html: page('購物車', CART_BODY), css: safeBarCss(barCss('  padding: 12px 16px max(16px, var(--safe-bottom));\n')) },
  steps: [
    { check: 'attr', selector: 'meta[name="viewport"]', name: 'content', value: 'viewport-fit=cover', match: 'includes', label: 'viewport 設定裡有 `viewport-fit=cover`' },
    { check: 'attr', selector: 'meta[name="viewport"]', name: 'content', value: 'width=device-width', match: 'includes', label: 'viewport 設定仍然有 `width=device-width`' },
    { check: 'box', selector: '#bar', measure: 'bottom', value: 640, from: ':viewport', label: '操作列 `#bar` 的下緣貼著視窗的下緣' },
    { check: 'box', selector: '#pay', measure: 'bottom', value: 624, from: ':viewport', label: '沒有安全區域的螢幕：`#pay` 的下緣在視窗下緣上方 16px' },
    { check: 'box', selector: '#pay', measure: 'height', value: 48, op: 'min', label: '`#pay` 至少 48px 高' },
  ],
  variants: [{
    title: '模擬有手勢列的手機：下方的安全區域是 34px',
    fixed: { js: PORTRAIT_PHONE + '\n// 這一次檢查：頁面一載入就按下「模擬」\ntoggle.click();\n' },
    steps: [
      { check: 'box', selector: '#bar', measure: 'bottom', value: 640, from: ':viewport', label: '操作列的下緣仍然貼著視窗的下緣' },
      { check: 'box', selector: '#pay', measure: 'bottom', value: 606, from: ':viewport', label: '`#pay` 的下緣在視窗下緣上方 34px' },
      { check: 'box', selector: '#pay', measure: 'height', value: 48, op: 'min', label: '`#pay` 至少 48px 高' },
    ],
  }],
  mistakes: [
    { files: { html: page('購物車', CART_BODY), css: safeBarCss(barCss('  padding: 12px 16px var(--safe-bottom);\n')) }, why: '下方內距只寫 `var(--safe-bottom)`。有手勢列的手機上是 34px，沒有問題；但沒有安全區域的螢幕上它是 0px，「送出訂單」直接貼著螢幕的下緣。安全區域是「至少要讓開多少」，不能取代原本的留白：用 `max(16px, var(--safe-bottom))` 取兩者之中比較大的。' },
    { files: { html: page('購物車', CART_BODY), css: safeBarCss(barCss('  padding: 12px 16px 16px;\n').replace('  bottom: 0;', '  bottom: var(--safe-bottom);')) }, why: '把整條操作列往上移：`bottom: var(--safe-bottom)`。按鈕是讓開了，但操作列不再貼著螢幕的下緣，它下面露出 34px 的空隙，捲動的內容會從那裡透出來。操作列的背景應該一路鋪到螢幕邊緣，讓開的距離要加在它自己的內距上。' },
    { files: { html: page('購物車', CART_BODY), css: safeBarCss(barCss('  padding: 12px 16px max(16px, env(safe-area-inset-bottom));\n')) }, why: '直接寫 `env(safe-area-inset-bottom)`，沒有經過 `--safe-bottom`。在真的手機上，這和參考解答算出來的結果相同；但預覽與檢查裡的 `env()` 永遠是 0，模擬裝置改得到的只有 `--safe-bottom`，所以第二次檢查時下方內距還是 16px。這一課的頁面一律把 `env()` 收在 `:root` 的自訂屬性裡，再用 `var()` 讀取。' },
  ],
};

const STEPS_BODY = String.raw`<header id="top">
  <h1 id="title">訂單狀態</h1>
</header>
<main>
  <ul id="steps">
    <li>店家已接單</li>
    <li>餐點製作中</li>
    <li>外送員已取餐</li>
    <li>大約 12 分鐘後送達</li>
  </ul>
</main>`;
const landscapeCss = (side: (name: 'left' | 'right') => string, media: string) => String.raw`/* 左右兩側的安全區域（這一條請保留）：預覽裡都是 0px */
:root {
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
}
body { margin: 0; min-height: 400px; font-family: sans-serif; }

#top {
  display: flex;
  align-items: center;
  height: 72px;
  padding-left: ` + side('left') + String.raw`;
  padding-right: ` + side('right') + String.raw`;
  background-color: #e3f2fd;
}
#title { flex: 1; margin: 0; font-size: 20px; }
#steps {
  margin: 0;
  padding-left: ` + side('left') + String.raw`;
  padding-right: ` + side('right') + String.raw`;
  list-style: none;
}
#steps li { line-height: 48px; border-bottom: 1px solid #cfd8dc; }
` + media;
const SAFE_SIDE = (name: 'left' | 'right') => `max(16px, var(--safe-${name}))`;
const SHORT_LANDSCAPE = String.raw`
@media (orientation: landscape) and (max-height: 480px) {
  #top { height: 44px; }
}
`;

const exLandscape: WebExercise = {
  id: 'mob06-ex-landscape', title: '橫放的手機：頁首變矮，左右避開瀏海',
  statement: 'index.html 與 script.js 不能改（script.js 是模擬裝置：「模擬」按鈕扮演一支橫放、瀏海在左邊的手機）。小島外送的訂單狀態頁有 72px 高的頁首 `#top` 與清單 `#steps`。請修改 style.css，做兩件事。(1) 視窗是橫向、而且高度不超過 480px 的時候，`#top` 的高度改成 44px；其他情形維持 72px，包括直向的手機，以及橫向但高度很充足的平板或桌機視窗。(2) 不論方向，`#top` 與 `#steps` 的左、右內距平常都是 16px；那一側的安全區域比 16px 大的時候，改用那一側安全區域的大小。安全區域請用開頭準備好的 `var(--safe-left)` 與 `var(--safe-right)` 讀取，不要直接寫 `env()`。檢查先在 360 × 640、640 × 360、1024 × 768 三種視窗量 `#top` 的高度，並在 640 × 360 量標題 `#title` 的左緣與清單各列的右緣；接著換成兩支模擬的橫放手機再檢查一次：一支瀏海在左邊（`--safe-left` 是 44px），一支瀏海在右邊（`--safe-right` 是 44px），44px 是例子的值。預覽大約 400px 高：按 360px 是直向，按 640px 是橫向。',
  hints: [
    '`orientation: landscape` 只說視窗比較寬，沒有說它有多矮：1024 × 768 的視窗也是橫向。條件裡還要問高度，媒體查詢的 `max-height` 和 `max-width` 的用法一樣。',
    '媒體查詢寫成 `@media (orientation: landscape) and (max-height: 480px) { #top { height: 44px; } }`，放在樣式表的最後。',
    '四個內距各改成 `max()`：`padding-left: max(16px, var(--safe-left));`、`padding-right: max(16px, var(--safe-right));`。它們不需要放進媒體查詢：直向時兩側的安全區域是 0，算出來就是 16px。',
  ],
  explanation: '手機橫放之後，問題不在「橫向」這個形狀，而在高度只剩三百多 px：72px 的頁首佔掉五分之一。`(orientation: landscape) and (max-height: 480px)` 同時問形狀與高度，所以 640 × 360 的手機符合，1024 × 768 的平板雖然也是橫向，高度充足，頁首維持 72px；只寫 `(max-height: 480px)` 在這三種視窗的結果相同，也可以通過。左右內距不必依方向分開寫：`max(16px, var(--safe-left))` 在沒有安全區域的那一側是 16px，在瀏海那一側是瀏海的寬度。左用 `--safe-left`、右用 `--safe-right`，各看各的：使用者可能往任何一邊轉，瀏海可能在左邊，也可能在右邊。',
  viewport: { width: 360, height: 640 },
  widths: [360, 640],
  fixed: { html: page('訂單狀態', STEPS_BODY), js: LANDSCAPE_PHONE },
  starter: { css: landscapeCss(() => '16px', '') },
  solution: { css: landscapeCss(SAFE_SIDE, SHORT_LANDSCAPE) },
  steps: [
    { check: 'box', selector: '#top', measure: 'height', value: 72, label: '直向（360 × 640）：頁首 `#top` 維持 72px 高' },
    { do: 'resize', width: 640, height: 360 },
    { check: 'box', selector: '#top', measure: 'height', value: 44, label: '橫向而且高度只有 360px（640 × 360）：`#top` 變成 44px 高' },
    { check: 'box', selector: '#title', measure: 'left', value: 16, from: ':viewport', label: '沒有安全區域：標題 `#title` 的左緣離視窗左緣 16px' },
    { check: 'box', selector: '#steps li', measure: 'right', value: 624, from: ':viewport', label: '沒有安全區域：清單各列的右緣離視窗右緣 16px' },
    { do: 'resize', width: 1024, height: 768 },
    { check: 'box', selector: '#top', measure: 'height', value: 72, label: '橫向但高度有 768px（1024 × 768）：`#top` 回到 72px 高' },
  ],
  variants: [{
    title: '模擬橫放、瀏海在左邊的手機：左側的安全區域是 44px，右側是 0px',
    fixed: { html: page('訂單狀態', STEPS_BODY, true, '--safe-left: 44px; --safe-right: 0px;') },
    steps: [
      { do: 'resize', width: 640, height: 360 },
      { check: 'box', selector: '#top', measure: 'height', value: 44, label: '640 × 360：`#top` 是 44px 高' },
      { check: 'box', selector: '#title', measure: 'left', value: 44, from: ':viewport', label: '標題的左緣讓開 44px 的瀏海' },
      { check: 'box', selector: '#steps li', measure: 'left', value: 44, from: ':viewport', label: '清單各列的左緣讓開 44px 的瀏海' },
      { check: 'box', selector: '#steps li', measure: 'right', value: 624, from: ':viewport', label: '右邊沒有瀏海：清單各列的右緣離視窗右緣 16px' },
    ],
  }, {
    title: '模擬橫放、瀏海在右邊的手機：左側的安全區域是 0px，右側是 44px',
    fixed: { html: page('訂單狀態', STEPS_BODY, true, '--safe-left: 0px; --safe-right: 44px;') },
    steps: [
      { do: 'resize', width: 640, height: 360 },
      { check: 'box', selector: '#title', measure: 'left', value: 16, from: ':viewport', label: '左邊沒有瀏海：標題的左緣離視窗左緣 16px' },
      { check: 'box', selector: '#title', measure: 'right', value: 596, from: ':viewport', label: '標題的右緣讓開 44px 的瀏海' },
      { check: 'box', selector: '#steps li', measure: 'right', value: 596, from: ':viewport', label: '清單各列的右緣讓開 44px 的瀏海' },
    ],
  }],
  mistakes: [
    { files: { css: landscapeCss(SAFE_SIDE, String.raw`
@media (orientation: landscape) {
  #top { height: 44px; }
}
`) }, why: '媒體查詢只寫 `(orientation: landscape)`。`orientation` 只看視窗的形狀：寬大於高就是橫向，所以 1024 × 768 的平板、大多數的桌機視窗也都符合，它們的頁首跟著被縮成 44px，但它們的高度一點也不缺。要處理的是「高度不夠」，就把高度寫進條件：加上 `and (max-height: 480px)`。' },
    { files: { css: landscapeCss(() => 'max(16px, var(--safe-left))', SHORT_LANDSCAPE) }, why: '左、右兩側都用了 `--safe-left`。瀏海在左邊時，右邊也跟著留了 44px，白白少了一截寬度；瀏海在右邊時，`--safe-left` 是 0，右邊只有 16px，內容被瀏海遮住。四個安全區域各自獨立：右側的內距要看 `--safe-right`。' },
    { files: { css: landscapeCss(() => '16px', String.raw`
@media (orientation: landscape) and (max-height: 480px) {
  #top {
    height: 44px;
    padding-left: 44px;
  }
  #steps { padding-left: 44px; }
}
`) }, why: '把 44px 直接寫進橫向的規則裡。沒有瀏海的手機橫放時，左邊平白多了一大塊空白；瀏海在右邊的手機則完全沒有讓開。安全區域的大小與位置由裝置和它被轉向哪一邊決定，不能寫死，要用 `var(--safe-left)`、`var(--safe-right)`（也就是 `env()` 的值）配上 `max()`。' },
  ],
};

const SHELL_LINES = ORDER_LINES.concat(['餐具 × 2', '合計 860 元']);
const shellCss = (app: string, items: string) => String.raw`body { margin: 0; font-family: sans-serif; }

#app {
` + app + String.raw`}
#items {
  padding: 0 16px;
` + items + String.raw`}
` + SHELL_PARTS_CSS;
const SHELL_GRID = String.raw`  display: grid;
  grid-template-rows: auto 1fr auto;
`;

const exShell: WebExercise = {
  id: 'mob06-ex-dvh-shell', title: '全螢幕的結帳版面：和看得到的視窗一樣高，中間捲動',
  // The page is as tall as its viewport, so it reports no height of its own: the preview is given one.
  height: 560,
  statement: 'index.html 不能改。小島外送的確認訂單頁 `#app` 裡有三塊：56px 高的頁首 `#top`、清單 `#items`、64px 高的頁尾 `#foot`（裡面是「送出訂單」）。現在整頁一起捲動，「送出訂單」要捲到最下面才看得到。請修改 style.css：`#app` 的高度要剛好等於目前看得到的視窗高度（請用動態視窗單位 `dvh`）；`#top` 與 `#foot` 的高度不變、永遠留在畫面上；`#items` 佔滿兩者之間剩下的高度，放不下的內容在 `#items` 自己裡面上下捲動。檢查先在 360 × 640 的視窗量 `#app` 與 `#items` 的高度、讀 `#items` 的 `overflow-y`，再把視窗的高度改成 500px（代表手機瀏覽器的工具列出現，看得到的範圍變矮），量 `#app` 的高度、`#foot` 的下緣與 `#items` 的高度。預覽與檢查沒有會收放的工具列，`dvh`、`svh`、`lvh` 和 `vh` 在這裡算出來都一樣，檢查分不出你用的是哪一個：這一題請照題目寫 `dvh`。',
  hints: [
    '`#app` 需要兩件事：一個確定的高度（`100dvh`），和把這個高度分給三塊的排版方式。「CSS Grid 基礎」那一課的 `grid-template-rows` 可以寫成三列：頭、尾照自己的高度，中間拿剩下的。',
    '`#app { display: grid; grid-template-rows: auto 1fr auto; height: 100dvh; }`。只寫到這裡，中間那一列會被很長的內容撐開：`1fr` 的列不會比它的內容矮，除非那個項目自己會捲動。',
    '替 `#items` 加上 `overflow-y: auto;`：它可以比內容矮，放不下的部分在裡面捲動。',
  ],
  explanation: '`height: 100dvh` 讓 `#app` 剛好和目前看得到的視窗一樣高：手機瀏覽器的工具列出現時它變矮，收起時變高，頁尾永遠貼著看得到的範圍的下緣。`grid-template-rows: auto 1fr auto` 把這個高度分成三列：頁首 56px、頁尾 64px 照自己的高度，中間的 `1fr` 拿走剩下的（640px 高的視窗是 520px，500px 高的視窗是 380px）。`#items` 的 `overflow-y: auto` 有兩個作用：超出的內容在它裡面捲動；它也因此可以比自己的內容矮，`1fr` 的列才不會被撐開。用 `display: flex; flex-direction: column` 再讓 `#items` 寫 `flex: 1; min-height: 0; overflow-y: auto` 也可以通過。注意這裡用的是 `height` 而不是 `min-height`：`min-height: 100dvh` 的版面會跟著內容長高，適合整頁一起捲動的頁面，不適合這種頭尾固定的版面。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  fixed: { html: SHELL_BODY(SHELL_LINES) },
  starter: { css: shellCss('', '') },
  solution: { css: shellCss(SHELL_GRID + '  height: 100dvh;\n', '  overflow-y: auto;\n') },
  steps: [
    { check: 'box', selector: '#app', measure: 'height', value: 640, label: '視窗高 640px：`#app` 也是 640px 高' },
    { check: 'box', selector: '#items', measure: 'height', value: 520, label: '`#items` 佔滿頁首與頁尾之間的 520px' },
    { check: 'style', selector: '#items', property: 'overflow-y', value: ['auto', 'scroll'], label: '`#items` 放不下的內容在自己裡面上下捲動' },
    { do: 'resize', width: 360, height: 500 },
    { check: 'box', selector: '#app', measure: 'height', value: 500, label: '視窗變成 500px 高：`#app` 跟著變成 500px 高' },
    { check: 'box', selector: '#foot', measure: 'bottom', value: 500, from: ':viewport', label: '頁尾 `#foot` 的下緣貼著視窗的下緣' },
    { check: 'box', selector: '#items', measure: 'height', value: 380, label: '`#items` 變成 380px 高' },
  ],
  mistakes: [
    { files: { css: shellCss(SHELL_GRID + '  min-height: 100dvh;\n', '  overflow-y: auto;\n') }, why: '寫成 `min-height: 100dvh`。`min-height` 只規定下限：清單比一個畫面長，`#app` 就跟著內容長高，結果還是整頁一起捲動，頁尾要捲到最下面才看得到，`#items` 的 `overflow-y` 也沒有機會作用。頭尾固定、中間捲動的版面需要確定的高度：`height: 100dvh`。' },
    { files: { css: shellCss(SHELL_GRID + '  height: 100dvh;\n', '') }, why: '`#app` 的高度與三列都寫對了，但 `#items` 沒有 `overflow-y: auto`。`1fr` 的列最矮也要容得下它的內容（「CSS Grid 進階：區域與自動排列」那一課的 `minmax(0, 1fr)` 說過同一件事），所以中間那一列被十幾行的清單撐開，頁尾被推到 `#app` 的外面。讓 `#items` 自己會捲動，它才可以比內容矮。' },
    { files: { css: shellCss(SHELL_GRID + '  height: 640px;\n', '  overflow-y: auto;\n') }, why: '把高度寫死成 `640px`。在剛好 640px 高的視窗裡看起來是對的；視窗一變矮（工具列出現、換一支手機、轉成橫放），`#app` 還是 640px，頁尾和「送出訂單」就落在畫面外。高度要跟著看得到的視窗走，用 `100dvh`。' },
  ],
};

const checkoutCss = (main: string, barPadding: string) => SAFE_BOTTOM_ROOT + PAGE_CSS.replace(' min-height: 480px;', '') + TOTAL_CSS + main + String.raw`
/* 操作列：上方內距 12px，按鈕高 48px */
` + barCss(barPadding) + PAY_CSS;
const checkoutVariant = (inset: number): NonNullable<WebExercise['variants']>[number] => ({
  title: `模擬有手勢列的手機：下方的安全區域是 ${inset}px`,
  fixed: { html: page('確認訂單', CHECKOUT_BODY, true, `--safe-bottom: ${inset}px;`) },
  steps: [
    { check: 'box', selector: '#pay', measure: 'bottom', value: 640 - inset, from: ':viewport', label: `\`#pay\` 的下緣在視窗下緣上方 ${inset}px` },
    { do: 'scroll', selector: ':page', top: 9999 },
    { check: 'box', selector: '#total', measure: 'bottom', value: 0, op: 'max', from: '#bar', label: '捲到最底：`#total` 的下緣不低於 `#bar` 的上緣' },
    { check: 'box', selector: '#total', measure: 'bottom', value: -16, op: 'min', from: '#bar', label: '`#total` 和 `#bar` 之間的空白不超過 16px' },
    { check: 'box', selector: '#bar', measure: 'bottom', value: 640, from: ':viewport', label: '`#bar` 的下緣貼著視窗的下緣' },
  ],
});

const exCheckout: WebExercise = {
  id: 'mob06-ex-checkout', title: '綜合：操作列避開手勢列，最後一行也不被操作列蓋住',
  statement: 'index.html 與 script.js 不能改（script.js 是模擬裝置，「模擬」按鈕把 `--safe-bottom` 換成 34px）。小島外送的確認訂單頁已經有 `viewport-fit=cover`。操作列 `#bar` 用固定定位貼在視窗下緣：上方內距 12px、按鈕 `#pay` 高 48px、下方內距 16px。現在有兩個問題：有手勢列的手機上，`#pay` 會落在手勢列裡；而且固定定位的操作列不佔位置，捲到最底時，最後一行「合計」`#total` 被它蓋住。請修改 style.css：(1) `#bar` 的下方內距平常是 16px，下方的安全區域比 16px 大時改用安全區域的大小；(2) 捲到頁面最底的時候，`#total` 整行都要在 `#bar` 的上面，而且兩者之間的空白不超過 16px。注意操作列的高度會跟著安全區域改變，替內容留的位置也要跟著變。安全區域請用開頭準備好的 `var(--safe-bottom)` 讀取，不要直接寫 `env()`。檢查做三次，都在 360 × 640 的視窗：沒有安全區域的螢幕、`--safe-bottom` 是 34px 的手機、`--safe-bottom` 是 48px 的手機（都是例子的值）。每一次都量 `#pay` 的下緣，把頁面捲到最底，再量 `#total` 的下緣和 `#bar` 上緣的距離，以及 `#bar` 的下緣。',
  hints: [
    '第一件事和第一個練習相同：`#bar` 的下方內距改成 `max(16px, var(--safe-bottom))`。接著算操作列有多高：上方內距 12px、按鈕 48px，再加上這個下方內距。',
    '替 `<main>` 加上和操作列一樣高的下方內距：`padding-bottom: calc(60px + max(16px, var(--safe-bottom)));`。`calc()` 裡面可以放 `max()`。',
    '同一個式子寫兩次容易改漏：可以在 `:root` 再加一個自訂屬性 `--bar-bottom: max(16px, var(--safe-bottom));`，操作列寫 `padding: 12px 16px var(--bar-bottom);`，`<main>` 寫 `padding-bottom: calc(60px + var(--bar-bottom));`。',
  ],
  explanation: '操作列的高度是 12px 的上方內距、48px 的按鈕，再加上下方內距 `max(16px, var(--safe-bottom))`：沒有安全區域時是 76px，安全區域 34px 時是 94px，48px 時是 108px。固定定位的元素不佔版面，所以要替內容的最後留出一樣高的位置：`<main>` 的下方內距寫成 `calc(60px + var(--bar-bottom))`，其中 `--bar-bottom` 就是那個 `max()`。兩個地方讀的是同一個自訂屬性，操作列長高多少，內容就多讓多少，捲到最底時「合計」剛好接在操作列的上緣。把 `#bar` 改成「行動情境與限制」那一課的 `position: sticky; bottom: 0` 也可以通過：黏貼定位的操作列留在排版流裡，本來就佔著自己的高度，不必另外替內容留位置；下方內距的 `max()` 仍然要寫。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412, 768],
  fixed: { html: page('確認訂單', CHECKOUT_BODY), js: PORTRAIT_PHONE },
  starter: { css: checkoutCss('', '  padding: 12px 16px 16px;\n') },
  solution: { css: checkoutCss(String.raw`
/* 內容的最後讓出操作列的高度：12 + 48 + 下方內距 */
main { padding-bottom: calc(60px + var(--bar-bottom)); }
`, '  padding: 12px 16px var(--bar-bottom);\n').replace(':root { --safe-bottom: env(safe-area-inset-bottom, 0px); }', String.raw`:root {
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --bar-bottom: max(16px, var(--safe-bottom));
}`) },
  steps: [
    { check: 'box', selector: '#pay', measure: 'bottom', value: 624, from: ':viewport', label: '沒有安全區域的螢幕：`#pay` 的下緣在視窗下緣上方 16px' },
    { do: 'scroll', selector: ':page', top: 9999 },
    { check: 'box', selector: '#total', measure: 'bottom', value: 0, op: 'max', from: '#bar', label: '捲到最底：`#total` 的下緣不低於 `#bar` 的上緣，「合計」沒有被蓋住' },
    { check: 'box', selector: '#total', measure: 'bottom', value: -16, op: 'min', from: '#bar', label: '`#total` 和 `#bar` 之間的空白不超過 16px' },
    { check: 'box', selector: '#bar', measure: 'bottom', value: 640, from: ':viewport', label: '`#bar` 的下緣貼著視窗的下緣' },
    { check: 'box', selector: '#pay', measure: 'height', value: 48, op: 'min', label: '`#pay` 至少 48px 高' },
  ],
  variants: [checkoutVariant(34), checkoutVariant(48)],
  mistakes: [
    { files: { css: checkoutCss(String.raw`
main { padding-bottom: 76px; }
`, '  padding: 12px 16px max(16px, var(--safe-bottom));\n') }, why: '操作列的內距寫對了，內容卻只留了固定的 `76px`。76px 是沒有安全區域時操作列的高度；有 34px 手勢列的手機上，操作列長高成 94px，「合計」的下面 18px 又被蓋住。替內容留的位置要用同一個 `max()` 來算，跟著操作列一起變。' },
    { files: { css: checkoutCss(String.raw`
main { padding-bottom: calc(60px + max(16px, var(--safe-bottom))); }
`, '  padding: 12px 16px 16px;\n') }, why: '只處理了內容，忘了操作列本身：`#bar` 的下方內距還是固定的 16px。捲到最底時「合計」沒有被蓋住，但在有手勢列的手機上，「送出訂單」下面的一截仍然落在手勢列的範圍裡。兩個地方要一起改。' },
    { files: { css: checkoutCss(String.raw`
main { padding-bottom: 100px; }
`, '  padding: 12px 16px max(16px, var(--safe-bottom));\n') }, why: '替內容留一個「應該夠大」的固定數字 `100px`。它在某一支手機上剛好夠用，換一支就不是多出一截空白，就是不夠：沒有安全區域的螢幕上，「合計」和操作列之間空了 24px；安全區域 48px 的手機上，操作列有 108px 高，「合計」又被蓋住 8px。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const MOB06: LessonContent = {
  lessonId: 'MOB06',
  motivation: '手機的螢幕不是一塊完整的矩形：四個角是圓的，上面可能有瀏海，下面有系統的手勢列；瀏覽器的工具列還會在捲動時收起、再出現，把手機轉成橫放，高度更只剩下一半。這一課讓貼在螢幕底部的「送出訂單」在這些情況下都看得到、按得到：用 `env()` 讀出安全區域，用媒體查詢處理橫放，用 `dvh` 與 `svh` 做出和看得到的範圍一樣高的版面。',
  sections: [
    {
      id: 'mob06-safe-area-section', title: '螢幕不是一塊完整的矩形：安全區域',
      blocks: [
        { type: 'p', text: '到上一課為止，我們都把視窗當成一塊完整的矩形：`bottom: 0` 的操作列就貼在螢幕最下面，沒有別的東西會和它搶位置。真的手機沒有這麼單純。螢幕的四個角是圓的；上緣可能有一塊放鏡頭的瀏海（notch）或開孔；下緣常有一條系統畫的手勢列（gesture bar），從那裡往上滑會回到主畫面（「觸控目標與手勢的實作」那一課說過：螢幕的邊緣屬於系統）。畫在這些位置的內容，可能被切掉、被蓋住，或是按不到。' },
        { type: 'p', text: '安全區域（safe area）指的是扣掉這些位置之後，螢幕上保證完整看得到、可以操作的那一塊矩形。瀏覽器預設不讓網頁冒險：頁面只排在安全的矩形裡。常見的結果是手機橫放時，頁面的左右各留下一條空白的邊。這樣很安全，但頁首的底色、底部操作列的背景都到不了螢幕的邊緣。要讓頁面鋪滿整個螢幕，就在「viewport 與相對單位」那一課的 viewport 設定裡多加一項 `viewport-fit=cover`：' },
        { type: 'table', head: ['viewport 設定', '頁面畫在哪裡', '誰負責避開瀏海與手勢列'], rows: [
          ['沒有寫 `viewport-fit`（預設）', '安全的矩形裡', '瀏覽器'],
          ['`width=device-width, initial-scale=1, viewport-fit=cover`', '整個螢幕，包括圓角、瀏海與手勢列所在的位置', '你的 CSS'],
        ] },
        { type: 'p', text: '`viewport-fit=cover` 是一個交換：你得到整個螢幕，同時接下「讓重要的內容與按鈕避開不安全位置」的責任。背景可以、也應該鋪到邊緣；文字與按鈕不行。' },
        { type: 'example', id: 'mob06-edge-to-edge' },
        { type: 'p', text: '預覽一開始是 360px 寬。這一頁加了 `viewport-fit=cover`，但還沒有做任何避讓：操作列的內距是固定的 8px。按一下頁面中間的「模擬：有手勢列的手機」：螢幕最下面 34px 被塗成半透明的深色，那是手勢列佔用的範圍，而「送出訂單」的下半截就在裡面。使用者想按按鈕的下半部時，手指落在系統的地盤上，可能按不到，也可能被當成「回到主畫面」的手勢。再按一次「模擬」可以關掉。' },
        { type: 'callout', tone: 'note', title: '預覽不是手機：這一課怎麼模擬瀏海與手勢列', text: '課程頁的預覽與練習的檢查，都是在你自己的瀏覽器裡開一個框架來顯示頁面。那裡沒有瀏海，也沒有手勢列，瀏覽器回報的安全區域永遠是 0。所以這一課的頁面多了一個教學用的替身：script.js 裡的「模擬裝置」。它在頁面上加一顆「模擬」按鈕，按下去會把例子的距離（例如下方 34px）寫到 `<html>` 元素上，並把不安全的範圍塗成深色；練習的檢查則會在「`<html>` 上已經寫好這些距離」的狀態下再檢查一次。真的手機上沒有這份指令稿：距離由瀏覽器透過下一節的 `env()` 提供。34px、44px 這些數字也只是例子，不是任何一支手機的規格；實際的值由裝置與瀏覽器決定，而且會隨方向與工具列的狀態改變。' },
        { type: 'callout', tone: 'warning', title: '加了 viewport-fit=cover，卻沒有處理安全區域', text: '這是最常見的一種錯：從別的專案複製了含 `viewport-fit=cover` 的 viewport 設定，CSS 卻完全沒有提到安全區域。沒有瀏海的手機與桌機上一切正常，所以不會被發現；到了有瀏海或手勢列的手機，頁首的文字被瀏海擋住、底部的按鈕壓在手勢列上。上面的範例就是這個狀態。加了 `cover`，就要檢查每一個貼著螢幕邊緣的元素。' },
      ],
    },
    {
      id: 'mob06-env-section', title: 'env()：向瀏覽器要安全區域的距離',
      blocks: [
        { type: 'p', text: '頁面要怎麼知道該讓開多少？CSS 的 `env()` 函式用來讀取瀏覽器提供的環境變數（environment variable）。和安全區域有關的有四個，每一個都是一段長度：視窗的那一邊，到安全矩形的那一邊，中間隔了多遠。' },
        { type: 'table', head: ['寫法', '意思', '什麼時候不是 0（例子）'], rows: [
          ['`env(safe-area-inset-top)`', '視窗上緣到安全矩形上緣的距離', '頁面佔滿整個螢幕，上緣有瀏海或狀態列的時候'],
          ['`env(safe-area-inset-right)`', '右緣的距離', '手機橫放，瀏海在右邊'],
          ['`env(safe-area-inset-bottom)`', '下緣的距離', '頁面延伸到手勢列的位置'],
          ['`env(safe-area-inset-left)`', '左緣的距離', '手機橫放，瀏海在左邊'],
        ] },
        { type: 'p', text: '那一邊沒有需要避開的東西時，值是 0；頁面沒有延伸到不安全的位置時，四個值都是 0。`env()` 可以用在任何接受長度的地方，例如 `padding-bottom: env(safe-area-inset-bottom)`，也可以放進 `calc()` 與 `max()` 裡。它可以有第二個參數當後備值：`env(safe-area-inset-bottom, 0px)` 的意思是「瀏覽器沒有提供這個變數時，用 0px」。這些變數的名稱由瀏覽器定義，網頁不能自己新增，也不能改它們的值。' },
        { type: 'p', text: '這一課的頁面不直接在每個地方寫 `env()`，而是先把它收進自訂屬性（custom property）。自訂屬性是名稱以兩個連字號開頭、由你自己命名的屬性，例如 `--safe-bottom: env(safe-area-inset-bottom, 0px);`；它的值會繼承給後代，任何地方都可以用 `var(--safe-bottom)` 讀出來。寫在 `:root`（也就是 `<html>` 元素）上，整個頁面都讀得到。這樣做有兩個好處：長長的 `env(…)` 只寫一次，之後用的是自己取的短名字；而且自訂屬性可以被蓋過去。模擬裝置做的就是這件事：按下「模擬」時，它在 `<html>` 上寫行內樣式 `--safe-bottom: 34px`，行內樣式的優先順序高於樣式表裡的 `:root` 規則（「CSS 選擇器、串接與特異性」那一課），所有用到 `var(--safe-bottom)` 的地方就跟著改變。`env()` 本身則是頁面改不了的。' },
        { type: 'example', id: 'mob06-env' },
        { type: 'p', text: '這是上一節的購物車，style.css 多了開頭的 `:root` 規則，操作列的下方內距改成 `calc(8px + var(--safe-bottom))`。在預覽裡，`env()` 得到的是 0，所以內距是 8 + 0 = 8px，看起來和上一個範例一模一樣。按下「模擬」：`--safe-bottom` 變成 34px，同一條宣告算出 8 + 34 = 42px，操作列長高，「送出訂單」整顆移到深色範圍的上面。script.js 總共只做三件事：建立那顆按鈕、建立一個用半透明邊框畫出不安全範圍的 `<div>`，以及在按下時設定或移除 `<html>` 上的 `--safe-top` 等四個自訂屬性。' },
        { type: 'p', text: '在真的手機上，這四個值不是固定的：把手機轉向、瀏覽器的工具列收起或出現時，它們都可能改變，瀏覽器會自動重新計算用到它們的樣式。所以不要把在某一支手機上看到的數字抄進 CSS，永遠透過 `env()` 讀取。' },
        { type: 'callout', tone: 'tip', title: '動手試：換一支手勢列比較高的手機', text: '按「動手改這個範例」，把 script.js 第三行 `device` 裡的 `bottom: \'34px\'` 改成 `bottom: \'60px\'` 再執行，然後按「模擬」：深色的範圍變成 60px 高，操作列的下方內距跟著變成 68px，按鈕仍然完整地露在上面。style.css 一個字都沒有改：這就是不把數字寫死的好處。' },
      ],
    },
    {
      id: 'mob06-bottom-bar-section', title: '固定在底部的操作列：max() 與內距',
      blocks: [
        { type: 'p', text: '上一個範例把安全區域「加」在原本的內距上。這是可行的寫法，但不是唯一的，也不一定是最好的。操作列的下方內距常見的寫法有三種，差別在沒有安全區域的螢幕與有安全區域的手機上各留多少：' },
        { type: 'table', head: ['下方內距的寫法', '安全區域是 0 時', '安全區域是 34px 時', '結果'], rows: [
          ['`var(--safe-bottom)`', '0px', '34px', '沒有手勢列的手機上，按鈕貼著螢幕的下緣'],
          ['`calc(16px + var(--safe-bottom))`', '16px', '50px', '兩種手機都有留白；有手勢列時，按鈕比需要的位置更高'],
          ['`max(16px, var(--safe-bottom))`', '16px', '34px', '平常留 16px；安全區域比較大時，剛好讓開'],
        ] },
        { type: 'p', text: '`max()` 取幾個值裡最大的那一個（「viewport 與相對單位」與「流體字級與 clamp()」兩課都用過這一族函式）。`max(16px, var(--safe-bottom))` 的意思是：至少留 16px，安全區域比 16px 大的時候就聽安全區域的。手勢列所在的那一段本來就是空的，不需要在它上面再疊一段留白，所以這是底部操作列最常用的寫法。直接寫成 `max(16px, env(safe-area-inset-bottom))` 在手機上的結果相同。' },
        { type: 'p', text: '讓開的距離要加在操作列自己的內距上，而不是把整條操作列往上搬（`bottom: 34px`），也不是寫死它的高度。操作列的背景應該一路鋪到螢幕的下緣，蓋住手勢列後面的內容；往上讓的只有裡面的按鈕。操作列的高度就讓它由內容決定：上方內距、按鈕、下方內距加起來，下方內距變大，操作列自然長高。' },
        { type: 'p', text: '還有一件事會跟著變。「行動情境與限制」那一課說過，固定定位的操作列不佔版面，內容的最後要留出和它一樣高的位置，否則最後一行會被蓋住。現在操作列的高度會隨安全區域改變，這個位置就不能寫成固定的數字，要用同一個式子去算。' },
        { type: 'example', id: 'mob06-bottom-bar' },
        { type: 'p', text: '這一頁的內容比一個畫面長。`:root` 裡多了一個自訂屬性 `--bar-bottom`，值是 `max(16px, var(--safe-bottom))`；操作列的下方內距與 `<main>` 的下方內距都讀它。沒有安全區域時，操作列高 12 + 48 + 16 = 76px，`<main>` 的下方內距也是 60 + 16 = 76px：把預覽捲到最底，「合計 860 元」剛好接在操作列的上緣。按下「模擬」再捲到最底：操作列變成 12 + 48 + 34 = 94px，按鈕的下緣停在深色範圍的上緣，「合計」仍然完整地露在操作列上面，因為內容讓出的位置也跟著變成 94px。' },
        { type: 'callout', tone: 'warning', title: '把操作列的高度寫死', text: '很多操作列一開始是這樣寫的：`height: 76px; box-sizing: border-box;`。加上安全區域的內距之後，外框還是 76px，變大的下方內距只能往裡面擠：扣掉 12px 與 34px，留給 48px 按鈕的空間只剩 30px，按鈕從內容區溢出來，下緣回到離螢幕下緣 16px 的地方，下面一截又壓在手勢列上。要讓內距把操作列撐高，就不要替它寫固定的 `height`。' },
        { type: 'callout', tone: 'tip', title: '動手試：寫死高度，看按鈕掉回手勢列', text: '按「動手改這個範例」，在 `#bar` 的規則裡加上 `box-sizing: border-box;` 與 `height: 76px;` 兩行再執行。沒有按「模擬」時一切正常；按下「模擬」之後，操作列沒有長高，「送出訂單」下面的一截又落在深色的範圍裡。把這兩行刪掉，操作列就恢復成會跟著內距長高的樣子。' },
      ],
    },
    {
      id: 'mob06-orientation-section', title: '方向變化：橫放時，高度最珍貴',
      blocks: [
        { type: 'p', text: '使用者把手機從直放轉成橫放，就是一次方向變化（orientation change）：視窗從 360 × 640 之類的大小變成 640 × 360，寬度多了將近一倍，高度只剩一半多。CSS 用「Media Query 與斷點策略」那一課提過的媒體特徵 `orientation` 來問方向：高度大於或等於寬度是 `portrait`（直向），否則是 `landscape`（橫向）。' },
        { type: 'p', text: '但 `orientation` 只說視窗的形狀，沒有說它的大小：1024 × 768 的平板、幾乎所有的桌機視窗也都是橫向。所以決定欄數這一類的版面，仍然該問寬度，和響應式設計島學的一樣；`orientation` 很少單獨使用。手機橫放真正的問題是高度不夠，那就直接問高度：媒體特徵 `height` 和 `width` 的用法相同，`(max-height: 480px)` 表示視窗的高度不超過 480px。兩個條件可以用 `and` 接起來：`@media (orientation: landscape) and (max-height: 480px)`。' },
        { type: 'p', text: '高度只有 360px 的時候，黏在上方的 72px 頁首加上黏在下方的 76px 操作列，一共佔掉 148px，超過畫面的四成，中間能捲動的內容只剩一小條。常見的處理有三種：把頁首縮矮；讓操作列不再黏住，回到內容的最後；把上下的內距與間距收小。能不能這樣做要看內容，原則是把高度還給內容。' },
        { type: 'p', text: '安全區域也會跟著轉。手機橫放之後，瀏海跑到左邊或右邊：那一側的 `env(safe-area-inset-left)` 或 `env(safe-area-inset-right)` 變成不是 0；下方的手勢列通常還在，只是大小可能不同。使用者往哪一邊轉都有可能，所以左右兩側都要處理，而且各看各的變數。寫法和底部一樣是 `max()`：`padding-left: max(16px, var(--safe-left))`。這一條不必放進媒體查詢：直向時兩側的安全區域是 0，算出來就是原本的 16px。' },
        { type: 'example', id: 'mob06-landscape' },
        { type: 'p', text: '這個預覽的高度固定在大約 400px。按 360px：視窗比較高，是直向，頁首 72px，操作列黏在下緣。按 640px：視窗變成橫向，而且高度不超過 480px，最後那段媒體查詢成立，頁首變成 44px，操作列不再黏住，要捲到最後才看得到。這時按「模擬」（橫放、瀏海在左邊的手機）：左邊 44px 被塗成深色，頁首的標題、內容與操作列的左內距都變成 44px，右邊維持 16px；下方的 21px 也被塗深，操作列的下方內距變成 `max(16px, 21px)`，也就是 21px。' },
        { type: 'callout', tone: 'warning', title: 'orientation 只說形狀，不說大小', text: '`@media (orientation: landscape) { … }` 裡如果寫的是「把頁首縮矮、把操作列拿掉」，在桌機與橫放的平板上也會生效，而它們的高度一點也不缺。反過來，用 `(min-width: 600px)` 來猜「手機橫放了」也不可靠：直放的平板同樣超過 600px。想處理什麼，就問什麼：高度不夠問 `max-height`，寬度夠不夠問 `min-width`，真的只和形狀有關（例如圖片改成橫幅的比例）才單獨問 `orientation`。' },
        { type: 'p', text: '最後一個提醒：不要把頁面鎖在某一個方向，也不要在橫放時只顯示一句「請把手機轉正」。有人把手機固定在支架或輪椅上，轉不了；WCAG（網頁內容無障礙指引）也要求內容不限制顯示的方向，除非那個方向是功能必需的。JavaScript 另外有 Screen Orientation API 可以讀取目前的方向，版面的調整用上面的媒體查詢就夠了。想多看幾種寬高組合，可以到互動實驗島的 Responsive Layout Simulator 練習。' },
      ],
    },
    {
      id: 'mob06-dynamic-height-section', title: '動態視窗高度：dvh 與 svh',
      blocks: [
        { type: 'p', text: '「viewport 與相對單位」那一課說過 `vh` 在手機上的陷阱：手機瀏覽器的網址列與工具列會在捲動時收起、再出現，看得到的高度一直在變；而手機上的 `100vh` 是照工具列收起時的最大高度算的。工具列還在的時候，`height: 100vh` 的版面比看得到的範圍高，貼在它底部的「送出訂單」被工具列蓋住。那一課的表格列出了三個新的高度單位，這裡把怎麼選講完：' },
        { type: 'table', head: ['單位', '照哪一個高度', '特性', '適合'], rows: [
          ['`svh`（small）', '工具列全部出現時，看得到的最小高度', '不會隨捲動改變；工具列收起後，下面會空出一段', '一定要完整看得到、又不希望跳動的區塊，例如歡迎畫面'],
          ['`lvh`（large）', '工具列全部收起時的最大高度', '不會隨捲動改變；工具列出現時，底部被蓋住', '背景這類被蓋住一點也沒關係的裝飾'],
          ['`dvh`（dynamic）', '目前實際看得到的高度', '工具列滑動時跟著連續改變', '頭尾固定、中間捲動的全螢幕版面'],
        ] },
        { type: 'p', text: '所以標題裡的 `dvh` 與 `svh` 是最常用的兩個。像 App 一樣頭尾固定的版面用 `height: 100dvh`：它永遠等於看得到的高度，頁尾的按鈕不會被工具列蓋住。整頁一起捲動、只是希望「至少一個畫面高」的頁面用 `min-height: 100dvh` 或 `min-height: 100svh`。`dvh` 的代價是它會在使用者捲動的過程中改變：用它決定大小的元素會跟著重新排版，所以不要讓大片的內容跟著它變形，也不要替它加上尺寸的轉場動畫；會因此跳動的區塊改用 `svh`。' },
        { type: 'example', id: 'mob06-dvh-shell' },
        { type: 'p', text: '`#app` 是「CSS Grid 基礎」那一課的三列格線：`grid-template-rows: auto 1fr auto`，頁首與頁尾照自己的高度，中間的 `1fr` 拿走剩下的。`height: 100dvh` 讓這三列加起來剛好是看得到的視窗高；中間的 `#items` 寫了 `overflow-y: auto`，十幾行的清單在它自己裡面捲動，頁首與「送出訂單」永遠在畫面上。在預覽裡捲動清單，再按「動手改這個範例」把 `height: 100dvh` 改成 `min-height: 100dvh` 執行一次：`#app` 被內容撐得比預覽還高，變成整頁一起捲動，「送出訂單」要捲到最後才出現。' },
        { type: 'callout', tone: 'note', title: '預覽分不出 dvh、svh、lvh 與 vh', text: '預覽與檢查用的框架沒有會收放的工具列，所以 `100dvh`、`100svh`、`100lvh` 與 `100vh` 在這裡算出來完全一樣，都是框架的高度。「這個頁面在瀏覽器裡的事實」與練習的檢查，改用「把視窗的高度從 640px 改成 500px」來代表工具列出現：`#app` 跟著變成 500px，頁尾仍然貼著下緣。這能確認版面會跟著視窗的高度走；三個單位之間的差別，以及工具列滑動時的樣子，只有在真的手機上才看得到。' },
        { type: 'callout', tone: 'warning', title: '全螢幕版面裡的內容被切掉，或把版面撐破', text: '`height: 100dvh` 是一個確定的高度：裡面的內容放不下時，一定要有一塊自己會捲動（`overflow-y: auto`）。少了它，會出現兩種結果之一：在 grid 或 flex 裡，中間那一塊被內容撐開，頁尾被推到畫面外；或是容器寫了 `overflow: hidden`，超出的內容直接被切掉，使用者永遠看不到。寫了固定高度的版面，都要用一份很長的內容測一次。' },
      ],
    },
    {
      id: 'mob06-checklist-section', title: '合在一起，並在真的手機上確認',
      blocks: [
        { type: 'p', text: '這三件事在同一個頁面上會同時出現：`viewport-fit=cover` 讓背景鋪滿螢幕，貼邊的元素用 `max()` 與安全區域決定內距；橫放時把高度還給內容，並處理轉到兩側的安全區域；全螢幕的版面用 `100dvh`，它的頁尾同樣要寫 `padding-bottom: max(16px, var(--safe-bottom))`。上線之前，照下面的表逐項確認：' },
        { type: 'table', head: ['要確認的事', '怎麼確認'], rows: [
          ['加了 `viewport-fit=cover` 的頁面，每個貼著螢幕邊緣的元素都處理了安全區域', '在有瀏海與手勢列的手機上，直放、往左橫放、往右橫放各看一次'],
          ['沒有安全區域的螢幕上，按鈕下方仍然有留白', '在桌機或沒有手勢列的手機上看：內距是 `max()` 的那個最小值，不是 0'],
          ['捲到最底，最後一行沒有被固定的操作列蓋住', '在兩種手機上都捲到最底'],
          ['橫放時，頁首與操作列沒有佔掉大半個畫面', '把手機轉成橫放，看中間還剩多少內容'],
          ['工具列出現與收起時，底部的按鈕都看得到', '在手機瀏覽器裡慢慢上下捲動，觀察頁尾'],
        ] },
        { type: 'p', text: '這一課的預覽、模擬裝置與檢查能確認的是：給定一組安全區域與視窗大小，你的 CSS 算出來的結果對不對。它們確認不了的是真的裝置會給什麼值：安全區域有多大、什麼時候不是 0、工具列怎麼收放，各家瀏覽器與裝置都不一樣，也會隨版本改變。所以表裡每一項的確認方法都是「用真的手機看」；手邊的手機不夠多時，至少用一支有瀏海與手勢列的，和一支沒有的。' },
        { type: 'p', text: '後面的課還會再遇到安全區域：安裝到主畫面的網頁 App 可以不顯示瀏覽器的網址列，頁面佔滿整個螢幕，這時連上方的 `env(safe-area-inset-top)` 都要處理（「PWA 基礎：Manifest 與安裝」）。做法和這一課完全相同：收進自訂屬性，用 `max()` 寫在貼邊元素的內距上。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob06-q1', prompt: '在 viewport 設定裡加上 `viewport-fit=cover`，會發生什麼事？',
      options: [
        '瀏覽器自動替所有固定定位的元素加上安全區域的內距',
        '頁面被縮小，確保所有內容都落在安全的矩形裡',
        '頁面延伸到整個螢幕，包括瀏海與手勢列所在的位置；讓內容避開這些位置變成頁面自己的責任',
        '頁面被鎖定在直向，橫放時不再旋轉',
      ],
      answer: 2,
      explanation: '`viewport-fit=cover` 讓頁面鋪滿整個螢幕，瀏覽器不再替你把頁面留在安全的矩形裡，所以貼邊的文字與按鈕要靠你的 CSS（`env()` 的安全區域）避開。瀏覽器不會自動替任何元素加內距。「留在安全矩形裡」是沒有寫 `viewport-fit` 時的預設行為，不是 `cover` 的效果。viewport 設定和鎖定方向無關。',
    },
    {
      id: 'mob06-q2', prompt: '`env(safe-area-inset-bottom, 0px)` 裡的第二個參數 `0px` 是什麼？',
      options: [
        '後備值：瀏覽器沒有提供 `safe-area-inset-bottom` 這個變數時使用',
        '最小值：安全區域比 0px 小的時候改用 0px',
        '初始值：頁面可以之後用 JavaScript 把這個環境變數改成別的數字',
        '單位：告訴瀏覽器回傳的數字要用 px 表示',
      ],
      answer: 0,
      explanation: '`env()` 的第二個參數是後備值，只在瀏覽器沒有這個環境變數時才用上；有這個變數時，一律用瀏覽器給的值，即使那個值是 0。它不是下限：要「至少多少」得另外用 `max()`。環境變數由瀏覽器定義，頁面改不了它的值；這一課能被模擬裝置改掉的是自訂屬性 `--safe-bottom`，不是 `env()`。`env()` 得到的本來就是帶單位的長度。',
    },
    {
      id: 'mob06-q3', prompt: '頁面已經有 `viewport-fit=cover`。底部操作列寫了下面的樣式，在有手勢列的手機上看起來很好；換成沒有安全區域的手機會怎樣？',
      code: { language: 'CSS', text: '#bar {\n  position: fixed;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  padding: 12px 16px env(safe-area-inset-bottom);\n}' },
      options: [
        '下方內距變成 12px，因為沒有值的時候會沿用上方內距',
        '整條宣告無效，操作列四邊都沒有內距',
        '操作列消失，因為 `env()` 在這種手機上不存在',
        '下方內距是 0：按鈕直接貼著螢幕的下緣；應該改成 `max(16px, env(safe-area-inset-bottom))`',
      ],
      answer: 3,
      explanation: '沒有需要避開的東西時，`env(safe-area-inset-bottom)` 的值是 0，不是「沒有值」：宣告仍然有效，下方內距就是 0px，按鈕貼著螢幕下緣。內距的簡寫不會拿上方的值來補下方。安全區域只是「至少要讓開多少」，不能取代原本的留白；`max(16px, …)` 在這種手機上得到 16px，在有手勢列的手機上得到安全區域的大小。',
    },
    {
      id: 'mob06-q4', prompt: '`#bar` 的下方內距寫成 `max(16px, var(--safe-bottom))`，其中 `--safe-bottom` 是 `env(safe-area-inset-bottom, 0px)`。在安全區域是 0 的手機，與安全區域是 34px 的手機上，下方內距分別是多少？',
      options: [
        '0px 與 34px',
        '16px 與 34px',
        '16px 與 50px',
        '34px 與 34px',
      ],
      answer: 1,
      explanation: '`max()` 取比較大的那一個：`max(16px, 0px)` 是 16px，`max(16px, 34px)` 是 34px。0px 與 34px 是只寫 `var(--safe-bottom)` 的結果，沒有安全區域時按鈕會貼著下緣。16px 與 50px 是 `calc(16px + var(--safe-bottom))` 的結果：那是相加，不是取最大值。安全區域的大小由裝置決定，不會在兩支手機上都是 34px。',
    },
    {
      id: 'mob06-q5', prompt: '操作列寫了 `height: 76px; box-sizing: border-box; padding: 12px 16px max(16px, var(--safe-bottom));`，裡面是一顆 48px 高的按鈕。在安全區域 34px 的手機上會怎樣？',
      options: [
        '操作列自動長高成 94px，按鈕完整地在手勢列上方',
        '操作列的外框仍然是 76px，內距往裡面擠，按鈕溢出內容區，下面一截又落在手勢列的範圍裡',
        '`max()` 不能和 `box-sizing: border-box` 一起使用，整條 `padding` 宣告無效',
        '按鈕被自動壓扁成 30px 高，剛好放進剩下的空間',
      ],
      answer: 1,
      explanation: '`box-sizing: border-box` 加上固定的 `height`，外框就固定是 76px：扣掉 12px 與 34px 的內距，內容區只剩 30px，48px 的按鈕放不下而溢出，下緣回到離螢幕 16px 的地方，壓在 34px 的手勢列上。操作列不會自己長高，因為高度被寫死了；拿掉 `height`，讓內距把它撐高才對。`max()` 可以用在任何接受長度的地方。寫了 `height: 48px` 的按鈕也不會被壓扁。',
    },
    {
      id: 'mob06-q6', prompt: '想在「手機橫放、畫面很矮」的時候把 72px 的頁首縮成 44px。哪一個媒體查詢最合適？',
      options: [
        '`@media (orientation: landscape)`',
        '`@media (min-width: 600px)`',
        '`@media (orientation: portrait) and (max-height: 480px)`',
        '`@media (orientation: landscape) and (max-height: 480px)`',
      ],
      answer: 3,
      explanation: '要處理的是「橫向而且高度不夠」，所以兩個條件都問：`landscape` 加上 `max-height`。只寫 `orientation: landscape` 會連 1024 × 768 的平板與桌機視窗一起縮，它們的高度並不缺。`min-width: 600px` 問的是寬度，直放的平板也符合。`portrait` 是直向（高度大於或等於寬度），和橫放正好相反。',
    },
    {
      id: 'mob06-q7', prompt: '一個歡迎畫面要「工具列全部出現時也完整看得到」，而且高度不要在使用者捲動、工具列收放的時候跟著改變。該用哪一個高度？',
      options: [
        '`100svh`',
        '`100dvh`',
        '`100lvh`',
        '`100vw`',
      ],
      answer: 0,
      explanation: '`svh` 照工具列全部出現時的最小高度計算，不會隨捲動改變：內容一定完整看得到，版面也不會跳動。`dvh` 會在工具列滑動時連續改變，適合頭尾固定的全螢幕版面，但會讓這種畫面跟著變形。`lvh` 是工具列收起時的最大高度，工具列出現時底部會被蓋住。`vw` 是視窗寬度的單位，和高度無關。',
    },
    {
      id: 'mob06-q8', prompt: '使用者把有瀏海的手機轉成橫放，瀏海在螢幕的左邊。頁面有 `viewport-fit=cover`。關於安全區域，哪一個說法正確？',
      options: [
        '四個安全區域的值在旋轉之後都不會改變',
        '橫放時瀏覽器會自動替 `<body>` 加上左內距，CSS 不必處理',
        '`env(safe-area-inset-left)` 變成不是 0，內容的左內距應該寫成 `max(16px, env(safe-area-inset-left))` 這一類的式子',
        '只要處理 `env(safe-area-inset-top)`，因為瀏海永遠算在上方',
      ],
      answer: 2,
      explanation: '安全區域是相對於目前的視窗來算的：手機橫放、瀏海在左邊時，需要避開的是視窗的左緣，`env(safe-area-inset-left)` 變成不是 0。這些值會隨方向改變，瀏覽器會重新計算。加了 `viewport-fit=cover` 之後，瀏覽器不再替頁面避開，必須由 CSS 處理。瀏海在哪一邊，就是哪一邊的變數有值；使用者也可能往另一邊轉，所以右邊同樣要用 `env(safe-area-inset-right)` 處理。',
    },
  ],
  webCode: {
    examples: [edgeToEdge, envValues, bottomBar, landscape, dvhShell],
    exercises: [exSafeBar, exLandscape, exShell, exCheckout],
  },
};
