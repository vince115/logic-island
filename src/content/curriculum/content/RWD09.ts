import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD09 fluid type and clamp() (RWD-3). A web-code lesson of HTML and CSS only; the prerequisite is RWD02 (rem, vw,
 * min() and max() in one paragraph). Every size is a computed font-size, padding or box width measured in Chromium at
 * widths below the minimum point, between the two points and above the maximum point (resize steps); the numbers are
 * chosen so that each one is a whole number of px at the checked width. Checks whose px follow from rem pin the root
 * font size in the fixed HTML (16px), and two exercises are run again with a 20px root: the stand-in for a user who
 * raised the browser's default font size, which the preview cannot change. Page zoom cannot be simulated at all: the
 * text explains it with worked numbers and sends the learner to try it. Type scales (UI island) and responsive images
 * (RWD10) are not taught here.
 */

/** A whole document whose root states its font size: the browser's default (16) or a user's larger setting (20). */
const rootPage = (rootPx: number, title: string, body: string) => `<!DOCTYPE html>
<html lang="zh-Hant" style="font-size: ${rootPx}px;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body>
${body}
</body>
</html>`;

// ---- examples ---------------------------------------------------------------------------------------------------
const stepsAndVw: WebExample = {
  id: 'rwd09-steps-and-vw', title: '兩種舊做法：階梯式字級與純 vw',
  description: '島嶼圖書館的兩行標題。`#step` 用媒體查詢換字級：基本 `1.25rem`，600px 以上 `1.75rem`，900px 以上 `2.5rem`。`#vw` 只寫 `font-size: 5vw`。最下面是 `1rem` 的內文，用來對照。以下的數字以瀏覽器預設的 16px 根字級計算。',
  viewport: { width: 320, height: 400 },
  widths: [320, 599, 600, 1600],
  files: {
    html: String.raw`<p id="step" class="title">階梯式：島嶼圖書館</p>
<p id="vw" class="title">純 vw：島嶼圖書館</p>
<p>內文：今天開放到晚上九點。</p>`,
    css: String.raw`body { margin: 0; padding: 1rem; }
p { margin: 0; }
.title { margin-bottom: 0.5rem; font-weight: bold; line-height: 1.3; }

/* 階梯式：每個斷點換一個固定的字級 */
#step { font-size: 1.25rem; }
@media (min-width: 600px) { #step { font-size: 1.75rem; } }
@media (min-width: 900px) { #step { font-size: 2.5rem; } }

/* 純 vw：字級永遠是視窗寬度的 5% */
#vw { font-size: 5vw; }`,
  },
  observe: [
    { check: 'style', selector: '#step', property: 'font-size', value: '20px', label: '視窗寬 320px：階梯式的標題是基本樣式的 1.25rem，也就是 20px' },
    { check: 'style', selector: '#vw', property: 'font-size', value: '16px', label: '同一個寬度，`5vw` 是 320 × 5% = 16px：和內文一樣大，標題不像標題' },
    { do: 'resize', width: 599 },
    { check: 'style', selector: '#step', property: 'font-size', value: '20px', label: '視窗寬 599px：階梯式的標題仍然是 20px，從 320px 一路沒有變過' },
    { do: 'resize', width: 600 },
    { check: 'style', selector: '#step', property: 'font-size', value: '28px', label: '視窗寬 600px：只多 1px，階梯式的標題一口氣跳到 28px' },
    { do: 'resize', width: 1600 },
    { check: 'style', selector: '#vw', property: 'font-size', value: '80px', label: '視窗寬 1600px：`5vw` 是 80px，而且視窗再寬還會繼續變大' },
  ],
};

const minMaxClamp: WebExample = {
  id: 'rwd09-min-max-clamp', title: '同一個 5vw，套上 min()、max() 與 clamp()',
  description: '四行字的偏好值都是 `5vw`。第一行什麼都沒加；第二行用 `min()` 加上限 `2.5rem`；第三行用 `max()` 加下限 `1.25rem`；第四行用 `clamp()` 兩邊都加。以瀏覽器預設的 16px 根字級計算，`1.25rem` 是 20px，`2.5rem` 是 40px。',
  viewport: { width: 320, height: 400 },
  widths: [320, 768, 1280],
  files: {
    html: String.raw`<p id="raw">5vw：沒有界線</p>
<p id="capped">min()：只有上限</p>
<p id="floored">max()：只有下限</p>
<p id="clamped">clamp()：上下都有</p>`,
    css: String.raw`body { margin: 0; padding: 1rem; }
p { margin: 0 0 0.25rem; line-height: 1.3; }

#raw     { font-size: 5vw; }
#capped  { font-size: min(5vw, 2.5rem); }
#floored { font-size: max(1.25rem, 5vw); }
#clamped { font-size: clamp(1.25rem, 5vw, 2.5rem); }`,
  },
  observe: [
    { check: 'style', selector: '#capped', property: 'font-size', value: '16px', label: '視窗寬 320px：`5vw` 是 16px。`min()` 只管上限，這一行照樣縮到 16px' },
    { check: 'style', selector: '#clamped', property: 'font-size', value: '20px', label: '`clamp()` 的最小值 1.25rem（20px）比 16px 大，由最小值勝出：20px' },
    { do: 'resize', width: 768 },
    { check: 'style', selector: '#clamped', property: 'font-size', value: '38.4px', label: '視窗寬 768px：`5vw` 是 38.4px，落在 20px 與 40px 之間，`clamp()` 直接用它' },
    { do: 'resize', width: 1280 },
    { check: 'style', selector: '#floored', property: 'font-size', value: '64px', label: '視窗寬 1280px：`5vw` 是 64px。`max()` 只管下限，這一行跟著長到 64px' },
    { check: 'style', selector: '#clamped', property: 'font-size', value: '40px', label: '`clamp()` 的最大值 2.5rem（40px）比 64px 小，由最大值勝出：40px' },
  ],
};

const twoPoints: WebExample = {
  id: 'rwd09-two-points', title: '兩個端點算出來的 clamp()',
  description: '設計稿要標題在視窗寬 320px 時是 24px，1280px 時是 48px。`#title` 用算出來的 `clamp(1.5rem, 1rem + 2.5vw, 3rem)`；灰色的 `#line` 只寫中間的偏好值 `calc(1rem + 2.5vw)`，沒有上下限，用來對照。以預設的 16px 根字級計算。',
  viewport: { width: 320, height: 400 },
  widths: [320, 800, 1280, 1600],
  files: {
    html: String.raw`<h1 id="title">島嶼圖書館</h1>
<p id="line">沒有上下限的同一條線</p>
<p>內文維持 1rem，不跟著視窗變。</p>`,
    css: String.raw`body { margin: 0; padding: 1rem; }
h1, p { margin: 0 0 0.5rem; line-height: 1.3; }

/* 320px 時 24px，1280px 時 48px */
#title { font-size: clamp(1.5rem, 1rem + 2.5vw, 3rem); }

#line { font-size: calc(1rem + 2.5vw); color: #757575; }`,
  },
  observe: [
    { check: 'style', selector: '#title', property: 'font-size', value: '24px', label: '視窗寬 320px（第一個端點）：16 + 320 × 2.5% = 24px，剛好等於最小值 1.5rem' },
    { do: 'resize', width: 800 },
    { check: 'style', selector: '#title', property: 'font-size', value: '36px', label: '視窗寬 800px：16 + 800 × 2.5% = 36px，在兩個端點連成的直線上' },
    { do: 'resize', width: 1280 },
    { check: 'style', selector: '#title', property: 'font-size', value: '48px', label: '視窗寬 1280px（第二個端點）：16 + 32 = 48px，剛好等於最大值 3rem' },
    { do: 'resize', width: 1600 },
    { check: 'style', selector: '#line', property: 'font-size', value: '56px', label: '視窗寬 1600px：沒有上限的那一行繼續長到 16 + 40 = 56px' },
    { check: 'style', selector: '#title', property: 'font-size', value: '48px', label: '`#title` 被最大值擋住，停在 48px' },
  ],
};

const userSetting: WebExample = {
  id: 'rwd09-user-setting', title: '使用者把預設字級調成 20px 之後',
  description: '預覽沒有辦法更改你的瀏覽器設定，所以這一頁在 `<html>` 上用行內樣式把根字級寫成 20px，假裝使用者把預設字級從 16px 調大了（真實的網站不要這樣寫）。三行標題在根字級 16px、視窗寬 640px 時都是 32px：`5vw`、`2rem`、`calc(1rem + 2.5vw)`。',
  viewport: { width: 640, height: 400 },
  widths: [640, 320],
  files: {
    html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant" style="font-size: 20px;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>調大預設字級</title>
</head>
<body>
  <p id="only-vw" class="title">只有 vw</p>
  <p id="only-rem" class="title">只有 rem</p>
  <p id="mixed" class="title">rem 加 vw</p>
  <p id="text">內文是 1rem。</p>
</body>
</html>`,
    css: String.raw`body { margin: 0; padding: 1rem; }
p { margin: 0 0 0.25rem; line-height: 1.3; }
.title { font-weight: bold; }

#only-vw  { font-size: 5vw; }
#only-rem { font-size: 2rem; }
#mixed    { font-size: calc(1rem + 2.5vw); }
#text     { font-size: 1rem; }`,
  },
  observe: [
    { check: 'style', selector: '#text', property: 'font-size', value: '20px', label: '根字級是 20px：`1rem` 的內文跟著變成 20px' },
    { check: 'style', selector: '#only-vw', property: 'font-size', value: '32px', label: '`5vw` 仍然是 640 × 5% = 32px：使用者調大了字級，它完全沒有回應' },
    { check: 'style', selector: '#only-rem', property: 'font-size', value: '40px', label: '`2rem` 是 2 × 20 = 40px：從 32px 放大成 1.25 倍' },
    { check: 'style', selector: '#mixed', property: 'font-size', value: '36px', label: '`calc(1rem + 2.5vw)` 是 20 + 16 = 36px：rem 的部分變大了，vw 的部分沒有變' },
  ],
};

const fluidSpace: WebExample = {
  id: 'rwd09-fluid-space', title: '置中的欄、內距與標題一起流動',
  description: '島嶼圖書館的新書頁。`#page` 的寬度是 `min(100% - 2rem, 45rem)` 並且置中；裡面的 `#hero` 四邊內距是 `clamp(1rem, 5vw, 3rem)`；標題沿用上一個範例的字級。整份樣式表沒有任何媒體查詢。以預設的 16px 根字級計算。',
  viewport: { width: 320, height: 640 },
  widths: [320, 600, 1000],
  files: {
    html: String.raw`<main id="page">
  <section id="hero">
    <h1>本週新書</h1>
    <p>潮間帶圖鑑、島嶼的候鳥，還有三本給小朋友的繪本，都已經上架。</p>
  </section>
</main>`,
    css: String.raw`body { margin: 0; }
h1 { margin: 0 0 0.5rem; line-height: 1.3; }
p { margin: 0; line-height: 1.7; }

/* 兩側至少各留 1rem，最寬 45rem，置中 */
#page { width: min(100% - 2rem, 45rem); margin: 0 auto; }

/* 內距跟著視窗變，最少 1rem，最多 3rem */
#hero { padding: clamp(1rem, 5vw, 3rem); background-color: #e3f2fd; }

h1 { font-size: clamp(1.5rem, 1rem + 2.5vw, 3rem); }`,
  },
  observe: [
    { check: 'box', selector: '#page', measure: 'width', value: 288, label: '視窗寬 320px：`100% - 2rem` 是 288px，比 45rem（720px）小，`min()` 選它' },
    { check: 'box', selector: '#page', measure: 'left', value: 16, label: '`margin: 0 auto` 把剩下的 32px 平分：`#page` 的左緣在 16px，兩側各留 1rem' },
    { do: 'resize', width: 600 },
    { check: 'style', selector: '#hero', property: 'padding-left', value: '30px', label: '視窗寬 600px：`5vw` 是 30px，在 1rem 與 3rem 之間，內距就是 30px' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#page', measure: 'width', value: 720, label: '視窗寬 1000px：`100% - 2rem` 是 968px，`min()` 改選比較小的 45rem，欄寬停在 720px' },
    { check: 'style', selector: '#hero', property: 'padding-left', value: '48px', label: '`5vw` 是 50px，超過最大值 3rem：內距停在 48px' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const CAP_BODY = String.raw`<h1 id="title">小島商店週年慶</h1>
<p>全館商品八折，只到這個星期日。</p>`;
const capCss = (fontSize: string) => String.raw`body { margin: 0; padding: 1rem; }
p { margin: 0; }
#title {
  margin: 0 0 0.5rem;
  font-size: ` + fontSize + String.raw`;
}`;

const exCap: WebExercise = {
  id: 'rwd09-ex-cap', title: '替 5vw 的標題加上下限與上限',
  statement: 'index.html 不能改。小島商店活動頁的標題 `#title` 寫的是 `font-size: 5vw`：在 320px 寬的手機上只有 16px，和內文一樣大；在 1200px 寬的視窗是 60px，大得離譜。請只改 `#title` 的 `font-size`：保留 `5vw` 當作會跟著視窗變的值，替它加上最小值 `1.25rem` 與最大值 `2.5rem`。為了讓檢查在每個人的瀏覽器都得到同樣的數字，index.html 用行內樣式把根元素的字級寫成 16px，代替「瀏覽器預設的字級」，所以最小值是 20px、最大值是 40px。檢查會在 320px、600px、800px、1200px 四種視窗寬度看 `#title` 計算後的字級（預覽上方的按鈕可以切換）。',
  hints: [
    '需要一個同時有下限與上限的函式。它有三個參數，由左到右是什麼順序？',
    '`clamp()` 的三個參數依序是最小值、偏好值、最大值：由小到大，會變的值放中間。',
    '把 `font-size: 5vw;` 改成 `font-size: clamp(1.25rem, 5vw, 2.5rem);`。',
  ],
  explanation: '`clamp(1.25rem, 5vw, 2.5rem)` 先算中間的 `5vw`，再把結果限制在 1.25rem（20px）與 2.5rem（40px）之間。320px 寬時 `5vw` 是 16px，比最小值小，結果是 20px；600px 寬時是 30px，落在範圍內，直接採用；800px 寬時剛好 40px；1200px 寬時 `5vw` 是 60px，比最大值大，結果停在 40px。`5vw` 等於 20px 的寬度是 400px，等於 40px 的寬度是 800px，所以這個標題在 400px 以下固定、400px 到 800px 之間跟著視窗變、800px 以上又固定。寫成 `max(1.25rem, min(5vw, 2.5rem))` 的結果完全相同。',
  viewport: { width: 320, height: 400 },
  widths: [320, 600, 800, 1200],
  fixed: { html: rootPage(16, '小島商店週年慶', CAP_BODY) },
  starter: { css: capCss('5vw') },
  solution: { css: capCss('clamp(1.25rem, 5vw, 2.5rem)') },
  steps: [
    { check: 'style', selector: '#title', property: 'font-size', value: '20px', label: '視窗寬 320px：標題不小於最小值，字級是 20px' },
    { do: 'resize', width: 600 },
    { check: 'style', selector: '#title', property: 'font-size', value: '30px', label: '視窗寬 600px：字級跟著視窗，是 30px' },
    { do: 'resize', width: 800 },
    { check: 'style', selector: '#title', property: 'font-size', value: '40px', label: '視窗寬 800px：字級剛好到最大值，是 40px' },
    { do: 'resize', width: 1200 },
    { check: 'style', selector: '#title', property: 'font-size', value: '40px', label: '視窗寬 1200px：標題不超過最大值，字級仍然是 40px' },
  ],
  mistakes: [
    { files: { css: capCss('min(5vw, 2.5rem)') }, why: '只用了 `min(5vw, 2.5rem)`。`min()` 取比較小的那一個，所以它給的是上限：1200px 寬時停在 40px 沒錯，但 320px 寬時 `5vw` 的 16px 比較小，標題照樣縮到 16px。下限要另外用 `max()` 包一層，或直接用 `clamp()`。' },
    { files: { css: capCss('clamp(5vw, 1.25rem, 2.5rem)') }, why: '把 `5vw` 寫在第一個位置。第一個參數是最小值，意思變成「至少 5vw」，中間的偏好值反而是固定的 1.25rem：結果等於 `max(5vw, 1.25rem)`，只剩下限。320px、600px、800px 剛好都對，可是 1200px 寬時「最小值」`5vw` 是 60px，已經超過 2.5rem；最小值與最大值衝突時由最小值勝出，標題變成 60px。順序是最小值、偏好值、最大值。' },
    { files: { css: capCss('clamp(2.5rem, 5vw, 1.25rem)') }, why: '最小值與最大值寫反了。`clamp(2.5rem, 5vw, 1.25rem)` 的最小值比最大值大，瀏覽器不會報錯，而是讓最小值勝出：任何寬度都是 2.5rem（40px），320px 的手機上標題也是 40px。三個參數由小到大排。' },
  ],
};

const DERIVE_BODY = String.raw`<h1 id="title">島嶼圖書館</h1>
<p>今天開放到晚上九點，三樓的自習室還有座位。</p>`;
const deriveCss = (fontSize: string) => String.raw`body { margin: 0; padding: 1rem; }
p { margin: 0; }
#title {
  margin: 0 0 0.5rem;
  font-size: ` + fontSize + String.raw`;
}`;

const exDerive: WebExercise = {
  id: 'rwd09-ex-two-points', title: '從兩個端點算出 clamp() 的三個值',
  statement: 'index.html 不能改。設計稿對島嶼圖書館的標題 `#title` 的要求是：視窗寬 400px 時字級 20px，視窗寬 1200px 時 36px，兩個寬度之間直線變化（所以 600px 時是 24px，800px 時是 28px）；比 400px 窄時維持 20px，比 1200px 寬時維持 36px。請把 `#title` 的 `font-size` 改成一個 `clamp()`：最小值與最大值用 rem，偏好值寫成「rem 的部分加上 vw 的部分」，數字請自己從兩個端點算出來。index.html 用行內樣式把根元素的字級寫成 16px，代替「瀏覽器預設的字級」，請以 1rem = 16px 換算。檢查會在 320px、600px、800px、1200px、1600px 五種視窗寬度看 `#title` 計算後的字級。另一份檢查會把根字級換成 20px（就像使用者把預設字級調大）：這時最小值與最大值要跟著變成 25px 與 45px，800px 寬時的字級要是 31px，所以答案裡不能留下 px，也不要在 style.css 裡設定 `html` 的字級。',
  hints: [
    '先算斜率：字級從 20px 到 36px 增加了多少，視窗從 400px 到 1200px 寬了多少？兩者相除，再乘以 100，就是 vw 前面的數字。',
    '斜率是 16 ÷ 800 = 0.02，也就是 `2vw`。接著算固定的部分：視窗寬 400px 時 `2vw` 是 8px，離 20px 還差 12px；12 ÷ 16 = 0.75rem。',
    '最小值 20 ÷ 16 = 1.25rem，最大值 36 ÷ 16 = 2.25rem，合起來是 `clamp(1.25rem, 0.75rem + 2vw, 2.25rem)`。加號的兩邊都要留空白。',
  ],
  explanation: '斜率是（36 − 20）÷（1200 − 400）= 0.02：視窗每寬 100px，字級大 2px，寫成 `2vw`。固定的部分是 20 − 0.02 × 400 = 12px，換成 0.75rem。驗算：400px 寬時 12 + 8 = 20px，1200px 寬時 12 + 24 = 36px，偏好值在兩個端點剛好等於最小值 1.25rem 與最大值 2.25rem，所以接上去的地方不會跳動；600px 寬時是 12 + 12 = 24px，800px 寬時是 12 + 16 = 28px。因為三個值裡的固定長度都是 rem，根字級換成 20px 時，最小值變成 25px、最大值 45px，800px 寬時是 15 + 16 = 31px：使用者調大的字級有反映在標題上。',
  viewport: { width: 320, height: 400 },
  widths: [320, 600, 800, 1200, 1600],
  fixed: { html: rootPage(16, '島嶼圖書館', DERIVE_BODY) },
  starter: { css: deriveCss('1.25rem') },
  solution: { css: deriveCss('clamp(1.25rem, 0.75rem + 2vw, 2.25rem)') },
  steps: [
    { check: 'style', selector: '#title', property: 'font-size', value: '20px', label: '視窗寬 320px（比第一個端點窄）：字級維持最小值 20px' },
    { do: 'resize', width: 600 },
    { check: 'style', selector: '#title', property: 'font-size', value: '24px', label: '視窗寬 600px（兩個端點之間）：字級是 24px' },
    { do: 'resize', width: 800 },
    { check: 'style', selector: '#title', property: 'font-size', value: '28px', label: '視窗寬 800px（兩個端點的正中間）：字級是 28px' },
    { do: 'resize', width: 1200 },
    { check: 'style', selector: '#title', property: 'font-size', value: '36px', label: '視窗寬 1200px（第二個端點）：字級是 36px' },
    { do: 'resize', width: 1600 },
    { check: 'style', selector: '#title', property: 'font-size', value: '36px', label: '視窗寬 1600px（比第二個端點寬）：字級維持最大值 36px' },
  ],
  mistakes: [
    { files: { css: deriveCss('clamp(1.25rem, 1.25rem + 2vw, 2.25rem)') }, why: '斜率算對了，卻直接把最小字級 1.25rem 當成固定的部分。`1.25rem + 2vw` 在 400px 寬時是 20 + 8 = 28px，不是 20px：整條線高了 8px，到 800px 就碰到最大值。固定的部分要從最小字級扣掉「vw 的部分在第一個端點已經貢獻的量」：20 − 8 = 12px，也就是 0.75rem。' },
    { files: { css: deriveCss('clamp(20px, 12px + 2vw, 36px)') }, why: '數字都對，但三個固定長度用的是 px。根字級是 16px 時每個寬度都符合；使用者把預設字級調成 20px 之後，最小值、最大值與固定的部分卻一動也不動，標題沒有跟著放大（換了根字級的那份檢查不會通過）。把 px 除以 16 換成 rem：1.25rem、0.75rem、2.25rem。' },
    { files: { css: deriveCss('clamp(1.25rem, 0.75rem+2vw, 2.25rem)') }, why: '加號的兩邊沒有留空白。`0.75rem+2vw` 會被讀成 `0.75rem` 後面緊跟著一個帶正號的 `+2vw`，中間沒有運算符號，整條 `font-size` 宣告無效而被丟掉，瀏覽器也不會提示。標題於是用回 `<h1>` 預設的字級，任何寬度都不變。`+` 與 `-` 的兩邊一定要有空白。' },
  ],
  variants: [{
    title: '根元素的字級換成 20px：最小值、最大值與固定的部分都要變成 1.25 倍',
    fixed: { html: rootPage(20, '島嶼圖書館', DERIVE_BODY) },
    steps: [
      { check: 'style', selector: '#title', property: 'font-size', value: '25px', label: '根字級 20px、視窗寬 320px：最小值是 25px' },
      { do: 'resize', width: 800 },
      { check: 'style', selector: '#title', property: 'font-size', value: '31px', label: '根字級 20px、視窗寬 800px：15 + 16 = 31px' },
      { do: 'resize', width: 1600 },
      { check: 'style', selector: '#title', property: 'font-size', value: '45px', label: '根字級 20px、視窗寬 1600px：最大值是 45px' },
    ],
  }],
};

const COLUMN_BODY = String.raw`<main id="page">
  <h1>借閱須知</h1>
  <p>每張借閱證一次可以借五本書，借期三週，到期前可以在線上續借一次。</p>
</main>`;
const columnCss = (rules: string) => String.raw`body { margin: 0; }
h1 { margin: 0 0 0.5rem; font-size: 1.5rem; }
p { margin: 0; line-height: 1.7; }
#page {
` + rules + String.raw`
  background-color: #e3f2fd;
}`;

const exColumn: WebExercise = {
  id: 'rwd09-ex-column', title: '置中、有上限、兩側留白的內容欄',
  statement: 'index.html 不能改。島嶼圖書館的借閱須知放在 `#page` 裡，style.css 把它寫死成 `width: 720px`：在 360px 寬的手機上，內容超出畫面，要左右捲動才讀得完。請改寫 `#page` 的寬度，讓它在任何視窗寬度都符合三件事：左右兩側至少各留 1rem 的空白；最寬不超過 45rem；在視窗裡水平置中。`body { margin: 0; }` 請保留。建議用這一課的 `min()` 把寬度寫成一條宣告。index.html 用行內樣式把根元素的字級寫成 16px（代替瀏覽器預設的字級），所以 1rem 是 16px、45rem 是 720px。檢查會在 360px、752px、1000px 三種視窗寬度量 `#page` 的寬度與左緣的位置。',
  hints: [
    '「兩側各留 1rem」表示欄寬最多是父元素的寬度減掉 2rem；「最寬 45rem」是另一個上限。兩個上限同時成立，要取比較小的那一個還是比較大的那一個？',
    '`min(A, B)` 取兩者之中比較小的。A 是 `100% - 2rem`（減號兩邊要有空白），B 是 `45rem`。',
    '把 `width: 720px;` 改成 `width: min(100% - 2rem, 45rem);`，並保留 `margin: 0 auto;`。',
  ],
  explanation: '`width: min(100% - 2rem, 45rem)` 每次都取兩個值裡比較小的。360px 寬時 `100% - 2rem` 是 328px，比 720px 小，欄寬就是 328px；`margin: 0 auto` 把剩下的 32px 平分，左緣在 16px，兩側各留 1rem。752px 寬時 `100% - 2rem` 剛好是 720px，兩個值相等。1000px 寬時 `100% - 2rem` 是 968px，`min()` 改選 720px，剩下的 280px 平分，左緣在 140px。「用 `min()` 設上限」聽起來相反，其實很合理：取比較小的值，結果就不會超過其中任何一個。寫成 `width: calc(100% - 2rem); max-width: 45rem;` 的結果相同，`min()` 只是把兩條合成一條。',
  viewport: { width: 360, height: 640 },
  widths: [360, 752, 1000],
  fixed: { html: rootPage(16, '借閱須知', COLUMN_BODY) },
  starter: { css: columnCss(String.raw`  width: 720px;
  margin: 0 auto;`) },
  solution: { css: columnCss(String.raw`  width: min(100% - 2rem, 45rem);
  margin: 0 auto;`) },
  steps: [
    { check: 'box', selector: '#page', measure: 'width', value: 328, label: '視窗寬 360px：`#page` 的寬度是 328px（兩側各留 16px）' },
    { check: 'box', selector: '#page', measure: 'left', value: 16, label: '視窗寬 360px：`#page` 的左緣在 16px' },
    { do: 'resize', width: 752 },
    { check: 'box', selector: '#page', measure: 'width', value: 720, label: '視窗寬 752px：`#page` 的寬度剛好到上限 720px' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#page', measure: 'width', value: 720, label: '視窗寬 1000px：`#page` 的寬度停在 720px' },
    { check: 'box', selector: '#page', measure: 'left', value: 140, label: '視窗寬 1000px：`#page` 置中，左緣在 140px' },
  ],
  mistakes: [
    { files: { css: columnCss(String.raw`  width: max(100% - 2rem, 45rem);
  margin: 0 auto;`) }, why: '把 `min()` 寫成 `max()`。`max()` 取比較大的那一個，等於說「至少 45rem」：360px 寬時欄寬還是 720px，照樣超出畫面；1000px 寬時又變成 968px，沒有上限。要讓結果「不超過」某個值，取的是比較小的那一個，用 `min()`。' },
    { files: { css: columnCss(String.raw`  width: min(100%, 45rem);
  margin: 0 auto;`) }, why: '寫成 `min(100%, 45rem)`，少了減掉的 2rem。寬螢幕上沒有問題，但 360px 寬時欄寬是整整 360px，文字貼著螢幕的左右邊緣，沒有留白。窄的那個值要寫成 `100% - 2rem`。' },
    { files: { css: columnCss(String.raw`  width: min(100%-2rem, 45rem);
  margin: 0 auto;`) }, why: '減號的兩邊沒有留空白。`100%-2rem` 會被讀成 `100%` 後面緊跟著一個負的 `-2rem`，不是一個減法，整條 `width` 宣告無效而被丟掉。`#page` 於是用回預設的 `width: auto`，填滿整個視窗：窄螢幕沒有留白，寬螢幕也沒有上限。' },
  ],
};

const BANNER_BODY = String.raw`<section id="banner">
  <h1 id="title">夏日閱讀節</h1>
  <p>七月的每個週末，三樓有說故事活動與二手書市集。</p>
</section>`;
const bannerCss = (padding: string, fontSize: string) => String.raw`body { margin: 0; }
p { margin: 0; }
#banner {
  padding: ` + padding + String.raw`;
  background-color: #ffe082;
}
#title {
  margin: 0 0 0.5rem;
  font-size: ` + fontSize + String.raw`;
}`;

const exBanner: WebExercise = {
  id: 'rwd09-ex-banner', title: '活動橫幅：內距與標題一起流動',
  statement: 'index.html 不能改。島嶼圖書館的活動橫幅 `#banner` 現在的四邊內距固定是 1rem，標題 `#title` 固定是 1.5rem，到了寬螢幕顯得又擠又小。設計稿（根字級 16px）給了兩個端點：視窗寬 400px 時，內距 16px、標題 24px；視窗寬 1000px 時，內距 40px、標題 36px。兩個寬度之間都是直線變化，比 400px 窄或比 1000px 寬時維持端點的值。請把 `#banner` 的 `padding`（四邊相同）與 `#title` 的 `font-size` 各改成一個 `clamp()`，數字自己從端點算出來，最小值與最大值用 rem。index.html 用行內樣式把根元素的字級寫成 16px，代替「瀏覽器預設的字級」。檢查會在 320px、700px、1200px 三種視窗寬度看內距與字級；另一份檢查把根字級換成 20px，這時最小值與最大值都要變成 1.25 倍，所以不能用 px 寫，也不要在 style.css 裡設定 `html` 的字級。',
  hints: [
    '兩條線分開算，步驟一樣：斜率 =（最大值 − 最小值）÷（1000 − 400），固定的部分 = 最小值 − 斜率 × 400。',
    '內距：斜率是 24 ÷ 600 = 0.04，也就是 `4vw`；固定的部分是 16 − 16 = 0，所以偏好值只有 `4vw`。標題：斜率是 12 ÷ 600 = 0.02，也就是 `2vw`；固定的部分是 24 − 8 = 16px = 1rem。',
    '`padding: clamp(1rem, 4vw, 2.5rem);` 與 `font-size: clamp(1.5rem, 1rem + 2vw, 2.25rem);`。',
  ],
  explanation: '內距的線：斜率（40 − 16）÷ 600 = 0.04，寫成 `4vw`；固定的部分 16 − 0.04 × 400 = 0，這條線剛好通過原點，偏好值就是單純的 `4vw`。標題的線：斜率（36 − 24）÷ 600 = 0.02，寫成 `2vw`；固定的部分 24 − 8 = 16px，也就是 1rem。驗算 700px（兩個端點的正中間）：內距 28px，標題 16 + 14 = 30px，都是兩個端點的平均。320px 與 1200px 在端點之外，由最小值與最大值接手。最小值與最大值寫成 rem，根字級換成 20px 時它們變成 20px、50px 與 30px、45px。標題的偏好值有 rem 的部分，所以中間的寬度也跟著使用者的設定變大；內距的偏好值只有 vw，中間那一段不會變，對留白來說可以接受，對文字就不行。',
  viewport: { width: 320, height: 480 },
  widths: [320, 400, 700, 1000, 1200],
  fixed: { html: rootPage(16, '夏日閱讀節', BANNER_BODY) },
  starter: { css: bannerCss('1rem', '1.5rem') },
  solution: { css: bannerCss('clamp(1rem, 4vw, 2.5rem)', 'clamp(1.5rem, 1rem + 2vw, 2.25rem)') },
  steps: [
    { check: 'style', selector: '#banner', property: 'padding-left', value: '16px', label: '視窗寬 320px：橫幅的左內距是最小值 16px' },
    { check: 'style', selector: '#title', property: 'font-size', value: '24px', label: '視窗寬 320px：標題的字級是最小值 24px' },
    { do: 'resize', width: 700 },
    { check: 'style', selector: '#banner', property: 'padding-top', value: '28px', label: '視窗寬 700px：橫幅的上內距是 28px' },
    { check: 'style', selector: '#title', property: 'font-size', value: '30px', label: '視窗寬 700px：標題的字級是 30px' },
    { do: 'resize', width: 1200 },
    { check: 'style', selector: '#banner', property: 'padding-left', value: '40px', label: '視窗寬 1200px：橫幅的左內距是最大值 40px' },
    { check: 'style', selector: '#title', property: 'font-size', value: '36px', label: '視窗寬 1200px：標題的字級是最大值 36px' },
  ],
  mistakes: [
    { files: { css: bannerCss('clamp(1rem, 4vw, 2.5rem)', 'clamp(1.5rem, 3.6vw, 2.25rem)') }, why: '標題的偏好值直接拿「最大字級 ÷ 最大寬度」：36 ÷ 1000 = 3.6vw。內距可以這樣算，是因為它的線剛好通過原點（16 ÷ 400 與 40 ÷ 1000 都是 0.04）；標題的線不通過原點（24 ÷ 400 = 0.06，36 ÷ 1000 = 0.036，兩個比值不同）。`3.6vw` 在 700px 寬時只有 25.2px，不是 30px。斜率要用「兩個端點的差」來算，再補上固定的部分。' },
    { files: { css: bannerCss('4vw', 'calc(1rem + 2vw)') }, why: '兩條線都算對了，但沒有包進 `clamp()`。少了最小值與最大值，320px 寬時內距只有 12.8px、標題 22.4px，1200px 寬時又長到 48px 與 40px：直線只在兩個端點之間符合設計稿，端點之外要靠 `clamp()` 的第一個與第三個參數擋住。' },
  ],
  variants: [{
    title: '根元素的字級換成 20px：內距與標題的最小值、最大值都要變成 1.25 倍',
    fixed: { html: rootPage(20, '夏日閱讀節', BANNER_BODY) },
    steps: [
      { check: 'style', selector: '#banner', property: 'padding-left', value: '20px', label: '根字級 20px、視窗寬 320px：內距的最小值是 20px' },
      { check: 'style', selector: '#title', property: 'font-size', value: '30px', label: '根字級 20px、視窗寬 320px：標題的最小值是 30px' },
      { do: 'resize', width: 800 },
      { check: 'style', selector: '#title', property: 'font-size', value: '36px', label: '根字級 20px、視窗寬 800px：標題是 20 + 16 = 36px' },
      { do: 'resize', width: 1600 },
      { check: 'style', selector: '#banner', property: 'padding-left', value: '50px', label: '根字級 20px、視窗寬 1600px：內距的最大值是 50px' },
      { check: 'style', selector: '#title', property: 'font-size', value: '45px', label: '根字級 20px、視窗寬 1600px：標題的最大值是 45px' },
    ],
  }],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD09: LessonContent = {
  lessonId: 'RWD09',
  motivation: '手機上 24px 剛好的標題，到了寬螢幕顯得太小；用媒體查詢一段一段加大，字級又在每個斷點跳一下。這一課用 `clamp()` 寫出流體字級：字級跟著視窗寬度平滑變化，有最小與最大值擋住兩端，使用者放大文字時也仍然會跟著變大。同樣的寫法還能用在內距與欄寬上。',
  sections: [
    {
      id: 'rwd09-problem-section', title: '階梯式字級與純 vw：兩種做法的問題',
      blocks: [
        { type: 'p', text: '同一個標題，在 320px 寬的手機上 20px 就夠醒目，在 1600px 寬的螢幕上卻需要 40px 才撐得住版面。最直接的做法是「響應式原則與行動優先」那一課的媒體查詢：基本樣式寫小的字級，視窗到了某個寬度就換一個大的。這種字級是階梯式的：在兩個斷點之間完全不變，一過斷點就跳一級。斷點訂得再好，599px 與 600px 的視窗看到的標題也會差上一截；每多一種標題，又要多寫幾條查詢。' },
        { type: 'p', text: '另一個想法是用「viewport 與相對單位」那一課的 `vw`。`font-size: 5vw` 讓字級永遠是視窗寬度的 5%，視窗寬一點，字就大一點，沒有階梯。這種跟著視窗寬度連續變化的字級，叫做流體字級（fluid typography）。下面的範例把兩種做法放在一起。' },
        { type: 'example', id: 'rwd09-steps-and-vw' },
        { type: 'p', text: '預覽一開始是 320px 寬。請依序按預覽上方的寬度按鈕，對照這張表：' },
        { type: 'table', head: ['視窗寬度', '階梯式的標題', '5vw 的標題', '看到什麼'], rows: [
          ['320px', '20px', '16px', '`5vw` 的標題和 16px 的內文一樣大，分不出誰是標題'],
          ['599px', '20px', '29.95px', '階梯式從 320px 到這裡都沒有變過'],
          ['600px', '28px', '30px', '視窗只寬了 1px，階梯式的標題跳了 8px'],
          ['1600px', '40px', '80px', '`5vw` 的標題大到一行放不了幾個字，而且視窗再寬還會更大'],
        ] },
        { type: 'p', text: '純 `vw` 解決了跳動，卻帶來三個新的問題：' },
        { type: 'list', ordered: true, items: [
          '窄螢幕上太小。字級和視窗成正比，視窗只剩 240px 時，`5vw` 是 12px。',
          '寬螢幕上太大，而且沒有盡頭。視窗有多寬，字就跟著大到哪裡。',
          '使用者放大不了。只用 `vw` 寫的字級只看視窗，使用者調大瀏覽器的預設字級、或把頁面放大，它都不會跟著變大。這是無障礙的問題，「可縮放性」那一節會用數字說明。',
        ] },
        { type: 'p', text: '我們要的是兩者的優點：中間像 `vw` 一樣平滑，兩端像固定字級一樣有界線，而且還聽得到使用者的字級設定。接下來的三節各解決一件事：加上界線、算出中間那條線、確認放大仍然有效。' },
        { type: 'callout', tone: 'tip', title: '動手試：換一個 vw 的數字', text: '按「動手改這個範例」，把 `5vw` 改成 `3vw` 再執行。1600px 寬時標題是 48px，合理多了；但切回 320px，它只剩 9.6px，幾乎讀不到。再改成 `8vw`：320px 寬時 25.6px 很好，1600px 寬時卻是 128px。只靠一個 `vw` 的數字，顧得了一端就顧不了另一端。' },
      ],
    },
    {
      id: 'rwd09-clamp-section', title: 'min()、max() 與 clamp()：替會變的值加上界線',
      blocks: [
        { type: 'p', text: '「viewport 與相對單位」那一課用一段話介紹過兩個函式：`min(A, B)` 取兩個值裡比較小的，`max(A, B)` 取比較大的。函式裡可以混用不同的單位，例如一個 `vw`、一個 `rem`；瀏覽器在視窗寬度改變時會重新比一次。把其中一個值寫成會變的 `5vw`、另一個寫成固定的長度，就得到「有界線的 `vw`」：' },
        { type: 'list', items: [
          '`min(5vw, 2.5rem)`：取比較小的，所以結果不會超過 2.5rem。`min()` 給的是上限。',
          '`max(1.25rem, 5vw)`：取比較大的，所以結果不會低於 1.25rem。`max()` 給的是下限。',
        ] },
        { type: 'p', text: '名字和用途剛好相反，是這兩個函式最容易弄錯的地方：要「最多到某個值」用的是 `min()`，要「至少某個值」用的是 `max()`。記的時候不要記名字，直接想「取比較小的那一個，結果會不會超過它？」' },
        { type: 'p', text: '上限與下限都要的時候，可以把兩個函式包在一起：`max(1.25rem, min(5vw, 2.5rem))`。這個組合太常用，CSS 另外提供了 `clamp()`，把它寫成三個由小到大排列的參數：`clamp(最小值, 偏好值, 最大值)`。偏好值（preferred value）是中間那個會變的值；它落在最小與最大值之間時就用它，比最小值小時用最小值，比最大值大時用最大值。`clamp(MIN, VAL, MAX)` 的結果和 `max(MIN, min(VAL, MAX))` 完全相同。' },
        { type: 'example', id: 'rwd09-min-max-clamp' },
        { type: 'p', text: '按寬度按鈕，對照四行字的大小。這個範例的固定長度寫的是 rem：以預設的 16px 根字級計算，`1.25rem` 是 20px，`2.5rem` 是 40px。' },
        { type: 'table', head: ['視窗寬度', '5vw', 'min(5vw, 2.5rem)', 'max(1.25rem, 5vw)', 'clamp(1.25rem, 5vw, 2.5rem)'], rows: [
          ['320px', '16px', '16px', '20px', '20px'],
          ['768px', '38.4px', '38.4px', '38.4px', '38.4px'],
          ['1280px', '64px', '40px', '64px', '40px'],
        ] },
        { type: 'p', text: '只有最後一欄在三個寬度都合理。它什麼時候開始變、什麼時候停下來，可以反過來算：`5vw` 等於 20px 的視窗寬度是 20 ÷ 0.05 = 400px，等於 40px 的寬度是 800px。所以這個標題在 400px 以下固定是 20px，400px 到 800px 之間跟著視窗變，800px 以上固定是 40px，整個過程沒有任何一處跳動，也沒有用到媒體查詢。' },
        { type: 'p', text: '這三個函式不限於 `font-size`：任何接受長度的屬性都可以用，後面會用在 `padding` 與 `width` 上。參數裡也可以直接寫加減乘除，例如 `clamp(1.5rem, 1rem + 2.5vw, 3rem)`。同樣的算式如果寫在這三個函式的外面，要用 `calc()` 包起來：`font-size: calc(1rem + 2.5vw)`。`calc()` 的工作就是把不同單位的長度算成一個值。' },
        { type: 'callout', tone: 'warning', title: '參數的順序寫錯，瀏覽器不會提醒', text: '`clamp()` 的三個參數一定是最小值、偏好值、最大值。把會變的值寫在第一個位置（`clamp(5vw, 1.25rem, 2.5rem)`），意思變成「至少 5vw」，寬螢幕上字級照樣一路變大。把最小與最大值寫反（`clamp(2.5rem, 5vw, 1.25rem)`）也不會報錯：最小值比最大值大的時候，由最小值勝出，結果是任何寬度都固定在 2.5rem，看起來像是 `clamp()` 沒有作用。口訣是由小到大，會變的放中間。' },
        { type: 'callout', tone: 'warning', title: '加號與減號的兩邊要留空白', text: '`clamp(1.5rem, 1rem+2.5vw, 3rem)` 少了加號兩邊的空白，`+2.5vw` 會被讀成一個帶正號的長度，而不是加法；整條宣告因此無效，瀏覽器直接把它丟掉，也不顯示錯誤，字級回到原本繼承或預設的大小。減號也一樣：`100%-2rem` 是錯的，`100% - 2rem` 才對。另一個同類的錯誤是漏掉單位：`clamp(20, 5vw, 40)` 把數字和長度混在一起，同樣整條無效。' },
        { type: 'callout', tone: 'tip', title: '動手試：移動界線', text: '在範例裡把 `#clamped` 的最大值 `2.5rem` 改成 `4rem` 再執行，切到 1280px：`5vw` 的 64px 剛好等於 4rem，這一行和沒有界線的第一行一樣大。再把最小值改成 `2rem`，先算再看：`5vw` 要到 640px 寬才有 32px，所以 320px 寬時是最小值 32px，768px 寬時是偏好值 38.4px。' },
      ],
    },
    {
      id: 'rwd09-formula-section', title: '從兩個端點算出偏好值',
      blocks: [
        { type: 'p', text: '上一節的 `clamp(1.25rem, 5vw, 2.5rem)`，中間的 `5vw` 是隨手寫的，字級在哪個寬度開始變、在哪個寬度停下來，要算了才知道。實際設計時，順序通常反過來：先決定兩個端點，例如「視窗寬 320px 時標題 24px，1280px 時 48px，中間平滑變化」，再回頭找出符合的偏好值。' },
        { type: 'p', text: '「平滑變化」指的是一條直線：視窗每寬一點，字級就固定大一點。直線由兩個數字決定：斜率（視窗每寬 1px，字級大多少）與固定的部分（把這條線延伸到視窗寬度是 0 的地方，字級是多少）。換成 CSS，斜率用 `vw` 寫，固定的部分用 `rem` 寫，偏好值就是「rem 的部分加上 vw 的部分」。兩點之間任何寬度的字級是：最小字級 +（最大字級 − 最小字級）×（視窗寬度 − 最小寬度）÷（最大寬度 − 最小寬度）。把這個式子整理成四個步驟：' },
        { type: 'list', ordered: true, items: [
          '算斜率：（最大字級 − 最小字級）÷（最大寬度 − 最小寬度）=（48 − 24）÷（1280 − 320）= 24 ÷ 960 = 0.025。`1vw` 是視窗寬度的 1%，所以乘以 100：`2.5vw`。',
          '算固定的部分：最小字級 − 斜率 × 最小寬度 = 24 − 0.025 × 320 = 24 − 8 = 16px。除以 16 換成 rem：`1rem`。',
          '把最小與最大字級也換成 rem：24 ÷ 16 = `1.5rem`，48 ÷ 16 = `3rem`。組合起來是 `clamp(1.5rem, 1rem + 2.5vw, 3rem)`。',
          '驗算兩個端點：320px 寬時 16 + 8 = 24px，1280px 寬時 16 + 32 = 48px。',
        ] },
        { type: 'example', id: 'rwd09-two-points' },
        { type: 'p', text: '按寬度按鈕看 `#title`：320px 寬時 24px；800px 寬時 16 + 20 = 36px；1280px 寬時 48px。沒有按鈕的寬度也算得出來，例如 768px 寬時是 16 + 19.2 = 35.2px。偏好值在兩個端點剛好等於最小值與最大值，所以直線和兩段水平線接在一起，接點上沒有跳動。再按 1600px：灰色那一行只有偏好值、沒有 `clamp()`，繼續長到 56px；`#title` 被最大值擋在 48px。內文沒有寫流體字級，維持 1rem：一般的內文在各種寬度都用同樣的大小就很好讀，需要流體字級的通常是標題這類大字。' },
        { type: 'p', text: '固定的部分不一定是正的。同樣的兩個寬度，如果字級要從 16px 變到 64px，斜率是 48 ÷ 960 = 0.05，固定的部分是 16 − 0.05 × 320 = 0：偏好值剛好是純 `5vw`。兩個端點的字級差得更多，固定的部分還會變成負數。這不是語法錯誤，卻是一個警訊：這條線很陡，字級幾乎完全由視窗決定，下一節會看到這對需要放大文字的人不利。' },
        { type: 'callout', tone: 'note', title: '為什麼固定的部分要換成 rem', text: '在預設的 16px 根字級下，`16px + 2.5vw` 與 `1rem + 2.5vw` 算出來一模一樣。差別在使用者把瀏覽器的預設字級調大的時候：`16px` 不會動，`1rem` 會跟著變大。最小值、最大值與固定的部分，凡是固定的長度都寫成 rem，字級才聽得到使用者的設定。' },
        { type: 'callout', tone: 'tip', title: '動手試：只改最大值', text: '把範例裡 `#title` 的最大值 `3rem` 改成 `2.5rem` 再執行。偏好值沒有動，所以 320px 與 800px 的字級不變；但 1280px 寬時變成 40px。它是在哪個寬度碰到上限的？40 − 16 = 24px，24 ÷ 0.025 = 960px。只改最大值，直線提早在 960px 被截斷，原本的第二個端點就不再是端點了：端點變了，斜率與固定的部分要重新算。' },
      ],
    },
    {
      id: 'rwd09-scalability-section', title: '可縮放性：使用者放大文字時要跟著變大',
      blocks: [
        { type: 'p', text: '有些人需要比較大的字才讀得舒服。文字能不能被使用者放大，這裡稱為可縮放性（resizable text）。使用者放大文字的方法主要有兩種，流體字級必須兩種都通過：' },
        { type: 'list', items: [
          '調大瀏覽器的預設字級。多數瀏覽器的設定裡可以把預設的 16px 改成更大的值。這個設定改變的是根字級：用 rem 寫的長度跟著變大，用 px 與 `vw` 寫的不會。',
          '縮放頁面。桌機瀏覽器按 Ctrl（或 ⌘）加上 `+`，整個頁面放大。放大到 200% 時，每一個 CSS 的 px 在螢幕上畫成原本的 2 倍大，同時視窗以 CSS 的 px 計算的寬度剩下一半：原本 1280px 寬的視窗，對頁面來說變成 640px 寬，媒體查詢與 `vw` 都照 640px 計算。',
        ] },
        { type: 'p', text: '先看第一種。預覽沒有辦法更改你的瀏覽器設定，下面的範例用行內樣式把根字級寫成 20px 來代替：' },
        { type: 'example', id: 'rwd09-user-setting' },
        { type: 'p', text: '三行標題在根字級 16px、視窗寬 640px 時都是 32px。根字級變成 20px 之後，三行不再一樣大：「只有 vw」仍然是 32px，使用者的設定對它完全沒有作用；「只有 rem」變成 40px，放大成 1.25 倍；「rem 加 vw」是 20 + 16 = 36px，rem 的部分變大了，`vw` 的部分沒有。這就是偏好值要留一個 rem 的部分的原因：它讓流體的那一段也跟著使用者的設定走。' },
        { type: 'p', text: '再看第二種，頁面縮放。假設視窗寬 1280px，三種寫法在 100% 時都是 48px。放大到 200% 之後，視窗對頁面來說是 640px 寬：' },
        { type: 'table', head: ['字級的寫法', '100% 時的字級', '200% 時計算出的字級', '畫在螢幕上相當於原本的', '放大了幾倍'], rows: [
          ['`3.75vw`', '48px', '640 × 3.75% = 24px', '24 × 2 = 48px', '1 倍：完全沒有變大'],
          ['`clamp(1.5rem, 1rem + 2.5vw, 3rem)`', '48px', '16 + 16 = 32px', '32 × 2 = 64px', '約 1.33 倍'],
          ['`3rem`', '48px', '48px', '48 × 2 = 96px', '2 倍'],
        ] },
        { type: 'p', text: '純 `vw` 的字在縮放時一動也不動：視窗變窄讓字級減半，頁面放大又把它畫成 2 倍，剛好抵銷。無障礙指引 WCAG 要求文字能放大到 200%，而且內容與功能不受影響；只用 `vw` 寫的文字做不到。`clamp()` 的寫法會變大，只是在流體的那一段比 2 倍少；繼續放大到 400%，視窗對頁面來說剩下 320px，字級落在最小值 24px，畫出來是 24 × 4 = 96px，達到原本的 2 倍。（手機上用兩指把畫面撥大是另一回事：那像拿放大鏡看，版面不會重新計算，所有的字一起放大。）' },
        { type: 'p', text: '由此可以整理出選擇最小與最大值的幾個準則。它們是準則，不是規定，最後仍然要實際放大來確認：' },
        { type: 'list', items: [
          '最小值、最大值與偏好值裡固定的部分都用 rem，不用 px。',
          '偏好值不要只有 `vw`，保留一個 rem 的部分。',
          '內文的最小值不低於 1rem。內文通常根本不需要流體字級。',
          '最大值不要比最小值大太多。常見的經驗法則是不超過最小值的 2.5 倍：兩者差得越多，字級裡由 `vw` 決定的比例越高，縮放頁面時變大的幅度就越小。上面的例子是 2 倍。',
        ] },
        { type: 'callout', tone: 'warning', title: '最小與最大值寫成 px，調大預設字級就沒有反應', text: '`font-size: clamp(24px, 5vw, 48px)` 在預設的設定下看起來完全正常，寫的人自己不會發現問題。但三個參數裡沒有任何一個跟著根字級走：使用者把預設字級調大，內文變大了，標題卻原地不動，甚至比內文還小。最小值與最大值寫成 `1.5rem` 與 `3rem`，偏好值寫成 rem 加 `vw`。' },
        { type: 'callout', tone: 'note', title: '預覽做不到的事，要自己測', text: '預覽與練習的檢查沒有辦法替你縮放頁面，也改不了瀏覽器的字級設定；練習裡用「根字級 20px 的另一份檢查」代替後者。自己的頁面寫完之後，請親手做兩件事：到瀏覽器的設定把預設字級調大，看標題有沒有跟著變大；把頁面放大到 200%，看文字有沒有變大、頁面會不會需要左右捲動。' },
        { type: 'callout', tone: 'tip', title: '動手試：把根字級改回 16px', text: '在範例的 index.html 裡，把 `<html>` 上的 `font-size: 20px` 改成 `16px` 再執行：三行標題都是 32px，內文 16px。再改成 `24px`：「只有 vw」還是 32px，「只有 rem」是 48px，「rem 加 vw」是 24 + 16 = 40px。三行之中只有第一行對使用者的設定沒有任何反應。' },
      ],
    },
    {
      id: 'rwd09-space-section', title: '間距與寬度也可以流動',
      blocks: [
        { type: 'p', text: '`min()`、`max()`、`clamp()` 算出來的是一個長度，所以不只字級，內距、外距、`gap` 與寬度都能用。手機上 1rem 的內距剛好，放到寬螢幕上就顯得小氣；以前要靠媒體查詢分段加大，現在一行就夠了：`padding: clamp(1rem, 5vw, 3rem)`，最少 1rem，最多 3rem，中間跟著視窗變。' },
        { type: 'p', text: '寬度最常見的用法是置中的內容欄。「響應式原則與行動優先」那一課用 `max-width` 加上 `margin: 0 auto` 讓整頁最寬到某個值並且置中，兩側的留白通常另外用內距處理。`min()` 可以把這些合成一條：`width: min(100% - 2rem, 45rem)`。`100% - 2rem` 是「父元素的寬度扣掉左右各 1rem」，`45rem` 是上限；`min()` 取比較小的那一個，所以窄螢幕上欄寬是前者，兩側剛好各留 1rem，寬螢幕上停在 45rem。再加上 `margin: 0 auto` 就置中了。' },
        { type: 'example', id: 'rwd09-fluid-space' },
        { type: 'p', text: '依序按 320px、600px、1000px。320px 寬時，`#page` 是 320 − 32 = 288px，左緣在 16px；`#hero` 的內距是最小值 16px（`5vw` 剛好也是 16px）。600px 寬時，`#page` 是 568px，內距跟著變成 30px，標題是 16 + 15 = 31px。1000px 寬時，`#page` 停在 720px 並且置中，左緣在 140px；`5vw` 的 50px 超過最大值，內距停在 48px；標題是 16 + 25 = 41px，還沒到最大值。三個長度各有各的節奏，整份樣式表卻沒有一條媒體查詢。' },
        { type: 'table', head: ['想做的事', '寫法', '結果'], rows: [
          ['寬度有上限', '`width: min(100%, 45rem)`', '填滿父元素，最寬 45rem'],
          ['有上限、兩側留白的置中欄', '`width: min(100% - 2rem, 45rem)` 加上 `margin: 0 auto`', '兩側至少各留 1rem，最寬 45rem'],
          ['流動的內距', '`padding: clamp(1rem, 5vw, 3rem)`', '最少 1rem，最多 3rem，中間是視窗寬度的 5%'],
          ['流動的間距', '`gap: clamp(0.5rem, 2vw, 1.5rem)`', '項目之間的間距跟著視窗變，有上下限'],
          ['寬度有下限', '`width: max(50%, 12rem)`', '父元素的一半，但不小於 12rem'],
        ] },
        { type: 'p', text: '內距與間距不是文字，偏好值只用 `vw` 沒有可縮放性的問題；最小與最大值仍然建議用 rem，使用者把字調大時，留白才會跟著字一起變大，比例不會跑掉。如果你學過「Container Query」那一課，偏好值裡的 `vw` 也可以換成容器單位 `cqi`，例如 `font-size: clamp(1rem, 0.75rem + 2cqi, 1.5rem)`：卡片的標題改成跟著卡片所在的容器變，而不是跟著視窗，同一張卡片放進窄的側欄就自動用小一點的字。算法和這一課完全一樣，只是把「視窗寬度」換成「容器寬度」，而且祖先要先用 `container-type` 宣告成容器。' },
        { type: 'callout', tone: 'tip', title: '動手試：拿掉留白，再拿掉上限', text: '把範例裡 `#page` 的 `min(100% - 2rem, 45rem)` 改成 `min(100%, 45rem)` 再執行，切到 320px：淡藍色的區塊貼齊螢幕的左右兩邊。改回來，再把 `45rem` 改成 `30rem`，切到 1000px：欄寬停在 480px。想連續拖動寬度看這三個長度怎麼一起變化，可以到互動實驗島的 Responsive Layout Simulator。' },
      ],
    },
    {
      id: 'rwd09-checklist-section', title: '整理：寫流體字級的步驟與檢查',
      blocks: [
        { type: 'p', text: '把這一課收成一個流程。要替一個標題寫流體字級時：' },
        { type: 'list', ordered: true, items: [
          '先決定它需不需要。內文與小字用固定的 rem 就好；流體字級留給大標題、首頁的標語、大的數字這類在寬窄螢幕需要明顯不同大小的文字。',
          '訂兩個端點：最窄要支援的寬度與那時的字級，版面不再變寬的寬度與那時的字級。',
          '算斜率與固定的部分，寫成 `clamp(最小值, rem 的部分 + vw 的部分, 最大值)`，固定的長度都用 rem。',
          '在兩個端點、端點之外各一個寬度、中間任意一個寬度驗算，確認數字和預期的一樣。',
          '調大瀏覽器的預設字級、把頁面放大到 200%，確認文字都會變大，頁面不需要左右捲動。',
        ] },
        { type: 'p', text: '流體字級出錯時，症狀大多可以直接對應到原因：' },
        { type: 'table', head: ['症狀', '最可能的原因', '修法'], rows: [
          ['字級像是完全沒有設定', '加減號的兩邊沒有空白，或數字漏了單位：整條宣告無效', '補上空白與單位'],
          ['任何寬度的字級都一樣大', '最小值與最大值寫反了，最小值勝出', '三個參數由小到大排'],
          ['寬螢幕上字越來越大', '只有下限（`max()`），或把 `vw` 寫在第一個參數', '補上最大值，會變的值放中間'],
          ['窄螢幕上字太小', '只有上限（`min()`）', '補上最小值'],
          ['還沒到端點，字級就停住不變', '固定的部分算錯了，常見的是直接填了最小字級', '固定的部分 = 最小字級 − 斜率 × 最小寬度'],
          ['調大預設字級，標題沒有反應', '最小與最大值用了 px，或偏好值只有 `vw`', '固定的長度都改成 rem'],
        ] },
        { type: 'p', text: '`clamp()` 沒有取代媒體查詢，兩者的分工和「viewport 與相對單位」那一課的百分比一樣：`clamp()` 處理連續的大小變化（字級、內距、欄寬），換一種排法（單欄變兩欄、選單收起來）仍然是查詢的工作。一個頁面的各級標題該用哪幾個字級、彼此的比例怎麼訂，是字體排印的主題，不在這座島的範圍。字會跟著視窗流動之後，下一個要跟著視窗調整的是圖片，那是下一課「響應式圖片與媒體」的內容。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'rwd09-q1', prompt: '根字級是 16px，視窗寬 1000px。`h1` 計算後的字級是多少？',
      code: { language: 'CSS', text: 'h1 { font-size: clamp(1.25rem, 5vw, 2.5rem); }' },
      options: ['50px', '40px', '20px', '30px'],
      answer: 1,
      explanation: '偏好值 `5vw` 在 1000px 寬時是 50px，超過最大值 2.5rem（40px），所以結果被擋在 40px。50px 是沒有上限時的值；20px 是最小值，只有 `5vw` 比它小（視窗窄於 400px）時才會用到；30px 是 600px 寬時的結果。',
    },
    {
      id: 'rwd09-q2', prompt: '標題只寫了 `font-size: 4vw`。使用者在桌機瀏覽器把頁面的縮放從 100% 調到 200%，這個標題在螢幕上看起來的大小會怎麼變？',
      options: [
        '幾乎不變：視窗以 CSS 的 px 計算的寬度剩下一半，`4vw` 也跟著減半，再畫成 2 倍大，剛好抵銷',
        '變成 2 倍：縮放頁面會把所有的長度一起放大',
        '變成一半：視窗變窄了，`4vw` 跟著變小',
        '變成 4 倍：`vw` 與縮放的效果會相乘',
      ],
      answer: 0,
      explanation: '放大到 200% 時，每個 CSS 的 px 畫成 2 倍大，但視窗以 CSS 的 px 計算的寬度也剩下一半，`4vw` 算出來的 px 數減半，兩者抵銷，標題看起來和原來一樣大。這正是純 `vw` 字級的無障礙問題：需要放大的人放大不了。用 rem 寫的字級才會變成 2 倍；「變成一半」只算了視窗變窄，忘了每個 px 也被畫大了。',
    },
    {
      id: 'rwd09-q3', prompt: '根字級是 16px。把視窗從 320px 慢慢拉寬到 1600px，這個標題計算後的字級怎麼變？',
      code: { language: 'CSS', text: 'h1 { font-size: clamp(3rem, 5vw, 1.5rem); }' },
      options: [
        '從 24px 平滑地變到 48px',
        '從 16px 變到 80px：寫錯的 `clamp()` 等於沒有界線',
        '宣告無效而被丟掉，標題用回預設的字級',
        '一直是 48px：最小值比最大值大的時候，最小值勝出',
      ],
      answer: 3,
      explanation: '`clamp(MIN, VAL, MAX)` 等於 `max(MIN, min(VAL, MAX))`。這裡的 `min(5vw, 1.5rem)` 最多是 24px，再和 3rem（48px）取比較大的，永遠是 48px。這個寫法在語法上是合法的，所以不會被丟掉，也不會提示錯誤；它既不是平滑變化，也不是沒有界線，而是固定在第一個參數。三個參數要由小到大排：`clamp(1.5rem, 5vw, 3rem)`。',
    },
    {
      id: 'rwd09-q4', prompt: '根字級是 16px。設計稿要標題在視窗寬 400px 時是 32px、1200px 時是 48px，兩個寬度之間直線變化（所以 800px 時是 40px）。哪一個寫法符合？',
      options: [
        '`font-size: clamp(2rem, 2rem + 2vw, 3rem);`',
        '`font-size: clamp(2rem, 4vw, 3rem);`',
        '`font-size: clamp(2rem, 1.5rem + 2vw, 3rem);`',
        '`font-size: clamp(2rem, 1.5rem + 1.33vw, 3rem);`',
      ],
      answer: 2,
      explanation: '斜率是（48 − 32）÷（1200 − 400）= 0.02，也就是 `2vw`；固定的部分是 32 − 0.02 × 400 = 24px = 1.5rem。驗算：400px 時 24 + 8 = 32px，800px 時 40px，1200px 時 48px。`2rem + 2vw` 把最小字級直接當成固定的部分，400px 時就已經是 40px。`4vw` 是拿 48 ÷ 1200 算的，1200px 時對了，但 800px 時只有 32px，不是直線上的 40px。`1.33vw` 是把字級的差除以 1200 而不是除以兩個寬度的差，1200px 時只到大約 40px。',
    },
    {
      id: 'rwd09-q5', prompt: '下面哪一條宣告會被瀏覽器當成無效，整條丟掉？',
      options: [
        '`font-size: clamp(1.5rem, 1rem+2.5vw, 3rem);`',
        '`font-size: clamp(1.5rem, 2.5vw + 1rem, 3rem);`',
        '`font-size: clamp(1.5rem, calc(1rem + 2.5vw), 3rem);`',
        '`font-size: max(1.5rem, min(1rem + 2.5vw, 3rem));`',
      ],
      answer: 0,
      explanation: '算式裡的 `+` 與 `-` 兩邊一定要有空白。`1rem+2.5vw` 會被讀成 `1rem` 後面緊跟著一個帶正號的 `+2.5vw`，中間沒有運算符號，整條宣告無效。其他三條都合法：加法的兩邊可以交換；`clamp()` 裡可以再包一層 `calc()`，只是沒有必要；`max()` 包 `min()` 則是 `clamp()` 的另一種寫法，結果相同。',
    },
    {
      id: 'rwd09-q6', prompt: '使用者把瀏覽器的預設字級調成 20px，視窗寬 800px。這個標題計算後的字級是多少？',
      code: { language: 'CSS', text: 'h1 { font-size: clamp(1.5rem, 1rem + 2.5vw, 3rem); }' },
      options: ['36px', '45px', '60px', '40px'],
      answer: 3,
      explanation: '根字級是 20px，所以最小值是 30px、最大值是 60px；偏好值是 20 +（800 × 2.5%）= 20 + 20 = 40px，落在範圍內，結果是 40px。36px 是用預設的 16px 算的（16 + 20）；45px 是把 36px 整個乘以 1.25，但 `vw` 的那 20px 並不跟著根字級變；60px 是最大值，這個寬度還沒碰到。',
    },
    {
      id: 'rwd09-q7', prompt: '要替文章頁的大標題寫流體字級。哪一個寫法最能同時顧到窄螢幕、寬螢幕，以及需要放大文字的使用者？',
      options: [
        '`font-size: 6vw;`',
        '`font-size: clamp(1.75rem, 1.25rem + 2vw, 3rem);`',
        '`font-size: clamp(28px, 6vw, 48px);`',
        '`font-size: clamp(0.5rem, 10vw, 8rem);`',
      ],
      answer: 1,
      explanation: '`clamp(1.75rem, 1.25rem + 2vw, 3rem)` 有合理的最小與最大值（28px 與 48px，不到 2 倍），固定的長度都是 rem，偏好值也有 rem 的部分，使用者調大預設字級或縮放頁面時都會跟著變大。純 `6vw` 沒有界線，也完全不理會使用者的設定。`clamp(28px, 6vw, 48px)` 有界線，但全部是 px 與 `vw`，調大預設字級時沒有反應。最後一個的最小值只有 8px，最大值是最小值的 16 倍，字級幾乎完全由視窗決定。',
    },
    {
      id: 'rwd09-q8', prompt: '根字級是 16px，`body` 沒有外距與內距，視窗寬 500px（頁面沒有捲軸）。`#page` 的寬度是多少？',
      code: { language: 'CSS', text: '#page {\n  width: min(100% - 2rem, 40rem);\n  margin: 0 auto;\n}' },
      options: ['500px', '640px', '468px', '608px'],
      answer: 2,
      explanation: '`100% - 2rem` 是 500 − 32 = 468px，`40rem` 是 640px，`min()` 取比較小的 468px，兩側各留 16px。640px 是上限，要到視窗寬 672px 以上才會用到；500px 是忘了扣掉 2rem；608px 是把 2rem 從 40rem 裡扣掉，但減法只屬於第一個參數。',
    },
  ],
  webCode: {
    examples: [stepsAndVw, minMaxClamp, twoPoints, userSetting, fluidSpace],
    exercises: [exCap, exDerive, exColumn, exBanner],
  },
};
