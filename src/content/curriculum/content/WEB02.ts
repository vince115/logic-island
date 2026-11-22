import type { WebExample, WebExercise } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB02 HTML document structure and semantic elements (WEB-1). A web-code lesson: every example is a small page of a
 * made-up public library (小島圖書館) with facts checked in Chromium; the exercises are checked on the DOM the browser
 * builds (doctype, lang, title, landmarks, heading outline). No JavaScript; CSS appears only as a given file in two
 * examples (a div made to look like a heading, a styling hook on div and span) and is not taught here.
 */

// ---- examples ---------------------------------------------------------------------------------------------------
const skeleton: WebExample = {
  id: 'web02-skeleton', title: '一份完整的 HTML 文件',
  description: '小島圖書館的首頁，只有骨架與兩行內容：`<!DOCTYPE html>`、`<html lang>`、`<head>`（編碼、viewport、標題）與 `<body>`。',
  files: { html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>小島圖書館</title>
</head>
<body>
  <h1>歡迎光臨</h1>
  <p>這裡是島上唯一的公共圖書館。</p>
</body>
</html>` },
  observe: [
    { check: 'doctype', label: '文件有 `<!DOCTYPE html>`，瀏覽器以標準模式顯示' },
    { check: 'attr', selector: 'html', name: 'lang', value: 'zh-Hant', label: '`html` 的 `lang` 是 `zh-Hant`（繁體中文）' },
    { check: 'count', selector: 'html > *', count: 2, label: '`html` 只有兩個子元素：`head` 與 `body`' },
    { check: 'text', selector: 'head > title', text: '小島圖書館', label: '分頁標題來自 `head` 裡的 `title`，不是 `h1`' },
    { check: 'attr', selector: 'head > meta[charset]', name: 'charset', value: 'utf-8', label: '`head` 裡用 `meta` 宣告編碼是 `utf-8`' },
  ],
};

const nesting: WebExample = {
  id: 'web02-nesting', title: '屬性、空元素，以及放錯位置的 div',
  description: '第一個段落有兩個屬性，裡面還硬塞了一個 `<div>`；第二個段落用 `<br>` 換行。打開 DOM 樹，看瀏覽器把它整理成什麼樣子。',
  files: { html: String.raw`<p id="notice" class="alert">本週六提早閉館
  <div>閉館時間：15:00</div>
</p>
<p>地址：島嶼路 1 號<br>電話：分機 12</p>` },
  observe: [
    { check: 'attr', selector: 'p#notice', name: 'class', value: 'alert', label: '第一個 `p` 有 `id="notice"` 與 `class="alert"` 兩個屬性' },
    { check: 'count', selector: 'p div', count: 0, label: '`div` 不在任何 `p` 裡面：瀏覽器遇到 `<div>` 就先結束了段落' },
    { check: 'count', selector: 'p', count: 3, label: '原始碼只寫了兩個 `<p>`，DOM 裡卻有三個 `p`：落單的 `</p>` 變成一個空段落' },
    { check: 'count', selector: 'p > br', count: 1, label: '`br` 是空元素：沒有結束標籤，也沒有內容' },
  ],
};

const divSoup: WebExample = {
  id: 'web02-div-soup', title: '改寫前：全部都是 div',
  description: '圖書館首頁的舊版。每一塊都是 `<div>`，靠 `class` 的名字和 style.css 讓它「看起來」有標題、有選單。',
  files: {
    html: String.raw`<div class="header">
  <div class="title">小島圖書館</div>
  <div class="nav">
    <a href="#hours">開放時間</a>
    <a href="#news">新書通報</a>
  </div>
</div>
<div class="main">
  <div class="subtitle" id="hours">開放時間</div>
  <div class="text">週二至週日 9:00–17:00，週一休館。</div>
  <div class="subtitle" id="news">新書通報</div>
  <div class="text">本月新進 12 本書，放在一樓新書區。</div>
</div>
<div class="footer">小島圖書館　島嶼路 1 號</div>`,
    css: String.raw`.title { font-size: 2em; font-weight: bold; margin: 16px 0; }
.subtitle { font-size: 1.5em; font-weight: bold; margin: 20px 0 8px; }
.footer { margin-top: 20px; }`,
  },
  observe: [
    { check: 'count', selector: 'div', count: 9, label: '整頁有 9 個 `div`' },
    { check: 'count', selector: 'h1, h2, h3, h4, h5, h6', count: 0, label: '沒有任何標題元素：頁面沒有大綱' },
    { check: 'count', selector: 'header, nav, main, footer', count: 0, label: '沒有 `header`、`nav`、`main`、`footer`：頁面沒有任何地標' },
    { check: 'style', selector: '.title', property: 'font-weight', value: 'bold', label: '「小島圖書館」只是被樣式加粗的 `div`，不是標題' },
  ],
};

const semantic: WebExample = {
  id: 'web02-semantic', title: '改寫後：語意元素',
  description: '同樣的文字，換成 `<header>`、`<nav>`、`<main>`、`<section>`、`<footer>` 與標題元素，而且不需要任何 CSS。',
  files: { html: String.raw`<header>
  <h1>小島圖書館</h1>
  <nav aria-label="主選單">
    <a href="#hours">開放時間</a>
    <a href="#news">新書通報</a>
  </nav>
</header>
<main>
  <section>
    <h2 id="hours">開放時間</h2>
    <p>週二至週日 9:00–17:00，週一休館。</p>
  </section>
  <section>
    <h2 id="news">新書通報</h2>
    <p>本月新進 12 本書，放在一樓新書區。</p>
  </section>
</main>
<footer>
  <p>小島圖書館　島嶼路 1 號</p>
  <nav aria-label="頁尾連結">
    <a href="#hours">回到開放時間</a>
  </nav>
</footer>` },
  observe: [
    { check: 'count', selector: 'div', count: 0, label: '整頁沒有任何 `div`' },
    { check: 'count', selector: 'main', count: 1, label: '只有一個 `main`，包住這一頁的主要內容' },
    { check: 'count', selector: 'body > header, body > footer', count: 2, label: '`header` 與 `footer` 直接放在 `body` 底下，在 `main` 外面' },
    { check: 'count', selector: 'main > section > h2', count: 2, label: '`main` 裡有兩個 `section`，各以一個 `h2` 開頭' },
    { check: 'attr', selector: 'footer nav', name: 'aria-label', value: '頁尾連結', label: '兩個 `nav` 各有 `aria-label`，頁尾的叫「頁尾連結」' },
  ],
};

const headings: WebExample = {
  id: 'web02-headings', title: '標題排出頁面的大綱',
  description: '圖書館的「新書與活動」頁：一個 `h1`，底下是 `h2` 的主題與 `h3` 的小節。style.css 只替 `.cards` 與 `.tag` 加一點外觀。',
  files: {
    html: String.raw`<header>
  <h1>小島圖書館</h1>
</header>
<main>
  <h2>新書通報</h2>
  <div class="cards">
    <article>
      <h3>海邊的植物</h3>
      <p><span class="tag">新書</span> 認識島上常見的二十種海濱植物。</p>
    </article>
    <article>
      <h3>潮間帶散步</h3>
      <p><span class="tag">新書</span> 退潮後的礁岩上住了哪些生物。</p>
    </article>
  </div>
  <h2>本月活動</h2>
  <h3>親子說故事</h3>
  <p>每週六上午 10:00，在一樓兒童區。</p>
</main>
<aside>
  <h2>借書小提醒</h2>
  <p>每本書可借 14 天。</p>
</aside>`,
    css: String.raw`.cards { border-left: 4px solid #90caf9; padding-left: 12px; }
.tag { background-color: #ffe082; padding: 0 4px; }`,
  },
  observe: [
    { check: 'headings', label: '標題形成大綱：只有一個 `h1` 且在最前面，往下沒有跳過層級' },
    { check: 'count', selector: 'h2', count: 3, label: '`h1` 底下有三個 `h2`：新書通報、本月活動、借書小提醒' },
    { check: 'count', selector: 'article > h3', count: 2, label: '每本新書是一個 `article`，各有自己的 `h3`' },
    { check: 'style', selector: 'span.tag', property: 'background-color', value: '#ffe082', label: '`span.tag` 只是樣式的掛勾：底色來自 style.css' },
  ],
};

// ---- exercises --------------------------------------------------------------------------------------------------
const exSkeleton: WebExercise = {
  id: 'web02-ex-skeleton', title: '補齊文件骨架',
  statement: '這份文件少了三樣東西：第一行的文件類型宣告、`<html>` 上標示語言的 `lang`（繁體中文寫 `zh-Hant`），以及 `<head>` 裡文字為「小島圖書館」的 `<title>`。把它們補上，`<body>` 裡的內容不要動。',
  hints: [
    '對照第一節的範例，一行一行比：哪幾行這裡沒有？',
    '文件類型宣告要寫在整份文件的第一行；`lang` 是 `<html>` 開始標籤上的屬性。',
    '`<title>` 要放在 `<head>` 與 `</head>` 之間，文字是「小島圖書館」；它不會出現在頁面裡，而是出現在預覽上方的「分頁標題」。',
  ],
  explanation: '`<!DOCTYPE html>` 讓瀏覽器用標準模式顯示；`<html lang="zh-Hant">` 說明整頁的語言；`<title>` 是 `<head>` 的子元素，提供分頁、書籤與搜尋結果用的頁面名稱。三者都不改變 `<body>` 裡的畫面，卻是每一份文件結構正確的前提。',
  starter: { html: String.raw`<html>
<head>
  <meta charset="utf-8">
</head>
<body>
  <h1>歡迎光臨</h1>
  <p>這裡是島上唯一的公共圖書館。</p>
</body>
</html>` },
  solution: { html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>小島圖書館</title>
</head>
<body>
  <h1>歡迎光臨</h1>
  <p>這裡是島上唯一的公共圖書館。</p>
</body>
</html>` },
  steps: [
    { check: 'doctype', label: '文件以 `<!DOCTYPE html>` 開頭，瀏覽器用標準模式顯示' },
    { check: 'attr', selector: 'html', name: 'lang', value: 'zh', match: 'includes', label: '`html` 的 `lang` 標示為中文（例如 `zh-Hant`）' },
    { check: 'count', selector: 'head > title', count: 1, label: '`head` 裡有一個 `title`' },
    { check: 'text', selector: 'title', text: '小島圖書館', label: '`title` 的文字是「小島圖書館」' },
    { check: 'count', selector: 'body > h1', count: 1, label: '`body` 裡原本的 `h1` 還在' },
  ],
  mistakes: [
    { files: { html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
</head>
<body>
  <title>小島圖書館</title>
  <h1>歡迎光臨</h1>
  <p>這裡是島上唯一的公共圖書館。</p>
</body>
</html>` }, why: '把 `<title>` 寫在 `<body>` 裡。`<title>` 是關於這份文件的資訊，只能放在 `<head>`；想在頁面上顯示名稱，用的是 `<h1>`。' },
    { files: { html: String.raw`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>小島圖書館</title>
</head>
<body lang="zh-Hant">
  <h1>歡迎光臨</h1>
  <p>這裡是島上唯一的公共圖書館。</p>
</body>
</html>` }, why: '把 `lang` 寫在 `<body>` 上。這樣 `<html>` 本身和 `<head>` 裡的 `<title>` 都沒有語言資訊；整頁的語言要標在最外層的 `<html>`。' },
  ],
};

const SOUP = String.raw`<div class="header">
  <h1>小島圖書館</h1>
</div>
<div class="nav">
  <a href="#hours">開放時間</a>
  <a href="#news">新書通報</a>
</div>
<div class="main">
  <h2 id="hours">開放時間</h2>
  <p>週二至週日 9:00–17:00，週一休館。</p>
  <h2 id="news">新書通報</h2>
  <p>本月新進 12 本書。</p>
</div>
<div class="footer">
  <p>小島圖書館　島嶼路 1 號</p>
</div>`;

const exLandmarks: WebExercise = {
  id: 'web02-ex-landmarks', title: '把 div 換成地標',
  statement: '這一頁用四個 `<div>` 分出頁首、導覽、主要內容與頁尾，只靠 `class` 的名字說明用途。把四個 `<div>` 都換成對應的語意元素：含有 `h1` 的頁首用 `header`、兩個連結用 `nav`、兩個 `h2` 與它們的段落用 `main`、地址用 `footer`。文字與連結都要保留，`header` 與 `footer` 要在 `main` 外面，改完後頁面不再有任何 `<div>`。',
  hints: [
    '每個 `<div>` 的 `class` 已經說出它是什麼了：把標籤名稱換成那個字，`class` 就可以拿掉。',
    '開始標籤和結束標籤要一起改：`<div class="nav">` 換成 `<nav>`，對應的 `</div>` 換成 `</nav>`。',
    '四個元素依序是 `<header>`、`<nav>`、`<main>`、`<footer>`，彼此並排，都直接放在 `body` 底下。',
  ],
  explanation: '`header`、`nav`、`main`、`footer` 的畫面和 `div` 一樣，但它們各自建立一個地標區域：螢幕閱讀器的使用者可以直接跳到導覽或主要內容。`main` 只包這一頁獨有的內容，全站共用的頁首與頁尾放在它外面。',
  starter: { html: SOUP },
  solution: { html: String.raw`<header>
  <h1>小島圖書館</h1>
</header>
<nav>
  <a href="#hours">開放時間</a>
  <a href="#news">新書通報</a>
</nav>
<main>
  <h2 id="hours">開放時間</h2>
  <p>週二至週日 9:00–17:00，週一休館。</p>
  <h2 id="news">新書通報</h2>
  <p>本月新進 12 本書。</p>
</main>
<footer>
  <p>小島圖書館　島嶼路 1 號</p>
</footer>` },
  steps: [
    { check: 'count', selector: 'body > header h1', count: 1, label: '`h1` 在 `header` 裡，`header` 直接放在 `body` 底下' },
    { check: 'count', selector: 'nav a', count: 2, label: '兩個連結都在 `nav` 裡' },
    { check: 'count', selector: 'main', count: 1, label: '頁面只有一個 `main`' },
    { check: 'count', selector: 'main h2', count: 2, label: '兩個 `h2` 都在 `main` 裡' },
    { check: 'text', selector: 'body > footer', text: '島嶼路 1 號', match: 'includes', label: '地址在 `footer` 裡，`footer` 直接放在 `body` 底下' },
    { check: 'count', selector: 'div', count: 0, label: '頁面不再有任何 `div`' },
  ],
  mistakes: [
    { files: { html: String.raw`<main>
  <header>
    <h1>小島圖書館</h1>
  </header>
  <nav>
    <a href="#hours">開放時間</a>
    <a href="#news">新書通報</a>
  </nav>
  <h2 id="hours">開放時間</h2>
  <p>週二至週日 9:00–17:00，週一休館。</p>
  <h2 id="news">新書通報</h2>
  <p>本月新進 12 本書。</p>
  <footer>
    <p>小島圖書館　島嶼路 1 號</p>
  </footer>
</main>` }, why: '把整頁都包進 `<main>`。`main` 只放這一頁獨有的主要內容；`header` 與 `footer` 放進 `main` 之後，就不再是整個頁面的頁首與頁尾地標，「跳到主要內容」也失去意義。' },
    { files: { html: String.raw`<header>
  <h1>小島圖書館</h1>
</header>
<nav>
  <a href="#hours">開放時間</a>
  <a href="#news">新書通報</a>
</nav>
<main>
  <h2 id="hours">開放時間</h2>
  <p>週二至週日 9:00–17:00，週一休館。</p>
</main>
<main>
  <h2 id="news">新書通報</h2>
  <p>本月新進 12 本書。</p>
</main>
<footer>
  <p>小島圖書館　島嶼路 1 號</p>
</footer>` }, why: '每個主題各包一個 `<main>`，頁面就有兩個「主要內容」。一頁只放一個 `main`；主要內容裡要再分區，用的是 `<section>` 或 `<article>`。' },
  ],
};

const exHeadings: WebExercise = {
  id: 'web02-ex-headings', title: '修好標題層級',
  statement: '這一頁的標題是照「字要多大」挑的：有三個 `h1`，還從 `h1` 直接跳到 `h4`。請依照內容的結構改正標題的層級：「小島圖書館」是整頁唯一的主標題；「借書須知」與「聯絡我們」是它底下的兩個主題；「借閱期限」與「續借」是「借書須知」底下的小節。只改標題的標籤名稱，每個標題的 `id`、文字和三個段落都保留。',
  hints: [
    '先在紙上把大綱寫成縮排的清單：哪些標題是並列的，哪個在哪個底下？',
    '主標題是第一層，它底下的主題是第二層，主題底下的小節是第三層：每往下一層，數字只加一。',
    '「借書須知」與「聯絡我們」用 `h2`；「借閱期限」與「續借」用 `h3`。記得開始標籤與結束標籤都要改。',
  ],
  explanation: '標題層級表達的是「誰在誰底下」，不是字的大小。一個 `h1` 當整頁的主標題，兩個主題並列用 `h2`，「借書須知」的兩個小節往下一層用 `h3`；從 `h3`「續借」回到 `h2`「聯絡我們」是往上回到較高的層級，不算跳級。字要多大，之後交給 CSS。',
  starter: { html: String.raw`<h1 id="site">小島圖書館</h1>
<h1 id="rules">借書須知</h1>
<h4 id="period">借閱期限</h4>
<p>每本書可借 14 天。</p>
<h4 id="renew">續借</h4>
<p>到期前可續借一次。</p>
<h1 id="contact">聯絡我們</h1>
<p>電話：分機 12。</p>` },
  solution: { html: String.raw`<h1 id="site">小島圖書館</h1>
<h2 id="rules">借書須知</h2>
<h3 id="period">借閱期限</h3>
<p>每本書可借 14 天。</p>
<h3 id="renew">續借</h3>
<p>到期前可續借一次。</p>
<h2 id="contact">聯絡我們</h2>
<p>電話：分機 12。</p>` },
  steps: [
    { check: 'headings', label: '標題形成大綱：只有一個 `h1` 且在最前面，往下沒有跳過層級' },
    { check: 'text', selector: 'h1', text: '小島圖書館', label: '主標題（`h1`）是「小島圖書館」' },
    { check: 'count', selector: 'h2#rules, h2#contact', count: 2, label: '「借書須知」與「聯絡我們」是主標題底下的第二層標題' },
    { check: 'count', selector: 'h3#period, h3#renew', count: 2, label: '「借閱期限」與「續借」是「借書須知」底下的第三層標題' },
    { check: 'count', selector: 'p', count: 3, label: '三段說明文字仍然是段落' },
  ],
  mistakes: [
    { files: { html: String.raw`<h1 id="site">小島圖書館</h1>
<h2 id="rules">借書須知</h2>
<h4 id="period">借閱期限</h4>
<p>每本書可借 14 天。</p>
<h4 id="renew">續借</h4>
<p>到期前可續借一次。</p>
<h2 id="contact">聯絡我們</h2>
<p>電話：分機 12。</p>` }, why: '只把多出來的 `h1` 改成 `h2`，小節仍然是 `h4`。從 `h2` 直接到 `h4` 跳過了 `h3`，用標題瀏覽頁面的人會以為中間少了一層內容。想要小一點的字，是 CSS 的工作。' },
    { files: { html: String.raw`<h1 id="site">小島圖書館</h1>
<h2 id="rules">借書須知</h2>
<h2 id="period">借閱期限</h2>
<p>每本書可借 14 天。</p>
<h2 id="renew">續借</h2>
<p>到期前可續借一次。</p>
<h2 id="contact">聯絡我們</h2>
<p>電話：分機 12。</p>` }, why: '把所有標題都改成 `h2`。這樣沒有跳級，但四個標題變成並列，看不出「借閱期限」與「續借」屬於「借書須知」；小節要比它所屬的主題深一層。' },
  ],
};

const exArticle: WebExercise = {
  id: 'web02-ex-article-page', title: '從說明做出一頁活動公告',
  statement: '這份文件的骨架已經有了，但標題是「未命名」，內容全是 `<p>`。請改成一頁結構完整的活動公告：（1）`<title>` 裡要有「夏日閱讀節」；（2）頁面有一個 `main`，裡面用一個 `article` 包住整篇公告；（3）在 `article` 裡，「夏日閱讀節」是 `h1`、「報名方式」是 `h2`，另外兩行說明維持段落；（4）最後一行的地址放進 `footer`，`footer` 在 `main` 外面、直接放在 `body` 底下。',
  hints: [
    '先分清楚哪幾行是標題、哪幾行是說明文字，再決定哪些內容屬於公告本身、哪一行是全站共用的頁尾。',
    '由外而內包：`<main>` 裡放 `<article>`，`<article>` 裡依序是 `h1`、段落、`h2`、段落；`</main>` 之後才是 `<footer>`。',
    '別忘了 `<head>`：把 `<title>` 的「未命名」換成含有「夏日閱讀節」的文字，例如「夏日閱讀節｜小島圖書館」。',
  ],
  explanation: '`<title>` 讓分頁與搜尋結果說得出這一頁是什麼；`main` 標出這一頁獨有的內容；公告可以單獨轉貼、獨立閱讀，所以用 `article`；`h1` 與 `h2` 排出兩層大綱；地址是全站共用的資訊，放在 `main` 外面的 `footer`，成為頁尾地標。',
  starter: { html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>未命名</title>
</head>
<body>
  <p>夏日閱讀節</p>
  <p>7 月 12 日在小島圖書館一樓，整天都有活動。</p>
  <p>報名方式</p>
  <p>到櫃台填寫報名表即可。</p>
  <p>小島圖書館　島嶼路 1 號</p>
</body>
</html>` },
  solution: { html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>夏日閱讀節｜小島圖書館</title>
</head>
<body>
  <main>
    <article>
      <h1>夏日閱讀節</h1>
      <p>7 月 12 日在小島圖書館一樓，整天都有活動。</p>
      <h2>報名方式</h2>
      <p>到櫃台填寫報名表即可。</p>
    </article>
  </main>
  <footer>
    <p>小島圖書館　島嶼路 1 號</p>
  </footer>
</body>
</html>` },
  steps: [
    { check: 'text', selector: 'head > title', text: '夏日閱讀節', match: 'includes', label: '`title` 裡有「夏日閱讀節」' },
    { check: 'count', selector: 'main', count: 1, label: '頁面有一個 `main`' },
    { check: 'text', selector: 'main article h1', text: '夏日閱讀節', label: '`main` 裡的 `article` 以 `h1`「夏日閱讀節」為標題' },
    { check: 'text', selector: 'main article h2', text: '報名方式', label: '`article` 裡的「報名方式」是 `h2`' },
    { check: 'text', selector: 'body > footer', text: '島嶼路 1 號', match: 'includes', label: '地址在 `footer` 裡，`footer` 直接放在 `body` 底下' },
    { check: 'headings', label: '標題形成大綱：只有一個 `h1` 且在最前面，往下沒有跳過層級' },
  ],
  mistakes: [
    { files: { html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>夏日閱讀節｜小島圖書館</title>
</head>
<body>
  <main>
    <article>
      <h1>夏日閱讀節</h1>
      <p>7 月 12 日在小島圖書館一樓，整天都有活動。</p>
      <h2>報名方式</h2>
      <p>到櫃台填寫報名表即可。</p>
    </article>
    <footer>
      <p>小島圖書館　島嶼路 1 號</p>
    </footer>
  </main>
</body>
</html>` }, why: '把 `<footer>` 放在 `<main>` 裡面。這樣它只是主要內容的結尾，不是整個頁面的頁尾地標；全站共用的頁尾要放在 `main` 外面。' },
    { files: { html: String.raw`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>夏日閱讀節｜小島圖書館</title>
</head>
<body>
  <main>
    <article>
      <h1>夏日閱讀節</h1>
      <p>7 月 12 日在小島圖書館一樓，整天都有活動。</p>
      <h1>報名方式</h1>
      <p>到櫃台填寫報名表即可。</p>
    </article>
  </main>
  <footer>
    <p>小島圖書館　島嶼路 1 號</p>
  </footer>
</body>
</html>` }, why: '兩個標題都用 `<h1>`。「報名方式」是公告底下的一個小節，不是另一個主標題；它比 `h1` 深一層，要用 `h2`。' },
  ],
};

// ---- the lesson -------------------------------------------------------------------------------------------------
export const WEB02: LessonContent = {
  lessonId: 'WEB02',
  motivation: '同一段文字可以全部塞進 `<div>`，也可以寫成有頁首、導覽、主要內容和標題的文件；畫面看起來差不多，但瀏覽器、搜尋引擎和螢幕閱讀器讀到的是兩份完全不同的東西。這一課從每份 HTML 都有的骨架開始，學會用語意元素、地標區域與標題層級，寫出不靠外觀也看得懂的頁面。',
  sections: [
    {
      id: 'web02-skeleton-section', title: '文件骨架：每一頁都有的那幾行',
      blocks: [
        { type: 'p', text: '只寫幾個標籤，瀏覽器也顯示得出頁面：它很寬容，缺什麼就自己補。但是一份要放上網路的 HTML 檔案，開頭應該有固定的幾行，告訴瀏覽器四件事：這是哪一種文件、用什麼語言寫的、文字用什麼編碼存的、這一頁叫什麼名字。這幾行加上包住內容的 `<body>`，就是 HTML 的文件結構（document structure）。下面是小島圖書館首頁最小的完整版本：' },
        { type: 'example', id: 'web02-skeleton' },
        { type: 'table', head: ['寫法', '作用', '少了它會怎樣'], rows: [
          ['`<!DOCTYPE html>`', '文件類型宣告，必須在第一行。它不是元素，只是告訴瀏覽器「請照現行標準顯示」', '瀏覽器改用相容模式（quirks mode）排版'],
          ['`<html lang="zh-Hant">`', '根元素，包住整份文件；`lang` 標示整頁的語言，`zh-Hant` 是繁體中文', '螢幕閱讀器可能用錯誤語言的發音朗讀；翻譯功能與中文字型的挑選也少了依據'],
          ['`<head>`', '關於這份文件的資訊，內容不會顯示在頁面上', '（瀏覽器會自動補上空的 `head`）'],
          ['`<meta charset="utf-8">`', '說明檔案的文字以 UTF-8 編碼儲存，要寫在 `<head>` 的最前面', '瀏覽器只能猜編碼，猜錯時中文會變成亂碼'],
          ['`<meta name="viewport" content="width=device-width, initial-scale=1">`', '請手機瀏覽器用螢幕實際的寬度排版，不要假裝成寬螢幕再縮小（細節在響應式設計島）', '手機上整頁被縮得很小，要放大才看得清楚'],
          ['`<title>`', '頁面的名稱：顯示在瀏覽器分頁、書籤，也常是搜尋結果裡的標題', '分頁上只看得到檔名或網址'],
          ['`<body>`', '所有要顯示給讀者看的內容', '（瀏覽器會自動補上 `body`）'],
        ] },
        { type: 'p', text: '看預覽上方的「分頁標題：小島圖書館」：它來自 `<title>`，頁面裡看到的大字「歡迎光臨」則來自 `<h1>`，兩者是不同的東西。再打開「瀏覽器建立的 DOM 樹」：`html` 底下只有 `head` 與 `body` 兩個子元素，`head` 裡的三行都沒有出現在畫面上。' },
        { type: 'callout', tone: 'tip', title: '動手試：刪掉第一行', text: '按「動手改這個範例」，把 `<!DOCTYPE html>` 整行刪掉再按「執行」。這麼小的頁面在預覽裡看不出差別，但 DOM 樹下方會多一行提醒：沒有 `<!DOCTYPE html>` 的文件，瀏覽器會以相容模式（quirks mode）顯示。相容模式是為了很久以前的網頁保留的：瀏覽器直接開啟這樣的檔案時，會模仿早期瀏覽器的排版方式，例如表格裡的文字不會沿用外層設定的字型大小，同一份 CSS 可能排出不一樣的結果。有 `<!DOCTYPE html>` 才是標準模式（standards mode），之後學的 CSS 都以它為準。' },
        { type: 'callout', tone: 'warning', title: 'title 元素不是頁面上的標題', text: '初學者常以為寫了 `<title>` 頁面上就會出現標題，或是反過來只寫 `<h1>` 而漏掉 `<title>`。`<title>` 屬於 `<head>`，給分頁、書籤和搜尋結果用，頁面裡看不到；`<h1>` 屬於 `<body>`，是讀者在頁面裡看到的主標題。兩個都要寫，文字可以不同：`<title>` 通常會加上網站名稱，例如「開放時間｜小島圖書館」。' },
        { type: 'p', text: '為了讓篇幅短一點，接下來的範例與部分練習只寫 `<body>` 裡面的內容，本站的預覽會自動替它包上 `<!DOCTYPE html>`、`<html lang="zh-Hant">`、`<head>` 與 `<body>`。自己建立 .html 檔案時沒有人幫你補，骨架要完整寫出來。' },
      ],
    },
    {
      id: 'web02-elements-section', title: '元素、標籤、屬性，以及誰可以放在誰裡面',
      blocks: [
        { type: 'p', text: '先把三個名詞分清楚。標籤（tag）是角括號包起來的記號，例如開始標籤 `<p>` 與結束標籤 `</p>`；元素（element）是開始標籤、內容與結束標籤合起來的整體，也就是 DOM 樹上的一個節點；屬性（attribute）寫在開始標籤裡，格式是 `名稱="值"`，多個屬性用空白隔開，用來補充這個元素的資訊。幾個到處都能用的屬性：`id` 替元素取一個在整頁不重複的名字，`class` 替元素分類（很多元素可以用同一個 `class`），`lang` 標示語言。' },
        { type: 'p', text: '元素可以一層包一層，稱為巢狀（nesting）。規則只有一條：後開始的要先結束，像一組一組的括號。`<p><a href="#news">新書</a></p>` 是對的（`<a>` 是連結，WEB03 會詳細介紹）；`<p><a href="#news">新書</p></a>` 把兩組標籤交叉了，是錯的。另外有一小群元素沒有內容，也就沒有結束標籤，稱為空元素（void element）：這一課用到的 `<meta>` 與 `<br>`（段落內換行），以及之後會學的 `<img>`、`<input>`、`<hr>`、`<link>`。有人習慣寫成 `<br />`，瀏覽器會忽略那一條斜線，效果相同。' },
        { type: 'example', id: 'web02-nesting' },
        { type: 'p', text: '打開這個範例的 DOM 樹，找到 `p#notice.alert` 這一行，它就是 `<p id="notice" class="alert">`：`id` 以 `#`、`class` 以 `.` 表示。接著看結構：原始碼把 `<div>` 寫在 `<p>` 裡面，DOM 樹上的 `div` 卻跟 `p` 並排，後面還多了一個沒有內容的 `p`。原因是段落 `<p>` 裡只能放文字和 `<a>`、`<span>`、`<br>` 這類行內的元素；瀏覽器一讀到 `<div>` 就自動把段落結束，等到後面那個 `</p>` 出現時已經沒有段落可以結束，它就當成一個空的段落補進去。' },
        { type: 'callout', tone: 'warning', title: '段落 p 裡不能放區塊元素', text: '`<div>`、標題（`<h1>`–`<h6>`）、下一節會介紹的 `<header>`、`<section>` 這類區塊元素，甚至另一個 `<p>`，只要出現在還沒結束的 `<p>` 裡，瀏覽器都會先把那個段落結束。頁面不會顯示任何錯誤，但 DOM 的結構已經和你寫的不一樣，之後 CSS 選不到、間距多出一段，原因常常就在這裡。需要一個能裝區塊的容器時，用 `<div>` 或下一節的語意元素，不要用 `<p>`。' },
        { type: 'table', head: ['寫法', '問題', '瀏覽器實際建立的結構'], rows: [
          ['`<p>公告<div>15:00 閉館</div></p>`', '`<p>` 裡放了區塊元素', '一個 `p`、一個 `div`、再一個空的 `p`，三者並排'],
          ['`<p>第一段<p>第二段`', '段落沒有寫結束標籤', '兩個並排的 `p`（新的 `<p>` 會先結束前一個）'],
          ['`<br>地址</br>`', '空元素不該有結束標籤', '`</br>` 會被當成另一個 `<br>`，多出一次換行'],
        ] },
      ],
    },
    {
      id: 'web02-semantic-section', title: '語意元素：讓標籤說出內容是什麼',
      blocks: [
        { type: 'p', text: '`<div>` 的意思是「一個區塊」，除此之外什麼都沒說。早期的網頁把每一塊內容都放進 `<div>`，再用 `class="header"`、`class="nav"` 這樣的名字提醒自己它是什麼；這種寫法常被戲稱為 div 湯（div soup）。問題在於 `class` 的名字是作者自己取的，瀏覽器和其他程式並不懂。下面這一頁在螢幕上看起來很正常，但請看它在瀏覽器裡的事實：' },
        { type: 'example', id: 'web02-div-soup' },
        { type: 'p', text: '「小島圖書館」和「開放時間」看起來像標題，是因為 style.css 把字放大、加粗；在 DOM 樹裡，它們和其他文字一樣只是 `div`。對只能「讀結構」的讀者來說，這一頁沒有標題、沒有導覽，也分不出哪裡是主要內容。語意元素（semantic element）就是名稱本身說明了內容角色的元素，HTML 為頁面上常見的區塊準備了這幾個：' },
        { type: 'table', head: ['元素', '放什麼', '注意'], rows: [
          ['`<header>`', '頁首：網站名稱、標誌、主選單', '也可以用在 `<article>` 裡，當那篇內容的開頭'],
          ['`<nav>`', '主要的導覽連結', '只包主要的幾組導覽連結（例如主選單），不必把頁面上每一組連結都包成 `<nav>`'],
          ['`<main>`', '這一頁獨有的主要內容', '一頁只放一個；不能放在 `<header>`、`<nav>`、`<article>`、`<section>`、`<aside>`、`<footer>` 裡面'],
          ['`<article>`', '可以獨立閱讀、單獨轉貼的一篇內容：公告、文章、一則留言、一張商品卡', '通常有自己的標題'],
          ['`<section>`', '依主題分出來的一節', '通常以一個標題開頭；只是為了套樣式而包一層時，用 `<div>`'],
          ['`<aside>`', '和主要內容有關但可以略過的補充：小提醒、相關連結', '拿掉它，主要內容仍然完整'],
          ['`<footer>`', '頁尾：聯絡方式、版權聲明', '也可以用在 `<article>` 裡，當那篇內容的結尾'],
        ] },
        { type: 'p', text: '把上面那一頁用語意元素重寫，文字一個字都沒改，連 style.css 都不需要了：' },
        { type: 'example', id: 'web02-semantic' },
        { type: 'p', text: '比較兩個預覽，外觀差不多；比較兩棵 DOM 樹，差別就很大：後者光看標籤名稱就讀得出「頁首裡有網站名稱與主選單、主要內容分兩節、最後是頁尾」。這份結構有三種讀者。第一是輔助科技，例如替視障使用者朗讀畫面的螢幕閱讀器（screen reader），它靠元素的種類告訴使用者「這是導覽」「這是主要內容」。第二是搜尋引擎等自動讀取網頁的程式，它們同樣讀結構來判斷頁面的主題與重點。第三是維護這份程式碼的人，包括幾個月後的你：`</main>` 比一長串分不清是誰的 `</div>` 好讀得多。範例裡兩個 `<nav>` 上的 `aria-label` 屬性，下一節說明。' },
        { type: 'callout', tone: 'warning', title: '不要因為「長得像」而選元素', text: '語意元素本身幾乎沒有外觀：`<header>`、`<main>`、`<section>`、`<footer>` 在畫面上和 `<div>` 一模一樣。常見的錯誤是反過來挑：想要粗體大字就用 `<h1>`、想要一塊框起來的區域就用 `<section>`。選元素只看內容「是什麼」，外觀全部交給 CSS。另一個常見錯誤是把 `<section>` 當成新版的 `<div>` 到處包；說不出這一節的標題是什麼，它多半就不該是 `<section>`。' },
      ],
    },
    {
      id: 'web02-landmarks-section', title: '地標區域：不用從頭讀到尾',
      blocks: [
        { type: 'p', text: '看得見畫面的人打開網頁，眼睛一掃就略過頁首和選單，直接看內容。使用螢幕閱讀器的人沒辦法「掃一眼」，如果只能從第一個字聽到最後一個字，每換一頁都要把同樣的選單再聽一遍。地標區域（landmark）解決的就是這件事：頁面上幾個有固定角色的大區塊，螢幕閱讀器可以列出它們，並提供快速鍵讓使用者在地標之間跳躍，例如直接跳到主要內容。上一節的語意元素，有幾個會自動成為地標：' },
        { type: 'table', head: ['元素', '成為哪一種地標', '條件'], rows: [
          ['`<header>`', '頁首（banner）', '屬於整個頁面時；放在 `<main>`、`<article>`、`<section>`、`<aside>`、`<nav>` 裡面的不算'],
          ['`<nav>`', '導覽（navigation）', '一律是地標'],
          ['`<main>`', '主要內容（main）', '一律是地標，一頁一個'],
          ['`<aside>`', '補充內容（complementary）', '不在 `<article>`、`<section>`、`<nav>` 或另一個 `<aside>` 裡面時'],
          ['`<footer>`', '頁尾（contentinfo）', '屬於整個頁面時；條件和 `<header>` 相同'],
          ['`<section>`', '區域（region）', '只有在用 `aria-label` 等方式取了名字時才是地標'],
        ] },
        { type: 'p', text: '`<article>` 和沒有名字的 `<section>` 不是地標，`<div>` 當然也不是。這說明了為什麼上一節那一頁 div 湯對螢幕閱讀器的使用者特別不方便：地標清單是空的，想找開放時間只能從頭聽。' },
        { type: 'p', text: '回到上一節的「改寫後」範例。它有兩個 `<nav>`：頁首的主選單和頁尾的連結。同一種地標出現兩次時，清單上會有兩個「導覽」，使用者分不出哪個是哪個，所以各加了一個 `aria-label` 屬性替它取名字：`aria-label="主選單"` 與 `aria-label="頁尾連結"`，清單上就會出現類似「主選單，導覽」與「頁尾連結，導覽」這樣分得出來的兩項（實際的唸法依軟體而不同）。名字裡不必再寫「導覽」兩個字，元素的種類已經說了。`aria-label` 屬於 ARIA，是補充無障礙資訊的一組屬性，WEB13 會完整介紹；這裡只要記得：同一種地標有兩個以上時，替它們取名字。' },
        { type: 'callout', tone: 'note', title: '地標要少而準', text: '地標的用途是讓人快速跳到幾個大區塊，所以數量要少：一個頁首、一兩個導覽、一個主要內容、一個頁尾，最多再加一兩個補充區塊，通常就夠了。把每一小塊都做成地標，清單變得又長又雜，就失去跳躍的意義。另外，一個正式的頁面裡，看得見的內容最好都落在某個地標之內，不要有幾段文字孤零零地直接放在 `<body>` 底下。' },
        { type: 'list', items: [
          '`<main>` 只有一個，裡面是這一頁獨有的內容。',
          '每一頁都重複出現的網站名稱、主選單、聯絡資訊，放在 `<main>` 外面的 `<header>`、`<nav>`、`<footer>`。',
          '整頁的 `<header>` 與 `<footer>` 不要放進 `<main>`、`<article>`、`<section>` 這些元素裡，放進去就不再是整個頁面的頁首與頁尾地標；最單純的做法是直接放在 `<body>` 底下。',
          '同一種地標有兩個以上（例如兩個 `<nav>`）時，各用 `aria-label` 取不同的名字。',
        ] },
      ],
    },
    {
      id: 'web02-headings-section', title: '標題層級：頁面的大綱',
      blocks: [
        { type: 'p', text: '地標把頁面分成幾個大區塊，標題則排出內容的大綱。HTML 有六個標題元素 `<h1>` 到 `<h6>`，數字代表層級：`<h1>` 是整頁的主標題，`<h2>` 是它底下的主題，`<h3>` 是 `<h2>` 底下的小節，依此類推。這套標題層級（heading level）就像一本書的章、節、小節。螢幕閱讀器可以列出頁面上所有的標題，也能在標題之間跳躍；看得見畫面的人同樣是先掃標題，再決定要讀哪一段。要讓這份大綱可靠，照三條規則寫：' },
        { type: 'list', ordered: true, items: [
          '一頁一個 `<h1>`，說明這一頁在講什麼，而且它是頁面上的第一個標題。',
          '往下一層時不要跳級：`<h2>` 底下的小節用 `<h3>`，不要直接用 `<h4>`。往回走則可以跨層，例如一個 `<h3>` 小節結束後，接著的下一個主題回到 `<h2>`。',
          '層級由內容的結構決定，不是由字的大小決定。',
        ] },
        { type: 'example', id: 'web02-headings' },
        { type: 'p', text: '這一頁的標題依序是 h1、h2、h3、h3、h2、h3、h2，寫成大綱就是：小島圖書館底下有「新書通報」（含兩本書）、「本月活動」（含親子說故事）與「借書小提醒」三個主題。兩本書各是一個 `<article>`，各有自己的 `<h3>`；「借書小提醒」雖然放在 `<aside>` 裡，它的標題仍然是整頁大綱的一部分，所以用 `<h2>`。按「動手改這個範例」，把「親子說故事」的 `<h3>` 改成 `<h5>` 再執行：字變小了，但大綱從第二層直接掉到第五層，中間的兩層並不存在。' },
        { type: 'callout', tone: 'warning', title: '不要用字的大小挑標題', text: '瀏覽器預設會把層級高的標題顯示得比較大，於是很多人「覺得這裡字該小一點」就用 `<h4>`，「想要大字」就再放一個 `<h1>`。瀏覽器不會因此顯示任何錯誤，但大綱會出現根本不存在的層級，或是有兩個主標題。先依結構決定層級，字的大小之後用 CSS 的 `font-size` 調整，`<h2>` 可以很小，`<h3>` 也可以很大。反過來也一樣：只是想讓一句話變大、變粗，而它不是任何內容的標題，就不要用標題元素。' },
        { type: 'p', text: '練習裡的「標題形成大綱」檢查看的就是前兩條規則：頁面上的第一個標題是 `<h1>`、之後沒有第二個 `<h1>`、每個標題最多只比前一個標題深一層。第三條規則程式檢查不出來，要靠你自己判斷內容之間「誰在誰底下」。' },
      ],
    },
    {
      id: 'web02-div-span-section', title: 'div 與 span 什麼時候是對的',
      blocks: [
        { type: 'p', text: '學了語意元素，不代表 `<div>` 從此不能用。`<div>` 和 `<span>` 是 HTML 刻意保留的兩個「沒有意思」的元素：`<div>` 是區塊的容器，前後會換行；`<span>` 是行內的容器，包住一行裡的幾個字，不會換行。當你需要把幾個元素圈在一起，或把幾個字標出來，目的只是讓 CSS 或 JavaScript 找得到它們，而這一圈內容本身沒有特別的角色，用它們就是正確的選擇。' },
        { type: 'p', text: '回頭看上一節的範例。`<div class="cards">` 把兩本新書圈在一起，只為了讓 style.css 在左邊畫一條線；這一圈不是一節內容（它的標題「新書通報」在外面），也不是地標，所以用 `<div>`。`<span class="tag">` 把「新書」兩個字標出來，只為了加上底色；它不是標題，也不是連結，所以用 `<span>`。`class` 的名字在這裡是給樣式用的掛勾，這正是 `class` 的本來用途。把那個範例的 `<div class="cards">` 改成 `<section class="cards">` 並不會比較「語意」：它沒有自己的標題，也沒有多說明任何事。' },
        { type: 'p', text: '所以問題從來不是「能不能用 `<div>`」，而是順序：先找有沒有更貼切的元素，都不適合才用 `<div>` 或 `<span>`。替一塊內容挑元素時，可以依序問自己：' },
        { type: 'list', ordered: true, items: [
          '它是這一塊內容的標題嗎？是的話用 `<h1>`–`<h6>`，層級看結構。',
          '它是頁首、導覽、主要內容、補充或頁尾嗎？用 `<header>`、`<nav>`、`<main>`、`<aside>`、`<footer>`。',
          '它是一篇可以單獨拿出去看的內容嗎？用 `<article>`。它是有標題的一節嗎？用 `<section>`。',
          '它是一段文字嗎？用 `<p>`。（連結、清單、圖片與表單各有自己的元素，在 WEB03 與 WEB04。）',
          '以上都不是，只是為了排版或給程式找到它：區塊用 `<div>`，一行裡的幾個字用 `<span>`。',
        ] },
        { type: 'callout', tone: 'tip', title: '交出頁面前的檢查清單', text: '第一行是 `<!DOCTYPE html>`；`<html>` 有 `lang`；`<head>` 裡有 `<meta charset="utf-8">` 與一個說得出這一頁是什麼的 `<title>`；頁面有一個 `<main>`，頁首與頁尾在它外面；有一個 `<h1>`，往下的標題沒有跳級；每個 `<div>` 與 `<span>` 都說得出「為什麼不是別的元素」。最後打開 DOM 樹，確認瀏覽器建立的結構和你心裡想的一樣。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'web02-q1', prompt: '一份 HTML 檔案漏寫了第一行的 `<!DOCTYPE html>`，其餘都正確。瀏覽器開啟它時會怎麼做？',
      options: ['拒絕顯示，並在頁面上印出錯誤訊息', '把整份檔案當成純文字，連標籤一起顯示出來', '照樣顯示頁面，但改用相容模式（quirks mode）排版', '自動補上 `<!DOCTYPE html>`，所以和有寫完全一樣'],
      answer: 2,
      explanation: '少了文件類型宣告，瀏覽器仍然會顯示頁面，只是改用模仿早期瀏覽器的相容模式，CSS 的排版結果可能和標準模式不同。瀏覽器對 HTML 很寬容，不會拒絕顯示，也不會把它當成純文字；它會補上缺少的 `head`、`body` 等元素，但不會替你補上文件類型宣告，所以和有寫並不一樣。',
    },
    {
      id: 'web02-q2', prompt: '瀏覽器分頁上顯示的頁面名稱是從哪裡來的？',
      options: ['`<head>` 裡的 `<title>`', '`<body>` 裡的第一個 `<h1>`', '`<html>` 的 `lang` 屬性', '`<meta charset="utf-8">`'],
      answer: 0,
      explanation: '分頁、書籤上的名稱來自 `<head>` 裡的 `<title>`，它不會出現在頁面內容裡。`<h1>` 是頁面裡看得到的主標題，文字可以和 `<title>` 不同，不會自動變成分頁名稱；`lang` 標示的是頁面的語言；`<meta charset>` 說明檔案的文字編碼，兩者都和頁面名稱無關。',
    },
    {
      id: 'web02-q3', prompt: '瀏覽器讀完這段 HTML 之後，DOM 裡的結構是什麼？',
      code: { language: 'HTML', text: '<p>開放時間\n  <div>週二至週日</div>\n</p>' },
      options: ['一個 `p`，`div` 是它的子元素', '一個 `p`，`div` 因為放錯位置而被丟掉', '兩個 `p`，`div` 在第二個 `p` 裡面', '兩個 `p`，`div` 夾在它們中間，不在任何 `p` 裡面'],
      answer: 3,
      explanation: '`<p>` 裡不能放 `<div>` 這類區塊元素：瀏覽器讀到 `<div>` 時先把段落結束，所以 `div` 排在第一個 `p` 的後面；最後落單的 `</p>` 找不到可以結束的段落，被補成一個空的 `p`。因此是兩個 `p` 中間夾著 `div`。`div` 不會留在 `p` 裡，也不會被丟掉；第二個 `p` 是空的，裡面沒有 `div`。',
    },
    {
      id: 'web02-q4', prompt: '關於 `<main>`，下列哪一項敘述正確？',
      options: ['頁面上每個主題區塊都應該各用一個 `<main>` 包起來', '一頁只放一個，包住這一頁獨有的主要內容', '`<main>` 應該把頁首 `<header>` 與頁尾 `<footer>` 都包在裡面', '`<main>` 只是 `<div>` 的另一種寫法，對任何讀者都沒有差別'],
      answer: 1,
      explanation: '`<main>` 標出這一頁獨有的主要內容，一頁只放一個，螢幕閱讀器的使用者可以直接跳到它。主題區塊要再細分時用 `<section>` 或 `<article>`，不是多個 `<main>`；每一頁都重複的頁首與頁尾放在 `<main>` 外面，放進去就不再是整頁的地標；`<main>` 的外觀雖然和 `<div>` 一樣，但它會建立「主要內容」地標，`<div>` 不會。',
    },
    {
      id: 'web02-q5', prompt: '「開放時間」是 `<h1>` 底下的第一層主題。設計稿上它的字只比內文大一點點。應該怎麼寫？',
      options: ['用 `<h4>`，因為它預設的字比較小', '用 `<h2>`，字的大小再用 CSS 調整', '用 `<div>`，再用 CSS 把字加粗', '用第二個 `<h1>`，再用 CSS 把字縮小'],
      answer: 1,
      explanation: '層級由結構決定：`<h1>` 底下的第一層主題是 `<h2>`，字要多大交給 CSS。用 `<h4>` 會從第一層跳到第四層，大綱裡多出不存在的兩層；用 `<div>` 加粗只是看起來像標題，螢幕閱讀器的標題清單裡不會有它；再放一個 `<h1>` 會讓頁面有兩個主標題，層級也不對。',
    },
    {
      id: 'web02-q6', prompt: '頁面有兩個 `<nav>`：頁首的主選單和頁尾的連結。怎麼做才能讓螢幕閱讀器的使用者在地標清單上分得出它們？',
      options: ['把頁尾的 `<nav>` 改成 `<div>`', '替兩個 `<nav>` 加上不同的 `class`', '把頁尾的 `<nav>` 搬進 `<main>` 裡', '替兩個 `<nav>` 各加上不同的 `aria-label`'],
      answer: 3,
      explanation: '同一種地標出現兩次時，用 `aria-label` 替它們各取一個名字（例如「主選單」與「頁尾連結」），地標清單上就分得出來。改成 `<div>` 會讓頁尾的連結不再是導覽地標，使用者反而找不到；`class` 是給 CSS 與程式用的掛勾，輔助科技不會把它唸成名字；搬進 `<main>` 並沒有替它取名字，還把不屬於主要內容的連結放錯了地方。',
    },
    {
      id: 'web02-q7', prompt: '下列哪一種情況最適合用 `<div>`？',
      options: ['只是為了讓 CSS 把三張卡片排在一起，需要在外面包一層', '包住每一頁都會出現的網站導覽連結', '包住這一頁獨有的主要內容', '包住一則可以單獨轉貼的活動公告'],
      answer: 0,
      explanation: '`<div>` 是沒有意思的區塊容器，適合「只為了排版或樣式而包一層」的情況：那一圈內容本身沒有角色。網站的導覽連結有專屬的 `<nav>`，主要內容有 `<main>`，可以獨立閱讀、單獨轉貼的公告是 `<article>`；這三種情況都有更貼切的語意元素，用 `<div>` 就把這些資訊丟掉了。',
    },
    {
      id: 'web02-q8', prompt: '下列哪一組標題順序符合「只有一個 `h1` 且在最前面，往下一層時不跳級」？',
      options: ['h1、h3、h2、h3', 'h1、h2、h4、h2', 'h1、h2、h3、h3、h2', 'h1、h2、h1、h2'],
      answer: 2,
      explanation: 'h1、h2、h3、h3、h2 每次往下都只深一層；最後從 h3 回到 h2 是往上回到較高的層級，不算跳級。h1、h3 從第一層直接跳到第三層；h2、h4 跳過了 h3；h1、h2、h1、h2 有兩個 `h1`，頁面就有兩個主標題。',
    },
  ],
  webCode: {
    examples: [skeleton, nesting, divSoup, semantic, headings],
    exercises: [exSkeleton, exLandmarks, exHeadings, exArticle],
  },
};
