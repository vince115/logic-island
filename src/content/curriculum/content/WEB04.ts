import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB04 Forms and Native Validation (WEB-1). A web-code lesson with HTML only (one example adds two CSS rules to draw
 * the :valid/:invalid state): what a form sends (name=value pairs), label association, input types, choice controls
 * and grouping, native validation attributes, and keyboard operation. Every page is the made-up 小島圖書館 membership
 * form; every observed fact and every exercise verdict was run in Chromium. Checks never read a validation message,
 * and never rely on minlength/maxlength behaviour (those only apply to text a user typed, not to a value set by a step).
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const FIRST_FORM = `<form action="/cards" method="post">
  <p>
    <label for="reader">姓名</label>
    <input id="reader" name="reader" value="林小安">
  </p>
  <p>
    <label for="memo">備註</label>
    <input id="memo" value="這一欄沒有 name">
  </p>
  <p>
    <label><input type="checkbox" name="news"> 訂閱新書通知</label>
  </p>
  <button>送出申請</button>
</form>`;

const LABELS = `<form>
  <p>
    <label for="email">電子郵件</label>
    <input id="email" name="email" type="email">
  </p>
  <p>
    <label>手機號碼 <input name="phone"></label>
  </p>
  <p>
    <label><input type="checkbox" name="news" value="yes"> 訂閱新書通知</label>
  </p>
  <p>
    <input name="village" placeholder="居住的村里">
  </p>
  <button>送出</button>
</form>`;

const INPUT_TYPES = `<form>
  <p>
    <label for="reader">姓名</label>
    <input id="reader" name="reader" type="text">
  </p>
  <p>
    <label for="email">電子郵件</label>
    <input id="email" name="email" type="email">
  </p>
  <p>
    <label for="pin">密碼</label>
    <input id="pin" name="pin" type="password">
  </p>
  <p>
    <label for="books">想借幾本（1 到 5）</label>
    <input id="books" name="books" type="number" min="1" max="5" value="1">
  </p>
  <p>
    <label for="pickup">取書日期</label>
    <input id="pickup" name="pickup" type="date">
  </p>
  <button>送出</button>
</form>`;

const CHOICES = `<form>
  <fieldset>
    <legend>取書地點</legend>
    <label><input type="radio" name="branch" value="harbor" checked> 港口總館</label>
    <label><input type="radio" name="branch" value="hill"> 山丘分館</label>
  </fieldset>
  <p>
    <label for="lang">通知語言</label>
    <select id="lang" name="lang">
      <option value="zh">中文</option>
      <option value="en">English</option>
    </select>
  </p>
  <p>
    <label><input type="checkbox" name="news" value="yes"> 訂閱新書通知</label>
  </p>
  <p>
    <label for="memo">想對館員說的話</label>
    <textarea id="memo" name="memo" rows="3"></textarea>
  </p>
  <button type="submit">送出</button>
  <button type="button" id="help">這顆按鈕不會送出</button>
</form>`;

const VALIDATION = `<form>
  <p>
    <label for="reader">姓名（必填，2 到 20 個字）</label>
    <input id="reader" name="reader" required minlength="2" maxlength="20">
  </p>
  <p>
    <label for="email">電子郵件（必填）</label>
    <input id="email" name="email" type="email" required>
  </p>
  <p>
    <label for="card">舊借書證號（選填，2 個大寫英文字母加 4 個數字）</label>
    <input id="card" name="card" pattern="[A-Z]{2}[0-9]{4}"
      title="2 個大寫英文字母加 4 個數字，例如 AB1234">
  </p>
  <button>送出</button>
</form>`;
const VALIDATION_CSS = `input:valid {
  border: 2px solid seagreen;
}
input:invalid {
  border: 2px solid crimson;
}`;

const examples: WebExample[] = [
  {
    id: 'web04-first-form', title: '一張最小的表單：借書證申請',
    description: '`<form>` 包住三個控制項與一顆送出按鈕。按下「送出申請」，看預覽下方記錄到的資料：只有有 `name` 的控制項才在裡面。',
    files: { html: FIRST_FORM },
    observe: [
      { check: 'count', selector: 'form input[name]', count: 2, label: '三個 `input` 裡只有 2 個有 `name`：姓名與核取方塊' },
      { do: 'click', selector: 'form button' },
      { check: 'submitted', count: 1, label: '按下「送出申請」，表單送出一次' },
      { check: 'submitted', data: { reader: '林小安' }, label: '送出的資料只有 `reader=林小安`：沒有 `name` 的備註欄、沒勾選的核取方塊都不在裡面' },
      { do: 'check', selector: 'input[name="news"]', checked: true },
      { do: 'click', selector: 'form button' },
      { check: 'submitted', data: { reader: '林小安', news: 'on' }, label: '勾選核取方塊再送出，資料多了 `news=on`（沒有寫 `value` 時，勾選的值是 `on`）' },
    ],
  },
  {
    id: 'web04-labels', title: '兩種 label 寫法，和一個只有 placeholder 的欄位',
    description: '電子郵件用 `for` 對到 `id`；手機號碼與核取方塊被包在 `<label>` 裡；最後一欄只有 `placeholder`。點點看每一段文字，再在最後一欄打幾個字。',
    files: { html: LABELS },
    observe: [
      { check: 'label', selector: '#email', text: '電子郵件', label: '`for="email"` 對到 `id="email"`：這個欄位的 label 是「電子郵件」' },
      { check: 'label', selector: 'input[name="phone"]', text: '手機號碼', label: '包在 `<label>` 裡的欄位不需要 `for` 與 `id`，label 是「手機號碼」' },
      { do: 'click', selector: 'label[for="email"]' },
      { check: 'focus', selector: '#email', label: '點擊「電子郵件」這幾個字，焦點就進入它的輸入欄位' },
      { do: 'click', selector: 'label:has(input[name="news"])' },
      { check: 'value', selector: 'input[name="news"]', value: true, label: '點擊「訂閱新書通知」這幾個字，核取方塊就被勾選' },
      { check: 'count', selector: 'label', count: 3, label: '頁面只有 3 個 `label`：最後一欄的說明只寫在 `placeholder` 裡，沒有 label' },
    ],
  },
  {
    id: 'web04-input-types', title: '五種輸入類型',
    description: '同一個 `<input>`，換了 `type` 就是不同的控制項。試著在電子郵件欄位輸入沒有 `@` 的文字、把借書數量改成 9，再按送出。',
    files: { html: INPUT_TYPES },
    observe: [
      { do: 'input', selector: '#email', value: '小安' },
      { check: 'count', selector: 'input:invalid', count: 1, label: '電子郵件欄位填入「小安」（沒有 `@`）：它成為唯一不合格（`:invalid`）的欄位' },
      { do: 'input', selector: '#email', value: 'an@example.com' },
      { do: 'input', selector: '#books', value: '9' },
      { check: 'count', selector: '#books:invalid', count: 1, label: '借書數量填 9，超過 `max="5"`：數字欄位不合格' },
      { do: 'click', selector: 'form button' },
      { check: 'submitted', count: 0, label: '有欄位不合格時按送出，表單沒有送出' },
      { do: 'input', selector: '#books', value: '2' },
      { do: 'input', selector: '#pin', value: 'island42' },
      { do: 'input', selector: '#pickup', value: '2026-12-24' },
      { do: 'click', selector: 'form button' },
      { check: 'submitted', data: { reader: '', email: 'an@example.com', pin: 'island42', books: '2', pickup: '2026-12-24' },
        label: '都合格後送出：密碼送出的是原本的文字 `island42`，日期是 `2026-12-24`，沒填的姓名也送出了空值' },
    ],
  },
  {
    id: 'web04-choices', title: '選項按鈕、下拉選單、核取方塊、多行文字與兩種按鈕',
    description: '兩個 radio 的 `name` 都是 `branch`，所以只能選一個；`<fieldset>` 與 `<legend>` 為這一組加上題目。兩顆按鈕的 `type` 不同，按下去的結果也不同。',
    files: { html: CHOICES },
    observe: [
      { do: 'check', selector: 'input[value="hill"]', checked: true },
      { check: 'value', selector: 'input[value="harbor"]', value: false, label: '選了「山丘分館」，同一個 `name` 的「港口總館」就自動取消' },
      { do: 'click', selector: '#help' },
      { check: 'submitted', count: 0, label: '按下 `type="button"` 的按鈕，表單沒有送出' },
      { do: 'click', selector: 'button[type="submit"]' },
      { check: 'submitted', data: { branch: 'hill', lang: 'zh', memo: '' }, label: '按下送出：資料是 `branch=hill`、`lang=zh` 與空的 `memo`；沒勾選的核取方塊不在裡面' },
      { do: 'key', selector: 'input[name="news"]', key: ' ' },
      { check: 'value', selector: 'input[name="news"]', value: true, label: '焦點在核取方塊上時按空白鍵，它就被勾選' },
      { do: 'select', selector: '#lang', value: 'en' },
      { do: 'click', selector: 'button[type="submit"]' },
      { check: 'submitted', data: { branch: 'hill', lang: 'en', news: 'yes', memo: '' }, label: '改選 English 再送出：`lang` 是選中那個 `option` 的 `value`（`en`），並多了 `news=yes`' },
    ],
  },
  {
    id: 'web04-validation', title: '原生驗證：必填、格式與狀態',
    description: '規則都寫在屬性裡。兩行 CSS 把狀態畫出來：合格（`:valid`）是綠框，不合格（`:invalid`）是紅框。先直接按送出，再一欄一欄填。',
    files: { html: VALIDATION, css: VALIDATION_CSS },
    observe: [
      { check: 'count', selector: 'input:invalid', count: 2, label: '一載入就有 2 個欄位不合格：兩個必填欄位都空著（選填的借書證號空著不算錯）' },
      { do: 'click', selector: 'form button' },
      { check: 'submitted', count: 0, label: '必填欄位空著時按送出，表單沒有送出' },
      { do: 'input', selector: '#reader', value: '林小安' },
      { do: 'input', selector: '#email', value: 'an@example.com' },
      { do: 'input', selector: '#card', value: 'ab12' },
      { check: 'count', selector: 'input:invalid', count: 1, label: '姓名與電子郵件填好、借書證號填 `ab12`：只剩借書證號不合格（不符合 `pattern`）' },
      { do: 'key', selector: '#card', key: 'Enter' },
      { check: 'submitted', count: 0, label: '在欄位裡按 Enter 也會先驗證：格式不對，沒有送出' },
      { do: 'input', selector: '#card', value: 'AB1234' },
      { do: 'key', selector: '#card', key: 'Enter' },
      { check: 'submitted', count: 1, data: { reader: '林小安', email: 'an@example.com', card: 'AB1234' }, label: '借書證號改成 `AB1234` 後按 Enter，表單送出一次，三個欄位都在資料裡' },
    ],
  },
];

// ---- exercises --------------------------------------------------------------------------------------------------
const exercises: WebExercise[] = [
  {
    id: 'web04-x-labels', title: '把說明文字變成真正的 label',
    statement: '這張表單的兩個欄位都還沒有 `label`：「姓名」只是一段普通的文字，電子郵件只有 `placeholder`。請讓 `name="reader"` 的欄位有 label「姓名」、`name="email"` 的欄位有 label「電子郵件」。用 `for` 配 `id`，或把欄位包在 `<label>` 裡都可以；兩個欄位的 `name` 與 `type` 不要改。',
    hints: [
      '說明文字要放在 `<label>` 元素裡，而且要讓瀏覽器知道它屬於哪一個欄位。',
      '`for` 指向的是欄位的 `id`。這兩個欄位目前只有 `name`，還沒有 `id`。',
      '例如 `<label for="reader">姓名</label>` 配上有 `id="reader"` 的 `<input>`；電子郵件欄位照樣再做一次。',
    ],
    explanation: '每個欄位都有一個 `<label>`，而且 `for` 的值和欄位的 `id` 完全相同，瀏覽器才知道這段文字是哪個欄位的名稱：點文字會把焦點帶進欄位，螢幕閱讀器也會唸出它。`placeholder` 可以留著當填寫範例，但欄位的名稱要寫在 label 裡。',
    starter: { html: `<form>
  <p>
    <span>姓名</span>
    <input name="reader">
  </p>
  <p>
    <input name="email" type="email" placeholder="電子郵件">
  </p>
  <button>送出</button>
</form>` },
    solution: { html: `<form>
  <p>
    <label for="reader">姓名</label>
    <input id="reader" name="reader">
  </p>
  <p>
    <label for="email">電子郵件</label>
    <input id="email" name="email" type="email" placeholder="name@example.com">
  </p>
  <button>送出</button>
</form>` },
    steps: [
      { check: 'count', selector: 'label', count: 2, op: 'min', label: '頁面至少有 2 個 `label` 元素' },
      { check: 'label', selector: 'input[name="reader"]', text: '姓名', match: 'includes', label: '`name="reader"` 的欄位有 label，文字包含「姓名」' },
      { check: 'label', selector: 'input[name="email"]', text: '電子郵件', match: 'includes', label: '`name="email"` 的欄位有 label，文字包含「電子郵件」' },
      { check: 'attr', selector: 'input[name="email"]', name: 'type', value: 'email', label: '電子郵件欄位的 `type` 仍然是 `email`' },
    ],
    mistakes: [
      { files: { html: `<form>
  <p>
    <label for="reader">姓名</label>
    <input name="reader">
  </p>
  <p>
    <label for="email">電子郵件</label>
    <input name="email" type="email">
  </p>
  <button>送出</button>
</form>` }, why: '`for` 要對到欄位的 `id`，不是 `name`。欄位只有 `name`、沒有 `id` 時，`label` 找不到對象：點文字沒有反應，欄位也仍然沒有名稱。' },
      { files: { html: `<form>
  <p>
    <label>姓名</label>
    <input id="reader" name="reader">
  </p>
  <p>
    <label>電子郵件</label>
    <input id="email" name="email" type="email">
  </p>
  <button>送出</button>
</form>` }, why: '只把 `<label>` 擺在欄位旁邊不算關聯。要用 `for` 指向欄位的 `id`，或是把欄位包進 `<label>` 裡面。' },
    ],
  },
  {
    id: 'web04-x-types', title: '讓瀏覽器擋下填錯的會員表單',
    statement: '三個欄位現在都是 `type="text"`，空著也送得出去。請只修改 `<input>` 的屬性：`#email` 改成電子郵件類型並設為必填；`#pin` 改成密碼類型並設為必填；`#books` 改成數字類型，只接受 1 到 5。`id` 與 `name` 不要改。檢查會先送出空白的表單、再填入沒有 `@` 的電子郵件、再把數量填成 9（這三次都不應該送出），最後填入正確的資料（應該送出一次）。',
    hints: [
      '輸入類型寫在 `type` 屬性；必填是另一個獨立的屬性。',
      '`type="email"` 只檢查有填的內容，空著不算錯，所以還要加 `required`。數字的範圍用 `min` 與 `max`。',
      '`#books` 要寫成 `type="number" min="1" max="5"`；`min`、`max` 寫在 `type="text"` 上不會有任何作用。',
    ],
    explanation: '`required` 擋下空白，`type="email"` 擋下沒有 `@` 的內容，`type="number"` 加上 `min`、`max` 擋下範圍外的數字；`type="password"` 則讓輸入的字不顯示在畫面上。每個屬性各管一件事，所以「必填而且格式要對」的欄位兩個屬性都要寫。',
    starter: { html: `<form>
  <p>
    <label for="email">電子郵件</label>
    <input id="email" name="email" type="text">
  </p>
  <p>
    <label for="pin">密碼</label>
    <input id="pin" name="pin" type="text">
  </p>
  <p>
    <label for="books">想借幾本（1 到 5）</label>
    <input id="books" name="books" type="text">
  </p>
  <button>加入會員</button>
</form>` },
    solution: { html: `<form>
  <p>
    <label for="email">電子郵件</label>
    <input id="email" name="email" type="email" required>
  </p>
  <p>
    <label for="pin">密碼</label>
    <input id="pin" name="pin" type="password" required>
  </p>
  <p>
    <label for="books">想借幾本（1 到 5）</label>
    <input id="books" name="books" type="number" min="1" max="5">
  </p>
  <button>加入會員</button>
</form>` },
    steps: [
      { check: 'attr', selector: '#pin', name: 'type', value: 'password', label: '密碼欄位是密碼類型（輸入的字不顯示在畫面上）' },
      { do: 'click', selector: 'form button' },
      { check: 'submitted', count: 0, label: '欄位都空著時按送出，表單沒有送出' },
      { do: 'input', selector: '#email', value: '小安' },
      { do: 'input', selector: '#pin', value: 'island42' },
      { do: 'input', selector: '#books', value: '2' },
      { do: 'click', selector: 'form button' },
      { check: 'submitted', count: 0, label: '電子郵件填「小安」（沒有 `@`）時，表單沒有送出' },
      { do: 'input', selector: '#email', value: 'an@example.com' },
      { do: 'input', selector: '#books', value: '9' },
      { do: 'click', selector: 'form button' },
      { check: 'submitted', count: 0, label: '借書數量填 9（超過 5）時，表單沒有送出' },
      { do: 'input', selector: '#books', value: '2' },
      { do: 'click', selector: 'form button' },
      { check: 'submitted', count: 1, data: { email: 'an@example.com', pin: 'island42', books: '2' }, label: '資料都正確時送出一次，資料是 `email`、`pin` 與 `books` 三個欄位' },
    ],
    mistakes: [
      { files: { html: `<form>
  <p>
    <label for="email">電子郵件</label>
    <input id="email" name="email" type="email">
  </p>
  <p>
    <label for="pin">密碼</label>
    <input id="pin" name="pin" type="password">
  </p>
  <p>
    <label for="books">想借幾本（1 到 5）</label>
    <input id="books" name="books" type="number" min="1" max="5">
  </p>
  <button>加入會員</button>
</form>` }, why: '只改了 `type`、沒有加 `required`。`type="email"` 只檢查有填的內容，空著的欄位算合格，所以整張空白的表單照樣送得出去。' },
      { files: { html: `<form>
  <p>
    <label for="email">電子郵件</label>
    <input id="email" name="email" type="email" required>
  </p>
  <p>
    <label for="pin">密碼</label>
    <input id="pin" name="pin" type="password" required>
  </p>
  <p>
    <label for="books">想借幾本（1 到 5）</label>
    <input id="books" name="books" type="text" min="1" max="5">
  </p>
  <button>加入會員</button>
</form>` }, why: '`min` 與 `max` 只對 `number`、`date` 這類有大小的類型有作用。數量欄位還是 `type="text"`，9 就只是一個字，不會被擋下。' },
    ],
  },
  {
    id: 'web04-x-choices', title: '取書地點與新書通知',
    statement: '頁面上有兩個選項按鈕（`#harbor`、`#hill`）與一個核取方塊（`#news`），但它們都沒有 `name` 與 `value`：兩個地點可以同時選，送出時也沒有任何資料。請讓兩個選項按鈕成為同一組：`name` 都是 `branch`，`value` 分別是 `harbor`（港口總館）與 `hill`（山丘分館）；核取方塊的 `name` 是 `news`、`value` 是 `yes`。三個控制項的 `id` 不要改。',
    hints: [
      '選項按鈕靠同一個 `name` 才會變成「只能選一個」的一組。',
      '`name` 決定資料的名稱，`value` 決定被選中時送出的值。兩個 radio 的 `name` 相同、`value` 不同。',
      '例如 `<input type="radio" id="hill" name="branch" value="hill">`；核取方塊加上 `name="news" value="yes"`。',
    ],
    explanation: '`name` 相同的選項按鈕是同一組，選了一個，另一個自動取消；送出的是被選中那一個的 `value`，所以每個選項要有自己的 `value`。核取方塊有了 `name` 與 `value`，勾選時送出 `news=yes`，沒勾選時完全不送。',
    starter: { html: `<form>
  <fieldset>
    <legend>取書地點</legend>
    <label><input type="radio" id="harbor"> 港口總館</label>
    <label><input type="radio" id="hill"> 山丘分館</label>
  </fieldset>
  <p>
    <label><input type="checkbox" id="news"> 訂閱新書通知</label>
  </p>
  <button>送出</button>
</form>` },
    solution: { html: `<form>
  <fieldset>
    <legend>取書地點</legend>
    <label><input type="radio" id="harbor" name="branch" value="harbor"> 港口總館</label>
    <label><input type="radio" id="hill" name="branch" value="hill"> 山丘分館</label>
  </fieldset>
  <p>
    <label><input type="checkbox" id="news" name="news" value="yes"> 訂閱新書通知</label>
  </p>
  <button>送出</button>
</form>` },
    steps: [
      { check: 'count', selector: 'input[type="radio"][name="branch"]', count: 2, label: '兩個選項按鈕的 `name` 都是 `branch`' },
      { do: 'check', selector: '#harbor', checked: true },
      { do: 'check', selector: '#hill', checked: true },
      { check: 'value', selector: '#harbor', value: false, label: '先選港口總館、再選山丘分館之後，港口總館自動取消' },
      { do: 'click', selector: 'form button' },
      { check: 'submitted', data: { branch: 'hill' }, label: '這時送出的資料只有 `branch=hill`' },
      { do: 'check', selector: '#news', checked: true },
      { do: 'check', selector: '#harbor', checked: true },
      { do: 'click', selector: 'form button' },
      { check: 'submitted', data: { branch: 'harbor', news: 'yes' }, label: '勾選通知、改選港口總館再送出，資料是 `branch=harbor` 與 `news=yes`' },
    ],
    mistakes: [
      { files: { html: `<form>
  <fieldset>
    <legend>取書地點</legend>
    <label><input type="radio" id="harbor" name="branch"> 港口總館</label>
    <label><input type="radio" id="hill" name="branch"> 山丘分館</label>
  </fieldset>
  <p>
    <label><input type="checkbox" id="news" name="news"> 訂閱新書通知</label>
  </p>
  <button>送出</button>
</form>` }, why: '只寫了 `name`、沒有寫 `value`。沒有 `value` 的選項按鈕與核取方塊被選中時送出的值都是 `on`，伺服器只收到 `branch=on`，分不出選的是哪一個地點。' },
      { files: { html: `<form>
  <fieldset>
    <legend>取書地點</legend>
    <label><input type="radio" id="harbor" name="harbor" value="harbor"> 港口總館</label>
    <label><input type="radio" id="hill" name="hill" value="hill"> 山丘分館</label>
  </fieldset>
  <p>
    <label><input type="checkbox" id="news" name="news" value="yes"> 訂閱新書通知</label>
  </p>
  <button>送出</button>
</form>` }, why: '把兩個選項按鈕的 `name` 寫成各自的名字，它們就是兩個各自獨立的組：兩個可以同時選中，而且選了之後無法取消。同一題的選項要用同一個 `name`。' },
    ],
  },
  {
    id: 'web04-x-signup', title: '完成小島圖書館的入會表單',
    statement: '完成 `id="join"` 的入會表單（第一個欄位「姓名」已經寫好，可以照著它的寫法）。請再加上：（1）電子郵件欄位：`name="email"`，電子郵件類型，必填，label 是「電子郵件」；（2）會員類型：`name="plan"` 的下拉選單，兩個選項的 `value` 是 `adult`（一般）與 `student`（學生）；（3）一個核取方塊：`name="agree"`、`value="yes"`，一定要勾選才能送出，label 是「我同意借閱規則」；（4）一顆送出按鈕。除了這些，不要再加其他有 `name` 的控制項。',
    hints: [
      '一樣一樣來：每個控制項都要有 `name` 與 label，再想它需要哪些驗證屬性。',
      '下拉選單是 `<select name="plan">` 裡面放兩個 `<option value="…">`；「一定要勾選」就是在核取方塊上加 `required`。',
      '核取方塊可以寫成 `<label><input type="checkbox" name="agree" value="yes" required> 我同意借閱規則</label>`；最後在 `</form>` 之前放一顆 `<button>`。',
    ],
    explanation: '四個控制項都有 `name`，所以都會出現在送出的資料裡；每個都有 label，點文字就能操作，螢幕閱讀器也唸得出名稱。`required` 讓姓名、電子郵件與同意規則缺一不可，`type="email"` 再檢查格式；`<option>` 的 `value` 是伺服器收到的值，畫面上的「一般」「學生」只是給人看的文字。',
    starter: { html: `<h1>加入小島圖書館</h1>
<form id="join">
  <p>
    <label for="reader">姓名</label>
    <input id="reader" name="reader" required>
  </p>
  <!-- 從這裡繼續：電子郵件、會員類型、同意借閱規則、送出按鈕 -->
</form>` },
    solution: { html: `<h1>加入小島圖書館</h1>
<form id="join">
  <p>
    <label for="reader">姓名</label>
    <input id="reader" name="reader" required>
  </p>
  <p>
    <label for="email">電子郵件</label>
    <input id="email" name="email" type="email" required>
  </p>
  <p>
    <label for="plan">會員類型</label>
    <select id="plan" name="plan">
      <option value="adult">一般</option>
      <option value="student">學生</option>
    </select>
  </p>
  <p>
    <label><input type="checkbox" name="agree" value="yes" required> 我同意借閱規則</label>
  </p>
  <button>送出申請</button>
</form>` },
    steps: [
      { check: 'label', selector: '#join [name="email"]', text: '電子郵件', match: 'includes', label: '`name="email"` 的欄位有 label，文字包含「電子郵件」' },
      { check: 'label', selector: '#join [name="agree"]', text: '我同意借閱規則', match: 'includes', label: '`name="agree"` 的核取方塊有 label，文字包含「我同意借閱規則」' },
      { check: 'count', selector: '#join input:invalid', count: 3, label: '還沒填寫時，姓名、電子郵件、同意規則這 3 個控制項都不合格（都是必填）' },
      { do: 'input', selector: '#join [name="reader"]', value: '林小安' },
      { do: 'input', selector: '#join [name="email"]', value: '小安' },
      { do: 'select', selector: '#join [name="plan"]', value: 'student' },
      { do: 'check', selector: '#join [name="agree"]', checked: true },
      { do: 'click', selector: '#join button:not([type="button"])' },
      { check: 'submitted', count: 0, label: '電子郵件填「小安」（沒有 `@`）時，表單沒有送出' },
      { do: 'input', selector: '#join [name="email"]', value: 'an@example.com' },
      { do: 'check', selector: '#join [name="agree"]', checked: false },
      { do: 'click', selector: '#join button:not([type="button"])' },
      { check: 'submitted', count: 0, label: '取消勾選同意規則時，表單沒有送出' },
      { do: 'check', selector: '#join [name="agree"]', checked: true },
      { do: 'click', selector: '#join button:not([type="button"])' },
      { check: 'submitted', count: 1, data: { reader: '林小安', email: 'an@example.com', plan: 'student', agree: 'yes' }, label: '都填好之後送出一次，資料是 `reader`、`email`、`plan=student` 與 `agree=yes`' },
    ],
    mistakes: [
      { files: { html: `<h1>加入小島圖書館</h1>
<form id="join">
  <p>
    <label for="reader">姓名</label>
    <input id="reader" name="reader" required>
  </p>
  <p>
    <label for="email">電子郵件</label>
    <input id="email" name="email" type="email" required>
  </p>
  <p>
    <label for="plan">會員類型</label>
    <select id="plan" name="plan">
      <option value="adult">一般</option>
      <option value="student">學生</option>
    </select>
  </p>
  <p>
    <label><input type="checkbox" name="agree" value="yes"> 我同意借閱規則</label>
  </p>
  <button>送出申請</button>
</form>` }, why: '核取方塊沒有 `required`，不勾選也送得出去，而且送出的資料裡根本沒有 `agree`，伺服器無從得知使用者是否同意。' },
      { files: { html: `<h1>加入小島圖書館</h1>
<form id="join">
  <p>
    <label for="reader">姓名</label>
    <input id="reader" name="reader" required>
  </p>
  <p>
    <label for="email">電子郵件</label>
    <input id="email" name="email" type="email" required>
  </p>
  <p>
    <label for="plan">會員類型</label>
    <select id="plan" name="plan">
      <option>一般</option>
      <option>學生</option>
    </select>
  </p>
  <p>
    <label><input type="checkbox" name="agree" value="yes" required> 我同意借閱規則</label>
  </p>
  <button>送出申請</button>
</form>` }, why: '`<option>` 沒有寫 `value` 時，送出的是它顯示的文字（`plan=學生`），而不是題目要求的 `student`。畫面上的文字哪天改了，伺服器收到的值也跟著變，所以要另外寫 `value`。' },
    ],
  },
];

// ---- the lesson -------------------------------------------------------------------------------------------------
export const WEB04: LessonContent = {
  lessonId: 'WEB04',
  motivation: '登入、搜尋、報名、結帳：使用者要把資料交給網站，靠的都是表單。這一課只用 HTML 就做出每個欄位都有 `label`、只靠鍵盤也能填完的表單，並讓瀏覽器在送出之前先擋下漏填與格式不對的資料。',
  sections: [
    {
      id: 'web04-s-what-is-sent', title: '表單把什麼送出去',
      blocks: [
        { type: 'p', text: '前三課的頁面都是給人「看」的：文字、連結、圖片。表單（form）則是讓使用者把資料交回給網站。一張表單由三種東西組成：`<form>` 元素把相關的欄位包成一組；裡面的控制項（control，也就是 `<input>`、`<select>`、`<textarea>` 這些表單元素）讓使用者填寫或選擇；送出按鈕 `<button>` 讓使用者告訴瀏覽器「填好了」。' },
        { type: 'p', text: '按下送出時，瀏覽器把表單裡的控制項整理成一組「名稱=值」的資料。名稱來自控制項的 `name` 屬性，值是使用者填的或選的內容。先記住三件事，初學者最常在這裡出錯：' },
        { type: 'list', items: [
          '有 `name` 的控制項才會送出。沒有 `name` 的欄位，不管使用者填了什麼，伺服器都收不到。',
          '核取方塊（checkbox）只有勾選時才送出。沒勾選就完全不出現在資料裡，而不是送出「否」。',
          '`id` 是給頁面內部用的（下一節的 `label` 要靠它），不會被送出；`name` 才是資料的名稱。兩者常常寫成一樣的字，但作用不同。',
        ] },
        { type: 'example', id: 'web04-first-form' },
        { type: 'p', text: '範例是小島圖書館的借書證申請。直接按「送出申請」，預覽下方會出現「表單送出了（POST /cards）：reader=林小安」。備註欄明明有內容，卻不在裡面，因為它沒有 `name`；核取方塊沒勾選，所以也沒有 `news`。勾選之後再送一次，資料多了 `news=on`：沒有寫 `value` 的核取方塊，勾選時的值就是 `on`，第四節會幫它取一個有意義的值。' },
        { type: 'p', text: '`<form>` 上的 `action` 是資料要送去的網址，`method` 是送的方式：沒寫時是 `get`，資料會接在網址後面，適合搜尋；報名、登入這類表單用 `post`。這裡的預覽不會把資料送到任何地方，只把送出的內容記錄下來、顯示在頁面下方，所以可以放心反覆按。' },
        { type: 'callout', tone: 'warning', title: '忘了 `name`，資料就不見了', text: '表單看起來完全正常，也按得下去，伺服器收到的資料卻少了一欄：原因幾乎都是那個控制項沒有 `name`，或是只寫了 `id`。做完表單先送出一次，對照預覽下方列出的資料，每個要收的欄位都應該出現在裡面。' },
      ],
    },
    {
      id: 'web04-s-label-association', title: '用 label 關聯每一個欄位',
      blocks: [
        { type: 'p', text: '輸入欄位本身只是一個空框，使用者得知道這一格要填什麼。把說明文字寫成 `<p>` 或直接擺在旁邊，眼睛看得懂，瀏覽器卻不知道那段字和哪個欄位有關。`<label>` 就是用來建立這個關係的元素，這件事叫做 label 關聯，有兩種寫法：' },
        { type: 'list', items: [
          '用 `for` 指向欄位的 `id`：`<label for="email">電子郵件</label>` 配上 `<input id="email">`。`for` 的值要和 `id` 一字不差（大小寫也算），而且同一頁的 `id` 不能重複。',
          '把欄位包在 `<label>` 裡面：`<label>手機號碼 <input name="phone"></label>`。這樣不需要 `for` 與 `id`。',
        ] },
        { type: 'p', text: '關聯之後有兩個好處。第一，點擊 label 的文字就等於點擊欄位：文字欄位會取得焦點（focus，也就是目前接收鍵盤輸入的那個元素），核取方塊會被勾選。核取方塊只有一個小方格，在手機上不容易點中，有了 label，整段文字都能點。第二，螢幕閱讀器（screen reader）把焦點移到欄位時會唸出它的 label，看不見畫面的人才知道這一格要填什麼。' },
        { type: 'example', id: 'web04-labels' },
        { type: 'p', text: '在範例裡點「電子郵件」「手機號碼」「訂閱新書通知」這幾段文字，觀察輸入游標跑到哪一格、核取方塊有沒有被勾選。再看最後一欄：它只有 `placeholder`，也就是欄位空著時顯示的灰色提示字。在裡面打幾個字，提示就消失了；填到一半回頭檢查時，已經看不出這一格原本要填什麼。打開「瀏覽器建立的 DOM 樹」也看得到，這個 `input` 的前後沒有任何 `label`。' },
        { type: 'callout', tone: 'warning', title: '`placeholder` 不是 label', text: '`placeholder` 適合放填寫範例（例如 `name@example.com`），不適合當欄位的名稱：一開始輸入它就消失，顏色通常也比較淡、不容易讀。每個欄位都要有真正的 `<label>`，`placeholder` 最多當補充。' },
        { type: 'callout', tone: 'tip', title: '`for` 對的是 `id`，不是 `name`', text: '`<label for="email">` 找的是 `id="email"` 的元素。欄位如果只有 `name="email"`、沒有 `id`，畫面上看不出任何差別，但點文字不會有反應。寫完之後點一下每個 label 的文字，是最快的檢查方法。' },
      ],
    },
    {
      id: 'web04-s-input-types', title: '選對輸入類型',
      blocks: [
        { type: 'p', text: '`<input>` 靠 `type` 屬性變成不同的控制項；沒寫 `type` 時是 `text`，什麼字都能打。選對輸入類型（input type）有三個好處：瀏覽器會幫忙檢查格式；手機通常會換成適合的螢幕鍵盤，例如數字鍵盤；瀏覽器還會提供現成的介面，例如日期選擇器。先看五種讓使用者「輸入」的類型：' },
        { type: 'table', head: ['`type`', '用在哪裡', '瀏覽器幫你做的事'], rows: [
          ['`text`', '姓名、書名這類一般的單行文字', '不檢查內容'],
          ['`email`', '電子郵件地址', '有填寫時檢查格式：至少要有 `@`，而且前後都有內容'],
          ['`password`', '密碼', '遮住輸入的字，畫面上只看到圓點之類的符號'],
          ['`number`', '數量、年齡這類可以加減的數字', '只接受數字；可以用 `min`、`max`、`step` 限制範圍與間距'],
          ['`date`', '日期', '提供選日期的介面；送出的值固定是「年-月-日」，例如 `2026-12-24`'],
        ] },
        { type: 'example', id: 'web04-input-types' },
        { type: 'p', text: '在範例的電子郵件欄位輸入「小安」再按送出：瀏覽器會擋下來並顯示提示，因為裡面沒有 `@`。借書數量設了 `min="1"` 與 `max="5"`，改成 9 再送出，同樣被擋。`step` 是相鄰兩個合格數字的間距，沒寫時是 1，所以 2.5 也會被擋；要接受 1.5、2.5 這樣的小數就寫 `step="0.5"`。日期欄位在畫面上的寫法會隨使用者的語言設定而不同，但送出的 `pickup` 一律是 `2026-12-24` 這種格式，伺服器不必猜。' },
        { type: 'callout', tone: 'warning', title: '`password` 只是遮住畫面', text: '`type="password"` 的作用是不讓旁邊的人看到你打的字。送出的仍然是原本的文字，在這個預覽下方的送出紀錄就看得到 `pin=` 後面的內容。密碼在網路上傳送時的保護靠的是 HTTPS，那是計算機網路島的主題。' },
        { type: 'callout', tone: 'tip', title: '由數字組成的資料，不一定用 `number`', text: '`number` 是給「數量」用的：可以加一、減一、比大小。電話、郵遞區號、借書證號雖然都是數字，卻不是數量；用了 `number`，使用者在欄位裡按到方向鍵的上或下，號碼就被加一或減一。這類資料請用 `text`。' },
      ],
    },
    {
      id: 'web04-s-choice-controls', title: '用選的不用打的：選項、分組與按鈕',
      blocks: [
        { type: 'p', text: '不是所有資料都適合讓使用者自己打字。「取書地點」只有兩個答案，讓人打字只會收到「港口」「總館」「港口總館」各種寫法；給選項讓人選，資料才整齊。常用的有四種表單元素：' },
        { type: 'table', head: ['控制項', '什麼時候用', '送出的資料'], rows: [
          ['`<input type="checkbox">` 核取方塊', '可以勾、也可以不勾；每一個各自獨立', '勾選時送出它的 `name` 與 `value`；沒勾選不送'],
          ['`<input type="radio">` 選項按鈕', '幾個選項裡只能選一個', '被選中那一個的 `name` 與 `value`'],
          ['`<select>` 與 `<option>` 下拉選單', '選項比較多，或想節省版面', '`select` 的 `name` 與被選中 `option` 的 `value`'],
          ['`<textarea>` 多行文字', '留言、備註這類比較長的文字', '`name` 與輸入的文字'],
        ] },
        { type: 'p', text: '選項按鈕（radio button）靠 `name` 分組：`name` 相同的是同一組，選了一個，同組的另一個就自動取消。每個選項要有自己的 `value`，伺服器才分得出選的是哪一個；想預先選好一項，就在它身上加 `checked`。一組選項需要一個共同的題目，用 `<fieldset>` 把它們包起來，再用 `<legend>` 當第一個子元素寫上題目（「取書地點」）；螢幕閱讀器進入這一組時會把題目唸出來。' },
        { type: 'example', id: 'web04-choices' },
        { type: 'p', text: '選「山丘分館」，港口總館的選取就消失。按「送出」後看預覽下方：`branch=hill`、`lang=zh`、`memo=`，沒有 `news`。文字類的欄位即使沒填也會送出空值，沒勾選的核取方塊則整個不見。`<option>` 的 `value` 是送出的值，標籤之間的文字（「中文」）是給人看的；沒寫 `value` 時，送出的就是那段文字。`<textarea>` 沒有 `value` 屬性，預設內容寫在開始與結束標籤之間。' },
        { type: 'p', text: '`<button>` 也有 `type`。`type="submit"` 會送出表單；`type="button"` 按了什麼都不做，是留給之後的 JavaScript 用的。範例的第二顆按鈕就是 `type="button"`，怎麼按都不會出現送出紀錄。' },
        { type: 'callout', tone: 'warning', title: '表單裡的 `<button>` 預設就是送出', text: '寫在 `<form>` 裡的 `<button>` 沒寫 `type` 時就是 `submit`。在表單裡加一顆「顯示說明」「再加一列」之類的按鈕，卻忘了寫 `type="button"`，使用者一按，整張表單就送出了。不是用來送出的按鈕，一律明確寫上 `type="button"`。' },
      ],
    },
    {
      id: 'web04-s-native-validation', title: '原生驗證：讓瀏覽器先擋一次',
      blocks: [
        { type: 'p', text: '使用者會漏填、會打錯。等資料送到伺服器才發現、再退回來重填，一來一往很慢。原生驗證（native validation）是瀏覽器內建的檢查：你用屬性寫下規則，按下送出時瀏覽器先檢查一遍，只要有一個欄位不合格就不送出，並把焦點移到第一個不合格的欄位、在旁邊顯示提示。完全不需要 JavaScript。' },
        { type: 'table', head: ['屬性', '規則', '寫法'], rows: [
          ['`required`', '必填；用在核取方塊上表示一定要勾選', '`required`（不需要值）'],
          ['`type`', '`email` 的格式要對；`number`、`date` 要是合格的數字、日期', '`type="email"`'],
          ['`minlength`、`maxlength`', '文字最少、最多幾個字', '`minlength="2" maxlength="20"`'],
          ['`min`、`max`', '`number` 或 `date` 的最小值、最大值', '`min="1" max="5"`'],
          ['`pattern`', '整個值都要符合指定的格式', '`pattern="[A-Z]{2}[0-9]{4}"`'],
        ] },
        { type: 'p', text: '`pattern` 的值是一種描述文字格式的寫法，叫做正規表示式（regular expression）。這一課只要看得懂範例裡的這一個：`[A-Z]{2}` 是 2 個大寫英文字母，`[0-9]{4}` 是 4 個數字，合起來就是 `AB1234` 這種借書證號；整個值都要符合，多一個字、少一個字都不行。使用者看不到 `pattern`，所以格式要寫在 label 裡，並用 `title` 屬性再說明一次，瀏覽器顯示提示時可能會用到它。' },
        { type: 'example', id: 'web04-validation' },
        { type: 'p', text: '範例用兩行 CSS 把驗證的狀態畫出來：合格的欄位符合 `:valid`（綠框），不合格的符合 `:invalid`（紅框）。這兩個狀態隨時都在更新，不必等到送出。一載入，兩個必填欄位就是紅框，沒填的借書證號卻是綠框。這是最容易誤會的地方：除了 `required`，其他規則都只檢查「有填的內容」，空著的 `email`、`pattern`、`minlength` 欄位都算合格。所以「必填而且格式要對」的欄位，`required` 和格式的屬性兩個都要寫。' },
        { type: 'p', text: '接著動手試：姓名只打一個字再送出，會因為 `minlength="2"` 被擋；想打超過 20 個字，`maxlength` 讓欄位直接不再接受輸入。借書證號填 `ab12`，紅框出現；改成 `AB1234` 才變綠。三欄都是綠框時，表單才送得出去。' },
        { type: 'callout', tone: 'warning', title: '瀏覽器的驗證不能取代伺服器的驗證', text: '原生驗證是給使用者的方便，不是安全機制。任何人都能用開發者工具把 `required` 刪掉，或完全不經過你的頁面、直接把資料送給伺服器；在 `<form>` 加上 `novalidate` 屬性，瀏覽器送出時也不會檢查。所以伺服器收到資料後一定要再驗證一次。' },
        { type: 'callout', tone: 'note', title: '提示的文字每個瀏覽器都不一樣', text: '被擋下時出現的提示是瀏覽器自己的文字，會隨瀏覽器與使用者的語言設定而不同。因此欄位的規則（必填、幾個字、什麼格式）要寫在 label 或旁邊的說明裡，不要指望使用者從提示裡猜。' },
      ],
    },
    {
      id: 'web04-s-keyboard', title: '只用鍵盤走完整張表單',
      blocks: [
        { type: 'p', text: '不是每個人都用滑鼠填表：有人覺得鍵盤比較快，有人因為手部或視力的關係只能用鍵盤或其他輔助科技。只要用的是原生的表單元素（`<input>`、`<select>`、`<textarea>`、`<button>`），再加上 label，下面這些鍵盤操作不用寫任何程式就有：' },
        { type: 'table', head: ['按鍵', '作用'], rows: [
          ['Tab、Shift + Tab', '把焦點移到下一個、上一個控制項；順序就是它們在 HTML 裡出現的順序'],
          ['Enter（在單行的文字欄位裡）', '送出表單（有送出按鈕的表單都是如此）；和按下按鈕一樣會先驗證'],
          ['空白鍵（Space）', '勾選或取消核取方塊；按下目前有焦點的按鈕'],
          ['方向鍵', '在同一組選項按鈕之間換選；在下拉選單裡換選項'],
          ['Enter（在 `<textarea>` 裡）', '換行，不會送出表單'],
        ] },
        { type: 'p', text: '回到上一節的範例實際走一次：先點一下姓名欄位，之後手離開滑鼠。填好姓名按 Tab，焦點跳到電子郵件；再按 Tab 到借書證號；最後在欄位裡按 Enter 送出。有焦點的控制項外圍會多一圈外框，那是瀏覽器畫的焦點指示，讓人知道現在打字會打到哪裡。再到第四節的範例：用 Tab 走到選項按鈕後按方向鍵換地點，走到核取方塊後按空白鍵勾選。' },
        { type: 'p', text: 'Tab 的順序跟著 HTML 走，所以控制項在原始碼裡的順序要和畫面上閱讀的順序一致：先姓名、再電子郵件、最後才是送出按鈕。如果用 `<div>` 加上樣式假裝成按鈕或核取方塊，這些鍵盤行為全部都要自己用程式補回來，所以能用原生元素就用原生元素。' },
        { type: 'callout', tone: 'note', title: 'Tab 沒有停在按鈕或核取方塊上？', text: '有些作業系統與瀏覽器的預設設定，Tab 只會停在文字欄位與選單上。到系統或瀏覽器的鍵盤設定裡開啟「用鍵盤瀏覽所有控制項」這類選項，Tab 就會停在每一個控制項上。這是使用者端的設定，不是你的 HTML 寫錯。' },
        { type: 'p', text: '最後，用這份清單檢查自己寫的每一張表單：' },
        { type: 'list', items: [
          '每個要收的控制項都有 `name`；選項按鈕、核取方塊與 `<option>` 都有 `value`。',
          '每個控制項都有 label；一組選項用 `<fieldset>` 與 `<legend>` 加上題目。',
          '`type` 依資料的種類選擇；不是用來送出的按鈕寫了 `type="button"`。',
          '必填與格式的規則寫成原生驗證的屬性，也寫在使用者看得到的說明裡。',
          '放開滑鼠，只用鍵盤可以從第一個欄位一路填到送出。',
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'web04-q1', prompt: '下列哪一種寫法，能讓「電子郵件」成為輸入欄位真正的 label（點文字時焦點會進入欄位）？',
      options: [
        '`<label for="email">電子郵件</label> <input name="email">`',
        '`<label for="mail">電子郵件</label> <input id="mail" name="email">`',
        '`<label>電子郵件</label> <input id="email" name="email">`',
        '`<p>電子郵件</p> <input name="email" placeholder="電子郵件">`',
      ],
      answer: 1,
      explanation: '`for` 要對到欄位的 `id`：`for="mail"` 配 `id="mail"` 才算關聯，`name` 叫什麼不影響。第一個選項的欄位只有 `name`、沒有 `id`，`for` 找不到對象；第三個選項的 `<label>` 沒有 `for`，也沒有把欄位包在裡面，只是擺在旁邊；第四個選項根本沒有 `<label>`，`placeholder` 一開始輸入就消失，不能當欄位的名稱。',
    },
    {
      id: 'web04-q2', prompt: '使用者什麼都不改，直接按下「送出」。送出的資料是什麼？',
      code: { language: 'HTML', text: `<form>
  <input name="reader" value="小安">
  <input id="tel" value="0912">
  <input type="checkbox" name="news" value="yes">
  <button>送出</button>
</form>` },
      options: ['只有 `reader=小安`', '`reader=小安` 與 `tel=0912`', '`reader=小安` 與 `news=yes`', '`reader=小安`、`tel=0912` 與空的 `news=`'],
      answer: 0,
      explanation: '只有 `reader` 會送出。第二個欄位只有 `id`、沒有 `name`，沒有名稱的控制項不會送出，所以資料裡沒有 `tel`。核取方塊沒有 `checked`，使用者也沒有點它，沒勾選的核取方塊完全不出現在資料裡：既不是 `news=yes`，也不會送出空的 `news=`。',
    },
    {
      id: 'web04-q3', prompt: '三個 `type="radio"` 的選項按鈕要成為「只能選一個」的一組，關鍵是什麼？',
      options: ['三個都寫相同的 `id`', '三個都寫相同的 `value`', '把三個放進同一個 `<fieldset>`', '三個都寫相同的 `name`'],
      answer: 3,
      explanation: '選項按鈕靠 `name` 分組：`name` 相同的才會互相排除，送出時也用這個 `name` 當資料的名稱。`id` 在同一頁不能重複；`value` 要各不相同，伺服器才分得出選了哪一個；`<fieldset>` 與 `<legend>` 只是為這一組加上外框與題目，不會讓裡面的選項變成單選。',
    },
    {
      id: 'web04-q4', prompt: '頁面沒有任何 JavaScript。使用者按下「清除」按鈕後會發生什麼事？',
      code: { language: 'HTML', text: `<form>
  <label for="q">書名</label>
  <input id="q" name="q">
  <button>清除</button>
</form>` },
      options: ['欄位的內容被清空', '什麼事都不會發生', '表單被送出', '瀏覽器顯示錯誤，因為按鈕沒有寫 `type`'],
      answer: 2,
      explanation: '`<form>` 裡的 `<button>` 沒寫 `type` 時就是 `submit`，所以一按就送出表單。按鈕上的文字只是給人看的，寫「清除」不會讓它具備清空的功能；想要「按了什麼都不做」必須明確寫 `type="button"`；少寫 `type` 是合法的 HTML，瀏覽器不會顯示錯誤。',
    },
    {
      id: 'web04-q5', prompt: '表單裡有 `<input type="email" name="email">`，沒有其他屬性。使用者讓它空著就按送出，結果是什麼？',
      options: [
        '送不出去：空白不是合格的電子郵件',
        '送得出去，但資料裡不會有 `email`',
        '送得出去，資料裡有 `email`，值是空的',
        '送不出去：`type="email"` 的欄位一定是必填',
      ],
      answer: 2,
      explanation: '`type="email"` 只檢查「有填的內容」格式對不對，空著不算錯；要擋下空白必須另外加 `required`，兩個屬性各管一件事，所以兩個「送不出去」的選項都不對。有 `name` 的文字類欄位即使沒填也會送出空值，資料裡是 `email=`；整個不出現在資料裡，是沒勾選的核取方塊才有的行為。',
    },
    {
      id: 'web04-q6', prompt: '只用原生的表單元素、不寫 JavaScript 時，下列關於鍵盤操作的敘述哪一個正確？',
      options: [
        '焦點在核取方塊上時按空白鍵，可以勾選或取消勾選',
        '在 `<textarea>` 裡按 Enter 會送出表單',
        '按 Tab 時，焦點依照欄位 `name` 的字母順序移動',
        '要讓 Enter 能送出表單，必須另外寫 JavaScript 監聽鍵盤',
      ],
      answer: 0,
      explanation: '空白鍵切換核取方塊是瀏覽器內建的行為。`<textarea>` 是多行文字，Enter 在裡面是換行；按 Enter 會送出的是單行的 `<input>`。Tab 的順序跟著控制項在 HTML 裡出現的順序，和 `name` 無關。有送出按鈕的表單，在單行欄位裡按 Enter 本來就會送出，不需要任何 JavaScript。',
    },
    {
      id: 'web04-q7', prompt: '表單的每個欄位都已經加上 `required` 與正確的 `type`。伺服器收到資料後，還需要再檢查一次嗎？',
      options: [
        '不需要，瀏覽器已經保證送出的資料都合格',
        '只有表單寫了 `novalidate` 時才需要',
        '只有資料裡包含密碼時才需要',
        '需要，因為資料不一定是通過這張表單的驗證才送來的',
      ],
      answer: 3,
      explanation: '原生驗證只在使用者的瀏覽器裡執行，目的是讓人早一點發現填錯，不是安全機制：任何人都能用開發者工具刪掉 `required`，或完全不經過這個頁面直接把資料送給伺服器，瀏覽器無法替伺服器保證任何事。所以不論有沒有 `novalidate`、資料裡有沒有密碼，伺服器都要再驗證一次。',
    },
    {
      id: 'web04-q8', prompt: '活動報名表要問「參加人數」，只接受 1 到 6 的整數。哪一種寫法最合適？',
      options: [
        '`<input type="text" name="people" maxlength="1">`',
        '`<input type="number" name="people" min="1" max="6">`',
        '`<input type="text" name="people" min="1" max="6">`',
        '`<input type="date" name="people" min="1" max="6">`',
      ],
      answer: 1,
      explanation: '人數是可以比大小的數量，用 `type="number"` 加上 `min`、`max`，瀏覽器才會擋下 0、9 這些範圍外的值，以及 2.5 這種小數（沒寫 `step` 時間距是 1）。`maxlength="1"` 只限制字數，`a` 或 `9` 都過得了；`min`、`max` 寫在 `type="text"` 上沒有作用；`date` 是選日期用的，不是數量。',
    },
  ],
  webCode: { examples, exercises },
};
