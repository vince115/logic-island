import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB10 Asynchronous JavaScript (WEB-3). Why a page with one thread needs asynchronous work, the event loop's order
 * (the running script, then every microtask, then one task), promises (states, then/catch/finally), async functions
 * and await, sequential against parallel waiting (Promise.all), and errors with try/catch/finally plus the loading and
 * error states a page owes its user. The page has no network, so every "loader" is a timer wrapped in a promise; the
 * checks run on the virtual clock (a `wait` step), so timing is proved by the page's state after a wait, never by
 * measured time. Every `observe` fact and every exercise (solution, starter, mistakes, variants) is run in Chromium by
 * the tests. Names and data are made up.
 */

const lines = (...text: string[]) => text.join('\n');

const WAIT = 'const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));';

const examples: WebExample[] = [
  {
    id: 'web10-later', title: '交代下去，晚一點才做',
    description: '模擬一次要等 2.5 秒的查詢：`setInterval` 每秒更新已經等了幾秒，`setTimeout` 在 2.5 秒後顯示結果並取消計時。',
    files: {
      html: lines(
        '<h1>查詢館藏</h1>',
        '<p id="notice">查詢中…</p>',
        '<p>已經等了 <output id="seconds">0</output> 秒</p>',
      ),
      js: lines(
        "const notice = document.querySelector('#notice');",
        "const seconds = document.querySelector('#seconds');",
        'let waited = 0;',
        '',
        'const ticker = setInterval(() => {',
        '  waited += 1;',
        '  seconds.textContent = waited;',
        '}, 1000);',
        '',
        'setTimeout(() => {',
        "  notice.textContent = '查到 3 本書';",
        '  clearInterval(ticker);',
        "  console.log('2.5 秒到了，顯示結果');",
        '}, 2500);',
        '',
        "console.log('最後一行執行完了');",
      ),
    },
    observe: [
      { check: 'console', lines: ['最後一行執行完了'], label: '頁面一載入，主控台就有「最後一行執行完了」：指令稿沒有停在 `setTimeout` 那裡等' },
      { do: 'wait', ms: 2000 },
      { check: 'text', selector: '#seconds', text: '2', label: '過了 2000 毫秒，`setInterval` 的回呼函式被呼叫了兩次，數字是 2' },
      { check: 'text', selector: '#notice', text: '查詢中…', label: '這時 `#notice` 仍是「查詢中…」：2500 毫秒還沒到' },
      { do: 'wait', ms: 500 },
      { check: 'text', selector: '#notice', text: '查到 3 本書', label: '到了 2500 毫秒，`setTimeout` 的回呼函式把文字換成「查到 3 本書」' },
      { do: 'wait', ms: 5000 },
      { check: 'text', selector: '#seconds', text: '2', label: '再過 5000 毫秒，數字仍是 2：`clearInterval` 已經取消了每秒一次的計時器' },
    ],
  },
  {
    id: 'web10-order', title: '四行程式，誰先印出來',
    description: '兩行同步的 `console.log`，中間夾著一個延遲 0 毫秒的計時器和一個 Promise 的回呼函式。',
    files: {
      html: lines(
        '<h1>誰先印出來？</h1>',
        '<p>先猜順序，再看下方的主控台。</p>',
      ),
      js: lines(
        "console.log('A：第一行');",
        "setTimeout(() => console.log('B：計時器'), 0);",
        "Promise.resolve().then(() => console.log('C：Promise'));",
        "console.log('D：最後一行');",
      ),
    },
    observe: [
      { check: 'console', lines: ['A：第一行', 'D：最後一行', 'C：Promise', 'B：計時器'], label: '主控台的順序是 A、D、C、B，不是程式碼由上到下的順序' },
      { check: 'console', lines: ['A：第一行', 'D：最後一行'], match: 'includes', label: '同步的兩行（A、D）最先執行完' },
      { check: 'console', lines: ['C：Promise', 'B：計時器'], match: 'includes', label: 'Promise 的回呼函式（微任務 C）排在計時器（任務 B）前面，即使 B 比較早登記、延遲又是 0' },
    ],
  },
  {
    id: 'web10-promise', title: '用 then、catch、finally 接住結果',
    description: '`loadShelf` 回傳一個 Promise：書架 A 在 300 毫秒後交出書名的陣列，其他書架則是 rejected。',
    files: {
      html: lines(
        '<h1>查詢書架</h1>',
        '<button id="a" type="button">書架 A</button>',
        '<button id="z" type="button">書架 Z</button>',
        '<p id="notice">請選一個書架</p>',
      ),
      js: lines(
        "const notice = document.querySelector('#notice');",
        WAIT,
        '',
        'function loadShelf(shelf) {',
        '  return wait(300).then(() => {',
        "    if (shelf !== 'A') throw new Error(`沒有書架 ${shelf}`);",
        "    return ['島嶼植物圖鑑', '潮汐的故事'];",
        '  });',
        '}',
        '',
        'function show(shelf) {',
        "  notice.textContent = '載入中…';",
        '  loadShelf(shelf)',
        '    .then((books) => { notice.textContent = `書架 ${shelf} 有 ${books.length} 本書`; })',
        '    .catch((error) => { notice.textContent = `載入失敗：${error.message}`; })',
        '    .finally(() => console.log(`書架 ${shelf} 查詢結束`));',
        '}',
        '',
        "document.querySelector('#a').addEventListener('click', () => show('A'));",
        "document.querySelector('#z').addEventListener('click', () => show('Z'));",
      ),
    },
    observe: [
      { do: 'click', selector: '#a' },
      { check: 'text', selector: '#notice', text: '載入中…', label: '按下「書架 A」的當下，Promise 還在 pending，`#notice` 是「載入中…」' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '書架 A 有 2 本書', label: '300 毫秒後 Promise 變成 fulfilled，`.then` 的回呼函式收到陣列，顯示「書架 A 有 2 本書」' },
      { do: 'click', selector: '#z' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '載入失敗：沒有書架 Z', label: '按「書架 Z」：Promise 變成 rejected，跳過 `.then`，由 `.catch` 顯示「載入失敗：沒有書架 Z」' },
      { check: 'console', lines: ['書架 A 查詢結束', '書架 Z 查詢結束'], label: '成功與失敗各一次，`.finally` 的回呼函式兩次都執行了' },
    ],
  },
  {
    id: 'web10-await', title: 'await 只暫停自己所在的函式',
    description: '`openLibrary` 是非同步函式，中途用 `await` 等 500 毫秒；呼叫它之後的下一行不會跟著等。',
    files: {
      html: lines(
        '<h1>開館準備</h1>',
        '<ol id="steps"></ol>',
      ),
      js: lines(
        "const steps = document.querySelector('#steps');",
        WAIT,
        '',
        'function say(text) {',
        "  const item = document.createElement('li');",
        '  item.textContent = text;',
        '  steps.append(item);',
        '  console.log(text);',
        '}',
        '',
        'async function openLibrary() {',
        "  say('開燈');",
        '  await wait(500);',
        "  say('電腦開機完成');",
        "  return '可以借書了';",
        '}',
        '',
        'openLibrary().then((message) => say(message));',
        "say('館員先去泡茶');",
      ),
    },
    observe: [
      { check: 'console', lines: ['開燈', '館員先去泡茶'], label: '一開始只有「開燈」與「館員先去泡茶」：函式停在 `await`，函式外的下一行先執行了' },
      { do: 'wait', ms: 499 },
      { check: 'count', selector: '#steps li', count: 2, label: '499 毫秒時清單仍然只有兩項：`openLibrary` 還停在 `await` 那一行' },
      { do: 'wait', ms: 1 },
      { check: 'console', lines: ['開燈', '館員先去泡茶', '電腦開機完成', '可以借書了'], label: '500 毫秒一到，函式從 `await` 的下一行繼續，依序印出後兩行' },
      { check: 'text', selector: '#steps li:last-child', text: '可以借書了', label: '函式 `return` 的字串，經由它回傳的 Promise 交給 `.then` 的回呼函式' },
    ],
  },
  {
    id: 'web10-parallel', title: '一份一份等，或兩份一起等',
    description: '`loadBooks` 與 `loadSeats` 各要 300 毫秒。兩個按鈕載入同樣的兩份資料，差別只在等的方式。',
    files: {
      html: lines(
        '<h1>今日圖書館</h1>',
        '<button id="one" type="button">一份一份等</button>',
        '<button id="both" type="button">兩份一起等</button>',
        '<p id="notice">按一個按鈕開始載入</p>',
      ),
      js: lines(
        "const notice = document.querySelector('#notice');",
        WAIT,
        'const loadBooks = () => wait(300).then(() => 3);',
        'const loadSeats = () => wait(300).then(() => 12);',
        '',
        'async function oneByOne() {',
        "  notice.textContent = '載入中…';",
        '  const books = await loadBooks();',
        '  const seats = await loadSeats();',
        '  notice.textContent = `新書 ${books} 本，空位 ${seats} 個`;',
        '}',
        '',
        'async function together() {',
        "  notice.textContent = '載入中…';",
        '  const [books, seats] = await Promise.all([loadBooks(), loadSeats()]);',
        '  notice.textContent = `新書 ${books} 本，空位 ${seats} 個`;',
        '}',
        '',
        "document.querySelector('#one').addEventListener('click', oneByOne);",
        "document.querySelector('#both').addEventListener('click', together);",
      ),
    },
    observe: [
      { do: 'click', selector: '#one' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '載入中…', label: '按「一份一份等」之後 300 毫秒，仍是「載入中…」：第二份資料這時才開始載入' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '新書 3 本，空位 12 個', label: '600 毫秒（300 + 300）才顯示「新書 3 本，空位 12 個」' },
      { do: 'click', selector: '#both' },
      { check: 'text', selector: '#notice', text: '載入中…', label: '按「兩份一起等」的當下，文字回到「載入中…」' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '新書 3 本，空位 12 個', label: '只過 300 毫秒，兩份資料就都到齊了：`Promise.all` 讓兩個等待同時進行' },
    ],
  },
  {
    id: 'web10-errors', title: '載入中、成功與失敗都要交代',
    description: '`loadMember` 查得到借閱證 A001，其他號碼會丟出錯誤。監聽器用 `try`／`catch`／`finally` 處理三種狀態。',
    files: {
      html: lines(
        '<h1>查詢借閱證</h1>',
        '<label>借閱證號碼 <input id="card" value="A001"></label>',
        '<button id="find" type="button">查詢</button>',
        '<p id="notice"></p>',
      ),
      js: lines(
        "const notice = document.querySelector('#notice');",
        "const button = document.querySelector('#find');",
        WAIT,
        '',
        'async function loadMember(id) {',
        '  await wait(300);',
        "  if (id !== 'A001') throw new Error(`查無借閱證 ${id}`);",
        "  return { name: '小安', borrowed: 2 };",
        '}',
        '',
        "button.addEventListener('click', async () => {",
        '  button.disabled = true;',
        "  notice.textContent = '查詢中…';",
        '  try {',
        "    const member = await loadMember(document.querySelector('#card').value);",
        '    notice.textContent = `${member.name}借了 ${member.borrowed} 本書`;',
        '  } catch (error) {',
        '    notice.textContent = `查詢失敗：${error.message}`;',
        '  } finally {',
        '    button.disabled = false;',
        '  }',
        '});',
      ),
    },
    observe: [
      { do: 'click', selector: '#find' },
      { check: 'attr', selector: '#find', name: 'disabled', label: '按下「查詢」之後、結果回來之前，按鈕是停用的（有 `disabled` 屬性）' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '小安借了 2 本書', label: '借閱證 A001：300 毫秒後顯示「小安借了 2 本書」' },
      { do: 'input', selector: '#card', value: 'B777' },
      { do: 'click', selector: '#find' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '查詢失敗：查無借閱證 B777', label: '借閱證 B777：`await` 丟出錯誤，由 `catch` 顯示「查詢失敗：查無借閱證 B777」' },
      { check: 'attr', selector: '#find', name: 'disabled', match: 'absent', label: '失敗之後按鈕也恢復可按：`finally` 不論成功或失敗都會執行' },
      { check: 'console', lines: [], label: '主控台沒有任何輸出：錯誤被接住了，沒有變成未捕捉的錯誤' },
    ],
  },
];

// ---- exercises ------------------------------------------------------------------------------------------------------

const ORDER_HTML = lines(
  '<h1>開館準備</h1>',
  '<p>按「執行」之後，展開下方的主控台，看四則訊息出現的時間。</p>',
);
const orderJs = (...body: string[]) => lines(
  WAIT,
  '',
  'async function prepare() {',
  ...body,
  '}',
  '',
  'prepare();',
  "console.log('館員去泡茶');",
);
const ORDER_AT_START = ['開燈', '館員去泡茶'];
const ORDER_AT_500 = [...ORDER_AT_START, '電腦開機完成'];

const booksHtml = (ms: number, titles: string[]) => lines(
  '<h1>本週新書</h1>',
  '<p id="notice"></p>',
  '<ul id="books"></ul>',
  '<script>',
  `  // 假的載入函式：${ms} 毫秒後交出書名的陣列（這個頁面不能連上網路）`,
  '  function loadBooks() {',
  '    return new Promise((resolve) => {',
  `      setTimeout(() => resolve([${titles.map(t => `'${t}'`).join(', ')}]), ${ms});`,
  '    });',
  '  }',
  '</script>',
);
const loadingJs = (...body: string[]) => lines(
  "const notice = document.querySelector('#notice');",
  "const list = document.querySelector('#books');",
  '',
  'function addBook(title) {',
  "  const item = document.createElement('li');",
  '  item.textContent = title;',
  '  list.append(item);',
  '}',
  '',
  'async function showBooks() {',
  ...body,
  '}',
  '',
  'showBooks();',
);

const renewHtml = (title: string, due: string, refusal: string) => lines(
  '<h1>線上續借</h1>',
  '<label>書碼 <input id="code" value="B001"></label>',
  '<button id="renew" type="button">續借</button>',
  '<p id="notice"></p>',
  '<script>',
  '  // 假的續借函式：300 毫秒後有結果。只有書碼 B001 可以續借。',
  '  function renewBook(code) {',
  '    return new Promise((resolve, reject) => {',
  '      setTimeout(() => {',
  `        if (code === 'B001') resolve({ title: '${title}', due: '${due}' });`,
  `        else reject(new Error('${refusal}'));`,
  '      }, 300);',
  '    });',
  '  }',
  '</script>',
);
const renewJs = (...body: string[]) => lines(
  "const code = document.querySelector('#code');",
  "const button = document.querySelector('#renew');",
  "const notice = document.querySelector('#notice');",
  '',
  "button.addEventListener('click', async () => {",
  '  button.disabled = true;',
  "  notice.textContent = '處理中…';",
  ...body,
  '});',
);
const RENEW_OK = '    notice.textContent = `《${book.title}》已續借到 ${book.due}`;';

const todayHtml = (hours: { ms: number; value: string }, books: { ms: number; titles?: string[]; error?: string }) => lines(
  '<h1>今日圖書館</h1>',
  '<p id="notice"></p>',
  '<p id="hours"></p>',
  '<ul id="books"></ul>',
  '<script>',
  '  // 兩個假的載入函式（這個頁面不能連上網路）',
  '  function loadHours() {',
  `    return new Promise((resolve) => setTimeout(() => resolve('${hours.value}'), ${hours.ms}));`,
  '  }',
  '  function loadBooks() {',
  books.error === undefined
    ? `    return new Promise((resolve) => setTimeout(() => resolve([${(books.titles ?? []).map(t => `'${t}'`).join(', ')}]), ${books.ms}));`
    : `    return new Promise((resolve, reject) => setTimeout(() => reject(new Error('${books.error}')), ${books.ms}));`,
  '  }',
  '</script>',
);
const todayJs = (...body: string[]) => lines(
  "const notice = document.querySelector('#notice');",
  "const hoursText = document.querySelector('#hours');",
  "const list = document.querySelector('#books');",
  '',
  'function render(hours, books) {',
  '  hoursText.textContent = `今天開放 ${hours}`;',
  '  for (const title of books) {',
  "    const item = document.createElement('li');",
  '    item.textContent = title;',
  '    list.append(item);',
  '  }',
  '}',
  '',
  'async function start() {',
  "  notice.textContent = '載入中…';",
  ...body,
  '}',
  '',
  'start();',
);

const exercises: WebExercise[] = [
  {
    id: 'web10-x-order', title: '讓開館準備照時間進行',
    statement: 'index.html 不能改。館員希望主控台照實際的時間回報開館準備：頁面一載入就印出「開燈」，緊接著是「館員去泡茶」；載入後 500 毫秒才印出「電腦開機完成」；再過 300 毫秒（也就是載入後 800 毫秒）才印出「開始借書」。現在的 script.js 一瞬間就把四行印完，順序也不對。請只修改 `prepare` 函式的內容，用已經寫好的 `wait` 讓它在該等的地方等；四則訊息的文字與兩個毫秒數不要改。',
    hints: [
      '`wait(500)` 只是建立一個 500 毫秒後 fulfilled 的 Promise，函式不會因此停下來。要讓函式等它，前面少了一個關鍵字。',
      '兩個 `wait(…)` 都要等：第二個必須在第一個等完之後才開始計時，「開始借書」才會落在 800 毫秒。',
      '在 `prepare` 裡的 `wait(500)` 與 `wait(300)` 前面各加上 `await`。',
    ],
    explanation: '`prepare()` 被呼叫後先同步執行到第一個 `await`，印出「開燈」就暫停，控制權回到指令稿，所以「館員去泡茶」緊接著印出。500 毫秒後函式從暫停的地方繼續，印出「電腦開機完成」，這時才呼叫 `wait(300)` 開始第二段計時，「開始借書」因此出現在 500 + 300 = 800 毫秒。沒有 `await` 的 `wait(500)` 只是建立了一個沒有人等的 Promise，下一行立刻就執行。',
    fixed: { html: ORDER_HTML },
    starter: { js: orderJs("  console.log('開燈');", '  wait(500);', "  console.log('電腦開機完成');", '  wait(300);', "  console.log('開始借書');") },
    solution: { js: orderJs("  console.log('開燈');", '  await wait(500);', "  console.log('電腦開機完成');", '  await wait(300);', "  console.log('開始借書');") },
    steps: [
      { check: 'console', lines: ORDER_AT_START, label: '頁面一載入，主控台只有兩行：先是「開燈」，再是「館員去泡茶」' },
      { do: 'wait', ms: 499 },
      { check: 'console', lines: ORDER_AT_START, label: '499 毫秒時，主控台仍然只有這兩行' },
      { do: 'wait', ms: 1 },
      { check: 'console', lines: ORDER_AT_500, label: '500 毫秒時多了第三行「電腦開機完成」，而且只多這一行' },
      { do: 'wait', ms: 300 },
      { check: 'console', lines: [...ORDER_AT_500, '開始借書'], label: '800 毫秒時多了第四行「開始借書」' },
    ],
    mistakes: [
      {
        files: { js: orderJs("  console.log('開燈');", '  await wait(500);', "  console.log('電腦開機完成');", '  wait(300);', "  console.log('開始借書');") },
        why: '只在第一個 `wait` 前面加了 `await`。函式在 500 毫秒時繼續，但第二個 `wait(300)` 沒有人等，「開始借書」緊跟著「電腦開機完成」在同一刻印出，沒有再隔 300 毫秒。',
      },
      {
        files: { js: orderJs("  console.log('開燈');", "  wait(500).then(() => console.log('電腦開機完成'));", "  wait(300).then(() => console.log('開始借書'));") },
        why: '兩個 `wait` 在同一刻被呼叫，兩段計時同時開始：300 毫秒的那一個先到，「開始借書」反而比「電腦開機完成」早印出。要讓第二段在第一段結束後才開始，得用 `await`，或把第二個 `wait` 寫進第一個 `.then` 的回呼函式裡。',
      },
    ],
  },
  {
    id: 'web10-x-loading', title: '載入新書清單',
    statement: 'index.html 不能改：裡面的 `loadBooks()` 是假的載入函式，呼叫後回傳一個 Promise，300 毫秒後交出書名的陣列。請完成 script.js 的 `showBooks`：先讓 `#notice` 顯示「載入中…」；等 `loadBooks()` 的結果回來，用寫好的 `addBook` 把每一本書依序加進 `#books`；最後把 `#notice` 改成「共 N 本書」，N 是實際載入的本數（這個頁面是「共 3 本書」）。資料回來之前，清單必須是空的。檢查還會在另一個頁面上執行：那裡的書和等待的時間都不一樣，所以書名與本數不能寫死。',
    hints: [
      '「載入中…」要在開始等之前就寫進 `#notice`：那一行放在 `await` 的前面。',
      '`loadBooks()` 回傳的是 Promise，不是陣列。在它前面加 `await`，並用 `const books = …` 接住結果。',
      '拿到 `books` 之後，用 `for (const title of books) { addBook(title); }` 逐一加入（`for…of` 會依序把陣列的每個元素交給 `title`），再用 `books.length` 組出「共 N 本書」。',
    ],
    explanation: '一個非同步流程有三個時間點，各有該做的事：開始等之前先顯示「載入中…」；`await loadBooks()` 讓函式暫停到資料回來；回來之後才把清單畫出來，並把提示換成結果。書名與本數都取自 `books` 這個陣列，所以換一份資料、換一個等待時間，程式一個字都不用改。',
    fixed: { html: booksHtml(300, ['島嶼植物圖鑑', '潮汐的故事', '星空觀察手冊']) },
    starter: {
      js: loadingJs(
        '  // 1. 讓 #notice 顯示「載入中…」',
        '  // 2. 等 loadBooks() 交出書名的陣列',
        '  // 3. 用 addBook 把每一本書加進清單',
        '  // 4. 把 #notice 改成「共 N 本書」',
      ),
    },
    solution: {
      js: loadingJs(
        "  notice.textContent = '載入中…';",
        '  const books = await loadBooks();',
        '  for (const title of books) {',
        '    addBook(title);',
        '  }',
        '  notice.textContent = `共 ${books.length} 本書`;',
      ),
    },
    steps: [
      { check: 'text', selector: '#notice', text: '載入中…', label: '資料回來之前，`#notice` 顯示「載入中…」' },
      { check: 'count', selector: '#books li', count: 0, label: '資料回來之前，清單是空的' },
      { do: 'wait', ms: 300 },
      { check: 'count', selector: '#books li', count: 3, label: '300 毫秒後，清單有三本書' },
      { check: 'text', selector: '#books li:first-child', text: '島嶼植物圖鑑', label: '第一項是陣列的第一本書「島嶼植物圖鑑」' },
      { check: 'text', selector: '#books li:last-child', text: '星空觀察手冊', label: '最後一項是陣列的最後一本書「星空觀察手冊」' },
      { check: 'text', selector: '#notice', text: '共 3 本書', label: '載入完成後，`#notice` 變成「共 3 本書」' },
    ],
    mistakes: [
      {
        files: {
          js: loadingJs(
            "  notice.textContent = '載入中…';",
            '  const books = loadBooks();',
            '  for (const title of books) {',
            '    addBook(title);',
            '  }',
            '  notice.textContent = `共 ${books.length} 本書`;',
          ),
        },
        why: '少了 `await`，`books` 是一個 Promise 而不是陣列，拿它跑 `for…of` 時主控台出現 TypeError，函式就此中斷：清單一直是空的，頁面永遠停在「載入中…」。',
      },
      {
        files: {
          js: loadingJs(
            "  notice.textContent = '載入中…';",
            '  const books = await loadBooks();',
            '  for (const title of books) {',
            '    addBook(title);',
            '  }',
          ),
        },
        why: '清單畫出來了，卻忘了把「載入中…」換掉：資料明明已經到了，頁面還告訴使用者正在載入。載入狀態有開始就要有結束。',
      },
      {
        files: {
          js: loadingJs(
            "  addBook('島嶼植物圖鑑');",
            "  addBook('潮汐的故事');",
            "  addBook('星空觀察手冊');",
            "  notice.textContent = '共 3 本書';",
          ),
        },
        why: '把書名直接寫進程式，完全沒有呼叫 `loadBooks()`：清單在資料「回來」之前就出現了，也從來沒有顯示過「載入中…」；換一份資料，畫面上還是這三本。',
      },
    ],
    variants: [{
      title: '另一份書單，等待時間也不同',
      fixed: { html: booksHtml(500, ['海邊的地質課', '漁港散步地圖']) },
      steps: [
        { do: 'wait', ms: 300 },
        { check: 'count', selector: '#books li', count: 0, label: '這個頁面的資料要 500 毫秒：300 毫秒時清單仍是空的' },
        { check: 'text', selector: '#notice', text: '載入中…', label: '300 毫秒時仍顯示「載入中…」' },
        { do: 'wait', ms: 200 },
        { check: 'count', selector: '#books li', count: 2, label: '500 毫秒後清單有兩本書' },
        { check: 'text', selector: '#books li:first-child', text: '海邊的地質課', label: '第一項是這份資料的第一本書' },
        { check: 'text', selector: '#notice', text: '共 2 本書', label: '`#notice` 是「共 2 本書」' },
      ],
    }],
  },
  {
    id: 'web10-x-error', title: '續借失敗時，要讓使用者知道',
    statement: 'index.html 不能改：`renewBook(code)` 是假的續借函式，回傳一個 Promise，300 毫秒後有結果。成功時交出一個物件（`title` 是書名、`due` 是新的到期日）；不能續借時 Promise 會 rejected，原因是一個 `Error` 物件。現在的 script.js 只處理了成功的情況：失敗時頁面永遠停在「處理中…」，按鈕一直不能按，主控台還有一則未捕捉的錯誤。請修改點擊的監聽器：失敗時讓 `#notice` 顯示「續借失敗：」加上那個錯誤的 `message`；不論成功或失敗，結果出來之後 `#renew` 都要恢復可按。成功時的行為維持原樣。檢查還會在另一個頁面上執行，那裡的書與錯誤訊息都不同，所以訊息不能寫死。',
    hints: [
      '`await` 等到一個 rejected 的 Promise 時會丟出錯誤。把可能失敗的那幾行放進 `try { … }`。',
      '在 `catch (error) { … }` 裡，把 `#notice` 的文字設成「續借失敗：」接上 `error.message`。',
      '`button.disabled = false;` 留在 `try` 的最後一行，失敗時會被跳過。把它移到 `finally { … }` 裡，兩種結果都會執行到。',
    ],
    explanation: '`await renewBook(…)` 遇到 rejected 的 Promise 會在那一行丟出錯誤：`try` 裡剩下的幾行被跳過，直接執行 `catch`，在頁面上顯示 `error.message`，錯誤也就不會變成主控台裡未捕捉的錯誤。恢復按鈕是「不論結果如何都要做」的收尾，放在 `finally` 只需要寫一次。訊息取自錯誤物件，所以拒絕的原因換了，畫面也跟著換。',
    fixed: { html: renewHtml('潮汐的故事', '6 月 20 日', '這本書已被預約，無法續借') },
    starter: { js: renewJs('  const book = await renewBook(code.value);', RENEW_OK.slice(2), '  button.disabled = false;') },
    solution: {
      js: renewJs(
        '  try {',
        '    const book = await renewBook(code.value);',
        RENEW_OK,
        '  } catch (error) {',
        '    notice.textContent = `續借失敗：${error.message}`;',
        '  } finally {',
        '    button.disabled = false;',
        '  }',
      ),
    },
    steps: [
      { do: 'click', selector: '#renew' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '《潮汐的故事》已續借到 6 月 20 日', label: '書碼 B001：300 毫秒後顯示續借成功的訊息（和原本一樣）' },
      { check: 'attr', selector: '#renew', name: 'disabled', match: 'absent', label: '成功之後，按鈕恢復可按' },
      { do: 'input', selector: '#code', value: 'B404' },
      { do: 'click', selector: '#renew' },
      { check: 'text', selector: '#notice', text: '處理中…', label: '改成書碼 B404 再按：結果回來之前顯示「處理中…」' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#notice', text: '續借失敗：這本書已被預約，無法續借', label: '300 毫秒後，`#notice` 顯示「續借失敗：」加上錯誤的訊息' },
      { check: 'attr', selector: '#renew', name: 'disabled', match: 'absent', label: '失敗之後，按鈕也恢復可按' },
    ],
    mistakes: [
      {
        files: {
          js: renewJs(
            '  try {',
            '    const book = await renewBook(code.value);',
            RENEW_OK,
            '    button.disabled = false;',
            '  } catch (error) {',
            '    notice.textContent = `續借失敗：${error.message}`;',
            '  }',
          ),
        },
        why: '錯誤訊息顯示了，但恢復按鈕的那一行留在 `try` 裡：`await` 丟出錯誤時它被跳過，失敗之後按鈕永遠不能再按，使用者連重試都沒辦法。收尾的工作要放在 `finally`。',
      },
      {
        files: {
          js: renewJs(
            '  try {',
            '    renewBook(code.value).then((book) => {',
            '  ' + RENEW_OK,
            '    });',
            '  } catch (error) {',
            '    notice.textContent = `續借失敗：${error.message}`;',
            '  } finally {',
            '    button.disabled = false;',
            '  }',
          ),
        },
        why: '`try` 裡沒有 `await`：`renewBook(…).then(…)` 立刻回傳，`try` 區塊沒有任何錯誤就結束了。300 毫秒後 Promise 才變成 rejected，這時已經沒有 `catch` 在等它：頁面停在「處理中…」，主控台出現未捕捉的錯誤。',
      },
      {
        files: {
          js: renewJs(
            '  try {',
            '    const book = await renewBook(code.value);',
            RENEW_OK,
            '  } catch (error) {',
            "    notice.textContent = '續借失敗：這本書已被預約，無法續借';",
            '  } finally {',
            '    button.disabled = false;',
            '  }',
          ),
        },
        why: '把錯誤訊息整句寫死在程式裡。這個頁面看起來沒問題，但拒絕的原因不只一種（例如已超過續借次數）：不讀 `error.message`，使用者看到的就是錯的原因。',
      },
    ],
    variants: [{
      title: '另一本書，拒絕的原因也不同',
      fixed: { html: renewHtml('星空觀察手冊', '7 月 3 日', '已超過續借次數') },
      steps: [
        { do: 'click', selector: '#renew' },
        { do: 'wait', ms: 300 },
        { check: 'text', selector: '#notice', text: '《星空觀察手冊》已續借到 7 月 3 日', label: '成功的訊息用的是這個頁面的資料' },
        { do: 'input', selector: '#code', value: 'B999' },
        { do: 'click', selector: '#renew' },
        { do: 'wait', ms: 300 },
        { check: 'text', selector: '#notice', text: '續借失敗：已超過續借次數', label: '失敗的訊息是這個頁面的錯誤訊息' },
        { check: 'attr', selector: '#renew', name: 'disabled', match: 'absent', label: '失敗之後按鈕恢復可按' },
      ],
    }],
  },
  {
    id: 'web10-x-parallel', title: '同時載入開放時間與書單',
    statement: 'index.html 不能改：`loadHours()` 與 `loadBooks()` 是兩個假的載入函式，各回傳一個 Promise，各要 300 毫秒。現在的 `start` 一份等完才去要下一份，要 600 毫秒畫面才有內容，而且沒有處理失敗。請改寫 `start`：讓兩份資料同時開始載入，兩份都到齊之後才呼叫寫好的 `render(hours, books)` 並把 `#notice` 清空，使得載入後 300 毫秒畫面就完整；載入期間 `#notice` 顯示「載入中…」。只要有一份失敗，就不要呼叫 `render`（`#hours` 與清單維持空白），並讓 `#notice` 顯示「載入失敗：」加上錯誤的 `message`。檢查還會在另外兩個頁面上執行：一個的資料與等待時間不同，另一個的書單會載入失敗。',
    hints: [
      '連續兩行 `await` 是一份等完才開始下一份。要省時間，得先把兩個函式都呼叫了，讓兩段等待同時進行。',
      '`await Promise.all([loadHours(), loadBooks()])` 會等兩份都到齊，交出一個陣列：第 0 個是開放時間，第 1 個是書單。',
      '把 `await Promise.all(…)`、`render(…)` 與清空 `#notice` 的三行放進 `try`，在 `catch (error)` 裡顯示「載入失敗：」加上 `error.message`。',
    ],
    explanation: '`Promise.all([loadHours(), loadBooks()])` 在同一行裡把兩個函式都呼叫了，兩段 300 毫秒的等待同時進行，所以總共只要 300 毫秒；它交出的陣列照放進去的順序排列，可以直接拆成 `hours` 與 `books`。只要有一個 Promise 是 rejected，`Promise.all` 也跟著 rejected，`await` 丟出錯誤，`render` 那一行被跳過，由 `catch` 顯示訊息：這正好是「到齊才畫、失敗就不畫」。',
    fixed: { html: todayHtml({ ms: 300, value: '09:00–17:00' }, { ms: 300, titles: ['島嶼植物圖鑑', '潮汐的故事'] }) },
    starter: { js: todayJs('  const hours = await loadHours();', '  const books = await loadBooks();', '  render(hours, books);', "  notice.textContent = '';") },
    solution: {
      js: todayJs(
        '  try {',
        '    const [hours, books] = await Promise.all([loadHours(), loadBooks()]);',
        '    render(hours, books);',
        "    notice.textContent = '';",
        '  } catch (error) {',
        '    notice.textContent = `載入失敗：${error.message}`;',
        '  }',
      ),
    },
    steps: [
      { check: 'text', selector: '#notice', text: '載入中…', label: '載入期間，`#notice` 顯示「載入中…」' },
      { check: 'count', selector: '#books li', count: 0, label: '資料到齊之前，清單是空的' },
      { do: 'wait', ms: 300 },
      { check: 'text', selector: '#hours', text: '今天開放 09:00–17:00', label: '載入後 300 毫秒，`#hours` 已經顯示開放時間' },
      { check: 'count', selector: '#books li', count: 2, label: '載入後 300 毫秒，清單也已經有兩本書' },
      { check: 'text', selector: '#notice', text: '', label: '兩份都到齊之後，`#notice` 是空的' },
    ],
    mistakes: [
      {
        files: {
          js: todayJs(
            '  try {',
            '    const hours = await loadHours();',
            '    const books = await loadBooks();',
            '    render(hours, books);',
            "    notice.textContent = '';",
            '  } catch (error) {',
            '    notice.textContent = `載入失敗：${error.message}`;',
            '  }',
          ),
        },
        why: '加上了錯誤處理，但兩份資料仍是一份等完才要下一份：`loadBooks()` 要到 300 毫秒才被呼叫，畫面要 600 毫秒才完整。兩份資料互不相干，應該同時開始載入。',
      },
      {
        files: {
          js: todayJs(
            '  try {',
            '    const [hours, books] = Promise.all([loadHours(), loadBooks()]);',
            '    render(hours, books);',
            "    notice.textContent = '';",
            '  } catch (error) {',
            '    notice.textContent = `載入失敗：${error.message}`;',
            '  }',
          ),
        },
        why: '`Promise.all(…)` 前面少了 `await`：它回傳的是一個 Promise，不是陣列，拆成 `[hours, books]` 時丟出 TypeError，馬上被 `catch` 接住。資料其實沒有失敗，頁面卻一載入就顯示「載入失敗」。',
      },
      {
        files: {
          js: todayJs(
            '  const [hours, books] = await Promise.all([loadHours(), loadBooks()]);',
            '  render(hours, books);',
            "  notice.textContent = '';",
          ),
        },
        why: '兩份資料同時載入了，卻沒有 `try`／`catch`：只要其中一份失敗，`await` 丟出的錯誤沒有人接，頁面永遠停在「載入中…」，使用者不知道出了什麼事。',
      },
    ],
    variants: [
      {
        title: '資料與等待時間都不同的頁面',
        fixed: { html: todayHtml({ ms: 200, value: '10:00–20:00' }, { ms: 400, titles: ['海邊的地質課', '漁港散步地圖', '颱風的名字'] }) },
        steps: [
          { do: 'wait', ms: 400 },
          { check: 'text', selector: '#hours', text: '今天開放 10:00–20:00', label: '較慢的一份要 400 毫秒：400 毫秒時開放時間已顯示' },
          { check: 'count', selector: '#books li', count: 3, label: '400 毫秒時清單有三本書' },
          { check: 'text', selector: '#notice', text: '', label: '`#notice` 是空的' },
        ],
      },
      {
        title: '書單載入失敗的頁面',
        fixed: { html: todayHtml({ ms: 200, value: '09:00–17:00' }, { ms: 300, error: '書單伺服器沒有回應' }) },
        steps: [
          { do: 'wait', ms: 300 },
          { check: 'text', selector: '#notice', text: '載入失敗：書單伺服器沒有回應', label: '`#notice` 顯示「載入失敗：」加上錯誤的訊息' },
          { check: 'text', selector: '#hours', text: '', label: '`#hours` 維持空白' },
          { check: 'count', selector: '#books li', count: 0, label: '清單維持空白' },
        ],
      },
    ],
  },
];

export const WEB10: LessonContent = {
  lessonId: 'WEB10',
  motivation: '查資料、倒數計時、向伺服器要東西，都不是一瞬間做得完的事；頁面卻只有一條執行緒，不能停下來乾等。這一課從事件迴圈怎麼安排工作講起，用 Promise 與 async／await 把「等一下才有結果」的流程寫得像一行一行的普通程式。學完後你能寫出依序與並行的非同步流程，並把載入中、成功與失敗三種狀態都交代給使用者。',
  sections: [
    {
      id: 'web10-why', title: '一條執行緒：為什麼需要非同步',
      blocks: [
        { type: 'p', text: '到目前為止，你寫的指令稿都是同步（synchronous）的：一行做完才做下一行。頁面裡的 JavaScript 只有一條執行緒（thread），同一時間只能做一件事；執行監聽器、處理點擊、把 DOM 的改動畫到螢幕上，也都排在這同一條執行緒上。所以只要有一段程式跑很久，例如一個要算五秒的迴圈，這五秒裡按鈕按了沒反應、畫面不會更新，整個頁面就像當掉一樣。' },
        { type: 'p', text: '偏偏網頁裡很多事本來就得等：倒數計時、向伺服器要資料、等使用者按下按鈕。解法是非同步（asynchronous）：不停在原地等，而是把「等到了之後要做的事」寫成一個函式交給瀏覽器，程式繼續往下執行；時候到了，瀏覽器再回頭呼叫那個函式。這種交出去、稍後才被呼叫的函式叫回呼函式（callback）。WEB09 的 `addEventListener` 就是這樣：登記的時候不執行，事件發生了才執行。' },
        { type: 'p', text: '最簡單的非同步工具是計時器（timer）。`setTimeout(函式, 毫秒)` 請瀏覽器在指定的毫秒數之後呼叫函式一次（1000 毫秒是 1 秒）；`setInterval(函式, 毫秒)` 則是每隔那麼久呼叫一次，直到你取消為止。兩者都會回傳一個編號，把編號交給 `clearTimeout` 或 `clearInterval` 就能取消。下面的頁面模擬一次要等 2.5 秒的查詢，等待期間每秒更新「已經等了幾秒」。' },
        { type: 'example', id: 'web10-later' },
        { type: 'p', text: '先看主控台：頁面一載入，「最後一行執行完了」就出現，比 2.5 秒後的那一行早得多。指令稿從頭執行到尾，並沒有在 `setInterval` 或 `setTimeout` 那裡停下來，那兩行只是把函式交給瀏覽器。`() => { … }` 是箭頭函式（arrow function），一種不必取名字的函式寫法，大括號裡的程式要等到被呼叫時才執行。`const` 宣告的名稱之後不會改指別的東西，`let` 宣告的變數之後還能改，所以會一直加一的 `waited` 用 `let`。再看預覽：數字每秒加一，表示等待期間頁面照常運作；2.5 秒一到，文字換成「查到 3 本書」，`clearInterval(ticker)` 取消了每秒一次的計時器，數字就停在 2。' },
        { type: 'callout', tone: 'warning', title: 'setTimeout 不會讓程式停下來', text: '初學者常把 `setTimeout` 當成「暫停一秒」：先寫 `setTimeout(() => {}, 1000);`，下一行接著寫要做的事，以為那件事會晚一秒才發生。不會：`setTimeout` 登記完立刻回傳，下一行馬上執行。JavaScript 沒有「讓整份程式停在這一行等一秒，之後再往下」的指令。要晚一點才做的事，必須放在回呼函式裡面，或是寫在本課後面會學到的 `await` 之後。' },
      ],
    },
    {
      id: 'web10-loop', title: '事件迴圈：三種工作的先後',
      blocks: [
        { type: 'p', text: '回呼函式到底什麼時候被呼叫？決定這件事的是事件迴圈（event loop），瀏覽器裡一個不斷重複的流程。它管理三樣東西：呼叫堆疊（call stack）記錄正在執行的函式；任務佇列（task queue）排著等待執行的任務（task），例如時間已到的計時器回呼函式、被觸發的事件監聽器；微任務佇列（microtask queue）排著 Promise 的回呼函式（Promise 下一節介紹）。事件迴圈每一圈做的事是固定的：' },
        { type: 'list', ordered: true, items: [
          '從任務佇列取出一件任務來執行，一路執行到呼叫堆疊清空為止，中途不會被別的回呼函式打斷。整份指令稿第一次從頭執行到尾，也算一件任務。',
          '把微任務佇列裡的工作全部做完，包括過程中新排進來的微任務。',
          '如果畫面需要更新，就重畫。',
          '回到第 1 步，取下一件任務；沒有任務就等到有為止。',
        ] },
        { type: 'p', text: '下面四行程式是最經典的測驗。先自己猜主控台的順序，再看結果。' },
        { type: 'example', id: 'web10-order' },
        { type: 'p', text: '結果是 A、D、C、B，不是程式碼由上到下的順序。第 1、4 行是同步的程式，屬於「執行指令稿」這件任務，所以 A、D 最先印出。第 2 行把函式交給計時器，延遲 0 毫秒，時間一到它就進任務佇列排隊。第 3 行的 `Promise.resolve().then(函式)` 可以先讀成「把這個函式排進微任務佇列」。指令稿執行完、呼叫堆疊清空之後，事件迴圈先清空微任務（印出 C），才取下一件任務（印出 B）。所以即使 B 比較早登記、延遲又是 0，還是排在 C 的後面。打開「動手改這個範例」，把第 2、3 行對調再執行：順序不變，因為決定先後的是工作的種類，不是寫的位置。' },
        { type: 'table', head: ['種類', '例子', '什麼時候執行'], rows: [
          ['同步的程式', '指令稿由上到下的每一行、被直接呼叫的函式', '立刻執行，一路做到呼叫堆疊清空，中途不讓別人插隊'],
          ['微任務', '`.then`、`.catch`、`.finally` 的回呼函式；非同步函式在 `await` 之後的部分', '目前這段程式一結束就執行，而且一次全部清空'],
          ['任務', '計時器的回呼函式、點擊等事件的監聽器', '微任務清空之後，一次只取一件；做完又先清微任務，才取下一件'],
        ] },
        { type: 'callout', tone: 'warning', title: '延遲時間是最短的等待，不是保證', text: '`setTimeout(f, 0)` 不是「立刻執行」，而是「盡快排進任務佇列」；`setTimeout(f, 1000)` 的意思也是「至少等 1000 毫秒」，不是「剛好 1000 毫秒」。時間到了之後，回呼函式還得等呼叫堆疊清空、排在前面的工作做完才輪得到它：如果當時有一段同步的程式跑了兩秒，它就跟著晚兩秒。分頁被切到背景時，瀏覽器還會刻意放慢計時器。所以不要用「計時器被呼叫了幾次」來計算精確的時間。' },
      ],
    },
    {
      id: 'web10-promises', title: 'Promise：晚一點才到的值',
      blocks: [
        { type: 'p', text: '只靠回呼函式有兩個麻煩。第一，步驟一多就一層包一層：A 做完才做 B、B 做完才做 C，程式越縮越往右。第二，任何一步出錯，都很難集中在一個地方處理。Promise（承諾）解決這兩件事：它是一個物件，代表「現在還沒有、晚一點才會有的結果」。就像在櫃檯預約一本書時拿到的取書單：書還沒到，但你手上已經有一張可以拿來安排後續的憑證。一個 Promise 一定處在三種狀態之一：' },
        { type: 'table', head: ['狀態', '意思', '取書單的比喻'], rows: [
          ['pending（等待中）', '結果還沒出來', '剛拿到取書單，書還在路上'],
          ['fulfilled（已實現）', '成功了，帶著一個值', '書到了，可以領'],
          ['rejected（已拒絕）', '失敗了，帶著一個原因，通常是 `Error` 物件', '館員通知：這本書調不到'],
        ] },
        { type: 'p', text: '狀態只會從 pending 變成另外兩種之一，而且只變一次：已經 fulfilled 的 Promise 不會再變成 rejected，值也不會再換。Promise 多半是別人給你的：呼叫一個非同步的函式，它回傳 Promise。需要自己用 `new Promise` 建立的場合不多，這一課只用它把計時器包起來：`const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));`。`new Promise` 收一個函式並立刻呼叫它，交給它 `resolve` 與 `reject` 兩個函式：呼叫 `resolve(值)` 讓這個 Promise 變成 fulfilled，呼叫 `reject(原因)` 讓它變成 rejected。所以 `wait(300)` 回傳的 Promise 會在 300 毫秒後 fulfilled。' },
        { type: 'p', text: '拿到 Promise 之後，用三個方法登記回呼函式。`.then(函式)`：fulfilled 時呼叫，函式收到那個值。`.catch(函式)`：rejected 時呼叫，函式收到原因。`.finally(函式)`：不論成功或失敗，最後都呼叫。關鍵是 `.then` 會回傳一個新的 Promise：回呼函式 `return` 的值成為新 Promise 的值；回呼函式裡用 `throw` 丟出錯誤，新的 Promise 就是 rejected。因此可以一個接一個串下去，每一步接手上一步的結果。' },
        { type: 'example', id: 'web10-promise' },
        { type: 'p', text: '按「書架 A」：文字先變成「載入中…」，300 毫秒後變成「書架 A 有 2 本書」。`loadShelf` 裡 `wait(300).then(…)` 的回呼函式 `return` 了一個陣列，這個陣列就是下一個 `.then` 收到的 `books`。再按「書架 Z」：回呼函式用 `throw new Error(…)` 丟出一個錯誤物件，`loadShelf` 回傳的 Promise 變成 rejected，後面的 `.then` 整個被跳過，直接落到最近的 `.catch`；`error.message` 就是建立錯誤時寫在括號裡的那段文字。兩次按下去，主控台都多一行「查詢結束」，那是 `.finally` 的工作。程式裡用反引號包起來的是樣板字串（template literal），其中 `${shelf}` 的位置會換成變數的值。' },
        { type: 'callout', tone: 'warning', title: '串接時忘了 return', text: '`.then((books) => { books.length; })` 的回呼函式有大括號卻沒有寫 `return`，回傳的是 `undefined`，下一個 `.then` 收到的就是 `undefined`。箭頭函式只有在不寫大括號時才會自動回傳運算式的值：`.then((books) => books.length)`。同樣地，如果回呼函式裡又呼叫了一個回傳 Promise 的函式，要把它 `return` 出去，下一步才會等它完成。' },
      ],
    },
    {
      id: 'web10-async', title: 'async／await：把等待寫成一行一行',
      blocks: [
        { type: 'p', text: '用 `.then` 串起來的程式，仍然被切成一個個回呼函式。`async` 與 `await` 是建立在 Promise 上的語法，讓同一件事可以寫成由上到下、一行一行的樣子。這就是 async／await 的用途，規則只有兩條：' },
        { type: 'list', items: [
          '函式前面加上 `async`，它就是非同步函式：呼叫它一定得到一個 Promise。函式 `return` 的值成為這個 Promise 的值；函式裡丟出錯誤，這個 Promise 就是 rejected。',
          '在非同步函式裡，`await` 後面接一個 Promise：函式會暫停在這一行，等 Promise 有了結果再繼續。fulfilled 的話，`await` 這個運算式的值就是那個結果，可以寫成 `const books = await loadBooks();` 直接接住；rejected 的話，`await` 會把原因當成錯誤丟出來。',
        ] },
        { type: 'p', text: '最重要的一點：暫停的只有這個函式，不是整個頁面。下面的頁面裡，`say` 是一個小幫手，把文字加進清單並印到主控台。先猜四則訊息的順序。' },
        { type: 'example', id: 'web10-await' },
        { type: 'p', text: '順序是「開燈」「館員先去泡茶」，500 毫秒後才是「電腦開機完成」「可以借書了」。呼叫 `openLibrary()` 時，函式先同步執行到第一個 `await`，所以「開燈」最先出現。遇到 `await wait(500)`，函式暫停，把一個還在 pending 的 Promise 交還給呼叫它的地方；指令稿繼續往下，印出「館員先去泡茶」。這 500 毫秒裡呼叫堆疊是空的，頁面可以照常處理點擊。時間到了，`wait(500)` 的 Promise 變成 fulfilled，函式剩下的部分被排成微任務接著執行；最後 `return` 的字串讓 `openLibrary()` 回傳的 Promise 變成 fulfilled，`.then` 的回呼函式才收到「可以借書了」。展開 DOM 樹也看得到同一件事：`ol#steps` 底下的 `li` 從兩個變成四個。' },
        { type: 'callout', tone: 'warning', title: '忘了寫 await，拿到的是 Promise', text: '`const books = loadBooks();` 少了 `await`，`books` 就是一個 Promise 物件，不是陣列：`books.length` 是 `undefined`，拿它跑迴圈會讓主控台出現 TypeError，把它放進 `textContent` 則會顯示 `[object Promise]`。畫面上出現這幾個字或 `undefined` 時，先檢查是不是漏了 `await`。另外，在這一課的指令稿裡，`await` 只能寫在 `async` 函式裡面；寫在一般的函式裡是語法錯誤，整份指令稿都不會執行。' },
      ],
    },
    {
      id: 'web10-together', title: '依序等，還是一起等',
      blocks: [
        { type: 'p', text: '圖書館首頁要顯示兩個數字：新書有幾本、閱覽室還有幾個空位。兩個數字各要向伺服器問一次，各花 300 毫秒。最直覺的寫法是連續兩行 `await`：等第一份回來，才去要第二份，一共 600 毫秒。但這兩份資料互不相干，沒有理由排隊。關鍵在於：呼叫函式的那一刻，工作就開始了；`await` 只是「等結果」。所以可以先把兩個函式都呼叫了，讓兩段等待同時進行，再一起等。`Promise.all([…])` 就是用來一起等的：它收一個裝著 Promise 的陣列，回傳一個新的 Promise；全部都 fulfilled 時，它帶著一個陣列 fulfilled，裡面的結果照你放進去的順序排列，和誰先完成無關。' },
        { type: 'example', id: 'web10-parallel' },
        { type: 'p', text: '按「一份一份等」：過了 300 毫秒文字還是「載入中…」，因為 `loadSeats()` 這時才剛被呼叫，要到 600 毫秒才有結果。按「兩份一起等」：`Promise.all([loadBooks(), loadSeats()])` 在同一行裡把兩個函式都呼叫了，300 毫秒後兩份同時到齊，快了一倍。`const [books, seats] = …` 是把陣列的第 0、第 1 個元素分別取名為 `books` 與 `seats` 的寫法。兩種寫法各有適合的場合：' },
        { type: 'table', head: ['寫法', '第二件工作何時開始', '總共等多久', '適合'], rows: [
          ['依序：`await a();` 之後再 `await b();`', '第一件完成之後', '兩段時間相加（300 + 300 = 600 毫秒）', '第二件需要第一件的結果，例如先查到會員，再用會員編號查借閱紀錄'],
          ['並行：`await Promise.all([a(), b()]);`', '和第一件同時', '最慢的那一件（300 毫秒）', '彼此無關的工作，例如首頁上各自獨立的幾塊資料'],
        ] },
        { type: 'callout', tone: 'note', title: 'Promise.all 是全有或全無', text: '只要其中一個 Promise 變成 rejected，`Promise.all` 回傳的 Promise 就立刻跟著 rejected，原因就是那一個的原因；其他已經開始的工作不會被取消，只是結果不再被採用。需要別種等法時，還有 `Promise.allSettled`（等全部結束，不論成敗）、`Promise.race`（採用最先有結果的）與 `Promise.any`（採用最先成功的），這一課不展開。' },
        { type: 'callout', tone: 'tip', title: '並行不是多了一條執行緒', text: 'JavaScript 仍然只有一條執行緒，同一時間只有一個回呼函式在執行。重疊的是「等待」：計時器在數時間、伺服器在準備資料，這些都發生在你的程式之外。所以能省下時間的是等待型的工作；兩段各要計算一秒的同步程式，放進 `Promise.all` 也不會變快。' },
      ],
    },
    {
      id: 'web10-handling', title: '錯誤處理與三種狀態',
      blocks: [
        { type: 'p', text: '非同步的工作比同步的更常失敗：網路斷了、資料不存在、伺服器沒有回應。失敗的結果就是一個 rejected 的 Promise。用 `.then` 串接時，由最後的 `.catch` 接住；用 `await` 時，rejected 的 Promise 會讓 `await` 那一行丟出錯誤，所以用 `try`／`catch`／`finally` 做錯誤處理：' },
        { type: 'table', head: ['區塊', '什麼時候執行', '用來做什麼'], rows: [
          ['`try { … }`', '一定會開始執行；其中一行丟出錯誤，區塊裡剩下的幾行就被跳過', '放可能失敗的步驟，以及只有成功才該做的事'],
          ['`catch (error) { … }`', '只有 `try` 裡丟出錯誤時才執行', '`error` 是被丟出來的東西，通常是 `Error` 物件；用 `error.message` 取得訊息，顯示給使用者'],
          ['`finally { … }`', '不論成功或失敗，最後都執行', '收尾：把按鈕恢復可按、把「載入中」拿掉'],
        ] },
        { type: 'p', text: '畫面也要跟著交代清楚。使用者不會打開主控台，所以每一個非同步流程都該讓人看得到三種狀態：等待時顯示「載入中」，並暫時停用按鈕，免得同一個請求被重複送出；成功時顯示結果；失敗時在頁面上顯示看得懂的訊息。下面的頁面把三種狀態都做了出來。' },
        { type: 'example', id: 'web10-errors' },
        { type: 'p', text: '直接按「查詢」：按鈕先變成不能按，文字是「查詢中…」，300 毫秒後顯示小安的借閱數量，按鈕恢復。把欄位改成 `B777` 再按：`loadMember` 裡的 `throw new Error(…)` 讓它回傳的 Promise 變成 rejected，`await` 那一行把錯誤丟出來，`try` 裡的下一行被跳過，直接進入 `catch`，頁面顯示「查詢失敗：查無借閱證 B777」。不論哪一種結果，`finally` 都把按鈕恢復。`{ name: \'小安\', borrowed: 2 }` 是物件（object），把幾個有名字的值包在一起，用 `member.name` 取出其中一個。注意預覽下方沒有主控台的輸出：錯誤被接住並顯示給使用者，沒有變成未捕捉的錯誤。' },
        { type: 'callout', tone: 'warning', title: '少了 await，try 就接不到錯誤', text: '`try { loadMember(id); } catch (error) { … }` 看起來有保護，其實沒有：少了 `await`，`loadMember(id)` 立刻回傳一個 pending 的 Promise，`try` 區塊沒有任何錯誤就結束了。300 毫秒後 Promise 變成 rejected，卻沒有人處理：主控台出現一則未捕捉的錯誤，頁面永遠停在「查詢中…」。`.then` 的鏈子最後沒有接 `.catch` 也是同樣的下場。原則：每一個 Promise，不是用 `await` 等它（外面有 `try`），就是在鏈子的最後接上 `.catch`。' },
        { type: 'callout', tone: 'note', title: '這一課的資料都是替身', text: '範例與練習的頁面不能連上網路，所以 `loadBooks`、`loadMember` 這些函式都是用計時器做的替身：等幾百毫秒，再交出寫在程式裡的資料或一個錯誤。WEB11 會把它們換成真正向伺服器發出請求的 `fetch`；它同樣回傳 Promise，這一課的 `await`、`Promise.all` 與 `try`／`catch` 都原封不動用得上。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'web10-q1', prompt: '一份指令稿先執行 `setTimeout(showNotice, 100);`，下一行接著是一個要花 2 秒才算完的同步迴圈。`showNotice` 大約在什麼時候被呼叫？',
      options: [
        '100 毫秒後準時被呼叫，迴圈會先暫停讓它執行',
        '大約 2 秒後：迴圈結束、呼叫堆疊清空之後才輪到它',
        '不會被呼叫：時間到了卻輪不到的計時器會作廢',
        '100 毫秒後在另一條執行緒上被呼叫，和迴圈同時進行',
      ],
      answer: 1,
      explanation: '頁面的 JavaScript 只有一條執行緒，正在執行的程式不會被打斷。100 毫秒時計時器的回呼函式只是進任務佇列排隊，要等迴圈跑完、呼叫堆疊清空才被取出，所以大約在 2 秒後執行：延遲是最短的等待時間，不是保證。迴圈不會中途暫停；回呼函式也不會在另一條執行緒上同時執行；時間到了的計時器會一直排著，不會作廢。',
    },
    {
      id: 'web10-q2', prompt: '這段程式執行後，主控台由上到下的順序是什麼？',
      code: { language: 'JavaScript', text: "console.log('借書');\nsetTimeout(() => console.log('還書'), 0);\nPromise.resolve().then(() => console.log('續借'));\nconsole.log('預約');" },
      options: ['借書、還書、續借、預約', '借書、預約、還書、續借', '借書、續借、預約、還書', '借書、預約、續借、還書'],
      answer: 3,
      explanation: '同步的兩行先執行完，所以是「借書」「預約」。接著事件迴圈先清空微任務佇列，Promise 的回呼函式印出「續借」；最後才取出任務佇列裡的計時器回呼函式，印出「還書」。照程式碼由上到下的順序是把計時器與 Promise 當成同步的；把「還書」排在「續借」前面，是以為延遲 0 毫秒的計時器比微任務優先；「續借」也不可能插在同步的「預約」之前。',
    },
    {
      id: 'web10-q3', prompt: '兩個計時器的延遲都是 0。主控台的順序是什麼？',
      code: { language: 'JavaScript', text: "setTimeout(() => {\n  console.log('甲');\n  Promise.resolve().then(() => console.log('乙'));\n}, 0);\nsetTimeout(() => console.log('丙'), 0);" },
      options: ['甲、乙、丙', '甲、丙、乙', '乙、甲、丙', '丙、甲、乙'],
      answer: 0,
      explanation: '兩個計時器的回呼函式是兩件任務，照登記的順序排隊。事件迴圈取出第一件，印出「甲」，並排進一件微任務；這件任務做完之後，要先把微任務清空（印出「乙」），才會取下一件任務（印出「丙」）。「甲、丙、乙」是以為要等所有任務做完才輪到微任務；「乙」在「甲」之前不可能，因為那件微任務是在印出「甲」之後才排進去的；「丙」比較晚登記，也不會跑到最前面。',
    },
    {
      id: 'web10-q4', prompt: '`wait(300)` 回傳一個 300 毫秒後 fulfilled 的 Promise。這一行執行完的當下，關於 `result` 的敘述哪一個正確？',
      code: { language: 'JavaScript', text: 'const result = wait(300).then(() => 5).then((n) => n * 2);' },
      options: [
        '`result` 是數字 10，兩個 `.then` 在這一行就算完了',
        '`result` 是數字 5，300 毫秒後第二個 `.then` 才會把它改成 10',
        '`result` 是一個 Promise，現在是 pending；300 毫秒後它 fulfilled，值是 10',
        '`result` 就是 `wait(300)` 回傳的那個 Promise，值是 `undefined`',
      ],
      answer: 2,
      explanation: '`.then` 一定回傳一個新的 Promise，所以 `result` 是最後一個 `.then` 回傳的 Promise，不是數字。300 毫秒後 `wait(300)` 的 Promise 變成 fulfilled，第一個回呼函式回傳 5，第二個收到 5、回傳 10，`result` 才帶著 10 變成 fulfilled。回呼函式不會在這一行同步執行，所以 `result` 不會直接是 10 或 5；每個 `.then` 都產生另一個 Promise，`result` 也不是 `wait(300)` 回傳的那一個。',
    },
    {
      id: 'web10-q5', prompt: '`wait(100)` 回傳一個 100 毫秒後 fulfilled 的 Promise。主控台的順序是什麼？',
      code: { language: 'JavaScript', text: "async function borrow() {\n  console.log('刷卡');\n  await wait(100);\n  console.log('取書');\n}\nborrow();\nconsole.log('下一位');" },
      options: [
        '刷卡、取書、下一位',
        '下一位、刷卡、取書',
        '刷卡、下一位；「取書」不會印出，因為沒有人 `await borrow()`',
        '刷卡、下一位、取書',
      ],
      answer: 3,
      explanation: '呼叫 `borrow()` 時，函式先同步執行到第一個 `await`，印出「刷卡」；`await` 只暫停 `borrow` 自己，控制權回到呼叫它的地方，所以接著印出「下一位」；100 毫秒後函式繼續，印出「取書」。「刷卡、取書、下一位」是以為 `await` 會讓整份指令稿停下來；非同步函式也不是整個延後才執行，第一個 `await` 之前的部分是立刻執行的；不論有沒有人等它回傳的 Promise，函式都會自己做完。',
    },
    {
      id: 'web10-q6', prompt: '`loadA()`、`loadB()`、`loadC()` 各回傳一個 200 毫秒後 fulfilled 的 Promise，三份資料互不相干。從開始到三份都到齊，下面兩種寫法各大約要多久？',
      code: { language: 'JavaScript', text: '// 寫法一\nconst a = await loadA();\nconst b = await loadB();\nconst c = await loadC();\n\n// 寫法二\nconst [a, b, c] = await Promise.all([loadA(), loadB(), loadC()]);' },
      options: [
        '寫法一約 600 毫秒，寫法二約 200 毫秒',
        '兩種都約 600 毫秒，因為 JavaScript 只有一條執行緒',
        '兩種都約 200 毫秒，因為三個函式本來就會同時開始',
        '寫法一約 200 毫秒，寫法二約 600 毫秒',
      ],
      answer: 0,
      explanation: '寫法一每一行都等前一份回來才呼叫下一個函式，三段等待相加是 600 毫秒。寫法二在同一行裡先把三個函式都呼叫了，三段等待同時進行，`Promise.all` 等到最慢的一份，約 200 毫秒。只有一條執行緒，限制的是同一時間只能執行一段程式，等待本身可以重疊，所以寫法二不需要 600 毫秒；寫法一的 `loadB()` 要到第一個 `await` 結束後才被呼叫，三個函式並沒有同時開始。',
    },
    {
      id: 'web10-q7', prompt: '`loadMember(\'Z999\')` 回傳的 Promise 會在 300 毫秒後 rejected。執行 `show()` 之後，頁面與主控台最後是什麼情況？',
      code: { language: 'JavaScript', text: "async function show() {\n  try {\n    loadMember('Z999');\n    notice.textContent = '查詢完成';\n  } catch (error) {\n    notice.textContent = '查詢失敗';\n  }\n}\nshow();" },
      options: [
        '`notice` 顯示「查詢失敗」，主控台沒有錯誤',
        '`notice` 先顯示「查詢完成」，300 毫秒後被 `catch` 改成「查詢失敗」',
        '`notice` 顯示「查詢完成」，300 毫秒後主控台出現一則未捕捉的錯誤',
        '`notice` 維持空白，因為 `try` 會等裡面所有的 Promise 都結束',
      ],
      answer: 2,
      explanation: '`loadMember(\'Z999\')` 前面沒有 `await`：它立刻回傳一個 pending 的 Promise，下一行照常執行，文字變成「查詢完成」，`try` 區塊沒有任何錯誤就結束了。300 毫秒後 Promise 變成 rejected，這時沒有人處理它，主控台出現未捕捉的錯誤，頁面仍顯示「查詢完成」。`catch` 只接得住 `try` 區塊執行期間丟出的錯誤，所以不會顯示「查詢失敗」，也不會事後回頭執行；`try` 更不會自動等待沒有 `await` 的 Promise。',
    },
    {
      id: 'web10-q8', prompt: '按下「續借」後，監聽器先執行 `button.disabled = true;`，再用 `try` 包住 `await renewBook(code);`。要讓按鈕在成功與失敗之後都恢復可按，`button.disabled = false;` 最適合寫在哪裡？',
      options: [
        '`try` 區塊的最後一行',
        '`finally` 區塊裡',
        '`catch` 區塊裡',
        '`await` 那一行的前面',
      ],
      answer: 1,
      explanation: '`finally` 不論成功或失敗都會執行，收尾的工作寫在這裡一次就夠。寫在 `try` 的最後一行，失敗時 `await` 丟出錯誤，那一行被跳過，按鈕永遠不能再按；寫在 `catch` 裡則只有失敗時才恢復，成功之後反而不能再按；寫在 `await` 之前等於馬上恢復，等待期間按鈕可以被重複按下，停用就失去意義了。',
    },
  ],
  webCode: { examples, exercises },
};
