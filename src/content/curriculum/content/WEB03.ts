import type { WebLessonContent } from '@/lib/webcode/lesson';
import type { LessonContent } from '../schema';

/*
 * WEB03 Text, links, images and media (WEB-1). A web-code lesson set in a made-up island library (小島圖書館): text-level
 * meaning (em, strong, lists, blockquote, br), links and in-page anchors, relative and absolute addresses, new-tab
 * links with rel="noopener", image alt text and width/height, figure/figcaption, and audio/video with source and
 * track. The frame has no network: images are inline SVG data: URIs; media and caption file names are made up, so the
 * players appear but cannot play, and every check reads markup (attributes, structure, recorded link targets).
 */

/** A 240 × 160 drawing: a white lighthouse with a red top by the sea. */
const LIGHTHOUSE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='160'%3E%3Crect width='240' height='160' fill='%23bbdefb'/%3E%3Crect y='120' width='240' height='40' fill='%231976d2'/%3E%3Cpath d='M106 120l7-78h14l7 78z' fill='white'/%3E%3Crect x='110' y='28' width='20' height='14' fill='%23e53935'/%3E%3C/svg%3E";
/** A 240 × 12 decorative wave line. */
const WAVE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='12'%3E%3Cpath d='M0 6q15-10 30 0t30 0 30 0 30 0 30 0 30 0 30 0 30 0' fill='none' stroke='%231976d2' stroke-width='2'/%3E%3C/svg%3E";
/** A 32 × 32 map pin. */
const PIN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='12' r='9' fill='%23e53935'/%3E%3Cpath d='M9 18h14l-7 13z' fill='%23e53935'/%3E%3C/svg%3E";

const webCode: WebLessonContent = {
  examples: [
    {
      id: 'web03-text', title: '借書須知：強調、清單、引言與換行',
      description: '同一頁用了 `strong`、`em`、有序清單 `ol`、無序清單 `ul`、`blockquote` 與 `br`。編號與圓點都是瀏覽器畫的，HTML 裡沒有寫。',
      files: { html: `<h1>借書須知</h1>
<p>每張借書證一次最多借 5 本，借期 21 天。<strong>逾期每本每天罰 5 元。</strong></p>
<p>門口的還書箱<em>只收書</em>，光碟請交給櫃檯。</p>
<h2>借書步驟</h2>
<ol>
  <li>帶書和借書證到櫃檯</li>
  <li>館員刷書上的條碼</li>
  <li>確認還書日期</li>
</ol>
<h2>館內提供</h2>
<ul>
  <li>免費無線網路</li>
  <li>自修座位</li>
</ul>
<p>讀者留言：</p>
<blockquote>
  <p>這裡是島上最安靜的角落。</p>
</blockquote>
<p>小島圖書館<br>港口路 12 號</p>` },
      observe: [
        { check: 'count', selector: 'ol > li', count: 3, label: '有序清單 `ol` 有 3 個 `li`；1.、2.、3. 是瀏覽器加的，不在 DOM 裡' },
        { check: 'count', selector: 'ul > li', count: 2, label: '無序清單 `ul` 有 2 個 `li`' },
        { check: 'style', selector: 'strong', property: 'font-weight', value: 'bold', label: '`strong` 預設顯示成粗體' },
        { check: 'style', selector: 'em', property: 'font-style', value: 'italic', label: '`em` 預設顯示成斜體' },
        { check: 'count', selector: 'p > br', count: 1, label: '地址用一個 `br` 換行，兩行仍在同一個 `p` 裡' },
      ],
    },
    {
      id: 'web03-links', title: '本頁目錄與連到別頁的連結',
      description: '目錄的兩個連結用 `#hours`、`#access` 跳到本頁的標題；「查看圖書館位置地圖」連到另一頁 `map.html`；最後一個 `a` 沒有 `href`，所以不是連結。',
      files: { html: `<h1>小島圖書館</h1>
<nav aria-label="本頁目錄">
  <ul>
    <li><a href="#hours">開放時間</a></li>
    <li><a href="#access">交通方式</a></li>
  </ul>
</nav>
<h2 id="hours">開放時間</h2>
<p>週二到週日 9:00 到 17:00，週一休館。</p>
<h2 id="access">交通方式</h2>
<p>從港口步行 5 分鐘。<a href="map.html">查看圖書館位置地圖</a></p>
<p><a>這個 a 沒有 href</a></p>` },
      observe: [
        { do: 'click', selector: 'nav li:first-child a' },
        { check: 'navigated', href: '#hours', label: '點目錄的「開放時間」，前往的是本頁的片段 `#hours`' },
        { check: 'count', selector: '#hours', count: 1, label: '頁面上正好有一個元素的 `id` 是 `hours`' },
        { check: 'attr', selector: 'p a[href]', name: 'href', value: 'map.html', label: '「查看圖書館位置地圖」的 `href` 是 `map.html`' },
        { check: 'style', selector: 'nav a', property: 'text-decoration-line', value: 'underline', label: '有 `href` 的 `a` 是連結，預設有底線' },
        { check: 'style', selector: 'a:not([href])', property: 'text-decoration-line', value: 'none', label: '沒有 `href` 的 `a` 不是連結，沒有底線' },
      ],
    },
    {
      id: 'web03-paths', title: '五種寫法的 href',
      description: '同一份清單裡有同資料夾的相對路徑、往上一層的 `../`、從網站最上層算起的 `/`、另開分頁的絕對網址，以及 `mailto:`。點任何一個，預覽下方會顯示它的 `href`。',
      files: { html: `<h1>活動列表</h1>
<p>假設這一頁的位址是 https://example.com/library/events/index.html</p>
<ul>
  <li><a href="storytime.html">週六說故事時間</a></li>
  <li><a href="../hours.html">開放時間</a></li>
  <li><a href="/index.html">小島鎮首頁</a></li>
  <li><a href="https://example.org/ferry" target="_blank" rel="noopener">渡輪時刻表（另開分頁）</a></li>
  <li><a href="mailto:library@example.com">寫信給館員</a></li>
</ul>` },
      observe: [
        { do: 'click', selector: 'li:nth-child(2) a' },
        { check: 'navigated', href: '../hours.html', label: '點「開放時間」，預覽記錄到的是 `href` 的原樣 `../hours.html`' },
        { check: 'count', selector: 'a[href^="https://"]', count: 1, label: '五個連結裡只有一個寫的是絕對網址' },
        { check: 'attr', selector: 'a[href^="https://"]', name: 'target', value: '_blank', label: '連到別的網站的那個連結，`target` 是 `_blank`' },
        { check: 'attr', selector: 'a[target="_blank"]', name: 'rel', value: 'noopener', match: 'includes', label: '另開分頁的連結，`rel` 含有 `noopener`' },
        { check: 'attr', selector: 'li:last-child a', name: 'href', value: 'mailto:library@example.com', label: '最後一個連結的 `href` 以 `mailto:` 開頭，後面是電子郵件地址' },
      ],
    },
    {
      id: 'web03-images', title: '四張圖：圖說、裝飾、連結與載入失敗',
      description: '`figure` 裡是傳達資訊的插圖和它的圖說；接著是純裝飾的波浪線（`alt=""`）、包在連結裡的圖示，以及一張載不進來的照片：最後一張在預覽裡會顯示它的替代文字。',
      files: { html: `<h1>燈塔閱讀節</h1>
<figure>
  <img src="${LIGHTHOUSE}" alt="白色燈塔立在海邊，塔頂是紅色的" width="240" height="160">
  <figcaption>圖 1：北岸燈塔，每年七月的閱讀節在這裡舉行。</figcaption>
</figure>
<p><img src="${WAVE}" alt="" width="240" height="12"></p>
<p>
  <a href="map.html"><img src="${PIN}" alt="活動地點地圖" width="32" height="32"></a>
</p>
<p><img src="reading-room.jpg" alt="閱覽室裡靠窗的一排書桌"></p>` },
      observe: [
        { check: 'attr', selector: 'figure > img', name: 'alt', value: '燈塔', match: 'includes', label: '燈塔插圖的 `alt` 說出圖裡有什麼' },
        { check: 'box', selector: 'figure > img', measure: 'height', value: 160, label: '燈塔插圖高 160 像素，和 `height` 屬性相同' },
        { check: 'count', selector: 'figure > figcaption', count: 1, label: '圖說 `figcaption` 和圖片一樣是 `figure` 的子元素' },
        { check: 'count', selector: 'img[alt=""]', count: 1, label: '裝飾用的波浪線有 `alt` 屬性，值是空字串' },
        { check: 'attr', selector: 'a img', name: 'alt', value: '活動地點地圖', label: '連結裡的圖示，`alt` 寫的是連結要去的地方' },
      ],
    },
    {
      id: 'web03-media', title: '有字幕的影片與一段聲音',
      description: '`video` 裡有兩個 `source`（兩種格式）與一條 `track`（繁體中文字幕）；`audio` 直接用 `src`。預覽不能連網，這些檔案載不進來，所以播放器會出現但不能播放。',
      files: { html: `<h1>圖書館導覽</h1>
<video controls width="288" height="162">
  <source src="tour.webm" type="video/webm">
  <source src="tour.mp4" type="video/mp4">
  <track kind="captions" src="tour.zh.vtt" srclang="zh-Hant" label="繁體中文" default>
</video>
<h2>館長的歡迎詞</h2>
<audio controls src="welcome.mp3"></audio>
<p><a href="welcome.html">閱讀歡迎詞的逐字稿</a></p>` },
      observe: [
        { check: 'attr', selector: 'video', name: 'controls', label: '`video` 有 `controls` 屬性，所以出現控制列' },
        { check: 'count', selector: 'video > source', count: 2, label: '`video` 裡有 2 個 `source`，瀏覽器會由上往下挑第一個能播放的' },
        { check: 'count', selector: 'video > track[kind="captions"]', count: 1, label: '字幕軌 `track` 在 `video` 裡面，`kind` 是 `captions`' },
        { check: 'attr', selector: 'video', name: 'autoplay', match: 'absent', label: '`video` 沒有 `autoplay`：要不要播放由使用者決定' },
        { check: 'attr', selector: 'audio', name: 'controls', label: '`audio` 也有 `controls`，否則它完全不會顯示' },
      ],
    },
  ],
  exercises: [
    {
      id: 'web03-ex-anchor', title: '修好跳到「開放時間」的連結',
      statement: '頁面上方的連結（它的 `id` 是 `to-hours`）應該帶讀者跳到同一頁的「開放時間」標題（標題的 `id` 是 `hours`）。可是現在點下去，瀏覽器會去找一個叫 `hours` 的檔案，連結文字「點這裡」也看不出要去哪裡。請修改這個連結：讓 `href` 指向本頁 `id` 為 `hours` 的元素，並把連結文字改成「開放時間」。標題的 `id` 不要改。在預覽裡點連結，下方會顯示它前往哪裡。',
      hints: [
        '連到同一頁裡的元素，`href` 要寫成「片段」：一個符號加上那個元素的 `id`。',
        '片段以 `#` 開頭，`#` 後面的字要和 `id` 一模一樣，包括大小寫。',
        '連結文字是 `<a>` 與 `</a>` 之間的字；句子可以改寫成「請看開放時間」，只把「開放時間」四個字放進連結。',
      ],
      explanation: '`href="#hours"` 的 `#` 告訴瀏覽器「在目前這一頁裡找 `id` 是 `hours` 的元素」，找到後捲動到那裡。沒有 `#` 的 `hours` 是相對路徑，指向同一個資料夾裡名叫 `hours` 的檔案。連結文字改成「開放時間」之後，即使只聽到或只看到這四個字，也知道連結通往哪裡。',
      starter: { html: `<h1>小島圖書館</h1>
<p>想知道幾點開門？<a id="to-hours" href="hours">點這裡</a></p>
<h2>最新消息</h2>
<p>七月的燈塔閱讀節開始報名。</p>
<h2 id="hours">開放時間</h2>
<p>週二到週日 9:00 到 17:00，週一休館。</p>` },
      solution: { html: `<h1>小島圖書館</h1>
<p>想知道幾點開門？請看<a id="to-hours" href="#hours">開放時間</a>。</p>
<h2>最新消息</h2>
<p>七月的燈塔閱讀節開始報名。</p>
<h2 id="hours">開放時間</h2>
<p>週二到週日 9:00 到 17:00，週一休館。</p>` },
      steps: [
        { check: 'count', selector: 'h2#hours', count: 1, label: '「開放時間」標題的 `id` 仍然是 `hours`' },
        { check: 'text', selector: '#to-hours', text: '開放時間', label: '連結 `#to-hours` 的文字是「開放時間」' },
        { do: 'click', selector: '#to-hours' },
        { check: 'navigated', href: '#hours', label: '點這個連結，前往的是本頁 `id` 為 `hours` 的元素' },
      ],
      mistakes: [
        { files: { html: `<h1>小島圖書館</h1>
<p>想知道幾點開門？請看<a id="to-hours" href="hours">開放時間</a>。</p>
<h2>最新消息</h2>
<p>七月的燈塔閱讀節開始報名。</p>
<h2 id="hours">開放時間</h2>
<p>週二到週日 9:00 到 17:00，週一休館。</p>` }, why: '只改了連結文字，`href` 還是 `hours`：少了 `#`，瀏覽器把它當成相對路徑，去找同一個資料夾裡名叫 `hours` 的檔案，而不是本頁的標題。' },
        { files: { html: `<h1>小島圖書館</h1>
<p>想知道幾點開門？<a id="to-hours" href="#hours">點這裡</a></p>
<h2>最新消息</h2>
<p>七月的燈塔閱讀節開始報名。</p>
<h2 id="hours">開放時間</h2>
<p>週二到週日 9:00 到 17:00，週一休館。</p>` }, why: '`href` 改對了，連結文字卻還是「點這裡」：用螢幕閱讀器列出本頁所有連結的人，只會聽到「點這裡」，不知道它通往開放時間。' },
        { files: { html: `<h1>小島圖書館</h1>
<p>想知道幾點開門？請看<a id="to-hours" href="#Hours">開放時間</a>。</p>
<h2>最新消息</h2>
<p>七月的燈塔閱讀節開始報名。</p>
<h2 id="hours">開放時間</h2>
<p>週二到週日 9:00 到 17:00，週一休館。</p>` }, why: '`#Hours` 的 H 是大寫，標題的 `id` 是小寫的 `hours`：`id` 的大小寫有分別，瀏覽器找不到對應的元素，點了不會跳過去。' },
      ],
    },
    {
      id: 'web03-ex-alt', title: '替兩張圖寫替代文字並標出尺寸',
      statement: '頁面上有兩張圖，都還沒有 `alt`。`#poster` 是活動的主圖：一座白色燈塔立在海邊，原圖寬 240 像素、高 160 像素；`#divider` 是純裝飾的波浪線。請：（1）替 `#poster` 寫替代文字，描述圖的內容，其中要出現「燈塔」兩個字；（2）用 `width` 與 `height` 屬性標出 `#poster` 的原始尺寸；（3）讓 `#divider` 的 `alt` 是空字串，表示它只是裝飾。兩張圖的 `src` 不用改。',
      hints: [
        '替代文字寫在 `alt` 屬性裡。想像在電話裡描述這張圖：你會說圖裡有什麼，而不是說「這是一張圖片」。',
        '`width` 與 `height` 的值是不帶單位的整數，例如寬 240 像素就寫 240。',
        '裝飾圖不是「不寫 `alt`」，而是寫出屬性、引號裡什麼都不放。',
      ],
      explanation: '`#poster` 傳達了資訊，所以 `alt` 要把圖的內容說出來，例如「白色燈塔立在海邊，塔頂是紅色的」；`width="240"` 與 `height="160"` 讓瀏覽器在圖片下載前就留好位置。`#divider` 只是裝飾，`alt=""` 告訴螢幕閱讀器直接跳過它；如果整個省略 `alt`，螢幕閱讀器可能改唸圖片的檔名或網址。',
      starter: { html: `<h1>燈塔閱讀節</h1>
<img id="poster" src="${LIGHTHOUSE}">
<p>七月每個週六，在北岸燈塔下一起讀書。</p>
<img id="divider" src="${WAVE}">
<p>報名請洽圖書館櫃檯。</p>` },
      solution: { html: `<h1>燈塔閱讀節</h1>
<img id="poster" src="${LIGHTHOUSE}" alt="白色燈塔立在海邊，塔頂是紅色的" width="240" height="160">
<p>七月每個週六，在北岸燈塔下一起讀書。</p>
<img id="divider" src="${WAVE}" alt="">
<p>報名請洽圖書館櫃檯。</p>` },
      steps: [
        { check: 'attr', selector: '#poster', name: 'alt', value: '燈塔', match: 'includes', label: '`#poster` 的替代文字提到「燈塔」' },
        { check: 'attr', selector: '#poster', name: 'width', value: '240', label: '`#poster` 的 `width` 是 240（不帶單位）' },
        { check: 'attr', selector: '#poster', name: 'height', value: '160', label: '`#poster` 的 `height` 是 160（不帶單位）' },
        { check: 'attr', selector: '#divider', name: 'alt', value: '', label: '`#divider` 有 `alt` 屬性，而且是空字串' },
        { check: 'count', selector: 'img:not([alt])', count: 0, label: '沒有任何一張圖漏寫 `alt` 屬性' },
      ],
      mistakes: [
        { files: { html: `<h1>燈塔閱讀節</h1>
<img id="poster" src="${LIGHTHOUSE}" alt="白色燈塔立在海邊，塔頂是紅色的" width="240" height="160">
<p>七月每個週六，在北岸燈塔下一起讀書。</p>
<img id="divider" src="${WAVE}">
<p>報名請洽圖書館櫃檯。</p>` }, why: '裝飾圖完全沒寫 `alt`：這和 `alt=""` 不一樣。沒有 `alt` 屬性時，螢幕閱讀器不知道這張圖能不能跳過，可能改唸它的檔名或網址。' },
        { files: { html: `<h1>燈塔閱讀節</h1>
<img id="poster" src="${LIGHTHOUSE}" alt="白色燈塔立在海邊，塔頂是紅色的" width="240px" height="160px">
<p>七月每個週六，在北岸燈塔下一起讀書。</p>
<img id="divider" src="${WAVE}" alt="">
<p>報名請洽圖書館櫃檯。</p>` }, why: '把尺寸寫成 `240px`、`160px`：`px` 是 CSS 的寫法，HTML 的 `width` 與 `height` 屬性只接受不帶單位的整數。' },
        { files: { html: `<h1>燈塔閱讀節</h1>
<img id="poster" src="${LIGHTHOUSE}" alt="圖片" width="240" height="160">
<p>七月每個週六，在北岸燈塔下一起讀書。</p>
<img id="divider" src="${WAVE}" alt="波浪線">
<p>報名請洽圖書館櫃檯。</p>` }, why: '主圖的 `alt` 只寫「圖片」，等於什麼都沒說；裝飾用的波浪線反而寫了「波浪線」，螢幕閱讀器會把這個對內容沒有幫助的詞唸出來。' },
      ],
    },
    {
      id: 'web03-ex-external', title: '加一個安全地另開分頁的外部連結',
      statement: '`#ferry` 這一段提到「島嶼渡輪時刻表」，它在另一個網站：`https://example.org/ferry`。請在 `#ferry` 段落裡，把「島嶼渡輪時刻表」這幾個字做成連結：連到上面的網址、在新分頁開啟，並用 `rel` 屬性加上 `noopener`，讓新分頁碰不到這一頁。段落裡只需要這一個連結。',
      hints: [
        '連結是 `<a href="…">文字</a>`；連到別的網站要寫完整的絕對網址：題目給的網址整串照寫，開頭的 `https` 也不能省。',
        '在新分頁開啟是 `target` 屬性的工作，它的值以底線開頭。',
        '`target="_blank"` 搭配 `rel="noopener"`；兩個屬性都寫在同一個 `<a>` 上。',
      ],
      explanation: '連到別的網站要寫完整的絕對網址 `https://example.org/ferry`；漏掉開頭的 `https`，瀏覽器會把它當成相對路徑。`target="_blank"` 讓連結在新分頁開啟，`rel="noopener"` 讓新開的頁面拿不到原本這一頁的控制權。連結文字「島嶼渡輪時刻表」單獨看也知道會去哪裡；想更體貼，可以在文字後面註明「（另開分頁）」。',
      starter: { html: `<h1>燈塔閱讀節</h1>
<p>活動當天請搭渡輪到北岸碼頭。</p>
<p id="ferry">船班請看島嶼渡輪時刻表。</p>` },
      solution: { html: `<h1>燈塔閱讀節</h1>
<p>活動當天請搭渡輪到北岸碼頭。</p>
<p id="ferry">船班請看<a href="https://example.org/ferry" target="_blank" rel="noopener">島嶼渡輪時刻表</a>。</p>` },
      steps: [
        { check: 'count', selector: '#ferry a', count: 1, label: '`#ferry` 段落裡有一個連結' },
        { check: 'text', selector: '#ferry a', text: '島嶼渡輪時刻表', match: 'includes', label: '連結文字包含「島嶼渡輪時刻表」' },
        { do: 'click', selector: '#ferry a' },
        { check: 'navigated', href: 'https://example.org/ferry', label: '點連結，前往的是 `https://example.org/ferry`' },
        { check: 'attr', selector: '#ferry a', name: 'target', value: '_blank', label: '連結會在新分頁開啟' },
        { check: 'attr', selector: '#ferry a', name: 'rel', value: 'noopener', match: 'includes', label: '連結的 `rel` 含有 `noopener`' },
      ],
      mistakes: [
        { files: { html: `<h1>燈塔閱讀節</h1>
<p>活動當天請搭渡輪到北岸碼頭。</p>
<p id="ferry">船班請看<a href="example.org/ferry" target="_blank" rel="noopener">島嶼渡輪時刻表</a>。</p>` }, why: '`href` 寫成 `example.org/ferry`，漏掉了開頭的 `https`、冒號和兩條斜線：它會被當成相對路徑，瀏覽器在目前網站的資料夾裡找名叫 `example.org` 的資料夾，而不是連到另一個網站。' },
        { files: { html: `<h1>燈塔閱讀節</h1>
<p>活動當天請搭渡輪到北岸碼頭。</p>
<p id="ferry">船班請看<a href="https://example.org/ferry" target="blank" rel="noopener">島嶼渡輪時刻表</a>。</p>` }, why: '`target="blank"` 少了底線：這不是「新分頁」的關鍵字，而是把分頁取名為 blank。第一次點會開新分頁，之後每個寫 `target="blank"` 的連結都會擠進同一個分頁。' },
        { files: { html: `<h1>燈塔閱讀節</h1>
<p>活動當天請搭渡輪到北岸碼頭。</p>
<p id="ferry">船班請看<a href="https://example.org/ferry" target="_blank">島嶼渡輪時刻表</a>。</p>` }, why: '只寫了 `target="_blank"`，沒有 `rel="noopener"`：題目要求明確寫出來，讓較舊的瀏覽器也不會把這一頁的控制權交給新分頁。' },
      ],
    },
    {
      id: 'web03-ex-video', title: '讓導覽影片可以操作、有字幕、有逐字稿',
      statement: '這支導覽影片一打開就自動播放，沒有控制列，也沒有字幕。請修改：（1）拿掉自動播放，改成顯示瀏覽器內建的控制列；（2）在 `<video>` 裡加一條字幕軌：種類是 `captions`，字幕檔是同一個資料夾的 `tour.zh.vtt`，語言是 `zh-Hant`，選單上顯示的名稱是「繁體中文」；（3）把 `#more` 段落裡的「影片逐字稿」做成連結，連到同一個資料夾的 `transcript.html`。預覽不能連網，影片與字幕檔載不進來是正常的；檢查只看你寫的標記。',
      hints: [
        '自動播放與控制列是 `<video>` 開始標籤上的兩個布林屬性：一個要拿掉，一個要加上。',
        '字幕軌是 `<track>`，放在 `<video>` 與 `</video>` 之間；種類、檔案、語言、名稱分別是 `kind`、`src`、`srclang`、`label`。',
        '同一個資料夾的檔案，`href` 與 `src` 直接寫檔名就可以，不需要 `/` 開頭，也不用寫成完整的網址。',
      ],
      explanation: '`controls` 讓使用者自己決定何時播放、暫停與調整音量，所以拿掉 `autoplay`。`<track kind="captions">` 必須是 `<video>` 的子元素，瀏覽器才知道它是這支影片的字幕；`srclang` 說明字幕的語言，`label` 是字幕選單裡看到的名稱。`tour.zh.vtt` 與 `transcript.html` 都和這一頁在同一個資料夾，用相對路徑直接寫檔名。逐字稿讓不方便看影片的人也能讀到內容。',
      starter: { html: `<h1>圖書館導覽影片</h1>
<video width="288" height="162" autoplay>
  <source src="tour.mp4" type="video/mp4">
</video>
<p id="more">聽不到聲音？可以閱讀影片逐字稿。</p>` },
      solution: { html: `<h1>圖書館導覽影片</h1>
<video width="288" height="162" controls>
  <source src="tour.mp4" type="video/mp4">
  <track kind="captions" src="tour.zh.vtt" srclang="zh-Hant" label="繁體中文">
</video>
<p id="more">聽不到聲音？可以閱讀<a href="transcript.html">影片逐字稿</a>。</p>` },
      steps: [
        { check: 'attr', selector: 'video', name: 'controls', label: '影片有瀏覽器內建的控制列' },
        { check: 'attr', selector: 'video', name: 'autoplay', match: 'absent', label: '影片不會自動播放' },
        { check: 'count', selector: 'video > track[kind="captions" i][srclang="zh-Hant" i]', count: 1, label: '`video` 裡有一條字幕軌，`kind` 是 `captions`、`srclang` 是 `zh-Hant`' },
        { check: 'attr', selector: 'video > track', name: 'src', value: 'tour.zh.vtt', match: 'includes', label: '字幕軌的 `src` 指向 `tour.zh.vtt`' },
        { check: 'attr', selector: 'video > track', name: 'label', value: '繁體中文', label: '字幕軌的 `label` 是「繁體中文」' },
        { check: 'count', selector: '#more a[href="transcript.html"], #more a[href="./transcript.html"]', count: 1, label: '`#more` 段落裡有一個連到同資料夾 `transcript.html` 的連結' },
      ],
      mistakes: [
        { files: { html: `<h1>圖書館導覽影片</h1>
<video width="288" height="162" controls>
  <source src="tour.mp4" type="video/mp4">
</video>
<track kind="captions" src="tour.zh.vtt" srclang="zh-Hant" label="繁體中文">
<p id="more">聽不到聲音？可以閱讀<a href="transcript.html">影片逐字稿</a>。</p>` }, why: '把 `<track>` 寫在 `</video>` 後面：字幕軌必須是它所屬的 `<video>` 的子元素，放在外面瀏覽器不會把它當成這支影片的字幕。' },
        { files: { html: `<h1>圖書館導覽影片</h1>
<video width="288" height="162" controls>
  <source src="tour.mp4" type="video/mp4">
  <track src="tour.zh.vtt" srclang="zh-Hant" label="繁體中文">
</video>
<p id="more">聽不到聲音？可以閱讀<a href="transcript.html">影片逐字稿</a>。</p>` }, why: '`<track>` 沒寫 `kind`：預設值是 `subtitles`（翻譯對白用的字幕），不是包含音效說明、給聽不到聲音的人看的 `captions`。' },
        { files: { html: `<h1>圖書館導覽影片</h1>
<video width="288" height="162" autoplay controls>
  <source src="tour.mp4" type="video/mp4">
  <track kind="captions" src="tour.zh.vtt" srclang="zh-Hant" label="繁體中文">
</video>
<p id="more">聽不到聲音？可以閱讀<a href="transcript.html">影片逐字稿</a>。</p>` }, why: '加了 `controls` 卻留著 `autoplay`：影片還是會試著自己播放，突然出現的聲音會嚇到人，也會蓋過螢幕閱讀器的語音。' },
      ],
    },
  ],
};

export const WEB03: LessonContent = {
  lessonId: 'WEB03',
  motivation: '只有標題和段落的頁面，不能帶讀者去別的地方，也放不了圖片和影片。學會連結、圖片與影音元素的正確寫法，你的頁面才能連成一個網站；而且看不到圖、聽不到聲音的人，也能從替代文字和字幕得到同樣的資訊。',
  sections: [
    {
      id: 'text', title: '段落之外的文字：強調、清單、引言',
      blocks: [
        { type: 'p', text: 'WEB02 用 `<header>`、`<main>` 這些語意元素把頁面分成區塊，區塊裡放的大多是 `<p>` 段落。可是文字不只有段落：有些字要強調，有些內容是一項一項的，有些話是引用別人說的。HTML 為這些情況各準備了元素。選對元素，螢幕閱讀器（screen reader，把畫面唸出來的輔助軟體）才會說出「清單，共 3 項」，之後的 CSS 也才分得出哪些字是重點。' },
        { type: 'table', head: ['元素', '意思', '瀏覽器預設的樣子'], rows: [
          ['`<em>`', '強調（emphasis）：唸出來會加重語氣的字', '斜體'],
          ['`<strong>`', '重要（strong importance）：警告、期限這類不能漏看的內容', '粗體'],
          ['`<ul>` 加 `<li>`', '無序清單（unordered list）：項目對調順序也不影響意思', '每項前面一個圓點'],
          ['`<ol>` 加 `<li>`', '有序清單（ordered list）：步驟、名次這類有先後的項目', '自動編號 1.、2.、3.'],
          ['`<blockquote>`', '區塊引言：整段引用別人說的話或寫的文字', '左右內縮'],
          ['`<br>`', '換行（line break）：地址、詩句這種「換行本身就是內容」的地方', '後面的字從下一行開始'],
        ] },
        { type: 'p', text: '清單的規則很簡單：`<ul>` 與 `<ol>` 的子元素只能是 `<li>`（list item），每個項目的內容放在 `<li>` 裡面。編號和圓點是瀏覽器畫上去的，你不用自己打。下面是小島圖書館的借書須知。看預覽時，也打開「瀏覽器建立的 DOM 樹」：`ol` 底下只有三個 `li`，找不到「1.」這幾個字。' },
        { type: 'example', id: 'web03-text' },
        { type: 'p', text: '按「動手改這個範例」，在 `<ol>` 的最前面加一個 `<li>先找到想借的書</li>`：後面三項的編號自動變成 2、3、4。再把 `<ol>` 改成 `<ul>`，編號就換成圓點。這就是用對元素的好處：順序和數量交給瀏覽器管。' },
        { type: 'callout', tone: 'warning', title: '選元素看的是意思，不是外觀', text: '常見的錯誤是「想要粗體，所以用 `<strong>`」「想要內縮，所以用 `<blockquote>`」。這些元素會被螢幕閱讀器和搜尋引擎當成「重要內容」和「引言」，用錯了，傳達出去的意思就是錯的。粗體、斜體、內縮這些外觀是 CSS 的工作（WEB05 開始學）；HTML 只回答「這段文字是什麼」。反過來也一樣：整頁都包在 `<strong>` 裡，就等於沒有任何一句是重點。' },
        { type: 'callout', tone: 'warning', title: '別用 br 和手打的編號假裝清單', text: '在一個 `<p>` 裡寫「1. 帶書到櫃檯`<br>`2. 刷條碼`<br>`3. 確認日期」，畫面看起來也像清單，但 DOM 裡只有一段文字：螢幕閱讀器不會告訴使用者這是 3 項的清單，中間插入一項時還要自己重新編號。同樣地，連按兩個 `<br>` 來分段也是錯的，兩段話就寫成兩個 `<p>`。`<br>` 只留給地址、詩句這種內容本身就分行的地方。' },
      ],
    },
    {
      id: 'links', title: '連結與錨點：a、href 和看得懂的連結文字',
      blocks: [
        { type: 'p', text: '連結（link）讓一頁通往另一頁，網頁才會成為「網」。連結用 `<a>` 元素（a 是 anchor，錨點）加上 `href` 屬性來寫，例如 `<a href="map.html">查看圖書館位置地圖</a>`：`href` 的值是目的地，開始標籤與結束標籤之間的字是連結文字，也就是讀者看到、點下去的部分。沒有 `href` 的 `<a>` 不是連結：沒有底線，不能點，按 Tab 鍵也不會停在它上面。' },
        { type: 'p', text: '`href` 以 `#` 開頭時叫做片段（fragment）：`href="#hours"` 的意思是「同一頁裡 `id` 是 `hours` 的那個元素」，瀏覽器會把畫面捲到那裡，不會載入新的頁面。這種連到頁面內某一點的連結常被叫做頁內錨點，長頁面開頭的目錄就是這樣做的。它成立有兩個條件：目標元素要有 `id`，而且這個 `id` 在整頁只能出現一次；`#` 後面的字要和 `id` 完全相同，大小寫也要一樣。' },
        { type: 'p', text: '在這門課的預覽裡，點連結不會真的離開頁面：預覽下方會寫出這個連結要前往的 `href`，讓你確認它指向哪裡（`#` 開頭的片段在比較長的頁面裡會照常捲動）。點點看下面目錄的兩個連結和地圖連結：' },
        { type: 'example', id: 'web03-links' },
        { type: 'p', text: '寫連結時最容易忽略的是連結文字。使用螢幕閱讀器的人常常叫出「本頁所有連結」的清單來找路，這時每個連結文字都脫離了前後文；一般讀者掃視頁面時，也是先看到有底線的那幾個字。所以連結文字要單獨唸出來就知道會去哪裡：' },
        { type: 'table', head: ['不好的寫法', '問題', '改成'], rows: [
          ['想看開放時間請`<a href="hours.html">點這裡</a>`', '單獨聽到「點這裡」，不知道通往哪裡', '`<a href="hours.html">開放時間</a>`'],
          ['三則活動後面各有一個「更多」', '連結清單裡出現三個一樣的「更多」，分不出誰是誰', '「更多說故事時間的資訊」'],
          ['把整串網址當成連結文字', '螢幕閱讀器會把網址一個字一個字唸出來', '目的頁面的名稱，例如「渡輪時刻表」'],
          ['「下載」', '不知道會下載什麼、是什麼格式', '「下載借書證申請表（PDF）」'],
        ] },
        { type: 'callout', tone: 'tip', title: '檢查方法：只唸連結文字', text: '寫完一頁之後，把所有連結的文字單獨唸一遍，不看旁邊的句子。如果聽到的是「點這裡、點這裡、更多、這個」，就該改寫。好的連結文字通常就是目的頁面的標題或這個動作的名稱；搜尋引擎也會用連結文字判斷目的頁面在講什麼。' },
      ],
    },
    {
      id: 'paths', title: '相對與絕對路徑：連結到底會去哪裡',
      blocks: [
        { type: 'p', text: '`href` 的值有兩大類。絕對網址（absolute URL）從通訊協定 `https` 開始，把網站名稱到檔案位置全部寫出來，例如 `https://example.org/ferry`：不管寫在哪一頁，都指向同一個地方，連到別的網站一定要這樣寫。相對路徑（relative path）省略了前半段，瀏覽器會拿「目前這一頁的位址」把它補完；同一個網站裡的頁面互相連結時多半用它，因為比較短，整個網站搬到另一個網域時連結也不用改。相對與絕對路徑的規則不只用在 `href`，後面圖片與影音的 `src` 也是同一套。' },
        { type: 'p', text: '相對路徑怎麼補完？把網站想成資料夾：`.` 是目前這一頁所在的資料夾，`..` 是上一層，開頭的 `/` 是網站的最上層。假設目前這一頁是 `https://example.com/library/events/index.html`，也就是在 `library` 資料夾裡的 `events` 資料夾裡：' },
        { type: 'table', head: ['href 的寫法', '種類', '瀏覽器實際前往'], rows: [
          ['`storytime.html`', '相對路徑：同一個資料夾裡的檔案', '`https://example.com/library/events/storytime.html`'],
          ['`./storytime.html`', '相對路徑：`.` 是目前的資料夾，和上一列相同', '`https://example.com/library/events/storytime.html`'],
          ['`photos/july.html`', '相對路徑：往下進入 `photos` 資料夾', '`https://example.com/library/events/photos/july.html`'],
          ['`../hours.html`', '相對路徑：`..` 往上一層到 `library`', '`https://example.com/library/hours.html`'],
          ['`../../index.html`', '相對路徑：往上兩層', '`https://example.com/index.html`'],
          ['`/contact.html`', '以 `/` 開頭：從網站最上層算起，和目前在哪個資料夾無關', '`https://example.com/contact.html`'],
          ['`#saturday`', '片段：同一頁裡 `id` 是 `saturday` 的元素', '`https://example.com/library/events/index.html#saturday`'],
          ['`https://example.org/ferry`', '絕對網址：照寫的走，可以連到別的網站', '`https://example.org/ferry`'],
        ] },
        { type: 'p', text: '下面這一頁就假設放在那個位址。點每個連結，預覽下方顯示的是 `href` 原本的寫法（預覽不會真的前往）；對照上表，算算看真正的瀏覽器會把它補成哪個完整位址。' },
        { type: 'example', id: 'web03-paths' },
        { type: 'p', text: '範例的第四個連結多了兩個屬性。`target="_blank"` 讓連結在新分頁開啟。新分頁裡的網頁原本可以透過 JavaScript 的 `window.opener` 控制開啟它的那一頁，例如把你的頁面悄悄換成假的登入畫面；`rel="noopener"` 切斷這個關係。現在的瀏覽器對 `target="_blank"` 已經預設這樣處理，但明確寫出來可以照顧較舊的瀏覽器，也讓讀程式碼的人一眼看懂。新分頁裡「上一頁」按鈕回不到原來的頁面，所以多數連結應該留在同一個分頁，真的需要另開時，在連結文字裡說一聲。' },
        { type: 'p', text: '`href` 也可以不是網頁：`mailto:library@example.com` 會開啟讀者的郵件程式並填好收件人，`tel:` 後面接電話號碼（例如 `tel:+886-2-0000-0000`）在手機上會帶出撥號畫面。' },
        { type: 'callout', tone: 'warning', title: '漏掉開頭的 https，外部網址就變成相對路徑', text: '寫 `<a href="www.example.org">` 想連到別的網站，結果點了出現「找不到網頁」。原因是 `www.example.org` 不是以 `https` 開頭的完整網址，瀏覽器把它當成相對路徑，在目前的資料夾裡找一個名叫 `www.example.org` 的檔案：以上面的頁面為例，會前往 `https://example.com/library/events/www.example.org`。正確的寫法是 `href="https://www.example.org"`，開頭的 `https`、冒號和兩條斜線都不能省。另一個常見的錯是把 `../` 數錯層：先寫出目前這一頁的完整位址，再一層一層往上數。' },
      ],
    },
    {
      id: 'images', title: '圖片與替代文字：img、尺寸與圖說',
      blocks: [
        { type: 'p', text: '圖片用 `<img>` 放進頁面。它是空元素，沒有結束標籤，靠兩個屬性工作：`src` 是圖片檔的位址，寫法和 `href` 相同；`alt` 是替代文字（alternative text），在圖片不能被看見時代替它。這有三種時候：螢幕閱讀器把 `alt` 唸給看不到畫面的人聽；圖片載入失敗（網路太慢、路徑打錯）時，瀏覽器把 `alt` 顯示在圖片的位置；搜尋引擎靠 `alt` 了解圖片的內容。' },
        { type: 'p', text: '替代文字怎麼寫？想像你在電話裡把這一頁唸給朋友聽，輪到這張圖時你會說的話，就是它的 `alt`。依圖片在頁面上的角色，有三種寫法：' },
        { type: 'table', head: ['圖片的角色', 'alt 怎麼寫', '例子'], rows: [
          ['傳達資訊：照片、插圖、圖表', '用一兩句話寫出圖片要讓人知道的內容', '`alt="白色燈塔立在海邊，塔頂是紅色的"`'],
          ['純裝飾：分隔線、花邊', '寫空字串，螢幕閱讀器會直接跳過', '`alt=""`'],
          ['包在連結裡，圖片本身就是可以點的東西', '寫連結要去的地方，而不是圖片的長相', '`alt="活動地點地圖"`（不是「紅色圖釘」）'],
        ] },
        { type: 'p', text: '`<img>` 還應該寫上 `width` 與 `height`。瀏覽器要等圖片下載到一部分才知道它有多大；如果你沒有先告訴它，它只能先不留位置，等圖片出現時再把下面的內容往下推，讀者讀到一半，文字就突然跳走。寫上這兩個屬性，瀏覽器在圖片下載之前就能留好剛剛好的空間。它們的值是不帶單位的整數，單位固定是 CSS 像素：寫 `width="240"`，不是 `width="240px"`。' },
        { type: 'p', text: '需要讓所有人都看得到的說明文字時，用 `<figure>` 把圖片包起來，再用 `<figcaption>` 寫圖說。兩者的分工是：`alt` 代替圖片本身，`<figcaption>` 補充圖片看不出來的事，例如地點、時間、出處。' },
        { type: 'p', text: '下面範例裡的 `src` 有三個是 `data:` 開頭的一長串：那是把一張很小的 SVG 圖直接寫在位址裡，因為預覽不能連網，也沒有別的檔案可以放；真正的網站會寫成 `src="images/lighthouse.png"` 這樣的路徑。最後一張圖故意指向一個不存在的 `reading-room.jpg`：它載不進來，你會在那個位置看到它的替代文字。' },
        { type: 'example', id: 'web03-images' },
        { type: 'callout', tone: 'warning', title: 'alt 的三個常見錯誤', text: '第一，整個省略 `alt`：這和 `alt=""` 不一樣。沒有這個屬性時，螢幕閱讀器無從判斷圖片重不重要，可能改唸檔名或網址；所以每一張 `<img>` 都要有 `alt`，裝飾圖就寫成空字串。第二，寫成 `alt="圖片"` 或 `alt="照片"`：螢幕閱讀器本來就會告訴使用者這是一張圖，這幾個字沒有任何資訊。第三，把說明寫得和旁邊的文字一模一樣，使用者會聽到同一句話兩次；旁邊已經說清楚時，`alt` 可以更短，甚至留空。' },
        { type: 'callout', tone: 'tip', title: '試試看：改尺寸，再把比例改壞', text: '按「動手改這個範例」，把燈塔的尺寸改成 `width="120" height="80"`：同一個圖檔縮成一半，比例不變。再改成 `width="120" height="160"`，燈塔就被壓窄了：瀏覽器照你寫的寬和高顯示，不會自動幫你維持比例。所以這兩個屬性通常直接填圖片檔的原始尺寸，或同比例縮小的數字。如何讓圖片隨螢幕寬度縮放，是之後響應式設計島的主題。' },
      ],
    },
    {
      id: 'media', title: '影音元素：audio、video 與字幕',
      blocks: [
        { type: 'p', text: 'HTML 有兩個影音元素：`<audio>` 播放聲音，`<video>` 播放影片。兩者都要加上 `controls` 屬性，瀏覽器才會顯示內建的控制列（播放、暫停、音量、進度）。`controls` 是布林屬性，寫出名字就算開啟，不需要值。沒有 `controls` 的 `<audio>` 完全不會顯示在頁面上；沒有 `controls` 的 `<video>` 只有畫面，讀者沒有按鈕可以播放或暫停。`<video>` 和圖片一樣可以寫 `width` 與 `height`，先把位置留好。' },
        { type: 'table', head: ['寫法', '放在哪裡', '作用'], rows: [
          ['`src="welcome.mp3"`', '`<audio>` 或 `<video>` 的開始標籤', '只有一個檔案時，直接指出檔案位址'],
          ['`<source src="tour.webm" type="video/webm">`', '`<audio>`、`<video>` 的裡面，可以放好幾個', '提供同一段內容的不同格式；瀏覽器由上往下，播放第一個它支援的'],
          ['`<track kind="captions" src="tour.zh.vtt">`', '`<video>` 的裡面', '字幕軌：指向一個 WebVTT 字幕檔（`.vtt`）'],
          ['`srclang="zh-Hant"`、`label="繁體中文"`', '`<track>` 上', '字幕的語言，以及字幕選單裡顯示的名稱'],
          ['`default`', '`<track>` 上', '這條字幕預設開啟'],
        ] },
        { type: 'p', text: '`<source>` 的 `type` 讓瀏覽器不必下載檔案，就知道自己能不能播放這種格式。字幕檔是純文字檔，裡面寫著每一句字幕從幾分幾秒顯示到幾分幾秒。`<track>` 的 `kind` 說明這是哪一種文字：`captions` 是給聽不到聲音的人看的字幕，除了對白，還會寫出「（門鈴聲）」「（音樂）」這類重要的聲音；`subtitles` 是把對白翻譯成另一種語言。沒寫 `kind` 時，預設是 `subtitles`。' },
        { type: 'p', text: '下面範例裡的 `tour.webm`、`tour.mp4`、`tour.zh.vtt`、`welcome.mp3` 都是假設的檔名：在真正的網站上，它們是和網頁放在同一個資料夾的檔案（用的正是上一節的相對路徑）。預覽不能連網，這些檔案載不進來，所以你會看到播放器，但按了不會播放；這一節要看的是標記怎麼寫，以及 DOM 樹裡 `source` 與 `track` 都在 `video` 底下。' },
        { type: 'example', id: 'web03-media' },
        { type: 'callout', tone: 'note', title: '為什麼一定要有字幕或逐字稿', text: '需要字幕的不只是聽障者：在圖書館或車上沒戴耳機的人、正在學這種語言的人，都靠字幕看懂影片；搜尋引擎也讀不到聲音裡的話。影片用 `<track>` 提供字幕；只有聲音的內容（例如範例裡館長的歡迎詞）沒有畫面可以放字幕，就在旁邊放一個通往逐字稿（transcript）的連結。' },
        { type: 'callout', tone: 'warning', title: '不要讓有聲音的影片自動播放', text: '`autoplay` 屬性會讓影音一載入就播放。突然出現的聲音會嚇到人，在安靜的場合很尷尬，還會蓋過螢幕閱讀器的語音，讓使用者連「暫停」按鈕在哪裡都聽不到。現在的瀏覽器多半會擋下有聲音的自動播放，所以寫了也常常沒有效果。正確的做法是加上 `controls`，讓讀者自己決定要不要按下播放。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'web03-q1', prompt: '「報名流程」有三個步驟，必須照順序做。哪一種標記最適合？',
      options: [
        '`<ul>` 裡放三個 `<li>`',
        '一個 `<p>`，手打「1.」「2.」「3.」，中間用 `<br>` 換行',
        '`<ol>` 裡放三個 `<li>`',
        '`<blockquote>` 裡放三個 `<p>`',
      ],
      answer: 2,
      explanation: '有先後順序的項目用有序清單 `<ol>`，瀏覽器會自動編號，螢幕閱讀器也會說出這是 3 項的清單。`<ul>` 是無序清單，表示順序對調也沒關係；用 `<br>` 加手打的編號，DOM 裡只是一段文字，不是清單，插入一項還要自己重編；`<blockquote>` 的意思是引用別人的話，不能只為了內縮的外觀而用。',
    },
    {
      id: 'web03-q2', prompt: '活動頁要放一個連結，讓人下載行事曆的 PDF 檔。哪一個連結文字最好？',
      options: [
        '下載 2026 年活動行事曆（PDF）',
        '點這裡',
        '更多',
        'https://example.com/library/files/calendar-2026.pdf',
      ],
      answer: 0,
      explanation: '好的連結文字單獨唸出來就知道會發生什麼事：「下載 2026 年活動行事曆（PDF）」說明了動作、內容與檔案格式。「點這裡」和「更多」脫離前後文之後沒有任何資訊，在螢幕閱讀器的連結清單裡分不出通往哪裡；把整串網址當文字，螢幕閱讀器會逐字唸出，一般讀者也不容易看懂。',
    },
    {
      id: 'web03-q3', prompt: '目前的頁面是 `https://example.com/library/events/index.html`。頁面裡的這個連結會前往哪裡？',
      code: { language: 'HTML', text: '<a href="../hours.html">開放時間</a>' },
      options: [
        '`https://example.com/library/events/hours.html`',
        '`https://example.com/hours.html`',
        '`https://example.com/library/events/index.html/hours.html`',
        '`https://example.com/library/hours.html`',
      ],
      answer: 3,
      explanation: '目前這一頁在 `library/events` 資料夾裡，`..` 往上一層到 `library`，所以是 `https://example.com/library/hours.html`。留在 `events` 資料夾的是 `hours.html` 或 `./hours.html`；到網站最上層要寫 `../../hours.html` 或 `/hours.html`；相對路徑是從頁面所在的資料夾算起，不會接在 `index.html` 這個檔名後面。',
    },
    {
      id: 'web03-q4', prompt: '`https://example.com/library/index.html` 這一頁裡有下面的連結。點了之後瀏覽器會前往哪裡？',
      code: { language: 'HTML', text: '<a href="www.example.org">島嶼文化協會</a>' },
      options: [
        '`https://www.example.org/`',
        '`https://example.com/library/www.example.org`',
        '哪裡都不去，因為這個 `href` 無效',
        '`https://example.com/www.example.org`',
      ],
      answer: 1,
      explanation: '`www.example.org` 不是以 `https` 開頭的完整網址，瀏覽器把它當成相對路徑，接在目前頁面所在的資料夾 `library` 後面，前往 `https://example.com/library/www.example.org`（多半是找不到網頁）。瀏覽器不會自動把 `href` 補成完整的網址；這個 `href` 是有效的相對路徑，所以連結點得下去；要從網站最上層算起，開頭必須有 `/`。',
    },
    {
      id: 'web03-q5', prompt: '點了目錄裡的連結，畫面卻沒有跳到「開放時間」。原因是什麼？',
      code: { language: 'HTML', text: '<a href="#Hours">開放時間</a>\n<!-- 中間還有很多內容 -->\n<h2 id="hours">開放時間</h2>' },
      options: [
        '`<h2>` 不能有 `id`，要改用 `<a name="hours">`',
        '`id` 的大小寫有分別，`#Hours` 找不到 `id="hours"` 的元素',
        '頁內連結必須加上 `target="_self"` 才會捲動',
        '`href` 應該寫成 `hours`，不要加 `#`',
      ],
      answer: 1,
      explanation: '片段要和目標元素的 `id` 完全相同，大小寫也算：`#Hours` 和 `hours` 不一樣，所以瀏覽器找不到目標。任何元素都可以有 `id`，標題正是最常見的目標；連結預設就在同一個分頁處理，不需要 `target`；拿掉 `#` 之後，`hours` 會變成相對路徑，瀏覽器會去找一個叫 `hours` 的檔案。',
    },
    {
      id: 'web03-q6', prompt: '頁面上有一條純裝飾的波浪分隔線圖片。它的 `alt` 應該怎麼寫？',
      options: [
        '不寫 `alt` 屬性',
        '`alt="圖片"`',
        '`alt="藍色的波浪形分隔線"`',
        '`alt=""`',
      ],
      answer: 3,
      explanation: '純裝飾的圖片寫空字串 `alt=""`，螢幕閱讀器會直接跳過它。完全不寫 `alt` 不一樣：螢幕閱讀器無法判斷圖片重不重要，可能改唸檔名或網址。`alt="圖片"` 沒有資訊；仔細描述波浪線的長相，則是讓使用者多聽一句和內容無關的話。',
    },
    {
      id: 'web03-q7', prompt: '`lighthouse.png` 的原始尺寸是 480 × 320 像素。關於下面這行標記，哪一個說法正確？',
      code: { language: 'HTML', text: '<img src="lighthouse.png" alt="白色燈塔立在海邊" width="240" height="160">' },
      options: [
        '圖片顯示成 240 × 160 像素，而且瀏覽器在圖片下載完之前就能先留好這塊空間',
        '圖片只會顯示左上角 240 × 160 的部分，其餘被裁掉',
        '這樣寫是錯的，`width` 與 `height` 必須加上單位，例如 `240px`',
        '這兩個屬性只是給搜尋引擎參考的，不影響圖片在頁面上的大小',
      ],
      answer: 0,
      explanation: '`width` 與 `height` 屬性決定圖片顯示的大小（不帶單位，單位是 CSS 像素），整張圖會縮小成 240 × 160，比例不變；瀏覽器也因此在下載前就知道要留多少空間，內容不會跳動。圖片是縮放而不是裁切；HTML 屬性不能寫 `px`，那是 CSS 的寫法；這兩個屬性確實會改變版面上的大小。',
    },
    {
      id: 'web03-q8', prompt: '關於下面這段標記，哪一個說法正確？',
      code: { language: 'HTML', text: '<video src="tour.mp4" autoplay>\n  <track src="tour.zh.vtt" srclang="zh-Hant" label="繁體中文">\n</video>' },
      options: [
        '沒有 `controls` 也沒關係，瀏覽器一定會顯示播放與暫停按鈕',
        '`<track>` 沒寫 `kind`，瀏覽器會把它當成 `captions`',
        '讀者沒有控制列可以暫停或調整音量；而且有聲音的自動播放多半會被瀏覽器擋下',
        '`<track>` 放錯位置了，它應該寫在 `</video>` 的後面',
      ],
      answer: 2,
      explanation: '少了 `controls`，瀏覽器不會顯示內建的控制列；只靠 `autoplay` 開始播放既打擾人，也常被瀏覽器擋下，結果影片可能根本不會動。`kind` 的預設值是 `subtitles`（翻譯對白），想提供含音效說明的字幕要明確寫 `kind="captions"`。`<track>` 必須是 `<video>` 的子元素，這裡的位置是對的。',
    },
  ],
  webCode,
};
