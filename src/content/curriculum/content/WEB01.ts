import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB01 How the Web Works (WEB-1). The first web-code lesson: one small page of a made-up island library shown three
 * times (HTML only, plus CSS, plus six lines of JavaScript), then the steps from URL to pixels, the DOM as the
 * browser's own tree (scripts change it, the parser fills in omitted tags) and the developer tools. Every `observe`
 * fact and every exercise (solution, starter, mistakes) is run in Chromium by the tests. Names and addresses are made up.
 */

const lines = (...text: string[]) => text.join('\n');

/** The library page: the same HTML in the first three examples and in exercises 2 and 3. */
const PAGE_HTML = lines(
  '<h1>小島圖書館</h1>',
  '<p>歡迎來到島上唯一的圖書館。</p>',
  '<p id="hours">今天開放到 17:00。</p>',
  '<button id="toggle">顯示週末時間</button>',
);
const PAGE_CSS = lines(
  'body {',
  '  font-family: sans-serif;',
  '  margin: 16px;',
  '}',
  'h1 {',
  '  color: #1a5276;',
  '}',
  '#hours {',
  '  background-color: #fef9e7;',
  '  padding: 8px;',
  '}',
);
const PAGE_JS = lines(
  "const button = document.querySelector('#toggle');",
  "const hours = document.querySelector('#hours');",
  '',
  "button.addEventListener('click', () => {",
  "  hours.textContent = '週末開放到 12:00。';",
  "  console.log('按鈕被按下，已換成週末時間');",
  '});',
);

const examples: WebExample[] = [
  {
    id: 'web01-html-only', title: '只有 HTML 的小島圖書館',
    description: '四個元素：一個標題、兩個段落、一個按鈕。沒有 CSS，也沒有 JavaScript。',
    files: { html: PAGE_HTML },
    observe: [
      { check: 'count', selector: 'body > h1', count: 1, label: '`body` 裡有一個 `h1` 標題' },
      { check: 'count', selector: 'body > p', count: 2, label: '`body` 裡有兩個段落 `p`' },
      { check: 'style', selector: 'h1', property: 'font-weight', value: 'bold', label: '沒有寫任何 CSS，`h1` 仍是粗體：這是瀏覽器內建的預設樣式' },
      { do: 'click', selector: '#toggle' },
      { check: 'text', selector: '#hours', text: '今天開放到 17:00。', label: '按下按鈕之後，`#hours` 的文字沒有改變：沒有 JavaScript，按鈕就沒有行為' },
    ],
  },
  {
    id: 'web01-with-css', title: '同一份 HTML，加上 CSS',
    description: 'index.html 和上一個範例一字不差；style.css 的三條規則改變了字型、標題的顏色與開放時間的底色。',
    files: { html: PAGE_HTML, css: PAGE_CSS },
    observe: [
      { check: 'style', selector: 'h1', property: 'color', value: '#1a5276', label: '`h1` 的文字顏色是 `#1a5276`（深藍色）' },
      { check: 'style', selector: '#hours', property: 'background-color', value: '#fef9e7', label: '`#hours` 的背景色是 `#fef9e7`（淡黃色）' },
      { check: 'style', selector: '#hours', property: 'padding-top', value: '8px', label: '`#hours` 的文字和底色的邊緣之間有 8px 的內距' },
      { check: 'text', selector: 'h1', text: '小島圖書館', label: '標題的文字仍是「小島圖書館」：CSS 不會改動內容' },
      { check: 'count', selector: 'body > p', count: 2, label: '段落仍是兩個：CSS 沒有增加或減少任何元素' },
    ],
  },
  {
    id: 'web01-with-js', title: '再加上 JavaScript：按鈕有反應了',
    description: 'index.html 與 style.css 都沒有變；script.js 在按鈕被點擊時換掉 `#hours` 的文字，並在主控台留下一行訊息。',
    files: { html: PAGE_HTML, css: PAGE_CSS, js: PAGE_JS },
    observe: [
      { check: 'text', selector: '#hours', text: '今天開放到 17:00。', label: '按下按鈕之前，`#hours` 的文字和 HTML 裡寫的一樣' },
      { check: 'console', lines: [], label: '按下按鈕之前，主控台沒有任何輸出：函式裡的程式還沒有執行' },
      { do: 'click', selector: '#toggle' },
      { check: 'text', selector: '#hours', text: '週末開放到 12:00。', label: '按下按鈕之後，`#hours` 的文字變成「週末開放到 12:00。」' },
      { check: 'console', lines: ['按鈕被按下，已換成週末時間'], label: '按下按鈕之後，主控台多了一行 `console.log` 的訊息' },
    ],
  },
  {
    id: 'web01-live-dom', title: 'HTML 裡兩本書，畫面上三本',
    description: 'index.html 的清單只有兩個 `li`；script.js 在頁面載入時建立第三個，接到清單的最後。',
    files: {
      html: lines(
        '<h1>本週新書</h1>',
        '<ul id="books">',
        '  <li>島嶼植物圖鑑</li>',
        '  <li>潮汐的故事</li>',
        '</ul>',
      ),
      js: lines(
        "const list = document.querySelector('#books');",
        "const item = document.createElement('li');",
        "item.textContent = '星空觀察手冊';",
        'list.append(item);',
        "console.log('清單現在有', list.children.length, '本書');",
      ),
    },
    observe: [
      { check: 'count', selector: '#books > li', count: 3, label: 'index.html 只寫了兩個 `li`，DOM 裡的清單卻有三個' },
      { check: 'text', selector: '#books > li:last-child', text: '星空觀察手冊', label: '清單的最後一個項目是 JavaScript 加上去的「星空觀察手冊」' },
      { check: 'console', lines: ['清單現在有 3 本書'], label: '主控台印出「清單現在有 3 本書」' },
    ],
  },
  {
    id: 'web01-repair', title: '瀏覽器替你補上的標籤',
    description: '三個 `<p>` 都沒有寫 `</p>`，表格的 `<tr>` 直接寫在 `<table>` 裡。看看瀏覽器建立的 DOM 長什麼樣子。',
    files: {
      html: lines(
        '<h1>開放時間</h1>',
        '<p>平日與週末的時間不同',
        '<table>',
        '  <tr><th>日期</th><th>時間</th></tr>',
        '  <tr><td>週一到週五</td><td>09:00–17:00</td></tr>',
        '  <tr><td>週六、週日</td><td>09:00–12:00</td></tr>',
        '</table>',
        '<p>國定假日休館',
        '<p>颱風停班停課時休館',
      ),
    },
    observe: [
      { check: 'count', selector: 'table > tbody', count: 1, label: '原始碼沒有寫 `tbody`，瀏覽器在 `table` 裡補上了一個' },
      { check: 'count', selector: 'table > tbody > tr', count: 3, label: '三個 `tr` 都是 `tbody` 的子元素' },
      { check: 'count', selector: 'table > tr', count: 0, label: '沒有任何 `tr` 是 `table` 的直接子元素' },
      { check: 'count', selector: 'body > p', count: 3, label: '三個沒有寫結束標籤的 `p`，各自成為 `body` 底下獨立的段落' },
      { check: 'count', selector: 'p table, p p', count: 0, label: '沒有任何段落把表格或另一個段落包在裡面' },
    ],
  },
];

const exercises: WebExercise[] = [
  {
    id: 'web01-x-heading', title: '修正標題，再加一個段落',
    statement: '島民回報館名打錯了。把 `h1` 的文字改成「小島圖書館」，再在原本的段落後面加一個新的段落（`p`），文字是「今天開放到 17:00。」。原本的段落要保留，頁面只能有一個 `h1`。',
    hints: [
      '標題的文字就寫在 `<h1>` 與 `</h1>` 之間，直接改字即可。',
      '新的段落要有自己的開始標籤與結束標籤；在同一個段落裡按 Enter 換行不算新的段落。',
      '在第一個 `</p>` 的下一行，用 `<p>` 與 `</p>` 把「今天開放到 17:00。」包起來。',
    ],
    explanation: '內容與結構是 HTML 的工作：改字就改標籤之間的文字，多一個段落就多寫一組 `<p>…</p>`。瀏覽器依照標籤建立 DOM，所以檢查看的是 DOM 裡有一個 `h1`、兩個相鄰的 `p`，以及它們各自的文字，而不是你怎麼排版原始碼。',
    starter: { html: lines('<h1>小島圖書管</h1>', '<p>歡迎來到島上唯一的圖書館。</p>') },
    solution: { html: lines('<h1>小島圖書館</h1>', '<p>歡迎來到島上唯一的圖書館。</p>', '<p>今天開放到 17:00。</p>') },
    steps: [
      { check: 'count', selector: 'h1', count: 1, label: '頁面只有一個 `h1`' },
      { check: 'text', selector: 'h1', text: '小島圖書館', label: '`h1` 的文字是「小島圖書館」' },
      { check: 'count', selector: 'p', count: 2, label: '頁面有兩個段落' },
      { check: 'text', selector: 'p', text: '歡迎來到島上唯一的圖書館。', label: '第一個段落維持原本的文字' },
      { check: 'text', selector: 'p + p', text: '今天開放到 17:00。', label: '緊接在後的第二個段落，文字是「今天開放到 17:00。」' },
    ],
    mistakes: [
      {
        files: { html: lines('<h1>小島圖書館</h1>', '<p>歡迎來到島上唯一的圖書館。', '今天開放到 17:00。</p>') },
        why: '在原始碼裡按 Enter 換行，不會產生新的段落：瀏覽器把連續的空白與換行當成一個空白，兩句話仍在同一個 `p` 裡。段落靠的是標籤，不是換行。',
      },
      {
        files: { html: lines('<h1>小島圖書館</h1>', '<p>歡迎來到島上唯一的圖書館。</p>', '<h1>今天開放到 17:00。</h1>') },
        why: '想讓開放時間醒目一點而用了 `h1`，頁面就有兩個主標題，而且那一行不再是段落。標籤說的是「這是什麼」；要醒目是 CSS 的工作。',
      },
    ],
  },
  {
    id: 'web01-x-color', title: '替標題上色',
    statement: 'index.html 不能改。在 style.css 的 `h1` 規則裡加一條宣告，讓標題的文字顏色變成 `teal`（藍綠色）。只改標題的文字顏色：`h1` 不要加背景色，段落的文字要維持 `body` 規則設定的 `#222222`。',
    hints: [
      '文字顏色的屬性是 `color`；一條宣告寫成「屬性: 值;」。',
      '宣告要寫在 `h1` 後面的大括號裡，才只會套用到標題。',
      '在 `h1 {` 與 `}` 之間加一行 `color: teal;`，冒號與分號都不能少。',
    ],
    explanation: '外觀是 CSS 的工作，所以 HTML 一個字都不用動。規則 `h1 { color: teal; }` 的選擇器 `h1` 決定套用到誰，宣告 `color: teal;` 決定改成什麼；檢查讀的是瀏覽器計算後的樣式，所以把 `teal` 寫成 `#008080` 也會通過。',
    fixed: { html: PAGE_HTML },
    starter: { css: lines('body {', '  font-family: sans-serif;', '  color: #222222;', '}', '', 'h1 {', '', '}') },
    solution: { css: lines('body {', '  font-family: sans-serif;', '  color: #222222;', '}', '', 'h1 {', '  color: teal;', '}') },
    steps: [
      { check: 'style', selector: 'h1', property: 'color', value: 'teal', label: '`h1` 的文字顏色是 `teal`' },
      { check: 'style', selector: 'h1', property: 'background-color', value: 'transparent', label: '`h1` 沒有背景色（維持透明）' },
      { check: 'style', selector: 'p', property: 'color', value: '#222222', label: '段落的文字顏色維持 `#222222`' },
    ],
    mistakes: [
      {
        files: { css: lines('body {', '  font-family: sans-serif;', '  color: #222222;', '}', '', 'h1 {', '  colour: teal;', '}') },
        why: '屬性名稱拼成了 `colour`。CSS 遇到不認得的屬性會略過那一條宣告，頁面上不會出現任何錯誤訊息，標題只是維持原本的顏色。',
      },
      {
        files: { css: lines('body {', '  font-family: sans-serif;', '  color: #222222;', '}', '', 'h1 {', '  background-color: teal;', '}') },
        why: '`background-color` 改的是元素的背景，不是文字：標題多了一塊藍綠色的底，字的顏色沒有變。文字顏色的屬性是 `color`。',
      },
      {
        files: { css: lines('body {', '  font-family: sans-serif;', '  color: teal;', '}', '', 'h1 {', '', '}') },
        why: '把顏色寫進 `body` 的規則，整頁的文字都跟著變：文字顏色會由父元素傳給裡面的元素，所以段落也成了 teal。題目只要標題變色，宣告要寫在 `h1` 的規則裡。',
      },
    ],
  },
  {
    id: 'web01-x-click', title: '讓按鈕換掉開放時間',
    statement: 'index.html 與 style.css 不能改。script.js 已經找到按鈕與段落，也登記了點擊事件；請在函式的大括號裡補上一行，讓按下「顯示週末時間」之後，`#hours` 的文字變成「週末開放到 12:00。」。按下之前頁面要維持原樣，按鈕上的文字不要改。',
    hints: [
      '元素的文字放在它的 `textContent` 裡，用 `=` 指定一個新的字串就能換掉。',
      '要改的是 `hours` 指到的那個元素，而且這一行必須寫在 `() => {` 與 `}` 之間，才會等到點擊時才執行。',
      "把註解那一行換成 `hours.textContent = '…';`，引號裡放題目指定的那句話，句號也要一樣。",
    ],
    explanation: '行為是 JavaScript 的工作。`addEventListener` 只是向按鈕登記「被點擊時執行這個函式」，函式裡的 `hours.textContent = …` 要等到點擊才會執行，所以按下之前文字不變、按下之後 DOM 裡那個段落的文字被換掉，瀏覽器隨即重畫畫面。',
    fixed: { html: PAGE_HTML, css: PAGE_CSS },
    starter: {
      js: lines(
        "const button = document.querySelector('#toggle');",
        "const hours = document.querySelector('#hours');",
        '',
        "button.addEventListener('click', () => {",
        '  // 在這一行寫程式：把 hours 的文字換成「週末開放到 12:00。」',
        '});',
      ),
    },
    solution: {
      js: lines(
        "const button = document.querySelector('#toggle');",
        "const hours = document.querySelector('#hours');",
        '',
        "button.addEventListener('click', () => {",
        "  hours.textContent = '週末開放到 12:00。';",
        '});',
      ),
    },
    steps: [
      { check: 'text', selector: '#hours', text: '今天開放到 17:00。', label: '按下按鈕之前，`#hours` 仍是「今天開放到 17:00。」' },
      { do: 'click', selector: '#toggle' },
      { check: 'text', selector: '#hours', text: '週末開放到 12:00。', label: '按下按鈕之後，`#hours` 的文字是「週末開放到 12:00。」' },
      { check: 'text', selector: '#toggle', text: '顯示週末時間', label: '按鈕上的文字仍是「顯示週末時間」' },
      { check: 'count', selector: 'p', count: 2, label: '頁面仍然只有兩個段落' },
    ],
    mistakes: [
      {
        files: {
          js: lines(
            "const button = document.querySelector('#toggle');",
            "const hours = document.querySelector('#hours');",
            '',
            "hours.textContent = '週末開放到 12:00。';",
            "button.addEventListener('click', () => {",
            '});',
          ),
        },
        why: '把那一行寫在函式的大括號外面，頁面一載入就執行了：還沒按按鈕，文字就已經被換掉，按鈕反而什麼都不做。',
      },
      {
        files: {
          js: lines(
            "const button = document.querySelector('#toggle');",
            "const hours = document.querySelector('#hours');",
            '',
            "button.addEventListener('click', () => {",
            "  hours = '週末開放到 12:00。';",
            '});',
          ),
        },
        why: '`hours = …` 是想讓 `hours` 這個名稱改指向一個字串，而不是改元素裡的文字；`const` 宣告的名稱不能重新指定，所以按下按鈕時主控台出現錯誤，頁面沒有變。要改的是 `hours.textContent`。',
      },
      {
        files: {
          js: lines(
            "const button = document.querySelector('#toggle');",
            "const hours = document.querySelector('#hours');",
            '',
            "button.addEventListener('click', () => {",
            "  button.textContent = '週末開放到 12:00。';",
            '});',
          ),
        },
        why: '改到的是 `button` 指到的按鈕：按鈕上的字被換掉，段落 `#hours` 沒有變。先想清楚要改的是哪一個元素，再用對應的變數。',
      },
    ],
  },
  {
    id: 'web01-x-repair', title: '修好 DOM 的結構，再加一本書',
    statement: '這個頁面整頁的字都又大又粗。展開預覽下方的「瀏覽器建立的 DOM 樹」，會看到 `p` 與 `ul` 都跑進 `h1` 裡了：原始碼少了一個結束標籤。請修好它，讓 `h1` 的文字只有「本週新書」，`p` 與 `ul` 都是 `body` 的直接子元素（和 `h1` 平行）；再在清單的最後加上第三本書「星空觀察手冊」，讓 `ul` 有三個 `li`。',
    hints: [
      '比較 `h1` 那一行和其他行：哪一個元素有開始標籤，卻沒有結束標籤？',
      '結束標籤要緊接在標題文字之後；放到檔案的最後面，段落和清單仍然被包在 `h1` 裡。',
      '第三本書是一個新的 `li`，要寫在 `</ul>` 之前，才是這份清單的子元素。改完按「執行」，再看一次 DOM 樹。',
    ],
    explanation: '少了 `</h1>`，瀏覽器不會報錯，而是把後面的 `p` 與 `ul` 都當成 `h1` 的子元素，它們就跟著用標題的大小與粗細顯示。補上 `</h1>` 之後，三個元素在 DOM 裡平行地排在 `body` 底下；新的 `li` 寫在 `<ul>` 與 `</ul>` 之間，成為清單的第三個子元素。',
    starter: {
      html: lines(
        '<h1>本週新書',
        '<p>新書放在一樓入口的展示架。</p>',
        '<ul>',
        '  <li>島嶼植物圖鑑</li>',
        '  <li>潮汐的故事</li>',
        '</ul>',
      ),
    },
    solution: {
      html: lines(
        '<h1>本週新書</h1>',
        '<p>新書放在一樓入口的展示架。</p>',
        '<ul>',
        '  <li>島嶼植物圖鑑</li>',
        '  <li>潮汐的故事</li>',
        '  <li>星空觀察手冊</li>',
        '</ul>',
      ),
    },
    steps: [
      { check: 'text', selector: 'h1', text: '本週新書', label: '`h1` 的文字只有「本週新書」' },
      { check: 'count', selector: 'h1 *', count: 0, label: '`h1` 裡面沒有其他元素' },
      { check: 'count', selector: 'body > p', count: 1, label: '段落 `p` 是 `body` 的直接子元素' },
      { check: 'count', selector: 'body > ul', count: 1, label: '清單 `ul` 是 `body` 的直接子元素' },
      { check: 'count', selector: 'ul > li', count: 3, label: '清單有三個 `li`' },
      { check: 'text', selector: 'ul > li:last-child', text: '星空觀察手冊', label: '清單的最後一個項目是「星空觀察手冊」' },
    ],
    mistakes: [
      {
        files: {
          html: lines(
            '<h1>本週新書',
            '<p>新書放在一樓入口的展示架。</p>',
            '<ul>',
            '  <li>島嶼植物圖鑑</li>',
            '  <li>潮汐的故事</li>',
            '  <li>星空觀察手冊</li>',
            '</ul>',
            '</h1>',
          ),
        },
        why: '把 `</h1>` 補在檔案的最後面，標籤是成對了，但段落和清單仍然被包在 `h1` 裡，整頁還是又大又粗。結束標籤的位置決定元素包住哪些內容。',
      },
      {
        files: {
          html: lines(
            '<h1>本週新書</h1>',
            '<p>新書放在一樓入口的展示架。</p>',
            '<ul>',
            '  <li>島嶼植物圖鑑</li>',
            '  <li>潮汐的故事</li>',
            '</ul>',
            '<li>星空觀察手冊</li>',
          ),
        },
        why: '第三個 `li` 寫在 `</ul>` 之後，它就不是這份清單的子元素：DOM 樹裡它和 `ul` 平行，清單仍然只有兩個項目。',
      },
    ],
  },
];

export const WEB01: LessonContent = {
  lessonId: 'WEB01',
  motivation: '每天打開的網頁，都是瀏覽器把三種語言拼起來的結果：HTML 寫內容、CSS 管外觀、JavaScript 讓頁面有反應。這一課用同一個「小島圖書館」頁面，一次加上一種語言，再跟著瀏覽器走一遍從網址到畫面的步驟。學完之後，看到任何網頁你都能打開開發者工具，分辨哪一部分是誰做的、出了問題該去哪一個檔案找。',
  sections: [
    {
      id: 'web01-roles', title: '瀏覽器與三種語言的分工',
      blocks: [
        { type: 'p', text: '瀏覽器（browser）是把網頁顯示出來的程式：你輸入網址，它向伺服器要回幾份文字檔，再照著這些文字把畫面畫出來。這些文字用三種語言寫成，各管一件事。先記住 HTML／CSS／JS 的分工，之後遇到問題才知道該改哪一個檔案：' },
        { type: 'table', head: ['語言', '負責什麼', '小島圖書館的例子', '少了它會怎樣'], rows: [
          ['HTML', '內容與結構：頁面上有哪些東西，誰是標題、誰是段落', '`<h1>小島圖書館</h1>`', '沒有內容，頁面是空的'],
          ['CSS', '外觀：顏色、字型、間距、排列方式', '`h1 { color: #1a5276; }`', '內容都在，只用瀏覽器的預設樣式顯示'],
          ['JavaScript（JS）', '行為：使用者操作之後，頁面要怎麼變', '按下按鈕，換掉開放時間', '這一頁仍然能閱讀，但按鈕沒有反應'],
        ] },
        { type: 'p', text: 'HTML（HyperText Markup Language，超文字標記語言）用標籤（tag）把內容標出來：`<h1>` 到 `</h1>` 之間是頁面的主標題，`<p>` 到 `</p>` 之間是一個段落。開始標籤、內容與結束標籤合起來叫一個元素（element）。開始標籤裡還可以寫屬性（attribute），格式是「名稱="值"」：`id="hours"` 替那個段落取了一個在頁面中唯一的名字，之後 CSS 與 JavaScript 都靠這個名字找到它。' },
        { type: 'example', id: 'web01-html-only' },
        { type: 'p', text: '先看預覽：沒有寫任何 CSS，標題卻又大又粗，那是瀏覽器內建的預設樣式。按一下按鈕，什麼都不會發生：HTML 只說「這裡有一個按鈕」，沒有說按了要做什麼。再展開預覽下方的「瀏覽器建立的 DOM 樹」：`body` 底下依序是 `h1`、兩個 `p` 與一個 `button`，其中 `p#hours` 的 `#hours` 就是它的 id。最上面的 `html`、`head` 與 `body` 是每一份網頁文件都有的骨架，下一課會介紹。這棵樹是什麼，第五節會說明；現在只要知道它是瀏覽器讀完 HTML 之後整理出來的結構。' },
        { type: 'callout', tone: 'warning', title: 'HTML 不是程式語言', text: 'HTML 是標記語言（markup language）：它描述「這是什麼」，沒有變數、條件判斷或迴圈，也不會被「執行」。你在基礎程式島學過的 `if` 與迴圈，在網頁裡是 JavaScript 的工作。把兩者混為一談，就會想在 HTML 裡寫邏輯，或是按鈕沒反應時一直回頭改 HTML。遇到問題先問自己：這是內容、外觀，還是行為？答案就是該打開的檔案。' },
      ],
    },
    {
      id: 'web01-css', title: '加上 CSS：內容不變，外觀改變',
      blocks: [
        { type: 'p', text: '為什麼外觀要另外寫？因為內容和外觀變動的時機不同：圖書館想把標題換個顏色時，不應該需要動到任何一行內容；同一份樣式表也能讓網站的每一頁共用，改一個地方，全站一起換。CSS（Cascading Style Sheets，階層式樣式表）由一條條規則組成，例如 `h1 { color: #1a5276; }`：大括號前面是選擇器（selector），說明這條規則套用到誰；大括號裡是宣告，寫成「屬性: 值;」。`h1` 選到所有的 `h1` 元素，`#hours` 選到 id 是 hours 的那一個元素。選擇器還有很多種，之後的 CSS 課會專門介紹，這一課只用這兩種。' },
        { type: 'example', id: 'web01-with-css' },
        { type: 'p', text: '比對兩個範例的 index.html：一個字都沒有改。變的只有外觀：`font-family: sans-serif` 把整頁換成無襯線字體，標題成了深藍色（`#1a5276` 是用十六進位寫的顏色，依序是紅、綠、藍的份量），開放時間多了淡黃色的底與 8px 的內距（padding）。再看 DOM 樹：`body` 裡的元素和上一個範例完全相同，只有 `head` 裡多了一個 `style`，那是本站把 style.css 的內容交給瀏覽器的地方。打開「動手改這個範例」，把 `#1a5276` 改成 `crimson` 再按「執行」，看看只改 CSS 能改變多少。' },
        { type: 'callout', tone: 'warning', title: 'CSS 寫錯了，瀏覽器不會提醒你', text: '把 `color` 拼成 `colour`、漏了冒號，或是值寫成瀏覽器不認得的字，瀏覽器會直接略過那一條宣告，其他宣告照常生效，頁面上不會出現任何錯誤訊息。所以「樣式沒有生效」時，第一件事是逐字核對屬性名稱與值的拼法，再確認宣告是不是寫在對的規則裡。' },
      ],
    },
    {
      id: 'web01-js', title: '加上 JavaScript：讓頁面有反應',
      blocks: [
        { type: 'p', text: '「行為」指的是：某件事發生之後，頁面要怎麼變。JavaScript 是真正的程式語言，有變數、函式、條件與迴圈；放在網頁裡的程式也叫指令稿（script）。它在頁面上最常做三件事：找到元素、等一個事件（event，例如按鈕被點擊）、在事件發生時改變頁面。下面的 script.js 只有六行，正好就是這三件事。' },
        { type: 'example', id: 'web01-with-js' },
        { type: 'table', head: ['行', '程式', '做什麼'], rows: [
          ['1', "`const button = document.querySelector('#toggle');`", '`document` 是瀏覽器交給程式的物件，代表整個頁面。`querySelector` 用和 CSS 相同的選擇器，找出第一個符合的元素；`const` 替它取一個之後不會改指別處的名稱 `button`。'],
          ['2', "`const hours = document.querySelector('#hours');`", '同樣的做法，找到 id 是 hours 的段落，取名為 `hours`。'],
          ['4', "`button.addEventListener('click', () => {`", '向按鈕登記：「被點擊（click）時，請執行這個函式」。`() => { … }` 是一個沒有名字的函式，大括號裡是它要做的事。登記的當下，大括號裡的程式不會執行。'],
          ['5', "`hours.textContent = '週末開放到 12:00。';`", '把那個段落的文字換成新的字串。'],
          ['6', "`console.log('按鈕被按下，已換成週末時間');`", '在主控台（console）留下一行訊息。這是程式向開發者回報的方式，訊息不會出現在頁面上。'],
          ['7', '`});`', '函式與 `addEventListener` 的呼叫到這裡結束。'],
        ] },
        { type: 'p', text: '按按鈕之前先看預覽下方：沒有「主控台」區塊，因為第 5、6 行在函式裡，還沒有被執行過。按下按鈕，段落的文字換了，主控台出現一行訊息；再展開 DOM 樹，`p#hours` 後面的文字也跟著變了。注意 index.html 這個檔案一個字都沒有變，變的是瀏覽器記憶體裡的那棵樹。另外，DOM 樹的 `body` 最後多了一個 `script`，那是本站放 script.js 的位置。' },
        { type: 'callout', tone: 'warning', title: '選擇器少了 # 就找不到元素', text: "`document.querySelector('hours')` 找的是名叫 `<hours>` 的標籤，頁面上沒有這種元素，得到的是 `null`（表示「沒有」，類似 Python 的 `None`）。接著想設定 `null` 的 `textContent`，程式就停在那一行，主控台出現紅色的錯誤，頁面上則沒有任何提示。按了沒反應時，先看主控台有沒有錯誤，再核對 id 與選擇器是否一字不差，大小寫也算。" },
      ],
    },
    {
      id: 'web01-loading', title: '從網址到畫面：頁面載入流程',
      blocks: [
        { type: 'p', text: '在網址列輸入 `https://library.example/` 按下 Enter，到看見畫面通常不到幾秒。這段時間裡，瀏覽器依序做了下面的事，合起來就是頁面載入流程：' },
        { type: 'table', head: ['步驟', '瀏覽器做什麼', '得到什麼'], rows: [
          ['1', '讀懂網址，用 DNS 把 `library.example` 這個名稱換成伺服器的 IP 位址', '伺服器的位置'],
          ['2', '用 HTTP 向伺服器送出請求，伺服器回傳這一頁的 HTML', '一份 HTML 文字'],
          ['3', '解析（parse）HTML：從頭讀起，把標籤變成一個個元素', 'DOM'],
          ['4', '遇到 HTML 引用的樣式表、指令稿與圖片，再發請求把它們下載回來', 'CSS、JavaScript、圖片等檔案'],
          ['5', '計算樣式：決定每個元素最後套用哪些 CSS 宣告', '每個元素的樣式'],
          ['6', '版面配置（layout）：算出每個元素的大小與位置', '每個盒子的尺寸與座標'],
          ['7', '繪製（paint）：把文字、顏色與邊框畫成像素', '螢幕上的畫面'],
          ['8', '執行 JavaScript、等待事件；程式一改動 DOM 或樣式，就重做受影響的第 5 到 7 步', '更新後的畫面'],
        ] },
        { type: 'p', text: '第 1、2 步屬於網路：名稱怎麼查、請求與回應長什麼樣子，是計算機網路島 CN12「DNS 與 HTTP」的內容，這裡只要記得「瀏覽器拿到的是一份 HTML 文字」。這張表也是簡化過的順序：瀏覽器不會等整份 HTML 下載完才動工，解析、下載與執行程式其實交錯進行。不變的是先後關係：要先有 DOM 與樣式才能排版，排好了才能畫。' },
        { type: 'p', text: '下面的頁面讓你親眼看到第 8 步。它的檔案已經在你的瀏覽器裡，所以第 1、2、4 步不會發生；其餘每一步都真的在預覽框裡進行。' },
        { type: 'example', id: 'web01-live-dom' },
        { type: 'p', text: '預覽裡有三本書，主控台印出「清單現在有 3 本書」，DOM 樹的 `ul#books` 底下也有三個 `li`，可是 index.html 明明只寫了兩個。第三個是程式建立的：`document.createElement(\'li\')` 做出一個新的 `li` 元素，下一行替它填上文字，`list.append(item)` 把它接到清單的最後，瀏覽器隨即重新排版、重畫。本站把 script.js 放在 `body` 的最後，所以它執行時，前面的清單已經在 DOM 裡了。' },
        { type: 'callout', tone: 'note', title: '畫面是算出來的，不是傳過來的', text: '伺服器傳來的只有文字（HTML、CSS、JavaScript）與圖片等檔案；螢幕上的每一個像素，都是你的瀏覽器在你的裝置上算出來的。所以同一個網頁在手機與電腦上可以排得不一樣，JavaScript 也才能不重新載入頁面就改變畫面。' },
      ],
    },
    {
      id: 'web01-dom', title: 'DOM：瀏覽器眼中的文件',
      blocks: [
        { type: 'p', text: 'DOM（Document Object Model，文件物件模型）是瀏覽器解析 HTML 之後，在記憶體裡建立的一棵樹。樹上的節點是元素與文字，元素身上帶著它的屬性。寫在某個元素裡面的元素是它的子元素（child），包住它的是父元素（parent）：`<ul>` 是每個 `<li>` 的父元素，同一層的 `<li>` 彼此是兄弟。CSS 的選擇器、JavaScript 的 `querySelector` 和螢幕上的畫面，全都以這棵樹為準，而不是以你打的那些字為準。' },
        { type: 'p', text: '這棵樹和你寫的 HTML 可能不一樣，原因有兩個。第一，程式會改它，上一節的第三本書就是。第二，HTML 的規則允許省略某些標籤，瀏覽器解析時會照規則補齊。下面的頁面省略了兩種：三個 `<p>` 都沒有寫 `</p>`，表格的 `<tr>` 直接寫在 `<table>` 裡。' },
        { type: 'example', id: 'web01-repair' },
        { type: 'p', text: '展開 DOM 樹：`table` 底下多了一層 `tbody`（表格的主體），三個 `tr` 都在它裡面。原始碼沒有這個標籤，是瀏覽器補上的。三個 `p` 則是平行的三個段落，表格也不在第一個 `p` 裡：瀏覽器一遇到 `<table>` 或下一個 `<p>`，就先替前一個段落補上結束。因此在這個頁面上，選擇器 `table > tr`（`table` 的直接子元素 `tr`）一個也選不到，因為兩者之間隔了一層 `tbody`。' },
        { type: 'callout', tone: 'warning', title: 'HTML 真的寫錯時，瀏覽器也不會報錯', text: '省略 `</p>` 是規則允許的，漏掉 `</h1>` 就不是了。但瀏覽器同樣不會顯示錯誤，而是照固定的規則猜一個結果：後面的段落和清單全都變成 `h1` 的子元素，整頁的字又大又粗。畫面怪怪的時候，不要只盯著原始碼找，先看 DOM 樹：每個元素的父元素和你想的一樣嗎？練習四就是這種情況。' },
        { type: 'p', text: '瀏覽器另外有「檢視網頁原始碼」的功能（在頁面上按滑鼠右鍵可以找到，各家瀏覽器的用字略有不同），它顯示的東西和 DOM 是兩回事：' },
        { type: 'table', head: ['比較', '檢視原始碼', 'DOM'], rows: [
          ['內容', '伺服器傳來的 HTML 文字，一字不差', '瀏覽器解析、補齊之後的樹'],
          ['程式改動頁面之後', '不會變', '立刻跟著變'],
          ['在哪裡看', '右鍵選單的「檢視網頁原始碼」', '開發者工具的 Elements 面板；本站範例下方的 DOM 樹'],
          ['適合回答的問題', '伺服器到底送了什麼？', '瀏覽器現在實際用什麼結構在顯示？'],
        ] },
      ],
    },
    {
      id: 'web01-devtools', title: '開發者工具：檢查任何一個網頁',
      blocks: [
        { type: 'p', text: '電腦上的瀏覽器都內建開發者工具（developer tools，常簡稱 DevTools），本站範例下方的區塊就是它的簡化版。開啟的方式：在 Windows 或 Linux 按 F12，在 macOS 按 Option + Command + I；或是在頁面上按滑鼠右鍵，選「檢查」（各家瀏覽器的用字略有不同）。Safari 要先在設定裡開啟給網頁開發者使用的功能。最常用的是三個面板：' },
        { type: 'table', head: ['面板', '顯示什麼', '本站對應的區塊'], rows: [
          ['Elements（元素；Firefox 稱為 Inspector）', '目前的 DOM 樹；點選一個元素，還能看到套用在它身上的 CSS', '範例下方的「瀏覽器建立的 DOM 樹」'],
          ['Console（主控台）', '`console.log` 的輸出與程式的錯誤；也可以直接輸入一行 JavaScript 執行', '範例下方的「主控台」'],
          ['Network（網路）', '這一頁發出的每個請求：HTML、CSS、JavaScript、圖片各占一列，附上狀態與花費的時間', '沒有對應的區塊：本站的範例頁面不會連上網路'],
        ] },
        { type: 'p', text: '三個面板正好對應前面學的東西：Elements 看的是第五節的 DOM，Console 是第三節 `console.log` 回報的地方，Network 則是載入流程第 2、4 步留下的紀錄。現在就在這一頁試一次：' },
        { type: 'list', ordered: true, items: [
          '在這一頁的課程標題上按滑鼠右鍵，選「檢查」：開發者工具會打開，Elements 面板直接停在那個元素上。',
          '把滑鼠移到 Elements 面板裡的其他元素上，頁面上對應的區域會被標示出來；點元素左邊的小三角形可以展開它的子元素。',
          '切到 Console，輸入 `document.title` 再按 Enter，會印出這個分頁的標題；再試試 `1 + 1`。',
          '切到 Network 後重新整理頁面，數一數為了顯示這一頁，瀏覽器一共發出了多少個請求。這個面板只記錄它開著的時候發生的請求，所以要先打開再重新整理。',
        ] },
        { type: 'callout', tone: 'tip', title: '在 Elements 裡的修改是暫時的', text: '在 Elements 面板的文字上點兩下就能改字，也能直接改 CSS，畫面立刻跟著變。但你改的只是自己瀏覽器裡的 DOM 與樣式，伺服器上的檔案沒有動，重新整理就恢復原狀。它是做實驗的好地方，不是存檔的地方。' },
        { type: 'callout', tone: 'tip', title: '練習網頁不需要伺服器', text: 'HTML、CSS 與 JavaScript 都由瀏覽器處理，所以練習時不必先架網站：用文字編輯器把內容存成 index.html，在檔案上點兩下，瀏覽器就會開啟它；這時的網址是以 `file://` 開頭的本機檔案路徑，沒有經過任何伺服器。本課的預覽框也一樣，程式在你自己的瀏覽器裡執行，沒有送到任何伺服器。伺服器的工作，是讓別人也能用網址拿到這些檔案。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'web01-q1', prompt: '小島圖書館想把全站每一頁的標題從深藍色改成墨綠色，文字內容完全不變。主要應該修改哪一種檔案？',
      options: ['HTML：把每一頁的 `<h1>` 重新打一次', 'JavaScript：在每次點擊時重新設定顏色', 'CSS：改掉 `h1` 規則裡 `color` 的值', '都不用改，請讀者調整自己的瀏覽器設定'],
      answer: 2,
      explanation: '顏色屬於外觀，是 CSS 的工作：改掉共用樣式表裡 `h1` 規則的 `color`，所有頁面一起換。HTML 負責內容與結構，題目說文字不變，重打 `<h1>` 改不了顏色；JavaScript 負責行為，顏色並不是「點擊之後才發生的事」；要讀者自己調整瀏覽器，則沒有改到網站本身。',
    },
    {
      id: 'web01-q2', prompt: '關於 HTML，下列哪一個敘述正確？',
      options: ['HTML 是標記語言，用標籤描述內容與結構，本身沒有條件判斷或迴圈', 'HTML 是程式語言，瀏覽器會一行一行執行它的指令', 'HTML 的主要工作是指定顏色、字型與間距', 'HTML 一定要搭配 CSS，否則瀏覽器無法顯示頁面'],
      answer: 0,
      explanation: 'HTML 用標籤標出「這是標題、這是段落」，瀏覽器是解析它來建立 DOM，不是執行它；條件與迴圈是 JavaScript 的事，所以它不是程式語言。顏色、字型與間距是 CSS 的工作。沒有 CSS 時，瀏覽器會用內建的預設樣式顯示，第一個範例就是這樣。',
    },
    {
      id: 'web01-q3', prompt: '瀏覽器解析這段 HTML 之後，在 DOM 裡 `tr` 的父元素是哪一個？',
      code: { language: 'HTML', text: '<table>\n  <tr><td>週一到週五</td><td>09:00–17:00</td></tr>\n</table>' },
      options: ['`table`', '`body`', '`td`', '`tbody`'],
      answer: 3,
      explanation: '原始碼省略了 `tbody`，瀏覽器會在 `table` 與 `tr` 之間補上它，所以 `tr` 的父元素是 `tbody`，`table` 是再上一層。原始碼看起來 `tr` 直接在 `table` 裡，但瀏覽器實際使用的是 DOM；`body` 是更外層的祖先，不是父元素；`td` 是 `tr` 的子元素，方向反了。',
    },
    {
      id: 'web01-q4', prompt: '瀏覽器收到一份 HTML 之後，下列哪一個先後順序正確？',
      options: ['繪製 → 版面配置 → 計算樣式 → 解析 HTML 成 DOM', '解析 HTML 成 DOM → 計算樣式 → 版面配置 → 繪製', '計算樣式 → 解析 HTML 成 DOM → 繪製 → 版面配置', '解析 HTML 成 DOM → 繪製 → 版面配置 → 計算樣式'],
      answer: 1,
      explanation: '要先解析出 DOM，才知道有哪些元素；算出每個元素的樣式，才能決定它的大小與位置（版面配置）；位置確定了，才能畫成像素（繪製）。其他三個選項不是還沒有元素就先算樣式，就是還不知道大小、位置或顏色就先畫，順序都不成立。',
    },
    {
      id: 'web01-q5', prompt: '某個頁面的 HTML 檔案裡，清單只有 2 個 `li`；頁面載入時，JavaScript 又在清單最後加了 1 個。下列哪一個敘述正確？',
      options: ['「檢視網頁原始碼」會看到 3 個 `li`', '開發者工具的 Elements 面板顯示 3 個 `li`，「檢視網頁原始碼」仍然是 2 個', '兩邊都只看得到 2 個，因為 DOM 建立之後就不會再改變', '加上去的 `li` 只存在於主控台，不會出現在畫面上'],
      answer: 1,
      explanation: 'Elements 面板顯示的是目前的 DOM，程式加上的元素會立刻出現在裡面，畫面也跟著更新，所以是 3 個；「檢視網頁原始碼」顯示的是伺服器傳來的 HTML 文字，不會因為程式執行而改變，仍是 2 個。DOM 隨時可以被程式修改；主控台只顯示 `console.log` 的訊息與錯誤，不是放元素的地方。',
    },
    {
      id: 'web01-q6', prompt: '頁面上有一個 id 是 toggle 的按鈕。這段程式在頁面載入時執行，使用者還沒有按任何東西，主控台的輸出是什麼？',
      code: { language: 'JavaScript', text: "const button = document.querySelector('#toggle');\nconsole.log('A');\nbutton.addEventListener('click', () => {\n  console.log('B');\n});\nconsole.log('C');" },
      options: ['依序印出 A、B、C', '只印出 A', '只印出 B', '依序印出 A、C'],
      answer: 3,
      explanation: '`addEventListener` 只是登記「被點擊時執行這個函式」，登記完程式就繼續往下走，所以印出 A 之後接著印出 C。B 寫在函式裡，要等按鈕被點擊才會印出，因此不會是 A、B、C，也不會只有 B；登記事件不會讓程式停下來等，所以也不會只印出 A。',
    },
    {
      id: 'web01-q7', prompt: '程式裡有一行 `console.log(\'讀到\', total);`。它的輸出要到開發者工具的哪一個面板看？',
      options: ['Console（主控台）', 'Elements（元素）', 'Network（網路）', '不在開發者工具裡，它會顯示在頁面的最下方'],
      answer: 0,
      explanation: '`console.log` 把訊息寫到主控台，也就是 Console 面板，程式的錯誤也出現在那裡。Elements 顯示的是 DOM 樹與套用的 CSS；Network 列出頁面發出的請求；`console.log` 不會改動頁面，使用者在畫面上看不到這些訊息。',
    },
    {
      id: 'web01-q8', prompt: '這段 HTML 少了 `</h1>`。瀏覽器會怎麼處理？',
      code: { language: 'HTML', text: '<h1>本週新書\n<p>新書放在一樓入口的展示架。</p>' },
      options: ['顯示語法錯誤的訊息，整個頁面不顯示', '自動在 `<p>` 之前結束 `h1`，結果和有寫 `</h1>` 完全相同', '不會報錯；`p` 成為 `h1` 的子元素，段落也用標題的大小與粗細顯示', '忽略沒有結束的 `<h1>`，「本週新書」不會出現在頁面上'],
      answer: 2,
      explanation: '瀏覽器遇到寫錯的 HTML 不會報錯，而是照固定的規則建立 DOM：`h1` 一直沒有結束，後面的 `p` 就成了它的子元素，跟著用標題的字級與粗體顯示。它不會顯示錯誤訊息或拒絕顯示頁面；會被下一個 `<p>` 自動結束的是沒寫 `</p>` 的段落，不是標題；文字也不會被丟掉。',
    },
  ],
  webCode: { examples, exercises },
};
