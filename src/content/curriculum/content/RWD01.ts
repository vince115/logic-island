import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD01 responsive principles and mobile first (RWD-1). A web-code lesson of HTML and CSS only, and the first of the
 * island: the learner knows normal flow and the box model (WEB06) but no flexbox, grid, relative units or media query.
 * The pages use only what WEB06 taught plus the three things this lesson introduces in their simplest form: max-width
 * with margin: 0 auto, max-width: 100% with height: auto on an image, and one @media (min-width) rule. Every page is
 * laid out at several widths (the preview's width buttons; the resize step in the checks), and the facts measured are
 * boxes whose sizes follow from explicit numbers, never from how wide text renders.
 */

const PAGE_TEXT = String.raw`<div class="page">
  <h1>小島圖書館</h1>
  <p>本館週二至週日 9:00–17:00 開放，週一休館。借閱證可以在一樓櫃台辦理，請攜帶身分證件。</p>
</div>`;

/** A 600 × 150 drawing with something at its right end, so a cut-off image is easy to see. */
const PLAN_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='150' viewBox='0 0 600 150'%3E%3Crect width='600' height='150' fill='%2390caf9'/%3E%3Crect x='20' y='25' width='160' height='100' fill='%23e3f2fd'/%3E%3Crect x='460' y='25' width='120' height='100' fill='%23ffb74d'/%3E%3C/svg%3E";
/** A 600 × 300 route drawing for the image exercise. */
const MAP_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='300' viewBox='0 0 600 300'%3E%3Crect width='600' height='300' fill='%23c8e6c9'/%3E%3Cpath d='M60 240 L300 240 L300 80 L520 80' stroke='%231565c0' stroke-width='12' fill='none'/%3E%3Ccircle cx='60' cy='240' r='20' fill='%231565c0'/%3E%3Crect x='500' y='50' width='60' height='60' fill='%23ffb74d'/%3E%3C/svg%3E";

// ---- examples ---------------------------------------------------------------------------------------------------
const fixedPage: WebExample = {
  id: 'rwd01-fixed-page', title: '寬度寫死成 960px 的頁面',
  description: '小島圖書館的頁面包在 `.page` 裡，寬度寫死成 `width: 960px`，並用 `margin: 0 auto` 置中。請依序按預覽上方的 360px、768px、1280px 三個寬度按鈕。',
  files: {
    html: PAGE_TEXT,
    css: String.raw`body { margin: 0; }
.page {
  width: 960px;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
  background-color: #e3f2fd;
}`,
  },
  viewport: { width: 360, height: 640 },
  widths: [360, 768, 1280],
  observe: [
    { check: 'box', selector: '.page', measure: 'width', value: 960, label: '視窗只有 360px 寬，`.page` 仍然是 960px 寬' },
    { check: 'box', selector: '.page', measure: 'right', value: 960, label: '`.page` 的右緣在 960px 的位置：比視窗多出 600px，要橫向捲動才看得到' },
    { do: 'resize', width: 1280 },
    { check: 'box', selector: '.page', measure: 'width', value: 960, label: '視窗改成 1280px 寬，`.page` 還是 960px' },
    { check: 'box', selector: '.page', measure: 'left', value: 160, label: '這時它置中了：左緣在 (1280 − 960) ÷ 2 = 160px，兩邊各空 160px' },
  ],
};

const fluidPage: WebExample = {
  id: 'rwd01-fluid-page', title: '同一頁，改成有上限的流動寬度',
  description: '和上一個範例只差一行：`width: 960px` 換成了 `max-width: 720px`。請再按一次三個寬度按鈕，和上一個範例比較。',
  files: {
    html: PAGE_TEXT,
    css: String.raw`body { margin: 0; }
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
  background-color: #e3f2fd;
}`,
  },
  viewport: { width: 360, height: 640 },
  widths: [360, 768, 1280],
  observe: [
    { check: 'box', selector: '.page', measure: 'width', value: 360, label: '視窗 360px 寬時，`.page` 填滿視窗：寬 360px' },
    { check: 'box', selector: '.page', measure: 'right', value: 360, label: '它的右緣剛好在 360px：沒有東西超出視窗，不需要橫向捲動' },
    { do: 'resize', width: 768 },
    { check: 'box', selector: '.page', measure: 'width', value: 720, label: '視窗 768px 寬時，`.page` 停在上限 720px' },
    { do: 'resize', width: 1280 },
    { check: 'box', selector: '.page', measure: 'width', value: 720, label: '視窗 1280px 寬時，`.page` 仍然是 720px' },
    { check: 'box', selector: '.page', measure: 'left', value: 280, label: '剩下的 1280 − 720 = 560px 由左右外距平分：左緣在 280px' },
  ],
};

const fluidImage: WebExample = {
  id: 'rwd01-fluid-image', title: '超出容器的圖片，與不超出的圖片',
  description: '`.post` 左右各有 20px 的內距，裡面放了同一張 600 × 150 的平面圖兩次。第一張沒有任何樣式，第二張多了 `max-width: 100%` 與 `height: auto`。請按 360px 與 768px 比較。',
  files: {
    html: `<div class="post">
  <p>沒有樣式的圖片：</p>
  <img id="plain" src="${PLAN_IMAGE}" width="600" height="150" alt="一樓平面圖：左邊是櫃台，右邊是閱覽區">
  <p>加上 max-width: 100% 的圖片：</p>
  <img id="fluid" src="${PLAN_IMAGE}" width="600" height="150" alt="一樓平面圖：左邊是櫃台，右邊是閱覽區">
</div>`,
    css: String.raw`body { margin: 0; }
.post { padding: 0 20px; }
#fluid {
  max-width: 100%;
  height: auto;
}`,
  },
  viewport: { width: 360, height: 640 },
  widths: [360, 768],
  observe: [
    { check: 'box', selector: '#plain', measure: 'width', value: 600, label: '視窗 360px 寬時，第一張圖維持原本的 600px，比 320px 寬的內容區還寬' },
    { check: 'box', selector: '#plain', measure: 'right', value: 620, label: '第一張圖的右緣在 620px：超出視窗 260px，整頁因此可以橫向捲動' },
    { check: 'box', selector: '#fluid', measure: 'width', value: 320, label: '第二張圖縮到和內容區一樣寬：360 − 20 × 2 = 320px' },
    { check: 'box', selector: '#fluid', measure: 'height', value: 80, label: '第二張圖的高度依比例變成 80px（原圖是 4：1），沒有變形' },
    { do: 'resize', width: 768 },
    { check: 'box', selector: '#fluid', measure: 'width', value: 600, label: '視窗 768px 寬時，第二張圖停在原本的 600px，沒有被放大' },
  ],
};

const firstQuery: WebExample = {
  id: 'rwd01-first-query', title: '第一條媒體查詢：夠寬才排成一行',
  description: '導覽的三個連結。媒體查詢外面的規則讓每個連結獨佔一列；`@media (min-width: 400px)` 裡的規則只在視窗至少 400px 寬時生效，把它們排成一行。請按 360px 與 400px 兩個寬度按鈕。',
  files: {
    html: String.raw`<nav class="menu">
  <a id="to-hours" href="#hours">開放時間</a>
  <a id="to-books" href="#books">新書通報</a>
  <a id="to-contact" href="#contact">聯絡我們</a>
</nav>`,
    css: String.raw`body { margin: 0; }
.menu a {
  display: block;
  height: 48px;
  margin-bottom: 4px;
  line-height: 48px;
  text-align: center;
  background-color: #bbdefb;
}
@media (min-width: 400px) {
  .menu a {
    display: inline-block;
    width: 120px;
  }
}`,
  },
  viewport: { width: 360, height: 640 },
  widths: [360, 400, 768],
  observe: [
    { check: 'style', selector: '#to-hours', property: 'display', value: 'block', label: '視窗 360px 寬時查詢不成立：連結的 `display` 是基礎規則寫的 `block`' },
    { check: 'box', selector: '#to-hours', measure: 'width', value: 360, label: '每個連結獨佔一列，填滿 360px 的視窗' },
    { check: 'box', selector: '#to-books', measure: 'top', value: 52, from: '#to-hours', label: '第二個連結在第一個的下面：上緣低了 48 + 4 = 52px' },
    { do: 'resize', width: 400 },
    { check: 'box', selector: '#to-hours', measure: 'width', value: 120, label: '視窗剛好 400px 寬時查詢成立：連結變成 120px 寬' },
    { check: 'box', selector: '#to-contact', measure: 'top', value: 0, from: '#to-hours', label: '三個連結排在同一行：第三個的上緣和第一個一樣高' },
  ],
};

const contentFirst: WebExample = {
  id: 'rwd01-content-first', title: '內容優先的首頁：重要的先寫',
  description: '小島圖書館首頁的完整文件。`main` 裡的三個區塊照重要性排列：今日開放、最新消息、關於本館。樣式是行動優先的寫法：基礎樣式之外只有一條 `min-width: 700px` 的媒體查詢。請按三個寬度按鈕，注意區塊的順序有沒有改變。',
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
  <main class="page">
    <h1>小島圖書館</h1>
    <section id="hours">
      <h2>今日開放</h2>
      <p>9:00–17:00，還書箱全天開放。</p>
    </section>
    <section id="news">
      <h2>最新消息</h2>
      <p>週六提早在 15:00 閉館。</p>
    </section>
    <section id="about">
      <h2>關於本館</h2>
      <p>小島圖書館由碼頭邊的舊倉庫改建而成，一樓是櫃台與新書區，二樓是閱覽區。</p>
    </section>
  </main>
</body>
</html>`,
    css: String.raw`body { margin: 0; }
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 16px;
}
#hours { background-color: #fff3e0; }
@media (min-width: 700px) {
  .page { padding: 32px; }
}`,
  },
  viewport: { width: 360, height: 640 },
  widths: [360, 768, 1280],
  observe: [
    { check: 'attr', selector: 'meta[name="viewport"]', name: 'content', value: 'width=device-width', match: 'includes', label: '`head` 裡有 viewport 的 `meta`，內容包含 `width=device-width`' },
    { check: 'count', selector: 'h1 + #hours', count: 1, label: '`#hours` 緊接在 `h1` 之後：最重要的區塊在原始碼的最前面' },
    { check: 'box', selector: '.page', measure: 'width', value: 360, label: '視窗 360px 寬時，`.page` 填滿視窗：寬 360px' },
    { do: 'resize', width: 1280 },
    { check: 'style', selector: '.page', property: 'padding-left', value: '32px', label: '視窗 1280px 寬時查詢成立：`.page` 的內距是 32px' },
    { check: 'box', selector: '.page', measure: 'width', value: 704, label: '`.page` 到邊框為止寬 704px：內容的上限 640px 加上兩邊各 32px 的內距' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const exFluidPage: WebExercise = {
  id: 'rwd01-ex-fluid-page', title: '把寫死的頁面改成流動的',
  statement: 'index.html 不能改。小島商店的頁面被 `width: 960px` 寫死了，在 360px 寬的視窗要橫向捲動才讀得完。請修改 style.css 裡 `#page` 的規則，做到兩件事：（1）窄的視窗裡填滿整個寬度：視窗 360px 寬時，`#page` 寬 360px、左緣在 0；（2）寬的視窗裡最寬只到 720px，並且水平置中：視窗 1024px 寬時，`#page` 寬 720px、左緣在 152px。`body { margin: 0; }`、`padding: 16px` 與 `box-sizing: border-box` 都要保留。檢查會先在 360px 寬的頁面量一次，再把同一份頁面改成 1024px 寬量一次；預覽上方的按鈕可以切換到這些寬度。',
  hints: [
    '問題出在 `width` 把寬度寫死了。區塊沒有設定 `width` 的時候，本來會有多寬？',
    '你需要的是寬度的「上限」，不是固定的寬度；置中用的是 WEB06 學過的左右外距 `auto`。',
    '把 `width: 960px` 換成 `max-width: 720px`，再加上 `margin: 0 auto`。',
  ],
  explanation: '拿掉 `width` 之後，`#page` 回到區塊的預設行為：填滿父元素，所以 360px 的視窗裡它就是 360px。`max-width: 720px` 只加上一個上限：視窗比 720px 寬時，寬度停在 720px（有 `box-sizing: border-box`，這個數字包含內距）。這時才有剩下的空間，`margin: 0 auto` 把它平分給左右：(1024 − 720) ÷ 2 = 152px。視窗比 720px 窄時沒有剩下的空間，左右外距是 0。一條規則同時照顧了兩種寬度，不需要媒體查詢。',
  fixed: { html: String.raw`<div id="page">
  <h1>小島商店</h1>
  <p>島上烘焙的咖啡豆與手工果醬，每週三、週六出貨。</p>
</div>` },
  starter: { css: String.raw`body { margin: 0; }
#page {
  width: 960px;
  padding: 16px;
  box-sizing: border-box;
  background-color: #e3f2fd;
}` },
  solution: { css: String.raw`body { margin: 0; }
#page {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
  background-color: #e3f2fd;
}` },
  viewport: { width: 360, height: 640 },
  widths: [360, 768, 1024],
  steps: [
    { check: 'box', selector: '#page', measure: 'width', value: 360, label: '視窗 360px 寬時，`#page` 填滿視窗：寬 360px' },
    { check: 'box', selector: '#page', measure: 'left', value: 0, label: '視窗 360px 寬時，`#page` 的左緣在 0' },
    { do: 'resize', width: 1024 },
    { check: 'box', selector: '#page', measure: 'width', value: 720, label: '視窗 1024px 寬時，`#page` 的寬度停在 720px' },
    { check: 'box', selector: '#page', measure: 'left', value: 152, label: '視窗 1024px 寬時，`#page` 水平置中：左緣在 (1024 − 720) ÷ 2 = 152px' },
    { check: 'style', selector: '#page', property: 'padding-left', value: '16px', label: '`#page` 的內距維持 16px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#page {
  width: 720px;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
  background-color: #e3f2fd;
}` }, why: '只把寫死的數字從 960px 換成 720px。寬的視窗看起來對了，但 360px 的視窗裡 `#page` 還是 720px，照樣要橫向捲動。寬度仍然是固定的；要的是上限 `max-width`。' },
    { files: { css: String.raw`body { margin: 0; }
#page {
  max-width: 720px;
  padding: 16px;
  box-sizing: border-box;
  background-color: #e3f2fd;
}` }, why: '有了 `max-width: 720px`，寬度是對的，但沒有設定左右外距：寬的視窗裡 `#page` 靠在左邊，右邊空了一大片。加上 `margin: 0 auto` 才會置中。' },
    { files: { css: String.raw`body { margin: 0; }
#page {
  width: 100%;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
  background-color: #e3f2fd;
}` }, why: '`width: 100%` 讓 `#page` 在每一種寬度都填滿視窗：360px 時沒問題，1024px 時它也是 1024px 寬，一行字太長，`margin: 0 auto` 也沒有剩下的空間可以平分。少了上限 `max-width: 720px`。' },
  ],
};

const exFluidImage: WebExercise = {
  id: 'rwd01-ex-fluid-image', title: '讓路線圖不超出文章',
  statement: 'index.html 不能改。文章 `#post` 左右各有 20px 的內距，裡面的路線圖 `#map` 原圖是 600 × 300，在 360px 寬的視窗會超出文章的右邊，整頁因此可以橫向捲動。請在 style.css 替 `#map` 加上樣式，讓它：（1）最寬只和文章的內容區一樣寬：視窗 360px 寬時，圖片寬 320px；（2）比例不變：這時高度是 160px；（3）容器比圖片寬時不放大：視窗 1024px 寬時，圖片仍然是 600 × 300。`body { margin: 0; }` 與 `#post` 的內距都要保留。檢查會在 360px 與 1024px 兩種寬度各量一次。',
  hints: [
    '不要替圖片寫死寬度。需要的是「最寬不超過容器」的上限，百分比是相對於容器的寬度。',
    '寬度被限制之後，高度還是 HTML 的 `height="300"`，圖片會變形。哪一個值可以讓高度依比例自己算？',
    '替 `#map` 寫 `max-width: 100%;` 與 `height: auto;`。',
  ],
  explanation: '`max-width: 100%` 把圖片的寬度上限訂為容器內容區的寬度：360px 的視窗扣掉左右各 20px 的內距是 320px，圖片就縮成 320px；1024px 的視窗裡容器比圖片寬，上限碰不到，圖片維持 `width="600"` 的 600px，不會被放大。`height: auto` 讓高度依原圖 2：1 的比例計算（320px 寬時是 160px），取代 HTML 屬性寫的 300px。這兩條宣告通常一起寫在所有圖片共用的規則裡：`img { max-width: 100%; height: auto; }`。',
  fixed: { html: `<article id="post">
  <h1>怎麼到小島商店</h1>
  <img id="map" src="${MAP_IMAGE}" width="600" height="300" alt="路線圖：下船後沿碼頭直走，在路口左轉就到商店">
  <p>下船後沿著碼頭直走，在第二個路口左轉。</p>
</article>` },
  starter: { css: String.raw`body { margin: 0; }
#post { padding: 0 20px; }` },
  solution: { css: String.raw`body { margin: 0; }
#post { padding: 0 20px; }
#map {
  max-width: 100%;
  height: auto;
}` },
  viewport: { width: 360, height: 640 },
  widths: [360, 768, 1024],
  steps: [
    { check: 'box', selector: '#map', measure: 'width', value: 320, label: '視窗 360px 寬時，`#map` 和文章的內容區一樣寬：320px' },
    { check: 'box', selector: '#map', measure: 'height', value: 160, label: '視窗 360px 寬時，`#map` 的比例不變：高 160px' },
    { do: 'resize', width: 1024 },
    { check: 'box', selector: '#map', measure: 'width', value: 600, label: '視窗 1024px 寬時，`#map` 維持原圖的寬度 600px，沒有被放大' },
    { check: 'box', selector: '#map', measure: 'height', value: 300, label: '視窗 1024px 寬時，`#map` 高 300px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#post { padding: 0 20px; }
#map {
  max-width: 100%;
}` }, why: '只寫了 `max-width: 100%`。寬度縮成 320px，高度卻還是 HTML 屬性的 300px，圖片被拉長變形。`max-width` 只限制寬度，要再加上 `height: auto` 讓高度依比例縮小。' },
    { files: { css: String.raw`body { margin: 0; }
#post { padding: 0 20px; }
#map {
  width: 100%;
  height: auto;
}` }, why: '`width: 100%` 讓圖片永遠和容器一樣寬：360px 的視窗裡沒問題，但 1024px 的視窗裡，600px 的原圖被放大成 984px，畫面會模糊。`max-width: 100%` 只在圖片比容器寬時才縮小它。' },
    { files: { css: String.raw`body { margin: 0; }
#post { padding: 0 20px; }
#map {
  width: 320px;
  height: auto;
}` }, why: '把寬度寫死成 320px，只對剛好 360px 寬的視窗成立：視窗再窄一點圖片又超出去，視窗變寬時圖片也不會長回 600px。寫死的數字正是這一課要避免的。' },
  ],
};

const SHOP_CSS = String.raw`body { margin: 0; }
#shop > * {
  padding: 12px 16px;
  border-bottom: 2px solid #1565c0;
}
h1, h2, p { margin: 0 0 8px; }
#related a { display: block; }
#promo { background-color: #fff3e0; }`;

const exContentOrder: WebExercise = {
  id: 'rwd01-ex-content-order', title: '把最重要的內容排到最前面',
  statement: 'style.css 不能改，這一題要改的是 index.html。小島商店的商品頁在 360px 寬的手機上，最先看到的是「本週優惠」，商品名稱、價格與購買按鈕要捲到最下面才出現。店長排定的優先順序是：商品資訊 `#product` → 顧客評價 `#reviews` → 相關商品 `#related` → 本週優惠 `#promo`。請調整 `#shop` 裡四個區塊在原始碼中的順序，讓頁面由上到下就是這個順序。整個區塊連同裡面的內容一起搬；不要刪掉任何一塊，也不要改 id。檢查會看四個區塊在 `#shop` 裡的先後、`#product` 是不是在頁面的最上方，以及標題是否形成正確的大綱（唯一的 `h1` 在最前面）。',
  hints: [
    '樣式表裡沒有任何改變排列的規則，所以畫面由上到下的順序，就是區塊在 HTML 裡的先後。',
    '從 `<section id="product">` 到它的 `</section>` 是一整塊：把它搬到 `<main id="shop">` 的正後面，再依序排好另外三塊。',
    '最後的順序是 `#product`、`#reviews`、`#related`、`#promo`；每一塊的開始標籤與結束標籤都要一起搬。',
  ],
  explanation: '一般排版流照元素在原始碼裡的先後由上往下排，所以在單欄的窄畫面裡，HTML 的順序就是讀者看到的順序，也是螢幕閱讀器朗讀與 Tab 鍵移動的順序。把 `#product` 寫在最前面，打開頁面不用捲動就看得到商品名稱、價格與購買按鈕；`h1` 也回到所有 `h2` 的前面，標題大綱才正確。「本週優惠」沒有被刪掉，只是排到最後：內容優先決定的是先後，不是把次要的內容拿掉。',
  fixed: { css: SHOP_CSS },
  starter: { html: String.raw`<main id="shop">
  <aside id="promo">
    <h2>本週優惠</h2>
    <p>全店滿 500 元免運費。</p>
  </aside>
  <nav id="related">
    <h2>相關商品</h2>
    <a href="#jam">手工果醬</a>
    <a href="#filter">咖啡濾紙</a>
  </nav>
  <section id="reviews">
    <h2>顧客評價</h2>
    <p>香氣很乾淨，已經回購三次。</p>
  </section>
  <section id="product">
    <h1>島嶼手沖咖啡豆</h1>
    <p class="price">每包 320 元</p>
    <button type="button">加入購物車</button>
  </section>
</main>` },
  solution: { html: String.raw`<main id="shop">
  <section id="product">
    <h1>島嶼手沖咖啡豆</h1>
    <p class="price">每包 320 元</p>
    <button type="button">加入購物車</button>
  </section>
  <section id="reviews">
    <h2>顧客評價</h2>
    <p>香氣很乾淨，已經回購三次。</p>
  </section>
  <nav id="related">
    <h2>相關商品</h2>
    <a href="#jam">手工果醬</a>
    <a href="#filter">咖啡濾紙</a>
  </nav>
  <aside id="promo">
    <h2>本週優惠</h2>
    <p>全店滿 500 元免運費。</p>
  </aside>
</main>` },
  viewport: { width: 360, height: 640 },
  widths: [360, 768],
  steps: [
    { check: 'count', selector: '#shop > #product:first-child', count: 1, label: '`#product` 是 `#shop` 的第一個子元素' },
    { check: 'box', selector: '#product', measure: 'top', value: 0, label: '視窗 360px 寬時，`#product` 的上緣在頁面的最上方（0px）' },
    { check: 'count', selector: '#product + #reviews', count: 1, label: '`#reviews` 緊接在 `#product` 之後' },
    { check: 'count', selector: '#reviews + #related', count: 1, label: '`#related` 緊接在 `#reviews` 之後' },
    { check: 'count', selector: '#related + #promo', count: 1, label: '`#promo` 還在，而且緊接在 `#related` 之後' },
    { check: 'headings', label: '標題形成正確的大綱：唯一的 `h1` 在最前面，後面沒有跳級' },
  ],
  mistakes: [
    { files: { html: String.raw`<main id="shop">
  <section id="product">
    <h1>島嶼手沖咖啡豆</h1>
    <p class="price">每包 320 元</p>
    <button type="button">加入購物車</button>
  </section>
  <aside id="promo">
    <h2>本週優惠</h2>
    <p>全店滿 500 元免運費。</p>
  </aside>
  <nav id="related">
    <h2>相關商品</h2>
    <a href="#jam">手工果醬</a>
    <a href="#filter">咖啡濾紙</a>
  </nav>
  <section id="reviews">
    <h2>顧客評價</h2>
    <p>香氣很乾淨，已經回購三次。</p>
  </section>
</main>` }, why: '只把 `#product` 搬到最前面，其餘三塊沒有動：商品資訊之後緊接著的是優先順序最低的「本週優惠」，顧客評價仍然在最後。內容優先要排的是每一塊的先後，不只是第一塊。' },
    { files: { html: String.raw`<main id="shop">
  <section id="product">
    <h1>島嶼手沖咖啡豆</h1>
    <p class="price">每包 320 元</p>
    <button type="button">加入購物車</button>
  </section>
  <section id="reviews">
    <h2>顧客評價</h2>
    <p>香氣很乾淨，已經回購三次。</p>
  </section>
  <nav id="related">
    <h2>相關商品</h2>
    <a href="#jam">手工果醬</a>
    <a href="#filter">咖啡濾紙</a>
  </nav>
</main>` }, why: '前三塊的順序對了，但「本週優惠」被整塊刪掉了。優先順序低的內容是排到後面，不是拿掉：用手機的讀者一樣需要知道免運費的條件。' },
  ],
};

const exMobileFirst: WebExercise = {
  id: 'rwd01-ex-mobile-first', title: '行動優先：夠寬才加大留白',
  statement: 'index.html 不能改。style.css 已經寫好最窄版面的基礎樣式：`#story` 四邊的內距是 16px。請以行動優先的方式補上兩件事，基礎樣式原有的宣告都不要改：（1）讓 `#page` 在窄的視窗填滿寬度（視窗 360px 寬時寬 360px），在寬的視窗最寬 720px 並水平置中（視窗 1024px 寬時寬 720px、左緣在 152px）；（2）加上一條媒體查詢：視窗至少 700px 寬時，`#story` 四邊的內距變成 48px；比 700px 窄的時候維持 16px。檢查會依序在 360px、700px、1024px 三種寬度量同一份頁面。',
  hints: [
    '第一件事和第一個練習相同，不需要媒體查詢。第二件事才需要：「至少 700px 寬」的條件怎麼寫？',
    '媒體查詢要寫在 `#story` 的基礎規則後面，大括號裡只放會改變的那一條宣告。數字要有單位。',
    '`#page` 加上 `max-width: 720px;` 與 `margin: 0 auto;`；檔案最後加上 `@media (min-width: 700px) { #story { padding: 48px; } }`。',
  ],
  explanation: '基礎樣式描述最窄的版面：`#story` 的內距是 16px，`#page` 填滿視窗。`max-width: 720px` 與 `margin: 0 auto` 對窄的視窗沒有影響，所以直接寫在基礎樣式裡，不必放進查詢。`@media (min-width: 700px)` 裡的規則在視窗至少 700px 寬時才生效（包含剛好 700px），並且寫在基礎規則之後，所以特異性相同的 `padding: 48px` 會蓋過前面的 16px。查詢裡只有一條宣告，因為其他樣式在兩種寬度下都相同。',
  fixed: { html: String.raw`<div id="page">
  <article id="story">
    <h1>舊倉庫變成圖書館</h1>
    <p>小島圖書館的建築原本是碼頭邊的倉庫，整修時保留了原來的木頭屋樑。</p>
  </article>
</div>` },
  starter: { css: String.raw`body { margin: 0; }
#page {
  background-color: #e3f2fd;
}
#story {
  padding: 16px;
}` },
  solution: { css: String.raw`body { margin: 0; }
#page {
  max-width: 720px;
  margin: 0 auto;
  background-color: #e3f2fd;
}
#story {
  padding: 16px;
}
@media (min-width: 700px) {
  #story {
    padding: 48px;
  }
}` },
  viewport: { width: 360, height: 640 },
  widths: [360, 700, 1024],
  steps: [
    { check: 'box', selector: '#page', measure: 'width', value: 360, label: '視窗 360px 寬時，`#page` 填滿視窗：寬 360px' },
    { check: 'style', selector: '#story', property: 'padding-left', value: '16px', label: '視窗 360px 寬時，`#story` 的內距維持 16px' },
    { do: 'resize', width: 700 },
    { check: 'style', selector: '#story', property: 'padding-left', value: '48px', label: '視窗剛好 700px 寬時，`#story` 的內距已經是 48px' },
    { do: 'resize', width: 1024 },
    { check: 'box', selector: '#page', measure: 'width', value: 720, label: '視窗 1024px 寬時，`#page` 的寬度停在 720px' },
    { check: 'box', selector: '#page', measure: 'left', value: 152, label: '視窗 1024px 寬時，`#page` 水平置中：左緣在 152px' },
    { check: 'style', selector: '#story', property: 'padding-top', value: '48px', label: '視窗 1024px 寬時，`#story` 上方的內距也是 48px' },
  ],
  mistakes: [
    { files: { css: String.raw`body { margin: 0; }
#page {
  max-width: 720px;
  margin: 0 auto;
  background-color: #e3f2fd;
}
#story {
  padding: 16px;
}
@media (max-width: 700px) {
  #story {
    padding: 48px;
  }
}` }, why: '條件寫成了 `max-width: 700px`，意思是「視窗最寬到 700px 為止」：結果窄的視窗拿到 48px 的內距，寬的視窗反而只有 16px，剛好相反。行動優先替較寬的視窗加規則，用的是 `min-width`。' },
    { files: { css: String.raw`body { margin: 0; }
#page {
  max-width: 720px;
  margin: 0 auto;
  background-color: #e3f2fd;
}
@media (min-width: 700px) {
  #story {
    padding: 48px;
  }
}
#story {
  padding: 16px;
}` }, why: '媒體查詢寫在基礎規則的前面。查詢裡的規則沒有比較高的特異性：兩條 `#story` 規則特異性相同，後寫的 `padding: 16px` 勝出，視窗再寬內距也是 16px。查詢要寫在它想覆蓋的規則之後。' },
    { files: { css: String.raw`body { margin: 0; }
#page {
  max-width: 720px;
  margin: 0 auto;
  background-color: #e3f2fd;
}
#story {
  padding: 16px;
}
@media (min-width: 700) {
  #story {
    padding: 48px;
  }
}` }, why: '條件的數字漏了單位：`(min-width: 700)` 不是合法的條件，瀏覽器不會顯示錯誤，只是這個查詢永遠不成立，內距在每一種寬度都是 16px。要寫成 `700px`。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD01: LessonContent = {
  lessonId: 'RWD01',
  motivation: '同一個網址，有人用 360px 寬的手機開，有人用 1280px 寬的筆電開，而你沒辦法事先知道是哪一種。這一課說明響應式設計要解決的問題，並用三樣最簡單的工具（`max-width`、不超出容器的圖片、一條 `min-width` 的媒體查詢）做出會跟著寬度調整的頁面。學完之後，你能說出一個頁面從手機到桌機應該怎麼變化，以及為什麼要從最窄的版面開始寫。',
  sections: [
    {
      id: 'rwd01-problem-section', title: '一個頁面，許多種寬度',
      blocks: [
        { type: 'p', text: 'WEB06 的範例都替盒子寫了固定的像素寬度，因為那時要練習的是計算。真正的網頁沒有這麼單純：同一個頁面會被 360px 寬的手機、768px 寬的平板、1280px 寬的筆電打開，使用者還可以把瀏覽器的視窗拉成任何寬度。瀏覽器用來顯示頁面的那塊區域叫做視窗（viewport），寫 CSS 的人無法事先知道它有多寬。' },
        { type: 'p', text: '過去常見的做法，是把整頁包在一個寬度寫死的容器裡，例如 `width: 960px`，再用 `margin: 0 auto` 置中。下面就是這樣的一頁。預覽上方有一排寬度按鈕：按下去，預覽的框架就真的變成那個寬度，頁面會重新排版一次；「填滿欄位」則回到課程頁欄位的寬度。這個島的範例大多有這排按鈕。' },
        { type: 'example', id: 'rwd01-fixed-page' },
        { type: 'p', text: '先按 360px：`.page` 仍然是 960px 寬，視窗只看得到最左邊的 360px，其餘的要橫向捲動才看得到，每讀一行字都要左右捲一次。再按 1280px：頁面置中，兩邊各空 160px，沒有壞掉，但多出來的空間也沒有用上。三個寬度下的結果整理如下：' },
        { type: 'table', head: ['視窗寬度', '容器的寬度', '結果'], rows: [
          ['360px', '960px', '超出 600px，要橫向捲動才讀得完'],
          ['768px', '960px', '超出 192px，仍然要橫向捲動'],
          ['1280px', '960px', '放得下，左右各空 160px'],
        ] },
        { type: 'p', text: '在真正的手機上，這種頁面不是要左右捲動，就是整頁被縮小到字看不清楚（下一課會說明手機瀏覽器什麼時候這樣做）。兩種結果都讓人讀不下去。' },
        { type: 'callout', tone: 'note', title: '把寬度換成另一個固定的數字也沒有用', text: '遇到這個問題，直覺的反應是問「手機是幾 px？」然後照那個數字再寫死一次。但手機的寬度不只一種，同一支手機橫過來又是另一個寬度：為 360px 寫死的版面，到了 400px 寬的螢幕上右邊就多出一條空白，到了 320px 的螢幕上又超出去。問題不在 960 這個數字，而在「寫死」。' },
      ],
    },
    {
      id: 'rwd01-fluid-section', title: '響應式設計：同一份 HTML，會調整的是 CSS',
      blocks: [
        { type: 'p', text: '響應式設計（responsive design）的做法是：所有裝置拿到同一份 HTML，由 CSS 依照當下可用的寬度調整版面。目標不是讓頁面在每個螢幕上長得一模一樣，而是在每一種寬度下都好讀、好操作：不必橫向捲動，字不必放大才看得清楚，內容一樣都不少。它靠三樣工具做到，這個島會一樣一樣教：' },
        { type: 'table', head: ['工具', '做什麼', '這一課先用到的', '完整介紹'], rows: [
          ['流動的尺寸', '寬度不寫死，跟著容器伸縮，再設定上限', '`max-width`、`max-width: 100%`', 'RWD02'],
          ['彈性的版面', '一排項目自己分配空間，放不下就換行', '這一課還不用', 'RWD03 到 RWD06（Flexbox 與 Grid）'],
          ['媒體查詢（media query）', '視窗符合條件時，才套用某些規則', '一條 `min-width` 的查詢', 'RWD07'],
        ] },
        { type: 'p', text: '先看流動的尺寸。WEB06 說過，沒有設定 `width` 的區塊會填滿父元素：這個預設行為本來就是流動的，把它弄壞的是我們自己寫的 `width: 960px`。需要補上的只有一個上限，免得一行字在大螢幕上長得不好讀。`max-width` 就是寬度的上限：區塊照樣填滿可用的寬度，但最多只到這個值。' },
        { type: 'example', id: 'rwd01-fluid-page' },
        { type: 'p', text: '依序按三個寬度。360px 時 `.page` 剛好 360px 寬，右緣貼著視窗的邊，沒有橫向捲軸；768px 與 1280px 時它停在 720px，並且置中。WEB06 提過，用左右外距 `auto` 置中的區塊要有明確的寬度；這裡沒有寫 `width`，但視窗比 720px 寬的時候，`max-width` 把寬度定在 720px，剩下的空間照樣由左右的 `auto` 平分。視窗比 720px 窄的時候沒有剩下的空間，左右外距就是 0。同一條規則，寬的窄的視窗都照顧到了。' },
        { type: 'p', text: '圖片是另一個常見的破口。圖片有自己原本的大小，放進比它窄的容器並不會自動縮小，而是直接超出去，把整頁撐出橫向捲軸：' },
        { type: 'example', id: 'rwd01-fluid-image' },
        { type: 'p', text: '按 360px：第一張圖維持 600px 寬，右邊的橘色方塊要橫向捲動才看得到；第二張縮成 320px（視窗的 360px 扣掉 `.post` 左右各 20px 的內距），整張圖都在畫面裡。`max-width: 100%` 的百分比是相對於容器內容區的寬度，意思是「最寬只能和容器的內容區一樣寬」。按 768px：容器比圖片寬了，第二張圖停在原本的 600px，不會被放大成模糊的大圖。' },
        { type: 'callout', tone: 'warning', title: '圖片縮小了，卻變形了', text: '`<img>` 寫了 `height` 屬性時，只加上 `max-width: 100%` 會讓寬度縮小，高度卻還是屬性寫的那個數字，圖片被拉長變形。原因是 `max-width` 只限制寬度。固定搭配 `height: auto`，高度才會依原圖的比例一起縮小；範例的第二張圖就是這樣寫的。反過來，也不要為了省事把 `<img>` 的 `width` 與 `height` 屬性拿掉：WEB14 說過，瀏覽器靠這兩個數字在圖片下載完成之前先留好位置。' },
        { type: 'callout', tone: 'tip', title: '動手試：改變上限', text: '在「同一頁，改成有上限的流動寬度」按「動手改這個範例」，把 `max-width: 720px` 改成 `max-width: 480px` 再執行。先猜：按 768px 時 `.page` 的左緣會在哪裡？剩下的 768 − 480 = 288px 平分，所以是 144px。再把 `margin: 0 auto` 那一行刪掉：寬度仍然停在 480px，但整塊靠到左邊。' },
      ],
    },
    {
      id: 'rwd01-media-section', title: '媒體查詢：夠寬的時候才套用的規則',
      blocks: [
        { type: 'p', text: '流動的尺寸讓盒子跟著寬度伸縮，但有些改變不是伸縮做得到的。導覽的三個連結，在窄的視窗裡上下疊，每個連結都是一整列，手指容易按到；到了寬的視窗，同樣三個連結排成一行才不浪費空間。這種「到了某個寬度，就換一種排法」的需求，要用媒體查詢（media query）。' },
        { type: 'p', text: '寫法是 `@media (min-width: 400px) { … }`。小括號裡是條件：`min-width: 400px` 表示「視窗的寬度至少 400px」。大括號裡放的是一般的 CSS 規則，條件成立時才生效；條件不成立時，瀏覽器就當這些規則不存在。版面在哪個寬度換一種排法，那個寬度就叫斷點（breakpoint）；下面這個範例的斷點是 400px。' },
        { type: 'example', id: 'rwd01-first-query' },
        { type: 'p', text: '按 360px：查詢不成立，連結套用的只有外面的基礎規則，`display: block` 讓每個連結填滿 360px、上下疊成三列。按 400px：條件成立（「至少」包含剛好 400px），大括號裡的 `display: inline-block` 與 `width: 120px` 生效，三個連結排成一行。這裡用的 `block` 與 `inline-block` 都是 WEB06 學過的，新的只有外面那一層 `@media`。注意查詢裡只寫了兩條宣告：高度、底色這些在兩種寬度下都一樣的樣式，基礎規則已經寫過，繼續有效。查詢裡只需要寫「不一樣的部分」。' },
        { type: 'p', text: '媒體查詢裡的規則沒有特權。它的特異性和寫在查詢外面時完全一樣，誰勝出仍然照 WEB05 的規則：特異性相同時，後寫的勝出。範例裡查詢排在基礎規則的後面，所以條件成立時，`inline-block` 蓋過了前面的 `block`。' },
        { type: 'callout', tone: 'warning', title: '媒體查詢寫了卻沒有作用', text: '最常見的原因有三個。第一，查詢寫在基礎規則的前面：兩條規則特異性相同，後面的基礎規則把查詢裡的宣告蓋回去了，所以查詢要放在它想覆蓋的規則之後。第二，數字漏了單位：`(min-width: 400)` 不是合法的條件，瀏覽器不會提示錯誤，這個查詢只是永遠不成立。第三，把 `min-width` 寫成 `max-width`：後者的意思是「視窗最寬到這個值為止」，結果剛好相反。' },
        { type: 'callout', tone: 'tip', title: '動手試：移動斷點', text: '把範例裡的 `400px` 改成 `700px` 再執行，然後按 400px 與 768px：現在 400px 寬時連結仍然上下疊，要到 768px 才排成一行。再改成 `300px` 並按 360px：查詢成立了，但三個 120px 寬的連結加上連結之間的空格，360px 放不下，第三個連結掉到第二行。斷點訂得太小，版面就會在還放不下的時候提早切換。' },
      ],
    },
    {
      id: 'rwd01-mobile-first-section', title: '行動優先：先寫窄的，再往寬的加',
      blocks: [
        { type: 'p', text: '上一個範例的寫法有一個名字：行動優先（mobile first）。媒體查詢外面的基礎樣式描述的是最窄的版面；較寬的視窗需要的改變，用 `min-width` 的查詢一層一層加上去。反過來的寫法是桌機優先（desktop first）：基礎樣式是寬的版面，再用 `max-width` 的查詢（「視窗最寬到多少為止」）在變窄的時候把它改掉。兩種寫法可以做出一模一樣的畫面，差別在寫起來與改起來的負擔：' },
        { type: 'table', head: ['比較', '行動優先', '桌機優先'], rows: [
          ['基礎樣式（查詢外面）', '最窄的版面：區塊由上往下疊', '最寬的版面：並排、指定寬度'],
          ['媒體查詢的條件', '`min-width`：夠寬才加上', '`max-width`：變窄就改掉'],
          ['查詢裡多半在做什麼', '新增：排成一行、加大留白', '取消：把前面寫的並排與寬度改回來'],
          ['查詢沒有套用時看到的', '單欄、讀得完的頁面', '寬的版面擠在窄的視窗裡'],
        ] },
        { type: 'p', text: '把導覽範例改成桌機優先會變成這樣：基礎規則寫 `display: inline-block; width: 120px;`，再加上 `@media (max-width: 399px) { .menu a { display: block; width: auto; } }`。查詢裡的兩條宣告都在「取消」：把 `inline-block` 改回 `block`，把寬度改回預設的 `auto`（填滿父元素）。版面越複雜，要取消的宣告越多，也越容易漏掉一條。行動優先比較省力，原因有三個：' },
        { type: 'list', items: [
          '基礎最簡單：窄的版面多半是區塊由上往下疊，WEB06 的一般排版流已經做完了，幾乎不需要另外寫排版的 CSS。',
          '覆蓋比較少：只在需要的寬度「加上」規則，不必先寫一套並排的版面，再到窄的視窗一條一條取消。',
          '最窄的畫面限制最多：一次只放得下一欄，會逼你先決定哪些內容最重要、誰排在前面（下一節）。放得進窄畫面的內容，到了寬的畫面只是多了空間可以運用。',
        ] },
        { type: 'callout', tone: 'warning', title: '行動優先不是另外做一個手機版', text: '行動優先說的是樣式「撰寫的順序」，不是替手機另外做一份頁面：仍然只有一份 HTML、一份 CSS，每一種寬度都由它們負責。它也不是把內容藏起來。用 `display: none` 把窄畫面「放不下」的內容拿掉，用手機的讀者就讀不到那些內容；該做的是替內容排出先後，讓次要的往後排。' },
        { type: 'callout', tone: 'tip', title: '動手試：改成桌機優先，再改回來', text: '在「第一條媒體查詢」的範例裡，照上面的說明改成桌機優先：基礎規則的 `display: block` 換成 `display: inline-block` 並加上 `width: 120px`，查詢換成 `@media (max-width: 399px)`，裡面寫 `display: block; width: auto;`。按 360px 與 400px，畫面和原來相同。接著把查詢裡的 `width: auto` 刪掉再按 360px：連結雖然各佔一列，卻只有 120px 寬，這就是「漏掉一條要取消的宣告」的樣子。' },
      ],
    },
    {
      id: 'rwd01-content-first-section', title: '內容優先：順序與斷點都由內容決定',
      blocks: [
        { type: 'p', text: '窄的畫面一次只放得下一欄，所以區塊一定有先後。誰排在前面？樣式表沒有改變排列的時候，答案是 HTML 原始碼的順序：一般排版流照元素在 HTML 裡的先後由上往下排。同一個順序也是螢幕閱讀器朗讀、Tab 鍵移動焦點的順序。所以動手寫 CSS 之前，先列出這一頁有哪些內容、排出優先順序，再照那個順序寫 HTML。這個做法叫內容優先（content first）。' },
        { type: 'p', text: '下面是小島圖書館的首頁。會打開圖書館網站的人，最常想知道的是「今天有沒有開」，所以開放時間排第一，接著是最新消息，最後才是本館的介紹。' },
        { type: 'example', id: 'rwd01-content-first' },
        { type: 'p', text: '按 360px：三個區塊照原始碼的順序往下排，不用捲動就看得到今天的開放時間。按 768px 與 1280px：順序完全沒有變，改變的只有留白與置中。`max-width: 640px` 直接寫在基礎樣式裡：16px 的中文字每個寬 16px，640px 寬的內容一行大約 40 個字，視窗再寬也不會更長。它不需要放進媒體查詢，因為視窗比 640px 窄的時候，這個上限根本碰不到。不是每一種調整都需要媒體查詢。' },
        { type: 'p', text: '斷點也由內容決定。這個範例的 700px 是這樣來的：640px 的內容加上兩邊各 32px 的內距，一共 704px，所以視窗大約 700px 寬的時候，才放得下比較寬的留白。前面導覽範例的 400px 也一樣：三個 120px 寬的連結排成一行需要 360px，再加上連結之間的空格，視窗比這個寬度窄，第三個連結就會掉到下一行，所以斷點訂在稍寬一點的 400px。兩個數字都不是哪一款手機或平板的寬度。' },
        { type: 'p', text: '找斷點的方法很實際：從最窄的版面開始，把視窗慢慢加寬，直到內容開始不好看（一行字太長、連結之間空得太開、卡片旁邊多出可以再放一張的空間），那個寬度附近就是需要斷點的地方。裝置的寬度有很多種，以後還會出現新的；內容在多寬的時候放不下、在多寬的時候顯得太空，卻只和內容本身有關。' },
        { type: 'callout', tone: 'note', title: '寬度按鈕只是取樣', text: '預覽上方的 360px、768px、1280px 是三個方便觀察的寬度，不是三種「裝置」，也不是這一頁的斷點。一個響應式的頁面，在這些數字之間的每一個寬度都應該沒有橫向捲軸、讀得下去；檢查自己的頁面時，可以把瀏覽器的視窗慢慢拉窄再拉寬，看整個過程而不只是三個點。' },
      ],
    },
    {
      id: 'rwd01-enhancement-section', title: '漸進增強：少了增強，頁面照樣能用',
      blocks: [
        { type: 'p', text: '行動優先其實是一個更大的原則用在「寬度」上的結果。這個原則叫漸進增強（progressive enhancement）：先做出在任何情況下都能用的基礎，也就是語意正確的 HTML 加上最簡單的樣式；再一層一層加上有條件的改進，例如視窗夠寬才排成一行、瀏覽器支援才用得上的新功能。每一層都是加分；少了任何一層，讀者仍然讀得到內容、按得到連結。' },
        { type: 'p', text: 'CSS 很適合這樣寫，因為瀏覽器遇到用不上的東西只是略過：不認得的宣告只略過那一條，不影響其他宣告；條件不成立的媒體查詢也只是不套用。所以判斷一個頁面是不是漸進增強，有一個簡單的問法：把某一層拿掉，頁面還能不能用？' },
        { type: 'callout', tone: 'tip', title: '動手試：把增強一層一層拿掉', text: '回到上一節的圖書館首頁，把 style.css 最後那三行 `@media` 刪掉再執行，按 1280px：留白變少了，但內容、順序都還在。接著把 style.css 整個清空：只剩瀏覽器預設樣式的 HTML，標題還是標題，三個區塊仍然由上到下讀得通。這就是「基礎」：之後加上去的每一條 CSS，都是在這個可用的頁面上增強。' },
        { type: 'p', text: '圖書館首頁的 `head` 裡還有一行 `<meta name="viewport" content="width=device-width, initial-scale=1">`：它請手機瀏覽器照裝置自己的寬度排版，而不是先把頁面當成很寬的畫面排好再縮小。每一個響應式頁面都要有這一行，下一課會說明細節。' },
        { type: 'p', text: '把這一課串起來。要說明或規劃一個頁面從手機到桌機怎麼變化，可以照這個順序：' },
        { type: 'list', ordered: true, items: [
          '內容：列出這一頁的內容，排出優先順序，照順序寫 HTML。',
          '基礎樣式（最窄）：單欄，區塊照原始碼的順序往下排；圖片寫 `max-width: 100%` 與 `height: auto`；沒有任何寫死的寬度比視窗寬。',
          '上限：用 `max-width` 讓內容在很寬的視窗裡不會無限拉長，並用 `margin: 0 auto` 置中。',
          '變寬：內容在哪個寬度開始不好看，就在那裡加一條 `min-width` 的媒體查詢，寫在基礎規則之後，只寫要改變的宣告。',
          '檢查：每一種寬度都沒有橫向捲軸；拿掉媒體查詢，頁面仍然能用。',
        ] },
        { type: 'p', text: '想多試幾種寬度與斷點，可以到互動實驗島的 Responsive Layout Simulator：在真實寬度的預覽框裡調整斷點，看行動優先的媒體查詢在哪個寬度開始生效。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'rwd01-q1', prompt: '下面哪一句最貼切地說明了響應式設計（responsive design）的目標？',
      options: [
        '替手機、平板、桌機各寫一份 HTML，再依裝置把讀者帶到不同的網址',
        '把桌機的版面等比例縮小，讓整頁塞進手機的螢幕',
        '所有裝置拿到同一份 HTML，由 CSS 依可用的寬度調整版面，讓每一種寬度都好讀、好操作',
        '讓頁面在每一種螢幕上看起來一模一樣',
      ],
      answer: 2,
      explanation: '響應式設計是同一份 HTML 搭配會依寬度調整的 CSS，目標是每一種寬度都好讀、好操作。各寫一份 HTML 是在維護好幾個網站，而且寬度不只三種；把整頁等比例縮小，字會小到看不清楚；「看起來一模一樣」也不是目標：窄的視窗用單欄、寬的視窗排成一行，版面本來就應該不同。',
    },
    {
      id: 'rwd01-q2', prompt: '視窗寬 1000px 時，`.page` 有多寬？它的左緣距離視窗左邊多遠？',
      code: { language: 'CSS', text: 'body { margin: 0; }\n.page {\n  max-width: 600px;\n  margin: 0 auto;\n}' },
      options: ['寬 600px，左緣在 200px', '寬 1000px，左緣在 0', '寬 600px，左緣在 0', '寬 600px，左緣在 400px'],
      answer: 0,
      explanation: '區塊想填滿 1000px，但 `max-width` 把寬度限制在 600px；剩下的 400px 由左右外距的 `auto` 平分，各 200px，所以左緣在 200px。「寬 1000px」忽略了上限；「左緣在 0」是沒有寫 `margin: 0 auto` 時的結果；「左緣在 400px」把剩下的空間全給了左邊，`auto` 是兩邊平分。視窗只有 360px 寬時，同一條規則的結果是寬 360px、左緣在 0。',
    },
    {
      id: 'rwd01-q3', prompt: '頁面裡有一張 `<img id="map" width="800" height="400">`，放在內容區 300px 寬的容器裡，樣式表只有下面這一條規則。圖片會顯示成什麼樣子？',
      code: { language: 'CSS', text: '#map {\n  max-width: 100%;\n}' },
      options: [
        '寬 800px、高 400px，超出容器',
        '寬 300px、高 150px，比例不變',
        '寬 800px，但超出容器的 500px 被裁掉看不到',
        '寬 300px、高 400px，圖片變形',
      ],
      answer: 3,
      explanation: '`max-width: 100%` 把寬度限制在容器的 300px，但它只管寬度：高度仍然是 `height` 屬性寫的 400px，所以圖片是 300 × 400，被拉長變形。要得到比例不變的 300 × 150，還要加上 `height: auto`。「800 × 400 超出容器」是完全沒有樣式時的結果；`max-width` 是把整張圖縮小，不會裁掉任何部分。',
    },
    {
      id: 'rwd01-q4', prompt: '視窗的寬度剛好是 700px 時，`.card` 的內距是多少？',
      code: { language: 'CSS', text: '.card { padding: 16px; }\n@media (min-width: 700px) {\n  .card { padding: 40px; }\n}' },
      options: [
        '16px：視窗要比 700px 寬，查詢裡的規則才會套用',
        '40px：`min-width: 700px` 是「至少 700px」，包含剛好 700px',
        '56px：兩條規則的內距相加',
        '0：兩條規則互相衝突，所以都不套用',
      ],
      answer: 1,
      explanation: '`min-width: 700px` 的意思是視窗寬度至少 700px，剛好 700px 時條件成立，查詢裡的規則生效；它寫在基礎規則之後、特異性相同，所以 40px 蓋過 16px。同一個屬性的兩條宣告不會相加，也不會互相抵銷：照層疊的規則只有一條勝出。視窗是 699px 時，條件不成立，內距才是 16px。',
    },
    {
      id: 'rwd01-q5', prompt: '這份樣式想讓 `.card` 在寬的視窗裡有 40px 的內距。視窗寬 1000px 時，實際的內距是多少？',
      code: { language: 'CSS', text: '@media (min-width: 700px) {\n  .card { padding: 40px; }\n}\n.card { padding: 16px; }' },
      options: [
        '40px：媒體查詢裡的規則優先於查詢外面的規則',
        '16px：兩條規則的特異性相同，後寫的勝出，查詢裡的宣告被蓋掉了',
        '40px：同一個屬性有兩個值時，數值較大的勝出',
        '16px：媒體查詢一定要寫在樣式表的第一行才有效',
      ],
      answer: 1,
      explanation: '視窗 1000px 寬時查詢成立，但媒體查詢不會提高規則的特異性：兩條 `.card` 規則特異性相同，後寫的 `padding: 16px` 勝出，所以內距是 16px。層疊比的是特異性與先後，不是數值大小。媒體查詢也不需要寫在第一行，正好相反：把它移到基礎規則的後面，寬的視窗才會拿到 40px。',
    },
    {
      id: 'rwd01-q6', prompt: '以行動優先（mobile first）撰寫的樣式表裡，寫在所有媒體查詢外面的基礎樣式，描述的是哪一種版面？',
      options: [
        '最寬的桌機版面，再用 `max-width` 的查詢替較窄的視窗改掉',
        '中等寬度的平板版面，再往寬、窄兩邊各寫一組查詢',
        '不寫基礎樣式，每一種寬度的規則都放進自己的查詢裡',
        '最窄的版面，再用 `min-width` 的查詢替較寬的視窗加上規則',
      ],
      answer: 3,
      explanation: '行動優先的基礎樣式是最窄的版面，多半只靠一般排版流；較寬的視窗需要的改變，用 `min-width` 的查詢加上去。基礎是寬版面、用 `max-width` 改掉的是桌機優先，查詢裡常常在取消前面寫的宣告。從中間的寬度往兩邊寫，窄的與寬的兩個方向都得覆蓋基礎樣式；不寫基礎樣式、每一種寬度各寫一整組，相同的宣告會重複好幾次。這兩種都不是行動優先。',
    },
    {
      id: 'rwd01-q7', prompt: '一排三張商品卡片，在視窗比 520px 窄的時候擠到商品名稱要斷成四、五行。依內容優先的原則，「三張排成一排」的斷點該怎麼決定？',
      options: [
        '訂在 520px 附近：內容從這個寬度開始才放得下，斷點由內容決定',
        '訂在 768px：許多教學都把這個數字當成平板的寬度',
        '訂在 360px：先確定手機上也能三張排成一排',
        '不訂斷點，在窄的視窗用 `display: none` 把第三張卡片藏起來',
      ],
      answer: 0,
      explanation: '斷點要訂在內容開始放得下（或開始放不下）的寬度，這裡是 520px 附近：比它窄就維持單欄，夠寬才排成一排。768px 是別人的頁面或某種裝置的數字，套在這一頁上，520px 到 768px 之間明明放得下卻還是單欄。訂在 360px 會讓卡片在還很擠的時候就並排。把卡片藏起來則讓窄視窗的讀者少了一項商品，內容優先是排順序，不是刪內容。',
    },
    {
      id: 'rwd01-q8', prompt: '某個頁面把兩欄的版面寫在 `@media (min-width: 800px)` 裡。一位讀者的視窗只有 500px 寬，查詢不成立。如果這個頁面符合漸進增強（progressive enhancement），他會看到什麼？',
      options: [
        '一片空白，因為排版的樣式沒有套用',
        '兩欄的版面，整個縮小到 500px 寬',
        '單欄的頁面：內容完整，連結與按鈕都能用，只是沒有分成兩欄',
        '一則「請改用電腦瀏覽」的提示',
      ],
      answer: 2,
      explanation: '漸進增強是先有在任何情況下都能用的基礎，再加上有條件的改進。兩欄是「夠寬才有」的增強，沒有套用時，讀者看到的是基礎：單欄、內容完整、可以操作。條件不成立的查詢只是不套用，其他規則照常生效，不會變成空白；查詢沒有套用，自然也不會出現縮小的兩欄。要求讀者換裝置，正是響應式設計要避免的事。',
    },
  ],
  webCode: {
    examples: [fixedPage, fluidPage, fluidImage, firstQuery, contentFirst],
    exercises: [exFluidPage, exFluidImage, exContentOrder, exMobileFirst],
  },
};
