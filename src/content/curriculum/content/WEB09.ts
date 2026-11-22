import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB09 Events and event delegation (WEB-3). A web-code lesson on the made-up 小島圖書館: registering listeners, the
 * event object, bubbling (target → ancestors → document, whatever the order of registration), default actions and
 * forms (submit + preventDefault), the per-item listener that misses elements added later, and delegation with
 * closest(). Every `observe` fact and every exercise (solution, starter, mistakes, variants) is run in Chromium.
 * The preview records a submission whether or not the page cancelled it, so pages that need to know read
 * event.defaultPrevented on document (after the form's own listener, before the harness's on window).
 * Out of scope: async (WEB10), pointer/touch events (MOB04), accessible custom widgets (WEB13), frameworks.
 */

const lines = (...text: string[]) => text.join('\n');

// ---- examples ---------------------------------------------------------------------------------------------------
const LOANS_HTML = lines(
  '<h1>待還的書</h1>',
  '<ul id="loans">',
  '  <li><strong>島嶼植物圖鑑</strong>（今天到期）</li>',
  '  <li><strong>潮汐的故事</strong>（3 天後到期）</li>',
  '</ul>',
  '<button id="more" type="button">再借一本</button>',
);
const LOANS_CSS = lines(
  '#loans {',
  '  padding: 4px 12px 4px 32px;',
  '  background-color: #f4f6f7;',
  '}',
  'li {',
  '  margin: 12px 0;',
  '  cursor: pointer;',
  '}',
  '.returned {',
  '  text-decoration-line: line-through;',
  '  color: #7f8c8d;',
  '}',
);
const MORE_JS = [
  "document.querySelector('#more').addEventListener('click', () => {",
  "  const item = document.createElement('li');",
  "  item.textContent = '星空觀察手冊（14 天後到期）';",
  '  list.append(item);',
  '});',
];

const examples: WebExample[] = [
  {
    id: 'web09-ex-listen', title: '借書籃：按一下，加一本',
    description: 'script.js 替兩個按鈕各登記一個 `click` 監聽器，最後印出一行訊息。「領取借書證」的監聽器多了第三個參數 `{ once: true }`。',
    files: {
      html: lines(
        '<h1>借書籃</h1>',
        '<p>籃子裡有 <span id="count">0</span> 本書</p>',
        '<button id="add" type="button">加一本</button>',
        '<button id="card" type="button">領取借書證</button>',
        '<p id="message"></p>',
      ),
      js: lines(
        "const count = document.querySelector('#count');",
        "const message = document.querySelector('#message');",
        'let books = 0;',
        '',
        "document.querySelector('#add').addEventListener('click', () => {",
        '  books += 1;',
        '  count.textContent = books;',
        "  console.log('click：籃子裡有', books, '本');",
        '});',
        '',
        "document.querySelector('#card').addEventListener('click', () => {",
        "  message.textContent = '借書證已領取';",
        "  console.log('這一行只會印一次');",
        '}, { once: true });',
        '',
        "console.log('監聽器登記完成');",
      ),
    },
    observe: [
      { check: 'console', lines: ['監聽器登記完成'], label: '還沒按任何按鈕時，主控台只有「監聽器登記完成」：兩個函式裡的程式都還沒有執行' },
      { check: 'text', selector: '#count', text: '0', label: '還沒按之前，`#count` 是 0' },
      { do: 'click', selector: '#add' },
      { do: 'click', selector: '#add' },
      { check: 'text', selector: '#count', text: '2', label: '按兩次「加一本」，監聽器被呼叫兩次，`#count` 變成 2' },
      { do: 'click', selector: '#card' },
      { do: 'click', selector: '#card' },
      { check: 'text', selector: '#message', text: '借書證已領取', label: '按「領取借書證」之後，`#message` 顯示「借書證已領取」' },
      { check: 'console', lines: ['監聽器登記完成', 'click：籃子裡有 1 本', 'click：籃子裡有 2 本', '這一行只會印一次'], label: '「領取借書證」按了兩次，`{ once: true }` 的監聽器只執行一次' },
    ],
  },
  {
    id: 'web09-ex-object', title: '找書欄位：從事件物件讀出細節',
    description: '同一個欄位登記了兩種事件：`input` 的監聽器讀 `event.target.value`，`keydown` 的監聽器讀 `event.key`，按 Escape 會清空欄位。',
    files: {
      html: lines(
        '<h1>找書</h1>',
        '<label for="keyword">書名關鍵字</label>',
        '<input id="keyword" type="text">',
        '<p id="result">請輸入關鍵字</p>',
      ),
      js: lines(
        "const field = document.querySelector('#keyword');",
        "const result = document.querySelector('#result');",
        '',
        "field.addEventListener('input', (event) => {",
        '  console.log(event.type, event.target.value);',
        '  result.textContent = `正在找：${event.target.value}`;',
        '});',
        '',
        "field.addEventListener('keydown', (event) => {",
        '  console.log(event.type, event.key);',
        "  if (event.key === 'Escape') {",
        "    field.value = '';",
        "    result.textContent = '請輸入關鍵字';",
        '  }',
        '});',
      ),
    },
    observe: [
      { check: 'text', selector: '#result', text: '請輸入關鍵字', label: '還沒輸入時，`#result` 是「請輸入關鍵字」' },
      { do: 'input', selector: '#keyword', value: '潮汐' },
      { check: 'text', selector: '#result', text: '正在找：潮汐', label: '欄位的內容變成「潮汐」，`input` 的監聽器從 `event.target.value` 讀到它' },
      { do: 'key', selector: '#keyword', key: 'Escape' },
      { check: 'value', selector: '#keyword', value: '', label: '在欄位裡按 Escape，`keydown` 的監聽器把欄位清空' },
      { check: 'text', selector: '#result', text: '請輸入關鍵字', label: '提示文字也回到「請輸入關鍵字」' },
      { check: 'console', lines: ['input 潮汐', 'keydown Escape'], label: '主控台依序是 `event.type` 與細節：「input 潮汐」、「keydown Escape」' },
    ],
  },
  {
    id: 'web09-ex-bubble', title: '一次點擊，四個監聽器',
    description: '`document`、`body`、`ul` 與按鈕各登記了一個 `click` 監聽器，登記的順序是由外到內。每個監聽器印出自己是誰，以及這次事件的 `target` 與 `currentTarget`。',
    files: {
      html: lines(
        '<section id="shelf">',
        '  <h2>新書架</h2>',
        '  <ul id="books">',
        '    <li><button id="borrow" type="button">借閱《潮汐的故事》</button></li>',
        '  </ul>',
        '</section>',
      ),
      js: lines(
        'const watch = (node, label) => {',
        "  node.addEventListener('click', (event) => {",
        "    console.log(label, '收到 click：target', event.target, 'currentTarget', event.currentTarget);",
        '  });',
        '};',
        '',
        "watch(document, 'document');",
        "watch(document.body, 'body');",
        "watch(document.querySelector('#books'), 'ul');",
        "watch(document.querySelector('#borrow'), 'button');",
      ),
    },
    observe: [
      { check: 'console', lines: [], label: '還沒點擊時，主控台沒有任何輸出' },
      { do: 'click', selector: '#borrow' },
      { check: 'console', lines: [
        'button 收到 click：target <button#borrow> currentTarget <button#borrow>',
        'ul 收到 click：target <button#borrow> currentTarget <ul#books>',
        'body 收到 click：target <button#borrow> currentTarget <body>',
        'document 收到 click：target <button#borrow> currentTarget #document',
      ], label: '點按鈕之後，四個監聽器由內往外執行：button、ul、body、document，和登記的順序相反' },
      { do: 'click', selector: '#shelf h2' },
      { check: 'console', lines: [
        'body 收到 click：target <h2> currentTarget <body>',
        'document 收到 click：target <h2> currentTarget #document',
      ], match: 'includes', label: '點標題 `h2`：`target` 換成 `<h2>`，`body` 與 `document` 的監聽器執行' },
      { check: 'console', lines: [
        'button 收到 click：target <button#borrow> currentTarget <button#borrow>',
        'ul 收到 click：target <button#borrow> currentTarget <ul#books>',
        'body 收到 click：target <button#borrow> currentTarget <body>',
        'document 收到 click：target <button#borrow> currentTarget #document',
        'body 收到 click：target <h2> currentTarget <body>',
        'document 收到 click：target <h2> currentTarget #document',
      ], label: '`h2` 不在 `ul` 裡：點它的時候，`ul` 與按鈕的監聽器都沒有執行，主控台一共六行' },
    ],
  },
  {
    id: 'web09-ex-form', title: '用表單把書加進清單',
    description: '監聽表單的 `submit`：取消預設的送出，把欄位裡的書名做成清單項目。最後三行在 `document` 上印出這次送出有沒有被取消。',
    files: {
      html: lines(
        '<h1>想借的書</h1>',
        '<form id="wish-form">',
        '  <label for="title">書名</label>',
        '  <input id="title" name="title" type="text">',
        '  <button>加入</button>',
        '</form>',
        '<ul id="wishes"></ul>',
      ),
      js: lines(
        "const form = document.querySelector('#wish-form');",
        "const field = document.querySelector('#title');",
        "const list = document.querySelector('#wishes');",
        '',
        "form.addEventListener('submit', (event) => {",
        '  event.preventDefault();',
        '  const title = field.value.trim();',
        "  if (title !== '') {",
        "    const item = document.createElement('li');",
        '    item.textContent = title;',
        '    list.append(item);',
        '  }',
        "  field.value = '';",
        '});',
        '',
        "document.addEventListener('submit', (event) => {",
        "  console.log('defaultPrevented:', event.defaultPrevented);",
        '});',
      ),
    },
    observe: [
      { do: 'input', selector: '#title', value: '星空觀察手冊' },
      { do: 'key', selector: '#title', key: 'Enter' },
      { check: 'text', selector: '#wishes li', text: '星空觀察手冊', label: '輸入書名後在欄位裡按 Enter：`submit` 的監聽器把它加進清單' },
      { check: 'value', selector: '#title', value: '', label: '加入之後欄位被清空' },
      { check: 'console', lines: ['defaultPrevented: true'], label: '事件冒泡到 `document` 時，`event.defaultPrevented` 是 `true`：預設的送出已經被取消' },
      { do: 'input', selector: '#title', value: '潮汐的故事' },
      { do: 'click', selector: '#wish-form button' },
      { check: 'count', selector: '#wishes li', count: 2, label: '再輸入一本、改按「加入」按鈕：同一個監聽器再執行一次，清單有兩項' },
      { do: 'input', selector: '#title', value: '   ' },
      { do: 'click', selector: '#wish-form button' },
      { check: 'count', selector: '#wishes li', count: 2, label: '只輸入空白再送出：`trim()` 之後是空字串，清單維持兩項' },
    ],
  },
  {
    id: 'web09-ex-per-item', title: '每個項目各登記一個監聽器',
    description: '載入時用 `querySelectorAll` 與 `forEach` 替清單裡的每個 `li` 登記 `click`：點一下切換 `returned` 類別。「再借一本」會在清單最後加上一個新的 `li`。',
    files: {
      html: LOANS_HTML,
      css: LOANS_CSS,
      js: lines(
        "const list = document.querySelector('#loans');",
        '',
        "list.querySelectorAll('li').forEach((item) => {",
        "  item.addEventListener('click', () => {",
        "    item.classList.toggle('returned');",
        '  });',
        '});',
        '',
        ...MORE_JS,
      ),
    },
    observe: [
      { do: 'click', selector: '#loans li:nth-child(1)' },
      { check: 'style', selector: '#loans li:nth-child(1)', property: 'text-decoration-line', value: 'line-through', label: '點第一本（載入時就在清單裡）：它被劃掉了' },
      { do: 'click', selector: '#more' },
      { check: 'count', selector: '#loans li', count: 3, label: '按「再借一本」之後，清單有三個 `li`' },
      { do: 'click', selector: '#loans li:nth-child(3)' },
      { check: 'attr', selector: '#loans li:nth-child(3)', name: 'class', match: 'absent', label: '點後來才加入的第三本：它沒有得到 `returned` 類別，因為沒有人替它登記過監聽器' },
      { check: 'console', lines: [], label: '整個過程主控台沒有任何訊息：少了監聽器不是錯誤，瀏覽器不會提醒你' },
    ],
  },
  {
    id: 'web09-ex-delegation', title: '事件委派：只在清單上登記一次',
    description: 'index.html 與 style.css 和上一個範例完全相同。script.js 改成只在 `ul#loans` 上登記一個 `click` 監聽器，用 `event.target.closest(\'li\')` 找出被點到的項目。',
    files: {
      html: LOANS_HTML,
      css: LOANS_CSS,
      js: lines(
        "const list = document.querySelector('#loans');",
        '',
        "list.addEventListener('click', (event) => {",
        "  const item = event.target.closest('li');",
        "  console.log('target:', event.target, '找到的項目:', item);",
        '  if (item === null || !list.contains(item)) {',
        '    return;',
        '  }',
        "  item.classList.toggle('returned');",
        '});',
        '',
        ...MORE_JS,
      ),
    },
    observe: [
      { do: 'click', selector: '#loans li:nth-child(2) strong' },
      { check: 'attr', selector: '#loans li:nth-child(2)', name: 'class', value: 'returned', label: '點第二本的書名（`strong`）：得到 `returned` 類別的是包住它的 `li`' },
      { check: 'console', lines: ['target: <strong> 找到的項目: <li>'], label: '主控台顯示 `target` 是 `<strong>`，`closest(\'li\')` 找到的是 `<li>`' },
      { do: 'click', selector: '#more' },
      { do: 'click', selector: '#loans li:nth-child(3)' },
      { check: 'attr', selector: '#loans li:nth-child(3)', name: 'class', value: 'returned', label: '後來才加入的第三本點了也有反應：它的點擊一樣冒泡到 `ul`' },
      { do: 'click', selector: '#loans' },
      { check: 'console', lines: ['target: <ul#loans> 找到的項目: null'], match: 'includes', label: '點在 `ul` 自己身上（項目之間的空隙）：`closest(\'li\')` 回傳 `null`' },
      { check: 'count', selector: '.returned', count: 2, label: '點空隙不會標記任何東西：頁面上仍然只有兩個 `.returned`' },
    ],
  },
];

// ---- exercises --------------------------------------------------------------------------------------------------
/** The fixed tail of the form exercises: script.js first, then a listener that says whether this submission was cancelled. */
const REPORT_HTML = [
  '<p id="browser"></p>',
  '<script src="script.js"></script>',
  '<script>',
  '  // 固定的部分：回報這次送出有沒有被 preventDefault() 取消',
  "  document.addEventListener('submit', (event) => {",
  "    const report = document.querySelector('#browser');",
  "    report.textContent = '表單送出了：真正的網頁會在這時重新載入。';",
  '    if (event.defaultPrevented) {',
  "      report.textContent = '預設的送出已取消，頁面留在原地。';",
  '    }',
  '  });',
  '</script>',
];

/** Exercise 3: a list of loans and a fixed "borrow one more" control that appends a book after load. */
const loansPage = (books: [string, string][], extra: [string, string]) => lines(
  '<h1>待還的書</h1>',
  '<ul id="loans">',
  ...books.map(([title, due]) => `  <li><strong>${title}</strong> ${due}</li>`),
  '</ul>',
  '<button id="more" type="button">再借一本</button>',
  '<script>',
  '  // 固定的部分：按「再借一本」，在清單最後加上一本書',
  "  document.querySelector('#more').addEventListener('click', () => {",
  "    const item = document.createElement('li');",
  "    const title = document.createElement('strong');",
  `    title.textContent = '${extra[0]}';`,
  `    item.append(title, ' ${extra[1]}');`,
  "    document.querySelector('#loans').append(item);",
  '  });',
  '</script>',
);

/** Exercise 4: the basket. makeItem() is the page's own helper; the report says whether the submission was cancelled. */
const basketPage = (books: string[]) => lines(
  '<h1>借書籃</h1>',
  '<form id="add-form">',
  '  <label for="title">書名</label>',
  '  <input id="title" name="title" required>',
  '  <button>放進籃子</button>',
  '</form>',
  '<ul id="basket">',
  ...books.map(title => `  <li>${title} <button type="button" class="remove">移除</button></li>`),
  '</ul>',
  '<script>',
  "  // 固定的部分：makeItem('書名') 回傳一個新的 li，裡面是書名和「移除」按鈕",
  '  function makeItem(title) {',
  "    const item = document.createElement('li');",
  "    const button = document.createElement('button');",
  "    button.type = 'button';",
  "    button.className = 'remove';",
  "    button.textContent = '移除';",
  "    item.append(title + ' ', button);",
  '    return item;',
  '  }',
  '</script>',
  ...REPORT_HTML,
);

const COUNTER_HEAD = [
  "const count = document.querySelector('#count');",
  "const addButton = document.querySelector('#add');",
  "const clearButton = document.querySelector('#clear');",
  'let books = 0;',
  '',
  "clearButton.addEventListener('click', () => {",
  '  books = 0;',
  '  count.textContent = books;',
  '});',
  '',
];
const FORM_HEAD = [
  "const form = document.querySelector('#wish-form');",
  "const field = document.querySelector('#title');",
  "const list = document.querySelector('#wishes');",
  '',
];
const BASKET_HEAD = [
  "const form = document.querySelector('#add-form');",
  "const field = document.querySelector('#title');",
  "const basket = document.querySelector('#basket');",
  '',
];
const BASKET_SUBMIT = [
  "form.addEventListener('submit', (event) => {",
  '  event.preventDefault();',
  '  basket.append(makeItem(field.value));',
  "  field.value = '';",
  '});',
  '',
];
const BASKET_CLICK = [
  "basket.addEventListener('click', (event) => {",
  "  const button = event.target.closest('.remove');",
  '  if (button === null) {',
  '    return;',
  '  }',
  "  button.closest('li').remove();",
  '});',
];

const exercises: WebExercise[] = [
  {
    id: 'web09-x-counter', title: '讓「加一本」按鈕會數數',
    statement: 'index.html 不能改。script.js 已經找到三個元素、宣告了計數用的變數 `books`，也寫好了「清空」按鈕的監聽器。請仿照它，替「加一本」（`#add`）登記 `click` 的監聽器：每按一次，`books` 加 1，並把新的數字寫進 `#count`。還沒按之前 `#count` 要維持 0；按了「清空」之後，要能從 0 重新數起。',
    hints: [
      '看「清空」那一段怎麼寫：`元素.addEventListener(\'click\', () => { … })`，大括號裡是按下去才執行的程式。',
      '監聽器裡要做兩件事：先讓 `books` 加 1（`books += 1;`），再把 `books` 指定給 `count.textContent`。兩行都要寫在大括號裡面。',
      '第二個參數要交出函式本身：直接寫箭頭函式，或寫函式的名稱。名稱後面不要加小括號，事件類型是小寫的 `\'click\'`。',
    ],
    explanation: '`addEventListener` 只負責登記，箭頭函式裡的兩行要等到按鈕被點擊才執行，所以載入後 `#count` 仍是 0。`books` 宣告在函式外面，每次點擊用的是同一個變數，數字才會累加；「清空」的監聽器把同一個 `books` 設回 0，所以之後再按「加一本」會從 1 開始。',
    fixed: {
      html: lines(
        '<h1>借書籃</h1>',
        '<p>籃子裡有 <span id="count">0</span> 本書</p>',
        '<button id="add" type="button">加一本</button>',
        '<button id="clear" type="button">清空</button>',
      ),
    },
    starter: {
      js: lines(
        ...COUNTER_HEAD,
        '// 在這裡替 addButton 登記 click 的監聽器：',
        '// 每按一次，books 加 1，再把 books 寫進 count',
      ),
    },
    solution: {
      js: lines(
        ...COUNTER_HEAD,
        "addButton.addEventListener('click', () => {",
        '  books += 1;',
        '  count.textContent = books;',
        '});',
      ),
    },
    steps: [
      { check: 'text', selector: '#count', text: '0', label: '還沒按任何按鈕時，`#count` 是 0' },
      { do: 'click', selector: '#add' },
      { check: 'text', selector: '#count', text: '1', label: '按一次「加一本」，`#count` 變成 1' },
      { do: 'click', selector: '#add' },
      { do: 'click', selector: '#add' },
      { check: 'text', selector: '#count', text: '3', label: '再按兩次，`#count` 是 3：每一次點擊都有算到' },
      { do: 'click', selector: '#clear' },
      { do: 'click', selector: '#add' },
      { check: 'text', selector: '#count', text: '1', label: '按「清空」之後再按一次「加一本」，`#count` 從 1 重新數起' },
    ],
    mistakes: [
      {
        files: {
          js: lines(
            ...COUNTER_HEAD,
            'const addBook = () => {',
            '  books += 1;',
            '  count.textContent = books;',
            '};',
            "addButton.addEventListener('click', addBook());",
          ),
        },
        why: '`addBook()` 多了一對小括號：載入時就先呼叫了一次（還沒按，數字已經是 1），交給 `addEventListener` 的是它的回傳值 `undefined`，等於沒有登記，之後怎麼按都沒有反應，主控台也沒有錯誤。要交出函式本身：`addBook`。',
      },
      {
        files: {
          js: lines(
            ...COUNTER_HEAD,
            "addButton.addEventListener('click', () => {",
            '  count.textContent = books + 1;',
            '});',
          ),
        },
        why: '只把 `books + 1` 顯示出來，沒有把結果存回 `books`：變數一直是 0，所以按幾次畫面上都是 1。要先 `books += 1;` 更新變數，再顯示它。',
      },
      {
        files: {
          js: lines(
            ...COUNTER_HEAD,
            "addButton.addEventListener('onclick', () => {",
            '  books += 1;',
            '  count.textContent = books;',
            '});',
          ),
        },
        why: '事件類型寫成了 `\'onclick\'`。`addEventListener` 的類型不加 on；瀏覽器照樣讓你登記，只是從來不會發生叫做 onclick 的事件，所以按了沒有反應，也沒有任何錯誤訊息。',
      },
    ],
  },
  {
    id: 'web09-x-form', title: '用表單把書加進清單',
    statement: 'index.html 不能改：表單 `#wish-form` 裡有必填的欄位 `#title` 與送出按鈕，下面是空的清單 `#wishes`。請完成 script.js 裡 `submit` 的監聽器：表單送出時（按「加入」或在欄位裡按 Enter 都算），取消瀏覽器預設的送出，把欄位當下的文字做成一個新的 `li` 接到 `#wishes` 的最後，再把欄位清空。欄位空白時不能多出項目（必填的原生驗證會擋下送出，你不必另外處理）。index.html 最下面有一小段固定的指令稿，會在 `#browser` 寫出這次送出有沒有被取消；檢查會看它。',
    hints: [
      '監聽器的參數 `event` 就是事件物件；取消預設行為的方法在它身上，通常寫在監聽器的第一行。',
      '書名要在監聽器裡面讀 `field.value`，那才是送出當下的內容。接著用 WEB08 的三步：`document.createElement(\'li\')`、設定 `textContent`、`list.append(…)`。',
      '依序四行就夠：`event.preventDefault();`、建立 `li` 並填入 `field.value`、`list.append(item);`，最後 `field.value = \'\';`。',
    ],
    explanation: '`submit` 發生在表單上，按鈕與 Enter 都會觸發它，所以一個監聽器就涵蓋兩種送出方式；欄位空白時，`required` 的原生驗證先擋下，`submit` 根本不會發生。`event.preventDefault()` 取消「送出並載入新頁面」這個預設行為，之後事件冒泡到 `document`，固定的那段指令稿讀到 `event.defaultPrevented` 是 `true`。`field.value` 在監聽器裡讀，才是使用者送出當下輸入的文字。',
    fixed: {
      html: lines(
        '<h1>想借的書</h1>',
        '<form id="wish-form">',
        '  <label for="title">書名</label>',
        '  <input id="title" name="title" required>',
        '  <button>加入</button>',
        '</form>',
        '<ul id="wishes"></ul>',
        ...REPORT_HTML,
      ),
    },
    starter: {
      js: lines(
        ...FORM_HEAD,
        "form.addEventListener('submit', (event) => {",
        '  // 1. 取消瀏覽器預設的送出',
        '  // 2. 用欄位現在的值建立一個 li，接到 list 的最後',
        '  // 3. 清空欄位',
        '});',
      ),
    },
    solution: {
      js: lines(
        ...FORM_HEAD,
        "form.addEventListener('submit', (event) => {",
        '  event.preventDefault();',
        "  const item = document.createElement('li');",
        '  item.textContent = field.value;',
        '  list.append(item);',
        "  field.value = '';",
        '});',
      ),
    },
    steps: [
      { do: 'click', selector: '#wish-form button' },
      { check: 'count', selector: '#wishes li', count: 0, label: '欄位空白時按「加入」，清單沒有多出項目' },
      { do: 'input', selector: '#title', value: '星空觀察手冊' },
      { do: 'key', selector: '#title', key: 'Enter' },
      { check: 'text', selector: '#wishes li:last-child', text: '星空觀察手冊', label: '輸入書名後在欄位裡按 Enter，清單的最後一項就是那本書' },
      { check: 'value', selector: '#title', value: '', label: '加入之後欄位被清空' },
      { check: 'text', selector: '#browser', text: '已取消', match: 'includes', label: '`#browser` 回報這次送出的預設行為已取消' },
      { do: 'input', selector: '#title', value: '潮汐的故事' },
      { do: 'click', selector: '#wish-form button' },
      { check: 'count', selector: '#wishes li', count: 2, label: '再輸入一本、改按「加入」按鈕，清單有兩項' },
      { check: 'text', selector: '#wishes li:last-child', text: '潮汐的故事', label: '最後一項是第二次輸入的書名' },
    ],
    mistakes: [
      {
        files: {
          js: lines(
            ...FORM_HEAD,
            "form.addEventListener('submit', (event) => {",
            "  const item = document.createElement('li');",
            '  item.textContent = field.value;',
            '  list.append(item);',
            "  field.value = '';",
            '});',
          ),
        },
        why: '少了 `event.preventDefault()`。預覽不會真的送出，所以看起來沒事；但在真正的網頁上，監聽器執行完瀏覽器就送出表單、載入新頁面，剛加上去的項目立刻消失。`#browser` 那一行會告訴你送出沒有被取消。',
      },
      {
        files: {
          js: lines(
            ...FORM_HEAD,
            'const title = field.value;',
            '',
            "form.addEventListener('submit', (event) => {",
            '  event.preventDefault();',
            "  const item = document.createElement('li');",
            '  item.textContent = title;',
            '  list.append(item);',
            "  field.value = '';",
            '});',
          ),
        },
        why: '在監聽器外面就讀了 `field.value`：那是頁面載入當下的內容（空字串），之後使用者輸入什麼，`title` 都不會跟著變，加進清單的永遠是空白的項目。值要在監聽器裡面、事件發生的當下讀。',
      },
      {
        files: {
          js: lines(
            ...FORM_HEAD,
            "document.querySelector('#wish-form button').addEventListener('click', (event) => {",
            '  event.preventDefault();',
            "  const item = document.createElement('li');",
            '  item.textContent = field.value;',
            '  list.append(item);',
            "  field.value = '';",
            '});',
          ),
        },
        why: '改成監聽按鈕的 `click`。`click` 發生在原生驗證之前，所以欄位空白時也照樣執行，清單多出一個空的項目；而且預設行為在 `click` 就被取消，`submit` 事件從頭到尾沒有發生。「送出表單」這件事要監聽表單的 `submit`。',
      },
    ],
  },
  {
    id: 'web09-x-delegate', title: '修好點不動的新書',
    statement: 'index.html 與 style.css 不能改。script.js 現在替每個 `li` 各登記一個監聽器，所以按「再借一本」（由 index.html 裡固定的指令稿處理）之後才加入的書，點了沒有反應。請改用事件委派：只在 `#loans` 上登記一個 `click` 監聽器，點到某一本書時（點 `li` 本身或裡面的書名都算），替那個 `li` 加上 `returned` 類別。類別要加在 `li` 上；點在清單上但不在任何項目上時，什麼都不要標記。檢查還會在另一份書單不同的頁面上再執行一次。',
    hints: [
      '把監聽器登記在 `list`（也就是 `ul#loans`）上，而不是每個 `li` 上：不論點到哪一本，事件都會冒泡到它。',
      '監聽器需要事件物件：`(event) => { … }`。被點到的可能是 `strong`，用 `event.target.closest(\'li\')` 往上找到那個項目。',
      '`closest` 找不到時回傳 `null`：先寫 `if (item === null) { return; }`，再 `item.classList.add(\'returned\');`。',
    ],
    explanation: '點擊會從被點到的元素冒泡到 `ul#loans`，所以一個監聽器就能照顧清單裡所有的項目，包含之後才用 `createElement` 加進來的。`event.target` 是實際被點到的元素（可能是 `strong`），`closest(\'li\')` 從它往上找到所屬的項目；點在 `ul` 自己身上時找不到，回傳 `null`，直接 `return`。`list.contains(item)` 再確認找到的 `li` 真的在這份清單裡。',
    fixed: {
      html: loansPage([['島嶼植物圖鑑', '今天到期'], ['潮汐的故事', '3 天後到期']], ['星空觀察手冊', '14 天後到期']),
      css: lines(
        'li {',
        '  margin: 12px 0;',
        '  cursor: pointer;',
        '}',
        '.returned {',
        '  text-decoration-line: line-through;',
        '  color: #7f8c8d;',
        '}',
      ),
    },
    starter: {
      js: lines(
        "const list = document.querySelector('#loans');",
        '',
        '// 問題：只有載入時就在清單裡的書，點了才有反應',
        "list.querySelectorAll('li').forEach((item) => {",
        "  item.addEventListener('click', () => {",
        "    item.classList.add('returned');",
        '  });',
        '});',
      ),
    },
    solution: {
      js: lines(
        "const list = document.querySelector('#loans');",
        '',
        "list.addEventListener('click', (event) => {",
        "  const item = event.target.closest('li');",
        '  if (item === null || !list.contains(item)) {',
        '    return;',
        '  }',
        "  item.classList.add('returned');",
        '});',
      ),
    },
    steps: [
      { do: 'click', selector: '#loans li:nth-child(2) strong' },
      { check: 'attr', selector: '#loans li:nth-child(2)', name: 'class', value: 'returned', match: 'includes', label: '點第二本的書名，第二個 `li` 得到 `returned` 類別' },
      { check: 'count', selector: '#loans strong.returned', count: 0, label: '類別加在 `li` 上，不是加在裡面的 `strong` 上' },
      { do: 'click', selector: '#more' },
      { do: 'click', selector: '#loans li:nth-child(3) strong' },
      { check: 'attr', selector: '#loans li:nth-child(3)', name: 'class', value: 'returned', match: 'includes', label: '按「再借一本」之後點新加入的第三本，它也得到 `returned`' },
      { do: 'click', selector: '#loans' },
      { check: 'count', selector: '.returned', count: 2, label: '點在清單本身（不在任何項目上）不會多標記東西：整頁只有兩個 `.returned`' },
      { check: 'count', selector: '#loans li:nth-child(1).returned', count: 0, label: '沒有被點到的第一本維持原樣' },
    ],
    mistakes: [
      {
        files: {
          js: lines(
            "const list = document.querySelector('#loans');",
            '',
            "list.addEventListener('click', (event) => {",
            "  event.target.classList.add('returned');",
            '});',
          ),
        },
        why: '直接把類別加在 `event.target` 上。`target` 是實際被點到的元素：點到書名時是 `strong`，只有書名被劃掉；點到空隙時是 `ul`，整份清單都被標記。要先用 `event.target.closest(\'li\')` 找到項目。',
      },
      {
        files: {
          js: lines(
            "const list = document.querySelector('#loans');",
            '',
            "list.addEventListener('click', (event) => {",
            "  event.currentTarget.classList.add('returned');",
            '});',
          ),
        },
        why: '`event.currentTarget` 是登記監聽器的元素，在這裡永遠是 `ul#loans`：不管點哪一本，被標記的都是整份清單，沒有任何一個 `li` 得到類別。想知道點到哪個項目，要從 `event.target` 找起。',
      },
    ],
    variants: [
      {
        title: '另一份書單：三本書，再借的是第四本',
        fixed: { html: loansPage([['海邊的地質課', '明天到期'], ['燈塔管理員日記', '5 天後到期'], ['島上的鳥', '9 天後到期']], ['風的地圖', '14 天後到期']) },
        steps: [
          { do: 'click', selector: '#loans li:nth-child(3)' },
          { check: 'attr', selector: '#loans li:nth-child(3)', name: 'class', value: 'returned', match: 'includes', label: '點第三本的 `li` 本身，它得到 `returned`' },
          { do: 'click', selector: '#more' },
          { do: 'click', selector: '#loans li:nth-child(4) strong' },
          { check: 'attr', selector: '#loans li:nth-child(4)', name: 'class', value: 'returned', match: 'includes', label: '新加入的第四本也得到 `returned`' },
          { do: 'click', selector: '#loans' },
          { check: 'count', selector: '.returned', count: 2, label: '整頁只有兩個 `.returned`' },
        ],
      },
    ],
  },
  {
    id: 'web09-x-basket', title: '完成借書籃：加入與移除',
    statement: 'index.html 不能改。借書籃 `#basket` 裡每一本書的 `li` 都有一個「移除」按鈕（`class="remove"`）；頁面提供了函式 `makeItem(書名)`，會回傳一個同樣結構的新 `li`。請完成 script.js 的兩個監聽器。（一）表單 `#add-form` 送出時：取消預設的送出，把 `makeItem(欄位的值)` 接到 `#basket` 的最後，再清空欄位。（二）在 `#basket` 上用事件委派處理 `click`：按到某個「移除」按鈕，就把它所在的 `li` 從頁面移除，之後才加入的書也要移除得掉；點在書名或其他不是「移除」按鈕的地方，什麼都不做。`#browser` 會回報送出有沒有被取消。檢查還會在另一份書單不同的頁面上再執行一次。',
    hints: [
      '第一個監聽器和練習二幾乎一樣，只是項目改由 `makeItem(field.value)` 做出來，再用 `basket.append(…)` 接上去。別忘了第一行先取消預設行為。',
      '第二個監聽器先找按鈕：`event.target.closest(\'.remove\')`。點到的不是「移除」按鈕時它是 `null`，這時直接 `return`。',
      '找到按鈕之後，再從按鈕往上找它所在的項目並移除：`button.closest(\'li\').remove();`。',
    ],
    explanation: '兩個監聽器都登記在一開始就存在、之後也不會被換掉的元素上：表單與 `ul#basket`。`submit` 的監聽器取消預設的送出，用頁面提供的 `makeItem` 做出新的項目。移除則交給委派：不論按到的是原有的還是新加入的「移除」按鈕，點擊都會冒泡到 `#basket`；`event.target.closest(\'.remove\')` 判斷這一下是不是按在「移除」上（不是就回傳 `null`、不處理），再從按鈕用 `closest(\'li\')` 找到要移除的項目。',
    fixed: { html: basketPage(['島嶼植物圖鑑', '潮汐的故事']) },
    starter: {
      js: lines(
        ...BASKET_HEAD,
        "form.addEventListener('submit', (event) => {",
        '  // 取消預設的送出，把 makeItem(書名) 接到 basket 的最後，再清空欄位',
        '});',
        '',
        "basket.addEventListener('click', (event) => {",
        '  // 找出被按到的「移除」按鈕（沒有就 return），再移除它所在的 li',
        '});',
      ),
    },
    solution: { js: lines(...BASKET_HEAD, ...BASKET_SUBMIT, ...BASKET_CLICK) },
    steps: [
      { do: 'click', selector: '#basket li:nth-child(1) .remove' },
      { check: 'text', selector: '#basket li:first-child', text: '潮汐的故事', match: 'includes', label: '按第一本的「移除」，它被移除，籃子的第一項變成「潮汐的故事」' },
      { do: 'input', selector: '#title', value: '星空觀察手冊' },
      { do: 'key', selector: '#title', key: 'Enter' },
      { check: 'text', selector: '#basket li:last-child', text: '星空觀察手冊', match: 'includes', label: '輸入書名後按 Enter，籃子的最後一項是那本書' },
      { check: 'value', selector: '#title', value: '', label: '加入之後欄位被清空' },
      { check: 'text', selector: '#browser', text: '已取消', match: 'includes', label: '`#browser` 回報這次送出的預設行為已取消' },
      { do: 'click', selector: '#basket li:last-child .remove' },
      { check: 'text', selector: '#basket', text: '潮汐的故事 移除', label: '按新加入那本書的「移除」，籃子裡只剩「潮汐的故事」' },
      { do: 'click', selector: '#basket li' },
      { check: 'count', selector: '#basket li', count: 1, label: '點書名所在的 `li`（不是「移除」按鈕）時，沒有任何書被移除' },
    ],
    mistakes: [
      {
        files: {
          js: lines(
            ...BASKET_HEAD,
            ...BASKET_SUBMIT,
            "basket.querySelectorAll('.remove').forEach((button) => {",
            "  button.addEventListener('click', () => {",
            "    button.closest('li').remove();",
            '  });',
            '});',
          ),
        },
        why: '替載入時就在籃子裡的每個「移除」按鈕各登記一個監聽器。之後用 `makeItem` 加進來的書，按鈕身上沒有監聽器，按了移除不掉。把監聽器改登記在 `#basket` 上，新舊按鈕的點擊都會冒泡過來。',
      },
      {
        files: {
          js: lines(
            ...BASKET_HEAD,
            ...BASKET_SUBMIT,
            "basket.addEventListener('click', (event) => {",
            "  event.target.closest('li').remove();",
            '});',
          ),
        },
        why: '沒有先確認點到的是不是「移除」按鈕，就直接移除 `event.target` 所在的 `li`：使用者只是點了書名，整本書就從籃子裡消失。要先用 `event.target.closest(\'.remove\')` 找按鈕，找不到就 `return`。',
      },
      {
        files: {
          js: lines(
            ...BASKET_HEAD,
            "form.addEventListener('submit', (event) => {",
            '  basket.append(makeItem(field.value));',
            "  field.value = '';",
            '});',
            '',
            ...BASKET_CLICK,
          ),
        },
        why: '`submit` 的監聽器沒有呼叫 `event.preventDefault()`。預覽裡看起來正常，但真正的網頁會在監聽器執行完之後送出表單、重新載入，籃子回到一開始的樣子。',
      },
    ],
    variants: [
      {
        title: '另一個借書籃：一開始有三本書',
        fixed: { html: basketPage(['海邊的地質課', '燈塔管理員日記', '島上的鳥']) },
        steps: [
          { do: 'click', selector: '#basket li:nth-child(2) .remove' },
          { check: 'text', selector: '#basket', text: '海邊的地質課 移除 島上的鳥 移除', label: '移除第二本，剩下第一本與第三本' },
          { do: 'input', selector: '#title', value: '風的地圖' },
          { do: 'click', selector: '#add-form button' },
          { check: 'text', selector: '#basket li:last-child', text: '風的地圖', match: 'includes', label: '按按鈕送出，最後一項是新的書' },
          { check: 'text', selector: '#browser', text: '已取消', match: 'includes', label: '送出的預設行為已取消' },
          { do: 'click', selector: '#basket li:last-child .remove' },
          { do: 'click', selector: '#basket li:nth-child(2)' },
          { check: 'text', selector: '#basket', text: '海邊的地質課 移除 島上的鳥 移除', label: '新的書移除得掉，點書名不會移除' },
        ],
      },
    ],
  },
];

export const WEB09: LessonContent = {
  lessonId: 'WEB09',
  motivation: '頁面不知道使用者什麼時候會點擊、打字或送出表單，所以 JavaScript 用事件把這些時刻交給你寫的函式。這一課從 `addEventListener` 開始，讀懂事件物件、看清事件沿著 DOM 樹冒泡的順序、用 `preventDefault()` 接手表單的送出，最後用事件委派讓一個監聽器照顧整份清單，連之後才加進來的項目也不漏掉。',
  sections: [
    {
      id: 'web09-listen', title: '事件監聽：事情發生時才執行的函式',
      blocks: [
        { type: 'p', text: 'WEB08 的指令稿都是「載入時從頭到尾執行一次」：選取元素、改文字、插入清單，然後就結束了。可是使用者什麼時候按按鈕、會按幾次，寫程式的時候不可能知道。瀏覽器的做法是事件（event）：每當有事發生（滑鼠點了一下、欄位的內容變了、表單被送出），它就在發生的那個元素上發出一個事件。你要做的是事先登記：「這個元素發生這種事件時，請呼叫這個函式」。這件事叫事件監聽，登記用的方法是 `addEventListener`。' },
        { type: 'p', text: '寫法是 `元素.addEventListener(\'事件類型\', 函式)`。第一個參數是事件類型的名稱，例如 `\'click\'`；第二個參數是一個函式，稱為監聽器（listener）。這種「先交出去、之後由別人呼叫」的函式也叫回呼函式（callback）：呼叫它的不是你的程式，而是瀏覽器，時機是事件發生的那一刻。WEB01 看過的 `() => { … }` 是箭頭函式（arrow function），一種不必取名字的函式寫法：小括號裡放參數，大括號裡是要做的事。' },
        { type: 'example', id: 'web09-ex-listen' },
        { type: 'p', text: '先別按按鈕，看預覽下方的主控台：只有「監聽器登記完成」一行。script.js 已經從第一行執行到最後一行，兩個箭頭函式大括號裡的程式卻一行都還沒跑：`addEventListener` 只是登記，登記完程式就繼續往下走。接著按「加一本」三次，函式被呼叫三次，數字從 0 變成 3。`let` 宣告的變數可以重新指定（`const` 不行），而且 `books` 宣告在函式外面，每次呼叫用的都是同一個 `books`，數字才會累加。「領取借書證」按第二次就沒有反應了：第三個參數 `{ once: true }` 讓監聽器執行一次之後自動取消登記。' },
        { type: 'table', head: ['事件類型', '什麼時候發生', '常登記在'], rows: [
          ['`click`', '元素被點擊：滑鼠按一下、觸控點一下，或用鍵盤啟動按鈕（Enter 或空白鍵）', '按鈕、連結，其實任何元素都可以'],
          ['`input`', '欄位的值每改變一次就發生一次（每打一個字、每刪一個字）', '`input`、`textarea`、`select`'],
          ['`change`', '使用者改完並確定之後：文字欄位是改過內容再離開欄位時，核取方塊與下拉選單是一選就發生', '表單控制項'],
          ['`submit`', '表單被送出：按下送出按鈕，或在欄位裡按 Enter', '`form`（不是按鈕）'],
          ['`keydown`', '鍵盤上的一個鍵被按下；按住不放會重複發生', '欄位，或整個 `document`（快捷鍵）'],
        ] },
        { type: 'p', text: '舊的教學裡常看到 `<button onclick="addBook()">`：把程式寫在 HTML 的屬性裡。它能動，但不建議這樣寫。行為混進了 HTML，違反 WEB01 的分工，想改行為卻得去翻 HTML；而且同一個元素的同一種事件只能寫一份 `onclick`，`addEventListener` 則可以替同一個元素、同一種事件登記好幾個監聽器，它們依登記的先後執行，互不覆蓋。' },
        { type: 'p', text: '要取消登記，用 `元素.removeEventListener(\'click\', 函式)`，而且必須交出登記時的同一個函式。所以打算之後取消的監聽器要先取名字，例如 `const addBook = () => { … };`，登記與取消都寫 `addBook`；直接寫在參數位置、沒有名字的箭頭函式，之後就指不到它了。只需要執行一次的情況，用 `{ once: true }` 更簡單。' },
        { type: 'callout', tone: 'warning', title: '交出函式本身，不要先呼叫它', text: '`addButton.addEventListener(\'click\', addBook())` 多了一對小括號，意思就變成「現在馬上呼叫 `addBook`，再把它的回傳值登記成監聽器」。結果頁面一載入數字就先加了一，而回傳值是 `undefined`，等於什麼都沒登記：之後怎麼按都沒有反應，主控台也沒有錯誤。正確的寫法是只寫名稱 `addBook`，或直接寫一個箭頭函式。同樣不會報錯的還有寫錯事件類型：類型一律小寫、不加 on，寫成 `\'Click\'` 或 `\'onclick\'` 照樣登記得上，只是那種事件永遠不會發生。' },
      ],
    },
    {
      id: 'web09-event-object', title: '事件物件：發生了什麼事、發生在誰身上',
      blocks: [
        { type: 'p', text: '只知道「有人點了」常常不夠：點的是哪一個元素？按的是哪一個鍵？欄位現在的內容是什麼？監聽器被呼叫時，瀏覽器會傳給它一個參數，叫事件物件（event object），這次事件的細節都記在裡面。要用它，就在箭頭函式的小括號裡寫一個參數名稱，習慣上叫 `event`（也常見簡寫成 `e`）：`(event) => { … }`。用不到細節時可以不寫，上一個範例就是。最常用的是這幾個：' },
        { type: 'table', head: ['特性或方法', '是什麼', '例子'], rows: [
          ['`event.type`', '事件類型的名稱', '`\'click\'`、`\'input\'`'],
          ['`event.target`', '事件發生在哪一個元素上', '被點到的按鈕、正在輸入的欄位'],
          ['`event.currentTarget`', '正在執行的這個監聽器，登記在哪一個元素上', '下一節說明它和 `target` 的差別'],
          ['`event.key`', '鍵盤事件才有：按下的是哪一個鍵', '`\'a\'`、`\'Enter\'`、`\'Escape\'`、`\'ArrowDown\'`'],
          ['`event.preventDefault()`', '取消瀏覽器對這個事件的預設行為', '第四節'],
        ] },
        { type: 'example', id: 'web09-ex-object' },
        { type: 'p', text: '在欄位裡打幾個字：每改變一次內容就發生一次 `input`，監聽器從 `event.target`（就是那個欄位）讀出目前的 `value`，寫進下面的段落，主控台同時印出 `event.type` 與讀到的值。第 6 行用反引號包起來的字串是樣板字面值（template literal）：`${ }` 裡的運算式會先算出結果，再接進字串裡。每按一個鍵，主控台還會多一行 `keydown` 和鍵的名稱：字母鍵就是那個字母，其他鍵是英文名稱，像 `Enter`、`Backspace`、`ArrowLeft`。第二個監聽器只對 `Escape` 有動作：清空欄位，把提示文字放回去。用程式改 `value` 不會觸發 `input` 事件，所以提示文字要自己改回來。' },
        { type: 'p', text: '注意 `value` 是在監聽器裡面讀的。如果在檔案開頭就寫 `const keyword = field.value;`，讀到的是頁面載入當下的內容，也就是空字串；之後使用者打什麼，那個變數都不會更新。要用「事件發生當下」的值，就在監聽器裡讀。' },
        { type: 'callout', tone: 'tip', title: '想知道欄位的內容，監聽 input', text: '`keydown` 告訴你「按了哪個鍵」，不是「欄位裡現在是什麼」。用滑鼠貼上的文字不經過任何字母鍵；用注音這類輸入法組字時，`event.key` 回報的不會是最後選出來的那個字，你可能會在主控台看到 `Process` 這樣的名稱。所以欄位的內容以 `input` 事件加上 `value` 為準，`keydown` 留給快捷鍵，例如這個範例的 Escape。' },
      ],
    },
    {
      id: 'web09-bubbling', title: '冒泡：事件沿著 DOM 樹往上傳',
      blocks: [
        { type: 'p', text: '按鈕在 `li` 裡，`li` 在 `ul` 裡，`ul` 在 `body` 裡。點了按鈕，算不算也點了 `li`、`ul` 和整個頁面？瀏覽器的答案是「算」。事件先在發生的那個元素（`event.target`）上觸發登記在那裡的監聽器，接著沿著 DOM 樹一層一層往上，依序輪到父元素、父元素的父元素，一直到 `body`、`html` 與 `document`（最後還有代表視窗的 `window`）。每到一個節點，就執行登記在那裡、類型相同的監聽器。這個由內往外的過程叫冒泡（bubbling），像水裡的氣泡一路往上浮。' },
        { type: 'example', id: 'web09-ex-bubble' },
        { type: 'p', text: '`watch` 是為了少寫重複的程式而寫的小函式：替 `node` 登記一個 `click` 監聽器，被呼叫時印出自己的 `label`。按一下「借閱」按鈕，主控台依序出現四行：button、ul、body、document。script.js 登記的順序正好相反（先 `document`，最後才是按鈕），可見執行的先後由節點在 DOM 樹上的位置決定，和登記的先後無關。再看每一行的後半：四行的 `target` 都是 `<button#borrow>`（本站的主控台把元素印成「標籤#id」的樣子），`currentTarget` 則每一行都不同。接著點標題「新書架」：`h2` 不在 `ul` 裡，事件往上走的路不經過 `ul` 與按鈕，所以只有 `body` 與 `document` 的監聽器執行，`target` 變成 `<h2>`。' },
        { type: 'table', head: ['比較', 'event.target', 'event.currentTarget'], rows: [
          ['意思', '事件真正發生的元素：被點到的、最裡面的那一個', '正在執行的監聽器登記在哪一個節點上'],
          ['冒泡的途中', '從頭到尾不變', '每到一層就換成那一層的節點'],
          ['點按鈕、輪到 `ul` 的監聽器時', '`<button#borrow>`', '`<ul#books>`'],
        ] },
        { type: 'p', text: '冒泡之前其實還有一段由外往內的捕獲（capturing）階段：把 `addEventListener` 的第三個參數寫成 `{ capture: true }`，監聽器就改在那一段執行。平常用不到，知道有這回事就好。另外，少數事件不會冒泡，例如 `focus` 與 `blur`（元素取得、失去焦點）和 `mouseenter`（滑鼠移進元素）：它們只觸發登記在那個元素自己身上的監聽器，在祖先身上等不到。焦點另有會冒泡的版本 `focusin` 與 `focusout`。' },
        { type: 'p', text: '在監聽器裡呼叫 `event.stopPropagation()`，事件就停在這一層，不再往上傳。它看起來是「我的點擊不想被外層處理」的快速解法，卻很少是對的工具：外層的監聽器不一定只有你想擋的那一個，「點選單以外的地方就關閉選單」這類功能也靠冒泡運作，事件被攔下它們就失靈，而且沒有任何錯誤訊息。比較好的做法是讓事件照常冒泡，由外層的監聽器用 `event.target` 判斷這一下該不該處理。' },
        { type: 'callout', tone: 'warning', title: 'target 不一定是登記監聽器的那個元素', text: '監聽器登記在 `ul` 上，不代表 `event.target` 就是 `ul`：它是實際被點到的、最裡面的元素，可能是 `ul` 裡的按鈕，也可能是按鈕裡的 `<strong>`。想要「登記監聽器的那個元素」，用 `event.currentTarget`；想知道「被點到的是哪一個項目」，要從 `event.target` 往上找，第六節會用 `closest` 來做。把這兩個特性弄反，是事件程式裡最常見的錯誤之一。' },
      ],
    },
    {
      id: 'web09-default', title: '預設行為與表單：preventDefault 與 submit',
      blocks: [
        { type: 'p', text: '有些事件發生之後，瀏覽器自己本來就會做一件事，稱為預設行為（default action）：點連結會前往 `href` 的網址；送出表單會把資料送到 `action` 指定的網址（WEB04）並載入新頁面，沒有寫 `action` 就是送回目前這一頁的網址。這兩種預設行為都排在監聽器之後，所以監聽器來得及取消：呼叫 `event.preventDefault()`，等於告訴瀏覽器「這次由我處理，原本要做的那件事不要做」。' },
        { type: 'p', text: '最常需要取消的是表單。想讓使用者輸入書名、送出之後直接把它加進頁面上的清單，資料並不需要送到伺服器；如果不取消，瀏覽器會載入新頁面，剛加上去的項目跟著消失，因為 DOM 是記憶體裡的樹，重新載入就從 HTML 重新建立一次。做法是監聽表單的 `submit` 事件：' },
        { type: 'example', id: 'web09-ex-form' },
        { type: 'p', text: '輸入書名後按「加入」，或直接在欄位裡按 Enter：兩種方式都會送出表單、觸發同一個 `submit` 事件，所以監聽器只要寫一份。它做三件事：`event.preventDefault()` 取消送出；在這一刻才讀 `field.value`（`trim()` 會去掉字串頭尾的空白），不是空字串就建立一個 `li` 接到清單；最後清空欄位。再看主控台：最後三行在 `document` 上也登記了 `submit`（它會冒泡），印出 `event.defaultPrevented`，這個特性記錄「有沒有人對這個事件呼叫過 `preventDefault()`」，所以每次送出都印出 `true`。打開「動手改這個範例」，刪掉 `event.preventDefault();` 那一行再送出一次，印出來的變成 `false`：在真正的網頁上，這時頁面已經重新載入，清單也清空了。' },
        { type: 'callout', tone: 'note', title: '預覽裡的表單不會真的送出', text: '本站的預覽不會離開頁面，所以少了 `preventDefault()` 也看不到重新載入。預覽下方「表單送出了…」那一行，是本站在 `submit` 事件發生時留下的紀錄，不論指令稿有沒有取消預設行為都會出現；想知道有沒有取消，要看 `event.defaultPrevented`。連結也一樣：預覽只會記下它要前往哪裡。' },
        { type: 'p', text: '為什麼監聽表單的 `submit`，而不是按鈕的 `click`？第一，送出的方式不只一種，`submit` 一次涵蓋按鈕與 Enter。如果把按鈕寫成 `type="button"` 再監聽它的 `click`，使用者在欄位裡按 Enter 時，你的程式不會執行。第二，瀏覽器會先做原生驗證（WEB04 的 `required` 等屬性），通過了才發出 `submit`；按鈕的 `click` 卻在驗證之前就發生，監聽器拿到的是還沒檢查過的資料。' },
        { type: 'p', text: '連結的寫法相同：在連結的 `click` 監聽器裡呼叫 `event.preventDefault()`，點擊就不再前往 `href`，改做你指定的事。不過，如果那個東西點了本來就不是要去另一個網址，一開始就該用 `<button type="button">`，連取消都不必。鍵盤的處理也可以整理成兩句：要對「按 Enter 送出」有反應，監聽表單的 `submit`；要做快捷鍵，在 `keydown` 的監聽器裡比對 `event.key`，就像第二節的 Escape。' },
        { type: 'callout', tone: 'warning', title: 'preventDefault 與 stopPropagation 是兩回事', text: '名字相像，作用完全不同。`preventDefault()` 取消瀏覽器的預設行為，事件照樣繼續冒泡；`stopPropagation()` 讓事件不再往上傳，預設行為照樣發生。在 `submit` 的監聽器裡把前者誤寫成 `event.stopPropagation()`，表單還是會送出，頁面還是會重新載入，主控台不會有任何錯誤。' },
      ],
    },
    {
      id: 'web09-per-item', title: '逐一登記的漏洞：之後才加入的元素',
      blocks: [
        { type: 'p', text: '清單裡的每一本書點了都要有反應，最直覺的寫法是用 WEB08 的 `querySelectorAll` 把所有的 `li` 找出來，再用 `forEach` 替每一個登記監聽器：兩本書兩個監聽器，三十本就三十個。項目固定不變的頁面這樣寫沒有問題；清單一旦會增減，就出現一個漏洞。下面的頁面有一個「再借一本」按鈕，會在清單最後加上新的 `li`：' },
        { type: 'example', id: 'web09-ex-per-item' },
        { type: 'p', text: '先點清單裡原有的兩本書：文字被劃掉，再點一次恢復，一切正常。按「再借一本」，清單多了第三本；點它，沒有反應，主控台也沒有任何錯誤。原因在執行的時機：`querySelectorAll(\'li\')` 與 `forEach` 只在頁面載入時執行一次，當時清單裡只有兩個 `li`，所以只有那兩個元素身上有監聽器。第三個 `li` 是之後才由 `createElement` 建立的，沒有人替它登記過。監聽器是登記在「元素」身上，不是登記在「選擇器」上：之後才符合選擇器的元素，不會自動補上監聽器。' },
        { type: 'p', text: '一種補法是每建立一個新項目，就再替它呼叫一次 `addEventListener`。這樣可行，但程式裡每一個會建立項目的地方都得記得做，漏掉一處，頁面上就多一個點不動的項目；「點了要做什麼」也因此寫在不只一個地方，日後修改要改好幾處。下一節換一個方向：既然點擊會冒泡，那就只在不會變動的祖先身上聽一次。' },
        { type: 'callout', tone: 'note', title: '可以點的東西，正式的網站會用按鈕', text: '這一節與下一節的範例為了簡短，直接讓 `li` 可以點；只用鍵盤的使用者沒辦法把焦點移到它上面。正式的網站會在項目裡放一個 `<button>`，再判斷被點到的是不是那個按鈕（練習四就是這樣做）。讓自製的元件也能用鍵盤與螢幕閱讀器操作，是 WEB13 的主題。' },
      ],
    },
    {
      id: 'web09-delegation', title: '事件委派：一個監聽器照顧整份清單',
      blocks: [
        { type: 'p', text: '事件委派（event delegation）的做法是：不替每個項目登記，而是在它們共同的、不會被換掉的祖先上登記一個監聽器，這裡是 `ul#loans`。不論點到哪一個 `li`，事件都會冒泡到 `ul`，監聽器再從 `event.target` 判斷這一下點到的是哪一個項目。就像圖書館不必替每一本書安排一位館員：櫃台一個人，看你拿來的是哪一本再處理。' },
        { type: 'p', text: '判斷靠的是 `closest`。`元素.closest(\'選擇器\')` 從元素自己開始往上找，回傳第一個符合選擇器的元素（可能就是它自己）；一路找到最上層都沒有，就回傳 `null`。被點到的可能是 `li` 裡的 `<strong>`，也可能是 `li` 本身，`event.target.closest(\'li\')` 都能找到那個項目。' },
        { type: 'example', id: 'web09-ex-delegation' },
        { type: 'p', text: '點第二本的書名（粗體字）：主控台顯示 `target` 是 `<strong>`，`closest(\'li\')` 找到的是包住它的 `li`，被劃掉的是整個項目，不是只有書名。按「再借一本」，再點新的那一本，一樣有反應：監聽器登記在 `ul` 上，新的 `li` 是 `ul` 的子元素，它的點擊照樣冒泡上來，不必為它多做任何事。最後點兩個項目之間的空隙（淺灰色的底）：這時 `target` 是 `ul` 自己，`closest(\'li\')` 回傳 `null`，監聽器直接 `return`，什麼都不做。' },
        { type: 'p', text: '`if` 裡有兩個條件，中間的 `||` 是「或」，`!` 是「不」。`item === null`：沒有點在任何項目上，就不處理；少了這個檢查，下一行等於向 `null` 要 `classList`，監聽器會在那裡中斷，主控台出現 TypeError。`!list.contains(item)`：`closest` 會一路往上找到文件的最上層，如果這份清單本身被放在另一個 `li` 裡（巢狀清單），點空隙時找到的會是外面那個 `li`；`list.contains(item)` 確認找到的項目真的在這份清單裡面。' },
        { type: 'table', head: ['比較', '逐一登記', '事件委派'], rows: [
          ['監聽器的數量', '每個項目一個', '整份清單一個'],
          ['之後才加入的項目', '要記得另外登記', '自動涵蓋'],
          ['怎麼知道點到誰', '每個監聽器各自記得自己的項目', '用 `event.target.closest(…)` 往上找'],
          ['適合的情況', '少數固定的元素，例如頁面上的一兩個按鈕', '清單、表格等會增減的一組元素'],
        ] },
        { type: 'list', ordered: true, items: [
          '找一個穩定的祖先登記監聽器：項目增減時它一直都在，而且所有的項目都在它裡面。',
          '用 `event.target.closest(\'選擇器\')` 找出這一下點到的項目或按鈕。',
          '找不到（`null`）或不在容器裡就 `return`，其餘的情況才處理。',
        ] },
        { type: 'callout', tone: 'tip', title: '委派靠的是冒泡', text: '事件到得了祖先，委派才做得成。所以不會冒泡的事件（`focus`、`blur`、`mouseenter`）不能這樣處理；項目裡若有監聽器呼叫了 `event.stopPropagation()`，祖先上的委派監聽器也收不到那一次點擊。這正是第三節建議少用 `stopPropagation()` 的原因。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'web09-q1', prompt: '頁面載入後，使用者按了兩次 `#add` 按鈕。主控台一共出現幾次「加一本」？',
      code: { language: 'JavaScript', text: "const button = document.querySelector('#add');\nconst addBook = () => {\n  console.log('加一本');\n};\nbutton.addEventListener('click', addBook());" },
      options: ['兩次：每按一次印一次', '三次：載入時一次，之後每按一次再印一次', '一次：載入時就印了，之後按按鈕都沒有反應', '零次：最後一行會出錯，函式從頭到尾沒有執行'],
      answer: 2,
      explanation: '`addBook()` 多了小括號，是「現在就呼叫」：載入時立刻印出一次，再把回傳值 `undefined` 交給 `addEventListener`，等於沒有登記任何監聽器，之後按幾次都不會再印，所以總共一次。想要每按一次印一次，應該只寫名稱 `addBook`。把 `undefined` 當成監聽器不會產生錯誤，所以不是零次；登記沒有成功，也就沒有後面按出來的那兩次。',
    },
    {
      id: 'web09-q2', prompt: '想在使用者每改變一次欄位內容時，立刻更新頁面上的搜尋提示，用滑鼠貼上文字也要更新。應該監聽欄位的哪一個事件？',
      options: ['`input`', '`change`', '`keydown`', '`submit`'],
      answer: 0,
      explanation: '`input` 在欄位的值每次改變時發生，打字、刪除、貼上都算，正好符合需求。`change` 要等使用者改完、離開欄位才發生，做不到「立刻」；`keydown` 只知道按了哪個鍵，用滑鼠貼上時根本沒有按鍵，輸入法選出的字也不在 `event.key` 裡；`submit` 是表單被送出時才發生在 `form` 上的事件。',
    },
    {
      id: 'web09-q3', prompt: '頁面的結構是 `main#page` 包著 `ul#list`，`ul` 裡的 `li` 包著 `button#go`。指令稿依下面的順序登記了三個監聽器。使用者點了按鈕，主控台的輸出順序是？',
      code: { language: 'JavaScript', text: "document.querySelector('#page').addEventListener('click', () => {\n  console.log('main');\n});\ndocument.querySelector('#list').addEventListener('click', () => {\n  console.log('ul');\n});\ndocument.querySelector('#go').addEventListener('click', () => {\n  console.log('button');\n});" },
      options: ['main、ul、button', '只有 button', 'button、main、ul', 'button、ul、main'],
      answer: 3,
      explanation: '點擊先觸發被點到的按鈕上的監聽器，再沿著 DOM 樹往上冒泡，依序經過 `ul` 與 `main`，所以是 button、ul、main。執行的先後由元素在樹上的位置決定，和登記的先後無關，因此不是 main、ul、button；`click` 會冒泡，外層收得到，所以不會只有 button；冒泡是一層一層往上，不會跳過 `ul` 先到 `main`。',
    },
    {
      id: 'web09-q4', prompt: '監聽器登記在 `ul#loans` 上。使用者點到其中一個 `li` 裡的 `<strong>`（書名）。監聽器執行時，下列哪一個敘述正確？',
      options: ['`event.target` 與 `event.currentTarget` 都是 `ul`', '`event.target` 是 `ul`，`event.currentTarget` 是 `strong`', '`event.target` 是 `li`，`event.currentTarget` 是 `ul`', '`event.target` 是 `strong`，`event.currentTarget` 是 `ul`'],
      answer: 3,
      explanation: '`event.target` 是事件真正發生的、最裡面的那個元素，這裡是被點到的 `strong`；`event.currentTarget` 是正在執行的監聽器所登記的元素，也就是 `ul`。兩者只有在直接點到 `ul` 自己時才會相同。`target` 也不會自動變成你想要的那個項目：要從 `strong` 找到 `li`，得自己呼叫 `event.target.closest(\'li\')`。把兩個特性對調，則是最常見的誤解。',
    },
    {
      id: 'web09-q5', prompt: '表單 `submit` 的監聽器要把輸入的書名加到頁面上的清單，而且頁面不能重新載入。監聽器裡該怎麼做？',
      options: ['呼叫 `event.stopPropagation()`：事件不再冒泡，瀏覽器就不會送出表單', '呼叫 `event.preventDefault()`：取消瀏覽器預設的送出', '什麼都不用呼叫：只要有監聽器執行過，瀏覽器就不會再送出表單', '在監聽器的最後把欄位清空：沒有資料，瀏覽器就不會送出'],
      answer: 1,
      explanation: '送出表單並載入新頁面是 `submit` 事件的預設行為，要取消它只能呼叫 `event.preventDefault()`。`stopPropagation()` 只是讓事件不再往外層傳，預設行為照常發生；登記監聽器本身不會取消任何預設行為，監聽器執行完，瀏覽器照樣送出；把欄位清空只會讓送出去的資料變成空的，頁面一樣重新載入。',
    },
    {
      id: 'web09-q6', prompt: '指令稿只替 `#add` 登記了 `click` 的監聽器，用來把書名加進清單。使用者輸入書名之後，直接在欄位裡按 Enter。下列哪一個敘述正確？',
      code: { language: 'HTML', text: '<form id="wish-form">\n  <label for="title">書名</label>\n  <input id="title" name="title">\n  <button id="add" type="button">加入</button>\n</form>' },
      options: ['`click` 的監聽器不會執行；應該改用送出按鈕，並監聽表單的 `submit`', '和按下按鈕完全相同：Enter 一定會觸發表單裡第一個按鈕的 `click`', 'Enter 會在 `#add` 上觸發 `keydown`，所以 `click` 的監聽器照樣執行', '瀏覽器會顯示錯誤訊息，提醒這個表單沒有送出按鈕'],
      answer: 0,
      explanation: '`type="button"` 的按鈕不是送出按鈕，在欄位裡按 Enter 不會點到它，`click` 的監聽器不會執行；這個表單只有一個文字欄位，瀏覽器會直接送出表單，書沒有加進清單，頁面還重新載入了。把按鈕改回送出按鈕、監聽表單的 `submit` 並呼叫 `preventDefault()`，按鈕與 Enter 就走同一條路。Enter 是按在欄位上的，`keydown` 發生在欄位而不是按鈕；瀏覽器也不會為此顯示任何錯誤。',
    },
    {
      id: 'web09-q7', prompt: '這段程式在頁面載入時執行一次。之後，另一段程式用 `createElement` 建立一個新的 `li`，接到 `#loans` 的最後。使用者點這個新的 `li`，會發生什麼事？',
      code: { language: 'JavaScript', text: "document.querySelectorAll('#loans li').forEach((item) => {\n  item.addEventListener('click', () => {\n    item.classList.toggle('returned');\n  });\n});" },
      options: ['正常切換 `returned`：`querySelectorAll` 的結果會自動包含之後加入的元素', '主控台出現 TypeError：新的 `li` 身上沒有監聽器可以呼叫', '沒有反應，也沒有錯誤：登記的當時這個 `li` 還不存在', '正常切換 `returned`：監聽器是登記在選擇器 `#loans li` 上的'],
      answer: 2,
      explanation: '`querySelectorAll` 在載入時執行，回傳的是當時符合的元素，`forEach` 只替那幾個元素登記了監聽器。新的 `li` 之後才建立，沒有人替它登記，點了什麼都不會發生；元素身上沒有監聽器不是錯誤，主控台不會有任何訊息。監聽器登記在元素上，不是登記在選擇器上，之後才符合選擇器的元素不會自動補上。解法是事件委派：在 `#loans` 上登記一個監聽器。',
    },
    {
      id: 'web09-q8', prompt: '`list` 是頁面上的一個 `ul`，它不在任何 `li` 裡面。使用者點在兩個 `li` 之間的空隙，也就是 `ul` 自己身上。會發生什麼事？',
      code: { language: 'JavaScript', text: "list.addEventListener('click', (event) => {\n  const item = event.target.closest('li');\n  item.classList.toggle('returned');\n});" },
      options: ['什麼都不會發生：`closest` 找不到時，後面的程式會自動略過', '`closest(\'li\')` 回傳 `null`，下一行向 `null` 要 `classList`，主控台出現 TypeError', '第一個 `li` 被切換：`closest` 找不到祖先時，會改成往下找最近的 `li`', '整個 `ul` 被切換：找不到 `li` 時，`closest` 回傳元素自己'],
      answer: 1,
      explanation: '這時 `event.target` 是 `ul`；`closest(\'li\')` 從它自己往上找，祖先裡沒有 `li`，回傳 `null`。下一行向 `null` 要 `classList`，監聽器在那裡中斷，主控台出現 TypeError。所以委派的監聽器要先檢查：`item` 是 `null` 就 `return`。`closest` 只往上找，不會往下找子元素，也不會在找不到時回傳元素自己；JavaScript 更不會替你略過出錯的那一行。',
    },
  ],
  webCode: { examples, exercises },
};
