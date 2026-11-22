import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB08 JavaScript and the DOM: selecting and changing (WEB-3). A web-code lesson on the made-up 小島圖書館: the DOM
 * tree as the objects a script works on, when a script runs (in the head it finds nothing; at the end of the body or
 * with defer it finds the whole page), querySelector / querySelectorAll and "not found", changing text, attributes and
 * classes, and building a list from an array. Every script runs once, on load: events are WEB09, async is WEB10. Every
 * `observe` fact and every exercise (solution, starter, mistakes, variants) is run in Chromium by the tests.
 */

const lines = (...text: string[]) => text.join('\n');

/** The page of the two "when does the script run" examples: only the script tag in the head differs. */
const hoursPage = (script: string) => lines(
  '<!DOCTYPE html>',
  '<html lang="zh-Hant">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <title>小島圖書館</title>',
  `  ${script}`,
  '</head>',
  '<body>',
  '  <h1>小島圖書館</h1>',
  '  <p id="hours">開放時間載入中…</p>',
  '</body>',
  '</html>',
);
const HOURS_JS = lines(
  "const hours = document.querySelector('#hours');",
  'console.log(hours);',
  "hours.textContent = '今天開放到 17:00。';",
  "console.log('文字換好了');",
);

const examples: WebExample[] = [
  {
    id: 'web08-tree', title: '從 document 走進 DOM 樹',
    description: '一個標題，以及包著段落與清單的 `main`。script.js 不修改任何東西，只是沿著樹走，把讀到的結果印到主控台。',
    files: {
      html: lines(
        '<h1>小島圖書館</h1>',
        '<main>',
        '  <p id="hours">今天開放到 17:00。</p>',
        '  <ul id="books">',
        '    <li>島嶼植物圖鑑</li>',
        '    <li>潮汐的故事</li>',
        '  </ul>',
        '</main>',
      ),
      js: lines(
        "const list = document.querySelector('#books');",
        '',
        'console.log(list);',
        'console.log(list.parentElement);',
        'console.log(list.children.length);',
        'console.log(list.children[0].textContent);',
        'console.log(document.body.children.length);',
      ),
    },
    observe: [
      { check: 'count', selector: 'main > ul#books > li', count: 2, label: '`ul#books` 的父元素是 `main`，它有兩個子元素 `li`' },
      { check: 'console', lines: ['<ul#books>', '<main>', '2', '島嶼植物圖鑑', '3'], label: '主控台依序印出：清單本身、它的父元素、子元素的個數、第一個子元素的文字、`body` 的子元素個數' },
      { check: 'count', selector: 'body > *', count: 3, label: '`body` 有三個子元素：`h1`、`main`，以及放在最後、裝著 script.js 的 `script`' },
    ],
  },
  {
    id: 'web08-too-early', title: '寫在 head 裡的指令稿：找不到元素',
    description: 'index.html 在 `<head>` 裡載入 script.js。指令稿想把 `#hours` 的文字換成今天的開放時間。',
    files: { html: hoursPage('<script src="script.js"></script>'), js: HOURS_JS },
    expectErrors: true,
    observe: [
      { check: 'count', selector: 'head > script', count: 1, label: '指令稿在 `head` 裡，排在 `body` 之前' },
      { check: 'console', lines: ['null'], match: 'includes', label: '主控台印出 `null`：指令稿執行時，`querySelector` 找不到 `#hours`' },
      { check: 'text', selector: '#hours', text: '開放時間載入中…', label: '`#hours` 的文字沒有被換掉，仍是「開放時間載入中…」' },
      { check: 'count', selector: 'body > h1', count: 1, label: '指令稿出錯之後，瀏覽器仍然把 `body` 解析完：標題與段落都在' },
    ],
  },
  {
    id: 'web08-defer', title: '加上 defer：等整份文件解析完才執行',
    description: 'script.js 和上一個範例一字不差；index.html 只在 `<script>` 標籤上多了 `defer`。',
    files: { html: hoursPage('<script src="script.js" defer></script>'), js: HOURS_JS },
    observe: [
      { check: 'console', lines: ['<p#hours>', '文字換好了'], label: '主控台先印出找到的元素 `<p#hours>`，再印出「文字換好了」，沒有錯誤' },
      { check: 'text', selector: '#hours', text: '今天開放到 17:00。', label: '`#hours` 的文字換成「今天開放到 17:00。」' },
      { check: 'count', selector: 'p', count: 1, label: '頁面仍然只有一個段落：指令稿改的是原有元素的文字，沒有增加元素' },
    ],
  },
  {
    id: 'web08-select', title: '選一個、選全部、在元素裡面選',
    description: '頁面上有兩份清單，一共五個 `li`。script.js 用四種方式選取，並示範找不到元素時怎麼處理。',
    files: {
      html: lines(
        '<h1>小島圖書館</h1>',
        '<h2>新書</h2>',
        '<ul id="new">',
        '  <li>島嶼植物圖鑑</li>',
        '  <li>潮汐的故事</li>',
        '</ul>',
        '<h2>熱門</h2>',
        '<ul id="popular">',
        '  <li>星空觀察手冊</li>',
        '  <li>海風食譜</li>',
        '  <li>燈塔日誌</li>',
        '</ul>',
      ),
      js: lines(
        "const first = document.querySelector('li');",
        'console.log(first.textContent);',
        '',
        "const all = document.querySelectorAll('li');",
        'console.log(all.length);',
        '',
        "const popular = document.querySelector('#popular');",
        "const popularItems = popular.querySelectorAll('li');",
        'console.log(popularItems.length);',
        'popularItems.forEach((item) => {',
        '  console.log(item.textContent);',
        '});',
        '',
        "const soldOut = document.querySelector('.sold-out');",
        'if (soldOut) {',
        "  soldOut.textContent = '已售完';",
        '} else {',
        "  console.log('頁面上沒有 .sold-out');",
        '}',
      ),
    },
    observe: [
      { check: 'count', selector: 'li', count: 5, label: '整個頁面有五個 `li`' },
      { check: 'count', selector: '#popular li', count: 3, label: '`#popular` 裡面有三個 `li`' },
      { check: 'count', selector: '.sold-out', count: 0, label: '頁面上沒有任何元素帶有 `sold-out` 類別' },
      { check: 'console', lines: ['島嶼植物圖鑑', '5', '3', '星空觀察手冊', '海風食譜', '燈塔日誌', '頁面上沒有 .sold-out'], label: '主控台依序印出：第一個 `li` 的文字、全部的個數 5、`#popular` 裡的個數 3 與三個書名、找不到 `.sold-out` 的說明' },
    ],
  },
  {
    id: 'web08-modify', title: '改文字、改屬性、加類別',
    description: '一頁公告：標題、公告、連結、輸入欄位與按鈕。script.js 在載入時把它們各改一處；style.css 的 `.alert` 規則決定公告加上類別之後的樣子。',
    files: {
      html: lines(
        '<h1>圖書館公告</h1>',
        '<p id="notice">目前沒有公告。</p>',
        '<p><a id="more" href="#">開放時間</a></p>',
        '<label>借書證號碼 <input id="card"></label>',
        '<button id="send" type="button">送出</button>',
      ),
      css: lines(
        'body {',
        '  font-family: sans-serif;',
        '  margin: 16px;',
        '}',
        '.alert {',
        '  color: #b03a2e;',
        '  background-color: #fdedec;',
        '}',
      ),
      js: lines(
        "const heading = document.querySelector('h1');",
        "heading.textContent = '小島圖書館公告';",
        '',
        "const link = document.querySelector('#more');",
        "console.log(link.getAttribute('href'));",
        "link.setAttribute('href', 'https://example.com/hours');",
        '',
        "document.querySelector('#card').value = 'A-1024';",
        "document.querySelector('#send').disabled = true;",
        '',
        "const notice = document.querySelector('#notice');",
        "notice.textContent = '<b>颱風天</b>休館一天';",
        "notice.classList.add('alert');",
        "console.log(notice.classList.contains('alert'));",
      ),
    },
    observe: [
      { check: 'attr', selector: '#more', name: 'href', value: 'https://example.com/hours', label: '連結的 `href` 屬性從 `#` 變成 `https://example.com/hours`' },
      { check: 'value', selector: '#card', value: 'A-1024', label: '輸入欄位的值是 `A-1024`' },
      { check: 'attr', selector: '#send', name: 'disabled', label: '按鈕有了 `disabled` 屬性：它被停用了' },
      { check: 'count', selector: '#notice b', count: 0, label: '`#notice` 裡沒有 `b` 元素：交給 `textContent` 的 `<b>` 只是文字，不會變成標籤' },
      { check: 'style', selector: '#notice', property: 'color', value: '#b03a2e', label: '加上 `alert` 類別之後，公告的文字顏色是樣式表 `.alert` 規則的 `#b03a2e`' },
    ],
  },
  {
    id: 'web08-create', title: '依照陣列建立清單項目',
    description: 'index.html 的清單只寫了一本書。script.js 依照陣列 `titles` 再建立三個 `li`，在清單後面加上一行總數，最後移除「書單整理中…」。',
    files: {
      html: lines(
        '<h1>本週新書</h1>',
        '<p id="loading">書單整理中…</p>',
        '<ul id="books">',
        '  <li>島嶼植物圖鑑</li>',
        '</ul>',
      ),
      js: lines(
        "const titles = ['潮汐的故事', '星空觀察手冊', '海風食譜'];",
        "const list = document.querySelector('#books');",
        "const before = list.querySelectorAll('li');",
        '',
        'for (const title of titles) {',
        "  const item = document.createElement('li');",
        '  item.textContent = title;',
        '  list.append(item);',
        '}',
        '',
        "const note = document.createElement('p');",
        'note.textContent = `共 ${list.children.length} 本`;',
        'list.after(note);',
        '',
        "document.querySelector('#loading').remove();",
        '',
        "console.log(before.length, list.querySelectorAll('li').length);",
      ),
    },
    observe: [
      { check: 'count', selector: '#books > li', count: 4, label: 'index.html 只寫了一個 `li`，DOM 樹的清單裡有四個' },
      { check: 'text', selector: '#books > li:last-child', text: '海風食譜', label: '最後一個項目是陣列的最後一筆「海風食譜」：順序和陣列相同' },
      { check: 'text', selector: '#books + p', text: '共 4 本', label: '緊接在清單後面的是程式建立的段落「共 4 本」' },
      { check: 'count', selector: '#loading', count: 0, label: '「書單整理中…」那個段落已經從 DOM 樹移除' },
      { check: 'console', lines: ['1 4'], label: '主控台印出 `1 4`：迴圈之前選好的清單仍然是 1 個，重新選一次才是 4 個' },
    ],
  },
];

// ---- exercises --------------------------------------------------------------------------------------------------
const NOTICE_HTML = lines(
  '<h1>圖書館公告</h1>',
  '<p>本週六的說故事時間改到下午兩點。</p>',
  '<p><a id="more" href="#">查看開放時間</a></p>',
);
const NOTICE_START = [
  "const heading = document.querySelector('h1');",
  "const link = document.querySelector('#more');",
  '',
];

const LOANS_CSS = lines(
  'body {',
  '  font-family: sans-serif;',
  '  margin: 16px;',
  '}',
  'li {',
  '  color: #222222;',
  '}',
  '.overdue {',
  '  color: #b03a2e;',
  '  font-weight: bold;',
  '}',
);
const loansHtml = (...loans: [number, string][]) => lines(
  '<h1>借閱中的書</h1>',
  '<ul id="loans">',
  ...loans.map(([days, title]) => `  <li data-days="${days}">${title}</li>`),
  '</ul>',
  '<p>逾期：<span id="count">0</span> 本</p>',
);
const loansJs = (...body: string[]) => lines(
  "const items = document.querySelectorAll('#loans li');",
  'let count = 0;',
  '',
  'items.forEach((item) => {',
  '  const days = Number(item.dataset.days);',
  ...body,
  '});',
  '',
  "document.querySelector('#count').textContent = count;",
);

const booksHtml = (...titles: string[]) => lines(
  '<h1>本週新書</h1>',
  '<p id="total">計算中…</p>',
  '<ul id="books"></ul>',
  '<script>',
  `  const newBooks = [${titles.map(t => `'${t}'`).join(', ')}];`,
  '</script>',
);
const BOOKS_START = [
  "const list = document.querySelector('#books');",
  "const total = document.querySelector('#total');",
  '',
];

const shelvesHtml = (script: string, where: 'head' | 'body-start' | 'body-end') => lines(
  '<!DOCTYPE html>',
  '<html lang="zh-Hant">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <title>小島圖書館的書架</title>',
  ...(where === 'head' ? [`  ${script}`] : []),
  '</head>',
  '<body>',
  ...(where === 'body-start' ? [`  ${script}`] : []),
  '  <h1>書架</h1>',
  '  <p id="summary">整理中…</p>',
  '  <ul class="shelf" id="shelf-a">',
  '    <li>島嶼植物圖鑑</li>',
  '    <li class="new">潮汐的故事</li>',
  '  </ul>',
  '  <ul class="shelf" id="shelf-b">',
  '    <li>星空觀察手冊</li>',
  '  </ul>',
  '  <ul class="shelf" id="shelf-c">',
  '    <li class="new">海風食譜</li>',
  '    <li>燈塔日誌</li>',
  '  </ul>',
  ...(where === 'body-end' ? [`  ${script}`] : []),
  '</body>',
  '</html>',
);
const SHELVES_PLAIN = '<script src="script.js"></script>';
const SHELVES_DEFER = '<script src="script.js" defer></script>';
const shelvesJs = (...body: string[]) => lines(
  "const summary = document.querySelector('#summary');",
  "const shelves = document.querySelectorAll('.shelf');",
  'summary.textContent = `共有 ${shelves.length} 個書架`;',
  '',
  'shelves.forEach((shelf) => {',
  "  const newBook = shelf.querySelector('.new');",
  ...body,
  '});',
);
const SHELVES_BROKEN = shelvesJs("  newBook.textContent = '新書：' + newBook.textContent;");
const SHELVES_GUARDED = shelvesJs(
  '  if (newBook) {',
  "    newBook.textContent = '新書：' + newBook.textContent;",
  '  }',
);

const exercises: WebExercise[] = [
  {
    id: 'web08-x-text-href', title: '改標題的文字與連結的目的地',
    statement: 'index.html 不能改。script.js 已經選好標題與連結；請補上兩行，把 `h1` 的文字改成「小島圖書館公告」，並把 `#more` 這個連結的 `href` 改成 `https://example.com/hours`。連結上的字「查看開放時間」不要動。檢查會點一下連結，看它前往哪裡（預覽裡的連結不會真的離開頁面，只會記錄目的地）。',
    hints: [
      '元素的文字在 `textContent`，用 `=` 指定新的字串就會換掉。',
      "連結的目的地是 `href`：可以寫 `link.href = …`，也可以用 `link.setAttribute('href', …)`。",
      "兩行都是「變數.特性 = '新的值';」的形式：一行改 `heading` 的 `textContent`，一行改 `link` 的 `href`。",
    ],
    explanation: '`heading` 與 `link` 是 `querySelector` 交回來的元素物件，修改就是對它們的特性指定新的值：`textContent` 換掉標題裡的文字，`href` 換掉連結的目的地（`link.href = …` 與 `link.setAttribute(\'href\', …)` 都會改到 HTML 的 `href` 屬性）。連結上顯示的字是它的 `textContent`，這一題沒有碰它，所以維持原樣。',
    fixed: { html: NOTICE_HTML },
    starter: { js: lines(...NOTICE_START, '// 在下面寫兩行程式：一行改 heading 的文字，一行改 link 的 href') },
    solution: { js: lines(...NOTICE_START, "heading.textContent = '小島圖書館公告';", "link.href = 'https://example.com/hours';") },
    steps: [
      { check: 'text', selector: 'h1', text: '小島圖書館公告', label: '`h1` 的文字是「小島圖書館公告」' },
      { check: 'attr', selector: '#more', name: 'href', value: 'https://example.com/hours', label: '`#more` 的 `href` 是 `https://example.com/hours`' },
      { check: 'text', selector: '#more', text: '查看開放時間', label: '連結上的字仍是「查看開放時間」' },
      { do: 'click', selector: '#more' },
      { check: 'navigated', href: 'https://example.com/hours', label: '點擊連結會前往 `https://example.com/hours`' },
    ],
    mistakes: [
      {
        files: { js: lines(...NOTICE_START, "heading.textContent = '小島圖書館公告';", "link.textContent = 'https://example.com/hours';") },
        why: '`link.textContent` 是連結上顯示的字，不是它前往的地方：畫面上的「查看開放時間」被換成一串網址，點下去仍然是原本的 `#`。目的地寫在 `href`。',
      },
      {
        files: { js: lines(...NOTICE_START, "heading.textContent = '小島圖書館公告';", "link.setAttribute('herf', 'https://example.com/hours');") },
        why: '屬性名稱打成了 `herf`。`setAttribute` 不會檢查名稱有沒有意義，它照樣替連結加上一個沒有作用的 `herf` 屬性，主控台沒有任何錯誤，`href` 仍然是 `#`。沒有反應又沒有錯誤時，先逐字核對名稱。',
      },
      {
        files: { js: lines(...NOTICE_START, "heading.textContent('小島圖書館公告');", "link.href = 'https://example.com/hours';") },
        why: '`textContent` 是特性，不是方法：要用 `=` 指定，不能加括號呼叫。這一行會讓主控台出現 TypeError，指令稿就停在這裡，連下一行改 `href` 的程式也沒有執行。',
      },
    ],
  },
  {
    id: 'web08-x-overdue', title: '標出逾期的書',
    statement: 'index.html 與 style.css 不能改。清單 `#loans` 的每個 `li` 都用 `data-days` 屬性記著這本書已經借了幾天。請完成 script.js 的迴圈：借閱超過 14 天的項目（剛好 14 天不算）要加上 `overdue` 類別，並讓 `count` 加 1，最後一行會把逾期的本數寫進 `#count`。樣式表已經有 `.overdue` 規則，不要用程式直接設定顏色。檢查還會用另一份天數不同的清單再執行一次，所以本數必須是算出來的。',
    hints: [
      '`if (days > 14) { … }`：大括號裡放「逾期時要做的事」。',
      '加類別用 `item.classList.add(…)`，括號裡是類別名稱本身，前面不加句點。',
      "在 `if` 的大括號裡寫兩行：`item.classList.add('overdue');` 與 `count = count + 1;`。",
    ],
    explanation: '`querySelectorAll` 選到所有的借閱項目，`forEach` 逐一處理。`item.dataset.days` 讀到的是字串，起始程式已經用 `Number(…)` 轉成數字，才能和 14 比大小。逾期的項目只加上 `overdue` 類別，紅色與粗體由樣式表的 `.overdue` 規則決定；同時用 `count` 記下本數。因為每一步都是從頁面上的資料算出來的，換一份清單也會得到正確的結果。',
    fixed: { html: loansHtml([3, '島嶼植物圖鑑'], [21, '潮汐的故事'], [14, '星空觀察手冊'], [30, '海風食譜']), css: LOANS_CSS },
    starter: { js: loansJs('  // 在這裡寫程式：days 超過 14，就替 item 加上 overdue 類別，並讓 count 加 1') },
    solution: { js: loansJs('  if (days > 14) {', "    item.classList.add('overdue');", '    count = count + 1;', '  }') },
    steps: [
      { check: 'count', selector: '#loans li.overdue', count: 2, label: '清單裡有兩個項目帶有 `overdue` 類別' },
      { check: 'count', selector: '#loans li:nth-child(2).overdue', count: 1, label: '借了 21 天的「潮汐的故事」有 `overdue` 類別' },
      { check: 'style', selector: '#loans li:nth-child(4)', property: 'color', value: '#b03a2e', label: '借了 30 天的「海風食譜」顯示成 `.overdue` 規則的顏色 `#b03a2e`' },
      { check: 'count', selector: '#loans li:nth-child(3).overdue', count: 0, label: '剛好 14 天的「星空觀察手冊」沒有 `overdue` 類別' },
      { check: 'style', selector: '#loans li:nth-child(1)', property: 'color', value: '#222222', label: '只借了 3 天的「島嶼植物圖鑑」維持 `#222222`' },
      { check: 'text', selector: '#count', text: '2', label: '`#count` 的文字是逾期的本數 2' },
    ],
    mistakes: [
      {
        files: { js: loansJs('  if (days >= 14) {', "    item.classList.add('overdue');", '    count = count + 1;', '  }') },
        why: '條件寫成 `>= 14`，剛好借滿 14 天的書也被標成逾期，本數多了一本。「超過 14 天」不包含 14，要用 `>`；邊界上的那一筆資料最容易出錯，寫完條件記得拿它驗一次。',
      },
      {
        files: { js: loansJs('  if (days > 14) {', "    item.classList.add('.overdue');", '    count = count + 1;', '  }') },
        why: "`classList.add('.overdue')` 多了一個句點。句點是選擇器的寫法；這一行不會出錯，但元素得到的類別名稱是「.overdue」，樣式表的 `.overdue` 規則選不到它，畫面完全沒有變，只有本數是對的。",
      },
      {
        files: { js: loansJs('  if (days > 14) {', "    item.style.color = '#b03a2e';", "    item.style.fontWeight = 'bold';", '    count = count + 1;', '  }') },
        why: '直接用 `style` 設定顏色，畫面看起來一樣，但項目沒有 `overdue` 類別：樣式表裡的規則沒有用到，日後想改逾期的樣子，得回頭改程式。外觀留在 CSS，程式只負責加上類別。',
      },
    ],
    variants: [{
      title: '另一份借閱清單：五本書，天數不同',
      fixed: { html: loansHtml([15, '燈塔日誌'], [2, '珊瑚礁地圖'], [40, '港口的一天'], [16, '候鳥筆記'], [14, '潮間帶散步']), css: LOANS_CSS },
      steps: [
        { check: 'count', selector: '#loans li.overdue', count: 3, label: '三個項目帶有 `overdue` 類別' },
        { check: 'count', selector: '#loans li:nth-child(1).overdue', count: 1, label: '借了 15 天的書有 `overdue` 類別' },
        { check: 'count', selector: '#loans li:nth-child(5).overdue', count: 0, label: '剛好 14 天的書沒有 `overdue` 類別' },
        { check: 'text', selector: '#count', text: '3', label: '`#count` 的文字是 3' },
      ],
    }],
  },
  {
    id: 'web08-x-build-list', title: '依照陣列產生書單',
    statement: 'index.html 不能改：它最後的 `<script>` 準備了陣列 `newBooks`，裡面是本週新書的書名。請完成 script.js：替陣列裡的每一個書名建立一個 `li`，文字就是書名，依陣列的順序接到 `#books` 裡；再把 `#total` 的文字改成「共 N 本」，N 是書的數量（這一頁是「共 3 本」，數字前後各有一個空白）。書名要當成文字原樣顯示。檢查還會換一份書單再執行一次：那份書單有四本書，其中一本的書名裡有 `<em>` 這幾個字元。',
    hints: [
      '迴圈的每一圈要做三件事：建立元素、設定文字、插入清單。',
      "`document.createElement('li')` 要寫在迴圈裡面，每一圈才會有一個新的元素；書名用 `textContent` 放進去，再用 `list.append(…)` 接到最後。",
      "書的數量是 `newBooks.length`。總數可以寫成 `'共 ' + newBooks.length + ' 本'`，或用反引號的樣板字面值。",
    ],
    explanation: '每一圈 `createElement` 建立一個新的 `li`，`textContent` 放進書名，`append` 接到清單的最後，所以項目的順序和陣列相同。書名交給 `textContent`，裡面就算有 `<em>` 也只是文字，不會變成標籤。總數用 `newBooks.length` 算出來，換一份書單就跟著變。這些 `li` 只存在於 DOM 樹：index.html 的原始碼裡，`<ul>` 仍然是空的。',
    fixed: { html: booksHtml('島嶼植物圖鑑', '潮汐的故事', '星空觀察手冊') },
    starter: {
      js: lines(
        ...BOOKS_START,
        'for (const title of newBooks) {',
        '  // 在這裡寫程式：建立一個 li，文字是 title，接到 list 的最後',
        '}',
        '',
        '// 在這裡寫程式：把 total 的文字改成「共 N 本」',
      ),
    },
    solution: {
      js: lines(
        ...BOOKS_START,
        'for (const title of newBooks) {',
        "  const item = document.createElement('li');",
        '  item.textContent = title;',
        '  list.append(item);',
        '}',
        '',
        'total.textContent = `共 ${newBooks.length} 本`;',
      ),
    },
    steps: [
      { check: 'count', selector: '#books > li', count: 3, label: '`#books` 裡有三個 `li`，和陣列的長度相同' },
      { check: 'text', selector: '#books > li:first-child', text: '島嶼植物圖鑑', label: '第一個項目是陣列的第一個書名「島嶼植物圖鑑」' },
      { check: 'text', selector: '#books > li:nth-child(2)', text: '潮汐的故事', label: '第二個項目是「潮汐的故事」' },
      { check: 'text', selector: '#books > li:last-child', text: '星空觀察手冊', label: '最後一個項目是陣列的最後一個書名「星空觀察手冊」' },
      { check: 'text', selector: '#total', text: '共 3 本', label: '`#total` 的文字是「共 3 本」' },
    ],
    mistakes: [
      {
        files: {
          js: lines(
            ...BOOKS_START,
            "const item = document.createElement('li');",
            'for (const title of newBooks) {',
            '  item.textContent = title;',
            '  list.append(item);',
            '}',
            '',
            'total.textContent = `共 ${newBooks.length} 本`;',
          ),
        },
        why: '`createElement` 寫在迴圈外面，從頭到尾只有一個 `li`。迴圈每一圈改的都是它的文字，`append` 已經在樹上的元素只是把它搬到最後，不會複製，所以清單只有一個項目，文字是最後一個書名。',
      },
      {
        files: {
          js: lines(
            ...BOOKS_START,
            'for (const title of newBooks) {',
            "  list.innerHTML += '<li>' + title + '</li>';",
            '}',
            '',
            'total.textContent = `共 ${newBooks.length} 本`;',
          ),
        },
        why: '用 `innerHTML` 把書名拼進 HTML 字串，這一頁的三本書看起來沒問題；但書名裡一有 `<em>` 這樣的字元就會被當成標籤解析，書名少了一截，後面的字還變成斜體（另一份書單的檢查不會通過）。資料要當成文字放進頁面，用 `createElement` 加 `textContent`。',
      },
      {
        files: {
          js: lines(
            ...BOOKS_START,
            'for (const title of newBooks) {',
            "  const item = document.createElement('li');",
            '  item.textContent = title;',
            '  list.append(item);',
            '}',
            '',
            "total.textContent = '共 3 本';",
          ),
        },
        why: '總數直接寫成「共 3 本」，在這一頁剛好是對的；書單一換成四本，清單有四個項目，總數卻還是 3。會跟著資料變的數字要從資料算出來：`newBooks.length`。',
      },
    ],
    variants: [{
      title: '另一份書單：四本書，其中一本的書名裡有標籤的字元',
      fixed: { html: booksHtml('海風食譜', '<em> 標籤入門', '燈塔日誌', '珊瑚礁地圖') },
      steps: [
        { check: 'count', selector: '#books > li', count: 4, label: '四個 `li`' },
        { check: 'text', selector: '#books > li:nth-child(2)', text: '<em> 標籤入門', label: '第二個項目的文字是完整的書名' },
        { check: 'count', selector: '#books em', count: 0, label: '清單裡沒有 `em` 元素' },
        { check: 'text', selector: '#books > li:last-child', text: '珊瑚礁地圖', label: '最後一個項目是「珊瑚礁地圖」' },
        { check: 'text', selector: '#total', text: '共 4 本', label: '`#total` 的文字是「共 4 本」' },
      ],
    }],
  },
  {
    id: 'web08-x-debug', title: '修好一直停在「整理中」的書架頁',
    statement: '這個頁面有兩個問題，畫面一直停在「整理中…」。請修改 index.html 與 script.js，讓 `#summary` 顯示「共有 3 個書架」，並且每個書架（`.shelf`）裡帶有 `new` 類別的那本書，文字前面加上「新書：」。第二個書架沒有新書：它裡面的書要維持原樣，指令稿也不能因此出錯停住（第三個書架的新書要處理到）。不要更動書架與書的 HTML，也不要替任何一本書增減類別。先按「執行」看主控台的錯誤標在第幾行，修好一個問題之後再看一次。',
    hints: [
      '看主控台：TypeError 標的是 script.js 的第幾行？那一行句點前面的變數，為什麼會是 `null`？',
      '第一個問題在 index.html：指令稿寫在 `<head>` 裡，執行時 `body` 還不存在。把那一行 `<script>` 搬到 `</body>` 的前面，或是替它加上 `defer`。',
      "修好之後再執行，錯誤換到迴圈裡的那一行：第二個書架裡沒有 `.new`，`shelf.querySelector('.new')` 得到 `null`。用 `if (newBook) { … }` 把使用 `newBook` 的那一行包起來。",
    ],
    explanation: '兩個問題的症狀相同，都是「對 `null` 取用特性」的 TypeError，原因卻不同。第一個是時機：指令稿在 `<head>` 裡執行時，`#summary` 還沒建立；加上 `defer`（或把 `<script>` 搬到 `</body>` 前面）就能等到整份文件解析完。第二個是資料：不是每個書架都有新書，`shelf.querySelector(\'.new\')` 在第二個書架得到 `null`；先用 `if (newBook)` 檢查，沒有新書的書架就跳過，迴圈才能繼續處理第三個書架。',
    starter: { html: shelvesHtml(SHELVES_PLAIN, 'head'), js: SHELVES_BROKEN },
    solution: { html: shelvesHtml(SHELVES_DEFER, 'head'), js: SHELVES_GUARDED },
    steps: [
      { check: 'text', selector: '#summary', text: '共有 3 個書架', label: '`#summary` 的文字是「共有 3 個書架」' },
      { check: 'text', selector: '#shelf-a .new', text: '新書：潮汐的故事', label: '第一個書架的新書變成「新書：潮汐的故事」' },
      { check: 'text', selector: '#shelf-c .new', text: '新書：海風食譜', label: '第三個書架的新書變成「新書：海風食譜」' },
      { check: 'text', selector: '#shelf-b li', text: '星空觀察手冊', label: '第二個書架沒有新書，裡面的書仍是「星空觀察手冊」' },
      { check: 'count', selector: '.shelf li.new', count: 2, label: '三個書架裡仍然只有兩本書帶有 `new` 類別' },
      { check: 'count', selector: '.shelf li', count: 5, label: '三個書架一共仍是五本書' },
    ],
    mistakes: [
      {
        files: { html: shelvesHtml(SHELVES_DEFER, 'head'), js: SHELVES_BROKEN },
        why: '只修了 index.html。指令稿現在找得到元素，`#summary` 也更新了，但迴圈跑到第二個書架時 `newBook` 是 `null`，主控台出現 TypeError，指令稿停在那裡，第三個書架的新書沒有被處理。',
      },
      {
        files: { html: shelvesHtml(SHELVES_PLAIN, 'head'), js: SHELVES_GUARDED },
        why: '只在 script.js 加了 `if`。指令稿仍然在 `<head>` 裡執行，那時 `#summary` 還不存在，第 3 行就出錯停住了，後面的迴圈根本沒有機會執行。',
      },
      {
        files: { html: shelvesHtml(SHELVES_PLAIN, 'body-start'), js: SHELVES_GUARDED },
        why: '把 `<script>` 搬進了 `<body>`，卻放在最前面。指令稿讀到就執行，這時它後面的標題、段落與書架都還沒建立，結果和放在 `<head>` 一樣。要放在所有它會用到的元素之後，也就是 `</body>` 的前面。',
      },
    ],
  },
];

// ---- the lesson -------------------------------------------------------------------------------------------------
export const WEB08: LessonContent = {
  lessonId: 'WEB08',
  motivation: 'WEB01 的六行程式只會換掉一句話。這一課把那幾行拆開來學：怎麼在 DOM 樹裡選取元素，怎麼修改它的文字、屬性與類別，怎麼建立新的元素接到頁面上。學完之後，你能用 JavaScript 依照一份資料產生清單並插入頁面，遇到「程式明明寫了，畫面卻沒有變」的時候，也知道該從哪裡查起。',
  sections: [
    {
      id: 'web08-s-tree', title: 'DOM 樹：指令稿操作的對象',
      blocks: [
        { type: 'p', text: '在 WEB01 的最後，你看過瀏覽器把 HTML 解析成一棵樹：DOM 樹。這一課的每一行 JavaScript 都在對這棵樹動手，所以先把它看清楚。指令稿（script）拿到的不是你打的那些 HTML 文字，而是樹上的一個個節點（node），其中代表標籤的節點就是元素（element）。在 JavaScript 裡，每個元素都是一個物件（object）：一包有名字的資料與功能，用句點取用。資料叫特性（property），例如 `textContent` 是元素裡的文字；功能叫方法（method），後面加上括號來呼叫，例如 `querySelector(…)`。' },
        { type: 'p', text: '整棵樹的入口是 `document`：瀏覽器已經準備好這個物件，不必宣告就能用。從它出發，有兩種方式走到你要的元素。一種是用選擇器直接找，這是第三節的主題；另一種是沿著父子關係一步一步走：' },
        { type: 'list', items: [
          '`document.body`：頁面的 `body` 元素。',
          '`元素.parentElement`：包住它的父元素。',
          '`元素.children`：它的子元素清單。`children.length` 是個數，`children[0]` 是第一個，和陣列一樣從 0 數起。',
        ] },
        { type: 'example', id: 'web08-tree' },
        { type: 'p', text: 'script.js 的第 1 行用 `document.querySelector(\'#books\')` 找到 id 是 books 的清單，`const` 替它取名為 `list`（用 `const` 宣告的名稱，之後不能改指別的東西）。後面五行都只是「讀」這棵樹，再用 `console.log` 印到主控台。把主控台和預覽下方的「瀏覽器建立的 DOM 樹」對照著看：本站的主控台用 `<ul#books>` 這種「標籤#id」的寫法代表一個元素；`list.parentElement` 是 `<main>`，`list.children.length` 是 2，第一個子元素的文字是「島嶼植物圖鑑」。最後一行印出的是 3，不是 2：`body` 的子元素除了 `h1` 與 `main`，還有裝著 script.js 的 `script` 元素，本站把它放在 `body` 的最後。這個位置很重要，下一節馬上會用到。' },
        { type: 'callout', tone: 'note', title: '屬性與特性：兩個容易混在一起的詞', text: 'HTML 標籤裡寫的 `id="books"`、`href="#"` 叫屬性（attribute）；JavaScript 物件身上用句點取用的 `textContent`、`children` 叫特性（property）。英文是兩個不同的字，中文資料卻常常都寫成「屬性」。這一課固定用「屬性」指 HTML 的 attribute，用「特性」指物件的 property；兩者之間的關係，第四節會說明。' },
      ],
    },
    {
      id: 'web08-s-timing', title: '指令稿在什麼時候執行',
      blocks: [
        { type: 'p', text: '瀏覽器解析 HTML 是由上往下、邊讀邊建立 DOM 樹的。讀到一般的 `<script>` 時，它會先停下來，把那份指令稿從頭執行到尾，然後才繼續解析後面的 HTML。所以指令稿執行的那一刻，樹上只有寫在它前面的元素；寫在它後面的，還不存在。下面的頁面把 `<script src="script.js"></script>` 寫在 `<head>` 裡，這是很常見的寫法，也是「程式看起來沒寫錯，卻沒有反應」最常見的原因。' },
        { type: 'example', id: 'web08-too-early' },
        { type: 'p', text: '預覽裡的段落仍然是「開放時間載入中…」。看主控台：第一行是 `null`，表示第 1 行的 `querySelector` 什麼都沒找到，因為這時瀏覽器才讀到 `<head>`，`<body>` 和裡面的 `p#hours` 都還沒建立。第 3 行想設定 `null` 的 `textContent`，但 `null` 代表「沒有東西」，身上沒有任何特性可以設定，於是主控台出現紅色的 TypeError，後面標著「script.js 第 3 行」。錯誤一發生，這份指令稿就停在那裡：第 4 行的「文字換好了」沒有印出來。頁面本身不受影響，瀏覽器繼續把 HTML 解析完，所以標題與段落都在，只是沒有被改到。' },
        { type: 'callout', tone: 'warning', title: '看到 TypeError 提到 null，先查兩件事', text: '這種錯誤的意思是：你想讀取或設定某個特性，但句點前面的東西是 `null`。問題通常不在出錯的那一行，而在更前面：那個變數為什麼是 `null`？原因幾乎只有兩種。第一，選擇器寫錯了，例如漏了 `#`，或 id 的大小寫不一樣。第二，選擇器沒有錯，但指令稿執行得太早，元素還沒建立。各家瀏覽器顯示的錯誤文字不一樣，不需要背；認得 TypeError 這個字，再看它標的行號，就知道要從哪個變數查起。' },
        { type: 'p', text: '修正的方法有兩種，選一種就可以：' },
        { type: 'list', ordered: true, items: [
          '把 `<script src="script.js"></script>` 搬到 `</body>` 的前面。指令稿仍然是讀到就執行，但這時 `body` 裡的元素都已經在樹上了。本站的範例與練習如果沒有在 HTML 裡寫出這一行，用的就是這個位置：上一節 `body` 的第三個子元素就是它。',
          '留在 `<head>`，替標籤加上 `defer` 屬性：`<script src="script.js" defer></script>`。defer 是「延後」的意思：瀏覽器照常往下解析，等整份 HTML 都解析完才執行這份指令稿。它只對有 `src` 的外部指令稿有效。',
        ] },
        { type: 'example', id: 'web08-defer' },
        { type: 'p', text: '兩個範例的 script.js 一字不差，index.html 只多了 `defer` 這五個字母。這一次主控台的第一行是 `<p#hours>`，段落的文字換成「今天開放到 17:00。」，「文字換好了」也印出來了。有一點要說明：本站的預覽是用「把指令稿移到 `body` 的最後再執行」來做出 `defer` 的效果，所以這個範例的 DOM 樹裡，`script` 出現在 `body` 的最後；在一般的瀏覽器裡，它會留在 `head`，只是延後執行，結果相同。回到上一個出錯的範例，按「動手改這個範例」，把兩種修法都親手試一次。' },
      ],
    },
    {
      id: 'web08-s-select', title: '選取元素：querySelector 與 querySelectorAll',
      blocks: [
        { type: 'p', text: '要修改一個元素，得先拿到它。選取元素用的是 WEB05 學過的 CSS 選擇器：`#books`、`.notice`、`nav a` 這些寫法，原封不動放進引號裡就可以。最常用的方法有兩個，都可以從 `document` 找，也可以從某一個元素往下找：' },
        { type: 'table', head: ['寫法', '得到什麼', '找不到的時候'], rows: [
          ['`document.querySelector(\'選擇器\')`', '第一個符合的元素（依 HTML 裡出現的順序）', '`null`'],
          ['`document.querySelectorAll(\'選擇器\')`', '所有符合的元素，裝在一份清單（NodeList）裡', '一份空的清單，`length` 是 0'],
          ['`某個元素.querySelector(…)`、`某個元素.querySelectorAll(…)`', '只在那個元素裡面（它的子元素、孫元素…）尋找', '同樣是 `null` 或空的清單'],
        ] },
        { type: 'p', text: '另外還有 `document.getElementById(\'books\')`：只能用 id 找，括號裡不寫 `#`。它和 `document.querySelector(\'#books\')` 找到的是同一個元素，讀別人的程式時認得就好。' },
        { type: 'example', id: 'web08-select' },
        { type: 'p', text: '對照主控台的七行輸出。頁面上有五個 `li` 符合，`querySelector(\'li\')` 卻只給第一個「島嶼植物圖鑑」；要全部就用 `querySelectorAll`，它的 `length` 是 5。第 7、8 行先選到 `#popular` 這份清單，再從它裡面找 `li`，所以只有 3 個：把範圍縮小到一個元素裡，就不會選到別處同名的元素。清單可以用 `forEach` 逐一處理：括號裡的 `(item) => { … }` 是箭頭函式（arrow function），一種不必取名字的函式寫法；`forEach` 會替清單裡的每個元素各呼叫它一次，並把那個元素放進 `item`。你熟悉的 `for (const item of 清單)` 也可以用。' },
        { type: 'p', text: '最後六行示範「找不到」的情況：頁面上沒有任何元素帶有 `sold-out` 類別，所以 `querySelector` 得到 `null`。`null` 放在 `if` 的條件裡算是不成立，程式走到 `else`，印出一行說明，而不是像上一節那樣出錯停住。只要一個元素有可能不在頁面上，使用之前就先用 `if` 檢查。' },
        { type: 'callout', tone: 'warning', title: 'querySelectorAll 給的是清單，不是元素', text: '即使只有一個元素符合，`querySelectorAll` 得到的仍然是一份清單。對清單寫 `document.querySelectorAll(\'li\').textContent = \'已借出\'` 不會出錯，卻也改不到任何一個 `li`：你只是在清單這個物件上多放了一筆資料。要改每一個元素，就用 `forEach` 或 `for…of` 逐一處理；只要第一個，就改用 `querySelector`。這份清單也不是陣列，沒有 `map`、`filter` 這些陣列方法。它還是選取當下的結果：之後頁面多了新的 `li`，舊的清單不會跟著變長，需要時要再選一次，最後一節會看到實例。' },
      ],
    },
    {
      id: 'web08-s-modify', title: '修改內容與屬性',
      blocks: [
        { type: 'p', text: '選到元素之後，最常做的事是修改內容與屬性。先說內容：`textContent` 是元素裡的全部文字。讀它，得到一個字串；用 `=` 指定新的字串，元素裡原本的內容就整個被換掉，裡面如果有子元素也會一起消失。指定的字串一律當成純文字：就算裡面有 `<b>` 這樣的字元，也只會原樣顯示，不會變成標籤。' },
        { type: 'example', id: 'web08-modify' },
        { type: 'p', text: '這份指令稿把一頁公告改了五個地方。標題換成「小島圖書館公告」；連結的 `href` 從 `#` 換成 `https://example.com/hours`（主控台第一行的 `#` 是修改之前讀到的值）；輸入欄位填進了 `A-1024`；按鈕變成不能按的樣子。再看公告那一段：交給 `textContent` 的字串裡有 `<b>` 與 `</b>`，畫面上就真的顯示這幾個字元，DOM 樹的 `p#notice` 底下也沒有 `b` 元素。最後兩行和外觀有關，留到下一節。' },
        { type: 'callout', tone: 'warning', title: '不要把別人輸入的文字交給 innerHTML', text: '元素還有一個特性叫 `innerHTML`：指定給它的字串會被當成 HTML 解析，`<b>` 會變成真的元素。按「動手改這個範例」，把第 12 行的 `textContent` 改成 `innerHTML`，「颱風天」就變成粗體了。方便，但是危險：如果那段字串來自使用者的輸入、網址或別的網站，對方就能塞進任意的標籤，甚至夾帶會在你的頁面上執行的程式。所以只是要放文字的時候，一律用 `textContent`；需要新的元素，就用最後一節的 `createElement`。' },
        { type: 'p', text: '再說屬性。HTML 標籤上寫的每一個屬性，都可以用 `getAttribute(\'名稱\')` 讀取、用 `setAttribute(\'名稱\', \'值\')` 設定，第 5、6 行就是這樣處理 `href`。常用的屬性另外有對應的特性，直接用句點讀寫更方便，值的型別也比較好用：`disabled` 與 `checked` 是 `true` 或 `false`，不是字串。兩者讀到的值不一定相同：`getAttribute(\'href\')` 是 HTML 裡寫的原樣，`link.href` 則是瀏覽器補成完整網址之後的結果。表單欄位要特別注意：使用者在欄位裡打的字放在 `value` 特性裡，HTML 的 `value` 屬性只是一開始的預設值，所以讀使用者的輸入要用 `欄位.value`。範例的 DOM 樹正好看得到這個差別：`button#send` 多了 `disabled` 屬性，`input#card` 卻沒有 `value` 屬性，欄位裡的 `A-1024` 只存在特性裡。' },
        { type: 'table', head: ['特性', '是什麼', '例子'], rows: [
          ['`textContent`', '元素裡的文字', '`heading.textContent = \'小島圖書館公告\'`'],
          ['`href`', '連結的目的地，對應 `href` 屬性', '`link.href = \'https://example.com/hours\'`'],
          ['`value`', '表單欄位目前的內容，是字串', '`field.value = \'A-1024\'`'],
          ['`disabled`', '控制項是否停用', '`button.disabled = true`'],
          ['`checked`', '核取方塊或選項按鈕是否被選取', '`box.checked = true`'],
          ['`classList`', '元素的類別（class），下一節說明', '`notice.classList.add(\'alert\')`'],
          ['`dataset`', '元素上以 `data-` 開頭的自訂屬性', '`item.dataset.days`'],
        ] },
      ],
    },
    {
      id: 'web08-s-classes', title: '用類別改變外觀',
      blocks: [
        { type: 'p', text: '想用程式改變外觀，最直接的念頭是「把顏色改掉」。但 WEB01 說過，外觀是 CSS 的工作。比較好的分工是：樣式表先寫好「某個類別長什麼樣子」，JavaScript 只決定「哪個元素有這個類別」。上一個範例的 style.css 有一條 `.alert` 規則（紅字、淡紅色的底），第 13 行的 `notice.classList.add(\'alert\')` 替公告加上這個類別，規則就套用上去了。之後想把紅色換成橘色，只要改 CSS，程式一行都不必動。' },
        { type: 'p', text: '每個元素的 `classList` 特性管理它的類別，常用的方法有四個：' },
        { type: 'table', head: ['方法', '做什麼', '之後的結果'], rows: [
          ['`classList.add(\'alert\')`', '加上類別；已經有了就不會重複加', '元素有 `alert` 類別'],
          ['`classList.remove(\'alert\')`', '拿掉類別；本來就沒有也不會出錯', '元素沒有 `alert` 類別'],
          ['`classList.toggle(\'alert\')`', '切換：有就拿掉，沒有就加上', '和原本相反'],
          ['`classList.contains(\'alert\')`', '詢問有沒有這個類別，不做任何修改', '得到 `true` 或 `false`'],
        ] },
        { type: 'p', text: '回到上一個範例做兩個實驗。把第 13 行的 `add` 改成 `remove` 再執行：公告回到一般的文字顏色，主控台的最後一行變成 `false`。再改成 `toggle`：公告原本沒有這個類別，所以結果和 `add` 相同；把這一行複製成兩行，連續切換兩次，類別又不見了。' },
        { type: 'p', text: '判斷「哪些元素該加上類別」常常需要資料。HTML 允許你在元素上放自訂的 `data-` 屬性，例如 `<li data-days="21">潮汐的故事</li>` 記著這本書借了 21 天。在 JavaScript 裡用 `item.dataset.days` 讀取，得到的是字串 `\'21\'`；要比大小或計算之前，先用 `Number(…)` 轉成數字。練習二就是用它找出逾期的書。' },
        { type: 'callout', tone: 'warning', title: '類別名稱前面不要加句點', text: '句點是 CSS 選擇器的寫法：`.alert` 的意思是「有 alert 類別的元素」。`classList` 的方法要的是類別名稱本身，所以是 `classList.add(\'alert\')`。寫成 `classList.add(\'.alert\')` 不會出錯：元素會得到一個名字真的叫「.alert」的類別，樣式表的 `.alert` 規則選不到它，畫面沒有任何變化，主控台也沒有任何提示。反過來，`querySelector` 要的是選擇器，句點與 `#` 就不能省。' },
        { type: 'callout', tone: 'tip', title: '什麼時候才直接改 style', text: '元素也有 `style` 特性：`notice.style.color = \'red\'` 會直接在那個元素上寫一條行內樣式。它的問題和 WEB05 提過的行內樣式一樣：外觀散落在程式裡，樣式表的規則很難再蓋過它。只有數值是程式算出來的、沒辦法事先寫成規則的時候才用它，例如依照進度設定長條的寬度：`bar.style.width = percent + \'%\'`。' },
      ],
    },
    {
      id: 'web08-s-create', title: '建立元素並插入頁面',
      blocks: [
        { type: 'p', text: '最後一步，是讓頁面長出 HTML 裡原本沒有的元素。建立元素並插入頁面，固定是三個動作：' },
        { type: 'list', ordered: true, items: [
          '`document.createElement(\'li\')`：建立一個新的 `li` 元素。這時它只存在於記憶體裡，還不在 DOM 樹上，畫面上看不到。',
          '設定它的內容與屬性：`item.textContent = …`、`item.classList.add(…)`，寫法和前兩節完全相同。',
          '把它插入樹上的某個位置，例如用 `list.append(item)` 接到 `list` 的最後。這一刻它才出現在畫面上。',
        ] },
        { type: 'p', text: '資料有好幾筆的時候，把這三個動作放進迴圈，每一筆資料就產生一個元素。依照資料產生畫面，正是網頁程式最常做的事。' },
        { type: 'example', id: 'web08-create' },
        { type: 'p', text: 'index.html 的清單只寫了一本書，另外三本是 script.js 依照陣列 `titles` 產生的。迴圈每跑一圈，就建立一個新的 `li`、填入書名、接到清單的最後，所以順序和陣列相同。第 11 到 13 行再建立一個段落，放在清單的後面。其中用反引號包起來的字串是樣板字面值（template literal）：`${ }` 裡的算式會先算出結果，再放進字串；這裡算的是 `list.children.length`，也就是 4。第 15 行把一開始的「書單整理中…」從頁面移除。展開 DOM 樹：`ul#books` 底下有四個 `li`，後面跟著一個 `p`。其中三個 `li` 和這個 `p` 都是程式建立的，在 index.html 的原始碼裡找不到。' },
        { type: 'p', text: '主控台印出的是 `1 4`。第 3 行在迴圈之前就選好了 `before`，當時清單裡只有 1 個 `li`；後來清單變成 4 個，`before.length` 仍然是 1，重新選一次才是 4。這就是第三節說的：`querySelectorAll` 的結果停在選取的那一刻。`children` 則不同，`list.children` 永遠是清單目前的子元素。插入與移除的方法整理如下，`x` 是要插入的元素：' },
        { type: 'table', head: ['寫法', '結果'], rows: [
          ['`parent.append(x)`', '`x` 成為 `parent` 的最後一個子元素'],
          ['`parent.prepend(x)`', '`x` 成為 `parent` 的第一個子元素'],
          ['`el.before(x)`', '`x` 放在 `el` 的前面，和 `el` 同一層'],
          ['`el.after(x)`', '`x` 放在 `el` 的後面，和 `el` 同一層'],
          ['`el.remove()`', '把 `el` 連同它裡面的內容從樹上拿掉'],
        ] },
        { type: 'p', text: '在範例裡把第 8 行的 `append` 改成 `prepend` 再執行，新書會一本一本插到最前面，順序變成和陣列相反。另外，舊一點的程式常見 `parent.appendChild(x)`，接一個元素時效果和 `append` 相同。' },
        { type: 'callout', tone: 'warning', title: '同一個元素不會同時出現在兩個地方', text: '`createElement` 呼叫一次，就只有一個元素。如果把它寫在迴圈外面，迴圈裡只是反覆修改同一個元素的文字，再把它「接」到清單上，結果清單只多出一個項目，文字是最後一筆資料：把已經在樹上的元素再插入一次，是搬動它，不是複製它。要幾個元素，就要呼叫幾次 `createElement`，所以它必須寫在迴圈裡面。另一個常見的疏忽是建立了元素卻忘記插入：程式不會出錯，畫面上就是沒有東西。' },
        { type: 'callout', tone: 'note', title: '這一課的指令稿只執行一次', text: '到目前為止，每一份 script.js 都是在頁面載入時從頭到尾執行一次。要等使用者按下按鈕或送出表單才動作，需要「事件」，那是下一課 WEB09 的內容。到時候寫在事件裡的程式，做的仍然是這一課的三件事：選取、修改、建立。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'web08-q1', prompt: 'index.html 的 `<head>` 裡有 `<script src="script.js"></script>`（沒有 `defer`），`<body>` 裡有 `<p id="hours">載入中…</p>`。script.js 的內容如下，頁面載入後會怎樣？',
      code: { language: 'JavaScript', text: "const hours = document.querySelector('#hours');\nhours.textContent = '今天開放到 17:00。';" },
      options: [
        '段落的文字換成「今天開放到 17:00。」，因為瀏覽器會先讀完整份 HTML 才執行指令稿',
        '第 1 行就出錯：`querySelector` 找不到元素時會讓程式停下來',
        '第 1 行得到 `null`，第 2 行出現 TypeError；段落仍然是「載入中…」',
        '整個頁面變成空白，因為指令稿出錯之後，瀏覽器就不再解析後面的 HTML',
      ],
      answer: 2,
      explanation: '沒有 `defer` 的指令稿是讀到就執行：這時瀏覽器只解析到 `<head>`，`p#hours` 還不存在，所以 `querySelector` 得到 `null`；找不到元素本身不是錯誤，第 1 行不會出錯。第 2 行想設定 `null` 的 `textContent`，才出現 TypeError，指令稿停住。瀏覽器並不會先讀完整份 HTML（那是加了 `defer` 的行為），也不會因為指令稿出錯就停止解析：段落照常顯示，只是文字沒有被換掉。',
    },
    {
      id: 'web08-q2', prompt: '頁面上有三個 `li`，文字依序是「甲」「乙」「丙」。`document.querySelector(\'li\').textContent` 的值是什麼？',
      options: [
        '`\'甲\'`：`querySelector` 只給第一個符合的元素',
        '`\'甲乙丙\'`：三個元素的文字接在一起',
        '`\'丙\'`：給的是最後一個符合的元素',
        '`undefined`：符合的元素超過一個時，一定要改用 `querySelectorAll`',
      ],
      answer: 0,
      explanation: '`querySelector` 不管有幾個元素符合，都只交回第一個（依 HTML 裡出現的順序），所以讀到的是「甲」。它不會把多個元素合在一起，也不是取最後一個；符合的元素超過一個並不是錯誤，只是其餘的拿不到。要全部三個，才改用 `querySelectorAll`，再逐一讀取。',
    },
    {
      id: 'web08-q3', prompt: '頁面上沒有任何元素帶有 `sold-out` 類別。這段程式執行後，主控台的輸出是什麼？',
      code: { language: 'JavaScript', text: "const items = document.querySelectorAll('.sold-out');\nconsole.log(items.length);\nitems.forEach((item) => {\n  console.log(item.textContent);\n});\nconsole.log('結束');" },
      options: [
        '第 2 行出現 TypeError，因為 `items` 是 `null`',
        '依序是 `null`、`結束`',
        '依序是 `0`、`undefined`、`結束`',
        '依序是 `0`、`結束`',
      ],
      answer: 3,
      explanation: '`querySelectorAll` 找不到時給的是一份空的清單，不是 `null`，所以 `items.length` 是 0，不會出錯，也不會印出 `null`。對空的清單呼叫 `forEach`，裡面的函式一次都不會被呼叫，因此沒有 `undefined` 那一行；接著印出「結束」。會得到 `null` 的是 `querySelector`，這正是兩者在「找不到」時的差別。',
    },
    {
      id: 'web08-q4', prompt: '使用者在留言欄輸入了 `<b>好書</b>`，程式把這個字串放在變數 `typed` 裡，再執行 `message.textContent = typed;`。頁面上的 `message` 元素會顯示什麼？',
      options: [
        '粗體的「好書」',
        '`<b>好書</b>` 這幾個字元原樣顯示，沒有粗體',
        '什麼都不顯示，因為 `textContent` 會拒絕含有標籤的字串',
        '「好書」兩個字：標籤被自動去掉，但沒有粗體',
      ],
      answer: 1,
      explanation: '交給 `textContent` 的字串一律當成純文字，角括號也只是普通的字元，所以畫面上原樣出現 `<b>好書</b>`，DOM 裡不會多出 `b` 元素。會把字串當成 HTML 解析、顯示成粗體的是 `innerHTML`，也因此不該把使用者輸入的文字交給它。`textContent` 不會拒絕或刪改字串，它只是不解析。',
    },
    {
      id: 'web08-q5', prompt: 'HTML 裡有 `<li data-days="21">潮汐的故事</li>`，變數 `item` 是這個元素。`item.dataset.days + 1` 的結果是什麼？',
      options: [
        '數字 `22`',
        '`undefined`，因為 `data-days` 不是 HTML 內建的屬性',
        '出現 TypeError，因為字串不能做加法',
        '字串 `\'211\'`',
      ],
      answer: 3,
      explanation: '`dataset` 讀到的值都是字串，`item.dataset.days` 是 `\'21\'`。JavaScript 的 `+` 只要有一邊是字串，就會把兩邊接起來，所以結果是 `\'211\'`，不是 22，也不會出錯。`data-` 開頭的自訂屬性是 HTML 允許的寫法，讀得到值，不是 `undefined`。要得到 22，得先轉成數字：`Number(item.dataset.days) + 1`。',
    },
    {
      id: 'web08-q6', prompt: '圖書館想讓逾期的書顯示成紅色粗體，日後還可能換成別的顏色。下列哪一種做法最符合這一課建議的分工？',
      options: [
        '樣式表寫 `.overdue` 規則，程式用 `item.classList.add(\'overdue\')` 替逾期的項目加上類別',
        '程式對每個逾期的項目執行 `item.style.color = \'red\'` 與 `item.style.fontWeight = \'bold\'`',
        '程式用 `item.innerHTML` 在書名外面包一層帶有 `style` 屬性的標籤',
        '樣式表寫 `.overdue` 規則，程式用 `item.classList.add(\'.overdue\')` 加上類別',
      ],
      answer: 0,
      explanation: '外觀留在 CSS、程式只決定哪個元素有類別：日後換顏色只要改樣式表的 `.overdue` 規則。直接改 `style` 也能變紅，但外觀散落在程式裡，樣式表很難再蓋過行內樣式。用 `innerHTML` 重組內容既繞遠路，又有把資料當成 HTML 解析的風險。最後一個選項多了句點：元素得到的類別叫「.overdue」，`.overdue` 規則選不到它，畫面不會變。',
    },
    {
      id: 'web08-q7', prompt: '這段程式執行後，使用者在頁面上看得到「星空觀察手冊」這個新項目嗎？',
      code: { language: 'JavaScript', text: "const item = document.createElement('li');\nitem.textContent = '星空觀察手冊';\nconsole.log(item.textContent);" },
      options: [
        '看得到：`createElement` 會自動把新元素接到 `body` 的最後',
        '看不到：元素建立了、文字也設定了，但沒有用 `append` 之類的方法把它插入 DOM 樹',
        '看不到，而且第 3 行會出錯，因為還沒插入頁面的元素不能讀取 `textContent`',
        '看得到：一設定 `textContent`，瀏覽器就會把元素顯示出來',
      ],
      answer: 1,
      explanation: '`createElement` 只在記憶體裡建立元素，不會自動放進頁面；設定文字也不會讓它出現。要到 `list.append(item)` 這類插入的動作之後，它才在 DOM 樹上、才看得到。還沒插入的元素仍然是正常的物件，讀寫 `textContent` 都可以，所以第 3 行不會出錯，主控台會印出「星空觀察手冊」，只是頁面上沒有它。',
    },
    {
      id: 'web08-q8', prompt: '`#books` 清單原本有 2 個 `li`。這段程式執行後，主控台印出什麼？',
      code: { language: 'JavaScript', text: "const list = document.querySelector('#books');\nconst items = list.querySelectorAll('li');\n\nconst item = document.createElement('li');\nitem.textContent = '海風食譜';\nlist.append(item);\n\nconsole.log(items.length, list.children.length);" },
      options: ['`3 3`', '`2 2`', '`2 3`', '`3 2`'],
      answer: 2,
      explanation: '`querySelectorAll` 的結果停在選取的那一刻：`items` 是在插入之前選的，之後清單多了一個 `li`，`items.length` 仍然是 2。`list.children` 則永遠是清單目前的子元素，插入之後是 3，所以印出 `2 3`。`3 3` 誤以為舊的清單會自動更新；`2 2` 誤以為 `append` 沒有生效；`3 2` 則把兩者的性質弄反了。',
    },
  ],
  webCode: { examples, exercises },
};
