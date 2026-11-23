import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * MOB05 mobile forms and the virtual keyboard (MOB-2). Which keyboard a field brings up (type, inputmode), why a string
 * of digits is not a quantity (type="number" steps, drops what is not a number), enterkeyhint, autocapitalize and
 * spellcheck; autocomplete tokens; typing less (defaults, choices, a stepper, remembering what is not sensitive); then
 * the keyboard covering the page, and where a focused field ends up (scroll-margin, scroll-padding, scrollIntoView).
 *
 * How the claims are checked. A desktop browser has no virtual keyboard, and which keyboard a phone shows is the
 * phone's business: the text says "typically" and the checks read the attributes that ask for it. What the page itself
 * does is checked by behaviour: a number field's value after stepUp() and after a value that is not a number, what a
 * form sends when nothing was typed, what is stored, and where a focused field is in the viewport (`box` from
 * `:viewport`, `hit`). The two keyboard pages draw a grey block that stands in for the keyboard (CSS only, shown while
 * a field has focus); the text says plainly that it is a stand-in and that a phone's browser usually scrolls the
 * focused field by itself. Focus positions are made the same in every browser by the page's own
 * scrollIntoView({ block: 'start' }) with scroll-margin-top: where a browser puts a field it focuses by itself (centre,
 * or just in view) differs between browsers, so no check depends on it. A field that is already in the viewport is not
 * scrolled by any browser, which is what the starter of the last exercise and the first keyboard page rely on.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const FORM_CSS = String.raw`body { margin: 0; font-family: sans-serif; }
h1 { margin: 12px 16px; font-size: 20px; }
form { display: grid; gap: 4px; padding: 0 16px 16px; }
form > label { margin-top: 8px; }
input, select, textarea, button {
  box-sizing: border-box;
  font: inherit;
  font-size: 16px;
}
input, select, textarea { width: 100%; min-height: 48px; padding: 8px 12px; }
button { min-height: 48px; margin-top: 12px; }`;

const numberTrap: WebExample = {
  id: 'mob05-number-trap', title: '同一支手機號碼，填進數量欄位與電話欄位',
  description: '兩個欄位一開始都是 `0912345678`。A 是 `type="number"`，B 是 `type="tel"`。兩顆按鈕各做一件使用者很容易做到的事：在 A 裡按一下向上鍵，以及把號碼改成有連字號的寫法。最下面一行顯示兩個欄位目前的值。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: String.raw`<h1>同一支手機號碼</h1>
<form id="phones">
  <label for="a">A：type="number"</label>
  <input id="a" name="a" type="number" value="0912345678">
  <label for="b">B：type="tel"</label>
  <input id="b" name="b" type="tel" value="0912345678">
  <button type="button" id="up">在 A 按一下向上鍵</button>
  <button type="button" id="dash">兩欄都改填 0912-345-678</button>
</form>
<p id="out"></p>`,
    css: FORM_CSS + String.raw`
#out { margin: 0 16px; }`,
    js: String.raw`const a = document.querySelector('#a');
const b = document.querySelector('#b');
const out = document.querySelector('#out');

function show() {
  out.textContent = 'A 的值：「' + a.value + '」　B 的值：「' + b.value + '」';
}

// stepUp() 做的事，和在數量欄位裡按鍵盤的向上鍵一樣：加一
document.querySelector('#up').addEventListener('click', () => {
  a.stepUp();
  show();
});

document.querySelector('#dash').addEventListener('click', () => {
  a.value = '0912-345-678';
  b.value = '0912-345-678';
  show();
});

show();`,
  },
  observe: [
    { check: 'value', selector: '#a', value: '0912345678', label: '一開始，A 的值和 B 一樣是 `0912345678`' },
    { do: 'click', selector: '#up' },
    { check: 'value', selector: '#a', value: '912345679', label: '在 A 按一下向上鍵：它被當成數字加一，變成 `912345679`，開頭的 0 不見了，號碼也變了' },
    { check: 'value', selector: '#b', value: '0912345678', label: 'B 是電話欄位，不能加減：仍然是 `0912345678`' },
    { do: 'click', selector: '#dash' },
    { check: 'value', selector: '#a', value: '', label: '改填 `0912-345-678`：這不是一個數字，A 收不下，值變成空的' },
    { check: 'value', selector: '#b', value: '0912-345-678', label: 'B 原樣收下 `0912-345-678`' },
  ],
};

const keyboards: WebExample = {
  id: 'mob05-keyboards', title: '七個欄位，各自要求合適的鍵盤',
  description: '小島外送的搜尋框與聯絡資料。每個欄位都用 `type`、`inputmode`、`enterkeyhint` 或 `autocapitalize` 說明自己要哪一種鍵盤。用手機開啟這一頁，依序點每個欄位，看鍵盤怎麼變；在桌機上沒有虛擬鍵盤，請展開「瀏覽器建立的 DOM 樹」看每個欄位的屬性。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: String.raw`<h1>小島外送</h1>
<form id="search" role="search">
  <label for="q">搜尋餐點</label>
  <input id="q" name="q" type="search" enterkeyhint="search">
</form>
<form id="contact">
  <label for="email">電子郵件</label>
  <input id="email" name="email" type="email">
  <label for="phone">手機號碼</label>
  <input id="phone" name="phone" type="tel">
  <label for="zip">郵遞區號</label>
  <input id="zip" name="zip" type="text" inputmode="numeric">
  <label for="kg">散裝花生要幾公斤（例如 0.5）</label>
  <input id="kg" name="kg" type="text" inputmode="decimal">
  <label for="qty">便當幾份</label>
  <input id="qty" name="qty" type="number" min="1" max="9" value="1">
  <label for="coupon">優惠碼</label>
  <input id="coupon" name="coupon" type="text" autocapitalize="characters" spellcheck="false" enterkeyhint="send">
  <button>送出</button>
</form>`,
    css: FORM_CSS,
  },
  observe: [
    { check: 'attr', selector: '#q', name: 'enterkeyhint', value: 'search', label: '搜尋框 `#q` 的 `enterkeyhint` 是 `search`：請鍵盤把 Enter 鍵標示成搜尋' },
    { check: 'attr', selector: '#email', name: 'type', value: 'email', label: '電子郵件 `#email` 的 `type` 是 `email`' },
    { check: 'attr', selector: '#zip', name: 'inputmode', value: 'numeric', label: '郵遞區號 `#zip` 是 `type="text"` 加上 `inputmode="numeric"`：一般的文字欄位，要求數字鍵盤' },
    { check: 'attr', selector: '#kg', name: 'inputmode', value: 'decimal', label: '公斤數 `#kg` 的 `inputmode` 是 `decimal`：數字鍵盤加上小數點' },
    { check: 'style', selector: '#email', property: 'font-size', value: '16px', label: '欄位的字級是 16px' },
  ],
};

const autocompleteForm: WebExample = {
  id: 'mob05-autocomplete', title: '每個欄位都說出自己要什麼資料的結帳表單',
  description: '小島外送的外送與付款表單。七個欄位都有 `<label>`、`name`，以及一個 `autocomplete` 記號。地址是可以填好幾行的 `<textarea>`。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: String.raw`<h1>外送與付款</h1>
<form id="pay">
  <label for="name">收件人</label>
  <input id="name" name="name" autocomplete="name">
  <label for="email">電子郵件</label>
  <input id="email" name="email" type="email" autocomplete="email">
  <label for="tel">手機號碼</label>
  <input id="tel" name="tel" type="tel" autocomplete="tel">
  <label for="address">外送地址</label>
  <textarea id="address" name="address" rows="2" autocomplete="street-address"></textarea>
  <label for="zip">郵遞區號</label>
  <input id="zip" name="zip" inputmode="numeric" autocomplete="postal-code">
  <label for="card">信用卡號碼</label>
  <input id="card" name="card" inputmode="numeric" autocomplete="cc-number">
  <label for="exp">卡片有效期限</label>
  <input id="exp" name="exp" inputmode="numeric" autocomplete="cc-exp">
  <button>付款</button>
</form>`,
    css: FORM_CSS,
  },
  observe: [
    { check: 'attr', selector: '#name', name: 'autocomplete', value: 'name', label: '收件人 `#name` 的 `autocomplete` 是 `name`' },
    { check: 'attr', selector: '#address', name: 'autocomplete', value: 'street-address', label: '外送地址 `#address` 是 `<textarea>`，`autocomplete` 是 `street-address`' },
    { check: 'attr', selector: '#card', name: 'autocomplete', value: 'cc-number', label: '卡號 `#card` 的 `autocomplete` 是 `cc-number`' },
    { check: 'label', selector: '#card', text: '信用卡號碼', label: '卡號欄位有真正的 `<label>`：「信用卡號碼」' },
    { check: 'count', selector: '[autocomplete="off"]', count: 0, label: '沒有任何欄位寫 `autocomplete="off"`' },
  ],
};

const lessTyping: WebExample = {
  id: 'mob05-less-typing', title: '同樣三個問題：全部用打的，與預設值加上用選的',
  description: '兩張表單問的是同樣三件事：幾份、怎麼付款、什麼時候送到。A 的三個欄位都要打字，而且都是必填。B 的份數預設 1，旁邊有加、減按鈕；付款方式是預先選好「現金」的選項按鈕；送達時間是預設「盡快送達」的下拉選單。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  files: {
    html: String.raw`<h1>份數、付款與送達時間</h1>
<h2>A：全部用打的</h2>
<form id="typed">
  <label for="qty-a">份數</label>
  <input id="qty-a" name="qty" required>
  <label for="pay-a">付款方式（請輸入現金或刷卡）</label>
  <input id="pay-a" name="pay" required>
  <label for="time-a">送達時間</label>
  <input id="time-a" name="time" required>
  <button id="send-a">送出 A</button>
</form>
<h2>B：有預設值，用選的</h2>
<form id="chosen">
  <label for="qty">份數</label>
  <div id="stepper">
    <button type="button" id="minus" aria-label="減少一份">−</button>
    <input id="qty" name="qty" type="number" min="1" max="9" value="1">
    <button type="button" id="plus" aria-label="增加一份">＋</button>
  </div>
  <fieldset>
    <legend>付款方式</legend>
    <label><input type="radio" name="pay" value="cash" checked> 現金</label>
    <label><input type="radio" name="pay" value="card"> 刷卡</label>
  </fieldset>
  <label for="time">送達時間</label>
  <select id="time" name="time">
    <option value="asap">盡快送達</option>
    <option value="1200">12:00</option>
    <option value="1230">12:30</option>
  </select>
  <button id="send-b">送出 B</button>
</form>`,
    css: String.raw`body { margin: 0; font-family: sans-serif; }
h1 { margin: 12px 16px 0; font-size: 20px; }
h2 { margin: 12px 16px 0; font-size: 16px; }
form { display: grid; gap: 4px; padding: 0 16px 16px; }
form > label { margin-top: 8px; }
input, select, button { box-sizing: border-box; font: inherit; font-size: 16px; }
input:not([type="radio"]), select { width: 100%; min-height: 48px; padding: 8px 12px; }
form > button { min-height: 48px; margin-top: 12px; }

/* 加、減按鈕：至少 48 × 48，中間是份數 */
#stepper { display: flex; gap: 8px; }
#stepper button { flex: none; width: 48px; min-height: 48px; }
#stepper input { text-align: center; }

/* 整列都可以點的選項 */
fieldset { margin: 8px 0 0; padding: 0 12px; }
fieldset label { display: flex; align-items: center; gap: 12px; min-height: 48px; }`,
    js: String.raw`const qty = document.querySelector('#qty');

// stepDown() 與 stepUp() 會遵守 min 與 max：不會低於 1，也不會超過 9
document.querySelector('#minus').addEventListener('click', () => qty.stepDown());
document.querySelector('#plus').addEventListener('click', () => qty.stepUp());`,
  },
  observe: [
    { do: 'click', selector: '#send-a' },
    { check: 'submitted', count: 0, label: 'A：什麼都沒打就按「送出 A」，三個必填的文字欄位把送出擋了下來' },
    { do: 'click', selector: '#plus' },
    { check: 'value', selector: '#qty', value: '2', label: 'B：點一下「＋」，份數從預設的 1 變成 2' },
    { check: 'box', selector: '#plus', measure: 'width', value: 44, op: 'min', label: '「＋」按鈕的外框至少 44px 寬' },
    { check: 'label', selector: '#chosen input[value="card"]', text: '刷卡', label: '每個選項按鈕都包在自己的 `<label>` 裡：`value` 是 `card` 的那一個，標籤是「刷卡」' },
    { do: 'click', selector: '#send-b' },
    { check: 'submitted', count: 1, data: { qty: '2', pay: 'cash', time: 'asap' }, label: 'B：一個字都沒打就送出了，資料是 2 份、預設的 `cash` 與 `asap`' },
  ],
};

// The two keyboard pages share their fields: a 56px sticky header, six rows of 88px (a 28px label, a 48px input, 12px).
const FIELDS: [string, string, string][] = [
  ['name', '收件人', 'name="name" autocomplete="name"'],
  ['phone', '手機號碼', 'name="phone" type="tel" autocomplete="tel"'],
  ['email', '電子郵件', 'name="email" type="email" autocomplete="email"'],
  ['zip', '郵遞區號', 'name="zip" inputmode="numeric" autocomplete="postal-code"'],
  ['address', '地址', 'name="address" autocomplete="address-line1"'],
  ['note', '給外送員的話', 'name="note"'],
];
const fieldRows = (last = '') => FIELDS.map(([id, label, attrs], i) => `    <div class="field">
      <label for="${id}">${label}</label>
      <input id="${id}" ${attrs}${i === FIELDS.length - 1 ? last : ''}>
    </div>`).join('\n');
const KEYBOARD_BASE_CSS = String.raw`body { margin: 0; font-family: sans-serif; }
#top {
  position: sticky;
  top: 0;
  height: 56px;
  padding: 0 16px;
  background-color: #ffcc80;
}
#top h1 { margin: 0; font-size: 18px; line-height: 56px; }
.field { height: 88px; }
.field label { display: block; height: 28px; line-height: 28px; }
.field input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 48px;
  padding: 0 12px;
  font: inherit;
  font-size: 16px;
}
#pay { display: block; width: 100%; height: 48px; font: inherit; }

/* 假鍵盤：代替手機的虛擬鍵盤。表單裡有欄位取得焦點時才出現 */
#keyboard {
  display: none;
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 280px;
  line-height: 280px;
  text-align: center;
  background-color: #b0bec5;
}
main:focus-within ~ #keyboard { display: block; }
`;

const keyboardCover: WebExample = {
  id: 'mob05-keyboard-cover', title: '鍵盤出現之後：被蓋住的欄位與送出按鈕',
  description: '小島外送的結帳頁：56px 高的頁首黏在視窗上緣，「送出訂單」固定在視窗底部。桌機沒有虛擬鍵盤，所以這一頁畫了一塊 280px 高的灰色區塊代替它：任何一個欄位取得焦點時，它就從視窗底部出現。這一頁沒有指令稿。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  height: 640,
  files: {
    html: `<header id="top"><h1>小島外送：結帳</h1></header>
<main>
  <form id="checkout">
${fieldRows()}
  </form>
</main>
<div id="bar">
  <button id="pay" form="checkout">送出訂單</button>
</div>
<div id="keyboard" aria-hidden="true">假鍵盤（代替虛擬鍵盤）</div>`,
    css: KEYBOARD_BASE_CSS + String.raw`
main { padding: 8px 16px 88px; }

/* 送出按鈕固定在視窗底部 */
#bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px;
  background-color: #ffffff;
}`,
  },
  observe: [
    { check: 'style', selector: '#keyboard', property: 'display', value: 'none', label: '沒有欄位取得焦點時，假鍵盤不顯示' },
    { do: 'click', selector: '#address' },
    { check: 'box', selector: '#keyboard', measure: 'top', value: 360, from: ':viewport', label: '點「地址」欄位：假鍵盤出現，上緣在離視窗頂端 360px 的地方，下面的 280px 都是它的' },
    { check: 'box', selector: '#address', measure: 'top', value: 444, from: ':viewport', label: '「地址」欄位原本就在視窗裡，所以頁面沒有捲動：它的上緣仍然在 444px' },
    { check: 'hit', selector: '#address', top: '#keyboard', label: '「地址」欄位的中心點上，畫在最上面的是假鍵盤：正在填的欄位被蓋住了' },
    { check: 'hit', selector: '#pay', top: '#keyboard', label: '固定在視窗底部的「送出訂單」也在假鍵盤底下' },
  ],
};

const fieldScroll: WebExample = {
  id: 'mob05-field-scroll', title: '取得焦點的欄位捲到頁首下方，送出按鈕跟在最後一個欄位後面',
  description: '和上一個範例同一張表單，改了三個地方：欄位多了 `scroll-margin-top: 92px`；script.js 在欄位取得焦點時呼叫 `scrollIntoView({ block: \'start\' })`；「送出訂單」不再固定在視窗底部，而是接在最後一個欄位後面。灰色的假鍵盤還在。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  height: 640,
  files: {
    html: `<header id="top"><h1>小島外送：結帳</h1></header>
<main>
  <form id="checkout">
${fieldRows(' enterkeyhint="send"')}
  </form>
</main>
<div id="actions">
  <button id="pay" form="checkout">送出訂單</button>
</div>
<div id="keyboard" aria-hidden="true">假鍵盤（代替虛擬鍵盤）</div>`,
    css: KEYBOARD_BASE_CSS + String.raw`
main { padding: 8px 16px 0; }
/* 送出按鈕接在表單後面；底部的留白讓最後一個欄位也捲得到頁首下方 */
#actions { padding: 16px 16px 480px; }

/* 捲進畫面時，上方留 92px：頁首 56 + 標籤 28 + 間距 8 */
.field input { scroll-margin-top: 92px; }`,
    js: String.raw`const form = document.querySelector('#checkout');

// focusin 會冒泡：在表單上登記一次，每個欄位都管得到
form.addEventListener('focusin', (event) => {
  if (event.target.matches('input')) {
    // 對齊視窗的上緣；scroll-margin-top 讓它停在頁首與標籤的下方
    event.target.scrollIntoView({ block: 'start' });
  }
});`,
  },
  observe: [
    { do: 'click', selector: '#address' },
    { check: 'box', selector: '#address', measure: 'top', value: 92, from: ':viewport', label: '點「地址」欄位：它捲到離視窗頂端 92px 的地方，正是 `scroll-margin-top` 的值' },
    { check: 'box', selector: 'label[for="address"]', measure: 'top', value: 64, from: ':viewport', label: '它的標籤上緣在 64px：在 56px 高的頁首下方，整個看得到' },
    { check: 'hit', selector: '#address', top: '#address', label: '「地址」欄位的中心點上，畫在最上面的是它自己：沒有被頁首或假鍵盤蓋住' },
    { do: 'click', selector: '#note' },
    { check: 'box', selector: '#note', measure: 'top', value: 92, from: ':viewport', label: '點最後一個欄位「給外送員的話」：同樣停在 92px' },
    { check: 'box', selector: '#pay', measure: 'bottom', value: 360, op: 'max', from: ':viewport', label: '「送出訂單」接在它後面，下緣在 360px 以上：整顆按鈕在假鍵盤的上方' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const checkoutHtml = (email: string, phone: string, zip: string, card: string) => `<h1>小島外送：結帳</h1>
<form id="checkout">
  <label for="email">電子郵件（寄送訂單明細）</label>
  <input id="email" name="email" ${email}>
  <label for="phone">手機號碼</label>
  <input id="phone" name="phone" ${phone}>
  <label for="zip">郵遞區號</label>
  <input id="zip" name="zip" ${zip}>
  <label for="card">信用卡號碼</label>
  <input id="card" name="card" ${card}>
  <button>付款</button>
</form>`;

const exKeyboards: WebExercise = {
  id: 'mob05-ex-keyboards', title: '替結帳表單的四個欄位叫出對的鍵盤',
  statement: 'style.css 不能改。小島外送的結帳表單有四個欄位：電子郵件 `#email`、手機號碼 `#phone`、郵遞區號 `#zip`、信用卡號碼 `#card`。現在前兩個是一般的文字欄位，在手機上通常會叫出整個文字鍵盤；後兩個被寫成 `type="number"`；卡號還被關掉了自動完成。請修改 index.html：(1) `#email` 與 `#phone` 改用各自專用的 `type`；(2) `#zip` 與 `#card` 不是數量，不能是 `type="number"`：改回文字欄位，再用 `inputmode` 要求只有數字的鍵盤；(3) 把 `#card` 的 `autocomplete` 從 `off` 改成信用卡號碼的記號。每個欄位的 `id`、`name` 與 `<label>` 請保留。檢查讀的是這四個欄位的屬性；鍵盤實際的樣子，請用手機開啟這一頁，在預覽裡逐一點欄位確認。',
  hints: [
    '電子郵件與電話各有自己的 `type`，課文第一節的表格裡有。改了之後，手機上的鍵盤通常會跟著換，電子郵件還多了格式檢查。',
    '`type="number"` 是給可以加一、減一的數量用的。郵遞區號與卡號要寫成 `type="text"`（或乾脆不寫 `type`），再加上 `inputmode="numeric"`。注意值是 `numeric`，不是 `number`。',
    '信用卡號碼的 `autocomplete` 記號是 `cc-number`。',
  ],
  explanation: '`type="email"` 通常讓手機顯示有 `@` 的鍵盤，瀏覽器也會檢查格式；`type="tel"` 通常顯示撥號鍵盤，開頭的 0 與連字號都留得住。郵遞區號與卡號是「由數字組成的一串符號」，不是數量：寫成 `type="number"`，方向鍵與滾輪會把它加一、減一，帶空格的卡號整個收不下。所以它們是 `type="text"`，再用 `inputmode="numeric"` 向手機要求只有 0 到 9 的鍵盤；`inputmode` 只影響鍵盤，不改變欄位的行為。卡號是整張表單最長、最容易打錯的欄位，`autocomplete="cc-number"` 讓使用者可以從瀏覽器存好的卡片裡選一張填入；把它關掉並不會比較安全，只是逼使用者手動打十六個數字。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  fixed: { css: FORM_CSS },
  starter: { html: checkoutHtml('type="text" autocomplete="email"', 'type="text" autocomplete="tel"', 'type="number" autocomplete="postal-code"', 'type="number" autocomplete="off"') },
  solution: { html: checkoutHtml('type="email" autocomplete="email"', 'type="tel" autocomplete="tel"', 'type="text" inputmode="numeric" autocomplete="postal-code"', 'type="text" inputmode="numeric" autocomplete="cc-number"') },
  steps: [
    { check: 'attr', selector: '#email', name: 'type', value: 'email', label: '電子郵件 `#email` 用的是電子郵件專用的 `type`' },
    { check: 'attr', selector: '#phone', name: 'type', value: 'tel', label: '手機號碼 `#phone` 用的是電話專用的 `type`' },
    { check: 'count', selector: 'input[type="number"]', count: 0, label: '頁面上沒有 `type="number"` 的欄位：郵遞區號與卡號都不是數量' },
    { check: 'attr', selector: '#zip', name: 'inputmode', value: 'numeric', label: '郵遞區號 `#zip` 用 `inputmode` 要求只有數字的鍵盤' },
    { check: 'attr', selector: '#card', name: 'inputmode', value: 'numeric', label: '卡號 `#card` 也用 `inputmode` 要求只有數字的鍵盤' },
    { check: 'attr', selector: '#card', name: 'autocomplete', value: 'cc-number', match: 'includes', label: '`#card` 的 `autocomplete` 是信用卡號碼的記號，不再是 `off`' },
  ],
  mistakes: [
    { files: { html: checkoutHtml('type="email" autocomplete="email"', 'type="tel" autocomplete="tel"', 'type="number" inputmode="numeric" autocomplete="postal-code"', 'type="number" inputmode="numeric" autocomplete="cc-number"') }, why: '加了 `inputmode="numeric"`，卻沒有把 `type="number"` 拿掉。鍵盤是對了，但欄位仍然是數量欄位：按到方向鍵會加一、減一，帶空格的卡號收不下。`inputmode` 只管鍵盤，欄位的行為由 `type` 決定。' },
    { files: { html: checkoutHtml('type="email" autocomplete="email"', 'type="tel" autocomplete="tel"', 'type="text" inputmode="number" autocomplete="postal-code"', 'type="text" inputmode="number" autocomplete="cc-number"') }, why: '寫成 `inputmode="number"`。`number` 是 `type` 的值，不是 `inputmode` 的值；瀏覽器不認得，就當作沒寫，手機上出現的還是原本的文字鍵盤。只有數字的鍵盤是 `numeric`，需要小數點的是 `decimal`。' },
    { files: { html: checkoutHtml('type="email" autocomplete="email"', 'type="tel" autocomplete="tel"', 'type="text" inputmode="numeric" autocomplete="postal-code"', 'type="text" inputmode="numeric" autocomplete="off"') }, why: '鍵盤都改對了，卡號的 `autocomplete="off"` 卻留著。使用者只能一個數字一個數字地打完整個卡號。瀏覽器存的卡片要使用者自己選了才會填入，網頁讀不到，關掉自動完成並沒有保護到誰。' },
  ],
};

const ORDER_CSS = String.raw`body { margin: 0; font-family: sans-serif; }
h1 { margin: 12px 16px; font-size: 20px; }
form { display: grid; gap: 4px; padding: 0 16px 16px; }
form > label { margin-top: 8px; }
input, textarea, button { box-sizing: border-box; font: inherit; font-size: 16px; }
input:not([type="radio"]), textarea { width: 100%; min-height: 48px; padding: 8px 12px; }
button { min-height: 48px; margin-top: 12px; }

/* 一組選項：每個選項一列，整列都可以點 */
fieldset { margin: 8px 0 0; padding: 0 12px; }
fieldset label { display: flex; align-items: center; gap: 12px; min-height: 48px; }`;
const orderHtml = (name: string, address: string, rest: string) => `<h1>小島外送：外送資料</h1>
<form id="order">
  <label for="name">收件人</label>
  <input id="name" name="name"${name} required>
  <label for="tel">手機號碼</label>
  <input id="tel" name="tel" type="tel" autocomplete="tel" required>
  <label for="address">外送地址</label>
  <textarea id="address" name="address" rows="2"${address} required></textarea>
${rest}
  <button>送出訂單</button>
</form>`;
const ORDER_TYPED = `  <label for="qty">份數（請輸入數字）</label>
  <input id="qty" name="qty" required>
  <label for="pay">付款方式（請輸入 cash 或 card）</label>
  <input id="pay" name="pay" required>`;
const orderChosen = (cash: string, card: string) => `  <label for="qty">份數</label>
  <input id="qty" name="qty" type="number" min="1" max="9" value="1" required>
  <fieldset>
    <legend>付款方式</legend>
    <label><input type="radio" name="pay"${cash}> 現金</label>
    <label><input type="radio" name="pay"${card}> 刷卡</label>
  </fieldset>`;
const ORDER_FILL = [
  { do: 'input', selector: '#name', value: '林小安' },
  { do: 'input', selector: '#tel', value: '0912345678' },
  { do: 'input', selector: '#address', value: '港口路 12 號' },
  { do: 'submit', selector: '#order' },
] as const;

const exLessTyping: WebExercise = {
  id: 'mob05-ex-less-typing', title: '外送資料：能自動填的自動填，能選的用選的',
  statement: 'style.css 不能改。小島外送的外送資料表單 `#order` 有五個欄位，使用者每一格都得自己打字。請修改 index.html，把要打的字降到最少：(1) 手機號碼已經有 `autocomplete="tel"`；照樣替收件人 `#name` 加上「完整姓名」的記號，替外送地址 `#address`（它是 `<textarea>`）加上「街道地址」的記號。(2) 份數 `#qty` 是數量：改成 `type="number"`，`min` 是 1、`max` 是 9，預設值是 1。(3) 付款方式只有兩種：把文字欄位 `#pay` 換成兩個 `name` 都是 `pay` 的選項按鈕，`value` 分別是 `cash` 與 `card`，標籤文字分別是「現金」與「刷卡」，預設選好 `cash`。請用 `<fieldset>` 與 `<legend>` 把這一組包起來（這一項不在檢查裡）。不要增加其他有 `name` 的欄位。檢查會填入收件人、手機號碼與地址後送出表單，送出的資料必須剛好是 `name`、`tel`、`address`、`qty`、`pay` 五項，其中 `qty` 是 `1`、`pay` 是 `cash`。',
  hints: [
    '`autocomplete` 的記號在課文第三節的表格裡：完整姓名與街道地址各有一個。記號要照標準拼，自己發明的字瀏覽器不認得。',
    '預設值寫在 HTML 裡：數量欄位用 `value="1"`，選項按鈕用 `checked`。使用者不必動它們，送出時就已經有值。',
    '每個選項按鈕寫成 `<label><input type="radio" name="pay" value="cash" checked> 現金</label>`：`name` 相同的是同一組，`value` 是送出的值，`<label>` 包住它，整列文字都可以點。',
  ],
  explanation: '`autocomplete="name"` 與 `autocomplete="street-address"` 讓瀏覽器可以用使用者存過的資料把這兩格填好，使用者只要點一下建議。份數是真正的數量，`type="number"` 在這裡是對的：手機通常顯示數字鍵盤，`min` 與 `max` 擋掉不合理的數字，而 `value="1"` 讓最常見的答案不必輸入。付款方式只有兩個答案，用選項按鈕比打字快，也不會收到「現金」「付現」「cash」各種寫法；`checked` 預先選好一項，`<label>` 包住選項讓整列都是觸控目標，`<fieldset>` 與 `<legend>` 替這一組加上題目。結果是：使用者只需要處理收件人、手機與地址，而這三格瀏覽器都可能替他填好。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  fixed: { css: ORDER_CSS },
  starter: { html: orderHtml('', '', ORDER_TYPED) },
  solution: { html: orderHtml(' autocomplete="name"', ' autocomplete="street-address"', orderChosen(' value="cash" checked', ' value="card"')) },
  steps: [
    { check: 'attr', selector: '#name', name: 'autocomplete', value: 'name', label: '收件人 `#name` 有「完整姓名」的 `autocomplete` 記號' },
    { check: 'attr', selector: '#address', name: 'autocomplete', value: 'street-address', match: 'includes', label: '外送地址 `#address` 有「街道地址」的 `autocomplete` 記號' },
    { check: 'attr', selector: '#qty', name: 'type', value: 'number', label: '份數 `#qty` 是數量欄位' },
    { check: 'count', selector: 'input[type="radio"][name="pay"]', count: 2, label: '付款方式是兩個 `name` 為 `pay` 的選項按鈕' },
    { check: 'label', selector: 'input[name="pay"][value="card"]', text: '刷卡', match: 'includes', label: '`value` 是 `card` 的選項按鈕，標籤文字是「刷卡」' },
    ...ORDER_FILL,
    { check: 'submitted', count: 1, data: { name: '林小安', tel: '0912345678', address: '港口路 12 號', qty: '1', pay: 'cash' }, label: '只填收件人、手機與地址就送出：份數送出預設的 `1`，付款方式送出預設的 `cash`' },
  ],
  mistakes: [
    { files: { html: orderHtml(' autocomplete="name"', ' autocomplete="street-address"', orderChosen(' value="cash"', ' value="card"')) }, why: '兩個選項按鈕都沒有 `checked`。沒有預設的選項，使用者每次都得多點一下；一下都沒點就送出時，送出的資料裡根本沒有 `pay`。最常見的答案要預先選好。' },
    { files: { html: orderHtml(' autocomplete="name"', ' autocomplete="street-address"', orderChosen(' checked', '')) }, why: '選項按鈕沒有寫 `value`。沒有 `value` 的選項按鈕，被選中時送出的是 `on`：伺服器收到 `pay=on`，分不出使用者選的是現金還是刷卡。每個選項都要有自己的 `value`。' },
    { files: { html: orderHtml(' autocomplete="fullname"', ' autocomplete="address"', orderChosen(' value="cash" checked', ' value="card"')) }, why: '`autocomplete` 寫成自己想的 `fullname` 與 `address`。記號是 HTML 標準定好的一組字，不是英文單字隨意填：瀏覽器不認得的值等於沒寫。完整姓名是 `name`，街道地址是 `street-address`。' },
  ],
};

const REMEMBER_HTML = String.raw`<h1>小島外送：結帳</h1>
<form id="checkout">
  <label for="name">收件人</label>
  <input id="name" name="name" autocomplete="name" required>
  <label for="phone">手機號碼</label>
  <input id="phone" name="phone" type="tel" autocomplete="tel" required>
  <label for="card">信用卡號碼</label>
  <input id="card" name="card" inputmode="numeric" autocomplete="cc-number" required>
  <button>付款</button>
</form>`;
const REMEMBER_HEAD = String.raw`const form = document.querySelector('#checkout');
const nameField = document.querySelector('#name');
const phoneField = document.querySelector('#phone');
`;
const REMEMBER_RESTORE = String.raw`
// 1. 頁面載入時：上次存過的收件人與手機號碼，填回欄位
const savedName = localStorage.getItem('checkout-name');
const savedPhone = localStorage.getItem('checkout-phone');
if (savedName !== null) nameField.value = savedName;
if (savedPhone !== null) phoneField.value = savedPhone;
`;
const REMEMBER_SAVE = String.raw`
// 2. 表單送出時：把收件人與手機號碼存起來（卡號不存）
form.addEventListener('submit', () => {
  localStorage.setItem('checkout-name', nameField.value);
  localStorage.setItem('checkout-phone', phoneField.value);
});
`;

const exRemember: WebExercise = {
  id: 'mob05-ex-remember', title: '記住收件人與手機號碼，卡號不記',
  statement: 'index.html 與 style.css 不能改。小島外送的常客每次結帳都要重打收件人與手機號碼。請完成 script.js：(1) 表單 `#checkout` 送出時，用 `localStorage.setItem()` 把收件人 `#name` 的值存在 `checkout-name`，把手機號碼 `#phone` 的值存在 `checkout-phone`；(2) 頁面載入時，如果 localStorage 裡有這兩筆資料，就把它們填回各自的欄位；(3) 信用卡號碼 `#card` 絕對不要存：localStorage 裡不能出現 `checkout-card`。請用 `getItem()` 與 `setItem()` 這兩個方法（這個預覽的 localStorage 不支援 `localStorage.name` 這種寫法）。答案不能寫死：檢查除了以第一次來的顧客填表、送出之外，還會換成一位上次存過資料的回訪顧客，確認欄位一載入就已經填好。預覽下方的「儲存的資料」會列出目前存了什麼；按「執行」相當於重新整理頁面。',
  hints: [
    '兩件事發生在不同的時間：「填回欄位」在指令稿一開始執行時做一次；「存起來」要等使用者送出，所以寫在 `submit` 的監聽器裡。',
    '`localStorage.getItem(\'checkout-name\')` 在沒有存過時會回傳 `null`：先判斷不是 `null`，再把它指定給 `nameField.value`。',
    '存的時候一筆一筆寫：`localStorage.setItem(\'checkout-name\', nameField.value)`，手機號碼也一樣。不要用迴圈把表單的每個欄位都存進去，卡號會跟著被存。',
  ],
  explanation: '指令稿一載入就用 `getItem()` 讀出上次存的兩筆資料：第一次來的顧客讀到的是 `null`，欄位保持空白；回訪的顧客則看到已經填好的收件人與手機號碼，可以直接往下填。存的動作放在 `submit` 的監聽器裡，存到的才是使用者確認過、真的送出的內容。兩個 `setItem()` 是一筆一筆明確寫出來的，卡號不在其中：localStorage 裡的資料是明文，同一個網站的任何指令稿都讀得到，而且會一直留在這台裝置上，所以卡號、安全碼、密碼這類資料不能放進去。卡號要省力，靠的是 HTML 裡已經寫好的 `autocomplete="cc-number"`：由瀏覽器保管，使用者自己選擇要不要填入。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  fixed: { html: REMEMBER_HTML, css: FORM_CSS },
  starter: { js: REMEMBER_HEAD + String.raw`
// 1. 頁面載入時：上次存過的收件人與手機號碼，填回欄位


// 2. 表單送出時：把收件人與手機號碼存起來（卡號不存）
form.addEventListener('submit', () => {

});
` },
  solution: { js: REMEMBER_HEAD + REMEMBER_RESTORE + REMEMBER_SAVE },
  steps: [
    { do: 'input', selector: '#name', value: '林小安' },
    { do: 'input', selector: '#phone', value: '0912345678' },
    { do: 'input', selector: '#card', value: '1234 5678 9012 3456' },
    { do: 'submit', selector: '#checkout' },
    { check: 'submitted', count: 1, label: '第一次來的顧客填好三個欄位，表單照常送出一次' },
    { check: 'storage', key: 'checkout-name', value: '林小安', label: '送出之後，localStorage 的 `checkout-name` 是剛才填的收件人' },
    { check: 'storage', key: 'checkout-phone', value: '0912345678', label: '`checkout-phone` 是剛才填的手機號碼' },
    { check: 'storage', key: 'checkout-card', match: 'absent', label: '卡號沒有被存起來：localStorage 裡沒有 `checkout-card`' },
  ],
  variants: [{
    title: '回訪的顧客：上次存過收件人與手機號碼',
    setup: { storage: { 'checkout-name': '陳大海', 'checkout-phone': '0987654321' } },
    steps: [
      { check: 'value', selector: '#name', value: '陳大海', label: '一載入，收件人就是上次存的名字' },
      { check: 'value', selector: '#phone', value: '0987654321', label: '手機號碼也已經填好' },
      { check: 'value', selector: '#card', value: '', label: '卡號是空的' },
      { do: 'input', selector: '#phone', value: '0911222333' },
      { do: 'input', selector: '#card', value: '1234 5678 9012 3456' },
      { do: 'submit', selector: '#checkout' },
      { check: 'storage', key: 'checkout-phone', value: '0911222333', label: '改了手機號碼再送出：存的是新的號碼' },
      { check: 'storage', key: 'checkout-name', value: '陳大海', label: '收件人沒有改，仍然是原來的名字' },
      { check: 'storage', key: 'checkout-card', match: 'absent', label: '卡號仍然沒有被存' },
    ],
  }],
  mistakes: [
    { files: { js: REMEMBER_HEAD + String.raw`
// 1. 頁面載入時：把存過的每個欄位填回去
for (const field of form.elements) {
  const saved = localStorage.getItem('checkout-' + field.name);
  if (field.name && saved !== null) field.value = saved;
}

// 2. 表單送出時：把每個欄位都存起來
form.addEventListener('submit', () => {
  for (const field of form.elements) {
    if (field.name) localStorage.setItem('checkout-' + field.name, field.value);
  }
});
` }, why: '用迴圈把表單裡每一個有 `name` 的欄位都存起來。程式比較短，卡號卻也跟著進了 localStorage：明文、任何指令稿都讀得到、下一個用這台裝置的人也看得到。要存哪些欄位必須一個一個明確列出來，敏感的資料不在名單上。' },
    { files: { js: REMEMBER_HEAD + String.raw`
// 1. 頁面載入時：上次存過的收件人與手機號碼，填回欄位

` + REMEMBER_SAVE }, why: '只做了「存」，沒有做「填回」。資料的確在 localStorage 裡，但回訪的顧客看到的仍然是空白的欄位，還是得重打一次：存起來的資料沒有在載入時讀出來，就等於沒存。' },
    { files: { js: REMEMBER_HEAD + REMEMBER_RESTORE + String.raw`
// 2. 把收件人與手機號碼存起來（卡號不存）
localStorage.setItem('checkout-name', nameField.value);
localStorage.setItem('checkout-phone', phoneField.value);
` }, why: '`setItem()` 沒有寫在 `submit` 的監聽器裡。指令稿只在頁面載入時從頭執行一次，那時使用者還沒有輸入任何東西：存進去的是載入當下欄位的值，之後填的、改的都不會被存。要在事件發生時做的事，必須寫在那個事件的監聽器裡。' },
  ],
};

const DELIVERY_FIELDS: [string, string, string][] = [
  ['name', '收件人', 'name="name" autocomplete="name"'],
  ['phone', '手機號碼', 'name="phone" type="tel" autocomplete="tel"'],
  ['email', '電子郵件', 'name="email" type="email" autocomplete="email"'],
  ['address', '地址', 'name="address" autocomplete="address-line1"'],
  ['floor', '樓層與房號', 'name="floor" autocomplete="address-line2"'],
  ['note', '給外送員的話', 'name="note"'],
];
const DELIVERY_HTML = `<header id="top"><h1>小島外送：外送資料</h1></header>
<main>
  <form id="delivery">
${DELIVERY_FIELDS.map(([id, label, attrs]) => `    <div class="field">
      <label for="${id}">${label}</label>
      <input id="${id}" ${attrs}>
    </div>`).join('\n')}
    <button id="next">下一步：付款</button>
  </form>
  <section id="terms">
    <h2>訂購須知</h2>
    <p>每天上午十一點開始接單。</p>
    <p>送出後三分鐘內可以取消。</p>
    <p>下雨天送達時間會晚一點。</p>
    <p>餐點送達時請當面確認。</p>
  </section>
</main>`;
const DELIVERY_BASE_CSS = String.raw`body { margin: 0; font-family: sans-serif; }
/* 版面：以下到「請在這裡」為止請保留 */
#top {
  position: sticky;
  top: 0;
  height: 64px;
  padding: 0 16px;
  background-color: #ffcc80;
}
#top h1 { margin: 0; font-size: 18px; line-height: 64px; }
main { padding: 16px; }
.field { height: 80px; margin-bottom: 16px; }
.field label { display: block; height: 24px; margin-bottom: 8px; line-height: 24px; }
.field input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 48px;
  padding: 0 12px;
  font: inherit;
  font-size: 16px;
}
#next { display: block; width: 100%; height: 48px; font: inherit; }
#terms {
  box-sizing: border-box;
  height: 480px;
  margin-top: 16px;
  padding: 8px 16px;
  overflow: hidden;
  background-color: #eceff1;
}
#terms h2 { margin: 8px 0; font-size: 18px; }

/* 請在這裡加上你的規則 */
`;
const DELIVERY_JS_HEAD = String.raw`const form = document.querySelector('#delivery');

// 欄位取得焦點時，把它捲到看得到的位置。請寫在下面
`;
const deliveryFocus = (block: string) => String.raw`form.addEventListener('focusin', (event) => {
  if (event.target.matches('input')) {
    event.target.scrollIntoView({ block: '` + block + String.raw`' });
  }
});
`;
const focusAt = (id: string) => [{ do: 'click', selector: `#${id}` }, { do: 'wait', ms: 400 }] as const;

const exFieldScroll: WebExercise = {
  id: 'mob05-ex-field-scroll', title: '取得焦點的欄位：停在頁首下方、視窗的上半部',
  statement: 'index.html 不能改。小島外送的外送資料頁有一個 64px 高、黏在視窗上緣的頁首 `#top`，下面是六個欄位。每個欄位的標籤在輸入框的正上方，從標籤的上緣到輸入框的上緣是 32px（標籤 24px 加間距 8px）；輸入框高 48px。視窗是 360 × 640：手機的虛擬鍵盤出現時，大約會蓋住下半部，所以正在填的欄位必須在上半部。請修改 style.css 與 script.js，讓任何一個輸入框取得焦點之後：(1) 輸入框和它的標籤都完整地出現在頁首下方，也就是標籤的上緣離視窗頂端至少 64px；(2) 輸入框的下緣離視窗頂端不超過 320px。style.css 裡原有的版面規則請保留。檢查會依序點「地址」`#address`、「給外送員的話」`#note`、再回頭點最上面的「收件人」`#name`，每次點完等 0.4 秒，再量輸入框與標籤在視窗裡的位置。請不要使用平滑捲動（`behavior: \'smooth\'` 或 `scroll-behavior: smooth`）：捲動還在進行時量到的位置不算數。桌機的預覽沒有虛擬鍵盤，這裡檢查的是欄位最後停在視窗的哪裡；寫完之後請用手機開啟這一頁，在預覽裡實際點一次欄位。',
  hints: [
    '桌機的瀏覽器沒有鍵盤要閃避：「地址」一開始就在視窗裡（下半部），已經看得到的欄位它不會再捲動。所以只寫 CSS 不夠，要在欄位取得焦點時自己呼叫 `scrollIntoView()`。`focus` 事件不會冒泡，會冒泡的是 `focusin`，可以登記在表單上。',
    '`scrollIntoView({ block: \'start\' })` 把元素對齊視窗的上緣，這樣它會跑到頁首底下。用 `scroll-margin-top` 告訴瀏覽器要在元素上方多留多少：頁首 64px，加上標籤與間距的 32px。',
    'style.css：`.field input { scroll-margin-top: 96px; }`。script.js：在 `form` 上監聽 `focusin`，`event.target` 是輸入框時呼叫 `event.target.scrollIntoView({ block: \'start\' })`。',
  ],
  explanation: '`scrollIntoView({ block: \'start\' })` 把取得焦點的輸入框捲到視窗的上緣，而 `scroll-margin-top: 96px` 讓它在上緣下方 96px 的地方停住：64px 讓給黏在上面的頁首，32px 讓給標籤，所以標籤的上緣剛好在頁首的下緣，輸入框的下緣在 144px，遠在視窗一半的 320px 之上。選擇對齊上緣，是因為那裡離鍵盤最遠：不論鍵盤多高，欄位都看得到。`block: \'center\'` 把欄位放在視窗的中央一帶，輸入框會落進下半部，也就是鍵盤可能蓋住的地方。監聽器登記在表單上、用的是會冒泡的 `focusin`，所以六個欄位只需要一個監聽器；點「下一步」按鈕時 `event.target` 不是輸入框，頁面不會亂捲。同樣的效果也可以把 `scroll-margin-top` 換成寫在 `html` 上的 `scroll-padding-top: 96px`，或把 `scroll-margin-top: 64px` 寫在 `.field` 上、再捲動 `event.target.closest(\'.field\')`。',
  viewport: { width: 360, height: 640 },
  widths: [360, 412],
  fixed: { html: DELIVERY_HTML },
  starter: { css: DELIVERY_BASE_CSS, js: DELIVERY_JS_HEAD },
  solution: { css: DELIVERY_BASE_CSS + String.raw`.field input { scroll-margin-top: 96px; }
`, js: DELIVERY_JS_HEAD + deliveryFocus('start') },
  steps: [
    ...focusAt('address'),
    { check: 'box', selector: '#address', measure: 'top', value: 64, op: 'min', from: ':viewport', label: '點「地址」`#address`：輸入框的上緣離視窗頂端至少 64px，沒有被頁首蓋住' },
    { check: 'box', selector: 'label[for="address"]', measure: 'top', value: 64, op: 'min', from: ':viewport', label: '它的標籤也完整地在頁首下方：標籤的上緣離視窗頂端至少 64px' },
    { check: 'box', selector: '#address', measure: 'bottom', value: 320, op: 'max', from: ':viewport', label: '輸入框在視窗的上半部：下緣離視窗頂端不超過 320px' },
    ...focusAt('note'),
    { check: 'box', selector: '#note', measure: 'bottom', value: 320, op: 'max', from: ':viewport', label: '接著點最後一個欄位 `#note`：它的下緣同樣不超過 320px' },
    ...focusAt('name'),
    { check: 'box', selector: 'label[for="name"]', measure: 'top', value: 64, op: 'min', from: ':viewport', label: '回頭點最上面的「收件人」`#name`：頁面往回捲，標籤的上緣仍然離視窗頂端至少 64px' },
    { check: 'box', selector: '#name', measure: 'bottom', value: 320, op: 'max', from: ':viewport', label: '`#name` 的下緣也不超過 320px' },
  ],
  mistakes: [
    { files: { css: DELIVERY_BASE_CSS + String.raw`.field input { scroll-margin-top: 64px; }
`, js: DELIVERY_JS_HEAD + deliveryFocus('start') }, why: '`scroll-margin-top` 只留了頁首的 64px。輸入框的確停在頁首的正下方，但它上面的標籤被頁首蓋住了：使用者看到一個空白的輸入框，卻不知道這一格要填什麼。要留的是頁首的高度，再加上標籤與間距的 32px。' },
    { files: { css: DELIVERY_BASE_CSS + String.raw`.field input { scroll-margin-top: 96px; }
`, js: DELIVERY_JS_HEAD + deliveryFocus('center') }, why: '用了 `block: \'center\'`。欄位被放在整個視窗的中央一帶，輸入框的下緣落在 320px 以下：鍵盤蓋住下半部的時候，它就在鍵盤的邊緣或底下。視窗的中央不等於「鍵盤上方剩下那一塊」的中央。' },
    { files: { css: DELIVERY_BASE_CSS + String.raw`.field input { scroll-margin-top: 96px; }
`, js: DELIVERY_JS_HEAD }, why: '只在 CSS 寫了 `scroll-margin-top`，沒有任何東西去捲動頁面。`scroll-margin` 只在「有人把這個元素捲進畫面」的時候才有作用；「地址」取得焦點時本來就在視窗裡，這一頁沒有人去捲它，它就留在下半部，也就是鍵盤會出現的地方。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const MOB05: LessonContent = {
  lessonId: 'MOB05',
  motivation: '在手機上填表單，每一個字都是用拇指在半個螢幕大的鍵盤上敲出來的，而那個鍵盤同時蓋住了半張表單。這一課讓一份結帳表單在手機上好填：用 `type` 與 `inputmode` 叫出合適的鍵盤，用 `autocomplete` 讓瀏覽器代填，用預設值與選項減少輸入量，並確保正在填的欄位不會被黏在上方的頁首或虛擬鍵盤遮住。',
  sections: [
    {
      id: 'mob05-typing-cost-section', title: '手機上的每個欄位都是成本：type 決定鍵盤',
      blocks: [
        { type: 'p', text: '虛擬鍵盤（virtual keyboard）是手機螢幕上畫出來的鍵盤：使用者點了一個可以輸入的欄位，它就從螢幕下方出現。和桌上的實體鍵盤相比，它的按鍵比「觸控目標與手勢的實作」那一課建議的 44px 還小，沒有觸感，數字與符號還要切換到另一層才打得到；它出現的時候，螢幕的下半部就不再是你的頁面。所以在手機上，每一個要打字的欄位都是成本。「行動情境與限制」說過，手機的使用是短暫、常被打斷的：表單越難填，填到一半放棄的人越多。這一課做三件事：叫出對的鍵盤，讓使用者少打字，以及不讓鍵盤遮住正在填的欄位。' },
        { type: 'p', text: '先看鍵盤。出現哪一種鍵盤，是瀏覽器依欄位的屬性決定的，第一個線索就是「表單元素與原生驗證」學過的 `type`。那一課看的是驗證，這裡看同一個屬性對鍵盤的影響：' },
        { type: 'table', head: ['type 的值', '手機上通常出現的鍵盤', '瀏覽器另外做的事'], rows: [
          ['`text`（沒寫時的預設）', '一般的文字鍵盤', '不檢查內容'],
          ['`email`', '文字鍵盤，`@` 與 `.` 直接在第一層', '有填寫時檢查電子郵件的格式'],
          ['`tel`', '撥號用的鍵盤：0 到 9、`+`、`*`、`#`', '不檢查格式：各地電話號碼的寫法差太多'],
          ['`url`', '文字鍵盤，`/` 與 `.` 直接在第一層', '有填寫時檢查網址的格式'],
          ['`search`', '文字鍵盤，Enter 鍵常標示成搜尋', '外觀可能略有不同，例如多一個清除的按鈕'],
          ['`number`', '數字鍵盤（樣式依裝置而不同）', '只接受數字，可以用方向鍵或微調按鈕加一、減一'],
        ] },
        { type: 'p', text: '表格裡寫的是「通常」：鍵盤實際的樣子由手機的作業系統與使用者安裝的輸入法決定，網頁給的只是提示，每一台裝置都可能不一樣。所以這一課的頁面一定要用自己的手機點一次。反過來說，在桌機上你什麼都看不到：桌機沒有虛擬鍵盤，預覽跟著你自己的裝置走，這些屬性在桌機上只能從「瀏覽器建立的 DOM 樹」確認有沒有寫對。' },
        { type: 'p', text: '表格的最後一列最容易被誤用。電話、郵遞區號、信用卡號碼、簡訊驗證碼都是數字，`type="number"` 看起來是理所當然的選擇，它在手機上通常也的確會叫出數字鍵盤。「表單元素與原生驗證」已經提醒過 `number` 是給數量用的；下面的範例把原因攤開來看。' },
        { type: 'example', id: 'mob05-number-trap' },
        { type: 'p', text: '兩個欄位一開始都是 `0912345678`。按「在 A 按一下向上鍵」：A 變成 `912345679`。瀏覽器把內容當成一個數字加了一，開頭的 0 消失，最後一碼也變了，而 B 沒有任何變化。在桌機上可以直接點進 A、按鍵盤的向上鍵，效果和這顆按鈕相同；有些瀏覽器連滑鼠滾輪滾過取得焦點的數量欄位，都會改變它的值。再按「兩欄都改填 0912-345-678」：B 原樣收下，A 的值變成空的，因為有連字號的內容不是一個數字。' },
        { type: 'list', items: [
          '數量欄位的值可以加減：方向鍵、欄位旁的微調按鈕，使用者一個不小心，號碼就被悄悄改掉。',
          '內容一旦被當成數字，開頭的 0 就沒有意義：`0912345678` 這個數字就是 912345678。',
          '不是數字的寫法收不下：`0912-345-678`、每四碼空一格的卡號，都會讓值變成空的。反而是 `1e3`、`-5` 這種一點都不像卡號的內容，因為是合法的數字而被接受。',
        ] },
        { type: 'callout', tone: 'warning', title: '由數字組成，不等於是數量', text: '判斷的方法是問一句：「這個值加一，有沒有意義？」便當 3 份加一是 4 份，有意義，用 `type="number"`。手機號碼加一是別人的號碼，卡號、郵遞區號、驗證碼、統一編號加一都沒有意義：它們是由數字組成的一串符號，不是數量，不能用 `type="number"`。它們該怎麼叫出數字鍵盤，下一節說明。' },
      ],
    },
    {
      id: 'mob05-inputmode-section', title: '數字鍵盤不靠 number：inputmode 與 enterkeyhint',
      blocks: [
        { type: 'p', text: '不用 `number`，數字鍵盤從哪裡來？答案是 `inputmode` 屬性。它只做一件事：向瀏覽器提示「這個欄位適合哪一種虛擬鍵盤」。它不驗證內容，不改變欄位的值，也不改變欄位的行為。所以卡號可以寫成 `type="text" inputmode="numeric"`：欄位仍然是一般的文字欄位，空格與開頭的 0 都保得住，方向鍵不會改它；而手機上通常會出現只有數字的鍵盤。`inputmode` 的值有八個：' },
        { type: 'table', head: ['inputmode 的值', '通常出現的鍵盤', '適合的欄位'], rows: [
          ['`numeric`', '只有 0 到 9 的數字鍵盤', '卡號、郵遞區號、驗證碼、統一編號'],
          ['`decimal`', '數字加上小數點（依地區是 `.` 或 `,`）', '重量、長度這類有小數的量'],
          ['`tel`', '撥號用的鍵盤', '電話（通常直接用 `type="tel"`）'],
          ['`email`', '有 `@` 的文字鍵盤', '電子郵件（通常直接用 `type="email"`）'],
          ['`url`', '有 `/` 的文字鍵盤', '網址（通常直接用 `type="url"`）'],
          ['`search`', 'Enter 鍵標示成搜尋的文字鍵盤', '搜尋框'],
          ['`text`', '一般的文字鍵盤', '預設值，不必寫'],
          ['`none`', '不顯示虛擬鍵盤', '頁面自己畫了按鍵的元件，例如自製的數字盤'],
        ] },
        { type: 'p', text: '`type` 與 `inputmode` 的分工是：`type` 決定這個欄位是什麼（怎麼驗證、值可不可以加減、預設的鍵盤），`inputmode` 只在這之上調整鍵盤。有專用 `type` 的資料就用 `type`，因為同時得到格式檢查；沒有專用 `type` 的數字資料，用文字欄位加上 `inputmode`。整理成一張表：' },
        { type: 'table', head: ['欄位', '寫法', '理由'], rows: [
          ['電子郵件', '`type="email"`', '鍵盤通常有 `@`，瀏覽器檢查格式'],
          ['手機、市話', '`type="tel"`', '通常是撥號鍵盤；開頭的 0、`+` 與連字號都留得住'],
          ['份數、人數', '`type="number"`', '真的是數量：可以加減，可以用 `min`、`max` 限制'],
          ['郵遞區號、卡號、驗證碼', '`type="text"` 加上 `inputmode="numeric"`', '一串數字符號，不是數量'],
          ['重量、長度', '`type="text"` 加上 `inputmode="decimal"`', '需要小數點，但不想要數量欄位的加減行為'],
          ['姓名、地址、備註', '`type="text"` 或 `<textarea>`', '一般的文字'],
        ] },
        { type: 'p', text: '虛擬鍵盤右下角的 Enter 鍵也可以調整。`enterkeyhint` 屬性請鍵盤把這顆鍵標示成某個動作（文字或圖示，由鍵盤決定），常用的值有：`search` 是搜尋，`send` 是送出，`go` 是前往，`next` 是下一欄，`done` 是完成。它和 `inputmode` 一樣只是標示：按下去會發生什麼事完全不變。表單裡的單行欄位按 Enter 仍然是送出表單，所以標示要和實際會發生的事一致：搜尋框用 `search`，按了就送出訂單或訊息的欄位用 `send`；`next` 只有在你真的用指令稿讓 Enter 把焦點移到下一欄時才用，否則鍵盤上寫著「下一欄」，按下去卻把表單送出了。' },
        { type: 'p', text: '手機鍵盤通常還會自動把句子的第一個字母改成大寫，並標示或修正它認為拼錯的字。對一般的句子這是幫忙，對優惠碼、帳號、車牌這類內容卻是干擾。`autocapitalize` 控制自動大寫：`none` 是不要，`characters` 是每個字母都大寫（適合 `SEA2026` 這種優惠碼）；`spellcheck="false"` 則是請瀏覽器不要檢查這一格的拼字。電子郵件、網址與密碼欄位本來就不會自動大寫。' },
        { type: 'example', id: 'mob05-keyboards' },
        { type: 'p', text: '用手機開啟這一頁，從「搜尋餐點」開始逐一點每個欄位，留意四件事：Enter 鍵上的標示、有沒有 `@`、郵遞區號與公斤數的鍵盤差在哪一顆鍵、優惠碼打出來的字母是不是大寫。「便當幾份」是這一頁唯一的 `type="number"`：份數是數量，預設值是 1。在桌機上，這些欄位看起來幾乎一模一樣；展開 DOM 樹，對照上面兩張表，確認每個欄位寫的是哪一種。' },
        { type: 'callout', tone: 'warning', title: '只是鍵盤的提示，不是驗證', text: '`inputmode="numeric"` 不保證欄位裡只有數字：使用者可以貼上任何文字，接了實體鍵盤的人可以打字母，在沒有虛擬鍵盤的桌機上它更是完全沒有作用。要限制內容，仍然要用 `required`、`pattern` 這些原生驗證的屬性，伺服器也要再檢查一次。另一個常見的錯誤是把值寫成 `inputmode="number"`：那不是這個屬性的值，瀏覽器不認得就當作沒寫，鍵盤還是原來的文字鍵盤。' },
        { type: 'callout', tone: 'tip', title: '欄位的字級至少 16px', text: '有些手機瀏覽器在欄位的字級小於 16px 時，會在欄位取得焦點的那一刻自動把整個頁面放大，使用者填完還得自己縮回來。把 `<input>`、`<select>`、`<textarea>` 的 `font-size` 設成至少 16px 就不會發生；這一課的頁面都這樣寫。不要用禁止縮放的 viewport 設定來處理這件事：那會讓需要放大閱讀的人無法使用。' },
      ],
    },
    {
      id: 'mob05-autocomplete-section', title: '自動完成：讓瀏覽器替使用者填',
      blocks: [
        { type: 'p', text: '最省力的輸入是不必輸入。瀏覽器與密碼管理工具會記住使用者填過的姓名、電話、地址，以及使用者同意儲存的信用卡與密碼；下一次遇到表單，使用者點一下建議，好幾個欄位一次填好，這就是自動完成（autofill）。在手機上，這可能是「點一下」與「打六十個字」的差別。要讓瀏覽器填對，每個欄位都要用 `autocomplete` 屬性說出自己要的是哪一種資料。它的值是 HTML 標準定好的一組記號，常用的有：' },
        { type: 'table', head: ['autocomplete 的值', '這個欄位要的資料'], rows: [
          ['`name`', '完整的姓名'],
          ['`email`', '電子郵件地址'],
          ['`tel`', '完整的電話號碼'],
          ['`street-address`', '街道地址，可以有好幾行，所以配 `<textarea>`；單行的欄位用 `address-line1`、`address-line2`'],
          ['`postal-code`', '郵遞區號'],
          ['`cc-number`', '信用卡號碼'],
          ['`cc-exp`', '信用卡的有效期限'],
          ['`one-time-code`', '簡訊等管道送來的一次性驗證碼'],
          ['`current-password`、`new-password`', '登入時填的現有密碼；註冊或改密碼時設定的新密碼'],
          ['`off`', '這個欄位不要自動完成'],
        ] },
        { type: 'p', text: '自動完成要成功，有三個條件。第一，記號要照標準拼：`postal-code` 不能寫成 `zip`，`cc-number` 不能寫成 `card`，瀏覽器不認得的值等於沒寫。第二，每個欄位都有 `name`：送出的資料靠它，而欄位沒有寫 `autocomplete` 時，瀏覽器通常也會從 `name`、`id` 與標籤的文字去猜這一格要什麼。第三，每個欄位都有真正的 `<label>`。後兩件是「表單元素與原生驗證」就要求過的事。有幾個記號還帶來額外的好處：在支援的手機上，`one-time-code` 讓鍵盤直接提供剛收到的簡訊驗證碼；`new-password` 讓密碼管理工具知道這裡要的是一組新密碼，而不是把舊的填進來。' },
        { type: 'p', text: '自動完成是由使用者主導的：網頁沒有辦法自己去讀瀏覽器替使用者存的姓名、地址或卡片，要等使用者選了某一筆建議，資料才會填進欄位。所以寫上 `autocomplete` 不會洩漏任何資料，只是讓瀏覽器知道該拿哪一種資料來建議。' },
        { type: 'example', id: 'mob05-autocomplete' },
        { type: 'p', text: '展開 DOM 樹，確認七個欄位各有一個 `autocomplete`，而且沒有任何一個是 `off`。注意外送地址用的是 `<textarea>`，卡號與有效期限同時寫了 `inputmode="numeric"`：鍵盤的提示與自動完成的記號是兩件獨立的事，可以一起用。這個預覽是沙盒裡的頁面，瀏覽器不一定會在裡面提供建議；自動完成的效果，要在真正的網站上、用一個存過資料的瀏覽器才看得到。檢查能確認的是屬性有沒有寫對。' },
        { type: 'callout', tone: 'warning', title: '為了安全把自動完成關掉，通常適得其反', text: '在卡號或地址上寫 `autocomplete="off"`，並沒有保護到誰：瀏覽器存的資料本來就要使用者自己選了才會填入。它的實際效果是逼使用者每一次都用拇指打完十六個數字，打錯的機會更高，也有人因此放棄結帳。`off` 留給真的不該被記住的欄位，例如每次都要重新輸入的轉帳金額，或是店員替不同客人代填的資料。' },
      ],
    },
    {
      id: 'mob05-less-typing-section', title: '減少輸入量：少問、預設、用選的、記住',
      blocks: [
        { type: 'p', text: '鍵盤叫對了，瀏覽器也能代填了，下一步是讓使用者根本不必打。把表單的每一個欄位拿出來問一次：' },
        { type: 'list', ordered: true, items: [
          '少問。這一格不填，訂單還做得成嗎？做得成就拿掉；偶爾才需要的（發票抬頭、第二支電話）設成選填，並用「行動情境與限制」學過的 `<details>` 收起來。',
          '給預設值。最多人選的答案先替使用者選好：份數預設 1，送達時間預設「盡快送達」。預設值只用在選錯也沒有損失的地方；「訂閱電子報」這種對使用者不見得有利的選項不要預先勾選。',
          '用選的不用打的。兩到四個選項用選項按鈕，每個選項包在 `<label>` 裡，整列都是觸控目標；選項多用 `<select>`，手機通常會換成系統自己的選單；小的數量用加、減按鈕。',
          '讓瀏覽器填。上一節的 `autocomplete`。',
          '記住填過的。回訪的顧客不必再打一次，這一節的後半說明。',
        ] },
        { type: 'p', text: '版面也會影響填寫的速度。手機上的表單排成一欄，標籤放在欄位的上方：360px 的寬度放不下「標籤在左、欄位在右」，而且鍵盤出現之後畫面只剩一小塊，標籤在正上方才會和欄位一起留在畫面裡。不要用 `placeholder` 代替標籤（「表單元素與原生驗證」說過原因）。錯誤訊息放在出錯的欄位旁邊，而不是集中在頁面的最上方：鍵盤開著的時候，使用者只看得到正在填的那一格附近。' },
        { type: 'example', id: 'mob05-less-typing' },
        { type: 'p', text: '先按「送出 A」：什麼都沒打，瀏覽器把送出擋了下來，因為三個欄位都要使用者自己打字。再到 B，什麼都不要動，直接按「送出 B」：預覽下方的送出紀錄是 `qty=1`、`pay=cash`、`time=asap`，一個字都沒打就完成了。按幾次「＋」與「−」：script.js 呼叫的是數量欄位自己的 `stepUp()` 與 `stepDown()`，它們會遵守 `min` 與 `max`，所以份數不會低於 1、不會超過 9。這裡的 `type="number"` 是對的：份數是數量，加一有意義。兩顆按鈕的外框都是 48 × 48，選項按鈕的每一列至少 48px 高。' },
        { type: 'p', text: '「記住」可以用「瀏覽器儲存：localStorage 與 Cookie」學過的 `localStorage`：表單送出時用 `localStorage.setItem(\'checkout-name\', 欄位的值)` 存起來，下次頁面載入時用 `getItem()` 讀出來填回欄位。這補上了自動完成做不到的部分，例如上次選的取餐方式、常用的備註。第三個練習會實作它。' },
        { type: 'callout', tone: 'warning', title: '不是每一種資料都可以記住', text: '`localStorage` 裡的資料是明文，同一個網站上的任何指令稿都讀得到，而且會一直留在這台裝置上：下一個拿到這支手機的人，打開結帳頁就看得到。信用卡號碼、安全碼、密碼、驗證碼絕對不要存；姓名、電話、地址這類個人資料，也要讓使用者知道被記住了，並提供清除的方法。卡號想省力，交給瀏覽器的自動完成：那裡的資料由瀏覽器保管，要使用者自己選了才會填入。' },
      ],
    },
    {
      id: 'mob05-keyboard-cover-section', title: '虛擬鍵盤遮擋：鍵盤出現之後，畫面還剩多少',
      blocks: [
        { type: 'p', text: '欄位一取得焦點，虛擬鍵盤就從螢幕下方出現。它有多高依裝置、語言與輸入法而不同；手機直放時，常見的是蓋住螢幕下方四成到一半，橫放時剩下的空間更少。虛擬鍵盤遮擋指的就是：鍵盤蓋住了使用者這時候最需要看到的東西，也就是正在填的欄位、它的標籤與錯誤訊息，還有送出按鈕。' },
        { type: 'p', text: '瀏覽器會幫一部分的忙：欄位取得焦點、鍵盤出現時，手機瀏覽器通常會自己把那個欄位捲到還看得到的區域。但它幫的只有這麼多：' },
        { type: 'list', items: [
          '它保證的只有欄位本身。欄位上方的標籤、下方的錯誤訊息、再下面的送出按鈕，都可能在畫面之外或鍵盤底下。',
          '它不知道你的頁首黏在視窗上緣。欄位被捲到上緣附近時，可能正好躲在頁首後面。',
          '固定在視窗底部的東西怎麼辦，各家瀏覽器的做法不同，還會受設定影響：有的讓鍵盤直接蓋在頁面上，底部的操作列被壓在鍵盤底下；有的把視窗縮短到鍵盤的上緣，操作列浮在鍵盤上方，把本來就不多的空間再吃掉一塊。',
        ] },
        { type: 'p', text: '最後一點帶來一條簡單的規則：表單畫面上，重要的操作不要固定在視窗的最底部。「行動情境與限制」把主要操作放進貼在底部的操作列，那是在沒有鍵盤的畫面；到了要打字的畫面，送出按鈕應該接在最後一個欄位的後面，跟著頁面一起捲動。使用者填完最後一格，按鈕就在它下面；鍵盤的 Enter 鍵也可以送出表單，用 `enterkeyhint="send"` 把它標示出來。' },
        { type: 'callout', tone: 'note', title: '桌機的預覽沒有虛擬鍵盤', text: '這一節與下一節的範例，在頁面上畫了一塊 280px 高的灰色區塊代替鍵盤：表單裡有欄位取得焦點時，它就固定在視窗底部。假鍵盤本身不需要指令稿，用的是 CSS 的 `:focus-within`：元素裡面有東西取得焦點時，這個選擇器就成立。它只是一個替身，模擬的是「鍵盤直接蓋在頁面上」的情況，用來讓你在桌機上也看得出鍵盤佔掉多少畫面。它不會做真的瀏覽器會做的事，例如把欄位捲上來。如果用手機開啟這一頁，真的鍵盤也會同時出現，正好可以比較兩者的高度。' },
        { type: 'example', id: 'mob05-keyboard-cover' },
        { type: 'p', text: '預覽是 360px 寬、約 640px 高，相當於一支小手機。點一下「地址」欄位：灰色的假鍵盤出現，蓋住視窗下方的 280px，「地址」正好在它底下，你打的字自己都看不到。真的手機瀏覽器這時通常會把欄位捲上來，假鍵盤不會，所以你看到的是沒有人處理時的樣子。再看剩下的空間：頁首佔了上面的 56px，鍵盤的上緣在 360px，中間只剩 304px，每個欄位連標籤是 88px，放得下三個多一點。固定在底部的「送出訂單」則整顆被壓在鍵盤下面。點一下欄位以外的地方（例如頁首），欄位失去焦點，假鍵盤就會收起來。' },
        { type: 'p', text: '需要知道「現在真正看得到的是哪一塊」的時候，瀏覽器提供 Visual Viewport API：`window.visualViewport` 回報目前看得到的區域的大小與位置，鍵盤出現時它的 `height` 通常會變小，並觸發 `resize` 事件。要把元素貼在鍵盤上緣這類進階的版面才用得到它；這一課的做法不需要，下一課「安全區域、方向與動態視窗高度」會繼續處理視窗高度的問題。' },
      ],
    },
    {
      id: 'mob05-field-scroll-section', title: '欄位捲動：讓正在填的欄位停在看得到的地方',
      blocks: [
        { type: 'p', text: '欄位捲動指的是把取得焦點的欄位捲到看得到的位置。做這件事的可能是瀏覽器自己（欄位取得焦點時），也可能是你的指令稿（呼叫元素的 `scrollIntoView()`）。不論是誰在捲，「把一個元素捲進畫面」都會參考兩個 CSS 屬性：' },
        { type: 'table', head: ['屬性', '寫在哪裡', '意思'], rows: [
          ['`scroll-margin-top`（以及 `-bottom`、`-left`、`-right`）', '被捲進畫面的那個元素，例如欄位', '把我捲進畫面時，在我的上方多留這麼多'],
          ['`scroll-padding-top`（以及其他三邊）', '捲動的容器；整頁捲動時寫在 `html`', '不管把誰捲進來，都避開上緣的這一段'],
        ] },
        { type: 'p', text: '「定位與堆疊順序」提過用 `scroll-padding-top` 避開固定的頁首；`scroll-margin-top` 是同一件事從元素那一邊來寫，好處是每一種元素可以留不一樣的量。要留多少，用算的：頁首 56px，欄位上方還有 28px 高的標籤，再留 8px 的空隙，一共 92px。這兩個屬性都不會讓頁面自己捲動：它們只在有人把元素捲進畫面時，決定元素停在哪裡。' },
        { type: 'p', text: '只靠瀏覽器自己捲，有兩件事不確定。第一，瀏覽器把取得焦點的欄位捲到哪裡（置中，還是剛好露出來）各家不同。第二，瀏覽器只求欄位本身露出來：它可能緊貼著鍵盤的上緣，或停在頁首的邊緣，標籤、錯誤訊息與下一格則不在畫面裡。需要確定欄位停在哪裡的時候，就在欄位取得焦點時自己呼叫 `scrollIntoView()`。它的 `block` 選項決定垂直方向怎麼對齊：`start` 是元素對齊視窗的上緣，`center` 是置中，`end` 是對齊下緣，`nearest` 是移動最少的那一邊。表單適合 `start`：上緣是離鍵盤最遠的地方，不論鍵盤多高，欄位都看得到；再配上 `scroll-margin-top`，它就停在頁首與標籤的下方。' },
        { type: 'example', id: 'mob05-field-scroll' },
        { type: 'p', text: '點一下「地址」：頁面捲動，輸入框停在離視窗頂端 92px 的地方，上方看得到它的標籤，再上面是頁首；假鍵盤在 360px 以下，離得很遠。再點最後一個欄位「給外送員的話」：同樣停在 92px，而「送出訂單」就接在它下面，整顆在鍵盤的上方。script.js 只有一個監聽器：「事件與事件委派」提過 `focus` 不會冒泡，`focusin` 會，所以把它登記在表單上，六個欄位都管得到；`event.target.matches(\'input\')` 讓按鈕取得焦點時不捲動。style.css 在送出按鈕的下方留了一大段空白：頁面要夠長，最後一個欄位才捲得到視窗的上緣。' },
        { type: 'callout', tone: 'tip', title: '動手試：拿掉留白，換一種對齊', text: '按「動手改這個範例」，把 `.field input { scroll-margin-top: 92px; }` 這一行刪掉再執行，點任何一個欄位：它被捲到視窗的最上面，整個躲在頁首後面，你打的字看不到。把那一行加回去，改成把 script.js 的 `\'start\'` 換成 `\'center\'`，再點「地址」：欄位停在視窗的中央一帶，緊貼著假鍵盤，甚至被它蓋住一部分。視窗的中央是連同鍵盤底下那一塊一起算的，不是「鍵盤上方剩下那一塊」的中央。' },
        { type: 'p', text: '最後要說清楚這些頁面驗證了什麼。這一課的檢查確認的是頁面自己做的事：欄位取得焦點之後，它和它的標籤停在視窗的什麼位置，有沒有躲在黏住的頁首後面。鍵盤本身只存在於真的手機上：它多高、出現時視窗怎麼變、瀏覽器自己又捲了多少，各家瀏覽器不同，也會隨版本改變。所以表單一定要在真的手機上、用不只一種瀏覽器實際填一次：從第一格填到送出，留意每一格取得焦點時看不看得到、標籤與錯誤訊息在不在畫面裡、送出按鈕按不按得到。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'mob05-q1', prompt: '結帳表單的信用卡號碼欄位，哪一種寫法最適合手機？',
      options: [
        '`<input type="number" name="card">`',
        '`<input type="tel" name="card" autocomplete="off">`',
        '`<input type="text" name="card" inputmode="numeric" autocomplete="cc-number">`',
        '`<input type="text" name="card" inputmode="number">`',
      ],
      answer: 2,
      explanation: '卡號是一串數字符號，不是數量：`type="text"` 讓空格與開頭的 0 都保得住，`inputmode="numeric"` 向手機要求只有數字的鍵盤，`autocomplete="cc-number"` 讓使用者可以選用瀏覽器存好的卡片。`type="number"` 會讓方向鍵把卡號加一、減一，帶空格的卡號也收不下。`type="tel"` 加 `autocomplete="off"`，叫出的雖然是撥號鍵盤，卻把自動完成關掉，逼使用者手動打完。`inputmode="number"` 不是合法的值，瀏覽器會當作沒寫。',
    },
    {
      id: 'mob05-q2', prompt: '關於 `inputmode` 屬性，哪一個說法正確？',
      options: [
        '它只向瀏覽器提示該顯示哪一種虛擬鍵盤，不驗證內容，也不改變欄位的值',
        '`inputmode="numeric"` 的欄位會拒絕所有不是數字的輸入',
        '它必須和 `type="number"` 一起寫才有作用',
        '它在桌機上會讓欄位旁邊多出加、減的微調按鈕',
      ],
      answer: 0,
      explanation: '`inputmode` 只是鍵盤的提示：欄位怎麼驗證、值能不能加減，仍然由 `type` 決定。它不會拒絕任何輸入，使用者照樣可以貼上文字或用實體鍵盤打字母；要限制內容得用 `pattern` 這類驗證屬性。它最常搭配的正是 `type="text"`，用來替不是數量的數字資料叫出數字鍵盤。微調按鈕是 `type="number"` 的行為，和 `inputmode` 無關；在沒有虛擬鍵盤的桌機上，`inputmode` 沒有任何看得見的效果。',
    },
    {
      id: 'mob05-q3', prompt: '下面的手機號碼欄位取得焦點後，使用者不小心按了一下鍵盤的向上鍵。欄位的值會變成什麼？',
      code: { language: 'HTML', text: '<label for="phone">手機號碼</label>\n<input id="phone" name="phone" type="number" value="0912345678">' },
      options: [
        '仍然是 `0912345678`：向上鍵只會移動游標',
        '`0912345679`：加一，但開頭的 0 會保留',
        '變成空的：`0912345678` 不是合法的數字',
        '`912345679`：內容被當成數字加一，開頭的 0 也不見了',
      ],
      answer: 3,
      explanation: '`type="number"` 的欄位是數量欄位，向上鍵會把值加一；瀏覽器把 `0912345678` 當成數字 912345678，加一之後寫回去的是 `912345679`，開頭的 0 沒有保留。向上鍵只移動游標，是文字欄位與 `type="tel"` 的行為。`0912345678` 本身是合法的數字，所以一開始不會被清空；會被清空的是 `0912-345-678` 這種不是數字的寫法。這正是電話號碼不該用 `type="number"` 的原因。',
    },
    {
      id: 'mob05-q4', prompt: '登入流程的最後一步要使用者輸入簡訊收到的六位數驗證碼。哪一種寫法能讓支援的手機鍵盤直接提供剛收到的驗證碼？',
      options: [
        '`<input type="number" autocomplete="off">`',
        '`<input type="text" inputmode="numeric" autocomplete="one-time-code">`',
        '`<input type="password" autocomplete="current-password">`',
        '`<input type="text" inputmode="numeric" autocomplete="sms">`',
      ],
      answer: 1,
      explanation: '`one-time-code` 是 HTML 標準裡代表一次性驗證碼的 `autocomplete` 記號；配上 `type="text"` 與 `inputmode="numeric"`，要求的是數字鍵盤，開頭是 0 的驗證碼也不會出錯。`type="number"` 會把 `012345` 當成數量，`autocomplete="off"` 又關掉了建議。`current-password` 要的是使用者存過的登入密碼，不是驗證碼。`sms` 不是標準裡的記號，瀏覽器不認得的值等於沒寫。',
    },
    {
      id: 'mob05-q5', prompt: '搜尋框寫了 `enterkeyhint="search"`。這個屬性做了什麼？',
      options: [
        '讓使用者按 Enter 時送出搜尋；沒有它，Enter 不會送出表單',
        '在欄位旁邊加上一顆搜尋按鈕',
        '讓瀏覽器記住使用者搜尋過的字',
        '請虛擬鍵盤把 Enter 鍵標示成搜尋；按下去會發生什麼事不變',
      ],
      answer: 3,
      explanation: '`enterkeyhint` 只改變虛擬鍵盤上 Enter 鍵的標示（文字或圖示由鍵盤決定），按下去之後發生的事完全不變：表單裡的單行欄位按 Enter 本來就會送出表單，和有沒有這個屬性無關。它不會在頁面上增加任何元素；搜尋按鈕要自己寫。記住輸入過的內容是自動完成的事，和這個屬性無關。也因為它只是標示，標示必須和實際會發生的事一致。',
    },
    {
      id: 'mob05-q6', prompt: '外送表單要問「取餐方式」，答案只有「外送」「自取」兩種，大約八成的訂單是外送。哪一種設計讓使用者在手機上輸入最少？',
      options: [
        '一個文字欄位，`placeholder` 寫「請輸入外送或自取」',
        '兩個選項按鈕，都不預先選取，並設成必填',
        '兩個包在 `<label>` 裡的選項按鈕，預先選好「外送」',
        '一個 `<select>`，第一個選項是「請選擇」',
      ],
      answer: 2,
      explanation: '只有兩個答案時，選項按鈕讓兩個選項都直接看得到，點一下就完成；預先選好最多人選的「外送」，八成的使用者連那一下都省了，`<label>` 則讓整列都是觸控目標。文字欄位要叫出鍵盤打字，還會收到各種寫法，而且用 `placeholder` 當說明，一打字就消失。不預選的選項按鈕讓每個人都必須點一次。`<select>` 要先點開、再選、再關上，「請選擇」這個預設值也沒有替任何人省事；它適合選項多的時候。',
    },
    {
      id: 'mob05-q7', prompt: '頁面有一個 56px 高、`position: sticky; top: 0` 的頁首。表單驗證失敗時，指令稿對第一個出錯的欄位呼叫 `scrollIntoView({ block: \'start\' })`，結果欄位被頁首蓋住。哪一個修正最直接？',
      options: [
        '替欄位加上 `scroll-margin-top`，值至少是頁首的高度',
        '替欄位加上 `margin-top: 56px`',
        '替欄位加上 `z-index: 10`',
        '把頁首改成 `position: fixed`',
      ],
      answer: 0,
      explanation: '`scroll-margin-top` 告訴瀏覽器：把這個元素捲進畫面時，在它上方多留這麼多，所以欄位會停在頁首的下方；要連標籤一起露出來，就再加上標籤的高度。`margin-top` 會真的在每個欄位上方多出 56px 的空白，改變了版面，對齊的位置卻還是欄位自己的上緣。`z-index` 改的是誰疊在上面，不是捲動後停在哪裡：就算欄位疊到頁首上面，兩者仍然重疊。`position: fixed` 的頁首同樣蓋在內容上面，問題不變。',
    },
    {
      id: 'mob05-q8', prompt: '一張很長的結帳表單，把「送出訂單」用 `position: fixed; bottom: 0` 固定在視窗底部。使用者在手機上點了欄位、虛擬鍵盤出現之後，哪一個說法最正確？',
      options: [
        '所有瀏覽器都會自動把固定在底部的按鈕移到鍵盤上方，不需要處理',
        '按鈕可能被壓在鍵盤底下，也可能浮在鍵盤上方佔掉空間，各瀏覽器不同；讓它接在最後一個欄位後面比較穩當',
        '只要替按鈕加上 `enterkeyhint="send"`，它就會跟著鍵盤移動',
        '虛擬鍵盤是頁面的一部分，可以用 `z-index` 讓按鈕疊在鍵盤上面',
      ],
      answer: 1,
      explanation: '鍵盤出現時視窗怎麼變，各家瀏覽器的做法不同：有的讓鍵盤直接蓋在頁面上，固定在底部的東西被壓在下面；有的把視窗縮短，固定的操作列浮在鍵盤上方，再吃掉一塊空間。兩種都不理想，所以表單畫面上的送出按鈕應該跟著最後一個欄位一起捲動。`enterkeyhint` 是寫在欄位上的屬性，只改 Enter 鍵的標示，不會移動任何元素。虛擬鍵盤屬於作業系統，不在頁面裡，頁面的 `z-index` 管不到它。',
    },
  ],
  webCode: {
    examples: [numberTrap, keyboards, autocompleteForm, lessTyping, keyboardCover, fieldScroll],
    exercises: [exKeyboards, exLessTyping, exRemember, exFieldScroll],
  },
};
