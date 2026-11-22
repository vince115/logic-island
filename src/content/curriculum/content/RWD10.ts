import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * RWD10 responsive images and media (RWD-3). A web-code lesson of HTML and CSS only. The pages have no network: every
 * image is a small SVG in a data: address, written without spaces so that the same address also works inside srcset
 * (where a space ends the address). What is checked, and how:
 *  - Which srcset candidate FILE a browser took depends on the device pixel ratio (and, as measured, Chromium showed the
 *    largest data: candidate on a 1x screen too), so no check and no text relies on it: the candidates of one image
 *    draw the same picture, and each file is exactly as many pixels wide as its descriptor says. An image without a
 *    CSS width is then as wide as its sizes slot whichever file was taken, on any pixel ratio.
 *  - The source a picture takes and the slot of sizes follow the viewport in a check too (engine W8: the harness waits
 *    for a rendering update and for the images, on load and after every resize). The sizes exercise is measured that
 *    way (its style sheet gives the photo no width), and the picture example and exercise on both sides of the
 *    condition, at 699 and 700.
 *  - Everything laid out by CSS (max-width, aspect-ratio, object-fit, an iframe's 16:9 box) is measured at several
 *    widths with resize steps, as in the other lessons of this island. Lazy images carry width and height, so their
 *    boxes do not depend on whether they have been loaded.
 * The preview cannot show which file was taken (nothing is downloaded): the text says so and points to the Network
 * panel and currentSrc of a real site.
 */

/** A small SVG as a data: address without spaces. */
const image = (width: number, height: number, viewBox: string, inner: string) =>
  'data:image/svg+xml,' + `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='${viewBox}'>${inner}</svg>`
    .replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23').replace(/ /g, '%20');

/** A sunrise over the sea, 2:1: the round sun shows any distortion at once. */
const sunrise = (width: number) => image(width, width / 2, '0 0 12 6',
  "<rect width='12' height='6' fill='#bbdefb'/><circle cx='9' cy='2' r='1' fill='#ffca28'/><path d='M2 4.4l2-2 2 2z' fill='#66bb6a'/><rect y='4.4' width='12' height='1.6' fill='#1976d2'/>");
/** Two coconut biscuits on a plate, 2:1: the product photo that comes in three pixel sizes. */
const biscuits = (width: number) => image(width, width / 2, '0 0 4 2',
  "<rect width='4' height='2' fill='#ffe082'/><circle cx='1.3' cy='1' r='.6' fill='#a1887f'/><circle cx='2.7' cy='1' r='.6' fill='#8d6e63'/>");
/** The shop's logo, 3:1. */
const logo = (width: number) => image(width, width / 3, '0 0 12 4',
  "<rect width='12' height='4' rx='1' fill='#1565c0'/><circle cx='2' cy='2' r='1' fill='#ffca28'/><rect x='4' y='1.5' width='6.5' height='1' fill='white'/>");
/** The lighthouse close up, 1:1, and the whole shore with a small lighthouse, 3:1: two crops for art direction. */
const LIGHTHOUSE = image(400, 400, '0 0 6 6',
  "<rect width='6' height='6' fill='#bbdefb'/><path d='M2.4 5l.3-3.2h.6l.3 3.2z' fill='white'/><rect x='2.6' y='1.2' width='.8' height='.6' fill='#e53935'/><rect y='5' width='6' height='1' fill='#546e7a'/>");
const SHORE = image(1200, 400, '0 0 18 6',
  "<rect width='18' height='6' fill='#bbdefb'/><circle cx='14' cy='2' r='1' fill='#ffca28'/><rect y='4.8' width='18' height='1.2' fill='#1976d2'/><rect x='2' y='4.6' width='2.4' height='.5' fill='#546e7a'/><path d='M2.9 4.6l.1-1.4h.4l.1 1.4z' fill='white'/><rect x='2.95' y='2.9' width='.5' height='.3' fill='#e53935'/>");

const SUNRISE_480 = sunrise(480), SUNRISE_600 = sunrise(600);
const BISCUITS_400 = biscuits(400), BISCUITS_800 = biscuits(800), BISCUITS_1200 = biscuits(1200);
const LOGO_120 = logo(120), LOGO_240 = logo(240);

// ---- examples ---------------------------------------------------------------------------------------------------
const fluid: WebExample = {
  id: 'rwd10-fluid', title: '同一張照片的三種寫法',
  description: '三張圖都是同一個 480 × 240 像素的檔案，HTML 也都寫了 `width="480" height="240"`，各自放在橘色底的 `figure` 裡。A 只有 `max-width: 100%`；B 多了 `height: auto`；C 再加上 `display: block`。請按 360px 與 768px 比較。',
  viewport: { width: 360, height: 900 },
  widths: [360, 768],
  files: {
    html: `<p>A：只有 max-width: 100%</p>
<figure id="fa"><img id="a" src="${SUNRISE_480}" alt="島嶼的日出" width="480" height="240"></figure>
<p>B：加上 height: auto</p>
<figure id="fb"><img id="b" src="${SUNRISE_480}" alt="島嶼的日出" width="480" height="240"></figure>
<p>C：再加上 display: block</p>
<figure id="fc"><img id="c" src="${SUNRISE_480}" alt="島嶼的日出" width="480" height="240"></figure>`,
    css: String.raw`body { margin: 0; padding: 20px; }
p { margin: 0 0 4px; }
figure { margin: 0 0 16px; background-color: #f57c00; }

#a { max-width: 100%; }

#b { max-width: 100%; height: auto; }

#c { max-width: 100%; height: auto; display: block; }`,
  },
  observe: [
    { check: 'box', selector: '#a', measure: 'width', value: 320, label: '視窗寬 360px：容器的內容區是 320px，`max-width: 100%` 把 A 的寬度從 480px 縮成 320px' },
    { check: 'box', selector: '#a', measure: 'height', value: 240, label: 'A 的高度仍然是 `height` 屬性的 240px：320 × 240，太陽被拉成橢圓' },
    { check: 'box', selector: '#b', measure: 'height', value: 160, label: 'B 多了 `height: auto`：高度依 2:1 的比例變成 160px' },
    { check: 'box', selector: '#fc', measure: 'height', value: 160, label: 'C 是 `display: block`：`figure` 和圖片一樣高（160px），圖片下方沒有縫' },
    { do: 'resize', width: 768, height: 1200 },
    { check: 'box', selector: '#c', measure: 'width', value: 480, label: '視窗寬 768px：容器比圖片寬，`max-width` 的上限碰不到，C 維持 480px，沒有被放大' },
  ],
};

const ratio: WebExample = {
  id: 'rwd10-ratio', title: '沒有寫高度的盒子：aspect-ratio 與 object-fit',
  description: '灰色的 `.embed` 是替之後才載入的地圖留的位置，只寫了 `aspect-ratio: 16 / 9`。下面三張縮圖是同一張 2:1 的照片，盒子卻被 `aspect-ratio: 1 / 1` 定成正方形，各用一種 `object-fit`。',
  viewport: { width: 360, height: 600 },
  widths: [360, 600],
  files: {
    html: `<div class="embed">地圖載入中</div>
<ul class="thumbs">
  <li><img id="fill" src="${SUNRISE_480}" alt="島嶼的日出" width="480" height="240">fill</li>
  <li><img id="cover" src="${SUNRISE_480}" alt="島嶼的日出" width="480" height="240">cover</li>
  <li><img id="contain" src="${SUNRISE_480}" alt="島嶼的日出" width="480" height="240">contain</li>
</ul>`,
    css: String.raw`body { margin: 0; padding: 20px; }
.embed {
  aspect-ratio: 16 / 9;
  background-color: #cfd8dc;
}
.thumbs {
  display: flex;
  gap: 10px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  text-align: center;
}
.thumbs li { flex: 1; }
.thumbs img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1 / 1;
  background-color: #eceff1;
}
#cover { object-fit: cover; }
#contain { object-fit: contain; }`,
  },
  observe: [
    { check: 'box', selector: '.embed', measure: 'height', value: 180, label: '視窗寬 360px：`.embed` 寬 320px，沒有寫高度，`aspect-ratio: 16 / 9` 算出 320 × 9 ÷ 16 = 180px' },
    { check: 'box', selector: '#cover', measure: 'height', value: 100, label: '三張縮圖各寬 100px，`aspect-ratio: 1 / 1` 讓盒子也是 100px 高：比例和 2:1 的檔案不同' },
    { check: 'style', selector: '#fill', property: 'object-fit', value: 'fill', label: '第一張沒有寫 `object-fit`，計算後是預設的 `fill`：照片被壓成正方形' },
    { check: 'style', selector: '#cover', property: 'object-fit', value: 'cover', label: '第二張是 `object-fit: cover`：比例不變，蓋滿盒子，左右多出來的部分被裁掉' },
    { do: 'resize', width: 600, height: 800 },
    { check: 'box', selector: '.embed', measure: 'height', value: 315, label: '視窗寬 600px：`.embed` 寬 560px，高度跟著變成 315px，比例仍然是 16:9' },
  ],
};

const srcset: WebExample = {
  id: 'rwd10-srcset', title: '標誌用 x 描述子，照片用 w 描述子加 sizes',
  description: '小島商店的商品頁。標誌 `#logo` 的顯示尺寸固定是 120 × 40，準備了 120 與 240 像素寬的兩個檔案。照片 `#photo` 的寬度會跟著視窗變，準備了 400、800、1200 像素寬的三個檔案。每個很長的 `data:` 網址代表一個圖檔。',
  viewport: { width: 400, height: 500 },
  widths: [400, 1000],
  files: {
    html: `<header>
  <img id="logo" alt="小島商店" width="120" height="40"
    src="${LOGO_120}"
    srcset="${LOGO_120} 1x,
            ${LOGO_240} 2x">
</header>
<img id="photo" alt="盤子上的兩片椰子餅乾" width="400" height="200"
  src="${BISCUITS_400}"
  srcset="${BISCUITS_400} 400w,
          ${BISCUITS_800} 800w,
          ${BISCUITS_1200} 1200w"
  sizes="(min-width: 700px) 50vw, 100vw">
<p>椰子餅乾，每天下午三點出爐。</p>`,
    css: String.raw`body { margin: 0; }
header { padding: 8px 16px; }
p { margin: 8px 16px; }
#logo { display: block; }
#photo { display: block; width: 100%; height: auto; }

@media (min-width: 700px) {
  #photo { width: 50%; }
}`,
  },
  observe: [
    { check: 'attr', selector: '#logo', name: 'srcset', value: ' 2x', match: 'includes', label: '標誌的 `srcset` 用 x 描述子：`1x` 與 `2x` 各一個檔案' },
    { check: 'box', selector: '#logo', measure: 'width', value: 120, label: '不論瀏覽器用了哪一個檔案，標誌都顯示成 120px 寬' },
    { check: 'attr', selector: '#photo', name: 'srcset', value: ' 1200w', match: 'includes', label: '照片的 `srcset` 用 w 描述子，寫出每個檔案有幾個像素寬（最大的是 `1200w`）' },
    { check: 'box', selector: '#photo', measure: 'width', value: 400, label: '視窗寬 400px：CSS 讓照片佔滿視窗，寬 400px，就是 `sizes` 的預設值 `100vw` 說的寬度' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#photo', measure: 'width', value: 500, label: '視窗寬 1000px：媒體查詢把照片改成 50%，寬 500px，對應 `sizes` 第一項的 `50vw`' },
  ],
};

const picture: WebExample = {
  id: 'rwd10-picture', title: '窄視窗換一張構圖：燈塔的特寫與全景',
  description: '主視覺 `#hero` 有兩張構圖不同的圖：方形的燈塔特寫，與 3:1 的海岸全景。`<source>` 帶著條件 `(min-width: 700px)`：條件成立時用全景，不成立時用 `<img>` 自己的特寫。預覽一開始是 400px 寬。',
  viewport: { width: 400, height: 600 },
  widths: [400, 699, 700, 1000],
  files: {
    html: `<picture>
  <source media="(min-width: 700px)"
    srcset="${SHORE}">
  <img id="hero" alt="白色的燈塔站在礁岩上"
    src="${LIGHTHOUSE}">
</picture>
<p>小島燈塔，每天日落後點燈。</p>`,
    css: String.raw`body { margin: 0; }
p { margin: 8px 16px; }
#hero { display: block; width: 100%; height: auto; }`,
  },
  observe: [
    { check: 'box', selector: '#hero', measure: 'height', value: 400, label: '視窗寬 400px：`(min-width: 700px)` 不成立，顯示的是 `img` 自己的方形特寫，400 × 400' },
    { do: 'resize', width: 699, height: 800 },
    { check: 'box', selector: '#hero', measure: 'height', value: 699, label: '視窗寬 699px：只差 1px，條件仍然不成立，還是方形的特寫（699 × 699）' },
    { do: 'resize', width: 700, height: 800 },
    { check: 'box', selector: '#hero', measure: 'height', value: 233.33, label: '視窗寬 700px：條件成立，換成 `source` 的 3:1 全景，高度變成 700 ÷ 3，約 233px' },
    { check: 'count', selector: 'picture > source ~ #hero', count: 1, label: '`source` 與 `#hero` 都是 `picture` 的子元素，`img` 排在最後' },
    { check: 'attr', selector: '#hero', name: 'alt', value: '白色的燈塔站在礁岩上', label: '替代文字寫在 `img` 上：不論換成哪一張圖，都是同一段文字' },
  ],
};

const lazy: WebExample = {
  id: 'rwd10-lazy', title: '一頁裡的三個媒體：立刻載入與延遲載入',
  description: '島嶼導覽的文章頁。最上面的主圖 `#hero` 一進頁面就看得到；海岸的照片 `#shore` 與影片的嵌入框 `#clip` 在下方，都寫了 `loading="lazy"`。`#clip` 的嵌入碼帶著 `width="560" height="315"`，由 CSS 改成跟著欄位伸縮的 16:9。',
  viewport: { width: 360, height: 900 },
  widths: [360, 768],
  files: {
    html: `<main>
  <img id="hero" src="${SUNRISE_600}" alt="島嶼的日出" width="600" height="300">
  <p>從碼頭走到燈塔，大約二十分鐘。</p>
  <img id="shore" src="${SHORE}" alt="海岸的全景，左邊有一座小燈塔"
    width="1200" height="400" loading="lazy" decoding="async">
  <iframe id="clip" title="島嶼導覽影片" width="560" height="315" loading="lazy"></iframe>
</main>`,
    css: String.raw`body { margin: 0; }
main { max-width: 640px; margin: 0 auto; padding: 20px; }
p { margin: 12px 0; }
img { display: block; max-width: 100%; height: auto; }
#clip {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  margin-top: 12px;
  border: 0;
  background-color: #cfd8dc;
}`,
  },
  observe: [
    { check: 'count', selector: '#hero[loading="lazy"]', count: 0, label: '主圖 `#hero` 一進頁面就看得到，沒有 `loading="lazy"`' },
    { check: 'attr', selector: '#shore', name: 'loading', value: 'lazy', label: '下方的照片 `#shore` 有 `loading="lazy"`：捲到附近才需要下載' },
    { check: 'attr', selector: '#clip', name: 'loading', value: 'lazy', label: '`iframe` 也可以延遲載入：`#clip` 有 `loading="lazy"`' },
    { check: 'box', selector: '#clip', measure: 'height', value: 180, label: '視窗寬 360px：`#clip` 寬 320px、高 180px，不是嵌入碼寫的 560 × 315' },
    { do: 'resize', width: 768, height: 1200 },
    { check: 'box', selector: '#clip', measure: 'height', value: 360, label: '視窗寬 768px：`main` 最寬 640px，`#clip` 跟著變成 640 × 360，仍然是 16:9' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const FLUID_BASE_CSS = String.raw`body { margin: 0; padding: 20px; }
#shot { margin: 0; background-color: #f57c00; }
p { margin: 8px 0 0; }

/* 在下面替 #photo 加上樣式 */
`;

const exFluid: WebExercise = {
  id: 'rwd10-ex-fluid-photo', title: '讓照片跟著欄位縮小：不變形，也不留縫',
  statement: 'index.html 不能改。島嶼導覽的文章裡有一張照片 `#photo`，放在橘色底的 `#shot` 裡；圖檔是 600 × 300 像素，HTML 也寫了 `width="600" height="300"`。現在它在 360px 寬的視窗裡超出了頁面。請在 style.css 替 `#photo` 加上樣式，同時做到三件事：（1）照片最寬只能和 `#shot` 的內容區一樣寬，容器比照片寬的時候維持原本的 600px，不放大；（2）高度依 2:1 的比例跟著寬度改變，不變形；（3）照片下方不露出 `#shot` 的橘色，也就是 `#shot` 和照片一樣高。`body` 的 `margin` 與 `padding` 請保留。檢查會在 360px 與 1000px 兩種視窗寬度量（預覽上方的按鈕可以切換）。',
  hints: [
    '三個要求各對應一行宣告。先想第一個：「最寬只能和容器一樣寬，但不放大」是 `width` 還是 `max-width`？',
    '高度停在 300px，是因為 HTML 的 `height` 屬性；有一個值可以讓高度改由長寬比決定。下方的縫則來自行內元素的基線：換掉圖片的 `display` 就不會有。',
    '替 `#photo` 寫 `display: block;`、`max-width: 100%;` 與 `height: auto;`。',
  ],
  explanation: '`max-width: 100%` 把寬度的上限訂為容器內容區的寬度：360px 的視窗扣掉 `body` 左右各 20px 的內距是 320px，照片縮成 320px；1000px 的視窗裡容器有 960px，上限碰不到，照片維持 `width` 屬性的 600px。`height: auto` 蓋過 `height` 屬性的 300px，高度改由 2:1 的長寬比算出：320px 寬時是 160px。`display: block` 讓圖片不再是坐在文字基線上的行內元素，基線下方那一小段空間就不見了，`#shot` 的高度等於照片的高度。把 `display: block` 換成 `vertical-align: bottom` 也能消除那條縫，一樣會通過。',
  viewport: { width: 360, height: 500 },
  widths: [360, 1000],
  fixed: { html: `<figure id="shot"><img id="photo" src="${SUNRISE_600}" alt="島嶼的日出" width="600" height="300"></figure>
<p>從碼頭看出去的日出。</p>` },
  starter: { css: FLUID_BASE_CSS + String.raw`#photo {
}
` },
  solution: { css: FLUID_BASE_CSS + String.raw`#photo {
  display: block;
  max-width: 100%;
  height: auto;
}
` },
  steps: [
    { check: 'box', selector: '#photo', measure: 'width', value: 320, label: '視窗寬 360px：照片縮成容器內容區的寬度（320px）' },
    { check: 'box', selector: '#photo', measure: 'height', value: 160, label: '視窗寬 360px：高度依 2:1 的比例是 160px，沒有變形' },
    { check: 'box', selector: '#shot', measure: 'height', value: 160, label: '視窗寬 360px：`#shot` 和照片一樣高（160px），照片下方沒有露出橘色' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#photo', measure: 'width', value: 600, label: '視窗寬 1000px：照片維持原本的 600px，沒有被放大' },
    { check: 'box', selector: '#shot', measure: 'height', value: 300, label: '視窗寬 1000px：`#shot` 仍然和照片一樣高（300px）' },
  ],
  mistakes: [
    { files: { css: FLUID_BASE_CSS + String.raw`#photo {
  display: block;
  max-width: 100%;
}
` }, why: '少了 `height: auto`。`max-width` 只限制寬度：360px 的視窗裡寬度縮成 320px，高度卻還是 `height` 屬性的 300px，照片被拉長變形。只要 `<img>` 寫了 `height` 屬性，`max-width: 100%` 就要搭配 `height: auto`。' },
    { files: { css: FLUID_BASE_CSS + String.raw`#photo {
  display: block;
  width: 100%;
  height: auto;
}
` }, why: '把 `max-width` 寫成 `width`。`width: 100%` 讓照片永遠和容器一樣寬：360px 的視窗裡看起來一樣，但 1000px 的視窗裡，600 像素寬的檔案被放大成 960px，畫面會模糊。`max-width` 是上限，只在照片比容器寬時才縮小它。' },
    { files: { css: FLUID_BASE_CSS + String.raw`#photo {
  max-width: 100%;
  height: auto;
}
` }, why: '照片的大小對了，但它仍然是行內元素，坐在文字的基線上；基線下方留給字母下伸筆畫的空間，讓 `#shot` 比照片高出幾個像素，露出一條橘色。加上 `display: block`，照片就不再參與文字的排列。' },
  ],
};

const EMBED_BASE_CSS = String.raw`body { margin: 0; }
#page { max-width: 640px; margin: 0 auto; padding: 20px; }
h1 { margin: 0 0 12px; font-size: 20px; }
#clip { display: block; border: 0; background-color: #cfd8dc; }

/* 在下面讓 #clip 跟著 #page 伸縮，並維持 16:9 */
`;

const exEmbed: WebExercise = {
  id: 'rwd10-ex-embed', title: '嵌入的影片：跟著欄位伸縮的 16:9',
  statement: 'index.html 不能改。島嶼導覽的頁面嵌入了一支影片：`<iframe id="clip">` 的嵌入碼帶著 `width="560" height="315"`（這裡沒有網路，所以框裡是空的）。外層的 `#page` 最寬 640px、左右各有 20px 的內距。現在 `#clip` 固定是 560 × 315，在 360px 寬的視窗裡超出了頁面。請在 style.css 的最後替 `#clip` 加上樣式：寬度永遠等於 `#page` 內容區的寬度，高度跟著寬度維持 16:9。前面已經寫好的規則請保留。檢查會在 360px 與 1000px 兩種視窗寬度量 `#clip` 的寬與高。',
  hints: [
    '要改的有兩個方向。寬度：永遠和容器一樣寬（這次是要放大的，和照片不同）。高度：不能寫死，要由比例算出來。',
    '`aspect-ratio` 只在寬與高有一個沒有定下來的時候才有作用。這個 `iframe` 的高度現在是誰決定的？',
    '替 `#clip` 寫 `width: 100%;`、`height: auto;` 與 `aspect-ratio: 16 / 9;`。',
  ],
  explanation: '`width: 100%` 讓 `#clip` 的寬度等於 `#page` 內容區的寬度：360px 的視窗扣掉左右各 20px 的內距是 320px；1000px 的視窗裡 `#page` 被 `max-width` 限制成 640px。`height: auto` 蓋過嵌入碼的 `height="315"`，高度才會交給 `aspect-ratio: 16 / 9` 計算：320 × 9 ÷ 16 = 180px，640 × 9 ÷ 16 = 360px。嵌入框和照片不同，裡面的影片可以放大，所以用 `width` 而不是 `max-width`。把比例寫成 `560 / 315` 也是同一個比例，一樣會通過。',
  viewport: { width: 360, height: 500 },
  widths: [360, 1000],
  fixed: { html: String.raw`<main id="page">
  <h1>島嶼導覽</h1>
  <iframe id="clip" title="島嶼導覽影片" width="560" height="315"></iframe>
</main>` },
  starter: { css: EMBED_BASE_CSS },
  solution: { css: EMBED_BASE_CSS + String.raw`#clip {
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
}
` },
  steps: [
    { check: 'box', selector: '#clip', measure: 'width', value: 320, label: '視窗寬 360px：`#clip` 和 `#page` 的內容區一樣寬（320px）' },
    { check: 'box', selector: '#clip', measure: 'height', value: 180, label: '視窗寬 360px：高度是 16:9 的 180px' },
    { do: 'resize', width: 1000, height: 600 },
    { check: 'box', selector: '#clip', measure: 'width', value: 640, label: '視窗寬 1000px：`#clip` 寬 640px，填滿 `#page` 的內容區' },
    { check: 'box', selector: '#clip', measure: 'height', value: 360, label: '視窗寬 1000px：高度跟著變成 360px，仍然是 16:9' },
  ],
  mistakes: [
    { files: { css: EMBED_BASE_CSS + String.raw`#clip {
  width: 100%;
  aspect-ratio: 16 / 9;
}
` }, why: '少了 `height: auto`。嵌入碼的 `height="315"` 仍然決定高度：寬與高都定下來了，`aspect-ratio` 沒有發揮的餘地，360px 的視窗裡 `#clip` 是 320 × 315，幾乎是正方形。先用 `height: auto` 把高度交出來，比例才會生效。' },
    { files: { css: EMBED_BASE_CSS + String.raw`#clip {
  width: 100%;
  height: 180px;
}
` }, why: '把在 360px 視窗裡算出來的 180px 直接寫死。那個寬度下剛好是 16:9，但寬度一變，高度不會跟著變：1000px 的視窗裡 `#clip` 是 640 × 180，被壓成扁扁的一條。高度要由比例算出來，不是寫一個數字。' },
    { files: { css: EMBED_BASE_CSS + String.raw`#clip {
  max-width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
}
` }, why: '照著照片的寫法用了 `max-width: 100%`。窄視窗裡沒有問題，但 `max-width` 只是上限：1000px 的視窗裡 `#clip` 停在嵌入碼的 560px，沒有填滿 640px 的欄位。嵌入框要的是「永遠和欄位一樣寬」，那是 `width: 100%`。' },
  ],
};

const SIZES_CSS = String.raw`body { margin: 0; }
p { margin: 8px 16px; }

/* 這一題不替照片指定寬度：瀏覽器會用 sizes 算出的寬度顯示它 */
#photo { display: block; width: auto; height: auto; }`;
/** The product page of the sizes exercise: the three files with these descriptors, and the rest of the img tag. */
const sizesHtml = (descriptors: [string, string, string], sizes: string) => `<img id="photo" alt="盤子上的兩片椰子餅乾" width="400" height="200"
  src="${BISCUITS_400}"
  srcset="${BISCUITS_400}${descriptors[0]},
          ${BISCUITS_800}${descriptors[1]},
          ${BISCUITS_1200}${descriptors[2]}"${sizes}>
<p>椰子餅乾，每天下午三點出爐。</p>`;
const W_DESCRIPTORS: [string, string, string] = [' 400w', ' 800w', ' 1200w'];

const exSizes: WebExercise = {
  id: 'rwd10-ex-sizes', title: '替商品照補上 w 描述子與 sizes',
  statement: 'style.css 不能改。小島商店的商品頁有一張照片 `#photo`。版面的要求是：視窗小於 700px 時照片佔滿視窗的寬度，700px 以上（含 700px）佔視窗的一半。同一張照片準備了三個檔案，依序是 400、800、1200 像素寬（這裡用 `data:` 的小圖代替，每個網址開頭附近的 `width=` 後面就是檔案的寬度），已經放進 `srcset`，一行一個。可是現在不管螢幕多大、視窗多寬，瀏覽器都只會用第一個檔案，照片永遠是 400px 寬。請修改 index.html：（1）在 `srcset` 的每個網址後面、逗號之前，加上一個空白與這個檔案的 w 描述子；（2）替 `#photo` 加上 `sizes`，把版面的要求寫給瀏覽器。很長的 `data:` 網址不需要更動。這一題的 style.css 故意不替照片指定寬度（`width: auto`）：這時瀏覽器會用 `sizes` 算出的寬度顯示照片，和第三節最後的「動手試」一樣。所以檢查直接量照片的寬度，在 400px、699px、700px 與 1000px 四種視窗寬度各量一次（預覽上方的按鈕可以切換）；瀏覽器用了哪一個檔案，檢查不看。',
  hints: [
    'w 描述子寫的是檔案的事實：這個檔案有幾個像素寬。400 像素寬的檔案就是 `400w`，寫在網址的後面，中間隔一個空白。',
    '`sizes` 是一串用逗號分開的項目，瀏覽器由左到右採用第一個條件成立的；沒有條件的項目一定成立，所以只能放在最後。700px 以上照片佔視窗的一半，是幾 `vw`？其他時候佔滿，又是幾 `vw`？',
    '三個網址後面依序加上 ` 400w`、` 800w`、` 1200w`，再替 `<img>` 加上 `sizes="(min-width: 700px) 50vw, 100vw"`。',
  ],
  explanation: '原本的三個候選檔案都沒有描述子，瀏覽器把每一個都當成 `1x`；密度相同的候選只留第一個，所以永遠是 400 像素寬的那個檔案，照片也就固定是 400px 寬。加上 `400w`、`800w`、`1200w` 之後，瀏覽器知道每個檔案有多少像素；`sizes="(min-width: 700px) 50vw, 100vw"` 再告訴它照片要顯示多寬：視窗寬 700px 以上是視窗的一半，其他時候是整個視窗寬。這一頁沒有 CSS 指定照片的寬度，瀏覽器就照 `sizes` 的結果顯示：400px 與 699px 的視窗裡佔滿，700px 時是 350px，1000px 時是 500px；不論它挑了哪一個檔案，顯示的寬度都一樣。有了顯示寬度，它才算得出需要幾個像素：400px 寬、像素比 2 的手機需要 800 個，1000px 寬、像素比 1 的視窗需要 500 個。真實的頁面通常由 CSS 決定照片的寬度，這時 `sizes` 要寫得和 CSS 的結果一致。條件寫成 `(width >= 700px)`，或反過來寫成 `(width < 700px) 100vw, 50vw`，結果相同，一樣會通過。',
  viewport: { width: 400, height: 600 },
  widths: [400, 699, 700, 1000],
  fixed: { css: SIZES_CSS },
  starter: { html: sizesHtml(['', '', ''], '') },
  solution: { html: sizesHtml(W_DESCRIPTORS, '\n  sizes="(min-width: 700px) 50vw, 100vw"') },
  steps: [
    { check: 'count', selector: '#photo[srcset*="400w"][srcset*="800w"][srcset*="1200w"]', count: 1, label: '`srcset` 的三個檔案都有自己的 w 描述子：`400w`、`800w`、`1200w`' },
    { check: 'box', selector: '#photo', measure: 'width', value: 400, label: '視窗寬 400px：照片佔滿視窗，寬 400px' },
    { do: 'resize', width: 699 },
    { check: 'box', selector: '#photo', measure: 'width', value: 699, label: '視窗寬 699px：仍然佔滿視窗，寬 699px' },
    { do: 'resize', width: 700 },
    { check: 'box', selector: '#photo', measure: 'width', value: 350, label: '視窗寬 700px：照片佔視窗的一半，寬 350px' },
    { do: 'resize', width: 1000 },
    { check: 'box', selector: '#photo', measure: 'width', value: 500, label: '視窗寬 1000px：仍然是視窗的一半，寬 500px' },
  ],
  mistakes: [
    { files: { html: sizesHtml(W_DESCRIPTORS, '') }, why: '只加了 w 描述子，沒有寫 `sizes`。瀏覽器不知道照片會顯示多寬，就當成 `100vw`：任何寬度都以為照片佔滿視窗，700px 以上照片沒有變成一半。在真實的頁面上，版面由 CSS 決定，看起來不會有異狀，但瀏覽器會在寬螢幕替只佔一半的照片挑一個大一倍的檔案。用了 w 描述子，就一定要寫 `sizes`。' },
    { files: { html: sizesHtml([' 1x', ' 2x', ' 3x'], '\n  sizes="(min-width: 700px) 50vw, 100vw"') }, why: '用了 x 描述子。x 只看螢幕的像素比，不看照片在版面上佔多寬，`sizes` 在這種寫法下沒有作用：照片在每一種視窗寬度都是 400px 寬。顯示寬度會變的圖要寫每個檔案的寬度（`400w`、`800w`、`1200w`），再用 `sizes` 說明版面。' },
    { files: { html: sizesHtml(W_DESCRIPTORS, '\n  sizes="(min-width: 700px) 50%, 100%"') }, why: '`sizes` 裡寫了百分比。百分比相對於容器的寬度，而瀏覽器挑檔案的時候版面還沒有排好，不知道容器多寬，所以 `sizes` 不接受百分比：這兩項都無效，瀏覽器改用預設的 `100vw`，700px 以上照片仍然佔滿視窗。要用以視窗為準的 `vw`（或 `px`、`em`、`calc()`）。' },
    { files: { html: sizesHtml(W_DESCRIPTORS, '\n  sizes="100vw, (min-width: 700px) 50vw"') }, why: '把預設寬度寫在最前面。瀏覽器由左到右看，沒有條件的項目一定成立，所以永遠採用 `100vw`，後面的 `50vw` 完全用不到：1000px 寬的視窗裡照片是 1000px 寬，不是 500px。有條件的項目寫在前面，預設值放最後。' },
  ],
};

const PICTURE_CSS = String.raw`body { margin: 0; }
p { margin: 8px 16px; }
#hero { display: block; width: 100%; height: auto; }`;
const CAPTION = '\n<p>小島燈塔，每天日落後點燈。</p>';
const heroSource = (attrs: string) => `  <source${attrs}
    srcset="${SHORE}">`;
const heroImg = (attrs: string) => `  <img id="hero"${attrs}
    src="${LIGHTHOUSE}">`;
const HERO_ALT = ' alt="白色的燈塔站在礁岩上"';

const exPicture: WebExercise = {
  id: 'rwd10-ex-picture', title: '主視覺的藝術指導：窄視窗用特寫，寬視窗用全景',
  statement: 'style.css 不能改。島嶼導覽的首頁有一張主視覺 `#hero`，寬度永遠佔滿視窗，準備了兩張構圖不同的圖：方形的燈塔特寫（`<img>` 的 `src`），與 3:1 的海岸全景（`<source>` 的 `srcset`）。設計是：視窗小於 700px 時顯示方形特寫，700px 以上（含 700px）換成全景。現在的 index.html 已經把兩張圖都放進 `<picture>`，但任何寬度都只顯示特寫，圖片也沒有替代文字。請修改 index.html：讓 `<source>` 只在視窗寬 700px 以上時被採用（條件寫在它的 `media` 屬性），`#hero` 保留為條件不成立時顯示的圖，並替圖片加上含有「燈塔」的替代文字。兩個很長的 `data:` 網址不需要更動，只要搬動標籤、增加屬性。檢查會在 400px、699px、700px 與 1000px 四種視窗寬度量 `#hero` 的高度（預覽上方的按鈕可以切換）：方形的特寫和寬度一樣高，全景的高度是寬度的三分之一。',
  hints: [
    '先找出為什麼 `<source>` 完全沒有作用：瀏覽器讀到 `<img>` 的時候，只會看排在它前面的 `<source>`。',
    '`<source>` 沒有條件時，任何寬度都會被採用。條件寫在 `media` 屬性裡，寫法和媒體查詢括號裡的條件一樣，括號也要寫。替代文字要寫在真正顯示圖片的那個元素上。',
    '把 `<source>` 搬到 `<img>` 的前面，加上 `media="(min-width: 700px)"`；替 `<img>` 加上 `alt`，例如 `alt="白色的燈塔站在礁岩上"`。',
  ],
  explanation: '`<picture>` 裡真正顯示圖片的是 `<img>`；瀏覽器讀到它時，由上往下看排在它前面的 `<source>`，採用第一個條件成立的，都不成立就用 `<img>` 自己的 `src`。原本的 `<source>` 排在 `<img>` 後面，根本不會被看到。搬到前面並加上 `media="(min-width: 700px)"` 之後：400px 與 699px 寬時條件不成立，顯示方形的特寫，`#hero` 在 `width: 100%` 之下高度等於寬度；700px 時條件成立，換成 3:1 的全景，高度是 700 ÷ 3，約 233px，1000px 時約 333px。`alt` 寫在 `<img>` 上：不論換成哪一張圖，螢幕閱讀器讀到的都是這段文字，所以它要同時說得通兩張圖。條件寫成 `(width >= 700px)` 也可以。',
  viewport: { width: 400, height: 600 },
  widths: [400, 699, 700, 1000],
  fixed: { css: PICTURE_CSS },
  starter: { html: `<picture>\n${heroImg('')}\n${heroSource('')}\n</picture>${CAPTION}` },
  solution: { html: `<picture>\n${heroSource(' media="(min-width: 700px)"')}\n${heroImg(HERO_ALT)}\n</picture>${CAPTION}` },
  steps: [
    { check: 'box', selector: '#hero', measure: 'height', value: 400, label: '視窗寬 400px：顯示方形的特寫，`#hero` 高 400px' },
    { do: 'resize', width: 699, height: 800 },
    { check: 'box', selector: '#hero', measure: 'height', value: 699, label: '視窗寬 699px：仍然是方形的特寫，`#hero` 高 699px' },
    { do: 'resize', width: 700, height: 800 },
    { check: 'box', selector: '#hero', measure: 'height', value: 233.33, label: '視窗寬 700px：換成 3:1 的全景，`#hero` 高約 233px' },
    { do: 'resize', width: 1000, height: 800 },
    { check: 'box', selector: '#hero', measure: 'height', value: 333.33, label: '視窗寬 1000px：仍然是全景，`#hero` 高約 333px' },
    { check: 'attr', selector: '#hero', name: 'alt', value: '燈塔', match: 'includes', label: '替代文字寫在 `#hero` 上，而且提到「燈塔」' },
  ],
  mistakes: [
    { files: { html: `<picture>\n${heroSource(' media="(max-width: 700px)"')}\n${heroImg(HERO_ALT)}\n</picture>${CAPTION}` }, why: '條件的方向反了。`(max-width: 700px)` 是「700px 以下」才成立：400px 的手機拿到的是 3:1 的全景（`#hero` 只有 133px 高，燈塔小得看不清楚），寬螢幕反而顯示特寫。`min-` 讀成「至少」：700px 以上要寫 `min-width`。' },
    { files: { html: `<picture>\n${heroImg(HERO_ALT)}\n${heroSource(' media="(min-width: 700px)"')}\n</picture>${CAPTION}` }, why: '`media` 與 `alt` 都加對了，但 `<source>` 還在 `<img>` 的後面。瀏覽器只看排在 `<img>` 前面的 `<source>`，後面的不算，也不會提示錯誤：任何寬度都只顯示特寫。`<img>` 一定是 `<picture>` 裡的最後一個。' },
    { files: { html: `<picture>\n${heroSource(' media="min-width: 700px"')}\n${heroImg(HERO_ALT)}\n</picture>${CAPTION}` }, why: '`media` 的條件少了括號。`min-width: 700px` 不是合法的條件，瀏覽器把它當成永遠不成立，也不會提示錯誤，所以 700px 以上仍然是特寫。條件要和媒體查詢一樣寫在括號裡：`(min-width: 700px)`。' },
    { files: { html: `<picture alt="白色的燈塔站在礁岩上">\n${heroSource(' media="(min-width: 700px)"')}\n${heroImg('')}\n</picture>${CAPTION}` }, why: '把 `alt` 寫在 `<picture>` 上。`<picture>` 與 `<source>` 只是替 `<img>` 挑檔案的外殼，它們的 `alt` 沒有任何作用；螢幕閱讀器讀的是 `<img>` 的替代文字，圖片載入失敗時顯示的也是它。`alt` 一律寫在 `<img>` 上。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const RWD10: LessonContent = {
  lessonId: 'RWD10',
  motivation: '同一張照片，360px 寬的手機只需要幾百個像素，高解析度的大螢幕卻需要兩三倍：只準備一個檔案，不是讓手機白白下載用不到的像素，就是讓大螢幕看到模糊的圖。這一課先讓圖片跟著容器縮放而不變形，用長寬比替還沒載入的內容留好位置，再用 srcset 與 sizes 讓瀏覽器挑合適的檔案、用 picture 元素在窄視窗換一張構圖，最後讓畫面外的圖片與影片延遲載入。',
  sections: [
    {
      id: 'rwd10-fluid-section', title: '流動的圖片：不超出容器，也不變形',
      blocks: [
        { type: 'p', text: '`<img>` 預設照檔案的像素大小顯示：600 像素寬的照片放進 320px 寬的欄位，會直接撐出去，整頁跟著橫向捲動。「響應式原則與行動優先」那一課用過兩行宣告解決它：`max-width: 100%` 與 `height: auto`。這一節把這兩行各自的作用拆開來看，再補上常常被漏掉的第三行。' },
        { type: 'example', id: 'rwd10-fluid' },
        { type: 'p', text: '預覽一開始是 360px 寬，`body` 左右各有 20px 的內距，所以每個 `figure` 的內容區是 320px。三張圖是同一個 480 × 240 的檔案，差別只在 CSS：' },
        { type: 'list', items: [
          'A 只有 `max-width: 100%`：寬度縮成 320px，高度卻還是 240px，圓形的太陽被拉成直的橢圓。原因是 HTML 的 `height="240"`：瀏覽器把它當成一條優先順序最低的 `height: 240px`，而 `max-width` 只管寬度。',
          'B 多了 `height: auto`：樣式表裡的宣告蓋過 `height` 屬性，高度改由圖片的比例決定，320px 寬時是 160px，太陽變回圓形。但圖片下方露出一條橘色的縫（A 也有）。',
          'C 再加上 `display: block`：縫不見了，`figure` 和圖片一樣高。',
        ] },
        { type: 'p', text: '那條縫從哪裡來？`<img>` 預設是行內元素，和文字排在同一行，底邊對齊文字的基線（baseline）。基線下方要留一小段空間，給 g、y 這類字母往下伸的筆畫；圖片雖然沒有這種筆畫，那段空間還是算進了這一行的高度。把圖片改成 `display: block`，它就不再是一行文字的一部分。' },
        { type: 'p', text: '再按 768px：容器的內容區有 728px，比圖片寬，三張圖都是原本的 480 × 240。`max-width` 是上限，只在圖片比容器寬的時候才縮小它，不會把圖片放大。如果寫成 `width: 100%`，圖片會永遠和容器一樣寬：480 像素的檔案被拉成 728px。範例的圖是用線條與色塊畫成的，放大了也清楚；換成真實的照片，放大之後就糊了。兩種寫法各有用途：' },
        { type: 'table', head: ['寫法', '容器比圖片窄', '容器比圖片寬', '適合'], rows: [
          ['`max-width: 100%`', '縮小到容器的寬度', '維持檔案原本的大小', '文章裡的照片、插圖'],
          ['`width: 100%`', '縮小到容器的寬度', '放大到容器的寬度', '一定要填滿欄位的主視覺；檔案要準備得夠大（第三節）'],
        ] },
        { type: 'callout', tone: 'tip', title: '多數樣式表開頭都有這一條', text: '`img { display: block; max-width: 100%; height: auto; }`。三行各管一件事：不留縫、不超出容器、不變形。寫在樣式表的最前面，之後每一張圖都從這個基礎開始，個別的圖再依需要覆寫。' },
        { type: 'callout', tone: 'tip', title: '動手試：把上限改成固定', text: '按「動手改這個範例」，把 `#c` 的 `max-width: 100%` 改成 `width: 100%` 再執行。360px 時看不出差別；按 768px，C 變成 728px 寬，比上面兩張都大：它被放大了。再把 `#b` 的 `height: auto` 刪掉，回到 360px：B 和 A 一樣變形。' },
      ],
    },
    {
      id: 'rwd10-ratio-section', title: '預留空間：寬高屬性、aspect-ratio 與 object-fit',
      blocks: [
        { type: 'p', text: '圖片是另外下載的。瀏覽器先把文字排好，圖檔晚一點才到；如果它不知道圖片有多高，只能先不留位置，等檔案到了再把下面的內容往下推。讀到一半的文字突然跳走，就是網頁基礎島的效能那一課說的版面位移（layout shift）。要避免它，得讓瀏覽器在檔案抵達之前就知道圖片的長寬比（aspect ratio）：寬與高的比例。' },
        { type: 'p', text: '對 `<img>` 來說，方法是那一課建議的 `width` 與 `height` 屬性。它們寫的是檔案的像素大小（只寫數字，不加 `px`），瀏覽器用這兩個數字算出比例：`width="480" height="240"` 就是 2:1。即使 CSS 用 `max-width: 100%` 與 `height: auto` 把圖片縮成 320px 寬，瀏覽器也能在檔案到達之前先留出 320 × 160 的位置。所以在響應式的頁面裡，這兩個屬性沒有過時，反而更重要：屬性負責說出比例，CSS 負責決定實際的大小。' },
        { type: 'p', text: '有些盒子沒有檔案可以提供比例：嵌入的地圖與影片、等指令稿放進內容的區塊、要求每張卡片的封面都一樣高的版面。這時用 CSS 的 `aspect-ratio`：`aspect-ratio: 16 / 9` 的意思是「寬 16 份、高 9 份」。只要寬度已經確定、高度是 `auto`，高度就是寬度 × 9 ÷ 16。' },
        { type: 'example', id: 'rwd10-ratio' },
        { type: 'p', text: '灰色的 `.embed` 沒有寫高度。360px 的視窗裡它寬 320px，高度是 320 × 9 ÷ 16 = 180px；按 600px，寬 560px，高度跟著變成 315px。不管地圖多晚才載入，它的位置從一開始就留好了。' },
        { type: 'p', text: '下面三張縮圖想要整齊的正方形，所以替 `<img>` 寫了 `aspect-ratio: 1 / 1`：樣式表裡的比例蓋過由 `width`、`height` 屬性算出的 2:1，三個盒子都是 100 × 100。可是檔案本身仍然是 2:1。盒子與圖片的比例不同時，由 `object-fit` 決定圖片怎麼放進盒子：' },
        { type: 'table', head: ['object-fit 的值', '圖片怎麼放進盒子', '結果', '適合'], rows: [
          ['`fill`（預設）', '寬與高各自拉伸到剛好填滿', '變形：範例的太陽被壓成橢圓', '照片幾乎用不到'],
          ['`cover`', '維持比例，放大到整個盒子都蓋滿', '不變形，超出盒子的部分被裁掉', '卡片封面、頭像、主視覺'],
          ['`contain`', '維持比例，縮小到整張圖都放得進去', '不變形，盒子的上下或左右留空', '不能裁掉任何部分的圖：商品照、標誌'],
        ] },
        { type: 'p', text: '`cover` 裁掉哪一邊，由 `object-position` 決定。預設是 `50% 50%`，也就是保留正中央：範例裡太陽在照片的右側，置中裁切時被切掉一半。寫 `object-position: right`，就改成保留右邊。裁切只發生在畫面上，檔案仍然完整下載；真正需要另一張構圖時，用的是第四節的 `<picture>`。' },
        { type: 'callout', tone: 'warning', title: 'aspect-ratio 寫了卻沒有作用', text: '`aspect-ratio` 只在寬與高有一個還沒定下來的時候才有作用。最常見的情況是嵌入碼：`<iframe width="560" height="315">` 的 `height` 屬性已經把高度定成 315px，這時只加 `width: 100%` 與 `aspect-ratio: 16 / 9`，寬度變了，高度仍然是 315px。要再寫 `height: auto`，把高度交出來，比例才會生效。另外，盒子裡的文字如果比算出來的高度還高，盒子會被內容撐高，而不是把內容裁掉。' },
        { type: 'callout', tone: 'tip', title: '動手試：換一個比例，換一個裁切位置', text: '把 `.embed` 的 `aspect-ratio` 改成 `4 / 3` 再執行：320px 寬時高度變成 240px。再替 `#cover` 加上 `object-position: right`：整顆太陽回到畫面裡，被裁掉的改成左邊的小島。最後把 `.thumbs img` 的 `height: auto` 刪掉：`height="240"` 的屬性重新決定高度，三個盒子變成 100 × 240，`aspect-ratio` 失效。' },
      ],
    },
    {
      id: 'rwd10-srcset-section', title: '解析度切換：srcset 與 sizes',
      blocks: [
        { type: 'p', text: '前兩節解決的是圖片「顯示多大」，還沒有解決「下載多大」。現在的螢幕常常用好幾個實體像素畫 1 個 CSS 像素，這個倍數叫裝置像素比（device pixel ratio，常寫成 DPR）：傳統的桌機螢幕是 1，高解析度的筆電與手機常見的是 2 或 3。一張顯示成 360px 寬的照片，在像素比 2 的手機上要有 720 個像素寬才清晰，在像素比 1 的螢幕上 360 個就夠了。只給一個 1200 像素的大檔，小螢幕白白下載用不到的像素；只給 400 像素的小檔，高解析度的螢幕看到的是糊的。' },
        { type: 'p', text: '解法是替同一張圖準備幾個大小不同的檔案，把清單交給瀏覽器，讓它依自己的螢幕挑一個。這叫解析度切換（resolution switching）：每個檔案的內容完全相同，只有像素數不同。清單寫在 `<img>` 的 `srcset` 屬性，用逗號分開；每一項是「網址、空白、描述子」。描述子有兩種。' },
        { type: 'p', text: '第一種是 x 描述子，用在顯示尺寸固定的圖，例如標誌：`srcset="logo-120.png 1x, logo-240.png 2x"`。意思是像素比 1 的螢幕用第一個檔案，像素比 2 的螢幕用第二個。圖片固定顯示成 120px 寬，瀏覽器只需要知道螢幕的像素比。' },
        { type: 'p', text: '第二種是 w 描述子，用在寬度會跟著版面變的圖，要和 `sizes` 一起寫。srcset 與 sizes 各說一件事：' },
        { type: 'table', head: ['屬性', '例子', '說的是'], rows: [
          ['`srcset`（w 描述子）', '`photo-400.jpg 400w, photo-800.jpg 800w, photo-1200.jpg 1200w`', '每個檔案有幾個像素寬。這是檔案的事實，不是要顯示的寬度；單位是 `w`，不是 `px`'],
          ['`sizes`', '`(min-width: 700px) 50vw, 100vw`', '圖片在版面上會顯示成多寬。由左到右，採用第一個條件成立的項目；最後一項沒有條件，是預設值'],
        ] },
        { type: 'p', text: '為什麼作者要另外告訴瀏覽器顯示寬度？因為瀏覽器一讀到 `<img>` 就開始下載圖片，這時樣式表可能還沒下載完，版面還沒有排，它不知道這張圖最後會多寬。`sizes` 就是提前給它的答案。有了顯示寬度，乘上螢幕的像素比，就是需要的像素數：' },
        { type: 'table', head: ['視窗寬度', 'sizes 給的顯示寬度', '裝置像素比', '需要的像素', '通常會選'], rows: [
          ['360px', '`100vw` = 360px', '1', '360', '`400w`'],
          ['360px', '`100vw` = 360px', '2', '720', '`800w`'],
          ['360px', '`100vw` = 360px', '3', '1080', '`1200w`'],
          ['1000px', '`50vw` = 500px', '1', '500', '`800w`'],
          ['1000px', '`50vw` = 500px', '2', '1000', '`1200w`'],
        ] },
        { type: 'p', text: '表格的最後一欄寫的是「通常」：最後由瀏覽器決定，不是作者。規格只要求瀏覽器從清單裡挑一個，沒有規定確切的挑法；例如比較大的檔案已經在快取裡時，瀏覽器可以直接用它，不再下載小的。所以清單裡的每個檔案必須是同一張圖，也不要假設某個寬度一定會拿到某個檔案。' },
        { type: 'example', id: 'rwd10-srcset' },
        { type: 'p', text: '這座島的頁面不能連網，所以範例裡每一個很長的 `data:` 網址都代表一個圖檔，讀的時候把它當成一個檔名就好。網址裡的空白都寫成 `%20`，因為 `srcset` 用空白分開網址與描述子，網址本身不能有空白。標誌 `#logo` 用 x 描述子，照片 `#photo` 用 w 描述子加 `sizes`；兩張圖都保留了 `src`（不使用清單時的後備）、`alt`、`width` 與 `height`。' },
        { type: 'p', text: '再對照 style.css：`#photo` 的寬度是 `100%`，視窗寬 700px 以上改成 `50%`。`sizes` 的 `100vw` 與 `50vw` 描述的就是這兩條規則的結果。按 400px 與 1000px 的按鈕，照片從 400px 寬變成 500px 寬：這是 CSS 做的，`sizes` 只是把同一件事提前告訴瀏覽器。預覽裡看不出瀏覽器用了哪一個檔案：三個檔案畫的是同一張圖，資料又直接寫在網址裡，沒有東西要下載。在真實的網站上，可以打開開發者工具的 Network 面板看下載了哪一個檔案，或在主控台讀取那張圖的 `currentSrc`。' },
        { type: 'callout', tone: 'warning', title: 'sizes 不會自己跟著 CSS 更新', text: '`sizes` 只是提示，真正決定顯示寬度的是 CSS。日後版面改成三欄，忘了把 `50vw` 改成 `33vw`，瀏覽器就照舊的資訊挑檔案：挑大了浪費流量，挑小了畫面模糊，而且沒有任何錯誤訊息。另外有三種常見的寫錯：在 `sizes` 裡寫百分比（不接受，因為挑檔案的時候還不知道容器多寬；要用 `vw`、`px`、`em` 或 `calc()`）；把沒有條件的預設值寫在最前面（它一定成立，後面的項目永遠用不到）；用了 w 描述子卻沒有寫 `sizes`（瀏覽器會當成 `100vw`，圖片實際上只佔半個視窗時就挑得太大）。' },
        { type: 'callout', tone: 'tip', title: '動手試：讓 sizes 現形', text: '平常 `sizes` 不影響版面，但有一個辦法看到它。在範例的 index.html 把 `#photo` 的 `width="400" height="200"` 刪掉，再把 style.css 裡 `#photo` 的 `width: 100%;` 與整段媒體查詢刪掉，然後執行。現在沒有任何東西指定照片的寬度，瀏覽器就用 `sizes` 說的寬度顯示它：400px 的視窗裡是 400px，按 1000px 變成 500px。把 `sizes` 改成 `200px` 再執行，照片就是 200px 寬。瀏覽器是真的相信 `sizes` 的，所以它一定要和版面一致。' },
      ],
    },
    {
      id: 'rwd10-picture-section', title: '藝術指導：picture 元素',
      blocks: [
        { type: 'p', text: '解析度切換的每個檔案都是同一張圖。但有時候，窄視窗需要的是另一張圖：寬螢幕上的主視覺是 3:1 的海岸全景，直接縮到手機的寬度，畫面裡的燈塔小得看不清楚。這時應該換成一張拉近、裁成方形的特寫。依版面更換構圖，叫做藝術指導（art direction），用的是 picture 元素。' },
        { type: 'p', text: '`<picture>` 自己不顯示任何東西，它包住一個或多個 `<source>` 與一個 `<img>`。每個 `<source>` 提供一個候選的圖檔與採用它的條件，`<img>` 則是所有條件都不成立時的那張圖：' },
        { type: 'example', id: 'rwd10-picture' },
        { type: 'p', text: '預覽一開始是 400px 寬，`(min-width: 700px)` 不成立，看到的是 `<img>` 自己的方形特寫。按 699px：仍然是特寫。按 700px：條件成立，換成 3:1 的全景；1000px 也是。切回 400px，又換回特寫。瀏覽器會隨著視窗的寬度重新判斷，和媒體查詢一樣，不需要重新整理。' },
        { type: 'p', text: '`<picture>` 的規則有四條：' },
        { type: 'list', items: [
          '瀏覽器由上往下看每一個 `<source>`，採用第一個條件成立的；全部不成立，就用 `<img>` 自己的 `src`。和 CSS「寫在後面的贏」相反，這裡是排在前面的優先。',
          '`<img>` 不能省略，而且要放在最後。真正顯示圖片的是它，`<source>` 只是替它換檔案；所以 `alt`、`loading`、`id`、`class` 與所有的 CSS 都寫在 `<img>` 上。',
          '`<source>` 的圖檔寫在 `srcset`，不是 `src`。它可以只有一個網址，也可以是帶著 x 或 w 描述子的清單（用 w 描述子時同樣要加 `sizes`）：藝術指導與解析度切換可以一起用。',
          '`media` 是指示，不是提示：條件成立，瀏覽器就一定採用那個 `<source>`。這和 `srcset` 的清單不同，那裡的選擇權在瀏覽器。',
        ] },
        { type: 'p', text: '範例裡的 `<img>` 沒有寫 `width` 與 `height`，因為兩張圖的比例不同，寫哪一組都不對。真實的頁面可以替每個 `<source>` 各自寫上 `width` 與 `height`，瀏覽器會用被選中的那一組替圖片預留空間。' },
        { type: 'p', text: '`<source>` 的另一個用途是提供新的檔案格式。把 `media` 換成 `type`：`<source type="image/avif" srcset="lighthouse.avif">`，後面接一個 `type="image/webp"` 的 `<source>`，最後是 `src` 指向 JPEG 的 `<img>`。瀏覽器採用第一個自己支援的格式，不支援的直接跳過、不會下載；較新的格式在同樣的畫質下檔案通常比較小。' },
        { type: 'callout', tone: 'warning', title: 'source 放錯位置或用錯屬性，不會有任何提示', text: '三種寫錯的結果都一樣：永遠只顯示 `<img>` 的那張圖，主控台沒有錯誤。第一，`<source>` 放在 `<img>` 的後面：瀏覽器讀到 `<img>` 時只看排在它前面的 `<source>`。第二，寫成 `<source src="…">`：在 `<picture>` 裡要用 `srcset`。第三，`media` 的條件少了括號，寫成 `media="min-width: 700px"`：這不是合法的條件，永遠不成立。另外，`alt` 寫在 `<picture>` 或 `<source>` 上沒有作用，要寫在 `<img>` 上。' },
        { type: 'callout', tone: 'note', title: '同一張圖用 srcset，不同的圖用 picture', text: '只是大小不同的同一張圖，用 `srcset` 與 `sizes`，讓瀏覽器自己挑：它知道螢幕的像素比，作者不知道。構圖不同或格式不同，才用 `<picture>`。不要用好幾個帶 `media` 的 `<source>` 來做解析度切換：那等於替每一種螢幕做決定，卻只看得到視窗的寬度。' },
        { type: 'callout', tone: 'tip', title: '動手試：移動換圖的寬度', text: '把範例的 `media` 改成 `(min-width: 500px)` 再執行，然後按 699px：現在已經是全景了。再把整個 `<source>` 搬到 `<img>` 的後面：不管按哪一個寬度，都只剩特寫。' },
      ],
    },
    {
      id: 'rwd10-lazy-section', title: '延遲載入，以及跟著欄位伸縮的影片',
      blocks: [
        { type: 'p', text: '一篇長文章有二十張圖，讀者一進頁面只看得到最上面的一兩張。全部一起下載，下方那些還看不到的圖就和最重要的內容搶頻寬；讀者如果沒有往下捲，那些流量就白花了。延遲載入（lazy loading）請瀏覽器把畫面外的資源留到快要看到時才下載：在 `<img>` 或 `<iframe>` 上寫 `loading="lazy"`。網頁基礎島的效能那一課介紹過它，這裡補上和響應式版面有關的規則：' },
        { type: 'list', items: [
          '一進頁面就看得到的圖不要加，尤其是最上方的主視覺與標誌。延遲載入的意思是晚一點才下載，對這些圖只會讓最重要的內容更晚出現。',
          '延遲載入的圖一定要預留空間：寫 `width` 與 `height`，或用 CSS 給它長寬比。否則它在載入前幾乎不佔高度，讀者捲到附近時才突然撐開，把下面的內容推走，正好是第二節要避免的版面位移。',
          '`decoding="async"` 是另一個可以加在 `<img>` 上的屬性：它允許瀏覽器晚一點再解碼這張圖，不必為了等它而延後其他內容的顯示。',
        ] },
        { type: 'p', text: '影片與嵌入的內容也要跟著欄位伸縮。`<iframe>` 沒有指定尺寸時是 300 × 150，`<video>` 在影片的資料載入之前也是；影片網站提供的嵌入碼則通常寫死一組數字，例如 `width="560" height="315"`。這些尺寸都不會自己適應欄位。做法是第二節的三行宣告：`width: 100%`（嵌入框可以放大，所以不是 `max-width`）、`height: auto`（把屬性定下的高度交出來）、`aspect-ratio: 16 / 9`（由寬度算出高度）。' },
        { type: 'example', id: 'rwd10-lazy' },
        { type: 'p', text: '由上往下看 index.html 的三個媒體。主圖 `#hero` 沒有 `loading`，一進頁面就開始下載。照片 `#shore` 在下方，有 `loading="lazy"`、`decoding="async"`，也有 `width` 與 `height`：檔案是 1200 × 400，在 320px 寬的欄位裡，載入前就先留出 320 × 107 的位置。`#clip` 是影片的嵌入框：這裡沒有網路，所以它沒有 `src`，只是一個灰色的空框；真實的頁面會把 `src` 指向影片網站的播放器。' },
        { type: 'p', text: '按 360px：`#clip` 寬 320px、高 180px，而不是嵌入碼的 560 × 315。按 768px：`main` 被 `max-width` 限制成 640px，`#clip` 跟著變成 640 × 360。延遲載入的效果在預覽裡看不出來，因為圖片的資料就寫在網址裡，沒有東西要下載；在真實的網站上，打開開發者工具的 Network 面板再慢慢往下捲，會看到圖檔在接近視窗時才一個一個出現。' },
        { type: 'callout', tone: 'warning', title: '把 loading="lazy" 加在每一張圖上', text: '「全部延遲載入比較快」是常見的誤解，會同時犯兩個錯。第一，最上方的主圖也被延後，頁面最重要的內容反而最晚出現。第二，為了省事整批加上，卻沒有替這些圖寫尺寸，讀者往下捲時版面一路跳動。判斷的方法很簡單：一開始就在視窗裡的圖不加；要往下捲才看得到的圖才加，而且每一張都有 `width` 與 `height`。' },
        { type: 'callout', tone: 'tip', title: '動手試：拿掉 height: auto', text: '把範例裡 `#clip` 的 `height: auto;` 刪掉再執行。360px 的視窗裡，嵌入框變成 320 × 315：寬度跟著欄位，高度卻回到嵌入碼的 315px，幾乎是正方形，`aspect-ratio` 完全沒有作用。這是替嵌入內容做響應式時最常漏掉的一行。' },
      ],
    },
    {
      id: 'rwd10-checklist-section', title: '整理：圖片與媒體的對照表',
      blocks: [
        { type: 'p', text: '把這一課排成一張對照表。拿到一張圖、一支影片或一個嵌入框時，從上往下問：' },
        { type: 'table', head: ['要解決的問題', '用什麼', '要記得'], rows: [
          ['圖片比容器寬，撐出頁面', '`max-width: 100%` 與 `height: auto`', '加上 `display: block` 去掉下方的縫'],
          ['圖片載入時，下面的內容被推走', '`<img>` 的 `width` 與 `height` 屬性；沒有檔案的盒子用 `aspect-ratio`', '屬性寫檔案的像素大小，不加單位'],
          ['盒子與圖片的比例不同', '`object-fit: cover` 或 `contain`，加上 `object-position`', '預設的 `fill` 會讓圖片變形'],
          ['同一張圖，不同的螢幕需要不同的像素數', '`srcset`：固定大小的圖用 x 描述子，寬度會變的圖用 w 描述子加 `sizes`', '`sizes` 要和 CSS 的版面一致；選擇權在瀏覽器'],
          ['不同的寬度需要不同的構圖，或要提供新的格式', '`<picture>` 加上帶 `media` 或 `type` 的 `<source>`', '`<source>` 在前、`<img>` 在最後；`alt` 寫在 `<img>`'],
          ['畫面外的圖片與嵌入框', '`loading="lazy"`', '主視覺不加；延遲載入的圖要有尺寸'],
          ['影片與嵌入的內容', '`width: 100%`、`height: auto`、`aspect-ratio`', '少了 `height: auto`，比例不會生效'],
        ] },
        { type: 'p', text: '一張寫完整的內文照片，屬性大致是這些：`src`（後備的檔案）、`srcset` 與 `sizes`（幾個大小不同的檔案，以及圖片在版面上的寬度）、`alt`（替代文字）、`width` 與 `height`（檔案的像素大小，讓瀏覽器預留空間）、`loading="lazy"` 與 `decoding="async"`（只給一開始看不到的圖）。CSS 只需要第一節的那三行。不是每張圖都需要全部：小圖示不需要 `srcset`，主視覺不要 `loading="lazy"`。' },
        { type: 'p', text: '測試圖片時，除了切換寬度，還要換像素比。開發者工具的裝置模擬可以指定像素比，搭配 Network 面板，就能看到同一個頁面在像素比 1 與像素比 2 的螢幕上各下載了哪一個檔案；也記得把網路調慢，看圖片還沒到的時候版面有沒有先留好位置。想在更多寬度下觀察一個頁面，可以到互動實驗島的 Responsive Layout Simulator 拖動寬度。' },
        { type: 'p', text: '圖片與媒體處理好之後，頁面上還有兩種元件到了窄螢幕特別容易出問題：連結很多的主導覽，與欄位很多的表格。下一課「響應式導覽與表格」處理它們。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'rwd10-q1', prompt: '`figure` 有橘色的背景，裡面只有一張圖片。圖片的寬與高都正確，但它的下方露出幾個像素高的橘色。最可能的原因與修法是什麼？',
      code: { language: 'CSS', text: 'figure { margin: 0; background-color: orange; }\nimg { max-width: 100%; height: auto; }' },
      options: [
        '`figure` 有瀏覽器預設的內距，要替它加上 `padding: 0`',
        '`height: auto` 算出的高度有小數，要改成固定的 `height`',
        '圖片是行內元素，底邊對齊文字的基線，基線下方留了空間；替圖片加上 `display: block`',
        '`max-width: 100%` 讓圖片比 `figure` 矮了一點，要改成 `width: 100%`',
      ],
      answer: 2,
      explanation: '`<img>` 預設是行內元素，底邊對齊文字的基線；基線下方留給字母下伸筆畫的空間，仍然算在這一行的高度裡，所以 `figure` 比圖片高出幾個像素。`display: block` 讓圖片不再是一行文字的一部分，縫就消失。`figure` 的預設樣式是外距，不是內距，而且這裡已經設成 0；`height: auto` 與 `max-width` 管的是圖片自己的大小，題目說圖片的寬高都正確，問題不在它們。',
    },
    {
      id: 'rwd10-q2', prompt: '樣式表有 `img { max-width: 100%; height: auto; }`，這張圖放在 400px 寬的容器裡。圖檔還沒下載完的時候，瀏覽器替它留了多大的位置？',
      code: { language: 'HTML', text: '<img src="harbor.jpg" alt="港口的早晨" width="800" height="400">' },
      options: [
        '400 × 200：寬度被 CSS 限制成 400px，高度用兩個屬性算出的 2:1 決定',
        '800 × 400：屬性寫多少就留多少，檔案下載完才套用 CSS',
        '不留位置：要等檔案下載完，才知道圖片的比例',
        '400 × 400：`max-width` 只改寬度，高度仍然是屬性的 400px',
      ],
      answer: 0,
      explanation: '瀏覽器用 `width="800"` 與 `height="400"` 算出 2:1 的長寬比，不需要等檔案。`max-width: 100%` 把寬度限制成容器的 400px，`height: auto` 讓高度由比例決定，所以先留出 400 × 200，圖片到了也不會推動下面的內容。CSS 不必等圖檔，隨時都套用；「不留位置」是沒有寫這兩個屬性時的情形；400 × 400 則是少了 `height: auto` 時的結果，那時圖片還會變形。',
    },
    {
      id: 'rwd10-q3', prompt: '影片的嵌入碼如下，樣式表只有這一條規則。在 320px 寬的容器裡，這個 `iframe` 的大小是多少？',
      code: { language: 'HTML', text: '<iframe title="導覽影片" width="560" height="315"></iframe>\n\n<style>\n  iframe { width: 100%; aspect-ratio: 16 / 9; }\n</style>' },
      options: [
        '320 × 180：`aspect-ratio` 依寬度算出高度',
        '560 × 315：HTML 的屬性優先於 CSS',
        '320 × 150：`iframe` 的預設高度是 150px',
        '320 × 315：寬度被 CSS 改了，高度仍然由 `height` 屬性決定',
      ],
      answer: 3,
      explanation: '`width: 100%` 蓋過 `width` 屬性，寬度變成 320px；但沒有任何宣告改變高度，`height="315"` 仍然有效。寬與高都定下來時，`aspect-ratio` 沒有作用，結果是 320 × 315。要得到 320 × 180，必須再加上 `height: auto`。屬性的優先順序低於樣式表，不會反過來蓋過 CSS；150px 是完全沒有指定高度時的預設值，這裡有 `height` 屬性。',
    },
    {
      id: 'rwd10-q4', prompt: '一張 600 × 300 的照片要放進 200 × 200 的頭像框：框要填滿，照片不能變形，多出來的部分可以裁掉。該替 `<img>` 寫哪一個宣告？',
      options: [
        '`object-fit: fill`',
        '`object-fit: cover`',
        '`object-fit: contain`',
        '`object-position: center`',
      ],
      answer: 1,
      explanation: '`cover` 維持照片的比例，放大到整個盒子都蓋滿，超出的部分裁掉：正是題目要的三件事。`fill` 是預設值，會把 2:1 的照片壓成正方形而變形。`contain` 不變形也不裁切，但 2:1 的照片放進正方形會在上下留空，框沒有填滿。`object-position` 只決定圖片在盒子裡對齊哪裡，不改變放進盒子的方式；單獨寫它，照片仍然是預設的 `fill`。',
    },
    {
      id: 'rwd10-q5', prompt: '視窗寬 800px，螢幕的裝置像素比是 2。哪一個檔案的像素數最符合這張圖的需要？',
      code: { language: 'HTML', text: '<img src="cake-400.jpg" alt="鳳梨蛋糕"\n  srcset="cake-400.jpg 400w, cake-800.jpg 800w, cake-1600.jpg 1600w"\n  sizes="(min-width: 700px) 50vw, 100vw">' },
      options: [
        '`cake-400.jpg`：`50vw` 是 400px，所以需要 400 個像素寬的檔案',
        '`cake-1600.jpg`：視窗寬 800px，乘上像素比 2',
        '由 `src` 決定：`srcset` 只在 `src` 載入失敗時才使用',
        '`cake-800.jpg`：顯示寬度是 400px，乘上像素比 2，需要 800 個像素',
      ],
      answer: 3,
      explanation: '視窗寬 800px 時 `(min-width: 700px)` 成立，顯示寬度是 `50vw`，也就是 400px。像素比 2 的螢幕用 2 個實體像素畫 1 個 CSS 像素，所以需要 400 × 2 = 800 個像素，`800w` 剛好符合。選 `cake-400.jpg` 是忘了乘上像素比，畫面會模糊；選 `cake-1600.jpg` 是拿視窗的寬度來算，忽略了 `sizes` 說圖片只佔一半。`src` 是瀏覽器不使用清單時的後備，不是優先的選擇。',
    },
    {
      id: 'rwd10-q6', prompt: '視窗寬 1000px 時，瀏覽器顯示哪一張圖？',
      code: { language: 'HTML', text: '<picture>\n  <source media="(min-width: 900px)" srcset="wide.jpg">\n  <source media="(min-width: 600px)" srcset="medium.jpg">\n  <img src="small.jpg" alt="島嶼的海岸">\n</picture>' },
      options: [
        '`wide.jpg`：由上往下，第一個條件成立的 `source` 就被採用',
        '`medium.jpg`：兩個條件都成立時，寫在後面的蓋過前面的',
        '`small.jpg`：`img` 自己的 `src` 優先於 `source`',
        '`wide.jpg` 與 `medium.jpg` 都會下載，再由 CSS 決定顯示哪一張',
      ],
      answer: 0,
      explanation: '1000px 寬時兩個 `media` 條件都成立，但 `<picture>` 的規則是由上往下、採用第一個成立的 `<source>`，所以是 `wide.jpg`，後面的不再考慮，也不會下載。「寫在後面的贏」是 CSS 規則之間的比法，不適用在這裡；也因此比較寬的條件要放在前面。`<img>` 的 `src` 只在所有 `<source>` 都不成立時才使用。',
    },
    {
      id: 'rwd10-q7', prompt: '同一張商品照有 400、800、1200 像素寬的三個檔案，構圖完全相同，只是大小不同。頁面上這張照片的寬度會隨視窗改變。最適合的寫法是哪一個？',
      options: [
        '用 `<picture>`，替三個檔案各寫一個帶 `media` 條件的 `<source>`',
        '在 `<img>` 的 `srcset` 列出三個檔案與各自的 w 描述子，再用 `sizes` 說明顯示寬度',
        '只放 1200 像素寬的檔案，靠 `max-width: 100%` 讓它在小螢幕上縮小',
        '在 `srcset` 用 `1x`、`2x`、`3x` 標示三個檔案，不寫 `sizes`',
      ],
      answer: 1,
      explanation: '內容相同、只有像素數不同，是解析度切換：用 w 描述子告訴瀏覽器每個檔案多大，用 `sizes` 告訴它圖片顯示多寬，讓它依螢幕的像素比自己挑。`<picture>` 加 `media` 是替不同的構圖準備的，條件只看得到視窗的寬度，看不到像素比。只放大檔案，畫面雖然清楚，小螢幕卻要下載用不到的像素。x 描述子只看像素比，適合顯示尺寸固定的圖；這張照片的寬度會變，同一個螢幕在不同寬度下需要的檔案並不相同。',
    },
    {
      id: 'rwd10-q8', prompt: '文章下方有一張寫了 `loading="lazy"` 的圖片，沒有寫 `width` 與 `height`，樣式表也沒有替它設定尺寸或長寬比。讀者往下捲的時候，最可能發生什麼事？',
      options: [
        '瀏覽器發現缺少尺寸，自動改成一進頁面就載入這張圖',
        '圖片先以預設的 300 × 150 顯示，載入後再換成正確的大小',
        '圖片載入前幾乎不佔高度，載入的那一刻把下面的內容往下推，造成版面位移',
        '圖片永遠不會載入，因為瀏覽器無法判斷它離視窗多遠',
      ],
      answer: 2,
      explanation: '沒有尺寸也沒有長寬比，瀏覽器在檔案抵達之前不知道圖片多高，只能先不留位置；讀者捲到附近時圖片才下載，載入後突然撐開，下面的內容被推走。延遲載入的圖因此一定要寫 `width` 與 `height`。瀏覽器不會因為缺少尺寸就取消延遲載入，圖片接近視窗時也仍然會載入。300 × 150 是 `<iframe>` 與 `<video>` 沒有指定尺寸時的預設大小，不是 `<img>` 的。',
    },
  ],
  webCode: {
    examples: [fluid, ratio, srcset, picture, lazy],
    exercises: [exFluid, exEmbed, exSizes, exPicture],
  },
};
