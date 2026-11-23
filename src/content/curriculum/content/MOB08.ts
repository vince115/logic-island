import type { WebExample, WebExercise, WebViewport } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB08 PWA basics: the manifest and installing (MOB-2). A web-code lesson on the made-up 小島外送 (https://food.example).
 * The preview cannot install anything and has no file but index.html, style.css and script.js, so the lesson's pages
 * work like this: the manifest is a JSON TEXT in script.js (`const manifestText = `{ … }`;`) and a small fixed script in
 * index.html, the inspector (INSPECTOR_HTML below), parses it with JSON.parse and applies the rules the lesson teaches,
 * then renders a list of problems and an "install preview" card. The lesson says plainly that this is the course's
 * stand-in for the browser's own manifest check (the developer tools' Application panel on a real site), and lists the
 * rules next to the first page that uses it. The inspector is stricter than a browser on purpose: a browser ignores an
 * invalid member and uses its default, the inspector reports it.
 * Stated as "differs between browsers", never per vendor: installability conditions, where the install entry is, how
 * the splash screen is made, when an installed app picks up a changed manifest. `beforeinstallprompt` has one sentence.
 * The display mode of a check page cannot be switched (and a learner may have this very site open in an installed
 * window), so `display-mode` is taught with an example whose facts hold in an ordinary browser tab, and no exercise
 * checks it. Service workers and offline are MOB09.
 */

const lines = (...text: string[]) => text.join('\n');
const PHONE: WebViewport = { width: 360, height: 640 };

// ---- the page of section 1 and exercise 1: what a head declares ---------------------------------------------------
const headDoc = (...head: string[]) => lines(
  '<!DOCTYPE html>',
  '<html lang="zh-Hant">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <meta name="viewport" content="width=device-width, initial-scale=1">',
  '  <title>小島外送</title>',
  ...head,
  '</head>',
  '<body>',
  '  <header id="toolbar">food.example（模擬的瀏覽器工具列）</header>',
  '  <main>',
  '    <h1>小島外送</h1>',
  '    <ul>',
  '      <li>Manifest 的連結：<code id="manifest-href"></code></li>',
  '      <li>主題色：<code id="theme"></code></li>',
  '    </ul>',
  '  </main>',
  '</body>',
  '</html>',
);
const HEAD_CSS = String.raw`body {
  margin: 0;
  font-family: system-ui, sans-serif;
}
#toolbar {
  padding: 10px 16px;
  background-color: #636e72;
  color: white;
}
main {
  padding: 0 16px;
}`;
const HEAD_JS = lines(
  '// 讀出 head 裡和安裝有關的兩個宣告，寫到頁面上',
  "const link = document.querySelector('head link[rel=\"manifest\"]');",
  "const theme = document.querySelector('head meta[name=\"theme-color\"]');",
  '',
  "const href = link ? link.getAttribute('href') : '';",
  "document.querySelector('#manifest-href').textContent = href || '沒有';",
  "document.querySelector('#theme').textContent = theme && theme.content ? theme.content : '沒有';",
  '',
  '// 真正的瀏覽器會自己拿主題色去染工具列；這裡用最上面那一條色塊代替',
  'if (theme) {',
  "  document.querySelector('#toolbar').style.backgroundColor = theme.content;",
  '}',
);

// ---- the inspector: this course's stand-in for the browser's manifest check ---------------------------------------
/** index.html of every page that reads a manifest: the report's elements, script.js, then the fixed inspector. */
const INSPECTOR_HTML = String.raw`<h1>Manifest 檢查器</h1>
<p id="verdict"></p>
<ul id="problems"></ul>

<section id="card" aria-label="安裝預覽">
  <div id="card-bar"></div>
  <div id="card-splash"><span id="card-icon"></span></div>
  <dl>
    <dt>圖示下方的名稱</dt>
    <dd id="card-name"></dd>
    <dt>顯示模式</dt>
    <dd id="card-display"></dd>
    <dt>開啟的網址</dt>
    <dd id="card-start"></dd>
    <dt>圖示</dt>
    <dd id="card-icons"></dd>
    <dt>maskable 圖示</dt>
    <dd id="card-maskable"></dd>
  </dl>
</section>

<script src="script.js"></script>
<script>
// 固定的檢查器：這門課用它代替瀏覽器對 Manifest 的檢查。
// 假設網站是 https://food.example，Manifest 放在網站的根目錄。
const MANIFEST_URL = 'https://food.example/manifest.webmanifest';
const DISPLAY_MODES = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];

const isText = (value) => typeof value === 'string' && value.trim() !== '';
// 把 "192x192 512x512" 這種用空白分開的值拆成清單
const words = (value) => String(value).toLowerCase().split(' ');
// 圖示的用途：沒寫 purpose 就是 any
const purposeOf = (icon) => words(icon.purpose || 'any');

// 相對網址要相對於 Manifest 的網址來解析；不合法或跑到別的來源，回傳空字串
function resolve(path) {
  try {
    const url = new URL(path, MANIFEST_URL);
    return url.origin === new URL(MANIFEST_URL).origin ? url.href : '';
  } catch (error) {
    return '';
  }
}

function inspect(text) {
  const report = { problems: [], name: '', display: 'browser', startUrl: '', icons: [], theme: '', background: '' };
  const problem = (message) => report.problems.push(message);

  // 規則 1：先解析。不是合法的 JSON，後面就什麼都讀不到
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    problem('不是合法的 JSON：整份 Manifest 都不會被採用');
    return report;
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    problem('最外層必須是一個物件：{ … }');
    return report;
  }

  // 規則 2：name 與 short_name 至少要有一個；short_name 最多 12 個字元
  report.name = isText(manifest.short_name) ? manifest.short_name : isText(manifest.name) ? manifest.name : '';
  if (report.name === '') problem('需要 name 或 short_name');
  // [...文字] 把文字拆成一個一個字元
  if (isText(manifest.short_name) && [...manifest.short_name].length > 12) problem('short_name 超過 12 個字元');

  // 規則 3：要有 start_url，而且和網站同一個來源
  if (!isText(manifest.start_url)) {
    problem('需要 start_url');
  } else {
    report.startUrl = resolve(manifest.start_url);
    if (report.startUrl === '') problem('start_url 必須是和網站同一個來源的網址');
  }

  // 規則 4：display 是四個顯示模式之一。寫錯的值瀏覽器會忽略，改用 browser
  if (DISPLAY_MODES.includes(manifest.display)) report.display = manifest.display;
  else problem('display 必須是 fullscreen、standalone、minimal-ui 或 browser');

  // 規則 5：圖示要有 src；192x192 與 512x512 各要有一張 PNG，用途包含 any
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  report.icons = icons.filter((icon) => typeof icon === 'object' && icon !== null && isText(icon.src));
  for (const size of ['192x192', '512x512']) {
    const found = report.icons.some((icon) =>
      words(icon.sizes).includes(size) && icon.type === 'image/png' && purposeOf(icon).includes('any'));
    if (!found) problem('icons 需要一張 ' + size + ' 的 PNG 圖示（type 是 image/png，用途包含 any）');
  }

  // 規則 6：顏色有寫的話，必須是合法的 CSS 顏色
  const color = (member) => {
    if (!(member in manifest)) return '';
    if (CSS.supports('color', manifest[member])) return manifest[member];
    problem(member + ' 不是合法的 CSS 顏色');
    return '';
  };
  report.background = color('background_color');
  report.theme = color('theme_color');
  return report;
}

function show(report) {
  const put = (selector, text) => {
    document.querySelector(selector).textContent = text;
  };
  const count = report.problems.length;
  put('#verdict', count === 0 ? '沒有發現問題' : '發現 ' + count + ' 個問題');
  for (const message of report.problems) {
    const item = document.createElement('li');
    item.textContent = message;
    document.querySelector('#problems').append(item);
  }
  put('#card-icon', [...report.name].slice(0, 1).join(''));
  put('#card-name', report.name || '（沒有名稱）');
  put('#card-display', report.display);
  put('#card-start', report.startUrl || '（沒有設定）');
  const sizes = report.icons.map((icon) => (icon.sizes || '沒寫尺寸') + '（' + purposeOf(icon).join(' ') + '）');
  put('#card-icons', sizes.join('、') || '（沒有圖示）');
  put('#card-maskable', report.icons.some((icon) => purposeOf(icon).includes('maskable')) ? '有' : '沒有');
  // 上方色條是主題色，中間色塊是啟動畫面的背景色；沒寫或寫錯就維持灰色
  document.querySelector('#card-bar').style.backgroundColor = report.theme;
  document.querySelector('#card-splash').style.backgroundColor = report.background;
}

// script.js 如果有語法錯誤，manifestText 就不存在：當成空的文字
let text = '';
try {
  text = String(manifestText);
} catch (error) {
  text = '';
}
show(inspect(text));
</script>`;

const INSPECTOR_CSS = String.raw`body {
  margin: 0;
  padding: 12px 16px;
  font-family: system-ui, sans-serif;
}
h1 {
  margin: 0 0 8px;
  font-size: 20px;
}
#verdict {
  margin: 0 0 4px;
  font-weight: bold;
}
#problems {
  margin: 0 0 12px;
  padding-left: 20px;
  color: #b71c1c;
}
#card {
  overflow: hidden;
  border: 1px solid #b2bec3;
  border-radius: 12px;
}
#card-bar {
  height: 20px;
  background-color: #b2bec3;
}
#card-splash {
  display: grid;
  place-items: center;
  height: 88px;
  background-color: #dfe6e9;
}
#card-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background-color: #2d3436;
  color: white;
  font-size: 28px;
}
#card dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  padding: 12px;
}
#card dt {
  color: #636e72;
}
#card dd {
  margin: 0;
  overflow-wrap: anywhere;
}`;

/** script.js: the manifest as a text. `before` are script lines above it (comments); `json` is what goes between the braces. */
const manifestJs = (before: string[], json: string[]) => lines(...before, 'const manifestText = `{', ...json, '}`;');

const ICON_192 = '    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" }';
const ICON_512 = '    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }';
const ICON_MASKABLE = [
  '    {',
  '      "src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png",',
  '      "purpose": "maskable"',
  '    }',
];
const FULL_NAME = '  "name": "小島外送：海鮮便當送到你家",';
const SHORT_NAME = '  "short_name": "小島外送",';
const START_MENU = '  "start_url": "/menu/",';
const STANDALONE = '  "display": "standalone",';
const COLORS = ['  "background_color": "#ffffff",', '  "theme_color": "#d35400",'];

// ---- examples ---------------------------------------------------------------------------------------------------
const examples: WebExample[] = [
  {
    id: 'mob08-ex-head', title: '可安裝的網站：head 裡的三行',
    description: '小島外送的首頁，一份完整的文件。`<head>` 裡有三行和安裝有關：Manifest 的連結、主題色，以及給部分平台當主畫面圖示的 `apple-touch-icon`。script.js 把讀到的宣告寫在頁面上，並用最上面的色塊代替瀏覽器的工具列。',
    viewport: PHONE,
    files: {
      html: headDoc(
        '  <link rel="manifest" href="manifest.webmanifest">',
        '  <meta name="theme-color" content="#d35400">',
        '  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
        '  <link rel="stylesheet" href="style.css">',
      ),
      css: HEAD_CSS,
      js: HEAD_JS,
    },
    observe: [
      { check: 'attr', selector: 'head link[rel="manifest"]', name: 'href', value: 'manifest.webmanifest', label: '`<head>` 裡有一個 `rel="manifest"` 的 `<link>`，`href` 指向 manifest.webmanifest' },
      { check: 'attr', selector: 'head meta[name="theme-color"]', name: 'content', value: '#d35400', label: '主題色寫在 `name="theme-color"` 的 `<meta>` 的 `content` 屬性裡' },
      { check: 'style', selector: '#toolbar', property: 'background-color', value: '#d35400', label: '指令稿讀到主題色，把模擬的工具列染成同一個橘色' },
      { check: 'text', selector: '#manifest-href', text: 'manifest.webmanifest', label: '頁面讀得到的只是連結上寫的檔名：預覽沒有網路，不會真的去下載這個檔案' },
      { check: 'count', selector: 'head link[rel="apple-touch-icon"]', count: 1, label: '`apple-touch-icon` 是另一個獨立的 `<link>`，和 Manifest 並存' },
    ],
  },
  {
    id: 'mob08-ex-manifest', title: '小島外送的 Manifest 與檢查器',
    description: 'script.js 裡的 `manifestText` 是小島外送完整的 Manifest。index.html 下半部是固定的檢查器：它解析這段文字、逐條檢查，把問題列在上面，並把讀到的內容畫成一張安裝預覽。',
    viewport: PHONE,
    files: {
      html: INSPECTOR_HTML,
      css: INSPECTOR_CSS,
      js: manifestJs(
        ['// 真正的專案裡，大括號這一段是獨立的檔案 manifest.webmanifest'],
        [FULL_NAME, SHORT_NAME, START_MENU, STANDALONE, ...COLORS, '  "icons": [', `${ICON_192},`, `${ICON_512},`, ...ICON_MASKABLE, '  ]'],
      ),
    },
    observe: [
      { check: 'count', selector: '#problems li', count: 0, label: '檢查器沒有列出任何問題' },
      { check: 'text', selector: '#card-name', text: '小島外送', label: '圖示下方的名稱用的是 `short_name`，不是比較長的 `name`' },
      { check: 'text', selector: '#card-start', text: 'https://food.example/menu/', label: '`start_url` 的 `/menu/` 相對於 Manifest 的網址，解析成菜單頁的完整網址' },
      { check: 'text', selector: '#card-display', text: 'standalone', label: '顯示模式是 standalone' },
      { check: 'style', selector: '#card-bar', property: 'background-color', value: '#d35400', label: '安裝預覽上方的色條是 `theme_color` 的橘色' },
    ],
  },
  {
    id: 'mob08-ex-broken', title: '一行註解毀掉整份 Manifest',
    description: '這份 Manifest 的第一行多了一個 `//` 開頭的註解，其餘和平常一樣。JSON 沒有註解，所以解析在這裡就失敗了。',
    viewport: PHONE,
    files: {
      html: INSPECTOR_HTML,
      css: INSPECTOR_CSS,
      js: manifestJs([], ['  // 小島外送的 Manifest', SHORT_NAME, START_MENU, STANDALONE, '  "icons": [', ICON_192, '  ]']),
    },
    observe: [
      { check: 'count', selector: '#problems li', count: 1, label: '檢查器只列出一個問題：這段文字不是合法的 JSON' },
      { check: 'text', selector: '#card-name', text: '（沒有名稱）', label: '`short_name` 明明寫了，卻沒有被讀到：解析失敗時，整份 Manifest 一個成員都不算數' },
      { check: 'text', selector: '#card-display', text: 'browser', label: '顯示模式也只剩預設的 browser' },
      { check: 'text', selector: '#card-icons', text: '（沒有圖示）', label: '圖示清單是空的' },
    ],
  },
  {
    id: 'mob08-ex-mask', title: '同一張圖示，三種外框',
    description: '兩張 96 × 96 的圖示，各用三種外框顯示：不裁切、圓角方形、圓形。上排的深色框線畫在圖的最邊緣；下排的背景一樣鋪滿，但框線與文字縮在中央 52 × 52 的範圍內。',
    viewport: PHONE,
    files: {
      html: lines(
        '<h1>同一張圖示，三種外框</h1>',
        '<p>由左到右：不裁切、圓角方形、圓形</p>',
        '<h2>主體貼到邊緣</h2>',
        '<div class="row">',
        '  <div class="icon"><b class="art edge">島</b></div>',
        '  <div class="icon rounded"><b class="art edge">島</b></div>',
        '  <div class="icon circle" id="edge-circle"><b class="art edge">島</b></div>',
        '</div>',
        '<h2>主體留在中央的安全區</h2>',
        '<div class="row">',
        '  <div class="icon"><b class="art safe">島</b></div>',
        '  <div class="icon rounded"><b class="art safe">島</b></div>',
        '  <div class="icon circle" id="safe-circle"><b class="art safe">島</b></div>',
        '</div>',
      ),
      css: String.raw`body {
  font-family: system-ui, sans-serif;
}
h1 {
  font-size: 20px;
}
h2 {
  font-size: 16px;
}
.row {
  display: flex;
  gap: 12px;
}
.icon {
  display: grid;
  place-items: center;
  overflow: hidden;
  width: 96px;
  height: 96px;
  background-color: #d35400;
}
.rounded {
  border-radius: 24px;
}
.circle {
  border-radius: 50%;
}
.art {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  border: 6px solid #2d3436;
  color: white;
  font-size: 28px;
}
.edge {
  width: 96px;
  height: 96px;
}
.safe {
  width: 52px;
  height: 52px;
}`,
    },
    observe: [
      { check: 'style', selector: '#edge-circle', property: 'border-top-left-radius', value: '50%', label: '圓形的外框是 `border-radius: 50%` 加上 `overflow: hidden`：圖的四個角被裁掉' },
      { check: 'box', selector: '#edge-circle .art', measure: 'width', value: 96, label: '上排的框線和圖示一樣寬（96px），所以四個角落的框線落在圓形外面' },
      { check: 'box', selector: '#safe-circle .art', measure: 'width', value: 52, label: '下排的框線只有 52px 寬，留在中央的安全區裡' },
      { check: 'box', selector: '#safe-circle .art', measure: 'left', value: 22, from: '#safe-circle', label: '它距離圖示的左邊 22px：四周都留了邊' },
    ],
  },
  {
    id: 'mob08-ex-display', title: '安裝之後才出現的返回按鈕',
    description: '「訂單狀態」頁的標題列有一顆返回按鈕 `#back`，平常是 `display: none`；視窗的顯示模式是 standalone 或 fullscreen 時，媒體查詢才讓它出現。script.js 用 `matchMedia` 找出目前的顯示模式並寫在頁面上。',
    viewport: PHONE,
    files: {
      html: lines(
        '<header>',
        '  <button id="back" type="button">← 返回</button>',
        '  <h1>訂單狀態</h1>',
        '</header>',
        '<p>海鮮便當 × 2：外送中</p>',
        '<p>這個視窗的顯示模式：<output id="mode"></output></p>',
      ),
      css: String.raw`header {
  display: flex;
  align-items: center;
  gap: 8px;
}
h1 {
  font-size: 20px;
}
#back {
  display: none;
  min-height: 44px;
}
@media (display-mode: standalone), (display-mode: fullscreen) {
  #back {
    display: inline-block;
  }
}`,
      js: lines(
        "const modes = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];",
        '',
        '// 四個顯示模式一個一個問，找出成立的那一個',
        'const current = modes.find((mode) => {',
        "  return window.matchMedia('(display-mode: ' + mode + ')').matches;",
        '});',
        "document.querySelector('#mode').textContent = current;",
      ),
    },
    observe: [
      { check: 'text', selector: '#mode', text: 'browser', label: '在一般的瀏覽器分頁裡開啟（測試時就是這樣）：`(display-mode: browser)` 成立' },
      { check: 'style', selector: '#back', property: 'display', value: 'none', label: '這時媒體查詢不成立，返回按鈕維持 `display: none`' },
      { check: 'count', selector: '#back', count: 1, label: '按鈕一直都在 HTML 裡：是 CSS 依顯示模式決定要不要畫出來' },
    ],
  },
];

// ---- exercises --------------------------------------------------------------------------------------------------
const HEAD_COMMENT = '  <!-- 在這裡補上 Manifest 的連結與主題色 -->';
const STYLE_LINK = '  <link rel="stylesheet" href="style.css">';

const exercises: WebExercise[] = [
  {
    id: 'mob08-x-head', title: '替首頁連上 Manifest',
    statement: 'style.css 與 script.js 不能改。小島外送的首頁還沒有任何和安裝有關的宣告。請在 index.html 的 `<head>` 裡補上兩行：（一）一個連到 Manifest 的 `<link>`，檔案叫 manifest.webmanifest，和 index.html 放在同一個資料夾；（二）一個把主題色設成 `#d35400` 的 `<meta>`。固定的 script.js 會把它讀到的連結與主題色寫在頁面上，並把最上面那條模擬的工具列染成主題色；檢查看的是 `<head>` 裡的這兩個元素，以及工具列的顏色。預覽沒有網路，不會真的去下載 Manifest。',
    hints: [
      '兩行都是放在 `<head>` 裡、沒有結束標籤的元素：連到別的檔案用 `<link>`，描述頁面本身用 `<meta>`。',
      '`<link>` 靠 `rel` 說明這個檔案是什麼、靠 `href` 說明它在哪裡；`<meta>` 靠 `name` 說明這是哪一項資料、靠 `content` 給值。',
      '`<link rel="manifest" href="manifest.webmanifest">`，以及 `<meta name="theme-color" content="#d35400">`。',
    ],
    explanation: '瀏覽器從目前這一頁的 `<head>` 找 `rel="manifest"` 的 `<link>`，再依 `href` 去下載 Manifest：少了這一行，Manifest 寫得再完整也沒有人會讀。`<meta name="theme-color">` 的值放在 `content`，和 viewport 那一行的寫法相同。兩行的順序、放在 `<head>` 的哪個位置都不影響結果；真正的網站要在每一個頁面都放。',
    viewport: PHONE,
    fixed: { css: HEAD_CSS, js: HEAD_JS },
    starter: { html: headDoc(HEAD_COMMENT, STYLE_LINK) },
    solution: { html: headDoc('  <link rel="manifest" href="manifest.webmanifest">', '  <meta name="theme-color" content="#d35400">', STYLE_LINK) },
    steps: [
      { check: 'count', selector: 'head link[rel="manifest"]', count: 1, label: '`<head>` 裡有一個 `rel` 是 manifest 的 `<link>`' },
      { check: 'attr', selector: 'head link[rel="manifest"]', name: 'href', value: 'manifest.webmanifest', match: 'includes', label: '這個 `<link>` 用 `href` 指向 manifest.webmanifest' },
      { check: 'count', selector: 'head meta[name="theme-color"]', count: 1, label: '`<head>` 裡有一個 `name` 是 theme-color 的 `<meta>`' },
      { check: 'style', selector: '#toolbar', property: 'background-color', value: '#d35400', label: '指令稿讀得到主題色，模擬的工具列變成 #d35400' },
    ],
    mistakes: [
      {
        files: { html: headDoc('  <link rel="manifest" src="manifest.webmanifest">', '  <meta name="theme-color" content="#d35400">', STYLE_LINK) },
        why: '把檔案的位置寫在 `src`。`<img>` 與 `<script>` 用 `src`，`<link>` 用的是 `href`：寫成 `src` 的話，瀏覽器不知道 Manifest 在哪裡，等於沒有連結。',
      },
      {
        files: { html: headDoc('  <link rel="manifest" href="manifest.webmanifest">', '  <meta name="theme-color" value="#d35400">', STYLE_LINK) },
        why: '把顏色寫在 `value`。`<meta>` 的值一律放在 `content` 屬性；`value` 是表單控制項用的，瀏覽器在這裡讀不到主題色。',
      },
    ],
  },
  {
    id: 'mob08-x-repair', title: '修好讀不進去的 Manifest',
    statement: 'index.html 與 style.css 不能改。script.js 的 `manifestText` 是同事交來的 Manifest，檢查器說它不是合法的 JSON。請把它修到沒有任何問題，內容（名稱、網址、顏色、兩張圖示）維持原樣：先找出讓 JSON 解析失敗的地方（不只一處），解析成功之後再看檢查器列出的下一個問題。顯示模式要選「像一般 App 的獨立視窗」：沒有瀏覽器的網址列，但手機最上方的系統狀態列還在。檢查看的是檢查器的結果：問題清單是空的，安裝預覽的名稱、開啟的網址與顯示模式都正確。',
    hints: [
      'JSON 比 JavaScript 的物件寫法嚴格。對照這一課的表格，一行一行看：引號是哪一種？每個逗號後面是不是真的還有下一項？',
      '第一行的鍵與值用了單引號；`icons` 陣列最後一張圖示後面多了一個逗號。兩處都修好，檢查器才會開始檢查內容，這時它會指出 `display` 的值。',
      '`display` 只有四個值可以寫。沒有網址列、保留系統狀態列的是 `standalone`；連狀態列都蓋掉的才是 `fullscreen`。',
    ],
    explanation: 'JSON 的字串與鍵只能用雙引號，陣列與物件的最後一項後面不能有逗號：兩者只要犯一個，整份文字就解析失敗，其餘寫對的成員也全部讀不到，所以檢查器一開始只回報一個問題。語法修好之後才輪到內容：`full` 不是顯示模式的值，瀏覽器會忽略它、退回預設的 `browser`，安裝後開起來仍然像一個瀏覽器分頁。題目描述的視窗是 `standalone`。',
    viewport: PHONE,
    fixed: { html: INSPECTOR_HTML, css: INSPECTOR_CSS },
    starter: {
      js: manifestJs(
        ['// 這份 Manifest 有三個地方要修'],
        ["  'name': '小島外送：海鮮便當送到你家',", SHORT_NAME, START_MENU, '  "display": "full",', ...COLORS, '  "icons": [', `${ICON_192},`, `${ICON_512},`, '  ]'],
      ),
    },
    solution: {
      js: manifestJs([], [FULL_NAME, SHORT_NAME, START_MENU, STANDALONE, ...COLORS, '  "icons": [', `${ICON_192},`, ICON_512, '  ]']),
    },
    steps: [
      { check: 'count', selector: '#problems li', count: 0, label: '檢查器沒有列出任何問題：文字是合法的 JSON，每個成員也都過關' },
      { check: 'text', selector: '#card-name', text: '小島外送', label: '安裝預覽的「圖示下方的名稱」是小島外送' },
      { check: 'text', selector: '#card-start', text: 'https://food.example/menu/', label: '「開啟的網址」仍然是菜單頁' },
      { check: 'text', selector: '#card-display', text: 'standalone', label: '「顯示模式」是獨立視窗的那個值（不是全螢幕，也不是瀏覽器分頁）' },
    ],
    mistakes: [
      {
        files: { js: manifestJs([], [FULL_NAME, SHORT_NAME, START_MENU, STANDALONE, ...COLORS, '  "icons": [', `${ICON_192},`, `${ICON_512},`, '  ]']) },
        why: '改了引號與 `display`，卻留著 `icons` 陣列最後一項後面的逗號。在 JavaScript 裡這樣寫沒問題，在 JSON 裡整份文字就不合法：其他地方改得再對，瀏覽器一個成員都讀不到。',
      },
      {
        files: { js: manifestJs([], [FULL_NAME, SHORT_NAME, START_MENU, '  "display": "full",', ...COLORS, '  "icons": [', `${ICON_192},`, ICON_512, '  ]']) },
        why: '語法修好就停手了。能解析只代表它是合法的 JSON，不代表內容正確：`full` 不是顯示模式的值，瀏覽器不會報錯，只會悄悄改用 `browser`。',
      },
      {
        files: { js: manifestJs([], [FULL_NAME, SHORT_NAME, START_MENU, '  "display": "fullscreen",', ...COLORS, '  "icons": [', `${ICON_192},`, ICON_512, '  ]']) },
        why: '把 `full` 補成 `fullscreen`。它是合法的值，但意思是佔滿整個螢幕、連系統的狀態列都蓋掉，適合遊戲或影片；題目要的是保留狀態列的獨立視窗。',
      },
    ],
  },
  {
    id: 'mob08-x-icons', title: '補齊圖示與短名稱',
    statement: 'index.html 與 style.css 不能改。這份 Manifest 是合法的 JSON，但檢查器列出了三個問題。請修改 script.js 的 `manifestText`：（一）`short_name` 改成「小島外送」。（二）`icons` 要有兩張一般用途的 PNG 圖示：`icons/icon-192.png`（192 × 192）與 `icons/icon-512.png`（512 × 512），每一張都要寫出尺寸與圖檔類型。（三）再加上第三張圖示 `icons/maskable-512.png`（512 × 512 的 PNG），用途標成 maskable。檢查看的是檢查器的結果：問題清單是空的，圖示下方的名稱是「小島外送」，而且「maskable 圖示」那一列是「有」。',
    hints: [
      '先讀檢查器列出的三個問題，它們各自對應一個成員。每張圖示是 `icons` 陣列裡的一個物件，物件之間用逗號分開，最後一個後面不加。',
      '圖示物件的四個鍵：`src`（圖檔的位置）、`sizes`（寫成 `寬x高`，中間是英文字母 x）、`type`（PNG 是 `image/png`）、`purpose`（沒寫就是 `any`）。',
      '第三張寫成 `{ "src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }`；前兩張不要加 `purpose`。',
    ],
    explanation: '圖示下方的空間很小，所以另外給一個短的 `short_name`。192 與 512 兩張沒寫 `purpose`，用途就是預設的 `any`：不裁切的地方都用它們；`type` 讓瀏覽器不必下載就知道這是它看得懂的 PNG。maskable 圖示是另一張圖：背景鋪滿、主體留在中央的安全區，給會把圖示裁成圓形或圓角方形的系統使用。兩種用途各有一張，哪一種場合都拿得到合適的圖。',
    viewport: PHONE,
    fixed: { html: INSPECTOR_HTML, css: INSPECTOR_CSS },
    starter: {
      js: manifestJs([], [
        FULL_NAME, '  "short_name": "小島外送：海鮮便當送到你家",', START_MENU, STANDALONE, ...COLORS,
        '  "icons": [', '    { "src": "icons/icon-192.png", "sizes": "192x192" }', '  ]',
      ]),
    },
    solution: {
      js: manifestJs([], [FULL_NAME, SHORT_NAME, START_MENU, STANDALONE, ...COLORS, '  "icons": [', `${ICON_192},`, `${ICON_512},`, ...ICON_MASKABLE, '  ]']),
    },
    steps: [
      { check: 'count', selector: '#problems li', count: 0, label: '檢查器沒有列出任何問題' },
      { check: 'text', selector: '#card-name', text: '小島外送', label: '安裝預覽的「圖示下方的名稱」是小島外送' },
      { check: 'text', selector: '#card-icons', text: '512x512', match: 'includes', label: '「圖示」那一列有 512x512 的圖示' },
      { check: 'text', selector: '#card-maskable', text: '有', label: '「maskable 圖示」那一列是「有」' },
    ],
    mistakes: [
      {
        files: {
          js: manifestJs([], [
            FULL_NAME, SHORT_NAME, START_MENU, STANDALONE, ...COLORS, '  "icons": [',
            '    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },',
            '    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }',
            '  ]',
          ]),
        },
        why: '沒有另外加一張，而是把原本的兩張都標成 maskable。只標 maskable 的圖示只會用在要裁切的場合：不裁切的地方（用途 `any`）就沒有圖示可用了，而且一般的圖示沒有留邊，被裁切時主體會缺角。',
      },
      {
        files: {
          js: manifestJs([], [
            FULL_NAME, SHORT_NAME, START_MENU, STANDALONE, ...COLORS, '  "icons": [', `${ICON_192},`,
            '    { "src": "icons/icon-512.png", "sizes": "512", "type": "image/png" },', ...ICON_MASKABLE, '  ]',
          ]),
        },
        why: '把尺寸寫成 `"512"`。`sizes` 的格式是「寬x高」，例如 `512x512`；只寫一個數字，瀏覽器認不出這張圖是多大，就不會把它當成 512 × 512 的圖示。',
      },
    ],
  },
  {
    id: 'mob08-x-full', title: '從需求寫出完整的 Manifest',
    statement: 'index.html 與 style.css 不能改。小島外送的網站是 `https://food.example`，Manifest 放在網站的根目錄。script.js 的 `manifestText` 只寫了完整名稱，請依下面的需求把它寫完整。（一）圖示下方顯示「小島外送」。（二）從主畫面開啟時要到菜單頁 `https://food.example/menu/`，而不是使用者安裝時剛好在看的那一頁。（三）開啟後是像一般 App 的獨立視窗：沒有瀏覽器的網址列，保留系統的狀態列。（四）啟動畫面的背景色是白色 `#ffffff`，主題色是 `#d35400`。（五）圖示有兩張 PNG：`icons/icon-192.png`（192 × 192）與 `icons/icon-512.png`（512 × 512）。檢查看的是檢查器的結果：問題清單是空的；安裝預覽的名稱、開啟的網址、顯示模式、上方色條（主題色）與中間色塊（背景色）都符合需求。',
    hints: [
      '每一項需求對應一個成員：短名稱、開啟的網址、顯示模式、兩個顏色、圖示清單。寫完一項就按「執行」，看檢查器少了哪一個問題。',
      '成員的名稱是 `short_name`、`start_url`、`display`、`background_color`、`theme_color`、`icons`。`start_url` 是相對於 Manifest 的網址解析的：Manifest 在根目錄，菜單頁在 `/menu/`。',
      '`"start_url": "/menu/"`、`"display": "standalone"`；顏色照題目寫成 `"#ffffff"` 與 `"#d35400"`（要有 `#`）；兩張圖示各寫 `src`、`sizes`（`192x192`、`512x512`）與 `"type": "image/png"`。',
    ],
    explanation: '`short_name` 給圖示下方用；`start_url` 固定了每次開啟的入口，寫 `/menu/` 或完整網址都會解析成同一頁；`standalone` 是沒有瀏覽器介面、但保留系統狀態列的視窗；`background_color` 在頁面畫出來之前鋪滿啟動畫面，所以和頁面的背景同色，`theme_color` 則交給系統去染狀態列這類介面；兩張 PNG 圖示提供常見的最低要求 192 與 512。這六個成員加上 `name`，就是一份可以交給瀏覽器的 Manifest；真正的專案還會再加上一張 maskable 圖示。',
    viewport: PHONE,
    fixed: { html: INSPECTOR_HTML, css: INSPECTOR_CSS },
    starter: {
      js: manifestJs(['// 依照題目的需求，把小島外送的 Manifest 寫完整'], ['  "name": "小島外送：海鮮便當送到你家"']),
    },
    solution: {
      js: manifestJs([], [FULL_NAME, SHORT_NAME, START_MENU, STANDALONE, ...COLORS, '  "icons": [', `${ICON_192},`, ICON_512, '  ]']),
    },
    steps: [
      { check: 'count', selector: '#problems li', count: 0, label: '檢查器沒有列出任何問題' },
      { check: 'text', selector: '#card-name', text: '小島外送', label: '「圖示下方的名稱」是小島外送' },
      { check: 'text', selector: '#card-start', text: 'https://food.example/menu/', label: '「開啟的網址」是菜單頁的完整網址' },
      { check: 'text', selector: '#card-display', text: 'standalone', label: '「顯示模式」是獨立視窗的那個值' },
      { check: 'style', selector: '#card-bar', property: 'background-color', value: '#d35400', label: '安裝預覽上方的色條是主題色 #d35400' },
      { check: 'style', selector: '#card-splash', property: 'background-color', value: '#ffffff', label: '安裝預覽中間的色塊是啟動畫面的背景色：白色' },
    ],
    mistakes: [
      {
        files: {
          js: manifestJs([], [FULL_NAME, SHORT_NAME, START_MENU, STANDALONE, '  "background_color": "ffffff",', '  "theme_color": "d35400",', '  "icons": [', `${ICON_192},`, ICON_512, '  ]']),
        },
        why: '顏色少了開頭的 `#`。Manifest 的顏色要寫成合法的 CSS 顏色：`ffffff` 不是，瀏覽器會忽略這個成員，啟動畫面與狀態列就用不到你指定的顏色。',
      },
      {
        files: {
          js: manifestJs([], [FULL_NAME, SHORT_NAME, '  "start_url": ".",', STANDALONE, ...COLORS, '  "icons": [', `${ICON_192},`, ICON_512, '  ]']),
        },
        why: '把 `start_url` 寫成 `"."`。它代表 Manifest 所在的資料夾，在這裡是網站的首頁 `https://food.example/`，不是題目要的菜單頁。',
      },
    ],
  },
];

export const MOB08: LessonContent = {
  lessonId: 'MOB08',
  motivation: '使用者不必上應用程式商店，就能把你的網站放到手機主畫面：點圖示開啟、有自己的視窗。前提是網站交得出一份正確的 Web App Manifest。這一課寫出這份設定檔、準備各尺寸的圖示、選擇顯示模式，並學會在瀏覽器不肯提供安裝時，找出是哪一項沒做對。',
  sections: [
    {
      id: 'mob08-install', title: '把網站安裝到主畫面',
      blocks: [
        { type: 'p', text: '「原生、跨平台與 PWA 的選擇」那一課說過，漸進式網頁應用程式（PWA）是可以安裝的網站。對使用者來說，「安裝」是三件看得到的事：主畫面（或桌面、應用程式清單）多了一個有名稱的圖示；點它開啟時可以是自己的視窗，沒有瀏覽器的網址列與分頁；切換應用程式時，它和其他 App 並排，而不是瀏覽器裡的一個分頁。裡面的內容沒有變：同一個網址、同一份 HTML、CSS 與 JavaScript。' },
        { type: 'p', text: '要做到這三件事，瀏覽器得先知道這個 App 叫什麼、圖示是哪一張、點開時要載入哪個網址、視窗長什麼樣子。這些答案寫在一個獨立的設定檔裡，叫做 Web App Manifest；每一個頁面的 `<head>` 用 `<link rel="manifest" href="manifest.webmanifest">` 連到它。檔名可以自己取，`.webmanifest` 是規格建議的副檔名，`manifest.json` 也很常見。同一個 `<head>` 裡通常還有一行 `<meta name="theme-color" content="#d35400">`：它宣告這一頁的主題色，支援的瀏覽器會用它來染工具列或狀態列，網站還沒被安裝、開在一般分頁裡的時候就有效。' },
        { type: 'example', id: 'mob08-ex-head' },
        { type: 'p', text: '看預覽下方的 DOM 樹：三行都在 `head` 裡。頁面上列出的是指令稿讀到的連結與主題色，最上面那條色塊代替瀏覽器的工具列；在編輯器裡把 `content` 改成別的顏色再執行，色塊跟著變。第三行 `rel="apple-touch-icon"` 是 Manifest 出現之前的做法：有些平台把網站加到主畫面時仍然讀這個連結當圖示，所以習慣上和 Manifest 一起保留。預覽沒有網路，也不是一個獨立的網站，不會真的去下載 manifest.webmanifest；下一節用另一種方式讓你看到瀏覽器怎麼讀它。' },
        { type: 'p', text: '有了 Manifest，瀏覽器什麼時候才願意提供安裝？這就是安裝條件，共同的基礎有兩項，其餘由各瀏覽器自己決定：' },
        { type: 'list', items: [
          '網站用 HTTPS 提供（在自己電腦上開發時，`localhost` 是例外）。',
          '頁面連到一份讀得懂的 Manifest，裡面有瀏覽器需要的內容：名稱、圖示、開啟的網址與顯示模式（接下來幾節）。',
          '瀏覽器自己的條件：有的還要求網站註冊了 service worker（「Service Worker 與離線」那一課），有的要求使用者先和網站互動過。安裝的入口也不一樣：可能是網址列上的按鈕，可能在瀏覽器選單或分享選單裡的「安裝」或「加入主畫面」。',
        ] },
        { type: 'p', text: '第三項各瀏覽器不同，也會隨版本改變，所以不要背某一個瀏覽器的清單：查它目前的文件，並且在真正的裝置上試。有些瀏覽器另外提供一個非標準的 `beforeinstallprompt` 事件，讓頁面自己決定什麼時候顯示安裝提示；它不是標準的一部分，不能假設它存在。' },
        { type: 'callout', tone: 'warning', title: '只在首頁連結 Manifest', text: '瀏覽器看的是「目前這一頁」的 `<head>`。只有首頁放了 `<link rel="manifest">`，顧客在菜單頁或訂單頁想安裝時，對瀏覽器來說那一頁根本沒有 Manifest，也就沒有安裝可言。這一行和主題色要放在所有頁面共用的 `<head>` 裡，每一頁都連到同一份 Manifest。' },
      ],
    },
    {
      id: 'mob08-manifest', title: 'Manifest 的成員',
      blocks: [
        { type: 'p', text: 'Web App Manifest 是一個 JSON 檔（「fetch、JSON 與 API」那一課用過這個格式）：最外層是一個物件，裡面每一個鍵稱為一個成員（member）。先看小島外送的 Manifest，以及這一課用來讀它的工具。' },
        { type: 'callout', tone: 'note', title: '這一課的頁面怎麼運作', text: '預覽裝不了任何東西，頁面也只有 index.html、style.css 與 script.js 三個檔案，沒有地方放 manifest.webmanifest。所以這一課把 Manifest 的內容寫成 script.js 裡的一段文字 `manifestText`，再由 index.html 下半部一段固定的指令稿去讀它：這段指令稿就是「檢查器」。它和瀏覽器一樣，先把文字當成 JSON 解析（用的是 `JSON.parse`），再照這一課教的規則逐條檢查，最後把問題列出來，並畫出一張「安裝預覽」。它是這門課的替身：在真正的網站上，做這件事的是瀏覽器自己，結果要到開發者工具的 Application 面板去看（下一節）。檢查器的程式不長，而且你讀得懂：每一條規則都寫在註解裡。' },
        { type: 'example', id: 'mob08-ex-manifest' },
        { type: 'p', text: '安裝預覽由上到下：色條是 `theme_color`，中間的色塊是 `background_color`，裡面的方塊代替圖示，下面幾列是檢查器讀到的名稱、顯示模式、開啟的網址與圖示。試著把 `"short_name"` 那一行整行刪掉再執行：圖示下方改用比較長的 `name`。各個成員控制的事情如下：' },
        { type: 'table', head: ['成員', '控制什麼', '注意'], rows: [
          ['`name`', '完整的名稱：安裝的確認畫面、應用程式清單、啟動畫面', '和 `short_name` 至少要有一個'],
          ['`short_name`', '空間不夠時用的短名稱，最常見的是主畫面圖示的下方', '越短越好，太長會被截斷'],
          ['`start_url`', '從圖示開啟時載入的網址', '相對於 Manifest 檔案的網址；必須和網站同一個來源'],
          ['`scope`', '哪些網址算是這個 App 的範圍', '沒寫時，是 `start_url` 所在的資料夾'],
          ['`display`', '顯示模式：視窗保留多少瀏覽器的介面', '四個值之一，預設是 `browser`'],
          ['`background_color`', '啟動畫面的背景色，頁面的樣式還沒載入時先鋪上', '和頁面 CSS 的背景色寫成一樣'],
          ['`theme_color`', '這個 App 的主題色，系統可能用來染狀態列、標題列', '個別頁面的 `<meta name="theme-color">` 可以換掉它'],
          ['`icons`', '圖示的清單', '下下節'],
        ] },
        { type: 'p', text: '`start_url` 最值得想清楚。沒寫的話，App 會從使用者安裝當下所在的那一頁開啟：他如果是在某一張訂單的頁面按下安裝，以後每次點圖示，都回到那張舊訂單。寫了 `start_url`，入口就固定了。它可以寫相對網址，相對的對象是 Manifest 檔案自己的網址，不是目前的頁面：小島外送的 Manifest 在 `https://food.example/manifest.webmanifest`，`"/menu/"` 與 `"menu/"` 都解析成 `https://food.example/menu/`；如果 Manifest 放在 `/app/` 資料夾裡，`"menu/"` 就會變成 `/app/menu/`。安裝預覽的「開啟的網址」顯示的是解析之後的結果，改改看就知道。圖示的 `src` 也是同樣的規則。' },
        { type: 'p', text: '`scope` 劃出 App 的範圍：在範圍裡的頁面留在 App 的視窗中，連到範圍外的網址時，瀏覽器會換一種方式顯示（例如加上網址列，或改用瀏覽器開啟）；`start_url` 必須落在範圍裡。其他成員先認得名字就好：`lang` 與 `dir` 說明名稱這些文字用的語言與書寫方向，`description` 是一段介紹用的文字，`id` 是這個 App 的身分，讓瀏覽器在你日後更改 `start_url` 時仍然認得它是同一個 App。' },
        { type: 'p', text: '瀏覽器讀 Manifest 時很寬容：不認得的成員、型別不對或值不合法的成員，都只是被忽略，改用預設值，頁面上不會出現任何錯誤。所以打錯字的後果是「靜靜地沒有效果」。檢查器故意比瀏覽器嚴格，把這些情況都列成問題；瀏覽器決定能不能安裝時最常看的名稱、`start_url`、`display` 與圖示，它也一律當成必填。它的規則只有六條，就是這一課要你養成的檢查習慣：' },
        { type: 'list', ordered: true, items: [
          '文字必須是合法的 JSON，而且最外層是一個物件；否則只回報這一個問題，後面的規則都不看了。',
          '`name` 與 `short_name` 至少要有一個；`short_name` 不超過 12 個字元。規格沒有規定長度，12 是這門課採用的上限：實際放得下幾個字，要看裝置與字型。',
          '要有 `start_url`，而且解析之後和網站同一個來源。',
          '`display` 必須是 `fullscreen`、`standalone`、`minimal-ui`、`browser` 其中之一。',
          '`icons` 裡要有 192x192 與 512x512 的 PNG 圖示各一張：`type` 是 `image/png`，用途包含 `any`。',
          '`background_color` 與 `theme_color` 有寫的話，必須是合法的 CSS 顏色，例如 `#d35400`、`rgb(211, 84, 0)` 或 `white`。',
        ] },
      ],
    },
    {
      id: 'mob08-json', title: 'JSON 的陷阱與 Application 面板',
      blocks: [
        { type: 'p', text: 'Manifest 最常見的問題不是內容，而是語法。JSON 看起來像 JavaScript 的物件，規則卻嚴格得多；習慣寫 JavaScript 的人，很容易把下面四種寫法帶進來：' },
        { type: 'table', head: ['寫法', '在 JavaScript 的物件裡', '在 JSON 裡'], rows: [
          ['最後一項後面的逗號：`"display": "standalone", }`', '可以', '不行'],
          ['註解：`// 這是圖示`', '可以', '不行，JSON 沒有註解'],
          ['單引號：`\'name\': \'小島外送\'`', '可以', '不行，鍵與字串都只能用雙引號'],
          ['沒有引號的鍵：`name: "小島外送"`', '可以', '不行'],
        ] },
        { type: 'p', text: '只要犯了其中一個，整份文字就不是合法的 JSON。後果不是「那一行沒效果」，而是整份 Manifest 都不會被採用：名稱、圖示、顯示模式一個都讀不到。偏偏頁面本身完全正常，照樣顯示、照樣能用，沒有任何錯誤畫面；最明顯的症狀只有一個：瀏覽器不提供安裝。' },
        { type: 'example', id: 'mob08-ex-broken' },
        { type: 'p', text: '檢查器只列出一個問題，安裝預覽裡什麼都沒有：`short_name`、`display` 明明寫得好好的，卻一個也沒被讀到。在編輯器裡刪掉註解那一行再執行：解析成功了，檢查器這才看得到內容，名稱、顯示模式與開啟的網址都出現了，同時也列出原本被擋在後面的問題：少了 512x512 的圖示。修 Manifest 的順序永遠是這樣：先讓它解析得過，再看內容。' },
        { type: 'p', text: '在真正的網站上，瀏覽器不會把這些問題寫在頁面上，要到開發者工具裡看。有 Application（應用程式）面板的瀏覽器，面板裡有一個 Manifest 區塊：它列出瀏覽器實際讀到的名稱、`start_url`、顏色與每一張圖示的預覽，解析失敗或成員有問題時，警告與錯誤也顯示在那裡。不是每個瀏覽器的開發者工具都有這個面板，內容也不盡相同；找不到時，至少把 Manifest 的網址直接貼到網址列，確認伺服器真的送出了這個檔案，再把內容交給編輯器或任何 JSON 檢查工具驗證語法。' },
        { type: 'callout', tone: 'warning', title: '把 JavaScript 的物件直接貼成 Manifest', text: '在指令稿裡寫慣了 `{ name: \'小島外送\', }`，複製到 manifest.webmanifest 就是三個錯：鍵沒有引號、字串用單引號、最後多一個逗號。編輯器的自動排版工具也常替 JavaScript 補上結尾的逗號；Manifest 要存成 JSON 檔，讓編輯器用 JSON 的規則檢查它。' },
        { type: 'callout', tone: 'tip', title: '反引號只是這一課的包裝', text: '練習裡的 `const manifestText = ` 與前後兩個反引號，只是為了把好幾行文字放進 script.js。真正的 manifest.webmanifest 只有從 `{` 到 `}` 的那一段，前後什麼都沒有。修改時不要刪掉反引號：少了它，script.js 本身就有語法錯誤，`manifestText` 根本不存在。這時檢查器拿到的是空的文字，同樣回報「不是合法的 JSON」，主控台則會出現 script.js 的錯誤。' },
      ],
    },
    {
      id: 'mob08-icons', title: '圖示與啟動畫面',
      blocks: [
        { type: 'p', text: '`icons` 是一個陣列，每一項描述一張圖檔。瀏覽器依照當下的需要（主畫面的圖示、安裝的確認畫面、啟動畫面），從清單裡挑合適的圖來用，所以清單要寫清楚每一張圖是什麼：' },
        { type: 'table', head: ['鍵', '是什麼', '例子'], rows: [
          ['`src`', '圖檔的網址，相對於 Manifest 檔案', '`"icons/icon-192.png"`'],
          ['`sizes`', '圖的像素大小，寫成「寬x高」，中間是英文字母 x', '`"192x192"`'],
          ['`type`', '圖檔的媒體類型：瀏覽器不必下載，就能跳過它看不懂的格式', '`"image/png"`'],
          ['`purpose`', '用途：`any`（預設，一般的圖示）、`maskable`（可以被裁切）、`monochrome`（單色）', '`"maskable"`'],
        ] },
        { type: 'p', text: '尺寸方面，192 × 192 與 512 × 512 的 PNG 是常見的最低要求：小的那張通常用在主畫面與應用程式清單，大的那張用在需要大圖的地方，例如安裝的確認畫面與啟動畫面。啟動畫面（splash screen）是點下圖示之後、頁面畫出來之前，暫時顯示的那個畫面。有些平台用 Manifest 的 `name`、`background_color` 和一張圖示自動組成它，另一些平台有自己的做法；所以 `background_color` 要和頁面的背景同色，從啟動畫面換到頁面時才不會閃一下。檢查器的安裝預覽裡，中間那個色塊模擬的就是啟動畫面。' },
        { type: 'p', text: '許多手機的主畫面不直接顯示你的圖，而是把它裁成系統自己的形狀：圓形、圓角方形或其他形狀，每個裝置不一樣。一般的圖示（用途 `any`）如果主體貼到邊緣，一裁就缺角；有些系統為了避免這件事，會把它縮小再放進一塊底色裡，看起來又小又不協調。`"purpose": "maskable"` 是你給系統的承諾：這張圖的背景鋪滿整個畫面，可以放心裁；重要的內容都在中央的安全區（safe zone）裡。規格把安全區定義成以圖示中心為圓心、半徑是圖示邊長 40% 的圓：不管系統怎麼裁，這個圓裡面的東西一定看得到。這裡說的是一張圖示的中央，和「安全區域、方向與動態視窗高度」那一課螢幕邊緣的安全區域是兩回事。' },
        { type: 'example', id: 'mob08-ex-mask' },
        { type: 'p', text: '上排的圖示把框線畫到邊緣：不裁切時最完整，圓角方形裁掉了框的四個角，圓形只剩下斷開的四小段。下排的框線只有 52px 寬：96px 的圖示，安全區是半徑 38.4px 的圓，52px 的方形剛好放得進去，所以三種外框裡它都完整。代價是不裁切時主體看起來比較小，這就是為什麼兩種用途要各準備一張圖：一般的圖示讓主體盡量大，maskable 的那張留邊。把同一張圖同時標成 `"any maskable"` 是合法的寫法，但它不可能兩邊都好看。' },
        { type: 'callout', tone: 'warning', title: '把所有圖示都標成 maskable', text: '看到「maskable 比較新」就替每一張圖示加上 `"purpose": "maskable"`，會有兩個問題。第一，這些圖沒有留邊，裁切時主體照樣缺角：標記不會改變圖的內容。第二，只標 maskable 的圖示只用在要裁切的場合，不裁切的地方就沒有圖示可用。清單裡要保留一般用途的 192 與 512，再另外加一張真的留了邊的 maskable 圖示。' },
      ],
    },
    {
      id: 'mob08-display', title: '顯示模式',
      blocks: [
        { type: 'p', text: '`display` 決定安裝後的視窗保留多少瀏覽器的介面，這就是顯示模式（display mode）。值只有四個：' },
        { type: 'table', head: ['值', '視窗的樣子', '適合'], rows: [
          ['`fullscreen`', '佔滿整個螢幕，沒有瀏覽器的介面，連系統的狀態列也蓋掉', '遊戲、影片這類需要整個畫面的內容'],
          ['`standalone`', '像一般 App 的獨立視窗：沒有網址列與分頁，系統的狀態列還在', '大多數的應用'],
          ['`minimal-ui`', '和 standalone 類似，但保留最少的瀏覽器控制項（例如返回、重新整理），實際有哪些由瀏覽器決定', '需要瀏覽器導覽按鈕的網站'],
          ['`browser`', '一般的瀏覽器分頁或視窗，這是預設值', '不需要 App 的外觀'],
        ] },
        { type: 'p', text: '平台不支援你寫的模式時，會依序退到下一個：`fullscreen` 退到 `standalone`，再退到 `minimal-ui`，最後是 `browser`。寫了四個值以外的字（例如 `"full"`）則是直接被忽略，等於沒寫，回到預設的 `browser`。' },
        { type: 'p', text: '`standalone` 與 `fullscreen` 拿掉了網址列，也拿掉了瀏覽器的返回按鈕。在分頁裡靠瀏覽器按鈕回上一頁的網站，安裝之後就得自己提供返回的方法。CSS 可以用媒體特徵 `display-mode` 問「這個視窗現在是哪一種顯示模式」，寫法和「Media Query 與斷點策略」那一課的媒體查詢一樣；JavaScript 則用 `window.matchMedia(\'(display-mode: standalone)\').matches` 得到 `true` 或 `false`。' },
        { type: 'example', id: 'mob08-ex-display' },
        { type: 'p', text: '預覽裡的頁面，顯示模式跟著你用來開這門課的視窗走：在一般的瀏覽器分頁裡是 `browser`，所以返回按鈕沒有出現，「顯示模式」那一行寫的也是 browser。要親眼看到按鈕，得把這段 CSS 放進一個真的能安裝的網站，安裝後從圖示開啟。檢查也沒辦法替頁面切換顯示模式，所以這一課的練習不檢查這條媒體查詢：它要在真正安裝之後測試。' },
        { type: 'p', text: '`display-mode` 問的是視窗實際的模式，不是 Manifest 裡寫的值。Manifest 寫了 `standalone`，但使用者沒有安裝、只是在分頁裡打開網站，成立的仍然是 `(display-mode: browser)`；Manifest 寫了 `fullscreen` 而平台退到 `standalone`，成立的就是 `standalone`。所以用它調整畫面是可靠的；自己去讀 Manifest 的 `display` 來判斷則不是。' },
        { type: 'callout', tone: 'warning', title: '安裝之後才發現回不去', text: '開發時一直在瀏覽器分頁裡測試，每一頁都靠瀏覽器的返回按鈕回上一頁，一切正常。安裝成 `standalone` 之後，使用者走進訂單明細就卡住了：畫面上沒有任何可以返回的東西（不是每一種裝置都有系統的返回手勢）。每一個不是入口的頁面，都要有頁面自己的導覽：返回按鈕、分頁列，或回首頁的連結。' },
      ],
    },
    {
      id: 'mob08-checklist', title: '安裝條件的檢查表',
      blocks: [
        { type: 'p', text: '瀏覽器不提供安裝時，它不會告訴使用者原因，只是安靜地什麼都不顯示。所以要自己由外而內檢查：先確認檔案送得到，再確認解析得過，最後才看內容。常見的症狀與原因：' },
        { type: 'table', head: ['症狀', '最可能的原因', '修正'], rows: [
          ['首頁可以安裝，其他頁不行', '只有首頁的 `<head>` 連結了 Manifest', '每一頁都放 `<link rel="manifest">`'],
          ['開發者工具完全沒有 Manifest 的內容', '`<link>` 的 `rel` 或 `href` 寫錯，或檔案的路徑不對', '直接開啟 Manifest 的網址，確認伺服器送得出來'],
          ['有檔案，但所有成員都是空的', '不是合法的 JSON：結尾的逗號、註解、單引號', '用 JSON 的規則檢查語法'],
          ['安裝後開起來仍然像瀏覽器分頁', '`display` 沒寫或寫錯，回到預設的 `browser`', '改成四個值之一，通常是 `standalone`'],
          ['每次開啟都回到某一頁舊內容', '沒寫 `start_url`，App 從安裝時所在的那一頁開啟', '寫出固定的入口'],
          ['圖示在主畫面上缺角，或縮得很小', '沒有提供 maskable 圖示，或標成 maskable 的圖沒有留邊', '另外準備一張主體在安全區裡的圖，標成 `maskable`'],
          ['啟動畫面閃一下才變成頁面的顏色', '`background_color` 和頁面的背景色不同', '兩邊寫成同一個顏色'],
        ] },
        { type: 'p', text: '發布之前，照這個順序走一遍：' },
        { type: 'list', ordered: true, items: [
          '網站用 HTTPS 提供。',
          '每一個頁面的 `<head>` 都有 Manifest 的連結與 `theme-color`。',
          'Manifest 是合法的 JSON；開發者工具的 Application 面板讀得到它，沒有警告。',
          '`name`、`short_name`、`start_url`、`display` 都寫了，值也正確。',
          '圖示至少有 192 × 192 與 512 × 512 的 PNG，另外有一張 maskable 圖示；`background_color` 與頁面背景同色。',
          '安裝後的視窗裡，每一頁都有自己的返回或導覽方式。',
          '在真正的手機上、用不只一種瀏覽器實際安裝一次，從圖示開啟，再把它移除。',
        ] },
        { type: 'p', text: '最後一項不能省。這一課一再說「各瀏覽器不同」：安裝條件、安裝的入口、啟動畫面怎麼組成、圖示怎麼裁，都只有在真實的裝置上才看得到。已經安裝的 App 也不一定會在你修改 Manifest 之後立刻更新，各瀏覽器的時機不同；測試時，改完先移除再重新安裝，看到的才是新的設定。另外，Manifest 只讓網站「裝得起來」：沒有網路時還能不能開啟，是下一課「Service Worker 與離線」的主題。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob08-q1', prompt: '小島外送只在首頁的 `<head>` 放了 Manifest 的連結。一位顧客在「訂單狀態」頁想把網站安裝到主畫面，瀏覽器卻沒有提供安裝。最可能的原因是什麼？',
      options: [
        'Manifest 只需要連結一次，所以問題一定出在圖示的尺寸太小',
        '訂單狀態頁的網址比首頁長，超過了 `scope` 允許的長度',
        '瀏覽器看的是目前這一頁的 `<head>`：訂單狀態頁沒有 `<link rel="manifest">`，對它來說這一頁沒有 Manifest',
        '顧客必須先回到首頁停留一段時間，瀏覽器才會把 Manifest 套用到整個網站',
      ],
      answer: 2,
      explanation: '瀏覽器是從目前顯示的這份文件的 `<head>` 找 `rel="manifest"` 的 `<link>`。首頁的連結不會自動套用到其他頁面，在首頁停留多久也一樣，所以這一行要放在每一頁共用的 `<head>` 裡。`scope` 劃的是哪些網址屬於這個 App，和網址的長度無關；圖示的尺寸則是連結存在、Manifest 讀得到之後才會被檢查的事。',
    },
    {
      id: 'mob08-q2', prompt: '網站的 manifest.webmanifest 內容如下。頁面本身一切正常，瀏覽器卻讀不到任何一個成員。原因是什麼？',
      code: { language: 'JavaScript', text: '{\n  "name": "小島外送",\n  "start_url": "/menu/",\n  "display": "standalone",\n}' },
      options: [
        '`"standalone"` 後面多了一個逗號：這不是合法的 JSON，整份 Manifest 都不會被採用',
        '`start_url` 不能用 `/` 開頭，必須寫出包含網域名稱的完整網址',
        '`display` 的值寫錯了，獨立視窗應該寫成 `"app"`',
        '成員的順序不對：`display` 必須寫在 `start_url` 的前面',
      ],
      answer: 0,
      explanation: 'JSON 不允許最後一項後面再有逗號。這在 JavaScript 的物件裡是合法的，所以很容易順手帶進來；但 JSON 解析一失敗，受影響的不是那一行，而是整份文字，因此所有成員都讀不到。`"/menu/"` 是合法的相對網址，會相對於 Manifest 的網址解析；`standalone` 正是四個顯示模式之一，沒有 `app` 這個值；JSON 物件的成員也沒有先後順序的規定。',
    },
    {
      id: 'mob08-q3', prompt: 'Manifest 的網址是 `https://food.example/app/manifest.webmanifest`，裡面寫著 `"start_url": "menu/"`。使用者從主畫面的圖示開啟 App 時，載入的是哪一個網址？',
      options: [
        '`https://food.example/menu/`',
        '使用者按下安裝時所在的那一頁',
        '`https://food.example/app/manifest.webmanifest/menu/`',
        '`https://food.example/app/menu/`',
      ],
      answer: 3,
      explanation: '`start_url` 的相對網址是相對於 Manifest 檔案自己的網址解析的，規則和 HTML 裡的相對連結一樣：去掉檔名 manifest.webmanifest，留下資料夾 `/app/`，再接上 `menu/`。想得到 `https://food.example/menu/`，要寫成以 `/` 開頭的 `"/menu/"`。「安裝時所在的那一頁」是完全沒寫 `start_url` 時的結果；檔名不是資料夾，不會出現在解析後的網址裡。',
    },
    {
      id: 'mob08-q4', prompt: 'Manifest 是合法的 JSON，其中一行寫著 `"display": "full"`。瀏覽器會怎麼處理？',
      options: [
        '把 `full` 當成 `fullscreen` 的縮寫，以全螢幕開啟',
        '`full` 不是顯示模式的值，這個成員被忽略，顯示模式回到預設的 `browser`',
        '整份 Manifest 解析失敗，其他成員也跟著失效',
        '頁面的主控台出現未捕捉的錯誤，頁面的指令稿停止執行',
      ],
      answer: 1,
      explanation: '`display` 只接受 `fullscreen`、`standalone`、`minimal-ui`、`browser` 四個值，瀏覽器不會猜測縮寫。遇到不認得的值，它只忽略這一個成員並改用預設的 `browser`，所以安裝後開起來仍然像瀏覽器分頁。這和語法錯誤不同：文字仍然是合法的 JSON，其他成員照常生效。Manifest 的問題也不會變成頁面指令稿的錯誤，頁面照常執行；這正是這類錯誤難發現的原因。',
    },
    {
      id: 'mob08-q5', prompt: '小島外送希望安裝後的視窗沒有瀏覽器的網址列，看起來像一般的 App，但手機最上方的時間與電量仍然看得到。`display` 應該寫哪一個值？',
      options: [
        '`browser`',
        '`minimal-ui`',
        '`fullscreen`',
        '`standalone`',
      ],
      answer: 3,
      explanation: '`standalone` 是像一般 App 的獨立視窗：沒有瀏覽器的網址列與分頁，系統的狀態列（時間、電量）還在。`fullscreen` 連狀態列都蓋掉，適合遊戲與影片，不符合「仍然看得到時間與電量」。`minimal-ui` 會保留最少的瀏覽器控制項，視窗裡仍有瀏覽器的介面。`browser` 是預設值，就是一般的瀏覽器分頁。',
    },
    {
      id: 'mob08-q6', prompt: '要替 Manifest 準備一張 `"purpose": "maskable"` 的圖示。這張圖應該怎麼畫？',
      options: [
        '背景鋪滿整張圖，商標等重要內容留在中央的安全區裡，因為系統會把外圍裁成自己的形狀',
        '背景透明，商標盡量放大到貼齊四邊，系統才有足夠的內容可以裁',
        '只用單一顏色畫出輪廓，其餘留白，因為系統會替它上色',
        '和一般的圖示用同一張就好，`purpose` 只是給開發者看的註記',
      ],
      answer: 0,
      explanation: 'maskable 的意思是「這張圖可以被裁切」：系統會把它裁成圓形、圓角方形等自己的形狀，所以背景要鋪滿，重要的內容要留在中央的安全區，裁完才不會缺角。商標貼齊四邊正好相反，一裁就少一塊。單色輪廓描述的是另一種用途 `monochrome`。`purpose` 也不是註記：瀏覽器真的會依它決定哪一張圖用在要裁切的場合，沒有留邊的一般圖示標成 maskable，只會被裁壞。',
    },
    {
      id: 'mob08-q7', prompt: '安裝後的獨立視窗沒有瀏覽器的返回按鈕，所以頁面想在「以獨立視窗開啟」時顯示自己的返回按鈕 `#back`（平常是 `display: none`）。哪一種做法是對的？',
      options: [
        '在 Manifest 加上 `"back_button": true`，瀏覽器就會自動產生返回按鈕',
        '`@media (min-width: standalone) { #back { display: inline-block; } }`',
        '`@media (display-mode: standalone) { #back { display: inline-block; } }`',
        '在指令稿裡用 `fetch` 讀回 Manifest，只要它的 `display` 寫的是 `standalone`，就顯示按鈕',
      ],
      answer: 2,
      explanation: '媒體特徵 `display-mode` 問的是這個視窗實際的顯示模式，只有真的以獨立視窗開啟時才成立。Manifest 沒有 `back_button` 這個成員，不認得的成員只會被忽略。`min-width` 比的是視窗的寬度，後面要接長度，不能接顯示模式。讀 Manifest 的 `display` 則會判斷錯：同一個網站在瀏覽器分頁裡打開時，Manifest 寫的仍然是 `standalone`，這時瀏覽器明明有返回按鈕，頁面卻又多畫一顆。',
    },
    {
      id: 'mob08-q8', prompt: '關於安裝條件，哪一個說法是正確的？',
      options: [
        '只要 Manifest 是合法的 JSON，所有瀏覽器都會立刻跳出安裝提示',
        '用 HTTPS 提供、每一頁都連到內容完整的 Manifest 是共同的基礎；其餘條件與安裝的入口各瀏覽器不同，要在真實的裝置上測試',
        '網站必須先在應用程式商店上架，瀏覽器才允許安裝',
        '有了 `beforeinstallprompt` 事件，頁面就能在任何瀏覽器上自己顯示安裝提示',
      ],
      answer: 1,
      explanation: '安裝與否由瀏覽器決定：HTTPS 與一份內容完整的 Manifest 是共同的基礎，此外有的瀏覽器還要求 service worker 或使用者的互動，入口也可能在網址列、選單或分享選單，所以只能查各瀏覽器目前的文件並實際測試。合法的 JSON 只是第一步，內容不足時照樣不能安裝，瀏覽器也不保證主動跳出提示。PWA 的特點正是不必經過商店。`beforeinstallprompt` 是部分瀏覽器才有的非標準事件，不能假設它存在。',
    },
  ],
  webCode: { examples, exercises },
};
