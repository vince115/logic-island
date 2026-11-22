# WEB-0：網頁基礎島的 `web-code` 課程能力

> 2026-11-23。目標：讓網頁基礎島（WEB）的課可以撰寫、驗證、發布；本階段不寫 WEB 課程內容。之後的進度與下一批由 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 計算。前端開發島（FE）、響應式設計島（RWD）與行動應用島（MOB）之後也建立在這個能力上。

## 1. 為什麼是新的能力

網頁課的範例與練習是「一個頁面」：HTML，加上選用的 CSS 與 JavaScript。它的結果不是標準輸出，而是瀏覽器建立的文件：DOM、計算後的樣式、盒子的大小、事件之後的狀態。既有能力都不適用：

| 既有能力 | 不適用的原因 |
|---|---|
| `program-code`、`python-code` | 以標準輸入／輸出比對；網頁沒有標準輸出，三種語言的要求也不成立 |
| `terminal`、`network-protocol` | 模擬的機器與固定的情境；網頁課要執行學習者自己寫的 HTML、CSS、JavaScript |

所以新增 `web-code` 能力與 `dom-explorer` 活動，其他能力與已發布的 169 堂課不變（`tests/webcode-capability.test.ts`）。

## 2. 執行環境：瀏覽器裡的沙盒框架

頁面在學習者自己的瀏覽器裡執行，放在 `<iframe sandbox="allow-scripts allow-forms" srcdoc="…">`：

| 限制 | 做法 |
|---|---|
| 不能讀寫本站的資料 | 沒有 `allow-same-origin`：框架是不透明來源，讀不到父頁面、Cookie、`localStorage` |
| 不能連線到網路 | 文件開頭的 CSP：`default-src 'none'`，只允許行內樣式、行內指令稿與 `data:` 的圖片、媒體、字型；`form-action 'none'`、`base-uri 'none'` |
| 不會離開頁面 | 點擊連結不會導覽（記錄 `href`；`#片段` 在同一頁捲動）；送出表單只記錄資料（原生驗證與 `submit` 事件照常發生），不會真的送出 |
| 不能開新視窗、不能導覽上層頁面 | sandbox 未開放 `allow-popups`、`allow-top-navigation` |
| 不會結束的迴圈不凍結分頁 | 迴圈保護（§5） |

網站不上傳、不儲存學習者的檔案；練習不計入學習進度（和其他能力相同）。

## 3. 課程資料（`src/lib/webcode/lesson.ts`，`LessonContent.webCode`）

```ts
webCode: {
  examples: [{ id, title, description, files: { html, css?, js? }, observe: WebStep[], height?, expectErrors?, viewport? }],
  exercises: [{ id, title, statement, hints, explanation,
    fixed?: { html?, css?, js? },      // 學習者不能改的檔案
    starter: { html?, css?, js? },     // 學習者要完成的檔案（一開始看到的內容）
    solution: { … },                   // 和 starter 相同的檔案
    steps: WebStep[],                  // 操作與檢查，依序在一份全新的頁面上執行
    mistakes: [{ files, why }],        // 常見錯誤：必須有一項檢查不通過
    variants?: [{ title, fixed, steps }],  // 換一份固定檔案再檢查一次（只顯示通過與否）
    viewport? }],
}
```

- **檔案**：`html` 可以是完整文件（有 `<!DOCTYPE>`、`html`、`head` 或 `body` 任一標籤），也可以是 body 的片段（會包進標準模式的文件）。完整文件照原樣保留，沒有 doctype 就不會補上（`doctype` 檢查看的就是它）。注意 `srcdoc` 框架裡的文件依 HTML 標準一律是標準模式，所以預覽無法重現相容模式（quirks mode）：DOM 樹下方只會提示「直接開啟這樣的檔案時會以相容模式顯示」。`css` 與 `js` 是 `style.css` 與 `script.js`：HTML 裡有 `<link rel="stylesheet" href="style.css">`、`<script src="script.js"></script>` 時放在那個位置，否則樣式表放在 `head` 開頭、指令稿放在 `body` 結尾。
- **範例的 `observe`**：這個頁面在瀏覽器裡成立的事實（至少一項檢查）。它們列在課程頁上，並由測試在 Chromium 裡逐項驗證，所以範例說的事不會和瀏覽器的行為脫節。範例若刻意示範錯誤，標 `expectErrors`；否則主控台出現未捕捉的錯誤就算失敗。
- **練習**：`starter` 的檔案是可編輯的，`fixed` 是唯讀的；`solution` 與每個 `mistakes[].files` 取代 `starter`。答案只看結果：不同的正確寫法都會通過。

### 步驟（`WebStep`）

| 操作 `do` | 做什麼 |
|---|---|
| `click` | 聚焦並點擊（連結、送出按鈕、核取方塊的預設行為都會發生） |
| `input`、`select` | 設定欄位的值，觸發 `input` 與 `change` |
| `check` | 讓核取方塊或選項按鈕成為指定狀態（需要時點擊） |
| `key` | 在元素上觸發 `keydown`、`keyup`；指令稿產生的鍵盤事件沒有預設行為，所以模擬最常用的兩種：Enter／Space 啟動按鈕；欄位裡的 Enter 依瀏覽器的隱式送出規則送出表單（WEB-1：表單有送出按鈕時經由第一個送出按鈕，按鈕停用就不送出；沒有送出按鈕時，只有單一單行欄位的表單會送出） |
| `submit` | 和送出按鈕相同的 `requestSubmit`（先原生驗證，再 `submit` 事件） |
| `scroll` | 把頁面（`selector: ':page'`）或可捲動的元素捲到指定的垂直位置（WEB-2） |
| `dispatch` | 在元素上觸發任何型別的事件（`mouseover`、`dblclick`、自訂事件；會冒泡，本來就不冒泡的 `mouseenter`、`focus` 等除外）（WEB-3） |
| `wait` | 讓頁面的計時器執行這麼久（每步最多 10000 ms，全部最多 60000 ms）。檢查用的是虛擬時鐘（W2，WEB-3）：不會真的等待，計時器依時間先後、同時間依設定的先後執行，Promise 的回呼在計時器之間照常執行；第一步之前，延遲 0 的計時器已經執行過。預覽裡的計時器是真的。`Date.now()` 不是虛擬的 |

| 檢查 `check` | 看什麼 |
|---|---|
| `count` | 符合選擇器的元素個數（等於、至少、至多） |
| `text` | 第一個符合元素的文字（空白合併後相等或包含） |
| `attr` | 屬性存在、等於、包含或不存在 |
| `style` | `getComputedStyle` 的值；期望值可以用瀏覽器會解析成同一個值的任何寫法（`red`、`#f00`、`bold`／`700`），支援 `::before`、`::after` |
| `box` | `getBoundingClientRect` 的寬、高或邊的位置（CSS 像素，預設容許 1px）：預設從頁面的角落量（捲動不影響），`from: ':viewport'` 從視窗的角落量（WEB-2，捲動後檢查 fixed 與 sticky），`from: '<選擇器>'` 從另一個元素的角落量 |
| `hit` | 元素中心點上畫在最上面的是哪一個元素（WEB-2，`document.elementFromPoint`）：檢查重疊與 z-index |
| `value` | 表單控制項的值，或是否勾選 |
| `label` | 表單控制項的標籤文字，依輔助科技讀取的順序：`aria-labelledby`、`aria-label`、對應的 `<label>`（`for` 或包住控制項） |
| `headings` | 標題形成大綱：只有一個 `h1` 且在最前面，之後每個標題最多比前一個深一層 |
| `focus` | 目前取得焦點的元素 |
| `console` | 主控台輸出（完全相等，或依序包含） |
| `submitted` | 表單送出的次數、最後一次送出的資料 |
| `navigated` | 最後點擊的連結的 `href` |
| `doctype` | 文件有 `<!DOCTYPE html>` |

每個檢查都有 `label`（用學習者的話說明檢查什麼），在按「檢查」之前就列在練習裡；失敗時顯示瀏覽器裡實際看到的值，不直接給答案。

### 檢查怎麼執行

「檢查」不看預覽，而是把目前的檔案載入一份**全新、固定大小**的頁面（預設 600 × 400 CSS 像素，練習可指定 `viewport`），放在畫面外，依序執行步驟後移除。因此結果和螢幕大小、和學習者在預覽裡點過什麼都無關；之後的響應式課程可以用不同的 `viewport` 檢查同一份答案。有 `variants` 的練習會再用另一份固定檔案（頁面裡不同的資料）執行一次，確認答案不是寫死的；這一部分只顯示通過與否。

未捕捉的錯誤若發生在 `script.js`，主控台會附上行號（「…（script.js 第 3 行）」）。

載入或檢查超過 6 秒視為逾時，所有檢查以「頁面沒有在時間內完成載入與檢查」不通過。

## 4. 框架裡的 harness（`src/lib/webcode/harness.ts`）

文件由 `webDocument(files, nonce)` 組成：harness 指令稿放在 `head` 的最前面（在 doctype 之後、在頁面任何程式之前），執行後把自己和 CSP 的 `<meta>` 從 DOM 移除，所以 DOM 樹就是頁面自己的樣子（`script` 的個數、`head` 的子元素都不受影響）。它負責：

- 記錄 `console.log／info／warn／error`、未捕捉的錯誤與被拒絕的 Promise；值的顯示方式固定（字串原樣、物件與陣列以 JSON、元素以 `<tag#id.class>`）。未捕捉的錯誤與被拒絕的 Promise 會標成已處理（WEB-1）：它們是頁面自己的事，只顯示在頁面的主控台，不會算在承載框架的課程頁上（`console.log`、`console.error` 仍會出現在瀏覽器的開發者工具）。
- 攔截連結與表單送出（§2）。
- 回報 DOM 的大綱（標籤、id、class、其他屬性、自己的文字；最多 200 個元素），預覽中 DOM 或主控台改變時再回報一次。
- 執行父頁面送來的步驟，回傳每一步的原始結果；訊息文字由 `judge()` 在父頁面產生。

父頁面與框架之間只用 `postMessage`，每個框架有自己的亂數 nonce：父頁面只相信來自那個框架、帶著那個 nonce 的訊息。

## 5. 迴圈保護（`src/lib/webcode/loop-guard.ts`）

沙盒框架不一定在另一個行程：`while (true) {}` 會凍結整個分頁。指令稿放進框架之前，`while`、`do…while` 與傳統 `for` 的條件會被包起來：`while (cond)` 變成 `while (__liLoop()&&(cond))`。同一個工作（task）裡的迴圈共用 1.5 秒的額度，用完就丟出錯誤「迴圈執行太久，已被停止（可能是不會結束的迴圈）」，指令稿結束、頁面繼續可用。

- 只在原位插入，不增減行，錯誤的行號不變；`for…of`、`for…in`、`for await` 不處理。
- 處理 `script.js` 與 HTML 裡的行內 `<script>`（傳統與 module）；`onclick="…"` 這類行內事件屬性裡的迴圈不處理。
- 這是 tokenizer，不是 parser：看不懂的原始碼（未結束的字串、括號不成對，本來就是語法錯誤）原樣交給瀏覽器回報。

## 6. 頁面（`src/components/curriculum/webcode-lesson.tsx`）

- **範例**：檔案以程式碼顯示（伺服器端上色，新增 HTML 與 CSS 的語法上色），旁邊是在沙盒框架裡執行的頁面；下方是分頁標題、主控台輸出、連結與表單的去向，以及「瀏覽器建立的 DOM 樹」（瀏覽器補上的 `tbody`、自動結束的 `p` 都看得到）。「動手改這個範例」可以修改檔案並重新執行。
- **練習**：固定的檔案唯讀顯示；可編輯的檔案各有一個有標籤的編輯區；「執行」更新預覽，「檢查」執行步驟，「重設」回到起始內容。步驟清單在檢查前就看得到，結果寫在同一份清單與 `aria-live="polite"` 的區域。
- **無障礙**：編輯區是原生 `textarea`，Tab 鍵照常移動焦點（沒有鍵盤陷阱）；檢查進行中按鈕用 `aria-disabled` 而不是 `disabled`，焦點留在按鈕上；框架有 `title`；通過與否除了顏色還有文字與圖示。沒有動畫，不需要為 `prefers-reduced-motion` 另外處理（頁面自己的 CSS 看得到讀者的設定）。
- **手機**：程式碼與預覽在 760px 以下改為上下排列；長行在自己的區塊內捲動，頁面不會橫向捲動；觸控裝置的編輯區字級為 16px（避免聚焦時縮放）。

## 7. 驗證

| 測試 | 內容 |
|---|---|
| `tests/webcode-lesson.test.ts` | 文件的組成（harness、CSP、樣式表與指令稿的位置、跳脫）、檔案合併、DOM 大綱、失敗訊息、內容的靜態檢查（`webContentProblems`） |
| `tests/webcode-loop-guard.test.ts` | 迴圈保護的轉換：包住哪些條件、不誤判字串／樣板／註解／正規表示式／屬性名稱、轉換後的程式意義不變 |
| `tests/webcode-runner.test.ts`（Chromium） | 每一種檢查與操作、主控台、連結與表單的紀錄、瀏覽器實際建立的 DOM、隔離（不能連網、讀不到父頁面與儲存空間）、無窮迴圈被停止、逾時、練習的判定與隱藏檢查 |
| `tests/webcode-lesson-dom.test.tsx` | 範例與練習元件：沙盒屬性、只相信自己框架的訊息、編輯與重新執行、結果的宣告、焦點、重設 |
| `tests/webcode-capability.test.ts` | 由藍圖建立的課通過驗證與發布閘門；`web-code` 內容與能力互相綁定；其他能力與已發布課程不變；網頁基礎島尚未發布 |
| `tests/curriculum-webcode.test.ts`（Chromium） | **每一堂** `web-code` 課：範例的 `observe` 全部成立且沒有未捕捉的錯誤；參考解答通過所有檢查與變體；起始內容與每個常見錯誤不通過 |

Chromium 是 Playwright 的 headless Chromium，頁面的載入方式和課程頁完全相同：同一個 `webDocument`、同一個 sandbox 屬性、同一個父頁面函式（`runFrameJob`，以原始碼在瀏覽器裡執行）。CI（`trials-ci`）在 Vitest 之前安裝它，沒有瀏覽器就失敗；本機沒有安裝時這些測試略過並標示 Not Executed（和沒有 JDK 時的 Java 測試相同），安裝方式：`pnpm exec playwright install chromium`。

## 8. 已知限制

- 自動測試只在 Chromium 驗證。課程只使用各瀏覽器行為一致的功能；`box` 檢查只量明確指定大小的盒子（不依賴字型的文字寬度），未捕捉錯誤的訊息文字各瀏覽器不同，檢查不比對錯誤訊息。
- 圖片、字型與媒體只能用 `data:` URI；頁面不能載入外部資源（`fetch` 會失敗）。需要 API 的課（WEB11）要在框架裡提供固定回應的 `fetch`，是之後的引擎階段。
- 框架沒有 `localStorage` 與 Cookie（不透明來源）；WEB12 需要記憶體中的替代品，是之後的引擎階段。
- 迴圈保護不涵蓋行內事件屬性、無窮遞迴的 Promise 與 `for…of` 無限的產生器；這些情況仍可能讓分頁沒有回應，重新整理即可。
- 鍵盤操作是指令稿產生的事件，只模擬 §3 列出的預設行為；Tab 移動焦點不模擬。
- `input` 操作以程式設定欄位的值：瀏覽器只對使用者親手輸入的文字套用 `minlength`／`maxlength` 的驗證，所以這兩個屬性無法用檢查重現。
- `navigated` 比對的是連結上寫的 `href`，不解析相對路徑；捲動位置沒有檢查。

## 9. 之後的引擎階段（依課程需要，向下相容）

| 階段 | 內容 | 需要的課 |
|---|---|---|
| W1（WEB-1、WEB-3 完成） | 框架內的錯誤只算在頁面自己的主控台、Enter 的隱式送出；`script.js` 在頁面載入它的位置執行（`<head>` 裡先於 body、`defer` 以「body 結尾執行」模擬、`type="module"` 由瀏覽器延後）；未捕捉的錯誤附上 script.js 的行號；harness 壓成一行，不佔文件的行數 | WEB03–WEB04、WEB08 |
| W2（WEB-3 完成） | 虛擬時鐘：檢查裡的 `setTimeout`／`setInterval` 排在虛擬時鐘上，由 `wait` 推進 | WEB10 |
| W3 | 框架裡固定回應的 `fetch`（路由、狀態碼、延遲、失敗），配合 `network-protocol` 情境 | WEB11 |
| W4 | 記憶體中的 `localStorage`、`sessionStorage` 與 Cookie | WEB12 |
| W5 | 無障礙檢查：可存取名稱、角色、標題層級、標籤關聯、鍵盤順序 | WEB13 |
| W6 | 載入時間軸與指標的模型（不是量測） | WEB14 |

## 10. 藍圖活動的對應（`webFromBlueprint`）

| 藍圖活動 | 課 | 本島的做法 |
|---|---|---|
| `dom-explorer` | WEB02–WEB09 | `dom-explorer`，`['web-code']` |
| `pipeline-diagram`、`concurrency-timeline`、`memory-inspector`、`a11y-checker`、`metric-explorer` | WEB01、WEB10、WEB12、WEB13、WEB14 | 這些互動尚未建立（見 [INTERACTIVE_LAB_ROADMAP](INTERACTIVE_LAB_ROADMAP.md)）；課改用頁面（`dom-explorer`），不放替身 |
| `protocol-sequence` | WEB11 | `network-sequence`，`['web-code', 'network-protocol']`：頁面旁邊是請求與回應的情境 |
| `challenge-stages` | WEB15 | `['web-code', 'visualization']` |

## 11. 批次規劃（依編號連續發布）

| 批次 | 課 | 引擎 |
|---|---|---|
| WEB-1 | WEB01–WEB04 | W1（需要的部分） |
| WEB-2 | WEB05–WEB07 | `hit`、`scroll`、相對於視窗的 `box` |
| WEB-3 | WEB08–WEB10 | W1（錯誤行號、`defer`）、W2（虛擬時鐘）、`dispatch` |
| WEB-4 | WEB11–WEB13 | W3、W4、W5 |
| WEB-5 | WEB14–WEB15 | W6；綜合專題 |

WEB01 發布時，網頁基礎島從 `PREPARED_ISLAND_IDS` 移到 `ISLAND_IDS`，網頁與應用開發群島第一次有已開放的課。
