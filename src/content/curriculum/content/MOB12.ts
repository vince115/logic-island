import type { WebExample, WebExercise, WebStep, WebViewport } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB12 Testing on mobile devices: device mode, emulators and real devices (MOB-3). An analysis lesson taught the way
 * MOB07 is: its reasoning is made explicit with two small models, and every expected value in the pages' checks is
 * computed here from ONE TypeScript copy of each, so the text, the pages' data and the checks cannot drift apart. The
 * tests then prove in Chromium that the reference solutions (written by hand, as a learner would) agree with them.
 *
 * Model 1, "where can this problem be verified" (section 2, the classifier example, exercise 1; first match wins):
 *   1. hardware || assistive  → device    (real hardware, or a screen reader really operated)
 *   2. platform               → emulator  (the platform's real browser and system UI: an emulator or a device)
 *   3. otherwise              → mode      (the browser's device mode: only the viewport or the page's own logic)
 * Model 2, the test matrix (section 4, the matrix example, exercises 2 and 3): a value of a dimension is covered when
 * at least one device of the matrix has it; a matrix is complete when no value of any dimension is uncovered.
 * Both are presented as this course's reasonable models, not as industry standards.
 *
 * Nothing here depends on the learner's own device: the one line that reads `(pointer: coarse)` is shown and never
 * checked; the page with the bug that only the console explains uses a stand-in `device` object, never `navigator`.
 * The device catalogues, the analytics table and the bug reports are made up and labelled as such. No tool menus, no
 * product names for device clouds or frameworks, no market shares, no statement that a named browser or platform
 * lacks a feature.
 */

const lines = (...text: string[]) => text.join('\n');
const PHONE: WebViewport = { width: 360, height: 640 };

// ---- model 1: where a problem can be verified --------------------------------------------------------------------
type Place = 'mode' | 'emulator' | 'device';
interface Issue { title: string; platform: boolean; hardware: boolean; assistive: boolean }

const PLACE_LABELS: Record<Place, string> = { mode: '裝置模式', emulator: '模擬器或真機', device: '真機' };
/** The lesson's rule table: the first rule that matches decides. */
function whereToVerify(issue: Issue): Place {
  if (issue.hardware || issue.assistive) return 'device';
  if (issue.platform) return 'emulator';
  return 'mode';
}
const issue = (title: string, flags: Partial<Omit<Issue, 'title'>> = {}): Issue => ({ title, platform: false, hardware: false, assistive: false, ...flags });

/** The five issues of the classifier page: one per kind of answer, and one that matches two rules. */
const EXAMPLE_ISSUES: Issue[] = [
  issue('360px 寬時，商品卡片的價格被擠出畫面'),
  issue('填地址時，虛擬鍵盤遮住「送出訂單」', { platform: true }),
  issue('在低階手機上捲動菜單，畫面一頓一頓', { hardware: true }),
  issue('開著螢幕閱讀器時，底部面板打開後唸的還是後面的頁面', { assistive: true }),
  issue('舊款手機上，虛擬鍵盤彈出的瞬間畫面卡住', { platform: true, hardware: true }),
];
const ORDER_ISSUES: Issue[] = [
  issue('寬 412px 時，分頁列的第五個項目掉到第二行'),
  issue('手機橫放時，底部操作列被手勢列蓋住', { platform: true }),
  issue('用拇指往左滑刪除時，常常誤觸旁邊的按鈕', { hardware: true }),
  issue('螢幕閱讀器滑到分頁列時，聽不出哪一頁是目前頁面', { assistive: true }),
  issue('低階手機上，虛擬鍵盤一彈出，輸入的字就延遲出現', { platform: true, hardware: true }),
];
const ORDER_NOTES = ['三個旗標都是 `false`', '只有 `platform`', '只有 `hardware`', '只有 `assistive`', '`platform` 與 `hardware` 都是 `true`'];
const ORDER_VARIANT: Issue[] = [
  issue('開著螢幕閱讀器時，虛擬鍵盤一彈出，焦點就跳回頁首', { platform: true, assistive: true }),
  issue('離線時重新整理，畫面一片空白，沒有備用訊息'),
  issue('在行動網路上，菜單的圖片要等很久才出現', { hardware: true }),
  issue('日期欄位在其中一個平台的瀏覽器裡，樣子和設計稿不同', { platform: true }),
  issue('螢幕閱讀器把數量調整鈕唸成一串沒有意義的符號', { assistive: true }),
];

const PAGE_CSS = lines(
  'body { margin: 0; padding: 16px; font-family: sans-serif; line-height: 1.5; }',
  'h1 { margin: 0 0 12px; font-size: 20px; }',
  'h2 { margin: 16px 0 4px; font-size: 16px; }',
  'p { margin: 8px 0; }',
  'button { min-height: 44px; margin: 4px 4px 4px 0; padding: 0 16px; font: inherit; }',
);
const TABLE_CSS = lines(
  PAGE_CSS,
  'table { width: 100%; margin-bottom: 12px; border-collapse: collapse; }',
  'caption { padding: 4px 0; text-align: left; font-weight: bold; }',
  'th, td { padding: 6px 4px; border: 1px solid #b0bec5; text-align: left; font-size: 14px; }',
);

const issueLines = (issues: Issue[]) => issues.map(i => `    { title: '${i.title}',\n      platform: ${i.platform}, hardware: ${i.hardware}, assistive: ${i.assistive} },`).join('\n');

/** The classifier page: the issues are data in index.html, script.js holds only `whereToVerify`, a fixed script draws one row per issue. */
const issuesHtml = (issues: Issue[]) => `<h1>這個問題要去哪裡驗證？</h1>
<table>
  <thead>
    <tr><th scope="col">問題</th><th scope="col">最便宜的驗證地點</th></tr>
  </thead>
  <tbody id="result"></tbody>
</table>
<script>
  const LABELS = { mode: '裝置模式', emulator: '模擬器或真機', device: '真機' };

  // platform：要平台真正的瀏覽器或系統介面才看得到
  // hardware：要真實的硬體才看得到
  // assistive：要實際操作螢幕閱讀器這類輔助技術才看得到
  const issues = [
${issueLines(issues)}
  ];
</script>
<script src="script.js"></script>
<script>
  // 把每個問題交給 whereToVerify，畫成表格的一列
  for (const issue of issues) {
    const row = document.createElement('tr');
    const head = document.createElement('th');
    head.scope = 'row';
    head.textContent = issue.title;
    const cell = document.createElement('td');
    cell.className = 'place';
    cell.textContent = LABELS[whereToVerify(issue)];
    row.append(head, cell);
    document.querySelector('#result').append(row);
  }
</script>`;

const placeChecks = (issues: Issue[], notes?: string[]): WebStep[] => issues.map((i, n): WebStep => ({
  check: 'text', selector: `#result tr:nth-child(${n + 1}) .place`, text: PLACE_LABELS[whereToVerify(i)],
  label: `「${i.title}」${notes ? `（${notes[n]}）` : ''}的驗證地點是「${PLACE_LABELS[whereToVerify(i)]}」`,
}));

const whereJs = (...body: string[]) => lines(
  '// 規則由上往下檢查，第一條符合的就是答案',
  'function whereToVerify(issue) {',
  ...body,
  '}',
);
const WHERE_DEVICE = "  if (issue.hardware || issue.assistive) return 'device';";
const WHERE_EMULATOR = "  if (issue.platform) return 'emulator';";
const WHERE_MODE = "  return 'mode';";

// ---- model 2: the test matrix ------------------------------------------------------------------------------------
interface Dimension { key: string; label: string; values: string[] }
type Device = Record<string, string>;

/** The values of the dimensions that no device of the matrix has, in the dimensions' own order. */
const gapsOf = (matrix: Device[], dimensions: Dimension[]) =>
  dimensions.flatMap(d => d.values.filter(v => !matrix.some(m => m[d.key] === v)).map(v => ({ label: d.label, value: v })));
const valueCount = (dimensions: Dimension[]) => dimensions.reduce((sum, d) => sum + d.values.length, 0);

/** 小島外送's five dimensions: 12 values in all. */
const DIMENSIONS: Dimension[] = [
  { key: 'platform', label: '平台', values: ['Android', 'iOS'] },
  { key: 'size', label: '螢幕尺寸', values: ['小手機', '大手機', '平板'] },
  { key: 'tier', label: '效能', values: ['低階', '高階'] },
  { key: 'os', label: '系統版本', values: ['最新', '舊版'] },
  { key: 'setting', label: '輔助設定', values: ['預設', '放大文字', '螢幕閱讀器'] },
];
const device = (id: string, platform: string, size: string, tier: string, os: string, setting: string): Device => ({ id, platform, size, tier, os, setting });

/** The example's six made-up test devices; 1 and 2 are "the team's own phones". */
const SHELF: Device[] = [
  device('1', 'Android', '大手機', '高階', '最新', '預設'),
  device('2', 'iOS', '大手機', '高階', '最新', '預設'),
  device('3', 'Android', '小手機', '低階', '舊版', '放大文字'),
  device('4', 'iOS', '平板', '高階', '舊版', '螢幕閱讀器'),
  device('5', 'Android', '平板', '低階', '最新', '預設'),
  device('6', 'iOS', '小手機', '高階', '最新', '放大文字'),
];
/**
 * The exercises' eight made-up test devices. No three of them cover all 12 values; ten sets of four do:
 * ABCE ACDE ACDG ACEG ACEH ACFG ACGH AEFH AFGH EFGH (found by trying every set; all ten are run in the writer's probe).
 */
const CATALOGUE: Device[] = [
  device('A', 'Android', '小手機', '低階', '舊版', '預設'),
  device('B', 'Android', '大手機', '高階', '最新', '預設'),
  device('C', 'Android', '平板', '高階', '最新', '放大文字'),
  device('D', 'iOS', '大手機', '高階', '最新', '預設'),
  device('E', 'iOS', '小手機', '高階', '最新', '螢幕閱讀器'),
  device('F', 'iOS', '平板', '高階', '最新', '預設'),
  device('G', 'Android', '大手機', '低階', '最新', '螢幕閱讀器'),
  device('H', 'iOS', '大手機', '高階', '舊版', '放大文字'),
];
const pick = (from: Device[], ids: string[]) => ids.map(id => from.find(d => d.id === id)!);
const missing = (from: Device[], ids: string[]) => gapsOf(pick(from, ids), DIMENSIONS).length;

const dimensionLines = (dimensions: Dimension[]) => dimensions.map(d => `    { key: '${d.key}', label: '${d.label}', values: [${d.values.map(v => `'${v}'`).join(', ')}] },`).join('\n');
const deviceLines = (devices: Device[], dimensions: Dimension[]) => devices.map(m => `    { id: '${m.id}', ${dimensions.map(d => `${d.key}: '${m[d.key]}'`).join(', ')} },`).join('\n');

const MATRIX_CSS = lines(
  PAGE_CSS,
  'fieldset { margin: 0 0 12px; padding: 4px 12px; border: 1px solid #b0bec5; }',
  'label { display: block; padding: 10px 0; font-size: 15px; }',
  '#values { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin: 0; padding: 0; list-style: none; font-size: 15px; }',
  ".covered::before { content: '✓ '; }",
  ".missing::before { content: '✗ '; }",
  '.missing { font-weight: bold; color: #b71c1c; }',
);
const GAPS_CSS = lines(TABLE_CSS, '#gaps { margin: 0; padding-left: 20px; }');

/** The page of exercise 2: the dimensions and the matrix are data, script.js holds `uncovered`, a fixed script draws what it returns. */
const gapsHtml = (dimensions: Dimension[], matrix: Device[]) => `<h1>矩陣還缺什麼？</h1>
<p>矩陣有 <output id="device-count"></output> 支測試機，還有 <output id="gap-count"></output> 個值沒涵蓋</p>
<ul id="gaps"></ul>
<script>
  // 每個維度：key 是測試機資料裡的屬性名稱，values 是要涵蓋的值
  const dimensions = [
${dimensionLines(dimensions)}
  ];

  // 目前的測試矩陣：一個元素是一支測試機
  const matrix = [
${deviceLines(matrix, dimensions)}
  ];
</script>
<script src="script.js"></script>
<script>
  // 把 uncovered 回傳的缺口，依維度與值的順序畫成清單
  const gaps = uncovered(matrix, dimensions);
  document.querySelector('#device-count').textContent = matrix.length;
  document.querySelector('#gap-count').textContent = gaps.length;
  for (const dimension of dimensions) {
    for (const value of dimension.values) {
      if (gaps.some((gap) => gap.key === dimension.key && gap.value === value)) {
        const item = document.createElement('li');
        item.textContent = dimension.label + '：' + value;
        document.querySelector('#gaps').append(item);
      }
    }
  }
</script>`;

/** The checks of exercise 2 for one page: the number of gaps, the length of the list and (when asked) each line of it. */
const gapChecks = (dimensions: Dimension[], matrix: Device[], what: string, each = true): WebStep[] => {
  const gaps = gapsOf(matrix, dimensions);
  return [
    { check: 'text', selector: '#gap-count', text: String(gaps.length), label: `${what}還有 ${gaps.length} 個值沒涵蓋` },
    { check: 'count', selector: '#gaps li', count: gaps.length, label: gaps.length ? `缺口清單有 ${gaps.length} 項：已經涵蓋的值沒有被列進去，也沒有重複` : '缺口清單是空的：沒有把已經涵蓋的值列進去' },
    ...(each ? gaps.map((g, n): WebStep => ({ check: 'text', selector: `#gaps li:nth-child(${n + 1})`, text: `${g.label}：${g.value}`, label: `清單的第 ${n + 1} 項是「${g.label}：${g.value}」` })) : []),
  ];
};

const GAPS_MATRIX = pick(CATALOGUE, ['B', 'D', 'G']);
const FULL_MATRIX = pick(CATALOGUE, ['A', 'C', 'E', 'H']);
/** Another product's dimensions (other names, another number of them) for the variant of exercise 2. */
const LIBRARY_DIMENSIONS: Dimension[] = [
  { key: 'platform', label: '平台', values: ['Android', 'iOS'] },
  { key: 'size', label: '螢幕尺寸', values: ['小手機', '大手機', '平板'] },
  { key: 'network', label: '網路', values: ['Wi-Fi', '行動網路'] },
  { key: 'text', label: '文字大小', values: ['預設', '放大'] },
];
const LIBRARY_MATRIX: Device[] = [
  { id: 'K', platform: 'iOS', size: '平板', network: 'Wi-Fi', text: '預設' },
  { id: 'M', platform: 'iOS', size: '大手機', network: 'Wi-Fi', text: '放大' },
];

const uncoveredJs = (...body: string[]) => lines(
  '// 回傳矩陣還沒涵蓋的值：每個值一個 { key, value } 物件',
  'function uncovered(matrix, dimensions) {',
  '  const gaps = [];',
  '  for (const dimension of dimensions) {',
  ...body,
  '  }',
  '  return gaps;',
  '}',
);

/** The page of exercise 3: the catalogue, the dimensions and `uncovered` are fixed; script.js is only the list of chosen ids. */
const PICK_HTML = `<h1>小島外送的測試矩陣</h1>
<table id="catalogue">
  <caption>測試機清單（虛構）</caption>
  <thead>
    <tr><th scope="col">代號</th><th scope="col">平台</th><th scope="col">螢幕</th><th scope="col">效能</th><th scope="col">系統</th><th scope="col">輔助設定</th></tr>
  </thead>
  <tbody></tbody>
</table>
<table id="matrix">
  <caption>你挑的矩陣</caption>
  <tbody></tbody>
</table>
<p>還有 <output id="gap-count"></output> 個值沒涵蓋</p>
<ul id="gaps"></ul>
<script>
  const dimensions = [
${dimensionLines(DIMENSIONS)}
  ];
  const catalogue = [
${deviceLines(CATALOGUE, DIMENSIONS)}
  ];

  // 矩陣還沒涵蓋的值（上一題完成的函式）
  function uncovered(matrix, dimensions) {
    const gaps = [];
    for (const dimension of dimensions) {
      for (const value of dimension.values) {
        const found = matrix.some((device) => device[dimension.key] === value);
        if (!found) gaps.push({ key: dimension.key, value: value });
      }
    }
    return gaps;
  }
</script>
<script src="script.js"></script>
<script>
  // 在表格裡加一列：代號，再加上每一格的文字
  function addRow(table, id, cells, className) {
    const row = document.querySelector(table + ' tbody').insertRow();
    row.className = className;
    const head = document.createElement('th');
    head.scope = 'row';
    head.textContent = id;
    row.append(head);
    for (const text of cells) row.insertCell().textContent = text;
  }
  const valuesOf = (device) => dimensions.map((dimension) => device[dimension.key]);
  for (const device of catalogue) addRow('#catalogue', device.id, valuesOf(device), '');

  // 依 chosen 的代號，從清單裡找出測試機，組成矩陣
  const matrix = [];
  for (const id of chosen) {
    const device = catalogue.find((item) => item.id === id);
    if (!device) addRow('#matrix', id, ['清單裡沒有這個代號'], 'unknown');
    else if (matrix.includes(device)) addRow('#matrix', id, ['這一支重複了'], 'repeat');
    else {
      matrix.push(device);
      addRow('#matrix', id, valuesOf(device), '');
    }
  }
  const gaps = uncovered(matrix, dimensions);
  document.querySelector('#gap-count').textContent = gaps.length;
  for (const gap of gaps) {
    const item = document.createElement('li');
    item.textContent = dimensions.find((dimension) => dimension.key === gap.key).label + '：' + gap.value;
    document.querySelector('#gaps').append(item);
  }
</script>`;
const chosenJs = (...ids: string[]) => lines(
  '// 挑進測試矩陣的測試機：寫下它們在清單裡的代號，最多四支',
  `const chosen = [${ids.map(id => `'${id}'`).join(', ')}];`,
);
const TEAM = ['B', 'D'];
const PICK_LIMIT = 4;

// ---- bug reports -------------------------------------------------------------------------------------------------
const REPORT_CSS = lines(
  PAGE_CSS,
  '#note { padding: 8px 12px; border-left: 4px solid #b0bec5; }',
  'dt { margin-top: 12px; font-weight: bold; }',
  'dd { margin: 0; min-height: 24px; }',
  'ol { margin: 0; padding-left: 24px; }',
);
const reportHtml = (fields: { device: string; versions: string; steps: string; expected: string; actual: string; attachment: string }) => `<h1>錯誤回報：結帳按鈕沒有反應</h1>
<p id="note">測試人員的原話：「結帳壞了，手機上按了都沒反應，快修！」</p>
<dl id="report">
  <dt>裝置</dt>
  <dd id="device">${fields.device}</dd>
  <dt>系統與瀏覽器版本</dt>
  <dd id="versions">${fields.versions}</dd>
  <dt>重現步驟</dt>
  <dd id="steps">${fields.steps}</dd>
  <dt>預期結果</dt>
  <dd id="expected">${fields.expected}</dd>
  <dt>實際結果</dt>
  <dd id="actual">${fields.actual}</dd>
  <dt>附件</dt>
  <dd id="attachment">${fields.attachment}</dd>
</dl>`;
const STEPS_LIST = `
    <ol>
      <li>打開購物車</li>
      <li>把手機橫放</li>
      <li>點「結帳」</li>
    </ol>
  `;

// ---- examples ----------------------------------------------------------------------------------------------------
const examples: WebExample[] = [
  {
    id: 'mob12-viewport', title: '改變寬度，頁面看到的東西哪些會變',
    description: '頁面讀三樣東西：視窗的寬度、600px 斷點的媒體查詢成不成立，以及主要的指標是不是手指。按預覽上方的寬度按鈕，看哪幾行跟著變。',
    viewport: PHONE, widths: [360, 412, 768],
    files: {
      html: lines(
        '<h1>這個頁面看得到什麼</h1>',
        '<dl>',
        '  <dt>視窗寬度</dt>',
        '  <dd id="width"></dd>',
        '  <dt>菜單的版面</dt>',
        '  <dd id="layout"></dd>',
        '  <dt>主要的指標</dt>',
        '  <dd id="pointer"></dd>',
        '</dl>',
        '<ul id="menu">',
        '  <li>海鮮粥</li>',
        '  <li>炒米粉</li>',
        '  <li>鮮魚湯</li>',
        '  <li>滷肉飯</li>',
        '</ul>',
      ),
      css: lines(
        'body { margin: 0; padding: 16px; font-family: sans-serif; line-height: 1.5; }',
        'h1 { margin: 0 0 12px; font-size: 20px; }',
        'dl { margin: 0 0 12px; }',
        'dt { font-weight: bold; }',
        'dd { margin: 0 0 8px; }',
        '#menu { display: grid; grid-template-columns: 1fr; gap: 8px; margin: 0; padding: 0; list-style: none; }',
        '#menu li { padding: 12px; border: 1px solid #b0bec5; border-radius: 8px; }',
        '',
        '@media (min-width: 600px) {',
        '  #menu { grid-template-columns: 1fr 1fr; }',
        '}',
      ),
      js: lines(
        "const wide = window.matchMedia('(min-width: 600px)');",
        "const coarse = window.matchMedia('(pointer: coarse)');",
        '',
        'function report() {',
        "  document.querySelector('#width').textContent = `${window.innerWidth}px`;",
        "  document.querySelector('#layout').textContent = wide.matches ? '兩欄' : '一欄';",
        "  document.querySelector('#pointer').textContent = coarse.matches ? '手指' : '不是手指（例如滑鼠）';",
        '}',
        '',
        "window.addEventListener('resize', report);",
        'report();',
      ),
    },
    observe: [
      { check: 'text', selector: '#width', text: '360px', label: '預覽是 360px 寬時，頁面讀到的視窗寬度就是 360px' },
      { check: 'text', selector: '#layout', text: '一欄', label: '360px 還不到 600px 的斷點：菜單排成一欄' },
      { do: 'resize', width: 768 },
      { check: 'text', selector: '#width', text: '768px', label: '把寬度改成 768px：頁面讀到的視窗寬度跟著變成 768px' },
      { check: 'text', selector: '#layout', text: '兩欄', label: '過了 600px 的斷點，媒體查詢成立：菜單變成兩欄' },
    ],
  },
  {
    id: 'mob12-classifier', title: '把五個問題交給規則表',
    description: 'index.html 記錄五個問題與它們的旗標；script.js 的 `whereToVerify` 就是這一課的規則表，由上往下，第一條符合的就是答案。',
    viewport: PHONE,
    files: { html: issuesHtml(EXAMPLE_ISSUES), css: TABLE_CSS, js: whereJs(WHERE_DEVICE, WHERE_EMULATOR, WHERE_MODE) },
    observe: [
      { check: 'text', selector: '#result tr:nth-child(1) .place', text: PLACE_LABELS[whereToVerify(EXAMPLE_ISSUES[0])], label: '價格被擠出畫面只和寬度有關，三個旗標都是 `false`，落到第 3 條規則：裝置模式' },
      { check: 'text', selector: '#result tr:nth-child(2) .place', text: PLACE_LABELS[whereToVerify(EXAMPLE_ISSUES[1])], label: '虛擬鍵盤遮住按鈕要有平台的系統介面（`platform`），符合第 2 條規則：模擬器或真機' },
      { check: 'text', selector: '#result tr:nth-child(3) .place', text: PLACE_LABELS[whereToVerify(EXAMPLE_ISSUES[2])], label: '低階手機上的卡頓要有真實的硬體（`hardware`），符合第 1 條規則：真機' },
      { check: 'text', selector: '#result tr:nth-child(4) .place', text: PLACE_LABELS[whereToVerify(EXAMPLE_ISSUES[3])], label: '螢幕閱讀器唸錯地方要實際操作它（`assistive`），符合第 1 條規則：真機' },
      { check: 'text', selector: '#result tr:nth-child(5) .place', text: PLACE_LABELS[whereToVerify(EXAMPLE_ISSUES[4])], label: '最後一個問題同時符合第 1 條與第 2 條，第 1 條在前面，所以是真機' },
    ],
  },
  {
    id: 'mob12-console', title: '按了沒反應，原因只寫在主控台裡',
    description: '按下「加入購物車」，畫面上什麼都沒有改變。頁面本身沒有線索；預覽下方的主控台才看得到指令稿停在哪裡。`device` 是替身物件，不是你的瀏覽器。',
    viewport: PHONE, expectErrors: true,
    files: {
      html: lines(
        '<h1>今日特餐：海鮮粥</h1>',
        '<p>購物車：<output id="count">0</output> 件</p>',
        '<button id="add" type="button">加入購物車</button>',
        '<script>',
        '  // 替身裝置：代替真實程式裡的 navigator。這一支沒有震動功能',
        '  const device = {};',
        '</script>',
      ),
      css: PAGE_CSS,
      js: lines(
        'let count = 0;',
        '',
        "document.querySelector('#add').addEventListener('click', () => {",
        "  console.log('按下了加入購物車');",
        '  device.vibrate(50); // 沒有先偵測就呼叫',
        '  count += 1;',
        "  document.querySelector('#count').textContent = count;",
        '  console.log(`購物車現在有 ${count} 件`);',
        '});',
      ),
    },
    observe: [
      { check: 'text', selector: '#count', text: '0', label: '還沒按之前，購物車是 0 件' },
      { do: 'click', selector: '#add' },
      { check: 'text', selector: '#count', text: '0', label: '按了「加入購物車」之後，畫面沒有任何變化：仍然是 0 件，頁面上看不出原因' },
      { check: 'console', lines: ['按下了加入購物車'], match: 'includes', label: '主控台記下了這次點擊；它的下一行是瀏覽器的錯誤訊息，指令稿就停在那裡，沒有執行到把數量加一的那幾行' },
    ],
  },
  {
    id: 'mob12-matrix', title: '從六支測試機裡挑出矩陣',
    description: '勾選要放進測試矩陣的測試機（清單是虛構的），下面列出五個維度的 12 個值：✓ 是已經有測試機涵蓋，✗ 是還沒有。一開始勾的是團隊成員自己的兩支手機。',
    viewport: PHONE,
    files: {
      html: `<h1>挑出測試矩陣</h1>
<fieldset id="catalogue">
  <legend>測試機清單（虛構）</legend>
</fieldset>
<p>矩陣有 <output id="count"></output> 支，還有 <output id="missing"></output> 個值沒涵蓋</p>
<ul id="values"></ul>
<script>
  const dimensions = [
${dimensionLines(DIMENSIONS)}
  ];
  const catalogue = [
${deviceLines(SHELF, DIMENSIONS)}
  ];
  const team = ['1', '2']; // 團隊成員自己的手機

  // 畫出清單（每支一個核取方塊）與每個維度的每個值
  for (const device of catalogue) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'pick-' + device.id;
    box.checked = team.includes(device.id);
    const values = dimensions.map((dimension) => device[dimension.key]);
    label.append(box, ' ' + device.id + ' 號：' + values.join('・'));
    document.querySelector('#catalogue').append(label);
  }
  for (const dimension of dimensions) {
    for (const value of dimension.values) {
      const item = document.createElement('li');
      item.dataset.key = dimension.key;
      item.dataset.value = value;
      item.textContent = dimension.label + '：' + value;
      document.querySelector('#values').append(item);
    }
  }
</script>`,
      css: MATRIX_CSS,
      js: lines(
        '// 矩陣裡有沒有任何一支測試機，在 key 這個維度上是 value',
        'function covered(matrix, key, value) {',
        '  return matrix.some((device) => device[key] === value);',
        '}',
        '',
        'function update() {',
        "  const matrix = catalogue.filter((device) => document.querySelector('#pick-' + device.id).checked);",
        '  let missing = 0;',
        "  for (const item of document.querySelectorAll('#values li')) {",
        '    const ok = covered(matrix, item.dataset.key, item.dataset.value);',
        "    item.className = ok ? 'covered' : 'missing';",
        '    if (!ok) missing += 1;',
        '  }',
        "  document.querySelector('#count').textContent = matrix.length;",
        "  document.querySelector('#missing').textContent = missing;",
        '}',
        '',
        "document.querySelector('#catalogue').addEventListener('change', update);",
        'update();',
      ),
    },
    observe: [
      { check: 'text', selector: '#missing', text: String(missing(SHELF, ['1', '2'])), label: `只勾團隊自己的 1 號與 2 號（都是高階、最新、預設設定的大手機）：${valueCount(DIMENSIONS)} 個值裡有 ${missing(SHELF, ['1', '2'])} 個沒涵蓋` },
      { do: 'check', selector: '#pick-3', checked: true },
      { check: 'text', selector: '#missing', text: String(missing(SHELF, ['1', '2', '3'])), label: `加上 3 號（小手機、低階、舊版、放大文字）：一次補上四個值，剩下 ${missing(SHELF, ['1', '2', '3'])} 個` },
      { do: 'check', selector: '#pick-4', checked: true },
      { check: 'text', selector: '#missing', text: String(missing(SHELF, ['1', '2', '3', '4'])), label: '再加上 4 號（平板、螢幕閱讀器）：每個值都至少有一支測試機涵蓋' },
      { do: 'check', selector: '#pick-2', checked: false },
      { check: 'text', selector: '#missing', text: String(missing(SHELF, ['1', '3', '4'])), label: '取消勾選 2 號：缺口仍然是 0，它帶來的值其他幾支都有了' },
      { check: 'text', selector: '#count', text: '3', label: `這時矩陣只有 3 支，就涵蓋了全部 ${valueCount(DIMENSIONS)} 個值` },
    ],
  },
  {
    id: 'mob12-report', title: '一份可以重現的錯誤回報',
    description: '第三節那個「加入購物車沒有反應」的問題，寫成六個欄位的回報：每個欄位的名稱是 `dt`，內容是 `dd`，重現步驟用有序清單。裝置與版本都是虛構的。',
    viewport: PHONE,
    files: {
      html: lines(
        '<h1>錯誤回報：加入購物車沒有反應</h1>',
        '<dl id="report">',
        '  <dt>裝置</dt>',
        '  <dd id="device">小島 B2（真機）</dd>',
        '  <dt>系統與瀏覽器版本</dt>',
        '  <dd id="versions">系統 3.8 版，內建瀏覽器 27 版</dd>',
        '  <dt>重現步驟</dt>',
        '  <dd id="steps">',
        '    <ol>',
        '      <li>打開「今日特餐」頁面</li>',
        '      <li>點「加入購物車」</li>',
        '    </ol>',
        '  </dd>',
        '  <dt>預期結果</dt>',
        '  <dd id="expected">購物車的數量從 0 變成 1</dd>',
        '  <dt>實際結果</dt>',
        '  <dd id="actual">畫面沒有任何變化，數量還是 0。每次都發生。</dd>',
        '  <dt>附件</dt>',
        '  <dd id="attachment">螢幕錄影 add-to-cart.mp4；遠端除錯時主控台的截圖 console.png（錯誤指向呼叫 vibrate 的那一行）</dd>',
        '</dl>',
      ),
      css: REPORT_CSS,
    },
    observe: [
      { check: 'count', selector: '#report dt', count: 6, label: '回報有六個欄位：裝置、系統與瀏覽器版本、重現步驟、預期結果、實際結果、附件' },
      { check: 'count', selector: '#report dd:not(:empty)', count: 6, label: '六個欄位都有內容，沒有一格是空的' },
      { check: 'count', selector: '#steps ol > li', count: 2, label: '重現步驟是有序清單，一個動作一項：這個問題只要兩步' },
      { check: 'text', selector: '#device', text: '小島 B2', match: 'includes', label: '「裝置」寫的是機型的名稱，不是「手機」兩個字' },
    ],
  },
];

// ---- exercises ---------------------------------------------------------------------------------------------------
const exercises: WebExercise[] = [
  {
    id: 'mob12-ex-where', title: '修好規則表：先後與漏掉的旗標',
    statement: 'index.html 與 style.css 不能改。index.html 記錄了五個問題與它們的三個旗標，並把每一個問題交給 script.js 的 `whereToVerify(issue)`，把回傳的地點畫成表格。這一課的規則表是：（1）`issue.hardware` 或 `issue.assistive` 是 `true`，回傳 `\'device\'`；（2）`issue.platform` 是 `true`，回傳 `\'emulator\'`；（3）其餘回傳 `\'mode\'`。由上往下，第一條符合的就是答案。現在的 `whereToVerify` 有兩個地方和規則表不一樣，所以有兩個問題被送到了錯的地方。請修改 script.js，讓五個問題的地點都符合規則表。檢查還會換一組問題再執行一次，所以不要針對這一頁的資料補特例。',
    hints: [
      '先看是哪兩列錯了，再對照它們的旗標：一個只有 `assistive` 是 `true`，另一個的 `platform` 與 `hardware` 都是 `true`。',
      '只有 `assistive` 的問題落到了最後的 `return \'mode\'`：現在的函式完全沒有檢查 `assistive`。規則表的第 1 條是「`hardware` 或 `assistive`」，用 `||` 把兩個旗標寫在同一個 `if` 裡。',
      '`platform` 與 `hardware` 都是 `true` 的問題，在 `if (issue.platform)` 那一行就回傳了。把檢查真機的那一個 `if` 移到它前面：函式的第一行要是 `if (issue.hardware || issue.assistive) return \'device\';`。',
    ],
    explanation: '函式由上往下執行，第一個成立的 `if` 就 `return`，所以寫在前面的規則優先。原本的程式有兩個問題。第一，它先檢查 `platform`：一個問題只要和系統介面有關，就被送去模擬器，即使它同時要靠真實的硬體才看得到。「低階手機上，虛擬鍵盤一彈出，輸入的字就延遲出現」在模擬器上不會發生，因為那裡用的是電腦的處理器。第二，它完全沒有檢查 `assistive`：要實際操作螢幕閱讀器才看得到的問題，三條規則都沒接住，落到了裝置模式。參考解答把「`hardware` 或 `assistive`」放在第一行，兩個缺口一起補上。規則的方向是「最嚴格的需求先檢查」：需要真機的問題，不會因為它同時也需要別的東西而被送到比較便宜的地方。',
    viewport: PHONE,
    fixed: { html: issuesHtml(ORDER_ISSUES), css: TABLE_CSS },
    starter: { js: whereJs(WHERE_EMULATOR, "  if (issue.hardware) return 'device';", WHERE_MODE) },
    solution: { js: whereJs(WHERE_DEVICE, WHERE_EMULATOR, WHERE_MODE) },
    steps: [
      { check: 'count', selector: '#result tr', count: 5, label: '表格有五列：每個問題一列（`whereToVerify` 沒有丟出錯誤）' },
      ...placeChecks(ORDER_ISSUES, ORDER_NOTES),
    ],
    mistakes: [
      {
        files: { js: whereJs("  if (issue.hardware) return 'device';", WHERE_EMULATOR, WHERE_MODE) },
        why: '只調了順序，沒有補上 `assistive`。同時有 `platform` 與 `hardware` 的問題對了，但「螢幕閱讀器滑到分頁列時，聽不出哪一頁是目前頁面」的三個旗標裡只有 `assistive` 是 `true`，函式沒有任何一行檢查它，仍然被送到裝置模式：在那裡根本沒有螢幕閱讀器在唸。',
      },
      {
        files: { js: whereJs(WHERE_EMULATOR, WHERE_DEVICE, WHERE_MODE) },
        why: '補上了 `assistive`，順序卻沒有動：`if (issue.platform)` 仍然在最前面。同時要系統介面與真實硬體的問題，在第一行就回傳 `\'emulator\'`，檢查真機的那一行永遠輪不到它。寫在前面的規則優先，所以需求最嚴格的那一條要放在最上面。',
      },
      {
        files: { js: whereJs("  if (issue.hardware && issue.assistive) return 'device';", WHERE_EMULATOR, WHERE_MODE) },
        why: '把「或」寫成了 `&&`：要兩個旗標同時成立才算需要真機。這一頁沒有任何問題同時是 `hardware` 與 `assistive`，所以沒有一個被送到真機；「用拇指往左滑刪除時，常常誤觸旁邊的按鈕」只有 `hardware`，卻落到了裝置模式。兩個旗標只要有一個成立，就要真機，要用 `||`。',
      },
    ],
    variants: [{
      title: '另一組問題',
      fixed: { html: issuesHtml(ORDER_VARIANT) },
      steps: placeChecks(ORDER_VARIANT),
    }],
  },
  {
    id: 'mob12-ex-uncovered', title: '列出矩陣還沒涵蓋的值',
    statement: 'index.html 與 style.css 不能改。index.html 定義了 `dimensions`（每個維度有 `key`、`label` 與要涵蓋的 `values`）與 `matrix`（目前的測試矩陣：一個元素是一支測試機，它在每個維度上的值，存在以那個維度的 `key` 命名的屬性裡，例如 `key` 是 `size` 的維度對應 `device.size`），並把兩者交給 script.js 的 `uncovered(matrix, dimensions)`，把回傳的缺口畫成清單。請完成 `uncovered`：回傳一個陣列，矩陣裡沒有任何一支測試機涵蓋的值，各用一個物件 `{ key, value }` 表示，`key` 是維度的 `key`，`value` 是那個值。已經有測試機涵蓋的值不能出現在陣列裡，同一個值也不要重複。陣列裡的順序不拘，頁面會自己排。檢查還會在另外三個頁面上執行：另一個產品的維度（名稱與數量都不同）、一份沒有缺口的矩陣，以及一份還沒有任何測試機的矩陣，所以維度的名稱不能寫死在函式裡。',
    hints: [
      '兩層迴圈：外層已經寫好，走過每個維度；內層要走過這個維度的每個值（`dimension.values`）。對每個值問一個問題：矩陣裡有沒有任何一支測試機是這個值？',
      '「有沒有任何一個」是陣列的 `some`：`matrix.some((device) => device[dimension.key] === value)`。維度的名稱放在變數裡，所以要用中括號 `device[dimension.key]`，不是 `device.key`。',
      '`some` 的結果是 `false` 時，把 `{ key: dimension.key, value: value }` 用 `push` 放進 `gaps`。不要在找到第一個缺口時就離開迴圈：同一個維度可能缺不只一個值。',
    ],
    explanation: '`uncovered` 把測試矩陣的規則「每個維度的每一個值，至少要有一支裝置涵蓋」反過來問：哪些值連一支都沒有？參考解答用兩層迴圈走過每個維度的每個值，再用 `some` 問矩陣裡有沒有任何一支測試機在這個維度上是這個值；沒有，就記下來。`device[dimension.key]` 的中括號是關鍵：維度的名稱是資料，不是寫在程式裡的字，所以換一個產品、換一組維度，同一個函式照樣能用。矩陣是空的時候，`some` 對每個值都回傳 `false`，所有的值都是缺口，不需要另外處理。這一頁的三支測試機都是大手機、都是最新的系統，所以缺口有四個，其中兩個在同一個維度（小手機與平板）：缺口要一個值一個值記，不能只記「螢幕尺寸有缺」。',
    viewport: PHONE,
    fixed: { html: gapsHtml(DIMENSIONS, GAPS_MATRIX), css: GAPS_CSS },
    starter: { js: uncoveredJs('    // 這個維度的每一個值，矩陣裡有沒有測試機涵蓋？') },
    solution: {
      js: uncoveredJs(
        '    for (const value of dimension.values) {',
        '      const found = matrix.some((device) => device[dimension.key] === value);',
        '      if (!found) gaps.push({ key: dimension.key, value: value });',
        '    }',
      ),
    },
    steps: gapChecks(DIMENSIONS, GAPS_MATRIX, 'B、D、G 三支測試機的矩陣'),
    mistakes: [
      {
        files: {
          js: uncoveredJs(
            '    for (const value of dimension.values) {',
            '      const found = matrix.some((device) => device.key === value);',
            '      if (!found) gaps.push({ key: dimension.key, value: value });',
            '    }',
          ),
        },
        why: '寫成了 `device.key`：這是在讀一個真的叫做 `key` 的屬性，測試機的資料裡沒有它，讀到的永遠是 `undefined`，所以每一個值都被當成缺口。維度的名稱放在變數 `dimension.key` 裡，要用中括號 `device[dimension.key]` 才會讀到 `device.size`、`device.os` 這些屬性。',
      },
      {
        files: {
          js: uncoveredJs(
            '    for (const value of dimension.values) {',
            '      const found = matrix[0][dimension.key] === value;',
            '      if (!found) gaps.push({ key: dimension.key, value: value });',
            '    }',
          ),
        },
        why: '只看了矩陣的第一支測試機。一個值只要有任何一支涵蓋就算數，所以要問的是整個矩陣（`some`），不是 `matrix[0]`：其他測試機帶來的 iOS、低階與螢幕閱讀器都被當成了缺口。矩陣是空的時候，`matrix[0]` 是 `undefined`，這一行還會丟出錯誤。',
      },
      {
        files: {
          js: uncoveredJs(
            '    for (const value of dimension.values) {',
            '      const found = matrix.some((device) => device[dimension.key] === value);',
            '      if (!found) {',
            '        gaps.push({ key: dimension.key, value: value });',
            '        break;',
            '      }',
            '    }',
          ),
        },
        why: '找到一個缺口就用 `break` 離開了內層迴圈，所以每個維度最多只記一個值。這一頁的「螢幕尺寸」缺了小手機與平板兩個值，清單裡卻只有小手機：照這份清單去補裝置，平板仍然沒有人測。',
      },
    ],
    variants: [
      {
        title: '另一個產品的維度',
        fixed: { html: gapsHtml(LIBRARY_DIMENSIONS, LIBRARY_MATRIX) },
        steps: gapChecks(LIBRARY_DIMENSIONS, LIBRARY_MATRIX, '島嶼圖書館的矩陣'),
      },
      {
        title: '沒有缺口的矩陣',
        fixed: { html: gapsHtml(DIMENSIONS, FULL_MATRIX) },
        steps: gapChecks(DIMENSIONS, FULL_MATRIX, '這份矩陣'),
      },
      {
        title: '還沒有任何測試機的矩陣',
        fixed: { html: gapsHtml(DIMENSIONS, []) },
        steps: gapChecks(DIMENSIONS, [], '空的矩陣', false),
      },
    ],
  },
  {
    id: 'mob12-ex-pick', title: '最多四支，涵蓋每一個值',
    statement: 'index.html 與 style.css 不能改。index.html 有小島外送的五個維度（共 ' + valueCount(DIMENSIONS) + ' 個值）、一份八支測試機的清單（虛構，代號 A 到 H）與上一題的 `uncovered`。script.js 只有一個陣列 `chosen`：你挑進測試矩陣的代號。現在挑的是團隊成員自己的兩支手機 B 與 D，還有 ' + missing(CATALOGUE, TEAM) + ' 個值沒涵蓋。請修改 `chosen`，挑出最多四支測試機，讓每個維度的每一個值都至少被一支涵蓋：頁面上的缺口數要是 0。代號要用清單裡的寫法（大寫），同一支不要列兩次。答案不只一種，檢查看的是結果：最多四列、每一列都是清單裡的測試機、沒有重複、沒有缺口。這一題的答案就是你挑的名單，所以沒有換資料的隱藏檢查。',
    hints: [
      '先看頁面下方的缺口清單有哪些值，再回清單找：哪幾支測試機有這些值？只有少數幾支才有的值最要緊，例如「低階」與「舊版」各只有兩支。',
      'A 同時是低階與舊版，而且是小手機：先把它放進去。剩下要補的是 iOS、大手機、平板、高階、最新，以及放大文字與螢幕閱讀器這兩種輔助設定。',
      '放大文字只有 C 與 H 有，螢幕閱讀器只有 E 與 G 有：各挑一支，再確認 iOS、大手機與平板都有了。例如 A、C、E、H。',
    ],
    explanation: '參考解答挑了 A、C、E、H。挑的順序是從最稀少的值開始：清單裡低階的只有 A 與 G，舊版的只有 A 與 H，所以 A 一支就補上兩個最難補的值，還帶來小手機。接著是輔助設定：放大文字只有 C 與 H 有，螢幕閱讀器只有 E 與 G 有。C 帶來平板，E 帶來 iOS，H 帶來大手機：四支合起來，' + valueCount(DIMENSIONS) + ' 個值都有了。這不是唯一的答案（例如 A、C、D、G 或 E、F、G、H 也可以），但每一個答案都有相同的特徵：沒有一支是因為「手邊剛好有」而入選的。也注意三支不夠：這份清單裡找不到三支能涵蓋全部的組合，因為稀少的值分散在不同的測試機上。清單不同，需要的數量就不同；做法不變：先列缺口，再找裝置。',
    viewport: PHONE,
    fixed: { html: PICK_HTML, css: GAPS_CSS },
    starter: { js: chosenJs(...TEAM) },
    solution: { js: chosenJs('A', 'C', 'E', 'H') },
    steps: [
      { check: 'count', selector: '#matrix tbody tr', count: PICK_LIMIT, op: 'max', label: '矩陣最多四列：最多挑四支測試機' },
      { check: 'count', selector: '#matrix tbody tr.unknown', count: 0, label: '每一個代號都是清單裡的測試機' },
      { check: 'count', selector: '#matrix tbody tr.repeat', count: 0, label: '同一支測試機沒有重複列出' },
      { check: 'text', selector: '#gap-count', text: '0', label: `五個維度的 ${valueCount(DIMENSIONS)} 個值，每一個都至少有一支測試機涵蓋：缺口數是 0` },
    ],
    mistakes: [
      {
        files: { js: chosenJs('A', 'B', 'C', 'D', 'E') },
        why: '把看起來有用的都放了進來：五支的確涵蓋了全部的值，但上限是四支。矩陣裡的每一支，都是每次發布要多跑一遍冒煙測試的成本。B 與 D 帶來的值，其他幾支都已經有了：拿掉其中任何一支，缺口仍然是 0。',
      },
      {
        files: { js: chosenJs('A', 'C', 'D', 'F') },
        why: '兩個平台、三種螢幕尺寸、低階與舊版都顧到了，卻漏了輔助設定的一個值：四支裡沒有一支開著螢幕閱讀器。維度不只有硬體；「用什麼設定來測」也是矩陣的一欄，而且最容易被忘記。',
      },
      {
        files: { js: chosenJs('a', 'c', 'e', 'h') },
        why: '代號寫成了小寫。清單裡的代號是大寫的 A 到 H，字串比對時大小寫不同就是不同的字，所以四支都找不到，矩陣其實是空的。',
      },
    ],
  },
  {
    id: 'mob12-ex-report', title: '把一句抱怨改寫成可以重現的回報',
    statement: 'style.css 不能改。測試人員傳來一句話：「結帳壞了，手機上按了都沒反應，快修！」你追問之後，得到這些事實：手機是「小島 A1」；系統是 4.2 版，瀏覽器是 31 版；他先打開購物車，再把手機橫放，然後點「結帳」；應該要進入付款頁面，實際上畫面沒有任何變化；每次都會發生；他錄了一段螢幕錄影，檔名是 checkout-landscape.mp4。（機型與版本都是虛構的。）index.html 已經有一份回報的骨架：`<dl id="report">` 裡有六個欄位名稱（`<dt>`），各自的 `<dd>` 還是空的。請把事實填進對應的 `<dd>`，不要改它們的 id，也不要增減 `<dt>` 與 `<dd>`：`#device` 要寫出機型「小島 A1」；`#versions` 要寫出系統與瀏覽器的版本（檢查會找瀏覽器的版本 31）；`#steps` 裡用有序清單 `<ol>` 列出那三個步驟，一步一個 `<li>`；`#expected` 與 `#actual` 分別寫預期與實際的結果；`#attachment` 要寫出錄影的檔名。六個 `<dd>` 都不能是空的。',
    hints: [
      '先把追問到的事實分類：哪一項是裝置、哪一項是版本、哪幾項是步驟、哪一項是預期、哪一項是實際、哪一項是附件？一個欄位只放一種資訊。',
      '步驟有先後順序，用 `<ol>`，每個動作一個 `<li>`：打開購物車、把手機橫放、點「結帳」。把三個動作寫成一句話，讀的人就得自己拆。',
      '`#expected` 寫「進入付款頁面」，`#actual` 寫「畫面沒有任何變化，每次都發生」。兩格都要填：只寫實際的結果，讀的人不知道你認為什麼才是對的。',
    ],
    explanation: '原本那一句話只有情緒，沒有可以照著做的資訊。參考解答把追問到的事實分進六個欄位：機型與版本讓修的人知道要拿哪一支測試機，或開哪一個模擬器；三個步驟一步一項，其中「把手機橫放」是關鍵，少了它，修的人只會直著拿手機試，問題就重現不出來；預期與實際分開寫，並註明每次都發生；附件寫出錄影的檔名。回報寫清楚了，修的人才能用這一課的規則表判斷要去哪裡重現：橫放時的版面在裝置模式就能先看，如果牽涉到安全區域或虛擬鍵盤，就要到模擬器或真機。',
    viewport: PHONE,
    fixed: { css: REPORT_CSS },
    starter: { html: reportHtml({ device: '', versions: '', steps: '', expected: '', actual: '', attachment: '' }) },
    solution: {
      html: reportHtml({
        device: '小島 A1（真機）', versions: '系統 4.2 版，瀏覽器 31 版', steps: STEPS_LIST,
        expected: '進入付款頁面', actual: '畫面沒有任何變化，仍然停在購物車。每次都發生。', attachment: '螢幕錄影 checkout-landscape.mp4',
      }),
    },
    steps: [
      { check: 'count', selector: '#report dt', count: 6, label: '回報仍然有六個欄位名稱' },
      { check: 'count', selector: '#report dd:not(:empty)', count: 6, label: '六個欄位都填了內容，沒有空的 `dd`' },
      { check: 'text', selector: '#device', text: '小島 A1', match: 'includes', label: '「裝置」寫出機型：小島 A1' },
      { check: 'text', selector: '#versions', text: '31', match: 'includes', label: '「系統與瀏覽器版本」寫出瀏覽器的版本 31' },
      { check: 'count', selector: '#steps ol > li', count: 3, op: 'min', label: '「重現步驟」是有序清單，至少三個步驟，一步一項' },
      { check: 'text', selector: '#attachment', text: 'checkout-landscape.mp4', match: 'includes', label: '「附件」寫出錄影的檔名' },
    ],
    mistakes: [
      {
        files: { html: reportHtml({ device: '手機', versions: '應該是最新的', steps: '按結帳就壞了', expected: '要能結帳', actual: '沒反應', attachment: '有錄影' }) },
        why: '六格都填了，內容卻和原本那句話一樣模糊：「手機」不是機型，「應該是最新的」不是版本，「按結帳就壞了」沒有說之前做了什麼，「有錄影」沒有說是哪一個檔案。欄位只是提醒你該寫什麼；寫進去的必須是查得到、照著做得出來的事實。',
      },
      {
        files: {
          html: reportHtml({
            device: '小島 A1', versions: '系統 4.2 版，瀏覽器 31 版', steps: '打開購物車，把手機橫放，再點「結帳」',
            expected: '', actual: '應該進入付款頁面，但是畫面沒有任何變化', attachment: 'checkout-landscape.mp4',
          }),
        },
        why: '事實都對了，但有兩個地方沒有照欄位寫：步驟擠成一句話，沒有用有序清單一步一項；預期的結果併進了「實際結果」，「預期結果」那一格是空的。回報的格式是給讀的人用的：他要能一眼找到「該做哪幾步」與「本來應該怎樣」。',
      },
    ],
  },
];

// ---- the lesson --------------------------------------------------------------------------------------------------
export const MOB12: LessonContent = {
  lessonId: 'MOB12',
  motivation: '「把視窗縮成手機的寬度，看起來沒問題」不等於「在手機上沒問題」。這一課分清楚瀏覽器的裝置模式、模擬器與真機各自驗證得到什麼，學會用遠端除錯查看真機上的頁面，再用一張測試矩陣決定要測哪幾支裝置。學完後你能訂出自己的裝置測試矩陣，並說明哪些問題只有真機才看得到。',
  sections: [
    {
      id: 'mob12-ways-section', title: '三種在手機上看頁面的方法',
      blocks: [
        { type: 'p', text: '這座島的每一課，你都在預覽裡用 360px 的寬度看頁面：預覽上方的寬度按鈕把同一個頁面排成手機的寬度。這個做法有名字，叫裝置模擬（device emulation），瀏覽器開發者工具裡的裝置模式（device mode）做的也是這件事。它很快、很方便，但它不是手機。要回答「這個頁面在手機上有沒有問題」，其實有三種離真相遠近不同的方法。' },
        { type: 'list', items: [
          '瀏覽器的裝置模式：在電腦的瀏覽器裡，把視窗改成手機的大小。常見的還能把滑鼠的操作當成觸控送給頁面，或把網路與處理器調慢（節流，throttling）。改完程式立刻看得到，最適合檢查版面與斷點。但執行頁面的，仍然是電腦上的瀏覽器引擎與電腦的硬體。',
          '模擬器（英文是 emulator 或 simulator，這一課不區分兩者）：在電腦上執行的一支虛擬手機，裡面是那個平台的系統與它真正的瀏覽器。平台的瀏覽器引擎、虛擬鍵盤、瀏海與手勢列造成的安全區域都在。但你是用滑鼠代替手指，處理器與網路是電腦的，感應器的讀數是設定出來的。',
          '真機（real device）：拿在手上的手機。真實的效能、手指按下去的感覺、行動網路、螢幕閱讀器實際唸出來的內容，只有這裡是真的。代價是最慢：要有那支裝置、要把頁面送到它上面，出了問題還看不到主控台（第三節的遠端除錯會解決這一點）。',
        ] },
        { type: 'table', head: ['比較的項目', '裝置模式', '模擬器', '真機'], rows: [
          ['執行頁面的瀏覽器引擎', '電腦上的瀏覽器', '平台真正的瀏覽器', '平台真正的瀏覽器'],
          ['系統介面：虛擬鍵盤、安全區域', '沒有真正的系統介面', '有', '有'],
          ['硬體：處理器、觸控螢幕、感應器、行動網路', '電腦的；節流只是近似', '電腦的；用滑鼠代替手指', '真的'],
          ['速度與成本', '最快，不必準備任何東西', '要安裝，啟動比較慢', '最慢，要有裝置'],
        ] },
        { type: 'p', text: '下面的頁面把「裝置模擬改得了什麼」直接顯示出來。它讀三樣東西：視窗的寬度、600px 這個斷點的媒體查詢成不成立，以及主要的指標是不是手指。' },
        { type: 'example', id: 'mob12-viewport' },
        { type: 'p', text: '按預覽上方的 360、412、768：前兩行跟著變，寬度一過 600px，菜單就從一欄變成兩欄。這就是裝置模擬擅長的事：頁面看到的視窗真的變了，所以和視窗大小有關的一切（媒體查詢、相對單位、換行）都會照著反應。第三行不會因為你按寬度按鈕而改變：它回報的是你現在用的這台裝置，用電腦看通常不是手指，用手機看通常是手指，不管寬度按到哪一個。瀏覽器的裝置模式能模擬的項目比這個預覽多，有的連指標的種類都會改報；但不論模擬了幾項，執行頁面的還是電腦上的引擎與硬體。' },
        { type: 'callout', tone: 'warning', title: '在裝置模式看過，就當成在手機上測過', text: '初學者最常犯的錯，是把視窗縮成 360px 寬、看起來沒問題，就宣布「手機版完成」。裝置模式只證明了版面在那個寬度排得好。虛擬鍵盤彈出來會不會遮住欄位、底部操作列會不會被手勢列蓋住、在慢的手機上捲不捲得動、按鈕用拇指按不按得到，它一樣都沒有驗證。這些要到模擬器與真機上才看得到；下一節把「什麼問題要去哪裡驗證」整理成一張表。' },
      ],
    },
    {
      id: 'mob12-where-section', title: '哪一種問題，在哪裡驗證得到',
      blocks: [
        { type: 'p', text: '三種方法不是誰取代誰。裝置模式最便宜，所以能在那裡發現的問題就在那裡發現；它看不到的，才往模擬器、往真機走。難的是你得知道每一種問題最早在哪裡現形。下表依問題的種類，列出要什麼才看得到它，以及最便宜、又驗證得到的地方。' },
        { type: 'table', head: ['問題的種類', '要什麼才看得到', '最便宜的驗證地點'], rows: [
          ['某個寬度下的版面、斷點有沒有切換', '只要視窗的大小', '裝置模式'],
          ['不同瀏覽器引擎之間的顯示差異', '平台真正的瀏覽器', '模擬器或真機'],
          ['虛擬鍵盤遮住欄位', '平台的系統介面', '模擬器或真機'],
          ['安全區域：內容被瀏海或手勢列蓋住', '平台的系統介面', '模擬器或真機'],
          ['低階手機上的卡頓與掉格', '真實的處理器', '真機'],
          ['觸控目標好不好按、手勢順不順', '真實的手指與觸控螢幕', '真機'],
          ['螢幕閱讀器實際怎麼唸、怎麼操作', '實際操作輔助技術', '真機'],
          ['離線時的行為', '把網路切斷就看得到，和裝置無關', '裝置模式；發布前在真機上再確認一次'],
        ] },
        { type: 'p', text: '表裡有三格值得多說一句。卡頓：裝置模式的節流可以先粗略找出太重的工作（「行動效能與省電」那一課的做法），但電腦調慢之後仍然不是那支手機，結論要回到真機上確認。螢幕閱讀器：名稱與角色這些標記，在電腦上就能先檢查；表裡說的是唸出來的結果與用手勢操作的過程，那要照「行動無障礙：螢幕閱讀器與縮放」的做法在真機上測。離線：快取與備用內容是頁面自己的邏輯，切斷網路就能驗證；真機要確認的是它在時好時壞的真實網路下也成立。' },
        { type: 'p', text: '為了讓這張表可以拿來算，這一課把每個問題記成三個旗標，再把判斷寫成函式 `whereToVerify(issue)`：' },
        { type: 'list', items: [
          '`platform`：要平台真正的瀏覽器或系統介面才看得到，例如引擎的顯示差異、虛擬鍵盤、安全區域。',
          '`hardware`：要真實的硬體才看得到，例如處理器的速度、手指的觸感與手勢、感應器、行動網路。',
          '`assistive`：要實際操作螢幕閱讀器這一類輔助技術才看得到。',
        ] },
        { type: 'p', text: '規則由上往下檢查，第一條符合的就是答案：' },
        { type: 'table', head: ['順序', '條件', '回傳的地點', '理由'], rows: [
          ['1', '`hardware` 或 `assistive` 是 `true`', '`device`：真機', '模擬器用的是電腦的硬體與滑鼠；螢幕閱讀器要用手勢操作、用耳朵聽'],
          ['2', '`platform` 是 `true`', '`emulator`：模擬器或真機', '需要平台真正的瀏覽器與系統介面：虛擬的裝置就有，不必等真機'],
          ['3', '以上都不符合', '`mode`：裝置模式', '只和視窗的大小或頁面自己的邏輯有關'],
        ] },
        { type: 'callout', tone: 'note', title: '這是這門課的規則，不是業界標準', text: '這三條規則是這門課為了把「先去哪裡驗證」講清楚而定的一組合理模型。真實的界線沒有這麼整齊：模擬器做得到的事會隨工具進步而增加，有些顯示差異只在特定的機型上出現，連模擬器也看不到。規則表回答的是「這個問題最早在哪裡現形」，讓你不必每改一行 CSS 就去拿手機，也不會把只有真機看得到的問題留在電腦上猜。' },
        { type: 'p', text: '下面的頁面把五個問題交給 `whereToVerify`。問題與旗標寫在 index.html 的 `issues` 裡，script.js 只有那個函式。' },
        { type: 'example', id: 'mob12-classifier' },
        { type: 'p', text: '對照 `issues` 一列一列看。價格被擠出畫面只和寬度有關，三個旗標都是 `false`，在裝置模式就看得到。虛擬鍵盤遮住按鈕要有真正的鍵盤，`platform` 是 `true`：模擬器或真機。捲動時一頓一頓，是那支手機的處理器跟不上，`hardware` 是 `true`：真機。螢幕閱讀器唸錯了地方，要實際開著它操作才知道，`assistive` 是 `true`：真機。最後一列同時有兩個旗標：鍵盤是系統介面（第 2 條成立），卡住卻是因為機器慢（第 1 條也成立）。第 1 條在前面，所以答案是真機：在模擬器上鍵盤會彈出來，但電腦的處理器不會讓它卡。' },
        { type: 'callout', tone: 'tip', title: '動手試：改一個旗標，再對調兩條規則', text: '按「動手改這個範例」，把第一個問題的 `platform` 改成 `true` 再執行：它從「裝置模式」變成「模擬器或真機」。接著把 script.js 裡兩個 `if` 的順序對調：最後一列變成「模擬器或真機」，其他列不變。先後順序只在兩條規則都符合時才看得出差別，所以檢查規則時，一定要準備同時符合兩條的資料。' },
        { type: 'p', text: '還要記得這張表回答的是「最早在哪裡看得到」，不是「在那裡通過就沒事了」。一個只和寬度有關的版面問題，在裝置模式修好之後，仍然值得在發布前的真機檢查裡看一眼；第四節會談每次發布要在真機上做什麼。' },
      ],
    },
    {
      id: 'mob12-remote-section', title: '遠端除錯：看見真機上的主控台',
      blocks: [
        { type: 'p', text: '真機測試（real-device testing）最讓人挫折的時刻是：問題重現了，卻看不出原因。在電腦上，你會打開開發者工具看主控台；手機的螢幕上通常沒有這一套工具，你只看得到「按了沒反應」。下面的頁面就是這種情況。' },
        { type: 'example', id: 'mob12-console' },
        { type: 'p', text: '按「加入購物車」：畫面上什麼都沒變，數量還是 0，頁面本身沒有給任何線索。再看預覽下方的主控台：第一行是程式自己記下的 `按下了加入購物車`，接著是一則錯誤訊息，指出指令稿停在哪一行。原因就在那一行：程式沒有先偵測，就呼叫了這支裝置沒有的 `vibrate`；錯誤一發生，後面把數量加一的程式就不會執行。這裡的 `device` 是替身物件，代替真實程式裡的 `navigator`，所以結果和你用哪一個瀏覽器無關。震動不是每個瀏覽器都提供的功能，真實的程式也會遇到同樣的事。' },
        { type: 'p', text: '在這個預覽裡，主控台就在頁面下方。在一支真的手機上，同一則錯誤訊息一樣會產生，只是你看不到。遠端除錯（remote debugging）就是把它拿回來的方法：把手機和電腦連起來，用電腦上的開發者工具，檢查手機上正在執行的那個頁面。頁面仍然在手機上、用手機的引擎與硬體執行；電腦只負責顯示與操作工具。' },
        { type: 'table', head: ['開發者工具的面板', '在真機上看得到什麼'], rows: [
          ['元素', '手機的引擎實際建出來的 DOM 與算出來的樣式：哪一條規則生效、盒子有多大'],
          ['主控台', '這支手機上發生的錯誤與 `console.log` 的輸出；也能直接輸入運算式，查看頁面當下的狀態'],
          ['網路', '在手機的網路上，每個請求送了沒、多久回來、狀態碼是什麼'],
          ['效能', '用這支手機的處理器錄下來的紀錄，而不是把電腦調慢之後的估計'],
        ] },
        { type: 'p', text: '兩個主要的行動平台都提供這樣的機制，通常也能用在模擬器上。大致的流程是：在手機上開啟給開發者用的設定，把手機和電腦連起來（通常用傳輸線），在手機上同意讓這台電腦檢查，然後在電腦的開發者工具裡找到手機上開著的頁面。每個平台要搭配哪一個桌機瀏覽器、設定叫什麼名字，各不相同，也會隨版本調整；實際操作時照當時的官方文件做，這一課不列步驟。' },
        { type: 'callout', tone: 'warning', title: '在手機上用猜的', text: '看不到主控台的時候，很容易開始猜：改一行、重新整理手機、看有沒有好，再改一行。這樣做不但慢，還常常「修好」了卻不知道為什麼，下次又壞。只要問題能在真機上重現，就先接上遠端除錯，讓錯誤訊息、實際套用的樣式與請求的結果告訴你原因。' },
        { type: 'callout', tone: 'tip', title: '動手試：修好這個頁面', text: '按「動手改這個範例」，把那一行改成先偵測再呼叫：`if (\'vibrate\' in device) device.vibrate(50);`。再執行、再按按鈕：數量變成 1，主控台多了一行 `購物車現在有 1 件`，錯誤訊息不再出現。這就是「原生、跨平台與 PWA」那一課的功能偵測：遠端除錯告訴你錯在哪裡，功能偵測是修法。' },
      ],
    },
    {
      id: 'mob12-matrix-section', title: '測試矩陣：測哪幾支裝置',
      blocks: [
        { type: 'p', text: '知道真機不可少之後，下一個問題是：哪幾支？手機的型號數不清，沒有團隊測得完。測試矩陣（test matrix）是回答這個問題的工具：一張表，每一列是一支要測的裝置（連同測它時用的設定），每一欄是一個會改變頁面行為的維度。' },
        { type: 'table', head: ['維度', '常見的值', '為什麼會改變行為'], rows: [
          ['平台與瀏覽器引擎', 'Android、iOS', '引擎不同，顯示與支援的功能可能不同；系統介面也不同'],
          ['螢幕尺寸', '小手機、大手機、平板', '版面、斷點與拇指搆得到的範圍'],
          ['效能', '低階、高階', '同一段程式在慢的處理器上可能卡頓'],
          ['系統版本', '最新、舊版', '舊版系統上的瀏覽器，可能還沒有比較新的功能'],
          ['輔助設定', '預設、放大文字、螢幕閱讀器', '版面要撐得住放大的文字，操作要能用螢幕閱讀器完成'],
        ] },
        { type: 'p', text: '每個維度該列哪些值，要看你自己的使用者，而不是別人的排行榜。來源是自己網站的分析資料：實際來的人用什麼平台、多大的螢幕、多舊的系統。下表是小島外送上個月的造訪紀錄，數字是為了這一課虛構的。' },
        { type: 'table', head: ['螢幕尺寸', '占造訪的比例（虛構的數字）'], rows: [
          ['小手機', '28%'],
          ['大手機', '61%'],
          ['平板', '11%'],
        ] },
        { type: 'p', text: '三種尺寸都有人在用，所以「螢幕尺寸」這個維度列三個值。如果你的網站幾乎沒有平板的造訪，就可以不列平板；反過來，別人的網站平板再多，也不是你要測平板的理由。多少比例以上才列入，由團隊自己決定，重點是這個決定有自己的資料當依據。' },
        { type: 'p', text: '有了維度與值，矩陣的規則只有一條：每個維度的每一個值，至少要有一支裝置涵蓋。它不要求測完所有的組合：上面五個維度的組合有 2 × 3 × 2 × 2 × 3 = 72 種，但值一共只有 12 個；一支裝置一次涵蓋五個值（每個維度一個），所以幾支挑得好的裝置就夠了。最大的維度有三個值，所以至少要三支。下面的頁面讓你從六支虛構的測試機裡挑。' },
        { type: 'example', id: 'mob12-matrix' },
        { type: 'p', text: '一開始只勾了 1 號與 2 號：團隊成員自己的手機，兩支都是高階、最新、預設設定的大手機。12 個值裡有 6 個沒涵蓋（前面標著 ✗ 的那些）。勾選 3 號：一支小螢幕、低階、舊版、開著放大文字的手機，一次補上四個值，剩下 2 個。再勾 4 號，缺口變成 0。這時取消勾選 2 號：仍然是 0，三支就涵蓋了全部 12 個值。script.js 的 `covered` 只有一行：矩陣裡只要有任何一支測試機在這個維度上是這個值，就算涵蓋。' },
        { type: 'callout', tone: 'warning', title: '拿團隊自己的手機當矩陣', text: '最常見的矩陣是「辦公室裡現有的手機」：通常是比較新、比較貴的機型，系統也更新到最新。這樣的矩陣剛好漏掉最容易出問題的那一群使用者：低階的機器、舊的系統、放大的文字。範例一開始的狀態就是這種矩陣，12 個值漏了一半。先列維度與值，再照缺口去找裝置，順序不要反過來。' },
        { type: 'callout', tone: 'note', title: '每個值至少一次只是起點', text: '「每個值至少一支」是這門課用來起步的規則，它保證沒有一個值完全沒人測。它不保證每一種組合都測過：某個問題如果只出現在「低階而且舊版」的手機上，就要有一支裝置同時是這兩個值才遇得到。對你的產品特別重要、或分析資料裡特別常見的組合，值得在矩陣裡指定一列給它。' },
        { type: 'p', text: '矩陣定好之後，還要決定多久測一次。全部的檢查每次發布都做一遍，很快就沒有人願意做了；常見的分法是兩層。' },
        { type: 'table', head: ['什麼時候做', '做什麼'], rows: [
          ['每次發布', '冒煙測試（smoke test）：在矩陣的每一支裝置上，照固定的腳本走一遍主要任務，例如開啟首頁、把餐點加入購物車、完成結帳'],
          ['定期，或相關的程式有改動時', '完整的檢查：橫放、放大文字、用螢幕閱讀器走一遍、離線、安裝到主畫面'],
        ] },
        { type: 'p', text: '手邊沒有那麼多裝置的時候，有一類服務可以補上：雲端真機服務，透過網路遠端操作機房裡的真實手機。引擎、系統與硬體都是真的，適合補齊矩陣裡缺的平台或舊版系統；但你看到的是傳回來的畫面、用滑鼠操作，手指的觸感與畫面順不順，仍然要把手機拿在手上才判斷得準。' },
      ],
    },
    {
      id: 'mob12-report-section', title: '可以重現的錯誤回報',
      blocks: [
        { type: 'p', text: '測試找到的問題，要有人能修。修的人第一件事是重現它：在自己的環境裡讓同樣的問題再發生一次。一份回報如果只寫「手機上結帳壞了」，修的人不知道是哪一支手機、哪個版本、做了什麼才壞，只能回頭一句一句追問。可以重現的錯誤回報（bug report）把這些事一次寫清楚。' },
        { type: 'table', head: ['欄位', '寫什麼', '不夠的寫法'], rows: [
          ['裝置', '機型的名稱；是真機還是模擬器', '只寫「手機」'],
          ['系統與瀏覽器版本', '作業系統的版本、瀏覽器的名稱與版本', '只寫「最新的」'],
          ['重現步驟', '從哪一頁開始、依序做了什麼，一步一項', '只寫「按了就壞了」'],
          ['預期結果', '照設計應該發生什麼', '完全沒提'],
          ['實際結果', '實際發生了什麼；每次都發生，還是偶爾', '只寫「怪怪的」'],
          ['附件', '截圖或螢幕錄影；做過遠端除錯的話，附上主控台的錯誤訊息', '什麼都沒附'],
        ] },
        { type: 'p', text: '這六個欄位和這一課前面的內容對得上。裝置與版本就是測試矩陣的維度：修的人靠它們判斷該去裝置模式、模擬器還是真機重現。預期與實際分開寫，是因為「壞了」有時只是回報的人和設計的人想的不一樣。附件裡的錯誤訊息，則是遠端除錯的成果。下面是第三節那個「加入購物車沒有反應」的問題，寫成回報的樣子。' },
        { type: 'example', id: 'mob12-report' },
        { type: 'p', text: '這份回報用說明清單寫成：每個欄位的名稱是 `<dt>`，內容是 `<dd>`；重現步驟有先後，所以用有序清單 `<ol>`。真實的團隊多半在問題追蹤系統的表單裡填，欄位是一樣的。讀的人不必問任何問題，就知道要拿哪一支測試機、做哪兩個動作、該看到什麼。' },
        { type: 'callout', tone: 'warning', title: '在我這裡沒問題', text: '收到回報的人最容易犯的錯，是在自己的電腦上試了一下沒事，就回一句「在我這裡沒問題」，把問題關掉。回報寫了裝置與版本，就是在告訴你要去哪裡重現：先用這一課的規則表判斷這個問題在哪裡才看得到，再到那裡照步驟做一遍。在看不到這個問題的地方試再多次，也證明不了它不存在。' },
        { type: 'p', text: '下一課是這座島的綜合專題：做出一個可安裝、可離線的 PWA，並用這一課的矩陣與回報，在真機上驗收、記錄結果。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob12-q1', prompt: '關於瀏覽器開發者工具的裝置模式，哪一個敘述是正確的？',
      options: [
        '它在電腦上執行手機平台真正的瀏覽器，所以引擎之間的顯示差異在這裡就看得到',
        '把處理器調慢之後量到的時間，就是那支手機上實際的效能',
        '它改變的是頁面看到的視窗等條件；執行頁面的仍然是電腦上的瀏覽器引擎與電腦的硬體',
        '只要在裝置模式把每個寬度都看過，就不需要模擬器與真機',
      ],
      answer: 2,
      explanation: '裝置模式做的是裝置模擬：把視窗改成手機的大小，常見的還能模擬觸控與節流，所以適合檢查版面與斷點；但頁面仍然由電腦上的瀏覽器引擎、用電腦的硬體執行。執行平台真正瀏覽器的是模擬器，不是裝置模式。節流只是把電腦調慢的近似，不等於那支手機的處理器。虛擬鍵盤、安全區域、觸控的手感與螢幕閱讀器，裝置模式都沒有驗證，所以它取代不了模擬器與真機。',
    },
    {
      id: 'mob12-q2', prompt: '小島外送每兩週發布一次，測試矩陣有四支裝置。關於每次發布前要做的冒煙測試，哪一個做法最合理？',
      options: [
        '在矩陣的每一支裝置上，照固定的腳本走一遍主要任務（開啟首頁、加入購物車、完成結帳）；橫放、螢幕閱讀器等完整的檢查另外定期做',
        '每次發布都在每一支裝置上，把每一頁、每一種設定全部檢查一遍',
        '只在電腦的裝置模式走一遍主要任務，真機留到使用者回報問題時再拿出來',
        '每次從矩陣裡隨機挑一支裝置，隨意點一點，沒看到問題就發布',
      ],
      answer: 0,
      explanation: '冒煙測試的目的，是用很短的時間確認主要任務在矩陣的每一支裝置上都還走得通，所以要有固定的腳本，而且每一支都跑。每次都做全部的檢查太花時間，很快就沒有人願意做；完整的檢查適合定期、或在相關的程式改動時進行。只用裝置模式，等於沒有測到只有模擬器與真機才看得到的問題。隨機挑一支、隨意點，每次測的東西都不一樣，壞了也不知道是哪一次發布造成的。',
    },
    {
      id: 'mob12-q3', prompt: '依這一課的規則表（由上往下，第一條符合的就是答案），下面的呼叫回傳什麼？',
      code: { language: 'JavaScript', text: '// 低階手機上，虛擬鍵盤一彈出畫面就卡住\nwhereToVerify({\n  platform: true,\n  hardware: true,\n  assistive: false,\n});' },
      options: [
        '`\'emulator\'`：`platform` 是 `true`，模擬器裡就有虛擬鍵盤',
        '`\'mode\'`：`assistive` 是 `false`，表示不需要特別的環境',
        '`\'emulator\'`：兩條規則都符合時，取比較便宜的那個地方',
        '`\'device\'`：`hardware` 是 `true`，第 1 條規則先符合',
      ],
      answer: 3,
      explanation: '第 1 條規則是「`hardware` 或 `assistive` 是 `true`」：`hardware` 是 `true`，函式在這裡就回傳 `\'device\'`。`platform` 也是 `true`，第 2 條的確也符合，但它排在後面；模擬器裡雖然有虛擬鍵盤，用的卻是電腦的處理器，卡頓不會出現。規則表沒有「取便宜的」這回事：便宜的地方只在看得到問題的時候才有用。`assistive` 是 `false` 只表示不必用到輔助技術，另外兩個旗標仍然成立，所以不會是 `\'mode\'`。',
    },
    {
      id: 'mob12-q4', prompt: '使用者回報：在他的手機上按「加入購物車」沒有反應。你在電腦的瀏覽器與裝置模式都試過，一切正常；借到同一款手機之後，問題重現了，但畫面上看不出任何原因。下一步哪一個做法最有效？',
      options: [
        '回到電腦的裝置模式，換更多種寬度再試幾次',
        '用遠端除錯：把手機接上電腦，用電腦的開發者工具查看這支手機上頁面的主控台與網路請求',
        '猜是快取的問題，請使用者清除瀏覽器的資料後再試',
        '既然自己的電腦上重現不出來，就回覆「在我這裡沒問題」並結案',
      ],
      answer: 1,
      explanation: '問題已經能在真機上重現，缺的是原因。遠端除錯讓電腦的開發者工具檢查手機上正在執行的頁面：主控台裡的錯誤訊息、實際套用的樣式與請求的結果，都來自那支手機。裝置模式已經試過而且正常，表示這個問題在那裡看不到，換再多寬度也一樣。沒有任何證據就猜是快取，是把時間花在碰運氣，還麻煩了使用者。自己的電腦上沒事不代表問題不存在：它只是不在你看的那個地方。',
    },
    {
      id: 'mob12-q5', prompt: '某個網站的測試矩陣有三個維度：平台（Android、iOS）、螢幕尺寸（小手機、大手機、平板）、效能（低階、高階）。哪一份矩陣用最少的裝置，讓每個維度的每一個值都至少被涵蓋一次？',
      options: [
        '兩支：Android 大手機高階、iOS 大手機高階',
        '三支：Android 小手機低階、iOS 大手機高階、Android 平板高階',
        '三支：Android 小手機低階、Android 大手機低階、Android 平板高階',
        '六支：Android 與 iOS 各有小手機、大手機、平板，六支都是高階',
      ],
      answer: 1,
      explanation: '正確的那三支分別帶來小手機、大手機與平板，其中有 Android 也有 iOS、有低階也有高階：七個值都至少出現一次；螢幕尺寸有三個值，所以不可能少於三支。兩支高階大手機漏了小手機、平板與低階。三支都是 Android 的那一份，螢幕尺寸與效能都齊了，卻完全沒有 iOS。六支的那一份裝置最多，仍然漏了低階：把平台與尺寸的組合排滿，不等於每個維度的值都涵蓋了。',
    },
    {
      id: 'mob12-q6', prompt: '島嶼圖書館的團隊要決定測試矩陣裡「螢幕尺寸」這個維度該列哪些值。最好的依據是哪一個？',
      options: [
        '網路上找得到的全球裝置排行榜',
        '團隊成員自己口袋裡的手機',
        '今年最新、規格最高的幾款旗艦機',
        '自己網站的分析資料：實際來借書的使用者，用的是多大的螢幕',
      ],
      answer: 3,
      explanation: '測試矩陣要涵蓋的是你自己的使用者，所以依據是自己網站的分析資料。全球的排行榜描述的是別人的使用者：圖書館的讀者也許大量使用平板，也許幾乎沒有，排行榜看不出來。團隊成員的手機通常比較新、比較貴，剛好漏掉低階與舊版的使用者。只測旗艦機同樣偏向高階：在最快的機器上順暢，說明不了慢的機器。',
    },
    {
      id: 'mob12-q7', prompt: '哪一份錯誤回報，讓修的人不必再追問就能重現問題？（機型與版本都是虛構的）',
      options: [
        '裝置：小島 A1；系統 4.2 版、瀏覽器 31 版。步驟：1. 打開購物車 2. 把手機橫放 3. 點「結帳」。預期：進入付款頁面。實際：畫面沒有變化，每次都發生。附件：螢幕錄影',
        '結帳在手機上完全壞掉了，很多人都遇到，請盡快處理！',
        '裝置：小島 A1。實際：點「結帳」沒有反應。附件：一張截圖',
        '步驟：1. 打開購物車 2. 點「結帳」。預期：進入付款頁面。實際：有時候沒有反應。我用的是手機',
      ],
      answer: 0,
      explanation: '完整的那一份有裝置與版本、一步一項的步驟（包含關鍵的「把手機橫放」）、分開寫的預期與實際，還有錄影：修的人知道要拿哪一支裝置、做哪三個動作、該看到什麼。只有情緒的那一份沒有任何可以照著做的資訊。只寫裝置與結果的那一份缺了版本與步驟，不知道做了什麼才壞。有步驟的那一份沒有機型與版本，「我用的是手機」無法判斷該到哪裡重現，「有時候」也沒有說明什麼情況下會發生。',
    },
    {
      id: 'mob12-q8', prompt: '依這一課的表，下面哪一個問題只有在真機上才驗證得到？',
      options: [
        '視窗寬度超過 600px 時，菜單沒有從一欄變成兩欄',
        '手機橫放時，底部操作列沒有避開手勢列',
        '在低階手機上捲動很長的菜單時，畫面明顯掉格',
        '離線時，頁面沒有顯示事先準備的備用訊息',
      ],
      answer: 2,
      explanation: '掉格是那支手機的處理器跟不上：模擬器用的是電腦的處理器，裝置模式的節流也只是近似，所以要在真機上確認。斷點有沒有切換只和視窗寬度有關，裝置模式就看得到。安全區域需要平台的系統介面，模擬器就有，不必等真機。離線的行為是頁面自己的邏輯，切斷網路就能驗證；真機只是發布前再確認一次。',
    },
  ],
  webCode: { examples, exercises },
};
