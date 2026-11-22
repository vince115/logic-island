# 網頁基礎島（Web Foundations Island）

> 2026-11-23 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `webFromBlueprint` 讀入。

教學方式是 `web-code` 能力（[WEB0_WEB_CODE_CAPABILITY](WEB0_WEB_CODE_CAPABILITY.md)）：範例是一個可以修改再執行的小頁面（HTML，選用 CSS 與 JavaScript），在瀏覽器的沙盒框架裡執行，旁邊是瀏覽器建立的 DOM 樹、主控台輸出與連結／表單的去向；每個範例列出的「在瀏覽器裡的事實」與每個練習的參考解答、起始內容、常見錯誤，都由測試在真實的 Chromium 裡執行過（`tests/curriculum-webcode.test.ts`）。練習只看瀏覽器實際建立的結果，不看寫法。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 內容 | 狀態 |
|---|---|---|---|---|---|---|
| WEB01 | 網頁如何運作：瀏覽器、HTML、CSS、JS<br>`how-the-web-works` | 入門 | 40 分 | — | 6 段、5 個範例（只有 HTML、加上 CSS、加上 JavaScript、程式改動 DOM、瀏覽器修補的 HTML）、4 個練習（改標題並加段落、替標題上色、補一行讓按鈕換文字、修好 DOM 結構）、8 題 | **完整 v1.0.0** |
| WEB02 | HTML 文件結構與語意元素<br>`html-structure-and-semantics` | 入門 | 45 分 | WEB01 | 6 段、5 個範例（文件骨架、巢狀規則、div 堆出來的頁面、語意元素版、標題大綱）、4 個練習（補齊骨架、把 div 換成地標、修好標題層級、做出一頁活動公告）、8 題 | **完整 v1.0.0** |
| WEB03 | 文字、連結、圖片與媒體<br>`text-links-and-media` | 入門 | 45 分 | WEB02 | 5 段、5 個範例（文字的語意、頁內錨點與連結、相對與絕對路徑、圖片與替代文字、影音與字幕）、4 個練習（修好錨點連結、替代文字與尺寸、安全地另開分頁、控制列與字幕軌）、8 題 | **完整 v1.0.0** |
| WEB04 | 表單元素與原生驗證<br>`forms-and-native-validation` | 入門 | 50 分 | WEB02 | 6 段、5 個範例（送出的資料、label 關聯、輸入類型、選擇類控制項、原生驗證）、4 個練習（把文字變成 label、類型與必填、選項按鈕與核取方塊、入會表單）、8 題 | **完整 v1.0.0** |
| WEB05 | CSS 選擇器、串接與特異性<br>`css-selectors-cascade-and-specificity` | 入門 | 50 分 | WEB02 | 6 段、5 個範例（規則的組成、基本選擇器、後代／子代與虛擬類別、串接與特異性、繼承）、4 個練習（用 class 選取公告、修正輸掉的選擇器、子代選擇器、把 id 規則改成 class）、8 題 | **完整 v1.0.0** |
| WEB06 | 盒模型與一般排版流<br>`box-model-and-normal-flow` | 入門 | 50 分 | WEB05 | 6 段、5 個範例（盒子的四層、box-sizing、區塊與行內、外距合併、父子外距與 auto 置中）、4 個練習（算出 300px 的卡片、border-box、inline-block 導覽、置中並留出固定間距的公告欄）、8 題 | **完整 v1.0.0** |
| WEB07 | 定位與堆疊順序<br>`positioning-and-stacking` | 中級 | 55 分 | WEB06 | 6 段、6 個範例（relative、absolute 與包含區塊、fixed、sticky、堆疊順序、堆疊環境）、4 個練習（角落徽章、z-index 無效的標籤、困在堆疊環境的選單、固定或黏貼的頁首）、8 題 | **完整 v1.0.0** |
| WEB08 | JavaScript 與 DOM：選取與修改<br>`javascript-and-the-dom` | 入門 | 55 分 | WEB02、F13 | 6 段、6 個範例（走訪 DOM 樹、太早執行的指令稿、defer、選取與找不到、修改文字屬性與類別、依陣列建立清單）、4 個練習（改標題與連結、依資料加上類別、由陣列建立清單、修好太早執行又沒有處理 null 的指令稿）、8 題 | **完整 v1.0.0** |
| WEB09 | 事件與事件委派<br>`events-and-delegation` | 中級 | 55 分 | WEB08 | 6 段、6 個範例（登記與呼叫的時機、事件物件、冒泡順序、表單的 submit、逐一登記的漏洞、事件委派）、4 個練習（計數器、送出後加入清單、改寫成委派、借書籃）、8 題 | **完整 v1.0.0** |
| WEB10 | 非同步 JavaScript：Promise 與 async／await<br>`asynchronous-javascript` | 中級 | 60 分 | WEB09 | 6 段、6 個範例（計時器、同步／微任務／任務的順序、then／catch／finally、await 只暫停自己、依序與 Promise.all、載入中／成功／失敗）、4 個練習（讓紀錄依時間出現、載入中與清單、接住失敗、並行載入）、8 題 | **完整 v1.0.0** |
| WEB11 | fetch、JSON 與 API<br>`fetch-json-and-apis` | 中級 | 60 分 | WEB10 | 6 段、6 個範例（第一個請求、JSON 文字與物件、狀態碼與 response.ok、載入／空白／錯誤狀態、POST、查詢字串）、4 個練習（載入清單、依狀態碼處理、搜尋的三種狀態、送出願望）、8 題 | **完整 v1.0.0** |
| WEB12 | 瀏覽器儲存：localStorage 與 Cookie<br>`browser-storage` | 中級 | 55 分 | WEB10 | 6 段、6 個範例（重新整理後還在的次數、以 JSON 存清單、sessionStorage、Cookie、版本遷移、任何指令稿都讀得到）、4 個練習（記住主題、存取清單、遷移舊版資料、語言 Cookie）、8 題 | **完整 v1.0.0** |
| WEB13 | 語意 HTML 與 ARIA 的無障礙實作<br>`semantic-html-and-aria` | 中級 | 60 分 | WEB04、WEB09 | 6 段、6 個範例（原生頁面的角色與名稱、原生按鈕與 div、圖示按鈕的名稱、狀態屬性、下拉選單、即時區域）、4 個練習（替圖示按鈕命名、換回原生按鈕、自製切換鈕、修好下拉選單）、8 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| 網頁如何運作與 HTML 結構 | WEB01–WEB02 |
| 內容與表單 | WEB03–WEB04 |
| CSS：樣式、盒子與定位 | WEB05–WEB07 |
| JavaScript：DOM、事件與非同步 | WEB08–WEB10 |
| 資料、儲存與無障礙 | WEB11–WEB13 |

## 預覽與真實瀏覽器的差異（課文已說明或避開）

- 預覽不能連網：圖片用 `data:` URI 的小型 SVG；影片、音訊與字幕檔載不進來，WEB03 只教標記並檢查屬性與結構。
- 連結不會離開頁面、表單不會真的送出：預覽下方顯示連結要去的 `href`（照原樣，不解析相對路徑）與表單送出的資料；相對路徑怎麼解析由課文的表格說明。
- `srcdoc` 框架一律是標準模式：沒有 doctype 的文件在預覽裡看不出相容模式的差別，WEB02 以文字說明，DOM 樹下方有提示。
- `style.css` 與 `script.js` 會成為 DOM 裡的 `style` 與 `script` 元素（不是 `<link>` 與外部檔案），WEB01 說明了這一點；沒有 Network 面板與「檢視原始碼」，課文請學習者開真正的開發者工具。
- CSS 課（WEB05–WEB07）的檢查在固定 600 × 400 的頁面上量測，量的都是明確指定像素大小的盒子；`:hover` 沒有對應的操作，只在範例裡請學習者用滑鼠試；沒有「不是某個值」的檢查，題目改以固定其他元素的結果來排除 `!important` 這類繞過的寫法（必要時用隱藏的變體）。
- JavaScript 課（WEB08–WEB10）：檢查裡的計時器走虛擬時鐘（`wait` 不會真的等待，順序每次相同），預覽裡的計時器是真的；頁面沒有網路，非同步的資料由固定檔案裡以計時器做成的假載入函式提供（WEB11 換成 `fetch`）；`defer` 以「在 body 結尾執行」模擬，所以 DOM 樹裡的 `script` 會出現在 body 結尾；表單送出的紀錄在頁面呼叫 `preventDefault()` 後仍會顯示（它記錄的是 submit 事件），WEB09 有說明；瀏覽器錯誤訊息的文字各家不同，課文只說錯誤的種類與行號。
- WEB11–WEB13：頁面沒有網路，`fetch` 由課程宣告的模擬伺服器回答（固定的回應，不解析查詢字串或請求本文；回應是只有常用成員的物件，不是真的 `Response`；請求的標頭不記錄）；`localStorage`、`sessionStorage` 與 `document.cookie` 是頁面自己在記憶體裡的替代品（只支援方法，不支援 `localStorage.name` 的寫法；Cookie 的 `path`、`Secure`、`SameSite` 不模擬；預覽重新執行時保留 localStorage 與 Cookie，不保留 sessionStorage）；無障礙名稱與角色的檢查是規則的簡化版，不是完整的稽核，即時區域的朗讀無法檢查。
- 鍵盤操作是模擬的事件：Enter 送出表單與空白鍵切換核取方塊有模擬，Tab 移動焦點沒有；`minlength`／`maxlength` 只對使用者親手輸入的文字驗證，檢查無法重現，WEB04 只以文字說明。

## 後續批次

WEB-2 發布 WEB05–WEB07（CSS 選擇器與串接、盒模型、定位；引擎新增 `hit` 檢查、`scroll` 操作與相對於視窗的 `box`）。WEB-3 發布 WEB08–WEB10（DOM、事件、非同步；引擎階段 W1 錯誤行號與 defer、W2 虛擬時鐘、`dispatch` 操作）。WEB-4 發布 WEB11–WEB13（fetch、儲存、無障礙；引擎階段 W3 模擬伺服器、W4 儲存空間、W5 無障礙名稱／角色與 Tab）。WEB-5 發布 WEB14–WEB15（效能與綜合專題；W6）。

課程狀態與 3D 地景分離：網頁基礎島的 `mapState` 仍是 `'planned'`。
