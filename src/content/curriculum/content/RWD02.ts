import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD02 viewport and relative units (RWD-1). A web-code lesson of HTML and CSS only. The examples are small pages of the
 * made-up 小島圖書館／小島商店 whose sizes follow from explicit numbers (percentages of a known width, multiples of the
 * 16px root font size, shares of the check viewport), so the facts under them are measured in Chromium, some of them at
 * two viewport widths (`resize`). What a phone does without the viewport meta tag cannot be shown in a frame: it is
 * taught in text and a table, and the tag is checked by its attributes. The exercises are calculations: the viewport
 * tag (HTML), px to rem/em (also run with a 20px root), percentage columns and a page that must not scroll sideways
 * (both checked at two widths). Media queries, clamp(), flexbox and grid are not taught here.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const viewportMeta: WebExample = {
  id: 'rwd02-viewport-meta', title: 'viewport 設定放在 head 裡',
  description: '小島圖書館的首頁，一份完整的文件：`<head>` 裡除了編碼與標題，還有一行 `name="viewport"` 的 `<meta>`。',
  files: {
    html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>小島圖書館</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="bar">小島圖書館</header>
  <p class="intro">今天開放到 17:00，歡迎來借書。</p>
</body>
</html>`,
    css: String.raw`body { margin: 0; }
.bar {
  padding: 12px 16px;
  background-color: #1565c0;
  color: white;
}
.intro { margin: 16px; }`,
  },
  observe: [
    { check: 'count', selector: 'head > meta[name="viewport"]', count: 1, label: '`head` 裡有一個 `name="viewport"` 的 `meta`：它是給瀏覽器的設定，不會顯示在畫面上' },
    { check: 'attr', selector: 'meta[name="viewport"]', name: 'content', value: 'width=device-width', match: 'includes', label: '`content` 裡有 `width=device-width`：排版用的寬度等於裝置的寬度' },
    { check: 'attr', selector: 'meta[name="viewport"]', name: 'content', value: 'initial-scale=1', match: 'includes', label: '`content` 裡有 `initial-scale=1`：一開始不放大也不縮小' },
    { check: 'box', selector: '.bar', measure: 'width', value: 600, label: '頁首沒有寫寬度，填滿寬 600px 的檢查視窗：框架的寬度是真的，不會假裝成 980px' },
  ],
};

const percent: WebExample = {
  id: 'rwd02-percent', title: '百分比跟著包含區塊的寬度',
  description: '淡藍色的書架 `.shelf` 寬 `80%`；裡面深藍色的封面 `.cover` 沒有內容，寬 `50%`、上內距 `25%`。最下面黃色的尺 `.ruler` 固定 300px 寬。',
  widths: [600, 360, 1000],
  files: {
    html: String.raw`<div class="shelf">
  <div class="cover"></div>
  <p class="caption">封面佔書架寬度的一半</p>
</div>
<div class="ruler">固定 300px</div>`,
    css: String.raw`body { margin: 0; }
.shelf {
  width: 80%;
  margin: 0 auto;
  background-color: #bbdefb;
}
.cover {
  width: 50%;
  padding-top: 25%;
  background-color: #1565c0;
}
.caption { margin: 0; padding: 8px; }
.ruler {
  width: 300px;
  margin-top: 12px;
  background-color: #ffe082;
}`,
  },
  observe: [
    { check: 'box', selector: '.shelf', measure: 'width', value: 480, label: '視窗寬 600px：書架寬 480px，也就是 600 × 80%' },
    { check: 'box', selector: '.cover', measure: 'width', value: 240, label: '封面寬 240px：書架 480px 的 50%，不是視窗 600px 的 50%' },
    { check: 'box', selector: '.cover', measure: 'height', value: 120, label: '封面高 120px：`padding-top: 25%` 算的是書架的寬度（480 × 25%），不是高度' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '.cover', measure: 'width', value: 400, label: '視窗改成 1000px：書架變成 800px，封面跟著變成 400px' },
    { check: 'box', selector: '.ruler', measure: 'width', value: 300, label: '用 px 寫的尺仍然是 300px：絕對單位不跟著任何東西變' },
  ],
};

const emRem: WebExample = {
  id: 'rwd02-em-rem', title: 'em 會一層一層放大，rem 不會',
  description: '上面兩組各有兩層盒子：`.em` 的字級是 `1.25em`，`.rem` 的字級是 `1.25rem`。下面兩個標籤共用 `padding: 0 1em`，字級分別是 `1rem` 與 `2rem`。',
  files: {
    html: String.raw`<div class="em" id="em1">外層 1.25em
  <div class="em" id="em2">內層 1.25em</div>
</div>
<div class="rem" id="rem1">外層 1.25rem
  <div class="rem" id="rem2">內層 1.25rem</div>
</div>
<p class="tags">
  <span class="tag" id="small">新書</span>
  <span class="tag" id="large">熱門</span>
</p>`,
    css: String.raw`.em { font-size: 1.25em; }
.rem { font-size: 1.25rem; }
.tag {
  padding: 0 1em;
  background-color: #ffe082;
}
#small { font-size: 1rem; }
#large { font-size: 2rem; }`,
  },
  observe: [
    { check: 'style', selector: '#em1', property: 'font-size', value: '20px', label: '外層的 `1.25em`：父元素字級 16px 的 1.25 倍，20px' },
    { check: 'style', selector: '#em2', property: 'font-size', value: '25px', label: '內層同樣寫 `1.25em`，父元素已經是 20px，所以是 25px：em 複合了' },
    { check: 'style', selector: '#rem2', property: 'font-size', value: '20px', label: '內層的 `1.25rem` 仍是 20px：rem 只看根字級 16px，和包了幾層無關' },
    { check: 'style', selector: '#small', property: 'padding-left', value: '16px', label: '字級 16px 的標籤，`1em` 的左內距是 16px' },
    { check: 'style', selector: '#large', property: 'padding-left', value: '32px', label: '字級 32px 的標籤，同一條 `1em` 算出來是 32px：內距跟著自己的字級' },
  ],
};

const viewportUnits: WebExample = {
  id: 'rwd02-viewport-units', title: '視窗單位只看視窗',
  description: '淡藍色的 `.screen` 高 `100dvh`；裡面黃色的 `.half` 寬 `50vw`、高 `25vh`。',
  widths: [600, 360, 1000],
  height: 320,
  files: {
    html: String.raw`<section class="screen">
  <div class="half">寬 50vw、高 25vh</div>
</section>`,
    css: String.raw`body { margin: 0; }
.screen {
  height: 100dvh;
  background-color: #e3f2fd;
}
.half {
  width: 50vw;
  height: 25vh;
  background-color: #ffe082;
}`,
  },
  observe: [
    { check: 'box', selector: '.half', measure: 'width', value: 300, label: '視窗寬 600px、高 400px：`50vw` 是 300px' },
    { check: 'box', selector: '.half', measure: 'height', value: 100, label: '`25vh` 是 100px：視窗高度 400px 的四分之一' },
    { check: 'box', selector: '.screen', measure: 'height', value: 400, label: '`100dvh` 是 400px：剛好一個視窗高' },
    { do: 'resize', width: 1000, height: 800 },
    { check: 'box', selector: '.half', measure: 'width', value: 500, label: '視窗改成寬 1000px、高 800px：`50vw` 變成 500px' },
    { check: 'box', selector: '.screen', measure: 'height', value: 800, label: '`100dvh` 跟著變成 800px' },
  ],
};

const overflow: WebExample = {
  id: 'rwd02-overflow', title: '比視窗寬的元素造成橫向捲動',
  description: '兩條內距相同的橫幅：`#bad` 寬 `100vw`，`#good` 寬 `100%` 並加上 `box-sizing: border-box`。最下面寬 200px 的框裡是一串沒有空白的取貨代碼。',
  widths: [360, 600, 1000],
  files: {
    html: String.raw`<div class="hero" id="bad">100vw 再加內距</div>
<div class="hero" id="good">100%，內距算在裡面</div>
<p class="address">取貨代碼：ISLANDSHOP20261123A7F3K9Q2M5X8B1TW</p>`,
    css: String.raw`body { margin: 0; }
.hero {
  padding: 16px 20px;
  margin-bottom: 8px;
  background-color: #bbdefb;
}
#bad { width: 100vw; }
#good {
  width: 100%;
  box-sizing: border-box;
}
.address {
  width: 200px;
  margin: 8px 20px;
  border: 2px solid #1565c0;
  overflow-wrap: anywhere;
}`,
  },
  observe: [
    { check: 'box', selector: '#bad', measure: 'width', value: 640, label: '視窗寬 600px：`#bad` 到邊框為止寬 640px，`100vw` 之外又加了左右各 20px 的內距' },
    { check: 'box', selector: '#good', measure: 'width', value: 600, label: '`#good` 寬 600px：`border-box` 把內距算在 `100%` 裡面' },
    { do: 'resize', width: 360 },
    { check: 'box', selector: '#bad', measure: 'right', value: 400, label: '視窗改成 360px：`#bad` 的右緣在 400px，超出視窗 40px，頁面可以左右捲動' },
    { check: 'box', selector: '#good', measure: 'right', value: 360, label: '`#good` 的右緣剛好在 360px，沒有超出視窗' },
    { check: 'style', selector: '.address', property: 'overflow-wrap', value: 'anywhere', label: '放代碼的段落 `overflow-wrap` 是 `anywhere`：一行放不下時，可以從任何字元之間換行' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const exViewportMeta: WebExercise = {
  id: 'rwd02-ex-viewport-meta', title: '替頁面加上 viewport 設定',
  statement: '小島商店的首頁在手機上整頁被縮得很小，字要放大才看得清楚：`<head>` 裡少了 viewport 設定。請在 `<head>` 裡加上一個 `name` 是 `viewport` 的 `<meta>`，它的 `content` 要有兩個設定：排版的寬度等於裝置的寬度、一開始的縮放比例是 1。不要加上任何限制使用者縮放的設定（`user-scalable`、`maximum-scale`）。預覽是一個寬度固定的框架，加了之後畫面不會改變；檢查看的是這個 `<meta>` 的屬性。',
  hints: [
    '這一行寫在 `<head>` 裡，和 `<meta charset="utf-8">` 放在一起；它是沒有結束標籤的 `<meta>`，有 `name` 與 `content` 兩個屬性。',
    '`content` 裡的兩個設定用逗號分開：一個是 `width=…`，值是代表「裝置寬度」的關鍵字；另一個是 `initial-scale=…`。',
    '在 `<head>` 裡加上 `<meta name="viewport" content="width=device-width, initial-scale=1">`。',
  ],
  explanation: '`width=device-width` 請手機瀏覽器用裝置的寬度（例如 360px）排版，不要假裝成大約 980px 的寬螢幕再整頁縮小；`initial-scale=1` 讓頁面一開始不放大也不縮小。只需要這兩個設定：`user-scalable=no` 與 `maximum-scale=1` 會讓需要放大閱讀的人無法縮放頁面，不要加。',
  starter: { html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>小島商店</title>
</head>
<body>
  <h1>小島商店</h1>
  <p>今日特價：手工鳳梨酥禮盒。</p>
</body>
</html>` },
  solution: { html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>小島商店</title>
</head>
<body>
  <h1>小島商店</h1>
  <p>今日特價：手工鳳梨酥禮盒。</p>
</body>
</html>` },
  steps: [
    { check: 'count', selector: 'head > meta[name="viewport"]', count: 1, label: '`head` 裡有一個 `name` 是 `viewport` 的 `meta`' },
    { check: 'attr', selector: 'meta[name="viewport"]', name: 'content', value: 'width=device-width', match: 'includes', label: '它的 `content` 把排版的寬度設成裝置的寬度' },
    { check: 'attr', selector: 'meta[name="viewport"]', name: 'content', value: 'initial-scale=1', match: 'includes', label: '它的 `content` 把一開始的縮放比例設成 1' },
    { check: 'count', selector: 'meta[name="viewport"][content*="user-scalable"], meta[name="viewport"][content*="maximum-scale"]', count: 0, label: '`content` 裡沒有 `user-scalable` 或 `maximum-scale`：不限制使用者縮放' },
  ],
  mistakes: [
    { files: { html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>小島商店</title>
</head>
<body>
  <h1>小島商店</h1>
  <p>今日特價：手工鳳梨酥禮盒。</p>
</body>
</html>` }, why: '從舊教學整行複製，多了 `maximum-scale=1, user-scalable=no`。這兩個設定的作用是禁止使用者用兩指放大頁面，視力不好的人會因此讀不到內容。只留 `width=device-width, initial-scale=1`。' },
    { files: { html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=360, initial-scale=1">
  <title>小島商店</title>
</head>
<body>
  <h1>小島商店</h1>
  <p>今日特價：手工鳳梨酥禮盒。</p>
</body>
</html>` }, why: '把寬度寫死成 `width=360`。手機的寬度不只一種（也有 390px、412px，還有平板），寫死的數字只對其中一種正確。`device-width` 這個關鍵字才是「這台裝置自己的寬度」。' },
  ],
};

const CARD_BODY = String.raw`<article id="card">
  <h2>借閱到期通知</h2>
  <p>《島嶼植物圖鑑》將在 3 天後到期。</p>
  <button type="button" class="btn" id="renew">續借</button>
  <button type="button" class="btn large" id="more">查看全部借閱</button>
</article>`;

// The check must give the same numbers in every learner's browser, whatever default font size they have set, so the
// page states its root size: 16px for the main run, 20px for the variant that stands for a user who enlarged it.
const cardPage = (rootPx: number) => `<!DOCTYPE html>
<html lang="zh-Hant" style="font-size: ${rootPx}px;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>借閱通知</title>
</head>
<body>
${CARD_BODY}
</body>
</html>`;
const exRemEm: WebExercise = {
  id: 'rwd02-ex-rem-em', title: '把通知卡片的 px 換成 rem 與 em',
  statement: 'index.html 不能改。style.css 裡的字級與內距全部用 px 寫死，使用者把瀏覽器的預設字級調大時，這張卡片完全不會跟著放大。請把它們改成相對單位。根字級是預設的 16px 時，計算後的大小要是：`#card` 的字級 20px、四邊內距 24px；`#card h2` 的字級 32px；`.btn` 的字級 16px；`.large` 的字級 24px。按鈕的內距要跟著按鈕自己的字級：上下是字級的 0.5 倍、左右是 1 倍，所以 `#renew` 的左內距是 16px，字比較大的 `#more` 是 24px。為了讓檢查在每個人的瀏覽器都得到同樣的數字，index.html 用行內樣式把根元素的字級寫成 16px，代替「瀏覽器預設的字級」；另一份檢查把它換成 20px（就像使用者把預設字級調大），這時每一個尺寸都要跟著變成 1.25 倍，所以答案不能留下 px，也不要在 style.css 裡設定 `html` 的字級。真實的網站不要把根字級寫死成 px：那樣使用者調整的預設字級就不再有作用。',
  hints: [
    '先決定每個尺寸要跟著誰：要跟著根字級的用 rem，要跟著元素自己字級的用 em。px 換成 rem 的算法是除以 16。',
    '`#card` 的字級是 20 ÷ 16 = 1.25rem、內距 24 ÷ 16 = 1.5rem；標題 32 ÷ 16 = 2rem；`.btn` 是 1rem，`.large` 是 1.5rem。按鈕的內距要跟著按鈕自己的字級，所以單位是 em。',
    '`.btn` 的內距寫成 `padding: 0.5em 1em;`：`#renew` 的字級是 16px，左內距就是 16px；`#more` 的字級是 24px，左內距自動變成 24px。',
  ],
  explanation: 'rem 以根字級為基準：1.25rem = 20px、1.5rem = 24px、2rem = 32px，根字級換成 20px 時自動變成 25px、30px、40px。按鈕的內距用 em：em 以元素自己的字級為基準，所以同一條 `padding: 0.5em 1em` 在字級 16px 的 `#renew` 上是 8px 與 16px，在字級 24px 的 `#more` 上是 12px 與 24px，不必替大按鈕另外寫一條內距。字級本身不用 em，因為 `font-size` 的 em 看的是父元素的字級：`#card` 已經是 20px，裡面的 `2em` 會變成 40px。',
  fixed: { html: cardPage(16) },
  starter: { css: String.raw`#card {
  font-size: 20px;
  padding: 24px;
  background-color: #e3f2fd;
}
#card h2 {
  font-size: 32px;
  margin: 0;
}
.btn {
  font-size: 16px;
  padding: 8px 16px;
}
.large {
  font-size: 24px;
}` },
  solution: { css: String.raw`#card {
  font-size: 1.25rem;
  padding: 1.5rem;
  background-color: #e3f2fd;
}
#card h2 {
  font-size: 2rem;
  margin: 0;
}
.btn {
  font-size: 1rem;
  padding: 0.5em 1em;
}
.large {
  font-size: 1.5rem;
}` },
  steps: [
    { check: 'style', selector: '#card', property: 'font-size', value: '20px', label: '根字級 16px 時，`#card` 的字級是 20px' },
    { check: 'style', selector: '#card', property: 'padding-left', value: '24px', label: '`#card` 的左內距是 24px' },
    { check: 'style', selector: '#card h2', property: 'font-size', value: '32px', label: '標題的字級是 32px' },
    { check: 'style', selector: '#renew', property: 'padding-left', value: '16px', label: '`#renew` 的字級是 16px，左內距也是 16px' },
    { check: 'style', selector: '#more', property: 'font-size', value: '24px', label: '`#more` 的字級是 24px' },
    { check: 'style', selector: '#more', property: 'padding-left', value: '24px', label: '`#more` 的左內距跟著它自己的字級，是 24px' },
  ],
  mistakes: [
    { files: { css: String.raw`#card {
  font-size: 1.25em;
  padding: 1.5em;
  background-color: #e3f2fd;
}
#card h2 {
  font-size: 2em;
  margin: 0;
}
.btn {
  font-size: 1em;
  padding: 0.5em 1em;
}
.large {
  font-size: 1.5em;
}` }, why: '每個數字都除以 16，單位卻全部寫成 em。em 的基準不是根字級：`#card` 的 `padding: 1.5em` 看的是它自己的字級 20px，算出來是 30px；標題的 `2em` 看的是父元素 `#card` 的 20px，變成 40px；按鈕的 `1em` 也變成 20px。要以根字級為基準，單位是 rem。' },
    { files: { css: String.raw`#card {
  font-size: 1.25rem;
  padding: 1.5rem;
  background-color: #e3f2fd;
}
#card h2 {
  font-size: 2rem;
  margin: 0;
}
.btn {
  font-size: 1rem;
  padding: 0.5rem 1rem;
}
.large {
  font-size: 1.5rem;
}` }, why: '按鈕的內距也用了 rem。`1rem` 只看根字級，所以兩顆按鈕的左內距都是 16px；字級 24px 的 `#more` 沒有跟著變寬，字顯得很擠。要跟著按鈕自己的字級，內距的單位是 em。' },
    { files: { css: String.raw`#card {
  font-size: 20px;
  padding: 1.5rem;
  background-color: #e3f2fd;
}
#card h2 {
  font-size: 32px;
  margin: 0;
}
.btn {
  font-size: 16px;
  padding: 0.5em 1em;
}
.large {
  font-size: 24px;
}` }, why: '只改了內距，字級還是 px。根字級是 16px 時每個數字都對，但使用者把預設字級調成 20px 之後，文字完全沒有變大（所以換了根字級的那份檢查不會通過）。字級正是最需要跟著使用者設定的東西。' },
  ],
  variants: [{
    title: '根元素的字級換成 20px：每個尺寸都要變成 1.25 倍',
    fixed: { html: cardPage(20) },
    steps: [
      { check: 'style', selector: '#card', property: 'font-size', value: '25px', label: '根字級 20px 時，`#card` 的字級是 25px' },
      { check: 'style', selector: '#card', property: 'padding-left', value: '30px', label: '`#card` 的左內距是 30px' },
      { check: 'style', selector: '#card h2', property: 'font-size', value: '40px', label: '標題的字級是 40px' },
      { check: 'style', selector: '#renew', property: 'padding-left', value: '20px', label: '`#renew` 的左內距是 20px' },
      { check: 'style', selector: '#more', property: 'padding-left', value: '30px', label: '`#more` 的左內距是 30px' },
    ],
  }],
};

const exColumns: WebExercise = {
  id: 'rwd02-ex-percent-columns', title: '用百分比分出兩欄',
  statement: 'index.html 不能改。`#row` 的左右各有 20px 的外距，裡面的 `#side` 與 `#main` 已經用 `inline-block` 並排，但還沒有寬度。設計稿是在 600px 寬的視窗上量的：這時 `#row` 寬 560px，`#side` 寬 168px，`#main` 寬 392px，`#main` 的左內距是 28px。請把這三個數字換算成百分比寫進 style.css，讓視窗變寬時比例不變：視窗寬 1000px 時，`#side` 要是 288px、`#main` 672px、`#main` 的左內距 48px。`body`、`#row` 與 `.col` 已經寫好的宣告請保留（`box-sizing: border-box` 讓內距算在寬度裡面，兩欄才排得進同一列）。',
  hints: [
    '百分比的基準是包含區塊的寬度。`#side` 與 `#main` 的包含區塊是 `#row`，不是視窗：視窗 600px 時它是 600 − 20 × 2 = 560px。',
    '把每個數字除以 560：168 ÷ 560、392 ÷ 560、28 ÷ 560。內距的百分比和寬度一樣，以包含區塊的寬度為基準。',
    '`#side { width: 30%; }`，`#main { width: 70%; padding-left: 5%; }`。',
  ],
  explanation: '168 ÷ 560 = 30%，392 ÷ 560 = 70%，28 ÷ 560 = 5%。三個百分比都以 `#row` 的寬度為基準：視窗變成 1000px 時 `#row` 是 960px，三個值自動變成 288px、672px 與 48px。兩欄合計剛好 100%，加上 `border-box` 把 `#main` 的內距算在 70% 裡面，所以排得進同一列。分母要用包含區塊的 560px，不是視窗的 600px。',
  widths: [600, 1000, 360],
  fixed: { html: String.raw`<div id="row"><aside id="side" class="col">分類</aside><main id="main" class="col">本週新書</main></div>` },
  starter: { css: String.raw`body { margin: 0; }
#row { margin: 0 20px; }
/* 兩欄並排、上緣對齊、內距算在寬度裡：這幾行請保留 */
.col {
  display: inline-block;
  vertical-align: top;
  box-sizing: border-box;
  height: 120px;
}
#side {
  background-color: #bbdefb;
}
#main {
  background-color: #ffe082;
}` },
  solution: { css: String.raw`body { margin: 0; }
#row { margin: 0 20px; }
/* 兩欄並排、上緣對齊、內距算在寬度裡：這幾行請保留 */
.col {
  display: inline-block;
  vertical-align: top;
  box-sizing: border-box;
  height: 120px;
}
#side {
  width: 30%;
  background-color: #bbdefb;
}
#main {
  width: 70%;
  padding-left: 5%;
  background-color: #ffe082;
}` },
  steps: [
    { check: 'box', selector: '#side', measure: 'width', value: 168, label: '視窗寬 600px（`#row` 寬 560px）：`#side` 寬 168px' },
    { check: 'box', selector: '#main', measure: 'left', value: 168, from: '#row', label: '`#main` 緊接在 `#side` 的右邊：左緣距離 `#row` 的左緣 168px' },
    { check: 'style', selector: '#main', property: 'padding-left', value: '28px', label: '`#main` 的左內距是 28px' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#side', measure: 'width', value: 288, label: '視窗寬 1000px（`#row` 寬 960px）：`#side` 寬 288px' },
    { check: 'box', selector: '#main', measure: 'width', value: 672, label: '`#main` 寬 672px' },
    { check: 'style', selector: '#main', property: 'padding-left', value: '48px', label: '`#main` 的左內距變成 48px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#row { margin: 0 20px; }
/* 兩欄並排、上緣對齊、內距算在寬度裡：這幾行請保留 */
.col {
  display: inline-block;
  vertical-align: top;
  box-sizing: border-box;
  height: 120px;
}
#side {
  width: 168px;
  background-color: #bbdefb;
}
#main {
  width: 392px;
  padding-left: 28px;
  background-color: #ffe082;
}` }, why: '直接把設計稿上的 px 抄進去。視窗剛好 600px 時完全正確，但 px 是絕對單位：視窗變成 1000px 時兩欄還是 168px 與 392px，右邊空了一大塊。要讓比例不變，得換算成百分比。' },
    { files: { css: String.raw`body { margin: 0; }
#row { margin: 0 20px; }
/* 兩欄並排、上緣對齊、內距算在寬度裡：這幾行請保留 */
.col {
  display: inline-block;
  vertical-align: top;
  box-sizing: border-box;
  height: 120px;
}
#side {
  width: 30vw;
  background-color: #bbdefb;
}
#main {
  width: 70vw;
  padding-left: 5vw;
  background-color: #ffe082;
}` }, why: '比例算對了，單位卻用了 vw。vw 看的是整個視窗，不是 `#row`：視窗 600px 時 `30vw` 是 180px、`70vw` 是 420px，合計 600px，比 560px 寬的 `#row` 多出 40px，`#main` 被擠到下一列。要跟著父元素的寬度，用的是百分比。' },
  ],
};

const exNoScroll: WebExercise = {
  id: 'rwd02-ex-no-horizontal-scroll', title: '修好會左右捲動的首頁',
  statement: 'index.html 不能改。小島商店的首頁在 360px 寬的手機上可以左右捲動，原因有兩個：頁首 `#hero` 寬 `100vw` 又加了內距；商品卡片 `#card` 固定 480px 寬。請修改 style.css：（1）`#hero` 的右緣要剛好在視窗的右邊，左右各 24px 的內距要保留；（2）`#card` 最寬 480px，放不下時就縮到和 `#list` 的內容區一樣寬（視窗 360px 時是 328px，右緣在 344px），在寬的視窗裡維持 480px 並水平置中。檢查會先在 360px、再把視窗改成 1024px 各看一次。`body { margin: 0; }` 與 `#list` 的內距請保留；只把捲軸藏起來不算修好。',
  hints: [
    '`#hero` 的總寬度是 `width` 加上左右內距（預設的 `content-box`）。區塊不寫寬度時本來就會填滿父元素；或者讓內距算在寬度裡面。',
    '`#card` 需要兩件事：平常跟著容器的寬度，但有一個上限。「最多多寬」的屬性是 `max-width`。',
    '`#hero` 改成 `width: 100%; box-sizing: border-box;`（或把 `width` 整行刪掉）；`#card` 改成 `width: 100%; max-width: 480px;`。',
  ],
  explanation: '`#hero`：`100vw` 是 360px，加上 24 × 2 的內距變成 408px。改成 `width: 100%` 並加上 `box-sizing: border-box`，內距算在寬度裡面，總寬度就等於父元素的寬度；不寫 `width` 也可以，區塊本來就填滿父元素。`#card`：`width: 100%` 讓它跟著 `#list` 的內容區（360 − 16 × 2 = 328px），`max-width: 480px` 讓它在寬的視窗裡不超過 480px，左右外距 `auto` 再把它置中：視窗 1024px 時左緣在 16 +（992 − 480）÷ 2 = 272px。',
  viewport: { width: 360, height: 640 },
  widths: [360, 1024],
  fixed: { html: String.raw`<header id="hero">
  <h1>小島商店</h1>
</header>
<main id="list">
  <div id="card">本週特價：手工鳳梨酥禮盒</div>
</main>` },
  starter: { css: String.raw`body { margin: 0; }
#hero {
  width: 100vw;
  padding: 16px 24px;
  background-color: #1565c0;
  color: white;
}
#hero h1 { margin: 0; font-size: 1.5rem; }
#list { padding: 0 16px; }
#card {
  width: 480px;
  height: 100px;
  margin: 16px auto;
  background-color: #ffe082;
}` },
  solution: { css: String.raw`body { margin: 0; }
#hero {
  box-sizing: border-box;
  width: 100%;
  padding: 16px 24px;
  background-color: #1565c0;
  color: white;
}
#hero h1 { margin: 0; font-size: 1.5rem; }
#list { padding: 0 16px; }
#card {
  width: 100%;
  max-width: 480px;
  height: 100px;
  margin: 16px auto;
  background-color: #ffe082;
}` },
  steps: [
    { check: 'box', selector: '#hero', measure: 'right', value: 360, label: '視窗寬 360px：`#hero` 的右緣在 360px，沒有超出視窗' },
    { check: 'style', selector: '#hero', property: 'padding-left', value: '24px', label: '`#hero` 的左內距維持 24px' },
    { check: 'box', selector: '#card', measure: 'right', value: 344, label: '`#card` 的右緣在 344px：縮到和 `#list` 的內容區一樣寬' },
    { do: 'resize', width: 1024 },
    { check: 'box', selector: '#hero', measure: 'right', value: 1024, label: '視窗寬 1024px：`#hero` 的右緣在 1024px' },
    { check: 'box', selector: '#card', measure: 'width', value: 480, label: '`#card` 寬 480px：不超過上限' },
    { check: 'box', selector: '#card', measure: 'left', value: 272, label: '`#card` 仍然水平置中：左緣在 272px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#hero {
  width: 100%;
  padding: 16px 24px;
  background-color: #1565c0;
  color: white;
}
#hero h1 { margin: 0; font-size: 1.5rem; }
#list { padding: 0 16px; }
#card {
  width: 100%;
  max-width: 480px;
  height: 100px;
  margin: 16px auto;
  background-color: #ffe082;
}` }, why: '只把 `100vw` 換成 `100%`。預設的 `content-box` 把內距加在寬度外面：100% 是 360px，再加左右各 24px，`#hero` 還是 408px 寬。問題出在「寬度加內距」，要加上 `box-sizing: border-box`，或乾脆不寫 `width`。' },
    { files: { css: String.raw`body { margin: 0; overflow-x: hidden; }
#hero {
  width: 100vw;
  padding: 16px 24px;
  background-color: #1565c0;
  color: white;
}
#hero h1 { margin: 0; font-size: 1.5rem; }
#list { padding: 0 16px; }
#card {
  width: 480px;
  height: 100px;
  margin: 16px auto;
  background-color: #ffe082;
}` }, why: '用 `overflow-x: hidden` 把橫向捲軸藏起來。捲軸不見了，但 `#hero` 仍然寬 408px、`#card` 仍然寬 480px，超出視窗的內容只是被切掉，使用者再也看不到。要修的是元素的寬度。' },
    { files: { css: String.raw`body { margin: 0; }
#hero {
  box-sizing: border-box;
  width: 100%;
  padding: 16px 24px;
  background-color: #1565c0;
  color: white;
}
#hero h1 { margin: 0; font-size: 1.5rem; }
#list { padding: 0 16px; }
#card {
  width: 100%;
  height: 100px;
  margin: 16px auto;
  background-color: #ffe082;
}` }, why: '`#card` 只寫了 `width: 100%`，沒有上限。在 360px 的視窗裡沒有問題，但視窗變成 1024px 時卡片跟著拉到 992px 寬。流動的寬度通常要搭配 `max-width` 一起寫。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD02: LessonContent = {
  lessonId: 'RWD02',
  motivation: '同一個頁面在桌機上好好的，到了手機卻整頁縮得像一張郵票，或是右邊多出一截、得左右滑才看得完。這一課處理這兩個問題的根源：先用 viewport 設定讓手機照真實的寬度排版，再學會在 px、百分比、rem 與 em、vw 與 dvh 之間選對單位，讓每個尺寸跟著該跟的東西變，版面在任何寬度下都不產生橫向捲動。',
  sections: [
    {
      id: 'rwd02-viewport-section', title: 'viewport 設定：請手機照真實的寬度排版',
      blocks: [
        { type: 'p', text: '視窗（viewport）是瀏覽器用來顯示頁面的那塊區域。在桌機上，把瀏覽器拉寬拉窄，頁面就照新的寬度重新排版。手機瀏覽器卻有一個歷史包袱：早期的網頁幾乎都只為寬螢幕設計，所以手機瀏覽器預設會「假裝」自己有一個很寬的視窗（常見的是 980px），照這個寬度排好版，再把整頁縮小塞進螢幕。整頁是看得到了，字卻小到要用兩指放大才讀得了；上一課寫的流動版面也派不上用場，因為瀏覽器以為自己很寬。' },
        { type: 'p', text: '要關掉這個假裝，在 `<head>` 裡放一行 viewport 設定：`<meta name="viewport" content="width=device-width, initial-scale=1">`。`content` 裡有兩個設定，用逗號分開：' },
        { type: 'table', head: ['設定', '意思', '沒有寫的時候'], rows: [
          ['`width=device-width`', '排版用的視窗寬度等於裝置的寬度（以 CSS 的 px 計算，例如 360）', '手機用大約 980px 的虛擬寬度排版，再整頁縮小'],
          ['`initial-scale=1`', '一開始不放大也不縮小', '由瀏覽器自己決定一開始的縮放比例'],
        ] },
        { type: 'p', text: '這裡說的寬度是 CSS 的 px，不是螢幕的實體像素。一支螢幕有 1080 個實體像素寬的手機，CSS 的寬度常常只有 360px：瀏覽器用好幾個實體像素畫 CSS 的 1px，字才不會小到看不見。寫 CSS 時只需要想 CSS 的 px。' },
        { type: 'example', id: 'rwd02-viewport-meta' },
        { type: 'p', text: '看這個頁面的 index.html：viewport 設定和 `charset`、`<title>` 一樣放在 `<head>` 裡，不會顯示在畫面上，在預覽下方的 DOM 樹裡可以找到它。要注意，預覽是你的瀏覽器裡的一個框架，框架的寬度本來就是真的，沒有手機那種「假裝很寬」的行為；所以在這裡把這一行刪掉再執行，畫面不會有任何變化。差別要在真的手機上才看得到：' },
        { type: 'table', head: ['同一個頁面在 360px 寬的手機上', '有 viewport 設定', '沒有 viewport 設定'], rows: [
          ['排版用的視窗寬度', '360px', '大約 980px'],
          ['沒有寫寬度的區塊', '寬 360px', '寬約 980px，再跟著整頁一起縮小'],
          ['16px 的字看起來', '就是 16px 的大小', '只剩三分之一多一點（360 ÷ 980 ≈ 0.37）'],
          ['上一課的媒體查詢', '依 360px 判斷', '依 980px 判斷，手機拿到的是寬螢幕的版面'],
        ] },
        { type: 'callout', tone: 'warning', title: '不要關掉使用者的縮放', text: '網路上流傳的舊寫法常在 `content` 後面多加 `user-scalable=no` 或 `maximum-scale=1`，目的是不讓使用者用兩指放大頁面。視力不好的人正需要放大才讀得到字，這樣做等於把他們擋在外面。有些瀏覽器已經會忽略這兩個設定，但不該依賴這一點：只寫 `width=device-width, initial-scale=1` 就好。' },
        { type: 'callout', tone: 'note', title: '每一個頁面都要有這一行', text: 'viewport 設定是 HTML 文件的設定，不是 CSS 屬性，也不會從別的頁面帶過來：網站的每一份 HTML 文件都要在 `<head>` 裡放這一行。這一課之後的範例多半只寫 `<body>` 裡的片段，由預覽包成完整的文件；你自己從頭寫頁面時，記得把它和 `<meta charset="utf-8">` 一起放進去。' },
      ],
    },
    {
      id: 'rwd02-percent-section', title: '絕對單位、相對單位與百分比',
      blocks: [
        { type: 'p', text: '到上一課為止，尺寸幾乎都用 px 來寫。px 是絕對單位（absolute unit）：`width: 300px` 在任何視窗裡都是 300px，不會因為周圍的東西而改變。視窗只有 360px 寬，或使用者把文字調大的時候，這就成了問題。相對單位（relative unit）的大小則是「某個東西的幾倍」：那個東西變了，它就跟著變。選單位其實是在回答一個問題：這個尺寸應該跟著誰變？下表的「字級」指的是 `font-size`，也就是文字的大小。' },
        { type: 'table', head: ['單位', '相對於什麼', '例子'], rows: [
          ['`px`', '不相對於任何東西（絕對單位）', '`border: 1px solid` 永遠是 1px'],
          ['`%`', '包含區塊（通常是父元素）的寬度；`height` 的百分比看的是高度', '父元素寬 480px 時，`width: 50%` 是 240px'],
          ['`em`', '元素自己的字級', '字級 20px 的元素，`padding: 1em` 是 20px'],
          ['`rem`', '根元素 `<html>` 的字級（預設 16px）', '`1.5rem` 是 24px'],
          ['`vw`、`vh`', '視窗寬度、視窗高度的 1%', '視窗寬 600px 時，`50vw` 是 300px'],
          ['`dvh`', '目前實際看得到的視窗高度的 1%', '手機的工具列出現或收起時跟著變'],
        ] },
        { type: 'p', text: 'px 並沒有被淘汰：邊框的粗細、分隔線這類不該跟著放大縮小的東西，用 px 正合適。上一課已經用過 `width: 100%` 與 `max-width`；這一節先把百分比的算法講清楚，後面兩節再看跟著字級與跟著視窗的單位。' },
        { type: 'p', text: '百分比（`%`）的基準是包含區塊（containing block）；在一般排版流裡，就是父元素的內容區。`width: 80%` 的意思是「父元素內容寬度的 80%」，父元素變寬，它就跟著變寬：' },
        { type: 'example', id: 'rwd02-percent' },
        { type: 'p', text: '按預覽上方的寬度按鈕，在 600、360、1000 之間切換：淡藍色的書架永遠佔視窗的 80%，深藍色的封面永遠是書架的一半，只有黃色那把固定 300px 的尺不動；在 360px 的寬度下，它比書架（288px）還寬。注意封面的 `width: 50%` 算的是書架的 480px，不是視窗的 600px：百分比只看自己的包含區塊，一層一層往下算。' },
        { type: 'p', text: '封面沒有內容，也沒有寫 `height`，它的高度完全來自 `padding-top: 25%`。這裡有一條違反直覺的規則：內距與外距的百分比，不論是左右還是上下，一律以包含區塊的「寬度」為基準。所以書架寬 480px 時，上內距是 480 × 25% = 120px；封面寬 240px、高 120px，視窗怎麼變都維持 2:1 的比例。' },
        { type: 'callout', tone: 'warning', title: '百分比的高度常常沒有作用', text: '`height: 50%` 的基準是包含區塊的高度，而且那個高度必須是明確的（例如父元素寫了 `height: 300px`）。一般區塊的高度由內容決定，這時子元素的百分比高度沒有東西可以算，瀏覽器會把它當成 `auto`，看起來就像這條宣告沒有寫。寬度沒有這個問題，因為區塊的寬度是由外往內決定的。想讓高度跟著視窗，用後面會學到的視窗單位。' },
        { type: 'callout', tone: 'tip', title: '動手試：換掉基準', text: '按「動手改這個範例」，把 `.shelf` 的 `width: 80%` 改成 `width: 400px` 再執行，然後切換寬度：書架不再跟著視窗變，封面仍然是書架的一半（200px），高度是 400 × 25% = 100px。封面的百分比沒有改，改變的是它的基準。' },
      ],
    },
    {
      id: 'rwd02-em-rem-section', title: 'rem 與 em：跟著字級走的單位',
      blocks: [
        { type: 'p', text: '文字的大小不該寫死。使用者可以在瀏覽器的設定裡調整預設的字級（一般的預設值是 16px），視力不好的人常把它調大；用 px 寫的字級不會理會這個設定。`rem` 與 `em` 都是「字級的幾倍」，差別在看誰的字級：' },
        { type: 'list', items: [
          '`rem`（root em）：根元素 `<html>` 的字級的倍數。根字級是 16px 時，`1rem` 是 16px、`1.5rem` 是 24px、`0.5rem` 是 8px。不管寫在哪一層的元素上，基準都是同一個。',
          '`em`：元素自己的字級的倍數。字級 20px 的按鈕寫 `padding: 1em`，內距就是 20px。只有一個例外：用在 `font-size` 本身的時候，基準是父元素的字級，因為自己的字級正是要算的東西。',
        ] },
        { type: 'example', id: 'rwd02-em-rem' },
        { type: 'p', text: '先看上面兩組巢狀的盒子。`.em` 的規則是 `font-size: 1.25em`：外層是父元素字級 16px 的 1.25 倍，20px；內層套用同一條規則，但它的父元素已經是 20px，所以變成 25px。同一個類別包得越深，字就越大，這叫做 em 的複合（compounding）。`.rem` 的兩層都是根字級的 1.25 倍，所以都是 20px，和包了幾層無關。' },
        { type: 'p', text: '再看下面兩個標籤。它們共用 `padding: 0 1em`，字級卻不同：`#small` 是 `1rem`（16px），左右內距就是 16px；`#large` 是 `2rem`（32px），內距自動變成 32px。這正是 em 適合的工作：讓一個元件的內距跟著它自己的字級等比例縮放，改一個字級，整個元件一起變大。' },
        { type: 'table', head: ['宣告', '寫在哪裡', '計算結果（根字級 16px）'], rows: [
          ['`font-size: 1.5rem`', '任何元素', '16 × 1.5 = 24px'],
          ['`font-size: 1.25em`', '父元素字級 16px 的元素', '16 × 1.25 = 20px'],
          ['`font-size: 1.25em`', '父元素字級 20px 的元素', '20 × 1.25 = 25px'],
          ['`padding: 1em`', '自己字級 32px 的元素', '32px'],
          ['`padding: 1rem`', '自己字級 32px 的元素', '16px（只看根字級）'],
          ['`margin-bottom: 0.5rem`', '任何元素', '16 × 0.5 = 8px'],
        ] },
        { type: 'p', text: '實務上的分工：字級與版面的間距預設用 rem，數字好算，也不會複合；元件內部要跟著自己的字縮放的內距才用 em。把 px 換成 rem 的算法是除以 16：24px 是 24 ÷ 16 = 1.5rem。這一課的數字都以預設的根字級 16px 計算；如果你調整過瀏覽器的預設字級，預覽裡用 rem 與 em 寫的尺寸會跟著不同，這正是它們存在的目的。' },
        { type: 'callout', tone: 'warning', title: 'em 寫在字級上會一層一層放大', text: '替清單項目寫 `li { font-size: 1.2em; }`，第一層是 19.2px，清單裡的清單變成 23.04px，第三層是 27.648px，越包越大。字級要相對於某個東西時，用 rem 就不會複合。另一個相關的錯誤是在樣式表裡寫 `html { font-size: 16px; }`：根字級一旦用 px 寫死，使用者在瀏覽器調整的預設字級就不再有作用，rem 也失去了跟著使用者設定的意義。根元素的字級留給瀏覽器與使用者決定。' },
        { type: 'callout', tone: 'tip', title: '動手試：改一個數字，整組跟著變', text: '把範例裡 `#large` 的 `font-size: 2rem` 改成 `3rem` 再執行：字變成 48px，左右內距不用改就跟著變成 48px。再把 `.tag` 的 `padding: 0 1em` 改成 `padding: 0 1rem`：兩個標籤的內距都變成 16px，大標籤的字顯得很擠，因為內距不再跟著它自己的字級。' },
      ],
    },
    {
      id: 'rwd02-viewport-units-section', title: 'vw 與 dvh：跟著視窗走的單位',
      blocks: [
        { type: 'p', text: '百分比看的是包含區塊，有時候你要的是直接跟著視窗：一個佔滿整個畫面高度的歡迎區，一塊永遠是半個視窗寬的橫幅。視窗單位（viewport unit）就是為此而設的：`1vw` 是視窗寬度的 1%，`1vh` 是視窗高度的 1%。它們和元素放在哪一層無關，視窗多大，算出來就是多大。' },
        { type: 'example', id: 'rwd02-viewport-units' },
        { type: 'p', text: '「這個頁面在瀏覽器裡的事實」是在寬 600px、高 400px 的視窗裡量的：黃色盒子的 `50vw` 是 300px，`25vh` 是 100px；淡藍色的 `.screen` 寫 `height: 100dvh`，剛好是一個視窗高。按寬度按鈕切換，黃色盒子永遠是視窗寬度的一半。它和上一節 `.cover` 的 `50%` 不同：把它搬進任何比較窄的容器，它仍然是半個視窗寬。' },
        { type: 'p', text: '`vh` 在手機上有一個陷阱。手機瀏覽器的網址列與工具列會在捲動時收起、再出現，實際看得到的高度一直在變。為了不讓版面跟著跳動，手機上的 `100vh` 是照工具列「收起時」的最大高度計算的；工具列還在的時候，`height: 100vh` 的區塊就比看得到的區域高，貼在底部的按鈕被工具列蓋住。所以 CSS 另外有三個高度單位：' },
        { type: 'table', head: ['單位', '照哪一個高度計算', '什麼時候用'], rows: [
          ['`dvh`（dynamic）', '目前實際看得到的高度，工具列出現或收起時跟著變', '要剛好填滿當下畫面的區塊'],
          ['`svh`（small）', '工具列全部出現時的最小高度', '內容一定要完整看得到，又不希望高度變動'],
          ['`lvh`（large）', '工具列全部收起時的最大高度', '通常和手機上的 `vh` 相同'],
        ] },
        { type: 'p', text: '桌機瀏覽器沒有這種會收起的工具列，這幾個單位算出來都和 `vh` 一樣，所以預覽裡看不出差別。需要「一個畫面高」的時候，寫 `100dvh` 是比較安全的選擇。' },
        { type: 'callout', tone: 'warning', title: '100vw 可能比頁面還寬', text: '`100vw` 是整個視窗的寬度，連直向捲軸佔掉的那一條也算在內。在捲軸會佔位置的系統上，頁面內容一長、出現直向捲軸，`width: 100vw` 的元素就比可用的寬度多出一個捲軸寬，頁面跟著可以左右捲動。要讓區塊「和頁面一樣寬」，用 `width: 100%`，或乾脆不寫寬度：區塊本來就會填滿父元素。' },
        { type: 'callout', tone: 'tip', title: '動手試：百分比與 vw 的差別', text: '把 `.half` 的 `width: 50vw` 改成 `width: 50%` 再執行：結果一樣是視窗的一半，因為它的父元素 `.screen` 剛好和視窗一樣寬。接著替 `.screen` 加上 `width: 300px`：`50%` 變成 150px；把 `.half` 改回 `50vw`，它又回到半個視窗寬，不管父元素多窄。' },
      ],
    },
    {
      id: 'rwd02-overflow-section', title: '橫向捲動從哪裡來',
      blocks: [
        { type: 'p', text: '頁面可以上下捲動是正常的，左右也能捲就不對了：內容被切在畫面外，在手機上整頁還會左右晃動。原因永遠是同一個：有某個元素比視窗還寬。常見的來源有四種：' },
        { type: 'list', ordered: true, items: [
          '固定的寬度比視窗寬：`width: 480px` 的卡片放進 360px 的視窗。改成 `width: 100%; max-width: 480px;`：最多 480px，放不下時跟著縮。',
          '`100vw` 或 `100%` 再加上內距：預設的 `content-box` 把內距加在寬度外面，`width: 100%; padding: 0 20px;` 的總寬度是 100% 再加 40px。加上 `box-sizing: border-box`，或乾脆不寫寬度。',
          '圖片比容器寬：圖片預設照自己原本的尺寸顯示。上一課的 `max-width: 100%` 就是為了這個。',
          '一長串不能斷行的字：網址、電子郵件、編號這類中間沒有空白的長字串，瀏覽器找不到可以換行的地方，會整串衝出容器。`overflow-wrap: anywhere` 允許瀏覽器在放不下時，從任何字元之間斷開。',
        ] },
        { type: 'example', id: 'rwd02-overflow' },
        { type: 'p', text: '預覽一開始是 360px 寬。第一條 `#bad` 寫的是 `width: 100vw` 再加左右各 20px 的內距，總寬度是 360 + 40 = 400px，右緣超出視窗 40px，預覽可以左右捲動。第二條 `#good` 是 `width: 100%` 加上 `box-sizing: border-box`，內距算在寬度裡面，右緣剛好在 360px。最下面寬 200px 的框裡是一串沒有空白的取貨代碼，因為有 `overflow-wrap: anywhere`，它在框的邊緣斷行，沒有衝出去。' },
        { type: 'p', text: 'CSS 還有兩個函式可以把「兩個值取一個」寫成一行：`min(100%, 480px)` 取兩者之中較小的，所以 `width: min(100%, 480px)` 和 `width: 100%; max-width: 480px;` 的結果相同；`max()` 則取較大的。函式裡可以混用不同的單位。同一個家族的 `clamp()` 留到「流體字級與 clamp()」那一課。' },
        { type: 'p', text: '發現頁面可以左右捲動時，打開開發者工具的 Elements 面板，由外往內把滑鼠移到各個元素上：頁面上標示出來的範圍超出視窗右邊的那一個，就是原因。' },
        { type: 'callout', tone: 'warning', title: '把捲軸藏起來不算修好', text: '在 `body` 寫 `overflow-x: hidden` 的確會讓橫向捲軸消失，但太寬的元素還是那麼寬，超出的部分只是被切掉：被切掉的文字與按鈕，使用者再也看不到、按不到。先找出是哪一個元素太寬，把它的寬度改對。' },
        { type: 'callout', tone: 'tip', title: '動手試：一次拿掉一個保護', text: '把 `.address` 的 `overflow-wrap: anywhere;` 刪掉再執行：長長的代碼整串衝出 200px 的框。再把 `#bad` 的 `width: 100vw` 改成 `width: 100%`：它還是超出 40px，因為問題不只是 vw，而是內距加在寬度外面；替它加上 `box-sizing: border-box`，右緣才會剛好貼齊視窗。' },
      ],
    },
    {
      id: 'rwd02-choose-section', title: '怎麼選單位',
      blocks: [
        { type: 'p', text: '把這一課收成一個問題：這個尺寸應該跟著誰變？答案決定單位。' },
        { type: 'table', head: ['要設定的東西', '建議的單位', '原因'], rows: [
          ['文字的字級', '`rem`', '跟著使用者設定的預設字級，而且不會複合'],
          ['區塊之間的間距、版面的內距', '`rem`', '字放大時，留白跟著放大，比例不變'],
          ['元件裡要跟著自己的字縮放的內距', '`em`', '改元件的字級，內距自動等比例變化'],
          ['欄位與容器的寬度', '`%`，搭配 `max-width`', '跟著父元素變寬變窄，又不會無限變寬'],
          ['佔滿一個畫面高的區塊', '`dvh`', '跟著實際看得到的視窗高度'],
          ['邊框、分隔線', '`px`', '不該跟著任何東西放大'],
        ] },
        { type: 'p', text: '頁面寫完之後，照這個順序檢查一遍：' },
        { type: 'list', ordered: true, items: [
          '`<head>` 裡有 viewport 設定，而且沒有限制縮放。',
          '把視窗縮到 360px 寬：頁面不能左右捲動。',
          '可以捲動的話，找比視窗寬的元素：固定的 px 寬度、`100vw`、寬度加內距、沒有 `max-width: 100%` 的圖片、不能斷行的長字串。',
          '把瀏覽器的預設字級調大：用 rem 寫的文字與間距應該跟著變大。',
        ] },
        { type: 'p', text: '這一課的單位都只是「一個值怎麼算」。讓版面在某個寬度以上換一種排法，是媒體查詢（media query）的工作，在「Media Query 與斷點策略」那一課；讓兩欄並排，這一課的練習暫時用網頁基礎島學過的 `inline-block`，下一課開始改用 Flexbox。想多看看同一個頁面在不同寬度下的樣子，可以到互動實驗島的 Responsive Layout Simulator，拖動寬度觀察版面怎麼變。' },
        { type: 'callout', tone: 'note', title: '相對單位不是越多越好', text: '把每一個數字都換成相對單位並不是目標。1px 的邊框換成 `0.0625rem` 只會讓樣式表更難讀，放大之後也未必好看。先問「它該不該跟著變、該跟著誰變」，答案是「不該變」的時候，px 就是對的單位。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'rwd02-q1', prompt: '一個頁面的 `<head>` 裡沒有 viewport 設定。在螢幕寬 360px 的手機上打開它，最可能看到什麼？',
      options: [
        '瀏覽器自動把版面改成單欄，字的大小不變',
        '頁面無法顯示，瀏覽器要求補上設定',
        '瀏覽器照大約 980px 的寬度排版，再把整頁縮小，字變得很小',
        '樣式表裡所有的 px 被自動換算成 rem',
      ],
      answer: 2,
      explanation: '沒有 viewport 設定時，手機瀏覽器假裝有一個大約 980px 寬的視窗，排好版再整頁縮小塞進螢幕，所以字很小、要放大才能讀。瀏覽器不會替你改版面或換單位，也不會拒絕顯示：這個設定不是必填的，只是少了它，手機拿不到照真實寬度排的版面。',
    },
    {
      id: 'rwd02-q2', prompt: '`.box` 是 `.page` 的子元素，裡面沒有任何內容，也沒有寫 `height`。`.box` 到邊框為止有多高？',
      code: { language: 'CSS', text: '.page { width: 400px; }\n.box {\n  width: 50%;\n  padding-top: 10%;\n}' },
      options: ['40px', '20px', '0px', '10px'],
      answer: 0,
      explanation: '內距的百分比不論方向，都以包含區塊的寬度為基準：`.page` 寬 400px，`padding-top: 10%` 就是 40px；沒有內容時，盒子的高度就是這 40px。20px 是拿 `.box` 自己的寬度 200px 來算；0px 是以為上下方向的百分比因為父元素沒有高度而無效，那是 `height` 的規則，不是內距的；10px 則是把 10% 直接當成 10px。',
    },
    {
      id: 'rwd02-q3', prompt: '根字級是預設的 16px，`body` 沒有設定字級。內層的清單項目「小說」的字級是多少？',
      code: { language: 'HTML', text: '<style>\n  li { font-size: 1.5em; }\n</style>\n<ul>\n  <li>書籍\n    <ul>\n      <li>小說</li>\n    </ul>\n  </li>\n</ul>' },
      options: ['16px', '24px', '32px', '36px'],
      answer: 3,
      explanation: '`font-size` 的 em 以父元素的字級為基準。外層的 `li` 是 16 × 1.5 = 24px；內層 `li` 的父元素是外層 `li` 裡的 `ul`，它繼承了 24px，所以內層是 24 × 1.5 = 36px，這就是 em 的複合。24px 是只算了一層；32px 是把 1.5 倍誤當成每層加 8px；16px 是完全沒有套用。改成 `1.5rem` 的話，兩層都是 24px。',
    },
    {
      id: 'rwd02-q4', prompt: '按鈕有小、中、大三種字級，設計師希望「字級越大，按鈕的內距也等比例變大」，而且只寫一條內距的規則。該用哪一種寫法？',
      options: ['`padding: 8px 16px`', '`padding: 0.5em 1em`', '`padding: 0.5rem 1rem`', '`padding: 2% 4%`'],
      answer: 1,
      explanation: 'em 以元素自己的字級為基準，所以同一條 `padding: 0.5em 1em` 在字級 16px 的按鈕上是 8px 與 16px，在字級 24px 的按鈕上自動變成 12px 與 24px。px 是固定的；rem 只看根字級，三種按鈕的內距都一樣；百分比的內距看的是包含區塊的寬度，按鈕放進越寬的容器內距越大，和字級無關。',
    },
    {
      id: 'rwd02-q5', prompt: '`body` 的外距是 0，視窗寬 360px，頁面沒有直向捲軸。`.hero` 到邊框為止有多寬？',
      code: { language: 'CSS', text: '.hero {\n  width: 100%;\n  padding: 0 24px;\n}' },
      options: ['408px', '360px', '312px', '384px'],
      answer: 0,
      explanation: '沒有寫 `box-sizing` 時是預設的 `content-box`：`width: 100%` 是內容的寬度 360px，左右各 24px 的內距加在外面，總寬度是 360 + 48 = 408px，比視窗多 48px，頁面會左右捲動。360px 是加了 `box-sizing: border-box` 之後的結果；312px 是把內距往裡面扣之後內容的寬度；384px 只加了一邊的內距。',
    },
    {
      id: 'rwd02-q6', prompt: '手機上有一個全螢幕的歡迎畫面，樣式是 `height: 100vh`，貼在底部的「開始」按鈕卻被瀏覽器的工具列蓋住。最直接的修正是把高度改成哪一個？',
      options: ['`height: 100%`', '`height: 100vw`', '`height: 100rem`', '`height: 100dvh`'],
      answer: 3,
      explanation: '手機上的 `100vh` 照工具列收起時的最大高度計算，工具列出現時就比看得到的區域高。`dvh` 以目前實際看得到的高度為準，`100dvh` 剛好填滿當下的畫面。`height: 100%` 需要父元素有明確的高度，`body` 的高度預設由內容決定，單獨這樣寫沒有作用；`100vw` 是視窗的寬度；`100rem` 是根字級的 100 倍（1600px），和視窗無關。',
    },
    {
      id: 'rwd02-q7', prompt: '使用者把瀏覽器的預設字級從 16px 調成 20px。頁面的樣式如下，而且沒有設定 `html` 的字級。標題與段落的字級各是多少？',
      code: { language: 'CSS', text: 'h1 { font-size: 2rem; }\np { font-size: 16px; }' },
      options: ['標題 32px，段落 16px', '標題 40px，段落 16px', '標題 40px，段落 20px', '標題 32px，段落 20px'],
      answer: 1,
      explanation: 'rem 以根字級為基準，根字級跟著使用者的設定變成 20px，所以 `2rem` 是 40px。段落用 px 寫死，仍然是 16px，不理會使用者的設定：這正是字級不建議用 px 的原因。「標題 32px」是把 rem 當成永遠等於 16px；「段落 20px」是以為 px 也會跟著預設字級放大。',
    },
    {
      id: 'rwd02-q8', prompt: '頁面很長，視窗的右邊有一條佔 15px 寬的直向捲軸；連捲軸在內，視窗寬 1000px。橫幅寫了 `width: 100vw`，沒有內距與邊框。會發生什麼事？',
      options: [
        '橫幅寬 985px，剛好填滿捲軸左邊的空間',
        '橫幅寬 1015px，瀏覽器把捲軸的寬度再加上去',
        '橫幅寬 1000px，比可用的 985px 多出 15px，頁面可以左右捲動',
        '瀏覽器發現放不下，自動把 `100vw` 當成 `100%`',
      ],
      answer: 2,
      explanation: '`100vw` 是整個視窗的寬度，包含直向捲軸佔掉的 15px，所以橫幅寬 1000px；頁面真正可用的寬度只有 985px，於是多出 15px、出現橫向捲動。985px 是 `width: 100%`（或不寫寬度）的結果，瀏覽器不會自動幫你換；捲軸的寬度也不會被「再加一次」變成 1015px。',
    },
  ],
  webCode: {
    examples: [viewportMeta, percent, emRem, viewportUnits, overflow],
    exercises: [exViewportMeta, exRemEm, exColumns, exNoScroll],
  },
};
