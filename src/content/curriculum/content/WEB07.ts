import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB07 positioning and stacking order (WEB-2). A web-code lesson with HTML and CSS only: every example is a page of
 * coloured boxes with explicit pixel sizes and `body { margin: 0; }`, and its stated facts (where a box ended up, what
 * is drawn on top at a box's centre, where a box is after a scroll) are checked in Chromium. The exercises give the HTML
 * and let the learner edit the style sheet; they are judged on positions (`box`, also from the viewport after a
 * `scroll`), on what is on top (`hit`) and on computed `position` / `z-index`. No measurement depends on the width of a
 * scrolling page (a classic scrollbar would change it) or on how text renders.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const relative: WebExample = {
  id: 'web07-relative', title: 'static 與 relative：位移不影響別人',
  description: '三個 160 × 50 的盒子依序往下排。A 沒有寫 `position`（也就是 `static`）卻寫了 `top` 與 `left`；B 是 `position: relative`，往下 20px、往右 40px；C 什麼都沒寫。',
  files: {
    html: String.raw`<div class="box" id="a">A：static</div>
<div class="box" id="b">B：relative</div>
<div class="box" id="c">C：static</div>`,
    css: String.raw`body { margin: 0; }
.box { width: 160px; height: 50px; }
#a { background-color: #bbdefb; top: 30px; left: 30px; }
#b { background-color: #ffe082; position: relative; top: 20px; left: 40px; }
#c { background-color: #c8e6c9; }`,
  },
  observe: [
    { check: 'style', selector: '#a', property: 'position', value: 'static', label: 'A 沒有寫 `position`，計算後的值是預設的 `static`' },
    { check: 'box', selector: '#a', measure: 'top', value: 0, label: 'A 寫了 `top: 30px`，上邊仍在頁面頂端（0px）：位移對 `static` 沒有作用' },
    { check: 'box', selector: '#b', measure: 'top', value: 70, label: 'B 的上邊在 70px：原本的 50px 再往下 20px' },
    { check: 'box', selector: '#b', measure: 'left', value: 40, label: 'B 的左邊在 40px：`left: 40px` 讓它往右移' },
    { check: 'box', selector: '#c', measure: 'top', value: 100, label: 'C 的上邊仍在 100px：B 原本佔的位置被保留，C 沒有跟著移動' },
  ],
};

const absolute: WebExample = {
  id: 'web07-absolute', title: '同一個徽章，兩種包含區塊',
  description: '兩張新書卡片各有一個 `position: absolute; top: 8px; right: 8px` 的徽章，樣式完全相同。差別只有一行：第一張卡片 `#with` 是 `position: relative`，第二張 `#without` 沒有定位。',
  files: {
    html: String.raw`<article class="card" id="with">
  <span class="badge">新書</span>
  <h2>海邊的植物</h2>
</article>
<article class="card" id="without">
  <span class="badge">新書</span>
  <h2>潮間帶散步</h2>
</article>`,
    css: String.raw`body { margin: 0; }
.card {
  width: 220px; height: 70px;
  margin: 50px 0 0 20px;
  border: 4px solid #1565c0;
}
.card h2 { margin: 8px; font-size: 18px; }
#with { position: relative; }
.badge {
  position: absolute; top: 8px; right: 8px;
  width: 48px; height: 24px;
  background-color: #ffb300;
  font-size: 14px; line-height: 24px; text-align: center;
}`,
  },
  observe: [
    { check: 'box', selector: '#with .badge', measure: 'top', value: 12, from: '#with', label: '第一張卡片的徽章：上邊在卡片外緣往下 12px，也就是邊框 4px 加上 `top: 8px`' },
    { check: 'box', selector: '#with .badge', measure: 'right', value: 216, from: '#with', label: '它的右邊在卡片左緣往右 216px：卡片連邊框寬 228px，扣掉邊框 4px 與 `right: 8px`' },
    { check: 'style', selector: '#without', property: 'position', value: 'static', label: '第二張卡片沒有寫 `position`，是 `static`，不能當包含區塊' },
    { check: 'box', selector: '#without .badge', measure: 'top', value: 8, label: '第二張卡片的徽章：上邊距離頁面頂端 8px，它以整個頁面的左上角為基準' },
    { check: 'box', selector: '#without .badge', measure: 'top', value: -170, from: '#without', label: '也就是說，它在自己那張卡片的上方 170px，根本不在卡片裡' },
  ],
};

const fixedHeader: WebExample = {
  id: 'web07-fixed', title: 'fixed：釘在視窗上的頁首',
  description: '小島圖書館的頁首是 `position: fixed`，高 48px；`main` 用 `padding-top: 48px` 把內容往下讓。頁面很長，請在預覽裡往下捲動。',
  height: 240,
  files: {
    html: String.raw`<header id="bar">小島圖書館</header>
<main>
  <p id="first">本週六提早在 15:00 閉館。</p>
  <p>往下捲動，頁首會一直留在上面。</p>
  <div class="filler"></div>
</main>`,
    css: String.raw`body { margin: 0; }
#bar {
  position: fixed; top: 0; left: 0; right: 0;
  height: 48px; padding-left: 16px; line-height: 48px;
  background-color: #1565c0; color: #ffffff;
}
main { padding-top: 48px; }
p { height: 40px; margin: 0; padding-left: 16px; line-height: 40px; }
#first { background-color: #fff3e0; }
.filler { height: 1200px; background-color: #eeeeee; }`,
  },
  observe: [
    { check: 'style', selector: '#bar', property: 'position', value: 'fixed', label: '頁首的 `position` 是 `fixed`' },
    { check: 'box', selector: '#first', measure: 'top', value: 48, label: '`main` 有 `padding-top: 48px`：第一段從 48px 開始，剛好接在頁首下緣' },
    { check: 'hit', selector: '#first', top: '#first', label: '在第一段的中心點上，畫在最上面的是第一段自己：它沒有被頁首蓋住' },
    { do: 'scroll', selector: ':page', top: 500 },
    { check: 'box', selector: '#bar', measure: 'top', value: 0, from: ':viewport', label: '頁面往下捲 500px 之後，頁首的上邊仍在視窗頂端（0px）' },
    { check: 'box', selector: '#first', measure: 'bottom', value: -412, from: ':viewport', label: '第一段則跟著頁面捲走：它的下邊已經在視窗頂端上方 412px' },
  ],
};

const sticky: WebExample = {
  id: 'web07-sticky', title: 'sticky：捲到頂端才黏住的標題',
  description: '藍色橫幅下面有兩個區段，各有一個 `position: sticky; top: 0` 的黃色標題。請在預覽裡慢慢往下捲，看標題什麼時候開始黏住、什麼時候被帶走。',
  height: 240,
  files: {
    html: String.raw`<div id="banner">小島圖書館　新書通報</div>
<section id="s1">
  <h2 id="t1">A 區：自然</h2>
  <div class="list"></div>
</section>
<section id="s2">
  <h2 id="t2">B 區：歷史</h2>
  <div class="list"></div>
</section>`,
    css: String.raw`body { margin: 0; }
#banner {
  height: 60px; padding-left: 16px; line-height: 60px;
  background-color: #1565c0; color: #ffffff;
}
h2 {
  position: sticky; top: 0;
  height: 32px; margin: 0; padding-left: 16px;
  font-size: 16px; line-height: 32px;
  background-color: #ffe082;
}
.list { height: 300px; background-color: #f5f5f5; }
#s2 .list { height: 800px; background-color: #e8f5e9; }`,
  },
  observe: [
    { check: 'box', selector: '#t1', measure: 'top', value: 60, label: '還沒捲動時，A 區的標題排在橫幅下面（上邊 60px），和一般區塊一樣佔著位置' },
    { do: 'scroll', selector: ':page', top: 200 },
    { check: 'box', selector: '#t1', measure: 'top', value: 0, from: ':viewport', label: '頁面往下捲 200px：A 區的標題黏在視窗頂端（0px），沒有跟著捲走' },
    { do: 'scroll', selector: ':page', top: 600 },
    { check: 'box', selector: '#t2', measure: 'top', value: 0, from: ':viewport', label: '捲到 600px：現在黏在視窗頂端的是 B 區的標題' },
    { check: 'box', selector: '#t1', measure: 'bottom', value: -208, from: ':viewport', label: 'A 區的標題沒有留下來：它不能離開父元素 `#s1`，已經跟著 `#s1` 捲到視窗上方 208px' },
  ],
};

const stackingOrder: WebExample = {
  id: 'web07-stacking-order', title: '誰在上面：原始碼順序與 z-index',
  description: '三組互相重疊的色塊，每一組都是藍色的 1 寫在前面、橘色的 2 寫在後面。第一組都沒有 `z-index`；第二組的 1 加了 `z-index: 1`；第三組的 1 寫了 `z-index: 99`，卻是沒有定位的 `static`。',
  files: {
    html: String.raw`<div class="group" id="g1">
  <div class="sheet first">1</div>
  <div class="sheet second">2</div>
</div>
<div class="group" id="g2">
  <div class="sheet first">1：z-index 1</div>
  <div class="sheet second">2</div>
</div>
<div class="group" id="g3">
  <div class="sheet first">1：沒有定位</div>
  <div class="sheet second">2</div>
</div>`,
    css: String.raw`body { margin: 0; }
.group { position: relative; height: 90px; margin: 10px; }
.sheet {
  position: absolute; width: 120px; height: 60px;
  font-size: 13px; line-height: 18px; text-indent: 6px;
}
.first { left: 0; top: 0; background-color: #90caf9; }
.second { left: 30px; top: 20px; background-color: #ffcc80; }
#g2 .first { z-index: 1; }
#g3 .first { position: static; z-index: 99; }`,
  },
  observe: [
    { check: 'hit', selector: '#g1 .first', top: '#g1 .second', label: '第一組：兩張都是定位元素、都沒有 `z-index`，在 1 的中心點上畫在最上面的是後寫的 2' },
    { check: 'hit', selector: '#g2 .second', top: '#g2 .first', label: '第二組：1 有 `z-index: 1`，在 2 的中心點上畫在最上面的變成 1' },
    { check: 'style', selector: '#g3 .first', property: 'position', value: 'static', label: '第三組的 1 是 `static`（沒有定位）' },
    { check: 'hit', selector: '#g3 .first', top: '#g3 .second', label: '第三組：1 寫了 `z-index: 99` 也沒有用，在它的中心點上畫在最上面的仍是 2' },
  ],
};

const stackingContext: WebExample = {
  id: 'web07-stacking-context', title: '被關在堆疊環境裡的 z-index 9999',
  description: '上下兩組卡片。紅色提示框是藍色卡片的子元素，往下伸進橘色卡片的範圍，兩個提示框都寫了 `z-index: 9999`。差別只有一行：卡片 A 有 `z-index: 1`，卡片 C 沒有 `z-index`。',
  files: {
    html: String.raw`<div class="card" id="a">卡片 A：z-index 1
  <div class="tip" id="tip1">提示：z-index 9999</div>
</div>
<div class="card" id="b">卡片 B：z-index 2</div>
<div class="card" id="c">卡片 C：沒有 z-index
  <div class="tip" id="tip2">提示：z-index 9999</div>
</div>
<div class="card" id="d">卡片 D：z-index 2</div>`,
    css: String.raw`body { margin: 0; }
.card {
  position: relative; width: 270px; height: 60px;
  margin-left: 10px; font-size: 14px;
}
#a, #c { background-color: #bbdefb; }
#b, #d { z-index: 2; background-color: #ffe0b2; }
#a { z-index: 1; }
#c { margin-top: 30px; }
.tip {
  position: absolute; left: 130px; top: 40px;
  width: 130px; height: 48px; z-index: 9999;
  background-color: #c62828; color: #ffffff;
}`,
  },
  observe: [
    { check: 'style', selector: '#tip1', property: 'z-index', value: '9999', label: '卡片 A 裡的提示框是定位元素，`z-index` 是 9999' },
    { check: 'hit', selector: '#tip1', top: '#b', label: '但在它的中心點上，畫在最上面的是 `z-index` 只有 2 的卡片 B' },
    { check: 'style', selector: '#c', property: 'z-index', value: 'auto', label: '卡片 C 有定位但沒有寫 `z-index`（計算值是 `auto`），沒有建立堆疊環境' },
    { check: 'hit', selector: '#tip2', top: '#tip2', label: '卡片 C 裡的提示框就畫在卡片 D 的上面：在它的中心點上，最上面的是提示框自己' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const POSITIONED = ['relative', 'absolute', 'sticky', 'fixed'];

const BADGE_HTML = String.raw`<h1>新書通報</h1>
<article class="card" id="card">
  <span class="badge" id="badge">新書</span>
  <h2>海邊的植物</h2>
  <p>認識島上常見的二十種海濱植物。</p>
</article>`;
const badgeCss = (card: string, badge: string) => `body { margin: 0; }
h1 { height: 40px; margin: 0 0 20px 20px; font-size: 24px; line-height: 40px; }
.card {
  width: 240px; height: 110px;
  margin-left: 20px;
  background-color: #e3f2fd;${card}
}
.card h2 { margin: 0; padding: 12px 12px 0; font-size: 18px; }
.card p { margin: 0; padding: 8px 12px; font-size: 14px; }
.badge {
${badge}
  width: 48px; height: 24px;
  background-color: #ffb300;
  font-size: 14px; line-height: 24px; text-align: center;
}`;
const BADGE_ABSOLUTE = '  position: absolute;\n  top: 8px;\n  right: 8px;';

const exBadge: WebExercise = {
  id: 'web07-ex-badge', title: '把徽章釘回卡片的右上角',
  statement: '新書卡片 `#card` 裡的徽章 `#badge` 已經寫好 `position: absolute; top: 8px; right: 8px;`，卻跑到整個頁面的右上角。請只改 style.css，讓徽章以卡片為包含區塊：徽章的上邊在卡片上邊往下 8px，右邊在卡片右邊往內 8px。卡片本身要留在原來的位置（上邊距離頁面頂端 60px），徽章維持 `position: absolute`，`body { margin: 0; }` 也請保留。',
  hints: [
    '徽章的位移是以它的包含區塊為準。往上找它的祖先：`#card`、`body`、`html`，現在有哪一個是定位元素？',
    '徽章的規則一行都不用改，要改的是卡片：讓卡片變成定位元素，但不要讓它移動。',
    '在 `.card` 的規則裡加一條 `position: relative;`，不寫 `top`、`left`。卡片會留在原位，並成為徽章的包含區塊。',
  ],
  explanation: '絕對定位的盒子以「最近的定位祖先」為包含區塊。原本卡片是 `static`，一路往上都找不到定位祖先，徽章只好以整個頁面的左上角為基準，所以出現在頁面的右上角。替卡片加上 `position: relative` 而不寫位移，卡片一步都不會動，卻成了徽章的包含區塊：`top: 8px; right: 8px;` 從此是從卡片的邊緣算起，卡片搬到哪裡，徽章就跟到哪裡。',
  fixed: { html: BADGE_HTML },
  starter: { css: badgeCss('', BADGE_ABSOLUTE) },
  solution: { css: badgeCss('\n  position: relative;', BADGE_ABSOLUTE) },
  steps: [
    { check: 'style', selector: '#card', property: 'position', value: POSITIONED, label: '卡片 `#card` 是定位元素（`position` 不是預設的 `static`）' },
    { check: 'style', selector: '#badge', property: 'position', value: 'absolute', label: '徽章 `#badge` 仍然是 `position: absolute`' },
    { check: 'box', selector: '#badge', measure: 'top', value: 8, from: '#card', label: '徽章的上邊在卡片上邊往下 8px' },
    { check: 'box', selector: '#badge', measure: 'right', value: 232, from: '#card', label: '徽章的右邊在卡片右邊往內 8px（卡片寬 240px，所以離卡片左邊 232px）' },
    { check: 'box', selector: '#card', measure: 'top', value: 60, label: '卡片留在原來的位置：上邊距離頁面頂端 60px' },
  ],
  mistakes: [
    { files: { css: badgeCss('', '  position: relative;\n  top: 8px;\n  right: 8px;') }, why: '把徽章自己從 `absolute` 改成 `relative`。`relative` 的位移是以「自己原本的位置」為準，徽章只會從標題前面的原位往下、往左各挪 8px；而且它變回行內的盒子，`width` 與 `height` 也不再生效。要改的不是徽章，是它的祖先。' },
    { files: { css: badgeCss('', '  position: absolute;\n  top: 68px;\n  left: 204px;') }, why: '卡片沒有定位，改用頁面座標把徽章「算」到卡片的角落（上 68px、左 204px）。現在看起來位置正確，但徽章的包含區塊仍是整個頁面：只要卡片上方多一行公告，或卡片換了寬度，徽章就會留在原地、和卡片分家。' },
  ],
};

const LABEL_HTML = String.raw`<div id="label">本月推薦</div>
<article id="card">
  <span id="badge">新書</span>
  <h2>潮間帶散步</h2>
  <p>退潮後的礁岩上住了哪些生物。</p>
</article>`;
const labelCss = (label: string) => `body { margin: 0; }
#label {
  width: 120px; height: 32px;
  margin: 20px 0 0 40px;
  background-color: #c62828; color: #ffffff;
  font-size: 14px; line-height: 32px; text-align: center;
${label}
}
#card {
  position: relative; top: -24px;
  width: 280px; height: 120px;
  margin-left: 20px;
  background-color: #e3f2fd;
}
#card h2 { margin: 0; padding: 36px 12px 0; font-size: 18px; }
#card p { margin: 0; padding: 8px 12px; font-size: 14px; }
#badge {
  position: absolute; top: 8px; right: 8px;
  width: 48px; height: 24px;
  background-color: #ffb300;
  font-size: 14px; line-height: 24px; text-align: center;
}`;

const exLabel: WebExercise = {
  id: 'web07-ex-label', title: '讓 z-index 生效：標籤壓在卡片上',
  statement: '紅色的「本月推薦」標籤 `#label` 應該壓在卡片 `#card` 的上緣。卡片是 `position: relative`，並用 `top: -24px` 往上移了 24px；樣式表也替標籤寫了 `z-index: 5`，但標籤的下半部還是被卡片蓋住。請修改 style.css，讓標籤畫在卡片上面。標籤與卡片都要留在原來的位置（標籤的上邊距離頁面頂端 20px，卡片的上邊 28px），卡片維持 `position: relative`，`body { margin: 0; }` 保留。',
  hints: [
    '`z-index: 5` 已經寫了，為什麼沒有作用？回想 `z-index` 只對哪一種元素有效，再看看 `#label` 的 `position` 是什麼。',
    '標籤的位置不需要動，只需要讓它「成為定位元素」。哪一個 `position` 的值不寫位移時，盒子會留在原位、也不離開一般排版流？',
    '在 `#label` 的規則裡加上 `position: relative;`，`z-index: 5` 留著。',
  ],
  explanation: '`z-index` 只對定位元素有效。標籤原本是 `static`，`z-index: 5` 形同沒寫；卡片是定位元素，定位元素本來就畫在沒有定位的內容上面，所以蓋住了標籤。替標籤加上 `position: relative`（不寫位移，位置完全不變）之後，它的 `z-index: 5` 開始生效，比沒有寫 `z-index` 的卡片高，就畫到上面了。',
  fixed: { html: LABEL_HTML },
  starter: { css: labelCss('  z-index: 5;') },
  solution: { css: labelCss('  position: relative;\n  z-index: 5;') },
  steps: [
    { check: 'hit', selector: '#label', top: '#label', label: '在標籤 `#label` 的中心點上，畫在最上面的是標籤自己（沒有被卡片蓋住）' },
    { check: 'box', selector: '#label', measure: 'top', value: 20, label: '標籤留在原來的位置：上邊距離頁面頂端 20px' },
    { check: 'box', selector: '#card', measure: 'top', value: 28, label: '卡片留在原來的位置：上邊距離頁面頂端 28px' },
    { check: 'style', selector: '#card', property: 'position', value: 'relative', label: '卡片 `#card` 仍然是 `position: relative`（徽章靠它定位）' },
  ],
  mistakes: [
    { files: { css: labelCss('  z-index: 9999;') }, why: '把 `z-index` 從 5 加大到 9999。問題不在數字大小：標籤是 `static`，`z-index` 寫多少都不會生效。瀏覽器不會顯示任何錯誤，只是安靜地略過它。' },
    { files: { css: labelCss('  position: absolute;\n  z-index: 5;') }, why: '用了 `position: absolute`。`z-index` 確實生效了，但絕對定位的盒子會離開一般排版流：標籤不再佔位置，下面的卡片往上遞補，整張卡片的位置都跑掉了。這裡只需要「讓標籤成為定位元素」，位置不必動，用 `relative` 就夠。' },
  ],
};

const MENU_HTML = String.raw`<div id="strip">本週六提早在 15:00 閉館</div>
<header id="top">
  小島圖書館
  <div id="menu">
    <a href="#hours">開放時間</a>
    <a href="#news">新書通報</a>
  </div>
</header>
<main id="panel">
  <h2>本月活動</h2>
  <p>每週六上午 10:00，親子說故事。</p>
</main>`;
const menuCss = (top: string, menu: string, panel: string) => `body { margin: 0; }
#strip { height: 28px; padding-left: 16px; font-size: 14px; line-height: 28px; background-color: #ffe082; }
#top {
  position: relative;
  z-index: ${top};
  height: 48px; padding-left: 16px; line-height: 48px;
  background-color: #1565c0; color: #ffffff;
}
#menu {
  position: absolute; top: 48px; left: 16px;
  z-index: ${menu};
  width: 140px; height: 80px;
  background-color: #ffffff;
}
#menu a { display: block; height: 40px; padding-left: 12px; line-height: 40px; color: #0d47a1; }
#panel {
  position: relative;
  z-index: ${panel};
  height: 160px; padding: 1px 16px;
  background-color: #fff3e0;
}`;

const exMenu: WebExercise = {
  id: 'web07-ex-menu', title: '把下拉選單從面板底下救出來',
  statement: '頁首 `#top` 裡的下拉選單 `#menu` 用 `position: absolute` 掛在頁首的下緣，還寫了 `z-index: 9999`，卻被下面的面板 `#panel` 蓋住。面板因為別的需求設了 `position: relative; z-index: 2;`，請不要改它。調整 style.css，讓選單畫在面板上面。選單仍然要以頁首為包含區塊、貼在頁首的下緣（選單的上邊在頁首上邊往下 48px），`body { margin: 0; }` 保留。',
  hints: [
    '選單的 9999 是在哪一個堆疊環境裡比的？看看它的父元素 `#top`：有定位，又有 `z-index`。',
    '在整個頁面這一層互相比較的，其實是 `#top`（連同它裡面的選單）和 `#panel` 這兩個兄弟。它們的 `z-index` 各是多少？',
    '把 `#top` 的 `z-index` 改成比面板的 2 大的數字，例如 3。選單自己的 `z-index` 不用動。',
  ],
  explanation: '`#top` 有定位又有 `z-index: 1`，所以建立了堆疊環境：選單的 `z-index: 9999` 只在頁首內部比較，出了頁首，整個頁首（連同選單）只算 `z-index: 1` 的一層，輸給 `z-index: 2` 的面板。要讓選單贏過面板，得讓它所在的堆疊環境贏：把 `#top` 的 `z-index` 改成 3。另一個可行的做法是拿掉 `#top` 的 `z-index`，讓它不再建立堆疊環境，選單的 9999 就會直接和面板的 2 比較。',
  fixed: { html: MENU_HTML },
  starter: { css: menuCss('1', '9999', '2') },
  solution: { css: menuCss('3', '9999', '2') },
  steps: [
    { check: 'hit', selector: '#menu', top: '#menu', label: '在選單 `#menu` 的中心點上，畫在最上面的是選單（沒有被面板蓋住）' },
    { check: 'style', selector: '#panel', property: 'position', value: 'relative', label: '面板 `#panel` 仍然是 `position: relative`' },
    { check: 'style', selector: '#panel', property: 'z-index', value: '2', label: '面板 `#panel` 的 `z-index` 仍然是 2' },
    { check: 'box', selector: '#menu', measure: 'top', value: 48, from: '#top', label: '選單仍然貼在頁首的下緣：上邊在頁首上邊往下 48px' },
    { check: 'box', selector: '#top', measure: 'top', value: 28, label: '頁首留在原來的位置：上邊距離頁面頂端 28px' },
  ],
  mistakes: [
    { files: { css: menuCss('1', '99999', '2') }, why: '把選單的 `z-index` 從 9999 再加大到 99999。選單被關在 `#top` 的堆疊環境裡，數字再大也只是在頁首內部比較；在頁面這一層，頁首整組仍然只有 `z-index: 1`，還是輸給面板的 2。' },
    { files: { css: menuCss('2', '9999', '2') }, why: '把 `#top` 的 `z-index` 改成和面板一樣的 2。`z-index` 相同時，原始碼後面的元素畫在上面；面板寫在頁首之後，所以仍然蓋住選單。頁首的數字要比面板大才行。' },
  ],
};

const HEADER_HTML = String.raw`<header id="bar">小島圖書館</header>
<main>
  <p id="intro">本週六提早在 15:00 閉館。</p>
  <article id="card">
    <span id="badge">新書</span>
    <h2>海邊的植物</h2>
  </article>
  <div class="filler"></div>
</main>`;
const headerCss = (body: string, bar: string) => `body { margin: 0;${body} }
#bar {
  width: 100%; height: 48px;
  padding-left: 16px; box-sizing: border-box;
  background-color: #1565c0; color: #ffffff;
  line-height: 48px;${bar}
}
#intro {
  height: 40px; margin: 0; padding-left: 16px;
  line-height: 40px; background-color: #fff3e0;
}
#card {
  position: relative;
  height: 100px; margin-top: 20px;
  background-color: #e3f2fd;
}
#card h2 { margin: 0; padding: 12px 16px; font-size: 18px; }
#badge {
  position: absolute; top: 8px; right: 8px;
  width: 48px; height: 24px;
  background-color: #ffb300;
  font-size: 14px; line-height: 24px; text-align: center;
}
.filler { height: 1200px; }`;

const exHeader: WebExercise = {
  id: 'web07-ex-header', title: '固定頁首：不遮內容，也不被蓋住',
  statement: '讓頁首 `#bar` 在頁面捲動時一直留在視窗頂端（用 `position: fixed` 或 `position: sticky` 都可以），同時做到三件事：（1）還沒捲動時，第一段 `#intro` 不能被頁首蓋住；（2）往下捲動後，卡片 `#card` 要從頁首的底下經過，不能蓋在頁首上面；（3）卡片維持定位，徽章 `#badge` 留在卡片的右上角（徽章的上邊在卡片上邊往下 8px）。頁首的高度是 48px，`body { margin: 0; }` 請保留。',
  hints: [
    '先決定頁首怎麼留在視窗頂端：`fixed` 要搭配 `top: 0`，而且它會離開一般排版流；`sticky` 同樣需要 `top: 0` 當門檻，但仍佔著原本的位置。',
    '如果用 `fixed`，頁首原本佔的 48px 會空出來，內容往上遞補而被蓋住：替 `body`（或 `main`）加上 `padding-top: 48px` 把內容推回去。',
    '卡片是定位元素，又寫在頁首後面，捲動時會畫在頁首上面。替頁首加上 `z-index`（例如 10），它才會蓋住從底下經過的卡片。',
  ],
  explanation: '參考解答用 `position: fixed; top: 0; left: 0;` 把頁首釘在視窗上。固定定位的盒子離開了一般排版流，後面的內容會往上遞補，所以在 `body` 加 `padding-top: 48px`，讓第一段從頁首的下緣開始。卡片是 `position: relative` 的定位元素，原始碼又在頁首之後，沒有 `z-index` 時會畫在頁首上面；替頁首加上 `z-index: 10`，它就高過沒有寫 `z-index` 的卡片。改用 `position: sticky; top: 0; z-index: 10;` 也能通過：`sticky` 仍佔著原位，連 `padding-top` 都不需要。',
  fixed: { html: HEADER_HTML },
  starter: { css: headerCss('', '') },
  solution: { css: headerCss(' padding-top: 48px;', '\n  position: fixed; top: 0; left: 0;\n  z-index: 10;') },
  steps: [
    { check: 'style', selector: '#bar', property: 'position', value: ['fixed', 'sticky'], label: '頁首 `#bar` 的 `position` 是 `fixed` 或 `sticky`' },
    { check: 'hit', selector: '#intro', top: '#intro', label: '還沒捲動時，在第一段 `#intro` 的中心點上畫在最上面的是它自己（沒有被頁首蓋住）' },
    { do: 'scroll', selector: ':page', top: 120 },
    { check: 'box', selector: '#bar', measure: 'top', value: 0, from: ':viewport', label: '頁面往下捲 120px 之後，頁首的上邊仍貼著視窗頂端' },
    { check: 'hit', selector: '#bar', top: '#bar', label: '這時卡片正從頁首底下經過：在頁首的中心點上，畫在最上面的是頁首' },
    { check: 'box', selector: '#badge', measure: 'top', value: 8, from: '#card', label: '徽章仍在卡片的右上角：上邊在卡片上邊往下 8px' },
  ],
  mistakes: [
    { files: { css: headerCss('', '\n  position: fixed; top: 0; left: 0;\n  z-index: 10;') }, why: '頁首改成 `fixed` 之後沒有把內容往下讓。固定定位的盒子不佔位置，第一段往上遞補到頁面頂端，剛好被 48px 高的頁首整個蓋住。要替 `body` 或 `main` 加上和頁首一樣高的 `padding-top`。' },
    { files: { css: headerCss(' padding-top: 48px;', '\n  position: fixed; top: 0; left: 0;') }, why: '頁首沒有寫 `z-index`。卡片是 `position: relative` 的定位元素，原始碼又在頁首之後；兩者都沒有 `z-index` 時，後寫的畫在上面，所以卡片捲上來時會蓋住頁首。' },
    { files: { css: headerCss('', '\n  position: sticky;\n  z-index: 10;') }, why: '寫了 `position: sticky` 卻沒有寫 `top`。少了門檻，瀏覽器不知道要黏在哪裡，頁首就和一般區塊一樣跟著頁面捲走。`sticky` 一定要搭配 `top: 0` 這樣的位移。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const WEB07: LessonContent = {
  lessonId: 'WEB07',
  motivation: '卡片角落的徽章、捲動時一直留在上面的頁首、浮在其他內容上方的選單，都不是照一般排版流排出來的，而是用 `position` 把盒子移開原位，再由堆疊順序決定誰蓋住誰。這一課學會五種定位、找出包含區塊的方法，以及 `z-index` 寫了卻沒反應時該從哪裡查起。',
  sections: [
    {
      id: 'web07-position-section', title: '離開原位的第一步：static 與 relative',
      blocks: [
        { type: 'p', text: '上一課的一般排版流有一個特性：每個盒子都排在前一個盒子之後，彼此不會重疊。可是網頁上有不少東西是「不照順序排」的：壓在卡片角落的徽章、捲動時留在畫面上的頁首、蓋在其他內容上面的提示框。這些都靠同一個 CSS 屬性 `position` 做出來，這件事稱為定位（positioning）。`position` 有五個值，先看全貌，後面幾節再一個一個拆開：' },
        { type: 'table', head: ['值', '還佔著原本的位置嗎', '位移以什麼為基準', '常見用途'], rows: [
          ['`static`（預設值）', '是', '不能位移：`top`、`left`、`z-index` 都沒有作用', '頁面上大部分的內容'],
          ['`relative`', '是', '自己原本的位置', '微調位置；當絕對定位子孫的基準'],
          ['`absolute`', '否，離開一般排版流', '包含區塊：最近的定位祖先', '角落的徽章、提示框、下拉選單'],
          ['`fixed`', '否，離開一般排版流', '視窗', '固定頁首、回到頂端的按鈕'],
          ['`sticky`', '是', '平常照一般排版流；捲到門檻後黏在捲動範圍的邊緣', '黏在頂端的區段標題'],
        ] },
        { type: 'p', text: '`position` 不是 `static` 的元素，統稱定位元素（positioned element）；這個名詞後面會一直出現。定位元素可以用四個 CSS 屬性 `top`、`right`、`bottom`、`left` 指定位移（offset）。它們的意思是「離基準的那一邊多遠」：`top: 20px` 是離上邊 20px，所以盒子往下移；`left: 40px` 是離左邊 40px，盒子往右移；寫負值就往反方向。四個方向可以用 `inset` 一次寫完，例如 `inset: 0` 等於四邊都是 0。最溫和的定位是 `relative`：盒子仍然留在一般排版流裡，只是畫的時候從原本的位置挪開。' },
        { type: 'example', id: 'web07-relative' },
        { type: 'p', text: '看預覽裡的三個盒子。A 寫了 `top: 30px; left: 30px;`，卻還是貼在左上角：它沒有寫 `position`，位移對 `static` 的元素沒有作用。B 往下 20px、往右 40px，壓住了 C 的上緣；但 C 的上邊仍然在 100px，也就是兩個 50px 高的盒子之後。換句話說，排版時瀏覽器仍然把 B 當成在原位，替它留著那一格，只有「畫出來的位置」被挪開。按「動手改這個範例」，把 B 的 `top: 20px` 改成 `top: -20px`，B 會往上壓到 A；A 與 C 仍然一步都不動。' },
        { type: 'callout', tone: 'warning', title: '位移沒有反應，先看 position', text: '在沒有定位的元素上寫 `top`、`left`，是初學者最常遇到的「CSS 沒有生效」。瀏覽器不會顯示任何錯誤，這些宣告本身也合法，只是對 `static` 的元素不起作用。另一個常見的誤會是方向：`top: 20px` 不是「往上 20px」，而是「離上邊 20px」，結果是往下移。' },
        { type: 'p', text: '`relative` 單獨拿來移動盒子的機會其實不多，因為挪開之後原位會留下一塊空白，移過去的地方又可能壓到別人。它更重要的用途有兩個，後面幾節都會用到：不寫任何位移，只為了讓元素「成為定位元素」，好當絕對定位子孫的基準，或是讓 `z-index` 生效。' },
      ],
    },
    {
      id: 'web07-absolute-section', title: 'absolute 與包含區塊',
      blocks: [
        { type: 'p', text: '`position: absolute` 的盒子會離開一般排版流：其他元素排版時當它不存在，父元素計算自己的高度時也不把它算進去。它的位置完全由 `top`、`right`、`bottom`、`left` 決定，而這些位移的基準是一個矩形，叫做包含區塊（containing block）。絕對定位會不會出現在你想要的地方，幾乎都取決於包含區塊是誰。找法是固定的：' },
        { type: 'list', ordered: true, items: [
          '從這個元素的父元素開始，一層一層往上找祖先。',
          '遇到的第一個定位元素（`position` 不是 `static`）就是答案：包含區塊是那個祖先的內距盒（padding box），也就是邊框內緣圍起來的範圍，位移從邊框的內緣算起。',
          '一路找到 `html` 都沒有定位元素：包含區塊是初始包含區塊（initial containing block），大小和視窗一樣，位置在整個頁面的最左上角。',
        ] },
        { type: 'example', id: 'web07-absolute' },
        { type: 'p', text: '兩個徽章的 CSS 一字不差，位置卻差很多。第一張卡片 `#with` 是 `position: relative`，所以它是徽章的包含區塊：徽章離卡片外緣 12px，正是邊框的 4px 加上 `top: 8px`，可見位移是從邊框內緣算的。第二張卡片 `#without` 沒有定位，徽章往上找不到任何定位祖先，只好以初始包含區塊為準，跑到頁面的右上角。打開 DOM 樹確認一件事：那個 `span.badge` 仍然是 `article#without` 的子元素。定位改變的是盒子畫在哪裡，不是 DOM 的結構。' },
        { type: 'callout', tone: 'warning', title: '徽章飛到頁面角落：忘了讓父元素定位', text: '「替子元素寫了 `position: absolute`，它卻跑到頁面角落」是定位最經典的錯誤，原因永遠是同一個：你心裡想的那個父元素不是定位元素。修法是在父元素加上 `position: relative`，不寫任何位移：父元素留在原位、照常佔位置，但從此成為子孫的包含區塊。按「動手改這個範例」，把 `#with { position: relative; }` 那一行刪掉再執行，第一個徽章也會飛走，和第二個疊在同一個位置。' },
        { type: 'p', text: '絕對定位還有幾個要記得的特性。第一，它讓元素變成區塊：範例的徽章是 `<span>`，原本是行內元素，絕對定位之後 `width` 與 `height` 就有效了。第二，沒有寫 `width` 時，盒子的寬度會縮到剛好包住內容，不像一般區塊會撐滿整行；同時寫 `left` 與 `right`（例如 `left: 0; right: 0;`）則會把它拉到兩邊。第三，它不佔位置，所以可能蓋住旁邊的文字：卡片的標題太長時會伸到徽章底下，需要自己在標題右邊留出空間。第四，以初始包含區塊為準的盒子會跟著頁面一起捲走；要「捲動時留在畫面上」，是下一節的事。' },
      ],
    },
    {
      id: 'web07-fixed-sticky-section', title: 'fixed 與 sticky：捲動時留在畫面上',
      blocks: [
        { type: 'p', text: '`position: fixed` 和 `absolute` 很像，同樣離開一般排版流，差別在包含區塊：`fixed` 以視窗（viewport，瀏覽器顯示頁面的那塊區域）為準。頁面怎麼捲，視窗都不動，所以盒子像釘在螢幕上一樣。固定頁首最常這樣寫：`position: fixed; top: 0; left: 0; right: 0;`。其中 `left: 0; right: 0;` 不能省，因為固定定位的盒子和絕對定位一樣，寬度會縮到內容大小，要自己把它拉到視窗的兩邊（或寫 `width: 100%`）。' },
        { type: 'example', id: 'web07-fixed' },
        { type: 'p', text: '在預覽裡往下捲：灰色的內容一直往上跑，藍色的頁首留在原處。再看 CSS 裡的 `main { padding-top: 48px; }`。頁首離開了一般排版流，它原本佔的 48px 就空了出來，後面的內容會往上遞補到頁面頂端，剛好躲在頁首底下；這 48px 的內距就是把內容推回頁首下緣的補償。按「動手改這個範例」刪掉這一行再執行，第一段「本週六提早在 15:00 閉館。」就不見了：它還在，只是被頁首蓋住。' },
        { type: 'callout', tone: 'warning', title: '固定頁首會蓋住頁面最前面的內容', text: '把頁首改成 `fixed` 之後，頁面最上面的一兩行消失，是因為固定定位的盒子不佔位置。記得替後面的內容（`body` 或 `main`）加上和頁首一樣高的 `padding-top`。頁首的高度一改，這個數字也要跟著改，所以頁首的高度最好明確寫出來。' },
        { type: 'p', text: '`position: sticky`（黏貼定位）是 `relative` 與 `fixed` 的混合：平常它留在一般排版流裡，照原本的位置顯示、照常佔位置；等頁面捲到它快要離開畫面，碰到你用 `top` 指定的門檻時，它就黏在那裡不再往上走。`top: 0` 的意思是「離捲動範圍的上邊 0px 時黏住」。它還有一個界線：黏住的盒子不會離開自己的父元素，父元素整個捲出畫面時，它也跟著離開。' },
        { type: 'example', id: 'web07-sticky' },
        { type: 'p', text: '慢慢往下捲這個範例。一開始兩個黃色標題都在自己的位置上，A 區的標題在藍色橫幅下面；橫幅捲走之後，A 區的標題碰到視窗頂端就黏住；繼續捲，A 區（`#s1`）的底部把它推出畫面，接著輪到 B 區的標題黏住。因為 `sticky` 仍然佔著原本的位置，不需要像 `fixed` 那樣替內容補 `padding-top`。' },
        { type: 'table', head: ['比較', 'fixed', 'sticky'], rows: [
          ['佔不佔位置', '不佔，後面的內容往上遞補', '佔著原本的位置'],
          ['以什麼為準', '視窗', '最近的捲動範圍（通常是整個頁面），而且不超出父元素'],
          ['什麼時候在畫面上', '一直都在', '父元素還在畫面上的時候'],
          ['要注意', '替內容補上等高的 `padding-top`；用 `left`、`right` 或 `width` 決定寬度', '一定要寫 `top` 之類的門檻'],
        ] },
        { type: 'callout', tone: 'warning', title: 'sticky 沒有黏住的兩個原因', text: '第一，沒有寫門檻：只寫 `position: sticky` 而沒有 `top`（或 `bottom`、`left`、`right`），瀏覽器不知道要黏在哪裡，盒子就像一般區塊一樣捲走。第二，某個祖先設了 `overflow: hidden`、`overflow: auto` 或 `overflow: scroll`：`sticky` 是黏在「最近的捲動範圍」上，這樣的祖先會變成它的捲動範圍，而那個祖先本身並沒有在捲動，看起來就像完全失效。' },
      ],
    },
    {
      id: 'web07-z-index-section', title: '誰蓋住誰：堆疊順序與 z-index',
      blocks: [
        { type: 'p', text: '定位讓盒子可以重疊，瀏覽器就得決定誰畫在上面。可以想像螢幕除了左右、上下之外，還有一個朝向你的第三個方向：盒子在這個方向上的先後，就是堆疊順序（stacking order）。什麼都不寫的時候，規則只有兩條：' },
        { type: 'list', ordered: true, items: [
          '定位元素畫在沒有定位的內容上面。',
          '同樣是定位元素，原始碼裡寫在後面的畫在上面。',
        ] },
        { type: 'p', text: '想改變這個順序，用 CSS 屬性 `z-index`。它的值是整數（可以是負數），數字大的畫在上面；預設值是 `auto`，表示照上面兩條規則排。兩個元素的 `z-index` 相同時，仍然是原始碼後面的在上面。最重要的限制是：`z-index` 只對定位元素有效（之後在響應式設計島學到的 flex 與 grid 排版，容器的子元素不必定位也能用 `z-index`）。' },
        { type: 'example', id: 'web07-stacking-order' },
        { type: 'p', text: '三組色塊由上到下看。第一組：兩張都是 `position: absolute`、都沒有 `z-index`，後寫的 2 蓋住 1。第二組：1 加了 `z-index: 1`，就翻到 2 的上面；數字不必大，只要比對方大。第三組：1 寫了 `z-index: 99`，但它被改成 `position: static`，`z-index` 完全沒有作用，而 2 是定位元素，照第一條規則畫在上面。按「動手改這個範例」，把 `#g3 .first` 的 `position: static` 改成 `position: relative` 再執行：盒子的位置不變（沒有寫位移），但 `z-index: 99` 開始生效，1 就蓋到 2 上面了。' },
        { type: 'callout', tone: 'warning', title: 'z-index 寫了沒反應，先確認它是定位元素', text: '「我明明寫了 `z-index: 999`，它還是被蓋住」最常見的原因，就是那個元素沒有定位。瀏覽器不會提醒你，只是安靜地略過。修法通常是加一條 `position: relative`：不寫位移時盒子留在原位，版面不受影響，`z-index` 卻開始生效。' },
        { type: 'p', text: '這一課的練習會出現「在某個元素的中心點上，畫在最上面的是誰」這種檢查：它看的是盒子正中央那一點，最上層畫的是哪一個元素，和你用滑鼠指著那一點時瀏覽器判斷「指到誰」的方式相同。所以答案只看結果，不管你用哪一種寫法讓它疊到上面。' },
        { type: 'callout', tone: 'tip', title: '數字留一點間隔，但不必很大', text: '`z-index` 比的只是大小，9999 並不比 3 更「有力」。實務上常替整個網站訂幾個固定的層級，例如內容裡的小裝飾用 1、下拉選單用 10、固定頁首用 20、蓋住整頁的對話框用 30；中間留一點間隔，之後要插入新的一層才有空位。' },
      ],
    },
    {
      id: 'web07-stacking-context-section', title: '堆疊環境：9999 也贏不了的時候',
      blocks: [
        { type: 'p', text: '如果整個頁面所有元素的 `z-index` 都放在一起比大小，事情就簡單了；實際上它是分組比的。有些元素會把自己和所有子孫包成一組，稱為堆疊環境（stacking context）：組裡的 `z-index` 只在組內互相比較；到了組外，整組只算一層，高低由建立這個堆疊環境的元素自己決定。可以想成桌上疊著幾個資料夾：資料夾裡的紙可以重新排順序，但一張紙排得再前面，也不會跑到壓在上面的另一個資料夾之上。下面這些元素會建立堆疊環境：' },
        { type: 'list', items: [
          '根元素 `<html>`：整個頁面本身就是最外層的堆疊環境。',
          '`position` 是 `relative` 或 `absolute`，而且 `z-index` 不是 `auto` 的元素（寫 `z-index: 0` 也算）。',
          '`position` 是 `fixed` 或 `sticky` 的元素，不論有沒有寫 `z-index`。',
          '`opacity` 小於 1 的元素（`opacity` 是不透明度，1 是完全不透明）。',
          '設了 `transform`、`filter` 這類視覺效果的元素；它們之後的課才會教，這裡先記得它們也會建立堆疊環境。',
        ] },
        { type: 'example', id: 'web07-stacking-context' },
        { type: 'p', text: '先看上面那一組。紅色提示框的 `z-index` 是 9999，卻被 `z-index` 只有 2 的卡片 B 蓋住下半截。原因在它的父元素：卡片 A 有定位又有 `z-index: 1`，建立了堆疊環境，提示框的 9999 只在卡片 A 內部有意義。在頁面這一層互相比較的是卡片 A（1）和卡片 B（2），A 整組輸了，裡面的提示框也跟著被壓在下面。下面那一組的卡片 C 有定位但沒有 `z-index`，不是堆疊環境，提示框的 9999 就直接和卡片 D 的 2 比較，所以畫在最上面。' },
        { type: 'p', text: '動手改兩次試試。第一次：把 `#a { z-index: 1; }` 改成 `z-index: 3`，卡片 A 整組高過卡片 B，提示框就露出來了；注意提示框自己的數字完全沒動。第二次：替 `#c` 加上 `opacity: 0.9`，卡片 C 沒有 `z-index` 卻也成了堆疊環境（在外層它和 `z-index: 0` 的元素同一級），下面那個提示框立刻被卡片 D 蓋住。這也是堆疊環境難查的地方：建立它的不一定是 `z-index`。' },
        { type: 'callout', tone: 'warning', title: '不要靠加大數字解決', text: '看到元素被蓋住就把 `z-index` 改成 9999、再不行改成 99999，是最常見也最沒有用的反應。如果元素被關在一個比較低的堆疊環境裡，它自己的數字多大都出不來；要調整的是「建立那個堆疊環境的祖先」的 `z-index`，或是讓那個祖先不再建立堆疊環境。數字越寫越大只會讓之後更難查。' },
      ],
    },
    {
      id: 'web07-recipes-section', title: '三種常見做法與除錯順序',
      blocks: [
        { type: 'p', text: '把前面五節合起來，就是網頁上最常見的三種定位做法。它們的寫法都很短，容易出錯的地方也都很固定：' },
        { type: 'table', head: ['想做的東西', '寫法', '最容易漏掉的事'], rows: [
          ['卡片角落的徽章', '卡片 `position: relative`；徽章 `position: absolute` 加上 `top`、`right`', '卡片沒有定位，徽章就以整個頁面為包含區塊'],
          ['固定頁首', '`position: fixed; top: 0; left: 0; right: 0;`，或 `position: sticky; top: 0;`', '`fixed` 要替內容補 `padding-top`；兩種都要加 `z-index`，才不會被捲上來的定位元素蓋住'],
          ['浮動提示、下拉選單', '外層 `position: relative`；提示框 `position: absolute`，再用 `z-index` 疊到鄰居上面', '外層或更上面的祖先建立了較低的堆疊環境，提示框就出不來'],
        ] },
        { type: 'p', text: '遇到「`z-index` 無效」時，不要急著改數字，照這個順序查：' },
        { type: 'list', ordered: true, items: [
          '這個元素是定位元素嗎？`position` 是 `static` 的話，`z-index` 不會生效（flex 與 grid 容器的子元素除外）。',
          '從它往上找祖先：有沒有哪一個建立了堆疊環境（定位加上 `z-index`、`fixed`、`sticky`、`opacity` 小於 1、`transform`…）？',
          '蓋住它的那個元素，又是在哪一個堆疊環境裡？找出兩邊在同一個堆疊環境裡「各自所屬的那一層」，真正在比較的是那兩個元素。',
          '調整那兩個元素的 `z-index`（或它們在原始碼裡的先後），而不是被蓋住的元素自己的數字。',
        ] },
        { type: 'p', text: '查的時候可以打開瀏覽器的開發者工具：在 Elements 面板選取元素，Computed 分頁會列出 `position` 與 `z-index` 計算後的值；再一層一層點選它的祖先，看看誰有定位、誰有 `z-index` 或 `opacity`。把這四步走完，絕大多數「疊不上去」的問題都找得到原因。' },
        { type: 'callout', tone: 'note', title: '固定頁首不要蓋住鍵盤使用者要看的內容', text: '用 Tab 鍵在頁面上移動時，取得焦點的連結或欄位可能正好位在固定頁首的底下：它已經在視窗的範圍內，瀏覽器不會再捲動，使用者卻看不到自己現在在哪裡。固定在畫面上的東西越高，這個問題越明顯：頁首不要做得太高，並可以在 `html` 上用 `scroll-padding-top` 預留和頁首一樣的高度，瀏覽器把取得焦點的元素捲進畫面時就會避開這一段。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'web07-q1', prompt: '一個沒有寫 `position` 的 `<div>` 加上了 `top: 30px; left: 30px;`。它會怎麼樣？',
      options: ['往下、往右各移動 30px，原本的位置保留', '往下、往右各移動 30px，後面的元素往上遞補', '留在原位：位移對 `static` 的元素沒有作用', '瀏覽器在主控台顯示錯誤，並略過整條規則'],
      answer: 2,
      explanation: '沒有寫 `position` 就是預設的 `static`，`top`、`right`、`bottom`、`left` 對它都沒有作用，盒子留在原位。「移動且保留原位」是 `relative` 的行為；「移動且後面的元素遞補」是 `absolute` 的行為，兩者都要先寫 `position`。這些宣告本身是合法的 CSS，瀏覽器不會顯示錯誤，同一條規則裡的其他宣告也照常生效。',
    },
    {
      id: 'web07-q2', prompt: '三個高 50px 的區塊由上到下排列。第二個加上 `position: relative; top: 20px;` 之後，第三個區塊的位置會怎麼變？',
      options: ['不變：第二個區塊原本佔的位置仍然保留', '往下移 20px，維持和第二個區塊相接', '往上移 50px，補上第二個區塊離開後的空位', '往上移 20px，因為 `top` 是往上的意思'],
      answer: 0,
      explanation: '`relative` 的盒子仍在一般排版流裡，排版時當作它還在原位，只有畫出來的位置挪開，所以第三個區塊完全不動（第二個區塊會壓住它上緣 20px）。不會跟著往下移，因為位移不影響其他元素；往上遞補 50px 是 `absolute`、`fixed` 這種離開排版流的定位才有的結果；`top: 20px` 是「離上邊 20px」，盒子是往下移，而且移動的也只有第二個區塊自己。',
    },
    {
      id: 'web07-q3', prompt: '`.badge` 是 `.card` 的子元素，頁面上沒有其他規則。徽章會出現在哪裡？',
      code: { language: 'CSS', text: 'body  { margin: 0; }\n.card  { width: 240px; margin: 40px; }\n.badge { position: absolute; top: 0; right: 0; }' },
      options: ['卡片的右上角，因為它是卡片的子元素', '卡片的左上角，因為沒有寫 `left`', '留在卡片裡原本的位置，因為位移都是 0', '整個頁面的右上角，因為它沒有任何定位祖先'],
      answer: 3,
      explanation: '絕對定位以最近的定位祖先為包含區塊；`.card` 沒有寫 `position`，往上也沒有定位元素，所以包含區塊是初始包含區塊，`top: 0; right: 0;` 把徽章放到整個頁面的右上角。DOM 裡的父子關係不等於包含區塊，要卡片寫了 `position: relative` 才會以卡片為準；`right: 0` 已經指定了水平位置，不會跑到左邊；位移是 0 不代表不動，它的意思是貼齊包含區塊的那一邊。',
    },
    {
      id: 'web07-q4', prompt: '父元素是 `position: relative; border: 5px solid; padding: 10px;`，子元素是 `position: absolute; top: 0; left: 0;`。子元素的左上角會對齊父元素的哪裡？',
      options: ['邊框的外緣（父元素最外面的角落）', '邊框的內緣，也就是內距盒的角落', '內距的內緣，也就是內容區的角落', '父元素正中央'],
      answer: 1,
      explanation: '定位祖先提供的包含區塊是它的內距盒（padding box）：從邊框的內緣算起，內距的部分包含在內。所以子元素會蓋在父元素的內距上，左上角離父元素外緣 5px（邊框的寬度）。它不會對齊邊框外緣，因為邊框不算在包含區塊裡；也不會避開 10px 的內距對齊內容區，內距只影響一般排版流裡的內容；`top: 0; left: 0;` 是貼齊角落，和置中無關。',
    },
    {
      id: 'web07-q5', prompt: '把頁首改成 `position: fixed; top: 0; left: 0; right: 0;` 之後，頁面最上面的第一段文字不見了。原因和修法是什麼？',
      options: ['固定定位的頁首不佔位置，內容往上遞補後被它蓋住；替內容加上和頁首一樣高的 `padding-top`', '`fixed` 會讓後面的第一個元素變成 `display: none`；把那一段的 `display` 改回 `block`', '頁首的 `z-index` 太大；把頁首的 `z-index` 改成 0，第一段就會出現', '`fixed` 不能和 `left`、`right` 一起用；把它們刪掉就會恢復'],
      answer: 0,
      explanation: '`fixed` 的盒子離開一般排版流，原本佔的高度空出來，後面的內容往上遞補到頁面頂端，正好在頁首底下；替 `body` 或 `main` 補上等高的 `padding-top`，內容就回到頁首的下緣。定位不會改變其他元素的 `display`，那一段還在，只是被蓋住；頁首是定位元素，就算 `z-index` 是 0 或沒有寫，仍然畫在沒有定位的段落上面，所以調整 `z-index` 沒有用；`left: 0; right: 0;` 是把固定頁首拉滿視窗寬度的正常寫法。',
    },
    {
      id: 'web07-q6', prompt: '區段標題寫了 `position: sticky; top: 0;`，它所在的 `<section>` 很長。往下捲動頁面時，標題的行為是？',
      options: ['從一開始就固定在視窗頂端，後面的內容往上遞補被它蓋住', '和一般區塊完全一樣，跟著頁面捲走', '捲到視窗頂端後黏住，之後不管捲到哪裡都一直留在那裡', '先照原本的位置顯示；捲到視窗頂端時黏住，直到它的父元素捲出畫面才跟著離開'],
      answer: 3,
      explanation: '`sticky` 平常留在一般排版流裡、佔著原本的位置，捲到 `top: 0` 這個門檻時才黏住；它不能離開父元素的範圍，所以 `<section>` 捲出畫面時標題也跟著離開。一開始就固定、而且不佔位置的是 `fixed`；有寫 `top` 門檻的 `sticky` 不會直接捲走（沒寫 `top` 才會）；黏住之後也不是永遠留著，那同樣是 `fixed` 的行為。',
    },
    {
      id: 'web07-q7', prompt: '`.photo` 在原始碼裡排在 `.note` 後面，往上移了 20px，壓住 `.note` 的下緣。為什麼 `.note` 的 `z-index: 100` 沒有讓它疊到上面？',
      code: { language: 'CSS', text: '.note  { z-index: 100; background-color: #ffe082; }\n.photo { position: relative; top: -20px; }' },
      options: ['100 不夠大，要寫到 9999 以上才有把握', '`.note` 沒有定位，`z-index` 對它不會生效', '`.photo` 寫在後面，而原始碼的順序永遠比 `z-index` 優先', '`z-index` 一定要寫在父元素上，寫在元素自己身上沒有用'],
      answer: 1,
      explanation: '`z-index` 只對定位元素有效。`.note` 沒有寫 `position`，是 `static`，`z-index: 100` 形同沒寫；`.photo` 是定位元素，本來就畫在沒有定位的內容上面。替 `.note` 加上 `position: relative` 就會生效。數字的大小不是原因，`static` 的元素寫 9999 也一樣沒用；原始碼的順序只在 `z-index` 相同或都沒寫時才用來決定先後，不會比有效的 `z-index` 優先；`z-index` 就是寫在要調整層級的元素自己身上。',
    },
    {
      id: 'web07-q8', prompt: '卡片 A（`position: relative; z-index: 1;`）裡有一個提示框（`position: absolute; z-index: 9999;`），伸進了旁邊的卡片 B（`position: relative; z-index: 2;`）的範圍。A 與 B 是兄弟元素。重疊的地方誰畫在上面？',
      options: ['提示框，因為 9999 是三個數字裡最大的', '提示框，因為子元素一定畫在父元素和父元素的兄弟上面', '卡片 B，因為提示框的 9999 只在卡片 A 的堆疊環境裡比較，而 A 整組低於 B', '卡片 A 的背景，因為建立堆疊環境的元素會畫在自己所有子孫的上面'],
      answer: 2,
      explanation: '卡片 A 有定位又有 `z-index`，建立了堆疊環境：提示框的 9999 只在 A 的內部比較；在外面，A 連同提示框只算 `z-index: 1` 的一層，低於 `z-index: 2` 的卡片 B，所以重疊處畫在上面的是 B。`z-index` 不是全頁一起比大小，9999 最大也沒有用；子元素只保證畫在自己父元素的背景上面，贏不贏父元素的兄弟要看父元素那一層的比較結果；建立堆疊環境的元素，背景是畫在這一組的最底下，不會蓋住自己的子孫。',
    },
  ],
  webCode: {
    examples: [relative, absolute, fixedHeader, sticky, stackingOrder, stackingContext],
    exercises: [exBadge, exLabel, exMenu, exHeader],
  },
};
