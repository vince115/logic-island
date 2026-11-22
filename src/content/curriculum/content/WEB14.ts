import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB14 Web performance basics (WEB-5). Why speed is something a user feels, the three Core Web Vitals (LCP, INP, CLS)
 * with the "good" thresholds the Web Vitals programme publishes (assessed at the 75th percentile), lab against field
 * measurement and how to run the tools, the critical rendering path (render-blocking CSS, parser-blocking scripts),
 * resource loading (defer/async, image dimensions, loading="lazy", preload and fetchpriority in two sentences), layout
 * shift and reserved space, responsiveness (less work in handlers, work in batches, layout thrashing), and a worked
 * plan of three improvements. The preview has no network and a check's clock is virtual, so nothing here is a
 * measurement: the pages show the ORDER in which things happen (console order, script placement), what exists at a
 * moment on the virtual clock, and layout shift as the difference in a box's position before and after late content
 * arrives. Every `observe` fact and every exercise (solution, starter, mistakes, variant) is run in Chromium by the
 * tests. Names and data are made up.
 */

const lines = (...text: string[]) => text.join('\n');

/** A 300 × 150 drawing: the sun over the sea. */
const HERO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='150'%3E%3Crect width='300' height='150' fill='%23bbdefb'/%3E%3Ccircle cx='230' cy='48' r='22' fill='%23ffca28'/%3E%3Cpath d='M0 100q37-24 75 0t75 0 75 0 75 0v50H0z' fill='%231976d2'/%3E%3C/svg%3E";
/** A 300 × 200 floor plan with the exhibition corner marked. */
const MAP = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200'%3E%3Crect width='300' height='200' fill='%23eceff1'/%3E%3Crect x='20' y='20' width='260' height='160' fill='white' stroke='%23546e7a' stroke-width='3'/%3E%3Crect x='170' y='40' width='90' height='60' fill='%2390caf9'/%3E%3Ccircle cx='215' cy='70' r='8' fill='%23e53935'/%3E%3C/svg%3E";

const examples: WebExample[] = [
  {
    id: 'web14-vitals', title: '一個頁面，三個指標各看哪裡',
    description: '小島圖書館的書展頁：一張主題圖、一個「想看」按鈕，還有一則晚 600 毫秒才到、沒有預留位置的公告。',
    height: 380,
    files: {
      html: lines(
        `<img class="hero" src="${HERO}" alt="海面上的太陽與波浪" width="300" height="150">`,
        '<main>',
        '  <p id="intro">本月有 12 本海洋主題的新書，歡迎到二樓借閱。</p>',
        '  <p><button id="like" type="button">想看</button> <output id="likes">0</output> 人想看</p>',
        '</main>',
      ),
      css: lines(
        'body { margin: 0; font-family: sans-serif; }',
        '.hero { display: block; }',
        'main { padding: 16px; }',
        '#intro { margin: 0 0 12px; }',
        '.notice { box-sizing: border-box; height: 48px; margin: 0; padding: 12px 16px; background: #ffe082; }',
      ),
      js: lines(
        "const likes = document.querySelector('#likes');",
        "document.querySelector('#like').addEventListener('click', () => {",
        '  likes.textContent = Number(likes.textContent) + 1;',
        '});',
        '',
        '// 公告晚 600 毫秒才到，而且頁面沒有替它預留位置',
        'setTimeout(() => {',
        "  const notice = document.createElement('p');",
        "  notice.className = 'notice';",
        "  notice.textContent = '公告：本週六提早到 16:00 閉館';",
        "  document.querySelector('main').before(notice);",
        '}, 600);',
      ),
    },
    observe: [
      { check: 'box', selector: '.hero', measure: 'height', value: 150, label: '主題圖的盒子高 150px（寬 300px），是這一頁最大的一塊內容：在真實的網站上，LCP 記錄的就是這種元素畫出來的時刻' },
      { check: 'box', selector: '#intro', measure: 'top', value: 166, label: '公告還沒到時，介紹段落 `#intro` 的上緣在 166px（主題圖 150px＋`main` 的留白 16px）' },
      { do: 'click', selector: '#like' },
      { check: 'text', selector: '#likes', text: '1', label: '按一下「想看」，數字變成 1：從按下到畫面更新之間的延遲，就是 INP 量的東西' },
      { do: 'wait', ms: 600 },
      { check: 'count', selector: '.notice', count: 1, label: '600 毫秒後，公告 `.notice` 被插進主題圖與 `main` 之間' },
      { check: 'box', selector: '#intro', measure: 'top', value: 214, label: '同一個段落的上緣變成 214px：它被 48px 高的公告往下推，這種移動就是 CLS 計算的版面位移' },
    ],
  },
  {
    id: 'web14-blocking', title: '寫在 head 裡的指令稿先執行，內容後建立',
    description: 'index.html 在 `<head>` 裡用一般的 `<script>` 載入 script.js；`<body>` 的最後另有一段行內指令稿，回報 HTML 解析到哪裡了。',
    files: {
      html: lines(
        '<!DOCTYPE html>',
        '<html lang="zh-Hant">',
        '<head>',
        '  <meta charset="utf-8">',
        '  <title>小島圖書館</title>',
        '  <link rel="stylesheet" href="style.css">',
        '  <script src="script.js"></script>',
        '</head>',
        '<body>',
        '  <h1>小島圖書館</h1>',
        '  <p>今天開放到 17:00。</p>',
        '  <p>二樓有海洋主題書展。</p>',
        '  <script>',
        "    console.log('HTML 解析到 body 的結尾了');",
        '  </script>',
        '</body>',
        '</html>',
      ),
      css: lines(
        'body { margin: 16px; font-family: sans-serif; }',
        'h1 { color: #0d47a1; }',
      ),
      js: lines(
        '// 一份和顯示內容無關的統計指令稿',
        "const built = document.querySelectorAll('h1, p').length;",
        'console.log(`script.js 開始執行：頁面上已有 ${built} 個標題與段落`);',
      ),
    },
    observe: [
      { check: 'count', selector: 'head > script', count: 1, label: 'script.js 由 `head` 裡的 `<script>` 載入，排在 `body` 的所有內容之前' },
      { check: 'console', lines: ['script.js 開始執行：頁面上已有 0 個標題與段落', 'HTML 解析到 body 的結尾了'], label: '主控台的順序：script.js 先執行，而且那時頁面上一個標題或段落都還沒有；它執行完，瀏覽器才繼續解析到 `body` 的結尾' },
      { check: 'count', selector: 'h1, p', count: 3, label: '解析完成後，一個標題與兩個段落都在：指令稿沒有弄壞內容，只是讓內容晚一點才建立' },
      { check: 'style', selector: 'h1', property: 'color', value: '#0d47a1', label: '標題是深藍色：`head` 裡的樣式表已經套用在內容上' },
    ],
  },
  {
    id: 'web14-images', title: '圖片：先寫尺寸，下方的圖才延後載入',
    description: '書展頁有兩張圖：最上面的主題圖，和文章下方的位置圖；最後是一個替導覽影片預留的空位。',
    height: 320,
    files: {
      html: lines(
        '<h1>海洋主題書展</h1>',
        `<img id="hero" src="${HERO}" alt="海面上的太陽與波浪" width="300" height="150" fetchpriority="high">`,
        '<p>本月有 12 本海洋主題的新書，都放在二樓的書展區。</p>',
        '<p>借閱期限是三週，可以續借一次。</p>',
        '<p>每週六下午 2 點有海邊說故事活動。</p>',
        '<h2>怎麼走</h2>',
        `<img id="map" src="${MAP}" alt="二樓平面圖，書展區在右上角" width="300" height="200" loading="lazy">`,
        '<h2>導覽影片</h2>',
        '<div class="video-slot">影片準備中</div>',
      ),
      css: lines(
        'body { font-family: sans-serif; }',
        'img { display: block; max-width: 100%; height: auto; }',
        '.video-slot { width: 240px; aspect-ratio: 16 / 9; background: #cfd8dc; }',
      ),
    },
    observe: [
      { check: 'box', selector: '#hero', measure: 'height', value: 150, label: '主題圖寫了 `width="300"` 與 `height="150"`，盒子高 150px' },
      { check: 'count', selector: '#hero[loading="lazy"]', count: 0, label: '主題圖一進頁面就看得到，也是最大的內容，所以沒有 `loading="lazy"`' },
      { check: 'attr', selector: '#map', name: 'loading', value: 'lazy', label: '文章下方的位置圖有 `loading="lazy"`：捲到附近才需要載入' },
      { check: 'box', selector: '#map', measure: 'height', value: 200, label: '位置圖同樣寫了尺寸，盒子高 200px：延後載入的圖也要先佔好位置' },
      { check: 'box', selector: '.video-slot', measure: 'height', value: 135, label: '`.video-slot` 沒有寫高度：`aspect-ratio: 16 / 9` 讓 240px 寬的盒子高 135px，替之後才放進來的影片留好位置' },
    ],
  },
  {
    id: 'web14-shift', title: '同一張橫幅：左欄沒留位置，右欄預留 60px',
    description: '兩欄的 HTML 相同：標題、放橫幅的 `.slot`、一段文章。500 毫秒後，指令稿在兩欄的 `.slot` 裡各放進一張 60px 高的橫幅；只有右欄的 `.slot` 事先用 `min-height` 留了位置。',
    height: 230,
    files: {
      html: lines(
        '<section id="plain">',
        '  <h2>沒有預留</h2>',
        '  <div class="slot"></div>',
        '  <p class="story">潮汐的故事：海水每天漲退兩次。</p>',
        '</section>',
        '<section id="reserved">',
        '  <h2>預留 60px</h2>',
        '  <div class="slot"></div>',
        '  <p class="story">潮汐的故事：海水每天漲退兩次。</p>',
        '</section>',
      ),
      css: lines(
        'body { margin: 0; font-family: sans-serif; }',
        'section { display: inline-block; vertical-align: top; box-sizing: border-box; width: 48%; padding: 12px; }',
        'h2 { height: 32px; margin: 0; font-size: 16px; line-height: 32px; }',
        '.story { margin: 0; padding-top: 8px; }',
        '.banner { box-sizing: border-box; height: 60px; padding: 8px; background: #ffe082; }',
        '',
        '/* 唯一的差別：右欄先替橫幅留好 60px */',
        '#reserved .slot { min-height: 60px; background: #eceff1; }',
      ),
      js: lines(
        '// 500 毫秒後，兩欄各收到一張活動橫幅',
        'setTimeout(() => {',
        "  for (const slot of document.querySelectorAll('.slot')) {",
        "    const banner = document.createElement('div');",
        "    banner.className = 'banner';",
        "    banner.textContent = '週六說故事';",
        '    slot.append(banner);',
        '  }',
        "  console.log('橫幅到了');",
        '}, 500);',
      ),
    },
    observe: [
      { check: 'box', selector: '#plain .story', measure: 'top', value: 44, label: '橫幅到之前：左欄的文章緊接在標題下方，上緣在 44px' },
      { check: 'box', selector: '#reserved .story', measure: 'top', value: 104, label: '橫幅到之前：右欄的 `.slot` 已經佔了 60px，文章的上緣在 104px' },
      { do: 'wait', ms: 500 },
      { check: 'count', selector: '.slot > .banner', count: 2, label: '500 毫秒後，兩欄的 `.slot` 裡各有一張橫幅' },
      { check: 'box', selector: '#plain .story', measure: 'top', value: 104, label: '左欄的文章從 44px 被推到 104px：位移了 60px' },
      { check: 'box', selector: '#reserved .story', measure: 'top', value: 104, label: '右欄的文章仍然在 104px：橫幅落在預留的位置裡，下面的內容一動也沒動' },
    ],
  },
  {
    id: 'web14-batches', title: '一次做完，或分批做',
    description: '`sortBatch` 用「忙碌地等 200 毫秒」代表整理 100 本書的計算。兩個按鈕都整理 300 本，差別在於三批工作是塞在同一件任務裡，還是拆成三件。',
    height: 260,
    files: {
      html: lines(
        '<h1>整理還書箱</h1>',
        '<button id="all" type="button">一次整理完</button>',
        '<button id="batch" type="button">分批整理</button>',
        '<button id="hello" type="button">櫃台有人嗎？</button>',
        '<p id="status">還書箱有 300 本書</p>',
        '<p id="reply"></p>',
      ),
      js: lines(
        "const statusText = document.querySelector('#status');",
        '',
        '// 整理 100 本書：這 200 毫秒裡，主執行緒做不了別的事',
        'function sortBatch() {',
        '  const end = Date.now() + 200;',
        '  while (Date.now() < end) { /* 計算中 */ }',
        '  return 100;',
        '}',
        '',
        "document.querySelector('#all').addEventListener('click', () => {",
        "  statusText.textContent = '整理中…';",
        '  const done = sortBatch() + sortBatch() + sortBatch();',
        '  statusText.textContent = `整理完成：${done} 本`;',
        '});',
        '',
        "document.querySelector('#batch').addEventListener('click', () => {",
        '  let done = 0;',
        "  statusText.textContent = '整理中… 0 / 300';",
        '  function nextBatch() {',
        '    done += sortBatch();',
        '    console.log(`整理好 ${done} 本`);',
        '    statusText.textContent = done < 300 ? `整理中… ${done} / 300` : `整理完成：${done} 本`;',
        '    if (done < 300) setTimeout(nextBatch, 0);',
        '  }',
        '  setTimeout(nextBatch, 0);',
        '});',
        '',
        "document.querySelector('#hello').addEventListener('click', () => {",
        "  document.querySelector('#reply').textContent = '櫃台：馬上來';",
        '});',
      ),
    },
    observe: [
      { do: 'click', selector: '#all' },
      { check: 'text', selector: '#status', text: '整理完成：300 本', label: '按「一次整理完」：監聽器結束時，文字已經是「整理完成：300 本」。「整理中…」在同一件任務裡就被蓋掉，沒有機會畫到螢幕上' },
      { do: 'click', selector: '#batch' },
      { do: 'click', selector: '#hello' },
      { check: 'text', selector: '#status', text: '整理中… 0 / 300', label: '按「分批整理」再馬上按「櫃台有人嗎？」：「分批整理」的監聽器只排好第一批就結束了，進度是「整理中… 0 / 300」' },
      { check: 'text', selector: '#reply', text: '櫃台：馬上來', label: '這時櫃台已經回答了：它的監聽器排在第一批工作的前面，不必等 300 本都整理完' },
      { do: 'wait', ms: 1 },
      { check: 'console', lines: ['整理好 100 本', '整理好 200 本', '整理好 300 本'], label: '接著三批工作各自是一件任務，依序執行' },
      { check: 'text', selector: '#status', text: '整理完成：300 本', label: '三批都做完之後，文字是「整理完成：300 本」：結果和一次做完相同' },
    ],
  },
];

// ---- exercises ------------------------------------------------------------------------------------------------------

const RESERVE_HTML = lines(
  '<header class="top">小島圖書館</header>',
  '<div id="promo"></div>',
  '<article id="story">',
  '  <h1>潮汐的故事</h1>',
  '  <p>每天兩次，海水漲上沙灘，又退回去。</p>',
  '</article>',
);
const RESERVE_JS = lines(
  '// 活動橫幅晚 500 毫秒才到（在真實的網站上，它可能來自另一台伺服器）',
  'setTimeout(() => {',
  "  const banner = document.createElement('p');",
  "  banner.className = 'banner';",
  "  banner.textContent = '週六下午 2 點：海邊說故事';",
  "  document.querySelector('#promo').append(banner);",
  '}, 500);',
);
const reserveCss = (...rules: string[]) => lines(
  'body { margin: 0; font-family: sans-serif; }',
  '.top { height: 48px; padding: 0 16px; line-height: 48px; background: #0d47a1; color: white; }',
  '.banner { box-sizing: border-box; height: 80px; margin: 0; padding: 16px; background: #ffe082; }',
  '#story { padding: 16px; }',
  '#story h1 { margin: 0 0 8px; font-size: 22px; }',
  '',
  ...rules,
);

const imagesHtml = (hero: string, map: string) => lines(
  '<h1>海洋主題書展</h1>',
  `<img id="hero" src="${HERO}" alt="海面上的太陽與波浪"${hero}>`,
  '<p>本月有 12 本海洋主題的新書，都放在二樓的書展區。</p>',
  '<p>借閱期限是三週，可以續借一次。</p>',
  '<p>每週六下午 2 點有海邊說故事活動。</p>',
  '<h2>怎麼走</h2>',
  `<img id="map" src="${MAP}" alt="二樓平面圖，書展區在右上角"${map}>`,
);

const statsHtml = (head: string, bodyStart = '') => lines(
  '<!DOCTYPE html>',
  '<html lang="zh-Hant">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <title>小島圖書館</title>',
  ...(head ? [`  ${head}`] : []),
  '</head>',
  '<body>',
  ...(bodyStart ? [`  ${bodyStart}`] : []),
  '  <main>',
  '    <h1>小島圖書館</h1>',
  '    <p>今天開放到 17:00。</p>',
  '    <p>二樓有海洋主題書展。</p>',
  '  </main>',
  '  <footer id="stats">統計中…</footer>',
  '</body>',
  '</html>',
);
const STATS_JS = lines(
  '// 統計指令稿：和顯示內容無關，不應該擋在內容前面',
  "const ready = document.querySelectorAll('main > *').length;",
  'console.log(`統計指令稿開始執行：main 裡已有 ${ready} 個元素`);',
  '',
  "const stats = document.querySelector('#stats');",
  'if (stats) stats.textContent = `已統計 ${ready} 個元素`;',
);

const SLOT_HTML = lines(
  '<!DOCTYPE html>',
  '<html lang="zh-Hant">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <title>本週新書</title>',
  '  <link rel="stylesheet" href="style.css">',
  '  <script src="script.js" defer></script>',
  '</head>',
  '<body>',
  '  <header class="top">小島圖書館</header>',
  '  <div id="notice-slot"></div>',
  '  <main>',
  '    <h1 id="title">本週新書</h1>',
  '    <ul>',
  '      <li>島嶼植物圖鑑</li>',
  '      <li>潮汐的故事</li>',
  '    </ul>',
  '  </main>',
  '</body>',
  '</html>',
);
const SLOT_CSS = lines(
  'body { margin: 0; font-family: sans-serif; }',
  '.top { height: 48px; padding: 0 16px; line-height: 48px; background: #0d47a1; color: white; }',
  '/* 公告固定高 56px，這裡已經替它留好位置 */',
  '#notice-slot { min-height: 56px; background: #eceff1; }',
  '.notice { box-sizing: border-box; height: 56px; margin: 0; padding: 16px; background: #ffe082; }',
  'main { padding: 16px; }',
  '#title { margin: 0 0 8px; font-size: 22px; }',
);
const slotJs = (...body: string[]) => lines(
  "const slot = document.querySelector('#notice-slot');",
  "const main = document.querySelector('main');",
  '',
  'async function showNotice() {',
  ...body,
  '}',
  '',
  'showNotice();',
);
const SLOT_LOAD = [
  "  const response = await fetch('/api/notice');",
  '  if (!response.ok) return;',
  '  const data = await response.json();',
  "  const notice = document.createElement('p');",
  "  notice.className = 'notice';",
  '  notice.textContent = data.text;',
];

const exercises: WebExercise[] = [
  {
    id: 'web14-x-reserve', title: '替晚到的活動橫幅留位置',
    statement: 'index.html 與 script.js 不能改。活動橫幅晚 500 毫秒才被指令稿放進 `#promo`，它固定高 80px（見 style.css 的 `.banner`）。現在 `#promo` 一開始是空的、高度是 0，橫幅一到，文章 `#story` 就被往下推 80px。請只在 style.css 最後的 `#promo` 規則裡加上宣告，替橫幅預留剛剛好的位置：橫幅到之前，`#story` 的上緣就已經在 128px（頁首 48px＋預留的 80px）；橫幅到了之後，`#story` 仍然在 128px，`#promo` 的高度正好是 80px，而且橫幅看得到。',
    hints: [
      '要讓一個還是空的盒子先佔住空間，得告訴瀏覽器它「至少」有多高。',
      '橫幅高 80px，所以 `#promo` 也要留 80px：留得太少還是會位移，留得太多會多出一塊空白。',
      '在 `#promo` 的大括號裡寫 `min-height: 80px;`。',
    ],
    explanation: '`min-height: 80px` 讓 `#promo` 在還是空的時候就有 80px 高，文章從一開始就排在它的下方；橫幅放進來時落在這 80px 裡，`#promo` 的高度沒有變，後面的內容就不必移動。這裡橫幅的高度是固定的，寫 `height: 80px` 也可以；`min-height` 的好處是內容萬一比預期高，盒子還能長大，不會讓文字溢出去。預留的大小要和實際的內容一樣：這就是為什麼晚到的內容最好有固定的高度或固定的寬高比。',
    fixed: { html: RESERVE_HTML, js: RESERVE_JS },
    starter: { css: reserveCss('#promo {', '  /* 在這裡替橫幅預留位置 */', '}') },
    solution: { css: reserveCss('#promo {', '  min-height: 80px;', '}') },
    steps: [
      { check: 'box', selector: '#story', measure: 'top', value: 128, label: '橫幅還沒到時，文章 `#story` 的上緣已經在 128px（頁首 48px＋預留的 80px）' },
      { do: 'wait', ms: 500 },
      { check: 'box', selector: '#promo .banner', measure: 'height', value: 80, label: '500 毫秒後，橫幅出現在 `#promo` 裡，看得到，高 80px' },
      { check: 'box', selector: '#story', measure: 'top', value: 128, label: '橫幅到了之後，`#story` 的上緣在 128px，和橫幅到之前相同' },
      { check: 'box', selector: '#promo', measure: 'height', value: 80, label: '橫幅到了之後，`#promo` 的高度正好是 80px：沒有少留，也沒有多留' },
    ],
    mistakes: [
      {
        files: { css: reserveCss('#promo {', '  min-height: 40px;', '}') },
        why: '只留了 40px，比橫幅矮。橫幅到的時候 `#promo` 還是得從 40px 長到 80px，文章照樣被往下推 40px：位移變小了，但沒有消失。預留的高度要和實際的內容一樣。',
      },
      {
        files: { css: reserveCss('#promo {', '  /* 在這裡替橫幅預留位置 */', '}', '#story {', '  margin-top: 80px;', '}') },
        why: '改成把文章往下推 80px。一開始文章的位置對了，但 `#promo` 自己仍然是 0px 高：橫幅一到，它長出 80px，文章又被推到 208px。要留位置的是放橫幅的那個盒子，不是它後面的內容。',
      },
      {
        files: { css: reserveCss('#promo {', '  display: none;', '}') },
        why: '把 `#promo` 整個藏起來，文章當然不會被推，但橫幅也永遠看不到了，而且文章並沒有排在預留的位置下方。這是把內容拿掉，不是替它留位置。',
      },
    ],
  },
  {
    id: 'web14-x-images', title: '圖片：補上尺寸，只延後載入下方那一張',
    statement: '書展頁有兩張圖。`#hero` 是主題圖，一進頁面就看得到，也是這一頁最大的內容；它的圖檔是 300 × 150 像素。`#map` 是位置圖，在文章的下方，要往下捲才看得到；它的圖檔是 300 × 200 像素。現在兩張圖都沒有寫尺寸，`loading="lazy"` 還加錯了地方。請修改 index.html：（1）用 `width` 與 `height` 屬性替兩張圖寫上圖檔的尺寸；（2）讓 `#hero` 不要延後載入；（3）讓 `#map` 延後載入。兩張圖的 `src` 與 `alt` 不用改。',
    hints: [
      '先判斷哪一張圖是使用者一進來就要看的：那一張要盡快載入，不能延後。',
      '`width` 與 `height` 的值是不帶單位的整數；兩張圖的高度不一樣，別抄錯。',
      '把 `loading="lazy"` 從 `#hero` 拿掉，加到 `#map` 上；兩張圖各加上 `width="300"` 與各自的 `height`。',
    ],
    explanation: '`#hero` 是 LCP 元素：`loading="lazy"` 會讓瀏覽器晚一點才決定要不要下載它，主要內容因此更晚出現，所以一進頁面就看得到的圖不延後載入（不寫 `loading`，或寫成預設值 `eager` 都可以）。`#map` 在下方，使用者不一定會捲到，延後載入可以把一開始的頻寬讓給更重要的資源。兩張圖都要寫 `width` 與 `height`：瀏覽器靠這兩個數字在圖片下載之前就留好位置，延後載入的圖尤其需要，否則它在使用者捲到附近時才出現，正好把人家正在讀的內容推走。',
    starter: { html: imagesHtml(' loading="lazy"', '') },
    solution: { html: imagesHtml(' width="300" height="150"', ' width="300" height="200" loading="lazy"') },
    steps: [
      { check: 'count', selector: '#hero[width="300"][height="150"]', count: 1, label: '主題圖 `#hero` 的 `width` 是 300、`height` 是 150（不帶單位）' },
      { check: 'count', selector: '#map[width="300"][height="200"]', count: 1, label: '位置圖 `#map` 的 `width` 是 300、`height` 是 200（不帶單位）' },
      { check: 'count', selector: '#hero[loading="lazy"]', count: 0, label: '主題圖 `#hero` 沒有延後載入' },
      { check: 'attr', selector: '#map', name: 'loading', value: 'lazy', label: '位置圖 `#map` 延後載入' },
      { check: 'count', selector: 'img[src^="data:"][alt]', count: 2, label: '兩張圖的 `src` 與 `alt` 都還在' },
    ],
    mistakes: [
      {
        files: { html: imagesHtml(' width="300" height="150" loading="lazy"', ' width="300" height="200" loading="lazy"') },
        why: '替每一張圖都加上 `loading="lazy"`。主題圖一進頁面就看得到，又是最大的內容：延後載入只會讓它更晚開始下載，LCP 變差。`loading="lazy"` 只給一開始看不到的圖。',
      },
      {
        files: { html: imagesHtml(' width="300" height="150"', ' loading="lazy"') },
        why: '位置圖延後載入了，卻沒有寫尺寸。瀏覽器不知道該留多大的位置，等使用者捲到附近、圖片下載回來，後面的內容才被推開：延後載入的圖更需要 `width` 與 `height`。',
      },
      {
        files: { html: imagesHtml(' width="300px" height="150px"', ' width="300px" height="200px" loading="lazy"') },
        why: '把尺寸寫成 `300px`、`150px`。`px` 是 CSS 的寫法；HTML 的 `width` 與 `height` 屬性只寫不帶單位的整數。',
      },
    ],
  },
  {
    id: 'web14-x-defer', title: '別讓統計指令稿擋在內容前面',
    statement: 'script.js 不能改：它是一份統計指令稿，會數 `main` 裡有幾個元素，印在主控台，並把結果寫進頁尾 `#stats`。現在 index.html 在 `<head>` 裡用一般的 `<script>` 載入它：瀏覽器得先執行完它才繼續解析，而它執行時 `main` 還不存在，所以數到 0，頁尾也一直停在「統計中…」。請只修改 index.html 裡載入 script.js 的那一行，讓指令稿不再擋住 HTML 的解析，等整份文件解析完才執行：主控台只有一行「統計指令稿開始執行：main 裡已有 3 個元素」，頁尾 `#stats` 顯示「已統計 3 個元素」。`main` 的內容不要更動。',
    hints: [
      '問題不在 script.js，而在它被載入的方式：一般的 `<script>` 讀到就執行，後面的 HTML 要等它。',
      '有一個屬性能讓瀏覽器一邊解析 HTML、一邊下載指令稿，等整份文件解析完才執行。第四節的表格裡有三種寫法，注意哪一種「保證」等到解析完。',
      '在 `<script src="script.js">` 的開始標籤裡加上 `defer`。',
    ],
    explanation: '加上 `defer` 之後，瀏覽器讀到這一行不會停下來：它繼續解析後面的 HTML，同時在背景下載指令稿，等整份文件解析完才執行，所以指令稿數得到 `main` 裡的三個元素，也找得到 `#stats`。標籤留在 `<head>` 的好處是瀏覽器很早就發現這份檔案，可以及早開始下載。把這一行搬到 `</body>` 的前面也能通過檢查，內容同樣先建立；差別是瀏覽器要解析到文件的最後才發現這份檔案。`async` 不適合這裡：它一下載完就執行，不保證內容已經建立。',
    fixed: { js: STATS_JS },
    starter: { html: statsHtml('<script src="script.js"></script>') },
    solution: { html: statsHtml('<script src="script.js" defer></script>') },
    steps: [
      { check: 'console', lines: ['統計指令稿開始執行：main 裡已有 3 個元素'], label: '主控台只有一行：指令稿執行了一次，而且那時 `main` 裡的三個元素都已經建立' },
      { check: 'text', selector: '#stats', text: '已統計 3 個元素', label: '頁尾 `#stats` 顯示「已統計 3 個元素」' },
      { check: 'count', selector: 'main > h1, main > p', count: 3, label: '`main` 的內容沒有更動：仍然是一個標題與兩個段落' },
    ],
    mistakes: [
      {
        files: { html: statsHtml('<script src="script.js" async></script>') },
        why: '用了 `async`。它也不擋住解析，但指令稿一下載完就執行，不會等 HTML 解析完：檔案小、下載快的時候，它就搶在內容之前執行。本站的預覽沒有下載時間，正好是這種情況，所以仍然數到 0。需要整份文件的指令稿要用 `defer`。',
      },
      {
        files: { html: statsHtml('', '<script src="script.js"></script>') },
        why: '把 `<script>` 搬進了 `<body>`，卻放在最前面。一般的指令稿讀到就執行，這時它後面的 `main` 與頁尾都還沒建立，結果和放在 `<head>` 一樣。要搬就得搬到 `</body>` 的前面。',
      },
    ],
  },
  {
    id: 'web14-x-slot', title: '把晚到的公告放進預留的位置',
    statement: 'index.html 與 style.css 不能改。頁面用 `defer` 載入 script.js；指令稿向 `/api/notice` 要公告，伺服器大約 400 毫秒後才回應。style.css 已經替公告留了位置：頁首下方的 `#notice-slot` 有 `min-height: 56px`，公告 `.notice` 也固定高 56px。可是現在的 script.js 把公告插在 `main` 的前面，預留的位置空著，標題 `#title` 反而被往下推了 56px。請修改 `showNotice`：公告的文字仍然要來自伺服器的回應（`data.text`），做好的 `.notice` 元素要放進 `#notice-slot` 裡面，使得 `#title` 的上緣在公告回來之前與之後都是 120px（頁首 48px＋預留的 56px＋`main` 的留白 16px）。頁面上只能有一則公告。檢查還會換一則公告再執行一次，所以文字不能寫死。',
    hints: [
      '取得資料與建立 `.notice` 的程式都不用改。要改的只有最後一行：這個元素被接到 DOM 樹的哪裡。',
      '`main.before(notice)` 把公告放在 `main` 的前面，成為 `#notice-slot` 的下一個兄弟；要讓它成為 `#notice-slot` 的子元素。',
      '把最後一行換成 `slot.append(notice);`。',
    ],
    explanation: '版面位移的原因不是公告晚到，而是它晚到的時候擠進了已經排好的內容之間。`slot.append(notice)` 把公告放進 `#notice-slot` 裡面：這個盒子本來就佔了 56px，放進一個 56px 高的公告之後高度不變，後面的 `main` 與 `#title` 就留在原地。`slot.before(notice)`、`main.before(notice)` 或 `main.prepend(notice)` 都是把公告加在預留位置的外面，等於多出 56px，把內容推走。文字取自 `data.text`，所以伺服器換一則公告，程式不用改。',
    fixed: { html: SLOT_HTML, css: SLOT_CSS },
    setup: { api: [{ path: '/api/notice', body: { text: '本週六提早到 16:00 閉館' }, delay: 400 }] },
    starter: { js: slotJs(...SLOT_LOAD, '  main.before(notice);') },
    solution: { js: slotJs(...SLOT_LOAD, '  slot.append(notice);') },
    steps: [
      { check: 'box', selector: '#title', measure: 'top', value: 120, label: '公告還沒回來時，標題 `#title` 的上緣在 120px' },
      { do: 'wait', ms: 400 },
      { check: 'text', selector: '#notice-slot .notice', text: '本週六提早到 16:00 閉館', label: '400 毫秒後，`#notice-slot` 裡面有 `.notice`，文字是伺服器回應的公告' },
      { check: 'box', selector: '#title', measure: 'top', value: 120, label: '公告出現之後，`#title` 的上緣在 120px，和公告回來之前相同' },
      { check: 'count', selector: '.notice', count: 1, label: '頁面上只有一則公告' },
      { check: 'request', path: '/api/notice', count: 1, label: '頁面向 `/api/notice` 送出了一次請求' },
    ],
    mistakes: [
      {
        files: { js: slotJs(...SLOT_LOAD, '  slot.before(notice);') },
        why: '用了 `slot.before(notice)`：公告被放在預留位置的「前面」，不是「裡面」。空著的 `#notice-slot` 還佔著 56px，公告自己又佔 56px，標題一樣被往下推。',
      },
      {
        files: { js: slotJs(...SLOT_LOAD, '  main.prepend(notice);') },
        why: '把公告加在 `main` 裡面的最前面。`main` 這個盒子沒有移動，但它裡面的標題與清單被公告往下推了：使用者看到的位移一點也沒有少，預留的位置也還是空的。',
      },
      {
        files: {
          js: slotJs(
            "  const notice = document.createElement('p');",
            "  notice.className = 'notice';",
            "  notice.textContent = '本週六提早到 16:00 閉館';",
            '  slot.append(notice);',
          ),
        },
        why: '位置放對了，但公告的文字是寫死的，也沒有向伺服器要資料：伺服器換了公告，頁面還是顯示舊的。文字要取自回應的 `data.text`。',
      },
    ],
    variants: [{
      title: '伺服器回應另一則公告',
      setup: { api: [{ path: '/api/notice', body: { text: '颱風警報：今日休館' }, delay: 400 }] },
      steps: [
        { do: 'wait', ms: 400 },
        { check: 'text', selector: '#notice-slot .notice', text: '颱風警報：今日休館', label: '顯示的是這一次回應的公告' },
        { check: 'box', selector: '#title', measure: 'top', value: 120, label: '標題沒有被推走' },
        { check: 'count', selector: '.notice', count: 1, label: '只有一則公告' },
      ],
    }],
  },
];

export const WEB14: LessonContent = {
  lessonId: 'WEB14',
  motivation: '同樣的內容，有的頁面一點開就能讀，有的要等好幾秒，讀到一半文字還會跳走、按鈕按了沒反應。這一課把「快不快」拆成三個量得出來的指標，教你用開發者工具量測、沿著載入的過程找出原因，再動手修掉擋住畫面的指令稿、把內容推走的晚到內容與卡住互動的長任務。學完後你能量測一個頁面的 Core Web Vitals，並提出三項有根據、驗證得了的改善。',
  sections: [
    {
      id: 'web14-s-vitals', title: '效能是使用者的感受：Core Web Vitals',
      blocks: [
        { type: 'p', text: '使用者不會說「這個網站的效能不好」。他只會覺得：等了半天主要內容還沒出來；正要點連結，上面突然冒出一塊東西，害他點錯；按了按鈕，畫面卻慢半拍才有反應。然後他就離開了。所以效能不是做完功能之後才考慮的加分項目，它和排版、文案一樣，是使用者直接感受到的一部分。' },
        { type: 'p', text: '「感覺很慢」沒辦法修，要先變成數字。Core Web Vitals（網頁核心指標）是 Web Vitals 計畫選出的三個指標，正好對應上面三種感受：' },
        { type: 'table', head: ['指標', '量的是什麼', '使用者心裡的問題', '公布的良好門檻'], rows: [
          ['LCP（Largest Contentful Paint，最大內容繪製）', '從開始載入，到視窗裡最大的一塊內容（通常是主圖或一大段文字）畫出來，經過了多久', '主要內容出來了沒？', '2.5 秒以內'],
          ['INP（Interaction to Next Paint，互動到下一次繪製）', '使用者點擊、觸控或按鍵之後，到畫面下一次更新之間的延遲；整段造訪期間的互動都算，回報的大致是其中最慢的一次', '我按了，它有沒有反應？', '200 毫秒以內'],
          ['CLS（Cumulative Layout Shift，累計版面位移）', '內容在使用者沒有預期的情況下移動了多少。它不是時間，而是依移動的範圍與距離算出來的分數，沒有單位', '東西怎麼自己跑掉了？', '0.1 以下'],
        ] },
        { type: 'p', text: '表格裡的視窗（viewport）是指瀏覽器裡看得到頁面的那一塊區域。三個門檻是 Web Vitals 計畫在本課撰寫時公布的數值，日後可能調整，使用時以它公布的為準。判定的方式也要留意：看的不是某一次載入，而是許多次真實造訪的第 75 百分位數。也就是說，至少四分之三的造訪都達到門檻，這個頁面的這項指標才算「良好」；只有網路快、裝置新的訪客覺得順，是不夠的。' },
        { type: 'p', text: '下面是小島圖書館的書展頁，三個指標在這一頁上各有一個看得到的對象。頁面一出現就開始計時，公告大約 0.6 秒後才到；沒看清楚的話，打開「動手改這個範例」按「執行」，頁面會重新載入一次。看的時候盯著介紹文字那一段。' },
        { type: 'example', id: 'web14-vitals' },
        { type: 'p', text: '第一，這一頁最大的內容是主題圖：在真實的網站上，LCP 記錄的就是它畫出來的時刻，所以這張圖的檔案多大、多早開始下載，直接決定 LCP。第二，按「想看」：從你按下去，到數字變成 1 並畫到螢幕上，中間的延遲就是 INP 要量的；這裡的監聽器只做一件小事，所以感覺不到延遲。第三，頁面出現約 0.6 秒後，公告插進主題圖與文字之間，介紹文字和按鈕一起往下跳了 48px：如果你那時正要按「想看」，就會按空。這種移動就是 CLS 計算的版面位移。' },
        { type: 'callout', tone: 'note', title: '預覽看得到順序與位置，量不出時間', text: '本站的預覽頁面沒有網路：檔案已經在你的瀏覽器裡，沒有下載的時間，所以在這裡量不出 LCP 或 INP 的數值，範例下方的「事實」也不是量測結果。這一課的頁面能讓你看到、也能讓檢查確認的，是兩件事：事情發生的先後（誰先執行、誰先存在），以及晚到的內容出現前後，盒子的位置有沒有改變。真正的數字要用下一節的工具，在真實的網站上量。' },
      ],
    },
    {
      id: 'web14-s-measure', title: '效能量測：實驗室資料與真實使用者資料',
      blocks: [
        { type: 'p', text: '效能量測的第一條規則是先量再改。沒有量就動手，很容易花一個下午最佳化一段根本不慢的程式。量測的資料有兩種來源，用途不同，缺一不可：' },
        { type: 'table', head: ['比較', '實驗室資料（lab data）', '真實使用者資料（field data）'], rows: [
          ['怎麼來的', '你在自己的機器上，用工具在固定的設定下載入頁面', '真實訪客的瀏覽器在造訪時記錄指標，回報後彙整統計；這種做法常稱為真實使用者監測（real user monitoring，RUM）'],
          ['優點', '可以重複；改完馬上能再量一次；會附上診斷，告訴你時間花在哪裡', '反映真實的裝置、網路與操作方式；Core Web Vitals 是否良好，是用這種資料判定的'],
          ['限制', '只代表一台機器、一種設定；載入過程中沒有真人操作', '要有訪客、要累積一段時間才看得出結果；通常只告訴你慢，不告訴你為什麼'],
          ['用來做什麼', '找原因、驗證一項修改有沒有效', '確認使用者實際的感受、決定先修哪一頁'],
        ] },
        { type: 'p', text: '實驗室資料最容易取得的工具有兩個，都在開發者工具裡。Lighthouse 是 Chromium 系列瀏覽器（例如 Chrome、Edge）內建的面板，會自動載入頁面一次並產生報告：' },
        { type: 'list', ordered: true, items: [
          '用無痕視窗開啟要量的頁面：瀏覽器的擴充功能會干擾結果。',
          '打開開發者工具（WEB01 教過開啟的方式），切到 Lighthouse 面板。',
          '選擇裝置類型（行動裝置或電腦）與「效能」類別，然後開始分析。',
          '報告會列出 LCP、CLS 等指標的數值，指出哪一個元素是 LCP 元素，並附上一份可以改善的項目。載入的過程中沒有人操作頁面，所以報告裡沒有 INP；它改用總阻塞時間（Total Blocking Time）這個實驗室指標，提示主執行緒被佔住的程度。',
        ] },
        { type: 'p', text: 'Performance（效能）面板則是錄影：讓它一邊錄製一邊重新載入頁面，錄完會得到一條時間軸，看得到主執行緒在每一段時間忙什麼、哪些任務特別長、版面在什麼時候位移。想知道某個按鈕反應慢的原因，就按錄製、實際點它幾下再停止，找出那次互動期間是哪一段程式佔住了時間。這個面板還能把 CPU 與網路調慢，模擬比你的電腦慢得多的手機。兩個工具的介面會隨瀏覽器改版而變動，但用途不變：Lighthouse 給你總覽與建議，Performance 面板讓你看清楚細節。' },
        { type: 'callout', tone: 'warning', title: '只量一次、只在自己的電腦上量', text: '同一個頁面連續量兩次，數字就不會一樣：背景程式、網路狀況都會影響。所以不要因為一次的數字變好就宣布成功，也不要拿昨天在公司量的結果和今天在家裡量的比。做法是：同一台裝置、同樣的網路與 CPU 設定，修改前多量幾次、修改後再多量幾次，拿中間的值來比；一次只改一件事，才知道是哪一項修改有效。另外，開發用的電腦通常比訪客的手機快得多，在你的機器上「很順」不代表使用者也順：實驗室的結果要回頭和真實使用者資料對照。' },
      ],
    },
    {
      id: 'web14-s-path', title: '關鍵渲染路徑：第一個畫面出現之前',
      blocks: [
        { type: 'p', text: '量出 LCP 偏高之後，要知道時間花在哪裡，就得回到 WEB01 的頁面載入流程。瀏覽器從收到 HTML 到畫出第一個畫面，一定要走完下面幾步，這條路稱為關鍵渲染路徑（critical rendering path）：' },
        { type: 'list', ordered: true, items: [
          '解析 HTML，建立 DOM。',
          '解析 CSS，建立 CSSOM（CSS Object Model）：瀏覽器內部記錄「哪些規則套用在哪些元素上」的結構。',
          '把 DOM 與 CSSOM 合起來，得到渲染樹（render tree）：只包含真的要顯示的元素，`display: none` 的元素與 `<head>` 都不在裡面。',
          '版面配置（layout）：算出每個盒子的大小與位置。',
          '繪製（paint）：把盒子畫成螢幕上的像素。',
        ] },
        { type: 'p', text: '任何讓這條路走不下去的東西，都會讓使用者多看一段時間的空白。主要有兩種。第一種是樣式表：`<head>` 裡的樣式表下載並解析完之前，瀏覽器不會畫出頁面的內容，否則使用者會先看到一瞬間沒有樣式的頁面。所以說 CSS 會擋住渲染：第一個畫面用不到的大量樣式，都會拖慢它。第二種是指令稿：WEB08 提過，瀏覽器讀到一般的 `<script>` 會停止解析，等指令稿下載並執行完才繼續；寫在它後面的 HTML，這段時間都還不存在。圖片則不擋這條路：畫面會先出來，圖片晚一點才補上；網頁字型也常常是之後才換上。這正是第五節版面位移的來源。' },
        { type: 'example', id: 'web14-blocking' },
        { type: 'p', text: '看主控台的兩行。第一行來自 script.js：它執行的時候，頁面上的標題與段落是 0 個，因為瀏覽器才讀到 `<head>`，就被這份指令稿攔住了。第二行來自 `<body>` 最後的行內指令稿：要等 script.js 執行完，瀏覽器才繼續往下解析到這裡。預覽裡沒有下載的時間，你看到的只是順序；在真實的網路上，這份指令稿有多大、下載多久，使用者就多看多久的空白，而它只是一份統計用的指令稿，和顯示內容毫無關係。按「動手改這個範例」，在 `<script src="script.js">` 的開始標籤裡加上 `defer` 再執行：兩行的順序會對調，script.js 數到的也變成 3 個。' },
        { type: 'callout', tone: 'warning', title: '把每一份指令稿都放在 head 最前面', text: '初學者常把所有的 `<script src="…">` 一行一行排在 `<head>` 裡，沒有任何屬性。每多一份，瀏覽器就多一次「停下來、下載、執行」，第一個畫面就再晚一點。除非某一份指令稿真的必須在內容出現之前執行，否則都應該加上 `defer`（下一節說明）。樣式表也一樣要節制：`<head>` 裡只放這一頁真的用得到的樣式。' },
      ],
    },
    {
      id: 'web14-s-loading', title: '資源載入：指令稿、圖片與優先順序',
      blocks: [
        { type: 'p', text: '頁面用到的每一個檔案都是一項資源，都要經過請求、下載、處理。資源載入的原則很樸素：請求少一點、檔案小一點、重要的先來。用不到的指令稿與樣式拿掉；圖片存成實際顯示的大小，不要讓 300px 寬的位置去載一張寬 3000px 的照片。去掉檔案裡多餘的空白與註解（minification）、傳輸時壓縮、讓瀏覽器重用下載過的檔案（快取）也都有幫助，這一課只提名稱；快取在計算機網路島的 CN15 有完整的說明。這一節看 HTML 裡能做的事。先是指令稿的三種載入方式：' },
        { type: 'table', head: ['寫法', '下載的時候', '什麼時候執行', '適合'], rows: [
          ['`<script src="a.js">`', '解析停下來等', '下載完立刻執行，執行完才繼續解析', '很少：只有必須在後面的內容出現之前執行的指令稿'],
          ['`<script src="a.js" defer>`', '一邊解析一邊下載', '整份 HTML 解析完之後；有好幾份時，依照它們在文件裡的先後', '大多數的指令稿，尤其是會操作 DOM 的'],
          ['`<script src="a.js" async>`', '一邊解析一邊下載', '一下載完就執行（那一刻解析會暫停）；有好幾份時，誰先到誰先執行，順序不保證', '和頁面其他程式互不相干的獨立指令稿'],
        ] },
        { type: 'p', text: '接著是圖片，它常常就是 LCP 元素。WEB03 說過每張 `<img>` 都要寫 `width` 與 `height`：瀏覽器靠這兩個數字算出寬高比，圖片還沒下載就能留好位置；即使 CSS 用 `max-width: 100%` 與 `height: auto` 讓圖片跟著容器縮小，預留的空間也會等比例縮小。`loading="lazy"` 則請瀏覽器延後載入：這張圖要等使用者捲到它附近才下載，適合一開始看不到的圖，可以把頻寬讓給一進頁面就看得到的內容。之後才放進來的內容如果不是圖片，可以用 CSS 的 `aspect-ratio` 或 `min-height` 替它留位置。' },
        { type: 'example', id: 'web14-images' },
        { type: 'p', text: '在預覽裡往下捲，找到三個地方。主題圖有尺寸、沒有 `loading`。位置圖在文章下方，有尺寸也有 `loading="lazy"`；預覽裡看不出延後的效果，因為圖片的資料就寫在 `src` 裡，沒有東西要下載。在真實的網站上，打開開發者工具的 Network 面板再慢慢往下捲，會看到這張圖的請求在你捲到附近時才出現。最後的灰色方塊是替影片留的位置：CSS 只寫了寬度與 `aspect-ratio: 16 / 9`，高度由瀏覽器算出來。' },
        { type: 'p', text: '主題圖上還有一個 `fetchpriority="high"`：它提示瀏覽器，這張圖比頁面上其他的圖優先下載。另一個相關的工具是寫在 `<head>` 裡的 `<link rel="preload" href="…" as="image">`：它請瀏覽器提早下載一個要很晚才會被發現的資源，例如寫在 CSS 裡的背景圖，`as` 說明資源的種類。兩者都只是提示，也都只該用在一兩個真正關鍵的資源上：每一個都標成優先，就等於沒有優先。' },
        { type: 'callout', tone: 'warning', title: '替最上方的主圖加上 loading="lazy"', text: '「圖片都加 `loading="lazy"` 比較快」是常見的誤解。延後載入的意思是晚一點才下載；對一進頁面就看得到的圖，尤其是 LCP 元素，這只會讓主要內容更晚出現。規則很簡單：一開始就在視窗裡的圖不加，要捲動才看得到的圖才加。而延後載入的圖一定要寫尺寸，否則它出現的那一刻，正好把使用者正在讀的內容推走。' },
      ],
    },
    {
      id: 'web14-s-shift', title: '版面位移：替晚到的內容留位置',
      blocks: [
        { type: 'p', text: 'CLS 偏高，幾乎都是同一個故事：頁面已經排好、畫出來了，之後才有一塊內容到達，而頁面沒有替它留位置，瀏覽器只好把它後面的東西全部往下推。常見的晚到內容有三種：' },
        { type: 'list', items: [
          '沒有寫尺寸的圖片與影片：瀏覽器要等檔案下載到一部分，才知道它有多高。',
          '指令稿之後才插入的內容：公告、活動橫幅、廣告、向伺服器要回來的資料。',
          '網頁字型：字型檔下載完之前，瀏覽器常先用系統字型顯示文字，下載完再換上；兩種字型的字寬不同，文字就可能重新換行，把下面的內容推開。',
        ] },
        { type: 'p', text: '修法的核心只有一個：在內容到達之前，就讓版面知道它會佔多大的地方。圖片用 `width` 與 `height`；其他的盒子用 `min-height`，或用 `aspect-ratio` 固定寬高比。真的不知道會有多大時，換一個不會推到別人的位置：加在現有內容的下方，或用 WEB07 的 `position: fixed` 讓它浮在頁面上方，不佔一般排版流的空間。下面的頁面把兩種做法並排。同樣打開「動手改這個範例」按「執行」讓它重新載入，同時盯著兩欄的文章。' },
        { type: 'example', id: 'web14-shift' },
        { type: 'p', text: '兩欄收到的是同一張 60px 高的橫幅，到達的時間也相同。左欄的 `.slot` 一開始高度是 0，橫幅一到，文章從 44px 跳到 104px；右欄的 `.slot` 用 `min-height: 60px` 先佔了位置，橫幅落在那塊灰色的空位裡，文章停在 104px 沒有動。代價是右欄一開始有一塊空白，但空白不會害人點錯。打開「動手改這個範例」，把 `min-height` 改成 `30px` 再執行：右欄也跳了，只是跳得比較少。預留的大小要和實際的內容一樣才有用。' },
        { type: 'callout', tone: 'tip', title: '使用者自己觸發的變化不算', text: 'CLS 計算的是「沒有預期」的位移。使用者按下「顯示更多」之後內容展開、把下面的東西推開，是他自己要求的變化，緊接在操作之後發生的位移不會算進去。所以不必為了分數把所有會展開的元件都拿掉；要處理的是使用者什麼都沒做、內容卻自己動了的情況。' },
        { type: 'callout', tone: 'note', title: '晚一點插入，並不會讓位移消失', text: '替插入橫幅的指令稿加上 `defer`、或把它排到更後面才執行，只是改變橫幅到達的時間。只要它到的時候沒有位置，下面的內容還是會被推走，而且越晚到，使用者越可能已經開始閱讀或正要點擊。位移要靠預留空間解決，不是靠調整時間。' },
      ],
    },
    {
      id: 'web14-s-respond', title: '互動的反應速度與三項改善的計畫',
      blocks: [
        { type: 'p', text: 'INP 看的是互動之後多久畫面才更新。WEB10 說過，頁面的 JavaScript、事件的監聽器與畫面的更新都排在同一條執行緒上，這條執行緒常稱為主執行緒（main thread）。一件任務只要還沒結束，後面的點擊就得排隊，畫面也不會更新；超過 50 毫秒的任務稱為長任務（long task），是 INP 變差的常見原因。改善的方向有三個：' },
        { type: 'list', items: [
          '在監聽器裡少做一點：先更新使用者等著看的畫面，和這次互動無關的工作（例如送出統計資料）延後再做。',
          '把長的工作拆成幾批：做完一批就用 `setTimeout` 把下一批排成另一件任務，讓瀏覽器在兩批之間有機會更新畫面、處理其他的點擊。',
          '避免在迴圈裡交替讀寫版面。反例：每一圈先讀 `item.offsetHeight`，再改 `item.style.height`；每次讀取，瀏覽器都得先把上一圈的修改重新排版一次才能回答。改法：先用一個迴圈把所有的高度讀進陣列，再用第二個迴圈一次改完。這種來回強迫排版的寫法稱為版面抖動（layout thrashing）。',
        ] },
        { type: 'p', text: '下面的頁面示範第二點。`sortBatch` 用一個忙碌等待 200 毫秒的迴圈，代表整理 100 本書所需的計算；`Date.now()` 回傳目前的時間（毫秒）。兩個按鈕都要整理 300 本。' },
        { type: 'example', id: 'web14-batches' },
        { type: 'p', text: '先按「一次整理完」，緊接著按「櫃台有人嗎？」：大約 0.6 秒內頁面完全沒有反應，然後文字直接變成「整理完成：300 本」，櫃台的回答也要到這時才出現。程式明明先寫了「整理中…」，你卻從頭到尾沒看到它，因為三批工作和這兩次修改都在同一件任務裡，瀏覽器要等任務結束才能畫，那時文字早就被蓋掉了。這次互動到下一次繪製隔了 0.6 秒左右，遠遠超過 200 毫秒。再按「分批整理」，一樣緊接著按「櫃台有人嗎？」：這次進度從 0、100、200 一路更新，櫃台最慢在一批（0.2 秒）之後就回答。總共的計算一樣多，但每一件任務都變短了，瀏覽器在任務之間有機會更新畫面、處理別的點擊。當然，一批 200 毫秒仍然太長，真正的程式要切得更細，或是想辦法根本不做那麼多計算。' },
        { type: 'p', text: '最後把整課串成一份計畫。假設你量了小島圖書館的書展頁，結果三個指標都不理想。一份好的改善計畫，每一項都要有四個部分：問題、證據、要改什麼、怎麼驗證。' },
        { type: 'table', head: ['問題', '證據（指標與工具）', '要改什麼', '怎麼驗證'], rows: [
          ['主題圖很晚才出現', 'Lighthouse 報告的 LCP 超過 2.5 秒，LCP 元素是主題圖；HTML 裡它帶著 `loading="lazy"`，`<head>` 裡還有一份沒有 `defer` 的統計指令稿', '拿掉主題圖的 `loading="lazy"`、加上 `fetchpriority="high"`；統計指令稿改用 `defer`', '用同樣的裝置與網路設定再量幾次 Lighthouse，比較修改前後的 LCP'],
          ['公告晚到，把內容往下推', 'CLS 超過 0.1；Performance 面板的錄影顯示，位移發生在公告插入的那一刻', '替公告預留 `min-height`，沒有尺寸的圖片補上 `width` 與 `height`', '重新錄影，確認那一刻不再有位移，CLS 降到 0.1 以下'],
          ['按「想看」之後慢半拍', '真實使用者資料的 INP 超過 200 毫秒；用 Performance 面板錄下點擊，看到監聽器裡有一件長任務', '先更新數字，統計之類的工作延後；長的計算拆成幾批', '重新錄下同一個操作，確認長任務不見了；上線後繼續追蹤真實使用者的 INP'],
        ] },
        { type: 'callout', tone: 'tip', title: '每一項改善都要回到數字', text: '「改用 `defer`」不是一項完整的改善，「LCP 超過門檻，因為統計指令稿擋住解析；改用 `defer` 之後，同條件下再量一次」才是。先有證據才動手，改完用同樣的方式再量一次，沒有變好就還原。這一課的練習把這幾種修改各做一次：預留空間、圖片的尺寸與延後載入、不擋住解析的指令稿，以及把晚到的資料放進預留的位置。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'web14-q1', prompt: '訪客正要點「預約」按鈕，按鈕上方突然插入一則公告，整排按鈕往下移，他點到了「取消」。這個問題會反映在哪一個指標上？',
      options: [
        'LCP：公告是最晚畫出來的內容',
        'INP：按鈕沒有在 200 毫秒內反應',
        'CLS：內容在使用者沒有預期的情況下移動了',
        '三個指標都不會：只要頁面載入得夠快，就不會有這個問題',
      ],
      answer: 2,
      explanation: '已經畫出來的內容被晚到的公告推走，是版面位移，由 CLS 計算。LCP 看的是視窗裡最大的一塊內容多久畫出來，不是「最晚到的內容」；INP 看的是操作之後多久畫面才更新，這裡按鈕其實立刻有反應，只是位置變了、點到別的東西。載入得快也不保證沒有位移：只要公告到達時頁面沒有替它留位置，內容就會被推開。',
    },
    {
      id: 'web14-q2', prompt: '你在公司的桌上型電腦用 Lighthouse 量書展頁，LCP 是 1.2 秒；但真實使用者資料顯示，這一頁第 75 百分位數的 LCP 是 4 秒。哪一個解讀最合理？',
      options: [
        '兩者量的條件不同：實驗室資料只代表你這台機器與這種設定，許多訪客的裝置與網路慢得多；這一頁的 LCP 還不算良好',
        '真實使用者資料不準，應該以 Lighthouse 的 1.2 秒為準',
        'Lighthouse 壞了：同一個頁面不可能量出不同的數字',
        '取兩個數字的平均 2.6 秒，當作這一頁的 LCP',
      ],
      answer: 0,
      explanation: '實驗室資料是在一台機器、一種設定下量的，開發用的電腦通常比訪客的手機快得多；Core Web Vitals 是否良好，看的是真實造訪的第 75 百分位數，4 秒超過了 2.5 秒的門檻。真實使用者資料正是使用者實際的感受，不能因為和自己量的不同就當成不準；同一頁在不同的裝置與網路下量出不同的數字是正常的，不是工具壞了；兩種資料的來源與意義不同，平均起來沒有意義。',
    },
    {
      id: 'web14-q3', prompt: '某一頁的真實使用者資料（第 75 百分位數）是：LCP 2.1 秒、INP 350 毫秒、CLS 0.05。依照本課引用的良好門檻，哪一個判讀正確？',
      options: [
        '三項都良好',
        'LCP 沒有達到良好，應該先縮小圖片',
        'CLS 沒有達到良好，應該先替圖片補上尺寸',
        'INP 沒有達到良好，應該先找出互動時佔住主執行緒的長任務',
      ],
      answer: 3,
      explanation: '公布的良好門檻是 LCP 2.5 秒以內、INP 200 毫秒以內、CLS 0.1 以下。2.1 秒與 0.05 都在門檻內，只有 350 毫秒的 INP 超過 200 毫秒，所以該處理的是互動的反應速度：找出監聽器裡的長任務，少做一點或拆成幾批。縮小圖片改善的是 LCP、補上尺寸改善的是 CLS，這兩項在這一頁已經達標，先做它們幫不上忙。',
    },
    {
      id: 'web14-q4', prompt: '下列哪一項「不會」讓瀏覽器延後畫出頁面的第一個畫面？',
      options: [
        '`<head>` 裡一份很大的樣式表',
        '文章最下方一張寫了 `width`、`height` 與 `loading="lazy"` 的圖片',
        '`<head>` 裡一份沒有 `defer` 也沒有 `async` 的指令稿',
        '`<body>` 開頭、主要內容之前的一份一般 `<script src="…">`',
      ],
      answer: 1,
      explanation: '圖片不在關鍵渲染路徑上：瀏覽器不必等它就能排版與繪製，寫了尺寸的延後載入圖片只是先佔好位置，捲到附近才下載。`<head>` 裡的樣式表會擋住渲染，處理完之前瀏覽器不畫內容；一般的 `<script>` 不論在 `<head>` 還是在 `<body>` 的開頭，都會讓解析停下來等它下載並執行，寫在它後面的內容要更晚才建立。',
    },
    {
      id: 'web14-q5', prompt: 'app.js 會用到 library.js 定義的函式，所以 library.js 必須先執行。兩份都不應該擋住 HTML 的解析。`<head>` 裡該怎麼寫？',
      code: { language: 'HTML', text: '<script src="library.js" ???></script>\n<script src="app.js" ???></script>' },
      options: [
        '兩份都加 `async`',
        '兩份都加 `defer`',
        '兩份都不加屬性',
        '兩份都加 `loading="lazy"`',
      ],
      answer: 1,
      explanation: '`defer` 的指令稿一邊解析一邊下載，等整份 HTML 解析完才執行，而且依照在文件裡的先後：library.js 一定在 app.js 之前。`async` 也不擋住解析，但誰先下載完誰先執行，app.js 如果先到，就會用到還不存在的函式。不加屬性順序是對的，卻會讓解析停下來兩次。`loading="lazy"` 是圖片（與 iframe）的屬性，對 `<script>` 沒有作用。',
    },
    {
      id: 'web14-q6', prompt: '商品頁由上到下是：頁首的小標誌、一進頁面就看得到的大張商品主圖、一長段說明文字、十張要捲很久才看得到的使用情境照片。`loading="lazy"` 應該加在哪些圖片上？',
      options: [
        '全部的圖片：延後載入的圖越多，頁面越快',
        '只加在商品主圖：它最大，延後載入省下的最多',
        '都不要加：延後載入一定會造成版面位移',
        '只加在下方的十張情境照片；它們同時要寫 `width` 與 `height`',
      ],
      answer: 3,
      explanation: '`loading="lazy"` 給一開始看不到的圖：十張情境照片捲到附近才下載，把頻寬讓給一開始就看得到的內容。商品主圖一進頁面就看得到，而且是 LCP 元素，延後載入只會讓主要內容更晚出現，所以不能加，更不能只加在它身上。延後載入本身不會造成位移：只要寫了 `width` 與 `height`，瀏覽器在圖片下載之前就留好位置，所以不需要因噎廢食全部不加。',
    },
    {
      id: 'web14-q7', prompt: '指令稿在頁面載入後向伺服器要一則 60px 高的活動橫幅，拿到之後放進頁首下方的 `<div id="promo">`，把文章往下推了 60px。哪一個做法能消除這次版面位移？',
      options: [
        '在樣式表裡寫 `#promo { min-height: 60px; }`，橫幅到之前就留好位置',
        '替載入這份指令稿的 `<script>` 加上 `defer`',
        '替橫幅裡的圖片加上 `loading="lazy"`',
        '把橫幅改成在 3 秒後才插入，避開頁面載入的那段時間',
      ],
      answer: 0,
      explanation: '位移的原因是橫幅到達時沒有位置。`min-height: 60px` 讓 `#promo` 一開始就佔 60px，橫幅放進來時高度不變，文章不必移動。`defer` 只改變指令稿執行的時間，橫幅到的時候 `#promo` 仍然從 0 長到 60px；延後載入圖片同樣沒有替橫幅留位置；更晚才插入反而更糟，使用者那時多半已經在閱讀或正要點擊，被推走的機會更大。',
    },
    {
      id: 'web14-q8', prompt: '`buildReport()` 是同步的函式，大約要執行 800 毫秒。使用者按下按鈕之後，會看到什麼？',
      code: { language: 'JavaScript', text: "button.addEventListener('click', () => {\n  notice.textContent = '處理中…';\n  buildReport();\n  notice.textContent = '完成';\n});" },
      options: [
        '立刻看到「處理中…」，800 毫秒後變成「完成」',
        '立刻看到「完成」，報表在背景繼續計算',
        '頁面大約 800 毫秒沒有反應，然後直接看到「完成」；「處理中…」不會出現在螢幕上',
        '一直停在「處理中…」，因為長任務會被瀏覽器取消',
      ],
      answer: 2,
      explanation: '三行都在同一件任務裡。瀏覽器要等這件任務結束才能更新畫面，那時文字已經從「處理中…」被改成「完成」，所以使用者只看到按鈕卡住 800 毫秒，然後直接出現「完成」；這次互動的延遲遠超過 INP 的良好門檻。「處理中…」要真的被看到，得讓監聽器先結束，把 `buildReport()` 排到之後的任務，並把它拆成幾批。同步的函式不會自己跑到背景執行，瀏覽器也不會替你取消長任務。',
    },
  ],
  webCode: { examples, exercises },
};
