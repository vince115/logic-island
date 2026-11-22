# Presence 隱私說明草案與 GPC／DNT 評估（P5）

> 日期：2026-11-21（P5）；同日 P6-D 核對並更新 §1、§2，新增 §1.1；P7 再次核對（心跳 60 秒、逾時 150 秒、共用儲存的「脈衝」） ｜ 分支：`presence/visitor-population` ｜ 狀態：**草案，尚未放上網站**
>
> 這份文件不是法律意見。§2 的文字要不要放、放在哪裡、是否需要同意機制，由使用者決定（必要時請教專業人士）。

## 1. 系統實際處理的資料

以下每一列都有測試覆蓋（`tests/presence-api.test.ts`、`tests/presence-redis-store.test.ts`）。

| 資料 | 在哪裡 | 內容 | 保留多久 |
|---|---|---|---|
| Session Cookie `li_presence` | 訪客的瀏覽器 | 伺服器產生的隨機 ID、簽發時間、簽章。`HttpOnly`、`SameSite=Strict`、只送給 `/api/presence`、沒有到期日 | 關閉瀏覽器即消失；超過 12 小時由伺服器換新 |
| Session 記錄 | 伺服器（記憶體或共用儲存） | 隨機 ID、目前位置（群島／島嶼／課程代號）、幾個時間戳、分頁的隨機標籤與各分頁離開的時間（最多 6 筆，P6-A）、限流計數。共用儲存另外在記錄旁保留該 Session「最近一次沒有新內容的回報」（脈衝，P7）：分頁的隨機標籤、時間、位置、限流計數，都是記錄裡本來就有的同類資料，沒有新增任何種類 | 最後一次心跳後 150 秒不再計入（P7 起；原為 90 秒）。刪除時間：記憶體版在之後的下一次請求清除（清理至少間隔 10 秒）；共用儲存在有其他訪客活動時最晚再 10 分鐘，完全沒有訪客時隨整組資料在 24 小時內消失 |
| 公開的人口數字 | `GET /api/presence` | 總人數、各群島、各**已開放**島嶼、各群島的公共區域人數；另有一個標頭說明計數來自記憶體或共用儲存 | 即時計算；CDN、瀏覽器與伺服器各可重用 15 秒（P6-D）。回應對所有人相同，不讀取請求的任何內容，也不設 Cookie |

**本系統的程式不處理的資料**：IP 位址（不讀取、不儲存）、User-Agent（只用來排除自稱爬蟲的請求，不儲存）、姓名、帳號、電子郵件、裝置指紋、瀏覽歷程（只知道「現在在哪」，不留下過去在哪）、跨網站的任何識別。程式本身不寫任何記錄檔。

**主機服務商那一側**：和任何網站一樣，Vercel 處理連線時會看到訪客的 IP，也有自己的存取記錄；如果依建議在 Vercel Firewall 為 `/api/presence` 設限流（[PRESENCE_P7_PREVIEW_LAUNCH_GATE.md](PRESENCE_P7_PREVIEW_LAUNCH_GATE.md) §4.6），限流是平台以 IP 為單位執行的。這些都不經過本系統的程式，也不進入 Presence 的資料，但隱私說明不應該寫成「沒有任何人看得到 IP」。

課程層級的人數只留在伺服器，不對外公開：「某一堂課有 1 個人」對單一訪客透露的資訊多於地圖所需。

### 1.1 識別碼與文件的一致性核對（P6-D）

逐項對照程式、測試與本文件。結論：**一致**；核對時發現並修正的兩處不精確已反映在上表與 §2（記錄的刪除時間、IP 的說法）。

| 項目 | 程式的實際行為 | 依據 |
|---|---|---|
| Cookie 名稱與屬性 | `li_presence`；`Path=/api/presence`、`HttpOnly`、`SameSite=Strict`、HTTPS 下 `Secure`、沒有 `Expires`／`Max-Age`（關閉瀏覽器即消失） | `src/lib/presence/session.ts` `sessionCookie`；`tests/presence-api.test.ts`「is a session cookie only the presence API gets」；瀏覽器測試檢查實際的 Cookie 屬性 |
| Cookie 內容 | `v1.<隨機 16 位元組>.<簽發時間>.<HMAC-SHA256 簽章>`。沒有 IP、User-Agent 或任何關於訪客的資料；簽發超過 12 小時由伺服器換新 | `session.ts` `mintToken`／`verifyToken` |
| 誰拿得到 Cookie | 只有瀏覽器送回 Cookie、過了 2 秒暖機的訪客才建立 Session。不留 Cookie 的用戶端、自稱爬蟲、送出 GPC／DNT 的瀏覽器都不會拿到 Cookie，也不佔伺服器記憶體 | `service.ts`；`tests/presence-api.test.ts`「holds no memory for clients that keep no cookie」等 |
| 分頁標籤 | 每次載入頁面產生的 8 位元組亂數，只存在該頁的記憶體，**不寫入** `localStorage`、`sessionStorage` 或 Cookie；伺服器只用它分辨同一個 Session 的分頁。分頁之間的通知（P7，`BroadcastChannel`）只傳一個固定的字「left」，不含分頁標籤或任何識別碼，不離開瀏覽器，也不保存 | `client.ts`；瀏覽器測試檢查兩種 storage 都沒有識別碼 |
| 伺服器端的記錄 | 欄位正好是：`location`、`seen`、`tab`、`since`、`ownerSeen`、`away`、`left`（有分頁告別後才有）、`windowStart`、`writes`；共用儲存多一個 `written`（這筆記錄最後寫入的伺服器時間）。脈衝的欄位正好是 `tab`、`since`、`location`、`at`、`windowStart`、`writes`（P7） | `tests/presence-redis-store.test.ts`「stores a session's place and times, and nothing about the visitor」逐欄比對 |
| 對外公開的內容 | 欄位正好是 `v`、`at`、`ttlMs`、`total`、`hub`、`regions`、`islands`、`commons`；不含任何 Session ID、分頁標籤、課程代號或個別訪客的時間 | `tests/presence-api.test.ts`「publishes aggregate numbers only」；release preflight 的 `presenceAnswerProblems` 在建置後再檢查一次 |
| 快取 | 人口數字可被共用 15 秒，且對所有人相同（帶誰的 Cookie、帶不帶隱私訊號、帶什麼查詢字串都一樣）；其餘回應一律 `no-store` | `tests/presence-api.test.ts`「lets a CDN hand one answer to everyone for 15 seconds」 |
| 隱私訊號 | GPC 或 DNT 任一：追蹤器不啟動；請求仍到伺服器時不設 Cookie、不建立 Session | §3.3；`PRESENCE.honorPrivacySignals` 仍為 `true`（P6 未更動） |
| 規劃中的島嶼 | 不公布任何「規劃中島嶼」的人數；看它的訪客計入所屬群島的公共區域（P6-B） | `locations.ts`；`tests/presence-api.test.ts`「counts nobody on a planned island」 |

### 1.2 P7 核對：改了什麼、沒改什麼

| 項目 | P7 的變動 | 對隱私說明的影響 |
|---|---|---|
| 心跳間隔 | 30 秒 → 60 秒 | §2 的文字由「每 30 秒」改為「每分鐘」 |
| 逾時 | 90 秒 → 150 秒 | §2 的文字由「90 秒」改為「兩分半鐘」；沒有告別就消失的訪客（當機、斷線）多被計入最多 60 秒 |
| 共用儲存的脈衝 | 新增一個欄位，內容是記錄裡已有的同類資料（上表） | 沒有新的資料種類；刪除時間與記錄相同（一起清除，有測試） |
| Cookie | 名稱、屬性、內容、簽發與換新規則都沒有動 | 無 |
| GPC／DNT | `PRESENCE.honorPrivacySignals` 仍為 `true`，行為沒有動 | 無 |
| 對外公開的內容 | 欄位沒有動；`ttlMs` 的值由 90000 變為 150000 | 無 |
| 儲存連不上時 | API 3 秒內回 503，不設 Cookie、不洩漏儲存位址；地圖在 150 秒後不再顯示舊的人影 | 無 |
| 分頁之間的通知 | 一個分頁告別時通知同一個瀏覽器的其他分頁（`BroadcastChannel`，同源、只在瀏覽器內）。內容是一個固定的字；分頁在背景時不開通道；送出 GPC／DNT 的瀏覽器不開；不寫入任何儲存（瀏覽器測試檢查 `localStorage` 與 `sessionStorage` 仍是空的） | 無新的資料；§2 的文字不必改 |

依據：`tests/presence-redis-store.test.ts`「stores a session's place and times, and nothing about the visitor」（逐欄比對記錄與脈衝）、「gives up on a store that does not answer in time…」；`tests/presence-api.test.ts` 的 Cookie、GPC／DNT、快取測試全數未修改且通過。

## 2. 隱私說明草案

建議放在頁尾連結的說明頁，或地圖旁的「關於島上的人」說明。繁體中文：

> ### 島上的人影代表什麼
>
> 地圖上走動的小人，代表此刻正在瀏覽各座島嶼的訪客人數。人影的數量經過換算與上限處理，不是一人對應一個。
>
> **我們怎麼計算**
>
> - 您開著本站的分頁時，瀏覽器每分鐘會告訴我們「這個分頁現在在哪一座島」（換頁時也會說一次）。分頁切到背景或關閉時就停止。
> - 為了不把同一個人算成很多人，我們會在您的瀏覽器放一個暫時的 Cookie，裡面只有一組隨機號碼。它不含您的身分，關閉瀏覽器就消失。
> - 超過兩分半鐘沒有收到回報，您就不再被計入；相關記錄隨後刪除（通常在十幾分鐘內，最遲一天）。
>
> **我們不做的事**
>
> - 這項功能不讀取也不儲存您的 IP 位址、姓名、帳號或任何能辨識您的資料。（和瀏覽任何網站一樣，網站的主機服務商處理連線時會看到 IP。）
> - 不保留您去過哪些頁面的紀錄，只知道「現在」在哪裡。
> - 不把資料交給第三方，不用於廣告，也不跨網站追蹤。
> - 對外只公開各島嶼的人數總和，看不到任何個別訪客。
>
> **如果您不想被計入**
>
> - 開啟瀏覽器的「全球隱私控制」（Global Privacy Control）或「不要追蹤」（Do Not Track），我們就不會計入您，也不會放 Cookie。
> - 停用 Cookie 或 JavaScript 也有同樣效果。
> - 這些都不影響您使用課程與地圖。

英文版在確定要放之後再翻譯。

## 3. GPC／DNT 行為評估

### 3.1 兩個訊號

| | Global Privacy Control（GPC） | Do Not Track（DNT） |
|---|---|---|
| 形式 | 請求標頭 `Sec-GPC: 1`、`navigator.globalPrivacyControl` | 請求標頭 `DNT: 1`、`navigator.doNotTrack` |
| 現況 | 仍在推進的規格；部分瀏覽器與擴充套件內建 | W3C 規格已停止推進，主流瀏覽器陸續移除設定 |
| 法律效力 | 在美國部分州被視為有效的「選擇退出販售／分享」訊號 | 普遍沒有強制力 |
| 與本系統的關係 | Presence 不販售、不分享資料，嚴格說不在它的適用範圍內 | 同左 |

### 3.2 三種做法

| 做法 | 優點 | 代價 |
|---|---|---|
| A. 不理會訊號 | 人數最準 | 訪客明確表示不想被追蹤，仍被放 Cookie 與計數；觀感與信任成本 |
| **B. 尊重兩個訊號（已實作，預設）** | 立場清楚、實作極小、不必判斷哪個訊號「算數」 | 少算：送出訊號的訪客不計入。開發者族群使用這類瀏覽器的比例偏高，本站受影響可能比一般網站大（實際比例未量測） |
| C. 只尊重 GPC | 只認仍有效力的訊號 | 開著 DNT 的訪客會覺得被忽略；多一條要解釋的規則 |

### 3.3 已實作的行為（做法 B）

| 情況 | 行為 |
|---|---|
| 瀏覽器帶有任一訊號 | 追蹤器不啟動：不送任何請求、不掛任何事件監聽 |
| 帶訊號的請求仍然送到伺服器（例如舊版頁面） | 回 200 `counted: false`，**不設 Cookie、不建立 Session**，並請對方 10 分鐘內不要再問 |
| 訪客中途開啟訊號 | 之後的心跳不再生效；原有的 Session 在 150 秒後逾時消失 |
| 帶訊號的訪客看地圖 | 照常看得到人影。讀取總人數不涉及追蹤任何人 |
| 帶訊號但請求本身有問題（跨站、格式錯誤） | 照常拒絕。訊號不是繞過檢查的方法 |

開關是一個常數：`src/lib/presence/config.ts` 的 `PRESENCE.honorPrivacySignals`。設為 `false` 即回到做法 A。

### 3.4 建議

維持做法 B。Presence 是裝飾性的功能，少算幾個人不影響任何人的學習；反過來，忽略訪客明確的意願換來的只是比較準的小人數量。

## 4. 是否需要同意機制

這一點我無法替使用者判斷，列出考量：

- 這個 Cookie 不是「提供訪客要求的服務所必需」的，性質上接近匿名的流量統計。
- 部分法域（特別是歐盟）對非必要 Cookie 要求事前同意；有些主管機關對「匿名、第一方、用途單一的流量統計」給予豁免，但條件各不相同。
- 本站是否有需要顧及這些法域的訪客，以及要採取哪一種做法（說明文字、同意橫幅、或依地區關閉），需要使用者決定。

如果決定完全不用 Cookie，替代設計是「每個分頁各自算一個人」（不需要 Cookie，但同一位訪客開三個分頁會算三個人，而且更容易被灌水）。目前沒有實作。

## 5. 待使用者決定

| 編號 | 決定 | 建議 |
|---|---|---|
| V1 | §2 的說明文字是否採用、放在哪裡 | 採用，放在頁尾的說明頁；上線 Presence 之前完成 |
| V2 | GPC／DNT：維持「兩個都尊重」、只尊重 GPC、或都不理會 | 維持兩個都尊重 |
| V3 | 是否需要 Cookie 同意機制 | 視訪客所在法域而定，建議請教專業人士 |
| V4 | 若啟用 Vercel Firewall 的 IP 限流，說明文字是否要提到 | 目前的草案已用「主機服務商處理連線時會看到 IP」涵蓋；是否要更明確由使用者決定 |
