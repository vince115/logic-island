import type { WebExample, WebExercise, WebViewport } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB04 Pointer Events and touch events (MOB-1). A web-code lesson on the made-up 小島外送: the three event families
 * (Touch Events in text and tables only: no page listens to them), the events and properties of one interaction, what
 * differs between touch and mouse (hover, pointercancel, click for a tap), a drag with a flag, pointer capture, clamping
 * and touch-action, the cancellable drag with a keyboard alternative (role="slider"), and passive listeners.
 * In a check the pointer events are made by the page's harness (the `pointer` action) and pointer capture is modelled
 * there; the lesson says so where it first uses them and teaches capture from the specification's rules: the checks
 * verify the learner's handlers. Passive listeners were verified in headless Chromium before being stated: a listener
 * registered with { passive: true } cannot cancel (defaultPrevented stays false, the box still scrolls on a real wheel);
 * with { passive: false } it can; wheel/touchstart/touchmove listeners on window, document and body are passive by
 * default there (stated as "many browsers", never checked by a page).
 * Out of scope: multi-touch gestures, the Drag and Drop API, touch target sizes (MOB03), forms (MOB05).
 */

const lines = (...text: string[]) => text.join('\n');
const PHONE: WebViewport = { width: 360, height: 640 };

// ---- shared pages -----------------------------------------------------------------------------------------------
/** The slider's style sheet: a track and a 44px knob whose left goes from 0 to (track width − 44). */
const sliderCss = (trackWidth: number, touchAction = true) => lines(
  '#track {',
  '  position: relative;',
  `  width: ${trackWidth}px;`,
  '  height: 44px;',
  '  border-radius: 22px;',
  '  background-color: #dfe6e9;',
  '}',
  '#knob {',
  '  position: absolute;',
  '  left: 0;',
  '  top: 0;',
  '  width: 44px;',
  '  height: 44px;',
  '  border-radius: 50%;',
  '  background-color: #d35400;',
  ...(touchAction ? ['  touch-action: none;'] : []),
  '  user-select: none;',
  '}',
  '#knob:focus-visible {',
  '  outline: 3px solid #2d3436;',
  '  outline-offset: 2px;',
  '}',
);

const PLAIN_SLIDER_HTML = [
  '<h1>白飯份量</h1>',
  '<div id="track">',
  '  <div id="knob"></div>',
  '</div>',
];
const sliderHtml = (max: number, trackStyle = '') => lines(
  '<h1>白飯份量</h1>',
  `<div id="track"${trackStyle}>`,
  '  <div id="knob" role="slider" tabindex="0" aria-label="白飯份量"',
  `    aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="0"></div>`,
  '</div>',
  '<p>白飯：<output id="value">0</output> 公克</p>',
);

const DRAG_HEAD = [
  "const track = document.querySelector('#track');",
  "const knob = document.querySelector('#knob');",
];
const DRAG_STATE = [
  'const max = track.clientWidth - knob.offsetWidth;',
  'let drag = null;',
  '',
];
const DOWN_WITH_CAPTURE = [
  "knob.addEventListener('pointerdown', (event) => {",
  '  drag = { pointerX: event.clientX, knobLeft: knob.offsetLeft };',
  '  knob.setPointerCapture(event.pointerId);',
  '});',
  '',
];
const MOVE_WITH_FLAG = [
  "knob.addEventListener('pointermove', (event) => {",
  '  if (drag === null) {',
  '    return;',
  '  }',
  '  const left = drag.knobLeft + (event.clientX - drag.pointerX);',
  "  knob.style.left = Math.max(0, Math.min(max, left)) + 'px';",
];

/** The complete slider but for its keyboard listener (exercise 4 and the last example). */
const SLIDER_JS = [
  ...DRAG_HEAD,
  "const value = document.querySelector('#value');",
  'const max = track.clientWidth - knob.offsetWidth;',
  'let drag = null;',
  '',
  'const place = (left) => {',
  "  knob.style.left = Math.max(0, Math.min(max, left)) + 'px';",
  '};',
  'const commit = () => {',
  '  value.textContent = knob.offsetLeft;',
  "  knob.setAttribute('aria-valuenow', knob.offsetLeft);",
  '};',
  '',
  "knob.addEventListener('pointerdown', (event) => {",
  '  drag = { pointerX: event.clientX, knobLeft: knob.offsetLeft };',
  '  knob.setPointerCapture(event.pointerId);',
  '});',
  "knob.addEventListener('pointermove', (event) => {",
  '  if (drag !== null) place(drag.knobLeft + (event.clientX - drag.pointerX));',
  '});',
  "knob.addEventListener('pointerup', () => {",
  '  drag = null;',
  '  commit();',
  '});',
  "knob.addEventListener('pointercancel', () => {",
  '  if (drag !== null) place(drag.knobLeft);',
  '  drag = null;',
  '});',
  '',
];
const KEYS_JS = [
  "knob.addEventListener('keydown', (event) => {",
  "  if (event.key === 'ArrowRight') place(knob.offsetLeft + 10);",
  "  else if (event.key === 'ArrowLeft') place(knob.offsetLeft - 10);",
  '  else return;',
  '  commit();',
  '});',
];

const MENU_ITEMS = ['海鮮炒飯', '椒鹽魚排', '蛤蜊湯', '炒空心菜', '芒果冰', '冬瓜茶'].map(dish => `  <li>${dish}</li>`);

// ---- examples ---------------------------------------------------------------------------------------------------
const examples: WebExample[] = [
  {
    id: 'mob04-ex-log', title: '記錄板：一次互動的指標事件',
    description: '虛線框 `#pad` 只登記了指標事件。按下、放開、被取消時，在頁面與主控台寫出事件的類型與屬性；`pointermove` 太頻繁，只依 `buttons` 是不是 0 分成兩種來計數。',
    viewport: PHONE,
    files: {
      html: lines(
        '<h1>指標事件記錄板</h1>',
        '<div id="pad">在這裡按下、移動、放開</div>',
        '<p>最後一個事件：<span id="last">還沒有</span></p>',
        '<p>按著移動 <span id="drags">0</span> 次，沒按著移動 <span id="hovers">0</span> 次</p>',
      ),
      css: lines(
        '#pad {',
        '  height: 120px;',
        '  padding: 12px;',
        '  border: 2px dashed #636e72;',
        '  background-color: #f4f6f7;',
        '}',
      ),
      js: lines(
        "const pad = document.querySelector('#pad');",
        "const last = document.querySelector('#last');",
        "const drags = document.querySelector('#drags');",
        "const hovers = document.querySelector('#hovers');",
        '',
        'const report = (event) => {',
        "  last.textContent = event.type + '：' + event.pointerType;",
        "  console.log(event.type, event.pointerType, 'pointerId', event.pointerId,",
        "    'isPrimary', event.isPrimary, 'buttons', event.buttons);",
        '};',
        "pad.addEventListener('pointerdown', report);",
        "pad.addEventListener('pointerup', report);",
        "pad.addEventListener('pointercancel', report);",
        '',
        "pad.addEventListener('pointermove', (event) => {",
        '  const counter = event.buttons === 0 ? hovers : drags;',
        '  counter.textContent = Number(counter.textContent) + 1;',
        '});',
      ),
    },
    observe: [
      { do: 'pointer', selector: '#pad', type: 'down', pointerType: 'touch' },
      { check: 'text', selector: '#last', text: 'pointerdown：touch', label: '手指按下：`#pad` 收到 `pointerdown`，`pointerType` 是 touch' },
      { do: 'pointer', selector: '#pad', type: 'move', x: 80, y: 60, pointerType: 'touch' },
      { do: 'pointer', selector: '#pad', type: 'move', x: 120, y: 60, pointerType: 'touch' },
      { check: 'text', selector: '#drags', text: '2', label: '手指按著移動兩次：兩次 `pointermove` 的 `buttons` 都不是 0，算在「按著移動」' },
      { do: 'pointer', selector: '#pad', type: 'up', x: 120, y: 60, pointerType: 'touch' },
      { check: 'text', selector: '#last', text: 'pointerup：touch', label: '手指放開：最後一個事件是 `pointerup`' },
      { do: 'pointer', selector: '#pad', type: 'move', x: 40, y: 40 },
      { check: 'text', selector: '#hovers', text: '1', label: '滑鼠沒有按下、只是移動：一樣有 `pointermove`，這時 `buttons` 是 0，算在「沒按著移動」' },
      { do: 'pointer', selector: '#pad', type: 'down' },
      { check: 'text', selector: '#last', text: 'pointerdown：mouse', label: '改用滑鼠按下：同一個監聽器收到 `pointerdown`，`pointerType` 是 mouse' },
    ],
  },
  {
    id: 'mob04-ex-tap', title: '加入購物車：點一下該聽哪個事件',
    description: '按鈕 `#add` 登記了兩個監聽器：`click` 把購物車加一，`pointerdown` 只計算按鈕被指標按下的次數。',
    viewport: PHONE,
    files: {
      html: lines(
        '<h1>小島外送</h1>',
        '<p>海鮮炒飯　120 元</p>',
        '<button id="add" type="button">加入購物車</button>',
        '<p>購物車有 <span id="cart">0</span> 份</p>',
        '<p>按鈕被指標按下 <span id="presses">0</span> 次</p>',
      ),
      css: lines(
        '#add {',
        '  min-height: 44px;',
        '  padding: 0 16px;',
        '  font-size: 16px;',
        '}',
      ),
      js: lines(
        "const add = document.querySelector('#add');",
        "const cart = document.querySelector('#cart');",
        "const presses = document.querySelector('#presses');",
        '',
        "add.addEventListener('click', () => {",
        '  cart.textContent = Number(cart.textContent) + 1;',
        '});',
        '',
        "add.addEventListener('pointerdown', (event) => {",
        '  presses.textContent = Number(presses.textContent) + 1;',
        "  console.log('pointerdown', event.pointerType);",
        '});',
      ),
    },
    observe: [
      { do: 'key', selector: '#add', key: 'Enter' },
      { check: 'text', selector: '#cart', text: '1', label: '焦點在按鈕上按 Enter：`click` 發生，購物車變成 1 份' },
      { check: 'text', selector: '#presses', text: '0', label: '用鍵盤啟動按鈕時沒有任何指標事件：「被指標按下」仍然是 0 次' },
      { do: 'pointer', selector: '#add', type: 'down', pointerType: 'touch' },
      { check: 'text', selector: '#presses', text: '1', label: '手指按下、還沒放開：`pointerdown` 已經發生，「被指標按下」變成 1 次' },
      { check: 'text', selector: '#cart', text: '1', label: '這時 `click` 還沒有發生：購物車仍然是 1 份' },
      { check: 'console', lines: ['pointerdown touch'], label: '主控台只有一行「pointerdown touch」：Enter 那一次沒有留下任何指標事件' },
    ],
  },
  {
    id: 'mob04-ex-drag', title: '白飯份量：按住旋鈕拖曳',
    description: '軌道 `#track` 寬 244px，旋鈕 `#knob` 寬 44px。script.js 用三個指標事件讓旋鈕跟著指標左右移動，並把位置寫在下面；style.css 替旋鈕宣告了 `touch-action: none`。',
    viewport: PHONE,
    files: {
      html: lines(...PLAIN_SLIDER_HTML, '<p>旋鈕的位置：<span id="position">0</span>px</p>'),
      css: sliderCss(244),
      js: lines(
        ...DRAG_HEAD,
        "const position = document.querySelector('#position');",
        ...DRAG_STATE,
        ...DOWN_WITH_CAPTURE,
        ...MOVE_WITH_FLAG,
        '  position.textContent = knob.offsetLeft;',
        '});',
        '',
        "knob.addEventListener('pointerup', () => {",
        '  drag = null;',
        '});',
      ),
    },
    observe: [
      { do: 'pointer', selector: '#knob', type: 'down', pointerType: 'touch' },
      { do: 'pointer', selector: '#track', type: 'move', x: 150, y: 22, pointerType: 'touch' },
      { check: 'box', selector: '#knob', measure: 'left', value: 128, from: '#track', label: '按住旋鈕的中心（離軌道左邊 22px），移到離軌道左邊 150px 的地方：旋鈕的左邊在 128px，也就是起點 0 加上移動的 128' },
      { do: 'pointer', selector: '#track', type: 'move', x: 2000, y: 22, pointerType: 'touch' },
      { check: 'box', selector: '#knob', measure: 'left', value: 200, from: '#track', label: '移到軌道右邊之外很遠的地方：位置被夾在 200px（軌道 244 − 旋鈕 44）' },
      { check: 'text', selector: '#position', text: '200', label: '`#position` 顯示旋鈕目前的位置 200' },
      { do: 'pointer', selector: '#track', type: 'up', x: 2000, y: 22, pointerType: 'touch' },
      { do: 'pointer', selector: '#knob', type: 'move', x: 5, y: 22 },
      { check: 'box', selector: '#knob', measure: 'left', value: 200, from: '#track', label: '放開之後 `drag` 是 `null`：滑鼠再經過旋鈕，旋鈕留在 200px 不動' },
      { check: 'style', selector: '#knob', property: 'touch-action', value: 'none', label: '旋鈕的 `touch-action` 計算後是 `none`' },
    ],
  },
  {
    id: 'mob04-ex-slider', title: '完整的滑桿：可取消，也能用鍵盤',
    description: '同一個滑桿加上三件事：放開時把位置提交到 `#value`、被取消時回到起點、焦點在旋鈕上時用左右方向鍵移動。旋鈕有 `role="slider"` 與 `tabindex="0"`。',
    viewport: PHONE,
    files: {
      html: sliderHtml(200),
      css: sliderCss(244),
      js: lines(...SLIDER_JS, ...KEYS_JS),
    },
    observe: [
      { do: 'pointer', selector: '#knob', type: 'down', pointerType: 'touch' },
      { do: 'pointer', selector: '#track', type: 'move', x: 150, y: 22, pointerType: 'touch' },
      { do: 'pointer', selector: '#track', type: 'cancel', x: 150, y: 22, pointerType: 'touch' },
      { check: 'box', selector: '#knob', measure: 'left', value: 0, from: '#track', label: '拖到 128px 時收到 `pointercancel`：旋鈕回到按下時的位置 0px' },
      { check: 'text', selector: '#value', text: '0', label: '被取消的拖曳沒有提交：`#value` 仍然是 0' },
      { do: 'pointer', selector: '#knob', type: 'down', pointerType: 'touch' },
      { do: 'pointer', selector: '#track', type: 'move', x: 150, y: 22, pointerType: 'touch' },
      { do: 'pointer', selector: '#track', type: 'up', x: 150, y: 22, pointerType: 'touch' },
      { check: 'text', selector: '#value', text: '128', label: '再拖一次並正常放開（`pointerup`）：`#value` 提交為 128' },
      { do: 'key', selector: '#knob', key: 'ArrowRight' },
      { check: 'box', selector: '#knob', measure: 'left', value: 138, from: '#track', label: '焦點在旋鈕上按右方向鍵：旋鈕往右 10px，到 138px' },
      { check: 'attr', selector: '#knob', name: 'aria-valuenow', value: '138', label: '`aria-valuenow` 跟著更新成 138：螢幕閱讀器讀得到新的值' },
    ],
  },
  {
    id: 'mob04-ex-passive', title: '兩份菜單：被動與非被動的監聽器',
    description: '兩份可以捲動的菜單各有一個 `wheel` 監聽器，內容相同：呼叫 `preventDefault()`，再把 `event.defaultPrevented` 寫到頁面上。差別只有登記時的第三個參數。',
    viewport: PHONE,
    files: {
      html: lines(
        '<h1>捲動時的監聽器</h1>',
        '<p>菜單一：<code>passive: true</code></p>',
        '<ul id="smooth" class="menu">',
        ...MENU_ITEMS,
        '</ul>',
        '<p>defaultPrevented：<span id="smooth-result">—</span></p>',
        '<p>菜單二：<code>passive: false</code></p>',
        '<ul id="blocking" class="menu">',
        ...MENU_ITEMS,
        '</ul>',
        '<p>defaultPrevented：<span id="blocking-result">—</span></p>',
      ),
      css: lines(
        '.menu {',
        '  height: 96px;',
        '  margin: 0;',
        '  padding: 0 0 0 28px;',
        '  overflow-y: auto;',
        '  border: 1px solid #b2bec3;',
        '}',
        '.menu li {',
        '  line-height: 32px;',
        '}',
      ),
      js: lines(
        "const smooth = document.querySelector('#smooth');",
        "const blocking = document.querySelector('#blocking');",
        '',
        "smooth.addEventListener('wheel', (event) => {",
        '  event.preventDefault();',
        "  document.querySelector('#smooth-result').textContent = event.defaultPrevented;",
        '}, { passive: true });',
        '',
        "blocking.addEventListener('wheel', (event) => {",
        '  event.preventDefault();',
        "  document.querySelector('#blocking-result').textContent = event.defaultPrevented;",
        '}, { passive: false });',
      ),
    },
    observe: [
      { check: 'text', selector: '#smooth-result', text: '—', label: '還沒有滾輪事件時，菜單一的結果是「—」' },
      { do: 'dispatch', selector: '#smooth', event: 'wheel' },
      { check: 'text', selector: '#smooth-result', text: 'false', label: '菜單一收到 `wheel`：被動監聽器呼叫了 `preventDefault()`，`defaultPrevented` 仍然是 `false`' },
      { do: 'dispatch', selector: '#blocking', event: 'wheel' },
      { check: 'text', selector: '#blocking-result', text: 'true', label: '菜單二收到 `wheel`：非被動的監聽器呼叫 `preventDefault()`，`defaultPrevented` 變成 `true`' },
      { check: 'console', lines: [], label: '頁面自己沒有印出任何東西：在被動監聽器裡呼叫 `preventDefault()` 不會丟出錯誤，程式照常往下執行' },
    ],
  },
];

// ---- exercises --------------------------------------------------------------------------------------------------
const TYPE_HEAD = [
  "const add = document.querySelector('#add');",
  "const device = document.querySelector('#device');",
  '',
];

const CAPTURE_HEAD = [...DRAG_HEAD, ...DRAG_STATE];
const CAPTURE_MOVE = [...MOVE_WITH_FLAG, '});', ''];
const DOWN_NO_CAPTURE = [
  "knob.addEventListener('pointerdown', (event) => {",
  '  drag = { pointerX: event.clientX, knobLeft: knob.offsetLeft };',
];

const CANCEL_HEAD = [
  ...DRAG_HEAD,
  "const value = document.querySelector('#value');",
  ...DRAG_STATE,
  ...DOWN_WITH_CAPTURE,
  ...MOVE_WITH_FLAG,
  '});',
  '',
];
const COMMIT_ON_UP = [
  "knob.addEventListener('pointerup', () => {",
  '  drag = null;',
  '  value.textContent = knob.offsetLeft;',
  '});',
  '',
];
const cancelPage = lines(...PLAIN_SLIDER_HTML, '<p>白飯：<output id="value">0</output> 公克</p>');

/** Exercise 4's style sheet as the learner first sees it, and with the declaration they add. */
const KEYS_CSS_STARTER = sliderCss(244, false).replace('  user-select: none;', '  user-select: none;\n  /* 在這裡替旋鈕宣告 touch-action */');
const KEYS_CSS_DONE = sliderCss(244);

const exercises: WebExercise[] = [
  {
    id: 'mob04-x-type', title: '是手指還是滑鼠按的',
    statement: 'index.html 與 style.css 不能改。小島外送想知道顧客是用什麼按下「加入購物車」的。script.js 已經替按鈕 `#add` 登記了 `pointerdown` 的監聽器，請完成它：把這次按下的指標種類（事件物件上的值，會是 `touch`、`mouse` 或 `pen`）寫進 `#device`。還沒按之前，`#device` 要維持「還沒按」。檢查會依序用模擬的手指、滑鼠、觸控筆在按鈕上按下：送到按鈕的是 `pointerdown`，不是 `click`。',
    hints: [
      '監聽器的參數 `event` 就是這次的事件物件。指標事件比滑鼠事件多了幾個屬性，其中一個說明這支指標是哪一種裝置。',
      '那個屬性叫 `pointerType`，值是字串。不必自己判斷裝置，也不要把字串寫死：直接用它。',
      '大括號裡只需要一行：`device.textContent = event.pointerType;`。',
    ],
    explanation: '三種裝置按下時觸發的都是同一個 `pointerdown`，差別記在事件物件的 `pointerType` 上，所以一個監聽器、一行程式就能分辨。這個值每一次事件都可能不同（同一台筆電可以同時有滑鼠與觸控螢幕），所以要在監聽器裡、事件發生的當下讀，不能在頁面載入時先猜一次「這是手機」。',
    viewport: PHONE,
    fixed: {
      html: lines(
        '<h1>小島外送</h1>',
        '<p>海鮮炒飯　120 元</p>',
        '<button id="add" type="button">加入購物車</button>',
        '<p>按下按鈕的是：<span id="device">還沒按</span></p>',
      ),
      css: lines(
        '#add {',
        '  min-height: 44px;',
        '  padding: 0 16px;',
        '  font-size: 16px;',
        '}',
      ),
    },
    starter: {
      js: lines(
        ...TYPE_HEAD,
        "add.addEventListener('pointerdown', (event) => {",
        '  // 在這裡把這次按下的指標種類寫進 device',
        '});',
      ),
    },
    solution: {
      js: lines(
        ...TYPE_HEAD,
        "add.addEventListener('pointerdown', (event) => {",
        '  device.textContent = event.pointerType;',
        '});',
      ),
    },
    steps: [
      { check: 'text', selector: '#device', text: '還沒按', label: '還沒按下時，`#device` 是「還沒按」' },
      { do: 'pointer', selector: '#add', type: 'down', pointerType: 'touch' },
      { check: 'text', selector: '#device', text: 'touch', label: '用手指按下按鈕，`#device` 是 touch' },
      { do: 'pointer', selector: '#add', type: 'up', pointerType: 'touch' },
      { do: 'pointer', selector: '#add', type: 'down', pointerType: 'mouse' },
      { check: 'text', selector: '#device', text: 'mouse', label: '放開後改用滑鼠按下，`#device` 換成 mouse' },
      { do: 'pointer', selector: '#add', type: 'up', pointerType: 'mouse' },
      { do: 'pointer', selector: '#add', type: 'down', pointerType: 'pen' },
      { check: 'text', selector: '#device', text: 'pen', label: '再改用觸控筆按下，`#device` 換成 pen' },
    ],
    mistakes: [
      {
        files: {
          js: lines(
            ...TYPE_HEAD,
            "add.addEventListener('pointerdown', (event) => {",
            '  device.textContent = event.type;',
            '});',
          ),
        },
        why: '讀成了 `event.type`。`type` 是事件類型的名稱，不管誰按的都是 `pointerdown`；說明裝置種類的是 `event.pointerType`。',
      },
      {
        files: {
          js: lines(
            ...TYPE_HEAD,
            "add.addEventListener('pointerdown', (event) => {",
            "  device.textContent = 'touch';",
            '});',
          ),
        },
        why: '因為「這是手機網站」就把 `touch` 寫死。手機可以接滑鼠，平板有觸控筆，筆電也可能有觸控螢幕：裝置種類要從每一次事件的 `pointerType` 讀，不能假設。',
      },
    ],
  },
  {
    id: 'mob04-x-capture', title: '讓旋鈕抓住指標',
    statement: 'index.html 與 style.css 不能改：軌道 `#track` 寬 244px，旋鈕 `#knob` 寬 44px，所以旋鈕的位置可以從 0 到 200px。script.js 已經會在 `pointerdown` 記下起點、在 `pointermove` 依移動的距離改變旋鈕的位置，但有兩個毛病：指標一離開旋鈕，旋鈕就不再跟著動；放開之後拖曳沒有結束，指標再經過旋鈕，旋鈕又跟著跑。請補上兩件事。（一）在 `pointerdown` 的監聽器裡，讓旋鈕捕捉這支指標：這一題練的就是指標捕捉，請用 `setPointerCapture`。（二）登記 `pointerup` 的監聽器，放開時把 `drag` 設回 `null`。index.html 最下面有一小段固定的指令稿，旋鈕取得或失去捕捉時會更新 `#capture` 那一行，檢查會看它。檢查用模擬的手指與滑鼠操作：按下之後的移動瞄準的是軌道，不是旋鈕。',
    hints: [
      '捕捉要在指標按著的時候做，所以寫在 `pointerdown` 的監聽器裡。由誰捕捉，之後的事件就送給誰：這裡應該是旋鈕。',
      '方法是 `元素.setPointerCapture(指標的編號)`，編號在事件物件的 `pointerId`。放開的事件叫 `pointerup`，登記的方式和另外兩個監聽器一樣。',
      '兩處各一行：`knob.setPointerCapture(event.pointerId);`，以及 `knob.addEventListener(\'pointerup\', () => { drag = null; });`。',
    ],
    explanation: '`knob.setPointerCapture(event.pointerId)` 讓這支指標之後的 `pointermove` 與 `pointerup` 都送到旋鈕，即使指標已經不在旋鈕上：旋鈕的監聽器才能一路收到移動，也一定收得到放開。`pointerup` 把 `drag` 設回 `null`，`pointermove` 開頭的檢查就會擋下之後的移動；放開時捕捉會自動解除，不必自己呼叫 `releasePointerCapture`。檢查裡的捕捉是檢查程式依照規格的規則模擬的，它確認的是你有沒有在對的時機、替對的元素呼叫；真正的效果請在預覽裡用滑鼠按住旋鈕、把游標拖到軌道外面試試。',
    viewport: PHONE,
    fixed: {
      html: lines(
        ...PLAIN_SLIDER_HTML,
        '<p>指標捕捉：<span id="capture">尚未捕捉</span></p>',
        '<script>',
        '  // 固定的部分：旋鈕取得、失去指標捕捉時，更新上面那一行',
        "  document.querySelector('#knob').addEventListener('gotpointercapture', () => {",
        "    document.querySelector('#capture').textContent = '已捕捉';",
        '  });',
        "  document.querySelector('#knob').addEventListener('lostpointercapture', () => {",
        "    document.querySelector('#capture').textContent = '已放開';",
        '  });',
        '</script>',
      ),
      css: sliderCss(244),
    },
    starter: {
      js: lines(
        ...CAPTURE_HEAD,
        ...DOWN_NO_CAPTURE,
        '  // 1. 在這裡讓旋鈕捕捉這支指標',
        '});',
        '',
        ...CAPTURE_MOVE,
        '// 2. 在這裡登記 pointerup 的監聽器：放開時把 drag 設回 null',
      ),
    },
    solution: {
      js: lines(
        ...CAPTURE_HEAD,
        ...DOWN_WITH_CAPTURE,
        ...CAPTURE_MOVE,
        "knob.addEventListener('pointerup', () => {",
        '  drag = null;',
        '});',
      ),
    },
    steps: [
      { do: 'pointer', selector: '#knob', type: 'move', x: 30, y: 22 },
      { check: 'box', selector: '#knob', measure: 'left', value: 0, from: '#track', label: '還沒按下時，滑鼠在旋鈕上移動，旋鈕留在 0px' },
      { do: 'pointer', selector: '#knob', type: 'down', pointerType: 'touch' },
      { check: 'text', selector: '#capture', text: '已捕捉', label: '手指按下旋鈕之後，旋鈕捕捉了這支指標：`#capture` 顯示「已捕捉」' },
      { do: 'pointer', selector: '#track', type: 'move', x: 150, y: 22, pointerType: 'touch' },
      { check: 'box', selector: '#knob', measure: 'left', value: 128, from: '#track', label: '按著移到軌道上離左邊 150px 的地方（已經不在旋鈕上）：旋鈕跟到 128px' },
      { do: 'pointer', selector: '#track', type: 'move', x: 2000, y: 22, pointerType: 'touch' },
      { check: 'box', selector: '#knob', measure: 'left', value: 200, from: '#track', label: '繼續移到軌道右邊之外：旋鈕停在 200px' },
      { do: 'pointer', selector: '#track', type: 'up', x: 2000, y: 22, pointerType: 'touch' },
      { do: 'pointer', selector: '#knob', type: 'move', x: 5, y: 22 },
      { check: 'box', selector: '#knob', measure: 'left', value: 200, from: '#track', label: '放開之後拖曳結束：滑鼠再經過旋鈕，旋鈕留在 200px' },
    ],
    mistakes: [
      {
        files: {
          js: lines(
            ...CAPTURE_HEAD,
            ...DOWN_NO_CAPTURE,
            '  track.setPointerCapture(event.pointerId);',
            '});',
            '',
            ...CAPTURE_MOVE,
            "knob.addEventListener('pointerup', () => {",
            '  drag = null;',
            '});',
          ),
        },
        why: '讓軌道而不是旋鈕去捕捉。捕捉之後事件固定送給捕捉的那個元素：`pointermove` 與 `pointerup` 都送到軌道，登記在旋鈕上的監聽器反而一個都收不到，旋鈕完全拖不動。監聽器登記在誰身上，就讓誰捕捉。',
      },
      {
        files: {
          js: lines(
            ...CAPTURE_HEAD,
            ...DOWN_WITH_CAPTURE,
            ...CAPTURE_MOVE,
            "knob.addEventListener('pointerup', (event) => {",
            '  knob.releasePointerCapture(event.pointerId);',
            '});',
          ),
        },
        why: '放開時只解除了捕捉，沒有把 `drag` 設回 `null`。捕捉本來就會在放開時自動解除；真正代表「拖曳結束」的是旗標。旗標沒清掉，滑鼠之後只是經過旋鈕，`pointermove` 的監聽器仍然把它當成拖曳。',
      },
    ],
  },
  {
    id: 'mob04-x-cancel', title: '被打斷就復原的拖曳',
    statement: 'index.html 與 style.css 不能改。script.js 的拖曳已經能動（有旗標、有捕捉），請完成最後兩個監聽器。（一）`pointerup`：正常放開時，把旋鈕目前的位置（`knob.offsetLeft`，一個數字）寫進 `#value`。（二）`pointercancel`：拖曳被系統取消時，把旋鈕放回這一次按下時的位置（記在 `drag.knobLeft`），把 `drag` 設回 `null` 結束拖曳，而且不要改 `#value`。檢查會模擬兩次被取消的拖曳與一次正常放開的拖曳；還會在另一個軌道比較寬的頁面上再執行一次，所以位置要從 `knob.offsetLeft` 與 `drag` 讀，不能把數字寫死。',
    hints: [
      '`pointerup` 的監聽器已經把 `drag` 設回 `null` 了，只差把數字顯示出來：`value.textContent = …`。',
      '`pointercancel` 裡要用到 `drag.knobLeft`，所以先還原位置，再把 `drag` 設回 `null`；順序反過來就讀不到起點了。',
      '還原是設定 `knob.style.left`，數字後面要接上單位：`knob.style.left = drag.knobLeft + \'px\';`，下一行 `drag = null;`。',
    ],
    explanation: '`pointerup` 表示使用者自己放開了：這一刻旋鈕的位置就是他的決定，寫進 `#value`。`pointercancel` 表示這次觸控被瀏覽器或系統拿走了，使用者沒有決定任何事：把旋鈕放回 `drag.knobLeft`（每一次按下時重新記的起點，所以第二次拖曳會回到 128 而不是 0），清掉旗標，結果保持原樣。兩條路都要把 `drag` 設回 `null`，否則之後的 `pointermove` 還會被當成拖曳。',
    viewport: PHONE,
    fixed: { html: cancelPage, css: sliderCss(244) },
    starter: {
      js: lines(
        ...CANCEL_HEAD,
        "knob.addEventListener('pointerup', () => {",
        '  drag = null;',
        '  // 1. 正常放開：把旋鈕現在的位置寫進 value',
        '});',
        '',
        "knob.addEventListener('pointercancel', () => {",
        '  // 2. 被取消：旋鈕回到按下時的位置，結束拖曳，不要改 value',
        '});',
      ),
    },
    solution: {
      js: lines(
        ...CANCEL_HEAD,
        ...COMMIT_ON_UP,
        "knob.addEventListener('pointercancel', () => {",
        '  if (drag === null) {',
        '    return;',
        '  }',
        "  knob.style.left = drag.knobLeft + 'px';",
        '  drag = null;',
        '});',
      ),
    },
    steps: [
      { do: 'pointer', selector: '#knob', type: 'down', pointerType: 'touch' },
      { do: 'pointer', selector: '#track', type: 'move', x: 150, y: 22, pointerType: 'touch' },
      { do: 'pointer', selector: '#track', type: 'cancel', x: 150, y: 22, pointerType: 'touch' },
      { check: 'box', selector: '#knob', measure: 'left', value: 0, from: '#track', label: '手指拖到 128px 時被系統取消：旋鈕回到按下時的 0px' },
      { check: 'text', selector: '#value', text: '0', label: '被取消的拖曳不改變份量：`#value` 仍然是 0' },
      { do: 'pointer', selector: '#knob', type: 'move', x: 40, y: 22 },
      { check: 'box', selector: '#knob', measure: 'left', value: 0, from: '#track', label: '取消之後拖曳已經結束：滑鼠再經過旋鈕，旋鈕留在 0px' },
      { do: 'pointer', selector: '#knob', type: 'down' },
      { do: 'pointer', selector: '#track', type: 'move', x: 150, y: 22 },
      { do: 'pointer', selector: '#track', type: 'up', x: 150, y: 22 },
      { check: 'text', selector: '#value', text: '128', label: '用滑鼠拖到 128px 後正常放開：`#value` 是 128' },
      { do: 'pointer', selector: '#knob', type: 'down', pointerType: 'touch' },
      { do: 'pointer', selector: '#track', type: 'move', x: 2000, y: 22, pointerType: 'touch' },
      { do: 'pointer', selector: '#track', type: 'cancel', x: 2000, y: 22, pointerType: 'touch' },
      { check: 'box', selector: '#knob', measure: 'left', value: 128, from: '#track', label: '從 128px 再拖到最右邊時被取消：回到這一次按下時的 128px' },
      { check: 'text', selector: '#value', text: '128', label: '`#value` 維持上一次提交的 128' },
    ],
    mistakes: [
      {
        files: {
          js: lines(
            ...CANCEL_HEAD,
            'const finish = () => {',
            '  drag = null;',
            '  value.textContent = knob.offsetLeft;',
            '};',
            "knob.addEventListener('pointerup', finish);",
            "knob.addEventListener('pointercancel', finish);",
          ),
        },
        why: '把 `pointercancel` 當成 `pointerup` 處理：拖到一半被打斷的位置直接變成結果。使用者只是想捲動頁面，手指剛好碰到旋鈕，白飯就從 0 變成 128 公克。被取消代表使用者沒有做決定，要還原，不能提交。',
      },
      {
        files: {
          js: lines(
            ...CANCEL_HEAD,
            ...COMMIT_ON_UP,
            "knob.addEventListener('pointercancel', () => {",
            "  knob.style.left = '0px';",
            '  drag = null;',
            '});',
          ),
        },
        why: '取消時一律回到 `0px`。第一次拖曳剛好從 0 開始，看起來是對的；但從 128 開始的第二次拖曳被取消時，旋鈕卻跳回 0，畫面和 `#value` 的 128 對不上。要回去的是這一次按下時的位置 `drag.knobLeft`。',
      },
      {
        files: {
          js: lines(
            ...CANCEL_HEAD,
            ...COMMIT_ON_UP,
            "knob.addEventListener('pointercancel', () => {",
            "  knob.style.left = drag.knobLeft + 'px';",
            '});',
          ),
        },
        why: '還原了位置，卻沒有把 `drag` 設回 `null`。`pointercancel` 之後不會再有 `pointerup` 來替你清掉旗標，所以拖曳一直沒有結束：滑鼠之後只是經過旋鈕，旋鈕就跟著跑。',
      },
    ],
    variants: [
      {
        title: '另一個滑桿：軌道寬 344px，旋鈕可以到 300px',
        fixed: { css: sliderCss(344) },
        steps: [
          { do: 'pointer', selector: '#knob', type: 'down', pointerType: 'touch' },
          { do: 'pointer', selector: '#track', type: 'move', x: 2000, y: 22, pointerType: 'touch' },
          { do: 'pointer', selector: '#track', type: 'up', x: 2000, y: 22, pointerType: 'touch' },
          { check: 'text', selector: '#value', text: '300', label: '拖到最右邊後放開：`#value` 是 300' },
          { do: 'pointer', selector: '#knob', type: 'down' },
          { do: 'pointer', selector: '#track', type: 'move', x: 100, y: 22 },
          { do: 'pointer', selector: '#track', type: 'cancel', x: 100, y: 22 },
          { check: 'box', selector: '#knob', measure: 'left', value: 300, from: '#track', label: '往左拖時被取消：旋鈕回到 300px' },
          { check: 'text', selector: '#value', text: '300', label: '`#value` 維持 300' },
          { do: 'pointer', selector: '#knob', type: 'move', x: 5, y: 22 },
          { check: 'box', selector: '#knob', measure: 'left', value: 300, from: '#track', label: '取消之後滑鼠經過旋鈕，旋鈕不動' },
        ],
      },
    ],
  },
  {
    id: 'mob04-x-keys', title: '補上鍵盤操作與 touch-action',
    statement: 'index.html 不能改：旋鈕 `#knob` 已經有 `role="slider"`、`tabindex="0"` 與 `aria-valuenow`。這個滑桿還缺兩件事。（一）style.css：在 `#knob` 的規則裡宣告 `touch-action: none`（只把垂直捲動留給瀏覽器的 `pan-y` 也可以），其他樣式不要改。（二）script.js：完成 `keydown` 的監聽器。焦點在旋鈕上時，按 ArrowRight 讓旋鈕往右 10px，按 ArrowLeft 往左 10px（用 `event.key` 判斷是哪一個鍵），不能超出軌道；每次移動之後，`#value` 與旋鈕的 `aria-valuenow` 都要是新的位置；其他按鍵不能有反應。script.js 裡已經有兩個函式可以用：`place(left)` 把旋鈕移到指定的位置並夾在軌道內，`commit()` 把目前的位置寫進 `#value` 與 `aria-valuenow`。檢查還會在另一個軌道比較寬的頁面上再執行一次。',
    hints: [
      '`touch-action` 寫在 style.css 裡 `#knob` 的大括號內，和其他宣告並列。鍵盤的部分和「事件與事件委派」那一課的 Escape 一樣：在監聽器裡比對 `event.key`。',
      '右方向鍵的 `event.key` 是 `\'ArrowRight\'`，左方向鍵是 `\'ArrowLeft\'`。旋鈕目前的位置是 `knob.offsetLeft`，新的位置就是它加 10 或減 10。',
      '右方向鍵：`place(knob.offsetLeft + 10);`，左方向鍵：`place(knob.offsetLeft - 10);`，兩個鍵都不是就直接 `return`；最後呼叫 `commit();`。寫法可以照「完整的滑桿」那個範例。',
    ],
    explanation: '`touch-action` 宣告在旋鈕上，瀏覽器在手指碰到旋鈕的當下就知道不要把這次觸控拿去捲動，拖曳才不會被 `pointercancel` 打斷。鍵盤的監聽器登記在可以取得焦點的旋鈕上，只認 `ArrowRight` 與 `ArrowLeft`；移動交給 `place()`，它和拖曳共用同一個夾住範圍的算法，所以鍵盤也不會把旋鈕移出軌道。每按一次鍵就是一次完整的操作，所以立刻 `commit()`：`#value` 給看畫面的人，`aria-valuenow` 給螢幕閱讀器。',
    viewport: PHONE,
    fixed: { html: sliderHtml(200) },
    starter: {
      css: KEYS_CSS_STARTER,
      js: lines(
        ...SLIDER_JS,
        "knob.addEventListener('keydown', (event) => {",
        '  // 在這裡：ArrowRight 往右 10px，ArrowLeft 往左 10px。',
        '  // 用 place() 移動，再呼叫 commit()；其他按鍵什麼都不做。',
        '});',
      ),
    },
    solution: { css: KEYS_CSS_DONE, js: lines(...SLIDER_JS, ...KEYS_JS) },
    steps: [
      { check: 'style', selector: '#knob', property: 'touch-action', value: ['none', 'pan-y'], label: '`#knob` 宣告了 `touch-action`：計算後是 `none`（或 `pan-y`）' },
      { do: 'key', selector: '#knob', key: 'ArrowRight' },
      { do: 'key', selector: '#knob', key: 'ArrowRight' },
      { do: 'key', selector: '#knob', key: 'a' },
      { do: 'key', selector: '#knob', key: 'ArrowRight' },
      { check: 'box', selector: '#knob', measure: 'left', value: 30, from: '#track', label: '焦點在旋鈕上按三次右方向鍵：旋鈕在 30px；中間按的字母鍵 a 沒有作用' },
      { check: 'text', selector: '#value', text: '30', label: '`#value` 跟著變成 30' },
      { check: 'attr', selector: '#knob', name: 'aria-valuenow', value: '30', label: '旋鈕的 `aria-valuenow` 也是 30' },
      { do: 'key', selector: '#knob', key: 'ArrowLeft' },
      { do: 'key', selector: '#knob', key: 'ArrowLeft' },
      { do: 'key', selector: '#knob', key: 'ArrowLeft' },
      { do: 'key', selector: '#knob', key: 'ArrowLeft' },
      { do: 'key', selector: '#knob', key: 'ArrowLeft' },
      { check: 'box', selector: '#knob', measure: 'left', value: 0, from: '#track', label: '再按五次左方向鍵：旋鈕停在 0px，沒有跑出軌道' },
      { do: 'pointer', selector: '#knob', type: 'down' },
      { do: 'pointer', selector: '#track', type: 'move', x: 2000, y: 22 },
      { do: 'pointer', selector: '#track', type: 'up', x: 2000, y: 22 },
      { do: 'key', selector: '#knob', key: 'ArrowRight' },
      { check: 'box', selector: '#knob', measure: 'left', value: 200, from: '#track', label: '用滑鼠拖到最右邊之後再按右方向鍵：旋鈕停在 200px' },
    ],
    mistakes: [
      {
        files: {
          css: KEYS_CSS_DONE,
          js: lines(
            ...SLIDER_JS,
            "knob.addEventListener('keydown', (event) => {",
            "  if (event.key === 'ArrowRight') knob.style.left = (knob.offsetLeft + 10) + 'px';",
            "  else if (event.key === 'ArrowLeft') knob.style.left = (knob.offsetLeft - 10) + 'px';",
            '  else return;',
            '  commit();',
            '});',
          ),
        },
        why: '直接改 `knob.style.left`，沒有經過 `place()`：位置沒有被夾在範圍內，在最左邊再按左方向鍵，旋鈕就跑到軌道外面，`#value` 還出現負的公克數。拖曳與鍵盤要共用同一個限制範圍的函式。',
      },
      {
        files: {
          css: KEYS_CSS_DONE,
          js: lines(
            ...SLIDER_JS,
            "knob.addEventListener('keydown', (event) => {",
            "  if (event.key === 'ArrowRight') place(knob.offsetLeft + 10);",
            "  else if (event.key === 'ArrowLeft') place(knob.offsetLeft - 10);",
            '});',
          ),
        },
        why: '移動了旋鈕卻沒有呼叫 `commit()`：畫面上的旋鈕動了，`#value` 與 `aria-valuenow` 還是舊的數字。看得到畫面的人會發現數字沒變，螢幕閱讀器的使用者聽到的更是完全沒變的值。',
      },
      {
        files: {
          css: KEYS_CSS_DONE,
          js: lines(
            ...SLIDER_JS,
            "knob.addEventListener('keydown', (event) => {",
            "  const step = event.key === 'ArrowRight' ? 10 : -10;",
            '  place(knob.offsetLeft + step);',
            '  commit();',
            '});',
          ),
        },
        why: '只判斷「是不是右方向鍵」，其餘的按鍵一律當成往左：使用者按 Tab 想離開旋鈕、或不小心碰到任何一個鍵，白飯就少 10 公克。兩個方向鍵要各自比對，其他按鍵不處理。',
      },
      {
        files: { css: KEYS_CSS_STARTER, js: lines(...SLIDER_JS, ...KEYS_JS) },
        why: '只寫了鍵盤，忘了在 style.css 替旋鈕宣告 `touch-action`。用滑鼠測試一切正常；到了手機上，手指一拖，瀏覽器就把這次觸控拿去捲動頁面，旋鈕收到 `pointercancel` 而回到原位，怎麼拖都拖不動。',
      },
    ],
    variants: [
      {
        title: '另一個滑桿：軌道寬 344px，旋鈕可以到 300px',
        fixed: { html: sliderHtml(300, ' style="width: 344px;"') },
        steps: [
          { do: 'key', selector: '#knob', key: 'ArrowRight' },
          { do: 'key', selector: '#knob', key: 'ArrowRight' },
          { check: 'text', selector: '#value', text: '20', label: '按兩次右方向鍵：`#value` 是 20' },
          { do: 'pointer', selector: '#knob', type: 'down', pointerType: 'touch' },
          { do: 'pointer', selector: '#track', type: 'move', x: 2000, y: 22, pointerType: 'touch' },
          { do: 'pointer', selector: '#track', type: 'up', x: 2000, y: 22, pointerType: 'touch' },
          { do: 'key', selector: '#knob', key: 'ArrowRight' },
          { check: 'box', selector: '#knob', measure: 'left', value: 300, from: '#track', label: '拖到最右邊再按右方向鍵：停在 300px' },
          { do: 'key', selector: '#knob', key: 'ArrowLeft' },
          { check: 'attr', selector: '#knob', name: 'aria-valuenow', value: '290', label: '按一次左方向鍵：`aria-valuenow` 是 290' },
        ],
      },
    ],
  },
];

export const MOB04: LessonContent = {
  lessonId: 'MOB04',
  motivation: '手機上靠手指，桌機上靠滑鼠，平板還有觸控筆：拖曳一個旋鈕的程式不該寫三份。這一課用 Pointer Events 以同一組監聽器處理三種裝置，做出手指滑出元素也不中斷、被系統打斷時會復原、鍵盤也能操作的拖曳滑桿，並用被動監聽器讓捲動不必等你的程式。',
  sections: [
    {
      id: 'mob04-families', title: '三套事件模型：滑鼠、觸控與指標',
      blocks: [
        { type: 'p', text: '「事件與事件委派」那一課的 `click` 只告訴你「點了一下」。拖曳一個旋鈕、滑開一張卡片，需要的是過程：什麼時候按下、按著移到哪裡、什麼時候放開。瀏覽器先後用過三套事件描述這個過程。最早只有滑鼠事件（`mousedown`、`mousemove`、`mouseup`）；觸控螢幕出現後多了觸控事件（Touch Events：`touchstart`、`touchmove`、`touchend`）；後來為了不必替每種裝置各寫一份，才有指標事件（Pointer Events）：把滑鼠、手指、觸控筆都看成一支「指標（pointer）」，用同一組事件回報。' },
        { type: 'table', head: ['比較', '滑鼠事件', '觸控事件（Touch Events）', '指標事件（Pointer Events）'], rows: [
          ['按下、移動、放開', '`mousedown`、`mousemove`、`mouseup`', '`touchstart`、`touchmove`、`touchend`', '`pointerdown`、`pointermove`、`pointerup`'],
          ['被系統中斷時', '沒有對應的事件', '`touchcancel`', '`pointercancel`'],
          ['涵蓋的輸入', '滑鼠；手指點一下之後，瀏覽器會補發一組相容用的滑鼠事件', '只有觸控', '滑鼠、觸控（touch）、觸控筆，用 `pointerType` 分辨'],
          ['座標怎麼讀', '`event.clientX`', '`event.touches[0].clientX`：每根手指是清單裡的一項', '`event.clientX`：每支指標各發自己的事件，用 `pointerId` 分辨'],
          ['哪裡可以用', '所有瀏覽器', '手機瀏覽器都有，桌機瀏覽器不一定提供', '現在的瀏覽器都有'],
        ] },
        { type: 'p', text: '只聽滑鼠事件的拖曳，在手機上拖不動：手指按著移動的過程中不會有 `mousemove`，瀏覽器只在手指點一下、放開之後補發一組相容用的滑鼠事件，好讓只認得滑鼠的舊網頁至少點得動。只聽觸控事件，滑鼠使用者又用不了；而且桌機瀏覽器不一定有觸控事件，所以這一課的頁面全部只用指標事件，觸控事件只出現在表格與文字裡。兩套都聽，同一個動作會被處理兩次（下一節）。指標事件一組就涵蓋三種裝置，屬性又是從滑鼠事件延伸來的，`clientX`、`clientY`、`target` 的用法照舊，所以新寫的程式選它。' },
        { type: 'p', text: '一次互動的事件順序是固定的：`pointerdown`（按下）、零到多次 `pointermove`（移動）、`pointerup`（放開）。如果中途被系統打斷，最後一個就不是 `pointerup`，而是 `pointercancel`。除了「事件與事件委派」那一課用過的 `type` 與 `target`，事件物件還多了幾個指標專用的屬性：' },
        { type: 'table', head: ['屬性', '是什麼', '例子'], rows: [
          ['`pointerType`', '這支指標是哪一種裝置', '`\'mouse\'`、`\'touch\'`、`\'pen\'`'],
          ['`pointerId`', '這支指標的編號：從按下到放開都不變，用來分辨同時存在的多支指標', '兩根手指同時按著，就有兩個不同的編號'],
          ['`isPrimary`', '是不是這種裝置的主要指標', '多指觸控時只有第一根手指是 `true`；滑鼠永遠是 `true`'],
          ['`buttons`', '目前按著哪些按鍵，或有沒有接觸螢幕', '什麼都沒按是 0；滑鼠左鍵、手指或筆尖接觸是 1'],
          ['`clientX`、`clientY`', '指標在視窗裡的座標，單位是 CSS 的 px', '拖曳時用前後兩次的差，算出移動了多少'],
          ['`pressure`', '按壓的力道，從 0 到 1', '不支援壓力的裝置，按著的時候固定回報 0.5'],
        ] },
        { type: 'example', id: 'mob04-ex-log' },
        { type: 'p', text: '用滑鼠試：先不要按，讓游標在虛線框裡晃一晃，「沒按著移動」的次數不斷增加，因為滑鼠不按也會觸發 `pointermove`，這時 `buttons` 是 0。按住再移動，增加的換成「按著移動」；按下與放開各在主控台留下一行，`pointerType` 是 mouse。有觸控螢幕的話改用手指點一下：script.js 一行都不用改，`pointerType` 變成 touch，而且手指沒有碰到螢幕的時候，兩個計數都不會動。' },
        { type: 'callout', tone: 'note', title: '檢查裡的指標是模擬出來的', text: '每個範例下方列出的事實，以及之後練習的檢查，都需要「按下、移動、放開」。指令稿沒辦法操縱你真正的滑鼠或手指，所以檢查時的指標事件是檢查程式自己做出來、再送到頁面上的（步驟會寫成「用手指在 `#pad` 按下」）。它們是真正的 `PointerEvent` 物件，`pointerType`、`clientX` 這些屬性都和瀏覽器產生的事件一樣填好了；但瀏覽器不會跟著做它平常會做的事：不會捲動頁面，放開之後不會補一個 `click`，也沒有相容用的滑鼠事件。預覽則相反：那裡的事件來自你自己的滑鼠或手指，是瀏覽器產生的。所以檢查能確認的是「你的監聽器收到事件之後做得對不對」，瀏覽器本身的行為請在預覽裡親手試。' },
      ],
    },
    {
      id: 'mob04-differences', title: '觸控與滑鼠的差異',
      blocks: [
        { type: 'p', text: '指標事件讓同一份程式處理兩種裝置，但兩種裝置的行為並不相同。觸控與滑鼠的差異，寫程式時要記得這四個：' },
        { type: 'table', head: ['差異', '滑鼠', '觸控', '寫程式時要注意'], rows: [
          ['懸停（hover）', '不按也能移動，持續有 `pointermove`', '沒有：手指沒碰到螢幕，就沒有任何事件', '不能把功能藏在懸停後面；收到 `pointermove` 不等於正在拖曳'],
          ['指標存在多久', '一直都在', '只在手指接觸螢幕的期間存在，放開就消失', '不要把 `pointerId` 留到下一次互動再用'],
          ['精準度', '一個像素大的尖端', '一片指腹，手指還會擋住正在按的東西', '目標要夠大（「觸控目標與手勢的實作」那一課）'],
          ['誰會中途接手', '很少發生', '瀏覽器可能把這次觸控拿去捲動或縮放頁面', '一定要處理 `pointercancel`'],
        ] },
        { type: 'p', text: '最後一列最容易忘。手指在頁面上移動，本來的意思通常是「捲動」。所以手指按下後一移動，瀏覽器可能判定這是捲動或縮放的手勢（gesture）而接手；這時它對你的元素發出 `pointercancel`，之後這支指標不會再送來 `pointermove`，也不會有 `pointerup`。系統層級的打斷也一樣，例如使用者切換到別的應用程式。在手機上回到上一節的記錄板，按住虛線框往上下滑：頁面開始捲動，記錄板的最後一個事件通常就是 `pointercancel`。怎麼請瀏覽器不要接手、被接手時怎麼收拾，是接下來兩節的主題。' },
        { type: 'p', text: '另一個差異在「點一下」。手指點一下再放開，瀏覽器在指標事件之後仍然會發出 `click`；滑鼠按一下也是；用鍵盤的 Enter 或空白鍵啟動按鈕時，更是只有 `click`，完全沒有指標事件。所以「點一下就做某件事」應該繼續登記在 `click` 上；指標事件留給需要過程的操作：拖曳、滑動、畫圖。' },
        { type: 'example', id: 'mob04-ex-tap' },
        { type: 'p', text: '用 Tab 把焦點移到「加入購物車」再按 Enter：購物車加一，「被指標按下」的次數不變。接著用滑鼠或手指按住按鈕不放：`pointerdown` 在按下的瞬間就發生，次數加一，購物車卻要等放開才加一。按住之後把指標滑到按鈕外面再放開，這一下不算按鈕的點擊，購物車不變：這是留給使用者的反悔機會。如果把「加入購物車」寫在 `pointerdown` 裡，鍵盤使用者用不了，反悔的機會沒了，連手指只是碰到按鈕、其實想捲動頁面，也會多加一份。' },
        { type: 'callout', tone: 'warning', title: '不要同時監聽觸控事件與滑鼠事件', text: '常見的舊寫法是 `touchstart` 與 `mousedown` 各登記一次，呼叫同一個函式，以為這樣兩種裝置都顧到了。在手機上點一下，先發生觸控事件，放開之後瀏覽器又補發相容用的滑鼠事件，於是同一個函式執行兩次：數量一次加 2，選單打開又立刻關上。這種錯在桌機上用滑鼠測試永遠看不出來。改成只監聽一組指標事件，一個動作就只處理一次。' },
      ],
    },
    {
      id: 'mob04-drag', title: '拖曳：起點、旗標與指標捕捉',
      blocks: [
        { type: 'p', text: '拖曳是三個事件的合作。`pointerdown`：記下起點，也就是指標當時的 `clientX` 與旋鈕當時的位置，並標記「開始拖曳」。`pointermove`：如果正在拖曳，用「旋鈕的起點 +（指標現在的 `clientX` − 指標的起點）」算出新位置。`pointerup`：結束拖曳。用差值而不是直接把 `clientX` 當成位置，旋鈕才不會在按下的瞬間跳到指標底下；`clientX` 是相對於視窗的座標，本來也不是旋鈕在軌道裡的位置。' },
        { type: 'example', id: 'mob04-ex-drag' },
        { type: 'p', text: '變數 `drag` 就是拖曳旗標：平常是 `null`，按下時換成記著起點的物件，放開時設回 `null`。`pointermove` 的監聽器第一件事就是檢查它。上一節說過滑鼠不按也會觸發 `pointermove`，少了這個檢查，游標只是經過旋鈕，旋鈕就跟著跑。算出來的位置再用 `Math.max(0, Math.min(max, left))` 夾在 0 與 `max` 之間；`max` 是軌道寬度減掉旋鈕寬度（244 − 44 = 200），旋鈕就不會被拖出軌道。' },
        { type: 'p', text: '`pointerdown` 監聽器裡的 `knob.setPointerCapture(event.pointerId)` 是指標捕捉（pointer capture）。事件原本送給指標底下的元素：旋鈕只有 44px 寬，拖快一點指標就跑到旋鈕外面，`pointermove` 改送給別的元素，旋鈕停住；更糟的是在外面放開時，`pointerup` 也送不到旋鈕，`drag` 一直不是 `null`。捕捉之後，這支指標後續的 `pointermove`、`pointerup`、`pointercancel` 都固定送給旋鈕，不管指標移到哪裡；放開或被取消時，捕捉自動解除。規格允許瀏覽器對觸控這種直接操作的輸入，在按下時自動替目標元素捕捉（許多瀏覽器都這麼做），滑鼠則沒有這個待遇；自己明確呼叫，三種裝置的行為才一致。捕捉只在指標按著的期間有效，參數是那支指標的 `pointerId`，不是事件物件。' },
        { type: 'p', text: '用滑鼠試：按住旋鈕往右拖，故意讓游標離開軌道、跑到下面的文字上，旋鈕仍然跟著動，拖到盡頭停在 200。接著在編輯器裡刪掉 `setPointerCapture` 那一行再執行一次：游標一離開旋鈕它就停住；在旋鈕外面放開之後，把游標移回旋鈕上，旋鈕竟然自己跟著跑，因為它從頭到尾沒收到 `pointerup`。' },
        { type: 'p', text: 'style.css 裡旋鈕還有一行 `touch-action: none`。上一節說過，手指一移動，瀏覽器可能把這次觸控拿去捲動頁面並送出 `pointercancel`。`touch-action` 是事先告訴瀏覽器：從這個元素開始的觸控，哪些手勢可以由你處理。`none` 表示都不要，全部交給頁面的程式；橫向的滑桿也可以寫 `pan-y`，只把垂直捲動留給瀏覽器。用指標事件時，這件事只能靠 CSS：在 `pointermove` 裡呼叫 `preventDefault()` 擋不住捲動（那是觸控事件 `touchmove` 的做法）。事先宣告的好處是，瀏覽器不必等指令稿執行，就知道這次觸控能不能拿去捲動。範圍要盡量小，只宣告在旋鈕上；為了省事寫在整個 `body`，整頁就不能用手指捲動、也不能用兩指縮放了。旁邊的 `user-select: none` 則是避免拖曳時順便選取到文字。' },
        { type: 'callout', tone: 'note', title: '檢查裡的捕捉也是模擬的', text: '真正的指標捕捉需要真正的指標，所以檢查程式依照規格的規則模擬它：指標按著時，呼叫過 `setPointerCapture` 的元素會收到後續的移動、放開與取消，即使步驟瞄準的是別的元素（例如「用手指在 `#track` 移動」）；指標沒有按著的時候，捕捉不會成立。這能確認你的監聽器有沒有在對的時機、替對的元素捕捉，以及收到事件後算得對不對；它不能證明瀏覽器的捕捉行為，那一部分就是上面請你用滑鼠親手做的實驗。' },
      ],
    },
    {
      id: 'mob04-cancel-keyboard', title: '可取消的拖曳與鍵盤替代操作',
      blocks: [
        { type: 'p', text: '上一個滑桿還缺兩件事。第一件是結果與取消。使用者拖曳時旋鈕跟著動，但「白飯要幾公克」這個結果，要到放開的那一刻才算數：`pointerup` 時才把位置寫進結果，這叫提交（commit）。如果收到的是 `pointercancel`，表示這次操作被打斷了，使用者並沒有決定任何事：這時要把旋鈕放回按下時的位置、結束拖曳，而且不提交。這就是可取消的拖曳。起點早就記在 `drag.knobLeft` 裡，還原只要一行。' },
        { type: 'p', text: '第二件是鍵盤。「觸控目標與手勢的實作」那一課的規則是每個手勢都要有替代操作：只能用指標拖的旋鈕，鍵盤使用者、螢幕閱讀器使用者、手不方便做精細拖曳的人都用不了。做法是讓旋鈕可以取得焦點（`tabindex="0"`），用 `role="slider"`、`aria-label` 與 `aria-valuemin`、`aria-valuemax`、`aria-valuenow` 告訴螢幕閱讀器它是什麼、範圍多大、現在的值是多少（「語意 HTML 與 ARIA 的無障礙實作」那一課的做法），再登記 `keydown`：右方向鍵加 10，左方向鍵減 10，和拖曳共用同一個夾住範圍的函式。' },
        { type: 'example', id: 'mob04-ex-slider' },
        { type: 'p', text: 'script.js 把兩個動作分成兩個函式：`place(left)` 只管把旋鈕移到指定的位置並夾在範圍內；`commit()` 把目前的位置寫進 `#value` 與 `aria-valuenow`。拖曳途中只呼叫 `place`；`pointerup` 才 `commit`；`pointercancel` 用 `place(drag.knobLeft)` 回到起點，不 `commit`。鍵盤每按一次就是一次完整的操作，所以 `place` 之後立刻 `commit`。試試看：按 Tab 把焦點移到旋鈕（出現外框），再按左右方向鍵，數字每次變 10。取消的那條路在預覽裡不容易自己製造，因為旋鈕宣告了 `touch-action: none`，瀏覽器不會接手；它由下方的事實示範：拖到 128 時被取消，旋鈕回到 0，份量維持 0。' },
        { type: 'p', text: '完整的滑桿還會處理上下方向鍵與 Home、End，這裡只做左右；如果頁面本身可以左右捲動，處理方向鍵時還要呼叫 `event.preventDefault()`，免得頁面跟著捲。真的要在產品裡放一個滑桿時，先考慮原生的 `<input type="range">`：它本來就同時支援滑鼠、觸控與鍵盤，角色也是對的。需要原生控制項做不到的外觀或行為時才自己做；一旦自己做，上面這些就全部是你的責任。' },
        { type: 'callout', tone: 'warning', title: '只處理 pointerup，忘了 pointercancel', text: '只寫 `pointerup` 的拖曳，在桌機上用滑鼠測試永遠沒事，到了手機才出問題：拖曳被瀏覽器或系統打斷時沒有 `pointerup`，旗標沒有清掉，旋鈕停在半路，結果既沒有提交也沒有還原。每寫一個 `pointerup`，就問自己：收到 `pointercancel` 時該怎麼辦？想把收尾集中在一個地方，可以改聽 `lostpointercapture`：只要捕捉過，不論拖曳是因為放開還是被取消而結束，捕捉解除時都會發生這個事件。' },
      ],
    },
    {
      id: 'mob04-passive', title: '被動監聽器：別讓監聽器拖慢捲動',
      blocks: [
        { type: 'p', text: '捲動是手機上最頻繁的操作，瀏覽器會盡量讓它不必等頁面的 JavaScript。但 `touchstart`、`touchmove` 與滾輪的 `wheel` 有一個麻煩：它們的監聽器可以呼叫 `preventDefault()` 取消這次捲動。只要有這樣的監聽器，瀏覽器就得先執行它、等它跑完，才知道到底要不要捲。監聽器跑得慢，或頁面正忙著別的事，畫面就卡住：手指已經滑出去了，內容卻停在原地。' },
        { type: 'p', text: '被動監聽器（passive listener）是你對瀏覽器的承諾：登記時在第三個參數寫 `{ passive: true }`，表示這個監聽器絕對不會取消預設行為。瀏覽器於是不必等它，捲動立刻進行。這個承諾是強制的：在被動監聽器裡呼叫 `preventDefault()` 沒有任何作用，`event.defaultPrevented` 仍然是 `false`，也不會丟出錯誤。' },
        { type: 'example', id: 'mob04-ex-passive' },
        { type: 'p', text: '兩份菜單的監聽器內容一模一樣，差別只有第三個參數。用滑鼠滾輪或觸控板在菜單一上捲：菜單照常捲動，下面顯示 false，被動監聽器的 `preventDefault()` 被忽略了。瀏覽器通常還會在自己的開發者工具主控台留下一則訊息提醒你；預覽下方的主控台只列出頁面自己印的內容，所以看不到它。在菜單二上捲：顯示 true，菜單一動也不動；這個監聽器真的擋下了捲動，瀏覽器每一次都得等它。用手指捲動產生的不是 `wheel`，所以在觸控螢幕上兩份菜單都捲得動，數字也不會變；`touchmove` 的道理完全相同，只是這一課的頁面不放觸控事件。' },
        { type: 'table', head: ['登記的方式', '呼叫 preventDefault() 有沒有作用', '瀏覽器捲動前要不要等它'], rows: [
          ['`{ passive: true }`', '沒有，`defaultPrevented` 維持 `false`', '不用等'],
          ['`{ passive: false }`', '有', '要等'],
          ['沒寫，登記在一般元素上', '有', '要等'],
          ['沒寫，把 `touchstart`、`touchmove` 或 `wheel` 登記在 `window`、`document` 或 `body` 上', '許多瀏覽器把它當成被動的：沒有作用', '不用等'],
        ] },
        { type: 'p', text: '最後一列是瀏覽器為了讓舊網頁也捲得順而做的調整，不是每個瀏覽器、每種事件都一樣，所以不要依賴預設值。只是想知道「使用者在捲動」的監聽器，明確寫 `{ passive: true }`；真的需要擋下捲動的，明確寫 `{ passive: false }`，把它登記在最小的元素上，裡面做的事越少越好。指標事件沒有這道選擇題：`pointermove` 的 `preventDefault()` 本來就擋不住捲動，能不能捲是 `touch-action` 用 CSS 事先宣告的，瀏覽器同樣不必等指令稿。另外，`scroll` 事件是捲動發生之後才通知你的，本來就不能取消。' },
        { type: 'callout', tone: 'warning', title: '在 document 上擋捲動，卻沒寫 passive: false', text: '想在彈出面板打開時鎖住背景，於是寫了 `document.addEventListener(\'touchmove\', (event) => { event.preventDefault(); })`。在許多瀏覽器上背景照樣捲動：登記在 `document` 上、又沒寫選項的 `touchmove` 監聽器被當成被動的，`preventDefault()` 悄悄失效，頁面自己不會收到任何錯誤。真的要擋，就明確寫出 `{ passive: false }`；更好的做法是不靠監聽器，改用 CSS 事先宣告，例如面板打開時讓背景暫時 `overflow: hidden`。' },
      ],
    },
    {
      id: 'mob04-mistakes', title: '常見錯誤與完成前的檢查',
      blocks: [
        { type: 'p', text: '這一課的每個步驟，漏掉時都有固定的症狀。先認症狀，就知道少了哪一步；其中好幾個只在真正的手機上才會出現，用滑鼠測試再多次也看不到。' },
        { type: 'table', head: ['症狀', '原因', '修正'], rows: [
          ['手機上點一下，處理程式執行兩次', '同時監聽 `touchstart` 與 `mousedown`', '只監聽一組指標事件；「點一下」用 `click`'],
          ['滑鼠只是經過，旋鈕就跟著跑', '`pointermove` 沒有先檢查拖曳旗標，或放開時沒有清掉旗標', '按下時設旗標，`pointerup` 與 `pointercancel` 都清掉'],
          ['用滑鼠拖快一點，旋鈕就停住', '沒有捕捉，指標離開旋鈕後事件送到別的元素', '在 `pointerdown` 呼叫 `setPointerCapture(event.pointerId)`'],
          ['手機上一拖，頁面跟著捲，拖曳中斷', '沒有宣告 `touch-action`，瀏覽器接手了這次觸控', '在旋鈕上宣告 `touch-action: none` 或 `pan-y`'],
          ['拖曳被打斷後，旋鈕停在半路', '沒有處理 `pointercancel`', '回到按下時的位置、清掉旗標、不提交'],
          ['鍵盤與螢幕閱讀器操作不了', '只有指標操作，旋鈕不能取得焦點', '加上角色、`tabindex` 與方向鍵，或改用原生的 `<input type="range">`'],
          ['捲動時畫面一頓一頓', '`touchmove` 或 `wheel` 的監聽器不是被動的，瀏覽器每次都要等它', '不需要取消就寫 `{ passive: true }`'],
        ] },
        { type: 'list', items: [
          '只用一組指標事件；`pointerdown` 記下起點、設旗標、捕捉指標。',
          '`pointermove` 先看旗標，再用差值計算位置，並夾在範圍內。',
          '`pointerup` 提交，`pointercancel` 還原；兩條路都清掉旗標。',
          '在可拖曳的元素上宣告 `touch-action`，範圍只到那個元素。',
          '提供鍵盤操作與正確的角色，或直接用原生控制項。',
          '和捲動有關的監聽器，明確寫出 `passive` 是 `true` 還是 `false`。',
          '最後用滑鼠、鍵盤，以及一支真正的手機各操作一次。',
        ] },
        { type: 'p', text: '這一課只處理一支指標。兩指縮放、旋轉這類多指手勢，要同時追蹤好幾個 `pointerId`，各自記下位置再計算；HTML 的拖放 API（Drag and Drop）則是另一套用來在元素或應用程式之間搬資料的機制。兩者都不在這一課的範圍內。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob04-q1', prompt: '要新寫一個可以拖曳的元件，滑鼠、手指與觸控筆都要能操作。應該監聽哪一組事件？',
      options: [
        '`mousedown`、`mousemove`、`mouseup`：觸控裝置會把手指的移動自動轉成滑鼠事件',
        '`touchstart`、`touchmove`、`touchend`：滑鼠會被當成一根手指',
        '`pointerdown`、`pointermove`、`pointerup`，再加上 `pointercancel`',
        '滑鼠事件與觸控事件各登記一份，呼叫同一個處理函式',
      ],
      answer: 2,
      explanation: '指標事件把滑鼠、觸控與觸控筆都回報成同一組事件，用 `pointerType` 分辨，一份程式就涵蓋三種裝置；`pointercancel` 則處理被系統打斷的情況。手指按著移動時不會有 `mousemove`，瀏覽器只在點一下之後補發相容用的滑鼠事件，所以只聽滑鼠事件的拖曳在手機上拖不動；滑鼠也不會產生觸控事件，桌機瀏覽器甚至不一定提供它們。兩套都登記，同一個動作會被處理兩次。',
    },
    {
      id: 'mob04-q2', prompt: '這段程式想讓按鈕在手機與桌機上都能用。在手機上用手指點一下按鈕（沒有其他程式取消任何事件），`count` 通常會是多少？',
      code: { language: 'JavaScript', text: "let count = 0;\nconst add = () => {\n  count += 1;\n};\nbutton.addEventListener('touchstart', add);\nbutton.addEventListener('mousedown', add);" },
      options: [
        '1：觸控裝置上只會發生觸控事件',
        '2：觸控事件之後，瀏覽器還會補發相容用的滑鼠事件',
        '0：手指點一下只會觸發 `click`',
        '1：兩個監聽器登記的是同一個函式，瀏覽器會自動只執行一次',
      ],
      answer: 1,
      explanation: '手指點一下，先發生 `touchstart`；放開之後，瀏覽器為了讓只認得滑鼠的舊網頁也能用，會再補發一組相容用的滑鼠事件，其中包含 `mousedown`，所以 `add` 被呼叫兩次。同一個函式登記在兩種不同的事件上，是兩筆各自獨立的登記，不會合併成一次；`click` 也會發生，但那是另一個事件，和這兩個監聽器無關。改成只監聽 `pointerdown`，或把「點一下」交給 `click`，就只處理一次。',
    },
    {
      id: 'mob04-q3', prompt: '用滑鼠測試這個旋鈕時，還沒按下任何按鍵，游標只是滑過旋鈕，旋鈕就跟著跑。原因是什麼？',
      code: { language: 'JavaScript', text: "let startX = 0;\nlet startLeft = 0;\n\nknob.addEventListener('pointerdown', (event) => {\n  startX = event.clientX;\n  startLeft = knob.offsetLeft;\n});\n\nknob.addEventListener('pointermove', (event) => {\n  knob.style.left = startLeft + (event.clientX - startX) + 'px';\n});" },
      options: [
        '滑鼠沒有按下時移動也會觸發 `pointermove`，而監聽器沒有檢查現在是不是正在拖曳',
        '少了 `setPointerCapture`，所以旋鈕收到了別的元素的事件',
        '`pointermove` 只有觸控才會發生，滑鼠應該改聽 `mousemove`',
        '旋鈕沒有宣告 `touch-action: none`，瀏覽器把移動當成了捲動',
      ],
      answer: 0,
      explanation: '滑鼠是可以懸停的指標：不按任何按鍵，只要在元素上移動就會觸發 `pointermove`（這時 `buttons` 是 0）。這段程式每次 `pointermove` 都改位置，沒有一個「正在拖曳」的旗標，所以游標經過就會動。應該在 `pointerdown` 設旗標、在 `pointermove` 開頭檢查、在 `pointerup` 與 `pointercancel` 清掉。捕捉解決的是指標離開旋鈕後收不到事件，和這個症狀相反；`pointermove` 對滑鼠同樣有效；`touch-action` 只影響觸控時瀏覽器要不要接手。',
    },
    {
      id: 'mob04-q4', prompt: '拖曳的 `pointerdown` 監聽器裡有這一行。它的作用是什麼？',
      code: { language: 'JavaScript', text: 'knob.setPointerCapture(event.pointerId);' },
      options: [
        '告訴瀏覽器不要把這次觸控拿去捲動頁面',
        '讓 `pointermove` 只在指標按著的時候才發生',
        '讓其他手指的指標事件全部被忽略',
        '讓這支指標之後的事件都送到旋鈕，即使指標已經移到旋鈕外面',
      ],
      answer: 3,
      explanation: '指標捕捉把某一支指標後續的 `pointermove`、`pointerup`、`pointercancel` 固定送給捕捉它的元素，直到放開或被取消：拖快了指標跑出旋鈕，旋鈕照樣收得到移動，也一定收得到放開。不讓瀏覽器捲動是 CSS `touch-action` 的工作；滑鼠沒按下時的 `pointermove` 依然會發生，要靠拖曳旗標過濾；捕捉只針對 `pointerId` 指定的那一支指標，其他指標的事件不受影響。',
    },
    {
      id: 'mob04-q5', prompt: '使用者用手指拖著滑桿的旋鈕，拖到一半，系統打斷了這次觸控（例如切換到別的應用程式）。旋鈕接下來會收到什麼事件，程式應該怎麼處理？',
      options: [
        '`pointerup`：把旋鈕目前的位置當成結果存起來',
        '什麼都收不到：只能用計時器猜測拖曳是不是結束了',
        '`pointercancel`：把旋鈕放回按下時的位置，結束拖曳，不提交結果',
        '先收到 `pointercancel`，稍後還會有 `pointerup`：等 `pointerup` 再一起收尾',
      ],
      answer: 2,
      explanation: '指標被系統或瀏覽器打斷時，元素收到的是 `pointercancel`，之後這支指標不會再有任何事件，也沒有 `pointerup`，所以不能等 `pointerup` 才收尾。被打斷代表使用者並沒有決定最後的位置：應該還原到按下時記的起點、清掉拖曳旗標，而且不把半路的位置當成結果。把它當成 `pointerup` 處理，等於替使用者提交了一個他沒有選的值。',
    },
    {
      id: 'mob04-q6', prompt: '「加入購物車」按鈕按一下就加一份。這個處理程式應該登記在哪一個事件上？',
      options: [
        '`click`：手指點一下、滑鼠按一下、鍵盤的 Enter 或空白鍵都會觸發它',
        '`pointerdown`：它最早發生，反應最快',
        '`pointerup`：放開才算數，而且三種指標裝置都有',
        '`touchend`：手機上的點擊就是手指離開螢幕',
      ],
      answer: 0,
      explanation: '「點一下」的事件是 `click`：手指與滑鼠的點擊之後瀏覽器都會發出它，鍵盤啟動按鈕時更是只有 `click`、沒有任何指標事件。`pointerdown` 在按下的瞬間就發生，使用者沒有反悔的機會，手指只是碰到按鈕想捲動頁面也會觸發；`pointerup` 分不出指標是不是在同一個按鈕上按下的，鍵盤也用不了；`touchend` 只有觸控才有，滑鼠與鍵盤都被排除在外。指標事件留給需要過程的操作，例如拖曳。',
    },
    {
      id: 'mob04-q7', prompt: '`menu` 是一份可以捲動的清單。使用者在它上面滾動滑鼠滾輪時，會發生什麼事？',
      code: { language: 'JavaScript', text: "menu.addEventListener('wheel', (event) => {\n  event.preventDefault();\n  console.log(event.defaultPrevented);\n}, { passive: true });" },
      options: [
        '清單不會捲動，主控台印出 `true`',
        '清單照常捲動，主控台印出 `false`',
        '清單照常捲動，主控台印出 `true`',
        '呼叫 `preventDefault()` 的那一行丟出錯誤，監聽器在那裡中斷，後面的 `console.log` 不會執行',
      ],
      answer: 1,
      explanation: '`{ passive: true }` 是對瀏覽器的承諾：這個監聽器不會取消預設行為。瀏覽器因此不等它就開始捲動，而監聽器裡的 `preventDefault()` 被忽略，`event.defaultPrevented` 仍然是 `false`。忽略並不是錯誤：程式照常往下執行，所以 `console.log` 會印出 `false`。想要真的擋下捲動、得到 `true`，必須登記成 `{ passive: false }`，代價是瀏覽器每一次捲動前都要等這個監聽器跑完。',
    },
    {
      id: 'mob04-q8', prompt: '用指標事件寫的橫向滑桿，在桌機上用滑鼠拖曳一切正常。到了手機上，手指一拖旋鈕，頁面就跟著上下捲動，旋鈕還收到 `pointercancel`。正確的修法是哪一個？',
      options: [
        '在 `pointermove` 的監聽器裡呼叫 `event.preventDefault()`',
        '把 `pointermove` 的監聽器改成用 `{ passive: true }` 登記',
        '改成同時監聽 `mousemove` 與 `touchmove`',
        '在旋鈕的 CSS 宣告 `touch-action: none`',
      ],
      answer: 3,
      explanation: '手指一移動，瀏覽器就可能把這次觸控拿去捲動並送出 `pointercancel`。`touch-action` 是事先用 CSS 告訴瀏覽器，從這個元素開始的觸控不要由它處理；宣告 `none` 之後，移動會一直以 `pointermove` 送到旋鈕。指標事件的 `preventDefault()` 擋不住捲動，那是觸控事件 `touchmove` 的做法；`{ passive: true }` 是承諾不取消預設行為，方向正好相反；改回兩套事件則會帶回重複處理的問題，而且滑鼠事件在手指拖曳時根本不會發生。',
    },
  ],
  webCode: { examples, exercises },
};
