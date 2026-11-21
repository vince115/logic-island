# Dynamic Island Population — P6：Production Readiness 與 Preview 驗收準備

> 記錄日期：2026-11-21（Asia/Taipei）。分支 `presence/visitor-population`，工作目錄 `../logic-island-presence`。
> 狀態：**P6-A～P6-E 完成本機自動化驗證；所有旗標仍預設關閉**。沒有建立任何雲端資源、沒有修改任何環境變數或 Firewall 設定、沒有部署、沒有合併 `main`。
> 前兩輪的記錄：[PRESENCE_POPULATION_SYSTEM.md](PRESENCE_POPULATION_SYSTEM.md)、[PRESENCE_ROUND2.md](PRESENCE_ROUND2.md)。本文件更新其中三件事：P1-44 已修正；NPC 只畫在已開放的島（第二輪寫的「29 座島都有 NPC」不再成立）；共用儲存的費用估算改為實測值（第二輪低估約 4 倍）。
> 需要使用者決定或動手的事項集中在 §9。

## 1. 本輪範圍與結果

| 階段 | 內容 | 結果 |
|---|---|---|
| 前置 | 分支落後 `main` 14 個 commit（P9.8c、課程第 5 批），3 個檔案衝突 | 已把 `main` 併入分支，衝突兩邊都保留 |
| P6-A | P1-44 的 Presence 競態；真 Redis 的並行與亂序測試 | 已修正；另修掉同一類的三個問題（§2） |
| P6-B | NPC 依島嶼是否開放顯示 | 完成：只有已開放的島有人影，規劃中的島沒有（§3） |
| P6-C | Redis 命令量實測與成本；Vercel 專案盤點 | 命令量已實測（§4）；**Vercel 專案仍讀不到**，需要你授權（§5） |
| P6-D | GPC／DNT、preflight 白名單、15 秒快取、限流評估、隱私一致性 | 完成（§6） |
| P6-E | Preview 驗收方案 | 方案與自動驗收腳本備妥，尚未執行（§7，[PRESENCE_PREVIEW_VALIDATION.md](PRESENCE_PREVIEW_VALIDATION.md)） |

## 2. P6-A：P1-44 與同類的亂序問題

### 2.1 原因

同一位訪客開了兩個視窗 A、B，B 在前景（擁有 Session）。兩個視窗幾乎同時被隱藏，各送出一個告別；A 稍早送出的心跳還在路上。伺服器收到的順序是：

1. A 的告別：A 不是擁有者，**被直接丟棄**，沒有留下任何痕跡。
2. B 的告別：Session 標為離開。
3. A 那個晚到的心跳：Session 處於離開狀態，任何分頁的心跳都能把它救回來。伺服器沒有任何資訊可以判斷「這個心跳是 A 離開之前送的」。

結果是沒有人在看，卻多算一個人，直到 90 秒逾時。

### 2.2 修正

記錄裡新增 `left`：**每個分頁最後一次告別的時間**（以該分頁自己的時鐘；最多記 6 個分頁，最舊的先丟，擁有者的不丟）。規則只有一條：

> 心跳的 `since`（分頁變為可見或換頁的時間）不晚於同一個分頁最後一次告別的時間，就是「離開之前送的」，不改變任何東西。

這條規則對所有分頁一視同仁，所以「所有分頁都已告別」的 Session，不論請求以什麼順序到達，最後都是離開狀態。

為了讓「之前」與「之後」永遠分得清楚，追蹤器保證告別之後的每個 `since` 都嚴格晚於那次告別，就算同一毫秒內隱藏又顯示，或電腦的時鐘被往回調。

### 2.3 一併修掉的三個同類問題

為 P1-44 寫排列測試時找到的，都會造成「沒有人卻被計入」或「計數時間錯誤」：

| 問題 | 後果 | 修正 |
|---|---|---|
| 告別比 Session 的第一個有效心跳先到（訪客在頁面回報的瞬間離開） | 沒有記錄可以記下這個告別，心跳到達後多算 90 秒 | 這種告別會建立一筆「不計入任何人」的記錄，只用來記住告別；90 秒後照常過期 |
| 請求被晚處理（另一個 instance、時鐘較慢） | Session 的最後心跳時間被往回撥，提早過期 | `seen` 只增不減 |
| 分頁在同一毫秒內隱藏又顯示，或時鐘被調回 | 回來之後的心跳可能被當成舊的，或反過來 | 見 §2.2 的追蹤器保證 |

### 2.4 測試

- **引擎**（`tests/presence-engine.test.ts`）：兩個與三個分頁的劇本以**所有順序**送達（共 6,480 種排列，加上一個 5,040 種的「最新的分頁留下」劇本）；另有 3,000 個隨機劇本以隨機順序送達。檢查三件事：所有分頁都離開就不計入；最後使用的分頁還在就計入一次、位置正確；被計入的一定是真的還在的分頁。
- **三種儲存共用一份亂序契約**（`tests/helpers/presence-store-contract.ts`）：記憶體、替身 Redis（3 個 instance）、**真 Redis（4 個 instance，各用自己的連線，指令稿真的在伺服器上交錯執行）**。每輪 60 個 Session、約 500 個請求同時送出、順序打亂、隨機分給各 instance，6 組隨機種子。結束時每個 instance 回報的計數相同、每個 Session 只有一筆記錄、已離開的 Session 再收到晚到的心跳也不會回來。
- **API 層**（`tests/presence-api.test.ts`）：以真正的請求重演 P1-44 與「告別先到」。
- 新增的測試在修正前的程式上有 **21 項失敗**，修正後全數通過。

### 2.5 仍存在的限制

兩種情況在多分頁＋請求亂序時仍可能短暫不準，都會在下一次心跳（最多 30 秒）自動修正，而且方向是少算或位置暫時錯，不是多算：

1. 擁有者分頁離開、另一個分頁還開著：Session 會先被標為離開，等另一個分頁的下一次心跳才回來。這是第一輪就有的設計。
2. 某個分頁很舊的心跳，在別的分頁離開之後才到達並接手了 Session，隨後又被它自己較早的告別帶走。

要完全消除需要改為「每個分頁各自記錄狀態」的資料模型，這是引擎的重寫，本輪沒有做。

同一個 Session 同時有超過 9 個「落在別的 instance 的寫入」時，Redis 的寫入會在 10 次嘗試後放棄並回 503。一個 Session 每分鐘最多 40 次寫入、每個分頁 30 秒才一次，正常使用不會遇到。

## 3. P6-B：NPC 開放狀態

### 3.1 規則

是否開放只看既有的島嶼 registry（`src/content/world/islands.ts`）：學科島的 `status` 由課程決定，**有任何一堂已寫好的課就是開放，否則是規劃中**；互動實驗島是開放的。沒有新增任何清單。

| 位置 | 計數（API） | 地圖上的人影 |
|---|---|---|
| 已開放的島 | 計在該島 | 畫在該島 |
| 規劃中的島 | **沒有自己的人數**。正在看它的訪客計入所屬群島的公共區域 | 島上不畫任何人影 |
| 群島的公共區域 | 群島頁面上的訪客，加上正在看該群島規劃中島嶼的訪客 | 畫在該群島的橋上 |
| 中央樞紐 | 首頁、課程總覽等不屬於任何島的頁面 | 畫在通往互動實驗島的橋上；互動實驗島自己的訪客畫在島上 |

- **沒有任何人口被移到已開放的島**：看規劃中島嶼的訪客只會出現在同一個群島的公共區域，群島的總人數不變。有測試檢查「規劃中的島就算被塞了 50 個人，地圖上任何地方都不多畫一個」。
- 規則做在兩層。伺服器端：位置解析不把規劃中的島當成可以停留的地方（`locations.ts`），所以 API 從不公布規劃中島嶼的人數。地圖端：頁面把「這張地圖上哪些島未開放」交給地圖（`PopulationConfig.closed`），地圖不為它們建立活動區域，不依賴 API 的行為。
- 一座島寫出第一堂課之後，registry 的 `status` 自動變為開放，NPC 隨之出現，不需要改 Presence 的任何設定。

### 3.2 目前的實際狀態（2026-11-21 的 registry）

| 群島 | 已開放（有人影） | 規劃中（沒有人影） |
|---|---|---|
| 程式與資訊（cs） | 基礎程式、資料結構、演算法、資料庫、程式語言（5 座） | 網路、系統分析、資訊系統（3 座） |
| AI 人工智慧 | 無 | 全部 7 座 |
| 數位設計 | 無 | 全部 4 座 |
| 網頁與應用開發 | 無 | 全部 4 座 |
| 系統與雲端工程 | 無 | 全部 6 座 |
| 中央樞紐 | 互動實驗島 | |

所以目前會出現人影的地方是：**6 座島，加上五個群島各自的橋與樞紐的橋**。AI、設計、網頁、系統四個群島的地圖上，訪客只會出現在橋上，直到那裡有第一堂課。這取代了第二輪記錄的「29 座學科島都有活動區域」：活動區域的資料仍然算得出來（幾何測試照舊對 29 座島執行），只是未開放的島不使用。

### 3.3 一個需要你確認的解讀

你的指示是「規劃中：不顯示訪客 NPC」「Region 公共區域：保留對應 Region 的在線訪客」「不得將規劃中的島嶼人口任意轉移至已開放島嶼」。我把正在看規劃中島嶼的訪客算進**同一個群島的公共區域**（橋上），理由是他們確實是那個群島的在線訪客，而規劃中的島沒有內容可以「在」上面。

另一種解讀是這些訪客**完全不畫**（只留在群島總數裡）。如果你要的是這一種，改動很小：伺服器保留規劃中島嶼的位置，地圖照舊不畫。請在 §9 的 Q1 告訴我。

## 4. P6-C：Redis 命令量與成本

完整內容在 [PRESENCE_SHARED_STORE.md](PRESENCE_SHARED_STORE.md) §4–§5，這裡只列結論。

### 4.1 一個更正

第二輪的費用估算把一次 `EVAL` 算成一個指令。**Upstash 的計費是「指令稿算一個，指令稿裡執行的每個指令再各算一個」**（[官方說明](https://upstash.com/docs/redis/overall/billing)）。照這個規則，第二輪的結構每次心跳是 6–8 個指令，不是 1–2 個。

本輪因此改寫了儲存結構（一個 HASH 取代 HASH＋ZSET，清理與續期改為定時而非每次寫入，計數改用一般指令）：

| | 第二輪的結構 | 現在 |
|---|---|---|
| 每次心跳 | 6（同一個 instance）／8 | **3**／**4** |
| 每次計數 | 4 起 | **1**（遇到過期記錄時 +3） |

### 4.2 實測

用真正的 API 流程模擬訪客 24 小時，替身 Redis 與本機真 Redis 各跑一次，12 個情境的計費指令總數兩邊完全相同（[`evidence/presence/p6/redis-cost.json`](evidence/presence/p6/redis-cost.json)）。

| 同時在線 | 每日指令 | 每月指令 | 隨用隨付 |
|---|---|---|---|
| 2 人 | 2.2 萬～3.5 萬 | 65 萬～105 萬 | US$1.3–2.1 |
| 10 人 | 10.7 萬～15.0 萬 | 320 萬～450 萬 | US$6.4–9.0 |
| 100 人 | 106 萬～142 萬 | 3,184 萬～4,271 萬 | US$64–85（改用固定月費 US$10 的方案即可） |

範圍的下限是「1 個 instance、沒人看即時地圖」，上限是「3 個 instance 輪流、全天有人看地圖」。「同時在線」指任何時刻都有這麼多個可見分頁，全天 24 小時。

- **每次心跳**：3.1 個指令（1 個 instance）、4.1 個（3 個 instance）。**每次 GET 聚合查詢**：1 個；之前有人離開時 +3。
- **Session TTL 與清理**：記錄 90 秒後不再計入（不花指令）；清理每 10 分鐘隨一次寫入進行（+1～2 個指令，每天不到 300 個）；Key 的 24 小時 TTL 每 6 小時續期一次（每天 4 個指令）。
- **Upstash Free（每月 50 萬指令）**：約 **1,100 訪客 · 小時／月，相當於平均同時在線 1.5 人**。2 人就超過了。Preview 驗收足夠；Production 要看實際流量。

### 4.3 沒有驗證的

以上是對「Redis 的行為」與「Upstash 文件寫的計費規則」的量測，不是對 Upstash 帳單的量測。實際帳單、延遲、Free 用完時的行為，要等 Preview 接上真正的資源才能確認（[PRESENCE_PREVIEW_VALIDATION.md](PRESENCE_PREVIEW_VALIDATION.md) §5.1）。

## 5. Vercel 部署環境盤點

**唯讀盤點沒有完成**：Vercel MCP 對這個專案的 team 回 403（需要你用一條同意連結授權），本機 `vercel` CLI 登入的是另一個帳號（`devinces-projects-841b144d`，看不到這個專案）。我沒有嘗試其他方式取得存取權。下表是不需要授權就能確認的部分。

| 項目 | 結果 | 依據 |
|---|---|---|
| 專案 | `vince115s-projects/logic-island`（team ID `team_K7kuvQf6IZKV4nMVef0EQPPc`） | 2026-11-21 MCP 的 403 回應、GitHub commit status 的連結 |
| Git 與 Production branch | 公開 repo `vince115/logic-island`，預設分支 `main`；`main` 的每個 commit 都有 Vercel 的部署狀態，Production 網址 `logic-island-psi.vercel.app` | `gh api`；交接記錄 |
| 本分支的部署 | 每次推送都會產生一個 Preview 部署（預設旗標，所以不含 Presence） | `c1bb8ee` 的 commit status：Vercel「Deployment has completed」 |
| Production 目前的內容 | 全靜態；`/api/presence` 回 **404**（Presence 不在 Production 的 build 裡） | 2026-11-21 `curl` |
| CDN 節點 | 我這裡連到 `hkg1`；回應是靜態快取命中 | 回應標頭 `x-vercel-id`、`x-vercel-cache` |
| 設定檔 | repo 沒有 `vercel.json`／`vercel.ts`，沒有指定函式區域、沒有 cron、沒有 Firewall 規則 | repo |
| **函式的部署區域** | **未知**。Production 沒有任何函式，所以連從回應標頭推測都做不到。Vercel 新專案的預設是 `iad1`（美東） | 需要授權或你在後台確認 |
| **現有環境變數名稱** | **未知** | 需要授權 |
| **Vercel 方案** | **未知**（只知道 CLI 登入的另一個帳號是 Hobby，與本專案無關） | 需要授權 |
| **已安裝的整合** | **未知** | 需要授權 |
| **Preview 與 Production 的隔離** | 已知：Preview 在 Vercel Authentication 後面（未登入導向 SSO）。環境變數的範圍設定未知 | 交接記錄；需要授權 |

要補完這張表，有兩個辦法：

- 你同意後我產生一條同意連結（10 分鐘內有效、只能用一次），你在瀏覽器按同意，我就能唯讀讀取專案設定、環境變數**名稱**、整合與部署記錄。我不會讀取任何變數的值。
- 或者你在 Vercel 後台看這五項告訴我：Settings → General（方案）、Settings → Functions（區域）、Settings → Environment Variables（名稱與各自的環境）、Integrations、Settings → Deployment Protection。

函式區域是唯一會影響佈建的一項：Redis 要建在同一個區域。

Preview 與 Production 在 Presence 這一層怎麼隔開，見 [PRESENCE_PREVIEW_VALIDATION.md](PRESENCE_PREVIEW_VALIDATION.md) §2。

## 6. P6-D：安全與隱私

### 6.1 GPC／DNT

沒有更動。`PRESENCE.honorPrivacySignals` 仍為 `true`：帶任一訊號的瀏覽器不啟動追蹤器；請求仍到伺服器時不設 Cookie、不建立 Session。既有的測試全數通過。

### 6.2 Preflight 白名單

沒有更動。例外仍是字串完全相等的 `/api/presence/route`，只在以 `LOGIC_ISLAND_PRESENCE=1` 執行 preflight 時成立，且 handler 實際執行的檔案不得含未發布內容。本輪以 CI 的旗標重跑的結果見 §8。

### 6.3 人口 GET 快取 15 秒

`snapshotCacheSeconds` 由 5 改為 15：`Cache-Control: public, max-age=15, s-maxage=15`，伺服器 instance 對共用儲存的計數也重用 15 秒。地圖本來就是每 15 秒問一次。

**不會造成跨使用者的資料洩漏**，理由與測試：

- 處理 GET 的函式**不讀取請求的任何內容**（Cookie、標頭、查詢字串都不讀），回應只由「現在的計數」決定。
- 測試（`tests/presence-api.test.ts`「lets a CDN hand one answer to everyone for 15 seconds」）用七種不同的請求問同一個時刻的人口：帶甲訪客的 Cookie、帶乙訪客的 Cookie、偽造的 Cookie、隱私訊號、`Authorization` 與轉送的 IP、查詢字串、不同語言。**回應逐位元組相同**，都不設 Cookie，也沒有 `Vary`。
- 要特別測 Cookie，是因為 Presence 的 Cookie 路徑就是 `/api/presence`，瀏覽器發 GET 時會帶上它。地圖自己的請求用 `credentials: 'omit'` 不帶 Cookie，但安全性不能依賴這一點。
- 其餘所有回應一律 `no-store`：每一種 POST 的結果（計入、發 Cookie、告別、拒絕、隱私訊號、爬蟲）、旗標關閉的 404、儲存故障或未設定的 503。同一個測試逐一檢查。
- 回應的內容仍然只有八個聚合欄位。新增的回應標頭 `x-presence-store`（`memory` 或 `shared`）對所有人相同，用來讓驗收確認儲存真的接上了。

代價：地圖上的人影最多落後實際計數約 30 秒（instance 的 15 秒加 CDN 的 15 秒；地圖的請求不使用瀏覽器自己的快取）。Session 的逾時是 90 秒，這個落後在可接受範圍。

### 6.4 限流與濫用防護評估

已經在程式裡的防線：

| 防線 | 擋住什麼 |
|---|---|
| 只接受本站頁面發出的 POST（`Sec-Fetch-Site`／`Origin`） | 其他網站的頁面替訪客送請求 |
| 請求本體最多 512 位元組、欄位嚴格比對 | 大請求、任意內容 |
| 簽章的 Cookie＋2 秒暖機 | 不留 Cookie 的腳本與爬蟲：不建立 Session，不花任何儲存指令 |
| 每個 Session 每分鐘 40 次寫入 | 單一 Session 灌請求；視窗滿了之後被拒絕的寫入最多花一個 Redis 指令（一次讀取），不寫入 |
| 最多 50,000 個 Session | 儲存無限成長 |
| 自稱爬蟲的 User-Agent 不計入 | 連結預覽、監控 |
| GET 快取 15 秒（CDN 與 instance） | 讀取洪水打到儲存；帶亂數查詢字串繞過 CDN 時，每個 instance 仍然 15 秒才讀一次 Redis |
| 位置由伺服器依 registry 解析 | 偽造不存在的島或課程 |

仍然做得到的事，以及後果：

| 攻擊 | 後果 | 現有的緩衝 |
|---|---|---|
| **灌水**：會保存 Cookie、會偽造 `Origin` 的腳本開很多假 Session | 人數變多。每個假訪客要 2 個請求建立、每 90 秒 1 個請求維持 | 地圖上的人影數量有上限且成長很慢（一座島 64 人才 8 個人影，整張地圖最多 40 個）；網站目前不顯示任何人口數字 |
| **燒額度**：同上，但目的是用光 Redis 指令或函式呼叫 | 100 個假 Session 全速送（每個每分鐘 40 次）約 40 分鐘用完 Free 的每月 50 萬指令 | Free 用完後 API 回 503，地圖沒有即時人影，網站其餘部分不受影響，不會產生費用。隨用隨付可在 Upstash 設每月預算上限 |
| **GET 洪水**（帶亂數查詢字串） | 每個請求都是一次函式呼叫；Redis 幾乎不受影響 | instance 快取 |

本系統不讀 IP，所以**以 IP 為單位的限流只能做在平台層**。建議（Production 上線前；我沒有執行，這是修改專案的安全設定）：

- Vercel Firewall 自訂規則：路徑等於 `/api/presence` 的請求，每個 IP 每 60 秒 120 次，超過就拒絕。正常訪客每個分頁每分鐘約 2.3 次 POST 與 4 次 GET，這個上限大約容得下同一個 IP 後面 20 人。**學校或公司整個單位共用一個對外 IP 的情況要注意**：上限設太低會讓教室裡的學生不被計入（只影響人影，不影響課程）。
- 這個上限擋不住「燒額度」，只是把速度限制在每個 IP 每天約 17 萬次請求。真正的保險是儲存那一側的上限（Free 的硬上限，或隨用隨付的預算）。
- 各方案可用的限流規則數量我沒有查到可靠數字，專案的方案也未知（§5）。

評估過但不建議現在做的：在 route 裡用 `@vercel/firewall` 的 `checkRateLimit`（要加套件，而且仍然要先在後台建立規則）；BotID 或挑戰頁（要在每個頁面加腳本，對一個裝飾性功能太重）。

### 6.5 Cookie、Session、匿名識別碼與隱私文件

逐項核對的結果在 [PRESENCE_PRIVACY.md](PRESENCE_PRIVACY.md) §1.1：**一致**。核對時修正了文件裡兩處不精確的說法：

- 「記錄隨即刪除」不準確：90 秒後不再計入是精確的，但記錄本身要等清理。本輪把共用儲存的清理改為每 10 分鐘必定進行一次（之前只在有人查詢人口或儲存已滿時才清），文件改寫為實際的時間。
- 「不記錄 IP」改為「本系統的程式不讀取也不儲存 IP」，並補上主機服務商那一側的說明。

### 6.6 不公開個別訪客資料

沒有更動，並多了兩個檢查：規劃中島嶼沒有自己的人數（§3）；新的 `left` 欄位（分頁標籤與離開時間）只存在伺服器的記錄裡，測試確認人口數字不含任何分頁標籤。

## 7. P6-E：Preview 驗收

方案、隔離方式、人工步驟、自動驗收腳本與人工清單都在 [PRESENCE_PREVIEW_VALIDATION.md](PRESENCE_PREVIEW_VALIDATION.md)。本輪為它做的程式改動：

- Redis 的 Key 帶環境名稱，Preview 與 Production 就算共用資料庫也不會互相計入。
- Vercel 的 Preview 部署沒有設簽章金鑰時回 503（之前只有 Production 這樣）。多個 instance 各用臨時金鑰會讓每位訪客不斷重新開始，Preview 會「看起來能動但數字是錯的」。
- `GET /api/presence` 多一個標頭 `x-presence-store`，讓驗收腳本確認儲存真的是共用的。
- 新的驗收腳本 `preview-validate.mjs`，已在本機的 live build 上執行（§8）。

**Preview 上線需要的最少人工操作**（細節與原因見該文件 §3）：

1. 在 Vercel Marketplace 建立 Upstash Redis（Free），只接 Preview。
2. 新增三個 Preview 範圍的環境變數：`LOGIC_ISLAND_PRESENCE=1`、`LOGIC_ISLAND_POPULATION_NPC=live`、`LOGIC_ISLAND_PRESENCE_SECRET`（自己產生的隨機字串）。
3. 重新部署這個分支的 Preview。
4. 給驗收腳本一個 Protection Bypass 密鑰（或你在已登入的瀏覽器照清單手動驗）。
5. 手機真機驗收（登入 Vercel 或用 Shareable Link）。

## 8. 測試與 CI 結果

**全部是本機隔離副本的結果**（worktree 的 rsync 副本，直接呼叫 node CLI），不是 Preview、不是 Production、不是真機。基線是併入 `main` `f36ba39` 之後的分支。

| 檢查 | 結果 |
|---|---|
| Typecheck、ESLint（全專案） | 0 錯誤 |
| 單元測試全套（Vitest，含本機真 Redis） | **101 個檔案，2,750 通過／10 略過／0 失敗**。Presence 與 preflight 相關 10 個檔案 222 項：有真 Redis 時 221 通過／1 略過，沒有時 201 通過／21 略過（略過不是通過） |
| 新測試在舊程式上 | P6-A 新增的測試有 21 項在修正前的程式上失敗 |
| 真 Redis：並行與亂序 | 亂序契約以 4 個 instance、4 條連線執行；指令稿的每一種回覆；伺服器的指令統計與計費表逐項相同 |
| 24 小時成本模擬 | 12 個情境，替身與真 Redis 的計費指令總數全部相同 |
| E2E 全套，預設 build（旗標全關） | **437 通過／359 略過／2 失敗**。兩項失敗是 `main` 既有的 P1-43（`e2e/candidate-integration.spec.ts:179`、`:264`），與前兩輪相同 |
| Presence E2E：`PRESENCE=1 NPC=mock REGIONAL_WORLD=1` | **54 通過／18 略過／0 失敗** |
| P9 區域地圖：`NPC=mock P9_PROTOTYPE=1` | 10／10 |
| 同上再加 `P9_SHARED_CANVAS=1`（P9.8c 的共用畫布，本輪併入 `main` 後才有的組合） | 10／10 |
| Live：`PRESENCE=1 NPC=live` | 4／4 |
| Preview 驗收腳本，對本機的 live build | **14 通過／0 失敗／1 略過**（略過的是 CDN 命中，本機沒有 CDN）。記錄在 [`evidence/presence/p6/preview-validate-local.json`](evidence/presence/p6/preview-validate-local.json) |
| Release preflight，預設 build | 0 個 route handler；`--build` 通過 |
| Release preflight，CI 的旗標（`TRIALS=1 REGIONAL_WORLD=1`） | `--build --probe` 通過（43 個網址） |
| 同上加 `PRESENCE=1`，preflight 也帶這個旗標 | 通過：`routes` 註明唯一的 handler 與掃描的 6 個檔案 |
| 同一個 build，preflight 不帶旗標 | `routes` 與 `probe` 都失敗（符合設計：未宣告的 Presence build 會被擋下） |
| 旗標全關對 `main` 逐像素（9 頁 × 桌機／手機） | 最終版本 **18 組全部 0 差異**。過程中有一次在 `/curriculum/programs-and-algorithms`（桌機）出現 55 個像素的差異；單獨重拍 4 次是 18 個像素（最多差 2 階）一次、0 三次，`main` 對 `main` 4 次都是 0。這一頁本輪沒有動到，差異不重現，判斷是第一次截圖的時序雜訊 |
| 預設 build 與 `main` 的 HTML | 每頁多 6 個字元：RSC 資料裡多一個 `false`（root layout 裡沒有被渲染的追蹤器位置）。沒有其他差異 |
| 私有題庫洩漏掃描（追蹤檔案、`origin/main..HEAD`） | clean |
| **`trials-ci`** | **沒有跑**：這個分支沒有 PR（workflow 只在 pull request 與推到 `main`／`trials/**` 時執行） |

說明：

- 預設 build 的 `--probe` 會失敗，因為 probe 期望考試路由回 200，而預設 build 沒有 `LOGIC_ISLAND_TRIALS`。這不是本輪造成的，前兩輪相同。
- E2E 與 preflight 跑完之後，還有一個只影響 Vercel Preview 的改動（沒有金鑰時回 503，`session.ts` 一行加一個測試）。之後只重跑了 typecheck、ESLint 與單元測試全套；本機沒有 `VERCEL_ENV`，這個改動不影響本機的瀏覽器測試。
- `e2e/presence.spec.ts` 原本大多在規劃中的島上計數。P6-B 之後那些島不再有自己的人數，測試改到已開放的島上，並在第一個測試與每張區域地圖的測試加上規劃中島嶼的檢查。
- 沒有做：Vercel Preview、Production、真機、iOS Safari、真正的 Upstash 服務。

## 9. 尚未解決的風險與待你決定的事

### 9.1 風險

| # | 風險 | 現況 |
|---|---|---|
| R1 | **沒有對真正的 Upstash 執行過**。指令稿、REST 格式、帳單上的指令數、延遲、Free 用完時的行為，都只對本機 Redis 與官方文件驗證 | Preview 驗收的第一項 |
| R2 | **Vercel 專案的方案、函式區域、環境變數、整合都未知** | 需要你授權或提供（§5） |
| R3 | **Free 方案只夠平均同時在線約 1.5 人**。超過後 API 回 503、地圖沒有即時人影 | 可接受與否取決於實際流量；隨用隨付 10 人時每月約 US$6–9 |
| R4 | **可以被灌水與燒額度**，本系統不讀 IP 所以自己擋不了 | 人影有上限、不顯示數字、儲存有上限；Production 前建議加 Firewall 規則（§6.4） |
| R5 | 多分頁＋亂序時仍可能短暫少算或位置暫時錯（最多 30 秒） | §2.5；要根治需重寫引擎的資料模型 |
| R6 | **真機沒有測過**。所有效能數字都是這台 Mac 的 headless Chrome | Preview 驗收清單 §5.3 |
| R7 | `trials-ci` 沒有跑過本分支（沒有 PR） | 開 PR 就會跑；本機已用 CI 的旗標重現 preflight |
| R8 | 人口數字最多落後約 30 秒 | 設計如此（§6.3） |
| R9 | Preview 部署之間共用 `preview` 這一組 Session | 同時驗兩個分支時會互相計入 |
| R10 | 隱私說明仍是草案，是否需要 Cookie 同意機制未決 | [PRESENCE_PRIVACY.md](PRESENCE_PRIVACY.md) §5 |

### 9.2 待你決定

| # | 決定 | 我的建議 |
|---|---|---|
| Q1 | 正在看規劃中島嶼的訪客：畫在該群島的橋上（現在的做法），還是完全不畫 | 維持現在的做法（§3.3） |
| Q2 | 是否授權我唯讀存取 Vercel 專案 | 是；只讀名稱與設定，不讀任何值 |
| Q3 | 是否建立 Upstash Redis（Free，只接 Preview）並設定 Preview 的三個環境變數 | 是，這是 Preview 驗收的前提。會建立第三方資源，所以由你動手 |
| Q4 | Production 的儲存方案 | 等 Preview 與實際流量的數字再定 |
| Q5 | Production 前是否在 Vercel Firewall 加限流規則，上限多少 | 加；每個 IP 每分鐘 120 次起步，有教室使用時再調高 |
| Q6 | 審閱 preflight 的例外（第二輪的 `144fe69`，本輪未更動） | 仍待審閱 |
| Q7 | 隱私說明文字、GPC／DNT 的預設、是否需要同意機制 | 文字草案已更新；其餘同第二輪 |
| Q8 | 是否開 PR | 開了 `trials-ci` 才會跑。合併 `main` 等於部署 Production，是另一個決定 |

## 10. 重現

隔離副本的做法與第二輪相同（[PRESENCE_ROUND2.md](PRESENCE_ROUND2.md) §8）。本輪新增的：

```bash
redis-server --port 6391 --bind 127.0.0.1 --save '' --appendonly no
```

```bash
PRESENCE_TEST_REDIS_URL=redis://127.0.0.1:6391 pnpm exec vitest run tests/presence-engine.test.ts tests/presence-redis-store.test.ts tests/presence-api.test.ts
```

24 小時的成本量測（要另一台沒有別人在用的 `redis-server`，例如 6392 埠）與 Preview 驗收腳本的指令，分別在 [PRESENCE_SHARED_STORE.md](PRESENCE_SHARED_STORE.md) §6 與 [PRESENCE_PREVIEW_VALIDATION.md](PRESENCE_PREVIEW_VALIDATION.md) §4。
